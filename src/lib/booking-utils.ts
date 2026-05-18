// Utility functions for booking data normalization

export function pickArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.occupations)) return payload.occupations;
  if (Array.isArray(payload?.data?.occupations)) return payload.data.occupations;
  if (Array.isArray(payload?.exam_sessions)) return payload.exam_sessions;
  if (Array.isArray(payload?.data?.exam_sessions)) return payload.data.exam_sessions;
  if (Array.isArray(payload?.available_dates)) return payload.available_dates;
  if (Array.isArray(payload?.data?.available_dates)) return payload.data.available_dates;
  if (Array.isArray(payload?.prometric_codes)) return payload.prometric_codes;
  if (Array.isArray(payload?.data?.prometric_codes)) return payload.data.prometric_codes;
  if (Array.isArray(payload?.exam_reservations)) return payload.exam_reservations;
  if (Array.isArray(payload?.data?.exam_reservations)) return payload.data.exam_reservations;
  if (Array.isArray(payload?.reservations)) return payload.reservations;
  if (Array.isArray(payload?.data?.reservations)) return payload.data.reservations;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

export function normalizeDateValue(value: string): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return "";
  return toLocalIsoDate(parsed);
}

export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface NormalizedOccupation {
  raw: any;
  id: string;
  name: string;
  categoryId: string;
  methodology: string;
  languageCodes: { code: string; englishName: string }[];
}

export function normalizeOccupation(item: any): NormalizedOccupation {
  const id = item?.id || item?.occupation_id || item?.value || "";
  const langSource = item?.prometric_codes || item?.category?.prometric_codes || [];
  return {
    raw: item,
    id: String(id),
    name: item?.name || item?.english_name || item?.occupation_name || item?.title || `Occupation #${id}`,
    categoryId: String(item?.category_id || item?.category?.id || ""),
    methodology: item?.methodology_type || item?.methodology || "in_person",
    languageCodes: pickArray(langSource).map((c: any) => ({
      code: c?.code || c?.language_code || "",
      englishName: c?.english_name || c?.name || c?.code || "",
    })),
  };
}

export function getSessionId(item: any): string {
  return String(item?.id || item?.session_id || item?.exam_session_id || "");
}

export function getSessionSiteId(item: any): string {
  return String(item?.site_id || item?.test_center?.site_id || item?.test_center?.id || item?.site?.id || "");
}

export function getSessionSiteCity(item: any): string {
  const sc = item?.site_city;
  return String(
    (typeof sc === "object" ? sc?.name || sc?.city || sc?.english_name : sc) ||
    item?.test_center?.city || item?.city || item?.site_city_name || item?.test_center_city || ""
  );
}

export function getSessionCenterName(item: any): string {
  return String(
    item?.test_center_name || item?.test_center?.name || item?.test_center?.test_center_name ||
    `${getSessionSiteCity(item) || "Center"}${getSessionSiteId(item) ? ` (#${getSessionSiteId(item)})` : ""}`
  );
}

export function getCenterKey(item: any): string {
  return String(getSessionSiteId(item) || getSessionId(item) || "");
}

export function getPrometricCodes(item: any): any[] {
  return pickArray(item?.prometric_codes || item?.languages || item?.language_codes);
}

function getAvailableDateCity(item: any): string {
  if (!item || typeof item === "string") return "";
  const sc = item.site_city;
  const nsc = typeof sc === "object" ? (sc?.name || sc?.city || sc?.english_name || "") : sc;
  const tc = item?.test_center?.city;
  const ntc = typeof tc === "object" ? (tc?.name || tc?.city || tc?.english_name || "") : tc;
  return String(item.city || nsc || item.site_city_name || item.test_center_city || ntc || item.site?.city || "").trim();
}

function getAvailableDateIso(item: any): string {
  if (typeof item === "string") return normalizeDateValue(item);
  return normalizeDateValue(
    item?.date || item?.available_date || item?.exam_date ||
    item?.start_date_in_browser_time_zone || item?.start_date_in_tc_time_zone ||
    item?.start_at_date || item?.start_at || item?.scheduled_at || ""
  );
}

export interface DateEntry { city: string; date: string; }

export function normalizeAvailableDateEntries(items: any[]): DateEntry[] {
  const map = new Map<string, DateEntry>();
  items.forEach((item) => {
    const date = getAvailableDateIso(item);
    const city = getAvailableDateCity(item);
    if (!date || !city) return;
    const key = `${city}__${date}`;
    if (!map.has(key)) map.set(key, { city, date });
  });
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date) || a.city.localeCompare(b.city));
}

export function buildCityOptions(entries: DateEntry[]): string[] {
  return Array.from(new Set(entries.map((e) => e.city).filter(Boolean))).sort();
}

export function buildDateOptions(entries: DateEntry[], city: string): string[] {
  return Array.from(
    new Set(entries.filter((e) => (city ? e.city === city : true)).map((e) => e.date).filter(Boolean))
  ).sort();
}

export interface CenterOption { siteId: string; name: string; city: string; }

export function buildCenterOptions(items: any[]): CenterOption[] {
  const map = new Map<string, CenterOption>();
  items.forEach((item) => {
    const sid = getCenterKey(item);
    if (!sid || map.has(sid)) return;
    map.set(sid, { siteId: sid, name: getSessionCenterName(item), city: getSessionSiteCity(item) });
  });
  return Array.from(map.values());
}

export function readNumeric(payload: any, keys: string[]): number {
  for (const key of keys) {
    const v = payload?.[key] ?? payload?.balance?.[key] ?? payload?.data?.[key] ?? payload?.data?.balance?.[key];
    if (v !== undefined && v !== null && v !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

export function detectBookingMode(balance: any) {
  const rc = readNumeric(balance, ["reservation_credits", "reservationCredits"]);
  const fc = readNumeric(balance, ["free_certificates_total", "freeCertificatesTotal"]);
  if (rc > 0) return { type: "reservation_credit", label: "Reservation Credit", reservationCredits: rc, freeCertificates: fc };
  if (fc > 0) return { type: "free_certificate", label: "Free Certificate", reservationCredits: rc, freeCertificates: fc };
  return { type: "paid", label: "Paid Booking", reservationCredits: rc, freeCertificates: fc };
}

export function extractId(payload: any, keys: string[]): string {
  for (const key of keys) {
    const v = payload?.[key] || payload?.data?.[key] || payload?.result?.[key];
    if (v) return String(v);
  }
  return "";
}

export function formatDateLabel(value: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

export interface CalendarDay {
  key: string;
  empty?: boolean;
  iso?: string;
  day?: number;
  available?: boolean;
}

export function buildCalendarDays(activeMonth: string, availableDates: string[]): CalendarDay[] {
  const md = activeMonth ? new Date(`${activeMonth}-01T00:00:00`) : new Date();
  const year = md.getFullYear();
  const month = md.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const leading = firstDay.getDay();
  const total = lastDay.getDate();
  const set = new Set(availableDates);
  const items: CalendarDay[] = [];

  for (let i = 0; i < leading; i++) items.push({ key: `e-s-${i}`, empty: true });
  for (let d = 1; d <= total; d++) {
    const iso = toLocalIsoDate(new Date(year, month, d));
    items.push({ key: iso, iso, day: d, available: set.has(iso) });
  }
  while (items.length % 7 !== 0) items.push({ key: `e-e-${items.length}`, empty: true });
  return items;
}
