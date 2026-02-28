"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { ChevronRight, X, ArrowLeft, Search } from "lucide-react";

// ─── Types ───

interface SourceInfo {
  source_id: string;
  source_name: string;
  source_type: string;
  article_count: number;
}

interface TreeArticle {
  id: string;
  article_number: string;
  article_title: string | null;
}

interface TreeNode {
  key: string;
  label: string;
  children: TreeNode[];
  articles: TreeArticle[];
}

interface ArticleDetail {
  id: string;
  source_name: string;
  article_number: string;
  article_title: string | null;
  article_text: string;
  hierarchy: Record<string, string>;
  keywords: string[];
  url: string | null;
}

interface SearchResult {
  id: string;
  article_reference: string;
  article_title: string | null;
  law_source: string;
  similarity: number;
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

interface CorpusTreePanelProps {
  open: boolean;
  onClose: () => void;
}

// ─── Animated count ───

function PanelCount({ value, suffix }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min((now - start) / 1000, 1);
      setDisplay(Math.round((1 - Math.pow(1 - t, 3)) * value));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [isInView, value]);

  return (
    <span ref={ref} className="tabular-nums">
      {display.toLocaleString("it-IT")}{suffix}
    </span>
  );
}

// ─── Density bar ───

function PanelDensityBar({ value, max, delay = 0.3 }: { value: number; max: number; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-20px" });
  const pct = max > 0 ? Math.max((value / max) * 100, 2) : 0;

  return (
    <div ref={ref} className="h-[3px] bg-[#F0F0F0] rounded-full w-full">
      <motion.div
        className="h-full rounded-full bg-[#A78BFA]/30"
        initial={{ width: 0 }}
        animate={isInView ? { width: `${pct}%` } : { width: 0 }}
        transition={{ duration: 0.8, ease: "easeOut", delay }}
      />
    </div>
  );
}

// ─── Helpers ───

function countArticles(node: TreeNode): number {
  let count = node.articles.length;
  for (const child of node.children) count += countArticles(child);
  return count;
}

// ─── Slide animation variants ───

const slideVariants = {
  enter: (direction: "forward" | "backward") => ({
    x: direction === "forward" ? 40 : -40,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: "forward" | "backward") => ({
    x: direction === "forward" ? -40 : 40,
    opacity: 0,
  }),
};

// ─── Main Panel ───

export default function CorpusTreePanel({ open, onClose }: CorpusTreePanelProps) {
  const [activeTab, setActiveTab] = useState<"fonti" | "istituti">("fonti");

  // Sources tab state
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceInfo | null>(null);
  const [fullTree, setFullTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);

  // Breadcrumb navigation state
  const [navPath, setNavPath] = useState<TreeNode[]>([]);
  const [navDirection, setNavDirection] = useState<"forward" | "backward">("forward");

  // Derived: current level children & articles
  const currentNode = navPath.length > 0 ? navPath[navPath.length - 1] : null;
  const currentChildren = currentNode ? currentNode.children : fullTree;
  const currentArticles = currentNode ? currentNode.articles : [];
  const maxArticlesAtLevel = Math.max(...currentChildren.map(countArticles), 1);

  // Institutes tab state
  const [institutes, setInstitutes] = useState<InstituteInfo[]>([]);
  const [loadingInstitutes, setLoadingInstitutes] = useState(false);
  const [selectedInstitute, setSelectedInstitute] = useState<string | null>(null);
  const [instituteArticles, setInstituteArticles] = useState<InstituteArticle[]>([]);
  const [loadingInstituteArticles, setLoadingInstituteArticles] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Article detail (shared)
  const [articleDetail, setArticleDetail] = useState<ArticleDetail | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);

  // ─── Data fetching ───

  useEffect(() => {
    if (open && sources.length === 0) {
      fetch("/api/corpus/hierarchy")
        .then((r) => r.json())
        .then((data) => { if (data.sources) setSources(data.sources); })
        .catch(() => {});
    }
  }, [open, sources.length]);

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

  // ─── Actions ───

  const selectSource = useCallback(async (source: SourceInfo) => {
    setSelectedSource(source);
    setSearchResults(null);
    setArticleDetail(null);
    setNavPath([]);
    setNavDirection("forward");
    setLoading(true);
    setFullTree([]);
    try {
      const res = await fetch(`/api/corpus/hierarchy?source=${source.source_id}`);
      const data = await res.json();
      if (data.tree) setFullTree(data.tree);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const drillInto = useCallback((node: TreeNode) => {
    setNavDirection("forward");
    setNavPath((prev) => [...prev, node]);
  }, []);

  const navigateToBreadcrumb = useCallback((depth: number) => {
    setNavDirection("backward");
    if (depth < 0) {
      // Go back to source root
      setNavPath([]);
    } else {
      setNavPath((prev) => prev.slice(0, depth + 1));
    }
  }, []);

  const openArticle = useCallback(async (id: string) => {
    setArticleLoading(true);
    try {
      const res = await fetch(`/api/corpus/article?id=${id}`);
      const data = await res.json();
      if (data.id) setArticleDetail(data as ArticleDetail);
    } catch { /* ignore */ }
    setArticleLoading(false);
  }, []);

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.trim().length >= 3) {
      searchTimeout.current = setTimeout(() => doSearch(value.trim()), 400);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSource]);

  const doSearch = useCallback(async (query: string) => {
    setSearchLoading(true);
    setArticleDetail(null);
    try {
      const params = new URLSearchParams({ q: query });
      if (selectedSource) params.set("source", selectedSource.source_id);
      const res = await fetch(`/api/corpus/article?${params}`);
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } catch { setSearchResults([]); }
    setSearchLoading(false);
  }, [selectedSource]);

  const switchTab = useCallback((tab: "fonti" | "istituti") => {
    setActiveTab(tab);
    setSelectedSource(null);
    setSelectedInstitute(null);
    setArticleDetail(null);
    setSearchResults(null);
    setSearchQuery("");
    setFullTree([]);
    setNavPath([]);
  }, []);

  const goBack = useCallback(() => {
    if (articleDetail) { setArticleDetail(null); return; }
    if (searchResults) { setSearchResults(null); setSearchQuery(""); return; }
    if (activeTab === "fonti") {
      if (navPath.length > 0) {
        // Go up one level in hierarchy
        setNavDirection("backward");
        setNavPath((prev) => prev.slice(0, -1));
      } else {
        // Back to sources list
        setSelectedSource(null);
        setFullTree([]);
      }
    }
    if (activeTab === "istituti") { setSelectedInstitute(null); }
  }, [articleDetail, searchResults, activeTab, navPath.length]);

  const totalArticles = sources.reduce((sum, s) => sum + s.article_count, 0);
  const maxSourceCount = Math.max(...sources.map((s) => s.article_count), 1);
  const maxInstituteCount = Math.max(...institutes.map((i) => i.count), 1);

  const showBackButton = !!(articleDetail || searchResults || selectedSource || selectedInstitute);

  // Panel expands when reading an article
  const isReading = !!articleDetail && !articleLoading;
  const panelWidth = isReading ? "w-[92vw] max-w-[1100px]" : "w-[600px] max-w-[90vw]";

  // Header title
  const headerTitle = articleDetail
    ? `Articolo ${articleDetail.article_number}`
    : selectedSource
      ? selectedSource.source_name
      : selectedInstitute
        ? institutes.find((i) => i.name === selectedInstitute)?.label || selectedInstitute.replace(/_/g, " ")
        : "Corpus Legislativo";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-start">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.aside
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%" }}
        transition={{ type: "tween", duration: 0.3, ease: "easeOut" }}
        className={`relative ${panelWidth} h-full bg-white flex flex-col shadow-2xl transition-[width,max-width] duration-300 ease-out`}
      >
        {/* ─── Header ─── */}
        <div className="px-8 pt-7 pb-5 border-b border-[#E5E5E5]">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {showBackButton && (
                <button
                  onClick={goBack}
                  className="text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <h2 className="font-serif text-2xl text-[#1A1A1A] truncate tracking-tight">
                {headerTitle}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors shrink-0 ml-4 mt-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {!articleDetail && !selectedSource && !selectedInstitute && totalArticles > 0 && (
            <p className="text-sm text-[#6B6B6B] mt-1">
              <PanelCount value={totalArticles} /> articoli da {sources.length} fonti
            </p>
          )}
          {selectedSource && !articleDetail && (
            <p className="text-sm text-[#6B6B6B] mt-1">
              {selectedSource.article_count.toLocaleString("it-IT")} articoli
            </p>
          )}
          {selectedInstitute && !articleDetail && !loadingInstituteArticles && (
            <p className="text-sm text-[#6B6B6B] mt-1">
              {instituteArticles.length} {instituteArticles.length === 1 ? "articolo" : "articoli"}
            </p>
          )}
          {articleDetail?.article_title && (
            <p className="text-lg text-[#6B6B6B] font-light mt-1">
              {articleDetail.article_title}
            </p>
          )}
        </div>

        {/* ─── Breadcrumb bar (when navigating tree) ─── */}
        {selectedSource && !articleDetail && !searchResults && navPath.length > 0 && (
          <div className="px-8 py-2.5 border-b border-[#F0F0F0] bg-[#FAFAFA]">
            <div className="flex items-center gap-1 text-xs overflow-x-auto">
              <button
                onClick={() => navigateToBreadcrumb(-1)}
                className="text-[#A78BFA] hover:text-[#8B6BD9] transition-colors shrink-0 truncate max-w-[180px]"
              >
                {selectedSource.source_name}
              </button>
              {navPath.map((node, i) => {
                const isLast = i === navPath.length - 1;
                return (
                  <span key={node.key} className="flex items-center gap-1 shrink-0">
                    <ChevronRight className="w-3 h-3 text-[#D5D5D5]" />
                    {isLast ? (
                      <span className="text-[#1A1A1A] font-medium truncate max-w-[200px]">
                        {node.label}
                      </span>
                    ) : (
                      <button
                        onClick={() => navigateToBreadcrumb(i)}
                        className="text-[#A78BFA] hover:text-[#8B6BD9] transition-colors truncate max-w-[180px]"
                      >
                        {node.label}
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Tab bar + Search (hidden when reading article) ─── */}
        {!articleDetail && (
          <div className="px-8 pt-4 pb-0 border-b border-[#F0F0F0]">
            {/* Tabs */}
            {!selectedSource && !selectedInstitute && (
              <div className="flex gap-5 mb-4 relative">
                {(["fonti", "istituti"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => switchTab(tab)}
                    className={`relative pb-2.5 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? "text-[#1A1A1A]"
                        : "text-[#9B9B9B] hover:text-[#6B6B6B]"
                    }`}
                  >
                    {tab === "fonti" ? "Per fonte" : "Per istituto"}
                    {activeTab === tab && (
                      <motion.div
                        layoutId="panel-tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#1A1A1A]"
                        transition={{ type: "tween", duration: 0.2 }}
                      />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="pb-4">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9B9B9B]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchQuery.trim().length >= 2) {
                      if (searchTimeout.current) clearTimeout(searchTimeout.current);
                      doSearch(searchQuery.trim());
                    }
                  }}
                  placeholder="Ricerca semantica..."
                  className="w-full pl-10 pr-4 py-2.5 bg-[#F8F8FA] border-0 rounded-xl text-sm text-[#1A1A1A] placeholder:text-[#9B9B9B] focus:outline-none focus:ring-1 focus:ring-[#E5E5E5] transition-all"
                />
              </div>
              {searchLoading && (
                <p className="text-[11px] text-[#9B9B9B] mt-2">Ricerca in corso...</p>
              )}
            </div>
          </div>
        )}

        {/* ─── Content ─── */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" custom={navDirection}>

            {/* Article loading skeleton */}
            {articleLoading && (
              <motion.div
                key="article-loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-8 py-10 max-w-[680px] mx-auto"
              >
                <div className="space-y-4 animate-pulse">
                  <div className="h-3 w-48 bg-[#F0F0F0] rounded" />
                  <div className="h-8 w-72 bg-[#F0F0F0] rounded" />
                  <div className="h-5 w-56 bg-[#F0F0F0] rounded" />
                  <div className="h-px bg-[#F0F0F0] my-6" />
                  <div className="h-4 w-full bg-[#F0F0F0] rounded" />
                  <div className="h-4 w-full bg-[#F0F0F0] rounded" />
                  <div className="h-4 w-3/4 bg-[#F0F0F0] rounded" />
                  <div className="h-4 w-full bg-[#F0F0F0] rounded" />
                  <div className="h-4 w-5/6 bg-[#F0F0F0] rounded" />
                </div>
              </motion.div>
            )}

            {/* ─── Article reader ─── */}
            {isReading && (
              <motion.div
                key="article"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-8 py-10"
              >
                <PanelArticleReader article={articleDetail} />
              </motion.div>
            )}

            {/* Search results */}
            {!articleDetail && searchResults && (
              <motion.div
                key="search"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-8 py-6"
              >
                <div className="flex items-baseline justify-between mb-4">
                  <p className="text-[10px] tracking-[2px] uppercase text-[#9B9B9B] font-medium">
                    {searchResults.length} risultati
                  </p>
                  <button
                    onClick={() => { setSearchResults(null); setSearchQuery(""); }}
                    className="text-xs text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors"
                  >
                    Chiudi
                  </button>
                </div>
                {searchResults.length === 0 ? (
                  <p className="text-sm text-[#9B9B9B] py-8 text-center">Nessun risultato.</p>
                ) : (
                  <div>
                    {searchResults.map((r, i) => (
                      <motion.button
                        key={r.id}
                        onClick={() => openArticle(r.id)}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="w-full text-left py-3.5 border-b border-[#F0F0F0] hover:bg-[#F5F5F7] transition-colors -mx-2 px-2 rounded-lg"
                      >
                        <span className="text-sm font-medium text-[#1A1A1A]">{r.article_reference}</span>
                        {r.article_title && (
                          <span className="text-sm text-[#6B6B6B] ml-1.5">&mdash; {r.article_title}</span>
                        )}
                        <p className="text-xs text-[#9B9B9B] mt-0.5">{r.law_source}</p>
                      </motion.button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Loading */}
            {!articleDetail && !searchResults && loading && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-8 py-8">
                <SkeletonRows />
              </motion.div>
            )}

            {/* ═══ TAB: Per fonte ═══ */}

            {/* Source list */}
            {activeTab === "fonti" && !articleDetail && !searchResults && !selectedSource && sources.length > 0 && !loading && (
              <motion.div
                key="sources"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-8 py-6"
              >
                {sources.map((source, i) => (
                  <motion.button
                    key={source.source_id}
                    onClick={() => selectSource(source)}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="w-full text-left py-4 border-b border-[#F0F0F0] group hover:bg-[#F5F5F7] transition-colors -mx-2 px-2 rounded-lg"
                  >
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="font-medium text-[#1A1A1A] group-hover:text-[#A78BFA] transition-colors truncate mr-4">
                        {source.source_name}
                      </span>
                      <span className="text-sm text-[#9B9B9B] tabular-nums shrink-0">
                        <PanelCount value={source.article_count} suffix=" articoli" />
                      </span>
                    </div>
                    <PanelDensityBar value={source.article_count} max={maxSourceCount} delay={0.2 + i * 0.04} />
                  </motion.button>
                ))}
              </motion.div>
            )}

            {/* Hierarchy browser (breadcrumb + flat list) */}
            {activeTab === "fonti" && !articleDetail && !searchResults && selectedSource && !loading && fullTree.length > 0 && (
              <motion.div
                key={`level-${navPath.map((n) => n.key).join("/")}`}
                custom={navDirection}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="px-8 py-5"
              >
                <LevelList
                  nodes={currentChildren}
                  articles={currentArticles}
                  onNodeClick={drillInto}
                  onArticleClick={openArticle}
                  maxArticles={maxArticlesAtLevel}
                />
              </motion.div>
            )}

            {/* Empty tree */}
            {activeTab === "fonti" && !articleDetail && !searchResults && selectedSource && !loading && fullTree.length === 0 && (
              <motion.div key="empty-tree" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-8 py-12">
                <p className="text-sm text-[#9B9B9B] text-center">Nessun articolo trovato.</p>
              </motion.div>
            )}

            {/* ═══ TAB: Per istituto ═══ */}

            {/* Institute list */}
            {activeTab === "istituti" && !articleDetail && !searchResults && !selectedInstitute && !loadingInstitutes && (
              <motion.div
                key="institutes"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-8 py-6"
              >
                {institutes.length === 0 ? (
                  <p className="text-sm text-[#9B9B9B] py-8 text-center">
                    Nessun istituto trovato.
                  </p>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between mb-4 pb-3 border-b border-[#E5E5E5]">
                      <p className="text-[10px] tracking-[2px] uppercase text-[#9B9B9B] font-medium">
                        Istituti Giuridici
                      </p>
                      <span className="text-sm text-[#9B9B9B] tabular-nums">
                        <PanelCount value={institutes.length} /> istituti
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-0">
                      {institutes.map((inst, i) => (
                        <motion.button
                          key={inst.name}
                          onClick={() => setSelectedInstitute(inst.name)}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="text-left py-3 border-b border-[#F0F0F0] group hover:bg-[#F5F5F7] transition-colors -mx-2 px-2 rounded-lg"
                        >
                          <div className="flex items-baseline justify-between mb-1.5">
                            <span className="text-sm font-medium text-[#1A1A1A] group-hover:text-[#A78BFA] transition-colors truncate mr-3">
                              {inst.label}
                            </span>
                            <span className="text-xs text-[#9B9B9B] tabular-nums shrink-0">
                              {inst.count}
                            </span>
                          </div>
                          <PanelDensityBar value={inst.count} max={maxInstituteCount} delay={0.1 + i * 0.02} />
                        </motion.button>
                      ))}
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* Loading institutes */}
            {activeTab === "istituti" && !articleDetail && !searchResults && !selectedInstitute && loadingInstitutes && (
              <motion.div key="loading-inst" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-8 py-8">
                <SkeletonRows />
              </motion.div>
            )}

            {/* Institute articles */}
            {activeTab === "istituti" && selectedInstitute && !articleDetail && !searchResults && (
              <motion.div
                key="institute-articles"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-8 py-6"
              >
                {loadingInstituteArticles ? (
                  <SkeletonRows />
                ) : (
                  <div>
                    {instituteArticles.map((art, i) => (
                      <motion.button
                        key={art.id}
                        onClick={() => openArticle(art.id)}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className="w-full text-left py-3 border-b border-[#F0F0F0] hover:bg-[#F5F5F7] transition-colors -mx-2 px-2 rounded-lg"
                      >
                        <span className="font-medium text-sm text-[#1A1A1A]">
                          Art. {art.article_number}
                        </span>
                        {art.article_title && (
                          <span className="text-sm text-[#6B6B6B] ml-1.5">
                            &mdash; {art.article_title}
                          </span>
                        )}
                        <p className="text-xs text-[#9B9B9B] mt-0.5">{art.source_name}</p>
                      </motion.button>
                    ))}
                    {instituteArticles.length === 0 && (
                      <p className="text-sm text-[#9B9B9B] py-8 text-center">
                        Nessun articolo per questo istituto.
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* Empty sources */}
            {activeTab === "fonti" && !selectedSource && !loading && sources.length === 0 && !searchResults && !articleDetail && (
              <motion.div key="empty-sources" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-8 py-12">
                <p className="text-sm text-[#9B9B9B] text-center">Nessuna fonte caricata.</p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.aside>
    </div>
  );
}

// ─── Skeleton ───

function SkeletonRows() {
  return (
    <div className="space-y-5 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="space-y-2">
          <div className="flex justify-between">
            <div className="h-4 bg-[#F0F0F0] rounded" style={{ width: `${100 + i * 30}px` }} />
            <div className="h-4 w-12 bg-[#F0F0F0] rounded" />
          </div>
          <div className="h-[3px] bg-[#F0F0F0] rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ─── Level List (flat list of current level children + articles) ───

function LevelList({
  nodes, articles, onNodeClick, onArticleClick, maxArticles,
}: {
  nodes: TreeNode[];
  articles: TreeArticle[];
  onNodeClick: (node: TreeNode) => void;
  onArticleClick: (id: string) => void;
  maxArticles: number;
}) {
  return (
    <div>
      {/* Child nodes — clickable to drill in */}
      {nodes.map((node, i) => {
        const total = countArticles(node);
        const hasContent = node.children.length > 0 || node.articles.length > 0;

        return (
          <motion.button
            key={node.key}
            onClick={() => hasContent && onNodeClick(node)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="w-full text-left flex items-center gap-3 py-4 border-b border-[#F0F0F0] hover:bg-[#F5F5F7] transition-colors -mx-2 px-3 rounded-lg group"
          >
            <span className="flex-1 text-[15px] text-[#1A1A1A] group-hover:text-[#A78BFA] transition-colors truncate">
              {node.label}
            </span>
            {total > 0 && (
              <span className="flex items-center gap-3 shrink-0">
                <span className="w-14">
                  <PanelDensityBar value={total} max={maxArticles} delay={0.1 + i * 0.03} />
                </span>
                <span className="text-xs text-[#9B9B9B] tabular-nums w-10 text-right">{total}</span>
              </span>
            )}
            {hasContent && (
              <ChevronRight className="w-4 h-4 text-[#D5D5D5] group-hover:text-[#A78BFA] transition-colors shrink-0" />
            )}
          </motion.button>
        );
      })}

      {/* Articles at this level */}
      {articles.length > 0 && (
        <>
          {nodes.length > 0 && (
            <div className="border-t border-[#E5E5E5] mt-2 mb-2" />
          )}
          <p className="text-[10px] tracking-[2px] uppercase text-[#9B9B9B] font-medium mt-3 mb-2">
            {articles.length} {articles.length === 1 ? "articolo" : "articoli"}
          </p>
          {articles.map((art, i) => (
            <motion.button
              key={art.id}
              onClick={() => onArticleClick(art.id)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (nodes.length + i) * 0.02 }}
              className="w-full text-left flex items-center gap-2 py-2.5 px-3 -mx-2 rounded-lg hover:bg-[#F5F5F7] transition-colors"
            >
              <span className="text-sm font-medium text-[#1A1A1A]">Art. {art.article_number}</span>
              {art.article_title && (
                <span className="text-sm text-[#9B9B9B] truncate">&mdash; {art.article_title}</span>
              )}
            </motion.button>
          ))}
        </>
      )}

      {/* Empty level */}
      {nodes.length === 0 && articles.length === 0 && (
        <p className="text-sm text-[#9B9B9B] py-8 text-center">Nessun contenuto a questo livello.</p>
      )}
    </div>
  );
}

// ─── Article Reader ───

function PanelArticleReader({ article }: { article: ArticleDetail }) {
  const paragraphs = article.article_text.split("\n").filter((p) => p.trim());
  const hierarchyValues = Object.values(article.hierarchy);

  return (
    <div className="max-w-[680px] mx-auto">
      {(article.source_name || hierarchyValues.length > 0) && (
        <p className="text-[11px] text-[#9B9B9B] mb-6">
          {[article.source_name, ...hierarchyValues].filter(Boolean).join(" / ")}
        </p>
      )}

      <h3 className="font-serif text-4xl text-[#1A1A1A] tracking-tight leading-tight">
        Articolo {article.article_number}
      </h3>
      {article.article_title && (
        <p className="text-xl text-[#6B6B6B] font-light mt-2">{article.article_title}</p>
      )}

      {article.keywords && article.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-5">
          {article.keywords.map((kw) => (
            <span key={kw} className="px-2.5 py-1 text-[11px] rounded-md bg-[#F8F8FA] text-[#9B9B9B]">
              {kw.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}

      <div className="border-t border-[#E5E5E5] mt-8 mb-10" />

      <div className="space-y-4">
        {paragraphs.map((p, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: Math.min(i * 0.05, 0.5) }}
            className="font-serif text-[18px] md:text-[19px] leading-[2] text-[#1A1A1A]/90"
          >
            {p}
          </motion.p>
        ))}
      </div>

      <div className="border-t border-[#E5E5E5] mt-14 pt-6 flex items-center justify-between">
        <span className="text-xs text-[#9B9B9B]">{article.source_name}</span>
        {article.url && (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors"
          >
            Fonte ufficiale &rarr;
          </a>
        )}
      </div>
    </div>
  );
}
