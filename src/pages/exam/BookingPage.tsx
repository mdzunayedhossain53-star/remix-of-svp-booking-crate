import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState, useRef } from "react";
import { api, getSession, getBackendUrl } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import {
  pickArray, normalizeOccupation, normalizeDateValue,
  normalizeAvailableDateEntries, getSessionId, getSessionSiteId, getSessionSiteCity,
  getSessionCenterName, getCenterKey, getPrometricCodes, extractId,
  buildCenterOptions, buildCityOptions, buildDateOptions, buildCalendarDays,
  formatDateLabel, detectBookingMode,
} from "@/lib/booking-utils";




export default function BookingPage() {
  const [searchParams] = useSearchParams();
  const [occupations, setOccupations] = useState<any[]>([]);
  const [availableDateEntries, setAvailableDateEntries] = useState<{ city: string; date: string }[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [testCenterMap, setTestCenterMap] = useState<Map<string, string>>(new Map());
  const [selectedOccupationId, setSelectedOccupationId] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [availableDate, setAvailableDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [methodology, setMethodology] = useState("in_person");
  const [selectedCenterId, setSelectedCenterId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [languageCode, setLanguageCode] = useState("");
  const [holdId, setHoldId] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [loadingOccupations, setLoadingOccupations] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [creatingHold, setCreatingHold] = useState(false);
  const [booking, setBooking] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [showRescheduleConfirm, setShowRescheduleConfirm] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [liveAvailableSeats, setLiveAvailableSeats] = useState<number | null>(null);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [occupationSearch, setOccupationSearch] = useState("");
  const [isOccupationOpen, setIsOccupationOpen] = useState(false);
  const occupationRef = useRef<HTMLDivElement>(null);

  const selectedOccupation = useMemo(
    () => occupations.find((item) => String(item.id) === String(selectedOccupationId)) || null,
    [occupations, selectedOccupationId]
  );
  const filteredOccupations = useMemo(
    () => occupationSearch ? occupations.filter((item) => item.name?.toLowerCase().includes(occupationSearch.toLowerCase())) : occupations,
    [occupations, occupationSearch]
  );
  const cityOptions = useMemo(() => buildCityOptions(availableDateEntries), [availableDateEntries]);
  const availableDates = useMemo(() => buildDateOptions(availableDateEntries, selectedCity), [availableDateEntries, selectedCity]);
  const cityFilteredSessions = useMemo(
    () => selectedCity ? sessions.filter((item) => String(getSessionSiteCity(item)).trim().toLowerCase() === String(selectedCity).trim().toLowerCase()) : sessions,
    [sessions, selectedCity]
  );
  const centerOptions = useMemo(() => {
    const options = buildCenterOptions(cityFilteredSessions);
    // Enrich with real test center names from the map
    return options.map((opt) => ({
      ...opt,
      name: testCenterMap.get(opt.siteId) || opt.name,
    }));
  }, [cityFilteredSessions, testCenterMap]);
  const filteredSessions = useMemo(
    () => selectedCenterId ? cityFilteredSessions.filter((item) => getCenterKey(item) === String(selectedCenterId)) : cityFilteredSessions,
    [cityFilteredSessions, selectedCenterId]
  );
  const selectedSession = useMemo(
    () => filteredSessions.find((item) => String(getSessionId(item)) === String(sessionId)) || null,
    [filteredSessions, sessionId]
  );
  const calendarBaseMonth = calendarMonth || (availableDate ? availableDate.slice(0, 7) : normalizeDateValue(new Date().toISOString()).slice(0, 7));
  const calendarCursorDate = useMemo(() => new Date(`${calendarBaseMonth}-01T00:00:00`), [calendarBaseMonth]);
  const calendarYear = calendarCursorDate.getFullYear();
  const calendarDays = useMemo(
    () => buildCalendarDays(calendarBaseMonth, availableDates),
    [calendarBaseMonth, availableDates]
  );
  const calendarYearOptions = useMemo(() => {
    const years = availableDates.map((item) => Number(String(item).slice(0, 4))).filter((item) => Number.isInteger(item));
    const fallback = new Date().getFullYear();
    const minYear = years.length ? Math.min(...years) : fallback;
    const maxYear = years.length ? Math.max(...years) : fallback + 1;
    const options: number[] = [];
    for (let year = minYear; year <= maxYear; year += 1) options.push(year);
    return options.length ? options : [fallback, fallback + 1];
  }, [availableDates]);
  const bookingMode = useMemo(() => detectBookingMode(balanceInfo), [balanceInfo]);

  useEffect(() => {
    (async () => {
      setLoadingOccupations(true); setError("");
      try {
        const perPage = 200;
        const all: any[] = [];
        let page = 1;
        // Fetch all pages until we get an empty/short page (max 50 pages safety)
        for (; page <= 50; page++) {
          const data = await api(`/occupations?locale=en&per_page=${perPage}&page=${page}`);
          const arr = pickArray(data);
          if (!arr.length) break;
          all.push(...arr);
          if (arr.length < perPage) break;
        }
        // Dedupe by id
        const seen = new Set<string>();
        const unique = all.filter((it) => {
          const k = String(it?.id ?? "");
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        setOccupations(unique.map(normalizeOccupation));
      } catch (err: any) { setError(err?.message || "Failed to load occupations"); }
      finally { setLoadingOccupations(false); }
    })();
  }, []);

  useEffect(() => {
    if (searchParams.get("occupationId")) setSelectedOccupationId(String(searchParams.get("occupationId")));
    if (searchParams.get("categoryId")) setCategoryId(String(searchParams.get("categoryId")));
    if (searchParams.get("languageCode")) setLanguageCode(String(searchParams.get("languageCode")));
    if (searchParams.get("siteCity")) setSelectedCity(String(searchParams.get("siteCity")));
    if (searchParams.get("siteId")) { setSelectedCenterId(String(searchParams.get("siteId"))); setSiteId(String(searchParams.get("siteId"))); }
    if (searchParams.get("siteCity")) setSiteCity(String(searchParams.get("siteCity")));
    if (searchParams.get("examDate")) {
      const examDate = normalizeDateValue(String(searchParams.get("examDate")));
      setAvailableDate(examDate); setCalendarMonth(examDate.slice(0, 7));
    }
    if (searchParams.get("reschedule") === "1") setStatus("Reschedule mode active. Follow the steps to rebook.");
  }, [searchParams]);

  useEffect(() => {
    if (!selectedOccupation) return;
    setCategoryId(String(selectedOccupation.categoryId || ""));
    setLanguageCode((prev) => prev || String(selectedOccupation.languageCodes[0]?.code || ""));
    setMethodology(String(selectedOccupation.methodology || "in_person"));
    setSelectedCity(""); setAvailableDate(""); setAvailableDateEntries([]); setSessions([]);
    setSelectedCenterId(""); setSessionId(""); setHoldId(""); setReservationId("");
  }, [selectedOccupation]);

  useEffect(() => {
    setAvailableDate(""); setSessions([]); setSelectedCenterId(""); setSessionId("");
    setSiteId(""); setSiteCity(selectedCity || ""); setHoldId(""); setReservationId("");
    if (selectedCity) setStatus(`City selected: ${selectedCity}. Loading sessions for the selected date.`);
  }, [selectedCity]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedOccupationId) { setAvailableDateEntries([]); setAvailableDate(""); return; }
      setLoadingDates(true); setError("");
      try {
        const params = new URLSearchParams({
          per_page: "1000", category_id: String(categoryId),
          start_at_date_from: normalizeDateValue(new Date().toISOString()),
          available_seats: "greater_than::0", status: "scheduled", locale: "en",
        });
        const data = await api(`/available-dates?${params.toString()}`);
        if (!active) return;
        const entries = normalizeAvailableDateEntries(pickArray(data));
        const cities = buildCityOptions(entries);
        setAvailableDateEntries(entries);
        setSelectedCity((prev) => (prev && cities.includes(prev) ? prev : cities[0] || ""));
      } catch (err: any) { if (!active) return; setAvailableDateEntries([]); setError(err?.message || "Failed to load available dates"); }
      finally { if (active) setLoadingDates(false); }
    })();
    return () => { active = false; };
  }, [selectedOccupationId, categoryId]);

  useEffect(() => {
    setAvailableDate((prev) => (prev && availableDates.includes(prev) ? prev : availableDates[0] || ""));
    setCalendarMonth(availableDates[0] ? availableDates[0].slice(0, 7) : normalizeDateValue(new Date().toISOString()).slice(0, 7));
  }, [availableDates]);

  useEffect(() => { if (!selectedCity || !availableDates.length) setIsDatePickerOpen(false); }, [selectedCity, availableDates.length]);

  // Close occupation dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (occupationRef.current && !occupationRef.current.contains(e.target as Node)) setIsOccupationOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedOccupationId) { setBalanceInfo(null); return; }
      setLoadingBalance(true);
      try {
        const params = new URLSearchParams({ methodology_type: methodology || "in_person", occupation_id: String(selectedOccupationId), locale: "en" });
        const data = await api(`/user-balance?${params.toString()}`);
        if (!active) return; setBalanceInfo(data);
      } catch { if (!active) return; setBalanceInfo(null); }
      finally { if (active) setLoadingBalance(false); }
    })();
    return () => { active = false; };
  }, [selectedOccupationId, methodology]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedCity || !availableDate || !categoryId) { setSessions([]); return; }
      setLoadingSessions(true); setError("");
      try {
        const params = new URLSearchParams({ category_id: String(categoryId), city: String(selectedCity), exam_date: availableDate, locale: "en" });
        const data = await api(`/exam-sessions?${params.toString()}`);
        if (!active) return; setSessions(pickArray(data));
      } catch (err: any) { if (!active) return; setSessions([]); setError(err?.message || "Failed to load test sessions"); }
      finally { if (active) setLoadingSessions(false); }
    })();
    return () => { active = false; };
  }, [selectedCity, availableDate, categoryId]);

  // Resolve real test center names: prefer SVP exam_session detail (test_center.name),
  // fall back to local DB by site_id. Key map by the same key buildCenterOptions uses.
  useEffect(() => {
    if (!sessions.length) return;
    let active = true;
    (async () => {
      const newMap = new Map(testCenterMap);
      let changed = false;

      // 1. For sessions missing test_center.name, fetch /exam-sessions/:id to get it.
      const needDetail = sessions.filter((s: any) => {
        const key = String(getCenterKey(s));
        if (!key || newMap.has(key)) return false;
        return !s?.test_center?.name && !s?.test_center_name;
      });
      const uniqueIds = Array.from(new Set(needDetail.map((s: any) => String(getSessionId(s))).filter(Boolean)));
      await Promise.all(uniqueIds.map(async (id) => {
        try {
          const detail: any = await api(`/exam-sessions/${encodeURIComponent(id)}?locale=en`);
          const node = detail?.exam_session || detail?.data?.exam_session || detail?.data || detail;
          const tc = node?.test_center;
          const name = tc?.name || tc?.test_center_name || node?.test_center_name;
          if (!name) return;
          const sess = sessions.find((s: any) => String(getSessionId(s)) === id);
          const key = String(getCenterKey({ ...sess, test_center: { ...sess?.test_center, ...tc } }));
          if (key && !newMap.has(key)) { newMap.set(key, name); changed = true; }
        } catch {}
      }));

      // 2. Fallback: query local DB by site_id for any still-missing entries.
      const dbMissing = Array.from(new Set(
        sessions
          .map((s: any) => ({ key: String(getCenterKey(s)), sid: Number(s?.site_id ?? s?.test_center?.site_id) }))
          .filter((x) => x.key && !newMap.has(x.key) && Number.isFinite(x.sid) && x.sid > 0)
          .map((x) => x.sid)
      ));
      if (dbMissing.length) {
        const { data } = await supabase.from("test_centers").select("site_id, name").in("site_id", dbMissing);
        data?.forEach((row: any) => {
          sessions.forEach((s: any) => {
            if (Number(s?.site_id ?? s?.test_center?.site_id) === Number(row.site_id)) {
              const key = String(getCenterKey(s));
              if (key && !newMap.has(key)) { newMap.set(key, row.name); changed = true; }
            }
          });
        });
      }

      if (active && changed) setTestCenterMap(newMap);
    })();
    return () => { active = false; };
  }, [sessions]);

  useEffect(() => {
    if (!centerOptions.length) { setSelectedCenterId(""); return; }
    const hasSelected = centerOptions.some((item) => String(item.siteId) === String(selectedCenterId));
    if (!selectedCenterId || !hasSelected) setSelectedCenterId(String(centerOptions[0].siteId));
  }, [centerOptions, selectedCenterId]);

  useEffect(() => {
    if (!filteredSessions.length) { setSessionId(""); return; }
    const hasSelected = filteredSessions.some((item) => String(getSessionId(item)) === String(sessionId));
    if (!sessionId || !hasSelected) setSessionId(String(getSessionId(filteredSessions[0])));
  }, [filteredSessions, sessionId]);

  useEffect(() => {
    const selectedCenter = centerOptions.find((item) => String(item.siteId) === String(selectedCenterId));
    if (selectedCenter) { setSiteId(String(selectedCenter.siteId || "")); setSiteCity(String(selectedCenter.city || "")); }
  }, [selectedCenterId, centerOptions]);

  useEffect(() => {
    if (!selectedSession) return;
    setSiteId(String(getSessionSiteId(selectedSession) || ""));
    setSiteCity(String(getSessionSiteCity(selectedSession) || ""));
    const codes = getPrometricCodes(selectedSession);
    if (codes[0]?.code || codes[0]?.language_code) setLanguageCode(String(codes[0].code || codes[0].language_code));
  }, [selectedSession]);

  // Fetch live available_seats from exam_reservations API for the selected session
  useEffect(() => {
    let active = true;
    (async () => {
      if (!sessionId) { setLiveAvailableSeats(null); setLoadingSeats(false); return; }
      setLoadingSeats(true);
      const findSeats = (payload: any): number | null => {
        const findInNode = (n: any): number | null => {
          if (!n || typeof n !== "object") return null;
          const es = n.exam_session;
          if (es && String(es.id) === String(sessionId)) {
            const s = es.available_seats ?? es.seats_available ?? es.remaining_seats;
            if (s != null) return Number(s);
          }
          if (String(n.id) === String(sessionId)) {
            const s = n.available_seats ?? n.seats_available ?? n.remaining_seats;
            if (s != null) return Number(s);
          }
          return null;
        };
        const arr = pickArray(payload);
        for (const it of arr) { const v = findInNode(it); if (v != null) return v; }
        const direct = findInNode(payload?.data || payload?.exam_session || payload);
        return direct;
      };
      try {
        let seats: number | null = null;
        // Try plural endpoint first (more reliable)
        try {
          const r0: any = await api(`/exam-sessions/${encodeURIComponent(sessionId)}?locale=en`);
          seats = findSeats(r0);
        } catch {}
        if (seats == null) {
          try {
            const r1: any = await api(`/exam-reservations?locale=en&exam_session_id=${encodeURIComponent(sessionId)}`);
            seats = findSeats(r1);
          } catch {}
        }
        if (seats == null) {
          try {
            const r2: any = await api(`/exam-session/${encodeURIComponent(sessionId)}?locale=en`);
            seats = findSeats(r2);
          } catch {}
        }
        if (!active) return;
        if (seats == null) {
          const fallback = (selectedSession as any)?.available_seats ?? (selectedSession as any)?.seats_available;
          seats = fallback != null ? Number(fallback) : null;
        }
        setLiveAvailableSeats(seats);
      } catch {
        if (!active) return;
        const fallback = (selectedSession as any)?.available_seats ?? (selectedSession as any)?.seats_available;
        setLiveAvailableSeats(fallback != null ? Number(fallback) : null);
      } finally {
        if (active) setLoadingSeats(false);
      }
    })();
    return () => { active = false; };
  }, [sessionId, selectedSession]);

  async function createHold() {
    if (!sessionId) { setError("Select test center / session first"); return; }
    const sessionIds = Array.from(new Set(
      (filteredSessions.length ? filteredSessions : [selectedSession])
        .map((item) => Number(getSessionId(item))).filter((item) => Number.isFinite(item) && item > 0)
    ));
    if (!sessionIds.length) { setError("No valid exam sessions found for hold creation"); return; }
    setCreatingHold(true); setError(""); setStatus("");
    try {
      const data = await api("/temporary-seats", { method: "POST", body: { exam_session_id: sessionIds, methodology: methodology || "in_person" } });
      const nextHoldId = extractId(data, ["id", "hold_id", "temporary_seat_id"]);
      setHoldId(String(nextHoldId || ""));
      setStatus(nextHoldId ? `Hold created: #${nextHoldId}` : "Hold created");
    } catch (err: any) { setError(err?.message || "Failed to create hold"); }
    finally { setCreatingHold(false); }
  }

  async function bookReservation() {
    if (!sessionId) { setError("Select test center / session first"); return; }
    try { await api(`/exam-session/${encodeURIComponent(sessionId)}?locale=en`); }
    catch (err: any) { setError(err?.message || "Selected exam session is no longer available"); return; }
    const sessionCodes = getPrometricCodes(selectedSession);
    const effectiveLanguageCode = languageCode || selectedOccupation?.languageCodes?.[0]?.code || sessionCodes?.[0]?.code || sessionCodes?.[0]?.language_code || "";
    if (!effectiveLanguageCode) { setError("language_code is required. Select a language before booking."); return; }

    // For reschedule, ensure we use the prometric code (e.g. "LOABB") not ISO code (e.g. "bn")
    let rescheduleLanguageCode = effectiveLanguageCode;
    if (searchParams.get("reschedule") === "1" && selectedOccupation?.languageCodes?.length) {
      // If the current code looks like an ISO code (2-3 chars), find the matching prometric code
      if (effectiveLanguageCode.length <= 3) {
        const match = selectedOccupation.languageCodes.find(
          (lc: any) => lc.code?.toLowerCase() !== effectiveLanguageCode.toLowerCase() && effectiveLanguageCode.length <= 3
        );
        // Actually search by checking if any prometric code's raw data has this language_code
        const allCodes = selectedOccupation?.raw?.category?.prometric_codes || selectedOccupation?.raw?.prometric_codes || [];
        const prometricMatch = allCodes.find((c: any) => c?.language_code === effectiveLanguageCode);
        if (prometricMatch?.code) rescheduleLanguageCode = prometricMatch.code;
      }
    }

    setBooking(true); setError(""); setStatus("");
    try {
      const oldReservationId = searchParams.get("reservationId");
      const isReschedule = searchParams.get("reschedule") === "1" && oldReservationId;

      if (isReschedule) {
        // Use the dedicated reschedule endpoint
        setStatus("Rescheduling reservation...");
        const data = await api(`/exam-reservations/${encodeURIComponent(oldReservationId)}/reschedule`, {
          method: "POST",
          body: {
            id: Number(oldReservationId),
            exam_session_id: Number(sessionId),
            language_code: rescheduleLanguageCode,
          },
        });
        const nextReservationId = extractId(data, ["id", "reservation_id", "exam_reservation_id"]) || oldReservationId;
        setReservationId(String(nextReservationId || ""));
        setStatus(`Reservation rescheduled successfully: #${nextReservationId}`);
        if (nextReservationId) await openTicketPdf(String(nextReservationId));
      } else {
        // Normal new booking
        const data: any = await api("/exam-reservations", {
          method: "POST", body: {
            exam_session_id: Number(sessionId), occupation_id: Number(selectedOccupationId),
            methodology: methodology || "in_person", language_code: effectiveLanguageCode,
            site_id: siteId ? Number(siteId) : null, site_city: siteCity || selectedCity || null,
            hold_id: holdId ? Number(holdId) : null,
          },
        });
        const nextReservationId = extractId(data, ["id", "reservation_id", "exam_reservation_id"]);
        setReservationId(String(nextReservationId || ""));
        // Update live seats from response if present
        const respSeats = data?.exam_session?.available_seats ?? data?.data?.exam_session?.available_seats;
        if (respSeats != null && String(data?.exam_session?.id ?? data?.data?.exam_session?.id) === String(sessionId)) {
          setLiveAvailableSeats(Number(respSeats));
        }
        if (nextReservationId && bookingMode.type === "reservation_credit") {
          try {
            await api("/reservation-credits/use", {
              method: "POST",
              body: {
                methodology_type: methodology || "in_person",
                reservation_id: Number(nextReservationId),
                occupation_id: Number(selectedOccupationId),
              },
            });
          } catch (creditErr: any) {
            console.warn("reservation-credits/use failed after booking (continuing):", creditErr?.message);
          }
        }
        setStatus(nextReservationId ? `Reservation confirmed: #${nextReservationId}` : "Reservation created");
        if (nextReservationId) await openTicketPdf(String(nextReservationId));
      }
    } catch (err: any) { setError(err?.message || "Failed to book reservation"); }
    finally { setBooking(false); }
  }

  async function openTicketPdf(nextReservationId: string) {
    const { accessToken } = getSession();
    const base = getBackendUrl();
    const response = await fetch(`${base}/svp-proxy/tickets/${encodeURIComponent(nextReservationId)}/show-pdf?locale=en`, {
      method: "GET", headers: { Accept: "*/*", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    });
    if (!response.ok) { throw new Error(await response.text() || "Failed to open ticket PDF"); }
    const contentType = response.headers.get("content-type") || "";
    const disposition = response.headers.get("content-disposition") || "";
    const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
    const fallbackFileName = `ticket-${nextReservationId}.pdf`;
    const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : fallbackFileName;
    function triggerDownload(href: string, name: string) {
      const anchor = document.createElement("a"); anchor.href = href; anchor.download = name;
      document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
    }
    if (contentType.includes("application/json")) {
      const data = await response.json();
      const url = data?.url || data?.pdf_url || data?.data?.url || data?.data?.pdf_url;
      if (url) { triggerDownload(String(url), fallbackFileName); return; }
      throw new Error("Ticket PDF URL not found in response");
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    triggerDownload(blobUrl, fileName);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }

  function shiftCalendarMonth(delta: number) {
    const base = new Date(`${calendarBaseMonth}-01T00:00:00`);
    base.setMonth(base.getMonth() + delta);
    setCalendarMonth(`${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`);
  }

  function pickDateFromCalendar(nextDate: string) {
    setAvailableDate(nextDate); setCalendarMonth(nextDate.slice(0, 7)); setIsDatePickerOpen(false);
  }

  return (
    <div className="booking-shell">
      <div className="booking-modal">
        <div className="modal-head">
          <h1>Create New Booking</h1>
          <Link to="/dashboard" className="close-link" aria-label="Close">x</Link>
        </div>
        <div className="modal-meta-links">
          <Link to="/exam/reservations">My bookings</Link>
          <Link to="/dashboard">Dashboard</Link>
        </div>

        {status ? <div className="notice notice--ok">{status}</div> : null}
        {error ? <div className="notice notice--error">{error}</div> : null}

        <div className="form-grid">
          <div className="field-block">
            <span>Category ID</span>
            <div className="readonly-value">{categoryId || "—"}</div>
          </div>
          <div className="field-block">
            <span>Methodology</span>
            <div className="readonly-value">{methodology}</div>
          </div>
          <div className="field-block field-block--occupation" ref={occupationRef}>
            <span>Occupation *</span>
            <button type="button" className="date-trigger" onClick={() => setIsOccupationOpen((p) => !p)}>
              <span className={selectedOccupation ? "" : "placeholder-text"}>
                {selectedOccupation ? selectedOccupation.name : (loadingOccupations ? "Loading..." : "Select occupation")}
              </span>
              <span className="date-trigger__icon">▾</span>
            </button>
            {isOccupationOpen && (
              <div className="occupation-dropdown">
                <input
                  type="text"
                  className="occupation-search"
                  placeholder="Search occupation..."
                  value={occupationSearch}
                  onChange={(e) => setOccupationSearch(e.target.value)}
                  autoFocus
                />
                <div className="occupation-list">
                  {filteredOccupations.length === 0 && (
                    <div className="occupation-empty">No results found</div>
                  )}
                  {filteredOccupations.map((item) => (
                    <button key={item.id} type="button"
                      className={`occupation-item${String(item.id) === String(selectedOccupationId) ? " occupation-item--active" : ""}`}
                      onClick={() => { setSelectedOccupationId(String(item.id)); setIsOccupationOpen(false); setOccupationSearch(""); }}>
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="field-block">
            <span>City *</span>
            <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)} disabled={!selectedOccupationId}>
              <option value="">Select city</option>
              {cityOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="field-block field-block--datepicker">
            <span>Available Date *</span>
            <button type="button" className="date-trigger" onClick={() => setIsDatePickerOpen((prev) => !prev)}
              disabled={loadingDates || !availableDates.length || !selectedCity}>
              <span>{availableDate ? formatDateLabel(availableDate) : "Select available date..."}</span>
              <span className="date-trigger__icon">[]</span>
            </button>
            {isDatePickerOpen && selectedCity && availableDates.length ? (
              <div className="date-popup">
                <div className="date-popup__head">
                  <strong>Select Date</strong>
                  <button type="button" className="icon-btn" onClick={() => setIsDatePickerOpen(false)}>x</button>
                </div>
                <div className="date-popup__toolbar">
                  <button type="button" className="icon-btn" onClick={() => shiftCalendarMonth(-1)}>{"<"}</button>
                  <select className="toolbar-select" value={calendarCursorDate.getMonth()}
                    onChange={(e) => { const next = new Date(calendarCursorDate); next.setMonth(Number(e.target.value)); setCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`); }}>
                    {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{new Date(2000, index, 1).toLocaleDateString("en-US", { month: "long" })}</option>)}
                  </select>
                  <select className="toolbar-select" value={calendarYear}
                    onChange={(e) => { const next = new Date(calendarCursorDate); next.setFullYear(Number(e.target.value)); setCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`); }}>
                    {calendarYearOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <button type="button" className="icon-btn" onClick={() => shiftCalendarMonth(1)}>{">"}</button>
                </div>
                <div className="calendar-weekdays">
                  <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                </div>
                <div className="calendar-grid">
                  {calendarDays.map((item) =>
                    item.empty ? <div key={item.key} className="calendar-cell calendar-cell--empty" /> : (
                      <button key={item.key} type="button"
                        className={`calendar-cell${item.available ? " calendar-cell--available" : ""}${item.iso === availableDate ? " calendar-cell--active" : ""}`}
                        onClick={() => item.available && pickDateFromCalendar(item.iso!)} disabled={!item.available}>
                        <span>{item.day}</span>
                      </button>
                    )
                  )}
                </div>
              </div>
            ) : null}
          </div>
          {!loadingDates && selectedCity && !availableDates.length ? (
            <small className="error-text">No available dates found yet. Try another city or occupation.</small>
          ) : null}
          <div className="field-block">
            <span>Test Center *</span>
            <select value={selectedCenterId} onChange={(e) => setSelectedCenterId(e.target.value)} disabled={!centerOptions.length}>
              <option value="">{loadingSessions ? "Loading centers..." : "Select test center"}</option>
              {centerOptions.map((item) => <option key={item.siteId} value={item.siteId}>{item.name} (Site #{item.siteId})</option>)}
            </select>
          </div>
          <div className="field-block">
            <span>Exam Session *</span>
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={!filteredSessions.length}>
              <option value="">{loadingSessions ? "Loading sessions..." : "Select session"}</option>
              {filteredSessions.map((item) => {
                const sid = getSessionSiteId(item);
                const realName = testCenterMap.get(String(sid)) || getSessionCenterName(item);
                const seats = item?.available_seats ?? item?.seats_available ?? item?.remaining_seats ?? null;
                return (
                  <option key={getSessionId(item)} value={getSessionId(item)}>
                    {realName} (Site #{sid}) | Session #{getSessionId(item)}{seats !== null && seats !== undefined ? ` | Seats: ${seats}` : ""}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="field-block">
            <span>Language *</span>
            <select value={languageCode} onChange={(e) => setLanguageCode(e.target.value)}>
              <option value="">Select language</option>
              {selectedOccupation?.languageCodes.map((item: any, idx: number) => (
                <option key={`${item.code}-${idx}`} value={item.code}>{item.englishName} {item.code ? `(${item.code})` : ""}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="meta-grid">
          <div><span>Booking Type:</span> <strong>{loadingBalance ? "Checking..." : bookingMode.label}</strong></div>
          <div><span>Reservation Credits:</span> <strong>{loadingBalance ? "-" : bookingMode.reservationCredits}</strong></div>
          <div><span>Free Certificates:</span> <strong>{loadingBalance ? "-" : bookingMode.freeCertificates}</strong></div>
          <div><span>Available Seats:</span> <strong>{loadingSeats ? "Loading..." : (liveAvailableSeats !== null ? liveAvailableSeats : (selectedSession ? (selectedSession.available_seats ?? selectedSession.seats_available ?? "-") : "-"))}</strong></div>
          <div><span>City:</span> <strong>{siteCity || selectedCity || "-"}</strong></div>
          <div><span>Site ID:</span> <strong>{siteId || "-"}</strong></div>
          <div><span>Hold ID:</span> <strong>{holdId || "-"}</strong></div>
          <div><span>Booking No:</span> <strong>{reservationId || "-"}</strong></div>
        </div>

        <div className="actions-row">
          <button className="ghost-btn" type="button" onClick={createHold} disabled={creatingHold || !sessionId}>
            {creatingHold ? "Creating hold..." : "Create Hold"}
          </button>
          {searchParams.get("reschedule") === "1" ? (
            <button className="primary-btn" type="button" onClick={() => setShowRescheduleConfirm(true)} disabled={booking || !sessionId}>
              {booking ? "Confirming..." : "Confirm Reschedule"}
            </button>
          ) : (
            <button className="primary-btn" type="button" onClick={bookReservation} disabled={booking || !sessionId}>
              {booking ? "Confirming..." : "Confirm Booking"}
            </button>
          )}
        </div>

        {/* Reschedule Confirmation Dialog */}
        {showRescheduleConfirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
            <div style={{ background: "#fff", borderRadius: "12px", padding: "28px 32px", maxWidth: "520px", width: "90%", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}>
              <h2 style={{ margin: "0 0 18px", fontSize: "18px", fontWeight: 700 }}>Confirm Reschedule</h2>
              <p style={{ margin: "0 0 16px", color: "#666", fontSize: "14px" }}>
                This will <strong style={{ color: "#2563eb" }}>reschedule</strong> your existing reservation to a new session.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                {/* Old reservation */}
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#dc3545", marginBottom: "8px", textTransform: "uppercase" }}>Old Reservation</div>
                  <div style={{ fontSize: "13px", lineHeight: "1.6" }}>
                    <div><span style={{ color: "#888" }}>ID:</span> <strong>#{searchParams.get("reservationId") || "-"}</strong></div>
                    <div><span style={{ color: "#888" }}>Date:</span> <strong>{searchParams.get("examDate") || "-"}</strong></div>
                    <div><span style={{ color: "#888" }}>Site:</span> <strong>#{searchParams.get("siteId") || "-"}</strong></div>
                    <div><span style={{ color: "#888" }}>City:</span> <strong>{searchParams.get("siteCity") || "-"}</strong></div>
                  </div>
                </div>

                {/* New reservation */}
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "14px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#16a34a", marginBottom: "8px", textTransform: "uppercase" }}>New Reservation</div>
                  <div style={{ fontSize: "13px", lineHeight: "1.6" }}>
                    <div><span style={{ color: "#888" }}>Session:</span> <strong>#{sessionId || "-"}</strong></div>
                    <div><span style={{ color: "#888" }}>Date:</span> <strong>{availableDate || "-"}</strong></div>
                    <div><span style={{ color: "#888" }}>Site:</span> <strong>#{siteId || "-"}</strong></div>
                    <div><span style={{ color: "#888" }}>City:</span> <strong>{siteCity || selectedCity || "-"}</strong></div>
                    <div><span style={{ color: "#888" }}>Center:</span> <strong>{centerOptions.find(c => String(c.siteId) === String(selectedCenterId))?.name || "-"}</strong></div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowRescheduleConfirm(false)}
                  style={{ padding: "10px 20px", borderRadius: "6px", border: "1px solid #ddd", background: "#f5f5f5", cursor: "pointer", fontWeight: 500 }}>
                  Cancel
                </button>
                <button type="button" disabled={booking}
                  onClick={() => { setShowRescheduleConfirm(false); bookReservation(); }}
                  style={{ padding: "10px 20px", borderRadius: "6px", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                  {booking ? "Processing..." : "Yes, Reschedule"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
