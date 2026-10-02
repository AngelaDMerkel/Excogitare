# V3 history bookmark studies

## Contract

Produce three interactive mockups for a subtle save/bookmark control on each history thumbnail, using the approved paper, navy and gold interface. Keep the carousel's small borderless previews, newest-first order and lower fade. Clicking the action must not restore the map; clicking the thumbnail still restores it.

- **01 Corner bookmark:** a small corner control revealed on hover/focus, with a persistent gold mark when selected.
- **02 Edge pin:** an always-available pin beside each preview, leaving the map image clear.
- **03 Snapshot actions:** direct download and bookmark icons on hover or keyboard focus. Download occupies the former ellipsis position at the lower right; bookmark occupies the upper right and stays gold when selected.

## Completion gates

- Isolated pages under `mockups/v3/history-bookmarks/` reuse current production assets. Bookmarks and prepared history are session-only and do not access the user's persistent history.
- Bookmarking toggles a local study flag. It is not a claim of durable retention; production capacity/eviction changes require subsequent approval.
- Check bookmark toggles, retained marks after restoring snapshots, independence from the active map, keyboard focus and independent download/bookmark actions. Check the existing carousel fade, panel alignment and clear map framing.
- Generation, workers, map schema, cloning, placement rules, Repair and export format remain unchanged. The snapshot download uses the existing map writer and supported validation.
- Save screenshots and provide a linked comparison page. Run scoped syntax/lint and whitespace checks. No new domain tests or production build is required for isolated presentation studies.
- Reconcile this record and the register, then commit the checked mockups. Do not push.

## Evidence

- Added three linked live pages and a comparison page with actual browser captures. Each study reuses the active Generate/Refine interface, layers and existing carousel styling.
- Verified bookmark/pin toggles through keyboard activation, retained marks after restoring another snapshot, unchanged active map during bookmarking, and reset on reload. Separate sibling buttons avoid nested interactive controls.
- The initial menu version passed bookmarking, arrow navigation and Escape checks. It is superseded by the direct-action revision below. The download action still invokes the existing writer; the earlier browser download-event wait timed out, so file delivery is not claimed as verified.
- Visually reviewed all three variants and their 14px glyphs/24px targets. At the observed 823px viewport, the history fade ends 32px above the sidebar bottom; the thumbnail remains 88×52px. The current revision retains this carousel layout.
- Scoped JavaScript syntax, ESLint and whitespace checks pass. No production assets, map rules or persistent history were changed. Domain tests, production builds and Alpine are inapplicable to this isolated mockup change.
- The register and study README describe session-only bookmarking and defer production persistence/retention behavior. Captures: [corner](../../mockups/v3/history-bookmarks/corner-preview.png), [pin](../../mockups/v3/history-bookmarks/pin-preview.png), [actions](../../mockups/v3/history-bookmarks/actions-preview.png).

## Direct-action revision

Verified: 03 now has direct download and bookmark buttons with 14px icons and 24px targets. Download replaces the ellipsis at the lower right; bookmark sits at the upper right. Both reveal on thumbnail hover or keyboard focus. Only an active gold bookmark remains visible at rest.

Browser checks confirmed idle visibility (both hidden on an unmarked row; only the gold bookmark visible on a marked row), both icons visible on hover/focus, pointer and keyboard bookmarking without changing the active map, retained flags after restoring another snapshot, separate Tab targets and no remaining menu. Syntax, scoped ESLint and whitespace checks pass. The comparison text and screenshots are refreshed. The download handler is unchanged; its previously recorded delivery limitation remains.

## Subtle-control revision

Verified: 03 uses 11px muted icons with transparent button backgrounds and unchanged 24px click targets. A 16px translucent highlight appears only on the action under the pointer or keyboard focus; the active bookmark remains gold. Browser computed styles confirm 11px glyphs, 24×24px targets, transparent backgrounds, both icons revealed on focus and a highlight only on the focused action. The 88×52px thumbnail layout and handlers are unchanged. Visual review and whitespace checks pass; screenshots are refreshed. This scoped CSS change does not require new domain tests or production builds.

## Contrast adjustment

Verified: 03 now uses 13px navy icons with a slightly stronger 1.8 stroke and an 18px translucent backing on row hover/focus. The individual action becomes more opaque when hovered or keyboard-focused. Browser styles confirm the icon sizes, 24px targets and separate 52%/81% backing opacities. Visual review and whitespace checks pass; previews are refreshed. This CSS-only adjustment retains the existing handlers and gold bookmark state.
