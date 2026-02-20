"use client";

import { motion } from "framer-motion";

/* ── Animated SVG avatar for each agent ── */
export function AgentAvatar({
  variant,
  color,
  size = "md",
  delay = 0,
}: {
  variant: "catalogatore" | "analista" | "giurista" | "consulente";
  color: string;
  size?: "md" | "lg" | "xl";
  delay?: number;
}) {
  const sizeClass = {
    md: "w-16 h-16 md:w-20 md:h-20",
    lg: "w-24 h-24 md:w-28 md:h-28",
    xl: "w-32 h-32 md:w-40 md:h-40",
  }[size];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay }}
      className={`relative ${sizeClass}`}
    >
      <svg
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Background circle with glow */}
        <circle cx="40" cy="40" r="38" fill={`${color}10`} stroke={`${color}30`} strokeWidth="1.5" />
        <motion.circle
          cx="40" cy="40" r="38"
          fill="transparent" stroke={color} strokeWidth="1"
          strokeDasharray="8 6"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "40px 40px" }}
        />

        {/* Head */}
        <motion.circle
          cx="40" cy="26" r="10"
          fill={`${color}40`} stroke={color} strokeWidth="1.5"
          animate={{ y: [0, -1, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Body */}
        <motion.path
          d="M22 58 C22 44 32 38 40 38 C48 38 58 44 58 58"
          fill={`${color}25`} stroke={color} strokeWidth="1.5" strokeLinecap="round"
          animate={{ y: [0, -1, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.1 }}
        />

        {/* Variant-specific accessories */}
        {variant === "catalogatore" && (
          <>
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
            <motion.g
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <ellipse cx="57" cy="30" rx="7" ry="8" fill={`${color}30`} stroke={color} strokeWidth="1" />
              <rect x="54" y="37" width="6" height="3" rx="1" fill={color} opacity="0.5" />
              <line x1="57" y1="19" x2="57" y2="16" stroke={color} strokeWidth="1" opacity="0.5" />
              <line x1="65" y1="24" x2="67" y2="22" stroke={color} strokeWidth="1" opacity="0.5" />
              <line x1="49" y1="24" x2="47" y2="22" stroke={color} strokeWidth="1" opacity="0.5" />
              <line x1="66" y1="32" x2="69" y2="32" stroke={color} strokeWidth="1" opacity="0.5" />
              <line x1="48" y1="32" x2="45" y2="32" stroke={color} strokeWidth="1" opacity="0.5" />
            </motion.g>
          </>
        )}
      </svg>

      {/* Glow effect */}
      <div
        className="absolute inset-0 rounded-full blur-xl opacity-20"
        style={{ background: color }}
      />
    </motion.div>
  );
}

/* ── Agent data (exported so page.tsx can use Leo's info) ── */
export const agents = [
  {
    name: "Leo",
    role: "Il Catalogatore",
    variant: "catalogatore" as const,
    phase: "classifier" as const,
    color: "#4ECDC4",
    shortDesc: "Classifica e protocolla il documento",
    description:
      "Legge il documento da cima a fondo. Capisce se è un preliminare, un contratto d'affitto, una bolletta. Identifica le parti, le leggi applicabili, le date chiave.",
  },
  {
    name: "Marta",
    role: "L'Analista",
    variant: "analista" as const,
    phase: "analyzer" as const,
    color: "#FF6B6B",
    shortDesc: "Trova clausole rischiose e trappole",
    description:
      "Rilegge ogni clausola col microscopio. Trova quelle sbilanciate, le trappole nascoste, le cose che mancano e dovrebbero esserci.",
  },
  {
    name: "Giulia",
    role: "La Giurista",
    variant: "giurista" as const,
    phase: "investigator" as const,
    color: "#A78BFA",
    shortDesc: "Cerca norme, sentenze, precedenti",
    description:
      "Cerca le prove nelle norme vigenti, sentenze della Cassazione, orientamenti giurisprudenziali. Se una clausola è illegale, lo trova.",
  },
  {
    name: "Enzo",
    role: "Il Consulente",
    variant: "consulente" as const,
    phase: "advisor" as const,
    color: "#FFC832",
    shortDesc: "Traduce tutto in linguaggio umano",
    description:
      "Riceve il lavoro di tutti e lo traduce per te. Ti dice cosa rischi, cosa fare prima di firmare, e se ti serve un avvocato vero.",
  },
];

/* ── Team showcase grid (2x2) ── */
export default function TeamSection() {
  return (
    <div className="w-full max-w-[800px]">
      {/* Section header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <p className="text-[11px] font-bold tracking-[3px] uppercase text-accent/70 mb-3">
          Il nostro studio
        </p>
        <h2 className="font-serif text-3xl md:text-4xl mb-4">
          Quattro consulenti.{" "}
          <span className="italic bg-gradient-to-br from-accent to-amber-400 bg-clip-text text-transparent">
            Zero fronzoli.
          </span>
        </h2>
        <p className="text-base text-white/40 max-w-[480px] mx-auto leading-relaxed">
          Ognuno è specializzato in una fase diversa dell&apos;analisi.
          Lavorano in sequenza, il contesto si accumula, niente si perde.
        </p>
      </motion.div>

      {/* 2x2 Agent grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {agents.map((agent, i) => (
          <motion.div
            key={agent.phase}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className="group relative overflow-hidden bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 hover:bg-white/[0.05] hover:border-white/[0.1] transition-all duration-300"
          >
            {/* Accent glow on hover */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
              style={{
                background: `radial-gradient(circle at 50% 0%, ${agent.color}08, transparent 70%)`,
              }}
            />

            {/* Number badge */}
            <div
              className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ color: agent.color, background: `${agent.color}15` }}
            >
              {i + 1}
            </div>

            {/* Avatar */}
            <div className="flex justify-center mb-4">
              <AgentAvatar
                variant={agent.variant}
                color={agent.color}
                size="lg"
                delay={i * 0.12}
              />
            </div>

            {/* Name and role */}
            <div className="text-center">
              <h3 className="text-lg font-bold mb-1">{agent.name}</h3>
              <span
                className="inline-block text-[10px] font-bold tracking-[2px] uppercase px-3 py-1 rounded-full mb-3"
                style={{
                  color: agent.color,
                  background: `${agent.color}15`,
                  border: `1px solid ${agent.color}25`,
                }}
              >
                {agent.role}
              </span>
              <p className="text-sm text-white/45 leading-relaxed">
                {agent.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pipeline hint */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mt-8 flex items-center justify-center gap-3 text-white/20 text-sm"
      >
        {agents.map((agent, i) => (
          <div key={agent.phase} className="flex items-center gap-3">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: agent.color }}
            />
            <span className="text-white/35">{agent.name}</span>
            {i < agents.length - 1 && (
              <svg width="16" height="8" viewBox="0 0 16 8" className="text-white/15">
                <path d="M0 4h12M10 1l3 3-3 3" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
