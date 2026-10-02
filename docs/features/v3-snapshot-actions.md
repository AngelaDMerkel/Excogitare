# V3 snapshot bookmarks and downloads

## Contract

Integrate approved history study 03 into the main Generate/Refine application and its active aliases. Each thumbnail reveals a 13px navy bookmark at the upper right and download at the lower right, with small translucent backings and 24px targets. The active bookmark remains gold at rest. Keep the current thumbnail size, carousel fade, ordering, map framing and mobile two-action boundary.

## Completion gates

- **State and storage:** use the existing `kept` flag and transactional IndexedDB adapter. Existing kept records become bookmarks. Update the flag only after storage succeeds. Reload retains bookmarks and the selected snapshot.
- **Retention:** preserve bookmarks inside the 100-record cap; evict the oldest unbookmarked snapshot. If all 100 are bookmarked, reject the addition atomically and ask the user to remove a bookmark. Apply the same rule to the session fallback. Rejecting an addition preserves accepted map, active selection and Refine preview/undo state.
- **Interaction:** bookmark/download target their own snapshot without restoring it, resetting the camera, scrolling the history or discarding a draft. Use separate sibling controls, accessible labels, pressed state, hover/focus reveal and keyboard access. Storage/generation busy guards prevent conflicting actions. Failed bookmark writes retain the prior UI state and show a message.
- **Download:** use the same validated writer and filename rules as the desktop/mobile export. Imported snapshots retain their original bytes. Export the selected snapshot's accepted map, even when another map or an unaccepted preview is on screen. Invalid maps report the writer error without replacing the current map.
- **Editing/history:** generated maps and accepted edits start unbookmarked; restored snapshots retain their bookmark. Refine undo recovery uses normal retention and does not discard protected records. Historical mockups keep their own presentation adapters.
- **Unaffected domain:** generation algorithms, randomness, workers, map data, placement rules, Repair and serialization format are unchanged.
- **Verification:** real isolated IndexedDB checks for persistence, protected eviction, full capacity, missing-record failure and concurrent additions; browser action independence, reload, focus and framing checks; relevant regressions, lint/types, V3/production/Pages builds and Alpine if available. No implementation-mirroring tests for visual CSS.
- **Documentation:** update user guide, active-preview notes and feature register with actual evidence and limitations; commit coherent checked work without pushing.

## Evidence

- Shared production actions are enabled in the main page, `alternatives/peers.html` and `history-layouts/right.html`. Historical studies retain their isolated renderers. The new stylesheet is included in V3 and content-hashed Pages assets.
- Seven real IndexedDB checks pass: protected eviction at 100 records, reopen/bookmark/active-selection persistence, imported-byte preservation, selection, atomic full-capacity rejection, missing-record failure, unbookmarking and concurrent inserts. The session fallback also preserves the accepted map and pending preview when full, then evicts only the released unbookmarked record.
- Browser checks confirm a bookmark on an inactive snapshot changes neither the active map, camera nor sidebar bounds. The bookmark survives reload; an injected storage-write failure preserves the previous flag and shows an error. Bookmarking works while a Refine preview is open.
- A history download of the imported **The Winter Marches** snapshot while **The Verdant Divide** had a 149-tile pending preview produced a 34,302-byte `.Civ5Map` in Downloads. Its SHA-256 matches the selected snapshot's validated writer output: `54f4781179cce3923d26f51f6a702a8a971657722f68487f815016a0b28d5ba5`. The current map and preview remained unchanged. The browser download-event hook timed out, so delivery was verified through the actual saved file instead.
- With 100 bookmarks, Apply reports the limit and preserves the pending edit. Removing one bookmark permits Apply; Undo recovers the evicted original and Redo recovers the edit, each retaining 99 protected maps within the 100-record cap.
- The live main page retains 88×52px thumbnails, 13px icons and a fade ending 32px before the sidebar bottom. Both actions reveal on keyboard focus. No console errors were observed. The existing mobile history-hiding rules are unchanged; no new full mobile matrix was run.
- All 29 rendered/fit regressions, full ESLint, type checking, production build and Pages build/asset verification pass. Docker's local daemon is unavailable, so Alpine was not run. No map-generation or serialization behavior changed.
- Updated the illustrated guide and preview notes. The [screenshot](../images/v3-history-actions.png) uses prepared maps in the production renderer with isolated session history; no fixtures are loaded by the main application. Final record/register/code comparison matches the approved 03 scope.
