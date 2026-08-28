"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Factory, Flame, Package, Truck, Wind, Droplets, Sun, Bot, MessageCircle, PhoneCall } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import Navbar from "@/components/Navbar";
import SurroundingMap from "@/components/SurroundingMap";

const ZONE_ICON: Record<string, any> = { worker: Factory, hazard: Flame, storage: Package };
const ZONE_META: Record<string, { label: string; type: string; min: number; max: number; icon: any }> = {
  "floor-1": { label: "Factory Floor", type: "worker", min: 15, max: 50, icon: Factory },
  "chem-store": { label: "Chemical Storage", type: "hazard", min: 15, max: 55, icon: Flame },
  warehouse: { label: "Warehouse", type: "storage", min: 15, max: 55, icon: Package },
  "loading-bay": { label: "Loading Bay", type: "worker", min: 15, max: 50, icon: Truck },
};

type ZoneResult = {
  zoneId: string; zoneLabel: string; zoneType: string;
  effectiveTempC: number; level: "info" | "watch" | "warning" | "critical"; action: string;
};
type FacilityResponse = {
  sessionId: string; zones: ZoneResult[]; highestLevel: string; requiresEmergencyCall: boolean;
  agentSummary: string; notifications: any[];
  outdoor: { outdoorTempC?: number; outdoorHumidityPct?: number; outdoorUvIndex?: number };
};
type ChatMessage = { role: "user" | "agent"; text: string };

export default function Dashboard() {
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();

  const [sliders, setSliders] = useState<Record<string, number>>({
    "floor-1": 24, "chem-store": 26, warehouse: 22, "loading-bay": 28,
  });
  const [data, setData] = useState<FacilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [callingAgent, setCallingAgent] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/signin");
  }, [authLoading, user, router]);

  async function refreshStatus() {
    setError("");
    setLoading(true);
    try {
      await Promise.all(
        Object.entries(sliders).map(([zoneId, val]) =>
          apiFetch("/api/sensor-reading", token, { method: "POST", body: JSON.stringify({ zoneId, indoorTempC: val }) })
        )
      );
      const json = await apiFetch("/api/facility-status", token);
      setData(json);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleAskAgent() {
    if (!data) return;
    setChatLog((log) => [...log, { role: "agent", text: data.agentSummary }]);
  }

  async function handleCallAgent() {
    setCallingAgent(true);
    await refreshStatus();
    setTimeout(() => setCallingAgent(false), 1500);
  }

  async function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || !data) return;
    const message = chatInput.trim();
    setChatLog((log) => [...log, { role: "user", text: message }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const json = await apiFetch("/api/chat", token, {
        method: "POST",
        body: JSON.stringify({ sessionId: data.sessionId, message }),
      });
      setChatLog((log) => [...log, { role: "agent", text: json.reply }]);
    } catch (err: any) {
      setChatLog((log) => [...log, { role: "agent", text: `Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  if (authLoading || !user) return null;

  const alertCount = data?.zones.filter((z) => z.level === "warning" || z.level === "critical").length || 0;
  const outdoor = data?.outdoor?.outdoorTempC;

  return (
    <div className="app-shell">
      <Navbar alertCount={alertCount} />
      <main className="page">
        <div className="grid-2">
          {/* LEFT COLUMN */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p className="card__title">Map Around Building</p>
                  <p className="card__subtitle">Outdoor temperature & environment monitoring</p>
                </div>
              </div>
              <SurroundingMap outdoorTempC={outdoor ?? null} />
              <div className="stat-row" style={{ marginTop: 18 }}>
                <div className="stat">
                  <div className="stat__label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Wind size={13} /> Wind Speed
                  </div>
                  <div className="stat__value">—</div>
                </div>
                <div className="stat">
                  <div className="stat__label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Droplets size={13} /> Humidity
                  </div>
                  <div className="stat__value">{data?.outdoor?.outdoorHumidityPct ?? "—"}%</div>
                </div>
                <div className="stat">
                  <div className="stat__label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Sun size={13} /> UV Index
                  </div>
                  <div className="stat__value" data-tone={((data?.outdoor?.outdoorUvIndex ?? 0) >= 6) ? "critical" : undefined}>
                    {data?.outdoor?.outdoorUvIndex ?? "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <p className="card__title">Building Sections — Current Status</p>
              <p className="card__subtitle">Live indoor readings. Sliders simulate sensor input for this demo.</p>
              <div className="section-grid">
                {Object.entries(ZONE_META).map(([zoneId, meta]) => {
                  const zoneResult = data?.zones.find((z) => z.zoneId === zoneId);
                  const level = zoneResult?.level || "info";
                  const Icon = meta.icon;
                  return (
                    <div className="section-card" key={zoneId}>
                      <div className="section-card__top">
                        <div className="section-card__icon" data-level={level}><Icon size={16} /></div>
                        <span className="level-badge" data-level={level}>{level}</span>
                      </div>
                      <p className="section-card__label">{meta.label}</p>
                      <p className="section-card__temp">{sliders[zoneId].toFixed(1)}°C</p>
                      <div className="slider-row">
                        <input
                          type="range" min={meta.min} max={meta.max} step={0.5}
                          value={sliders[zoneId]}
                          onChange={(e) => setSliders((s) => ({ ...s, [zoneId]: parseFloat(e.target.value) }))}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 18 }}>
                <button className="btn btn--primary" onClick={refreshStatus} disabled={loading}>
                  {loading ? "Evaluating…" : "Refresh facility status"}
                </button>
              </div>
              {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card">
              <p className="card__title">Environment Overview</p>
              <div className="env-readout">
                <div className="env-readout__value">{outdoor != null ? `${outdoor.toFixed(1)}°C` : "—"}</div>
                <div className="env-readout__label">Outdoor Temperature</div>
              </div>
            </div>

            <div className="card agent-panel">
              <div className="agent-panel__header">
                <Bot size={16} />
                <strong style={{ fontSize: 14 }}>ThermoGuard Agent</strong>
              </div>
              <div className="agent-panel__status">Online</div>

              <div className="agent-panel__msg">
                {data ? data.agentSummary : "Run a status check to hear from the agent."}
              </div>

              {chatLog.length > 0 && (
                <div className="chat">
                  {chatLog.map((m, i) => (
                    <div className={`chat-msg chat-msg--${m.role}`} key={i}>{m.text}</div>
                  ))}
                </div>
              )}

              <form className="chat-input" onSubmit={handleChatSubmit} style={{ marginBottom: 14 }}>
                <input
                  type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about a zone…"
                />
                <button type="submit" className="btn btn--secondary" disabled={chatLoading || !data}>
                  {chatLoading ? "…" : <MessageCircle size={15} />}
                </button>
              </form>

              <div className="agent-panel__actions">
                <button className="btn btn--secondary" style={{ flex: 1 }} onClick={handleAskAgent} disabled={!data}>
                  Ask Agent →
                </button>
                <button className="btn btn--primary" style={{ flex: 1 }} onClick={handleCallAgent} disabled={callingAgent}>
                  <PhoneCall size={15} /> {callingAgent ? "Calling Agent…" : "Check Now"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
