"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, BookOpen, Search, MessageCircle, ExternalLink, Loader2, Send, ChevronRight } from "lucide-react";

// ── Tab types ─────────────────────────────────────────────────────────────────

export type RightPanelTab = "article" | "search" | "chat";

// ── Article Viewer ─────────────────────────────────────────────────────────────

function ArticleViewer({ articleRef, onClose: _onClose }: { articleRef: string; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [articles, setArticles] = useState<Array<{ id: string; articleReference: string; articleText: string; lawSource: string; sourceUrl?: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!articleRef) return;
    setLoading(true);
    setError(null);
    setArticles([]);

    // Search for articles matching the reference
    fetch(`/api/vector-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: articleRef, type: "articles", limit: 3 }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((data) => {
        setArticles(data.results || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Impossibile caricare l'articolo.");
        setLoading(false);
      });
  }, [articleRef]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <BookOpen className="w-4 h-4 text-accent" />
        <span className="font-medium text-sm text-gray-700 flex-1 truncate">{articleRef}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Caricamento…
          </div>
        )}
        {error && <p className="text-sm text-red-400 text-center py-8">{error}</p>}
        {!loading && !error && articles.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">Nessun articolo trovato nel corpus</p>
            <p className="text-xs text-gray-300 mt-1">per &quot;{articleRef}&quot;</p>
          </div>
        )}
        {articles.map((article) => (
          <motion.div
            key={article.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            {/* Source badge */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                {article.lawSource}
              </span>
              {article.sourceUrl && (
                <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="text-gray-300 hover:text-accent transition-colors">
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            {/* Reference */}
            <h3 className="font-semibold text-sm text-gray-800 mb-2">{article.articleReference}</h3>
            {/* Full text */}
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
              {article.articleText}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Corpus Search ─────────────────────────────────────────────────────────────

type SearchType = "semantic" | "institutes" | "tags";

function CorpusSearchPanel({ onArticleSelect }: { onArticleSelect: (ref: string) => void }) {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("semantic");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ id: string; articleReference: string; lawSource: string; excerpt?: string; similarity?: number }>>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (q: string, type: SearchType) => {
    if (!q.trim() || q.length < 2) { setResults([]); return; }
    setLoading(true);

    fetch("/api/vector-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, type: "articles", category: type === "institutes" ? q : undefined, limit: 8 }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(data => { setResults(data.results || []); setLoading(false); })
      .catch(() => { setLoading(false); });
  };

  const handleInput = (val: string) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val, searchType), 400);
  };

  // Re-run search when searchType changes (query is a controlled input, not a dep).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { search(query, searchType); }, [searchType]);

  return (
    <div className="h-full flex flex-col">
      {/* Search input */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input
            value={query}
            onChange={e => handleInput(e.target.value)}
            placeholder="Cerca articoli, istituti, norme…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 placeholder:text-gray-300"
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-300 animate-spin" />}
        </div>
        {/* Type pills */}
        <div className="flex gap-1">
          {([["semantic", "Semantica"], ["institutes", "Istituto"], ["tags", "Tag"]] as [SearchType, string][]).map(([type, label]) => (
            <button key={type} onClick={() => setSearchType(type)}
              className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-all ${
                searchType === type ? "bg-accent text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!query && (
          <div className="text-center py-8">
            <Search className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Digita per cercare nel corpus legislativo</p>
            <p className="text-[10px] text-gray-300 mt-1">6.110+ articoli indicizzati</p>
          </div>
        )}
        {results.map((r) => (
          <motion.button
            key={r.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => onArticleSelect(r.articleReference)}
            className="w-full text-left p-3 rounded-xl border border-gray-100 hover:border-accent/30 hover:bg-accent/3 transition-all group"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-700 group-hover:text-accent transition-colors truncate">
                  {r.articleReference}
                </div>
                <div className="text-[10px] text-gray-400 mb-1">{r.lawSource}</div>
                {r.excerpt && (
                  <div className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">{r.excerpt}</div>
                )}
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-gray-200 group-hover:text-accent flex-shrink-0 mt-0.5 transition-colors" />
            </div>
            {r.similarity !== undefined && (
              <div className="mt-1.5 flex items-center gap-1">
                <div className="h-1 rounded-full bg-gray-100 flex-1">
                  <div className="h-1 rounded-full bg-accent" style={{ width: `${(r.similarity * 100).toFixed(0)}%` }} />
                </div>
                <span className="text-[10px] text-gray-300">{(r.similarity * 100).toFixed(0)}%</span>
              </div>
            )}
          </motion.button>
        ))}
        {query && !loading && results.length === 0 && (
          <p className="text-center text-xs text-gray-400 py-8">Nessun risultato per &quot;{query}&quot;</p>
        )}
      </div>
    </div>
  );
}

// ── Contextual Chat ───────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function ContextualChat({
  documentContext,
  articleContext,
}: {
  documentContext?: string;
  articleContext?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: q }]);
    setLoading(true);

    try {
      const contextHint = [
        documentContext && `Documento analizzato: ${documentContext}`,
        articleContext && `Articolo in visualizzazione: ${articleContext}`,
      ].filter(Boolean).join(". ");

      const res = await fetch("/api/corpus/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          context: contextHint,
        }),
      });

      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.answer || "Nessuna risposta." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Errore durante la ricerca. Riprova." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Context chips */}
      {(documentContext || articleContext) && (
        <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap gap-1">
          {documentContext && (
            <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-100">
              📄 {documentContext.slice(0, 30)}{documentContext.length > 30 ? "…" : ""}
            </span>
          )}
          {articleContext && (
            <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full border border-accent/20">
              📖 {articleContext}
            </span>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-xs text-gray-400 font-medium">Fai una domanda nel contesto</p>
            <p className="text-[10px] text-gray-300 mt-1">
              {articleContext ? `Sto esaminando ${articleContext}` : "Carica un documento per iniziare"}
            </p>
            <div className="mt-4 space-y-1.5">
              {["Cosa prevede questa norma?", "Quali sono i diritti del conduttore?", "Quando si applica?"].map(s => (
                <button key={s} onClick={() => setInput(s)}
                  className="block w-full text-xs text-left px-3 py-2 rounded-xl border border-gray-100 hover:border-accent/30 hover:bg-accent/3 text-gray-500 transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
              m.role === "user"
                ? "bg-accent text-white rounded-br-sm"
                : "bg-gray-50 text-gray-700 border border-gray-100 rounded-bl-sm"
            }`}>
              {m.content}
            </div>
          </motion.div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-50 border border-gray-100 px-3 py-2 rounded-2xl rounded-bl-sm">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-300"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 border border-gray-200 rounded-2xl bg-white overflow-hidden focus-within:ring-2 focus-within:ring-accent/30 focus-within:border-accent/50">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Fai una domanda…"
            className="flex-1 px-3 py-2.5 text-sm bg-transparent focus:outline-none placeholder:text-gray-300"
          />
          <button onClick={send} disabled={!input.trim() || loading}
            className="mr-2 w-7 h-7 rounded-xl bg-accent flex items-center justify-center disabled:opacity-30 transition-opacity hover:bg-accent/80">
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Right Panel ──────────────────────────────────────────────────────────

interface WorkspaceRightPanelProps {
  isOpen: boolean;
  activeTab: RightPanelTab;
  selectedArticleRef: string | null;
  documentContext?: string;
  onTabChange: (tab: RightPanelTab) => void;
  onArticleSelect: (ref: string) => void;
  onClose: () => void;
}

const TAB_CONFIG: Array<{ id: RightPanelTab; label: string; Icon: React.ElementType }> = [
  { id: "article", label: "Articolo", Icon: BookOpen },
  { id: "search", label: "Cerca", Icon: Search },
  { id: "chat", label: "Chat", Icon: MessageCircle },
];

export default function WorkspaceRightPanel({
  isOpen,
  activeTab,
  selectedArticleRef,
  documentContext,
  onTabChange,
  onArticleSelect,
  onClose,
}: WorkspaceRightPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: "40%", opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="flex-shrink-0 border-l border-gray-100 bg-white flex flex-col overflow-hidden"
          style={{ minWidth: 0 }}
        >
          {/* Panel header */}
          <div className="flex items-center border-b border-gray-100 bg-gray-50/50">
            {/* Tabs */}
            <div className="flex flex-1">
              {TAB_CONFIG.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => onTabChange(id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-all border-b-2 ${
                    activeTab === id
                      ? "border-accent text-accent bg-white"
                      : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-white/50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
            {/* Close button */}
            <button onClick={onClose}
              className="px-3 py-3 text-gray-300 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {activeTab === "article" && (
                <motion.div key="article" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  {selectedArticleRef
                    ? <ArticleViewer articleRef={selectedArticleRef} onClose={onClose} />
                    : (
                      <div className="flex flex-col items-center justify-center h-full text-center p-6">
                        <BookOpen className="w-10 h-10 text-gray-200 mb-3" />
                        <p className="text-sm text-gray-400 font-medium">Nessun articolo selezionato</p>
                        <p className="text-xs text-gray-300 mt-1">Clicca su un riferimento normativo nell&apos;analisi</p>
                      </div>
                    )
                  }
                </motion.div>
              )}
              {activeTab === "search" && (
                <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <CorpusSearchPanel onArticleSelect={(ref) => { onArticleSelect(ref); onTabChange("article"); }} />
                </motion.div>
              )}
              {activeTab === "chat" && (
                <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                  <ContextualChat documentContext={documentContext} articleContext={selectedArticleRef || undefined} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
