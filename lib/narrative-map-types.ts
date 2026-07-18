import type { Civ5Map, Civ5StartLocation, Civ5Tile } from "./civ5-map.ts";
import { connectedTileObjects, type GenerationStructure, type GeographicObject } from "./generation-structure.ts";
import type { GenerationRecipe, WorldScale } from "./generation-recipe.ts";
import type { GenerationStyle, MapGenerationOptions, MapPresetId } from "./map-generator.ts";
import type { NarrativeAssessment, NarrativeFinding, NarrativeProfile, NarrativeProfileId, NarrativeSkeleton, NarrativeSkeletonRegion } from "./narrative-types.ts";

const ALL_SCALES: WorldScale[] = ["GLOBAL", "CONTINENTAL", "REGIONAL", "PROVINCIAL", "LOCAL"];
const BENCHMARKS = new Set<MapPresetId>(["LONELY_OCEANS", "SHATTERED_ARCHIPELAGO", "GREAT_WATERSHEDS", "ICEHOUSE_EARTH"]);

type ProfileSeed = Pick<NarrativeProfile, "id" | "label" | "engine" | "verb" | "premise" | "requiredMotifs" | "forbiddenMotifs" | "nearestConfusions" | "blindRecognition"> & Partial<Omit<NarrativeProfile, "schemaVersion" | "id" | "label" | "engine" | "verb" | "premise" | "requiredMotifs" | "forbiddenMotifs" | "nearestConfusions" | "blindRecognition">>;

function profile(seed: ProfileSeed): NarrativeProfile {
  const implementation = seed.id === "THREE_REALMS" || seed.id === "THALASSIC_LEAGUE" || seed.id === "UNEQUAL_REALMS" ? "FUTURE_RUNTIME" : BENCHMARKS.has(seed.id as MapPresetId) ? "BENCHMARK" : "PROFILE_ONLY";
  const water = seed.parameterEnvelope?.water ?? [15, 80] as const;
  const mountains = seed.parameterEnvelope?.mountains ?? [4, 28] as const;
  return {
    schemaVersion: 1,
    implementation,
    preferredScales: seed.preferredScales ?? ["GLOBAL", "CONTINENTAL", "REGIONAL"],
    allowedScales: seed.allowedScales ?? [...ALL_SCALES],
    parameterEnvelope: { water, mountains, preferredWater: seed.parameterEnvelope?.preferredWater ?? Math.round((water[0] + water[1]) / 2), preferredMountains: seed.parameterEnvelope?.preferredMountains ?? Math.round((mountains[0] + mountains[1]) / 2), preferredRiverDensity: seed.parameterEnvelope?.preferredRiverDensity },
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
export function benchmarkNarrative(id: MapPresetId) { return BENCHMARKS.has(id); }

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
  } else {
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
  const regions: GeographicObject[] = skeleton.regions.map((region) => ({ id: `narrative-${region.id}`, name: region.id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), kind: region.role === "ICE_SHEET" ? "ICE_SHEET" : region.role === "REFUGE" ? "REFUGE" : "NARRATIVE_REGION", tileIndices: landMask.flatMap((land, index) => land && tileDistance(index, region, width, height, wraps) <= region.radius ? [index] : []), attributes: { role: region.role, parent: region.parentId ?? "", priority: region.priority } }));
  const paths: GeographicObject[] = skeleton.relationships.filter((relationship) => relationship.points.length).map((relationship) => ({ id: `narrative-${relationship.id}`, name: relationship.id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), kind: "NARRATIVE_PATH", tileIndices: relationship.points.map((point) => Math.min(width * height - 1, Math.max(0, Math.floor(point.y * height) * width + Math.min(width - 1, Math.floor(point.x * width))))), attributes: { relationship: relationship.kind, from: relationship.from, to: relationship.to, strength: relationship.strength } }));
  return [...regions, ...paths].filter((object) => object.tileIndices.length);
}

function rebuildTopologyObjects(structure: GenerationStructure, landMask: boolean[], width: number, height: number, wraps: boolean) {
  const replacedKinds = new Set(["CONTINENT", "OCEAN_BASIN", "INLAND_SEA", "LAKE", "ARCHIPELAGO", "BAY", "CAPE", "STRAIT"]);
  return [
    ...structure.objects.filter((object) => !replacedKinds.has(object.kind)).map((object) => ({ ...object, tileIndices: object.tileIndices.filter((index) => index >= 0 && index < landMask.length && (object.kind === "CLIMATE_REGION" || object.kind === "BIOME_COLLECTION" ? landMask[index] : true)) })).filter((object) => object.tileIndices.length),
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
  }

  const tiles = geography.tiles.map((source, index): Civ5Tile => {
    const land = landMask[index];
    const adjacentLand = connectedNeighbors(index, width, height, wraps).some((neighbor) => landMask[neighbor]);
    const tile = { ...source, elevation: land ? elevations[index] : 0, continent: land ? source.continent || 1 : 0 };
    if (!land) { tile.terrain = adjacentLand ? 1 : 0; tile.feature = skeleton.profileId === "ICEHOUSE_EARTH" && (temperatures?.[index] ?? 1) < 0.12 ? 3 : 255; tile.resource = 255; tile.resourceAmount = 0; tile.wonder = 255; tile.river = 0; return tile; }
    if (source.terrain < 2) tile.terrain = 3;
    if (skeleton.profileId === "GREAT_WATERSHEDS") {
      const downstream = skeleton.relationships.filter((item) => item.kind === "FLOWS_TO" && item.strength >= 0.9).some((relationship) => relationship.points.slice(Math.floor(relationship.points.length * 0.58)).some((point) => tileDistance(index, { ...point, radius: 0 }, width, height, wraps) < 0.026));
      if (downstream && tile.elevation === 0) { tile.terrain = index % 3 ? 2 : 3; tile.feature = index % 4 ? 2 : 255; }
    }
    if (skeleton.profileId === "ICEHOUSE_EARTH" && temperatures) {
      const temperature = temperatures[index];
      tile.terrain = temperature < 0.15 ? 6 : temperature < 0.31 ? 5 : temperature < 0.43 ? 3 : 2;
      tile.feature = tile.elevation === 2 || tile.terrain === 6 ? 255 : temperature < 0.38 && moistures[index] > 0.46 && index % 5 === 0 ? 0 : tile.feature === 1 ? 255 : tile.feature;
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
