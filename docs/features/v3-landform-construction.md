# V3 landform construction

Status: **Implemented**. Automated and browser checks below pass; Alpine is unavailable locally.

## Contract

The user requests correction of repeated circular/elliptical islands without a quick-fix shortcut. Correct native construction before terrain classification, climate, drainage, resources and starts. Planning regions describe location, extent, orientation and relationships; they must not impose literal ellipse coastlines.

Introduce a versioned V3 field-construction mode. Build connected source bodies from seeded branching backbones, variable-width spurs and intervening basins, growing a target area over the hex graph. Reuse those bodies for native region/path binding and their internal structure for relief. Preserve exact protected regions. Existing legacy generator entry points retain their replay contract; V3 opts into the new constructor and records a new generator version.

Do not repair finished maps by sprinkling shoreline noise, deleting round islands, changing selected map types, hiding failures, or regenerating until an unchecked shape happens to look acceptable.

## Acceptance and evidence

- Fixed seeds that reproduced the defect must lose the large smooth ellipse silhouettes at native construction, with and without homeland hints.
- Region growth is deterministic, connected and area-bounded, with stable wrap behavior and real broad bays/peninsulas. Fine boundary noise alone must not satisfy the shape check.
- Independent final-map assessment evaluates sufficiently resolved land components at a broader scale than individual hex edges. Detect large/repeated filled ellipses; allow small islands and hollow atolls, and require actual volcanic construction evidence for any volcanic exception.
- Rejected candidates cannot enter history or become accepted through the best-candidate fallback.
- Preserve engine/type selection, water budgets, viable and spaced starts, resource normalization, supported terrain legality, map round trips and explicit constraints.
- Existing saved/imported maps remain unchanged. Earlier V3 history is marked as using the earlier generator; generating again uses the new constructor.
- Verify synthetic positive/negative shape fixtures, native-before/after reproduction seeds, multiple seeds/sizes/geometries, the full map-type audit, existing regressions, types/lint/builds and actual browser rendering. Alpine applies only when its runtime is available.

## Scope

The diagnosed literal reservation defect is in the Excogitare field constructor. The independent acceptance check applies across V3 engines. Any additional native defect discovered by that check must be addressed at its source or reported explicitly; do not exempt an engine wholesale. The production V2 checkout and unrelated changes are preserved. No commits or pushes.


## Delivered construction

V3 generator version **2** opts into native field-construction version **1**. `lib/native-landforms.ts` creates curved, branching backbones with unequal widths and tapered spurs. Connected priority growth over hex neighbors gives each source its area budget. The earlier ellipse contributes the budget and orientation, not a boundary mask.

The native field now receives bounded, signed land/water influence **before** diffuse refinement. V3 no longer forces the whole reserved footprint above or below sea level after refinement. The same internal backbone contributes to relief before climate and drainage. Sea-level selection retains the requested water budget. This corrects the cause upstream; it does not decorate or erode an already accepted oval. Exact protected memberships and explicit topology constraints retain their existing handling. Legacy callers keep their original constructor and replay behavior.

`lib/coastline-quality.ts` independently examines finished land components. It normalizes rotation and elongation, measures broad angular variation, and checks filled-ellipse occupancy. One unexplained regular component of at least 96 tiles, or two of at least 48 tiles, fails acceptance. Pixel noise and an isolated thin spur cannot hide the underlying oval. Hollow atolls remain possible. A compact volcanic island requires an actual native volcanic anchor and a central mountain; the exception scales with map area and does not exempt a whole engine or preset.

The existing bounded candidate loop only retains accepted candidates. A shape failure cannot become the fallback result or enter browser history. Map details identifies earlier generator snapshots; their maps remain unchanged. New Generate and Randomise requests use the rebuilt worker.

## Completion gates

| Gate | Status and evidence |
|---|---|
| Contract | Implemented the upstream construction correction and independent finished-map check described above. |
| Model, replay, worker | Verified deterministic connected growth, exact requested source-area budget, seam wrapping, generator version 2, the production worker bundle and legacy regression behavior. |
| Domain and edge cases | Verified the three reproduced defect seeds before V3 climate/content, identical water counts, retained hard land/water constraints, basic Pangaea/Continents/Archipelago/Earthsea/Inland Seas topology, shape fixtures and scaled volcanic exceptions. |
| Interface and failures | Verified a real browser Generate request completed with the new version. Existing progress, cancellation and accepted-only history remain in the pipeline. Earlier snapshots display the earlier-generator note. |
| Rendering | Reviewed the same-seed native before/after comparison and a newly generated map in the actual application. [Comparison capture](../../mockups/v3/coastline-construction-preview.jpg). |
| Editing and persistence | Existing snapshots/imports are not migrated or rewritten. Current results retain the version and coastline assessment; Refine retains its existing stale-assessment behavior. No new selective regeneration feature is introduced. |
| Import/export | Verified terrain geometry through the existing Civ5Map serializer/parser. Imported maps are not subjected to generation rejection or silently reshaped. Planned starts still are not transported by ordinary map export. |
| Validation and Repair | The shape check is generation acceptance, not an import legality rule or destructive Repair action. Existing placement validation remains active. |
| Tests and builds | 305/305 full regression tests passed before the final two fixtures; the final V3 suite passes 24/24, including all 11 landform tests. All 23 rendered-interface tests pass. Repository types/lint, production, Pages and the asset verifier pass. Docker cannot reach its daemon, so Alpine could not run. |
| Documentation | Register, pipeline record and V3 README describe versioning, construction, history behavior and the limits below. |
| Final reconciliation | Compared the approved request, current constructor and acceptance code, tests, audit, browser output and records. Unrelated V2 work preserved; no commits or pushes. |

## Audit and reproduction

- [Recorded audit](../verification/v3-landform-audit.json): **109/109**, comprising all 33 native map types, 64 Excogitare preset/geometry/wrap variants and 12 Randomise requests. The largest Excogitare water-target difference was 0.0247 percentage points, within tile rounding. Existing final assessment also checks populations, reachable starts/resources and supported legality.
- Additional Huge EARTHSEA smoke checks passed with eight major starts and four city states in Standard (128×80) and Wide (202×51) geometry. Seeds: `large-coast-STANDARD` and `large-coast-WIDE`; Advanced water target 68%.
- Browser Generate completed a new four-player map, Harrow Reach, seed `4b559af7-ccb0-49dd-95c9-5be7ed48c39f`, with current-generator provenance. Map details disclosed the remaining opening-terrain difference despite equal early-resource budgets. No browser runtime errors were observed.
- Reproduce automated checks with `pnpm run test:v3` and `pnpm run audit:v3-landforms`.
- Reproduce the native visual comparison with `node --experimental-strip-types scripts/render-v3-landform-review.mjs --single`, then serve `mockups/v3` and open `/review/comparison.html`. Without `--single`, `/review/coastlines.html` contains all three reproduced seeds.

## Limits

The shape check targets repeated filled oval silhouettes. Components below 48 tiles, land touching an unwrapped map edge, and world-winding continents do not have a sufficiently complete island outline for this check. It is not a general aesthetic score or proof of every possible seed. The native correction still runs before these inspection boundaries. Water budgets and basic map-family identities are checked independently; an island moving into a clipped boundary alone does not satisfy the reproduction test.

This change preserves the existing gameplay and export boundaries: matched opening-resource budgets do not guarantee identical terrain opportunity, Civ V chooses starts for ordinary maps, and actual in-game play remains unverified. It does not retrofit saved maps, promise tectonic simulation for the Excogitare engine, or change the legacy V1/V2 generator.
