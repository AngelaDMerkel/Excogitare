import type { Civ5Map, Civ5StartLocation, Civ5Tile } from "./civ5-map.ts";
import { buildNativeFieldLandform, NATIVE_LANDFORM_VERSION } from "./native-landforms.ts";
import type { ClimateProjection } from "./climate-projection.ts";
import { featurePlacementVerdict, resourcePlacementVerdict, wonderPlacementVerdict } from "./civ5-rules.ts";
import { appendEngineNarrativeEvidence, captureEngineNarrativeStage, compareEngineNarrativeStages, createEngineNarrativeEvidence, observableFromMap, snapshotEngineNarrativeStage, type EngineNarrativeEvidence, type EngineNarrativeObservable, type EngineNarrativeStageName, type EngineNarrativeStageSnapshot } from "./engine-narrative-diagnostics.ts";
import { attachRiverSystems, attachSemanticIdentities, connectedLinearFeatures, connectedTileObjects, markGenerationStructureStale, type GenerationStructure, type GeographicObject } from "./generation-structure.ts";
import { generatePhysicalGeography, retainRealizedPhysicalHydrology } from "./physical-generator.ts";
import { generatePolisGeography } from "./polis-generator.ts";
import { generateEccentricGeography } from "./eccentric-generator.ts";
import { clearRiverEdge, reconstructCiv5RiverEdgeSystems, riverEdgeDefinitions, setRiverEdge, type RiverEdgeBit } from "./rivers.ts";
import { MINIMUM_START_DISTANCE } from "./start-locations.ts";
import { worldCharacterProfile } from "./world-character.ts";
import { applyArchetypeContentEcology, applyWorldArchetype, randomCompatibleArchetype } from "./world-archetype.ts";
import { generationOptionsFromRecipe, generationRecipeFromOptions, type GenerationRecipe, type WorldScale } from "./generation-recipe.ts";
import { scaledPoleProximity, worldScaleProfile } from "./world-scale.ts";
import { GENERATION_PASS_DEFINITIONS, GenerationPassSession, effortCandidateCount, generationPassEvidence, type GenerationControl, type GenerationProgressListener } from "./generation-pass-graph.ts";
import { applyNarrativeBrutalFrontierContent, applyNarrativeCityStateContestability, applyNarrativeContent, applyNarrativeRiverValleyContent, attachNarrativeAssessment, attachNarrativeStructure, compileNarrativeSkeleton, narrativeCandidateScore, narrativeProfile } from "./narrative-map-types.ts";
import { attachMatchIntentAssessment } from "./match-intent.ts";
import { applyConstrainedLandBudget, applyConstrainedRelief, applyConstrainedSurface, constraintMatchesDimensions, nativeConstraintDiagnostics, type GenerationConstraintPayload } from "./generation-constraints.ts";
import { compileCatalogueNarrativeProgram } from "./narrative-program-catalogue.ts";
import { compileNarrativeAdapterPlan, narrativeInfluenceStrength, type NarrativeAdapterEvidence, type NarrativeFieldSource, type NarrativePathReservation } from "./narrative-engine-adapters.ts";
import { narrativeNativeContract, type NarrativeGenerativeContract, type NarrativeNativeRelaxationStep } from "./narrative-native-contracts.ts";
import { evaluateNarrativeConstraintProgram, extractNarrativeSemantics } from "./narrative-semantics.ts";
import { evaluateNarrativeNativeEvidence } from "./narrative-native-evidence.ts";
import { evaluateNarrativeContentEvidence } from "./narrative-content-evidence.ts";
import { evaluateNarrativeNaturalism, reconcileNarrativeNaturalismSurface } from "./narrative-naturalism.ts";
import { validateCiv5Map } from "./map-analysis.ts";

export const MAP_SIZES = [
  { id: "DUEL", label: "Duel", width: 40, height: 24, recommendedPlayers: 2, recommendedCityStates: 2, gameBreaking: false },
  { id: "TINY", label: "Tiny", width: 56, height: 36, recommendedPlayers: 4, recommendedCityStates: 4, gameBreaking: false },
  { id: "SMALL", label: "Small", width: 66, height: 42, recommendedPlayers: 6, recommendedCityStates: 6, gameBreaking: false },
  { id: "STANDARD", label: "Standard", width: 80, height: 52, recommendedPlayers: 8, recommendedCityStates: 8, gameBreaking: false },
  { id: "LARGE", label: "Large", width: 104, height: 64, recommendedPlayers: 10, recommendedCityStates: 10, gameBreaking: false },
  { id: "HUGE", label: "Huge", width: 128, height: 80, recommendedPlayers: 12, recommendedCityStates: 12, gameBreaking: false },
  { id: "EXTREME", label: "Extreme", width: 180, height: 94, recommendedPlayers: 20, recommendedCityStates: 20, gameBreaking: true },
  { id: "COLOSSAL", label: "Colossal", width: 170, height: 110, recommendedPlayers: 22, recommendedCityStates: 22, gameBreaking: true },
] as const;

export type MapSizeId = (typeof MAP_SIZES)[number]["id"];
export const GAME_BREAKING_MAP_SIZES = ["EXTREME", "COLOSSAL"] as const satisfies ReadonlyArray<MapSizeId>;
export const SAFE_MAP_SIZES = ["DUEL", "TINY", "SMALL", "STANDARD", "LARGE", "HUGE"] as const satisfies ReadonlyArray<MapSizeId>;
export function isGameBreakingMapSize(size: MapSizeId) {
  return (GAME_BREAKING_MAP_SIZES as ReadonlyArray<MapSizeId>).includes(size);
}
export type MapPresetId =
  | "CONTINENTS"
  | "PANGAEA"
  | "ARCHIPELAGO"
  | "INLAND_SEAS"
  | "EARTHSEA"
  | "RIFT_REALMS"
  | "LABYRINTH"
  | "WILD_REGIONS"
  | "LIVING_WORLD"
  | "TECTONIC_CONTINENTS"
  | "GREAT_WATERSHEDS"
  | "SHATTERED_BASINS"
  | "MYTHIC_REGIONS"
  | "ENCIRCLING_LANDS"
  | "ASTRAL_PANGAEA"
  | "RIFTWORLD"
  | "LONELY_OCEANS"
  | "PENINSULA_REALM"
  | "SHATTERED_ARCHIPELAGO"
  | "DYNAMIC_EARTH"
  | "COLLIDING_PLATES"
  | "ANCIENT_CRATONS"
  | "ISLAND_ARC_EARTH"
  | "SUPERCONTINENT_INTERIOR"
  | "MONSOON_CONTINENTS"
  | "ICEHOUSE_EARTH"
  | "IMPERIAL_RING"
  | "OPPOSING_FRONTS"
  | "CONTESTED_HEARTLAND"
  | "RIVAL_CONTINENTS"
  | "THREE_REALMS"
  | "THALASSIC_LEAGUE"
  | "UNEQUAL_REALMS";
export type MultiplayerBalance = "STANDARD" | "TOURNAMENT" | "TEAMS";
export type TeamLayout = "CLUSTERED" | "FRONTLINES" | "DISTRIBUTED";
export type ClimateSetting = "COOL" | "TEMPERATE" | "HOT";
export type RainfallSetting = "ARID" | "NORMAL" | "WET";
export type WorldAgeSetting = "YOUNG" | "NORMAL" | "OLD";
export type StartQuality = "STANDARD" | "BALANCED" | "LEGENDARY";
export type WorldModifier = "NONE" | "FANTASTICAL" | "STRATEGIC_DEPTH" | "FRACTURED" | "DOOMSDAY";
export type GenerationStyle = "REALISTIC" | "FANTASTICAL" | "MUNDANE" | "BRUTAL";
export type DominantTerrain = "GRASSLAND" | "PLAINS" | "DESERT" | "TUNDRA";
export type WrapType = "PRESET" | "EAST_WEST" | "NONE";
export type MapGeometry =
  | "STANDARD"
  | "TALL"
  | "WIDE"
  | "NEEDLE"
  | "RIBBON"
  | "PIN"
  | "STRING"
  | "SQUARE";
export const GAME_BREAKING_GEOMETRIES = ["NEEDLE", "RIBBON", "PIN", "STRING"] as const satisfies ReadonlyArray<MapGeometry>;
export const SAFE_MAP_GEOMETRIES = ["STANDARD", "TALL", "WIDE", "SQUARE"] as const satisfies ReadonlyArray<MapGeometry>;
export function isGameBreakingGeometry(geometry: MapGeometry) {
  return (GAME_BREAKING_GEOMETRIES as ReadonlyArray<MapGeometry>).includes(geometry);
}
export type AbundanceSetting = "SCARCE" | "STANDARD" | "ABUNDANT";
export type ResourceDistribution = "EVEN" | "REGIONAL" | "CLUSTERED";
export type CoastalPreference = "ANY" | "PREFER" | "REQUIRE";
export type SiteAbundance = "NONE" | "SCARCE" | "STANDARD" | "RAGING";
export type GenerationEngine = "EXCOGITARE" | "ECCENTRIC" | "PHYSICAL" | "POLIS";
export type RegionGranularity = "LOW" | "FAIR" | "HIGH" | "VERY_HIGH";
export type RegionContrast = "BLENDED" | "VARIED" | "EXTREME";
export type Fantasticality = "RESTRAINED" | "MYTHIC" | "UNBOUND";
export type RegionClimateLogic = "LAWLESS" | "INFLUENCED" | "ORDERED";
export type EccentricExtreme = "NONE" | "SNOWBALL" | "JURASSIC" | "ARRAKIS" | "ARBOREA";
export type RiverDensity = "SPARSE" | "NORMAL" | "DENSE";
export type PlateActivity = "QUIET" | "NORMAL" | "VIOLENT";
export type ErosionStrength = "LIGHT" | "MODERATE" | "STRONG";
export type PhysicalRotation = "PROGRADE" | "RETROGRADE";
export type PhysicalSeasonality = "MILD" | "EARTHLIKE" | "EXTREME";
export type PhysicalOceanInfluence = "WEAK" | "NORMAL" | "STRONG";
export type PolisConflictPattern = "RADIAL" | "OPPOSING_FRONTS" | "CROSSROADS" | "RIVAL_CONTINENTS";
export type PolisSymmetry = "EQUIVALENT" | "MIRRORED" | "ROTATIONAL" | "ASYMMETRIC";
export type PolisExpansionPressure = "RELAXED" | "STANDARD" | "IMMEDIATE";
export type PolisNavalImportance = "LOW" | "BALANCED" | "HIGH";

export function resolveMapDimensions(sizeId: MapSizeId, geometry: MapGeometry) {
  const size = MAP_SIZES.find((item) => item.id === sizeId) ?? MAP_SIZES[3];
  if (geometry === "STANDARD") return { width: size.width, height: size.height };
  const area = size.width * size.height;
  if (geometry === "SQUARE") {
    const side = Math.max(16, Math.round(Math.sqrt(area)));
    return { width: side, height: side };
  }
  const ratio =
    geometry === "TALL"
      ? 0.4
      : geometry === "WIDE"
        ? 4
        : geometry === "NEEDLE"
          ? 1 / 12
          : geometry === "PIN"
            ? 1 / 40
            : geometry === "STRING"
              ? 40
              : 12;
  const minimumDimension = geometry === "PIN" || geometry === "STRING" ? 4 : geometry === "NEEDLE" || geometry === "RIBBON" ? 8 : 16;
  const width = Math.max(minimumDimension, Math.round(Math.sqrt(area * ratio)));
  const height = Math.max(minimumDimension, Math.round(area / width));
  return { width, height };
}

export function estimateGenerationResources(options: Pick<MapGenerationOptions, "size" | "geometry" | "engine" | "preset">, effort: GenerationRecipe["effort"]) {
  const dimensions = resolveMapDimensions(options.size, options.geometry);
  const tileCount = dimensions.width * dimensions.height;
  const candidates = effortCandidateCount(effort);
  const maximumNarrativeRetries = narrativeNativeContract(options.preset).relaxationPolicy.length;
  const retryCandidates = effort === "EXHAUSTIVE" ? 2 : 1;
  const maximumCandidateEvaluations = candidates + maximumNarrativeRetries * retryCandidates;
  const runtimeBaselineBytes = 200 * 1024 * 1024;
  const engineWorkingBytesPerTile = options.engine === "PHYSICAL" ? 18 * 1024 : options.engine === "ECCENTRIC" ? 14 * 1024 : 12 * 1024;
  const effortWorkingBytesPerTile = effort === "EXHAUSTIVE" ? 2 * 1024 : effort === "THOROUGH" ? 1024 : 0;
  // Candidate selection streams one complete candidate at a time, so its
  // deterministic evaluation count is a time cost rather than a multiplier on
  // resident maps. This is a conservative process working-set envelope,
  // calibrated against Node RSS observations (roughly 300 MB for Huge and
  // 409 MB for Colossal Excogitare maps), not an exact JavaScript heap limit.
  // Browser/container baselines and garbage-collection timing will vary.
  const estimatedPeakBytes = runtimeBaselineBytes + tileCount * (engineWorkingBytesPerTile + effortWorkingBytesPerTile);
  const estimatedPeakMegabytes = Math.max(1, Math.ceil(estimatedPeakBytes / 1024 / 1024));
  const risk = estimatedPeakMegabytes >= 512 ? "HIGH" : estimatedPeakMegabytes >= 320 ? "ELEVATED" : "NORMAL";
  return {
    dimensions,
    tileCount,
    candidates,
    maximumNarrativeRetries,
    maximumCandidateEvaluations,
    estimatedPeakBytes,
    estimatedPeakMegabytes,
    risk,
    warning: (options.size === "COLOSSAL" || options.size === "EXTREME") && effort === "EXHAUSTIVE"
      ? `Experimental ${dimensions.width}×${dimensions.height} generation starts with ${candidates} candidates and may perform up to ${maximumCandidateEvaluations} total evaluations if authored narrative retries are needed. Its conservative process working-set envelope is about ${estimatedPeakMegabytes} MB; actual browser and container peaks vary.`
      : undefined,
  } as const;
}

export const DOMINANT_TERRAINS: ReadonlyArray<{ id: DominantTerrain; label: string }> = [
  { id: "GRASSLAND", label: "Grassland" },
  { id: "PLAINS", label: "Plains" },
  { id: "DESERT", label: "Desert" },
  { id: "TUNDRA", label: "Tundra" },
];

export const MAP_PRESETS: ReadonlyArray<{ id: MapPresetId; label: string; description: string; water: number; mountains: number; engine: GenerationEngine; climateRealism?: boolean; riverDensity?: RiverDensity; plateActivity?: PlateActivity; erosionStrength?: ErosionStrength; worldAge?: WorldAgeSetting; climate?: ClimateSetting; rainfall?: RainfallSetting; physicalRotation?: PhysicalRotation; physicalSeasonality?: PhysicalSeasonality; physicalOceanInfluence?: PhysicalOceanInfluence }> = [
  { id: "CONTINENTS", label: "Crooked Continents", description: "Asymmetric continents whose fjords, inland seas, hooks, and difficult interiors make exploration unpredictable.", water: 58, mountains: 12, engine: "EXCOGITARE" },
  { id: "PANGAEA", label: "Broken Pangaea", description: "One dominant landmass cleaved by gulfs, rifts, and difficult interiors.", water: 46, mountains: 14, engine: "EXCOGITARE" },
  { id: "ARCHIPELAGO", label: "Drowned Shelves", description: "Compact island mosaics preserve the shallow-water outlines, uplands, and ridges of recently submerged continents.", water: 72, mountains: 9, engine: "EXCOGITARE" },
  { id: "INLAND_SEAS", label: "Lake Kingdoms", description: "Broad terrestrial kingdoms are organized around hierarchical lakes, enclosed seas, and endorheic drainage.", water: 24, mountains: 13, engine: "EXCOGITARE" },
  { id: "EARTHSEA", label: "Island Continents", description: "Substantial island homelands with real interiors, satellites, and consequential voyages form distinct maritime realms.", water: 64, mountains: 11, engine: "EXCOGITARE" },
  { id: "RIFT_REALMS", label: "Deep-Ocean Divides", description: "A few monumental ocean barriers gate otherwise substantial navigation basins until Astronomy.", water: 61, mountains: 15, engine: "EXCOGITARE" },
  { id: "LABYRINTH", label: "Land and Sea Maze", description: "Irregular chambers and tortuous land and water corridors make navigation the central geographic problem.", water: 43, mountains: 18, engine: "EXCOGITARE" },
  { id: "WILD_REGIONS", label: "Patchwork Provinces", description: "Contrasting provinces obey different composed geographic, ecological, and economic rules.", water: 55, mountains: 16, engine: "EXCOGITARE" },
  { id: "LIVING_WORLD", label: "Ecological Transect", description: "One connected landscape tells a causal environmental story through broad, realistic transitions.", water: 58, mountains: 14, engine: "ECCENTRIC", climateRealism: true },
  { id: "TECTONIC_CONTINENTS", label: "Plate-Built Continents", description: "Each continent records a different authored geological history in its margins, ranges, rifts, and interior.", water: 56, mountains: 19, engine: "ECCENTRIC", climateRealism: true },
  { id: "GREAT_WATERSHEDS", label: "Great Watersheds", description: "Land-heavy river basins, inland lakes, wet lowlands, and mountain-fed drainage systems.", water: 35, mountains: 15, engine: "ECCENTRIC", climateRealism: true, riverDensity: "DENSE" },
  { id: "SHATTERED_BASINS", label: "Inland Sea Crossroads", description: "Colossal inland seas crowd scarce land against the margins while Bosporus-like straits and one-tile canal isthmuses control movement.", water: 74, mountains: 8, engine: "ECCENTRIC", climateRealism: true },
  { id: "MYTHIC_REGIONS", label: "Wonder Heartlands", description: "A few monumental regions concentrate wonders, valuable resources, and fertile country inside poor or difficult marches.", water: 52, mountains: 17, engine: "ECCENTRIC", climateRealism: false },
  { id: "ENCIRCLING_LANDS", label: "Encircled Seas", description: "A continuous outer land journey surrounds hierarchical inland seas, islands, and inward-facing water kingdoms.", water: 22, mountains: 15, engine: "ECCENTRIC", climateRealism: false },
  { id: "ASTRAL_PANGAEA", label: "Scarred Pangaea", description: "One immense continent is reorganized by branching alien scars, incompatible marches, and broad surviving sutures.", water: 43, mountains: 18, engine: "ECCENTRIC", climateRealism: false },
  { id: "RIFTWORLD", label: "Rift Lattice", description: "A hierarchical network of authoritative deep-water fractures defines unequal cells containing viable local worlds.", water: 61, mountains: 16, engine: "ECCENTRIC", climateRealism: false },
  { id: "LONELY_OCEANS", label: "Lonely Oceans", description: "Vast empty oceans isolate scarce but viable island realms until Astronomy changes the political world.", water: 89, mountains: 7, engine: "ECCENTRIC", climateRealism: false },
  { id: "PENINSULA_REALM", label: "Great Peninsulas", description: "Complete Florida- and Italy-like provinces project from one bounded continental framework between deep gulfs and estuaries.", water: 39, mountains: 17, engine: "ECCENTRIC", climateRealism: false },
  { id: "SHATTERED_ARCHIPELAGO", label: "Broken Island Chains", description: "Directional necklaces, crescents, branches, and parallel arcs preserve visible ancestry among anchor islands and satellites.", water: 78, mountains: 16, engine: "ECCENTRIC", climateRealism: false },
  { id: "DYNAMIC_EARTH", label: "Dynamic Earth", description: "Moving plates, mixed continental crust, convergent ranges, rifts, erosion, and coupled climate.", water: 62, mountains: 15, engine: "PHYSICAL", climateRealism: true, plateActivity: "NORMAL", erosionStrength: "MODERATE", worldAge: "NORMAL" },
  { id: "COLLIDING_PLATES", label: "Colliding Plates", description: "Young, active continents dominated by collision belts, high ranges, rain shadows, and difficult interiors.", water: 54, mountains: 23, engine: "PHYSICAL", climateRealism: true, plateActivity: "VIOLENT", erosionStrength: "LIGHT", worldAge: "YOUNG" },
  { id: "ANCIENT_CRATONS", label: "Ancient Continental Shields", description: "Old eroded shields, ghost ranges, mature rivers, fertile basins, and exposed mineral cores record deep time.", water: 48, mountains: 8, engine: "PHYSICAL", climateRealism: true, plateActivity: "QUIET", erosionStrength: "STRONG", worldAge: "OLD", rainfall: "WET" },
  { id: "ISLAND_ARC_EARTH", label: "Volcanic Island Arcs", description: "Rugged strings of volcanic pearls curve around sheltered seas and age toward eroded anchors and drowned atolls.", water: 74, mountains: 18, engine: "PHYSICAL", climateRealism: true, plateActivity: "VIOLENT", erosionStrength: "MODERATE", worldAge: "YOUNG", rainfall: "WET", physicalOceanInfluence: "STRONG" },
  { id: "SUPERCONTINENT_INTERIOR", label: "Inland Supercontinent", description: "A dominant continent encloses a great interior sea fed by inward drainage and framed by broken peripheral highlands.", water: 30, mountains: 17, engine: "PHYSICAL", climateRealism: true, plateActivity: "NORMAL", erosionStrength: "MODERATE", worldAge: "NORMAL", rainfall: "ARID", physicalOceanInfluence: "WEAK" },
  { id: "MONSOON_CONTINENTS", label: "Monsoon Continents", description: "Seasonal thermal contrast draws ocean moisture across warm coasts and into rain-shadowed continental interiors.", water: 57, mountains: 15, engine: "PHYSICAL", climateRealism: true, plateActivity: "NORMAL", erosionStrength: "MODERATE", worldAge: "NORMAL", climate: "HOT", rainfall: "WET", physicalSeasonality: "EXTREME", physicalOceanInfluence: "STRONG" },
  { id: "ICEHOUSE_EARTH", label: "Glacial World", description: "Ice consumes most of the world while valuable frozen frontiers compel expansion beyond a few temperate refuges.", water: 40, mountains: 15, engine: "PHYSICAL", climateRealism: true, plateActivity: "QUIET", erosionStrength: "STRONG", worldAge: "OLD", climate: "COOL", physicalSeasonality: "EXTREME" },
  { id: "IMPERIAL_RING", label: "Imperial Ring", description: "Civilizations surround a contested interior with neighboring fronts, radial approaches, and deliberately shared objectives.", water: 34, mountains: 16, engine: "POLIS", climateRealism: false },
  { id: "OPPOSING_FRONTS", label: "Opposing Fronts", description: "Players or teams occupy defended sides of the world, separated by several readable invasion corridors.", water: 28, mountains: 20, engine: "POLIS", climateRealism: false },
  { id: "CONTESTED_HEARTLAND", label: "Contested Heartland", description: "Safe starting territories open toward a valuable central crossroads with multiple flanking routes.", water: 22, mountains: 18, engine: "POLIS", climateRealism: false },
  { id: "RIVAL_CONTINENTS", label: "Rival Continents", description: "Balanced continental blocs face one another across naval lanes, islands, and a small number of strategic crossings.", water: 54, mountains: 14, engine: "POLIS", climateRealism: false },
  { id: "THREE_REALMS", label: "Three Realms", description: "Three strategic realms each border both rivals and compete through shared theatres shaped by the intended victories.", water: 32, mountains: 16, engine: "POLIS", climateRealism: false },
  { id: "THALASSIC_LEAGUE", label: "Thalassic League", description: "Coastal powers contest a redundant network of ports, sea lanes, islands, and diplomatically valuable city states.", water: 62, mountains: 12, engine: "POLIS", climateRealism: false },
  { id: "UNEQUAL_REALMS", label: "Unequal Realms", description: "Deliberately asymmetric Tall, Wide, War, and Turtle territories create different but viable strategic obligations.", water: 34, mountains: 17, engine: "POLIS", climateRealism: false },
];

export function polisPatternForPreset(preset: MapPresetId): PolisConflictPattern {
  if (preset === "OPPOSING_FRONTS") return "OPPOSING_FRONTS";
  if (preset === "CONTESTED_HEARTLAND") return "CROSSROADS";
  if (preset === "RIVAL_CONTINENTS") return "RIVAL_CONTINENTS";
  if (preset === "THREE_REALMS" || preset === "UNEQUAL_REALMS") return "CROSSROADS";
  if (preset === "THALASSIC_LEAGUE") return "RIVAL_CONTINENTS";
  return "RADIAL";
}

export function fantasticalityForPreset(preset: MapPresetId): Fantasticality {
  if (["MYTHIC_REGIONS", "ASTRAL_PANGAEA", "RIFTWORLD", "LONELY_OCEANS", "PENINSULA_REALM", "SHATTERED_ARCHIPELAGO"].includes(preset)) return "UNBOUND";
  if (["LIVING_WORLD", "TECTONIC_CONTINENTS"].includes(preset)) return "RESTRAINED";
  return "MYTHIC";
}

export const WORLD_MODIFIERS: ReadonlyArray<{ id: WorldModifier; label: string; description: string }> = [
  { id: "NONE", label: "None", description: "Use the selected map type without an additional world rule." },
  { id: "STRATEGIC_DEPTH", label: "Strategic Depth", description: "Builds long mountain systems, narrow passes, defended basins, and invasion corridors." },
  { id: "FRACTURED", label: "Fractured World", description: "Breaks land and water into smaller contested regions with abundant chokepoints." },
  { id: "DOOMSDAY", label: "Doomsday", description: "Creates scarred highlands, sparse fallout, ruined cities, and fragments of an abandoned road network." },
];

export type MapGenerationOptions = {
  projectionType: ClimateProjection;
  engine: GenerationEngine;
  preset: MapPresetId;
  size: MapSizeId;
  seed: string;
  players: number;
  cityStates: number;
  balance: MultiplayerBalance;
  teamSize: 2 | 3 | 4;
  teamLayout: TeamLayout;
  strategicBalance: boolean;
  style: GenerationStyle;
  startQuality: StartQuality;
  modifier: WorldModifier;
  wrapType: WrapType;
  geometry: MapGeometry;
  waterPercent: number;
  mountainPercent: number;
  dominantTerrains: DominantTerrain[];
  climate: ClimateSetting;
  rainfall: RainfallSetting;
  worldAge: WorldAgeSetting;
  bonusAbundance: AbundanceSetting;
  luxuryAbundance: AbundanceSetting;
  luxuryRegional: boolean;
  luxuryStartGuarantee: boolean;
  strategicAbundance: AbundanceSetting;
  strategicDistribution: ResourceDistribution;
  strategicStartGuarantee: boolean;
  offshoreOilPercent: number;
  wonderCount: number;
  wonderMinSpacing: number;
  wonderStartBuffer: number;
  cityStateMinSpacing: number;
  cityStateDistribution: "EVEN" | "REGIONAL";
  cityStateCoastalPreference: CoastalPreference;
  barbarianAbundance: SiteAbundance;
  barbarianStartDistance: number;
  ruinAbundance: SiteAbundance;
  ruinStartDistance: number;
  granularity: RegionGranularity;
  oceanBasins: number;
  landAtPoles: boolean;
  climateRealism: boolean;
  regionContrast: RegionContrast;
  fantasticality: Fantasticality;
  regionClimateLogic: RegionClimateLogic;
  eccentricExtreme: EccentricExtreme;
  coastalRangePercent: number;
  riverDensity: RiverDensity;
  plateActivity: PlateActivity;
  erosionStrength: ErosionStrength;
  physicalRotation: PhysicalRotation;
  physicalSeasonality: PhysicalSeasonality;
  physicalOceanInfluence: PhysicalOceanInfluence;
  polisConflictPattern: PolisConflictPattern;
  polisSymmetry: PolisSymmetry;
  polisExpansionPressure: PolisExpansionPressure;
  polisNavalImportance: PolisNavalImportance;
  polisChokepointDensity: number;
  polisContestedResourcePercent: number;
  polisSafeRadius: number;
};

export const DEFAULT_GENERATION_OPTIONS: MapGenerationOptions = {
  projectionType: "NORTH_SOUTH",
  engine: "EXCOGITARE",
  preset: "WILD_REGIONS",
  size: "STANDARD",
  seed: "excogitare",
  players: 8,
  cityStates: 8,
  balance: "STANDARD",
  teamSize: 2,
  teamLayout: "CLUSTERED",
  strategicBalance: false,
  style: "FANTASTICAL",
  startQuality: "BALANCED",
  modifier: "NONE",
  wrapType: "PRESET",
  geometry: "STANDARD",
  waterPercent: 55,
  mountainPercent: 16,
  dominantTerrains: [],
  climate: "TEMPERATE",
  rainfall: "NORMAL",
  worldAge: "NORMAL",
  bonusAbundance: "STANDARD",
  luxuryAbundance: "STANDARD",
  luxuryRegional: false,
  luxuryStartGuarantee: true,
  strategicAbundance: "STANDARD",
  strategicDistribution: "EVEN",
  strategicStartGuarantee: true,
  offshoreOilPercent: 25,
  wonderCount: 5,
  wonderMinSpacing: 8,
  wonderStartBuffer: 5,
  cityStateMinSpacing: MINIMUM_START_DISTANCE,
  cityStateDistribution: "EVEN",
  cityStateCoastalPreference: "ANY",
  barbarianAbundance: "STANDARD",
  barbarianStartDistance: 5,
  ruinAbundance: "STANDARD",
  ruinStartDistance: 3,
  granularity: "FAIR",
  oceanBasins: 2,
  landAtPoles: true,
  climateRealism: false,
  regionContrast: "VARIED",
  fantasticality: "MYTHIC",
  regionClimateLogic: "LAWLESS",
  eccentricExtreme: "NONE",
  coastalRangePercent: 45,
  riverDensity: "NORMAL",
  plateActivity: "NORMAL",
  erosionStrength: "MODERATE",
  physicalRotation: "PROGRADE",
  physicalSeasonality: "EARTHLIKE",
  physicalOceanInfluence: "NORMAL",
  polisConflictPattern: "RADIAL",
  polisSymmetry: "EQUIVALENT",
  polisExpansionPressure: "STANDARD",
  polisNavalImportance: "BALANCED",
  polisChokepointDensity: 55,
  polisContestedResourcePercent: 35,
  polisSafeRadius: 4,
};

function randomItem<T>(items: readonly T[], random: () => number) {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

export function randomGenerationOptions(random: () => number = Math.random, includeGameBreakingOptions = false): MapGenerationOptions {
  const style = randomItem(["REALISTIC", "FANTASTICAL", "MUNDANE", "BRUTAL"] as const, random);
  const presetConfig = randomItem(MAP_PRESETS.filter((preset) => preset.id !== "UNEQUAL_REALMS"), random);
  const preset = presetConfig.id;
  const sizeConfig = randomItem(MAP_SIZES.filter((size) => includeGameBreakingOptions || !size.gameBreaking), random);
  const size = sizeConfig.id;
  const modifier = randomItem(WORLD_MODIFIERS, random).id;
  const minimumMountains = modifier === "STRATEGIC_DEPTH" ? 22 : modifier === "DOOMSDAY" ? 18 : worldCharacterProfile(style).mountainFloor;
  const narrative = narrativeProfile(preset);
  const waterMinimum = Math.min(90, narrative.parameterEnvelope.water[0]);
  const waterMaximum = Math.min(90, narrative.parameterEnvelope.water[1]);
  const mountainMinimum = Math.max(minimumMountains, narrative.parameterEnvelope.mountains[0]);
  const mountainMaximum = Math.max(mountainMinimum, narrative.parameterEnvelope.mountains[1]);
  const dominantTerrains = DOMINANT_TERRAINS.filter(() => random() < 0.36).map((terrain) => terrain.id);
  const seedPart = () => Math.floor(random() * 0x100000000).toString(36).padStart(7, "0");
  const playerMaximum = Math.min(22, sizeConfig.recommendedPlayers + 2);
  let players = 2 + Math.floor(random() * Math.max(1, playerMaximum - 1));
  if (preset === "THREE_REALMS") players = Math.max(3, players - players % 3);
  if (preset === "THALASSIC_LEAGUE") players = Math.max(3, players);
  if ((preset === "OPPOSING_FRONTS" || preset === "RIVAL_CONTINENTS") && players % 2) players = Math.max(2, players - 1);
  const cityStates = Math.floor(random() * (sizeConfig.recommendedCityStates + 1));
  return {
    ...DEFAULT_GENERATION_OPTIONS,
    projectionType: randomItem(["NORTH_SOUTH", "POLAR_CENTERED", "EQUATORIAL_POLE"] as const, random),
    style,
    preset,
    size,
    modifier,
    engine: presetConfig.engine,
    wrapType: randomItem(["PRESET", "EAST_WEST", "NONE"] as const, random),
    geometry: randomItem(includeGameBreakingOptions ? [...SAFE_MAP_GEOMETRIES, ...GAME_BREAKING_GEOMETRIES] : SAFE_MAP_GEOMETRIES, random),
    waterPercent: waterMinimum + Math.floor(random() * (waterMaximum - waterMinimum + 1)),
    mountainPercent: mountainMinimum + Math.floor(random() * (mountainMaximum - mountainMinimum + 1)),
    dominantTerrains,
    players,
    cityStates,
    balance: randomItem(["STANDARD", "TOURNAMENT", "TEAMS"] as const, random),
    teamSize: randomItem([2, 3, 4] as const, random),
    teamLayout: randomItem(["CLUSTERED", "FRONTLINES", "DISTRIBUTED"] as const, random),
    startQuality: randomItem(["STANDARD", "BALANCED", "LEGENDARY"] as const, random),
    climate: presetConfig.climate ?? randomItem(["COOL", "TEMPERATE", "HOT"] as const, random),
    rainfall: presetConfig.rainfall ?? randomItem(["ARID", "NORMAL", "WET"] as const, random),
    worldAge: presetConfig.worldAge ?? randomItem(["YOUNG", "NORMAL", "OLD"] as const, random),
    bonusAbundance: randomItem(["SCARCE", "STANDARD", "ABUNDANT"] as const, random),
    luxuryAbundance: randomItem(["SCARCE", "STANDARD", "ABUNDANT"] as const, random),
    luxuryRegional: random() > 0.5,
    luxuryStartGuarantee: random() > 0.25,
    strategicAbundance: randomItem(["SCARCE", "STANDARD", "ABUNDANT"] as const, random),
    strategicDistribution: randomItem(["EVEN", "REGIONAL", "CLUSTERED"] as const, random),
    strategicStartGuarantee: random() > 0.2,
    offshoreOilPercent: Math.round(random() * 60),
    wonderCount: Math.floor(random() * 11),
    wonderMinSpacing: 5 + Math.floor(random() * 8),
    wonderStartBuffer: 3 + Math.floor(random() * 7),
    cityStateMinSpacing: MINIMUM_START_DISTANCE + Math.floor(random() * 4),
    cityStateDistribution: randomItem(["EVEN", "REGIONAL"] as const, random),
    cityStateCoastalPreference: randomItem(["ANY", "PREFER", "REQUIRE"] as const, random),
    barbarianAbundance: randomItem(["NONE", "SCARCE", "STANDARD", "RAGING"] as const, random),
    barbarianStartDistance: 3 + Math.floor(random() * 6),
    ruinAbundance: randomItem(["NONE", "SCARCE", "STANDARD", "RAGING"] as const, random),
    ruinStartDistance: 2 + Math.floor(random() * 5),
    granularity: randomItem(["LOW", "FAIR", "HIGH", "VERY_HIGH"] as const, random),
    oceanBasins: 1 + Math.floor(random() * 5),
    landAtPoles: random() > 0.5,
    climateRealism: presetConfig.climateRealism ?? random() > 0.5,
    regionContrast: randomItem(["BLENDED", "VARIED", "EXTREME"] as const, random),
    fantasticality: randomItem(["RESTRAINED", "MYTHIC", "UNBOUND"] as const, random),
    regionClimateLogic: randomItem(["LAWLESS", "INFLUENCED", "ORDERED"] as const, random),
    eccentricExtreme: presetConfig.engine === "ECCENTRIC" && random() < 0.28 ? randomItem(["SNOWBALL", "JURASSIC", "ARRAKIS", "ARBOREA"] as const, random) : "NONE",
    coastalRangePercent: Math.round(random() * 100),
    riverDensity: narrative.parameterEnvelope.preferredRiverDensity ?? randomItem(["SPARSE", "NORMAL", "DENSE"] as const, random),
    plateActivity: presetConfig.plateActivity ?? randomItem(["QUIET", "NORMAL", "VIOLENT"] as const, random),
    erosionStrength: presetConfig.erosionStrength ?? randomItem(["LIGHT", "MODERATE", "STRONG"] as const, random),
    physicalRotation: presetConfig.physicalRotation ?? randomItem(["PROGRADE", "RETROGRADE"] as const, random),
    physicalSeasonality: presetConfig.physicalSeasonality ?? randomItem(["MILD", "EARTHLIKE", "EXTREME"] as const, random),
    physicalOceanInfluence: presetConfig.physicalOceanInfluence ?? randomItem(["WEAK", "NORMAL", "STRONG"] as const, random),
    polisConflictPattern: presetConfig.engine === "POLIS" ? polisPatternForPreset(preset) : randomItem(["RADIAL", "OPPOSING_FRONTS", "CROSSROADS", "RIVAL_CONTINENTS"] as const, random),
    polisSymmetry: randomItem(["EQUIVALENT", "MIRRORED", "ROTATIONAL", "ASYMMETRIC"] as const, random),
    polisExpansionPressure: randomItem(["RELAXED", "STANDARD", "IMMEDIATE"] as const, random),
    polisNavalImportance: randomItem(["LOW", "BALANCED", "HIGH"] as const, random),
    polisChokepointDensity: 20 + Math.round(random() * 70),
    polisContestedResourcePercent: 15 + Math.round(random() * 60),
    polisSafeRadius: 3 + Math.floor(random() * 4),
    strategicBalance: false,
    seed: `${seedPart()}-${seedPart()}`,
  };
}

export function randomGenerationRecipe(random: () => number = Math.random, includeGameBreakingOptions = false) {
  const options = randomGenerationOptions(random, includeGameBreakingOptions);
  const recipe = generationRecipeFromOptions(options);
  recipe.scale = randomItem(["GLOBAL", "CONTINENTAL", "REGIONAL", "PROVINCIAL", "LOCAL"] as const, random);
  recipe.archetype = randomCompatibleArchetype(options, random);
  recipe.archetypeIntensity = randomItem(["HINT", "STRONG"] as const, random);
  const humans = Math.floor(random() * (options.players + 1));
  const ai = Math.floor(random() * (options.players - humans + 1));
  recipe.matchIntent.humanPlayers = humans;
  recipe.matchIntent.aiPlayers = ai;
  recipe.matchIntent.flexiblePlayers = options.players - humans - ai;
  recipe.matchIntent.aiAccommodation = randomItem(["NORMAL", "STRONG"] as const, random);
  recipe.matchIntent.teamIntent = options.balance === "TEAMS" ? "FIXED_TEAMS" : "FLEXIBLE";
  recipe.matchIntent.competitiveStrictness = options.balance === "TOURNAMENT" ? "TOURNAMENT" : randomItem(["CASUAL", "BALANCED"] as const, random);
  const victories = [...recipe.matchIntent.enabledVictories].sort(() => random() - 0.5);
  recipe.matchIntent.emphasizedVictories = victories.slice(0, Math.floor(random() * 3));
  return recipe;
}

const TERRAINS = [
  "TERRAIN_OCEAN",
  "TERRAIN_COAST",
  "TERRAIN_GRASS",
  "TERRAIN_PLAINS",
  "TERRAIN_DESERT",
  "TERRAIN_TUNDRA",
  "TERRAIN_SNOW",
];
const FEATURES = ["FEATURE_FOREST", "FEATURE_JUNGLE", "FEATURE_MARSH", "FEATURE_ICE", "FEATURE_OASIS", "FEATURE_FALLOUT"];
const RESOURCES = [
  "RESOURCE_WHEAT",
  "RESOURCE_CATTLE",
  "RESOURCE_SHEEP",
  "RESOURCE_DEER",
  "RESOURCE_FISH",
  "RESOURCE_IRON",
  "RESOURCE_HORSE",
  "RESOURCE_COAL",
  "RESOURCE_OIL",
  "RESOURCE_ALUMINUM",
  "RESOURCE_URANIUM",
  "RESOURCE_GOLD",
  "RESOURCE_GEMS",
  "RESOURCE_SPICES",
  "RESOURCE_SILVER",
  "RESOURCE_FURS",
  "RESOURCE_DYES",
  "RESOURCE_SUGAR",
  "RESOURCE_COTTON",
  "RESOURCE_WINE",
  "RESOURCE_INCENSE",
  "RESOURCE_IVORY",
  "RESOURCE_PEARLS",
  "RESOURCE_WHALE",
  "RESOURCE_SALT",
  "RESOURCE_TRUFFLES",
];

const WONDERS = [
  "FEATURE_BARRINGER_CRATER",
  "FEATURE_MT_FUJI",
  "FEATURE_OLD_FAITHFUL",
  "FEATURE_EL_DORADO",
  "FEATURE_FOUNTAIN_YOUTH",
  "FEATURE_GRAND_MESA",
  "FEATURE_GIBRALTAR",
  "FEATURE_KRAKATOA",
  "FEATURE_LAKE_VICTORIA",
  "FEATURE_MT_KAILASH",
  "FEATURE_ULURU",
  "FEATURE_SOLOMONS_MINES",
];

function seedHash(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFactory(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashNoise(x: number, y: number, seed: number) {
  let value = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + seed, 0xc2b2ae35);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967295;
}

function smooth(value: number) {
  return value * value * (3 - 2 * value);
}

function valueNoise(x: number, y: number, scale: number, seed: number) {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = smooth(gx - x0);
  const ty = smooth(gy - y0);
  const top = hashNoise(x0, y0, seed) * (1 - tx) + hashNoise(x0 + 1, y0, seed) * tx;
  const bottom = hashNoise(x0, y0 + 1, seed) * (1 - tx) + hashNoise(x0 + 1, y0 + 1, seed) * tx;
  return top * (1 - ty) + bottom * ty;
}

function fractalNoise(x: number, y: number, seed: number) {
  return valueNoise(x, y, 18, seed) * 0.5 + valueNoise(x, y, 9, seed + 31) * 0.3 + valueNoise(x, y, 4.5, seed + 67) * 0.2;
}

function wrappedDistance(a: number, b: number) {
  const distance = Math.abs(a - b);
  return Math.min(distance, 1 - distance);
}

type Center = { x: number; y: number; radiusX: number; radiusY: number };

function createCenters(count: number, random: () => number, radius: [number, number], realm = false): Center[] {
  return Array.from({ length: count }, () => ({
    x: realm ? 0.12 + random() * 0.76 : random(),
    y: 0.14 + random() * 0.72,
    radiusX: radius[0] + random() * (radius[1] - radius[0]),
    radiusY: radius[0] + random() * (radius[1] - radius[0]),
  }));
}

function centerField(nx: number, ny: number, centers: Center[], wraps: boolean) {
  let field = 0;
  for (const center of centers) {
    const dx = (wraps ? wrappedDistance(nx, center.x) : Math.abs(nx - center.x)) / center.radiusX;
    const dy = Math.abs(ny - center.y) / center.radiusY;
    field = Math.max(field, 1 - Math.hypot(dx, dy));
  }
  return field;
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function voronoiBoundary(nx: number, ny: number, centers: Center[], wraps: boolean) {
  let nearest = Number.POSITIVE_INFINITY;
  let second = Number.POSITIVE_INFINITY;
  for (const center of centers) {
    const dx = wraps ? wrappedDistance(nx, center.x) : Math.abs(nx - center.x);
    const distance = Math.hypot(dx, Math.abs(ny - center.y));
    if (distance < nearest) {
      second = nearest;
      nearest = distance;
    } else if (distance < second) second = distance;
  }
  return clamp((second - nearest) * 9);
}

function warpedCoordinates(x: number, y: number, width: number, height: number, seed: number, strength: number) {
  const warpX = (fractalNoise(x + 401, y + 193, seed + 2003) - 0.5) * strength;
  const warpY = (fractalNoise(x + 89, y + 577, seed + 4001) - 0.5) * strength;
  return {
    x: x / width + warpX,
    y: y / Math.max(1, height - 1) + warpY,
  };
}

function diffuseRefine(
  source: number[],
  width: number,
  height: number,
  seed: number,
  wraps: boolean,
  passes: number,
  smoothing: number,
  detail: number,
) {
  let current = [...source];
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Array<number>(current.length);
    const scheduledDetail = detail * (1 - pass / Math.max(1, passes));
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const around = neighbors(x, y, width, height, wraps);
        const neighborMean = around.reduce((sum, [nx, ny]) => sum + current[ny * width + nx], 0) / Math.max(1, around.length);
        const index = y * width + x;
        const noise = hashNoise(x + pass * 131, y + pass * 71, seed + pass * 977) - 0.5;
        next[index] = current[index] * (1 - smoothing) + neighborMean * smoothing + noise * scheduledDetail;
      }
    }
    current = next;
  }
  return current;
}

function quantile(values: number[], percentile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(percentile * (sorted.length - 1))))];
}

function exactHighestMask(values: number[], count: number) {
  const selected = new Set(values.map((_value, index) => index).sort((one, two) => values[two] - values[one] || one - two).slice(0, Math.max(0, Math.min(values.length, count))));
  return values.map((_value, index) => selected.has(index));
}

function rasterFieldSource(source: NarrativeFieldSource, width: number, height: number, wraps: boolean) {
  const members: number[] = [];
  const cosine = Math.cos(source.rotation);
  const sine = Math.sin(source.rotation);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const normalizedX = (x + 0.5) / width;
      const normalizedY = (y + 0.5) / height;
      let dx = normalizedX - source.x;
      if (wraps && Math.abs(dx) > 0.5) dx += dx > 0 ? -1 : 1;
      const dy = normalizedY - source.y;
      if (Math.hypot((dx * cosine - dy * sine) / source.radiusX, (dx * sine + dy * cosine) / source.radiusY) <= 1) members.push(y * width + x);
    }
  }
  return members;
}

function rasterFieldPath(path: NarrativePathReservation, width: number, height: number, wraps: boolean) {
  if (!path.points.length) return [];
  const members = new Set<number>();
  const radius = Math.max(0, Math.min(2, Math.round(path.width * Math.max(width, height) * 0.45)));
  const stamp = (rawX: number, rawY: number) => {
    let x = Math.floor(rawX * width);
    const y = Math.max(0, Math.min(height - 1, Math.floor(rawY * height)));
    if (wraps) x = (x % width + width) % width;
    else x = Math.max(0, Math.min(width - 1, x));
    let frontier = [y * width + x];
    members.add(frontier[0]);
    for (let step = 0; step < radius; step += 1) {
      const next: number[] = [];
      for (const index of frontier) {
        for (const [neighborX, neighborY] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
          const neighbor = neighborY * width + neighborX;
          if (members.has(neighbor)) continue;
          members.add(neighbor);
          next.push(neighbor);
        }
      }
      frontier = next;
    }
  };
  stamp(path.points[0].x, path.points[0].y);
  for (let segment = 1; segment < path.points.length; segment += 1) {
    const from = path.points[segment - 1];
    const to = path.points[segment];
    let deltaX = to.x - from.x;
    if (wraps && Math.abs(deltaX) > 0.5) deltaX += deltaX > 0 ? -1 : 1;
    const deltaY = to.y - from.y;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(deltaX) * width, Math.abs(deltaY) * height) * 2));
    for (let step = 1; step <= steps; step += 1) {
      const amount = step / steps;
      stamp(from.x + deltaX * amount, from.y + deltaY * amount);
    }
  }
  return [...members].sort((one, two) => one - two);
}

function largestConnectedFieldSubset(indices: readonly number[], width: number, height: number, wraps: boolean) {
  const remaining = new Set(indices);
  let largest: number[] = [];
  while (remaining.size) {
    const origin = remaining.values().next().value as number;
    const component = [origin];
    remaining.delete(origin);
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      const index = component[cursor];
      for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
        const next = y * width + x;
        if (!remaining.delete(next)) continue;
        component.push(next);
      }
    }
    if (component.length > largest.length || component.length === largest.length && component[0] < (largest[0] ?? Number.POSITIVE_INFINITY)) largest = component;
  }
  return largest.sort((one, two) => one - two);
}

function connectedFieldSubsetWithMaximumOverlap(
  indices: readonly number[],
  priorityIndices: ReadonlySet<number>,
  width: number,
  height: number,
  wraps: boolean,
) {
  const remaining = new Set(indices);
  let best: number[] = [];
  let bestOverlap = -1;
  while (remaining.size) {
    const origin = remaining.values().next().value as number;
    const component = [origin];
    remaining.delete(origin);
    for (let cursor = 0; cursor < component.length; cursor += 1) for (const [x, y] of neighbors(component[cursor] % width, Math.floor(component[cursor] / width), width, height, wraps)) {
      const next = y * width + x;
      if (!remaining.delete(next)) continue;
      component.push(next);
    }
    const overlap = component.filter((index) => priorityIndices.has(index)).length;
    if (overlap > bestOverlap || overlap === bestOverlap && (component.length > best.length || component.length === best.length && component[0] < (best[0] ?? Number.POSITIVE_INFINITY))) {
      best = component;
      bestOverlap = overlap;
    }
  }
  return best.sort((one, two) => one - two);
}

function mostViableConnectedFieldSubset(
  indices: readonly number[],
  tiles: readonly Civ5Tile[],
  width: number,
  height: number,
  wraps: boolean,
) {
  const remaining = new Set(indices);
  let best: number[] = [];
  let bestPassable = -1;
  while (remaining.size) {
    const origin = remaining.values().next().value as number;
    const component = [origin];
    remaining.delete(origin);
    for (let cursor = 0; cursor < component.length; cursor += 1) for (const [x, y] of neighbors(component[cursor] % width, Math.floor(component[cursor] / width), width, height, wraps)) {
      const next = y * width + x;
      if (!remaining.delete(next)) continue;
      component.push(next);
    }
    const passable = component.filter((index) => tiles[index]?.terrain >= 2 && tiles[index].elevation < 2).length;
    if (passable > bestPassable || passable === bestPassable && (component.length > best.length || component.length === best.length && component[0] < (best[0] ?? Number.POSITIVE_INFINITY))) {
      best = component;
      bestPassable = passable;
    }
  }
  return best.sort((one, two) => one - two);
}

function connectFieldSets(
  origins: readonly number[],
  targets: readonly number[],
  allowed: (index: number) => boolean,
  width: number,
  height: number,
  wraps: boolean,
) {
  const target = new Set(targets.filter(allowed));
  const queue = [...new Set(origins.filter(allowed))].sort((one, two) => one - two);
  if (!queue.length || !target.size) return [];
  const parent = new Int32Array(width * height).fill(-2);
  for (const index of queue) parent[index] = -1;
  let reached = -1;
  for (let cursor = 0; cursor < queue.length && reached < 0; cursor += 1) {
    const current = queue[cursor];
    if (target.has(current)) { reached = current; break; }
    for (const [x, y] of neighbors(current % width, Math.floor(current / width), width, height, wraps)) {
      const next = y * width + x;
      if (parent[next] !== -2 || !allowed(next)) continue;
      parent[next] = current;
      queue.push(next);
    }
  }
  if (reached < 0) return [];
  const route: number[] = [];
  for (let current = reached; current >= 0; current = parent[current]) route.push(current);
  return route.reverse();
}

function connectFieldSetsMinimizingPenalty(
  origins: readonly number[],
  targets: readonly number[],
  allowed: (index: number) => boolean,
  penalty: (index: number) => number,
  width: number,
  height: number,
  wraps: boolean,
) {
  const target = new Set(targets.filter(allowed));
  const starts = [...new Set(origins.filter(allowed))].sort((one, two) => one - two);
  if (!starts.length || !target.size) return [];
  const costs = new Float64Array(width * height).fill(Number.POSITIVE_INFINITY);
  const steps = new Int32Array(width * height).fill(0x7fffffff);
  const parent = new Int32Array(width * height).fill(-2);
  const frontier: Array<{ index: number; cost: number; steps: number }> = [];
  const push = (entry: { index: number; cost: number; steps: number }) => {
    frontier.push(entry);
    let child = frontier.length - 1;
    while (child > 0) {
      const parentIndex = Math.floor((child - 1) / 2);
      const parentEntry = frontier[parentIndex];
      if (parentEntry.cost < entry.cost || parentEntry.cost === entry.cost && (parentEntry.steps < entry.steps || parentEntry.steps === entry.steps && parentEntry.index <= entry.index)) break;
      frontier[child] = parentEntry;
      child = parentIndex;
    }
    frontier[child] = entry;
  };
  const pop = () => {
    const first = frontier[0];
    const last = frontier.pop();
    if (!frontier.length || !last) return first;
    let parentIndex = 0;
    while (true) {
      const left = parentIndex * 2 + 1;
      const right = left + 1;
      if (left >= frontier.length) break;
      const child = right < frontier.length
        && (frontier[right].cost < frontier[left].cost
          || frontier[right].cost === frontier[left].cost && (frontier[right].steps < frontier[left].steps
            || frontier[right].steps === frontier[left].steps && frontier[right].index < frontier[left].index)) ? right : left;
      const childEntry = frontier[child];
      if (last.cost < childEntry.cost || last.cost === childEntry.cost && (last.steps < childEntry.steps || last.steps === childEntry.steps && last.index <= childEntry.index)) break;
      frontier[parentIndex] = childEntry;
      parentIndex = child;
    }
    frontier[parentIndex] = last;
    return first;
  };
  for (const index of starts) {
    costs[index] = penalty(index);
    steps[index] = 0;
    parent[index] = -1;
    push({ index, cost: costs[index], steps: 0 });
  }
  let reached = -1;
  while (frontier.length) {
    const current = pop();
    if (!current || current.cost !== costs[current.index] || current.steps !== steps[current.index]) continue;
    if (target.has(current.index)) { reached = current.index; break; }
    for (const [x, y] of neighbors(current.index % width, Math.floor(current.index / width), width, height, wraps)) {
      const next = y * width + x;
      if (!allowed(next)) continue;
      const nextCost = current.cost + penalty(next);
      const nextSteps = current.steps + 1;
      if (nextCost > costs[next] || nextCost === costs[next] && nextSteps >= steps[next]) continue;
      costs[next] = nextCost;
      steps[next] = nextSteps;
      parent[next] = current.index;
      push({ index: next, cost: nextCost, steps: nextSteps });
    }
  }
  if (reached < 0) return [];
  const route: number[] = [];
  for (let current = reached; current >= 0; current = parent[current]) route.push(current);
  return route.reverse();
}

/**
 * Bind Eccentric's relational graph causes to narrow, final-state geometry.
 * The polygon compiler deliberately retains broad fields while deciding the
 * world; evidence needs the exact interface or route that survived content,
 * relief and placement. This pass never changes land/water topology.
 */
function finalizeEccentricGraphRelationships(
  grammarFamily: string | undefined,
  sourceObjects: readonly GeographicObject[],
  tiles: Civ5Tile[],
  startLocations: readonly Civ5StartLocation[],
  width: number,
  height: number,
  wraps: boolean,
) {
  if (!grammarFamily || !new Set([
    "GRAPH_WONDER_HEARTLANDS",
    "GRAPH_ENCIRCLED_SEAS",
    "GRAPH_SCARRED_PANGAEA",
    "GRAPH_GREAT_PENINSULAS",
  ]).has(grammarFamily)) return [...sourceObjects];
  const native = sourceObjects.filter((object) => object.attributes?.nativeNarrative === true);
  const bySkeletonId = new Map(native.map((object) => [object.id.replace(/^narrative-/, ""), object]));
  const replacements = new Map<string, GeographicObject>();
  const role = (object: GeographicObject) => String(object.attributes?.role ?? object.attributes?.relationship ?? "");
  const passable = (index: number) => Boolean(tiles[index] && tiles[index].terrain >= 2 && tiles[index].elevation < 2 && tiles[index].wonder === 255);
  const land = (index: number) => Boolean(tiles[index] && tiles[index].terrain >= 2);
  const water = (index: number) => Boolean(tiles[index] && tiles[index].terrain < 2);
  const adjacent = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps).map(([x, y]) => y * width + x);
  const exactEndpoints = (path: GeographicObject) => {
    const from = bySkeletonId.get(String(path.attributes?.from ?? ""));
    const to = bySkeletonId.get(String(path.attributes?.to ?? ""));
    return from && to && from.id !== to.id ? { from, to } : undefined;
  };
  const routeBetween = (
    fromTiles: readonly number[],
    toTiles: readonly number[],
    allowed: (index: number) => boolean,
    reserved: ReadonlySet<number>,
    preferred: ReadonlySet<number>,
  ) => connectFieldSetsMinimizingPenalty(
    fromTiles,
    toTiles,
    allowed,
    (index) => (reserved.has(index) ? 1000 : 0) + (preferred.has(index) ? 0 : 1),
    width,
    height,
    wraps,
  );

  if (grammarFamily === "GRAPH_WONDER_HEARTLANDS") {
    const hearts = native.filter((object) => role(object) === "MYTHIC_HEART");
    const heartTiles = new Set(hearts.flatMap((heart) => heart.tileIndices));
    const startTiles = new Set(startLocations.map((start) => start.y * width + start.x));
    const usedMarch = new Set<number>();
    const pairedMarches = new Map<string, GeographicObject>();
    for (const path of native.filter((object) => role(object) === "ENSCONCED_BY")) {
      const endpoints = exactEndpoints(path);
      if (!endpoints) continue;
      const heart = role(endpoints.from) === "MYTHIC_HEART" ? endpoints.from : role(endpoints.to) === "MYTHIC_HEART" ? endpoints.to : undefined;
      const march = role(endpoints.from) === "BARREN_MARCH" ? endpoints.from : role(endpoints.to) === "BARREN_MARCH" ? endpoints.to : undefined;
      if (!heart || !march) continue;
      const boundary = [...new Set(heart.tileIndices.flatMap(adjacent))]
        .filter((index) => land(index) && !heartTiles.has(index) && !usedMarch.has(index));
      const connected = largestConnectedFieldSubset(boundary, width, height, wraps);
      if (!connected.length) continue;
      for (const index of connected) {
        usedMarch.add(index);
        // A march is intentionally poor; RIDGE marches use hills so the
        // enclosing relationship cannot make the land inaccessible. Retain
        // the world-extreme surface palette (Snowball, Jurassic, Arrakis or
        // Arborea) rather than painting every march generic desert.
        if (String(march.attributes?.effect ?? "") === "RIDGE") tiles[index].elevation = 1;
        tiles[index].feature = 255;
        tiles[index].resource = 255;
        tiles[index].wonder = 255;
        tiles[index].improvement = undefined;
      }
      const contact = connected.filter((index) => adjacent(index).some((next) => heart.tileIndices.includes(next))).sort((one, two) => one - two)[0];
      if (contact === undefined) continue;
      replacements.set(march.id, { ...march, tileIndices: connected, attributes: { ...march.attributes, outputEffectMatched: true, nativeEnclosure: true } });
      replacements.set(path.id, { ...path, tileIndices: [contact], attributes: { ...path.attributes, outputEffectMatched: true, endpointTerminatingSpine: true } });
      pairedMarches.set(heart.id, replacements.get(march.id)!);
    }

    // Mythic hearts are concentrated value, not merely named terrain. Move
    // existing legal resources from ordinary land into any heart whose final
    // surface still lacks a material advantage over its paired march. This
    // preserves the user's total resource abundance while making the graph
    // cause survive archetype/content passes as an actual gameplay contrast.
    const tileValue = (index: number) => {
      const tile = tiles[index];
      if (!tile || tile.terrain < 2) return 0;
      return (tile.resource !== 255 ? 2 : 0) + (tile.wonder !== 255 ? 4 : 0)
        + (tile.terrain === 2 ? 1 : tile.terrain === 3 ? 0.7 : 0.25);
    };
    const meanValue = (indices: readonly number[]) => indices.reduce((sum, index) => sum + tileValue(index), 0) / Math.max(1, indices.length);
    const donorPool = tiles.flatMap((tile, index) => tile.resource !== 255 && !heartTiles.has(index) && !usedMarch.has(index) ? [index] : [])
      .sort((one, two) => one - two);
    const usedDonors = new Set<number>();
    const reliefDonors = tiles.flatMap((tile, index) => tile.terrain >= 2 && tile.elevation < 2
      && tile.feature === 255 && tile.resource === 255 && tile.wonder === 255
      && !heartTiles.has(index) && !startTiles.has(index) && !usedMarch.has(index) ? [index] : [])
      .sort((one, two) => {
        const passableNeighbors = (index: number) => adjacent(index).filter((next) => passable(next)).length;
        return passableNeighbors(two) - passableNeighbors(one) || one - two;
      });
    const usedReliefDonors = new Set<number>();
    const raiseSafeReliefDonor = () => reliefDonors.find((index) => {
      if (usedReliefDonors.has(index)) return false;
      const before = connectedFieldSubsets(tiles.map((tile) => tile.terrain >= 2 && tile.elevation < 2), width, height, wraps).length;
      const priorElevation = tiles[index].elevation;
      tiles[index].elevation = 2;
      const after = connectedFieldSubsets(tiles.map((tile) => tile.terrain >= 2 && tile.elevation < 2), width, height, wraps).length;
      if (after > before) { tiles[index].elevation = priorElevation; return false; }
      usedReliefDonors.add(index);
      return true;
    });
    for (const heart of hearts) {
      const march = pairedMarches.get(heart.id);
      if (!march) continue;
      const targets = heart.tileIndices.filter((index) => passable(index) && tiles[index].resource === 255 && tiles[index].wonder === 255)
        .sort((one, two) => one - two);
      const blockedTargets = heart.tileIndices.filter((index) => tiles[index].terrain >= 2 && tiles[index].elevation === 2
        && tiles[index].resource === 255 && tiles[index].wonder === 255).sort((one, two) => one - two);
      while (meanValue(heart.tileIndices) - meanValue(march.tileIndices) < 0.65) {
        if (!targets.length) {
          const target = blockedTargets.shift();
          const reliefDonor = target === undefined ? undefined : raiseSafeReliefDonor();
          if (target === undefined || reliefDonor === undefined) break;
          tiles[target].elevation = 1;
          targets.push(target);
        }
        const target = targets.shift()!;
        const donor = donorPool.find((index) => !usedDonors.has(index)
          && resourcePlacementVerdict({ terrains: TERRAINS, resources: RESOURCES }, { ...tiles[target], resource: tiles[index].resource }).valid);
        if (donor === undefined) break;
        tiles[target].resource = tiles[donor].resource;
        tiles[donor].resource = 255;
        usedDonors.add(donor);
      }
    }
  }

  if (grammarFamily === "GRAPH_ENCIRCLED_SEAS") {
    const waterComponents = connectedFieldSubsets(tiles.map((tile) => tile.terrain < 2), width, height, wraps);
    const edge = (index: number) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return x === 0 || x === width - 1 || y === 0 || y === height - 1;
    };
    for (const sea of native.filter((object) => role(object) === "INLAND_SEA")) {
      const authored = new Set(sea.tileIndices);
      const enclosed = waterComponents.filter((component) => !component.some(edge)).sort((one, two) => {
        const overlap = (component: readonly number[]) => component.filter((index) => authored.has(index)).length;
        return overlap(two) - overlap(one) || two.length - one.length || one[0] - two[0];
      })[0];
      if (enclosed?.length) replacements.set(sea.id, { ...sea, tileIndices: enclosed, attributes: { ...sea.attributes, outputEffectMatched: true, nativeEnclosure: true } });
    }
    const reserved = new Set<number>();
    const circuitPaths = native.filter((object) => role(object) === "OUTER_CIRCUIT");
    const kingdomInterfaces = new Map(native.filter((object) => role(object) === "ENCLOSING_LAND").map((kingdom) => {
      const area = [...new Set([...kingdom.tileIndices, ...kingdom.tileIndices.flatMap(adjacent)])]
        .filter((index) => land(index) && tiles[index].wonder === 255);
      return [kingdom.id, new Set(largestConnectedFieldSubset(area, width, height, wraps))] as const;
    }));
    // Bind the most spatially constrained authored edge first. Long broad
    // reservations have many alternatives; letting one consume a short
    // sibling's only interface creates avoidable shared-path evidence.
    const orderedCircuitPaths = [...circuitPaths].sort((one, two) => one.tileIndices.length - two.tileIndices.length || one.id.localeCompare(two.id));
    for (const path of orderedCircuitPaths) {
      const endpoints = exactEndpoints(path);
      if (!endpoints) continue;
      const fromSet = new Set(endpoints.from.tileIndices);
      const toSet = new Set(endpoints.to.tileIndices);
      const fromInterface = kingdomInterfaces.get(endpoints.from.id) ?? new Set<number>();
      const toInterface = kingdomInterfaces.get(endpoints.to.id) ?? new Set<number>();
      const origins = endpoints.from.tileIndices.filter((index) => fromInterface.has(index) && !toSet.has(index));
      const targets = endpoints.to.tileIndices.filter((index) => toInterface.has(index) && !fromSet.has(index));
      const route = routeBetween(origins, targets, (index) => land(index) && tiles[index].wonder === 255, reserved, new Set(path.tileIndices));
      if (route.length < 2) continue;
      for (const index of route) tiles[index].elevation = Math.min(1, tiles[index].elevation) as 0 | 1;
      replacements.set(path.id, { ...path, tileIndices: route, attributes: { ...path.attributes, outputEffectMatched: true, endpointTerminatingSpine: true } });
      for (const index of route) reserved.add(index);
    }
    // Both incident routes must enter the same traversable part of each named
    // kingdom. Lower only the shortest internal connector to hills; the
    // surrounding ranges and the land/water topology remain untouched.
    for (const kingdom of native.filter((object) => role(object) === "ENCLOSING_LAND")) {
      const incident = circuitPaths.flatMap((template) => {
        const path = replacements.get(template.id) ?? template;
        const endpoints = exactEndpoints(path);
        if (!endpoints || endpoints.from.id !== kingdom.id && endpoints.to.id !== kingdom.id || path.tileIndices.length < 2) return [];
        const other = endpoints.from.id === kingdom.id ? endpoints.to : endpoints.from;
        const termini = [path.tileIndices[0], path.tileIndices[path.tileIndices.length - 1]];
        const touchesKingdom = (index: number) => kingdom.tileIndices.includes(index) || adjacent(index).some((next) => kingdom.tileIndices.includes(next));
        const touchesOther = (index: number) => other.tileIndices.includes(index) || adjacent(index).some((next) => other.tileIndices.includes(next));
        const candidates = termini.filter(touchesKingdom);
        const terminal = candidates.find((index) => !touchesOther(index)) ?? candidates[0];
        return terminal === undefined ? [] : [terminal];
      });
      if (incident.length !== 2) continue;
      const kingdomArea = new Set([...kingdom.tileIndices, ...kingdom.tileIndices.flatMap(adjacent)]);
      const connector = connectFieldSets(incident.slice(0, 1), incident.slice(1), (index) => kingdomArea.has(index)
        && land(index) && tiles[index].wonder === 255, width, height, wraps);
      for (const index of connector) tiles[index].elevation = Math.min(1, tiles[index].elevation) as 0 | 1;
    }
  }

  if (grammarFamily === "GRAPH_SCARRED_PANGAEA") {
    const dominantLand = new Set(largestConnectedFieldSubset(tiles.flatMap((tile, index) => tile.terrain >= 2 ? [index] : []), width, height, wraps));
    const chooseSubstantialRoute = (
      origins: readonly number[],
      targets: readonly number[],
      allowed: (index: number) => boolean,
      reserved: ReadonlySet<number>,
      preferred: ReadonlySet<number>,
    ) => targets.flatMap((target) => {
      const route = routeBetween(origins, [target], allowed, reserved, preferred);
      return route.length >= 3 ? [route] : [];
    }).sort((one, two) => {
      const score = (route: readonly number[]) => route.reduce((sum, index) => sum + (reserved.has(index) ? 1000 : 0) + (preferred.has(index) ? 0 : 1), 0);
      return score(one) - score(two) || one.length - two.length || one[0] - two[0];
    })[0] ?? [];
    const reservedBonds = new Set<number>();
    for (const path of native.filter((object) => role(object) === "CONTINENT_BOND")) {
      const endpoints = exactEndpoints(path);
      if (!endpoints) continue;
      const core = role(endpoints.from) === "DOMINANT_CONTINENT" ? endpoints.from : role(endpoints.to) === "DOMINANT_CONTINENT" ? endpoints.to : undefined;
      const lobe = role(endpoints.from) === "ASTRAL_LOBE" ? endpoints.from : role(endpoints.to) === "ASTRAL_LOBE" ? endpoints.to : undefined;
      if (!core || !lobe) continue;
      const coreSet = new Set(core.tileIndices);
      const lobeSet = new Set(lobe.tileIndices);
      const origins = core.tileIndices.filter((index) => dominantLand.has(index) && passable(index) && !lobeSet.has(index));
      const exclusiveTargets = lobe.tileIndices.filter((index) => dominantLand.has(index) && passable(index) && !coreSet.has(index));
      const targets = exclusiveTargets.length ? exclusiveTargets : lobe.tileIndices.filter((index) => dominantLand.has(index) && passable(index));
      const preferred = new Set(path.tileIndices);
      let route = chooseSubstantialRoute(origins, targets, passable, reservedBonds, preferred);
      if (route.length < 3) {
        const broadAllowed = (index: number) => dominantLand.has(index) && land(index) && tiles[index].wonder === 255;
        const broadOrigins = core.tileIndices.filter((index) => broadAllowed(index) && !lobeSet.has(index));
        const broadTargets = lobe.tileIndices.filter((index) => broadAllowed(index) && !coreSet.has(index));
        route = chooseSubstantialRoute(broadOrigins, broadTargets.length ? broadTargets : lobe.tileIndices, broadAllowed, reservedBonds, preferred);
        for (const index of route) tiles[index].elevation = Math.min(1, tiles[index].elevation) as 0 | 1;
      }
      if (route.length < 3) continue;
      replacements.set(path.id, { ...path, tileIndices: route, attributes: { ...path.attributes, outputEffectMatched: true, endpointTerminatingSpine: true } });
      for (const index of route.slice(1, -1)) reservedBonds.add(index);
    }
    const scarPaths = native.filter((object) => role(object) === "ALIEN_SCAR");
    const permutations = <T,>(values: readonly T[]): T[][] => values.length <= 1
      ? [[...values]]
      : values.flatMap((value, index) => permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((suffix) => [value, ...suffix]));
    const routeScar = (path: GeographicObject, reservedScars: ReadonlySet<number>) => {
      const endpoints = exactEndpoints(path);
      if (!endpoints || role(endpoints.from) !== "ASTRAL_LOBE" || role(endpoints.to) !== "ASTRAL_LOBE") return [];
      const preferred = new Set(path.tileIndices);
      const waterScar = String(path.attributes?.effect ?? "") === "WATER_PATH";
      const origins = waterScar
        ? [...new Set(endpoints.from.tileIndices.flatMap(adjacent))].filter(water)
        : endpoints.from.tileIndices.filter((index) => dominantLand.has(index) && land(index));
      const targets = waterScar
        ? [...new Set(endpoints.to.tileIndices.flatMap(adjacent))].filter(water)
        : endpoints.to.tileIndices.filter((index) => dominantLand.has(index) && land(index));
      const allowed = waterScar ? water : (index: number) => dominantLand.has(index) && land(index) && tiles[index].wonder === 255;
      const endpointTiles = new Set([...origins, ...targets]);
      const unclaimedInterior = (index: number) => allowed(index) && (!reservedScars.has(index) || endpointTiles.has(index));
      let route = chooseSubstantialRoute(origins, targets, unclaimedInterior, reservedScars, preferred);
      if (route.length < 3) route = chooseSubstantialRoute(origins, targets, allowed, reservedScars, preferred);
      return route.length >= 3 ? route : [];
    };
    let selectedScarRoutes = new Map<string, number[]>();
    let selectedScarScore = Number.POSITIVE_INFINITY;
    for (const order of permutations(scarPaths)) {
      const reserved = new Set<number>();
      const routes = new Map<string, number[]>();
      for (const path of order) {
        const route = routeScar(path, reserved);
        if (!route.length) continue;
        routes.set(path.id, route);
        for (const index of route) reserved.add(index);
      }
      const realized = [...routes.values()];
      const maximumOverlap = realized.reduce((maximum, one, index) => Math.max(maximum, ...realized.slice(index + 1).map((two) => {
        const twoSet = new Set(two);
        return one.filter((tile) => twoSet.has(tile)).length / Math.max(1, Math.min(one.length, two.length));
      }), 0), 0);
      const missing = scarPaths.length - routes.size;
      const score = missing * 10_000 + maximumOverlap * 1_000 + realized.reduce((sum, route) => sum + route.length, 0) * 0.001;
      if (score < selectedScarScore) { selectedScarScore = score; selectedScarRoutes = routes; }
      if (missing === 0 && maximumOverlap <= 0.2) break;
    }
    for (const path of scarPaths) {
      const route = selectedScarRoutes.get(path.id);
      if (!route) continue;
      if (String(path.attributes?.effect ?? "") !== "WATER_PATH") for (const index of route) tiles[index].elevation = 1;
      replacements.set(path.id, { ...path, tileIndices: route, attributes: { ...path.attributes, outputEffectMatched: true, endpointTerminatingSpine: true } });
    }
  }

  if (grammarFamily === "GRAPH_GREAT_PENINSULAS") {
    const reserved = new Set<number>();
    for (const neck of native.filter((object) => role(object) === "PENINSULA_NECK")) {
      for (const index of neck.tileIndices) {
        if (!land(index)) continue;
        tiles[index].elevation = Math.min(1, tiles[index].elevation) as 0 | 1;
        // A natural wonder on the sole attachment would make the named route
        // physically impassable; the peninsula interior remains available for
        // later value and wonder placement.
        tiles[index].wonder = 255;
      }
      replacements.set(neck.id, { ...neck, attributes: { ...neck.attributes, outputEffectMatched: true, endpointTerminatingSpine: true } });
    }
    for (const path of native.filter((object) => role(object) === "SHARED_BACKBONE")) {
      const endpoints = exactEndpoints(path);
      if (!endpoints) continue;
      const fromSet = new Set(endpoints.from.tileIndices);
      const toSet = new Set(endpoints.to.tileIndices);
      const route = routeBetween(
        endpoints.from.tileIndices.filter((index) => passable(index) && !toSet.has(index)),
        endpoints.to.tileIndices.filter((index) => passable(index) && !fromSet.has(index)),
        passable,
        reserved,
        new Set(path.tileIndices),
      );
      if (route.length < 2) continue;
      replacements.set(path.id, { ...path, tileIndices: route, attributes: { ...path.attributes, outputEffectMatched: true, endpointTerminatingSpine: true } });
      for (const index of route) reserved.add(index);
    }
  }

  return sourceObjects.map((object) => replacements.get(object.id) ?? object);
}

function connectedFieldSubsets(mask: readonly boolean[], width: number, height: number, wraps: boolean) {
  const remaining = new Set(mask.flatMap((included, index) => included ? [index] : []));
  const components: number[][] = [];
  while (remaining.size) {
    const origin = remaining.values().next().value as number;
    const component = [origin];
    remaining.delete(origin);
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      const index = component[cursor];
      for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
        const next = y * width + x;
        if (!remaining.delete(next)) continue;
        component.push(next);
      }
    }
    components.push(component);
  }
  return components.sort((one, two) => two.length - one.length || one[0] - two[0]);
}

function nativeAnchorCoreTiles(
  clusters: readonly number[][],
  landMask: readonly boolean[],
  width: number,
  height: number,
  wraps: boolean,
  minimumCoreSize = 1,
) {
  const protectedTiles = new Set<number>();
  for (const rawCluster of clusters) {
    const cluster = new Set(largestConnectedFieldSubset(rawCluster.filter((index) => landMask[index]), width, height, wraps));
    if (!cluster.size) continue;
    const distance = new Int16Array(landMask.length).fill(-1);
    const queue = [...cluster].filter((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
      .some(([x, y]) => !cluster.has(y * width + x)));
    for (const index of queue) distance[index] = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const [x, y] of neighbors(queue[cursor] % width, Math.floor(queue[cursor] / width), width, height, wraps)) {
      const next = y * width + x;
      if (!cluster.has(next) || distance[next] >= 0) continue;
      distance[next] = distance[queue[cursor]] + 1;
      queue.push(next);
    }
    // A single deepest cell is enough to keep the authored root alive while
    // allowing a truthful sea seam to cut directly touching field fringes.
    // Viable-area enforcement is verified after final relief and start work.
    const minimumCore = Math.min(cluster.size, Math.max(1, minimumCoreSize));
    for (const index of [...cluster].sort((one, two) => distance[two] - distance[one] || one - two).slice(0, minimumCore)) protectedTiles.add(index);
  }
  return protectedTiles;
}

/**
 * A dominant field grammar needs more than a high scalar value at its named
 * sources: the selected threshold must retain those sources as one country.
 * Grow that native country through the best unprotected frontier while
 * exchanging low-value, non-native satellite land one-for-one. Sea level and
 * semantic protection therefore remain authoritative.
 */
function reinforceNativeDominantLandmass(
  landMask: boolean[],
  targetShare: number,
  maximumComponents: number,
  nativeSeeds: readonly number[],
  fieldValues: readonly number[],
  landPriority: ArrayLike<number>,
  waterPriority: ArrayLike<number>,
  constraints: GenerationConstraintPayload | undefined,
  width: number,
  height: number,
  wraps: boolean,
) {
  const totalLand = landMask.filter(Boolean).length;
  if (!totalLand || !nativeSeeds.length) return;
  const protectedLand = new Set<number>();
  const protectedWater = new Set<number>();
  for (let index = 0; index < landMask.length; index += 1) {
    if ((landPriority[index] ?? 0) > (waterPriority[index] ?? 0) && (landPriority[index] ?? 0) > 0 || constraints?.topology[index] === 1) protectedLand.add(index);
    if ((waterPriority[index] ?? 0) > (landPriority[index] ?? 0) && (waterPriority[index] ?? 0) > 0 || constraints?.topology[index] === 0) protectedWater.add(index);
  }
  const seedSet = new Set(nativeSeeds.filter((index) => landMask[index]));
  let components = connectedFieldSubsets(landMask, width, height, wraps);
  let primary = components.reduce((best, component) => {
    const overlap = component.filter((index) => seedSet.has(index)).length;
    const bestOverlap = best.filter((index) => seedSet.has(index)).length;
    return overlap > bestOverlap || overlap === bestOverlap && component.length > best.length ? component : best;
  }, components[0] ?? []);
  const primarySet = new Set(primary);
  const targetSize = Math.ceil(totalLand * targetShare);
  while (primarySet.size < targetSize) {
    const frontier = [...primarySet].flatMap((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
      .map(([x, y]) => y * width + x))
      .filter((index, position, all) => !landMask[index] && !protectedWater.has(index) && all.indexOf(index) === position)
      .sort((one, two) => fieldValues[two] - fieldValues[one] || one - two);
    const donors = landMask.flatMap((land, index) => land && !primarySet.has(index) && !protectedLand.has(index) ? [index] : [])
      .sort((one, two) => fieldValues[one] - fieldValues[two] || one - two);
    if (!frontier.length || !donors.length) break;
    const added = frontier[0];
    const removed = donors[0];
    landMask[added] = true;
    landMask[removed] = false;
    primarySet.add(added);
  }

  // Ordinary field noise may leave tiny, non-native islands around a Pangaea.
  // Exchange whole disposable components for the same number of frontier
  // tiles until the grammar's bounded component count is actually visible.
  components = connectedFieldSubsets(landMask, width, height, wraps);
  primary = components.find((component) => component.some((index) => primarySet.has(index))) ?? components[0] ?? [];
  const retainedPrimary = new Set(primary);
  for (const component of [...components].sort((one, two) => one.length - two.length || one[0] - two[0])) {
    if (components.length <= maximumComponents || component.some((index) => retainedPrimary.has(index)) || component.some((index) => protectedLand.has(index))) continue;
    const frontier = [...retainedPrimary].flatMap((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
      .map(([x, y]) => y * width + x))
      .filter((index, position, all) => !landMask[index] && !protectedWater.has(index) && all.indexOf(index) === position)
      .sort((one, two) => fieldValues[two] - fieldValues[one] || one - two)
      .slice(0, component.length);
    if (frontier.length < component.length) continue;
    for (const index of component) landMask[index] = false;
    for (const index of frontier) { landMask[index] = true; retainedPrimary.add(index); }
    components = connectedFieldSubsets(landMask, width, height, wraps);
  }
}

/** Retain every authored Lake Kingdoms basin as actual enclosed water. */
function realizeNativeLakeKingdomWaters(
  landMask: boolean[],
  sources: readonly NarrativeFieldSource[],
  paths: readonly NarrativePathReservation[],
  sourceReservations: Map<string, number[]>,
  pathReservations: Map<string, number[]>,
  fieldValues: readonly number[],
  landPriority: ArrayLike<number>,
  waterPriority: ArrayLike<number>,
  constraints: GenerationConstraintPayload | undefined,
  width: number,
  height: number,
  wraps: boolean,
) {
  const initialLandCount = landMask.filter(Boolean).length;
  const waterSources = sources.filter((source) => source.role === "INLAND_SEA" || source.role === "INLAND_LAKE");
  if (!waterSources.length) return;
  const edge = new Set<number>();
  for (let x = 0; x < width; x += 1) { edge.add(x); edge.add((height - 1) * width + x); }
  if (!wraps) for (let y = 0; y < height; y += 1) { edge.add(y * width); edge.add(y * width + width - 1); }
  const circuit = new Set(paths.filter((path) => path.effect === "LAND_PATH").flatMap((path) => pathReservations.get(path.id) ?? []));
  const allWaterReservations = new Set(waterSources.flatMap((source) => sourceReservations.get(source.id.replace(/^field-/, "")) ?? []));

  // Extreme aspect ratios can strand one small enclosing-land reservation on
  // the far side of a one-hex water gap. Join each authored circuit edge before
  // basin carving, then give the two halves of that real connector to its exact
  // endpoint fields. This lets the later native binding select distinct shared
  // termini instead of retaining a disconnected decorative circuit raster.
  const landSources = sources.filter((source) => source.role === "ENCLOSING_LAND");
  const sourceById = new Map(landSources.map((source) => [source.id.replace(/^field-/, ""), source]));
  const landClaims = new Map<number, NarrativeFieldSource[]>();
  for (const source of landSources) for (const index of sourceReservations.get(source.id.replace(/^field-/, "")) ?? []) {
    if (!landMask[index]) continue;
    const claims = landClaims.get(index) ?? [];
    claims.push(source);
    landClaims.set(index, claims);
  }
  const landOwner = new Map<number, string>();
  for (const [index, claims] of landClaims) {
    const x = (index % width + 0.5) / width;
    const y = (Math.floor(index / width) + 0.5) / height;
    const selected = [...claims].sort((one, two) => {
      const distance = (source: NarrativeFieldSource) => {
        let dx = Math.abs(x - source.x);
        if (wraps) dx = Math.min(dx, 1 - dx);
        return Math.hypot(dx, y - source.y);
      };
      return distance(one) - distance(two) || one.id.localeCompare(two.id);
    })[0];
    landOwner.set(index, selected.id.replace(/^field-/, ""));
  }
  for (const source of landSources) {
    const id = source.id.replace(/^field-/, "");
    sourceReservations.set(id, largestConnectedFieldSubset(
      (sourceReservations.get(id) ?? []).filter((index) => landMask[index] && landOwner.get(index) === id),
      width,
      height,
      wraps,
    ));
  }
  const addedCircuitLand = new Set<number>();
  for (const path of paths.filter((candidate) => candidate.kind === "OUTER_CIRCUIT" && candidate.effect === "LAND_PATH")) {
    const fromSource = sourceById.get(path.from);
    const toSource = sourceById.get(path.to);
    const from = (sourceReservations.get(path.from) ?? []).filter((index) => landMask[index]);
    const to = (sourceReservations.get(path.to) ?? []).filter((index) => landMask[index]);
    if (!fromSource || !toSource || !from.length || !to.length) continue;
    const toSet = new Set(to);
    const alreadyTouch = from.some((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
      .some(([x, y]) => toSet.has(y * width + x)));
    if (alreadyTouch) continue;
    const endpointMembers = new Set([...from, ...to]);
    const otherSourceMembers = new Set(landSources
      .filter((source) => source !== fromSource && source !== toSource)
      .flatMap((source) => sourceReservations.get(source.id.replace(/^field-/, "")) ?? []));
    const connector = connectFieldSetsMinimizingPenalty(
      from,
      to,
      (index) => constraints?.topology[index] !== 0,
      (index) => (allWaterReservations.has(index) ? landMask.length : 0)
        + (otherSourceMembers.has(index) && !endpointMembers.has(index) ? landMask.length : 0),
      width,
      height,
      wraps,
    );
    if (connector.length < 2) continue;
    const fromMembers = new Set(sourceReservations.get(path.from) ?? []);
    const toMembers = new Set(sourceReservations.get(path.to) ?? []);
    for (const [position, index] of connector.entries()) {
      if (!landMask[index]) { landMask[index] = true; addedCircuitLand.add(index); }
      if (fromMembers.has(index) || toMembers.has(index) || otherSourceMembers.has(index)) continue;
      if (position * 2 < connector.length) fromMembers.add(index);
      else toMembers.add(index);
    }
    sourceReservations.set(path.from, [...fromMembers].sort((one, two) => one - two));
    sourceReservations.set(path.to, [...toMembers].sort((one, two) => one - two));
    pathReservations.set(path.id, connector);
    for (const index of connector) circuit.add(index);
  }
  if (addedCircuitLand.size) {
    const reservedLand = new Set(landSources.flatMap((source) => sourceReservations.get(source.id.replace(/^field-/, "")) ?? []));
    const donors = landMask.flatMap((land, index) => land
      && !edge.has(index)
      && !reservedLand.has(index)
      && !addedCircuitLand.has(index)
      && constraints?.topology[index] !== 1
      ? [index] : [])
      .sort((one, two) => {
        const waterNeighbors = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
          .filter(([x, y]) => !landMask[y * width + x]).length;
        const safeOne = waterNeighbors(one) === 1;
        const safeTwo = waterNeighbors(two) === 1;
        return Number(safeTwo) - Number(safeOne)
          || waterNeighbors(one) - waterNeighbors(two)
          || (landPriority[one] ?? 0) - (landPriority[two] ?? 0)
          || fieldValues[one] - fieldValues[two] || one - two;
      });
    const exchanged = Math.min(addedCircuitLand.size, donors.length);
    for (const index of donors.slice(0, exchanged)) landMask[index] = false;
    // If hard constraints leave no disposable donor, retract only unmatched
    // additions; the exact user water budget remains authoritative.
    for (const index of [...addedCircuitLand].slice(exchanged)) {
      landMask[index] = false;
      for (const source of landSources) {
        const id = source.id.replace(/^field-/, "");
        sourceReservations.set(id, (sourceReservations.get(id) ?? []).filter((member) => member !== index));
      }
      for (const path of paths.filter((candidate) => candidate.effect === "LAND_PATH")) {
        pathReservations.set(path.id, (pathReservations.get(path.id) ?? []).filter((member) => member !== index));
      }
    }
  }
  const addedWater = new Set<number>();
  const retainedWater = new Set<number>();
  for (const source of waterSources) {
    const id = source.id.replace(/^field-/, "");
    const reservation = sourceReservations.get(id) ?? [];
    const existing = largestConnectedFieldSubset(reservation.filter((index) => !landMask[index]), width, height, wraps);
    const members = new Set(existing);
    const candidates = reservation.filter((index) => !edge.has(index)
      && !addedCircuitLand.has(index)
      && constraints?.topology[index] !== 1)
      .sort((one, two) => Number(circuit.has(one)) - Number(circuit.has(two))
        || (waterPriority[two] ?? 0) - (waterPriority[one] ?? 0)
        || (landPriority[one] ?? 0) - (landPriority[two] ?? 0)
        || fieldValues[one] - fieldValues[two] || one - two);
    if (!members.size && candidates.length) members.add(candidates[0]);
    let frontier = [...members];
    const candidateSet = new Set(candidates);
    while (members.size < 3 && frontier.length) {
      const nextFrontier: number[] = [];
      for (const index of frontier) for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
        const next = y * width + x;
        if (members.has(next) || !candidateSet.has(next)) continue;
        members.add(next);
        nextFrontier.push(next);
        if (members.size >= 3) break;
      }
      frontier = nextFrontier;
    }
    for (const index of members) {
      if (landMask[index]) addedWater.add(index);
      landMask[index] = false;
      retainedWater.add(index);
    }
    sourceReservations.set(id, [...members].sort((one, two) => one - two));
  }
  if (!addedWater.size) return;
  const donors = landMask.flatMap((land, index) => !land
    && !retainedWater.has(index)
    && !allWaterReservations.has(index)
    && constraints?.topology[index] !== 0
    ? [index] : [])
    .sort((one, two) => {
      const adjacentLand = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps).filter(([x, y]) => landMask[y * width + x]).length;
      return adjacentLand(two) - adjacentLand(one)
        || (landPriority[two] ?? 0) - (landPriority[one] ?? 0)
        || (waterPriority[one] ?? 0) - (waterPriority[two] ?? 0)
        || fieldValues[two] - fieldValues[one] || one - two;
    });
  const exchanged = Math.min(addedWater.size, donors.length);
  for (const index of donors.slice(0, exchanged)) landMask[index] = true;
  // A constrained tiny map may have no disposable interior water. In that
  // case restore only the unmatched new basin cells instead of changing the
  // user's exact sea-level budget.
  for (const index of [...addedWater].sort((one, two) => (waterPriority[one] ?? 0) - (waterPriority[two] ?? 0) || one - two).slice(0, addedWater.size - exchanged)) {
    landMask[index] = true;
    retainedWater.delete(index);
  }
  for (const source of waterSources) {
    const id = source.id.replace(/^field-/, "");
    sourceReservations.set(id, largestConnectedFieldSubset((sourceReservations.get(id) ?? []).filter((index) => !landMask[index]), width, height, wraps));
  }
  if (landMask.filter(Boolean).length !== initialLandCount) throw new Error("Lake Kingdom circuit realization changed the exact land budget.");
}

/**
 * Materialize the crooked-continent grammar as separate countries without
 * cutting the core-to-lobe routes that make each country playable. Ownership
 * is derived from the exact retained core rasters. Only cross-owner contacts
 * become sea; the final land budget is reconciled with same-owner,
 * non-reserved cells, so neither semantic protection nor sea level drifts.
 */
function separateNativeCrookedContinentSystems(
  landMask: boolean[],
  sources: readonly NarrativeFieldSource[],
  paths: readonly NarrativePathReservation[],
  sourceReservations: Map<string, number[]>,
  pathReservations: Map<string, number[]>,
  fieldValues: readonly number[],
  landPriority: ArrayLike<number>,
  waterPriority: ArrayLike<number>,
  constraints: GenerationConstraintPayload | undefined,
  width: number,
  height: number,
  wraps: boolean,
) {
  const initialLandCount = landMask.filter(Boolean).length;
  const rawSourceReservations = new Map([...sourceReservations].map(([id, members]) => [id, [...members]]));
  const coreSources = sources.filter((source) => source.role === "CONTINENT_CORE");
  if (coreSources.length < 2) return;
  const coreIds = coreSources.map((source) => source.id.replace(/^field-/, ""));
  const coreAnchors = coreIds.map((id) => sourceReservations.get(id)?.filter((index) => landMask[index]) ?? []);
  if (coreAnchors.some((anchors) => !anchors.length)) return;
  const systemByRegion = new Map<string, number>();
  for (const [system, coreId] of coreIds.entries()) {
    systemByRegion.set(coreId, system);
    for (const source of sources) if (source.parentId === coreId) systemByRegion.set(source.id.replace(/^field-/, ""), system);
  }
  const owner = new Int16Array(landMask.length).fill(-1);
  for (let index = 0; index < landMask.length; index += 1) {
    const x = index % width; const y = Math.floor(index / width);
    let nearestSystem = -1; let nearestDistance = Number.POSITIVE_INFINITY;
    for (let system = 0; system < coreAnchors.length; system += 1) for (const anchor of coreAnchors[system]) {
      let dx = Math.abs(x - anchor % width);
      if (wraps) dx = Math.min(dx, width - dx);
      const dy = y - Math.floor(anchor / width);
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance || distance === nearestDistance && system < nearestSystem) {
        nearestDistance = distance;
        nearestSystem = system;
      }
    }
    owner[index] = nearestSystem;
  }
  const protectedLand = new Set(landMask.flatMap((land, index) => land && constraints?.topology[index] === 1 ? [index] : []));
  const essentialOwner = new Int16Array(landMask.length).fill(-1);
  for (const source of sources) {
    const id = source.id.replace(/^field-/, "");
    const system = systemByRegion.get(id);
    if (system === undefined || source.effect !== "LAND") continue;
    for (const index of sourceReservations.get(id) ?? []) if (owner[index] === system) essentialOwner[index] = system;
  }
  for (const path of paths) {
    const system = systemByRegion.get(path.from);
    if (system === undefined || system !== systemByRegion.get(path.to) || path.effect !== "LAND_PATH") continue;
    for (const index of pathReservations.get(path.id) ?? []) if (owner[index] === system) essentialOwner[index] = system;
  }
  const seams = new Set<number>();
  for (let index = 0; index < landMask.length; index += 1) {
    if (!landMask[index] || owner[index] < 0) continue;
    for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
      const next = y * width + x;
      if (!landMask[next] || owner[next] < 0 || owner[next] === owner[index]) continue;
      const candidate = [index, next]
        .filter((tile) => !protectedLand.has(tile) && constraints?.topology[tile] !== 1)
        .sort((one, two) => Number(essentialOwner[one] >= 0) - Number(essentialOwner[two] >= 0)
          || (landPriority[one] ?? 0) - (landPriority[two] ?? 0)
          || (waterPriority[two] ?? 0) - (waterPriority[one] ?? 0)
          || fieldValues[one] - fieldValues[two] || one - two)[0];
      if (candidate !== undefined) seams.add(candidate);
    }
  }
  for (const index of seams) landMask[index] = false;

  // Bind every retained regional cause to its own side of the seam. A hard
  // protected source keeps its complete requested extent; all other sources
  // retain their largest actual connected field component.
  for (const source of sources) {
    const id = source.id.replace(/^field-/, "");
    const system = systemByRegion.get(id);
    if (system === undefined || source.effect !== "LAND") continue;
    const matched = (sourceReservations.get(id) ?? []).filter((index) => landMask[index] && owner[index] === system);
    const protectedSource = constraints?.semantics.some((semantic) => semantic.sourceSemanticId === `narrative:${id}`) ?? false;
    sourceReservations.set(id, protectedSource ? matched : largestConnectedFieldSubset(matched, width, height, wraps));
  }

  // A rebased root can move a child ellipse across the final Voronoi seam.
  // Retain that causal child at the far end of its own authored corridor rather
  // than silently dropping it or assigning it to the neighboring continent.
  for (const source of sources.filter((candidate) => candidate.role === "CROOKED_LOBE")) {
    const id = source.id.replace(/^field-/, "");
    if ((sourceReservations.get(id)?.length ?? 0) >= 4 || !source.parentId) continue;
    const system = systemByRegion.get(id);
    const core = sourceReservations.get(source.parentId) ?? [];
    if (system === undefined || !core.length) continue;
    const distance = new Int16Array(landMask.length).fill(-1);
    const queue = [...core];
    for (const index of queue) distance[index] = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const [x, y] of neighbors(queue[cursor] % width, Math.floor(queue[cursor] / width), width, height, wraps)) {
      const next = y * width + x;
      if (distance[next] >= 0 || !landMask[next] || owner[next] !== system) continue;
      distance[next] = distance[queue[cursor]] + 1;
      queue.push(next);
    }
    const incidentPath = paths.find((path) => path.effect === "LAND_PATH" && path.from === source.parentId && path.to === id);
    const candidates = [
      ...(rawSourceReservations.get(id) ?? []),
      ...(incidentPath ? pathReservations.get(incidentPath.id) ?? [] : []),
    ].filter((index, position, all) => landMask[index] && owner[index] === system && distance[index] >= 0 && all.indexOf(index) === position);
    const endpoint = candidates.sort((one, two) => distance[two] - distance[one] || one - two)[0]
      ?? queue.sort((one, two) => distance[two] - distance[one] || one - two)[0];
    if (endpoint === undefined) continue;
    const members = new Set([endpoint]);
    let frontier = [endpoint];
    for (let radius = 0; radius < 2; radius += 1) {
      const nextFrontier: number[] = [];
      for (const index of frontier) for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
        const next = y * width + x;
        if (members.has(next) || !landMask[next] || owner[next] !== system) continue;
        members.add(next);
        nextFrontier.push(next);
      }
      frontier = nextFrontier;
    }
    sourceReservations.set(id, [...members].sort((one, two) => one - two));
  }
  for (const [system, coreId] of coreIds.entries()) {
    const members = new Set(sourceReservations.get(coreId) ?? []);
    let frontier = [...members];
    while (members.size < 6 && frontier.length) {
      const nextFrontier: number[] = [];
      for (const index of frontier) for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
        const next = y * width + x;
        if (members.has(next) || !landMask[next] || owner[next] !== system) continue;
        members.add(next);
        nextFrontier.push(next);
        if (members.size >= 6) break;
      }
      frontier = nextFrontier;
    }
    sourceReservations.set(coreId, [...members].sort((one, two) => one - two));
  }

  // Recompute each interior corridor from final, owner-local land. If a seam
  // removed a decorative control point, the retained path is the real route
  // between the exact core and child rather than the stale spline raster.
  for (const path of paths.filter((candidate) => candidate.effect === "LAND_PATH")) {
    const system = systemByRegion.get(path.from);
    if (system === undefined || system !== systemByRegion.get(path.to)) continue;
    const from = sourceReservations.get(path.from) ?? [];
    const to = sourceReservations.get(path.to) ?? [];
    if (!from.length || !to.length) continue;
    let route = connectFieldSets(from, to, (index) => landMask[index] && owner[index] === system, width, height, wraps);
    if (!route.length) {
      route = connectFieldSets(from, to, (index) => !seams.has(index)
        && owner[index] === system
        && constraints?.topology[index] !== 0
        && neighbors(index % width, Math.floor(index / width), width, height, wraps).every(([x, y]) => {
          const next = y * width + x;
          return !landMask[next] || owner[next] === system;
        }), width, height, wraps);
      for (const index of route) landMask[index] = true;
    }
    if (!route.length) continue;
    const retained = [
      ...(pathReservations.get(path.id) ?? []).filter((index) => landMask[index] && owner[index] === system),
      ...route,
    ];
    const connected = new Set(connectedFieldSubsetWithMaximumOverlap([...new Set(retained)], new Set(route), width, height, wraps));
    let frontier = [...connected];
    while (connected.size < 3 && frontier.length) {
      const nextFrontier: number[] = [];
      for (const index of frontier) for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
        const next = y * width + x;
        if (connected.has(next) || !landMask[next] || owner[next] !== system) continue;
        connected.add(next);
        nextFrontier.push(next);
        if (connected.size >= 3) break;
      }
      frontier = nextFrontier;
    }
    pathReservations.set(path.id, [...connected].sort((one, two) => one - two));
  }
  for (const path of paths.filter((candidate) => candidate.effect === "WATER_PATH")) {
    const from = sourceReservations.get(path.from) ?? [];
    const to = sourceReservations.get(path.to) ?? [];
    if (!from.length || !to.length) continue;
    const adjacentWater = (members: readonly number[]) => [...new Set(members.flatMap((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
      .map(([x, y]) => y * width + x)).filter((index) => !landMask[index]))];
    const route = connectFieldSets(adjacentWater(from), adjacentWater(to), (index) => !landMask[index], width, height, wraps);
    if (route.length >= 2) pathReservations.set(path.id, route);
  }

  const reservedLand = new Set<number>([
    ...sources.flatMap((source) => source.effect === "LAND" ? sourceReservations.get(source.id.replace(/^field-/, "")) ?? [] : []),
    ...paths.flatMap((path) => path.effect === "LAND_PATH" ? pathReservations.get(path.id) ?? [] : []),
  ]);
  const reservedWater = new Set(paths.flatMap((path) => path.effect === "WATER_PATH" ? pathReservations.get(path.id) ?? [] : []));
  let currentLandCount = landMask.filter(Boolean).length;
  if (currentLandCount < initialLandCount) {
    const candidates = landMask.flatMap((land, index) => !land
      && !seams.has(index)
      && !reservedWater.has(index)
      && owner[index] >= 0
      && constraints?.topology[index] !== 0
      && neighbors(index % width, Math.floor(index / width), width, height, wraps).every(([x, y]) => owner[y * width + x] === owner[index])
      ? [index] : [])
      .sort((one, two) => fieldValues[two] - fieldValues[one] || one - two);
    for (const index of candidates) {
      if (currentLandCount >= initialLandCount) break;
      if (!neighbors(index % width, Math.floor(index / width), width, height, wraps).some(([x, y]) => landMask[y * width + x])) continue;
      landMask[index] = true;
      currentLandCount += 1;
    }
  } else if (currentLandCount > initialLandCount) {
    const candidates = landMask.flatMap((land, index) => land
      && !reservedLand.has(index)
      && !protectedLand.has(index)
      && constraints?.topology[index] !== 1
      ? [index] : [])
      .sort((one, two) => {
        const landNeighbors = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps).filter(([x, y]) => landMask[y * width + x]).length;
        return landNeighbors(one) - landNeighbors(two) || fieldValues[one] - fieldValues[two] || one - two;
      });
    for (const index of candidates) {
      if (currentLandCount <= initialLandCount) break;
      landMask[index] = false;
      currentLandCount -= 1;
    }
  }
}

function separateNativeShelfClusters(
  landMask: boolean[],
  clusters: readonly number[][],
  fieldValues: readonly number[],
  waterPriority: ArrayLike<number>,
  landPriority: ArrayLike<number>,
  constraints: GenerationConstraintPayload | undefined,
  width: number,
  height: number,
  wraps: boolean,
  anchorClusters: readonly number[][] = clusters,
  additionalProtectedTiles: ReadonlySet<number> = new Set<number>(),
) {
  const nativeClusterTiles = new Set(clusters.flat());
  const protectedAnchors = new Set([...nativeAnchorCoreTiles(anchorClusters, landMask, width, height, wraps), ...additionalProtectedTiles]);
  const carved = new Set<number>();
  const retainedClusters = clusters
    .map((cluster) => largestConnectedFieldSubset(cluster.filter((index) => landMask[index]), width, height, wraps))
    .filter((cluster) => cluster.length >= 4);
  const clusterComponents = () => {
    const components = connectedFieldSubsets(landMask, width, height, wraps);
    const componentByTile = new Int32Array(landMask.length).fill(-1);
    components.forEach((component, id) => { for (const index of component) componentByTile[index] = id; });
    return retainedClusters.map((cluster) => {
      const counts = new Map<number, number>();
      for (const index of cluster) if (landMask[index]) counts.set(componentByTile[index], (counts.get(componentByTile[index]) ?? 0) + 1);
      return [...counts].sort((one, two) => two[1] - one[1] || one[0] - two[0])[0]?.[0] ?? -1;
    });
  };
  for (let pass = 0; pass < retainedClusters.length; pass += 1) {
    const componentIds = clusterComponents();
    const collided = componentIds.findIndex((componentId, index) => componentId >= 0 && componentIds.indexOf(componentId) !== index);
    if (collided < 0) break;
    const cluster = new Set(retainedClusters[collided]);
    const boundary = [...cluster].flatMap((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
      .map(([x, y]) => y * width + x))
      .filter((index, position, all) => landMask[index]
        && !cluster.has(index)
        && !protectedAnchors.has(index)
        && constraints?.topology[index] !== 1
        && all.indexOf(index) === position)
      .sort((one, two) => fieldValues[one] - fieldValues[two] || one - two);
    if (!boundary.length) break;
    for (const index of boundary) { landMask[index] = false; carved.add(index); }
  }
  // When two authored systems touch through their own subordinate fields, an
  // exterior ring cannot cut the join without discarding the causal fields.
  // Resolve that rarer case along the nearest-anchor watershed instead. Root
  // anchors remain protected; only fringe/satellite land can become the
  // separating channel.
  for (let pass = 0; pass < retainedClusters.length; pass += 1) {
    const componentIds = clusterComponents();
    if (new Set(componentIds.filter((id) => id >= 0)).size === retainedClusters.length) break;
    const owner = new Int16Array(landMask.length).fill(-1);
    for (let index = 0; index < landMask.length; index += 1) {
      if (!landMask[index]) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      let bestOwner = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let clusterIndex = 0; clusterIndex < anchorClusters.length; clusterIndex += 1) {
        for (const anchor of anchorClusters[clusterIndex]) {
          let dx = Math.abs(x - anchor % width);
          if (wraps) dx = Math.min(dx, width - dx);
          const dy = y - Math.floor(anchor / width);
          const distance = dx * dx + dy * dy;
          if (distance < bestDistance || distance === bestDistance && clusterIndex < bestOwner) {
            bestDistance = distance;
            bestOwner = clusterIndex;
          }
        }
      }
      owner[index] = bestOwner;
    }
    const watershed = new Set<number>();
    for (let index = 0; index < landMask.length; index += 1) {
      if (!landMask[index] || owner[index] < 0) continue;
      for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
        const next = y * width + x;
        if (!landMask[next] || owner[next] < 0 || owner[next] === owner[index]) continue;
        const candidate = [index, next]
          .filter((tile) => !protectedAnchors.has(tile) && constraints?.topology[tile] !== 1)
          .sort((one, two) => (landPriority[one] ?? 0) - (landPriority[two] ?? 0) || fieldValues[one] - fieldValues[two] || one - two)[0];
        if (candidate !== undefined) watershed.add(candidate);
      }
    }
    if (!watershed.size) break;
    for (const index of watershed) { landMask[index] = false; carved.add(index); }
  }
  if (!carved.size) return;
  const clusterNeighborhood = new Set(nativeClusterTiles);
  let frontier = [...nativeClusterTiles];
  for (let radius = 0; radius < 2; radius += 1) {
    const next: number[] = [];
    for (const index of frontier) for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
      const neighbor = y * width + x;
      if (clusterNeighborhood.has(neighbor)) continue;
      clusterNeighborhood.add(neighbor);
      next.push(neighbor);
    }
    frontier = next;
  }
  const replacements = landMask.flatMap((land, index) => !land
    && !carved.has(index)
    && !clusterNeighborhood.has(index)
    && constraints?.topology[index] !== 0
    && !((waterPriority[index] ?? 0) > (landPriority[index] ?? 0) && (waterPriority[index] ?? 0) > 0)
    ? [index] : [])
    .sort((one, two) => fieldValues[two] - fieldValues[one] || one - two);
  for (const index of replacements.slice(0, carved.size)) landMask[index] = true;
  // If a very small or heavily protected map cannot offer enough distant
  // replacement tiles, restore the unpaired cuts rather than violating the
  // explicit water budget.
  const deficit = carved.size - Math.min(carved.size, replacements.length);
  for (const index of [...carved].sort((one, two) => fieldValues[two] - fieldValues[one] || one - two).slice(0, deficit)) landMask[index] = true;
}

function separateNativeRealmVoronoi(
  landMask: boolean[],
  anchorClusters: readonly number[][],
  fieldValues: readonly number[],
  waterPriority: ArrayLike<number>,
  landPriority: ArrayLike<number>,
  constraints: GenerationConstraintPayload | undefined,
  width: number,
  height: number,
  wraps: boolean,
) {
  if (anchorClusters.length < 2 || anchorClusters.some((cluster) => cluster.length < 4)) return;
  const protectedAnchors = nativeAnchorCoreTiles(anchorClusters, landMask, width, height, wraps);
  const owner = new Int16Array(landMask.length).fill(-1);
  for (let index = 0; index < landMask.length; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    let bestOwner = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let clusterIndex = 0; clusterIndex < anchorClusters.length; clusterIndex += 1) {
      for (const anchor of anchorClusters[clusterIndex]) {
        let dx = Math.abs(x - anchor % width);
        if (wraps) dx = Math.min(dx, width - dx);
        const dy = y - Math.floor(anchor / width);
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance || distance === bestDistance && clusterIndex < bestOwner) {
          bestDistance = distance;
          bestOwner = clusterIndex;
        }
      }
    }
    owner[index] = bestOwner;
  }
  const seams = new Set<number>();
  for (let index = 0; index < landMask.length; index += 1) {
    if (!landMask[index] || owner[index] < 0) continue;
    for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
      const next = y * width + x;
      if (!landMask[next] || owner[next] < 0 || owner[next] === owner[index]) continue;
      const preferred = owner[index] > owner[next] ? index : next;
      const alternate = preferred === index ? next : index;
      const candidate = [preferred, alternate].find((tile) => !protectedAnchors.has(tile) && constraints?.topology[tile] !== 1);
      if (candidate !== undefined) seams.add(candidate);
    }
  }
  // Source ellipses can meet on a single hex even when their surrounding
  // Voronoi ownership happens to agree because one ellipse is elongated.
  // Cut that literal root-to-root contact as well; otherwise two differently
  // named island continents remain one exported landmass.
  for (let one = 0; one < anchorClusters.length; one += 1) {
    const left = new Set(anchorClusters[one].filter((index) => landMask[index]));
    for (let two = one + 1; two < anchorClusters.length; two += 1) {
      const right = new Set(anchorClusters[two].filter((index) => landMask[index]));
      for (const index of left) for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
        const next = y * width + x;
        if (!right.has(next)) continue;
        const candidate = [index, next]
          .filter((tile) => !protectedAnchors.has(tile) && constraints?.topology[tile] !== 1)
          .sort((first, second) => (landPriority[first] ?? 0) - (landPriority[second] ?? 0) || fieldValues[first] - fieldValues[second] || first - second)[0];
        if (candidate !== undefined) seams.add(candidate);
      }
    }
  }
  if (!seams.size) return;
  for (const index of seams) landMask[index] = false;
  const replacements = landMask.flatMap((land, index) => !land
    && !seams.has(index)
    && constraints?.topology[index] !== 0
    && !((waterPriority[index] ?? 0) > (landPriority[index] ?? 0) && (waterPriority[index] ?? 0) > 0)
    ? [index] : [])
    .sort((one, two) => fieldValues[two] - fieldValues[one] || one - two);
  let replacementCount = 0;
  for (const index of replacements) {
    if (replacementCount >= seams.size) break;
    if (!neighbors(index % width, Math.floor(index / width), width, height, wraps).every(([x, y]) => {
      const next = y * width + x;
      return !landMask[next] || owner[next] === owner[index];
    })) continue;
    landMask[index] = true;
    replacementCount += 1;
  }
  if (replacementCount < seams.size) {
    const fallback = landMask.flatMap((land, index) => !land && !seams.has(index)
      && owner[index] >= 0 && constraints?.topology[index] !== 0 ? [index] : [])
      .sort((one, two) => {
        const sameOwnerLand = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
          .filter(([x, y]) => {
            const next = y * width + x;
            return landMask[next] && owner[next] === owner[index];
          }).length;
        return sameOwnerLand(two) - sameOwnerLand(one)
          || (landPriority[two] ?? 0) - (landPriority[one] ?? 0)
          || fieldValues[two] - fieldValues[one]
          || one - two;
      });
    for (const index of fallback) {
      if (replacementCount >= seams.size) break;
      if (!neighbors(index % width, Math.floor(index / width), width, height, wraps).some(([x, y]) => {
        const next = y * width + x;
        return landMask[next] && owner[next] === owner[index];
      })) continue;
      landMask[index] = true;
      replacementCount += 1;
    }
  }
  // Keep the explicit water budget authoritative if hard constraints leave no
  // legal same-realm replacement for part of the seam.
  for (const index of [...seams].sort((one, two) => fieldValues[two] - fieldValues[one] || one - two).slice(0, seams.size - replacementCount)) landMask[index] = true;
}

function separateNativeRiftCells(
  landMask: boolean[],
  cellAnchors: readonly number[][],
  primaryPaths: readonly number[][],
  fieldValues: readonly number[],
  waterPriority: ArrayLike<number>,
  landPriority: ArrayLike<number>,
  constraints: GenerationConstraintPayload | undefined,
  width: number,
  height: number,
  wraps: boolean,
) {
  const deepCuts = new Set<number>();
  const owner = new Int16Array(landMask.length).fill(-1);
  if (cellAnchors.length < 2 || cellAnchors.some((cluster) => cluster.length < 4)) return { deepCuts, owner };
  const protectedAnchors = nativeAnchorCoreTiles(cellAnchors, landMask, width, height, wraps, 8);
  for (let index = 0; index < landMask.length; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    let bestOwner = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let cell = 0; cell < cellAnchors.length; cell += 1) for (const anchor of cellAnchors[cell]) {
      let dx = Math.abs(x - anchor % width);
      if (wraps) dx = Math.min(dx, width - dx);
      const dy = y - Math.floor(anchor / width);
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance || distance === bestDistance && cell < bestOwner) {
        bestDistance = distance;
        bestOwner = cell;
      }
    }
    owner[index] = bestOwner;
  }
  const carvedLand = new Set<number>();
  for (let index = 0; index < landMask.length; index += 1) {
    if (owner[index] < 0) continue;
    for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
      const next = y * width + x;
      if (owner[next] < 0 || owner[next] === owner[index]) continue;
      const water = [index, next].filter((tile) => !landMask[tile]);
      if (water.length) {
        // Coast is traversable before Astronomy. Every ownership-boundary edge
        // therefore needs at least one genuinely deep endpoint, even when the
        // scalar sea-level pass already made both sides water.
        deepCuts.add(water.sort((one, two) => owner[one] - owner[two] || one - two)[0]);
        continue;
      }
      const preferred = owner[index] > owner[next] ? index : next;
      const alternate = preferred === index ? next : index;
      const candidate = [preferred, alternate]
        .filter((tile) => !protectedAnchors.has(tile) && constraints?.topology[tile] !== 1)
        .sort((one, two) => (landPriority[one] ?? 0) - (landPriority[two] ?? 0) || fieldValues[one] - fieldValues[two] || one - two)[0];
      if (candidate !== undefined) { deepCuts.add(candidate); carvedLand.add(candidate); }
    }
  }
  for (const index of primaryPaths.flat()) {
    if (!landMask[index]) deepCuts.add(index);
    else if (!protectedAnchors.has(index) && constraints?.topology[index] !== 1) { deepCuts.add(index); carvedLand.add(index); }
  }
  if (!deepCuts.size) return { deepCuts, owner };
  for (const index of deepCuts) landMask[index] = false;
  const replacements = landMask.flatMap((land, index) => !land
    && !deepCuts.has(index)
    && constraints?.topology[index] !== 0
    && !((waterPriority[index] ?? 0) > (landPriority[index] ?? 0) && (waterPriority[index] ?? 0) > 0)
    ? [index] : [])
    .sort((one, two) => fieldValues[two] - fieldValues[one] || one - two);
  let replaced = 0;
  for (const index of replacements) {
    if (replaced >= carvedLand.size) break;
    if (!neighbors(index % width, Math.floor(index / width), width, height, wraps).every(([x, y]) => {
      const next = y * width + x;
      return !landMask[next] || owner[next] === owner[index];
    })) continue;
    landMask[index] = true;
    replaced += 1;
  }
  const restored = [...carvedLand].sort((one, two) => fieldValues[two] - fieldValues[one] || one - two).slice(0, carvedLand.size - replaced);
  for (const index of restored) { landMask[index] = true; deepCuts.delete(index); }
  return { deepCuts, owner };
}

function nativeFieldEffectMatches(
  effect: NarrativeFieldSource["effect"] | NarrativePathReservation["effect"],
  index: number,
  tiles: readonly Civ5Tile[],
  temperatures: readonly number[],
  moistures: readonly number[],
  width: number,
  height: number,
  wraps: boolean,
) {
  const tile = tiles[index];
  if (!tile) return false;
  if (effect === "WATER" || effect === "WATER_PATH") return tile.terrain < 2;
  if (effect === "LAND" || effect === "LAND_PATH") return tile.terrain >= 2;
  if (effect === "RIDGE" || effect === "RIDGE_PATH" || effect === "VOLCANIC") return tile.terrain >= 2 && tile.elevation > 0;
  if (effect === "LOWLAND") return tile.terrain >= 2 && tile.elevation < 2;
  if (effect === "WET") return tile.terrain >= 2 && moistures[index] >= 0.58 && (tile.terrain === 2 || tile.feature === 0 || tile.feature === 1 || tile.feature === 2);
  if (effect === "DRY") return tile.terrain >= 2 && moistures[index] <= 0.36 && (tile.terrain === 3 || tile.terrain === 4);
  if (effect === "HOT") return tile.terrain >= 2 && temperatures[index] >= 0.62 && (tile.terrain === 3 || tile.terrain === 4);
  if (effect === "COLD") return tile.terrain >= 2 && temperatures[index] <= 0.42 && (tile.terrain === 5 || tile.terrain === 6);
  if (effect === "VALUE") return tile.terrain >= 2 && (tile.resource !== 255 || tile.wonder !== 255 || tile.terrain === 2);
  if (effect === "BARREN") return tile.terrain >= 2 && tile.feature === 255 && tile.resource === 255 && tile.wonder === 255;
  if (effect === "RIVER_PATH") return tile.terrain >= 2 && tile.river > 0;
  if (effect === "TRANSITION") {
    const climates = new Set<string>();
    for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
      const neighbor = y * width + x;
      const neighborTile = tiles[neighbor];
      if (neighborTile.terrain < 2) continue;
      climates.add(`${neighborTile.terrain}:${neighborTile.elevation}:${Math.round(temperatures[neighbor] * 4)}:${Math.round(moistures[neighbor] * 4)}`);
    }
    return tile.terrain >= 2 && climates.size >= 2;
  }
  return false;
}

function presetField(
  preset: MapPresetId,
  nx: number,
  ny: number,
  noise: number,
  centers: Center[],
  wraps: boolean,
) {
  const blobs = centerField(nx, ny, centers, wraps);
  const boundaries = voronoiBoundary(nx, ny, centers, wraps);
  if (preset === "PANGAEA") return blobs * 0.7 + noise * 0.46 + boundaries * 0.08 - Math.abs(ny - 0.5) * 0.08;
  if (preset === "ARCHIPELAGO") return blobs * 0.48 + noise * 0.56 + boundaries * 0.06;
  if (preset === "INLAND_SEAS") return 0.78 - blobs * 0.5 + noise * 0.27 - boundaries * 0.08;
  if (preset === "EARTHSEA") return blobs * 0.56 + noise * 0.5 + boundaries * 0.08;
  if (preset === "RIFT_REALMS") {
    const rift = Math.abs(Math.sin((nx * 4.4 + Math.sin(ny * 11) * 0.22 + noise * 0.34) * Math.PI));
    return blobs * 0.55 + noise * 0.43 - (1 - rift) * 0.32 + boundaries * 0.08;
  }
  if (preset === "LABYRINTH") {
    const maze = Math.abs(Math.sin((nx * 5.2 + noise * 0.8) * Math.PI) * Math.cos((ny * 4.4 - noise * 0.6) * Math.PI));
    return maze * 0.46 + blobs * 0.22 + noise * 0.42 - boundaries * 0.13;
  }
  if (preset === "WILD_REGIONS") {
    const brokenCells = Math.sin((nx * 7 + noise * 2.4) * Math.PI) * Math.cos((ny * 6 - noise * 1.7) * Math.PI);
    return blobs * 0.38 + noise * 0.5 + brokenCells * 0.14 + boundaries * 0.13;
  }
  return blobs * 0.62 + noise * 0.44 + boundaries * 0.08;
}

function neighbors(x: number, y: number, width: number, height: number, wraps: boolean) {
  const offsets = y % 2 === 0
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  const result: Array<[number, number]> = [];
  for (const [dx, dy] of offsets) {
    let nextX = x + dx;
    const nextY = y + dy;
    if (wraps) nextX = (nextX + width) % width;
    if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) result.push([nextX, nextY]);
  }
  return result;
}

function passableReach(
  origin: number,
  landMask: boolean[],
  elevations: number[],
  width: number,
  height: number,
  wraps: boolean,
) {
  const reached = new Set<number>([origin]);
  const queue = [origin];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    for (const [nx, ny] of neighbors(x, y, width, height, wraps)) {
      const next = ny * width + nx;
      if (!landMask[next] || elevations[next] === 2 || reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return reached;
}

/**
 * Mountains may constrain movement, but may never seal off otherwise walkable
 * territory. Each landmass receives the fewest short hill passes needed to
 * join all of its non-mountain regions.
 */
function carveAccessiblePasses(
  landMask: boolean[],
  elevations: number[],
  width: number,
  height: number,
  wraps: boolean,
) {
  const assigned = new Set<number>();
  for (let origin = 0; origin < landMask.length; origin += 1) {
    if (!landMask[origin] || assigned.has(origin)) continue;
    const landmass: number[] = [];
    const landQueue = [origin];
    assigned.add(origin);
    for (let cursor = 0; cursor < landQueue.length; cursor += 1) {
      const index = landQueue[cursor];
      landmass.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      for (const [nx, ny] of neighbors(x, y, width, height, wraps)) {
        const next = ny * width + nx;
        if (!landMask[next] || assigned.has(next)) continue;
        assigned.add(next);
        landQueue.push(next);
      }
    }

    let passableOrigin = landmass.find((index) => elevations[index] !== 2);
    if (passableOrigin === undefined) {
      passableOrigin = landmass[0];
      elevations[passableOrigin] = 1;
    }
    let accessible = passableReach(passableOrigin, landMask, elevations, width, height, wraps);
    let target = landmass.find((index) => elevations[index] !== 2 && !accessible.has(index));

    while (target !== undefined) {
      const previous = new Int32Array(landMask.length);
      previous.fill(-2);
      const queue = [...accessible];
      for (const index of accessible) previous[index] = -1;
      let bridge = -1;
      for (let cursor = 0; cursor < queue.length && bridge < 0; cursor += 1) {
        const index = queue[cursor];
        const x = index % width;
        const y = Math.floor(index / width);
        for (const [nx, ny] of neighbors(x, y, width, height, wraps)) {
          const next = ny * width + nx;
          if (!landMask[next] || previous[next] !== -2) continue;
          previous[next] = index;
          if (elevations[next] !== 2 && !accessible.has(next)) {
            bridge = next;
            break;
          }
          queue.push(next);
        }
      }
      if (bridge < 0) break;
      for (let index = bridge; index >= 0 && !accessible.has(index); index = previous[index]) {
        if (elevations[index] === 2) elevations[index] = 1;
      }
      accessible = passableReach(passableOrigin, landMask, elevations, width, height, wraps);
      target = landmass.find((index) => elevations[index] !== 2 && !accessible.has(index));
    }
  }
}

function passableLandIsConnectedWithinLandmasses(landMask: boolean[], elevations: number[], width: number, height: number, wraps: boolean) {
  const assigned = new Set<number>();
  for (let origin = 0; origin < landMask.length; origin += 1) {
    if (!landMask[origin] || assigned.has(origin)) continue;
    const landmass: number[] = [];
    const queue = [origin];
    assigned.add(origin);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      landmass.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      for (const [nx, ny] of neighbors(x, y, width, height, wraps)) {
        const next = ny * width + nx;
        if (!landMask[next] || assigned.has(next)) continue;
        assigned.add(next);
        queue.push(next);
      }
    }
    const passable = landmass.filter((index) => elevations[index] !== 2);
    if (!passable.length) return false;
    const reached = passableReach(passable[0], landMask, elevations, width, height, wraps);
    if (passable.some((index) => !reached.has(index))) return false;
  }
  return true;
}

function restoreAccessibleMountainTarget(landMask: boolean[], elevations: number[], relief: number[], percent: number, width: number, height: number, wraps: boolean, protectedTiles = new Set<number>()) {
  const desired = Math.round(landMask.filter(Boolean).length * clamp(percent / 100, 0, 0.42));
  let current = elevations.filter((elevation, index) => landMask[index] && elevation === 2).length;
  // Relief generation deliberately starts with a surplus so accessibility can
  // cut passes. When fewer passes are required, trim the weakest remaining
  // peaks back to the explicit user budget instead of letting a native ridge
  // reservation silently raise the requested mountain percentage.
  if (current > desired) {
    const surplus = relief
      .flatMap((value, index) => landMask[index] && elevations[index] === 2 && !protectedTiles.has(index) ? [{ index, value }] : [])
      .sort((one, two) => one.value - two.value || one.index - two.index);
    for (const candidate of surplus) {
      if (current <= desired) break;
      elevations[candidate.index] = 1;
      current -= 1;
    }
  }
  if (current >= desired) return;
  const candidates = relief.flatMap((value, index) => landMask[index] && elevations[index] !== 2 && !protectedTiles.has(index) ? [{ index, value }] : []).sort((one, two) => two.value - one.value || one.index - two.index);
  for (const candidate of candidates) {
    if (current >= desired) break;
    const previous = elevations[candidate.index];
    elevations[candidate.index] = 2;
    if (passableLandIsConnectedWithinLandmasses(landMask, elevations, width, height, wraps)) current += 1;
    else elevations[candidate.index] = previous;
  }
}

function chooseTerrain(
  temperature: number,
  moisture: number,
  variation: number,
  dominantTerrains: DominantTerrain[],
  brutal: boolean,
) {
  const dominant = new Set(dominantTerrains);
  const bias = (terrain: DominantTerrain) => dominant.has(terrain) ? 0.62 : 0;
  const scores: Array<[number, number]> = [
    [2, 1.08 - Math.abs(moisture - 0.72) * 1.35 - Math.abs(temperature - 0.61) * 0.72 + bias("GRASSLAND") - (brutal ? 0.22 : 0)],
    [3, 0.98 - Math.abs(moisture - 0.48) * 1.12 - Math.abs(temperature - 0.57) * 0.42 + bias("PLAINS") + (brutal ? 0.12 : 0)],
    [4, 0.62 + (temperature - 0.58) * 0.7 + (0.35 - moisture) * 1.7 + bias("DESERT") + (brutal ? 0.16 : 0)],
    [5, 0.75 + (0.4 - temperature) * 1.62 - Math.abs(moisture - 0.5) * 0.32 + bias("TUNDRA") + (brutal ? 0.08 : 0)],
    [6, 0.75 + (0.24 - temperature) * 3.4 - Math.abs(moisture - 0.56) * 0.18],
  ];
  // Broad, low-amplitude regional variation breaks visible latitude bands
  // without erasing the overall temperature gradient.
  scores[0][1] += variation * 0.16;
  scores[1][1] -= variation * 0.08;
  scores[2][1] -= variation * 0.12;
  scores[3][1] += variation * 0.1;
  return scores.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
}

type RiverEdge = {
  a: number;
  b: number;
  owner: number;
  bit: RiverEdgeBit;
  tiles: [number, number];
};

type RiverVertex = {
  edges: number[];
  key: string;
  tiles: number[];
};

type DrainageHeapItem = { cost: number; vertex: number };

function pushDrainageHeap(heap: DrainageHeapItem[], item: DrainageHeapItem) {
  heap.push(item);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].cost <= item.cost) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = item;
}

function popDrainageHeap(heap: DrainageHeapItem[]) {
  if (!heap.length) return undefined;
  const first = heap[0];
  const last = heap.pop()!;
  if (heap.length) {
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= heap.length) break;
      const child = right < heap.length && heap[right].cost < heap[left].cost ? right : left;
      if (heap[child].cost >= last.cost) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = last;
  }
  return first;
}

export function generateRiverNetwork(
  tiles: Civ5Tile[],
  reliefValues: number[],
  moistures: number[],
  width: number,
  height: number,
  wraps: boolean,
  style: GenerationStyle,
  rainfall: RainfallSetting,
  random: () => number,
  waterMask?: ReadonlyArray<boolean>,
  density: RiverDensity = "NORMAL",
  corridorGuidance?: ReadonlyArray<number>,
  minimumSources = 1,
  minimumPathEdges = 4,
) {
  const isWaterTile = (index: number) => waterMask?.[index] ?? tiles[index].terrain < 2;
  const vertices: RiverVertex[] = [];
  const vertexByKey = new Map<string, number>();
  const edges: RiverEdge[] = [];
  const vertexIndex = (key: string, adjacentTiles: [number, number]) => {
    let index = vertexByKey.get(key);
    if (index === undefined) {
      index = vertices.length;
      vertexByKey.set(key, index);
      vertices.push({ key, edges: [], tiles: [] });
    }
    for (const tile of adjacentTiles) if (!vertices[index].tiles.includes(tile)) vertices[index].tiles.push(tile);
    return index;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const owner = y * width + x;
      for (const definition of riverEdgeDefinitions(x, y)) {
        let nextX = x + definition.dx;
        const nextY = y + definition.dy;
        if (wraps) nextX = (nextX + width) % width;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        // Do not route a visual river across the rendered map seam. It can
        // still terminate on either coast while the land remains cylindrical.
        if (Math.abs(nextX - x) > 1) continue;
        const neighborIndex = nextY * width + nextX;
        const adjacentTiles: [number, number] = [owner, neighborIndex];
        const a = vertexIndex(definition.a, adjacentTiles);
        const b = vertexIndex(definition.b, adjacentTiles);
        // A river mouth ends at a coastal/lake vertex. It never occupies the
        // shoreline edge itself, which would render as a river in the water.
        if (isWaterTile(owner) || isWaterTile(neighborIndex)) continue;
        const edgeIndex = edges.length;
        edges.push({ a, b, owner, bit: definition.bit, tiles: adjacentTiles });
        vertices[a].edges.push(edgeIndex);
        vertices[b].edges.push(edgeIndex);
      }
    }
  }

  const isWater = vertices.map((vertex) => vertex.tiles.some(isWaterTile));
  if (!isWater.some(Boolean)) return new Uint8Array(tiles.length);
  const rawHeight = vertices.map((vertex, vertexNumber) => {
    if (isWater[vertexNumber]) return -1;
    const land = vertex.tiles.filter((index) => !isWaterTile(index));
    const relief = land.reduce((sum, index) => sum + reliefValues[index], 0) / Math.max(1, land.length);
    const elevation = Math.max(...land.map((index) => tiles[index].elevation));
    const guidance = land.reduce((sum, index) => sum + (corridorGuidance?.[index] ?? 0), 0) / Math.max(1, land.length);
    return relief + elevation * 0.28 - guidance * 0.16;
  });

  // Priority-flood fills local depressions just enough to create a monotonic
  // drainage surface. Every parent pointer therefore leads toward water while
  // still preferring the lowest available terrain.
  const drainageHeight = new Float64Array(vertices.length);
  drainageHeight.fill(Number.POSITIVE_INFINITY);
  const parentVertex = new Int32Array(vertices.length);
  const parentEdge = new Int32Array(vertices.length);
  parentVertex.fill(-1);
  parentEdge.fill(-1);
  const heap: DrainageHeapItem[] = [];
  for (let vertex = 0; vertex < vertices.length; vertex += 1) {
    if (!isWater[vertex]) continue;
    drainageHeight[vertex] = -1;
    pushDrainageHeap(heap, { vertex, cost: -1 });
  }
  while (heap.length) {
    const current = popDrainageHeap(heap)!;
    if (current.cost !== drainageHeight[current.vertex]) continue;
    for (const edgeIndex of vertices[current.vertex].edges) {
      const edge = edges[edgeIndex];
      const next = edge.a === current.vertex ? edge.b : edge.a;
      const candidate = Math.max(rawHeight[next], current.cost + 0.0001);
      if (candidate >= drainageHeight[next]) continue;
      drainageHeight[next] = candidate;
      parentVertex[next] = current.vertex;
      parentEdge[next] = edgeIndex;
      pushDrainageHeap(heap, { vertex: next, cost: candidate });
    }
  }

  // Accumulate the moisture contributed by every upstream junction. This
  // produces a genuine watershed hierarchy: long, wet catchments become
  // major rivers while smaller mountain branches become tributaries.
  const drainageAccumulation = new Float64Array(vertices.length);
  for (let vertex = 0; vertex < vertices.length; vertex += 1) {
    if (isWater[vertex]) continue;
    const moisture = vertices[vertex].tiles.reduce((sum, index) => sum + moistures[index], 0) / Math.max(1, vertices[vertex].tiles.length);
    drainageAccumulation[vertex] = 0.2 + moisture;
  }
  const drainageOrder = Array.from({ length: vertices.length }, (_value, vertex) => vertex)
    .filter((vertex) => !isWater[vertex] && Number.isFinite(drainageHeight[vertex]))
    .sort((one, two) => drainageHeight[two] - drainageHeight[one]);
  for (const vertex of drainageOrder) {
    const parent = parentVertex[vertex];
    if (parent >= 0) drainageAccumulation[parent] += drainageAccumulation[vertex];
  }

  const candidates = vertices.flatMap((vertex, vertexNumber) => {
    if (isWater[vertexNumber] || parentEdge[vertexNumber] < 0 || vertex.edges.length < 2) return [];
    const mountainTile = vertex.tiles.find((index) => !isWaterTile(index) && tiles[index].elevation === 2);
    if (mountainTile === undefined) return [];
    let current = vertexNumber;
    let length = 0;
    const seen = new Set<number>();
    while (!isWater[current] && parentVertex[current] >= 0 && length <= width + height) {
      if (seen.has(current)) break;
      seen.add(current);
      current = parentVertex[current];
      length += 1;
    }
    if (!isWater[current] || length < minimumPathEdges) return [];
    const moisture = vertex.tiles.reduce((sum, index) => sum + moistures[index], 0) / Math.max(1, vertex.tiles.length);
    const guidance = vertex.tiles.reduce((sum, index) => sum + (corridorGuidance?.[index] ?? 0), 0) / Math.max(1, vertex.tiles.length);
    return [{
      vertex: vertexNumber,
      mountainTile,
      length,
      score: moisture * 1.05 + rawHeight[vertexNumber] * 0.48 + guidance * 0.5 + Math.log1p(drainageAccumulation[vertexNumber]) * 0.72 + Math.min(length, 24) * 0.018 + random() * 0.18,
    }];
  }).sort((a, b) => b.score - a.score);

  const landCount = tiles.reduce((count, _tile, index) => count + (isWaterTile(index) ? 0 : 1), 0);
  const rainfallFactor = rainfall === "WET" ? 1.5 : rainfall === "ARID" ? 0.58 : 1;
  const styleFactor = worldCharacterProfile(style).riverSourceFactor;
  const densityFactor = density === "DENSE" ? 1.55 : density === "SPARSE" ? 0.62 : 1;
  const desiredSources = Math.max(1, Math.min(48, Math.max(minimumSources, Math.round(landCount * 0.0024 * rainfallFactor * styleFactor * densityFactor))));
  const selectedMountains: Array<[number, number]> = [];
  const networkVertices = new Set<number>();
  const networkEdges = new Set<number>();
  const edgeFlowFromAToB = new Map<number, boolean>();

  for (const candidate of candidates) {
    if (selectedMountains.length >= desiredSources) break;
    const location: [number, number] = [candidate.mountainTile % width, Math.floor(candidate.mountainTile / width)];
    if (selectedMountains.some((selected) => hexDistance(location, selected, width, wraps) < 5)) continue;
    if (networkVertices.has(candidate.vertex)) continue;
    const pathEdges: number[] = [];
    const pathVertices = [candidate.vertex];
    let current = candidate.vertex;
    let reachedDrainage = false;
    const seen = new Set<number>();
    while (!isWater[current] && parentEdge[current] >= 0 && pathEdges.length <= width + height) {
      if (seen.has(current)) break;
      seen.add(current);
      const edgeIndex = parentEdge[current];
      const next = parentVertex[current];
      pathEdges.push(edgeIndex);
      const edge = edges[edgeIndex];
      edgeFlowFromAToB.set(edgeIndex, edge.a === current && edge.b === next);
      pathVertices.push(next);
      current = next;
      if (isWater[current]) {
        // Two channels sharing only the same mouth would turn that coastal
        // vertex into an apparent inland continuation instead of an outlet.
        reachedDrainage = !networkVertices.has(current);
        break;
      }
      if (networkVertices.has(current)) {
        reachedDrainage = true;
        break;
      }
    }
    if (!reachedDrainage || pathEdges.length < Math.max(2, minimumPathEdges - 1)) continue;
    selectedMountains.push(location);
    for (const edgeIndex of pathEdges) networkEdges.add(edgeIndex);
    for (const vertex of pathVertices) networkVertices.add(vertex);
  }

  const rivers = new Uint8Array(tiles.length);
  for (const edgeIndex of networkEdges) {
    const edge = edges[edgeIndex];
    rivers[edge.owner] = setRiverEdge(rivers[edge.owner], edge.bit, edgeFlowFromAToB.get(edgeIndex) ?? true);
  }
  return rivers;
}

/**
 * Compile one authored river relationship into Civ V's directed edge format.
 *
 * The ordinary hydrology pass is free to choose the strongest catchments in
 * the world. A narrative transect is stricter: its river must begin at the
 * authored mountain wall, cross the authored wetland, and end at the authored
 * coast. This searches the real land-edge graph for exactly that route and
 * writes only the edges on the selected spine. The returned indices are the
 * actual Civ V owner plots, so retained evidence can be checked against the
 * final binary representation rather than the original graph reservation.
 */
function realizeNarrativeRiverSpine(
  tiles: Civ5Tile[],
  width: number,
  height: number,
  wraps: boolean,
  sourceRegion: readonly number[],
  wetlandRegion: readonly number[],
  coastRegion: readonly number[],
  preferredCorridor: readonly number[],
  requiredOutletWater: readonly number[] = [],
  blockedRiverTiles: ReadonlySet<number> = new Set<number>(),
  corridorRadius?: number,
  blockedRiverVertices: Set<string> = new Set<string>(),
  clearOwnerRivers = false,
) {
  const vertices: RiverVertex[] = [];
  const vertexByKey = new Map<string, number>();
  const edges: RiverEdge[] = [];
  const vertexIndex = (key: string, adjacentTiles: [number, number]) => {
    let index = vertexByKey.get(key);
    if (index === undefined) {
      index = vertices.length;
      vertexByKey.set(key, index);
      vertices.push({ key, edges: [], tiles: [] });
    }
    for (const tile of adjacentTiles) if (!vertices[index].tiles.includes(tile)) vertices[index].tiles.push(tile);
    return index;
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const owner = y * width + x;
    for (const definition of riverEdgeDefinitions(x, y)) {
      let nextX = x + definition.dx;
      const nextY = y + definition.dy;
      if (wraps) nextX = (nextX + width) % width;
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height || Math.abs(nextX - x) > 1) continue;
      const neighborIndex = nextY * width + nextX;
      const adjacentTiles: [number, number] = [owner, neighborIndex];
      const a = vertexIndex(definition.a, adjacentTiles);
      const b = vertexIndex(definition.b, adjacentTiles);
      if (tiles[owner].terrain < 2 || tiles[neighborIndex].terrain < 2
        || blockedRiverTiles.has(owner) || blockedRiverTiles.has(neighborIndex)
        || blockedRiverVertices.has(definition.a) || blockedRiverVertices.has(definition.b)) continue;
      const edgeIndex = edges.length;
      edges.push({ a, b, owner, bit: definition.bit, tiles: adjacentTiles });
      vertices[a].edges.push(edgeIndex);
      vertices[b].edges.push(edgeIndex);
    }
  }
  const expandTiles = (indices: readonly number[], radius: number) => {
    const reached = new Set(indices.filter((index) => index >= 0 && index < tiles.length));
    let frontier = [...reached];
    for (let step = 0; step < radius; step += 1) {
      const next: number[] = [];
      for (const index of frontier) for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
        const neighbor = y * width + x;
        if (!reached.has(neighbor)) { reached.add(neighbor); next.push(neighbor); }
      }
      frontier = next;
    }
    return reached;
  };
  const source = new Set(sourceRegion.filter((index) => tiles[index]?.terrain >= 2 && tiles[index].elevation === 2));
  const wetland = expandTiles(wetlandRegion, 1);
  const coast = expandTiles(coastRegion, 1);
  const requiredWater = new Set(requiredOutletWater.filter((index) => tiles[index]?.terrain < 2));
  const preferred = expandTiles(preferredCorridor, 1);
  const allowedCorridor = corridorRadius === undefined
    ? undefined
    : expandTiles(preferredCorridor, Math.max(1, Math.round(corridorRadius)));
  const waterAdjacent = vertices.map((vertex) => vertex.tiles.some((index) => tiles[index]?.terrain < 2));
  const sources = vertices.flatMap((vertex, index) => !waterAdjacent[index] && vertex.tiles.some((tile) => source.has(tile)) ? [index] : []);
  const outlets = new Set(vertices.flatMap((vertex, index) => waterAdjacent[index]
    && vertex.tiles.some((tile) => coast.has(tile) && tiles[tile]?.terrain >= 2)
    && (!requiredWater.size || vertex.tiles.some((tile) => requiredWater.has(tile))) ? [index] : []));
  if (!sources.length || !outlets.size || !wetland.size) return [];

  // State carries whether this route has already crossed the wetland. A
  // coastal vertex is terminal-only, preventing a river from travelling back
  // inland after it has reached the sea.
  const stateCount = vertices.length * 2;
  const distances = new Float64Array(stateCount);
  distances.fill(Number.POSITIVE_INFINITY);
  const previousState = new Int32Array(stateCount).fill(-1);
  const previousEdge = new Int32Array(stateCount).fill(-1);
  const heap: DrainageHeapItem[] = [];
  const touchesWetland = (vertex: number) => vertices[vertex].tiles.some((tile) => wetland.has(tile));
  for (const vertex of sources) {
    const state = vertex * 2 + (touchesWetland(vertex) ? 1 : 0);
    distances[state] = 0;
    pushDrainageHeap(heap, { vertex: state, cost: 0 });
  }
  let terminal = -1;
  while (heap.length) {
    const current = popDrainageHeap(heap)!;
    if (current.cost !== distances[current.vertex]) continue;
    const vertex = Math.floor(current.vertex / 2);
    const crossedWetland = current.vertex % 2 === 1;
    if (crossedWetland && outlets.has(vertex) && previousEdge[current.vertex] >= 0) { terminal = current.vertex; break; }
    if (waterAdjacent[vertex]) continue;
    for (const edgeIndex of vertices[vertex].edges) {
      const edge = edges[edgeIndex];
      if (allowedCorridor && !allowedCorridor.has(edge.owner) && !edge.tiles.some((tile) => allowedCorridor.has(tile))) continue;
      const nextVertex = edge.a === vertex ? edge.b : edge.a;
      if (waterAdjacent[nextVertex] && !outlets.has(nextVertex)) continue;
      const nextCrossed = crossedWetland || touchesWetland(nextVertex);
      const nextState = nextVertex * 2 + (nextCrossed ? 1 : 0);
      const guided = preferred.has(edge.owner) || edge.tiles.some((tile) => preferred.has(tile));
      const stepCost = guided ? 0.55 : 1;
      const nextDistance = current.cost + stepCost;
      if (nextDistance >= distances[nextState]) continue;
      distances[nextState] = nextDistance;
      previousState[nextState] = current.vertex;
      previousEdge[nextState] = edgeIndex;
      pushDrainageHeap(heap, { vertex: nextState, cost: nextDistance });
    }
  }
  if (terminal < 0) return [];
  const path: Array<{ edge: number; from: number; to: number }> = [];
  for (let state = terminal; previousState[state] >= 0; state = previousState[state]) {
    path.push({ edge: previousEdge[state], from: Math.floor(previousState[state] / 2), to: Math.floor(state / 2) });
  }
  path.reverse();
  if (path.length < 3) return [];
  const owners = [...new Set(path.map(({ edge }) => edges[edge].owner))];
  if (clearOwnerRivers) for (const owner of owners) tiles[owner].river = 0;
  for (const step of path) {
    const edge = edges[step.edge];
    tiles[edge.owner].river = setRiverEdge(tiles[edge.owner].river, edge.bit, edge.a === step.from && edge.b === step.to);
    blockedRiverVertices.add(vertices[step.from].key);
    blockedRiverVertices.add(vertices[step.to].key);
  }
  return owners;
}

/**
 * Remove stale final river components without disturbing an exact authored
 * channel. Late accessibility, start, and content passes can legitimately
 * flatten a generic headwater after the initial hydrology pass. The resulting
 * encoded component may still look like a river, but it no longer has a legal
 * mountain-to-water cause chain. Work from Civ V's real edge graph and prune
 * only edges outside the protected authored owner set; if the protected chain
 * itself is ever malformed, fail closed so native evidence cannot claim it.
 */
function pruneIllogicalRiverComponents(
  tiles: Civ5Tile[],
  width: number,
  height: number,
  wraps: boolean,
  protectedOwners: ReadonlySet<number> = new Set<number>(),
) {
  const logical = (system: ReturnType<typeof reconstructCiv5RiverEdgeSystems>[number]) => system.edgeCount >= 3
    && system.acyclic
    && system.sourceVertices.length > 0
    && system.outletVertices.length > 0
    && system.deadEndVertices.length === 0
    && system.waterInteriorVertices.length === 0
    && system.directedToOutlet;
  let removedEdges = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    const invalid = reconstructCiv5RiverEdgeSystems({ width, height, wraps, tiles }).filter((system) => !logical(system));
    if (!invalid.length) return { clean: true, removedEdges };
    let removedThisPass = 0;
    for (const system of invalid) for (const edge of system.edges) {
      if (protectedOwners.has(edge.owner)) continue;
      const prior = tiles[edge.owner].river;
      tiles[edge.owner].river = clearRiverEdge(prior, edge.bit);
      if (tiles[edge.owner].river !== prior) { removedEdges += 1; removedThisPass += 1; }
    }
    if (!removedThisPass) break;
  }
  const clean = reconstructCiv5RiverEdgeSystems({ width, height, wraps, tiles }).every(logical);
  return { clean, removedEdges };
}

function hexDistance(a: [number, number], b: [number, number], width: number, wraps: boolean) {
  const toCube = ([x, y]: [number, number]) => {
    const q = x - (y - (y & 1)) / 2;
    return [q, -q - y, y];
  };
  const direct = (one: [number, number], two: [number, number]) => {
    const ac = toCube(one);
    const bc = toCube(two);
    return Math.max(Math.abs(ac[0] - bc[0]), Math.abs(ac[1] - bc[1]), Math.abs(ac[2] - bc[2]));
  };
  if (!wraps) return direct(a, b);
  return Math.min(direct(a, b), direct([a[0] - width, a[1]], b), direct([a[0] + width, a[1]], b));
}

function passableRegionSizes(tiles: Civ5Tile[], width: number, height: number, wraps: boolean) {
  const sizes = new Int32Array(tiles.length);
  const visited = new Uint8Array(tiles.length);
  for (let origin = 0; origin < tiles.length; origin += 1) {
    if (visited[origin] || tiles[origin].terrain < 2 || tiles[origin].elevation === 2) continue;
    const component = [origin];
    visited[origin] = 1;
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      const index = component[cursor];
      const x = index % width;
      const y = Math.floor(index / width);
      for (const [nx, ny] of neighbors(x, y, width, height, wraps)) {
        const next = ny * width + nx;
        if (visited[next] || tiles[next].terrain < 2 || tiles[next].elevation === 2) continue;
        visited[next] = 1;
        component.push(next);
      }
    }
    for (const index of component) sizes[index] = component.length;
  }
  return sizes;
}

function placeStartLocations(
  tiles: Civ5Tile[],
  width: number,
  height: number,
  count: number,
  wraps: boolean,
  balance: MultiplayerBalance,
  teamSize: 2 | 3 | 4,
  teamLayout: TeamLayout,
  random: () => number,
  blockedTileIndices: ReadonlySet<number> = new Set<number>(),
) {
  type StartCandidate = { point: [number, number]; quality: number; workable: number; regionSize: number; rank: number };
  const candidates: StartCandidate[] = [];
  const rankSeed = Math.floor(random() * 0x7fffffff);
  const regionSizes = passableRegionSizes(tiles, width, height, wraps);
  const naturalHomeFloor = Math.max(12, Math.round(Math.sqrt(width * height) / 3));
  const minimumRegionSize = Math.min(naturalHomeFloor, Math.max(...regionSizes));
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const tile = tiles[index];
      if (tile.terrain < 2 || tile.elevation === 2 || tile.wonder !== 255 || blockedTileIndices.has(index)) continue;
      const adjacent = neighbors(x, y, width, height, wraps);
      const workable = adjacent.filter(([nx, ny]) => {
        const neighbor = tiles[ny * width + nx];
        return neighbor.terrain >= 2 && neighbor.elevation < 2;
      }).length;
      const terrainQuality = adjacent.reduce((score, [nx, ny]) => {
        const neighbor = tiles[ny * width + nx];
        if (neighbor.terrain < 2 || neighbor.elevation === 2) return score;
        return score + (neighbor.terrain === 2 ? 2.1 : neighbor.terrain === 3 ? 1.7 : neighbor.terrain === 5 ? 1.15 : 0.8) + (neighbor.resource !== 255 ? 1.6 : 0);
      }, 0);
      candidates.push({ point: [x, y], quality: workable * 1.8 + terrainQuality, workable, regionSize: regionSizes[index], rank: hashNoise(x, y, rankSeed) });
    }
  }
  if (!candidates.length) return [];
  const fallbackMinimumRegionSize = minimumRegionSize;
  const viableCandidates = candidates.filter((candidate) => candidate.regionSize >= fallbackMinimumRegionSize);
  const preferredCandidates = candidates.filter((candidate) => candidate.workable >= 4 && candidate.regionSize >= minimumRegionSize);
  let candidatePool = preferredCandidates.length >= count ? preferredCandidates : viableCandidates;
  let qualities = candidatePool.map((candidate) => candidate.quality).sort((one, two) => one - two);
  let targetQuality = qualities[Math.floor(qualities.length / 2)];
  const trialOriginsForPool = () => [...candidatePool]
    .sort((one, two) => balance === "TOURNAMENT"
      ? Math.abs(one.quality - targetQuality) - Math.abs(two.quality - targetQuality) || one.rank - two.rank
      : one.rank - two.rank)
    .slice(0, Math.min(candidatePool.length, balance === "TOURNAMENT" ? 16 : 8));
  const buildLayout = (origin: StartCandidate) => {
    const chosen = [origin];
    const occupied = new Set([`${origin.point[0]},${origin.point[1]}`]);
    while (chosen.length < count) {
      let best: StartCandidate | undefined;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const candidate of candidatePool) {
        if (occupied.has(`${candidate.point[0]},${candidate.point[1]}`)) continue;
        const nearest = Math.min(...chosen.map((item) => hexDistance(candidate.point, item.point, width, wraps)));
        if (nearest < MINIMUM_START_DISTANCE) continue;
        const comparableSite = -Math.abs(candidate.quality - targetQuality);
        const score = balance === "TOURNAMENT"
          ? nearest * 3.1 + comparableSite * 2.7 + candidate.rank * 0.02
          : nearest * 4 + candidate.quality * 0.16 + candidate.rank * 0.02;
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      if (!best) break;
      chosen.push(best);
      occupied.add(`${best.point[0]},${best.point[1]}`);
    }
    return chosen;
  };
  const layouts = trialOriginsForPool().map(buildLayout);
  const sortLayouts = () => layouts.sort((one, two) => {
    if (two.length !== one.length) return two.length - one.length;
    const qualitySpread = (layout: StartCandidate[]) => Math.max(...layout.map((item) => item.quality)) - Math.min(...layout.map((item) => item.quality));
    const minimumDistance = (layout: StartCandidate[]) => {
      let result = Number.POSITIVE_INFINITY;
      for (let a = 0; a < layout.length; a += 1) for (let b = a + 1; b < layout.length; b += 1) result = Math.min(result, hexDistance(layout[a].point, layout[b].point, width, wraps));
      return Number.isFinite(result) ? result : width + height;
    };
    if (balance === "TOURNAMENT") return qualitySpread(one) - qualitySpread(two) || minimumDistance(two) - minimumDistance(one);
    return minimumDistance(two) - minimumDistance(one) || qualitySpread(one) - qualitySpread(two);
  });
  sortLayouts();
  if ((layouts[0]?.length ?? 0) < count && candidatePool !== viableCandidates) {
    candidatePool = viableCandidates;
    qualities = candidatePool.map((candidate) => candidate.quality).sort((one, two) => one - two);
    targetQuality = qualities[Math.floor(qualities.length / 2)];
    layouts.push(...trialOriginsForPool().map(buildLayout));
    sortLayouts();
  }
  const selected = (layouts[0] ?? []).map((candidate) => candidate.point);

  if (balance === "TEAMS" && selected.length > 3) {
    let ordered: Array<[number, number]> = [];
    if (teamLayout === "FRONTLINES") {
      ordered = [...selected].sort((one, two) => one[0] - two[0] || one[1] - two[1]);
    } else if (teamLayout === "DISTRIBUTED") {
      const teamCount = Math.max(1, Math.ceil(selected.length / teamSize));
      const teams = Array.from({ length: teamCount }, () => [] as Array<[number, number]>);
      [...selected].sort((one, two) => one[0] - two[0] || one[1] - two[1]).forEach((start, index) => teams[index % teamCount].push(start));
      ordered = teams.flat();
    } else {
      const remaining = [...selected];
      while (remaining.length) {
        const anchor = remaining.shift()!;
        ordered.push(anchor);
        for (let member = 1; member < teamSize && remaining.length; member += 1) {
          let partnerIndex = 0;
          let partnerDistance = Number.POSITIVE_INFINITY;
          for (let index = 0; index < remaining.length; index += 1) {
            const distance = hexDistance(anchor, remaining[index], width, wraps);
            if (distance < partnerDistance) {
              partnerDistance = distance;
              partnerIndex = index;
            }
          }
          ordered.push(remaining.splice(partnerIndex, 1)[0]);
        }
      }
    }
    selected.splice(0, selected.length, ...ordered);
  }

  return selected.map<Civ5StartLocation>(([x, y], player) => ({
    x,
    y,
    player,
    civilization: "",
    leader: "",
    team: balance === "TEAMS" ? Math.floor(player / teamSize) : player,
    playable: true,
    cityState: false,
  }));
}

function placeCityStateLocations(
  tiles: Civ5Tile[],
  width: number,
  height: number,
  count: number,
  playerCount: number,
  wraps: boolean,
  majorStarts: Civ5StartLocation[],
  random: () => number,
  minimumSpacing: number,
  distribution: "EVEN" | "REGIONAL",
  coastalPreference: CoastalPreference,
  blockedTileIndices: ReadonlySet<number> = new Set<number>(),
) {
  if (count <= 0) return [];
  const occupied = new Set(majorStarts.map((start) => `${start.x},${start.y}`));
  const candidates: Array<[number, number]> = [];
  const regionSizes = passableRegionSizes(tiles, width, height, wraps);
  const minimumRegionSize = Math.min(12, Math.max(...regionSizes));
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (occupied.has(`${x},${y}`)) continue;
      const index = y * width + x;
      const tile = tiles[index];
      if (tile.terrain < 2 || tile.elevation === 2 || tile.wonder !== 255 || blockedTileIndices.has(index)) continue;
      if (regionSizes[index] < minimumRegionSize) continue;
      const coastal = neighbors(x, y, width, height, wraps).some(([nx, ny]) => tiles[ny * width + nx].terrain < 2);
      if (coastalPreference === "REQUIRE" && !coastal) continue;
      const workable = neighbors(x, y, width, height, wraps).filter(([nx, ny]) => {
        const neighbor = tiles[ny * width + nx];
        return neighbor.terrain >= 2 && neighbor.elevation < 2;
      }).length;
      if (workable >= 3) candidates.push([x, y]);
    }
  }

  const anchors: Array<[number, number]> = majorStarts.map((start) => [start.x, start.y]);
  const selected: Array<[number, number]> = [];
  while (selected.length < count && selected.length < candidates.length) {
    let best: [number, number] | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      if (selected.some(([x, y]) => x === candidate[0] && y === candidate[1])) continue;
      const referencePoints = [...anchors, ...selected];
      const nearest = referencePoints.length
        ? Math.min(...referencePoints.map((point) => hexDistance(candidate, point, width, wraps)))
        : width + height;
      const localYield = neighbors(candidate[0], candidate[1], width, height, wraps).reduce((score, [x, y]) => {
        const tile = tiles[y * width + x];
        return score + (tile.terrain >= 2 && tile.elevation < 2 ? 1 : 0) + (tile.resource !== 255 ? 0.5 : 0);
      }, 0);
      if (nearest < Math.max(MINIMUM_START_DISTANCE, Math.round(minimumSpacing))) continue;
      const coastal = neighbors(candidate[0], candidate[1], width, height, wraps).some(([x, y]) => tiles[y * width + x].terrain < 2);
      const region = Math.min(3, Math.floor(candidate[0] / Math.max(1, width) * 4));
      const regionCount = selected.filter(([x]) => Math.min(3, Math.floor(x / Math.max(1, width) * 4)) === region).length;
      const regionalBonus = distribution === "REGIONAL" ? Math.max(0, 4 - regionCount) * 4 : 0;
      const coastalBonus = coastalPreference === "PREFER" && coastal ? 7 : 0;
      const score = nearest * 3 + localYield + regionalBonus + coastalBonus + random() * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (!best) break;
    selected.push(best);
  }

  return selected.map<Civ5StartLocation>(([x, y], index) => ({
    x,
    y,
    player: playerCount + index,
    civilization: "",
    leader: "",
    team: 255,
    playable: false,
    cityState: true,
  }));
}

function normalizeStarts(
  tiles: Civ5Tile[],
  starts: Civ5StartLocation[],
  width: number,
  height: number,
  wraps: boolean,
  quality: StartQuality,
  tournament: boolean,
) {
  const resourceIndex = (name: string) => RESOURCES.indexOf(name);
  const placementMap = { terrains: TERRAINS, resources: RESOURCES };
  for (const start of starts) {
    const origin = tiles[start.y * width + start.x];
    if (quality === "LEGENDARY") {
      origin.terrain = 2;
      origin.elevation = 0;
      origin.feature = 255;
    }
    const visited = new Set([`${start.x},${start.y}`]);
    let frontier: Array<[number, number]> = [[start.x, start.y]];
    const workable: Array<{ x: number; y: number; tile: Civ5Tile }> = [];
    for (let radius = 0; radius < (quality === "LEGENDARY" ? 2 : 1); radius += 1) {
      const next: Array<[number, number]> = [];
      for (const [x, y] of frontier) {
        for (const [nx, ny] of neighbors(x, y, width, height, wraps)) {
          const key = `${nx},${ny}`;
          if (visited.has(key)) continue;
          visited.add(key);
          next.push([nx, ny]);
          const tile = tiles[ny * width + nx];
          if (quality === "LEGENDARY" && tile.terrain >= 2 && tile.elevation === 2 && workable.length < 2) tile.elevation = 1;
          if (tile.terrain >= 2 && tile.elevation < 2) workable.push({ x: nx, y: ny, tile });
        }
      }
      frontier = next;
    }
    if (quality === "LEGENDARY") {
      for (const [index, target] of workable.slice(0, 4).entries()) {
        if (index < 2) target.tile.terrain = 2;
        target.tile.elevation = index === 3 ? 1 : 0;
      }
    }
    const placements = quality === "LEGENDARY"
      ? ["RESOURCE_WHEAT", "RESOURCE_CATTLE", "RESOURCE_IRON", "RESOURCE_HORSE", "RESOURCE_GOLD", "RESOURCE_GEMS"]
      : ["RESOURCE_WHEAT", "RESOURCE_IRON", "RESOURCE_HORSE", ...(tournament ? ["RESOURCE_CATTLE"] : [])];
    placements.forEach((resource, index) => {
      const resourceId = resourceIndex(resource);
      const candidates = workable.length ? [...workable.slice(index % workable.length), ...workable.slice(0, index % workable.length)] : [];
      const target = candidates.find((candidate) => candidate.tile.resource === 255 && resourcePlacementVerdict(placementMap, { ...candidate.tile, resource: resourceId }).valid);
      if (!target) return;
      target.tile.resource = resourceId;
      target.tile.resourceAmount = resource.includes("IRON") || resource.includes("HORSE") ? 2 : 1;
    });
  }
}

function coordinatesWithinRadius(x: number, y: number, radius: number, width: number, height: number, wraps: boolean) {
  const result: Array<[number, number]> = [];
  for (let ny = Math.max(0, y - radius); ny <= Math.min(height - 1, y + radius); ny += 1) {
    for (let nx = 0; nx < width; nx += 1) {
      if (hexDistance([x, y], [nx, ny], width, wraps) <= radius) result.push([nx, ny]);
    }
  }
  return result;
}

function applyResourceRules(
  tiles: Civ5Tile[],
  starts: Civ5StartLocation[],
  width: number,
  height: number,
  wraps: boolean,
  options: MapGenerationOptions,
  random: () => number,
  contestedIndices: number[] = [],
  safeIndices: number[] = [],
) {
  const abundance = { SCARCE: 0.65, STANDARD: 1, ABUNDANT: 1.55 } as const;
  const placementMap = { terrains: TERRAINS, resources: RESOURCES };
  const landCandidates = tiles.flatMap((tile, index) => tile.terrain >= 2 && tile.elevation < 2 ? [index] : []);
  const safeSet = new Set(safeIndices);
  const ordinaryLandCandidates = landCandidates.filter((index) => !safeSet.has(index));
  const waterCandidates = tiles.flatMap((tile, index) => tile.terrain < 2 ? [index] : []);
  const shuffle = (values: number[]) => values.sort(() => random() - 0.5);
  const place = (candidates: number[], resourceIndices: number[], count: number, selector?: (index: number, placement: number) => number) => {
    let placed = 0;
    for (const index of shuffle([...candidates])) {
      if (placed >= count) break;
      const tile = tiles[index];
      if (tile.resource !== 255 || tile.wonder !== 255 || tile.improvement) continue;
      const legalResources = resourceIndices.filter((resource) => resourcePlacementVerdict(placementMap, { ...tile, resource }).valid);
      if (!legalResources.length) continue;
      const preferred = selector ? selector(index, placed) : legalResources[Math.floor(random() * legalResources.length)];
      tile.resource = legalResources.includes(preferred) ? preferred : legalResources[Math.floor(random() * legalResources.length)];
      tile.resourceAmount = tile.resource >= 5 && tile.resource <= 10 ? 2 : 1;
      placed += 1;
    }
    return placed;
  };

  const bonusCount = Math.round(landCandidates.length * 0.045 * abundance[options.bonusAbundance]);
  place(ordinaryLandCandidates, [0, 1, 2, 3], bonusCount);
  place(waterCandidates, [4], Math.round(waterCandidates.length * 0.018 * abundance[options.bonusAbundance]));

  const strategicCount = Math.round(landCandidates.length * 0.026 * abundance[options.strategicAbundance]);
  const strategicCandidates = options.strategicDistribution === "CLUSTERED"
    ? ordinaryLandCandidates.filter((index) => valueNoise(index % width, Math.floor(index / width), 7, 1949) > 0.48)
    : ordinaryLandCandidates;
  const contestedLandCandidates = contestedIndices.filter((index) => landCandidates.includes(index));
  const contestedStrategicTarget = options.engine === "POLIS" ? Math.round(strategicCount * clamp(options.polisContestedResourcePercent / 100, 0, 0.8)) : 0;
  const contestedStrategics = place(contestedLandCandidates, [5, 6, 7, 8, 9, 10], contestedStrategicTarget, (_index, placement) => 5 + (placement % 6));
  place(strategicCandidates, [5, 6, 7, 8, 9, 10], strategicCount - contestedStrategics, (index, placement) => {
    if (options.strategicDistribution === "REGIONAL") {
      const x = index % width;
      return 5 + Math.min(5, Math.floor(x / Math.max(1, width) * 6));
    }
    return 5 + (placement % 6);
  });
  const offshoreOil = Math.round(strategicCount * clamp(options.offshoreOilPercent / 100, 0, 1));
  place(waterCandidates, [8], offshoreOil);

  const luxuryIndices = Array.from({ length: RESOURCES.length - 11 }, (_, index) => index + 11);
  const waterLuxuryIndices = luxuryIndices.filter((index) => RESOURCES[index].includes("PEARLS") || RESOURCES[index].includes("WHALE"));
  const landLuxuryIndices = luxuryIndices.filter((index) => !waterLuxuryIndices.includes(index));
  const luxuryCount = Math.round(landCandidates.length * 0.018 * abundance[options.luxuryAbundance]);
  const waterLuxuryCount = Math.min(waterCandidates.length, Math.round(luxuryCount * 0.14));
  const contestedLuxuryTarget = options.engine === "POLIS" ? Math.round((luxuryCount - waterLuxuryCount) * clamp(options.polisContestedResourcePercent / 100, 0, 0.8)) : 0;
  const contestedLuxuries = place(contestedLandCandidates, landLuxuryIndices, contestedLuxuryTarget, (_index, placement) => landLuxuryIndices[placement % landLuxuryIndices.length]);
  place(ordinaryLandCandidates, landLuxuryIndices, luxuryCount - waterLuxuryCount - contestedLuxuries, (index) => {
    if (!options.luxuryRegional) return landLuxuryIndices[Math.floor(random() * landLuxuryIndices.length)];
    const x = index % width;
    return landLuxuryIndices[Math.min(landLuxuryIndices.length - 1, Math.floor(x / Math.max(1, width) * landLuxuryIndices.length))];
  });
  place(waterCandidates, waterLuxuryIndices, waterLuxuryCount);

  const majorStarts = starts.filter((start) => !start.cityState);
  const guarantee = (start: Civ5StartLocation, resource: number) => {
    const candidates = coordinatesWithinRadius(start.x, start.y, 3, width, height, wraps)
      .map(([x, y]) => y * width + x)
      .filter((index) => tiles[index].terrain >= 2 && tiles[index].elevation < 2 && tiles[index].resource === 255 && tiles[index].wonder === 255);
    const target = candidates[Math.floor(random() * candidates.length)];
    if (target === undefined) return;
    tiles[target].resource = resource;
    tiles[target].resourceAmount = resource >= 5 && resource <= 10 ? 2 : 1;
  };
  for (const [index, start] of majorStarts.entries()) {
    if (options.strategicStartGuarantee) {
      guarantee(start, 5);
      guarantee(start, 6);
    }
    if (options.luxuryStartGuarantee) guarantee(start, landLuxuryIndices[index % landLuxuryIndices.length]);
  }
}

function polisStartBalanceScore(
  tiles: Civ5Tile[],
  start: Civ5StartLocation,
  width: number,
  height: number,
  wraps: boolean,
) {
  const local = coordinatesWithinRadius(start.x, start.y, 3, width, height, wraps).map(([x, y]) => tiles[y * width + x]);
  const expansion = coordinatesWithinRadius(start.x, start.y, 6, width, height, wraps).map(([x, y]) => tiles[y * width + x]);
  const adjacent = neighbors(start.x, start.y, width, height, wraps).map(([x, y]) => tiles[y * width + x]);
  const workableLand = local.filter((tile) => tile.terrain >= 2 && tile.elevation < 2).length;
  const expansionSpace = expansion.filter((tile) => tile.terrain >= 2 && tile.elevation < 2).length;
  const strategicResources = local.filter((tile) => tile.resource >= 5 && tile.resource <= 10).length;
  const luxuries = local.filter((tile) => tile.resource >= 11 && tile.resource !== 255).length;
  const bonusResources = local.filter((tile) => tile.resource >= 0 && tile.resource <= 4).length;
  const coastal = adjacent.some((tile) => tile.terrain < 2);
  const freshwater = tiles[start.y * width + start.x].river > 0 || adjacent.some((tile) => tile.river > 0);
  const score = workableLand * 1.2 + expansionSpace * 0.25 + strategicResources * 7 + luxuries * 6 + bonusResources * 2.5 + (freshwater ? 6 : 0) + (coastal ? 3 : 0);
  return { score, strategicResources, luxuries, bonusResources };
}

/** Polis's equivalent strategies may differ topographically, but incidental
 * resource scatter must not turn that disguise into accidental start poverty. */
function balanceEquivalentPolisStarts(
  tiles: Civ5Tile[],
  starts: Civ5StartLocation[],
  width: number,
  height: number,
  wraps: boolean,
  options: MapGenerationOptions,
) {
  if (options.engine !== "POLIS" || options.preset === "UNEQUAL_REALMS" || options.polisSymmetry === "ASYMMETRIC") return;
  const majors = starts.filter((start) => !start.cityState);
  if (majors.length < 2) return;
  const placementMap = { terrains: TERRAINS, resources: RESOURCES };
  const classes = {
    strategicResources: [5, 6, 7, 8, 9, 10],
    luxuries: Array.from({ length: Math.max(0, RESOURCES.length - 11) }, (_value, index) => index + 11),
    bonusResources: [0, 1, 2, 3],
  } as const;
  for (let attempt = 0; attempt < majors.length * 8; attempt += 1) {
    const reports = majors.map((start) => ({ start, ...polisStartBalanceScore(tiles, start, width, height, wraps) }));
    const average = reports.reduce((sum, report) => sum + report.score, 0) / reports.length;
    const weakest = [...reports].sort((one, two) => one.score - two.score || one.start.player - two.start.player)[0];
    const strongest = [...reports].sort((one, two) => two.score - one.score || one.start.player - two.start.player)[0];
    const spread = Math.round((strongest.score - weakest.score) / Math.max(1, average) * 100);
    if (spread <= 16) break;
    const preferredClass = (Object.keys(classes) as Array<keyof typeof classes>).find((key) => weakest[key] < Math.max(...reports.map((report) => report[key]))) ?? "bonusResources";
    const localCandidates = coordinatesWithinRadius(weakest.start.x, weakest.start.y, 3, width, height, wraps)
      .map(([x, y]) => y * width + x)
      .filter((index) => {
        const tile = tiles[index];
        return index !== weakest.start.y * width + weakest.start.x && tile.terrain >= 2 && tile.elevation < 2 && tile.resource === 255 && tile.wonder === 255 && !tile.improvement;
      })
      .sort((one, two) => {
        const otherReachOne = majors.filter((start) => start !== weakest.start && hexDistance([one % width, Math.floor(one / width)], [start.x, start.y], width, wraps) <= 3).length;
        const otherReachTwo = majors.filter((start) => start !== weakest.start && hexDistance([two % width, Math.floor(two / width)], [start.x, start.y], width, wraps) <= 3).length;
        return otherReachOne - otherReachTwo || two - one;
      });
    let placed = false;
    for (const index of localCandidates) {
      const resource = classes[preferredClass].find((candidate) => resourcePlacementVerdict(placementMap, { ...tiles[index], resource: candidate }).valid);
      if (resource === undefined) continue;
      tiles[index].resource = resource;
      tiles[index].resourceAmount = resource >= 5 && resource <= 10 ? 2 : 1;
      placed = true;
      break;
    }
    if (!placed) break;
  }
}

function enforceContestedCentreValue(
  tiles: Civ5Tile[],
  starts: Civ5StartLocation[],
  structure: GenerationStructure,
  width: number,
  height: number,
  wraps: boolean,
  contract?: NarrativeGenerativeContract,
) {
  const contested = new Set(structure.objects
    .filter((object) => object.kind === "STRATEGIC_REGION" && ["CONTESTED", "OBJECTIVE"].includes(String(object.attributes?.role)))
    .flatMap((object) => object.tileIndices));
  if (!contested.size) return;
  const placementMap = { terrains: TERRAINS, resources: RESOURCES };
  const validValue = (tile: Civ5Tile) => (tile.resource !== 255
    && tile.wonder === 255
    && tile.resourceAmount > 0
    && resourcePlacementVerdict(placementMap, tile).valid) || (tile.wonder !== 255 && tile.resource === 255);
  const value = tiles.flatMap((tile, index) => validValue(tile) ? [index] : []);
  const insideCapacity = [...contested].filter((index) => tiles[index].terrain >= 2 && tiles[index].elevation < 2).length;
  const outsideCapacity = tiles.reduce((count, tile, index) => count
    + Number(!contested.has(index) && tile.terrain >= 2 && tile.elevation < 2), 0);
  const contrast = contract?.content.valueContrast ?? 0.45;
  const gradientTarget = 0.06 + contrast * 0.2;
  const required = Math.ceil(insideCapacity
    * (value.length + gradientTarget * Math.max(1, outsideCapacity))
    / Math.max(1, insideCapacity + outsideCapacity));
  let retained = value.filter((index) => contested.has(index)).length;
  if (retained >= required) return;
  const protectedStarts = new Set(starts.filter((start) => !start.cityState).flatMap((start) => coordinatesWithinRadius(start.x, start.y, 3, width, height, wraps).map(([x, y]) => y * width + x)));
  const sources = tiles.flatMap((tile, index) => tile.resource !== 255
    && tile.wonder === 255
    && tile.resourceAmount > 0
    && resourcePlacementVerdict(placementMap, tile).valid
    && !contested.has(index) ? [index] : [])
    .sort((one, two) => Number(protectedStarts.has(one)) - Number(protectedStarts.has(two)) || one - two);
  const targets = [...contested].filter((index) => {
    const tile = tiles[index];
    return tile.elevation < 2 && tile.resource === 255 && tile.wonder === 255 && !tile.improvement;
  }).sort((one, two) => one - two);
  for (const sourceIndex of sources) {
    if (retained >= required) break;
    const source = tiles[sourceIndex];
    const targetPosition = targets.findIndex((index) => resourcePlacementVerdict(placementMap, { ...tiles[index], resource: source.resource }).valid);
    if (targetPosition < 0) continue;
    const target = targets.splice(targetPosition, 1)[0];
    tiles[target].resource = source.resource;
    tiles[target].resourceAmount = source.resourceAmount;
    source.resource = 255;
    source.resourceAmount = 0;
    retained += 1;
  }
}

function reserveIcehouseCriticalValue(
  tiles: Civ5Tile[],
  starts: Civ5StartLocation[],
  structure: GenerationStructure,
  width: number,
  height: number,
  wraps: boolean,
) {
  const native = structure.objects.filter((object) => object.attributes?.nativeNarrative === true);
  const sheets = native.filter((object) => object.attributes?.role === "ICE_SHEET");
  const refuges = native.filter((object) => object.attributes?.role === "REFUGE");
  if (!sheets.length || !refuges.length) return 0;
  const refugeTiles = new Set(refuges.flatMap((object) => object.tileIndices));
  const majorStarts = starts.filter((start) => !start.cityState && start.playable !== false)
    .map((start) => start.y * width + start.x);
  const landMask = tiles.map((tile) => tile.terrain >= 2);
  const elevations = tiles.map((tile) => tile.elevation);
  const reaches = majorStarts.map((origin) => passableReach(origin, landMask, elevations, width, height, wraps));
  const coldCandidate = (index: number) => {
    const tile = tiles[index];
    return Boolean(tile && tile.terrain >= 5 && tile.terrain <= 6 && tile.elevation < 2
      && tile.wonder === 255 && !tile.improvement && !refugeTiles.has(index));
  };
  const targets = new Set<number>();
  for (const sheet of sheets) {
    let target: number | undefined = sheet.tileIndices.filter(coldCandidate)
      .sort((one, two) => Number(tiles[two].resource !== 255) - Number(tiles[one].resource !== 255) || one - two)[0];
    if (target === undefined) {
      target = sheet.tileIndices.find((index) => tiles[index]?.terrain >= 2 && tiles[index].elevation < 2
        && tiles[index].wonder === 255 && !tiles[index].improvement && !refugeTiles.has(index));
      if (target !== undefined) tiles[target] = { ...tiles[target], terrain: 5, feature: tiles[target].feature === 0 ? 0 : 255 };
    }
    if (target !== undefined) targets.add(target);
  }
  for (const reached of reaches) {
    let target: number | undefined = [...reached].filter((index) => coldCandidate(index) && !targets.has(index))
      .sort((one, two) => Number(tiles[two].resource !== 255) - Number(tiles[one].resource !== 255) || one - two)[0];
    if (target === undefined) {
      target = [...reached].filter((index) => {
        const tile = tiles[index];
        return tile?.terrain >= 2 && tile.elevation < 2 && tile.wonder === 255 && !tile.improvement
          && !refugeTiles.has(index) && !targets.has(index) && !majorStarts.includes(index);
      }).sort((one, two) => one - two)[0];
      if (target !== undefined) tiles[target] = { ...tiles[target], terrain: 5, feature: tiles[target].feature === 0 ? 0 : 255 };
    }
    if (target !== undefined) targets.add(target);
  }
  // Refuge productivity is also part of the same authored contrast. Protect
  // one existing value in every refuge, or reserve one passable refuge plot
  // before choosing donors for the hostile frontier.
  for (const refuge of refuges) {
    const existing = refuge.tileIndices.find((index) => tiles[index]?.resource !== 255 || tiles[index]?.wonder !== 255);
    if (existing !== undefined) targets.add(existing);
    else {
      const target = refuge.tileIndices.find((index) => tiles[index]?.terrain >= 2 && tiles[index].elevation < 2
        && tiles[index].wonder === 255 && !tiles[index].improvement);
      if (target !== undefined) targets.add(target);
    }
  }
  const placementMap = { terrains: TERRAINS, resources: RESOURCES };
  const protectedTargets = new Set(targets);
  const donors = tiles.flatMap((tile, index) => tile.resource !== 255 && !protectedTargets.has(index) ? [index] : [])
    .sort((one, two) => Number(refugeTiles.has(one)) - Number(refugeTiles.has(two)) || one - two);
  let reservations = 0;
  for (const target of targets) {
    if (tiles[target].resource !== 255 || tiles[target].wonder !== 255) continue;
    const donor = donors.shift();
    if (donor === undefined) break;
    const donorResource = tiles[donor].resource;
    const resource = resourcePlacementVerdict(placementMap, { ...tiles[target], resource: donorResource }).valid
      ? donorResource
      : RESOURCES.indexOf("RESOURCE_FURS");
    tiles[target] = { ...tiles[target], resource, resourceAmount: resource >= 5 && resource <= 10 ? 2 : 1 };
    tiles[donor] = { ...tiles[donor], resource: 255, resourceAmount: 0 };
    reservations += 1;
  }
  return reservations;
}

function placeWondersAndSites(
  tiles: Civ5Tile[],
  starts: Civ5StartLocation[],
  width: number,
  height: number,
  wraps: boolean,
  options: MapGenerationOptions,
  random: () => number,
  blockedTiles = new Set<number>(),
) {
  const startPoints = starts.map((start) => [start.x, start.y] as [number, number]);
  const selectedWonders: Array<[number, number]> = [];
  const landCandidates = tiles.flatMap((tile, index) => tile.terrain >= 2 && tile.elevation < 2 && !blockedTiles.has(index) ? [index] : []);
  const waterCandidates = tiles.flatMap((tile, index) => tile.terrain < 2 && !blockedTiles.has(index) ? [index] : []);
  const wonderCount = Math.max(0, Math.min(WONDERS.length, Math.round(options.wonderCount)));
  for (let wonderIndex = 0; wonderIndex < wonderCount; wonderIndex += 1) {
    const waterWonder = WONDERS[wonderIndex].includes("KRAKATOA") || WONDERS[wonderIndex].includes("BARRIER_REEF");
    const candidates = [...(waterWonder ? waterCandidates : landCandidates)].sort(() => random() - 0.5);
    const index = candidates.find((candidate) => {
      const tile = tiles[candidate];
      if (tile.wonder !== 255 || tile.improvement) return false;
      const point: [number, number] = [candidate % width, Math.floor(candidate / width)];
      if (startPoints.some((start) => hexDistance(point, start, width, wraps) < options.wonderStartBuffer)) return false;
      return !selectedWonders.some((wonder) => hexDistance(point, wonder, width, wraps) < options.wonderMinSpacing);
    });
    if (index === undefined) continue;
    const point: [number, number] = [index % width, Math.floor(index / width)];
    tiles[index].wonder = wonderIndex;
    tiles[index].feature = 255;
    tiles[index].resource = 255;
    tiles[index].resourceAmount = 0;
    selectedWonders.push(point);
  }

  const siteDensity = { NONE: 0, SCARCE: 0.0025, STANDARD: 0.005, RAGING: 0.009 } as const;
  const placeSites = (kind: Civ5Tile["improvement"], setting: SiteAbundance, startDistance: number) => {
    const desired = Math.round(tiles.length * siteDensity[setting]);
    const selected: Array<[number, number]> = [];
    for (const index of [...landCandidates].sort(() => random() - 0.5)) {
      if (selected.length >= desired) break;
      const tile = tiles[index];
      if (tile.wonder !== 255 || tile.improvement) continue;
      const point: [number, number] = [index % width, Math.floor(index / width)];
      if (startPoints.some((start) => hexDistance(point, start, width, wraps) < startDistance)) continue;
      if (selected.some((site) => hexDistance(point, site, width, wraps) < 3)) continue;
      tile.improvement = kind;
      selected.push(point);
    }
  };
  placeSites("IMPROVEMENT_BARBARIAN_CAMP", options.barbarianAbundance, options.barbarianStartDistance);
  placeSites("IMPROVEMENT_GOODY_HUT", options.ruinAbundance, options.ruinStartDistance);
}

function shortestDoomsdayPath(
  origin: number,
  target: number,
  tiles: Civ5Tile[],
  width: number,
  height: number,
  wraps: boolean,
) {
  const parents = new Int32Array(tiles.length);
  parents.fill(-2);
  parents[origin] = -1;
  const queue = [origin];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current === target) break;
    const x = current % width;
    const y = Math.floor(current / width);
    for (const [nx, ny] of neighbors(x, y, width, height, wraps)) {
      const next = ny * width + nx;
      const tile = tiles[next];
      if (parents[next] !== -2 || tile.terrain < 2 || tile.elevation === 2 || tile.wonder !== 255) continue;
      if (tile.improvement && next !== target) continue;
      parents[next] = current;
      queue.push(next);
    }
  }
  if (parents[target] === -2) return [];
  const path: number[] = [];
  for (let current = target; current >= 0; current = parents[current]) path.push(current);
  return path.reverse();
}

function applyDoomsdayTheme(
  tiles: Civ5Tile[],
  starts: Civ5StartLocation[],
  width: number,
  height: number,
  wraps: boolean,
  random: () => number,
) {
  const startPoints = starts.filter((start) => !start.cityState).map((start) => [start.x, start.y] as [number, number]);
  const candidates = tiles.flatMap((tile, index) => tile.terrain >= 2 && tile.elevation < 2 && tile.wonder === 255 && tile.resource === 255 && !tile.improvement ? [index] : []);
  const desiredRuins = Math.max(2, Math.min(10, Math.round(candidates.length * 0.0016)));
  const ruins: number[] = [];
  for (const index of [...candidates].sort(() => random() - 0.5)) {
    if (ruins.length >= desiredRuins) break;
    const point: [number, number] = [index % width, Math.floor(index / width)];
    if (startPoints.some((start) => hexDistance(point, start, width, wraps) < 5)) continue;
    if (ruins.some((ruin) => hexDistance(point, [ruin % width, Math.floor(ruin / width)], width, wraps) < 8)) continue;
    tiles[index].improvement = "IMPROVEMENT_CITY_RUINS";
    tiles[index].route = "ROUTE_ROAD";
    tiles[index].feature = 255;
    ruins.push(index);
  }

  const startIndices = starts.filter((start) => !start.cityState).map((start) => start.y * width + start.x);
  for (const [ruinNumber, ruin] of ruins.entries()) {
    const possibleTargets = [...startIndices, ...ruins.slice(0, ruinNumber)];
    if (!possibleTargets.length) continue;
    const origin: [number, number] = [ruin % width, Math.floor(ruin / width)];
    const target = possibleTargets.reduce((nearest, candidate) => {
      const candidatePoint: [number, number] = [candidate % width, Math.floor(candidate / width)];
      const nearestPoint: [number, number] = [nearest % width, Math.floor(nearest / width)];
      return hexDistance(origin, candidatePoint, width, wraps) < hexDistance(origin, nearestPoint, width, wraps) ? candidate : nearest;
    });
    const path = shortestDoomsdayPath(ruin, target, tiles, width, height, wraps);
    const survivingLength = Math.min(path.length, 18 + Math.floor(random() * 7));
    for (const index of path.slice(0, survivingLength)) tiles[index].route = "ROUTE_ROAD";
  }

  // Resources, sites and the road pass can displace the initial terrain-level
  // scarring. Reconcile the authored sparse floor last so Doomsday remains
  // visible without painting over playable content or the opening area.
  const falloutFeature = FEATURES.indexOf("FEATURE_FALLOUT");
  const landCount = tiles.filter((tile) => tile.terrain >= 2).length;
  const desiredFallout = Math.round(landCount * 0.018);
  let falloutCount = tiles.filter((tile) => tile.feature === falloutFeature).length;
  if (falloutFeature >= 0 && falloutCount < desiredFallout) {
    const falloutCandidates = tiles.flatMap((tile, index) => {
      if (tile.terrain < 2 || tile.elevation === 2 || tile.feature !== 255 || tile.resource !== 255 || tile.wonder !== 255 || tile.improvement || tile.route) return [];
      const point: [number, number] = [index % width, Math.floor(index / width)];
      return startPoints.some((start) => hexDistance(point, start, width, wraps) < 3) ? [] : [index];
    });
    for (const index of falloutCandidates.sort(() => random() - 0.5)) {
      if (falloutCount >= desiredFallout) break;
      tiles[index].feature = falloutFeature;
      falloutCount += 1;
    }
  }
}

export function enforceGeneratedPlacementLegality(map: Civ5Map) {
  for (const tile of map.tiles) {
    if (!featurePlacementVerdict(map, tile).valid) tile.feature = 255;
    if (!resourcePlacementVerdict(map, tile).valid) {
      tile.resource = 255;
      tile.resourceAmount = 0;
    }
    if (!wonderPlacementVerdict(map, tile).valid) tile.wonder = 255;
    if (tile.wonder !== 255 && tile.resource !== 255) {
      tile.resource = 255;
      tile.resourceAmount = 0;
    }
    if (tile.terrain < 2 || tile.elevation === 2) {
      if (tile.improvement) tile.improvement = undefined;
      if (tile.route) tile.route = undefined;
    }
  }
  return map;
}

export function balanceMapStarts(map: Civ5Map, options: MapGenerationOptions) {
  const resolved = { ...DEFAULT_GENERATION_OPTIONS, ...options };
  const tiles = map.tiles.map((tile) => ({ ...tile }));
  const random = randomFactory(seedHash(`${resolved.seed}:starts:${map.width}x${map.height}`));
  const playerCount = Math.max(2, Math.min(22, Math.round(resolved.players)));
  const cityStateCount = Math.max(0, Math.min(41, Math.round(resolved.cityStates)));
  const blockedTileIndices = new Set((map.cities ?? []).flatMap((city) => city.x >= 0 && city.y >= 0 && city.x < map.width && city.y < map.height ? [city.y * map.width + city.x] : []));
  const majorStarts = placeStartLocations(tiles, map.width, map.height, playerCount, map.wraps, resolved.balance, resolved.teamSize, resolved.teamLayout, random, blockedTileIndices);
  if (resolved.startQuality !== "STANDARD" || resolved.strategicBalance || resolved.balance === "TOURNAMENT") {
    normalizeStarts(tiles, majorStarts, map.width, map.height, map.wraps, resolved.startQuality, resolved.balance === "TOURNAMENT");
  }
  const cityStates = placeCityStateLocations(tiles, map.width, map.height, cityStateCount, majorStarts.length, map.wraps, majorStarts, random, resolved.cityStateMinSpacing, resolved.cityStateDistribution, resolved.cityStateCoastalPreference, blockedTileIndices);
  const startLocations = [...majorStarts, ...cityStates];
  return { ...map, tiles, players: majorStarts.length, startLocations, generation: { ...resolved, players: majorStarts.length, cityStates: cityStates.length, dominantTerrains: [...resolved.dominantTerrains] }, recipe: generationRecipeFromOptions({ ...resolved, players: majorStarts.length, cityStates: cityStates.length }), structure: markGenerationStructureStale(map.structure, "Start locations were rebalanced.", ["STARTS"]) };
}

export function regenerateMapRivers(map: Civ5Map, options: MapGenerationOptions, variation = 1) {
  const resolved = { ...DEFAULT_GENERATION_OPTIONS, ...options };
  const seed = seedHash(`${resolved.seed}:river-pass:${variation}:${map.width}x${map.height}`);
  const random = randomFactory(seed);
  const relief = map.tiles.map((tile, index) => {
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    return tile.elevation * 0.34 + fractalNoise(x + 211, y + 307, seed + 1301) * 0.66;
  });
  const moistures = map.tiles.map((_tile, index) => {
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    return fractalNoise(x + 101, y + 53, seed + 701);
  });
  const tiles = map.tiles.map((tile) => ({ ...tile, river: 0 }));
  const rivers = generateRiverNetwork(tiles, relief, moistures, map.width, map.height, map.wraps, resolved.style, resolved.rainfall, random, undefined, resolved.riverDensity);
  for (let index = 0; index < tiles.length; index += 1) tiles[index].river = rivers[index];
  const regenerated = { ...map, tiles, generation: { ...resolved, dominantTerrains: [...resolved.dominantTerrains] }, recipe: generationRecipeFromOptions(resolved) };
  return map.structure ? { ...regenerated, structure: markGenerationStructureStale(attachRiverSystems(regenerated, map.structure), "Hydrology was selectively regenerated.", ["HYDROLOGY"]) } : regenerated;
}

export function regenerateMapContent(map: Civ5Map, options: MapGenerationOptions, variation = 1) {
  const resolved = { ...DEFAULT_GENERATION_OPTIONS, ...options };
  const random = randomFactory(seedHash(`${resolved.seed}:content-pass:${variation}:${map.width}x${map.height}`));
  const tiles = map.tiles.map((tile) => ({
    ...tile,
    resource: 255,
    resourceAmount: 0,
    wonder: 255,
    improvement: undefined,
    route: undefined,
  }));
  const draft = { ...map, tiles, generation: { ...resolved, dominantTerrains: [...resolved.dominantTerrains] }, recipe: generationRecipeFromOptions(resolved), structure: markGenerationStructureStale(map.structure, "Resources, wonders, and sites were selectively regenerated.", ["CONTENT"]) };
  applyResourceRules(tiles, draft.startLocations, map.width, map.height, map.wraps, resolved, random);
  placeWondersAndSites(tiles, draft.startLocations, map.width, map.height, map.wraps, resolved, random);
  if (resolved.modifier === "DOOMSDAY") applyDoomsdayTheme(tiles, draft.startLocations, map.width, map.height, map.wraps, random);
  return enforceGeneratedPlacementLegality(draft);
}

type NarrativePopulationAdjustment = {
  reduceMajorsBy: number;
  minimumMajors: number;
  cityStateFraction: number;
};

function requestedMajorPopulation(value: number) {
  return Math.max(2, Math.min(22, Math.round(value)));
}

function requestedCityStatePopulation(value: number) {
  return Math.max(0, Math.min(41, Math.round(value)));
}

/** Resolve an authored population operation without ever increasing the user's
 * requested roster. `minimumMajors` is a floor on reduction, not a new request. */
function narrativePopulationTarget(requested: number, adjustment: NarrativePopulationAdjustment) {
  const normalized = requestedMajorPopulation(requested);
  if (adjustment.reduceMajorsBy <= 0) return normalized;
  const minimum = Math.min(normalized, Math.max(2, Math.min(22, Math.round(adjustment.minimumMajors))));
  return Math.max(minimum, normalized - Math.max(0, Math.round(adjustment.reduceMajorsBy)));
}

function narrativeCityStateTarget(requested: number, adjustment: NarrativePopulationAdjustment) {
  return Math.max(0, Math.min(41, Math.round(requestedCityStatePopulation(requested) * Math.max(0, Math.min(1, adjustment.cityStateFraction)))));
}

function nativeRelaxationIds(program: ReturnType<typeof compileCatalogueNarrativeProgram>, relaxationIds: readonly string[]) {
  const byId = new Map(program.generative?.relaxationPolicy.map((step) => [step.id, step]) ?? []);
  return relaxationIds.filter((id) => byId.get(id)?.mode !== "ACCEPT_ANTI_MOTIF_RISK");
}

function capacityDisclosures(
  requestedMajors: number,
  targetMajors: number,
  actualMajors: number,
  requestedCityStates: number,
  targetCityStates: number,
  actualCityStates: number,
  policy: "REDUCE_CITY_STATES" | "REDUCE_POPULATION" | "PRESERVE_POPULATION",
) {
  const messages: string[] = [];
  if (actualMajors < requestedMajors) messages.push(
    `Population capacity: retained ${actualMajors} of ${requestedMajors} requested major civilizations under ${policy.toLowerCase().replaceAll("_", " ")}; the authored target was ${targetMajors}.`,
  );
  if (actualCityStates < requestedCityStates) messages.push(
    `City-state capacity: retained ${actualCityStates} of ${requestedCityStates} requested city states under ${policy.toLowerCase().replaceAll("_", " ")}; the authored target was ${targetCityStates}.`,
  );
  return messages;
}

/**
 * Rebinds plan-time causal references to native objects that actually survive
 * the owning engine and final legality normalization. Missing objects fail
 * closed: their causes become unretained and keep their prior diagnostic ID,
 * while every retained cause points to an emitted native object with the same
 * semantic provenance and role.
 */
export function rebindNarrativeAdapterToFinalNativeObjects(
  adapter: NarrativeAdapterEvidence,
  objects: readonly GeographicObject[],
): NarrativeAdapterEvidence {
  const nativeObjects = objects.filter((object) => object.attributes?.nativeNarrative === true);
  const bySemanticId = new Map<string, GeographicObject[]>();
  for (const object of nativeObjects) {
    if (!object.semanticId) continue;
    const entries = bySemanticId.get(object.semanticId) ?? [];
    entries.push(object);
    bySemanticId.set(object.semanticId, entries);
  }
  return {
    ...adapter,
    causalObjects: adapter.causalObjects.map((cause) => {
      const candidate = (bySemanticId.get(`narrative:${cause.id}`) ?? []).find((object) => {
        const role = String(object.attributes?.role ?? object.attributes?.relationship ?? "");
        return role === cause.role;
      });
      return candidate
        ? { ...cause, nativeObjectId: candidate.id, retained: true }
        : { ...cause, retained: false };
    }),
  };
}

function generateMapInternal(options: MapGenerationOptions, onProgress?: (stage: string) => void, scale: WorldScale = "GLOBAL", sourceRecipe?: GenerationRecipe, control?: GenerationControl): Civ5Map {
  const requestedEngine = String(options.engine);
  const resolved: MapGenerationOptions = { ...DEFAULT_GENERATION_OPTIONS, ...options, engine: requestedEngine === "FIELD" ? "EXCOGITARE" : requestedEngine === "REGION_GRAPH" ? "ECCENTRIC" : options.engine };
  if (resolved.modifier === "FANTASTICAL") resolved.style = "FANTASTICAL";
  const character = worldCharacterProfile(resolved.style);
  const size = MAP_SIZES.find((item) => item.id === resolved.size) ?? MAP_SIZES[3];
  const { width, height } = resolveMapDimensions(size.id, resolved.geometry);
  const geometrySeed = resolved.geometry === "STANDARD" ? "" : `:${resolved.geometry}`;
  const projectionSeed = resolved.projectionType === "NORTH_SOUTH" ? "" : `:${resolved.projectionType}`;
  const scaleProfile = worldScaleProfile(scale);
  const seed = seedHash(`${resolved.seed}:${resolved.engine}:${resolved.preset}:${resolved.size}${geometrySeed}:${resolved.style}:${resolved.modifier}${projectionSeed}:${scale}`);
  const random = randomFactory(seed);
  const presetWraps = resolved.preset !== "INLAND_SEAS" && resolved.preset !== "LABYRINTH" && resolved.preset !== "SHATTERED_BASINS";
  const wraps = resolved.wrapType === "PRESET" ? presetWraps : resolved.wrapType === "EAST_WEST";
  const narrativeRecipe = sourceRecipe
    ? {
        ...sourceRecipe,
        engine: resolved.engine,
        mapType: resolved.preset,
        settings: { ...sourceRecipe.settings, seed: resolved.seed },
      }
    : { ...generationRecipeFromOptions(resolved), scale };
  let narrativeSkeleton = compileNarrativeSkeleton(resolved, narrativeRecipe, width, height, wraps);
  const narrativeProgram = compileCatalogueNarrativeProgram(narrativeRecipe, { width, height, wraps });
  const appliedNativeRelaxationIds = nativeRelaxationIds(narrativeProgram, control?.narrativeRelaxationIds ?? []);
  let narrativeAdapter = compileNarrativeAdapterPlan(narrativeProgram, narrativeSkeleton, appliedNativeRelaxationIds);
  const targetMajorPopulation = narrativePopulationTarget(resolved.players, narrativeAdapter.native.populationAdjustment);
  const targetCityStatePopulation = narrativeCityStateTarget(resolved.cityStates, narrativeAdapter.native.populationAdjustment);
  const nativeGenerationOptions: MapGenerationOptions = targetMajorPopulation === requestedMajorPopulation(resolved.players)
    && targetCityStatePopulation === requestedCityStatePopulation(resolved.cityStates)
    ? resolved
    : { ...resolved, players: targetMajorPopulation, cityStates: targetCityStatePopulation };
  if (nativeGenerationOptions !== resolved) {
    // Population changes alter realm, refuge and strategic reservations. Rebuild
    // those causes before asking the owning engine for another candidate.
    narrativeSkeleton = compileNarrativeSkeleton(nativeGenerationOptions, narrativeRecipe, width, height, wraps);
    narrativeAdapter = compileNarrativeAdapterPlan(narrativeProgram, narrativeSkeleton, appliedNativeRelaxationIds);
  }
  // The native plan owns the effective contract for this retry. In particular,
  // authored content relaxations must alter placement and evidence on the map
  // being regenerated, rather than merely appearing in its diagnostics.
  const effectiveNarrativeContract = narrativeAdapter.native.contract;
  const fieldPlan = narrativeAdapter.native.kind === "FIELD_PLAN" ? narrativeAdapter.native : undefined;
  const fieldEdgePolicy = fieldPlan?.thresholdPolicy.edgePolicy ?? "NARRATIVE";
  const constraints = control?.constraints;
  const nativeConstraints = constraintMatchesDimensions(constraints, width, height) ? constraints : undefined;
  const observeNarrativeStage = (stage: EngineNarrativeStageName, source: EngineNarrativeObservable) => {
    control?.onEngineNarrativeStage?.(snapshotEngineNarrativeStage(stage, source, width, height, wraps));
  };
  const targetLandCount = width * height - Math.round(width * height * clamp(resolved.waterPercent / 100, 0, 0.9));
  const reinforceNativeConstraints = <T extends { landMask: boolean[]; reliefValues: number[]; elevations: number[]; tiles: Civ5Tile[]; moistures: number[]; riverGuidance?: number[]; structure: GenerationStructure }>(geography: T) => {
    if (!nativeConstraints) return geography;
    applyConstrainedLandBudget(geography.landMask, targetLandCount, geography.reliefValues, nativeConstraints);
    applyConstrainedRelief(geography.reliefValues, geography.elevations, geography.landMask, nativeConstraints);
    applyConstrainedSurface(geography.tiles, geography.landMask, geography.elevations, nativeConstraints);
    if (geography.riverGuidance) for (let index = 0; index < geography.riverGuidance.length; index += 1) if (nativeConstraints.hydrologyMask[index]) geography.riverGuidance[index] = Math.max(geography.riverGuidance[index], nativeConstraints.rivers[index] ? 1 : 0.58);
    geography.structure = { ...geography.structure, diagnostics: { ...geography.structure.diagnostics, ...nativeConstraintDiagnostics(nativeConstraints) } };
    return geography;
  };
  const finishStructuredGeography = (geography: {
    landMask: boolean[];
    reliefValues: number[];
    temperatures?: number[];
    moistures: number[];
    elevations: number[];
    tiles: Civ5Tile[];
    structure: GenerationStructure;
    startLocations?: Civ5StartLocation[];
    riverGuidance?: number[];
  }, description: string, engineNarrativeEvidence: EngineNarrativeEvidence) => {
    const physicalNarrativeRiverSourceByDrainage = new Map<string, number>();
    const physicalRealizedDrainageTiles = new Map<string, number[]>();
    const selectDistinctPhysicalDrainages = (objects: readonly GeographicObject[], role: string, sourceRole: string, count: number) => {
      const drainages = objects.filter((object) => object.attributes?.role === role);
      const candidates = drainages.flatMap((drainage) => {
        const source = objects.find((object) => object.attributes?.role === sourceRole
          && object.attributes?.from === drainage.attributes?.from
          && object.attributes?.to === drainage.attributes?.to);
        return source ? [{ drainage, source }] : [];
      });
      if (!candidates.length || count <= 0) return [];
      const selected = [candidates[0]];
      const separation = (one: GeographicObject, two: GeographicObject) => Math.min(...one.tileIndices.flatMap((left) => two.tileIndices.map((right) => hexDistance(
        [left % width, Math.floor(left / width)],
        [right % width, Math.floor(right / width)],
        width,
        wraps,
      ))));
      while (selected.length < Math.min(count, candidates.length)) {
        const next = candidates.filter((candidate) => !selected.includes(candidate))
          .sort((one, two) => {
            const oneDistance = Math.min(...selected.map((entry) => separation(one.source, entry.source)));
            const twoDistance = Math.min(...selected.map((entry) => separation(two.source, entry.source)));
            return twoDistance - oneDistance || one.drainage.id.localeCompare(two.drainage.id);
          })[0];
        if (!next) break;
        selected.push(next);
      }
      return selected.map((entry) => entry.drainage);
    };
    onProgress?.("Opening mountain passes");
    const effectiveMountainPercent = resolved.modifier === "STRATEGIC_DEPTH"
      ? Math.max(22, resolved.mountainPercent)
      : resolved.modifier === "DOOMSDAY" ? Math.max(18, resolved.mountainPercent) : Math.max(character.mountainFloor, clamp(resolved.mountainPercent, 0, 38));
    carveAccessiblePasses(geography.landMask, geography.elevations, width, height, wraps);
    const protectedStarts = new Set([
      ...(geography.startLocations ?? []).map((start) => start.y * width + start.x),
      ...(geography.structure.strategicGraph?.startSafetyTileIndices ?? geography.structure.strategicGraph?.protectedTileIndices ?? []),
    ]);
    let startSafetyFrontier = [...protectedStarts];
    for (let radius = 0; radius < 2; radius += 1) {
      const next: number[] = [];
      for (const index of startSafetyFrontier) for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
        const adjacent = y * width + x;
        if (protectedStarts.has(adjacent) || !geography.landMask[adjacent]) continue;
        protectedStarts.add(adjacent);
        next.push(adjacent);
      }
      startSafetyFrontier = next;
    }
    for (const start of geography.startLocations?.filter((candidate) => !candidate.cityState) ?? []) {
      const origin = start.y * width + start.x;
      if (!geography.landMask[origin]) continue;
      const component = [origin];
      const reached = new Set(component);
      for (let cursor = 0; cursor < component.length && component.length <= 16; cursor += 1) for (const [x, y] of neighbors(component[cursor] % width, Math.floor(component[cursor] / width), width, height, wraps)) {
        const next = y * width + x;
        if (!geography.landMask[next] || reached.has(next)) continue;
        reached.add(next);
        component.push(next);
      }
      if (component.length <= 16) for (const index of component) protectedStarts.add(index);
    }
    // Authored pass corridors are low-relief reservations, not start-safety
    // centres: expanding a radius around every path tile would erase entire
    // mountain systems. Protect their exact final spine, and for Colliding
    // Plates reserve a material low foreland core while leaving belt flanks
    // available for the summits displaced by the exact user mountain budget.
    const protectedNativeLowRelief = new Set<number>();
    const protectedNativeHills = new Set<number>();
    if (resolved.engine === "PHYSICAL" && resolved.preset === "SUPERCONTINENT_INTERIOR") {
      for (const index of geography.structure.objects.filter((object) => object.attributes?.nativeNarrative === true
        && object.attributes?.role === "HIGHLAND_PASS").flatMap((object) => object.tileIndices)) protectedNativeLowRelief.add(index);
    }
    if (resolved.engine === "PHYSICAL" && resolved.preset === "ISLAND_ARC_EARTH") {
      const shelfTiles = new Set(geography.structure.objects.filter((object) => object.attributes?.nativeNarrative === true
        && object.attributes?.role === "ARC_SHELF").flatMap((object) => object.tileIndices));
      const upliftTiles = new Set(geography.structure.objects.filter((object) => object.attributes?.nativeNarrative === true
        && (object.attributes?.role === "VOLCANIC_ARC_ANCHOR" || object.attributes?.role === "VOLCANIC_PARENT_ARC"))
        .flatMap((object) => object.tileIndices));
      for (const index of shelfTiles) {
        protectedNativeLowRelief.add(index);
        if (upliftTiles.has(index)) protectedNativeHills.add(index);
      }
    }
    if (resolved.engine === "PHYSICAL" && resolved.preset === "COLLIDING_PLATES") {
      const beltTiles = new Set(geography.structure.objects.filter((object) => object.attributes?.nativeNarrative === true
        && object.attributes?.role === "COLLISION_BELT").flatMap((object) => object.tileIndices));
      for (const index of beltTiles) {
        protectedNativeLowRelief.add(index);
        protectedNativeHills.add(index);
      }
      for (const foreland of geography.structure.objects.filter((object) => object.attributes?.nativeNarrative === true
        && object.attributes?.role === "FORELAND")) {
        const members = [...new Set(foreland.tileIndices.filter((index) => geography.landMask[index]))];
        const required = Math.min(members.length, Math.max(3, Math.ceil(foreland.tileIndices.length * 0.72)));
        members.sort((one, two) => Number(beltTiles.has(two)) - Number(beltTiles.has(one))
          || geography.reliefValues[one] - geography.reliefValues[two]
          || one - two);
        for (const index of members.slice(0, required)) protectedNativeLowRelief.add(index);
      }
    }
    if (resolved.engine === "ECCENTRIC" && resolved.preset === "RIFTWORLD") {
      for (const cell of geography.structure.objects.filter((object) => object.attributes?.nativeNarrative === true
        && object.attributes?.role === "VIABLE_RIFT_CELL")) {
        const members = [...new Set(cell.tileIndices.filter((index) => geography.landMask[index]))]
          .sort((one, two) => geography.reliefValues[one] - geography.reliefValues[two] || one - two);
        for (const index of members.slice(0, Math.min(3, members.length))) protectedNativeLowRelief.add(index);
      }
    }
    // Polis objective districts are authored settleable/contestable regions.
    // Preserve their engine-authored relief while the exact mountain target is
    // reconciled elsewhere; otherwise that later global pass can turn a valid
    // diplomatic port or heartland district into a disconnected mountain field.
    const protectedStrategicObjectives = new Set(
      geography.structure.strategicGraph?.objectiveTileIndices?.filter((index) => geography.landMask[index]) ?? [],
    );
    const protectedStrategicRoutes = new Set(
      geography.structure.strategicGraph?.edges.flatMap((edge) => edge.tileIndices)
        .filter((index) => geography.landMask[index]) ?? [],
    );
    const protectedStrategicRoleRelief = new Set<number>();
    if (resolved.engine === "POLIS" && resolved.preset === "UNEQUAL_REALMS") for (const home of geography.structure.objects.filter((object) => object.kind === "STRATEGIC_REGION"
      && object.attributes?.role === "SAFE" && object.attributes?.contractRole === "TURTLE")) {
      const hills = home.tileIndices.filter((index) => geography.landMask[index] && geography.elevations[index] === 1)
        .sort((one, two) => geography.reliefValues[two] - geography.reliefValues[one] || one - two);
      for (const index of hills.slice(0, Math.max(1, Math.ceil(home.tileIndices.length * 0.1)))) protectedStrategicRoleRelief.add(index);
    }
    const protectedRelief = new Set([...protectedStarts, ...protectedNativeLowRelief, ...protectedStrategicObjectives, ...protectedStrategicRoutes, ...protectedStrategicRoleRelief]);
    for (const index of protectedStarts) geography.elevations[index] = protectedStrategicRoleRelief.has(index) ? 1 : 0;
    for (const index of protectedNativeLowRelief) geography.elevations[index] = protectedNativeHills.has(index) ? 1 : 0;
    for (const index of protectedStrategicRoutes) geography.elevations[index] = Math.min(1, geography.elevations[index]);
    // A native low-relief reservation can expose a formerly impassable pocket
    // behind the original mountain wall (notably a Colliding Plates foreland).
    // Reconcile accessibility after those mandatory demotions, then restore
    // the exact global mountain budget without sealing the new pass again.
    if (protectedNativeLowRelief.size) carveAccessiblePasses(geography.landMask, geography.elevations, width, height, wraps);
    restoreAccessibleMountainTarget(geography.landMask, geography.elevations, geography.reliefValues, effectiveMountainPercent, width, height, wraps, protectedRelief);
    if (resolved.engine === "POLIS") {
      const desired = Math.round(geography.landMask.filter(Boolean).length * clamp(effectiveMountainPercent / 100, 0, 0.42));
      let current = geography.elevations.filter((elevation, index) => geography.landMask[index] && elevation === 2).length;
      // Polis protects the complete strategic route graph before relief is
      // reconciled. Requiring every remaining peripheral plot in a landmass to
      // stay mutually reachable can make an explicit mountain percentage
      // impossible even though all homes, objectives, and redundant routes are
      // already safe. Fill the residual budget only outside those reservations;
      // this allows natural enclosing ranges without sealing any authored path.
      for (const index of geography.reliefValues.flatMap((value, candidate) => geography.landMask[candidate]
        && geography.elevations[candidate] < 2
        && !protectedRelief.has(candidate)
        && (nativeConstraints?.elevation[candidate] ?? -1) < 0
        ? [{ index: candidate, value }]
        : []).sort((one, two) => two.value - one.value || one.index - two.index).map((candidate) => candidate.index)) {
        if (current >= desired) break;
        geography.elevations[index] = 2;
        current += 1;
      }
    }
    const tiles = geography.tiles.map((tile, index) => ({ ...tile, elevation: geography.elevations[index] }));
    const reservedNarrativeSites = new Set(geography.structure.objects.filter((object) => object.attributes?.role === "CANAL_ISTHMUS").flatMap((object) => object.tileIndices));
    const protectedFeatureSites = new Set<number>();
    if (nativeConstraints?.feature.length === tiles.length) for (let index = 0; index < tiles.length; index += 1) {
      if (nativeConstraints.feature[index] >= 0) protectedFeatureSites.add(index);
    }
    // Natural wonders replace the underlying feature when they are placed.
    // A feature-protected plot is therefore not an empty content site even
    // though its wonder field is still unset. Reserve it before content rather
    // than restoring the feature underneath a newly placed wonder afterward.
    const reservedContentSites = new Set([...reservedNarrativeSites, ...protectedFeatureSites]);
    const playerCount = narrativePopulationTarget(resolved.players, narrativeAdapter.native.populationAdjustment);
    const cityStateCount = narrativeCityStateTarget(resolved.cityStates, narrativeAdapter.native.populationAdjustment);
    onProgress?.("Placing players and city states");
    const majorStarts = geography.startLocations
      ? geography.startLocations.filter((start) => !start.cityState).slice(0, playerCount).map((start) => ({ ...start }))
      : placeStartLocations(tiles, width, height, playerCount, wraps, resolved.balance, resolved.teamSize, resolved.teamLayout, random, reservedNarrativeSites);
    if (resolved.engine === "EXCOGITARE" && resolved.preset === "EARTHSEA") {
      const realms = geography.structure.objects.filter((object) => object.attributes?.nativeNarrative === true && object.attributes?.role === "ISLAND_CONTINENT")
        .sort((one, two) => one.id.localeCompare(two.id));
      const selected: number[] = [];
      const assignments = realms.slice(0, majorStarts.length).flatMap((realm) => {
        const candidate = realm.tileIndices.filter((index) => {
          const tile = tiles[index];
          return tile?.terrain >= 2 && tile.elevation < 2 && tile.wonder === 255
            && selected.every((other) => hexDistance(
              [index % width, Math.floor(index / width)],
              [other % width, Math.floor(other / width)],
              width,
              wraps,
            ) >= MINIMUM_START_DISTANCE);
        }).sort((one, two) => {
          const workable = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
            .filter(([x, y]) => {
              const tile = tiles[y * width + x];
              return tile.terrain >= 2 && tile.elevation < 2;
            }).length;
          return workable(two) - workable(one) || one - two;
        })[0];
        if (candidate === undefined) return [];
        selected.push(candidate);
        return [candidate];
      });
      if (assignments.length === majorStarts.length) for (let player = 0; player < majorStarts.length; player += 1) {
        majorStarts[player] = { ...majorStarts[player], x: assignments[player] % width, y: Math.floor(assignments[player] / width) };
      }
    }
    const actualPlayerCount = majorStarts.length;
    if (resolved.startQuality !== "STANDARD" || resolved.strategicBalance || resolved.balance === "TOURNAMENT") {
      normalizeStarts(tiles, majorStarts, width, height, wraps, resolved.startQuality, resolved.balance === "TOURNAMENT");
    }
    const cityStates = geography.startLocations
      ? geography.startLocations.filter((start) => start.cityState).slice(0, cityStateCount).map((start) => ({ ...start }))
      : placeCityStateLocations(tiles, width, height, cityStateCount, actualPlayerCount, wraps, majorStarts, random, resolved.cityStateMinSpacing, resolved.cityStateDistribution, resolved.cityStateCoastalPreference, reservedNarrativeSites);
    const startLocations = [...majorStarts, ...cityStates];
    if (resolved.engine === "POLIS") {
      const reservedHomes = new Set<number>();
      const landComponent = (origin: number) => {
        if (tiles[origin]?.terrain < 2) return [] as number[];
        const component = [origin];
        const reached = new Set(component);
        for (let cursor = 0; cursor < component.length; cursor += 1) for (const [x, y] of neighbors(component[cursor] % width, Math.floor(component[cursor] / width), width, height, wraps)) {
          const next = y * width + x;
          if (tiles[next].terrain < 2 || reached.has(next)) continue;
          reached.add(next);
          component.push(next);
        }
        return component;
      };
      const smallHomes = startLocations.flatMap((start) => {
        const component = landComponent(start.y * width + start.x);
        return component.length <= 20 && component.filter((index) => tiles[index].elevation < 2).length < Math.min(12, component.length) ? [component] : [];
      });
      for (const component of smallHomes) for (const index of component) reservedHomes.add(index);
      const displaced = smallHomes.flatMap((component) => {
        const needed = Math.min(12, component.length) - component.filter((index) => tiles[index].elevation < 2).length;
        return component.filter((index) => tiles[index].elevation === 2 && nativeConstraints?.elevation[index] !== 2)
          .sort((one, two) => geography.reliefValues[one] - geography.reliefValues[two] || one - two).slice(0, Math.max(0, needed));
      });
      const replacements = tiles.flatMap((tile, index) => tile.terrain >= 2 && tile.elevation < 2 && !reservedHomes.has(index)
        && !protectedRelief.has(index) && (nativeConstraints?.elevation[index] ?? -1) < 0 ? [index] : [])
        .sort((one, two) => geography.reliefValues[two] - geography.reliefValues[one] || one - two);
      for (let position = 0; position < displaced.length && position < replacements.length; position += 1) {
        const donor = displaced[position];
        const replacement = replacements[position];
        geography.elevations[donor] = 1;
        tiles[donor] = { ...tiles[donor], elevation: 1 };
        geography.elevations[replacement] = 2;
        tiles[replacement] = { ...tiles[replacement], elevation: 2, feature: 255 };
      }
    }
    applyNarrativeCityStateContestability(
      startLocations,
      tiles,
      width,
      height,
      wraps,
      effectiveNarrativeContract,
      geography.structure,
      resolved.cityStateMinSpacing,
    );
    onProgress?.("Placing resources and wonders");
    const contestedTiles = geography.structure.objects
      .filter((object) => object.kind === "STRATEGIC_REGION" && (object.attributes?.role === "CONTESTED" || object.attributes?.role === "OBJECTIVE"))
      .flatMap((object) => object.tileIndices);
    const safeTiles = geography.structure.objects
      .filter((object) => object.kind === "STRATEGIC_REGION" && object.attributes?.role === "SAFE")
      .flatMap((object) => object.tileIndices);
    applyResourceRules(tiles, startLocations, width, height, wraps, resolved, random, contestedTiles, safeTiles);
    placeWondersAndSites(tiles, startLocations, width, height, wraps, resolved, random, reservedContentSites);
    applyNarrativeContent(tiles, [...RESOURCES], narrativeSkeleton, width, height, wraps, effectiveNarrativeContract, geography.structure);
    if (resolved.engine === "PHYSICAL" && resolved.preset === "ICEHOUSE_EARTH") {
      const reservations = reserveIcehouseCriticalValue(tiles, startLocations, geography.structure, width, height, wraps);
      geography.structure = {
        ...geography.structure,
        diagnostics: { ...geography.structure.diagnostics, nativeIcehouseCriticalValueReservations: reservations },
      };
    }
    balanceEquivalentPolisStarts(tiles, startLocations, width, height, wraps, resolved);
    if (narrativeProgram.generative?.content.pattern === "CONTESTED_CENTRE") enforceContestedCentreValue(tiles, startLocations, geography.structure, width, height, wraps, effectiveNarrativeContract);
    if (resolved.modifier === "DOOMSDAY") applyDoomsdayTheme(tiles, startLocations, width, height, wraps, random);
    applyNarrativeBrutalFrontierContent(
      tiles,
      [...FEATURES],
      startLocations,
      width,
      height,
      wraps,
      effectiveNarrativeContract,
      geography.structure,
      resolved,
    );
    if (resolved.engine === "PHYSICAL" && resolved.preset === "ANCIENT_CRATONS") {
      const native = geography.structure.objects.filter((object) => object.attributes?.nativeNarrative === true);
      const drainages = native.filter((object) => object.attributes?.role === "MATURE_DRAINAGE");
      const required = drainages.length;
      const selected = selectDistinctPhysicalDrainages(native, "MATURE_DRAINAGE", "GHOST_RANGE", required);
      const ranges = selected.flatMap((drainage) => {
        const range = native.find((object) => object.attributes?.role === "GHOST_RANGE"
          && object.attributes?.from === drainage.attributes?.from
          && object.attributes?.to === drainage.attributes?.to);
        return range ? [range] : [];
      });
      const rangeTiles = new Set(ranges.flatMap((range) => range.tileIndices));
      const protectedRiverSources = new Set(startLocations.flatMap((start) => coordinatesWithinRadius(start.x, start.y, 1, width, height, wraps)
        .map(([x, y]) => y * width + x)));
      const selectedSources: number[] = [];
      for (const drainage of selected) {
        const range = native.find((object) => object.attributes?.role === "GHOST_RANGE"
          && object.attributes?.from === drainage.attributes?.from
          && object.attributes?.to === drainage.attributes?.to);
        if (!range) continue;
        const endpointTiles = native.filter((object) => [drainage.attributes?.from, drainage.attributes?.to]
          .includes(object.id.replace(/^narrative-/, ""))).flatMap((object) => object.tileIndices);
        const candidates = range.tileIndices.filter((index) => {
          const tile = tiles[index];
          return tile.terrain >= 2 && tile.resource === 255 && tile.wonder === 255 && !tile.improvement
            && !protectedRiverSources.has(index) && !selectedSources.includes(index)
            && nativeConstraints?.elevation[index] !== 0 && nativeConstraints?.elevation[index] !== 1;
        }).sort((one, two) => {
          const separation = (index: number) => selectedSources.length
            ? Math.min(...selectedSources.map((source) => hexDistance(
                [index % width, Math.floor(index / width)],
                [source % width, Math.floor(source / width)],
                width,
                wraps,
              )))
            : width + height;
          const coastal = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
            .some(([x, y]) => tiles[y * width + x].terrain < 2) ? 1 : 0;
          const endpointDistance = (index: number) => endpointTiles.length ? Math.min(...endpointTiles.map((endpoint) => hexDistance(
            [index % width, Math.floor(index / width)],
            [endpoint % width, Math.floor(endpoint / width)],
            width,
            wraps,
          ))) : width + height;
          // The serialized river owns plot edges adjacent to its mountain
          // source. Prefer the exact craton interface before maximizing
          // cross-catchment separation; a merely radius-two summit can move
          // the reconstructed owner plots outside the required shield contact.
          return endpointDistance(one) - endpointDistance(two)
            || separation(two) - separation(one)
            || coastal(one) - coastal(two)
            || Number(tiles[two].elevation === 2) - Number(tiles[one].elevation === 2)
            || geography.reliefValues[two] - geography.reliefValues[one]
            || one - two;
        });
        let summit: number | undefined;
        for (const candidate of candidates) {
          if (tiles[candidate].elevation === 2) { summit = candidate; break; }
          const previous = tiles[candidate];
          tiles[candidate] = { ...previous, elevation: 2, feature: 255 };
          if (passableLandIsConnectedWithinLandmasses(
            tiles.map((tile) => tile.terrain >= 2),
            tiles.map((tile) => tile.elevation),
            width,
            height,
            wraps,
          )) { summit = candidate; break; }
          tiles[candidate] = previous;
        }
        if (summit === undefined) continue;
        geography.elevations[summit] = 2;
        selectedSources.push(summit);
        physicalNarrativeRiverSourceByDrainage.set(drainage.id, summit);
      }
      const desiredMountains = Math.round(tiles.filter((tile) => tile.terrain >= 2).length * clamp(effectiveMountainPercent / 100, 0, 0.42));
      let actualMountains = tiles.filter((tile) => tile.terrain >= 2 && tile.elevation === 2).length;
      for (const displaced of tiles.flatMap((tile, index) => tile.terrain >= 2 && tile.elevation === 2
        && !rangeTiles.has(index) && !selectedSources.includes(index) && !protectedRiverSources.has(index)
        && nativeConstraints?.elevation[index] !== 2 ? [index] : [])
        .sort((one, two) => geography.reliefValues[one] - geography.reliefValues[two] || one - two)) {
        if (actualMountains <= desiredMountains) break;
        tiles[displaced] = { ...tiles[displaced], elevation: 1 };
        geography.elevations[displaced] = 1;
        actualMountains -= 1;
      }
    }
    if (resolved.engine === "ECCENTRIC" && geography.structure.narrativeAdapter?.grammarFamily === "GRAPH_ECOLOGICAL_TRANSECT") {
      // Ecological surface roles are realized natively, but content and start
      // normalization run afterward. Reassert explicit surface channels before
      // final hydrology so its edge graph is compiled against the protected
      // topology and relief instead of a transient post-content surface.
      applyConstrainedSurface(tiles, geography.landMask, geography.elevations, nativeConstraints);
    }
    onProgress?.("Resolving drainage and rivers");
    const scaleRiverGuidance = geography.riverGuidance?.map((value, index) => nativeConstraints?.hydrologyMask[index] ? Math.max(value, nativeConstraints.rivers[index] ? 1 : 0.58) : clamp(value * scaleProfile.drainageHierarchy));
    const minimumNarrativeRiverSources = resolved.engine === "PHYSICAL"
      ? effectiveNarrativeContract.hydrology.minimumCatchments
      : 1;
    let riverNetwork = generateRiverNetwork(
      tiles,
      geography.reliefValues,
      geography.moistures,
      width,
      height,
      wraps,
      resolved.style,
      resolved.rainfall,
      random,
      undefined,
      resolved.riverDensity,
      scaleRiverGuidance,
      minimumNarrativeRiverSources,
      4,
    );
    if (resolved.engine === "ECCENTRIC" && resolved.preset === "LONELY_OCEANS" && !riverNetwork.some(Boolean)) {
      // Sparse ocean worlds often place every original summit on a one-tile
      // coastal shoulder, leaving no legal three-edge river even though a
      // larger island has an interior. Move (never add) one unconstrained
      // summit to the deepest safe interior tile, then compile one canonical
      // mountain-to-ocean spine. The mountain budget, realm topology, starts,
      // resources, and exact water budget remain unchanged.
      const allWater = tiles.flatMap((tile, index) => tile.terrain < 2 ? [index] : []);
      const allLand = tiles.flatMap((tile, index) => tile.terrain >= 2 ? [index] : []);
      const distanceFromWater = new Int16Array(tiles.length).fill(-1);
      const waterQueue = [...allWater];
      for (const index of allWater) distanceFromWater[index] = 0;
      for (let cursor = 0; cursor < waterQueue.length; cursor += 1) {
        const current = waterQueue[cursor];
        for (const [x, y] of neighbors(current % width, Math.floor(current / width), width, height, wraps)) {
          const next = y * width + x;
          if (distanceFromWater[next] >= 0) continue;
          distanceFromWater[next] = distanceFromWater[current] + 1;
          waterQueue.push(next);
        }
      }
      const startBuffer = new Set(startLocations.flatMap((start) => coordinatesWithinRadius(start.x, start.y, 1, width, height, wraps)
        .map(([x, y]) => y * width + x)));
      const candidates = allLand.filter((index) => {
        const tile = tiles[index];
        return tile.elevation < 2 && tile.resource === 255 && tile.wonder === 255 && !tile.improvement
          && !startBuffer.has(index) && (nativeConstraints?.elevation[index] ?? -1) < 0;
      }).sort((one, two) => distanceFromWater[two] - distanceFromWater[one]
        || geography.reliefValues[two] - geography.reliefValues[one]
        || one - two);
      const donors = allLand.filter((index) => tiles[index].elevation === 2
        && !startBuffer.has(index) && nativeConstraints?.elevation[index] !== 2)
        .sort((one, two) => distanceFromWater[one] - distanceFromWater[two]
          || geography.reliefValues[one] - geography.reliefValues[two]
          || one - two);
      for (const candidate of candidates) {
        const donor = donors.find((index) => index !== candidate);
        if (donor === undefined) break;
        const previousCandidate = tiles[candidate];
        const previousDonor = tiles[donor];
        const candidateRelief = geography.reliefValues[candidate];
        const donorRelief = geography.reliefValues[donor];
        const candidateElevation = geography.elevations[candidate];
        const donorElevation = geography.elevations[donor];
        tiles[candidate] = { ...previousCandidate, elevation: 2, feature: 255, river: 0 };
        tiles[donor] = { ...previousDonor, elevation: 1, river: 0 };
        geography.elevations[candidate] = 2;
        geography.elevations[donor] = 1;
        geography.reliefValues[candidate] = Math.max(candidateRelief, 1.2);
        geography.reliefValues[donor] = Math.min(donorRelief, 0.62);
        const passable = passableLandIsConnectedWithinLandmasses(
          tiles.map((tile) => tile.terrain >= 2),
          tiles.map((tile) => tile.elevation),
          width,
          height,
          wraps,
        );
        const route = passable
          ? realizeNarrativeRiverSpine(tiles, width, height, wraps, [candidate], allLand, allLand, [], allWater)
          : [];
        const systems = route.length ? reconstructCiv5RiverEdgeSystems({ width, height, wraps, tiles }) : [];
        const legal = systems.some((system) => system.edgeCount >= 3 && system.acyclic && system.directedToOutlet
          && system.sourceTileIndices.includes(candidate) && system.outletTileIndices.length > 0);
        if (legal) {
          riverNetwork = Uint8Array.from(tiles, (tile) => tile.river);
          break;
        }
        tiles[candidate] = previousCandidate;
        tiles[donor] = previousDonor;
        geography.elevations[candidate] = candidateElevation;
        geography.elevations[donor] = donorElevation;
        geography.reliefValues[candidate] = candidateRelief;
        geography.reliefValues[donor] = donorRelief;
        for (const tile of tiles) tile.river = 0;
      }
    }
    for (let index = 0; index < tiles.length; index += 1) tiles[index].river = riverNetwork[index];
    if (resolved.engine === "PHYSICAL") {
      const nativePhysicalObjects = geography.structure.objects.filter((object) => object.attributes?.nativeNarrative === true);
      const bySkeletonId = new Map(nativePhysicalObjects.map((object) => [object.id.replace(/^narrative-/, ""), object]));
      if (resolved.preset === "ANCIENT_CRATONS") {
        const allWater = tiles.flatMap((tile, index) => tile.terrain < 2 ? [index] : []);
        const selected = selectDistinctPhysicalDrainages(
          nativePhysicalObjects,
          "MATURE_DRAINAGE",
          "GHOST_RANGE",
          nativePhysicalObjects.filter((object) => object.attributes?.role === "MATURE_DRAINAGE").length,
        );
        // Mature shield rivers are separate old catchments, not three labels
        // attached to one generic drainage tree. Try the few deterministic
        // rotations of the four authored ranges and retain the arrangement
        // with the most independent final Civ V edge systems. This is a tiny
        // assignment search (at most four routes), not a seed-specific retry.
        const coastalWater = allWater.filter((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
          .some(([x, y]) => tiles[y * width + x].terrain >= 2));
        const matureRiverEdgeFloor = Math.max(3, Math.round(Math.sqrt(tiles.length) / 8));
        const initialRivers = tiles.map((tile) => tile.river);
        let best: { rivers: number[]; routes: Map<string, number[]> } = { rivers: initialRivers.map(() => 0), routes: new Map() };
        const orderings = selected.map((_drainage, offset) => [
          ...selected.slice(offset),
          ...selected.slice(0, offset),
        ]);
        for (const ordering of orderings) {
          for (const tile of tiles) tile.river = 0;
          const blockedRiverTiles = new Set<number>();
          const blockedRiverVertices = new Set<string>();
          const usedOutlets: number[] = [];
          const routes = new Map<string, number[]>();
          for (const drainage of ordering) {
            const range = nativePhysicalObjects.find((object) => object.attributes?.role === "GHOST_RANGE"
              && object.attributes?.from === drainage.attributes?.from && object.attributes?.to === drainage.attributes?.to);
            if (!range) continue;
            const authoredSource = physicalNarrativeRiverSourceByDrainage.get(drainage.id);
            const sourceTiles = authoredSource === undefined ? range.tileIndices : [authoredSource];
            const distanceFromSource = (index: number) => Math.min(...sourceTiles.map((source) => hexDistance(
              [index % width, Math.floor(index / width)],
              [source % width, Math.floor(source / width)],
              width,
              wraps,
            )));
            const outletCandidates = coastalWater.filter((index) => distanceFromSource(index) >= matureRiverEdgeFloor + 1
              && usedOutlets.every((used) => hexDistance(
                [index % width, Math.floor(index / width)],
                [used % width, Math.floor(used / width)],
                width,
                wraps,
              ) >= 5)).sort((one, two) => distanceFromSource(one) - distanceFromSource(two) || one - two);
            const realized = realizeNarrativeRiverSpine(
              tiles,
              width,
              height,
              wraps,
              sourceTiles,
              sourceTiles,
              allWater,
              drainage.tileIndices,
              outletCandidates.slice(0, Math.max(12, Math.ceil(coastalWater.length * 0.2))),
              blockedRiverTiles,
              undefined,
              blockedRiverVertices,
            );
            if (realized.length < Math.max(3, matureRiverEdgeFloor - 1)) continue;
            routes.set(drainage.id, realized);
            for (const index of realized) blockedRiverTiles.add(index);
            const outlet = outletCandidates.find((candidate) => realized.some((index) => hexDistance(
              [candidate % width, Math.floor(candidate / width)],
              [index % width, Math.floor(index / width)],
              width,
              wraps,
            ) <= 2));
            if (outlet !== undefined) usedOutlets.push(outlet);
          }
          if (routes.size > best.routes.size) best = { rivers: tiles.map((tile) => tile.river), routes };
          if (best.routes.size === selected.length) break;
        }
        for (let index = 0; index < tiles.length; index += 1) tiles[index].river = best.rivers[index] ?? 0;
        for (const [drainageId, route] of best.routes) physicalRealizedDrainageTiles.set(drainageId, route);
        geography.structure = {
          ...geography.structure,
          objects: geography.structure.objects.map((object) => physicalRealizedDrainageTiles.has(object.id)
            ? { ...object, tileIndices: physicalRealizedDrainageTiles.get(object.id)! }
            : object),
        };
      } else if (resolved.preset === "SUPERCONTINENT_INTERIOR") {
        const drainages = nativePhysicalObjects.filter((object) => object.attributes?.role === "INWARD_DRAINAGE");
        const minimumCatchments = effectiveNarrativeContract.hydrology.minimumCatchments;
        const supercontinentRiverEdgeFloor = Math.max(3, Math.round(Math.sqrt(tiles.length) / 8));
        for (const tile of tiles) tile.river = 0;
        const basin = nativePhysicalObjects.find((object) => object.attributes?.role === "INTERIOR_SEA");
        const basinSeeds = basin?.tileIndices.filter((index) => tiles[index]?.terrain < 2) ?? [];
        const basinSeedSet = new Set(basinSeeds);
        // The native sea object is a reservation seed inside the final
        // connected inland basin, not the only legal outlet frontage. On a
        // contracted Duel basin that seed can expose only a handful of shore
        // plots and make three otherwise real catchments compete for one
        // river vertex. Bind drainage to the complete final water component
        // containing the exact seed, matching the enclosure proof and the
        // later Physical hydrology rebinder.
        const basinTiles = connectedFieldSubsets(tiles.map((tile) => tile.terrain < 2), width, height, wraps)
          .sort((one, two) => two.filter((index) => basinSeedSet.has(index)).length - one.filter((index) => basinSeedSet.has(index)).length
            || two.length - one.length || one[0] - two[0])[0] ?? [];
        const basinWater = new Set(basinTiles);
        const basinShore = tiles.flatMap((tile, index) => tile.terrain >= 2
          && neighbors(index % width, Math.floor(index / width), width, height, wraps)
            .some(([x, y]) => basinWater.has(y * width + x)) ? [index] : []);
        const candidates = drainages.flatMap((drainage) => {
          const source = bySkeletonId.get(String(drainage.attributes?.from ?? ""));
          if (!source || !basin) return [];
          const shoreDistance = (index: number) => basinShore.length ? Math.min(...basinShore.map((shore) => hexDistance(
            [index % width, Math.floor(index / width)],
            [shore % width, Math.floor(shore / width)],
            width,
            wraps,
          ))) : width + height;
          // A headwater immediately beside the basin cannot express an
          // authored catchment. Prefer the deepest retained summit in this
          // peripheral highland sector, so the final edge path has a real
          // landward drainage domain before reaching the interior shore.
          const summit = source.tileIndices.filter((index) => tiles[index]?.terrain >= 2 && tiles[index].elevation === 2)
            .sort((one, two) => shoreDistance(two) - shoreDistance(one)
              || geography.reliefValues[two] - geography.reliefValues[one]
              || one - two)[0];
          return summit === undefined ? [] : [{ drainage, source, summit, shoreDistance: shoreDistance(summit) }];
        });
        // Farthest-first anchors partition the complete landward drainage
        // domain into three source and outlet sectors. This prevents a large
        // map from solving every authored catchment through one convenient
        // basin shore, while leaving tributaries possible inside each sector.
        const anchors: typeof candidates = [];
        const remaining = [...candidates];
        while (remaining.length && anchors.length < minimumCatchments) {
          const next = remaining.sort((one, two) => {
            const separation = (candidate: (typeof candidates)[number]) => anchors.length
              ? Math.min(...anchors.map((accepted) => hexDistance(
                  [candidate.summit % width, Math.floor(candidate.summit / width)],
                  [accepted.summit % width, Math.floor(accepted.summit / width)],
                  width,
                  wraps,
                )))
              : width + height;
            return separation(two) - separation(one)
              || two.shoreDistance - one.shoreDistance
              || one.drainage.id.localeCompare(two.drainage.id);
          })[0];
          if (!next) break;
          anchors.push(next);
          remaining.splice(remaining.indexOf(next), 1);
        }
        const anchorFor = (index: number) => anchors.reduce((best, anchor, anchorIndex) => {
          const separation = hexDistance(
            [index % width, Math.floor(index / width)],
            [anchor.summit % width, Math.floor(anchor.summit / width)],
            width,
            wraps,
          );
          return separation < best.separation ? { anchorIndex, separation } : best;
        }, { anchorIndex: 0, separation: Number.POSITIVE_INFINITY }).anchorIndex;
        const candidateSectors = anchors.map((_anchor, sector) => candidates
          .filter((candidate) => anchorFor(candidate.summit) === sector)
          .sort((one, two) => Number(two === anchors[sector]) - Number(one === anchors[sector])
            || two.shoreDistance - one.shoreDistance
            || one.drainage.id.localeCompare(two.drainage.id)));
        const landSectors = anchors.map((_anchor, sector) => tiles.flatMap((tile, index) => tile.terrain >= 2 && anchorFor(index) === sector ? [index] : []));
        const minimumOutletSpacing = Math.max(6, Math.round(Math.min(width, height) * 0.08));
        const outletSectorAnchors: number[] = [];
        for (const anchor of anchors) {
          const available = basinShore.filter((candidate) => outletSectorAnchors.every((used) => hexDistance(
            [candidate % width, Math.floor(candidate / width)],
            [used % width, Math.floor(used / width)],
            width,
            wraps,
          ) >= minimumOutletSpacing));
          const distant = available.filter((candidate) => hexDistance(
            [anchor.summit % width, Math.floor(anchor.summit / width)],
            [candidate % width, Math.floor(candidate / width)],
            width,
            wraps,
          ) >= 5);
          const outlet = (distant.length ? distant : available.length ? available : basinShore).sort((one, two) => hexDistance(
            [anchor.summit % width, Math.floor(anchor.summit / width)],
            [one % width, Math.floor(one / width)],
            width,
            wraps,
          ) - hexDistance(
            [anchor.summit % width, Math.floor(anchor.summit / width)],
            [two % width, Math.floor(two / width)],
            width,
            wraps,
          ) || one - two)[0];
          if (outlet !== undefined) outletSectorAnchors.push(outlet);
        }
        const outletSectorRadius = Math.max(2, Math.floor(minimumOutletSpacing / 3));
        const shoreSectors = anchors.map((_anchor, sector) => {
          const centre = outletSectorAnchors[sector];
          if (centre === undefined) return [];
          const local = basinShore.filter((index) => hexDistance(
            [index % width, Math.floor(index / width)],
            [centre % width, Math.floor(centre / width)],
            width,
            wraps,
          ) <= outletSectorRadius);
          // A tiny local shore window can be topologically unusable in Civ
          // V's edge graph even when the surrounding basin shore is sound.
          // Keep the distinct sector anchor first, then expose increasingly
          // distant alternatives to the deterministic route search. The
          // outlet-spacing gate below still prevents authored catchments from
          // collapsing onto the same terminal window.
          const alternatives = basinShore
            .filter((index) => !local.includes(index))
            .sort((one, two) => hexDistance(
              [one % width, Math.floor(one / width)],
              [centre % width, Math.floor(centre / width)],
              width,
              wraps,
            ) - hexDistance(
              [two % width, Math.floor(two / width)],
              [centre % width, Math.floor(centre / width)],
              width,
              wraps,
            ) || one - two);
          return [...local, ...alternatives];
        });
        let routeTrials = 0;
        let successfulRouteTrials = 0;
        const routeTrialsBySector = anchors.map(() => 0);
        const successfulTrialsBySector = anchors.map(() => 0);
        const baseRivers = tiles.map(() => 0);
        const sectorOrders = anchors.length === 3
          ? [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
          : [anchors.map((_anchor, sector) => sector)];
        let bestLayout: { rivers: number[]; routes: Map<string, number[]> } = { rivers: baseRivers, routes: new Map() };
        for (const sectorOrder of sectorOrders) {
          for (let index = 0; index < tiles.length; index += 1) tiles[index].river = baseRivers[index];
          const blockedVertices = new Set<string>();
          const usedOutletWindows: number[] = [];
          const routes = new Map<string, number[]>();
          for (const sector of sectorOrder) {
            let bestRoute: { drainage: GeographicObject; outlet: number; owners: number[]; rivers: number[]; vertices: Set<string> } | undefined;
            for (const { drainage, summit } of candidateSectors[sector].slice(0, 6)) {
              const outletCandidates = shoreSectors[sector].filter((candidate) => hexDistance(
                [summit % width, Math.floor(summit / width)],
                [candidate % width, Math.floor(candidate / width)],
                width,
                wraps,
              ) >= supercontinentRiverEdgeFloor + 1 && usedOutletWindows.every((used) => hexDistance(
                [candidate % width, Math.floor(candidate / width)],
                [used % width, Math.floor(used / width)],
                width,
                wraps,
              ) >= minimumOutletSpacing)).sort((one, two) => hexDistance(
                [one % width, Math.floor(one / width)],
                [outletSectorAnchors[sector] % width, Math.floor(outletSectorAnchors[sector] / width)],
                width,
                wraps,
              ) - hexDistance(
                [two % width, Math.floor(two / width)],
                [outletSectorAnchors[sector] % width, Math.floor(outletSectorAnchors[sector] / width)],
                width,
                wraps,
              ) || hexDistance(
                [summit % width, Math.floor(summit / width)],
                [one % width, Math.floor(one / width)],
                width,
                wraps,
              ) - hexDistance(
                [summit % width, Math.floor(summit / width)],
                [two % width, Math.floor(two / width)],
                width,
                wraps,
              ) || one - two);
              const trialOutlets: number[] = [];
              for (const outlet of outletCandidates) {
                if (trialOutlets.some((accepted) => hexDistance(
                  [outlet % width, Math.floor(outlet / width)],
                  [accepted % width, Math.floor(accepted / width)],
                  width,
                  wraps,
                ) < 4)) continue;
                trialOutlets.push(outlet);
                if (trialOutlets.length >= 8) break;
              }
              for (const outlet of trialOutlets) {
                const outletWindow = coordinatesWithinRadius(
                  outlet % width,
                  Math.floor(outlet / width),
                  4,
                  width,
                  height,
                  wraps,
                ).map(([x, y]) => y * width + x).filter((index) => tiles[index].terrain >= 2);
                const trialTiles = tiles.map((tile) => ({ ...tile }));
                const trialVertices = new Set(blockedVertices);
                routeTrials += 1;
                routeTrialsBySector[sector] += 1;
                const realized = realizeNarrativeRiverSpine(
                  trialTiles,
                  width,
                  height,
                  wraps,
                  [summit],
                  [summit],
                  outletWindow,
                  landSectors[sector],
                  basinTiles,
                  new Set<number>(),
                  undefined,
                  trialVertices,
                );
                if (realized.length < Math.max(3, supercontinentRiverEdgeFloor - 1)) continue;
                successfulRouteTrials += 1;
                successfulTrialsBySector[sector] += 1;
                if (!bestRoute || realized.length < bestRoute.owners.length
                  || realized.length === bestRoute.owners.length && drainage.id.localeCompare(bestRoute.drainage.id) < 0) bestRoute = {
                  drainage,
                  outlet,
                  owners: realized,
                  rivers: trialTiles.map((tile) => tile.river),
                  vertices: trialVertices,
                };
              }
            }
            if (!bestRoute) continue;
            for (let index = 0; index < tiles.length; index += 1) tiles[index].river = bestRoute.rivers[index];
            blockedVertices.clear();
            for (const vertex of bestRoute.vertices) blockedVertices.add(vertex);
            routes.set(bestRoute.drainage.id, bestRoute.owners);
            usedOutletWindows.push(outletSectorAnchors[sector] ?? bestRoute.outlet);
          }
          if (routes.size > bestLayout.routes.size) bestLayout = { rivers: tiles.map((tile) => tile.river), routes };
          if (bestLayout.routes.size >= minimumCatchments) break;
        }
        for (let index = 0; index < tiles.length; index += 1) tiles[index].river = bestLayout.rivers[index] ?? 0;
        for (const [drainageId, owners] of bestLayout.routes) physicalRealizedDrainageTiles.set(drainageId, owners);
        geography.structure = {
          ...geography.structure,
          objects: geography.structure.objects.map((object) => physicalRealizedDrainageTiles.has(object.id)
            ? { ...object, tileIndices: physicalRealizedDrainageTiles.get(object.id)! }
            : object),
          diagnostics: {
            ...geography.structure.diagnostics,
            nativePhysicalCompiledDrainages: physicalRealizedDrainageTiles.size,
            nativePhysicalDrainageSectorAnchors: anchors.length,
            nativePhysicalDrainageOutletSectors: outletSectorAnchors.length,
            nativePhysicalDrainageRouteTrials: routeTrials,
            nativePhysicalDrainageSuccessfulTrials: successfulRouteTrials,
            ...Object.fromEntries(anchors.flatMap((_anchor, sector) => [
              [`nativePhysicalDrainageSector${sector + 1}Candidates`, candidateSectors[sector].length],
              [`nativePhysicalDrainageSector${sector + 1}ShoreTiles`, shoreSectors[sector].length],
              [`nativePhysicalDrainageSector${sector + 1}RouteTrials`, routeTrialsBySector[sector]],
              [`nativePhysicalDrainageSector${sector + 1}SuccessfulTrials`, successfulTrialsBySector[sector]],
            ])),
          },
        };
      } else if (resolved.preset === "MONSOON_CONTINENTS") {
        const startBuffer = new Set(startLocations.flatMap((start) => coordinatesWithinRadius(start.x, start.y, 1, width, height, wraps)
          .map(([x, y]) => y * width + x)));
        for (const drainage of nativePhysicalObjects.filter((object) => object.attributes?.role === "LIVING_RIVER")) {
          const wall = bySkeletonId.get(String(drainage.attributes?.from ?? ""));
          const coast = bySkeletonId.get(String(drainage.attributes?.to ?? ""));
          const lowland = nativePhysicalObjects.find((object) => object.attributes?.role === "MONSOON_LOWLAND");
          if (!wall || !coast || !lowland) continue;
          let source = wall.tileIndices.find((index) => tiles[index]?.terrain >= 2 && tiles[index].elevation === 2);
          if (source === undefined) {
            const candidate = wall.tileIndices.filter((index) => {
              const tile = tiles[index];
              return tile?.terrain >= 2 && tile.elevation < 2 && tile.resource === 255 && tile.wonder === 255 && !tile.improvement
                && !startBuffer.has(index) && (nativeConstraints?.elevation[index] ?? -1) < 0;
            }).sort((one, two) => geography.reliefValues[two] - geography.reliefValues[one] || one - two)[0];
            const displaced = tiles.flatMap((tile, index) => tile.terrain >= 2 && tile.elevation === 2
              && !wall.tileIndices.includes(index) && !startBuffer.has(index) && nativeConstraints?.elevation[index] !== 2 ? [index] : [])
              .sort((one, two) => geography.reliefValues[one] - geography.reliefValues[two] || one - two)[0];
            if (candidate !== undefined && displaced !== undefined) {
              const previousCandidate = tiles[candidate];
              const previousDisplaced = tiles[displaced];
              tiles[candidate] = { ...tiles[candidate], elevation: 2, feature: 255 };
              tiles[displaced] = { ...tiles[displaced], elevation: 1 };
              if (passableLandIsConnectedWithinLandmasses(
                tiles.map((tile) => tile.terrain >= 2),
                tiles.map((tile) => tile.elevation),
                width,
                height,
                wraps,
              )) source = candidate;
              else {
                tiles[candidate] = previousCandidate;
                tiles[displaced] = previousDisplaced;
              }
            }
          }
          if (source === undefined) continue;
          const originalRivers = tiles.map((tile) => tile.river);
          const wallSources = wall.tileIndices.filter((index) => tiles[index]?.terrain >= 2 && tiles[index].elevation === 2)
            .sort((one, two) => Number(one !== source) - Number(two !== source) || geography.reliefValues[two] - geography.reliefValues[one] || one - two);
          let realized: number[] = [];
          let realizedSource = source;
          for (const candidate of wallSources.slice(0, 10)) {
            for (const tile of tiles) tile.river = 0;
            realized = realizeNarrativeRiverSpine(
              tiles,
              width,
              height,
              wraps,
              [candidate],
              lowland.tileIndices,
              coast.tileIndices,
              drainage.tileIndices,
            );
            if (realized.length) { realizedSource = candidate; break; }
          }
          if (!realized.length) {
            for (let index = 0; index < tiles.length; index += 1) tiles[index].river = originalRivers[index];
            continue;
          }
          const blocked = new Set(realized);
          const usedSources = [realizedSource];
          const allWater = tiles.flatMap((tile, index) => tile.terrain < 2 ? [index] : []);
          const edgeFloor = Math.max(3, Math.round(Math.sqrt(tiles.length) / 8));
          const blockedVertices = new Set(reconstructCiv5RiverEdgeSystems({ width, height, wraps, tiles }).flatMap((system) => system.vertices));
          const nearWater = new Set(allWater);
          let waterFrontier = [...allWater];
          for (let radius = 0; radius < 2; radius += 1) {
            const next: number[] = [];
            for (const index of waterFrontier) for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
              const adjacent = y * width + x;
              if (nearWater.has(adjacent)) continue;
              nearWater.add(adjacent);
              next.push(adjacent);
            }
            waterFrontier = next;
          }
          const auxiliarySources = tiles.flatMap((tile, index) => tile.terrain >= 2 && tile.elevation === 2
            && usedSources.every((used) => hexDistance(
              [index % width, Math.floor(index / width)],
              [used % width, Math.floor(used / width)],
              width,
              wraps,
            ) >= 5) && !nearWater.has(index) ? [index] : [])
            .sort((one, two) => geography.reliefValues[two] - geography.reliefValues[one] || one - two);
          for (const candidate of auxiliarySources) {
            const substantialBefore = reconstructCiv5RiverEdgeSystems({ width, height, wraps, tiles })
              .filter((system) => system.edgeCount >= edgeFloor && system.acyclic && system.directedToOutlet).length;
            if (substantialBefore >= 3) break;
            if (usedSources.some((used) => hexDistance(
              [candidate % width, Math.floor(candidate / width)],
              [used % width, Math.floor(used / width)],
              width,
              wraps,
            ) < 5)) continue;
            const farWater = allWater.filter((index) => hexDistance(
              [candidate % width, Math.floor(candidate / width)],
              [index % width, Math.floor(index / width)],
              width,
              wraps,
            ) >= edgeFloor + 1);
            if (!farWater.length) continue;
            const priorRivers = tiles.map((tile) => tile.river);
            const trialVertices = new Set(blockedVertices);
            const tributary = realizeNarrativeRiverSpine(
              tiles,
              width,
              height,
              wraps,
              [candidate],
              [candidate],
              farWater,
              [],
              farWater,
              blocked,
              undefined,
              trialVertices,
            );
            const substantialAfter = reconstructCiv5RiverEdgeSystems({ width, height, wraps, tiles })
              .filter((system) => system.edgeCount >= edgeFloor && system.acyclic && system.directedToOutlet).length;
            if (!tributary.length || substantialAfter <= substantialBefore) {
              for (let index = 0; index < tiles.length; index += 1) tiles[index].river = priorRivers[index];
              continue;
            }
            usedSources.push(candidate);
            for (const index of tributary) blocked.add(index);
            blockedVertices.clear();
            for (const vertex of trialVertices) blockedVertices.add(vertex);
          }
          if (!realized.length) continue;
          physicalRealizedDrainageTiles.set(drainage.id, realized);
          geography.structure = {
            ...geography.structure,
            objects: geography.structure.objects.map((object) => object.id === drainage.id
              ? { ...object, tileIndices: realized }
              : object),
          };
        }
      }
    }
    applyNarrativeRiverValleyContent(tiles, [...RESOURCES], startLocations, width, height, wraps, effectiveNarrativeContract);
    // Rivers contribute freshwater to the audited start score. Reconcile once
    // more after hydrology so an incidental river cannot undo equivalent starts.
    balanceEquivalentPolisStarts(tiles, startLocations, width, height, wraps, resolved);
    let retainedEngineStructure = geography.structure;
    if (resolved.engine === "ECCENTRIC" && [
      "GRAPH_WONDER_HEARTLANDS",
      "GRAPH_ENCIRCLED_SEAS",
      "GRAPH_SCARRED_PANGAEA",
      "GRAPH_GREAT_PENINSULAS",
    ].includes(geography.structure.narrativeAdapter?.grammarFamily ?? "")) {
      retainedEngineStructure = {
        ...geography.structure,
        objects: finalizeEccentricGraphRelationships(
          geography.structure.narrativeAdapter?.grammarFamily,
          geography.structure.objects,
          tiles,
          startLocations,
          width,
          height,
          wraps,
        ),
      };
      if ([
        "GRAPH_WONDER_HEARTLANDS",
        "GRAPH_ENCIRCLED_SEAS",
        "GRAPH_SCARRED_PANGAEA",
        "GRAPH_GREAT_PENINSULAS",
      ].includes(geography.structure.narrativeAdapter?.grammarFamily ?? "")) {
        // Exact graph routes are realized after content and may lower a few
        // mountains to keep their physical relationships traversable. Rebuild
        // hydrology against those final elevations so a former headwater can
        // never survive as a stale inland or non-mountain river source.
        for (const start of startLocations) {
          const index = start.y * width + start.x;
          if (!tiles[index] || tiles[index].terrain < 2) continue;
          tiles[index].elevation = 0;
          tiles[index].wonder = 255;
        }
        const finalRelief = geography.reliefValues.map((value, index) => tiles[index].terrain < 2
          ? Math.min(value, 0.18)
          : tiles[index].elevation === 2
            ? Math.max(value, 0.84)
            : tiles[index].elevation === 1
              ? clamp(value, 0.46, 0.7)
              : Math.min(value, 0.48));
        const finalRiverNetwork = generateRiverNetwork(
          tiles,
          finalRelief,
          geography.moistures,
          width,
          height,
          wraps,
          resolved.style,
          resolved.rainfall,
          randomFactory(seedHash(`${resolved.seed}:eccentric-final-rivers:${geography.structure.narrativeAdapter?.grammarFamily}:${width}x${height}`)),
          undefined,
          resolved.riverDensity,
          scaleRiverGuidance,
          minimumNarrativeRiverSources,
        );
        for (let index = 0; index < tiles.length; index += 1) tiles[index].river = finalRiverNetwork[index];
        balanceEquivalentPolisStarts(tiles, startLocations, width, height, wraps, resolved);
      }
    }
    if (resolved.engine === "ECCENTRIC" && geography.structure.narrativeAdapter?.grammarFamily === "GRAPH_ECOLOGICAL_TRANSECT") {
      const temperatures = geography.temperatures ?? new Array<number>(tiles.length).fill(0.5);
      let nativeObjects = geography.structure.objects.flatMap((object): GeographicObject[] => {
        if (object.attributes?.nativeNarrative !== true) return [object];
        const effect = object.attributes.effect as NarrativeFieldSource["effect"] | NarrativePathReservation["effect"] | undefined;
        if (!effect) return [];
        const reserved = new Set(object.tileIndices);
        const matched = effect === "RIVER_PATH"
          // Civ V stores a river on the owner of one hex edge. That owner may
          // sit immediately beside the graph corridor even though the river
          // itself occupies their shared edge. Rebind to the real encoded
          // river-bearing owner tile, but only within one native hex of the
          // reserved graph path.
          ? tiles.flatMap((tile, index) => tile.terrain >= 2 && tile.river > 0
            && (reserved.has(index) || neighbors(index % width, Math.floor(index / width), width, height, wraps).some(([x, y]) => reserved.has(y * width + x))) ? [index] : [])
          // TRANSITION is a relationship between two unlike ecological
          // stages, not a demand that every plot on its route have mixed
          // immediate neighbors. The Eccentric engine has already compiled
          // an authored causal land spine; retain its real land here and bind
          // exact endpoints below instead of erasing long, gradual ecotones.
          : effect === "TRANSITION"
            ? object.tileIndices.filter((index) => tiles[index]?.terrain >= 2)
          : object.tileIndices.filter((index) => nativeFieldEffectMatches(effect, index, tiles, temperatures, geography.moistures, width, height, wraps));
        const tileIndices = object.kind === "NARRATIVE_PATH" ? largestConnectedFieldSubset(matched, width, height, wraps) : matched;
        return tileIndices.length ? [{ ...object, tileIndices, attributes: { ...object.attributes, outputEffectMatched: true } }] : [];
      });
      {
        const bySkeletonId = new Map(nativeObjects
          .filter((object) => object.attributes?.nativeNarrative === true)
          .map((object) => [object.id.replace(/^narrative-/, ""), object]));
        const eligible = new Set(tiles.flatMap((tile, index) => tile.terrain >= 2 ? [index] : []));
        const touches = (index: number, members: ReadonlySet<number>) => members.has(index)
          || neighbors(index % width, Math.floor(index / width), width, height, wraps).some(([x, y]) => members.has(y * width + x));
        const transitionPath = (from: GeographicObject, to: GeographicObject, preferred: ReadonlySet<number>) => {
          const fromTiles = new Set(from.tileIndices);
          const toTiles = new Set(to.tileIndices);
          const starts = [...eligible].filter((index) => touches(index, fromTiles)).sort((one, two) => one - two);
          const previous = new Int32Array(tiles.length).fill(-2);
          const queue = [...starts];
          for (const index of starts) previous[index] = -1;
          let terminal = starts.find((index) => touches(index, toTiles));
          for (let cursor = 0; cursor < queue.length && terminal === undefined; cursor += 1) {
            const adjacent = neighbors(queue[cursor] % width, Math.floor(queue[cursor] / width), width, height, wraps)
              .map(([x, y]) => y * width + x)
              .filter((index) => eligible.has(index) && previous[index] === -2)
              .sort((one, two) => Number(preferred.has(two)) - Number(preferred.has(one)) || one - two);
            for (const index of adjacent) {
              previous[index] = queue[cursor];
              queue.push(index);
              if (touches(index, toTiles)) { terminal = index; break; }
            }
          }
          if (terminal === undefined) return [];
          const path: number[] = [];
          for (let index = terminal; index >= 0; index = previous[index]) path.push(index);
          return path.reverse();
        };
        nativeObjects = nativeObjects.flatMap((object): GeographicObject[] => {
          if (object.attributes?.role !== "CAUSAL_TRANSITION") return [object];
          const from = bySkeletonId.get(String(object.attributes.from ?? ""));
          const to = bySkeletonId.get(String(object.attributes.to ?? ""));
          if (!from || !to) return [];
          const tileIndices = transitionPath(from, to, new Set(object.tileIndices));
          return tileIndices.length ? [{ ...object, tileIndices, attributes: { ...object.attributes, outputEffectMatched: true, endpointTerminatingSpine: true } }] : [];
        });
      }
      let ecologicalPrunedRiverEdges = 0;
      {
        const riverTemplate = geography.structure.objects.find((object) => object.attributes?.nativeNarrative === true && object.attributes?.role === "LIVING_RIVER");
        const coast = nativeObjects.find((object) => object.attributes?.role === "COAST");
        const marsh = nativeObjects.find((object) => object.attributes?.role === "RIVER_MARSH");
        const wall = nativeObjects.find((object) => object.attributes?.role === "MOUNTAIN_WALL");
        const riverTiles = riverTemplate && coast && marsh && wall
          ? realizeNarrativeRiverSpine(
              tiles,
              width,
              height,
              wraps,
              wall.tileIndices,
              marsh.tileIndices,
              coast.tileIndices,
              riverTemplate.tileIndices,
              [],
              new Set<number>(),
              undefined,
              new Set<string>(),
              true,
            )
          : [];
        const sanitation = riverTiles.length
          ? pruneIllogicalRiverComponents(tiles, width, height, wraps, new Set(riverTiles))
          : { clean: false, removedEdges: 0 };
        ecologicalPrunedRiverEdges = sanitation.removedEdges;
        nativeObjects = [
          ...nativeObjects.filter((object) => object.attributes?.role !== "LIVING_RIVER"),
          ...(riverTemplate && riverTiles.length && sanitation.clean ? [
            { ...riverTemplate, tileIndices: riverTiles, attributes: { ...riverTemplate.attributes, outputEffectMatched: true } },
          ] : []),
        ];
      }
      const retainedIds = new Set(nativeObjects.filter((object) => object.attributes?.nativeNarrative === true).map((object) => object.id));
      const adapter = geography.structure.narrativeAdapter;
      retainedEngineStructure = {
        ...geography.structure,
        objects: nativeObjects,
        narrativeAdapter: adapter ? {
          ...adapter,
          causalObjects: adapter.causalObjects.map((cause) => ({ ...cause, retained: retainedIds.has(cause.nativeObjectId) })),
        } : adapter,
        diagnostics: {
          ...geography.structure.diagnostics,
          nativeGraphBoundObjects: retainedIds.size,
          nativeGraphEcologicalPrunedRiverEdges: ecologicalPrunedRiverEdges,
          nativeGraphEcologicalFinalFeatureConstraints: protectedFeatureSites.size,
        },
      };
    }
    if (resolved.engine === "ECCENTRIC" && geography.structure.narrativeAdapter?.grammarFamily === "GRAPH_GREAT_WATERSHEDS") {
      const nativeObjects = geography.structure.objects.filter((object) => object.attributes?.nativeNarrative === true);
      const bySkeletonId = new Map(nativeObjects.map((object) => [object.id.replace(/^narrative-/, ""), object]));
      const trunkTemplates = nativeObjects.filter((object) => object.attributes?.role === "FLOWS_TO").filter((object) => {
        const from = bySkeletonId.get(String(object.attributes?.from ?? ""));
        const to = bySkeletonId.get(String(object.attributes?.to ?? ""));
        return from?.attributes?.role === "HEADWATER" && to?.attributes?.role === "OUTLET";
      });
      // Bind the retained watershed to the serialized Civ V edge graph, not
      // to adjacency between plots that happen to own unrelated river bits.
      // The latter can invent a continuous trunk and was especially fragile
      // at Provincial scale. Candidate systems include only a real directed,
      // acyclic mountain-to-water network; proximity to the authored endpoint
      // fields selects which exact causal template survives final hydrology.
      const riverCandidates = reconstructCiv5RiverEdgeSystems({ width, height, wraps, tiles })
        .filter((system) => system.edgeCount >= 2 && system.acyclic && system.directedToOutlet
          && system.sourceTileIndices.length > 0 && system.outletTileIndices.length === 1)
        .sort((one, two) => two.edgeCount - one.edgeCount || one.ownerIndices[0] - two.ownerIndices[0]);
      const selected = trunkTemplates.flatMap((trunk) => {
        const head = bySkeletonId.get(String(trunk.attributes?.from ?? ""));
        const outlet = bySkeletonId.get(String(trunk.attributes?.to ?? ""));
        if (!head || !outlet) return [];
        const distance = (one: readonly number[], two: readonly number[]) => Math.min(...one.flatMap((left) => two.map((right) => hexDistance(
          [left % width, Math.floor(left / width)],
          [right % width, Math.floor(right / width)],
          width,
          wraps,
        ))));
        return riverCandidates.map((system) => ({
          trunk,
          head,
          outlet,
          system,
          score: distance(system.sourceTileIndices, head.tileIndices)
            + distance(system.outletTileIndices, outlet.tileIndices)
            - system.ownerIndices.filter((index) => trunk.tileIndices.includes(index)).length * 2,
        }));
      }).sort((one, two) => one.score - two.score || two.system.edgeCount - one.system.edgeCount
        || one.trunk.id.localeCompare(two.trunk.id) || one.system.ownerIndices[0] - two.system.ownerIndices[0])[0];
      if (selected) {
        const selectedTrunk = selected.trunk;
        const selectedRiver = selected.system;
        const head = bySkeletonId.get(String(selectedTrunk.attributes?.from ?? ""));
        const outlet = bySkeletonId.get(String(selectedTrunk.attributes?.to ?? ""));
        if (head && outlet) {
          const retained: GeographicObject[] = [
            { ...head, tileIndices: [...selectedRiver.sourceTileIndices], attributes: { ...head.attributes, outputEffectMatched: true } },
            { ...outlet, tileIndices: [...selectedRiver.outletTileIndices], attributes: { ...outlet.attributes, effect: "WATER", outputEffectMatched: true } },
            { ...selectedTrunk, tileIndices: [...selectedRiver.ownerIndices], attributes: { ...selectedTrunk.attributes, outputEffectMatched: true } },
          ];
          const replacedIds = new Set(retained.map((object) => object.id));
          const causalRoles = new Set(["HEADWATER", "OUTLET", "FLOWS_TO"]);
          const objects = [
            ...geography.structure.objects.filter((object) => !causalRoles.has(String(object.attributes?.role ?? object.attributes?.relationship ?? ""))),
            ...retained,
          ];
          const adapter = geography.structure.narrativeAdapter;
          retainedEngineStructure = {
            ...geography.structure,
            objects,
            narrativeAdapter: adapter ? {
              ...adapter,
              causalObjects: adapter.causalObjects.map((cause) => causalRoles.has(cause.role)
                ? { ...cause, retained: replacedIds.has(cause.nativeObjectId) }
                : cause),
            } : adapter,
            diagnostics: { ...geography.structure.diagnostics, nativeGraphBoundObjects: objects.filter((object) => object.attributes?.nativeNarrative === true).length },
          };
        }
      }
      const watershedEdgeFloor = Math.max(3, Math.round(Math.sqrt(tiles.length) / 8));
      const substantialWatersheds = () => reconstructCiv5RiverEdgeSystems({ width, height, wraps, tiles })
        .filter((system) => system.edgeCount >= watershedEdgeFloor && system.acyclic && system.directedToOutlet);
      if (substantialWatersheds().length < 3) {
        const water = tiles.flatMap((tile, index) => tile.terrain < 2 ? [index] : []);
        const usedSources = substantialWatersheds().flatMap((system) => system.sourceTileIndices);
        const blockedOwners = new Set(reconstructCiv5RiverEdgeSystems({ width, height, wraps, tiles }).flatMap((system) => system.ownerIndices));
        const blockedVertices = new Set(reconstructCiv5RiverEdgeSystems({ width, height, wraps, tiles }).flatMap((system) => system.vertices));
        const sources = tiles.flatMap((tile, index) => tile.terrain >= 2 && tile.elevation === 2 ? [index] : [])
          .sort((one, two) => geography.reliefValues[two] - geography.reliefValues[one] || one - two);
        for (const source of sources) {
          const beforeCount = substantialWatersheds().length;
          if (beforeCount >= 3) break;
          if (usedSources.some((used) => hexDistance([source % width, Math.floor(source / width)], [used % width, Math.floor(used / width)], width, wraps) < 5)) continue;
          const farWater = water.filter((target) => hexDistance([source % width, Math.floor(source / width)], [target % width, Math.floor(target / width)], width, wraps) >= watershedEdgeFloor + 1);
          if (!farWater.length) continue;
          const before = tiles.map((tile) => tile.river);
          const trialVertices = new Set(blockedVertices);
          const owners = realizeNarrativeRiverSpine(tiles, width, height, wraps, [source], [source], farWater, [], farWater, blockedOwners, undefined, trialVertices);
          if (owners.length && substantialWatersheds().length > beforeCount) {
            usedSources.push(source);
            for (const owner of owners) blockedOwners.add(owner);
            blockedVertices.clear();
            for (const vertex of trialVertices) blockedVertices.add(vertex);
          } else for (let index = 0; index < tiles.length; index += 1) tiles[index].river = before[index];
        }
      }
    }
    const presetName = MAP_PRESETS.find((preset) => preset.id === resolved.preset)?.label ?? "Generated World";
    const modifierName = WORLD_MODIFIERS.find((modifier) => modifier.id === resolved.modifier)?.label;
    const mountainRanges = connectedLinearFeatures(tiles.map((tile) => tile.terrain >= 2 && tile.elevation === 2), width, height, wraps, "Mountain Range");
    const riverTiles = tiles.flatMap((tile, index) => tile.river > 0 ? [index] : []);
    const majorRiverTiles = riverTiles.filter((index) => (scaleRiverGuidance?.[index] ?? 0) >= 0.85).length;
    const minorRiverTiles = riverTiles.filter((index) => {
      const guidance = scaleRiverGuidance?.[index] ?? 0;
      return guidance >= 0.45 && guidance < 0.85;
    }).length;
    const exactConstraintTiles = nativeConstraints ? Array.from({ length: tiles.length }, (_value, index) => index)
      .filter((index) => nativeConstraints.topology[index] >= 0 || nativeConstraints.elevation[index] >= 0
        || nativeConstraints.terrain[index] >= 0 || nativeConstraints.feature[index] >= 0) : [];
    const exactConstraintObjects: GeographicObject[] = exactConstraintTiles.length ? [{
      id: "protected-exact-tile-constraints",
      semanticId: "protected:exact-tile-constraints",
      name: "Protected Exact Tile Constraints",
      kind: "NARRATIVE_REGION",
      tileIndices: exactConstraintTiles,
      attributes: { nativeProtectedSemantic: true, role: "EXACT_TILE_CONSTRAINT", policy: "EXACT" },
    }] : [];
    let structure: GenerationStructure = { ...retainedEngineStructure, objects: [...retainedEngineStructure.objects, ...exactConstraintObjects], mountainRanges, diagnostics: { ...retainedEngineStructure.diagnostics, scaleOrdinal: scaleProfile.ordinal, scaleMajorSystemFrequency: Math.round(scaleProfile.majorSystemFrequency * 100), scaleLocalDetail: Math.round(scaleProfile.localDetail * 100), scaleDrainageHierarchy: Math.round(scaleProfile.drainageHierarchy * 100), mountainRanges: mountainRanges.length, majorRiverTiles, minorRiverTiles, localRiverTiles: riverTiles.length - majorRiverTiles - minorRiverTiles } };
    const legal = enforceGeneratedPlacementLegality({
      name: `${presetName} — ${resolved.seed}`,
      description: `${description} at ${scaleProfile.label.toLowerCase()} scale${modifierName && modifierName !== "None" ? ` with ${modifierName}` : ""}.`,
      worldSize: size.id,
      version: 12,
      width,
      height,
      players: actualPlayerCount,
      wraps,
      terrains: [...TERRAINS],
      features: [...FEATURES],
      wonders: [...WONDERS],
      resources: [...RESOURCES],
      tiles,
      startLocations,
      source: "generated",
      generation: { ...resolved, players: actualPlayerCount, cityStates: cityStates.length, waterPercent: clamp(resolved.waterPercent, 0, 90), mountainPercent: effectiveMountainPercent },
      structure,
    });
    if (resolved.engine === "PHYSICAL") {
      structure = retainRealizedPhysicalHydrology(legal.tiles, width, height, wraps, structure);
    }
    const legalObservable: EngineNarrativeObservable = {
      ...observableFromMap(legal),
      reliefValues: geography.reliefValues,
      moistures: geography.moistures,
      structure,
    };
    const legalEvidence = appendEngineNarrativeEvidence(
      engineNarrativeEvidence,
      captureEngineNarrativeStage("LEGAL_NORMALIZED", legalObservable, width, height, wraps),
      compareEngineNarrativeStages("NARRATIVE_REALIZED", "LEGAL_NORMALIZED", geography, legalObservable),
    );
    observeNarrativeStage("LEGAL_NORMALIZED", legalObservable);
    const generatedNarrativeAdapter = resolved.engine === "ECCENTRIC"
      ? structure.narrativeAdapter ?? narrativeAdapter.evidence
      : narrativeAdapter.evidence;
    const baseRetainedNarrativeAdapter = rebindNarrativeAdapterToFinalNativeObjects(generatedNarrativeAdapter, structure.objects);
    const retainedNarrativeAdapter = {
      ...baseRetainedNarrativeAdapter,
      relaxations: [...new Set([
        ...baseRetainedNarrativeAdapter.relaxations,
        ...(resolved.engine === "PHYSICAL" && (structure.diagnostics.nativePhysicalHydrologyDropped ?? 0) > 0
          ? [`Final hydrology retained ${structure.diagnostics.nativePhysicalHydrologyRetained ?? 0} exact directed causal object(s) and left ${structure.diagnostics.nativePhysicalHydrologyDropped} unmatched drainage template(s) explicitly unretained.`]
          : []),
        ...(resolved.engine === "PHYSICAL" && (structure.diagnostics.nativePhysicalSupplyTemplatesDropped ?? 0) > 0
          ? [`Final accessibility retained only land-connected Icehouse supply relationships and left ${structure.diagnostics.nativePhysicalSupplyTemplatesDropped} cross-water template(s) explicitly unretained.`]
          : []),
        ...(resolved.engine === "PHYSICAL" && (structure.diagnostics.nativePhysicalIslandArcSystemsDropped ?? 0) > 0
          ? [`Final subduction geometry retained only complete, ordered trench–arc–shelf–sea cross-sections and left ${structure.diagnostics.nativePhysicalIslandArcSystemsDropped} coarse-raster system(s) explicitly unretained.`]
          : []),
        ...capacityDisclosures(
          requestedMajorPopulation(resolved.players),
          playerCount,
          actualPlayerCount,
          requestedCityStatePopulation(resolved.cityStates),
          cityStateCount,
          cityStates.length,
          narrativeProgram.generative?.gameplay.capacityPolicy ?? "PRESERVE_POPULATION",
        ),
      ])],
    };
    const observedStructure = { ...structure, narrativeSkeleton, narrativeProgram, narrativeNativePlan: narrativeAdapter.native, narrativeAdapter: retainedNarrativeAdapter, engineNarrativeEvidence: legalEvidence };
    const observedLegal = { ...legal, structure: observedStructure };
    return { ...observedLegal, structure: attachRiverSystems(observedLegal, observedStructure) };
  };
  if (resolved.engine === "ECCENTRIC") {
    onProgress?.("Compiling dense subregions and world grammars");
    const rawGeography = generateEccentricGeography(nativeGenerationOptions, width, height, wraps, seed, random, scale, nativeConstraints, narrativeAdapter);
    observeNarrativeStage("RAW_NATIVE", rawGeography);
    const attachedGeography = attachNarrativeStructure({ ...rawGeography, structure: { ...rawGeography.structure, narrativeSkeleton, narrativeProgram } }, narrativeSkeleton, width, height, wraps);
    // Eccentric's graph compiler has already bound its retained causes to real
    // polygon output. Do not let the compatibility attachment stage replace a
    // relaxed or unbound cause with a synthetic painted object.
    let realizedGeography = {
      ...attachedGeography,
      structure: {
        ...attachedGeography.structure,
        objects: attachedGeography.structure.objects.filter((object) => !object.id.startsWith("narrative-") || object.attributes?.nativeNarrative === true),
      },
    };
    if (resolved.preset === "LONELY_OCEANS") {
      const viableRealms = realizedGeography.structure.objects
        .filter((object) => object.kind === "CONTINENT" && object.tileIndices.filter((index) => realizedGeography.elevations[index] < 2).length >= 6)
        .sort((one, two) => two.tileIndices.length - one.tileIndices.length)
        .slice(0, targetMajorPopulation);
      const starts = viableRealms.flatMap((realm, player) => {
        const candidates = realm.tileIndices.filter((index) => realizedGeography.elevations[index] < 2);
        if (!candidates.length) return [];
        const centerX = realm.tileIndices.reduce((sum, index) => sum + index % width, 0) / realm.tileIndices.length;
        const centerY = realm.tileIndices.reduce((sum, index) => sum + Math.floor(index / width), 0) / realm.tileIndices.length;
        const index = candidates.sort((one, two) => Math.hypot(one % width - centerX, Math.floor(one / width) - centerY) - Math.hypot(two % width - centerX, Math.floor(two / width) - centerY) || one - two)[0];
        return [{ x: index % width, y: Math.floor(index / width), player, civilization: "", leader: "", team: player, playable: true, cityState: false }];
      });
      realizedGeography = { ...realizedGeography, startLocations: starts };
    }
    observeNarrativeStage("NARRATIVE_REALIZED", realizedGeography);
    const evidence = createEngineNarrativeEvidence(
      "ECCENTRIC",
      captureEngineNarrativeStage("RAW_NATIVE", rawGeography, width, height, wraps),
      captureEngineNarrativeStage("NARRATIVE_REALIZED", realizedGeography, width, height, wraps),
      compareEngineNarrativeStages("RAW_NATIVE", "NARRATIVE_REALIZED", rawGeography, realizedGeography),
    );
    const geography = reinforceNativeConstraints(realizedGeography);
    return finishStructuredGeography(geography, `A seeded ${resolved.fantasticality.toLowerCase()} ${MAP_PRESETS.find((preset) => preset.id === resolved.preset)?.label.toLowerCase() ?? "eccentric"} map compiled by the Eccentric engine in ${geography.diagnostics.passes} geographic passes from ${geography.diagnostics.subregions} subregions, ${geography.diagnostics.polygons} polygons, ${geography.diagnostics.climatePalettes} biome palettes, ${geography.diagnostics.astronomyBasins} astronomy basins, and ${geography.diagnostics.continents} continents`, evidence);
  }
  if (resolved.engine === "PHYSICAL") {
    onProgress?.("Simulating plates, circulation, climate, and watersheds");
    const rawGeography = generatePhysicalGeography(nativeGenerationOptions, width, height, wraps, seed, random, scale, nativeConstraints, narrativeAdapter);
    observeNarrativeStage("RAW_NATIVE", rawGeography);
    const realizedGeography = attachNarrativeStructure({ ...rawGeography, structure: { ...rawGeography.structure, narrativeSkeleton, narrativeProgram, narrativeAdapter: narrativeAdapter.evidence } }, narrativeSkeleton, width, height, wraps);
    observeNarrativeStage("NARRATIVE_REALIZED", realizedGeography);
    const evidence = createEngineNarrativeEvidence(
      "PHYSICAL",
      captureEngineNarrativeStage("RAW_NATIVE", rawGeography, width, height, wraps),
      captureEngineNarrativeStage("NARRATIVE_REALIZED", realizedGeography, width, height, wraps),
      compareEngineNarrativeStages("RAW_NATIVE", "NARRATIVE_REALIZED", rawGeography, realizedGeography),
    );
    const geography = reinforceNativeConstraints(realizedGeography);
    return finishStructuredGeography(geography, `A seeded ${resolved.style.toLowerCase()} Physical world compiled in ${geography.structure.diagnostics.passes} passes from ${geography.structure.diagnostics.plates} moving plates, ${geography.structure.diagnostics.continents} continents, ${geography.structure.diagnostics.atmosphericCells} atmospheric cells, ${geography.structure.diagnostics.rainShadows} rain shadows, and ${geography.structure.diagnostics.watersheds} outlet-directed watersheds`, evidence);
  }
  if (resolved.engine === "POLIS") {
    onProgress?.("Compiling strategic graph and protected routes");
    const rawGeography = generatePolisGeography(nativeGenerationOptions, width, height, wraps, seed, random, scale, narrativeRecipe.matchIntent, nativeConstraints, narrativeAdapter);
    observeNarrativeStage("RAW_NATIVE", rawGeography);
    const realizedGeography = attachNarrativeStructure({ ...rawGeography, structure: { ...rawGeography.structure, narrativeSkeleton, narrativeProgram, narrativeAdapter: narrativeAdapter.evidence } }, narrativeSkeleton, width, height, wraps);
    observeNarrativeStage("NARRATIVE_REALIZED", realizedGeography);
    const evidence = createEngineNarrativeEvidence(
      "POLIS",
      captureEngineNarrativeStage("RAW_NATIVE", rawGeography, width, height, wraps),
      captureEngineNarrativeStage("NARRATIVE_REALIZED", realizedGeography, width, height, wraps),
      compareEngineNarrativeStages("RAW_NATIVE", "NARRATIVE_REALIZED", rawGeography, realizedGeography),
    );
    const geography = reinforceNativeConstraints(realizedGeography);
    return finishStructuredGeography(geography, `A seeded gameplay-first world compiled by Polis from ${geography.diagnostics.strategicRegions} strategic regions, ${geography.diagnostics.fronts} fronts, ${geography.diagnostics.contestedRegions} contested objectives, and protected routes between every major start`, evidence);
  }
  const centerConfig: Record<MapPresetId, [number, [number, number]]> = {
    CONTINENTS: [4, [0.18, 0.31]],
    PANGAEA: [1, [0.43, 0.54]],
    ARCHIPELAGO: [28, [0.045, 0.12]],
    INLAND_SEAS: [9, [0.07, 0.17]],
    EARTHSEA: [12, [0.08, 0.21]],
    RIFT_REALMS: [9, [0.11, 0.25]],
    LABYRINTH: [13, [0.07, 0.17]],
    WILD_REGIONS: [15, [0.065, 0.2]],
    LIVING_WORLD: [5, [0.16, 0.3]],
    TECTONIC_CONTINENTS: [4, [0.17, 0.31]],
    GREAT_WATERSHEDS: [3, [0.22, 0.36]],
    SHATTERED_BASINS: [16, [0.06, 0.17]],
    MYTHIC_REGIONS: [10, [0.08, 0.24]],
    ENCIRCLING_LANDS: [4, [0.18, 0.31]],
    ASTRAL_PANGAEA: [2, [0.35, 0.49]],
    RIFTWORLD: [10, [0.08, 0.2]],
    LONELY_OCEANS: [22, [0.04, 0.1]],
    PENINSULA_REALM: [6, [0.14, 0.28]],
    SHATTERED_ARCHIPELAGO: [24, [0.04, 0.11]],
    DYNAMIC_EARTH: [5, [0.17, 0.3]],
    COLLIDING_PLATES: [3, [0.24, 0.4]],
    ANCIENT_CRATONS: [4, [0.2, 0.35]],
    ISLAND_ARC_EARTH: [18, [0.05, 0.13]],
    SUPERCONTINENT_INTERIOR: [2, [0.34, 0.48]],
    MONSOON_CONTINENTS: [5, [0.16, 0.3]],
    ICEHOUSE_EARTH: [4, [0.18, 0.32]],
    IMPERIAL_RING: [8, [0.08, 0.2]],
    OPPOSING_FRONTS: [6, [0.1, 0.22]],
    CONTESTED_HEARTLAND: [7, [0.09, 0.2]],
    RIVAL_CONTINENTS: [4, [0.18, 0.32]],
    THREE_REALMS: [3, [0.2, 0.3]],
    THALASSIC_LEAGUE: [8, [0.08, 0.16]],
    UNEQUAL_REALMS: [4, [0.18, 0.32]],
  };
  const [baseCenterCount, baseCenterRadius] = centerConfig[resolved.preset];
  const centerCount = Math.max(1, Math.round(baseCenterCount * scaleProfile.excogitare.centerFrequency));
  const radiusExpansion = Math.sqrt(1 / Math.max(0.2, scaleProfile.excogitare.centerFrequency));
  const centerRadius: [number, number] = [Math.min(0.7, baseCenterRadius[0] * radiusExpansion), Math.min(0.82, baseCenterRadius[1] * radiusExpansion)];
  onProgress?.("Forming Excogitare terrain fields");
  const centers = createCenters(centerCount, random, centerRadius, !wraps);
  const plateCenters = createCenters(Math.max(3, Math.round(baseCenterCount * 0.7 * scaleProfile.excogitare.plateFrequency)), random, [0.09 * radiusExpansion, Math.min(0.42, 0.19 * radiusExpansion)], !wraps);
  if (resolved.preset === "PANGAEA") centers[0] = { x: 0.5, y: 0.5, radiusX: 0.49, radiusY: 0.43 };
  let nativeFieldSemanticReservations = 0;
  const protectedFieldMembers = (id: string) => {
    const semantic = nativeConstraints?.semantics.find((candidate) => candidate.sourceSemanticId === `narrative:${id}`);
    if (!semantic) return [];
    const members = [...new Set(semantic.tileIndices.filter((index) => index >= 0 && index < width * height))];
    if (members.length) nativeFieldSemanticReservations += 1;
    return members;
  };
  // SHAPE protection of a field source must also rebase its authored system.
  // Keeping the old core pixels while leaving its target-seed lobes and paths
  // elsewhere produces a labelled remnant, not a regenerated crooked
  // continent. For this grammar only, source-map neighbor anchors deterministically
  // translate the affected root systems before any field is thresholded.
  const fieldSourceById = new Map(fieldPlan?.sources.map((source) => [source.id.replace(/^field-/, ""), source]) ?? []);
  const protectedFieldAnchor = new Map<string, { x: number; y: number }>();
  const fieldCentroid = (members: readonly number[]) => {
    if (!members.length) return undefined;
    const y = members.reduce((sum, index) => sum + (Math.floor(index / width) + 0.5) / height, 0) / members.length;
    if (!wraps) return { x: members.reduce((sum, index) => sum + (index % width + 0.5) / width, 0) / members.length, y };
    const sine = members.reduce((sum, index) => sum + Math.sin((index % width + 0.5) / width * Math.PI * 2), 0);
    const cosine = members.reduce((sum, index) => sum + Math.cos((index % width + 0.5) / width * Math.PI * 2), 0);
    return { x: ((Math.atan2(sine, cosine) / (Math.PI * 2)) % 1 + 1) % 1, y };
  };
  if (fieldPlan?.grammarFamily === "FIELD_CROOKED_CONTINENTS") for (const semantic of nativeConstraints?.semantics ?? []) {
    const id = semantic.sourceSemanticId.replace(/^narrative:/, "");
    const centroid = fieldCentroid(semantic.tileIndices.filter((index) => index >= 0 && index < width * height));
    if (centroid && fieldSourceById.has(id)) protectedFieldAnchor.set(id, centroid);
    for (const related of semantic.relatedAnchors) {
      const relatedId = related.semanticId.replace(/^narrative:/, "");
      if (!fieldSourceById.has(relatedId)) continue;
      protectedFieldAnchor.set(relatedId, { x: (related.index % width + 0.5) / width, y: (Math.floor(related.index / width) + 0.5) / height });
    }
  }
  const fieldDelta = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    let x = to.x - from.x;
    if (wraps && Math.abs(x) > 0.5) x += x > 0 ? -1 : 1;
    return { x, y: to.y - from.y };
  };
  const rootDelta = new Map<string, { x: number; y: number }>();
  for (const source of fieldPlan?.sources.filter((candidate) => !candidate.parentId) ?? []) {
    const id = source.id.replace(/^field-/, "");
    const anchor = protectedFieldAnchor.get(id);
    if (anchor) rootDelta.set(id, fieldDelta(source, anchor));
  }
  if (fieldPlan?.grammarFamily === "FIELD_CROOKED_CONTINENTS" && protectedFieldAnchor.size) {
    const rootSources = fieldPlan.sources.filter((candidate) => !candidate.parentId && candidate.role === "CONTINENT_CORE");
    const placed = rootSources.flatMap((source) => {
      const delta = rootDelta.get(source.id.replace(/^field-/, ""));
      return delta ? [{ x: wraps ? (source.x + delta.x + 1) % 1 : clamp(source.x + delta.x), y: clamp(source.y + delta.y, 0, 1) }] : [];
    });
    for (const source of rootSources.filter((candidate) => !rootDelta.has(candidate.id.replace(/^field-/, "")))) {
      const candidates = [
        { x: source.x, y: source.y },
        ...Array.from({ length: 12 }, (_, x) => Array.from({ length: 7 }, (_, y) => ({ x: (x + 0.5) / 12, y: 0.1 + y * 0.8 / 6 }))).flat(),
      ];
      const distance = (one: { x: number; y: number }, two: { x: number; y: number }) => {
        let dx = Math.abs(one.x - two.x);
        if (wraps) dx = Math.min(dx, 1 - dx);
        return Math.hypot(dx, (one.y - two.y) * height / Math.max(1, width));
      };
      const selected = candidates.sort((one, two) => {
        const clearance = (candidate: { x: number; y: number }) => Math.min(...placed.map((anchor) => distance(candidate, anchor)));
        return clearance(two) - clearance(one) || distance(one, source) - distance(two, source) || one.y - two.y || one.x - two.x;
      })[0];
      rootDelta.set(source.id.replace(/^field-/, ""), fieldDelta(source, selected));
      placed.push(selected);
    }
  }
  const adjustedFieldSourceById = new Map<string, NarrativeFieldSource>();
  for (const source of fieldPlan?.sources ?? []) {
    const id = source.id.replace(/^field-/, "");
    const direct = protectedFieldAnchor.get(id);
    const delta = direct ? fieldDelta(source, direct) : source.parentId ? rootDelta.get(source.parentId) : undefined;
    const x = delta ? source.x + delta.x : source.x;
    const y = delta ? source.y + delta.y : source.y;
    adjustedFieldSourceById.set(id, { ...source, x: wraps ? (x % 1 + 1) % 1 : clamp(x), y: clamp(y, 0, 1) });
  }
  const adjustedFieldPaths = new Map(fieldPlan?.paths.map((path) => {
    const from = fieldSourceById.get(path.from); const adjustedFrom = adjustedFieldSourceById.get(path.from);
    const to = fieldSourceById.get(path.to); const adjustedTo = adjustedFieldSourceById.get(path.to);
    const fromDelta = from && adjustedFrom ? fieldDelta(from, adjustedFrom) : { x: 0, y: 0 };
    const toDelta = to && adjustedTo ? fieldDelta(to, adjustedTo) : { x: 0, y: 0 };
    const denominator = Math.max(1, path.points.length - 1);
    const points = path.points.map((point, index) => {
      const amount = index / denominator;
      const x = point.x + fromDelta.x * (1 - amount) + toDelta.x * amount;
      return { x: wraps ? (x % 1 + 1) % 1 : clamp(x), y: clamp(point.y + fromDelta.y * (1 - amount) + toDelta.y * amount, 0, 1) };
    });
    return [path.id, { ...path, points }] as const;
  }) ?? []);
  const nativeLandformRelief = new Float32Array(width * height);
  const nativeLandformStrength = new Map<string, Map<number, number>>();
  let nativeLandformBranches = 0;
  const nativeFieldSourceReservations = new Map(fieldPlan?.sources.map((source) => {
    const id = source.id.replace(/^field-/, "");
    const protectedMembers = protectedFieldMembers(id);
    const adjusted = adjustedFieldSourceById.get(id) ?? source;
    const ellipseBudget = rasterFieldSource(adjusted, width, height, wraps);
    const landform = control?.fieldConstruction === "BRANCHING" && !protectedMembers.length
      ? buildNativeFieldLandform(adjusted, width, height, wraps, seed, ellipseBudget.length)
      : undefined;
    const rasterized = landform?.tiles ?? ellipseBudget;
    if (landform) {
      nativeLandformBranches += landform.branchCount;
      nativeLandformStrength.set(id, new Map(landform.backbone.map(point => [point.index, .15 + point.strength * .85])));
      if (source.effect === "LAND" || source.effect === "RIDGE" || source.effect === "VOLCANIC") {
        for (const point of landform.backbone) nativeLandformRelief[point.index] = Math.max(nativeLandformRelief[point.index], point.strength * (source.effect === "LAND" ? .18 : .3));
      }
    }
    let anchorX = Math.round(adjusted.x * width - 0.5);
    if (wraps) anchorX = (anchorX % width + width) % width;
    else anchorX = Math.max(0, Math.min(width - 1, anchorX));
    const anchorY = Math.max(0, Math.min(height - 1, Math.round(adjusted.y * height - 0.5)));
    return [id, protectedMembers.length ? protectedMembers : rasterized.length ? rasterized : [anchorY * width + anchorX]] as const;
  }) ?? []);
  const nativeFieldPathReservations = new Map(fieldPlan?.paths.map((path) => {
    const protectedMembers = protectedFieldMembers(path.id);
    return [path.id, protectedMembers.length ? protectedMembers : rasterFieldPath(adjustedFieldPaths.get(path.id) ?? path, width, height, wraps)] as const;
  }) ?? []);
  const nativeFieldLandPriority = new Float64Array(width * height);
  const nativeFieldWaterPriority = new Float64Array(width * height);
  const nativeRiftSeamTiles = new Set<number>();
  for (const source of fieldPlan?.sources ?? []) {
    const members = nativeFieldSourceReservations.get(source.id.replace(/^field-/, "")) ?? [];
    const priority = source.strength * 2;
    const strengths = nativeLandformStrength.get(source.id.replace(/^field-/, ""));
    for (const index of members) (source.effect === "WATER" ? nativeFieldWaterPriority : nativeFieldLandPriority)[index] += priority * (strengths?.get(index) ?? 1);
  }
  for (const path of fieldPlan?.paths ?? []) {
    if (path.effect === "TRANSITION" && fieldPlan?.grammarFamily !== "FIELD_PATCHWORK_PROVINCES") continue;
    const members = nativeFieldPathReservations.get(path.id) ?? [];
    const priority = path.strength * (path.kind === "PRIMARY_RIFT" ? 4 : 2.8);
    for (const index of members) (path.effect === "WATER_PATH" ? nativeFieldWaterPriority : nativeFieldLandPriority)[index] += priority;
  }
  if (fieldPlan?.thresholdPolicy.edgePolicy === "LAND") {
    for (let x = 0; x < width; x += 1) {
      nativeFieldLandPriority[x] += 20;
      nativeFieldLandPriority[(height - 1) * width + x] += 20;
    }
    if (!wraps) {
      for (let y = 0; y < height; y += 1) {
        nativeFieldLandPriority[y * width] += 20;
        nativeFieldLandPriority[y * width + width - 1] += 20;
      }
    }
  }
  let landMask = new Array<boolean>(width * height);
  let fieldValues = new Array<number>(width * height);
  const warpStrength = character.excogitare.warpStrength
    + (resolved.modifier === "FRACTURED" ? 0.07 : resolved.modifier === "STRATEGIC_DEPTH" ? 0.035 : 0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const warped = warpedCoordinates(x, y, width, height, seed, warpStrength);
      const nx = wraps ? ((warped.x % 1) + 1) % 1 : clamp(warped.x, -0.1, 1.1);
      const ny = clamp(warped.y, -0.08, 1.08);
      const sampledX = x / scaleProfile.excogitare.fieldSpan;
      const sampledY = y / scaleProfile.excogitare.fieldSpan;
      const noise = fractalNoise(sampledX, sampledY, seed);
      const fineDetail = valueNoise(sampledX + 701, sampledY + 311, character.excogitare.fineDetailScale, seed + 9001) - 0.5;
      let field = presetField(resolved.preset, nx, ny, noise, centers, wraps);
      field += fineDetail * character.excogitare.fineDetailAmplitude;
      if (resolved.modifier === "FRACTURED") field += (valueNoise(x, y, 2.1, seed + 1171) - 0.5) * 0.28;
      const polarPenalty = wraps ? Math.max(0, scaledPoleProximity(x, y, width, height, resolved.projectionType, scale, seed + 31) - 0.86) * character.excogitare.polarPenalty : 0;
      if (!wraps) {
        const edge = Math.min(x / width, 1 - x / width, y / height, 1 - y / height);
        if (edge < 0.075) {
          const edgeInfluence = (0.075 - edge) / 0.075;
          if (fieldEdgePolicy === "LAND") field += edgeInfluence * 2.4;
          else if (fieldEdgePolicy === "WATER" || fieldEdgePolicy === "OPEN") field -= edgeInfluence * 0.8;
          else field -= edgeInfluence * 0.26;
        }
      }
      const index = y * width + x;
      const topology = control?.fieldConstruction === "BRANCHING"
        ? .75 * (nativeFieldLandPriority[index] - nativeFieldWaterPriority[index]) / (2 + Math.abs(nativeFieldLandPriority[index] - nativeFieldWaterPriority[index]))
        : narrativeAdapter.topology[index] * narrativeInfluenceStrength("EXCOGITARE").topology;
      fieldValues[index] = field - polarPenalty + topology;
    }
  }

  // Terrain Diffusion uses a coarse conditioning map followed by learned refinement.
  // The browser-native realistic style mirrors that two-stage structure with a
  // deterministic denoising/refinement schedule and Earth-like quantile targets.
  if (character.excogitare.landRefinementPasses > 0) {
    onProgress?.("Refining terrain fields");
    fieldValues = diffuseRefine(fieldValues, width, height, seed + 3001, wraps, character.excogitare.landRefinementPasses, 0.2, 0.07);
  }
  let shelfTopologyChanged = false;
  if (fieldPlan && control?.fieldConstruction !== "BRANCHING") {
    // Legacy replay: native field sources and paths participate in the same scalar field that
    // sea level thresholds. They are not painted onto an already-selected map.
    // Conflicts are resolved by authored strength; an explicit path therefore
    // cuts through the broader regions it connects while leaving viable land
    // around its terminal cells.
    const minimumField = Math.min(...fieldValues);
    const maximumField = Math.max(...fieldValues);
    const span = Math.max(1, maximumField - minimumField);
    for (let index = 0; index < fieldValues.length; index += 1) {
      const landPriority = nativeFieldLandPriority[index];
      const waterPriority = nativeFieldWaterPriority[index];
      if (landPriority <= 0 && waterPriority <= 0) continue;
      if (waterPriority > landPriority) fieldValues[index] = minimumField - span * (1.4 + waterPriority * 0.18);
      else fieldValues[index] = maximumField + span * (1.4 + landPriority * 0.18);
    }
  }
  if (nativeConstraints) {
    for (const semantic of nativeConstraints.semantics) {
      const waterFunction = /OCEAN|SEA|LAKE|RIFT|STRAIT/.test(semantic.objectKind);
      const sign = waterFunction ? -1 : 1;
      for (const index of semantic.tileIndices) if (index >= 0 && index < fieldValues.length) fieldValues[index] += sign * (semantic.hard ? 0.72 : 0.38);
      for (const related of semantic.relatedAnchors) {
        const fromX = semantic.anchorIndex % width; const fromY = Math.floor(semantic.anchorIndex / width);
        const toX = related.index % width; const toY = Math.floor(related.index / width);
        const steps = Math.max(2, Math.ceil(Math.hypot(toX - fromX, toY - fromY)));
        for (let step = 0; step <= steps; step += 1) {
          const x = Math.max(0, Math.min(width - 1, Math.round(fromX + (toX - fromX) * step / steps)));
          const y = Math.max(0, Math.min(height - 1, Math.round(fromY + (toY - fromY) * step / steps)));
          const index = y * width + x;
          fieldValues[index] += sign * (semantic.hard ? 0.9 : 0.48);
        }
      }
    }
    const minimumField = Math.min(...fieldValues);
    const maximumField = Math.max(...fieldValues);
    for (let index = 0; index < fieldValues.length; index += 1) {
      if (nativeConstraints.topology[index] === 1) fieldValues[index] = maximumField + 1;
      else if (nativeConstraints.topology[index] === 0) fieldValues[index] = minimumField - 1;
    }
  }
  const waterPercent = clamp(resolved.waterPercent, 0, 90);
  const landThreshold = waterPercent === 0 ? Number.NEGATIVE_INFINITY : quantile(fieldValues, waterPercent / 100);
  const reliefBaseline = Number.isFinite(landThreshold) ? landThreshold : quantile(fieldValues, 0.15);
  landMask = waterPercent === 0 ? landMask.fill(true) : exactHighestMask(fieldValues, targetLandCount);
  applyConstrainedLandBudget(landMask, targetLandCount, fieldValues, nativeConstraints);
  if (fieldPlan && (resolved.preset === "PANGAEA" || resolved.preset === "INLAND_SEAS")) {
    const dominantRoles = resolved.preset === "PANGAEA" ? new Set(["DOMINANT_CONTINENT"]) : new Set(["ENCLOSING_LAND"]);
    const nativeSeeds = fieldPlan.sources
      .filter((source) => dominantRoles.has(source.role))
      .flatMap((source) => nativeFieldSourceReservations.get(source.id.replace(/^field-/, "")) ?? [])
      .filter((index) => landMask[index]);
    reinforceNativeDominantLandmass(
      landMask,
      resolved.preset === "PANGAEA" ? 0.72 : 0.75,
      resolved.preset === "PANGAEA" ? 3 : 1,
      nativeSeeds,
      fieldValues,
      nativeFieldLandPriority,
      nativeFieldWaterPriority,
      nativeConstraints,
      width,
      height,
      wraps,
    );
  }
  if (fieldPlan?.grammarFamily === "FIELD_LAKE_KINGDOMS") realizeNativeLakeKingdomWaters(
    landMask,
    fieldPlan.sources,
    fieldPlan.paths,
    nativeFieldSourceReservations,
    nativeFieldPathReservations,
    fieldValues,
    nativeFieldLandPriority,
    nativeFieldWaterPriority,
    nativeConstraints,
    width,
    height,
    wraps,
  );
  if (fieldPlan?.grammarFamily === "FIELD_CROOKED_CONTINENTS") {
    separateNativeCrookedContinentSystems(
      landMask,
      fieldPlan.sources,
      fieldPlan.paths,
      nativeFieldSourceReservations,
      nativeFieldPathReservations,
      fieldValues,
      nativeFieldLandPriority,
      nativeFieldWaterPriority,
      nativeConstraints,
      width,
      height,
      wraps,
    );
  }
  if (fieldPlan && (resolved.preset === "ARCHIPELAGO" || resolved.preset === "EARTHSEA")) {
    const anchorRole = resolved.preset === "ARCHIPELAGO" ? "DROWNED_SHELF" : "ISLAND_CONTINENT";
    const anchorSources = fieldPlan.sources.filter((source) => source.role === anchorRole);
    const requiredShelfFragmentSeeds = new Set<number>();
    if (resolved.preset === "ARCHIPELAGO") {
      const retainedShelfConnections = new Set<number>();
      const rootByRegion = new Map(fieldPlan.sources.map((source) => {
        const id = source.id.replace(/^field-/, "");
        return [id, source.role === "DROWNED_SHELF" ? id : source.parentId ?? id];
      }));
      const mandatoryLand = new Set([
        ...fieldPlan.sources.filter((source) => source.effect === "LAND")
          .flatMap((source) => nativeFieldSourceReservations.get(source.id.replace(/^field-/, "")) ?? []),
        ...fieldPlan.paths.filter((path) => path.effect === "LAND_PATH")
          .flatMap((path) => nativeFieldPathReservations.get(path.id) ?? []),
      ]);
      for (const fragment of fieldPlan.sources.filter((source) => source.role === "SHELF_FRAGMENT").sort((one, two) => one.id.localeCompare(two.id))) {
        const id = fragment.id.replace(/^field-/, "");
        const members = nativeFieldSourceReservations.get(id) ?? [];
        const retained = members.filter((index) => landMask[index]);
        if (retained.length) {
          requiredShelfFragmentSeeds.add(retained.sort((one, two) => fieldValues[two] - fieldValues[one] || one - two)[0]);
          continue;
        }
        const relatedPathTiles = new Set(fieldPlan.paths
          .filter((path) => path.kind === "DROWNED_SHELF_ARC" && (path.from === id || path.to === id))
          .flatMap((path) => nativeFieldPathReservations.get(path.id) ?? []));
        const target = members
          .filter((index) => !requiredShelfFragmentSeeds.has(index) && nativeConstraints?.topology[index] !== 0)
          .sort((one, two) => {
            const landContact = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
              .filter(([x, y]) => {
                const next = y * width + x;
                return landMask[next] && relatedPathTiles.has(next);
              }).length;
            return landContact(two) - landContact(one)
              || (nativeFieldLandPriority[two] ?? 0) - (nativeFieldLandPriority[one] ?? 0)
              || fieldValues[two] - fieldValues[one]
              || one - two;
          })[0];
        if (target === undefined) continue;
        const donor = landMask.flatMap((land, index) => land
          && !mandatoryLand.has(index)
          && !requiredShelfFragmentSeeds.has(index)
          && nativeConstraints?.topology[index] !== 1
          ? [index] : [])
          .sort((one, two) => {
            const landNeighbors = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
              .filter(([x, y]) => landMask[y * width + x]).length;
            return landNeighbors(one) - landNeighbors(two)
              || (nativeFieldLandPriority[one] ?? 0) - (nativeFieldLandPriority[two] ?? 0)
              || fieldValues[one] - fieldValues[two]
              || one - two;
          })[0];
        if (donor === undefined) continue;
        landMask[target] = true;
        landMask[donor] = false;
        requiredShelfFragmentSeeds.add(target);
        mandatoryLand.add(target);
      }
      for (const path of fieldPlan.paths.filter((candidate) => candidate.kind === "DROWNED_SHELF_ARC").sort((one, two) => one.id.localeCompare(two.id))) {
        const from = (nativeFieldSourceReservations.get(path.from) ?? []).filter((index) => landMask[index]);
        const to = (nativeFieldSourceReservations.get(path.to) ?? []).filter((index) => landMask[index]);
        const reservation = new Set([
          ...(nativeFieldPathReservations.get(path.id) ?? []),
          ...from,
          ...to,
        ]);
        let route = connectFieldSets(from, to, (index) => reservation.has(index) && nativeConstraints?.topology[index] !== 0, width, height, wraps);
        if (route.length < 2) {
          const rootId = rootByRegion.get(path.from);
          const foreignRegions = new Set(fieldPlan.sources
            .filter((source) => rootByRegion.get(source.id.replace(/^field-/, "")) !== rootId)
            .flatMap((source) => nativeFieldSourceReservations.get(source.id.replace(/^field-/, "")) ?? []));
          route = connectFieldSetsMinimizingPenalty(
            from,
            to,
            (index) => nativeConstraints?.topology[index] !== 0 && !foreignRegions.has(index),
            (index) => reservation.has(index) ? 0 : 1,
            width,
            height,
            wraps,
          );
        }
        if (route.length < 2) continue;
        const additions = route.filter((index) => !landMask[index]);
        const donors = landMask.flatMap((land, index) => land
          && !mandatoryLand.has(index)
          && !requiredShelfFragmentSeeds.has(index)
          && nativeConstraints?.topology[index] !== 1
          ? [index] : [])
          .sort((one, two) => {
            const landNeighbors = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
              .filter(([x, y]) => landMask[y * width + x]).length;
            return landNeighbors(one) - landNeighbors(two)
              || (nativeFieldLandPriority[one] ?? 0) - (nativeFieldLandPriority[two] ?? 0)
              || fieldValues[one] - fieldValues[two]
              || one - two;
          });
        if (donors.length < additions.length) continue;
        for (const index of additions) landMask[index] = true;
        for (const index of donors.slice(0, additions.length)) landMask[index] = false;
        nativeFieldPathReservations.set(path.id, route);
        for (const index of route) { mandatoryLand.add(index); retainedShelfConnections.add(index); }
      }
      for (const index of retainedShelfConnections) requiredShelfFragmentSeeds.add(index);
    }
    const clusters = anchorSources.map((anchor) => {
      const anchorId = anchor.id.replace(/^field-/, "");
      const regionIds = new Set([anchorId, ...fieldPlan.sources.filter((source) => source.parentId === anchorId).map((source) => source.id.replace(/^field-/, ""))]);
      return [...new Set([
        ...[...regionIds].flatMap((id) => nativeFieldSourceReservations.get(id) ?? []),
        ...fieldPlan.paths.filter((path) => regionIds.has(path.from) && regionIds.has(path.to)).flatMap((path) => nativeFieldPathReservations.get(path.id) ?? []),
      ])];
    });
    const anchors = anchorSources.map((anchor) => nativeFieldSourceReservations.get(anchor.id.replace(/^field-/, "")) ?? []);
    separateNativeShelfClusters(landMask, clusters, fieldValues, nativeFieldWaterPriority, nativeFieldLandPriority, nativeConstraints, width, height, wraps, anchors, requiredShelfFragmentSeeds);
    if (resolved.preset === "EARTHSEA") {
      separateNativeRealmVoronoi(landMask, anchors, fieldValues, nativeFieldWaterPriority, nativeFieldLandPriority, nativeConstraints, width, height, wraps);
      const allRealmTiles = new Set(clusters.flat());
      const minimumRealmCore = Math.max(8, Math.round(Math.sqrt(landMask.length) / 6));
      for (const anchor of anchors) {
        let retained = largestConnectedFieldSubset(anchor.filter((index) => landMask[index]), width, height, wraps);
        const allowed = new Set(anchor.filter((index) => nativeConstraints?.topology[index] !== 0));
        if (!retained.length && allowed.size) {
          const seed = [...allowed].sort((one, two) => fieldValues[two] - fieldValues[one] || one - two)[0];
          landMask[seed] = true;
          retained = [seed];
        }
        const frontier = [...retained];
        const reached = new Set(frontier);
        while (retained.length < minimumRealmCore && frontier.length) {
          const current = frontier.shift()!;
          const candidates = neighbors(current % width, Math.floor(current / width), width, height, wraps)
            .map(([x, y]) => y * width + x)
            .filter((index) => allowed.has(index) && !reached.has(index))
            .sort((one, two) => fieldValues[two] - fieldValues[one] || one - two);
          for (const index of candidates) {
            reached.add(index);
            frontier.push(index);
            if (!landMask[index]) {
              landMask[index] = true;
              retained.push(index);
              if (retained.length >= minimumRealmCore) break;
            }
          }
        }
      }
      const excessLand = landMask.filter(Boolean).length - targetLandCount;
      if (excessLand > 0) {
        const donors = landMask.flatMap((land, index) => land && !allRealmTiles.has(index) && nativeConstraints?.topology[index] !== 1 ? [index] : [])
          .sort((one, two) => fieldValues[one] - fieldValues[two] || one - two);
        for (const index of donors.slice(0, excessLand)) landMask[index] = false;
      }
    }
  }
  if (fieldPlan?.grammarFamily === "FIELD_LAND_SEA_MAZE") {
    const windingLand = new Set(fieldPlan.paths
      .filter((path) => path.kind === "WINDING_PASSAGE" && path.effect === "LAND_PATH")
      .flatMap((path) => nativeFieldPathReservations.get(path.id) ?? []));
    const chamberLand = new Set(fieldPlan.sources
      .filter((source) => source.role === "MAZE_CHAMBER")
      .flatMap((source) => nativeFieldSourceReservations.get(source.id.replace(/^field-/, "")) ?? []));
    const additions = [...windingLand]
      .filter((index) => !landMask[index] && nativeConstraints?.topology[index] !== 0)
      .sort((one, two) => (nativeFieldLandPriority[two] ?? 0) - (nativeFieldLandPriority[one] ?? 0) || one - two);
    const donors = landMask.flatMap((land, index) => land
      && !windingLand.has(index)
      && !chamberLand.has(index)
      && nativeConstraints?.topology[index] !== 1
      ? [index] : [])
      .sort((one, two) => (nativeFieldWaterPriority[two] ?? 0) - (nativeFieldWaterPriority[one] ?? 0)
        || fieldValues[one] - fieldValues[two] || one - two);
    const exchanged = Math.min(additions.length, donors.length);
    for (const index of additions.slice(0, exchanged)) landMask[index] = true;
    for (const index of donors.slice(0, exchanged)) landMask[index] = false;
    for (const source of fieldPlan.sources.filter((candidate) => candidate.role === "MAZE_CHAMBER")) {
      const id = source.id.replace(/^field-/, "");
      const priority = new Set(fieldPlan.paths
        .filter((path) => path.kind === "WINDING_PASSAGE" && (path.from === id || path.to === id))
        .flatMap((path) => nativeFieldPathReservations.get(path.id) ?? [])
        .flatMap((index) => [index, ...neighbors(index % width, Math.floor(index / width), width, height, wraps).map(([x, y]) => y * width + x)]));
      const selected = connectedFieldSubsetWithMaximumOverlap(
        (nativeFieldSourceReservations.get(id) ?? []).filter((index) => landMask[index]),
        priority,
        width,
        height,
        wraps,
      );
      if (selected.length) nativeFieldSourceReservations.set(id, selected);
    }
    const connectorAdditions = new Set<number>();
    const sourceMembers = new Map(fieldPlan.sources.map((source) => [source.id.replace(/^field-/, ""), nativeFieldSourceReservations.get(source.id.replace(/^field-/, "")) ?? []]));
    for (const path of fieldPlan.paths.filter((candidate) => candidate.kind === "WINDING_PASSAGE" && candidate.effect === "LAND_PATH")) {
      const from = (sourceMembers.get(path.from) ?? []).filter((index) => landMask[index]);
      const to = (sourceMembers.get(path.to) ?? []).filter((index) => landMask[index]);
      if (!from.length || !to.length) continue;
      const existingConnection = connectFieldSets(from, to, (index) => landMask[index], width, height, wraps);
      if (existingConnection.length) continue;
      const connector = connectFieldSets(from, to, (index) => nativeConstraints?.topology[index] !== 0, width, height, wraps);
      if (!connector.length) continue;
      // When the authored winding raster falls into a different land component
      // from one endpoint, the cross-component connector is the real retained
      // passage. Keeping a disconnected decorative raster beside it would make
      // the later largest-component binding select the wrong causal object.
      nativeFieldPathReservations.set(path.id, [...new Set(connector)].sort((one, two) => one - two));
      for (const index of connector) if (!landMask[index]) { landMask[index] = true; connectorAdditions.add(index); windingLand.add(index); }
    }
    if (connectorAdditions.size) {
      const connectorDonors = landMask.flatMap((land, index) => land
        && !windingLand.has(index)
        && !chamberLand.has(index)
        && nativeConstraints?.topology[index] !== 1
        ? [index] : [])
        .sort((one, two) => {
          const landNeighbors = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
            .filter(([x, y]) => landMask[y * width + x]).length;
          return landNeighbors(one) - landNeighbors(two)
            || (nativeFieldWaterPriority[two] ?? 0) - (nativeFieldWaterPriority[one] ?? 0)
            || fieldValues[one] - fieldValues[two] || one - two;
        });
      const donorCount = Math.min(connectorAdditions.size, connectorDonors.length);
      for (const index of connectorDonors.slice(0, donorCount)) landMask[index] = false;
      for (const index of [...connectorAdditions].sort((one, two) => fieldValues[one] - fieldValues[two] || one - two).slice(0, connectorAdditions.size - donorCount)) landMask[index] = false;
    }
  }
  if (fieldPlan && resolved.preset === "RIFT_REALMS") {
    const cellSources = fieldPlan.sources.filter((source) => source.role === "VIABLE_RIFT_CELL");
    const cells = cellSources.map((source) => nativeFieldSourceReservations.get(source.id.replace(/^field-/, "")) ?? []);
    const primaryPaths = fieldPlan.paths
      .filter((path) => path.kind === "PRIMARY_RIFT" && path.effect === "WATER_PATH")
      .map((path) => nativeFieldPathReservations.get(path.id) ?? []);
    const separated = separateNativeRiftCells(landMask, cells, primaryPaths, fieldValues, nativeFieldWaterPriority, nativeFieldLandPriority, nativeConstraints, width, height, wraps);
    for (const index of separated.deepCuts) nativeRiftSeamTiles.add(index);
    for (const [cell, source] of cellSources.entries()) {
      const id = source.id.replace(/^field-/, "");
      const protectedMembers = nativeConstraints?.semantics.some((semantic) => semantic.sourceSemanticId === `narrative:${id}`) ?? false;
      nativeFieldSourceReservations.set(id, (nativeFieldSourceReservations.get(id) ?? [])
        .filter((index) => landMask[index] && (protectedMembers || separated.owner[index] === cell)));
    }
  }
  if (fieldPlan?.grammarFamily === "FIELD_PATCHWORK_PROVINCES") {
    const transitionLand = new Set(fieldPlan.paths
      .filter((path) => path.kind === "COMPOSED_BOUNDARY" && path.effect === "TRANSITION")
      .flatMap((path) => nativeFieldPathReservations.get(path.id) ?? []));
    const nativeRegions = new Set(fieldPlan.sources.flatMap((source) => nativeFieldSourceReservations.get(source.id.replace(/^field-/, "")) ?? []));
    const additions = [...transitionLand].filter((index) => !landMask[index] && nativeConstraints?.topology[index] !== 0);
    const donors = landMask.flatMap((land, index) => land
      && !transitionLand.has(index)
      && !nativeRegions.has(index)
      && nativeConstraints?.topology[index] !== 1
      ? [index] : [])
      .sort((one, two) => fieldValues[one] - fieldValues[two] || one - two);
    const exchanged = Math.min(additions.length, donors.length);
    for (const index of additions.slice(0, exchanged)) landMask[index] = true;
    for (const index of donors.slice(0, exchanged)) landMask[index] = false;
  }

  let tiles: Civ5Tile[] = [];
  let reliefValues = new Array<number>(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const nx = x / width;
      const ny = y / Math.max(1, height - 1);
      const detail = fractalNoise(x + 211, y + 307, seed + 1301);
      const plateBoundary = 1 - voronoiBoundary(nx, ny, plateCenters, wraps);
      let relief = detail * 0.62 + Math.max(0, fieldValues[index] - reliefBaseline) * 0.16;
      relief += Math.pow(plateBoundary, 3) * character.excogitare.plateRelief;
      relief += Math.pow(1 - voronoiBoundary(nx, ny, centers, wraps), 2) * character.excogitare.polygonRelief;
      if (character.excogitare.contestedRidge > 0) {
        const contestedRidge = 1 - Math.abs(Math.sin((nx * 4.8 + detail * 0.56 + Math.sin(ny * 8.2) * 0.18) * Math.PI));
        relief += Math.pow(plateBoundary, 2.4) * character.excogitare.plateRelief + Math.pow(contestedRidge, 3.2) * character.excogitare.contestedRidge;
      }
      if (resolved.modifier === "STRATEGIC_DEPTH") {
        const ridgeA = 1 - Math.abs(Math.sin((nx * 5.6 + detail * 0.75 + Math.sin(ny * 9) * 0.17) * Math.PI));
        const ridgeB = 1 - Math.abs(Math.cos((ny * 4.3 - detail * 0.62 + Math.sin(nx * 11) * 0.14) * Math.PI));
        relief += Math.pow(Math.max(ridgeA, ridgeB * 0.8), 3) * 0.76;
      }
      if (resolved.modifier === "DOOMSDAY") relief += valueNoise(x + 13, y + 29, 6, seed + 817) * 0.3;
      reliefValues[index] = relief + nativeLandformRelief[index] + narrativeAdapter.relief[index] * narrativeInfluenceStrength("EXCOGITARE").relief;
    }
  }
  if (character.excogitare.reliefRefinementPasses > 0) {
    reliefValues = diffuseRefine(reliefValues, width, height, seed + 6007, wraps, character.excogitare.reliefRefinementPasses, 0.12, 0.045);
  }
  if (fieldPlan) {
    const minimumRelief = Math.min(...reliefValues);
    const maximumRelief = Math.max(...reliefValues);
    const raise = (members: readonly number[], strength: number) => { for (const index of members) if (landMask[index]) reliefValues[index] = Math.max(reliefValues[index], maximumRelief + 0.12 * strength); };
    const lower = (members: readonly number[], strength: number) => { for (const index of members) if (landMask[index]) reliefValues[index] = Math.min(reliefValues[index], minimumRelief - 0.12 * strength); };
    for (const source of fieldPlan.sources) {
      const members = nativeFieldSourceReservations.get(source.id.replace(/^field-/, "")) ?? [];
      if (source.effect === "RIDGE" || source.effect === "VOLCANIC") raise(members, source.strength);
      else if (source.effect === "LOWLAND") lower(members, source.strength);
    }
    for (const path of fieldPlan.paths) {
      const members = nativeFieldPathReservations.get(path.id) ?? [];
      if (path.effect === "RIDGE_PATH") raise(members, path.strength);
      else if (path.effect === "RIVER_PATH") lower(members, path.strength);
    }
    // Parent shelf and island-continent fields are settlement countries, not
    // names attached to incidental mountain tiles. Keep their native source
    // fields below the mountain threshold before subordinate fragments are
    // considered.
    for (const source of fieldPlan.sources) {
      if (source.role !== "DROWNED_SHELF" && source.role !== "ISLAND_CONTINENT" && source.role !== "VIABLE_RIFT_CELL" && source.role !== "MAZE_CHAMBER") continue;
      const members = nativeFieldSourceReservations.get(source.id.replace(/^field-/, "")) ?? [];
      if (source.role === "VIABLE_RIFT_CELL") {
        // Preserve the pre-existing local relief ordering. Clamping every cell
        // member to one shared minimum made the exact hill quantile select the
        // entire cell as hills, leaving nominally viable worlds with no flat
        // substrate. A common downward bias keeps the cell inhabitable without
        // erasing its valleys, shoulders, and local summits.
        const bias = 0.48 + source.strength * 0.16;
        for (const index of members) if (landMask[index]) reliefValues[index] -= bias;
      } else {
        lower(members, Math.max(4, source.strength * 4));
      }
    }
  }
  const landRelief = reliefValues.filter((_, index) => landMask[index]);
  const effectiveMountainPercent = resolved.modifier === "STRATEGIC_DEPTH"
    ? Math.max(22, resolved.mountainPercent)
    : resolved.modifier === "DOOMSDAY" ? Math.max(18, resolved.mountainPercent) : Math.max(character.mountainFloor, clamp(resolved.mountainPercent, 0, 38));
  const hillPercent = resolved.worldAge === "YOUNG" ? 27 : resolved.worldAge === "OLD" ? 12 : 19;
  // Generate a small surplus because the accessibility pass intentionally
  // demotes mountains wherever a complete range would seal off land.
  const mountainSelectionPercent = effectiveMountainPercent <= 0 ? 0 : clamp(
    effectiveMountainPercent + (resolved.modifier === "STRATEGIC_DEPTH" ? 4 : 2.2),
    0,
    42,
  );
  const mountainThreshold = mountainSelectionPercent <= 0 ? Number.POSITIVE_INFINITY : quantile(landRelief, 1 - mountainSelectionPercent / 100);
  const hillThreshold = quantile(landRelief, 1 - clamp(mountainSelectionPercent + hillPercent, 0, 72) / 100);
  const rainShift = resolved.rainfall === "WET" ? -0.1 : resolved.rainfall === "ARID" ? 0.12 : 0;
  const tempShift = resolved.climate === "HOT" ? 0.16 : resolved.climate === "COOL" ? -0.16 : 0;
  let elevations: number[] = landMask.map((land, index) => land ? (reliefValues[index] >= mountainThreshold ? 2 : reliefValues[index] >= hillThreshold ? 1 : 0) : 0);
  applyConstrainedRelief(reliefValues, elevations, landMask, nativeConstraints);
  carveAccessiblePasses(landMask, elevations, width, height, wraps);
  restoreAccessibleMountainTarget(landMask, elevations, reliefValues, effectiveMountainPercent, width, height, wraps);
  const dominantTerrains = Array.isArray(resolved.dominantTerrains) ? resolved.dominantTerrains : [];
  let temperatures = new Array<number>(width * height);
  let moistures = new Array<number>(width * height);
  onProgress?.("Resolving climate and rain shadows");

  for (let y = 0; y < height; y += 1) {
    let airborneMoisture = clamp(0.6 - rainShift + (valueNoise(0, y + 43, 8, seed + 1741) - 0.5) * 0.18);
    let upwindRelief = reliefValues[y * width];
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const latitude = scaledPoleProximity(x, y, width, height, resolved.projectionType, scale, seed + 31);
      const regionalTemperature = (valueNoise(x + 311, y + 907, 11, seed + 2711) - 0.5)
        * character.excogitare.regionalTemperature;
      const localTemperature = (fractalNoise(x + 389, y + 127, seed + 2203) - 0.5)
        * character.excogitare.localTemperature;
      const altitudeCooling = Math.max(0, reliefValues[index] - 0.48) * character.excogitare.altitudeCooling;
      const latitudeTemperature = 0.1 + Math.cos(latitude * Math.PI / 2) * 0.82;
      temperatures[index] = clamp(latitudeTemperature + tempShift + regionalTemperature + localTemperature - altitudeCooling + narrativeAdapter.temperature[index] * narrativeInfluenceStrength("EXCOGITARE").climate);

      const backgroundMoisture = clamp(fractalNoise(x + 101, y + 53, seed + 701) - rainShift + character.excogitare.moistureBias);
      if (character.excogitare.moistureTransport) {
        if (!landMask[index]) airborneMoisture += (0.84 - airborneMoisture) * 0.34;
        else airborneMoisture += (backgroundMoisture - airborneMoisture) * 0.12;
        const rise = Math.max(0, reliefValues[index] - upwindRelief);
        const mountainLift = elevations[index] === 2 ? 0.06 : elevations[index] === 1 ? 0.015 : 0;
        const precipitation = rise * 0.72 + mountainLift;
        moistures[index] = clamp(airborneMoisture + precipitation * 0.7);
        airborneMoisture = clamp(airborneMoisture - precipitation * 0.78);
        upwindRelief = reliefValues[index];
      } else {
        moistures[index] = backgroundMoisture;
      }
      if (resolved.modifier === "DOOMSDAY") moistures[index] = clamp(moistures[index] - 0.14);
      moistures[index] = clamp(moistures[index] + narrativeAdapter.moisture[index] * narrativeInfluenceStrength("EXCOGITARE").climate);
    }
  }

  if (fieldPlan) {
    for (const source of fieldPlan.sources) {
      const members = nativeFieldSourceReservations.get(source.id.replace(/^field-/, "")) ?? [];
      for (const index of members) {
        if (!landMask[index]) continue;
        if (source.effect === "WET" || source.effect === "VALUE") {
          moistures[index] = Math.max(moistures[index], source.effect === "WET" ? 0.76 : 0.64);
          temperatures[index] = clamp(temperatures[index], 0.48, 0.72);
        } else if (source.effect === "DRY" || source.effect === "BARREN") {
          moistures[index] = Math.min(moistures[index], source.effect === "BARREN" ? 0.18 : 0.28);
          if (source.effect === "BARREN") temperatures[index] = Math.max(temperatures[index], 0.62);
        } else if (source.effect === "HOT") {
          temperatures[index] = Math.max(temperatures[index], 0.76);
          moistures[index] = Math.min(moistures[index], 0.3);
        } else if (source.effect === "COLD") {
          temperatures[index] = Math.min(temperatures[index], 0.22);
        }
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const land = landMask[index];
      const adjacentLand = neighbors(x, y, width, height, wraps).some(([nx, ny]) => landMask[ny * width + nx]);
      const latitude = scaledPoleProximity(x, y, width, height, resolved.projectionType, scale, seed + 31);
      const climateValue = temperatures[index];
      const moisture = moistures[index];
      const biomeVariation = valueNoise(x + 733, y + 419, 6.5, seed + 3511) - 0.5;
      let terrain = land ? 2 : adjacentLand ? 1 : 0;
      if (land) terrain = chooseTerrain(climateValue, moisture, biomeVariation, dominantTerrains, character.id === "BRUTAL");

      const elevation = elevations[index];
      let feature = 255;
      if (!land && latitude > 0.9 && random() > 0.25) feature = 3;
      else if (land && resolved.modifier === "DOOMSDAY" && random() > 0.972) feature = 5;
      else if (land && elevation === 0 && terrain === 4 && moisture < 0.25 && random() > 0.95) feature = 4;
      else if (land && elevation < 2 && climateValue > 0.72 && moisture > 0.66 && terrain !== 4 && terrain !== 5 && terrain !== 6) feature = 1;
      else if (land && elevation === 0 && terrain === 2 && moisture > 0.83) feature = 2;
      else if (land && elevation < 2 && terrain !== 4 && terrain !== 6 && moisture > 0.61) feature = 0;

      const resource = 255;

      tiles.push({
        terrain,
        resource,
        feature,
        river: 0,
        elevation,
        continent: land ? 1 + Math.floor(random() * 4) : 0,
        wonder: 255,
        resourceAmount: 0,
      });
    }
  }

  if (fieldPlan?.grammarFamily === "FIELD_PATCHWORK_PROVINCES") {
    const provinceSources = fieldPlan.sources.filter((source) => source.role === "PATCHWORK_PROVINCE");
    const sourceById = new Map(provinceSources.map((source) => [source.id.replace(/^field-/, ""), source]));
    const sourceIndex = new Map(provinceSources.map((source, index) => [source.id.replace(/^field-/, ""), index]));
    const originalReservations = new Map(provinceSources.map((source) => {
      const id = source.id.replace(/^field-/, "");
      return [id, [...(nativeFieldSourceReservations.get(id) ?? [])]] as const;
    }));
    const originalPathReservations = new Map(fieldPlan.paths
      .filter((path) => path.kind === "COMPOSED_BOUNDARY" && path.effect === "TRANSITION")
      .map((path) => [path.id, [...(nativeFieldPathReservations.get(path.id) ?? [])]] as const));
    const distanceToSource = (index: number, source: NarrativeFieldSource) => {
      let dx = Math.abs((index % width + 0.5) / width - source.x);
      if (wraps) dx = Math.min(dx, 1 - dx);
      return Math.hypot(dx, (Math.floor(index / width) + 0.5) / height - source.y);
    };
    const ownership = new Int16Array(tiles.length).fill(-1);
    for (let index = 0; index < tiles.length; index += 1) {
      if (!landMask[index]) continue;
      ownership[index] = provinceSources.reduce((best, source, candidate) => {
        const distance = distanceToSource(index, source);
        const bestDistance = best < 0 ? Number.POSITIVE_INFINITY : distanceToSource(index, provinceSources[best]);
        return distance < bestDistance || distance === bestDistance && candidate < best ? candidate : best;
      }, -1);
    }
    for (const path of fieldPlan.paths.filter((candidate) => candidate.kind === "COMPOSED_BOUNDARY" && candidate.effect === "TRANSITION")) {
      const from = sourceById.get(path.from);
      const to = sourceById.get(path.to);
      const fromIndex = sourceIndex.get(path.from);
      const toIndex = sourceIndex.get(path.to);
      if (!from || !to || fromIndex === undefined || toIndex === undefined) continue;
      for (const index of nativeFieldPathReservations.get(path.id) ?? []) if (landMask[index]) {
        ownership[index] = distanceToSource(index, from) <= distanceToSource(index, to) ? fromIndex : toIndex;
      }
    }
    const paintClimate = (index: number, effect: NarrativeFieldSource["effect"]) => {
      if (!landMask[index]) return;
      const tile = tiles[index];
      if (effect === "WET") {
        temperatures[index] = 0.65; moistures[index] = 0.86;
        elevations[index] = Math.min(1, tile.elevation);
        tiles[index] = { ...tile, terrain: 2, elevation: elevations[index], feature: 1 };
      } else if (effect === "DRY") {
        temperatures[index] = 0.7; moistures[index] = 0.24;
        tiles[index] = { ...tile, terrain: 4, feature: 255 };
      } else if (effect === "HOT") {
        temperatures[index] = 0.92; moistures[index] = 0.18;
        tiles[index] = { ...tile, terrain: 4, feature: 255 };
      } else if (effect === "BARREN") {
        temperatures[index] = 0.96; moistures[index] = 0.04;
        tiles[index] = { ...tile, terrain: 4, feature: 255, resource: 255, wonder: 255, resourceAmount: 0 };
      } else if (effect === "COLD") {
        temperatures[index] = 0.18; moistures[index] = 0.42;
        tiles[index] = { ...tile, terrain: 5, feature: 255 };
      } else if (effect === "RIDGE") {
        temperatures[index] = 0.5; moistures[index] = 0.45;
        elevations[index] = Math.max(1, tile.elevation);
        tiles[index] = { ...tile, terrain: 3, elevation: elevations[index], feature: 255 };
      } else if (effect === "LOWLAND") {
        temperatures[index] = 0.55; moistures[index] = 0.5;
        elevations[index] = Math.min(1, tile.elevation);
        tiles[index] = { ...tile, terrain: 3, elevation: elevations[index], feature: 255 };
      } else {
        temperatures[index] = 0.55; moistures[index] = 0.48;
        tiles[index] = { ...tile, terrain: 3, feature: 255 };
      }
    };
    const provinceMembers = new Map<string, Set<number>>();
    const provinceRouteClaims = new Map(provinceSources.map((source) => [source.id.replace(/^field-/, ""), new Set<number>()]));
    for (const [index, source] of provinceSources.entries()) {
      const id = source.id.replace(/^field-/, "");
      const incidentPaths = fieldPlan.paths
        .filter((path) => path.kind === "COMPOSED_BOUNDARY" && (path.from === id || path.to === id))
        .flatMap((path) => nativeFieldPathReservations.get(path.id) ?? []);
      const candidates = [...new Set([...(originalReservations.get(id) ?? []), ...incidentPaths])]
        .filter((tile) => landMask[tile] && ownership[tile] === index);
      const members = connectedFieldSubsetWithMaximumOverlap(candidates, new Set(incidentPaths), width, height, wraps);
      provinceMembers.set(id, new Set(members));
    }
    const routeWithin = (allowedTiles: readonly number[], fromTiles: ReadonlySet<number>, toTiles: ReadonlySet<number>) => {
      const allowed = new Set(allowedTiles.filter((index) => landMask[index]));
      const origins = [...allowed].filter((index) => fromTiles.has(index)
        || neighbors(index % width, Math.floor(index / width), width, height, wraps).some(([x, y]) => fromTiles.has(y * width + x)));
      const targets = new Set([...allowed].filter((index) => toTiles.has(index)
        || neighbors(index % width, Math.floor(index / width), width, height, wraps).some(([x, y]) => toTiles.has(y * width + x))));
      if (!origins.length || !targets.size) return [];
      const parent = new Int32Array(tiles.length).fill(-2);
      const queue = [...origins];
      for (const index of origins) parent[index] = -1;
      let target = -1;
      for (let cursor = 0; cursor < queue.length && target < 0; cursor += 1) {
        const current = queue[cursor];
        if (targets.has(current)) { target = current; break; }
        for (const [x, y] of neighbors(current % width, Math.floor(current / width), width, height, wraps)) {
          const next = y * width + x;
          if (!allowed.has(next) || parent[next] !== -2) continue;
          parent[next] = current;
          queue.push(next);
        }
      }
      if (target < 0) return [];
      const route: number[] = [];
      for (let current = target; current >= 0; current = parent[current]) route.push(current);
      return route.reverse();
    };
    for (const path of fieldPlan.paths.filter((candidate) => candidate.kind === "COMPOSED_BOUNDARY" && candidate.effect === "TRANSITION")) {
      const from = provinceMembers.get(path.from);
      const to = provinceMembers.get(path.to);
      if (!from?.size || !to?.size) continue;
      const route = routeWithin(originalPathReservations.get(path.id) ?? [], from, to);
      if (route.length < 2) continue;
      const split = Math.max(1, Math.floor(route.length / 2));
      for (let position = 0; position < route.length; position += 1) {
        const tile = route[position];
        for (const members of provinceMembers.values()) members.delete(tile);
        const endpointId = position < split ? path.from : path.to;
        (position < split ? from : to).add(tile);
        provinceRouteClaims.get(endpointId)?.add(tile);
      }
    }
    const regionsTouch = (from: ReadonlySet<number>, to: ReadonlySet<number>) => [...from].some((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
      .some(([x, y]) => to.has(y * width + x)));
    const composedBoundaries = fieldPlan.paths.filter((path) => path.kind === "COMPOSED_BOUNDARY" && path.effect === "TRANSITION");
    const requiredSharedPairs = composedBoundaries.length;
    let sharedPairs = composedBoundaries.filter((path) =>
      regionsTouch(provinceMembers.get(path.from) ?? new Set<number>(), provinceMembers.get(path.to) ?? new Set<number>())).length;
    for (const path of composedBoundaries) {
      if (sharedPairs >= requiredSharedPairs) break;
      const from = provinceMembers.get(path.from);
      const to = provinceMembers.get(path.to);
      if (!from?.size || !to?.size || regionsTouch(from, to)) continue;
      const otherClaims = new Set([...provinceMembers.entries()].filter(([id]) => id !== path.from && id !== path.to).flatMap(([, members]) => [...members]));
      const available = landMask.flatMap((land, index) => land && !otherClaims.has(index) ? [index] : []);
      const route = routeWithin(available, from, to);
      if (route.length < 2) continue;
      const split = Math.max(1, Math.floor(route.length / 2));
      for (let position = 0; position < route.length; position += 1) {
        const endpointId = position < split ? path.from : path.to;
        (position < split ? from : to).add(route[position]);
        provinceRouteClaims.get(endpointId)?.add(route[position]);
      }
      if (regionsTouch(from, to)) sharedPairs += 1;
    }
    if (sharedPairs < requiredSharedPairs) for (const path of composedBoundaries) {
      const from = provinceMembers.get(path.from);
      const to = provinceMembers.get(path.to);
      if (!from?.size || !to?.size || regionsTouch(from, to)) continue;
      const route = routeWithin(landMask.flatMap((land, index) => land ? [index] : []), from, to);
      if (route.length < 2) continue;
      const snapshot = new Map([...provinceMembers].map(([id, members]) => [id, new Set(members)]));
      const split = Math.max(1, Math.floor(route.length / 2));
      for (let position = 0; position < route.length; position += 1) {
        const tile = route[position];
        for (const members of provinceMembers.values()) members.delete(tile);
        (position < split ? from : to).add(tile);
      }
      let viable = true;
      for (const [id, members] of provinceMembers) {
        const connected = largestConnectedFieldSubset([...members], width, height, wraps);
        if (connected.length < 4) { viable = false; break; }
        provinceMembers.set(id, new Set(connected));
      }
      const retainedPairs = viable ? composedBoundaries.filter((candidate) =>
        regionsTouch(provinceMembers.get(candidate.from) ?? new Set<number>(), provinceMembers.get(candidate.to) ?? new Set<number>())).length : 0;
      if (viable && retainedPairs > sharedPairs) {
        for (let position = 0; position < route.length; position += 1) provinceRouteClaims.get(position < split ? path.from : path.to)?.add(route[position]);
        sharedPairs = retainedPairs;
        continue;
      }
      provinceMembers.clear();
      for (const [id, members] of snapshot) provinceMembers.set(id, members);
    }
    for (const source of provinceSources) {
      const id = source.id.replace(/^field-/, "");
      const incidentPaths = new Set(fieldPlan.paths
        .filter((path) => path.kind === "COMPOSED_BOUNDARY" && (path.from === id || path.to === id))
        .flatMap((path) => originalPathReservations.get(path.id) ?? []));
      const members = connectedFieldSubsetWithMaximumOverlap(
        [...(provinceMembers.get(id) ?? [])],
        new Set([...incidentPaths, ...(provinceRouteClaims.get(id) ?? [])]),
        width,
        height,
        wraps,
      );
      nativeFieldSourceReservations.set(id, members);
      provinceMembers.set(id, new Set(members));
      for (const tile of members) paintClimate(tile, source.effect);
    }
    for (const path of composedBoundaries) {
      const from = provinceMembers.get(path.from);
      const to = provinceMembers.get(path.to);
      if (!from?.size || !to?.size || regionsTouch(from, to)) continue;
      const otherClaims = new Set([...provinceMembers.entries()].filter(([id]) => id !== path.from && id !== path.to).flatMap(([, members]) => [...members]));
      const route = routeWithin(landMask.flatMap((land, index) => land && !otherClaims.has(index) ? [index] : []), from, to);
      if (route.length < 2) continue;
      const split = Math.max(1, Math.floor(route.length / 2));
      for (let position = 0; position < route.length; position += 1) (position < split ? from : to).add(route[position]);
    }
    let postCropPairs = composedBoundaries.filter((path) => regionsTouch(
      provinceMembers.get(path.from) ?? new Set<number>(),
      provinceMembers.get(path.to) ?? new Set<number>(),
    )).length;
    for (let pass = 0; pass < composedBoundaries.length && postCropPairs < requiredSharedPairs; pass += 1) {
      let improved = false;
      for (const path of composedBoundaries) {
        const from = provinceMembers.get(path.from);
        const to = provinceMembers.get(path.to);
        if (!from?.size || !to?.size || regionsTouch(from, to)) continue;
        const route = routeWithin(landMask.flatMap((land, index) => land ? [index] : []), from, to);
        if (route.length < 2) continue;
        const snapshot = new Map([...provinceMembers].map(([id, members]) => [id, new Set(members)]));
        const split = Math.max(1, Math.floor(route.length / 2));
        for (let position = 0; position < route.length; position += 1) {
          const tile = route[position];
          for (const members of provinceMembers.values()) members.delete(tile);
          (position < split ? from : to).add(tile);
        }
        let viable = true;
        for (const [id, members] of provinceMembers) {
          const connected = largestConnectedFieldSubset([...members], width, height, wraps);
          if (connected.length < 4) { viable = false; break; }
          provinceMembers.set(id, new Set(connected));
        }
        const retainedPairs = viable ? composedBoundaries.filter((candidate) => regionsTouch(
          provinceMembers.get(candidate.from) ?? new Set<number>(),
          provinceMembers.get(candidate.to) ?? new Set<number>(),
        )).length : 0;
        if (viable && retainedPairs > postCropPairs) {
          postCropPairs = retainedPairs;
          improved = true;
          if (postCropPairs >= requiredSharedPairs) break;
          continue;
        }
        provinceMembers.clear();
        for (const [id, members] of snapshot) provinceMembers.set(id, members);
      }
      if (!improved) break;
    }
    if (provinceSources.length >= 4) {
      const largestLand = connectedFieldSubsets(landMask, width, height, wraps)[0] ?? [];
      const land = new Set(largestLand);
      const farthest = (origin: number) => {
        const distance = new Int32Array(landMask.length).fill(-1);
        const parent = new Int32Array(landMask.length).fill(-1);
        const queue = [origin];
        distance[origin] = 0;
        for (let cursor = 0; cursor < queue.length; cursor += 1) for (const [x, y] of neighbors(queue[cursor] % width, Math.floor(queue[cursor] / width), width, height, wraps)) {
          const next = y * width + x;
          if (!land.has(next) || distance[next] >= 0) continue;
          distance[next] = distance[queue[cursor]] + 1;
          parent[next] = queue[cursor];
          queue.push(next);
        }
        const endpoint = queue.reduce((winner, candidate) => distance[candidate] > distance[winner] || distance[candidate] === distance[winner] && candidate < winner ? candidate : winner, origin);
        return { endpoint, parent };
      };
      if (largestLand.length) {
        const first = farthest(largestLand[0]).endpoint;
        const second = farthest(first);
        const diameter: number[] = [];
        for (let current = second.endpoint; current >= 0; current = second.parent[current]) {
          diameter.push(current);
          if (current === first) break;
        }
        const minimumSpineTiles = provinceSources.length * 2;
        if (diameter.length >= minimumSpineTiles) {
          const orientationScore = (spine: readonly number[]) => provinceSources.reduce((score, source, provinceIndex) => {
            const begin = Math.floor(provinceIndex * spine.length / provinceSources.length);
            const end = Math.max(begin + 1, Math.floor((provinceIndex + 1) * spine.length / provinceSources.length));
            const middle = spine[Math.floor((begin + end - 1) / 2)];
            return score + distanceToSource(middle, source);
          }, 0);
          const forward = [...diameter].reverse();
          const spine = orientationScore(forward) <= orientationScore(diameter) ? forward : diameter;
          const ownerByTile = new Int16Array(landMask.length).fill(-1);
          const ownerDistance = new Int16Array(landMask.length).fill(-1);
          const queue: number[] = [];
          const spineSlices: number[][] = [];
          for (let provinceIndex = 0; provinceIndex < provinceSources.length; provinceIndex += 1) {
            const begin = Math.floor(provinceIndex * spine.length / provinceSources.length);
            const end = Math.max(begin + 1, Math.floor((provinceIndex + 1) * spine.length / provinceSources.length));
            const slice = spine.slice(begin, end);
            spineSlices.push(slice);
            for (const tile of slice) if (ownerByTile[tile] < 0) {
              ownerByTile[tile] = provinceIndex;
              ownerDistance[tile] = 0;
              queue.push(tile);
            }
          }
          // Keep the canonical provinces broad enough to read as fields, but
          // do not flood them through the entire cyclic land graph. Unlimited
          // Voronoi growth can make the same two provinces meet on opposite
          // sides of a lake, turning one authored boundary into two unrelated
          // seams. A bounded ribbon around the land diameter preserves broad,
          // connected provinces and a single causal contact for each authored
          // relationship. If even that ribbon folds onto itself, the exact
          // connected diameter slices remain a deterministic lawful fallback.
          const expansionRadius = Math.max(1, Math.min(3, Math.floor(Math.min(width, height) / 12)));
          for (let cursor = 0; cursor < queue.length; cursor += 1) for (const [x, y] of neighbors(queue[cursor] % width, Math.floor(queue[cursor] / width), width, height, wraps)) {
            const next = y * width + x;
            if (!land.has(next) || ownerByTile[next] >= 0 || ownerDistance[queue[cursor]] >= expansionRadius) continue;
            ownerByTile[next] = ownerByTile[queue[cursor]];
            ownerDistance[next] = ownerDistance[queue[cursor]] + 1;
            queue.push(next);
          }
          const installMembers = (membersByProvince: readonly (readonly number[])[]) => {
            for (let provinceIndex = 0; provinceIndex < provinceSources.length; provinceIndex += 1) {
              const id = provinceSources[provinceIndex].id.replace(/^field-/, "");
              provinceMembers.set(id, new Set(membersByProvince[provinceIndex] ?? []));
            }
          };
          const exactSharedEdge = (from: ReadonlySet<number>, to: ReadonlySet<number>) => {
            const shared = new Set<number>();
            for (const index of from) for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
              const next = y * width + x;
              if (!to.has(next)) continue;
              shared.add(index);
              shared.add(next);
            }
            return [...shared];
          };
          const coherentAuthoredBoundaries = () => {
            const sharedEdges = composedBoundaries.map((path) => exactSharedEdge(
              provinceMembers.get(path.from) ?? new Set<number>(),
              provinceMembers.get(path.to) ?? new Set<number>(),
            ));
            return provinceSources.every((source) => (provinceMembers.get(source.id.replace(/^field-/, ""))?.size ?? 0) >= 4)
              && sharedEdges.every((shared) => shared.length > 0
                && largestConnectedFieldSubset(shared, width, height, wraps).length === shared.length)
              && sharedEdges.every((shared, index) => sharedEdges.slice(index + 1).every((other) => {
                const otherMembers = new Set(other);
                const overlap = shared.filter((tile) => otherMembers.has(tile)).length;
                return overlap / Math.max(1, Math.min(shared.length, other.length)) <= 0.2;
              }));
          };
          installMembers(provinceSources.map((_source, provinceIndex) => largestLand.filter((tile) => ownerByTile[tile] === provinceIndex)));
          if (!coherentAuthoredBoundaries()) {
            // A shortest land-diameter is chordless, so consecutive slices have
            // one causal contact and cannot accidentally touch a remote sibling.
            // Duel maps do not always have four diameter tiles per province;
            // grow undersized slices outward without crossing another slice's
            // contact. This preserves the authored chain on relaxed retry seeds
            // instead of retaining boundary labels over cropped, remote fields.
            const canonical = spineSlices.map((slice) => new Set(slice));
            const owner = new Int16Array(landMask.length).fill(-1);
            for (const [provinceIndex, members] of canonical.entries()) for (const tile of members) owner[tile] = provinceIndex;
            let progress = true;
            while (progress && canonical.some((members) => members.size < 4)) {
              progress = false;
              for (let provinceIndex = 0; provinceIndex < canonical.length; provinceIndex += 1) {
                const members = canonical[provinceIndex];
                if (members.size >= 4) continue;
                const candidates = [...new Set([...members].flatMap((tile) => neighbors(tile % width, Math.floor(tile / width), width, height, wraps)
                  .map(([x, y]) => y * width + x)))]
                  .filter((tile) => land.has(tile) && owner[tile] < 0)
                  .map((tile) => {
                    const foreignOwners = new Set(neighbors(tile % width, Math.floor(tile / width), width, height, wraps)
                      .map(([x, y]) => owner[y * width + x])
                      .filter((candidateOwner) => candidateOwner >= 0 && candidateOwner !== provinceIndex));
                    const safe = foreignOwners.size === 0;
                    const oneAdjacentSibling = foreignOwners.size === 1
                      && [...foreignOwners].every((candidateOwner) => Math.abs(candidateOwner - provinceIndex) === 1);
                    return { tile, safe, oneAdjacentSibling };
                  })
                  .filter((candidate) => candidate.safe || candidate.oneAdjacentSibling)
                  .sort((one, two) => Number(two.safe) - Number(one.safe)
                    || distanceToSource(one.tile, provinceSources[provinceIndex]) - distanceToSource(two.tile, provinceSources[provinceIndex])
                    || one.tile - two.tile);
                const selected = candidates[0];
                if (!selected) continue;
                members.add(selected.tile);
                owner[selected.tile] = provinceIndex;
                progress = true;
              }
            }
            if (canonical.every((members) => members.size >= 4)) installMembers(canonical.map((members) => [...members]));
          }
          postCropPairs = composedBoundaries.filter((path) => regionsTouch(
            provinceMembers.get(path.from) ?? new Set<number>(),
            provinceMembers.get(path.to) ?? new Set<number>(),
          )).length;
        }
      }
    }
    for (const source of provinceSources) {
      const id = source.id.replace(/^field-/, "");
      const members = [...(provinceMembers.get(id) ?? [])].sort((one, two) => one - two);
      nativeFieldSourceReservations.set(id, members);
      for (const tile of members) paintClimate(tile, source.effect);
    }
    for (const path of fieldPlan.paths.filter((candidate) => candidate.kind === "COMPOSED_BOUNDARY" && candidate.effect === "TRANSITION")) {
      const from = provinceMembers.get(path.from) ?? new Set<number>();
      const to = provinceMembers.get(path.to) ?? new Set<number>();
      const shared = new Set<number>();
      for (const index of from) for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
        const next = y * width + x;
        if (!to.has(next)) continue;
        shared.add(index);
        shared.add(next);
      }
      nativeFieldPathReservations.set(path.id, largestConnectedFieldSubset([...shared], width, height, wraps));
    }
  }

  const primaryRiftTiles = new Set<number>();
  if (fieldPlan) {
    const primaryRifts = fieldPlan.paths.filter((path) => path.kind === "PRIMARY_RIFT" && path.effect === "WATER_PATH");
    if (resolved.preset === "RIFT_REALMS" && primaryRifts.length >= 2) {
      // Divide all native water among the authored primary rifts, leaving a
      // one-tile shallow navigation shelf where their catchments meet. The
      // resulting deep systems remain independently measurable even when the
      // scalar sea-level field would otherwise join every ocean tile into one
      // undifferentiated component.
      const pathWater = primaryRifts.map((path) => (nativeFieldPathReservations.get(path.id) ?? []).filter((index) => !landMask[index]));
      const ownership = new Int16Array(tiles.length).fill(-1);
      for (let index = 0; index < tiles.length; index += 1) {
        if (landMask[index]) continue;
        const x = index % width;
        const y = Math.floor(index / width);
        let bestOwner = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let owner = 0; owner < pathWater.length; owner += 1) {
          for (const sample of pathWater[owner]) {
            let dx = Math.abs(x - sample % width);
            if (wraps) dx = Math.min(dx, width - dx);
            const dy = y - Math.floor(sample / width);
            const distance = dx * dx + dy * dy;
            if (distance < bestDistance || distance === bestDistance && owner < bestOwner) { bestDistance = distance; bestOwner = owner; }
          }
        }
        ownership[index] = bestOwner;
      }
      const shallowBoundary = new Set<number>();
      for (let index = 0; index < tiles.length; index += 1) {
        if (ownership[index] < 0) continue;
        for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
          const next = y * width + x;
          if (ownership[next] >= 0 && ownership[next] !== ownership[index]) { shallowBoundary.add(index); shallowBoundary.add(next); }
        }
      }
      for (let index = 0; index < tiles.length; index += 1) {
        if (ownership[index] < 0) continue;
        tiles[index] = { ...tiles[index], terrain: shallowBoundary.has(index) ? 1 : 0, feature: shallowBoundary.has(index) ? tiles[index].feature : 255 };
      }
      for (const members of pathWater) for (const index of members) if (tiles[index].terrain === 0) primaryRiftTiles.add(index);
    } else {
      for (const path of primaryRifts) {
        for (const index of nativeFieldPathReservations.get(path.id) ?? []) {
          if (landMask[index]) continue;
          primaryRiftTiles.add(index);
          // The technology-gated divide is deep water, not a coast-colored
          // compatibility stroke. Keeping this classification native also lets
          // Review prove the divide from the exported tiles themselves.
          tiles[index] = { ...tiles[index], terrain: 0, feature: 255 };
        }
      }
    }
  }
  if (resolved.preset === "RIFT_REALMS") for (const index of nativeRiftSeamTiles) {
    if (landMask[index]) continue;
    tiles[index] = { ...tiles[index], terrain: 0, feature: 255 };
    primaryRiftTiles.add(index);
  }
  const nativeRiverGuidance = narrativeAdapter.rivers.map((value, index) => nativeConstraints?.hydrologyMask[index]
    ? Math.max(clamp(value * narrativeInfluenceStrength("EXCOGITARE").rivers), nativeConstraints.rivers[index] ? 1 : 0.58)
    : clamp(value * narrativeInfluenceStrength("EXCOGITARE").rivers * scaleProfile.drainageHierarchy));
  onProgress?.("Resolving native drainage and rivers");
  const riverNetwork = generateRiverNetwork(tiles, reliefValues, moistures, width, height, wraps, resolved.style, resolved.rainfall, random, undefined, resolved.riverDensity, nativeRiverGuidance);
  for (let index = 0; index < tiles.length; index += 1) tiles[index].river = riverNetwork[index];

  let initialContinents = connectedTileObjects("CONTINENT", landMask, width, height, wraps, "Continent");
  let initialBasins = connectedTileObjects("OCEAN_BASIN", landMask.map((land) => !land), width, height, wraps, "Ocean Basin");
  const nativeFieldObjects: GeographicObject[] = fieldPlan ? [
    ...fieldPlan.sources.flatMap((source): GeographicObject[] => {
      const regionId = source.id.replace(/^field-/, "");
      const matched = (nativeFieldSourceReservations.get(regionId) ?? []).filter((index) => nativeFieldEffectMatches(source.effect, index, tiles, temperatures, moistures, width, height, wraps));
      const requiresViableConnectedBinding = source.role === "MAZE_CHAMBER" || source.role === "VIABLE_RIFT_CELL";
      const requiresConnectedBinding = requiresViableConnectedBinding || source.role === "PATCHWORK_PROVINCE";
      const relationshipPriority = requiresViableConnectedBinding ? new Set(fieldPlan.paths
        .filter((path) => (path.from === regionId || path.to === regionId)
          && (source.role !== "MAZE_CHAMBER" || path.kind === "WINDING_PASSAGE"))
        .flatMap((path) => nativeFieldPathReservations.get(path.id) ?? [])
        .flatMap((index) => [index, ...neighbors(index % width, Math.floor(index / width), width, height, wraps).map(([x, y]) => y * width + x)])) : new Set<number>();
      const tileIndices = requiresViableConnectedBinding
        ? connectedFieldSubsetWithMaximumOverlap(matched, relationshipPriority, width, height, wraps)
        : requiresConnectedBinding ? largestConnectedFieldSubset(matched, width, height, wraps) : matched;
      if (!tileIndices.length) return [];
      const objectNeighbors = [...new Set(fieldPlan.paths.flatMap((path) => path.from === regionId ? [`narrative-${path.to}`] : path.to === regionId ? [`narrative-${path.from}`] : []))];
      return [{ id: `narrative-${regionId}`, semanticId: `narrative:${regionId}`, name: source.role.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()), kind: "NARRATIVE_REGION", tileIndices, ...(objectNeighbors.length ? { neighbors: objectNeighbors } : {}), attributes: { nativeNarrative: true, grammarFamily: fieldPlan.grammarFamily, fieldSource: source.id, role: source.role, effect: source.effect, parent: source.parentId ?? "", strength: source.strength, outputEffectMatched: true, ...(requiresConnectedBinding ? { plannedMatchedTiles: matched.length, discardedDisconnectedTiles: matched.length - tileIndices.length } : {}) } }];
    }),
    ...fieldPlan.paths.flatMap((path): GeographicObject[] => {
      const protectedMembers = nativeConstraints?.semantics.some((semantic) => semantic.sourceSemanticId === `narrative:${path.id}`) ?? false;
      const matched = (nativeFieldPathReservations.get(path.id) ?? []).filter((index) => nativeFieldEffectMatches(path.effect, index, tiles, temperatures, moistures, width, height, wraps)
        && (path.kind !== "PRIMARY_RIFT" || tiles[index].terrain === 0));
      const tileIndices = protectedMembers ? matched : largestConnectedFieldSubset(matched, width, height, wraps);
      if (!tileIndices.length) return [];
      return [{ id: `narrative-${path.id}`, semanticId: `narrative:${path.id}`, name: path.kind.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()), kind: "NARRATIVE_PATH", tileIndices, neighbors: [`narrative-${path.from}`, `narrative-${path.to}`], attributes: { nativeNarrative: true, grammarFamily: fieldPlan.grammarFamily, fieldSource: path.id, relationship: path.kind, role: path.kind, effect: path.effect, from: path.from, to: path.to, strength: path.strength, outputEffectMatched: true, ...(path.kind === "PRIMARY_RIFT" ? { deepWaterShare: tileIndices.filter((index) => primaryRiftTiles.has(index)).length / tileIndices.length } : {}) } }];
    }),
  ] : [];
  if (fieldPlan?.grammarFamily === "FIELD_CROOKED_CONTINENTS") {
    // Narrow maps can collapse two authored child ellipses onto the same final
    // land cells. Each crooked lobe still needs its own retained geographic
    // cause, so assign sibling claims by adjusted source distance and reserve
    // one unique seed before taking connected subsets.
    const lobeSources = new Map(fieldPlan.sources.filter((source) => source.role === "CROOKED_LOBE")
      .map((source) => [source.id.replace(/^field-/, ""), adjustedFieldSourceById.get(source.id.replace(/^field-/, "")) ?? source]));
    const lobes = nativeFieldObjects.filter((object) => object.attributes?.role === "CROOKED_LOBE");
    for (const parent of new Set(lobes.map((lobe) => String(lobe.attributes?.parent ?? "")))) {
      const siblings = lobes.filter((lobe) => String(lobe.attributes?.parent ?? "") === parent);
      const claims = new Map<number, GeographicObject[]>();
      for (const lobe of siblings) for (const index of lobe.tileIndices) {
        const entries = claims.get(index) ?? [];
        entries.push(lobe);
        claims.set(index, entries);
      }
      const sourceDistance = (object: GeographicObject, index: number) => {
        const source = lobeSources.get(object.id.replace(/^narrative-/, ""));
        if (!source) return Number.POSITIVE_INFINITY;
        const x = (index % width + 0.5) / width;
        const y = (Math.floor(index / width) + 0.5) / height;
        let dx = Math.abs(x - source.x);
        if (wraps) dx = Math.min(dx, 1 - dx);
        return Math.hypot(dx, y - source.y);
      };
      const owner = new Map<number, string>();
      for (const [index, entries] of claims) owner.set(index, [...entries]
        .sort((one, two) => sourceDistance(one, index) - sourceDistance(two, index) || one.id.localeCompare(two.id))[0].id);
      const reservedSeeds = new Set<number>();
      for (const lobe of [...siblings].sort((one, two) => one.id.localeCompare(two.id))) {
        const seed = [...lobe.tileIndices]
          .filter((index) => !reservedSeeds.has(index))
          .sort((one, two) => Number(owner.get(two) === lobe.id) - Number(owner.get(one) === lobe.id)
            || (claims.get(one)?.length ?? 0) - (claims.get(two)?.length ?? 0)
            || sourceDistance(lobe, one) - sourceDistance(lobe, two)
            || one - two)[0];
        if (seed === undefined) continue;
        reservedSeeds.add(seed);
        owner.set(seed, lobe.id);
      }
      for (const lobe of siblings) {
        const plannedMatchedTiles = lobe.tileIndices.length;
        lobe.tileIndices = largestConnectedFieldSubset(lobe.tileIndices.filter((index) => owner.get(index) === lobe.id), width, height, wraps);
        lobe.attributes = { ...lobe.attributes, plannedMatchedTiles, discardedOverlappingTiles: plannedMatchedTiles - lobe.tileIndices.length };
      }
    }
  }
  if (fieldPlan && (fieldPlan.grammarFamily === "FIELD_DROWNED_SHELVES" || fieldPlan.grammarFamily === "FIELD_ISLAND_CONTINENTS")) {
    // A relaxed field can leave one fringe hex claimed by two otherwise
    // separate parent countries. Assign every multiply-claimed root tile to
    // one deterministic native source before arcs and fragments are rebound;
    // retained root evidence must never count the same exported hex twice.
    const rootSources = new Map(fieldPlan.sources
      .filter((source) => source.role === "DROWNED_SHELF" || source.role === "ISLAND_CONTINENT")
      .map((source) => [source.id.replace(/^field-/, ""), adjustedFieldSourceById.get(source.id.replace(/^field-/, "")) ?? source]));
    const roots = nativeFieldObjects.filter((object) => object.attributes?.role === "DROWNED_SHELF" || object.attributes?.role === "ISLAND_CONTINENT");
    const rootClaims = new Map<number, GeographicObject[]>();
    for (const root of roots) for (const index of root.tileIndices) {
      const claims = rootClaims.get(index) ?? [];
      claims.push(root);
      rootClaims.set(index, claims);
    }
    const protectedRootIds = new Set(nativeConstraints?.semantics
      .filter((semantic) => roots.some((root) => root.semanticId === semantic.sourceSemanticId))
      .map((semantic) => semantic.sourceSemanticId.replace(/^narrative:/, "")) ?? []);
    const rootOwner = new Map<number, string>();
    for (const [index, claims] of rootClaims) {
      if (claims.length < 2) continue;
      const x = (index % width + 0.5) / width;
      const y = (Math.floor(index / width) + 0.5) / height;
      const distance = (object: GeographicObject) => {
        const source = rootSources.get(object.id.replace(/^narrative-/, ""));
        if (!source) return Number.POSITIVE_INFINITY;
        let dx = Math.abs(x - source.x);
        if (wraps) dx = Math.min(dx, 1 - dx);
        return Math.hypot(dx, y - source.y);
      };
      const selected = [...claims].sort((one, two) => Number(protectedRootIds.has(two.id.replace(/^narrative-/, "")))
        - Number(protectedRootIds.has(one.id.replace(/^narrative-/, "")))
        || distance(one) - distance(two)
        || one.id.localeCompare(two.id))[0];
      rootOwner.set(index, selected.id);
    }
    for (const root of roots) {
      const plannedMatchedTiles = root.tileIndices.length;
      root.tileIndices = root.tileIndices.filter((index) => !rootOwner.has(index) || rootOwner.get(index) === root.id);
      root.attributes = { ...root.attributes, plannedMatchedTiles, discardedOverlappingTiles: plannedMatchedTiles - root.tileIndices.length };
    }
    const fragmentSources = new Map(fieldPlan.sources.filter((source) => source.role === "SHELF_FRAGMENT")
      .map((source) => [source.id.replace(/^field-/, ""), adjustedFieldSourceById.get(source.id.replace(/^field-/, "")) ?? source]));
    const fragments = nativeFieldObjects.filter((object) => object.attributes?.role === "SHELF_FRAGMENT");
    for (const parent of new Set(fragments.map((fragment) => String(fragment.attributes?.parent ?? "")))) {
      const siblings = fragments.filter((fragment) => String(fragment.attributes?.parent ?? "") === parent);
      const claims = new Map<number, GeographicObject[]>();
      for (const fragment of siblings) for (const index of fragment.tileIndices) {
        const entries = claims.get(index) ?? [];
        entries.push(fragment);
        claims.set(index, entries);
      }
      const owner = new Map<number, string>();
      const sourceDistance = (object: GeographicObject, index: number) => {
        const source = fragmentSources.get(object.id.replace(/^narrative-/, ""));
        if (!source) return Number.POSITIVE_INFINITY;
        const x = (index % width + 0.5) / width;
        const y = (Math.floor(index / width) + 0.5) / height;
        let dx = Math.abs(x - source.x);
        if (wraps) dx = Math.min(dx, 1 - dx);
        return Math.hypot(dx, y - source.y);
      };
      for (const [index, entries] of claims) {
        const selected = [...entries].sort((one, two) => sourceDistance(one, index) - sourceDistance(two, index) || one.id.localeCompare(two.id))[0];
        owner.set(index, selected.id);
      }
      // Relaxed high-fragmentation plans can leave a small sibling with only
      // multiply-claimed tiles. Reserve one real, effect-matched seed for every
      // authored fragment before taking connected subsets; later siblings may
      // redistribute ordinary claims, but never another sibling's sole seed.
      const reservedSeeds = new Set<number>();
      for (const fragment of [...siblings].sort((one, two) => one.id.localeCompare(two.id))) {
        const seed = [...fragment.tileIndices]
          .filter((index) => !reservedSeeds.has(index))
          .sort((one, two) => Number(owner.get(two) === fragment.id) - Number(owner.get(one) === fragment.id)
            || (claims.get(one)?.length ?? 0) - (claims.get(two)?.length ?? 0)
            || sourceDistance(fragment, one) - sourceDistance(fragment, two)
            || one - two)[0];
        if (seed === undefined) continue;
        reservedSeeds.add(seed);
        owner.set(seed, fragment.id);
      }
      for (const fragment of siblings) fragment.tileIndices = largestConnectedFieldSubset(
        fragment.tileIndices.filter((index) => owner.get(index) === fragment.id),
        width,
        height,
        wraps,
      );
    }
  }
  const preboundCircuitPathIds = new Set<string>();
  const preboundCircuitTiles = new Set<number>();
  if (fieldPlan?.grammarFamily === "FIELD_LAKE_KINGDOMS") {
    const landSources = new Map(fieldPlan.sources.filter((source) => source.role === "ENCLOSING_LAND")
      .map((source) => [source.id.replace(/^field-/, ""), adjustedFieldSourceById.get(source.id.replace(/^field-/, "")) ?? source]));
    const landFields = nativeFieldObjects.filter((object) => object.attributes?.role === "ENCLOSING_LAND");
    const claims = new Map<number, GeographicObject[]>();
    for (const field of landFields) for (const index of field.tileIndices) {
      const entries = claims.get(index) ?? [];
      entries.push(field);
      claims.set(index, entries);
    }
    const owner = new Map<number, string>();
    for (const [index, entries] of claims) {
      const x = (index % width + 0.5) / width;
      const y = (Math.floor(index / width) + 0.5) / height;
      const selected = [...entries].sort((one, two) => {
        const distance = (object: GeographicObject) => {
          const source = landSources.get(object.id.replace(/^narrative-/, ""));
          if (!source) return Number.POSITIVE_INFINITY;
          let dx = Math.abs(x - source.x);
          if (wraps) dx = Math.min(dx, 1 - dx);
          return Math.hypot(dx, y - source.y);
        };
        return distance(one) - distance(two) || one.id.localeCompare(two.id);
      })[0];
      owner.set(index, selected.id);
    }
    for (const field of landFields) {
      const plannedMatchedTiles = field.tileIndices.length;
      field.tileIndices = largestConnectedFieldSubset(field.tileIndices.filter((index) => owner.get(index) === field.id), width, height, wraps);
      field.attributes = { ...field.attributes, plannedMatchedTiles, discardedOverlappingTiles: plannedMatchedTiles - field.tileIndices.length };
    }
    const landBySourceId = new Map(landFields.map((field) => [field.id.replace(/^narrative-/, ""), field]));
    const circuitPaths = nativeFieldObjects.filter((object) => object.attributes?.role === "OUTER_CIRCUIT");
    type CircuitEdgeOption = { path: GeographicObject; fromTile: number; toTile: number; plannedOverlap: number };
    const circuitOptions = new Map<string, CircuitEdgeOption[]>();
    for (const path of circuitPaths) {
      const from = landBySourceId.get(String(path.attributes?.from ?? ""));
      const to = landBySourceId.get(String(path.attributes?.to ?? ""));
      if (!from || !to) { circuitOptions.set(path.id, []); continue; }
      const toMembers = new Set(to.tileIndices);
      const planned = new Set(path.tileIndices);
      const options = from.tileIndices.flatMap((fromTile) => neighbors(fromTile % width, Math.floor(fromTile / width), width, height, wraps)
        .map(([x, y]) => y * width + x)
        .filter((toTile) => toMembers.has(toTile))
        .map((toTile) => ({
          path,
          fromTile,
          toTile,
          plannedOverlap: Number(planned.has(fromTile)) + Number(planned.has(toTile)),
        })));
      circuitOptions.set(path.id, options.sort((one, two) => two.plannedOverlap - one.plannedOverlap
        || one.fromTile - two.fromTile || one.toTile - two.toTile));
    }
    const orderedCircuitPaths = [...circuitPaths].sort((one, two) => (circuitOptions.get(one.id)?.length ?? 0)
      - (circuitOptions.get(two.id)?.length ?? 0) || one.id.localeCompare(two.id));
    let circuitAssignment: CircuitEdgeOption[] = [];
    const assignCircuitEdges = (cursor: number, selected: CircuitEdgeOption[], usedTermini: Set<number>) => {
      if (selected.length + orderedCircuitPaths.length - cursor <= circuitAssignment.length) return;
      if (cursor >= orderedCircuitPaths.length) { circuitAssignment = [...selected]; return; }
      for (const option of circuitOptions.get(orderedCircuitPaths[cursor].id) ?? []) {
        if (usedTermini.has(option.fromTile) || usedTermini.has(option.toTile)) continue;
        usedTermini.add(option.fromTile);
        usedTermini.add(option.toTile);
        selected.push(option);
        assignCircuitEdges(cursor + 1, selected, usedTermini);
        selected.pop();
        usedTermini.delete(option.fromTile);
        usedTermini.delete(option.toTile);
      }
      assignCircuitEdges(cursor + 1, selected, usedTermini);
    };
    assignCircuitEdges(0, [], new Set<number>());
    for (const option of circuitAssignment) {
      const plannedMatchedTiles = option.path.tileIndices.length;
      option.path.tileIndices = [option.fromTile, option.toTile];
      option.path.attributes = {
        ...option.path.attributes,
        plannedMatchedTiles,
        discardedNonSpineTiles: plannedMatchedTiles - 2,
        endpointTerminatingSpine: true,
        directSharedBorder: true,
      };
      preboundCircuitPathIds.add(option.path.id);
      preboundCircuitTiles.add(option.fromTile);
      preboundCircuitTiles.add(option.toTile);
    }
  }
  if (fieldPlan?.grammarFamily === "FIELD_PATCHWORK_PROVINCES") {
    const provinceById = new Map(nativeFieldObjects.filter((object) => object.attributes?.role === "PATCHWORK_PROVINCE")
      .map((object) => [object.id.replace(/^narrative-/, ""), object]));
    for (const boundary of nativeFieldObjects.filter((object) => object.attributes?.role === "COMPOSED_BOUNDARY")) {
      const from = provinceById.get(String(boundary.attributes?.from ?? ""));
      const to = provinceById.get(String(boundary.attributes?.to ?? ""));
      if (!from || !to) { boundary.tileIndices = []; continue; }
      const toMembers = new Set(to.tileIndices);
      const shared = new Set<number>();
      for (const index of from.tileIndices) for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
        const next = y * width + x;
        if (!toMembers.has(next)) continue;
        shared.add(index);
        shared.add(next);
      }
      const plannedMatchedTiles = boundary.tileIndices.length;
      boundary.tileIndices = largestConnectedFieldSubset([...shared], width, height, wraps);
      boundary.attributes = { ...boundary.attributes, plannedMatchedTiles, reboundSharedEdgeTiles: boundary.tileIndices.length };
    }
  }
  if (fieldPlan) {
    const byRegion = new Map(nativeFieldObjects.filter((object) => object.kind === "NARRATIVE_REGION")
      .map((object) => [object.id.replace(/^narrative-/, ""), object]));
    const spineRoles = new Set(["FJORD_INTRUSION", "CROOKED_INTERIOR", "CONTINENT_BOND", "DROWNED_SHELF_ARC", "OUTER_CIRCUIT", "PRIMARY_RIFT"]);
    const reservedCircuitTiles = new Set(preboundCircuitTiles);
    const reservedShelfArcTiles = new Map<string, Set<number>>();
    const reservedCrookedInteriorTiles = new Map<string, Set<number>>();
    const crookedInteriorSignatures = new Map<string, Set<string>>();
    const reservedRiftTiles = new Set<number>();
    const spinePaths = nativeFieldObjects.filter((object) => object.kind === "NARRATIVE_PATH"
      && spineRoles.has(String(object.attributes?.role ?? ""))
      && !preboundCircuitPathIds.has(object.id));
    for (const path of spinePaths) {
      if (nativeConstraints?.semantics.some((semantic) => semantic.sourceSemanticId === path.semanticId)) continue;
      const from = byRegion.get(String(path.attributes?.from ?? ""));
      const to = byRegion.get(String(path.attributes?.to ?? ""));
      if (!from || !to) continue;
      const effect = String(path.attributes?.effect ?? "");
      const role = String(path.attributes?.role ?? "");
      const allowed = (index: number) => effect === "WATER_PATH"
        ? (path.attributes?.role === "PRIMARY_RIFT" ? tiles[index]?.terrain === 0 : tiles[index]?.terrain < 2)
        : tiles[index]?.terrain >= 2;
      const fromMembers = new Set(from.tileIndices);
      const toMembers = new Set(to.tileIndices);
      const siblingArcTiles = role === "DROWNED_SHELF_ARC"
        ? reservedShelfArcTiles.get(String(path.attributes?.from ?? "")) ?? new Set<number>()
        : new Set<number>();
      const touchesEndpoint = (index: number, endpoint: GeographicObject) => {
        // A primary rift is a technology gate only if opening its deep-water
        // spine actually reaches the endpoint's pre-Astronomy component. A
        // terminus beside an impassable mountain member is geometrically close
        // but cannot bridge either viable cell, so route against passable cell
        // members rather than the broader authored land reservation.
        const endpointMembers = role === "PRIMARY_RIFT"
          ? new Set(endpoint.tileIndices.filter((member) => tiles[member]?.terrain >= 2 && tiles[member]?.elevation < 2))
          : new Set(endpoint.tileIndices);
        return endpointMembers.has(index)
          || neighbors(index % width, Math.floor(index / width), width, height, wraps)
            .some(([x, y]) => endpointMembers.has(y * width + x));
      };
      const pathSet = new Set(path.tileIndices.filter(allowed));
      const endpointsUsePathEffect = [from, to].every((endpoint) => endpoint.tileIndices.filter(allowed).length >= Math.ceil(endpoint.tileIndices.length * 0.8));
      const endpointCandidates = (endpoint: GeographicObject, other: GeographicObject, members: readonly number[]) => {
        const endpointSet = endpoint === from ? fromMembers : toMembers;
        const otherSet = other === from ? fromMembers : toMembers;
        if (endpointsUsePathEffect) {
          const available = (index: number) => (role !== "OUTER_CIRCUIT" || !reservedCircuitTiles.has(index))
            && (role !== "DROWNED_SHELF_ARC" || !siblingArcTiles.has(index));
          const exclusive = endpoint.tileIndices.filter((index) => allowed(index) && !otherSet.has(index) && available(index));
          const candidates = exclusive.length ? exclusive : endpoint.tileIndices.filter((index) => allowed(index) && available(index));
          const boundary = candidates.filter((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
            .some(([x, y]) => {
              const next = y * width + x;
              return allowed(next) && !endpointSet.has(next) && !otherSet.has(next) && available(next);
            }));
          return boundary.length ? boundary : candidates;
        }
        const touching = members.filter((index) => touchesEndpoint(index, endpoint));
        const exclusive = touching.filter((index) => !touchesEndpoint(index, other));
        return exclusive.length ? exclusive : touching;
      };
      let route: number[] = [];
      if (endpointsUsePathEffect) {
        const origins = endpointCandidates(from, to, from.tileIndices);
        const targets = endpointCandidates(to, from, to.tileIndices);
        const endpointTiles = new Set([...origins, ...targets]);
        const excludeEndpointInteriors = role === "OUTER_CIRCUIT";
        const routeAllowed = (index: number) => allowed(index)
          && (!excludeEndpointInteriors || endpointTiles.has(index) || !fromMembers.has(index) && !toMembers.has(index))
          && (role !== "OUTER_CIRCUIT" || !reservedCircuitTiles.has(index))
          && (role !== "DROWNED_SHELF_ARC" || !siblingArcTiles.has(index));
        if (role === "OUTER_CIRCUIT") {
          const plannedOrigins = origins.filter((index) => pathSet.has(index));
          const plannedTargets = targets.filter((index) => pathSet.has(index));
          const plannedEndpointTiles = new Set([...plannedOrigins, ...plannedTargets]);
          route = connectFieldSets(
            plannedOrigins,
            plannedTargets,
            (index) => pathSet.has(index)
              && allowed(index)
              && (plannedEndpointTiles.has(index) || !fromMembers.has(index) && !toMembers.has(index))
              && !reservedCircuitTiles.has(index),
            width,
            height,
            wraps,
          );
        }
        if (route.length < 2) route = connectFieldSets(origins, targets, routeAllowed, width, height, wraps);
        if ((role === "CONTINENT_BOND" || role === "CROOKED_INTERIOR") && route.length < 3) {
          const candidates = origins.flatMap((origin) => {
            const adjacent = new Set(neighbors(origin % width, Math.floor(origin / width), width, height, wraps).map(([x, y]) => y * width + x));
            const distantTargets = targets.filter((target) => target !== origin && !adjacent.has(target));
            const candidate = connectFieldSets([origin], distantTargets, allowed, width, height, wraps);
            return candidate.length >= 3 ? [candidate] : [];
          }).sort((one, two) => one.length - two.length || one[0] - two[0] || (one.at(-1) ?? 0) - (two.at(-1) ?? 0));
          route = candidates[0] ?? route;
        }
        if (role === "CROOKED_INTERIOR") {
          const parentId = String(path.attributes?.from ?? "");
          const siblingTiles = reservedCrookedInteriorTiles.get(parentId) ?? new Set<number>();
          const siblingSignatures = crookedInteriorSignatures.get(parentId) ?? new Set<string>();
          const signature = (candidate: readonly number[]) => [...candidate].sort((one, two) => one - two).join(",");
          const overlap = (candidate: readonly number[]) => candidate.filter((index) => siblingTiles.has(index)).length;
          const preferred = connectFieldSetsMinimizingPenalty(
            origins,
            targets,
            routeAllowed,
            (index) => siblingTiles.has(index) ? 12 : 0,
            width,
            height,
            wraps,
          );
          const candidates: number[][] = preferred.length >= 3 ? [preferred] : [];
          if (!candidates.length || siblingSignatures.has(signature(candidates[0]))) {
            const deterministicSample = (indices: readonly number[], limit: number) => {
              const ordered = [...new Set(indices)].sort((one, two) => one - two);
              if (ordered.length <= limit) return ordered;
              return Array.from({ length: limit }, (_, cursor) => ordered[Math.floor(cursor * (ordered.length - 1) / Math.max(1, limit - 1))]);
            };
            for (const origin of deterministicSample(origins, 24)) {
              const candidate = connectFieldSetsMinimizingPenalty(
                [origin],
                targets,
                routeAllowed,
                (index) => siblingTiles.has(index) ? 12 : 0,
                width,
                height,
                wraps,
              );
              if (candidate.length >= 3) candidates.push(candidate);
            }
            for (const target of deterministicSample(targets, 24)) {
              const candidate = connectFieldSetsMinimizingPenalty(
                origins,
                [target],
                routeAllowed,
                (index) => siblingTiles.has(index) ? 12 : 0,
                width,
                height,
                wraps,
              );
              if (candidate.length >= 3) candidates.push(candidate);
            }
          }
          const selected = candidates.filter((candidate) => !siblingSignatures.has(signature(candidate)))
            .sort((one, two) => overlap(one) - overlap(two)
              || one.length - two.length
              || one[0] - two[0]
              || (one.at(-1) ?? 0) - (two.at(-1) ?? 0))[0];
          if (selected) route = selected;
        }
        if (route.length < 2 && role === "OUTER_CIRCUIT") {
          const boundaryWithoutReservation = (endpoint: GeographicObject, endpointSet: ReadonlySet<number>, otherSet: ReadonlySet<number>) => {
            const candidates = endpoint.tileIndices.filter((index) => allowed(index) && !otherSet.has(index));
            const boundary = candidates.filter((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
              .some(([x, y]) => {
                const next = y * width + x;
                return allowed(next) && !endpointSet.has(next) && !otherSet.has(next);
              }));
            return boundary.length ? boundary : candidates;
          };
          const fallbackOrigins = boundaryWithoutReservation(from, fromMembers, toMembers);
          const fallbackTargets = boundaryWithoutReservation(to, toMembers, fromMembers);
          const fallbackEndpointTiles = new Set([...fallbackOrigins, ...fallbackTargets]);
          route = connectFieldSetsMinimizingPenalty(
            fallbackOrigins,
            fallbackTargets,
            (index) => allowed(index) && (fallbackEndpointTiles.has(index) || !fromMembers.has(index) && !toMembers.has(index)),
            (index) => reservedCircuitTiles.has(index) ? 8 : 0,
            width,
            height,
            wraps,
          );
          const overlapShare = (candidate: readonly number[]) => candidate.filter((index) => reservedCircuitTiles.has(index)).length
            / Math.max(1, candidate.length);
          if (overlapShare(route) > 0.2) {
            const alternatives = fallbackOrigins.flatMap((origin) => fallbackTargets.map((target) => ({
              origin,
              target,
              distance: hexDistance(
                [origin % width, Math.floor(origin / width)],
                [target % width, Math.floor(target / width)],
                width,
                wraps,
              ),
            }))).sort((one, two) => two.distance - one.distance || one.origin - two.origin || one.target - two.target).slice(0, 96).flatMap(({ origin, target }) => {
              const endpointPair = new Set([origin, target]);
              const candidate = connectFieldSetsMinimizingPenalty(
                [origin],
                [target],
                (index) => allowed(index) && (endpointPair.has(index) || !fromMembers.has(index) && !toMembers.has(index)),
                (index) => reservedCircuitTiles.has(index) ? 8 : 0,
                width,
                height,
                wraps,
              );
              return candidate.length >= 2 && overlapShare(candidate) <= 0.2 ? [{ candidate, overlap: overlapShare(candidate) }] : [];
            }).sort((one, two) => one.overlap - two.overlap
              || one.candidate.length - two.candidate.length
              || one.candidate[0] - two.candidate[0]
              || (one.candidate.at(-1) ?? 0) - (two.candidate.at(-1) ?? 0));
            route = alternatives[0]?.candidate ?? route;
          }
        }
        if (route.length < 2 && role === "DROWNED_SHELF_ARC") route = connectFieldSetsMinimizingPenalty(
          origins,
          targets,
          allowed,
          // Any shorter route that reuses a sibling's throat is still false
          // causal evidence. Treat sibling tiles as more expensive than an
          // entire map traversal, falling back to overlap only when no
          // physically distinct land route exists (which the strict proof
          // will then reject rather than conceal).
          (index) => siblingArcTiles.has(index) ? landMask.length : 0,
          width,
          height,
          wraps,
        );
      } else {
        let origins = endpointCandidates(from, to, [...pathSet]);
        let targets = endpointCandidates(to, from, [...pathSet]);
        route = connectFieldSets(origins, targets, (index) => pathSet.has(index), width, height, wraps);
        if (route.length < 2) {
          const all = tiles.flatMap((_, index) => allowed(index) ? [index] : []);
          origins = endpointCandidates(from, to, all);
          targets = endpointCandidates(to, from, all);
          route = connectFieldSets(origins, targets, allowed, width, height, wraps);
        }
        if (role === "PRIMARY_RIFT") {
          const minimumRiftLength = Math.max(4, Math.floor(Math.min(width, height) / 2));
          const endpointPairs = origins.flatMap((origin) => targets.map((target) => ({
            origin,
            target,
            distance: hexDistance(
              [origin % width, Math.floor(origin / width)],
              [target % width, Math.floor(target / width)],
              width,
              wraps,
            ),
          }))).sort((one, two) => two.distance - one.distance || one.origin - two.origin || one.target - two.target).slice(0, 64);
          const longRift = (within: (index: number) => boolean) => endpointPairs.flatMap(({ origin, target }) => {
            const candidate = connectFieldSetsMinimizingPenalty(
              [origin],
              [target],
              within,
              (index) => reservedRiftTiles.has(index) ? 8 : 0,
              width,
              height,
              wraps,
            );
            if (candidate.length < minimumRiftLength) return [];
            const overlap = candidate.filter((index) => reservedRiftTiles.has(index)).length / candidate.length;
            return [{ candidate, overlap }];
          }).sort((one, two) => one.overlap - two.overlap
            || one.candidate.length - two.candidate.length
            || one.candidate[0] - two.candidate[0]
            || (one.candidate.at(-1) ?? 0) - (two.candidate.at(-1) ?? 0))[0]?.candidate;
          route = longRift((index) => pathSet.has(index)) ?? longRift(allowed) ?? route;
        }
      }
      if (route.length >= 2) {
        const plannedMatchedTiles = path.tileIndices.length;
        path.tileIndices = route;
        path.attributes = { ...path.attributes, plannedMatchedTiles, discardedNonSpineTiles: plannedMatchedTiles - route.length, endpointTerminatingSpine: true };
        if (role === "OUTER_CIRCUIT") for (const index of route) reservedCircuitTiles.add(index);
        if (role === "PRIMARY_RIFT") for (const index of route) reservedRiftTiles.add(index);
        if (role === "CROOKED_INTERIOR") {
          const parentId = String(path.attributes?.from ?? "");
          const reserved = reservedCrookedInteriorTiles.get(parentId) ?? new Set<number>();
          for (const index of route) reserved.add(index);
          reservedCrookedInteriorTiles.set(parentId, reserved);
          const signatures = crookedInteriorSignatures.get(parentId) ?? new Set<string>();
          signatures.add([...route].sort((one, two) => one - two).join(","));
          crookedInteriorSignatures.set(parentId, signatures);
        }
        if (role === "DROWNED_SHELF_ARC") {
          const reserved = reservedShelfArcTiles.get(String(path.attributes?.from ?? "")) ?? new Set<number>();
          for (const index of route) reserved.add(index);
          reservedShelfArcTiles.set(String(path.attributes?.from ?? ""), reserved);
        }
      }
    }
    if (fieldPlan.grammarFamily === "FIELD_DROWNED_SHELVES" || fieldPlan.grammarFamily === "FIELD_ISLAND_CONTINENTS") {
      // Solve each parent's shelf arcs as one small route-assignment problem.
      // Greedy shortest paths can force a later sibling through an earlier
      // two-tile throat even when a slightly longer, physically distinct arc
      // exists. The proof rightly rejects that shared causal edge, so retain a
      // deterministic vertex-disjoint assignment across all siblings.
      const shelfArcs = nativeFieldObjects.filter((object) => object.kind === "NARRATIVE_PATH"
        && object.attributes?.role === "DROWNED_SHELF_ARC");
      const fragments = nativeFieldObjects.filter((object) => object.kind === "NARRATIVE_REGION"
        && object.attributes?.role === "SHELF_FRAGMENT");
      for (const parentId of new Set(shelfArcs.map((arc) => String(arc.attributes?.from ?? "")))) {
        const root = byRegion.get(parentId);
        const siblings = shelfArcs.filter((arc) => arc.attributes?.from === parentId);
        if (!root || siblings.length < 2 || siblings.some((arc) => nativeConstraints?.semantics.some((semantic) => semantic.sourceSemanticId === arc.semanticId))) continue;
        const allSiblingFragmentTiles = new Set(fragments
          .filter((fragment) => fragment.attributes?.parent === parentId)
          .flatMap((fragment) => fragment.tileIndices));
        type ShelfArcRoute = { arc: GeographicObject; tiles: number[]; plannedOverlap: number; rootTerminus: number };
        const optionsByArc = new Map<string, ShelfArcRoute[]>();
        for (const arc of siblings) {
          const child = byRegion.get(String(arc.attributes?.to ?? ""));
          if (!child) { optionsByArc.set(arc.id, []); continue; }
          const rootMembers = new Set(root.tileIndices);
          const childMembers = new Set(child.tileIndices);
          const exclusiveRoots = root.tileIndices.filter((index) => !childMembers.has(index));
          const exclusiveChildren = child.tileIndices.filter((index) => !rootMembers.has(index));
          const origins = (exclusiveRoots.length ? exclusiveRoots : root.tileIndices).filter((index) => tiles[index]?.terrain >= 2);
          const targets = (exclusiveChildren.length ? exclusiveChildren : child.tileIndices).filter((index) => tiles[index]?.terrain >= 2);
          const planned = new Set(arc.tileIndices);
          const otherChildren = new Set([...allSiblingFragmentTiles].filter((index) => !childMembers.has(index)));
          const realizedSiblingTiles = new Set(siblings
            .filter((sibling) => sibling.id !== arc.id)
            .flatMap((sibling) => sibling.tileIndices));
          const pairs = origins.flatMap((origin) => targets.map((target) => ({ origin, target })))
            .filter(({ origin, target }) => origin !== target)
            .sort((one, two) => Number(planned.has(two.origin)) + Number(planned.has(two.target))
              - Number(planned.has(one.origin)) - Number(planned.has(one.target))
              || hexDistance([one.origin % width, Math.floor(one.origin / width)], [one.target % width, Math.floor(one.target / width)], width, wraps)
                - hexDistance([two.origin % width, Math.floor(two.origin / width)], [two.target % width, Math.floor(two.target / width)], width, wraps)
              || one.origin - two.origin || one.target - two.target)
            .slice(0, 128);
          const signatures = new Set<string>();
          const routeOptions = pairs.flatMap(({ origin, target }): ShelfArcRoute[] => {
            const endpoints = new Set([origin, target]);
            const within = (index: number) => tiles[index]?.terrain >= 2 && (endpoints.has(index) || !otherChildren.has(index));
            const candidates = [
              connectFieldSetsMinimizingPenalty(
                [origin],
                [target],
                within,
                (index) => planned.has(index) ? 0 : 0.05,
                width,
                height,
                wraps,
              ),
              // A shortest route can inherit a one-tile throat from a
              // sibling that was realized later. Offer the joint solver a
              // deterministic alternative that treats every already-realized
              // sibling tile as more costly than traversing the whole map.
              // This preserves the exact authored endpoints while allowing a
              // longer causal arc when the land topology supports one.
              connectFieldSetsMinimizingPenalty(
                [origin],
                [target],
                within,
                (index) => realizedSiblingTiles.has(index) ? landMask.length : planned.has(index) ? 0 : 0.05,
                width,
                height,
                wraps,
              ),
            ];
            return candidates.flatMap((route) => {
              if (route.length < 2) return [];
              const signature = route.join(",");
              if (signatures.has(signature)) return [];
              signatures.add(signature);
              return [{ arc, tiles: route, plannedOverlap: route.filter((index) => planned.has(index)).length, rootTerminus: route[0] }];
            });
          }).sort((one, two) => two.plannedOverlap - one.plannedOverlap
            || one.tiles.length - two.tiles.length
            || one.tiles[0] - two.tiles[0]
            || (one.tiles.at(-1) ?? 0) - (two.tiles.at(-1) ?? 0));
          optionsByArc.set(arc.id, routeOptions);
        }
        const ordered = [...siblings].sort((one, two) => (optionsByArc.get(one.id)?.length ?? 0) - (optionsByArc.get(two.id)?.length ?? 0)
          || one.id.localeCompare(two.id));
        let assignment: ShelfArcRoute[] | undefined;
        const assign = (cursor: number, selected: ShelfArcRoute[], rootTermini: Set<number>) => {
          if (assignment) return;
          if (cursor >= ordered.length) { assignment = [...selected]; return; }
          for (const option of optionsByArc.get(ordered[cursor].id) ?? []) {
            if (rootTermini.has(option.rootTerminus) || selected.some((other) => {
              const otherTiles = new Set(other.tiles);
              const overlap = option.tiles.filter((index) => otherTiles.has(index)).length;
              return overlap / Math.max(1, Math.min(option.tiles.length, other.tiles.length)) > 0.2;
            })) continue;
            rootTermini.add(option.rootTerminus);
            selected.push(option);
            assign(cursor + 1, selected, rootTermini);
            selected.pop();
            rootTermini.delete(option.rootTerminus);
            if (assignment) return;
          }
        };
        assign(0, [], new Set<number>());
        if (assignment?.length === siblings.length) for (const option of assignment) {
          const plannedMatchedTiles = option.arc.tileIndices.length;
          option.arc.tileIndices = option.tiles;
          option.arc.attributes = {
            ...option.arc.attributes,
            plannedMatchedTiles,
            discardedNonSpineTiles: plannedMatchedTiles - option.tiles.length,
            endpointTerminatingSpine: true,
            siblingDisjoint: true,
          };
        }
      }
    }
    if (fieldPlan.grammarFamily === "FIELD_DROWNED_SHELVES") {
      // The pre-topology separator must retain every candidate shelf route,
      // because it does not yet know which exact spine the final joint solver
      // will bind. On very narrow maps that conservative protection can leave
      // a one-hex, non-causal bridge between two otherwise complete systems.
      // Now that the exact roots, fragments, and arcs are known, cut only land
      // that belongs to no native shelf object. This preserves all exported
      // causal evidence while making the authored parent systems physically
      // distinct.
      const shelfRoots = nativeFieldObjects.filter((object) => object.attributes?.role === "DROWNED_SHELF");
      const shelfFragments = nativeFieldObjects.filter((object) => object.attributes?.role === "SHELF_FRAGMENT");
      const shelfArcs = nativeFieldObjects.filter((object) => object.attributes?.role === "DROWNED_SHELF_ARC");
      const systemTiles = new Map<string, Set<number>>();
      for (const root of shelfRoots) {
        const rootId = root.id.replace(/^narrative-/, "");
        systemTiles.set(rootId, new Set([
          ...root.tileIndices,
          ...shelfFragments.filter((fragment) => fragment.attributes?.parent === rootId).flatMap((fragment) => fragment.tileIndices),
          ...shelfArcs.filter((arc) => arc.attributes?.from === rootId).flatMap((arc) => arc.tileIndices),
        ]));
      }
      const claimedShelfTiles = new Set([...systemTiles.values()].flatMap((members) => [...members]));
      const cutTiles: number[] = [];
      const componentByLand = () => {
        const result = new Int32Array(landMask.length).fill(-1);
        connectedFieldSubsets(landMask, width, height, wraps).forEach((component, id) => {
          for (const index of component) result[index] = id;
        });
        return result;
      };
      for (let pass = 0; pass < Math.max(1, shelfRoots.length * 8); pass += 1) {
        const componentByTile = componentByLand();
        const rootComponents = shelfRoots.map((root) => ({
          id: root.id.replace(/^narrative-/, ""),
          component: root.tileIndices.map((index) => componentByTile[index]).find((id) => id >= 0) ?? -1,
        }));
        const collision = rootComponents.flatMap((one, index) => rootComponents.slice(index + 1)
          .filter((two) => one.component >= 0 && two.component === one.component)
          .map((two) => [one.id, two.id] as const))[0];
        if (!collision) break;
        const one = [...(systemTiles.get(collision[0]) ?? [])].filter((index) => landMask[index]);
        const two = [...(systemTiles.get(collision[1]) ?? [])].filter((index) => landMask[index]);
        const bridge = connectFieldSets(one, two, (index) => landMask[index], width, height, wraps);
        const cut = bridge.filter((index) => !claimedShelfTiles.has(index) && nativeConstraints?.topology[index] !== 1)
          .sort((left, right) => (nativeFieldWaterPriority[right] ?? 0) - (nativeFieldWaterPriority[left] ?? 0)
            || (nativeFieldLandPriority[left] ?? 0) - (nativeFieldLandPriority[right] ?? 0)
            || fieldValues[left] - fieldValues[right]
            || left - right)[0];
        if (cut === undefined) break;
        landMask[cut] = false;
        cutTiles.push(cut);
      }
      if (cutTiles.length) {
        const componentByTile = componentByLand();
        const shelfComponents = new Set(shelfRoots.flatMap((root) => root.tileIndices
          .map((index) => componentByTile[index])
          .filter((id) => id >= 0)));
        const claimedNativeTiles = new Set(nativeFieldObjects.flatMap((object) => object.tileIndices));
        const claimedNeighborhood = new Set([...claimedNativeTiles].flatMap((index) => [
          index,
          ...neighbors(index % width, Math.floor(index / width), width, height, wraps).map(([x, y]) => y * width + x),
        ]));
        const donors = landMask.flatMap((land, index) => {
          if (land || cutTiles.includes(index) || claimedNeighborhood.has(index) || nativeConstraints?.topology[index] === 0) return [];
          const adjacentComponents = new Set(neighbors(index % width, Math.floor(index / width), width, height, wraps)
            .map(([x, y]) => componentByTile[y * width + x])
            .filter((id) => id >= 0));
          if (adjacentComponents.size > 1 || [...adjacentComponents].some((id) => shelfComponents.has(id))) return [];
          return [{ index, attached: adjacentComponents.size }];
        }).sort((one, two) => two.attached - one.attached
          || (nativeFieldLandPriority[two.index] ?? 0) - (nativeFieldLandPriority[one.index] ?? 0)
          || (nativeFieldWaterPriority[one.index] ?? 0) - (nativeFieldWaterPriority[two.index] ?? 0)
          || fieldValues[two.index] - fieldValues[one.index]
          || one.index - two.index);
        const replacements = donors.slice(0, cutTiles.length).map((candidate) => candidate.index);
        if (replacements.length < cutTiles.length) {
          for (const index of cutTiles.slice(replacements.length)) landMask[index] = true;
          cutTiles.length = replacements.length;
        }
        for (const index of replacements) landMask[index] = true;
        const affected = new Set([...cutTiles, ...replacements].flatMap((index) => [
          index,
          ...neighbors(index % width, Math.floor(index / width), width, height, wraps).map(([x, y]) => y * width + x),
        ]));
        for (const index of affected) {
          if (landMask[index]) {
            if (!replacements.includes(index)) continue;
            elevations[index] = 0;
            const x = index % width;
            const y = Math.floor(index / width);
            tiles[index] = {
              ...tiles[index],
              terrain: chooseTerrain(temperatures[index], moistures[index], valueNoise(x + 733, y + 419, 6.5, seed + 3511) - 0.5, dominantTerrains, character.id === "BRUTAL"),
              elevation: 0,
              feature: 255,
              resource: 255,
              river: 0,
            };
            continue;
          }
          elevations[index] = 0;
          const adjacentLand = neighbors(index % width, Math.floor(index / width), width, height, wraps)
            .some(([x, y]) => landMask[y * width + x]);
          tiles[index] = { ...tiles[index], terrain: adjacentLand ? 1 : 0, elevation: 0, feature: 255, resource: 255, river: 0 };
        }
        shelfTopologyChanged = cutTiles.length > 0;
      }
      if (fieldPlan.appliedRelaxations.some((step) => step.id === "relax-shelf-clusters") && shelfRoots.length > 3) {
        const componentByTile = componentByLand();
        const retainedRoots: string[] = [];
        const retainedComponents = new Set<number>();
        const retainedTiles = new Set<number>();
        for (const root of [...shelfRoots].sort((one, two) => two.tileIndices.length - one.tileIndices.length || one.id.localeCompare(two.id))) {
          const id = root.id.replace(/^narrative-/, "");
          const members = systemTiles.get(id) ?? new Set<number>();
          const component = root.tileIndices.map((index) => componentByTile[index]).find((candidate) => candidate >= 0) ?? -1;
          if (component < 0 || retainedComponents.has(component) || [...members].some((index) => retainedTiles.has(index))) continue;
          retainedRoots.push(id);
          retainedComponents.add(component);
          for (const index of members) retainedTiles.add(index);
          if (retainedRoots.length >= 3) break;
        }
        if (retainedRoots.length >= 2) {
          const keepParents = new Set(retainedRoots);
          const keepRegions = new Set(nativeFieldObjects.filter((object) => object.kind === "NARRATIVE_REGION"
            && (object.attributes?.role === "DROWNED_SHELF" && keepParents.has(object.id.replace(/^narrative-/, ""))
              || object.attributes?.role === "SHELF_FRAGMENT" && keepParents.has(String(object.attributes?.parent ?? ""))))
            .map((object) => object.id.replace(/^narrative-/, "")));
          for (let index = nativeFieldObjects.length - 1; index >= 0; index -= 1) {
            const object = nativeFieldObjects[index];
            if (object.attributes?.role === "DROWNED_SHELF" || object.attributes?.role === "SHELF_FRAGMENT") {
              if (!keepRegions.has(object.id.replace(/^narrative-/, ""))) nativeFieldObjects.splice(index, 1);
            } else if (object.attributes?.role === "DROWNED_SHELF_ARC"
              && (!keepRegions.has(String(object.attributes?.from ?? "")) || !keepRegions.has(String(object.attributes?.to ?? "")))) nativeFieldObjects.splice(index, 1);
          }
        }
      }
    }
  }
  let mazeTopologyChanged = false;
  if (fieldPlan?.grammarFamily === "FIELD_LAND_SEA_MAZE") {
    const chambers = nativeFieldObjects.filter((object) => object.attributes?.role === "MAZE_CHAMBER");
    const chamberSource = new Map(fieldPlan.sources
      .filter((source) => source.role === "MAZE_CHAMBER")
      .map((source) => [source.id.replace(/^field-/, ""), source]));
    const chamberClaims = new Map<number, GeographicObject[]>();
    for (const chamber of chambers) for (const index of chamber.tileIndices) {
      const claims = chamberClaims.get(index) ?? [];
      claims.push(chamber);
      chamberClaims.set(index, claims);
    }
    const chamberOwner = new Map<number, string>();
    for (const [index, claims] of chamberClaims) {
      const x = (index % width + 0.5) / width;
      const y = (Math.floor(index / width) + 0.5) / height;
      const owner = [...claims].sort((one, two) => {
        const sourceOne = chamberSource.get(one.id.replace(/^narrative-/, ""));
        const sourceTwo = chamberSource.get(two.id.replace(/^narrative-/, ""));
        const distance = (source: NarrativeFieldSource | undefined) => {
          if (!source) return Number.POSITIVE_INFINITY;
          let dx = Math.abs(x - source.x);
          if (wraps) dx = Math.min(dx, 1 - dx);
          return Math.hypot(dx, y - source.y);
        };
        return distance(sourceOne) - distance(sourceTwo) || one.id.localeCompare(two.id);
      })[0];
      chamberOwner.set(index, owner.id);
    }
    for (const chamber of chambers) {
      const exclusive = chamber.tileIndices.filter((index) => chamberOwner.get(index) === chamber.id);
      const interior = exclusive.filter((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
        .every(([x, y]) => {
          const owner = chamberOwner.get(y * width + x);
          return owner === undefined || owner === chamber.id;
        }));
      chamber.tileIndices = mostViableConnectedFieldSubset(interior.length >= 2 ? interior : exclusive, tiles, width, height, wraps);
      chamber.attributes = {
        ...chamber.attributes,
        plannedMatchedTiles: Number(chamber.attributes?.plannedMatchedTiles ?? exclusive.length),
        discardedDisconnectedTiles: Number(chamber.attributes?.plannedMatchedTiles ?? exclusive.length) - chamber.tileIndices.length,
      };
    }
    const claimedChamberTiles = new Set(chambers.flatMap((chamber) => chamber.tileIndices));
    const plannedPassageTiles = new Set(nativeFieldObjects
      .filter((object) => object.attributes?.role === "WINDING_PASSAGE")
      .flatMap((object) => object.tileIndices));
    const allNativeMazeReservations = new Set(nativeFieldObjects.flatMap((object) => object.tileIndices));
    for (const chamber of chambers.filter((candidate) => candidate.tileIndices.length < 2)) {
      const source = chamberSource.get(chamber.id.replace(/^narrative-/, ""));
      const candidates = [...new Set(chamber.tileIndices.flatMap((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
        .map(([x, y]) => y * width + x)))]
        .filter((index) => !claimedChamberTiles.has(index)
          && !plannedPassageTiles.has(index)
          && landMask[index]
          && tiles[index]?.terrain >= 2
          && tiles[index].elevation < 2
          && nativeConstraints?.topology[index] !== 0)
        .sort((one, two) => {
          if (!source) return one - two;
          const distance = (index: number) => {
            let dx = Math.abs((index % width + 0.5) / width - source.x);
            if (wraps) dx = Math.min(dx, 1 - dx);
            return Math.hypot(dx, (Math.floor(index / width) + 0.5) / height - source.y);
          };
          return distance(one) - distance(two) || one - two;
        });
      const needed = 2 - chamber.tileIndices.length;
      const additions = candidates.slice(0, needed);
      if (additions.length < needed) {
        const waterAdditions = [...new Set(chamber.tileIndices.flatMap((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
          .map(([x, y]) => y * width + x)))]
          .filter((index) => !landMask[index]
            && !claimedChamberTiles.has(index)
            && !plannedPassageTiles.has(index)
            && nativeConstraints?.topology[index] !== 0)
          .sort((one, two) => (nativeFieldLandPriority[two] ?? 0) - (nativeFieldLandPriority[one] ?? 0) || one - two)
          .slice(0, needed - additions.length);
        const donorLand = landMask.flatMap((land, index) => land
          && !allNativeMazeReservations.has(index)
          && !claimedChamberTiles.has(index)
          && !plannedPassageTiles.has(index)
          && nativeConstraints?.topology[index] !== 1
          && neighbors(index % width, Math.floor(index / width), width, height, wraps).some(([x, y]) => !landMask[y * width + x])
          ? [index] : [])
          .sort((one, two) => (nativeFieldWaterPriority[two] ?? 0) - (nativeFieldWaterPriority[one] ?? 0)
            || (nativeFieldLandPriority[one] ?? 0) - (nativeFieldLandPriority[two] ?? 0)
            || one - two);
        if (donorLand.length >= waterAdditions.length) {
          for (const index of waterAdditions) {
            landMask[index] = true;
            elevations[index] = 0;
            tiles[index] = { ...tiles[index], terrain: 3, elevation: 0, feature: 255, river: 0, continent: 1, resource: 255, resourceAmount: 0, wonder: 255 };
            additions.push(index);
          }
          for (const index of donorLand.slice(0, waterAdditions.length)) {
            landMask[index] = false;
            elevations[index] = 0;
            reliefValues[index] = Math.min(reliefValues[index], reliefBaseline - 0.08);
            tiles[index] = { ...tiles[index], terrain: 1, elevation: 0, feature: 255, river: 0, continent: 0, resource: 255, resourceAmount: 0, wonder: 255 };
          }
          mazeTopologyChanged ||= waterAdditions.length > 0;
        }
      }
      for (const index of additions) claimedChamberTiles.add(index);
      chamber.tileIndices = [...chamber.tileIndices, ...additions];
      chamber.attributes = {
        ...chamber.attributes,
        plannedMatchedTiles: Number(chamber.attributes?.plannedMatchedTiles ?? chamber.tileIndices.length) + additions.length,
        viabilityExpansionTiles: Number(chamber.attributes?.viabilityExpansionTiles ?? 0) + additions.length,
      };
    }
    const byRegion = new Map(chambers.map((object) => [object.id.replace(/^narrative-/, ""), object]));
    const pathTouches = (members: readonly number[], endpoint: GeographicObject) => {
      const target = new Set(endpoint.tileIndices);
      return members.some((index) => target.has(index) || neighbors(index % width, Math.floor(index / width), width, height, wraps)
        .some(([x, y]) => target.has(y * width + x)));
    };
    const reservedAlleyTiles = new Set<number>();
    const reservedAlleyMouths = new Set<number>();
    const reservedAlleyTerminals = new Set<number>();
    const reservedPassageTiles = new Set<number>();
    let finalWaterDeadEnds = landMask.flatMap((land, index) => !land
      && neighbors(index % width, Math.floor(index / width), width, height, wraps).filter(([x, y]) => !landMask[y * width + x]).length <= 1
      ? [index] : []);
    for (const path of nativeFieldObjects.filter((object) => object.kind === "NARRATIVE_PATH" && object.attributes?.role === "WINDING_PASSAGE")) {
      const from = byRegion.get(String(path.attributes?.from ?? ""));
      const to = byRegion.get(String(path.attributes?.to ?? ""));
      if (!from || !to) continue;
      const originalCount = path.tileIndices.length;
      if (path.attributes?.role === "WINDING_PASSAGE") {
        let connected = largestConnectedFieldSubset(path.tileIndices.filter((index) => landMask[index]), width, height, wraps);
        for (const endpoint of [from, to]) {
          const connector = connectFieldSets(connected, endpoint.tileIndices, (index) => landMask[index], width, height, wraps);
          connected = largestConnectedFieldSubset([...new Set([...connected, ...connector])], width, height, wraps);
        }
        if (!pathTouches(connected, from) || !pathTouches(connected, to)) {
          const bridge = connectFieldSets(from.tileIndices, to.tileIndices, (index) => nativeConstraints?.topology[index] !== 0, width, height, wraps);
          const additions = bridge.filter((index) => !landMask[index]);
          const protectedNative = new Set(nativeFieldObjects.flatMap((object) => object.tileIndices));
          for (const index of bridge) protectedNative.add(index);
          const donors = landMask.flatMap((land, index) => land
            && !protectedNative.has(index)
            && nativeConstraints?.topology[index] !== 1
            ? [index] : [])
            .sort((one, two) => {
              const landNeighbors = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
                .filter(([x, y]) => landMask[y * width + x]).length;
              return landNeighbors(one) - landNeighbors(two)
                || (nativeFieldWaterPriority[two] ?? 0) - (nativeFieldWaterPriority[one] ?? 0)
                || fieldValues[one] - fieldValues[two] || one - two;
            });
          if (bridge.length >= 3 && donors.length >= additions.length) {
            for (const index of additions) {
              landMask[index] = true;
              elevations[index] = 0;
              reliefValues[index] = Math.min(reliefValues[index], reliefBaseline);
              tiles[index] = { ...tiles[index], terrain: 3, elevation: 0, feature: 255, river: 0, continent: 1, resource: 255, resourceAmount: 0, wonder: 255 };
            }
            for (const index of donors.slice(0, additions.length)) {
              landMask[index] = false;
              elevations[index] = 0;
              tiles[index] = { ...tiles[index], terrain: 1, elevation: 0, feature: 255, river: 0, continent: 0, resource: 255, resourceAmount: 0, wonder: 255 };
            }
            connected = [...new Set(bridge)].sort((one, two) => one - two);
            mazeTopologyChanged ||= additions.length > 0;
          }
        }
        const connectedMembers = new Set(connected);
        const fromMembers = new Set(from.tileIndices);
        const toMembers = new Set(to.tileIndices);
        const otherChamberMembers = new Set(chambers.filter((chamber) => chamber !== from && chamber !== to)
          .flatMap((chamber) => chamber.tileIndices));
        const endpointBoundary = (endpoint: GeographicObject, endpointMembers: ReadonlySet<number>, otherMembers: ReadonlySet<number>, avoidReserved: boolean) => {
          const candidates = endpoint.tileIndices.filter((index) => landMask[index]
            && (!avoidReserved || !reservedPassageTiles.has(index))
            && !otherMembers.has(index)
            && !neighbors(index % width, Math.floor(index / width), width, height, wraps)
              .some(([x, y]) => otherMembers.has(y * width + x)));
          const boundary = candidates.filter((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
            .some(([x, y]) => {
              const next = y * width + x;
              return landMask[next] && !endpointMembers.has(next) && !otherMembers.has(next) && !otherChamberMembers.has(next);
            }));
          return boundary.length ? boundary : candidates;
        };
        let origins = endpointBoundary(from, fromMembers, toMembers, true);
        let targets = endpointBoundary(to, toMembers, fromMembers, true);
        const endpointTiles = new Set([...origins, ...targets]);
        const routeAllowed = (index: number, allowedEndpoints: ReadonlySet<number>) => landMask[index]
          && (allowedEndpoints.has(index) || !fromMembers.has(index) && !toMembers.has(index));
        let route = connectFieldSetsMinimizingPenalty(
          origins,
          targets,
          (index) => routeAllowed(index, endpointTiles) && !reservedPassageTiles.has(index),
          (index) => (connectedMembers.has(index) ? 1 : 1.35) + (otherChamberMembers.has(index) ? 4 : 0),
          width,
          height,
          wraps,
        );
        if (route.length < 3) {
          origins = endpointBoundary(from, fromMembers, toMembers, false);
          targets = endpointBoundary(to, toMembers, fromMembers, false);
          const fallbackEndpointTiles = new Set([...origins, ...targets]);
          route = connectFieldSetsMinimizingPenalty(
            origins,
            targets,
            (index) => routeAllowed(index, fallbackEndpointTiles),
            (index) => (connectedMembers.has(index) ? 1 : 1.35)
              + (otherChamberMembers.has(index) ? 4 : 0)
              + (reservedPassageTiles.has(index) ? 8 : 0),
            width,
            height,
            wraps,
          );
        }
        const routeStretch = (candidate: readonly number[]) => candidate.length < 2 ? 0 : (candidate.length - 1) / Math.max(1, hexDistance(
          [candidate[0] % width, Math.floor(candidate[0] / width)],
          [candidate.at(-1)! % width, Math.floor(candidate.at(-1)! / width)],
          width,
          wraps,
        ));
        const inducedSpine = (candidate: readonly number[]) => {
          const members = new Set(candidate);
          const degrees = candidate.map((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
            .filter(([x, y]) => members.has(y * width + x)).length);
          return degrees.filter((degree) => degree === 1).length === 2 && degrees.every((degree) => degree <= 2);
        };
        if (route.length >= 2 && routeStretch(route) < 1.15) {
          const detours = [...connectedMembers].filter((index) => !endpointTiles.has(index) && !reservedPassageTiles.has(index))
            .map((index) => ({
              index,
              score: Math.min(...origins.map((origin) => hexDistance([origin % width, Math.floor(origin / width)], [index % width, Math.floor(index / width)], width, wraps)))
                + Math.min(...targets.map((target) => hexDistance([target % width, Math.floor(target / width)], [index % width, Math.floor(index / width)], width, wraps))),
            }))
            .sort((one, two) => two.score - one.score || one.index - two.index)
            .slice(0, 24);
          const alternatives = detours.flatMap(({ index }) => {
            const first = connectFieldSets(origins, [index], (candidate) => connectedMembers.has(candidate)
              && routeAllowed(candidate, endpointTiles) && !reservedPassageTiles.has(candidate), width, height, wraps);
            if (first.length < 2) return [];
            const firstInterior = new Set(first.slice(0, -1));
            const second = connectFieldSets([index], targets, (candidate) => connectedMembers.has(candidate)
              && routeAllowed(candidate, endpointTiles) && !reservedPassageTiles.has(candidate) && !firstInterior.has(candidate), width, height, wraps);
            if (second.length < 2) return [];
            const candidate = [...first, ...second.slice(1)];
            return new Set(candidate).size === candidate.length && inducedSpine(candidate) && routeStretch(candidate) >= 1.15 ? [candidate] : [];
          }).sort((one, two) => one.length - two.length || one[0] - two[0]);
          route = alternatives[0] ?? route;
        }
        if (route.length === 2) {
          const prepend = neighbors(route[0] % width, Math.floor(route[0] / width), width, height, wraps)
            .map(([x, y]) => y * width + x)
            .filter((index) => fromMembers.has(index) && index !== route[1])
            .sort((one, two) => one - two)[0];
          const append = neighbors(route[1] % width, Math.floor(route[1] / width), width, height, wraps)
            .map(([x, y]) => y * width + x)
            .filter((index) => toMembers.has(index) && index !== route[0])
            .sort((one, two) => one - two)[0];
          if (prepend !== undefined) route = [prepend, ...route];
          else if (append !== undefined) route = [...route, append];
        }
        // Retain the causal passage itself, not the entire connected field in
        // which it was discovered. The latter can make several authored
        // relationships appear true while all of them merely label the same
        // broad land blob.
        path.tileIndices = route;
        for (const index of path.tileIndices) reservedPassageTiles.add(index);
      } else {
        const adjacentWater = (endpoint: GeographicObject) => [...new Set(endpoint.tileIndices.flatMap((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
          .map(([x, y]) => y * width + x)).filter((index) => !landMask[index]))];
        const candidates = [[from, to], [to, from]].flatMap(([mouthChamber, otherChamber]) => {
          const mouths = adjacentWater(mouthChamber).filter((index) => !reservedAlleyMouths.has(index) && !pathTouches([index], otherChamber));
          const terminals = finalWaterDeadEnds.filter((index) => !reservedAlleyTerminals.has(index)
            && !pathTouches([index], mouthChamber)
            && !pathTouches([index], otherChamber));
          const allowedWater = (index: number) => !landMask[index] && !pathTouches([index], otherChamber);
          let route = connectFieldSets(mouths, terminals, (index) => allowedWater(index) && !reservedAlleyTiles.has(index), width, height, wraps);
          if (route.length < 3) route = connectFieldSetsMinimizingPenalty(mouths, terminals, allowedWater, (index) => reservedAlleyTiles.has(index) ? 1 : 0, width, height, wraps);
          if (route.length < 3 || !finalWaterDeadEnds.includes(route.at(-1)!) || !pathTouches([route[0]], mouthChamber) || pathTouches(route, otherChamber)) return [];
          const original = new Set(path.tileIndices);
          return [{
            route,
            mouthChamber,
            overlap: route.filter((index) => reservedAlleyTiles.has(index)).length,
            plannedOverlap: route.filter((index) => original.has(index)).length,
          }];
        }).sort((one, two) => one.overlap - two.overlap
          || two.plannedOverlap - one.plannedOverlap
          || one.route.length - two.route.length
          || one.route[0] - two.route[0]
          || (one.route.at(-1) ?? 0) - (two.route.at(-1) ?? 0));
        const selected = candidates[0];
        if (selected?.route.length) {
          const terminalTile = selected.route[selected.route.length - 1];
          path.tileIndices = selected.route;
          reservedAlleyMouths.add(selected.route[0]);
          reservedAlleyTerminals.add(terminalTile);
          for (const index of selected.route) reservedAlleyTiles.add(index);
          path.attributes = {
            ...path.attributes,
            mouthChamber: selected.mouthChamber.id.replace(/^narrative-/, ""),
            mouthTile: selected.route[0],
            terminalTile,
            finalWaterGraphDeadEnd: true,
          };
        }
      }
      path.attributes = { ...path.attributes, plannedMatchedTiles: originalCount, connectorTiles: Math.max(0, path.tileIndices.length - originalCount) };
    }
    const blindAlleys = nativeFieldObjects.filter((object) => object.kind === "NARRATIVE_PATH" && object.attributes?.role === "BLIND_WATER_ALLEY");
    const protectedMazeLand = new Set(nativeFieldObjects
      .filter((object) => object.attributes?.role === "WINDING_PASSAGE")
      .flatMap((object) => object.tileIndices));
    type CarvedAlleyOption = {
      path: GeographicObject;
      route: number[];
      mouthChamber: GeographicObject;
      mouth: number;
      terminal: number;
      carved: number[];
      plannedOverlap: number;
    };
    const carvedOptions = new Map<string, CarvedAlleyOption[]>();
    const waterNeighbors = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
      .map(([x, y]) => y * width + x)
      .filter((candidate) => !landMask[candidate]);
    for (const path of blindAlleys) {
      const from = byRegion.get(String(path.attributes?.from ?? ""));
      const to = byRegion.get(String(path.attributes?.to ?? ""));
      if (!from || !to) { carvedOptions.set(path.id, []); continue; }
      const original = new Set(path.tileIndices);
      const options: CarvedAlleyOption[] = [];
      for (const [mouthChamber, otherChamber] of [[from, to], [to, from]] as const) {
        const mouths = [...new Set(mouthChamber.tileIndices.flatMap((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
          .map(([x, y]) => y * width + x)).filter((index) => !landMask[index] && !pathTouches([index], otherChamber)))]
          .sort((one, two) => one - two);
        for (const mouth of mouths) {
          const firstSteps = neighbors(mouth % width, Math.floor(mouth / width), width, height, wraps)
            .map(([x, y]) => y * width + x)
            .filter((index) => landMask[index]
              && !protectedMazeLand.has(index)
              && nativeConstraints?.topology[index] !== 1
              && !pathTouches([index], otherChamber)
              && (!mouthChamber.tileIndices.includes(index)
                || mouthChamber.tileIndices.length > 3
                  && neighbors(mouth % width, Math.floor(mouth / width), width, height, wraps)
                    .some(([x, y]) => {
                      const neighbor = y * width + x;
                      return neighbor !== index && mouthChamber.tileIndices.includes(neighbor);
                    })
                  && largestConnectedFieldSubset(mouthChamber.tileIndices.filter((tile) => tile !== index), width, height, wraps).length
                    === mouthChamber.tileIndices.length - 1)
              && waterNeighbors(index).every((water) => water === mouth))
            .sort((one, two) => Number(original.has(two)) - Number(original.has(one)) || one - two);
          for (const first of firstSteps) {
            const extend = (carved: number[], remaining: number) => {
              if (remaining <= 0 || options.length >= 256) return;
              const current = carved[carved.length - 1];
              const routePrefix = [mouth, ...carved];
              const prior = new Set(routePrefix);
              const nextSteps = neighbors(current % width, Math.floor(current / width), width, height, wraps)
                .map(([x, y]) => y * width + x)
                .filter((index) => landMask[index]
                  && !prior.has(index)
                  && !mouthChamber.tileIndices.includes(index)
                  && !protectedMazeLand.has(index)
                  && nativeConstraints?.topology[index] !== 1
                  && !pathTouches([index], otherChamber)
                  && waterNeighbors(index).length === 0
                  && neighbors(index % width, Math.floor(index / width), width, height, wraps)
                    .map(([x, y]) => y * width + x)
                    .filter((neighbor) => prior.has(neighbor))
                    .every((neighbor) => neighbor === current))
                .sort((one, two) => Number(original.has(two)) - Number(original.has(one)) || one - two)
                .slice(0, 6);
              for (const next of nextSteps) {
                const carvedRoute = [...carved, next];
                const route = [mouth, ...carvedRoute];
                if (!pathTouches([next], mouthChamber)) options.push({
                  path,
                  route,
                  mouthChamber,
                  mouth,
                  terminal: next,
                  carved: carvedRoute,
                  plannedOverlap: route.filter((index) => original.has(index)).length,
                });
                extend(carvedRoute, remaining - 1);
                if (options.length >= 256) return;
              }
            };
            extend([first], 4);
          }
        }
      }
      carvedOptions.set(path.id, options.sort((one, two) => two.plannedOverlap - one.plannedOverlap
        || one.mouth - two.mouth || one.terminal - two.terminal).slice(0, 48));
    }
    const orderedCarvedAlleys = [...blindAlleys].sort((one, two) => (carvedOptions.get(one.id)?.length ?? 0)
      - (carvedOptions.get(two.id)?.length ?? 0) || one.id.localeCompare(two.id));
    let carvedAssignment: CarvedAlleyOption[] | undefined;
    const assignCarvedAlleys = (cursor: number, selected: CarvedAlleyOption[], usedTiles: Set<number>, usedMouths: Set<number>) => {
      if (carvedAssignment) return;
      if (cursor >= orderedCarvedAlleys.length) { carvedAssignment = [...selected]; return; }
      for (const option of carvedOptions.get(orderedCarvedAlleys[cursor].id) ?? []) {
        if (usedMouths.has(option.mouth) || option.route.some((index) => usedTiles.has(index))) continue;
        if (selected.some((other) => neighbors(option.terminal % width, Math.floor(option.terminal / width), width, height, wraps)
          .some(([x, y]) => other.route.includes(y * width + x))
          || neighbors(other.terminal % width, Math.floor(other.terminal / width), width, height, wraps)
            .some(([x, y]) => option.route.includes(y * width + x)))) continue;
        usedMouths.add(option.mouth);
        for (const index of option.route) usedTiles.add(index);
        selected.push(option);
        assignCarvedAlleys(cursor + 1, selected, usedTiles, usedMouths);
        selected.pop();
        usedMouths.delete(option.mouth);
        for (const index of option.route) usedTiles.delete(index);
        if (carvedAssignment) return;
      }
    };
    assignCarvedAlleys(0, [], new Set<number>(), new Set<number>());
    const carvedTiles = new Set((carvedAssignment ?? []).flatMap((option) => option.carved));
    let canonicalAlleysInstalled = false;
    if (carvedAssignment?.length === blindAlleys.length && carvedTiles.size > 0) {
      const routeTiles = new Set(carvedAssignment.flatMap((option) => option.route));
      const donorWater = landMask.flatMap((land, index) => !land
        && !routeTiles.has(index)
        && nativeConstraints?.topology[index] !== 0
        && neighbors(index % width, Math.floor(index / width), width, height, wraps).some(([x, y]) => landMask[y * width + x])
        ? [index] : [])
        .sort((one, two) => {
          const landNeighbors = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
            .filter(([x, y]) => landMask[y * width + x]).length;
          return landNeighbors(two) - landNeighbors(one)
            || (nativeFieldLandPriority[two] ?? 0) - (nativeFieldLandPriority[one] ?? 0)
            || (nativeFieldWaterPriority[one] ?? 0) - (nativeFieldWaterPriority[two] ?? 0)
            || one - two;
        });
      if (donorWater.length >= carvedTiles.size) {
        for (const index of carvedTiles) {
          landMask[index] = false;
          elevations[index] = 0;
          reliefValues[index] = Math.min(reliefValues[index], reliefBaseline - 0.08);
          tiles[index] = { ...tiles[index], terrain: 1, elevation: 0, feature: 255, river: 0, continent: 0, resource: 255, resourceAmount: 0, wonder: 255 };
        }
        for (const chamber of chambers) {
          const removed = chamber.tileIndices.filter((index) => carvedTiles.has(index)).length;
          if (!removed) continue;
          chamber.tileIndices = chamber.tileIndices.filter((index) => !carvedTiles.has(index));
          chamber.attributes = {
            ...chamber.attributes,
            discardedWaterAlleyTiles: Number(chamber.attributes?.discardedWaterAlleyTiles ?? 0) + removed,
          };
        }
        for (const index of donorWater.slice(0, carvedTiles.size)) {
          landMask[index] = true;
          elevations[index] = 0;
          tiles[index] = { ...tiles[index], terrain: 3, elevation: 0, feature: 255, river: 0, continent: 1, resource: 255, resourceAmount: 0, wonder: 255 };
        }
        for (const option of carvedAssignment) {
          const originalCount = option.path.tileIndices.length;
          option.path.tileIndices = option.route;
          option.path.attributes = {
            ...option.path.attributes,
            plannedMatchedTiles: originalCount,
            connectorTiles: option.carved.length,
            mouthChamber: option.mouthChamber.id.replace(/^narrative-/, ""),
            mouthTile: option.mouth,
            terminalTile: option.terminal,
            finalWaterGraphDeadEnd: true,
          };
        }
        mazeTopologyChanged = true;
        canonicalAlleysInstalled = true;
      }
    }
    if (!canonicalAlleysInstalled) {
      type SculptedAlleyOption = {
        path: GeographicObject;
        route: number[];
        mouthChamber: GeographicObject;
        mouth: number;
        terminal: number;
        seal: number[];
        plannedOverlap: number;
      };
      const sculptedOptions = new Map<string, SculptedAlleyOption[]>();
      for (const path of blindAlleys) {
        const from = byRegion.get(String(path.attributes?.from ?? ""));
        const to = byRegion.get(String(path.attributes?.to ?? ""));
        if (!from || !to) { sculptedOptions.set(path.id, []); continue; }
        const original = new Set(path.tileIndices);
        const options: SculptedAlleyOption[] = [];
        for (const [mouthChamber, otherChamber] of [[from, to], [to, from]] as const) {
          const mouths = [...new Set(mouthChamber.tileIndices.flatMap((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
            .map(([x, y]) => y * width + x)).filter((index) => !landMask[index] && !pathTouches([index], otherChamber)))]
            .sort((one, two) => one - two);
          for (const mouth of mouths) {
            const parent = new Int32Array(landMask.length).fill(-2);
            const distance = new Int16Array(landMask.length).fill(-1);
            const queue = [mouth];
            parent[mouth] = -1;
            distance[mouth] = 0;
            for (let cursor = 0; cursor < queue.length; cursor += 1) {
              const current = queue[cursor];
              if (distance[current] >= 5) continue;
              for (const [x, y] of neighbors(current % width, Math.floor(current / width), width, height, wraps)) {
                const next = y * width + x;
                if (landMask[next] || parent[next] !== -2 || pathTouches([next], otherChamber)) continue;
                parent[next] = current;
                distance[next] = distance[current] + 1;
                queue.push(next);
              }
            }
            for (const terminal of queue) {
              if (distance[terminal] < 2 || pathTouches([terminal], mouthChamber) || pathTouches([terminal], otherChamber)) continue;
              const route: number[] = [];
              for (let current = terminal; current >= 0; current = parent[current]) route.push(current);
              route.reverse();
              const predecessor = route[route.length - 2];
              const routeSet = new Set(route);
              const seal = waterNeighbors(terminal).filter((index) => index !== predecessor && !routeSet.has(index));
              if (seal.some((index) => nativeConstraints?.topology[index] === 0)) continue;
              options.push({
                path,
                route,
                mouthChamber,
                mouth,
                terminal,
                seal,
                plannedOverlap: route.filter((index) => original.has(index)).length,
              });
            }
          }
        }
        sculptedOptions.set(path.id, options.sort((one, two) => one.seal.length - two.seal.length
          || two.plannedOverlap - one.plannedOverlap || one.route.length - two.route.length
          || one.mouth - two.mouth || one.terminal - two.terminal).slice(0, 64));
      }
      const orderedSculptedAlleys = [...blindAlleys].sort((one, two) => (sculptedOptions.get(one.id)?.length ?? 0)
        - (sculptedOptions.get(two.id)?.length ?? 0) || one.id.localeCompare(two.id));
      let sculptedAssignment: SculptedAlleyOption[] | undefined;
      const assignSculptedAlleys = (cursor: number, selected: SculptedAlleyOption[], usedTiles: Set<number>, usedMouths: Set<number>) => {
        if (sculptedAssignment) return;
        if (cursor >= orderedSculptedAlleys.length) { sculptedAssignment = [...selected]; return; }
        for (const option of sculptedOptions.get(orderedSculptedAlleys[cursor].id) ?? []) {
          const footprint = [...option.route, ...option.seal];
          if (usedMouths.has(option.mouth) || footprint.some((index) => usedTiles.has(index))) continue;
          usedMouths.add(option.mouth);
          for (const index of footprint) usedTiles.add(index);
          selected.push(option);
          assignSculptedAlleys(cursor + 1, selected, usedTiles, usedMouths);
          selected.pop();
          usedMouths.delete(option.mouth);
          for (const index of footprint) usedTiles.delete(index);
          if (sculptedAssignment) return;
        }
      };
      assignSculptedAlleys(0, [], new Set<number>(), new Set<number>());
      if (sculptedAssignment?.length === blindAlleys.length) {
        const sealTiles = new Set(sculptedAssignment.flatMap((option) => option.seal));
        const routeTiles = new Set(sculptedAssignment.flatMap((option) => option.route));
        const routeNeighborhood = new Set([...routeTiles].flatMap((index) => [index, ...neighbors(index % width, Math.floor(index / width), width, height, wraps)
          .map(([x, y]) => y * width + x)]));
        const allNativeMazeLand = new Set(nativeFieldObjects
          .filter((object) => object.attributes?.role === "MAZE_CHAMBER" || object.attributes?.role === "WINDING_PASSAGE")
          .flatMap((object) => object.tileIndices));
        const donorLand = landMask.flatMap((land, index) => land
          && !allNativeMazeLand.has(index)
          && !routeNeighborhood.has(index)
          && nativeConstraints?.topology[index] !== 1
          && neighbors(index % width, Math.floor(index / width), width, height, wraps).some(([x, y]) => !landMask[y * width + x])
          ? [index] : [])
          .sort((one, two) => (nativeFieldWaterPriority[two] ?? 0) - (nativeFieldWaterPriority[one] ?? 0)
            || (nativeFieldLandPriority[one] ?? 0) - (nativeFieldLandPriority[two] ?? 0)
            || one - two);
        if (donorLand.length >= sealTiles.size) {
          for (const index of sealTiles) {
            landMask[index] = true;
            elevations[index] = 0;
            tiles[index] = { ...tiles[index], terrain: 3, elevation: 0, feature: 255, river: 0, continent: 1, resource: 255, resourceAmount: 0, wonder: 255 };
          }
          for (const index of donorLand.slice(0, sealTiles.size)) {
            landMask[index] = false;
            elevations[index] = 0;
            reliefValues[index] = Math.min(reliefValues[index], reliefBaseline - 0.08);
            tiles[index] = { ...tiles[index], terrain: 1, elevation: 0, feature: 255, river: 0, continent: 0, resource: 255, resourceAmount: 0, wonder: 255 };
          }
          for (const option of sculptedAssignment) {
            const originalCount = option.path.tileIndices.length;
            option.path.tileIndices = option.route;
            option.path.attributes = {
              ...option.path.attributes,
              plannedMatchedTiles: originalCount,
              connectorTiles: 0,
              sealedWaterTiles: option.seal.length,
              mouthChamber: option.mouthChamber.id.replace(/^narrative-/, ""),
              mouthTile: option.mouth,
              terminalTile: option.terminal,
              finalWaterGraphDeadEnd: true,
            };
          }
          mazeTopologyChanged = true;
          canonicalAlleysInstalled = true;
        }
      }
    }
    finalWaterDeadEnds = landMask.flatMap((land, index) => !land
      && neighbors(index % width, Math.floor(index / width), width, height, wraps).filter(([x, y]) => !landMask[y * width + x]).length <= 1
      ? [index] : []);
    if (!canonicalAlleysInstalled) {
      type AlleyOption = { path: GeographicObject; route: number[]; mouthChamber: GeographicObject; mouth: number; terminal: number; plannedOverlap: number };
      const alleyOptions = new Map<string, AlleyOption[]>();
      const adjacentWater = (endpoint: GeographicObject) => [...new Set(endpoint.tileIndices.flatMap((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
        .map(([x, y]) => y * width + x)).filter((index) => !landMask[index]))];
      for (const path of blindAlleys) {
        const from = byRegion.get(String(path.attributes?.from ?? ""));
        const to = byRegion.get(String(path.attributes?.to ?? ""));
        if (!from || !to) { alleyOptions.set(path.id, []); continue; }
        const original = new Set(path.tileIndices);
        const options: AlleyOption[] = [];
        for (const [mouthChamber, otherChamber] of [[from, to], [to, from]]) {
          const mouths = adjacentWater(mouthChamber).filter((index) => !pathTouches([index], otherChamber));
          const allowedWater = (index: number) => !landMask[index] && !pathTouches([index], otherChamber);
          for (const mouth of mouths) for (const terminal of finalWaterDeadEnds.filter((index) => !pathTouches([index], mouthChamber) && !pathTouches([index], otherChamber))) {
            // Each authored alley needs its own physical mouth. A multi-source
            // search chooses only the nearest mouth for every terminal and can
            // therefore make an otherwise rich water graph look as though it
            // contains a single reusable branch. Enumerate each literal
            // mouth-to-dead-end route before the global one-to-one assignment.
            const route = connectFieldSets([mouth], [terminal], allowedWater, width, height, wraps);
            if (route.length < 3 || route[0] !== mouth || route.at(-1) !== terminal || !pathTouches([mouth], mouthChamber) || pathTouches(route, otherChamber)) continue;
            options.push({ path, route, mouthChamber, mouth, terminal, plannedOverlap: route.filter((index) => original.has(index)).length });
          }
        }
        const unique = new Map(options.map((option) => [`${option.mouth}:${option.terminal}:${option.route.join(",")}`, option]));
        alleyOptions.set(path.id, [...unique.values()].sort((one, two) => two.plannedOverlap - one.plannedOverlap
          || one.route.length - two.route.length || one.mouth - two.mouth || one.terminal - two.terminal).slice(0, 48));
      }
      const orderedAlleys = [...blindAlleys].sort((one, two) => (alleyOptions.get(one.id)?.length ?? 0) - (alleyOptions.get(two.id)?.length ?? 0) || one.id.localeCompare(two.id));
      const routeOverlap = (one: readonly number[], two: readonly number[]) => {
        const right = new Set(two);
        return one.filter((index) => right.has(index)).length;
      };
      let bestAssignment: AlleyOption[] | undefined;
      let bestScore = Number.POSITIVE_INFINITY;
      const assignAlleys = (cursor: number, selected: AlleyOption[], usedMouths: Set<number>, usedTerminals: Set<number>) => {
        if (cursor >= orderedAlleys.length) {
          const overlap = selected.reduce((sum, option, index) => sum + selected.slice(index + 1)
            .reduce((pathSum, other) => pathSum + routeOverlap(option.route, other.route), 0), 0);
          const score = overlap * 100_000 - selected.reduce((sum, option) => sum + option.plannedOverlap, 0) * 100 + selected.reduce((sum, option) => sum + option.route.length, 0);
          if (score < bestScore) { bestScore = score; bestAssignment = [...selected]; }
          return;
        }
        const path = orderedAlleys[cursor];
        for (const option of alleyOptions.get(path.id) ?? []) {
          if (usedMouths.has(option.mouth) || usedTerminals.has(option.terminal)) continue;
          if (selected.some((other) => routeOverlap(option.route, other.route) / Math.max(1, Math.min(option.route.length, other.route.length)) > 0.2)) continue;
          usedMouths.add(option.mouth); usedTerminals.add(option.terminal); selected.push(option);
          assignAlleys(cursor + 1, selected, usedMouths, usedTerminals);
          selected.pop(); usedMouths.delete(option.mouth); usedTerminals.delete(option.terminal);
        }
      };
      assignAlleys(0, [], new Set<number>(), new Set<number>());
      for (const option of bestAssignment ?? []) {
        const originalCount = option.path.tileIndices.length;
        option.path.tileIndices = option.route;
        option.path.attributes = {
          ...option.path.attributes,
          plannedMatchedTiles: originalCount,
          connectorTiles: Math.max(0, option.route.length - originalCount),
          mouthChamber: option.mouthChamber.id.replace(/^narrative-/, ""),
          mouthTile: option.mouth,
          terminalTile: option.terminal,
          finalWaterGraphDeadEnd: true,
        };
      }
    }
  }
  if (mazeTopologyChanged || shelfTopologyChanged) {
    const finalMazeRiverNetwork = generateRiverNetwork(
      tiles,
      reliefValues,
      moistures,
      width,
      height,
      wraps,
      resolved.style,
      resolved.rainfall,
      randomFactory(seedHash(`${resolved.seed}:${mazeTopologyChanged ? "labyrinth" : "shelves"}-final-rivers:${width}x${height}`)),
      undefined,
      resolved.riverDensity,
      nativeRiverGuidance,
    );
    for (let index = 0; index < tiles.length; index += 1) tiles[index].river = finalMazeRiverNetwork[index];
    initialContinents = connectedTileObjects("CONTINENT", landMask, width, height, wraps, "Continent");
    initialBasins = connectedTileObjects("OCEAN_BASIN", landMask.map((land) => !land), width, height, wraps, "Ocean Basin");
  }
  const nativeFieldObjectIds = new Set(nativeFieldObjects.map((object) => object.id));
  const retainedFieldAdapter = {
    ...narrativeAdapter.evidence,
    causalObjects: narrativeAdapter.evidence.causalObjects.map((cause) => {
      const nativeObjectId = `narrative-${cause.id}`;
      return { ...cause, nativeObjectId, retained: nativeFieldObjectIds.has(nativeObjectId) };
    }),
  };
  const rawGeography: {
    landMask: boolean[];
    reliefValues: number[];
    temperatures: number[];
    moistures: number[];
    elevations: number[];
    riverGuidance: number[];
    tiles: Civ5Tile[];
    structure: GenerationStructure;
  } = {
    landMask,
    reliefValues,
    temperatures,
    moistures,
    elevations,
    riverGuidance: nativeRiverGuidance,
    tiles,
    structure: {
      engine: "EXCOGITARE",
      objects: [...initialContinents, ...initialBasins, ...nativeFieldObjects],
      mountainRanges: [],
      riverSystems: [],
      diagnostics: {
        continents: initialContinents.length,
        oceanBasins: initialBasins.length,
        narrativeTopologyInfluences: narrativeAdapter.evidence.diagnostics.topologyInfluences,
        narrativeReliefInfluences: narrativeAdapter.evidence.diagnostics.reliefInfluences,
        narrativeClimateInfluences: narrativeAdapter.evidence.diagnostics.climateInfluences,
        narrativeHydrologyInfluences: narrativeAdapter.evidence.diagnostics.hydrologyInfluences,
        ...(control?.fieldConstruction === "BRANCHING" ? { nativeLandformVersion: NATIVE_LANDFORM_VERSION, nativeLandformBranches } : {}),
        nativeFieldPreTopologyReservations: (fieldPlan?.sources.length ?? 0) + (fieldPlan?.paths.length ?? 0),
        nativeFieldSources: fieldPlan?.sources.length ?? 0,
        nativeFieldPaths: fieldPlan?.paths.length ?? 0,
        nativeFieldSemanticReservations,
        nativeFieldBoundObjects: nativeFieldObjects.length,
      },
      narrativeSkeleton,
      narrativeProgram,
      narrativeNativePlan: narrativeAdapter.native,
      narrativeAdapter: retainedFieldAdapter,
    },
  };
  observeNarrativeStage("RAW_NATIVE", rawGeography);
  const attachedGeography = attachNarrativeStructure(rawGeography, narrativeSkeleton, width, height, wraps);
  const narrativeGeography = {
    ...attachedGeography,
    structure: {
      ...attachedGeography.structure,
      objects: attachedGeography.structure.objects.filter((object) => !object.id.startsWith("narrative-") || object.attributes?.nativeNarrative === true),
    },
  };
  observeNarrativeStage("NARRATIVE_REALIZED", narrativeGeography);
  const engineNarrativeEvidence = createEngineNarrativeEvidence(
    "EXCOGITARE",
    captureEngineNarrativeStage("RAW_NATIVE", rawGeography, width, height, wraps),
    captureEngineNarrativeStage("NARRATIVE_REALIZED", narrativeGeography, width, height, wraps),
    compareEngineNarrativeStages("RAW_NATIVE", "NARRATIVE_REALIZED", rawGeography, narrativeGeography),
  );
  reinforceNativeConstraints(narrativeGeography);
  landMask = narrativeGeography.landMask;
  reliefValues = narrativeGeography.reliefValues;
  temperatures = narrativeGeography.temperatures ?? temperatures;
  moistures = narrativeGeography.moistures;
  elevations = narrativeGeography.elevations;
  tiles = narrativeGeography.tiles;
  const narrativeStructure = narrativeGeography.structure;
  carveAccessiblePasses(landMask, elevations, width, height, wraps);
  restoreAccessibleMountainTarget(landMask, elevations, reliefValues, effectiveMountainPercent, width, height, wraps);
  tiles = tiles.map((tile, index) => ({ ...tile, elevation: elevations[index] }));
  if (fieldPlan?.grammarFamily === "FIELD_DROWNED_SHELVES" || fieldPlan?.grammarFamily === "FIELD_ISLAND_CONTINENTS") {
    // Shelf separation is complete before this point, but the final
    // accessibility pass can legitimately demote a mountain that the earlier
    // drainage network used as its headwater. Rebuild against the exported
    // elevation field so an otherwise lawful island system never retains an
    // inland river fragment or a channel without a real mountain source.
    const finalShelfRiverNetwork = generateRiverNetwork(
      tiles,
      reliefValues,
      moistures,
      width,
      height,
      wraps,
      resolved.style,
      resolved.rainfall,
      randomFactory(seedHash(`${resolved.seed}:shelf-final-rivers:${width}x${height}`)),
      undefined,
      resolved.riverDensity,
      nativeRiverGuidance,
    );
    for (let index = 0; index < tiles.length; index += 1) tiles[index].river = finalShelfRiverNetwork[index];
  }

  const playerCount = narrativePopulationTarget(resolved.players, narrativeAdapter.native.populationAdjustment);
  const cityStateCount = narrativeCityStateTarget(resolved.cityStates, narrativeAdapter.native.populationAdjustment);
  onProgress?.("Placing players and city states");
  const majorStarts = placeStartLocations(tiles, width, height, playerCount, wraps, resolved.balance, resolved.teamSize, resolved.teamLayout, random);
  if (resolved.startQuality !== "STANDARD" || resolved.strategicBalance || resolved.balance === "TOURNAMENT") {
    normalizeStarts(tiles, majorStarts, width, height, wraps, resolved.startQuality, resolved.balance === "TOURNAMENT");
  }
  if (resolved.preset === "LABYRINTH" && majorStarts.length >= 2) {
    const passableSizes = passableRegionSizes(tiles, width, height, wraps);
    const dominantPassableSize = Math.max(...passableSizes);
    const retainedChambers = nativeFieldObjects
      .filter((object) => object.attributes?.role === "MAZE_CHAMBER")
      .map((chamber) => {
        const effect = chamber.attributes?.effect as NarrativeFieldSource["effect"] | undefined;
        const matched = effect
          ? chamber.tileIndices.filter((index) => nativeFieldEffectMatches(effect, index, tiles, temperatures, moistures, width, height, wraps))
          : chamber.tileIndices;
        return { chamber, members: mostViableConnectedFieldSubset(matched, tiles, width, height, wraps) };
      })
      .filter((entry) => entry.members.length >= 2);
    const claims = new Map<number, Array<{ chamberId: string; index: number; exact: boolean }>>();
    for (const entry of retainedChambers) {
      const members = new Set(entry.members);
      const halo = new Set(entry.members.flatMap((index) => [index, ...neighbors(index % width, Math.floor(index / width), width, height, wraps)
        .map(([x, y]) => y * width + x)]));
      for (const index of halo) {
        const tile = tiles[index];
        if (!tile || tile.terrain < 2 || tile.elevation === 2 || tile.wonder !== 255 || passableSizes[index] !== dominantPassableSize) continue;
        const workable = neighbors(index % width, Math.floor(index / width), width, height, wraps)
          .filter(([x, y]) => tiles[y * width + x].terrain >= 2 && tiles[y * width + x].elevation < 2).length;
        if (workable < 3) continue;
        const candidates = claims.get(index) ?? [];
        candidates.push({ chamberId: entry.chamber.id, index, exact: members.has(index) });
        claims.set(index, candidates);
      }
    }
    // A halo tile can touch more than one chamber. Bind it once, preferring
    // exact membership and then the stable chamber id, so chamber-use balancing
    // cannot count the same physical start site twice.
    const chamberCandidates = [...claims.values()]
      .map((candidates) => candidates.sort((one, two) => Number(two.exact) - Number(one.exact) || one.chamberId.localeCompare(two.chamberId))[0])
      .sort((one, two) => one.index - two.index);
    const pairCandidates = [...new Set(retainedChambers.flatMap((entry) => {
      const candidates = chamberCandidates.filter((candidate) => candidate.chamberId === entry.chamber.id);
      const axes = [
        (candidate: { index: number }) => candidate.index % width,
        (candidate: { index: number }) => Math.floor(candidate.index / width),
        (candidate: { index: number }) => candidate.index % width - (Math.floor(candidate.index / width) - (Math.floor(candidate.index / width) & 1)) / 2,
        (candidate: { index: number }) => -(candidate.index % width - (Math.floor(candidate.index / width) - (Math.floor(candidate.index / width) & 1)) / 2) - Math.floor(candidate.index / width),
      ];
      return axes.flatMap((axis) => {
        const ordered = [...candidates].sort((one, two) => axis(one) - axis(two) || one.index - two.index);
        return ordered.length ? [ordered[0].index, ordered.at(-1)!.index] : [];
      });
    }))].map((index) => chamberCandidates.find((candidate) => candidate.index === index)!).filter(Boolean);
    const chosen: Array<{ chamberId: string; index: number }> = [];
    let firstPair: [{ chamberId: string; index: number }, { chamberId: string; index: number }] | undefined;
    let firstDistance = -1;
    for (let one = 0; one < pairCandidates.length; one += 1) for (let two = one + 1; two < pairCandidates.length; two += 1) {
      const first = pairCandidates[one];
      const second = pairCandidates[two];
      if (first.chamberId === second.chamberId) continue;
      const distance = hexDistance([first.index % width, Math.floor(first.index / width)], [second.index % width, Math.floor(second.index / width)], width, wraps);
      const signature = first.index * tiles.length + second.index;
      const bestSignature = firstPair ? firstPair[0].index * tiles.length + firstPair[1].index : Number.POSITIVE_INFINITY;
      if (distance > firstDistance || distance === firstDistance && signature < bestSignature) {
        firstDistance = distance;
        firstPair = [first, second];
      }
    }
    if (firstPair && firstDistance >= MINIMUM_START_DISTANCE) chosen.push(...firstPair);
    while (chosen.length < majorStarts.length) {
      const chamberUse = new Map<string, number>();
      for (const candidate of chosen) chamberUse.set(candidate.chamberId, (chamberUse.get(candidate.chamberId) ?? 0) + 1);
      const unusedChambersRemain = retainedChambers.some((entry) => !chamberUse.has(entry.chamber.id));
      const next = chamberCandidates
        .filter((candidate) => !unusedChambersRemain || !chamberUse.has(candidate.chamberId))
        .filter((candidate) => !chosen.some((selected) => selected.index === candidate.index))
        .map((candidate) => ({ candidate, distance: Math.min(...chosen.map((selected) => hexDistance(
          [candidate.index % width, Math.floor(candidate.index / width)],
          [selected.index % width, Math.floor(selected.index / width)],
          width,
          wraps,
        ))) }))
        .filter(({ distance }) => distance >= MINIMUM_START_DISTANCE)
        .sort((one, two) => (chamberUse.get(one.candidate.chamberId) ?? 0) - (chamberUse.get(two.candidate.chamberId) ?? 0)
          || two.distance - one.distance
          || one.candidate.index - two.candidate.index)[0]?.candidate;
      if (!next) break;
      chosen.push(next);
    }
    if (chosen.length !== majorStarts.length) {
      throw new Error(`Labyrinth could bind only ${chosen.length} of ${majorStarts.length} major starts to its retained passable chambers at the required spacing.`);
    }
    for (let index = 0; index < majorStarts.length; index += 1) {
      majorStarts[index].x = chosen[index].index % width;
      majorStarts[index].y = Math.floor(chosen[index].index / width);
    }
  }
  if (resolved.preset === "EARTHSEA" && majorStarts.length >= 2) {
    const realms = nativeFieldObjects.filter((object) => object.attributes?.role === "ISLAND_CONTINENT")
      .sort((one, two) => one.id.localeCompare(two.id));
    const selected: number[] = [];
    const assignments: number[] = [];
    for (let player = 0; player < majorStarts.length; player += 1) {
      const preferredOrder = realms.map((_realm, offset) => realms[(player + offset) % realms.length]);
      const candidate = preferredOrder.flatMap((realm) => realm.tileIndices.map((index) => ({ realm, index })))
        .filter(({ index }) => tiles[index]?.terrain >= 2 && tiles[index].elevation < 2 && tiles[index].wonder === 255
          && selected.every((other) => hexDistance([index % width, Math.floor(index / width)], [other % width, Math.floor(other / width)], width, wraps) >= MINIMUM_START_DISTANCE))
        .sort((one, two) => {
          const workable = (index: number) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
            .filter(([x, y]) => tiles[y * width + x].terrain >= 2 && tiles[y * width + x].elevation < 2).length;
          const onePreferred = one.realm === preferredOrder[0] ? 1 : 0;
          const twoPreferred = two.realm === preferredOrder[0] ? 1 : 0;
          return twoPreferred - onePreferred || workable(two.index) - workable(one.index) || one.index - two.index;
        })[0]?.index;
      if (candidate === undefined) break;
      selected.push(candidate);
      assignments.push(candidate);
    }
    if (assignments.length === majorStarts.length) for (let player = 0; player < majorStarts.length; player += 1) {
      majorStarts[player].x = assignments[player] % width;
      majorStarts[player].y = Math.floor(assignments[player] / width);
    }
  }
  const actualPlayerCount = majorStarts.length;
  const cityStates = placeCityStateLocations(tiles, width, height, cityStateCount, actualPlayerCount, wraps, majorStarts, random, resolved.cityStateMinSpacing, resolved.cityStateDistribution, resolved.cityStateCoastalPreference);
  const startLocations = [...majorStarts, ...cityStates];
  onProgress?.("Placing resources and wonders");
  applyResourceRules(tiles, startLocations, width, height, wraps, resolved, random);
  placeWondersAndSites(tiles, startLocations, width, height, wraps, resolved, random);
  applyNarrativeContent(tiles, [...RESOURCES], narrativeSkeleton, width, height, wraps, effectiveNarrativeContract, narrativeStructure);
  applyNarrativeRiverValleyContent(tiles, [...RESOURCES], startLocations, width, height, wraps, effectiveNarrativeContract);
  balanceEquivalentPolisStarts(tiles, startLocations, width, height, wraps, resolved);
  if (narrativeProgram.generative?.content.pattern === "CONTESTED_CENTRE") enforceContestedCentreValue(tiles, startLocations, narrativeStructure, width, height, wraps, effectiveNarrativeContract);
  for (const object of nativeFieldObjects) {
    if (object.attributes?.effect !== "BARREN") continue;
    for (const index of object.tileIndices) tiles[index] = { ...tiles[index], feature: 255, resource: 255, resourceAmount: 0, wonder: 255 };
  }
  if (resolved.modifier === "DOOMSDAY") applyDoomsdayTheme(tiles, startLocations, width, height, wraps, random);
  if (fieldPlan?.grammarFamily === "FIELD_PATCHWORK_PROVINCES") {
    const provinces = new Map(nativeFieldObjects.filter((object) => object.attributes?.role === "PATCHWORK_PROVINCE")
      .map((object) => [object.id.replace(/^narrative-/, ""), object]));
    const terrainForDominant = new Map<DominantTerrain, number>([
      ["GRASSLAND", 2],
      ["PLAINS", 3],
      ["DESERT", 4],
      ["TUNDRA", 5],
    ]);
    const dominantTerrainIds = dominantTerrains.flatMap((terrain) => {
      const value = terrainForDominant.get(terrain);
      return value === undefined ? [] : [value];
    });
    const placementMap = { terrains: TERRAINS, resources: RESOURCES };
    const compatibleTerrain = (tile: Civ5Tile, allowed: readonly number[], fallback: number, elevation: number) => {
      const candidates = [...new Set([...dominantTerrainIds.filter((terrain) => allowed.includes(terrain)), fallback])];
      return candidates.find((terrain) => tile.resource === 255
        || resourcePlacementVerdict(placementMap, { ...tile, terrain, elevation }).valid) ?? fallback;
    };
    const enforceContactEffect = (index: number, effect: NarrativeFieldSource["effect"]) => {
      const tile = tiles[index];
      if (!tile || tile.terrain < 2) return;
      if (effect === "WET") {
        temperatures[index] = 0.65; moistures[index] = 0.86;
        elevations[index] = Math.min(1, tile.elevation);
        const terrain = compatibleTerrain(tile, [2, 3, 5], 2, elevations[index]);
        tiles[index] = { ...tile, terrain, elevation: elevations[index], feature: terrain === 2 ? 1 : 0 };
      } else if (effect === "DRY" || effect === "HOT") {
        temperatures[index] = effect === "HOT" ? 0.92 : 0.7;
        moistures[index] = effect === "HOT" ? 0.18 : 0.24;
        elevations[index] = Math.min(1, tile.elevation);
        const terrain = compatibleTerrain(tile, [3, 4], 4, elevations[index]);
        tiles[index] = { ...tile, terrain, elevation: elevations[index], feature: 255 };
      } else if (effect === "BARREN") {
        temperatures[index] = 0.92; moistures[index] = 0.04;
        elevations[index] = Math.min(1, tile.elevation);
        const terrain = compatibleTerrain(tile, [2, 3, 4, 5], 4, elevations[index]);
        tiles[index] = { ...tile, terrain, elevation: elevations[index], feature: 255, resource: 255, resourceAmount: 0, wonder: 255 };
      } else if (effect === "COLD") {
        temperatures[index] = 0.18; moistures[index] = 0.42;
        elevations[index] = Math.min(1, tile.elevation);
        tiles[index] = { ...tile, terrain: 5, elevation: elevations[index], feature: 255 };
      } else if (effect === "RIDGE") {
        temperatures[index] = 0.5; moistures[index] = 0.45;
        elevations[index] = 1;
        const terrain = compatibleTerrain(tile, [2, 3, 4, 5], 3, 1);
        tiles[index] = { ...tile, terrain, elevation: 1, feature: 255 };
      } else {
        temperatures[index] = 0.55; moistures[index] = effect === "LOWLAND" ? 0.5 : 0.48;
        elevations[index] = Math.min(1, tile.elevation);
        const terrain = compatibleTerrain(tile, [2, 3, 4, 5], 3, elevations[index]);
        tiles[index] = { ...tile, terrain, elevation: elevations[index], feature: 255 };
      }
    };
    for (const province of provinces.values()) for (const index of province.tileIndices) {
      enforceContactEffect(index, province.attributes?.effect as NarrativeFieldSource["effect"]);
    }
    for (const boundary of nativeFieldObjects.filter((object) => object.attributes?.role === "COMPOSED_BOUNDARY")) {
      const from = provinces.get(String(boundary.attributes?.from ?? ""));
      const to = provinces.get(String(boundary.attributes?.to ?? ""));
      if (!from || !to) continue;
      const toMembers = new Set(to.tileIndices);
      const contact = from.tileIndices.flatMap((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
        .map(([x, y]) => [index, y * width + x] as const)
        .filter(([, next]) => toMembers.has(next)))
        .sort((one, two) => one[0] - two[0] || one[1] - two[1])[0];
      if (!contact) continue;
      enforceContactEffect(contact[0], from.attributes?.effect as NarrativeFieldSource["effect"]);
      enforceContactEffect(contact[1], to.attributes?.effect as NarrativeFieldSource["effect"]);
    }
    if (dominantTerrainIds.length) {
      const provinceTiles = new Set([...provinces.values()].flatMap((province) => province.tileIndices));
      for (let index = 0; index < tiles.length; index += 1) {
        const tile = tiles[index];
        if (tile.terrain < 2 || provinceTiles.has(index) || (nativeConstraints?.terrain[index] ?? -1) >= 0) continue;
        const terrain = compatibleTerrain(tile, [2, 3, 4, 5], dominantTerrainIds[index % dominantTerrainIds.length], tile.elevation);
        const repainted = { ...tile, terrain };
        if (!featurePlacementVerdict({ terrains: TERRAINS, features: FEATURES } as Civ5Map, repainted).valid) repainted.feature = 255;
        tiles[index] = repainted;
      }
    }
    // Patchwork laws intentionally repaint late, but relief percentage and
    // user-authored protected channels remain exact controls. Reconcile the
    // requested mountain budget after the repaint while keeping starts,
    // content, exact constraints, and causal LOWLAND provinces passable.
    applyConstrainedRelief(reliefValues, elevations, landMask, nativeConstraints);
    const lowlandTiles = new Set(nativeFieldObjects.filter((object) => object.attributes?.role === "PATCHWORK_PROVINCE" && object.attributes?.effect === "LOWLAND")
      .flatMap((object) => object.tileIndices));
    const protectedRelief = new Set<number>([
      ...lowlandTiles,
      ...tiles.flatMap((tile, index) => tile.resource !== 255 || tile.wonder !== 255 || tile.improvement ? [index] : []),
      ...startLocations.flatMap((start) => coordinatesWithinRadius(start.x, start.y, 2, width, height, wraps).map(([x, y]) => y * width + x)),
      ...tiles.flatMap((_tile, index) => (nativeConstraints?.elevation[index] ?? -1) >= 0 ? [index] : []),
    ]);
    restoreAccessibleMountainTarget(landMask, elevations, reliefValues, effectiveMountainPercent, width, height, wraps, protectedRelief);
    for (let index = 0; index < tiles.length; index += 1) {
      tiles[index].elevation = elevations[index];
      if (elevations[index] === 2) tiles[index].feature = 255;
    }
    applyConstrainedSurface(tiles, landMask, elevations, nativeConstraints);

    // BARREN is a real content law, so it may erase a previously chosen
    // wonder. Honor both contracts by deterministically rehoming only the
    // missing requested wonder identities outside barren provinces, with the
    // same start buffer and mutual spacing used by initial placement.
    const barrenTiles = new Set(nativeFieldObjects.filter((object) => object.attributes?.role === "PATCHWORK_PROVINCE" && object.attributes?.effect === "BARREN")
      .flatMap((object) => object.tileIndices));
    const desiredWonders = Math.max(0, Math.min(WONDERS.length, Math.round(resolved.wonderCount)));
    const presentWonders = new Set(tiles.flatMap((tile) => tile.wonder !== 255 ? [tile.wonder] : []));
    const selectedWonders = () => tiles.flatMap((tile, index) => tile.wonder !== 255
      ? [[index % width, Math.floor(index / width)] as [number, number]] : []);
    for (let wonder = 0; wonder < desiredWonders; wonder += 1) {
      if (presentWonders.has(wonder)) continue;
      const waterWonder = WONDERS[wonder].includes("KRAKATOA") || WONDERS[wonder].includes("BARRIER_REEF");
      const destination = tiles.findIndex((tile, index) => !barrenTiles.has(index)
        && tile.wonder === 255
        && tile.resource === 255
        && !tile.improvement
        && (tile.terrain < 2) === waterWonder
        && (waterWonder || tile.elevation < 2)
        && startLocations.every((start) => hexDistance([index % width, Math.floor(index / width)], [start.x, start.y], width, wraps) >= resolved.wonderStartBuffer)
        && selectedWonders().every((placed) => hexDistance([index % width, Math.floor(index / width)], placed, width, wraps) >= resolved.wonderMinSpacing));
      if (destination < 0) continue;
      tiles[destination] = { ...tiles[destination], wonder, feature: 255, resource: 255, resourceAmount: 0 };
      presentWonders.add(wonder);
    }
    // Province effects are finalized after content and accessibility so their
    // retained causal objects describe the exported surface. That repaint can
    // legitimately change a former mountain headwater into a hill or plain;
    // rebuild hydrology against the final surface instead of leaving stale
    // river bits encoded beneath it.
    const finalRiverNetwork = generateRiverNetwork(
      tiles,
      reliefValues,
      moistures,
      width,
      height,
      wraps,
      resolved.style,
      resolved.rainfall,
      randomFactory(seedHash(`${resolved.seed}:wild-regions-final-rivers:${width}x${height}`)),
      undefined,
      resolved.riverDensity,
      nativeRiverGuidance,
    );
    for (let index = 0; index < tiles.length; index += 1) tiles[index].river = finalRiverNetwork[index];
  }
  const protectedNarrativeRiverOwners = new Set(nativeFieldObjects.filter((object) => object.attributes?.role === "LIVING_RIVER" || object.attributes?.role === "FLOWS_TO")
    .flatMap((object) => object.tileIndices.filter((index) => tiles[index]?.river > 0)));
  pruneIllogicalRiverComponents(tiles, width, height, wraps, protectedNarrativeRiverOwners);
  const requiredFinalRiverSystems = 1;
  const finalRiverEdgeFloor = Math.max(3, Math.round(Math.sqrt(tiles.length) / 8));
  const substantialRivers = () => reconstructCiv5RiverEdgeSystems({ width, height, wraps, tiles })
    .filter((system) => system.edgeCount >= finalRiverEdgeFloor && system.acyclic && system.directedToOutlet);
  if (substantialRivers().length < requiredFinalRiverSystems) {
    const water = tiles.flatMap((tile, index) => tile.terrain < 2 ? [index] : []);
    const land = tiles.flatMap((tile, index) => tile.terrain >= 2 ? [index] : []);
    const distanceFromWater = (index: number) => water.length ? Math.min(...water.map((target) => hexDistance(
      [index % width, Math.floor(index / width)],
      [target % width, Math.floor(target / width)],
      width,
      wraps,
    ))) : 0;
    const sources = land.filter((index) => tiles[index].elevation === 2)
      .sort((one, two) => distanceFromWater(two) - distanceFromWater(one) || reliefValues[two] - reliefValues[one] || one - two);
    const usedSources: number[] = substantialRivers().flatMap((system) => system.sourceTileIndices);
    const blockedOwners = new Set(reconstructCiv5RiverEdgeSystems({ width, height, wraps, tiles }).flatMap((system) => system.ownerIndices));
    const blockedVertices = new Set(reconstructCiv5RiverEdgeSystems({ width, height, wraps, tiles }).flatMap((system) => system.vertices));
    for (const source of sources.slice(0, 32)) {
      const beforeCount = substantialRivers().length;
      if (beforeCount >= requiredFinalRiverSystems) break;
      if (usedSources.some((used) => hexDistance([source % width, Math.floor(source / width)], [used % width, Math.floor(used / width)], width, wraps) < 5)) continue;
      const farWater = water.filter((target) => hexDistance([source % width, Math.floor(source / width)], [target % width, Math.floor(target / width)], width, wraps) >= finalRiverEdgeFloor + 1);
      if (!farWater.length) continue;
      const before = tiles.map((tile) => tile.river);
      const trialVertices = new Set(blockedVertices);
      const owners = realizeNarrativeRiverSpine(tiles, width, height, wraps, [source], [source], farWater, [], farWater, blockedOwners, undefined, trialVertices);
      if (owners.length && substantialRivers().length > beforeCount) {
        usedSources.push(source);
        for (const index of owners) blockedOwners.add(index);
        blockedVertices.clear();
        for (const vertex of trialVertices) blockedVertices.add(vertex);
      } else for (let index = 0; index < tiles.length; index += 1) tiles[index].river = before[index];
    }
  }
  let finalNativeFieldObjects = nativeFieldObjects.flatMap((object): GeographicObject[] => {
    const effect = object.attributes?.effect as NarrativeFieldSource["effect"] | NarrativePathReservation["effect"] | undefined;
    if (!effect) return [];
    const matched = object.tileIndices.filter((index) => nativeFieldEffectMatches(effect, index, tiles, temperatures, moistures, width, height, wraps)
      && (object.attributes?.role !== "PRIMARY_RIFT" || tiles[index].terrain === 0));
    const role = String(object.attributes?.role ?? "");
    const tileIndices = object.kind === "NARRATIVE_PATH" || role === "PATCHWORK_PROVINCE"
      ? largestConnectedFieldSubset(matched, width, height, wraps)
      : role === "MAZE_CHAMBER" || role === "VIABLE_RIFT_CELL"
        ? role === "MAZE_CHAMBER"
          ? mostViableConnectedFieldSubset(matched, tiles, width, height, wraps)
          : largestConnectedFieldSubset(matched, width, height, wraps)
        : matched;
    return tileIndices.length ? [{ ...object, tileIndices }] : [];
  });
  if (fieldPlan?.grammarFamily === "FIELD_LAND_SEA_MAZE") {
    const chambers = new Map(finalNativeFieldObjects.filter((object) => object.attributes?.role === "MAZE_CHAMBER")
      .map((object) => [object.id.replace(/^narrative-/, ""), object]));
    const allChamberTiles = () => new Set([...chambers.values()].flatMap((object) => object.tileIndices));
    for (const path of finalNativeFieldObjects.filter((object) => object.attributes?.role === "WINDING_PASSAGE")) {
      const from = chambers.get(String(path.attributes?.from ?? ""));
      const to = chambers.get(String(path.attributes?.to ?? ""));
      if (!from || !to) continue;
      const members = new Set(path.tileIndices);
      const termini = path.tileIndices.filter((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
        .filter(([x, y]) => members.has(y * width + x)).length <= 1);
      if (termini.length !== 2) continue;
      const distance = (origin: readonly number[], target: number) => Math.min(...origin.map((index) => hexDistance(
        [index % width, Math.floor(index / width)],
        [target % width, Math.floor(target / width)],
        width,
        wraps,
      )));
      const direct = distance(from.tileIndices, termini[0]) + distance(to.tileIndices, termini[1]);
      const reverse = distance(from.tileIndices, termini[1]) + distance(to.tileIndices, termini[0]);
      const oriented = direct <= reverse ? termini : [termini[1], termini[0]];
      for (const [endpoint, terminus] of [[from, oriented[0]], [to, oriented[1]]] as const) {
        if (endpoint.tileIndices.includes(terminus)) continue;
        if (endpoint.tileIndices.some((index) => neighbors(index % width, Math.floor(index / width), width, height, wraps)
          .some(([x, y]) => y * width + x === terminus))) {
          endpoint.tileIndices = [...new Set([...endpoint.tileIndices, terminus])].sort((one, two) => one - two);
          continue;
        }
        const foreign = allChamberTiles();
        for (const index of endpoint.tileIndices) foreign.delete(index);
        const connector = connectFieldSets(endpoint.tileIndices, [terminus], (index) => tiles[index]?.terrain >= 2
          && tiles[index].elevation < 2 && !foreign.has(index), width, height, wraps);
        if (connector.length) endpoint.tileIndices = [...new Set([...endpoint.tileIndices, ...connector])].sort((one, two) => one - two);
      }
    }
  }
  if (fieldPlan?.grammarFamily === "FIELD_PATCHWORK_PROVINCES") {
    const finalProvinces = new Map(finalNativeFieldObjects.filter((object) => object.attributes?.role === "PATCHWORK_PROVINCE")
      .map((object) => [object.id.replace(/^narrative-/, ""), object]));
    const priorBoundaries = new Map(nativeFieldObjects.filter((object) => object.attributes?.role === "COMPOSED_BOUNDARY")
      .map((object) => [object.id.replace(/^narrative-/, ""), object]));
    const finalBoundaries = fieldPlan.paths.filter((path) => path.kind === "COMPOSED_BOUNDARY").flatMap((path): GeographicObject[] => {
      const from = finalProvinces.get(path.from);
      const to = finalProvinces.get(path.to);
      if (!from || !to) return [];
      const toMembers = new Set(to.tileIndices);
      const shared = new Set<number>();
      for (const index of from.tileIndices) for (const [x, y] of neighbors(index % width, Math.floor(index / width), width, height, wraps)) {
        const next = y * width + x;
        if (!toMembers.has(next)) continue;
        shared.add(index);
        shared.add(next);
      }
      const tileIndices = [...shared].sort((one, two) => one - two);
      if (!tileIndices.length) return [];
      const prior = priorBoundaries.get(path.id);
      return [{
        id: `narrative-${path.id}`,
        semanticId: `narrative:${path.id}`,
        name: prior?.name ?? path.kind.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()),
        kind: "NARRATIVE_PATH",
        tileIndices,
        neighbors: [`narrative-${path.from}`, `narrative-${path.to}`],
        attributes: {
          nativeNarrative: true,
          grammarFamily: fieldPlan.grammarFamily,
          fieldSource: path.id,
          relationship: path.kind,
          role: path.kind,
          effect: path.effect,
          from: path.from,
          to: path.to,
          strength: path.strength,
          outputEffectMatched: true,
          finalSharedEdgeTiles: tileIndices.length,
        },
      }];
    });
    finalNativeFieldObjects = [
      ...finalNativeFieldObjects.filter((object) => object.attributes?.role !== "COMPOSED_BOUNDARY"),
      ...finalBoundaries,
    ];
  }
  const retainedNativeRegions = new Set(finalNativeFieldObjects
    .filter((object) => object.kind === "NARRATIVE_REGION")
    .map((object) => object.id.replace(/^narrative-/, "")));
  finalNativeFieldObjects = finalNativeFieldObjects.filter((object) => object.kind !== "NARRATIVE_PATH"
    || retainedNativeRegions.has(String(object.attributes?.from ?? ""))
      && retainedNativeRegions.has(String(object.attributes?.to ?? "")));
  const finalNativeFieldObjectIds = new Set(finalNativeFieldObjects.map((object) => object.id));
  const finalFieldAdapter = narrativeStructure.narrativeAdapter ? {
    ...narrativeStructure.narrativeAdapter,
    causalObjects: narrativeStructure.narrativeAdapter.causalObjects.map((cause) => ({ ...cause, retained: finalNativeFieldObjectIds.has(cause.nativeObjectId) })),
  } : narrativeStructure.narrativeAdapter;
  const presetName = MAP_PRESETS.find((preset) => preset.id === resolved.preset)?.label ?? "Generated World";
  const modifierName = WORLD_MODIFIERS.find((modifier) => modifier.id === resolved.modifier)?.label;

  const continents = connectedTileObjects("CONTINENT", landMask, width, height, wraps, "Continent");
  const basins = connectedTileObjects("OCEAN_BASIN", landMask.map((land) => !land), width, height, wraps, "Ocean Basin");
  const mountainRanges = connectedLinearFeatures(tiles.map((tile) => tile.terrain >= 2 && tile.elevation === 2), width, height, wraps, "Mountain Range");
  const structure: GenerationStructure = {
    ...narrativeStructure,
    engine: "EXCOGITARE",
    objects: [...narrativeStructure.objects.filter((object) => object.attributes?.nativeNarrative !== true), ...finalNativeFieldObjects],
    mountainRanges,
    riverSystems: [],
    narrativeAdapter: finalFieldAdapter ? {
      ...finalFieldAdapter,
      relaxations: [...new Set([
        ...finalFieldAdapter.relaxations,
        ...capacityDisclosures(
          requestedMajorPopulation(resolved.players),
          playerCount,
          actualPlayerCount,
          requestedCityStatePopulation(resolved.cityStates),
          cityStateCount,
          cityStates.length,
          narrativeProgram.generative?.gameplay.capacityPolicy ?? "PRESERVE_POPULATION",
        ),
      ])],
    } : finalFieldAdapter,
    diagnostics: { ...narrativeStructure.diagnostics, nativeFieldBoundObjects: finalNativeFieldObjects.length, continents: continents.length, oceanBasins: basins.length, mountainRanges: mountainRanges.length, scaleOrdinal: scaleProfile.ordinal, scaleMajorSystemFrequency: Math.round(scaleProfile.majorSystemFrequency * 100), scaleLocalDetail: Math.round(scaleProfile.localDetail * 100), scaleDrainageHierarchy: Math.round(scaleProfile.drainageHierarchy * 100), scaleExcogitareCenters: centerCount, scaleExcogitarePlateFields: plateCenters.length, ...nativeConstraintDiagnostics(nativeConstraints) },
  };
  const legal = enforceGeneratedPlacementLegality({
    name: `${presetName} — ${resolved.seed}`,
    description: `A seeded ${resolved.style.toLowerCase()} ${presetName.toLowerCase()} map built by the Excogitare engine${modifierName && modifierName !== "None" ? ` with ${modifierName}` : ""}, targeting ${Math.round(waterPercent)}% water and ${Math.round(effectiveMountainPercent)}% mountains.`,
    worldSize: size.id,
    version: 12,
    width,
    height,
    players: actualPlayerCount,
    wraps,
    terrains: [...TERRAINS],
    features: [...FEATURES],
    wonders: [...WONDERS],
    resources: [...RESOURCES],
    tiles,
    startLocations,
    source: "generated",
    generation: { ...resolved, players: actualPlayerCount, cityStates: cityStates.length, waterPercent, mountainPercent: effectiveMountainPercent },
    structure: { ...structure, narrativeSkeleton },
  });
  const legalStructure = { ...structure, narrativeSkeleton };
  const legalObservable: EngineNarrativeObservable = {
    ...observableFromMap(legal),
    reliefValues,
    moistures,
    temperatures,
    structure: legalStructure,
  };
  const legalEvidence = appendEngineNarrativeEvidence(
    engineNarrativeEvidence,
    captureEngineNarrativeStage("LEGAL_NORMALIZED", legalObservable, width, height, wraps),
    compareEngineNarrativeStages("NARRATIVE_REALIZED", "LEGAL_NORMALIZED", narrativeGeography, legalObservable),
  );
  observeNarrativeStage("LEGAL_NORMALIZED", legalObservable);
  const observedStructure = { ...legalStructure, engineNarrativeEvidence: legalEvidence };
  const observedLegal = { ...legal, structure: observedStructure };
  return { ...observedLegal, structure: attachRiverSystems(observedLegal, observedStructure) };
}

export const GENERATION_PIPELINE_VERSION = "3";

function passForStage(stage: string) {
  if (stage.includes("players") || stage.includes("city states")) return "STARTS";
  if (stage.includes("resources") || stage.includes("wonders")) return "CONTENT";
  if (stage.includes("drainage") || stage.includes("rivers")) return "HYDROLOGY";
  if (stage.includes("mountain passes")) return "ACCESSIBILITY";
  if (stage.includes("climate") || stage.includes("rain shadows")) return "CLIMATE";
  if (stage.includes("Refining") || stage.includes("relief")) return "RELIEF";
  return "TOPOLOGY";
}

function generateMapWithRecipe(recipe: GenerationRecipe, onProgress?: GenerationProgressListener, control?: GenerationControl) {
  const baseOptions = generationOptionsFromRecipe(recipe);
  const emphasized = new Set(recipe.matchIntent.emphasizedVictories);
  const options: MapGenerationOptions = recipe.engine === "POLIS" ? baseOptions : {
    ...baseOptions,
    balance: recipe.matchIntent.teamIntent === "FIXED_TEAMS" ? "TEAMS" : baseOptions.balance,
    teamLayout: emphasized.has("DOMINATION") && recipe.matchIntent.teamIntent === "FIXED_TEAMS" ? "FRONTLINES" : baseOptions.teamLayout,
    startQuality: recipe.matchIntent.aiAccommodation === "STRONG" && baseOptions.startQuality === "STANDARD" ? "BALANCED" : baseOptions.startQuality,
    strategicStartGuarantee: emphasized.has("SCIENCE") || recipe.matchIntent.aiAccommodation === "STRONG" ? true : baseOptions.strategicStartGuarantee,
    luxuryStartGuarantee: emphasized.has("CULTURE") ? true : baseOptions.luxuryStartGuarantee,
    cityStateDistribution: emphasized.has("DIPLOMACY") ? "EVEN" : baseOptions.cityStateDistribution,
  };
  const session = new GenerationPassSession([...GENERATION_PASS_DEFINITIONS], options.seed, recipe, recipe.effort, onProgress, control);
  session.complete("NORMALIZE");
  session.progress("TOPOLOGY", "Preparing generation engine");
  const completed = () => session.completed;
  const byId = new Map(GENERATION_PASS_DEFINITIONS.map((definition) => [definition.id, definition]));
  const passLabel = (passId: string) => passId === "TOPOLOGY" ? "Compiling world topology"
    : passId === "RELIEF" ? "Resolving relief and elevation"
      : passId === "CLIMATE" ? "Resolving climate and biomes"
        : passId === "ACCESSIBILITY" ? "Opening mountain passes"
          : passId === "STARTS" ? "Placing players and city states"
            : passId === "CONTENT" ? "Placing resources and wonders"
              : passId === "HYDROLOGY" ? "Resolving drainage and rivers"
                : passId === "LEGALITY" ? "Validating generated map"
                  : "Retaining semantic geography";
  const ensurePassDependencies = (passId: string) => {
    const definition = byId.get(passId);
    if (!definition) throw new Error(`Unknown generation pass: ${passId}.`);
    for (const dependency of definition.dependencies) {
      if (completed().has(dependency)) continue;
      ensurePassDependencies(dependency);
      session.progress(dependency, passLabel(dependency), selectedCandidate);
      session.complete(dependency, [], selectedCandidate);
    }
  };
  let selectedCandidate = 1;
  type CandidateSelection = {
    map: Civ5Map;
    recipe: GenerationRecipe;
    key: number[];
    candidate: number;
    legalityErrors: number;
    capacityFailures: number;
    nativeGrammarFailures: number;
    hardFailures: number;
    invariantFailures: number;
    invariantFailureIds: string[];
    invariantFailureDetails: string[];
    contentFailures: number;
    contentFailureDetails: string[];
    naturalismFailures: number;
    naturalismFailureDetails: string[];
    relaxationIds: string[];
    snapshots: EngineNarrativeStageSnapshot[];
  };
  const betterKey = (one: number[], two: number[]) => {
    for (let index = 0; index < Math.max(one.length, two.length); index += 1) {
      if (one[index] === two[index]) continue;
      return (one[index] ?? 0) < (two[index] ?? 0);
    }
    return false;
  };
  const assessCandidate = (candidateMap: Civ5Map, candidateRecipe: GenerationRecipe, relaxationIds: string[], candidate: number, snapshots: EngineNarrativeStageSnapshot[]): CandidateSelection => {
    const surfacedCandidate = applyWorldArchetype(candidateMap, recipe.archetype, recipe.archetypeIntensity);
    const ecologizedCandidate = recipe.archetypeIntensity === "TRANSFORMATIVE" ? applyArchetypeContentEcology(surfacedCandidate, recipe.archetype) : surfacedCandidate;
    if (ecologizedCandidate.generation && ecologizedCandidate.structure) applyNarrativeBrutalFrontierContent(
      ecologizedCandidate.tiles,
      ecologizedCandidate.features,
      ecologizedCandidate.startLocations,
      ecologizedCandidate.width,
      ecologizedCandidate.height,
      ecologizedCandidate.wraps,
      ecologizedCandidate.structure.narrativeNativePlan?.contract ?? ecologizedCandidate.structure.narrativeProgram?.generative,
      ecologizedCandidate.structure,
      ecologizedCandidate.generation,
    );
    const finalCandidate = attachMatchIntentAssessment(attachNarrativeAssessment(enforceGeneratedPlacementLegality(reconcileNarrativeNaturalismSurface(ecologizedCandidate)), candidateRecipe), candidateRecipe);
    const starts = finalCandidate.startLocations.filter((start) => !start.cityState).length;
    const water = finalCandidate.tiles.filter((tile) => tile.terrain < 2).length / Math.max(1, finalCandidate.tiles.length) * 100;
    const passable = finalCandidate.tiles.filter((tile) => tile.terrain >= 2 && tile.elevation < 2).length;
    const candidateAssessment = finalCandidate.structure?.narrativeAssessment;
    const candidateProgram = finalCandidate.structure?.narrativeProgram;
    const candidateSemanticModel = candidateProgram ? extractNarrativeSemantics(finalCandidate) : undefined;
    const candidateEvaluation = candidateProgram && candidateSemanticModel ? evaluateNarrativeConstraintProgram(candidateProgram, candidateSemanticModel, relaxationIds) : undefined;
    const hardFailures = candidateEvaluation?.findings.filter((finding) => (finding.strength === "ESSENTIAL" || finding.strength === "PROHIBITED") && (finding.status === "FAILED" || finding.status === "UNAVAILABLE")).length ?? Number.MAX_SAFE_INTEGER;
    const candidateAdapter = finalCandidate.structure?.narrativeAdapter;
    const nativeEvidence = candidateProgram && candidateSemanticModel && candidateAdapter && finalCandidate.structure
      ? evaluateNarrativeNativeEvidence({ ...finalCandidate, structure: { ...finalCandidate.structure, narrativeSemanticModel: candidateSemanticModel } }, candidateProgram, candidateAdapter)
      : undefined;
    const preservedInvariantIds = new Set(
      relaxationIds.flatMap((id) => candidateProgram?.generative?.relaxationPolicy.find((step) => step.id === id)?.preserves ?? []),
    );
    if (!preservedInvariantIds.size) for (const invariant of candidateProgram?.generative?.invariants ?? []) preservedInvariantIds.add(invariant.id);
    const invariantFindings = new Map(nativeEvidence?.findings.map((finding) => [finding.invariantId, finding]) ?? []);
    const invariantFailureIds = candidateProgram && nativeEvidence
      ? [...preservedInvariantIds].filter((id) => invariantFindings.get(id)?.status !== "PROVEN")
      : ["native-evidence-unavailable"];
    const invariantFailures = invariantFailureIds.length;
    const invariantFailureDetails = invariantFailureIds.flatMap((id) => invariantFindings.get(id)?.evidence ?? [`No native evidence was available for ${id}.`]);
    const candidatePlan = finalCandidate.structure?.narrativeNativePlan;
    const contentEvidence = candidateProgram
      ? evaluateNarrativeContentEvidence(finalCandidate, candidateProgram, candidatePlan?.contract)
      : undefined;
    const contentFailures = contentEvidence?.status === "FAILED" ? 1 : 0;
    const contentFailureDetails = contentEvidence?.findings
      .filter((finding) => finding.status === "FAILED")
      .map((finding) => `${finding.id}: ${finding.evidence}`) ?? [];
    const naturalismEvidence = candidateProgram ? evaluateNarrativeNaturalism(finalCandidate, candidateProgram) : undefined;
    const naturalismFailures = naturalismEvidence?.findings.filter((finding) => finding.status === "FAILED").length ?? Number.MAX_SAFE_INTEGER;
    const naturalismFailureDetails = naturalismEvidence?.findings
      .filter((finding) => finding.status === "FAILED")
      .map((finding) => `${finding.id}: ${finding.evidence}`) ?? ["Naturalism evidence is unavailable."];
    const legalityErrors = validateCiv5Map(finalCandidate).filter((issue) => issue.severity === "ERROR").length;
    const expectedNativeRelaxations = candidateProgram ? nativeRelaxationIds(candidateProgram, relaxationIds) : [];
    const actualNativeRelaxations = candidatePlan?.appliedRelaxations.map((step) => step.id) ?? [];
    const nativeGrammarFailures = expectedNativeRelaxations.length === actualNativeRelaxations.length
      && expectedNativeRelaxations.every((id, index) => actualNativeRelaxations[index] === id) ? 0 : 1;
    const adjustment = candidatePlan?.populationAdjustment ?? { reduceMajorsBy: 0, minimumMajors: 2, cityStateFraction: 1 };
    const requestedStarts = requestedMajorPopulation(options.players);
    const expectedStarts = narrativePopulationTarget(requestedStarts, adjustment);
    const actualCityStates = finalCandidate.startLocations.filter((start) => start.cityState).length;
    const requestedCityStates = requestedCityStatePopulation(options.cityStates);
    const expectedCityStates = narrativeCityStateTarget(requestedCityStates, adjustment);
    const capacityPolicy = candidateProgram?.generative?.gameplay.capacityPolicy ?? "PRESERVE_POPULATION";
    const populationSteps = candidateProgram?.generative?.relaxationPolicy.filter((step) => step.operations.some((operation) => operation.kind === "REDUCE_POPULATION")) ?? [];
    const activePopulationOperations = candidatePlan?.appliedRelaxations.flatMap((step) => step.operations).filter((operation) => operation.kind === "REDUCE_POPULATION") ?? [];
    const populationFloor = Math.min(requestedStarts, Math.max(2, activePopulationOperations.reduce((minimum, operation) => operation.kind === "REDUCE_POPULATION" ? Math.max(minimum, operation.minimum) : minimum, 2)));
    // A contract-level capacity policy may handle an impossible roster directly
    // only when no authored population step reserves that decision for later in
    // the ordered relaxation sequence. Once such a step exists, it must be active.
    const populationReductionAuthorized = capacityPolicy === "REDUCE_POPULATION"
      && (populationSteps.length === 0 || activePopulationOperations.length > 0);
    const startDeficit = starts < expectedStarts && !(populationReductionAuthorized && starts >= populationFloor)
      ? expectedStarts - starts
      : 0;
    const populationExcess = Math.max(0, starts - expectedStarts);
    const activeCityStateReduction = (candidatePlan?.appliedRelaxations.some((step) => step.operations.some((operation) => operation.kind === "REDUCE_CITY_STATES")) ?? false);
    const cityStateReductionAuthorized = capacityPolicy === "REDUCE_CITY_STATES" || activeCityStateReduction;
    const cityStateDeficit = actualCityStates < expectedCityStates && !cityStateReductionAuthorized
      ? expectedCityStates - actualCityStates
      : 0;
    const cityStateExcess = Math.max(0, actualCityStates - expectedCityStates);
    const capacityFailures = startDeficit + populationExcess + cityStateDeficit + cityStateExcess;
    const relevantVictories = finalCandidate.structure?.matchAssessment?.victories.filter((finding) => finding.state === "EMPHASIZED") ?? [];
    const matchScore = relevantVictories.length ? relevantVictories.reduce((sum, finding) => sum + finding.score, 0) / relevantVictories.length : 0;
    const score = (starts === expectedStarts ? 10000 : starts * 100)
      - Math.abs(water - options.waterPercent) * 5
      + passable / Math.max(1, finalCandidate.tiles.length) * 100
      + (candidateAssessment ? narrativeCandidateScore(candidateAssessment) * 2 : 0)
      + (contentEvidence?.score ?? 0)
      + matchScore;
    // Authority is lexicographic. Invariants survive every authored weakening;
    // a high aggregate score cannot conceal an invalid map, missing population,
    // native invariant failure, or unrelaxed semantic floor.
    const key = [legalityErrors, capacityFailures, nativeGrammarFailures, invariantFailures, naturalismFailures, hardFailures, contentFailures, relaxationIds.length, -(naturalismEvidence?.score ?? 0), -(candidateEvaluation?.score ?? 0), -(nativeEvidence?.score ?? 0), -matchScore, -score, candidate];
    return { map: candidateMap, recipe: candidateRecipe, key, candidate, legalityErrors, capacityFailures, nativeGrammarFailures, hardFailures, invariantFailures, invariantFailureIds, invariantFailureDetails, contentFailures, contentFailureDetails, naturalismFailures, naturalismFailureDetails, relaxationIds: [...relaxationIds], snapshots };
  };
  const authoritative = (candidate: CandidateSelection) => candidate.key.slice(0, 7).every((value) => value === 0);
  const failureMessage = (candidate: CandidateSelection | undefined, errors: readonly string[]) => {
    const details = candidate ? [
      `${candidate.legalityErrors} legality error(s)`,
      `${candidate.capacityFailures} unauthorized capacity deficit(s)`,
      `${candidate.nativeGrammarFailures} native-prefix mismatch(es)`,
      `${candidate.invariantFailures} unproven preserved invariant(s)${candidate.invariantFailureIds.length ? ` (${candidate.invariantFailureIds.join(", ")})` : ""}${candidate.invariantFailureDetails.length ? `: ${candidate.invariantFailureDetails.join(" | ")}` : ""}`,
      `${candidate.naturalismFailures} final naturalism contradiction(s)${candidate.naturalismFailureDetails.length ? ` (${candidate.naturalismFailureDetails.join(" | ")})` : ""}`,
      `${candidate.hardFailures} unrelaxed semantic failure(s)`,
      `${candidate.contentFailures} content-floor failure(s)${candidate.contentFailureDetails.length ? ` (${candidate.contentFailureDetails.join(" | ")})` : ""}`,
    ] : ["no candidate map was produced"];
    const generationDetail = errors.length ? ` Native generation reported: ${[...new Set(errors)].join(" | ")}` : "";
    return `Narrative generation could not install a lawful ${recipe.mapType} candidate after exhausting its authored relaxation policy: ${details.join("; ")}.${generationDetail}`;
  };
  let selected: CandidateSelection | undefined;
  let relaxationIds = [...(control?.narrativeRelaxationIds ?? [])];
  const relaxationOrder: readonly NarrativeNativeRelaxationStep[] = narrativeNativeContract(recipe.mapType).relaxationPolicy;
  if (relaxationIds.some((id, index) => relaxationOrder[index]?.id !== id)) {
    throw new Error(`Narrative relaxation for ${recipe.mapType} must use its authored ordered prefix.`);
  }
  let level = relaxationIds.length;
  let lastCandidate: CandidateSelection | undefined;
  const generationErrors: string[] = [];
  while (true) {
    const nativeRetryLevel = relaxationIds.filter((id) => relaxationOrder.find((step) => step.id === id)?.mode !== "ACCEPT_ANTI_MOTIF_RISK").length;
    const candidatesThisLevel = nativeRetryLevel === 0 ? session.candidateCount : recipe.effort === "EXHAUSTIVE" ? 2 : 1;
    let bestAtLevel: CandidateSelection | undefined;
    for (let candidate = 1; candidate <= candidatesThisLevel; candidate += 1) {
      const candidateSeed = nativeRetryLevel === 0 && session.candidateCount === 1
        ? options.seed
        : `${options.seed}:${nativeRetryLevel ? `relax-${nativeRetryLevel}:` : ""}candidate-${candidate}`;
      session.progress("TOPOLOGY", nativeRetryLevel
        ? `Retrying native grammar with relaxation ${nativeRetryLevel}, candidate ${candidate} of ${candidatesThisLevel}`
        : `Building deterministic candidate ${candidate} of ${session.candidateCount}`, candidate);
      const candidateSnapshots: EngineNarrativeStageSnapshot[] = [];
      const candidateControl: GenerationControl = {
        isCancelled: control?.isCancelled,
        constraints: control?.constraints,
        narrativeRelaxationIds: relaxationIds,
        onEngineNarrativeStage: (snapshot) => candidateSnapshots.push(snapshot),
      };
      try {
        const candidateMap = generateMapInternal({ ...options, seed: candidateSeed }, (stage) => {
          // Candidate work is observable progress, but it is not completed pass
          // provenance until a candidate has passed the authority boundary.
          const passId = passForStage(stage);
          const definition = byId.get(passId);
          if (!definition) return;
          session.checkCancelled();
          onProgress?.(stage, {
            passId,
            passVersion: definition.version,
            stage,
            completedPasses: completed().size,
            totalPasses: GENERATION_PASS_DEFINITIONS.length,
            candidate,
            candidateCount: session.candidateCount,
          });
        }, recipe.scale, recipe, candidateControl);
        session.checkCancelled();
        const candidateRecipe = { ...recipe, settings: { ...recipe.settings, seed: candidateSeed } };
        const assessed = assessCandidate(candidateMap, candidateRecipe, relaxationIds, candidate, candidateSnapshots);
        if (!bestAtLevel || betterKey(assessed.key, bestAtLevel.key)) bestAtLevel = assessed;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        session.checkCancelled();
        generationErrors.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (bestAtLevel) {
      lastCandidate = bestAtLevel;
      if (authoritative(bestAtLevel)) { selected = bestAtLevel; break; }
    }
    let next = relaxationOrder[level];
    // Anti-motif acceptance weakens only the evaluator's claim. It must not
    // change a seed, rerun an engine, or appear as an applied native operation.
    while (next?.mode === "ACCEPT_ANTI_MOTIF_RISK") {
      relaxationIds = [...relaxationIds, next.id];
      level += 1;
      if (lastCandidate) {
        session.progress("TOPOLOGY", `Disclosing ${next.label.toLowerCase()} without regenerating native geography`, lastCandidate.candidate);
        lastCandidate = assessCandidate(lastCandidate.map, lastCandidate.recipe, relaxationIds, lastCandidate.candidate, lastCandidate.snapshots);
        if (authoritative(lastCandidate)) { selected = lastCandidate; break; }
      }
      next = relaxationOrder[level];
    }
    if (selected) break;
    if (!next) throw new Error(failureMessage(lastCandidate, generationErrors));
    relaxationIds = [...relaxationIds, next.id];
    level += 1;
  }
  selectedCandidate = selected.candidate;
  const selectedGeneration = selected.map.generation
    ? { ...selected.map.generation, seed: options.seed, dominantTerrains: [...selected.map.generation.dominantTerrains] }
    : { ...options, dominantTerrains: [...options.dominantTerrains] };
  const generated: Civ5Map = { ...selected.map, generation: selectedGeneration };
  if (control?.onEngineNarrativeStage) for (const snapshot of selected.snapshots) control.onEngineNarrativeStage(structuredClone(snapshot));
  const selectedNarrativeRelaxations = [...selected.relaxationIds];
  session.complete("TOPOLOGY", [
    `Selected deterministic candidate ${selectedCandidate} after ${selectedNarrativeRelaxations.length} authored native relaxation${selectedNarrativeRelaxations.length === 1 ? "" : "s"}.`,
    `${selected.invariantFailures} invariant, ${selected.naturalismFailures} naturalism, ${selected.hardFailures} semantic, and ${selected.contentFailures} content floor failures remain.`,
  ], selectedCandidate);
  const surfaced = applyWorldArchetype(generated, recipe.archetype, recipe.archetypeIntensity);
  const ecologized = recipe.archetypeIntensity === "TRANSFORMATIVE" ? applyArchetypeContentEcology(surfaced, recipe.archetype) : surfaced;
  if (ecologized.generation && ecologized.structure) applyNarrativeBrutalFrontierContent(
    ecologized.tiles,
    ecologized.features,
    ecologized.startLocations,
    ecologized.width,
    ecologized.height,
    ecologized.wraps,
    ecologized.structure.narrativeNativePlan?.contract ?? ecologized.structure.narrativeProgram?.generative,
    ecologized.structure,
    ecologized.generation,
  );
  const evaluatedMapBase = attachMatchIntentAssessment(attachNarrativeAssessment(enforceGeneratedPlacementLegality(reconcileNarrativeNaturalismSurface(ecologized)), recipe), recipe);
  const retainedProgram = evaluatedMapBase.structure?.narrativeProgram;
  const semanticModel = retainedProgram ? extractNarrativeSemantics(evaluatedMapBase) : undefined;
  const appliedNarrativeRelaxations = selectedNarrativeRelaxations;
  const semanticEvaluation = retainedProgram && semanticModel
    ? evaluateNarrativeConstraintProgram(retainedProgram, semanticModel, appliedNarrativeRelaxations)
    : undefined;
  const legalityIssues = validateCiv5Map(evaluatedMapBase).filter((issue) => issue.severity !== "INFO");
  const errors = legalityIssues.filter((issue) => issue.severity === "ERROR");
  const adapter = evaluatedMapBase.structure?.narrativeAdapter;
  const effectiveAdapter = adapter && retainedProgram ? {
    ...adapter,
    relaxations: [...new Set([
      ...adapter.relaxations,
      ...appliedNarrativeRelaxations.flatMap((relaxationId) => {
        const relaxation = retainedProgram.relaxationOrder.find((candidate) => candidate.id === relaxationId);
        return relaxation ? [`${relaxation.label}: ${relaxation.consequence}`] : [];
      }),
    ])],
  } : adapter;
  const nativeEvidence = retainedProgram && effectiveAdapter && evaluatedMapBase.structure
    ? evaluateNarrativeNativeEvidence(
      { ...evaluatedMapBase, structure: { ...evaluatedMapBase.structure, narrativeSemanticModel: semanticModel } },
      retainedProgram,
      effectiveAdapter,
    )
    : undefined;
  const contentEvidence = retainedProgram
    ? evaluateNarrativeContentEvidence(evaluatedMapBase, retainedProgram, evaluatedMapBase.structure?.narrativeNativePlan?.contract)
    : undefined;
  const naturalismEvidence = retainedProgram
    ? evaluateNarrativeNaturalism(evaluatedMapBase, retainedProgram)
    : undefined;
  const finalPreservedInvariantIds = new Set(
    appliedNarrativeRelaxations.flatMap((id) => retainedProgram?.generative?.relaxationPolicy.find((step) => step.id === id)?.preserves ?? []),
  );
  if (!finalPreservedInvariantIds.size) for (const invariant of retainedProgram?.generative?.invariants ?? []) finalPreservedInvariantIds.add(invariant.id);
  const finalInvariantFindings = new Map(nativeEvidence?.findings.map((finding) => [finding.invariantId, finding]) ?? []);
  const finalUnprovenInvariants = [...finalPreservedInvariantIds].filter((id) => finalInvariantFindings.get(id)?.status !== "PROVEN");
  const finalHardFailures = semanticEvaluation?.findings.filter((finding) => (finding.strength === "ESSENTIAL" || finding.strength === "PROHIBITED") && (finding.status === "FAILED" || finding.status === "UNAVAILABLE")) ?? [];
  const finalExpectedNativeRelaxations = retainedProgram ? nativeRelaxationIds(retainedProgram, appliedNarrativeRelaxations) : [];
  const finalActualNativeRelaxations = evaluatedMapBase.structure?.narrativeNativePlan?.appliedRelaxations.map((step) => step.id) ?? [];
  const finalNativePrefixMatches = finalExpectedNativeRelaxations.length === finalActualNativeRelaxations.length
    && finalExpectedNativeRelaxations.every((id, index) => finalActualNativeRelaxations[index] === id);
  const finalContentFailure = contentEvidence?.status === "FAILED";
  const finalNaturalismFailures = naturalismEvidence?.findings.filter((finding) => finding.status === "FAILED") ?? [];
  if (errors.length || !retainedProgram || !nativeEvidence || !naturalismEvidence || finalUnprovenInvariants.length || finalNaturalismFailures.length || finalHardFailures.length || finalContentFailure || !finalNativePrefixMatches) {
    throw new Error(`Selected narrative candidate violated the authority boundary after finalization: ${errors.length} legality error(s), ${finalUnprovenInvariants.length} unproven preserved invariant(s), ${finalNaturalismFailures.length} final naturalism contradiction(s), ${finalHardFailures.length} hard semantic failure(s), ${finalContentFailure ? 1 : 0} content-floor failure(s), and ${finalNativePrefixMatches ? 0 : 1} native-prefix mismatch(es).`);
  }
  const retainedCauseShare = adapter ? adapter.causalObjects.filter((cause) => cause.retained).length / Math.max(1, adapter.causalObjects.length) : 0;
  const boundNativeObjects = evaluatedMapBase.structure ? Math.max(
    evaluatedMapBase.structure.diagnostics.nativeGraphBoundObjects ?? 0,
    evaluatedMapBase.structure.diagnostics.nativePhysicalBoundObjects ?? 0,
    evaluatedMapBase.structure.diagnostics.nativeStrategicBoundObjects ?? 0,
    evaluatedMapBase.structure.diagnostics.nativeFieldBoundObjects ?? 0,
  ) : 0;
  const bindingShare = adapter ? Math.min(1, boundNativeObjects / Math.max(1, adapter.causalObjects.length)) : 0;
  const causalScore = adapter ? Math.max(0, Math.min(100, Math.round(48 + retainedCauseShare * 27 + bindingShare * 25 - adapter.diagnostics.missingExplicitEffects * 4))) : 0;
  const engineScore = nativeEvidence ? Math.round(nativeEvidence.score * 0.72 + causalScore * 0.28) : causalScore;
  const contentIsApplicable = Boolean(contentEvidence && contentEvidence.status !== "NOT_APPLICABLE");
  const narrativeReviewParts = [
    ...(semanticEvaluation ? [{ score: semanticEvaluation.score, weight: 0.78 }] : []),
    ...(contentIsApplicable && contentEvidence ? [{ score: contentEvidence.score, weight: 0.22 }] : []),
  ];
  const narrativeReviewWeight = narrativeReviewParts.reduce((sum, part) => sum + part.weight, 0);
  const narrativeReviewScore = narrativeReviewWeight
    ? Math.round(narrativeReviewParts.reduce((sum, part) => sum + part.score * part.weight, 0) / narrativeReviewWeight)
    : 0;
  const narrativeReviewStatus = !semanticEvaluation
    ? "UNASSESSED" as const
    : semanticEvaluation?.status === "FAILED" || contentEvidence?.status === "FAILED"
      ? "FAIL" as const
      : semanticEvaluation?.status === "SATISFIED" && (!contentIsApplicable || contentEvidence?.status === "SATISFIED")
        ? "PASS" as const
        : "WEAK" as const;
  const reviewEvidence = {
    schemaVersion: 1 as const,
    legal: {
      status: errors.length ? "FAIL" as const : legalityIssues.length ? "WEAK" as const : "PASS" as const,
      score: errors.length ? 0 : legalityIssues.length ? 75 : 100,
      summary: errors.length ? `${errors.length} blocking Civ V legality issue${errors.length === 1 ? "" : "s"}.` : legalityIssues.length ? `${legalityIssues.length} non-blocking legality warning${legalityIssues.length === 1 ? "" : "s"}.` : "Civ V structure and generated placements pass validation.",
      details: legalityIssues.map((issue) => issue.message),
    },
    narrative: {
      status: narrativeReviewStatus,
      score: narrativeReviewScore,
      summary: semanticEvaluation
        ? `${retainedProgram!.identity.label} semantic contract is ${semanticEvaluation.status.toLowerCase()}; ${contentIsApplicable ? `its ${contentEvidence!.pattern.toLowerCase().replaceAll("_", " ")} obligation is ${contentEvidence!.status.toLowerCase()}` : "identity-specific content is not applicable"}.`
        : contentIsApplicable
          ? `No current semantic evaluation is available; the ${contentEvidence!.pattern.toLowerCase().replaceAll("_", " ")} content obligation is ${contentEvidence!.status.toLowerCase()}.`
          : "No current semantic or identity-specific content evaluation is available.",
      details: [
        ...(semanticEvaluation?.findings.filter((finding) => finding.status !== "MET").map((finding) => `${finding.label}: ${finding.status.toLowerCase()}.`) ?? []),
        ...(contentEvidence?.findings.filter((finding) => finding.status === "WEAK" || finding.status === "FAILED").map((finding) => `${finding.label}: ${finding.status.toLowerCase()}. ${finding.evidence}`) ?? []),
      ],
    },
    engine: {
      status: adapter && nativeEvidence?.status !== "FAILED" && nativeEvidence?.status !== "UNAVAILABLE" && engineScore >= 75 ? "PASS" as const : adapter && nativeEvidence?.status !== "FAILED" ? "WEAK" as const : "FAIL" as const,
      score: engineScore,
      summary: adapter ? `${nativeEvidence?.findings.filter((finding) => finding.status === "PROVEN").length ?? 0} of ${nativeEvidence?.findings.length ?? 0} defining native invariants are proven; ${boundNativeObjects} final objects retain engine bindings.` : "No native adapter evidence is retained.",
      details: adapter ? [
        `${adapter.adapter.toLowerCase().replaceAll("_", " ")} native plan`,
        `${adapter.diagnostics.nativeReservations} reservations; ${adapter.diagnostics.missingExplicitEffects} missing explicit effects.`,
        ...(nativeEvidence?.findings.map((finding) => `${finding.requirement}: ${finding.status.toLowerCase()}. ${finding.evidence.join(" ")}`) ?? []),
      ] : [],
    },
    naturalism: {
      status: naturalismEvidence.status === "FAILED" ? "FAIL" as const : naturalismEvidence.status === "WEAKENED" ? "WEAK" as const : "PASS" as const,
      score: naturalismEvidence.score,
      summary: naturalismEvidence.status === "SATISFIED"
        ? "Final geography passes the automated morphology and causal-surface naturalism floor."
        : naturalismEvidence.status === "WEAKENED"
          ? "Final geography is lawful but retains disclosed morphology or causal-surface risks."
          : "Final geography contains a blocking morphology or causal-surface contradiction.",
      details: [
        ...naturalismEvidence.findings.filter((finding) => finding.status !== "MET").map((finding) => `${finding.label}: ${finding.status.toLowerCase()}. ${finding.evidence}`),
        ...naturalismEvidence.limitations,
      ],
    },
    perceptual: {
      status: "UNASSESSED" as const,
      score: 0,
      summary: "Blind recognition has not been measured for this generation.",
      details: ["Use the Identity Lab and export its judgement; structural asymmetry is not treated as perceptual evidence."],
    },
    relaxations: [...new Set([...(effectiveAdapter?.relaxations ?? []), ...(retainedProgram?.conflicts.map((conflict) => `${conflict.control} weakens the preferred envelope.`) ?? [])])],
  };
  const map = evaluatedMapBase.structure ? { ...evaluatedMapBase, structure: { ...evaluatedMapBase.structure, narrativeAdapter: effectiveAdapter, narrativeSemanticModel: semanticModel, narrativeNativeEvidence: nativeEvidence, narrativeContentEvidence: contentEvidence, narrativeNaturalismEvidence: naturalismEvidence, narrativeEvaluation: semanticEvaluation, reviewEvidence } } : evaluatedMapBase;
  control?.onEngineNarrativeStage?.(snapshotEngineNarrativeStage("FINAL", observableFromMap(map), map.width, map.height, map.wraps));
  if (!completed().has("TOPOLOGY")) session.complete("TOPOLOGY", [], selectedCandidate);
  for (const passId of ["RELIEF", "CLIMATE", "ACCESSIBILITY", "STARTS", "CONTENT", "HYDROLOGY"] as const) {
    if (!completed().has(passId)) {
      ensurePassDependencies(passId);
      session.progress(passId, passLabel(passId), selectedCandidate);
      session.complete(passId, [], selectedCandidate);
    }
  }
  session.progress("LEGALITY", "Validating generated map");
  session.complete("LEGALITY");
  session.progress("SEMANTIC_IDENTITY", "Retaining semantic geography");
  const engineNarrativeEvidence = map.structure?.engineNarrativeEvidence
    ? appendEngineNarrativeEvidence(
      map.structure.engineNarrativeEvidence,
      captureEngineNarrativeStage("FINAL", observableFromMap(map), map.width, map.height, map.wraps),
      compareEngineNarrativeStages("LEGAL_NORMALIZED", "FINAL", observableFromMap(generated), observableFromMap(map)),
    )
    : undefined;
  const structure = map.structure
    ? attachSemanticIdentities({ ...map.structure, engineNarrativeEvidence }, map.width, map.height)
    : undefined;
  session.complete("SEMANTIC_IDENTITY");
  const provenance = session.finish();
  return {
    ...map,
    recipe,
    structure: structure ? { ...structure, inputHash: session.inputHash, generatorVersion: GENERATION_PIPELINE_VERSION, provenance, passEvidence: generationPassEvidence(provenance, session.inputHash), evidenceState: "CURRENT" as const, staleReason: undefined } : undefined,
  };
}

export function generateMapFromRecipe(recipe: GenerationRecipe, onProgress?: GenerationProgressListener, control?: GenerationControl): Civ5Map {
  return generateMapWithRecipe(recipe, onProgress, control);
}

export function generateMap(options: MapGenerationOptions, onProgress?: GenerationProgressListener, control?: GenerationControl): Civ5Map {
  const normalized = { ...DEFAULT_GENERATION_OPTIONS, ...options, dominantTerrains: [...(options.dominantTerrains ?? DEFAULT_GENERATION_OPTIONS.dominantTerrains)] };
  return generateMapWithRecipe(generationRecipeFromOptions(normalized), onProgress, control);
}

/** Build one native candidate for callers with their own final acceptance contract.
 * This deliberately does not claim the legacy narrative proof or select retries.
 * Native geography, placement rules and engine-specific construction are retained. */
export function generateMapFoundation(recipe: GenerationRecipe, onProgress?: (stage: string) => void, control?: GenerationControl): Civ5Map {
  return generateMapInternal(generationOptionsFromRecipe(recipe), onProgress, recipe.scale, recipe, control);
}
