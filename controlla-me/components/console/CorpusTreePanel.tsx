"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { Search, ChevronRight } from "lucide-react";

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
}

interface ColumnData {
  nodes: TreeNode[];
  articles: TreeArticle[];
  selectedKey: string | null;
  label: string;
}

interface CorpusTreePanelProps {
  open: boolean;
  onClose: () => void;
}

// ─── Helpers ───

function countArticles(node: TreeNode): number {
  let count = node.articles.length;
  for (const child of node.children) count += countArticles(child);
  return count;
}

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

// ─── Main Component ───

export default function CorpusTreePanel({ open, onClose }: CorpusTreePanelProps) {
  const [activeTab, setActiveTab] = useState<"fonti" | "istituti">("fonti");

  // Sources
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceInfo | null>(null);
  const [fullTree, setFullTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  // Miller columns state
  const [columns, setColumns] = useState<ColumnData[]>([]);

  // Institutes
  const [institutes, setInstitutes] = useState<InstituteInfo[]>([]);
  const [loadingInstitutes, setLoadingInstitutes] = useState(false);
  const [selectedInstitute, setSelectedInstitute] = useState<string | null>(null);
  const [instituteArticles, setInstituteArticles] = useState<InstituteArticle[]>([]);
  const [loadingInstituteArticles, setLoadingInstituteArticles] = useState(false);

  // Article preview
  const [previewArticle, setPreviewArticle] = useState<ArticleDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll container ref for auto-scroll
  const columnsContainerRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll columns container to the right when new column appears
  useEffect(() => {
    if (columnsContainerRef.current && columns.length > 0) {
      setTimeout(() => {
        columnsContainerRef.current?.scrollTo({
          left: columnsContainerRef.current.scrollWidth,
          behavior: "smooth",
        });
      }, 50);
    }
  }, [columns.length, previewArticle]);

  // ─── Actions ───

  const selectSource = useCallback(async (source: SourceInfo) => {
    setSelectedSource(source);
    setPreviewArticle(null);
    setSearchResults(null);
    setColumns([]);
    setTreeLoading(true);
    try {
      const res = await fetch(`/api/corpus/hierarchy?source=${source.source_id}`);
      const data = await res.json();
      if (data.tree) {
        setFullTree(data.tree);
        setColumns([{
          nodes: data.tree,
          articles: [],
          selectedKey: null,
          label: source.source_name,
        }]);
      }
    } catch { /* ignore */ }
    setTreeLoading(false);
  }, []);

  const selectNode = useCallback((colIndex: number, node: TreeNode) => {
    setPreviewArticle(null);
    setColumns((prev) => {
      // Truncate columns after colIndex, update selection on colIndex, add new column
      const updated = prev.slice(0, colIndex + 1);
      updated[colIndex] = { ...updated[colIndex], selectedKey: node.key };

      // Add next column with children
      if (node.children.length > 0 || node.articles.length > 0) {
        updated.push({
          nodes: node.children,
          articles: node.articles,
          selectedKey: null,
          label: node.label,
        });
      }

      return updated;
    });
  }, []);

  const selectArticle = useCallback(async (id: string, colIndex?: number) => {
    // Update selection in column if provided
    if (colIndex !== undefined) {
      setColumns((prev) => {
        const updated = prev.slice(0, colIndex + 1);
        updated[colIndex] = { ...updated[colIndex], selectedKey: id };
        return updated;
      });
    }

    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/corpus/article?id=${id}`);
      const data = await res.json();
      if (data.id) setPreviewArticle(data as ArticleDetail);
    } catch { /* ignore */ }
    setPreviewLoading(false);
  }, []);

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.trim().length >= 3) {
      searchTimeout.current = setTimeout(() => doSearch(value.trim()), 400);
    } else if (value.trim().length === 0) {
      setSearchResults(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSource]);

  const doSearch = useCallback(async (query: string) => {
    setSearchLoading(true);
    setPreviewArticle(null);
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
    setPreviewArticle(null);
    setSearchResults(null);
    setSearchQuery("");
    setColumns([]);
    setFullTree([]);
  }, []);

  const totalArticles = sources.reduce((sum, s) => sum + s.article_count, 0);

  if (!open) return null;

  // Group sources by type
  const itSources = sources.filter((s) => s.source_type === "normattiva");
  const euSources = sources.filter((s) => s.source_type === "eurlex");

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* ─── Toolbar (top) ─── */}
      <div className="flex flex-wrap items-center gap-2 md:gap-4 px-3 md:px-6 py-2 md:py-3 border-b border-[#E5E5E5] bg-[#FAFAFA] shrink-0">
        {/* Tabs */}
        <div className="flex gap-1">
          {(["fonti", "istituti"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeTab === tab
                  ? "bg-[#1A1A1A] text-white"
                  : "text-[#6B6B6B] hover:bg-[#F0F0F0]"
              }`}
            >
              {tab === "fonti" ? "Per fonte" : "Per istituto"}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[140px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9B9B9B]" />
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
            className="w-full pl-9 pr-4 py-2 bg-white border border-[#E5E5E5] rounded-lg text-xs text-[#1A1A1A] placeholder:text-[#9B9B9B] focus:outline-none focus:ring-1 focus:ring-[#A78BFA]/40 transition-all"
          />
        </div>

        {/* Stats */}
        <span className="text-[11px] text-[#9B9B9B] shrink-0 hidden sm:inline">
          <PanelCount value={totalArticles} /> articoli &middot; {sources.length} fonti
        </span>
      </div>

      {/* ─── Columns area: snap-scroll on mobile, side-by-side on desktop ─── */}
      <div
        ref={columnsContainerRef}
        className="flex-1 flex min-h-0 overflow-x-auto snap-x snap-mandatory md:snap-none"
      >

        {/* Search results mode */}
        {searchResults !== null ? (
          <>
            <SearchResultsColumn
              results={searchResults}
              loading={searchLoading}
              selectedId={previewArticle?.id ?? null}
              onSelect={(id) => selectArticle(id)}
              onClose={() => { setSearchResults(null); setSearchQuery(""); }}
            />
            {(previewArticle || previewLoading) && (
              <ArticlePreview article={previewArticle} loading={previewLoading} />
            )}
          </>
        ) : activeTab === "fonti" ? (
          <>
            {/* Source column */}
            <SourceColumn
              itSources={itSources}
              euSources={euSources}
              selectedId={selectedSource?.source_id ?? null}
              loading={sources.length === 0}
              onSelect={selectSource}
            />

            {/* Loading indicator */}
            {treeLoading && (
              <div className="w-[calc(100vw-2px)] md:w-[220px] shrink-0 snap-start border-r border-[#F0F0F0] flex items-center justify-center">
                <div className="space-y-3 animate-pulse w-full px-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-4 bg-[#F0F0F0] rounded" style={{ width: `${60 + i * 8}%` }} />
                  ))}
                </div>
              </div>
            )}

            {/* Hierarchy columns (Miller style) */}
            <AnimatePresence>
              {columns.map((col, i) => (
                <motion.div
                  key={`col-${i}-${col.label}`}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="shrink-0"
                >
                  <HierarchyColumn
                    column={col}
                    colIndex={i}
                    onNodeSelect={selectNode}
                    onArticleSelect={selectArticle}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Article preview */}
            {(previewArticle || previewLoading) && (
              <ArticlePreview article={previewArticle} loading={previewLoading} />
            )}

            {/* Empty state: no source selected */}
            {!selectedSource && !treeLoading && sources.length > 0 && (
              <div className="flex-1 flex items-center justify-center text-sm text-[#9B9B9B]">
                Seleziona una fonte per iniziare
              </div>
            )}
          </>
        ) : (
          /* Institutes mode */
          <>
            <InstituteColumn
              institutes={institutes}
              loading={loadingInstitutes}
              selectedName={selectedInstitute}
              onSelect={(name) => {
                setSelectedInstitute(name);
                setPreviewArticle(null);
              }}
            />

            {selectedInstitute && (
              <InstituteArticlesColumn
                articles={instituteArticles}
                loading={loadingInstituteArticles}
                selectedId={previewArticle?.id ?? null}
                onSelect={(id) => selectArticle(id)}
              />
            )}

            {(previewArticle || previewLoading) && (
              <ArticlePreview article={previewArticle} loading={previewLoading} />
            )}

            {!selectedInstitute && !loadingInstitutes && institutes.length > 0 && (
              <div className="flex-1 flex items-center justify-center text-sm text-[#9B9B9B]">
                Seleziona un istituto per iniziare
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Source Column ───

function SourceColumn({
  itSources, euSources, selectedId, loading, onSelect,
}: {
  itSources: SourceInfo[];
  euSources: SourceInfo[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (source: SourceInfo) => void;
}) {
  return (
    <div className="w-[calc(100vw-2px)] md:w-[220px] shrink-0 snap-start border-r border-[#F0F0F0] flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-[#F0F0F0] bg-[#FAFAFA]">
        <span className="text-[10px] tracking-[1.5px] uppercase text-[#9B9B9B] font-medium">
          Fonti
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 bg-[#F0F0F0] rounded" style={{ width: `${50 + i * 12}%` }} />
            ))}
          </div>
        ) : (
          <>
            {itSources.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1.5 text-[9px] tracking-[1.5px] uppercase text-[#9B9B9B]">
                  Italia
                </p>
                {itSources.map((s) => (
                  <SourceItem key={s.source_id} source={s} selected={selectedId === s.source_id} onSelect={onSelect} />
                ))}
              </div>
            )}
            {euSources.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1.5 text-[9px] tracking-[1.5px] uppercase text-[#9B9B9B]">
                  Unione Europea
                </p>
                {euSources.map((s) => (
                  <SourceItem key={s.source_id} source={s} selected={selectedId === s.source_id} onSelect={onSelect} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SourceItem({ source, selected, onSelect }: {
  source: SourceInfo; selected: boolean; onSelect: (s: SourceInfo) => void;
}) {
  return (
    <button
      onClick={() => onSelect(source)}
      className={`w-full text-left px-4 py-2 flex items-center gap-2 text-xs transition-colors ${
        selected
          ? "bg-[#A78BFA]/10 text-[#A78BFA] font-medium"
          : "text-[#1A1A1A] hover:bg-[#F5F5F7]"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected ? "bg-[#A78BFA]" : "bg-[#D5D5D5]"}`} />
      <span className="truncate flex-1">{source.source_name}</span>
      <span className="text-[10px] text-[#9B9B9B] tabular-nums shrink-0">
        {source.article_count}
      </span>
    </button>
  );
}

// ─── Hierarchy Column (Miller column) ───

function HierarchyColumn({
  column, colIndex, onNodeSelect, onArticleSelect,
}: {
  column: ColumnData;
  colIndex: number;
  onNodeSelect: (colIndex: number, node: TreeNode) => void;
  onArticleSelect: (id: string, colIndex: number) => void;
}) {
  const maxCount = Math.max(...column.nodes.map(countArticles), 1);

  return (
    <div className="w-[calc(100vw-2px)] md:w-[220px] shrink-0 snap-start border-r border-[#F0F0F0] flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-[#F0F0F0] bg-[#FAFAFA]">
        <span className="text-[10px] tracking-[1.5px] uppercase text-[#9B9B9B] font-medium truncate block">
          {column.label}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* Nodes */}
        {column.nodes.map((node) => {
          const total = countArticles(node);
          const isSelected = column.selectedKey === node.key;
          const hasContent = node.children.length > 0 || node.articles.length > 0;

          return (
            <button
              key={node.key}
              onClick={() => hasContent && onNodeSelect(colIndex, node)}
              className={`w-full text-left px-4 py-2 flex items-center gap-2 text-xs transition-colors group ${
                isSelected
                  ? "bg-[#A78BFA]/10 text-[#A78BFA] font-medium"
                  : "text-[#1A1A1A] hover:bg-[#F5F5F7]"
              }`}
            >
              <span className="truncate flex-1">{node.label}</span>
              {total > 0 && (
                <span className={`text-[10px] tabular-nums shrink-0 ${
                  isSelected ? "text-[#A78BFA]/60" : "text-[#9B9B9B]"
                }`}>
                  {total}
                </span>
              )}
              {hasContent && (
                <ChevronRight className={`w-3 h-3 shrink-0 ${
                  isSelected ? "text-[#A78BFA]/60" : "text-[#D5D5D5]"
                }`} />
              )}
            </button>
          );
        })}

        {/* Articles at this level */}
        {column.articles.length > 0 && (
          <>
            {column.nodes.length > 0 && (
              <div className="border-t border-[#F0F0F0] mx-4 my-1" />
            )}
            {column.articles.map((art) => {
              const isSelected = column.selectedKey === art.id;
              return (
                <button
                  key={art.id}
                  onClick={() => onArticleSelect(art.id, colIndex)}
                  className={`w-full text-left px-4 py-1.5 flex items-center gap-1.5 text-xs transition-colors ${
                    isSelected
                      ? "bg-[#A78BFA]/10 text-[#A78BFA] font-medium"
                      : "text-[#6B6B6B] hover:bg-[#F5F5F7]"
                  }`}
                >
                  <span className="shrink-0">Art. {art.article_number}</span>
                  {art.article_title && (
                    <span className={`truncate ${isSelected ? "text-[#A78BFA]/70" : "text-[#9B9B9B]"}`}>
                      {art.article_title}
                    </span>
                  )}
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Institute Column ───

function InstituteColumn({
  institutes, loading, selectedName, onSelect,
}: {
  institutes: InstituteInfo[];
  loading: boolean;
  selectedName: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="w-[calc(100vw-2px)] md:w-[240px] shrink-0 snap-start border-r border-[#F0F0F0] flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-[#F0F0F0] bg-[#FAFAFA]">
        <span className="text-[10px] tracking-[1.5px] uppercase text-[#9B9B9B] font-medium">
          Istituti Giuridici
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 bg-[#F0F0F0] rounded" style={{ width: `${50 + i * 10}%` }} />
            ))}
          </div>
        ) : (
          institutes.map((inst) => {
            const isSelected = selectedName === inst.name;
            return (
              <button
                key={inst.name}
                onClick={() => onSelect(inst.name)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-2 text-xs transition-colors ${
                  isSelected
                    ? "bg-[#A78BFA]/10 text-[#A78BFA] font-medium"
                    : "text-[#1A1A1A] hover:bg-[#F5F5F7]"
                }`}
              >
                <span className="truncate flex-1">{inst.label}</span>
                <span className={`text-[10px] tabular-nums shrink-0 ${
                  isSelected ? "text-[#A78BFA]/60" : "text-[#9B9B9B]"
                }`}>
                  {inst.count}
                </span>
                <ChevronRight className={`w-3 h-3 shrink-0 ${
                  isSelected ? "text-[#A78BFA]/60" : "text-[#D5D5D5]"
                }`} />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Institute Articles Column ───

function InstituteArticlesColumn({
  articles, loading, selectedId, onSelect,
}: {
  articles: InstituteArticle[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="w-[calc(100vw-2px)] md:w-[260px] shrink-0 snap-start border-r border-[#F0F0F0] flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-[#F0F0F0] bg-[#FAFAFA]">
        <span className="text-[10px] tracking-[1.5px] uppercase text-[#9B9B9B] font-medium">
          Articoli ({articles.length})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 bg-[#F0F0F0] rounded" style={{ width: `${50 + i * 10}%` }} />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <p className="px-4 py-8 text-xs text-[#9B9B9B] text-center">Nessun articolo.</p>
        ) : (
          articles.map((art) => {
            const isSelected = selectedId === art.id;
            return (
              <button
                key={art.id}
                onClick={() => onSelect(art.id)}
                className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                  isSelected
                    ? "bg-[#A78BFA]/10 text-[#A78BFA] font-medium"
                    : "text-[#1A1A1A] hover:bg-[#F5F5F7]"
                }`}
              >
                <span>Art. {art.article_number}</span>
                {art.article_title && (
                  <span className={`ml-1.5 ${isSelected ? "text-[#A78BFA]/70" : "text-[#9B9B9B]"}`}>
                    &mdash; {art.article_title}
                  </span>
                )}
                <p className={`mt-0.5 text-[10px] ${isSelected ? "text-[#A78BFA]/50" : "text-[#9B9B9B]"}`}>
                  {art.source_name}
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Search Results Column ───

function SearchResultsColumn({
  results, loading, selectedId, onSelect, onClose,
}: {
  results: SearchResult[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="w-[calc(100vw-2px)] md:w-[300px] shrink-0 snap-start border-r border-[#F0F0F0] flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-[#F0F0F0] bg-[#FAFAFA] flex items-center justify-between">
        <span className="text-[10px] tracking-[1.5px] uppercase text-[#9B9B9B] font-medium">
          {results.length} risultati
        </span>
        <button
          onClick={onClose}
          className="text-[10px] text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors"
        >
          Chiudi
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 bg-[#F0F0F0] rounded" style={{ width: `${50 + i * 10}%` }} />
            ))}
          </div>
        ) : results.length === 0 ? (
          <p className="px-4 py-8 text-xs text-[#9B9B9B] text-center">Nessun risultato.</p>
        ) : (
          results.map((r) => {
            const isSelected = selectedId === r.id;
            return (
              <button
                key={r.id}
                onClick={() => onSelect(r.id)}
                className={`w-full text-left px-4 py-2.5 border-b border-[#F0F0F0] text-xs transition-colors ${
                  isSelected
                    ? "bg-[#A78BFA]/10"
                    : "hover:bg-[#F5F5F7]"
                }`}
              >
                <span className={`font-medium ${isSelected ? "text-[#A78BFA]" : "text-[#1A1A1A]"}`}>
                  {r.article_reference}
                </span>
                {r.article_title && (
                  <span className={`ml-1 ${isSelected ? "text-[#A78BFA]/70" : "text-[#6B6B6B]"}`}>
                    &mdash; {r.article_title}
                  </span>
                )}
                <p className="text-[10px] text-[#9B9B9B] mt-0.5">{r.law_source}</p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Article Preview ───

function ArticlePreview({ article, loading }: {
  article: ArticleDetail | null;
  loading: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 min-w-[calc(100vw-2px)] md:min-w-[320px] snap-start flex flex-col min-h-0 bg-white"
    >
      <div className="px-6 py-2.5 border-b border-[#F0F0F0] bg-[#FAFAFA]">
        <span className="text-[10px] tracking-[1.5px] uppercase text-[#9B9B9B] font-medium">
          Anteprima
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-8">
        {loading ? (
          <div className="max-w-[600px] mx-auto space-y-4 animate-pulse">
            <div className="h-3 w-48 bg-[#F0F0F0] rounded" />
            <div className="h-8 w-72 bg-[#F0F0F0] rounded" />
            <div className="h-5 w-56 bg-[#F0F0F0] rounded" />
            <div className="h-px bg-[#F0F0F0] my-6" />
            <div className="h-4 w-full bg-[#F0F0F0] rounded" />
            <div className="h-4 w-full bg-[#F0F0F0] rounded" />
            <div className="h-4 w-3/4 bg-[#F0F0F0] rounded" />
          </div>
        ) : article ? (
          <div className="max-w-[600px] mx-auto">
            {/* Hierarchy breadcrumb */}
            {(article.source_name || Object.keys(article.hierarchy).length > 0) && (
              <p className="text-[11px] text-[#9B9B9B] mb-5">
                {[article.source_name, ...Object.values(article.hierarchy)].filter(Boolean).join(" / ")}
              </p>
            )}

            <h3 className="font-serif text-3xl text-[#1A1A1A] tracking-tight leading-tight">
              Articolo {article.article_number}
            </h3>
            {article.article_title && (
              <p className="text-lg text-[#6B6B6B] font-light mt-1.5">{article.article_title}</p>
            )}

            {article.keywords && article.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {article.keywords.map((kw) => (
                  <span key={kw} className="px-2 py-0.5 text-[10px] rounded-md bg-[#F8F8FA] text-[#9B9B9B]">
                    {kw.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}

            <div className="border-t border-[#E5E5E5] mt-6 mb-8" />

            <div className="space-y-3">
              {article.article_text.split("\n").filter((p) => p.trim()).map((p, i) => (
                <p
                  key={i}
                  className="font-serif text-[17px] leading-[1.9] text-[#1A1A1A]/90"
                >
                  {p}
                </p>
              ))}
            </div>

            <div className="border-t border-[#E5E5E5] mt-10 pt-5 flex items-center justify-between">
              <span className="text-[11px] text-[#9B9B9B]">{article.source_name}</span>
              {article.url && (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors"
                >
                  Fonte ufficiale &rarr;
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[#9B9B9B] h-full">
            Seleziona un articolo per leggere
          </div>
        )}
      </div>
    </motion.div>
  );
}
