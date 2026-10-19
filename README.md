# Composer Hub

**composerhub.vercel.app** — Personal composition & improvisation management system.

## What this is

A React + TypeScript + Vite web app (shadcn/ui, Tailwind) backed by Supabase. It tracks every creative idea — from spark to release — with AI-assisted prompts, audio upload + waveform, metadata for DistroKid/Insight Timer, and a streak tracker.

**This repo now also contains the canonical versions of the local automation scripts** that drive the recording workflow from outside the browser:

- `scripts/composer-hub.js` — create ideas, fetch daily prompts (called by Workflow Picker)
- `scripts/composer-hub-login.js` — one-time auth setup, caches refresh token
- `scripts/meld-scene.js` — switch Meld Studio scenes via WebChannel API
- `scripts/finish-take.js` — pair Meld video with Logic capture, file into Movies/
- `scripts/Workflow Picker (Consolidated).applescript` — the master menu (5 workflows)

The Workflow Picker runs as a compiled `.app` (`/Users/danielebuatti/Music/Logic/_Scripts/Workflow Picker.app`). It calls these scripts at record-start and record-end.

## Quick start

```bash
# Install deps
pnpm install

# Run the web app locally
pnpm dev
```

## Local script commands (run from repo root)

```bash
# One-time login (caches session in ~/.config/composer-hub/auth.json)
pnpm ch:login

# Create an idea in Composer Hub (prints the URL)
pnpm ch:capture "My Improvisation Title"

# Fetch today's Daily Creative Prompt (for inspiration before playing)
pnpm ch:prompt

# Deploy scripts + recompile Workflow Picker.app to the live location
pnpm ch:deploy
```

The live location is `/Users/danielebuatti/Music/Logic/_Scripts/`. After any script change, run `pnpm ch:deploy` — it copies the four `.js` files and recompiles the AppleScript.

## The Workflow Picker (5 modes)

Double-click **Workflow Picker.app** in `/Users/danielebuatti/Music/Logic/_Scripts/`:

| Mode | What it does |
|------|--------------|
| **TikTok/Shorts** | Duplicates streaming Logic template → opens it → switches Meld to "TikTok" scene → opens Photos + TikTok upload page → tiles Logic/Meld side by side |
| **IG Story (Quick Capture)** | Same as above, no upload step |
| **Piano Improvisation** | Asks: Felt Piano / Piano + Film it? → fetches Daily Creative Prompt from Composer Hub → creates entry immediately → opens Logic (+ Meld if filming) |
| **Deep Composition** | Mounts NAS (`Crystal-Tokyo.local`), prompts project name, logs to Composer Hub, copies Logic/Sibelius templates into dated NAS folder |
| **Finish Take** | Pairs newest Meld video (from `Movies/_Inbox/`) with newest Logic capture (`_Captures/`) → moves video into `Movies/<Label>/` with matching name |

## Key design principles

- **Log immediately, not after** — entry exists at record-start, before any audio. Audio attached later is fine.
- **Prompt before play** — Daily Creative Prompt is shown *before* you play, to influence what you create.
- **Distribution decided later** — DistroKid / Insight Timer flags set inside Composer Hub dashboard, not in the recording step.
- **Date-first naming** — `20260722-172057 Piano.logicx` sorts chronologically everywhere.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Workflow Picker.app (AppleScript)                          │
│    │                                                         │
│    ├─→ node scripts/composer-hub.js --prompt  (daily prompt)│
│    ├─→ node scripts/composer-hub.js "Title"   (create idea) │
│    ├─→ node scripts/meld-scene.js "Scene"                   │
│    └─→ node scripts/finish-take.js [title]  (post-record)   │
└─────────────────────────────────────────────────────────────┘
                           │
                    HTTPS / Supabase REST
                           │
              ┌────────────▼────────────┐
              │  Composer Hub (Vercel)  │
              │  + Supabase (Postgres)  │
              │  + Edge Functions (AI)  │
              └─────────────────────────┘
```

## Supabase schema (core)

```sql
create table improvisations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  generated_name text,
  status text default 'uploaded',
  file_name text,
  storage_path text,
  is_improvisation boolean,
  is_piano boolean,
  is_instrumental boolean,
  is_original_song boolean,
  has_explicit_lyrics boolean,
  primary_genre text,
  secondary_genre text,
  analysis_data jsonb,
  artwork_url text,
  artwork_prompt text,
  notes jsonb default '[]',
  user_tags text[] default '{}',
  is_ready_for_release boolean default false,
  is_metadata_confirmed boolean default false,
  insight_content_type text,
  insight_language text,
  insight_primary_use text,
  insight_audience_level text,
  insight_audience_age text[] default '{}',
  insight_benefits text[] default '{}',
  insight_practices text,
  insight_themes text[] default '{}',
  insight_voice text,
  description text,
  is_submitted_to_distrokid boolean default false,
  is_submitted_to_insight_timer boolean default false,
  created_at timestamptz default now()
);
```

Row Level Security: users only see their own rows.

## Edge Functions (AI layer)

- `generate-daily-prompt` — called by `ch:prompt` / Picker before Piano Improvisation
- `generate-title`, `generate-description`, `generate-artwork` — used in detail view
- `generate-creative-suggestions` — AI Creative Coach
- `analyze-improvisation` — audio analysis (key, tempo, mood)
- `populate-distribution-metadata` — pre-fill DistroKid/Insight Timer fields

## Hardware / audio routing (for context)

- **PreSonus** interface → audio I/O
- **BlackHole 2ch** → virtual loopback, routes Logic audio into Meld for recording
- **Multi-Output Device** "Recording Output (PreSonus + BlackHole)" in Audio MIDI Setup
- **Privia USB** = MIDI only
- **iPhone** = camera via Rode Wireless GO (receiver → spare PreSonus input)

Fallback Multi-Output Device: "Recording Output (Built-in + BlackHole)" — for days without PreSonus (see `PreSonus Fallback Setup - Action Items.md`).

## Known quirks

- Script Editor saves `.applescript` as UTF-16 (harmless but breaks some tooling). Use `Workflow Picker.app` day-to-day.
- NAS IP drifts — hostname `Crystal-Tokyo.local` is reliable; hardcoded IP fallback goes stale.
- `generate-daily-prompt` can return the same prompt on repeated calls within a time window (backend behavior, not a bug here).

## Development

```bash
# Web app
pnpm dev

# Type-check
pnpm typecheck

# Lint
pnpm lint

# Tests
pnpm test

# Deploy scripts to live location + recompile .app
pnpm ch:deploy
```

---

*Last sync: run `pnpm ch:deploy` to push script changes to the live Workflow Picker.*