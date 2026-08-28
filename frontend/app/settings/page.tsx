"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import Navbar from "@/components/Navbar";

export default function SettingsPage() {
  const { user, token, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [emergencyNumber, setEmergencyNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/signin");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    apiFetch("/api/settings", token)
      .then((json) => setEmergencyNumber(json.emergencyContactNumber || ""))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user, token]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await apiFetch("/api/settings", token, {
        method: "PATCH",
        body: JSON.stringify({ emergencyContactNumber: emergencyNumber }),
      });
      setSaved(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !user) return null;

  return (
    <div className="app-shell">
      <Navbar />
      <main className="page">
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Settings</h1>
        <p className="card__subtitle" style={{ marginBottom: 20 }}>Account and facility configuration.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 480 }}>
          <div className="card">
            <p className="card__title">Account</p>
            <p style={{ fontSize: 14, margin: "10px 0 4px" }}>{user.name}</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 4px" }}>{user.email}</p>
            <span className="level-badge" data-level="watch">{user.role}</span>
            <div style={{ marginTop: 18 }}>
              <button className="btn btn--secondary" onClick={logout}>Log out</button>
            </div>
          </div>

          {user.role === "admin" ? (
            <div className="card">
              <p className="card__title">Emergency Contact Number</p>
              <p className="card__subtitle">Receives an SMS when a hazard zone reaches critical level.</p>
              {loading ? (
                <p className="loading-text">Loading…</p>
              ) : (
                <form onSubmit={handleSave}>
                  <div className="field">
                    <input
                      type="tel"
                      value={emergencyNumber}
                      onChange={(e) => setEmergencyNumber(e.target.value)}
                      placeholder="+1xxxxxxxxxx"
                      style={{ padding: "11px 14px" }}
                    />
                  </div>
                  {error && <p className="error">{error}</p>}
                  {saved && <p style={{ color: "var(--success)", fontSize: 13, marginBottom: 12 }}>Saved.</p>}
                  <button type="submit" className="btn btn--primary" disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="card">
              <p className="loading-text">Facility configuration is only available to Administrator accounts.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
