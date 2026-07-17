# Eccentric generation engine

## Contract

- Status: Verified
- User outcome: Eccentric generates deterministic, distinctly composed polygonal worlds whose navigation basins, continents, islands, climates, ranges and rivers arise from retained geographic structure rather than stronger tile noise.
- Scope: Rename Region-Graph to Eccentric across the product; retain legacy option compatibility; implement dense subregions, polygons, authoritative Astronomy basins, basin-scoped continent and island grammars, inland waters, nested biome collections, world extremes, boundary mountain ranges, hierarchical rivers, geographic identities, diagnostics, controls, history/cloning, README copy, tests and runtime verification.
- Attribution: This is an independent TypeScript implementation informed by `zoggop/Civ5FantasticalMapScript` version 31. No Lua functions or numeric option tables are copied verbatim.
- Exclusions: Do not alter the geography of Excogitare, Physical or Polis. Do not execute or bundle Fantastical's Lua. Do not claim exact random-sequence, table or visual parity. A geographic naming layer is not part of this pass; identities must nevertheless be retained for a later layer.
- Risks: Dense graph compilation and strict topology can be expensive on Huge/experimental maps. Extreme basin and aspect-ratio combinations may be geometrically impossible; deterministic relaxation must be disclosed in diagnostics rather than silently emitting illegal output.

## Requirements and evidence

| ID | Requirement | Verification | Status |
|---|---|---|---|
| ECC-01 | The user-facing and authoritative engine name is Eccentric; legacy `REGION_GRAPH` settings normalize to it. | Type/UI/source assertions and legacy-generation regression. | Verified |
| ECC-02 | Standard maps retain approximately 1,300+ subregions beneath connected polygons. | Structure-count tests across Duel, Standard and Huge. | Verified |
| ECC-03 | Deep-water barriers are created before land and produce authoritative Astronomy basins used for land allocation. | Pass-order, basin membership and exact-count topology tests. | Verified |
| ECC-04 | Presets use distinct basin, continent, island, coast and inland-water grammars rather than labels alone. | Preset signature matrix and structural invariants. | Verified |
| ECC-05 | Water reconciliation prefers whole polygons/subregions and coherent shoreline runs while honoring the requested percentage. | Exact budget and coastline-connectivity tests. | Verified |
| ECC-06 | Climate regions contain two to four graph-contiguous biome collections selected in temperature/rainfall space. | Palette membership, contiguity and dissonance tests. | Verified |
| ECC-07 | Lawless, Influenced and Ordered climate logic materially differ; Ordered respects the selected projection and rain shadow. | Comparative deterministic climate metrics. | Verified |
| ECC-08 | Eccentric world extremes produce frozen, tropical, arid and arboreal worlds without illegal terrain/features. | Extreme composition and Repair-clean tests. | Verified |
| ECC-09 | Mountain ranges prefer climate boundaries/coasts, remain coherent and receive accessibility passes. | Range-edge affinity and reachability tests. | Verified |
| ECC-10 | Rivers use major/minor/local corridor hierarchy but retain continuous mountain/lake-to-river/lake/sea legality. | Hierarchy diagnostics, river-system and Repair validation tests. | Verified |
| ECC-11 | Bays, capes, straits, archipelagos, forest realms, wastes and river basins are retained as geographic identities. | Object-kind and classification fixtures. | Verified |
| ECC-12 | Fixed options are deterministic; workers, history, cloning and `.Civ5Map` export remain intact. | Deep equality, worker/UI, history and round-trip regressions. | Verified |
| ECC-13 | Generated maps satisfy placement, accessibility, five-hex start and Repair correctness rules. | All-preset generation/Repair matrix. | Verified |
| ECC-14 | Standard and Huge remain practical in browser and Node 24 Alpine. | Timed generation, production build and container smoke test. | Verified |

## Completion gates

- [x] Contract
- [x] Architecture and data lifecycle
- [x] Domain behavior and edge cases
- [x] Interface, rename and explanations
- [x] Rendering and retained structure
- [x] Editing, history and selective regeneration
- [x] Export and round trip
- [x] Validation and Repair
- [x] Feature-specific and regression verification
- [x] README/help and attribution
- [x] Alpine runtime
- [x] Final reconciliation

## Decisions

- Existing dense subregion and polygon passes are retained where they satisfy the contract.
- Astronomy basins become inputs to continent generation, not post-hoc labels.
- Exact water targets may use a final tile correction only as a contiguous shoreline run.
- Eccentric receives its own river corridor guidance while reusing the proven Civ V river-edge encoder and downstream legality checks.
- Fantasticality remains the single high-level intensity control; detailed settings stay under advanced world controls.

## Verification evidence

- The domain matrix covers all eleven Eccentric grammars, exact water budgets, five-hex start spacing, mountain accessibility, river legality and Repair cleanliness.
- Dedicated tests cover 600/1,300/2,500-scale subregion density, one-to-five authoritative Astronomy basins, logical two-to-four-part biome collections and connected physical components, all four world extremes, climate logic/projection differences, boundary ranges, hierarchical drainage and retained geographic identities.
- The complete suite passes 66/66 tests after a clean ESLint run and TypeScript production compilation.
- Vinext production and GitHub Pages static builds pass; the Pages verifier finds 4 public files and 24 JavaScript bundles.
- The Node 24 Alpine image rebuilt successfully. The replacement `excogitare:0.4.8` container serves the app on port 3001.
- Live browser verification selected Eccentric, found all eleven presets and advanced controls, generated a Standard 80×52 Wonder Heartlands map, rendered its canvas, and found no visible legacy engine name.
