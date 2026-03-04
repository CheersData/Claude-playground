import { NextRequest, NextResponse } from "next/server";

interface SubscribeBody {
  name: string;
  email: string;
  source: string;
}

export async function POST(req: NextRequest) {
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

    // TODO: integrate with email marketing service (e.g. Brevo, Mailchimp, Resend)
    // await addContactToList({ name: sanitizedName, email: sanitizedEmail, tag: sanitizedSource });

    // TODO: store lead in Supabase (table: marketing_leads)
    // await supabaseAdmin.from("marketing_leads").insert({ name: sanitizedName, email: sanitizedEmail, source: sanitizedSource });

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
