# Narrative Generation Rewrite

## Status and purpose

- **Status:** In progress; Phases 1–9 are verified, including first-class durable project files. Scenario authoring and final hardening remain open.
- **Purpose:** Coordinate the Narrative Map Type implementation, generation-model expansion and Create/Lab workflow changes as one deliberate rewrite rather than a sequence of controls attached to incompatible assumptions.
- **Current limitation:** This document is a plan. Except where it explicitly describes the present baseline, none of the proposed models or workflows should be described as implemented.
- **Primary references:** [`map-type-narrative-identities.md`](map-type-narrative-identities.md), [`world-character.md`](world-character.md), [`workspace-navigation.md`](workspace-navigation.md), [`identity-lab.md`](identity-lab.md), the current generator and retained-structure modules, and the Civ V legality/Repair rules.

This document is the approved implementation contract. It may still be refined as code and format evidence expose real constraints, but removing or deferring an approved outcome requires an explicit scope decision. Every phase must update this record with requirements, evidence and honest status rather than allowing the plan to become an obsolete wish list.

## Desired outcome

Excogitare should become a serious world-authoring system rather than a collection of unrelated generator switches. A user should be able to:

1. express the geographic narrative, physical scope, surface ecology and intended match;
2. generate a deterministic world through visible retained passes;
3. refine the result without needlessly rebuilding its topography;
4. compare generations without being thrown into another stage;
5. protect chosen geography while regenerating everything else;
6. edit individual tiles or coherent structures;
7. understand narrative fidelity, match suitability and Civ V validity before export; and
8. save the complete authoring state as an Excogitare project rather than losing it in a game-only export; and
9. turn a generated or imported map into a fixed Civ V scenario through a dedicated workspace.

Complexity and compute time are acceptable when they produce materially stronger geography. They are not acceptable when they merely add noise, retry the same weak architecture, conceal a failed premise or freeze the browser without progress and cancellation.

## Non-goals and hard boundaries

- The rewrite does not alter Civ V's engine, AI or victory rules. Match Intent shapes geography and evaluates likely suitability; it cannot guarantee how a particular lobby or mod will play.
- Human and AI slot counts are authoring assumptions. A normal Civ V lobby may reassign slots after export unless the user creates a fixed scenario.
- Intended victories bias opportunity and validation. Excogitare must not make other enabled victories impossible merely to optimize one selection.
- Scale is not a synonym for Map Size. Map Size remains the tile budget; Scale describes how much of the imagined world those tiles represent.
- Archetype is not another Map Type or World Character. It repaints environmental expression while preserving topographic structure by default.
- Protection does not make invalid Civ V data legal. A protected conflict must be disclosed and block the relevant operation or export rather than being silently overwritten.
- Passing automated narrative metrics does not prove that a map is recognizable. Identity Lab evidence remains necessary.
- Scenario authoring is limited by fields that Excogitare can parse, write and verify safely. Unsupported game rules remain explicit project-only drafts or future Lua/mod work; they must not be represented as valid Civ5Map data.

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

## Request coverage

| Requested part | Principal plan sections | Completion evidence |
| --- | --- | --- |
| Human/AI and victory-aware Polis | Part 1; Refine; Match Intent verification | Strategic topology changes directionally, every victory report is explanatory, and incompatible team/player contracts fail visibly. |
| Implement Narrative Map Types | Part 2; narrative implementation waves | Thirty-three exhaustive profiles, real engine behavior, retained diagnostics, control conflicts and Lab evidence. |
| Design → Refine → Iterate → Edit → Review | Part 3 | Five accessible stages, old sections 2–4 moved intact to Refine, and no operation changes stage implicitly. |
| Scale and Archetype | Part 4 | Scale changes spatial interpretation independently of tile budget; Archetype repaints generated and imported topography without structural mutation by default. |
| Continuous four-choice Lab | Part 5 | Exactly four deterministic choices, automatic next-map prefetch, indefinite compact sessions, and End and export schema v2 evidence. |
| Iterate continuity and preservation | Part 6 | Repeated history browsing stays in Iterate; channel masks and semantic constraints govern regeneration, report conflicts and never replace the current map after a failed candidate. |
| Excogitare project files | Durable projects and provenance | A versioned, rejecting and safely migrated `.excogitare` bundle retains the map, recipe, structures, semantic constraints, branches and Scenario draft. |
| Scenario authoring | Scenario workspace | A new peer workspace separates fixed scenario records from generated Match Intent and exports only fields supported by verified Civ5Map round trips. |
| Runtime quality and broader ambition | Runtime and further features | Responsive cancellable computation throughout the approved work, with branch/layer composition retained as a following feature. |

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
| Archetype | What environmental coat covers the topography? | Jungle, Sunscourged, Worldfrost, Volcanic | Owns climate envelope, terrain palette, compatible features and resource ecology. |
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

## Match Intent model

```ts
type SeatControl = "HUMAN" | "AI" | "FLEXIBLE";
type VictoryCondition = "DOMINATION" | "SCIENCE" | "CULTURE" | "DIPLOMACY" | "TIME";

type MatchIntent = {
  schemaVersion: 1;
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

Phase 0 decision: the ordinary Refine workflow records Human, AI and Flexible counts. Advanced Refine may assign `seatControls` explicitly, including team membership, when the author needs seat-specific geography. Randomise uses counts and Flexible seats only and never silently assigns a particular start to a Human or AI. Explicit assignments persist in `.excogitare`; Civ5Map export includes them only through record families that have reached the required compatibility level.

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

Phase 0 decision: every victory has the effective state Disabled, Enabled or Emphasized. `emphasizedVictories` is a strict subset of `enabledVictories`, and at least one victory must remain enabled. The ordinary default enables every victory and emphasizes none. Randomise may emphasize one or two victories but does not disable any unless the user enables an advanced victory-restriction option. Emphasis changes geography and assessment directionally without making another enabled victory structurally impossible. Match Intent does not change Civ V's actual enabled victories; only a Game-verified Scenario export may do that.

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
  schemaVersion: 1;
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

## Interface implementation and density

The current Create implementation is concentrated in one very large component. The rewrite should split Design, Refine, Iterate, Edit and Review into focused stage components backed by one normalized recipe/store boundary. This is not cosmetic refactoring: it prevents stage behavior, generation state and editor state from becoming inseparable again.

- Keep one clear primary action per stage.
- Use progressive disclosure, but avoid controls nested inside several bordered containers.
- Show the compiled recipe or current operation consequence once rather than repeating it in multiple cards.
- Keep advanced engine controls in a single shallow disclosure.
- Permit compact summaries of closed groups and preserve their open state per stage.
- Keep explanatory hover/focus help, but never make a tooltip the only place a warning or blocked consequence appears.
- Make Refine and Iterate usable without scrolling back through Design decisions.
- Preserve the mobile three-action workflow; the full five-stage authoring interface remains a deliberate desktop/tablet experience.

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
  | "SUNSCOURGED"
  | "WORLDFROST"
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

Approved initial catalogue and meanings:

- **Existing:** retain the current terrain and features; appropriate for imports.
- **Narrative default:** let Map Type and Character select the coat.
- **Temperate:** mixed grassland, plains, forest and ordinary rainfall.
- **Jungle:** warm wet lowlands, dense jungle belts, marshes and powerful river ecology.
- **Sunscourged:** overwhelming heat and aridity, dune seas, rare habitable river or oasis corridors, mountain refuges and fiercely concentrated life.
- **Worldfrost:** snow and tundra dominance, advancing ice, isolated refuges and valuable frozen frontiers that reward difficult exploration.
- **Monsoon:** strong wet/dry contrast, mountain-fed rivers, floodplains and leeward interiors.
- **Mediterranean:** dry summers, coastal fertility, scrubby uplands and compact productive basins.
- **Steppe:** open plains, dry grasslands, long movement corridors and sparse forests.
- **Savanna:** seasonal grassland, scattered woodland and river-dependent fertility.
- **Marshland:** saturated lowlands, deltas, shallow basins and difficult wet movement.
- **Volcanic:** young dark relief, fertile margins, geothermal landmarks and strategic geology.
- **Jurassic:** hot wet abundance, dense forests and dramatic biological productivity.
- **Post-Collapse:** roads, ruins, abandoned city sites and environmental recovery without mandatory fallout.
- **Fallout Wastes:** sparse fallout, ruins, broken roads and hostile but legal settlement pockets.

Sunscourged and Worldfrost are approved public labels and stable IDs. The initial selector contains two pass-through modes and thirteen authored Archetypes. It is deliberately extensible, but each addition must define its climate envelope, terrain palette, compatible features, resource ecology, intensity behavior, legality effects and deterministic tests rather than existing as a visual label alone.

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

The continuous mode does not reveal correctness between candidates because immediate teaching biases later recognition. The final summary reveals answers and confusion patterns. Phase 0 excludes Learning Mode from this rewrite; a future separately specified Learning Mode may provide immediate feedback, but its sessions and exports must never be mixed with blind research evidence.

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

type TileProtectionMask = {
  schemaVersion: 1;
  channels: Record<ProtectionChannel, Uint8Array>;
  namedRegions: ProtectedRegion[];
};
```

## Semantic protection

Painted masks answer “do not change these fields on these tiles.” Semantic protection answers “preserve what this geography **is** even if its exact tiles must move.” It should be implemented as a constraint system above tile masks rather than as a larger automatic selection brush.

Examples include:

- preserve this watershed, its mountain source, tributary hierarchy and outlet;
- preserve this mountain range as a continuous barrier with at least two passes;
- preserve this strait as the only short connection between two named seas;
- preserve this peninsula's attachment, inhabitable interior and surrounding gulfs;
- preserve this island chain's parent arc and anchor islands;
- preserve this capital basin's defensive approaches; or
- preserve the relationship between a wonder heartland and its poor surrounding march.

### Semantic constraint model

```ts
type SemanticProtectionPolicy = "EXACT" | "SHAPE" | "FUNCTION" | "RELATIONSHIP";

type SemanticProtection = {
  schemaVersion: 1;
  id: string;
  label: string;
  objectKind: GeographicObjectKind | "MOUNTAIN_RANGE" | "RIVER_SYSTEM" | "COASTLINE" | "START_REGION";
  sourceSemanticId: string;
  policy: SemanticProtectionPolicy;
  channels: ProtectionChannel[];
  hard: boolean;
  tolerance: {
    minimumTileOverlap?: number;
    maximumCentroidShift?: number;
    minimumShapeSimilarity?: number;
  };
  invariants: SemanticInvariant[];
  anchor: SemanticAnchor;
};
```

The policies have deliberately different meanings:

- **Exact:** retain the same tiles and selected channel values. This is the semantic wrapper around an ordinary tile mask.
- **Shape:** preserve recognizable footprint, orientation, scale and approximate location while allowing the boundary to breathe.
- **Function:** preserve the geographic job. A watershed may change its outline, but it must retain its source class, tributary structure, drainage direction and valid outlet.
- **Relationship:** preserve connections among objects. A strait must continue to divide and connect the same two water bodies; a range must continue to separate the same regions; a heartland must remain enclosed by its march.

Hard semantic protection rejects candidates that cannot satisfy the invariants. Soft protection contributes a named objective to candidate comparison and requires confirmation before accepting a degraded result. The default user action **Preserve this watershed** should create hard Function protection for Hydrology and Shape protection for the drainage basin, without freezing every biome or resource tile inside it.

### Stable semantic identity

Generated objects need a persistent `semanticId` distinct from their generation-specific object ID. The ID is not derived only from an array index. It is matched across revisions using:

- object kind and parent/neighbor relationships;
- normalized centroid, area, orientation and boundary signature;
- tile overlap where dimensions are unchanged;
- source, outlet, catchment and tributary signatures for watersheds;
- endpoint and separated-region signatures for ranges, straits and routes; and
- Narrative Map Type role, such as `primary-inner-sea` or `mythic-heart-3`, where applicable.

After regeneration, a lineage matcher links the best candidate object to the protected semantic ID and records its confidence. Ambiguous or missing matches are conflicts, not permission to attach the protection to an unrelated feature.

### Selection and authoring workflow

1. Enable the Semantic Objects layer in Edit.
2. Click a retained object on the map or choose it from an object browser grouped by watersheds, ranges, basins, coasts, strategic regions and narrative roles.
3. Choose **Preserve this …**.
4. Review the proposed policy, protected channels, inferred invariants and confidence.
5. Accept the defaults or make the constraint hard/soft and adjust its tolerance.
6. The map displays a labelled semantic outline distinct from the painted-mask overlay.
7. Review and Iterate show every affected constraint before regeneration.

For imported maps, an analysis pass may derive watersheds, coastlines, ranges, islands and settlement regions. Derived objects must display their confidence and preview their extent before protection. When confidence is too low, the user can define a region manually and either preserve it as an Exact mask or promote it to a named semantic object by selecting its source, outlet, axis or neighboring regions.

### Compiler integration

Semantic constraints enter the pass graph before candidate generation:

1. Resolve protected objects and their dependencies in the current retained structure.
2. Translate each invariant into engine-specific objectives and immutable relationships.
3. Generate candidate skeletons around those constraints rather than generating a complete unrelated world and copying old tiles afterward.
4. Match candidate objects back to persistent semantic IDs.
5. Reject candidates that violate hard invariants.
6. Rank lawful candidates by narrative identity, semantic fidelity and Match Intent without collapsing the evidence into one opaque score.
7. Apply Exact tile masks during the final protected merge.
8. Report object lineage, changed geometry, satisfied invariants and any accepted soft degradation.

Each engine realizes the same protection differently. Eccentric pins graph nodes, polygon relationships and basin/range edges. Physical constrains plate provinces, drainage outlets or climatic boundary conditions. Polis pins strategic nodes, routes and protected territories. Excogitare turns semantic objects into spatial fields, signed-distance constraints and connectivity targets.

### Semantic conflicts

- Preserving a watershed's function while deleting its receiving sea blocks the operation unless the user selects a new outlet.
- Preserving a mountain range as a barrier while requesting zero mountains produces a direct control conflict and weakened-identity explanation.
- Preserving an inland sea while changing to Local Scale may be feasible as a partial shoreline only; a hard complete-sea constraint blocks the scale change.
- Two protected watersheds cannot claim incompatible flow across the same river edge.
- A protected strait cannot remain functionally unique if another protected land bridge bypasses it.
- Dimension changes may resample Shape, Function and Relationship constraints through normalized anchors; Exact protection still requires explicit discard or a separately reviewed resampling operation.

Semantic protection should be stored in the Excogitare project and retained across branches. Civ5Map export contains only the resulting tiles and scenario data; it cannot carry the constraint itself.

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

Phase 0 decision: simplified mobile generation is limited to Standard effort, safe map sizes and safe geometries. Mobile Randomise never selects Thorough or Exhaustive effort, Game-Breaking budgets or Game-Breaking geometries. Mobile may view and download a result previously generated at a higher effort, but it does not regenerate that recipe at the higher effort through the simplified three-action interface.

---

# Durable projects and provenance

The rewrite introduces information that a `.Civ5Map` cannot retain: narrative assessments, Scale, Archetype, Match Intent, protection masks, history branches and pass provenance. A serious editor therefore needs a separate project format.

## Authoritative ownership model

`ExcogitareProject` is the aggregate root and authoritative editable document. Its persisted authored state is divided without duplicating ownership:

- `GenerationRecipe` owns engine, Narrative Map Type, Scale, World Character, Archetype, World Modifier, explicit controls, Match Intent and Generation Effort.
- `Civ5Map` owns the current concrete tile grid and the supported scenario snapshot, but never the recipe that produced it.
- `ProtectionState` owns channel masks, named protected regions and semantic constraints.
- `ScenarioDraft` owns authored scenario state, including fields that remain Project only.
- `ProjectHistory` owns checkpoints, branches, operations and provenance.
- editor state owns view position, stage, expanded sections and temporary selections; these do not affect deterministic generation.

`GenerationStructure`, semantic lineage matches, `NarrativeAssessment`, Match Intent feasibility, validation findings and export-compatibility reports are derived evidence. Each cache records the input hash, generator version and pass versions that produced it. Stale derived evidence is invalidated visibly and never overrides authored state. `NarrativeProfileRegistry` and Archetype definitions belong to the Excogitare application version rather than being user-editable project truth.

Every persisted root has its own explicit schema version and pure migration path. Cross-object identifiers are stable, but one object cannot silently become the authority for a field owned elsewhere.

### Frozen schema names

Schema names remain stable while their `schemaVersion` discriminator advances. Do not append `V1`, `V2` or similar version suffixes to the conceptual TypeScript names.

| Schema | Authority |
| --- | --- |
| `ExcogitareProject` | Aggregate project root and payload references. |
| `ProjectManifest` | Bundle identity, schema requirements, hashes, compression and capabilities. |
| `GenerationRecipe` | Complete active generation intent, including nested `MatchIntent`. |
| `MatchIntent` | Human/AI, team, competition and victory intent within the recipe. |
| `ProtectionState` | All active protection; owns `TileProtectionMask` and `SemanticProtection`. |
| `TileProtectionMask` | Per-channel exact tile protection. |
| `SemanticProtection` | Stable-object Shape, Function and Relationship constraints. |
| `ScenarioDraft` | Authored Scenario state, including Project-only material. |
| `ProjectHistory` | Immutable history index, branches and checkpoints. |
| `ProjectHistoryEntry` | One immutable operation/result reference and its provenance. |
| `ProjectEditorState` | Non-deterministic view and interface continuity. |
| `PassProvenance` | Pass versions, sub-seeds, relaxations and operation evidence. |

The frozen derived-evidence names are `GenerationStructure`, `SemanticObject`, `SemanticLineage`, `NarrativeAssessment`, `MatchFeasibilityReport`, `ValidationReport` and `ScenarioCompatibilityReport`. Application-owned definitions are `NarrativeProfile`, `ArchetypeProfile`, `WorldCharacterProfile` and `GenerationPassDefinition`.

## `.excogitare` project contract

Excogitare project files are part of the approved rewrite rather than an optional later convenience. A project is the authoritative editable document; Civ5Map, PNG, Lua and modinfo remain outputs derived from it.

A `.excogitare` file should be a compressed, versioned bundle with a small readable manifest and independently replaceable payloads:

```text
project.excogitare
├── manifest.json
├── map.civ5map
├── recipe.json
├── structure.json
├── narrative-assessment.json
├── protection/
│   ├── masks.bin
│   └── semantic.json
├── scenario/
│   ├── draft.json
│   └── compatibility.json
├── history/
│   ├── index.json
│   └── snapshots/…
└── thumbnails/…
```

The bundle should contain:

- current Civ5Map snapshot;
- normalized generation recipe, including Match Intent;
- retained generation structure and Narrative Assessment;
- tile masks, named regions and semantic protection constraints;
- checkpoints and a bounded branch history;
- Scenario workspace draft and verified Civ5Map compatibility findings;
- editor state and optional thumbnails;
- pass versions, deterministic provenance and accepted relaxations; and
- schema/version migration data.

The ordinary `.Civ5Map` export remains a clean game file and does not receive private Excogitare fields. Project export is an authoring handoff, not a Civ V map replacement.

### Project safety and migration

- The manifest declares schema version, Excogitare version, payload hashes, compression method and required capabilities.
- Imports are transactional: validate the complete manifest and required payloads before replacing the current project.
- Reject path traversal, executable content, oversized payloads, duplicate entries, checksum failures and unsupported future schema versions.
- Schema migrations are pure, version-to-version transforms with fixtures. Never guess at missing required data.
- Unknown optional fields survive load/save where safe so a newer project is not silently stripped by a partial reader.
- Users choose whether project export includes the full thirty-map history or only the current map and named checkpoints.
- Imported Civ5Map files can be promoted to a new project without modifying the original file.
- Downloaded project files are the only durable persistence contract. The release has no account, cloud save or server-side project storage.

Users must select **Save Project** to download their work and **Open Project** to reimport it later. Any future browser recovery cache is best effort only, may disappear because of browser policy or cleared site data, and must never be described as saved work. Large history snapshots should use structural sharing or compressed deltas inside the downloaded bundle where this can be done without making recovery fragile.

### Project interface

- **New Project** starts from a generated map, imported Civ5Map or empty safe geography.
- **Open Project** accepts `.excogitare`; **Open Map** continues to accept Civ5Map as a clean import.
- **Save Project** downloads the current authoring bundle and reports whether history is included.
- Closing or reloading with unsaved changes warns that the release does not retain the project after the session.
- The top bar identifies unsaved project changes separately from map-tile edits.
- Export actions clearly state that Civ5Map omits recipe, history and protection constraints.
- Project name and map name are related defaults but remain separate editable fields.

---

# Scenario workspace

## Purpose and boundary

Add **Scenario** as a peer workspace beside Explore, Create, Repair, Lab and Lua. Create defines procedural population and Match Intent; Scenario assigns specific civilizations, teams, cities, territories, game conditions and authored events to the current geography.

This separation prevents Create from becoming a scenario editor disguised as generation controls. A user may enter Scenario from a generated map, an imported Civ5Map or an Excogitare project. Switching to Scenario must preserve the map, view, Create state, Repair state and Scenario draft.

Scenario should have a distinct violet identity accent and five stages:

> **Setup → Factions → World → Objectives → Validate**

## Setup

Setup owns scenario-wide metadata that the current ruleset and export format can safely represent:

- scenario name and description;
- intended era, game speed, turn/calendar state and map-script metadata where verified;
- enabled ruleset or mod profile;
- fixed-scenario versus flexible-lobby intent;
- player and city-state slot capacity; and
- compatibility summary for the source Civ5Map version and scenario marker.

Fields that Excogitare cannot yet serialize remain visibly marked **Project only**. They may guide later Lua/mod export but cannot be included in the Civ5Map compatibility claim.

## Factions

Factions owns explicit slot records:

- civilization and leader;
- major or city-state status;
- playable, Human, AI or flexible control intent;
- team assignment and team color;
- start plot or starting city;
- slot ordering and disabled/reserved slots; and
- duplicate-civilization and unsupported-identifier findings.

The interface should provide a table for precise editing and a map-linked start editor. Changing a slot highlights its start, cities and territory. Scenario assignments supersede generated Match Intent for export but do not erase the original generation recipe.

## World

World owns scenario entities and political geography:

- cities, names, owners and verified city-record fields;
- tile ownership and political boundaries;
- improvements, routes, camps, ruins and fallout;
- start locations and city-state markers;
- units only after their record format is parsed, written and round-trip verified; and
- batch reassignment, selection and layer-based inspection.

Every entity type should declare **Read**, **Edit**, **Write** and **Verified in Civ V** capability separately. Existing parsing of a field is not evidence that safe writing is complete.

## Objectives

Objectives owns intended rules and authored goals:

- enabled and emphasized victory conditions;
- team or faction objectives;
- protected capitals, wonders, regions and victory sites;
- turn limits or score goals where supported;
- narrative briefing and per-faction notes in the project; and
- future triggers, diplomacy and scripted events as explicit project-only groundwork until a verified export path exists.

Objectives should reuse semantic objects. A scenario goal can point to “control this strait” or “hold this wonder heartland” through a persistent semantic ID rather than a brittle list of tiles.

## Validate

Validate is the only Scenario stage that owns scenario export readiness. It runs:

- player, team and city-state slot consistency;
- start bounds, passability, uniqueness and five-hex spacing where the scenario contract requires it;
- city, unit, route, improvement and ownership references;
- civilization, leader, color, resource and wonder identifiers against the selected ruleset;
- capital and objective reachability;
- victory-condition and objective feasibility;
- scenario marker, record-size and round-trip checks;
- unsupported Project-only field disclosure; and
- the ordinary geography, river and placement validation shared with Repair.

The Scenario workspace may offer **Send fixable findings to Repair**, but it must not silently mutate the scenario during validation. Export uses the existing confirmation modal with blockers and omitted Project-only data described plainly.

## Civ5Map compatibility levels

Scenario features should progress independently through four levels:

1. **Read:** parsed and displayed without mutation.
2. **Edit:** represented safely in the project model.
3. **Write:** serialized without corrupting unrelated records.
4. **Game verified:** round-tripped and loaded in Civ V on representative files.

Only level 4 receives an unqualified supported label. Level 2 allows useful project authoring even while the final export path is still incomplete, provided the interface clearly marks it Project only.

## First Game-verified release boundary

The first Scenario compatibility claim is deliberately conservative. It requires complete Read, Edit, Write and Game-verified support for:

- map and scenario metadata;
- major and city-state slot counts;
- civilization, leader, team, team color and playable status;
- major and city-state start locations;
- city name, owner, population and location;
- tile ownership and political boundaries;
- improvements, roads and railroads; and
- byte-safe preservation of unrelated records during round trip.

Units, diplomacy, predeclared wars, scripted triggers and events, custom victory-rule configuration, era/game-speed/turn/calendar manipulation, briefings and faction objectives remain Project only in the first release. A field may leave that boundary only through its own capability evidence; partial parsing or a plausible byte offset is not sufficient.

## Scenario and project integration

- The Scenario draft lives inside `.excogitare`, not in ad hoc component state.
- Civ5Map export includes only fields at the supported Write level and is blocked by incompatible required fields.
- Semantic objectives and project-only briefings remain in the project bundle.
- Importing a Civ5Map initializes the Scenario model from parsed records and retains the original bytes for safe round-trip comparison.
- Repair treats scenario data as an integrity domain; Scenario remains the authoring surface.
- Lua/modinfo export may eventually compile project-only objectives and triggers, but this is a separate compatibility claim.

---

# Feature-record decomposition

The approved rewrite is governed through nine independently claimable workstreams. The umbrella document owns dependency order and final reconciliation; each linked record owns its domain behavior and evidence.

1. [`generation-substrate.md`](generation-substrate.md) — schemas, migrations, pass graph, workers, provenance and semantic identity substrate.
2. [`create-authoring-workflow.md`](create-authoring-workflow.md) — Design → Refine → Iterate → Edit → Review, state and mobile boundary.
3. [`scale-and-archetypes.md`](scale-and-archetypes.md) — five Scales, pass-through behavior, thirteen authored Archetypes and repaint.
4. [`map-type-narrative-identities.md`](map-type-narrative-identities.md) — thirty-three runtime identities, compiler contracts and assessment.
5. [`match-intent-and-polis.md`](match-intent-and-polis.md) — player/victory intent, feasibility and all seven Polis types.
6. [`protection-and-selective-regeneration.md`](protection-and-selective-regeneration.md) — tile masks, semantic protection and protected regeneration.
7. [`identity-lab.md`](identity-lab.md) — continuous four-choice Blind Recognition and schema v2.
8. [`excogitare-project-files.md`](excogitare-project-files.md) — downloaded project bundle and later clean-session import.
9. [`scenario-workspace.md`](scenario-workspace.md) — five Scenario stages and capability-gated Civ5Map authoring.

Supporting types from one record cannot advance another record's status. Each record must satisfy its own user outcome and applicable completion gates.

---

# Proposed implementation sequence

## Phase 0 — Approve contracts

- [x] Resolve the approved product decisions.
- [x] Freeze schema names and conceptual ownership.
- [x] Split the umbrella plan into nine tracked feature records.
- [x] Define and capture the baseline fixture corpus and current regression evidence in `tests/fixtures/rewrite-baseline.json` and `tests/fixtures/rewrite-baseline-evidence.md`.

Phase 0 is complete. This advances the programme to an implementation-ready specification; it does not advance any runtime workstream beyond its recorded status.

## Phase 1 — Generation substrate

- [x] Add versioned recipe, Scale, Archetype, Match Intent, Narrative Profile, semantic identity, Scenario draft, project manifest and provenance types.
- [x] Add normalization/migration for current recipes.
- [x] Introduce deterministic pass IDs, sub-seeds, dependency declarations, progress and cancellation.
- [x] Extend retained `GenerationStructure` without breaking imported maps.

Phase 1 is verified. The pipeline now distinguishes Topology, Relief, Climate, Accessibility, Starts, Content, Hydrology, Legality and Semantic Identity; edits invalidate only dependent evidence, candidate search streams its fixed budget, oversized Exhaustive recipes disclose estimated working memory, and Review explains stale evidence rather than presenting it as current.

## Phase 2 — Five-stage Create workflow

- [x] Add Refine between Design and Iterate.
- [x] Move existing sections 2, 3 and 4 without losing their controls.
- [x] Add stage-local state and remove every operation-driven stage switch.
- [x] Fix repeated history browsing and add direct regression coverage.

Phase 2 is verified. Create now uses focused workflow components over one authoritative state boundary; history records branch provenance and only an explicit recipe action returns to Design. Refine, Edit and Review state, expanded disclosures, per-stage sidebar scroll, canvas view and branch history survive stage/workspace changes and downloaded-project round trips. Failures and cancellation remain atomic. Keyboard navigation, rendered-shell regressions, TypeScript, ESLint, production and Pages builds, and the Node 24 Alpine runtime pass. The separate Scale, narrative, Polis, Lab, semantic-protection and Scenario claims remain governed by their later phases.

## Phase 3 — Scale and Archetype

- [x] Implement scale-aware boundary conditions and feature-frequency profiles in every engine.
- [x] Add the complete initial Archetype registry and topography-preserving Surface pass.
- [x] Make Refine work on imports, history entries and generated maps.
- [x] Add Difference preview, intensity, content ecology and conflict disclosure.

Phase 3 is verified. Global, Continental, Regional, Provincial and Local are independent of Map Size and materially affect all four engine architectures. The two pass-through modes and thirteen authored Archetypes now provide deterministic coherent-region coats, compatible Randomise, profile-directed Transformative content, protected imported-map candidates and explicit Original / Preview / Difference confirmation. The full test, production, Pages and Alpine runtime matrices pass. Narrative Map Type-specific Scale reinterpretation remains governed by Phases 4 and 5 rather than being smuggled into this completion claim.

## Phase 4 — Narrative compiler and benchmark identities

- [x] Implement the exhaustive profile registry and narrative skeleton interface.
- [x] Build Lonely Oceans, Broken Island Chains, Great Watersheds and Glacial World first.
- [x] Add Narrative Assessment, Review presentation and deterministic fixtures.

Phase 4 is verified. All thirty current and three approved future identities have authoritative profiles with unique verbs, motifs, anti-motifs, parameter envelopes and nearest confusions. The four benchmark types compile retained structural skeletons before starts/content/legality, survive representative Scale and World Character matrices, disclose weakened explicit-control combinations and retain Review evidence through workers, history and project files. At that gate, the remaining twenty-two non-Polis current Map Types moved to Phase 5; the four current and three future Polis types remained Phase 6 work.

## Phase 5 — Complete Narrative Map Types

- [x] Complete the eight Excogitare, eight remaining Eccentric and six remaining Physical identities.
- [x] Remove topology aliases and generic fallback behavior that violates an accepted identity.
- [x] Run each type through deterministic defaults and representative scale, character, archetype, explicit-control and nearest-confusion matrices.

Phase 5 deliberately excludes Polis. Its four current identities and three approved additions depend on Human/AI and victory geography and therefore remain Phase 6 work.

Phase 5 is verified. Every non-Polis identity now emits its own retained regions, relationships, effects and targets before starts and content. The shared realizer is integrated into Excogitare, Eccentric and Physical while preserving the owning engine's geographic objects, physical climates, explicit terrain controls, exact water target and accessible mountain contract. Final-map assessments score actual component, path, relief, drainage, ecology and value evidence; all twenty-two additions pass deterministic A/B recognition and Repair-clean default fixtures. Representative Regional Scale, alternate Character and Archetype cases also remain recognizable and legal. The reviewed baseline changes deliberately where formerly Profile-only characterization and Scenario cases now receive real terrain compilation and scores; hard dimensions, requested water, population, export and validation boundaries remain intact.

## Phase 6 — Match Intent and complete Polis

- **Status:** Verified.
- Add Human/AI and victory intent to Refine.
- Rebuild the four current Polis types against Match Intent.
- Implement Three Realms, Thalassic League and Unequal Realms.
- Add victory feasibility and AI accommodation reports.

Phase 6 uses the retained strategic graph as its authority. Each Polis compiler emits a distinct topology signature, role-bearing starts/objectives, route-width and redundancy evidence, city-state contestability and a separate finding for every victory condition. Strong AI accommodation changes navigability and expansion geometry only; it never grants invisible yields. Three Realms normalizes incompatible counts with a visible relaxation, while counts below three block generation. Unequal Realms remains directly selectable but is omitted from ordinary Randomise. Refine can optionally bind Human/AI/Flexible control and teams to numbered generated starts; civilization identity and actual lobby enforcement remain Scenario responsibilities.

The completed implementation also retains a five-part Match Intent assessment for Excogitare, Eccentric and Physical based on final starts, resources, city-state contestability, nearby production and territorial capacity. Review distinguishes that evidence from Polis's authored graph. Deterministic A/B fixtures for all seven Polis types are Repair-clean; Strong-AI, victory emphasis, team/count contracts, explicit seats, Randomise exclusion, project cloning and the reviewed Phase 0 fixture all have regression coverage. Final verification passes 119 domain tests and 20 rendered-shell tests, type checking, lint, production and Pages builds, static-export verification, and a responding `node:24-alpine` container at port 3001. Manual Civ V behavior remains outside the automated claim.

## Phase 7 — Tile and semantic protection

- **Status:** Verified.

Semantic protection is a required part of the rewrite implementation. Phase 7 is incomplete if it delivers only painted tile masks, named selections or post-generation copying; all four engines must consume semantic constraints during candidate construction and report semantic fidelity afterward.

- Implement per-channel masks, overlay, brush, erase, named regions and undo/history support.
- Add stable semantic IDs, object lineage matching, Exact/Shape/Function/Relationship policies and constraint inspection.
- Implement **Preserve this watershed** across generated structures and confidence-labelled imported-map inference.
- Convert regeneration to protected candidate-and-merge behavior.
- Translate semantic constraints into all four engines before candidate generation.
- Add seam reconciliation, semantic-fidelity reports and blocking conflict behavior.

**Implementation checkpoint:** Phase 7 is verified. Channel masks, true drag selection, named regions, overlay, protection undo/redo, stable semantics, four distinct policies, confidence-labelled import inference, directed-edge watershed protection, deterministic candidate search, atomic conflict handling, fidelity reports and `.excogitare` round trip are implemented. A neutral typed-array payload now enters candidate construction: Excogitare conditions spatial fields, Eccentric conditions polygon allocation and graph paths, Physical conditions sea-level/relief/drainage boundaries, and Polis conditions strategic anchors, edges and territories. The final merge remains an exact Civ V encoding and seam guard rather than a substitute for native constraint compilation.

## Phase 8 — Continuous Lab

- **Status:** Verified.

- Add schema v2, deterministic four-choice construction, automatic generation/prefetch and End and export.
- Preserve v1 import.
- Connect nearest-confusion definitions and Narrative Assessment to exported evidence.

**Implementation checkpoint:** Phase 8 is verified. The Lab schedules all thirty-three identities in deterministic shuffled batches, creates exactly four unique answers from the target's named and structurally related confusions, retains only the current and one prefetched rendered map, advances without correctness feedback, and ends only on explicit **End and export**. Schema v2 retains exact recipes, timing, diagnostics, Narrative Assessment and derived summaries without map snapshots; schema v1 imports as a read-only archive. Direct model tests, rendered-shell tests, the 153-test regression suite, lint, types, production and Pages builds, and a live two-trial Alpine workflow pass. This verifies the evidence apparatus, not human recognizability of the narrative catalogue.

## Phase 9 — Durable projects

- Add the rejecting bundle reader/writer, manifest, hashes, payload limits and schema migrations.
- Add versioned `.excogitare` download/reimport with optional history; do not depend on application-managed persistence.
- Preserve Civ5Map export purity.
- Add transactional import, unsaved-project warnings and imported-map promotion.

**Implementation checkpoint:** Phase 9 is verified. `.excogitare` is a schema-v2 ZIP/DEFLATE bundle with a readable payload manifest, standard SHA-256 hashes, strict archive inspection, 64 MB compressed/expanded ceilings, 160-entry and thirty-history bounds, Full or Current + checkpoints history policy, clean embedded Civ5Map snapshot, safe extension preservation and a pure monolithic-v1 migration fixture. New, Save and Open project actions distinguish project identity from map identity, imported Civ5Maps become new unsaved projects, and close/reload warns without claiming browser persistence. The 157-test combined regression, TypeScript, lint, Vinext production, Pages static verifier and `node:24-alpine` runtime pass; live checks cover project naming, both history policies, Unsaved state, modal dismissal and non-overlapping desktop header layouts.

## Phase 10 — Scenario workspace

- Add Scenario as a peer workspace with Setup, Factions, World, Objectives and Validate stages.
- Move the Scenario draft into the project model and initialize it from imported Civ5Map records.
- Implement capability-labelled Read/Edit/Write/Game-verified support per record family.
- Add explicit faction slots, cities, ownership, routes, improvements, starts and semantic objectives within verified format boundaries.
- Add Scenario validation, project-only disclosure, Repair handoff and confirmed Civ5Map export.

## Phase 11 — Hardening

- Complete Randomise, history, checkpoints, project-file failure recovery, workers, mobile, Pages and Alpine coverage.
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

## Semantic protection

- Stable semantic IDs survive same-dimension revision and report lineage confidence.
- Exact, Shape, Function and Relationship policies produce materially different lawful behavior.
- **Preserve this watershed** retains a valid source hierarchy, catchment identity and outlet while permitting unprotected terrain/content changes.
- Imported-map inference previews extent and confidence before creating a constraint.
- Hard semantic failures reject without replacing the map; accepted soft degradation is recorded in history and Review.
- Dimension resampling is permitted only for non-Exact policies and requires a previewed mapping.

## Lab

- Exactly four unique choices with one correct answer.
- Deterministic target/distractor/position selection.
- Automatic next generation and bounded prefetch memory.
- Indefinite trial growth without retained map snapshots.
- End and export produces complete reproducible v2 evidence.
- v1 import remains valid and future/invalid schemas reject safely.

## Projects

- `.excogitare` round-trips map, recipe, retained structure, assessments, Match Intent, masks, semantic constraints, Scenario draft, checkpoints and chosen history.
- Transactional import rejects corrupted, oversized, traversing, executable and unsupported-future bundles without replacing the active project.
- Version migrations have fixtures and preserve unknown optional fields where safe.
- A project downloaded in one session reimports in a later clean session without relying on IndexedDB, localStorage, an account or a server.
- Reload and close warnings accurately disclose unsaved work; any browser recovery cache is explicitly non-durable.
- Civ5Map exports contain no private Excogitare payload.

## Scenario

- Workspace navigation preserves state across Setup, Factions, World, Objectives and Validate.
- Imported player, city, ownership and route records initialize the draft without mutating source bytes.
- Every record family exposes independent Read/Edit/Write/Game-verified capability.
- Slot, team, start, entity-link, identifier, objective and record-size validators cover supported authoring.
- Project-only fields are disclosed and excluded from Civ5Map rather than silently discarded.
- Representative exported scenarios round-trip byte-safe unrelated data and load in Civ V before receiving Game-verified status.

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

1. **Layer diff and merge:** accept Climate from one branch, Rivers from another and Starts from a third when dependencies remain valid.
2. **Pareto candidate explorer:** compare identity, balance, Match Intent, legality and compute cost without pretending one score is universal.
3. **Ruleset profiles:** load mod-aware resource, wonder and placement vocabularies so validation is not limited to Excogitare's built-ins.
4. **Semantic labels:** expose retained bays, capes, ranges, watersheds, regions and strategic objectives for naming and selection.
5. **Recipe comparison:** show exactly which authoring decisions differ between two generations.
6. **Reproducibility manifest:** export a compact human-readable recipe and generator-version report alongside Civ5Map.
7. **Plugin-quality authoring API:** only after the internal Narrative Profile and pass interfaces survive the complete built-in catalogue.

Project files, semantic protection and Scenario authoring are now part of the rewrite itself. Branch/layer merge remains the most important following feature if Excogitare is to become a compositional editor rather than a generator with more options.

---

# Resolved Phase 0 decisions

1. **Human and AI intent:** ordinary Refine uses counts and Flexible seats; advanced controls permit explicit Human, AI or Flexible seat assignments and teams. Randomise never creates explicit assignments. Projects retain assignments, while Civ5Map receives them only through verified compatible records.
2. **Victory intent:** each victory is Disabled, Enabled or Emphasized, represented by enabled and emphasized sets with the latter constrained to the former. Defaults enable all and emphasize none; ordinary Randomise may add one or two emphases but never disables a victory. Actual Civ V victory rules remain a separate Game-verified Scenario concern.
3. **Archetype names and catalogue:** Sunscourged and Worldfrost replace the borrowed Arrakis and Hoth references as public labels and stable IDs. The initial selector contains two pass-through modes and thirteen authored Archetypes; the registry may expand only through complete behavioral contracts and verification.
4. **Identity Lab mode:** this rewrite implements continuous Blind Recognition only. Learning Mode is deferred and, if later specified, must use separate sessions and evidence so immediate feedback cannot contaminate blind-recognition results.
5. **Mobile generation:** simplified mobile generation uses Standard effort and safe budgets/geometries only. It may display and download higher-effort results but never selects or regenerates them through mobile Randomise.
6. **First Scenario compatibility scope:** require map/scenario metadata, slots and faction identity, starts, cities, ownership, improvements and routes to reach Game-verified support, including preservation of unrelated records. Units, diplomacy, events, victory-rule mutation, time settings, briefings and objectives remain Project only until independently promoted through the compatibility gates.
7. **Project ownership and persistence:** `ExcogitareProject` is the authoritative aggregate root; authored recipe, map, protection, Scenario, history and editor state have single owners, while structures and reports are versioned derived evidence. Downloaded `.excogitare` files are the only durable persistence contract and must reimport in later clean sessions without accounts, cloud saves, server storage or browser storage.
8. **Schema names:** stable conceptual names use an internal `schemaVersion` discriminator rather than versioned type-name suffixes. `MatchIntent` is nested within `GenerationRecipe`; project payloads may not duplicate its authority. The authoritative, derived and application-owned names are frozen in the ownership table.

All product decisions previously listed as open are resolved, schema ownership/naming is approved, the nine feature records are established and the baseline corpus is captured. Phase 0 is complete.

---

# Completion gates

- [x] Plan reviewed and scope approved, including semantic protection as required implementation work.
- [x] Authoritative versioned recipe, Scale, Archetype, Match Intent, Narrative Profile, tile/semantic protection, Scenario and project/provenance models implemented.
- [x] Deterministic pass graph, progress, cancellation, effort levels and migration implemented.
- [x] Design → Refine → Iterate → Edit → Review workflow implemented without operation-driven navigation.
- [x] Scale materially affects every engine without becoming a Map Size alias.
- [x] Archetype can repaint generated and imported topography while preserving structural layers by default.
- [x] All thirty-three accepted Narrative Map Types have runtime profiles, genuine domain behavior, diagnostics and nearest-confusion evidence.
- [x] Polis consumes Human/AI and victory intent in topology and all engines report Match Intent feasibility.
- [x] Three Realms, Thalassic League and Unequal Realms are exposed and complete.
- [x] Drag to Preserve supports channel masks, undo/history, selective regeneration and blocking conflict reports.
- [x] Semantic protection supports stable lineage, Exact/Shape/Function/Relationship policies and **Preserve this watershed** across all applicable engines.
- [x] Iterate history remains continuous and branch-aware.
- [x] Continuous four-choice Lab and schema v2 implemented with v1 compatibility.
- [x] Downloaded `.excogitare` project files round-trip the complete authoring state in a later clean session through safe versioned bundles and transactional migration, without relying on application-managed persistence.
- [x] Scenario workspace implements Setup, Factions, World, Objectives and Validate with capability-labelled Civ5Map support and project-only disclosure. Newly written record families remain at Write until representative Civ V load confirmation.
- [x] Randomise, workers, cloning, history, checkpoints and mobile consequences verified for Phases 1–6.
- [x] Civ V legality, accessibility, rivers, starts, Repair and export regressions pass for Phases 1–6.
- [x] Identity, Match Intent, Scale, Archetype, preservation, Lab, durable-project and Scenario test matrices pass for Phases 1–10.
- [x] Type checking, lint, production build, Pages build and Alpine runtime pass for Phases 1–10.
- [x] README, visual help, feature register, current code and Phase 10 implementation claims reconciled.
