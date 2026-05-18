import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiAuth, clearSession, getSession } from "@/lib/api";

function decodeJwtPayload(token: string) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const { accessToken } = getSession();
    if (!accessToken) { navigate("/auth/login"); return; }
    const payload = decodeJwtPayload(accessToken);
    setMe(payload ? { login: payload.login || "User" } : { login: "User" });
    setLoading(false);
  }, [navigate]);

  async function handleLogout() {
    setLoggingOut(true);
    setError("");
    try {
      const { sessionId } = getSession();
      await apiAuth("/logout", { sessionId });
    } catch (err: any) {
      setError(err?.message || "Logout failed");
    } finally {
      clearSession();
      setLoggingOut(false);
      navigate("/auth/login");
    }
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <strong>Professional</strong>
            <span>Accreditation</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <Link className="nav-item nav-item--active" to="/dashboard">Account Dashboard</Link>
          <Link className="nav-item" to="/exam/reservations">My bookings</Link>
          <Link className="nav-item" to="/exam/booking">New booking</Link>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar__locale">العربية</div>
          <div className="topbar__user">
            <div className="avatar" />
            <div>
              <strong>{loading ? "Loading..." : me?.name || me?.login || "User"}</strong>
              <span>{me?.role || "Labor"}</span>
            </div>
            <button className="logout-btn" type="button" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </header>

        <section className="hero">
          <div className="hero__copy">
            <h1>Advance your career through professional accreditation</h1>
            <p>Use your dashboard to manage bookings, review current reservations, and continue your accreditation process from one place.</p>
            <Link className="hero__cta" to="/exam/booking">Start Verification</Link>
          </div>
          <div className="hero__steps">
            <div className="step"><span>1</span><strong>Select your occupation</strong></div>
            <div className="step"><span>2</span><strong>Enter your data</strong></div>
            <div className="step"><span>3</span><strong>Review and confirm your information</strong></div>
            <div className="step"><span>4</span><strong>Pay for the verification</strong></div>
          </div>
        </section>

        {error ? <div className="error-card">{error}</div> : null}

        <section className="content">
          <div className="tabs">
            <span className="tabs__item tabs__item--active">Bookings</span>
            <span className="tabs__item">Requests</span>
          </div>
          <div className="booking-card">
            <div className="booking-card__head">
              <div>
                <span className="label">Occupation</span>
                <h2>Manage your exam bookings</h2>
              </div>
              <div className="booking-card__actions">
                <Link className="action-btn action-btn--primary" to="/exam/booking">New booking</Link>
                <Link className="action-btn" to="/exam/reservations">View details</Link>
              </div>
            </div>
            <div className="booking-card__grid">
              <div><span className="label">Account</span><strong>{loading ? "Loading..." : me?.email || me?.login || "-"}</strong></div>
              <div><span className="label">Booking status</span><strong className="success-dot">Ready</strong></div>
              <div><span className="label">Methodology</span><strong>Direct Assessment</strong></div>
              <div><span className="label">Actions</span><strong>Book, review, reschedule</strong></div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
