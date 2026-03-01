import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks (hoisted prima degli import) ───

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn().mockReturnThis(),
  insert: vi.fn().mockResolvedValue({ error: null }),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: null, error: null }),
  // maybeSingle è il terminale per findSessionByDocument (dopo limit)
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  update: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  // limit viene usato in due modi:
  //   - come terminale in getAverageTimings / listSessions → resolve con { data, error }
  //   - come parte di catena in findSessionByDocument → return this (poi maybeSingle è il terminale)
  // Default: return this — i test di getAverageTimings sovrascrivono per ogni chiamata
  limit: vi.fn().mockReturnThis(),
  rpc: vi.fn().mockResolvedValue({ data: 0, error: null }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockSupabase),
}));

// ─── Import modulo dopo i mock ───

import {
  createSession,
  loadSession,
  savePhaseResult,
  findSessionByDocument,
  savePhaseTiming,
  getAverageTimings,
} from "@/lib/analysis-cache";

// ─── Helper: reset catena mock ───

function resetMockChain() {
  mockSupabase.from.mockReturnThis();
  mockSupabase.insert.mockResolvedValue({ error: null });
  mockSupabase.select.mockReturnThis();
  mockSupabase.eq.mockReturnThis();
  mockSupabase.is.mockReturnThis();
  mockSupabase.not.mockReturnThis();
  mockSupabase.neq.mockReturnThis();
  mockSupabase.single.mockResolvedValue({ data: null, error: null });
  mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });
  mockSupabase.update.mockReturnThis();
  mockSupabase.order.mockReturnThis();
  mockSupabase.limit.mockReturnThis(); // default: chain (terminale gestito da maybeSingle o single)
  mockSupabase.rpc.mockResolvedValue({ data: 0, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMockChain();
});

// ─── createSession ───

describe("createSession", () => {
  it("ritorna un sessionId nel formato <hash16chars>-<random12chars>", async () => {
    const sessionId = await createSession("Testo del contratto di locazione");
    // Formato: [a-f0-9]{16}-[a-z0-9]{12}
    expect(sessionId).toMatch(/^[a-f0-9]{16}-[a-z0-9]{12}$/);
  });

  it("chiama supabase.from('analysis_sessions').insert() con i campi corretti", async () => {
    const text = "Contratto di vendita immobiliare";
    const sessionId = await createSession(text);

    expect(mockSupabase.from).toHaveBeenCalledWith("analysis_sessions");
    expect(mockSupabase.insert).toHaveBeenCalledTimes(1);

    const insertArg = mockSupabase.insert.mock.calls[0][0];
    expect(insertArg.session_id).toBe(sessionId);
    expect(insertArg.document_hash).toMatch(/^[a-f0-9]{16}$/);
    expect(insertArg.classification).toBeNull();
    expect(insertArg.analysis).toBeNull();
    expect(insertArg.investigation).toBeNull();
    expect(insertArg.advice).toBeNull();
    expect(insertArg.phase_timing).toEqual({});
    expect(typeof insertArg.created_at).toBe("string");
    expect(typeof insertArg.updated_at).toBe("string");
  });

  it("genera document_hash deterministico per lo stesso testo", async () => {
    const text = "Testo invariabile del contratto";
    const sessionId1 = await createSession(text);
    const sessionId2 = await createSession(text);

    // I primi 16 chars (l'hash) devono essere uguali
    expect(sessionId1.slice(0, 16)).toBe(sessionId2.slice(0, 16));
    // La parte random deve essere diversa
    expect(sessionId1.slice(17)).not.toBe(sessionId2.slice(17));
  });

  it("genera document_hash diverso per testi diversi", async () => {
    const sessionId1 = await createSession("Contratto A");
    const sessionId2 = await createSession("Contratto B");

    expect(sessionId1.slice(0, 16)).not.toBe(sessionId2.slice(0, 16));
  });

  it("lancia errore se l'insert supabase fallisce", async () => {
    mockSupabase.insert.mockResolvedValueOnce({ error: { message: "DB connection failed" } });

    await expect(createSession("testo")).rejects.toThrow("Cache createSession failed");
  });
});

// ─── loadSession ───

describe("loadSession", () => {
  it("chiama supabase con .eq('session_id', sessionId)", async () => {
    const sessionId = "abc123def45678ab-xyz098pqr123";
    await loadSession(sessionId);

    expect(mockSupabase.from).toHaveBeenCalledWith("analysis_sessions");
    expect(mockSupabase.select).toHaveBeenCalledWith("*");
    expect(mockSupabase.eq).toHaveBeenCalledWith("session_id", sessionId);
    expect(mockSupabase.single).toHaveBeenCalled();
  });

  it("ritorna null quando la sessione non viene trovata (data null)", async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

    const result = await loadSession("nonexistent-session");
    expect(result).toBeNull();
  });

  it("ritorna null quando supabase ritorna un errore", async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: { message: "not found" } });

    const result = await loadSession("some-session-id");
    expect(result).toBeNull();
  });

  it("ritorna CachedAnalysis mappato correttamente da un DB row valido", async () => {
    const fakeRow = {
      session_id: "aabbccdd11223344-xyz098pqr123",
      document_hash: "aabbccdd11223344",
      created_at: "2026-03-01T10:00:00.000Z",
      updated_at: "2026-03-01T10:05:00.000Z",
      classification: { documentType: "locazione" },
      analysis: null,
      investigation: null,
      advice: null,
      phase_timing: { classifier: { startedAt: "2026-03-01T10:00:00.000Z", completedAt: "2026-03-01T10:00:12.000Z", durationMs: 12000 } },
    };
    mockSupabase.single.mockResolvedValueOnce({ data: fakeRow, error: null });

    const result = await loadSession("aabbccdd11223344-xyz098pqr123");

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("aabbccdd11223344-xyz098pqr123");
    expect(result!.documentHash).toBe("aabbccdd11223344");
    expect(result!.classification).toEqual({ documentType: "locazione" });
    expect(result!.analysis).toBeNull();
    expect(result!.advice).toBeNull();
    expect(result!.phaseTiming).toBeDefined();
  });
});

// ─── savePhaseResult ───

describe("savePhaseResult", () => {
  it("chiama supabase.update() con i dati della fase corretta", async () => {
    mockSupabase.eq.mockResolvedValueOnce({ error: null });

    await savePhaseResult("test-session-id", "classification", { documentType: "affitto" });

    expect(mockSupabase.from).toHaveBeenCalledWith("analysis_sessions");
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        classification: { documentType: "affitto" },
      })
    );
    expect(mockSupabase.eq).toHaveBeenCalledWith("session_id", "test-session-id");
  });

  it("include updated_at nel payload di update", async () => {
    mockSupabase.eq.mockResolvedValueOnce({ error: null });

    await savePhaseResult("test-session-id", "analysis", { clauses: [] });

    const updateArg = mockSupabase.update.mock.calls[0][0];
    expect(typeof updateArg.updated_at).toBe("string");
  });

  it("non lancia se supabase ritorna un errore (silent fail)", async () => {
    mockSupabase.eq.mockResolvedValueOnce({ error: { message: "update failed" } });

    // savePhaseResult non richiede throw — logga e ritorna
    await expect(
      savePhaseResult("session-id", "advice", { fairnessScore: 7 })
    ).resolves.toBeUndefined();
  });
});

// ─── findSessionByDocument ───

describe("findSessionByDocument", () => {
  it("chiama supabase cercando per document_hash", async () => {
    await findSessionByDocument("Testo del documento di test");

    expect(mockSupabase.from).toHaveBeenCalledWith("analysis_sessions");
    expect(mockSupabase.select).toHaveBeenCalledWith("*");
    expect(mockSupabase.eq).toHaveBeenCalledWith(
      "document_hash",
      expect.stringMatching(/^[a-f0-9]{16}$/)
    );
  });

  it("ritorna null se non trova una sessione incompleta per il documento", async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await findSessionByDocument("Documento senza sessioni precedenti");
    expect(result).toBeNull();
  });

  it("ritorna null in caso di errore supabase", async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "query failed" } });

    const result = await findSessionByDocument("Testo qualsiasi");
    expect(result).toBeNull();
  });

  it("ritorna la sessione trovata mappata come CachedAnalysis", async () => {
    const fakeRow = {
      session_id: "11223344aabbccdd-abcdefgh1234",
      document_hash: "11223344aabbccdd",
      created_at: "2026-03-01T09:00:00.000Z",
      updated_at: "2026-03-01T09:10:00.000Z",
      classification: { documentType: "compravendita" },
      analysis: null,
      investigation: null,
      advice: null, // sessione incompleta — advice null
      phase_timing: {},
    };
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: fakeRow, error: null });

    const result = await findSessionByDocument("Contratto di compravendita immobiliare");

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("11223344aabbccdd-abcdefgh1234");
    expect(result!.advice).toBeNull();
  });
});

// ─── savePhaseTiming ───

describe("savePhaseTiming", () => {
  it("legge il phase_timing corrente e poi aggiorna con la fase nuova", async () => {
    // La funzione fa 2 round trip:
    //   1. select("phase_timing").eq(...).single()  → legge il timing corrente
    //   2. update({...}).eq(...)                    → scrive il timing aggiornato
    //
    // Il mock usa eq sempre con mockReturnThis.
    // Per il round trip 1: single() è il terminale → risolve con data
    // Per il round trip 2: eq() è il terminale → deve restituire una promise
    // Usiamo mockReturnValueOnce per far sì che la SECONDA chiamata a eq risolva.

    mockSupabase.single.mockResolvedValueOnce({
      data: { phase_timing: { classifier: { startedAt: "2026-03-01T10:00:00.000Z", completedAt: "2026-03-01T10:00:12.000Z", durationMs: 12000 } } },
      error: null,
    });
    // La 2a chiamata a eq() è il terminale del round trip update — deve restituire una promise
    mockSupabase.eq
      .mockReturnValueOnce(mockSupabase)  // prima chiamata: select chain → ritorna this (poi single() è il terminale)
      .mockResolvedValueOnce({ error: null }); // seconda chiamata: update chain → terminale

    const timing = {
      startedAt: "2026-03-01T10:01:00.000Z",
      completedAt: "2026-03-01T10:01:25.000Z",
      durationMs: 25000,
    };

    await savePhaseTiming("session-xyz", "analyzer", timing);

    // Deve aver chiamato select per leggere il timing corrente
    expect(mockSupabase.select).toHaveBeenCalledWith("phase_timing");

    // Deve aver chiamato update con il timing della fase analyzer incluso
    expect(mockSupabase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        phase_timing: expect.objectContaining({
          analyzer: timing,
        }),
      })
    );
  });

  it("non lancia se update fallisce (silent fail)", async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { phase_timing: {} }, error: null });
    mockSupabase.eq
      .mockReturnValueOnce(mockSupabase)          // select chain
      .mockResolvedValueOnce({ error: { message: "update failed" } }); // update chain terminale

    await expect(
      savePhaseTiming("session-abc", "advisor", {
        startedAt: "2026-03-01T10:02:00.000Z",
        completedAt: "2026-03-01T10:02:18.000Z",
        durationMs: 18000,
      })
    ).resolves.toBeUndefined();
  });

  it("inizializza phase_timing vuoto se non esiste in DB", async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });
    mockSupabase.eq
      .mockReturnValueOnce(mockSupabase)       // select chain
      .mockResolvedValueOnce({ error: null }); // update chain terminale

    const timing = {
      startedAt: "2026-03-01T10:03:00.000Z",
      completedAt: "2026-03-01T10:03:22.000Z",
      durationMs: 22000,
    };

    await savePhaseTiming("session-new", "investigator", timing);

    const updateArg = mockSupabase.update.mock.calls[0][0];
    expect(updateArg.phase_timing).toEqual({ investigator: timing });
  });
});

// ─── getAverageTimings ───
//
// In getAverageTimings, il metodo terminale della catena è limit(30) — non c'è maybeSingle/single dopo.
// Il mock di default ha limit mockReturnThis() (per supportare findSessionByDocument).
// Per questi test, sovrascriviamo limit per risolvere come terminale.

describe("getAverageTimings", () => {
  it("ritorna i valori default quando non ci sono sessioni storiche", async () => {
    mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null });

    const result = await getAverageTimings();

    expect(result.classifier).toBe(12);
    expect(result.analyzer).toBe(25);
    expect(result.investigator).toBe(22);
    expect(result.advisor).toBe(18);
  });

  it("ritorna i valori default in caso di errore supabase", async () => {
    mockSupabase.limit.mockResolvedValueOnce({ data: null, error: { message: "query failed" } });

    const result = await getAverageTimings();

    expect(result.classifier).toBe(12);
    expect(result.analyzer).toBe(25);
    expect(result.investigator).toBe(22);
    expect(result.advisor).toBe(18);
  });

  it("calcola la media corretta da sessioni con dati di timing", async () => {
    const sessions = [
      {
        phase_timing: {
          classifier: { startedAt: "", completedAt: "", durationMs: 10000 },
          analyzer: { startedAt: "", completedAt: "", durationMs: 20000 },
          investigator: { startedAt: "", completedAt: "", durationMs: 30000 },
          advisor: { startedAt: "", completedAt: "", durationMs: 15000 },
        },
      },
      {
        phase_timing: {
          classifier: { startedAt: "", completedAt: "", durationMs: 14000 },
          analyzer: { startedAt: "", completedAt: "", durationMs: 30000 },
          investigator: { startedAt: "", completedAt: "", durationMs: 10000 },
          advisor: { startedAt: "", completedAt: "", durationMs: 21000 },
        },
      },
    ];
    mockSupabase.limit.mockResolvedValueOnce({ data: sessions, error: null });

    const result = await getAverageTimings();

    // classifier: (10 + 14) / 2 = 12
    expect(result.classifier).toBe(12);
    // analyzer: (20 + 30) / 2 = 25
    expect(result.analyzer).toBe(25);
    // investigator: (30 + 10) / 2 = 20
    expect(result.investigator).toBe(20);
    // advisor: (15 + 21) / 2 = 18
    expect(result.advisor).toBe(18);
  });

  it("usa il default per fasi senza dati storici", async () => {
    const sessions = [
      {
        phase_timing: {
          // Solo classifier, le altre fasi mancano
          classifier: { startedAt: "", completedAt: "", durationMs: 8000 },
        },
      },
    ];
    mockSupabase.limit.mockResolvedValueOnce({ data: sessions, error: null });

    const result = await getAverageTimings();

    expect(result.classifier).toBe(8);    // calcolato dalla sessione
    expect(result.analyzer).toBe(25);     // default
    expect(result.investigator).toBe(22); // default
    expect(result.advisor).toBe(18);      // default
  });

  it("ignora fasi con durationMs = 0", async () => {
    const sessions = [
      {
        phase_timing: {
          classifier: { startedAt: "", completedAt: "", durationMs: 0 }, // ignorato
          analyzer: { startedAt: "", completedAt: "", durationMs: 20000 },
        },
      },
    ];
    mockSupabase.limit.mockResolvedValueOnce({ data: sessions, error: null });

    const result = await getAverageTimings();

    expect(result.classifier).toBe(12); // default, perché 0 è ignorato
    expect(result.analyzer).toBe(20);
  });
});
