"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Terminal } from "lucide-react";

// ─── Component ──────────────────────────────────────────────────────────────

export function CommandBar({
  onSubmit,
  disabled,
}: {
  onSubmit: (command: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  // ── Ctrl+K focus ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSubmit(value.trim());
    setValue("");
  };

  return (
    <form
      onSubmit={submit}
      className="flex-none h-12 flex items-center gap-3 px-6
        border-t border-[var(--border-dark-subtle)] bg-[var(--bg-raised)]"
    >
      <Terminal className="w-4 h-4 text-[var(--fg-invisible)] shrink-0" />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Scrivi un comando..."
        disabled={disabled}
        className="flex-1 bg-transparent text-sm text-[var(--fg-primary)]
          placeholder-[var(--fg-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-base)]"
        autoComplete="off"
      />
      <kbd
        className="hidden sm:inline text-xs text-[var(--fg-invisible)]
          border border-[var(--border-dark)] rounded px-2 py-0.5 font-mono"
      >
        Ctrl+K
      </kbd>
      <button
        type="submit"
        disabled={!value.trim() || disabled}
        aria-label="Invia comando"
        className="p-2 rounded-md hover:bg-[var(--bg-overlay)]
          transition-colors disabled:opacity-20"
      >
        <Send className="w-4 h-4 text-[var(--accent)]" />
      </button>
    </form>
  );
}
