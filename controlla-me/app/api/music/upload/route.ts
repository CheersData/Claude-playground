import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

/** Accepted audio MIME types */
const ACCEPTED_MIME_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "audio/ogg": "ogg",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mp4": "m4a",
  "audio/aiff": "aiff",
  "audio/x-aiff": "aiff",
};

/** Extension fallback for files with missing/generic MIME type */
const ACCEPTED_EXTENSIONS = new Set(["mp3", "wav", "flac", "ogg", "m4a", "aiff"]);

/** 50 MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const UPLOAD_BASE_DIR = path.join(process.cwd(), ".music-uploads");

export async function POST(req: NextRequest) {
  // CSRF check (FormData endpoint)
  const csrf = checkCsrf(req);
  if (csrf) return csrf;

  // Auth
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Rate limit (10 uploads/hour — configured in RATE_LIMITS or uses endpoint match)
  const limited = await checkRateLimit(req, auth.user.id);
  if (limited) return limited;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Nessun file audio caricato" },
        { status: 400 }
      );
    }

    // --- File size validation ---
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Il file è troppo grande. Dimensione massima: 50MB" },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "Il file è vuoto" },
        { status: 400 }
      );
    }

    // --- MIME type / extension validation ---
    const mimeType = file.type?.toLowerCase() || "";
    const fileExt = file.name.split(".").pop()?.toLowerCase() || "";

    let resolvedExt = ACCEPTED_MIME_TYPES[mimeType];

    // Fallback: if MIME type is generic (application/octet-stream) or missing,
    // check by file extension
    if (!resolvedExt && ACCEPTED_EXTENSIONS.has(fileExt)) {
      resolvedExt = fileExt;
    }

    if (!resolvedExt) {
      return NextResponse.json(
        {
          error: "Formato audio non supportato. Formati accettati: MP3, WAV, FLAC, OGG, M4A, AIFF",
        },
        { status: 400 }
      );
    }

    // --- Create DB record ---
    const supabase = createAdminClient();

    const { data: analysis, error: dbError } = await supabase
      .from("music_analyses")
      .insert({
        user_id: auth.user.id,
        file_name: file.name,
        file_size_bytes: file.size,
        status: "pending",
        genre: null,
        bpm: null,
        musical_key: null,
      })
      .select("id")
      .single();

    if (dbError || !analysis) {
      console.error("[MUSIC-UPLOAD] DB insert error:", dbError);
      return NextResponse.json(
        { error: "Errore durante il salvataggio. Riprova." },
        { status: 500 }
      );
    }

    const analysisId = analysis.id as string;

    // --- Save file to filesystem ---
    const userDir = path.join(UPLOAD_BASE_DIR, auth.user.id);
    await mkdir(userDir, { recursive: true });

    const filePath = path.join(userDir, `${analysisId}.${resolvedExt}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    return NextResponse.json({
      analysisId,
      fileName: file.name,
      status: "pending",
    });
  } catch (error) {
    console.error("[MUSIC-UPLOAD] Unexpected error:", error);
    const message =
      error instanceof Error ? error.message : "Errore durante l'upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
