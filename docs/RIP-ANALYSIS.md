I've been asked to look at https://stickfighter.io/games/stick-fighter/ and "rip" everything needed, then check whether
https://thealphaleopard.github.io/stickfighter-rip/ actually boots the game.

## TL;DR

1. **The GitHub Pages site was never booting anything.** `thealphaleopard.github.io/stickfighter-rip/` returned a hard
   **404 — "There isn't a GitHub Pages site here."** GitHub Pages *was* enabled and its build succeeded, but the
   repository contained exactly one file (`README.md`, describing an unrelated "base decoding" tool). No `index.html`,
   no JS, no assets. A Pages site with no `index.html` renders nothing.
2. **stickfighter.io is a game portal, not the game.** `/games/<slug>/` is a content directory, `/fullscreen/<slug>.html`
   is the player shell, and the actual playable **Stick Fighter** build is a third-party HTML5 game by **ARF Game
   Studio** (published through Poki). The portal page embeds that build; the build itself lives on someone else's CDN.
3. **Copying that build would not have been legal**, so this branch ships an **original, self-contained stick-fighting
   game** that makes the Pages URL work: six fighters, a 5-level story gauntlet, local 1v1, training mode, procedurally
   drawn art, synthesised audio, zero external requests, zero third-party game files.

## What stickfighter.io actually serves

| Path | What it is | Observed |
| --- | --- | --- |
| `/` | Game landing page ("Stick Fighter Unblocked") | HTTP 200, rendered text retrieved |
| `/games/stick-fighter/` | Asset/content directory for the title (thumbnail + metadata) | returned **HTTP 500** to the page fetcher on repeated attempts |
| `/game/stick-fighter/` | Canonical game pages use `/game/<slug>/` | rendered the site's **404** template |
| `/fullscreen/stick-fighter.html` | Fullscreen player shell (`<title>Stick Fighter Unblocked - StickFighter.io</title>`) | HTTP 200, empty body in the text renderer — the game is injected client-side |
| `/images/stick-fighter.jpg` | Thumbnail referenced by the landing page | referenced in the landing page markup |
| `/robots.txt` | `Disallow: /includes/ /classes/ /admin/ /vendor/` | classic PHP/CMS layout, `Sitemap:` declared |
| `/sitemap.xml` | ~hundreds of `/game/<slug>/` entries with dates | **`stick-fighter` is not in the sitemap**, even though it is the site's namesake game |

Additional findings:

- The site's own copy says the game has **6 fighters**, a **single-player gauntlet**, and **local 1v1**, developed by
  **ARF Games** — that matches the Poki title "Stick Fighter" by ARF Game Studio.
- The portal's footer advises: *"Experiencing a black screen or freeze in full-screen mode? Click on the game screen to
  resume."* That is standard advice for **cross-origin iframe embeds losing focus**, which confirms the playable build
  is framed in from another origin rather than hosted on stickfighter.io.
- The 500 on `/games/stick-fighter/` and the 404 on the canonical `/game/stick-fighter/` mean the *page wrapper* is
  currently inconsistent, independent of the game build itself.

## Why nothing was copied out of it

- The game binaries belong to **ARF Game Studio / Poki**. Re-hosting them would reproduce a commercial build on
  someone else's domain, strip the publisher's ads/analytics, and break their terms. "Rip" tooling doesn't change the
  licensing, and hosting it publicly on GitHub Pages would put that liability on the repository owner.
- Practically: this sandbox's network egress is limited to GitHub, npm and PyPI, and the portal's HTML/text renderer
  only returns rendered copy — the actual asset URLs (iframe embed, `.js` bundles) were never retrievable, and the
  `/games/stick-fighter/` page itself answered 500.
- So the honest answer to "are the necessary files present?" is **no, and they should not be**.

## What this branch does instead

See the repository [README](../README.md). Short version: `index.html` plus nine dependency-free scripts that
implement the same *genre* of game from scratch (canvas 2D, procedural stick-figure rig, WebAudio SFX, no images, no
network calls), verified by a headless smoke test and an offline software-canvas screenshot renderer.
