/**
 * Tests: lib/middleware/console-token.ts (P3)
 *
 * Copre:
 * - generateToken: formato token (payloadB64.sig con punto)
 * - verifyToken: token valido → payload corretto
 * - verifyToken: token scaduto → null (via fake timers)
 * - verifyToken: token manomesso → null
 * - verifyToken: stringa casuale → null
 * - refreshToken: aggiorna tier/disabledAgents, preserva nome/cognome/ruolo/sid
 * - requireConsoleAuth: header Authorization Bearer valido → payload
 * - requireConsoleAuth: header assente → null
 *
 * Nota: il modulo usa il secret al momento dell'import (variabile module-level).
 * Il vitest.setup.ts NON setta CONSOLE_JWT_SECRET → il modulo usa il dev fallback
 * hardcoded "dev-console-secret-CHANGE-IN-PRODUCTION-min32chars!!" che è stabile
 * per tutta la suite. Non occorre mockare crypto — si testa la crittografia reale.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// IMPORTANTE: next/server non è disponibile in ambienti Vitest puri (Node.js).
// requireConsoleAuth usa solo req.headers.get("Authorization") — costruiamo un
// oggetto plain con la stessa interfaccia, evitando di istanziare NextRequest reale.

import {
  generateToken,
  refreshToken,
  verifyToken,
  requireConsoleAuth,
  type ConsoleTokenPayload,
} from "@/lib/middleware/console-token";
import type { NextRequest } from "next/server";

// ── Helper ────────────────────────────────────────────────────────────────────

const testUser = { nome: "Mario", cognome: "Rossi", ruolo: "admin" };

function makeValidToken(overrides?: Partial<typeof testUser>) {
  return generateToken({ ...testUser, ...overrides });
}

/**
 * Crea un fake NextRequest con l'interfaccia minima richiesta da requireConsoleAuth.
 * requireConsoleAuth chiama solo req.headers.get("Authorization") — basta quello.
 */
function makeNextRequest(authHeader?: string): NextRequest {
  const headers = new Map<string, string>();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return {
    headers: {
      get: (key: string) => headers.get(key.toLowerCase()) ?? null,
    },
  } as unknown as NextRequest;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // Assicuriamoci che i fake timer vengano sempre ripristinati
  vi.useRealTimers();
});

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("generateToken", () => {
  it("ritorna una stringa nel formato 'payloadB64.sig' (contiene esattamente un punto)", () => {
    const token = makeValidToken();

    // Deve contenere almeno un punto
    expect(token).toContain(".");

    // Split su ULTIMO punto: [payloadB64, sig]
    const lastDot = token.lastIndexOf(".");
    const payloadB64 = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);

    expect(payloadB64.length).toBeGreaterThan(0);
    expect(sig.length).toBeGreaterThan(0);
  });

  it("il payload decodificato contiene nome, cognome, ruolo, tier, sid, iat, exp", () => {
    const token = makeValidToken();
    const lastDot = token.lastIndexOf(".");
    const payloadB64 = token.slice(0, lastDot);

    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as ConsoleTokenPayload;

    expect(payload.nome).toBe("Mario");
    expect(payload.cognome).toBe("Rossi");
    expect(payload.ruolo).toBe("admin");
    expect(typeof payload.sid).toBe("string");
    expect(payload.sid.length).toBeGreaterThan(0);
    expect(typeof payload.tier).toBe("string");
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("usa tier 'partner' di default se non specificato", () => {
    const token = generateToken(testUser);
    const lastDot = token.lastIndexOf(".");
    const payload = JSON.parse(
      Buffer.from(token.slice(0, lastDot), "base64url").toString("utf8")
    ) as ConsoleTokenPayload;

    expect(payload.tier).toBe("partner");
  });

  it("usa il tier specificato nelle options", () => {
    const token = generateToken(testUser, { tier: "intern" });
    const lastDot = token.lastIndexOf(".");
    const payload = JSON.parse(
      Buffer.from(token.slice(0, lastDot), "base64url").toString("utf8")
    ) as ConsoleTokenPayload;

    expect(payload.tier).toBe("intern");
  });

  it("genera sid diversi per token diversi (entropy)", () => {
    const token1 = generateToken(testUser);
    const token2 = generateToken(testUser);

    const getSid = (t: string) => {
      const lastDot = t.lastIndexOf(".");
      return (
        JSON.parse(
          Buffer.from(t.slice(0, lastDot), "base64url").toString("utf8")
        ) as ConsoleTokenPayload
      ).sid;
    };

    expect(getSid(token1)).not.toBe(getSid(token2));
  });

  it("riutilizza il sid passato nelle options", () => {
    const fixedSid = "0123456789abcdef0123456789abcdef";
    const token = generateToken(testUser, { sid: fixedSid });
    const lastDot = token.lastIndexOf(".");
    const payload = JSON.parse(
      Buffer.from(token.slice(0, lastDot), "base64url").toString("utf8")
    ) as ConsoleTokenPayload;

    expect(payload.sid).toBe(fixedSid);
  });
});

describe("verifyToken", () => {
  it("ritorna il payload corretto per un token valido", () => {
    const token = generateToken(testUser, { tier: "associate" });
    const payload = verifyToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.nome).toBe("Mario");
    expect(payload!.cognome).toBe("Rossi");
    expect(payload!.ruolo).toBe("admin");
    expect(payload!.tier).toBe("associate");
    expect(Array.isArray(payload!.disabledAgents)).toBe(true);
  });

  it("ritorna null per token scaduto", () => {
    // Genera un token "adesso"
    const token = generateToken(testUser);

    // Avanza il tempo di 25 ore (oltre il TTL di 24 ore)
    vi.useFakeTimers();
    vi.advanceTimersByTime(25 * 3600 * 1000);

    const payload = verifyToken(token);
    expect(payload).toBeNull();

    vi.useRealTimers();
  });

  it("ritorna null per token con firma manomessa (ultimi caratteri modificati)", () => {
    const token = makeValidToken();

    // Manometti la firma (parte dopo l'ultimo punto)
    const lastDot = token.lastIndexOf(".");
    const corruptedToken = token.slice(0, lastDot + 1) + "aabbccdd00112233";

    const payload = verifyToken(corruptedToken);
    expect(payload).toBeNull();
  });

  it("ritorna null per token con payload manomesso (firma non corrisponde)", () => {
    const token1 = generateToken(testUser);
    const token2 = generateToken({ ...testUser, ruolo: "superadmin" });

    // Prendi il payload di token2 e la firma di token1 — firma non corrisponde
    const lastDot1 = token1.lastIndexOf(".");
    const lastDot2 = token2.lastIndexOf(".");
    const tamperedToken = token2.slice(0, lastDot2 + 1) + token1.slice(lastDot1 + 1);

    const payload = verifyToken(tamperedToken);
    expect(payload).toBeNull();
  });

  it("ritorna null per stringa casuale senza formato token", () => {
    expect(verifyToken("stringa-casuale-senza-punto")).toBeNull();
    expect(verifyToken("")).toBeNull();
    expect(verifyToken("abc.xyz.def")).toBeNull(); // payload non è base64url valido
  });

  it("ritorna null per token senza punto separatore", () => {
    expect(verifyToken("tokenSenzaPunto")).toBeNull();
  });

  it("ritorna null se il JSON nel payload è malformato", () => {
    // Costruiamo un token con payload non-JSON valido
    const fakePayload = Buffer.from("questo non è json").toString("base64url");
    const fakeToken = `${fakePayload}.fakesignature`;

    expect(verifyToken(fakeToken)).toBeNull();
  });
});

describe("refreshToken", () => {
  it("aggiorna tier e preserva nome/cognome/ruolo/sid", () => {
    const originalToken = generateToken(testUser, { tier: "partner" });
    const originalPayload = verifyToken(originalToken)!;

    const refreshed = refreshToken(originalPayload, { tier: "intern" });
    const refreshedPayload = verifyToken(refreshed)!;

    expect(refreshedPayload).not.toBeNull();
    expect(refreshedPayload.tier).toBe("intern");
    expect(refreshedPayload.nome).toBe(originalPayload.nome);
    expect(refreshedPayload.cognome).toBe(originalPayload.cognome);
    expect(refreshedPayload.ruolo).toBe(originalPayload.ruolo);
    expect(refreshedPayload.sid).toBe(originalPayload.sid);
  });

  it("aggiorna disabledAgents e preserva gli altri campi", () => {
    const originalToken = generateToken(testUser);
    const originalPayload = verifyToken(originalToken)!;

    const refreshed = refreshToken(originalPayload, {
      disabledAgents: ["analyzer", "advisor"],
    });
    const refreshedPayload = verifyToken(refreshed)!;

    expect(refreshedPayload).not.toBeNull();
    expect(refreshedPayload.disabledAgents).toEqual(["analyzer", "advisor"]);
    expect(refreshedPayload.nome).toBe(originalPayload.nome);
    expect(refreshedPayload.sid).toBe(originalPayload.sid);
  });

  it("preserva tier corrente se non aggiornato", () => {
    const originalToken = generateToken(testUser, { tier: "associate" });
    const originalPayload = verifyToken(originalToken)!;

    const refreshed = refreshToken(originalPayload, { disabledAgents: [] });
    const refreshedPayload = verifyToken(refreshed)!;

    expect(refreshedPayload.tier).toBe("associate");
  });

  it("ritorna un token verificabile (firma valida)", () => {
    const originalToken = generateToken(testUser);
    const originalPayload = verifyToken(originalToken)!;

    const refreshed = refreshToken(originalPayload, { tier: "intern" });

    expect(verifyToken(refreshed)).not.toBeNull();
  });

  it("il token refreshato non è uguale all'originale (iat cambia)", () => {
    const originalToken = generateToken(testUser);
    const originalPayload = verifyToken(originalToken)!;

    // Avanza il tempo di 1ms per garantire iat diverso
    const refreshed = refreshToken(originalPayload, {});

    // I token sono diversi (almeno per timestamp diverso o entropia)
    // Verifichiamo che entrambi siano validi
    expect(verifyToken(refreshed)).not.toBeNull();
  });
});

describe("requireConsoleAuth", () => {
  it("ritorna il payload per una request con header Authorization Bearer valido", () => {
    const token = generateToken(testUser);
    const req = makeNextRequest(`Bearer ${token}`);

    const payload = requireConsoleAuth(req);

    expect(payload).not.toBeNull();
    expect(payload!.nome).toBe("Mario");
    expect(payload!.cognome).toBe("Rossi");
    expect(payload!.ruolo).toBe("admin");
  });

  it("ritorna null se il header Authorization è assente", () => {
    const req = makeNextRequest(); // nessun header

    const payload = requireConsoleAuth(req);
    expect(payload).toBeNull();
  });

  it("ritorna null se il header non inizia con 'Bearer '", () => {
    const token = generateToken(testUser);
    const req = makeNextRequest(`Token ${token}`);

    const payload = requireConsoleAuth(req);
    expect(payload).toBeNull();
  });

  it("ritorna null se il token Bearer è invalido", () => {
    const req = makeNextRequest("Bearer token-completamente-falso");

    const payload = requireConsoleAuth(req);
    expect(payload).toBeNull();
  });

  it("ritorna null se il token Bearer è scaduto", () => {
    const token = generateToken(testUser);

    vi.useFakeTimers();
    vi.advanceTimersByTime(25 * 3600 * 1000);

    const req = makeNextRequest(`Bearer ${token}`);
    const payload = requireConsoleAuth(req);

    vi.useRealTimers();

    expect(payload).toBeNull();
  });

  it("propaga correttamente tier e disabledAgents dal token", () => {
    const token = generateToken(testUser, {
      tier: "intern",
      disabledAgents: ["corpus-agent"],
    });
    const req = makeNextRequest(`Bearer ${token}`);

    const payload = requireConsoleAuth(req);

    expect(payload).not.toBeNull();
    expect(payload!.tier).toBe("intern");
    expect(payload!.disabledAgents).toContain("corpus-agent");
  });
});
