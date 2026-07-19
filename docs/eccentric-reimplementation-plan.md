# Eccentric reimplementation plan

This document is the working plan and evidence map for the complete, independent Fantastical-inspired Eccentric engine.

## Pipeline

1. **Dense subregions** — scatter and optionally relax a resolution-scaled small-cell mesh; retain assignments and adjacency.
2. **Polygons and edges** — aggregate connected subregions; retain polygon areas, centers, adjacency and subedges.
3. **Deep oceans and Astronomy basins** — draw preset- and wrap-aware barrier paths/blobs first; flood-fill the remaining polygon graph into navigation basins.
4. **Landmass grammar** — distribute major continents and islands among those basins, reserve open water, add tiny subregion islands, inland seas and lakes, then reconcile the exact water budget coherently.
5. **Climate realms** — partition continental polygons into regions; generate a relaxed Voronoi field in abstract temperature/rainfall space; allocate two to four contiguous biome collections per realm.
6. **Ranges and relief** — prefer coasts and dissonant realm borders, construct non-self-intersecting subedge ranges, add regional uplift, then open intentional accessibility passes.
7. **Terrain and identities** — render terrain/features from the selected collection and classify retained bays, capes, straits, archipelagos, forest realms and wastes.
8. **Hierarchical hydrology** — weight the legal drainage surface toward polygon boundaries for major rivers and subregion boundaries for minor tributaries, preserve mountain/lake sources and valid outlets, then retain river basins/systems.
9. **Shared content and legality** — place starts, city states, resources, wonders, ruins and barbarians through the existing shared rules; run generated-placement legality.

## Preset grammar targets

| Preset | Required structural character |
|---|---|
| Ecological Transect | Several broad continents distributed across open basins with restrained climate logic. |
| Plate-Built Continents | Fewer continents, high boundary-range affinity and sheltered interiors. |
| Great Watersheds | Land-heavy basins, guaranteed inland waters and dense drainage. |
| Inland Sea Crossroads | Two to four colossal inland seas, connected marginal shorelands, narrow water straits and one-tile canal isthmuses; island scatter is explicitly suppressed. |
| Wonder Heartlands | Dissonant climate collections divided by long interior ranges. |
| Encircled Seas | Exterior land enclosing inland seas and lakes. |
| Scarred Pangaea | One dominant continent cut by protected Astronomy scars. |
| Rift Lattice | Habitable land allocated independently inside several navigation basins. |
| Lonely Oceans | Sparse islands and archipelagos separated by extensive open water. |
| Great Peninsulas | Non-wrapping edge-anchored land invaded by gulfs, channels and capes. |
| Broken Island Chains | Major islands, minor islands and tiny subregion islets in distinct chains. |

## Failure and relaxation policy

- Never violate start spacing, terrain legality, river legality or accessibility to satisfy a requested count.
- Reduce impossible populations through the existing generation rule.
- If a requested basin count cannot fit the dimensions, clamp it deterministically and record `requestedAstronomyBasins` and `astronomyBasins` separately.
- Preserve protected deep-water barriers during water reconciliation whenever any legal shoreline adjustment remains.
- Experimental aspect ratios may relax inland-water and tiny-island targets, but must remain deterministic and Repair-clean.

## Verification matrix

- Unit: graph components, basin barriers, coherent water reconciliation, climate-space collections, corridor weighting and identities.
- Domain: every preset on ordinary geometry; representative wrap/projection/extreme/aspect combinations; exact budget, determinism, accessibility, starts and export.
- UI: Eccentric carousel card, grouped presets, advanced controls, Randomise and legacy normalization.
- Regression: Excogitare, Physical and Polis fixture hashes/structural invariants remain unchanged where existing tests expose them.
- Runtime: TypeScript, ESLint, domain tests, rendered HTML tests, Vinext production build, GitHub Pages build, live browser flow and Node 24 Alpine smoke test.

## Completion audit

- [x] Dense subregions and polygon hierarchy
- [x] Basin-first topology and exact feasible basin counts
- [x] Eleven distinct landmass grammars
- [x] Exact coherent water reconciliation
- [x] Climate-space realms and connected biome collections
- [x] Lawless, Influenced and Ordered climate logic
- [x] Snowball, Jurassic, Arrakis and Arborea extremes
- [x] Boundary/coastal mountain ranges and accessibility
- [x] Major, minor and local drainage guidance through the legal river encoder
- [x] Geographic identities and retained river basins
- [x] Shared content, starts, export, history and Repair integration
- [x] Rename, legacy normalization, README and attribution
- [x] Full tests, lint, production/static builds, Alpine image and live browser

The approved feature is **verified**. Passing a pass-count assertion, control, diagnostic or attractive screenshot was not accepted alone; completion required the behavioral and runtime evidence recorded in `docs/features/eccentric-generation-engine.md`.
