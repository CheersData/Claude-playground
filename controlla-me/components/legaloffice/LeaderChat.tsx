"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Users2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LeaderMessage {
  role: "user" | "leader";
  content: string;
  timestamp: number;
}

interface LeaderChatProps {
  messages: LeaderMessage[];
  loading: boolean;
  prefilledHint: string | null;
  onSend: (message: string) => void;
}

// ── Loading dots ──────────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gray-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: LeaderMessage }) {
  const isLeader = msg.role === "leader";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-end gap-1.5 ${isLeader ? "" : "flex-row-reverse"}`}
    >
      {isLeader && (
        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mb-0.5">
          <Users2 className="w-3.5 h-3.5 text-indigo-500" />
        </div>
      )}
      <div
        className={`max-w-[82%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
          isLeader
            ? "bg-gray-100 text-gray-800 rounded-bl-sm"
            : "bg-gray-900 text-white rounded-br-sm"
        }`}
      >
        {msg.content}
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LeaderChat({
  messages,
  loading,
  prefilledHint,
  onSend,
}: LeaderChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Fill hint into input when set
  useEffect(() => {
    if (prefilledHint) {
      inputRef.current?.focus();
    }
  }, [prefilledHint]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-52 flex-none border-t border-gray-100 flex flex-col bg-white">
      {/* Header label */}
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 flex-shrink-0">
        <Users2 className="w-3 h-3 text-indigo-400" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Leader
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-2 min-h-0">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-end gap-1.5"
          >
            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <Users2 className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <div className="bg-gray-100 rounded-xl rounded-bl-sm">
              <ThinkingDots />
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input row */}
      <div className="flex-shrink-0 border-t border-gray-100 flex items-center gap-2 px-3 h-10">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={prefilledHint || "Scrivi al leader…"}
          disabled={loading}
          className="flex-1 text-xs text-gray-800 placeholder-gray-300 bg-transparent outline-none disabled:opacity-50 font-sans"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center disabled:opacity-30 hover:bg-gray-700 transition-colors flex-shrink-0"
        >
          <Send className="w-3 h-3 text-white" />
        </button>
      </div>
    </div>
  );
}
