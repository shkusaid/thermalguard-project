/**
 * ThermalGuard Rules Engine
 *
 * Deterministic, explainable safety logic. NOT a trained model — every alert
 * traces back to a named threshold and the exact reading that triggered it.
 * This is intentional: for a worker-safety / fire-risk system, "why did this
 * fire" must always be answerable in plain terms, not a black box.
 *
 * Two independent risk tracks, because they are not the same hazard:
 *   - WORKER HEAT STRESS  (zoneType: "worker")   — based on heat index (temp + humidity)
 *   - FIRE / IGNITION RISK (zoneType: "hazard")   — based on raw temperature, tighter tolerance
 *
 * Outdoor conditions (from Open-Meteo, informed by FortyGuard context) tighten
 * or loosen thresholds — hot, dry outdoor days increase both indoor heat
 * buildup and fire risk, so thresholds should not be static.
 */

// --- Zone type base thresholds (Celsius) ---
// These are demo-calibration starting points referencing general OSHA heat
// index guidance and common industrial fire-safety margins. Before any real
// deployment, replace with your facility's actual safety-engineering figures.
const ZONE_TYPE_PROFILES = {
  worker: {
    label: "Worker zone (heat stress)",
    watchC: 30,
    warningC: 35,
    criticalC: 39,
    humidityAmplifiesRisk: true, // heat index effect
  },
  hazard: {
    label: "Hazardous / flammable materials zone (fire risk)",
    watchC: 35,
    warningC: 42,
    criticalC: 48,
    humidityAmplifiesRisk: false, // fire risk is not humidity-driven the same way
  },
  storage: {
    label: "General storage (baseline)",
    watchC: 34,
    warningC: 40,
    criticalC: 46,
    humidityAmplifiesRisk: false,
  },
};

/**
 * Simplified heat index approximation (Celsius in/out), NOAA-style formula
 * simplified for demo use. Only applied to worker zones. Real deployments
 * should use the full NOAA Rothfusz regression or a validated library.
 */
function approximateHeatIndexC(tempC, humidityPct) {
  if (humidityPct == null) return tempC;
  const tempF = (tempC * 9) / 5 + 32;
  // Simplified additive approximation: heat index rises meaningfully above
  // 40% humidity when temp is already elevated.
  const humidityFactor = Math.max(0, humidityPct - 40) * 0.05;
  const adjustedF = tempF + humidityFactor * (tempF > 80 ? 1 : 0.3);
  return ((adjustedF - 32) * 5) / 9;
}

/**
 * Outdoor-driven threshold adjustment. Hot/dry outdoor days tighten
 * thresholds (indoor heat builds faster, fire risk rises); mild outdoor
 * days leave thresholds at baseline.
 */
function outdoorAdjustmentC(outdoorTempC, outdoorUvIndex) {
  let adjustment = 0;
  if (outdoorTempC != null && outdoorTempC >= 38) adjustment -= 3;
  else if (outdoorTempC != null && outdoorTempC >= 32) adjustment -= 1.5;

  if (outdoorUvIndex != null && outdoorUvIndex >= 9) adjustment -= 1;

  return adjustment; // negative = thresholds tighten (trigger sooner)
}

function levelFromThresholds(effectiveTempC, thresholds) {
  if (effectiveTempC >= thresholds.criticalC) return "critical";
  if (effectiveTempC >= thresholds.warningC) return "warning";
  if (effectiveTempC >= thresholds.watchC) return "watch";
  return "info";
}

const ACTIONS = {
  worker: {
    info: "No action needed. Normal working conditions.",
    watch: "Monitor conditions. Ensure hydration stations are accessible.",
    warning: "Increase break frequency, rotate crew through cooler areas, actively enforce hydration breaks.",
    critical: "Suspend non-essential physical work in this zone until temperature drops below threshold. Move workers to a cooled area immediately.",
  },
  hazard: {
    info: "No action needed. Normal conditions.",
    watch: "Monitor conditions. Confirm ventilation systems are operating normally.",
    warning: "Increase ventilation. Inspect equipment near this zone for overheating. Restrict non-essential access.",
    critical: "Evacuate this zone immediately. Fire risk is elevated. Notify facility safety officer and emergency services.",
  },
  storage: {
    info: "No action needed.",
    watch: "Monitor conditions periodically.",
    warning: "Inspect stored materials for heat sensitivity. Improve airflow if possible.",
    critical: "Evacuate non-essential personnel from this zone. Inspect for material degradation or ignition risk.",
  },
};

/**
 * Evaluate a single zone reading.
 * @param {{ zoneId: string, zoneType: "worker"|"hazard"|"storage", indoorTempC: number, indoorHumidityPct?: number }} zone
 * @param {{ outdoorTempC?: number, outdoorUvIndex?: number }} outdoor
 */
function evaluateZone(zone, outdoor) {
  const profile = ZONE_TYPE_PROFILES[zone.zoneType] || ZONE_TYPE_PROFILES.storage;

  const effectiveTempC = profile.humidityAmplifiesRisk
    ? approximateHeatIndexC(zone.indoorTempC, zone.indoorHumidityPct)
    : zone.indoorTempC;

  const adjustment = outdoorAdjustmentC(outdoor?.outdoorTempC, outdoor?.outdoorUvIndex);
  const thresholds = {
    watchC: profile.watchC + adjustment,
    warningC: profile.warningC + adjustment,
    criticalC: profile.criticalC + adjustment,
  };

  const level = levelFromThresholds(effectiveTempC, thresholds);

  return {
    zoneId: zone.zoneId,
    zoneType: zone.zoneType,
    zoneLabel: profile.label,
    indoorTempC: zone.indoorTempC,
    indoorHumidityPct: zone.indoorHumidityPct ?? null,
    effectiveTempC: Number(effectiveTempC.toFixed(1)),
    thresholdsUsed: {
      watchC: Number(thresholds.watchC.toFixed(1)),
      warningC: Number(thresholds.warningC.toFixed(1)),
      criticalC: Number(thresholds.criticalC.toFixed(1)),
    },
    outdoorAdjustmentC: adjustment,
    level,
    action: ACTIONS[zone.zoneType]?.[level] || ACTIONS.storage[level],
    // Traceability: exactly why this fired, for future accuracy validation.
    reasoning: `Effective temperature ${effectiveTempC.toFixed(1)}\u00b0C compared against ${zone.zoneType} thresholds (adjusted ${adjustment}\u00b0C for outdoor conditions) \u2192 level "${level}".`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Evaluate all zones in a facility and determine if any zone requires an
 * emergency call (critical + hazard type = fire risk = call security/emergency).
 */
function evaluateFacility(zones, outdoor) {
  const results = zones.map((z) => evaluateZone(z, outdoor));
  const requiresEmergencyCall = results.some(
    (r) => r.level === "critical" && r.zoneType === "hazard"
  );
  const highestLevel = results.reduce((worst, r) => {
    const order = { info: 0, watch: 1, warning: 2, critical: 3 };
    return order[r.level] > order[worst] ? r.level : worst;
  }, "info");

  return { zones: results, highestLevel, requiresEmergencyCall };
}

module.exports = { evaluateZone, evaluateFacility, ZONE_TYPE_PROFILES };
