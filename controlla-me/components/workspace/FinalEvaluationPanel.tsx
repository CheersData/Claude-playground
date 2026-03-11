"use client";

import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle, Scale, Gavel, TrendingUp, CheckSquare, Phone } from "lucide-react";
import Link from "next/link";
import type { AdvisorResult, MultiDimensionalScore } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getScoreColor(value: number): string {
  if (value >= 9) return "#2ECC40";
  if (value >= 7) return "#7BC67E";
  if (value >= 5) return "#FF851B";
  if (value >= 3) return "#E8601C";
  return "#FF4136";
}

// ── Large fairness circle ─────────────────────────────────────────────────────

function BigFairnessScore({ score }: { score: number }) {
  const color = getScoreColor(score);
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (score / 10) * circumference;

  const label =
    score >= 8 ? "Contratto equilibrato" :
    score >= 6 ? "Alcune criticità" :
    score >= 4 ? "Attenzione richiesta" :
    "Contratto squilibrato";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="8" />
          <motion.circle
            cx="60" cy="60" r="52"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
          />
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, type: "spring" }}
            className="text-3xl font-bold"
            style={{ color }}
          >
            {score}
          </motion.span>
          <span className="text-xs text-gray-400">/10</span>
        </div>
      </div>
      <p className="text-sm font-medium text-gray-600">{label}</p>
    </div>
  );
}

// ── Score bars ────────────────────────────────────────────────────────────────

const SCORE_ITEMS: Array<{
  key: keyof MultiDimensionalScore;
  label: string;
  Icon: React.ElementType;
}> = [
  { key: "contractEquity", label: "Equità contrattuale", Icon: Scale },
  { key: "legalCoherence", label: "Coerenza legale", Icon: Gavel },
  { key: "practicalCompliance", label: "Conformità pratica", Icon: TrendingUp },
  { key: "completeness", label: "Completezza", Icon: CheckSquare },
];

function ScoreBars({ scores }: { scores: MultiDimensionalScore }) {
  return (
    <div className="space-y-3">
      {SCORE_ITEMS.map(({ key, label, Icon }, i) => {
        const value = scores[key] ?? 0;
        const color = getScoreColor(value);
        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + i * 0.1 }}
            className="flex items-center gap-3"
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${color}15` }}>
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-gray-600">{label}</span>
                <span className="text-xs font-bold ml-2 flex-shrink-0" style={{ color }}>
                  {value}<span className="text-gray-300 font-normal">/10</span>
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(value / 10) * 100}%` }}
                  transition={{ duration: 1, ease: "easeOut", delay: 0.6 + i * 0.1 }}
                />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Risk cards ────────────────────────────────────────────────────────────────

function RiskCards({ risks, onArticleClick }: {
  risks: AdvisorResult["risks"];
  onArticleClick: (ref: string) => void;
}) {
  const severityColor = { alta: "#ef4444", media: "#f59e0b", bassa: "#22c55e" };
  const severityLabel = { alta: "Alta", media: "Media", bassa: "Bassa" };

  return (
    <div className="space-y-3">
      {risks.map((risk, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 + i * 0.1 }}
          className="rounded-xl border p-4"
          style={{ borderColor: `${severityColor[risk.severity]}30`, backgroundColor: `${severityColor[risk.severity]}05` }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: severityColor[risk.severity] }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm text-gray-800">{risk.title}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{
                  backgroundColor: `${severityColor[risk.severity]}15`,
                  color: severityColor[risk.severity]
                }}>
                  {severityLabel[risk.severity]}
                </span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{risk.detail}</p>
              {risk.legalBasis && (
                <button
                  onClick={() => onArticleClick(risk.legalBasis)}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium transition-all hover:scale-105"
                  style={{ color: "#FF6B35" }}
                >
                  📖 {risk.legalBasis}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ── Action steps ──────────────────────────────────────────────────────────────

function ActionSteps({ actions }: { actions: AdvisorResult["actions"] }) {
  return (
    <div className="space-y-3">
      {actions.map((action, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 + i * 0.1 }}
          className="flex items-start gap-3"
        >
          <div className="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
            {i + 1}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">{action.action}</p>
            {action.rationale && (
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{action.rationale}</p>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ── Main FinalEvaluationPanel ─────────────────────────────────────────────────

interface FinalEvaluationPanelProps {
  result: AdvisorResult;
  sessionId: string | null;
  onArticleClick: (ref: string) => void;
}

export default function FinalEvaluationPanel({ result, sessionId, onArticleClick }: FinalEvaluationPanelProps) {
  const { fairnessScore, scores, risks, actions, summary, needsLawyer } = result;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm"
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-50 bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-2 mb-1">
          <Scale className="w-5 h-5 text-accent" />
          <h2 className="font-bold text-gray-800">Valutazione Finale</h2>
          <div className="ml-auto">
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
        </div>
        {summary && <p className="text-sm text-gray-500 leading-relaxed">{summary}</p>}
      </div>

      <div className="p-6 space-y-8">
        {/* Score section */}
        <div className="flex gap-6 items-start">
          <BigFairnessScore score={fairnessScore} />
          {scores && (
            <div className="flex-1 min-w-0">
              <ScoreBars scores={scores} />
            </div>
          )}
        </div>

        {/* Risks */}
        {risks && risks.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              Rischi identificati
            </h3>
            <RiskCards risks={risks} onArticleClick={onArticleClick} />
          </div>
        )}

        {/* Actions */}
        {actions && actions.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              Cosa fare
            </h3>
            <ActionSteps actions={actions} />
          </div>
        )}

        {/* Lawyer CTA */}
        {needsLawyer && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8 }}
            className="rounded-xl p-4 bg-amber-50 border border-amber-200"
          >
            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800 text-sm">Consulta un avvocato</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  Data la complessità delle criticità rilevate, ti consigliamo di consultare un professionista legale prima di firmare.
                </p>
                {sessionId && (
                  <Link href={`/analysis/${sessionId}`}
                    className="inline-block mt-2 text-xs font-medium text-amber-700 underline hover:text-amber-900">
                    Vedi analisi completa →
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
