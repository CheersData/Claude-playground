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

        {variant === "catalogatore" && <LeoCharacter color={color} />}
        {variant === "analista" && <MartaCharacter color={color} />}
        {variant === "giurista" && <GiuliaCharacter color={color} />}
        {variant === "consulente" && <EnzoCharacter color={color} />}
      </svg>

      <div className="absolute inset-0 rounded-full blur-2xl opacity-15 pointer-events-none" style={{ background: color }} />
    </motion.div>
  );
}

/* ── Character SVGs (same detailed illustrations) ── */

function LeoCharacter({ color }: { color: string }) {
  return (
    <g>
      <motion.g animate={{ y: [0, -1.5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
        <path d="M50 175 C50 140 70 125 100 120 C130 125 150 140 150 175" fill={color} fillOpacity="0.8" />
        <path d="M85 125 L100 140 L115 125" fill="none" stroke="#1A1A1A" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" />
        <path d="M93 132 L100 136 L107 132 L100 128 Z" fill="#1A1A1A" fillOpacity="0.6" />
      </motion.g>
      <rect x="92" y="112" width="16" height="14" rx="4" fill="#E8C4A8" />
      <motion.g animate={{ y: [0, -1.5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}>
        <ellipse cx="100" cy="82" rx="34" ry="38" fill="#F0D0B4" />
        <path d="M66 75 C66 50 78 38 100 38 C122 38 134 50 134 75 C134 65 125 45 100 45 C75 45 66 65 66 75 Z" fill="#3D2B1F" />
        <path d="M66 78 C66 72 70 68 76 70 C70 64 66 58 68 50 C66 58 64 70 66 78 Z" fill="#3D2B1F" />
        <path d="M134 78 C134 72 130 68 124 70 C130 64 134 58 132 50 C134 58 136 70 134 78 Z" fill="#3D2B1F" />
        <ellipse cx="66" cy="84" rx="6" ry="8" fill="#E8C0A0" />
        <ellipse cx="134" cy="84" rx="6" ry="8" fill="#E8C0A0" />
        <circle cx="86" cy="80" r="13" fill="none" stroke={color} strokeWidth="2.5" strokeOpacity="0.8" />
        <circle cx="114" cy="80" r="13" fill="none" stroke={color} strokeWidth="2.5" strokeOpacity="0.8" />
        <line x1="99" y1="80" x2="101" y2="80" stroke={color} strokeWidth="2.5" strokeOpacity="0.8" />
        <line x1="73" y1="78" x2="66" y2="76" stroke={color} strokeWidth="2" strokeOpacity="0.5" />
        <line x1="127" y1="78" x2="134" y2="76" stroke={color} strokeWidth="2" strokeOpacity="0.5" />
        <circle cx="82" cy="76" r="3" fill="#1A1A1A" fillOpacity="0.1" />
        <circle cx="110" cy="76" r="3" fill="#1A1A1A" fillOpacity="0.1" />
        <motion.g animate={{ scaleY: [1, 1, 0.1, 1, 1] }} transition={{ duration: 4, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1] }} style={{ transformOrigin: "100px 80px" }}>
          <circle cx="86" cy="80" r="4" fill="#2D1810" />
          <circle cx="114" cy="80" r="4" fill="#2D1810" />
          <circle cx="87.5" cy="78.5" r="1.5" fill="white" />
          <circle cx="115.5" cy="78.5" r="1.5" fill="white" />
        </motion.g>
        <path d="M76 70 Q86 66 96 70" fill="none" stroke="#3D2B1F" strokeWidth="2" strokeLinecap="round" />
        <path d="M104 70 Q114 66 124 70" fill="none" stroke="#3D2B1F" strokeWidth="2" strokeLinecap="round" />
        <path d="M98 88 Q100 92 102 88" fill="none" stroke="#D4A574" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M90 98 Q100 106 110 98" fill="none" stroke="#C4836B" strokeWidth="1.8" strokeLinecap="round" />
      </motion.g>
      <motion.g animate={{ rotate: [-3, 3, -3], y: [0, -3, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} style={{ transformOrigin: "160px 100px" }}>
        <rect x="148" y="70" width="28" height="38" rx="3" fill="#1A1A1A" fillOpacity="0.15" stroke={color} strokeWidth="1.5" />
        <rect x="155" y="67" width="14" height="6" rx="2" fill={color} fillOpacity="0.6" />
        <line x1="153" y1="80" x2="171" y2="80" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
        <line x1="153" y1="86" x2="168" y2="86" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
        <line x1="153" y1="92" x2="165" y2="92" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
        <line x1="153" y1="98" x2="170" y2="98" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
        <motion.path d="M154 80 L156 82 L160 77" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 3, repeat: Infinity, times: [0, 0.1, 0.8, 1] }} />
      </motion.g>
    </g>
  );
}

function MartaCharacter({ color }: { color: string }) {
  return (
    <g>
      <motion.g animate={{ y: [0, -1.5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}>
        <path d="M48 175 C48 138 68 122 100 118 C132 122 152 138 152 175" fill={color} fillOpacity="0.8" />
        <path d="M82 122 L100 142 L118 122" fill="#FFFFFF" fillOpacity="0.3" />
      </motion.g>
      <rect x="92" y="110" width="16" height="14" rx="4" fill="#E8C4A8" />
      <motion.g animate={{ y: [0, -1.5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.45 }}>
        <ellipse cx="100" cy="80" rx="33" ry="37" fill="#F0D0B4" />
        <path d="M67 72 C65 46 80 34 100 34 C120 34 135 46 133 72 C133 58 122 40 100 40 C80 40 67 55 67 72 Z" fill="#4A2C20" />
        <path d="M67 72 C67 62 72 52 82 48 C74 54 68 64 67 72 Z" fill="#3D2418" />
        <motion.path d="M130 60 C145 62 155 72 152 88 C150 80 142 70 130 68 Z" fill="#4A2C20" animate={{ rotate: [0, 3, 0, -2, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} style={{ transformOrigin: "130px 65px" }} />
        <motion.path d="M130 68 C142 70 150 82 148 98 C146 88 140 78 128 76 Z" fill="#3D2418" animate={{ rotate: [0, 3, 0, -2, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.1 }} style={{ transformOrigin: "130px 72px" }} />
        <path d="M128 56 C130 58 131 62 130 65" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <ellipse cx="67" cy="82" rx="5" ry="7" fill="#E8C0A0" />
        <circle cx="67" cy="92" r="2" fill={color} fillOpacity="0.7" />
        <motion.g animate={{ scaleY: [1, 1, 0.1, 1, 1] }} transition={{ duration: 5, repeat: Infinity, times: [0, 0.55, 0.6, 0.65, 1] }} style={{ transformOrigin: "100px 78px" }}>
          <ellipse cx="86" cy="78" rx="5" ry="4.5" fill="#2D1810" />
          <ellipse cx="114" cy="78" rx="5" ry="4.5" fill="#2D1810" />
          <circle cx="87.5" cy="77" r="2" fill="white" />
          <circle cx="115.5" cy="77" r="2" fill="white" />
        </motion.g>
        <path d="M80 74 L78 71" stroke="#3D2418" strokeWidth="1" strokeLinecap="round" />
        <path d="M84 73 L83 70" stroke="#3D2418" strokeWidth="1" strokeLinecap="round" />
        <path d="M120 74 L122 71" stroke="#3D2418" strokeWidth="1" strokeLinecap="round" />
        <path d="M116 73 L117 70" stroke="#3D2418" strokeWidth="1" strokeLinecap="round" />
        <path d="M76 68 Q86 63 95 68" fill="none" stroke="#4A2C20" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M105 68 Q114 63 124 68" fill="none" stroke="#4A2C20" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M97 86 Q100 92 103 88" fill="none" stroke="#D4A574" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M91 98 Q100 104 109 98" fill="none" stroke="#C4836B" strokeWidth="1.6" strokeLinecap="round" />
      </motion.g>
      <motion.g animate={{ x: [0, 4, 0, -4, 0], y: [0, -3, 0, 2, 0], rotate: [0, 5, 0, -5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} style={{ transformOrigin: "38px 100px" }}>
        <circle cx="38" cy="88" r="16" fill={color} fillOpacity="0.08" stroke={color} strokeWidth="2.5" />
        <circle cx="38" cy="88" r="11" fill="#1A1A1A" fillOpacity="0.05" stroke={color} strokeWidth="1" strokeOpacity="0.3" />
        <line x1="50" y1="100" x2="62" y2="112" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
        <motion.circle cx="32" cy="82" r="3" fill="#1A1A1A" fillOpacity="0.3" animate={{ opacity: [0.1, 0.4, 0.1] }} transition={{ duration: 2, repeat: Infinity }} />
      </motion.g>
    </g>
  );
}

function GiuliaCharacter({ color }: { color: string }) {
  return (
    <g>
      <motion.g animate={{ y: [0, -1.5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}>
        <path d="M46 175 C46 136 68 120 100 116 C132 120 154 136 154 175" fill={color} fillOpacity="0.8" />
        <path d="M84 120 C90 126 96 128 100 128 C104 128 110 126 116 120" fill="none" stroke="#1A1A1A" strokeOpacity="0.3" strokeWidth="1.5" />
      </motion.g>
      <rect x="92" y="108" width="16" height="14" rx="4" fill="#E8C4A8" />
      <motion.g animate={{ y: [0, -1.5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.75 }}>
        <ellipse cx="100" cy="78" rx="33" ry="37" fill="#F0D0B4" />
        <path d="M67 70 C65 44 80 32 100 32 C120 32 135 44 133 70 C133 55 120 38 100 38 C80 38 67 55 67 70 Z" fill="#1A1A1A" />
        <motion.path d="M67 70 C62 80 58 105 60 130 C63 120 65 95 67 80 Z" fill="#1A1A1A" animate={{ x: [0, -1, 0, 1, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} />
        <motion.path d="M62 80 C58 100 56 125 58 140 C60 130 62 108 64 90 Z" fill="#12122A" animate={{ x: [0, -1.5, 0, 1, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }} />
        <motion.path d="M133 70 C138 80 142 105 140 130 C137 120 135 95 133 80 Z" fill="#1A1A1A" animate={{ x: [0, 1, 0, -1, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} />
        <motion.path d="M138 80 C142 100 144 125 142 140 C140 130 138 108 136 90 Z" fill="#12122A" animate={{ x: [0, 1.5, 0, -1, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }} />
        <ellipse cx="67" cy="80" rx="5" ry="7" fill="#E8C0A0" />
        <ellipse cx="133" cy="80" rx="5" ry="7" fill="#E8C0A0" />
        <motion.g animate={{ scaleY: [1, 1, 0.1, 1, 1] }} transition={{ duration: 6, repeat: Infinity, times: [0, 0.48, 0.52, 0.56, 1] }} style={{ transformOrigin: "100px 76px" }}>
          <ellipse cx="86" cy="76" rx="5" ry="4" fill="#1A1A1A" />
          <ellipse cx="114" cy="76" rx="5" ry="4" fill="#1A1A1A" />
          <circle cx="87" cy="75" r="1.8" fill="white" />
          <circle cx="115" cy="75" r="1.8" fill="white" />
          <circle cx="86" cy="76" r="2.5" fill="none" stroke={color} strokeWidth="0.8" strokeOpacity="0.4" />
          <circle cx="114" cy="76" r="2.5" fill="none" stroke={color} strokeWidth="0.8" strokeOpacity="0.4" />
        </motion.g>
        <path d="M76 66 L96 66" fill="none" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M104 66 L124 66" fill="none" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M98 84 Q100 90 102 86" fill="none" stroke="#D4A574" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M92 96 Q100 101 108 96" fill="none" stroke="#C4836B" strokeWidth="1.5" strokeLinecap="round" />
      </motion.g>
      <motion.g animate={{ rotate: [-6, 6, -6] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} style={{ transformOrigin: "164px 68px" }}>
        <line x1="164" y1="56" x2="164" y2="74" stroke={color} strokeWidth="2" />
        <line x1="148" y1="74" x2="180" y2="74" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <circle cx="164" cy="54" r="3" fill={color} fillOpacity="0.6" />
        <motion.g animate={{ y: [0, 3, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
          <line x1="148" y1="74" x2="148" y2="82" stroke={color} strokeWidth="1" />
          <path d="M140 82 C140 86 148 90 156 86 L156 82 Z" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1" />
        </motion.g>
        <motion.g animate={{ y: [0, -2, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}>
          <line x1="180" y1="74" x2="180" y2="82" stroke={color} strokeWidth="1" />
          <path d="M172 82 C172 86 180 90 188 86 L188 82 Z" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1" />
        </motion.g>
      </motion.g>
    </g>
  );
}

function EnzoCharacter({ color }: { color: string }) {
  return (
    <g>
      <motion.g animate={{ y: [0, -1.5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.9 }}>
        <path d="M48 175 C48 138 68 122 100 118 C132 122 152 138 152 175" fill={color} fillOpacity="0.8" />
        <path d="M86 122 L78 145 L88 138 L100 148 L112 138 L122 145 L114 122" fill="none" stroke="#1A1A1A" strokeOpacity="0.3" strokeWidth="1.2" />
        <path d="M97 132 L100 160 L103 132 Z" fill={color} fillOpacity="0.4" />
      </motion.g>
      <rect x="92" y="110" width="16" height="14" rx="4" fill="#DDB896" />
      <motion.g animate={{ y: [0, -1.5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1.05 }}>
        <ellipse cx="100" cy="80" rx="35" ry="38" fill="#E8C4A8" />
        <path d="M65 74 C63 48 78 34 100 34 C122 34 137 48 135 74 C135 60 124 42 100 42 C76 42 65 60 65 74 Z" fill="#4A4A4A" />
        <path d="M68 70 C70 58 80 48 92 46" fill="none" stroke="#6A6A6A" strokeWidth="2" strokeOpacity="0.5" />
        <path d="M132 70 C130 58 120 48 108 46" fill="none" stroke="#6A6A6A" strokeWidth="2" strokeOpacity="0.5" />
        <ellipse cx="65" cy="82" rx="6" ry="8" fill="#DDB896" />
        <ellipse cx="135" cy="82" rx="6" ry="8" fill="#DDB896" />
        <motion.g animate={{ scaleY: [1, 1, 0.1, 1, 1] }} transition={{ duration: 5, repeat: Infinity, times: [0, 0.42, 0.47, 0.52, 1] }} style={{ transformOrigin: "100px 78px" }}>
          <ellipse cx="86" cy="78" rx="4.5" ry="4" fill="#3D2B1F" />
          <ellipse cx="114" cy="78" rx="4.5" ry="4" fill="#3D2B1F" />
          <circle cx="87.5" cy="77" r="1.8" fill="white" />
          <circle cx="115.5" cy="77" r="1.8" fill="white" />
        </motion.g>
        <path d="M78 80 C76 84 76 88 78 92" fill="none" stroke="#D4A574" strokeWidth="0.8" strokeOpacity="0.4" />
        <path d="M122 80 C124 84 124 88 122 92" fill="none" stroke="#D4A574" strokeWidth="0.8" strokeOpacity="0.4" />
        <path d="M76 68 Q86 64 96 68" fill="none" stroke="#4A4A4A" strokeWidth="2" strokeLinecap="round" />
        <path d="M104 68 Q114 64 124 68" fill="none" stroke="#4A4A4A" strokeWidth="2" strokeLinecap="round" />
        <path d="M96 86 Q100 94 104 88" fill="none" stroke="#D4A574" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M78 96 C78 100 82 110 100 112 C118 110 122 100 122 96" fill="#4A4A4A" fillOpacity="0.3" />
        <path d="M88 98 Q100 108 112 98" fill="#C4836B" fillOpacity="0.3" stroke="#C4836B" strokeWidth="1.5" strokeLinecap="round" />
      </motion.g>
      <motion.g animate={{ y: [-2, 2, -2] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
        <motion.g animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}>
          <circle cx="155" cy="50" r="18" fill={color} fillOpacity="0.08" />
          <path d="M155 36 C145 36 138 44 138 52 C138 58 142 62 146 66 L164 66 C168 62 172 58 172 52 C172 44 165 36 155 36 Z" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" />
          <path d="M150 56 Q155 48 160 56" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.6" />
          <rect x="148" y="66" width="14" height="5" rx="1.5" fill={color} fillOpacity="0.4" />
          <rect x="150" y="71" width="10" height="3" rx="1" fill={color} fillOpacity="0.3" />
        </motion.g>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <motion.line key={angle}
            x1={155 + 22 * Math.cos((angle * Math.PI) / 180)} y1={50 + 22 * Math.sin((angle * Math.PI) / 180)}
            x2={155 + 27 * Math.cos((angle * Math.PI) / 180)} y2={50 + 27 * Math.sin((angle * Math.PI) / 180)}
            stroke={color} strokeWidth="1.5" strokeLinecap="round"
            animate={{ opacity: [0.1, 0.5, 0.1] }} transition={{ duration: 2, repeat: Infinity, delay: angle / 360 }}
          />
        ))}
      </motion.g>
    </g>
  );
}

/* ── Agent data ── */
export const agents = [
  {
    name: "Leo",
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
    name: "Marta",
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
    name: "Giulia",
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
    name: "Enzo",
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
