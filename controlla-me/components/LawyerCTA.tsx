"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Scale, Send, Check, Loader2 } from "lucide-react";

interface LawyerCTAProps {
  specialization: string;
  reason: string;
  analysisId?: string;
}

export default function LawyerCTA({
  specialization,
  reason,
  analysisId,
}: LawyerCTAProps) {
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    region: "",
    description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // In a full implementation, this would save to Supabase
    // For now, simulate a submission
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log("Lawyer referral submitted:", {
      analysisId,
      specialization,
      ...formData,
    });

    setIsLoading(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-green-50 border border-green-500/20 rounded-2xl p-6 mb-5 text-center"
      >
        <Check className="w-10 h-10 text-green-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-green-400 mb-2">
          Richiesta inviata
        </h3>
        <p className="text-sm text-foreground-secondary">
          Ti contatteremo entro 24 ore con un avvocato specializzato in{" "}
          <strong>{specialization}</strong> nella tua zona.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.75 }}
      className="bg-accent/[0.06] border border-accent/20 rounded-2xl p-6 mb-5"
    >
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
          <Scale className="w-6 h-6 text-accent" />
        </div>
        <div>
          <h3 className="text-base font-bold mb-1">
            Questo documento ha problemi che un avvocato puo risolvere
          </h3>
          <p className="text-sm text-foreground-secondary">{reason}</p>
          <p className="text-xs text-accent/70 mt-1">
            Specializzazione consigliata: {specialization}
          </p>
        </div>
      </div>

      <AnimatePresence>
        {!showForm ? (
          <motion.button
            key="cta"
            exit={{ opacity: 0 }}
            onClick={() => setShowForm(true)}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-gradient-to-br from-accent to-[#E8451A] hover:shadow-[0_8px_30px_rgba(255,107,53,0.3)] transition-all"
          >
            Mettimi in contatto con un avvocato
          </motion.button>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Nome e cognome"
                aria-label="Nome e cognome"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="px-4 py-2.5 rounded-xl bg-white shadow-sm border border-border text-sm text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/30 focus:ring-offset-1"
              />
              <input
                type="email"
                placeholder="Email"
                aria-label="Email"
                required
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="px-4 py-2.5 rounded-xl bg-white shadow-sm border border-border text-sm text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/30 focus:ring-offset-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="tel"
                placeholder="Telefono"
                aria-label="Telefono"
                required
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                className="px-4 py-2.5 rounded-xl bg-white shadow-sm border border-border text-sm text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/30 focus:ring-offset-1"
              />
              <input
                type="text"
                placeholder="Regione"
                aria-label="Regione"
                required
                value={formData.region}
                onChange={(e) =>
                  setFormData({ ...formData, region: e.target.value })
                }
                className="px-4 py-2.5 rounded-xl bg-white shadow-sm border border-border text-sm text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/30 focus:ring-offset-1"
              />
            </div>
            <textarea
              placeholder="Breve descrizione del problema..."
              aria-label="Descrizione del problema"
              rows={3}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-4 py-2.5 rounded-xl bg-white shadow-sm border border-border text-sm text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/30 focus:ring-offset-1 resize-none"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-br from-accent to-[#E8451A] hover:shadow-[0_8px_30px_rgba(255,107,53,0.3)] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Invia richiesta
                </>
              )}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
