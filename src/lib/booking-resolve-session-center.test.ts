import { describe, it, expect } from "vitest";
import { resolveSessionCenter, getSessionSiteId, getExplicitSessionCenterName } from "./booking-utils";

const BOGURA = "Technical Training Centre (TTC), Bogura";
const RAJSHAHI = "Rajshahi Technical Training Centre";

describe("resolveSessionCenter — site_id stamping via DB name->site_id lookup", () => {
  it("stamps site_id from centerNameToSiteId when SVP returns site_id=null and detail fetch supplied the name", () => {
    const session = { id: 5001, site_id: null, site_city: "Bogura" };
    const testCenterMap = new Map([[`session:5001`, BOGURA]]);
    const nameMap = new Map([[BOGURA.toLowerCase(), "107"]]);

    const out = resolveSessionCenter(session, testCenterMap, nameMap);

    expect(out.site_id).toBe("107");
    expect(out.test_center.site_id).toBe("107");
    expect(out.test_center.id).toBe("107");
    expect(out.test_center.name).toBe(BOGURA);
    expect(getSessionSiteId(out)).toBe("107");
    expect(getExplicitSessionCenterName(out)).toBe(BOGURA);
  });

  it("stamps site_id when SVP entirely omits site_id but session has explicit test_center.name", () => {
    const session = { id: 5002, test_center: { name: RAJSHAHI } };
    const nameMap = new Map([[RAJSHAHI.toLowerCase(), "54"]]);

    const out = resolveSessionCenter(session, new Map(), nameMap);

    expect(out.site_id).toBe("54");
    expect(out.test_center.site_id).toBe("54");
    expect(getSessionSiteId(out)).toBe("54");
  });

  it("name lookup is case/whitespace tolerant (lowercased key)", () => {
    const session = { id: 5003, test_center: { name: "  " + BOGURA.toUpperCase() + "  " } };
    const nameMap = new Map([[BOGURA.toLowerCase(), "107"]]);

    const out = resolveSessionCenter(session, new Map(), nameMap);

    expect(out.site_id).toBe("107");
  });

  it("prefers existing session site_id over the name->site_id map (does not overwrite)", () => {
    const session = { id: 5004, site_id: 999, test_center: { name: BOGURA } };
    const nameMap = new Map([[BOGURA.toLowerCase(), "107"]]);

    const out = resolveSessionCenter(session, new Map(), nameMap);

    expect(String(out.site_id)).toBe("999");
    expect(String(out.test_center.site_id)).toBe("999");
  });

  it("leaves session unchanged when no name and no site_id can be resolved", () => {
    const session = { id: 5005, site_id: null, site_city: "Khulna" };
    const out = resolveSessionCenter(session, new Map(), new Map());
    expect(out).toBe(session);
  });

  it("keeps the resolved name even when the DB has no matching site_id", () => {
    const session = { id: 5006, site_id: null };
    const testCenterMap = new Map([[`session:5006`, "Some Center"]]);

    const out = resolveSessionCenter(session, testCenterMap, new Map());

    expect(out.test_center.name).toBe("Some Center");
    expect(out.site_id ?? null).toBeNull(); // no site_id added
  });

  it("distinguishes Bogura (107) and Rajshahi (54) in mixed sessions via name->site_id", () => {
    const sessions = [
      { id: 7001, site_id: null, site_city: "Rajshahi" },
      { id: 7002, site_id: null, site_city: "Bogura" },
    ];
    const testCenterMap = new Map([
      [`session:7001`, RAJSHAHI],
      [`session:7002`, BOGURA],
    ]);
    const nameMap = new Map([
      [RAJSHAHI.toLowerCase(), "54"],
      [BOGURA.toLowerCase(), "107"],
    ]);

    const out = sessions.map((s) => resolveSessionCenter(s, testCenterMap, nameMap));

    expect(out[0].site_id).toBe("54");
    expect(out[1].site_id).toBe("107");
    expect(out[0].test_center.name).toBe(RAJSHAHI);
    expect(out[1].test_center.name).toBe(BOGURA);
  });

  it("preserves existing test_center fields (city, etc.) while adding name + site_id", () => {
    const session = {
      id: 5007,
      site_id: null,
      test_center: { city: "Bogura", country_code: "BD" },
    };
    const testCenterMap = new Map([[`session:5007`, BOGURA]]);
    const nameMap = new Map([[BOGURA.toLowerCase(), "107"]]);

    const out = resolveSessionCenter(session, testCenterMap, nameMap);

    expect(out.test_center.city).toBe("Bogura");
    expect(out.test_center.country_code).toBe("BD");
    expect(out.test_center.name).toBe(BOGURA);
    expect(out.test_center.site_id).toBe("107");
  });
});
