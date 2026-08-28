# ThermoGuard

**Smarter Monitoring. Safer Environments.**

A real-time industrial heat-safety monitor that tracks worker heat stress
and fire risk zone-by-zone, distinguishing between the two because they are
genuinely different hazards with different thresholds and different
responses. Every alert is produced by a deterministic, explainable rules
engine — not a black-box model — with an AI agent layer that only explains
those determinations in plain language, never overrides them.

Built for **FortyGuard Hackathon 2026**.

![ThermoGuard](https://img.shields.io/badge/status-hackathon--demo-blue)

---

## Why this exists

Industrial facilities face two distinct heat-related dangers that are often
monitored the same way, even though they shouldn't be:

- **Worker heat stress** — factory floors, loading bays. Governed by
  heat-index thresholds (temperature + humidity), not raw temperature alone.
- **Fire / ignition risk** — chemical storage, hazardous material zones.
  Governed by tighter, temperature-driven thresholds, since the failure mode
  is combustion, not discomfort.

ThermoGuard treats these as separate risk tracks, tightens both dynamically
based on real outdoor conditions, and — for the fire-risk track — can
trigger a real emergency SMS the moment a hazardous zone crosses into
critical territory.

## Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript | Interactive dashboard, role-based pages |
| Backend | Express + Mongoose | REST API, MongoDB data layer |
| Database | MongoDB (Atlas free tier) | Users, sensor reading history |
| Auth | JWT + bcrypt | Staff / Administrator role-based access |
| AI agent | Groq (Llama 3.3 70B, free tier) | Explains alerts in plain language |
| Outdoor conditions | Open-Meteo (free) | Dynamically tightens indoor thresholds |
| Heat visualization | FortyGuard API | Facility-area heatmap (bonus feature) |
| Emergency alerts | Twilio | Real SMS to a facility's emergency contact |

## Architecture

```
[Slider now / real IoT sensor later] → POST /api/sensor-reading
                                              ↓
                                    persisted to MongoDB
                                              ↓
                    Open-Meteo outdoor conditions → dynamic threshold adjustment
                                              ↓
                         Rules Engine (deterministic, fully explainable)
                         worker zones: heat-index based
                         hazard zones: fire-risk based, tighter tolerance
                                              ↓
                         Groq agent explains status (never recalculates)
                                              ↓
              Critical + hazard zone → Twilio SMS to emergency contact
```

**The one seam that matters:** `POST /api/sensor-reading` is the only place
indoor temperature enters the system. The demo dashboard's sliders call it.
A real IoT sensor would call the exact same endpoint instead — nothing else
in the system changes.

## Pages

| Route | Access | Purpose |
|---|---|---|
| `/signin` | Public | Sign in / sign up, role selection |
| `/dashboard` | Staff, Admin | Live facility map, zone status, agent chat |
| `/history` | Staff, Admin | Last 5 readings per zone (MongoDB) |
| `/alerts` | Staff, Admin | Zones currently at warning/critical |
| `/reports` | Staff, Admin | Daily high/low/average per zone |
| `/settings` | Staff (view), Admin (edit) | Emergency contact number |

Role checks are enforced on the **backend**, not just hidden in the UI —
a Staff account cannot edit settings even by calling the API directly.

## Setup

### 1. MongoDB
Create a free cluster at [mongodb.com/atlas](https://mongodb.com/atlas),
allow network access from anywhere (fine for a hackathon demo), and copy
your connection string.

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env
# fill in GROQ_API_KEY, FORTYGUARD_API_KEY, MONGODB_URI, JWT_SECRET, Twilio vars
npm start
```
Generate `JWT_SECRET` with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open `http://localhost:3001` — you'll land on the Sign In page. Create an
account, choose Staff or Administrator, and you're in.

## On "accuracy"

This is a rules engine, not a trained model — there is no honest accuracy
percentage to quote without real-world validation against real facility
data and real incidents over time. Every alert includes a `reasoning` field
specifically so a real deployment could be validated against real outcomes
later. This is a design choice, not a limitation: for a system that can
trigger a real emergency call, every decision needs to be traceable to an
explicit, auditable rule — not a model's internal weights.

## On the surrounding-area map

The dashboard's map is a **stylized visual**, not real map tiles — pins
show small variations around one real outdoor reading (Open-Meteo), since a
real dense outdoor sensor network isn't available for this demo. Swapping in
real Leaflet + OpenStreetMap tiles is a natural next step for a production
version.

## Roadmap (not built yet, good next steps)

- Real IoT sensor integration (ESP32 + thermistor, or industrial-grade
  sensors) posting to the existing `/api/sensor-reading` endpoint — no other
  code changes required.
- Field validation of rules-engine thresholds against real facility safety
  data and OSHA guidance for the specific industry.
- Real interactive map tiles instead of the stylized version.
- Multi-facility support (currently single facility for demo clarity).

## License

Built for FortyGuard Hackathon 2026. Not intended for production safety use
without professional safety-engineering review and real-world validation.
