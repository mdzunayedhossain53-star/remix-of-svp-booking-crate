// Tests for the `deepFindTestCenter` helper used by BookingPage.tsx
// "🔍 Reveal Real Center" feature.
//
// SVP exam-reservation responses bury the real test_center under several
// possible paths. deepFindTestCenter walks every key looking for a
// `test_center`/`center` object that carries BOTH a real id AND a
// non-placeholder name (e.g. NOT "Dhaka Center" / "Rajshahi Center").
// It returns the first such match.

import { describe, it, expect } from "vitest";
import { deepFindTestCenter } from "./BookingPage";

describe("deepFindTestCenter", () => {
  it("finds a real centre nested under root.test_center", () => {
    const resp = {
      id: 4327062,
      test_center: {
        name: "Narsingdi Technical Training Center",
        test_center_id: 218,
        address: "Shibpur, Narsingdi",
        city: "Dhaka",
      },
    };
    expect(deepFindTestCenter(resp)).toEqual({
      name: "Narsingdi Technical Training Center",
      id: "218",
      address: "Shibpur, Narsingdi",
      city: "Dhaka",
    });
  });

  it("finds a real centre nested under root.exam_session.test_center", () => {
    const resp = {
      id: 4327192,
      exam_session: {
        id: 1556652,
        test_center: { name: "Pabna Technical Training Centre", test_center_id: 201, city: "Pabna" },
      },
    };
    const got = deepFindTestCenter(resp);
    expect(got?.name).toBe("Pabna Technical Training Centre");
    expect(got?.id).toBe("201");
    expect(got?.city).toBe("Pabna");
  });

  it("skips placeholder '<City> Center' names with null ids", () => {
    const resp = {
      exam_session: {
        test_center: { name: "Dhaka Center", test_center_id: null, site_id: null, city: "Dhaka" },
      },
    };
    expect(deepFindTestCenter(resp)).toBeNull();
  });

  it("prefers the FIRST real centre when multiple appear", () => {
    const resp = {
      test_center: { name: "Narsingdi Technical Training Center", test_center_id: 218, city: "Dhaka" },
      exam_session: {
        test_center: { name: "Pabna Technical Training Centre", test_center_id: 201, city: "Pabna" },
      },
    };
    const got = deepFindTestCenter(resp);
    expect(got?.id).toBe("218");
  });

  it("returns null on empty / malformed input", () => {
    expect(deepFindTestCenter(null)).toBeNull();
    expect(deepFindTestCenter(undefined)).toBeNull();
    expect(deepFindTestCenter({})).toBeNull();
    expect(deepFindTestCenter([])).toBeNull();
    expect(deepFindTestCenter({ test_center: null })).toBeNull();
    expect(deepFindTestCenter({ test_center: { name: "", test_center_id: null } })).toBeNull();
  });

  it("falls back to `site_id` when test_center_id is absent", () => {
    const resp = {
      test_center: { name: "Korea Technical Training Center", site_id: 17, city: "Dhaka" },
    };
    const got = deepFindTestCenter(resp);
    expect(got?.id).toBe("17");
    expect(got?.name).toBe("Korea Technical Training Center");
  });
});
