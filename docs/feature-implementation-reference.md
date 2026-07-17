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
| [Map Type narrative identities](features/map-type-narrative-identities.md) | Specified | Treat all thirty Map Types as recognizable narrative premises expressed through their owning engine, reinterpreted by World Character, complicated by World Modifier, and constrained by explicit controls and Civ V legality. | The narrative reference is specified and the separate Identity Lab now collects evidence against it. No generator identity should be claimed as implemented until an approved implementation pass completes that narrative's remaining gates. |
| [Identity Lab](features/identity-lab.md) | Verified | A blue Development-labelled Lab workspace runs deterministic blind Map Type recognition sessions beginning with Lonely Oceans, Shattered Archipelago, Great Watersheds and Icehouse Earth; it retains exact recipes, human review and structural diagnostics as versioned JSON tied to the narrative guide. | Side-effect-free model, blind deck, reveal and navigation, local persistence, rejecting JSON import/export, summaries, in-interface guide, README, tests, Pages build and Alpine runtime were verified. This does not claim that the four narrative identities themselves are implemented. |

## Claim audit

Before reporting completion, distinguish behavioral, integration, persistence, rendering and compatibility claims. State limitations whenever an applicable layer is absent. Passing a build proves compatibility, not correctness.
