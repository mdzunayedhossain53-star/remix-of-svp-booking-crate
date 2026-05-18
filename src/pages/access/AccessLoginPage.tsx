import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAccessAuth } from "@/contexts/AccessAuthContext";

export default function AccessLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAccessAuth();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const res = await login(email, password);
      const user = JSON.parse(localStorage.getItem("access_user") || "{}");
      if (user.role === "ADMIN" || user.role === "AGENCY") {
        setMsg("Login successful. Redirecting to dashboard...");
        navigate("/access/dashboard");
      } else {
        // Regular users go through SVP login
        sessionStorage.setItem("portal_login", email);
        setMsg("Login successful. Redirecting to verification...");
        navigate("/auth/login");
      }
    } catch (err: any) {
      setMsg(err?.data?.message || err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-heading">
          <h1>Access Control Login</h1>
          <p>Sign in with your admin or agency account.</p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
          />

          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
          />

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
          <p className="auth-message">{msg}</p>
          <div className="mt-2 text-center">
            <Link to="/access/forgot-password" className="auth-link">
              Forgot password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
