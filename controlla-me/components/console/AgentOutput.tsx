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
  context?: AgentContext;
}

const RUNNING_MESSAGES: Record<ConsoleAgentPhase, string> = {
  leader: "Analizzo la richiesta",
  "question-prep": "Riformulo la domanda",
  "corpus-search": "Cerco articoli pertinenti",
  "corpus-agent": "Elaboro la risposta",
  classifier: "Classifico il documento",
  retrieval: "Cerco riferimenti normativi",
  analyzer: "Analizzo le clausole",
  investigator: "Cerco giurisprudenza e fonti web",
  advisor: "Preparo il consiglio finale",
};

// ─── Status dot ───

function StatusDot({ status }: { status: string }) {
  const color = {
    running: "bg-emerald-500 animate-pulse",
    done: "bg-[#1A1A1A]",
    error: "bg-red-400",
    skipped: "bg-[#E5E5E5]",
  }[status] || "bg-[#E5E5E5]";

  return <span className={`inline-block w-[7px] h-[7px] rounded-full ${color}`} />;
}

// ─── Context Map ───

function ContextMap({ context }: { context: AgentContext }) {
  const hasInstitutes = context.institutes && context.institutes.length > 0;
  const hasArticles = context.articles && context.articles.length > 0;
  const hasTarget = !!context.targetArticles;

  if (!hasInstitutes && !hasArticles && !hasTarget) return null;

  return (
    <div className="mt-2 border border-[#F0F0F0] rounded-lg px-3 py-2.5 text-[11px] space-y-1.5">
      {hasInstitutes && (
        <div>
          <span className="text-[#6B6B6B] font-medium">Istituti: </span>
          <span className="text-[#9B9B9B]">{context.institutes!.join(", ")}</span>
        </div>
      )}
      {hasArticles && (
        <div>
          <span className="text-[#6B6B6B] font-medium">Articoli in esame:</span>
          <div className="mt-0.5 space-y-0.5 pl-2">
            {context.articles!.slice(0, 6).map((a, i) => (
              <div key={i} className="text-[#1A1A1A]">
                {a.reference}
                {a.title && <span className="text-[#9B9B9B] ml-1">&mdash; {a.title}</span>}
              </div>
            ))}
            {context.articles!.length > 6 && (
              <div className="text-[#9B9B9B]">+{context.articles!.length - 6} altri</div>
            )}
          </div>
        </div>
      )}
      {hasTarget && (
        <div>
          <span className="text-[#6B6B6B] font-medium">Target: </span>
          <span className="text-[#1A1A1A]">{context.targetArticles}</span>
        </div>
      )}
    </div>
  );
}

// ─── Done message ───

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const refs = arts.slice(0, 5).map((a: any) => a.reference).join(", ");
        return `Controllo ${refs}`;
      }
      return "Nessun articolo trovato";
    }
    case "corpus-agent": return null;
    case "classifier":
      return output?.documentTypeLabel ?? output?.documentType ?? "Documento classificato";
    case "retrieval": return "Riferimenti recuperati";
    case "analyzer": {
      const risk = output?.overallRisk;
      return risk ? `Rischio: ${risk}` : "Analisi completata";
    }
    case "investigator": {
      const srcCount = output?.sources?.length ?? 0;
      return srcCount > 0 ? `${srcCount} fonti web trovate` : "Ricerca completata";
    }
    case "advisor": return null;
    default: return "Completato";
  }
}

// ─── Formatted Answer ───

function FormattedAnswer({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());

  return (
    <div className="space-y-4">
      {paragraphs.map((para, i) => {
        const isSection = /^(Riferimenti normativi|Orientamenti giurisprudenziali|In sintesi|In pratica):/i.test(para);

        if (isSection) {
          const colonIdx = para.indexOf(":");
          const heading = para.slice(0, colonIdx);
          const body = para.slice(colonIdx + 1).trim();

          return (
            <div key={i}>
              <p className="text-[10px] font-medium tracking-[2px] uppercase text-[#9B9B9B] mb-1.5">
                {heading}
              </p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed text-[#1A1A1A]/80 pl-4 border-l-2 border-[#E5E5E5]">
                {body}
              </p>
            </div>
          );
        }

        return (
          <p key={i} className="text-[15px] whitespace-pre-wrap leading-relaxed text-[#1A1A1A]/90">
            {para}
          </p>
        );
      })}
    </div>
  );
}

// ─── Inline Detail ───

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
      <div className="mt-1.5 pl-5 text-[11px] space-y-0.5">
        {output.legalQuery && (
          <div>
            <span className="text-[#9B9B9B]">Tema: </span>
            <span className="text-[#6B6B6B] italic">&ldquo;{output.legalQuery}&rdquo;</span>
          </div>
        )}
        {output.suggestedInstitutes?.length > 0 && (
          <div>
            <span className="text-[#9B9B9B]">Istituti: </span>
            <span className="text-[#6B6B6B]">{output.suggestedInstitutes.join(", ")}</span>
          </div>
        )}
        {output.targetArticles && (
          <div>
            <span className="text-[#9B9B9B]">Target: </span>
            <span className="text-[#1A1A1A]">{output.targetArticles}</span>
          </div>
        )}
      </div>
    );
  }

  if (phase === "corpus-search" && output?.articles?.length) {
    return (
      <div className="mt-1.5 pl-5 text-[11px]">
        <span className="text-[#9B9B9B]">{output.articles.length} articoli: </span>
        <span className="text-[#1A1A1A]">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {output.articles.slice(0, 5).map((a: any) => a.reference).join(", ")}
          {output.articles.length > 5 ? ` +${output.articles.length - 5}` : ""}
        </span>
      </div>
    );
  }

  if (phase === "investigator" && output) {
    const sources = output.sources ?? [];
    return (
      <div className="mt-1.5 pl-5 text-[11px] space-y-0.5">
        {sources.length > 0 && (
          <div>
            <span className="text-[#9B9B9B]">Fonti web: </span>
            <span className="text-[#6B6B6B]">
              {sources.slice(0, 4).map((s: { title: string }) => s.title).join(" · ")}
              {sources.length > 4 ? ` +${sources.length - 4}` : ""}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (phase === "classifier" && output) {
    return (
      <div className="mt-1.5 pl-5 text-[11px] space-y-0.5">
        {output.documentTypeLabel && (
          <div>
            <span className="text-[#9B9B9B]">Tipo: </span>
            <span className="text-[#6B6B6B]">{output.documentTypeLabel}</span>
          </div>
        )}
        {output.relevantInstitutes?.length > 0 && (
          <div>
            <span className="text-[#9B9B9B]">Istituti: </span>
            <span className="text-[#6B6B6B]">{output.relevantInstitutes.join(", ")}</span>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ─── Terminal Output ───

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
      <div className="space-y-3 mt-4 border-t border-[#F0F0F0] pt-4">
        <FormattedAnswer text={output.answer} />
        {output.citedArticles?.length > 0 && (
          <p className="text-xs text-[#9B9B9B] mt-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            Fonti: {output.citedArticles.map((a: any) => a.reference).join(", ")}
          </p>
        )}
        {output.missingArticles?.length > 0 && (
          <p className="text-xs text-[#9B9B9B]">
            Vedi anche: {output.missingArticles.join(", ")}
          </p>
        )}
        {output.followUpQuestions?.length > 0 && (
          <div className="mt-3 border-t border-[#F0F0F0] pt-3">
            <p className="text-[10px] text-[#9B9B9B] mb-1">Approfondisci:</p>
            {output.followUpQuestions.map((q: string, i: number) => (
              <p key={i} className="text-xs text-[#6B6B6B]">&rarr; {q}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (phase === "advisor" && output) {
    return (
      <div className="space-y-3 mt-4 border-t border-[#F0F0F0] pt-4">
        {output.fairnessScore != null && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#6B6B6B]">Punteggio:</span>
            <span
              className={`text-xl font-bold ${
                output.fairnessScore >= 7
                  ? "text-emerald-600"
                  : output.fairnessScore >= 4
                    ? "text-amber-600"
                    : "text-red-500"
              }`}
            >
              {output.fairnessScore}/10
            </span>
          </div>
        )}
        <p className="text-[15px] whitespace-pre-wrap leading-relaxed text-[#1A1A1A]/90">
          {output.summary}
        </p>
        {output.risks?.length > 0 && (
          <div className="mt-1 space-y-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {output.risks.map((r: any, i: number) => (
              <p key={i} className="text-xs text-red-500">&bull; {r.title}: {r.detail}</p>
            ))}
          </div>
        )}
        {output.actions?.length > 0 && (
          <div className="mt-1 space-y-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {output.actions.map((a: any, i: number) => (
              <p key={i} className="text-xs text-[#6B6B6B]">&rarr; {a.action}</p>
            ))}
          </div>
        )}
        {output.needsLawyer && (
          <div className="mt-3 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2">
            <span className="text-xs text-amber-700 font-medium">Consigliato avvocato</span>
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
  const showContextMap = (phase === "corpus-agent" || phase === "investigator") && context;

  // Running
  if (status === "running") {
    return (
      <div className="rounded-xl border border-[#F0F0F0] px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <StatusDot status="running" />
          <span className="font-medium text-[#1A1A1A]">{phaseName}</span>
          <span className="text-[#9B9B9B]">{RUNNING_MESSAGES[phase]}...</span>
        </div>
        {showContextMap && <ContextMap context={context} />}
      </div>
    );
  }

  // Error
  if (status === "error") {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50/50 px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <StatusDot status="error" />
          <span className="font-medium text-[#1A1A1A]">{phaseName}</span>
          <span className="text-red-500">{summary ?? "Errore"}</span>
        </div>
      </div>
    );
  }

  // Skipped
  if (status === "skipped") {
    return (
      <div className="rounded-xl border border-[#F0F0F0] px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <StatusDot status="skipped" />
          <span className="font-medium text-[#9B9B9B]">{phaseName}</span>
          <span className="text-[#9B9B9B]">{summary ?? "Saltato"}</span>
        </div>
      </div>
    );
  }

  // Done
  const doneMessage = getDoneMessage(phase, output);

  return (
    <div className="rounded-xl border border-[#F0F0F0] px-4 py-3">
      <div className="flex items-center gap-2 text-xs">
        <StatusDot status="done" />
        <span className="font-medium text-[#1A1A1A]">{phaseName}</span>
        {doneMessage && <span className="text-[#9B9B9B]">{doneMessage}</span>}
        {timing != null && (
          <span className="text-[#9B9B9B] opacity-40 ml-auto text-[10px]">
            {(timing / 1000).toFixed(1)}s
          </span>
        )}
      </div>
      {isTerminal && output && <TerminalOutput phase={phase} output={output} />}
      {!isTerminal && output && <InlineDetail phase={phase} output={output} />}
    </div>
  );
}
