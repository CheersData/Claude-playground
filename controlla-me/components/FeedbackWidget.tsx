"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Send, CheckCircle, LogIn, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { FeedbackCategory } from "@/lib/types";

// ─── Category config ─────────────────────────────────────────────────────────

const CATEGORIES: Array<{ key: FeedbackCategory; label: string }> = [
  { key: "helpful", label: "Utile" },
  { key: "too_harsh", label: "Troppo severo" },
  { key: "too_lenient", label: "Troppo indulgente" },
  { key: "missing_risks", label: "Rischi mancanti" },
  { key: "inaccurate", label: "Impreciso" },
];

const MAX_TEXT_LENGTH = 500;

// ─── Component ───────────────────────────────────────────────────────────────

interface FeedbackWidgetProps {
  analysisId: string;
  userId: string | null;
}

export default function FeedbackWidget({ analysisId, userId }: FeedbackWidgetProps) {
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load existing feedback on mount
  const loadExisting = useCallback(async () => {
    if (!userId || !analysisId) {
      setIsLoading(false);
      return;
    }
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from("analysis_feedback")
        .select("id, rating, category, feedback_text")
        .eq("analysis_id", analysisId)
        .eq("user_id", userId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (data) {
        setRating(data.rating);
        setCategory(data.category as FeedbackCategory | null);
        setFeedbackText(data.feedback_text || "");
        setExistingId(data.id);
        setIsSubmitted(true);
      }
    } catch {
      // Silently fail — widget is non-critical
    } finally {
      setIsLoading(false);
    }
  }, [analysisId, userId]);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  const handleSubmit = async () => {
    if (!userId || rating === 0) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const payload = {
        analysis_id: analysisId,
        user_id: userId,
        rating,
        category,
        feedback_text: feedbackText.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (existingId) {
        // Update existing
        const { error: updateError } = await supabase
          .from("analysis_feedback")
          .update(payload)
          .eq("id", existingId);
        if (updateError) throw updateError;
      } else {
        // Insert new
        const { data, error: insertError } = await supabase
          .from("analysis_feedback")
          .insert(payload)
          .select("id")
          .single();
        if (insertError) throw insertError;
        if (data) setExistingId(data.id);
      }

      setIsSubmitted(true);
    } catch {
      setError("Errore nel salvataggio. Riprova.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = () => {
    setIsSubmitted(false);
  };

  // ─── Login prompt ────────────────────────────────────────────────────────

  if (!userId) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.75 }}
        className="rounded-[var(--radius-xl)] p-6 mb-5"
        style={{
          background: "var(--card-bg)",
          boxShadow: "var(--card-shadow)",
          border: "1px solid var(--card-border)",
        }}
      >
        <div className="flex items-center gap-3 text-[var(--foreground-tertiary)]">
          <LogIn className="w-4 h-4" />
          <p className="text-sm">
            <a href="/auth" className="underline hover:text-[var(--accent)] transition-colors">
              Accedi
            </a>{" "}
            per lasciare un feedback su questa analisi.
          </p>
        </div>
      </motion.div>
    );
  }

  // ─── Loading ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.75 }}
        className="rounded-[var(--radius-xl)] p-6 mb-5"
        style={{
          background: "var(--card-bg)",
          boxShadow: "var(--card-shadow)",
          border: "1px solid var(--card-border)",
        }}
      >
        <div className="h-20 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-[var(--foreground-tertiary)] border-t-transparent rounded-full animate-spin" />
        </div>
      </motion.div>
    );
  }

  // ─── Success state ───────────────────────────────────────────────────────

  if (isSubmitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.75 }}
        className="rounded-[var(--radius-xl)] p-6 mb-5"
        style={{
          background: "var(--card-bg)",
          boxShadow: "var(--card-shadow)",
          border: "1px solid var(--card-border)",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5" style={{ color: "var(--score-good)" }} />
            <div>
              <p className="text-sm font-semibold text-[var(--foreground-secondary)]">
                Grazie per il feedback!
              </p>
              <div className="flex items-center gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className="w-4 h-4"
                    fill={star <= rating ? "#FFC832" : "transparent"}
                    stroke={star <= rating ? "#FFC832" : "var(--foreground-tertiary)"}
                    strokeWidth={1.5}
                  />
                ))}
                {category && (
                  <span className="text-xs text-[var(--foreground-tertiary)] ml-2">
                    {CATEGORIES.find((c) => c.key === category)?.label}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleEdit}
            className="text-xs text-[var(--foreground-tertiary)] hover:text-[var(--accent)] transition-colors underline"
          >
            Modifica
          </button>
        </motion.div>
      </motion.div>
    );
  }

  // ─── Form ────────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.75 }}
      className="rounded-[var(--radius-xl)] p-6 mb-5"
      style={{
        background: "var(--card-bg)",
        boxShadow: "var(--card-shadow)",
        border: "1px solid var(--card-border)",
      }}
    >
      <h3 className="text-[var(--text-2xs)] font-bold tracking-[var(--tracking-caps)] uppercase text-[var(--foreground-tertiary)] mb-4">
        Com&apos;e andata l&apos;analisi?
      </h3>

      {/* Star rating */}
      <div className="flex items-center gap-1 mb-5">
        {[1, 2, 3, 4, 5].map((star) => {
          const isActive = star <= (hoveredStar || rating);
          return (
            <motion.button
              key={star}
              type="button"
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredStar(star)}
              onMouseLeave={() => setHoveredStar(0)}
              className="p-1.5 rounded-[var(--radius-md)] transition-colors hover:bg-white/5 cursor-pointer"
              aria-label={`${star} ${star === 1 ? "stella" : "stelle"}`}
            >
              <Star
                className="w-7 h-7 transition-all duration-150"
                fill={isActive ? "#FFC832" : "transparent"}
                stroke={isActive ? "#FFC832" : "var(--foreground-tertiary)"}
                strokeWidth={1.5}
              />
            </motion.button>
          );
        })}
        <AnimatePresence>
          {rating > 0 && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="text-sm text-[var(--foreground-tertiary)] ml-2"
            >
              {rating}/5
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Category pills */}
      <AnimatePresence>
        {rating > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <p className="text-xs text-[var(--foreground-tertiary)] mb-2.5">
              Come descriveresti il risultato? <span className="opacity-50">(opzionale)</span>
            </p>
            <div className="flex flex-wrap gap-2 mb-5">
              {CATEGORIES.map(({ key, label }) => {
                const isSelected = category === key;
                return (
                  <motion.button
                    key={key}
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setCategory(isSelected ? null : key)}
                    className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer"
                    style={{
                      background: isSelected
                        ? "var(--accent-surface)"
                        : "color-mix(in srgb, var(--foreground) 6%, transparent)",
                      border: `1px solid ${
                        isSelected
                          ? "color-mix(in srgb, var(--accent) 40%, transparent)"
                          : "color-mix(in srgb, var(--foreground) 10%, transparent)"
                      }`,
                      color: isSelected ? "var(--accent)" : "var(--foreground-secondary)",
                    }}
                  >
                    {label}
                  </motion.button>
                );
              })}
            </div>

            {/* Text feedback */}
            <div className="mb-4">
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
                placeholder="Vuoi dirci qualcosa in piu? (opzionale)"
                rows={3}
                className="w-full text-sm rounded-[var(--radius-lg)] px-4 py-3 resize-none transition-colors placeholder:text-[var(--foreground-tertiary)]"
                style={{
                  background: "color-mix(in srgb, var(--foreground) 4%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
                  color: "var(--foreground-secondary)",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "color-mix(in srgb, var(--accent) 40%, transparent)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "color-mix(in srgb, var(--foreground) 10%, transparent)";
                }}
              />
              <div className="flex justify-end mt-1">
                <span className="text-[10px] text-[var(--foreground-tertiary)]">
                  {feedbackText.length}/{MAX_TEXT_LENGTH}
                </span>
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="flex items-center gap-2 text-xs mb-3"
                  style={{ color: "var(--score-critical)" }}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSubmit}
              disabled={isSubmitting || rating === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              style={{
                background: "linear-gradient(to bottom right, var(--accent), var(--accent-cta-end))",
                color: "white",
                boxShadow: rating > 0 ? "var(--cta-shadow)" : "none",
              }}
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {existingId ? "Aggiorna feedback" : "Invia feedback"}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
