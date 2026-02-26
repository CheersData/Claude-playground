"use client";

import OutputSection from "./OutputSection";

interface CorpusResult {
  type: "corpus-qa";
  answer: string;
  citedArticles: Array<{
    id: string;
    reference: string;
    source: string;
    relevance: string;
  }>;
  confidence: number;
  followUpQuestions?: string[];
}

interface DocumentResult {
  type: "document-analysis";
  classification?: {
    documentTypeLabel: string;
    summary: string;
    jurisdiction: string;
  } | null;
  analysis?: {
    clauses: Array<{
      title: string;
      riskLevel: string;
      issue: string;
      recommendation: string;
    }>;
    overallRisk: string;
    positiveAspects: string[];
  } | null;
  investigation?: {
    findings: Array<{
      clauseId: string;
      legalOpinion: string;
    }>;
  } | null;
  advice?: {
    fairnessScore: number;
    summary: string;
    risks: Array<{ severity: string; title: string; detail: string }>;
    actions: Array<{ priority: number; action: string; rationale: string }>;
    needsLawyer: boolean;
    lawyerReason?: string;
  } | null;
  timings?: Record<string, number>;
}

type ConsoleResult = CorpusResult | DocumentResult;

interface OutputPanelProps {
  results: ConsoleResult[];
  error: string | null;
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    critical: "text-[var(--pb-red)]",
    high: "text-[var(--pb-red)]",
    medium: "text-[var(--pb-amber)]",
    low: "text-[var(--pb-green)]",
    info: "text-[var(--pb-text-dim)]",
  };
  return (
    <span className={`text-[10px] font-bold ${colors[level] ?? ""}`}>
      [{level.toUpperCase()}]
    </span>
  );
}

function CorpusOutput({ result }: { result: CorpusResult }) {
  return (
    <div className="space-y-3">
      <OutputSection title="RISPOSTA CORPUS" defaultOpen>
        <div className="space-y-3">
          <p className="whitespace-pre-wrap">{result.answer}</p>

          {result.citedArticles.length > 0 && (
            <div>
              <h4 className="text-xs text-[var(--pb-amber)] mb-1">
                Articoli citati:
              </h4>
              {result.citedArticles.map((a, i) => (
                <div key={i} className="text-xs text-[var(--pb-text-dim)] ml-2 mb-1">
                  <span className="text-[var(--pb-green)]">{a.reference}</span>
                  {" — "}
                  <span>{a.source}</span>
                  {a.relevance && (
                    <span className="opacity-60"> ({a.relevance})</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="text-[10px] text-[var(--pb-text-dim)]">
            Confidence: {((result.confidence ?? 0) * 100).toFixed(0)}%
          </div>

          {result.followUpQuestions && result.followUpQuestions.length > 0 && (
            <div>
              <h4 className="text-xs text-[var(--pb-text-dim)] mb-1">
                Domande correlate:
              </h4>
              {result.followUpQuestions.map((q, i) => (
                <p key={i} className="text-xs text-[var(--pb-text-dim)] ml-2">
                  {q}
                </p>
              ))}
            </div>
          )}
        </div>
      </OutputSection>
    </div>
  );
}

function DocumentOutput({ result }: { result: DocumentResult }) {
  const { classification, analysis, investigation, advice, timings } = result;

  return (
    <div className="space-y-3">
      {/* Classification */}
      {classification && (
        <OutputSection
          title={`CLASSIFICAZIONE — ${classification.documentTypeLabel}`}
          timing={timings?.classifier}
        >
          <p className="text-sm">{classification.summary}</p>
          <p className="text-xs text-[var(--pb-text-dim)] mt-1">
            Giurisdizione: {classification.jurisdiction}
          </p>
        </OutputSection>
      )}

      {/* Analysis */}
      {analysis && (
        <OutputSection
          title={`ANALISI RISCHI — ${analysis.overallRisk.toUpperCase()}`}
          timing={timings?.analyzer}
        >
          <div className="space-y-2">
            {analysis.clauses.map((c, i) => (
              <div key={i} className="border-l-2 border-[var(--pb-border)] pl-2">
                <div className="flex items-center gap-2">
                  <RiskBadge level={c.riskLevel} />
                  <span className="text-xs font-medium">{c.title}</span>
                </div>
                <p className="text-xs text-[var(--pb-text-dim)] mt-0.5">
                  {c.issue}
                </p>
                <p className="text-xs text-[var(--pb-green)] opacity-70 mt-0.5">
                  {c.recommendation}
                </p>
              </div>
            ))}

            {analysis.positiveAspects.length > 0 && (
              <div className="mt-2">
                <span className="text-xs text-[var(--pb-green)]">
                  Aspetti positivi:
                </span>
                {analysis.positiveAspects.map((a, i) => (
                  <p key={i} className="text-xs text-[var(--pb-text-dim)] ml-2">
                    + {a}
                  </p>
                ))}
              </div>
            )}
          </div>
        </OutputSection>
      )}

      {/* Investigation */}
      {investigation && investigation.findings.length > 0 && (
        <OutputSection title="RICERCA LEGALE" timing={timings?.investigator}>
          <div className="space-y-2">
            {investigation.findings.map((f, i) => (
              <div key={i} className="text-xs">
                <span className="text-[var(--pb-amber)]">
                  Clausola {f.clauseId}:
                </span>
                <p className="text-[var(--pb-text-dim)] mt-0.5 whitespace-pre-wrap">
                  {f.legalOpinion}
                </p>
              </div>
            ))}
          </div>
        </OutputSection>
      )}

      {/* Advice */}
      {advice && (
        <OutputSection title="CONSULENZA FINALE" timing={timings?.advisor}>
          <div className="space-y-3">
            {/* Fairness score */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--pb-text-dim)]">
                Fairness Score:
              </span>
              <span
                className={`text-lg font-bold ${
                  advice.fairnessScore >= 7
                    ? "text-[var(--pb-green)]"
                    : advice.fairnessScore >= 4
                    ? "text-[var(--pb-amber)]"
                    : "text-[var(--pb-red)]"
                }`}
              >
                {advice.fairnessScore}/10
              </span>
            </div>

            <p className="text-sm whitespace-pre-wrap">{advice.summary}</p>

            {/* Risks */}
            {advice.risks.length > 0 && (
              <div>
                <h4 className="text-xs text-[var(--pb-red)] mb-1">Rischi:</h4>
                {advice.risks.map((r, i) => (
                  <div key={i} className="ml-2 mb-1">
                    <span className="text-xs font-medium">
                      [{r.severity.toUpperCase()}] {r.title}
                    </span>
                    <p className="text-xs text-[var(--pb-text-dim)]">
                      {r.detail}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            {advice.actions.length > 0 && (
              <div>
                <h4 className="text-xs text-[var(--pb-amber)] mb-1">
                  Azioni consigliate:
                </h4>
                {advice.actions.map((a, i) => (
                  <div key={i} className="ml-2 mb-1">
                    <span className="text-xs font-medium">
                      {a.priority}. {a.action}
                    </span>
                    <p className="text-xs text-[var(--pb-text-dim)]">
                      {a.rationale}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Lawyer recommendation */}
            {advice.needsLawyer && (
              <div className="border border-[var(--pb-amber)] rounded px-2 py-1.5 text-xs">
                <span className="text-[var(--pb-amber)] font-bold">
                  [!] CONSIGLIATO AVVOCATO
                </span>
                {advice.lawyerReason && (
                  <p className="text-[var(--pb-text-dim)] mt-0.5">
                    {advice.lawyerReason}
                  </p>
                )}
              </div>
            )}
          </div>
        </OutputSection>
      )}
    </div>
  );
}

export default function OutputPanel({ results, error }: OutputPanelProps) {
  if (error) {
    return (
      <div className="pipboy-panel rounded-md p-3 border-[var(--pb-red)]">
        <span className="text-xs text-[var(--pb-red)] font-bold">
          [ERRORE]
        </span>
        <p className="text-sm text-[var(--pb-red)] mt-1">{error}</p>
      </div>
    );
  }

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {results.map((result, i) =>
        result.type === "corpus-qa" ? (
          <CorpusOutput key={i} result={result} />
        ) : (
          <DocumentOutput key={i} result={result} />
        )
      )}
    </div>
  );
}
