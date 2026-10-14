# Pathways of the Sealed

A gothic occult **5×4 video slot** (20 fixed paylines) — **demo credits only, not real-money gambling**.

**Default mode is fully client-side** (RNG + balance in the browser), so **GitHub Pages works on its own**. An optional Node API can take over spins/balance when you set an API URL.

## Stack

- **Vite + TypeScript** frontend (vanilla DOM)
- Shared math engine (also used by simulator + optional API)
- Optional **Node HTTP API** (`npm run server`, port **8787**)
- Vitest + RTP Monte Carlo simulator
- Original programmatic SVG art

## Quick start

```bash
npm install
npm run dev          # client-side play at http://localhost:5173
npm test
npm run simulate:quick
npm run build        # production static build
```

### Optional authoritative API

```bash
npm run server       # http://0.0.0.0:8787
# Point the UI at it:
#   http://localhost:5173/?api=http://127.0.0.1:8787
# or Settings → API base URL
```

Keyboard: **Space/Enter** spin · **↑/↓** bet · **Esc** close modal.

## GitHub Pages (static frontend)

Site: **https://faiqali-dot.github.io/lord-of-mysteries-slot/**

Workflow: `.github/workflows/pages.yml` builds with `VITE_BASE=/lord-of-mysteries-slot/` and deploys via `actions/deploy-pages`.

### Manual steps (owner)

1. Repo **Settings → Pages → Source: GitHub Actions** (not “Deploy from a branch”).
2. Merge/push to `main` (or run the **Deploy GitHub Pages** workflow manually).
3. Wait for the workflow to finish; open the Pages URL above.
4. *(Optional)* Repo **Settings → Secrets and variables → Actions → Variables**: set `VITE_API_BASE` to your API origin if you want the build to default to a remote server. Leave unset for pure client-side Pages.

> **GitHub Pages only serves static files** — it cannot run the Node API. The game is playable on Pages without any backend.

## CI

`.github/workflows/ci.yml` on PRs and pushes: typecheck, tests, seeded RTP smoke (20k spins), and a Pages-base production build.

## Optional API hosting (Fly.io / Render)

Use only if you want server-authoritative spins. CORS already allows `https://faiqali-dot.github.io`.

### Fly.io

Config: `fly.toml` + `Dockerfile`. Workflow: `.github/workflows/deploy-api.yml`.

**Owner steps:**

1. Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/), run `fly auth login`.
2. Create the app once: `fly apps create pathways-of-the-sealed-api` (or change `app` in `fly.toml`).
3. Repo **Settings → Secrets and variables → Actions → Secrets**: add `FLY_API_TOKEN` (`fly tokens create deploy`).
4. Push to `main` (paths under `server/` / `Dockerfile` / `fly.toml`) or run **Deploy API (Fly.io)** manually.
5. Set Actions variable `VITE_API_BASE=https://pathways-of-the-sealed-api.fly.dev` (or your app URL), **or** open Pages with `?api=https://…`.

Temporary tunnel instead of Fly:

```bash
npm run server
cloudflared tunnel --url http://127.0.0.1:8787
# then ?api=https://xxxx.trycloudflare.com
```

### Render (alternative)

`render.yaml` Blueprint: connect the repo in the Render dashboard, deploy the web service, then set `VITE_API_BASE` (or `?api=`) to the Render URL. Free plan sleeps when idle.

## API reference (optional server)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness |
| `POST` | `/api/session` | Create session |
| `GET` | `/api/session/:id` | Snapshot |
| `POST` | `/api/session/:id/spin` | Base spin |
| `POST` | `/api/session/:id/bet` | `{ bet }` |
| `POST` | `/api/session/:id/bet/adjust` | `{ dir: 1 \| -1 }` |
| `POST` | `/api/session/:id/bonus/select` | `{ mode }` |
| `POST` | `/api/session/:id/bonus/spin` | Bonus spin |
| `POST` | `/api/session/:id/tarot/pick` | Tarot pick |
| `POST` | `/api/session/:id/bonus/ack` | Leave summary |
| `POST` | `/api/session/:id/reset` | Reset demo |
| `POST` | `/api/session/:id/mute` | `{ muted }` |

Env: `PORT` (default 8787), `CORS_ORIGINS` (extra origins; Pages + localhost are built-in).

Frontend API URL resolution: `?api=` (saved to localStorage) → Settings → `VITE_API_BASE`. Empty = client-side.

When `?api=` points at a **localtunnel** / `*.loca.lt` URL, the client automatically sends the `Bypass-Tunnel-Reminder: true` header (and the API CORS allowlist permits that header on preflight).

## Features

Fool’s Mirror wilds · Pathway Gate scatters (3–4 choice / 5+ Fool’s Miracles) · Sequence (≤15×) · Spirituality effects · Tarot Club / Crimson Moon / Fool’s Miracles · paytable/help/settings.

## Math & RTP

Target **96.00%**. See [`docs/RTP.md`](docs/RTP.md). Measured **95.979%** @ 1e6 spins (seed 7).

## Artwork

Original SVG symbols; fonts OFL. [`docs/ASSETS.md`](docs/ASSETS.md).

## Architecture

```
src/config/gameConfig.ts   # single source of truth
src/engine/                 # shared math
src/api/localSession.ts     # client-side play (default)
src/api/remoteSession.ts    # optional remote API
server/index.ts             # optional Node API
.github/workflows/ci.yml
.github/workflows/pages.yml
.github/workflows/deploy-api.yml
```
