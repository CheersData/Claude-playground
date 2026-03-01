"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ArrowLeft } from "lucide-react";
import AnimatedCount from "./AnimatedCount";
import DensityBar from "./DensityBar";

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

interface HierarchyTreeProps {
  source: SourceHierarchy;
  onArticleClick: (articleId: string) => void;
  onBack: () => void;
}

function countNodeArticles(node: HierarchyNode): number {
  let total = node.articles.length;
  for (const child of node.children) {
    total += countNodeArticles(child);
  }
  return total;
}

export default function HierarchyTree({
  source,
  onArticleClick,
  onBack,
}: HierarchyTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Auto-expand first level on mount
  useEffect(() => {
    if (source.tree.length > 0) {
      setExpandedNodes(new Set(source.tree.map((n) => n.key)));
    }
  }, [source]);

  const toggleNode = useCallback((key: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const maxArticles = Math.max(
    ...source.tree.map((n) => countNodeArticles(n)),
    1
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-foreground-tertiary hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Fonti
        </button>
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-3xl">
            {source.source_name}
          </h2>
          <span className="text-sm text-foreground-tertiary tabular-nums">
            <AnimatedCount value={source.article_count} suffix=" articoli" />
          </span>
        </div>
        <div className="border-t border-border mt-4" />
      </div>

      {/* Tree */}
      <div>
        {source.tree.map((node, i) => (
          <TreeNode
            key={node.key}
            node={node}
            depth={0}
            expandedNodes={expandedNodes}
            onToggle={toggleNode}
            onArticleClick={onArticleClick}
            maxArticles={maxArticles}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Depth-based styles ───

const DEPTH_STYLES: Record<number, string> = {
  0: "font-serif text-xl py-6 border-b border-border",
  1: "text-base font-semibold pl-6 py-4",
  2: "text-sm font-medium text-foreground-secondary pl-12 py-3",
  3: "text-sm text-foreground-tertiary pl-16 py-2.5",
};

const ARTICLE_STYLE = "text-sm text-foreground-secondary pl-20 py-2";

function TreeNode({
  node,
  depth,
  expandedNodes,
  onToggle,
  onArticleClick,
  maxArticles,
  index,
}: {
  node: HierarchyNode;
  depth: number;
  expandedNodes: Set<string>;
  onToggle: (key: string) => void;
  onArticleClick: (id: string) => void;
  maxArticles: number;
  index: number;
}) {
  const isExpanded = expandedNodes.has(node.key);
  const hasChildren = node.children.length > 0;
  const hasArticles = node.articles.length > 0;
  const isExpandable = hasChildren || hasArticles;
  const totalArticles = countNodeArticles(node);

  const depthStyle = DEPTH_STYLES[depth] || DEPTH_STYLES[3];

  return (
    <div>
      <motion.button
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: depth === 0 ? index * 0.05 : 0 }}
        onClick={() => isExpandable && onToggle(node.key)}
        className={`w-full text-left flex items-center gap-3 hover:bg-surface-hover transition-colors rounded-lg -mx-2 px-2 ${depthStyle}`}
      >
        {/* Chevron */}
        {isExpandable ? (
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0"
          >
            <ChevronRight className="w-4 h-4 text-foreground-tertiary" />
          </motion.div>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Label */}
        <span className="flex-1 min-w-0 truncate">{node.label}</span>

        {/* Count + density bar (inline) */}
        {totalArticles > 0 && (
          <span className="flex items-center gap-3 ml-auto shrink-0">
            <span className="w-16">
              <DensityBar value={totalArticles} max={maxArticles} delay={0.2} />
            </span>
            <span className="text-xs text-foreground-tertiary tabular-nums w-12 text-right">
              {totalArticles}
            </span>
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {node.children.map((child, i) => (
              <TreeNode
                key={child.key}
                node={child}
                depth={Math.min(depth + 1, 3)}
                expandedNodes={expandedNodes}
                onToggle={onToggle}
                onArticleClick={onArticleClick}
                maxArticles={maxArticles}
                index={i}
              />
            ))}

            {node.articles.map((art) => (
              <button
                key={art.id}
                onClick={() => onArticleClick(art.id)}
                className={`w-full text-left flex items-center gap-2 hover:bg-surface-hover transition-colors rounded-lg -mx-2 px-2 ${ARTICLE_STYLE}`}
              >
                <span className="w-4 shrink-0" />
                <span>
                  Art. {art.article_number}
                  {art.article_title && (
                    <span className="text-foreground-tertiary ml-1.5">
                      &mdash; {art.article_title}
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
