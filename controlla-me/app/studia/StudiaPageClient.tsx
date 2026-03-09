"use client";

/**
 * StudiaPageClient — Interfaccia corpus medico studia.me
 *
 * Due tab: "Per fonte" (textbook, guidelines) e "Per specialità" (cardiologia, ecc.)
 * Chat Q&A integrata con corpus medico.
 *
 * Colori: sky blue (#0EA5E9) — dal verticals config.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  BookOpen,
  Stethoscope,
  ArrowLeft,
  Loader2,
  GraduationCap,
  Microscope,
  Heart,
} from "lucide-react";
import StudiaNavbar from "@/components/studia/StudiaNavbar";
import StudiaFooter from "@/components/studia/StudiaFooter";

// ─── Types ───

interface MedicalSource {
  source_id: string;
  source_name: string;
  article_count: number;
}

interface MedicalArticle {
  id: string;
  article_number?: string;
  article_reference?: string;
  article_title: string | null;
  article_text?: string;
  law_source?: string;
  hierarchy?: Record<string, string>;
  keywords?: string[];
  related_institutes?: string[];
  source_url?: string;
  similarity?: number;
}

interface Topic {
  topic: string;
  article_count: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citedArticles?: Array<{
    id: string;
    reference: string;
    source: string;
    relevance: string;
  }>;
  confidence?: number;
  evidenceLevel?: string;
  followUpQuestions?: string[];
}

// ─── Constants ───

const ACCENT = "#0EA5E9";
const ACCENT_SECONDARY = "#38BDF8";

// ─── Component ───

export default function StudiaPageClient() {
  // ── State ──
  const [activeTab, setActiveTab] = useState<"fonti" | "specialita">("fonti");
  const [sources, setSources] = useState<MedicalSource[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedSourceName, setSelectedSourceName] = useState<string>("");
  const [sourceArticles, setSourceArticles] = useState<MedicalArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<MedicalArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MedicalArticle[]>([]);
  const [searching, setSearching] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // ── Initial load ──
  useEffect(() => {
    Promise.all([
      fetch("/api/studia/hierarchy")
        .then((r) => r.json())
        .then((d) => setSources(d.sources || [])),
      // Topics are optional until we have data
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ── Handlers ──

  const loadSource = useCallback(async (sourceId: string, sourceName: string) => {
    setSelectedSource(sourceId);
    setSelectedSourceName(sourceName);
    setLoading(true);
    try {
      const res = await fetch(`/api/studia/hierarchy?source=${sourceId}`);
      const data = await res.json();
      // Flatten tree into articles list
      const articles: MedicalArticle[] = [];
      for (const group of data.tree || []) {
        for (const art of group.articles || []) {
          articles.push(art);
        }
      }
      setSourceArticles(articles);
    } catch (err) {
      console.error("Errore caricamento fonte:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      // Use ask endpoint for search (semantic)
      const res = await fetch("/api/studia/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: searchQuery }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [
          ...prev,
          { role: "user", content: searchQuery },
          {
            role: "assistant",
            content: data.answer,
            citedArticles: data.citedArticles,
            confidence: data.confidence,
            evidenceLevel: data.evidenceLevel,
            followUpQuestions: data.followUpQuestions,
          },
        ]);
      }
    } catch (err) {
      console.error("Errore ricerca:", err);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const handleChatSubmit = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: question }]);
    setChatLoading(true);

    try {
      const res = await fetch("/api/studia/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            citedArticles: data.citedArticles,
            confidence: data.confidence,
            evidenceLevel: data.evidenceLevel,
            followUpQuestions: data.followUpQuestions,
          },
        ]);
      } else {
        const err = await res.json().catch(() => ({ error: "Errore" }));
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Errore: ${err.error || "Servizio non disponibile"}` },
        ]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Errore di connessione. Riprova." },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading]);

  // ── Render ──

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <StudiaNavbar />

      <main className="max-w-6xl mx-auto px-4 pt-24 pb-16">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <GraduationCap className="w-8 h-8" style={{ color: ACCENT }} />
            <h1
              className="text-4xl md:text-5xl font-serif"
              style={{ color: ACCENT }}
            >
              Studia.me
            </h1>
          </div>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            AI per studenti di medicina — studia meglio, non di più.
            Cerca nel corpus medico o fai una domanda.
          </p>
        </motion.div>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Cerca patologie, procedure, farmaci..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pl-12 text-white placeholder-white/40 focus:outline-none focus:border-sky-500/50 transition-colors"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            {searching && (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-sky-400 animate-spin" />
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-lg p-1 max-w-md mx-auto mb-8">
          {[
            { key: "fonti" as const, label: "Per fonte", icon: BookOpen },
            { key: "specialita" as const, label: "Per specialità", icon: Stethoscope },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setSelectedSource(null);
                setSelectedArticle(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm transition-all ${
                activeTab === tab.key
                  ? "bg-sky-500/20 text-sky-400"
                  : "text-white/50 hover:text-white/70"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-center py-20"
            >
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
            </motion.div>
          ) : selectedArticle ? (
            /* Article Detail View */
            <motion.div
              key="article"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <button
                onClick={() => setSelectedArticle(null)}
                className="flex items-center gap-2 text-sky-400 hover:text-sky-300 mb-6 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Torna alla lista
              </button>

              <div className="bg-white/5 rounded-xl border border-white/10 p-6">
                <div className="text-sm text-sky-400 mb-2">
                  {selectedArticle.law_source}
                </div>
                <h2 className="text-2xl font-serif mb-1">
                  {selectedArticle.article_reference || selectedArticle.article_number}
                </h2>
                {selectedArticle.article_title && (
                  <h3 className="text-lg text-white/70 mb-4">
                    {selectedArticle.article_title}
                  </h3>
                )}

                {/* Keywords */}
                {selectedArticle.keywords && selectedArticle.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {selectedArticle.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="px-2 py-1 bg-sky-500/10 text-sky-300 text-xs rounded-full"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}

                {/* Topics/Institutes */}
                {selectedArticle.related_institutes &&
                  selectedArticle.related_institutes.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6">
                      {selectedArticle.related_institutes.map((inst) => (
                        <span
                          key={inst}
                          className="px-2 py-1 bg-emerald-500/10 text-emerald-300 text-xs rounded-full"
                        >
                          {inst.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  )}

                {/* Text */}
                <div className="text-white/80 leading-relaxed whitespace-pre-wrap">
                  {selectedArticle.article_text}
                </div>

                {/* Source link */}
                {selectedArticle.source_url && (
                  <div className="mt-6 pt-4 border-t border-white/10">
                    <a
                      href={selectedArticle.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:text-sky-300 text-sm"
                    >
                      Apri fonte originale →
                    </a>
                  </div>
                )}
              </div>
            </motion.div>
          ) : selectedSource ? (
            /* Source Articles View */
            <motion.div
              key="source"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <button
                onClick={() => {
                  setSelectedSource(null);
                  setSourceArticles([]);
                }}
                className="flex items-center gap-2 text-sky-400 hover:text-sky-300 mb-6 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Torna alle fonti
              </button>

              <h2 className="text-xl font-serif mb-4">{selectedSourceName}</h2>

              {sourceArticles.length === 0 ? (
                <p className="text-white/40 text-center py-12">
                  Nessuna voce caricata per questa fonte.
                </p>
              ) : (
                <div className="space-y-2">
                  {sourceArticles.map((art) => (
                    <button
                      key={art.id}
                      onClick={() => {
                        // Fetch full article
                        fetch(`/api/studia/hierarchy?source=${selectedSource}`)
                          .then((r) => r.json())
                          .then(() => {
                            setSelectedArticle({
                              ...art,
                              article_reference:
                                art.article_reference || art.article_number || "",
                              law_source: selectedSourceName,
                            });
                          });
                      }}
                      className="w-full text-left p-3 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 hover:border-sky-500/30 transition-all"
                    >
                      <span className="text-sky-400 text-sm">
                        {art.article_number || art.article_reference}
                      </span>
                      {art.article_title && (
                        <span className="text-white/70 ml-2 text-sm">
                          — {art.article_title}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          ) : activeTab === "fonti" ? (
            /* Sources Grid */
            <motion.div
              key="sources"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {sources.length === 0 ? (
                <div className="col-span-full text-center py-16">
                  <Microscope className="w-12 h-12 text-white/20 mx-auto mb-4" />
                  <p className="text-white/40 text-lg mb-2">
                    Corpus medico in preparazione
                  </p>
                  <p className="text-white/30 text-sm max-w-md mx-auto">
                    Le fonti mediche sono in fase di caricamento. Usa la chat
                    qui sotto per fare domande — il sistema cercherà tra le voci
                    disponibili.
                  </p>
                </div>
              ) : (
                sources.map((source) => (
                  <button
                    key={source.source_id}
                    onClick={() => loadSource(source.source_id, source.source_name)}
                    className="p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 hover:border-sky-500/30 text-left transition-all group"
                  >
                    <BookOpen
                      className="w-5 h-5 mb-2 text-sky-400 group-hover:text-sky-300 transition-colors"
                    />
                    <h3 className="font-medium mb-1">{source.source_name}</h3>
                    <p className="text-white/40 text-sm">
                      {source.article_count} voci
                    </p>
                  </button>
                ))
              )}
            </motion.div>
          ) : (
            /* Topics Grid */
            <motion.div
              key="topics"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {topics.length === 0 ? (
                <div className="col-span-full text-center py-16">
                  <Heart className="w-12 h-12 text-white/20 mx-auto mb-4" />
                  <p className="text-white/40 text-lg mb-2">
                    Specialità in caricamento
                  </p>
                  <p className="text-white/30 text-sm max-w-md mx-auto">
                    Le specialità mediche verranno popolate con il caricamento
                    del corpus. Nel frattempo usa la chat per le tue domande.
                  </p>
                </div>
              ) : (
                topics.map((topic) => (
                  <button
                    key={topic.topic}
                    onClick={() => {
                      // Load articles for this topic
                      setLoading(true);
                      fetch(`/api/studia/hierarchy?topic=${topic.topic}`)
                        .then((r) => r.json())
                        .then((data) => {
                          setSelectedSourceName(topic.topic.replace(/_/g, " "));
                          setSourceArticles(data.articles || []);
                          setSelectedSource(topic.topic);
                        })
                        .catch(console.error)
                        .finally(() => setLoading(false));
                    }}
                    className="p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 hover:border-sky-500/30 text-left transition-all"
                  >
                    <Stethoscope className="w-5 h-5 mb-2 text-emerald-400" />
                    <h3 className="font-medium mb-1">
                      {topic.topic.replace(/_/g, " ")}
                    </h3>
                    <p className="text-white/40 text-sm">
                      {topic.article_count} voci
                    </p>
                  </button>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-16 max-w-3xl mx-auto"
        >
          <div className="text-center mb-6">
            <h2 className="text-2xl font-serif" style={{ color: ACCENT }}>
              Hai una domanda medica?
            </h2>
            <p className="text-white/50 text-sm mt-1">
              Chiedi qualsiasi argomento di medicina. Il tutor AI cerca nel
              corpus e risponde con fonti verificabili.
            </p>
          </div>

          {/* Chat Messages */}
          {chatMessages.length > 0 && (
            <div className="space-y-4 mb-4 max-h-[60vh] overflow-y-auto">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-xl ${
                    msg.role === "user"
                      ? "bg-sky-500/10 border border-sky-500/20 ml-8"
                      : "bg-white/5 border border-white/10 mr-8"
                  }`}
                >
                  <div className="text-sm text-white/80 whitespace-pre-wrap">
                    {msg.content}
                  </div>

                  {/* Cited articles */}
                  {msg.citedArticles && msg.citedArticles.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <p className="text-xs text-white/40 mb-2">
                        Fonti citate:
                      </p>
                      <div className="space-y-1">
                        {msg.citedArticles.map((art, j) => (
                          <a
                            key={j}
                            href={`/studia/article/${art.id}`}
                            className="block text-xs text-sky-400 hover:text-sky-300 transition-colors"
                          >
                            {art.source} — {art.reference}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Confidence + Evidence Level */}
                  {msg.confidence !== undefined && (
                    <div className="mt-2 flex gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          msg.confidence >= 0.7
                            ? "bg-emerald-500/10 text-emerald-300"
                            : msg.confidence >= 0.5
                            ? "bg-yellow-500/10 text-yellow-300"
                            : "bg-red-500/10 text-red-300"
                        }`}
                      >
                        Confidenza: {Math.round(msg.confidence * 100)}%
                      </span>
                      {msg.evidenceLevel && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/50">
                          {msg.evidenceLevel}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Follow-up questions */}
                  {msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {msg.followUpQuestions.map((q, j) => (
                        <button
                          key={j}
                          onClick={() => setChatInput(q)}
                          className="text-xs px-3 py-1 bg-sky-500/10 text-sky-300 rounded-full hover:bg-sky-500/20 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Chat Input */}
          <div className="relative">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleChatSubmit()}
              placeholder="Chiedimi qualsiasi argomento di medicina..."
              disabled={chatLoading}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-24 text-white placeholder-white/40 focus:outline-none focus:border-sky-500/50 transition-colors disabled:opacity-50"
            />
            <button
              onClick={handleChatSubmit}
              disabled={chatLoading || !chatInput.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
              style={{
                backgroundColor: chatLoading ? "transparent" : ACCENT + "20",
                color: ACCENT,
              }}
            >
              {chatLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Chiedi"
              )}
            </button>
          </div>
        </motion.div>
      </main>

      <StudiaFooter />
    </div>
  );
}
