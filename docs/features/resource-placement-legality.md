# Resource placement legality

## Contract

Excogitare must apply Civ V's terrain and relief restrictions consistently wherever resources are created, retained, reviewed or repaired. For the present correction, `RESOURCE_WHEAT` is flatland-only: it may occupy otherwise legal land with elevation `0`, but never hills (`1`), mountains (`2`) or water.

## Workflow coverage

- Create and start normalization must not place Wheat on hills.
- Archetype repainting and semantic protection use the shared placement verdict and therefore inherit the rule.
- Review must report imported or edited hill Wheat as an error with a tile location.
- Standard Repair must relocate illegal Wheat to the nearest compatible empty tile, or delete it when none exists.
- Export legality enforcement must never retain generated hill Wheat.

## Exclusions and failure behavior

This correction does not claim a complete data-driven transcription of every Civ V resource table. Forced placements made by third-party mods may intentionally follow different rules. The base Brave New World XML is authoritative for this scope.

## Evidence required

- Direct flatland/hill/mountain/water verdict regression.
- Review finding and Repair relocation regression.
- Generated-map regression proving Wheat is never placed on hills.
- Full tests, lint, production build, Pages build and live Alpine container response.

## Deliberate baseline review

The correction changes tile and Civ5Map digests wherever a deterministic fixture formerly selected Wheat for a hill. Aggregate geography, starts, rivers, wonders, validation results and all non-content structure remain unchanged. Resource totals change only in three fixtures: Physical `49 → 48`, Broken Island Chains `175 → 180`, and Glacial World `308 → 306`. The increases come from substituting another legal bonus resource instead of deleting illegal Wheat; decreases occur where start normalization has no unused legal flatland target and now declines the placement instead of overwriting or retaining an illegal one. Glacial World's retained narrative assessment digest also changes because its scored content evidence includes the corrected resource distribution. These are accepted legality effects rather than geographic drift.

## Verification

- Shared verdict confirms flatland Wheat and rejects hill, mountain and water Wheat.
- Review reports the illegal tile and Standard Repair relocates it to the nearest empty flatland tile.
- All Create correctness fixtures remain Repair-clean under the stricter rule.
- 146 domain tests and 23 rendered-interface tests pass; lint, the production build, TypeScript/static Pages build and Pages artifact verification pass.
- The Node 24 Alpine image builds successfully and the replaced local container responds with HTTP 200 on port 3001.
