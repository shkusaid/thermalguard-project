# ThermoGuard — Industrial Heat Safety Monitor

Premium monitoring dashboard for worker heat stress and fire risk, with auth,
MongoDB-backed history/reports, and an AI agent grounded in deterministic
safety rules.

## Stack

- **Frontend**: Next.js (App Router) + TypeScript, custom navy/blue theme
- **Backend**: Express + Mongoose (MongoDB) + JWT auth
- **AI agent**: Groq (free tier, Llama 3.3 70B)
- **Outdoor conditions**: Open-Meteo (free, no key)
- **Heatmap visual (bonus)**: FortyGuard
- **Emergency alerts**: Twilio SMS

## Setup

### 1. MongoDB
Easiest: create a free cluster at mongodb.com/atlas, get your connection
string, and put it in `MONGODB_URI` in `.env`. Local `mongod` also works if
you prefer running it yourself.

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env
# fill in GROQ_API_KEY, FORTYGUARD_API_KEY, MONGODB_URI, JWT_SECRET, Twilio vars
npm start
```

### 3. Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3001 — you'll land on the Sign In / Sign Up page.
Create an account (choose Staff or Administrator), and you're in.

## Pages

- **/signin** — sign in / sign up, role selection (Staff / Administrator)
- **/dashboard** — main page: surrounding-area map, outdoor environment
  readout, building section sliders (mock sensors), agent panel + chat
- **/history** — last 5 readings per zone, persisted in MongoDB
- **/alerts** — zones currently at warning/critical level
- **/reports** — daily highest/lowest/average per zone, date-selectable
- **/settings** — account info; Administrator-only emergency contact number

## Role-based access

- **Staff**: full monitoring access (dashboard, history, alerts, reports)
- **Administrator**: everything Staff has, plus can edit the emergency
  contact number in Settings (`PATCH /api/settings` is admin-gated on the
  backend, not just hidden in the UI — this matters, since UI-only
  restrictions are trivially bypassed by calling the API directly)

## On the "surrounding area map"

The map is a **stylized visual**, not real map tiles — pins show small
variations around the one real outdoor reading (Open-Meteo), since a real
dense outdoor sensor network isn't available. If you want real interactive
map tiles later, swap `components/SurroundingMap.tsx` for a Leaflet +
OpenStreetMap integration (free, no API key needed) — ask if you want this
built next.

## Everything from the previous build still applies

- The mock-to-real-sensor seam (`POST /api/sensor-reading`) is unchanged —
  sliders today, real IoT sensors later, no other code changes needed.
- The rules engine is still fully deterministic and separate from the AI
  agent — see the earlier README section on "accuracy" for why this matters
  for a safety-critical system.
- Twilio setup notes (trial account, verified numbers) are unchanged from
  before.
