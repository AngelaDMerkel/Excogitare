# V3 shared workspace sidebar

Status: **Implemented**. The scoped browser and packaging checks below pass.

## Contract

The user requires Generate and Refine to keep the same sidebar size, with Generate as the standard, and requests shared CSS. Use one shared stylesheet and the measured Standard Generate layout for both workspaces, including Advanced. Switching modes must retain panel width/height/scale, branding/navigation bounds, Save placement and the history fade. Refine's shorter content leaves space inside the same frame; longer content scrolls. Resizing while Refine is active must recalculate from Generate's reference, without caching a stale earlier viewport size.

Keep hidden Generate controls and its action footer measurable but inaccessible, inert and noninteractive while Refine is active. Refine does not expose Generate/Randomise actions. Preserve its imports, selections, preview/apply controls and tile checks. The mobile two-action boundary remains. The selected app, aliases and existing warning-study page all use the shared rules.

## Completion gates

Model, engine, map data, history storage, binary export and Repair rules are unchanged. Verify actual browser rectangles before/after mode switches at multiple desktop sizes, Advanced→Refine, resize while Refine is active, and populated Refine checks. Confirm hidden controls do not appear in accessibility/focus traversal, generation progress stays size-neutral and mobile remains correct. Run scoped syntax/lint, production/Pages packaging and relevant rendered checks. No engine regression or Alpine runtime is needed for these presentation-only files. Reconcile records and make a semantic commit; no main push is authorized.

## Related finding during verification

The existing findings renderer used `checkbox.checkbox.value`, causing an exception before it could display the three fixture findings. Restore initialization of the checked state and value, then exercise selection and the correction preview in the isolated session. This is necessary to verify Refine with populated content; applying corrections remains an explicit action.


## Delivered implementation and evidence

- `sidebar.css` is the shared structural stylesheet. It owns the panel width, responsive density, control grid, measured frame/scale, action-footer layout and progress slot. `theme.css` retains the Wayfinder palette and branding. Main V3, its aliases and the warning-study pages load the same shared stylesheet; the build packages it with the application.
- The desktop frame always comes from Standard Generate. In Refine, the inactive Generate section and generation footer remain measurable while hidden, inert and aria-hidden. Their measurement content does not enlarge Refine's scroll area. Refine uses the full available content area and keeps its own functional controls.
- [Five measured comparisons](../verification/v3-shared-workspace-layouts.json) at 1600×1000, 1280×720, 1024×600, 900×480 and 645×720 matched exactly for panel bounds, branding, navigation, Save, history, title position, scale and reference height. The Save gap remains 12px, subject to subpixel rounding.
- Advanced→Refine also retains the same frame. Resizing while Refine is active and returning to Generate produces identical bounds. In Refine, the Generate action and Size control are absent from accessible-role queries; the inactive Generate section and footer are inert.
- The repaired fixture displays three selectable findings. Deselecting them disables Preview corrections; selecting them produces the expected two-tile/two-item preview. Discard preserves the accepted example. At 900×480, the populated Refine area scrolls (608px of content inside 452px) while the panel remains 191.5142×375.4505px. The checkbox rendering correction was committed separately as `d555f2b`.
- At 390×844, the sidebar is hidden and mobile retains Randomise and Save. Temporary viewport overrides were reset. The user's open warning-study page was refreshed: Generate and Refine both measured 253.2580×685.9830px, and keyboard workspace switching closes its warning popover. No new browser errors appeared after the checkbox correction; the refreshed warning-study page has no errors/warnings.
- JavaScript syntax, repository/scoped ESLint, production build, **24/24** rendered checks, Pages build/type check and asset verification pass. No engine or map-format change requires a new domain regression or Alpine run.
- Captures: [Generate](../../mockups/v3/shared-generate-preview.jpg) and [Refine](../../mockups/v3/shared-refine-preview.jpg).

The register, shared CSS, frame measurement, accessibility state, review page and packaged assets have been reconciled. Verification used session-only examples; persistent map history was not edited. Changes are committed semantically on main without pushing.
