"use client";

import { WifiOff, RefreshCw } from "lucide-react";

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0a0a0a",
        color: "#ffffff",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          backgroundColor: "rgba(255, 107, 53, 0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 32,
        }}
      >
        <WifiOff size={40} color="#FF6B35" strokeWidth={1.5} />
      </div>

      <h1
        style={{
          fontSize: "1.75rem",
          fontWeight: 600,
          marginBottom: 12,
          letterSpacing: "-0.02em",
        }}
      >
        Sei offline
      </h1>

      <p
        style={{
          fontSize: "1.0625rem",
          color: "#9B9B9B",
          maxWidth: 400,
          lineHeight: 1.6,
          marginBottom: 40,
        }}
      >
        Riconnettiti a internet per usare Poimandres.
        <br />I tuoi dati sono al sicuro.
      </p>

      <button
        onClick={() => window.location.reload()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 28px",
          backgroundColor: "#FF6B35",
          color: "#ffffff",
          border: "none",
          borderRadius: 10,
          fontSize: "0.9375rem",
          fontWeight: 500,
          cursor: "pointer",
          transition: "background-color 0.2s",
          fontFamily: "inherit",
        }}
        onMouseOver={(e) =>
          ((e.target as HTMLButtonElement).style.backgroundColor = "#E85A24")
        }
        onMouseOut={(e) =>
          ((e.target as HTMLButtonElement).style.backgroundColor = "#FF6B35")
        }
      >
        <RefreshCw size={18} />
        Riprova
      </button>

      <p
        style={{
          marginTop: 48,
          fontSize: "0.75rem",
          color: "#4a4a4a",
        }}
      >
        Poimandres
      </p>
    </div>
  );
}
