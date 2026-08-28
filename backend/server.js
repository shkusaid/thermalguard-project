require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { randomUUID } = require("crypto");

const rulesEngine = require("./services/rulesEngine");
const weatherSvc = require("./services/weather");
const agent = require("./services/agent");
const alerts = require("./services/alerts");
const fortyguard = require("./services/fortyguard");
const authRoutes = require("./routes/auth");
const { requireAuth } = require("./middleware/auth");
const Reading = require("./models/Reading");

const app = express();
const allowedOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3001";
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

// --- rate limiter ---
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const requestLog = new Map();
app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) return res.status(429).json({ error: "Too many requests." });
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  next();
});

// --- MongoDB connection ---
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err.message));

// --- Auth routes (public) ---
app.use("/api/auth", authRoutes);

// --- In-memory facility state for CURRENT readings (fast, per-request).
// Historical readings are persisted to MongoDB separately (see Reading model)
// so History/Reports pages have real data even after a server restart. ---
const facilities = new Map();
const chatSessions = new Map();

const DEFAULT_FACILITY_ID = "demo-facility";
const DEFAULT_ZONES = [
  { zoneId: "floor-1", zoneType: "worker", zoneLabel: "Factory Floor", indoorTempC: 24, indoorHumidityPct: 45 },
  { zoneId: "chem-store", zoneType: "hazard", zoneLabel: "Chemical Storage", indoorTempC: 26, indoorHumidityPct: 30 },
  { zoneId: "warehouse", zoneType: "storage", zoneLabel: "Warehouse", indoorTempC: 22, indoorHumidityPct: 40 },
  { zoneId: "loading-bay", zoneType: "worker", zoneLabel: "Loading Bay", indoorTempC: 28, indoorHumidityPct: 50 },
];

function getOrInitFacility(facilityId, lat, lon) {
  if (!facilities.has(facilityId)) {
    facilities.set(facilityId, {
      lat: lat ?? 34.0522,
      lon: lon ?? -118.2437,
      zones: Object.fromEntries(DEFAULT_ZONES.map((z) => [z.zoneId, { ...z }])),
    });
  }
  return facilities.get(facilityId);
}

// All routes below require a valid login.
app.use("/api", requireAuth);

/**
 * POST /api/sensor-reading — the one seam between mock/real sensors.
 */
app.post("/api/sensor-reading", async (req, res) => {
  const { facilityId = DEFAULT_FACILITY_ID, zoneId, indoorTempC, indoorHumidityPct } = req.body;

  if (!zoneId || typeof indoorTempC !== "number") {
    return res.status(400).json({ error: "zoneId and indoorTempC (number) are required" });
  }
  if (indoorTempC < -20 || indoorTempC > 100) {
    return res.status(400).json({ error: "indoorTempC out of plausible range" });
  }

  const facility = getOrInitFacility(facilityId);
  if (!facility.zones[zoneId]) {
    return res.status(404).json({ error: `Unknown zoneId "${zoneId}" for this facility` });
  }

  facility.zones[zoneId].indoorTempC = indoorTempC;
  if (indoorHumidityPct != null) facility.zones[zoneId].indoorHumidityPct = indoorHumidityPct;

  // Evaluate immediately so we can store the resulting level alongside the reading.
  let outdoor = {};
  try {
    outdoor = await weatherSvc.getOutdoorConditions({ lat: facility.lat, lon: facility.lon });
  } catch {
    /* proceed without outdoor adjustment if this fails */
  }
  const zoneResult = rulesEngine.evaluateZone(facility.zones[zoneId], outdoor);

  try {
    await Reading.create({
      facilityId,
      zoneId,
      zoneType: facility.zones[zoneId].zoneType,
      indoorTempC,
      indoorHumidityPct,
      level: zoneResult.level,
    });
  } catch (err) {
    console.error("Failed to persist reading (continuing anyway):", err.message);
  }

  res.json({ ok: true, zone: facility.zones[zoneId], level: zoneResult.level });
});

/**
 * GET /api/facility-status?facilityId=demo-facility
 */
app.get("/api/facility-status", async (req, res) => {
  try {
    const facilityId = req.query.facilityId || DEFAULT_FACILITY_ID;
    const facility = getOrInitFacility(facilityId);

    let outdoor = {};
    try {
      outdoor = await weatherSvc.getOutdoorConditions({ lat: facility.lat, lon: facility.lon });
    } catch (err) {
      console.error("Outdoor conditions fetch failed:", err.message);
    }

    const zoneList = Object.values(facility.zones);
    const facilityResult = rulesEngine.evaluateFacility(zoneList, outdoor);

    let agentSummary = "";
    try {
      agentSummary = await agent.generateFacilitySummary({
        facilityId,
        userName: req.user?.name,
        outdoor,
        ...facilityResult,
      });
    } catch (err) {
      console.error("Agent summary failed, using deterministic fallback:", err.message);
      const worst = facilityResult.zones.find((z) => z.level === facilityResult.highestLevel);
      agentSummary = worst ? `${worst.zoneLabel}: ${worst.action}` : "All zones normal.";
    }

    const notifications = [];
    if (facilityResult.requiresEmergencyCall && runtimeSettings.emergencyContactNumber) {
      const hazardZone = facilityResult.zones.find((z) => z.level === "critical" && z.zoneType === "hazard");
      try {
        const result = await alerts.callEmergencyContact({
          toNumber: runtimeSettings.emergencyContactNumber,
          zoneId: hazardZone.zoneId,
          zoneLabel: hazardZone.zoneLabel,
          reasoning: hazardZone.reasoning,
        });
        notifications.push(result);
      } catch (err) {
        console.error("Emergency notification failed:", err.message);
        notifications.push({ notified: false, error: err.message });
      }
    }

    const sessionId = randomUUID();
    chatSessions.set(sessionId, { data: { facilityId, outdoor, ...facilityResult }, history: [] });

    res.json({
      sessionId,
      facilityId,
      outdoor,
      ...facilityResult,
      agentSummary,
      notifications,
      lat: facility.lat,
      lon: facility.lon,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/history?facilityId=demo-facility&limit=5
 * Last N readings per zone, for the History page.
 */
app.get("/api/history", async (req, res) => {
  try {
    const facilityId = req.query.facilityId || DEFAULT_FACILITY_ID;
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    const facility = getOrInitFacility(facilityId);

    const historyByZone = {};
    for (const zoneId of Object.keys(facility.zones)) {
      const readings = await Reading.find({ facilityId, zoneId }).sort({ createdAt: -1 }).limit(limit);
      historyByZone[zoneId] = readings.map((r) => ({
        indoorTempC: r.indoorTempC,
        level: r.level,
        createdAt: r.createdAt,
      }));
    }

    res.json({ facilityId, historyByZone });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports/daily?facilityId=demo-facility&date=2026-08-26
 * Highest/lowest/average per zone for the given day (defaults to today).
 */
app.get("/api/reports/daily", async (req, res) => {
  try {
    const facilityId = req.query.facilityId || DEFAULT_FACILITY_ID;
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
    const start = new Date(`${dateStr}T00:00:00.000Z`);
    const end = new Date(`${dateStr}T23:59:59.999Z`);

    const results = await Reading.aggregate([
      { $match: { facilityId, createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$zoneId",
          zoneType: { $first: "$zoneType" },
          highest: { $max: "$indoorTempC" },
          lowest: { $min: "$indoorTempC" },
          average: { $avg: "$indoorTempC" },
          readingCount: { $sum: 1 },
          criticalCount: { $sum: { $cond: [{ $eq: ["$level", "critical"] }, 1, 0] } },
        },
      },
    ]);

    res.json({
      facilityId,
      date: dateStr,
      zones: results.map((r) => ({
        zoneId: r._id,
        zoneType: r.zoneType,
        highest: Number(r.highest?.toFixed(1)),
        lowest: Number(r.lowest?.toFixed(1)),
        average: Number(r.average?.toFixed(1)),
        readingCount: r.readingCount,
        criticalCount: r.criticalCount,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/chat
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || typeof sessionId !== "string") return res.status(400).json({ error: "sessionId required" });
    if (!message || typeof message !== "string" || message.length > 500) {
      return res.status(400).json({ error: "message required, under 500 characters" });
    }
    const session = chatSessions.get(sessionId);
    if (!session) return res.status(404).json({ error: "Unknown or expired session." });

    const reply = await agent.chatWithAgent(session.data, session.history, message);
    session.history.push({ role: "user", content: message });
    session.history.push({ role: "assistant", content: reply });

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/heatmap?facilityId=demo-facility — bonus visual, runs independently.
 */
app.get("/api/heatmap", async (req, res) => {
  try {
    const facilityId = req.query.facilityId || DEFAULT_FACILITY_ID;
    const facility = getOrInitFacility(facilityId);
    const apiKey = process.env.FORTYGUARD_API_KEY;
    const result = await fortyguard.getHeatmapEventually({ apiKey, lat: facility.lat, lon: facility.lon });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/settings — admin-only, updates the emergency contact number etc.
 * (Kept simple: writes to an in-memory override for the demo. A real
 * deployment would persist this to MongoDB alongside the User/Facility model.)
 */
const runtimeSettings = { emergencyContactNumber: process.env.EMERGENCY_CONTACT_NUMBER || "" };

app.get("/api/settings", (req, res) => res.json(runtimeSettings));

app.patch("/api/settings", (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin role required" });
  const { emergencyContactNumber } = req.body;
  if (emergencyContactNumber) runtimeSettings.emergencyContactNumber = emergencyContactNumber;
  res.json(runtimeSettings);
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ThermalGuard backend running on http://localhost:${PORT}`);
});
