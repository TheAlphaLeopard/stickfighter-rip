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
- `scripts/main.js` has two minimal compatibility tweaks for VFS/JAM players (see below).
- Game data, sprites, sounds and fonts are the untouched originals.

## fpile / `.jam` compatibility

Packing this folder into a `.jam` and running it through fpile (or a similar
`srcdoc` + virtual-filesystem player) needs three small shims, because those players
rewrite `document.baseURI` to a fake host (`http://vfs.local/`) and serve files from
blob URLs:

1. **Worker scripts.** Construct's `RuntimeInterface.CreateWorker()` calls
   `fetch(new URL(...))` with a **URL object**, but the VFS `fetch()` wrapper only
   resolves strings — so `dispatchworker.js` / `jobworker.js` escaped the VFS and
   failed with `net::ERR_FAILED`. `index.html` installs a fetch wrapper that converts
   URL objects to strings, and `scripts/main.js` now stringifies the worker URL at the
   source as well.
2. **Web fonts.** `FontFace` resolves relative URLs against the *parent* document
   (`about:srcdoc`), bypassing the VFS, so `fonts/*.otf` 404'd and text rendered as
   boxes. The shim in `index.html` resolves each font `url()` through the VFS-backed
   `fetch()` into a same-origin blob URL before the font is loaded.
3. **No external requests.** The no-op `poki-sdk.js` and the absence of a service
   worker mean a `.jam` runs with zero network access.

All shims are inert on a normal static host (they only activate when `document.baseURI`
is a VFS URL or the page is an `about:` document). Verified end-to-end in headless
Chrome through fpile: title screen → mode select → character select, with **0 console
errors, 0 failed requests and 0 external requests**.

Stick Fighter and its assets belong to ARF Games. The game is distributed for free by its
developer; this repo is a re-host of that free web build.
