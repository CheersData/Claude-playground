"use client";

import { useState, useRef, useCallback } from "react";
import { Send, Paperclip, X, FileText, Loader2 } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string, file?: File) => void;
  disabled?: boolean;
  placeholder?: string;
  initialText?: string;
}

const ACCEPTED = ".pdf,.doc,.docx,.txt";
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Scrivi un messaggio o trascina un documento...",
  initialText = "",
}: ChatInputProps) {
  const [text, setText] = useState(initialText);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && !file) return;
    onSend(trimmed, file || undefined);
    setText("");
    setFile(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [text, file, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!disabled) handleSubmit();
      }
    },
    [disabled, handleSubmit]
  );

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > MAX_SIZE) {
        alert("File troppo grande (max 20MB)");
        return;
      }
      setFile(f);
    }
    e.target.value = "";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      if (f.size > MAX_SIZE) {
        alert("File troppo grande (max 20MB)");
        return;
      }
      setFile(f);
    }
  }, []);

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, []);

  const canSend = (text.trim().length > 0 || file !== null) && !disabled;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4">
      <div
        className={`relative rounded-2xl border transition-all ${
          dragOver
            ? "border-[#FF6B35] bg-[#FF6B35]/5"
            : "border-[#E5E5E5] bg-white hover:border-[#D0D0D0]"
        } ${disabled ? "opacity-60" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* File preview */}
        {file && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 text-sm">
              <FileText className="w-4 h-4 text-[#FF6B35]" />
              <span className="text-[#1A1A2E] truncate max-w-[200px]">{file.name}</span>
              <button
                onClick={() => setFile(null)}
                className="text-[#9B9B9B] hover:text-[#1A1A2E] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoResize();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="w-full resize-none bg-transparent px-4 py-3 text-[15px] text-[#1A1A2E] placeholder:text-[#9B9B9B] focus:outline-none disabled:cursor-not-allowed"
          style={{ minHeight: "44px", maxHeight: "200px" }}
        />

        {/* Action bar */}
        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="p-2 rounded-lg text-[#9B9B9B] hover:text-[#1A1A2E] hover:bg-gray-50 transition-all disabled:opacity-30"
              title="Allega documento (PDF, DOCX, TXT)"
            >
              <Paperclip className="w-4.5 h-4.5" />
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSend}
            className={`p-2 rounded-lg transition-all ${
              canSend
                ? "bg-[#1A1A2E] text-white hover:bg-[#2A2A3E]"
                : "bg-gray-100 text-[#9B9B9B] cursor-not-allowed"
            }`}
            title="Invia (Enter)"
          >
            {disabled ? (
              <Loader2 className="w-4.5 h-4.5 animate-spin" />
            ) : (
              <Send className="w-4.5 h-4.5" />
            )}
          </button>
        </div>
      </div>

      <p className="text-center text-[10px] text-[#9B9B9B] mt-2">
        PDF, DOCX, TXT fino a 20MB &middot; Enter per inviare, Shift+Enter per andare a capo
      </p>
    </div>
  );
}
