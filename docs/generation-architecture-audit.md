# Generation Architecture Audit

This checklist records the architecture proposed and approved during the Eccentric and four-engine discussions. It exists because a passing build is not evidence that the requested design was actually built.

## Engine contract

- [x] **Excogitare** is an explicitly named engine rather than an ambiguous “terrain fields” label.
- [x] **Eccentric** is the authoritative name for the independent Fantastical-inspired graph compiler.
- [x] **Physical** is an independent simulation path rather than a Realistic-style branch inside Excogitare.
- [x] Legacy saved settings containing `FIELD` or `REGION_GRAPH` migrate to `EXCOGITARE` or `ECCENTRIC` when loaded or generated.
- [x] Randomise reaches all four engines through their preset families.
- [x] Seeds include engine identity, so changing engines cannot silently produce the same world sequence.

## Excogitare

- [x] Retains the original warped-field landmass architecture and all existing styles, modifiers, geometries and content rules.
- [x] Has its own map-type family.
- [x] Retains continents, ocean basins, mountain ranges and river systems as structural metadata.

## Eccentric

- [x] Resolution-scaled dense subregions are generated and retained: roughly 600 on Duel, 1,300 on Standard and 2,500 on Huge.
- [x] Subregions are partitioned into connected polygons with adjacency.
- [x] Protected deep-water barriers are compiled before land and divide the polygon graph into authoritative Astronomy basins.
- [x] Connected land and water superpolygons are retained, including the Astronomy-basin ownership used during land allocation.
- [x] Continents, islands, ocean basins, inland seas and lakes are classified independently.
- [x] Eleven presets use distinct continent, island, coast, inland-water and basin grammars.
- [x] Exact water reconciliation prefers whole subregions followed by contiguous shoreline runs.
- [x] Rifts are generated and retained where the selected topology uses them.
- [x] Climate provinces are graph-partitioned and retain two to four logical biome collections drawn from an abstract temperature/rainfall field.
- [x] Lawless, Influenced and Ordered climate logic is selectable; Ordered retains the selected projection and west-to-east rain shadow.
- [x] Snowball, Jurassic, Arrakis and Arborea world extremes materially alter terrain and vegetation.
- [x] Mountain ranges prefer dissonant climate boundaries or selected coasts, avoid range intersections and remain named objects.
- [x] Drainage accumulation prefers polygon boundaries for major rivers and subregion boundaries for tributaries while retaining the shared continuous mountain-to-water river encoder.
- [x] Bays, capes, straits, archipelagos, forest realms, wastes and river basins are retained as geographic objects.
- [x] Water percentage is exact and mountain barriers cannot isolate otherwise passable land.
- [x] Living World, Tectonic Continents, Great Watersheds, Shattered Basins, Mythic Regions, Encircling Lands, Astral Pangaea, Riftworld, Lonely Oceans, Peninsula Realm and Shattered Archipelago are separate presets.

The implementation is independent. It does not copy Fantastical's Lua, tables, authored names or random sequence. Its retained generic names are structural identifiers, not an imitation of Fantastical's vocabulary.

## Physical

- [x] Continental and oceanic tectonic plates have persistent ownership and motion vectors.
- [x] Relative motion distinguishes convergent uplift from divergent rifting.
- [x] Plate activity changes boundary intensity.
- [x] Erosion strength changes the number and strength of relief-smoothing passes.
- [x] Sea level is derived from the exact requested water share.
- [x] Terrain temperature couples latitude, regional variation and altitude.
- [x] West-to-east atmospheric moisture recharges over water, precipitates during uplift and produces eastern rain shadows.
- [x] Shared accumulated drainage produces legal continuous rivers and tributaries.
- [x] Dynamic Earth, Colliding Plates and Ancient Cratons form a distinct preset family.
- [x] Physical output retains plates, continents, ocean basins, climate zones, ranges and rivers.

## Shared generation and workflow

- [x] All engines use the same legality, accessibility, resource, wonder, site, start and city-state passes.
- [x] All engines work with every map size, wrap option and geometry, including Pin and String.
- [x] The sidebar order is engine and concept, shape, climate, resources, players, then generation.
- [x] Engine-specific controls appear only when relevant.
- [x] Complete generation runs outside the interface thread and can be cancelled.
- [x] Candidate batches run outside the interface thread and can be cancelled.
- [x] Selective regeneration runs outside the interface thread and can be cancelled.
- [x] Worker progress is emitted from actual generation passes rather than a single decorative message.
- [x] History, selective passes, candidate ranking and checkpoints appear after the initial world-building path.
- [x] Structural metadata is deep-cloned in history, checkpoints and repair copies.
- [x] A World Structure report exposes retained object and system counts.

## Validation

- [x] Determinism is tested independently for Eccentric and Physical output.
- [x] The four engines are tested as distinct code paths and produce distinct geography.
- [x] Exact water shares, mountain accessibility, river correctness and Repair cleanliness are tested.
- [x] Eccentric density, basin counts, biome collection contiguity, extremes, geographic identities and river hierarchy are tested; Physical plate metadata is tested independently.
- [x] Realistic rain shadows are tested in Excogitare, Eccentric and Physical generation.
- [x] Legacy engine migration is tested.
- [x] The rendered source is tested for the four engine controls, preset families, Eccentric extremes, Physical controls, structural report and background selective regeneration.

## Deliberate remaining boundaries

- [ ] The tile editor does not yet select and transform whole retained plates, polygons, climate regions or river systems. The object model now survives generation specifically so this can be added without reconstructing geography from pixels.
- [ ] Generic geographic names are not drawn as a map-label layer.
- [ ] Structural metadata is private Excogitare state and is not embedded in the standard `.Civ5Map` binary format.
- [ ] Generation history remains in memory and disappears on page reload.
- [ ] Newly generated scenario-only records still cannot be fully invented in a fresh `.Civ5Map` scenario section.

Those five items are disclosed product limitations rather than missing parts of the approved generation-engine architecture.
