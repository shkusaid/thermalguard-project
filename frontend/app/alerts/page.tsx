"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import Navbar from "@/components/Navbar";

type ZoneResult = {
  zoneId: string; zoneLabel: string; zoneType: string;
  effectiveTempC: number; level: "info" | "watch" | "warning" | "critical"; action: string; reasoning: string;
};

export default function AlertsPage() {
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();
  const [zones, setZones] = useState<ZoneResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/signin");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    apiFetch("/api/facility-status", token)
      .then((json) => setZones(json.zones))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user, token]);

  if (authLoading || !user) return null;

  const activeAlerts = zones.filter((z) => z.level === "warning" || z.level === "critical");

  return (
    <div className="app-shell">
      <Navbar alertCount={activeAlerts.length} />
      <main className="page">
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Active Alerts</h1>
        <p className="card__subtitle" style={{ marginBottom: 20 }}>
          Zones currently at warning or critical level.
        </p>

        {loading && <p className="loading-text">Checking zones…</p>}
        {error && <p className="error">{error}</p>}

        {!loading && activeAlerts.length === 0 && (
          <div className="card">
            <p className="loading-text">No active alerts. All zones normal.</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {activeAlerts.map((z) => (
            <div className="card" key={z.zoneId}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <TriangleAlert size={18} color={z.level === "critical" ? "var(--critical)" : "var(--warning)"} />
                  <div>
                    <p className="card__title">{z.zoneLabel}</p>
                    <p className="card__subtitle" style={{ marginBottom: 0 }}>{z.zoneType} zone · {z.effectiveTempC}°C</p>
                  </div>
                </div>
                <span className="level-badge" data-level={z.level}>{z.level}</span>
              </div>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 12 }}>{z.action}</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{z.reasoning}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
