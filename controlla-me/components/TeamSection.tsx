"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

/* ── Animated SVG avatar for each agent ── */
function AgentAvatar({
  variant,
  color,
  delay = 0,
}: {
  variant: "protocollista" | "analista" | "giurista" | "consulente";
  color: string;
  delay?: number;
}) {
  const common = {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.5, delay },
  };

  return (
    <motion.div {...common} className="relative w-16 h-16 md:w-20 md:h-20">
      <svg
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Background circle with glow */}
        <circle cx="40" cy="40" r="38" fill={`${color}10`} stroke={`${color}30`} strokeWidth="1.5" />
        <motion.circle
          cx="40"
          cy="40"
          r="38"
          fill="transparent"
          stroke={color}
          strokeWidth="1"
          strokeDasharray="8 6"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "40px 40px" }}
        />

        {/* Head */}
        <motion.circle
          cx="40"
          cy="26"
          r="10"
          fill={`${color}40`}
          stroke={color}
          strokeWidth="1.5"
          animate={{ y: [0, -1, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Body */}
        <motion.path
          d="M22 58 C22 44 32 38 40 38 C48 38 58 44 58 58"
          fill={`${color}25`}
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          animate={{ y: [0, -1, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.1 }}
        />

        {/* Variant-specific accessories */}
        {variant === "protocollista" && (
          <>
            {/* Clipboard */}
            <motion.rect
              x="50" y="30" width="12" height="16" rx="2"
              fill={`${color}30`} stroke={color} strokeWidth="1"
              animate={{ rotate: [-3, 3, -3] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: "56px 38px" }}
            />
            <line x1="53" y1="36" x2="59" y2="36" stroke={color} strokeWidth="1" opacity="0.6" />
            <line x1="53" y1="39" x2="58" y2="39" stroke={color} strokeWidth="1" opacity="0.6" />
            <line x1="53" y1="42" x2="57" y2="42" stroke={color} strokeWidth="1" opacity="0.6" />
          </>
        )}

        {variant === "analista" && (
          <>
            {/* Magnifying glass */}
            <motion.g
              animate={{ x: [0, 2, 0, -2, 0], y: [0, -1, 0, 1, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <circle cx="56" cy="32" r="7" fill="transparent" stroke={color} strokeWidth="1.5" />
              <line x1="61" y1="37" x2="66" y2="42" stroke={color} strokeWidth="2" strokeLinecap="round" />
            </motion.g>
          </>
        )}

        {variant === "giurista" && (
          <>
            {/* Balance scale */}
            <motion.g
              animate={{ rotate: [-4, 4, -4] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: "56px 30px" }}
            >
              <line x1="56" y1="24" x2="56" y2="30" stroke={color} strokeWidth="1.5" />
              <line x1="48" y1="30" x2="64" y2="30" stroke={color} strokeWidth="1.5" />
              <path d="M48 30 L46 36 L50 36 Z" fill={`${color}40`} stroke={color} strokeWidth="1" />
              <path d="M64 30 L62 36 L66 36 Z" fill={`${color}40`} stroke={color} strokeWidth="1" />
            </motion.g>
          </>
        )}

        {variant === "consulente" && (
          <>
            {/* Light bulb */}
            <motion.g
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <ellipse cx="57" cy="30" rx="7" ry="8" fill={`${color}30`} stroke={color} strokeWidth="1" />
              <rect x="54" y="37" width="6" height="3" rx="1" fill={color} opacity="0.5" />
              {/* Rays */}
              <line x1="57" y1="19" x2="57" y2="16" stroke={color} strokeWidth="1" opacity="0.5" />
              <line x1="65" y1="24" x2="67" y2="22" stroke={color} strokeWidth="1" opacity="0.5" />
              <line x1="49" y1="24" x2="47" y2="22" stroke={color} strokeWidth="1" opacity="0.5" />
              <line x1="66" y1="32" x2="69" y2="32" stroke={color} strokeWidth="1" opacity="0.5" />
              <line x1="48" y1="32" x2="45" y2="32" stroke={color} strokeWidth="1" opacity="0.5" />
            </motion.g>
          </>
        )}
      </svg>

      {/* Glow effect behind avatar */}
      <div
        className="absolute inset-0 rounded-full blur-xl opacity-20"
        style={{ background: color }}
      />
    </motion.div>
  );
}

/* ── Agent data ── */
const agents = [
  {
    name: "Luca",
    role: "Il Protocollista",
    variant: "protocollista" as const,
    phase: "classifier" as const,
    color: "#4ECDC4",
    description:
      "Legge il documento da cima a fondo. Capisce se è un preliminare, un contratto d'affitto, una bolletta. Identifica le parti, le leggi applicabili, le date chiave.",
    receives: null,
    passes: "tipo documento, parti coinvolte, leggi applicabili",
  },
  {
    name: "Marta",
    role: "L'Analista",
    variant: "analista" as const,
    phase: "analyzer" as const,
    color: "#FF6B6B",
    description:
      "Prende il contesto di Luca e rilegge ogni clausola col microscopio. Trova quelle sbilanciate, le trappole nascoste, le cose che mancano e dovrebbero esserci.",
    receives: "classificazione di Luca + testo originale",
    passes: "clausole rischiose, elementi mancanti, livello di rischio",
  },
  {
    name: "Giulia",
    role: "La Giurista",
    variant: "giurista" as const,
    phase: "investigator" as const,
    color: "#A78BFA",
    description:
      "Prende le clausole sospette di Marta e cerca le prove. Norme vigenti, sentenze della Cassazione, orientamenti giurisprudenziali. Se una clausola è illegale, lo trova.",
    receives: "classificazione di Luca + clausole di Marta",
    passes: "leggi, sentenze, pareri giuridici per ogni clausola",
  },
  {
    name: "Enzo",
    role: "Il Consulente",
    variant: "consulente" as const,
    phase: "advisor" as const,
    color: "#FFC832",
    description:
      "Riceve tutto il lavoro dei tre colleghi e lo traduce in linguaggio umano. Ti dice cosa rischi, cosa fare prima di firmare, e se ti serve un avvocato vero.",
    receives: "tutto: classificazione + analisi + indagine",
    passes: null,
  },
];

export default function TeamSection() {
  return (
    <div className="mt-28 max-w-[720px] w-full">
      {/* Section header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-14"
      >
        <p className="text-[11px] font-bold tracking-[3px] uppercase text-accent/70 mb-3">
          Il nostro studio
        </p>
        <h2 className="font-serif text-3xl md:text-4xl mb-4">
          Quattro teste, un obiettivo.
        </h2>
        <p className="text-base text-white/40 max-w-[480px] mx-auto leading-relaxed">
          Ogni agente lavora sul risultato del precedente.
          Il contesto si accumula, niente si perde.
        </p>
      </motion.div>

      {/* Agent cards */}
      <div className="flex flex-col gap-0">
        {agents.map((agent, i) => (
          <div key={agent.phase}>
            <motion.div
              initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="relative overflow-hidden bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 md:p-7"
            >
              {/* Subtle gradient accent on left */}
              <div
                className="absolute left-0 top-0 bottom-0 w-[2px]"
                style={{
                  background: `linear-gradient(to bottom, transparent, ${agent.color}60, transparent)`,
                }}
              />

              {/* Agent header with avatar */}
              <div className="flex items-center gap-5 mb-5">
                <AgentAvatar
                  variant={agent.variant}
                  color={agent.color}
                  delay={i * 0.15}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-xl font-bold">{agent.name}</h3>
                    <span
                      className="text-[10px] font-bold tracking-[2px] uppercase px-2.5 py-1 rounded-full"
                      style={{
                        color: agent.color,
                        background: `${agent.color}15`,
                        border: `1px solid ${agent.color}25`,
                      }}
                    >
                      {agent.role}
                    </span>
                  </div>
                  <p className="text-sm text-white/50 leading-relaxed">
                    {agent.description}
                  </p>
                </div>
              </div>

              {/* Context flow */}
              <div className="flex flex-col gap-2 ml-[84px] md:ml-[100px]">
                {agent.receives && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded-md bg-white/[0.05] text-white/30 font-medium shrink-0">
                      riceve
                    </span>
                    <span className="text-white/40">{agent.receives}</span>
                  </div>
                )}
                {agent.passes && (
                  <div className="flex items-start gap-2 text-xs">
                    <span
                      className="px-2 py-0.5 rounded-md font-medium shrink-0"
                      style={{
                        background: `${agent.color}15`,
                        color: `${agent.color}90`,
                      }}
                    >
                      passa
                    </span>
                    <span className="text-white/40">{agent.passes}</span>
                  </div>
                )}
                {!agent.passes && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded-md bg-green-500/10 text-green-400/60 font-medium shrink-0">
                      produce
                    </span>
                    <span className="text-white/40">
                      il report finale per te
                    </span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Arrow connector between cards */}
            {i < agents.length - 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3 }}
                className="flex justify-center py-2"
              >
                <div className="flex flex-col items-center gap-0.5 text-white/15">
                  <div className="w-px h-3 bg-current" />
                  <ArrowRight className="w-3.5 h-3.5 rotate-90" />
                </div>
              </motion.div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
