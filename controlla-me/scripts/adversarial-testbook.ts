/**
 * Adversarial Testbook — Corpus Agent Pro Evaluation
 *
 * Testa la pipeline completa del Corpus Agent (question-prep + retrieval + LLM)
 * con 30 domande "bastarde" da personas professionali: Notaio e Avvocato.
 *
 * Rubrica 4 dimensioni automatizzate (100 pt) + 20 pt bonus manuale:
 *   - Citation accuracy    (25 pt): refs citati esistono e sono pertinenti
 *   - Gap detection        (25 pt): l'agente ammette i limiti del corpus
 *   - Confidence calibration(25 pt): confidence nel range atteso
 *   - Response completeness(25 pt): answer + IN PRATICA + followUp presenti
 *   - Legal correctness    (+20 bonus): valutazione umana esperta
 *
 * Costo stimato: 30 domande × Gemini Flash ≈ $0.09 per run.
 *
 * Usage:
 *   npx tsx scripts/adversarial-testbook.ts             # run completo
 *   npx tsx scripts/adversarial-testbook.ts --notaio    # solo persona notaio
 *   npx tsx scripts/adversarial-testbook.ts --avvocato  # solo persona avvocato
 *   npx tsx scripts/adversarial-testbook.ts --dry-run   # solo question-prep, senza LLM
 *   npx tsx scripts/adversarial-testbook.ts --tier intern    # forza tier (default: intern)
 *   npx tsx scripts/adversarial-testbook.ts --tier associate # tier intermedio
 *   npx tsx scripts/adversarial-testbook.ts --tier partner   # tier top (richiede crediti Anthropic)
 *   npx tsx scripts/adversarial-testbook.ts --evalua-opus    # + giudizio finale Opus (summary)
 *   npx tsx scripts/adversarial-testbook.ts --opus-eval       # valutazione legale automatica per-test con Opus
 *   npx tsx scripts/adversarial-testbook.ts --opus-eval --notaio  # combo: solo notaio + Opus eval
 *
 * Nota tier default = intern: question-prep parte da Cerebras, corpus-agent da Gemini Flash.
 * Salta Anthropic (nessun credito in ambiente demo) e rispetta le soglie free dei provider.
 */

import * as dotenv from "dotenv";
import { resolve } from "path";
import { execSync } from "child_process";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { askCorpusAgent, type CorpusAgentResult } from "../lib/agents/corpus-agent";
import { isVectorDBEnabled } from "../lib/embeddings";
import { setCurrentTier, type TierName } from "../lib/tiers";

// Env pulito per subprocess claude -p (rimuove CLAUDE* e ANTHROPIC_API_KEY per evitare nested session)
function getCleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === "ANTHROPIC_API_KEY" || key.startsWith("CLAUDE")) {
      delete env[key];
    }
  }
  return env;
}

// ─── Opus per-test evaluation (--opus-eval) ────────────────────────────────────

interface OpusEvalResult {
  score: number;   // 0-10
  notes: string;
}

/**
 * Valuta la correttezza giuridica di un singolo risultato usando claude-opus-4-5 via CLI.
 * Chiamato per ogni test case quando --opus-eval è attivo.
 * Regola CLAUDE.md: script interni usano `claude -p`, mai @anthropic-ai/sdk.
 */
function evaluateWithOpus(tc: AdversarialTestCase, result: CorpusAgentResult): OpusEvalResult {
  const prompt = `Sei un esperto legale italiano. Valuta la correttezza giuridica della seguente risposta.

DOMANDA:
${tc.question}

RISPOSTA DELL'AGENTE:
${result.answer}

ARTICOLI CITATI:
${result.citedArticles?.map((a) => `- ${a.reference}: ${(a as { reference?: string; title?: string }).title ?? ""}`).join("
") || "Nessuno"}

CONTESTO TEST:
- Categoria: ${tc.category}
- Comportamento atteso: ${tc.expectedBehavior.shouldDetectGap ? "deve segnalare limite corpus" : "risposta completa attesa"}
- Articoli attesi: ${tc.expectedBehavior.expectedArticleRefs?.join(", ") || "nessuno specificato"}

Valuta su scala 0-10 la correttezza giuridica della risposta.
Criteri: accuratezza delle norme citate, assenza di invenzioni, completezza rispetto alla domanda, segnalazione corretta dei limiti.

Rispondi SOLO con questo formato:
PUNTEGGIO: [numero 0-10]
NOTE: [1-2 frasi di motivazione]`;

  try {
    const raw = execSync(
      `claude -p ${JSON.stringify(prompt)} --model claude-opus-4-5`,
      {
        encoding: "utf-8",
        timeout: 60_000,
        cwd: resolve(__dirname, ".."),
        env: getCleanEnv(),
      }
    ).trim();

    // Parse PUNTEGGIO: X and NOTE: ...
    const scoreMatch = raw.match(/PUNTEGGIO:\s*([0-9](?:\.[0-9])?|10)/i);
    const noteMatch = raw.match(/NOTE:\s*(.+)/is);

    const score = scoreMatch ? Math.min(10, Math.max(0, parseFloat(scoreMatch[1]))) : 0;
    const notes = noteMatch ? noteMatch[1].trim().slice(0, 300) : raw.slice(0, 200);

    return { score, notes };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isDemo = msg.includes("ENOENT") || msg.includes("Credit balance") || msg.includes("exit code");
    return {
      score: 0,
      notes: isDemo ? "Opus eval non disponibile in ambiente demo" : `Opus eval fallita: ${msg.slice(0, 100)}`,
    };
  }
}

// ─── ANSI colors ───

const R = "\x1b[31m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const B = "\x1b[34m";
const M = "\x1b[35m";
const C = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ─── Types ───

type Persona = "notaio" | "avvocato";
type Difficulty = "medium" | "hard" | "expert";
type QuestionCategory =
  | "corpus_boundary"   // domanda fuori scope corpus (c.p.c., giurisprudenza, fiscale)
  | "institute_trap"    // confusione tra istituti simili
  | "sub_article"       // richiede testo letterale di un comma specifico
  | "multi_area"        // coinvolge più aree giuridiche
  | "false_premise"     // premessa giuridicamente sbagliata
  | "eu_regulation"     // normativa UE non sempre nel corpus
  | "standard";         // domanda professionale standard

interface AdversarialTestCase {
  id: number;
  persona: Persona;
  name: string;
  question: string;
  difficulty: Difficulty;
  category: QuestionCategory;
  rationale: string; // perché questa domanda è "bastarda"

  expectedBehavior: {
    /** L'agente deve segnalare esplicitamente limiti del corpus */
    shouldDetectGap: boolean;
    /** Se true: confidence attesa < 0.6 (corpus insufficiente) */
    expectLowConfidence: boolean;
    /** Range confidence atteso [min, max] */
    confidenceRange: [number, number];
    /** Deve citare almeno N articoli */
    minCitedArticles: number;
    /** Substring match sulle refs citate (es. "1490") */
    expectedArticleRefs?: string[];
    /** L'agente NON deve affermare queste cose (falso nel corpus) */
    forbiddenClaims?: string[];
    /** Deve rispondere con un'azione pratica concreta */
    requiresPracticalAction: boolean;
    /** Il corpus non copre questo ambito */
    corpusGapType?: "procedural" | "jurisprudence" | "tax" | "eu" | "admin";
  };

  /** Compilato manualmente da un esperto dopo il run */
  manualEval?: {
    legalCorrectness: number; // 0-10
    evaluatorName: string;
    evaluatorNotes: string;
    evaluatedAt: string;
  };
}

interface EvalScore {
  citationAccuracy: { score: number; max: number; details: string[] };
  gapDetection: { score: number; max: number; details: string[] };
  confidenceCalibration: { score: number; max: number; details: string[] };
  responseCompleteness: { score: number; max: number; details: string[] };
  manualBonus: { score: number; max: number; details: string[] };
  total: number;
  max: number;
  percentage: number;
}

interface AdversarialTestResult {
  id: number;
  persona: Persona;
  name: string;
  question: string;
  difficulty: Difficulty;
  category: QuestionCategory;
  agentResult: CorpusAgentResult | null;
  error?: string;
  score: EvalScore;
  timestamp: string;
}

// ─── 30 Test Cases ───

const ADVERSARIAL_CASES: AdversarialTestCase[] = [

  // ════════════════════════════════════════════════════════
  //  NOTAIO — 15 domande
  // ════════════════════════════════════════════════════════

  {
    id: 1,
    persona: "notaio",
    name: "Riserva di proprietà + opponibilità terzi",
    question: "In un atto di compravendita immobiliare rogato da notaio, il venditore vuole inserire una clausola di riserva di proprietà. È ammissibile e quali sono le formalità per renderla opponibile ai terzi?",
    difficulty: "hard",
    category: "sub_article",
    rationale: "Il notaio conosce l'art. 1524 c.c. ma chiede specificamente le formalità di opponibilità — il corpus deve avere la norma ma potrebbe mancare il dettaglio operativo.",
    expectedBehavior: {
      shouldDetectGap: false,
      expectLowConfidence: false,
      confidenceRange: [0.6, 1.0],
      minCitedArticles: 2,
      expectedArticleRefs: ["1524", "1523"],
      requiresPracticalAction: true,
    },
  },

  {
    id: 2,
    persona: "notaio",
    name: "Legittima coniuge seconda unione",
    question: "Un testatore ha lasciato tutto ai figli di primo letto. La seconda moglie superstite ha diritto alla legittima? In che misura, e cambia qualcosa se ci sono anche figli dalla seconda unione?",
    difficulty: "hard",
    category: "multi_area",
    rationale: "Domanda che intreccia legittima, coniuge, figli di più unioni — richiede articoli 540, 542, 536 c.c. tutti in area successione. Il notaio verifica se l'agente gestisce la quota variabile correttamente.",
    expectedBehavior: {
      shouldDetectGap: false,
      expectLowConfidence: false,
      confidenceRange: [0.65, 1.0],
      minCitedArticles: 3,
      expectedArticleRefs: ["540", "536"],
      forbiddenClaims: ["non ha diritto"],
      requiresPracticalAction: true,
    },
  },

  {
    id: 3,
    persona: "notaio",
    name: "Prezzo simulato rogito — responsabilità",
    question: "Un cliente ha acquistato casa indicando nel rogito un prezzo inferiore a quello realmente pagato. Ora vuole rescindere il contratto. Su quale prezzo calcola il rimborso? E ci sono profili di responsabilità civile per le parti?",
    difficulty: "expert",
    category: "false_premise",
    rationale: "Domanda con premessa problematica (simulazione per evasione). L'agente deve distinguere tra prezzo simulato (art. 1414-1415) e prezzo dissimulato, senza dare consigli che facilitino illeciti.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: false,
      confidenceRange: [0.5, 0.85],
      minCitedArticles: 2,
      expectedArticleRefs: ["1414", "1415"],
      requiresPracticalAction: false,
      corpusGapType: "tax",
    },
  },

  {
    id: 4,
    persona: "notaio",
    name: "Nuda proprietà e estinzione usufrutto",
    question: "Un padre vuole donare la nuda proprietà della casa ai figli riservandosi l'usufrutto. Alla morte del padre cosa succede all'usufrutto? I figli devono fare qualcosa formalmente per la piena proprietà?",
    difficulty: "medium",
    category: "standard",
    rationale: "Domanda standard ma precisa — il notaio vuole sapere se l'agente conosce la consolidazione automatica per confusione (art. 1014 c.c.) e se suggerisce la trascrizione.",
    expectedBehavior: {
      shouldDetectGap: false,
      expectLowConfidence: false,
      confidenceRange: [0.7, 1.0],
      minCitedArticles: 2,
      expectedArticleRefs: ["1014"],
      requiresPracticalAction: true,
    },
  },

  {
    id: 5,
    persona: "notaio",
    name: "Beneficio d'inventario e pagamento anticipato debiti",
    question: "Il cliente ha accettato l'eredità con beneficio d'inventario ma ha pagato un debito del de cuius prima di completare l'inventario. Ha perso il beneficio? Può rimediare?",
    difficulty: "expert",
    category: "sub_article",
    rationale: "Art. 505 c.c. regola il pagamento dei debiti durante inventario. Domanda tecnica che mette a dura prova la granularità del corpus sulla successione.",
    expectedBehavior: {
      shouldDetectGap: false,
      expectLowConfidence: false,
      confidenceRange: [0.5, 0.9],
      minCitedArticles: 2,
      expectedArticleRefs: ["484", "505"],
      requiresPracticalAction: true,
    },
  },

  {
    id: 6,
    persona: "notaio",
    name: "Portabilità mutuo — Legge Bersani",
    question: "Il mio cliente vuole surrogare il mutuo ipotecario presso un'altra banca. L'istituto attuale si rifiuta di collaborare. Quali obblighi pone la cosiddetta Legge Bersani sulla portabilità del mutuo?",
    difficulty: "hard",
    category: "eu_regulation",
    rationale: "La L. 40/2007 (Bersani) regola la surrogazione — potrebbe non essere nel corpus standard. L'agente deve riconoscere il gap o rispondere con art. 1202 c.c. sulla surrogazione convenzionale.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: true,
      confidenceRange: [0.3, 0.7],
      minCitedArticles: 1,
      expectedArticleRefs: ["1202"],
      requiresPracticalAction: true,
    },
  },

  {
    id: 7,
    persona: "notaio",
    name: "Clausola penale 30% nel preliminare — riducibilità",
    question: "Nel preliminare di compravendita immobiliare è prevista una clausola penale del 30% del prezzo per recesso ingiustificato. Il giudice può ridurla anche se il creditore non lo chiede? Come si combina con la caparra confirmatoria?",
    difficulty: "hard",
    category: "corpus_boundary",
    rationale: "Richiede sia art. 1382-1384 (clausola penale) sia 1385 (caparra). La riduzione ufficiosa è questione processuale (art. 1384 + orientamenti Cass.) — il corpus ha la norma ma non la giurisprudenza.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: false,
      confidenceRange: [0.5, 0.85],
      minCitedArticles: 2,
      expectedArticleRefs: ["1382", "1384", "1385"],
      requiresPracticalAction: true,
      corpusGapType: "jurisprudence",
    },
  },

  {
    id: 8,
    persona: "notaio",
    name: "Fideiussione omnibus e limiti di importo",
    question: "Il mio cliente ha firmato una fideiussione 'omnibus' a garanzia di tutti i debiti futuri del debitore principale verso una banca. Ci sono limiti di importo? È valida secondo la normativa vigente?",
    difficulty: "expert",
    category: "eu_regulation",
    rationale: "La fideiussione omnibus schema ABI è stata dichiarata nulla dall'AGCM per violazione normativa antitrust (provv. 55/2005). Corpus ha art. 1938 c.c. (massimo garantito) ma potrebbe mancare il provvedimento AGCM.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: true,
      confidenceRange: [0.4, 0.8],
      minCitedArticles: 1,
      expectedArticleRefs: ["1938"],
      requiresPracticalAction: true,
    },
  },

  {
    id: 9,
    persona: "notaio",
    name: "Usucapione ordinaria — requisiti specifici",
    question: "Il mio cliente occupa pacificamente un fondo altrui da 22 anni con comportamento a titolo di proprietario, senza opposizione del proprietario. Ha tutti i requisiti per l'usucapione ordinaria dei beni immobili?",
    difficulty: "medium",
    category: "standard",
    rationale: "Art. 1158 c.c. regola l'usucapione ordinaria (20 anni + possesso pacifico + animus rem sibi habendi). Domanda standard ma il notaio vuole vedere se l'agente identifica tutti e tre i requisiti.",
    expectedBehavior: {
      shouldDetectGap: false,
      expectLowConfidence: false,
      confidenceRange: [0.75, 1.0],
      minCitedArticles: 2,
      expectedArticleRefs: ["1158"],
      requiresPracticalAction: true,
    },
  },

  {
    id: 10,
    persona: "notaio",
    name: "Patto di famiglia e protezione da legittima",
    question: "Un imprenditore vuole trasferire l'azienda al figlio senza che gli altri figli possano impugnare dopo la sua morte. Il patto di famiglia è lo strumento corretto? Quali vincoli formali e sostanziali esistono?",
    difficulty: "hard",
    category: "multi_area",
    rationale: "Art. 768-bis c.c. introdotto nel 2006 — normativa recente sul patto di famiglia. Richiede conoscenza specifica dell'istituto e del rapporto con la legittima.",
    expectedBehavior: {
      shouldDetectGap: false,
      expectLowConfidence: false,
      confidenceRange: [0.6, 1.0],
      minCitedArticles: 2,
      expectedArticleRefs: ["768"],
      requiresPracticalAction: true,
    },
  },

  {
    id: 11,
    persona: "notaio",
    name: "Delibera condominiale — nullità vs annullabilità",
    question: "L'assemblea condominiale ha deliberato opere straordinarie con una maggioranza di millesimi insufficiente. La delibera è annullabile o nulla? Quali sono i termini per impugnarla?",
    difficulty: "medium",
    category: "standard",
    rationale: "Art. 1137 c.c. (impugnazione delibere, 30 giorni). La distinzione nullità/annullabilità in condominio ha avuto un'evoluzione giurisprudenziale rilevante — il corpus ha la norma ma non le Sezioni Unite.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: false,
      confidenceRange: [0.55, 0.85],
      minCitedArticles: 2,
      expectedArticleRefs: ["1137"],
      requiresPracticalAction: true,
      corpusGapType: "jurisprudence",
    },
  },

  {
    id: 12,
    persona: "notaio",
    name: "Atti dell'incapace e tutela",
    question: "Il mio cliente ha acquistato un immobile da una persona che si scopre fosse sotto tutela al momento del rogito. Il contratto è nullo o annullabile? Cosa può fare per tutelarsi?",
    difficulty: "hard",
    category: "false_premise",
    rationale: "Art. 1425 c.c. (annullabilità per incapacità legale) vs art. 427 c.c. (atti dell'interdetto). Il notaio non dovrebbe aver rogato senza verificare — l'agente deve rispondere sulla norma senza suggerire responsabilità notarile.",
    expectedBehavior: {
      shouldDetectGap: false,
      expectLowConfidence: false,
      confidenceRange: [0.65, 0.95],
      minCitedArticles: 2,
      expectedArticleRefs: ["1425", "427"],
      requiresPracticalAction: true,
    },
  },

  {
    id: 13,
    persona: "notaio",
    name: "Successione internazionale — Reg. UE 650/2012",
    question: "Il de cuius aveva cittadinanza italiana ma residenza abituale in Germania al momento della morte. Quale legge si applica alla successione? Il Regolamento UE 650/2012 modifica qualcosa rispetto al d.i.p. italiano?",
    difficulty: "expert",
    category: "eu_regulation",
    rationale: "Il Reg. UE 650/2012 è normativa UE che il corpus potrebbe non avere. L'agente deve riconoscere il gap e rispondere con quello che ha (L. 218/1995 d.i.p. italiano).",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: true,
      confidenceRange: [0.3, 0.65],
      minCitedArticles: 1,
      requiresPracticalAction: false,
      corpusGapType: "eu",
    },
  },

  {
    id: 14,
    persona: "notaio",
    name: "Prelazione legale inquilino — procedura notifica",
    question: "Un proprietario vuole vendere l'immobile locato a uso abitativo. L'inquilino ha diritto di prelazione? Come deve essere fatta la notifica? Cosa succede se il proprietario vende senza notificare?",
    difficulty: "medium",
    category: "standard",
    rationale: "L. 392/1978 (equo canone) art. 38-39 disciplina la prelazione del conduttore. Normativa speciale — potrebbe non essere nel corpus standard. L'agente deve segnalare se non ha la fonte.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: false,
      confidenceRange: [0.45, 0.85],
      minCitedArticles: 1,
      requiresPracticalAction: true,
    },
  },

  {
    id: 15,
    persona: "notaio",
    name: "Acquisto da società unipersonale — responsabilità soci",
    question: "Il mio cliente vuole acquistare un immobile da una S.r.l. unipersonale. L'unico socio risponde personalmente dei debiti sociali? Ci sono rischi per il compratore se l'immobile è gravato da ipoteche?",
    difficulty: "hard",
    category: "multi_area",
    rationale: "Intreccia diritto societario (responsabilità limitata S.r.l., art. 2462 c.c.) con garanzie reali (ipoteca). L'agente deve segnalare il confine con il diritto societario specialistico.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: false,
      confidenceRange: [0.5, 0.85],
      minCitedArticles: 2,
      expectedArticleRefs: ["2462"],
      requiresPracticalAction: true,
    },
  },

  // ════════════════════════════════════════════════════════
  //  AVVOCATO — 15 domande
  // ════════════════════════════════════════════════════════

  {
    id: 16,
    persona: "avvocato",
    name: "Prescrizione azione di restituzione da contratto nullo",
    question: "Ho un cliente che ha subito danni da un contratto nullo per illiceità dell'oggetto stipulato 12 anni fa. L'azione di restituzione dell'indebito è prescritta? Si applica la prescrizione decennale o quella quinquennale?",
    difficulty: "hard",
    category: "multi_area",
    rationale: "Art. 2946 (ordinaria decennale) vs art. 2033 (indebito oggettivo). La questione della prescrizione dell'azione di restituzione da contratto nullo ha soluzione non univoca — il corpus ha le norme ma non le Sezioni Unite 2009.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: false,
      confidenceRange: [0.55, 0.85],
      minCitedArticles: 2,
      expectedArticleRefs: ["2946", "2033"],
      requiresPracticalAction: true,
      corpusGapType: "jurisprudence",
    },
  },

  {
    id: 17,
    persona: "avvocato",
    name: "Proporzionalità eccezione di inadempimento",
    question: "Il mio cliente si rifiuta di pagare l'intera fattura perché la controparte ha consegnato la merce con 3 giorni di ritardo su una commessa a 30 giorni, senza danno dimostrabile. L'eccezione inadimplenti non est adimplendum è applicabile? È proporzionata?",
    difficulty: "hard",
    category: "corpus_boundary",
    rationale: "Art. 1460 comma 2 c.c. limita l'eccezione se il rifiuto è contrario a buona fede. Il corpus ha la norma ma la proporzionalità è territorio giurisprudenziale (Cass. 2021 n. 16743).",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: false,
      confidenceRange: [0.55, 0.85],
      minCitedArticles: 2,
      expectedArticleRefs: ["1460"],
      forbiddenClaims: ["può rifiutarsi di pagare tutto"],
      requiresPracticalAction: true,
      corpusGapType: "jurisprudence",
    },
  },

  {
    id: 18,
    persona: "avvocato",
    name: "TRAPPOLA: orientamento Cassazione abuso diritto",
    question: "Quante sentenze della Cassazione sull'abuso del diritto nei contratti commerciali devo citare per convincere il giudice? Qual è l'orientamento prevalente delle Sezioni Unite?",
    difficulty: "expert",
    category: "corpus_boundary",
    rationale: "Domanda deliberatamente fuori scope: chiede giurisprudenza specifica (sentenze, Sezioni Unite). L'agente DEVE ammettere il gap e NON inventare sentenze inesistenti.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: true,
      confidenceRange: [0.0, 0.5],
      minCitedArticles: 0,
      forbiddenClaims: ["sentenza n.", "Sezioni Unite hanno stabilito", "Cassazione del"],
      requiresPracticalAction: false,
      corpusGapType: "jurisprudence",
    },
  },

  {
    id: 19,
    persona: "avvocato",
    name: "Inadempimento anticipato — azione prima della scadenza",
    question: "La controparte ha dichiarato per iscritto che non adempirà il contratto di fornitura prima della scadenza fissata tra 2 mesi. Posso già agire per la risoluzione per inadempimento o devo aspettare la scadenza?",
    difficulty: "hard",
    category: "standard",
    rationale: "Art. 1219 c.c. (mora) e art. 1453 c.c. (risoluzione). Il cosiddetto 'anticipatory breach' italiano ha disciplina diversa dall'anglosassone — art. 1461 (impossibilità sopravvenuta) è collegato ma diverso.",
    expectedBehavior: {
      shouldDetectGap: false,
      expectLowConfidence: false,
      confidenceRange: [0.6, 0.95],
      minCitedArticles: 2,
      expectedArticleRefs: ["1453", "1461"],
      requiresPracticalAction: true,
    },
  },

  {
    id: 20,
    persona: "avvocato",
    name: "Danno non patrimoniale da inadempimento contrattuale",
    question: "Il mio cliente ha subito un grave stress psicologico documentato da un medico a causa dell'inadempimento del contratto di manutenzione della sua abitazione. Il danno non patrimoniale è risarcibile anche in ambito contrattuale?",
    difficulty: "hard",
    category: "corpus_boundary",
    rationale: "Art. 2059 c.c. tradizionalmente limitato all'extracontrattuale, ma le Sezioni Unite 2008 hanno ampliato la risarcibilità. Il corpus ha le norme ma non l'evoluzione giurisprudenziale.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: false,
      confidenceRange: [0.5, 0.8],
      minCitedArticles: 2,
      expectedArticleRefs: ["2059", "1218"],
      requiresPracticalAction: true,
      corpusGapType: "jurisprudence",
    },
  },

  {
    id: 21,
    persona: "avvocato",
    name: "Onere della prova responsabilità medica",
    question: "In una causa di responsabilità contrattuale per inadempimento del medico (chirurgo plastico in operazione estetica), chi ha l'onere di provare l'inadempimento? Il paziente o il medico deve provare l'adempimento?",
    difficulty: "expert",
    category: "corpus_boundary",
    rationale: "La responsabilità medica contrattuale ha onere probatorio invertito per Sezioni Unite 2001 (n. 13533). Il corpus ha art. 1218 c.c. ma non la giurisprudenza sull'inversione dell'onere.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: true,
      confidenceRange: [0.35, 0.7],
      minCitedArticles: 1,
      expectedArticleRefs: ["1218"],
      requiresPracticalAction: false,
      corpusGapType: "jurisprudence",
    },
  },

  {
    id: 22,
    persona: "avvocato",
    name: "Clausola compromissoria — deroga alla giurisdizione ordinaria",
    question: "Il contratto di distribuzione prevede una clausola compromissoria che devolved TUTTE le controversie a un arbitro ad hoc a Milano. Il mio cliente vuole andare dal giudice ordinario perché l'arbitrato è costoso. È possibile?",
    difficulty: "hard",
    category: "corpus_boundary",
    rationale: "Art. 806 c.p.c. e art. 808 c.p.c. (compromesso e clausola compromissoria). Domanda prevalentemente processuale — il corpus copre la norma sostanziale ma non la procedura arbitrale.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: false,
      confidenceRange: [0.4, 0.75],
      minCitedArticles: 1,
      requiresPracticalAction: true,
      corpusGapType: "procedural",
    },
  },

  {
    id: 23,
    persona: "avvocato",
    name: "Transazione a saldo e stralcio — danno nascosto",
    question: "Il mio cliente ha firmato una transazione 'a saldo e stralcio di qualsiasi pretesa presente e futura'. Successivamente ha scoperto un difetto nascosto nell'opera che era ignoto a entrambi al momento della transazione. Può agire nonostante la transazione?",
    difficulty: "expert",
    category: "false_premise",
    rationale: "Art. 1975 c.c. (transazione e scoperta di documenti) + art. 1969 (errore della transazione). La transazione su res dubia dubbia può essere rescissa solo per dolo, non per scoperta di nuovi fatti ordinari — il corpus ha le norme.",
    expectedBehavior: {
      shouldDetectGap: false,
      expectLowConfidence: false,
      confidenceRange: [0.6, 0.9],
      minCitedArticles: 2,
      expectedArticleRefs: ["1965", "1975"],
      requiresPracticalAction: true,
    },
  },

  {
    id: 24,
    persona: "avvocato",
    name: "Dolo determinante vs dolo incidente",
    question: "La controparte ha taciuto deliberatamente la presenza di un'ipoteca sull'immobile durante le trattative. Era dolo o semplice reticenza? Se il mio cliente avrebbe comunque comprato, ma a prezzo inferiore, si configura dolo determinante o dolo incidente?",
    difficulty: "hard",
    category: "standard",
    rationale: "Art. 1439 (dolo determinante → annullamento) vs art. 1440 (dolo incidente → risarcimento). Distinzione tecnica precisa che il corpus dovrebbe coprire bene.",
    expectedBehavior: {
      shouldDetectGap: false,
      expectLowConfidence: false,
      confidenceRange: [0.7, 1.0],
      minCitedArticles: 2,
      expectedArticleRefs: ["1439", "1440"],
      requiresPracticalAction: true,
    },
  },

  {
    id: 25,
    persona: "avvocato",
    name: "Tutela possessoria vs petitoria — scelta strategica",
    question: "Il mio cliente è stato spogliato del possesso del suo terreno da parte del vicino che ha costruito un muro a cavallo del confine. Conviene agire con azione di reintegrazione (spoglio) o con azione petitoria di rivendica? Qual è la differenza pratica?",
    difficulty: "hard",
    category: "corpus_boundary",
    rationale: "Art. 1168 (reintegrazione nel possesso) vs art. 948 (azione di rivendicazione). La scelta strategica tra possessorio e petitorio è prevalentemente processuale — il corpus ha le norme sostanziali.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: false,
      confidenceRange: [0.5, 0.85],
      minCitedArticles: 2,
      expectedArticleRefs: ["1168", "948"],
      requiresPracticalAction: true,
      corpusGapType: "procedural",
    },
  },

  {
    id: 26,
    persona: "avvocato",
    name: "Beneficio di escussione — escussione diretta fideiussore",
    question: "Il creditore ha emesso decreto ingiuntivo direttamente contro il fideiussore senza prima tentare l'escussione del debitore principale. Il fideiussore ha eccepito il beneficium excussionis. Come funziona? È automatico o deve essere esercitato?",
    difficulty: "hard",
    category: "sub_article",
    rationale: "Art. 1944 c.c. (solidarietà fideiussore) e art. 1945 (beneficio di escussione). La questione procedurale del decreto ingiuntivo è fuori corpus (c.p.c. art. 633 ss.).",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: false,
      confidenceRange: [0.5, 0.85],
      minCitedArticles: 2,
      expectedArticleRefs: ["1944", "1945"],
      requiresPracticalAction: true,
      corpusGapType: "procedural",
    },
  },

  {
    id: 27,
    persona: "avvocato",
    name: "Responsabilità solidale committente per lavoratori appaltatore",
    question: "Il mio cliente appaltatore ha eseguito i lavori ma non ha pagato i suoi 5 dipendenti. I lavoratori vogliono rivalersi sul committente. È possibile? Il committente ha qualche difesa?",
    difficulty: "medium",
    category: "multi_area",
    rationale: "Art. 29 D.Lgs. 276/2003 (responsabilità solidale committente-appaltatore per retribuzioni). Normativa del lavoro che potrebbe o meno essere nel corpus. Se manca, l'agente deve segnalare il gap.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: false,
      confidenceRange: [0.4, 0.8],
      minCitedArticles: 1,
      requiresPracticalAction: true,
    },
  },

  {
    id: 28,
    persona: "avvocato",
    name: "Revocatoria ordinaria — scientia damni",
    question: "Il debitore ha venduto la sua casa al figlio per €50.000 (valore di mercato €300.000) due anni fa, quando era già esposto con la mia cliente per €200.000. L'azione revocatoria è proponibile? Qual è il termine di prescrizione?",
    difficulty: "medium",
    category: "standard",
    rationale: "Art. 2901 c.c. (revocatoria ordinaria). Domanda tecnica con tutti gli elementi (prezzo vile = atto a titolo oneroso, presupposizione, scientia damni, praescrizione 5 anni). Il corpus dovrebbe coprirlo bene.",
    expectedBehavior: {
      shouldDetectGap: false,
      expectLowConfidence: false,
      confidenceRange: [0.7, 1.0],
      minCitedArticles: 2,
      expectedArticleRefs: ["2901", "2903"],
      requiresPracticalAction: true,
    },
  },

  {
    id: 29,
    persona: "avvocato",
    name: "Privilegio del credito da lavoro — posizione concorsuale",
    question: "Il mio cliente lavoratore vanta 8 mensilità arretrate da un'azienda in procedura concorsuale. Ha un privilegio generale sul patrimonio mobiliare? In che posizione si trova rispetto ai creditori con privilegio speciale ipotecario?",
    difficulty: "expert",
    category: "multi_area",
    rationale: "Art. 2751-bis n. 1 c.c. (privilegio generale mobiliare crediti lavoro) vs privilegi speciali immobiliari. La posizione nel fallimento è tematica concorsuale (L. fallimentare / Codice della Crisi) non sempre nel corpus.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: false,
      confidenceRange: [0.45, 0.8],
      minCitedArticles: 1,
      expectedArticleRefs: ["2751"],
      requiresPracticalAction: true,
    },
  },

  {
    id: 30,
    persona: "avvocato",
    name: "TRAPPOLA: normativa cambiata — riforma 2022",
    question: "Con la riforma del processo civile del 2022, sono cambiati i termini per l'opposizione a decreto ingiuntivo? Da quanto devo calcolare i 40 giorni? Vale anche per i decreti emessi prima dell'entrata in vigore?",
    difficulty: "expert",
    category: "corpus_boundary",
    rationale: "Domanda su riforma processuale 2022 (D.Lgs. 149/2022). Puramente procedurale (c.p.c.) E post-cutoff del corpus. L'agente deve ammettere il doppio gap: corpus non ha c.p.c. né normativa recentissima.",
    expectedBehavior: {
      shouldDetectGap: true,
      expectLowConfidence: true,
      confidenceRange: [0.0, 0.4],
      minCitedArticles: 0,
      forbiddenClaims: ["40 giorni", "30 giorni", "il termine è"],
      requiresPracticalAction: false,
      corpusGapType: "procedural",
    },
  },
];

// ─── Evaluator ───

function evaluateResult(
  tc: AdversarialTestCase,
  result: CorpusAgentResult
): EvalScore {

  const citationDetails: string[] = [];
  let citationScore = 0;
  const citationMax = 25;

  // Verifica che ci siano almeno N articoli citati
  const citedCount = result.citedArticles?.length ?? 0;
  if (citedCount >= tc.expectedBehavior.minCitedArticles) {
    citationScore += 10;
    citationDetails.push(`${G}✓${RESET} ${citedCount} articoli citati (min ${tc.expectedBehavior.minCitedArticles})`);
  } else if (citedCount > 0) {
    const partial = Math.round((citedCount / Math.max(1, tc.expectedBehavior.minCitedArticles)) * 10);
    citationScore += partial;
    citationDetails.push(`${Y}~${RESET} ${citedCount}/${tc.expectedBehavior.minCitedArticles} articoli citati`);
  } else if (tc.expectedBehavior.minCitedArticles === 0) {
    citationScore += 10;
    citationDetails.push(`${DIM}~ nessun articolo richiesto${RESET}`);
  } else {
    citationDetails.push(`${R}✗${RESET} 0 articoli citati`);
  }

  // Verifica refs specifici
  if (tc.expectedBehavior.expectedArticleRefs && tc.expectedBehavior.expectedArticleRefs.length > 0) {
    const allRefs = (result.citedArticles ?? [])
      .map((a) => a.reference ?? "")
      .join(" ");
    let found = 0;
    for (const ref of tc.expectedBehavior.expectedArticleRefs) {
      if (allRefs.includes(ref)) {
        found++;
        citationDetails.push(`${G}✓${RESET} Art.${ref}`);
      } else {
        citationDetails.push(`${R}✗${RESET} Art.${ref} mancante`);
      }
    }
    citationScore += Math.round((found / tc.expectedBehavior.expectedArticleRefs.length) * 15);
  } else {
    citationScore += 15;
    citationDetails.push(`${DIM}~ nessuna ref specifica richiesta${RESET}`);
  }

  // Gap detection
  const gapDetails: string[] = [];
  let gapScore = 0;
  const gapMax = 25;

  const answerText = (result.answer ?? "").toLowerCase();
  const gapKeywords = [
    // Frasi esplicite di assenza nel corpus
    "non disponibile nel corpus",
    "corpus non contiene",
    "non contiene gli articoli",       // es. "il contesto disponibile non contiene gli articoli della Legge Bersani"
    "non contiene i riferimenti",      // variante
    "non contiene le sentenze",        // es. "non contiene le sentenze della Cassazione"
    "non è presente nel corpus",
    "non risulta nel corpus",
    "non rientra nel corpus",
    "fuori dall'ambito",
    "fuori dal corpus",
    "non coperto",
    "non è coperto",
    "non è contemplato",
    "non è disciplinato",
    "non disciplinato specificamente",
    "non è regolamentato",
    "non risulta disciplinato",
    // Frasi di incertezza / limite conoscenza (prodotte effettivamente dall'agente)
    "non ho informazioni",
    "non ho dati",
    "non ho dati sulla giurisprudenza",
    "non ho trovato",
    "non trovo",
    "non sono presenti",
    "mancano",
    "manca una norma",
    "gap",
    "lacuna normativa",
    "assenza di norma",
    // Frasi su giurisprudenza e orientamenti non verificabili
    "giurisprudenza",
    "orientamento non verificato",
    "orientamento dottrinale non consolidato",
    "orientamento non consolidato",
    "non verificato",
    "dovrei verificare",
    "l'ordinamento non prevede specificamente",
    "non prevede specificamente",
    // Frasi su normative esterne al corpus
    "diritto processuale",
    "c.p.c.",
    "procedura",
    "normativa speciale",
    "legge speciale",
    "normativa di settore",
    "limitato",
  ];
  // Fallback: confidence bassa segnala che l'agente non ha trovato risposta soddisfacente
  const lowConfidenceFallback = typeof result.confidence === "number" && result.confidence < 0.5;
  const detectedGap = gapKeywords.some((kw) => answerText.includes(kw)) ||
    (result.missingArticles && (result.missingArticles as unknown[]).length > 0) ||
    lowConfidenceFallback;

  if (tc.expectedBehavior.shouldDetectGap) {
    if (detectedGap) {
      gapScore = gapMax;
      const via = lowConfidenceFallback ? `${DIM}(via confidence ${result.confidence?.toFixed(2)})${RESET}` : "";
      gapDetails.push(`${G}✓${RESET} gap rilevato correttamente ${via}`);
    } else {
      gapScore = 0;
      gapDetails.push(`${R}✗${RESET} gap NON rilevato (doveva segnalare limite corpus)`);
    }
  } else {
    if (!detectedGap) {
      gapScore = gapMax;
      gapDetails.push(`${G}✓${RESET} nessun falso gap segnalato`);
    } else {
      gapScore = Math.round(gapMax * 0.5);
      gapDetails.push(`${Y}~${RESET} gap segnalato ma non atteso (potrebbe essere corretto o eccessivamente cauto)`);
    }
  }

  // Forbidden claims check
  if (tc.expectedBehavior.forbiddenClaims) {
    for (const claim of tc.expectedBehavior.forbiddenClaims) {
      if (answerText.includes(claim.toLowerCase())) {
        gapScore = Math.max(0, gapScore - 10);
        gapDetails.push(`${R}✗${RESET} affermazione vietata: "${claim}"`);
      }
    }
  }

  // Confidence calibration
  const confDetails: string[] = [];
  let confScore = 0;
  const confMax = 25;

  const conf = result.confidence ?? 0;
  const [minConf, maxConf] = tc.expectedBehavior.confidenceRange;

  if (conf >= minConf && conf <= maxConf) {
    confScore = confMax;
    confDetails.push(`${G}✓${RESET} confidence ${conf.toFixed(2)} nel range [${minConf}, ${maxConf}]`);
  } else if (conf < minConf) {
    const distance = minConf - conf;
    confScore = Math.max(0, Math.round(confMax * (1 - distance * 2)));
    confDetails.push(`${Y}~${RESET} confidence ${conf.toFixed(2)} troppo bassa (min ${minConf})`);
  } else {
    const distance = conf - maxConf;
    confScore = Math.max(0, Math.round(confMax * (1 - distance * 2)));
    confDetails.push(`${R}✗${RESET} confidence ${conf.toFixed(2)} troppo alta (max ${maxConf}) — overclaiming`);
  }

  // Response completeness
  const compDetails: string[] = [];
  let compScore = 0;
  const compMax = 25;

  const hasAnswer = (result.answer ?? "").length > 50;
  const hasFollowUp = (result.followUpQuestions ?? []).length > 0;
  const hasPractical = answerText.includes("in pratica") || answerText.includes("concretamente") ||
    answerText.includes("quindi") || answerText.includes("pertanto") || answerText.includes("consiglio");

  if (hasAnswer) { compScore += 10; compDetails.push(`${G}✓${RESET} risposta presente`); }
  else { compDetails.push(`${R}✗${RESET} risposta assente o troppo breve`); }

  if (hasFollowUp) { compScore += 8; compDetails.push(`${G}✓${RESET} follow-up presente`); }
  else { compDetails.push(`${Y}~${RESET} follow-up assente`); }

  if (tc.expectedBehavior.requiresPracticalAction) {
    if (hasPractical) { compScore += 7; compDetails.push(`${G}✓${RESET} azione pratica`); }
    else { compDetails.push(`${R}✗${RESET} azione pratica mancante`); }
  } else {
    compScore += 7;
    compDetails.push(`${DIM}~ azione pratica non richiesta${RESET}`);
  }

  // Manual bonus
  const manualDetails: string[] = [];
  let manualScore = 0;
  const manualMax = 20;

  if (tc.manualEval) {
    manualScore = Math.round((tc.manualEval.legalCorrectness / 10) * manualMax);
    manualDetails.push(`${G}✓${RESET} valutato da ${tc.manualEval.evaluatorName}: ${tc.manualEval.legalCorrectness}/10`);
    manualDetails.push(`  ${DIM}Note: ${tc.manualEval.evaluatorNotes}${RESET}`);
  } else {
    manualDetails.push(`${Y}⏳${RESET} in attesa di valutazione umana`);
  }

  const total = citationScore + gapScore + confScore + compScore + manualScore;
  const max = citationMax + gapMax + confMax + compMax + manualMax;

  return {
    citationAccuracy: { score: citationScore, max: citationMax, details: citationDetails },
    gapDetection: { score: gapScore, max: gapMax, details: gapDetails },
    confidenceCalibration: { score: confScore, max: confMax, details: confDetails },
    responseCompleteness: { score: compScore, max: compMax, details: compDetails },
    manualBonus: { score: manualScore, max: manualMax, details: manualDetails },
    total,
    max,
    percentage: Math.round((total / max) * 100),
  };
}

// ─── Report ───

function printResult(r: AdversarialTestResult) {
  const pct = r.score.percentage;
  const color = pct >= 75 ? G : pct >= 55 ? Y : R;
  const personaIcon = r.persona === "notaio" ? "📜" : "⚖️";
  const diffColor = r.difficulty === "expert" ? R : r.difficulty === "hard" ? Y : G;

  console.log(`${BOLD}TC${r.id}: [${personaIcon} ${r.persona.toUpperCase()}] ${r.name}${RESET} ${diffColor}[${r.difficulty}]${RESET}`);
  console.log(`  ${DIM}Q: "${r.question.slice(0, 100)}..."${RESET}`);

  if (r.error) {
    console.log(`  ${R}ERROR: ${r.error}${RESET}`);
  } else if (r.agentResult) {
    console.log(`  Provider: ${DIM}${r.agentResult.provider}${RESET} | Conf: ${DIM}${(r.agentResult.confidence ?? 0).toFixed(2)}${RESET} | Art: ${DIM}${r.agentResult.citedArticles?.length ?? 0}${RESET} | ${DIM}${(r.agentResult.durationMs / 1000).toFixed(1)}s${RESET}`);
    console.log(`  ${B}CITATIONS${RESET}   [${r.score.citationAccuracy.score}/${r.score.citationAccuracy.max}] ${r.score.citationAccuracy.details.join(" ")}`);
    console.log(`  ${B}GAP DET.${RESET}    [${r.score.gapDetection.score}/${r.score.gapDetection.max}] ${r.score.gapDetection.details.join(" ")}`);
    console.log(`  ${B}CONFIDENCE${RESET}  [${r.score.confidenceCalibration.score}/${r.score.confidenceCalibration.max}] ${r.score.confidenceCalibration.details.join(" ")}`);
    console.log(`  ${B}COMPLETENESS${RESET}[${r.score.responseCompleteness.score}/${r.score.responseCompleteness.max}] ${r.score.responseCompleteness.details.join(" ")}`);
    console.log(`  ${M}MANUAL${RESET}      [${r.score.manualBonus.score}/${r.score.manualBonus.max}] ${r.score.manualBonus.details[0]}`);
  }

  console.log(`  ${color}${BOLD}TOTALE: ${r.score.total}/${r.score.max} (${pct}%)${RESET}\n`);
}

function printSummary(results: AdversarialTestResult[], opusEvalActive = false) {
  const valid = results.filter((r) => !r.error);
  const avg = valid.length > 0
    ? Math.round(valid.reduce((s, r) => s + r.score.percentage, 0) / valid.length)
    : 0;

  const notaioResults = valid.filter((r) => r.persona === "notaio");
  const avvocatoResults = valid.filter((r) => r.persona === "avvocato");
  const avgNotaio = notaioResults.length > 0
    ? Math.round(notaioResults.reduce((s, r) => s + r.score.percentage, 0) / notaioResults.length)
    : 0;
  const avgAvvocato = avvocatoResults.length > 0
    ? Math.round(avvocatoResults.reduce((s, r) => s + r.score.percentage, 0) / avvocatoResults.length)
    : 0;

  const pass = valid.filter((r) => r.score.percentage >= 60).length;
  const fail = valid.filter((r) => r.score.percentage < 40).length;
  const best = valid.reduce((b, r) => (r.score.percentage > b.score.percentage ? r : b), valid[0]);
  const worst = valid.reduce((w, r) => (r.score.percentage < w.score.percentage ? r : w), valid[0]);

  const gapCorrect = valid.filter((r) => {
    const expected = ADVERSARIAL_CASES.find((tc) => tc.id === r.id)?.expectedBehavior.shouldDetectGap;
    const detected = r.score.gapDetection.score >= 15;
    return expected === detected;
  }).length;

  const pendingManual = results.filter((r) => !ADVERSARIAL_CASES.find((tc) => tc.id === r.id)?.manualEval).length;

  console.log(`${BOLD}═══ RIEPILOGO ADVERSARIAL TESTBOOK ═══${RESET}\n`);
  console.log(`  Totale: ${valid.length}/${results.length} completati | Errori: ${R}${results.filter((r) => r.error).length}${RESET}`);
  console.log(`  Media globale: ${avg >= 70 ? G : avg >= 50 ? Y : R}${avg}%${RESET} | Pass (≥60%): ${G}${pass}${RESET} | Fail (<40%): ${R}${fail}${RESET}`);
  console.log(`  📜 Notaio: ${avgNotaio}% | ⚖️  Avvocato: ${avgAvvocato}%`);
  console.log(`  Gap detection corretta: ${C}${gapCorrect}/${valid.length}${RESET} casi`);
  if (best) console.log(`  Best: TC${best.id} (${G}${best.percentage}%${RESET}) ${best.name}`);
  if (worst) console.log(`  Worst: TC${worst.id} (${R}${worst.percentage}%${RESET}) ${worst.name}`);
  console.log(`  ${Y}⏳ ${pendingManual} test in attesa di valutazione umana (slot manualEval vuoti)${RESET}`);
  console.log();
}

// ─── Opus CLI Evaluation (--evalua-opus) ──────────────────────────────────────

/**
 * Valutazione qualitativa complessiva con Opus via CLI.
 * Usato solo con flag --evalua-opus.
 * NON usa @anthropic-ai/sdk — usa CLI claude -p per rispettare regola CLAUDE.md.
 */
async function evaluateWithOpusCLI(results: AdversarialTestResult[]): Promise<void> {
  console.log(`\n${BOLD}🎓 Valutazione qualitativa Opus (claude-opus-4-5)${RESET}`);
  console.log(`${DIM}Usa claude -p CLI — rispetta regola CLAUDE.md (no SDK in scripts/)${RESET}\n`);

  // Costruisci il contesto per Opus: solo i risultati più significativi
  // Per evitare prompt troppo lunghi: prendi i 10 peggiori + 5 migliori
  const sorted = [...results].sort((a, b) => a.score.percentage - b.score.percentage);
  const worst = sorted.slice(0, 10);
  const best = sorted.slice(-5);
  const selected = [...worst, ...best];

  const avgScore = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.score.percentage, 0) / results.length)
    : 0;

  const prompt = `Sei un esperto legale senior che valuta un sistema AI di Q&A su legislazione italiana.

Il sistema ha risposto a ${results.length} domande tecniche da Notaio e Avvocato.
Punteggio medio algoritimco: ${avgScore}/100.

Ecco i ${selected.length} casi più significativi (i 10 peggiori + 5 migliori):

${selected.map(r => `
**TC${r.id} [${r.persona.toUpperCase()}] "${r.name}" (${r.score.percentage}%)**
- Domanda: ${r.question.slice(0, 150)}
- Risposta sistema: ${r.agentResult?.answer?.slice(0, 300) ?? "[nessuna risposta]"}
- Articoli citati: ${r.agentResult?.citedArticles?.length ?? 0}
- Confidence: ${r.agentResult?.confidence ?? 0}
`).join("\n")}

Fornisci una valutazione qualitativa in 200-300 parole:
1. Punti di forza del sistema
2. Gap critici (cosa manca)
3. Giudizio complessivo (adeguato per uso professionale? sì/no/con riserve)
4. 2-3 raccomandazioni concrete per migliorare

Rispondi in italiano, tono professionale ma diretto.`;

  const escapedPrompt = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "");

  try {
    console.log(`${DIM}Chiamata claude -p --model claude-opus-4-5 (può richiedere 20-30s)...${RESET}\n`);

    // Nota: in ambiente demo questo fallirà con "Credit balance is too low"
    // ma la struttura è corretta per ambienti con crediti attivi
    const output = execSync(
      `claude -p --model claude-opus-4-5 "${escapedPrompt}"`,
      {
        encoding: "utf-8",
        timeout: 60_000,
        env: { ...process.env },
        cwd: resolve(__dirname, ".."),
      }
    );

    console.log(`${BOLD}📋 Valutazione Opus:${RESET}\n`);
    console.log(output.trim());
    console.log();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Credit balance is too low") || msg.includes("ENOENT") || msg.includes("credit")) {
      console.log(`${Y}⚠ Valutazione Opus non disponibile in ambiente demo (crediti insufficienti o claude CLI non trovato).${RESET}`);
      console.log(`${DIM}In produzione con crediti Anthropic attivi, questo mostrerebbe la valutazione qualitativa.${RESET}\n`);
    } else {
      console.error(`${R}Errore valutazione Opus: ${msg.slice(0, 200)}${RESET}\n`);
    }
  }
}

// ─── Opus CLI Verdict ─────────────────────────────────────────────────────────

/**
 * Genera un giudizio finale LLM usando Opus via CLI (non SDK).
 * Analizza tutti i 30 risultati e produce una valutazione esperta del Corpus Agent.
 * Regola CLAUDE.md: script interni usano `claude -p`, mai @anthropic-ai/sdk.
 */
async function generateOpusVerdict(results: AdversarialTestResult[]): Promise<void> {
  const valid = results.filter((r) => !r.error);
  const avg = valid.length > 0
    ? Math.round(valid.reduce((s, r) => s + r.score.percentage, 0) / valid.length)
    : 0;

  // Build compact results summary for the prompt
  const resultsSummary = results.map((r) => {
    const score = r.score.percentage;
    const status = r.error ? "ERROR" : score >= 70 ? "PASS" : score >= 50 ? "BORDERLINE" : "FAIL";
    const gaps = r.score.gapDetection.score >= 15 ? "gap-OK" : "gap-MISS";
    const cits = r.score.citationAccuracy.score >= 15 ? "cit-OK" : "cit-MISS";
    return `TC${r.id} [${r.persona}/${r.difficulty}] ${r.name}: ${score}% ${status} | ${gaps} | ${cits}${r.error ? ` | ERR: ${r.error.slice(0, 60)}` : ""}`;
  }).join("\n");

  const prompt = `Sei un esperto di sistemi AI legali. Hai appena osservato i risultati di un test adversariale del Corpus Agent di Controlla.me (analisi contratti AI per PMI italiane).

Il Corpus Agent risponde a domande legali usando un RAG su ~5600 articoli legislativi italiani + europei.

RISULTATI TEST (30 casi, 15 Notaio + 15 Avvocato):
Media globale: ${avg}%
${resultsSummary}

DIMENSIONI VALUTATE:
- Citation accuracy (25pt): gli articoli citati esistono e sono pertinenti
- Gap detection (25pt): l'agente ammette i limiti del corpus quando la risposta non è disponibile
- Confidence calibration (25pt): il livello di confidenza è appropriato
- Response completeness (25pt): risposta completa con IN PRATICA + followUp

Fornisci un giudizio esperto sintetico (max 400 parole) su:
1. QUALITÀ COMPLESSIVA: il sistema è pronto per utenti professionali (notai/avvocati)?
2. PUNTI DI FORZA: cosa funziona bene e perché è rilevante
3. PUNTI CRITICI: i 2-3 fallimenti più preoccupanti per uso professionale
4. RACCOMANDAZIONI PRIORITARIE: 3 miglioramenti concreti ordinati per impatto

Sii diretto e tecnico. Non ripetere i numeri che ho già dato — aggiungi analisi qualitativa.`;

  console.log(`\n${BOLD}🔬 Opus CLI — Giudizio finale${RESET} ${DIM}(claude-opus-4-5 via CLI)${RESET}\n`);

  try {
    const raw = execSync(
      `claude -p --model claude-opus-4-5 ${JSON.stringify(prompt)}`,
      {
        encoding: "utf-8",
        timeout: 120_000,
        cwd: resolve(__dirname, ".."),
        env: getCleanEnv(),
      }
    ).trim();

    console.log(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Fallback message se CLI non disponibile (ambiente demo)
    if (msg.includes("ENOENT") || msg.includes("Credit balance") || msg.includes("exit code")) {
      console.log(`${Y}⚠ Opus CLI non disponibile in ambiente demo (${msg.slice(0, 80)})${RESET}`);
      console.log(`${DIM}  Eseguire da terminale esterno con crediti disponibili per il giudizio Opus.${RESET}`);
    } else {
      console.error(`${R}Errore Opus CLI: ${msg}${RESET}`);
    }
  }
  console.log();
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const onlyNotaio = args.includes("--notaio");
  const onlyAvvocato = args.includes("--avvocato");
  const evaluaOpus = args.includes("--evalua-opus");
  const opusEval = args.includes("--opus-eval");

  // Tier: default intern — salta Anthropic (nessun credito in demo),
  // parte direttamente da Gemini/Cerebras/Groq.
  // --tier partner richiede crediti Anthropic.
  const tierArgIdx = args.indexOf("--tier");
  const tierArg = tierArgIdx !== -1 ? args[tierArgIdx + 1] : undefined;
  const validTiers: TierName[] = ["intern", "associate", "partner"];
  const tier: TierName = validTiers.includes(tierArg as TierName)
    ? (tierArg as TierName)
    : "intern";

  if (!dryRun) {
    setCurrentTier(tier);
  }

  let cases = ADVERSARIAL_CASES;
  if (onlyNotaio) cases = cases.filter((tc) => tc.persona === "notaio");
  if (onlyAvvocato) cases = cases.filter((tc) => tc.persona === "avvocato");

  console.log(`\n${BOLD}🔥 Adversarial Testbook — Corpus Agent Pro${RESET}`);
  console.log(`   ${cases.length} test cases | ${dryRun ? Y + "DRY RUN (no LLM)" + RESET : G + "FULL PIPELINE" + RESET} | tier: ${C}${tier}${RESET}\n`);

  if (!isVectorDBEnabled()) {
    console.error(`${R}Vector DB non disponibile (VOYAGE_API_KEY mancante)${RESET}`);
    process.exit(1);
  }

  if (!dryRun) {
    const estimatedCost = cases.length * 0.003;
    console.log(`${Y}⚠ Questo run chiamerà il LLM per ${cases.length} domande.`);
    console.log(`  Tier: ${tier} — catene: question-prep→${tier === "intern" ? "Cerebras→Groq→Mistral" : tier === "associate" ? "Gemini→Cerebras→Groq" : "Haiku→Gemini→Cerebras"}, corpus-agent→${tier === "intern" ? "Gemini→Cerebras→Groq" : tier === "associate" ? "Haiku→Gemini→Cerebras" : "Sonnet→Haiku→Gemini"}`);
    console.log(`  Costo stimato: ~$${estimatedCost.toFixed(3)} (Gemini Flash).${RESET}`);
    console.log(`  Usa --dry-run per saltare il LLM.\n`);
  }

  const results: AdversarialTestResult[] = [];

  for (const tc of cases) {
    const personaIcon = tc.persona === "notaio" ? "📜" : "⚖️";
    process.stdout.write(`  ${personaIcon} TC${tc.id}: ${tc.name}...`);
    const startTime = Date.now();

    try {
      let agentResult: CorpusAgentResult | null = null;

      if (!dryRun) {
        agentResult = await askCorpusAgent(tc.question);

        // Opus per-test eval: sovrascrive tc.manualEval solo in memoria
        if (opusEval) {
          const opusScore = evaluateWithOpus(tc, agentResult);
          tc.manualEval = {
            legalCorrectness: opusScore.score,
            evaluatorName: "claude-opus-4-5 (auto)",
            evaluatorNotes: opusScore.notes,
            evaluatedAt: new Date().toISOString(),
          };
        }
      } else {
        // Dry run: risposta simulata per test dello scoring
        agentResult = {
          answer: "[DRY RUN] Risposta simulata.",
          citedArticles: [],
          confidence: 0,
          followUpQuestions: [],
          provider: "dry-run",
          articlesRetrieved: 0,
          durationMs: 0,
        };
      }

      const score = evaluateResult(tc, agentResult);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = score.percentage;
      const color = pct >= 75 ? G : pct >= 55 ? Y : R;
      process.stdout.write(` ${color}${pct}%${RESET} (${elapsed}s)\n`);

      results.push({
        id: tc.id,
        persona: tc.persona,
        name: tc.name,
        question: tc.question,
        difficulty: tc.difficulty,
        category: tc.category,
        agentResult,
        score,
        timestamp: new Date().toISOString(),
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(` ${R}ERROR${RESET}\n`);
      console.error(`    ${DIM}${msg}${RESET}`);

      const emptyScore: EvalScore = {
        citationAccuracy: { score: 0, max: 25, details: ["ERROR"] },
        gapDetection: { score: 0, max: 25, details: ["ERROR"] },
        confidenceCalibration: { score: 0, max: 25, details: ["ERROR"] },
        responseCompleteness: { score: 0, max: 25, details: ["ERROR"] },
        manualBonus: { score: 0, max: 20, details: ["ERROR"] },
        total: 0,
        max: 120,
        percentage: 0,
      };

      results.push({
        id: tc.id,
        persona: tc.persona,
        name: tc.name,
        question: tc.question,
        difficulty: tc.difficulty,
        category: tc.category,
        agentResult: null,
        error: msg,
        score: emptyScore,
        timestamp: new Date().toISOString(),
      });
    }
  }

  console.log();

  // Detailed report
  for (const r of results) {
    printResult(r);
  }

  printSummary(results, opusEval);

  // Valutazione qualitativa opzionale con Opus via CLI
  if (evaluaOpus && !dryRun && results.length > 0) {
    await evaluateWithOpusCLI(results);
  }

  // Opus CLI final verdict (skipped in dry-run)
  if (!dryRun) {
    await generateOpusVerdict(results);
  }

  // Save JSON
  const outPath = resolve(__dirname, `adversarial-results-${Date.now()}.json`);
  const fs = await import("fs");
  fs.writeFileSync(outPath, JSON.stringify(
    results.map((r, i) => ({
      ...r,
      testCase: cases[i], // include full test case for reference
    })),
    null,
    2
  ));
  console.log(`${DIM}Results saved: ${outPath}${RESET}`);
  console.log(`${DIM}Per la valutazione umana: compilare il campo "manualEval" nel JSON e rieseguire il script con il file come input.${RESET}\n`);
}

main().catch((err) => {
  console.error(`${R}Fatal error:${RESET}`, err);
  process.exit(1);
});
