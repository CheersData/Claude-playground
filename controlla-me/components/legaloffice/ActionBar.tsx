"use client";

import { MessageSquare, Upload, FileOutput } from "lucide-react";

interface ActionBarProps {
  onQA: () => void;
  onUpload: () => void;
  onProduce: () => void;
  disabled?: boolean;
}

export default function ActionBar({ onQA, onUpload, onProduce, disabled }: ActionBarProps) {
  const btnClass = `flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 text-xs font-medium text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-sans`;

  return (
    <div className="flex-none flex items-center gap-2 px-4 h-10 border-b border-gray-100 bg-white">
      <button onClick={onQA} disabled={disabled} className={btnClass}>
        <MessageSquare className="w-3.5 h-3.5" />
        QA
      </button>
      <button onClick={onUpload} disabled={disabled} className={btnClass}>
        <Upload className="w-3.5 h-3.5" />
        Carica documento
      </button>
      <button onClick={onProduce} disabled={disabled} className={btnClass}>
        <FileOutput className="w-3.5 h-3.5" />
        Produci documento
      </button>
    </div>
  );
}
