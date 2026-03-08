// ─── CDP Profile Builder ───
// Logica per costruire e aggiornare i profili CDP da eventi.
// Pattern: event → cleanse → update profile → persist.
// Tutte le operazioni sono fire-and-forget: MAI bloccare il flusso principale.

import { createClient } from "@supabase/supabase-js";
import type {
  CustomerProfile,
  CDPIdentity,
  CDPBehavior,
  CDPRiskProfile,
  CDPPreferences,
  CDPLifecycle,
  LifecycleStage,
  ProfileEventType,
  AnalysisCompletedEventData,
  DeepSearchEventData,
  CorpusQueryEventData,
  PlanChangedEventData,
  LawyerReferralEventData,
} from "./types";
import {
  createDefaultIdentity,
  createDefaultBehavior,
  createDefaultRiskProfile,
  createDefaultPreferences,
  createDefaultLifecycle,
} from "./types";
import {
  normalizeDocumentType,
  normalizeRegion,
  extractEmailDomain,
  clampFairnessScore,
  clampRate,
  clampPercentage,
  deduplicateAndLimit,
  topByFrequency,
  cleanseAnalysisEvent,
} from "./data-cleanser";

// ─── Supabase Admin Client (service_role) ───

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("[CDP] Missing Supabase credentials for admin client");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── Event Recording ───

/**
 * Registra un evento nel log profile_events e aggiorna il profilo.
 * Questa e la funzione principale da chiamare dagli API routes.
 *
 * @example
 * // In POST /api/analyze dopo completamento:
 * await recordProfileEvent(userId, 'analysis_completed', {
 *   analysis_id: analysis.id,
 *   document_type: classification.documentType,
 *   fairness_score: advice.fairnessScore,
 *   overall_risk: analysis.overallRisk,
 *   needs_lawyer: advice.needsLawyer,
 *   jurisdiction: classification.jurisdiction,
 *   clause_count: analysis.clauses.length,
 *   critical_count: analysis.clauses.filter(c => c.riskLevel === 'critical').length,
 *   high_count: analysis.clauses.filter(c => c.riskLevel === 'high').length,
 * });
 */
export async function recordProfileEvent(
  userId: string,
  eventType: ProfileEventType,
  eventData: Record<string, unknown> = {}
): Promise<void> {
  const supabase = getAdminClient();

  // 1. Inserisci evento
  const { error: eventError } = await supabase.from("profile_events").insert({
    user_id: userId,
    event_type: eventType,
    event_data: eventData,
  });

  if (eventError) {
    console.error("[CDP] Failed to insert event:", eventError.message);
    return;
  }

  // 2. Assicurati che il profilo CDP esista
  await ensureProfile(userId);

  // 3. Aggiorna il profilo in base al tipo di evento
  try {
    switch (eventType) {
      case "analysis_completed":
        await updateFromAnalysis(userId, eventData as unknown as AnalysisCompletedEventData);
        break;
      case "deep_search_performed":
        await updateFromDeepSearch(userId, eventData as unknown as DeepSearchEventData);
        break;
      case "corpus_query":
        await updateFromCorpusQuery(userId, eventData as unknown as CorpusQueryEventData);
        break;
      case "plan_changed":
        await updateFromPlanChange(userId, eventData as unknown as PlanChangedEventData);
        break;
      case "lawyer_referral_requested":
        await updateFromLawyerReferral(userId, eventData as unknown as LawyerReferralEventData);
        break;
      case "login":
        await touchLastActive(userId);
        break;
      case "profile_updated":
        // No-op — profilo gia aggiornato direttamente
        break;
    }

    // 4. Segna evento come processato
    // (Non critico — un evento non processato verra rielaborato al prossimo backfill)
  } catch (err) {
    console.error(`[CDP] Failed to process event ${eventType}:`, err);
  }
}

// ─── Profile CRUD ───

/**
 * Crea un profilo CDP se non esiste ancora.
 */
async function ensureProfile(userId: string): Promise<void> {
  const supabase = getAdminClient();

  // Controlla se il profilo CDP esiste gia
  const { data: existing } = await supabase
    .from("customer_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return;

  // Leggi dati dal profilo Supabase Auth per inizializzazione
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, plan, analyses_count, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    console.warn("[CDP] No profile found for user:", userId);
    return;
  }

  const identity: CDPIdentity = {
    ...createDefaultIdentity(),
    email_domain: extractEmailDomain(profile.email),
  };

  const behavior: CDPBehavior = {
    ...createDefaultBehavior(),
    total_analyses: profile.analyses_count ?? 0,
    last_active_at: new Date().toISOString(),
  };

  const lifecycle: CDPLifecycle = {
    ...createDefaultLifecycle(),
    stage: computeLifecycleStage(profile.analyses_count ?? 0, profile.plan, new Date()),
    plan_history: [
      {
        plan: profile.plan ?? "free",
        from: profile.created_at,
        to: null,
      },
    ],
  };

  const { error } = await supabase.from("customer_profiles").insert({
    user_id: userId,
    identity,
    behavior,
    risk_profile: createDefaultRiskProfile(),
    preferences: createDefaultPreferences(),
    lifecycle,
  });

  if (error && error.code !== "23505") {
    // 23505 = unique_violation (race condition, OK)
    console.error("[CDP] Failed to create profile:", error.message);
  }
}

/**
 * Legge il profilo CDP completo per un utente.
 */
export async function getProfile(userId: string): Promise<CustomerProfile | null> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("customer_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[CDP] Failed to read profile:", error.message);
    return null;
  }

  return data as CustomerProfile | null;
}

// ─── Event Handlers ───

/**
 * Aggiorna il profilo dopo un'analisi completata.
 * Questo e l'aggiornamento piu ricco: tocca behavior, risk_profile, identity, lifecycle.
 */
async function updateFromAnalysis(
  userId: string,
  rawEvent: AnalysisCompletedEventData
): Promise<void> {
  const supabase = getAdminClient();
  const profile = await getProfile(userId);
  if (!profile) return;

  // Bonifica dati in ingresso
  const event = cleanseAnalysisEvent(rawEvent);

  // ─── Behavior ───
  const behavior = { ...profile.behavior } as CDPBehavior;
  behavior.total_analyses = (behavior.total_analyses ?? 0) + 1;
  behavior.analyses_last_30d = (behavior.analyses_last_30d ?? 0) + 1;
  behavior.last_active_at = new Date().toISOString();

  // Aggiorna preferred_doc_types
  if (event.document_type) {
    const currentTypes = behavior.preferred_doc_types ?? [];
    currentTypes.push(event.document_type);
    behavior.preferred_doc_types = topByFrequency(currentTypes, 5);
  }

  // Ricalcola engagement score
  behavior.engagement_score = computeEngagementScore(behavior);

  // ─── Risk Profile ───
  const risk = { ...profile.risk_profile } as CDPRiskProfile;

  // Aggiorna avg_fairness_score (media mobile)
  if (event.fairness_score !== null) {
    const prevAvg = risk.avg_fairness_score ?? event.fairness_score;
    const prevCount = behavior.total_analyses - 1; // Conta prima di questo
    if (prevCount > 0) {
      risk.avg_fairness_score = clampFairnessScore(
        (prevAvg * prevCount + event.fairness_score) / behavior.total_analyses
      );
    } else {
      risk.avg_fairness_score = event.fairness_score;
    }
  }

  // Aggiorna risk_distribution
  if (event.overall_risk) {
    const dist = risk.risk_distribution ?? { critical: 0, high: 0, medium: 0, low: 0 };
    const riskKey = event.overall_risk as keyof typeof dist;
    if (riskKey in dist) {
      dist[riskKey] = (dist[riskKey] ?? 0) + 1;
    }
    risk.risk_distribution = dist;
  }

  // Aggiorna needs_lawyer_rate
  if (event.needs_lawyer) {
    const totalWithLawyer = Math.round(
      (risk.needs_lawyer_rate ?? 0) * (behavior.total_analyses - 1)
    ) + 1;
    risk.needs_lawyer_rate = clampRate(totalWithLawyer / behavior.total_analyses);
  }

  // ─── Identity ───
  const identity = { ...profile.identity } as CDPIdentity;
  // Inferisci regione da giurisdizione se non ancora settata
  if (!identity.inferred_region && event.jurisdiction) {
    identity.inferred_region = normalizeRegion(event.jurisdiction);
  }

  // Inferisci settore dai tipi di documento
  if (behavior.preferred_doc_types.length >= 3) {
    identity.inferred_sector = inferSector(behavior.preferred_doc_types);
  }

  // ─── Lifecycle ───
  const lifecycle = { ...profile.lifecycle } as CDPLifecycle;
  if (!lifecycle.first_analysis_at) {
    lifecycle.first_analysis_at = new Date().toISOString();
  }
  lifecycle.stage = computeLifecycleStageFromProfile(behavior, lifecycle, profile.preferences);
  lifecycle.churn_risk = computeChurnRisk(behavior, lifecycle);

  // ─── Persist ───
  await updateProfileSections(userId, { behavior, risk_profile: risk, identity, lifecycle });
}

/**
 * Aggiorna il profilo dopo un deep search.
 */
async function updateFromDeepSearch(
  userId: string,
  _event: DeepSearchEventData
): Promise<void> {
  const supabase = getAdminClient();
  const profile = await getProfile(userId);
  if (!profile) return;

  const behavior = { ...profile.behavior } as CDPBehavior;

  // Ricalcola deep_search_rate
  const totalAnalyses = behavior.total_analyses ?? 1;
  // Incrementa di 1 il numeratore (approssimazione: non contiamo le deep search esatte,
  // assumiamo che questa funzione venga chiamata una volta per deep search)
  const prevRate = behavior.deep_search_rate ?? 0;
  const prevSearches = Math.round(prevRate * (totalAnalyses > 0 ? totalAnalyses : 1));
  behavior.deep_search_rate = clampRate((prevSearches + 1) / Math.max(1, totalAnalyses));

  behavior.last_active_at = new Date().toISOString();
  behavior.engagement_score = computeEngagementScore(behavior);

  await updateProfileSections(userId, { behavior });
}

/**
 * Aggiorna il profilo dopo una query al corpus legislativo.
 */
async function updateFromCorpusQuery(
  userId: string,
  event: CorpusQueryEventData
): Promise<void> {
  const profile = await getProfile(userId);
  if (!profile) return;

  const behavior = { ...profile.behavior } as CDPBehavior;
  behavior.corpus_queries = (behavior.corpus_queries ?? 0) + 1;
  behavior.last_active_at = new Date().toISOString();
  behavior.engagement_score = computeEngagementScore(behavior);

  // Aggiorna corpus_interests nelle preferences
  const preferences = { ...profile.preferences } as CDPPreferences;
  if (event.question_topic) {
    const interests = preferences.corpus_interests ?? [];
    interests.push(event.question_topic);
    preferences.corpus_interests = deduplicateAndLimit(interests, 20);
  }

  await updateProfileSections(userId, { behavior, preferences });
}

/**
 * Aggiorna il profilo dopo un cambio piano.
 */
async function updateFromPlanChange(
  userId: string,
  event: PlanChangedEventData
): Promise<void> {
  const profile = await getProfile(userId);
  if (!profile) return;

  const lifecycle = { ...profile.lifecycle } as CDPLifecycle;
  const history = lifecycle.plan_history ?? [];

  // Chiudi entry corrente
  if (history.length > 0) {
    const lastEntry = history[history.length - 1];
    if (lastEntry.to === null) {
      lastEntry.to = new Date().toISOString();
    }
  }

  // Aggiungi nuova entry
  history.push({
    plan: event.to_plan,
    from: new Date().toISOString(),
    to: null,
  });
  lifecycle.plan_history = history;

  // Upgrade e un segnale di conversione
  if (event.to_plan === "pro") {
    const signals = lifecycle.conversion_signals ?? [];
    signals.push(`upgrade_to_pro:${new Date().toISOString()}`);
    lifecycle.conversion_signals = deduplicateAndLimit(signals, 20);
  }

  lifecycle.stage = computeLifecycleStageFromProfile(
    profile.behavior as CDPBehavior,
    lifecycle,
    profile.preferences as CDPPreferences
  );

  await updateProfileSections(userId, { lifecycle });
}

/**
 * Aggiorna il profilo dopo una richiesta di referral avvocato.
 */
async function updateFromLawyerReferral(
  userId: string,
  event: LawyerReferralEventData
): Promise<void> {
  const profile = await getProfile(userId);
  if (!profile) return;

  const preferences = { ...profile.preferences } as CDPPreferences;
  preferences.lawyer_interest = true;

  const identity = { ...profile.identity } as CDPIdentity;
  if (!identity.inferred_region && event.region) {
    identity.inferred_region = normalizeRegion(event.region);
  }

  await updateProfileSections(userId, { preferences, identity });
}

/**
 * Aggiorna last_active_at (login, qualsiasi attivita).
 */
export async function touchLastActive(userId: string): Promise<void> {
  const profile = await getProfile(userId);
  if (!profile) return;

  const behavior = { ...profile.behavior } as CDPBehavior;
  behavior.last_active_at = new Date().toISOString();

  const lifecycle = { ...profile.lifecycle } as CDPLifecycle;
  lifecycle.stage = computeLifecycleStageFromProfile(behavior, lifecycle, profile.preferences as CDPPreferences);
  lifecycle.churn_risk = computeChurnRisk(behavior, lifecycle);

  await updateProfileSections(userId, { behavior, lifecycle });
}

// ─── Persistence ───

/**
 * Aggiorna sezioni specifiche del profilo con optimistic locking.
 */
async function updateProfileSections(
  userId: string,
  sections: Partial<{
    identity: CDPIdentity;
    behavior: CDPBehavior;
    risk_profile: CDPRiskProfile;
    preferences: CDPPreferences;
    lifecycle: CDPLifecycle;
  }>
): Promise<void> {
  const supabase = getAdminClient();

  const updatePayload: Record<string, unknown> = {
    ...sections,
    computed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("customer_profiles")
    .update(updatePayload)
    .eq("user_id", userId);

  if (error) {
    console.error("[CDP] Failed to update profile sections:", error.message);
  }
}

// ─── Computation Functions ───

/**
 * Calcola lo stage del lifecycle dall'attivita dell'utente.
 */
function computeLifecycleStage(
  totalAnalyses: number,
  plan: string | null,
  _now: Date
): LifecycleStage {
  if (totalAnalyses >= 10 && plan === "pro") return "power_user";
  if (totalAnalyses >= 3) return "engaged";
  if (totalAnalyses >= 1) return "activated";
  return "new";
}

/**
 * Versione completa del lifecycle stage, usando il profilo CDP completo.
 */
function computeLifecycleStageFromProfile(
  behavior: CDPBehavior,
  lifecycle: CDPLifecycle,
  _preferences: CDPPreferences
): LifecycleStage {
  const now = new Date();
  const lastActive = behavior.last_active_at ? new Date(behavior.last_active_at) : null;
  const daysSinceActive = lastActive
    ? Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // Churned: inattivo da 60+ giorni (se era almeno activated)
  if (
    daysSinceActive >= 60 &&
    lifecycle.stage !== "new" &&
    lifecycle.stage !== "churned"
  ) {
    return "churned";
  }

  // Churning: inattivo da 21-60 giorni (se era engaged o power_user)
  if (
    daysSinceActive >= 21 &&
    (lifecycle.stage === "engaged" || lifecycle.stage === "power_user")
  ) {
    return "churning";
  }

  // Power user: 10+ analisi totali E attivo negli ultimi 14 giorni E
  // (pro OR deep_search_rate > 0.3)
  if (
    (behavior.total_analyses ?? 0) >= 10 &&
    daysSinceActive <= 14 &&
    (behavior.deep_search_rate > 0.3 ||
      lifecycle.plan_history?.some((p) => p.plan === "pro" && p.to === null))
  ) {
    return "power_user";
  }

  // Engaged: 3+ analisi negli ultimi 30 giorni
  if ((behavior.analyses_last_30d ?? 0) >= 3) return "engaged";

  // Activated: almeno 1 analisi completata
  if ((behavior.total_analyses ?? 0) >= 1) return "activated";

  return "new";
}

/**
 * Calcola il rischio di churn (0-100).
 * Basato su inattivita e trend di utilizzo.
 */
function computeChurnRisk(behavior: CDPBehavior, lifecycle: CDPLifecycle): number {
  const now = new Date();
  const lastActive = behavior.last_active_at ? new Date(behavior.last_active_at) : null;
  const daysSinceActive = lastActive
    ? Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // Base: proporzionale ai giorni di inattivita
  let risk = Math.min(100, daysSinceActive * 2);

  // Bonus rischio se era un utente attivo che si e fermato
  if (lifecycle.stage === "churning") risk = Math.max(risk, 60);
  if (lifecycle.stage === "churned") risk = 100;

  // Riduzione se ha analisi recenti
  if ((behavior.analyses_last_30d ?? 0) > 0) {
    risk = Math.max(0, risk - 30);
  }

  return clampPercentage(risk);
}

/**
 * Calcola l'engagement score (0-100).
 * Formula pesata: frequenza (40%) + varieta (20%) + profondita (20%) + corpus (20%)
 */
function computeEngagementScore(behavior: CDPBehavior): number {
  // Frequenza: analisi negli ultimi 30 giorni (max 10 = 100%)
  const frequencyScore = Math.min(100, ((behavior.analyses_last_30d ?? 0) / 10) * 100);

  // Varieta: tipi di documento diversi (max 5 = 100%)
  const varietyScore = Math.min(
    100,
    ((behavior.preferred_doc_types?.length ?? 0) / 5) * 100
  );

  // Profondita: deep search rate (0-1 -> 0-100)
  const depthScore = (behavior.deep_search_rate ?? 0) * 100;

  // Corpus: query al corpus (max 20 = 100%)
  const corpusScore = Math.min(100, ((behavior.corpus_queries ?? 0) / 20) * 100);

  const score = frequencyScore * 0.4 + varietyScore * 0.2 + depthScore * 0.2 + corpusScore * 0.2;

  return clampPercentage(score);
}

/**
 * Inferisce il settore dell'utente dai tipi di documento preferiti.
 */
function inferSector(docTypes: string[]): string | null {
  const sectorMap: Record<string, string> = {
    contratto_lavoro: "employment",
    locazione: "real_estate",
    compravendita: "real_estate",
    societario: "corporate",
    privacy: "tech",
    termini_servizio: "tech",
    nda: "corporate",
    prestazione_servizi: "services",
  };

  const sectorCounts = new Map<string, number>();
  for (const docType of docTypes) {
    const sector = sectorMap[docType];
    if (sector) {
      sectorCounts.set(sector, (sectorCounts.get(sector) ?? 0) + 1);
    }
  }

  if (sectorCounts.size === 0) return null;

  // Settore piu frequente, solo se rappresenta 40%+ dei documenti
  const sorted = Array.from(sectorCounts.entries()).sort((a, b) => b[1] - a[1]);
  const [topSector, topCount] = sorted[0];
  const total = docTypes.length;

  return topCount / total >= 0.4 ? topSector : null;
}

// ─── Backfill per utenti esistenti ───

/**
 * Crea profili CDP per tutti gli utenti esistenti che non ne hanno uno.
 * Da eseguire una tantum dopo la migrazione 026.
 * Usa i dati storici dalle tabelle analyses e profiles.
 */
export async function backfillExistingProfiles(): Promise<{
  created: number;
  errors: number;
}> {
  const supabase = getAdminClient();
  let created = 0;
  let errors = 0;

  // Trova utenti senza profilo CDP
  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, email, plan, analyses_count, created_at");

  if (error || !users) {
    console.error("[CDP Backfill] Failed to fetch profiles:", error?.message);
    return { created: 0, errors: 1 };
  }

  for (const user of users) {
    try {
      // Controlla se ha gia un profilo CDP
      const { data: existing } = await supabase
        .from("customer_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) continue;

      // Crea profilo base
      const identity: CDPIdentity = {
        ...createDefaultIdentity(),
        email_domain: extractEmailDomain(user.email),
      };

      const behavior: CDPBehavior = {
        ...createDefaultBehavior(),
        total_analyses: user.analyses_count ?? 0,
      };

      // Arricchisci con dati storici delle analisi
      const { data: analyses } = await supabase
        .from("analyses")
        .select("document_type, fairness_score, advice, created_at")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(50);

      if (analyses && analyses.length > 0) {
        // preferred_doc_types
        const docTypes = analyses
          .map((a) => normalizeDocumentType(a.document_type))
          .filter(Boolean) as string[];
        behavior.preferred_doc_types = topByFrequency(docTypes, 5);

        // avg_fairness_score
        const scores = analyses
          .map((a) => a.fairness_score)
          .filter((s): s is number => s !== null);
        if (scores.length > 0) {
          const riskProfile = createDefaultRiskProfile();
          riskProfile.avg_fairness_score = clampFairnessScore(
            scores.reduce((a, b) => a + b, 0) / scores.length
          );

          // risk_distribution
          for (const analysis of analyses) {
            const advice = analysis.advice as { needsLawyer?: boolean } | null;
            if (advice?.needsLawyer) {
              riskProfile.needs_lawyer_rate =
                (riskProfile.needs_lawyer_rate ?? 0) + 1;
            }
          }
          if (analyses.length > 0) {
            riskProfile.needs_lawyer_rate = clampRate(
              riskProfile.needs_lawyer_rate / analyses.length
            );
          }
        }

        // last_active_at
        behavior.last_active_at = analyses[0].created_at;
      }

      const lifecycle: CDPLifecycle = {
        ...createDefaultLifecycle(),
        stage: computeLifecycleStage(user.analyses_count ?? 0, user.plan, new Date()),
        plan_history: [
          {
            plan: user.plan ?? "free",
            from: user.created_at,
            to: null,
          },
        ],
        first_analysis_at: analyses?.[analyses.length - 1]?.created_at ?? null,
      };
      lifecycle.churn_risk = computeChurnRisk(behavior, lifecycle);

      const { error: insertError } = await supabase.from("customer_profiles").insert({
        user_id: user.id,
        identity,
        behavior,
        risk_profile: createDefaultRiskProfile(),
        preferences: createDefaultPreferences(),
        lifecycle,
      });

      if (insertError) {
        console.error(`[CDP Backfill] Failed for user ${user.id}:`, insertError.message);
        errors++;
      } else {
        created++;
      }
    } catch (err) {
      console.error(`[CDP Backfill] Error for user ${user.id}:`, err);
      errors++;
    }
  }

  console.log(`[CDP Backfill] Complete: ${created} created, ${errors} errors`);
  return { created, errors };
}
