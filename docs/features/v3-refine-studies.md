# V3 Refine workflow studies

Status: **Verified** for the interactive desktop studies, including separate Global changes and Local refinement. Production integration awaits design selection.

## Contract

Build three interactive mockups of the suggested Refine improvements while preserving the approved Generate/Refine shell, sidebar dimensions, Save placement, map layers and hover details:

1. **Compact form:** explicit scope plus Category, Change and Strength fields.
2. **Category toolbox:** expandable tool families with their actions beside the settings.
3. **Quick actions:** a short list of common adjustments with contextual controls.

Each includes compact Import and Undo/Redo, separate global/local sections, a fixed preview footer that becomes Original/Proposed and Discard/Apply, grouped repair findings and Review starting balance. Use a prepared map and region for comparison. Keep changes session-only and leave the production interface untouched.

The user requests Global changes alongside local functionality. Replace the scope dropdown with two clear accordion sections: Global changes offers relative climate, relief, vegetation and resource adjustments across the map; Local refinement retains the region/outline selection and the existing local tool design. Preserve independent drafts and restore the selected region when returning to Local. Both use the shared footer and repair controls. Global algorithms remain representative mockup transformations rather than a completed climate or balancing engine.

The user subsequently chose both geographic regions and custom boundaries instead of a brush. Replace brush selection with click-to-select landmass/terrain/woodland/highland/water-body regions, plus a polygon outline tool. Show a clear perimeter, support adding/removing geographic regions, and disable preview while a custom boundary is unfinished. Geographic regions use current connected tile data, not unverified narrative ownership or watershed metadata.

## Gates and limits

- These are interface studies with representative deterministic edits, not a new general editing engine. Existing placement rules and preview/apply history support the demonstrations. Resource redistribution preserves deposits within the chosen scope and checks placement; it does not establish game balance. Starting-balance review uses the existing view.
- Selection scope must be explicit; Local refinement with no selection cannot silently edit another area. Preview does not mutate the accepted map. Apply adds a snapshot; Undo/Redo restores accepted study states.
- Import, the established parser/export path and map checks remain available. New engine algorithms, worker protocols, durable history schemas, full painting tools and new game compatibility guarantees are outside this request.
- Verify each layout visually and exercise scope, action settings, preview/compare/discard/apply, undo/redo, grouped repair selection and balance review. Check stable panel/Save bounds and clear keyboard names. Run syntax/lint/whitespace checks. Production/Pages/Alpine builds are unnecessary for isolated study assets.
- Record previews and an overview page; reconcile the register before completion. Preserve unrelated pending work. Make semantic commits as checked changes are completed; do not push without an explicit request.

## Verification and reconciliation

- The scope dropdown is replaced by Global changes and Local refinement accordions in all three layouts. Global changes has independent climate, relief, vegetation, resource and strength controls; Local retains its region selection and tool values. A global preview combining Flatter relief and Denser vegetation changed 760 tiles, exceeding the saved 32-tile local region. Discarding and returning to Local restored that same selection and local controls, while the two global choices remained retained.
- Panel and Save bounds stayed identical during that global preview, matching the recorded rectangles below. The shared footer explicitly distinguishes Preview global changes, Preview local changes and Preview corrections. Unchanged global controls disable preview. Scope activation is synchronous with opening its section. [Global controls screenshot](../../mockups/v3/refine-studies/global-changes-preview.png).
- All three layouts were rendered in the browser and captured with the same sample map. The final version starts with a 32-tile connected terrain region; Region and Outline replace the initial rectangle/brush tools. The geographic selector offers five types and supports adding/removing regions with modifiers.
- Geographic selection picked a 2,369-tile landmass in the browser. Three custom boundary points produced a 111-tile selection, and a woodland preview changed five eligible tiles inside it. Incomplete outlines disable editing. Pure geometry checks cover connected selection, the wrap seam and polygon containment.
- Preview, Original/Proposed, Apply, Undo and Redo were exercised. Applying added a history entry; Undo/Redo changed the selected accepted snapshot. Empty Selected area disabled Preview; Whole map explicitly selected 4,160 tiles. The fixed panel and Save rectangles matched exactly before/during preview: panel (16,60), 256.2326 × 571.454px; Save (16,643.4531), 256.2266 × 40px.
- Check map grouped three findings into Terrain, Features and Resources. Preview corrections reported two changed tiles and two removals; Apply cleared the findings. Quick actions opened the existing balance legend with current per-player scores.
- No runtime errors appeared in the checked browser session. Syntax checks, scoped ESLint and whitespace checks pass. Production/Pages/Alpine builds and full domain regression tests are inapplicable to these unshipped study files. Import/export handlers are retained but were not separately retested here.
- Screenshots: [Compact form](../../mockups/v3/refine-studies/form-preview.png), [Category toolbox](../../mockups/v3/refine-studies/toolbox-preview.png), [Quick actions](../../mockups/v3/refine-studies/actions-preview.png), [Custom-boundary preview](../../mockups/v3/refine-studies/custom-boundary-preview.png). The overview links to all three interactive pages.
- The final register and study documentation match the requested mockup scope and subsequent region-selection preference. No production files, generator behavior or persistent history were changed by these studies. Unrelated pending work is preserved. These studies are included in the semantic commits authorized by the user.
