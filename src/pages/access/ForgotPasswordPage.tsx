import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { accessAuthApi } from "@/lib/access-api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<"email" | "reset">("email");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("error");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const res = await accessAuthApi("/forgot-password", { email });
      setMsg("A reset code has been sent. Please check your email or use the code provided.");
      setMsgType("success");
      // For now, show the code since no email service
      if (res.resetCode) {
        setCode(res.resetCode);
      }
      setStep("reset");
    } catch (err: any) {
      setMsg(err?.data?.message || err?.message || "Failed to request reset code");
      setMsgType("error");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMsg("Passwords do not match");
      setMsgType("error");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      await accessAuthApi("/reset-password", { email, code, newPassword });
      setMsg("Password reset successfully! Redirecting to login...");
      setMsgType("success");
      setTimeout(() => navigate("/access/login"), 2000);
    } catch (err: any) {
      setMsg(err?.data?.message || err?.message || "Failed to reset password");
      setMsgType("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-heading">
          <h1>{step === "email" ? "Forgot Password" : "Reset Password"}</h1>
          <p>
            {step === "email"
              ? "Enter your email to receive a reset code."
              : "Enter the reset code and your new password."}
          </p>
        </div>

        {step === "email" ? (
          <form className="auth-form" onSubmit={handleRequestCode}>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? "Sending..." : "Send Reset Code"}
            </button>
            <p className={`auth-message ${msgType === "success" ? "text-green-600" : ""}`}>
              {msg}
            </p>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleResetPassword}>
            <label>Reset Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter 6-digit code"
              required
              maxLength={6}
            />
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              required
              minLength={6}
            />
            <label>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
              minLength={6}
            />
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>
            <p className={`auth-message ${msgType === "success" ? "text-green-600" : ""}`}>
              {msg}
            </p>
            <button
              type="button"
              className="auth-link"
              onClick={() => { setStep("email"); setMsg(""); }}
            >
              ← Request a new code
            </button>
          </form>
        )}

        <div className="mt-4 text-center">
          <Link to="/access/login" className="auth-link">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
