# V3 geometry audit

Status: **Verified** for the diagnostic scope. The subsequent correction is implemented and verified in [V3 generation within the canvas](v3-canvas-generation.md). The measurements below preserve the original diagnosis.

## Contract

Investigate the report that Geometry only appears to stretch maps. Distinguish canvas scaling from map dimensions and from spatial distortion inside the generator. Compare current output using fixed settings and seeds across ordinary and extreme proportions. Record evidence and any remaining uncertainty before defining changes to generation.

## Applicable gates

Read the authoritative dimension solver, request/planning path, native geography coordinates and canvas renderer. Use actual generated grids and a uniform-scale hex rendering for comparison. Do not change saved maps, runtime behavior or unrelated pending work. Data/model/defaults, workers, history, exports and Repair are inspected as relevant but are not being changed by this audit. New runtime tests/builds and Alpine checks are inapplicable unless a correction is implemented. Record the limits of a small visual sample. Make semantic commits; do not push.

## Findings

- The user clarified that the landforms, rather than the hex tiles, look stretched.
- `resolveMapDimensions` in `lib/map-generator.ts` changes the actual tile grid while approximately preserving the selected size's tile budget. Geometry also contributes to the native seed. Finished maps are generated at the requested dimensions; the renderer uses the same zoom factor on both axes.
- `buildNativeFieldLandform` in `lib/native-landforms.ts` divides horizontal displacement by map width and vertical displacement by map height before rotating and scoring the construction graph. The same geographic pattern therefore expands/contracts with each map axis. `fieldInfluence` and `rasterFieldSource` use the same normalized-space convention; the broader field generator also contains normalized-space geography and relief terms.
- Some other native routines already use physical distances, including hex-adjusted region/path influences and the Physical engine's distance helper. A correction must distinguish local shape/distance from intentional whole-world layout and latitude rather than replacing every normalized coordinate indiscriminately.

## Reproduction

Use `buildNativeFieldLandform` with source `{ id: 'geometry-audit', role: 'CONTINENT', effect: 'LAND', x: 0.5, y: 0.5, radiusX: 0.18, radiusY: 0.15, rotation: 0.8, strength: 1 }`, seed `42`, `wraps: false` and requested area `500`. Use the Standard-size dimension solver for each geometry:

| Geometry | Grid | Occupied footprint | Land tiles |
|---|---|---|---|
| Standard | 80 × 52 | 43 columns × 19 rows | 500 |
| Wide | 129 × 32 | 69 columns × 12 rows | 500 |
| Ribbon | 223 × 19 | 118 columns × 7 rows | 500 |

The construction source, orientation, seed and area are unchanged. The resulting footprint follows the grid's aspect ratio. This isolates a cause of the visual distortion before climate, starts, balancing or rendering.

Six complete Standard-mode maps were also generated: `geometry-review-0` (Physical/Inland Supercontinent) and `geometry-review-2` (Excogitare/Crooked Continents), each at Standard, Wide and Ribbon geometry with other defaults. All six passed the current final assessment at roughly 48% water. These are a small diagnostic sample, not an all-engine or all-map-type aesthetic audit.

Evidence: [measurements](../verification/v3-geometry-audit.json) and [uniform-hex comparison](../verification/v3-geometry-audit.jpg). The local review page includes all six complete maps. Browser inspection of the historical warnings page found its default sample and Colossal/Ribbon warning selections; that sample was not treated as freshly generated evidence.

## Corrective direction

Use one physical distance convention for local landform construction, rotations, widths and noise. Let the world planner arrange geographic systems within the chosen rectangle, with explicit handling when an individual system cannot fit across its narrow axis. Preserve intentional elongation, map-type relationships, wrapping and latitude semantics. Verify local shape under changed canvas proportions, complete maps across native engines, narrow-map population feasibility and existing determinism/export boundaries. A CSS adjustment or final raster resize would not address this cause.

No runtime code or saved maps were changed. Existing Layers and README edits remain intact. `git diff --check` passes; the completed work is being recorded in semantic commits.
