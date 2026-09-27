# V2 generation foundations: evaluation and recommendation

Date: 26 September 2026

## Recommendation

Develop V2 around a persistent world that can be cultivated through geography, history and strategic relationships. The existing engines contain useful, distinct capabilities. The strongest starting point for this user's preferences is Eccentric's regional and watershed structure, supported by Physical's causal processes and an expanded Polis planning and assessment layer. Excogitare's field operations remain useful for shaping and variation.

The architectural improvement is to let these capabilities work on shared, persistent causes and constraints. Their present complete-map outputs cannot simply be run one after another: each must have an explicit responsibility, and changes must be negotiated before final terrain is committed.

Geography-led and gameplay-led creation are useful priorities. They are insufficient descriptions of an engine. Both need coherent places, consequences, transformation and evaluation. The authoring model should express a world's premise, the relationships that make it recognizable, and the kinds of decisions it should invite.

This is an evaluation and proposal. Application code and mockups were not changed. Evidence comprises source inspection, existing gallery inspection, four controlled conversion samples, designer writings, game manuals and procedural-generation research. It includes no new Civ V playtesting or proof of player enjoyment. The historical galleries illustrate previous outputs and are not evidence of current generator quality.

## 1. What the implementation currently does

The repository has four engine paths: Excogitare, Eccentric, Physical and Polis. Assessing all four avoids an ambiguous omission from the request's reference to three engines.

The native architecture is already more substantial than a preset list:

- `lib/narrative-engine-adapters.ts` represents field plans, graph plans, physical conditions and strategic plans separately.
- `lib/generation-structure.ts` retains geographic objects, relationships, river systems, strategic graphs, narrative evidence and provenance.
- `lib/generation-pass-graph.ts` records pass dependencies and invalidation.
- `lib/map-protection.ts` supports preserving exact tiles, shape, function and relationships, including inferred objects on imported maps.
- `lib/map-generator.ts` performs native candidate negotiation and evaluates legality, narrative obligations, content and naturalism.

Those are relevant assets for nurturing a world. They also carry substantial implementation complexity. Large engine functions and later corrective passes make ownership difficult to follow. Reuse should be based on demonstrated behavior and clear interfaces, rather than preserving every existing abstraction.

### The current V2 loses useful distinctions

`lib/studio/model.ts` reduces authorship to six landscapes, three gameplay motifs and four event kinds. `mapOptions()` in `lib/studio/operations.ts` fixes World Character to Realistic and chooses a single Polis preset through motif precedence when Gameplay is selected. This cannot express the full relationship between a premise, its geography and its intended play.

More significantly, `worldFromMap()` deletes native `structure`, infers elevation and climate from final tiles, and starts a new simplified representation. `realizeSurface()` then applies generic terrain, climate and hydrology reconstruction. Its passes and ocean divides are placed through fixed coordinate formulas. Its heartland adjustment paints a central area with grassland.

Removing stale proof after changing a map is appropriate. Discarding the underlying geographic identities and plans makes preservation and refinement much harder. V2 should distinguish authoritative causes from derived evidence: retain causes that remain valid, invalidate dependent claims, and recompute those claims after the affected processes run.

### Controlled conversion samples

One Standard 80 × 52 world was sampled for each engine, with four players, four city states and seed `foundation-evaluation-2026-09-26`. Each native result was given V2's landscape name and passed through `worldFromMap()` and `realizeSurface(..., true)`, matching the initial conversion steps. Later resource placement and balancing were excluded.

| Native foundation | Retained native objects before conversion | Terrain types changed by the V2 surface step | Native structure retained by V2 |
|---|---:|---:|---|
| Eccentric / Great Watersheds | 2,106 | 1,968 / 4,160 — 47.3% | No |
| Physical / Colliding Plates | 133 | 1,833 / 4,160 — 44.1% | No |
| Excogitare / Crooked Continents | 38 | 1,590 / 4,160 — 38.2% | No |
| Polis / Contested Heartland | 31 | 1,818 / 4,160 — 43.7% | No |

Object counts include different kinds of objects, including Eccentric's small construction regions; they are not comparable richness scores. Changed terrain is not inherently bad. These samples establish that V2 substantially reinterprets native output before any user refinement, and removes the native records needed to explain it. They do not establish an engine ranking or a statistical quality estimate. Raw observations are in `research/v2-foundation-conversion-samples.json`.

The current V2 candidate objective is also narrow: balance spread plus a penalty for low fertile-land share. Open generation accepts the first successful candidate. The implemented objective does not assess narrative legibility, alternative strategies, tactical manoeuvring space or a world's development potential.

## 2. What each engine can contribute

| Capability | Valuable foundation | Main limitation for this goal | Recommended development |
|---|---|---|---|
| **Eccentric** | Hierarchical regions, basins, tributaries, navigation barriers and retained place identities. Strong control over relationships among places. | Polygon boundaries can become visible as arbitrary terrain seams or enclosing walls. A graph relationship alone supplies no physical explanation. | Make regions editable, persistent places with causes, softer boundaries, nested landforms and coherent drainage. Use it as the primary compositional foundation for richly authored worlds. |
| **Physical** | Plates, uplift and rifting, erosion approximations, temperature, moisture transport, rain shadows and outlet-directed drainage. Useful explanations for how places came to be. | A plausible process can yield dull strategic geography. The current model is a cartographic approximation; more physical detail does not automatically improve the Civ V board. | Preserve causal fields and add controllable erosion, deposition, lake outlets, glacial and impact processes where they create visible and playable consequences. Expose initial conditions and regional interventions. |
| **Polis** | Settlement regions, routes, fronts, objectives, protected connections and explicit strategic obligations. | It can expose its graph as a board-game diagram. Its planned starts cannot be assumed to govern ordinary multiplayer exports. Connectivity alone is a weak proxy for tactical quality. | Separate strategic analysis from terrain construction. Evaluate any foundation, plan opportunity regions, model access across technologies and assess resource competition, manoeuvring room and alternatives. |
| **Excogitare** | Warped fields and flexible landform shaping; an expressive way to propose silhouettes and local variation. | Noise and shape parameters have limited semantic meaning for an author. Local parameter changes can have broad effects. | Keep useful field construction as a compositional tool and candidate source. Make its features addressable and constrain their effects with the persistent world model. A separate top-level engine choice remains a product decision. |

**Eccentric is the most promising first foundation for this user**, given both the architectural fit and the user's preference for Great Watersheds. That is a reason to prototype there first, not a claim that it is universally the best generator.

Physical is valuable for fantastical and engineered worlds too. An extraordinary initial condition can have ordinary physical consequences: impact basins collect water, surviving rims erode, breached lakes acquire outlets, and highlands cast rain shadows. Fantastical geography should gain its identity from unusual causes and scale rather than arbitrary inconsistencies.

Polis should become useful throughout the workflow. Geography-led worlds can be analysed for strategic consequences; gameplay-led worlds can start with stronger spatial obligations. Both should eventually retain an explanation linking the intended relationship to the actual terrain and routes that realize it.

## 3. What map generation should contribute to 4X enjoyment

There is no universal measurable quantity called fun. Player preferences, rules, opponents and pace matter. The following are design hypotheses to test for this application's human multiplayer use.

### Decisions with consequences

Sid Meier's *Interesting Decisions* frames decisions, information, feedback and pacing as central design questions. For this generator, the practical implication is to assess what the map asks players to choose. Adding more geographic features does not necessarily add another worthwhile decision. [GDC session](https://www.gdcvault.com/play/1015756/)

| Desired experience | Geographic support | Failure to look for |
|---|---|---|
| Discovery and revised plans | Partial views into distinct basins, alternative coast routes, distant opportunities and legible clues to regional character | Repeated interchangeable provinces, or a world whose best plan is obvious immediately |
| Interesting settlement | Several viable city locations trading food, production, access, defence and expansion space | One overwhelmingly best site, or uniformly superior land that removes trade-offs |
| Tactical agency | Staging areas, useful hills, crossings, flank routes, retreat paths and room to deploy | A pass that becomes an indefinite queue, or apparent alternatives that share the same bottleneck |
| Competition without an imposed script | Attractive places reachable by multiple rivals, several useful objectives and approaches | Every player forced toward one decisive tile, or one player privately receiving every valuable frontier |
| Economic interdependence | Regional specialization, complementary resources, maritime opportunity and defensible but exposed trade access | Equal raw resource counts hiding unequal access, or abundance that makes trade and expansion irrelevant |
| Changing priorities | Different travel and resource opportunities as technologies become available | Long empty journeys, or an early advantage that controls every later opportunity automatically |
| Belonging to a particular world | Recognizable regions whose terrain, ecology and history explain their strategic character | Narrative text that could describe almost any generated map |

### Lessons from other 4X games

**Old World:** Soren Johnson describes how city spacing, movement and one-unit-per-tile combat must be designed together. His discussion specifically identifies limited mobility and insufficient manoeuvring space as problems in Civ V. This supports evaluating frontage and deployment areas in addition to route existence. His city-site discussion also identifies long-term planning and settlement choices as central 4X concerns. Civ V should retain its own settlement freedom; the transferable lesson is to generate valuable settlement alternatives. [Combat design](https://www.designer-notes.com/old-world-3-one-unit-per-tile/), [city-site design](https://www.designer-notes.com/old-world-designer-notes-2-city-sites/)

**Endless Legend:** Its manual describes distinct regions with minor factions and resource deposits, including resources revealed by later research. This is a useful example of places carrying several related meanings. Excogitare can give a basin or coast a coherent identity through geography, resources and access without imposing Endless Legend's one-city-per-region rule. [Official manual](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/289130/manuals/User%27sManual.pdf?t=1762445229)

**Stellaris:** Its developers' FTL redesign announcement connects movement rules to exploration, warfare and the usefulness of defences. They moved toward a common hyperlane network with advanced travel unlocked through technology. The transferable lesson is that connectivity must be evaluated under the game's movement rules and at more than one technological stage. [Developer announcement](https://store.steampowered.com/news/posts/?appids=281990&enddate=1509710792)

**Civ V: Brave New World:** Land and sea trade differ in access, range and exposure; internal routes can support city development. Consequently, coasts and neighbours are economic opportunities as well as military relationships. The map evaluator should include viable trade connections and the cost of exposing them. [Official expansion manual](https://steamcdn-a.akamaihd.net/steam/apps/235580/manuals/CIV_V_BNW_PC_ONLINE_MANUAL_ENG.pdf?t=1526513885)

The proposal should remain within ordinary Civ V map capabilities. Rivers are encoded along tile edges; their settlement and crossing effects are meaningful, but a narrative should not promise navigable river shipping. An authored history produces a map at the chosen point in that history. A `.Civ5Map` alone does not supply a new runtime system of advancing ice, flooding, seasons or scripted quests. [Official base manual](https://downloads.2kgames.com/civ5/site13/community/feature_manual/Civ_V_Manual_English_v1.0.pdf)

### Two to four humans changes the evaluation

For two players, a credible alternative front can prevent the entire game depending on one defended approach. For three, a geographically trapped middle position or an uncontested rear can dominate diplomatic possibilities. For four, free-for-all and two-team play need different assessments of contact and mutual access. These are hypotheses about opportunities and pressure, not predictions of what human alliances will do.

Balance should distinguish opening viability, development options, exposure, expansion and later opportunities. Different regions can support different viable plans. Equalizing one yield sum can erase the geography that made them interesting, while still leaving major strategic advantages untouched.

Exact multiplayer starts remain outside scope. Evaluate several plausible sets of settlement regions and report sensitivity to placement. Confirm actual Civ V start behavior with representative game loads; no evaluation of one invented start layout should be described as a multiplayer balance guarantee. Civilization-specific movement and yield advantages also need separate treatment when the roster is known.

## 4. A stronger generation architecture

### A. A world premise with explicit relationships

A premise should specify what must remain recognizable, what may vary and how the world can develop. For example:

> Several mountain-fed basins sustain rival valley civilizations. One shared lowland is attractive but exposed. A breached inland sea creates a second route between two basins.

This creates objects and relationships: sources, divides, trunks, flood basins, passages, settlement opportunities and competing routes. Percentages constrain the realization. They do not fully describe it.

Existing narrative types can supply reference cases and starting recipes. Their current names, ownership boundaries and menu structure need not be restored. The new model should allow a premise to be developed through compatible causes and local choices.

### B. Persistent places, causes and process state

Retain several linked representations:

1. **Places and relationships:** continents, basins, ridges, coasts, crossings and their stable identities.
2. **Causes:** tectonic conditions, former shorelines, impact history, ice, excavation and abandonment.
3. **Process fields:** continuous elevation, drainage, temperature, moisture and any implemented erosion or deposition state.
4. **Strategic consequences:** settlement options, routes, resource access, exposure and technological changes in reachability.
5. **Civ V realization:** legal tiles, river edges, resources and compatible export data.

A proposed edit operates on the appropriate representation. Each affected process updates its dependants. A changed lake outlet may alter a downstream river and its floodplain without changing an unrelated continent.

Imported maps need inferred causes with explicit uncertainty. The application should preserve observed geography and avoid presenting a guessed tectonic history as known fact.

### C. Controllable processes and histories

Useful enrichment operators include uplifting or eroding a range, deepening a basin, breaching an outlet, drowning a shelf, retreating an ice margin, excavating a channel and degrading an engineered embankment. Each should have spatial scope, strength, age where meaningful, dependencies and preservation rules.

Flooding must account for connected water and basin outlets. A recent impact and an ancient eroded crater should produce different rim continuity, drainage and sediment patterns. Human intervention can justify abrupt geometry, but its later consequences still need to be coherent.

Implementation should prioritize effects visible at Civ V's hex scale. Full fluid dynamics or a planetary climate simulator would consume effort without necessarily improving settlement, movement or recognition. The present Physical model is a useful approximation to enrich selectively.

### D. Strategic planning and assessment across foundations

Extend Polis's useful concepts into an analysis service for any generated world. It should reason about:

- Several plausible settlement choices within each broad opportunity region.
- Travel costs for representative units, terrain, rivers and transport capabilities.
- Independent approaches, effective frontage, deployment space and defensive dominance.
- Reachable resource quantities and alternatives at relevant technologies.
- Expansion direction, shared objectives and access to coast and trading partners.
- Sensitivity to player count, teams, civilization abilities and uncertain starts.

Use these findings to propose local geographic changes: a secondary saddle, a viable coastal alternative, a wider staging area, a shifted deposit, or another attractive settlement opportunity. Re-evaluate the affected narrative and physical relationships before accepting a correction.

### E. Search over meaningful changes

Search-based procedural generation depends on its representation and evaluator. The research explicitly notes that searching random seeds provides no useful locality: a nearby seed need not produce a nearby world. Small changes to retained structures and process parameters are more suitable for developing an existing candidate. Multiple objectives help expose trade-offs that a weighted total can obscure. [Togelius and Shaker, search-based PCG](https://www.pcgbook.com/chapter02.pdf)

Start with a bounded set of different foundations. Retain promising, distinct candidates. Improve them through interpretable local changes, preserve important places and allow escape from an unproductive branch. A simple beam of candidates and a library of local operations would be a reasonable first implementation; a complex evolutionary algorithm is not a prerequisite.

Apply hard legality and explicit preservation constraints first. Then assess narrative expression, geographic coherence, strategic opportunity, visual composition and fidelity to the accepted world separately. Keep useful alternatives with different strengths. Avoid optimizing every map toward the same balanced average.

## 5. What nurturing a foundation should feel like

The user accepts a promising world and can then ask for a specific development:

- Make this basin more fertile while keeping its enclosing ranges and river outlet.
- Give these regions another costly route to one another.
- Deepen the impression of an ancient flood while retaining these recognizable shores.
- Reduce the advantage of this broad lowland without making every basin alike.
- Make the polar frontier worth reaching while preserving a harsh interior.

The system proposes a small number of alternatives, shows their geographic differences and explains the likely strategic effects. The existing snapshot strip supports comparison and return. Detailed authors can select, sketch and change process controls; quick users can accept suggested developments or request a completely new randomized world.

Sentient Sketchbook offers a relevant precedent: map sketches, automatic playability checks, visible gameplay properties and alternative designs produced through constrained novelty search. It supports this direction as an authoring approach; it does not prove the same method will yield enjoyable Civ V maps. [Research paper](https://www.antoniosliapis.com/papers/sentient_sketchbook.pdf)

A local refinement should have a change budget and stable object identities. Randomness should be isolated by object or process where practical so that adding a tributary does not perturb distant terrain through a shared random-number sequence. Preserve shape, function and relationship independently where the author needs that distinction.

## 6. Three examples to prove the approach

### Great Watersheds: develop the existing strength

Begin with a few unequal catchments. Build recognizable headwaters, tributaries, trunks and downstream lowlands. Place viable settlement opportunities that trade productive valley land against access, defence and expansion.

Cultivate the world by moving a divide, opening a saddle or developing a flood basin. Preserve the chosen trunks and outlets. A valley should become strategically attractive through multiple real Civ V consequences, while other regions retain credible advantages.

This is the best first prototype because it connects the user's demonstrated preference with an existing structural strength. The key comparison is whether refinement makes the same world more interesting while keeping its identity.

### Comet-flooded interior: a history with consequences

Begin with an old dry continent and its existing drainage. Introduce impacts of different sizes, water deposition as an explicit premise, flooding, rim breaches and a chosen period of recovery. Preserve recognizable dry uplands between the new waters.

Eccentric can organize the basins and connections; physical processes can shape the relief, outlets and recovery; strategic assessment can examine narrow shorelands, valuable passages and viable settlement alternatives. Material and water-budget assumptions should be explicit enough to maintain the user's physical-coherence requirement.

The resulting game should offer choices between protected inland development, coastal opportunity and expensive control of crossings. The comet story should remain legible in the map even without its title.

### Partially thawed polar world: scarce habitable corridors

Begin with glaciated terrain, bedrock basins and a specified climate. Retreat selected ice margins and resolve meltwater routes and connected seas. Keep barren interiors and resource-bearing uplands with costs that remain meaningful.

The intended choices concern productive refuges, difficult inland expansion and maritime access. Evaluate whether valuable frontiers are actually reachable and useful under Civ V's rules. The exported world is a static chosen state of thaw; progression comes from normal technologies and player action.

## 7. How to decide whether this is better

The next development milestone should be a narrow vertical prototype around Great Watersheds, followed by the comet and polar examples. It should demonstrate:

1. **Retention:** native places and causes survive generation, saving and refinement.
2. **Locality:** editing one basin preserves unrelated regions and selected identities.
3. **Causality:** terrain, climate, rivers and resources agree after a transformation.
4. **Opportunity:** the proposed change improves a named gameplay property without breaking another essential property.
5. **Recognition:** people can describe the premise from the map without being told its name.
6. **Enjoyment:** human games reveal worthwhile choices, acceptable downtime and reasons to replay.

Compare matched seeds and settings against the present native generator and current V2. Use several independent seeds, two-, three- and four-human configurations, both geographic and gameplay priorities, and deliberately difficult constraints. Record failures rather than curating only successful images.

Automatic metrics can screen obvious failures. Lightweight exploration, settlement and routing agents can probe specific opportunities. Neither substitutes for human multiplayer sessions. Blind map comparisons and short post-game questions should distinguish beauty, legibility, fairness, strategic variety and enjoyment; win rate alone is inadequate.

Choose numerical acceptance thresholds after collecting baseline distributions and human judgments. Inventing a universal fun score or an arbitrary pass-width threshold would repeat the original problem of constraints with no natural relation to the desired experience.

## Decision

The existing engines provide a credible foundation. The largest gains are likely to come from preserving their meaningful state, strengthening strategic analysis and adding controlled local development. Eccentric offers the best first proving ground, Physical supplies useful causal depth, Polis can connect all foundations to the decisions human players face, and Excogitare's field tools can support their visual realization.

The next UI proposal should follow that authoring model: discover a world premise, accept a promising foundation, cultivate places and consequences, compare revisions, then review and export.
