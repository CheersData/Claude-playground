"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Users2, BookOpen, ArrowRight, Shield } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CorpusMessageData {
  citedArticles: Array<{
    id: string;
    reference: string;
    source: string;
    relevance: string;
  }>;
  missingArticles?: string[];
  confidence: number;
  followUpQuestions: string[];
  articlesRetrieved?: number;
}

export interface LeaderMessage {
  role: "user" | "leader";
  content: string;
  timestamp: number;
  /** Dati corpus strutturati per rendering ricco (articoli citati, confidence, follow-up) */
  corpusData?: CorpusMessageData;
}

interface LeaderChatProps {
  messages: LeaderMessage[];
  loading: boolean;
  prefilledHint: string | null;
  onSend: (message: string) => void;
  onArticleClick?: (articleId: string) => void;
  className?: string;
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

// ── Formatted text (basic markdown: **bold**, line breaks) ────────────────────

function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    pct >= 60 ? "bg-amber-50 text-amber-700 border-amber-200" :
                "bg-red-50 text-red-600 border-red-200";

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${color}`}>
      <Shield className="w-2.5 h-2.5" />
      {pct}%
    </span>
  );
}

// ── Cited articles ────────────────────────────────────────────────────────────

function CitedArticles({
  articles,
  missingArticles,
  onArticleClick,
}: {
  articles: CorpusMessageData["citedArticles"];
  missingArticles?: string[];
  onArticleClick?: (articleId: string) => void;
}) {
  if (articles.length === 0) return null;

  return (
    <div className="mt-2.5 pt-2 border-t border-gray-200/60">
      <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-gray-400 mb-1.5 flex items-center gap-1">
        <BookOpen className="w-3 h-3" />
        Fonti normative
      </p>
      <div className="flex flex-wrap gap-1">
        {articles.map((a, i) => (
          <button
            key={i}
            onClick={() => onArticleClick?.(a.id)}
            className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100 font-medium hover:bg-indigo-100 hover:border-indigo-200 transition-colors cursor-pointer"
            title={`${a.source} — ${a.relevance} · Clicca per aprire nel corpus`}
          >
            {a.reference}
          </button>
        ))}
      </div>
      {missingArticles && missingArticles.length > 0 && (
        <p className="text-[10px] text-gray-400 mt-1.5 italic">
          Vedi anche: {missingArticles.join(", ")}
        </p>
      )}
    </div>
  );
}

// ── Follow-up questions ───────────────────────────────────────────────────────

function FollowUpQuestions({
  questions,
  onAsk,
  disabled,
}: {
  questions: string[];
  onAsk: (q: string) => void;
  disabled: boolean;
}) {
  if (questions.length === 0) return null;

  return (
    <div className="mt-2.5 pt-2 border-t border-gray-200/60">
      <p className="text-[10px] text-gray-400 mb-1.5">Approfondisci:</p>
      <div className="space-y-1">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onAsk(q)}
            disabled={disabled}
            className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-indigo-400 flex-shrink-0 transition-colors" />
            <span className="line-clamp-2">{q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Rich corpus message ───────────────────────────────────────────────────────

function CorpusMessageBubble({
  msg,
  onFollowUp,
  onArticleClick,
  loading,
}: {
  msg: LeaderMessage;
  onFollowUp: (q: string) => void;
  onArticleClick?: (articleId: string) => void;
  loading: boolean;
}) {
  const corpus = msg.corpusData!;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-1.5"
    >
      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Users2 className="w-3.5 h-3.5 text-indigo-500" />
      </div>
      <div className="max-w-[92%] bg-gray-100 rounded-xl rounded-bl-sm px-3 py-2">
        {/* Confidence badge */}
        <div className="flex items-center justify-between mb-1.5">
          <ConfidenceBadge value={corpus.confidence} />
          {corpus.articlesRetrieved != null && corpus.articlesRetrieved > 0 && (
            <span className="text-[10px] text-gray-400">
              {corpus.articlesRetrieved} articoli consultati
            </span>
          )}
        </div>

        {/* Answer text */}
        <div className="text-xs leading-relaxed text-gray-800 whitespace-pre-line">
          <FormattedText text={msg.content} />
        </div>

        {/* Cited articles */}
        <CitedArticles
          articles={corpus.citedArticles}
          missingArticles={corpus.missingArticles}
          onArticleClick={onArticleClick}
        />

        {/* Follow-up questions */}
        <FollowUpQuestions
          questions={corpus.followUpQuestions}
          onAsk={onFollowUp}
          disabled={loading}
        />
      </div>
    </motion.div>
  );
}

// ── Standard message bubble ───────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: LeaderMessage }) {
  const isLeader = msg.role === "leader";
  const isWelcome = isLeader && msg.content.startsWith("Benvenuto");

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-start gap-1.5 ${isLeader ? "" : "flex-row-reverse"}`}
    >
      {isLeader && (
        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Users2 className="w-3.5 h-3.5 text-indigo-500" />
        </div>
      )}
      <div
        className={`px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-line ${
          isLeader
            ? isWelcome
              ? "max-w-[82%] bg-gray-100 text-gray-800 rounded-bl-sm"
              : "max-w-[92%] bg-gray-100 text-gray-800 rounded-bl-sm"
            : "max-w-[82%] bg-gray-900 text-white rounded-br-sm"
        }`}
      >
        {isLeader ? <FormattedText text={msg.content} /> : msg.content}
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
  onArticleClick,
  className,
}: LeaderChatProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div className={`border-t border-gray-100 flex flex-col bg-white ${className ?? "h-52 flex-none"}`}>
      {/* Header label + Input row — in cima */}
      <div className="flex-shrink-0 border-b border-gray-100">
        <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
          <Users2 className="w-3 h-3 text-indigo-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Leader
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 h-10">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={prefilledHint || "Scrivi al leader\u2026"}
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

      {/* Messages — newest first (reversed) */}
      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-2 min-h-0">
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

        <AnimatePresence initial={false}>
          {[...messages].reverse().map((msg) =>
            msg.corpusData && msg.role === "leader" ? (
              <CorpusMessageBubble
                key={msg.timestamp}
                msg={msg}
                onFollowUp={onSend}
                onArticleClick={onArticleClick}
                loading={loading}
              />
            ) : (
              <MessageBubble key={msg.timestamp} msg={msg} />
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
