# Reference UI Analysis — Pathways of the Sealed

**Status:** blocked — reference source code not readable with this agent’s credentials  
**Date:** 2026-10-14  
**Primary reference (owner-directed):** `ejaw-games/rgs-frontend-slots-ninjagaming-omnis-riches-of-valhalla` @ `develop`  
**Fallback reference:** `FaiqAli-dot/riches-of-valhalla-client` @ `autospin-fix`  
**Policy:** read-only fetch only; never push to upstream or the fork; no proprietary art/assets

---

## 1. Fetch attempts (read-only)

| Target | Method | Result |
|--------|--------|--------|
| Upstream `develop` | Anonymous `git ls-remote` / clone | `Repository not found` |
| Upstream `develop` | Workspace `x-access-token` (LoM install) | `Repository not found` |
| Upstream `develop` | `gh api repos/...` / `gh repo clone` | HTTP 404 / GraphQL could not resolve repository |
| Fork `autospin-fix` | Same methods as above | Same failures |
| Org `ejaw-games` | `gh api orgs/ejaw-games` | Org exists; `public_repos: 0` (all private / none listable) |
| Org repos list | `gh api orgs/ejaw-games/repos` | Empty for this token |
| Name variants | Alternate casings / repo names | All 404 |

No local cache of either tree was found under `/tmp`, workspace stores, or prior agent artifacts.

**Conclusion:** Upstream `develop` is **not accessible**. Per owner instruction, fell back to the fork — the fork is **also not accessible**. Analysis and UI mirroring cannot proceed from real reference code until one of those remotes is readable.

---

## 2. Why this blocks the UI mirror

The requested work depends on inspecting the reference’s:

- Screen layout / HUD chrome (reel frame, meters, bet/spin cluster)
- Control UX (spin, autoplay, bet+/−, max bet, turbo, settings, paytable)
- `ui-plugin` (or equivalent) composition: how chrome is mounted vs game canvas
- State wiring for autoplay / free spins / bonus overlays
- Responsive / safe-area behavior

Without a checkout of upstream `develop` (preferred) or the fork, any “analysis” or layout refactor would be invented, not mirrored. That would violate the owner constraint to base the analysis on the latest upstream `develop` code.

---

## 3. Planned analysis outline (once access is granted)

When either remote is readable, this document will be replaced with a full write-up covering:

1. **Repo map** — packages, entrypoints, `ui-plugin` / HUD modules, asset pipeline boundaries  
2. **Viewport composition** — first-screen regions (branding, reels, controls, meters)  
3. **Control cluster** — spin primary, autoplay, bet controls, secondary actions  
4. **Plugin / chrome pattern** — what lives in plugin vs game; event / store contracts  
5. **Overlay / modal stack** — paytable, settings, bonus intros, win celebrations  
6. **Mapping to LoM** — concrete file-level changes under `src/ui/`, `src/styles/`, keeping `src/engine/`, `src/api/`, math, tests, and CI unchanged  
7. **Explicit non-goals** — no copy of proprietary Valhalla art, audio, fonts, or trademarked copy

---

## 4. Unblock options (owner)

Any one of the following is enough (read-only):

1. **Install the Cursor GitHub App** (or grant this agent’s token) on  
   `ejaw-games/rgs-frontend-slots-ninjagaming-omnis-riches-of-valhalla` with contents read, **or**
2. **Grant the same on the fork** `FaiqAli-dot/riches-of-valhalla-client`, **or**
3. **Attach / drop a tarball or local path** of upstream `develop` into the cloud environment (no push back).

Preferred order remains: **upstream `develop` → fork `autospin-fix`**.

---

## 5. LoM current UI baseline (for later diff)

Until the reference is available, the playable client remains the existing Pathways UI:

| Area | Location |
|------|----------|
| App shell / HUD / spin loop | `src/ui/app.ts` |
| Audio helpers | `src/ui/audio.ts` |
| Styles | `src/styles/main.css` |
| Engine / math / API | `src/engine/*`, `src/api/*` (unchanged by this workstream) |

No UI refactor was applied in this change set because there is no authentic reference to mirror.
