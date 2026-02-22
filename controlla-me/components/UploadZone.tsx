"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText } from "lucide-react";
import { motion } from "framer-motion";

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  isLoading?: boolean;
}

export default function UploadZone({
  onFileSelected,
  isLoading = false,
}: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className={`w-full max-w-[560px] rounded-3xl border-2 border-dashed transition-all cursor-pointer
        ${
          dragOver
            ? "border-accent/80 bg-accent/5 scale-[1.01]"
            : "border-accent/30 bg-white shadow-sm hover:border-accent/60 hover:bg-accent/[0.03]"
        }
        ${isLoading ? "pointer-events-none opacity-60" : ""}
      `}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-col items-center gap-4 px-10 py-14">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
          {dragOver ? (
            <FileText className="w-7 h-7 text-accent" />
          ) : (
            <Upload className="w-7 h-7 text-accent" />
          )}
        </div>

        <div className="text-center">
          <p className="text-base font-semibold mb-1">
            Trascina qui il tuo documento
          </p>
          <p className="text-sm text-gray-500">
            PDF, immagine, Word o testo — max 20MB
          </p>
        </div>

        <button
          className="mt-2 px-10 py-4 rounded-full text-base font-bold text-white bg-gradient-to-br from-accent to-[#E8451A] hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(255,107,53,0.35)] transition-all"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          Scegli file
        </button>
      </div>
    </motion.div>
  );
}
