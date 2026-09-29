# V3 dimension-warning preview

Status: **Implemented**. The user approved study 02 Inside controls; it is integrated in Standard and Advanced. The design history below records the earlier review stages. See [consistent Generate controls](v3-consistent-generate-controls.md) for integration evidence.

## Contract

Create a separate preview derived from the selected V3 interface. When Geometry is Needle, Ribbon, Pin or String, show a small amber warning icon beside the field label. Hover, keyboard focus and click expose the proposed explanation. Extreme and Colossal have the same treatment beside Size, with memory/loading copy. Generate remains available. The popover is informational, dismisses with Escape or an outside click, and uses the approved paper/navy/gold visual language.

Start the mockup with Colossal/Ribbon selected to make both examples reviewable. Show the Geometry explanation initially. Preserve the compact sidebar and keep the popover outside its clipping/scaling container. Support the same fields in Advanced. Use session-only example history. Do not add the warnings to the main page, generation worker or production packaging before approval.

## Applicable gates

This is a presentation/interaction mockup. Verify conditional visibility, hover/focus/click behavior, dismissal, keyboard names, Advanced transitions and short/narrow/mobile layouts in the actual browser. Generator model, determinism, domain behavior, worker, persistence, import/export and Repair changes are inapplicable. Syntax/lint/whitespace and visual review are appropriate; domain regression, production builds and Alpine are inapplicable. Save a screenshot and reconcile the register with the demonstrated state. No commits or pushes.


## Mockup verification

The isolated preview is available at `/warnings/`. It loads shared V3 assets and preview-only warning CSS/JavaScript. Main entry points and `build-v3.mjs` do not reference the warning files; the live interface has not adopted the proposal.

Actual browser checks confirmed:

- Colossal/Ribbon initially show both amber icons and the Geometry explanation. Normal Huge/Standard choices hide the corresponding icons and dismiss the popover.
- Keyboard focus reveals the Size explanation. Enter/click pins or toggles the explanation; Escape and outside click dismiss it. The same controls work in Advanced, and Generate remains enabled. Pointer-enter/leave handlers support the hover interaction while keeping a keyboard-focused explanation open.
- At 1024×600, 645×720 and 900×480, the popover remains inside the viewport and clear of the sidebar; all Standard dropdowns remain visible. At 390×844 it is hidden with the desktop controls. The temporary viewport override was reset.
- No browser runtime warnings or errors. JavaScript syntax, scoped ESLint and whitespace checks pass. [Reviewed screenshot](../../mockups/v3/warnings/preview.jpg).

The mockup outcome is implemented and visually verified within this scope. At that review stage, integration awaited approval; the approved implementation is now recorded below. No map generation, imports or downloads were triggered during review; the mockup uses its own session-only sample history. No commits or pushes. The contract, register, files and browser result have been reconciled.


## Three alignment studies — requested revision

Before implementation: the user finds the label-following icons and asymmetric callout distracting. Create three distinct, separately navigable interactive mockups: (1) warning buttons at a fixed right edge within the label column, (2) warning buttons inside the right end of the dropdown, before its native chevron, and (3) one shared notice beneath the Size/Geometry pair that opens a combined explanation. Preserve every dropdown's label/value alignment; remove the callout's one-sided amber stripe. Keep the same example settings, map, palette and conditional risk logic for comparison. Add a small review navigation bar outside the mock interface. Main-interface integration still awaits approval.

Verify conditional visibility, equal icon coordinates in the first two studies, notice layout in the third, keyboard/click dismissal and Standard/Advanced behavior. Check compact desktop and mobile boundaries, retain session-only samples, and save the three visual results. No changes to live generation or packaging.

The shared-notice study uses a floating combined explanation. Initial visual review of inline expansion made the sidebar shrink too much; keeping the explanation outside the form preserves control sizes. The final three studies all use balanced borders and the same compact explanation treatment.


## Three-study verification

The requested three mockups are implemented for review at `/warnings/rail.html`, `/warnings/control.html` and `/warnings/notice.html`. `/warnings/` opens the first, and each has the same comparison bar. The earlier proposal is retained at `/warnings/original.html`.

- In the two icon treatments, browser measurements showed **0px horizontal difference** between Size and Geometry warning buttons, and **0px difference** between the left edges of all Standard dropdowns. All four sides of the floating explanations have a **1px** border. The asymmetric amber stripe is removed in these studies.
- The shared notice combines currently selected risks. Selecting Huge/Standard hides it; the control treatment likewise hides both warning buttons and clears the emphasis. The combined notice and control treatment both open the appropriate explanation in Advanced. Generate stays enabled.
- Escape dismissal, keyboard activation, navigation between studies and compact-window bounds were checked in the actual browser. At 900×600 the first study's popover and Save stay within the viewport; the shared study was also inspected at compact height. All Standard dropdowns remain in the fitted sidebar. At 390×844, the review bar, sidebar and warning popover are hidden with the desktop interface. The temporary viewport override was reset.
- Explanations now follow a visible Advanced trigger during keyboard scrolling and close once the trigger leaves the scroll viewport, preventing focus-induced scrolling from immediately dismissing them.
- JavaScript syntax, scoped ESLint and whitespace checks pass. No browser errors or warnings. No generation, imports, downloads or persistent-history changes were triggered during review. Main application entry points and production packaging remain separate from the warning studies.
- Screenshots: [01 Aligned icons](../../mockups/v3/warnings/rail-preview.jpg), [02 Inside controls](../../mockups/v3/warnings/control-preview.jpg), [03 Shared notice](../../mockups/v3/warnings/notice-preview.jpg).

The register, review pages, interaction source, measurements and screenshots were reconciled. This review stage was superseded by the approval and integration below. No commits or pushes.


## Approved integration

Study **02 Inside controls** is now part of the main V3 interface and packaged application. Conditional warnings, independent drafts, shared Standard/Advanced dimensions and typography, reset/Randomise reflection, keyboard behavior and responsive layouts are verified in [V3 consistent Generate controls](v3-consistent-generate-controls.md). The alternatives remain review references.
