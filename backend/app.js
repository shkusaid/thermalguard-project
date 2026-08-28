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
const FacilityState = require("./models/FacilityState");
const ChatSession = require("./models/ChatSession");

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

// Public health check - must stay above the requireAuth gate below.
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// --- Facility state now lives in MongoDB (FacilityState model) instead of
// an in-memory Map, so it survives serverless cold starts and free-tier
// spin-downs alike. See models/FacilityState.js and models/ChatSession.js. ---

const DEFAULT_FACILITY_ID = "demo-facility";
const DEFAULT_LAT = 34.0522; // swap for your real demo site
const DEFAULT_LON = -118.2437;
const DEFAULT_ZONES = [
  { zoneId: "floor-1", zoneType: "worker", zoneLabel: "Factory Floor", indoorTempC: 24, indoorHumidityPct: 45 },
  { zoneId: "chem-store", zoneType: "hazard", zoneLabel: "Chemical Storage", indoorTempC: 26, indoorHumidityPct: 30 },
  { zoneId: "warehouse", zoneType: "storage", zoneLabel: "Warehouse", indoorTempC: 22, indoorHumidityPct: 40 },
  { zoneId: "loading-bay", zoneType: "worker", zoneLabel: "Loading Bay", indoorTempC: 28, indoorHumidityPct: 50 },
];

/**
 * Returns all zone states for a facility, seeding defaults on first use.
 */
async function getFacilityZones(facilityId) {
  const existing = await FacilityState.find({ facilityId });
  if (existing.length > 0) return existing;

  // First time this facility is touched - seed default zones.
  const seeded = await FacilityState.insertMany(
    DEFAULT_ZONES.map((z) => ({ facilityId, lat: DEFAULT_LAT, lon: DEFAULT_LON, ...z }))
  );
  return seeded;
}

async function getFacilityLatLon(facilityId) {
  const one = await FacilityState.findOne({ facilityId });
  return one ? { lat: one.lat, lon: one.lon } : { lat: DEFAULT_LAT, lon: DEFAULT_LON };
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

  await getFacilityZones(facilityId); // ensures zones are seeded
  const zoneDoc = await FacilityState.findOne({ facilityId, zoneId });
  if (!zoneDoc) {
    return res.status(404).json({ error: `Unknown zoneId "${zoneId}" for this facility` });
  }

  zoneDoc.indoorTempC = indoorTempC;
  if (indoorHumidityPct != null) zoneDoc.indoorHumidityPct = indoorHumidityPct;
  zoneDoc.updatedAt = new Date();
  await zoneDoc.save();

  let outdoor = {};
  try {
    outdoor = await weatherSvc.getOutdoorConditions({ lat: zoneDoc.lat, lon: zoneDoc.lon });
  } catch {
    /* proceed without outdoor adjustment if this fails */
  }
  const zoneResult = rulesEngine.evaluateZone(zoneDoc, outdoor);

  try {
    await Reading.create({
      facilityId,
      zoneId,
      zoneType: zoneDoc.zoneType,
      indoorTempC,
      indoorHumidityPct,
      level: zoneResult.level,
    });
  } catch (err) {
    console.error("Failed to persist reading (continuing anyway):", err.message);
  }

  res.json({ ok: true, zone: zoneDoc, level: zoneResult.level });
});

/**
 * GET /api/facility-status?facilityId=demo-facility
 */
app.get("/api/facility-status", async (req, res) => {
  try {
    const facilityId = req.query.facilityId || DEFAULT_FACILITY_ID;
    const zoneList = await getFacilityZones(facilityId);
    const { lat, lon } = await getFacilityLatLon(facilityId);

    let outdoor = {};
    try {
      outdoor = await weatherSvc.getOutdoorConditions({ lat, lon });
    } catch (err) {
      console.error("Outdoor conditions fetch failed:", err.message);
    }

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
    await ChatSession.create({ sessionId, data: { facilityId, outdoor, ...facilityResult }, history: [] });

    res.json({
      sessionId,
      facilityId,
      outdoor,
      ...facilityResult,
      agentSummary,
      notifications,
      lat,
      lon,
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
    const zoneList = await getFacilityZones(facilityId);

    const historyByZone = {};
    for (const zone of zoneList) {
      const readings = await Reading.find({ facilityId, zoneId: zone.zoneId }).sort({ createdAt: -1 }).limit(limit);
      historyByZone[zone.zoneId] = readings.map((r) => ({
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
    const session = await ChatSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: "Unknown or expired session." });

    const reply = await agent.chatWithAgent(session.data, session.history, message);
    session.history.push({ role: "user", content: message });
    session.history.push({ role: "assistant", content: reply });
    await session.save();

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
    await getFacilityZones(facilityId); // ensures seeded
    const { lat, lon } = await getFacilityLatLon(facilityId);
    const apiKey = process.env.FORTYGUARD_API_KEY;
    const result = await fortyguard.getHeatmapEventually({ apiKey, lat, lon });
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

module.exports = app;
