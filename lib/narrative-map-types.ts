import type { Civ5Map, Civ5StartLocation, Civ5Tile } from "./civ5-map.ts";
import { resourcePlacementVerdict } from "./civ5-rules.ts";
import type { GenerationStructure, GeographicObject } from "./generation-structure.ts";
import type { GenerationRecipe, WorldScale } from "./generation-recipe.ts";
import type { GenerationStyle, MapGenerationOptions, MapPresetId } from "./map-generator.ts";
import type { NarrativeGenerativeContract } from "./narrative-native-contracts.ts";
import type { NarrativeAssessment, NarrativeFinding, NarrativeProfile, NarrativeProfileId, NarrativeSkeleton, NarrativeSkeletonRegion } from "./narrative-types.ts";

const ALL_SCALES: WorldScale[] = ["GLOBAL", "CONTINENTAL", "REGIONAL", "PROVINCIAL", "LOCAL"];
const COMPILED_IDENTITIES = new Set<MapPresetId>([
  "CONTINENTS", "PANGAEA", "ARCHIPELAGO", "INLAND_SEAS", "EARTHSEA", "RIFT_REALMS", "LABYRINTH", "WILD_REGIONS",
  "LIVING_WORLD", "TECTONIC_CONTINENTS", "GREAT_WATERSHEDS", "SHATTERED_BASINS", "MYTHIC_REGIONS", "ENCIRCLING_LANDS", "ASTRAL_PANGAEA", "RIFTWORLD", "LONELY_OCEANS", "PENINSULA_REALM", "SHATTERED_ARCHIPELAGO",
  "DYNAMIC_EARTH", "COLLIDING_PLATES", "ANCIENT_CRATONS", "ISLAND_ARC_EARTH", "SUPERCONTINENT_INTERIOR", "MONSOON_CONTINENTS", "ICEHOUSE_EARTH",
  "IMPERIAL_RING", "OPPOSING_FRONTS", "CONTESTED_HEARTLAND", "RIVAL_CONTINENTS", "THREE_REALMS", "THALASSIC_LEAGUE", "UNEQUAL_REALMS",
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
  SHATTERED_BASINS: { water: [68, 82], mountains: [3, 14], preferredWater: 74, preferredMountains: 8 },
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
  SUPERCONTINENT_INTERIOR: { water: [0, 42], mountains: [10, 26], preferredWater: 30, preferredMountains: 17, preferredRiverDensity: "DENSE" },
  MONSOON_CONTINENTS: { water: [42, 68], mountains: [10, 24], preferredWater: 57, preferredMountains: 15, preferredRiverDensity: "DENSE" },
  ICEHOUSE_EARTH: { water: [28, 54], mountains: [8, 25], preferredWater: 40, preferredMountains: 15 },
  IMPERIAL_RING: { water: [15, 45], mountains: [10, 26], preferredWater: 34, preferredMountains: 16 },
  OPPOSING_FRONTS: { water: [10, 42], mountains: [14, 32], preferredWater: 28, preferredMountains: 20 },
  CONTESTED_HEARTLAND: { water: [8, 38], mountains: [10, 28], preferredWater: 22, preferredMountains: 18 },
  RIVAL_CONTINENTS: { water: [42, 66], mountains: [8, 24], preferredWater: 54, preferredMountains: 14 },
  THREE_REALMS: { water: [18, 48], mountains: [10, 26], preferredWater: 32, preferredMountains: 16 },
  THALASSIC_LEAGUE: { water: [52, 75], mountains: [6, 22], preferredWater: 62, preferredMountains: 12 },
  UNEQUAL_REALMS: { water: [12, 55], mountains: [8, 30], preferredWater: 34, preferredMountains: 17 },
};

type ProfileSeed = Pick<NarrativeProfile, "id" | "label" | "engine" | "verb" | "premise" | "requiredMotifs" | "forbiddenMotifs" | "nearestConfusions" | "blindRecognition"> & Partial<Omit<NarrativeProfile, "schemaVersion" | "id" | "label" | "engine" | "verb" | "premise" | "requiredMotifs" | "forbiddenMotifs" | "nearestConfusions" | "blindRecognition">>;

function profile(seed: ProfileSeed): NarrativeProfile {
  const implementation = COMPILED_IDENTITIES.has(seed.id as MapPresetId) ? "BENCHMARK" : "PROFILE_ONLY";
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
  SHATTERED_BASINS: profile({ id: "SHATTERED_BASINS", label: "Inland Sea Crossroads", engine: "ECCENTRIC", verb: "Crowds", premise: "Colossal inland seas crowd scarce land to the margins and concentrate power in Bosporus-like straits and one-tile canal isthmuses.", requiredMotifs: [m("great-seas", "Two to four colossal inland seas"), m("strait-isthmus", "Dominant straits and canal isthmuses"), m("marginal-land", "Connected marginal shorelands")], forbiddenMotifs: [m("comfortable-continents", "Comfortable inland continents"), m("island-scatter", "Archipelago-like island scatter")], nearestConfusions: ["INLAND_SEAS", "LONELY_OCEANS"], blindRecognition: "Civilizations are compressed against the margins of colossal inland seas whose straits and canal sites organize the world." }),
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
  SUPERCONTINENT_INTERIOR: profile({ id: "SUPERCONTINENT_INTERIOR", label: "Inland Supercontinent", engine: "PHYSICAL", verb: "Desiccates", premise: "A dominant continental framework surrounds a great interior sea, inward drainage and broken peripheral highlands.", requiredMotifs: [m("landbound-heart", "Landbound interior sea"), m("inward-drainage", "Inward lakes and drainage")], forbiddenMotifs: [m("open-ocean-dominance", "Open-ocean dominance")], nearestConfusions: ["ANCIENT_CRATONS", "INLAND_SEAS"], blindRecognition: "An Australia-like continent encloses a valuable interior sea behind broken peripheral highlands." }),
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
  const minimumSpacing = 0.55 / Math.sqrt(Math.max(1, count));
  while (points.length < count) {
    let best = { x: random(), y: random() };
    let bestDistance = -1;
    let accepted: typeof best | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const candidate = { x: margin + random() * (1 - margin * 2), y: margin + random() * (1 - margin * 2) };
      const distance = Math.min(...points.map((point) => wrappedDistance(candidate, point, wraps)));
      if (distance > bestDistance) { best = candidate; bestDistance = distance; }
      // Accept a safe candidate stochastically instead of always choosing the
      // farthest point. This retains separation while avoiding equal token-like
      // spacing and repeated quadrant layouts.
      if (distance >= minimumSpacing * (0.86 + random() * 0.2) && random() < 0.3) { accepted = candidate; break; }
    }
    points.push(accepted ?? best);
  }
  return points;
}

function farthestPoints(count: number, random: () => number, wraps: boolean, margin = 0.08) {
  const points = [{ x: margin + random() * (1 - margin * 2), y: margin + random() * (1 - margin * 2) }];
  while (points.length < count) {
    let best = { x: random(), y: random() };
    let bestDistance = -1;
    for (let attempt = 0; attempt < 96; attempt += 1) {
      const candidate = { x: margin + random() * (1 - margin * 2), y: margin + random() * (1 - margin * 2) };
      const distance = Math.min(...points.map((point) => wrappedDistance(candidate, point, wraps)));
      if (distance > bestDistance) { best = candidate; bestDistance = distance; }
    }
    points.push(best);
  }
  return points;
}

function narrativePath(from: { x: number; y: number }, to: { x: number; y: number }, bend: number, steps = 9) {
  const phase = ((from.x * 31 + from.y * 47 + to.x * 59 + to.y * 71) % 1) * Math.PI * 2;
  return Array.from({ length: steps }, (_value, index) => {
    const t = index / (steps - 1);
    const envelope = Math.sin(t * Math.PI);
    const wave = envelope * bend * (1 + Math.sin(t * Math.PI * 2 + phase) * 0.24)
      + envelope * Math.sin(t * Math.PI * 3 + phase * 0.7) * Math.abs(bend) * 0.1;
    return { x: clamp(from.x * (1 - t) + to.x * t + wave * (to.y - from.y), 0.015, 0.985), y: clamp(from.y * (1 - t) + to.y * t - wave * (to.x - from.x), 0.015, 0.985) };
  });
}

function spanningPairs(points: readonly { x: number; y: number }[], random: () => number, wraps: boolean) {
  const parent = points.map((_point, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const candidates = points.flatMap((one, left) => points.slice(left + 1).map((two, offset) => ({
    left,
    right: left + offset + 1,
    score: wrappedDistance(one, two, wraps) + random() * 0.025,
  }))).sort((one, two) => one.score - two.score || one.left - two.left || one.right - two.right);
  const selected: Array<{ left: number; right: number }> = [];
  for (const edge of candidates) {
    const left = find(edge.left);
    const right = find(edge.right);
    if (left === right) continue;
    parent[left] = right;
    selected.push(edge);
    if (selected.length === points.length - 1) break;
  }
  return selected;
}

function compileCatalogSkeleton(
  id: MapPresetId,
  scale: WorldScale,
  random: () => number,
  wraps: boolean,
  players: number,
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
    const coreCount = scale === "LOCAL" ? 2 : scale === "PROVINCIAL" ? 3 : 3 + Math.floor(random() * 3);
    const cores = points(coreCount, 0.1).map((point) => add("CONTINENT_CORE", "LAND", point, 0.13 + random() * 0.05, 1.2));
    for (const core of cores) for (let lobe = 0, lobeCount = 2 + Math.floor(random() * 3); lobe < lobeCount; lobe += 1) {
      const angle = random() * Math.PI * 2;
      const child = add("CROOKED_LOBE", "LAND", { x: clamp(core.x + Math.cos(angle) * (0.1 + random() * 0.07), 0.04, 0.96), y: clamp(core.y + Math.sin(angle) * (0.08 + random() * 0.06), 0.04, 0.96) }, 0.065 + random() * 0.045, 0.85, core.id);
      link("CROOKED_INTERIOR", "LAND_PATH", core, child, (random() - 0.5) * 0.8, 0.9);
    }
    for (let index = 0; index < cores.length; index += 1) link("FJORD_INTRUSION", "WATER_PATH", cores[index], cores[(index + 1) % cores.length], (random() < 0.5 ? -1 : 1) * 0.55, 0.72);
    targets.continents = cores.length; targets.intrusions = cores.length;
  } else if (id === "PANGAEA" || id === "ASTRAL_PANGAEA") {
    const corePoint = { x: 0.43 + random() * 0.14, y: 0.45 + random() * 0.14 };
    const core = add("DOMINANT_CONTINENT", "LAND", corePoint, id === "PANGAEA" ? 0.28 + random() * 0.055 : 0.3 + random() * 0.05, 1.35);
    const lobes = Array.from({ length: scaleCount(id === "PANGAEA" ? 5 : 7, 3) }, (_v, index) => {
      const angle = index / scaleCount(id === "PANGAEA" ? 5 : 7, 3) * Math.PI * 2 + random() * 0.45;
      const lobe = add(id === "PANGAEA" ? "CONTINENT_LOBE" : "ASTRAL_LOBE", "LAND", { x: clamp(core.x + Math.cos(angle) * (0.19 + random() * 0.08), 0.04, 0.96), y: clamp(core.y + Math.sin(angle) * (0.15 + random() * 0.075), 0.05, 0.95) }, 0.1 + random() * 0.055, 1, core.id);
      link("CONTINENT_BOND", "LAND_PATH", core, lobe, (random() - 0.5) * 0.45, 1);
      return lobe;
    });
    const scars = id === "PANGAEA" ? 2 : 4;
    for (let index = 0; index < scars; index += 1) link(id === "PANGAEA" ? "CREDIBLE_FRACTURE" : "ALIEN_SCAR", index % 3 === 2 ? "RIDGE_PATH" : "WATER_PATH", lobes[index % lobes.length], lobes[(index + Math.floor(lobes.length / 2)) % lobes.length], id === "PANGAEA" ? (random() - 0.5) * 0.35 : (index % 2 ? -0.95 : 0.95), 1);
    targets.dominantContinents = 1; targets.fractures = scars;
  } else if (id === "ARCHIPELAGO" || id === "EARTHSEA") {
    const count = id === "EARTHSEA"
      ? scale === "LOCAL" ? Math.max(3, Math.min(players, 4)) : Math.max(4, Math.min(players, 8))
      : scale === "LOCAL" ? 3 : 4 + Math.floor(random() * 3);
    for (const [cluster, center] of points(count, 0.11).entries()) {
      const anchor = add(id === "ARCHIPELAGO" ? "DROWNED_SHELF" : "ISLAND_CONTINENT", "LAND", center, id === "ARCHIPELAGO" ? 0.065 + random() * 0.04 : clamp(0.15 * Math.sqrt(4 / count) * (0.86 + random() * 0.28), 0.09, 0.17), 1.25);
      const satellites = id === "ARCHIPELAGO" ? 2 + Math.floor(random() * 4) : 1 + Math.floor(random() * 3);
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
    const ringCenter = { x: 0.46 + random() * 0.08, y: 0.45 + random() * 0.1 };
    const rotation = random() * Math.PI * 2;
    for (let index = 0; index < ringCount; index += 1) {
      const angle = rotation + index / ringCount * Math.PI * 2 + (random() - 0.5) * 0.16;
      const radius = 0.84 + random() * 0.3;
      ring.push(add("ENCLOSING_LAND", "LAND", { x: clamp(ringCenter.x + Math.cos(angle) * 0.39 * radius, 0.03, 0.97), y: clamp(ringCenter.y + Math.sin(angle) * 0.36 * radius, 0.04, 0.96) }, (id === "ENCIRCLING_LANDS" ? 0.12 : 0.16) * (0.86 + random() * 0.28), 1.15));
    }
    for (let index = 0; index < ring.length; index += 1) link("OUTER_CIRCUIT", "LAND_PATH", ring[index], ring[(index + 1) % ring.length], 0.08, 1);
    const seas = points(scaleCount(id === "ENCIRCLING_LANDS" ? 4 : 6, 2), 0.28);
    seas.forEach((point, index) => add(index ? "INLAND_LAKE" : "INLAND_SEA", "WATER", point, index ? 0.07 : 0.14, index ? 0.7 : 1.2));
    targets.enclosedSeas = seas.length; targets.outerCircuit = ring.length;
  } else if (id === "RIFT_REALMS" || id === "RIFTWORLD") {
    const cells = farthestPoints(scaleCount(id === "RIFTWORLD" ? 8 : 5, 3), random, wraps, 0.1).map((point) => add("VIABLE_RIFT_CELL", "LAND", point, id === "RIFTWORLD" ? 0.12 : 0.18, 1));
    const rifts = id === "RIFTWORLD" ? Math.max(5, cells.length - 1) : Math.max(2, cells.length - 2);
    const parent = cells.map((_cell, index) => index);
    const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
    const candidates = cells.flatMap((one, left) => cells.slice(left + 1).map((two, offset) => {
      const right = left + offset + 1;
      return { left, right, distance: wrappedDistance(one, two, wraps) + random() * 0.08 };
    })).sort((one, two) => (id === "RIFTWORLD" ? one.distance - two.distance : two.distance - one.distance) || one.left - two.left || one.right - two.right);
    const selected: Array<{ left: number; right: number }> = [];
    for (const candidate of candidates) {
      if (selected.length >= rifts) break;
      const leftRoot = find(candidate.left);
      const rightRoot = find(candidate.right);
      if (id === "RIFTWORLD" && leftRoot === rightRoot) continue;
      selected.push(candidate);
      if (leftRoot !== rightRoot) parent[leftRoot] = rightRoot;
    }
    for (const candidate of candidates) {
      if (selected.length >= rifts) break;
      if (selected.some((edge) => edge.left === candidate.left && edge.right === candidate.right)) continue;
      selected.push(candidate);
    }
    selected.forEach((edge, index) => link(index < 2 ? "PRIMARY_RIFT" : "SECONDARY_RIFT", "WATER_PATH", cells[edge.left], cells[edge.right], (index % 2 ? -1 : 1) * (id === "RIFTWORLD" ? 0.62 + random() * 0.16 : 0.24 + random() * 0.12), index < 2 ? 1 : 0.72));
    targets.riftCells = cells.length; targets.deepRifts = rifts;
  } else if (id === "LABYRINTH") {
    const chambers = points(scaleCount(9, 5), 0.1).map((point) => add("MAZE_CHAMBER", "LAND", point, 0.09 + random() * 0.035, 1));
    const mazeTree = spanningPairs(chambers, random, wraps);
    mazeTree.forEach((edge, index) => link("WINDING_PASSAGE", "LAND_PATH", chambers[edge.left], chambers[edge.right], (index % 2 ? -1 : 1) * (0.75 + random() * 0.2), 1));
    for (let index = 0; index < chambers.length - 2; index += 2) link("BLIND_WATER_ALLEY", "WATER_PATH", chambers[index], chambers[index + 2], (index % 4 ? -1 : 1) * 0.85, 0.8);
    targets.chambers = chambers.length; targets.tortuousRoutes = chambers.length - 1;
  } else if (id === "WILD_REGIONS") {
    const effects: NarrativeSkeletonRegion["effect"][] = ["WET", "DRY", "HOT", "COLD", "RIDGE", "LOWLAND", "LAND", "BARREN"];
    const rawPoints = points(scaleCount(10, 5), 0.08);
    const orderedPoints = [rawPoints.reduce((best, point) => point.x < best.x || point.x === best.x && point.y < best.y ? point : best, rawPoints[0])];
    const remaining = new Set(rawPoints.filter((point) => point !== orderedPoints[0]));
    while (remaining.size) {
      const prior = orderedPoints.at(-1)!;
      const next = [...remaining].sort((one, two) => wrappedDistance(prior, one, wraps) - wrappedDistance(prior, two, wraps) || one.x - two.x || one.y - two.y)[0];
      orderedPoints.push(next);
      remaining.delete(next);
    }
    const provinces = orderedPoints.map((point, index) => add("PATCHWORK_PROVINCE", effects[index % effects.length], point, 0.1 + random() * 0.04, 1));
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
    // Dynamic Earth must retain three different physical histories even when
    // Provincial or Local scale reduces it to three process provinces.
    // VOLCANIC and RIDGE share the same uplift cause, so order the Dynamic
    // sequence around uplift, subsidence and circulation before repeating a
    // cause family.
    const effects: NarrativeSkeletonRegion["effect"][] = id === "DYNAMIC_EARTH"
      ? ["VOLCANIC", "LOWLAND", "DRY", "RIDGE", "WET"]
      : ["VOLCANIC", "RIDGE", "LOWLAND", "DRY", "WET"];
    const systems = points(count, 0.12).map((point, index) => add(id === "TECTONIC_CONTINENTS" ? "GEOLOGIC_HISTORY" : "PROCESS_PROVINCE", effects[index % effects.length], point, 0.17, 1));
    for (let index = 0; index < systems.length; index += 1) link(index % 2 ? "RIFT_MARGIN" : "ACTIVE_MARGIN", index % 2 ? "WATER_PATH" : "RIDGE_PATH", systems[index], systems[(index + 1) % systems.length], (index % 2 ? -1 : 1) * 0.38, 0.9);
    targets.processProvinces = systems.length; targets.activeMargins = systems.length;
  } else if (id === "SHATTERED_BASINS") {
    const seaCount = scale === "LOCAL" ? 2 : scale === "PROVINCIAL" ? 3 : 4;
    const seas = Array.from({ length: seaCount }, (_value, index) => {
      const t = index / (seaCount - 1);
      return add("GREAT_INLAND_SEA", "WATER", { x: 0.16 + t * 0.68 + (random() - 0.5) * 0.025, y: 0.5 + (index % 2 ? 0.055 : -0.055) + (random() - 0.5) * 0.025 }, seaCount === 2 ? 0.23 : 0.18, 1.35);
    });
    for (let index = 0; index < seas.length - 1; index += 1) {
      const midpoint = { x: (seas[index].x + seas[index + 1].x) / 2, y: (seas[index].y + seas[index + 1].y) / 2 };
      if (index % 2 === 0) link("NARROW_STRAIT", "WATER_PATH", seas[index], seas[index + 1], (index % 4 ? -1 : 1) * 0.08, 1);
      else {
        const isthmus = add("VALUABLE_ISTHMUS", "VALUE", midpoint, 0.026, 1.5);
        relationships.push({ id: `canal-isthmus-${index + 1}`, kind: "CANAL_ISTHMUS", effect: "LAND_PATH", from: seas[index].id, to: seas[index + 1].id, points: [{ x: isthmus.x, y: isthmus.y }], strength: 1 });
      }
    }
    targets.greatSeas = seas.length; targets.straits = Math.ceil((seas.length - 1) / 2); targets.isthmuses = Math.floor((seas.length - 1) / 2); targets.maximumIncidentalIslands = scale === "GLOBAL" ? 2 : 0;
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
    const centers = points(arcCount, 0.14);
    for (let arc = 0; arc < arcCount; arc += 1) {
      const seedCenter = centers[arc];
      // Each subduction segment owns a local strike. The previous global
      // west→east layout produced five parallel ribbon continents regardless
      // of seed; distributing axial angles over half a turn preserves distinct
      // systems without forcing one shared planetary bearing.
      const angle = arc / Math.max(1, arcCount) * Math.PI + (random() - 0.5) * 0.34;
      const halfLength = 0.145 + random() * 0.045;
      const marginX = 0.055 + Math.abs(Math.cos(angle)) * halfLength;
      const marginY = 0.065 + Math.abs(Math.sin(angle)) * halfLength;
      const center = {
        x: clamp(seedCenter.x, marginX, 1 - marginX),
        y: clamp(seedCenter.y, marginY, 1 - marginY),
      };
      const startPoint = {
        x: clamp(center.x - Math.cos(angle) * halfLength, 0.055, 0.945),
        y: clamp(center.y - Math.sin(angle) * halfLength, 0.065, 0.935),
      };
      const endPoint = {
        x: clamp(center.x + Math.cos(angle) * halfLength, 0.055, 0.945),
        y: clamp(center.y + Math.sin(angle) * halfLength, 0.065, 0.935),
      };
      const start = add("VOLCANIC_ARC_ANCHOR", "VOLCANIC", startPoint, 0.065, 1.2);
      const end = add("VOLCANIC_ARC_ANCHOR", "VOLCANIC", endPoint, 0.07, 1.2);
      const polarity = random() < 0.5 ? -1 : 1;
      const curvature = 0.38 + random() * 0.16;
      link("VOLCANIC_PARENT_ARC", "RIDGE_PATH", start, end, polarity * curvature, 1);
      link("ARC_SHELF", "LAND_PATH", start, end, polarity * (curvature - 0.09), 0.78);
      link("SHELTERED_ARC_SEA", "WATER_PATH", start, end, polarity * (curvature - 0.22), 0.62);
    }
    targets.parentArcs = arcCount; targets.volcanicAnchors = arcCount * 2;
  } else if (id === "SUPERCONTINENT_INTERIOR") {
    const basinCenter = { x: 0.44 + random() * 0.12, y: 0.44 + random() * 0.13 };
    const heart = add("INTERIOR_SEA", "WATER", basinCenter, 0.16 + random() * 0.055, 1.45);
    add("INTERIOR_BASIN_MARGIN", "LOWLAND", basinCenter, 0.27 + random() * 0.055, 0.72, heart.id);
    const ring: NarrativeSkeletonRegion[] = [];
    const count = scaleCount(12, 7);
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2 + (random() - 0.5) * 0.14;
      const radius = 0.88 + random() * 0.26;
      ring.push(add("PERIPHERAL_HIGHLAND", "RIDGE", { x: clamp(basinCenter.x + Math.cos(angle) * 0.34 * radius, 0.04, 0.96), y: clamp(basinCenter.y + Math.sin(angle) * 0.32 * radius, 0.05, 0.95) }, 0.085 + random() * 0.035, 1));
      link("INWARD_DRAINAGE", "RIVER_PATH", ring.at(-1)!, heart, (index % 2 ? -1 : 1) * 0.2, 0.8);
    }
    for (let index = 0; index < ring.length; index += 1) {
      if (index % 4 !== 1) link("BROKEN_HIGHLAND_ARC", "RIDGE_PATH", ring[index], ring[(index + 1) % ring.length], 0.05, 0.85);
      else link("HIGHLAND_PASS", "LAND_PATH", ring[index], ring[(index + 1) % ring.length], -0.08, 0.7);
    }
    targets.edgeOcean = 0; targets.interiorBasins = 1; targets.highlandCoveragePercent = 67;
  } else if (["IMPERIAL_RING", "OPPOSING_FRONTS", "CONTESTED_HEARTLAND", "RIVAL_CONTINENTS", "THREE_REALMS", "THALASSIC_LEAGUE", "UNEQUAL_REALMS"].includes(id)) {
    const requestedPlayers = Math.max(2, Math.min(22, Math.round(players)));
    const boardCenter = { x: 0.46 + random() * 0.08, y: 0.45 + random() * 0.1 };
    const boardRotation = random() * Math.PI * 2;
    const ringPoints = (count: number, radiusX = 0.34, radiusY = 0.32) => Array.from({ length: count }, (_value, index) => {
      const angle = boardRotation + index / count * Math.PI * 2 + (random() - 0.5) * 0.18;
      const radial = 0.82 + random() * 0.34;
      return { x: clamp(boardCenter.x + Math.cos(angle) * radiusX * radial, 0.04, 0.96), y: clamp(boardCenter.y + Math.sin(angle) * radiusY * radial, 0.05, 0.95) };
    });
    let realms: NarrativeSkeletonRegion[] = [];
    if (id === "IMPERIAL_RING") {
      const seatCount = Math.max(4, requestedPlayers);
      realms = ringPoints(seatCount).map((point, index) => add(`RING_SEAT_${index + 1}`, "LAND", point, 0.14, 1.1));
      for (let index = 0; index < realms.length; index += 1) link("LATERAL_RING", "LAND_PATH", realms[index], realms[(index + 1) % realms.length], index % 2 ? 0.16 : -0.16, 0.9);
      const axle = add("SHARED_OBJECTIVE", "VALUE", { x: 0.5, y: 0.5 }, 0.1, 1.5);
      add("SHARED_OBJECTIVE", "VALUE", { x: 0.5, y: 0.36 }, 0.075, 1.25);
      for (let player = 0; player < requestedPlayers; player += 1) {
        const seat = Math.min(realms.length - 1, Math.floor(player * realms.length / requestedPlayers));
        link("PRIMARY_AXLE_APPROACH", "LAND_PATH", realms[seat], axle, player % 2 ? 0.2 : -0.2, 1);
        link("SECONDARY_AXLE_APPROACH", "LAND_PATH", realms[seat], axle, player % 2 ? -0.32 : 0.32, 0.88);
      }
    } else if (id === "CONTESTED_HEARTLAND") {
      realms = ringPoints(requestedPlayers).map((point, index) => add(`MAJOR_HOME_${index + 1}`, "LAND", point, 0.14, 1.1));
      const districtCount = Math.max(3, Math.min(6, Math.ceil(requestedPlayers / 2) + 1));
      const districts = ringPoints(districtCount, 0.1, 0.085).map((point, index) => add(`HEARTLAND_DISTRICT_${index + 1}`, "VALUE", point, 0.07, 1.45));
      for (let index = 0; index < realms.length; index += 1) {
        link("MANY_APPROACHES", "LAND_PATH", realms[index], districts[index % districts.length], index % 2 ? 0.2 : -0.2, 1);
        link("SECONDARY_APPROACH", "LAND_PATH", realms[index], districts[(index + 1) % districts.length], index % 2 ? -0.3 : 0.3, 0.86);
      }
      for (let index = 0; index < districts.length; index += 1) link("HEARTLAND_THROUGH_ROUTE", "LAND_PATH", districts[index], districts[(index + 1) % districts.length], index % 2 ? 0.12 : -0.12, 0.82);
    } else if (id === "OPPOSING_FRONTS" || id === "RIVAL_CONTINENTS") {
      const tilt = (random() - 0.5) * 0.24;
      realms = [{ x: 0.2 + random() * 0.08, y: 0.47 - tilt }, { x: 0.72 + random() * 0.08, y: 0.53 + tilt }]
        .map((point, index) => add(`TEAM_REALM_${index + 1}`, "LAND", point, 0.18 + random() * 0.055, 1.1));
      link("PRIMARY_HINGE", id === "RIVAL_CONTINENTS" ? "WATER_PATH" : "LAND_PATH", realms[0], realms[1], 0.24, 1);
      link("SECONDARY_HINGE", "LAND_PATH", realms[0], realms[1], -0.24, 0.9);
      add("SHARED_OBJECTIVE", "VALUE", { x: 0.5, y: 0.4 }, 0.08, 1.5);
      add("SHARED_OBJECTIVE", "VALUE", { x: 0.5, y: 0.6 }, 0.08, 1.35);
    } else if (id === "THREE_REALMS") {
      const triangle = Array.from({ length: 3 }, (_value, index) => {
        const angle = boardRotation + index / 3 * Math.PI * 2 + (random() - 0.5) * 0.22;
        const radial = 0.27 + random() * 0.09;
        return { x: clamp(boardCenter.x + Math.cos(angle) * radial, 0.08, 0.92), y: clamp(boardCenter.y + Math.sin(angle) * radial * 0.9, 0.09, 0.91) };
      });
      realms = triangle.map((point, index) => add(`TEAM_REALM_${index + 1}`, "LAND", point, 0.18 + random() * 0.05, 1.1));
      for (let one = 0; one < 3; one += 1) for (let two = one + 1; two < 3; two += 1) {
        link("MUTUAL_BORDER", "LAND_PATH", realms[one], realms[two], (one + two) % 2 ? 0.22 : -0.22, 1);
        link("SECONDARY_REALM_BORDER", "LAND_PATH", realms[one], realms[two], (one + two) % 2 ? -0.34 : 0.34, 0.82);
      }
      add("SHARED_OBJECTIVE", "VALUE", { x: 0.5, y: 0.42 }, 0.08, 1.5);
      add("SHARED_OBJECTIVE", "VALUE", { x: 0.42, y: 0.57 }, 0.075, 1.35);
      add("SHARED_OBJECTIVE", "VALUE", { x: 0.58, y: 0.57 }, 0.075, 1.35);
    } else if (id === "THALASSIC_LEAGUE") {
      realms = ringPoints(requestedPlayers).map((point, index) => add(`PORT_REALM_${index + 1}`, "VALUE", point, 0.14, 1.1));
      for (let index = 0; index < realms.length; index += 1) link("SEA_LANE", "WATER_PATH", realms[index], realms[(index + 1) % realms.length], index % 2 ? 0.34 : -0.34, 1);
      const seenSecondary = new Set<string>();
      for (let index = 0; index < realms.length; index += 1) {
        const target = realms.length === 3 ? (index + 1) % realms.length : (index + 2) % realms.length;
        const key = [index, target].sort((one, two) => one - two).join(":");
        if (realms.length > 3 && seenSecondary.has(key)) continue;
        seenSecondary.add(key);
        link("REDUNDANT_SEA_LANE", "WATER_PATH", realms[index], realms[target], index % 2 ? -0.22 : 0.22, 0.82);
      }
      add("DIPLOMATIC_PORT", "VALUE", { x: 0.5, y: 0.42 }, 0.08, 1.5);
      add("DIPLOMATIC_PORT", "VALUE", { x: 0.42, y: 0.57 }, 0.075, 1.35);
      add("DIPLOMATIC_PORT", "VALUE", { x: 0.58, y: 0.57 }, 0.075, 1.35);
    } else {
      const roles = ["TALL", "WIDE", "WAR", "TURTLE"];
      const rolePoints = ringPoints(4, 0.3, 0.28);
      realms = rolePoints.map((point, index) => add(roles[index], "LAND", point, roles[index] === "WIDE" ? 0.2 + random() * 0.06 : 0.12 + random() * 0.055, 1.1));
      for (let index = 0; index < realms.length; index += 1) link("ROLE_CONTACT", "LAND_PATH", realms[index], realms[(index + 1) % realms.length], index % 2 ? 0.16 : -0.16, 0.9);
      add("SHARED_OBJECTIVE", "VALUE", { x: 0.5, y: 0.42 }, 0.08, 1.5);
      add("SHARED_OBJECTIVE", "VALUE", { x: 0.42, y: 0.57 }, 0.075, 1.35);
      add("SHARED_OBJECTIVE", "VALUE", { x: 0.58, y: 0.57 }, 0.075, 1.35);
    }
    targets.realms = realms.length;
    targets.requiredConnections = relationships.length;
    targets.roleContracts = id === "UNEQUAL_REALMS" ? 4 : 0;
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
    separatedPoints(count, random, wraps, 0.11).forEach((point, index) => regions.push({ id: `realm-${index + 1}`, role: "REALM", effect: "LAND", ...point, radius: Math.sqrt(targetLand / Math.max(1, count) / Math.PI / area) * 1.35, priority: 1 }));
    for (let one = 0; one < count; one += 1) for (let two = one + 1; two < count; two += 1) relationships.push({ id: `isolation-${one + 1}-${two + 1}`, kind: "ISOLATED_FROM", effect: "TRANSITION", from: regions[one].id, to: regions[two].id, points: [], strength: 1 });
    targets.principalRealms = count;
    targets.minimumRealmLand = minimumRealmLand;
  } else if (recipe.mapType === "SHATTERED_ARCHIPELAGO") {
    const desiredSystems = recipe.scale === "LOCAL" ? 3 : recipe.scale === "PROVINCIAL" ? 4 : Math.max(4, Math.min(7, Math.round(4 + random() * 3)));
    const capacitySystems = Math.max(3, Math.min(7, Math.floor(targetLand / 45)));
    const systemCount = Math.min(desiredSystems, capacitySystems);
    const systemCenters = separatedPoints(systemCount, random, wraps, 0.08);
    for (let system = 0; system < systemCount; system += 1) {
      const center = systemCenters[system];
      const chainId = `chain-${system + 1}`;
      regions.push({ id: chainId, role: "CHAIN", effect: "LAND", ...center, radius: 0.18, priority: 0.8 });
      const angle = random() * Math.PI * 2;
      const nodes = 5 + Math.floor(random() * 4);
      const points: Array<{ x: number; y: number }> = [];
      for (let node = 0; node < nodes; node += 1) {
        const t = nodes === 1 ? 0 : node / (nodes - 1) - 0.5;
        const curve = Math.sin((t + 0.5) * Math.PI) * (0.035 + random() * 0.025);
        const x = (center.x + Math.cos(angle) * t * 0.3 - Math.sin(angle) * curve + 1) % 1;
        const y = clamp(center.y + Math.sin(angle) * t * 0.26 + Math.cos(angle) * curve, 0.04, 0.96);
        const anchor = node === 1 || node === nodes - 2 || node === Math.floor(nodes / 2);
        const region: NarrativeSkeletonRegion = { id: `${chainId}-${anchor ? "anchor" : "satellite"}-${node + 1}`, role: anchor ? "ANCHOR" : "GENERIC", effect: "LAND", x, y, radius: anchor ? 0.045 : 0.022, parentId: chainId, priority: anchor ? 1 : 0.6 };
        regions.push(region);
        relationships.push({ id: `${chainId}-member-${node + 1}`, kind: "BELONGS_TO", effect: "TRANSITION", from: region.id, to: chainId, points: [], strength: anchor ? 1 : 0.7 });
        points.push({ x, y });
      }
      relationships.push({ id: `${chainId}-arc`, kind: "FOLLOWS_ARC", effect: "TRANSITION", from: regions.at(-(nodes))!.id, to: regions.at(-1)!.id, points, strength: 1 });
    }
    targets.parentSystems = systemCount;
  } else if (recipe.mapType === "GREAT_WATERSHEDS") {
    const basinCount = recipe.scale === "LOCAL" ? 2 : recipe.scale === "PROVINCIAL" ? 3 : Math.max(3, Math.min(6, Math.round(3 + random() * 3)));
    const basins = separatedPoints(basinCount, random, wraps, 0.12);
    for (let basin = 0; basin < basinCount; basin += 1) {
      const center = basins[basin];
      const head = { x: clamp(center.x + (random() - 0.5) * 0.18, 0.05, 0.95), y: clamp(0.13 + random() * 0.18, 0.05, 0.95) };
      const outlet = { x: clamp(center.x + (random() - 0.5) * 0.22, 0.05, 0.95), y: clamp(0.78 + random() * 0.16, 0.05, 0.95) };
      const basinRegion = { id: `basin-${basin + 1}`, role: "BASIN" as const, effect: "WET" as const, ...center, radius: 0.16, priority: 1 };
      const headRegion = { id: `headwater-${basin + 1}`, role: "HEADWATER" as const, effect: "RIDGE" as const, ...head, radius: 0.035, parentId: basinRegion.id, priority: 1 };
      const outletRegion = { id: `outlet-${basin + 1}`, role: "OUTLET" as const, effect: "LOWLAND" as const, ...outlet, radius: 0.045, parentId: basinRegion.id, priority: 1 };
      regions.push(basinRegion, headRegion, outletRegion);
      const trunk = Array.from({ length: 9 }, (_value, step) => { const t = step / 8; return { x: clamp(head.x * (1 - t) + outlet.x * t + Math.sin(t * Math.PI * 2 + basin) * 0.025, 0, 1), y: head.y * (1 - t) + outlet.y * t }; });
      relationships.push({ id: `trunk-${basin + 1}`, kind: "FLOWS_TO", effect: "RIVER_PATH", from: headRegion.id, to: outletRegion.id, points: trunk, strength: 1 });
      for (let tributary = 0; tributary < 2; tributary += 1) {
        const join = trunk[3 + tributary * 2];
        const side = tributary % 2 ? 1 : -1;
        relationships.push({ id: `tributary-${basin + 1}-${tributary + 1}`, kind: "FLOWS_TO", effect: "RIVER_PATH", from: basinRegion.id, to: `trunk-${basin + 1}`, points: [{ x: clamp(join.x + side * (0.12 + random() * 0.06), 0.02, 0.98), y: clamp(join.y - 0.1 - random() * 0.08, 0.02, 0.98) }, join], strength: 0.72 });
      }
    }
    targets.primaryCatchments = basinCount;
    targets.trunkRivers = basinCount;
    targets.tributaries = basinCount * 2;
  } else if (recipe.mapType === "ICEHOUSE_EARTH") {
    const sheetCount = recipe.scale === "LOCAL" ? 1 : 2;
    const sheetCenters = recipe.scale === "LOCAL" ? separatedPoints(1, random, wraps, 0.15) : [{ x: 0.3 + random() * 0.12, y: 0.18 + random() * 0.12 }, { x: 0.64 + random() * 0.12, y: 0.73 + random() * 0.12 }];
    sheetCenters.forEach((point, index) => regions.push({ id: `ice-sheet-${index + 1}`, role: "ICE_SHEET", effect: "COLD", ...point, radius: recipe.scale === "GLOBAL" ? 0.38 : 0.31, priority: 1 }));
    const refugeCount = Math.max(2, Math.min(options.players, recipe.scale === "LOCAL" ? 3 : 6));
    separatedPoints(refugeCount, random, wraps, 0.1).forEach((point, index) => regions.push({ id: `refuge-${index + 1}`, role: "REFUGE", effect: "VALUE", x: point.x, y: clamp(0.36 + point.y * 0.28, 0.24, 0.76), radius: 0.055, priority: 1 }));
    for (const refuge of regions.filter((region) => region.role === "REFUGE")) for (const sheet of regions.filter((region) => region.role === "ICE_SHEET")) relationships.push({ id: `${refuge.id}-supplies-${sheet.id}`, kind: "SUPPLIES", effect: "TRANSITION", from: refuge.id, to: sheet.id, points: [], strength: 0.7 });
    targets.iceSheets = sheetCount;
    targets.refuges = refugeCount;
  } else if (!compileCatalogSkeleton(recipe.mapType, recipe.scale, random, wraps, options.players, regions, relationships, targets)) {
    regions.push({ id: "narrative-region-1", role: "GENERIC", effect: "LAND", x: 0.5, y: 0.5, radius: 0.3, priority: 1 });
  }

  return { schemaVersion: 1, profileId: recipe.mapType, implementation: profile.implementation, scale: recipe.scale, width, height, seed: options.seed, regions, relationships, targets, conflicts, relaxations };
}

type NarrativeGeography = { landMask: boolean[]; reliefValues: number[]; temperatures?: number[]; moistures: number[]; elevations: number[]; riverGuidance?: number[]; tiles: Civ5Tile[]; structure: GenerationStructure; startLocations?: Civ5StartLocation[] };

function tileDistance(index: number, region: { x: number; y: number; radius?: number }, width: number, height: number, wraps: boolean) {
  const point = { x: (index % width + 0.5) / width, y: (Math.floor(index / width) + 0.5) / height };
  let dx = Math.abs(point.x - region.x); if (wraps) dx = Math.min(dx, 1 - dx);
  return Math.hypot(dx * width / Math.max(width, height), (point.y - region.y) * height / Math.max(width, height) * 0.866);
}

function narrativeObjects(skeleton: NarrativeSkeleton, landMask: boolean[], width: number, height: number, wraps: boolean) {
  const greatSeas = skeleton.profileId === "SHATTERED_BASINS" ? skeleton.regions.filter((region) => region.role === "GREAT_INLAND_SEA") : [];
  const seaTiles = greatSeas.map(() => [] as number[]);
  if (greatSeas.length) {
    for (let index = 0; index < landMask.length; index += 1) {
      if (landMask[index]) continue;
      let nearest = 0;
      for (let sea = 1; sea < greatSeas.length; sea += 1) {
        if (tileDistance(index, greatSeas[sea], width, height, wraps) < tileDistance(index, greatSeas[nearest], width, height, wraps)) nearest = sea;
      }
      seaTiles[nearest].push(index);
    }
  }
  const regions: GeographicObject[] = skeleton.regions.map((region) => {
    const sea = greatSeas.indexOf(region);
    return {
      id: `narrative-${region.id}`,
      name: region.id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      kind: sea >= 0 ? "INLAND_SEA" : region.role === "ICE_SHEET" ? "ICE_SHEET" : region.role === "REFUGE" ? "REFUGE" : "NARRATIVE_REGION",
      tileIndices: sea >= 0
        ? seaTiles[sea]
        : landMask.flatMap((land, index) => (region.effect === "WATER" ? !land : land) && tileDistance(index, region, width, height, wraps) <= region.radius ? [index] : []),
      attributes: { role: region.role, effect: region.effect ?? "", parent: region.parentId ?? "", priority: region.priority, ...(sea >= 0 ? { semanticBasin: true } : {}) },
    };
  });
  const paths: GeographicObject[] = skeleton.relationships.filter((relationship) => relationship.points.length).map((relationship) => {
    let tileIndices = relationship.points.map((point) => Math.min(width * height - 1, Math.max(0, Math.floor(point.y * height) * width + Math.min(width - 1, Math.floor(point.x * width)))));
    if (relationship.kind === "CANAL_ISTHMUS" && !tileIndices.some((index) => landMask[index])) {
      const point = relationship.points[0];
      const nearest = landMask.reduce((best, land, index) => {
        if (!land) return best;
        return best < 0 || tileDistance(index, { ...point, radius: 0 }, width, height, wraps) < tileDistance(best, { ...point, radius: 0 }, width, height, wraps) ? index : best;
      }, -1);
      tileIndices = nearest < 0 ? [] : [nearest];
    }
    return {
      id: `narrative-${relationship.id}`,
      name: relationship.id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      kind: relationship.kind === "NARROW_STRAIT" ? "STRAIT" : relationship.kind === "CANAL_ISTHMUS" ? "NARRATIVE_REGION" : "NARRATIVE_PATH",
      tileIndices: [...new Set(tileIndices)],
      attributes: { relationship: relationship.kind, role: relationship.kind, effect: relationship.effect ?? "", from: relationship.from, to: relationship.to, strength: relationship.strength },
    };
  });
  return [...regions, ...paths].filter((object) => object.tileIndices.length);
}

export function attachNarrativeStructure<T extends NarrativeGeography>(
  geography: T,
  skeleton: NarrativeSkeleton,
  width: number,
  height: number,
  wraps: boolean,
): T {
  const area = width * height;
  const retainedObjects = geography.structure.objects;
  const retainedIds = new Set(retainedObjects.map((object) => object.id));
  const structureObjects = [
    ...retainedObjects,
    ...narrativeObjects(skeleton, geography.landMask, width, height, wraps).filter((object) => !retainedIds.has(object.id)),
  ];
  return {
    ...geography,
    structure: {
      ...geography.structure,
      objects: structureObjects,
      narrativeSkeleton: skeleton,
      diagnostics: {
        ...geography.structure.diagnostics,
        narrativeRegions: skeleton.regions.length,
        narrativeRelationships: skeleton.relationships.length,
        narrativeConflicts: skeleton.conflicts.length,
        narrativeRelaxations: skeleton.relaxations.length,
        ...(skeleton.profileId === "SHATTERED_BASINS" ? {
          narrativeGreatSeas: structureObjects.filter((object) => object.kind === "INLAND_SEA" && object.tileIndices.length >= area * 0.08).length,
          narrativeStraits: structureObjects.filter((object) => object.kind === "STRAIT").length,
          narrativeCanalSites: structureObjects.filter((object) => object.attributes?.role === "CANAL_ISTHMUS").length,
          narrativeLandComponents: structureObjects.filter((object) => object.kind === "CONTINENT").length,
        } : {}),
      },
    },
  };
}

function connectedNeighbors(index: number, width: number, height: number, wraps: boolean) {
  const x = index % width; const y = Math.floor(index / width);
  const offsets = y % 2 === 0 ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]] : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  return offsets.flatMap(([dx, dy]) => { let nx = x + dx; const ny = y + dy; if (wraps) nx = (nx + width) % width; return nx >= 0 && nx < width && ny >= 0 && ny < height ? [ny * width + nx] : []; });
}

const GENERATED_TERRAINS = [
  "TERRAIN_OCEAN",
  "TERRAIN_COAST",
  "TERRAIN_GRASS",
  "TERRAIN_PLAINS",
  "TERRAIN_DESERT",
  "TERRAIN_TUNDRA",
  "TERRAIN_SNOW",
];

function expandedTileIndices(origins: Iterable<number>, radius: number, width: number, height: number, wraps: boolean) {
  const reached = new Set(origins);
  let frontier = [...reached];
  for (let distance = 0; distance < radius; distance += 1) {
    const next: number[] = [];
    for (const index of frontier) for (const neighbor of connectedNeighbors(index, width, height, wraps)) {
      if (reached.has(neighbor)) continue;
      reached.add(neighbor);
      next.push(neighbor);
    }
    frontier = next;
  }
  return reached;
}

function retainedInlandWaterTiles(
  tiles: Civ5Tile[],
  structure: GenerationStructure | undefined,
  width: number,
  height: number,
  wraps: boolean,
) {
  const retainedSeeds = new Set(structure?.objects.filter((object) => object.kind === "INLAND_SEA" || object.kind === "LAKE"
    || /(?:INLAND|INTERIOR|TERMINAL).*(?:SEA|LAKE|BASIN)|GREAT_INLAND_SEA/.test(String(object.attributes?.role ?? "")))
    .flatMap((object) => object.tileIndices.filter((index) => tiles[index]?.terrain < 2)) ?? []);
  const assignments = new Int32Array(tiles.length).fill(-1);
  const components: number[][] = [];
  for (let origin = 0; origin < tiles.length; origin += 1) {
    if (assignments[origin] >= 0 || tiles[origin].terrain >= 2) continue;
    const component = components.length;
    const queue = [origin];
    assignments[origin] = component;
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const neighbor of connectedNeighbors(queue[cursor], width, height, wraps)) {
      if (assignments[neighbor] >= 0 || tiles[neighbor].terrain >= 2) continue;
      assignments[neighbor] = component;
      queue.push(neighbor);
    }
    components.push(queue);
  }
  const retainedComponents = new Set([...retainedSeeds].map((index) => assignments[index]).filter((component) => component >= 0));
  const inland = new Set<number>();
  for (const [component, members] of components.entries()) {
    const touchesExterior = members.some((index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return y === 0 || y === height - 1 || !wraps && (x === 0 || x === width - 1);
    });
    if (!touchesExterior && (!retainedComponents.size || retainedComponents.has(component))) for (const index of members) inland.add(index);
  }
  return inland;
}

function relocateResourcesInto(
  tiles: Civ5Tile[],
  mapResources: string[],
  eligible: ReadonlySet<number>,
  desiredInside: number,
  sourcePriority?: (index: number) => number,
  sourceAllowed?: (index: number) => boolean,
  targetAllowed?: (index: number) => boolean,
) {
  if (!eligible.size || desiredInside <= 0) return 0;
  const placementMap = { terrains: GENERATED_TERRAINS, resources: mapResources };
  let retained = [...eligible].filter((index) => tiles[index].resource !== 255 && resourcePlacementVerdict(placementMap, tiles[index]).valid).length;
  if (retained >= desiredInside) return 0;
  const targets = [...eligible].filter((index) => {
    const tile = tiles[index];
    return (targetAllowed?.(index) ?? (tile.terrain >= 2 && tile.elevation < 2))
      && tile.resource === 255 && tile.wonder === 255 && !tile.improvement;
  }).sort((one, two) => one - two);
  const sources = tiles.flatMap((tile, index) => !eligible.has(index)
    && (sourceAllowed?.(index) ?? true)
    && tile.resource !== 255
    && tile.wonder === 255
    && !tile.improvement
    && resourcePlacementVerdict(placementMap, tile).valid ? [index] : [])
    .sort((one, two) => (sourcePriority?.(one) ?? 0) - (sourcePriority?.(two) ?? 0) || one - two);
  let moved = 0;
  for (const sourceIndex of sources) {
    if (retained >= desiredInside) break;
    const source = tiles[sourceIndex];
    const targetPosition = targets.findIndex((index) => resourcePlacementVerdict(placementMap, { ...tiles[index], resource: source.resource }).valid);
    if (targetPosition < 0) continue;
    const destination = targets.splice(targetPosition, 1)[0];
    tiles[destination].resource = source.resource;
    tiles[destination].resourceAmount = source.resourceAmount;
    source.resource = 255;
    source.resourceAmount = 0;
    retained += 1;
    moved += 1;
  }
  return moved;
}

export function applyNarrativeContent(tiles: Civ5Tile[], mapResources: string[], skeleton: NarrativeSkeleton, width: number, height: number, wraps = false, contract?: NarrativeGenerativeContract, structure?: GenerationStructure) {
  const regionContains = (index: number, region: NarrativeSkeletonRegion, multiplier = 1) => {
    const x = (index % width + 0.5) / width; const y = (Math.floor(index / width) + 0.5) / height;
    let dx = Math.abs(x - region.x); if (wraps) dx = Math.min(dx, 1 - dx);
    return Math.hypot(dx * width / Math.max(width, height), (y - region.y) * height / Math.max(width, height) * 0.866) <= region.radius * multiplier;
  };
  const concentrateExistingValue = (regions: NarrativeSkeletonRegion[], share: number) => {
    if (!regions.length || share <= 0) return;
    const inside = (index: number) => regions.some((region) => regionContains(index, region, 1.35));
    const targets = tiles.flatMap((tile, index) => tile.terrain >= 2 && tile.elevation < 2 && tile.resource === 255 && tile.wonder === 255 && inside(index) ? [index] : []);
    const sources = tiles.flatMap((tile, index) => tile.resource !== 255 && !inside(index) ? [index] : []);
    const limit = Math.min(targets.length, Math.round(sources.length * share));
    for (let moved = 0; moved < limit; moved += 1) {
      const sourceIndex = sources[moved]; const source = tiles[sourceIndex];
      const targetPosition = targets.findIndex((index) => tiles[index].terrain === source.terrain && tiles[index].elevation === source.elevation && tiles[index].feature === source.feature);
      if (targetPosition < 0) continue;
      const destination = targets.splice(targetPosition, 1)[0];
      tiles[destination].resource = source.resource; tiles[destination].resourceAmount = source.resourceAmount;
      source.resource = 255; source.resourceAmount = 0;
    }
  };
  const pattern = contract?.content.pattern;
  if (skeleton.profileId === "LONELY_OCEANS") {
    for (let index = 0; index < tiles.length; index += 1) {
      const tile = tiles[index];
      if (tile.terrain >= 2 || tile.resource === 255) continue;
      const nearLand = connectedNeighbors(index, width, height, wraps).some((neighbor) => tiles[neighbor].terrain >= 2)
        || connectedNeighbors(index, width, height, wraps).some((neighbor) => connectedNeighbors(neighbor, width, height, wraps).some((second) => tiles[second].terrain >= 2));
      if (!nearLand || index % 3 !== 0) { tile.resource = 255; tile.resourceAmount = 0; }
    }
  }
  if (skeleton.profileId === "MYTHIC_REGIONS") {
    const structuralHearts = new Set(structure?.objects
      .filter((object) => String(object.attributes?.role ?? "").includes("HEART") || object.attributes?.effect === "VALUE")
      .flatMap((object) => object.tileIndices) ?? []);
    const structuralMarches = new Set(structure?.objects
      .filter((object) => String(object.attributes?.role ?? "").includes("MARCH") || object.attributes?.effect === "BARREN")
      .flatMap((object) => object.tileIndices) ?? []);
    const hearts = skeleton.regions.filter((region) => region.effect === "VALUE");
    const inSkeletonHeart = (index: number) => hearts.some((heart) => {
      const x = (index % width + 0.5) / width; const y = (Math.floor(index / width) + 0.5) / height;
      return Math.hypot(x - heart.x, (y - heart.y) * 0.866) <= heart.radius * 1.25;
    });
    const heartTiles = structuralHearts.size
      ? structuralHearts
      : new Set(tiles.flatMap((_tile, index) => inSkeletonHeart(index) ? [index] : []));
    const emptyTargets = [...heartTiles].filter((index) => {
      const tile = tiles[index];
      return tile.terrain >= 2 && tile.elevation < 2 && tile.resource === 255 && tile.wonder === 255 && !tile.improvement;
    });
    const totalWonders = tiles.filter((tile) => tile.wonder !== 255).length;
    const desiredWonders = Math.ceil(totalWonders * (contract?.content.wonderBias ?? 0));
    let retainedWonders = [...heartTiles].filter((index) => tiles[index].wonder !== 255).length;
    for (const sourceIndex of tiles.flatMap((tile, index) => tile.wonder !== 255 && !heartTiles.has(index) ? [index] : [])) {
      if (retainedWonders >= desiredWonders) break;
      const source = tiles[sourceIndex];
      // Generated natural-wonder legality distinguishes land from water and
      // rejects ordinary land wonders on mountains. A passable destination of
      // the same medium is therefore a valid relocation without requiring an
      // accidental exact terrain/feature twin inside every small heart.
      const targetIndex = emptyTargets.findIndex((index) => (tiles[index].terrain < 2) === (source.terrain < 2));
      if (targetIndex < 0) continue;
      const destination = emptyTargets.splice(targetIndex, 1)[0];
      tiles[destination].wonder = source.wonder; source.wonder = 255;
      retainedWonders += 1;
    }
    const totalResources = tiles.filter((tile) => tile.resource !== 255).length;
    const desiredResourceShare = Math.min(0.76, 0.25 + (contract?.content.valueContrast ?? 0.5) * 0.46);
    relocateResourcesInto(
      tiles,
      mapResources,
      heartTiles,
      Math.ceil(totalResources * desiredResourceShare),
      (index) => structuralMarches.has(index) ? -1 : 0,
    );
  }
  if (pattern === "RIVER_VALLEYS") {
    const riverPoints = skeleton.relationships.filter((relationship) => relationship.effect === "RIVER_PATH").flatMap((relationship) => relationship.points);
    for (const point of riverPoints) {
      const origin = Math.max(0, Math.min(tiles.length - 1, Math.floor(point.y * height) * width + Math.min(width - 1, Math.floor(point.x * width))));
      for (const index of [origin, ...connectedNeighbors(origin, width, height, wraps)]) {
        const tile = tiles[index];
        if (tile.terrain < 2 || tile.elevation > 0) continue;
        if (tile.terrain === 4 || tile.terrain === 5) tile.terrain = 3;
        else if (tile.terrain !== 6) tile.terrain = 2;
        if (tile.feature === 255 && index % 5 === 0 && tile.terrain === 2) tile.feature = 2;
      }
    }
  }
  if (pattern === "SHELF_ANCHORS" || pattern === "INLAND_WATER_ECONOMY" || pattern === "MARITIME_REALMS" || pattern === "NAVAL_NETWORK") {
    const retainedInlandWater = pattern === "INLAND_WATER_ECONOMY"
      ? retainedInlandWaterTiles(tiles, structure, width, height, wraps)
      : new Set<number>();
    const eligible = new Set(tiles.flatMap((tile, index) => tile.terrain < 2
      && tile.feature !== 3
      && tile.wonder === 255
      && !tile.improvement
      && connectedNeighbors(index, width, height, wraps).some((neighbor) => tiles[neighbor].terrain >= 2 && tiles[neighbor].elevation < 2)
      && (pattern !== "INLAND_WATER_ECONOMY" || !retainedInlandWater.size || retainedInlandWater.has(index)) ? [index] : []));
    const totalWaterResources = tiles.filter((tile) => tile.terrain < 2 && tile.resource !== 255).length;
    const desiredShare = 0.35 + (contract?.content.coastalValue ?? 0.5) * 0.4;
    relocateResourcesInto(
      tiles,
      mapResources,
      eligible,
      Math.max(1, Math.ceil(totalWaterResources * desiredShare)),
      undefined,
      undefined,
      (index) => tiles[index].terrain < 2 && tiles[index].feature !== 3,
    );
    if (pattern === "NAVAL_NETWORK") {
      const diplomaticPorts = structure?.objects
        .filter((object) => object.attributes?.nativeNarrative === true
          && object.attributes?.role === "DIPLOMATIC_PORT")
        .sort((one, two) => one.id.localeCompare(two.id)) ?? [];
      const diplomaticPortTiles = new Set(diplomaticPorts.flatMap((object) => object.tileIndices));
      // Each authored port is an individual land objective, not merely part of
      // the aggregate coastal economy. Reserve one existing legal value item
      // in every exact district without changing resource counts or taking the
      // only value already assigned to another port.
      for (const port of diplomaticPorts) {
        if (port.tileIndices.some((index) => tiles[index].resource !== 255 || tiles[index].wonder !== 255)) continue;
        relocateResourcesInto(
          tiles,
          mapResources,
          new Set(port.tileIndices),
          1,
          undefined,
          (index) => !diplomaticPortTiles.has(index),
        );
      }
    }
    if (pattern === "SHELF_ANCHORS" || pattern === "MARITIME_REALMS") {
      const rolePattern = pattern === "SHELF_ANCHORS" ? /(?:^|_)(?:ANCHOR|DROWNED_SHELF)$/ : /ISLAND_CONTINENT|MARITIME_REALM/;
      const anchors = structure?.objects.filter((object) => object.kind !== "NARRATIVE_PATH" && rolePattern.test(String(object.attributes?.role ?? ""))) ?? [];
      const reservedValue = new Set<number>();
      const placementMap = { terrains: GENERATED_TERRAINS, resources: mapResources };
      for (const anchor of anchors) {
        const local = new Set([...expandedTileIndices(anchor.tileIndices, 2, width, height, wraps)]
          .filter((index) => eligible.has(index)));
        const supplied = [...local].find((index) => tiles[index].resource !== 255 && resourcePlacementVerdict(placementMap, tiles[index]).valid);
        if (supplied !== undefined) {
          reservedValue.add(supplied);
          continue;
        }
        relocateResourcesInto(
          tiles,
          mapResources,
          local,
          1,
          undefined,
          (index) => !reservedValue.has(index),
          (index) => tiles[index].terrain < 2 && tiles[index].feature !== 3,
        );
        const relocated = [...local].find((index) => tiles[index].resource !== 255 && resourcePlacementVerdict(placementMap, tiles[index]).valid);
        if (relocated !== undefined) reservedValue.add(relocated);
      }
    }
  }
  if (pattern === "CONTESTED_CENTRE") {
    const contestedTiles = new Set(structure?.objects
      .filter((object) => object.kind === "STRATEGIC_REGION" && ["CONTESTED", "OBJECTIVE"].includes(String(object.attributes?.role)))
      .flatMap((object) => object.tileIndices) ?? []);
    if (contestedTiles.size) {
      const contrast = contract?.content.valueContrast ?? 0.45;
      const scale = Math.max(0.65, Math.min(2.2, Math.sqrt(tiles.length / 960)));
      const meaningfulCount = Math.max(1, Math.round((3 + contrast * 5) * scale));
      const passableCapacity = [...contestedTiles].filter((index) => tiles[index].terrain >= 2 && tiles[index].elevation < 2).length;
      const outsidePassableCapacity = tiles.reduce((count, tile, index) => count
        + Number(!contestedTiles.has(index) && tile.terrain >= 2 && tile.elevation < 2), 0);
      const densityCount = Math.ceil(passableCapacity * (0.14 + contrast * 0.22));
      const placementMap = { terrains: GENERATED_TERRAINS, resources: mapResources };
      const legalValue = tiles.flatMap((tile, index) => (tile.resource !== 255
        && tile.wonder === 255
        && tile.resourceAmount > 0
        && resourcePlacementVerdict(placementMap, tile).valid) || (tile.wonder !== 255 && tile.resource === 255) ? [index] : []);
      const insideWonders = [...contestedTiles].filter((index) => tiles[index].wonder !== 255 && tiles[index].resource === 255).length;
      // The evidence contract compares density inside the retained objective
      // footprint with density across the rest of the passable world. Solve
      // that same inequality for the number of inside placements, then move
      // only existing legal resources. This preserves counts and classes while
      // making the authored value contrast causal rather than incidental.
      const gradientTarget = 0.06 + contrast * 0.2;
      const gradientCount = Math.ceil(passableCapacity
        * (legalValue.length + gradientTarget * Math.max(1, outsidePassableCapacity))
        / Math.max(1, passableCapacity + outsidePassableCapacity));
      const desiredResources = Math.max(0, Math.max(meaningfulCount, densityCount, gradientCount) - insideWonders);
      const totalResources = legalValue.filter((index) => tiles[index].resource !== 255).length;
      relocateResourcesInto(tiles, mapResources, contestedTiles, Math.min(totalResources, desiredResources));
    }
    else concentrateExistingValue(skeleton.regions.filter((region) => region.effect === "VALUE"), contract?.content.valueContrast ?? 0.45);
  }
  if (pattern === "ROLE_ASYMMETRY") {
    const tall = skeleton.regions.filter((region) => region.role === "TALL");
    const war = skeleton.regions.filter((region) => region.role === "WAR");
    const tallTiles = new Set(structure?.objects.filter((object) => object.kind === "STRATEGIC_REGION" && object.attributes?.contractRole === "TALL")
      .flatMap((object) => object.tileIndices) ?? []);
    if (!tallTiles.size) for (let index = 0; index < tiles.length; index += 1) if (tall.some((region) => regionContains(index, region, 1.2))) tallTiles.add(index);
    const warTiles = new Set(structure?.objects.filter((object) => object.kind === "STRATEGIC_REGION" && object.attributes?.contractRole === "WAR")
      .flatMap((object) => object.tileIndices) ?? []);
    if (!warTiles.size) for (let index = 0; index < tiles.length; index += 1) if (war.some((region) => regionContains(index, region, 1.2))) warTiles.add(index);
    const totalResources = tiles.filter((tile) => tile.resource !== 255).length;
    const contrast = contract?.content.valueContrast ?? 0.5;
    relocateResourcesInto(
      tiles,
      mapResources,
      tallTiles,
      Math.min(Math.ceil(totalResources * (0.18 + contrast * 0.25)), Math.ceil(tallTiles.size * (0.3 + contrast * 0.2))),
    );
    for (const index of warTiles) if (tiles[index].terrain === 2 && index % 4 === 0) tiles[index].terrain = 3;
  }
  if (skeleton.profileId !== "ICEHOUSE_EARTH") return;
  const coldEligible = new Set(tiles.flatMap((tile, index) => tile.elevation < 2
    && (tile.terrain === 5 || tile.terrain === 6 || tile.terrain < 2 && tile.feature === 3)
    && tile.wonder === 255
    && !tile.improvement ? [index] : []));
  const totalResources = tiles.filter((tile) => tile.resource !== 255).length;
  const desiredColdShare = Math.min(0.75, 0.12
    + (contract?.content.hostileFrontierValue ?? 0.5) * 0.3
    + (contract?.content.valueContrast ?? 0.5) * 0.22);
  relocateResourcesInto(
    tiles,
    mapResources,
    coldEligible,
    Math.ceil(totalResources * desiredColdShare),
    undefined,
    undefined,
    (index) => coldEligible.has(index),
  );
}

/** Final rivers are known only after the hydrology pass. This content pass is
 * deliberately relocation-only: it changes neither the user's resource count
 * nor resource classes, and it never removes value from a major start's first
 * three rings. */
export function applyNarrativeRiverValleyContent(
  tiles: Civ5Tile[],
  mapResources: string[],
  starts: Civ5StartLocation[],
  width: number,
  height: number,
  wraps = false,
  contract?: NarrativeGenerativeContract,
) {
  if (contract?.content.pattern !== "RIVER_VALLEYS") return;
  const riverTiles = tiles.flatMap((tile, index) => tile.river > 0 ? [index] : []);
  const valleyNeighborhood = new Set(riverTiles);
  let valleyFrontier = [...riverTiles];
  for (let radius = 0; radius < 2; radius += 1) {
    const next: number[] = [];
    for (const index of valleyFrontier) for (const neighbor of connectedNeighbors(index, width, height, wraps)) {
      if (valleyNeighborhood.has(neighbor)) continue;
      valleyNeighborhood.add(neighbor);
      next.push(neighbor);
    }
    valleyFrontier = next;
  }
  const valleyTiles = new Set([...valleyNeighborhood].filter((index) => tiles[index].terrain >= 2 && tiles[index].elevation < 2));
  if (!valleyTiles.size) return;
  const protectedStarts = new Set<number>();
  let frontier = starts.filter((start) => !start.cityState).map((start) => start.y * width + start.x);
  for (const index of frontier) protectedStarts.add(index);
  for (let radius = 0; radius < 3; radius += 1) {
    const next: number[] = [];
    for (const index of frontier) for (const neighbor of connectedNeighbors(index, width, height, wraps)) {
      if (protectedStarts.has(neighbor)) continue;
      protectedStarts.add(neighbor);
      next.push(neighbor);
    }
    frontier = next;
  }
  const totalResources = tiles.filter((tile) => tile.resource !== 255).length;
  const desiredShare = Math.min(0.52, 0.2 + contract.content.valueContrast * 0.42);
  const desiredValleyDensity = 0.16 + contract.content.valueContrast * 0.32;
  relocateResourcesInto(
    tiles,
    mapResources,
    valleyTiles,
    Math.max(2, Math.min(Math.ceil(totalResources * desiredShare), Math.ceil(valleyTiles.size * desiredValleyDensity))),
    undefined,
    (index) => !protectedStarts.has(index),
  );
}

/** Moves, but never creates or removes, city-state starts into the contested
 * theatres promised by Polis content contracts. The operation is deliberately
 * deterministic and rechecks the same global spacing and workable-land
 * conditions used by ordinary generation before accepting a destination. */
export function applyNarrativeCityStateContestability(
  starts: Civ5StartLocation[],
  tiles: Civ5Tile[],
  width: number,
  height: number,
  wraps: boolean,
  contract: NarrativeGenerativeContract | undefined,
  structure: GenerationStructure | undefined,
  minimumSpacing = 5,
) {
  if (contract?.content.pattern !== "CONTESTED_CENTRE" || !structure) return 0;
  const contested = new Set(structure.objects
    .filter((object) => object.kind === "STRATEGIC_REGION" && ["CONTESTED", "OBJECTIVE"].includes(String(object.attributes?.role)))
    .flatMap((object) => object.tileIndices));
  if (!contested.size) return 0;
  const contestedNeighborhood = expandedTileIndices(contested, 1, width, height, wraps);
  const cityStates = starts.filter((start) => start.cityState);
  if (!cityStates.length) return 0;
  const required = Math.ceil(cityStates.length * contract.content.cityStateContestability);
  const distance = (one: [number, number], two: [number, number]) => {
    const cubeDistance = (a: [number, number], b: [number, number]) => {
      const aq = a[0] - (a[1] - (a[1] & 1)) / 2;
      const bq = b[0] - (b[1] - (b[1] & 1)) / 2;
      return (Math.abs(aq - bq) + Math.abs(aq + a[1] - bq - b[1]) + Math.abs(a[1] - b[1])) / 2;
    };
    if (!wraps) return cubeDistance(one, two);
    return Math.min(cubeDistance(one, two), cubeDistance([one[0] - width, one[1]], two), cubeDistance([one[0] + width, one[1]], two));
  };
  const qualifies = (start: Civ5StartLocation) => contestedNeighborhood.has(start.y * width + start.x);
  let supplied = cityStates.filter(qualifies).length;
  if (supplied >= required) return 0;
  const spacing = Math.max(5, Math.round(minimumSpacing), contract.gameplay.minimumStartDistance);
  const candidates = [...contestedNeighborhood].filter((index) => {
    const tile = tiles[index];
    if (!tile || tile.terrain < 2 || tile.elevation >= 2 || tile.wonder !== 255 || tile.improvement) return false;
    return connectedNeighbors(index, width, height, wraps).filter((neighbor) => tiles[neighbor].terrain >= 2 && tiles[neighbor].elevation < 2).length >= 3;
  });
  const majors = starts.filter((start) => !start.cityState);
  let moved = 0;
  for (const cityState of cityStates.filter((start) => !qualifies(start))) {
    if (supplied >= required) break;
    const destinations = candidates.filter((index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return starts.every((other) => other === cityState || distance([x, y], [other.x, other.y]) >= spacing);
    }).sort((one, two) => {
      const score = (index: number) => {
        const x = index % width;
        const y = Math.floor(index / width);
        const majorDistances = majors.map((major) => distance([x, y], [major.x, major.y])).sort((a, b) => a - b);
        const sharedAccess = majorDistances.length > 1 ? 12 - Math.abs(majorDistances[1] - majorDistances[0]) : 0;
        const objectiveContact = connectedNeighbors(index, width, height, wraps).filter((neighbor) => contested.has(neighbor)).length;
        const workable = connectedNeighbors(index, width, height, wraps).filter((neighbor) => tiles[neighbor].terrain >= 2 && tiles[neighbor].elevation < 2).length;
        return sharedAccess * 3 + objectiveContact * 2 + workable;
      };
      return score(two) - score(one) || one - two;
    });
    const destination = destinations[0];
    if (destination === undefined) continue;
    cityState.x = destination % width;
    cityState.y = Math.floor(destination / width);
    const node = structure.strategicGraph?.nodes.find((candidate) => candidate.kind === "CITY_STATE" && candidate.owner === cityState.player);
    if (node) { node.x = cityState.x; node.y = cityState.y; }
    supplied += 1;
    moved += 1;
  }
  const graph = structure.strategicGraph;
  if (graph) {
    const contestability = cityStates.length && majors.length > 1
      ? cityStates.reduce((sum, cityState) => {
        const distances = majors.map((major) => distance([cityState.x, cityState.y], [major.x, major.y])).sort((one, two) => one - two);
        return sum + Math.max(0, Math.min(1, 1 - Math.abs(distances[1] - distances[0]) / Math.max(4, distances[1])));
      }, 0) / cityStates.length
      : 0;
    graph.metrics.cityStateContestability = contestability;
    graph.metrics.narrativeContestedCityStates = cityStates.filter(qualifies).length;
    graph.metrics.narrativeContestedCityStateTarget = required;
  }
  return moved;
}

/** Applies the single authored site exception in the current catalogue:
 * Brutal Opposing Fronts moves existing camps and ruins into the retained DMZ
 * without changing their counts, then lays a sparse legal fallout trace. */
export function applyNarrativeBrutalFrontierContent(
  tiles: Civ5Tile[],
  mapFeatures: string[],
  starts: Civ5StartLocation[],
  width: number,
  height: number,
  wraps: boolean,
  contract: NarrativeGenerativeContract | undefined,
  structure: GenerationStructure | undefined,
  options: Pick<MapGenerationOptions, "style" | "barbarianAbundance" | "barbarianStartDistance" | "ruinAbundance" | "ruinStartDistance">,
) {
  const result = { movedBarbarians: 0, movedRuins: 0, addedFallout: 0 };
  const policy = contract?.content.sitePolicy;
  if (contract?.profileId !== "OPPOSING_FRONTS" || !policy || options.style !== policy.activationCharacter || !structure) return result;
  const theatreObjects = structure.objects
    .filter((object) => object.kind === "STRATEGIC_REGION" && ["CONTESTED", "OBJECTIVE", "BRUTAL_DMZ"].includes(String(object.attributes?.role)));
  const theatre = new Set(theatreObjects.flatMap((object) => object.tileIndices));
  if (!theatre.size) return result;
  const distance = (one: [number, number], two: [number, number]) => {
    const cubeDistance = (a: [number, number], b: [number, number]) => {
      const aq = a[0] - (a[1] - (a[1] & 1)) / 2;
      const bq = b[0] - (b[1] - (b[1] & 1)) / 2;
      return (Math.abs(aq - bq) + Math.abs(aq + a[1] - bq - b[1]) + Math.abs(a[1] - b[1])) / 2;
    };
    if (!wraps) return cubeDistance(one, two);
    return Math.min(cubeDistance(one, two), cubeDistance([one[0] - width, one[1]], two), cubeDistance([one[0] + width, one[1]], two));
  };
  const point = (index: number): [number, number] => [index % width, Math.floor(index / width)];
  const farFromStarts = (index: number, buffer: number) => starts.every((start) => distance(point(index), [start.x, start.y]) >= Math.max(0, Math.round(buffer)));
  const fallout = mapFeatures.indexOf("FEATURE_FALLOUT");
  const expandTheatre = () => {
    const additions = new Set<number>();
    for (const index of theatre) for (const neighbor of connectedNeighbors(index, width, height, wraps)) {
      if (theatre.has(neighbor) || tiles[neighbor].terrain < 2 || tiles[neighbor].elevation >= 2) continue;
      additions.add(neighbor);
    }
    additions.forEach((index) => theatre.add(index));
  };
  let dmz = theatreObjects.find((object) => object.attributes?.role === "BRUTAL_DMZ");
  if (!dmz?.attributes?.brutalFrontierNormalized) {
    expandTheatre();
    expandTheatre();
    dmz = {
      id: "brutal-frontier-dmz",
      name: "Brutal Frontier DMZ",
      kind: "STRATEGIC_REGION",
      tileIndices: [...theatre].sort((one, two) => one - two),
      attributes: { role: "BRUTAL_DMZ", brutalFrontierNormalized: true },
    };
    structure.objects.push(dmz);
    theatreObjects.push(dmz);
  }
  const isOpenFalloutSite = (index: number) => {
    const tile = tiles[index];
    return tile.terrain >= 2 && tile.elevation < 2 && tile.resource === 255 && tile.wonder === 255 && !tile.improvement
      && farFromStarts(index, policy.falloutStartBuffer);
  };
  // The authored DMZ is a broad theatre, not merely its centreline. If later
  // resource/site placement consumes every legal centreline tile, grow the
  // retained strategic region over adjacent lowland before applying its site
  // policy. This preserves ordinary counts and keeps fallout causally inside
  // the frontier instead of clearing unrelated value or inventing a site.
  if (fallout >= 0 && ![...theatre].some(isOpenFalloutSite)) {
    for (let radius = 0; radius < 3 && ![...theatre].some(isOpenFalloutSite); radius += 1) {
      expandTheatre();
    }
  }
  if (dmz) dmz.tileIndices = [...theatre].sort((one, two) => one - two);
  const reservedFalloutSites = new Set(
    fallout >= 0
      ? [...theatre].filter(isOpenFalloutSite).sort((one, two) => one - two).slice(0, 1)
      : [],
  );
  const relocateSites = (kind: NonNullable<Civ5Tile["improvement"]>, share: number, startDistance: number) => {
    const sites = tiles.flatMap((tile, index) => tile.improvement === kind ? [index] : []);
    const desired = Math.ceil(sites.length * share);
    const isCleanTheatreSite = (index: number) => {
      const tile = tiles[index];
      return theatre.has(index) && tile.terrain >= 2 && tile.elevation < 2 && tile.resource === 255 && tile.wonder === 255
        && tile.feature !== mapFeatures.indexOf("FEATURE_FALLOUT") && farFromStarts(index, startDistance)
        && sites.every((other) => other === index || distance(point(index), point(other)) >= policy.siteSpacing);
    };
    let retained = sites.filter(isCleanTheatreSite).length;
    if (!sites.length || retained >= desired) return 0;
    const sources = sites.filter((index) => !isCleanTheatreSite(index)).sort((one, two) => one - two);
    const targets = [...theatre].filter((index) => {
      const tile = tiles[index];
      return !reservedFalloutSites.has(index) && tile.terrain >= 2 && tile.elevation < 2 && tile.resource === 255 && tile.wonder === 255 && !tile.improvement
        && tile.feature !== mapFeatures.indexOf("FEATURE_FALLOUT") && farFromStarts(index, startDistance);
    }).sort((one, two) => one - two);
    let moved = 0;
    for (const source of sources) {
      if (retained >= desired) break;
      const targetPosition = targets.findIndex((candidate) => sites.every((other) => other === source || distance(point(candidate), point(other)) >= policy.siteSpacing));
      if (targetPosition < 0) continue;
      const destination = targets.splice(targetPosition, 1)[0];
      tiles[destination].improvement = kind;
      delete tiles[source].improvement;
      const sitePosition = sites.indexOf(source);
      if (sitePosition >= 0) sites[sitePosition] = destination;
      retained += 1;
      moved += 1;
    }
    return moved;
  };
  if (options.barbarianAbundance !== "NONE") result.movedBarbarians = relocateSites("IMPROVEMENT_BARBARIAN_CAMP", policy.barbarianShare, options.barbarianStartDistance);
  if (options.ruinAbundance !== "NONE") result.movedRuins = relocateSites("IMPROVEMENT_GOODY_HUT", policy.ruinShare, options.ruinStartDistance);

  if (fallout < 0) return result;
  const eligibleTheatre = [...theatre].filter((index) => {
    const tile = tiles[index];
    return tile.terrain >= 2 && tile.elevation < 2 && tile.resource === 255 && tile.wonder === 255 && !tile.improvement
      && farFromStarts(index, policy.falloutStartBuffer);
  });
  const desiredFallout = Math.min(policy.falloutMaximum, Math.max(1, Math.round(eligibleTheatre.length * policy.falloutDensity)));
  const falloutSites = tiles.flatMap((tile, index) => tile.feature === fallout ? [index] : []);
  let retainedFallout = falloutSites.filter((index) => theatre.has(index)
    && tiles[index].resource === 255 && tiles[index].wonder === 255 && !tiles[index].improvement
    && farFromStarts(index, policy.falloutStartBuffer)).length;
  for (const destination of eligibleTheatre.sort((one, two) => one - two)) {
    if (retainedFallout >= desiredFallout) break;
    if (tiles[destination].feature === fallout) continue;
    if (falloutSites.some((existing) => distance(point(destination), point(existing)) < policy.siteSpacing)) continue;
    tiles[destination].feature = fallout;
    falloutSites.push(destination);
    retainedFallout += 1;
    result.addedFallout += 1;
  }
  return result;
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
      {
        const greatSeas = map.structure?.objects.filter((object) => object.attributes?.nativeNarrative === true
          && object.attributes?.role === "GREAT_INLAND_SEA" && object.tileIndices.length >= Math.max(3, waterTiles * 0.025)).length ?? 0;
        const straits = map.structure?.objects.filter((object) => object.attributes?.nativeNarrative === true
          && object.attributes?.role === "NARROW_STRAIT").length ?? 0;
        const canalSites = map.structure?.objects.filter((object) => object.attributes?.nativeNarrative === true
          && object.attributes?.role === "CANAL_ISTHMUS").length ?? 0;
        const incidentalIslands = landSizes.slice(1).filter((size) => size < map.tiles.length * 0.02).length;
        const waterShare = waterTiles / Math.max(1, map.tiles.length);
        topologyScore = clamp((clamp(greatSeas / 2) + clamp(straits) + clamp(canalSites) + clamp(1 - incidentalIslands / 3) + clamp((waterShare - 0.55) / 0.13)) / 5);
        topologyEvidence = `${greatSeas} colossal inland-sea components, ${straits} narrow straits, ${canalSites} verified canal-isthmus sites, ${incidentalIslands} incidental small islands and ${Math.round(waterShare * 100)}% water remain in the final map.`;
      }
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
  const antiScore = skeleton.profileId === "ANCIENT_CRATONS" || skeleton.profileId === "SHATTERED_BASINS" ? topologyScore : clamp(regionFidelity * 0.5 + pathFidelity * 0.5);
  const antiMotifs = profile.forbiddenMotifs.map((motif) => finding(motif.id, `Avoid ${motif.label.toLowerCase()}`, antiScore, `Final-map sampling distinguishes the authored ${profile.topologyProgram.kind} program from ${motif.label.toLowerCase()}: ${Math.round(rawRegionFidelity * 100)}% direct region and ${Math.round(rawPathFidelity * 100)}% direct relationship expression.`));
  return { motifs, antiMotifs };
}

function polisNarrativeFindings(map: Civ5Map, profile: NarrativeProfile) {
  const graph = map.structure?.strategicGraph;
  if (!graph) return { motifs: profile.requiredMotifs.map((motif) => finding(motif.id, motif.label, 0, "The retained Polis strategic graph is missing.")), antiMotifs: profile.forbiddenMotifs.map((motif) => finding(motif.id, `Avoid ${motif.label.toLowerCase()}`, 0, "The retained Polis strategic graph is missing.")) };
  const majors = graph.nodes.filter((node) => node.kind === "MAJOR_START");
  const teams = new Set(majors.map((node) => node.team)).size;
  const objectives = graph.nodes.filter((node) => node.kind === "OBJECTIVE" || node.kind === "CONTESTED").length;
  const degree = majors.length ? graph.edges.length * 2 / majors.length : 0;
  const redundancy = graph.metrics.routeRedundancy ?? Math.max(0, graph.edges.length - majors.length + 1);
  const naval = graph.metrics.navalRoutes ?? 0;
  const land = graph.metrics.landRoutes ?? 0;
  const roles = new Set(graph.realmRoles.map((role) => role.role));
  const evidence = `${majors.length} starts, ${teams} realms, ${graph.edges.length} routes (${land} land and ${naval} naval), ${redundancy} redundant graph cycles, and ${objectives} contested objectives.`;
  let motifScores: number[];
  let antiScore = 0.86;
  switch (graph.mapType) {
    case "IMPERIAL_RING": {
      const feasibleDegree = Math.min(2.5, Math.max(1, majors.length - 1));
      motifScores = [land >= Math.max(1, majors.length - 1) ? 0.9 : land / Math.max(1, majors.length - 1), objectives >= 1 && degree >= feasibleDegree ? 0.9 : 0.55];
      antiScore = degree >= feasibleDegree ? 0.9 : 0.35;
      break;
    }
    case "OPPOSING_FRONTS": motifScores = [teams === 2 ? 1 : 0, graph.metrics.crossRealmRoutes >= 2 ? 0.95 : 0.35]; antiScore = graph.metrics.crossRealmRoutes >= 2 ? 0.95 : 0.2; break;
    case "CONTESTED_HEARTLAND": motifScores = [objectives >= 2 ? 0.95 : 0.55, degree >= 3 ? 0.92 : degree / 3]; antiScore = redundancy >= 2 ? 0.9 : 0.4; break;
    case "RIVAL_CONTINENTS": motifScores = [teams === 2 ? 1 : 0, graph.metrics.crossRealmRoutes >= 2 && naval >= 1 ? 0.95 : 0.5]; antiScore = graph.metrics.crossRealmRoutes >= 2 ? 0.92 : 0.25; break;
    case "THREE_REALMS": motifScores = [teams === 3 ? 1 : 0, graph.metrics.realmContactPairs >= 3 ? 1 : graph.metrics.realmContactPairs / 3]; antiScore = graph.metrics.realmContactPairs >= 3 ? 0.95 : 0.2; break;
    case "THALASSIC_LEAGUE": motifScores = [naval >= majors.length ? 0.95 : naval / Math.max(1, majors.length), redundancy >= Math.max(2, Math.floor(majors.length / 2)) ? 0.9 : 0.5]; antiScore = graph.metrics.minimumNodeDegree >= 2 ? 0.9 : 0.3; break;
    case "UNEQUAL_REALMS": motifScores = [roles.has("TALL") && roles.has("WIDE") && roles.has("WAR") && roles.has("TURTLE") ? 1 : roles.size / 4, graph.matchIntent.competitiveStrictness === "ASYMMETRIC" ? 0.95 : 0.78]; antiScore = graph.realmRoles.length >= 4 ? 0.92 : 0.3; break;
    default: motifScores = profile.requiredMotifs.map(() => 0.5);
  }
  return {
    motifs: profile.requiredMotifs.map((motif, index) => finding(motif.id, motif.label, motifScores[index] ?? motifScores.at(-1) ?? 0.5, evidence)),
    antiMotifs: profile.forbiddenMotifs.map((motif) => finding(motif.id, `Avoid ${motif.label.toLowerCase()}`, antiScore, evidence)),
  };
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
    const chainObjects = map.structure?.objects.filter((object) => object.attributes?.nativeNarrative === true && object.attributes?.role === "CHAIN") ?? [];
    const arcObjects = map.structure?.objects.filter((object) => object.attributes?.nativeNarrative === true && object.attributes?.role === "FOLLOWS_ARC") ?? [];
    const chainCount = chainObjects.length;
    const anchors = skeleton.regions.filter((region) => region.role === "ANCHOR");
    const narrativeLand = map.structure?.objects.filter((object) => object.kind === "NARRATIVE_REGION" && object.attributes?.role === "ANCHOR").reduce((sum, object) => sum + object.tileIndices.length, 0) ?? 0;
    const organizedComponents = new Set(chainObjects.flatMap((object) => object.tileIndices.map((index) => components.assignment[index]).filter((component) => component >= 0)));
    const structuredFamilies = Math.min(1, organizedComponents.size / Math.max(1, chainCount * 2));
    motifs.push(finding("parent-arcs", "Directional parent arcs", chainCount / 5, `${chainCount} retained parent systems with ${arcObjects.length} exact latent arcs.`, chainCount, "4–7"));
    motifs.push(finding("anchor-rhythm", "Anchor–satellite–gap rhythm", narrativeLand > anchors.length * 4 ? 0.9 : narrativeLand / Math.max(1, anchors.length * 4), `${anchors.length} anchors retain ${narrativeLand} land tiles.`, anchors.length, "1–3 per system"));
    motifs.push(finding("deep-chain-gaps", "Deep gaps between systems", map.tiles.filter((tile) => tile.terrain === 0).length / Math.max(1, map.tiles.filter((tile) => tile.terrain < 2).length), "Deep ocean remains the dominant water terrain between parent systems."));
    antiMotifs.push(finding("random-island-scatter", "Avoid independent random island scatter", structuredFamilies, `${organizedComponents.size} distinct island components participate in ${chainCount} exact parent families; ${components.count} total components include minor geographic punctuation.`));
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
  } else if (profile.engine === "POLIS") {
    const polis = polisNarrativeFindings(map, profile);
    motifs.push(...polis.motifs);
    antiMotifs.push(...polis.antiMotifs);
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
