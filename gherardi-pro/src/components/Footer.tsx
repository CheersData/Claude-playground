"use client";

export default function Footer() {
  return (
    <footer className="border-t border-gold/10 bg-background">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-3 gap-12">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="font-[family-name:var(--font-playfair)] text-2xl text-foreground">
                Gherardi
              </span>
              <span className="text-gold text-xs font-medium tracking-[0.2em] uppercase mt-1">
                Pro
              </span>
            </div>
            <p className="text-foreground/30 text-sm leading-relaxed max-w-xs">
              Partner manifatturiero delle griffe del lusso.
              Eccellenza sartoriale dal cuore della Toscana.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-gold text-xs tracking-[0.2em] uppercase mb-4">
              Navigazione
            </h4>
            <div className="space-y-3">
              {[
                { label: "Chi Siamo", href: "#chi-siamo" },
                { label: "Il Processo", href: "#processo" },
                { label: "Tecnologia", href: "#tecnologia" },
                { label: "Servizi", href: "#servizi" },
                { label: "Clienti", href: "#clienti" },
                { label: "Contatti", href: "#contatti" },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="block text-sm text-foreground/30 hover:text-gold transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          {/* Certifications */}
          <div>
            <h4 className="text-gold text-xs tracking-[0.2em] uppercase mb-4">
              Certificazioni
            </h4>
            <div className="flex flex-wrap gap-2">
              {["ISO 9001", "ISO 14001", "ISO 45001", "UNI/PdR 125"].map(
                (cert) => (
                  <span
                    key={cert}
                    className="px-3 py-1.5 border border-gold/10 text-foreground/30 text-xs tracking-wide"
                  >
                    {cert}
                  </span>
                )
              )}
            </div>
            <div className="mt-6">
              <p className="text-foreground/20 text-xs">
                Gherardi S.r.l.
                <br />
                Via Canonico Coupers 11
                <br />
                52036 Pieve Santo Stefano (AR)
              </p>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="luxury-divider mt-12 mb-8" />
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-foreground/15 text-xs">
            &copy; {new Date().getFullYear()} Gherardi S.r.l. Tutti i diritti
            riservati.
          </p>
          <div className="flex gap-6">
            <a
              href="#"
              className="text-foreground/15 hover:text-gold/40 text-xs transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="text-foreground/15 hover:text-gold/40 text-xs transition-colors"
            >
              Cookie Policy
            </a>
            <a
              href="#"
              className="text-foreground/15 hover:text-gold/40 text-xs transition-colors"
            >
              Codice Etico
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
