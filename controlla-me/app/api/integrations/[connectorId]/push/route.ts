/**
 * API Route: POST /api/integrations/[connectorId]/push
 *
 * Push records from crm_records (hub) to a target connector.
 *
 * Body: {
 *   sourceConnectorId: string,    // Where records came from (e.g. "hubspot")
 *   entityType: string,           // Source entity type (e.g. "contact")
 *   targetEntityType?: string,    // Target entity type (defaults to entityType)
 *   recordIds?: string[],         // Specific record IDs (from crm_records.id)
 *   dryRun?: boolean              // Validate mapping without pushing
 * }
 *
 * Response: PushPipelineResult
 *
 * Security: CSRF + requireAuth + rate-limit
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { getVaultOrNull } from "@/lib/credential-vault";
import { createAdminClient } from "@/lib/supabase/admin";
import { executePushPipeline } from "@/lib/staff/data-connector/push-pipeline";
import {
  hasSyncHandler,
  listSyncHandlers,
} from "@/lib/staff/data-connector/sync-dispatcher";
import type { PushResult } from "@/lib/staff/data-connector/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  // CSRF
  const csrfBlocked = checkCsrf(req);
  if (csrfBlocked) return csrfBlocked;

  // Rate limit
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const userId = authResult.user.id;
  const { connectorId } = await params;

  // Parse body
  let body: {
    sourceConnectorId: string;
    entityType: string;
    targetEntityType?: string;
    recordIds?: string[];
    dryRun?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido" },
      { status: 400 }
    );
  }

  if (!body.sourceConnectorId || !body.entityType) {
    return NextResponse.json(
      { error: "sourceConnectorId e entityType sono obbligatori" },
      { status: 400 }
    );
  }

  // Validate target connector has a sync handler (we need it for push)
  if (!hasSyncHandler(connectorId)) {
    return NextResponse.json(
      {
        error: `Push non supportato per connettore target '${connectorId}'. ` +
          `Connettori disponibili: ${listSyncHandlers().join(", ") || "(nessuno)"}`,
      },
      { status: 400 }
    );
  }

  // Get vault for target connector credentials
  const vault = getVaultOrNull();
  if (!vault) {
    return NextResponse.json(
      { error: "Credential vault non configurato (VAULT_ENCRYPTION_KEY mancante)" },
      { status: 500 }
    );
  }

  // Retrieve target credentials
  const credentials = await vault.getCredential(userId, connectorId);
  const accessToken = credentials?.access_token || credentials?.api_key;
  if (!credentials || !accessToken) {
    return NextResponse.json(
      { error: "Credenziali target non trovate. Autorizza prima il connettore di destinazione." },
      { status: 401 }
    );
  }

  const admin = createAdminClient();

  // Create a push function that instantiates the target connector and calls push()
  const pushFn = async (
    items: Record<string, unknown>[],
    entityType: string,
    dryRun: boolean
  ): Promise<PushResult> => {
    // Dynamic import of the target connector
    // For now, we support HubSpot push; other connectors can be added
    if (connectorId === "hubspot") {
      const { HubSpotConnector } = await import(
        "@/lib/staff/data-connector/connectors/hubspot"
      );
      const { getIntegrationSourcesByConnector } = await import(
        "@/scripts/integration-sources"
      );

      const sources = getIntegrationSourcesByConnector("hubspot");
      if (sources.length === 0) {
        throw new Error("Configurazione HubSpot non trovata in integration-sources");
      }

      const connector = new HubSpotConnector(sources[0], console.log, {
        accessToken,
      });

      if (!connector.push) {
        throw new Error("HubSpot connector non supporta push()");
      }

      // Convert generic records to HubSpotRecord-like shape
      return connector.push(items as never[], {
        entityType,
        dryRun,
        upsert: true,
      });
    }

    // Generic fallback: connector doesn't support push yet
    throw new Error(
      `Push non ancora implementato per il connettore '${connectorId}'. ` +
      `Attualmente supportato: hubspot`
    );
  };

  // Execute push pipeline
  const result = await executePushPipeline(
    admin,
    userId,
    {
      sourceConnectorId: body.sourceConnectorId,
      targetConnectorId: connectorId,
      entityType: body.entityType,
      targetEntityType: body.targetEntityType,
      recordIds: body.recordIds,
      dryRun: body.dryRun,
    },
    pushFn,
    (msg) => console.log(msg)
  );

  const status = result.errors.length > 0 && !result.pushResult ? 502 : 200;

  return NextResponse.json(
    {
      success: result.errors.length === 0 || (result.pushResult?.created ?? 0) > 0,
      ...result,
    },
    { status }
  );
}
