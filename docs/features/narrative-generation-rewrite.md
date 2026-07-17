# Narrative Generation Rewrite

## Status and purpose

- **Status:** Groundwork; proposed architecture awaiting review.
- **Purpose:** Coordinate the Narrative Map Type implementation, generation-model expansion and Create/Lab workflow changes as one deliberate rewrite rather than a sequence of controls attached to incompatible assumptions.
- **Current limitation:** This document is a plan. Except where it explicitly describes the present baseline, none of the proposed models or workflows should be described as implemented.
- **Primary references:** [`map-type-narrative-identities.md`](map-type-narrative-identities.md), [`world-character.md`](world-character.md), [`workspace-navigation.md`](workspace-navigation.md), [`identity-lab.md`](identity-lab.md), the current generator and retained-structure modules, and the Civ V legality/Repair rules.

This plan is intended to be revised through discussion before substantial runtime implementation. Every phase must update this record with requirements, evidence and honest status rather than allowing the plan to become an obsolete wish list.

## Desired outcome

Excogitare should become a serious world-authoring system rather than a collection of unrelated generator switches. A user should be able to:

1. express the geographic narrative, physical scope, surface ecology and intended match;
2. generate a deterministic world through visible retained passes;
3. refine the result without needlessly rebuilding its topography;
4. compare generations without being thrown into another stage;
5. protect chosen geography while regenerating everything else;
6. edit individual tiles or coherent structures;
7. understand narrative fidelity, match suitability and Civ V validity before export; and
8. retain enough recipe and provenance data to reproduce the work.

Complexity and compute time are acceptable when they produce materially stronger geography. They are not acceptable when they merely add noise, retry the same weak architecture, conceal a failed premise or freeze the browser without progress and cancellation.

## Non-goals and hard boundaries

- The rewrite does not alter Civ V's engine, AI or victory rules. Match Intent shapes geography and evaluates likely suitability; it cannot guarantee how a particular lobby or mod will play.
- Human and AI slot counts are authoring assumptions. A normal Civ V lobby may reassign slots after export unless the user creates a fixed scenario.
- Intended victories bias opportunity and validation. Excogitare must not make other enabled victories impossible merely to optimize one selection.
- Scale is not a synonym for Map Size. Map Size remains the tile budget; Scale describes how much of the imagined world those tiles represent.
- Archetype is not another Map Type or World Character. It repaints environmental expression while preserving topographic structure by default.
- Protection does not make invalid Civ V data legal. A protected conflict must be disclosed and block the relevant operation or export rather than being silently overwritten.
- Passing automated narrative metrics does not prove that a map is recognizable. Identity Lab evidence remains necessary.

## Current architecture: useful foundations and blocking assumptions

### Foundations to retain

- Four distinct engines already produce deterministic maps from stable `MapPresetId` values.
- Eccentric and Physical retain geographic objects and multi-pass diagnostics.
- Polis constructs a strategic graph, protects safe territories and required routes, and validates that graph before terrain.
- Generation history retains thirty complete maps.
- Selective World, Climate, Rivers, Content and Starts passes already exist.
- Create has separate Design, Iterate, Edit and Review stages.
- Repair enforces Civ V legality, accessibility, start correctness and river validity.
- Identity Lab already has versioned deterministic evidence, local persistence and rejecting import behavior.
- Generation runs in a worker and can preserve the canvas view while maps change.

### Assumptions the rewrite must replace

- `MAP_PRESETS` currently combines the display catalogue, default numbers and only a thin amount of narrative behavior.
- A Map Type can presently be little more than an engine preset; there is no authoritative runtime narrative contract.
- Polis knows player count and team grouping, but not intended human/AI composition or victory priorities.
- Climate, resources and players are mixed into Design even when the user wants to refine an existing topography.
- Selective regeneration replaces complete layers and has no user-authored protection mask.
- Opening a history entry explicitly switches Create back to Design.
- Lab uses a finite manually navigated deck, broad dropdown guesses and a reveal workflow instead of a continuous four-choice recognition loop.
- Map Size, spatial frequency and planetary assumptions are entangled. A generator usually behaves as though every canvas depicts a complete world.
- The existing `eccentricExtreme` choices approximate a few surface themes but are engine-specific and cannot repaint imported or retained topography.
- Retained structures do not yet contain narrative objectives, scale context, protection data, match intent, pass provenance or weakened-identity findings.

---

# Authoring grammar

Every generated result should be readable as the following contract:

> **Engine** determines how geography is constructed. **Narrative Map Type** determines the geographic story. **Scale** determines how much of the imagined world is visible. **World Character** determines the story's tone. **Archetype** determines the environmental coat. **World Modifier** introduces an event or condition. **Match Intent** determines who is expected to play and which strategic opportunities matter. **Explicit controls and protected areas** define what the system may not reinterpret.

| Concept | Question it answers | Examples | Authority |
| --- | --- | --- | --- |
| Generation Engine | How is the world constructed? | Excogitare, Eccentric, Physical, Polis | Owns the construction method and retained passes. |
| Narrative Map Type | What geographic story must be visible? | Broken Pangaea, Great Watersheds, Imperial Ring | Owns motifs, anti-motifs, topology objectives and identity diagnostics. |
| Scale | How much of the imagined world do these tiles represent? | Global, Continental, Regional, Provincial, Local | Owns feature frequency, boundary assumptions and spatial interpretation. |
| World Character | In what tone is the narrative expressed? | Realistic, Fantastical, Mundane, Brutal | Reinterprets but cannot erase the narrative verb. |
| Archetype | What environmental coat covers the topography? | Jungle, Arrakis, Hoth, Volcanic | Owns climate envelope, terrain palette, compatible features and resource ecology. |
| World Modifier | What additional event or condition complicates the world? | Strategic Depth, Fractured World, Doomsday | Adds a secondary rule without replacing the narrative. |
| Match Intent | Who will play, and what strategic outcomes should the geography support? | 2 humans + 6 AI; Science and Diplomacy emphasis | Shapes Polis topology and informs starts, content, validation and Review in every engine. |
| Explicit controls | What numerical or categorical request is authoritative? | Water, mountains, rainfall, resource abundance | May weaken the selected narrative; weakening must be reported. |
| Protection | What existing authored data must not change? | A mountain chain, river valley, capital region | Constrains regeneration and produces conflicts rather than silent overwrites. |

## Control precedence

When requirements conflict, the generation compiler should use this order:

1. complete tile budget, valid data and Civ V file constraints;
2. accessibility and required start-location correctness;
3. protected authoring data, with blocking conflict behavior when protection itself is illegal;
4. explicit user settings;
5. Scale boundary conditions;
6. Narrative Map Type mandatory relationships;
7. Match Intent feasibility;
8. World Character, Archetype and World Modifier interpretation;
9. preset defaults and random variation.

The compiler may not silently change a higher-priority request to improve a lower-priority score. Review should say which premise weakened, why it weakened and which influence became dominant.

---

# Part 1 — Match Intent and Polis

## Architectural decision

Polis is the correct engine in which to make Human/AI composition and victory intent topologically meaningful because it already constructs the strategic graph before terrain. The controls themselves should live in **Refine → Players and Match**, not inside the Polis engine card. This preserves a coherent authoring model:

- Polis consumes Match Intent while creating nodes, routes, objectives and protected strategic regions.
- Excogitare, Eccentric and Physical consume it later for start placement, content distribution, balance analysis and validation.
- Review uses the same contract for every engine.

## Proposed Match Intent model

```ts
type SeatControl = "HUMAN" | "AI" | "FLEXIBLE";
type VictoryCondition = "DOMINATION" | "SCIENCE" | "CULTURE" | "DIPLOMACY" | "TIME";

type MatchIntent = {
  version: 1;
  humanPlayers: number;
  aiPlayers: number;
  seatControls?: SeatControl[];
  enabledVictories: VictoryCondition[];
  emphasizedVictories: VictoryCondition[];
  teamIntent: "FREE_FOR_ALL" | "FIXED_TEAMS" | "FLEXIBLE";
  competitiveStrictness: "CASUAL" | "BALANCED" | "TOURNAMENT" | "ASYMMETRIC";
  aiAccommodation: "NORMAL" | "STRONG";
};
```

The default remains flexible: all requested major slots are usable by either humans or AI, every ordinary Civ V victory remains feasible, and no start is secretly weakened because the author marked it as AI-controlled.

## Human/AI consequences in Polis

AI accommodation should affect structures the Civ V AI can realistically navigate, not grant hidden yield bonuses:

- wider primary corridors and invasion fronts;
- additional route redundancy around decisive chokepoints;
- fewer plans that depend entirely on a one-tile canal, embarked shortcut or remote naval landing;
- clearer expansion basins and less deceptive false proximity around AI starts;
- reachable strategic resources without requiring a single brilliant city placement;
- city states distributed where AI and humans can contest them rather than in private pockets;
- capital routes that remain legible after ordinary border growth; and
- explicit warnings when an extreme Map Type necessarily exceeds the AI accommodation target.

Human-designated starts may receive more strategically demanding geography only when the author explicitly assigns seats. Merely entering “two humans” must not quietly identify two privileged or punished positions when player assignment remains flexible.

## Victory-condition consequences

| Victory | Geographic requirements | Review evidence |
| --- | --- | --- |
| Domination | Every capital eventually reachable; plural invasion theatres; meaningful reinforcement routes; no single mandatory one-tile gate unless explicitly requested. | Capital contact graph, route redundancy, front width, reinforcement stretch and naval dependency. |
| Science | Every role has plausible production, growth and late strategic access; Tall and Wide routes remain viable. | City capacity, production potential, Aluminum/Uranium/Oil access and expansion ceiling. |
| Culture | Defensible development regions, external contact and trade access without universal isolation. | Core defensibility, trade connectivity, archaeology distribution and pressure routes. |
| Diplomacy | City states remain plural, reachable and contestable; no player receives a private bloc by accident. | City-state access graph, travel parity, coastal dependency and regional monopoly warnings. |
| Time | Long-run population, settlement and production potential are not catastrophically concentrated. | Territory capacity, workable value, late production and cumulative expansion opportunity. |

These are feasibility reports, not one opaque balance score. Emphasis changes the candidate-selection weights and Review explanation; it does not disable the other enabled conditions.

## Polis Map Type integration

Imperial Ring, Opposing Fronts, Contested Heartland and Rival Continents must be rebuilt against Match Intent. The accepted Three Realms, Thalassic League and Unequal Realms types should enter the runtime catalogue during this phase rather than remain documentation-only.

- **Imperial Ring:** human/AI accommodation changes spoke width and lateral alternatives; victory intent changes the value and composition of the shared axle.
- **Opposing Fronts:** team intent is mandatory; AI accommodation prevents the entire war from depending on one brittle breach.
- **Contested Heartland:** victory intent determines whether the centre emphasizes capitals, strategic production, archaeology, city-state diplomacy or mixed objectives while preserving many-to-many access.
- **Rival Continents:** naval competence and AI accommodation govern the number and width of sea and highland hinge theatres.
- **Three Realms:** requires valid three-team counts and ensures every realm borders both rivals.
- **Thalassic League:** emphasizes redundant sea lanes and port networks; AI accommodation prevents isolated coastal starts from requiring advanced naval judgment to survive.
- **Unequal Realms:** uses explicit Tall, Wide, War and Turtle role contracts. It remains intentionally asymmetric and must never be selected by ordinary competitive Randomise without disclosure.

## Failure behavior

- Impossible human + AI totals are normalized visibly against requested major slots.
- A team Map Type with incompatible team counts blocks generation or offers a disclosed count adjustment; it does not silently pretend parity.
- If Scale, geometry, water or protected terrain cannot satisfy required routes, Polis reports the failed constraint and proposes which control to relax.
- Scenario export may retain intended seat metadata only where the Civ5Map scenario format supports it. The recipe and Review report remain the authoritative intent record.

---

# Part 2 — Runtime Narrative Map Types

## Authoritative profile registry

The prose identity guide should be translated into an exhaustive profile registry keyed by stable `MapPresetId`. Profiles describe contracts; engines supply the algorithms.

```ts
type NarrativeProfile = {
  version: 1;
  id: MapPresetId;
  label: string;
  engine: GenerationEngine;
  verb: string;
  premise: string;
  preferredScales: WorldScale[];
  allowedScales: WorldScale[];
  parameterEnvelope: NarrativeParameterEnvelope;
  requiredMotifs: NarrativeMotif[];
  forbiddenMotifs: NarrativeMotif[];
  topologyProgram: NarrativeTopologyProgram;
  surfaceBiases: NarrativeSurfaceBiases;
  gameplayContract: NarrativeGameplayContract;
  diagnostics: NarrativeDiagnosticDefinition[];
  nearestConfusions: MapPresetId[];
  blindRecognition: string;
};
```

Every one of the thirty current and three approved Polis types requires a complete profile. The registry must fail type checking if any `MapPresetId` is absent or duplicated.

## Narrative compilation model

Narrative Map Types should not paint a few final tiles after an engine has already decided the world. Each profile compiles a retained **narrative skeleton** before engine realization:

1. **Intent normalization:** resolve Scale, Map Size, geometry, wrap, Match Intent, explicit controls and protection conflicts.
2. **Narrative skeleton:** create required regions, relationships, barriers, routes, basins, arcs, scars, transects, hearts or strategic roles at the chosen Scale.
3. **Engine realization:** Excogitare fields, Eccentric graphs, Physical processes or Polis strategic topology realize that skeleton in their own architecture.
4. **Relief and drainage:** build accessible mountain systems, continuous watersheds and outlets while preserving narrative relationships.
5. **Climate and Archetype:** solve climate at the chosen Scale, then apply the selected environmental coat without erasing protected or narrative-critical structures.
6. **Modifier:** apply the secondary world condition through named, limited consequences.
7. **Content and Match Intent:** place wonders, resources, sites, majors and city states against the narrative and victory contracts.
8. **Legality and accessibility:** enforce Civ V placement, start, passability, river and scenario rules.
9. **Narrative assessment:** report motif completion, anti-motif violations, nearest-confusion evidence and weakened premises.
10. **Provenance:** retain pass versions, deterministic sub-seeds, effort level, relaxations and diagnostics with the result.

## Engine responsibilities

- **Excogitare:** expressive continuous fields, warped coastlines and broad procedural forms. Its profiles need explicit topology objectives so distinct types do not collapse into different noise parameters.
- **Eccentric:** dense cells, parent graphs, navigation basins, regional laws, boundary ranges and hierarchical rivers. Each type needs a different graph grammar rather than an alias to the same topology.
- **Physical:** retained chronology and physical causality. Profiles specify different geological/climatic histories, and the engine simulates the consequences rather than decorating a common continent mask.
- **Polis:** strategic node-and-edge contracts. Terrain disguises the board-game structure without breaking its required routes or roles.

## Identity assessment

Every generated map should retain a `NarrativeAssessment` containing:

- required motif results with measured evidence;
- anti-motif violations;
- parameter-envelope deviations;
- weakened or absent identity statements;
- nearest-confusion comparisons;
- Match Intent feasibility findings;
- legality and accessibility relaxations; and
- an explanatory summary suitable for Review and Lab export.

There may be a summary grade for sorting candidate batches, but the interface must show the component evidence. An attractive map that strongly resembles another type should be identified as attractive-but-wrong rather than rewarded for generic quality.

## Candidate search and effort

Some narratives require several attempts at their retained skeleton. Add **Generation Effort** under advanced Design controls:

- **Standard:** one complete candidate plus bounded corrective passes.
- **Thorough:** several deterministic skeleton candidates, retaining the best lawful Pareto result.
- **Exhaustive:** a larger deterministic search with stricter motif fulfillment and a clear time/memory warning.

Candidate ranking should consider legality first, then narrative requirements, Match Intent and map quality as separate dimensions. It must not collapse every concern into one number or change results nondeterministically with machine speed.

## Narrative implementation waves

1. **Recognition benchmarks:** Lonely Oceans, Broken Island Chains, Great Watersheds and Glacial World.
2. **Excogitare catalogue:** Crooked Continents, Broken Pangaea, Drowned Shelves, Lake Kingdoms, Island Continents, Deep-Ocean Divides, Land and Sea Maze and Patchwork Provinces.
3. **Eccentric catalogue:** Ecological Transect, Plate-Built Continents, Great Watersheds, Inland Sea Crossroads, Wonder Heartlands, Encircled Seas, Scarred Pangaea, Rift Lattice, Lonely Oceans, Great Peninsulas and Broken Island Chains.
4. **Physical catalogue:** Dynamic Earth, Colliding Plates, Ancient Continental Shields, Volcanic Island Arcs, Inland Supercontinent, Monsoon Continents and Glacial World.
5. **Polis catalogue:** all seven strategic types, Match Intent and role-aware Review.

An implementation wave is incomplete until every type in it has deterministic fixtures across representative Scale, Character and control conflicts; structural diagnostics; Lab choices; legality coverage; interface help; Randomise behavior and documentation.

---

# Part 3 — Create becomes Design → Refine → Iterate → Edit → Review

Create remains non-linear. The five stages are workspaces for different kinds of decisions, not wizard gates.

## Design

Design answers: **What world should be built?**

Retain the current Design contents except the present numbered sections 2, 3 and 4. Its normal flow becomes:

1. Randomise.
2. Generation Engine carousel.
3. Narrative Map Type.
4. World Character.
5. Scale.
6. Archetype for the initial surface treatment.
7. Map Size and seed.
8. Existing World Shape section: projection, modifier, wrap, geometry, water, mountains and its engine-specific world-architecture controls.
9. Generation Effort under advanced controls.
10. Generate Map with a concise compiled-recipe summary and disclosed conflicts.

Selecting a Narrative Map Type may recommend Scale, wrap, water and mountain envelopes. It may not silently overwrite a deliberate explicit value. Recommendations should have one-click application and a visible “identity weakened” state when ignored.

## Refine

Refine answers: **How should this topography be inhabited, surfaced and balanced?**

Move the existing sections into this order:

1. **Surface and climate:** current Climate and Terrain controls, Archetype intensity and repaint behavior.
2. **Resources and wonders:** existing content controls, placement rules, barbarians and ruins.
3. **Players and Match:** majors, Human/AI intent, teams, city states, starts, balance profile and intended victories.
4. **Apply refinement:** Climate, Surface, Content and Starts can be previewed and applied independently to the current topography.

Refine must work on generated and imported maps. Imported maps begin with `Archetype: Existing` and no inferred generation recipe beyond defensible diagnostics. Applying a coat creates a history entry and a Difference preview before replacement.

Changing Refine controls should not rebuild land or elevation unless the user explicitly selects a dependent World pass. A blocking explanation should replace silent dependency expansion.

## Iterate

Iterate answers: **Which generation or revision should become the next branch?**

- generation history remains visible and may be clicked repeatedly without leaving Iterate;
- the active history item is distinct from the latest item;
- restoring an old result creates no mutation until the user edits or regenerates it;
- the first new operation from an older result creates a child branch with `parentId` provenance;
- candidate batches compare narrative fidelity, Match Intent, legality and balance as separate columns;
- named checkpoints and Difference view remain available;
- selective regeneration displays protection coverage and conflicts before running; and
- view position, zoom, layers, comparison mode and Iterate stage persist while browsing.

## Edit

Edit answers: **What should the author change or protect directly?**

Retain Tile Brush, Flood Fill, Region, World Structure and Start Positions. Add **Drag to Preserve** as a first-class edit tool with its own overlay, brush size, layer choices, region conversion and erase mode.

## Review

Review answers: **Does this result express the intended world and survive Civ V?**

Review should contain five independent reports:

1. Narrative Identity.
2. Match Intent and victory feasibility.
3. Multiplayer/start balance.
4. Civ V legality and Repair findings.
5. Recipe, provenance, weakened controls and export readiness.

Export confirmation remains a modal. It should distinguish blockers, accepted warnings, intended asymmetry and protected conflicts rather than presenting one undifferentiated list.

## Stage-state rules

- Only an explicit stage-tab action changes the current Create stage.
- Generate, Randomise, opening history, opening a candidate, restoring a checkpoint, selective regeneration and applying a refinement all remain in the current stage unless the user chooses otherwise.
- Each stage retains its own expanded sections, scroll position and temporary selections where practical.
- Switching workspaces preserves the Create stage and all map/view state.

---

# Part 4 — Scale and Archetype

## Scale

```ts
type WorldScale = "GLOBAL" | "CONTINENTAL" | "REGIONAL" | "PROVINCIAL" | "LOCAL";
```

Scale changes spatial interpretation rather than dimensions:

| Scale | Meaning | Generator consequences |
| --- | --- | --- |
| Global | Most or all of a planet. | Planetary wrapping, broad latitude/circulation, multiple continental systems, compressed local detail and global navigation relationships. |
| Continental | One major continent or a small continental system. | Partial latitude band, meaningful edge oceans, several geological provinces, complete great watersheds and more detailed coasts. |
| Regional | Several connected countries, basins or seas. | External climate boundary conditions, detailed mountain fronts, river hierarchies, deltas and strategic corridors. |
| Provincial | One subcontinental theatre or major province. | A few complete landforms, one or two dominant watersheds, detailed passes and denser settlement relationships. |
| Local | A valley, island group, metro-scale scenario region or tactical landscape. | No pretence of global climate; explicit inflow/outflow edges, high-resolution terrain, local drainage and strict population-capacity checks. |

Map Size remains independent. Examples:

- Standard + Global: a comparatively coarse whole planet.
- Huge + Local: a highly detailed local theatre.
- Small + Continental: a simplified continent.
- Colossal + Regional: an unusually detailed strategic region, subject to the existing Game-Breaking warning.

### Scale-aware systems

Scale must affect:

- motif sizes, counts and spacing;
- coastline and relief spatial frequency;
- river order, source assumptions and boundary outlets;
- climate gradients and whether poles/equator are present;
- wrap recommendations;
- start density and city-state capacity;
- resource deposit scale;
- Narrative Map Type compatibility and weakening diagnostics; and
- renderer labels/legends where relevant.

Projection remains meaningful at Global and sometimes Continental scale. Regional, Provincial and Local maps use an environmental boundary condition rather than pretending that the visible top and bottom are planetary poles.

## Archetype

Archetype is a reusable environmental treatment that can be applied during initial generation or later to existing topography.

```ts
type WorldArchetype =
  | "EXISTING"
  | "NARRATIVE_DEFAULT"
  | "TEMPERATE"
  | "JUNGLE"
  | "ARRAKIS"
  | "HOTH"
  | "MONSOON"
  | "MEDITERRANEAN"
  | "STEPPE"
  | "SAVANNA"
  | "MARSHLAND"
  | "VOLCANIC"
  | "JURASSIC"
  | "POST_COLLAPSE"
  | "FALLOUT_WASTES";
```

Proposed initial meanings:

- **Existing:** retain the current terrain and features; appropriate for imports.
- **Narrative default:** let Map Type and Character select the coat.
- **Temperate:** mixed grassland, plains, forest and ordinary rainfall.
- **Jungle:** warm wet lowlands, dense jungle belts, marshes and powerful river ecology.
- **Arrakis:** extreme aridity, desert dominance, rare habitable river/oasis corridors and concentrated value.
- **Hoth:** snow and tundra dominance with scarce refuges and valuable frozen frontiers.
- **Monsoon:** strong wet/dry contrast, mountain-fed rivers, floodplains and leeward interiors.
- **Mediterranean:** dry summers, coastal fertility, scrubby uplands and compact productive basins.
- **Steppe:** open plains, dry grasslands, long movement corridors and sparse forests.
- **Savanna:** seasonal grassland, scattered woodland and river-dependent fertility.
- **Marshland:** saturated lowlands, deltas, shallow basins and difficult wet movement.
- **Volcanic:** young dark relief, fertile margins, geothermal landmarks and strategic geology.
- **Jurassic:** hot wet abundance, dense forests and dramatic biological productivity.
- **Post-Collapse:** roads, ruins, abandoned city sites and environmental recovery without mandatory fallout.
- **Fallout Wastes:** sparse fallout, ruins, broken roads and hostile but legal settlement pockets.

The public fictional labels Arrakis and Hoth should receive generic stable IDs and should be reviewed before release if the project later needs stricter intellectual-property naming. Their functional definitions must never depend upon external copyrighted assets or text.

### Archetype application contract

By default, Archetype may change:

- climate fields;
- land terrain types;
- ordinary biome features;
- compatible resource tendencies;
- eligible natural-wonder weighting; and
- descriptive diagnostics.

By default, it may not change:

- land versus water;
- elevation;
- river edges and outlets;
- map dimensions, wrap or projection;
- starts, cities, routes or ownership; or
- protected fields.

Offer **Hint**, **Strong** and **Transformative** intensity. Transformative may request dependent hydrology/content passes, but it must preview those consequences. “Preserve topography” is on by default.

---

# Part 5 — Continuous four-choice Identity Lab

## New user flow

1. Enter Lab and start or resume a session.
2. Lab deterministically selects a target Narrative Map Type and generates an unlabeled map.
3. Four possible Map Types appear below the map. Exactly one is correct; three are plausible nearest confusions.
4. The user selects one option.
5. The answer, choice order, response time, exact recipe and diagnostics are recorded.
6. The next map is already prefetched and appears automatically with four new choices.
7. The loop continues without a fixed deck length until the user selects **End and export**.
8. End and export produces a session summary and versioned JSON evidence.

The default continuous mode should not reveal correctness between candidates because immediate teaching biases later recognition. The final summary reveals answers and confusion patterns. A future explicitly labelled Learning mode may provide immediate feedback, but it must not be mixed with blind research evidence.

## Choice construction

- Use the profile's `nearestConfusions` first.
- Prefer choices from the same engine where the distinction is supposed to be geographic rather than architectural.
- Include cross-engine confusions when the narrative guide names them.
- Never present duplicate labels or omit the correct answer.
- Shuffle option positions deterministically and track positional bias.
- Balance target frequency over the session without requiring a finite prebuilt deck.
- Adjust future sampling toward frequently confused pairs while retaining baseline coverage.

## Endless-session storage

“Endless” should not mean unbounded map snapshots in memory. Retain:

- the current map and one prefetched map;
- compact recipe, choices, answer, timing and diagnostics for prior trials;
- aggregate counts incrementally; and
- resumable session state in IndexedDB.

The JSON export can reproduce every trial from its deterministic recipe without embedding every Civ5Map binary.

## Schema migration

- Introduce Identity Lab schema v2 for trials and four-choice sessions.
- Continue importing schema v1 as an archived finite review session.
- Never reinterpret v1 confidence/cue data as four-choice timing evidence.
- Invalid or future schemas remain rejecting and cannot replace the active session.

## Lab metrics

- first-choice accuracy by identity;
- confusion matrix and directional confusion;
- response time by identity and pair;
- character, scale and archetype effects;
- weakened-identity rate;
- option-position distribution;
- accuracy before and after repeated exposure, marked as observational rather than scientific proof; and
- stable-seed comparison across generator versions.

---

# Part 6 — Iterate continuity and Drag to Preserve

## History continuity

The immediate defect is explicit: opening a history entry currently calls `setCreateView("GENERATE")`. The rewrite must remove all operation-driven stage changes and add a regression test proving repeated history selection remains in Iterate.

History entries should gain:

- `parentId` and operation provenance;
- Narrative Assessment summary;
- Match Intent summary;
- protection coverage;
- optional thumbnail generated without storing a second full-resolution map;
- active, latest and branched visual states; and
- a deliberate “Use as Design recipe” action for the rare case where the user actually wants to return to Design.

## Protection model

```ts
type ProtectionChannel =
  | "TOPOLOGY"
  | "ELEVATION"
  | "CLIMATE"
  | "FEATURES"
  | "HYDROLOGY"
  | "CONTENT"
  | "STARTS"
  | "SCENARIO";

type ProtectionMask = {
  version: 1;
  channels: Record<ProtectionChannel, Uint8Array>;
  namedRegions: ProtectedRegion[];
};
```

### Drag to Preserve interaction

- Select **Drag to Preserve** in Edit.
- Choose one or more channels, brush size and Protect/Erase mode.
- Drag across the map to paint the mask rather than pan.
- A translucent overlay indicates protection; the Legend explains colors and channels.
- Existing Region selection can be converted to protection or cleared from protection.
- Named protected regions can be toggled, renamed and inspected.
- Undo/Redo and checkpoints include protection changes.

### Protection-aware regeneration

Selective regeneration becomes a candidate-and-merge process:

1. Generate the requested unprotected candidate layers in the worker.
2. Restore protected channel fields from the source map.
3. Reconcile seams only on unprotected boundary tiles.
4. Rebuild dependent unprotected structures.
5. Validate rivers, accessibility, starts, resources and scenario links.
6. If a hard conflict remains, return a conflict report without replacing the map.

Examples:

- Protect a mountain chain's Topology and Elevation, then regenerate Climate and Content everywhere else.
- Protect a fertile river valley's Hydrology and Climate while rebuilding the surrounding world.
- Protect capitals and nearby resources while rebalancing city states.
- Protect an imported coastline while applying the Jungle Archetype inland.

World regeneration with protected topology is a constrained inpainting problem, not a normal fresh World pass. It may require Thorough or Exhaustive effort and must remain cancellable.

## Protection conflicts

- A protected river whose outlet is removed blocks Hydrology completion and identifies the exact protected region.
- Protected mountains that isolate land block accessibility and propose an unprotected pass corridor.
- A protected illegal resource is not silently relocated; Review and Repair disclose it.
- Protected starts that violate the five-hex rule block Starts regeneration unless the user unprotects or explicitly replaces them.
- Changing dimensions invalidates tile masks and requires an explicit discard or future resampling workflow.

---

# Generation runtime and computation

## Deterministic pass graph

Replace the monolithic generation call with a versioned pass graph. Each pass declares:

- required inputs and produced layers;
- deterministic sub-seed derived from the root recipe and pass ID;
- dependencies and invalidation rules;
- progress units and cancellation points;
- protected channels it can respect;
- retained diagnostics and provenance; and
- whether its output can be cached or transferred.

Changing a later Refine value should not invalidate the narrative skeleton or topography. Changing Scale or Map Type normally invalidates the world graph. The dependency explanation should be available before the operation runs.

## Worker protocol

The worker should support:

- structured progress events naming pass, candidate and corrective attempt;
- cancellation between bounded chunks;
- deterministic Standard, Thorough and Exhaustive searches;
- transferable typed arrays for large scalar fields where practical;
- prefetch for the next Lab trial;
- bounded candidate parallelism that does not exhaust mobile devices;
- memory estimates and warnings for Colossal/Exhaustive combinations; and
- graceful fallback to a slower single-worker path.

The baseline remains deterministic CPU generation in the browser so Alpine and GitHub Pages retain equivalent behavior. WebGPU or native acceleration may be investigated later, but it cannot become the only correct implementation.

## Performance policy

Do not impose an arbitrary sub-second target on ambitious generation. Instead:

- keep the interface responsive;
- show honest pass-level progress;
- allow cancellation without corrupting the current map;
- retain the last valid map until the candidate is complete;
- benchmark Standard, Huge, Extreme and Colossal separately;
- define memory ceilings for desktop and mobile; and
- test determinism independently of worker scheduling.

Mobile's simplified Randomise workflow should default to Standard effort and safe budgets. Thorough or Exhaustive work may be available only through an explicit desktop/full-interface choice.

---

# Durable projects and provenance

The rewrite introduces information that a `.Civ5Map` cannot retain: narrative assessments, Scale, Archetype, Match Intent, protection masks, history branches and pass provenance. A serious editor therefore needs a separate project format.

## Proposed `.excogitare` project

A versioned project bundle should eventually contain:

- current Civ5Map snapshot;
- normalized generation recipe;
- retained generation structure and Narrative Assessment;
- Match Intent;
- protection masks and named regions;
- checkpoints and a bounded branch history;
- editor metadata and optional thumbnails; and
- schema/version migration data.

The ordinary `.Civ5Map` export remains a clean game file and does not receive private Excogitare fields. Project export is an authoring handoff, not a Civ V map replacement.

Use IndexedDB autosave for active projects and Lab sessions; `localStorage` is insufficient for large maps and typed masks. Recovery should be explicit, local-only and replace nothing without confirmation.

---

# Proposed implementation sequence

## Phase 0 — Approve contracts

- Resolve the open decisions at the end of this document.
- Freeze schema names and conceptual ownership.
- Split this umbrella plan into tracked feature records where independent completion claims are useful.

## Phase 1 — Generation substrate

- Add versioned recipe, Scale, Archetype, Match Intent, Narrative Profile and provenance types.
- Add normalization/migration for current recipes.
- Introduce deterministic pass IDs, sub-seeds, dependency declarations, progress and cancellation.
- Extend retained `GenerationStructure` without breaking imported maps.

## Phase 2 — Five-stage Create workflow

- Add Refine between Design and Iterate.
- Move existing sections 2, 3 and 4 without losing their controls.
- Add stage-local state and remove every operation-driven stage switch.
- Fix repeated history browsing and add direct regression coverage.

## Phase 3 — Scale and Archetype

- Implement scale-aware boundary conditions and feature-frequency profiles in every engine.
- Add initial Archetype registry and topography-preserving Surface pass.
- Make Refine work on imports, history entries and generated maps.
- Add Difference preview and conflict disclosure.

## Phase 4 — Narrative compiler and benchmark identities

- Implement the exhaustive profile registry and narrative skeleton interface.
- Build Lonely Oceans, Broken Island Chains, Great Watersheds and Glacial World first.
- Add Narrative Assessment, Review presentation and deterministic fixtures.

## Phase 5 — Complete Narrative Map Types

- Complete Excogitare, Eccentric and Physical waves.
- Remove topology aliases and generic fallback behavior that violates an accepted identity.
- Run each type through scale, character, archetype, explicit-control and nearest-confusion matrices.

## Phase 6 — Match Intent and complete Polis

- Add Human/AI and victory intent to Refine.
- Rebuild the four current Polis types against Match Intent.
- Implement Three Realms, Thalassic League and Unequal Realms.
- Add victory feasibility and AI accommodation reports.

## Phase 7 — Drag to Preserve

- Implement per-channel masks, overlay, brush, erase, named regions and undo/history support.
- Convert regeneration to protected candidate-and-merge behavior.
- Add seam reconciliation and blocking conflict reports.

## Phase 8 — Continuous Lab

- Add schema v2, deterministic four-choice construction, automatic generation/prefetch and End and export.
- Preserve v1 import.
- Connect nearest-confusion definitions and Narrative Assessment to exported evidence.

## Phase 9 — Durable projects

- Add IndexedDB autosave and versioned `.excogitare` import/export.
- Preserve Civ5Map export purity.
- Add migrations, rejection behavior and recovery UI.

## Phase 10 — Hardening

- Complete Randomise, history, checkpoints, workers, mobile, Pages and Alpine coverage.
- Run Civ V export and load tests on representative maps.
- Reconcile README, visual guides, feature records and limitations.

Phases may overlap only where their data contracts are already frozen. “UI first” controls without working domain behavior remain groundwork, not implementation.

---

# Verification strategy

## Core model

- Exhaustive registry coverage for all thirty-three Narrative Map Types.
- Recipe migration and stable IDs.
- Same seed, options, Scale, Archetype, Match Intent and effort produce the same result.
- Worker scheduling and candidate order do not affect output.

## Narrative identity

- Per-type structural invariants across representative seeds.
- Required and forbidden motif diagnostics.
- Nearest-confusion comparisons.
- Explicit weakened-identity tests for water, mountains, geometry, Scale and protection conflicts.
- Lab replay on stable seed sessions before and after an implementation wave.

## Polis and Match Intent

- Human/AI count and seat normalization.
- AI accommodation route-width and redundancy directionality.
- Victory feasibility matrices for every Polis type.
- Team-count failures and disclosed relaxations.
- City-state contestability and no private-diplomacy-bloc checks.

## Scale and Archetype

- Same Map Size at different Scales changes motif frequency and boundary assumptions materially.
- Same Scale at different Map Sizes changes resolution without changing the narrative category.
- Archetype repaint preserves topology, elevation and rivers by default.
- Imported-map repaint has a Difference preview and legal result.
- Every Archetype remains deterministic and placement-legal.

## Workflow

- Design excludes old sections 2, 3 and 4; Refine contains them.
- Design → Refine → Iterate → Edit → Review is accessible and responsive.
- Repeated history selection never leaves Iterate.
- Applying Refine never changes stage.
- Protection painting, erasing, overlay, undo, checkpoints and history round-trip.
- Protected conflicts never replace the current map.

## Lab

- Exactly four unique choices with one correct answer.
- Deterministic target/distractor/position selection.
- Automatic next generation and bounded prefetch memory.
- Indefinite trial growth without retained map snapshots.
- End and export produces complete reproducible v2 evidence.
- v1 import remains valid and future/invalid schemas reject safely.

## Compatibility and runtime

- Existing Civ5Map import, edit, Repair and export regressions.
- Five-hex major/city-state start separation.
- Continuous legal rivers and accessible land.
- Pages static build and workers.
- Node 24 Alpine build, production start and HTTP response.
- Mobile simplified flow.
- Representative real Civ V load checks remain the final file authority.

---

# Further features worth including

These belong in the broader direction but should not delay the substrate needed by Parts 1–6:

1. **Constraint pins:** protect semantic objects such as “this watershed” or “this continent,” not only painted tiles.
2. **Layer diff and merge:** accept Climate from one branch, Rivers from another and Starts from a third when dependencies remain valid.
3. **Pareto candidate explorer:** compare identity, balance, Match Intent, legality and compute cost without pretending one score is universal.
4. **Ruleset profiles:** load mod-aware resource, wonder and placement vocabularies so validation is not limited to Excogitare's built-ins.
5. **Scenario authoring:** explicit civilization slots, teams, city ownership, diplomacy and victory configuration where the Civ5Map format genuinely supports them.
6. **Semantic labels:** expose retained bays, capes, ranges, watersheds, regions and strategic objectives for naming and selection.
7. **Recipe comparison:** show exactly which authoring decisions differ between two generations.
8. **Reproducibility manifest:** export a compact human-readable recipe and generator-version report alongside Civ5Map.
9. **Plugin-quality authoring API:** only after the internal Narrative Profile and pass interfaces survive the complete built-in catalogue.

The project format, semantic protection and branch/layer merge are particularly important if Excogitare is to become a powerful editor rather than merely a generator with more options.

---

# Open decisions for discussion

1. Should Human/AI intent normally record only counts, or should Refine permit explicit seat-by-seat control assignments?
2. Should intended victories use Enabled + Emphasized, as proposed, or a simpler set of weighted priorities?
3. Should the public Archetype labels remain Arrakis and Hoth, or use Desert World and Ice World with those references only in explanatory copy?
4. Should Lab provide only continuous blind research, or also a separate Learning mode with immediate answers?
5. Should `.excogitare` project persistence be part of the initial rewrite completion claim or a following major feature?
6. Should protected illegal content block all regeneration, or only operations and exports whose dependency graph touches it? The proposed answer is the latter, with Review always disclosing it.
7. How much of Exhaustive candidate search should be available on mobile?

## Recommended initial answers

- Support counts first and explicit seat assignments as advanced Refine controls.
- Use Enabled + Emphasized; it is comprehensible and avoids false numerical precision.
- Use generic stable IDs regardless of display label; settle public fictional labels before implementation.
- Keep continuous blind mode simple and authoritative; defer Learning mode.
- Include project persistence in the rewrite programme but do not block the first narrative generation waves on it.
- Block only touched operations and export, never unrelated editing or inspection.
- Keep mobile on Standard effort and safe budgets by default.

---

# Completion gates

- [ ] Plan reviewed and scope approved.
- [ ] Authoritative versioned recipe, Scale, Archetype, Match Intent, Narrative Profile, protection and provenance models implemented.
- [ ] Deterministic pass graph, progress, cancellation, effort levels and migration implemented.
- [ ] Design → Refine → Iterate → Edit → Review workflow implemented without operation-driven navigation.
- [ ] Scale materially affects every engine without becoming a Map Size alias.
- [ ] Archetype can repaint generated and imported topography while preserving structural layers by default.
- [ ] All thirty-three accepted Narrative Map Types have runtime profiles, genuine domain behavior, diagnostics and nearest-confusion evidence.
- [ ] Polis consumes Human/AI and victory intent in topology and all engines report Match Intent feasibility.
- [ ] Three Realms, Thalassic League and Unequal Realms are exposed and complete.
- [ ] Drag to Preserve supports channel masks, undo/history, selective regeneration and blocking conflict reports.
- [ ] Iterate history remains continuous and branch-aware.
- [ ] Continuous four-choice Lab and schema v2 implemented with v1 compatibility.
- [ ] Project persistence scope resolved and implemented according to the approved decision.
- [ ] Randomise, workers, cloning, history, checkpoints and mobile consequences verified.
- [ ] Civ V legality, accessibility, rivers, starts, Repair and export regressions pass.
- [ ] Identity, Match Intent, Scale, Archetype, preservation and Lab test matrices pass.
- [ ] Type checking, lint, production build, Pages build and Alpine runtime pass.
- [ ] README, visual help, feature register, current code and completion claims reconciled.

