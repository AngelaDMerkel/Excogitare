# Civ5Map structural validity

## Contract

- **Status:** Partial. Geography-only structural output is internally verified; generated scenario compatibility was disproved by representative Civ V loads and has been withdrawn.
- **User outcome:** Ordinary Create exports are playable geography files without fabricated scenario records. Imported scenarios are preserved and edited only within their existing binary capacity.
- **Scope:** Generated geography serialization, imported-map updating, Repair output, Review/export readiness, header and section bounds, geography grid, world-size section, and conservative inspection of existing scenario records.
- **Exclusions:** Automated inspection cannot prove that every legal binary will be accepted by every Civ V installation, mod set or scenario rule. A real Civ V load remains the compatibility authority.

## Required behavior

1. Inspect the encoded version/marker byte, dimensions, section sizes and bounds before download.
2. Require exactly one complete geography tile grid and a bounded world-size section for v11/v12 files.
3. Ordinary Create serialization must end after the complete geography grid and must not append player, team, improvement or route records.
4. If imported scenario data is retained, require a WorldBuilder-compatible marker, coherent major/city-state/record counts, bounded team/player/improvement blocks and valid coordinates or the format sentinel for every encoded start.
5. Parse the produced binary again and run geography validation against the reparsed representation without requiring scenario starts that the ordinary map intentionally omits.
6. Surface structural failures in Review and a simple export-confirmation modal; never bury them in a sidebar.
7. Repair may correct supported structural fields, but it must not fabricate or overwrite opaque scenario records it cannot safely model.
8. Recognize the exact incomplete envelope emitted by Excogitare 1.3.2 and remove it on re-export without treating unrelated authored scenarios as equivalent.

## Completion gates

- [x] Contract and exclusions recorded.
- [x] Shared binary structural inspector implemented.
- [x] Generated and updated exports use the inspector.
- [x] Review and Repair expose actionable findings.
- [ ] All thirty-three Narrative Map Types serialize as geography-only files and receive representative Civ V load confirmation.
- [x] Malformed marker, truncated section, inconsistent slots and out-of-bounds start fixtures reject.
- [x] Type checking, lint, full regressions, production/Pages builds and Alpine runtime pass.
- [x] Documentation and claims reconciled before status changes.

## Evidence

- The inspector walks the metadata table, optional world-size field, exact geography grid and supported scenario records without relying on the tolerant rendering parser.
- Serialization and imported-map updating reject structural errors before a download can be offered. Review performs a second parse and validates the reparsed representation.
- The former generated scenario writer produced internally self-consistent files that Civ V rejected. It omitted Firaxis type dictionaries and opaque payloads and therefore cannot be treated as supported merely because Excogitare reparses it.
- The supplied Crooked Continents, Encircled Seas, Glacial World, Great Watersheds, Imperial Ring and Opposing Fronts files reproduce the failure across ordinary and unusual dimensions. Their common factor is the synthetic scenario block, not geography.
- The legacy signature requires the exact compact layout, all omitted type-table sizes, generated `Team N` records and exact file length. Re-export strips only a file matching that complete signature; an authored scenario remains on the conservative fixed-record update path.
- Node tests cover malformed markers, truncated data, impossible record totals, out-of-bounds encoded coordinates, the official unplaced-start sentinel and legacy-envelope recovery. The production, GitHub Pages and `node:24-alpine` builds pass.
