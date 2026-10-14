# Pathways of the Sealed

A gothic occult **5×4 video slot** (20 fixed paylines) inspired by sealed pathways and ritual mystery — **demo credits only, not real-money gambling**.

Spins, RNG, and balance are **server-authoritative**. The GitHub Pages frontend talks to a Node API (same engine/config as the RTP simulator).

## Stack

- **Vite + TypeScript** frontend (vanilla DOM)
- **Node HTTP API** (`npm run server`, default port **8787**)
- Seeded deterministic math RNG (`mulberry32`)
- Original programmatic **SVG** symbol art
- **Vitest** + RTP Monte Carlo simulator

## Quick start (local)

```bash
npm install

# Terminal A — authoritative API
npm run server
# → http://0.0.0.0:8787  (PORT=8787 by default)

# Terminal B — frontend
npm run dev
# Open http://localhost:5173/?api=http://127.0.0.1:8787
```

Or set the API URL in **Settings** (saved to `localStorage`). Build-time default: `VITE_API_BASE`.

```bash
npm test
npm run simulate
npm run build
```

Keyboard: **Space/Enter** spin · **↑/↓** bet · **Esc** close modal.

## Server API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness |
| `POST` | `/api/session` | Create session (demo balance) |
| `GET` | `/api/session/:id` | Snapshot |
| `POST` | `/api/session/:id/spin` | Base spin |
| `POST` | `/api/session/:id/bet` | `{ bet }` |
| `POST` | `/api/session/:id/bet/adjust` | `{ dir: 1 \| -1 }` |
| `POST` | `/api/session/:id/bonus/select` | `{ mode }` |
| `POST` | `/api/session/:id/bonus/spin` | Bonus free spin |
| `POST` | `/api/session/:id/tarot/pick` | Tarot Club pick |
| `POST` | `/api/session/:id/bonus/ack` | Leave bonus summary |
| `POST` | `/api/session/:id/reset` | Reset demo |
| `POST` | `/api/session/:id/mute` | `{ muted }` |

**CORS** allowlist: `https://faiqali-dot.github.io`, `http://localhost:5173`, `http://127.0.0.1:5173`, preview ports, plus `CORS_ORIGINS` env (comma-separated).

Env:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | Listen port |
| `CORS_ORIGINS` | _(empty)_ | Extra allowed origins |

## Running behind a public HTTPS tunnel (cloudflared)

Temporary hosting on a Linux box for the Pages frontend:

```bash
# On the Linux box
git clone <this-repo> && cd <repo>
npm install
npm run server
# Server listens on :8787

# In another shell — quick tunnel (no account config required for trycloudflare)
cloudflared tunnel --url http://127.0.0.1:8787
# Copy the https://xxxx.trycloudflare.com URL it prints
```

Point the Pages site at that URL (no rebuild):

1. Open `https://faiqali-dot.github.io/<repo>/?api=https://xxxx.trycloudflare.com`
2. Or open **Settings → API base URL**, paste the tunnel URL, **Save API & reconnect**

The `?api=` value is persisted in `localStorage` under `pathways-api-base`.

Optional: set GitHub Actions variable `VITE_API_BASE` so new builds default to a stable tunnel/host URL (still overridable at runtime).

## GitHub Pages (frontend only)

Workflow: `.github/workflows/pages.yml` builds and deploys `dist/`. The **API is not deployed to Pages** — run it on your Linux box + tunnel as above.

Enable Pages: repo **Settings → Pages → GitHub Actions**.

If the site is served from a project path (`/repo-name/`), set Vite `base` accordingly in `vite.config.ts`.

## Features

- Fool's Mirror wilds (expanding; 2× on lines that use the expanded wild)
- Pathway Gate scatters: **3–4** → choose Tarot Club or Crimson Moon; **5+** → Fool's Miracles
- **Sequence** persistent multiplier (max 15×), resets after every completed bonus
- **Spirituality** meter + Grafting, Blind Stupidity, Creeping Hunger, Glove, Locked Wild
- Full paytable / help / settings; muted audio; prefers-reduced-motion respected

## Math & RTP

Target **96.00%** (±1.0 pp Monte Carlo tolerance at N≈1e6). See [`docs/RTP.md`](docs/RTP.md).

**Measured (1,000,000 spins, seed 7):** RTP **95.979%**.

## Artwork & licenses

All symbols are original programmatic SVG. See [`docs/ASSETS.md`](docs/ASSETS.md).

## Architecture

```
src/config/gameConfig.ts   # single source of truth (game + sim + server)
src/engine/                 # RNG, reels, paylines, wilds, sequence, spirituality, bonuses, pipeline
server/index.ts             # authoritative HTTP API
src/api/                    # client config, HTTP client, remote session mirror
src/art/symbols.ts          # SVG pipeline
src/ui/                     # rendering only — no local payout math
src/sim/simulator.ts        # RTP harness
tests/
```
