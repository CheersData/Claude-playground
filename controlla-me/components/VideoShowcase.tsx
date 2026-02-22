"use client";

import { useState, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Play, Volume2, VolumeX } from "lucide-react";

interface VideoShowcaseProps {
  /** Path to video file in /public */
  src?: string;
  /** Poster/thumbnail image */
  poster?: string;
  /** Section title */
  title?: string;
  /** Section subtitle */
  subtitle?: string;
  /** Placeholder text when no video is available */
  placeholderText?: string;
  /** Accent color for the placeholder animation */
  accentColor?: string;
}

/**
 * Video showcase component with autoplay-on-scroll, poster image,
 * and animated placeholder when no video is provided yet.
 *
 * Use this to embed Sora-generated videos.
 * Place videos in /public/videos/ and reference them as "/videos/filename.mp4"
 */
export default function VideoShowcase({
  src,
  poster,
  title = "Guarda come funziona",
  subtitle = "30 secondi per capire cosa stai firmando.",
  placeholderText = "Video in arrivo — generato con Sora AI",
  accentColor = "#FF6B35",
}: VideoShowcaseProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isInView = useInView(containerRef, { amount: 0.5 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  // Auto-play/pause when in/out of view
  if (videoRef.current) {
    if (isInView && !isPlaying) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else if (!isInView && isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  return (
    <section ref={containerRef} className="relative z-10 px-6 py-24">
      <div className="max-w-[900px] mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          className="text-center mb-10"
        >
          <p className="text-[11px] font-bold tracking-[3px] uppercase text-accent/70 mb-3">
            Demo
          </p>
          <h2 className="font-serif text-3xl md:text-5xl mb-4">
            {title}
          </h2>
          <p className="text-base text-foreground-secondary max-w-[480px] mx-auto">
            {subtitle}
          </p>
        </motion.div>

        {/* Video container */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative rounded-3xl overflow-hidden border border-border bg-white shadow-sm"
          style={{ aspectRatio: "16/9" }}
        >
          {src ? (
            /* Real video */
            <>
              <video
                ref={videoRef}
                src={src}
                poster={poster}
                muted={isMuted}
                loop
                playsInline
                className="w-full h-full object-cover"
              />

              {/* Play overlay (shown when not playing) */}
              {!isPlaying && (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm cursor-pointer"
                  onClick={handlePlay}
                >
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-20 h-20 rounded-full bg-accent/90 flex items-center justify-center"
                    style={{ boxShadow: "0 8px 30px rgba(255,107,53,0.4)" }}
                  >
                    <Play className="w-8 h-8 text-white ml-1" fill="white" />
                  </motion.div>
                </div>
              )}

              {/* Mute toggle */}
              {isPlaying && (
                <button
                  onClick={toggleMute}
                  className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center hover:bg-white/90 transition-colors"
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-foreground-secondary" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-foreground-secondary" />
                  )}
                </button>
              )}
            </>
          ) : (
            /* Animated placeholder — shown until Sora videos are ready */
            <AnimatedVideoPlaceholder
              text={placeholderText}
              color={accentColor}
            />
          )}
        </motion.div>
      </div>
    </section>
  );
}

/* ── Animated placeholder with cinematic feel ── */
function AnimatedVideoPlaceholder({ text, color }: { text: string; color: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-background-secondary to-transparent">
      {/* Animated rings */}
      <div className="relative w-32 h-32">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-dashed"
          style={{ borderColor: `${color}25` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-3 rounded-full border-2 border-dashed"
          style={{ borderColor: `${color}15` }}
          animate={{ rotate: -360 }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-6 rounded-full border border-dashed"
          style={{ borderColor: `${color}10` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        />

        {/* Center play icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: `${color}15`, border: `1px solid ${color}25` }}
          >
            <Play className="w-6 h-6 ml-1" style={{ color: `${color}80` }} fill={`${color}40`} />
          </motion.div>
        </div>
      </div>

      {/* Text */}
      <div className="text-center px-6">
        <p className="text-sm text-foreground-tertiary mb-1">{text}</p>
        <p className="text-xs text-foreground-tertiary">Posiziona i tuoi video in /public/videos/</p>
      </div>

      {/* Scanning lines effect */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute left-0 right-0 h-[1px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${color}10, transparent)`,
          }}
          animate={{
            top: ["0%", "100%"],
            opacity: [0, 0.5, 0],
          }}
          transition={{
            duration: 4,
            delay: i * 1.3,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}
