import type { NextConfig } from "next";

// CSP direttive — mantenute separate per leggibilità
const ContentSecurityPolicy = [
  "default-src 'self'",
  // Next.js richiede unsafe-inline per hydration script; unsafe-eval per dev
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' js.stripe.com",
  // Stili inline usati da Tailwind e Framer Motion; Google Fonts
  "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
  // Font: self + Google Fonts CDN
  "font-src 'self' fonts.gstatic.com",
  // Immagini: self + data URI + blob (upload preview) + Supabase storage
  "img-src 'self' data: blob: *.supabase.co",
  // Video: self (public/videos/) + blob
  "media-src 'self' blob:",
  // Connessioni API: self + Supabase + Stripe
  "connect-src 'self' *.supabase.co *.stripe.com",
  // Frame: Stripe per 3D Secure
  "frame-src 'self' js.stripe.com",
  // Worker: nessuno (pdf-parse gira server-side)
  "worker-src 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // Aggiunto: Content-Security-Policy (SEC-003)
  {
    key: "Content-Security-Policy",
    value: ContentSecurityPolicy,
  },
  // Aggiunto: HSTS — forza HTTPS per 1 anno (SEC-003)
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  images: {
    qualities: [60, 75, 90],
  },

  async headers() {
    return [
      {
        // Applica security headers a tutte le route
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  /**
   * Rewrites per dominio poimandres.work:
   * - poimandres.work/        → /console  (Console Studio)
   * - poimandres.work/api/*   → /api/*    (API invariate)
   *
   * Per attivare: aggiungere "poimandres.work" come custom domain
   * nel dashboard Vercel (Settings → Domains).
   */
  async rewrites() {
    return {
      beforeFiles: [
        {
          // Root di poimandres.work → pagina /console
          source: "/",
          destination: "/console",
          has: [{ type: "host", value: "poimandres.work" }],
        },
        {
          // www.poimandres.work → pagina /console
          source: "/",
          destination: "/console",
          has: [{ type: "host", value: "www.poimandres.work" }],
        },
      ],
    };
  },
};

export default nextConfig;
