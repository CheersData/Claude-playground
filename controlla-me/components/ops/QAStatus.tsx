"use client";

import { ShieldCheck } from "lucide-react";

interface QAStatusProps {
  board: {
    recent: Array<{
      department: string;
      status: string;
      resultData?: Record<string, unknown> | null;
    }>;
  } | null;
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

  return (
    <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-400 flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4" />
        QA STATUS
      </h3>

      {!qaData ? (
        <p className="text-zinc-500 text-sm">Nessun report QA disponibile</p>
      ) : (
        <div className="space-y-2 text-sm">
          {qaData.unitTests && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Tests</span>
              <span className={qaData.unitTests.pass === qaData.unitTests.total ? "text-green-400" : "text-red-400"}>
                {qaData.unitTests.pass}/{qaData.unitTests.total}
              </span>
            </div>
          )}
          {qaData.typeCheck !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Types</span>
              <span className={qaData.typeCheck.pass ? "text-green-400" : "text-red-400"}>
                {qaData.typeCheck.pass ? "pass" : "fail"}
              </span>
            </div>
          )}
          {qaData.lint !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Lint</span>
              <span className={qaData.lint.pass ? "text-green-400" : "text-red-400"}>
                {qaData.lint.pass ? "pass" : "fail"}
              </span>
            </div>
          )}
          {qaData.testbook && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Testbook</span>
              <span className={qaData.testbook.accuracy >= 0.75 ? "text-green-400" : "text-yellow-400"}>
                {(qaData.testbook.accuracy * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
