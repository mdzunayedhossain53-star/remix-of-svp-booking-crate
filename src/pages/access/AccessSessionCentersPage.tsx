import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAccessAuth } from "@/contexts/AccessAuthContext";
import { accessAdminApi } from "@/lib/access-api";

type TestCenter = { site_id: number; name: string; city: string | null };
type Mapping = {
  exam_session_id: number;
  site_id: number;
  notes: string | null;
  center_name: string | null;
  center_city: string | null;
  updated_at: string;
};

export default function AccessSessionCentersPage() {
  const { user, logout } = useAccessAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [centers, setCenters] = useState<TestCenter[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [examSessionId, setExamSessionId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    (async () => {
      try {
        const tc = await accessAdminApi<{ test_centers: TestCenter[] }>("/test-centers");
        setCenters(tc.test_centers || []);
      } catch (err: any) { setMsg(err?.message || "Failed to load test centers"); }
    })();
    fetchMappings();
  }, [user]);

  async function fetchMappings() {
    setListLoading(true);
    try {
      const r = await accessAdminApi<{ mappings: Mapping[] }>("/session-centers");
      setMappings(r.mappings || []);
    } catch (err: any) { setMsg(err?.message || "Failed to load mappings"); }
    finally { setListLoading(false); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg("");
    try {
      await accessAdminApi("/session-centers", {
        method: "POST",
        body: { examSessionId: Number(examSessionId), siteId: Number(siteId), notes: notes || undefined },
      });
      setMsg(`Mapping saved: session ${examSessionId} → ${centers.find((c) => c.site_id === Number(siteId))?.name || siteId}`);
      setExamSessionId(""); setSiteId(""); setNotes("");
      fetchMappings();
    } catch (err: any) {
      setMsg(err?.data?.message || err?.message || "Failed");
    } finally { setLoading(false); }
  }

  async function remove(id: number) {
    if (!confirm(`Delete mapping for session ${id}?`)) return;
    try {
      await accessAdminApi(`/session-centers/${id}`, { method: "DELETE" });
      setMsg(`Mapping ${id} deleted`);
      fetchMappings();
    } catch (err: any) { setMsg(err?.message || "Failed to delete"); }
  }

  function handleLogout() { logout(); navigate("/access/login"); }

  const filtered = search
    ? mappings.filter((m) =>
        String(m.exam_session_id).includes(search) ||
        String(m.site_id).includes(search) ||
        m.center_name?.toLowerCase().includes(search.toLowerCase()) ||
        m.center_city?.toLowerCase().includes(search.toLowerCase())
      )
    : mappings;

  const thStyle: React.CSSProperties = { padding: "12px 16px", fontSize: "12px", textTransform: "uppercase", color: "#6d7680", fontWeight: 700 };
  const tdStyle: React.CSSProperties = { padding: "12px 16px", fontSize: "14px" };

  if (user?.role !== "ADMIN") {
    return <div style={{ padding: 40 }}>Admin access required.</div>;
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div><strong>Access</strong><span>Control Panel</span></div>
        </div>
        <nav className="sidebar-nav">
          <Link className={`nav-item ${location.pathname === "/access/dashboard" ? "nav-item--active" : ""}`} to="/access/dashboard">Dashboard</Link>
          <Link className={`nav-item ${location.pathname === "/access/accounts" ? "nav-item--active" : ""}`} to="/access/accounts">All Accounts</Link>
          <Link className={`nav-item ${location.pathname === "/access/users" ? "nav-item--active" : ""}`} to="/access/users">Create Users</Link>
          <Link className={`nav-item ${location.pathname === "/access/agencies" ? "nav-item--active" : ""}`} to="/access/agencies">Create Agency</Link>
          <Link className={`nav-item ${location.pathname === "/access/test-centers" ? "nav-item--active" : ""}`} to="/access/test-centers">Test Centers</Link>
          <Link className={`nav-item ${location.pathname === "/access/session-centers" ? "nav-item--active" : ""}`} to="/access/session-centers">Session Centers</Link>
          <Link className={`nav-item ${location.pathname === "/access/section-rules" ? "nav-item--active" : ""}`} to="/access/section-rules">Section Rules</Link>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar__user">
            <div className="avatar" />
            <div><strong>{user?.name}</strong><span>{user?.role}</span></div>
            <button className="logout-btn" type="button" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <section style={{ padding: "24px 40px" }}>
          <h1 style={{ margin: "0 0 8px" }}>Exam Session → Test Center Mapping</h1>
          <p style={{ margin: "0 0 20px", color: "#6d7680", fontSize: 14 }}>
            SVP API often returns <code>site_id: null</code> for exam sessions. Map each exam session ID to a specific test center here so the booking page can resolve them deterministically.
          </p>

          <div className="booking-card" style={{ marginBottom: 24 }}>
            <form onSubmit={save} style={{ display: "grid", gap: 14, maxWidth: 560 }}>
              <div>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 14, color: "#4c5560" }}>Exam Session ID (from SVP)</label>
                <input value={examSessionId} onChange={(e) => setExamSessionId(e.target.value)} placeholder="e.g. 9001" required type="number"
                  style={{ width: "100%", padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 14, color: "#4c5560" }}>Test Center</label>
                <select value={siteId} onChange={(e) => setSiteId(e.target.value)} required
                  style={{ width: "100%", padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", boxSizing: "border-box" }}>
                  <option value="">— Choose a test center —</option>
                  {centers.map((c) => (
                    <option key={c.site_id} value={c.site_id}>
                      #{c.site_id} — {c.name}{c.city ? ` (${c.city})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 14, color: "#4c5560" }}>Notes (optional)</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. confirmed via SVP support"
                  style={{ width: "100%", padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", boxSizing: "border-box" }} />
              </div>
              <button type="submit" className="auth-submit" disabled={loading} style={{ maxWidth: 200 }}>
                {loading ? "Saving..." : "Save mapping"}
              </button>
              {msg && <p style={{ color: msg.toLowerCase().includes("fail") || msg.toLowerCase().includes("error") ? "#c62828" : "#2e7d32", fontSize: 14 }}>{msg}</p>}
            </form>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Saved mappings ({mappings.length})</h2>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search session, site, name, city…"
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", minWidth: 260 }} />
          </div>

          {listLoading ? <p>Loading...</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 12, overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: "#f5f7fa", textAlign: "left" }}>
                    <th style={thStyle}>Session ID</th>
                    <th style={thStyle}>Site ID</th>
                    <th style={thStyle}>Center Name</th>
                    <th style={thStyle}>City</th>
                    <th style={thStyle}>Notes</th>
                    <th style={thStyle}>Updated</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr key={m.exam_session_id} style={{ borderTop: "1px solid #e8ecf0" }}>
                      <td style={tdStyle}><strong>{m.exam_session_id}</strong></td>
                      <td style={tdStyle}>#{m.site_id}</td>
                      <td style={tdStyle}>{m.center_name || "—"}</td>
                      <td style={tdStyle}>{m.center_city || "—"}</td>
                      <td style={tdStyle}>{m.notes || "—"}</td>
                      <td style={tdStyle}>{new Date(m.updated_at).toLocaleString()}</td>
                      <td style={tdStyle}>
                        <button onClick={() => remove(m.exam_session_id)}
                          style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #c62828", background: "#ffebee", color: "#c62828", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <p style={{ color: "#999", marginTop: 12 }}>No mappings yet.</p>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
