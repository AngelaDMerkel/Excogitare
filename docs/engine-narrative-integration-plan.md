# Engine–Narrative Integration Plan

## Status and decision

This began as the **migration plan and verification record** grounded in controlled experiments against the former post-hoc architecture. Its measurements and phase notes are retained as history. The later [Narrative-native generation reconstruction](features/narrative-native-reconstruction.md) substantially strengthens the implementation with thirty-three typed native grammars, type-specific invariants, operational relaxation policies, content obligations and invariant-first candidate negotiation. Post-reconstruction automated verification passes; human Identity Lab evidence and representative loading in Civilization V remain independent empirical gates.

Excogitare calls the four choices in Design “Generation Engines”, so this document uses that term. The map renderer—the 2D or isometric view—is a separate system.

The recommended decision is:

> Compile a Narrative Map Type into semantic and relational constraints **before** generation. Let each engine realize those constraints through its own native process. Evaluate the completed candidate against the same semantic contract, and select or relax deterministically. Do not replace a completed engine’s land mask to make the narrative score pass.

### 2026-08 native reconstruction addendum

The original adapters proved the direction but remained too generic: one shared coordinate-field translation was doing too much work, aggregate metrics could stand in for causal proof and a failed candidate could be downgraded after generation. The reconstruction replaces that boundary as follows:

- each Map Type owns a distinct engine-family grammar and at least one non-relaxable invariant;
- Excogitare receives named anisotropic field sources before thresholding;
- Eccentric reserves parent polygons, components and relationship edges before subdivision;
- Physical receives retained crust, boundary, climate and drainage conditions;
- Polis separates start safety, home capacity, routes, barriers and objectives, then verifies the disguised geography against the retained strategic graph;
- authored relaxation steps mutate those native inputs and regenerate a candidate in order; and
- Review and `.excogitare` retain the selected plan, cause bindings, semantic/native/content evidence and concrete weakening consequences.

The historical intervention figures below explain why the work was necessary. They are not evidence for the reconstructed runtime. Current evidence is reported in the reconstruction feature record and its tests.

Map Types remain owned by their designated engine. The neutral contract makes cross-engine experiments technically possible, but the ordinary interface should not expose 132 engine/type combinations until they have their own evidence.

## Why this plan exists

The audited pre-migration architecture contained two different approaches:

1. Eccentric and Physical usually create complete raw geography and then pass it to `realizeNarrativeGeography`, which can construct an exact replacement land mask from narrative regions and paths.
2. Polis compiles its strategic premise inside `generatePolisGeography`; the later narrative function deliberately leaves its geography unchanged.

The second arrangement preserves the engine’s identity much better. The first can produce a map that satisfies a silhouette benchmark while no longer looking as though its coastline, mountain system, drainage and climate arose from one cause.

This explains the recent user observation: an enclosed-sea premise can be recognisable in outline but still look like a generated diagram rather than a natural Civ-style analogue.

## Experiment

### Reproducible harness

The current-state audit is implemented in [`scripts/audit-engine-narrative-integration.ts`](../scripts/audit-engine-narrative-integration.ts).

The catalogue run used:

- all 33 current Map Types;
- two fixed seeds per type;
- Tiny 56×36 maps;
- Standard effort, which currently evaluates one deterministic candidate rather than allowing a broader candidate search to conceal a weak first construction;
- each engine’s most natural baseline character: Fantastical for Eccentric, Realistic for Physical, and Mundane for Excogitare and Polis;
- raw-versus-realized measurements for Eccentric, Physical and Polis;
- final-output measurements for all four engines.

A focused run then used one Standard 80×52 map for twelve representative types:

- Crooked Continents and Lake Kingdoms;
- Ecological Transect, Great Watersheds, Inland Sea Crossroads and Broken Island Chains;
- Dynamic Earth, Volcanic Island Arcs, Inland Supercontinent and Monsoon Continents;
- Imperial Ring and Three Realms.

The original audit could not observe Excogitare’s pre-narrative field result. Phase 1 now retains equivalent raw-native, narrative-realized, legality-normalized and final fingerprints for all four engines without changing tiles or exported game data. The expanded audit therefore includes Excogitare below.

### Aggregate findings

| Engine | Map Types | Raw topology changed by narrative realization | Relief changed | Elevation changed | Interpretation |
| --- | ---: | ---: | ---: | ---: | --- |
| Excogitare | 8 | **34.80%** | 1.80% | 6.96% | The field engine has the highest measured topology replacement, although its relief survives more often than Eccentric or Physical relief. |
| Eccentric | 11 | **33.84%** | 14.87% | 9.72% | The narrative pass commonly replaces one tile in three after graph generation. |
| Physical | 7 | **28.16%** | **42.68%** | 23.04% | The narrative pass often supersedes both plate-derived topology and relief. |
| Polis | 7 | **0%** | 0% | 0% | Narrative strategy is already native to the engine; its main problem is geographic disguise and visual distinctness, not post-generation replacement. |

The Eccentric polygon audit is particularly important. Before narrative realization, an average 2.53% of polygon tiles belonged to a polygon split between land and water. Afterwards this rose to 9.05%. For Inland Sea Crossroads it rose from 0.25% to 13.17%; for Rift Lattice, from 2.88% to 14.98%. The exact tile mask is cutting through the graph units that are supposed to explain Eccentric geography.

The newly observable Excogitare result changes the priority picture: its topology replacement is slightly higher than Eccentric’s. Physical remains the first behavioral pilot because it has the strongest causal contract and the largest relief intervention, but Excogitare is no longer an unknown or a low-risk engine.

### Focused Standard results

| Map Type | Engine | Topology changed | Relief changed | Notable result |
| --- | --- | ---: | ---: | --- |
| Ecological Transect | Eccentric | **48.03%** | 32.28% | Almost half of the graph topology is replaced; the final identity score was only 73. |
| Great Watersheds | Eccentric | **0%** | 5.46% | A strong reference: hydrology guidance strengthens the narrative without replacing topology; score 100. |
| Inland Sea Crossroads | Eccentric | **38.80%** | **51.06%** | The intended seas are obtained by cutting through the completed graph; final horizontal and vertical mirror mismatch were only 9.52% and 7.60%, consistent with an overly diagrammatic form. |
| Broken Island Chains | Eccentric | 34.81% | 11.06% | The parent-arc narrative is visible, but substantial graph geography is discarded. |
| Dynamic Earth | Physical | 35.14% | 41.56% | A nominally general physical world is being substantially redrawn after simulation. |
| Volcanic Island Arcs | Physical | 35.00% | 29.52% | The silhouette is imposed after plates rather than selected from genuine subduction systems. |
| Inland Supercontinent | Physical | 0% | **63.37%** | The current zero-water map has no rivers and 53.75% mountain coverage after final normalization; topology survives only because every tile is land. |
| Monsoon Continents | Physical | **48.22%** | 27.12% | The land/sea thermal arrangement is imposed after the physical pass; final narrative score fell to 61. |
| Imperial Ring | Polis | 0% | 0% | Native strategic structure survives, but low mirror mismatch exposes the board-game construction. |
| Three Realms | Polis | 0% | 0% | Native three-way contact survives; only three major starts were placed in this four-player audit, which must remain visible as a capacity relaxation. |

### What the current narrative score does and does not prove

The full audit produced average narrative scores above 90 for every engine even while Eccentric and Physical were replacing 28–34% of their topology. This is not contradictory: the assessment scores retained narrative motifs, not engine causality or visual naturalness.

The rewrite therefore needs four separate, non-substitutable result axes:

1. **Legality:** Civ V structure, tile rules, accessible land, starts and rivers.
2. **Narrative fidelity:** the selected Map Type’s semantic relationships.
3. **Engine fidelity:** evidence that the selected engine’s native mechanisms caused the result.
4. **Perceptual quality:** naturalness, visual variety and blind recognition.

A high score on one axis must never compensate for failure on another.

The audit’s nearest-neighbour calculation is only a coarse structural warning. It found close metric pairs such as Plate-Built Continents/Wonder Heartlands, Lonely Oceans/Broken Island Chains, Imperial Ring/Contested Heartland and Rival Continents/Thalassic League. It is not a replacement for Identity Lab evidence.

## Responsibility model

The user-facing generation sentence remains:

> **Generation Engine** determines how the world is constructed. **Map Type** determines what geographic story it tells. **World Character** determines the tone of that story. **World Modifier** introduces an additional condition.

The implementation boundary becomes:

| Concern | Authority | May change | Must not do |
| --- | --- | --- | --- |
| Explicit controls | Recipe negotiation | Set hard values or disclose a weakened identity | Be silently overwritten by a preferred narrative envelope |
| Narrative Map Type | Semantic constraint program | Require relationships, counts, roles and tolerances | Dictate a complete tile mask |
| Generation Engine | Native adapter and generator | Choose causal geometry satisfying the program | Ignore hard narrative requirements |
| World Character | Engine-specific interpretation | Change regularity, causality, drama and severity | Replace the Map Type’s narrative verb |
| World Modifier | Complication pass | Add a compatible second condition | Become the primary topology without disclosure |
| Final validation | Civ V legality normalizer, read-only evaluators and negotiation orchestrator | Repair a legal encoding seam, measure the candidate, then reject, select or retry through the orchestrator | Let an evaluator mutate tiles or manufacture a missing narrative in Repair |

## Proposed data model

### `NarrativeConstraintProgram`

The existing `GenerationConstraintPayload` remains the authoritative tile-level contract for user protection and selective regeneration. Narrative generation needs a separate, semantic contract rather than overloading protected tile masks.

The proposed versioned model is:

```ts
type NarrativeConstraintProgram = {
  schemaVersion: 1;
  profileId: MapPresetId;
  verb: string;
  scale: WorldScale;
  hard: SemanticConstraint[];
  soft: SemanticConstraint[];
  exclusions: SemanticConstraint[];
  parameterEnvelope: NegotiatedEnvelope;
  relaxationOrder: string[];
  requiredEvidence: EvidenceDefinition[];
};

type SemanticConstraint = {
  id: string;
  kind:
    | "REGION_COUNT"
    | "COMPONENT_HIERARCHY"
    | "ENCLOSURE"
    | "CONTACT"
    | "SEPARATION"
    | "CORRIDOR"
    | "STRAIT"
    | "ISTHMUS"
    | "PENINSULA"
    | "RANGE"
    | "WATERSHED"
    | "CLIMATE_SEQUENCE"
    | "RESOURCE_GRADIENT"
    | "START_REALM"
    | "ROUTE_REDUNDANCY";
  roles: string[];
  range?: [number, number];
  tolerance: number;
  scaleLaw: "FIXED" | "AREA" | "LINEAR" | "PLAYER_COUNT" | "REALM_COUNT";
  priority: number;
  evaluator: string;
};
```

The program expresses “two or three enclosed great seas connected by one narrow navigable strait” rather than “make these 873 tile indices water”.

### Hard requirements and soft preferences

Hard requirements cover:

- Civ V legality;
- requested water and mountain values within the stated tolerance;
- required connectivity or isolation;
- required player capacity;
- semantic relationships indispensable to the narrative verb;
- protection constraints;
- no inaccessible land;
- valid river outlets and continuous edges.

Soft preferences cover:

- irregularity;
- broken rather than uniform ranges;
- preferred basin proportions;
- visual asymmetry;
- climate transitions;
- resource gradients;
- the number of secondary features;
- avoidance of the nearest-confusion profile.

Every program has an explicit relaxation order. If no candidate satisfies all hard narrative requirements after the selected effort budget, the generator either:

1. relaxes the lowest-priority narrative requirement and records it;
2. reduces players or city states when geography cannot legally fit them and the existing capacity policy permits it; or
3. fails without installing a partial map.

It never silently redraws the completed map.

### Semantic extraction and evaluation

After each candidate completes its native passes, one common evaluator extracts:

- land and water components with hierarchy;
- enclosed and edge-connected basins;
- straits, canal-capable isthmuses and peninsulas;
- mountain ranges, saddles and passes;
- watersheds, tributaries, outlets and deltas;
- climate regions, transitions and rain shadows;
- start realms and city-state regions;
- strategic routes, centrality and redundancy;
- value gradients and resource-access obligations.

Definitions must be topological, not decorative:

- a **strait** is a one- or two-tile navigable throat joining two materially larger water regions;
- an **isthmus** is a one- or two-tile settleable land throat whose removal separates materially larger land regions, with water on both sides;
- a **broken range** has substantial coverage but plural passes, varied thickness and discontinuities;
- an **enclosed sea** is a coherent water body not connected to a map-edge ocean under the selected wrap model;
- a **watershed** is a drainage catchment whose continuous rivers terminate in a legal lake or sea.

The evaluator returns measurements and object identities. It does not mutate the candidate.

## Engine adapters

### 1. Excogitare: field-native constraints

Excogitare should translate the program into continuous influence fields before thresholding:

- continental cores and shelf fields;
- basin depression potentials;
- rift, gulf and corridor splines;
- ridge and escarpment fields;
- anisotropic growth directions;
- multi-scale erosion and coastline perturbation;
- shallow/deep bathymetry ancestry.

The adapter may reserve broad semantic zones, but exact shorelines remain the field engine’s result. Candidate evaluation selects the field realization that best satisfies the program.

Required groundwork:

- extract an exported, read-only raw `ExcogitareGeography` boundary equivalent to the other three engines;
- retain named field sources and their influence in `GenerationStructure`;
- measure how much final legality normalization changes those fields;
- prohibit the narrative compiler from directly calling `exactNarrativeMask`.

### 2. Eccentric: graph-native constraints

Eccentric should translate the program before its graph is partitioned:

- reserve graph components and basin membership;
- choose parent polygons for realms, seas, scars and heartlands;
- reserve edges for straits, isthmuses, passes and river trunks;
- define graph growth grammar and hierarchy;
- assign regional biome collections only after topology roles are stable;
- use subpolygons to make the reserved relationships irregular, not to cut across completed polygons.

The target is not zero mixed polygons—coasts may cross small cells—but large post-hoc increases in graph impurity must disappear.

Great Watersheds is the current architectural reference because it adds hydrologic guidance without changing the raw land mask.

### 3. Physical: process-native boundary conditions

Physical should translate narrative constraints into initial and boundary conditions:

- continental versus oceanic crust probabilities;
- plate seed placement and age;
- velocity and convergence relationships;
- rift and subsidence tendencies;
- uplift and erosion budgets;
- sea-level candidate range;
- prevailing wind, ocean influence and seasonal forcing;
- drainage outlet and endorheic-basin conditions.

Mountains must arise from convergence, uplift or erosion-resistant structure. Island arcs must arise from subduction boundaries. Rain shadows must arise from relief in the wind path. The adapter may search multiple initial conditions; it may not paint the desired result over unrelated plates.

Physical should retain causal evidence such as plate ownership, boundary class, uplift source, erosion age, moisture path and watershed outlet for every semantic object used by the narrative assessment.

### 4. Polis: strategic graph plus geographic disguise

Polis already compiles strategy before geography. The rewrite should preserve that strength and add a second native planning layer:

1. construct and validate the strategic graph;
2. compile graph edges and nodes into broad geographic affordances;
3. use character-aware field or graph growth to disguise those affordances as plausible continents, basins, ranges and coastlines;
4. re-evaluate strategic capacity after disguise;
5. reject candidates where appearance destroys required routes or where the board-game skeleton remains visually exposed.

Polis needs an explicit **strategic symmetry versus visual symmetry** distinction. Equivalent travel, yield and contact do not require mirrored coastlines.

## Revised relationship for the two inland-sea premises

The latest design direction changes the current Inland Supercontinent contract. The plan treats that direction as authoritative and separates the two related Map Types as follows:

### Inland Sea Crossroads — Eccentric

- multiple enormous resource-rich inland seas;
- land is scarce and pressed toward the margins;
- Bosporus-like straits connect major basins;
- Panama-like one- or two-tile isthmuses create canal-city opportunities;
- naval control dominates;
- small islands are occasional geographic punctuation, not the primary land form;
- the graph grows seas first, then allocates marginal land around them.

### Inland Supercontinent — Physical

- one dominant continental framework surrounds one great interior sea or a tightly related central basin system;
- no external world ocean;
- broad desert and broken peripheral highlands make the interior sea the economic and hydrologic focus;
- mountain arcs cover roughly 55–75% of the perimeter, vary in thickness, and contain several saddles and passes;
- rivers drain inward and create valuable shores, deltas or terminal lakes;
- remote deserts and uplands carry strategic or luxury rewards rather than becoming empty padding;
- the current zero-water default is replaced by a preferred internal-water envelope; zero water remains an explicit weakened variant with salt basins and dry drainage.

The narrative identity guide must be reconciled with this revised contract before runtime migration begins.

## Catalogue migration matrix

### Excogitare

| Map Type | Native constraint expression | Principal migration test |
| --- | --- | --- |
| Crooked Continents | Three to five core fields, deep gulf/rift splines, hooked growth axes and retained interiors | Intrusion depth and route surprise increase without uniform coastline noise |
| Broken Pangaea | One dominant continental potential divided by floodable fracture corridors and plural sutures | Fractures express as sea, lake, basin or range according to water while robust land connectivity remains |
| Drowned Shelves | Parent shelf fields submerged to different depths, retaining uplands, ridges and shallow-water ancestry | Clusters reconstruct drowned parents and do not become independent island confetti |
| Lake Kingdoms | One bounded land field with hierarchical depression potentials and endorheic outlets | Enclosed-water hierarchy survives at all legal water values; edge ocean remains negligible |
| Island Continents | Several separated parent fields with settlement interiors, local shelves and satellites | Principal realms remain destinations rather than fragments or stepping-stone chains |
| Deep-Ocean Divides | Abyssal rift fields generated before shelf allocation | Astronomy basins are genuine navigation gates with locally viable worlds |
| Land and Sea Maze | Dual land/water corridor fields with loops, false leads and unequal route stretch | Navigation is genuinely difficult without inaccessible areas or regular islands |
| Patchwork Provinces | Province influence fields with incompatible local topology, ecology and economy | Provincial laws are internally coherent and boundaries remain legible without biome confetti |

### Eccentric

| Map Type | Native constraint expression | Principal migration test |
| --- | --- | --- |
| Ecological Transect | One graph-spanning causal sequence from coast through wetland, plains, range and rain shadow, with allowed narrative variants | The environmental sequence is readable without replacing graph topology |
| Plate-Built Continents | Each parent graph component receives a distinct geological history and boundary grammar | Continents differ by process rather than only climate palette |
| Great Watersheds | Preserve current topology; reserve highland nodes, tributary edges, trunk corridors and delta nodes | Remains the reference for low-intervention narrative guidance |
| Inland Sea Crossroads | Allocate two to four great sea components first; reserve a small number of strait and canal-isthmus edges; grow scarce marginal land | No island proliferation; land scarcity, valuable seas and strategic throats dominate |
| Wonder Heartlands | Realm graphs surround concentrated value hearts with mountain or barren separators | Heartlands are materially valuable and their marches materially ordinary |
| Encircled Seas | One robust exterior land-cycle graph encloses a hierarchy of internal water components | Continuous journey survives removal tests and avoids a geometrically perfect ring |
| Scarred Pangaea | One dominant connected graph receives a few branching or ringed alien scar systems | Scars reorganize one pangaea without shredding it |
| Rift Lattice | Deep-water barrier graph is authoritative; viable local worlds fill unequal cells | Fractures form a hierarchy and do not read as decorative channels |
| Lonely Oceans | One viable realm per distant basin with explicit minimum separation and empty-water budget | Early isolation persists; minor islands do not create coastal hopping |
| Great Peninsulas | A continental trunk graph grows complete lobe provinces through narrow but robust necks | Peninsulas read as Floridas or Italys, not shoreline bumps |
| Broken Island Chains | Directional parent paths own anchors, satellites, gaps and age sequence | Several distinct arcs survive; islands remain related without becoming regular beads |

### Physical

| Map Type | Native constraint expression | Principal migration test |
| --- | --- | --- |
| Dynamic Earth | Candidate plate systems must expose several linked transformations at different stages | Chronology is readable from retained causality, not narrative repainting |
| Colliding Plates | Bias continental plates toward selected convergent contacts and preserve forelands and passes | Ranges align with convergence and remain traversable |
| Ancient Continental Shields | Old cratonic cores, restrained activity, long erosion and mature drainage | Broad shields, ghost ranges and mineral cores differ from merely “few mountains” |
| Volcanic Island Arcs | Reserve oceanic–continental or oceanic–oceanic subduction contacts and back-arc basins | Curved pearl systems follow real plate boundaries and show age progression |
| Inland Supercontinent | Continental enclosure, central subsidence/sea, inward drainage and broken peripheral uplift | Sea-focused economy, endorheic hydrology and natural broken ranges replace the all-land wall |
| Monsoon Continents | Warm-ocean exposure, seasonal pressure contrast, moisture funnels and wind-facing ranges | Wet fronts, great rivers and leeward dry interiors arise from one causal system |
| Glacial World | Preserve current native topology; drive ice sheets, refuges and frontier value from temperature and glacial fields | Remains the Physical reference for climate narrative without topology replacement |

### Polis

| Map Type | Strategic contract and geographic disguise | Principal migration test |
| --- | --- | --- |
| Imperial Ring | Isolated outer starts, neighboring fronts and plural routes into a broad shared axle; disguise with character-native terrain | Plays radially but does not look like a literal wheel |
| Opposing Fronts | Two teams, defended home regions, broad DMZ and several invasion theatres | Team relationship is obvious in play; world is not a mirrored rectangle |
| Contested Heartland | Many-to-many porous route mesh around valuable country; prohibit radial spokes | Multiple flanks distinguish it from Imperial Ring |
| Rival Continents | Two populated systems linked by several costly hinge theatres | Crossings resemble straits, short seas and mountain valleys rather than symmetric bridges |
| Three Realms | Three teams, every pair in contact, two-front opportunities and victory-aware objective placement | Three-way politics survives geographic disguise and legal capacity checks |
| Thalassic League | Many-to-many port graph, redundant sea lanes, islands and strategically distributed city states | Naval and diplomatic network differs from two-bloc Rival Continents |
| Unequal Realms | Tall, Wide, War and Turtle roles receive deliberately different but viable obligations | Role asymmetry remains measurable without producing a plainly partitioned board |

## Implementation phases

Historical progress: the first migration completed Phases 0–8 and removed the post-hoc topology realizer. The subsequent native reconstruction changes generator output and evidence contracts, so its own Phase 9 matrix supersedes the earlier test/build counts. Human blind-recognition evidence and representative Civ V loading remain external verification gates in either architecture.

### Phase 0 — Contract reconciliation

- Reconcile the latest Inland Supercontinent direction with the narrative identity guide.
- Freeze semantic definitions for strait, isthmus, enclosure, broken range, watershed and strategic corridor.
- Record hard requirements, soft preferences and relaxation order for all 33 types.
- Keep current runtime unchanged.

Exit: the identity document, feature record and this plan agree.

Status: **Verified.** [`narrative-semantic-contracts.md`](narrative-semantic-contracts.md) freezes the shared definitions and all thirty-three per-type contracts. Inland Supercontinent is reconciled and implemented as a Physical native grammar with a dominant enclosed interior sea; the current final matrix passes.

### Phase 1 — Observation before mutation

- Move common metrics from the audit harness into a read-only diagnostics module.
- Export Excogitare’s raw field geography without changing generation.
- Add raw, adapted, final and legal-normalized stage fingerprints.
- Add engine-fidelity evidence to generated projects.
- Create deterministic contact-sheet fixtures for selected seeds and sizes.

Exit: all four engines can be measured at equivalent boundaries.

Historical Phase 1 status: **Verified against the observation-only architecture.** Generated structures and downloaded projects retained deterministic raw-native, narrative-realized, legality-normalized and final evidence. A defensive snapshot callback supports [`../scripts/render-engine-narrative-contact-sheet.ts`](../scripts/render-engine-narrative-contact-sheet.ts). Payload hashes were unchanged only while this phase observed generation without altering it; owner-engine native grammars deliberately change those payloads, so the reconstruction requires a newly reviewed baseline.

### Phase 2 — Neutral constraint compiler

- Introduce `NarrativeConstraintProgram`.
- Compile existing profiles into programs without consuming them in runtime generation.
- Add semantic extractors and pure evaluators.
- Compare new evaluator output with current assessment; do not select candidates from it yet.
- Define a strict versioned project migration.

Exit: every Map Type compiles deterministically and every evaluator is testable against hand-built fixtures.

Status: **Verified.** Contracts 2A and 2B are implemented, Contract 2C persistence is verified, and Contract 2D compiles all thirty-three accepted identities into deterministic programmes with complete essential, preferred, anti-motif, evidence and relaxation coverage. Their native runtime integration passes the reconstruction's final matrix.

### Phase 3 — Physical pilot

Migrate:

1. Dynamic Earth as the neutral control;
2. Inland Supercontinent as the revised topology/hydrology pilot;
3. Monsoon Continents as the coupled climate pilot;
4. Volcanic Island Arcs as the causal-boundary pilot.

Remove post-hoc topology replacement for those types only. Retain a feature flag for exact before/after comparisons, not as a user-facing legacy mode.

Exit: no pilot changes more than 2% of land/water tiles after native Physical completion, except disclosed legality seams; all narrative and engine-fidelity thresholds pass.

Status: **Verified.** Physical consumes topology, uplift, temperature, moisture and drainage guidance as initial or native-pass conditions. Dynamic Earth, Inland Supercontinent, Monsoon Continents and Volcanic Island Arcs retain physical causes; the revised Inland Supercontinent has 30% preferred internal water, negligible edge ocean, inward watersheds and broken peripheral uplift. Fixtures record zero raw-native to narrative-realized topology intervention, and the final representative matrix passes.

### Phase 4 — Eccentric pilot

Migrate:

1. Great Watersheds as the known low-intervention control;
2. Inland Sea Crossroads as the sea/strait/isthmus pilot;
3. Broken Island Chains as the parent-system pilot;
4. Ecological Transect as the regional-sequence pilot.

Exit: graph polygon impurity does not materially increase after generation; no exact narrative land mask is used; Identity Lab reviewers can distinguish the four pilots from their nearest confusions.

Status: **Verified within the automated contract.** Great Watersheds, Inland Sea Crossroads, Broken Island Chains and Ecological Transect consume graph reservations before topology is reconciled. Climate realms retain two-to-four contiguous biome collections; Inland Sea Crossroads retains two-to-four semantic sea basins, deliberate straits, a settleable canal site and one marginal land system across its focused reference seeds. The final automated matrix passes; human nearest-confusion evidence remains separate empirical work.

### Phase 5 — Excogitare pilot

Migrate:

1. Lake Kingdoms;
2. Crooked Continents;
3. Drowned Shelves;
4. Land and Sea Maze.

Exit: field influences and resulting semantic objects are retained; navigation and shelf ancestry are measured; no topology is written by the evaluator.

Status: **Implemented; focused verification passed.** Excogitare consumes continuous topology, relief, climate and river fields before thresholding and retains their causal objects. The common evaluator is read-only; candidate selection and relaxation belong to the negotiation orchestrator.

### Phase 6 — Polis geographic disguise

- Separate strategic equivalence from visual symmetry.
- Add geography-disguise candidates constrained by the strategic graph.
- Migrate Imperial Ring and Contested Heartland first because the audit found them structurally close.
- Then migrate Rival Continents and Thalassic League.
- Finish Three Realms, Opposing Fronts and Unequal Realms.

Exit: strategic metrics remain within tolerance while mirror similarity and perceptual “board” reports improve.

Historical Phase 6 status: **Implemented; focused verification passed under the pre-reconstruction contract.** At that checkpoint, the later Narrative-native reconstruction had reopened strict Polis verification around roster-aware plan cardinality, exact route media and complete per-type relationships. Those current native contracts now pass their strict matrix; the separate Perceptual axis remains explicitly unassessed, and human perception remains an Identity Lab gate.

### Phase 7 — Complete catalogue migration

- Migrate the remaining owner-engine types using the catalogue matrix.
- Remove all runtime calls that use `exactNarrativeMask` to rescue completed geography.
- Retain exact masks only in hand-built evaluator fixtures if useful.
- Preserve all explicit controls, protection, Randomise safety and deterministic history behavior.

Exit: all 33 types use native adapters and no owner-engine type depends on post-generation topology replacement.

Status: **Verified.** All thirty-three owner-engine types compile deterministic programmes and adapter plans. Runtime calls and definitions for `realizeNarrativeGeography` and `exactNarrativeMask` have been deleted. Catalogue fixtures record zero native-to-realized topology change; explicit protection constraints enter each owner engine before final legality normalization. The complete current regression and packaging matrix passes.

### Phase 8 — Interface and project evidence

- Add a compact Review report with four axes: Legal, Narrative, Engine and Perceptual Evidence.
- Show only concise status and meaningful relaxations by default; explanations live in hover/focus detail and an expanded report.
- Retain constraint program, adapter plan, causal objects, evaluation and relaxations in `.excogitare`.
- Keep `.Civ5Map` export geography-only unless the user explicitly chooses a separately verified export target.
- Do not expose technical adapter controls in Design.

Exit: a user can understand why a map passed, weakened or failed without reading raw diagnostics.

Status: **Verified.** Review begins with compact Legal, Narrative, Engine and Perceptual cards. Ordered weakenings are disclosed; hover and focus reveal details. `.excogitare` evidence retains present programme, adapter causes, semantic model, evaluation and relaxations when those payloads exist, while `.Civ5Map` remains geography-only. The current rendered-interface, build and live-runtime rerun passes.

### Phase 9 — Verification and removal of the old path

- Run the full matrix below.
- Collect representative Identity Lab evidence.
- Compare performance and memory against current Standard and Exhaustive effort.
- Verify production, Pages and live Alpine Docker runtime.
- Delete the feature flag and old mutation path only after comparative evidence is retained.

Exit: the register, code, plan, tests, README and runtime agree.

Historical status: **Superseded verification record.** The listed TypeScript, lint, rendered-shell, domain, production, Pages and Alpine checks passed for the first migration. Because the native reconstruction deliberately changes generator behavior, those exact counts and payload fixtures cannot be reused as proof. The reconstruction record owns the current rerun and baseline review. Representative new Identity Lab sessions and manual Civ V loads remain explicitly unverified rather than inferred from automated output.

Current automated status: **Verified.** After retirement of the Lua-only tests and addition of legacy-workspace migration coverage, the complete TypeScript corpus passed **278/278**; the repeated all-33 audit remains **33/33** with digest beginning `47a2fc…`; type checking, lint and diff checking pass; the fresh rendered shell passed **24/24**; Vinext production and the Lua-free Pages export with **3 public files** and **23 JavaScript bundles** pass; the reviewed contact-sheet hash begins `7ec925…`; Node 24 Alpine built, started and returned HTTP 200; and the final baseline digest begins `e6dae37…`. Human recognition and representative real Civ V loading remain the separate empirical gates described below.

## Verification matrix

### Automated

The final automated matrix is representative and deliberately not a Cartesian product of every seed, size, Scale, Character and control. It must contain:

- exhaustive schema/catalogue checks for exactly thirty-three contracts, grammar families, invariants, content patterns and ordered relaxation policies;
- deterministic owner-engine generation for every Map Type on at least two fixed safe-size seeds, checking native invariants, essential semantic floors, applicable content evidence, zero evaluator topology mutation, Civ V tile legality, accessibility, resources, rivers, five-hex start separation, Repair cleanliness and geography-only Civ5Map structure;
- representative Standard fixtures for every engine and the identities with size-sensitive seas, peninsulas, watersheds, glaciers, strategic graphs or population contracts;
- representative Huge or Colossal coverage for each engine's expensive path, including start-only worker transport and capacity behavior, without implying that every identity is multiplied across every large budget;
- an orthogonal Scale matrix covering every engine at every Scale, and an orthogonal World Character matrix covering every engine with representative owner identities;
- targeted preferred, boundary and out-of-envelope water, mountain, wrap, projection, population and protection conflicts for the grammar families those controls can materially weaken;
- deterministic Standard and Thorough candidate order, authored-relaxation retries, and targeted Exhaustive memory/cancellation behavior;
- each applicable narrative content pattern under ordinary and sparse-compatible settings, without requiring absent user-requested wonders or resources to be invented;
- project export/import, current/history/checkpoint alias safety, optional capability handling, stale-evidence reconciliation, selective regeneration, worker cancellation and atomic failure; and
- TypeScript, lint, rendered-interface regression, production, Pages/static-export and live Node 24 Alpine checks.

Experimental budgets and geometries remain behind Game Breaking and receive their own boundary and failure-behavior tests. They are not a Civ V compatibility promise.

### Visual

Create deterministic representative contact sheets showing:

- raw native engine output;
- adapted candidate;
- final legal map;
- semantic overlay;
- engine-causality overlay;
- nearest-confusion comparison.

Contact sheets are a development aid, not automated recognition evidence. Reviewers should first assess naturalness and engine identity without labels, then gather the separate four-choice Identity Lab evidence described below.

### Empirical Identity Lab

Run new blind sessions against reconstructed maps, retaining enough trials to report per-type results and nearest-confusion pairs honestly. The existence of the Lab, a structural score or a visually reviewed contact sheet does not satisfy this gate.

### Empirical Civ V

For every engine, load representative ordinary maps from the Maps folder at Standard and Huge. Fixed-start and Scenario targets remain separate compatibility programmes. Engine–Narrative work must not reintroduce scenario bytes into ordinary map export.

### Performance

Candidate search is deterministic and bounded by Generation Effort:

| Effort | Intended use | Candidate policy |
| --- | --- | --- |
| Standard | Normal generation and mobile ceiling | One candidate; disclose weakening |
| Thorough | Desktop quality search | Larger set with full semantic evaluation |
| Exhaustive | Deliberately compute-intensive | Broad search, cancellation and memory estimate required |

Hard validation occurs for every candidate. Perceptual recognition is not estimated from a structural proxy inside candidate selection.

## Acceptance criteria

The automated reconstruction can be called complete only when:

1. all 33 Map Types compile to deterministic semantic programs;
2. all four engines consume those programmes before completing native geography;
3. no narrative evaluator writes topology;
4. Eccentric graph impurity does not materially increase after the graph pass;
5. Physical narrative objects retain a plausible causal chain to plate, erosion, climate or drainage evidence;
6. Excogitare exposes and retains field causes;
7. Polis preserves strategic equivalence without requiring visual symmetry;
8. hard semantic failures reject or explicitly relax rather than being hidden by an aggregate score;
9. standard generation remains within the declared browser and mobile resource budget;
10. project round trips preserve programmes and evidence;
11. generated maps remain Repair-clean and ordinary `.Civ5Map` exports remain structurally valid;
12. the representative automated matrix above, including current Pages, production and Alpine runtime checks, passes;
13. reviewed deterministic baselines record every deliberate payload change; and
14. the old post-hoc topology replacement path is removed.

Human recognisability and Civ V runtime compatibility remain separate empirical gates. After the automated matrix passes—but before representative Identity Lab sessions and real game loads are recorded—the implementation may be described as structurally implemented and automatically verified, but not as human-recognisable or game-verified. Fixed-start and Scenario exports retain their own stricter compatibility programmes.

## Risks

- **Constraint overreach:** Too many hard requirements can make maps repetitive. Keep only the narrative verb and indispensable relationships hard.
- **Candidate cost:** Native search is more expensive than exact masks. Bound effort, stream candidates and reject cheap failures early.
- **False naturalness metrics:** Symmetry and component counts are proxies. They require visual and human evidence.
- **Engine convergence:** A shared programme could make engines more alike. Engine adapters must retain causal evidence and engine-specific acceptance thresholds.
- **Control conflict:** Explicit user settings can weaken a narrative. Report the conflict and follow the recorded relaxation order.
- **Repair scope creep:** Repair should make a map legal, not retrofit an authored premise.
- **Migration instability:** Move type by type behind comparative fixtures; do not replace all engines in one undifferentiated change.

## Historical sequencing rationale

The migration began with Phase 0 and Phase 1, then used Physical as the first pilot because it had the largest measured relief intervention, the clearest causal contract and a concrete Inland Supercontinent acceptance target. Great Watersheds and Glacial World served as control cases. This sequence is retained to explain the implementation history; it is not the current next-action list.
