import { useAccessAuth } from "@/contexts/AccessAuthContext";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Building2, LogOut } from "lucide-react";

export default function AccessDashboardPage() {
  const { user, logout } = useAccessAuth();
  const navigate = useNavigate();
  const location = useLocation();

  function handleLogout() {
    logout();
    navigate("/access/login");
  }

  const isAdmin = user?.role === "ADMIN";
  const isAgency = user?.role === "AGENCY";

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <strong>Access</strong>
            <span>Control Panel</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <Link
            className={`nav-item ${location.pathname === "/access/dashboard" ? "nav-item--active" : ""}`}
            to="/access/dashboard"
          >
            Dashboard
          </Link>
          {isAdmin && (
            <Link
              className={`nav-item ${location.pathname === "/access/accounts" ? "nav-item--active" : ""}`}
              to="/access/accounts"
            >
              All Accounts
            </Link>
          )}
          {(isAdmin || isAgency) && (
            <Link
              className={`nav-item ${location.pathname === "/access/users" ? "nav-item--active" : ""}`}
              to="/access/users"
            >
              {isAdmin ? "Create Users" : "My Users"}
            </Link>
          )}
          {isAdmin && (
            <Link
              className={`nav-item ${location.pathname === "/access/agencies" ? "nav-item--active" : ""}`}
              to="/access/agencies"
            >
              Create Agency
            </Link>
          )}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar__user">
            <div className="avatar" />
            <div>
              <strong>{user?.name || "User"}</strong>
              <span>{user?.role || "USER"}</span>
            </div>
            <button className="logout-btn" type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <section className="hero">
          <div className="hero__copy">
            <h1>Welcome, {user?.name || "User"}</h1>
            <p>
              {isAdmin
                ? "Manage agencies, users, and account statuses from this panel."
                : isAgency
                ? "Manage your users and monitor their status."
                : "View your account information."}
            </p>
          </div>
          <div className="hero__steps">
            <div className="step">
              <span><LayoutDashboard className="h-4 w-4" /></span>
              <strong>Role: {user?.role}</strong>
            </div>
            <div className="step">
              <span><Users className="h-4 w-4" /></span>
              <strong>Status: {user?.status}</strong>
            </div>
            <div className="step">
              <span><Building2 className="h-4 w-4" /></span>
              <strong>Email: {user?.email}</strong>
            </div>
          </div>
        </section>

        <section className="content">
          <div className="booking-card">
            <div className="booking-card__head">
              <div>
                <span className="label">Account Info</span>
                <h2>Your Account Details</h2>
              </div>
              <div className="booking-card__actions">
                {isAdmin && (
                  <Link className="action-btn action-btn--primary" to="/access/accounts">
                    Manage Accounts
                  </Link>
                )}
              </div>
            </div>
            <div className="booking-card__grid">
              <div><span className="label">Name</span><strong>{user?.name}</strong></div>
              <div><span className="label">Email</span><strong>{user?.email}</strong></div>
              <div><span className="label">Role</span><strong>{user?.role}</strong></div>
              <div><span className="label">Status</span><strong className="success-dot">{user?.status}</strong></div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
