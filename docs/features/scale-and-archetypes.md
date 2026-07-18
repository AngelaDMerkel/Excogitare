# Scale and Archetypes

## Contract

- **Status:** Partial. Schema, controls and deterministic topology-preserving coats are implemented; Scale realization and advanced repaint UX remain open.
- **User outcome:** A user can decide how much of an imagined world the map depicts and can apply a coherent environmental coat to generated or imported topography without inadvertently rebuilding its landforms.
- **Scope:** Global, Continental, Regional, Provincial and Local Scale; Existing and Narrative Default pass-through modes; thirteen authored Archetypes; intensity, repainting, Difference preview, conflicts and engine interpretation.
- **Dependencies:** [`generation-substrate.md`](generation-substrate.md), [`create-authoring-workflow.md`](create-authoring-workflow.md), World Character and all four engines.
- **Exclusions:** Scale is not Map Size. Archetype is not Map Type, World Character or World Modifier.

## Scale contract

Scale changes feature frequency, boundary assumptions and spatial interpretation while Map Size changes resolution. At the same tile budget, Global may show several systems while Local may show part of one. At the same Scale, larger Map Sizes should add detail rather than change narrative category.

Every engine must define Scale behavior for coast frequency, basin/range size, drainage hierarchy, climate gradients, strategic travel and narrative motifs. Unsupported combinations block or disclose an intentional weakened interpretation; they do not silently substitute another Scale.

## Archetype catalogue

Pass-through modes are **Existing** and **Narrative Default**. The authored initial catalogue is **Temperate, Jungle, Sunscourged, Worldfrost, Monsoon, Mediterranean, Steppe, Savanna, Marshland, Volcanic, Jurassic, Post-Collapse** and **Fallout Wastes**.

Each `ArchetypeProfile` defines climate envelope, terrain palette, compatible features, resource ecology, eligible-wonder tendencies, intensity behavior, legality effects and deterministic tests. New labels without those behaviors are not implemented Archetypes.

## Application contract

Hint, Strong and Transformative intensities are available. By default an Archetype may change climate, land terrain, ordinary biome features and compatible content tendencies. It may not change land/water, elevation, rivers, dimensions, wrap, projection, starts, cities, ownership or protected fields. Transformative may request dependent passes only after a Difference preview and confirmation.

Imported maps default to Existing. Repainting an import preserves source bytes until a complete legal candidate is accepted. Narrative Default delegates environmental choice to Map Type and World Character without becoming a second hidden preset.

## Defaults, Randomise and conflicts

Defaults come from the Narrative Map Type envelope. Randomise selects only compatible Archetypes unless an advanced contradictory mode is enabled. Explicit controls remain authoritative, but Review identifies weakened Archetype or narrative effects. Protected conflicts block touched operations rather than mutating the protected area.

## Completion gates

- [x] Scale and Archetype schemas/defaults/migrations implemented.
- [ ] Every engine materially distinguishes all five Scales.
- [ ] Same Scale across sizes preserves category while changing resolution.
- [x] Two pass-through modes and all thirteen Archetypes have deterministic surface profiles.
- [x] Sunscourged and Worldfrost use the approved names in schema and interface.
- [x] Repaint preserves land/water topology, elevation, hydrology, starts, cities and ownership by default.
- [ ] Imported-map repaint, Difference preview and atomic failure behavior work. Imported maps default to Existing and repaint atomically; Difference preview remains open.
- [ ] Transformative consequences require preview and confirmation.
- [ ] Randomise, selective regeneration, protection, history and project round trip work.
- [ ] Legality, determinism, type, lint, build, Pages and Alpine matrices pass.
- [ ] README/help, visual evidence and completion claims are reconciled.
