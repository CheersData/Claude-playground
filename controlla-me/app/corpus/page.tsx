"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ArrowLeft, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LegalBreadcrumb from "@/components/LegalBreadcrumb";
import CorpusChat from "@/components/CorpusChat";
import AnimatedCount from "@/components/corpus/AnimatedCount";
import SourcesGrid from "@/components/corpus/SourcesGrid";
import HierarchyTree from "@/components/corpus/HierarchyTree";
import ArticleReader from "@/components/corpus/ArticleReader";
import InstituteGrid from "@/components/corpus/InstituteGrid";

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
  related_institutes: string[];
  url: string | null;
}

interface InstituteInfo {
  name: string;
  label: string;
  count: number;
}

interface InstituteArticle {
  id: string;
  article_number: string;
  article_title: string | null;
  source_name: string;
  hierarchy: Record<string, string>;
}

// ─── Main Page ───

export default function CorpusPage() {
  return (
    <Suspense>
      <CorpusPageContent />
    </Suspense>
  );
}

function CorpusPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab = searchParams.get("tab") === "istituti" ? "istituti" : "fonti";
  const initialInstitute = searchParams.get("institute") || null;

  const [activeTab, setActiveTab] = useState<"fonti" | "istituti">(initialTab);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceHierarchy | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<ArticleDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ArticleSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSource, setLoadingSource] = useState(false);
  const [loadingArticle, setLoadingArticle] = useState(false);

  // Institute state
  const [institutes, setInstitutes] = useState<InstituteInfo[]>([]);
  const [loadingInstitutes, setLoadingInstitutes] = useState(false);
  const [selectedInstitute, setSelectedInstitute] = useState<string | null>(initialInstitute);
  const [instituteArticles, setInstituteArticles] = useState<InstituteArticle[]>([]);
  const [loadingInstituteArticles, setLoadingInstituteArticles] = useState(false);

  const totalArticles = sources.reduce((sum, s) => sum + s.article_count, 0);

  // ─── Data fetching ───

  useEffect(() => {
    fetch("/api/corpus/hierarchy")
      .then((r) => r.json())
      .then((data) => { setSources(data.sources || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab !== "istituti" || institutes.length > 0) return;
    setLoadingInstitutes(true);
    fetch("/api/corpus/institutes")
      .then((r) => r.json())
      .then((data) => { setInstitutes(data.institutes || []); setLoadingInstitutes(false); })
      .catch(() => setLoadingInstitutes(false));
  }, [activeTab, institutes.length]);

  useEffect(() => {
    if (!selectedInstitute) { setInstituteArticles([]); return; }
    setLoadingInstituteArticles(true);
    fetch(`/api/corpus/institutes?institute=${encodeURIComponent(selectedInstitute)}`)
      .then((r) => r.json())
      .then((data) => { setInstituteArticles(data.articles || []); setLoadingInstituteArticles(false); })
      .catch(() => setLoadingInstituteArticles(false));
  }, [selectedInstitute]);

  useEffect(() => {
    if (initialTab === "istituti" && initialInstitute) {
      setActiveTab("istituti");
      setSelectedInstitute(initialInstitute);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Actions ───

  const loadSource = useCallback(async (sourceId: string) => {
    setLoadingSource(true);
    setSelectedArticle(null);
    setSearchResults(null);
    try {
      const res = await fetch(`/api/corpus/hierarchy?source=${sourceId}`);
      const data = await res.json();
      setSelectedSource(data);
    } catch { setSelectedSource(null); }
    setLoadingSource(false);
  }, []);

  const loadArticle = useCallback(async (articleId: string) => {
    setLoadingArticle(true);
    try {
      const res = await fetch(`/api/corpus/article?id=${articleId}`);
      const data = await res.json();
      setSelectedArticle(data);
    } catch { setSelectedArticle(null); }
    setLoadingArticle(false);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    setLoadingSource(true);
    try {
      const sourceParam = selectedSource ? `&source=${selectedSource.source_id}` : "";
      const res = await fetch(`/api/corpus/article?q=${encodeURIComponent(searchQuery)}${sourceParam}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch { setSearchResults([]); }
    setLoadingSource(false);
  }, [searchQuery, selectedSource]);

  const switchTab = useCallback((tab: "fonti" | "istituti") => {
    setActiveTab(tab);
    setSelectedSource(null);
    setSelectedArticle(null);
    setSearchResults(null);
    setSearchQuery("");
    setSelectedInstitute(null);
    router.replace(tab === "istituti" ? "/corpus?tab=istituti" : "/corpus", { scroll: false });
  }, [router]);

  const selectInstitute = useCallback((name: string) => {
    setSelectedInstitute(name);
    router.replace(`/corpus?tab=istituti&institute=${encodeURIComponent(name)}`, { scroll: false });
  }, [router]);

  const backToInstitutes = useCallback(() => {
    setSelectedInstitute(null);
    setSelectedArticle(null);
    router.replace("/corpus?tab=istituti", { scroll: false });
  }, [router]);

  const backToSources = useCallback(() => {
    setSelectedSource(null);
    setSelectedArticle(null);
    setSearchResults(null);
    setSearchQuery("");
  }, []);

  const backToTree = useCallback(() => {
    setSelectedArticle(null);
  }, []);

  const handleInstituteClick = useCallback((inst: string) => {
    setSelectedArticle(null);
    setActiveTab("istituti");
    selectInstitute(inst);
  }, [selectInstitute]);

  // ─── Render ───

  const showingArticle = selectedArticle && searchResults === null;

  return (
    <div className="min-h-screen bg-background">
      <div className="noise-overlay" />
      <Navbar />

      <main className="relative z-10 pt-24 pb-16 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">

          {/* ─── Header ─── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight">
              Corpus Giuridico
            </h1>
            {!loading && totalArticles > 0 && (
              <p className="text-foreground-secondary mt-2 text-lg">
                <AnimatedCount
                  value={totalArticles}
                  className="font-medium text-foreground"
                />{" "}
                articoli da {sources.length} fonti normative
              </p>
            )}
          </motion.div>

          {/* ─── Search ─── */}
          <div className="mb-10">
            <div className="flex gap-3">
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
                  className="w-full pl-12 pr-4 py-3 bg-background-secondary/60 border-0 rounded-xl text-base placeholder:text-foreground-tertiary focus:outline-none focus:ring-1 focus:ring-border transition-all"
                />
              </div>
              <button
                onClick={handleSearch}
                className="px-6 py-3 text-sm font-medium text-foreground-secondary hover:text-foreground border border-border rounded-xl hover:bg-surface-hover transition-all"
              >
                Cerca
              </button>
            </div>
          </div>

          {/* ─── Tab bar ─── */}
          <div className="flex gap-6 mb-10 border-b border-border relative">
            {(["fonti", "istituti"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => switchTab(tab)}
                className={`relative pb-3 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "text-foreground"
                    : "text-foreground-tertiary hover:text-foreground-secondary"
                }`}
              >
                {tab === "fonti" ? "Per fonte" : "Per istituto"}
                {activeTab === tab && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground"
                    transition={{ type: "tween", duration: 0.2 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* ─── Content ─── */}
          <AnimatePresence mode="wait">
            {/* Loading initial */}
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-20"
              >
                <Skeleton />
              </motion.div>
            )}

            {/* Search results */}
            {searchResults !== null && !loading && (
              <motion.div
                key="search"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <div className="flex items-baseline justify-between mb-6">
                  <h2 className="text-lg font-semibold">
                    {searchResults.length} risultati per &ldquo;{searchQuery}&rdquo;
                  </h2>
                  <button
                    onClick={() => { setSearchResults(null); setSearchQuery(""); }}
                    className="text-sm text-foreground-tertiary hover:text-foreground transition-colors"
                  >
                    Chiudi
                  </button>
                </div>
                <div>
                  {searchResults.map((art, i) => (
                    <motion.button
                      key={art.id}
                      onClick={() => loadArticle(art.id)}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="w-full text-left py-3 border-b border-border-subtle hover:bg-surface-hover transition-colors -mx-2 px-2 rounded-lg"
                    >
                      <span className="font-medium text-sm">
                        Art. {art.article_number}
                      </span>
                      {art.article_title && (
                        <span className="text-foreground-secondary text-sm ml-1.5">
                          &mdash; {art.article_title}
                        </span>
                      )}
                      {art.hierarchy && Object.keys(art.hierarchy).length > 0 && (
                        <div className="mt-1">
                          <LegalBreadcrumb hierarchy={art.hierarchy} size="sm" />
                        </div>
                      )}
                    </motion.button>
                  ))}
                  {searchResults.length === 0 && (
                    <p className="text-center text-foreground-tertiary py-12">
                      Nessun risultato trovato
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Article detail (from either tab) */}
            {showingArticle && (
              <motion.div
                key="article"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <button
                  onClick={activeTab === "istituti" ? backToInstitutes : backToTree}
                  className="flex items-center gap-2 text-sm text-foreground-tertiary hover:text-foreground mb-8 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {activeTab === "istituti" ? "Istituti" : "Indice"}
                </button>
                <ArticleReader
                  article={selectedArticle}
                  onInstituteClick={handleInstituteClick}
                />
              </motion.div>
            )}

            {/* ═══ TAB: Per fonte ═══ */}

            {/* Source hierarchy tree */}
            {activeTab === "fonti" && selectedSource && !selectedArticle && searchResults === null && !loadingSource && (
              <motion.div
                key="tree"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <HierarchyTree
                  source={selectedSource}
                  onArticleClick={loadArticle}
                  onBack={backToSources}
                />
              </motion.div>
            )}

            {/* Loading source */}
            {loadingSource && (
              <motion.div
                key="loading-source"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-20"
              >
                <Skeleton />
              </motion.div>
            )}

            {/* Sources grid */}
            {activeTab === "fonti" && !selectedSource && !loading && searchResults === null && !loadingSource && (
              <motion.div
                key="sources"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <SourcesGrid
                  sources={sources}
                  onSourceClick={loadSource}
                />
              </motion.div>
            )}

            {/* ═══ TAB: Per istituto ═══ */}

            {activeTab === "istituti" && !selectedArticle && searchResults === null && !loading && (
              <motion.div
                key="institutes"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <InstituteGrid
                  institutes={institutes}
                  loading={loadingInstitutes}
                  selectedInstitute={selectedInstitute}
                  instituteArticles={instituteArticles}
                  loadingArticles={loadingInstituteArticles}
                  onInstituteClick={selectInstitute}
                  onArticleClick={loadArticle}
                  onBack={backToInstitutes}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading article (inline skeleton) */}
          {loadingArticle && (
            <div className="max-w-[680px] mx-auto py-12">
              <div className="space-y-4 animate-pulse">
                <div className="h-3 w-48 bg-border-subtle rounded" />
                <div className="h-10 w-80 bg-border-subtle rounded" />
                <div className="h-5 w-64 bg-border-subtle rounded" />
                <div className="h-px bg-border mt-8 mb-10" />
                <div className="h-4 w-full bg-border-subtle rounded" />
                <div className="h-4 w-full bg-border-subtle rounded" />
                <div className="h-4 w-3/4 bg-border-subtle rounded" />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ─── Q&A Section ─── */}
      <section className="relative z-10 px-4 md:px-8 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="border-t border-border pt-12">
            <h2 className="font-serif text-2xl mb-2">
              Hai un dubbio legale?
            </h2>
            <p className="text-foreground-secondary mb-8">
              Interroga il corpus normativo italiano con l&apos;AI
            </p>
            <div className="max-w-2xl">
              <CorpusChat
                variant="purple"
                placeholder="Es. Cosa prevede il codice civile sulla vendita a corpo?"
              />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// ─── Skeleton loader ───

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-5 w-32 bg-border-subtle rounded" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="space-y-2">
          <div className="flex justify-between">
            <div className="h-4 bg-border-subtle rounded" style={{ width: `${120 + i * 30}px` }} />
            <div className="h-4 w-20 bg-border-subtle rounded" />
          </div>
          <div className="h-[3px] w-full bg-border-subtle rounded-full" />
        </div>
      ))}
    </div>
  );
}
