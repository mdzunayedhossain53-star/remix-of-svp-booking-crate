// Shared helper to walk a nested SVP reservation/session response looking
// for the authoritative `test_center` object (the one with a real
// `test_center_id` / `name` / `address`).
//
// SVP returns it under a few possible shapes (root.test_center,
// root.exam_session.test_center, etc.) so we search every level and
// pick the first one that carries a real id.
//
// Lives outside BookingPage.tsx so background tasks (auto-reveal,
// scripts, edge functions) can share the exact same parsing logic.

export interface RevealedCenter {
  name: string;
  id: string;
  address: string;
  city: string;
}

export function deepFindTestCenter(obj: unknown): RevealedCenter | null {
  let best: RevealedCenter | null = null;
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const rec = node as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      const value = rec[key];
      if ((key === "test_center" || key === "center") && value && typeof value === "object") {
        const tc = value as Record<string, unknown>;
        const id = String(tc.test_center_id ?? tc.id ?? tc.site_id ?? "").trim();
        const name = String(tc.test_center_name ?? tc.name ?? "").trim();
        // SVP's pre-booking placeholder shape is `{name: "<City> Center",
        // test_center_id: null, site_id: null}` — so reject it when there
        // is no id AT ALL. Any object that carries a real id (test_center_id,
        // id or site_id) AND a name is considered authoritative.
        if (id && name && id !== "null" && id !== "undefined") {
          if (!best) {
            best = {
              name,
              id,
              address: String(tc.address ?? "").trim(),
              city: String(tc.test_center_city ?? tc.city ?? "").trim(),
            };
          }
        }
      }
      walk(value);
    }
  };
  walk(obj);
  return best;
}
