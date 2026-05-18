import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiAuth } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function OtpPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login: authLogin } = useAuth();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [otpMethod, setOtpMethod] = useState("email");
  const [otpAttempt, setOtpAttempt] = useState("");
  const [msg, setMsg] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const queryLogin = searchParams.get("login");
    const queryPassword = searchParams.get("password");
    const queryOtpMethod = searchParams.get("otpMethod");
    const storedLogin = sessionStorage.getItem("tmp_login") || "";
    const storedPassword = sessionStorage.getItem("tmp_password") || "";
    const storedOtpMethod = sessionStorage.getItem("tmp_otpMethod") || "email";
    setLogin(queryLogin || storedLogin);
    setPassword(queryPassword || storedPassword);
    setOtpMethod(queryOtpMethod || storedOtpMethod);
  }, [searchParams]);

  function getErrorMessage(err: any) {
    const otpInvalidMessage = err?.data?.details?.errors?.otp_attempt_invalid?.en;
    if (otpInvalidMessage) {
      return `${otpInvalidMessage} Please resend OTP and use the newest code only.`;
    }

    return err?.data?.message || err?.message || "OTP verification failed";
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Verifying OTP...");
    try {
      const res = await apiAuth("/otp-verify", { login, password, otp_attempt: otpAttempt, otp_method: otpMethod });
      authLogin(res.accessToken, res.user || res);
      sessionStorage.removeItem("tmp_login");
      sessionStorage.removeItem("tmp_password");
      sessionStorage.removeItem("tmp_otpMethod");
      setMsg("Login successful. Redirecting to dashboard...");
      navigate("/dashboard");
    } catch (err: any) {
      setMsg(getErrorMessage(err));
    }
  }

  async function resendOtp() {
    if (!login || !password) {
      setMsg("Session expired. Please sign in again to request a new OTP.");
      return;
    }

    setResending(true);
    setMsg("Sending a new OTP...");

    try {
      await apiAuth("/login", { login, password, otp_method: otpMethod });
      sessionStorage.setItem("tmp_login", login);
      sessionStorage.setItem("tmp_password", password);
      sessionStorage.setItem("tmp_otpMethod", otpMethod);
      setOtpAttempt("");
      setMsg(`A new OTP was sent via ${(otpMethod || "email").toUpperCase()}. Use the latest code only.`);
    } catch (err: any) {
      setMsg(err?.data?.message || err?.message || "Failed to resend OTP");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-heading">
          <h1>OTP verification</h1>
          <p>Enter the OTP sent to your selected method and complete sign in.</p>
        </div>

        <div className="auth-meta">
          <span>Account</span>
          <strong>{login || ""}</strong>
          <span>Verify by</span>
          <strong>{(otpMethod || "").toUpperCase()}</strong>
        </div>

        <form className="auth-form" onSubmit={verify}>
          <label>OTP Code</label>
          <input
            value={otpAttempt}
            onChange={(e) => setOtpAttempt(e.target.value)}
            placeholder="Enter OTP code"
            required
          />
          <button type="submit" className="auth-submit">Verify OTP</button>
          <button
            type="button"
            className="auth-submit"
            onClick={resendOtp}
            disabled={resending || !login || !password}
            style={{ marginTop: "0.75rem" }}
          >
            {resending ? "Resending OTP..." : "Resend OTP"}
          </button>
          <p className="auth-message">{msg}</p>
        </form>
      </div>
    </div>
  );
}
