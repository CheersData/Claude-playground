"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, ChevronDown, ChevronRight, RefreshCw, ExternalLink, BookOpen } from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

interface ReportItem {
  id: string;
  label: string;
  path: string;
  date?: string;
}

interface ReportGroup {
  id: string;
  label: string;
  emoji: string;
  items: ReportItem[];
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

function renderMarkdown(md: string): string {
  let html = md
    // Escape HTML special chars first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="bg-[#111] border border-white/10 rounded-lg p-4 my-3 overflow-x-auto text-sm text-green-400 font-mono"><code>${code}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code class="bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono text-orange-300">$1</code>');

  // HR
  html = html.replace(/^---+$/gm, '<hr class="border-white/10 my-6">');

  // H1
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-white mt-8 mb-4 pb-2 border-b border-white/10">$1</h1>');
  // H2
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold text-white mt-6 mb-3">$1</h2>');
  // H3
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-medium text-orange-400 mt-5 mb-2">$1</h3>');
  // H4
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-base font-medium text-white/80 mt-4 mb-2">$1</h4>');

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-2 border-orange-500/50 pl-4 py-1 my-2 text-white/60 italic">$1</blockquote>');

  // Tables — basic
  html = html.replace(
    /(\|.+\|\n)(\|[-| :]+\|\n)((?:\|.+\|\n?)*)/g,
    (_, header, _sep, body) => {
      const headerCells = header.trim().split("|").filter(Boolean).map((c: string) =>
        `<th class="px-3 py-2 text-left text-white/70 font-medium text-sm border-b border-white/10">${c.trim()}</th>`
      ).join("");
      const rows = body.trim().split("\n").filter(Boolean).map((row: string) => {
        const cells = row.split("|").filter(Boolean).map((c: string) =>
          `<td class="px-3 py-2 text-sm text-white/80">${c.trim()}</td>`
        ).join("");
        return `<tr class="border-b border-white/5 hover:bg-white/5">${cells}</tr>`;
      }).join("");
      return `<div class="overflow-x-auto my-4"><table class="w-full"><thead><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
  );

  // Bold + italic
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong class="font-bold"><em>$1</em></strong>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
  // Italic
  html = html.replace(/\*([^*\n]+)\*/g, '<em class="italic text-white/80">$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-orange-400 hover:text-orange-300 underline underline-offset-2">$1</a>');

  // Unordered lists
  html = html.replace(/((?:^[ \t]*[-*+] .+\n?)+)/gm, (match) => {
    const items = match.trim().split("\n").map((line: string) =>
      `<li class="ml-4 text-white/80">${line.replace(/^[ \t]*[-*+] /, "")}</li>`
    ).join("\n");
    return `<ul class="list-disc list-inside my-2 space-y-1">${items}</ul>`;
  });

  // Ordered lists
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (match) => {
    const items = match.trim().split("\n").map((line: string) =>
      `<li class="ml-4 text-white/80">${line.replace(/^\d+\. /, "")}</li>`
    ).join("\n");
    return `<ol class="list-decimal list-inside my-2 space-y-1">${items}</ol>`;
  });

  // Task list items (- [ ] / - [x])
  html = html.replace(/- \[x\] (.+)/g, '<li class="flex items-center gap-2 text-white/60 line-through"><span class="text-green-400">✓</span>$1</li>');
  html = html.replace(/- \[ \] (.+)/g, '<li class="flex items-center gap-2 text-white/50"><span class="text-white/30">○</span>$1</li>');

  // Paragraphs — wrap consecutive non-empty, non-tag lines
  const lines = html.split("\n");
  const result: string[] = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isBlock = trimmed.startsWith("<h") || trimmed.startsWith("<ul") ||
      trimmed.startsWith("<ol") || trimmed.startsWith("<pre") ||
      trimmed.startsWith("<hr") || trimmed.startsWith("<blockquote") ||
      trimmed.startsWith("<div") || trimmed.startsWith("<table") ||
      trimmed.startsWith("</");

    if (isBlock) {
      if (inParagraph) { result.push("</p>"); inParagraph = false; }
      result.push(trimmed);
    } else if (trimmed === "") {
      if (inParagraph) { result.push("</p>"); inParagraph = false; }
      result.push("");
    } else {
      if (!inParagraph) { result.push('<p class="text-white/70 my-2 leading-relaxed">'); inParagraph = true; }
      result.push(trimmed);
    }
  }
  if (inParagraph) result.push("</p>");

  return result.join("\n");
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <article
      className="prose-custom max-w-none"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function SidebarGroup({
  group,
  selectedPath,
  onSelect,
}: {
  group: ReportGroup;
  selectedPath: string | null;
  onSelect: (item: ReportItem) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
      >
        <span>{group.emoji}</span>
        <span className="flex-1 text-left">{group.label}</span>
        <span className="text-white/30 text-xs">{group.items.length}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {open && (
        <div className="ml-2 mt-1 space-y-0.5">
          {group.items.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors truncate ${
                selectedPath === item.path
                  ? "bg-orange-500/20 text-orange-300"
                  : "text-white/50 hover:text-white/80 hover:bg-white/5"
              }`}
              title={item.label}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [groups, setGroups] = useState<ReportGroup[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ReportItem | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/company/reports", {
        headers: getConsoleAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups ?? []);
        // Auto-select first item
        const first = data.groups?.[0]?.items?.[0];
        if (first && !selectedItem) {
          setSelectedItem(first);
        }
      } else {
        setError("Errore nel caricamento dei report.");
      }
    } catch {
      setError("Impossibile connettersi all'API.");
    } finally {
      setLoadingList(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    if (!selectedItem) return;
    setContent(null);
    setLoadingContent(true);
    fetch(`/api/company/files?path=${encodeURIComponent(selectedItem.path)}`, {
      headers: getConsoleAuthHeaders(),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.content) setContent(data.content);
        else setContent("*Contenuto non disponibile.*");
      })
      .catch(() => setContent("*Errore nel caricamento del file.*"))
      .finally(() => setLoadingContent(false));
  }, [selectedItem]);

  const totalReports = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen size={18} className="text-orange-400" />
            <h1 className="text-sm font-semibold text-white">Reports</h1>
          </div>
          <p className="text-xs text-white/40">{totalReports} documenti</p>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {loadingList ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={16} className="animate-spin text-white/30" />
            </div>
          ) : error ? (
            <p className="text-xs text-red-400 px-3">{error}</p>
          ) : (
            groups.map((group) => (
              <SidebarGroup
                key={group.id}
                group={group}
                selectedPath={selectedItem?.path ?? null}
                onSelect={setSelectedItem}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10">
          <a
            href="/ops"
            className="flex items-center gap-2 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            <ExternalLink size={12} />
            Operations Center
          </a>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {!selectedItem ? (
          <div className="flex flex-col items-center justify-center h-full text-white/30">
            <FileText size={48} className="mb-4" />
            <p className="text-sm">Seleziona un report dalla sidebar</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-8 py-8">
            {/* Report header */}
            <div className="mb-6 pb-4 border-b border-white/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-orange-400/80 font-mono mb-1">
                    {selectedItem.path}
                  </p>
                  <h2 className="text-xl font-semibold text-white">
                    {selectedItem.label}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setContent(null);
                    setLoadingContent(true);
                    fetch(`/api/company/files?path=${encodeURIComponent(selectedItem.path)}`, {
                      headers: getConsoleAuthHeaders(),
                    })
                      .then((r) => r.json())
                      .then((data) => setContent(data.content ?? ""))
                      .catch(() => setContent("*Errore*"))
                      .finally(() => setLoadingContent(false));
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/50 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-colors"
                >
                  <RefreshCw size={12} />
                  Ricarica
                </button>
              </div>
            </div>

            {/* Content */}
            {loadingContent ? (
              <div className="flex items-center gap-3 py-12 text-white/40">
                <RefreshCw size={18} className="animate-spin" />
                <span className="text-sm">Caricamento...</span>
              </div>
            ) : content ? (
              <MarkdownContent content={content} />
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
