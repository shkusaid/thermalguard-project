const mongoose = require("mongoose");

/**
 * Chat session grounding data + history, persisted so it survives
 * serverless cold starts. Auto-expires after 2 hours via TTL index -
 * a demo session doesn't need to live forever.
 */
const ChatSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  history: { type: [{ role: String, content: String }], default: [] },
  createdAt: { type: Date, default: Date.now, expires: 7200 }, // 2 hours
});

module.exports = mongoose.model("ChatSession", ChatSessionSchema);
