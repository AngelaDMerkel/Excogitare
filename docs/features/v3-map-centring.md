# V3 map centring

Status: **Verified** for the rendering scope.

## Contract

Fit all supported geometries into a stable region between visible controls with the approved padding. Changing map aspect ratio must not choose a different corner merely to increase zoom. Use the actual rendered hex bounds when centring the map. Keep manual pan/zoom unrestricted, Layers as an overlay, and responsive Generate/Advanced/Refine framing.

## Findings and gates

The fit solver currently chooses the highest zoom before comparing available rectangle area. On the reported Pin layout this picks a full-height strip to the right of the title, shifting the map right of the larger central workspace. The supplied map-width estimate also includes extra space beyond the rendered hexes.

- Select the primary unobscured rectangle independently of map aspect ratio, then fit the map inside it.
- Verify exact centring, padding, clipping, invalid/blocked inputs and narrow/tall maps with pure geometry tests.
- Inspect real browser layouts across all eight geometries, workspace transitions, resize and mobile; verify Layers and manual views remain unaffected.
- Data model, generator, seeds, workers, map editing/Repair rules, stored map data and file export are inapplicable to this rendering fix. Import and history restoration use the shared fit path.
- Run relevant UI/geometry regressions, lint/types, production/Pages packaging and browser checks; Alpine only when its daemon is available. Update the guide and reconcile the register, then make a semantic commit. Do not push.

## Implementation and evidence

- The fit solver selects the largest unobscured rectangle before considering map proportions, then centres the actual hex footprint within it. Main maps and thumbnails share the same exact bounds, including staggered rows and single-row maps.
- Closed Map details content is excluded even when the browser reports a nonzero bounding box for it. Opening/closing it refreshes automatic fit; manually positioned views keep their camera. Development entry points load the matching fit helper and app version; packaged assets retain content-based cache versions.
- **5 geometry tests pass**, covering all 64 size/geometry pairs in the reported layout, eight geometries in five layout configurations, exact rendered vertices, thumbnails, padding and blocked/invalid requests. **24 rendered checks**, TypeScript, lint and production/Pages builds pass. The generator is unchanged; its previously verified 316-test domain suite was not rerun for this UI-only change. Docker's daemon remains unavailable.
- Browser pixel measurements at 1172×853 place all eight geometries at the same clear-space centre within half a CSS pixel of raster rounding. The reported Pin arrangement no longer chooses the strip beside the title.
- Checks also pass at 900×600, 760×420 and 390×844. A closed Map details panel no longer displaces the narrow-window map; opening it refits around the visible panel and closing restores the previous position.
- Pixel comparisons confirm unchanged map placement across Standard, Advanced and Refine, and while opening Layers. Manual pan/zoom changes the view and opening Layers preserves it. The refreshed production page loads the content-versioned fit/app assets and renders stored maps without errors.
- [Measurements](../verification/v3-map-centring.json) and [Pin capture](../verification/v3-centred-pin.jpg) preserve the verification. The V3 guide and register are reconciled with the code. Changes are scoped for a separate semantic commit.
