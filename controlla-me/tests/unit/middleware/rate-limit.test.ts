import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/middleware/rate-limit";

// Helper: crea una NextRequest fake con IP simulato
function makeRequest(url: string, ip = "192.168.1.1"): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    headers: { "x-forwarded-for": ip },
  });
}

// Reset store interno tra test: richiede che il modulo venga reimportato
// oppure che il test aspetti che la window scada.
// Usiamo fake timers per controllare il tempo.

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("restituisce null (ok) per le prime richieste sotto il limite", async () => {
    const req = makeRequest("/api/corpus/ask", "10.0.0.1");
    // Limite corpus/ask: 10 req / 60s
    for (let i = 0; i < 9; i++) {
      const result = await checkRateLimit(req, "user-a");
      expect(result).toBeNull();
    }
  });

  it("restituisce 429 quando il limite viene superato", async () => {
    const req = makeRequest("/api/corpus/ask", "10.0.0.2");
    // Consuma tutte le 10 richieste consentite
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(req, "user-b");
    }
    // La prossima deve essere bloccata
    const result = await checkRateLimit(req, "user-b");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it("include header Retry-After nella response 429", async () => {
    const req = makeRequest("/api/corpus/ask", "10.0.0.3");
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(req, "user-c");
    }
    const result = await checkRateLimit(req, "user-c");
    expect(result).not.toBeNull();
    expect(result!.headers.get("Retry-After")).toBeTruthy();
  });

  it("isola utenti diversi sullo stesso IP", async () => {
    const req = makeRequest("/api/corpus/ask", "10.0.0.4");
    // user-d consuma il limite
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(req, "user-d");
    }
    // user-e non è limitato (chiave diversa)
    const result = await checkRateLimit(req, "user-e");
    expect(result).toBeNull();
  });

  it("applica il match longest-prefix corretto (corpus/ask vs corpus)", async () => {
    const askLimit = RATE_LIMITS["api/corpus/ask"];
    const corpusLimit = RATE_LIMITS["api/corpus"];
    // Verifica che le config siano diverse
    expect(askLimit.max).not.toBe(corpusLimit.max);

    // Una richiesta a /api/corpus/ask deve usare la config specifica
    const req = makeRequest("/api/corpus/ask", "10.0.0.5");
    // Consuma fino al limite di corpus/ask (10)
    for (let i = 0; i < askLimit.max; i++) {
      await checkRateLimit(req, "user-f");
    }
    const blocked = await checkRateLimit(req, "user-f");
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
  });

  it("permette nuove richieste dopo la scadenza della finestra temporale", async () => {
    const req = makeRequest("/api/corpus/ask", "10.0.0.6");
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(req, "user-g");
    }

    // Avanza il tempo oltre la finestra (60 secondi)
    vi.advanceTimersByTime(61_000);

    // Ora il limite deve essere resettato
    const result = await checkRateLimit(req, "user-g");
    expect(result).toBeNull();
  });
});

describe("RATE_LIMITS config", () => {
  it("ha una config 'default' per endpoint non specificati", () => {
    expect(RATE_LIMITS["default"]).toBeDefined();
    expect(RATE_LIMITS["default"].max).toBeGreaterThan(0);
  });

  it("endpoint analyze ha limite più stretto degli altri", () => {
    expect(RATE_LIMITS["api/analyze"].max).toBeLessThanOrEqual(
      RATE_LIMITS["api/deep-search"].max
    );
  });
});
