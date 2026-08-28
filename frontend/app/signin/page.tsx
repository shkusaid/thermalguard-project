"use client";

import { useState } from "react";
import { ShieldHalf, Activity, Bell, ShieldCheck, User, Building2, Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function SignInPage() {
  const { login, signup } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (tab === "signin") {
        await login(email, password, role);
      } else {
        await signup(name, email, password, role);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="auth-hero__brand">
          <div className="auth-hero__brand-icon"><ShieldHalf size={20} /></div>
          <span className="auth-hero__brand-name">ThermoGuard</span>
        </div>

        <h1 className="auth-hero__title">
          Smarter Monitoring.<br /><span>Safer Environments.</span>
        </h1>
        <p className="auth-hero__sub">
          Real-time temperature monitoring and environmental intelligence for factories,
          buildings, and critical infrastructure.
        </p>

        <div className="auth-feature">
          <div className="auth-feature__icon"><Activity size={16} /></div>
          <div>
            <p className="auth-feature__title">Live Monitoring</p>
            <p className="auth-feature__desc">Real-time insights from every location</p>
          </div>
        </div>
        <div className="auth-feature">
          <div className="auth-feature__icon"><Bell size={16} /></div>
          <div>
            <p className="auth-feature__title">Instant Alerts</p>
            <p className="auth-feature__desc">Get notified when limits are breached</p>
          </div>
        </div>
        <div className="auth-feature">
          <div className="auth-feature__icon"><ShieldCheck size={16} /></div>
          <div>
            <p className="auth-feature__title">Role-Based Access</p>
            <p className="auth-feature__desc">Staff and admin control made simple</p>
          </div>
        </div>
      </div>

      <div className="auth-form-side">
        <form className="auth-form" onSubmit={handleSubmit}>
          <h2 className="auth-form__title">{tab === "signin" ? "Welcome Back!" : "Create Account"}</h2>
          <p className="auth-form__sub">
            {tab === "signin" ? "Sign in to your monitoring dashboard" : "Set up your monitoring dashboard access"}
          </p>

          <div className="auth-tabs">
            <button type="button" className="auth-tab" data-active={tab === "signin"} onClick={() => { setTab("signin"); setError(""); }}>
              Sign In
            </button>
            <button type="button" className="auth-tab" data-active={tab === "signup"} onClick={() => { setTab("signup"); setError(""); }}>
              Sign Up
            </button>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <div className="field">
            <label>Access Role</label>
            <div className="role-toggle">
              <button type="button" className="role-btn" data-active={role === "staff"} onClick={() => setRole("staff")}>
                <User size={15} /> Staff
              </button>
              <button type="button" className="role-btn" data-active={role === "admin"} onClick={() => setRole("admin")}>
                <ShieldCheck size={15} /> Administrator
              </button>
            </div>
          </div>

          {tab === "signup" && (
            <div className="field">
              <label>Full Name</label>
              <div className="field-input-wrap">
                <Building2 size={15} />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" required />
              </div>
            </div>
          )}

          <div className="field">
            <label>Email Address</label>
            <div className="field-input-wrap">
              <Mail size={15} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
          </div>

          <div className="field">
            <label>Password</label>
            <div className="field-input-wrap">
              <Lock size={15} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                required
              />
              <button type="button" className="field-eye" onClick={() => setShowPassword((s) => !s)}>
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {tab === "signin" && (
            <div className="auth-form__row">
              <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
                <input type="checkbox" /> Remember me
              </label>
              <a href="#" style={{ color: "var(--blue)", fontWeight: 600 }}>Forgot password?</a>
            </div>
          )}

          <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
            {loading ? "Please wait…" : tab === "signin" ? "Sign In" : "Create Account"}
            <ArrowRight size={16} />
          </button>

          <p className="auth-form__note">
            {role === "admin"
              ? "Administrator role grants access to Settings and facility configuration."
              : "Staff role gives full monitoring access without configuration controls."}
          </p>
        </form>
      </div>
    </div>
  );
}
