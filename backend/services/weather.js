/**
 * Outdoor conditions, used to dynamically tighten/loosen indoor thresholds.
 * Free, no API key required.
 */
async function getOutdoorConditions({ lat, lon }) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,uv_index");
  url.searchParams.set("daily", "temperature_2m_max,uv_index_max");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo request failed: ${res.status}`);
  const data = await res.json();

  return {
    outdoorTempC: data.current?.temperature_2m,
    outdoorHumidityPct: data.current?.relative_humidity_2m,
    outdoorUvIndex: data.current?.uv_index,
    forecastMaxTempC: data.daily?.temperature_2m_max?.[0],
    forecastMaxUv: data.daily?.uv_index_max?.[0],
  };
}

module.exports = { getOutdoorConditions };
