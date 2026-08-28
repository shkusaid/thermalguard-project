/**
 * FortyGuard integration — used here as a BONUS visual feature (facility
 * heatmap), not as a blocking dependency for the safety alert pipeline.
 * The core alert logic runs on Open-Meteo + the indoor sensor endpoint,
 * which are fast and reliable; FortyGuard's heatmap can take time to
 * generate, so it's fetched separately and shown when ready.
 *
 * Confirmed against real FortyGuard docs during development:
 *   - POST /v1/heatmap            submits a polygon area-of-interest job
 *   - GET  /v1/status/{activity_id}   polls ANY async FortyGuard job
 *     (confirmed shared across Heat Intelligence and, per their docs
 *     structure, other async activities including heatmap generation)
 */

const BASE_URL = "https://api.fortyguard.com/v1";

function headers(apiKey) {
  if (!apiKey) throw new Error("FortyGuard API key not provided.");
  return { "api-key": apiKey, "Content-Type": "application/json" };
}

function bboxAroundPoint(lat, lon, deltaDeg = 0.005) {
  return {
    type: "Polygon",
    coordinates: [[
      [lon - deltaDeg, lat - deltaDeg],
      [lon + deltaDeg, lat - deltaDeg],
      [lon + deltaDeg, lat + deltaDeg],
      [lon - deltaDeg, lat + deltaDeg],
      [lon - deltaDeg, lat - deltaDeg],
    ]],
  };
}

async function submitHeatmap({ apiKey, lat, lon }) {
  const res = await fetch(`${BASE_URL}/heatmap`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      polygon_aoi: bboxAroundPoint(lat, lon),
      date_time: { start_date: new Date().toISOString().slice(0, 10), filter_type: 1 },
      granularity: 100,
    }),
  });
  if (!res.ok) throw new Error(`FortyGuard heatmap submit failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data?.data?.activity_id;
}

async function pollStatus({ apiKey, activityId }) {
  const res = await fetch(`${BASE_URL}/status/${activityId}`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`FortyGuard status check failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.data; // { status: "Processing"|"Completed"|"Failed", result?: {...} }
}

/**
 * Convenience: submit + poll with a bounded number of attempts. Intended to
 * run in the background, NOT inline in the safety-alert request path —
 * heatmap generation can take a while and must never delay an alert.
 */
async function getHeatmapEventually({ apiKey, lat, lon, maxAttempts = 12, delayMs = 5000 }) {
  const activityId = await submitHeatmap({ apiKey, lat, lon });

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    const status = await pollStatus({ apiKey, activityId });
    if (status.status === "Completed") return { activityId, ...status };
    if (status.status === "Failed") throw new Error(`FortyGuard heatmap job ${activityId} failed.`);
  }
  throw new Error(`FortyGuard heatmap job ${activityId} did not complete within the polling window.`);
}

module.exports = { submitHeatmap, pollStatus, getHeatmapEventually };
