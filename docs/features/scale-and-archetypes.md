# Scale and Archetypes

## Contract

- **Status:** Verified. Scale is generative in all four engines; Archetypes provide intensity-aware surface and content ecology through an atomic Difference preview.
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
- [x] Every engine materially distinguishes all five Scales.
- [x] Same Scale across sizes preserves category while changing resolution.
- [x] Two pass-through modes and all thirteen Archetypes have deterministic surface profiles.
- [x] Sunscourged and Worldfrost use the approved names in schema and interface.
- [x] Repaint preserves land/water topology, elevation, hydrology, starts, cities and ownership by default.
- [x] Imported-map repaint, Difference preview and atomic failure behavior work. Imported maps default to Existing and repaint atomically.
- [x] Transformative consequences require preview and confirmation.
- [x] Randomise, selective regeneration, protection, history and project round trip work.
- [x] Legality, determinism, type, lint, build, Pages and Alpine matrices pass.
- [x] README/help and completion claims are reconciled. Existing README workflow artwork remains representative; no new promotional asset was required for this behavioral phase.

## Phase 3 implementation plan

1. Add one authoritative five-level Scale registry defining system frequency, subject span, climate window, drainage hierarchy, strategic travel and engine-specific detail behavior.
2. Pass Scale into generation rather than translating it into user-visible option changes. Excogitare changes field span and independent land systems; Eccentric separates major-system count from retained polygon detail; Physical changes plate-system scope and latitude window; Polis changes safe-territory scale, route detail and chokepoint pressure.
3. Retain the selected Scale in recipe, provenance, descriptions and diagnostics while keeping Map Size independent.
4. Expand every authored Archetype profile with climate envelope, compatible characters, terrain/feature ecology, resource ecology and wonder tendencies. Add Hint, Strong and Transformative intensity to the authoritative recipe with backward-compatible normalization.
5. Make Refine produce a protected, legal candidate before installation. Show Original, Preview and Difference views plus changed-surface/content counts. Cancellation or failure leaves the map untouched; Transformative content consequences require explicit confirmation.
6. Make Randomise select a compatible Scale and Archetype without enabling Transformative repaint or game-breaking budgets on mobile.
7. Verify all twenty engine/Scale combinations, category preservation across sizes, all Archetype/intensity combinations, import preview, protection, history/project round trip, legality, full regressions, production/Pages builds and the Alpine runtime.

## Verification evidence

- All twenty engine/Scale combinations are deterministic, materially distinct, exact at the requested water target and free of actionable Repair findings. Cross-size tests retain each Scale's engine category while increasing tile resolution.
- All thirteen Archetypes define climate, terrain, feature, resource and wonder ecology. Hint, Strong and Transformative form nested coherent-region interventions; Transformative biases regenerated resources and wonders to the selected profile.
- Imported-map candidates preserve topology, elevation, rivers, starts, cities, ownership, improvements and routes. Tile protection merges before confirmation, Existing is exact pass-through, and cancellation leaves the installed map untouched.
- Randomise selects a valid Scale and compatible Narrative Default or authored Archetype, never Transformative. Mobile Randomise forces safe budgets and Standard effort even if desktop risk permission was previously enabled.
- TypeScript, ESLint, 103 domain tests, 19 rendered-interface tests, the vinext production build, the verified GitHub Pages static export and the rebuilt Node 24 Alpine container all pass on 2026-07-17. The container responds with HTTP 200 on port 3001.
