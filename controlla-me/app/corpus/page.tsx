"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  Search,
  Scale,
  Globe,
  FileText,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LegalBreadcrumb from "@/components/LegalBreadcrumb";

// ─── Types ───

interface SourceInfo {
  source_id: string;
  source_name: string;
  source_type: string;
  article_count: number;
}

interface HierarchyNode {
  key: string;
  label: string;
  children: HierarchyNode[];
  articles: ArticleSummary[];
}

interface ArticleSummary {
  id: string;
  article_number: string;
  article_title: string | null;
  hierarchy: Record<string, string>;
}

interface SourceHierarchy {
  source_id: string;
  source_name: string;
  source_type: string;
  article_count: number;
  tree: HierarchyNode[];
}

interface ArticleDetail {
  id: string;
  source_id: string;
  source_name: string;
  article_number: string;
  article_title: string | null;
  article_text: string;
  hierarchy: Record<string, string>;
  keywords: string[];
  url: string | null;
}

// ─── Main Page ───

export default function CorpusPage() {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceHierarchy | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<ArticleDetail | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ArticleSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSource, setLoadingSource] = useState(false);
  const [loadingArticle, setLoadingArticle] = useState(false);

  // Fetch all sources on mount
  useEffect(() => {
    fetch("/api/corpus/hierarchy")
      .then((r) => r.json())
      .then((data) => {
        setSources(data.sources || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const loadSource = useCallback(async (sourceId: string) => {
    setLoadingSource(true);
    setSelectedArticle(null);
    setSearchResults(null);
    setExpandedNodes(new Set());
    try {
      const res = await fetch(`/api/corpus/hierarchy?source=${sourceId}`);
      const data = await res.json();
      setSelectedSource(data);
    } catch {
      setSelectedSource(null);
    }
    setLoadingSource(false);
  }, []);

  const loadArticle = useCallback(async (articleId: string) => {
    setLoadingArticle(true);
    try {
      const res = await fetch(`/api/corpus/article?id=${articleId}`);
      const data = await res.json();
      setSelectedArticle(data);
    } catch {
      setSelectedArticle(null);
    }
    setLoadingArticle(false);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setLoadingSource(true);
    try {
      const sourceParam = selectedSource ? `&source=${selectedSource.source_id}` : "";
      const res = await fetch(`/api/corpus/article?q=${encodeURIComponent(searchQuery)}${sourceParam}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    }
    setLoadingSource(false);
  }, [searchQuery, selectedSource]);

  const toggleNode = useCallback((key: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const backToSources = useCallback(() => {
    setSelectedSource(null);
    setSelectedArticle(null);
    setSearchResults(null);
    setSearchQuery("");
  }, []);

  const backToTree = useCallback(() => {
    setSelectedArticle(null);
  }, []);

  const italianSources = sources.filter((s) => s.source_type === "normattiva");
  const euSources = sources.filter((s) => s.source_type === "eurlex");

  return (
    <div className="min-h-screen bg-background">
      <div className="noise-overlay" />
      <Navbar />

      <main className="relative z-10 pt-24 pb-16 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-10"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-[#A78BFA]/15 flex items-center justify-center">
                <Scale className="w-6 h-6 text-[#A78BFA]" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-serif font-bold">
                  Corpus Giuridico
                </h1>
                <p className="text-foreground-secondary text-sm">
                  Naviga le fonti normative italiane ed europee
                </p>
              </div>
            </div>
          </motion.div>

          {/* Search bar */}
          <div className="mb-8">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground-tertiary" />
                <input
                  type="text"
                  placeholder={
                    selectedSource
                      ? `Cerca in ${selectedSource.source_name}...`
                      : "Cerca nel corpus..."
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="w-full pl-12 pr-4 py-3 bg-white border border-border rounded-xl text-base placeholder:text-foreground-tertiary focus:outline-none focus:border-[#A78BFA]/50 focus:ring-2 focus:ring-[#A78BFA]/10 transition-all"
                />
              </div>
              <button
                onClick={handleSearch}
                className="px-6 py-3 bg-[#A78BFA] text-white font-semibold rounded-xl hover:bg-[#9575E8] transition-colors"
              >
                Cerca
              </button>
            </div>
          </div>

          {/* Breadcrumb nav */}
          {(selectedSource || selectedArticle) && (
            <div className="mb-6 flex items-center gap-2 text-sm text-foreground-secondary">
              <button
                onClick={backToSources}
                className="hover:text-foreground transition-colors"
              >
                Corpus
              </button>
              {selectedSource && (
                <>
                  <ChevronRight className="w-4 h-4" />
                  <button
                    onClick={backToTree}
                    className={`hover:text-foreground transition-colors ${
                      !selectedArticle ? "text-foreground font-medium" : ""
                    }`}
                  >
                    {selectedSource.source_name}
                  </button>
                </>
              )}
              {selectedArticle && (
                <>
                  <ChevronRight className="w-4 h-4" />
                  <span className="text-foreground font-medium">
                    Art. {selectedArticle.article_number}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Content */}
          <AnimatePresence mode="wait">
            {/* Loading */}
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center py-20"
              >
                <Loader2 className="w-8 h-8 text-[#A78BFA] animate-spin" />
              </motion.div>
            )}

            {/* Search Results */}
            {searchResults !== null && !loading && (
              <motion.div
                key="search"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">
                    {searchResults.length} risultati per &ldquo;{searchQuery}&rdquo;
                  </h2>
                  <button
                    onClick={() => {
                      setSearchResults(null);
                      setSearchQuery("");
                    }}
                    className="text-sm text-[#A78BFA] hover:underline"
                  >
                    Chiudi ricerca
                  </button>
                </div>
                <div className="space-y-2">
                  {searchResults.map((art) => (
                    <button
                      key={art.id}
                      onClick={() => loadArticle(art.id)}
                      className="w-full text-left p-4 bg-white border border-border rounded-xl hover:border-[#A78BFA]/30 hover:bg-[#A78BFA]/[0.02] transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#A78BFA] shrink-0" />
                        <span className="font-medium">Art. {art.article_number}</span>
                        {art.article_title && (
                          <span className="text-foreground-secondary">
                            — {art.article_title}
                          </span>
                        )}
                      </div>
                      {art.hierarchy && Object.keys(art.hierarchy).length > 0 && (
                        <div className="mt-1 ml-6">
                          <LegalBreadcrumb hierarchy={art.hierarchy} size="sm" />
                        </div>
                      )}
                    </button>
                  ))}
                  {searchResults.length === 0 && (
                    <p className="text-center text-foreground-tertiary py-8">
                      Nessun risultato trovato
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Article Detail */}
            {selectedArticle && searchResults === null && (
              <motion.div
                key="article"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <button
                  onClick={backToTree}
                  className="flex items-center gap-2 text-sm text-foreground-secondary hover:text-foreground mb-4 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Torna all&apos;indice
                </button>

                <div className="bg-white border border-border rounded-2xl p-6 md:p-8">
                  <div className="mb-6">
                    <LegalBreadcrumb
                      hierarchy={selectedArticle.hierarchy}
                      sourceName={selectedArticle.source_name}
                    />
                    <h2 className="text-2xl font-serif font-bold mt-3">
                      Articolo {selectedArticle.article_number}
                    </h2>
                    {selectedArticle.article_title && (
                      <p className="text-lg text-foreground-secondary mt-1">
                        {selectedArticle.article_title}
                      </p>
                    )}
                  </div>

                  {/* Keywords come tag */}
                  {selectedArticle.keywords && selectedArticle.keywords.length > 0 && (
                    <div className="mb-6 flex flex-wrap gap-2">
                      {selectedArticle.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="px-2.5 py-1 text-xs rounded-lg bg-[#A78BFA]/8 text-[#A78BFA] border border-[#A78BFA]/15"
                        >
                          {kw.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Testo completo dell'articolo */}
                  <div className="bg-background-secondary/50 rounded-xl border border-border/50 p-5 md:p-6">
                    <p className="text-[11px] font-bold tracking-[2px] uppercase text-foreground-tertiary mb-3">
                      Testo completo
                    </p>
                    <div className="space-y-3">
                      {selectedArticle.article_text.split("\n").map((paragraph, i) =>
                        paragraph.trim() ? (
                          <p
                            key={i}
                            className="text-[15px] leading-[1.8] text-foreground-secondary"
                          >
                            {paragraph}
                          </p>
                        ) : null
                      )}
                    </div>
                  </div>

                  {/* Fonte */}
                  <div className="mt-6 pt-4 border-t border-border flex items-center justify-end">
                    <span className="text-xs text-foreground-tertiary">
                      Fonte: {selectedArticle.source_name} — Art. {selectedArticle.article_number}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Source Tree */}
            {selectedSource &&
              !selectedArticle &&
              searchResults === null &&
              !loadingSource && (
                <motion.div
                  key="tree"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="bg-white border border-border rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-xl font-serif font-bold">
                            {selectedSource.source_name}
                          </h2>
                          <p className="text-sm text-foreground-secondary mt-1">
                            {selectedSource.article_count} articoli
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-full ${
                            selectedSource.source_type === "normattiva"
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}
                        >
                          {selectedSource.source_type === "normattiva" ? "IT" : "EU"}
                        </span>
                      </div>
                    </div>

                    <div className="divide-y divide-border/50">
                      {selectedSource.tree.map((node) => (
                        <TreeNode
                          key={node.key}
                          node={node}
                          depth={0}
                          expandedNodes={expandedNodes}
                          onToggle={toggleNode}
                          onArticleClick={loadArticle}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

            {/* Loading source */}
            {loadingSource && (
              <motion.div
                key="loading-source"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center py-20"
              >
                <Loader2 className="w-8 h-8 text-[#A78BFA] animate-spin" />
              </motion.div>
            )}

            {/* Sources List */}
            {!selectedSource && !loading && searchResults === null && !loadingSource && (
              <motion.div
                key="sources"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {/* Normattiva */}
                {italianSources.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                      <BookOpen className="w-5 h-5 text-green-600" />
                      <h2 className="text-lg font-semibold">
                        Fonti Italiane (Normattiva)
                      </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {italianSources.map((source) => (
                        <SourceCard
                          key={source.source_id}
                          source={source}
                          onClick={() => loadSource(source.source_id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* EUR-Lex */}
                {euSources.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                      <Globe className="w-5 h-5 text-blue-600" />
                      <h2 className="text-lg font-semibold">Fonti EU (EUR-Lex)</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {euSources.map((source) => (
                        <SourceCard
                          key={source.source_id}
                          source={source}
                          onClick={() => loadSource(source.source_id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty */}
                {sources.length === 0 && (
                  <div className="text-center py-16">
                    <Scale className="w-16 h-16 text-foreground-tertiary mx-auto mb-4 opacity-30" />
                    <h3 className="text-xl font-semibold mb-2">Corpus vuoto</h3>
                    <p className="text-foreground-secondary max-w-md mx-auto">
                      Nessuna fonte caricata. Esegui lo script di seed per
                      popolare il corpus:
                    </p>
                    <pre className="mt-4 bg-background-secondary border border-border rounded-xl p-4 text-sm text-left max-w-lg mx-auto overflow-x-auto">
                      npx tsx scripts/seed-corpus.ts all
                    </pre>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading article overlay */}
          {loadingArticle && (
            <div className="fixed inset-0 z-50 bg-background/50 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white rounded-2xl border border-border p-8 shadow-lg flex items-center gap-4">
                <Loader2 className="w-6 h-6 text-[#A78BFA] animate-spin" />
                <span className="text-foreground-secondary">
                  Caricamento articolo...
                </span>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

// ─── Source Card ───

function SourceCard({
  source,
  onClick,
}: {
  source: SourceInfo;
  onClick: () => void;
}) {
  const isIT = source.source_type === "normattiva";
  return (
    <button
      onClick={onClick}
      className="text-left p-5 bg-white border border-border rounded-xl hover:border-[#A78BFA]/30 hover:shadow-sm hover:-translate-y-0.5 transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isIT ? "bg-green-50" : "bg-blue-50"
          }`}
        >
          {isIT ? (
            <BookOpen className="w-5 h-5 text-green-600" />
          ) : (
            <Globe className="w-5 h-5 text-blue-600" />
          )}
        </div>
        <span
          className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full ${
            isIT
              ? "bg-green-50 text-green-700"
              : "bg-blue-50 text-blue-700"
          }`}
        >
          {isIT ? "IT" : "EU"}
        </span>
      </div>
      <h3 className="font-semibold text-sm group-hover:text-[#A78BFA] transition-colors">
        {source.source_name}
      </h3>
      <p className="text-xs text-foreground-tertiary mt-1">
        {source.article_count} articoli
      </p>
    </button>
  );
}

// ─── Tree Node (recursive) ───

/** Conteggio ricorsivo articoli in un nodo (figli + articoli diretti) */
function countNodeArticles(node: HierarchyNode): number {
  let total = node.articles.length;
  for (const child of node.children) {
    total += countNodeArticles(child);
  }
  return total;
}

function TreeNode({
  node,
  depth,
  expandedNodes,
  onToggle,
  onArticleClick,
}: {
  node: HierarchyNode;
  depth: number;
  expandedNodes: Set<string>;
  onToggle: (key: string) => void;
  onArticleClick: (id: string) => void;
}) {
  const isExpanded = expandedNodes.has(node.key);
  const hasChildren = node.children.length > 0;
  const hasArticles = node.articles.length > 0;
  const isExpandable = hasChildren || hasArticles;
  const totalArticles = countNodeArticles(node);

  return (
    <div>
      <button
        onClick={() => isExpandable && onToggle(node.key)}
        className={`w-full text-left flex items-center gap-2 py-3 px-4 hover:bg-[#A78BFA]/[0.03] transition-colors ${
          depth === 0 ? "font-semibold text-base" : "text-sm"
        }`}
        style={{ paddingLeft: `${16 + depth * 20}px` }}
      >
        {isExpandable ? (
          isExpanded ? (
            <ChevronDown className="w-4 h-4 text-[#A78BFA] shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-foreground-tertiary shrink-0" />
          )
        ) : (
          <span className="w-4" />
        )}
        <span
          className={
            depth === 0 ? "text-foreground" : "text-foreground-secondary"
          }
        >
          {node.label}
        </span>
        {totalArticles > 0 && (
          <span className="text-xs text-foreground-tertiary ml-auto">
            {totalArticles} art.
          </span>
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {node.children.map((child) => (
              <TreeNode
                key={child.key}
                node={child}
                depth={depth + 1}
                expandedNodes={expandedNodes}
                onToggle={onToggle}
                onArticleClick={onArticleClick}
              />
            ))}

            {node.articles.map((art) => (
              <button
                key={art.id}
                onClick={() => onArticleClick(art.id)}
                className="w-full text-left flex items-center gap-2 py-2 px-4 text-sm hover:bg-[#A78BFA]/[0.03] transition-colors"
                style={{ paddingLeft: `${36 + (depth + 1) * 20}px` }}
              >
                <FileText className="w-3.5 h-3.5 text-[#A78BFA]/60 shrink-0" />
                <span className="text-foreground-secondary">
                  Art. {art.article_number}
                  {art.article_title && (
                    <span className="text-foreground-tertiary ml-1">
                      — {art.article_title}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
