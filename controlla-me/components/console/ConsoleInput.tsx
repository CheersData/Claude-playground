"use client";

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

interface ConsoleInputProps {
  onSubmit: (message: string, file: File | null) => void;
  disabled: boolean;
  placeholder?: string;
}

export default function ConsoleInput({ onSubmit, disabled, placeholder }: ConsoleInputProps) {
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
    <div className="rounded-2xl border border-[#E5E5E5] bg-white p-5">
      {/* File indicator */}
      {file && (
        <div className="flex items-center gap-2 mb-3 text-xs text-[#6B6B6B]">
          <span className="font-medium">Documento:</span>
          <span className="truncate max-w-[300px] text-[#1A1A1A]">{file.name}</span>
          <button
            onClick={() => {
              setFile(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="text-red-400 hover:text-red-500 ml-1 text-[10px]"
          >
            Rimuovi
          </button>
        </div>
      )}

      {/* Input area */}
      <textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={
          disabled
            ? "Elaborazione in corso..."
            : placeholder ?? "Scrivi una domanda o incolla un testo..."
        }
        rows={3}
        className="w-full bg-transparent text-[#1A1A1A] placeholder:text-[#9B9B9B] resize-none outline-none text-sm leading-relaxed"
      />

      {/* Action bar */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F0F0F0]">
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
            className="text-xs text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors disabled:opacity-40"
          >
            Allega documento
          </button>
          <span className="text-[10px] text-[#9B9B9B] opacity-40">
            PDF, DOCX, TXT
          </span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={disabled || (!message.trim() && !file)}
          className="text-xs font-medium px-5 py-2 rounded-lg bg-[#1A1A1A] text-white hover:bg-[#333] transition-all disabled:opacity-20 disabled:cursor-not-allowed"
        >
          Invia
        </button>
      </div>

      <div className="text-[10px] text-[#9B9B9B] opacity-30 mt-1 text-right">
        Ctrl+Enter per inviare
      </div>
    </div>
  );
}
