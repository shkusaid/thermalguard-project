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

type HistoryEntry = { indoorTempC: number; level: string; createdAt: string };

export default function HistoryPage() {
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();
  const [historyByZone, setHistoryByZone] = useState<Record<string, HistoryEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push("/signin");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    apiFetch("/api/history?limit=5", token)
      .then((json) => setHistoryByZone(json.historyByZone))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user, token]);

  if (authLoading || !user) return null;

  return (
    <div className="app-shell">
      <Navbar />
      <main className="page">
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Reading History</h1>
        <p className="card__subtitle" style={{ marginBottom: 20 }}>
          Most recent 5 readings per zone, persisted in MongoDB.
        </p>

        {loading && <p className="loading-text">Loading history…</p>}
        {error && <p className="error">{error}</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {Object.entries(ZONE_LABELS).map(([zoneId, label]) => {
            const entries = historyByZone[zoneId] || [];
            return (
              <div className="card" key={zoneId}>
                <p className="card__title">{label}</p>
                <p className="card__subtitle">{entries.length} recent reading{entries.length !== 1 ? "s" : ""}</p>
                {entries.length === 0 ? (
                  <p className="loading-text">No readings yet — visit the Dashboard and run a status check.</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Temperature</th>
                        <th>Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e, i) => (
                        <tr key={i}>
                          <td>{new Date(e.createdAt).toLocaleString()}</td>
                          <td>{e.indoorTempC.toFixed(1)}°C</td>
                          <td><span className="level-badge" data-level={e.level}>{e.level}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
