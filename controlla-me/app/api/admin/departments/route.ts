/**
 * Admin API — Department Management (CRUD)
 *
 * GET    /api/admin/departments            — Lista tutti i dipartimenti
 * POST   /api/admin/departments            — Crea nuovo dipartimento
 * PATCH  /api/admin/departments            — Aggiorna dipartimento esistente
 * DELETE /api/admin/departments?name=slug  — Elimina dipartimento
 *
 * Authorization: requireCreatorAuth (role >= creator, active account)
 * RLS: usa client autenticato dove possibile, service_role per advisory lock
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireCreatorAuth,
  isAuthError,
  canModifyResource,
} from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import * as fs from "fs/promises";
import * as path from "path";

// ─── Validation ──────────────────────────────────────────────────────────────

const SLUG_REGEX = /^[a-z][a-z0-9-]*[a-z0-9]$/;
const MIN_SLUG_LENGTH = 2;
const MAX_SLUG_LENGTH = 64;
const MAX_DISPLAY_NAME_LENGTH = 128;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_MISSION_LENGTH = 2048;

function isValidSlug(name: string): boolean {
  if (name.length < MIN_SLUG_LENGTH || name.length > MAX_SLUG_LENGTH)
    return false;
  if (name.includes("--")) return false;
  return SLUG_REGEX.test(name);
}

// ─── Filesystem template generation ──────────────────────────────────────────

const COMPANY_DIR = path.join(process.cwd(), "company");

function generateDepartmentMd(opts: {
  name: string;
  display_name: string;
  description?: string;
  mission?: string;
}): string {
  const now = new Date().toISOString().split("T")[0];
  return `# ${opts.display_name}

> Dipartimento creato il ${now}

## Missione

${opts.mission || opts.description || "Da definire."}

## Identita

- **Slug**: ${opts.name}
- **Tipo**: custom
- **Creato da**: creator

## Priorita

1. Definire obiettivi e KPI
2. Configurare agenti e runbook
3. Integrarsi con il workflow aziendale

## Note

Dipartimento custom creato via API admin.
`;
}

function generateStatusJson(name: string): string {
  return JSON.stringify(
    {
      _meta: {
        dept: name,
        schema_version: "1.0",
        last_updated: new Date().toISOString(),
        updated_by: "admin-api",
      },
      health: "ok",
      summary: "Dipartimento appena creato. Nessun task attivo.",
      open_tasks: [],
      blockers: [],
      notes: "Inizializzato via API /api/admin/departments",
    },
    null,
    2
  );
}

async function createDepartmentFiles(
  name: string,
  displayName: string,
  description?: string,
  mission?: string
): Promise<void> {
  const deptDir = path.join(COMPANY_DIR, name);

  try {
    await fs.mkdir(deptDir, { recursive: true });

    const mdPath = path.join(deptDir, "department.md");
    const statusPath = path.join(deptDir, "status.json");

    // Only create files if they don't already exist
    try {
      await fs.access(mdPath);
    } catch {
      await fs.writeFile(
        mdPath,
        generateDepartmentMd({ name, display_name: displayName, description, mission }),
        "utf-8"
      );
    }

    try {
      await fs.access(statusPath);
    } catch {
      await fs.writeFile(statusPath, generateStatusJson(name), "utf-8");
    }
  } catch (err) {
    // Non-fatal: DB record is the source of truth, files are convenience
    console.warn(
      `[ADMIN/DEPARTMENTS] Errore creazione file per ${name}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ─── GET — Lista dipartimenti ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const rateLimitResult = await checkRateLimit(req);
  if (rateLimitResult) return rateLimitResult;

  const auth = await requireCreatorAuth();
  if (isAuthError(auth)) return auth;

  const supabase = await createClient();

  let query = supabase
    .from("company_departments")
    .select("*")
    .order("name", { ascending: true });

  // Optional filters via query params
  const url = new URL(req.url);
  const protectedFilter = url.searchParams.get("protected");
  const createdByFilter = url.searchParams.get("created_by");

  if (protectedFilter === "true") {
    query = query.eq("protected", true);
  } else if (protectedFilter === "false") {
    query = query.eq("protected", false);
  }

  if (createdByFilter) {
    query = query.eq("created_by", createdByFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[ADMIN/DEPARTMENTS] GET error:", error.message);
    return NextResponse.json(
      { error: "Errore nel recupero dei dipartimenti" },
      { status: 500 }
    );
  }

  return NextResponse.json({ departments: data });
}

// ─── POST — Crea dipartimento ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const rateLimitResult = await checkRateLimit(req);
  if (rateLimitResult) return rateLimitResult;

  const auth = await requireCreatorAuth();
  if (isAuthError(auth)) return auth;

  let body: {
    name?: string;
    display_name?: string;
    description?: string;
    mission?: string;
    config?: Record<string, unknown>;
    agents?: unknown[];
    runbooks?: unknown[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido" },
      { status: 400 }
    );
  }

  const { name, display_name, description, mission, config, agents, runbooks } =
    body;

  // Validation
  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { error: "Il campo 'name' (slug) e obbligatorio" },
      { status: 400 }
    );
  }

  if (!isValidSlug(name)) {
    return NextResponse.json(
      {
        error:
          "Il campo 'name' deve essere uno slug valido: solo lettere minuscole, numeri e trattini (es. 'mio-dipartimento')",
      },
      { status: 400 }
    );
  }

  if (!display_name || typeof display_name !== "string") {
    return NextResponse.json(
      { error: "Il campo 'display_name' e obbligatorio" },
      { status: 400 }
    );
  }

  if (display_name.length > MAX_DISPLAY_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Il campo 'display_name' non puo superare ${MAX_DISPLAY_NAME_LENGTH} caratteri` },
      { status: 400 }
    );
  }

  if (description && typeof description === "string" && description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json(
      { error: `Il campo 'description' non puo superare ${MAX_DESCRIPTION_LENGTH} caratteri` },
      { status: 400 }
    );
  }

  if (mission && typeof mission === "string" && mission.length > MAX_MISSION_LENGTH) {
    return NextResponse.json(
      { error: `Il campo 'mission' non puo superare ${MAX_MISSION_LENGTH} caratteri` },
      { status: 400 }
    );
  }

  // Advisory lock to prevent concurrent creation of same department
  const admin = createAdminClient();
  const lockKey = hashStringToInt(name);

  try {
    // Acquire advisory lock (non-blocking attempt)
    const { data: lockData } = await admin.rpc("pg_try_advisory_lock", {
      key: lockKey,
    });

    if (!lockData) {
      return NextResponse.json(
        { error: "Operazione in corso su questo dipartimento. Riprova tra poco." },
        { status: 409 }
      );
    }

    try {
      // Use authenticated client so RLS enforces created_by = auth.uid()
      const supabase = await createClient();

      const insertPayload: Record<string, unknown> = {
        name,
        display_name,
        description: description || null,
        mission: mission || null,
        created_by: auth.user.id,
        owner_id: auth.user.id,
        protected: false,
      };

      if (config && typeof config === "object") {
        insertPayload.config = config;
      }
      if (Array.isArray(agents)) {
        insertPayload.agents = agents;
      }
      if (Array.isArray(runbooks)) {
        insertPayload.runbooks = runbooks;
      }

      const { data, error } = await supabase
        .from("company_departments")
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          // unique_violation on name
          return NextResponse.json(
            { error: `Un dipartimento con slug '${name}' esiste gia` },
            { status: 409 }
          );
        }
        console.error("[ADMIN/DEPARTMENTS] POST insert error:", error.message);
        return NextResponse.json(
          { error: "Errore nella creazione del dipartimento" },
          { status: 500 }
        );
      }

      // Generate filesystem files (non-blocking, non-fatal)
      await createDepartmentFiles(
        name,
        display_name,
        description || undefined,
        mission || undefined
      );

      return NextResponse.json({ department: data }, { status: 201 });
    } finally {
      // Release advisory lock
      try {
        await admin.rpc("pg_advisory_unlock", { key: lockKey });
      } catch {
        // Best-effort unlock — lock auto-releases at session end
      }
    }
  } catch (err) {
    // If pg_try_advisory_lock RPC doesn't exist, fall through without lock
    console.warn(
      `[ADMIN/DEPARTMENTS] Advisory lock non disponibile: ${err instanceof Error ? err.message : String(err)}`
    );

    // Fallback: create without lock (unique constraint still protects)
    const supabase = await createClient();

    const insertPayload: Record<string, unknown> = {
      name,
      display_name,
      description: description || null,
      mission: mission || null,
      created_by: auth.user.id,
      owner_id: auth.user.id,
      protected: false,
    };

    if (config && typeof config === "object") {
      insertPayload.config = config;
    }
    if (Array.isArray(agents)) {
      insertPayload.agents = agents;
    }
    if (Array.isArray(runbooks)) {
      insertPayload.runbooks = runbooks;
    }

    const { data, error } = await supabase
      .from("company_departments")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `Un dipartimento con slug '${name}' esiste gia` },
          { status: 409 }
        );
      }
      console.error("[ADMIN/DEPARTMENTS] POST insert error (no-lock):", error.message);
      return NextResponse.json(
        { error: "Errore nella creazione del dipartimento" },
        { status: 500 }
      );
    }

    await createDepartmentFiles(
      name,
      display_name,
      description || undefined,
      mission || undefined
    );

    return NextResponse.json({ department: data }, { status: 201 });
  }
}

// ─── PATCH — Aggiorna dipartimento ───────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const rateLimitResult = await checkRateLimit(req);
  if (rateLimitResult) return rateLimitResult;

  const auth = await requireCreatorAuth();
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido" },
      { status: 400 }
    );
  }

  const name = body.name as string | undefined;
  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { error: "Il campo 'name' (slug del dipartimento) e obbligatorio per identificare il target" },
      { status: 400 }
    );
  }

  // Fetch existing department to check ownership and protection
  const admin = createAdminClient();
  const { data: existing, error: fetchErr } = await admin
    .from("company_departments")
    .select("id, created_by, protected")
    .eq("name", name)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json(
      { error: `Dipartimento '${name}' non trovato` },
      { status: 404 }
    );
  }

  // Authorization check
  if (
    !canModifyResource(
      auth.user.id,
      auth.role,
      existing.created_by,
      existing.protected
    )
  ) {
    if (existing.protected) {
      return NextResponse.json(
        { error: "Impossibile modificare un dipartimento protetto" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "Puoi modificare solo i dipartimenti che hai creato" },
      { status: 403 }
    );
  }

  // Build update payload — only allow safe fields
  const allowedFields = [
    "display_name",
    "description",
    "mission",
    "config",
    "agents",
    "runbooks",
    "status",
  ];
  const updatePayload: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body && body[field] !== undefined) {
      updatePayload[field] = body[field];
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json(
      { error: "Nessun campo valido da aggiornare" },
      { status: 400 }
    );
  }

  // Validate display_name length if provided
  if (
    updatePayload.display_name &&
    typeof updatePayload.display_name === "string" &&
    updatePayload.display_name.length > MAX_DISPLAY_NAME_LENGTH
  ) {
    return NextResponse.json(
      { error: `Il campo 'display_name' non puo superare ${MAX_DISPLAY_NAME_LENGTH} caratteri` },
      { status: 400 }
    );
  }

  // Use authenticated client so RLS validates the update
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_departments")
    .update(updatePayload)
    .eq("name", name)
    .select()
    .single();

  if (error) {
    console.error("[ADMIN/DEPARTMENTS] PATCH error:", error.message);
    return NextResponse.json(
      { error: "Errore nell'aggiornamento del dipartimento" },
      { status: 500 }
    );
  }

  return NextResponse.json({ department: data });
}

// ─── DELETE — Elimina dipartimento ───────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const rateLimitResult = await checkRateLimit(req);
  if (rateLimitResult) return rateLimitResult;

  const auth = await requireCreatorAuth();
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const name = url.searchParams.get("name");

  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { error: "Il parametro 'name' (slug) e obbligatorio" },
      { status: 400 }
    );
  }

  // Fetch existing department to check ownership and protection
  const admin = createAdminClient();
  const { data: existing, error: fetchErr } = await admin
    .from("company_departments")
    .select("id, created_by, protected")
    .eq("name", name)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json(
      { error: `Dipartimento '${name}' non trovato` },
      { status: 404 }
    );
  }

  // Authorization check
  if (
    !canModifyResource(
      auth.user.id,
      auth.role,
      existing.created_by,
      existing.protected
    )
  ) {
    if (existing.protected) {
      return NextResponse.json(
        { error: "Impossibile eliminare un dipartimento protetto" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "Puoi eliminare solo i dipartimenti che hai creato" },
      { status: 403 }
    );
  }

  // Physical delete — RLS ensures only owner can delete unprotected
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_departments")
    .delete()
    .eq("name", name);

  if (error) {
    console.error("[ADMIN/DEPARTMENTS] DELETE error:", error.message);
    return NextResponse.json(
      { error: "Errore nell'eliminazione del dipartimento" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, deleted: name });
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Converts a string to a stable 32-bit integer for use as PostgreSQL advisory lock key.
 * Uses simple djb2 hash.
 */
function hashStringToInt(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // Keep it positive and within 32-bit int range
  return Math.abs(hash | 0);
}
