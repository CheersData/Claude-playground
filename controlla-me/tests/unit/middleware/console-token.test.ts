import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  generateToken,
  verifyToken,
  refreshToken,
  requireConsoleAuth,
} from "@/lib/middleware/console-token";

// ─── Helpers ───

const testUser = { nome: "Marco", cognome: "Rossi", ruolo: "admin" };

function makeRequest(token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== undefined) {
    headers["Authorization"] = token;
  }
  return new NextRequest("http://localhost/api/console", { headers });
}

// ─── Tests ───

describe("generateToken", () => {
  it("ritorna una stringa nel formato base64url.hexsig (contiene un punto)", () => {
    const token = generateToken(testUser);
    expect(typeof token).toBe("string");
    expect(token).toContain(".");
    const parts = token.split(".");
    // Base64url parte + hex signature
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBe(64); // SHA-256 hex = 64 chars
  });

  it("il payload decodificato contiene i campi corretti", () => {
    const token = generateToken(testUser, { tier: "associate", disabledAgents: [] });
    const dotIdx = token.lastIndexOf(".");
    const payloadB64 = token.slice(0, dotIdx);
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));

    expect(payload.nome).toBe("Marco");
    expect(payload.cognome).toBe("Rossi");
    expect(payload.ruolo).toBe("admin");
    expect(payload.tier).toBe("associate");
    expect(payload.disabledAgents).toEqual([]);
    expect(typeof payload.sid).toBe("string");
    expect(payload.sid.length).toBeGreaterThan(0);
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("usa tier 'partner' come default quando non specificato", () => {
    const token = generateToken(testUser);
    const dotIdx = token.lastIndexOf(".");
    const payloadB64 = token.slice(0, dotIdx);
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    expect(payload.tier).toBe("partner");
  });

  it("usa disabledAgents vuoto come default quando non specificato", () => {
    const token = generateToken(testUser);
    const dotIdx = token.lastIndexOf(".");
    const payloadB64 = token.slice(0, dotIdx);
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    expect(payload.disabledAgents).toEqual([]);
  });
});

describe("verifyToken", () => {
  it("ritorna payload corretto con tutti i campi attesi per un token valido", () => {
    const token = generateToken(testUser, { tier: "intern", disabledAgents: ["analyzer"] });
    const payload = verifyToken(token);

    expect(payload).not.toBeNull();
    expect(payload!.nome).toBe("Marco");
    expect(payload!.cognome).toBe("Rossi");
    expect(payload!.ruolo).toBe("admin");
    expect(payload!.tier).toBe("intern");
    expect(payload!.disabledAgents).toEqual(["analyzer"]);
    expect(typeof payload!.sid).toBe("string");
    expect(typeof payload!.iat).toBe("number");
    expect(typeof payload!.exp).toBe("number");
  });

  it("ritorna null per token con firma modificata (security test)", () => {
    const token = generateToken(testUser);
    // Sostituisce l'ultimo char della firma
    const corrupted = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(verifyToken(corrupted)).toBeNull();
  });

  it("ritorna null per token con payload modificato ma firma originale", () => {
    const token = generateToken(testUser, { tier: "intern" });
    const dotIdx = token.lastIndexOf(".");
    const originalSig = token.slice(dotIdx + 1);
    const originalPayload = JSON.parse(Buffer.from(token.slice(0, dotIdx), "base64url").toString("utf8"));

    // Eleva illegalmente il tier da "intern" a "partner"
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...originalPayload, tier: "partner" })
    ).toString("base64url");

    // Il token ha payload modificato ma firma originale (che era per "intern")
    const tamperedToken = `${tamperedPayload}.${originalSig}`;
    expect(verifyToken(tamperedToken)).toBeNull();
  });

  it("ritorna null per token scaduto", () => {
    // Costruisce manualmente un payload con exp nel passato e lo firma con il segreto dev
    const { createHmac } = require("crypto");
    const SECRET = "dev-console-secret-CHANGE-IN-PRODUCTION-min32chars!!";

    const expiredPayload = {
      nome: "Marco",
      cognome: "Rossi",
      ruolo: "admin",
      sid: "abc123",
      tier: "partner",
      disabledAgents: [],
      iat: Date.now() - 2 * 24 * 3600 * 1000, // 2 giorni fa
      exp: Date.now() - 24 * 3600 * 1000,     // scaduto 24h fa
    };

    const payloadB64 = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(payloadB64).digest("hex");
    const expiredToken = `${payloadB64}.${sig}`;

    expect(verifyToken(expiredToken)).toBeNull();
  });

  it("ritorna null per stringa random/malformata", () => {
    expect(verifyToken("random-garbage-not-a-token")).toBeNull();
    expect(verifyToken("!!!invalid!!!")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });

  it("ritorna null per token senza punto (nessun separatore)", () => {
    // Un token senza punto non ha separatore payload.firma
    expect(verifyToken("payloadwithoutdotseparator")).toBeNull();
  });

  it("ritorna null per stringa con punto ma payload non-base64url valido", () => {
    expect(verifyToken("!!!invalid-payload!!!.abc123")).toBeNull();
  });
});

describe("verifyToken — timing-safe comparison", () => {
  it("token con stessa lunghezza firma ma caratteri errati ritorna null (no early exit)", () => {
    const token = generateToken(testUser);
    const dotIdx = token.lastIndexOf(".");
    const payloadB64 = token.slice(0, dotIdx);

    // Costruisce firma della stessa lunghezza (64 hex chars) ma tutta 'a'
    const wrongSig = "a".repeat(64);
    const tokenWithWrongSig = `${payloadB64}.${wrongSig}`;

    // Deve ritornare null (timing-safe path: stesso length → loop completo → diff !== 0)
    expect(verifyToken(tokenWithWrongSig)).toBeNull();
  });

  it("token con firma di lunghezza diversa ritorna null (short-circuit per length)", () => {
    const token = generateToken(testUser);
    const dotIdx = token.lastIndexOf(".");
    const payloadB64 = token.slice(0, dotIdx);

    // Firma di lunghezza sbagliata (32 invece di 64)
    const shortSig = "a".repeat(32);
    const tokenWithShortSig = `${payloadB64}.${shortSig}`;

    expect(verifyToken(tokenWithShortSig)).toBeNull();
  });
});

describe("refreshToken", () => {
  it("preserva il sid originale dopo il refresh", () => {
    const token = generateToken(testUser, { tier: "partner" });
    const originalPayload = verifyToken(token)!;
    expect(originalPayload).not.toBeNull();

    const refreshed = refreshToken(originalPayload, { tier: "intern" });
    const refreshedPayload = verifyToken(refreshed)!;
    expect(refreshedPayload).not.toBeNull();

    expect(refreshedPayload.sid).toBe(originalPayload.sid);
  });

  it("aggiorna il tier nel token refreshato", () => {
    const token = generateToken(testUser, { tier: "partner" });
    const originalPayload = verifyToken(token)!;

    const refreshed = refreshToken(originalPayload, { tier: "intern" });
    const refreshedPayload = verifyToken(refreshed)!;

    expect(refreshedPayload.tier).toBe("intern");
    expect(originalPayload.tier).toBe("partner");
  });

  it("preserva nome, cognome, ruolo originali dopo il refresh", () => {
    const token = generateToken(testUser, { tier: "associate" });
    const originalPayload = verifyToken(token)!;

    const refreshed = refreshToken(originalPayload, { tier: "intern" });
    const refreshedPayload = verifyToken(refreshed)!;

    expect(refreshedPayload.nome).toBe("Marco");
    expect(refreshedPayload.cognome).toBe("Rossi");
    expect(refreshedPayload.ruolo).toBe("admin");
  });

  it("aggiorna disabledAgents nel token refreshato", () => {
    const token = generateToken(testUser, { tier: "partner", disabledAgents: [] });
    const originalPayload = verifyToken(token)!;

    const refreshed = refreshToken(originalPayload, { disabledAgents: ["classifier", "analyzer"] });
    const refreshedPayload = verifyToken(refreshed)!;

    expect(refreshedPayload.disabledAgents).toEqual(["classifier", "analyzer"]);
  });

  it("preserva disabledAgents se non specificati nel refresh", () => {
    const token = generateToken(testUser, { disabledAgents: ["investigator"] });
    const originalPayload = verifyToken(token)!;

    const refreshed = refreshToken(originalPayload, { tier: "associate" });
    const refreshedPayload = verifyToken(refreshed)!;

    expect(refreshedPayload.disabledAgents).toEqual(["investigator"]);
  });
});

describe("requireConsoleAuth", () => {
  it("ritorna payload valido con header Authorization: Bearer <validToken>", () => {
    const token = generateToken(testUser, { tier: "partner" });
    const req = makeRequest(`Bearer ${token}`);
    const payload = requireConsoleAuth(req);

    expect(payload).not.toBeNull();
    expect(payload!.nome).toBe("Marco");
    expect(payload!.tier).toBe("partner");
  });

  it("ritorna null senza header Authorization", () => {
    const req = makeRequest(); // nessun header
    expect(requireConsoleAuth(req)).toBeNull();
  });

  it("ritorna null con header Authorization malformato (no 'Bearer ')", () => {
    const token = generateToken(testUser);
    const req = makeRequest(`Token ${token}`);
    expect(requireConsoleAuth(req)).toBeNull();
  });

  it("ritorna null con header 'Bearer' senza spazio (prefisso incompleto)", () => {
    const token = generateToken(testUser);
    const req = makeRequest(`Bearer${token}`);
    expect(requireConsoleAuth(req)).toBeNull();
  });

  it("ritorna null con header Authorization contenente token non valido", () => {
    const req = makeRequest("Bearer invalid.token.value");
    expect(requireConsoleAuth(req)).toBeNull();
  });

  it("ritorna null con stringa vuota come Authorization", () => {
    const req = makeRequest("");
    expect(requireConsoleAuth(req)).toBeNull();
  });

  it("ritorna null con Authorization: Bearer senza token", () => {
    const req = makeRequest("Bearer ");
    // "Bearer " + stringa vuota = nessun payload valido
    expect(requireConsoleAuth(req)).toBeNull();
  });
});
