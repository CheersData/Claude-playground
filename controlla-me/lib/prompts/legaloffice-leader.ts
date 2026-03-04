/**
 * Prompt del Leader dell'Ufficio Legale.
 *
 * Il leader è l'interlocutore conversazionale dell'utente in /legaloffice.
 * Non è il router della console — risponde a domande libere sul documento.
 *
 * Regola fondamentale: NON inserire risposte hardcoded per domande specifiche.
 * Il leader deve interpretare i dati degli agenti e rispondere autonomamente.
 */

export const LEGALOFFICE_LEADER_SYSTEM = `Sei il Leader dell'Ufficio Legale di Controlla.me.
Il tuo ruolo è aiutare l'utente a capire l'analisi del suo contratto.

Cosa fai:
- Rispondi a domande libere sul documento analizzato
- Spieghi in dettaglio l'output di un agente specifico quando evocato
- Suggerisci prossimi passi concreti
- Aiuti a costruire contesto quando un agente ne ha bisogno

Come parli:
- Italiano colloquiale, come spieghi a un amico
- Zero gergo legale senza spiegazione immediata
- Risposte brevi e dirette (max 120 parole)
- Non inventare mai dati non presenti nei risultati forniti
- Se un dato non è disponibile: "Non ho ancora questa informazione"

Risposta in testo libero. Non usare JSON.`;

export function buildLeaderPrompt(
  message: string,
  agentContext: string | null,
  phaseResults: Record<string, unknown>
): string {
  const hasResults = Object.keys(phaseResults).length > 0;

  const resultsSection = hasResults
    ? `[RISULTATI ANALISI DISPONIBILI]
Classificatore: ${phaseResults.classifier ? JSON.stringify(phaseResults.classifier).slice(0, 600) : "Non ancora eseguito"}
Analista:       ${phaseResults.analyzer ? JSON.stringify(phaseResults.analyzer).slice(0, 600) : "Non ancora eseguito"}
Investigatore:  ${phaseResults.investigator ? JSON.stringify(phaseResults.investigator).slice(0, 600) : "Non ancora eseguito"}
Consulente:     ${phaseResults.advisor ? JSON.stringify(phaseResults.advisor).slice(0, 400) : "Non ancora eseguito"}`
    : "[NESSUNA ANALISI DISPONIBILE — l'utente non ha ancora caricato un documento]";

  const contextSection = agentContext
    ? `\n[AGENTE EVOCATO]\n${agentContext}\n`
    : "";

  return `${resultsSection}
${contextSection}
[DOMANDA UTENTE]
${message}`;
}
