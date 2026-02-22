"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ─────────────────────────────────────────────────────
   Illustrated character avatars — distinct personalities
   ───────────────────────────────────────────────────── */

export function AgentAvatar({
  variant,
  color,
  size = "md",
  delay = 0,
}: {
  variant: "catalogatore" | "analista" | "giurista" | "consulente";
  color: string;
  size?: "sm" | "md" | "lg" | "xl";
  delay?: number;
}) {
  const sizeClass = {
    sm: "w-12 h-12",
    md: "w-20 h-20 md:w-24 md:h-24",
    lg: "w-28 h-28 md:w-36 md:h-36",
    xl: "w-36 h-36 md:w-44 md:h-44",
  }[size];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay, ease: "backOut" }}
      className={`relative ${sizeClass}`}
    >
      <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <defs>
          <radialGradient id={`bg-${variant}`} cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0.03" />
          </radialGradient>
        </defs>

        <circle cx="100" cy="100" r="96" fill={`url(#bg-${variant})`} stroke={color} strokeOpacity="0.2" strokeWidth="1.5" />
        <motion.circle
          cx="100" cy="100" r="96"
          fill="none" stroke={color} strokeOpacity="0.15" strokeWidth="1"
          strokeDasharray="6 8"
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "100px 100px" }}
        />

        {variant === "catalogatore" && <ReadCharacter color={color} />}
        {variant === "analista" && <MartaCharacter color={color} />}
        {variant === "giurista" && <GiuliaCharacter color={color} />}
        {variant === "consulente" && <EnzoCharacter color={color} />}
      </svg>

      <div className="absolute inset-0 rounded-full blur-2xl opacity-15 pointer-events-none" style={{ background: color }} />
    </motion.div>
  );
}

/* ── Futuristic animated avatar cores ── */

function ReadCharacter({ color }: { color: string }) {
  return (
    <g>
      {/* Central hexagonal core */}
      <motion.polygon
        points="100,55 130,72 130,108 100,125 70,108 70,72"
        fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.6"
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "100px 90px" }}
      />
      <motion.polygon
        points="100,62 124,76 124,104 100,118 76,104 76,76"
        fill={color} fillOpacity="0.06" stroke={color} strokeWidth="1" strokeOpacity="0.3"
        animate={{ rotate: [360, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "100px 90px" }}
      />
      {/* Eye — scanning beam */}
      <motion.circle cx="100" cy="90" r="16" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="2" />
      <motion.circle cx="100" cy="90" r="8" fill={color} fillOpacity="0.25"
        animate={{ r: [8, 12, 8], fillOpacity: [0.25, 0.15, 0.25] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle cx="100" cy="90" r="4" fill={color}
        animate={{ opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Scan line sweeping down */}
      <motion.line x1="72" y1="60" x2="128" y2="60" stroke={color} strokeWidth="1.5" strokeOpacity="0.6"
        animate={{ y1: [60, 120, 60], y2: [60, 120, 60] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Data particles orbiting */}
      {[0, 120, 240].map((angle) => (
        <motion.circle key={angle} r="2.5" fill={color} fillOpacity="0.7"
          animate={{
            cx: [100 + 42 * Math.cos((angle * Math.PI) / 180), 100 + 42 * Math.cos(((angle + 360) * Math.PI) / 180)],
            cy: [90 + 42 * Math.sin((angle * Math.PI) / 180), 90 + 42 * Math.sin(((angle + 360) * Math.PI) / 180)],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />
      ))}
      {/* Corner brackets — "reading frame" */}
      <path d="M62 62 L62 52 L72 52" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" />
      <path d="M138 62 L138 52 L128 52" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" />
      <path d="M62 118 L62 128 L72 128" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" />
      <path d="M138 118 L138 128 L128 128" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round" />
    </g>
  );
}

function MartaCharacter({ color }: { color: string }) {
  return (
    <g>
      {/* Diamond / rhombus frame */}
      <motion.polygon
        points="100,48 148,90 100,132 52,90"
        fill={color} fillOpacity="0.04" stroke={color} strokeWidth="1.5" strokeOpacity="0.5"
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "100px 90px" }}
      />
      {/* Inner diamond */}
      <motion.polygon
        points="100,60 136,90 100,120 64,90"
        fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" strokeOpacity="0.3"
        animate={{ scale: [1.04, 1, 1.04] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "100px 90px" }}
      />
      {/* Central eye — intense focus */}
      <motion.circle cx="100" cy="90" r="18" fill="none" stroke={color} strokeWidth="2"
        animate={{ strokeOpacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle cx="100" cy="90" r="10" fill={color} fillOpacity="0.2" />
      <motion.circle cx="100" cy="90" r="5" fill={color}
        animate={{ r: [5, 7, 5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Alert rays — pulsing detection */}
      {[0, 60, 120, 180, 240, 300].map((angle, i) => (
        <motion.line key={angle}
          x1={100 + 24 * Math.cos((angle * Math.PI) / 180)} y1={90 + 24 * Math.sin((angle * Math.PI) / 180)}
          x2={100 + 36 * Math.cos((angle * Math.PI) / 180)} y2={90 + 36 * Math.sin((angle * Math.PI) / 180)}
          stroke={color} strokeWidth="2" strokeLinecap="round"
          animate={{ opacity: [0.2, 0.8, 0.2], strokeWidth: [1.5, 2.5, 1.5] }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
      {/* Warning triangles orbiting */}
      <motion.g
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "100px 90px" }}
      >
        <polygon points="100,48 104,56 96,56" fill={color} fillOpacity="0.6" />
        <polygon points="148,90 140,94 140,86" fill={color} fillOpacity="0.6" />
        <polygon points="100,132 96,124 104,124" fill={color} fillOpacity="0.6" />
      </motion.g>
    </g>
  );
}

function GiuliaCharacter({ color }: { color: string }) {
  return (
    <g>
      {/* Outer ring — authority */}
      <motion.circle cx="100" cy="90" r="46" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.3"
        strokeDasharray="4 6"
        animate={{ rotate: [0, -360] }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "100px 90px" }}
      />
      {/* Scale of justice — central symbol */}
      <line x1="100" y1="60" x2="100" y2="112" stroke={color} strokeWidth="2" strokeOpacity="0.6" />
      <line x1="74" y1="72" x2="126" y2="72" stroke={color} strokeWidth="2" strokeOpacity="0.6" strokeLinecap="round" />
      {/* Left pan */}
      <motion.g
        animate={{ y: [0, 4, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <line x1="74" y1="72" x2="74" y2="84" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
        <path d="M62 84 Q68 92 74 92 Q80 92 86 84 Z" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
        <motion.circle cx="74" cy="86" r="2" fill={color}
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </motion.g>
      {/* Right pan */}
      <motion.g
        animate={{ y: [4, 0, 4] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <line x1="126" y1="72" x2="126" y2="84" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
        <path d="M114 84 Q120 92 126 92 Q132 92 138 84 Z" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1" strokeOpacity="0.4" />
        <motion.circle cx="126" cy="86" r="2" fill={color}
          animate={{ opacity: [0.7, 0.3, 0.7] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </motion.g>
      {/* Crown / top */}
      <circle cx="100" cy="58" r="4" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.5" />
      {/* Base pedestal */}
      <rect x="88" y="112" width="24" height="4" rx="2" fill={color} fillOpacity="0.2" />
      <rect x="92" y="116" width="16" height="3" rx="1.5" fill={color} fillOpacity="0.12" />
      {/* Floating paragraph symbols */}
      <motion.text x="56" y="108" fill={color} fillOpacity="0.5" fontSize="14" fontFamily="serif"
        animate={{ opacity: [0.3, 0.6, 0.3], y: [108, 104, 108] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >§</motion.text>
      <motion.text x="140" y="68" fill={color} fillOpacity="0.5" fontSize="14" fontFamily="serif"
        animate={{ opacity: [0.3, 0.6, 0.3], y: [68, 64, 68] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
      >§</motion.text>
    </g>
  );
}

function EnzoCharacter({ color }: { color: string }) {
  return (
    <g>
      {/* Warm radiating circles */}
      <motion.circle cx="100" cy="90" r="44" fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.15"
        animate={{ r: [44, 48, 44], strokeOpacity: [0.15, 0.08, 0.15] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle cx="100" cy="90" r="34" fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.2"
        animate={{ r: [34, 38, 34], strokeOpacity: [0.2, 0.12, 0.2] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      />
      {/* Central speech bubble — the advisor speaks */}
      <motion.g
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "100px 85px" }}
      >
        <rect x="72" y="68" width="56" height="36" rx="18" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" strokeOpacity="0.5" />
        <polygon points="95,104 100,114 105,104" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" strokeOpacity="0.5" strokeLinejoin="round" />
        {/* Dots inside — typing/speaking */}
        <motion.circle cx="88" cy="86" r="3" fill={color}
          animate={{ opacity: [0.3, 0.9, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
        />
        <motion.circle cx="100" cy="86" r="3" fill={color}
          animate={{ opacity: [0.3, 0.9, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
        />
        <motion.circle cx="112" cy="86" r="3" fill={color}
          animate={{ opacity: [0.3, 0.9, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }}
        />
      </motion.g>
      {/* Warm light rays emanating outward */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <motion.line key={angle}
          x1={100 + 30 * Math.cos((angle * Math.PI) / 180)} y1={90 + 30 * Math.sin((angle * Math.PI) / 180)}
          x2={100 + 40 * Math.cos((angle * Math.PI) / 180)} y2={90 + 40 * Math.sin((angle * Math.PI) / 180)}
          stroke={color} strokeWidth="1.5" strokeLinecap="round"
          animate={{ opacity: [0.1, 0.4, 0.1] }}
          transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
        />
      ))}
      {/* Floating sparkle particles */}
      {[60, 180, 300].map((angle) => (
        <motion.circle key={angle} r="2" fill={color} fillOpacity="0.6"
          animate={{
            cx: [100 + 20 * Math.cos((angle * Math.PI) / 180), 100 + 48 * Math.cos((angle * Math.PI) / 180)],
            cy: [90 + 20 * Math.sin((angle * Math.PI) / 180), 90 + 48 * Math.sin((angle * Math.PI) / 180)],
            opacity: [0.8, 0],
            r: [2, 0.5],
          }}
          transition={{ duration: 3, repeat: Infinity, delay: angle / 200, ease: "easeOut" }}
        />
      ))}
    </g>
  );
}

/* ── Agent data ── */
export const agents = [
  {
    name: "Read",
    role: "Il Catalogatore",
    variant: "catalogatore" as const,
    phase: "classifier" as const,
    color: "#4ECDC4",
    tagline: "Legge tutto, non dimentica niente.",
    description: "Legge il documento da cima a fondo. Identifica tipo, parti coinvolte, leggi applicabili, date chiave.",
    hoverQuotes: [
      "Dammi 10 secondi e ti dico che documento hai in mano.",
      "Contratto d'affitto? Preliminare? Lo capisco al volo.",
      "Ogni dettaglio conta. Io non ne perdo neanche uno.",
    ],
    whatHeDoes: [
      "Identifica il tipo di documento",
      "Estrae le parti coinvolte",
      "Trova le leggi applicabili",
      "Cataloga le date chiave",
    ],
  },
  {
    name: "Understand",
    role: "L'Analista",
    variant: "analista" as const,
    phase: "analyzer" as const,
    color: "#FF6B6B",
    tagline: "Se c'è una trappola, la trova.",
    description: "Rilegge ogni clausola col microscopio. Trova quelle sbilanciate, le trappole nascoste, le cose che mancano.",
    hoverQuotes: [
      "Quella clausola a pagina 7? Non mi piace per niente.",
      "Hanno scritto 'salvo diverso accordo'... classica trappola.",
      "Mancano almeno 3 clausole che dovrebbero esserci.",
    ],
    whatHeDoes: [
      "Analizza ogni clausola in dettaglio",
      "Trova clausole sbilanciate",
      "Identifica le trappole nascoste",
      "Segnala cosa manca",
    ],
  },
  {
    name: "Investigate",
    role: "La Giurista",
    variant: "giurista" as const,
    phase: "investigator" as const,
    color: "#A78BFA",
    tagline: "La legge dalla sua parte. E dalla tua.",
    description: "Cerca prove nelle norme vigenti, sentenze della Cassazione, orientamenti giurisprudenziali.",
    hoverQuotes: [
      "Art. 1341 c.c. — quella clausola è vessatoria.",
      "La Cassazione si è già espressa su questo. A tuo favore.",
      "Tre sentenze confermano: questa clausola non vale nulla.",
    ],
    whatHeDoes: [
      "Cerca norme e articoli di legge",
      "Trova sentenze della Cassazione",
      "Verifica la legalità delle clausole",
      "Cita i precedenti rilevanti",
    ],
  },
  {
    name: "Advisor",
    role: "Il Consulente",
    variant: "consulente" as const,
    phase: "advisor" as const,
    color: "#FFC832",
    tagline: "Te lo spiega come un amico avvocato.",
    description: "Riceve il lavoro di tutti e lo traduce per te. Ti dice cosa rischi e cosa fare.",
    hoverQuotes: [
      "In parole povere? Non firmare. Non ancora.",
      "Rischi una penale da 5.000 euro. Ti spiego perché.",
      "Tre cose da fare prima di firmare. Te le dico io.",
    ],
    whatHeDoes: [
      "Traduce in linguaggio semplice",
      "Ti dice cosa rischi davvero",
      "Consiglia cosa fare prima di firmare",
      "Segnala se serve un avvocato vero",
    ],
  },
];

/* ── Interactive agent card with hover speech bubble ── */
function AgentCard({ agent, index }: { agent: typeof agents[number]; index: number }) {
  const [hovered, setHovered] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);

  const handleMouseEnter = () => {
    setHovered(true);
    setQuoteIndex(Math.floor(Math.random() * agent.hoverQuotes.length));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
      className="group relative cursor-pointer"
    >
      {/* Card */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-white shadow-sm backdrop-blur-sm transition-all duration-500 hover:border-border"
        style={{
          boxShadow: hovered ? `0 0 60px ${agent.color}15, 0 0 120px ${agent.color}08` : "none",
        }}
      >
        {/* Animated gradient border on hover */}
        <div
          className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: `linear-gradient(135deg, ${agent.color}15, transparent 40%, transparent 60%, ${agent.color}10)`,
          }}
        />

        {/* Top glow stripe */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ background: `linear-gradient(90deg, transparent, ${agent.color}80, transparent)` }}
        />

        <div className="relative p-6 md:p-8">
          {/* Phase badge */}
          <div className="absolute top-5 right-5 flex items-center gap-2">
            <motion.div
              className="w-2 h-2 rounded-full"
              style={{ background: agent.color }}
              animate={hovered ? { scale: [1, 1.5, 1] } : {}}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className="text-[10px] font-bold tracking-[2px] uppercase" style={{ color: `${agent.color}90` }}>
              Fase {index + 1}
            </span>
          </div>

          {/* Avatar + Speech bubble layout */}
          <div className="flex flex-col items-center text-center">
            {/* Avatar with hover scale */}
            <motion.div
              animate={hovered ? { scale: 1.08 } : { scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="relative mb-4"
            >
              <AgentAvatar
                variant={agent.variant}
                color={agent.color}
                size="lg"
                delay={index * 0.1}
              />
              {/* Hover glow ring */}
              <motion.div
                className="absolute inset-[-8px] rounded-full pointer-events-none"
                style={{ border: `2px solid ${agent.color}` }}
                animate={hovered ? { opacity: 0.3, scale: 1.05 } : { opacity: 0, scale: 1 }}
                transition={{ duration: 0.3 }}
              />
            </motion.div>

            {/* Speech bubble on hover */}
            <AnimatePresence>
              {hovered && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  className="w-full mb-4"
                >
                  <div
                    className="relative rounded-2xl px-5 py-3.5 text-sm leading-relaxed backdrop-blur-md"
                    style={{
                      background: `${agent.color}12`,
                      border: `1px solid ${agent.color}30`,
                      color: `${agent.color}DD`,
                    }}
                  >
                    {/* Speech arrow */}
                    <div
                      className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45"
                      style={{ background: `${agent.color}12`, borderTop: `1px solid ${agent.color}30`, borderLeft: `1px solid ${agent.color}30` }}
                    />
                    <span className="relative z-10 font-medium italic">
                      &ldquo;{agent.hoverQuotes[quoteIndex]}&rdquo;
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Name + role */}
            <h3 className="text-xl md:text-2xl font-bold mb-1">{agent.name}</h3>
            <span
              className="inline-block text-[10px] font-bold tracking-[2px] uppercase px-3 py-1 rounded-full mb-3"
              style={{ color: agent.color, background: `${agent.color}15`, border: `1px solid ${agent.color}25` }}
            >
              {agent.role}
            </span>

            {/* Tagline (visible when not hovered) */}
            <AnimatePresence mode="wait">
              {!hovered ? (
                <motion.p
                  key="tagline"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="font-serif italic text-foreground-tertiary text-sm mb-4"
                >
                  &ldquo;{agent.tagline}&rdquo;
                </motion.p>
              ) : null}
            </AnimatePresence>

            {/* What they do */}
            <ul className="space-y-1.5 text-left w-full">
              {agent.whatHeDoes.map((item, j) => (
                <motion.li
                  key={j}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: 0.15 + j * 0.06 }}
                  className="flex items-center gap-2.5 text-sm text-foreground-secondary"
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: agent.color }} />
                  {item}
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Team showcase ── */
export default function TeamSection() {
  return (
    <div className="w-full max-w-[960px]">
      {/* Section header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-14"
      >
        <p className="text-[11px] font-bold tracking-[3px] uppercase text-accent/70 mb-3">
          Conosci il team
        </p>
        <h2 className="font-serif text-3xl md:text-5xl mb-5">
          Quattro menti.{" "}
          <span className="italic bg-gradient-to-br from-accent to-amber-400 bg-clip-text text-transparent">
            Una missione.
          </span>
        </h2>
        <p className="text-base md:text-lg text-foreground-secondary max-w-[520px] mx-auto leading-relaxed">
          Passa il mouse su ognuno per sentire cosa ha da dire.
        </p>
      </motion.div>

      {/* 2x2 Interactive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {agents.map((agent, i) => (
          <AgentCard key={agent.phase} agent={agent} index={i} />
        ))}
      </div>

      {/* Pipeline flow */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mt-10 flex items-center justify-center gap-2 md:gap-3 flex-wrap"
      >
        {agents.map((agent, i) => (
          <div key={agent.phase} className="flex items-center gap-2 md:gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: `${agent.color}10` }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: agent.color }} />
              <span className="text-sm font-medium" style={{ color: `${agent.color}CC` }}>{agent.name}</span>
            </div>
            {i < agents.length - 1 && (
              <svg width="20" height="10" viewBox="0 0 20 10" className="text-foreground-tertiary shrink-0">
                <path d="M0 5h16M14 2l3 3-3 3" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
