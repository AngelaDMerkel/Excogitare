# Protection and Selective Regeneration

## Contract

- **Status:** Verified. The authoring, inference, native engine compilation, candidate search, exact merge, reporting and project workflow are implemented and covered by deterministic all-engine regressions.
- **User outcome:** A user can preserve exact authored tiles or the identity and function of a geographic system while regenerating everything else, with conflicts explained before the current map changes.
- **Scope:** Channel masks, named regions, Drag to Preserve, semantic objects, stable lineage, Exact/Shape/Function/Relationship policies, imported inference, all-engine constraint compilation, undo and history.
- **Dependencies:** [`generation-substrate.md`](generation-substrate.md), Create Edit/Iterate, retained structures, all four engines and project files.
- **Exclusions:** Protection does not legalize invalid Civ V content and does not guarantee that mutually incompatible constraints can be satisfied.

## Tile protection

`TileProtectionMask` supports Topology, Elevation, Climate, Features, Hydrology, Content, Starts and Scenario channels. Drag to Preserve paints or erases named channel regions with brush, region and flood-selection tools. Exact masks preserve selected field values and participate in undo, history, cloning and project round trip.

## Semantic protection

`SemanticProtection` retains a stable `SemanticObject` using Exact, Shape, Function or Relationship policy. Hard constraints reject invalid candidates; soft constraints participate in candidate comparison and require confirmation for degradation.

**Preserve this Watershed** defaults to hard Function protection for Hydrology and Shape protection for its catchment. It retains a lawful source class, tributary hierarchy, drainage direction and lake/ocean outlet while allowing unprotected terrain, features and content to change.

Generated objects use stable semantic IDs and confidence-labelled lineage. Imported maps infer watersheds, ranges, coasts, islands and strategic regions, previewing extent and confidence before protection. Low-confidence inference offers exact manual selection rather than pretending certainty.

## Compiler behavior

Constraints enter generation before candidate construction. Eccentric pins graph relationships; Physical constrains provinces, drainage and boundary conditions; Polis pins strategic nodes/routes/territories; Excogitare compiles spatial fields and connectivity targets. Post-generation copying alone is not semantic protection.

Hard failure leaves the current map untouched. Soft degradation records changed geometry, lineage confidence, satisfied invariants and accepted loss in history and Review. Dimension changes require previewed resampling for Shape/Function/Relationship; Exact masks require explicit discard or separately reviewed conversion.

## Validation, Repair and export

Protected illegal content blocks only touched operations and relevant export while remaining visible in Review. Repair never silently destroys protection. Civ5Map receives only resulting tiles; semantic constraints remain in `.excogitare`.

## Completion gates

- [x] ProtectionState, channel masks and semantic schemas implemented and rejected safely when malformed.
- [x] Drag selection, erase, named regions, overlay and independent protection undo/redo work.
- [x] Stable semantic IDs and lineage confidence survive revisions.
- [x] Exact, Shape, Function and Relationship behave materially differently.
- [x] Preserve this Watershed reconstructs and retains a complete directed Civ V river-edge component.
- [x] Imported inference previews extent/confidence and supports exact named-region fallback.
- [x] Engines consume constraints before construction, not only after generation.
- [x] Hard failures are atomic and soft degradation is disclosed.
- [x] Project download/reimport retains every constraint; Civ5Map remains clean.
- [x] Validation, Repair, determinism, builds and Alpine runtime pass.
- [x] Documentation and completion claims reconcile with evidence.

## Engine boundary

All four engines use deterministic four-candidate searches and receive the same versioned, typed-array constraint payload before constructing a candidate. Their adapters remain deliberately different:

- Excogitare conditions its continuous land field before the water threshold, then constrains relief and drainage guidance.
- Eccentric votes protected extents into polygon land allocation and compiles protected relationships as paths through the polygon graph before climates, ranges and rivers are built.
- Physical conditions sea-level classification, relief and outlet-directed drainage before biomes and river encoding.
- Polis pins protected starts and semantic anchors, adds protected relationship edges to its strategic graph, and treats retained territories and routes as land-budget constraints.

Candidate scoring still chooses among lawful deterministic alternatives. The later merge remains necessary as an exact Civ V byte-level guarantee for channels such as resources, scenario records and river seams; it is no longer the first or only point at which the engines see protection. Direct pre-merge regressions verify adapter consumption, semantic relationships, deterministic output and Repair-clean results.
