"use client";

import { useState } from "react";
import { Plus, MessageSquare, ChevronLeft, Scale, Settings } from "lucide-react";
import type { Conversation, TierName } from "./types";

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  open: boolean;
  onToggle: () => void;
  tier?: TierName;
  onTierClick?: () => void;
}

const TIER_STYLES: Record<TierName, { label: string; bg: string; text: string }> = {
  intern: { label: "Intern", bg: "bg-emerald-50", text: "text-emerald-700" },
  associate: { label: "Associate", bg: "bg-blue-50", text: "text-blue-700" },
  partner: { label: "Partner", bg: "bg-amber-50", text: "text-amber-700" },
};

export default function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  open,
  onToggle,
  tier = "intern",
  onTierClick,
}: ChatSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const ts = TIER_STYLES[tier];

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="fixed left-3 top-3 z-30 p-2 rounded-lg bg-white border border-gray-100 shadow-sm hover:shadow transition-all md:relative md:left-0 md:top-0"
        title="Apri sidebar"
      >
        <MessageSquare className="w-5 h-5 text-[#6B6B6B]" />
      </button>
    );
  }

  return (
    <aside className="w-64 h-full flex flex-col bg-[#F7F7F8] border-r border-gray-100 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100">
        <span className="font-serif text-lg text-[#1A1A2E]">controlla.me</span>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-gray-200/60 transition-colors"
          title="Chiudi sidebar"
        >
          <ChevronLeft className="w-4 h-4 text-[#6B6B6B]" />
        </button>
      </div>

      {/* New chat button */}
      <div className="px-3 py-2">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-[#1A1A2E] transition-all"
        >
          <Plus className="w-4 h-4" />
          Nuova analisi
        </button>
      </div>

      {/* Conversations */}
      <nav className="flex-1 overflow-y-auto px-2 py-1">
        {conversations.length === 0 && (
          <p className="text-xs text-[#9B9B9B] px-2 py-4 text-center">
            Nessuna conversazione
          </p>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            onMouseEnter={() => setHoveredId(c.id)}
            onMouseLeave={() => setHoveredId(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left text-sm transition-all mb-0.5 ${
              c.id === activeId
                ? "bg-white shadow-sm text-[#1A1A2E]"
                : hoveredId === c.id
                ? "bg-gray-100 text-[#1A1A2E]"
                : "text-[#6B6B6B]"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" />
            <span className="truncate">{c.title || c.fileName || "Conversazione"}</span>
          </button>
        ))}
      </nav>

      {/* Footer: tier + links */}
      <div className="px-3 py-3 border-t border-gray-100 space-y-2">
        {/* Tier badge */}
        <button
          onClick={onTierClick}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${ts.bg} ${ts.text} hover:opacity-80 transition-opacity`}
        >
          <Settings className="w-3.5 h-3.5" />
          Tier: {ts.label}
        </button>

        {/* Corpus link */}
        <a
          href="/corpus"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[#6B6B6B] hover:bg-gray-100 transition-colors"
        >
          <Scale className="w-3.5 h-3.5" />
          Naviga il corpus legislativo
        </a>
      </div>
    </aside>
  );
}
