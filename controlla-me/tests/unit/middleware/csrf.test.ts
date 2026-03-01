import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { checkCsrf } from "@/lib/middleware/csrf";

function makeRequest(method: string, origin?: string, referer?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (origin) headers["origin"] = origin;
  if (referer) headers["referer"] = referer;

  return new NextRequest("http://localhost:3000/api/test", {
    method,
    headers,
  });
}

describe("checkCsrf — richieste senza Origin header", () => {
  it("GET senza Origin → null (server-to-server o curl)", () => {
    expect(checkCsrf(makeRequest("GET"))).toBeNull();
  });

  it("POST senza Origin → null (chiamata server-to-server)", () => {
    expect(checkCsrf(makeRequest("POST"))).toBeNull();
  });

  it("HEAD senza Origin → null", () => {
    expect(checkCsrf(makeRequest("HEAD"))).toBeNull();
  });
});

describe("checkCsrf — POST senza Origin/Referer", () => {
  it("POST senza Origin e senza Referer → null (server-to-server)", () => {
    expect(checkCsrf(makeRequest("POST"))).toBeNull();
  });
});

describe("checkCsrf — sviluppo (localhost)", () => {
  it("POST da localhost:3000 → null (permesso)", () => {
    const req = makeRequest("POST", "http://localhost:3000");
    expect(checkCsrf(req)).toBeNull();
  });

  it("POST da 127.0.0.1 → null (permesso)", () => {
    const req = makeRequest("POST", "http://127.0.0.1:3000");
    expect(checkCsrf(req)).toBeNull();
  });
});

describe("checkCsrf — produzione (NEXT_PUBLIC_APP_URL)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://controlla.me");
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("POST da stessa origine app → null (ok)", () => {
    const req = makeRequest("POST", "https://controlla.me");
    expect(checkCsrf(req)).toBeNull();
  });

  it("POST da origine diversa → 403", () => {
    const req = makeRequest("POST", "https://evil.com");
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("DELETE da origine diversa → 403", () => {
    const req = makeRequest("DELETE", "https://attacker.io");
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("PUT da origine diversa → 403", () => {
    const req = makeRequest("PUT", "https://attacker.io");
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("PATCH da origine diversa → 403", () => {
    const req = makeRequest("PATCH", "https://attacker.io");
    const result = checkCsrf(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});

describe("checkCsrf — assenza Origin (Referer ignorato)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://controlla.me");
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("POST senza Origin ma con Referer lecito → null (no Origin = ok)", () => {
    // L'implementazione attuale controlla solo Origin, non Referer.
    // Una POST senza Origin passa sempre (server-to-server legittimo).
    const req = makeRequest("POST", undefined, "https://controlla.me/dashboard");
    expect(checkCsrf(req)).toBeNull();
  });

  it("POST senza Origin ma con Referer estraneo → null (no Origin = ok)", () => {
    // Senza Origin il middleware non blocca (serve per chiamate server-to-server).
    // Il Referer non è verificato dall'implementazione attuale.
    const req = makeRequest("POST", undefined, "https://evil.com/page");
    expect(checkCsrf(req)).toBeNull();
  });
});
