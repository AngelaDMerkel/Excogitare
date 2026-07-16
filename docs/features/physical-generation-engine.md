# Physical generation engine

## Contract

- User outcome: Physical produces deterministic Earth-like worlds whose terrain, climate, biomes and rivers emerge from retained tectonic and atmospheric state rather than from latitude bands painted over generic noise.
- Scope: preserve moving plates and exact sea level; add continentality, projected insolation, axial seasonality, prograde or retrograde three-cell circulation, iterative ocean/lake/land moisture exchange, smooth precipitation and temperature fields, orographic rain shadows, water-balance biome selection, runoff accumulation, watershed structure, additional physical presets, controls, Randomise behavior, diagnostics, documentation and regression coverage.
- Failure behavior: every geometry and water level must still produce a complete legal map. Constrained or waterless maps may have no outlet-fed river systems, but must report that state rather than invent ocean drainage.
- Exclusions: this is a deterministic cartographic approximation, not a general circulation model, fluid solver, seasonal Civ V ruleset or numerical reproduction of Space Calc. Eccentric, Excogitare and Polis geography must not inherit Physical-only climate behavior.

## Requirements and evidence

| ID | Requirement | Evidence target | Status |
|---|---|---|---|
| PHY-01 | Physical retains plate ownership, crust type, motion, convergence, divergence and eroded relief. | Structure and tectonic diagnostics tests. | Verified |
| PHY-02 | Requested water share remains exact from zero through ninety percent. | Multi-water-budget tests. | Verified |
| PHY-03 | Temperature combines projected latitude, altitude, continentality, ocean moderation and axial seasonality without sharp biome bands. | Field-gradient and projection tests. | Verified |
| PHY-04 | Surface winds use smoothly blended tropical, temperate and polar circulation cells and can reverse under retrograde rotation. | Wind direction and continuity tests. | Verified |
| PHY-05 | Moisture iteratively advects downwind, recharges over oceans and lakes, recycles over wet land, precipitates under convergence and uplift, and produces leeward rain shadows. | Atmospheric-field and rain-shadow tests. | Verified |
| PHY-06 | Biomes use temperature plus effective water balance, including evaporation demand, maritime moderation and cold-climate behavior. | Preset composition and biome-legality tests. | Verified |
| PHY-07 | Runoff accumulates through outlet-directed drainage and guides the shared Civ V-legal river encoder. | Watershed, guidance and river legality tests. | Verified |
| PHY-08 | Climate cells, climate regions, rain shadows, glacial regions and watersheds remain inspectable geographic objects. | Structure object assertions and World Structure output. | Verified |
| PHY-09 | Seven materially distinct Physical presets expose tectonic and climate regimes without becoming Eccentric-style landmass grammars. | Preset signatures and pairwise-difference tests. | Verified |
| PHY-10 | Advanced controls expose rotation, axial seasonality and ocean influence with accurate explanations and safe resets. | Rendered-source and production-build checks. | Verified |
| PHY-11 | Defaults, preset selection, Randomise, workers, cloning, history and selective regeneration preserve all authoritative options. | Option and workflow regression tests. | Verified |
| PHY-12 | Generated output remains accessible, placement-legal, start-correct, Repair-clean and export-compatible. | Full generation and Repair regression. | Verified |
| PHY-13 | README and architecture documentation explain the model, references, limitations and retained state without claiming scientific or source parity. | Documentation review. | Verified |
| PHY-14 | Lint, types, unit tests, rendered checks, static build and Alpine runtime pass. | Final verification log. | Verified |

## Completion gates

- [x] Contract, acceptance criteria, failure behavior and exclusions recorded.
- [x] Authoritative options, defaults, Randomise, workers and cloning covered.
- [x] Tectonic, climate, biome and hydrology behavior implemented.
- [x] Interface controls, explanations and resets implemented.
- [x] Rendering consequences verified.
- [x] History and selective-regeneration consequences verified.
- [x] Export and round-trip consequences verified.
- [x] Validation and Repair behavior verified.
- [x] Feature tests, regressions, lint, types and builds pass.
- [x] README and help text reconciled.
- [x] Request, register, diff and code reconciled before completion claim.

## Verification evidence

- Deterministic Physical tests cover all seven presets, prograde and retrograde circulation, mild and extreme seasonality, weak and strong ocean influence, exact 0–90% water budgets, every safe map size, both wrap states, all three pole projections, Pin and String geometry, measured windward/leeward precipitation, temperature and wind continuity, outlet drainage, river legality, mountain accessibility and Repair-clean output.
- The full project suite passed with 71 tests after the final Physical coverage was added. ESLint and TypeScript passed without warnings or errors.
- The Vinext production build and independent GitHub Pages static export passed; the Pages verifier found four public files and 24 JavaScript bundles.
- `excogitare:0.4.8` rebuilt from `node:24-alpine`; the replacement local container started on port 3001 without runtime errors.
- The README gallery was regenerated from the actual engine and visually inspected with all seven Physical presets present and legible.
