"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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

interface CorpusTreePanelProps {
  open: boolean;
  onClose: () => void;
}

// ─── Hierarchy level labels ───

const LEVEL_LABELS: Record<string, string> = {
  libro: "Libro",
  titolo: "Titolo",
  capo: "Capo",
  sezione: "Sezione",
  paragrafo: "Paragrafo",
  parte: "Parte",
  chapter: "Capitolo",
  section: "Sezione",
  annex: "Allegato",
};

function formatNodeLabel(label: string): string {
  // If label already starts with a known prefix (e.g. "Libro 1"), keep it
  // If it's just a number or abbreviated, try to improve
  return label;
}

// ─── Search Bar ───

function SearchBar({
  onSearch,
  loading,
}: {
  onSearch: (query: string) => void;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (value: string) => {
    setQuery(value);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (value.trim().length >= 3) {
      timeoutRef.current = setTimeout(() => onSearch(value.trim()), 400);
    }
  };

  return (
    <div className="px-3 py-2 border-b border-[var(--pb-border)]">
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim().length >= 2) {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            onSearch(query.trim());
          }
        }}
        placeholder="Cerca nel corpus (ricerca semantica)..."
        className="w-full bg-[var(--pb-bg-panel)] border border-[var(--pb-border)] rounded px-2 py-1.5 text-xs text-[var(--pb-text)] placeholder:text-[var(--pb-text-dim)] focus:outline-none focus:border-[var(--pb-green)]"
      />
      {loading && (
        <p className="text-[10px] text-[var(--pb-text-dim)] mt-1">Ricerca...</p>
      )}
    </div>
  );
}

// ─── Search Results ───

interface SearchResult {
  id: string;
  article_reference: string;
  article_title: string | null;
  law_source: string;
  similarity: number;
}

function SearchResults({
  results,
  onSelect,
}: {
  results: SearchResult[];
  onSelect: (id: string) => void;
}) {
  if (results.length === 0) {
    return (
      <p className="text-xs text-[var(--pb-text-dim)] py-4 text-center">
        Nessun risultato.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {results.map((r) => (
        <button
          key={r.id}
          onClick={() => onSelect(r.id)}
          className="w-full text-left text-xs py-1.5 px-2 rounded hover:bg-[var(--pb-border)] transition-colors"
        >
          <span className="text-[var(--pb-green)]">{r.article_reference}</span>
          {r.article_title && (
            <span className="text-[var(--pb-text)] ml-1">{r.article_title}</span>
          )}
          <span className="text-[var(--pb-text-dim)] text-[10px] block">
            {r.law_source}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Article View (inline) ───

function ArticleView({
  article,
  onBack,
}: {
  article: ArticleDetail;
  onBack: () => void;
}) {
  return (
    <div className="space-y-3">
      <button
        onClick={onBack}
        className="text-[var(--pb-text-dim)] hover:text-[var(--pb-text)] text-xs"
      >
        &#8592; Torna all&apos;albero
      </button>

      <div>
        <h3 className="text-sm font-serif text-[var(--pb-green)]">
          {article.article_number}
        </h3>
        {article.article_title && (
          <p className="text-xs text-[var(--pb-amber)] mt-0.5">
            {article.article_title}
          </p>
        )}
        <p className="text-[10px] text-[var(--pb-text-dim)] mt-0.5">
          {article.source_name}
          {Object.values(article.hierarchy).length > 0 && (
            <> &mdash; {Object.values(article.hierarchy).join(" &rsaquo; ")}</>
          )}
        </p>
      </div>

      <div className="border-t border-[var(--pb-border)] pt-2">
        <p className="text-xs text-[var(--pb-text)] whitespace-pre-wrap leading-relaxed">
          {article.article_text}
        </p>
      </div>

      {article.keywords && article.keywords.length > 0 && (
        <div className="border-t border-[var(--pb-border)] pt-2">
          <p className="text-[10px] text-[var(--pb-text-dim)]">
            {article.keywords.join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Source List ───

function SourceList({
  sources,
  onSelect,
}: {
  sources: SourceInfo[];
  onSelect: (source: SourceInfo) => void;
}) {
  const total = sources.reduce((sum, s) => sum + s.article_count, 0);

  return (
    <div className="space-y-1">
      <p className="text-[10px] text-[var(--pb-text-dim)] mb-2">
        {sources.length} fonti, {total.toLocaleString("it-IT")} articoli
      </p>
      {sources.map((s) => (
        <button
          key={s.source_id}
          onClick={() => onSelect(s)}
          className="w-full flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-[var(--pb-border)] transition-colors text-left"
        >
          <span className="text-[var(--pb-text)] truncate mr-2">
            {s.source_name}
          </span>
          <span className="text-[var(--pb-text-dim)] flex-shrink-0 text-[10px]">
            {s.article_count}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Tree Node (recursive, expands on click) ───

function TreeNodeItem({
  node,
  depth,
  onArticleClick,
}: {
  node: TreeNode;
  depth: number;
  onArticleClick: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0 || node.articles.length > 0;

  return (
    <div>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className="w-full flex items-center gap-1 text-xs py-1 px-1 rounded hover:bg-[var(--pb-border)] transition-colors text-left"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {hasChildren ? (
          <span
            className="text-[var(--pb-text-dim)] text-[10px] w-3 flex-shrink-0 inline-block transition-transform"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            &#9656;
          </span>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        <span className="text-[var(--pb-text)] truncate">
          {formatNodeLabel(node.label)}
        </span>
        {hasChildren && (
          <span className="text-[var(--pb-text-dim)] text-[10px] ml-auto flex-shrink-0">
            {countArticles(node)}
          </span>
        )}
      </button>

      {expanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.key}
              node={child}
              depth={depth + 1}
              onArticleClick={onArticleClick}
            />
          ))}
          {node.articles.map((art) => (
            <button
              key={art.id}
              onClick={() => onArticleClick(art.id)}
              className="w-full flex items-center gap-1 text-[11px] py-0.5 px-1 rounded hover:bg-[var(--pb-border)] transition-colors text-left"
              style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}
            >
              <span className="text-[var(--pb-green)] flex-shrink-0">
                {art.article_number}
              </span>
              {art.article_title && (
                <span className="text-[var(--pb-text-dim)] truncate text-[10px]">
                  {art.article_title}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function countArticles(node: TreeNode): number {
  let count = node.articles.length;
  for (const child of node.children) {
    count += countArticles(child);
  }
  return count;
}

// ─── Main Panel ───

export default function CorpusTreePanel({ open, onClose }: CorpusTreePanelProps) {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [selectedSource, setSelectedSource] = useState<SourceInfo | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);

  // Search state
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Article detail (inline)
  const [articleDetail, setArticleDetail] = useState<ArticleDetail | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);

  // Fetch sources on first open
  useEffect(() => {
    if (open && sources.length === 0) {
      fetch("/api/corpus/hierarchy")
        .then((r) => r.json())
        .then((data) => {
          if (data.sources) setSources(data.sources);
        })
        .catch(() => {});
    }
  }, [open, sources.length]);

  // Fetch tree for selected source
  const selectSource = useCallback(async (source: SourceInfo) => {
    setSelectedSource(source);
    setSearchResults(null);
    setArticleDetail(null);
    setLoading(true);
    setTree([]);

    try {
      const res = await fetch(`/api/corpus/hierarchy?source=${source.source_id}`);
      const data = await res.json();
      if (data.tree) setTree(data.tree);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch article detail inline
  const openArticle = useCallback(async (id: string) => {
    setArticleLoading(true);
    try {
      const res = await fetch(`/api/corpus/article?id=${id}`);
      const data = await res.json();
      if (data.id) setArticleDetail(data as ArticleDetail);
    } catch {
      // ignore
    } finally {
      setArticleLoading(false);
    }
  }, []);

  // Search
  const handleSearch = useCallback(async (query: string) => {
    setSearchLoading(true);
    setArticleDetail(null);
    try {
      const params = new URLSearchParams({ q: query });
      if (selectedSource) params.set("source", selectedSource.source_id);
      const res = await fetch(`/api/corpus/article?${params}`);
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [selectedSource]);

  const goBack = useCallback(() => {
    if (articleDetail) {
      setArticleDetail(null);
      return;
    }
    if (searchResults) {
      setSearchResults(null);
      return;
    }
    setSelectedSource(null);
    setTree([]);
  }, [articleDetail, searchResults]);

  const headerTitle = articleDetail
    ? articleDetail.article_number
    : selectedSource
      ? selectedSource.source_name
      : "Corpus legislativo";

  const showBackButton = !!(articleDetail || searchResults || selectedSource);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-start">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Panel — LEFT side */}
      <aside className="relative w-[380px] max-w-[85vw] h-full bg-[var(--pb-bg)] border-r border-[var(--pb-border)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--pb-border)]">
          <div className="flex items-center gap-2 min-w-0">
            {showBackButton && (
              <button
                onClick={goBack}
                className="text-[var(--pb-text-dim)] hover:text-[var(--pb-text)] text-sm flex-shrink-0"
              >
                &#8592;
              </button>
            )}
            <h2 className="text-sm font-serif text-[var(--pb-green)] truncate">
              {headerTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--pb-text-dim)] hover:text-[var(--pb-text)] text-lg leading-none flex-shrink-0 ml-2"
          >
            &times;
          </button>
        </div>

        {/* Search bar — visible when source selected or at root */}
        {!articleDetail && (
          <SearchBar onSearch={handleSearch} loading={searchLoading} />
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {/* Article loading */}
          {articleLoading && (
            <p className="text-xs text-[var(--pb-text-dim)] py-4 text-center">
              Caricamento articolo...
            </p>
          )}

          {/* Article detail view */}
          {articleDetail && !articleLoading && (
            <ArticleView
              article={articleDetail}
              onBack={() => setArticleDetail(null)}
            />
          )}

          {/* Search results */}
          {!articleDetail && searchResults && (
            <SearchResults results={searchResults} onSelect={openArticle} />
          )}

          {/* Tree loading */}
          {!articleDetail && !searchResults && loading && (
            <p className="text-xs text-[var(--pb-text-dim)] py-4 text-center">
              Caricamento...
            </p>
          )}

          {/* Source list (root) */}
          {!articleDetail && !searchResults && !selectedSource && sources.length > 0 && (
            <SourceList sources={sources} onSelect={selectSource} />
          )}

          {/* Tree view for selected source */}
          {!articleDetail && !searchResults && selectedSource && !loading && tree.length > 0 && (
            <div className="space-y-0.5">
              {tree.map((node) => (
                <TreeNodeItem
                  key={node.key}
                  node={node}
                  depth={0}
                  onArticleClick={openArticle}
                />
              ))}
            </div>
          )}

          {!articleDetail && !searchResults && selectedSource && !loading && tree.length === 0 && (
            <p className="text-xs text-[var(--pb-text-dim)] py-4 text-center">
              Nessun articolo trovato.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
