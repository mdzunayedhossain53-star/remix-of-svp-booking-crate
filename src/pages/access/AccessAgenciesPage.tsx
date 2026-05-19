import { useState } from "react";
import { useAccessAuth } from "@/contexts/AccessAuthContext";
import { accessAdminApi } from "@/lib/access-api";
import { useNavigate, Link, useLocation } from "react-router-dom";

export default function AccessAgenciesPage() {
  const { user, logout } = useAccessAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      await accessAdminApi("/agencies", { body: { name, email, password, status } });
      setMsg("Agency created successfully!");
      setName(""); setEmail(""); setPassword("");
    } catch (err: any) {
      setMsg(err?.data?.message || err?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() { logout(); navigate("/access/login"); }

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
          <h1 style={{ margin: "0 0 20px" }}>Create Agency Account</h1>

          <div className="booking-card">
            <form onSubmit={submit} style={{ display: "grid", gap: "14px", maxWidth: "500px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, fontSize: "14px", color: "#4c5560" }}>Agency Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agency name" required
                  style={{ width: "100%", padding: "8px 14px", borderRadius: "8px", border: "1px solid #ccc", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, fontSize: "14px", color: "#4c5560" }}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agency@example.com" required
                  style={{ width: "100%", padding: "8px 14px", borderRadius: "8px", border: "1px solid #ccc", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, fontSize: "14px", color: "#4c5560" }}>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" required minLength={8}
                  style={{ width: "100%", padding: "8px 14px", borderRadius: "8px", border: "1px solid #ccc", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 700, fontSize: "14px", color: "#4c5560" }}>Initial Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}
                  style={{ width: "100%", padding: "8px 14px", borderRadius: "8px", border: "1px solid #ccc", boxSizing: "border-box" }}>
                  <option value="PENDING">Pending</option>
                  <option value="ACTIVE">Active</option>
                </select>
              </div>
              <button type="submit" className="auth-submit" disabled={loading} style={{ maxWidth: "200px" }}>
                {loading ? "Creating..." : "Create Agency"}
              </button>
              {msg && <p style={{ color: msg.includes("success") ? "#2e7d32" : "#c62828", fontSize: "14px" }}>{msg}</p>}
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
