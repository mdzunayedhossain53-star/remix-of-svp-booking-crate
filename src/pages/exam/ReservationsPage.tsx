import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, getSession, getBackendUrl } from "@/lib/api";

function pickArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.data, payload?.items, payload?.result, payload?.payload,
    payload?.exam_reservations, payload?.reservations,
    payload?.data?.items, payload?.data?.result, payload?.data?.payload,
    payload?.data?.exam_reservations, payload?.data?.reservations,
    payload?.result?.items, payload?.result?.exam_reservations,
    payload?.payload?.items, payload?.payload?.exam_reservations,
  ];
  for (const item of candidates) { if (Array.isArray(item)) return item; }
  return [];
}

function value(item: any, keys: string[]) {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null && item?.[key] !== "") return item[key];
    if (item?.data?.[key] !== undefined && item?.data?.[key] !== null && item?.data?.[key] !== "") return item.data[key];
    if (item?.exam_session?.[key] !== undefined && item?.exam_session?.[key] !== null && item?.exam_session?.[key] !== "") return item.exam_session[key];
    if (item?.test_center?.[key] !== undefined && item?.test_center?.[key] !== null && item?.test_center?.[key] !== "") return item.test_center[key];
  }
  return "";
}

function getReservationId(item: any) { return value(item, ["id", "reservation_id", "exam_reservation_id"]); }
function getOccupationId(item: any) { return item?.occupation?.id || value(item, ["occupation_id"]) || ""; }
function getMethodology(item: any) { return value(item, ["methodology", "methodology_type"]) || "in_person"; }
function getStatus(item: any) { return value(item, ["reservation_status", "status", "cbt_exam_status", "payment_status"]) || "Unknown"; }
function getDate(item: any) {
  return item?.exam_session?.test_date || item?.exam_session?.start_at_in_browser_time_zone || value(item, ["exam_date", "scheduled_at", "date", "examDay", "test_date", "start_at_in_browser_time_zone", "start_at"]) || "";
}
function getCenterName(item: any) { return item?.exam_session?.test_center?.name || value(item, ["test_center_name", "name", "site_city", "city"]) || `Site #${getSiteId(item) || "-"}`; }
function getSiteId(item: any) { return item?.exam_session?.test_center?.site_id || value(item, ["site_id"]) || ""; }
function getLanguageCode(item: any) { return value(item, ["language_code", "prometric_code", "code"]) || "-"; }
function getSessionId(item: any) { return value(item, ["exam_session_id"]) || item?.exam_session?.id || ""; }
function canReschedule(item: any) { return Boolean(item?.can_be_rescheduled); }
function canCancel(item: any) { return Boolean(item?.can_be_canceled); }
function getRescheduleReason(item: any) { return item?.cancellation_reason || item?.violation_reason || item?.reservation_status || ""; }

export default function ReservationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  const [downloadingId, setDownloadingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadReservations() {
    setLoading(true); setError(""); setSuccess("");
    try {
      const data = await api("/exam-reservations?locale=en");
      const reservations = pickArray(data);
      setItems(reservations);
      if (!reservations.length) setError("No booked reservations found from the API for this account.");
    } catch (err: any) { setItems([]); setError(err?.message || "Failed to load booked reservations"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadReservations(); }, []);

  async function startReschedule(item: any) {
    const reservationId = getReservationId(item);
    const occupationId = getOccupationId(item);
    if (!reservationId || !occupationId) { setError("Missing reservation ID or occupation ID"); return; }
    setLoadingId(String(reservationId)); setError("");

    try {
      // Try reservation-credits/use first, but don't block reschedule if it fails
      try {
        await api("/reservation-credits/use", {
          method: "POST",
          body: { methodology_type: getMethodology(item), reservation_id: Number(reservationId), occupation_id: Number(occupationId) },
        });
      } catch (creditErr: any) {
        console.warn("reservation-credits/use failed (continuing):", creditErr?.message);
        // Continue to reschedule even if credits call fails
      }

      // Find the prometric code matching the reservation's language_code
      const isoLang = String(getLanguageCode(item) || "");
      const catId = String(item?.category?.id || item?.exam_session?.category?.id || "");
      const prometricCodes = item?.category?.prometric_codes || item?.exam_session?.category?.prometric_codes || [];
      const matchedPrometricCode = prometricCodes.find((c: any) => c?.language_code === isoLang)?.code || isoLang;

      const query = new URLSearchParams({
        reschedule: "1", reservationId: String(reservationId), occupationId: String(occupationId),
        methodology: String(getMethodology(item)), examDate: String(getDate(item) || ""),
        siteId: String(getSiteId(item) || ""), siteCity: String(value(item, ["site_city", "city"]) || item?.exam_session?.test_center?.city || ""),
        languageCode: String(matchedPrometricCode || isoLang || ""),
        categoryId: catId,
      });
      navigate(`/exam/booking?${query.toString()}`);
    } catch (err: any) { setError(err?.message || "Failed to start reschedule"); }
    finally { setLoadingId(""); }
  }

  async function cancelReservation(item: any) {
    const reservationId = getReservationId(item);
    if (!reservationId) { setError("Missing reservation ID"); return; }
    if (!window.confirm(`Are you sure you want to cancel reservation #${reservationId}? This action cannot be undone.`)) return;

    setCancellingId(String(reservationId)); setError(""); setSuccess("");
    try {
      await api(`/exam-reservations/${encodeURIComponent(reservationId)}`, { method: "DELETE" });
      setSuccess(`Reservation #${reservationId} cancelled successfully.`);
      await loadReservations();
    } catch (err: any) { setError(err?.message || "Failed to cancel reservation"); }
    finally { setCancellingId(""); }
  }

  async function downloadTicket(item: any) {
    const reservationId = getReservationId(item);
    if (!reservationId) { setError("Missing reservation ID for ticket download"); return; }
    setDownloadingId(String(reservationId)); setError("");
    try {
      const { accessToken } = getSession();
      const base = getBackendUrl();
      const response = await fetch(`${base}/svp-proxy/tickets/${encodeURIComponent(reservationId)}/show-pdf?locale=en`, {
        method: "GET", headers: { Accept: "*/*", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      });
      if (!response.ok) { throw new Error(await response.text() || "Failed to download ticket PDF"); }
      const contentType = response.headers.get("content-type") || "";
      const disposition = response.headers.get("content-disposition") || "";
      const fallbackFileName = `ticket-${reservationId}.pdf`;
      const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
      const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : fallbackFileName;
      const triggerDownload = (href: string, name: string) => {
        const anchor = document.createElement("a"); anchor.href = href; anchor.download = name;
        document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
      };
      if (contentType.includes("application/json")) {
        const data = await response.json();
        const url = data?.url || data?.pdf_url || data?.data?.url || data?.data?.pdf_url;
        if (!url) throw new Error("Ticket PDF URL not found in response");
        triggerDownload(String(url), fallbackFileName); return;
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      triggerDownload(blobUrl, fileName);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err: any) { setError(err?.message || "Failed to download ticket"); }
    finally { setDownloadingId(""); }
  }

  return (
    <div className="page-shell">
      <div className="page-card">
        <div className="page-head">
          <div>
            <p className="eyebrow">My bookings</p>
            <h1>Booked exams</h1>
            <p className="muted">Your existing bookings should appear here automatically when the page opens.</p>
          </div>
          <div className="actions">
            <Link to="/dashboard" className="secondary-btn">Dashboard</Link>
            <button className="secondary-btn" type="button" onClick={loadReservations} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {success ? <div className="status-card status-success" style={{ background: "#d4edda", color: "#155724", border: "1px solid #c3e6cb" }}>{success}</div> : null}
        {error ? <div className="status-card status-error">{error}</div> : null}
        {loading ? <div className="empty-card">Loading booked reservations...</div> : null}
        {!loading && !items.length ? (
          <div className="empty-card">No reservations are available to show.</div>
        ) : null}

        <div className="reservation-grid">
          {items.map((item) => {
            const rid = getReservationId(item);
            const sid = getSessionId(item);
            return (
              <div className="reservation-card" key={String(rid || sid || "reservation-item")}>
                <div className="reservation-top">
                  <h2>#{rid || "-"}</h2>
                  <span>{getStatus(item)}</span>
                </div>
                <div className="detail-list">
                  <div><span>Test center</span><strong>{getCenterName(item)}</strong></div>
                  <div><span>Exam date</span><strong>{getDate(item) || "-"}</strong></div>
                  <div><span>Occupation</span><strong>{item?.occupation?.english_name || item?.occupation?.name || getOccupationId(item) || "-"}</strong></div>
                  <div><span>Session ID</span><strong>{getSessionId(item) || "-"}</strong></div>
                  <div><span>Language</span><strong>{getLanguageCode(item)}</strong></div>
                  <div><span>Site ID</span><strong>{getSiteId(item) || "-"}</strong></div>
                  <div><span>Methodology</span><strong>{getMethodology(item) || "-"}</strong></div>
                </div>
                <button className="primary-btn" type="button" onClick={() => startReschedule(item)}
                  disabled={loadingId === String(rid) || !canReschedule(item)}>
                  {loadingId === String(rid) ? "Opening..." : canReschedule(item) ? "Reschedule" : "Reschedule unavailable"}
                </button>
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => cancelReservation(item)}
                  disabled={cancellingId === String(rid) || !canCancel(item)}
                  style={{ marginTop: "10px", width: "100%", ...(canCancel(item) ? { background: "#dc3545", color: "#fff", border: "1px solid #dc3545" } : {}) }}
                >
                  {cancellingId === String(rid) ? "Cancelling..." : canCancel(item) ? "Cancel Reservation" : "Cancel unavailable"}
                </button>
                <button className="secondary-btn" type="button" onClick={() => downloadTicket(item)}
                  disabled={downloadingId === String(rid)} style={{ marginTop: "10px", width: "100%" }}>
                  {downloadingId === String(rid) ? "Downloading..." : "Download Ticket PDF"}
                </button>
                {!canReschedule(item) && getRescheduleReason(item) ? (
                  <small style={{ display: "block", marginTop: "8px", color: "#8b3d3d" }}>
                    Reason: {String(getRescheduleReason(item))}
                  </small>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
