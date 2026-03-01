import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/extract-text";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";

export async function POST(req: NextRequest) {
  // CSRF check (FormData endpoint — SEC-004)
  const csrf = checkCsrf(req);
  if (csrf) return csrf;

  // Auth
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Rate limit
  const limited = checkRateLimit(req, auth.user.id);
  if (limited) return limited;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Nessun file caricato" },
        { status: 400 }
      );
    }

    // Validate file size (20MB max)
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Il file è troppo grande. Dimensione massima: 20MB" },
        { status: 400 }
      );
    }

    // Extract text
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractText(buffer, file.type, file.name);

    return NextResponse.json({
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      textLength: text.length,
      text,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Errore durante l'upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
