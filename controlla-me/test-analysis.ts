/**
 * Test script for controlla.me analysis pipeline
 *
 * Simulates the full 4-agent flow with a sample lease contract
 * containing problematic clauses.
 *
 * Run with: npx tsx test-analysis.ts
 */

import { runClassifier } from "./lib/agents/classifier";
import { runAnalyzer } from "./lib/agents/analyzer";
import { runInvestigator } from "./lib/agents/investigator";
import { runAdvisor } from "./lib/agents/advisor";

// Sample lease contract with problematic clauses
const SAMPLE_CONTRACT = `
CONTRATTO DI LOCAZIONE AD USO ABITATIVO
(ai sensi della Legge 9 dicembre 1998, n. 431)

TRA

Il Sig. Giovanni Verdi, nato a Roma il 15/03/1965, residente in Via Appia 100, Roma,
C.F. VRDGNN65C15H501X (di seguito "Locatore")

E

La Sig.ra Maria Neri, nata a Milano il 22/07/1990, residente in Via Dante 50, Milano,
C.F. NREMRA90L62F205Y (di seguito "Conduttore")

SI CONVIENE E STIPULA QUANTO SEGUE:

Art. 1 - OGGETTO
Il Locatore concede in locazione al Conduttore l'immobile sito in Milano, Via Manzoni 25,
piano 3, interno 8, composto da 3 vani oltre servizi, identificato catastalmente al
foglio 120, particella 456, sub. 8.

Art. 2 - DURATA
Il presente contratto è stipulato per la durata di anni 4 (quattro), con decorrenza dal
1 aprile 2026, e si rinnoverà automaticamente per ulteriori 4 anni, salvo disdetta.

Art. 3 - CANONE
Il canone annuo di locazione è stabilito in € 14.400,00 (quattordicimilaquattrocento/00),
pari a € 1.200,00 (milleduecento/00) mensili, da corrispondersi entro il giorno 5 di
ogni mese mediante bonifico bancario.

Art. 4 - DEPOSITO CAUZIONALE
A garanzia delle obbligazioni assunte, il Conduttore versa al Locatore un deposito
cauzionale pari a 4 (quattro) mensilità del canone, ovvero € 4.800,00. Tale deposito
non produce interessi e sarà restituito al termine della locazione, previa verifica dello
stato dell'immobile.

Art. 5 - RECESSO ANTICIPATO DEL CONDUTTORE
Il Conduttore ha facoltà di recedere dal contratto in qualsiasi momento, con preavviso di
6 mesi da comunicarsi mediante lettera raccomandata. In caso di recesso anticipato, il
Conduttore è tenuto al pagamento di una penale pari a 6 (sei) mensilità del canone di
locazione.

Art. 6 - SPESE CONDOMINIALI
Le spese condominiali ordinarie sono a carico del Conduttore. Le spese per il riscaldamento
centralizzato sono ripartite secondo le tabelle millesimali.

Art. 7 - DESTINAZIONE D'USO
L'immobile è destinato esclusivamente ad uso abitativo del Conduttore e del suo nucleo
familiare. È vietato il subaffitto totale o parziale senza il consenso scritto del Locatore.

Art. 8 - STATO DELL'IMMOBILE
Il Conduttore dichiara di aver visitato l'immobile e di averlo trovato in buono stato di
manutenzione, idoneo all'uso convenuto.

Art. 9 - MANUTENZIONE ORDINARIA
La manutenzione ordinaria dell'immobile e degli impianti è a carico del Conduttore.

Art. 10 - DIVIETO DI MODIFICHE
Il Conduttore non può apportare modifiche, migliorie o addizioni all'immobile senza il
preventivo consenso scritto del Locatore. Le eventuali migliorie autorizzate resteranno
acquisite all'immobile senza diritto a indennizzo.

Art. 11 - ASSICURAZIONE
Il Conduttore è tenuto a stipulare una polizza assicurativa per danni da incendio, scoppio,
allagamento con un massimale non inferiore a € 500.000,00.

Art. 12 - MANUTENZIONE STRAORDINARIA
Tutte le spese di manutenzione straordinaria dell'immobile, inclusi interventi su impianti,
strutture portanti, tetto, facciata e parti comuni, sono a carico del Conduttore.

Art. 13 - CLAUSOLA RISOLUTIVA
Il contratto si intenderà risolto di diritto ai sensi dell'art. 1456 c.c. in caso di:
a) mancato pagamento anche di una sola mensilità del canone;
b) violazione del divieto di subaffitto;
c) destinazione dell'immobile ad uso diverso da quello convenuto.

Art. 14 - REGISTRAZIONE
Le spese di registrazione del presente contratto sono a carico del Conduttore nella misura
del 100%.

Art. 15 - FORO COMPETENTE
Per qualsiasi controversia derivante dal presente contratto sarà competente in via
esclusiva il Foro di Roma.

Milano, 15 febbraio 2026

Il Locatore: Giovanni Verdi
Il Conduttore: Maria Neri
`;

async function runTest() {
  console.log("=".repeat(60));
  console.log("CONTROLLA.ME — Test Pipeline Analisi");
  console.log("=".repeat(60));

  // Step 1: Classifier
  console.log("\n--- STEP 1: CLASSIFICATORE ---\n");
  let classification;
  try {
    classification = await runClassifier(SAMPLE_CONTRACT);
    console.log(JSON.stringify(classification, null, 2));

    // Validate JSON structure
    if (!classification.documentType || !classification.parties) {
      throw new Error("Missing required fields in classification");
    }
    console.log("\n[OK] Classificazione completata con successo");
  } catch (error) {
    console.error("[ERRORE] Classificazione fallita:", error);
    process.exit(1);
  }

  // Step 2: Analyzer
  console.log("\n--- STEP 2: ANALIZZATORE ---\n");
  let analysis;
  try {
    analysis = await runAnalyzer(SAMPLE_CONTRACT, classification);
    console.log(JSON.stringify(analysis, null, 2));

    // Validate
    if (!analysis.clauses || !Array.isArray(analysis.clauses)) {
      throw new Error("Missing clauses array in analysis");
    }
    console.log(`\n[OK] Analisi completata: ${analysis.clauses.length} clausole analizzate`);
    console.log(`     Rischio complessivo: ${analysis.overallRisk}`);
  } catch (error) {
    console.error("[ERRORE] Analisi fallita:", error);
    process.exit(1);
  }

  // Step 3: Investigator
  console.log("\n--- STEP 3: INVESTIGATORE ---\n");
  let investigation;
  try {
    investigation = await runInvestigator(classification, analysis);
    console.log(JSON.stringify(investigation, null, 2));

    if (!investigation.findings || !Array.isArray(investigation.findings)) {
      throw new Error("Missing findings array in investigation");
    }
    console.log(
      `\n[OK] Investigazione completata: ${investigation.findings.length} clausole investigate`
    );
  } catch (error) {
    console.error("[ERRORE] Investigazione fallita:", error);
    // Non-fatal — continue with empty findings
    investigation = { findings: [] };
    console.log("[WARN] Procedo con findings vuoti");
  }

  // Step 4: Advisor
  console.log("\n--- STEP 4: CONSULENTE ---\n");
  let advice;
  try {
    advice = await runAdvisor(classification, analysis, investigation);
    console.log(JSON.stringify(advice, null, 2));

    if (
      typeof advice.fairnessScore !== "number" ||
      !advice.risks ||
      !advice.actions
    ) {
      throw new Error("Missing required fields in advice");
    }
    console.log(`\n[OK] Report completato`);
    console.log(`     Fairness Score: ${advice.fairnessScore}/10`);
    console.log(`     Rischi: ${advice.risks.length}`);
    console.log(`     Azioni: ${advice.actions.length}`);
    console.log(`     Serve avvocato: ${advice.needsLawyer ? "Sì" : "No"}`);
  } catch (error) {
    console.error("[ERRORE] Report fallito:", error);
    process.exit(1);
  }

  // Final summary
  console.log("\n" + "=".repeat(60));
  console.log("RIEPILOGO TEST");
  console.log("=".repeat(60));
  console.log(`\nDocumento: ${classification.documentTypeLabel}`);
  console.log(`Parti: ${classification.parties.map((p) => `${p.role}: ${p.name}`).join(", ")}`);
  console.log(`Clausole analizzate: ${analysis.clauses.length}`);
  console.log(`Clausole problematiche: ${analysis.clauses.filter((c) => ["critical", "high", "medium"].includes(c.riskLevel)).length}`);
  console.log(`Norme/sentenze trovate: ${investigation.findings.length}`);
  console.log(`Fairness Score: ${advice.fairnessScore}/10`);
  console.log(`Rischi identificati: ${advice.risks.length}`);
  console.log(`\nTest completato con successo!`);
}

runTest().catch((error) => {
  console.error("Test fallito:", error);
  process.exit(1);
});
