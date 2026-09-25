# History

One timeline. The older documents number things differently:
- NOTES.md: "passes 1–16" (August);
- CLAUDE.md: "second … ninth pass" (September);
- REVIEW.md: "round 8", "round 9".

They are all the same kind of thing: one stretch of work after one message
of owner feedback. This file gives each a single name, **S-n** (September
stretch n), and says where its details are.

## Before September

| when | what | details |
| --- | --- | --- |
| to 24 Aug, ~08:00 | Original Claude sessions: line 70 Nyugati–Vác–Szob from OSM + SRTM, WebGL2, Python bake. NOTES.md passes 1–16. | `NOTES.md` (read its **Traps** section; the rest is history) |
| 24 Aug, daytime | Gemini: drone/orbit cameras, follow modes, traffic, audio, 15 hand-typed landmarks (most since replaced by OSM data) | CLAUDE.md "Lineage" |
| 24 Aug, evening | Lines 2 and 71 started, settings, dynamic data fetch | CLAUDE.md "Lineage" |

## September (one long Claude Code session, compacted several times)

| name | date | owner feedback that started it | main results | details |
| --- | --- | --- | --- | --- |
| S-1 | 22 Sep | "make sense of this project"; accuracy; line 2; Pages; controls; hump | Orientation docs; panelház rule restored; multipolygon buildings; street lights; Nyugati model; train physics; overtaking traffic; aircraft; passenger mode; flood plane; **line 2 built** | CLAUDE.md "Work done 22 Sep" |
| S-2 | 23 Sep | wipers, weather, Danube levels, cars swallowed, Naszály, Samsung, wires, Esztergom | Auto wipers, seasonal weather, drought, landmarks anchored to OSM, industry, Esztergom, Kilátás mode | CLAUDE.md "third pass" |
| S-3 | 23 Sep | two Chain Bridges, Ferris wheel, UI crowded, plane, data over Gemini | OSM 3D building parts (Parliament, Bazilika), bridge decks, UI cleanup, weather rework, single-track working, dispatcher board, 3 aircraft | CLAUDE.md "fourth pass"; LANDMARKS.md; DATA_SOURCES.md |
| S-4 | 23–24 Sep | terrain holes, underpasses, tower windows, castle, Opera, people, line 2 PDF timetable, expansion, S21 | Terrain holes fixed, underpasses, façade kinds, slopes, platform people, line 2 printed timetable, **S21 built** | CLAUDE.md "fifth pass" |
| S-5 | 24 Sep | "go ahead with the city expansion tiling and car" | **City tiles** (252k buildings, 540 tiles), drivable car. Commit `478a8e0` v0.1 alpha (23 Sep 23:18), `4b8ddea` Pages root (24 Sep) | CLAUDE.md "sixth pass" |
| S-6 | 24 Sep | "review, hunt for bugs, gamify, physics" | `REVIEW.md` written | REVIEW.md top half |
| S-7 | 25 Sep morning | "I love everything in the review document … make it happen" | Loading screen, menu, missions, scoring, collisions, tests + CI, daily challenge, album | CLAUDE.md "seventh pass"; REVIEW.md "Done from this review" |
| S-8 | 25 Sep late morning | logo, façade variety, English, Népsziget, photo mode, DOF, TTS | Name + logo, HU/EN, photo mode, DOF/motion blur/AO, TTS announcements, façade atlas, OSM colours | CLAUDE.md "eighth pass"; REVIEW.md "Round 8" |
| S-9 | 25 Sep midday | the long list (images 28–47): villages, kisvasút, stickers, industry, S21 places, vegetation… | Village houses, city extras (all rails, structures, pipes, solar, labels), car models, stickers, U levels, kisvasút, heart, 4 tree forms, `demAt` half-pixel fix. Commit `e809141` (25 Sep 15:58) | CLAUDE.md "ninth pass"; REVIEW.md "Round 9" |
| S-10 | 25 Sep afternoon | "ship it"; BP Fatár; cars dark; kisvasút out of the world; Danube glitch | BP Fatár trees (304k), near window grown north, car shading, flood z-fight. Commit `d99eb53` (25 Sep 16:15) | CLAUDE.md "Handoff"; README "The city's trees"; NOTES Traps 12–14 |
| S-11 | 25 Sep late | KÖKI tower, Kilátás camera, S21 stock, **organise the docs** | Wrong KÖKI "TV tower" removed; follow camera raised; `docs/` written (this folder) | this file; docs/OWNER_BACKLOG.md |
| S-12 | 25 Sep night | (Gemini / Antigravity, in the copy-4 folder) | Docs only: the engine, VFX and disaster specs, an audit, a plan for the prenight feedback (in `docs/`) | `map_and_what_gemini_did.md` |
| S-13 | 26 Sep | "read through /docs … get through as much as possible"; then a mid-session message (Kispest, murmuration, Erzsébet híd, Megyeri, Szentendre…) | Fullscreen, FLIRT seat, corridor seasons, plane roll, tile-road leak, bridge fixes, MÁV 416 on S21, real cabs and cockpits, particles (crash, afterburner, vapour), pumpjacks, roads for line 2 and S21, Fót, Szentendre, AI cars off-road, trams, two announcements, murmuration, Erzsébet híd, Megyeri pylons, graphics sliders, `?mode=dark`. Not committed | `docs/SESSION_S13.md` |

## Things that were tried and reverted (so nobody tries them again blindly)

- Re-running `bake_route.py` for line 70 moves the stops by up to 280 m. Patch `route.json` in place instead.
- Rebaking line 70's world from the current tile cache gives a different far heightmap (up to 256 m apart; cause not found). S-10 kept the old one.
- The water-level fit over the grown near window came out wrong (754 mm/km). The old fit was kept.
- A "Határ út TV tower" override in `bake_cityx.py` put a 100 m tower on a GSM-R mast at KÖKI. Removed in S-11.
- The BP Fatár server refused connections after 200 of the one-per-tree dimension requests. Don't bulk-request again.
- `mock_runtimes.py` overwrote `data/runtimes.json` with mock values in August. Don't rebake line 70's timetable from it.
- Sending AI cars off every road end that has no junction (70% of ends, 15 s): a third of all traffic ended up in the fields. They now leave a road only when another lines up within 70 m.
- The BP Fatár dimension requests: see above. The Overpass mirrors are often busy; `overpass.py` retries, and several queries in a row can take ten minutes.
