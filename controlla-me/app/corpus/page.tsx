"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronRight, ChevronDown, BookOpen, FileText, Scale, Globe } from "lucide-react";
import Navbar from "@/components/Navbar";
import LegalBreadcrumb from "@/components/LegalBreadcrumb";

// ─── Tipi ───

interface CorpusSourceItem {
  lawSource: string;
  articleCount: number;
}

interface HierarchyGroup {
  hierarchy: Record<string, string>;
  articleCount: number;
  articles: Array<{ ref: string; title: string | null }>;
}

interface ArticleDetail {
  lawSource: string;
  articleReference: string;
  articleTitle: string | null;
  articleText: string;
  hierarchy: Record<string, string>;
  keywords: string[];
  relatedInstitutes: string[];
  sourceUrl?: string;
}

// ─── Componente principale ───

export default function CorpusPage() {
  const [sources, setSources] = useState<CorpusSourceItem[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [hierarchy, setHierarchy] = useState<HierarchyGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedArticle, setSelectedArticle] = useState<ArticleDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ArticleDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchMode, setSearchMode] = useState<"fulltext" | "semantic">("fulltext");

  // Carica fonti
  useEffect(() => {
    fetch("/api/corpus/hierarchy")
      .then((r) => r.json())
      .then((data) => {
        setSources(data.sources ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Carica gerarchia fonte selezionata
  useEffect(() => {
    if (!selectedSource) {
      setHierarchy([]);
      return;
    }
    setLoading(true);
    fetch(`/api/corpus/hierarchy?source=${encodeURIComponent(selectedSource)}`)
      .then((r) => r.json())
      .then((data) => {
        setHierarchy(data.hierarchy ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedSource]);

  // Cerca
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setLoading(true);
    const params = new URLSearchParams({ q: searchQuery });
    if (selectedSource) params.set("source", selectedSource);
    if (searchMode === "semantic") params.set("semantic", "true");

    const res = await fetch(`/api/corpus/article?${params}`);
    const data = await res.json();
    setSearchResults(data.results ?? []);
    setSelectedArticle(null);
    setLoading(false);
  }, [searchQuery, selectedSource, searchMode]);

  // Carica articolo
  const loadArticle = useCallback(async (source: string, ref: string) => {
    const res = await fetch(`/api/corpus/article?source=${encodeURIComponent(source)}&ref=${encodeURIComponent(ref)}`);
    const data = await res.json();
    if (data.article) setSelectedArticle(data.article);
  }, []);

  // Toggle gruppo
  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const totalArticles = sources.reduce((sum, s) => sum + s.articleCount, 0);

  // Classifica fonti IT vs EU
  const itSources = sources.filter((s) =>
    !s.lawSource.startsWith("Reg. UE") && !s.lawSource.startsWith("Dir. ") && !s.lawSource.startsWith("Reg. CE")
  );
  const euSources = sources.filter((s) =>
    s.lawSource.startsWith("Reg. UE") || s.lawSource.startsWith("Dir. ") || s.lawSource.startsWith("Reg. CE")
  );

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pt-24 pb-16 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-serif font-bold text-foreground">
              Corpus Legislativo
            </h1>
            <p className="text-foreground-secondary mt-2">
              {totalArticles.toLocaleString("it-IT")} articoli da {sources.length} fonti legislative
            </p>
          </div>

          {/* Breadcrumb */}
          <LegalBreadcrumb
            source={selectedSource}
            article={selectedArticle ? { ref: selectedArticle.articleReference, title: selectedArticle.articleTitle } : null}
            onSourceClick={() => { setSelectedSource(null); setSelectedArticle(null); setSearchResults([]); }}
            onHomeClick={() => { setSelectedSource(null); setSelectedArticle(null); setSearchResults([]); }}
          />

          {/* Search bar */}
          <div className="flex gap-2 mb-8">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-tertiary" />
              <input
                type="text"
                placeholder="Cerca nel corpus..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-surface text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <button
              onClick={() => setSearchMode((m) => m === "fulltext" ? "semantic" : "fulltext")}
              className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                searchMode === "semantic"
                  ? "bg-accent/10 border-accent/30 text-accent"
                  : "border-border text-foreground-secondary hover:bg-surface-hover"
              }`}
            >
              {searchMode === "semantic" ? "Semantica" : "Testo"}
            </button>
            <button
              onClick={handleSearch}
              className="px-6 py-2 rounded-xl bg-accent text-white font-medium hover:bg-accent-dark transition-colors"
            >
              Cerca
            </button>
          </div>

          {/* Layout: sidebar fonti + contenuto */}
          <div className="flex gap-6 flex-col lg:flex-row">

            {/* Sidebar: lista fonti */}
            <div className="w-full lg:w-80 shrink-0">
              <div className="bg-surface border border-border rounded-2xl p-4">

                {/* Fonti italiane */}
                {itSources.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2 px-2">
                      <Scale className="w-4 h-4 text-foreground-tertiary" />
                      <span className="text-xs font-semibold text-foreground-tertiary uppercase tracking-wider">
                        Italia
                      </span>
                    </div>
                    {itSources.map((s) => (
                      <SourceButton
                        key={s.lawSource}
                        source={s}
                        selected={selectedSource === s.lawSource}
                        onClick={() => {
                          setSelectedSource(s.lawSource);
                          setSelectedArticle(null);
                          setSearchResults([]);
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Fonti europee */}
                {euSources.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2 px-2">
                      <Globe className="w-4 h-4 text-foreground-tertiary" />
                      <span className="text-xs font-semibold text-foreground-tertiary uppercase tracking-wider">
                        Unione Europea
                      </span>
                    </div>
                    {euSources.map((s) => (
                      <SourceButton
                        key={s.lawSource}
                        source={s}
                        selected={selectedSource === s.lawSource}
                        onClick={() => {
                          setSelectedSource(s.lawSource);
                          setSelectedArticle(null);
                          setSearchResults([]);
                        }}
                      />
                    ))}
                  </div>
                )}

                {sources.length === 0 && !loading && (
                  <p className="text-sm text-foreground-tertiary text-center py-8">
                    Nessuna fonte caricata. Esegui:<br />
                    <code className="text-xs bg-background-secondary px-2 py-1 rounded mt-1 inline-block">
                      npm run seed:corpus
                    </code>
                  </p>
                )}
              </div>
            </div>

            {/* Contenuto principale */}
            <div className="flex-1 min-w-0">

              {/* Risultati ricerca */}
              {searchResults.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold text-foreground mb-4">
                    {searchResults.length} risultati per &quot;{searchQuery}&quot;
                  </h2>
                  {searchResults.map((a, i) => (
                    <ArticleCard
                      key={`${a.lawSource}-${a.articleReference}-${i}`}
                      article={a}
                      onClick={() => loadArticle(a.lawSource, a.articleReference)}
                    />
                  ))}
                </div>
              )}

              {/* Dettaglio articolo */}
              {selectedArticle && !searchResults.length && (
                <ArticleDetailView article={selectedArticle} />
              )}

              {/* Albero gerarchico */}
              {!selectedArticle && !searchResults.length && selectedSource && hierarchy.length > 0 && (
                <div className="space-y-2">
                  {hierarchy.map((group, i) => {
                    const key = JSON.stringify(group.hierarchy);
                    const expanded = expandedGroups.has(key);
                    const label = Object.values(group.hierarchy).filter(Boolean).join(" > ") || selectedSource;

                    return (
                      <div key={i} className="border border-border rounded-xl overflow-hidden">
                        <button
                          onClick={() => toggleGroup(key)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors text-left"
                        >
                          {expanded ? (
                            <ChevronDown className="w-4 h-4 text-foreground-tertiary shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-foreground-tertiary shrink-0" />
                          )}
                          <BookOpen className="w-4 h-4 text-accent shrink-0" />
                          <span className="text-sm font-medium text-foreground flex-1 truncate">
                            {label}
                          </span>
                          <span className="text-xs text-foreground-tertiary">
                            {group.articleCount} art.
                          </span>
                        </button>

                        <AnimatePresence>
                          {expanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 pb-3 pt-1 border-t border-border-subtle">
                                {group.articles.map((a) => (
                                  <button
                                    key={a.ref}
                                    onClick={() => loadArticle(selectedSource, a.ref)}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors text-left"
                                  >
                                    <FileText className="w-3.5 h-3.5 text-foreground-tertiary shrink-0" />
                                    <span className="text-sm text-accent font-medium">{a.ref}</span>
                                    {a.title && (
                                      <span className="text-sm text-foreground-secondary truncate">
                                        — {a.title}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Stato vuoto */}
              {!selectedSource && !searchResults.length && !loading && (
                <div className="text-center py-16">
                  <BookOpen className="w-12 h-12 text-foreground-tertiary mx-auto mb-4" />
                  <h2 className="text-lg font-semibold text-foreground mb-2">
                    Seleziona una fonte legislativa
                  </h2>
                  <p className="text-foreground-secondary">
                    Naviga il corpus o usa la ricerca per trovare articoli specifici
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

// ─── Sotto-componenti ───

function SourceButton({
  source,
  selected,
  onClick,
}: {
  source: CorpusSourceItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors ${
        selected
          ? "bg-accent/10 text-accent"
          : "text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      <span className="text-sm font-medium truncate">{source.lawSource}</span>
      <span className="text-xs text-foreground-tertiary ml-2 shrink-0">
        {source.articleCount}
      </span>
    </button>
  );
}

function ArticleCard({
  article,
  onClick,
}: {
  article: ArticleDetail;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 border border-border rounded-xl hover:border-accent/30 hover:bg-surface-hover transition-all"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-accent">{article.articleReference}</span>
        <span className="text-xs text-foreground-tertiary">{article.lawSource}</span>
      </div>
      {article.articleTitle && (
        <p className="text-sm font-medium text-foreground mb-1">{article.articleTitle}</p>
      )}
      <p className="text-sm text-foreground-secondary line-clamp-2">
        {article.articleText?.slice(0, 200)}...
      </p>
    </button>
  );
}

function ArticleDetailView({ article }: { article: ArticleDetail }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-6">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg font-bold text-accent">{article.articleReference}</span>
          <span className="text-sm text-foreground-tertiary">{article.lawSource}</span>
        </div>
        {article.articleTitle && (
          <h2 className="text-xl font-semibold text-foreground">{article.articleTitle}</h2>
        )}
      </div>

      <div className="prose prose-sm max-w-none text-foreground leading-relaxed whitespace-pre-wrap mb-6">
        {article.articleText}
      </div>

      {/* Metadata */}
      <div className="border-t border-border-subtle pt-4 space-y-2">
        {article.keywords && article.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {article.keywords.map((k) => (
              <span key={k} className="text-xs px-2 py-0.5 rounded-full bg-background-secondary text-foreground-secondary">
                {k.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}
        {article.sourceUrl && (
          <a
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline"
          >
            Fonte originale
          </a>
        )}
      </div>
    </div>
  );
}
