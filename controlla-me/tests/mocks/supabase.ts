import { vi } from "vitest";

export function makeMockSupabaseClient(
  profileOverrides?: Record<string, unknown>
) {
  const profile = {
    plan: "free",
    analyses_count: 0,
    ...profileOverrides,
  };

  const singleFn = vi.fn().mockResolvedValue({ data: profile, error: null });
  const eqFn = vi.fn().mockReturnValue({ single: singleFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn });
  const fromFn = vi.fn().mockReturnValue({ select: selectFn });

  const getUser = vi.fn().mockResolvedValue({
    data: { user: { id: "user-123" } },
    error: null,
  });

  return {
    from: fromFn,
    auth: { getUser },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}
