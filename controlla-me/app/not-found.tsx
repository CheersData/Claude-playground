// Server component wrapper — export const dynamic only works in server components.
// Prevents /_not-found static prerender failure in Next.js 16 Turbopack.
// Without force-dynamic, the prerender worker crashes with useContext null error
// when the page is processed on the same worker as other client-heavy pages.
export const dynamic = "force-dynamic";

import Link from "next/link";

// Pagina 404 — nessun componente client per evitare prerender useContext crash (Framer Motion + React 19)
export default function NotFound() {
  return (
    <html lang="it">
      <body
        style={{
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "#0a0a0a",
          color: "#ffffff",
          fontFamily: "sans-serif",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
          Pagina non trovata
        </h2>
        <p style={{ color: "#9B9B9B", fontSize: "0.875rem" }}>
          Il documento che cerchi non esiste o è stato rimosso.
        </p>
        <Link
          href="/"
          style={{
            padding: "8px 20px",
            backgroundColor: "#FF6B35",
            color: "#fff",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "0.875rem",
          }}
        >
          Torna alla home
        </Link>
      </body>
    </html>
  );
}
