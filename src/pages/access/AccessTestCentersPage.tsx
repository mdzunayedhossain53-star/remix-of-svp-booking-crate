import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAccessAuth } from "@/contexts/AccessAuthContext";
import { accessAdminApi } from "@/lib/access-api";

type TestCenter = {
  site_id: number;
  name: string;
  city: string | null;
  country_code: string | null;
  address: string | null;
};

export default function AccessTestCentersPage() {
  const { user, logout } = useAccessAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [centers, setCenters] = useState<TestCenter[]>([]);
  const [siteId, setSiteId] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [countryCode, setCountryCode] = useState("BD");
  const [address, setAddress] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    fetchCenters();
  }, [user]);

  async function fetchCenters() {
    setListLoading(true);
    try {
      const r = await accessAdminApi<{ test_centers: TestCenter[] }>("/test-centers");
      setCenters(r.test_centers || []);
    } catch (err: any) {
      setMsg(err?.message || "Failed to load test centers");
    } finally {
      setListLoading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      await accessAdminApi("/test-centers", {
        method: "POST",
        body: {
          siteId: Number(siteId),
          name,
          city: city || undefined,
          countryCode: countryCode || undefined,
          address: address || undefined,
        },
      });
      setMsg(`Test center saved: #${siteId} — ${name}`);
      setSiteId(""); setName(""); setCity(""); setAddress("");
      fetchCenters();
    } catch (err: any) {
      setMsg(err?.data?.message || err?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  function edit(c: TestCenter) {
    setSiteId(String(c.site_id));
    setName(c.name);
    setCity(c.city || "");
    setCountryCode(c.country_code || "BD");
    setAddress(c.address || "");
    setMsg(`Editing #${c.site_id}. Saving will update (upsert by site_id).`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: number) {
    if (!confirm(`Delete test center #${id}?`)) return;
    try {
      await accessAdminApi(`/test-centers/${id}`, { method: "DELETE" });
      setMsg(`Test center #${id} deleted`);
      fetchCenters();
    } catch (err: any) {
      setMsg(err?.data?.message || err?.message || "Failed to delete");
    }
  }

  function handleLogout() { logout(); navigate("/access/login"); }

  const filtered = search
    ? centers.filter((c) =>
        String(c.site_id).includes(search) ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.city?.toLowerCase().includes(search.toLowerCase()))
    : centers;

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
          <h1 style={{ margin: "0 0 8px" }}>Test Centers</h1>
          <p style={{ margin: "0 0 20px", color: "#6d7680", fontSize: 14 }}>
            Add or edit test centers across cities (Dhaka, Chittagong, Khulna, Sylhet, Rajshahi, etc.). Centers added here will appear in the dropdown on the <strong>Session Centers</strong> page so you can map exam sessions to them.
          </p>

          <div className="booking-card" style={{ marginBottom: 24 }}>
            <form onSubmit={save} style={{ display: "grid", gap: 14, maxWidth: 640 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 14, color: "#4c5560" }}>Site ID (from Prometric/SVP)</label>
                  <input value={siteId} onChange={(e) => setSiteId(e.target.value)} placeholder="e.g. 107" required type="number"
                    style={{ width: "100%", padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 14, color: "#4c5560" }}>Country Code</label>
                  <input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="BD" maxLength={2}
                    style={{ width: "100%", padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", boxSizing: "border-box" }} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 14, color: "#4c5560" }}>Center Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Technical Training Centre (TTC), Dhaka" required
                  style={{ width: "100%", padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 14, color: "#4c5560" }}>City</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Dhaka"
                  style={{ width: "100%", padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 14, color: "#4c5560" }}>Address (optional)</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area"
                  style={{ width: "100%", padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", boxSizing: "border-box" }} />
              </div>
              <button type="submit" className="auth-submit" disabled={loading} style={{ maxWidth: 220 }}>
                {loading ? "Saving..." : "Save test center"}
              </button>
              {msg && <p style={{ color: msg.toLowerCase().includes("fail") || msg.toLowerCase().includes("cannot") || msg.toLowerCase().includes("error") ? "#c62828" : "#2e7d32", fontSize: 14 }}>{msg}</p>}
            </form>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>All test centers ({centers.length})</h2>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search site, name, city…"
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", minWidth: 260 }} />
          </div>

          {listLoading ? <p>Loading...</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 12, overflow: "hidden" }}>
                <thead>
                  <tr style={{ background: "#f5f7fa", textAlign: "left" }}>
                    <th style={thStyle}>Site ID</th>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>City</th>
                    <th style={thStyle}>Country</th>
                    <th style={thStyle}>Address</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.site_id} style={{ borderTop: "1px solid #e8ecf0" }}>
                      <td style={tdStyle}><strong>#{c.site_id}</strong></td>
                      <td style={tdStyle}>{c.name}</td>
                      <td style={tdStyle}>{c.city || "—"}</td>
                      <td style={tdStyle}>{c.country_code || "—"}</td>
                      <td style={tdStyle}>{c.address || "—"}</td>
                      <td style={tdStyle}>
                        <button onClick={() => edit(c)}
                          style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #1565c0", background: "#e3f2fd", color: "#1565c0", cursor: "pointer", fontSize: 12, fontWeight: 600, marginRight: 6 }}>
                          Edit
                        </button>
                        <button onClick={() => remove(c.site_id)}
                          style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #c62828", background: "#ffebee", color: "#c62828", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <p style={{ color: "#999", marginTop: 12 }}>No test centers yet.</p>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
