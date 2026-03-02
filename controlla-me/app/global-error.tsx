"use client";

// Global error boundary — catches errors in the root layout.
// Required by Next.js 15 to prevent /_global-error prerender failure.
// See: https://nextjs.org/docs/app/api-reference/file-conventions/error#global-errorjs

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
          Si è verificato un errore
        </h2>
        <p style={{ color: "#9B9B9B", fontSize: "0.875rem" }}>
          {error.digest ? `Codice: ${error.digest}` : "Errore imprevisto"}
        </p>
        <button
          onClick={reset}
          style={{
            padding: "8px 20px",
            backgroundColor: "#FF6B35",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Riprova
        </button>
      </body>
    </html>
  );
}
