"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ───

interface GraphArticle {
  reference: string;
  source: string;
  title?: string;
  /** "istituto" | percentage string like "85%" */
  similarity?: string;
}

interface ReasoningGraphProps {
  institutes: string[];
  articles: GraphArticle[];
  /** Articles cited in the final answer (highlighted) */
  citedRefs?: string[];
  /** Which phase we're in — controls what's visible */
  phase: "question-prep" | "corpus-search" | "corpus-agent" | "idle";
}

// ─── Layout constants ───

const SVG_W = 600;
const SVG_H_BASE = 120; // minimum height
const INST_Y = 40;
const ART_Y_START = 100;
const ART_ROW_H = 28;
const NODE_R = 6;

// ─── Helpers ───

/** Pretty-print institute name: "vendita_a_corpo" → "Vendita a corpo" */
function formatInstitute(inst: string): string {
  return inst.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Assign a stable color to each institute based on its name */
function instituteColor(inst: string, idx: number): string {
  const palette = [
    "#c9a84c", // gold
    "#4ECDC4", // teal
    "#A78BFA", // violet
    "#FF6B6B", // coral
    "#60A5FA", // blue
    "#34D399", // emerald
    "#F472B6", // pink
    "#FBBF24", // amber
  ];
  return palette[idx % palette.length];
}

/** Map each article to its connected institute indices */
function buildEdges(
  articles: GraphArticle[],
  institutes: string[]
): Map<number, number[]> {
  const edges = new Map<number, number[]>();

  for (let ai = 0; ai < articles.length; ai++) {
    const connected: number[] = [];
    const ref = articles[ai].reference.toLowerCase();
    const src = articles[ai].source.toLowerCase();

    for (let ii = 0; ii < institutes.length; ii++) {
      const inst = institutes[ii].toLowerCase();
      // Heuristic: connect if the article similarity came from institute lookup
      // or if the institute name appears in the source/reference context
      if (articles[ai].similarity === "istituto") {
        // Institute lookup articles — connect to all matching institutes
        connected.push(ii);
      } else {
        // Semantic match — connect to institutes that relate to the article's topic
        // Simple heuristic: check if institute keywords appear in reference or source
        const instWords = inst.split("_");
        const matchesRef = instWords.some(
          (w) => w.length > 3 && (ref.includes(w) || src.includes(w))
        );
        if (matchesRef) connected.push(ii);
      }
    }

    // If no specific match, connect to first institute (primary topic)
    if (connected.length === 0 && institutes.length > 0) {
      connected.push(0);
    }

    edges.set(ai, connected);
  }

  return edges;
}

// ─── Component ───

export default function ReasoningGraph({
  institutes,
  articles,
  citedRefs = [],
  phase,
}: ReasoningGraphProps) {
  const showInstitutes = phase !== "idle" && institutes.length > 0;
  const showArticles =
    (phase === "corpus-search" || phase === "corpus-agent") &&
    articles.length > 0;

  const citedSet = useMemo(
    () => new Set(citedRefs.map((r) => r.toLowerCase())),
    [citedRefs]
  );

  // Layout: distribute institutes evenly across width
  const instPositions = useMemo(() => {
    if (institutes.length === 0) return [];
    const padding = 80;
    const usable = SVG_W - padding * 2;
    const step =
      institutes.length > 1 ? usable / (institutes.length - 1) : 0;
    return institutes.map((_, i) => ({
      x: institutes.length === 1 ? SVG_W / 2 : padding + i * step,
      y: INST_Y,
    }));
  }, [institutes]);

  // Layout: articles in rows below
  const artPositions = useMemo(() => {
    if (articles.length === 0) return [];
    const padding = 60;
    const cols = Math.min(articles.length, 4);
    const usable = SVG_W - padding * 2;
    const colStep = cols > 1 ? usable / (cols - 1) : 0;

    return articles.map((_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        x: cols === 1 ? SVG_W / 2 : padding + col * colStep,
        y: ART_Y_START + row * ART_ROW_H,
      };
    });
  }, [articles]);

  const edges = useMemo(
    () => (showArticles ? buildEdges(articles, institutes) : new Map()),
    [articles, institutes, showArticles]
  );

  // Dynamic SVG height
  const artRows = articles.length > 0 ? Math.ceil(articles.length / 4) : 0;
  const svgH = showArticles
    ? ART_Y_START + artRows * ART_ROW_H + 20
    : SVG_H_BASE;

  if (!showInstitutes) return null;

  return (
    <div className="pipboy-panel rounded-md px-2 py-2 overflow-hidden">
      <div className="text-[10px] text-[var(--pb-text-dim)] mb-1 tracking-wider font-medium">
        RAGIONAMENTO
      </div>
      <svg
        viewBox={`0 0 ${SVG_W} ${svgH}`}
        className="w-full"
        style={{ maxHeight: `${Math.min(svgH, 300)}px` }}
      >
        {/* Edges: institute → article */}
        <AnimatePresence>
          {showArticles &&
            artPositions.map((artPos, ai) => {
              const connected: number[] = edges.get(ai) ?? [0];
              return connected.map((ii: number) => {
                const instPos = instPositions[ii];
                if (!instPos) return null;
                return (
                  <motion.line
                    key={`edge-${ii}-${ai}`}
                    x1={instPos.x}
                    y1={instPos.y}
                    x2={artPos.x}
                    y2={artPos.y}
                    stroke={instituteColor(institutes[ii], ii)}
                    strokeWidth={1}
                    strokeOpacity={0.25}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.5, delay: ai * 0.05 }}
                  />
                );
              });
            })}
        </AnimatePresence>

        {/* Institute nodes */}
        <AnimatePresence>
          {showInstitutes &&
            instPositions.map((pos, i) => {
              const color = instituteColor(institutes[i], i);
              return (
                <motion.g
                  key={`inst-${institutes[i]}`}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: i * 0.08 }}
                >
                  {/* Glow */}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={NODE_R + 4}
                    fill={color}
                    opacity={0.1}
                  />
                  {/* Node */}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={NODE_R}
                    fill={color}
                    opacity={0.9}
                  />
                  {/* Label */}
                  <text
                    x={pos.x}
                    y={pos.y - NODE_R - 6}
                    textAnchor="middle"
                    fill={color}
                    fontSize={9}
                    fontWeight={600}
                    opacity={0.9}
                  >
                    {formatInstitute(institutes[i])}
                  </text>
                </motion.g>
              );
            })}
        </AnimatePresence>

        {/* Article nodes */}
        <AnimatePresence>
          {showArticles &&
            artPositions.map((pos, i) => {
              const art = articles[i];
              const isCited = citedSet.has(art.reference.toLowerCase());
              const isInstituteLookup = art.similarity === "istituto";

              return (
                <motion.g
                  key={`art-${art.reference}-${art.source}`}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 + i * 0.05 }}
                >
                  {/* Pill background */}
                  <rect
                    x={pos.x - 45}
                    y={pos.y - 8}
                    width={90}
                    height={16}
                    rx={8}
                    fill={isCited ? "rgba(201, 168, 76, 0.2)" : "rgba(42, 42, 78, 0.8)"}
                    stroke={
                      isCited
                        ? "var(--pb-green)"
                        : isInstituteLookup
                          ? "var(--pb-amber-dim)"
                          : "var(--pb-border)"
                    }
                    strokeWidth={isCited ? 1.5 : 0.5}
                  />
                  {/* Reference text */}
                  <text
                    x={pos.x}
                    y={pos.y + 3}
                    textAnchor="middle"
                    fill={
                      isCited
                        ? "var(--pb-green)"
                        : "var(--pb-text-dim)"
                    }
                    fontSize={8}
                    fontWeight={isCited ? 700 : 400}
                  >
                    {art.reference}
                  </text>
                </motion.g>
              );
            })}
        </AnimatePresence>
      </svg>
    </div>
  );
}
