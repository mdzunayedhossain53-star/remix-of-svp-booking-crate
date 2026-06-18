// Tests for revealed-centers-cache localStorage + Supabase fallback.
// The Supabase client is mocked so we exercise the layered lookup logic
// without touching the network.

import { describe, it, expect, beforeEach, vi } from "vitest";

const supabaseFromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => supabaseFromMock(...args) },
}));

import {
  getLocalCached,
  setLocalCached,
  getCachedCenter,
  setCachedCenter,
} from "@/lib/revealed-centers-cache";

function freshCentre(over: Partial<{ name: string; id: string; address: string; city: string; revealedAt: string }> = {}) {
  return {
    name: "Bangladesh German TTC",
    id: "45",
    address: "Mirpur -2, Dhaka 1216, Bangladesh",
    city: "Dhaka",
    revealedAt: new Date().toISOString(),
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  supabaseFromMock.mockReset();
});

describe("revealed-centers-cache: localStorage layer", () => {
  it("round-trips a centre under its session id", () => {
    const sid = "1556652";
    setLocalCached(sid, freshCentre());
    const got = getLocalCached(sid);
    expect(got?.id).toBe("45");
    expect(got?.name).toBe("Bangladesh German TTC");
    expect(got?.source).toBe("local");
  });

  it("returns null for unknown session ids", () => {
    expect(getLocalCached("does-not-exist")).toBeNull();
  });

  it("rejects entries older than the 30-day TTL", () => {
    const stale = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    setLocalCached("old", freshCentre({ revealedAt: stale }));
    expect(getLocalCached("old")).toBeNull();
  });

  it("ignores empty session ids on read AND write", () => {
    setLocalCached("", freshCentre());
    setLocalCached("   ", freshCentre());
    expect(getLocalCached("")).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("survives JSON corruption gracefully", () => {
    localStorage.setItem("revealed_test_center::corrupt", "{not json");
    expect(getLocalCached("corrupt")).toBeNull();
  });
});

describe("revealed-centers-cache: layered getCachedCenter", () => {
  it("returns the localStorage value without hitting Supabase", async () => {
    setLocalCached("S1", freshCentre());
    const got = await getCachedCenter("S1");
    expect(got?.source).toBe("local");
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it("falls back to Supabase when localStorage is empty AND writes the result back to localStorage", async () => {
    const remoteRow = {
      test_center_id: "53",
      test_center_name: "Bangladesh Korea TTC Chattogram",
      address: "Nasirabad-4209",
      city: "Chattogram",
      revealed_at: new Date().toISOString(),
    };
    supabaseFromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: remoteRow, error: null }),
        }),
      }),
    });

    const got = await getCachedCenter("S2");
    expect(got?.id).toBe("53");
    expect(got?.source).toBe("shared");
    // Subsequent local read should now hit the warmed cache.
    expect(getLocalCached("S2")?.name).toBe("Bangladesh Korea TTC Chattogram");
  });

  it("returns null when Supabase returns no row", async () => {
    supabaseFromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    });
    expect(await getCachedCenter("S3")).toBeNull();
  });

  it("returns null when Supabase errors (table missing / RLS denied)", async () => {
    supabaseFromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: "relation \"revealed_test_centers\" does not exist" } }),
        }),
      }),
    });
    expect(await getCachedCenter("S4")).toBeNull();
  });

  it("rejects stale rows from Supabase too", async () => {
    const remoteRow = {
      test_center_id: "45",
      test_center_name: "Bangladesh German TTC",
      address: "",
      city: "Dhaka",
      revealed_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    };
    supabaseFromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: remoteRow, error: null }),
        }),
      }),
    });
    expect(await getCachedCenter("S5")).toBeNull();
  });
});

describe("revealed-centers-cache: setCachedCenter (write-through)", () => {
  it("writes to localStorage AND calls supabase.from with the right table + payload", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    supabaseFromMock.mockReturnValue({ upsert });

    setCachedCenter("1556652", freshCentre());

    expect(getLocalCached("1556652")?.id).toBe("45");
    // Give the fire-and-forget supabase write one microtask to land.
    await Promise.resolve(); await Promise.resolve();
    expect(supabaseFromMock).toHaveBeenCalledWith("revealed_test_centers");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        exam_session_id: "1556652",
        test_center_id: "45",
        test_center_name: "Bangladesh German TTC",
        city: "Dhaka",
      }),
      expect.objectContaining({ onConflict: "exam_session_id" })
    );
  });

  it("silently swallows Supabase write failures (table missing) — localStorage still wins", async () => {
    supabaseFromMock.mockReturnValue({
      upsert: () => { throw new Error("relation does not exist"); },
    });
    setCachedCenter("S6", freshCentre());
    expect(getLocalCached("S6")?.id).toBe("45");
  });
});
