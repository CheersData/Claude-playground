"use client";

import type { ConsoleAgentPhase, ConsolePhaseStatus } from "@/lib/types";

// ─── Types ───

interface ContextArticle {
  reference: string;
  source: string;
  title?: string;
}

interface AgentContext {
  institutes?: string[];
  articles?: ContextArticle[];
  targetArticles?: string | null;
}

interface AgentOutputProps {
  phase: ConsoleAgentPhase;
  phaseName: string;
  status: ConsolePhaseStatus;
  summary?: string;
  timing?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output?: any;
  /** Context collected from previous pipeline steps — shown during "running" */
  context?: AgentContext;
}

// ─── Simple Italian messages per phase ───

const RUNNING_MESSAGES: Record<ConsoleAgentPhase, string> = {
  leader: "Analizzo la richiesta",
  "question-prep": "Riformulo la domanda",
  "corpus-search": "Cerco articoli pertinenti",
  "corpus-agent": "Elaboro la risposta",
  classifier: "Classifico il documento",
  retrieval: "Cerco riferimenti normativi",
  analyzer: "Analizzo le clausole",
  investigator: "Verifico i riferimenti legali",
  advisor: "Preparo il consiglio finale",
};

// ─── Context Map (shown during "running" for corpus-agent / investigator) ───

function ContextMap({ context }: { context: AgentContext }) {
  const hasInstitutes = context.institutes && context.institutes.length > 0;
  const hasArticles = context.articles && context.articles.length > 0;
  const hasTarget = !!context.targetArticles;

  if (!hasInstitutes && !hasArticles && !hasTarget) return null;

  return (
    <div className="mt-2 border border-[var(--pb-border)] rounded px-2 py-2 text-[10px] space-y-1.5 opacity-80">
      {hasInstitutes && (
        <div>
          <span className="text-[var(--pb-amber)] font-bold">ISTITUTI: </span>
          <span className="text-[var(--pb-text-dim)]">
            {context.institutes!.join(", ")}
          </span>
        </div>
      )}
      {hasArticles && (
        <div>
          <span className="text-[var(--pb-amber)] font-bold">ARTICOLI IN ESAME:</span>
          <div className="mt-0.5 space-y-0.5 pl-2">
            {context.articles!.slice(0, 6).map((a, i) => (
              <div key={i} className="text-[var(--pb-green)]">
                {a.reference}
                {a.title && (
                  <span className="text-[var(--pb-text-dim)] ml-1">
                    — {a.title}
                  </span>
                )}
              </div>
            ))}
            {context.articles!.length > 6 && (
              <div className="text-[var(--pb-text-dim)]">
                +{context.articles!.length - 6} altri
              </div>
            )}
          </div>
        </div>
      )}
      {hasTarget && (
        <div>
          <span className="text-[var(--pb-amber)] font-bold">TARGET: </span>
          <span className="text-[var(--pb-green)]">
            {context.targetArticles}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Done message per phase ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getDoneMessage(phase: ConsoleAgentPhase, output: any): string | null {
  switch (phase) {
    case "leader":
      return "Inoltro la richiesta";
    case "question-prep": {
      const target = output?.targetArticles;
      if (target) return `Cerco in ${target}`;
      const insts = output?.suggestedInstitutes;
      if (insts?.length) return `Istituti: ${insts.join(", ")}`;
      return "Domanda riformulata";
    }
    case "corpus-search": {
      const arts = output?.articles;
      if (arts?.length) {
        const refs = arts
          .slice(0, 5)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((a: any) => a.reference)
          .join(", ");
        return `Controllo ${refs}`;
      }
      return "Nessun articolo trovato";
    }
    case "corpus-agent":
      return null; // Terminal — show full output
    case "classifier":
      return (
        output?.documentTypeLabel ??
        output?.documentType ??
        "Documento classificato"
      );
    case "retrieval":
      return "Riferimenti recuperati";
    case "analyzer": {
      const risk = output?.overallRisk;
      return risk ? `Rischio: ${risk}` : "Analisi completata";
    }
    case "investigator":
      return "Verifica completata";
    case "advisor":
      return null; // Terminal — show full output
    default:
      return "Completato";
  }
}

// ─── Formatted Answer (sections: Risposta, Riferimenti, Giurisprudenza, Sintesi) ───

function FormattedAnswer({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());

  return (
    <div className="space-y-3">
      {paragraphs.map((para, i) => {
        // Detect section headers
        const isRefSection = /^Riferimenti normativi:/i.test(para);
        const isJuriSection = /^Orientamenti giurisprudenziali:/i.test(para);
        const isSynthSection = /^In sintesi:/i.test(para);
        const isSection = isRefSection || isJuriSection || isSynthSection;

        if (isSection) {
          const colonIdx = para.indexOf(":");
          const heading = para.slice(0, colonIdx);
          const body = para.slice(colonIdx + 1).trim();

          return (
            <div key={i}>
              <div className="text-[10px] font-bold text-[var(--pb-amber)] tracking-wider mb-1">
                {heading.toUpperCase()}
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed pl-3 border-l-2 border-[var(--pb-green-dim)]">
                {body}
              </p>
            </div>
          );
        }

        return (
          <p key={i} className="text-sm whitespace-pre-wrap leading-relaxed">
            {para}
          </p>
        );
      })}
    </div>
  );
}

// ─── Inline Detail for completed non-terminal agents ───

function InlineDetail({
  phase,
  output,
}: {
  phase: ConsoleAgentPhase;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output: any;
}) {
  if (phase === "question-prep" && output) {
    return (
      <div className="mt-1.5 pl-5 text-[10px] space-y-0.5">
        {output.legalQuery && (
          <div>
            <span className="text-[var(--pb-text-dim)]">Tema: </span>
            <span className="text-[var(--pb-text)] italic">
              &ldquo;{output.legalQuery}&rdquo;
            </span>
          </div>
        )}
        {output.mechanismQuery && (
          <div>
            <span className="text-[var(--pb-text-dim)]">Meccanismo: </span>
            <span className="text-[var(--pb-text)] italic">
              &ldquo;{output.mechanismQuery}&rdquo;
            </span>
          </div>
        )}
        {output.suggestedInstitutes?.length > 0 && (
          <div>
            <span className="text-[var(--pb-text-dim)]">Istituti: </span>
            <span className="text-[var(--pb-amber)]">
              {output.suggestedInstitutes.join(", ")}
            </span>
          </div>
        )}
        {output.targetArticles && (
          <div>
            <span className="text-[var(--pb-text-dim)]">Target: </span>
            <span className="text-[var(--pb-green)]">
              {output.targetArticles}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (phase === "corpus-search" && output?.articles?.length) {
    return (
      <div className="mt-1.5 pl-5 text-[10px] space-y-0.5">
        <div>
          <span className="text-[var(--pb-text-dim)]">
            {output.articles.length} articoli:{" "}
          </span>
          <span className="text-[var(--pb-green)]">
            {output.articles
              .slice(0, 5)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((a: any) => a.reference)
              .join(", ")}
            {output.articles.length > 5
              ? ` +${output.articles.length - 5}`
              : ""}
          </span>
        </div>
      </div>
    );
  }

  if (phase === "classifier" && output) {
    return (
      <div className="mt-1.5 pl-5 text-[10px] space-y-0.5">
        {output.documentTypeLabel && (
          <div>
            <span className="text-[var(--pb-text-dim)]">Tipo: </span>
            <span className="text-[var(--pb-text)]">
              {output.documentTypeLabel}
            </span>
          </div>
        )}
        {output.relevantInstitutes?.length > 0 && (
          <div>
            <span className="text-[var(--pb-text-dim)]">Istituti: </span>
            <span className="text-[var(--pb-amber)]">
              {output.relevantInstitutes.join(", ")}
            </span>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ─── Terminal outputs (corpus-agent, advisor) ───

function TerminalOutput({
  phase,
  output,
}: {
  phase: ConsoleAgentPhase;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output: any;
}) {
  if (phase === "corpus-agent" && output?.answer) {
    return (
      <div className="space-y-2 mt-3 border-t border-[var(--pb-border)] pt-3">
        <FormattedAnswer text={output.answer} />
        {output.citedArticles?.length > 0 && (
          <div className="text-xs text-[var(--pb-text-dim)] mt-2">
            Fonti:{" "}
            {output.citedArticles
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((a: any) => a.reference)
              .join(", ")}
          </div>
        )}
        {output.missingArticles?.length > 0 && (
          <div className="text-xs text-[var(--pb-text-dim)] mt-2">
            Vedi anche:{" "}
            {output.missingArticles.join(", ")}
          </div>
        )}
        {output.followUpQuestions?.length > 0 && (
          <div className="mt-2 border-t border-[var(--pb-border)] pt-2">
            <div className="text-[10px] text-[var(--pb-text-dim)] mb-1">Approfondisci:</div>
            {output.followUpQuestions.map((q: string, i: number) => (
              <p key={i} className="text-xs text-[var(--pb-amber)] opacity-70">
                {"\u2192"} {q}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (phase === "advisor" && output) {
    return (
      <div className="space-y-2 mt-3 border-t border-[var(--pb-border)] pt-3">
        {output.fairnessScore != null && (
          <div className="flex items-center gap-2">
            <span className="text-[var(--pb-amber)]">Punteggio:</span>
            <span
              className={`text-xl font-bold ${
                output.fairnessScore >= 7
                  ? "text-[var(--pb-green)]"
                  : output.fairnessScore >= 4
                    ? "text-[var(--pb-amber)]"
                    : "text-[var(--pb-red)]"
              }`}
            >
              {output.fairnessScore}/10
            </span>
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap leading-relaxed">
          {output.summary}
        </p>
        {output.risks?.length > 0 && (
          <div className="mt-1">
            {output.risks.map(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (r: any, i: number) => (
                <p key={i} className="text-xs text-[var(--pb-red)]">
                  {"\u2022"} {r.title}: {r.detail}
                </p>
              )
            )}
          </div>
        )}
        {output.actions?.length > 0 && (
          <div className="mt-1">
            {output.actions.map(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (a: any, i: number) => (
                <p key={i} className="text-xs text-[var(--pb-amber)]">
                  {"\u2192"} {a.action}
                </p>
              )
            )}
          </div>
        )}
        {output.needsLawyer && (
          <div className="mt-2 border border-[var(--pb-amber)] rounded px-2 py-1">
            <span className="text-xs text-[var(--pb-amber)] font-bold">
              Consigliato avvocato
            </span>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ─── Main Component ───

export default function AgentOutput({
  phase,
  phaseName,
  status,
  summary,
  timing,
  output,
  context,
}: AgentOutputProps) {
  const isTerminal = phase === "corpus-agent" || phase === "advisor";
  const showContextMap =
    (phase === "corpus-agent" || phase === "investigator") && context;

  // Running
  if (status === "running") {
    return (
      <div className="pipboy-panel rounded-md px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="pipboy-led pipboy-led-running" />
          <span className="font-medium">{phaseName}</span>
          <span className="text-[var(--pb-text-dim)]">
            {RUNNING_MESSAGES[phase]}...
          </span>
        </div>
        {showContextMap && <ContextMap context={context} />}
      </div>
    );
  }

  // Error
  if (status === "error") {
    return (
      <div className="pipboy-panel rounded-md px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="pipboy-led pipboy-led-error" />
          <span className="font-medium">{phaseName}</span>
          <span className="text-[var(--pb-red)]">{summary ?? "Errore"}</span>
        </div>
      </div>
    );
  }

  // Skipped
  if (status === "skipped") {
    return (
      <div className="pipboy-panel rounded-md px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="pipboy-led pipboy-led-skipped" />
          <span className="font-medium">{phaseName}</span>
          <span className="text-[var(--pb-text-dim)]">
            {summary ?? "Saltato"}
          </span>
        </div>
      </div>
    );
  }

  // Done
  const doneMessage = getDoneMessage(phase, output);

  return (
    <div className="pipboy-panel rounded-md px-3 py-2 pipboy-reveal">
      <div className="flex items-center gap-2 text-xs">
        <span className="pipboy-led pipboy-led-done" />
        <span className="font-medium">{phaseName}</span>
        {doneMessage && (
          <span className="text-[var(--pb-text-dim)]">{doneMessage}</span>
        )}
        {timing != null && (
          <span className="text-[var(--pb-text-dim)] opacity-40 ml-auto text-[10px]">
            {(timing / 1000).toFixed(1)}s
          </span>
        )}
      </div>
      {isTerminal && output && <TerminalOutput phase={phase} output={output} />}
      {!isTerminal && output && <InlineDetail phase={phase} output={output} />}
    </div>
  );
}
