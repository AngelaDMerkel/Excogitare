# Protection and Selective Regeneration

## Contract

- **Status:** Partial. Tile-channel and retained-object protection constrain selective regeneration and round-trip through project files; the full semantic compiler and overlay remain open.
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

- [ ] ProtectionState, channel masks, semantic schemas and migrations implemented.
- [ ] Paint, erase, brush, regions, overlay, undo and history work.
- [ ] Stable semantic IDs and lineage confidence survive revisions.
- [ ] Exact, Shape, Function and Relationship behave materially differently.
- [ ] Preserve this Watershed works across all applicable engines.
- [ ] Imported inference previews extent/confidence and supports manual fallback.
- [ ] Engines consume constraints before construction, not only after generation.
- [ ] Hard failures are atomic and soft degradation is disclosed.
- [ ] Project download/reimport retains every constraint; Civ5Map remains clean.
- [ ] Validation, Repair, determinism, builds and Alpine runtime pass.
- [ ] Documentation and completion claims reconcile with evidence.
