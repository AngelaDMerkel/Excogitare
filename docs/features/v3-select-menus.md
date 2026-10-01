# V3 aligned dropdown menus

Status: **Verified** for the approved dropdown integration.

## Contract and gates

- Integrate approved study 02 in the active V3 entry points. Menus follow the displayed field bounds and use the existing paper/navy style. Experimental Size/Geometry choices use gold text without badges or an extra footer.
- Keep the original selects and change handlers as the setting source. Preserve Standard/Advanced drafts, Reset advanced, engine-dependent fields, non-experimental option groups, generation and Randomise reflection.
- Support click, arrows, Home/End, type-ahead, Enter/Space, Escape, Tab and outside dismissal. Avoid map hotkeys while editing a choice; mirror disabled states and preserve unchanged values.
- Keep the sidebar and camera stable. Clamp/scroll menus within small viewports, follow the control while scrolling, and retain the existing mobile boundary. Expose experimental status and descriptions to assistive technology.
- Verify real selection/generation and busy behavior, keyboard/focus, layouts, layers/fit and packaged updates. Run relevant UI checks, lint/types and production/Pages builds. Generator, file formats, stored maps and Repair rules are unchanged; their existing domain evidence applies. Alpine only if its daemon is available.
- Reconcile the feature record, register and guide. Make semantic commits as checked changes are completed; do not push without an explicit request.

## Implementation and evidence

- The active V3 pages share `select-menus.js` and `select-menus.css`; production and Pages packaging include both assets. Original selects and their change handlers remain authoritative. Engine groups and dynamically inserted Advanced controls retain their options.
- Browser review confirmed Ribbon selection, gold experimental labels (`rgb(148, 111, 21)`) and a 6px menu gap. Menu left edge and width differ from the displayed Geometry field by less than 0.01px. [Screenshot](../../mockups/v3/select-menus-preview.jpg).
- Typing R in Geometry selected Ribbon without randomising the map; history stayed at one snapshot. Escape, Tab and outside dismissal worked. End reached the final grouped Map type choice and scrolled it into view.
- Advanced Physical → Dynamic Earth with Quiet plate activity, Tiny size and Wide geometry generated successfully. Reselecting Physical preserved Dynamic Earth. Standard retained its separate Ribbon draft. Reset restored Automatic; Randomise updated all eleven visible labels to match their native selects.
- During generation both original controls and visible buttons were disabled. The sidebar retained its measured bounds: 275.97 × 615.47px at (16, 16). Controls re-enabled on completion.
- Menus follow field bounds and clamp/scroll within the viewport. Compact/mobile checks were performed on the approved study, recorded in [the study evidence](../verification/v3-experimental-controls.json); these were not separately repeated for the integrated page.
- TypeScript, lint, V3 packaging, production build, Pages build and Pages asset verification passed. All 29 existing rendered-interface/map-fit checks passed. Docker's daemon was unavailable, so Alpine was not run.

## Gate reconciliation

The contract, setting integration, keyboard interaction, disabled states, rendering, documentation and final diff are checked above. Generator defaults, determinism, workers, cloning, editing, persisted history, selective regeneration, import/export, round trips and Repair rules are unchanged and need no new domain behavior for this UI change. Generation and Randomise exercised the existing setting path. No new confirmation or destructive action is introduced. Assistive descriptions are present; a dedicated screen-reader session was not performed.
