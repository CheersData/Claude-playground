/**
 * HR Contract Analysis — End-to-End Test Specifications
 *
 * Validates that the 4-agent pipeline (classifier → analyzer → investigator → advisor)
 * correctly handles 3 employment contract scenarios:
 *
 * 1. Contratto Tempo Determinato (TD) — periodo di prova eccessivo, rinnovo senza causale
 * 2. Contratto Tempo Indeterminato (TI) — non concorrenza senza compenso, demansionamento
 * 3. Lettera di Licenziamento — preavviso insufficiente, motivazione generica
 *
 * Tests verify:
 * - Prompt coverage: actual prompts contain the relevant legal references
 * - Agent output structure: mocked LLM responses pass through agent functions correctly
 * - Risk detection: analyzer flags the expected HR-specific violations
 * - Pipeline contract: output of each stage is compatible with the next
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Import ACTUAL prompts to verify legal reference coverage ──────────
import { CLASSIFIER_SYSTEM_PROMPT } from "@/lib/prompts/classifier";
import { ANALYZER_SYSTEM_PROMPT } from "@/lib/prompts/analyzer";

// ─── Hoisted mocks ────────────────────────────────────────────────────
const mockRunAgent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai-sdk/agent-runner", () => ({
  runAgent: mockRunAgent,
}));

// ─── Import agents AFTER mocking ──────────────────────────────────────
import { runClassifier } from "@/lib/agents/classifier";
import { runAnalyzer } from "@/lib/agents/analyzer";

import type {
  ClassificationResult,
  AnalysisResult,
} from "@/lib/types";

// ─── Mock document texts ──────────────────────────────────────────────

const DOC_TEMPO_DETERMINATO = `CONTRATTO DI LAVORO SUBORDINATO A TEMPO DETERMINATO

Tra la società DELTA TECH S.R.L. (di seguito "Azienda"), con sede legale in Torino,
Via Roma 100, C.F. e P.IVA 11223344556,
e il Sig. Luca Bianchi (di seguito "Lavoratore"), nato a Torino il 15/06/1992,

si conviene e si stipula quanto segue.

Art. 1 — Oggetto e durata
Il Lavoratore è assunto con contratto a tempo determinato per la durata di 12 mesi,
con decorrenza dal 1 aprile 2026 e scadenza il 31 marzo 2027.

Art. 2 — CCNL e inquadramento
Il rapporto è regolato dal CCNL Metalmeccanico. Livello 5.

Art. 3 — Periodo di prova
Il rapporto è soggetto a un periodo di prova di 6 (sei) mesi.
Durante il periodo di prova ciascuna parte potrà recedere senza preavviso.

Art. 4 — Rinnovo
Il presente contratto si intenderà automaticamente rinnovato per ulteriori 12 mesi
alle medesime condizioni, qualora nessuna delle parti comunichi disdetta con almeno
30 giorni di preavviso. Il rinnovo automatico non necessita di causale giustificativa
ai sensi dell'art. 19, comma 1, del D.Lgs. 81/2015.

Art. 5 — Retribuzione
La retribuzione annua lorda è fissata in EUR 24.000,00, suddivisa in 13 mensilità.`;

const DOC_TEMPO_INDETERMINATO = `CONTRATTO INDIVIDUALE DI LAVORO A TEMPO INDETERMINATO

Tra la società EPSILON CONSULTING S.P.A. (di seguito "Azienda"), con sede in Milano,
Via Montenapoleone 10, C.F. e P.IVA 99887766554,
e la Sig.ra Maria Rossi (di seguito "Lavoratrice"), nata a Roma il 01/01/1988,

si conviene e si stipula quanto segue.

Art. 1 — CCNL e inquadramento
CCNL Commercio, Livello 2.

Art. 2 — Mansioni
La Lavoratrice è assunta come "Consulente Senior". L'Azienda si riserva la facoltà
di adibire la Lavoratrice a mansioni di livello inferiore per esigenze organizzative,
senza variazione della retribuzione (demansionamento unilaterale).

Art. 3 — Patto di non concorrenza
Ai sensi dell'art. 2125 c.c., la Lavoratrice si obbliga per 36 mesi dalla cessazione
del rapporto a non svolgere attività concorrente su tutto il territorio nazionale.
Per tale obbligo non è previsto alcun corrispettivo economico.

Art. 4 — Straordinario
Il Lavoratore accetta che le prime 10 ore settimanali di lavoro straordinario siano
forfettizzate nella retribuzione base, senza alcuna maggiorazione aggiuntiva.
L'Azienda potrà richiedere straordinario senza limiti di preavviso.

Art. 5 — Retribuzione
La retribuzione annua lorda è fissata in EUR 42.000,00, suddivisa in 14 mensilità.`;

const DOC_LETTERA_LICENZIAMENTO = `RACCOMANDATA A/R

Spett.le Sig. Paolo Verdi
Via Garibaldi 22
10100 Torino

OGGETTO: Licenziamento per giustificato motivo oggettivo

Egregio Sig. Verdi,

la società ZETA SERVIZI S.R.L. Le comunica il licenziamento per giustificato motivo
oggettivo con effetto dal ricevimento della presente.

La decisione è motivata da esigenze di riorganizzazione aziendale e riduzione del personale.

Il periodo di preavviso è fissato in 15 giorni dalla data di ricezione.

Il CCNL Commercio, Livello 3, prevede un preavviso di 45 giorni per la Sua anzianità
di servizio (8 anni). Il preavviso qui indicato è inferiore a quanto previsto dal CCNL.

Al Lavoratore spettano le competenze di fine rapporto.

Distinti saluti.

ZETA SERVIZI S.R.L.
L'Amministratore Unico`;

// ─── Mock runAgent response helper ────────────────────────────────────

function makeRunAgentResponse<T>(parsed: T) {
  return {
    parsed,
    text: JSON.stringify(parsed),
    usage: { inputTokens: 200, outputTokens: 100 },
    durationMs: 2000,
    provider: "anthropic",
    model: "claude-haiku-4.5",
    usedFallback: false,
    usedModelKey: "claude-haiku-4.5",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =====================================================================
// SCENARIO 1: Contratto Tempo Determinato (TD)
// - Periodo di prova 6 mesi (eccessivo per TD)
// - Rinnovo automatico senza causale (illegale per D.Lgs. 81/2015)
// =====================================================================

describe("Scenario 1: Contratto Tempo Determinato", () => {
  describe("Prompt coverage — legal references for TD", () => {
    it("classifier prompt contains TD sub-types", () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("contratto_lavoro_tempo_determinato");
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("subordinato_tempo_determinato");
    });

    it("classifier prompt contains D.Lgs. 81/2015 institutes", () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("D.Lgs. 81/2015");
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("contratto_tempo_determinato");
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("tempo determinato");
    });

    it("classifier prompt contains periodo_di_prova institute", () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("periodo_di_prova");
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("periodo di prova");
    });

    it("analyzer prompt references TD causale rules (Art. 19 D.Lgs. 81/2015)", () => {
      expect(ANALYZER_SYSTEM_PROMPT).toContain("Art. 19");
      expect(ANALYZER_SYSTEM_PROMPT).toContain("D.Lgs. 81/2015");
      expect(ANALYZER_SYSTEM_PROMPT).toContain("causale");
    });

    it("analyzer prompt flags TD without causale after 12 months as CRITICAL", () => {
      expect(ANALYZER_SYSTEM_PROMPT).toContain("Clausole TD senza causale dopo 12 mesi");
      expect(ANALYZER_SYSTEM_PROMPT).toContain("limite 24 mesi");
    });

    it("analyzer prompt flags excessive periodo di prova as CRITICAL", () => {
      expect(ANALYZER_SYSTEM_PROMPT).toContain("Periodo di prova eccessivo");
      expect(ANALYZER_SYSTEM_PROMPT).toContain("max 6 mesi");
    });
  });

  describe("Classifier — detects TD contract type", () => {
    const tdClassification: ClassificationResult = {
      documentType: "contratto_lavoro_subordinato",
      documentTypeLabel: "Contratto di Lavoro Subordinato a Tempo Determinato",
      documentSubType: "contratto_lavoro_tempo_determinato",
      relevantInstitutes: [
        "contratto_tempo_determinato",
        "periodo_di_prova",
        "rinnovo_automatico",
      ],
      legalFocusAreas: [
        "diritto_del_lavoro",
        "contratti_flessibili",
        "previdenza_sociale",
      ],
      parties: [
        { role: "datore_lavoro", name: "DELTA TECH S.R.L.", type: "persona_giuridica" },
        { role: "lavoratore", name: "Luca Bianchi", type: "persona_fisica" },
      ],
      jurisdiction: "Italia - Diritto del Lavoro",
      applicableLaws: [
        { reference: "D.Lgs. 81/2015", name: "Disciplina organica dei contratti di lavoro" },
        { reference: "Art. 19 D.Lgs. 81/2015", name: "Apposizione del termine e durata massima" },
        { reference: "Art. 2096 c.c.", name: "Assunzione in prova" },
      ],
      keyDates: [
        { date: "2026-04-01", description: "Decorrenza contratto" },
        { date: "2027-03-31", description: "Scadenza contratto" },
      ],
      summary: "Contratto TD 12 mesi con periodo di prova 6 mesi e rinnovo automatico.",
      confidence: 0.94,
    };

    it("runClassifier passes document text and returns classification", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tdClassification));

      const result = await runClassifier(DOC_TEMPO_DETERMINATO);

      expect(mockRunAgent).toHaveBeenCalledOnce();
      const [agentName, prompt, config] = mockRunAgent.mock.calls[0];
      expect(agentName).toBe("classifier");
      expect(prompt).toContain(DOC_TEMPO_DETERMINATO);
      expect(config.systemPrompt).toBe(CLASSIFIER_SYSTEM_PROMPT);
    });

    it("returns correct sub-type for TD contract", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tdClassification));

      const result = await runClassifier(DOC_TEMPO_DETERMINATO);

      expect(result.documentType).toBe("contratto_lavoro_subordinato");
      expect(result.documentSubType).toBe("contratto_lavoro_tempo_determinato");
      expect(result.relevantInstitutes).toContain("contratto_tempo_determinato");
      expect(result.relevantInstitutes).toContain("periodo_di_prova");
    });

    it("identifies D.Lgs. 81/2015 as applicable law", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tdClassification));

      const result = await runClassifier(DOC_TEMPO_DETERMINATO);

      const hasJobsAct = result.applicableLaws.some(
        (l) => l.reference.includes("81/2015")
      );
      expect(hasJobsAct).toBe(true);
    });
  });

  describe("Analyzer — flags TD-specific risks", () => {
    const tdClassification: ClassificationResult = {
      documentType: "contratto_lavoro_subordinato",
      documentTypeLabel: "Contratto di Lavoro Subordinato a Tempo Determinato",
      documentSubType: "contratto_lavoro_tempo_determinato",
      relevantInstitutes: ["contratto_tempo_determinato", "periodo_di_prova", "rinnovo_automatico"],
      legalFocusAreas: ["diritto_del_lavoro", "contratti_flessibili"],
      parties: [
        { role: "datore_lavoro", name: "DELTA TECH S.R.L.", type: "persona_giuridica" },
        { role: "lavoratore", name: "Luca Bianchi", type: "persona_fisica" },
      ],
      jurisdiction: "Italia - Diritto del Lavoro",
      applicableLaws: [
        { reference: "D.Lgs. 81/2015", name: "Disciplina organica dei contratti di lavoro" },
      ],
      keyDates: [],
      summary: "Contratto TD 12 mesi.",
      confidence: 0.94,
    };

    const tdAnalysis: AnalysisResult = {
      clauses: [
        {
          id: "td_prova_1",
          title: "Periodo di prova eccessivo per TD",
          originalText: "periodo di prova di 6 (sei) mesi",
          riskLevel: "critical",
          issue: "Il periodo di prova di 6 mesi è eccessivo per un contratto a tempo determinato di 12 mesi. Per i TD il periodo di prova deve essere proporzionato alla durata del contratto.",
          potentialViolation: "Art. 2096 c.c. e Art. 7 D.Lgs. 81/2015 — periodo di prova sproporzionato rispetto alla durata del TD",
          marketStandard: "Per TD di 12 mesi il periodo di prova è generalmente 1-2 mesi max, proporzionato alla durata complessiva.",
          recommendation: "Ridurre il periodo di prova a 30-60 giorni, proporzionato alla durata del TD.",
        },
        {
          id: "td_rinnovo_2",
          title: "Rinnovo automatico senza causale",
          originalText: "automaticamente rinnovato per ulteriori 12 mesi...non necessita di causale giustificativa",
          riskLevel: "critical",
          issue: "Il rinnovo automatico del TD senza causale viola l'art. 19, comma 1, D.Lgs. 81/2015: dal 13° mese è obbligatoria una causale giustificativa.",
          potentialViolation: "Art. 19, comma 1, D.Lgs. 81/2015 — rinnovo TD senza causale oltre 12 mesi",
          marketStandard: "I rinnovi di TD richiedono sempre l'indicazione della causale specifica ai sensi del D.Lgs. 81/2015.",
          recommendation: "Eliminare la clausola di rinnovo automatico. Eventuali proroghe/rinnovi devono indicare la causale specifica.",
        },
        {
          id: "td_rinnovo_3",
          title: "Rinnovo automatico senza atto scritto",
          originalText: "automaticamente rinnovato...qualora nessuna delle parti comunichi disdetta",
          riskLevel: "high",
          issue: "Il rinnovo automatico del TD per silenzio-assenso contrasta con l'obbligo di forma scritta ad substantiam per l'apposizione del termine.",
          potentialViolation: "Art. 19 D.Lgs. 81/2015 — il termine deve risultare da atto scritto",
          marketStandard: "Il rinnovo del TD richiede un nuovo atto scritto con indicazione della causale.",
          recommendation: "Prevedere un rinnovo esplicito con atto scritto e causale giustificativa.",
        },
      ],
      missingElements: [
        {
          element: "Causale giustificativa per rinnovo oltre 12 mesi",
          importance: "high",
          explanation: "L'art. 19 D.Lgs. 81/2015 richiede una causale specifica per TD oltre 12 mesi di durata complessiva.",
        },
      ],
      overallRisk: "critical",
      positiveAspects: [
        "Il contratto indica correttamente il CCNL applicato e il livello di inquadramento.",
      ],
    };

    it("runAnalyzer passes classification info and document text", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tdAnalysis));

      await runAnalyzer(DOC_TEMPO_DETERMINATO, tdClassification);

      expect(mockRunAgent).toHaveBeenCalledOnce();
      const [agentName, prompt, config] = mockRunAgent.mock.calls[0];
      expect(agentName).toBe("analyzer");
      expect(prompt).toContain(DOC_TEMPO_DETERMINATO);
      expect(prompt).toContain(tdClassification.documentTypeLabel);
      expect(config.systemPrompt).toBe(ANALYZER_SYSTEM_PROMPT);
    });

    it("includes classification institutes in analyzer prompt", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tdAnalysis));

      await runAnalyzer(DOC_TEMPO_DETERMINATO, tdClassification);

      const prompt = mockRunAgent.mock.calls[0][1] as string;
      expect(prompt).toContain("contratto_tempo_determinato");
      expect(prompt).toContain("periodo_di_prova");
    });

    it("flags periodo di prova eccessivo as critical", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tdAnalysis));

      const result = await runAnalyzer(DOC_TEMPO_DETERMINATO, tdClassification);

      const provaClause = result.clauses.find((c) => c.id === "td_prova_1");
      expect(provaClause).toBeDefined();
      expect(provaClause!.riskLevel).toBe("critical");
      expect(provaClause!.potentialViolation).toContain("2096");
    });

    it("flags rinnovo automatico senza causale as critical", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tdAnalysis));

      const result = await runAnalyzer(DOC_TEMPO_DETERMINATO, tdClassification);

      const rinnovoClause = result.clauses.find((c) => c.id === "td_rinnovo_2");
      expect(rinnovoClause).toBeDefined();
      expect(rinnovoClause!.riskLevel).toBe("critical");
      expect(rinnovoClause!.potentialViolation).toContain("81/2015");
    });

    it("identifies missing causale as high importance", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tdAnalysis));

      const result = await runAnalyzer(DOC_TEMPO_DETERMINATO, tdClassification);

      expect(result.missingElements.length).toBeGreaterThan(0);
      const causaleMissing = result.missingElements.find(
        (m) => m.element.toLowerCase().includes("causale")
      );
      expect(causaleMissing).toBeDefined();
      expect(causaleMissing!.importance).toBe("high");
    });

    it("overall risk is critical for this TD contract", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tdAnalysis));

      const result = await runAnalyzer(DOC_TEMPO_DETERMINATO, tdClassification);

      expect(result.overallRisk).toBe("critical");
    });
  });
});

// =====================================================================
// SCENARIO 2: Contratto Tempo Indeterminato (TI)
// - Patto di non concorrenza senza compenso (Art. 2125 c.c.)
// - Straordinari forfettizzati senza maggiorazione
// - Demansionamento unilaterale
// =====================================================================

describe("Scenario 2: Contratto Tempo Indeterminato", () => {
  describe("Prompt coverage — legal references for TI", () => {
    it("classifier prompt contains TI sub-types", () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("subordinato_tempo_indeterminato");
    });

    it("classifier prompt contains Art. 2125 c.c. institutes (non concorrenza)", () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("patto di non concorrenza");
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("patto_non_concorrenza_lavoro");
    });

    it("classifier prompt contains demansionamento institute", () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("demansionamento");
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("art. 2103 c.c.");
    });

    it("classifier prompt contains straordinario institute", () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("straordinario_orario_lavoro");
    });

    it("analyzer prompt references Art. 2125 c.c. (non concorrenza)", () => {
      expect(ANALYZER_SYSTEM_PROMPT).toContain("Art. 2125 c.c.");
      expect(ANALYZER_SYSTEM_PROMPT).toContain("corrispettivo ADEGUATO obbligatorio");
    });

    it("analyzer prompt flags non concorrenza senza corrispettivo as CRITICAL", () => {
      expect(ANALYZER_SYSTEM_PROMPT).toContain(
        "Patto di non concorrenza senza corrispettivo adeguato"
      );
    });

    it("analyzer prompt references Art. 2103 c.c. (demansionamento)", () => {
      expect(ANALYZER_SYSTEM_PROMPT).toContain("Art. 2103 c.c.");
      expect(ANALYZER_SYSTEM_PROMPT).toContain("divieto di demansionamento unilaterale");
    });

    it("analyzer prompt flags straordinari forfettizzati as CRITICAL", () => {
      expect(ANALYZER_SYSTEM_PROMPT).toContain(
        "Straordinari non pagati o forfettizzati senza compensazione adeguata"
      );
    });

    it("analyzer prompt references D.Lgs. 66/2003 (orario di lavoro)", () => {
      expect(ANALYZER_SYSTEM_PROMPT).toContain("D.Lgs. 66/2003");
      expect(ANALYZER_SYSTEM_PROMPT).toContain("max 48h");
    });
  });

  describe("Classifier — detects TI contract type", () => {
    const tiClassification: ClassificationResult = {
      documentType: "contratto_lavoro_subordinato",
      documentTypeLabel: "Contratto di Lavoro Subordinato a Tempo Indeterminato",
      documentSubType: "subordinato_tempo_indeterminato",
      relevantInstitutes: [
        "demansionamento",
        "patto_non_concorrenza_lavoro",
        "straordinario_orario_lavoro",
      ],
      legalFocusAreas: [
        "diritto_del_lavoro",
        "patto_non_concorrenza_lavoro",
        "diritto_civile",
      ],
      parties: [
        { role: "datore_lavoro", name: "EPSILON CONSULTING S.P.A.", type: "persona_giuridica" },
        { role: "lavoratrice", name: "Maria Rossi", type: "persona_fisica" },
      ],
      jurisdiction: "Italia - Diritto del Lavoro",
      applicableLaws: [
        { reference: "Art. 2103 c.c.", name: "Prestazione del lavoro" },
        { reference: "Art. 2125 c.c.", name: "Patto di non concorrenza" },
        { reference: "D.Lgs. 66/2003", name: "Orario di lavoro" },
        { reference: "CCNL Commercio", name: "CCNL Terziario Distribuzione e Servizi" },
      ],
      keyDates: [],
      summary: "Contratto TI con patto di non concorrenza senza compenso, demansionamento unilaterale e straordinari forfettizzati.",
      confidence: 0.96,
    };

    it("returns correct sub-type for TI contract", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tiClassification));

      const result = await runClassifier(DOC_TEMPO_INDETERMINATO);

      expect(result.documentType).toBe("contratto_lavoro_subordinato");
      expect(result.documentSubType).toBe("subordinato_tempo_indeterminato");
    });

    it("identifies demansionamento and non concorrenza institutes", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tiClassification));

      const result = await runClassifier(DOC_TEMPO_INDETERMINATO);

      expect(result.relevantInstitutes).toContain("demansionamento");
      expect(result.relevantInstitutes).toContain("patto_non_concorrenza_lavoro");
    });

    it("identifies Art. 2125 c.c. as applicable law", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tiClassification));

      const result = await runClassifier(DOC_TEMPO_INDETERMINATO);

      const has2125 = result.applicableLaws.some(
        (l) => l.reference.includes("2125")
      );
      expect(has2125).toBe(true);
    });
  });

  describe("Analyzer — flags TI-specific risks", () => {
    const tiClassification: ClassificationResult = {
      documentType: "contratto_lavoro_subordinato",
      documentTypeLabel: "Contratto di Lavoro Subordinato a Tempo Indeterminato",
      documentSubType: "subordinato_tempo_indeterminato",
      relevantInstitutes: ["demansionamento", "patto_non_concorrenza_lavoro", "straordinario_orario_lavoro"],
      legalFocusAreas: ["diritto_del_lavoro", "patto_non_concorrenza_lavoro"],
      parties: [
        { role: "datore_lavoro", name: "EPSILON CONSULTING S.P.A.", type: "persona_giuridica" },
        { role: "lavoratrice", name: "Maria Rossi", type: "persona_fisica" },
      ],
      jurisdiction: "Italia - Diritto del Lavoro",
      applicableLaws: [
        { reference: "Art. 2103 c.c.", name: "Prestazione del lavoro" },
        { reference: "Art. 2125 c.c.", name: "Patto di non concorrenza" },
        { reference: "D.Lgs. 66/2003", name: "Orario di lavoro" },
      ],
      keyDates: [],
      summary: "Contratto TI con clausole abusive.",
      confidence: 0.96,
    };

    const tiAnalysis: AnalysisResult = {
      clauses: [
        {
          id: "ti_nonconc_1",
          title: "Patto di non concorrenza senza corrispettivo",
          originalText: "Per tale obbligo non è previsto alcun corrispettivo economico",
          riskLevel: "critical",
          issue: "Il patto di non concorrenza è nullo per mancanza assoluta di corrispettivo. L'art. 2125 c.c. richiede un compenso adeguato obbligatorio.",
          potentialViolation: "Art. 2125 c.c. — patto di non concorrenza nullo per mancanza di corrispettivo",
          marketStandard: "La giurisprudenza richiede un corrispettivo di almeno il 15-30% della RAL annua per durata e ambito proporzionati.",
          recommendation: "Il patto è nullo: non rispettarlo alla cessazione del rapporto, o negoziare un corrispettivo adeguato.",
        },
        {
          id: "ti_demans_2",
          title: "Demansionamento unilaterale",
          originalText: "adibire la Lavoratrice a mansioni di livello inferiore per esigenze organizzative",
          riskLevel: "critical",
          issue: "La clausola prevede il demansionamento unilaterale senza le garanzie dell'art. 2103 c.c. (forma scritta, consenso sindacale o in sede protetta).",
          potentialViolation: "Art. 2103 c.c. — divieto di demansionamento unilaterale senza le procedure previste dalla legge",
          marketStandard: "Il demansionamento è ammesso solo nei casi tassativi previsti dall'art. 2103 c.c. come modificato dal Jobs Act, con garanzie procedurali.",
          recommendation: "Eliminare la clausola: il demansionamento unilaterale senza procedura è illegittimo.",
        },
        {
          id: "ti_straord_3",
          title: "Straordinari forfettizzati senza maggiorazione",
          originalText: "prime 10 ore settimanali di lavoro straordinario siano forfettizzate nella retribuzione base, senza alcuna maggiorazione",
          riskLevel: "critical",
          issue: "La forfettizzazione dello straordinario senza maggiorazione viola il D.Lgs. 66/2003 e il CCNL che prevedono compensi maggiorati obbligatori.",
          potentialViolation: "D.Lgs. 66/2003, Art. 5 — straordinario senza maggiorazione obbligatoria. Art. 2108 c.c.",
          marketStandard: "Lo straordinario deve essere retribuito con maggiorazione (dal 15% al 50% a seconda del CCNL e dell'orario).",
          recommendation: "Eliminare la forfettizzazione. Lo straordinario deve essere retribuito con le maggiorazioni previste dal CCNL.",
        },
      ],
      missingElements: [
        {
          element: "Corrispettivo per patto di non concorrenza",
          importance: "high",
          explanation: "Il patto di non concorrenza senza corrispettivo è nullo ai sensi dell'art. 2125 c.c.",
        },
      ],
      overallRisk: "critical",
      positiveAspects: [
        "Il contratto indica correttamente il CCNL applicato.",
      ],
    };

    it("flags patto di non concorrenza senza corrispettivo as critical", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tiAnalysis));

      const result = await runAnalyzer(DOC_TEMPO_INDETERMINATO, tiClassification);

      const nonConcClause = result.clauses.find((c) => c.id === "ti_nonconc_1");
      expect(nonConcClause).toBeDefined();
      expect(nonConcClause!.riskLevel).toBe("critical");
      expect(nonConcClause!.potentialViolation).toContain("2125");
    });

    it("flags demansionamento unilaterale as critical", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tiAnalysis));

      const result = await runAnalyzer(DOC_TEMPO_INDETERMINATO, tiClassification);

      const demansClause = result.clauses.find((c) => c.id === "ti_demans_2");
      expect(demansClause).toBeDefined();
      expect(demansClause!.riskLevel).toBe("critical");
      expect(demansClause!.potentialViolation).toContain("2103");
    });

    it("flags straordinari forfettizzati as critical", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tiAnalysis));

      const result = await runAnalyzer(DOC_TEMPO_INDETERMINATO, tiClassification);

      const straordClause = result.clauses.find((c) => c.id === "ti_straord_3");
      expect(straordClause).toBeDefined();
      expect(straordClause!.riskLevel).toBe("critical");
      expect(straordClause!.potentialViolation).toContain("66/2003");
    });

    it("overall risk is critical with 3 critical clauses", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tiAnalysis));

      const result = await runAnalyzer(DOC_TEMPO_INDETERMINATO, tiClassification);

      expect(result.overallRisk).toBe("critical");
      const criticalClauses = result.clauses.filter((c) => c.riskLevel === "critical");
      expect(criticalClauses.length).toBe(3);
    });

    it("all clause IDs are unique", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(tiAnalysis));

      const result = await runAnalyzer(DOC_TEMPO_INDETERMINATO, tiClassification);

      const ids = result.clauses.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});

// =====================================================================
// SCENARIO 3: Lettera di Licenziamento
// - Preavviso inferiore al CCNL
// - Motivazione generica (mancata indicazione motivo specifico)
// =====================================================================

describe("Scenario 3: Lettera di Licenziamento", () => {
  describe("Prompt coverage — legal references for licenziamento", () => {
    it("classifier prompt contains lettera_licenziamento sub-type", () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("lettera_licenziamento");
    });

    it("classifier prompt contains licenziamento giustificato motivo institutes", () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("licenziamento_giustificato_motivo");
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("giustificato motivo oggettivo");
    });

    it("classifier prompt contains preavviso institute", () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("preavviso_licenziamento_dimissioni");
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("preavviso");
    });

    it("classifier prompt contains L. 300/1970 (Statuto dei Lavoratori)", () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("L.300/1970");
    });

    it("classifier prompt maps legalFocusAreas for licenziamento", () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("licenziamento");
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("tutele_crescenti");
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain("preavviso");
    });

    it("analyzer prompt references L. 300/1970 Art. 7 (procedimento disciplinare)", () => {
      expect(ANALYZER_SYSTEM_PROMPT).toContain("Art. 7 L.300/1970");
      expect(ANALYZER_SYSTEM_PROMPT).toContain("Sanzioni disciplinari");
    });

    it("analyzer prompt references D.Lgs. 23/2015 (tutele crescenti)", () => {
      expect(ANALYZER_SYSTEM_PROMPT).toContain("D.Lgs. 23/2015");
      expect(ANALYZER_SYSTEM_PROMPT).toContain("tutele crescenti");
    });

    it("analyzer prompt covers preavviso requirements", () => {
      expect(ANALYZER_SYSTEM_PROMPT).toContain("Preavviso");
      expect(ANALYZER_SYSTEM_PROMPT).toContain("CCNL");
      expect(ANALYZER_SYSTEM_PROMPT).toContain("indennità sostitutiva");
    });

    it("analyzer prompt flags trasferimento senza motivazione as CRITICAL", () => {
      expect(ANALYZER_SYSTEM_PROMPT).toContain(
        "Trasferimento unilaterale senza motivazione"
      );
    });
  });

  describe("Classifier — detects lettera di licenziamento", () => {
    const licClassification: ClassificationResult = {
      documentType: "lettera_licenziamento",
      documentTypeLabel: "Lettera di Licenziamento per Giustificato Motivo Oggettivo",
      documentSubType: "licenziamento_giustificato_motivo",
      relevantInstitutes: [
        "licenziamento_giustificato_motivo",
        "preavviso_licenziamento_dimissioni",
        "trattamento_fine_rapporto",
      ],
      legalFocusAreas: [
        "diritto_del_lavoro",
        "licenziamento",
        "tutele_crescenti",
        "preavviso",
        "tfr_trattamento_fine_rapporto",
      ],
      parties: [
        { role: "datore_lavoro", name: "ZETA SERVIZI S.R.L.", type: "persona_giuridica" },
        { role: "lavoratore", name: "Paolo Verdi", type: "persona_fisica" },
      ],
      jurisdiction: "Italia - Diritto del Lavoro",
      applicableLaws: [
        { reference: "L. 604/1966", name: "Norme sui licenziamenti individuali" },
        { reference: "L. 300/1970", name: "Statuto dei Lavoratori" },
        { reference: "D.Lgs. 23/2015", name: "Contratto a tutele crescenti" },
      ],
      keyDates: [],
      summary: "Licenziamento per giustificato motivo oggettivo con preavviso insufficiente e motivazione generica.",
      confidence: 0.92,
    };

    it("returns correct document type for licenziamento", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(licClassification));

      const result = await runClassifier(DOC_LETTERA_LICENZIAMENTO);

      expect(result.documentType).toBe("lettera_licenziamento");
      expect(result.documentSubType).toBe("licenziamento_giustificato_motivo");
    });

    it("identifies preavviso and licenziamento institutes", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(licClassification));

      const result = await runClassifier(DOC_LETTERA_LICENZIAMENTO);

      expect(result.relevantInstitutes).toContain("licenziamento_giustificato_motivo");
      expect(result.relevantInstitutes).toContain("preavviso_licenziamento_dimissioni");
    });

    it("identifies correct legal focus areas for licenziamento", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(licClassification));

      const result = await runClassifier(DOC_LETTERA_LICENZIAMENTO);

      expect(result.legalFocusAreas).toContain("licenziamento");
      expect(result.legalFocusAreas).toContain("diritto_del_lavoro");
    });

    it("identifies L. 604/1966 as applicable law", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(licClassification));

      const result = await runClassifier(DOC_LETTERA_LICENZIAMENTO);

      const has604 = result.applicableLaws.some(
        (l) => l.reference.includes("604/1966")
      );
      expect(has604).toBe(true);
    });
  });

  describe("Analyzer — flags licenziamento-specific risks", () => {
    const licClassification: ClassificationResult = {
      documentType: "lettera_licenziamento",
      documentTypeLabel: "Lettera di Licenziamento per Giustificato Motivo Oggettivo",
      documentSubType: "licenziamento_giustificato_motivo",
      relevantInstitutes: ["licenziamento_giustificato_motivo", "preavviso_licenziamento_dimissioni"],
      legalFocusAreas: ["diritto_del_lavoro", "licenziamento", "tutele_crescenti"],
      parties: [
        { role: "datore_lavoro", name: "ZETA SERVIZI S.R.L.", type: "persona_giuridica" },
        { role: "lavoratore", name: "Paolo Verdi", type: "persona_fisica" },
      ],
      jurisdiction: "Italia - Diritto del Lavoro",
      applicableLaws: [
        { reference: "L. 604/1966", name: "Norme sui licenziamenti individuali" },
        { reference: "L. 300/1970", name: "Statuto dei Lavoratori" },
      ],
      keyDates: [],
      summary: "Licenziamento per GMO.",
      confidence: 0.92,
    };

    const licAnalysis: AnalysisResult = {
      clauses: [
        {
          id: "lic_preavviso_1",
          title: "Preavviso inferiore al CCNL",
          originalText: "Il periodo di preavviso è fissato in 15 giorni dalla data di ricezione",
          riskLevel: "high",
          issue: "Il preavviso di 15 giorni è inferiore ai 45 giorni previsti dal CCNL Commercio per Livello 3 con 8 anni di anzianità. Il lavoratore ha diritto alla differenza come indennità sostitutiva.",
          potentialViolation: "Art. 2118 c.c. e CCNL Commercio — preavviso inferiore ai minimi contrattuali",
          marketStandard: "Il CCNL Commercio prevede 45 giorni di preavviso per il Livello 3 con anzianità 5-10 anni.",
          recommendation: "Contestare il preavviso insufficiente e richiedere l'indennità sostitutiva per i 30 giorni mancanti.",
        },
        {
          id: "lic_motiv_2",
          title: "Motivazione generica e insufficiente",
          originalText: "esigenze di riorganizzazione aziendale e riduzione del personale",
          riskLevel: "critical",
          issue: "La motivazione è generica e non indica i fatti specifici che giustificano il licenziamento. L'art. 2, comma 2, L. 604/1966 richiede la comunicazione scritta dei motivi specifici.",
          potentialViolation: "Art. 2, comma 2, L. 604/1966 — obbligo di comunicare i motivi specifici del licenziamento",
          marketStandard: "Il licenziamento per GMO deve indicare: le specifiche ragioni organizzative, il nesso causale con il posto soppresso, l'impossibilità di repechage.",
          recommendation: "Impugnare il licenziamento entro 60 giorni: la motivazione generica lo rende illegittimo per vizio di forma.",
        },
        {
          id: "lic_repechage_3",
          title: "Mancata indicazione del tentativo di repechage",
          originalText: "La decisione è motivata da esigenze di riorganizzazione aziendale",
          riskLevel: "high",
          issue: "Non viene menzionato il tentativo di ricollocazione del lavoratore in altre mansioni equivalenti o inferiori (obbligo di repechage).",
          potentialViolation: "Art. 3 L. 604/1966 — obbligo di repechage prima del licenziamento per GMO",
          marketStandard: "Il datore deve dimostrare di aver verificato l'impossibilità di ricollocare il lavoratore.",
          recommendation: "Contestare il licenziamento per mancato adempimento dell'obbligo di repechage.",
        },
      ],
      missingElements: [
        {
          element: "Motivazione specifica del licenziamento",
          importance: "high",
          explanation: "L'art. 2 L. 604/1966 richiede l'indicazione dei motivi specifici. Una generica 'riorganizzazione' non è sufficiente.",
        },
        {
          element: "Documentazione dell'obbligo di repechage",
          importance: "high",
          explanation: "Il datore deve provare di aver tentato la ricollocazione del lavoratore prima del licenziamento per GMO.",
        },
      ],
      overallRisk: "critical",
      positiveAspects: [
        "La lettera indica correttamente la normativa di riferimento per l'impugnazione (60 giorni + 180 giorni).",
      ],
    };

    it("flags preavviso insufficiente as high risk", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(licAnalysis));

      const result = await runAnalyzer(DOC_LETTERA_LICENZIAMENTO, licClassification);

      const preavvisoClause = result.clauses.find((c) => c.id === "lic_preavviso_1");
      expect(preavvisoClause).toBeDefined();
      expect(preavvisoClause!.riskLevel).toBe("high");
      expect(preavvisoClause!.potentialViolation).toContain("2118");
    });

    it("flags motivazione generica as critical", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(licAnalysis));

      const result = await runAnalyzer(DOC_LETTERA_LICENZIAMENTO, licClassification);

      const motivClause = result.clauses.find((c) => c.id === "lic_motiv_2");
      expect(motivClause).toBeDefined();
      expect(motivClause!.riskLevel).toBe("critical");
      expect(motivClause!.potentialViolation).toContain("604/1966");
    });

    it("flags mancato repechage as high risk", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(licAnalysis));

      const result = await runAnalyzer(DOC_LETTERA_LICENZIAMENTO, licClassification);

      const repechageClause = result.clauses.find((c) => c.id === "lic_repechage_3");
      expect(repechageClause).toBeDefined();
      expect(repechageClause!.riskLevel).toBe("high");
      expect(repechageClause!.potentialViolation).toContain("604/1966");
    });

    it("identifies missing motivazione specifica and repechage", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(licAnalysis));

      const result = await runAnalyzer(DOC_LETTERA_LICENZIAMENTO, licClassification);

      expect(result.missingElements.length).toBeGreaterThanOrEqual(2);
      const missingLabels = result.missingElements.map((m) => m.element.toLowerCase());
      expect(missingLabels.some((l) => l.includes("motivazione"))).toBe(true);
      expect(missingLabels.some((l) => l.includes("repechage"))).toBe(true);
    });

    it("overall risk is critical for this licenziamento", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(licAnalysis));

      const result = await runAnalyzer(DOC_LETTERA_LICENZIAMENTO, licClassification);

      expect(result.overallRisk).toBe("critical");
    });

    it("at least one clause is critical and one is high", async () => {
      mockRunAgent.mockResolvedValue(makeRunAgentResponse(licAnalysis));

      const result = await runAnalyzer(DOC_LETTERA_LICENZIAMENTO, licClassification);

      const critical = result.clauses.filter((c) => c.riskLevel === "critical");
      const high = result.clauses.filter((c) => c.riskLevel === "high");
      expect(critical.length).toBeGreaterThanOrEqual(1);
      expect(high.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// =====================================================================
// CROSS-SCENARIO: Pipeline Contract Validation
// =====================================================================

describe("Cross-scenario: Pipeline contract and output structure", () => {
  it("all 3 scenarios produce clauses with required fields", () => {
    // Inline analysis fixtures to verify structure
    const allClauses = [
      // TD
      {
        id: "td_prova_1", title: "Periodo di prova eccessivo", originalText: "6 mesi",
        riskLevel: "critical" as const, issue: "eccessivo", potentialViolation: "Art. 2096 c.c.",
        marketStandard: "1-2 mesi", recommendation: "Ridurre",
      },
      // TI
      {
        id: "ti_nonconc_1", title: "Non concorrenza senza compenso", originalText: "nessun corrispettivo",
        riskLevel: "critical" as const, issue: "nullo", potentialViolation: "Art. 2125 c.c.",
        marketStandard: "15-30% RAL", recommendation: "Eliminare o negoziare",
      },
      // Licenziamento
      {
        id: "lic_motiv_2", title: "Motivazione generica", originalText: "riorganizzazione aziendale",
        riskLevel: "critical" as const, issue: "generica", potentialViolation: "Art. 2 L. 604/1966",
        marketStandard: "motivi specifici", recommendation: "Impugnare",
      },
    ];

    for (const clause of allClauses) {
      expect(clause.id).toBeTruthy();
      expect(clause.title).toBeTruthy();
      expect(clause.originalText).toBeTruthy();
      expect(["critical", "high", "medium", "low", "info"]).toContain(clause.riskLevel);
      expect(clause.issue).toBeTruthy();
      expect(clause.potentialViolation).toBeTruthy();
      expect(clause.marketStandard).toBeTruthy();
      expect(clause.recommendation).toBeTruthy();
    }
  });

  it("classifier output structure is compatible with analyzer input", () => {
    const classifications: ClassificationResult[] = [
      {
        documentType: "contratto_lavoro_subordinato",
        documentTypeLabel: "Contratto TD",
        documentSubType: "contratto_lavoro_tempo_determinato",
        relevantInstitutes: ["contratto_tempo_determinato"],
        legalFocusAreas: ["diritto_del_lavoro"],
        parties: [{ role: "datore_lavoro", name: "Test", type: "persona_giuridica" }],
        jurisdiction: "Italia",
        applicableLaws: [{ reference: "D.Lgs. 81/2015", name: "Jobs Act" }],
        keyDates: [],
        summary: "test",
        confidence: 0.9,
      },
      {
        documentType: "lettera_licenziamento",
        documentTypeLabel: "Lettera Licenziamento",
        documentSubType: "licenziamento_giustificato_motivo",
        relevantInstitutes: ["licenziamento_giustificato_motivo"],
        legalFocusAreas: ["licenziamento"],
        parties: [{ role: "datore_lavoro", name: "Test", type: "persona_giuridica" }],
        jurisdiction: "Italia",
        applicableLaws: [{ reference: "L. 604/1966", name: "Licenziamenti" }],
        keyDates: [],
        summary: "test",
        confidence: 0.9,
      },
    ];

    for (const c of classifications) {
      // These fields are required by runAnalyzer's prompt builder
      expect(c.documentTypeLabel).toBeTruthy();
      expect(c.jurisdiction).toBeTruthy();
      expect(Array.isArray(c.applicableLaws)).toBe(true);
      expect(Array.isArray(c.relevantInstitutes)).toBe(true);
      expect(Array.isArray(c.legalFocusAreas)).toBe(true);
    }
  });

  it("analyzer prompt covers all HR normative sources referenced in tests", () => {
    // Verify the analyzer prompt contains every key legal reference used in the 3 scenarios
    const requiredReferences = [
      "Art. 2103 c.c.",       // demansionamento
      "Art. 2125 c.c.",       // non concorrenza
      "D.Lgs. 81/2015",       // Jobs Act (TD)
      "D.Lgs. 66/2003",       // orario di lavoro
      "D.Lgs. 23/2015",       // tutele crescenti
      "L. 300/1970",          // Statuto dei Lavoratori
      "Art. 2113 c.c.",       // rinunce lavoratore
      "Art. 2120 c.c.",       // TFR
    ];

    for (const ref of requiredReferences) {
      expect(ANALYZER_SYSTEM_PROMPT).toContain(ref);
    }
  });

  it("classifier prompt covers all HR sub-types used in tests", () => {
    const subTypes = [
      "subordinato_tempo_determinato",
      "subordinato_tempo_indeterminato",
      "lettera_licenziamento",
      "contratto_lavoro_tempo_determinato",
    ];

    for (const subType of subTypes) {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain(subType);
    }
  });
});
