/**
 * POST /api/lawyer-referrals
 *
 * Crea un referral avvocato per l'utente autenticato.
 * Salva su lawyer_referrals con i dati di contatto e la specializzazione richiesta.
 *
 * Note GDPR (ADR richiesta prima di lancio commerciale):
 *   - Base giuridica: consenso esplicito (form con checkbox) — da aggiungere prima del go-live
 *   - Dati conservati: analysis_id, specialization, region, contact_info (JSONB)
 *   - Titolare: controlla.me — condivisione con avvocati da regolamentare in DPA
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          },
        },
      }
    );

    // Verifica sessione utente
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Accesso non autorizzato. Effettua il login per continuare." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { analysisId, specialization, region, name, email, phone, description } = body;

    // Validazione input
    if (!specialization || !region) {
      return NextResponse.json(
        { error: "Specializzazione e regione sono obbligatori." },
        { status: 400 }
      );
    }

    // Salva referral su Supabase (RLS garantisce user_id == auth.uid())
    // Migration 017_lawyer_referrals_contact.sql aggiunge i campi contact_*
    const { data, error } = await supabase
      .from("lawyer_referrals")
      .insert({
        analysis_id: analysisId ?? null,
        user_id: user.id,
        specialization,
        region,
        status: "pending",
        contact_name: name ?? null,
        contact_email: email ?? null,
        contact_phone: phone ?? null,
        notes: description ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[REFERRAL] Errore salvataggio:", error.message);
      return NextResponse.json(
        { error: "Errore nel salvataggio della richiesta. Riprova." },
        { status: 500 }
      );
    }

    console.log(
      `[REFERRAL] Nuovo referral ${data.id} | user: ${user.id} | spec: ${specialization} | region: ${region}`
    );

    // TODO: inviare email di conferma all'utente (contact_email)
    // TODO: notifica interna team per matching avvocato
    void { name, email, phone, description }; // usati sopra nell'insert

    return NextResponse.json({ success: true, referralId: data.id });
  } catch (err) {
    console.error("[REFERRAL] Errore inatteso:", err);
    return NextResponse.json(
      { error: "Errore interno del server." },
      { status: 500 }
    );
  }
}
