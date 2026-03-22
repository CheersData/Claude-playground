import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

// CSP direttive — mantenute separate per leggibilità
const ContentSecurityPolicy = [
  "default-src 'self'",
  // Next.js richiede unsafe-inline per hydration; unsafe-eval solo in dev (HMR, error overlay)
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} js.stripe.com https://www.googletagmanager.com https://www.google-analytics.com`,
  // Stili inline usati da Tailwind e Framer Motion; Google Fonts
  "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
  // Font: self + Google Fonts CDN
  "font-src 'self' fonts.gstatic.com",
  // Immagini: self + data URI + blob (upload preview) + Supabase storage
  "img-src 'self' data: blob: *.supabase.co",
  // Video: self (public/videos/) + blob
  "media-src 'self' blob:",
  // Connessioni API: self + Supabase + Stripe
  "connect-src 'self' *.supabase.co *.stripe.com https://www.google-analytics.com https://analytics.google.com",
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

  // Next.js 16: disabilita prerenderEarlyExit per evitare build failure
  // su pagine client-only (es. /console, /_global-error) che non possono
  // essere prerendered staticamente. Con questa opzione il build continua
  // anche se una pagina fallisce il prerendering, marcandola come dynamic.
  experimental: {
    prerenderEarlyExit: false,
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
   *
   * SEO content publishing:
   * - poimandres.work/                → /poimandres         (Landing page)
   * - poimandres.work/blog            → /poimandres/blog    (Blog index)
   * - poimandres.work/blog/:slug      → /poimandres/blog/:slug (Article detail)
   * - poimandres.work/console         → /console            (Console Studio — accesso diretto)
   * - poimandres.work/api/*           → /api/*              (API invariate)
   *
   * Per attivare: aggiungere "poimandres.work" come custom domain
   * nel dashboard Vercel (Settings → Domains).
   */
  async rewrites() {
    return {
      beforeFiles: [
        // poimandres.work — Landing page SEO
        {
          source: "/",
          destination: "/poimandres",
          has: [{ type: "host", value: "poimandres.work" }],
        },
        {
          source: "/",
          destination: "/poimandres",
          has: [{ type: "host", value: "www.poimandres.work" }],
        },
        // poimandres.work/blog — Blog index
        {
          source: "/blog",
          destination: "/poimandres/blog",
          has: [{ type: "host", value: "poimandres.work" }],
        },
        {
          source: "/blog",
          destination: "/poimandres/blog",
          has: [{ type: "host", value: "www.poimandres.work" }],
        },
        // poimandres.work/blog/:slug — Article detail
        {
          source: "/blog/:slug",
          destination: "/poimandres/blog/:slug",
          has: [{ type: "host", value: "poimandres.work" }],
        },
        {
          source: "/blog/:slug",
          destination: "/poimandres/blog/:slug",
          has: [{ type: "host", value: "www.poimandres.work" }],
        },
        // poimandres.work/console — Console Studio (accesso diretto)
        {
          source: "/console",
          destination: "/console",
          has: [{ type: "host", value: "poimandres.work" }],
        },
        {
          source: "/console",
          destination: "/console",
          has: [{ type: "host", value: "www.poimandres.work" }],
        },
      ],
    };
  },
};

export default nextConfig;
