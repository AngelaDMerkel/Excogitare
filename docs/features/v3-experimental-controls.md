# Experimental-control alignment studies

Status: **Verified** for the mockup scope. **02 Gold text is approved** for integration.

## Contract

Create three interactive alternatives for the experimental Size and Geometry controls. Keep the existing form grid, sidebar dimensions, map canvas and approved palette. Anchor each explanation or option surface to the actual control rectangle, including when the sidebar is scaled. Preserve the selected values and the established warning meaning. The selected design is now integrated; see [V3 aligned dropdown menus](v3-select-menus.md).

The user clarified that the problem concerns the dropdown choice lists. The three proposals are Grouped, Gold text and Expandable. At the user's request, 02 was simplified from per-option badges to gold text alone, with no additional guidance footer. Experimental status and risk descriptions remain available to assistive technology.

## Gates

- Use separate review pages with session-only samples and shared study assets; do not change the main interface or stored maps.
- Verify control alignment, popup association, conditional experimental guidance, selection/dismissal, keyboard interaction and Standard/Advanced behavior.
- Check desktop and compact layouts, sidebar stability, popup bounds and the existing mobile boundary. Save screenshots of all three designs.
- This is a presentation study. Generator/model/worker behavior, persistence formats, import/export, Repair and game compatibility are unchanged and inapplicable. Syntax, scoped lint, whitespace and browser review apply; production/domain/Alpine builds are inapplicable.
- Reconcile the feature record and register, then make a semantic commit. Do not push.

## Delivered mockups and checks

- `/experimental-options/` compares the three live control views. `grouped.html`, `tagged.html` and `folded.html` provide full application mockups. They use session-only samples and are excluded from the production build.
- All three share the same setting values, control grid and paper/navy styling. Choice lists are anchored to the displayed control bounds rather than positioned around the selected option. At 1280×720, left-edge and width differences were below 0.01px and the vertical gap was 6px. Sidebar bounds were identical between the three proposals.
- Size and Geometry selection updates the original selects. Escape restores focus and closes the menu. The expandable treatment supports keyboard expansion, type-ahead and selection; four ordinary choices remain visible when its experimental section is collapsed.
- Advanced choices keep their separate draft, and Reset advanced restores Automatic in both source controls and visible buttons. Gold text has no badges or footer; its experimental labels use `#946f15` and expose experimental status through accessible text.
- The menus remain within the viewport at 900×600 and 760×420. Keyboard End scrolls to the last choice; mobile hides the picker with the desktop controls. Browser checks produced no runtime errors or new map snapshots. JavaScript syntax, scoped lint and whitespace checks pass.
- [Measurements](../verification/v3-experimental-controls.json) and screenshots preserve the review: [Grouped](../../mockups/v3/experimental-options/grouped-preview.jpg), [Gold text](../../mockups/v3/experimental-options/tagged-preview.jpg), [Expandable](../../mockups/v3/experimental-options/folded-preview.jpg).

The user approved 02. Its production integration is verified in [V3 aligned dropdown menus](v3-select-menus.md); these alternatives remain design references.
