"use client";

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

interface ConsoleInputProps {
  onSubmit: (message: string, file: File | null) => void;
  disabled: boolean;
}

export default function ConsoleInput({ onSubmit, disabled }: ConsoleInputProps) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (disabled) return;
    if (!message.trim() && !file) return;
    onSubmit(message, file);
    setMessage("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  };

  return (
    <div className="pipboy-glow rounded-md bg-[var(--pb-bg-panel)] p-3">
      {/* File indicator */}
      {file && (
        <div className="flex items-center gap-2 mb-2 text-xs text-[var(--pb-amber)]">
          <span>[FILE]</span>
          <span className="truncate max-w-[300px]">{file.name}</span>
          <button
            onClick={() => {
              setFile(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="text-[var(--pb-red)] hover:underline ml-1"
          >
            [X]
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-start gap-2">
        <span className="text-[var(--pb-green)] mt-1 select-none">&gt;</span>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            disabled
              ? "Elaborazione in corso..."
              : "Scrivi una domanda o incolla un testo..."
          }
          rows={3}
          className="flex-1 bg-transparent text-[var(--pb-text)] placeholder:text-[var(--pb-text-dim)] resize-none outline-none text-sm leading-relaxed"
        />
        {!disabled && (
          <span className="text-[var(--pb-green)] mt-1 pipboy-cursor">_</span>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--pb-border)]">
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            onChange={handleFileChange}
            accept=".pdf,.docx,.doc,.txt"
            className="hidden"
            id="console-file"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            className="text-xs text-[var(--pb-text-dim)] hover:text-[var(--pb-green)] transition-colors disabled:opacity-40"
          >
            [ALLEGA FILE]
          </button>
          <span className="text-xs text-[var(--pb-text-dim)] opacity-50">
            PDF, DOCX, TXT
          </span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={disabled || (!message.trim() && !file)}
          className="text-xs font-bold tracking-wider px-4 py-1.5 border border-[var(--pb-green)] text-[var(--pb-green)] hover:bg-[var(--pb-green)] hover:text-[var(--pb-bg)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          [ESEGUI]
        </button>
      </div>

      <div className="text-[10px] text-[var(--pb-text-dim)] opacity-40 mt-1 text-right">
        Ctrl+Enter per inviare
      </div>
    </div>
  );
}
