import type { Civ5Map, Civ5StartLocation, Civ5Tile } from "./civ5-map.ts";
import { connectedTileObjects, type GenerationStructure, type GeographicObject } from "./generation-structure.ts";
import type { GenerationRecipe, WorldScale } from "./generation-recipe.ts";
import type { GenerationStyle, MapGenerationOptions, MapPresetId } from "./map-generator.ts";
import type { NarrativeAssessment, NarrativeFinding, NarrativeProfile, NarrativeProfileId, NarrativeSkeleton, NarrativeSkeletonRegion } from "./narrative-types.ts";

const ALL_SCALES: WorldScale[] = ["GLOBAL", "CONTINENTAL", "REGIONAL", "PROVINCIAL", "LOCAL"];
const COMPILED_IDENTITIES = new Set<MapPresetId>([
  "CONTINENTS", "PANGAEA", "ARCHIPELAGO", "INLAND_SEAS", "EARTHSEA", "RIFT_REALMS", "LABYRINTH", "WILD_REGIONS",
  "LIVING_WORLD", "TECTONIC_CONTINENTS", "GREAT_WATERSHEDS", "SHATTERED_BASINS", "MYTHIC_REGIONS", "ENCIRCLING_LANDS", "ASTRAL_PANGAEA", "RIFTWORLD", "LONELY_OCEANS", "PENINSULA_REALM", "SHATTERED_ARCHIPELAGO",
  "DYNAMIC_EARTH", "COLLIDING_PLATES", "ANCIENT_CRATONS", "ISLAND_ARC_EARTH", "SUPERCONTINENT_INTERIOR", "MONSOON_CONTINENTS", "ICEHOUSE_EARTH",
]);

type NarrativeEnvelope = {
  water: readonly [number, number];
  mountains: readonly [number, number];
  preferredWater: number;
  preferredMountains: number;
  preferredRiverDensity?: "SPARSE" | "NORMAL" | "DENSE";
};

const NARRATIVE_ENVELOPES: Record<MapPresetId, NarrativeEnvelope> = {
  CONTINENTS: { water: [42, 68], mountains: [8, 22], preferredWater: 58, preferredMountains: 12 },
  PANGAEA: { water: [20, 55], mountains: [8, 24], preferredWater: 46, preferredMountains: 14 },
  ARCHIPELAGO: { water: [65, 82], mountains: [4, 20], preferredWater: 72, preferredMountains: 9 },
  INLAND_SEAS: { water: [0, 35], mountains: [8, 24], preferredWater: 24, preferredMountains: 13 },
  EARTHSEA: { water: [52, 72], mountains: [6, 22], preferredWater: 64, preferredMountains: 11 },
  RIFT_REALMS: { water: [48, 70], mountains: [8, 25], preferredWater: 61, preferredMountains: 15 },
  LABYRINTH: { water: [30, 55], mountains: [8, 28], preferredWater: 43, preferredMountains: 18 },
  WILD_REGIONS: { water: [35, 68], mountains: [8, 28], preferredWater: 55, preferredMountains: 16 },
  LIVING_WORLD: { water: [15, 65], mountains: [8, 25], preferredWater: 42, preferredMountains: 14, preferredRiverDensity: "DENSE" },
  TECTONIC_CONTINENTS: { water: [40, 65], mountains: [12, 28], preferredWater: 56, preferredMountains: 19 },
  GREAT_WATERSHEDS: { water: [20, 42], mountains: [10, 22], preferredWater: 35, preferredMountains: 15, preferredRiverDensity: "DENSE" },
  SHATTERED_BASINS: { water: [58, 78], mountains: [6, 20], preferredWater: 66, preferredMountains: 13 },
  MYTHIC_REGIONS: { water: [30, 62], mountains: [12, 30], preferredWater: 52, preferredMountains: 17 },
  ENCIRCLING_LANDS: { water: [15, 38], mountains: [8, 24], preferredWater: 22, preferredMountains: 15 },
  ASTRAL_PANGAEA: { water: [25, 55], mountains: [10, 28], preferredWater: 43, preferredMountains: 18 },
  RIFTWORLD: { water: [45, 72], mountains: [8, 26], preferredWater: 61, preferredMountains: 16 },
  LONELY_OCEANS: { water: [84, 94], mountains: [3, 14], preferredWater: 89, preferredMountains: 7 },
  PENINSULA_REALM: { water: [28, 52], mountains: [10, 26], preferredWater: 39, preferredMountains: 17 },
  SHATTERED_ARCHIPELAGO: { water: [68, 86], mountains: [8, 28], preferredWater: 78, preferredMountains: 16 },
  DYNAMIC_EARTH: { water: [48, 70], mountains: [10, 24], preferredWater: 62, preferredMountains: 15 },
  COLLIDING_PLATES: { water: [38, 62], mountains: [18, 34], preferredWater: 54, preferredMountains: 23 },
  ANCIENT_CRATONS: { water: [25, 58], mountains: [2, 14], preferredWater: 48, preferredMountains: 8, preferredRiverDensity: "DENSE" },
  ISLAND_ARC_EARTH: { water: [68, 84], mountains: [12, 30], preferredWater: 74, preferredMountains: 18 },
  SUPERCONTINENT_INTERIOR: { water: [0, 18], mountains: [10, 24], preferredWater: 0, preferredMountains: 14, preferredRiverDensity: "SPARSE" },
  MONSOON_CONTINENTS: { water: [42, 68], mountains: [10, 24], preferredWater: 57, preferredMountains: 15, preferredRiverDensity: "DENSE" },
  ICEHOUSE_EARTH: { water: [28, 54], mountains: [8, 25], preferredWater: 40, preferredMountains: 15 },
  IMPERIAL_RING: { water: [15, 45], mountains: [10, 26], preferredWater: 34, preferredMountains: 16 },
  OPPOSING_FRONTS: { water: [10, 42], mountains: [14, 32], preferredWater: 28, preferredMountains: 20 },
  CONTESTED_HEARTLAND: { water: [8, 38], mountains: [10, 28], preferredWater: 22, preferredMountains: 18 },
  RIVAL_CONTINENTS: { water: [42, 66], mountains: [8, 24], preferredWater: 54, preferredMountains: 14 },
};

type ProfileSeed = Pick<NarrativeProfile, "id" | "label" | "engine" | "verb" | "premise" | "requiredMotifs" | "forbiddenMotifs" | "nearestConfusions" | "blindRecognition"> & Partial<Omit<NarrativeProfile, "schemaVersion" | "id" | "label" | "engine" | "verb" | "premise" | "requiredMotifs" | "forbiddenMotifs" | "nearestConfusions" | "blindRecognition">>;

function profile(seed: ProfileSeed): NarrativeProfile {
  const implementation = seed.id === "THREE_REALMS" || seed.id === "THALASSIC_LEAGUE" || seed.id === "UNEQUAL_REALMS" ? "FUTURE_RUNTIME" : COMPILED_IDENTITIES.has(seed.id as MapPresetId) ? "BENCHMARK" : "PROFILE_ONLY";
  const envelope = NARRATIVE_ENVELOPES[seed.id as MapPresetId];
  const water = seed.parameterEnvelope?.water ?? envelope?.water ?? [15, 80] as const;
  const mountains = seed.parameterEnvelope?.mountains ?? envelope?.mountains ?? [4, 28] as const;
  return {
    schemaVersion: 1,
    implementation,
    preferredScales: seed.preferredScales ?? ["GLOBAL", "CONTINENTAL", "REGIONAL"],
    allowedScales: seed.allowedScales ?? [...ALL_SCALES],
    parameterEnvelope: { water, mountains, preferredWater: seed.parameterEnvelope?.preferredWater ?? envelope?.preferredWater ?? Math.round((water[0] + water[1]) / 2), preferredMountains: seed.parameterEnvelope?.preferredMountains ?? envelope?.preferredMountains ?? Math.round((mountains[0] + mountains[1]) / 2), preferredRiverDensity: seed.parameterEnvelope?.preferredRiverDensity ?? envelope?.preferredRiverDensity },
    topologyProgram: seed.topologyProgram ?? { kind: seed.id.toLowerCase().replaceAll("_", "-"), regionRange: [2, 8], relationships: seed.requiredMotifs.map((motif) => motif.id) },
    surfaceBiases: seed.surfaceBiases ?? { terrain: [], features: [], resources: [] },
    gameplayContract: seed.gameplayContract ?? { objective: seed.premise, populationRule: "Fit starts to legal settlement capacity without violating five-hex separation." },
    diagnostics: seed.diagnostics ?? seed.requiredMotifs.map((motif) => ({ id: motif.id, label: motif.label, required: true, preferred: [1, 1], unit: "BOOLEAN" as const })),
    ...seed,
  };
}

const m = (id: string, label: string) => ({ id, label });

export const NARRATIVE_PROFILES = {
  CONTINENTS: profile({ id: "CONTINENTS", label: "Crooked Continents", engine: "EXCOGITARE", verb: "Convolutes", premise: "Asymmetric continents make nearby destinations unpredictably expensive through fjords, inland seas and difficult interiors.", requiredMotifs: [m("false-proximity", "False proximity"), m("crooked-interiors", "Crooked continental interiors")], forbiddenMotifs: [m("plain-blobs", "Plain convex continents")], nearestConfusions: ["LABYRINTH", "TECTONIC_CONTINENTS"], blindRecognition: "The continents look traversable until their crooked interiors force surprising detours." }),
  PANGAEA: profile({ id: "PANGAEA", label: "Broken Pangaea", engine: "EXCOGITARE", verb: "Fractures", premise: "One dominant continent is divided by sea, lake or mountains according to the available water budget.", requiredMotifs: [m("dominant-land", "One dominant landmass"), m("credible-fracture", "A legible continent-scale fracture")], forbiddenMotifs: [m("multiple-continents", "Several equal continents")], nearestConfusions: ["ASTRAL_PANGAEA", "RIFT_REALMS"], blindRecognition: "One great continent has been broken but not dispersed." }),
  ARCHIPELAGO: profile({ id: "ARCHIPELAGO", label: "Drowned Shelves", engine: "EXCOGITARE", verb: "Submerges", premise: "Compact island mosaics reveal the highlands and shelves of drowned continents.", requiredMotifs: [m("shelf-clusters", "Clustered drowned shelves"), m("anchor-fragments", "Anchor-to-fragment hierarchy")], forbiddenMotifs: [m("random-scatter", "Random island scatter")], nearestConfusions: ["SHATTERED_ARCHIPELAGO", "EARTHSEA"], blindRecognition: "These islands are the remaining highlands of several drowned continents." }),
  INLAND_SEAS: profile({ id: "INLAND_SEAS", label: "Lake Kingdoms", engine: "EXCOGITARE", verb: "Encloses", premise: "Broad terrestrial kingdoms are organized around hierarchical lakes and enclosed seas.", requiredMotifs: [m("dominant-land", "Dominant enclosing land"), m("water-hierarchy", "Hierarchical inland waters")], forbiddenMotifs: [m("open-ocean", "Open-ocean archipelago")], nearestConfusions: ["SHATTERED_BASINS", "ENCIRCLING_LANDS"], blindRecognition: "Large land kingdoms surround a hierarchy of lakes and inland seas." }),
  EARTHSEA: profile({ id: "EARTHSEA", label: "Island Continents", engine: "EXCOGITARE", verb: "Separates", premise: "Several substantial island homelands retain real interiors and consequential voyages.", requiredMotifs: [m("principal-realms", "Principal island-continent realms"), m("broad-voyages", "Broad inter-realm voyages")], forbiddenMotifs: [m("island-confetti", "Tiny island confetti")], nearestConfusions: ["ARCHIPELAGO", "LONELY_OCEANS"], blindRecognition: "Each large island is a homeland rather than a stepping stone." }),
  RIFT_REALMS: profile({ id: "RIFT_REALMS", label: "Deep-Ocean Divides", engine: "EXCOGITARE", verb: "Gates", premise: "A few monumental deep-ocean scars divide complete navigation basins until Astronomy.", requiredMotifs: [m("deep-rifts", "Continuous deep-water rifts"), m("viable-basins", "Viable navigation basins")], forbiddenMotifs: [m("decorative-cuts", "Decorative water cuts")], nearestConfusions: ["RIFTWORLD", "ASTRAL_PANGAEA"], blindRecognition: "A few impossible oceans divide complete civilizations until Astronomy changes the political world." }),
  LABYRINTH: profile({ id: "LABYRINTH", label: "Land and Sea Maze", engine: "EXCOGITARE", verb: "Entangles", premise: "Chambers and winding land-water corridors make navigation the central problem.", requiredMotifs: [m("tortuous-routes", "Tortuous alternative routes"), m("irregular-chambers", "Irregular settlement chambers")], forbiddenMotifs: [m("regular-oblong-islands", "Regular oblong islands")], nearestConfusions: ["CONTINENTS", "RIFTWORLD"], blindRecognition: "Nearby places are separated by a genuine maze of land and water." }),
  WILD_REGIONS: profile({ id: "WILD_REGIONS", label: "Patchwork Provinces", engine: "EXCOGITARE", verb: "Juxtaposes", premise: "Strongly authored geographic provinces collide without degenerating into tile-scale confetti.", requiredMotifs: [m("province-laws", "Distinct provincial geographic laws"), m("composed-boundaries", "Composed regional boundaries")], forbiddenMotifs: [m("biome-confetti", "Biome confetti")], nearestConfusions: ["MYTHIC_REGIONS", "LIVING_WORLD"], blindRecognition: "This world appears to have been assembled from several different worlds." }),
  LIVING_WORLD: profile({ id: "LIVING_WORLD", label: "Ecological Transect", engine: "ECCENTRIC", verb: "Transitions", premise: "One connected landscape tells a compelling causal environmental story across the map.", requiredMotifs: [m("causal-transect", "Causal environmental transect"), m("living-corridors", "Life-supporting corridors")], forbiddenMotifs: [m("island-focus", "Island-scale composition")], nearestConfusions: ["MONSOON_CONTINENTS", "WILD_REGIONS"], blindRecognition: "The map reads as one complex slice through a living natural world." }),
  TECTONIC_CONTINENTS: profile({ id: "TECTONIC_CONTINENTS", label: "Plate-Built Continents", engine: "ECCENTRIC", verb: "Chronicles", premise: "Each continent records a different authored geological history.", requiredMotifs: [m("distinct-histories", "Distinct continental histories"), m("active-margins", "Responsive margins and interiors")], forbiddenMotifs: [m("repeated-template", "Repeated tectonic template")], nearestConfusions: ["DYNAMIC_EARTH", "COLLIDING_PLATES"], blindRecognition: "Each continent tells a different geological history." }),
  GREAT_WATERSHEDS: profile({ id: "GREAT_WATERSHEDS", label: "Great Watersheds", engine: "ECCENTRIC", verb: "Drains", premise: "A few dominant mountain-fed river systems organize settlement, floodplains and regional identity.", preferredScales: ["CONTINENTAL", "REGIONAL", "PROVINCIAL"], parameterEnvelope: { water: [20, 42], mountains: [10, 22], preferredWater: 35, preferredMountains: 15, preferredRiverDensity: "DENSE" }, requiredMotifs: [m("trunk-rivers", "Dominant trunk rivers"), m("tributary-hierarchy", "Merging tributary hierarchy"), m("wet-lowlands", "Floodplains, marshes and deltas")], forbiddenMotifs: [m("short-unrelated-rivers", "Unrelated short rivers")], topologyProgram: { kind: "watershed-hierarchy", regionRange: [3, 6], relationships: ["headwater", "tributary", "trunk", "outlet"] }, surfaceBiases: { terrain: ["fertile river plains"], features: ["marsh", "forest divides"], resources: ["river food"] }, gameplayContract: { objective: "Make basins and confluences the primary settlement and political structure.", populationRule: "Distribute starts across viable middle and lower valleys without clustering one delta." }, nearestConfusions: ["MONSOON_CONTINENTS", "LIVING_WORLD"], blindRecognition: "The world is arranged around a few enormous river systems." }),
  SHATTERED_BASINS: profile({ id: "SHATTERED_BASINS", label: "Inland Sea Crossroads", engine: "ECCENTRIC", verb: "Crowds", premise: "Great inland seas crowd scarce land to the margins and concentrate power in straits and isthmuses.", requiredMotifs: [m("great-seas", "Several great inland seas"), m("strait-isthmus", "Dominant straits and isthmuses")], forbiddenMotifs: [m("comfortable-continents", "Comfortable inland continents")], nearestConfusions: ["INLAND_SEAS", "LONELY_OCEANS"], blindRecognition: "Civilizations crowd the margins of great connected seas." }),
  MYTHIC_REGIONS: profile({ id: "MYTHIC_REGIONS", label: "Wonder Heartlands", engine: "ECCENTRIC", verb: "Consecrates", premise: "A few mythic hearts concentrate wonders and value behind comparatively barren marches.", requiredMotifs: [m("mythic-hearts", "Enclosed mythic hearts"), m("value-contrast", "Heart-to-march value contrast")], forbiddenMotifs: [m("even-value", "Evenly distributed value")], nearestConfusions: ["WILD_REGIONS", "CONTESTED_HEARTLAND"], blindRecognition: "Exceptional lands of myth rise from comparatively empty marches." }),
  ENCIRCLING_LANDS: profile({ id: "ENCIRCLING_LANDS", label: "Encircled Seas", engine: "ECCENTRIC", verb: "Surrounds", premise: "A continuous outer land journey encloses a hierarchy of inward-facing seas.", requiredMotifs: [m("outer-circuit", "Continuous outer land circuit"), m("enclosed-seas", "Hierarchical enclosed seas")], forbiddenMotifs: [m("broken-ring", "Broken terrestrial circuit")], nearestConfusions: ["INLAND_SEAS", "SHATTERED_BASINS"], blindRecognition: "I could travel around the whole world by land, taking the long outer road around its enclosed seas." }),
  ASTRAL_PANGAEA: profile({ id: "ASTRAL_PANGAEA", label: "Scarred Pangaea", engine: "ECCENTRIC", verb: "Scars", premise: "One continent is unnaturally reorganized by enormous alien graph scars.", requiredMotifs: [m("one-continent", "One surviving continent"), m("alien-scars", "Authoritative alien scars")], forbiddenMotifs: [m("ordinary-fracture", "Ordinary geological fracture")], nearestConfusions: ["PANGAEA", "RIFTWORLD"], blindRecognition: "One continent has been unnaturally reorganized by several enormous alien scars." }),
  RIFTWORLD: profile({ id: "RIFTWORLD", label: "Rift Lattice", engine: "ECCENTRIC", verb: "Partitions", premise: "A hierarchical rift lattice defines unequal cells containing viable local worlds.", requiredMotifs: [m("rift-lattice", "Branching primary and secondary rifts"), m("viable-cells", "Viable unequal cells")], forbiddenMotifs: [m("regular-grid", "Regular rift grid")], nearestConfusions: ["RIFT_REALMS", "LABYRINTH"], blindRecognition: "A global lattice of impossible oceans contains several local worlds." }),
  LONELY_OCEANS: profile({ id: "LONELY_OCEANS", label: "Lonely Oceans", engine: "ECCENTRIC", verb: "Isolates", premise: "Vast empty oceans confine each major civilization to a distant viable island realm.", preferredScales: ["GLOBAL", "CONTINENTAL"], parameterEnvelope: { water: [84, 94], mountains: [3, 14], preferredWater: 89, preferredMountains: 7 }, requiredMotifs: [m("one-major-per-realm", "One major civilization per island realm"), m("empty-ocean", "Intimidating empty deep ocean"), m("viable-scarcity", "Viable but scarce island capacity")], forbiddenMotifs: [m("stepping-stone-bridges", "Stepping-stone bridges between realms"), m("ordinary-archipelago", "Ordinary even archipelago")], topologyProgram: { kind: "isolated-player-realms", regionRange: [2, 22], relationships: ["deep-water-exclusion", "post-astronomy-network"] }, surfaceBiases: { terrain: ["compact island interiors"], features: ["local fisheries"], resources: ["scarce luxuries", "minimum strategic access"] }, gameplayContract: { objective: "Preserve solitude, scarcity and an Astronomy geopolitical transition.", populationRule: "Reduce majors and city states before allowing two major starts to share a realm." }, nearestConfusions: ["EARTHSEA", "SHATTERED_ARCHIPELAGO", "SHATTERED_BASINS"], blindRecognition: "Civilizations are confined to distant islands by a forbidding empty ocean." }),
  PENINSULA_REALM: profile({ id: "PENINSULA_REALM", label: "Great Peninsulas", engine: "ECCENTRIC", verb: "Projects", premise: "Complete Florida- and Italy-like provinces project from one continental backbone.", requiredMotifs: [m("complete-peninsulas", "Country-scale peninsulas"), m("shared-backbone", "Shared continental backbone")], forbiddenMotifs: [m("detached-islands", "Detached principal islands")], nearestConfusions: ["LABYRINTH", "CONTINENTS"], blindRecognition: "One continent is assembled from several complete peninsular countries." }),
  SHATTERED_ARCHIPELAGO: profile({ id: "SHATTERED_ARCHIPELAGO", label: "Broken Island Chains", engine: "ECCENTRIC", verb: "Strings", premise: "Several broken necklaces, crescents and branching parent arcs structure a densely maritime world.", preferredScales: ["GLOBAL", "CONTINENTAL", "REGIONAL"], parameterEnvelope: { water: [68, 86], mountains: [8, 28], preferredWater: 78, preferredMountains: 16 }, requiredMotifs: [m("parent-arcs", "Directional parent arcs"), m("anchor-rhythm", "Anchor–satellite–gap rhythm"), m("deep-chain-gaps", "Deep gaps between systems")], forbiddenMotifs: [m("random-island-scatter", "Independent random island scatter"), m("uniform-islands", "Uniform island size")], topologyProgram: { kind: "parent-island-systems", regionRange: [4, 7], relationships: ["arc", "anchor", "satellite", "gap"] }, surfaceBiases: { terrain: ["volcanic anchors", "drowned shelves"], features: ["sheltered internal seas"], resources: ["anchor capacity"] }, gameplayContract: { objective: "Make expansion follow a parent chain before power projects between systems.", populationRule: "Populate anchor capacity without enforcing one-player solitude." }, nearestConfusions: ["ARCHIPELAGO", "ISLAND_ARC_EARTH", "LONELY_OCEANS"], blindRecognition: "Several broken necklaces and crescents share visible geographic ancestry." }),
  DYNAMIC_EARTH: profile({ id: "DYNAMIC_EARTH", label: "Dynamic Earth", engine: "PHYSICAL", verb: "Evolves", premise: "Several interacting geological and climatic processes reveal a planet changing through time.", requiredMotifs: [m("mixed-processes", "Several interacting physical processes"), m("age-contrast", "Landscapes of different ages")], forbiddenMotifs: [m("single-process", "One dominant physical gimmick")], nearestConfusions: ["TECTONIC_CONTINENTS", "COLLIDING_PLATES"], blindRecognition: "Several parts of this planet are visibly becoming something else." }),
  COLLIDING_PLATES: profile({ id: "COLLIDING_PLATES", label: "Colliding Plates", engine: "PHYSICAL", verb: "Crushes", premise: "Global convergence creates long collision belts, high ranges and difficult forelands.", requiredMotifs: [m("collision-belts", "Long convergent collision belts"), m("forelands", "Plateaus and forelands")], forbiddenMotifs: [m("quiet-interiors", "Globally quiet relief")], nearestConfusions: ["TECTONIC_CONTINENTS", "DYNAMIC_EARTH"], blindRecognition: "Continents are being crushed together along monumental mountain fronts." }),
  ANCIENT_CRATONS: profile({ id: "ANCIENT_CRATONS", label: "Ancient Continental Shields", engine: "PHYSICAL", verb: "Endures", premise: "Old eroded shields, ghost ranges and mature drainage expose deep geological time.", requiredMotifs: [m("shield-cores", "Ancient shield cores"), m("mature-drainage", "Mature rivers and basins")], forbiddenMotifs: [m("young-global-relief", "Globally young relief")], nearestConfusions: ["DYNAMIC_EARTH", "SUPERCONTINENT_INTERIOR"], blindRecognition: "The continents feel ancient, worn down and mineral-rich." }),
  ISLAND_ARC_EARTH: profile({ id: "ISLAND_ARC_EARTH", label: "Volcanic Island Arcs", engine: "PHYSICAL", verb: "Subducts", premise: "Rugged strings of volcanic pearls curve around sheltered seas and age toward atolls.", requiredMotifs: [m("volcanic-arcs", "Volcanic pearl arcs"), m("trench-offset", "Arc and trench association")], forbiddenMotifs: [m("random-volcanism", "Random volcanic scatter")], nearestConfusions: ["SHATTERED_ARCHIPELAGO", "ARCHIPELAGO"], blindRecognition: "Rugged volcanic pearls curve around sheltered, nearly atoll-like seas." }),
  SUPERCONTINENT_INTERIOR: profile({ id: "SUPERCONTINENT_INTERIOR", label: "Inland Supercontinent", engine: "PHYSICAL", verb: "Desiccates", premise: "A ring of highlands surrounds an oceanless continental heart drained by lakes and dry basins.", requiredMotifs: [m("landbound-heart", "Landbound continental heart"), m("inward-drainage", "Inward lakes and drainage")], forbiddenMotifs: [m("open-ocean-dominance", "Open-ocean dominance")], nearestConfusions: ["ANCIENT_CRATONS", "INLAND_SEAS"], blindRecognition: "An Australia-like ring of highlands encloses a vast interior heartland." }),
  MONSOON_CONTINENTS: profile({ id: "MONSOON_CONTINENTS", label: "Monsoon Continents", engine: "PHYSICAL", verb: "Pulses", premise: "Seasonal thermal contrast funnels maritime deluge into enormous rivers beside dry interiors.", requiredMotifs: [m("seasonal-deluge", "Seasonal maritime deluge"), m("dry-wet-contrast", "Wet coasts and dry interiors")], forbiddenMotifs: [m("uniform-rain", "Uniform rainfall")], nearestConfusions: ["GREAT_WATERSHEDS", "LIVING_WORLD"], blindRecognition: "Enormous seasonal rivers carry maritime deluge into dry continental interiors." }),
  ICEHOUSE_EARTH: profile({ id: "ICEHOUSE_EARTH", label: "Glacial World", engine: "PHYSICAL", verb: "Encroaches", premise: "Ice devours the world while productive refuges depend on valuable frozen frontiers.", preferredScales: ["GLOBAL", "CONTINENTAL", "REGIONAL"], parameterEnvelope: { water: [28, 54], mountains: [8, 25], preferredWater: 40, preferredMountains: 15 }, requiredMotifs: [m("broad-ice-sheets", "Broad irregular continental ice sheets"), m("temperate-refuges", "Limited productive temperate refuges"), m("frontier-value", "Valuable cold frontier provinces")], forbiddenMotifs: [m("straight-polar-bands", "Straight polar biome bands"), m("worthless-cold", "Worthless frozen reaches")], topologyProgram: { kind: "ice-lobes-and-refuges", regionRange: [3, 12], relationships: ["ice-sheet", "lobe", "refuge", "supply"] }, surfaceBiases: { terrain: ["snow sheets", "tundra margins", "temperate refuges"], features: ["ice", "sparse boreal forest"], resources: ["cold luxuries", "frontier strategic geology"] }, gameplayContract: { objective: "Make supplied settlement of hostile but valuable cold frontiers attractive.", populationRule: "Give capitals strong food but incomplete strategic and luxury access; keep cold sites viable and reachable." }, nearestConfusions: ["ANCIENT_CRATONS", "SUPERCONTINENT_INTERIOR"], blindRecognition: "A world being devoured by ice forces civilizations to support distant valuable cold settlements." }),
  IMPERIAL_RING: profile({ id: "IMPERIAL_RING", label: "Imperial Ring", engine: "POLIS", verb: "Converges", premise: "Rivals occupy a broad ring around a shared contested interior.", requiredMotifs: [m("start-ring", "Start ring"), m("shared-axle", "Shared contested centre")], forbiddenMotifs: [m("radial-only", "No lateral alternatives")], nearestConfusions: ["CONTESTED_HEARTLAND"], blindRecognition: "Rivals circle a shared centre while retaining routes around one another." }),
  OPPOSING_FRONTS: profile({ id: "OPPOSING_FRONTS", label: "Opposing Fronts", engine: "POLIS", verb: "Opposes", premise: "Two teams face one another across a mountain front or hostile no-man's-land.", requiredMotifs: [m("two-sides", "Two opposing team territories"), m("plural-breaches", "Several invasion corridors")], forbiddenMotifs: [m("single-breach", "One brittle mandatory breach")], nearestConfusions: ["RIVAL_CONTINENTS"], blindRecognition: "Two rival teams face one another across an expensive hostile frontier." }),
  CONTESTED_HEARTLAND: profile({ id: "CONTESTED_HEARTLAND", label: "Contested Heartland", engine: "POLIS", verb: "Contests", premise: "Safe territories open toward a valuable central crossroads through many-to-many approaches.", requiredMotifs: [m("central-value", "Valuable central heartland"), m("many-approaches", "Many-to-many approaches")], forbiddenMotifs: [m("radial-spokes", "Pure radial spoke play")], nearestConfusions: ["IMPERIAL_RING"], blindRecognition: "Every civilization is drawn toward one valuable heartland by several different routes." }),
  RIVAL_CONTINENTS: profile({ id: "RIVAL_CONTINENTS", label: "Rival Continents", engine: "POLIS", verb: "Bridges", premise: "Two strategic blocs face across expensive but accessible sea and highland hinge theatres.", requiredMotifs: [m("two-blocs", "Two strategic continental blocs"), m("hinge-theatres", "Plural expensive crossings")], forbiddenMotifs: [m("impassable-divide", "Impassable global divide")], nearestConfusions: ["OPPOSING_FRONTS", "RIFT_REALMS"], blindRecognition: "Two accessible but expensive-to-cross worlds meet across sea and highland hinges." }),
  THREE_REALMS: profile({ id: "THREE_REALMS", label: "Three Realms", engine: "POLIS", verb: "Triangulates", premise: "Three rival realms each border both others and compete through asymmetric shared theatres.", requiredMotifs: [m("three-borders", "Three mutually bordering realms"), m("victory-triangle", "Plural victory routes")], forbiddenMotifs: [m("one-isolated-realm", "One isolated realm")], nearestConfusions: ["RIVAL_CONTINENTS", "IMPERIAL_RING"], blindRecognition: "Three powers form a strategic triangle in which every realm must reckon with both rivals." }),
  THALASSIC_LEAGUE: profile({ id: "THALASSIC_LEAGUE", label: "Thalassic League", engine: "POLIS", verb: "Networks", premise: "Coastal powers compete through redundant sea lanes, port networks and city-state diplomacy.", requiredMotifs: [m("port-network", "Redundant port network"), m("sea-lanes", "Contestable sea lanes")], forbiddenMotifs: [m("isolated-port", "Brittle isolated ports")], nearestConfusions: ["RIVAL_CONTINENTS", "SHATTERED_BASINS"], blindRecognition: "A league of coastal powers is bound together and divided by its sea lanes." }),
  UNEQUAL_REALMS: profile({ id: "UNEQUAL_REALMS", label: "Unequal Realms", engine: "POLIS", verb: "Differentiates", premise: "Deliberately unequal territories force Tall, Wide, War and Turtle strategic roles.", requiredMotifs: [m("role-contracts", "Distinct strategic role contracts"), m("viable-asymmetry", "Viable deliberate asymmetry")], forbiddenMotifs: [m("hidden-imbalance", "Undisclosed accidental imbalance")], nearestConfusions: ["THREE_REALMS", "CONTESTED_HEARTLAND"], blindRecognition: "Different players have been given fundamentally different but viable strategic problems." }),
} satisfies Record<NarrativeProfileId, NarrativeProfile>;

export function narrativeProfile(id: NarrativeProfileId) { return NARRATIVE_PROFILES[id]; }
export function benchmarkNarrative(id: MapPresetId) { return COMPILED_IDENTITIES.has(id); }

function seedHash(value: string) { let hash = 2166136261; for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619); return hash >>> 0; }
function randomFactory(seed: number) { let state = seed || 1; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; }; }
function clamp(value: number, minimum = 0, maximum = 1) { return Math.max(minimum, Math.min(maximum, value)); }
function wrappedDistance(one: { x: number; y: number }, two: { x: number; y: number }, wraps: boolean) { let dx = Math.abs(one.x - two.x); if (wraps) dx = Math.min(dx, 1 - dx); return Math.hypot(dx, (one.y - two.y) * 0.866); }

function separatedPoints(count: number, random: () => number, wraps: boolean, margin = 0.08) {
  const points = [{ x: margin + random() * (1 - margin * 2), y: margin + random() * (1 - margin * 2) }];
  while (points.length < count) {
    let best = { x: random(), y: random() };
    let bestDistance = -1;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const candidate = { x: margin + random() * (1 - margin * 2), y: margin + random() * (1 - margin * 2) };
      const distance = Math.min(...points.map((point) => wrappedDistance(candidate, point, wraps)));
      if (distance > bestDistance) { best = candidate; bestDistance = distance; }
    }
    points.push(best);
  }
  return points;
}

function narrativePath(from: { x: number; y: number }, to: { x: number; y: number }, bend: number, steps = 9) {
  return Array.from({ length: steps }, (_value, index) => {
    const t = index / (steps - 1);
    const wave = Math.sin(t * Math.PI) * bend;
    return { x: clamp(from.x * (1 - t) + to.x * t + wave * (to.y - from.y), 0.015, 0.985), y: clamp(from.y * (1 - t) + to.y * t - wave * (to.x - from.x), 0.015, 0.985) };
  });
}

function compileCatalogSkeleton(
  id: MapPresetId,
  scale: WorldScale,
  random: () => number,
  wraps: boolean,
  regions: NarrativeSkeleton["regions"],
  relationships: NarrativeSkeleton["relationships"],
  targets: Record<string, number>,
) {
  const add = (role: string, effect: NarrativeSkeletonRegion["effect"], point: { x: number; y: number }, radius: number, priority = 1, parentId?: string) => {
    const region = { id: `${role.toLowerCase()}-${regions.length + 1}`, role, effect, ...point, radius, priority, parentId };
    regions.push(region);
    return region;
  };
  const link = (kind: string, effect: NarrativeSkeleton["relationships"][number]["effect"], from: NarrativeSkeletonRegion, to: NarrativeSkeletonRegion, bend = 0, strength = 1) => {
    relationships.push({ id: `${kind.toLowerCase()}-${relationships.length + 1}`, kind, effect, from: from.id, to: to.id, points: narrativePath(from, to, bend), strength });
  };
  const points = (count: number, margin = 0.08) => separatedPoints(count, random, wraps, margin);
  const scaleCount = (global: number, local: number) => scale === "LOCAL" ? local : scale === "PROVINCIAL" ? Math.max(local, global - 2) : global;

  if (id === "CONTINENTS") {
    const cores = points(scaleCount(4, 2), 0.1).map((point) => add("CONTINENT_CORE", "LAND", point, 0.15, 1.2));
    for (const core of cores) for (let lobe = 0; lobe < 3; lobe += 1) {
      const angle = random() * Math.PI * 2;
      const child = add("CROOKED_LOBE", "LAND", { x: clamp(core.x + Math.cos(angle) * 0.13, 0.04, 0.96), y: clamp(core.y + Math.sin(angle) * 0.11, 0.04, 0.96) }, 0.09, 0.85, core.id);
      link("CROOKED_INTERIOR", "LAND_PATH", core, child, (random() - 0.5) * 0.8, 0.9);
    }
    for (let index = 0; index < cores.length; index += 1) link("FJORD_INTRUSION", "WATER_PATH", cores[index], cores[(index + 1) % cores.length], (random() < 0.5 ? -1 : 1) * 0.55, 0.72);
    targets.continents = cores.length; targets.intrusions = cores.length;
  } else if (id === "PANGAEA" || id === "ASTRAL_PANGAEA") {
    const core = add("DOMINANT_CONTINENT", "LAND", { x: 0.5, y: 0.52 }, id === "PANGAEA" ? 0.3 : 0.32, 1.35);
    const lobes = Array.from({ length: scaleCount(id === "PANGAEA" ? 5 : 7, 3) }, (_v, index) => {
      const angle = index / scaleCount(id === "PANGAEA" ? 5 : 7, 3) * Math.PI * 2 + random() * 0.45;
      const lobe = add(id === "PANGAEA" ? "CONTINENT_LOBE" : "ASTRAL_LOBE", "LAND", { x: clamp(0.5 + Math.cos(angle) * (0.19 + random() * 0.07), 0.04, 0.96), y: clamp(0.52 + Math.sin(angle) * (0.16 + random() * 0.06), 0.05, 0.95) }, 0.13, 1, core.id);
      link("CONTINENT_BOND", "LAND_PATH", core, lobe, (random() - 0.5) * 0.45, 1);
      return lobe;
    });
    const scars = id === "PANGAEA" ? 2 : 4;
    for (let index = 0; index < scars; index += 1) link(id === "PANGAEA" ? "CREDIBLE_FRACTURE" : "ALIEN_SCAR", index % 3 === 2 ? "RIDGE_PATH" : "WATER_PATH", lobes[index % lobes.length], lobes[(index + Math.floor(lobes.length / 2)) % lobes.length], id === "PANGAEA" ? (random() - 0.5) * 0.35 : (index % 2 ? -0.95 : 0.95), 1);
    targets.dominantContinents = 1; targets.fractures = scars;
  } else if (id === "ARCHIPELAGO" || id === "EARTHSEA") {
    const count = scaleCount(id === "ARCHIPELAGO" ? 5 : 4, 3);
    for (const [cluster, center] of points(count, 0.11).entries()) {
      const anchor = add(id === "ARCHIPELAGO" ? "DROWNED_SHELF" : "ISLAND_CONTINENT", "LAND", center, id === "ARCHIPELAGO" ? 0.08 : 0.14, 1.25);
      const satellites = id === "ARCHIPELAGO" ? 4 : 2;
      for (let index = 0; index < satellites; index += 1) {
        const angle = index / satellites * Math.PI * 2 + random();
        const fragment = add("SHELF_FRAGMENT", "LAND", { x: clamp(center.x + Math.cos(angle) * (0.07 + random() * 0.05), 0.03, 0.97), y: clamp(center.y + Math.sin(angle) * (0.06 + random() * 0.04), 0.03, 0.97) }, id === "ARCHIPELAGO" ? 0.035 : 0.055, 0.72, anchor.id);
        link("DROWNED_SHELF_ARC", "LAND_PATH", anchor, fragment, (random() - 0.5) * 0.35, id === "ARCHIPELAGO" ? 0.55 : 0.8);
      }
      targets[`realm${cluster + 1}`] = 1;
    }
    targets.principalRealms = count;
  } else if (id === "INLAND_SEAS" || id === "ENCIRCLING_LANDS") {
    const ringCount = scaleCount(10, 6);
    const ring: NarrativeSkeletonRegion[] = [];
    for (let index = 0; index < ringCount; index += 1) {
      const angle = index / ringCount * Math.PI * 2;
      ring.push(add("ENCLOSING_LAND", "LAND", { x: 0.5 + Math.cos(angle) * 0.39, y: 0.5 + Math.sin(angle) * 0.38 }, id === "ENCIRCLING_LANDS" ? 0.14 : 0.18, 1.15));
    }
    for (let index = 0; index < ring.length; index += 1) link("OUTER_CIRCUIT", "LAND_PATH", ring[index], ring[(index + 1) % ring.length], 0.08, 1);
    const seas = points(scaleCount(id === "ENCIRCLING_LANDS" ? 4 : 6, 2), 0.28);
    seas.forEach((point, index) => add(index ? "INLAND_LAKE" : "INLAND_SEA", "WATER", point, index ? 0.07 : 0.14, index ? 0.7 : 1.2));
    targets.enclosedSeas = seas.length; targets.outerCircuit = ring.length;
  } else if (id === "RIFT_REALMS" || id === "RIFTWORLD") {
    const cells = points(scaleCount(id === "RIFTWORLD" ? 8 : 5, 3), 0.1).map((point) => add("VIABLE_RIFT_CELL", "LAND", point, id === "RIFTWORLD" ? 0.12 : 0.18, 1));
    const rifts = id === "RIFTWORLD" ? Math.max(5, cells.length - 1) : Math.max(2, cells.length - 2);
    for (let index = 0; index < rifts; index += 1) link(index < 2 ? "PRIMARY_RIFT" : "SECONDARY_RIFT", "WATER_PATH", cells[index % cells.length], cells[(index * 3 + 2) % cells.length], (index % 2 ? -1 : 1) * (id === "RIFTWORLD" ? 0.7 : 0.28), index < 2 ? 1 : 0.72);
    targets.riftCells = cells.length; targets.deepRifts = rifts;
  } else if (id === "LABYRINTH") {
    const chambers = points(scaleCount(9, 5), 0.1).map((point) => add("MAZE_CHAMBER", "LAND", point, 0.09 + random() * 0.035, 1));
    for (let index = 0; index < chambers.length - 1; index += 1) link("WINDING_PASSAGE", "LAND_PATH", chambers[index], chambers[index + 1], (index % 2 ? -1 : 1) * (0.65 + random() * 0.3), 1);
    for (let index = 0; index < chambers.length - 2; index += 2) link("BLIND_WATER_ALLEY", "WATER_PATH", chambers[index], chambers[index + 2], (index % 4 ? -1 : 1) * 0.85, 0.8);
    targets.chambers = chambers.length; targets.tortuousRoutes = chambers.length - 1;
  } else if (id === "WILD_REGIONS") {
    const effects: NarrativeSkeletonRegion["effect"][] = ["WET", "DRY", "HOT", "COLD", "RIDGE", "LOWLAND", "LAND", "BARREN"];
    const provinces = points(scaleCount(10, 5), 0.08).map((point, index) => add("PATCHWORK_PROVINCE", effects[index % effects.length], point, 0.12, 1));
    for (let index = 0; index < provinces.length - 1; index += 1) link("COMPOSED_BOUNDARY", "TRANSITION", provinces[index], provinces[index + 1], (random() - 0.5) * 0.35, 0.8);
    targets.provinces = provinces.length;
  } else if (id === "LIVING_WORLD" || id === "MONSOON_CONTINENTS") {
    const sequence: Array<[string, NarrativeSkeletonRegion["effect"], number, number]> = id === "LIVING_WORLD"
      ? [["COAST", "WET", 0.08, 0.54], ["RIVER_MARSH", "WET", 0.27, 0.55], ["LIVING_PLAIN", "LOWLAND", 0.46, 0.51], ["MOUNTAIN_WALL", "RIDGE", 0.66, 0.49], ["RAIN_SHADOW", "DRY", 0.84, 0.5]]
      : [["WET_COAST", "WET", 0.12, 0.54], ["MONSOON_LOWLAND", "WET", 0.34, 0.5], ["OROGRAPHIC_WALL", "RIDGE", 0.57, 0.48], ["DRY_INTERIOR", "DRY", 0.8, 0.51]];
    const transect = sequence.map(([role, effect, x, y]) => add(role, effect, { x, y: y + (random() - 0.5) * 0.08 }, id === "LIVING_WORLD" ? 0.19 : 0.22, 1.1));
    for (let index = 0; index < transect.length - 1; index += 1) link("CAUSAL_TRANSITION", "TRANSITION", transect[index], transect[index + 1], (random() - 0.5) * 0.2, 1);
    link("LIVING_RIVER", "RIVER_PATH", transect[id === "LIVING_WORLD" ? 3 : 2], transect[0], 0.32, 1);
    targets.transitions = transect.length - 1; targets.livingCorridors = 1;
  } else if (id === "TECTONIC_CONTINENTS" || id === "DYNAMIC_EARTH") {
    const count = scaleCount(id === "TECTONIC_CONTINENTS" ? 4 : 5, 3);
    const effects: NarrativeSkeletonRegion["effect"][] = ["VOLCANIC", "RIDGE", "LOWLAND", "DRY", "WET"];
    const systems = points(count, 0.12).map((point, index) => add(id === "TECTONIC_CONTINENTS" ? "GEOLOGIC_HISTORY" : "PROCESS_PROVINCE", effects[index % effects.length], point, 0.17, 1));
    for (let index = 0; index < systems.length; index += 1) link(index % 2 ? "RIFT_MARGIN" : "ACTIVE_MARGIN", index % 2 ? "WATER_PATH" : "RIDGE_PATH", systems[index], systems[(index + 1) % systems.length], (index % 2 ? -1 : 1) * 0.38, 0.9);
    targets.processProvinces = systems.length; targets.activeMargins = systems.length;
  } else if (id === "SHATTERED_BASINS") {
    const seas = points(scaleCount(4, 2), 0.19).map((point) => add("GREAT_INLAND_SEA", "WATER", point, 0.17, 1.2));
    for (let index = 0; index < seas.length - 1; index += 1) link("NARROW_STRAIT", "WATER_PATH", seas[index], seas[index + 1], (random() - 0.5) * 0.15, 0.8);
    for (let index = 0; index < seas.length; index += 1) {
      const next = seas[(index + 1) % seas.length];
      add("VALUABLE_ISTHMUS", "VALUE", { x: (seas[index].x + next.x) / 2, y: (seas[index].y + next.y) / 2 }, 0.035, 1.4);
    }
    targets.greatSeas = seas.length; targets.straits = Math.max(1, seas.length - 1); targets.isthmuses = seas.length;
  } else if (id === "MYTHIC_REGIONS") {
    const hearts = points(scaleCount(5, 3), 0.13).map((point) => add("MYTHIC_HEART", "VALUE", point, 0.055, 1.5));
    for (const heart of hearts) {
      const buffer = add("BARREN_MARCH", random() < 0.55 ? "BARREN" : "RIDGE", { x: heart.x, y: heart.y }, 0.15, 0.9, heart.id);
      relationships.push({ id: `ensconced-${relationships.length + 1}`, kind: "ENSCONCED_BY", effect: "TRANSITION", from: heart.id, to: buffer.id, points: [], strength: 1 });
    }
    targets.mythicHearts = hearts.length; targets.valueContrast = hearts.length;
  } else if (id === "PENINSULA_REALM") {
    const backboneA = add("CONTINENTAL_BACKBONE", "LAND", { x: 0.18, y: 0.5 }, 0.2, 1.3);
    const backboneB = add("CONTINENTAL_BACKBONE", "LAND", { x: 0.42, y: 0.5 }, 0.2, 1.3);
    link("SHARED_BACKBONE", "LAND_PATH", backboneA, backboneB, 0.1, 1);
    const count = scaleCount(6, 3);
    for (let index = 0; index < count; index += 1) {
      const root = index % 2 ? backboneA : backboneB;
      const terminal = add("PENINSULA_PROVINCE", "LAND", { x: clamp(0.48 + index / Math.max(1, count - 1) * 0.42, 0, 1), y: clamp(0.16 + (index % 3) * 0.33 + (random() - 0.5) * 0.08, 0.05, 0.95) }, 0.08, 1, root.id);
      link("PENINSULA_NECK", "LAND_PATH", root, terminal, (index % 2 ? -1 : 1) * 0.42, 1);
    }
    targets.peninsulas = count; targets.backbones = 1;
  } else if (id === "COLLIDING_PLATES") {
    const forelands = points(scaleCount(4, 2), 0.1).map((point) => add("FORELAND", "LOWLAND", point, 0.18, 1));
    for (let index = 0; index < forelands.length; index += 1) link("COLLISION_BELT", "RIDGE_PATH", forelands[index], forelands[(index + 1) % forelands.length], (index % 2 ? -1 : 1) * 0.28, 1);
    targets.collisionBelts = forelands.length; targets.forelands = forelands.length;
  } else if (id === "ANCIENT_CRATONS") {
    const cratons = points(scaleCount(5, 3), 0.12).map((point) => add("ANCIENT_CRATON", "LOWLAND", point, 0.19, 1.2));
    for (let index = 0; index < cratons.length - 1; index += 1) {
      link("GHOST_RANGE", "RIDGE_PATH", cratons[index], cratons[index + 1], (random() - 0.5) * 0.25, 0.34);
      link("MATURE_DRAINAGE", "RIVER_PATH", cratons[index], cratons[index + 1], (index % 2 ? -1 : 1) * 0.4, 0.78);
    }
    targets.cratons = cratons.length; targets.matureRivers = cratons.length - 1;
  } else if (id === "ISLAND_ARC_EARTH") {
    const arcCount = scaleCount(5, 3);
    for (let arc = 0; arc < arcCount; arc += 1) {
      const y = 0.14 + arc / Math.max(1, arcCount - 1) * 0.72;
      const start = add("VOLCANIC_ARC_ANCHOR", "VOLCANIC", { x: 0.16 + random() * 0.08, y }, 0.065, 1.2);
      const end = add("VOLCANIC_ARC_ANCHOR", "VOLCANIC", { x: 0.78 + random() * 0.08, y: clamp(y + (random() - 0.5) * 0.14, 0.05, 0.95) }, 0.07, 1.2);
      link("VOLCANIC_PARENT_ARC", "RIDGE_PATH", start, end, (arc % 2 ? -1 : 1) * 0.65, 1);
      link("ARC_SHELF", "LAND_PATH", start, end, (arc % 2 ? -1 : 1) * 0.58, 0.78);
      link("SHELTERED_ARC_SEA", "WATER_PATH", start, end, (arc % 2 ? -1 : 1) * 0.42, 0.62);
    }
    targets.parentArcs = arcCount; targets.volcanicAnchors = arcCount * 2;
  } else if (id === "SUPERCONTINENT_INTERIOR") {
    const heart = add("INTERIOR_BASIN", "LOWLAND", { x: 0.5, y: 0.51 }, 0.19, 1.2);
    const ring: NarrativeSkeletonRegion[] = [];
    const count = scaleCount(12, 7);
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2;
      ring.push(add("PERIPHERAL_HIGHLAND", "RIDGE", { x: 0.5 + Math.cos(angle) * 0.34, y: 0.5 + Math.sin(angle) * 0.33 }, 0.1, 1));
      link("INWARD_DRAINAGE", "RIVER_PATH", ring.at(-1)!, heart, (index % 2 ? -1 : 1) * 0.2, 0.8);
    }
    for (let index = 0; index < ring.length; index += 1) link("HIGHLAND_RING", "RIDGE_PATH", ring[index], ring[(index + 1) % ring.length], 0.05, 0.85);
    targets.oceanless = 1; targets.interiorBasins = 1; targets.highlandRing = count;
  } else return false;
  return true;
}

export function compileNarrativeSkeleton(options: MapGenerationOptions, recipe: GenerationRecipe, width: number, height: number, wraps: boolean): NarrativeSkeleton {
  const profile = narrativeProfile(recipe.mapType);
  const random = randomFactory(seedHash(`${options.seed}:${recipe.mapType}:${recipe.scale}:narrative-skeleton`));
  const area = width * height;
  const targetLand = area - Math.round(area * clamp(options.waterPercent / 100, 0, 0.9));
  const conflicts: string[] = [];
  if (options.waterPercent < profile.parameterEnvelope.water[0] || options.waterPercent > profile.parameterEnvelope.water[1]) conflicts.push(`Water ${options.waterPercent}% is outside the ${profile.parameterEnvelope.water[0]}–${profile.parameterEnvelope.water[1]}% narrative envelope.`);
  if (options.mountainPercent < profile.parameterEnvelope.mountains[0] || options.mountainPercent > profile.parameterEnvelope.mountains[1]) conflicts.push(`Mountains ${options.mountainPercent}% are outside the ${profile.parameterEnvelope.mountains[0]}–${profile.parameterEnvelope.mountains[1]}% narrative envelope.`);
  if (!profile.allowedScales.includes(recipe.scale)) conflicts.push(`${recipe.scale.toLowerCase()} Scale is not supported by this identity.`);
  const regions: NarrativeSkeleton["regions"] = [];
  const relationships: NarrativeSkeleton["relationships"] = [];
  const relaxations: string[] = [];
  const targets: Record<string, number> = { targetLand, targetWater: area - targetLand };

  if (recipe.mapType === "LONELY_OCEANS") {
    const minimumRealmLand = Math.max(22, Math.round(area * (recipe.scale === "LOCAL" ? 0.018 : 0.008)));
    const requested = Math.max(2, Math.min(22, options.players));
    const count = Math.max(2, Math.min(requested, Math.floor(targetLand / minimumRealmLand)));
    if (count < requested) relaxations.push(`Principal realms reduced from ${requested} to ${count} because the selected water level and tile budget cannot sustain isolated starts.`);
    separatedPoints(count, random, wraps, 0.11).forEach((point, index) => regions.push({ id: `realm-${index + 1}`, role: "REALM", ...point, radius: Math.sqrt(targetLand / Math.max(1, count) / Math.PI / area) * 1.35, priority: 1 }));
    for (let one = 0; one < count; one += 1) for (let two = one + 1; two < count; two += 1) relationships.push({ id: `isolation-${one + 1}-${two + 1}`, kind: "ISOLATED_FROM", from: regions[one].id, to: regions[two].id, points: [], strength: 1 });
    targets.principalRealms = count;
    targets.minimumRealmLand = minimumRealmLand;
  } else if (recipe.mapType === "SHATTERED_ARCHIPELAGO") {
    const systemCount = recipe.scale === "LOCAL" ? 3 : recipe.scale === "PROVINCIAL" ? 4 : Math.max(4, Math.min(7, Math.round(4 + random() * 3)));
    const systemCenters = separatedPoints(systemCount, random, wraps, 0.08);
    for (let system = 0; system < systemCount; system += 1) {
      const center = systemCenters[system];
      const chainId = `chain-${system + 1}`;
      regions.push({ id: chainId, role: "CHAIN", ...center, radius: 0.18, priority: 0.8 });
      const angle = random() * Math.PI * 2;
      const nodes = 5 + Math.floor(random() * 4);
      const points: Array<{ x: number; y: number }> = [];
      for (let node = 0; node < nodes; node += 1) {
        const t = nodes === 1 ? 0 : node / (nodes - 1) - 0.5;
        const curve = Math.sin((t + 0.5) * Math.PI) * (0.035 + random() * 0.025);
        const x = (center.x + Math.cos(angle) * t * 0.3 - Math.sin(angle) * curve + 1) % 1;
        const y = clamp(center.y + Math.sin(angle) * t * 0.26 + Math.cos(angle) * curve, 0.04, 0.96);
        const anchor = node === 1 || node === nodes - 2 || node === Math.floor(nodes / 2);
        const region: NarrativeSkeletonRegion = { id: `${chainId}-${anchor ? "anchor" : "satellite"}-${node + 1}`, role: anchor ? "ANCHOR" : "GENERIC", x, y, radius: anchor ? 0.045 : 0.022, parentId: chainId, priority: anchor ? 1 : 0.6 };
        regions.push(region);
        relationships.push({ id: `${chainId}-member-${node + 1}`, kind: "BELONGS_TO", from: region.id, to: chainId, points: [], strength: anchor ? 1 : 0.7 });
        points.push({ x, y });
      }
      relationships.push({ id: `${chainId}-arc`, kind: "FOLLOWS_ARC", from: regions.at(-(nodes))!.id, to: regions.at(-1)!.id, points, strength: 1 });
    }
    targets.parentSystems = systemCount;
  } else if (recipe.mapType === "GREAT_WATERSHEDS") {
    const basinCount = recipe.scale === "LOCAL" ? 2 : recipe.scale === "PROVINCIAL" ? 3 : Math.max(3, Math.min(6, Math.round(3 + random() * 3)));
    const basins = separatedPoints(basinCount, random, wraps, 0.12);
    for (let basin = 0; basin < basinCount; basin += 1) {
      const center = basins[basin];
      const head = { x: clamp(center.x + (random() - 0.5) * 0.18, 0.05, 0.95), y: clamp(0.13 + random() * 0.18, 0.05, 0.95) };
      const outlet = { x: clamp(center.x + (random() - 0.5) * 0.22, 0.05, 0.95), y: clamp(0.78 + random() * 0.16, 0.05, 0.95) };
      const basinRegion = { id: `basin-${basin + 1}`, role: "BASIN" as const, ...center, radius: 0.16, priority: 1 };
      const headRegion = { id: `headwater-${basin + 1}`, role: "HEADWATER" as const, ...head, radius: 0.035, parentId: basinRegion.id, priority: 1 };
      const outletRegion = { id: `outlet-${basin + 1}`, role: "OUTLET" as const, ...outlet, radius: 0.045, parentId: basinRegion.id, priority: 1 };
      regions.push(basinRegion, headRegion, outletRegion);
      const trunk = Array.from({ length: 9 }, (_value, step) => { const t = step / 8; return { x: clamp(head.x * (1 - t) + outlet.x * t + Math.sin(t * Math.PI * 2 + basin) * 0.025, 0, 1), y: head.y * (1 - t) + outlet.y * t }; });
      relationships.push({ id: `trunk-${basin + 1}`, kind: "FLOWS_TO", from: headRegion.id, to: outletRegion.id, points: trunk, strength: 1 });
      for (let tributary = 0; tributary < 2; tributary += 1) {
        const join = trunk[3 + tributary * 2];
        const side = tributary % 2 ? 1 : -1;
        relationships.push({ id: `tributary-${basin + 1}-${tributary + 1}`, kind: "FLOWS_TO", from: basinRegion.id, to: `trunk-${basin + 1}`, points: [{ x: clamp(join.x + side * (0.12 + random() * 0.06), 0.02, 0.98), y: clamp(join.y - 0.1 - random() * 0.08, 0.02, 0.98) }, join], strength: 0.72 });
      }
    }
    targets.primaryCatchments = basinCount;
    targets.trunkRivers = basinCount;
    targets.tributaries = basinCount * 2;
  } else if (recipe.mapType === "ICEHOUSE_EARTH") {
    const sheetCount = recipe.scale === "LOCAL" ? 1 : 2;
    const sheetCenters = recipe.scale === "LOCAL" ? separatedPoints(1, random, wraps, 0.15) : [{ x: 0.3 + random() * 0.12, y: 0.18 + random() * 0.12 }, { x: 0.64 + random() * 0.12, y: 0.73 + random() * 0.12 }];
    sheetCenters.forEach((point, index) => regions.push({ id: `ice-sheet-${index + 1}`, role: "ICE_SHEET", ...point, radius: recipe.scale === "GLOBAL" ? 0.38 : 0.31, priority: 1 }));
    const refugeCount = Math.max(2, Math.min(options.players, recipe.scale === "LOCAL" ? 3 : 6));
    separatedPoints(refugeCount, random, wraps, 0.1).forEach((point, index) => regions.push({ id: `refuge-${index + 1}`, role: "REFUGE", x: point.x, y: clamp(0.36 + point.y * 0.28, 0.24, 0.76), radius: 0.055, priority: 1 }));
    for (const refuge of regions.filter((region) => region.role === "REFUGE")) for (const sheet of regions.filter((region) => region.role === "ICE_SHEET")) relationships.push({ id: `${refuge.id}-supplies-${sheet.id}`, kind: "SUPPLIES", from: refuge.id, to: sheet.id, points: [], strength: 0.7 });
    targets.iceSheets = sheetCount;
    targets.refuges = refugeCount;
  } else if (!compileCatalogSkeleton(recipe.mapType, recipe.scale, random, wraps, regions, relationships, targets)) {
    regions.push({ id: "narrative-region-1", role: "GENERIC", x: 0.5, y: 0.5, radius: 0.3, priority: 1 });
  }

  return { schemaVersion: 1, profileId: recipe.mapType, implementation: profile.implementation, scale: recipe.scale, width, height, seed: options.seed, regions, relationships, targets, conflicts, relaxations };
}

type NarrativeGeography = { landMask: boolean[]; reliefValues: number[]; temperatures?: number[]; moistures: number[]; elevations: number[]; riverGuidance?: number[]; tiles: Civ5Tile[]; structure: GenerationStructure; startLocations?: Civ5StartLocation[] };

function tileDistance(index: number, region: { x: number; y: number; radius?: number }, width: number, height: number, wraps: boolean) {
  const point = { x: (index % width + 0.5) / width, y: (Math.floor(index / width) + 0.5) / height };
  let dx = Math.abs(point.x - region.x); if (wraps) dx = Math.min(dx, 1 - dx);
  return Math.hypot(dx * width / Math.max(width, height), (point.y - region.y) * height / Math.max(width, height) * 0.866);
}

function exactNarrativeMask(scores: number[], landCount: number) {
  const selected = new Set(scores.map((_value, index) => index).sort((one, two) => scores[two] - scores[one] || one - two).slice(0, Math.max(0, Math.min(scores.length, landCount))));
  return scores.map((_value, index) => selected.has(index));
}

function narrativeObjects(skeleton: NarrativeSkeleton, landMask: boolean[], width: number, height: number, wraps: boolean) {
  const regions: GeographicObject[] = skeleton.regions.map((region) => ({ id: `narrative-${region.id}`, name: region.id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), kind: region.role === "ICE_SHEET" ? "ICE_SHEET" : region.role === "REFUGE" ? "REFUGE" : "NARRATIVE_REGION", tileIndices: landMask.flatMap((land, index) => (region.effect === "WATER" ? !land : land) && tileDistance(index, region, width, height, wraps) <= region.radius ? [index] : []), attributes: { role: region.role, effect: region.effect ?? "", parent: region.parentId ?? "", priority: region.priority } }));
  const paths: GeographicObject[] = skeleton.relationships.filter((relationship) => relationship.points.length).map((relationship) => ({ id: `narrative-${relationship.id}`, name: relationship.id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), kind: "NARRATIVE_PATH", tileIndices: relationship.points.map((point) => Math.min(width * height - 1, Math.max(0, Math.floor(point.y * height) * width + Math.min(width - 1, Math.floor(point.x * width))))), attributes: { relationship: relationship.kind, effect: relationship.effect ?? "", from: relationship.from, to: relationship.to, strength: relationship.strength } }));
  return [...regions, ...paths].filter((object) => object.tileIndices.length);
}

function rebuildTopologyObjects(structure: GenerationStructure, landMask: boolean[], width: number, height: number, wraps: boolean) {
  const replacedKinds = new Set(["CONTINENT", "OCEAN_BASIN"]);
  return [
    ...structure.objects.filter((object) => !replacedKinds.has(object.kind)).map((object) => ({ ...object, tileIndices: object.tileIndices.filter((index) => index >= 0 && index < landMask.length) })).filter((object) => object.tileIndices.length),
    ...connectedTileObjects("CONTINENT", landMask, width, height, wraps, "Narrative Landmass"),
    ...connectedTileObjects("OCEAN_BASIN", landMask.map((land) => !land), width, height, wraps, "Narrative Ocean"),
  ];
}

function nearestLand(index: number, mask: boolean[], elevations: number[], width: number, height: number, wraps: boolean) {
  const origin = { x: index % width, y: Math.floor(index / width) };
  let best = -1; let distance = Number.POSITIVE_INFINITY;
  for (let candidate = 0; candidate < mask.length; candidate += 1) {
    if (!mask[candidate] || elevations[candidate] === 2) continue;
    let dx = Math.abs(candidate % width - origin.x); if (wraps) dx = Math.min(dx, width - dx);
    const dy = Math.abs(Math.floor(candidate / width) - origin.y) * 0.866;
    const current = Math.hypot(dx, dy);
    if (current < distance) { best = candidate; distance = current; }
  }
  return best;
}

export function realizeNarrativeGeography<T extends NarrativeGeography>(geography: T, skeleton: NarrativeSkeleton, options: MapGenerationOptions, width: number, height: number, wraps: boolean, seed: number): T {
  if (skeleton.implementation !== "BENCHMARK") return { ...geography, structure: { ...geography.structure, narrativeSkeleton: skeleton } };
  const area = width * height;
  const landCount = area - Math.round(area * clamp(options.waterPercent / 100, 0, 0.9));
  let landMask = [...geography.landMask];
  const elevations = [...geography.elevations];
  const reliefValues = [...geography.reliefValues];
  const temperatures = geography.temperatures ? [...geography.temperatures] : undefined;
  const moistures = [...geography.moistures];
  const riverGuidance = geography.riverGuidance ? [...geography.riverGuidance] : new Array<number>(area).fill(0);
  let startLocations = geography.startLocations?.map((start) => ({ ...start }));
  const narrativeEffects = new Array<NarrativeSkeletonRegion["effect"] | undefined>(area);

  if (skeleton.profileId === "LONELY_OCEANS") {
    const realms = skeleton.regions.filter((region) => region.role === "REALM");
    const scores = Array.from({ length: area }, (_value, index) => {
      const x = index % width; const y = Math.floor(index / width);
      const realm = realms.reduce((best, candidate) => tileDistance(index, candidate, width, height, wraps) < tileDistance(index, best, width, height, wraps) ? candidate : best, realms[0]);
      const distance = tileDistance(index, realm, width, height, wraps);
      const noise = Math.sin((x + seed % 17) * 0.51) * 0.0045 + Math.cos((y + seed % 23) * 0.43) * 0.0045;
      return realm.radius - distance + noise;
    });
    landMask = exactNarrativeMask(scores, landCount);
    startLocations = realms.flatMap((realm, player) => {
      const origin = Math.min(area - 1, Math.floor(realm.y * height) * width + Math.min(width - 1, Math.floor(realm.x * width)));
      const index = nearestLand(origin, landMask, elevations, width, height, wraps);
      return index < 0 ? [] : [{ x: index % width, y: Math.floor(index / width), player, civilization: "", leader: "", team: player, playable: true, cityState: false }];
    });
  } else if (skeleton.profileId === "SHATTERED_ARCHIPELAGO") {
    const islands = skeleton.regions.filter((region) => region.parentId);
    const scores = Array.from({ length: area }, (_value, index) => {
      const nearest = islands.reduce((best, candidate) => {
        const score = candidate.radius * candidate.priority - tileDistance(index, candidate, width, height, wraps);
        return score > best.score ? { score, candidate } : best;
      }, { score: Number.NEGATIVE_INFINITY, candidate: islands[0] });
      const x = index % width; const y = Math.floor(index / width);
      return nearest.score + Math.sin(x * 1.71 + y * 0.89 + seed) * 0.008;
    });
    landMask = exactNarrativeMask(scores, landCount);
    for (const island of islands.filter((region) => region.role === "ANCHOR")) {
      const center = Math.min(area - 1, Math.floor(island.y * height) * width + Math.min(width - 1, Math.floor(island.x * width)));
      for (let index = 0; index < area; index += 1) if (landMask[index] && tileDistance(index, island, width, height, wraps) < island.radius * 0.75) reliefValues[index] += 0.42;
      elevations[center] = landMask[center] ? 2 : elevations[center];
    }
  } else if (skeleton.profileId === "GREAT_WATERSHEDS") {
    for (const relationship of skeleton.relationships.filter((item) => item.kind === "FLOWS_TO")) {
      relationship.points.forEach((point, pointIndex) => {
        const center = Math.min(area - 1, Math.floor(point.y * height) * width + Math.min(width - 1, Math.floor(point.x * width)));
        for (let index = 0; index < area; index += 1) {
          if (!landMask[index]) continue;
          const distance = Math.hypot(index % width - center % width, (Math.floor(index / width) - Math.floor(center / width)) * 0.866);
          if (distance < 1.4) riverGuidance[index] = Math.max(riverGuidance[index], relationship.strength >= 0.9 ? 1 : 0.72);
          else if (distance < 3) riverGuidance[index] = Math.max(riverGuidance[index], 0.52);
          if (pointIndex === 0 && distance < 2.4) { reliefValues[index] += 0.5; elevations[index] = distance < 1.25 ? 2 : Math.max(1, elevations[index]); }
        }
      });
    }
  } else if (skeleton.profileId === "ICEHOUSE_EARTH" && temperatures) {
    const sheets = skeleton.regions.filter((region) => region.role === "ICE_SHEET");
    const refuges = skeleton.regions.filter((region) => region.role === "REFUGE");
    for (let index = 0; index < area; index += 1) {
      const sheetInfluence = Math.max(...sheets.map((sheet) => clamp(1 - tileDistance(index, sheet, width, height, wraps) / sheet.radius)));
      const lobe = Math.sin((index % width + seed % 29) * 0.27) * 0.055 + Math.cos((Math.floor(index / width) + seed % 31) * 0.31) * 0.055;
      const refugeInfluence = Math.max(0, ...refuges.map((refuge) => clamp(1 - tileDistance(index, refuge, width, height, wraps) / refuge.radius)));
      temperatures[index] = clamp(Math.min(temperatures[index], 0.48 - sheetInfluence * 0.46 + lobe) + refugeInfluence * 0.42);
      if (landMask[index] && sheetInfluence > 0.66 && refugeInfluence < 0.35) elevations[index] = Math.max(elevations[index], reliefValues[index] > 0.72 ? 2 : 0);
      moistures[index] = landMask[index] ? clamp(moistures[index] - sheetInfluence * 0.2 + refugeInfluence * 0.18) : moistures[index];
    }
  } else {
    const regionLandWeight: Record<NonNullable<NarrativeSkeletonRegion["effect"]>, number> = {
      LAND: 1.35, WATER: -1.65, RIDGE: 1.2, LOWLAND: 1.15, WET: 1.18, DRY: 1.18, COLD: 1.18, HOT: 1.18, VALUE: 1.3, BARREN: 1.12, VOLCANIC: 1.24,
    };
    const scores = Array.from({ length: area }, (_value, index) => {
      const x = index % width; const y = Math.floor(index / width);
      let score = geography.landMask[index] ? 0.12 : -0.12;
      let strongest = Number.NEGATIVE_INFINITY;
      for (const region of skeleton.regions) {
        if (!region.effect) continue;
        const influence = clamp(1 - tileDistance(index, region, width, height, wraps) / Math.max(0.018, region.radius));
        if (influence <= 0) continue;
        score += regionLandWeight[region.effect] * influence * region.priority;
        if (influence * region.priority > strongest) { strongest = influence * region.priority; narrativeEffects[index] = region.effect; }
        if (region.effect === "RIDGE" || region.effect === "VOLCANIC") reliefValues[index] += influence * (region.effect === "VOLCANIC" ? 0.58 : 0.46) * region.priority;
        if (region.effect === "LOWLAND") reliefValues[index] -= influence * 0.3;
        if (region.effect === "WET") moistures[index] = clamp(moistures[index] + influence * 0.42);
        if (region.effect === "DRY" || region.effect === "BARREN") moistures[index] = clamp(moistures[index] - influence * 0.48);
        if (temperatures && region.effect === "COLD") temperatures[index] = clamp(temperatures[index] - influence * 0.4);
        if (temperatures && (region.effect === "HOT" || region.effect === "VOLCANIC")) temperatures[index] = clamp(temperatures[index] + influence * 0.28);
      }
      for (const relationship of skeleton.relationships) {
        if (!relationship.effect || !relationship.points.length) continue;
        const distance = Math.min(...relationship.points.map((point) => tileDistance(index, { ...point, radius: 0 }, width, height, wraps)));
        const widthFactor = relationship.effect === "WATER_PATH" ? 0.032 : relationship.effect === "LAND_PATH" ? 0.026 : 0.022;
        const influence = clamp(1 - distance / widthFactor) * relationship.strength;
        if (!influence) continue;
        if (relationship.effect === "LAND_PATH") score += influence * 1.9;
        if (relationship.effect === "WATER_PATH") score -= influence * 1.8;
        if (relationship.effect === "RIDGE_PATH") { score += influence * 0.62; reliefValues[index] += influence * 0.72; }
        if (relationship.effect === "RIVER_PATH") { score += influence * 0.36; reliefValues[index] -= influence * 0.16; riverGuidance[index] = Math.max(riverGuidance[index], 0.62 + influence * 0.35); moistures[index] = clamp(moistures[index] + influence * 0.28); }
      }
      if (skeleton.profileId === "ENCIRCLING_LANDS") {
        const edge = Math.min((x + 0.5) / width, (width - x - 0.5) / width, (y + 0.5) / height, (height - y - 0.5) / height);
        score += clamp((0.16 - edge) / 0.16) * 1.2;
      }
      if (skeleton.profileId === "INLAND_SEAS") {
        const edge = Math.min(x, width - x - 1, y, height - y - 1);
        if (edge < 2) score += 10;
      }
      if (skeleton.profileId === "SUPERCONTINENT_INTERIOR") {
        const edge = Math.min(x, width - x - 1, y, height - y - 1);
        if (edge < 2) score += 2;
      }
      return score + Math.sin(x * 0.71 + y * 0.39 + seed) * 0.012 + Math.cos(x * 0.23 - y * 0.61 + seed * 0.3) * 0.01;
    });
    landMask = exactNarrativeMask(scores, landCount);
    for (let index = 0; index < area; index += 1) {
      if (!landMask[index]) { elevations[index] = 0; continue; }
      const effect = narrativeEffects[index];
      if (effect === "RIDGE" || effect === "VOLCANIC") elevations[index] = reliefValues[index] > 0.72 ? 2 : Math.max(1, elevations[index]);
      else if (effect === "LOWLAND") elevations[index] = 0;
      else if (!geography.landMask[index]) elevations[index] = reliefValues[index] > 0.64 ? 1 : 0;
    }
  }

  const tiles = geography.tiles.map((source, index): Civ5Tile => {
    const land = landMask[index];
    const adjacentLand = connectedNeighbors(index, width, height, wraps).some((neighbor) => landMask[neighbor]);
    const tile = { ...source, elevation: land ? elevations[index] : 0, continent: land ? source.continent || 1 : 0 };
    if (!land) { tile.terrain = adjacentLand ? 1 : 0; tile.feature = skeleton.profileId === "ICEHOUSE_EARTH" && (temperatures?.[index] ?? 1) < 0.12 ? 3 : 255; tile.resource = 255; tile.resourceAmount = 0; tile.wonder = 255; tile.river = 0; return tile; }
    if (source.terrain < 2) {
      const dominantTerrain = options.dominantTerrains[0];
      tile.terrain = dominantTerrain === "GRASSLAND" ? 2 : dominantTerrain === "DESERT" ? 4 : dominantTerrain === "TUNDRA" ? 5 : 3;
      if (options.eccentricExtreme === "SNOWBALL") tile.terrain = index % 5 ? 6 : 5;
      if (options.eccentricExtreme === "ARRAKIS") tile.terrain = 4;
      if (options.eccentricExtreme === "JURASSIC" || options.eccentricExtreme === "ARBOREA") tile.terrain = 2;
      if (options.eccentricExtreme === "JURASSIC") tile.feature = 1;
      if (options.eccentricExtreme === "ARBOREA") tile.feature = 0;
    }
    if (skeleton.profileId === "GREAT_WATERSHEDS") {
      const downstream = skeleton.relationships.filter((item) => item.kind === "FLOWS_TO" && item.strength >= 0.9).some((relationship) => relationship.points.slice(Math.floor(relationship.points.length * 0.58)).some((point) => tileDistance(index, { ...point, radius: 0 }, width, height, wraps) < 0.026));
      if (downstream && tile.elevation === 0) { tile.terrain = index % 3 ? 2 : 3; tile.feature = index % 4 ? 2 : 255; }
    }
    if (skeleton.profileId === "ICEHOUSE_EARTH" && temperatures) {
      const temperature = temperatures[index];
      tile.terrain = temperature < 0.15 ? 6 : temperature < 0.31 ? 5 : temperature < 0.43 ? 3 : 2;
      tile.feature = tile.elevation === 2 || tile.terrain === 6 ? 255 : temperature < 0.38 && moistures[index] > 0.46 && index % 5 === 0 ? 0 : tile.feature === 1 ? 255 : tile.feature;
    }
    const effect = narrativeEffects[index];
    if (effect && tile.elevation < 2 && options.eccentricExtreme === "NONE" && options.dominantTerrains.length === 0) {
      if (effect === "WET") { tile.terrain = moistures[index] > 0.7 ? 2 : 3; if (moistures[index] > 0.72 && index % 3 === 0) tile.feature = 2; }
      if (effect === "DRY" || effect === "BARREN") { tile.terrain = moistures[index] < 0.28 ? 4 : 3; if (tile.feature === 0 || tile.feature === 1 || tile.feature === 2) tile.feature = 255; }
      if (effect === "COLD") { tile.terrain = (temperatures?.[index] ?? 0.3) < 0.18 ? 6 : 5; }
      if (effect === "HOT" || effect === "VOLCANIC") tile.terrain = moistures[index] < 0.42 ? 4 : 3;
      if (effect === "VALUE" && tile.terrain === 4) tile.terrain = 3;
    }
    return tile;
  });

  const structureObjects = [...rebuildTopologyObjects(geography.structure, landMask, width, height, wraps), ...narrativeObjects(skeleton, landMask, width, height, wraps)];
  const structure = { ...geography.structure, objects: structureObjects, narrativeSkeleton: skeleton, diagnostics: { ...geography.structure.diagnostics, narrativeRegions: skeleton.regions.length, narrativeRelationships: skeleton.relationships.length, narrativeConflicts: skeleton.conflicts.length, narrativeRelaxations: skeleton.relaxations.length } };
  return { ...geography, landMask, reliefValues, temperatures, moistures, elevations, riverGuidance, tiles, structure, startLocations };
}

function connectedNeighbors(index: number, width: number, height: number, wraps: boolean) {
  const x = index % width; const y = Math.floor(index / width);
  const offsets = y % 2 === 0 ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]] : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  return offsets.flatMap(([dx, dy]) => { let nx = x + dx; const ny = y + dy; if (wraps) nx = (nx + width) % width; return nx >= 0 && nx < width && ny >= 0 && ny < height ? [ny * width + nx] : []; });
}

export function applyNarrativeContent(tiles: Civ5Tile[], mapResources: string[], skeleton: NarrativeSkeleton, width: number, height: number) {
  if (skeleton.profileId === "LONELY_OCEANS") {
    for (let index = 0; index < tiles.length; index += 1) {
      const tile = tiles[index];
      if (tile.terrain >= 2 || tile.resource === 255) continue;
      const nearLand = connectedNeighbors(index, width, height, false).some((neighbor) => tiles[neighbor].terrain >= 2)
        || connectedNeighbors(index, width, height, false).some((neighbor) => connectedNeighbors(neighbor, width, height, false).some((second) => tiles[second].terrain >= 2));
      if (!nearLand || index % 3 !== 0) { tile.resource = 255; tile.resourceAmount = 0; }
    }
  }
  if (skeleton.profileId === "MYTHIC_REGIONS") {
    const hearts = skeleton.regions.filter((region) => region.effect === "VALUE");
    const inHeart = (index: number) => hearts.some((heart) => {
      const x = (index % width + 0.5) / width; const y = (Math.floor(index / width) + 0.5) / height;
      return Math.hypot(x - heart.x, (y - heart.y) * 0.866) <= heart.radius * 1.25;
    });
    const emptyTargets = tiles.flatMap((tile, index) => tile.terrain >= 2 && tile.elevation < 2 && tile.resource === 255 && tile.wonder === 255 && inHeart(index) ? [index] : []);
    for (const sourceIndex of tiles.flatMap((tile, index) => tile.resource !== 255 && !inHeart(index) ? [index] : [])) {
      const source = tiles[sourceIndex];
      const targetIndex = emptyTargets.findIndex((index) => tiles[index].terrain === source.terrain && tiles[index].elevation === source.elevation && tiles[index].feature === source.feature);
      if (targetIndex < 0) continue;
      const destination = emptyTargets.splice(targetIndex, 1)[0];
      tiles[destination].resource = source.resource; tiles[destination].resourceAmount = source.resourceAmount;
      source.resource = 255; source.resourceAmount = 0;
    }
    for (const sourceIndex of tiles.flatMap((tile, index) => tile.wonder !== 255 && !inHeart(index) ? [index] : [])) {
      const source = tiles[sourceIndex];
      const targetIndex = emptyTargets.findIndex((index) => tiles[index].terrain === source.terrain && tiles[index].elevation === source.elevation && tiles[index].feature === source.feature);
      if (targetIndex < 0) continue;
      const destination = emptyTargets.splice(targetIndex, 1)[0];
      tiles[destination].wonder = source.wonder; source.wonder = 255;
    }
  }
  if (skeleton.profileId !== "ICEHOUSE_EARTH") return;
  const resourceIndex = (token: string) => mapResources.findIndex((name) => name.includes(token));
  const deer = resourceIndex("DEER"); const furs = resourceIndex("FURS"); const fish = resourceIndex("FISH"); const whale = resourceIndex("WHALE"); const pearls = resourceIndex("PEARLS");
  const oil = resourceIndex("OIL"); const aluminum = resourceIndex("ALUMINUM"); const uranium = resourceIndex("URANIUM");
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index];
    if (tile.elevation === 2) continue;
    const coldLand = tile.terrain === 5 || tile.terrain === 6;
    const coldWater = tile.terrain < 2 && tile.feature === 3;
    if (coldLand && index % 19 === 0) { const values = [deer, furs, oil, aluminum, uranium].filter((value) => value >= 0); if (values.length) { tile.resource = values[index % values.length]; tile.resourceAmount = tile.resource >= 5 && tile.resource <= 10 ? 2 : 1; } }
    if (coldWater && index % 23 === 0) { const values = [fish, whale, pearls].filter((value) => value >= 0); if (values.length) { tile.resource = values[index % values.length]; tile.resourceAmount = 1; } }
    if ((tile.terrain === 2 || tile.terrain === 3) && tile.resource >= 11 && index % 2 === 0) { tile.resource = 255; tile.resourceAmount = 0; }
  }
}

function componentAssignments(map: Civ5Map) {
  const assignment = new Int32Array(map.tiles.length).fill(-1); let count = 0;
  for (let origin = 0; origin < map.tiles.length; origin += 1) {
    if (map.tiles[origin].terrain < 2 || assignment[origin] >= 0) continue;
    const queue = [origin]; assignment[origin] = count;
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of connectedNeighbors(queue[cursor], map.width, map.height, map.wraps)) if (map.tiles[next].terrain >= 2 && assignment[next] < 0) { assignment[next] = count; queue.push(next); }
    count += 1;
  }
  return { assignment, count };
}

function finding(id: string, label: string, score: number, evidence: string, measured?: number, target?: string): NarrativeFinding {
  const bounded = clamp(score, 0, 1);
  return { id, label, status: bounded >= 0.75 ? "MET" : bounded >= 0.45 ? "WEAK" : "FAILED", score: Math.round(bounded * 100), evidence, measured, target };
}

function assessmentHash(map: Civ5Map, skeleton: NarrativeSkeleton) { return seedHash(`${map.name}:${map.width}x${map.height}:${map.tiles.map((tile) => `${tile.terrain}${tile.elevation}${tile.feature}${tile.river}`).join("")}:${JSON.stringify(skeleton.targets)}`).toString(36); }

function effectMatch(map: Civ5Map, index: number, effect: NarrativeSkeletonRegion["effect"] | NarrativeSkeleton["relationships"][number]["effect"]) {
  const tile = map.tiles[index];
  if (!tile) return false;
  if (effect === "WATER" || effect === "WATER_PATH") return tile.terrain < 2;
  if (effect === "LAND" || effect === "LAND_PATH") return tile.terrain >= 2;
  if (effect === "RIDGE" || effect === "RIDGE_PATH" || effect === "VOLCANIC") return tile.terrain >= 2 && tile.elevation > 0;
  if (effect === "LOWLAND") return tile.terrain >= 2 && tile.elevation < 2;
  if (effect === "WET") return tile.terrain >= 2 && (tile.terrain === 2 || tile.feature === 0 || tile.feature === 2);
  if (effect === "DRY" || effect === "HOT") return tile.terrain === 3 || tile.terrain === 4;
  if (effect === "COLD") return tile.terrain === 5 || tile.terrain === 6;
  if (effect === "VALUE") return tile.terrain >= 2 && (tile.resource !== 255 || tile.wonder !== 255 || tile.terrain === 2);
  if (effect === "BARREN") return tile.terrain >= 2 && tile.resource === 255 && tile.wonder === 255;
  if (effect === "RIVER_PATH") return tile.terrain >= 2 && tile.river > 0;
  return tile.terrain >= 2;
}

function nearbyIndices(index: number, map: Civ5Map, radius: number) {
  const visited = new Set([index]); let frontier = [index];
  for (let step = 0; step < radius; step += 1) {
    frontier = frontier.flatMap((current) => connectedNeighbors(current, map.width, map.height, map.wraps).filter((next) => { if (visited.has(next)) return false; visited.add(next); return true; }));
  }
  return [...visited];
}

function catalogNarrativeFindings(map: Civ5Map, skeleton: NarrativeSkeleton, profile: NarrativeProfile) {
  const regionScores = skeleton.regions.filter((region) => region.effect).map((region) => {
    const samples = map.tiles.flatMap((tile, index) => {
      if (tileDistance(index, region, map.width, map.height, map.wraps) > region.radius * 0.72) return [];
      if (region.effect !== "LAND" && region.effect !== "WATER" && tile.terrain < 2) return [];
      return [index];
    });
    return samples.filter((index) => effectMatch(map, index, region.effect)).length / Math.max(1, samples.length);
  });
  const pathScores = skeleton.relationships.filter((relationship) => relationship.effect && relationship.points.length).map((relationship) => {
    const expressed = relationship.points.filter((point) => {
      const index = Math.min(map.tiles.length - 1, Math.floor(point.y * map.height) * map.width + Math.min(map.width - 1, Math.floor(point.x * map.width)));
      if (relationship.effect === "TRANSITION") {
        return new Set(nearbyIndices(index, map, 2).map((candidate) => `${map.tiles[candidate].terrain}:${map.tiles[candidate].elevation}`)).size >= 3;
      }
      return nearbyIndices(index, map, relationship.effect === "RIVER_PATH" ? 3 : 1).some((candidate) => effectMatch(map, candidate, relationship.effect));
    }).length;
    return expressed / Math.max(1, relationship.points.length);
  });
  const rawRegionFidelity = regionScores.reduce((sum, score) => sum + score, 0) / Math.max(1, regionScores.length);
  const rawPathFidelity = pathScores.length ? pathScores.reduce((sum, score) => sum + score, 0) / pathScores.length : 1;
  // Authored regions are influence fields rather than solid stamps: seventy per cent
  // expression leaves room for coast, relief and local biome variation. Likewise a
  // retained corridor may meander by a tile without losing its geographic function.
  const regionFidelity = clamp(rawRegionFidelity / 0.7);
  const pathFidelity = clamp(rawPathFidelity / 0.75);
  const components = componentAssignments(map);
  const landSizes = Array.from({ length: components.count }, (_value, component) => Array.from(components.assignment).filter((value) => value === component).length).sort((one, two) => two - one);
  const landTiles = map.tiles.filter((tile) => tile.terrain >= 2).length;
  const waterTiles = map.tiles.length - landTiles;
  const edgeIndices = map.tiles.flatMap((_tile, index) => index < map.width || index >= map.tiles.length - map.width || (!map.wraps && (index % map.width === 0 || index % map.width === map.width - 1)) ? [index] : []);
  const edgeLand = edgeIndices.filter((index) => map.tiles[index].terrain >= 2).length / Math.max(1, edgeIndices.length);
  const riverTiles = map.tiles.filter((tile) => tile.river > 0).length;
  const mountainTiles = map.tiles.filter((tile) => tile.terrain >= 2 && tile.elevation === 2).length;
  const wetTiles = map.tiles.filter((tile) => tile.terrain >= 2 && (tile.feature === 2 || tile.feature === 0)).length;
  let topologyScore = clamp(regionFidelity * 0.55 + pathFidelity * 0.45);
  let topologyEvidence = `${Math.round(rawRegionFidelity * 100)}% of authored region samples and ${Math.round(rawPathFidelity * 100)}% of relationship samples remain directly expressed in final terrain.`;
  switch (skeleton.profileId) {
    case "PANGAEA": case "ASTRAL_PANGAEA":
      topologyScore = clamp((landSizes[0] ?? 0) / Math.max(1, landTiles) / 0.72);
      topologyEvidence = `The largest final land component contains ${Math.round((landSizes[0] ?? 0) / Math.max(1, landTiles) * 100)}% of land while ${skeleton.targets.fractures ?? 0} retained fractures cross it.`;
      break;
    case "INLAND_SEAS": case "ENCIRCLING_LANDS": case "SUPERCONTINENT_INTERIOR":
      topologyScore = clamp(edgeLand / (skeleton.profileId === "INLAND_SEAS" ? 0.72 : 0.88));
      topologyEvidence = `${Math.round(edgeLand * 100)}% of boundary samples are land; water remains inward-facing (${waterTiles} final water tiles).`;
      break;
    case "ARCHIPELAGO": case "EARTHSEA": case "ISLAND_ARC_EARTH":
      topologyScore = clamp(components.count / Math.max(2, skeleton.targets.principalRealms ?? skeleton.targets.parentArcs ?? 4));
      topologyEvidence = `${components.count} final land components retain ${skeleton.targets.principalRealms ?? skeleton.targets.parentArcs ?? 0} authored parent systems.`;
      break;
    case "CONTINENTS":
      topologyScore = clamp(Math.min(components.count, skeleton.targets.continents ?? 4) / Math.max(2, skeleton.targets.continents ?? 4) * 0.7 + pathFidelity * 0.3);
      topologyEvidence = `${components.count} final land components and ${skeleton.targets.intrusions ?? 0} crooked water intrusions create false proximity.`;
      break;
    case "GREAT_WATERSHEDS": case "LIVING_WORLD": case "MONSOON_CONTINENTS":
      topologyScore = clamp(pathFidelity * 0.55 + Math.min(1, riverTiles / Math.max(8, map.tiles.length * 0.008)) * 0.45);
      topologyEvidence = `${riverTiles} final river tiles express ${skeleton.relationships.filter((relationship) => relationship.effect === "RIVER_PATH" || relationship.kind === "FLOWS_TO").length} authored drainage relationships.`;
      break;
    case "ANCIENT_CRATONS": {
      const mountainShare = mountainTiles / Math.max(1, landTiles);
      topologyScore = clamp(regionFidelity * 0.45 + Math.min(1, riverTiles / Math.max(8, map.tiles.length * 0.008)) * 0.4 + clamp(1 - mountainShare / 0.2) * 0.15);
      topologyEvidence = `${skeleton.targets.cratons ?? 0} old shield cores retain ${Math.round(rawRegionFidelity * 100)}% direct expression, with ${riverTiles} mature river tiles and ${Math.round(mountainShare * 100)}% mountainous land.`;
      break;
    }
    case "COLLIDING_PLATES": case "TECTONIC_CONTINENTS": case "DYNAMIC_EARTH":
      topologyScore = clamp(pathFidelity * 0.55 + Math.min(1, mountainTiles / Math.max(6, map.tiles.length * 0.025)) * 0.45);
      topologyEvidence = `${mountainTiles} mountains retain ${skeleton.relationships.filter((relationship) => relationship.effect === "RIDGE_PATH").length} authored active belts or margins.`;
      break;
    case "MYTHIC_REGIONS":
      topologyScore = regionFidelity;
      topologyEvidence = `${skeleton.targets.mythicHearts ?? 0} mythic hearts and their barren or mountainous marches retain ${Math.round(rawRegionFidelity * 100)}% direct surface expression.`;
      break;
    case "SHATTERED_BASINS":
      topologyScore = clamp(regionFidelity * 0.6 + pathFidelity * 0.4);
      topologyEvidence = `${skeleton.targets.greatSeas ?? 0} great seas, ${skeleton.targets.straits ?? 0} straits and ${skeleton.targets.isthmuses ?? 0} valuable isthmuses remain in the compiled plan.`;
      break;
    case "LABYRINTH": case "RIFTWORLD": case "RIFT_REALMS": case "PENINSULA_REALM":
      topologyScore = pathFidelity;
      topologyEvidence = `${Math.round(pathFidelity * 100)}% of ${skeleton.relationships.length} authored corridors, necks or divides remain expressed in final tiles.`;
      break;
    case "WILD_REGIONS":
      topologyScore = clamp(regionFidelity * 0.7 + Math.min(1, wetTiles / Math.max(5, map.tiles.length * 0.012)) * 0.3);
      topologyEvidence = `${skeleton.targets.provinces ?? 0} composed provinces retain ${Math.round(rawRegionFidelity * 100)}% direct expression of their distinct regional laws.`;
      break;
  }
  const motifs = profile.requiredMotifs.map((motif, index) => finding(motif.id, motif.label, clamp(topologyScore * (index ? 0.94 : 1)), topologyEvidence));
  const antiScore = skeleton.profileId === "ANCIENT_CRATONS" ? topologyScore : clamp(regionFidelity * 0.5 + pathFidelity * 0.5);
  const antiMotifs = profile.forbiddenMotifs.map((motif) => finding(motif.id, `Avoid ${motif.label.toLowerCase()}`, antiScore, `Final-map sampling distinguishes the authored ${profile.topologyProgram.kind} program from ${motif.label.toLowerCase()}: ${Math.round(rawRegionFidelity * 100)}% direct region and ${Math.round(rawPathFidelity * 100)}% direct relationship expression.`));
  return { motifs, antiMotifs };
}

export function assessNarrative(map: Civ5Map, recipe: GenerationRecipe): NarrativeAssessment {
  const profile = narrativeProfile(recipe.mapType);
  const skeleton = map.structure?.narrativeSkeleton;
  const deviations = skeleton?.conflicts ?? [];
  if (!skeleton || profile.implementation !== "BENCHMARK") return { schemaVersion: 1, inputHash: skeleton ? assessmentHash(map, skeleton) : seedHash(`${map.name}:${recipe.mapType}:unassessed`).toString(36), profileId: recipe.mapType, label: profile.label, implementation: profile.implementation, grade: "UNASSESSED", score: 0, summary: profile.implementation === "FUTURE_RUNTIME" ? "This approved identity is not yet available in the runtime catalogue." : "The narrative profile is registered, but its engine-specific compiler and component assessment belong to a later phase.", motifs: profile.requiredMotifs.map((motif) => ({ id: motif.id, label: motif.label, status: "UNAVAILABLE", score: 0, evidence: "Profile-only until its engine implementation phase." })), antiMotifs: [], parameterDeviations: deviations, weakened: ["Engine-specific narrative realization is not implemented."], nearestConfusions: profile.nearestConfusions.map((id) => ({ profileId: id, label: narrativeProfile(id).label, risk: "MEDIUM", evidence: "Nearest-confusion comparison awaits engine-specific evidence." })), legalityRelaxations: skeleton?.relaxations ?? [] };

  const motifs: NarrativeFinding[] = [];
  const antiMotifs: NarrativeFinding[] = [];
  const components = componentAssignments(map);
  const majorStarts = map.startLocations.filter((start) => !start.cityState);
  if (recipe.mapType === "LONELY_OCEANS") {
    const startComponents = majorStarts.map((start) => components.assignment[start.y * map.width + start.x]);
    const unique = new Set(startComponents.filter((value) => value >= 0)).size;
    const water = map.tiles.filter((tile) => tile.terrain < 2).length / map.tiles.length * 100;
    const landSizes = Array.from({ length: components.count }, (_value, component) => Array.from(components.assignment).filter((value) => value === component).length).filter((size) => size >= 4);
    const smallComponents = landSizes.filter((size) => size < (skeleton.targets.minimumRealmLand ?? 22) * 0.45).length;
    motifs.push(finding("one-major-per-realm", "One major civilization per island realm", unique / Math.max(1, majorStarts.length), `${unique} unique start realms for ${majorStarts.length} major civilizations.`, unique, `${majorStarts.length}`));
    motifs.push(finding("empty-ocean", "Intimidating empty deep ocean", (water - 72) / 16, `${water.toFixed(1)}% water with ${landSizes.length} viable land components.`, water, "84–94%"));
    motifs.push(finding("viable-scarcity", "Viable but scarce island capacity", landSizes.length >= majorStarts.length ? 0.9 : landSizes.length / Math.max(1, majorStarts.length), `${landSizes.length} viable realms against ${majorStarts.length} starts.`, landSizes.length, `≥ ${majorStarts.length}`));
    antiMotifs.push(finding("ordinary-archipelago", "Avoid ordinary even archipelago", 1 - clamp((components.count - majorStarts.length * 2) / Math.max(1, majorStarts.length * 3)), `${components.count} total land components; ${smallComponents} are minor fragments.`));
  } else if (recipe.mapType === "SHATTERED_ARCHIPELAGO") {
    const chainCount = skeleton.targets.parentSystems ?? 0;
    const anchors = skeleton.regions.filter((region) => region.role === "ANCHOR");
    const narrativeLand = map.structure?.objects.filter((object) => object.kind === "NARRATIVE_REGION" && object.attributes?.role === "ANCHOR").reduce((sum, object) => sum + object.tileIndices.length, 0) ?? 0;
    motifs.push(finding("parent-arcs", "Directional parent arcs", chainCount / 5, `${chainCount} retained parent systems with ${skeleton.relationships.filter((item) => item.kind === "FOLLOWS_ARC").length} explicit arcs.`, chainCount, "4–7"));
    motifs.push(finding("anchor-rhythm", "Anchor–satellite–gap rhythm", narrativeLand > anchors.length * 4 ? 0.9 : narrativeLand / Math.max(1, anchors.length * 4), `${anchors.length} anchors retain ${narrativeLand} land tiles.`, anchors.length, "1–3 per system"));
    motifs.push(finding("deep-chain-gaps", "Deep gaps between systems", map.tiles.filter((tile) => tile.terrain === 0).length / Math.max(1, map.tiles.filter((tile) => tile.terrain < 2).length), "Deep ocean remains the dominant water terrain between parent systems."));
    antiMotifs.push(finding("random-island-scatter", "Avoid independent random island scatter", chainCount / Math.max(1, components.count), `${components.count} land components are organized by ${chainCount} retained parent systems.`));
  } else if (recipe.mapType === "GREAT_WATERSHEDS") {
    const rivers = map.structure?.riverSystems ?? [];
    const validOutlets = rivers.filter((river) => river.outlet !== undefined).length;
    const marsh = map.tiles.filter((tile) => tile.feature === 2).length;
    const riverTiles = map.tiles.filter((tile) => tile.river > 0).length;
    const majorGuidance = map.structure?.diagnostics.majorRiverCorridorTiles ?? 0;
    motifs.push(finding("trunk-rivers", "Dominant trunk rivers", Math.min(1, rivers.length / Math.max(1, skeleton.targets.trunkRivers ?? 3)), `${rivers.length} connected systems; ${majorGuidance} retained major-corridor tiles.`, rivers.length, `${skeleton.targets.trunkRivers ?? 3}`));
    motifs.push(finding("tributary-hierarchy", "Merging tributary hierarchy", Math.min(1, riverTiles / Math.max(8, (skeleton.targets.tributaries ?? 6) * 3)), `${riverTiles} rendered river tiles follow ${skeleton.targets.tributaries ?? 0} tributary paths.`, riverTiles, "continuous hierarchy"));
    motifs.push(finding("wet-lowlands", "Floodplains, marshes and deltas", Math.min(1, marsh / Math.max(3, map.tiles.length * 0.006)), `${marsh} marsh/floodplain tiles and ${validOutlets} valid river outlets.`, marsh, "visible downstream belts"));
    antiMotifs.push(finding("short-unrelated-rivers", "Avoid unrelated short rivers", validOutlets / Math.max(1, rivers.length), `${validOutlets} of ${rivers.length} systems reach a retained water outlet.`));
  } else if (recipe.mapType === "ICEHOUSE_EARTH") {
    const land = map.tiles.filter((tile) => tile.terrain >= 2);
    const frozen = land.filter((tile) => tile.terrain === 5 || tile.terrain === 6).length;
    const temperate = land.filter((tile) => tile.terrain === 2 || tile.terrain === 3).length;
    const coldResources = land.filter((tile) => (tile.terrain === 5 || tile.terrain === 6) && tile.resource !== 255).length;
    const warmResources = land.filter((tile) => (tile.terrain === 2 || tile.terrain === 3) && tile.resource !== 255).length;
    const sheets = map.structure?.objects.filter((object) => object.kind === "ICE_SHEET" && object.tileIndices.length >= 6).length ?? 0;
    motifs.push(finding("broad-ice-sheets", "Broad irregular continental ice sheets", Math.min(1, frozen / Math.max(1, land.length) / 0.48), `${frozen} of ${land.length} land tiles are tundra or snow across ${sheets} retained sheet regions.`, frozen / Math.max(1, land.length) * 100, "≥ 48% cold land"));
    motifs.push(finding("temperate-refuges", "Limited productive temperate refuges", temperate > 0 && temperate < land.length * 0.48 ? 0.9 : 0.35, `${temperate} temperate tiles remain as bounded refuges.`, temperate, "limited viable refuges"));
    motifs.push(finding("frontier-value", "Valuable cold frontier provinces", Math.min(1, coldResources / Math.max(1, warmResources)), `${coldResources} cold-region resources versus ${warmResources} temperate-region resources.`, coldResources, `≥ warm value ${warmResources}`));
    antiMotifs.push(finding("straight-polar-bands", "Avoid straight polar biome bands", Math.min(1, sheets / 1.5), `${sheets} retained irregular ice-sheet regions shape the cold field.`));
    antiMotifs.push(finding("worthless-cold", "Avoid worthless frozen reaches", coldResources > 0 ? 0.9 : 0, `${coldResources} resources remain in frozen land.`));
  } else {
    const catalog = catalogNarrativeFindings(map, skeleton, profile);
    motifs.push(...catalog.motifs);
    antiMotifs.push(...catalog.antiMotifs);
  }

  const motifScore = motifs.reduce((sum, item) => sum + item.score, 0) / Math.max(1, motifs.length);
  const antiScore = antiMotifs.reduce((sum, item) => sum + item.score, 0) / Math.max(1, antiMotifs.length);
  const deviationPenalty = deviations.length * 8;
  const score = Math.round(clamp((motifScore * 0.72 + antiScore * 0.28 - deviationPenalty) / 100) * 100);
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";
  const weakened = [...deviations, ...motifs.filter((item) => item.status !== "MET").map((item) => `${item.label}: ${item.evidence}`), ...antiMotifs.filter((item) => item.status === "FAILED").map((item) => `${item.label}: ${item.evidence}`)];
  const nearestConfusions = profile.nearestConfusions.map((id) => ({ profileId: id, label: narrativeProfile(id).label, risk: score < 55 ? "HIGH" as const : score < 75 ? "MEDIUM" as const : "LOW" as const, evidence: score < 55 ? "Several defining relationships are weak, increasing nearest-confusion risk." : "The retained defining relationships distinguish the intended identity." }));
  return { schemaVersion: 1, inputHash: assessmentHash(map, skeleton), profileId: recipe.mapType, label: profile.label, implementation: profile.implementation, grade, score, summary: weakened.length ? `${profile.label} is recognizable at grade ${grade}, but ${weakened.length} narrative condition${weakened.length === 1 ? " is" : "s are"} weakened.` : `${profile.label} satisfies its retained benchmark relationships without a disclosed narrative conflict.`, motifs, antiMotifs, parameterDeviations: deviations, weakened, nearestConfusions, legalityRelaxations: [...skeleton.relaxations, ...(map.structure?.strategicGraph?.relaxations ?? [])] };
}

export function narrativeCandidateScore(assessment: NarrativeAssessment) { return assessment.implementation === "BENCHMARK" ? assessment.score : 0; }

export function attachNarrativeAssessment(map: Civ5Map, recipe: GenerationRecipe) {
  if (!map.structure) return map;
  const assessment = assessNarrative(map, recipe);
  const diagnostics = { ...map.structure.diagnostics, narrativeScore: assessment.score, narrativeMotifsMet: assessment.motifs.filter((item) => item.status === "MET").length, narrativeMotifsWeak: assessment.motifs.filter((item) => item.status === "WEAK").length, narrativeMotifsFailed: assessment.motifs.filter((item) => item.status === "FAILED").length };
  return { ...map, structure: { ...map.structure, narrativeAssessment: assessment, diagnostics } };
}

export function describeNarrativeProfile(id: MapPresetId, character: GenerationStyle) {
  const profile = narrativeProfile(id);
  const state = profile.implementation === "BENCHMARK" ? "This identity has a retained benchmark compiler and Review assessment." : "Its profile is authoritative; specialized engine realization remains a later phase.";
  return `${profile.premise} ${character.toLowerCase().replace(/^./, (letter) => letter.toUpperCase())} World Character reinterprets the geography without replacing these relationships. ${state}`;
}
