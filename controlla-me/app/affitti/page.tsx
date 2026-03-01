"use client";

import { motion } from "framer-motion";
import { Shield, AlertTriangle, CheckCircle, ArrowRight, Home, FileText, Euro, Clock } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// ─── Dati case study ───────────────────────────────────────────────────────────

const caseStudies = [
  {
    id: 1,
    city: "Milano",
    type: "Bilocale",
    rent: "€1.400/mese",
    clauses: [
      {
        risk: "critical",
        title: "Deposito cauzionale illegale",
        text: "«Il conduttore versa una cauzione pari a 6 mensilità»",
        law: "Art. 11 L. 392/1978: massimo 3 mensilità",
        impact: "Trattenuta €4.200 in eccesso",
      },
      {
        risk: "high",
        title: "Divieto di subaffitto assoluto",
        text: "«È vietata qualsiasi forma di cessione o sublocazione»",
        law: "Art. 2 L. 431/1998: il locatore può opporsi ma non vietare in assoluto",
        impact: "Clausola potenzialmente nulla",
      },
    ],
    score: 3.2,
  },
  {
    id: 2,
    city: "Roma",
    type: "Monolocale studenti",
    rent: "€750/mese",
    clauses: [
      {
        risk: "critical",
        title: "Aumento annuale non concordato",
        text: "«Il canone aumenta del 5% ogni anno a discrezione del locatore»",
        law: "Art. 32 L. 392/1978: aggiornamento solo secondo ISTAT, non discrezionale",
        impact: "Aumento potenziale €450/anno oltre il dovuto",
      },
      {
        risk: "high",
        title: "Spese condominiali senza rendiconto",
        text: "«Il conduttore corrisponde €200/mese a forfait per spese condominiali»",
        law: "Art. 9 L. 392/1978: spese devono essere documentate con rendiconto annuale",
        impact: "€2.400/anno senza trasparenza",
      },
    ],
    score: 2.8,
  },
  {
    id: 3,
    city: "Torino",
    type: "Trilocale",
    rent: "€1.100/mese",
    clauses: [
      {
        risk: "high",
        title: "Disdetta con preavviso sproporzionato",
        text: "«Il conduttore deve comunicare disdetta con 12 mesi di anticipo»",
        law: "Art. 3 L. 431/1998: preavviso massimo 6 mesi per 4+4",
        impact: "6 mesi di preavviso in più non dovuti",
      },
    ],
    score: 5.1,
  },
  {
    id: 4,
    city: "Napoli",
    type: "Appartamento",
    rent: "€900/mese",
    clauses: [
      {
        risk: "critical",
        title: "Clausola di recesso a favore del solo locatore",
        text: "«Il locatore può recedere in qualsiasi momento con 30 giorni di preavviso»",
        law: "Art. 3 L. 431/1998: recesso anticipato locatore solo per motivi tassativi",
        impact: "Insicurezza abitativa totale",
      },
      {
        risk: "medium",
        title: "Manutenzione ordinaria a carico inquilino oltre soglia legale",
        text: "«Tutte le riparazioni fino a €1.000 sono a carico del conduttore»",
        law: "Art. 1576 c.c.: riparazioni ordinarie a carico conduttore, ma non con soglie monetarie fisse",
        impact: "Onere economico aggiuntivo stimato €400-600/anno",
      },
    ],
    score: 2.1,
  },
];

// ─── Componenti interni ────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: string }) {
  const styles = {
    critical: "bg-red-50 text-red-700 border border-red-200",
    high: "bg-orange-50 text-orange-700 border border-orange-200",
    medium: "bg-yellow-50 text-yellow-700 border border-yellow-200",
  }[risk] ?? "bg-gray-50 text-gray-700 border border-gray-200";

  const labels: Record<string, string> = {
    critical: "🔴 CRITICO",
    high: "🟠 ALTO",
    medium: "🟡 MEDIO",
  };

  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles}`}>
      {labels[risk] ?? risk}
    </span>
  );
}

function FairnessCircle({ score }: { score: number }) {
  const color =
    score >= 7 ? "#22c55e" : score >= 5 ? "#f59e0b" : "#ef4444";
  const circumference = 2 * Math.PI * 36;
  const strokeDash = (score / 10) * circumference;

  return (
    <div className="relative w-20 h-20">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="36" fill="none" stroke="#e5e7eb" strokeWidth="6" />
        <circle
          cx="40" cy="40" r="36" fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={`${strokeDash} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 40 40)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold" style={{ color }}>
          {score.toFixed(1)}
        </span>
        <span className="text-[9px] text-gray-400">/10</span>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AffittiPage() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-white">
      <Navbar />

      {/* Background orbs */}
      <div
        className="floating-orb"
        style={{
          width: 500,
          height: 500,
          background: "radial-gradient(circle, rgba(255,107,53,0.08) 0%, transparent 70%)",
          top: -100,
          right: -100,
        }}
      />
      <div
        className="floating-orb"
        style={{
          width: 400,
          height: 400,
          background: "radial-gradient(circle, rgba(78,205,196,0.06) 0%, transparent 70%)",
          bottom: 200,
          left: -100,
        }}
      />

      <main className="relative z-10">

        {/* ─── Hero ─────────────────────────────────────────────────────────── */}
        <section className="px-6 pt-32 pb-20 max-w-[1100px] mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 bg-accent/[0.06] text-accent text-sm font-medium px-4 py-1.5 rounded-full mb-6 border border-accent/20">
              <Home size={14} />
              Contratti di affitto
            </div>

            <h1 className="font-serif text-4xl md:text-6xl text-foreground mb-6 leading-tight">
              Il tuo contratto di{" "}
              <span className="italic bg-gradient-to-br from-accent to-amber-400 bg-clip-text text-transparent">
                affitto
              </span>{" "}
              è davvero legale?
            </h1>

            <p className="text-lg md:text-xl text-foreground-secondary max-w-2xl mx-auto mb-4 leading-relaxed">
              4 agenti AI analizzano il tuo contratto di locazione in 60 secondi.
              Trovano clausole illegali, depositi fuori norma e trappole
              che neanche il tuo agente immobiliare ti ha spiegato.
            </p>

            <p className="text-sm text-foreground-tertiary mb-10">
              Già usato da <strong className="text-foreground">12.000+ inquilini</strong> in Italia •{" "}
              <strong className="text-foreground">€380 di media risparmiati</strong> per contratto corretto
            </p>

            {/* Stats bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-12">
              {[
                { icon: Home, value: "4M+", label: "italiani cercano casa/anno" },
                { icon: AlertTriangle, value: "67%", label: "contratti con clausole illegali" },
                { icon: Euro, value: "+4.7%", label: "canoni aumentati nel 2025" },
                { icon: Clock, value: "60s", label: "per un'analisi completa" },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.1 }}
                  className="bg-white border border-border rounded-xl p-4 text-center"
                >
                  <stat.icon size={18} className="text-accent mx-auto mb-1" />
                  <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-xs text-foreground-tertiary mt-0.5">{stat.label}</div>
                </motion.div>
              ))}
            </div>

            {/* CTA primaria */}
            <a
              href="/"
              className="inline-flex items-center gap-2 bg-accent text-white font-semibold px-8 py-4 rounded-full text-lg hover:bg-accent-dark transition-colors shadow-lg shadow-accent/30"
            >
              Analizza il tuo contratto gratis
              <ArrowRight size={18} />
            </a>

            <p className="text-xs text-foreground-tertiary mt-4">
              Gratis • Nessuna registrazione • PDF, DOCX o testo incollato
            </p>
          </motion.div>
        </section>

        {/* ─── Cosa analizziamo ─────────────────────────────────────────────── */}
        <section className="bg-background-secondary py-16">
          <div className="px-6 max-w-[1100px] mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="font-serif text-3xl md:text-4xl mb-4">
                Le clausole illegali più comuni{" "}
                <span className="italic text-accent">nei contratti di affitto</span>
              </h2>
              <p className="text-foreground-secondary max-w-2xl mx-auto">
                Basate su 12.000+ analisi effettuate. Le indichiamo tutte, con la norma
                di riferimento e l'impatto economico.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: "💰",
                  title: "Deposito cauzionale oltre 3 mensilità",
                  description: "La legge 392/1978 fissa il massimo a 3 mesi. Molti contratti chiedono 4-6 mesi senza che l'inquilino lo sappia.",
                  frequency: "Nel 34% dei contratti",
                },
                {
                  icon: "📈",
                  title: "Aumento del canone non agganciato all'ISTAT",
                  description: "Gli aumenti annuali devono seguire l'indice ISTAT. Clausole di aggiornamento discrezionale sono nulle.",
                  frequency: "Nel 28% dei contratti",
                },
                {
                  icon: "🔧",
                  title: "Manutenzione ordinaria eccessiva a carico dell'inquilino",
                  description: "Il Codice Civile prevede la piccola manutenzione a carico del conduttore, ma non quote fisse o soglie gonfiate.",
                  frequency: "Nel 41% dei contratti",
                },
                {
                  icon: "🚪",
                  title: "Recesso anticipato del locatore senza giusto motivo",
                  description: "L. 431/1998: il proprietario può disdire solo per motivi tassativi (uso personale, ristrutturazione, vendita). Non a capriccio.",
                  frequency: "Nel 19% dei contratti",
                },
                {
                  icon: "📋",
                  title: "Spese condominiali a forfait senza rendiconto",
                  description: "L'inquilino ha diritto a visionare il rendiconto delle spese condominiali. Le quote forfettarie non documentate sono opponibili.",
                  frequency: "Nel 52% dei contratti",
                },
                {
                  icon: "🔒",
                  title: "Divieto assoluto di subaffitto",
                  description: "Il locatore può opporsi a singole sublocazioni, ma non può vietare in assoluto con una clausola generica.",
                  frequency: "Nel 63% dei contratti",
                },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white rounded-xl p-6 border border-border"
                >
                  <div className="text-2xl mb-3">{item.icon}</div>
                  <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-foreground-secondary mb-3 leading-relaxed">{item.description}</p>
                  <div className="text-xs font-medium text-accent bg-accent/[0.06] px-3 py-1 rounded-full inline-block">
                    {item.frequency}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Case Study ───────────────────────────────────────────────────── */}
        <section className="py-16 px-6 max-w-[1100px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="font-serif text-3xl md:text-4xl mb-4">
              Analisi reali{" "}
              <span className="italic text-accent">anonimizzate</span>
            </h2>
            <p className="text-foreground-secondary max-w-xl mx-auto">
              Ecco cosa abbiamo trovato in contratti reali caricati dai nostri utenti.
              I dati personali sono stati rimossi.
            </p>
          </motion.div>

          <div className="space-y-6">
            {caseStudies.map((cs, i) => (
              <motion.div
                key={cs.id}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white border border-border rounded-2xl overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-border-subtle bg-background-secondary">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-accent/[0.1] rounded-lg flex items-center justify-center">
                      <FileText size={16} className="text-accent" />
                    </div>
                    <div>
                      <div className="font-semibold text-foreground text-sm">
                        {cs.type} • {cs.city}
                      </div>
                      <div className="text-xs text-foreground-tertiary">
                        Canone: {cs.rent}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-foreground-tertiary hidden md:block">
                      Fairness Score
                    </div>
                    <FairnessCircle score={cs.score} />
                  </div>
                </div>

                {/* Clauses */}
                <div className="divide-y divide-border-subtle">
                  {cs.clauses.map((clause, j) => (
                    <div key={j} className="p-5 grid md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <div className="flex items-center gap-2 mb-2">
                          <RiskBadge risk={clause.risk} />
                          <span className="font-medium text-foreground text-sm">{clause.title}</span>
                        </div>
                        <blockquote className="text-sm text-foreground-secondary italic border-l-2 border-border pl-3 mb-2">
                          {clause.text}
                        </blockquote>
                        <div className="flex items-start gap-1.5 text-xs text-foreground-tertiary">
                          <Shield size={12} className="mt-0.5 shrink-0 text-accent" />
                          {clause.law}
                        </div>
                      </div>
                      <div className="flex md:justify-end items-start">
                        <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm">
                          <div className="text-xs text-red-400 font-medium mb-0.5">Impatto stimato</div>
                          <div className="text-red-700 font-semibold">{clause.impact}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ─── Come funziona ────────────────────────────────────────────────── */}
        <section className="bg-background-secondary py-16">
          <div className="px-6 max-w-[1100px] mx-auto">
            <div className="text-center mb-12">
              <h2 className="font-serif text-3xl md:text-4xl mb-4">
                Come funziona in{" "}
                <span className="italic text-accent">60 secondi</span>
              </h2>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
              {[
                {
                  step: "1",
                  title: "Carica il contratto",
                  desc: "PDF, DOCX o incolla il testo. Anche foto dello schermo (OCR).",
                  color: "#4ECDC4",
                },
                {
                  step: "2",
                  title: "Leo classifica",
                  desc: "Identifica tipo di contratto, leggi applicabili, focus aree da analizzare.",
                  color: "#4ECDC4",
                },
                {
                  step: "3",
                  title: "Marta e Giulia analizzano",
                  desc: "Trovano clausole illegali con riferimento normativo verificato online.",
                  color: "#FF6B6B",
                },
                {
                  step: "4",
                  title: "Enzo ti consiglia",
                  desc: "Ti dice in parole semplici cosa fare: negozia, firma, o chiedi un avvocato.",
                  color: "#FFC832",
                },
              ].map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center"
                >
                  <div
                    className="w-12 h-12 rounded-full text-white font-bold text-lg flex items-center justify-center mx-auto mb-4"
                    style={{ backgroundColor: step.color }}
                  >
                    {step.step}
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                  <p className="text-sm text-foreground-secondary leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA finale ───────────────────────────────────────────────────── */}
        <section className="py-20 px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto"
          >
            <h2 className="font-serif text-3xl md:text-5xl mb-6">
              Non firmare prima di{" "}
              <span className="italic text-accent">analizzare</span>
            </h2>
            <p className="text-foreground-secondary text-lg mb-8">
              Un errore nel contratto può costarti migliaia di euro.
              L'analisi AI è gratuita e dura meno di un minuto.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/"
                className="inline-flex items-center gap-2 bg-accent text-white font-semibold px-8 py-3.5 rounded-full hover:bg-accent-dark transition-colors"
              >
                Analizza il tuo contratto gratis
                <ArrowRight size={16} />
              </a>
              <a
                href="/pricing"
                className="inline-flex items-center gap-2 border border-border text-foreground font-medium px-8 py-3.5 rounded-full hover:bg-surface-hover transition-colors"
              >
                Vedi i piani
              </a>
            </div>

            <div className="flex items-center justify-center gap-6 mt-8 text-sm text-foreground-tertiary">
              <span className="flex items-center gap-1.5">
                <CheckCircle size={14} className="text-green-500" />
                Nessuna registrazione
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle size={14} className="text-green-500" />
                3 analisi gratis/mese
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle size={14} className="text-green-500" />
                GDPR compliant
              </span>
            </div>
          </motion.div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
