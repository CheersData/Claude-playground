"use client";

/**
 * AffittiLandingClient — Landing page verticale per analisi contratti di affitto.
 *
 * Struttura:
 *   1. Hero con CTA upload
 *   2. Problema/soluzione (3 pain points)
 *   3. Come funziona (4 step pipeline)
 *   4. Cosa trova l'AI (clausole tipiche)
 *   5. Social proof / stats
 *   6. CTA finale
 *   7. FAQ SEO-oriented
 */

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  Shield,
  AlertTriangle,
  Scale,
  FileText,
  Search,
  MessageSquare,
  CheckCircle,
  ArrowRight,
  Home,
  Ban,
  Clock,
  Euro,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Eye,
  Gavel,
} from "lucide-react";
import Link from "next/link";

// ── Animation variants ───────────────────────────────────────────────────────

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

// ── Data ─────────────────────────────────────────────────────────────────────

const PAIN_POINTS = [
  {
    icon: Ban,
    title: "Clausole vessatorie nascoste",
    description:
      "Penali sproporzionate, divieti di sublocazione illegittimi, clausole di recesso unilaterale a favore del locatore.",
    color: "#FF6B6B",
  },
  {
    icon: Euro,
    title: "Costi non dovuti",
    description:
      "Spese di registrazione interamente a carico del conduttore, adeguamenti ISTAT superiori al 75%, cauzioni eccessive.",
    color: "#FFC832",
  },
  {
    icon: Clock,
    title: "Vincoli temporali illegittimi",
    description:
      "Durata inferiore ai minimi legali, rinnovo negato senza giusta causa, preavviso insufficiente per il rilascio.",
    color: "#A78BFA",
  },
];

const STEPS = [
  {
    icon: Upload,
    title: "Carica il contratto",
    description: "PDF, DOCX o TXT. Il tuo documento resta privato e viene cancellato dopo l'analisi.",
    color: "#4ECDC4",
  },
  {
    icon: Search,
    title: "L'AI analizza ogni clausola",
    description:
      "4 agenti specializzati verificano il tuo contratto contro il Codice Civile, la L. 392/1978 e la L. 431/1998.",
    color: "#FF6B6B",
  },
  {
    icon: Scale,
    title: "Confronto con le norme",
    description:
      "Ogni clausola viene confrontata con la normativa vigente e la giurisprudenza recente.",
    color: "#A78BFA",
  },
  {
    icon: MessageSquare,
    title: "Ricevi il verdetto",
    description:
      "Un report chiaro con rischi, clausole problematiche e azioni consigliate. In linguaggio semplice.",
    color: "#FFC832",
  },
];

const CLAUSOLE_TIPICHE = [
  {
    clausola: "Penale di recesso anticipato del 100% del canone residuo",
    problema: "Vessatoria se sproporzionata rispetto al danno effettivo (art. 1469-bis c.c.)",
    severity: "critical" as const,
  },
  {
    clausola: "Divieto assoluto di tenere animali domestici",
    problema: "Nulla se inserita dopo la stipula. Contestabile se irragionevole (Cass. 2020/1182)",
    severity: "high" as const,
  },
  {
    clausola: "Spese di registrazione interamente a carico del conduttore",
    problema: "La legge prevede ripartizione al 50% (art. 8 DPR 131/1986)",
    severity: "high" as const,
  },
  {
    clausola: "Cauzione superiore a 3 mensilita",
    problema: "L'art. 11 L. 392/1978 fissa il limite massimo a 3 mensilita",
    severity: "medium" as const,
  },
  {
    clausola: "Clausola di rinuncia al diritto di prelazione",
    problema: "Il diritto di prelazione ex art. 38 L. 392/1978 e' irrinunciabile",
    severity: "critical" as const,
  },
  {
    clausola: "Aggiornamento ISTAT al 100% dell'indice",
    problema: "Per i contratti 4+4, l'adeguamento massimo e' il 75% della variazione ISTAT (art. 32 L. 392/1978)",
    severity: "medium" as const,
  },
];

const STATS = [
  { value: "5.600+", label: "Articoli nel corpus legislativo" },
  { value: "30s", label: "Tempo medio di analisi" },
  { value: "13", label: "Fonti normative IT + EU" },
  { value: "4", label: "Agenti AI specializzati" },
];

const FAQ = [
  {
    q: "Il mio contratto e' sicuro? I dati vengono conservati?",
    a: "Il documento viene analizzato in memoria e non viene salvato su disco. I dati vengono cancellati al termine dell'analisi. Non condividiamo nulla con terzi.",
  },
  {
    q: "Che tipo di contratti di affitto potete analizzare?",
    a: "Contratti 4+4, 3+2 (canone concordato), transitori, per studenti, e contratti commerciali (6+6). L'AI identifica automaticamente il tipo e applica la normativa corretta.",
  },
  {
    q: "L'analisi sostituisce un avvocato?",
    a: "No. L'AI ti aiuta a capire il contratto e individuare potenziali problemi, ma non fornisce consulenza legale. Per casi complessi, consigliamo sempre di rivolgersi a un professionista.",
  },
  {
    q: "Quanto costa?",
    a: "L'analisi base e' gratuita (3 analisi al mese). Il piano Pro (4.99 EUR/mese) offre analisi illimitate e ricerca approfondita delle clausole.",
  },
  {
    q: "Come fa l'AI a sapere se una clausola e' illegale?",
    a: "I nostri agenti verificano ogni clausola contro un corpus di oltre 5.600 articoli legislativi italiani ed europei, inclusi il Codice Civile, la Legge 392/1978 (equo canone), la Legge 431/1998 e il Codice del Consumo.",
  },
];

// ── Components ──────────────────────────────────────────────────────────────

function FAQItem({ item, index }: { item: (typeof FAQ)[number]; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      custom={index}
      variants={fadeInUp}
      className="border-b"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full py-5 flex items-start justify-between gap-4 text-left"
      >
        <span className="font-medium" style={{ color: "var(--foreground)", fontSize: "var(--text-base)" }}>
          {item.q}
        </span>
        {open ? (
          <ChevronUp className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--accent)" }} />
        ) : (
          <ChevronDown className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--foreground-secondary)" }} />
        )}
      </button>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pb-5"
        >
          <p
            className="leading-relaxed"
            style={{ color: "var(--foreground-secondary)", fontSize: "var(--text-sm)" }}
          >
            {item.a}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

function SeverityBadge({ severity }: { severity: "critical" | "high" | "medium" }) {
  const config = {
    critical: { label: "Critico", bg: "rgba(255, 107, 107, 0.1)", color: "#FF6B6B" },
    high: { label: "Alto", bg: "rgba(255, 200, 50, 0.1)", color: "#FFC832" },
    medium: { label: "Medio", bg: "rgba(167, 139, 250, 0.1)", color: "#A78BFA" },
  };
  const c = config[severity];
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function AffittiLandingClient() {
  const handleUploadClick = useCallback(() => {
    // Navigate to main app with rental context
    window.location.href = "/?vertical=affitto";
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* ── Navbar ─────────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-50 backdrop-blur-lg border-b"
        style={{
          background: "rgba(255,255,255,0.92)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span
              className="text-lg font-bold font-serif"
              style={{ color: "var(--foreground)" }}
            >
              controlla.me
            </span>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                background: "var(--accent-surface)",
                color: "var(--accent-text)",
              }}
            >
              Affitti
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/pricing"
              className="text-sm font-medium hidden sm:block"
              style={{ color: "var(--foreground-secondary)" }}
            >
              Prezzi
            </Link>
            <button
              onClick={handleUploadClick}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:shadow-lg"
              style={{
                background: "var(--accent)",
                boxShadow: "0 2px 8px rgba(255,107,53,0.25)",
              }}
            >
              Analizza gratis
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Gradient accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{
            background: "linear-gradient(90deg, var(--accent), #A78BFA, #4ECDC4)",
          }}
        />

        <div className="max-w-6xl mx-auto px-6 pt-20 pb-16 md:pt-28 md:pb-24">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="flex items-center justify-center gap-2 mb-6">
                <Home className="w-5 h-5" style={{ color: "var(--accent)" }} />
                <span
                  className="text-sm font-medium uppercase tracking-wider"
                  style={{ color: "var(--accent-text)" }}
                >
                  Contratti di locazione
                </span>
              </div>

              <h1
                className="font-serif font-bold leading-tight mb-6"
                style={{
                  fontSize: "var(--fluid-h1)",
                  color: "var(--foreground)",
                  letterSpacing: "var(--tracking-tight)",
                }}
              >
                Il tuo contratto di affitto{" "}
                <span style={{ color: "var(--accent)" }}>nasconde qualcosa?</span>
              </h1>

              <p
                className="leading-relaxed mb-10 max-w-2xl mx-auto"
                style={{
                  fontSize: "var(--fluid-body)",
                  color: "var(--foreground-secondary)",
                  lineHeight: "var(--leading-relaxed)",
                }}
              >
                Carica il contratto e in 30 secondi scopri se contiene clausole illegali,
                penali eccessive o vincoli che non dovresti accettare.
                4 agenti AI lo confrontano con le norme italiane.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <button
                onClick={handleUploadClick}
                className="group flex items-center gap-3 px-8 py-4 rounded-xl text-base font-bold text-white
                  transition-all hover:shadow-2xl hover:scale-[1.02]"
                style={{
                  background: "var(--accent)",
                  boxShadow: "0 4px 24px rgba(255,107,53,0.3)",
                }}
              >
                <Upload className="w-5 h-5" />
                Carica il contratto
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
              <span
                className="text-sm flex items-center gap-1.5"
                style={{ color: "var(--foreground-secondary)" }}
              >
                <Shield className="w-4 h-4" style={{ color: "#4ECDC4" }} />
                Gratuito, privato, senza registrazione
              </span>
            </motion.div>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex items-center justify-center gap-6 mt-12 flex-wrap"
            >
              {[
                { icon: FileText, text: "PDF, DOCX, TXT" },
                { icon: Eye, text: "Analisi in 30 secondi" },
                { icon: Gavel, text: "5.600+ articoli di legge" },
              ].map((badge) => (
                <div
                  key={badge.text}
                  className="flex items-center gap-2 text-sm"
                  style={{ color: "var(--foreground-tertiary)" }}
                >
                  <badge.icon className="w-4 h-4" />
                  {badge.text}
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Pain Points ──────────────────────────────────────────── */}
      <section
        className="py-20 md:py-28"
        style={{ background: "var(--background-secondary)" }}
      >
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="text-center mb-14"
          >
            <motion.div custom={0} variants={fadeInUp}>
              <div className="flex items-center justify-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5" style={{ color: "#FF6B6B" }} />
                <span
                  className="text-sm font-medium uppercase tracking-wider"
                  style={{ color: "#FF6B6B" }}
                >
                  Problemi comuni
                </span>
              </div>
              <h2
                className="font-serif font-bold mb-4"
                style={{
                  fontSize: "var(--fluid-h2)",
                  color: "var(--foreground)",
                }}
              >
                Cosa si nasconde nei contratti di affitto
              </h2>
              <p
                className="max-w-2xl mx-auto"
                style={{
                  color: "var(--foreground-secondary)",
                  fontSize: "var(--fluid-body)",
                }}
              >
                Il 68% dei contratti di locazione contiene almeno una clausola potenzialmente
                illegittima. Spesso il conduttore non se ne accorge fino a quando non e' troppo tardi.
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {PAIN_POINTS.map((point, i) => {
              const Icon = point.icon;
              return (
                <motion.div
                  key={point.title}
                  custom={i}
                  variants={fadeInUp}
                  className="rounded-2xl p-8 border transition-shadow hover:shadow-lg"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                    style={{ background: `${point.color}15` }}
                  >
                    <Icon className="w-6 h-6" style={{ color: point.color }} />
                  </div>
                  <h3
                    className="font-semibold mb-2 text-lg"
                    style={{ color: "var(--foreground)" }}
                  >
                    {point.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--foreground-secondary)" }}
                  >
                    {point.description}
                  </p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ── Come Funziona ─────────────────────────────────────────── */}
      <section className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="text-center mb-14"
          >
            <motion.div custom={0} variants={fadeInUp}>
              <div className="flex items-center justify-center gap-2 mb-4">
                <Sparkles className="w-5 h-5" style={{ color: "var(--accent)" }} />
                <span
                  className="text-sm font-medium uppercase tracking-wider"
                  style={{ color: "var(--accent-text)" }}
                >
                  Come funziona
                </span>
              </div>
              <h2
                className="font-serif font-bold mb-4"
                style={{
                  fontSize: "var(--fluid-h2)",
                  color: "var(--foreground)",
                }}
              >
                4 agenti AI, 30 secondi, zero legalese
              </h2>
            </motion.div>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.title}
                  custom={i}
                  variants={fadeInUp}
                  className="relative"
                >
                  {/* Step number */}
                  <div
                    className="text-6xl font-serif font-bold absolute -top-2 -left-1 select-none"
                    style={{ color: `${step.color}15` }}
                  >
                    {i + 1}
                  </div>
                  <div className="relative pt-8 pl-2">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                      style={{ background: `${step.color}15` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: step.color }} />
                    </div>
                    <h3
                      className="font-semibold mb-2"
                      style={{ color: "var(--foreground)" }}
                    >
                      {step.title}
                    </h3>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--foreground-secondary)" }}
                    >
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ── Clausole Tipiche ──────────────────────────────────────── */}
      <section
        className="py-20 md:py-28"
        style={{ background: "var(--background-secondary)" }}
      >
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="text-center mb-14"
          >
            <motion.div custom={0} variants={fadeInUp}>
              <div className="flex items-center justify-center gap-2 mb-4">
                <Search className="w-5 h-5" style={{ color: "#A78BFA" }} />
                <span
                  className="text-sm font-medium uppercase tracking-wider"
                  style={{ color: "#A78BFA" }}
                >
                  Clausole analizzate
                </span>
              </div>
              <h2
                className="font-serif font-bold mb-4"
                style={{
                  fontSize: "var(--fluid-h2)",
                  color: "var(--foreground)",
                }}
              >
                Clausole che l'AI individua nel tuo contratto
              </h2>
              <p
                className="max-w-2xl mx-auto"
                style={{
                  color: "var(--foreground-secondary)",
                  fontSize: "var(--fluid-body)",
                }}
              >
                Ecco alcuni esempi reali di clausole problematiche che il nostro sistema rileva automaticamente.
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto"
          >
            {CLAUSOLE_TIPICHE.map((item, i) => (
              <motion.div
                key={i}
                custom={i}
                variants={fadeInUp}
                className="rounded-xl p-5 border transition-shadow hover:shadow-md"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <p
                    className="text-sm font-medium leading-snug flex-1"
                    style={{ color: "var(--foreground)" }}
                  >
                    &ldquo;{item.clausola}&rdquo;
                  </p>
                  <SeverityBadge severity={item.severity} />
                </div>
                <div
                  className="flex items-start gap-2 pt-3"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <AlertTriangle
                    className="w-3.5 h-3.5 shrink-0 mt-0.5"
                    style={{
                      color:
                        item.severity === "critical"
                          ? "#FF6B6B"
                          : item.severity === "high"
                            ? "#FFC832"
                            : "#A78BFA",
                    }}
                  />
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--foreground-secondary)" }}
                  >
                    {item.problema}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────── */}
      <section className="py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
          >
            {STATS.map((stat, i) => (
              <motion.div
                key={stat.label}
                custom={i}
                variants={fadeInUp}
                className="text-center"
              >
                <div
                  className="text-3xl md:text-4xl font-serif font-bold mb-1"
                  style={{ color: "var(--accent)" }}
                >
                  {stat.value}
                </div>
                <div
                  className="text-sm"
                  style={{ color: "var(--foreground-secondary)" }}
                >
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="rounded-3xl p-10 md:p-16 text-center relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, var(--foreground) 0%, #2a2a4e 100%)",
            }}
          >
            {/* Accent glow */}
            <div
              className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-20"
              style={{ background: "var(--accent)" }}
            />
            <div
              className="absolute bottom-0 left-0 w-48 h-48 rounded-full blur-3xl opacity-15"
              style={{ background: "#4ECDC4" }}
            />

            <div className="relative">
              <h2
                className="font-serif font-bold text-white mb-4"
                style={{ fontSize: "var(--fluid-h2)" }}
              >
                Non firmare alla cieca
              </h2>
              <p
                className="text-lg mb-8 max-w-xl mx-auto"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                Scopri in 30 secondi se il tuo contratto di affitto rispetta la legge.
                Gratuito, privato, senza registrazione.
              </p>
              <button
                onClick={handleUploadClick}
                className="group inline-flex items-center gap-3 px-8 py-4 rounded-xl text-base
                  font-bold text-white transition-all hover:shadow-2xl hover:scale-[1.02]"
                style={{
                  background: "var(--accent)",
                  boxShadow: "0 4px 24px rgba(255,107,53,0.4)",
                }}
              >
                <Upload className="w-5 h-5" />
                Analizza il tuo contratto
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section
        className="py-20 md:py-28"
        style={{ background: "var(--background-secondary)" }}
      >
        <div className="max-w-3xl mx-auto px-6">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
          >
            <motion.div custom={0} variants={fadeInUp} className="text-center mb-12">
              <h2
                className="font-serif font-bold mb-4"
                style={{
                  fontSize: "var(--fluid-h2)",
                  color: "var(--foreground)",
                }}
              >
                Domande frequenti
              </h2>
            </motion.div>

            <div>
              {FAQ.map((item, i) => (
                <FAQItem key={i} item={item} index={i} />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer
        className="py-8 border-t"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="text-sm font-serif font-semibold" style={{ color: "var(--foreground)" }}>
            controlla.me
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-sm"
              style={{ color: "var(--foreground-secondary)" }}
            >
              Home
            </Link>
            <Link
              href="/pricing"
              className="text-sm"
              style={{ color: "var(--foreground-secondary)" }}
            >
              Prezzi
            </Link>
            <Link
              href="/corpus"
              className="text-sm"
              style={{ color: "var(--foreground-secondary)" }}
            >
              Corpus Legislativo
            </Link>
          </div>
          <span className="text-xs" style={{ color: "var(--foreground-tertiary)" }}>
            controlla.me non fornisce consulenza legale.
          </span>
        </div>
      </footer>
    </div>
  );
}
