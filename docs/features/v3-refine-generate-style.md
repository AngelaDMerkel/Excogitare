# V3 Refine — Generate-style study

Status: **Verified** for the isolated desktop mockup, including clearer regional selection controls.

## Contract

Add a fourth isolated Refine mockup. Local refinement must use labelled fields and plain text actions instead of icon-based tool choices. Match Generate's label/control grid, font, field height, spacing and dropdown treatment. Retain separate Global changes, geographic region selection, custom boundaries, preview/compare/apply, grouped checks and Undo/Redo. Preserve the earlier three studies. Approved 04 is now integrated separately in [V3 Refine integration](v3-refine-integration.md).

Selection now explicitly offers Region, Area and Single tile. Region exposes its geographic type; Area exposes Rectangle or Custom boundary. Single tile selects exactly one clicked hex and does not show an irrelevant Strength control. Changing selection mode clears the previous target so a single-tile operation cannot act on an older multi-tile selection.

Clarify the regional choice with **Select by → Geographic region** and a separate **Region type** field. Add one short, contextual instruction explaining what to click on the map. Keep the established styling and selection behavior.

## Gates

This is a presentation study over the existing prototype behaviors. No new generator, map schema, repair or export behavior is needed. Check selection modes and action dropdown binding, keyboard selection, preview and fixed panel geometry; compare computed styles with Generate. Run scoped syntax/lint and whitespace checks, save screenshots and update the study register. Existing prototype limitations apply; no production build or new domain suite is required. Make semantic commits as checked changes are completed; do not push without an explicit request.

## Implementation and evidence

- Regional selection now reads **Select by → Geographic region** and **Region type → Terrain region**. A short instruction below the type field explains the map interaction and is connected to the field with `aria-describedby`. Browser verification confirmed that choosing Landmass changes it to “Click land to select the whole landmass,” and Single tile hides the regional instruction. Styling and selection logic are unchanged; syntax/lint and whitespace checks pass.
- `generate.html` adds 04 Generate style to the overview and review navigation. Local refinement uses Selection, a contextual Region or Shape field, Category, Change and Strength. Region offers five geographic types; Area offers Rectangle and Custom boundary; Single tile selects exactly one clicked hex and hides Strength. Clear selection, Import/Undo/Redo and Apply use visible text. Global/local drafts and the shared review footer are retained.
- The isolated `form-menus.js` adapter reuses the approved Generate dropdown implementation, with separate menu IDs and preserved visible field labels. The earlier three studies keep their existing controls.
- Browser computed styles match Generate exactly: 90px/146px columns, 8px column gap, 11px text, 13.75px line height and 30px controls. The selection popup aligns within 0.006px of the field edges and uses a 6px gap.
- Keyboard selection of Custom boundary enters the unfinished-outline state; Escape cancels it. Returning to Terrain region and previewing Add woodland produced ten changed tiles. Discard restored the editor. Selecting Starts updates Change to Review starting balance and hides Strength; returning to Vegetation restores its fields.
- The explicit selection modes clear the prior target. Browser verification selected tile (58,22) in Single tile mode and previewed exactly one changed tile. Rectangle mode selected 150 tiles by dragging. Choosing Custom boundary displayed its Shape field and required three points before finishing. The popup presents Region, Area and Single tile as distinct choices. [Selection menu screenshot](../../mockups/v3/refine-studies/selection-modes-preview.png).
- Hit testing uses the drawn hex polygons for study 04, shared by selection and hover details. Focused geometry checks cover every centre in a 4×4 grid, sloping hex edges and empty canvas. No production hit testing was changed.
- Syntax checks, scoped ESLint and whitespace checks pass. [Screenshot](../../mockups/v3/refine-studies/generate-preview.png). Existing study limitations and prior lifecycle verification remain applicable; no production files or engine behavior changed for this request.
