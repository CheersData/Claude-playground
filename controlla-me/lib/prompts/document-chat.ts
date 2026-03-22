/**
 * Prompt per Document Chat — conversazione multi-turn su documento analizzato.
 *
 * L'agente ha accesso completo all'analisi del documento (classificazione,
 * rischi, investigazione, consiglio) e alla cronologia della conversazione.
 * Risponde in italiano, linguaggio chiaro ma preciso.
 */

export const DOCUMENT_CHAT_SYSTEM_PROMPT = `Sei un consulente legale specializzato che ha gia studiato il documento e i risultati dell'analisi. Il tuo ruolo è rispondere a domande specifiche in modo conversazionale, ricordando il contesto delle domande precedenti.

REGOLE DI COMPORTAMENTO:

1. MEMORIA E CONTINUITÀ
   - Ricordi le domande e risposte precedenti della conversazione
   - Costruisci sulla conoscenza già condivisa
   - Non ripetere spiegazioni già date, a meno che l'utente le richieda esplicitamente

2. TONO E LINGUAGGIO
   - Conversazionale, come un consulente che parla con il cliente
   - Italiano accessibile, evita legalese eccessivo ma mantieni precisione
   - Risposte brevi e dirette (2-4 paragrafi per turno)
   - Frasi brevi, massimo 1-2 concetti per paragrafo

3. STRUTTURA DELLA RISPOSTA
   - PRIMO paragrafo: risposta diretta alla domanda
   - SECONDO paragrafo (se necessario): approfondimento con citazioni specifiche
   - TERZO paragrafo (se necessario): implicazioni pratiche o azione suggerita

4. CITAZIONI E RIFERIMENTI
   - Cita SEMPRE le clausole specifiche del documento (es. "Art. 5, comma 2: ...", "Clausola sulla responsabilità: ...")
   - Cita gli articoli normativi trovati nel contesto se pertinenti
   - Per ogni affermazione legale, indica la fonte (documento o norma)
   - Numeri e termini ESATTI se li conosci dal documento

5. DOMANDE CRITICHE E AMBIGUITÀ
   - Se la domanda dipende da un'interpretazione del documento, DICHIARA l'interpretazione
   - Se il documento è ambiguo su un punto, DICHIARA l'ambiguità e offri entrambe le letture

6. OUTPUT
   - ESCLUSIVAMENTE testo plain (NON JSON, NON markdown, NON backtick)
   - Risposte sempre in italiano
   - Lunghezza tipica: 150-400 parole per turno
   - Paragrafi separati da linea vuota

7. LIMITAZIONI
   - Non inventare clausole o norme non presenti nel documento
   - Se il documento non contiene informazioni su un aspetto, DILLO esplicitamente
   - Se la domanda riguarda argomenti completamente estranei al documento, reindirizza gentilmente`;

/**
 * Costruisce il prompt utente con tutto il contesto dell'analisi e la cronologia.
 */
export function buildDocumentChatPrompt(params: {
  classification: Record<string, unknown> | null;
  analysis: Record<string, unknown> | null;
  investigation: Record<string, unknown> | null;
  advice: Record<string, unknown> | null;
  fileName: string;
  conversationHistory: Array<{ role: string; content: string }>;
  currentQuestion: string;
}): string {
  const sections: string[] = [];

  // Documento
  sections.push(`## DOCUMENTO ANALIZZATO: ${params.fileName}`);

  // Classificazione
  if (params.classification) {
    const c = params.classification;
    sections.push(`## CLASSIFICAZIONE
- Tipo: ${c.documentType || "N/A"}
- Sotto-tipo: ${c.documentSubType || "N/A"}
- Istituti giuridici: ${Array.isArray(c.relevantInstitutes) ? c.relevantInstitutes.join(", ") : "N/A"}
- Aree legali: ${Array.isArray(c.legalFocusAreas) ? c.legalFocusAreas.join(", ") : "N/A"}
- Leggi applicabili: ${Array.isArray(c.applicableLaws) ? c.applicableLaws.join(", ") : "N/A"}`);
  }

  // Analisi rischi
  if (params.analysis) {
    const a = params.analysis;
    const clauses = Array.isArray(a.clauses) ? a.clauses : [];
    const missing = Array.isArray(a.missingElements) ? a.missingElements : [];

    if (clauses.length > 0) {
      sections.push(`## CLAUSOLE ANALIZZATE (${clauses.length})`);
      for (const clause of clauses) {
        const c = clause as Record<string, unknown>;
        sections.push(`### ${c.title || "Clausola"}
- Rischio: ${c.severity || "N/A"}
- Dettaglio: ${c.detail || "N/A"}
- Base legale: ${c.legalBasis || "N/A"}
- Framework normativo: ${c.normativeFramework || "N/A"}`);
      }
    }

    if (missing.length > 0) {
      sections.push(`## ELEMENTI MANCANTI
${missing.map((m: unknown) => {
  const item = m as Record<string, unknown>;
  return `- ${item.element || item}: ${item.impact || ""}`;
}).join("\n")}`);
    }

    if (a.overallRisk) {
      sections.push(`Rischio complessivo: ${a.overallRisk}`);
    }
  }

  // Investigazione
  if (params.investigation) {
    const inv = params.investigation;
    const findings = Array.isArray(inv.findings) ? inv.findings : [];
    if (findings.length > 0) {
      sections.push(`## RICERCA GIURIDICA (${findings.length} risultati)`);
      for (const f of findings) {
        const finding = f as Record<string, unknown>;
        sections.push(`- ${finding.title || "Risultato"}: ${finding.analysis || finding.detail || "N/A"}
  Fonti: ${Array.isArray(finding.sources) ? (finding.sources as Array<Record<string, unknown>>).map(s => s.title || s.url).join(", ") : "N/A"}`);
      }
    }
  }

  // Consiglio finale
  if (params.advice) {
    const adv = params.advice;
    sections.push(`## VALUTAZIONE FINALE
- Punteggio equità: ${adv.fairnessScore || "N/A"}/10
- Riepilogo: ${adv.summary || "N/A"}`);

    if (adv.scores) {
      const scores = adv.scores as Record<string, number>;
      sections.push(`- Equità contrattuale: ${scores.contractEquity || "N/A"}/10
- Coerenza legale: ${scores.legalCoherence || "N/A"}/10
- Conformità pratica: ${scores.practicalCompliance || "N/A"}/10
- Completezza: ${scores.completeness || "N/A"}/10`);
    }

    const risks = Array.isArray(adv.risks) ? adv.risks : [];
    if (risks.length > 0) {
      sections.push(`### RISCHI PRINCIPALI`);
      for (const r of risks) {
        const risk = r as Record<string, unknown>;
        sections.push(`- [${risk.severity}] ${risk.title}: ${risk.detail}
  Base legale: ${risk.legalBasis || "N/A"}`);
      }
    }

    const actions = Array.isArray(adv.actions) ? adv.actions : [];
    if (actions.length > 0) {
      sections.push(`### AZIONI CONSIGLIATE`);
      for (const a of actions) {
        const action = a as Record<string, unknown>;
        sections.push(`- ${action.action}${action.rationale ? ` (${action.rationale})` : ""}`);
      }
    }

    if (adv.needsLawyer) {
      sections.push(`⚠️ CONSIGLIATO AVVOCATO: ${adv.lawyerReason || "Situazione complessa"} (Specializzazione: ${adv.lawyerSpecialization || "N/A"})`);
    }
  }

  // Cronologia conversazione
  if (params.conversationHistory.length > 0) {
    sections.push(`## CRONOLOGIA CONVERSAZIONE`);
    for (const msg of params.conversationHistory) {
      const prefix = msg.role === "user" ? "UTENTE" : "ASSISTENTE";
      sections.push(`[${prefix}]: ${msg.content}`);
    }
  }

  // Domanda attuale
  sections.push(`## DOMANDA ATTUALE DELL'UTENTE
${params.currentQuestion}`);

  return sections.join("\n\n");
}
