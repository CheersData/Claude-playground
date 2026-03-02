"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  FileText,
  ChevronRight,
  Calendar,
  Building2,
  Users,
  Clipboard,
  Rocket,
  RefreshCw,
} from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportItem {
  id: string;
  label: string;
  path: string;
  date?: string;
}

interface ReportGroup {
  id: string;
  label: string;
  emoji?: string; // legacy — UI usa GROUP_ICONS, non renderizzato
  items: ReportItem[];
}

interface ReportsPanelProps {
  onBack: () => void;
}

// ─── Inline Markdown Renderer ─────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={i} className="text-zinc-200 font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code key={i} className="bg-zinc-800 px-1 rounded text-[#FF6B35] font-mono text-xs">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // H1
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={key++} className="text-xl font-bold text-white mt-6 mb-3 first:mt-0">
          {line.slice(2)}
        </h1>
      );
      i++;
      continue;
    }

    // H2
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={key++} className="text-base font-semibold text-zinc-200 mt-5 mb-2 border-b border-zinc-700/50 pb-1">
          {line.slice(3)}
        </h2>
      );
      i++;
      continue;
    }

    // H3
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="text-sm font-medium text-zinc-300 mt-4 mb-1">
          {line.slice(4)}
        </h3>
      );
      i++;
      continue;
    }

    // HR
    if (line.trim() === "---") {
      elements.push(<hr key={key++} className="border-zinc-700 my-4" />);
      i++;
      continue;
    }

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={key++} className="bg-zinc-900 border border-zinc-700 rounded p-3 my-3 text-xs text-zinc-300 overflow-x-auto font-mono leading-relaxed">
          {codeLines.join("\n")}
        </pre>
      );
      continue;
    }

    // Table
    if (line.startsWith("|")) {
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        // Skip separator rows (|---|---|)
        if (!lines[i].match(/^\|[\s\-:]+\|/)) {
          tableRows.push(lines[i]);
        }
        i++;
      }
      if (tableRows.length > 0) {
        const parseRow = (r: string) =>
          r
            .split("|")
            .map((c) => c.trim())
            .filter((c) => c.length > 0);

        const header = parseRow(tableRows[0]);
        const rows = tableRows.slice(1).map(parseRow);

        elements.push(
          <div key={key++} className="overflow-x-auto my-3 rounded border border-zinc-700/50">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-800/60">
                  {header.map((h, j) => (
                    <th key={j} className="text-left py-2 px-3 text-zinc-300 font-medium whitespace-nowrap">
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, j) => (
                  <tr key={j} className="border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors">
                    {row.map((cell, k) => (
                      <td key={k} className="py-2 px-3 text-zinc-400 align-top">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={key++} className="border-l-2 border-[#FF6B35]/50 pl-3 my-2 text-zinc-400 italic text-sm">
          {renderInline(line.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    // Unordered list
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const listItems: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        listItems.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="space-y-1 my-2 text-zinc-400 text-sm">
          {listItems.map((item, j) => (
            <li key={j} className="flex gap-2">
              <span className="text-zinc-600 mt-0.5 shrink-0">•</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\. /.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        listItems.push(lines[i].replace(/^\d+\. /, ""));
        i++;
      }
      elements.push(
        <ol key={key++} className="space-y-1 my-2 text-zinc-400 text-sm">
          {listItems.map((item, j) => (
            <li key={j} className="flex gap-2">
              <span className="text-zinc-500 shrink-0 font-mono text-xs mt-0.5">{j + 1}.</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph (collect consecutive lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("|") &&
      !lines[i].startsWith("- ") &&
      !lines[i].startsWith("* ") &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("> ") &&
      lines[i].trim() !== "---" &&
      !/^\d+\. /.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      elements.push(
        <p key={key++} className="text-zinc-400 text-sm my-2 leading-relaxed">
          {renderInline(paraLines.join(" "))}
        </p>
      );
    }
  }

  return <div className="space-y-0.5">{elements}</div>;
}

// ─── Group Icons ──────────────────────────────────────────────────────────────

const GROUP_ICONS: Record<string, React.ReactNode> = {
  "daily-plans":      <Calendar className="w-3.5 h-3.5" />,
  "state-of-company": <Building2 className="w-3.5 h-3.5" />,
  "dept-reports":     <FileText className="w-3.5 h-3.5" />,
  meetings:           <Users className="w-3.5 h-3.5" />,
  memos:              <Clipboard className="w-3.5 h-3.5" />,
  sprints:            <Rocket className="w-3.5 h-3.5" />,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ReportsPanel({ onBack }: ReportsPanelProps) {
  const [groups, setGroups] = useState<ReportGroup[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ReportItem | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["dept-reports", "daily-plans"]));

  // Fetch report list
  const fetchGroups = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/company/reports", {
        headers: getConsoleAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setGroups(json.groups ?? []);
        // Auto-select first dept-report if available
        const deptGroup = (json.groups as ReportGroup[])?.find((g) => g.id === "dept-reports");
        if (deptGroup?.items.length) {
          // Find master report
          const master = deptGroup.items.find((i) => i.label.includes("Master"));
          selectItem(master ?? deptGroup.items[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch reports:", err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const selectItem = async (item: ReportItem) => {
    setSelectedItem(item);
    setContent(null);
    setLoadingContent(true);
    try {
      const res = await fetch(`/api/company/files?path=${encodeURIComponent(item.path)}`, {
        headers: getConsoleAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setContent(json.content ?? "");
      } else {
        setContent("Errore nel caricamento del report.");
      }
    } catch {
      setContent("Errore di rete.");
    } finally {
      setLoadingContent(false);
    }
  };

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      className="bg-zinc-900 border border-zinc-700/50 rounded-xl overflow-hidden"
      style={{ minHeight: "600px" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-700/50 bg-zinc-800/40">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Ops</span>
        </button>
        <span className="text-zinc-600">/</span>
        <span className="text-zinc-200 text-sm font-medium flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#FF6B35]" />
          Reports
        </span>
        <div className="ml-auto">
          <button
            onClick={fetchGroups}
            disabled={loadingList}
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="flex" style={{ height: "calc(600px - 49px)" }}>
        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r border-zinc-700/50 overflow-y-auto">
          {loadingList ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            </div>
          ) : (
            <nav className="py-2">
              {groups.map((group) => (
                <div key={group.id} className="mb-1">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <span className="text-zinc-600">
                      {GROUP_ICONS[group.id] ?? <FileText className="w-3.5 h-3.5" />}
                    </span>
                    <span className="uppercase tracking-wide">{group.label}</span>
                    <ChevronRight
                      className={`w-3 h-3 ml-auto transition-transform ${openGroups.has(group.id) ? "rotate-90" : ""}`}
                    />
                  </button>

                  {/* Items */}
                  <AnimatePresence initial={false}>
                    {openGroups.has(group.id) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => selectItem(item)}
                            className={`w-full text-left px-4 py-1.5 text-xs transition-colors truncate ${
                              selectedItem?.id === item.id
                                ? "text-[#FF6B35] bg-[#FF6B35]/10"
                                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </nav>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!selectedItem && !loadingList && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <FileText className="w-10 h-10 text-zinc-700 mb-3" />
              <p className="text-zinc-500 text-sm">Seleziona un report dalla sidebar</p>
            </div>
          )}

          {loadingContent && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
          )}

          {content !== null && !loadingContent && (
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedItem?.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
              >
                <MarkdownContent content={content} />
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </motion.div>
  );
}
