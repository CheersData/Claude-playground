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
  source_id: string;
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
  /** When set, auto-navigates to this article (from cited article click in chat) */
  focusArticleId?: string | null;
}

// ─── Helpers ───

function countArticles(node: TreeNode): number {
  let count = node.articles.length;
  for (const child of node.children) count += countArticles(child);
  return count;
}

/** Recursively find the path of TreeNodes leading to the article with the given ID. */
function findArticleInTree(nodes: TreeNode[], articleId: string): TreeNode[] | null {
  for (const node of nodes) {
    if (node.articles.some(a => a.id === articleId)) {
      return [node];
    }
    const childPath = findArticleInTree(node.children, articleId);
    if (childPath) {
      return [node, ...childPath];
    }
  }
  return null;
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

export default function CorpusTreePanel({ open, onClose: _onClose, focusArticleId }: CorpusTreePanelProps) {
  const [activeTab, setActiveTab] = useState<"fonti" | "istituti">("fonti");

  // Sources
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceInfo | null>(null);
  const [_fullTree, setFullTree] = useState<TreeNode[]>([]);
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

  // Full navigation: fetch article → load source tree → expand hierarchy → select article
  const navigateToArticle = useCallback(async (articleId: string) => {
    // 1. Fetch article details (preview + source info)
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/corpus/article?id=${articleId}`);
      const article = await res.json();
      if (!article.id) { setPreviewLoading(false); return; }
      setPreviewArticle(article as ArticleDetail);
      setPreviewLoading(false);

      // 2. Switch to fonti tab, clear search
      setActiveTab("fonti");
      setSearchResults(null);
      setSearchQuery("");

      // 3. Ensure sources are loaded
      let currentSources = sources;
      if (currentSources.length === 0) {
        const srcRes = await fetch("/api/corpus/hierarchy");
        const srcData = await srcRes.json();
        if (srcData.sources) {
          setSources(srcData.sources);
          currentSources = srcData.sources;
        }
      }

      // 4. Find matching source by source_id
      const matchedSource = currentSources.find(
        s => s.source_id === article.source_id || s.source_name === article.source_name
      );
      if (!matchedSource) return;
      setSelectedSource(matchedSource);

      // 5. Load source tree
      setTreeLoading(true);
      const treeRes = await fetch(`/api/corpus/hierarchy?source=${matchedSource.source_id}`);
      const treeData = await treeRes.json();
      setTreeLoading(false);
      if (!treeData.tree) return;
      setFullTree(treeData.tree);

      // 6. Find article path in tree and build columns
      const path = findArticleInTree(treeData.tree, articleId);

      if (path && path.length > 0) {
        const newColumns: ColumnData[] = [{
          nodes: treeData.tree,
          articles: [],
          selectedKey: path[0].key,
          label: matchedSource.source_name,
        }];

        for (let i = 0; i < path.length; i++) {
          const node = path[i];
          const isLast = i === path.length - 1;
          const nextSelectedKey = isLast ? articleId : path[i + 1].key;

          newColumns.push({
            nodes: node.children,
            articles: node.articles,
            selectedKey: nextSelectedKey,
            label: node.label,
          });
        }

        setColumns(newColumns);
      } else {
        // Article not found in tree hierarchy — show root with preview
        setColumns([{
          nodes: treeData.tree,
          articles: [],
          selectedKey: null,
          label: matchedSource.source_name,
        }]);
      }
    } catch {
      setPreviewLoading(false);
    }
  }, [sources]);

  // Auto-navigate to article when focusArticleId changes (from cited article click in chat)
  useEffect(() => {
    if (focusArticleId) {
      navigateToArticle(focusArticleId);
    }
  }, [focusArticleId, navigateToArticle]);

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
      <div className="flex flex-wrap items-center gap-2 md:gap-4 px-3 md:px-6 py-2 md:py-3 border-b border-[var(--border)] bg-[var(--background-secondary)] shrink-0">
        {/* Tabs */}
        <div className="flex gap-1" role="tablist" aria-label="Modalità navigazione corpus">
          {(["fonti", "istituti"] as const).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`corpus-tabpanel-${tab}`}
              id={`corpus-tab-${tab}`}
              onClick={() => switchTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)] ${
                activeTab === tab
                  ? "bg-[var(--foreground)] text-white"
                  : "text-[var(--foreground-secondary)] hover:bg-[var(--border-subtle)]"
              }`}
            >
              {tab === "fonti" ? "Per fonte" : "Per istituto"}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[140px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-tertiary)]" aria-hidden="true" />
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
            aria-label="Ricerca semantica nel corpus legislativo"
            className="w-full pl-9 pr-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-xs text-[var(--foreground)] placeholder:text-[var(--foreground-tertiary)] focus:outline-none focus:ring-1 focus:ring-[#A78BFA]/40 transition-all"
          />
        </div>

        {/* Stats */}
        <span className="text-[11px] text-[var(--foreground-tertiary)] shrink-0 hidden sm:inline">
          <PanelCount value={totalArticles} /> articoli &middot; {sources.length} fonti
        </span>
      </div>

      {/* ─── Columns area: snap-scroll on mobile, side-by-side on desktop ─── */}
      <div
        ref={columnsContainerRef}
        role="tabpanel"
        id={`corpus-tabpanel-${activeTab}`}
        aria-labelledby={`corpus-tab-${activeTab}`}
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
              <div className="w-[calc(100vw-2px)] md:w-[220px] shrink-0 snap-start border-r border-[var(--border-subtle)] flex items-center justify-center" role="status" aria-label="Caricamento struttura">
                <div className="space-y-3 animate-pulse w-full px-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-4 bg-[var(--border-subtle)] rounded" style={{ width: `${60 + i * 8}%` }} />
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
              <div className="flex-1 flex items-center justify-center text-sm text-[var(--foreground-tertiary)]">
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
              <div className="flex-1 flex items-center justify-center text-sm text-[var(--foreground-tertiary)]">
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
    <nav className="w-[calc(100vw-2px)] md:w-[220px] shrink-0 snap-start border-r border-[var(--border-subtle)] flex flex-col min-h-0" aria-label="Fonti legislative">
      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--background-secondary)]">
        <span className="text-[10px] tracking-[1.5px] uppercase text-[var(--foreground-tertiary)] font-medium">
          Fonti
        </span>
      </div>
      <div className="flex-1 overflow-y-auto" role="listbox" aria-label="Lista fonti legislative">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse" role="status" aria-label="Caricamento fonti">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 bg-[var(--border-subtle)] rounded" style={{ width: `${50 + i * 12}%` }} />
            ))}
          </div>
        ) : (
          <>
            {itSources.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1.5 text-[9px] tracking-[1.5px] uppercase text-[var(--foreground-tertiary)]">
                  Italia
                </p>
                {itSources.map((s) => (
                  <SourceItem key={s.source_id} source={s} selected={selectedId === s.source_id} onSelect={onSelect} />
                ))}
              </div>
            )}
            {euSources.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1.5 text-[9px] tracking-[1.5px] uppercase text-[var(--foreground-tertiary)]">
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
    </nav>
  );
}

function SourceItem({ source, selected, onSelect }: {
  source: SourceInfo; selected: boolean; onSelect: (s: SourceInfo) => void;
}) {
  return (
    <button
      onClick={() => onSelect(source)}
      role="option"
      aria-selected={selected}
      aria-label={`${source.source_name} — ${source.article_count} articoli`}
      className={`w-full text-left px-4 py-2 flex items-center gap-2 text-xs transition-colors focus:outline-2 focus:outline-offset-[-2px] focus:outline-[var(--accent)] ${
        selected
          ? "bg-[#A78BFA]/10 text-[#A78BFA] font-medium"
          : "text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected ? "bg-[#A78BFA]" : "bg-[var(--border)]"}`} aria-hidden="true" />
      <span className="truncate flex-1">{source.source_name}</span>
      <span className="text-[10px] text-[var(--foreground-tertiary)] tabular-nums shrink-0">
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
  return (
    <div className="w-[calc(100vw-2px)] md:w-[220px] shrink-0 snap-start border-r border-[var(--border-subtle)] flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--background-secondary)]">
        <span className="text-[10px] tracking-[1.5px] uppercase text-[var(--foreground-tertiary)] font-medium truncate block">
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
              aria-label={`${node.label}${total > 0 ? ` — ${total} articoli` : ""}${isSelected ? " (selezionato)" : ""}`}
              aria-expanded={hasContent ? isSelected : undefined}
              className={`w-full text-left px-4 py-2 flex items-center gap-2 text-xs transition-colors group focus:outline-2 focus:outline-offset-[-2px] focus:outline-[var(--accent)] ${
                isSelected
                  ? "bg-[#A78BFA]/10 text-[#A78BFA] font-medium"
                  : "text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              <span className="truncate flex-1">{node.label}</span>
              {total > 0 && (
                <span className={`text-[10px] tabular-nums shrink-0 ${
                  isSelected ? "text-[#A78BFA]/60" : "text-[var(--foreground-tertiary)]"
                }`}>
                  {total}
                </span>
              )}
              {hasContent && (
                <ChevronRight className={`w-3 h-3 shrink-0 ${
                  isSelected ? "text-[#A78BFA]/60" : "text-[var(--border)]"
                }`} aria-hidden="true" />
              )}
            </button>
          );
        })}

        {/* Articles at this level */}
        {column.articles.length > 0 && (
          <>
            {column.nodes.length > 0 && (
              <div className="border-t border-[var(--border-subtle)] mx-4 my-1" />
            )}
            {column.articles.map((art) => {
              const isSelected = column.selectedKey === art.id;
              return (
                <button
                  key={art.id}
                  onClick={() => onArticleSelect(art.id, colIndex)}
                  aria-label={`Articolo ${art.article_number}${art.article_title ? ` — ${art.article_title}` : ""}${isSelected ? " (selezionato)" : ""}`}
                  className={`w-full text-left px-4 py-1.5 flex items-center gap-1.5 text-xs transition-colors focus:outline-2 focus:outline-offset-[-2px] focus:outline-[var(--accent)] ${
                    isSelected
                      ? "bg-[#A78BFA]/10 text-[#A78BFA] font-medium"
                      : "text-[var(--foreground-secondary)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <span className="shrink-0">Art. {art.article_number}</span>
                  {art.article_title && (
                    <span className={`truncate ${isSelected ? "text-[#A78BFA]/70" : "text-[var(--foreground-tertiary)]"}`}>
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
    <nav className="w-[calc(100vw-2px)] md:w-[240px] shrink-0 snap-start border-r border-[var(--border-subtle)] flex flex-col min-h-0" aria-label="Istituti giuridici">
      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--background-secondary)]">
        <span className="text-[10px] tracking-[1.5px] uppercase text-[var(--foreground-tertiary)] font-medium">
          Istituti Giuridici
        </span>
      </div>
      <div className="flex-1 overflow-y-auto" role="listbox" aria-label="Lista istituti giuridici">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse" role="status" aria-label="Caricamento istituti">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 bg-[var(--border-subtle)] rounded" style={{ width: `${50 + i * 10}%` }} />
            ))}
          </div>
        ) : (
          institutes.map((inst) => {
            const isSelected = selectedName === inst.name;
            return (
              <button
                key={inst.name}
                onClick={() => onSelect(inst.name)}
                role="option"
                aria-selected={isSelected}
                aria-label={`${inst.label} — ${inst.count} articoli${isSelected ? " (selezionato)" : ""}`}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-2 text-xs transition-colors focus:outline-2 focus:outline-offset-[-2px] focus:outline-[var(--accent)] ${
                  isSelected
                    ? "bg-[#A78BFA]/10 text-[#A78BFA] font-medium"
                    : "text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                <span className="truncate flex-1">{inst.label}</span>
                <span className={`text-[10px] tabular-nums shrink-0 ${
                  isSelected ? "text-[#A78BFA]/60" : "text-[var(--foreground-tertiary)]"
                }`}>
                  {inst.count}
                </span>
                <ChevronRight className={`w-3 h-3 shrink-0 ${
                  isSelected ? "text-[#A78BFA]/60" : "text-[var(--border)]"
                }`} aria-hidden="true" />
              </button>
            );
          })
        )}
      </div>
    </nav>
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
    <div className="w-[calc(100vw-2px)] md:w-[260px] shrink-0 snap-start border-r border-[var(--border-subtle)] flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--background-secondary)]">
        <span className="text-[10px] tracking-[1.5px] uppercase text-[var(--foreground-tertiary)] font-medium">
          Articoli ({articles.length})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto" role="listbox" aria-label="Articoli dell'istituto">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse" role="status" aria-label="Caricamento articoli">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 bg-[var(--border-subtle)] rounded" style={{ width: `${50 + i * 10}%` }} />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <p className="px-4 py-8 text-xs text-[var(--foreground-tertiary)] text-center">Nessun articolo.</p>
        ) : (
          articles.map((art) => {
            const isSelected = selectedId === art.id;
            return (
              <button
                key={art.id}
                onClick={() => onSelect(art.id)}
                role="option"
                aria-selected={isSelected}
                aria-label={`Articolo ${art.article_number}${art.article_title ? ` — ${art.article_title}` : ""}, ${art.source_name}`}
                className={`w-full text-left px-4 py-2 text-xs transition-colors focus:outline-2 focus:outline-offset-[-2px] focus:outline-[var(--accent)] ${
                  isSelected
                    ? "bg-[#A78BFA]/10 text-[#A78BFA] font-medium"
                    : "text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                }`}
              >
                <span>Art. {art.article_number}</span>
                {art.article_title && (
                  <span className={`ml-1.5 ${isSelected ? "text-[#A78BFA]/70" : "text-[var(--foreground-tertiary)]"}`}>
                    &mdash; {art.article_title}
                  </span>
                )}
                <p className={`mt-0.5 text-[10px] ${isSelected ? "text-[#A78BFA]/50" : "text-[var(--foreground-tertiary)]"}`}>
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
    <div className="w-[calc(100vw-2px)] md:w-[300px] shrink-0 snap-start border-r border-[var(--border-subtle)] flex flex-col min-h-0">
      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--background-secondary)] flex items-center justify-between">
        <span className="text-[10px] tracking-[1.5px] uppercase text-[var(--foreground-tertiary)] font-medium">
          {results.length} risultati
        </span>
        <button
          onClick={onClose}
          aria-label="Chiudi risultati ricerca"
          className="text-[10px] text-[var(--foreground-tertiary)] hover:text-[var(--foreground)] transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
        >
          Chiudi
        </button>
      </div>
      <div className="flex-1 overflow-y-auto" role="listbox" aria-label="Risultati ricerca semantica">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse" role="status" aria-label="Ricerca in corso">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 bg-[var(--border-subtle)] rounded" style={{ width: `${50 + i * 10}%` }} />
            ))}
          </div>
        ) : results.length === 0 ? (
          <p className="px-4 py-8 text-xs text-[var(--foreground-tertiary)] text-center">Nessun risultato.</p>
        ) : (
          results.map((r) => {
            const isSelected = selectedId === r.id;
            return (
              <button
                key={r.id}
                onClick={() => onSelect(r.id)}
                role="option"
                aria-selected={isSelected}
                aria-label={`${r.article_reference}${r.article_title ? ` — ${r.article_title}` : ""}, ${r.law_source}`}
                className={`w-full text-left px-4 py-2.5 border-b border-[var(--border-subtle)] text-xs transition-colors focus:outline-2 focus:outline-offset-[-2px] focus:outline-[var(--accent)] ${
                  isSelected
                    ? "bg-[#A78BFA]/10"
                    : "hover:bg-[var(--surface-hover)]"
                }`}
              >
                <span className={`font-medium ${isSelected ? "text-[#A78BFA]" : "text-[var(--foreground)]"}`}>
                  {r.article_reference}
                </span>
                {r.article_title && (
                  <span className={`ml-1 ${isSelected ? "text-[#A78BFA]/70" : "text-[var(--foreground-secondary)]"}`}>
                    &mdash; {r.article_title}
                  </span>
                )}
                <p className="text-[10px] text-[var(--foreground-tertiary)] mt-0.5">{r.law_source}</p>
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
      className="flex-1 min-w-[calc(100vw-2px)] md:min-w-[320px] snap-start flex flex-col min-h-0 bg-[var(--surface)]"
      role="region"
      aria-label={article ? `Anteprima: Articolo ${article.article_number}${article.article_title ? ` — ${article.article_title}` : ""}` : "Anteprima articolo"}
      aria-live="polite"
    >
      <div className="px-6 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--background-secondary)]">
        <span className="text-[10px] tracking-[1.5px] uppercase text-[var(--foreground-tertiary)] font-medium">
          Anteprima
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-8">
        {loading ? (
          <div className="max-w-[600px] mx-auto space-y-4 animate-pulse" role="status" aria-label="Caricamento anteprima">
            <div className="h-3 w-48 bg-[var(--border-subtle)] rounded" />
            <div className="h-8 w-72 bg-[var(--border-subtle)] rounded" />
            <div className="h-5 w-56 bg-[var(--border-subtle)] rounded" />
            <div className="h-px bg-[var(--border-subtle)] my-6" />
            <div className="h-4 w-full bg-[var(--border-subtle)] rounded" />
            <div className="h-4 w-full bg-[var(--border-subtle)] rounded" />
            <div className="h-4 w-3/4 bg-[var(--border-subtle)] rounded" />
          </div>
        ) : article ? (
          <div className="max-w-[600px] mx-auto">
            {/* Hierarchy breadcrumb */}
            {(article.source_name || Object.keys(article.hierarchy).length > 0) && (
              <p className="text-[11px] text-[var(--foreground-tertiary)] mb-5">
                {[article.source_name, ...Object.values(article.hierarchy)].filter(Boolean).join(" / ")}
              </p>
            )}

            <h3 className="font-serif text-3xl text-[var(--foreground)] tracking-tight leading-tight">
              Articolo {article.article_number}
            </h3>
            {article.article_title && (
              <p className="text-lg text-[var(--foreground-secondary)] font-light mt-1.5">{article.article_title}</p>
            )}

            {article.keywords && article.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {article.keywords.map((kw) => (
                  <span key={kw} className="px-2 py-0.5 text-[10px] rounded-md bg-[var(--background-secondary)] text-[var(--foreground-tertiary)]">
                    {kw.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}

            <div className="border-t border-[var(--border)] mt-6 mb-8" />

            <div className="space-y-3">
              {article.article_text.split("\n").filter((p) => p.trim()).map((p, i) => (
                <p
                  key={i}
                  className="font-serif text-[17px] leading-[1.9] text-[var(--foreground)]/90"
                >
                  {p}
                </p>
              ))}
            </div>

            <div className="border-t border-[var(--border)] mt-10 pt-5 flex items-center justify-between">
              <span className="text-[11px] text-[var(--foreground-tertiary)]">{article.source_name}</span>
              {article.url && (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Fonte ufficiale per Articolo ${article.article_number} (apre in nuova scheda)`}
                  className="text-[11px] text-[var(--foreground-tertiary)] hover:text-[var(--foreground)] transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
                >
                  Fonte ufficiale &rarr;
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--foreground-tertiary)] h-full">
            Seleziona un articolo per leggere
          </div>
        )}
      </div>
    </motion.div>
  );
}
