# V3 snapshot selection studies

## Contract

Provide three interactive mockups replacing the thin left-hand bar on the selected history thumbnail. Keep the current 88×52px previews, ordering, carousel fade, approved hover actions and gold bookmark state. Use navy for selection so it remains distinct from bookmarking.

1. **Corner marks:** four small navy corners around the selected preview.
2. **Soft highlight:** a tinted background behind the selected preview, with quieter unselected maps.
3. **Selection tick:** a compact navy check badge at the lower left, clear of the bookmark and download actions.

## Completion gates

- Isolated pages reuse the current application with prepared samples and session-only history. Do not change production selection styling or stored history.
- Exactly one current snapshot, correct map restored on click/keyboard activation, marker follows selection, and bookmarks/downloads remain separate actions. Preserve the existing visible keyboard-focus indicator.
- Selection styling must not resize thumbnails, move the history or change map-fit geometry.
- No generation, worker, map-schema, editing, repair, persistence or export changes. Domain tests and production builds are inapplicable to these presentation-only studies.
- Review all three in-browser, save screenshots, provide a linked comparison, run scoped syntax/lint and whitespace checks, reconcile evidence, and make a semantic commit without pushing.

## Evidence

- Added three live pages and a linked comparison with actual browser screenshots. Each uses the same prepared maps, selected third snapshot and separate gold bookmarks, making the selection treatments directly comparable.
- Visually reviewed corner marks, tinted highlight and the lower-left tick. The former bar is hidden in all three. Each keeps exactly one `.current` thumbnail with the native pressed state, and the map title follows restoration.
- Browser checks confirmed Enter activation, pointer restoration, arrow-key navigation with the existing 2px focus outline, and bookmarking another snapshot without changing the active map. No console errors were observed.
- All three have identical measured row bounds: 88×52px thumbnails at 61px vertical intervals. The selection overlays are positioned absolutely and do not change the carousel frame or map-fit inputs. Approved bookmark/download controls are reused unchanged.
- Scoped JavaScript syntax, ESLint and whitespace checks pass. No production code, map rules or stored history changed. The register, README and screenshots match the requested mockup scope.
