# Stick Fighter

The real **Stick Fighter** by **ARF Games** — the free two-button stickman fighter
([itch.io](https://arfgames.itch.io/stickfighter), also embedded at
[stickfighter.io/games/stick-fighter/](https://stickfighter.io/games/stick-fighter/)).

This repository is a static copy of the game's **Construct 3 web export**: `index.html`,
`data.json`, `scripts/` (runtime + project scripts), `images/`, `media/`, `fonts/` and
`icons/`. There is no build step, no bundler and no dependency on a CDN — every asset is
local, so it works offline once served over HTTP.

**Play:** https://thealphaleopard.github.io/stickfighter-rip/

## Run locally

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Do not open `index.html` from `file://` — Construct exports need HTTP for module scripts,
`fetch()` and WebGL. GitHub Pages (or any static host) works as-is, including from a
subdirectory.

## Notes on this copy

- The pages/SDK shims that pointed at the original publisher's CDN and analytics were
  removed; `poki-sdk.js` is a local no-op stub so the game still gets every SDK call it
  expects without making network requests.
- The original `scripts/project/scriptsInEvents.js` contained a domain sitelock that
  redirected visitors away from non-Poki hosts. It is replaced by a no-op so the game
  boots on GitHub Pages.
- Game data, sprites, sounds, fonts and the Construct runtime are the untouched originals.

Stick Fighter and its assets belong to ARF Games. The game is distributed for free by its
developer; this repo is an unmodified re-host of that free web build.
