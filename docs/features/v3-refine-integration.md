# V3 Refine integration

Status: **Verified** for the approved desktop workflow and supported map-editing rules.

## Approved outcome

Promote 04 into the main Refine pane: text controls matching Generate; Global changes and Local refinement with independent drafts; Select by Geographic region, Area or Single tile; contextual region type/area shape; clear regional guidance; preview/compare/discard/apply in a fixed footer; Undo/Redo; grouped supported placement checks; starting-balance review. Keep the Generate frame, Save alignment, Layers and desktop/mobile boundaries.

## Completion gates

- **Selection and model:** pure, deterministic hex hit testing, connected regions, rectangles and custom polygons. Local operations require an explicit nonempty valid tile set and cannot modify outside it. Single tile always means one tile. No prepared study selection or deliberate invalid fixture enters production.
- **Actual edits:** tested local terrain/feature edits and resource relocation; global relative climate, relief, vegetation and resource adjustments. Keep dimensions, land/water topology, rivers, starts, cities, wonders and unrelated metadata. Validate changed placements with existing rules; disclose necessary content removals. Redistribution preserves deposit types and quantities.
- **UI and rendering:** retain approved styling and common dropdown behavior, correct keyboard/disabled states, explicit target and preview labels, stable sidebar/camera, region perimeter and pending-boundary display.
- **Lifecycle/history:** all accepted edits create normal persistent snapshots; preview/discard leave accepted state intact. Undo/Redo remains functional at the history limit. Import/generation/external history changes clear stale edit targets and undo branches. Mark generation evidence stale on accepted edits.
- **Import/export/Repair:** use current parser, placement rules, repair and loss-preserving writer. Test unchanged source maps, imported bytes and round trips. The pane does not claim new game/scenario compatibility or exact simulation of climate or fairness.
- **Checks and docs:** focused domain/selection tests, relevant UI regressions, lint/types, production and Pages packaging, browser editing/history/repair and layout checks; Alpine if available. Reconcile the guide and feature register. Preserve unrelated pending changes. Make semantic commits as checked changes are completed; do not push without an explicit request.

## Implementation and evidence

- Active entry points load `refine.js`/`refine.css`. No study fixtures, preset selections or comparison navigation are loaded. The main app supplies explicit lifecycle/rendering hooks; Generate and Refine share `select-menus.js` rather than independent menu controllers.
- `lib/v3/refine.ts` provides deterministic scoped/global edits. Global transitions rank against existing geography with coherent spatial variation; cooling/warming includes existing cold-water margins. New supported placement conflicts are prevented or, for climate, removed with counts disclosed in preview. Existing unrelated placement errors are left for Repair. Source maps and file metadata remain unchanged until Apply.
- Twelve Refine/selection tests and six map-layer tests pass. They cover exact hex hits, connected/wrapped regions, polygon containment, explicit scope, immutable input, legal edits, resource conservation, climate/sea ice, directional density and imported-byte round trips. All 29 existing rendered-interface/map-fit checks pass: **47 checks total**. Types, lint and production/Pages builds pass; V3 and Pages asset packaging include the new files. Docker's daemon was unavailable, so Alpine was not run.
- In the browser, a single-tile forest removal previewed one tile, Apply added a snapshot, and Undo/Redo restored the corresponding map. Global Denser vegetation previewed 546 changed tiles; returning to Local retained the selected tile and local settings. Rectangle and custom-boundary selection produced 165 and 110 tiles respectively.
- A 100-entry session fixture confirmed eviction recovery: Apply removed the oldest original, Undo restored it as a new retained snapshot, and Redo returned to the edit. The list remained at 100 throughout. Normal persistent storage uses the existing store's add/select transactions; Undo/Redo stacks themselves are session-only.
- The built-in repair example produced three grouped findings. Its preview reported two changed tiles and two removals; Apply cleared the findings. Results are limited to the first 100 visible findings and only those selected findings are corrected.
- Generate and a global Refine preview had identical bounds: panel (16,16), 275.9706 × 615.474px; Save (16,643.46875), 275.96875 × 40px. The approved fixed footer, guidance and hover details remain in place. Existing mobile guards hide Refine; a fresh exhaustive mobile/breakpoint matrix was not run.
- Save successfully prepared a `.Civ5Map` Blob URL without an error after the repair. The browser automation did not expose a download event within ten seconds, so final file delivery was not claimed from that attempt; domain writer/update round trips passed independently.
- Updated the illustrated user guide and captured [local controls](../images/v3-refine-controls.png), [global preview](../images/v3-refine-global.png) and [repairs](../images/v3-refine-repairs.png). The final code/register comparison matches approved 04. Unrelated changes are preserved. The checked implementation is included in the semantic commits authorized by the user.

## Practical limits

Global climate edits are relative terrain/ecology adjustments, not a new atmospheric or watershed simulation. More rugged creates hills without making existing starts impassable. Selection regions are connected current tile geography; custom polygons use the displayed canvas. Supported placement rules do not cover every mod rule, and this work adds no new fixed-start/scenario or in-game compatibility guarantee. Accepted edits mark retained generation evidence stale; current Layers analyses recompute from the displayed map.
