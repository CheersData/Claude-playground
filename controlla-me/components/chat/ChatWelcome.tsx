"use client";

import { FileText, Scale, MessageCircle } from "lucide-react";

interface ChatWelcomeProps {
  onSuggestion: (text: string) => void;
}

const suggestions = [
  {
    icon: FileText,
    label: "Analizza un contratto",
    text: "Voglio analizzare un contratto",
    desc: "Carica PDF, DOCX o TXT",
  },
  {
    icon: Scale,
    label: "Chiedi una norma",
    text: "Quali sono i diritti del consumatore per il recesso?",
    desc: "Domande sul diritto italiano ed europeo",
  },
  {
    icon: MessageCircle,
    label: "Capire una clausola",
    text: "Cosa significa la clausola di risoluzione anticipata?",
    desc: "Spiegazioni in linguaggio semplice",
  },
];

export default function ChatWelcome({ onSuggestion }: ChatWelcomeProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 pb-32">
      <div className="max-w-2xl w-full text-center">
        {/* Logo / Title */}
        <h1 className="font-serif text-4xl md:text-5xl text-[#1A1A2E] mb-3">
          Poimandres
        </h1>
        <p className="text-[#6B6B6B] text-lg mb-12">
          Analisi legale AI. Carica un documento o fai una domanda.
        </p>

        {/* Suggestion chips */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {suggestions.map((s) => (
            <button
              key={s.label}
              onClick={() => onSuggestion(s.text)}
              className="group flex flex-col items-start gap-2 p-4 rounded-2xl border border-gray-100 bg-white hover:border-[#FF6B35]/30 hover:shadow-sm transition-all text-left"
            >
              <s.icon className="w-5 h-5 text-[#FF6B35] opacity-70 group-hover:opacity-100 transition-opacity" />
              <span className="text-[#1A1A2E] font-medium text-sm">{s.label}</span>
              <span className="text-[#9B9B9B] text-xs">{s.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
