# V3 consistent Generate controls

Status: **Implemented**. Approved warnings, editor consistency and generation-progress stability are verified below.

## Contract

The user approves warning study **02 Inside controls** and requests that switching Standard/Advanced stop changing sidebar size, text size and the arrangement/size of dropdowns.

- Integrate the approved conditional amber icon inside Size/Geometry controls, ahead of the native dropdown arrow, in both editors. Keep the balanced floating explanation, hover/focus/click interaction and Escape/outside dismissal. Preserve current selections; do not copy demonstration defaults or open warnings on load.
- Use one Standard-derived frame for both Generate editors at every desktop viewport size. Sidebar width, height, scale, action placement and font/control sizing remain stable on editor switches and Advanced group changes. Standard's eleven fields still fit; Advanced scrolls inside the same frame.
- Advanced labels stay beside their controls using the same label/value columns, fonts, control heights and spacing. Existing groups, automatic options and independent drafts remain functional. Long labels may wrap within the label column.
- Recompute the reference frame correctly when resizing while Advanced is open. Keep the hidden reference inaccessible and noninteractive. Refine and the mobile two-action boundary retain their behavior.
- Preserve Save's 12px gap and history's 32px fade offset. Native select interaction, keyboard focus, warning visibility, reset, Randomise reflection and read-time numeric values must remain correct.

## Applicable completion gates

This is interface, layout and packaging work; generator domain/model/worker, map history data, import/export formats and Repair rules do not change. Verify actual browser bounds and computed styles before/after editor switches at large, normal, short and narrow desktop sizes; check Advanced scrolling and resize, Refine, mobile, warning interaction and preserved input drafts. Check syntax/lint/types and V3/production/Pages packaging as appropriate. No new engine regression or Alpine runtime claim is needed for presentation-only files. Reconcile records and current code; preserve unrelated changes; no commits or pushes.


## Delivered implementation

`dimension-warnings.js` and `.css` implement only the approved inside-control treatment. They use the shared size/geometry catalogue, preserve native selects and associate labels explicitly with their controls. The tooltip is outside the scaled/clipped sidebar, uses a matching border on all four sides and closes on Escape, outside interaction or a workspace change. It follows a visible trigger during Advanced scrolling. Ordinary choices and Automatic hide the icon and clear the field emphasis. There are no demonstration defaults or initially opened warnings.

`generation-controls.js` now emits a controls-change event after editor/reset/Randomise updates. The warning component refreshes from actual control values without replacing generation functions. Inactive Standard controls are inert and aria-hidden. While Advanced is active, they remain visually hidden and absolutely positioned solely to measure the reference layout; they do not occupy the scroll flow or accept focus/pointer input.

`sidebar-fit.js` derives one frame from the Standard rows, branding, navigation, disclosure and action area. Both Generate editors use that height and scale. The reference stays measurable when the window is resized in Advanced. Advanced group contents scroll inside the frame; changing groups no longer changes the sidebar width or height. `theme.css` supplies a shared 90px label column, 8px column gap, 11px type, control height, row gap and padding for Standard, Advanced and the wrapped warning fields. Long labels wrap in their column. Refine retains its independent panel layout.

## Verification evidence

- [Five desktop comparisons](../verification/v3-consistent-controls-layouts.json): 1600×1000, 1280×720, 1024×600, 900×480 and 645×720. Within each viewport, switching Standard/Advanced produced identical panel width/height, scale, control left edge/width/height, font size and Save bounds. Standard had no scroll overflow; Advanced scrolled when its groups exceeded the shared frame.
- A separate resize while Advanced was open also retained exactly the same frame when returning to Standard. Browser inspection confirmed that inactive Standard fields are inert, aria-hidden and visually hidden.
- Experimental Size/Geometry icons appear inside both editors, and the approved explanation opens by keyboard. Escape dismisses it; Reset advanced returns both selectors to Automatic and removes their warnings. Opening Shape uses side-by-side labels and controls, including numeric inputs and wrapped labels.
- A real worker-backed Randomise check ran in an isolated session-only copy of the application. It changed the Standard draft from Colossal/Ribbon to Small/Square, removed its warning icons, collapsed Advanced and preserved the separate Physical/Colossal/Ribbon Advanced draft. The resulting map was Orin Reach, seed `98f1a382-3b8c-4004-8097-424495b8bbe4`. This check did not write to the user's persistent history.
- Refine retained a 12px Save gap and dismissed the warning. At 390×844 the desktop panel and warning are hidden, leaving Randomise and Save. Temporary viewport overrides were reset. The main preview retained Orin Highlands and all 100 history entries; its original eleven Standard selections were restored, and its previously empty Advanced draft was restored.
- JavaScript syntax, repository ESLint, TypeScript, V3 bundling, production build, **23/23** rendered-interface tests, Pages build and the Pages asset verifier pass. No browser warnings/errors. No generator/engine code changed, so no new domain or Alpine runtime claim is made.
- Captures: [Standard](../../mockups/v3/consistent-standard-preview.jpg) and [Advanced](../../mockups/v3/consistent-advanced-preview.jpg).

## Final reconciliation

The approved warning selection, sidebar correction, current code, production assets, browser evidence, README and register agree. Defaults and generation semantics are retained. No map migration, export-format change, new Repair behavior or new game-compatibility claim is introduced. Prior design studies remain available as historical references. No commits or pushes; unrelated working-tree changes remain preserved.


## Generation-progress stability — requested correction

The user reports that Generate and Randomise still resize the whole sidebar. The new reference frame correctly matches the two editors, but it includes the action footer's natural height; revealing the existing progress line increases that height. Keep the footer height fixed: display live progress in the reserved Randomise-all slot while the job runs, with the primary button available for cancellation. Restore Randomise all after completion, failure or cancellation. Preserve the accessible live status. Verify identical panel/control/action bounds before, during and after Generate and Randomise in an isolated session.


### Progress correction verified

The live status is positioned in the existing 31px secondary-action slot. While it is visible, Randomise all becomes visually hidden but retains its layout space. Cancel generation remains the primary action. The status keeps its live-region semantics and does not contribute to the footer's measured height.

An isolated browser session exercised idle → Randomise active → success; Generate idle → active → cancelled; Generate active → success; and an infeasible Generate request → failure. **Every recorded state had identical panel, footer and Save bounds and the same scale.** At 1280×720, the panel remained 275.9706×615.474px with scale 0.9927 throughout. The failure preserved its accepted map and session-history count. [Recorded measurements](../verification/v3-stable-progress-layouts.json) · [Active-generation capture](../../mockups/v3/stable-progress-preview.jpg).

Final production and Pages builds and the Pages asset verifier pass after this CSS correction. Whitespace checks pass. Browser errors/warnings were absent. The main preview was reloaded with the new styling, its eleven draft values were restored, and it loaded the user's latest selected Aster Marches map with 100 history entries. All generated verification maps remained in the isolated session, which was then closed. Temporary viewport overrides were reset. No commits or pushes.
