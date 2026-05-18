import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiAuth } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [otpMethod, setOtpMethod] = useState("email");
  const [msg, setMsg] = useState("");
  const [tokenLogin, setTokenLogin] = useState("");
  const [svpToken, setSvpToken] = useState("");
  const [tokenMsg, setTokenMsg] = useState("");
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();

  useEffect(() => {
    const portalLogin = sessionStorage.getItem("portal_login") || "";
    const portalPassword = sessionStorage.getItem("portal_password") || "";
    setLogin(portalLogin);
    setPassword(portalPassword);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Sending OTP...");
    try {
      await apiAuth("/login", { login, password, otp_method: otpMethod });
      sessionStorage.setItem("tmp_login", login);
      sessionStorage.setItem("tmp_password", password);
      sessionStorage.setItem("tmp_otpMethod", otpMethod);
      setMsg("OTP sent. Check your email or SMS.");
      navigate("/auth/otp");
    } catch (err: any) {
      setMsg(JSON.stringify(err.data || err.message));
    }
  }

  async function submitToken(e: React.FormEvent) {
    e.preventDefault();
    setTokenMsg("Verifying bearer token...");
    try {
      const res = await apiAuth("/token-login", { login: tokenLogin, token: svpToken });
      authLogin(res.accessToken, res.user || res);
      setTokenMsg("Login successful. Redirecting...");
      navigate("/dashboard");
    } catch (err: any) {
      setTokenMsg(JSON.stringify(err.data || err.message));
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-heading">
          <h1>Welcome back</h1>
          <p>Sign in with your SVP account and request OTP verification.</p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>Email</label>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
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

          <label>OTP Verify Option</label>
          <select value={otpMethod} onChange={(e) => setOtpMethod(e.target.value)}>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>

          <button type="submit" className="auth-submit">Sign in</button>
          <p className="auth-message">{msg}</p>
        </form>

        <div className="auth-heading" style={{ marginTop: "1rem" }}>
          <h2>Direct Token Login</h2>
          <p>Paste your SVP bearer token from official login and login instantly.</p>
        </div>

        <form className="auth-form" onSubmit={submitToken}>
          <label>Account login (email)</label>
          <input
            value={tokenLogin}
            onChange={(e) => setTokenLogin(e.target.value)}
            placeholder="Enter your email or login"
            required
          />

          <label>SVP Bearer Token</label>
          <textarea
            value={svpToken}
            onChange={(e) => setSvpToken(e.target.value)}
            placeholder="Paste bearer token from official SVP session"
            rows={4}
            required
          />

          <button type="submit" className="auth-submit">Login with token</button>
          <p className="auth-message">{tokenMsg}</p>
        </form>
      </div>
    </div>
  );
}
