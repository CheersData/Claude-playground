"use client";

import { motion, AnimatePresence } from "framer-motion";
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
// Framer Motion version: running state shows a pulsing ring + breathing dot,
// other states show a solid dot with smooth transition from running.

function StatusDot({ status }: { status: string }) {
  const isRunning = status === "running";
  const colorClass = {
    running: "bg-emerald-500",
    done: "bg-[var(--foreground)]",
    error: "bg-red-400",
    skipped: "bg-[var(--border)]",
  }[status] || "bg-[var(--border)]";

  return (
    <span className="relative inline-flex w-[7px] h-[7px]" aria-hidden="true">
      {/* Pulse ring — only when running */}
      <AnimatePresence>
        {isRunning && (
          <motion.span
            className="absolute inset-0 rounded-full bg-emerald-500"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: [1, 2.4], opacity: [0.5, 0] }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        )}
      </AnimatePresence>

      {/* Solid dot — breathes when running, settles smoothly otherwise */}
      <motion.span
        className={`relative block w-[7px] h-[7px] rounded-full ${colorClass}`}
        animate={
          isRunning
            ? { scale: [1, 1.2, 1], opacity: [1, 0.85, 1] }
            : { scale: 1, opacity: 1 }
        }
        transition={
          isRunning
            ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      />
    </span>
  );
}

// ─── Context Map ───

function ContextMap({ context }: { context: AgentContext }) {
  const hasInstitutes = context.institutes && context.institutes.length > 0;
  const hasArticles = context.articles && context.articles.length > 0;
  const hasTarget = !!context.targetArticles;

  if (!hasInstitutes && !hasArticles && !hasTarget) return null;

  return (
    <div className="mt-2 border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 text-[11px] space-y-1.5">
      {hasInstitutes && (
        <div>
          <span className="text-[var(--foreground-secondary)] font-medium">Istituti: </span>
          <span className="text-[var(--foreground-tertiary)]">{context.institutes!.join(", ")}</span>
        </div>
      )}
      {hasArticles && (
        <div>
          <span className="text-[var(--foreground-secondary)] font-medium">Articoli in esame:</span>
          <div className="mt-0.5 space-y-0.5 pl-2">
            {context.articles!.slice(0, 6).map((a, i) => (
              <div key={i} className="text-[var(--foreground)]">
                {a.reference}
                {a.title && <span className="text-[var(--foreground-tertiary)] ml-1">&mdash; {a.title}</span>}
              </div>
            ))}
            {context.articles!.length > 6 && (
              <div className="text-[var(--foreground-tertiary)]">+{context.articles!.length - 6} altri</div>
            )}
          </div>
        </div>
      )}
      {hasTarget && (
        <div>
          <span className="text-[var(--foreground-secondary)] font-medium">Target: </span>
          <span className="text-[var(--foreground)]">{context.targetArticles}</span>
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
              <h4 className="text-[10px] font-medium tracking-[2px] uppercase text-[var(--foreground-secondary)] mb-1.5">
                {heading}
              </h4>
              <p className="text-sm whitespace-pre-wrap leading-relaxed text-[var(--foreground)]/80 pl-4 border-l-2 border-[var(--border)]">
                {body}
              </p>
            </div>
          );
        }

        return (
          <p key={i} className="text-[15px] whitespace-pre-wrap leading-relaxed text-[var(--foreground)]/90">
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
            <span className="text-[var(--foreground-tertiary)]">Tema: </span>
            <span className="text-[var(--foreground-secondary)] italic">&ldquo;{output.legalQuery}&rdquo;</span>
          </div>
        )}
        {output.suggestedInstitutes?.length > 0 && (
          <div>
            <span className="text-[var(--foreground-tertiary)]">Istituti: </span>
            <span className="text-[var(--foreground-secondary)]">{output.suggestedInstitutes.join(", ")}</span>
          </div>
        )}
        {output.targetArticles && (
          <div>
            <span className="text-[var(--foreground-tertiary)]">Target: </span>
            <span className="text-[var(--foreground)]">{output.targetArticles}</span>
          </div>
        )}
      </div>
    );
  }

  if (phase === "corpus-search" && output?.articles?.length) {
    return (
      <div className="mt-1.5 pl-5 text-[11px]">
        <span className="text-[var(--foreground-tertiary)]">{output.articles.length} articoli: </span>
        <span className="text-[var(--foreground)]">
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
            <span className="text-[var(--foreground-tertiary)]">Fonti web: </span>
            <span className="text-[var(--foreground-secondary)]">
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
            <span className="text-[var(--foreground-tertiary)]">Tipo: </span>
            <span className="text-[var(--foreground-secondary)]">{output.documentTypeLabel}</span>
          </div>
        )}
        {output.relevantInstitutes?.length > 0 && (
          <div>
            <span className="text-[var(--foreground-tertiary)]">Istituti: </span>
            <span className="text-[var(--foreground-secondary)]">{output.relevantInstitutes.join(", ")}</span>
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
      <div className="space-y-3 mt-4 border-t border-[var(--border-subtle)] pt-4">
        <FormattedAnswer text={output.answer} />
        {output.citedArticles?.length > 0 && (
          <p className="text-xs text-[var(--foreground-tertiary)] mt-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            Fonti: {output.citedArticles.map((a: any) => a.reference).join(", ")}
          </p>
        )}
        {output.missingArticles?.length > 0 && (
          <p className="text-xs text-[var(--foreground-tertiary)]">
            Vedi anche: {output.missingArticles.join(", ")}
          </p>
        )}
        {output.followUpQuestions?.length > 0 && (
          <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
            <p className="text-[10px] text-[var(--foreground-tertiary)] mb-1">Approfondisci:</p>
            {output.followUpQuestions.map((q: string, i: number) => (
              <p key={i} className="text-xs text-[var(--foreground-secondary)]">&rarr; {q}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (phase === "advisor" && output) {
    return (
      <div className="space-y-3 mt-4 border-t border-[var(--border-subtle)] pt-4">
        {output.fairnessScore != null && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--foreground-secondary)]">Punteggio:</span>
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
        <p className="text-[15px] whitespace-pre-wrap leading-relaxed text-[var(--foreground)]/90">
          {output.summary}
        </p>
        {output.risks?.length > 0 && (
          <div className="mt-1 space-y-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {output.risks.map((r: any, i: number) => (
              <p key={i} className="text-xs text-red-700">&bull; {r.title}: {r.detail}</p>
            ))}
          </div>
        )}
        {output.actions?.length > 0 && (
          <div className="mt-1 space-y-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {output.actions.map((a: any, i: number) => (
              <p key={i} className="text-xs text-[var(--foreground-secondary)]">&rarr; {a.action}</p>
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
      <div className="rounded-xl border border-[var(--border-subtle)] px-4 py-3 text-xs" role="status" aria-live="polite">
        <div className="flex items-center gap-2">
          <StatusDot status="running" />
          <span className="font-medium text-[var(--foreground)]">{phaseName}</span>
          <span className="text-[var(--foreground-secondary)]">{RUNNING_MESSAGES[phase]}...</span>
        </div>
        {showContextMap && <ContextMap context={context} />}
      </div>
    );
  }

  // Error
  if (status === "error") {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50/50 px-4 py-3 text-xs" role="alert">
        <div className="flex items-center gap-2">
          <StatusDot status="error" />
          <span className="font-medium text-[var(--foreground)]">{phaseName}</span>
          <span className="text-red-700">{summary ?? "Errore"}</span>
        </div>
      </div>
    );
  }

  // Skipped
  if (status === "skipped") {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] px-4 py-3 text-xs" role="status" aria-live="polite">
        <div className="flex items-center gap-2">
          <StatusDot status="skipped" />
          <span className="font-medium text-[var(--foreground-secondary)]">{phaseName}</span>
          <span className="text-[var(--foreground-secondary)]">{summary ?? "Saltato"}</span>
        </div>
      </div>
    );
  }

  // Done
  const doneMessage = getDoneMessage(phase, output);

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] px-4 py-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-xs">
        <StatusDot status="done" />
        <span className="font-medium text-[var(--foreground)]">{phaseName}</span>
        {doneMessage && <span className="text-[var(--foreground-secondary)]">{doneMessage}</span>}
        {timing != null && (
          <span className="text-[var(--foreground-tertiary)] ml-auto text-[10px]">
            {(timing / 1000).toFixed(1)}s
          </span>
        )}
      </div>
      {isTerminal && output && <TerminalOutput phase={phase} output={output} />}
      {!isTerminal && output && <InlineDetail phase={phase} output={output} />}
    </div>
  );
}
