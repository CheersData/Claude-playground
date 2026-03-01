import { describe, it, expect } from "vitest";
import {
  sanitizeDocumentText,
  sanitizeUserQuestion,
  sanitizeSessionId,
} from "@/lib/middleware/sanitize";

// ─── sanitizeDocumentText ───

describe("sanitizeDocumentText", () => {
  it("lascia passare testo normale invariato", () => {
    const text = "Contratto di locazione\nArt. 1 - Il conduttore...";
    expect(sanitizeDocumentText(text)).toBe(text);
  });

  it("rimuove caratteri di controllo (eccetto \\n \\r \\t)", () => {
    const text = "testo\x00normale\x01con\x07control";
    const result = sanitizeDocumentText(text);
    expect(result).not.toContain("\x00");
    expect(result).not.toContain("\x01");
    expect(result).not.toContain("\x07");
    expect(result).toContain("testonormaleconcontrol");
  });

  it("preserva newline e tab", () => {
    const text = "riga1\nriga2\tindentata\r\nriga3";
    expect(sanitizeDocumentText(text)).toBe(text);
  });

  it("tronca testo oltre 500.000 caratteri", () => {
    const long = "a".repeat(600_000);
    const result = sanitizeDocumentText(long);
    expect(result.length).toBe(500_000);
  });

  it("non tronca testo sotto il limite", () => {
    const text = "testo breve";
    expect(sanitizeDocumentText(text).length).toBe(text.length);
  });
});

// ─── sanitizeUserQuestion ───

describe("sanitizeUserQuestion", () => {
  it("trimma spazi iniziali e finali", () => {
    expect(sanitizeUserQuestion("  domanda?  ")).toBe("domanda?");
  });

  it("rimuove caratteri di controllo", () => {
    const text = "domanda\x00malevola";
    expect(sanitizeUserQuestion(text)).not.toContain("\x00");
  });

  it("tronca a 2.000 caratteri", () => {
    const long = "d".repeat(3_000);
    expect(sanitizeUserQuestion(long).length).toBe(2_000);
  });

  it("lascia passare testo valido invariato", () => {
    const q = "Cosa significa la clausola 5 del contratto?";
    expect(sanitizeUserQuestion(q)).toBe(q);
  });
});

// ─── sanitizeSessionId ───

describe("sanitizeSessionId", () => {
  it("accetta sessionId alfanumerico valido", () => {
    expect(sanitizeSessionId("abc123-def456")).toBe("abc123-def456");
  });

  it("accetta sessionId con underscore", () => {
    expect(sanitizeSessionId("session_abc_123")).toBe("session_abc_123");
  });

  it("rifiuta path traversal (..)", () => {
    expect(sanitizeSessionId("../../etc/passwd")).toBeNull();
  });

  it("rifiuta caratteri speciali", () => {
    expect(sanitizeSessionId("abc; DROP TABLE")).toBeNull();
    expect(sanitizeSessionId("abc<script>")).toBeNull();
    expect(sanitizeSessionId("abc/def")).toBeNull();
  });

  it("rifiuta sessionId troppo corto (< 5 caratteri)", () => {
    expect(sanitizeSessionId("ab")).toBeNull();
  });

  it("rifiuta sessionId troppo lungo (> 100 caratteri)", () => {
    expect(sanitizeSessionId("a".repeat(101))).toBeNull();
  });

  it("accetta lunghezza al limite inferiore (5 caratteri)", () => {
    expect(sanitizeSessionId("abc12")).toBe("abc12");
  });

  it("rifiuta sessionId con spazi (nessun trim — spazi non validi per path URL)", () => {
    // L'implementazione non fa trim: uno spazio non è mai valido in un sessionId da URL.
    expect(sanitizeSessionId("  abc123  ")).toBeNull();
  });
});
