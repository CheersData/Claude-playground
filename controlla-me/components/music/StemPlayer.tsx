"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

/* ── Types ── */

export interface StemData {
  name: string;
  /** Display label (e.g. "Voce", "Batteria") */
  label: string;
  /** Audio URL — if undefined, player shows placeholder */
  audioUrl?: string;
  color: string;
}

interface StemPlayerProps {
  stem: StemData;
  index: number;
}

/* ── Fake waveform bars (placeholder) ── */

function WaveformPlaceholder({ color, isPlaying }: { color: string; isPlaying: boolean }) {
  const bars = 32;
  return (
    <div className="flex items-center gap-[2px] h-10 flex-1 min-w-0">
      {Array.from({ length: bars }).map((_, i) => {
        const height = 20 + Math.sin(i * 0.7) * 15 + Math.cos(i * 1.3) * 10;
        return (
          <motion.div
            key={i}
            className="flex-1 min-w-[2px] max-w-[6px] rounded-full"
            style={{
              backgroundColor: color,
              opacity: isPlaying ? 0.8 : 0.3,
            }}
            initial={{ height: 4 }}
            animate={{
              height: isPlaying
                ? [height * 0.4, height, height * 0.6, height * 0.9, height * 0.4]
                : height * 0.6,
            }}
            transition={
              isPlaying
                ? {
                    duration: 0.8 + (i * 0.07), // deterministic per-bar offset
                    repeat: Infinity,
                    repeatType: "reverse",
                    delay: i * 0.03,
                  }
                : { duration: 0.4 }
            }
          />
        );
      })}
    </div>
  );
}

/* ── Component ── */

export default function StemPlayer({ stem, index }: StemPlayerProps) {
  const { label, audioUrl, color } = stem;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);

  /* Time update for progress */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.15 + index * 0.1, duration: 0.5, ease: "easeOut" }}
      className="rounded-[var(--radius-xl)] p-4 flex items-center gap-4"
      style={{
        background: "var(--card-bg)",
        boxShadow: "var(--card-shadow)",
        border: "1px solid var(--card-border)",
      }}
    >
      {/* Hidden audio element */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        disabled={!audioUrl}
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        }}
        aria-label={isPlaying ? "Pausa" : "Riproduci"}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" style={{ color }} />
        ) : (
          <Play className="w-4 h-4 ml-0.5" style={{ color }} />
        )}
      </button>

      {/* Stem label */}
      <div className="flex flex-col min-w-[80px]">
        <span className="text-sm font-semibold text-[var(--foreground-secondary)]">
          {label}
        </span>
        {!audioUrl && (
          <span className="text-[10px] text-[var(--foreground-tertiary)]">
            Non disponibile
          </span>
        )}
      </div>

      {/* Waveform */}
      <WaveformPlaceholder color={color} isPlaying={isPlaying} />

      {/* Progress bar overlay */}
      {audioUrl && progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b-[var(--radius-xl)] overflow-hidden">
          <div
            className="h-full transition-all duration-300"
            style={{ width: `${progress}%`, backgroundColor: color }}
          />
        </div>
      )}

      {/* Volume toggle */}
      <button
        onClick={toggleMute}
        disabled={!audioUrl}
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label={isMuted ? "Attiva audio" : "Disattiva audio"}
      >
        {isMuted ? (
          <VolumeX className="w-4 h-4 text-[var(--foreground-tertiary)]" />
        ) : (
          <Volume2 className="w-4 h-4 text-[var(--foreground-tertiary)]" />
        )}
      </button>
    </motion.div>
  );
}
