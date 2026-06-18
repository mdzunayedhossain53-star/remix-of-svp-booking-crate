// Regression tests for auto-reveal-cache-misses.ts
//
// Verifies:
//   1. sessionStorage guard prevents re-running in same tab
//   2. Cache hits in revealed_test_centers are filtered out
//   3. Hard cap at MAX_REVEALS_PER_SESSION
//   4. SVP 422 cooldown short-circuits the loop
//   5. Successful reveals trigger setCachedCenter (both layers)
//
// All network is mocked (api + supabase).

import { describe, it, expect, beforeEach, vi } from "vitest";

const apiMock = vi.fn();
vi.mock("@/lib/api", () => ({ api: (...args: unknown[]) => apiMock(...args) }));

const supabaseFromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => supabaseFromMock(...args) },
}));

const setCachedMock = vi.fn();
vi.mock("@/lib/revealed-centers-cache", () => ({
  setCachedCenter: (...args: unknown[]) => setCachedMock(...args),
}));

import {
  autoRevealMissingCenters,
  revealOneCandidate,
  MAX_REVEALS_PER_SESSION,
  _internal,
} from "@/lib/auto-reveal-cache-misses";

function realCentreReservationResponse(centerId: string, name = "Bangladesh German TTC") {
  return {
    id: 4327989,
    test_center: {
      test_center_id: centerId,
      test_center_name: name,
      address: "Mirpur -2, Dhaka 1216",
      test_center_city: "Dhaka",
    },
  };
}

beforeEach(() => {
  apiMock.mockReset();
  supabaseFromMock.mockReset();
  setCachedMock.mockReset();
  globalThis.localStorage?.clear?.();
  globalThis.sessionStorage?.clear?.();
  // Default Supabase responder — no existing keys
  supabaseFromMock.mockImplementation(() => ({
    select: () => ({ in: async () => ({ data: [], error: null }) }),
  }));
  // Speed: don't actually wait 10s between reveals in tests
  vi.useFakeTimers();
});

describe("autoRevealMissingCenters", () => {
  it("returns session_already_ran on second invocation in the same tab", async () => {
    apiMock.mockResolvedValueOnce({ occupations: [] });
    const first = await autoRevealMissingCenters();
    expect(first.stoppedReason).toBe("no_candidates");
    // sessionStorage flag is set even when result has no candidates
    const second = await autoRevealMissingCenters();
    expect(second.stoppedReason).toBe("session_already_ran");
    expect(second.attempted).toBe(0);
  });

  it("returns no_token if occupations fetch fails", async () => {
    apiMock.mockRejectedValueOnce(new Error("401 unauthorized"));
    const r = await autoRevealMissingCenters();
    expect(r.stoppedReason).toBe("no_token");
    expect(r.attempted).toBe(0);
  });

  it("hard-caps attempts at MAX_REVEALS_PER_SESSION even when more cache misses exist", async () => {
    // 20 categories, each with 1 date — generates 20 misses, cap = 15
    const occs = Array.from({ length: 20 }, (_, i) => ({
      id: 1000 + i,
      category: { id: i + 1, prometric_codes: [{ code: "OFFII" }] },
    }));
    apiMock.mockResolvedValueOnce({ occupations: occs }); // /occupations
    // 20 × /available-dates calls, each returns 1 (city, date)
    occs.forEach(() => {
      apiMock.mockResolvedValueOnce({
        exam_sessions: [{ city: "Dhaka", start_date_in_browser_time_zone: "2026-07-01" }],
      });
    });
    // For each of the 15 attempts: /exam-sessions then /temporary-seats then /exam-reservations
    for (let i = 0; i < MAX_REVEALS_PER_SESSION; i++) {
      apiMock.mockResolvedValueOnce({ exam_sessions: [{ id: `enc-${i}` }] });
      apiMock.mockResolvedValueOnce({ id: 99999 }); // hold
      apiMock.mockResolvedValueOnce(realCentreReservationResponse(`c-${i}`));
    }
    const promise = autoRevealMissingCenters();
    // Fast-forward the 10s delays
    await vi.runAllTimersAsync();
    const r = await promise;
    expect(r.attempted).toBe(MAX_REVEALS_PER_SESSION);
    expect(r.succeeded).toBe(MAX_REVEALS_PER_SESSION);
    expect(setCachedMock).toHaveBeenCalledTimes(MAX_REVEALS_PER_SESSION);
    // First setCachedCenter must use the cat-X|city-dhaka|... key
    const firstCall = setCachedMock.mock.calls[0];
    expect(firstCall[0]).toMatch(/^cat-\d+\|city-dhaka\|date-2026-07-01$/);
  });

  it("filters out cache hits before reveal", async () => {
    apiMock.mockResolvedValueOnce({
      occupations: [{ id: 100, category: { id: 5, prometric_codes: [{ code: "OFFII" }] } }],
    });
    apiMock.mockResolvedValueOnce({
      exam_sessions: [{ city: "Dhaka", start_date_in_browser_time_zone: "2026-07-01" }],
    });
    // Supabase says this key is already cached
    supabaseFromMock.mockImplementation(() => ({
      select: () => ({
        in: async (_col: string, keys: string[]) => ({
          data: keys.map((k) => ({ exam_session_id: k })),
          error: null,
        }),
      }),
    }));
    const r = await autoRevealMissingCenters();
    expect(r.stoppedReason).toBe("no_candidates");
    expect(r.attempted).toBe(0);
    // /exam-sessions must NOT have been called (no reveal attempted)
    const reservationCalls = apiMock.mock.calls.filter((c) => String(c[0]).startsWith("/exam-reservations"));
    expect(reservationCalls).toHaveLength(0);
  });

  it("stops on first SVP 422 cooldown", async () => {
    apiMock.mockResolvedValueOnce({
      occupations: [
        { id: 100, category: { id: 5, prometric_codes: [{ code: "OFFII" }] } },
        { id: 200, category: { id: 6, prometric_codes: [{ code: "OFFII" }] } },
      ],
    });
    apiMock.mockResolvedValueOnce({
      exam_sessions: [{ city: "Dhaka", start_date_in_browser_time_zone: "2026-07-01" }],
    });
    apiMock.mockResolvedValueOnce({
      exam_sessions: [{ city: "Chattogram", start_date_in_browser_time_zone: "2026-07-02" }],
    });
    // First candidate: /exam-sessions OK, /temporary-seats OK, /exam-reservations → 422
    apiMock.mockResolvedValueOnce({ exam_sessions: [{ id: "enc-1" }] });
    apiMock.mockResolvedValueOnce({ id: 1 });
    const err422: any = new Error("Try again in 10 minutes");
    err422.status = 422;
    apiMock.mockRejectedValueOnce(err422);

    const promise = autoRevealMissingCenters();
    await vi.runAllTimersAsync();
    const r = await promise;
    expect(r.stoppedReason).toBe("rate_limit");
    expect(r.attempted).toBe(2);
    expect(r.succeeded).toBe(0);
    // Should have stopped before calling /exam-sessions for the 2nd category
    const examSessionCalls = apiMock.mock.calls.filter((c) => String(c[0]).startsWith("/exam-sessions?"));
    expect(examSessionCalls).toHaveLength(1);
  });
});

describe("_internal helpers", () => {
  it("buildCacheKey lowercases city", () => {
    expect(_internal.buildCacheKey(42, "Dhaka", "2026-07-01")).toBe("cat-42|city-dhaka|date-2026-07-01");
    expect(_internal.buildCacheKey("99", "CHATTOGRAM", "2026-08-15")).toBe("cat-99|city-chattogram|date-2026-08-15");
  });

  it("pickFirstOccPerCategory dedupes by category id", () => {
    const occs = [
      { id: 1, category: { id: 10 } },
      { id: 2, category: { id: 10 } }, // duplicate cat
      { id: 3, category: { id: 11 } },
      { id: 4 }, // no cat — skipped
    ];
    const map = _internal.pickFirstOccPerCategory(occs);
    expect(map.size).toBe(2);
    expect(map.get("10")?.id).toBe(1);
    expect(map.get("11")?.id).toBe(3);
  });

  it("extractCityDatePairs dedupes (city, date)", () => {
    const pairs = _internal.extractCityDatePairs({
      exam_sessions: [
        { city: "Dhaka", start_date_in_browser_time_zone: "2026-07-01" },
        { city: "Dhaka", start_date_in_browser_time_zone: "2026-07-01" }, // dup
        { city: "Chattogram", exam_date: "2026-07-02" },
        { city: "", start_at_date: "2026-07-03" }, // empty city — skipped
      ],
    });
    expect(pairs).toEqual([
      { city: "Dhaka", date: "2026-07-01" },
      { city: "Chattogram", date: "2026-07-02" },
    ]);
  });

  it("extractLanguageCode prefers prometric_codes[0].code, falls back to OFFII", () => {
    expect(_internal.extractLanguageCode({ category: { prometric_codes: [{ code: "BNGLA" }] } })).toBe("BNGLA");
    expect(_internal.extractLanguageCode({})).toBe("OFFII");
  });
});
