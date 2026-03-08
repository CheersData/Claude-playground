import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { notifyNewLead } from "@/lib/telegram";

interface SubscribeBody {
  name: string;
  email: string;
  source: string;
}

export async function POST(req: NextRequest) {
  // CSRF protection (SEC-NEW-FINDING)
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  // Rate limiting anti-spam (SEC-NEW-FINDING)
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  try {
    const body: SubscribeBody = await req.json();

    const { name, email, source } = body;

    // Basic validation
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Nome obbligatorio." }, { status: 400 });
    }

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email non valida." }, { status: 400 });
    }

    const sanitizedName = name.trim().slice(0, 100);
    const sanitizedEmail = email.trim().toLowerCase().slice(0, 200);
    const sanitizedSource = (source || "unknown").trim().slice(0, 50);

    // Log the lead (placeholder — replace with DB/email service integration)
    console.log("[resources/subscribe] New lead:", {
      name: sanitizedName,
      email: sanitizedEmail,
      source: sanitizedSource,
      timestamp: new Date().toISOString(),
      ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown",
    });

    // Notify boss via Telegram (fire-and-forget — never blocks response)
    notifyNewLead({
      name: sanitizedName,
      email: sanitizedEmail,
      source: sanitizedSource,
    }).catch(() => {
      // Silently ignore — Telegram notification is best-effort
    });

    // Internal subscription log (structured, for future aggregation/export)
    console.log("[resources/subscribe] Lead registered:", JSON.stringify({
      name: sanitizedName,
      email: sanitizedEmail,
      source: sanitizedSource,
      timestamp: new Date().toISOString(),
    }));

    return NextResponse.json({
      success: true,
      downloadUrl: "/downloads/checklist-clausole-affitto.pdf",
    });
  } catch (err) {
    console.error("[resources/subscribe] Error:", err);
    return NextResponse.json(
      { error: "Errore interno. Riprova tra qualche momento." },
      { status: 500 }
    );
  }
}
