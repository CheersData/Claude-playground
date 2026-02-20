"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const agents = [
  {
    name: "Franco",
    role: "Il Classificatore",
    phase: "classifier" as const,
    color: "#FF6B35",
    emoji: "📋",
    description:
      "Legge il documento da cima a fondo. Capisce se è un preliminare, un contratto d'affitto, una bolletta. Identifica le parti, le leggi applicabili, le date chiave.",
    receives: null,
    passes: "tipo documento, parti coinvolte, leggi applicabili",
  },
  {
    name: "Angelo",
    role: "L'Analista",
    phase: "analyzer" as const,
    color: "#FF6B35",
    emoji: "🔍",
    description:
      "Prende il contesto di Franco e rilegge ogni clausola col microscopio. Trova quelle sbilanciate, le trappole nascoste, le cose che mancano e dovrebbero esserci.",
    receives: "classificazione di Franco + testo originale",
    passes: "clausole rischiose, elementi mancanti, livello di rischio",
  },
  {
    name: "Teresa",
    role: "L'Investigatrice",
    phase: "investigator" as const,
    color: "#FF6B35",
    emoji: "⚖️",
    description:
      "Prende le clausole sospette di Angelo e cerca le prove. Norme vigenti, sentenze della Cassazione, orientamenti giurisprudenziali. Se una clausola è illegale, lo trova.",
    receives: "classificazione di Franco + clausole di Angelo",
    passes: "leggi, sentenze, pareri giuridici per ogni clausola",
  },
  {
    name: "Marco",
    role: "Il Consigliere",
    phase: "advisor" as const,
    color: "#FFC832",
    emoji: "💡",
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
              className="relative bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 md:p-7"
            >
              {/* Agent header */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-2xl">
                  {agent.emoji}
                </div>
                <div>
                  <h3 className="text-lg font-bold">{agent.name}</h3>
                  <p
                    className="text-xs font-bold tracking-[1.5px] uppercase"
                    style={{ color: agent.color, opacity: 0.7 }}
                  >
                    {agent.role}
                  </p>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-white/60 leading-relaxed mb-4">
                {agent.description}
              </p>

              {/* Context flow */}
              <div className="flex flex-col gap-2">
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
                    <span className="px-2 py-0.5 rounded-md bg-accent/10 text-accent/60 font-medium shrink-0">
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
