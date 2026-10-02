# V3 history bookmark studies

## Contract

Produce three interactive mockups for a subtle save/bookmark control on each history thumbnail, using the approved paper, navy and gold interface. Keep the carousel's small borderless previews, newest-first order and lower fade. Clicking the action must not restore the map; clicking the thumbnail still restores it.

- **01 Corner bookmark:** a small corner control revealed on hover/focus, with a persistent gold mark when selected.
- **02 Edge pin:** an always-available pin beside each preview, leaving the map image clear.
- **03 Snapshot actions:** an unobtrusive menu with labelled Bookmark and Save .Civ5Map actions.

## Completion gates

- Isolated pages under `mockups/v3/history-bookmarks/` reuse current production assets. Bookmarks and prepared history are session-only and do not access the user's persistent history.
- Bookmarking toggles a local study flag. It is not a claim of durable retention; production capacity/eviction changes require subsequent approval.
- Check bookmark toggles, retained marks after restoring snapshots, independence from the active map, keyboard focus and menu dismissal. Check the existing carousel fade, panel alignment and clear map framing.
- Generation, workers, map schema, cloning, placement rules, Repair and export format remain unchanged. The action-menu download uses the existing map writer and supported validation.
- Save screenshots and provide a linked comparison page. Run scoped syntax/lint and whitespace checks. No new domain tests or production build is required for isolated presentation studies.
- Reconcile this record and the register, then commit the checked mockups. Do not push.

## Evidence

- Added three linked live pages and a comparison page with actual browser captures. Each study reuses the active Generate/Refine interface, layers and existing carousel styling.
- Verified bookmark/pin toggles through keyboard activation, retained marks after restoring another snapshot, unchanged active map during bookmarking, and reset on reload. Separate sibling buttons avoid nested interactive controls.
- Verified action-menu bookmarking, arrow navigation, Escape dismissal and trigger state. The menu overlays the canvas. The Save action invokes the existing writer without restoring the selected snapshot; no console error occurred, but the browser download-event wait timed out, so file delivery is not claimed as verified.
- Visually reviewed all three variants and their 14px glyphs/24px targets. At the observed 823px viewport, the history fade ends 32px above the sidebar bottom; the thumbnail remains 88×52px. Resizing also dismisses the action menu.
- Scoped JavaScript syntax, ESLint and whitespace checks pass. No production assets, map rules or persistent history were changed. Domain tests, production builds and Alpine are inapplicable to this isolated mockup change.
- The register and study README describe session-only bookmarking and defer production persistence/retention behavior. Captures: [corner](../../mockups/v3/history-bookmarks/corner-preview.png), [pin](../../mockups/v3/history-bookmarks/pin-preview.png), [actions](../../mockups/v3/history-bookmarks/actions-preview.png).
