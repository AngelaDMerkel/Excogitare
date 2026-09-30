# V3 Layers checklist overlay

Status: **Verified** for the approved interface scope. Three interactive mockups were created; the user approved **01 Checklist**, which is integrated into Generate and Refine.

## Contract

The user reports that opening Layers displaces the map and requests three alternatives that fit the existing visual language and interaction. Keep the approved 88px Layers trigger above the right-hand history. Show all five working layer controls in (1) a compact checklist, (2) on/off switches, and (3) visual tiles. Use the existing paper/navy palette, balanced borders, compact typography and line icons. Support keyboard focus, Space, Escape, trigger toggling and outside dismissal. Preserve map pan/zoom when showing or hiding the overlay.

The previous menu was included in `fitSelectors`, so visibility changes could cause automatic framing to solve around it. The approved menu uses a distinct overlay class from the initial HTML, excluded from layout obstacles, and places its fixed popup at document level. The trigger remains a fixed-size layout obstacle.

## Implementation and completion gates

- **Contract and interface:** the approved 88px trigger opens a paper/navy checklist with line icons, native checkbox states, a Close button and a chevron. The fixed menu stays within the viewport, scrolls if necessary, and closes on Escape, outside pointer input, workspace changes or entry into mobile. Keyboard opening focuses the first checkbox; Close and Escape return focus to the trigger. It opens beside the trigger when space permits and below it otherwise.
- **Rendering:** removed the transient menu from map-fit obstacles. Opening, closing and changing layers retain the current camera. Native inputs and existing drawing handlers are preserved.
- **Model, defaults, Randomise, determinism, workers and cloning:** inapplicable; this only presents the existing five display layers. The default layer values are unchanged.
- **Editing, history and selective regeneration:** the same control serves Generate and Refine. No map edits or snapshot changes are introduced. Interaction checks used session-only samples.
- **Import/export/round trip and Repair:** inapplicable; file data and domain behavior are unchanged.
- **Builds and regressions:** lint, TypeScript, production and Pages builds pass; all 24 rendered checks pass. New domain tests were unnecessary for this presentation change. Docker is installed but its daemon is unavailable, so Alpine execution could not run.
- **Documentation and reconciliation:** the V3 guide, study guide and feature register describe the approved integration. The switch and tile studies remain historical alternatives. The final diff contains the shared checklist assets, entry-point wiring, packaging and the framing fix. The user has requested semantic commits for the completed work.


## Verification evidence

- Exact screenshot pixels in the visible map region matched before/open/closed at 1280×720. The same comparison passed after manual zoom and pan. Enabling Hex grid changed the map pixels; disabling it restored them.
- Layout-obstacle bounds matched before and after opening the menu.
- Keyboard Space, Escape, Close/focus return, outside dismissal, workspace dismissal and reopening in Refine passed.
- At 900×600 and 760×420 the entire popup remained inside the viewport. At 390×844 it closed and disappeared, preserving the Randomise/Save mobile interface.
- The rebuilt production server loaded the checklist and all five controls. Screenshot: [`layers-overlay-preview.jpg`](../../mockups/v3/layers-overlay-preview.jpg). Results: [`v3-layers-overlay.json`](../verification/v3-layers-overlay.json).
