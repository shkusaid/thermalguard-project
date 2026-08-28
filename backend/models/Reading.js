const mongoose = require("mongoose");

/**
 * One document per sensor reading. Used to power:
 *  - History page (last 3-5 readings per zone)
 *  - Reports page (daily min/max/avg aggregation)
 * Indexed on facilityId + zoneId + createdAt for fast recent-readings lookups.
 */
const ReadingSchema = new mongoose.Schema({
  facilityId: { type: String, required: true, index: true },
  zoneId: { type: String, required: true, index: true },
  zoneType: { type: String, required: true },
  indoorTempC: { type: Number, required: true },
  indoorHumidityPct: { type: Number },
  level: { type: String, enum: ["info", "watch", "warning", "critical"], required: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

ReadingSchema.index({ facilityId: 1, zoneId: 1, createdAt: -1 });

module.exports = mongoose.model("Reading", ReadingSchema);
