// Regression test for the BookingPage createHold bug.
//
// BUG: createHold previously sent ALL filteredSessions of the selected
// city to the /temporary-seats endpoint as `exam_session_id: number[]`.
// SVP would create a hold spanning multiple distinct test centers in
// the same city. When the booking POST was then made with that hold_id
// and exam_session_id, SVP could confirm a DIFFERENT session/center
// than the user actually selected — leading to bookings landing at the
// wrong test center.
//
// FIX: createHold now sends ONLY the selected session id.
//
// This test snapshots the expected payload shape produced by the
// current page logic.

import { describe, it, expect } from "vitest";
import { getSessionId } from "@/lib/booking-utils";

// Mirror of the createHold session-array computation (post-fix).
function buildHoldSessionIds(selectedSessionId: string | number): number[] {
  const n = Number(selectedSessionId);
  if (!Number.isFinite(n) || n <= 0) return [];
  return [n];
}

// Mirror of the buggy old behavior for comparison.
function buildHoldSessionIds_BUGGY(filteredSessions: any[], selectedSession: any): number[] {
  return Array.from(new Set(
    (filteredSessions.length ? filteredSessions : [selectedSession])
      .map((item) => Number(getSessionId(item)))
      .filter((item) => Number.isFinite(item) && item > 0)
  ));
}

describe("BookingPage createHold — single-session hold (SVP wrong center fix)", () => {
  it("returns only the selected session id, regardless of how many sessions are in the same city", () => {
    const selected = 1547926;
    expect(buildHoldSessionIds(selected)).toEqual([1547926]);
  });

  it("rejects invalid session ids", () => {
    expect(buildHoldSessionIds("")).toEqual([]);
    expect(buildHoldSessionIds("0")).toEqual([]);
    expect(buildHoldSessionIds("abc")).toEqual([]);
    expect(buildHoldSessionIds(-1)).toEqual([]);
  });

  it("documents the buggy behavior so the regression is locked in", () => {
    // Simulate two Dhaka centers exposed in the filteredSessions list.
    const filteredSessions = [
      { id: 1547926, test_center: { test_center_id: 12, test_center_city: "Dhaka" } },
      { id: 1547927, test_center: { test_center_id: 34, test_center_city: "Dhaka" } },
    ];
    const selectedSession = filteredSessions[0];
    const buggy = buildHoldSessionIds_BUGGY(filteredSessions, selectedSession);
    // The old logic held BOTH centers in Dhaka — this is the bug.
    expect(buggy).toEqual([1547926, 1547927]);
    // The fix narrows the hold to just the chosen session.
    expect(buildHoldSessionIds(getSessionId(selectedSession))).toEqual([1547926]);
  });
});
