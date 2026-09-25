import React, { useState } from "react";
import logoUrl from "./assets/gurudock-logo.png";
import { authService } from "./services/authService";

function formatApiError(detail) {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => typeof item === "string" ? item : item?.msg || item?.message || JSON.stringify(item))
      .join(", ");
  }
  if (detail && typeof detail === "object") {
    return detail.message || detail.msg || detail.detail || JSON.stringify(detail);
  }
  return "Something went wrong. Please try again.";
}

export default function AuthModal({ mode = "login", onClose, onModeChange, onAuthenticated, authenticated = false, fullPage = false }) {
  const [step, setStep] = useState(mode === "signup" ? "signup" : mode === "forgot" ? "forgot-email" : mode === "change" ? "change" : "login");
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState({});

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const togglePasswordVisibility = (name) => {
    setVisiblePasswords((current) => ({ ...current, [name]: !current[name] }));
  };
  const passwordInput = (name, placeholder, options = {}) => (
    <div className="auth-password-field">
      <input
        {...options}
        name={name}
        type={visiblePasswords[name] ? "text" : "password"}
        placeholder={placeholder}
        onChange={update}
      />
      <button
        className="auth-password-toggle"
        type="button"
        onClick={() => togglePasswordVisibility(name)}
        aria-label={visiblePasswords[name] ? `Hide ${placeholder.toLowerCase()}` : `Show ${placeholder.toLowerCase()}`}
        title={visiblePasswords[name] ? "Hide password" : "Show password"}
      >
        {visiblePasswords[name] ? "Hide" : "Show"}
      </button>
    </div>
  );
  const notifyAuthenticated = async (data, fallbackName = "") => {
    const token = data.access_token;
    let name = data.user?.name || data.user?.full_name || data.name || data.full_name || fallbackName;

    if (!name && token) {
      try {
        const profile = await request("/auth/me", { headers: { Authorization: `Bearer ${token}` } });
        name = profile.name || profile.full_name || profile.user?.name || profile.user?.full_name;
      } catch {
        // Some API deployments do not expose a profile endpoint.
      }
    }

    const email = form.email || data.user?.email || data.email || "";
    name = name || email.split("@")[0] || "User";
    localStorage.setItem("user_name", name);
    if (email) localStorage.setItem("user_email", email);
    onAuthenticated?.({ name, email });
  };
  const request = async (path, options = {}) => {
    const payload = options.body;
    try {
      if (path === "/auth/login") {
        const values = payload instanceof URLSearchParams ? Object.fromEntries(payload) : payload;
        return authService.login({ username: values.username, password: values.password });
      }
      if (path === "/auth/register") return authService.register(payload);
      if (path === "/auth/verify-email-otp") return authService.verifyEmailOtp(payload);
      if (path === "/auth/forgot-password/request-otp") return authService.requestPasswordOtp(payload);
      if (path === "/auth/forgot-password/verify-otp") return authService.verifyPasswordOtp(payload);
      if (path === "/auth/forgot-password/reset") return authService.resetPassword(payload);
      if (path === "/auth/resend-email-otp") return authService.resendEmailOtp(payload);
      if (path === "/auth/change-password") return authService.changePassword(payload);
      if (path === "/auth/me") return authService.getCurrentUser();
      throw new Error("Unsupported authentication request.");
    } catch (requestError) {
      if (requestError?.name === "AbortError") throw requestError;
      throw new Error(formatApiError(requestError?.details || requestError?.message || requestError));
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    setLoading(true); setError(""); setMessage("");
    try {
      if (step === "login") {
        const body = new URLSearchParams({ username: form.email || "", password: form.password || "" });
        const data = await request("/auth/login", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        await notifyAuthenticated(data);
        setMessage("Logged in successfully.");
      } else if (step === "signup") {
        await request("/auth/register", { method: "POST", body: { name: form.name, email: form.email, password: form.password } });
        setStep("signup-otp"); setMessage("We sent a verification code to your email.");
      } else if (step === "signup-otp") {
        const data = await request("/auth/verify-email-otp", { method: "POST", body: { email: form.email, otp: form.otp } });
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        await notifyAuthenticated(data, form.name);
        setMessage("Email verified successfully.");
      } else if (step === "forgot-email") {
        await request("/auth/forgot-password/request-otp", { method: "POST", body: { email: form.email } });
        setStep("forgot-otp"); setMessage("We sent a password reset code to your email.");
      } else if (step === "forgot-otp") {
        await request("/auth/forgot-password/verify-otp", { method: "POST", body: { email: form.email, otp: form.otp } });
        setStep("forgot-reset"); setMessage("Code verified. Choose a new password.");
      } else if (step === "forgot-reset") {
        await request("/auth/forgot-password/reset", { method: "POST", body: { email: form.email, otp: form.otp, new_password: form.newPassword } });
        setStep("login"); setMessage("Password reset successfully. You can now log in.");
      } else if (step === "change") {
        const accessToken = localStorage.getItem("access_token");
        if (!accessToken) {
          throw new Error("Your session has expired. Please log in again.");
        }
        await request("/auth/change-password", {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            old_password: form.oldPassword,
            new_password: form.newPassword,
          },
        });
        setMessage("Password updated successfully.");
      }
    } catch (requestError) {
      setError(formatApiError(requestError?.message || requestError));
    } finally {
      setLoading(false);
    }
  };
  const resendSignupOtp = async () => {
    setError(""); setMessage("");
    try {
      await request("/auth/resend-email-otp", { method: "POST", body: { email: form.email } });
      setMessage("A new verification code was sent.");
    } catch (requestError) { setError(formatApiError(requestError?.message || requestError)); }
  };
  const title = { login: "Welcome to GuruDock", signup: "Create your GuruDock account", "signup-otp": "Verify your email", "forgot-email": "Forgot password?", "forgot-otp": "Enter your reset code", "forgot-reset": "Set a new password", change: "Change password" }[step];

  return (
    <div className={fullPage ? "auth-page-modal" : "modal-backdrop"} onClick={fullPage ? undefined : onClose}>
      <div className="modal narrow auth-modal" onClick={(event) => event.stopPropagation()}>
        {!fullPage && <button className="modal-close" type="button" onClick={onClose}>×</button>}
        <img className="modal-logo" src={logoUrl} alt="GuruDock" />
        <h2>{title}</h2>
        {step === "login" && <p>Log in with your email and password.</p>}
        {step === "signup" && <p>Create an account to start using GuruDock.</p>}
        {step === "signup-otp" && <p>Enter the six-digit code sent to {form.email}.</p>}
        {step === "forgot-email" && <p>Enter your email and we’ll send a password reset code.</p>}
        {step === "forgot-otp" && <p>Enter the six-digit code sent to {form.email}.</p>}
        {step === "forgot-reset" && <p>Your new password must be at least 8 characters.</p>}
        {step === "change" && <p>Enter your current password and choose a new one.</p>}
        <form onSubmit={submit}>
          {step === "signup" && <input name="name" required placeholder="Full name" onChange={update} />}
          {["login", "signup", "forgot-email"].includes(step) && <input name="email" required type="email" placeholder="Email address" onChange={update} value={form.email || ""} />}
          {step === "login" && passwordInput("password", "Password", { required: true })}
          {step === "signup" && passwordInput("password", "Password (8+ characters)", { required: true, minLength: 8, maxLength: 128 })}
          {["signup-otp", "forgot-otp"].includes(step) && <input name="otp" required inputMode="numeric" minLength="6" maxLength="6" pattern="[0-9]{6}" placeholder="6-digit verification code" onChange={update} />}
          {step === "forgot-reset" && passwordInput("newPassword", "New password", { required: true, minLength: 8, maxLength: 128 })}
          {step === "change" && <>{passwordInput("oldPassword", "Current password", { required: true })}{passwordInput("newPassword", "New password (8+ characters)", { required: true, minLength: 8, maxLength: 128 })}</>}
          {error && <div className="auth-feedback error">{error}</div>}
          {message && <div className="auth-feedback success">{message}</div>}
          <button className="primary-button auth-button" type="submit" disabled={loading}>{loading ? "Please wait…" : step === "login" ? "Log in" : step === "signup" ? "Create account" : step === "change" ? "Update password" : "Continue"}</button>
        </form>
        {step === "login" && <><button className="auth-link" type="button" onClick={() => { setStep("forgot-email"); setError(""); }}>Forgot password?</button><button className="secondary-button auth-button" type="button" onClick={() => { setStep("signup"); setError(""); }}>Create an account</button></>}
        {step === "signup" && <button className="auth-link" type="button" onClick={() => { setStep("login"); setError(""); }}>Already have an account? Log in</button>}
        {step === "signup-otp" && <button className="auth-link" type="button" onClick={resendSignupOtp}>Resend code</button>}
        {step === "forgot-email" && <button className="auth-link" type="button" onClick={() => setStep("login")}>Back to login</button>}
        {step === "forgot-otp" && <button className="auth-link" type="button" onClick={() => setStep("forgot-email")}>Use a different email</button>}
        {step === "forgot-reset" && <button className="auth-link" type="button" onClick={() => setStep("login")}>Back to login</button>}
      </div>
    </div>
  );
}
