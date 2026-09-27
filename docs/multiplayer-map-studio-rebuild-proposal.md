# Multiplayer map studio: product brief and rebuild proposal

Date: 2026-09-26

The user's 27 September correction makes geography the source of player-inferred history. Earlier proposals for fictional-event authoring are superseded by [Geography before narrative](features/geography-before-narrative.md).

## Implementation authorization and amendments

The user authorized implementation on a branch without the `codex` prefix: `v2/map-studio`. Exact multiplayer starts are omitted from V2; earlier passages below recording that requirement and its investigation are historical and superseded. Generated exports remain ordinary geography-only maps. The user's visual-language reference is [inSANE](https://github.com/AngelaDMerkel/inSANE). Current implementation scope and evidence are tracked in [V2 map studio](features/v2-map-studio.md).

This document records the product decisions made during repository discovery and proposes an architecture and implementation sequence. The product decisions below come from the discussion; the architecture, defaults, and sequence are recommendations. No runtime feature is implemented or verified by this document. Existing feature records retain their current statuses until their contracts are deliberately revised.

## 1. Product purpose

Excogitare should help people create correct Civilization V maps for multiplayer games, then inspect, correct, and deliberately modify existing maps.

The initial compatibility target is Civilization V with all DLC, usually played by two to four humans. That typical group size is a testing priority, not a new restriction on map size or supported player counts. Additional gameplay mods have not been established as a requirement.

A successful generated map must support the experience its author requested: balanced competition, surprise, challenge, creative world building, or a deliberate combination. File validity, believable geography, and multiplayer usefulness are separate requirements.

### Agreed creation approaches

1. **Randomise everything:** choose a completely new configuration and generate a world. Do not silently preserve the last player count, size, balance settings, or other authoring choices. Sample compatible combinations from the supported settings.
2. **Randomise and refine:** start from a generated world and change its characteristics while retaining recognizable places.
3. **Detailed construction:** expose extensive controls for people who want them, including region or feature selection and sketching geographic intentions.

All three approaches use the same editable world and the same map-centred workspace.

### Agreed generation foundations

- **Gameplay-led:** design strategic relationships and progression, then realize them through plausible geography. Artificial arenas, symmetry, complete enclosures, or prescribed corridors are allowed when deliberately selected.
- **Geography-led:** create a world whose geography follows consistent physical causes, including highly unusual or fantastical worlds. Unusual geography still needs a coherent explanation.

These are product contracts. They do not require exactly two algorithms, and the current four engine names do not need to remain primary user choices.

### Agreed narrative scope

Worlds must also support geographic narratives involving significant human intervention, terraforming, catastrophe, and abandonment. User examples include a ruined world, a formerly barren world flooded through a human-directed comet, Eurasian lake systems and their chokepoints, flooded craters with surrounding walls, and barren landscapes with narrow thawed waters amid partially melted ice caps.

Physical coherence includes the consequences of those interventions. It does not require every landscape to look untouched or conventionally Earth-like. A circular crater rim or an engineered enclosure can have a valid explanation. The earlier concern about artificial mountain rings concerns forms that fail to express a convincing geographic or authored cause.

These narratives belong in map creation. Standalone Scenario authoring remains deferred. The recommended representation below lets a narrative shape either generation foundation; a separate third engine is not required by the user's request.

### Agreed controls and behavior

- Balance is configurable: comparable starts, broader strategic opportunity, and strict geometric equivalence are all valid choices.
- Numeric geography controls express ranges rather than exact tile quotas.
- Generation should use constraints, search several new worlds, and attempt iterative improvements when the initial worlds fall short.
- Refinement should keep recognizable continents, seas, ranges, and other places while changing the requested properties and recomputing affected systems.
- Users should be able to specify exact multiplayer start positions within the capabilities of Civ V. This is an in-game outcome that still needs to be proven.
- Imported maps should support correction of invalid terrain and illegal features, with optional rebalancing and other deliberate edits.
- Generation quality takes priority over short waiting times. Long operations must remain understandable and cancellable; this does not imply an endless search.
- Detailed controls should be accessible without dominating the everyday interface.
- Standalone Scenario authoring is deferred. Identity Lab belongs in development tooling. Projects, history, starts, editing, and repair remain part of the main product.

## 2. Accepted examples of the intended design space

These seven proposals were accepted as useful approaches. They are an initial set of reference designs, not a limit on variety or a decision to discard all existing map concepts. The user subsequently identified the current Watersheds generation, named **Great Watersheds** in the catalogue, as their favourite. It is the primary existing positive reference for the rebuild.

| Foundation | Recipe | Essential outcome |
|---|---|---|
| Gameplay | Narrow Passes | Substantial homelands separated by irregular mountain systems, with a configurable number and width of meaningful approaches. |
| Gameplay | Ocean Divides | Viable local worlds separated by deep seas, with a deliberate change in contact and movement opportunities when ocean travel becomes available under the game rules. |
| Gameplay | Inland Sea Crossroads | An irregular inland sea makes coastal settlement, straits, peninsulas, and competing land and naval routes strategically important. |
| Gameplay | Contested Heartland | Viable home territories lead through several approaches toward valuable shared country; the physical expression may be a basin, plateau, or lake district. |
| Geography | Colliding Plates | Related uplift, foothills, valleys, erosion, rain shadows, and drainage produce the final landscape. |
| Geography | Drowned Shelves | Islands emerge from a partly submerged parent landscape, retaining coherent shelves, channels, and landform ancestry. |
| Geography | Glacial World | Cold conditions and geographic causes explain the distribution of ice, habitable regions, difficult expansion, and resources. |

### Existing positive reference: Great Watersheds

The user values all of the identified qualities: the rivers and lakes, overall landforms, varied terrain, apparent gameplay possibilities, and how those elements fit together. Great Watersheds is therefore a reference for the complete geographic composition. This preference does not by itself prove multiplayer balance or in-game compatibility.

The current [Great Watersheds design](features/map-type-narrative-identities.md#great-watersheds) organizes geography around large drainage basins, upland divides, branching rivers, lakes, and productive lowlands. The catalogue currently routes it through Eccentric; that implementation detail does not determine its placement in the rebuilt interface.

Before replacing this generation path, capture representative existing outputs with their complete recipes and seeds. Compare new outputs with those references through user review, alongside hydrology, legality, and refinement checks. Review all five valued aspects together: water systems, landforms, terrain variety, apparent gameplay opportunities, and their overall coherence. Matching river counts or achieving a stronger automated score alone is insufficient evidence that the favourite map's qualities survived.

Use Great Watersheds as the first geography-led reference in the complete editing workflow, alongside the gameplay-led Narrow Passes example. Keep Colliding Plates and the other accepted proposals in the broader design space. The intent is to carry forward an existing strength while developing the new architecture.

### Additional narrative references supplied by the user

The following are interpretations to guide design, with working names rather than fixed catalogue entries:

| Narrative | Geographic expression to develop |
|---|---|
| Abandoned Terraforming | A world retains altered basins, cut passages, diverted drainage, engineered shorelines, or traces of former habitation. Erosion, flooding, and ecological recovery express the time since abandonment. |
| Comet Flood | Begin with a recognizable barren landscape, apply the selected intervention and water conditions, and flood its depressions. Former uplands, breached divides, drowned valleys, and new waterways preserve evidence of the earlier world. |
| Eurasian Lake Crossroads | A geographically inspired system of large inland waters, surrounding dry country, river-fed basins, narrow land connections, and consequential passages. The degree of fidelity to real locations remains a design choice. |
| Flooded Craters | Basin water, surviving crater rims, breaches, surrounding barren land, and associated drainage produce recognizable impact landscapes. Rim continuity and erosion can vary without erasing the premise. |
| Thawing Ice Cap | Extensive ice and barren land frame narrow thawed margins, channels, lakes, or partially opened seas. Relief, the selected climate conditions, and meltwater pathways explain the distribution of water. |

Recommend representing a narrative as a starting landscape plus an ordered set of causes and transformations. An ordinary preset supplies a complete history automatically. Advanced controls could expose event location, extent, severity, sequence, and time since the event; an explicit history editor remains a UI proposal rather than an agreed requirement.

For example: **barren basins → human-directed comet intervention → flooding → erosion and drainage adjustment → present-day settlement opportunities**. Changing the flood extent should expose or submerge the same underlying landscape and recalculate its consequences. A physical approximation should state the conditions it assumes without claiming an astrophysical simulation.

Retain the original and transformed features needed to make subsequent refinement coherent. Narrative evaluation should inspect visible consequences: which old valleys flooded, which rims remain, where water can escape, and how routes changed. A story label, a fallout scatter, or a retained event record alone does not establish that the world expresses the premise.

Separate geographic traces that can be realized in ordinary game tiles from cities, routes, improvements, or scripted behavior that require additional export support. Each supported narrative must state how it appears in the exported map. A previewed ruin cannot be counted as an exported feature unless the chosen output actually preserves it.

Compatible ideas should compose. For example, Ocean Divides may control global separation while Narrow Passes governs movement within each continent. Composition must specify scope: a world-wide rule, a selected region, or a relationship between features. Two recipes cannot each silently replace the whole world.

Narratives can compose with these ideas too: a flooded crater may supply a contested interior lake, while a breach in its rim supplies a narrow approach. The final map must satisfy the combined physical, authored, and gameplay requirements without treating every circular form as an error.

The remaining current map types should be reviewed for useful gameplay and geographic ideas, then migrated into this model. Preserving thirty-three distinct labels is not an acceptance criterion established by this discussion.

## 3. Repository findings that affect the design

These are observations from source review and a limited live walkthrough, not a fresh verification of the entire test suite.

| Finding | Evidence | Consequence |
|---|---|---|
| Rendering, authoring state, file operations, generation jobs, repair, and most controls are concentrated in one approximately 4,200-line component. | [Viewer](../app/civ5-map-viewer.tsx) | A new layout alone would retain fragile coupling. Separate the document, operations, renderer, and panels. |
| The central generator is approximately 9,000 lines and combines engine dispatch, content placement, narrative obligations, candidate selection, and finalization. | [Generator](../lib/map-generator.ts) | Extract reusable algorithms behind explicit inputs and outputs; replace the orchestration and control model. |
| Climate refinement generates another world and samples its terrain and features onto the retained tile layout. | [Map design](../lib/map-design.ts), `regenerateMapStage` | Recalculate climate using the retained world's actual relief, water, and boundary conditions. |
| Several regional operations paint rectangular tile regions and then mark retained structure stale. | [Map design](../lib/map-design.ts), `applyStructureOperation` | Region selection and sketches should alter geographic intentions and recompute affected systems. Exact tile painting remains a separate tool. |
| The pass graph records dependencies, progress, and provenance, while computation remains largely inside the generator. | [Pass graph](../lib/generation-pass-graph.ts) | Make passes separately executable with cached inputs, invalidation, and real partial recomputation. |
| Current balance scoring mainly weights local tile and resource counts around proposed starts. | [Map analysis](../lib/map-analysis.ts) | Broader balance requires explicit measurements of travel, expansion, resource timing, defensibility, and strategic access. |
| Ordinary generated exports omit scenario start records. The fixed-start target is specified but unfinished. | [Civ5Map writer](../lib/civ5-map.ts), [export targets](features/game-export-targets.md) | Exact starts are an early compatibility investigation, not a UI checkbox that can be assumed to work. |
| The repository distinguishes automated checks from real game evidence, but the current manual matrix still has open load and multiplayer rows. | [Manual load matrix](../tests/fixtures/manual-civ5-load-matrix.md) | Preserve this distinction and obtain empirical evidence for the actual product workflow. |
| Some interface tests inspect source text and rendered labels. | [Rendered tests](../tests/rendered-html.test.mjs) | Keep useful assertions, but add interaction tests that demonstrate the requested workflows. |

The live default generation illustrated the fragmented success criteria: Review reported strong automated naturalism, weak narrative conformance, and poor multiplayer balance for the same result. This is evidence about the current presentation and one sample; it is not an assessment of every generator output.

## 4. Recommended rebuild boundary

Use a staged architectural rebuild with selective reuse. Keep the current application available during development. Preserve all unrelated working-tree changes. Following the user's 27 September instruction, make semantic commits on the development branch as coherent changes are completed and checked. Push only when explicitly requested.

### Candidates for reuse after focused verification

- Civ5Map parsing, structural inspection, metadata handling, and conservative modification of imported binary data.
- Hex geometry, river-edge encoding, rendering primitives, camera behavior, and useful map overlays.
- Project archive checks, hashes, migration mechanisms, downloaded bundles, and snapshot concepts.
- Worker execution, cancellation, progress, and atomic result installation.
- Useful geographic algorithms, deterministic utilities, placement rules, and adversarial tests.
- Existing recipe descriptions that express real geographic relationships or gameplay intentions.

### Rebuild or substantially restructure

- The authoritative authoring document and application state.
- Generation configuration and composition of requirements.
- Candidate search and improvement orchestration.
- Refinement and regional editing, including dependent-system recomputation.
- Balance evaluation and user-facing explanations of its scope.
- The workspace hierarchy, control grouping, and action semantics.

Retaining a module is not a claim that its behavior is already correct. For example, the current resource-legality record has a narrower verified scope than a comprehensive all-DLC rule catalogue. The rebuilt product needs rules grounded in the supported game data, including unknown-definition handling for imports.

## 5. The editable world

Introduce one versioned world document with explicit separation between:

1. **Author intent:** generation foundation, recipe components, geographic narrative and its assumed history, parameter ranges, match configuration, selected starts, sketches, local rules, and preservation requirements.
2. **Geographic state:** terrain-forming fields and retained objects such as continents, shelves, ranges, basins, water bodies, climate regions, and drainage networks, including the earlier landscape and transformation relationships needed for narrative refinement.
3. **Game realization:** the Civ V tiles, resources, features, and start plan produced from that state.
4. **Direct edits:** authored tile overrides and feature changes whose precedence is explicit.
5. **Derived reports:** validation, balance, constraint satisfaction, and export compatibility, each tied to the document revision that was evaluated.

Rendering and export read this document. React panel state does not own an independent copy of the world or recipe. View position, selection, and open disclosures remain presentation state.

Generated objects need stable identity across refinement so the editor can retain a particular inland sea or mountain range. Imported maps begin with the exact tiles and source bytes that exist. Inferred features are labelled as inferred; missing tectonic or climate history must not be fabricated as known fact. Reconstruction needed for a deeper edit should be previewed as a proposed interpretation.

Keep downloaded `.excogitare` files as the durable authoring format. Version the new world model and migrate old projects while retaining map snapshots and recoverable legacy data. Do not promise identical regenerated geography from old seeds under new algorithms. Preserve opaque imported file sections wherever supported editing can do so safely.

## 6. Constraints and generation

Distinguish hard requirements from preferences. Proposed defaults:

- **Hard:** game legality, explicitly fixed starts, required player count, selected output dimensions, explicit preservation locks, and defining relationships the user has chosen as mandatory.
- **Ranges:** water, relief, climate, resource abundance, and other numeric targets.
- **Preferences:** degrees of variety, organic appearance, route diversity, or balance beyond a required minimum.

An explicit range is still a bound. Do not silently widen it, reduce the player count, or remove a required sea to make a candidate pass.

Compile constraints before geography. Gameplay-led construction creates spatial requirements for homes, fronts, routes, contested regions, and progression. Geography-led construction starts from physical conditions. Both feed a coherent terrain, climate, hydrology, ecology, and game-content pipeline.

Narrative transformations enter this pipeline at the stages their consequences require. An impact or excavation changes relief and drainage; flooding changes coastlines, climate influences, and access; abandonment changes the surviving geographic traces according to the chosen history. Dependent passes must use the transformed world. World history is part of the generation model, separate from the editor's undo and revision history.

Physical models will necessarily be approximations at Civ V resolution. Their limits should be stated plainly, while their retained causes must agree with the final terrain. A score called naturalism is not evidence that a full physical simulation has occurred.

### Search and improvement

1. Detect contradictions that can be identified before generation.
2. Construct a small deterministic set of distinct candidate worlds under the constraints.
3. Reject illegal candidates and measure the remaining requirements separately.
4. Improve promising candidates by changing relevant causes or parameters, then rerun dependent stages.
5. Stop when requirements are met or additional search has ceased to make useful progress within a documented work budget.
6. Explain remaining conflicts and offer specific changes or further search. Never label an unmet hard requirement as satisfied.

Long searches retain the current accepted map, expose actual progress and cancellation, and install a complete result atomically. A rejected candidate may be inspected explicitly without becoming the active exportable world.

Balance should report opening quality, settlement and expansion capacity, resource access over the game, travel and contact, defensibility, naval opportunity, and team relationships separately. Strict symmetry is an explicit construction option. Deliberately asymmetric recipes must be evaluated against their intended roles rather than penalized automatically for departing from the average.

## 7. Refinement, sketching, and repair

The main action distinction is **Generate a new world** versus **Apply changes to this world**. Full Randomise remains a separate, clearly labelled operation.

For an existing world, determine which systems a change affects and recompute them against the retained world. For example:

- More rainfall retains continental shape and relief; moisture, biomes, runoff, rivers, ecology, and affected resource legality are reconsidered.
- A moved or raised range retains unrelated places; rain shadows and downstream drainage may change beyond the selected region.
- A sketched inland sea alters the selected basin and water connections; the climate and drainage consequences are recomputed.
- Increasing flooding or thaw in a narrative world modifies its retained pre-event landscape, preserves recognizable craters or basins, and recomputes water connections and affected systems.
- Rebalancing applies the selected fairness requirements and previews any changes to starts, resources, or geography that are needed.

Selections may target tiles, freehand regions, or recognized features. Sketches express intentions such as a range axis, basin extent, passage, or desired coast. They are interpreted by the generator instead of automatically becoming ruler-straight lines of mountain tiles.

Show both the edited area and consequential changes outside it. Explicit locks cannot be silently violated. Recommended default: preserve manual edits during unrelated operations and surface any conflict with a dependent recomputation.

Repair uses the same workspace and transaction history. Correct invalid terrain and illegal features through inspectable proposed fixes; explain any relocation or deletion required. Rebalancing is available as a deliberate operation. Preserve supported imported records and report unsupported definitions without guessing that they are illegal.

## 8. Map-centred interface

- **Canvas:** persistent and central, with layers, readable selection, feature inspection, and geographic overlays.
- **Creation panel:** recipe library, gameplay/geography foundation, narrative premises and optional history controls, composition, and grouped controls for world form, environment, match design, resources, and advanced parameters.
- **Contextual inspector:** properties and actions for selected tiles, regions, or features; the same place exposes relevant local controls.
- **Editing tools:** select, sketch, paint, place starts, and preserve. Expert depth remains accessible without requiring a separate application mode.
- **History and comparison:** reversible operations, named checkpoints, candidate browsing, and before/after or difference views.
- **Validation:** actionable findings linked to places on the map. Development diagnostics live behind a separate disclosure or developer surface.
- **File actions:** open map/project, save project, and export with an accurate account of what the chosen output retains.

Use the existing visual identity as an initial resource, while rebuilding hierarchy, wording, spacing, and interaction around these tasks. A new color palette alone cannot resolve the current product problems. The detailed visual design and exact panel placement remain implementation-design work, not decisions made by this brief.

## 9. Implementation sequence and evidence

Before substantial implementation, add the agreed rebuild and its bounded milestones to the [feature register](feature-implementation-reference.md). Reconcile superseded feature contracts explicitly instead of silently maintaining two contradictory definitions of success.

| Step | Deliverable | Evidence required to advance |
|---|---|---|
| 1. Multiplayer compatibility | A minimal known-good ordinary map and a focused exact-start investigation for the intended shared-file workflow. | Real multiplayer tests with documented game configuration, install path, matching artifacts, slot assignments, actual spawn coordinates, and restart behavior. Parser round trips alone are insufficient. |
| 2. World document and operations | Versioned state, import adapters, transaction history, persistent feature identity, and executable dependent passes. | Existing map/project round trips; immutable history; cancellation; failed operations retain the previous world; no fabricated imported evidence. |
| 3. First complete editing path | Great Watersheds and Narrow Passes examples in the new map-centred shell, with selection, a range sketch, refinement, and export. | A user can create a recognizable world, change relief or rainfall, inspect resulting drainage and resource changes, undo, save, reopen, and export. Compare Watersheds with captured existing outputs and obtain user review of the qualities worth preserving. |
| 4. Composition and balance | Ocean Divides combined with local Narrow Passes, scoped recipe components, configurable balance requirements, and a first narrative transformation such as flooding a retained basin or crater. | Intended route and progression relationships survive finalization, wrapping, different rosters, refinement, and game export where the format supports them. Before/after narrative comparisons demonstrate changed water access and preserved underlying landforms. Test actual multiplayer starts separately. |
| 5. Broader authoring and import repair | Remaining accepted recipes and user-supplied narrative references, deeper regional tools, illegal-placement repair, and optional rebalance. | Representative imported and generated workflows, range compliance, feature preservation, narrative consequences, projected versus actual output distinctions, and in-game edited-map checks. |
| 6. Product transition | Replace the old navigation, move Lab to development, defer Scenario authoring, migrate projects, and reconcile help and feature records. | Required regressions, interaction checks, lint, types, production and Pages builds, and Alpine runtime check when available, plus human map review and representative multiplayer sessions. |

A few high-quality recipes in step 3 establish the architecture; they are not completion of the full agreed design space. The seven accepted proposals, the existing Great Watersheds reference, the additional narrative examples, and composability remain part of the broader plan.

### Exact-start decision

The current generated `.Civ5Map` writer does not export the proposed start plan. Determine whether the desired start behavior can be represented and respected through the normal multiplayer map path. If it cannot, document the limitation and present a concrete alternative transport and installation workflow for the user to evaluate. Do not silently introduce a mod dependency or treat a script as an already accepted replacement for the requested map file.

Independent work on the world model and editor can proceed while real multiplayer testing is arranged, but competitive fixed-start claims remain open until proven. General game validity, exact starts, and fairness are separate acceptance outcomes.

## 10. What remains to be learned through implementation

The product direction is sufficiently defined for a staged rebuild proposal. Remaining work is principally technical and empirical:

- Actual Civ V multiplayer behavior for authored starts and seat assignments.
- Which old algorithms meet the new geographic expectations and which should be replaced.
- How much continuous geographic state is needed for convincing, efficient regional recomputation.
- Appropriate search budgets, improvement operators, and feasibility explanations.
- Which fairness measurements correlate with good human multiplayer sessions.
- How well the proposed maps communicate their intended geography and gameplay after people inspect and play them.

These should be answered with small working examples, artifacts, and play evidence. They should not be converted into a growing collection of untested controls or self-reported success scores.
