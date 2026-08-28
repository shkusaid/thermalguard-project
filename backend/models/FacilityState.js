const mongoose = require("mongoose");

/**
 * Current (latest) reading per facility+zone. Replaces the old in-memory
 * Map so state survives serverless cold starts (Vercel) and free-tier
 * spin-downs (Render) alike - both wipe in-memory state between requests
 * in different ways, so persisting this to Mongo is the correct fix
 * regardless of hosting choice.
 */
const FacilityStateSchema = new mongoose.Schema({
  facilityId: { type: String, required: true, index: true },
  zoneId: { type: String, required: true },
  zoneType: { type: String, required: true },
  zoneLabel: { type: String, required: true },
  indoorTempC: { type: Number, required: true },
  indoorHumidityPct: { type: Number },
  lat: { type: Number, required: true },
  lon: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now },
});

FacilityStateSchema.index({ facilityId: 1, zoneId: 1 }, { unique: true });

module.exports = mongoose.model("FacilityState", FacilityStateSchema);
