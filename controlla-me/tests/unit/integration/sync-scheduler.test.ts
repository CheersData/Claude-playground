/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests: Sync Scheduler — Polling-based sync for connectors.
 *
 * Covers:
 * - getEffectivePollInterval (default, override, unknown connector)
 * - getNextSyncTime (with/without backoff, null lastSync)
 * - runSyncScheduler happy path (sync triggered)
 * - Overlap prevention (skip if already syncing)
 * - Exponential backoff on consecutive failures
 * - Connection marked "error" after MAX_RETRIES (3)
 * - Reset on success (consecutive_failures cleared)
 * - No connections returns early
 * - Missing credentials skips connection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock external dependencies BEFORE importing the module ───

// Mock credential vault
const mockGetCredential = vi.fn();
const mockVault = { getCredential: mockGetCredential };

vi.mock("@/lib/credential-vault", () => ({
  getVaultOrNull: vi.fn(() => mockVault),
}));

// Mock sync dispatcher
const mockExecuteFullSync = vi.fn();
const mockHasSyncHandler = vi.fn().mockReturnValue(true);

vi.mock("@/lib/staff/data-connector/sync-dispatcher", () => ({
  executeFullSync: (...args: any[]) => mockExecuteFullSync(...args),
  hasSyncHandler: (...args: any[]) => mockHasSyncHandler(...args),
}));

// Mock Supabase admin client
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();

// Build a fluent query mock that supports chaining
function makeMockQuery(data: any[] | null = [], error: any = null) {
  const obj: any = {};
  // Terminal methods
  obj.select = vi.fn().mockReturnValue(obj);
  obj.insert = vi.fn().mockReturnValue(obj);
  obj.update = vi.fn().mockReturnValue(obj);
  obj.eq = vi.fn().mockReturnValue(obj);
  obj.in = vi.fn().mockReturnValue(obj);
  obj.order = vi.fn().mockReturnValue(obj);
  obj.limit = vi.fn().mockReturnValue(obj);
  obj.single = vi.fn().mockResolvedValue({ data: data?.[0] ?? null, error });
  obj.maybeSingle = vi.fn().mockResolvedValue({ data: data?.[0] ?? null, error });
  // For queries that resolve to arrays
  obj.then = undefined; // Remove default thenable
  // Override the final resolution based on chaining
  return obj;
}

const mockFrom = vi.fn();
const mockAdmin = { from: mockFrom };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdmin,
}));

// Import after mocks
import {
  runSyncScheduler,
  getEffectivePollInterval,
  getNextSyncTime,
} from "@/lib/staff/data-connector/sync-scheduler";
import { getVaultOrNull } from "@/lib/credential-vault";

// ─── Setup ───

const silentLog = () => {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-17T12:00:00Z"));

  // Default: vault available
  vi.mocked(getVaultOrNull).mockReturnValue(mockVault as any);

  // Default: getCredential returns valid token
  mockGetCredential.mockResolvedValue({
    access_token: "test-access-token",
  });

  // Default: executeFullSync succeeds
  mockExecuteFullSync.mockResolvedValue({
    itemsFetched: 5,
    itemsMapped: 3,
    persist: { stored: 5, failed: 0, errors: [] },
    analysisResults: [],
    analysisSkipped: 0,
    notified: true,
    durationMs: 1200,
    stageDurations: { fetchMs: 500, mapMs: 200, persistMs: 300, analyzeMs: 0, indexMs: 0 },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// getEffectivePollInterval
// =============================================================================

describe("getEffectivePollInterval", () => {
  it("returns default interval for known connectors", () => {
    expect(getEffectivePollInterval("google-drive")).toBe(15);
    expect(getEffectivePollInterval("hubspot")).toBe(30);
    expect(getEffectivePollInterval("stripe")).toBe(60);
  });

  it("returns 15 as fallback for unknown connectors", () => {
    expect(getEffectivePollInterval("unknown-connector")).toBe(15);
  });

  it("uses connection override when provided", () => {
    expect(getEffectivePollInterval("google-drive", 45)).toBe(45);
    expect(getEffectivePollInterval("hubspot", 10)).toBe(10);
  });

  it("ignores null or zero overrides", () => {
    expect(getEffectivePollInterval("google-drive", null)).toBe(15);
    expect(getEffectivePollInterval("google-drive", 0)).toBe(15);
  });
});

// =============================================================================
// getNextSyncTime
// =============================================================================

describe("getNextSyncTime", () => {
  it("returns now when lastSyncAt is null (never synced)", () => {
    const result = getNextSyncTime(null, "hubspot", 0);
    expect(result).not.toBeNull();
    // Should be approximately now
    const diff = Math.abs(new Date(result!).getTime() - Date.now());
    expect(diff).toBeLessThan(1000);
  });

  it("returns lastSync + interval when no failures", () => {
    const lastSync = "2026-03-17T11:30:00Z";
    const result = getNextSyncTime(lastSync, "hubspot", 0);
    // hubspot default is 30 min → next sync at 12:00
    const expected = new Date("2026-03-17T12:00:00Z").toISOString();
    expect(result).toBe(expected);
  });

  it("applies backoff multiplier for consecutive failures", () => {
    const lastSync = "2026-03-17T11:30:00Z";
    const lastSyncMs = new Date(lastSync).getTime();

    // BACKOFF_MULTIPLIERS = [1, 2, 4, 8]
    // For failures > 0: backoffIndex = Math.min(failures, length-1)
    //   failures=1 → index=1 → multiplier=2
    //   failures=2 → index=2 → multiplier=4
    //   failures=3 → index=3 → multiplier=8

    // Failure 1 → multiplier 2 (BACKOFF_MULTIPLIERS[1])
    const next1 = getNextSyncTime(lastSync, "hubspot", 1);
    expect(new Date(next1!).getTime()).toBe(lastSyncMs + 30 * 60 * 1000 * 2);

    // Failure 2 → multiplier 4 (BACKOFF_MULTIPLIERS[2])
    const next2 = getNextSyncTime(lastSync, "hubspot", 2);
    expect(new Date(next2!).getTime()).toBe(lastSyncMs + 30 * 60 * 1000 * 4);

    // Failure 3 → multiplier 8 (BACKOFF_MULTIPLIERS[3])
    const next3 = getNextSyncTime(lastSync, "hubspot", 3);
    expect(new Date(next3!).getTime()).toBe(lastSyncMs + 30 * 60 * 1000 * 8);
  });

  it("uses per-connection override interval", () => {
    const lastSync = "2026-03-17T11:00:00Z";
    const result = getNextSyncTime(lastSync, "hubspot", 0, 60);
    // 60 minutes override → next at 12:00
    const expected = new Date("2026-03-17T12:00:00Z").toISOString();
    expect(result).toBe(expected);
  });
});

// =============================================================================
// runSyncScheduler — happy path
// =============================================================================

describe("runSyncScheduler — happy path", () => {
  function setupActiveConnections(connections: any[]) {
    // First call to from("integration_connections") → select query
    const connectionsQuery = makeMockQuery();
    // Override the chain terminal to return connections
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "integration_connections") {
        callCount++;
        if (callCount === 1) {
          // SELECT query for active connections
          const q = makeMockQuery();
          // The chain eventually resolves. We simulate by making `limit` resolve
          q.limit = vi.fn().mockResolvedValue({ data: connections, error: null });
          return q;
        }
        // UPDATE after sync
        const updateQ = makeMockQuery();
        updateQ.update = vi.fn().mockReturnValue(updateQ);
        return updateQ;
      }
      if (table === "integration_sync_log") {
        const syncQ = makeMockQuery();
        syncQ.insert = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "sync-log-1" }, error: null }),
          }),
        });
        syncQ.update = vi.fn().mockReturnValue(syncQ);
        syncQ.eq = vi.fn().mockReturnValue(syncQ);
        // Overlap check: no running syncs
        syncQ.limit = vi.fn().mockResolvedValue({ data: [], error: null });
        return syncQ;
      }
      return makeMockQuery();
    });
  }

  it("syncs a connection that is due", async () => {
    setupActiveConnections([
      {
        id: "conn-1",
        user_id: "user-1",
        connector_type: "hubspot",
        status: "active",
        config: {},
        last_sync_at: null, // Never synced → always due
        consecutive_failures: 0,
        poll_interval_minutes: null,
      },
    ]);

    const result = await runSyncScheduler({ log: silentLog });

    expect(result.connectionsChecked).toBe(1);
    expect(result.connectionsSynced).toBe(1);
    expect(mockExecuteFullSync).toHaveBeenCalledTimes(1);
  });

  it("returns early when vault is not available", async () => {
    vi.mocked(getVaultOrNull).mockReturnValue(null);

    const result = await runSyncScheduler({ log: silentLog });

    expect(result.connectionsChecked).toBe(0);
    expect(mockExecuteFullSync).not.toHaveBeenCalled();
  });

  it("returns early when no active connections exist", async () => {
    mockFrom.mockImplementation(() => {
      const q = makeMockQuery();
      q.limit = vi.fn().mockResolvedValue({ data: [], error: null });
      return q;
    });

    const result = await runSyncScheduler({ log: silentLog });

    expect(result.connectionsChecked).toBe(0);
    expect(result.connectionsSynced).toBe(0);
  });

  it("resets consecutive_failures on successful sync", async () => {
    const updateCalls: any[] = [];

    let fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "integration_connections") {
        fromCallCount++;
        if (fromCallCount === 1) {
          const q = makeMockQuery();
          q.limit = vi.fn().mockResolvedValue({
            data: [{
              id: "conn-1",
              user_id: "user-1",
              connector_type: "hubspot",
              status: "error_retry",
              config: {},
              last_sync_at: null,
              consecutive_failures: 2,
              poll_interval_minutes: null,
            }],
            error: null,
          });
          return q;
        }
        // Update call
        const updateQ = makeMockQuery();
        updateQ.update = vi.fn().mockImplementation((data: any) => {
          updateCalls.push(data);
          return updateQ;
        });
        return updateQ;
      }
      if (table === "integration_sync_log") {
        const syncQ = makeMockQuery();
        syncQ.insert = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "sl-1" }, error: null }),
          }),
        });
        syncQ.limit = vi.fn().mockResolvedValue({ data: [], error: null });
        return syncQ;
      }
      return makeMockQuery();
    });

    await runSyncScheduler({ log: silentLog, forceSyncAll: true });

    // Check that one of the update calls set consecutive_failures to 0
    const resetCall = updateCalls.find((c) => c.consecutive_failures === 0);
    expect(resetCall).toBeDefined();
    expect(resetCall.status).toBe("active");
  });
});

// =============================================================================
// runSyncScheduler — overlap prevention
// =============================================================================

describe("runSyncScheduler — overlap prevention", () => {
  it("skips connection if a sync is already running", async () => {
    let fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "integration_connections") {
        fromCallCount++;
        if (fromCallCount === 1) {
          const q = makeMockQuery();
          q.limit = vi.fn().mockResolvedValue({
            data: [{
              id: "conn-overlap",
              user_id: "user-1",
              connector_type: "hubspot",
              status: "active",
              config: {},
              last_sync_at: null,
              consecutive_failures: 0,
              poll_interval_minutes: null,
            }],
            error: null,
          });
          return q;
        }
        return makeMockQuery();
      }
      if (table === "integration_sync_log") {
        const syncQ = makeMockQuery();
        // Return a running sync → overlap detection
        syncQ.limit = vi.fn().mockResolvedValue({
          data: [{ id: "running-sync-1" }],
          error: null,
        });
        return syncQ;
      }
      return makeMockQuery();
    });

    const result = await runSyncScheduler({ log: silentLog });

    expect(result.connectionsSkipped).toBe(1);
    expect(result.connectionsSynced).toBe(0);
    expect(mockExecuteFullSync).not.toHaveBeenCalled();

    const skipDetail = result.details.find((d) => d.action === "skipped");
    expect(skipDetail?.reason).toContain("in corso");
  });
});

// =============================================================================
// runSyncScheduler — failure handling
// =============================================================================

describe("runSyncScheduler — failure handling", () => {
  function setupWithFailure(consecutiveFailures: number) {
    let fromCallCount = 0;
    const updateCalls: any[] = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === "integration_connections") {
        fromCallCount++;
        if (fromCallCount === 1) {
          const q = makeMockQuery();
          q.limit = vi.fn().mockResolvedValue({
            data: [{
              id: "conn-fail",
              user_id: "user-1",
              connector_type: "hubspot",
              status: consecutiveFailures > 0 ? "error_retry" : "active",
              config: {},
              last_sync_at: null,
              consecutive_failures: consecutiveFailures,
              poll_interval_minutes: null,
            }],
            error: null,
          });
          return q;
        }
        // Update
        const updateQ = makeMockQuery();
        updateQ.update = vi.fn().mockImplementation((data: any) => {
          updateCalls.push(data);
          return updateQ;
        });
        return updateQ;
      }
      if (table === "integration_sync_log") {
        const syncQ = makeMockQuery();
        syncQ.insert = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "sl-1" }, error: null }),
          }),
        });
        syncQ.limit = vi.fn().mockResolvedValue({ data: [], error: null });
        return syncQ;
      }
      return makeMockQuery();
    });

    return updateCalls;
  }

  it("increments consecutive_failures on sync error", async () => {
    const updateCalls = setupWithFailure(1);
    mockExecuteFullSync.mockResolvedValue({
      itemsFetched: 0,
      itemsMapped: 0,
      fetchError: "Connection refused",
      persist: { stored: 0, failed: 0, errors: [] },
      analysisResults: [],
      analysisSkipped: 0,
      notified: false,
      durationMs: 100,
      stageDurations: { fetchMs: 100, mapMs: 0, persistMs: 0, analyzeMs: 0, indexMs: 0 },
    });

    const result = await runSyncScheduler({ log: silentLog, forceSyncAll: true });

    expect(result.connectionsFailed).toBe(1);
    const failCall = updateCalls.find((c) => c.consecutive_failures === 2);
    expect(failCall).toBeDefined();
    expect(failCall.status).toBe("error_retry");
  });

  it("marks connection as 'error' after exceeding MAX_RETRIES (3)", async () => {
    const updateCalls = setupWithFailure(3); // Already at 3 failures
    mockExecuteFullSync.mockResolvedValue({
      itemsFetched: 0,
      fetchError: "API unavailable",
      persist: { stored: 0, failed: 0, errors: [] },
      analysisResults: [],
      analysisSkipped: 0,
      notified: false,
      durationMs: 50,
      stageDurations: { fetchMs: 50, mapMs: 0, persistMs: 0, analyzeMs: 0, indexMs: 0 },
    });

    const result = await runSyncScheduler({ log: silentLog, forceSyncAll: true });

    expect(result.connectionsErrored).toBe(1);
    const errorCall = updateCalls.find((c) => c.status === "error");
    expect(errorCall).toBeDefined();
    expect(errorCall.consecutive_failures).toBe(4);
  });

  it("handles executeFullSync throwing an exception", async () => {
    const updateCalls = setupWithFailure(0);
    mockExecuteFullSync.mockRejectedValue(new Error("Network timeout"));

    const result = await runSyncScheduler({ log: silentLog, forceSyncAll: true });

    expect(result.connectionsFailed).toBe(1);
    const detail = result.details[0];
    expect(detail.action).toBe("failed");
    expect(detail.error).toContain("Network timeout");
  });

  it("skips connection when credentials are not found", async () => {
    mockGetCredential.mockResolvedValue(null);

    let fromCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "integration_connections") {
        fromCallCount++;
        if (fromCallCount === 1) {
          const q = makeMockQuery();
          q.limit = vi.fn().mockResolvedValue({
            data: [{
              id: "conn-no-creds",
              user_id: "user-1",
              connector_type: "hubspot",
              status: "active",
              config: {},
              last_sync_at: null,
              consecutive_failures: 0,
              poll_interval_minutes: null,
            }],
            error: null,
          });
          return q;
        }
        return makeMockQuery();
      }
      if (table === "integration_sync_log") {
        const syncQ = makeMockQuery();
        syncQ.limit = vi.fn().mockResolvedValue({ data: [], error: null });
        return syncQ;
      }
      return makeMockQuery();
    });

    const result = await runSyncScheduler({ log: silentLog });

    expect(result.connectionsSkipped).toBe(1);
    expect(mockExecuteFullSync).not.toHaveBeenCalled();
    expect(result.details[0].reason).toContain("Credenziali");
  });
});
