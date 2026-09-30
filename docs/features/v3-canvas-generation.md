# V3 generation within the canvas

Status: **Verified** for the coordinate, generation and integration contract below. Alpine is unavailable locally.

## Contract

The requested width and height define the available hex grid before generation. Local geographic construction, rotations, influence widths and field distances use a shared physical scale. A wider or taller canvas must not multiply local feature proportions by its aspect ratio. Growth, placement and native systems must work within its boundaries and preserve the requested tile/water budget. Intentional elongated geography and whole-world latitude/layout remain valid.

## Acceptance and completion gates

- Reproduce and correct the fixed-seed 500-tile example from the geometry audit; test unchanged local construction where canvas boundaries do not interfere, plus narrow boundaries, wrapping, connected growth, exact area and determinism.
- Apply the coordinate contract upstream of terrain classification, starts and content. Use the native engines on the actual grid; do not resize or stretch a finished map.
- Verify representative Standard and Advanced generation across all four engines, ordinary/extreme geometries, placements, starts, water budgets and binary geography round trips. Keep infeasible requests explicit.
- Version new V3 generation so earlier saved maps remain intact and are identified as earlier results. Preserve worker request validation, independent drafts and Randomise pools.
- Retain automatic canvas fit, regular hex rendering and existing Layers/history behavior. Refine/import retain their grids; repair rules and game-file compatibility boundaries are unchanged.
- Run focused regression tests, the complete domain suite, type/lint checks, production/Pages builds and packaged browser generation. Run Alpine only if its local runtime is available. Review actual map comparisons, not only dimension counts.
- Reconcile README/help, feature record and register with measured results. Preserve pending Layers/README work. Make semantic commits; do not push.

## Delivered behavior

- `generation-space.ts` defines the physical pointy-hex metric, a shared area-derived length scale, tile centers, signed wrapping and segment projection. Changing aspect ratio changes available space while preserving local lengths, rotations and widths.
- Connected landform growth scores its construction graph in that physical space and visits only valid neighboring hexes. The source's area budget remains intact when boundaries change where growth can proceed. The branch graph's seed stream is unchanged, making the original reproduction directly comparable.
- Excogitare uses the same metric for source reservations, centers, field warping, relief fields and path widths. Boundary influence uses a physical width limited by available depth. Source budgets are derived before clipping against the grid.
- All native adapters use physical region and path influences for V3. Physical also uses physical basin distances, segment projections and region footprints. Eccentric and Polis retain their existing native polygon/strategic construction, which already uses tile distances. Standard homeland spacing now uses the hex row spacing as well.
- V3 opts into this coordinate contract upstream of climate, starts, resources and final assessment. Legacy callers retain the previous adapter/field convention. No finished map is resized; rendering, requested dimensions, latitude semantics and Randomise pools are retained.
- The V3 generator is version **3**, and native landform construction is version **2**. Old snapshots and imports keep their stored grids. Map details identifies earlier generated maps; new generation uses the updated construction. The current client and worker are packaged together with content-derived cache keys for scripts/styles and the existing worker build key.

## Verification

| Gate | Evidence |
|---|---|
| Local shape | With enough clearance, the same 200-tile landform is exactly identical in 80×80, 160×40 and 40×160 canvases after translation. |
| Reported distortion | The fixed 500-tile example now occupies 32×26 in Standard, 33×26 in Wide and 35×19 in Ribbon, compared with 43×19, 69×12 and 118×7 previously. Its area stays 500. |
| Boundaries and wrapping | Connected growth, valid tile indices, exact area and repeatability pass for Ribbon, Needle, Pin and String, including wrapped maps and anchors near edges. Segment tests cover oblique projection, subdivisions and wrap seams. |
| Complete maps | New tests generate all four engines at Square, Wide and Tall, checking exact water budgets, four major starts, requested dimensions and binary tile round trips. Existing tests cover extreme geometries, extended sizes, cancellation, infeasibility, controls, resource budgets and seeds. |
| Catalogue and geography | **109/109** cases pass: all 33 native map types, Excogitare geometry/wrap variants and Randomise requests. The earlier circular-island reproductions and map-family topology checks also pass under the current coordinate mode. |
| Regressions | **316/316** domain tests and **24/24** rendered checks pass. TypeScript, lint and whitespace checks pass. |
| Packaging | Production and Pages builds pass. The Pages verifier checks content-derived script/style versions as well as asset presence. Browser reload confirms the packaged version notice updates after an older client was cached. |
| Browser | The rebuilt worker generated a Wide, High-water Standard map (seed `073258a4-a4cd-4ab5-bcee-b2497008f167`) with four evaluated starts and no browser errors/warnings. The production app restored an earlier Orin Reach snapshot with its original seed and the earlier-generator notice. |
| Alpine | Docker's daemon socket is absent; image/container execution is unavailable. |

Evidence: [local measurements](../verification/v3-canvas-local.json), [before/after image](../verification/v3-canvas-local.jpg), [six-map comparison](../verification/v3-canvas-comparison.json), [109-case audit](../verification/v3-canvas-catalogue.json), and [browser capture](../verification/v3-canvas-runtime.jpg).

## Final reconciliation and limits

The README and V3 guide describe geometry as available space. Requests, worker delivery, versioning, histories, rendering and export have been checked at their applicable boundaries. Refine/import and Repair retain their existing domain behavior; no saved map is reconstructed automatically. Existing Layers and illustrated-README work is preserved. The completed work is being recorded in semantic commits.

Very narrow canvases still constrain feasible populations and can produce geography reaching a world edge. Intentional long continents, ridges and routes remain valid. The tests verify physical proportions and supported geographic constraints; they do not claim universal visual quality, human multiplayer fairness or new Civ V support for experimental dimensions.
