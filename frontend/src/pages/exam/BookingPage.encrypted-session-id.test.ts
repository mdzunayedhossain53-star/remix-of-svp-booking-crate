// Regression test for encrypted SVP exam_session_id handling.
//
// BUG: SVP's live `/exam-sessions` listing returns ENCRYPTED session ids
// (e.g. "g/8sT/c51g==--v16ylCdxbvoHi07t--Q7L6EmDEBbLCQMYs/r7zHQ==") as
// `id` on each session. The previous BookingPage createHold() / bookReservation()
// blindly did `Number(sessionId)`, producing NaN. createHold rejected the
// booking with "No valid exam session selected"; bookReservation serialized
// NaN as JSON `null` and SVP returned HTTP 400 ("SVP request failed: 400").
//
// FIX: pass the raw string when sessionId is not a pure positive integer.
// SVP /temporary-seats and /exam-reservations both accept encrypted tokens
// AND numeric ids — server-side resolves the encrypted token to its
// numeric id.

import { describe, it, expect } from "vitest";

// Mirror of the post-fix sessionId-coercion helper in BookingPage.tsx.
function coerceSessionIdForBody(sessionId: string | number | null | undefined): string | number {
  const raw = String(sessionId ?? "").trim();
  if (!raw) return "";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && String(n) === raw ? n : raw;
}

// Mirror of the post-fix createHold session-array computation.
function buildHoldSessionIds(sessionId: string | number | null | undefined): Array<string | number> {
  const raw = String(sessionId ?? "").trim();
  if (!raw) return [];
  return [coerceSessionIdForBody(raw)];
}

describe("BookingPage encrypted exam_session_id (Bug fix)", () => {
  it("createHold passes encrypted SVP tokens through verbatim", () => {
    const enc = "g/8sT/c51g==--v16ylCdxbvoHi07t--Q7L6EmDEBbLCQMYs/r7zHQ==";
    expect(buildHoldSessionIds(enc)).toEqual([enc]);
  });

  it("createHold still coerces purely numeric ids to Number", () => {
    expect(buildHoldSessionIds("1556652")).toEqual([1556652]);
    expect(buildHoldSessionIds(1556652)).toEqual([1556652]);
  });

  it("createHold rejects empty/whitespace-only session ids", () => {
    expect(buildHoldSessionIds("")).toEqual([]);
    expect(buildHoldSessionIds("   ")).toEqual([]);
    expect(buildHoldSessionIds(null)).toEqual([]);
    expect(buildHoldSessionIds(undefined)).toEqual([]);
  });

  it("bookReservation body keeps encrypted token as string (NOT NaN/null)", () => {
    const enc = "Uks/b29I3g==--gl/78RQKnGLFyB5G--5lztCijWz06qEON2CIHvMg==";
    const body = {
      exam_session_id: coerceSessionIdForBody(enc),
      occupation_id: 2125,
      methodology: "in_person",
      language_code: "OFFII",
      site_id: null,
      site_city: null,
      hold_id: null,
    };
    expect(body.exam_session_id).toBe(enc);
    // Ensure JSON serialization preserves the token (no NaN/null surprise).
    expect(JSON.parse(JSON.stringify(body)).exam_session_id).toBe(enc);
  });

  it("bookReservation body for numeric ids still sends a JSON number", () => {
    const body = {
      exam_session_id: coerceSessionIdForBody("1556652"),
    };
    expect(body.exam_session_id).toBe(1556652);
    expect(typeof JSON.parse(JSON.stringify(body)).exam_session_id).toBe("number");
  });

  it("documents the OLD buggy coercion that caused HTTP 400s", () => {
    const enc = "g/8sT/c51g==--v16ylCdxbvoHi07t--Q7L6EmDEBbLCQMYs/r7zHQ==";
    const buggy = Number(enc);                 // NaN
    expect(Number.isNaN(buggy)).toBe(true);
    expect(JSON.parse(JSON.stringify({ exam_session_id: buggy })).exam_session_id).toBeNull();
    // After fix the same input survives serialization intact.
    expect(coerceSessionIdForBody(enc)).toBe(enc);
  });
});
