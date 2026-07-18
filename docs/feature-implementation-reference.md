# Feature Implementation Reference

A feature is complete only when its promised user outcome works across every applicable workflow. A control, type, diagnostic count or plausible-looking map is not completion by itself.

## Status vocabulary

- **Specified:** the contract and acceptance criteria are recorded.
- **In progress:** implementation is underway and at least one applicable gate remains open.
- **Implemented:** behavior and integration are complete; final verification may remain.
- **Verified:** acceptance tests, regressions and required builds/runtime checks pass.
- **Partial:** useful behavior exists, but named omissions remain.
- **Groundwork:** supporting types or controls exist without a complete user outcome.

## Completion gates

Every feature record must cover, or explicitly mark inapplicable:

1. Contract, acceptance criteria, failure behavior and exclusions.
2. Authoritative data model, defaults, Randomise, determinism, workers and cloning.
3. Actual domain behavior and edge cases—not merely controls or metadata.
4. Interface placement, explanations, modal confirmations and safe reset behavior.
5. Rendering/layer consequences where applicable.
6. Editing, history and selective-regeneration consequences where applicable.
7. Import/export/round-trip behavior where applicable.
8. Validation and Repair behavior, including destructive-action disclosure.
9. Feature-specific tests, regression suite, lint, type checking and builds.
10. README/help wording, risks, limitations and accurate completion claims.
11. Final comparison of request, feature record, diff and current code.

Runtime code changes also require the Alpine image/container check when the local runtime is available. Never commit or push for the user.

## Feature register

| Feature | Status | Approved scope | Open work |
|---|---|---|---|
| [Workspace navigation](features/workspace-navigation.md) | Verified | Present Explore, Create, Repair and experimental Lua as visually distinct workspaces; use a dedicated contextual stage strip; expose task-specific sidebar mastheads and compact map identity outside Explore; retain functional Create, Repair and Lua stages. | No open work in the approved scope; Lua compatibility and Repair's domain boundaries remain unchanged and explicitly documented. |
| [Physical generation engine](features/physical-generation-engine.md) | Verified | Expand Physical into a retained tectonic, circulation, moisture, biome and watershed simulation informed by the Space Calc and Mythcreants climate models. | No open work in the approved scope; pressure, ocean currents, fluid dynamics and actual Civ V seasons remain explicit scientific boundaries. |
| [Eccentric generation engine](features/eccentric-generation-engine.md) | Verified | Rename Region-Graph; independently reimplement Fantastical's basin-first polygon architecture, biome collections, boundary ranges, hierarchical hydrology, extremes and retained identities. | No open work in the approved scope; geographic labels remain an explicit future feature. |
| [Start-location correctness](features/start-location-correctness.md) | Verified | Five-hex global separation; missing-major validation; generated-map start reconstruction; WorldBuilder-compatible generated scenario export; slot-aware imported-map repair; Competitive whole-layout balance; restrained city states; Polis capacity degradation; Colossal generation coverage. | No open work in the approved scope; Civ V remains the final runtime authority for exported files. |
| [Extended tile budgets](features/extended-tile-budgets.md) | Verified | Game-Breaking-gated Extreme 180×94 and Colossal 170×110 budgets, including Randomise and round trip. | No open work in the approved scope. |
| [Civ5Map metadata export](features/civ5map-metadata-export.md) | Verified | Encode map names and descriptions as distinct Civ V-compatible metadata strings for generated and edited exports. | No open work in the approved scope; Civ V remains the final runtime authority for exported files. |
| [World Character](features/world-character.md) | Verified | Realistic, Fantastical, Mundane and Brutal are deterministic, directional modifier profiles for Excogitare, Eccentric, Physical and Polis without replacing their engine architecture or silently overriding advanced controls. | Authoritative profile, all sixteen engine/character interpretations, inline explanation, selective regeneration, Randomise, history, Civ5Map tile round-trip, validation matrix, documentation, Pages and Alpine runtime verified. |
| [Generation substrate](features/generation-substrate.md) | Verified | Introduce the versioned project/recipe schemas, migrations, deterministic pass graph, worker protocol, provenance, retained semantic identities and derived-evidence invalidation required by the narrative rewrite. | No open work in the approved scope. Typed-array transfer becomes a required migration gate only if the current structured Civ5Map worker result is replaced by transferable payloads. |
| [Create authoring workflow](features/create-authoring-workflow.md) | Verified | Replace the current Create navigation with Design → Refine → Iterate → Edit → Review, stage-local state, decomposed interface components, non-navigating operations, continuous history and the approved three-action mobile boundary. | No open work in the approved Phase 2 scope. Separate domain features surfaced by Create retain the statuses and omissions recorded in their own feature records. |
| [Scale and Archetypes](features/scale-and-archetypes.md) | Verified | Add independent Global, Continental, Regional, Provincial and Local scales plus two pass-through modes and thirteen authored Archetypes, including Sunscourged and Worldfrost, with topography-preserving repaint and honest Difference previews. | No open work in the approved Phase 3 scope. Narrative Map Type-specific scale reinterpretation remains part of Phases 4 and 5. |
| [Map Type narrative identities](features/map-type-narrative-identities.md) | Partial | Treat all thirty current Map Types and the approved Three Realms, Thalassic League and Unequal Realms Polis additions as recognizable narrative premises expressed through their owning engine, reinterpreted by World Character, complicated by World Modifier, and constrained by explicit controls, victory geography and Civ V legality. Every type requires a unique narrative verb, mandatory relationships, nearest-confusion boundaries, anti-motifs, retained diagnostics and a blind-recognition statement. Twenty approved concrete display names replace nebulous labels while stable machine IDs and the names Lonely Oceans, Dynamic Earth, Imperial Ring, Three Realms, Thalassic League and Unequal Realms remain unchanged. | Phase 4 is verified: all thirty-three profiles and retained skeletons exist, while Lonely Oceans, Broken Island Chains, Great Watersheds and Glacial World have specialized compilers and scored Review evidence. Phase 5 must implement the remaining twenty-six current identities; Phase 6 owns the three future Polis types. |
| [Match Intent and Polis](features/match-intent-and-polis.md) | Partial | Make Human/AI composition, explicit advanced seats, teams, Enabled/Emphasized victories and AI accommodation meaningful to Polis topology and explanatory for every engine; complete all seven Polis Narrative Map Types. | Refine records Human/AI/Flexible composition, AI accommodation and Enabled/Emphasized victories in the authoritative recipe. Polis topology weighting, explicit seats, feasibility reports, the three new types and Scenario handoff remain open. |
| [Protection and selective regeneration](features/protection-and-selective-regeneration.md) | Partial | Add per-channel tile protection and cross-engine semantic protection with stable lineage, Exact/Shape/Function/Relationship policies, Preserve this Watershed, protected regeneration, conflicts, undo and history. | Drag to Preserve, eight tile channels, retained-object Function protection, hard missing-lineage conflicts, selective-regeneration merge, stale evidence, project round trip and tests are implemented. Persistent overlay, semantic relationship compiler, imported inference, protection undo and full policy/tolerance behavior remain open. |
| [Identity Lab](features/identity-lab.md) | Partial | Preserve the verified Lab while extending it to endless deterministic four-choice Blind Recognition with bounded prefetch, schema v2, v1 import and End and export; Learning Mode is excluded. | The current finite blind-review Lab remains verified. The approved continuous four-choice extension is specified but not implemented or verified. |
| [Excogitare project files](features/excogitare-project-files.md) | Partial | Make downloaded `.excogitare` bundles the only durable project contract, retaining complete authored state and derived evidence through safe versioned export and later clean-session import without accounts, cloud, server or browser-storage dependence. | Versioned checksummed download/reimport retains map, recipe, structure, protection, scenario draft, editor view and thirty generations; corrupt, oversized and future-schema files reject before replacement. Compression, selectable history policy, migration fixtures, unsaved-close warning and cryptographic hashes remain open. |
| [Scenario workspace](features/scenario-workspace.md) | Specified | Add Setup → Factions → World → Objectives → Validate with Project-only disclosure and a conservative first Game-verified Civ5Map boundary covering metadata, faction identity, starts, cities, ownership, improvements and routes. | Scenario schemas, navigation, entity editors, compatibility promotion, validation, Repair handoff, export and real Civ V verification remain open. |
| [Narrative generation rewrite](features/narrative-generation-rewrite.md) | In progress | Implement a coordinated rewrite covering Match Intent-aware Polis geography, all thirty-three accepted Narrative Map Types, the five-stage Design → Refine → Iterate → Edit → Review workflow, independent Scale and Archetype systems, continuous four-choice Identity Lab sessions, non-navigating history review, tile and semantic protection, deterministic computation controls, first-class `.excogitare` project files and a new Scenario workspace. Semantic protection is part of the feature implementation across all four engines, not an optional follow-up. | Phases 1–4—the generation substrate, five-stage Create workflow, independent Scale/Archetype systems, exhaustive narrative profiles and four benchmark identity compilers—are verified. Complete catalogue realization, Polis intent, continuous Lab, full semantic compiler, Scenario workspace and remaining integration gates are still open. |

## Claim audit

Before reporting completion, distinguish behavioral, integration, persistence, rendering and compatibility claims. State limitations whenever an applicable layer is absent. Passing a build proves compatibility, not correctness.
