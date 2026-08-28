# Agrigent — FortyGuard Hackathon 2026

AI agent that turns hyperlocal heat data (FortyGuard) + weather/UV data (Open-Meteo)
into daily, plain-language farming actions: irrigation timing, fertilizer timing,
UV/sun-safety guidance, and frost warnings.

## Setup

```bash
npm install
cp .env.example .env
# then fill in FORTYGUARD_API_KEY and ANTHROPIC_API_KEY in .env
npm start
```

Server runs at `http://localhost:3000`.

## Project structure

```
agrigent/
  server.js              # Express routes, ties everything together
  services/
    fortyguard.js         # FortyGuard heat API calls
    weather.js             # Open-Meteo (UV, humidity, rain) — free, no key
    rulesEngine.js          # Crop + weather + heat -> structured recommendations
    agent.js                 # Claude API calls: summary + follow-up chat
  public/                    # Frontend goes here (static files served by Express)
  .env.example
```

No database. Chat history is kept in memory per session (resets on server
restart) — enough for a hackathon demo. If you want the farmer's last search
to persist across visits on their own device, use browser `localStorage` in
the frontend; that needs no backend change.

## API contract (for frontend work)

### `POST /api/advisory`
Request:
```json
{ "location": "Fresno, CA", "lat": 36.75, "lon": -119.77, "crop": "wheat", "growthStage": "flowering" }
```
Response:
```json
{
  "sessionId": "uuid-used-for-chat",
  "heat": { "temperature_f": 104, "risk_level": "high" },
  "weather": { "current": { "tempC": 34, "uvIndex": 9, "humidityPct": 22 }, "next3Days": [ ... ] },
  "results": [
    { "category": "irrigation", "level": "warning", "message": "...", "action": "..." },
    { "category": "fertilizer", "level": "info", "message": "...", "action": "..." },
    { "category": "uv", "level": "warning", "message": "...", "action": "..." }
  ],
  "agentSummary": "Plain-language paragraph the farmer reads first."
}
```

### `POST /api/chat`
Request:
```json
{ "sessionId": "uuid-from-advisory-response", "message": "why shouldn't I fertilize today?" }
```
Response:
```json
{ "reply": "Grounded, plain-language answer." }
```

Frontend can build against this contract with mock JSON before the backend
key is even set up — just hardcode a sample response matching the shape above.

## Test scenarios to build/demo against

Pick 3 fixed lat/lon + crop combos so your demo is reliable:
1. **Heatwave** — e.g. Phoenix, AZ + cotton (should trigger irrigation + UV warnings)
2. **Heavy rain forecast** — pick a location with rain in the 3-day forecast + wheat (should trigger the fertilizer-delay rule)
3. **Normal day** — a mild location (should return mostly "info" level, calm tone)

Run each through `/api/advisory` and check the `agentSummary` reads naturally
and doesn't contradict the `results` array.

## Notes on rules engine thresholds

The thresholds in `rulesEngine.js` are general agronomic heuristics for demo
purposes, not validated local guidance. Say this plainly in your pitch —
being upfront that you'd swap in official extension-office data for
production is a credibility point, not a weakness.
