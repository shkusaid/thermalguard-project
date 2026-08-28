"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import Navbar from "@/components/Navbar";

const ZONE_LABELS: Record<string, string> = {
  "floor-1": "Factory Floor",
  "chem-store": "Chemical Storage",
  warehouse: "Warehouse",
  "loading-bay": "Loading Bay",
};

type ZoneReport = {
  zoneId: string; zoneType: string; highest: number; lowest: number;
  average: number; readingCount: number; criticalCount: number;
};

export default function ReportsPage() {
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [zones, setZones] = useState<ZoneReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/signin");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    apiFetch(`/api/reports/daily?date=${date}`, token)
      .then((json) => setZones(json.zones))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user, token, date]);

  if (authLoading || !user) return null;

  return (
    <div className="app-shell">
      <Navbar />
      <main className="page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Daily Summary Report</h1>
            <p className="card__subtitle">Highest and lowest temperature per section for the selected day.</p>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14 }}
          />
        </div>

        {loading && <p className="loading-text">Loading report…</p>}
        {error && <p className="error">{error}</p>}

        {!loading && zones.length === 0 && (
          <div className="card">
            <p className="loading-text">No readings recorded for this date yet.</p>
          </div>
        )}

        {zones.length > 0 && (
          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Highest</th>
                  <th>Lowest</th>
                  <th>Average</th>
                  <th>Readings</th>
                  <th>Critical events</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.zoneId}>
                    <td>{ZONE_LABELS[z.zoneId] || z.zoneId}</td>
                    <td style={{ color: "var(--critical)", fontWeight: 600 }}>{z.highest}°C</td>
                    <td style={{ color: "var(--success)", fontWeight: 600 }}>{z.lowest}°C</td>
                    <td>{z.average}°C</td>
                    <td>{z.readingCount}</td>
                    <td>{z.criticalCount > 0 ? <span className="level-badge" data-level="critical">{z.criticalCount}</span> : "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
