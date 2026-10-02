# V3 selected snapshot corners

## Contract

Replace the left-hand selection bar with approved 01: four navy corner marks, each 9px long and 1.5px thick, positioned 3px outside the selected thumbnail. Apply to the main application and active aliases through shared CSS. Gold bookmarks, hover downloads, keyboard focus and the current native pressed state remain available.

## Completion gates

- Use the existing `.current` state. Exactly one thumbnail receives the corners; restoring another map moves the indicator.
- Keep 88×52px thumbnails, carousel spacing/fade and map framing. Decorative corners must not intercept clicks or change layout.
- Preserve the three historical mockups as distinct alternatives.
- This changes CSS and page configuration only. Generation, workers, map schema, persistent selection/bookmarks, edits, repairs and import/export behavior are unchanged. New domain tests, type checking and server/container builds are inapplicable; verify browser rendering, keyboard selection, hover controls, shared asset packaging and whitespace.
- Update the guide and register, save a current screenshot, and commit the checked change without pushing.

## Evidence

- Added an explicit `data-snapshot-selection="corners"` setting to the main page and two active aliases. Shared `history-actions.css` supplies the approved decoration; historical alternative pages retain their own selection styles.
- Browser inspection confirms four pairs of 9px/1.5px corner strokes, a -3px inset, hidden former bar and `pointer-events: none`. Thumbnails remain 88×52px, with identical panel and shelf bounds after selecting another map and bookmarking a different snapshot.
- Arrow/Enter selection moves the corners and updates the map title. Exactly one current thumbnail retains its pressed state; bookmarking another thumbnail leaves the current map selected. No console errors were observed.
- V3 packaging, matching source/packaged CSS and page settings, and whitespace checks pass. No JavaScript or domain logic changed, so broader logic tests and server/container builds were not required.
- Updated the guide with a [production-renderer capture](../images/v3-history-selection.png) using prepared maps and isolated session history. Feature record, register and final diff match the approved scope.
