// Cache for "real" SVP test centres keyed by exam_session_id.
//
// SVP hides the real test_center identity in /exam-sessions responses —
// the only way to read it pre-payment is to create a draft reservation.
// Once we have created a draft (via the "🔍 Reveal Real Center" button),
// we cache the (exam_session_id → centre) mapping so:
//
//   1. The same user, in the same browser, instantly sees the real centre
//      on subsequent visits to that session (no extra draft).
//   2. ALL users see it through the Supabase shared cache (community-wide).
//
// The Supabase layer fails open: if the `revealed_test_centers` table is
// missing OR the anon key is wrong, we silently fall back to localStorage
// only. That means localStorage works immediately even before the SQL
// migration / anon-key fix is in place.

import { supabase } from "@/integrations/supabase/client";

const LS_PREFIX = "revealed_test_center::";
// Refresh a cached entry if older than 30 days — SVP occasionally
// reshuffles centre assignments.
const STALE_MS = 30 * 24 * 60 * 60 * 1000;

export interface CachedCenter {
  name: string;
  id: string;
  address: string;
  city: string;
  /** ISO timestamp when this centre was last revealed against SVP. */
  revealedAt: string;
  /** Where the value came from on the most recent read. */
  source?: "local" | "shared";
}

function lsKey(sessionId: string | number) {
  return `${LS_PREFIX}${String(sessionId).trim()}`;
}

function notStale(iso: string): boolean {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < STALE_MS;
}

export function getLocalCached(sessionId: string | number): CachedCenter | null {
  if (typeof window === "undefined") return null;
  const key = lsKey(sessionId);
  if (!key.startsWith(LS_PREFIX) || key === LS_PREFIX) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCenter;
    if (!parsed?.name || !parsed?.id || !notStale(parsed.revealedAt)) return null;
    return { ...parsed, source: "local" };
  } catch {
    return null;
  }
}

export function setLocalCached(sessionId: string | number, value: Omit<CachedCenter, "revealedAt" | "source"> & { revealedAt?: string }): void {
  if (typeof window === "undefined") return;
  const key = lsKey(sessionId);
  if (key === LS_PREFIX) return;
  const payload: CachedCenter = {
    name: value.name,
    id: value.id,
    address: value.address,
    city: value.city,
    revealedAt: value.revealedAt || new Date().toISOString(),
  };
  try { window.localStorage.setItem(key, JSON.stringify(payload)); } catch { /* quota — ignore */ }
}

async function getSharedCached(sessionId: string | number): Promise<CachedCenter | null> {
  try {
    const { data, error } = await supabase
      .from("revealed_test_centers" as any)
      .select("test_center_id, test_center_name, address, city, revealed_at")
      .eq("exam_session_id", String(sessionId))
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    const id = String(row.test_center_id ?? "").trim();
    const name = String(row.test_center_name ?? "").trim();
    const revealedAt = String(row.revealed_at ?? "");
    if (!id || !name || !notStale(revealedAt)) return null;
    return {
      id,
      name,
      address: String(row.address ?? ""),
      city: String(row.city ?? ""),
      revealedAt,
      source: "shared",
    };
  } catch {
    return null;
  }
}

async function setSharedCached(sessionId: string | number, value: Omit<CachedCenter, "revealedAt" | "source">): Promise<void> {
  try {
    await supabase.from("revealed_test_centers" as any).upsert({
      exam_session_id: String(sessionId),
      test_center_id: value.id,
      test_center_name: value.name,
      address: value.address || null,
      city: value.city || null,
      revealed_at: new Date().toISOString(),
    }, { onConflict: "exam_session_id" });
  } catch { /* table or RLS missing — silently degrade to local-only */ }
}

/**
 * Looks up a previously revealed centre — local first (instant),
 * Supabase second (community-wide). When the shared cache returns a
 * fresh value, also writes it to localStorage so the next call is
 * instant.
 */
export async function getCachedCenter(sessionId: string | number): Promise<CachedCenter | null> {
  const local = getLocalCached(sessionId);
  if (local) return local;
  const shared = await getSharedCached(sessionId);
  if (shared) {
    setLocalCached(sessionId, shared);
    return shared;
  }
  return null;
}

/**
 * Persists a newly revealed centre to BOTH cache layers. Returns once
 * localStorage is written; the Supabase write is fire-and-forget so it
 * never blocks the UI even if the table/key isn't set up yet.
 */
export function setCachedCenter(sessionId: string | number, value: Omit<CachedCenter, "revealedAt" | "source">): void {
  setLocalCached(sessionId, value);
  void setSharedCached(sessionId, value);
}
