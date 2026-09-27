# Narrative Semantic Contracts

## Status

This document began as the Phase 0 freeze for all thirty-three current Narrative Map Types. It now remains the prose authority for the implemented native contract catalogue in `lib/narrative-native-contracts.ts` and `lib/narrative-program-catalogue.ts`. Automated reconstruction verification passes; blind recognisability and representative Civ V loading remain separate human gates.

Every contract separates:

- **Hard relationships:** indispensable to the narrative verb. A candidate must satisfy them or disclose a named relaxation.
- **Soft preferences:** improve identity and naturalness but may vary freely between seeds.
- **Relaxation order:** the order in which narrative requirements may weaken after explicit controls, Civ V legality and requested population capacity have been considered.

## Global precedence

1. Civ V structural and placement legality.
2. Explicit user protections.
3. Explicit water, mountain, player, geometry, wrap and projection settings.
4. Minimum accessible settlement capacity and valid continuous hydrology.
5. The Map Type’s hard relationships.
6. World Character interpretation.
7. World Modifier complications.
8. Soft narrative preferences and decorative variation.

The generator may reduce population only through the existing capacity policy and must report it. It may never change an explicit control merely to improve a narrative score.

## Frozen semantic definitions

### Enclosed sea

A coherent water body that has no navigable connection to an edge-connected world ocean under the selected wrap model. It must be materially larger than a decorative lake and support its stated naval or hydrologic role.

### Strait

A continuous navigable throat one or two tiles wide at its controlling section, joining two materially larger water bodies. Widening beyond the throat must occur on both sides. A coastal notch or one-tile lake channel is not a strait.

### Canal-capable isthmus

A passable, settleable land throat one or two tiles wide at its controlling section, separating two materially larger water bodies. Removing the throat must divide materially larger land regions or open a direct water connection. It must not contain a mountain, wonder, ruin, barbarian camp or forced start.

### Peninsula

A settlement-capable land province attached to a materially larger parent landmass through a substantially narrower neck. It needs a regional interior and coastline on several sides; a short shoreline bump is not a peninsula.

### Broken mountain range

A correlated highland system with a readable axis, variable thickness, multiple deliberate saddles or passes and at least one meaningful discontinuity. It may constrain travel but cannot seal accessible land.

### Watershed

A catchment containing one or more continuous river branches that descend toward one retained legal lake or sea outlet. A watershed may be endorheic, but its terminal basin must be explicit.

### Strategic corridor

A connected passable route between strategic regions whose width, alternatives and control value are retained. A straight decorative strip is not sufficient; the route must change actual travel or contact.

### Navigation basin

A locally coherent maritime region within which coastal or ocean travel is possible before a named deep-water barrier or technology-gated crossing is traversed.

## Excogitare contracts

| Map Type | Hard relationships | Soft preferences | Relaxation order |
| --- | --- | --- | --- |
| Crooked Continents | Three to five substantial continental interiors; each has regional-scale maritime intrusions; at least two routes exhibit false proximity without inaccessible land | Hooks, fjords, nested gulfs, shed shelf islands, coastal ranges and irregular interior travel | Reduce secondary intrusions → reduce false-proximity cases → reduce continent count; never collapse into island confetti |
| Broken Pangaea | One robust dominant land system; two or more continental fractures; at least two independent overland connections between principal lobes | Flooded rifts, lakes, salt basins, escarpments, mountain shoulders and short naval alternatives | Reduce secondary fractures → widen surviving sutures → convert flooded fractures to dry relief; retain one visibly breaking continent |
| Drowned Shelves | Four to seven parent shelf clusters; each has a viable anchor and related fragments; deep water separates principal clusters | Shallow-water ancestry, ridge-aligned fragments, internal channels and mixed island sizes | Remove minor fragments → merge secondary clusters → expose shelf bridges; never replace parent clusters with random islands |
| Lake Kingdoms | One dominant bounded land framework; hierarchical enclosed waters; negligible edge-connected ocean; broad settlement regions remain connected | One or two great inland seas, secondary lakes, basin rims, endorheic rivers and inland coasts | Remove small lakes → contract great seas → expose dry basins; preserve bounded terrestrial kingdoms |
| Island Continents | Four to seven viable island-continent realms; each has a real interior and local satellites; deep crossings prevent continuous coastal hopping | Different local silhouettes, shelves, landing theatres and modest ecological personalities | Remove satellites → enlarge crossings less → merge the smallest realms; reduce population before accepting unusable scraps |
| Deep-Ocean Divides | Two or more navigation basins; coherent deep-water barriers; each populated basin has viable land and local interaction | Rift-margin shelves, rare narrows, island bridges and strong coast/abyss contrast | Reduce secondary barriers → add a costly crossing → merge the smallest basin; retain at least one technology-gated divide |
| Land and Sea Maze | A connected dual land/water maze; several route choices have high stretch; no land region is inaccessible | Loops, false leads, chambers, unequal corridors and deceptive local proximity | Remove blind alleys → widen narrow corridors → reduce chamber count; never regularize into rows of islands |
| Patchwork Provinces | Six to twelve internally coherent provinces; adjacent provinces differ materially in geographic, ecological or economic rule | Sharp but composed boundaries, local biome collections, valuable and barren provinces | Blend minor boundaries → merge the closest provinces → reduce province count; retain multiple incompatible local laws |

## Eccentric contracts

| Map Type | Hard relationships | Soft preferences | Relaxation order |
| --- | --- | --- | --- |
| Ecological Transect | One large connected landscape; one causal environmental sequence crosses several extensive regions; geography explains the sequence | Coast → marsh/rivers → grassland → range → rain shadow, or another equally compelling natural story | Reduce secondary ecological regions → shorten the sequence → soften contrasts; do not substitute islands or unrelated biome patches |
| Plate-Built Continents | Several principal continents; each retains a different geological history; major relief aligns with authored graph boundaries | Active margins, passive margins, rifts, shields, volcanic provinces and eroded interiors | Simplify minor histories → merge similar histories → reduce continent count; retain at least three process identities |
| Great Watersheds | Several mountain-fed catchments; tributaries merge into dominant trunks; every trunk has a legal lake or sea outlet | Floodplains, marsh belts, distributary deltas, inland lakes and hierarchical wet lowlands | Reduce minor tributaries → reduce delta branches → reduce catchment count; never accept discontinuous or outletless rivers |
| Inland Sea Crossroads | Two to four enormous enclosed seas; scarce marginal land; at least one true strait and one canal-capable isthmus when scale permits | Resource-rich seas, strategic coastal cities, tiny punctuation islands and varied basin proportions | Remove minor islands → reduce secondary seas → retain either the strait or isthmus if scale prevents both; never become an archipelago |
| Wonder Heartlands | Several viable realms surround concentrated legal value hearts; each heart is separated by mountains or low-productivity marches | Natural wonders, luxury clusters, fertile pockets, legendary geography and sparse ordinary hinterland | Reduce heart value excess → soften marches → reduce heart count; preserve a strong heart-to-march contrast |
| Encircled Seas | One robust asymmetric exterior land circuit; hierarchical inner waters; the circuit remains traversable after single-tile removal tests | Inward-facing kingdoms, islands, peninsulas, passes and several inland naval theatres | Remove minor inner waters → open additional land gaps → simplify the circuit; never use a perfect geometric ring |
| Scarred Pangaea | One substantial pangaea; a small number of alien scar systems reorganize it; several broad sutures survive | Branching scars, ring scars, incompatible marches and dramatic relief transitions | Remove secondary scars → shorten primary scars → widen sutures; retain one continent visibly transformed by scars |
| Rift Lattice | A hierarchical deep-water fracture graph; unequal viable cells occupy the graph; primary rifts organize navigation | Branches, junctions, secondary cracks and different local cell worlds | Remove tertiary rifts → merge the smallest cells → widen selected crossings; retain authoritative primary fractures |
| Lonely Oceans | Each major civilization has a distant viable island realm; empty ocean prevents early coastal hopping; capacity is scarce but legal | Sparse satellites, dramatic negative space and rare valuable maritime resources | Remove city states → remove satellites → reduce major population through capacity policy; never fill the ocean with stepping stones |
| Great Peninsulas | One parent continental framework; several complete peninsula provinces; each has a narrow robust neck and viable interior | Florida-like and Italy-like forms, estuaries, coastal ranges and distinct local seas | Remove small peninsulas → widen weak necks → reduce peninsula count; never count shoreline bumps |
| Broken Island Chains | Several distinct directional parent arcs; every anchor and satellite belongs to an arc; deep gaps separate parent systems | Crescents, necklaces, parallel arcs, branches, age progression and rhythmic pearls | Remove minor satellites → shorten secondary arcs → reduce arc count; never degrade into independent scatter |

## Physical contracts

| Map Type | Hard relationships | Soft preferences | Relaxation order |
| --- | --- | --- | --- |
| Dynamic Earth | Several retained geological transformations at different stages; each major form has a causal plate or erosion history | Active rifts, closing seas, young ranges, mature basins and eroded remnants | Remove minor transformations → reduce stage diversity → reduce process provinces; never repaint unrelated topology |
| Colliding Plates | Selected continental plates converge; high ranges and forelands follow those contacts; plural traversable passes remain | Plateaus, paired ranges, rain shadows, foothills and mineral-rich sutures | Lower peak continuity → widen passes → reduce collision belts; never scatter mountains globally |
| Ancient Continental Shields | Old cratonic cores; subdued worn relief; mature drainage; exposed mineral provinces | Ghost ranges, escarpments, broad basins and deeply weathered interiors | Reduce ghost-range expression → simplify drainage → reduce shield count; retain deep-time contrast |
| Volcanic Island Arcs | Several subduction-derived arc provinces; volcanic chains align with boundaries; sheltered back-arc water and deep outer water remain | Age progression, atolls, trenches, double arcs, wet windward slopes and short rivers | Remove minor pearls → simplify back arcs → reduce arc count; never impose arcs over unrelated plates |
| Inland Supercontinent | One continental world; no external ocean; one dominant enclosed interior sea or tightly related basin system; inward drainage; broken peripheral highlands with plural passes | Desert risk/reward, fertile inland shores, terminal lakes, salt basins, valuable remote uplands and strategic passes | Remove secondary lakes → reduce peripheral-range coverage → contract the central sea; zero water is an explicit weakened dry-basin interpretation, not the preferred form |
| Monsoon Continents | Warm moisture-source seas; seasonal exposure; wind-facing ranges; wet trunk-river basins and dry leeward country share one causal system | Funnelling bays, floodplains, deltas, marshes, green desert rivers and contrasting plateaus | Reduce minor catchments → soften rainfall contrast → simplify coast funnelling; never place wet regions independently of sea and relief |
| Glacial World | Broad irregular ice sheets; limited viable refuges; frozen frontiers retain strategic or luxury value | Ice lobes, defensive shields, fish-rich seas, cold luxuries and food-dependent satellite cities | Reduce sheet extent → enlarge refuges → improve cold habitability; never leave all valuable terrain in one temperate strip |

## Polis contracts

| Map Type | Hard relationships | Soft preferences | Relaxation order |
| --- | --- | --- | --- |
| Imperial Ring | Outer starts have neighboring fronts; plural routes lead toward one broad shared axle; start enclaves remain viable | Geographic disguises, asymmetric ranges, lakes, coasts and lateral routes | Reduce secondary objectives → widen axle approaches → reduce ring completeness; retain shared-centre competition |
| Opposing Fronts | Exactly two strategic sides or teams; a broad frontier separates them; several distinct invasion theatres cross it | Mountain curtain, DMZ, no-man’s land, fallout and barbarians under Brutal | Reduce frontier hazards → widen theatres → soften side separation; never create one single bridge |
| Contested Heartland | Safe peripheral realms; exceptionally valuable central country; porous many-to-many routes; radial spokes prohibited | Flanks, river crossings, passes, secondary objectives and irregular approaches | Reduce secondary objectives → widen routes → reduce peripheral realm count; never become Imperial Ring |
| Rival Continents | Two populated strategic worlds; several expensive but accessible hinge theatres connect them | Straits, short seas, mountain valleys, plateaus and defensible bridge regions | Reduce minor hinges → widen principal hinges → soften bloc separation; never make the divide impassable |
| Three Realms | Three realms or teams; every pair has meaningful contact; no realm is safely isolated | Asymmetric theatres, third-party opportunities and victory-aware objectives | Reduce secondary routes → widen difficult borders → soften theatre asymmetry; retain all three contact pairs |
| Thalassic League | Several viable coastal powers; redundant many-to-many sea lanes; city states remain strategically distributed and contestable | Ports, islands, straits, naval objectives and diplomatic chokepoints | Remove minor islands → widen sea lanes → reduce city states through capacity policy; never collapse into two blocs |
| Unequal Realms | Tall, Wide, War and Turtle roles are all present when four players fit; every role is viable; asymmetry is disclosed | Different terrain obligations, victory routes, resource patterns and expansion pressure | Reduce role severity → improve the weakest viability floor → reduce roles only with population capacity; never normalize every start |

## Runtime reconciliation

The former Inland Supercontinent discrepancy has been removed. Its Physical grammar now reserves continental enclosure, an interior subsiding basin, inward drainage and broken peripheral uplift before the engine solves terrain. Its preferred default contains an interior sea; an explicit 0% water request remains legal and is reported as the weakened dry-basin interpretation rather than silently scored as the preferred identity.

All thirty-three entries now have a typed owner-engine grammar, a non-relaxable invariant, measurable evidence, content/gameplay obligations where applicable and an authored relaxation policy. The prose tables remain the readable design contract; the TypeScript catalogue is the executable form. Review can establish structural, causal and legal conformance, but it deliberately cannot establish that a human would name the map correctly without an Identity Lab session.
