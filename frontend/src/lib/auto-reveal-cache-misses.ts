// Auto-reveal cache misses in the background.
//
// Strategy (Conservative — option 1a chosen by user):
//   1. Fetch user's accessible occupations → group by category (first occ per cat).
//   2. For each category, fetch upcoming /available-dates entries for all
//      city/date pairs.
//   3. Expand each city/date pair into all current /exam-sessions.
//   4. Check the Supabase `revealed_test_centers` table by exact session id.
//   5. Filter to ONLY the cache misses, hard cap at MAX_REVEALS_PER_SESSION (15).
//   6. For each cache miss, run the reveal flow:
//        POST /temporary-seats → POST /exam-reservations (null site_id payload)
//      and on a real `test_center` in the response → upsert to cache.
//   7. Serial execution with a 10-second delay between each reveal to avoid
//      tripping SVP rate limits.
//   8. Stops early on the first cooldown / 422 from SVP.
//
// Triggering: called once per browser session from BookingPage AFTER the
// user already has a valid SVP token (so the api() helper attaches it).
// Honours sessionStorage flag `auto_reveal_ran` to prevent re-running on
// every BookingPage re-mount in the same tab.

import { api } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { setCachedCenter } from "@/lib/revealed-centers-cache";
import { deepFindTestCenter, RevealedCenter } from "@/lib/deep-find-test-center";

export const MAX_REVEALS_PER_SESSION = 15;
export const REVEAL_DELAY_MS = 10_000;
const SESSION_FLAG = "auto_reveal_ran";

export interface RevealCandidate {
  categoryId: string;
  occupationId: number;
  city: string;
  date: string;
  languageCode: string;
  examSessionId?: string;
  cacheKey: string;
}

export interface AutoRevealResult {
  attempted: number;
  succeeded: number;
  failed: number;
  stoppedReason: "limit" | "rate_limit" | "no_candidates" | "session_already_ran" | "no_token";
}

function buildCacheKey(categoryId: string | number, city: string, date: string): string {
  return `cat-${categoryId}|city-${String(city).toLowerCase()}|date-${date}`;
}

function buildSessionCacheKey(sessionId: string | number): string {
  return String(sessionId || "").trim();
}

async function fetchExistingCacheKeys(keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  try {
    const { data, error } = await supabase
      .from("revealed_test_centers" as any)
      .select("exam_session_id")
      .in("exam_session_id", keys);
    if (error || !data) return new Set();
    return new Set((data as Array<{ exam_session_id: string }>).map((r) => r.exam_session_id));
  } catch {
    return new Set();
  }
}

// Walks occupations[] → dedupe by category_id, returns first occ per cat.
function pickFirstOccPerCategory(occupations: any[]): Map<string, any> {
  const byCat = new Map<string, any>();
  for (const o of occupations) {
    const catId = String((o?.category?.id ?? o?.category_id ?? "").toString()).trim();
    if (!catId) continue;
    if (!byCat.has(catId)) byCat.set(catId, o);
  }
  return byCat;
}

// Pull (city, date) candidates from /available-dates payload (handles
// both `exam_sessions` and `available_dates` keys SVP uses).
function extractCityDatePairs(payload: any): Array<{ city: string; date: string }> {
  const arr = payload?.exam_sessions || payload?.available_dates || [];
  const list: Array<{ city: string; date: string }> = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(arr) ? arr : []) {
    const city = String(
      x?.city ||
      x?.site_city ||
      x?.site_city_name ||
      x?.test_center_city ||
      x?.test_center?.test_center_city ||
      x?.test_center?.city ||
      "",
    ).trim();
    const date = String(
      x?.start_date_in_browser_time_zone ||
      x?.exam_date ||
      x?.available_date ||
      x?.date ||
      x?.start_at_date ||
      x?.start_at ||
      "",
    ).trim();
    if (!city || !date) continue;
    const key = `${city}|${date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ city, date });
  }
  return list;
}

// Walks an occupation looking for the language_code / prometric code SVP
// expects in /exam-reservations.
function extractLanguageCode(occ: any): string {
  const codes = occ?.category?.prometric_codes || occ?.languageCodes || [];
  if (Array.isArray(codes) && codes.length > 0) {
    const c = codes[0];
    return String(c?.code || c?.language_code || "OFFII");
  }
  return "OFFII";
}

// Reveal one candidate. Returns the revealed centre or null on failure.
// Throws an Error with .isCooldown=true if SVP returns 422 (per-category
// cooldown) so the caller can short-circuit.
export async function revealOneCandidate(c: RevealCandidate): Promise<RevealedCenter | null> {
  let encryptedId = c.examSessionId;
  if (!encryptedId) {
    const sessions: any = await api(
      `/exam-sessions?category_id=${encodeURIComponent(c.categoryId)}&city=${encodeURIComponent(c.city)}&exam_date=${encodeURIComponent(c.date)}`,
    );
    const list = sessions?.exam_sessions || sessions?.data || [];
    if (!Array.isArray(list) || list.length === 0) return null;
    encryptedId = list[0]?.id;
  }
  if (!encryptedId) return null;

  // Hold first (informational — required by SVP business rules).
  try {
    await api("/temporary-seats", {
      method: "POST",
      body: { exam_session_id: [encryptedId], methodology: "in_person" },
    });
  } catch { /* hold may already exist — proceed */ }

  // Draft reservation with the SVP-frontend-parity payload.
  let response: any;
  try {
    response = await api("/exam-reservations", {
      method: "POST",
      body: {
        exam_session_id: encryptedId,
        occupation_id: c.occupationId,
        methodology: "in_person",
        language_code: c.languageCode,
        site_id: null, site_city: null, hold_id: null,
      },
    });
  } catch (err: any) {
    const status = err?.status || err?.response?.status;
    const msg = String(err?.message || "").toLowerCase();
    if (status === 422 || msg.includes("try again in") || msg.includes("existing")) {
      const cooldown = new Error("SVP cooldown — stopping auto-reveal");
      (cooldown as any).isCooldown = true;
      throw cooldown;
    }
    return null;
  }

  const centre = deepFindTestCenter(response);
  if (!centre) return null;
  setCachedCenter(c.cacheKey || buildSessionCacheKey(encryptedId), centre);
  return centre;
}

export async function autoRevealMissingCenters(
  opts: {
    force?: boolean;
    revealDelayMs?: number;
    onReveal?: (centre: RevealedCenter, cumulativeCount: number) => void;
    onComplete?: (result: AutoRevealResult) => void;
  } = {},
): Promise<AutoRevealResult> {
  // One-per-tab guard
  if (typeof window !== "undefined" && !opts.force) {
    try {
      if (window.sessionStorage.getItem(SESSION_FLAG) === "1") {
        return { attempted: 0, succeeded: 0, failed: 0, stoppedReason: "session_already_ran" };
      }
      window.sessionStorage.setItem(SESSION_FLAG, "1");
    } catch { /* private mode — ignore */ }
  }

  // 1) Fetch occupations
  let occupations: any[] = [];
  try {
    const occResp: any = await api("/occupations?per_page=300&page=1");
    occupations = occResp?.occupations || occResp?.data || [];
  } catch {
    return { attempted: 0, succeeded: 0, failed: 0, stoppedReason: "no_token" };
  }
  if (!occupations.length) return { attempted: 0, succeeded: 0, failed: 0, stoppedReason: "no_candidates" };

  const byCat = pickFirstOccPerCategory(occupations);

  // 2) For each category → fetch available dates (parallel up to 8 at a time
  //    to keep this snappy without flooding SVP).
  const cityDateCandidates: RevealCandidate[] = [];
  const entries = Array.from(byCat.entries());
  const BATCH = 8;
  for (let i = 0; i < entries.length; i += BATCH) {
    const slice = entries.slice(i, i + BATCH);
    const results = await Promise.all(slice.map(async ([catId, occ]) => {
      try {
        const ad: any = await api(
          `/available-dates?per_page=200&category_id=${encodeURIComponent(catId)}&available_seats=greater_than::0&status=scheduled`,
        );
        const pairs = extractCityDatePairs(ad);
        return pairs.map((p) => ({
          categoryId: catId,
          occupationId: Number(occ?.id),
          city: p.city,
          date: p.date,
          languageCode: extractLanguageCode(occ),
          cacheKey: buildCacheKey(catId, p.city, p.date),
        }));
      } catch { return []; }
    }));
    for (const arr of results) cityDateCandidates.push(...arr);
  }
  if (!cityDateCandidates.length) return { attempted: 0, succeeded: 0, failed: 0, stoppedReason: "no_candidates" };

  // 3) Expand every city/date pair into all currently available sessions.
  // This is what makes the warmer cover all centres for a city/date instead
  // of only revealing whichever session SVP happens to return first.
  const sessionCandidates: RevealCandidate[] = [];
  const SESSION_BATCH = 8;
  for (let i = 0; i < cityDateCandidates.length; i += SESSION_BATCH) {
    const slice = cityDateCandidates.slice(i, i + SESSION_BATCH);
    const results = await Promise.all(slice.map(async (c) => {
      try {
        const sessions: any = await api(
          `/exam-sessions?category_id=${encodeURIComponent(c.categoryId)}&city=${encodeURIComponent(c.city)}&exam_date=${encodeURIComponent(c.date)}`,
        );
        const list = sessions?.exam_sessions || sessions?.data || [];
        if (!Array.isArray(list)) return [];
        return list
          .map((session: any) => buildSessionCacheKey(session?.id))
          .filter(Boolean)
          .map((examSessionId: string) => ({
            ...c,
            examSessionId,
            cacheKey: buildSessionCacheKey(examSessionId),
          }));
      } catch { return []; }
    }));
    for (const arr of results) sessionCandidates.push(...arr);
  }
  if (!sessionCandidates.length) return { attempted: 0, succeeded: 0, failed: 0, stoppedReason: "no_candidates" };
  const uniqueSessionCandidates = Array.from(
    new Map(sessionCandidates.map((c) => [c.cacheKey, c])).values(),
  );

  // 4) Filter cache misses
  const existingKeys = await fetchExistingCacheKeys(uniqueSessionCandidates.map((c) => c.cacheKey));
  const misses = uniqueSessionCandidates.filter((c) => !existingKeys.has(c.cacheKey));
  if (!misses.length) return { attempted: 0, succeeded: 0, failed: 0, stoppedReason: "no_candidates" };

  // 5) Hard cap at MAX_REVEALS_PER_SESSION
  const toReveal = misses.slice(0, MAX_REVEALS_PER_SESSION);

  // 6) Serial reveal with delay
  let succeeded = 0;
  let failed = 0;
  let stoppedReason: AutoRevealResult["stoppedReason"] = "limit";
  for (let i = 0; i < toReveal.length; i++) {
    const c = toReveal[i];
    try {
      const centre = await revealOneCandidate(c);
      if (centre) {
        succeeded++;
        try { opts.onReveal?.(centre, succeeded); } catch { /* callback failure must not break the loop */ }
      } else {
        failed++;
      }
    } catch (err: any) {
      if (err?.isCooldown) {
        stoppedReason = "rate_limit";
        failed++;
        break;
      }
      failed++;
    }
    // Delay between calls (skip after last)
    if (i < toReveal.length - 1) {
      const delayMs = opts.revealDelayMs ?? REVEAL_DELAY_MS;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const result: AutoRevealResult = { attempted: toReveal.length, succeeded, failed, stoppedReason };
  try { opts.onComplete?.(result); } catch { /* swallow */ }
  return result;
}

// Test-friendly export bundle so the regression suite can stub api() and
// supabase via vi.mock without re-implementing internals.
export const _internal = {
  buildCacheKey,
  buildSessionCacheKey,
  pickFirstOccPerCategory,
  extractCityDatePairs,
  extractLanguageCode,
  fetchExistingCacheKeys,
};
