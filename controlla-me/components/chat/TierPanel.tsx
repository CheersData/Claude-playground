"use client";

import { motion } from "framer-motion";
import { X, Zap, Briefcase, Crown } from "lucide-react";
import type { TierName } from "./types";

interface TierPanelProps {
  currentTier: TierName;
  onTierChange: (tier: TierName) => void;
  onClose: () => void;
}

const TIERS: Array<{
  id: TierName;
  label: string;
  icon: typeof Zap;
  desc: string;
  models: string;
  cost: string;
  bg: string;
  border: string;
  text: string;
  iconColor: string;
}> = [
  {
    id: "intern",
    label: "Intern",
    icon: Zap,
    desc: "Modelli gratuiti. Veloce, zero costi.",
    models: "Cerebras, Groq, Mistral free",
    cost: "~gratis",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    iconColor: "#059669",
  },
  {
    id: "associate",
    label: "Associate",
    icon: Briefcase,
    desc: "Modelli intermedi. Buon bilanciamento qualita/costo.",
    models: "Gemini Flash/Pro, Haiku",
    cost: "~$0.01/analisi",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    iconColor: "#2563EB",
  },
  {
    id: "partner",
    label: "Partner",
    icon: Crown,
    desc: "Modelli top-tier. Massima qualita.",
    models: "Sonnet, GPT-5",
    cost: "~$0.05/analisi",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    iconColor: "#D97706",
  },
];

export default function TierPanel({ currentTier, onTierChange, onClose }: TierPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", duration: 0.3 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-serif text-lg text-[#1A1A2E]">Scegli il tier</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4 text-[#6B6B6B]" />
          </button>
        </div>

        {/* Tier options */}
        <div className="p-4 space-y-3">
          {TIERS.map((t) => {
            const isActive = t.id === currentTier;
            return (
              <button
                key={t.id}
                onClick={() => onTierChange(t.id)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  isActive
                    ? `${t.bg} ${t.border}`
                    : "bg-white border-gray-100 hover:border-gray-200"
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isActive ? t.bg : "bg-gray-50"
                    }`}
                  >
                    <t.icon
                      className="w-4.5 h-4.5"
                      style={{ color: isActive ? t.iconColor : "#9B9B9B" }}
                    />
                  </div>
                  <div>
                    <span className={`font-medium text-sm ${isActive ? t.text : "text-[#1A1A2E]"}`}>
                      {t.label}
                    </span>
                    {isActive && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-white/60">
                        attivo
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[#6B6B6B] mb-1">{t.desc}</p>
                <div className="flex items-center justify-between text-[10px] text-[#9B9B9B]">
                  <span>{t.models}</span>
                  <span className="font-medium">{t.cost}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-[10px] text-[#9B9B9B] text-center">
            Il tier determina la qualita dei modelli AI usati per l&apos;analisi.
            Catene di fallback automatiche in caso di errore.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
