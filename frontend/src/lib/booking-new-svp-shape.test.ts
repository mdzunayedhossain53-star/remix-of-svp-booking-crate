// Regression tests for the new SVP API shape where exam_session.test_center
// uses `test_center_id`, `test_center_name`, `test_center_city` (and site_id is null).
//
// Real example from production:
//   "test_center": {
//     "test_center_id": 70,
//     "site_id": null,
//     "test_center_city": "Mymensingh",
//     "test_center_name": "Mymensingh Technical Training Centre",
//     ...
//   }
//
// Bug: getSessionSiteCity used to only read test_center.city / test_center_city.
// It missed test_center.test_center_city, so the city filter on BookingPage
// returned 0 sessions when the user picked a city.

import { describe, it, expect } from "vitest";
import {
  buildCenterOptions,
  getCenterKey,
  getSessionCenterName,
  getSessionSiteCity,
  getSessionSiteId,
  normalizeAvailableDateEntries,
  buildCityOptions,
  resolveSessionCenter,
} from "./booking-utils";

const MYMENSINGH_SESSION = {
  id: 1396416,
  category: { id: 159 },
  available_seats: 12,
  test_center: {
    test_center_id: 70,
    site_id: null,
    status: "active",
    test_center_city: "Mymensingh",
    test_center_name: "Mymensingh Technical Training Centre",
    address: "164 ,Maskanda , Mymensingh",
  },
};

const RAJSHAHI_SESSION_A = {
  id: 1400001,
  test_center: {
    test_center_id: 54,
    site_id: null,
    test_center_city: "Rajshahi",
    test_center_name: "Rajshahi Technical Training Centre",
  },
};

// Same city as RAJSHAHI_SESSION_A but a DIFFERENT test center
// (this exercises the “multiple test centers in one city” case).
const RAJSHAHI_SESSION_B = {
  id: 1400002,
  test_center: {
    test_center_id: 55,
    site_id: null,
    test_center_city: "Rajshahi",
    test_center_name: "Rajshahi Polytechnic Institute",
  },
};

// Another session at the SAME Rajshahi test center as A — to confirm
// multiple sessions per test center are grouped under one option.
const RAJSHAHI_SESSION_A2 = {
  id: 1400003,
  test_center: {
    test_center_id: 54,
    site_id: null,
    test_center_city: "Rajshahi",
    test_center_name: "Rajshahi Technical Training Centre",
  },
};

describe("new SVP API shape (test_center.test_center_*)", () => {
  it("getSessionSiteCity reads test_center.test_center_city", () => {
    expect(getSessionSiteCity(MYMENSINGH_SESSION)).toBe("Mymensingh");
    expect(getSessionSiteCity(RAJSHAHI_SESSION_A)).toBe("Rajshahi");
  });

  it("getSessionSiteId reads test_center.test_center_id when site_id is null", () => {
    expect(getSessionSiteId(MYMENSINGH_SESSION)).toBe("70");
    expect(getSessionSiteId(RAJSHAHI_SESSION_B)).toBe("55");
  });

  it("getSessionCenterName picks the explicit test_center.test_center_name", () => {
    expect(getSessionCenterName(MYMENSINGH_SESSION))
      .toBe("Mymensingh Technical Training Centre");
    expect(getSessionCenterName(RAJSHAHI_SESSION_B))
      .toBe("Rajshahi Polytechnic Institute");
  });

  it("getCenterKey groups by test_center_id (so multiple sessions of the same center collapse)", () => {
    expect(getCenterKey(RAJSHAHI_SESSION_A)).toBe("54");
    expect(getCenterKey(RAJSHAHI_SESSION_A2)).toBe("54");
    expect(getCenterKey(RAJSHAHI_SESSION_B)).toBe("55");
  });

  it("buildCenterOptions emits ONE option per unique test_center_id within a city", () => {
    const rajshahiSessions = [RAJSHAHI_SESSION_A, RAJSHAHI_SESSION_B, RAJSHAHI_SESSION_A2];
    const options = buildCenterOptions(rajshahiSessions);
    expect(options).toHaveLength(2);
    const map = Object.fromEntries(options.map((o) => [o.siteId, o]));
    expect(map["54"]).toBeDefined();
    expect(map["54"].name).toBe("Rajshahi Technical Training Centre");
    expect(map["54"].city).toBe("Rajshahi");
    expect(map["55"]).toBeDefined();
    expect(map["55"].name).toBe("Rajshahi Polytechnic Institute");
    expect(map["55"].city).toBe("Rajshahi");
  });

  it("resolveSessionCenter preserves new SVP fields AND stamps name + site_id", () => {
    const resolved = resolveSessionCenter(
      MYMENSINGH_SESSION,
      new Map(),
      new Map(),
      undefined,
      undefined,
    );
    expect(resolved.test_center.name).toBe("Mymensingh Technical Training Centre");
    expect(String(resolved.test_center.site_id)).toBe("70");
    expect(resolved.test_center.test_center_id).toBe(70);
    expect(resolved.test_center.test_center_city).toBe("Mymensingh");
    // City still resolvable after resolve.
    expect(getSessionSiteCity(resolved)).toBe("Mymensingh");
  });

  it("available_dates city options use test_center.test_center_city", () => {
    const entries = normalizeAvailableDateEntries([
      { exam_date: "2026-05-21", test_center: { test_center_city: "Mymensingh" } },
      { exam_date: "2026-05-22", test_center: { test_center_city: "Rajshahi" } },
      { exam_date: "2026-05-23", test_center: { test_center_city: "Rajshahi" } },
    ]);
    expect(buildCityOptions(entries).sort()).toEqual(["Mymensingh", "Rajshahi"]);
    // Both Rajshahi dates collapse into one city option (deduped) but stay as 2 entries.
    expect(entries.filter((e) => e.city === "Rajshahi")).toHaveLength(2);
  });

  it("city filter (simulated) returns ONLY sessions of the selected city — and excludes other cities", () => {
    const all = [MYMENSINGH_SESSION, RAJSHAHI_SESSION_A, RAJSHAHI_SESSION_B, RAJSHAHI_SESSION_A2];
    const selectedCity = "Rajshahi";
    const filtered = all.filter(
      (s) => getSessionSiteCity(s).trim().toLowerCase() === selectedCity.trim().toLowerCase(),
    );
    expect(filtered).toHaveLength(3);
    // No Mymensingh leakage.
    expect(filtered.every((s) => getSessionSiteCity(s) === "Rajshahi")).toBe(true);
    // Center options: 2 unique test centers in Rajshahi.
    expect(buildCenterOptions(filtered)).toHaveLength(2);
  });
});
