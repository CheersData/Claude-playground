/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests: Notification Service — CRUD for integration_notifications table.
 *
 * Covers:
 * - createNotification (success, failure, defaults)
 * - listNotifications (filters: unread, type, since, limit)
 * - getNotificationSummary (badge counts by severity)
 * - markAsRead (single, batch)
 * - markAllAsRead
 * - deleteNotification (success, not found)
 *
 * All Supabase calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Supabase admin client ───

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

// Import after mocks
import {
  createNotification,
  listNotifications,
  getNotificationSummary,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "@/lib/notifications";

// ─── Helper to build fluent mock chain ───
//
// Supabase query builder uses chaining: .from().select().eq().order().limit()
// Each method returns the builder itself. The final resolution happens via
// `.then()` which is called by `await`. We simulate this by making the chain
// a thenable (implementing .then) that resolves to the terminal result.
//
// IMPORTANT: In the real Supabase client, ALL builder methods return the same
// builder. So .limit() returns the builder (not a promise), and you can still
// call .is(), .eq(), .gte() after .limit(). The `await` at the end triggers
// `.then()` which resolves to the terminal result.

function mockChain(terminalResult: { data: any; error: any }) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(terminalResult);
  chain.maybeSingle = vi.fn().mockResolvedValue(terminalResult);
  // Make chain thenable so `await query` resolves to terminalResult
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(terminalResult).then(resolve, reject);
  return chain;
}

// ─── Setup ───

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// createNotification
// =============================================================================

describe("createNotification", () => {
  it("creates a notification and returns the ID", async () => {
    const chain = mockChain({ data: { id: "notif-123" }, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await createNotification({
      userId: "user-1",
      type: "auto_analysis_complete",
      title: "Analisi completata",
      message: "Il documento contract.pdf e stato analizzato",
    });

    expect(result).toBe("notif-123");
    expect(mockFrom).toHaveBeenCalledWith("integration_notifications");
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      type: "auto_analysis_complete",
      title: "Analisi completata",
      message: "Il documento contract.pdf e stato analizzato",
      severity: "info", // default
      data: {}, // default
    });
  });

  it("uses provided severity and data", async () => {
    const chain = mockChain({ data: { id: "notif-456" }, error: null });
    mockFrom.mockReturnValue(chain);

    await createNotification({
      userId: "user-1",
      type: "sync_error",
      title: "Sync fallita",
      message: "Errore di connessione",
      severity: "error",
      data: { connectorId: "hubspot", errorCode: 500 },
    });

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        data: { connectorId: "hubspot", errorCode: 500 },
      })
    );
  });

  it("returns null on database error", async () => {
    const chain = mockChain({ data: null, error: { message: "DB error" } });
    mockFrom.mockReturnValue(chain);

    const result = await createNotification({
      userId: "user-1",
      type: "auto_analysis_complete",
      title: "Test",
      message: "Test message",
    });

    expect(result).toBeNull();
  });
});

// =============================================================================
// listNotifications
// =============================================================================

describe("listNotifications", () => {
  it("returns all notifications for a user by default", async () => {
    const notifications = [
      { id: "n1", user_id: "user-1", type: "sync_complete", title: "Sync OK", read_at: null },
      { id: "n2", user_id: "user-1", type: "auto_analysis_complete", title: "Analisi OK", read_at: "2026-01-01" },
    ];

    const chain = mockChain({ data: notifications, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await listNotifications("user-1");

    expect(result).toHaveLength(2);
    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("filters unread only when specified", async () => {
    const chain = mockChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await listNotifications("user-1", { unreadOnly: true });

    expect(chain.is).toHaveBeenCalledWith("read_at", null);
  });

  it("filters by type when specified", async () => {
    const chain = mockChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await listNotifications("user-1", { type: "sync_error" });

    // Should call .eq("type", "sync_error") in addition to .eq("user_id", ...)
    const eqCalls = chain.eq.mock.calls;
    expect(eqCalls.some((call: any[]) => call[0] === "type" && call[1] === "sync_error")).toBe(true);
  });

  it("filters by since date when specified", async () => {
    const chain = mockChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await listNotifications("user-1", { since: "2026-03-01T00:00:00Z" });

    expect(chain.gte).toHaveBeenCalledWith("created_at", "2026-03-01T00:00:00Z");
  });

  it("respects limit parameter", async () => {
    const chain = mockChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await listNotifications("user-1", { limit: 10 });

    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it("uses default limit of 50 when no limit specified", async () => {
    const chain = mockChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await listNotifications("user-1");

    expect(chain.limit).toHaveBeenCalledWith(50);
  });

  it("passes large limit directly (no service-level cap)", async () => {
    const chain = mockChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await listNotifications("user-1", { limit: 500 });

    // listNotifications passes limit directly to Supabase; capping is done at the API route level
    expect(chain.limit).toHaveBeenCalledWith(500);
  });

  it("returns empty array on error", async () => {
    const chain = mockChain({ data: null, error: { message: "Query failed" } });
    mockFrom.mockReturnValue(chain);

    const result = await listNotifications("user-1");

    expect(result).toEqual([]);
  });
});

// =============================================================================
// getNotificationSummary
// =============================================================================

describe("getNotificationSummary", () => {
  it("returns correct badge counts by severity", async () => {
    const notifications = [
      { id: "n1", severity: "info", read_at: null },
      { id: "n2", severity: "warning", read_at: null },
      { id: "n3", severity: "warning", read_at: null },
      { id: "n4", severity: "error", read_at: null },
      { id: "n5", severity: "info", read_at: "2026-01-01" }, // already read
    ];

    const chain = mockChain({ data: notifications, error: null });
    mockFrom.mockReturnValue(chain);

    const summary = await getNotificationSummary("user-1");

    expect(summary.total).toBe(5);
    expect(summary.unread).toBe(4);
    expect(summary.bySeverity.info).toBe(1); // Only unread info
    expect(summary.bySeverity.warning).toBe(2);
    expect(summary.bySeverity.error).toBe(1);
  });

  it("returns zero counts when no notifications exist", async () => {
    const chain = mockChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const summary = await getNotificationSummary("user-1");

    expect(summary.total).toBe(0);
    expect(summary.unread).toBe(0);
    expect(summary.bySeverity).toEqual({ info: 0, warning: 0, error: 0 });
  });

  it("returns zero counts on error", async () => {
    const chain = mockChain({ data: null, error: { message: "DB down" } });
    mockFrom.mockReturnValue(chain);

    const summary = await getNotificationSummary("user-1");

    expect(summary.total).toBe(0);
    expect(summary.unread).toBe(0);
  });
});

// =============================================================================
// markAsRead
// =============================================================================

describe("markAsRead", () => {
  it("calls RPC with correct parameters", async () => {
    mockRpc.mockResolvedValue({ data: 3, error: null });

    const count = await markAsRead("user-1", ["n1", "n2", "n3"]);

    expect(count).toBe(3);
    expect(mockRpc).toHaveBeenCalledWith("mark_notifications_read", {
      p_user_id: "user-1",
      p_notification_ids: ["n1", "n2", "n3"],
    });
  });

  it("returns 0 for empty array", async () => {
    const count = await markAsRead("user-1", []);

    expect(count).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 0 on RPC error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "RPC failed" } });

    const count = await markAsRead("user-1", ["n1"]);

    expect(count).toBe(0);
  });
});

// =============================================================================
// markAllAsRead
// =============================================================================

describe("markAllAsRead", () => {
  it("fetches unread notifications and marks them", async () => {
    // markAllAsRead calls: from().select("id").eq("user_id", ...).is("read_at", null) → await
    // The chain's .then() resolves to the terminal result with unread IDs.
    const unreadData = [{ id: "n1" }, { id: "n2" }];
    const chain = mockChain({ data: unreadData, error: null });
    mockFrom.mockReturnValue(chain);

    // markAsRead RPC call (second call inside markAllAsRead)
    mockRpc.mockResolvedValue({ data: 2, error: null });

    const count = await markAllAsRead("user-1");

    expect(count).toBe(2);
    expect(chain.is).toHaveBeenCalledWith("read_at", null);
    expect(mockRpc).toHaveBeenCalledWith("mark_notifications_read", {
      p_user_id: "user-1",
      p_notification_ids: ["n1", "n2"],
    });
  });

  it("returns 0 when no unread notifications exist", async () => {
    const chain = mockChain({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const count = await markAllAsRead("user-1");

    expect(count).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

// =============================================================================
// deleteNotification
// =============================================================================

describe("deleteNotification", () => {
  it("deletes a notification and returns true", async () => {
    // delete().eq("id", x).eq("user_id", y) → await resolves via .then()
    const chain = mockChain({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await deleteNotification("user-1", "notif-to-delete");

    expect(result).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("integration_notifications");
    expect(chain.delete).toHaveBeenCalled();
    const eqCalls = chain.eq.mock.calls;
    expect(eqCalls.some((call: any[]) => call[0] === "id" && call[1] === "notif-to-delete")).toBe(true);
    expect(eqCalls.some((call: any[]) => call[0] === "user_id" && call[1] === "user-1")).toBe(true);
  });

  it("returns false on error", async () => {
    const chain = mockChain({ data: null, error: { message: "Not found" } });
    mockFrom.mockReturnValue(chain);

    const result = await deleteNotification("user-1", "nonexistent-id");

    expect(result).toBe(false);
  });
});
