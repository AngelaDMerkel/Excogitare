# V3 adaptive sidebar

Status: **Implemented**. The scoped browser and packaging checks below are verified.

## Contract

The user requests that the left sidebar scale to the screen so all dropdowns fit. In Standard, show all eleven dropdowns, the Advanced disclosure, Generate and Randomise without scrolling. Advanced uses exactly the same measured frame, scale, typography and label/control columns, and scrolls its longer contents within that frame. Reduce unused spacing with viewport height, then proportionally fit the whole panel if necessary. Keep Save immediately below its visible bounds and history fading before the panel bottom. React to resizing and progress text without losing control values or keyboard focus.

The existing mobile Randomise/Save layout is retained. Advanced exposes dozens of grouped controls; keep its readable scrolling rather than shrinking every expanded group into illegible text. Refine shares the Generate reference frame and keeps its scrollable inspection results. No generator, history, editing, import/export or legality behavior changes.

## Acceptance

Inspect real browser layouts at tall desktop, 720px, 600px and short landscape heights, including a narrow desktop above the mobile breakpoint. Every Standard control and action must remain inside the panel/window with no panel scrolling. Check dropdown keyboard interaction and retained selections, Advanced/Standard transitions, Refine, progress, Save alignment, history fade, map framing and mobile. Verify V3 packaging and syntax/lint/whitespace checks. Domain regression and engine changes are inapplicable to this presentation-only change. Reconcile evidence before reporting completion; no commits or pushes.


## Initial behavior and evidence

`theme.css` reduces desktop row gaps, padding and control height as the viewport becomes shorter. `sidebar-fit.js` measures the natural Standard panel and the actual space above Save and Map details, then applies proportional scaling only when needed. ResizeObserver handles size/content changes; hidden-state observers handle editor transitions. The canvas fitter and history alignment receive an explicit layout event because CSS transforms do not resize layout boxes. Save matches the visible panel width. The old 540px minimum workspace height no longer pushes short windows outside the viewport.

Browser measurements passed at **1600×1000, 1280×720, 1024×600, 900×480 and 645×720**. Every Standard dropdown, Advanced disclosure, Generate and Randomise stayed inside the panel. The Standard section had no scroll overflow. Save remained inside the viewport with a **12px** panel gap, and the history lower boundary remained **32px** above the panel bottom. [Measurements](../verification/v3-adaptive-sidebar-layouts.json) · [600px-height capture](../../mockups/v3/adaptive-sidebar-preview.jpg).

Changing Climate to Warm, opening and closing Advanced by keyboard, and returning to Standard preserved Warm. The test restored Temperate afterward. Advanced retained its scrollable editor; Refine reset scaling and retained the 12px Save gap. At 390×844 mobile exposed only Randomise and Save, with no horizontal overflow. No browser errors or warnings were observed. The normal viewport was restored, and history was not modified.

## Completion gates

- Contract and interface: implemented for the Standard controls in the reported viewport matrix. Very short desktop windows require smaller text as the panel scales; mobile continues to use its approved separate layout.
- Data model, defaults, Randomise, workers and domain behavior: unchanged. Layout observes content resizing, including progress text; this revision did not rerun generation or change any stored map.
- Rendering: actual dropdown/action bounds, Save width/spacing, carousel spacing and canvas framing were inspected. Existing long Advanced/Refine content remains scrollable.
- Editing, history, import/export and Repair: behavior unchanged; no map migration, destructive operation or new domain claim.
- Verification: JavaScript syntax, repository ESLint and whitespace checks pass. V3 bundling and Pages build/type check pass; the Pages asset verifier confirms the new sidebar script is packaged. No engine/server change requires a new domain regression or Alpine run.
- Documentation and reconciliation: README, world-discovery record, feature register, new script, selected aliases and packaged files compared with the request and observed results. Unrelated work preserved. No commits or pushes.


## Consistent Standard and Advanced sizing

The initial version reset scaling when Advanced opened. The user identified that jump, along with stacked labels and inconsistent text/control sizes. Both Generate editors now use the measured Standard reference frame and shared row styles, including during resize. See [the correction and current verification](v3-consistent-generate-controls.md). The earlier measurements above document the initial revision; the new record is authoritative for mode-switch behavior.

Generation progress now occupies the secondary-action slot, so it cannot change the measured frame. Active, completed, cancelled and failed Generate/Randomise states have identical recorded bounds; see the consistent-controls record.


## Shared workspace frame

Generate is now the sizing reference for Standard, Advanced and Refine. They load the same `sidebar.css`, and Refine resizing and populated checks preserve that frame. See [current implementation and measurements](v3-shared-workspace-sidebar.md).
