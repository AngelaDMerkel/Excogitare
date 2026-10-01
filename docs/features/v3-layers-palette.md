# V3 Layers palette

Status: **Verified** for the integrated display workflow and documented map-derived estimates.

## Contract

Integrate approved 01 into the active V3 interface. Keep the compact menu attached beneath Layers with five plain groups and native switches. Show category counts, distinct resource symbols, player and city-state starts, and hover-only tile details whose bottom aligns with Save. Retain the current camera when opening, closing or changing display controls. No pinning or mockup navigation.

Map views use current map data, not the mockup's illustrative colours: movement terrain estimates, freshwater sources, settlement terrain estimates and comparable opening-region scores. Legends state the measure and estimates explicitly. Imported maps without starts cannot show starting balance. Display settings never change saved map data or generation settings.

## Completion gates

- **Model/domain:** shared pure map analysis for counts and overlays; correct hex adjacency/wrapping, river edges, resource categories, absent starts and unknown resources. Tests cover data integrity, water classification, reachability and current-map recomputation.
- **Interface/rendering:** approved styling, keyboard switches, dismiss/focus behavior, no fitting side effects, hover dismissal outside the map and while dragging, alignment after resize. Mobile retains Randomise/Save.
- **Lifecycle:** recompute for generation, import, history, Refine previews and accepted edits; do not retain stale balances from generation. Keep old preview pages functional.
- **Persistence/export/Repair:** layers are view state only; displayed counts and findings read the existing map/rules. No new file fields, worker protocol or repair actions. Verify analysis does not mutate maps and round trips retain tile data.
- **Checks:** focused analysis/UI tests, lint/types, V3 packaging and production/Pages builds. Alpine only if available. Update help and reconcile claims before reporting completion. Make semantic commits as checked changes are completed; do not push without an explicit request.

## Implementation and evidence

- The active entry points share the approved palette assets. The menu starts closed and is excluded from fit obstacles. Renderer hooks use map-derived data directly, without copying/repainting map tiles; historical studies and thumbnails retain their original renderer. Counts and analysis are cached by map identity, so generation, import, history and Refine preview objects receive fresh data.
- `lib/v3/map-layers.ts` supplies resource categories (including an explicit unknown category), wrapped hex adjacency, both banks of encoded river edges, inferred small coastal lakes, terrain movement estimates, reachable settlement estimates and disjoint opening regions. Starting balance recomputes the existing V3 opening-terrain formula from the displayed map. Invalid/out-of-bounds starts are excluded. The view is unavailable with fewer than two valid major starts.
- Six focused tests pass: resource categories, river flags/banks/wrapping, lake boundaries, movement/reachability, start ownership and edit recomputation, and unchanged bytes/tile round trips. All 29 existing rendered-interface/fit checks pass. Types, lint, V3 packaging, production build, Pages build and Pages asset verification pass. Docker's daemon was unavailable; Alpine was not run.
- Browser switches visibly change resource symbols. In the clear canvas rectangle (350,280)–(800,500) at 1280×720, opening/closing Layers changes zero pixels; hiding Luxury changes 6,300 pixels. All four analytical views display their appropriate legends and Normal restores the regular rendering.
- Importing an ordinary map updated counts and disabled Starting balance and missing start controls. In Refine, adding woodland changed the displayed count from 745 to 759; Show original restored 745, and Apply retained 759. History restoration returned the original sample's counts and available starts. A Tiny map generated successfully and reported four major and four city-state starts, with two natural wonders.
- Hover details appear over a tile, disappear over empty canvas, contain no pin control and align with Save at a measured 0px bottom difference. Keyboard opening focuses Map view; Escape closes and returns focus. Mobile guards preserve the existing two-action boundary; a fresh exhaustive mobile/breakpoint matrix was not run.
- Updated the user guide and [production screenshot](../images/v3-layers-palette.png), compared the approved request with the diff, and preserved unrelated pending edits. The checked implementation is included in the semantic commits authorized by the user.

## Limits

Movement ignores unit abilities, technologies, roads and other in-game modifiers. Settlement potential estimates reachable terrain within three land steps; it does not certify legal city placement or calculate yields. Opening scores are geographic proxies, not multiplayer fairness guarantees. The file has no lake flag, so the menu explicitly identifies inferred lakes (enclosed coastal components of up to ten tiles). River counts are encoded edges; feature/resource counts are occupied tiles. Imported resources with unknown definitions are kept separate. No stored maps, export metadata, Repair rules, generator or worker protocol changed.
