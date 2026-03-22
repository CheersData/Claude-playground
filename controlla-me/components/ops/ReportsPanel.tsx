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
            <strong key={i} className="text-[var(--fg-primary)] font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code key={i} className="bg-[var(--bg-overlay)] px-1 rounded text-[#FF6B35] font-mono text-xs">
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
        <h2 key={key++} className="text-base font-semibold text-[var(--fg-primary)] mt-5 mb-2 border-b border-[var(--border-dark-subtle)] pb-1">
          {line.slice(3)}
        </h2>
      );
      i++;
      continue;
    }

    // H3
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="text-sm font-medium text-[var(--fg-secondary)] mt-4 mb-1">
          {line.slice(4)}
        </h3>
      );
      i++;
      continue;
    }

    // HR
    if (line.trim() === "---") {
      elements.push(<hr key={key++} className="border-[var(--border-dark)] my-4" />);
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
        <pre key={key++} className="bg-[var(--bg-raised)] border border-[var(--border-dark)] rounded p-3 my-3 text-xs text-[var(--fg-secondary)] overflow-x-auto font-mono leading-relaxed">
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
          <div key={key++} className="overflow-x-auto my-3 rounded border border-[var(--border-dark-subtle)]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-dark)] bg-[var(--bg-overlay)]/60">
                  {header.map((h, j) => (
                    <th key={j} className="text-left py-2 px-3 text-[var(--fg-secondary)] font-medium whitespace-nowrap">
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, j) => (
                  <tr key={j} className="border-b border-[var(--border-dark-subtle)] hover:bg-[var(--bg-overlay)]/30 transition-colors">
                    {row.map((cell, k) => (
                      <td key={k} className="py-2 px-3 text-[var(--fg-secondary)] align-top">
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
        <blockquote key={key++} className="border-l-2 border-[#FF6B35]/50 pl-3 my-2 text-[var(--fg-secondary)] italic text-sm">
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
        <ul key={key++} className="space-y-1 my-2 text-[var(--fg-secondary)] text-sm">
          {listItems.map((item, j) => (
            <li key={j} className="flex gap-2">
              <span className="text-[var(--fg-invisible)] mt-0.5 shrink-0">•</span>
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
        <ol key={key++} className="space-y-1 my-2 text-[var(--fg-secondary)] text-sm">
          {listItems.map((item, j) => (
            <li key={j} className="flex gap-2">
              <span className="text-[var(--fg-invisible)] shrink-0 font-mono text-xs mt-0.5">{j + 1}.</span>
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
        <p key={key++} className="text-[var(--fg-secondary)] text-sm my-2 leading-relaxed">
          {renderInline(paraLines.join(" "))}
        </p>
      );
    }
  }

  return <div className="space-y-0.5">{elements}</div>;
}

// ─── Group Icons ──────────────────────────────────────────────────────────────

const GROUP_ICONS: Record<string, React.ReactNode> = {
  "daily-plans":      <Calendar className="w-4 h-4" />,
  "state-of-company": <Building2 className="w-4 h-4" />,
  "dept-reports":     <FileText className="w-4 h-4" />,
  meetings:           <Users className="w-4 h-4" />,
  memos:              <Clipboard className="w-4 h-4" />,
  sprints:            <Rocket className="w-4 h-4" />,
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
      className="bg-[var(--bg-raised)] border border-[var(--border-dark-subtle)] rounded-xl overflow-hidden flex-1 flex flex-col min-h-0"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-dark-subtle)] bg-[var(--bg-overlay)]/40">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[var(--fg-secondary)] hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Ops</span>
        </button>
        <span className="text-[var(--fg-invisible)]">/</span>
        <span className="text-[var(--fg-primary)] text-sm font-medium flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#FF6B35]" />
          Reports
        </span>
        <div className="ml-auto">
          <button
            onClick={fetchGroups}
            disabled={loadingList}
            className="p-2 rounded text-[var(--fg-invisible)] hover:text-[var(--fg-secondary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loadingList ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r border-[var(--border-dark-subtle)] overflow-y-auto">
          {loadingList ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 text-[var(--fg-invisible)] animate-spin" />
            </div>
          ) : (
            <nav className="py-2">
              {groups.map((group) => (
                <div key={group.id} className="mb-1">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--fg-invisible)] hover:text-[var(--fg-secondary)] transition-colors"
                  >
                    <span className="text-[var(--fg-invisible)]">
                      {GROUP_ICONS[group.id] ?? <FileText className="w-4 h-4" />}
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
                            className={`w-full text-left px-4 py-2 text-xs transition-colors truncate ${
                              selectedItem?.id === item.id
                                ? "text-[#FF6B35] bg-[#FF6B35]/10"
                                : "text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-overlay)]/50"
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
              <FileText className="w-10 h-10 text-[var(--fg-invisible)] mb-3" />
              <p className="text-[var(--fg-invisible)] text-sm">Seleziona un report dalla sidebar</p>
            </div>
          )}

          {loadingContent && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 text-[var(--fg-invisible)] animate-spin" />
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
