# Map Type Narrative Identities

## Contract

- Status: Specified
- User outcome: A generated map should communicate its selected Map Type through composition and relationships between features. If the Map Type label is hidden, a knowledgeable user should usually be able to recognize the premise from the map.
- Scope: Narrative definitions for every Map Type currently exposed by Excogitare, including primary motifs, character interpretations and failure conditions. The definitions guide later generation, interface, diagnostics and testing work.
- Current limitation: This document is a specification. Existing generators implement these identities unevenly. Nothing below should be described as implemented merely because a preset, description or approximate parameter already exists.
- Failure behavior: Hard Civ V legality, accessibility, exact tile budgets and requested explicit settings take precedence over narrative goals. When an explicit combination makes a strong identity infeasible, generation should preserve legality, report the weakened premise and avoid pretending that the identity passed.
- Exclusions: Map Type does not replace Generation Engine, World Character, World Modifier, map size, geometry, projection, water, mountains, climate, rainfall, players or placement controls.

## The generation sentence

Excogitare should be readable as one sentence:

> **Generation Engine** determines how the world is constructed. **Map Type** determines what story its geography tells. **World Character** determines the tone of that story. **World Modifier** introduces an additional condition or event.

An Eccentric Broken Island Chains with Realistic character and Doomsday modifier is therefore still a chain-built island world. Its chains are comparatively coherent and tectonic in appearance, while ruins and fallout complicate rather than replace that premise.

## Global narrative rules

1. **Relationships matter more than totals.** Lonely Oceans is defined by distance between viable realms, not merely a high water percentage. Great Watersheds is defined by tributaries joining dominant trunk rivers, not merely a high river count.
2. **Silhouette is necessary but insufficient.** A Pangaea needs one dominant landmass, but Broken Pangaea also needs gulfs, fractures and difficult interior relationships.
3. **Every type needs anti-motifs.** A generation can be legal and attractive while still failing its selected premise.
4. **Character interprets rather than erases.** Realistic, Fantastical, Mundane and Brutal must remain recognizable variations of the same Map Type.
5. **Modifiers complicate rather than replace.** Strategic Depth, Fractured World and Doomsday should leave the underlying premise legible.
6. **Explicit controls negotiate with the premise.** A user may deliberately request an unusual combination. Controls should change intensity while the generator preserves as much identity as possible.
7. **The seed is not evidence.** Changing the random stream can produce a different map without producing a different narrative.
8. **Identity is inspectable.** Future generation diagnostics should retain the geographic structures and measurements used to judge the premise.
9. **Map Types own parameter envelopes.** Every detailed identity must define a preferred water range, preferred mountain range and meaningful default. The ordinary sliders and Randomise should adapt to that envelope rather than applying one global range. Some identities may prefer zero water or zero mountains. Deliberate values outside the envelope remain available when legal, but generation must honor them, preserve what identity it can and report material weakening rather than silently forcing the preferred range.
10. **Every type has a narrative verb.** The verb states the indispensable geographic action performed by the Map Type. World Character may reinterpret that action and explicit controls may weaken it, but neither may silently remove or replace it.
11. **Nearest confusions are explicit.** A type is not distinct merely because it belongs to another engine. Its structure, gameplay and retained diagnostics must separate it from the Map Types a blind reviewer is most likely to confuse with it.
12. **Recognition is stated in ordinary language.** Each type needs a short blind-recognition statement describing what a player should perceive without knowing its label, seed or implementation method.

## Narrative identity schema

Every implementation profile should retain the following fields even when the prose below is later translated into runtime data:

- a unique narrative verb;
- mandatory structural relationships and gameplay consequences;
- preferred parameter envelopes and honest weakened-identity behavior;
- nearest confusions and explicit anti-motifs;
- retained diagnostics that measure the premise rather than decorative totals; and
- a blind-recognition statement suitable for Identity Lab review.

Engine ownership is not sufficient evidence of identity. World Character may change the physical explanation, tone and severity of a Map Type, but the type's verb and defining relationships remain authoritative. When explicit controls make those relationships infeasible, the interface should report the Map Type as weakened and identify the modifier or control that became the dominant emergent identity.

## World Character vocabulary

- **Realistic:** coherent causality, plausible transitions and connected physical systems.
- **Fantastical:** dramatic composition, contradiction and geographic spectacle without feature confetti.
- **Mundane:** restrained, familiar and immediately readable Civ-like geography.
- **Brutal:** difficult movement, scarce comfortable land, contested routes and hostile terrain without inaccessible regions.

## Narrative design register

This register distinguishes the original concise specification from the detailed designs settled through review. **Accepted** means the narrative and intended architecture are ready to inform a later implementation plan; it does not mean the generator implements them.

| Map Type | Design state | Last decision |
| --- | --- | --- |
| Crooked Continents | Accepted | Unpredictable continental exploration produced by fjords, inland seas, hooks, route surprises and real interiors. |
| Broken Pangaea | Accepted | One fractured continental system whose rifts become sea, lake, dry basin or mountain division according to water level. |
| Drowned Shelves | Accepted | Recently drowned shelves leave compact mosaics whose anchor islands, ridge-following fragments and shallow-water ancestry remain legible. |
| Lake Kingdoms | Accepted | A bounded continental interior organized by hierarchical internal waters, endorheic drainage and broad terrestrial kingdoms. |
| Island Continents | Accepted | Several destination-like island-continents with viable interiors, satellites and consequential inter-realm voyages. |
| Deep-Ocean Divides | Accepted | A few monumental deep-ocean barriers gate otherwise substantial worlds into pre-Astronomy navigation basins and a later global-contact transition. |
| Land and Sea Maze | Accepted | A genuinely difficult irregular barrier maze with tortuous, deceptive and strategically unequal routes—not regular islands. |
| Patchwork Provinces | Accepted | Six to twelve incompatible but internally composed provinces juxtapose different local geographic, ecological and economic laws. |
| Ecological Transect | Accepted | One large connected landscape tells one compelling causal environmental narrative through an extensive ecological transect; islands and optional subplots must not dilute it. |
| Plate-Built Continents | Accepted | An authored tectonic atlas gives each continent a different readable geological history without exposing the hidden graph. |
| Great Watersheds | Accepted | Preserve the already recognizable basin and trunk-river architecture; complete the downstream story with connected tributaries, floodplains, marshes and valid distributary deltas. |
| Inland Sea Crossroads | Accepted | Great resource-rich inland seas dominate a non-wrapping world; scarce marginal land, narrow straits and canal isthmuses organize civilizations around naval power. |
| Wonder Heartlands | Accepted | Each grand realm surrounds a legal wonder or composed geographic heart of concentrated value, separated from ordinary civilization by mountains or low-productivity marches. |
| Encircled Seas | Accepted | A robust asymmetric exterior land framework encloses hierarchical inner waters and guarantees a meaningful continuous circumferential land route. |
| Scarred Pangaea | Accepted | One substantial pangaea is scarred by a small number of alien branching or ringed systems, incompatible marches and several broad surviving sutures. |
| Rift Lattice | Accepted | A hierarchical irregular lattice of authoritative deep-water fractures is generated first; viable local worlds are fitted inside its unequal cells. |
| Lonely Oceans | Accepted | Vast empty oceans confine each major civilization to a distant viable island realm, making isolation and scarcity endure until Astronomy. |
| Great Peninsulas | Accepted | One bounded continental framework is composed from complete peninsular provinces—Floridas, Italys and other regional lands—not mere shoreline protrusions. |
| Broken Island Chains | Accepted | Several directional parent systems form broken necklaces, crescents, branches and parallel arcs whose anchor islands and satellites share visible ancestry. |
| Dynamic Earth | Accepted | Several linked geological transformations at different stages preserve the chronology of a planet visibly becoming something else. |
| Colliding Plates | Accepted | Compression dominates through sutures, paired ranges, plateaus, forelands, rain shadows and deliberate traversable passes rather than indiscriminate mountains. |
| Ancient Continental Shields | Accepted | Deep time has worn ancient shields, ghost ranges and escarpments into broad river-shaped continents with fertile basins and mineral-rich exposed cores. |
| Volcanic Island Arcs | Accepted | Several distinct rugged strings of volcanic pearls curve around sheltered atoll-like seas, aging from high active islands into eroded anchors and drowned rings. |
| Inland Supercontinent | Accepted | The map is an entirely landbound world enclosed by peripheral highlands, with all water and drainage terminating in its remote continental heart. |
| Monsoon Continents | Accepted | Directional seasonal moisture links warm seas and funnelling coasts to wet mountain fronts, great river basins, valid deltas and dry leeward interiors. |
| Glacial World | Accepted | Ice devours the world while productive but resource-poor temperate capitals must support distant, valuable settlements across the frozen frontier. |
| Imperial Ring | Accepted | Isolated outer founding enclaves expand through disguised geographic spokes into a broad shared axle where the principal competition begins. |
| Opposing Fronts | Accepted | Two explicit teams develop behind a mountain curtain or deep DMZ before contesting several invasion theatres; Brutal turns the frontier into a fallout-scarred barbarian war zone. |
| Contested Heartland | Accepted | Irregular peripheral realms overlap through a porous many-to-many route mesh around exceptionally valuable country; radial spokes are explicitly prohibited. |
| Rival Continents | Accepted | Two populated continental worlds almost meet through several costly hinge theatres of straits, short seas, plateaus and mountain corridors. |
| Three Realms | Accepted | Three explicit teams occupy natural-looking realms that each border both rivals, making every two-front war an opportunity for the third power. |
| Thalassic League | Accepted | Viable coastal powers and restrained city states share a redundant many-to-many network of ports, islands, straits and sea lanes. |
| Unequal Realms | Accepted | Deliberately unequal but viable Tall, Wide, War and Turtle starts impose different geographic obligations and victory paths. |

---

# Excogitare Map Types

## Crooked Continents

**Design state:** Accepted.

**Narrative premise:** Several substantial continents have been folded, hooked and bitten by the sea. Their political interiors remain large enough to matter, but coastlines constantly intrude upon them.

**Recognizable geography:** Broad asymmetric landmasses; hooked peninsulas; gulfs extending well inland; broken coastal shelves; secondary islands shed from continental margins; several distinct theatres of settlement; coastlines with long strategic reach rather than uniform noise.

**Character interpretations:** Realistic produces eroded shelves, credible peninsulas and climate continuity. Fantastical exaggerates hooks, enclosed bights and regional contradictions. Mundane approaches a familiar Continents map while retaining irregular coasts. Brutal turns gulfs, ranges and narrow isthmuses into invasion constraints.

**Failure conditions:** Rounded blobs; one accidental pangaea; uniformly frayed coastlines without large-scale form; an archipelago with no continental interiors; continents separated only because the water percentage is high.

**Gameplay experience:** Exploration should repeatedly confound reasonable assumptions. A modest bay may continue into an inland sea; a peninsula may curl around another settlement region; geographically close areas may require a long land journey but a short voyage. Once revealed, the world remains coherent rather than arbitrary. Naval reconnaissance matters without displacing continental play.

**Structural commitments:** Build three to five major continents on a Standard map, each with a genuine interior core and two to four regional-scale maritime intrusions. Compose branching fjords, hooked peninsulas, deep gulfs, inland seas, narrow straits, near-enclosures, coastal ranges and margin-associated islands. Target roughly two-thirds terrestrial unpredictability and one-third maritime surprise. Construct these as regional features; reject uniform shoreline noise.

**Setting negotiation:** Higher water deepens intrusions and enlarges inland seas; lower water exposes shelves, land bridges and basin floors while retaining folded continental relationships. Mundane remains clearly continental, Realistic uses coherent shelves and erosion, Fantastical permits nested bights and improbable hooks, and Brutal turns the same gulfs, isthmuses and ranges into difficult but plural invasion routes.

**Evidence and diagnostics:** Retain coastal-intrusion depth, fjord length and branching, inland-sea area and outlet width, peninsula length-to-neck ratio, strait and near-enclosure counts, continental interior share, alternative routes and the difference between direct and traversable distance. Blind recognition should describe continents whose sea and relief make discovery and movement unpredictable—not merely continents with long coastlines.

## Broken Pangaea

**Design state:** Accepted.

**Narrative premise:** One dominant world-continent remains geographically recognizable, but seas and fractures have begun pulling it apart.

**Recognizable geography:** A clearly dominant connected landmass; deep gulfs; one or more near-rifts; difficult interiors; subsidiary islands or fragments near the main mass; several meaningful coastal approaches; narrow seams that could plausibly divide the continent in another age.

**Character interpretations:** Realistic resembles a mature supercontinent undergoing rifting. Fantastical allows impossible interior seas and dramatic near-separations. Mundane remains close to classic Pangaea with a few strong gulfs. Brutal makes the remaining land bridges and internal passes strategically decisive.

**Failure conditions:** Several equal continents; an unbroken circular landmass; full separation into unrelated islands; a narrow snake of land whose connectivity is merely technical; no visible evidence of breaking.

**Gameplay experience:** The world offers global overland contact but is only precariously held together. Large continental lobes create local theatres; narrow sutures, gulf entrances and fault corridors become strategic, while naval routes frequently shorten difficult terrestrial journeys. Connectivity should be vulnerable and important without depending on one tile.

**Structural commitments:** Construct one robust pangaea containing roughly 75–90% of all land, divide it into three to six large provinces, then create two to four fracture systems between them. Give each fracture depth, width, uplifted shoulders and selected surviving sutures before resolving terrain or water. Preserve several meaningful coastal approaches and multiple connections among principal regions.

**Setting negotiation:** Water fills the pre-existing fractures rather than creating them. High water produces ocean-connected rifts, straits and penetrating inland seas; moderate water mixes gulfs, enclosed seas and lakes; low water leaves chains of lakes, salt basins, dry rift valleys, escarpments and mountain belts; zero water retains difficult fault corridors and deliberate passes while reporting the lost aquatic expression. The dominant continent must remain meaningfully connected rather than joined by a technical land filament.

**Evidence and diagnostics:** Retain dominant-land share, continental-lobe sizes, fracture depth and penetration, flooded versus dry fracture extent, suture width and length, independent overland connections, chokepoint centrality, land-versus-naval route stretch and connectivity after removing any single connecting tile. Recognition should be “one continent visibly becoming several,” not several continents accidentally touching.

## Drowned Shelves

**Design state:** Accepted.

**Narrative verb:** Drowns.

**Narrative premise:** Recently drowned continental shelves leave compact island mosaics whose former unity remains visible beneath shallow water. Frequent coastal contact, naval maneuver and short but consequential sea crossings arise from that submergence rather than from scattered island placement.

**Recognizable geography:** Numerous islands arranged in clusters and loose chains; mixed island sizes; abundant coast; frequent stepping stones; relatively little empty ocean; several compact naval theatres; occasional larger anchor islands supporting inland cities.

**Character interpretations:** Realistic uses shelf fragments and volcanic-looking chains. Fantastical creates crooked necklaces and improbable island chambers. Mundane resembles a readable Civ archipelago. Brutal produces narrow naval lanes, fortified anchor islands and limited safe landing regions.

**Failure conditions:** Evenly scattered island confetti; only a handful of remote islands; continents merely perforated by water; islands without chains or clusters; so many stepping stones that oceans cease to matter.

**Gameplay experience:** Several compact maritime theatres support frequent coastal contact, consequential short crossings, amphibious pressure and useful satellite islands. Anchor islands retain terrestrial development; deep channels keep every fragment from becoming a trivial stepping stone.

**Structural commitments:** Begin with several continental shelves or broad land regions, fracture and partially submerge them, and retain roughly four to seven recognizable clusters on a Standard map. Each cluster should contain one or two settlement-capable anchor islands representing former uplands, medium fragments and small shards that follow submerged ridges, a shared coastal shelf and at least one deeper internal channel. Shallow-water contours should reveal the shape of the lost landmass. Wider ocean separates clusters. The silhouette is a drowned mosaic, not long correlated chains.

**Setting negotiation:** High water loosens clusters and widens channels while protecting viable anchors; moderate water is the intended mixed-island default; low water reconnects fragments through crooked bridges and perforated coastal regions; zero water preserves fractures through basins and relief but reports the maritime identity as substantially weakened. Realistic and Mundane emphasize drowned shelves; Fantastical and Brutal may make the shattering more violent and strategically exposed.

**Evidence and diagnostics:** Retain cluster count and separation, island-size distribution, anchor settlement capacity, within-cluster shelf continuity, ridge alignment of minor islands, shallow-water reconstruction of the parent landmass, between-cluster deep-water width, stepping-stone connectivity, local crossing distance, independent naval approaches and unclustered-island share.

**Nearest confusions:** Broken Island Chains is built from long directional necklaces, crescents and parent arcs; Drowned Shelves is a compact set of drowned continental shelves. A generic archipelago lacks both the reconstructed shelf and the anchor-to-fragment hierarchy.

**Blind-recognition test:** “These islands are the remaining highlands of several drowned continents.”

## Lake Kingdoms

**Design state:** Accepted.

**Narrative premise:** A predominantly terrestrial, bounded realm is divided internally by lakes, inland seas and river country rather than by a surrounding global ocean.

**Recognizable geography:** Land-heavy composition; non-wrapping edges; several enclosed water bodies of different scales; large connected settlement regions; lake kingdoms and inland coasts; river outlets toward enclosed seas; a strong sense of an exterior boundary.

**Character interpretations:** Realistic resembles an enormous endorheic continental region. Fantastical creates impossible internal seas and isolated water realms. Mundane produces a land-heavy lakes map. Brutal uses inland waters and surrounding ranges to define defended basins and limited passages.

**Failure conditions:** A conventional ocean-dominated world; all water connected to the exterior; tiny decorative lakes only; a maze with no broad kingdoms; wrapping behavior that dissolves the bounded-realm premise.

**Gameplay experience:** Broad terrestrial kingdoms compete for inland coasts, river valleys, basin passes and several separate naval theatres. The player is never stranded on an island; internal water shapes political geography while land remains the dominant medium of settlement and travel.

**Structural commitments:** Use non-wrapping bounds and one overwhelmingly dominant land framework. Construct one or two major inland seas, three to seven secondary lakes or enclosed basins, broad inhabitable regions between them, selected basin rims and endorheic river systems. Water bodies require a clear hierarchy and should rarely touch the map edge. The exterior should feel like a remote portion of a larger continent, not an artificial unbroken wall.

**Setting negotiation:** Flood coherent depressions according to water level. High water expands and occasionally connects inland seas; moderate water mixes great seas and separate lakes; low water produces smaller lakes, salt basins and river-fed lowlands; zero water exposes dry lakebeds, fertile depressions and enclosed wastes while reporting the weakened aquatic premise. Brutal can fortify basin approaches but must retain plural passes.

**Evidence and diagnostics:** Retain enclosed-water count and size hierarchy, edge-connected water share, dominant-land share, settlement area between basins, internal river outlets, basin-rim continuity and passes, independent inland naval theatres, shoreline access by settlement region and alternative land routes around major seas.

## Island Continents

**Design state:** Accepted.

**Narrative premise:** Civilizations occupy many irregular island-continents separated by voyages long enough to create distinct maritime realms.

**Recognizable geography:** Several medium-sized island-continents; minor outer islands; broad but navigable seas; clear regional clusters; enough interior land for terrestrial identity; long journeys between realms rather than continuous stepping-stone chains.

**Character interpretations:** Realistic produces drowned continental shelves and plausible maritime climates. Fantastical produces dramatically different island realms and strange enclosed seas. Mundane creates a larger-island archipelago. Brutal makes each realm internally difficult and inter-realm crossings strategically exposed.

**Failure conditions:** One dominant continent; dense small-island confetti; vast empty oceans with only tiny settlements; every realm connected by trivial coastal hopping; no distinction between major realms and minor islands.

**Gameplay experience:** Each island-continent is a destination and homeland with its own interior. Early growth is local; later voyages reveal distinct political theatres. Local land conflict, satellite-island competition and committed inter-realm naval movement all matter.

**Structural commitments:** Build roughly four to seven principal realms on a Standard map, each containing a medium or large island-continent, several-city interior, irregular coherent coastline, modest geographic personality, local shelf and associated satellites. Concentrate most land in the principal realms and separate them with broad deep-water passages that prevent continuous coastal hopping. A typical eight-player map should usually have four to six sufficiently capacious realms rather than unusable scraps.

**Setting negotiation:** High water contracts and isolates realms while protecting inhabitable cores; moderate water balances realms, satellites and voyages; low water enlarges realms while retaining deep seams; zero water converts their former separation into plateaus or basin provinces but reports the maritime identity as severely weakened. World Character controls how different the realms’ terrain personalities become without making biome colour the only identity.

**Evidence and diagnostics:** Retain principal-realm count and sizes, land share in principal realms, settlement capacity, starts per realm, within- and between-realm travel, deep-water separation, stepping-stone paths, satellites, landing regions and geographic differentiation. Reduce player or city-state counts rather than overcrowding a realm; city states may favour satellites but must respect major-start spacing.

## Deep-Ocean Divides

**Design state:** Accepted.

**Narrative verb:** Gates.

**Narrative premise:** Long, deep-water scars partition the world into navigation basins and isolated habitable shelves.

**Recognizable geography:** Several coherent deep-water rifts; basin-scale separation; shelf-like land arranged along rift margins; crossings concentrated at rare narrows or island bridges; rifts that remain legible across large distances; strong distinction between coast and abyss.

**Character interpretations:** Realistic resembles extreme oceanic spreading and failed continental rifts. Fantastical creates celestial-looking scars and impossible basin geometry. Mundane restrains the rifts into a readable set of separated seas. Brutal makes crossings rare, exposed and militarily important.

**Failure conditions:** Random narrow channels; decorative sinusoidal cuts; rifts that terminate without organizing a basin; ordinary continents with extra water; so many breaks that no habitable shelf retains identity.

**Gameplay experience:** Primary deep-ocean rifts are technology gates. Before ocean travel, civilizations inhabit locally complete navigation basins; after Astronomy, new political systems meet and rift-margin cities become global staging points. Every populated basin needs sufficient land and normally at least one reachable rival before that transition.

**Structural commitments:** Define two to four large, viable navigation basins inside an otherwise substantial world, then separate them with two to four monumental authoritative rifts whose deep-ocean cores cross the map, join another rift, reach a boundary or close into a loop. Allocate land, local seas and coastal shelves inside the basins without filling the rift cores. On wrapped maps, verify the complete topology rather than accepting barriers bypassed through the seam. The rifts must be few enough to read as imposed global barriers rather than as the fabric of the entire world.

**Setting negotiation:** High water widens rifts and basins; moderate water balances deep barriers and substantial shelves; low water spends its limited water budget on one or two continuous deep rifts before decorative seas; zero water cannot express the technology gate and must report the identity as absent rather than disguising mountains as Astronomy. Primary rifts require ocean travel; only secondary fractures may contain deliberate island bridges.

**Evidence and diagnostics:** Retain pre-Astronomy basin count, post-Astronomy global connectivity, contact-graph change at ocean travel, deep-rift continuity and minimum width, shallow bypasses, non-dividing terminations, basin settlement capacity and populations, start distance from margins, deliberate early crossings and wrapped bypass routes.

**Nearest confusions:** Rift Lattice generates a hierarchical lattice first and fits local worlds into its many unequal cells. Deep-Ocean Divides imposes only a few enormous technology-gated barriers across otherwise conventional, substantial geography. Scarred Pangaea scars one connected continent without requiring the same pre- and post-Astronomy contact transition.

**Blind-recognition test:** “A few impossible oceans divide complete civilizations until Astronomy changes the political world.”

## Land and Sea Maze

**Design state:** Accepted after rejecting the current regular-oblong-island expression.

**Narrative premise:** A bounded world of chambers, corridors, land bridges and inland channels turns navigation itself into the dominant geographic problem.

**Recognizable geography:** Non-wrapping boundaries; alternating chambers and narrow passages; both land and water corridors; several routes through the maze rather than one mandatory tunnel; recognizable local regions connected through chokepoints; navigable loops and optional detours.

**Character interpretations:** Realistic resembles a deeply dissected karstic or drowned continental realm. Fantastical allows improbable chambers and intertwined land-water mazes. Mundane simplifies the labyrinth into clear regional corridors. Brutal narrows routes and strengthens defended basins while retaining alternatives.

**Failure conditions:** Inaccessible chambers; a single linear corridor; noise without navigable structure; ordinary continents with a few isthmuses; passages too wide to feel labyrinthine; water or land routes that do not form meaningful choices.

**Gameplay experience:** Navigation must remain genuinely difficult even after the whole map is visible. Corridors bend and double back; nearby regions require detours; routes may initially lead away from their destination; long alternatives survive when a direct pass is contested; naval and terrestrial networks do not mirror one another. Accessibility guarantees a route, not convenience.

**Structural commitments:** Generate an irregular barrier maze before forming land components: divide the barriers among water, mountains, lakes and difficult terrain, carve winding passages, then embed unequal settlement chambers at selected junctions. Distort the result to remove grids and Voronoi regularity. The principal network should contain several loops and strategically unequal alternatives; rewarding peripheral cul-de-sacs are allowed but may not contain major starts. Major chambers need at least two eventual connections, though one may be long or obscure.

**Anti-regularity rules:** Explicitly reject repeated oblong islands, even spacing, uniform water rings, similar chamber sizes, straight corridors, grids, concentric layouts, convex island repetition and all-water barriers. Land should include branching continental pieces, hooked peninsulas and enclosed valleys rather than a set of islands surrounded in the same way.

**Setting negotiation:** High water emphasizes crooked water corridors and land chambers; moderate water intertwines land and naval routes; low and zero water preserve the maze with mountain walls, basins, wastes and deliberate passes. Fantastical can intensify intertwined loops, while Brutal narrows and hardens routes without eliminating alternatives.

**Evidence and diagnostics:** Retain route tortuosity, meaningful decision density, false-proximity pairs, second-route stretch, dead-end depth, barrier continuity, land/water network divergence, chamber irregularity and an island-regularity penalty. A substantial share of chamber pairs should exceed roughly 1.8 traversable-to-direct distance, with selected pairs above 2.5. Recognition must describe a difficult barrier maze, not regular islands presented as chambers.

## Patchwork Provinces

**Design state:** Accepted.

**Narrative verb:** Juxtaposes.

**Narrative premise:** Strongly authored geographic provinces collide: strange coastlines, abrupt but composed biomes and dramatic local identities matter more than physical restraint.

**Recognizable geography:** Multiple unmistakable regions; warped coasts; contrasting terrain provinces; regional mountain boundaries; surprising transitions organized at province scale; local eccentricity embedded within a coherent whole.

**Character interpretations:** Realistic tempers the contradictions into unusual but interpretable regional geology. Fantastical embraces maximum regional spectacle. Mundane keeps the provincial structure but reduces impossible transitions. Brutal turns the regional boundaries into harsh movement and resource problems.

**Failure conditions:** Feature confetti; generic noise with no regional organization; a single dominant biome; eccentric coastlines but ordinary interiors; contradictions occurring tile by tile rather than as composed realms.

**Gameplay experience:** Crossing a regional boundary should change settlement spacing, movement, improvement priorities, expansion direction and resource opportunity. Provinces become natural political frontiers; transition regions are valuable because they combine opportunities from both sides. Exploration is motivated by discovering qualitatively different places rather than more of the same terrain.

**Structural commitments:** Divide a Standard world into roughly six to twelve unequal contiguous provinces. Give each a package of two or three mutually supporting motifs spanning silhouette, elevation, drainage, biome palette, coastline, features, resource tendencies and settlement rhythm—for example a rain-shadow salt basin, glaciated fjord highland, drowned marsh coast or volcanic peninsula with fertile margins. These packages act as local geographic, ecological and economic laws rather than mere palettes. Avoid one-motif labels such as “the desert region.”

**Boundary composition:** Use a deliberate mixture: roughly one third strong physical boundaries such as ranges or inland seas, one third ecological boundaries such as forest margins, wetlands, wastes or rain shadows, and one third interlocking or graded transition zones. Rivers and coastlines may belong to multiple regions and should create interaction rather than enclosing every province. The geography must make boundaries inferable without displaying the internal region overlay.

**Setting negotiation:** High water makes selected provinces maritime; low and zero water favour basins, highlands, forests, wastes and river countries without weakening the regional premise. Mundane uses familiar packages, Realistic derives contrast from causal geography, Fantastical permits composed impossible adjacencies, and Brutal makes provinces unequally hospitable without making any legal start indefensible. Major civilizations are not assigned one region each: large provinces may support rivals, while small exceptional regions may hold city states, wonders or contested opportunities.

**Evidence and diagnostics:** Retain region count, size and contiguity, within-region geographic coherence, between-region contrast, local-law completion, boundary type and strength, motif completion, silhouette diversity, transition width, repeated-template similarity, settlement capacity, accessibility and opportunity by region.

**Nearest confusions:** Wonder Heartlands creates a few monumental, objective-centred realms with concentrated hearts of value. Patchwork Provinces composes a denser mosaic of many contrasting provinces whose differences govern ordinary settlement and travel throughout the map. Biome confetti and arbitrary tile-scale contradiction satisfy neither identity.

**Blind-recognition test:** “This world appears to have been assembled from several different worlds.”

---

# Eccentric Map Types

## Ecological Transect

**Design state:** Accepted.

**Narrative premise:** Continents, watersheds, climate provinces and oceans appear to belong to one interacting world rather than to separate procedural layers.

**Recognizable geography:** Several coherent continents; mountain systems separating climate and drainage regions; rivers responding to relief; open oceans with legible basins; gradual large-scale climate relationships; ecological variety organized by geography.

**Character interpretations:** Realistic foregrounds causal continuity. Fantastical creates a living mythic ecology with stronger regional surprises. Mundane produces a restrained, broadly Earthlike world. Brutal makes the interacting systems hostile through dry interiors, difficult ranges and scarce benign corridors.

**Failure conditions:** Disconnected procedural layers; rivers indifferent to mountains; climates scattered without regions; generic continents; an attractive map with no apparent relationship between geology, water and biome.

**Gameplay experience:** A large connected landscape should read as an intimate cross-section of a particular natural world. Viability follows the selected system: rivers, confluences, deltas, mountain fronts, passes and warm refuges become natural settlement and conflict locations. The map should not focus on islands, because fragmented land lacks the interior distance required to judge the living system.

**Narrative architecture:** Select one compelling primary environmental narrative and allow it to organize roughly 60–80% of the world. No supporting subplot is required. Possible complete narratives include a coast-to-marsh-to-grassland-to-range-to-rain-shadow transect; a desert sustained by long snaking rivers and narrow green floodplains; mountain-fed green pockets inside an arid continent; a geothermal tundra with locally thawed valleys; or a glacial meltwater corridor reaching a distant delta. Generate one immense land system or a small number of very large connected landmasses, long ranges, extensive gradients and river networks large enough to transform whole regions.

**Causal commitments:** Complete ordered relationships rather than independent layers. Mountain headwaters feed merging tributaries and major trunks; lower rivers create floodplains, braided channels, marsh basins and distributary deltas. Green desert requires rivers, springs, aquifers or mountain runoff. Warm tundra pockets require retained geothermal or volcanic causes. Forests, wetlands, oases and fertile corridors must be explained by water, shelter, elevation or heat. Surprising geography is welcome when its cause remains legible.

**Setting negotiation:** Dominant terrain, rainfall, temperature and water settings should help choose and scale the narrative rather than scatter unrelated motifs. A dry or Brutal Ecological Transect may be more compelling than a generally lush one when its narrow living corridors govern play. Mundane uses familiar causal transects, Realistic strengthens physical continuity, Fantastical bends causes without abandoning them, and Brutal concentrates viability into severe but accessible systems.

**Evidence and diagnostics:** Retain the selected narrative archetype, primary-transect length and continuity, ordered ecological transitions, range extent, windward-to-leeward precipitation change, river hierarchy, tributary depth, delta and marsh extent, life-corridor width, vegetation associated with water or heat, unsupported anomalies, and the share of settlement-quality land explained by the narrative. Blind recognition should describe the world’s causal story, not merely call the map varied or realistic.

## Plate-Built Continents

**Design state:** Accepted.

**Narrative verb:** Chronicles.

**Narrative premise:** The world is an authored tectonic atlas in which every major continent chronicles a different geological history through its boundary arcs, collision belts, rifts, margins and sheltered interiors.

**Recognizable geography:** Several major continents; long mountain belts; coastal arcs; interior basins; rifted or sutured margins; terrain contrast across ranges; islands and peninsulas associated with active boundaries.

**Character interpretations:** Realistic emphasizes credible boundary causality. Fantastical turns sutures into epic dividing ranges and improbable arcs. Mundane uses restrained continental margins and familiar mountain systems. Brutal strengthens collision belts and concentrates deliberate passes.

**Failure conditions:** Mountains scattered independently of continental structure; rounded continents; ranges too short to read as systems; island chains unrelated to margins; no distinction between active edges and old interiors.

**Gameplay experience:** Long mountain fronts, foreland valleys, active coasts, rift corridors and quiet interiors create different modes of expansion and conflict. Passes matter, but starts belong in accessible interiors, forelands or broad valleys rather than pockets sealed behind collision belts.

**Boundary architecture:** Compose three to five major continents and give each a dominant history distinct from the others: a rifted continent, a collisional continent, an ancient passive-margin continent, an accreted or island-arc continent, or another coherent combination. Assign their regional boundaries as continental collision, oceanic subduction, continental rifting, transform motion or passive margin. Collisions create long ranges, plateaus and forelands; subduction creates coastal ranges and offshore arcs; rifts create valleys, lake chains and inland seas; transforms create offset coasts and linear valleys; passive margins create broad shelves and mature plains. Each continent needs a stable interior contrasting with its active systems, and the set must read as several chapters rather than the same tectonic template repeated.

**Setting negotiation:** Higher water foregrounds oceanic boundaries, arcs, shelves and rifted fragments; lower and zero water preserve the identity through collision belts, exposed shelves, dry rifts, transform valleys and plateaus. The preferred water and mountain envelopes must later be fixed quantitatively; the ordinary range should support several continents with visible active margins and materially more continuous relief than a generic Continents map, without turning every boundary into mountains.

**Evidence and diagnostics:** Retain continent-level history assignments, repeated-history penalties, boundary types and extent, range alignment and continuity, interior-to-margin relief contrast, coastal and offshore arc alignment, flooded and dry rifts, transform valleys, passive shelf width, tectonically responsive rivers, deliberate passes, enclosed starts and mountains unsupported by a boundary.

**Nearest confusions:** Dynamic Earth is a retained physical simulation whose interacting processes show a planet changing through time. Colliding Plates makes global convergence the dominant event. Plate-Built Continents instead authors several visually distinct continental histories as one readable atlas.

**Blind-recognition test:** “Each continent tells a different geological history.”

## Great Watersheds

**Design state:** Accepted as a targeted refinement rather than a wholesale redesign.

**Narrative premise:** Large drainage basins organize settlement, terrain and regional identity around a few dominant river systems.

**Recognizable geography:** Upland divides; continuous mountain-fed tributaries; dominant trunk rivers; lower river plains; marshy flood basins; deltas or estuaries at major outlets; occasional headwater lakes; fertile corridors crossing otherwise distinct terrain.

**Character interpretations:** Realistic produces credible catchments and graded drainage. Fantastical allows enormous rivers dividing contradictory realms. Mundane resembles familiar river-valley civilizations. Brutal traps rivers between ranges, concentrates crossings and makes fertile valleys highly contested.

**Failure conditions:** Numerous unrelated short rivers; trunk rivers without tributaries; rivers ending inland without lakes; no deltas, marshes or floodplain terrain; mountains that do not act as divides; waterways too visually minor to define the map.

**Preferred parameter envelope:** Ordinary water should be approximately 20–42%, defaulting around 32–35%; mountains should be approximately 10–22%, defaulting around 15%; river density should default to Dense. This land-heavy envelope supplies outlets and headwaters while retaining extensive catchments. Zero water or zero mountains remains a legal deliberate override but materially weakens an identity that requires mountain sources and lake or ocean outlets.

**Watershed architecture:** Preserve the current strength of a few large, recognizable basins. On a Standard map, construct roughly three to six primary catchments from upland divides through mountain headwaters, branching tributaries, major tributaries and dominant trunks. Lower rivers should widen their landscape into floodplains and marsh basins before reaching lakes, inland seas, estuaries or deltas. Tributaries merge continuously; a sufficiently large coastal trunk may deliberately split into connected distributaries at its valid water outlet.

**Gameplay experience:** Rivers are settlement corridors, confluences and delta heads are valuable city sites, and basin divides become political boundaries. Starts should favour workable middle or lower valleys without clustering around one delta. Dry characters make narrow living corridors disproportionately valuable; wet characters expand tributaries and flood basins without reducing the map to unrelated blue edges.

**Implementation emphasis:** Identity Lab evidence already recognizes Great Watersheds reliably, so later work should not replace its useful silhouette or trunk systems. Correct the missing downstream consequences—especially actual marsh tiles, floodplain terrain, delta fans and the diagnostic mismatch between Eccentric `RIVER_BASIN` and Physical `WATERSHED` objects.

**Evidence and diagnostics:** Retain basin count and area, mountain-source validity, divide continuity, tributary depth and hierarchy, trunk length and accumulation, connected edge share, tributary-to-trunk completion, valid lake or ocean outlets, distributaries, floodplain and marsh extent, fertile river corridors, starts per basin and any river that crosses its assigned divide. Recognition should come from the world being arranged around great rivers, not their raw count.

## Inland Sea Crossroads

**Design state:** Accepted after replacing the original open-ocean interpretation with a great-inland-seas model.

**Narrative premise:** Deep oceans, broken shelves and rifts divide continental fragments into several distinct navigation basins.

**Recognizable geography:** Multiple separated deep-water domains; broken continental fragments; island chains along basin margins; rifts connecting or dividing seas; shelves with local coastal networks; ocean crossings whose destinations feel regionally distinct.

**Character interpretations:** Realistic resembles a world of young ocean basins and fragmented continents. Fantastical exaggerates basin separation and shelf geometry. Mundane makes the basins broader and easier to read. Brutal limits crossings and turns shelf margins into contested gateways.

**Failure conditions:** One undifferentiated ocean; ordinary archipelago distribution; many tiny basins with no scale hierarchy; land fragments unrelated to basin margins; deep-water bands that do not influence navigation.

**Narrative and gameplay:** Several enormous inland or semi-enclosed seas crowd civilizations onto narrow marginal lands. The seas are the principal sources of space, wealth and movement; local naval theatres connect through a few strategically dominant straits, while one- and two-tile isthmuses create land chokepoints and potential canal cities. Civilizations should appear arranged around important seas rather than comfortably occupying continents behind them.

**Preferred parameter envelope:** Ordinary water should be approximately 60–78%, defaulting around 68–72%; mountains should be approximately 3–14%, defaulting around 8%; wrap should default to None. The low mountain range preserves scarce settlement land. Deliberately lower water exposes shelves and joins basins but weakens the naval premise; zero water removes it entirely.

**Basin and margin architecture:** On a Standard map, construct roughly two to five unequal great seas occupying the interior. Connect selected seas through one- to three-tile naval straits; nearly connect others across one- or two-tile land isthmuses. Confine most viable land to thin irregular outer margins, peninsulas and limited regions between basins. Large maps may add secondary basins, elaborate peninsulas and very small near-shore islands; small maps retain the basic great-seas structure without mandatory island decoration.

**Strategic sites:** Identify and protect one-tile canal isthmus sites: settleable non-mountain land adjacent to genuinely different basins, accessible from both land regions and normally unclaimed at game start. Verify narrow water straits as continuous legal routes with defensible shoreline sites and no accidental bypass. Do not place major starts or routine city states directly on the most powerful global chokepoints; these should be discovered and contested.

**Maritime economy:** Sea resources should provide the best value. Coastal food sustains otherwise constrained cities; maritime luxuries differentiate basins; offshore strategic resources reward later naval power; particularly valuable grounds may lie beyond gateways or beside contested isthmuses. Land resources keep starts functional but remain comparatively scarce. Every populated basin needs economic value without receiving every maritime luxury.

**Population safeguards:** Land scarcity must remain playable. Scale major and city-state counts to shoreline settlement capacity, preserve five-tile start spacing, keep city states from consuming the few expansion corridors, and guarantee each major civilization a defensible core with several viable city sites. A civilization controlling only inland marginal terrain should be poorer than one that controls its adjacent sea.

**Evidence and diagnostics:** Retain great-sea count and hierarchy, marginal land width, settleable land per major, shoreline capacity, strait widths and connectivity, verified canal sites, competing approaches, travel reduction through passages, peninsulas, unintended basin connections, maritime-versus-terrestrial resource value, food and luxuries by basin, offshore strategic value, starts and city states per sea, and strategically empty basins. Distinguish these crowded wealthy seas from Lonely Oceans’ intimidating empty water and Lake Kingdoms’ land-dominant realms.

## Wonder Heartlands

**Design state:** Accepted with legendary hearts as the defining structure.

**Narrative premise:** The world is composed as a sequence of grand geographic realms whose borders, climates and relief feel legendary rather than statistically blended.

**Recognizable geography:** Large named-feeling provinces; epic boundary ranges; deliberately dissonant biome collections; distinctive wastes, forests, highlands and seas; strong regional silhouettes; transitions that feel authored even when implausible.

**Character interpretations:** Realistic interprets the realms as extreme but causally related provinces. Fantastical gives each realm a powerful contradictory identity. Mundane retains broad provinces with restrained climate differences. Brutal makes realm borders difficult and interiors unequally hospitable.

**Failure conditions:** Small noisy patches; every region having the same palette; arbitrary biome adjacency without boundary logic; geography that could be mistaken for Ecological Transect; dramatic names unsupported by visible territorial identity.

**Realm architecture:** Compose roughly four to seven immense, internally structured realms rather than Patchwork Provinces’ denser mosaic. Each realm needs a monumental silhouette, a distinct boundary system, supporting subregions and one central or near-central mythic heart. Geography must make the realms almost nameable without relying on a future Labels layer.

**Mythic hearts:** Place a distinct legal natural wonder where the supported pool and terrain permit; otherwise compose a valid geographic landmark such as a caldera, sacred lake, oasis complex, geothermal refuge, river confluence, mountain crown or fertile enclosed basin. Surround the heart with thematic luxuries, strategic resources, food and workable terrain so it is materially extraordinary. Never duplicate a unique wonder, invent an unsupported identifier or retain an illegal placement merely to satisfy the narrative.

**Core and periphery:** Give the heart and immediate hinterland roughly two to three times the workable value of the surrounding march where explicit content controls permit. Separate it either through an enclosing range with two to four deliberate passes or through a deep belt of comparatively featureless desert, tundra, dry plains, marsh wilderness, steppe, plateau or sparse forest. Mix these structures rather than repeating mountain rings. The periphery remains playable but should feel ordinary and poor beside the heart.

**Preferred parameter envelope:** Water should ordinarily span roughly 15–68%, defaulting around 45–50%; mountains should span roughly 8–30%, defaulting around 18%. Low and zero water support terrestrial legendary realms; high water supports sacred seas and drowned kingdoms. Sparse content settings reduce heart abundance but should preserve relative contrast. Disabling wonders uses geographic fallbacks; disabling resources materially weakens the economic identity and must be reported.

**Competition and starts:** Unless Legendary Start explicitly applies, place major civilizations in viable peripheral regions with comparable travel difficulty to the hearts rather than directly beside them. Provide multiple approaches, keep city states away from decisive passes and settlement sites, and permit several civilizations to compete for one realm’s centre. A mythic heart is normally a discovered objective, not a private starting gift.

**Evidence and diagnostics:** Retain realm and heart count, heart type, legal wonder assignment, geographic fallbacks, thematic resource composition, heart and periphery value, core-to-march ratio, unproductive buffer depth, enclosure and pass validity, route difficulty from starts, competing approaches, city-state occupation, repeated heart templates and realms lacking a sufficiently powerful centre. Distinguish these monumental objective-centred lands from Patchwork Provinces’ varied provincial mosaic.

## Encircled Seas

**Design state:** Accepted.

**Narrative verb:** Encloses.

**Narrative premise:** A predominantly terrestrial exterior encloses water kingdoms, inland seas and remote aquatic interiors.

**Recognizable geography:** A strong enclosing land framework; multiple internal seas and lakes; narrow water connections; inward-facing coasts; exterior land routes around the enclosed waters; isolated island or coastal realms inside the enclosure.

**Character interpretations:** Realistic resembles a continental enclosure around remnant seas. Fantastical produces nested or strangely shaped internal water kingdoms. Mundane becomes a readable land-heavy inland-seas world. Brutal fortifies the narrow connections between inner basins and surrounding land.

**Failure conditions:** Exterior ocean surrounding central land; broken enclosure with no legible ring; only tiny lakes; a pangaea with random holes; enclosed waters too connected to feel like separate kingdoms.

**Narrative and gameplay:** A vast connected land framework encloses inner seas, islands and water kingdoms. Civilizations can travel around the world through a circumferential terrestrial network while using inward-facing coasts and internal naval routes as shortcuts and alternative theatres. The enclosure should be asymmetric and geographic—not a smooth donut or concentric diagram.

**Preferred parameter envelope:** Ordinary water should be approximately 20–48%, defaulting around 34–38%; mountains should be approximately 8–24%, defaulting around 14%; wrap should default to None. Resolve the requested water inside the enclosure first. Zero water retains enclosed basins and relief but materially weakens the aquatic-kingdom premise.

**Enclosing architecture:** Construct one robust exterior land framework touching or approaching most map boundaries, a continuous and strategically meaningful land route around the principal internal waters, one large central or off-centre inland sea, two to five secondary seas or lakes, inward-projecting peninsulas, selected interior island realms and several radial land connections. The route must support actual circumferential travel through inhabitable regions rather than achieve continuity through a technical filament. High water may narrow the enclosing arms but should not breach the ordinary circumferential route.

**Interior kingdoms and population:** Internal water must contain meaningful shelves, resources, islands, city-state opportunities and, where capacity permits, one or two settlement-capable realms. Major starts normally occupy substantial outer land with access to both the circumferential and inward networks. Interior starts require viable expansion and access; city states may use smaller realms but cannot crowd major starts or pre-own the decisive passages.

**Evidence and diagnostics:** Retain enclosure completeness, exterior connectivity and robustness, circumferential route continuity, width, habitability and strategic relevance, internal-versus-edge-connected water, inner-sea hierarchy, inward-facing coastline share, radial routes, internal naval connections, peninsulas, interior settlement capacity, start access, regular-ring penalties and any high-water breach.

**Nearest confusions:** Lake Kingdoms contains important local inland waters but requires no global terrestrial circuit. Inland Sea Crossroads crowds scarce land against dominant seas. Encircled Seas must preserve abundant enclosing land and the long outer journey around the world.

**Blind-recognition test:** “I could travel around the whole world by land, taking the long outer road around its enclosed seas.”

## Scarred Pangaea

**Design state:** Accepted.

**Narrative verb:** Scars.

**Narrative premise:** One immense continent is partitioned internally by deep, uncanny scars and incompatible regional marches.

**Recognizable geography:** A dominant connected continent; long astronomy rifts or near-rifts; interior seas; remote continental provinces; climate realms arranged in dramatic succession; a few narrow sutures preserving continental unity.

**Character interpretations:** Realistic resembles a supercontinent undergoing extreme continental rifting. Fantastical emphasizes impossible scars and climate marches. Mundane reduces the astral quality into a broken but readable pangaea. Brutal makes the surviving sutures and interior approaches strategically severe.

**Failure conditions:** Several equal continents; no dominant landmass; decorative rifts that do not divide internal movement; ordinary Pangaea climate; complete fragmentation that destroys the pangaea premise.

**Narrative and gameplay:** One immense connected continent is divided into roughly four to eight incompatible marches by unfamiliar internal scars. Long land journeys remain possible through several robust sutures, while interior seas and void corridors create naval shortcuts, political theatres and difficult transitions. The astral quality is abstract and geographic, never a literal star or novelty symbol drawn into the map.

**Preferred parameter envelope:** Ordinary water should be approximately 18–48%, defaulting around 36–40%; mountains should be approximately 10–30%, defaulting around 18%. Retain roughly 75–92% of all land in one meaningful component. High water floods the scars into inland seas and near-rifts; low and zero water express them through salt wastes, canyon systems, lake remnants, plateaus, ranges and hostile marches.

**Scar and march architecture:** Build two to four graph-scale branching, offset, intersecting or partially ringed alien scar systems before resolving water. Give each scar flooded and dry segments according to elevation and water budget, with strange but composed resource and wonder opportunities concentrated along selected scar nodes, chambers or crossings. Compose strong regional identities on either side so biome contradiction is explained by the boundary. Protect several broad continental sutures and reject technical one-tile unity, ordinary sinusoidal cuts, complete fragmentation and unsupported tile-scale contradictions.

**Evidence and diagnostics:** Retain dominant-land share and interior depth, march count and contiguity, scar length, branching, rings and node opportunities, flooded and dry extent, inland-sea hierarchy, cross-scar contrast, suture count, width and robustness, route stretch, starts dependent on one suture, fragmentation and geometric regularity.

**Nearest confusions:** Broken Pangaea divides according to recognizable geological fractures and the available water budget. Deep-Ocean Divides gates several navigation basins with monumental deep oceans, while Rift Lattice is built from a globally authoritative rift lattice. Scarred Pangaea remains one continent whose internal organization follows visibly alien graph logic.

**Blind-recognition test:** “One continent has been unnaturally reorganized by several enormous alien scars.”

## Rift Lattice

**Design state:** Accepted.

**Narrative premise:** Habitable shelves and regional seas exist inside a world fundamentally divided by a system of deep-water barriers.

**Recognizable geography:** Several navigation basins; continuous deep rifts; populated shelves on both sides of barriers; rare crossings; broken coastlines following the rift system; local seas that remain distinct despite global wrapping.

**Character interpretations:** Realistic resembles an aggressively spreading oceanic world. Fantastical creates impossible interlocking basins. Mundane uses fewer, broader divisions. Brutal concentrates settlement near dangerous crossings and denies easy coastal circumnavigation.

**Failure conditions:** Shallow channels posing as rifts; isolated water cuts with no basin organization; land routes casually bypassing every barrier; archipelago confetti; one ordinary ocean surrounding continents.

**Narrative and gameplay:** The world is made from a global rift lattice rather than merely crossed by several barriers. Four to seven unequal habitable cells on a Standard map contain locally complete continents, shelves, seas, climates and drainage. Early politics occurs inside those local worlds; rare deliberate bridges provide limited contact; most primary boundaries require ocean travel and make rift intersections important later naval junctions.

**Preferred parameter envelope:** Ordinary water should be approximately 48–72%, defaulting around 60–64%; mountains should be approximately 8–24%, defaulting around 14%; east–west wrap is appropriate only when the lattice remains complete across the seam. Low water reduces cell and rift count before sacrificing primary continuity. Zero water cannot retain the defining deep-water lattice.

**Lattice architecture:** Construct long primary rifts, branching secondary fractures, abyssal junctions, partial or closed boundaries and rare shelf bridges before allocating land. Primary cores should remain several tiles wide and continuously deep; secondary branches may narrow or terminate into the network. Fit every major geography inside an assigned cell and make ranges, escarpments, arcs, peninsulas, shelves, climates and rivers respond to its rift margins. Reject regular grids, repeated cell shapes and geography crossing an authoritative boundary.

**Crossings and population:** Primary rifts normally require ocean technology. A small number of shelf bridges, island chains, sutures or routes around secondary terminations may connect selected neighbors without opening a complete early global route. Populate cells according to settlement capacity, normally retaining local rivals; keep starts and ordinary city states away from decisive global junctions and bridge sites.

**Evidence and diagnostics:** Retain cell count, size and capacity, primary and secondary rift lengths, branches and intersections, deep continuity and width, wrapped-seam closure, shelf association, shallow bypasses, deliberate early crossings, pre- and post-Astronomy connectivity, populations, isolated openings, cross-boundary geography and lattice regularity. Distinguish this rift-first world from Deep-Ocean Divides’ few imposed barriers, Scarred Pangaea’s scarred continent and Land and Sea Maze’s corridor puzzle.

## Lonely Oceans

**Design state:** Accepted.

**Narrative premise:** A few viable island realms are separated by intimidating expanses of ocean and a genuine absence of convenient intermediate land.

**Recognizable geography:** Large uninterrupted deep-water spaces; a small number of internally coherent island realms; considerable distance between viable regions; very few stepping stones; strong contrast between local island clusters and empty ocean; long strategic voyages.

**Character interpretations:** Realistic uses remote volcanic groups and drowned fragments. Fantastical creates bizarre isolated realms and impossible empty basins. Mundane produces sparse conventional islands with clear separation. Brutal leaves only a few harsh footholds and exposed naval approaches.

**Failure conditions:** Ordinary archipelago density; islands distributed evenly across the map; chains bridging every major gap; numerous tiny habitable components; oceans that feel crowded rather than lonely.

**Political isolation:** Under ordinary settings, every major civilization begins alone in its own island realm. No two major starts share a land component or a coast-reachable navigation component, and deep ocean prevents routine contact before Astronomy. The count of viable principal islands therefore follows the requested major-player count rather than emerging accidentally from a fixed island field. When the tile budget cannot support enough distinct, viable and well-separated realms, generation must reduce population explicitly instead of collapsing the isolation premise.

**Island capacity and scarcity:** A principal island should ordinarily support a capital and approximately two to four additional cities without becoming spacious. It needs enough food, freshwater opportunities and essential strategic access to remain playable, but land, luxuries, bonus resources and comfortable expansion sites should remain scarce. Each realm should normally contain only one or two indigenous luxuries and limited strategic deposits beyond the minimum needed for fair play. Ocean resources should occur in useful local fisheries rather than filling the supposedly empty crossings.

**City states and stepping stones:** City-state numbers should be lower than the global default. Place them remotely, subordinate them to a principal realm or omit them when the map cannot preserve isolation. A city state, minor island, shallow shelf or resource trail must never form an accidental coast-navigation bridge between major civilizations. Satellite islands may enrich a realm, but they must remain inside its local maritime neighbourhood rather than marching evenly across the void.

**Preferred parameter envelope:** Ordinary water should be approximately 84–94%, defaulting around 88–90%; mountains should be approximately 3–14%, defaulting around 7%. Either wrap mode may be used, but separation must be measured across every wrapped seam. Lower water should enlarge the isolated realms before narrowing the deep-ocean exclusion zones; once those zones can no longer remain authoritative, the identity is weakened rather than silently becoming an ordinary archipelago.

**Technology-gated topology:** Before Astronomy, there should be one major civilization per reachable island realm, no coastal route between major realms, and no sequence of islands or city states that bypasses the deep-ocean separation. After Astronomy, all principal realms must participate in a globally navigable ocean network. The early game is therefore deliberately solitary and land-scarce; Astronomy becomes a clear geopolitical transition into exploration, trade, invasion and long-range naval logistics.

**Evidence and diagnostics:** Retain requested and achieved major-player counts, principal-island count, settleable city capacity per realm, land and freshwater per start, early navigation components, minimum deep-ocean separation, wrapped-seam separation, visibility and coast-route bypasses, stepping-stone chains, city states per realm and within crossings, local luxuries and strategic sufficiency, ocean-resource density, and post-Astronomy connectivity. Blind recognition should describe civilizations confined to distant islands by a forbidding empty ocean—not merely a map with a high water percentage.

## Great Peninsulas

**Design state:** Accepted.

**Narrative premise:** One bounded continental realm is continually invaded by water, producing crooked peninsulas, estuaries, gulfs and difficult overland relationships.

**Recognizable geography:** Non-wrapping outer boundary; one primary land framework; several long peninsulas; deep gulfs; estuarine mouths; narrow necks; inland channels; regional interiors that remain larger than the connecting isthmuses.

**Character interpretations:** Realistic resembles a deeply dissected continental margin. Fantastical creates curling, branching and almost impossible peninsulas. Mundane uses broad readable capes and gulfs. Brutal fortifies peninsula necks and creates difficult alternatives by sea.

**Failure conditions:** Independent islands rather than attached peninsulas; shallow coastline noise; a maze without larger regional interiors; wrapping edges; one straight coastline with decorative bays.

**Regional anatomy:** Every primary peninsula must read as a country-sized geographic region rather than a coastline protrusion. Give it a recognizable root, a defensible but believable neck, a substantial settled body, a directional axis and a distinctive cape or terminal coast. A Standard map should normally contain approximately four to eight such provinces attached to one shared continental backbone, with deep branching gulfs occupying the spaces between them. The backbone preserves a difficult terrestrial alternative while ships provide meaningful shortcuts across the gulfs.

**Peninsula grammar:** Compose several structurally different families rather than repeating fingers. Florida-like peninsulas are long, low, wet and lacustrine, with marshes and short drainage. Italy-like peninsulas follow an elongated mountain spine between fertile coastal shoulders. Broad plateau peninsulas hold dry or elevated interiors with limited approaches. Forked peninsulas divide around a significant bay, while drowned peninsulas retain one authoritative attachment amid estuaries and subordinate offshore remnants. These are geographic grammars rather than literal Earth copies, and each instance must retain its own terrain, drainage and settlement story.

**Gameplay and population:** Regional confinement, not isolation, is the gameplay premise. Major starts belong inside capable peninsular provinces or the central interior, never automatically on the decisive neck. A peninsula should ordinarily hold several cities and sustain a recognizable regional campaign. Isthmuses, gulf mouths, estuaries and straits remain contested expansion objectives. City states may occupy secondary capes and sheltered gulf heads but should not be routinely awarded the strongest tollgates.

**Preferred parameter envelope:** Ordinary water should be approximately 34–58%, defaulting around 46%; mountains should be approximately 8–22%, defaulting around 14%; wrap should ordinarily be None. Lower water broadens attachments and exposes gulf floors, while higher water narrows necks and detaches only subordinate capes. Extremely low or zero water cannot honestly retain this identity, and high water must not convert the principal provinces into independent islands.

**Character interpretation:** Realistic emphasizes drowned valleys, credible erosion and coherent regional relief. Fantastical permits curling branches, nested gulfs and nearly enclosed capes while preserving complete provinces. Mundane uses broad immediately legible regional forms. Brutal aligns ranges, wetlands and hostile approaches with the same peninsular axes, making necks valuable without reducing every invasion to one unavoidable tile.

**Evidence and diagnostics:** Retain principal-peninsula count, root and neck width, length-to-neck ratio, interior area, settlement capacity, directional coherence, gulf depth and branching, mainland connectivity, route stretch, terrestrial and naval alternatives, start placement, repeated-shape similarity, subordinate-island share and detached-primary failures. Long one- or two-tile tendrils do not qualify. Blind recognition should describe one continental realm assembled from several Floridas, Italys or other complete peninsular countries—not an archipelago, coastal noise, a regular comb or a labyrinth.

## Broken Island Chains

**Design state:** Accepted.

**Narrative premise:** Several long island chains, broken crescents and branching arcs structure a densely maritime world.

**Recognizable geography:** Curved or branching parent arcs; islands placed in rhythmic chains; alternating large anchor islands and small stepping stones; shared shallow shelves within a chain; deep gaps between chains; occasional parallel arcs and drowned fragments.

**Character interpretations:** Realistic resembles subduction arcs and shelf fragments. Fantastical twists chains into dramatic necklaces and branching crescents. Mundane produces conventional but unmistakable island chains. Brutal narrows safe approaches, raises volcanic relief and makes anchor islands strategically dominant.

**Failure conditions:** A collection of independently scattered islands; uniform island size; no detectable chain geometry; every island sharing one continuous shallow shelf; continents perforated into chunks without arc structure.

**Parent-system grammar:** Compose approximately four to seven large island systems on a Standard map. Broken crescents sweep through one or two authoritative deep gaps; necklaces alternate anchor islands and smaller intermediates; branching chains divide along a legible primary axis; double arcs enclose a regional sea; drowned ridges expose elongated peaks; and fractured junctions bring two incomplete chains together around a strategic maritime crossroads. Every system must retain a directional curve or branch, a shared shallow-shelf logic and an intentional pattern of surviving and missing sections.

**Hierarchy and rhythm:** Give each system one to three substantial anchor islands with credible city capacity, accompanied by satellites and minor stepping stones. Island size, spacing and orientation should follow a recognizable anchor–satellite–gap rhythm rather than uniform repetition. Local coastal crossings may connect neighbouring members, while deliberate deep-water gaps separate parent systems or major segments. If independently rearranging the islands would not destroy the apparent structure, the architecture has failed.

**Gameplay and population:** Expansion should usually proceed along a chain before projecting power between chains. Anchor islands support major starts and regional settlement; minor islands extend naval control; sheltered internal seas, arc ends, deep gaps and junctions become contested objectives. Populate systems according to capacity without enforcing Lonely Oceans-style solitude. Several civilizations may share or contest one sufficiently large system, and cross-chain contact may occur earlier where the authored hierarchy permits it.

**Preferred parameter envelope:** Ordinary water should be approximately 68–86%, defaulting around 78%; mountains should be approximately 8–28%, defaulting around 16%. Either wrap mode is acceptable only when parent chains continue coherently across the seam. Lower water broadens shelves and fuses nearby members without erasing their axes; higher water submerges satellites and widens selected gaps before sacrificing anchor islands.

**Character interpretation:** Realistic uses volcanic arcs, drowned ridges, coherent shelves and age-related erosion. Fantastical exaggerates interlocking necklaces, dramatic crescents, forks and improbable but readable junctions. Mundane uses fewer small islands and simpler broad arcs. Brutal increases volcanic relief, constrains anchor-island interiors and makes junctions or crossings valuable without making the entire world uninhabitable.

**Evidence and diagnostics:** Retain parent-system and anchor counts, chain membership confidence, arc fit, ordered orientation, directional continuity, branching and parallelism, anchor–satellite rhythm, shelf coherence, gap position and depth, local and global navigation components, settleable capacity, starts per system, random-scatter similarity and wrapped-seam continuity. Blind recognition should describe several broken necklaces, crescents or branching chains—not simply a world containing many islands.

---

# Physical Map Types

## Dynamic Earth

**Design state:** Accepted.

**Narrative verb:** Transforms.

**Narrative premise:** No single geological regime dominates. Active and quiet plates, young and old terrain, maritime and continental climates all participate in a visibly changing planet.

**Recognizable geography:** Several continental and oceanic plates; mixed convergent and divergent margins; varied continent ages; mountain belts and rifts; open oceans; multiple climate regimes; mature and youthful watersheds existing together.

**Character interpretations:** Realistic balances the full causal model. Fantastical amplifies unusual plate shapes and climatic extremes. Mundane produces a restrained Earthlike baseline. Brutal foregrounds active relief, dry interiors and difficult boundaries.

**Failure conditions:** One geological regime everywhere; generic continents without boundary evidence; uniform terrain age; climate unrelated to oceans and relief; output indistinguishable from a simple field generator.

**Planetary history:** A Standard map should normally retain approximately three to five legible geological provinces and at least three linked active or historical processes at visibly different stages. Compose an ancient continental core with mature drainage, a young collision belt, a continental rift opening into lakes or a narrow sea, an active ocean margin with an associated trench or arc, a broad passive margin, or a spreading ocean whose opposing coasts retain their relationship. Preserve chronology and age gradients so old consequences remain connected to younger processes. These are not isolated set pieces: plate motion and crustal age must explain their positions, transitions and causal relationships.

**Causal landscape:** Ancient interiors produce subdued relief, broad plains and mature watersheds. Young collisions produce high ranges, narrow valleys and concentrated strategic geology. Rifts organize linear lakes, fertile corridors, volcanism and competing routes. Passive margins build shelves, coastal plains, wetlands and deltas, while active margins compress mountains, coasts and offshore arcs into difficult frontiers. Climate, drainage, erosion, terrain and resource tendencies must respond to those retained structures rather than being painted independently afterward.

**Gameplay and population:** Comfortable old interiors support broad expansion, while resources, passes and strategic corridors draw civilizations toward less hospitable young boundaries. Movement should alternate among mature river basins, rift corridors, shelf lowlands, mountain passes and constrained active coasts. Starts need not be symmetrically assigned to every province, but balance assessment must account for the very different long-term value and mobility created by geological age.

**Preferred parameter envelope:** Ordinary water should be approximately 38–68%, defaulting around 54%; mountains should be approximately 8–26%, defaulting around 16%. East–west wrap is normal, although non-wrapping worlds remain valid. This broad envelope supports Physical’s whole-planet synthesis, but changing totals must alter the expression of retained histories rather than reduce the world to one uniform regime.

**Character interpretation:** Realistic emphasizes restrained elevation, erosion, coherent boundaries and causal climate. Fantastical amplifies elevation contrasts and unusual plate geometries without breaking physical relationships. Mundane presents an older, calmer planet with familiar continents and fewer extreme boundaries. Brutal emphasizes active margins, severe rain shadows, narrow habitable corridors and valuable frontier geology.

**Evidence and diagnostics:** Retain plate and province identity, crustal age, boundary type and velocity, uplift and erosion, corresponding coast relationships, margin classification, rift and collision continuity, drainage maturity, climate response, resource correlation and playable capacity by geological regime. Blind recognition should describe a complete active planet where old interiors, young mountains, opening rifts and contrasting margins coexist—not an ordinary Continents map with realistic terrain colouring. Unlike Eccentric’s Plate-Built Continents, this identity depends upon a retained physical history rather than tectonic-looking composition.

**Nearest confusions:** Colliding Plates lets convergence dominate the whole world. Ancient Continental Shields depicts a world whose major activity has largely ended. Plate-Built Continents authors distinct continental chapters without simulating their shared chronology. Dynamic Earth must retain several interacting transformations and the evidence of their different ages.

**Blind-recognition test:** “Several parts of this planet are visibly becoming something else, and its older landscapes show how they arrived here.”

## Colliding Plates

**Design state:** Accepted.

**Narrative premise:** Young continents are caught in an era of violent convergence, producing collision belts, uplift and severe rain shadows.

**Recognizable geography:** Long young mountain systems; continental sutures; compressed basins; active coastal arcs; high relief; strong windward and leeward climate contrast; relatively limited mature lowlands.

**Character interpretations:** Realistic emphasizes credible orogeny and erosion. Fantastical creates monumental collision ranges and impossible uplift. Mundane restrains relief while retaining visible sutures. Brutal makes ranges, passes and dry interiors dominate movement.

**Failure conditions:** Scattered mountains; old rounded terrain; no long convergence belts; uniformly wet conditions; extensive placid lowlands; continents whose boundaries do not correspond to uplift.

**Collision grammar:** Build approximately two to four major convergent systems on a Standard map. Continent–continent collisions form broad plateaus between roughly parallel mountain fronts; oblique collisions curve or offset belts around long lateral valleys; arc–continent collisions accrete volcanic coasts and remnants of closing seas; microcontinent accretion creates knotted peninsulas and enclosed basins; and terminal ocean closure leaves inland seas, lakes or dry depressions along a continental suture. The chosen structures must emerge from retained plate motion rather than mountain placement alone.

**Belt anatomy:** A major collision should retain a suture, one or more associated range fronts, plateaus or trapped basins, depositional forelands, rain shadows and responsive drainage. Rivers may descend from the uplift, follow foothills or cross through an explicitly modeled inherited gorge, but should not casually ignore the highest relief. Fertile lowlands should accumulate where the uplift sheds water and sediment; volcanic and strategic resources should correlate with the relevant boundary geology.

**Gameplay, population and access:** Civilizations occupy different forelands, plateaus, surviving coastal regions and connected basins while collision belts organize contact between them. Passes, longitudinal valleys, low saddles and remnant-sea corridors become geopolitical objectives. No populated region may be sealed behind mountains. When scale permits, every major inhabited belt should offer at least two deliberate traversable corridors; Brutal may narrow and lengthen them but cannot collapse continental access into an accidental or singular invalid route.

**Preferred parameter envelope:** Ordinary water should be approximately 28–56%, defaulting around 42%; mountains should be approximately 18–38%, defaulting around 27%. Either wrap mode is valid only when collision continuity is preserved across the seam. Zero water expresses ocean closure through continental sutures, salt basins and dry remnant depressions; higher water retains narrowing seas, collided island arcs and fragmented coastal forelands.

**Character interpretation:** Realistic composes broad coherent belts, plateaus, forelands and plausible climatic response. Fantastical amplifies curved ranges, collision knots and enclosed highland realms while retaining convergence. Mundane lowers relief, reduces belt count and broadens passes. Brutal stacks ranges, intensifies leeward aridity and concentrates desirable geology around difficult contested corridors.

**Evidence and diagnostics:** Retain convergent-boundary length and motion, relief adherence, suture and belt continuity, belt width and parallel fronts, plateau, trapped-basin and foreland formation, pass count and redundancy, land accessibility, rain-shadow magnitude, river crossing explanations, sedimentary lowlands and resource correlation. Reject random mountain scatter, one uniform wall, relief uncorrelated with plate boundaries, belts without surrounding consequences, or difficulty produced only by indiscriminate mountain coverage. Blind recognition should describe several worlds crushed together whose ranges, plateaus and basins preserve the collisions.

## Ancient Continental Shields

**Design state:** Accepted.

**Narrative premise:** Old stable continental cores have endured long erosion, supporting broad river country, subdued uplands and mature coastlines.

**Recognizable geography:** Broad connected continental interiors; low relief; isolated ancient uplands; mature drainage networks; wide valleys; weathered coasts; fewer active boundary mountains; large stable settlement regions.

**Character interpretations:** Realistic emphasizes erosion surfaces and mature catchments. Fantastical turns ancient remnants into strange isolated plateaus and lost highlands. Mundane creates gentle conventional continents. Brutal uses sparse old ridges, poor interiors and long strategic distances rather than young mountain walls.

**Failure conditions:** Abundant sharp mountain chains; fragmented young islands; short immature rivers; highly active margins everywhere; relief indistinguishable from Colliding Plates.

**Deep-time grammar:** Compose approximately two to four major ancient continental cores on a Standard map. Exposed shield country carries lakes, thin soils and ancient mineral geology; broad sedimentary basins hold mature rivers and fertile lowlands; worn plateaus end in long escarpments; ghost mountain belts survive as low ridges, hills and isolated resistant summits; ancient rifts become reused river, lake or travel corridors; and passive margins grade into broad coastal plains and deltas. These structures preserve geological history without relying upon sharp young relief.

**Scale, drainage and relief:** The visual impression should be immense age rather than featureless flatness. Rivers have had time to grow long, branching and region-defining; valleys and drainage basins are broad; old coasts are weathered; and isolated plateaus, inselbergs or remnant ridges become conspicuous precisely because high relief is scarce. Every major basin must organize drainage and settlement, while every remnant highland should correspond to a resistant core, plateau or former belt.

**Gameplay and resources:** Movement across the old continents is comparatively open, so mature rivers, wetlands, escarpments and rare remnant uplands define strategic regions. Fertile sedimentary basins support dense settlement; exposed shields offer weaker agriculture but valuable ancient strategic geology; and old rift corridors provide natural routes through continental interiors. Resource tendencies should make the retained geology legible—subject always to Civ V legality, viable starts and competitive sufficiency.

**Preferred parameter envelope:** Ordinary water should be approximately 30–58%, defaulting around 43%; mountains should be approximately 2–15%, defaulting around 7%. Either wrap mode is valid. Zero water converts former seas into large sedimentary depressions, salt basins and dry drainage interiors; higher water drowns broad margins and separates shield fragments without transforming the world into a young volcanic archipelago.

**Character interpretation:** Realistic emphasizes extensive shields, mature catchments, escarpments and plausible sedimentary basins. Fantastical magnifies remnant plateaus, lost highlands, ancient circular scars and immense river systems. Mundane creates gentle familiar old continents with restrained relief. Brutal uses poor shield soils, long strategic distances, scarce defensive terrain and intense competition over fertile basins rather than young mountain walls.

**Evidence and diagnostics:** Retain crustal age and stability, shield and basin extent, ghost-belt correlation, relief sharpness and isolation, escarpment continuity, river length and hierarchy, drainage maturity, reused rift corridors, passive-margin width, soil and resource correlation, settlement capacity and defensive-terrain scarcity. Reject uniform plains without retained history, abundant sharp mountains, short immature drainage or active boundaries dominating every coast. Blind recognition should describe an immensely old, broad and river-shaped world whose original violence survives only in worn scars and remnants.

## Volcanic Island Arcs

**Design state:** Accepted.

**Narrative premise:** Oceanic boundaries and volcanic arcs dominate a wet maritime planet of compact watersheds and tectonic island chains.

**Recognizable geography:** Several curved volcanic arcs; deep trenches or water gaps beside them; high-relief anchor islands; smaller arc islands; abundant coast; strong maritime moderation; short steep rivers and wet windward slopes.

**Character interpretations:** Realistic follows plausible subduction arcs. Fantastical creates towering crescent chains and contradictory island climates. Mundane resembles a readable volcanic archipelago. Brutal limits habitable lowlands and makes inter-island routes exposed.

**Failure conditions:** Random island scatter; broad passive continents; islands without relief; dry continental interiors; no association between chains and oceanic boundaries; output indistinguishable from Broken Island Chains except for the engine label.

**Arc-province grammar:** Compose approximately three to six clearly separate arc provinces on a Standard map. Each must have its own curvature, orientation, deep-water surroundings, recognizable beginning and end, and rhythmic sequence of pearl-like islands. Use open volcanic crescents around protected seas, near-rings with atoll-like interiors, double arcs enclosing lagoon-like basins, deformed junctions and older remnant chains. Deep water between provinces must be materially broader than the local channels between their pearls so the arc hierarchy is immediately visible.

**Physical cross-section:** Retain the causal sequence from deep trench through exposed forearc to an offset volcanic chain and sheltered back-arc sea. The trench-facing side is steep and narrow; volcanic mountains align along the overriding side; inner slopes descend through foothills, shelves and protected water. Arc curvature, relief, bathymetry and island placement must agree with an oceanic boundary rather than merely imitating a necklace shape.

**Pearls and age progression:** A principal arc alternates rugged volcanic pearls, short channels, merged anchor islands, broken lagoons and drowned remnants. Its young end carries sharp active highlands; middle islands are broader, eroded and more habitable; old subsiding members become low ring islands, reefs and atolls. Literal atoll-like features therefore preserve a believable relationship to the older arc rather than appearing as arbitrary rings. Individual sequences may vary, but every principal island must visibly belong to a parent arc.

**Climate, gameplay and resources:** Maritime winds make exposed windward slopes wet while island spines produce local rain shadows and short continuous mountain-to-sea rivers. Protected back-arc margins accumulate shelves, wetlands and reliable settlement. Major civilizations occupy mature anchors and broad inner margins; smaller pearls extend naval reach; sheltered seas organize local interaction; and deep gaps divide major theatres. Volcanic geology favours strategic minerals, while old islands and shelves provide better soils, freshwater and maritime resources.

**Preferred parameter envelope:** Ordinary water should be approximately 66–86%, defaulting around 76%; mountains should be approximately 12–32%, defaulting around 20%. East–west wrap is normal only when every cross-seam arc and trench relationship is preserved. Low water connects and broadens arcs before exposing back-arc floors; at zero water, curved volcanic belts and trench depressions may survive but the Volcanic Island Arcs identity cannot honestly be retained.

**Character interpretation:** Realistic emphasizes plausible subduction geometry, age gradients, shelf asymmetry and maritime rainfall. Fantastical builds towering pearls, immense sheltered rings, interlocking crescents and spectacular junctions. Mundane uses simpler arcs, broader habitable anchors and restrained relief. Brutal narrows coastal lowlands, intensifies volcanic spines and makes inter-island approaches exposed without sealing inhabited land.

**Evidence and diagnostics:** Retain arc-province count and separation, membership confidence, curvature and orientation, pearl rhythm, anchor capacity, local and inter-arc gap widths, oceanic-boundary adherence, trench continuity, trench-to-volcanic offset, island-age progression, atoll ancestry, shelf asymmetry, watershed length, climatic response, navigation components and inhabited-land access. Reject a global island mesh, continuous crescent continents, mechanically identical arcs, random volcanic scatter or unexplained atolls. Blind recognition should describe several rugged strings of volcanic pearls curving around sheltered, nearly atoll-like seas; physical causality distinguishes them from Eccentric’s authored Broken Island Chains.

## Inland Supercontinent

**Design state:** Accepted.

**Narrative premise:** One dominant continental mass creates profound continentality, long drainage paths and an interior climatically distant from the sea.

**Recognizable geography:** A dominant connected landmass; relatively small external seas; very long coast-to-interior distances; dry or seasonally extreme core; peripheral wet margins; long trunk rivers; interior basins and old uplands.

**Character interpretations:** Realistic produces physically graded continentality. Fantastical creates an enormous hostile heartland and improbable peripheral climates. Mundane resembles a land-heavy pangaea. Brutal makes the interior sparse, dry and difficult while coastal refuges become fiercely valuable.

**Failure conditions:** Several equal continents; every land tile close to water; uniformly moist interior; short rivers only; an archipelagic coastline; no dominant climatic contrast between core and margin.

**Landbound-world contract:** There is no external ocean: the map itself is the continent, and land continues across every applicable edge and wrapped seam. The emotional reference is an impossibly enlarged Australian interior, not an island-continent silhouette. A broken peripheral system of old highlands, plateaus and overlapping arcs encloses a deeper continental heart without becoming a geometric or inaccessible wall.

**Endorheic hydrology:** Every permanent watershed remains inside the continental world. Inward rivers terminate continuously and legally in lakes, wetlands, salt basins or significant enclosed seas; no river implies or reaches a nonexistent external ocean. Generate dry salt pans and former valleys at the lowest water settings, scattered terminal lakes and isolated living corridors at low settings, several lake and marsh systems at moderate settings, and occasional major inland seas at high settings. Water bodies must emerge from catchments and basin floors rather than decorative placement.

**Water-control semantics:** For this identity, Water Percent means inland-water coverage and ocean coverage is always zero. The preferred inland-water envelope is approximately 0–22%, defaulting around 7–10%. At exactly zero, permanent rivers and lakes disappear together while dry valleys, salt flats and basin structure remain. Mountains should ordinarily be approximately 9–25%, defaulting around 15%. Low and high settings alter basin inundation without opening the world to an external sea.

**Climate and access:** Peripheral highlands intercept moisture and organize a gradual transition into steppe, dry plains and arid heartland; rainfall, elevation and basin geometry complicate the pattern without producing a hard green ring around a uniform desert. Multiple broad saddles, passes and river corridors must connect the inner and outer regions. The peripheral system can constrain travel but may never seal the heartland or any inhabited basin.

**Gameplay and population:** Peripheral highland civilizations control passes, headwaters and mineral country; heartland civilizations depend upon terminal rivers, lakes and rare fertile basins; vast dry regions separate the most valuable corridors. Inland seas become the world’s only major naval theatres. Starts must include viable interior systems rather than merely following globally attractive terrain, and balance must compare freshwater, land capacity and strategic access across highlands and basins.

**Character interpretation:** Realistic produces gradual continental drying, coherent rain shadows and credible terminal drainage. Fantastical creates immense hostile basins, lost plateaus and extraordinary enclosed seas. Mundane uses gentler relief, broader habitable corridors and more forgiving lake country. Brutal intensifies aridity, distance and scarcity around a few disputed rivers, passes and basin margins.

**Evidence and diagnostics:** Retain external-ocean tile count, cross-edge land continuity, peripheral-highland coverage and gaps, interior depth, basin hierarchy, internal-water share, river continuity and legal termination, endorheic catchments, gradient smoothness, heartland aridity and viable area, pass redundancy, inland-sea navigation, start distribution and resource sufficiency. Reject any external ocean, unexplained decorative lakes, rivers without outlets, an impassable rim or a generic low-water Pangaea. Blind recognition should describe an entire landbound world enclosed by ancient highlands and draining into its own remote heart.

## Monsoon Continents

**Design state:** Accepted.

**Narrative premise:** Seasonal thermal contrast drives moisture from warm oceans across continental coasts, producing pronounced wet and dry regions.

**Recognizable geography:** Warm ocean-facing coasts; broad monsoon corridors; strong seasonal moisture gradients; mountain-enhanced rainfall; dry leeward interiors; large rivers fed by wet seasonal regions; contrasting lush and semi-arid provinces.

**Character interpretations:** Realistic follows seasonal circulation and relief. Fantastical amplifies green monsoon kingdoms beside dramatic dry realms. Mundane creates familiar wet coasts and dry interiors. Brutal concentrates floods, crossings and settlement into contested wet corridors.

**Failure conditions:** Uniform global wetness; rainfall unrelated to wind-facing coasts; no dry counterpart to the monsoon; tiny scattered jungles; rivers that ignore the principal moisture corridors.

**Continental and circulation grammar:** Compose approximately two to four substantial warm-climate continents and three to six major monsoon catchments on a Standard map. Broad heated interiors, warm moisture-source seas, concave coasts and bays that funnel air, peninsulas that divide exposure, inland mountain fronts and large lowland basins should jointly produce several versions of the sequence from warm sea through wet river country and orographic uplift into a dry leeward plateau. Do not stamp one repeated coastline template across the world.

**Static seasonal landscape:** Civ V cannot display an annual wet–dry cycle, so terrain must represent its enduring average consequences. Persistently wet windward regions support dense vegetation; seasonal agricultural belts become grassland and fertile plains; less dependable country becomes open savanna-like plains; marshes occupy flood basins and deltas; and dry terrain expands beyond major rain shadows. Green river corridors may cross otherwise dry interiors, but biome transitions must remain broad, causal and irregular rather than becoming hard climate stripes.

**Hierarchical hydrology:** Monsoon catchments should join many tributaries into a few dominant trunk rivers, then widen into floodplains, marshes and substantial legal deltas. Wet depressions and lake remnants may accompany mature lowland drainage. Rivers begin in credible wet uplands or highlands, remain continuous and reach a sea or lake; density should decline sharply beyond the controlling rain-shadow divide. Abundant random rivers are not an acceptable monsoon signal.

**Gameplay and population:** Valuable deltas, floodplains and river lowlands support dense settlement but remain exposed and contested. Major rivers link coastal and inland powers; mountain fronts focus passage; leeward plateaus exchange food for space and strategic geology; peninsulas and bay mouths become maritime gateways. Starts must sample several viable moisture regimes rather than clustering in the richest delta, and balance assessment must account for the exceptional long-term value of connected river country.

**Preferred parameter envelope:** Ordinary water should be approximately 36–62%, defaulting around 48%; mountains should be approximately 8–25%, defaulting around 15%. East–west wrap is normal. Lower water enlarges continental dry interiors, while higher water strengthens maritime exposure, bays and peninsulas without shrinking the catchments below the scale needed for dominant rivers.

**Character interpretation:** Realistic emphasizes circulation-driven moisture paths, orographic rainfall, mature flood basins and credible shadows. Fantastical magnifies deltas, wet-season drainage and lush corridors crossing extraordinary dry interiors. Mundane moderates contrast and simplifies watersheds while retaining directional seasonality. Brutal narrows dependable agricultural belts, intensifies leeward drought and makes rivers, deltas and passes fiercely important.

**Evidence and diagnostics:** Retain moisture-source seas, seasonal wind exposure, bay funnelling, continental heating potential, orographic uplift, windward–leeward precipitation contrast, catchment hierarchy, trunk dominance, river continuity, floodplain and marsh adjacency, delta validity, dry-country extent, biome-transition gradients, start productivity and valuable-land concentration. Reject uniform jungle, equal rainfall on every coast, random marshes, short rivers or climatic patterns unrelated to wind and relief. Blind recognition should describe civilizations organized around enormous seasonal river systems where maritime deluge meets dry continental interiors.

## Glacial World

**Design state:** Accepted.

**Narrative premise:** A cold, strongly seasonal planet is organized by continental ice, glaciated uplands, tundra margins and restricted temperate refuges.

**Recognizable geography:** Broad softly graded ice and tundra regions; continental ice sheets rather than narrow stripes; glaciated mountains beyond the poles; fjorded or broken cold coasts; glacial lakes; sparse forests; dry polar interiors; limited valuable temperate belts.

**Character interpretations:** Realistic produces coherent glacial extent and climate gradients. Fantastical creates impossible frozen realms and spectacular ice boundaries. Mundane resembles a strongly cold Civ world. Brutal creates frozen deserts, severe ranges and narrow thawed settlement corridors.

**Failure conditions:** Merely cool temperate terrain; narrow sharply defined polar bands; abundant jungle; isolated snow confetti; no glacial relationship to altitude or latitude; so much impassable ice that navigation or settlement fails.

**Encroaching-ice grammar:** The world should appear to be actively consumed by cold. Compose one or two broad continental ice sheets, irregular lobes following low ground, secondary mountain caps, glaciated uplands, tundra and periglacial margins, sparse boreal transitions and only occasional temperate refuges. The selected Projection Type determines the principal polar geometry; elevation and continental exposure add secondary glaciation. Ice must modify coastlines, fjords, shelves, lake districts, valleys and drainage before final terrain assignment rather than merely recolouring a normal map.

**Glacial landscape and hydrology:** Accumulation centres are broad and dry, outlet valleys lead toward irregular ice margins, glacial lakes occupy scoured or blocked depressions, and fjords continue former valleys into the sea. Meltwater rivers begin near ice margins or glaciated highlands, remain continuous and reach legal lakes or seas; dense ordinary drainage does not cross ice-sheet interiors. Morainic hills, exposed shelves and drowned cold coasts should reinforce former and present ice limits without forming ruler-straight climatic bands.

**Comfort–value inversion:** Temperate refuges provide exceptional food, freshwater and capital growth but deliberately limited luxury diversity and incomplete strategic access. Tundra margins carry legal Deer, Furs, forest, hills and selected early strategic geology; frozen shelves and coasts organize Fish, Whales, Pearls and sheltered harbours; deeper glacial frontiers may contain coherent legal districts of Oil, Aluminum, Uranium or other valuable geology. Resources must form interpretable ecological, maritime or geological provinces rather than compensatory confetti.

**Expansion and supply:** A major start should have a strong core but depend upon one or more distant cold settlements for long-term power. Each frontier site receives enough local food, freshwater or marine support to be founded, but often cannot realize its potential without an internal food route from the warm core. Excogitare cannot force that choice, but should create legal land or maritime connections within practical trade-route reach and make supplied satellite settlement the attractive response. Capital balance must therefore evaluate the whole expansion proposition rather than only initial yields.

**Defensive frontier:** Ice-choked seas, glacial lakes, fjords, tundra forests, hills and meltwater valleys should shelter valuable enclaves and create defensive ice shields. These structures may narrow approaches but can never seal a resource province or inhabited refuge completely. Every player needs a reasonably comparable path from comfortable capital country to valuable cold frontiers, with sufficient route redundancy and appropriate naval access.

**Preferred parameter envelope:** Ordinary water should be approximately 28–54%, defaulting around 40%; mountains should be approximately 8–25%, defaulting around 15%. Ice coverage must dominate the planetary appearance while retaining viable refuges and corridors. Lower water exposes glacial shelves and land bridges; higher water deepens fjords and separates maritime refuges without removing the continental area needed for ice sheets.

**Character interpretation:** Realistic emphasizes coherent accumulation, asymmetric lobes, glacial erosion, dry cold interiors and graded ecology. Fantastical magnifies frozen realms, fjords, isolated warm refuges and spectacular ice boundaries. Mundane creates an unmistakably cold but more forgiving world with broader boreal country. Brutal narrows thawed corridors, deepens scarcity and strengthens the resource dependency between productive cores and hostile frontiers.

**Evidence and diagnostics:** Retain ice-sheet area and compactness, lobe geometry, projection-relative polar distance, elevation-driven glaciation, glacial-margin irregularity, fjord, lake and shelf association, meltwater drainage, gradient smoothness, refuge count and capacity, cold-region resource value and coherence, comfort–value anticorrelation, capital luxury and strategic incompleteness, frontier site viability, trade-route reach, defensive access, route redundancy and start fairness. Reject a merely cool palette, straight polar bands, snow confetti, physically unrelated ice, self-sufficient temperate paradises, worthless polar reaches or impassable frozen regions. Blind recognition should express both narratives: a world being devoured by ice, and civilizations forced to feed distant cold settlements containing the resources they need.

---

# Polis Map Types

**Polis presentation doctrine:** Polis should play like an intentionally designed board game without looking like one. It compiles starts, political relationships, expansion pressures, routes, contested objectives and balance constraints first, then translates that graph into complete rivers, basins, ranges, coasts, climates and regional terrain. World Character decorates and complicates the retained play structure. Bent routes, offset objectives, unequal silhouettes and continuing geological features should conceal the graph without changing its tested relationships.

**Victory-condition doctrine:** Every Polis identity must describe how its geography affects Domination, Science, Culture, Diplomacy and Time victories. Geography may make their strategies meaningfully different, but cannot make a standard enabled victory impossible or give one player or team exclusive access to its practical requirements. Validation should cover original-capital reachability, viable production and late strategic access, inter-civilization contact and trade, city-state accessibility and contestability, territorial and population opportunity, and the staging or reinforcement costs imposed by the map. Deliberate strategic biases must be disclosed in the identity and balance report rather than erased or left accidental.

## Imperial Ring

**Design state:** Accepted.

**Narrative premise:** Rival civilizations occupy a broad ring around a shared contested interior, creating neighboring fronts and radial approaches toward common objectives.

**Recognizable geography:** Major starts distributed around an inhabitable ring; a central contested region; several radial approaches; neighboring lateral routes; alternate paths around the ring; city states and resources arranged without crowding the initial starts.

**Character interpretations:** Realistic wraps the graph in organic terrain and broad approaches. Fantastical bends the ring through dramatic geographic provinces. Mundane produces clear, balanced radial play. Brutal narrows central approaches and exposes shared objectives.

**Failure conditions:** Starts distributed randomly; no meaningful centre; a single mandatory route; central terrain inaccessible; outer players isolated from neighbors; terrain symmetry without strategic ring behavior.

**Political graph:** Arrange one independent founding enclave per major civilization around the outer world. Capitals should have no convenient early route to one another; their primary expansion paths bend inward like spokes toward a broad inner ring and shared axle. The principal sequence is isolated founding, directed expansion, first contact around the inner approaches, competitive convergence, circulation among several rivals, and only later penetration of another civilization’s outer homeland.

**Founding enclaves and pressure:** Each enclave should normally support a capital and one secondary settlement opportunity with food, freshwater and minimum essential strategic access, but remain strategically incomplete. Luxuries, superior city sites and selected later strategic resources lie along the spoke or inside the central theatre. Isolation is produced through distance, terrain and route structure rather than inaccessible mountains; bypassing the centre to reach another capital should be possible only through deliberately long, late or technologically dependent alternatives.

**Spokes and axle:** Give every player a primary geographic approach and at least one secondary branch, pass or maritime alternative. Spokes contain intermediate settlement value, gradually signal approach to the shared theatre, and have comparable travel cost without identical length or shape. The axle is a broad manoeuvrable region rather than a central tile: an inner basin, lake system, plateau, plain, broken highland or inland sea with enough room for competing cities, routes and military movement. Approaches begin intersecting around its margins so no player can simply claim the entire centre first.

**City states and resources:** Inner-ring city states may act as buffers, diplomatic prizes or guardians of secondary approaches; outer city states may enrich a flank. None may begin beside a major capital, block the only usable spoke or erase the five-tile global start separation. The centre supplies surplus value, luxury diversity, important strategic deposits, wonders or superior mobility, but never the minimum resources required for a major civilization to function.

**Geographic disguise:** Translate the wheel graph into complete natural systems. Spokes become river valleys, peninsulas, plains corridors, mountain passes or sheltered coasts; enclaves become basins, headwater valleys, uplands or bays; the inner ring becomes connected lowlands, shorelines, passes or rivers; and the axle becomes a plausible watershed, plateau, sea or geological basin. Bend, fork and vary spoke widths, offset the centre, avoid perfect angular start intervals, and continue every range or river beyond its immediate gameplay purpose.

**Preferred parameter envelope:** Ordinary water should be approximately 18–54%, defaulting around 34%; mountains should be approximately 7–25%, defaulting around 14%. Either wrap mode is valid only when the intended isolation and convergence graph survives the seam. Zero water produces terrestrial valleys, rivers, ranges and plains; higher water may express enclaves and spokes through peninsulas or maritime corridors without creating early capital-to-capital shortcuts.

**Character interpretation:** Realistic conceals the graph in drainage, coherent relief and environmental corridors. Fantastical uses dramatic provinces, strange approaches and a monumental centre. Mundane employs familiar terrain and restrained regional differences. Brutal makes approaches hostile and defensible while preserving redundancy, arrival parity and central manoeuvre.

**Evidence and diagnostics:** Retain founding-enclave independence and capacity, early capital-to-capital travel, shortest-path convergence through the centre, spoke assignment, branching and redundancy, inner-ring arrival parity, central area and settlement capacity, outer bypasses, resource pressure, city-state obstruction, route changes across wrap seams, angular regularity, radial visual symmetry and repeated terrain. The topology should test like a wheel while a blind visual reviewer describes a plausible collection of basins, valleys, peninsulas and ranges rather than a video-game board.

## Opposing Fronts

**Design state:** Accepted.

**Narrative premise:** Two defended sides confront one another across a limited number of readable invasion corridors.

**Recognizable geography:** Starts organized into opposing blocs; coherent rear territories; several front crossings; lateral routes within each side; defensible but penetrable boundaries; alternatives between direct and flanking attacks.

**Character interpretations:** Realistic uses terrain-led fronts and broad natural approaches. Fantastical creates crooked, asymmetrical theatres. Mundane foregrounds clarity and balance. Brutal compresses the front, strengthens barriers and makes each crossing consequential.

**Failure conditions:** A single bridge deciding the game; no side identity; starts mixed across the front; rear territories exposed immediately; impassable separation; nominal teams without corresponding geography.

**Two-team contract:** Opposing Fronts is authored for two explicitly defined teams, ordinarily of equal size. Each team occupies one coherent side, teammates share rear lateral reinforcement routes, and opponents meet across a common frontier. Free-for-all remains technically possible but is not the promised balanced experience. An odd major-player count must trigger a disclosed choice to reduce the count or accept an explicitly asymmetric match; generation may not silently claim competitive parity.

**Frontier families:** Mountain Curtain uses a great continental divide with multiple passes, transverse valleys, plateaus and optional maritime flanks, placing the teams in separate watersheds. No-Man’s-Land creates a several-tile-deep, sparsely settled DMZ of steppe, ruined farmland, marsh, blasted forest, tundra, desert or abandoned infrastructure. Both families provide approximately three to six independent invasion theatres on a Standard map, lateral movement along the front, forward positions and longer flanking alternatives rather than a straight line or single decisive gate.

**Rear and staging structure:** Capitals begin well behind the front in viable individual provinces. Each team receives coherent rear territory, teammate-to-teammate lateral routes and intermediate staging regions where reinforcement, expansion and forward settlement occur. One corridor may offer the shortest attack, another broad manoeuvre, another defensible passage and another naval or peripheral flank, but no captured route can make the opposing side unreachable.

**Resources and city states:** Every individual start receives essential viability, while each team receives comparable aggregate food, freshwater, luxury diversity, strategic access, defensive terrain and naval opportunity. The frontier holds surplus resources, useful forward sites and mobility advantages rather than minimum survival requirements. City states may buffer secondary crossings or inhabit marginal front regions but cannot obstruct principal theatres, violate start separation or favour one team’s access.

**Brutal war zone:** Brutal may place limited legal fallout in coherent scars, ruined corridors and former battle zones, with barbarian camps occupying abandoned strongpoints, remote passes and infrastructure. These hazards should pressure both teams, complicate early expansion and sometimes create a temporary shared enemy. Fallout and camps may protect valuable sites but cannot cover every crossing, spawn beside capitals, block all clean approaches or concentrate materially against one side.

**Preferred parameter envelope:** Ordinary water should be approximately 14–56%, defaulting around 32%; mountains should be approximately 8–30%, defaulting around 17%. Wrap should normally be None because an uncontrolled seam creates a rear-door bypass. If enabled, every seam route becomes an intentional defended flank and participates in the same travel and balance tests as the main front.

**Character interpretation:** Realistic hides the team graph in a credible range, watershed, inland sea or ecological boundary. Fantastical composes monumental opposed realms and several dramatic front regimes. Mundane uses broad familiar terrain and forgiving redeployment. Brutal creates difficult staging, exposed supply, fallout scars and barbarian strongpoints without sacrificing route alternatives or team parity.

**Evidence and diagnostics:** Retain explicit team assignment and size, individual start viability, team-territory aggregate value, rear cohesion, teammate reinforcement time, capital depth, front length and depth, theatre count and independence, lateral front mobility, crossing capacity, clean and hazardous approaches, flank viability, seam bypasses, city-state obstruction, fallout exposure, barbarian pressure and visual symmetry. Balance must be assessed at individual, team and frontier levels. Blind recognition should describe two alliances established on opposite sides of a great mountain curtain or scarred demilitarized frontier—not a map divided by a visible multiplayer line.

## Contested Heartland

**Design state:** Accepted.

**Narrative premise:** Safe starting territories open toward a valuable central heartland with multiple approaches, flanks and reasons for early conflict.

**Recognizable geography:** A fertile or resource-rich central region; starts outside it; several independent approaches; flanking routes; peripheral expansion space; contested city-state or wonder positions; no player owning the heartland by default.

**Character interpretations:** Realistic makes the heartland a plausible basin or crossroads. Fantastical turns it into a dramatic geographic prize. Mundane keeps the contest immediately legible. Brutal exposes the centre, narrows its entrances and increases early pressure.

**Failure conditions:** Central region inaccessible or worthless; one start significantly closer without compensation; only one entrance; objectives placed inside safe starting territory; a generic radial map without a distinct heartland.

**Political-value contract:** Every major civilization begins in viable but comparatively ordinary peripheral country, while one broad heartland contains materially better connected settlement land, luxury diversity, later strategic resources, wonders or mobility. The heartland should contain approximately three to six valuable internal districts on a Standard map so no first arrival can monopolize the entire prize with one city. Peripheral starts retain food, freshwater and essential sufficiency; entering the heartland is an attractive route to surplus power rather than a prerequisite for basic play.

**Many-to-many topology:** Contested Heartland explicitly rejects Imperial Ring’s spoke-and-axle graph. Starts occupy irregular regions rather than a circle; no player owns a dedicated approach; routes branch, merge and cross before reaching valuable country; multiple players can share one valley, coast or plateau route; and each civilization can reach different heartland districts through materially different paths. Players may meet outside the heartland, while lateral and diagonal travel remains as important as nominal inward movement.

**Heartland families:** The political centre may be geographically offset, elongated, crescent-shaped or divided among linked basins. Great river country joins several watersheds into fertile plains; lake heartland organizes productive shores and inland navigation; a sheltered basin uses multiple passes; a mineral plateau offers commanding routes and strategic geology; an inland sea creates peninsulas and canal sites; and an ecological crossroads brings productive terrain systems together. Value defines the heartland, not proximity to the map’s centre coordinate.

**Approaches and circulation:** Geography should resemble a historical crossroads or broad catchment rather than assigned lanes. Rivers merge irregularly, passes open onto different districts, coastal and inland routes overlap, and corridors continue through the heartland toward other regions instead of terminating at artificial gates. Every player normally receives at least two plausible approaches, but there is no one-to-one player-to-entrance mapping and no requirement that travel bearings point toward a common geometric centre.

**City states and monopolization:** City states may occupy heartland margins, crossroads and secondary districts as diplomatic prizes or buffers, but cannot own every premium site, block an approach or crowd out major settlement. Central value should remain distributed and exposed. Starts closer in raw distance require compensating terrain, travel cost or district access so no civilization effectively owns a portion of the heartland before meaningful competition begins.

**Preferred parameter envelope:** Ordinary water should be approximately 14–54%, defaulting around 32%; mountains should be approximately 7–27%, defaulting around 14%. Either wrap mode is valid only when seam routes participate in the same approach, travel-time and monopolization tests. Terrain totals reshape the heartland and its route mesh without reducing it to a circular clearing or isolated island prize.

**Character interpretation:** Realistic explains central value through watersheds, sheltered basins or geological crossroads. Fantastical creates an extraordinary fertile realm, wonder country or spectacular linked inland sea. Mundane uses familiar productive terrain and legible overlapping routes. Brutal makes peripheral country and selected approaches difficult while keeping the heartland broad, valuable, exposed and resistant to immediate monopoly.

**Evidence and diagnostics:** Retain heartland area, district count and settlement capacity, central-to-peripheral value ratio, start travel time, alternative approaches per player, shared route use, branching, pre-heartland intersections, cross-connections, through-routes, earliest settlement time, resource and wonder monopoly risk, city-state obstruction, seam effects, angular regularity, radial-bearing correlation and shortest-path centralization. A strong spoke pattern is a validation failure. Blind recognition should describe several irregular civilizations converging upon the best country in the world through historical-looking overlapping routes—not players travelling down assigned lanes.

## Rival Continents

**Design state:** Accepted.

**Narrative premise:** Comparable continental blocs face one another across naval lanes, islands and a small number of strategically meaningful crossings.

**Recognizable geography:** Two or more balanced continental blocs; substantial safe interiors; a maritime frontier; contested islands; limited but nonzero crossings; naval and land options; city states distributed as frontier participants rather than start-adjacent clutter.

**Character interpretations:** Realistic produces plausible continental margins and sea lanes. Fantastical creates dramatically different rival realms while preserving opportunity. Mundane resembles a clear competitive continents map. Brutal makes crossings, islands and coastal staging grounds highly contested.

**Failure conditions:** One connected landmass; trivially adjacent capitals; one bloc with much more viable land; empty ocean without contested islands; unlimited coastal hopping; a single crossing whose loss ends interaction.

**Continental-hinge contract:** Compose two principal populated continental worlds whose interiors remain broad, complete and competitively comparable, then bring their margins tantalizingly close through a complicated contact zone. The continents may technically share one difficult land connection while remaining geographically distinct. Their rivalry is organized by the expense and strategic importance of crossing rather than an empty ocean or an explicit team frontier.

**Hinge theatres:** A Standard map should normally contain approximately three to five distinct connections. Thracian straits bring opposed peninsulas within one or two channels; a North Sea crossing places developed coasts across a short exposed sea; a Caucasian corridor forces land travel between inland waters through a narrow mountain valley; Armenian-style highlands offer several expensive plateau routes; and a longer peripheral maritime path supplies a less obvious alternative. Several modes should coexist so neither a single city nor one captured gate can terminate continental interaction.

**Expensive accessibility:** At least one relatively early maritime crossing and one continuous terrestrial route should exist, but both require commitment. Embarkation is exposed and needs escorts and landing capacity; highland travel incurs hills, forests, poor food, passes and detours; strait cities and fleets exert control; roads reduce terrestrial expense only after investment; and forward cities depend upon continental reinforcement. Later infrastructure and naval technology should progressively reduce separation without erasing the frontier’s geography.

**Population and resources:** When player count permits, place multiple major civilizations within each continent and keep capitals well behind the hinge. Each world receives viable local routes, essential strategic sufficiency, luxury diversity and comparable settlement capacity without mirrored terrain. The hinge contains surplus prizes—strait cities, harbours, canal isthmuses, mineral plateaus, fertile pass valleys and staging coasts. City states may inhabit secondary valleys, islands and shores but cannot own every decisive connection or create an unintended effortless bypass.

**Preferred parameter envelope:** Ordinary water should be approximately 24–50%, defaulting around 36%; mountains should be approximately 10–29%, defaulting around 18%. Higher water widens exposed short-sea crossings and deepens straits; lower water exposes shelves and enlarges highland connections without collapsing the worlds into an ordinary pangaea. East–west wrap is normal only when every seam route is included in crossing-cost and reinforcement tests.

**Character interpretation:** Realistic uses credible continental margins, shelves, inland seas and orogenic corridors. Fantastical creates dramatically different rival worlds joined by spectacular straits and highland gates. Mundane offers familiar close continents and legible transport choices. Brutal increases exposure, pass difficulty and staging pressure without removing independent alternatives or giving one continent the superior reinforcement position.

**Evidence and diagnostics:** Retain continental count, land and settlement capacity, majors and start separation per continent, interior connectivity, productive and strategic value, hinge-theatre count and independence, early maritime and terrestrial reachability, sea width and exposure, landing capacity, highland movement cost, pass redundancy, staging distance, control centrality of strait and pass cities, capture resilience, coastal bypasses, reinforcement cost and seam effects. Blind recognition should describe two great continental worlds almost touching across narrow seas, strategic straits and expensive mountain gates—not balanced blobs separated by empty ocean or two teams facing a DMZ.

## Three Realms

**Design state:** Accepted.

**Narrative premise:** Three explicit teams share a world in which every realm has a meaningful geographic frontier with both rivals. Every war between two creates an opportunity for the third, while natural-looking terrain conceals a deliberately tripolar political graph.

**Team contract:** Ordinary generation divides 3, 6, 9 or 12 major players equally among three teams. Each realm receives a coherent internal core, connected teammate starts, two separate frontier systems and geographic depth around its original capitals. Randomise must select compatible counts. An incompatible count triggers a disclosed choice to change the count or accept asymmetric teams; it can never silently claim equal balance.

**Pairwise topology:** Realm A borders B and C, B borders A and C, and C borders A and B without using another realm as transit. Each frontier supports more than one crossing, each realm can reinforce both fronts through internal routes, and the cost of redeployment is meaningful but competitively comparable. There is no required central heartland, radial convergence or single three-way gate.

**Geographic disguise:** Give the three pairwise frontiers different natural expressions—mountain passes, short inland seas, river lowlands, forests, plateaus or broken coasts—while balancing their aggregate strategic cost. Realms may hook, offset and interlock around plausible ranges, basins and watersheds. Avoid equal angles, straight borders, repeated terrain and three visible wedges meeting at a centre.

**Gameplay and anti-runaway structure:** Teams establish internal economies, scout both rivals, concentrate on one front, tolerate or negotiate with the other, intervene in foreign wars and redeploy as the balance changes. Conquest should lengthen supply and expose captured territory to the third realm. No realm may receive two exceptionally defensible fronts; a fallen capital cannot open every remaining capital; and both opponents must retain independent access to a weakened realm.

**City states and resources:** Distribute city states among all three pairwise frontiers with only a few genuinely neutral crossroads. No realm receives a private protected majority, and no city state blocks an essential route or violates start separation. Every team receives essential strategic sufficiency, viable production and settlement capacity, while differing luxury families and surplus resources encourage diplomacy and trade without creating fatal dependency.

**Preferred parameter envelope:** Ordinary water should be approximately 14–56%, defaulting around 32%; mountains should be approximately 8–29%, defaulting around 16%. Wrap should normally be None. If enabled, every seam contact must belong to an existing pairwise frontier and pass the same crossing, reinforcement and capital-reachability tests instead of creating an accidental fourth front.

**Victory geography:** Domination requires at least two eventual invasion structures toward every original capital, while conquest exposes the attacker to the third team. Science requires comparable high-production capacity, connectivity and late strategic access. Culture requires direct contact and trade between every pair of realms. Diplomacy requires geographically contestable city states across all three relationships. Time requires comparable population, settlement and wonder opportunity. Civ V team-rule behavior must be validated separately from three-player free-for-all use.

**Character interpretation:** Realistic creates three geological and watershed provinces joined by credible frontiers. Fantastical makes extraordinary realms collide across monumental seams. Mundane uses restrained familiar terrain without visible symmetry. Brutal increases front difficulty and redeployment cost while preserving pairwise access, team parity and the capacity to respond on both sides.

**Evidence and diagnostics:** Retain team count and allocation, per-realm capacity and resource value, teammate connectivity, pairwise frontier existence, crossing count and independence, capital depth and reachability, two-front reinforcement and redeployment cost, third-party intervention paths, conquest supply extension, runaway exposure, city-state contestability, trade and cultural contact, production, late strategic access, seam contacts and visual triangularity. Blind recognition should describe three great powers that each border both rivals, where every war between two creates an opportunity for the third—not three artificial wedges on a game board.

## Thalassic League

**Design state:** Accepted.

**Narrative premise:** Several free-for-all coastal powers share a navigable maritime network whose ports, islands, city states, straits and trade routes create political power. The sea is connective infrastructure rather than an obstacle, team boundary or central prize reached through spokes.

**Maritime-network contract:** Compose one large shared sea or approximately two to four connected regional basins on a Standard map, with one substantial littoral homeland per major civilization. Each port should connect naturally toward several powers, every basin should have multiple exits when scale permits, and no single strait may shut down the entire world. Early coastal navigation should provide selected regional contacts while every civilization becomes globally reachable after Astronomy.

**Home regions:** Every major receives a viable coastal capital or guaranteed immediately available harbour, approximately three to six credible city sites scaled to map size, freshwater, food, meaningful production and essential strategic sufficiency. A landlocked start violates the identity. Home regions are complete coastal countries rather than tiny islands, while their different shores and luxury families encourage maritime exchange.

**Settlement hierarchy:** Home ports anchor the major powers; league ports occupy route intersections; strait cities exert local control without global monopoly; island stations provide surplus luxuries, resources and reach; city-state harbours create diplomatic competition; and outer refuges offer alternative staging. Reject one-tile resource specks pretending to be stations and islands large enough to become unrelated private continents.

**Gameplay and resources:** Players establish coastal economies, explore neighbouring basins, meet several maritime rivals, compete for city states, settle island stations, protect trade, contest local straits and pursue naval containment or amphibious invasion. Fish, Whales, Pearls and other maritime value should form coherent shelf and sea provinces rather than uniform decoration. Every homeland remains viable; islands and foreign shores provide surplus diversity and strategic position rather than mandatory survival resources.

**City states:** Use a restrained number of viable coastal or island city states at least five tiles from every major start. Each should be reachable and defensible by multiple powers, and none may form a private protected delegate cluster or an unintended coast-hopping bridge that destroys a navigation gate. Their ports should matter to trade and naval positioning without crowding major settlement.

**Preferred parameter envelope:** Ordinary water should be approximately 38–64%, defaulting around 50%; mountains should be approximately 5–21%, defaulting around 11%. Either wrap mode is valid only when the seam belongs to the intended maritime network, preserves alternative routes and does not bypass local chokepoints or contact timing.

**Victory geography:** Domination requires at least two eventual approaches, viable landing areas and reinforcement routes toward every original capital. Science requires productive homelands, internal connectivity and competitive late strategic access rather than production-poor island starts. Culture benefits from contact and maritime trade without giving one power automatic global reach. Diplomacy requires city states contestable by several powers. Time requires comparable total city, population and territorial capacity across different coastlines.

**Character interpretation:** Realistic uses coherent shelves, natural straits, plausible basins and productive hinterlands. Fantastical builds interlocking seas, spectacular harbour realms, unusual islands and dramatic passages. Mundane creates broad readable waters, conventional ports and forgiving stations. Brutal makes lanes exposed, landing zones narrow and outer stations hostile or barbarian-held without creating one unavoidable maritime gate.

**Evidence and diagnostics:** Retain basin count and connectivity, alternative straits, port-to-port travel, early and post-Astronomy contact, homeland and city capacity, coastal-start validity, freshwater and production, strategic sufficiency, landing areas, island-station value, city-state spacing and contestability, maritime-resource coherence, chokepoint control centrality, capture resilience and seam bypasses. Blind recognition should describe powers whose entire political world is made from ports, islands and routes—not civilizations merely placed beside water.

## Unequal Realms

**Design state:** Accepted.

**Narrative premise:** Players deliberately inherit different geographic fates. Compact abundance rewards Tall development, broad lower-density country requires Wide expansion, cramped production and early strategic access make War attractive, and defensible enclosure rewards Turtle play. The positions are unequal by design but remain legal, viable and connected to plausible victory paths.

**Role contract:** Every generation includes Tall, Wide, War and Turtle. Tall receives approximately three to five exceptionally productive connected city sites but limited territorial depth. Wide receives substantially more moderate-quality settlement land, with luxuries and resources distributed so expansion is necessary, at the cost of long borders and reinforcement. War receives strong production, early Horses or Iron, limited peaceful capacity and at least two reachable targets. Turtle receives ordinary-to-good land behind expensive but plural approaches, gaining time and security rather than Tall’s concentrated yield density.

**Player counts and assignment:** Unequal Realms requires at least four majors. Four uses one of each role; five to seven repeats selected roles after including all four; eight uses two of each; larger games repeat roles as evenly as geography permits. Randomise cannot select the type below four players. Start-slot roles are deterministic recipe data and appear in Excogitare’s Start Locations layer and Review report; Civ V may still assign players randomly unless the user creates a fixed scenario.

**Interaction and natural disguise:** War covets developed Tall land or Wide territory; Wide absorbs pressure but struggles to defend its extent; Tall offers valuable concentrated cities but limited replacements; Turtle survives attack but must leave its enclosure to influence the world. Every realm should possess something desirable and lack something available elsewhere. Translate these roles into coherent basins, plains, mineral frontiers, plateaus, peninsulas or islands rather than four quadrants or visibly authored handicap zones.

**Asymmetry strength:** A later advanced control may offer Subtle, Pronounced and Severe, with Pronounced as the narrative default and Severe requiring explicit warning. This control changes the distance between role signatures without relaxing legality, minimum start separation, access or viability. World Modifier and World Character operate after the role graph and may complicate but not erase those signatures.

**Victory geography:** Domination favours War while every original capital remains eventually reachable through more than one structure. Science favours Tall and Turtle, while Wide and War retain sufficient production and late strategic access through successful expansion. Culture favours concentrated development but every role can establish trade and contact. Diplomacy cannot give Wide a private city-state bloc. Time may favour Wide’s territory, balanced partly by population and development potential elsewhere. These are disclosed biases, not exclusive victory permissions.

**Interface, validation and Repair:** Display an Asymmetric label and confirmation stating that land, resources, defence and opportunity intentionally differ. Replace ordinary parity scoring with a Role Viability Report covering role, city capacity, yield density, expansion, defensive access, luxury and strategic profile, rival travel, trade connectivity and favoured or difficult victories. Legality remains absolute, while intended parity failures are suppressed. Repair preserves role contracts; Competitive Repair requires confirmation that equalizing the starts destroys the identity and should relabel the result as a custom balanced map.

**Character interpretation:** Realistic produces asymmetry through plausible environmental and geological provinces. Fantastical exaggerates fertile kingdoms, immense frontiers, warrior highlands and fortress realms. Mundane retains the roles through restrained familiar geography. Brutal confines Tall, exposes Wide, makes War more desperate and isolates Turtle while preserving viability, legal routes and plausible victory access.

**Evidence and diagnostics:** Retain assigned role, role-discrimination score, city capacity, core yield density, settleable territory, border length, reinforcement cost, early strategic access, peaceful expansion ceiling, target count and distance, approach count and defensive centrality, trade and cultural contact, city-state contestability, late production and strategic access, victory biases and unintended parity. Blind review shows start locations but hides role labels; reviewers should identify the four roles substantially above chance. If they cannot, the map is randomly unfair rather than deliberately asymmetric.

---

# Implementation guidance

## Rewrite ownership

This record is the authoritative implementation contract for the Narrative Map Type workstream in [`narrative-generation-rewrite.md`](narrative-generation-rewrite.md). The umbrella plan owns sequencing and shared schemas; this record owns the complete thirty-three-type catalogue, narrative verbs, motifs, anti-motifs, nearest confusions, engine realization requirements and identity evidence. [`generation-substrate.md`](generation-substrate.md) supplies the profile/pass machinery, while [`match-intent-and-polis.md`](match-intent-and-polis.md) supplies the strategic intent consumed by the seven Polis types.

Implementation proceeds through the four recognition benchmarks and then the Excogitare, Eccentric, Physical and Polis waves. A runtime label, preset default or changed seed is not implementation evidence.

## Narrative profile model

A later implementation should give each Map Type an authoritative profile containing at least:

- `premise`: concise user-facing narrative.
- `primaryMotifs`: relationships that define the type.
- `secondaryMotifs`: reinforcing geography and content.
- `antiMotifs`: conditions that weaken or invalidate the identity.
- `softTargets`: preferred counts, proportions, distances and connectedness.
- `hardNarrativeRules`: rare relationships required when compatible with explicit controls and legality.
- `characterInterpretations`: engine-specific coefficient changes for all four characters.
- `identityDiagnostics`: retained measurements explaining why the result passed or weakened.

## Identity scoring

Identity should be measured from retained structure rather than image similarity. Candidate measurements include:

- land and water component hierarchy;
- share of land contained in the dominant component;
- mean and minimum distances between viable realms;
- stepping-stone availability;
- chain membership, arc continuity and shelf association;
- basin separation and deep-water barrier continuity;
- river hierarchy, tributary count, outlet validity, floodplain and delta coverage;
- mountain-range alignment with divides, coasts or plate boundaries;
- biome-region size, contrast and adjacency;
- start relationship to safe, contested, coastal and frontier regions;
- route redundancy and chokepoint criticality.

Scores should be explanatory rather than a single opaque percentage. A result may report, for example, that Broken Island Chains achieved strong arc continuity but weak deep-water separation.

## Control conflicts

Explicit controls remain authoritative, but the interface should disclose consequential conflicts. Examples:

- Low water weakens Lonely Oceans, Drowned Shelves and Volcanic Island Arcs.
- Very high water weakens Broken Pangaea, Lake Kingdoms and Inland Supercontinent.
- Zero mountains weakens Colliding Plates and Plate-Built Continents.
- Sparse rivers weakens Great Watersheds.
- Strong ocean influence weakens the continental core of Inland Supercontinent.
- Extreme geometry may make ring, front or basin relationships infeasible.

The generator should attempt a lawful interpretation, report the weakened motifs and never silently change a deliberate user setting merely to improve its score.

## Proposed implementation order

1. Prototype Lonely Oceans, Broken Island Chains, Great Watersheds and Glacial World because their present output exposes four different identity failures: isolation, correlation, hydrological hierarchy and planetary climate.
2. Add retained identity diagnostics and deterministic regression fixtures for those four types.
3. Add concise interface explanations showing premise, defining motifs and any weakened identity after generation.
4. Expand the same system to the remaining Eccentric and Physical types.
5. Separate Polis Map Type from Conflict Pattern by implementing genuinely different strategic graph templates.
6. Reconcile Excogitare types and remove reliance on a changed seed as evidence of identity.
7. Add Randomise, selective-regeneration, history, export, validation, README, Pages and Alpine runtime coverage before claiming implementation.

## Completion gates

- [x] All thirty current Map Types and three approved Polis additions are catalogued.
- [x] Narrative premises, recognizable geography, character interpretations and failure conditions are specified.
- [x] Engine, Character, Modifier and explicit-control responsibilities are separated conceptually.
- [ ] Authoritative runtime narrative profiles implemented.
- [ ] Engine-specific narrative passes implemented.
- [ ] Identity diagnostics and weakened-premise reporting implemented.
- [ ] Interface presentation implemented without recluttering Create.
- [ ] Randomise, workers, history and selective regeneration verified.
- [ ] Validation, Repair and export consequences verified.
- [ ] Deterministic identity tests and complete regressions pass.
- [ ] README, Pages and Alpine runtime reconciled.
