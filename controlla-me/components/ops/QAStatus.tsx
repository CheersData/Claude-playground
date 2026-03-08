"use client";

import { ShieldCheck } from "lucide-react";

interface QAStatusProps {
  board: {
    recent: Array<{
      department: string;
      status: string;
      completedAt?: string | null;
      resultData?: Record<string, unknown> | null;
    }>;
  } | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 1) return "ora";
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1g fa";
  return `${days}g fa`;
}

export function QAStatus({ board }: QAStatusProps) {
  // Find latest QA task with result_data
  const latestQA = board?.recent?.find(
    (t) => t.department === "quality-assurance" && t.status === "done" && t.resultData
  );

  const qaData = latestQA?.resultData as {
    unitTests?: { pass: number; total: number };
    typeCheck?: { pass: boolean };
    lint?: { pass: boolean };
    testbook?: { accuracy: number };
  } | undefined;

  const lastRunAt = (latestQA as { completedAt?: string | null } | undefined)?.completedAt;

  return (
    <div className="bg-[var(--ops-surface)] rounded-xl p-5 border border-[var(--ops-border-subtle)]">
      <h3 className="text-[11px] font-semibold text-[var(--ops-muted)] flex items-center gap-2 mb-3 uppercase tracking-wider">
        <ShieldCheck className="w-4 h-4" />
        QA Status
        {lastRunAt && (
          <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-[var(--ops-muted)]">
            {timeAgo(lastRunAt)}
          </span>
        )}
      </h3>

      {!qaData ? (
        <p className="text-[var(--ops-muted)] text-sm">Nessun report QA disponibile</p>
      ) : (
        <div className="space-y-2 text-sm">
          {qaData.unitTests && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--ops-fg-muted)]">Tests</span>
              <span className={qaData.unitTests.pass === qaData.unitTests.total ? "text-[var(--ops-teal)]" : "text-[var(--ops-error)]"}>
                {qaData.unitTests.pass}/{qaData.unitTests.total}
              </span>
            </div>
          )}
          {qaData.typeCheck !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--ops-fg-muted)]">Types</span>
              <span className={qaData.typeCheck.pass ? "text-[var(--ops-teal)]" : "text-[var(--ops-error)]"}>
                {qaData.typeCheck.pass ? "pass" : "fail"}
              </span>
            </div>
          )}
          {qaData.lint !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--ops-fg-muted)]">Lint</span>
              <span className={qaData.lint.pass ? "text-[var(--ops-teal)]" : "text-[var(--ops-error)]"}>
                {qaData.lint.pass ? "pass" : "fail"}
              </span>
            </div>
          )}
          {qaData.testbook && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--ops-fg-muted)]">Testbook</span>
              <span className={qaData.testbook.accuracy >= 0.75 ? "text-[var(--ops-teal)]" : "text-[#FFC832]"}>
                {(qaData.testbook.accuracy * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
