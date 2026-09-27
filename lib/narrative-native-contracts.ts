import type { GenerationEngine, MapPresetId } from "./map-generator.ts";

export type NarrativeGrammarFamily =
  | "FIELD_CROOKED_CONTINENTS"
  | "FIELD_FRACTURED_PANGAEA"
  | "FIELD_DROWNED_SHELVES"
  | "FIELD_LAKE_KINGDOMS"
  | "FIELD_ISLAND_CONTINENTS"
  | "FIELD_DEEP_OCEAN_DIVIDES"
  | "FIELD_LAND_SEA_MAZE"
  | "FIELD_PATCHWORK_PROVINCES"
  | "GRAPH_ECOLOGICAL_TRANSECT"
  | "GRAPH_PLATE_ATLAS"
  | "GRAPH_GREAT_WATERSHEDS"
  | "GRAPH_INLAND_SEA_CROSSROADS"
  | "GRAPH_WONDER_HEARTLANDS"
  | "GRAPH_ENCIRCLED_SEAS"
  | "GRAPH_SCARRED_PANGAEA"
  | "GRAPH_RIFT_LATTICE"
  | "GRAPH_LONELY_OCEANS"
  | "GRAPH_GREAT_PENINSULAS"
  | "GRAPH_BROKEN_ISLAND_CHAINS"
  | "PHYSICAL_DYNAMIC_EARTH"
  | "PHYSICAL_COLLISION"
  | "PHYSICAL_ANCIENT_SHIELDS"
  | "PHYSICAL_VOLCANIC_ARCS"
  | "PHYSICAL_INLAND_SUPERCONTINENT"
  | "PHYSICAL_MONSOON"
  | "PHYSICAL_GLACIAL"
  | "POLIS_IMPERIAL_RING"
  | "POLIS_OPPOSING_FRONTS"
  | "POLIS_CONTESTED_HEARTLAND"
  | "POLIS_RIVAL_CONTINENTS"
  | "POLIS_THREE_REALMS"
  | "POLIS_THALASSIC_LEAGUE"
  | "POLIS_UNEQUAL_REALMS";

export type NarrativeContentPattern =
  | "DISTRIBUTED"
  | "SHELF_ANCHORS"
  | "INLAND_WATER_ECONOMY"
  | "MARITIME_REALMS"
  | "RIVER_VALLEYS"
  | "MYTHIC_HEARTS"
  | "ISOLATED_SCARCITY"
  | "COLD_FRONTIER"
  | "CONTESTED_CENTRE"
  | "NAVAL_NETWORK"
  | "ROLE_ASYMMETRY";

export type NarrativeSitePolicy = Readonly<{
  activationCharacter: "BRUTAL";
  theatre: "CONTESTED_DMZ";
  barbarianShare: number;
  ruinShare: number;
  siteSpacing: number;
  falloutDensity: number;
  falloutMaximum: number;
  falloutStartBuffer: number;
}>;

export type NarrativeInvariantCategory = "TOPOLOGY" | "ACCESSIBILITY" | "HYDROLOGY" | "CAPACITY" | "CAUSALITY" | "STRATEGY";
export type NarrativeInvariantProofStage = "NATIVE_PLAN" | "LEGAL_NORMALIZED" | "STRATEGIC_GRAPH";

/** A defining relationship which an authored relaxation may not silently discard.
 * If an invariant cannot be proven, the candidate does not express this identity. */
export type NarrativeNativeInvariant = Readonly<{
  id: string;
  category: NarrativeInvariantCategory;
  proofStage: NarrativeInvariantProofStage;
  requirement: string;
}>;

export type NarrativeNativeRelaxationOperation =
  | Readonly<{ kind: "REDUCE_PRIMARY_SYSTEMS"; by: number; minimum: number }>
  | Readonly<{ kind: "REDUCE_HIERARCHY"; by: 1; minimum: 1 | 2 | 3 }>
  | Readonly<{ kind: "REDUCE_FRAGMENTATION"; by: number; minimum: number }>
  | Readonly<{ kind: "WIDEN_CONNECTIONS"; by: number }>
  | Readonly<{ kind: "CONTRACT_WATER_SYSTEMS"; by: number }>
  | Readonly<{ kind: "SOFTEN_RELIEF"; by: number; minimum: number }>
  | Readonly<{ kind: "SOFTEN_CLIMATE"; by: number; minimum: number }>
  | Readonly<{ kind: "REDUCE_HYDROLOGY_BRANCHING"; catchmentsBy: number; tributariesBy: number }>
  | Readonly<{ kind: "REDUCE_OBJECTIVES"; by: number; minimum: number }>
  | Readonly<{ kind: "REDUCE_CITY_STATES"; fraction: number }>
  | Readonly<{ kind: "REDUCE_POPULATION"; by: number; minimum: number }>
  | Readonly<{ kind: "SOFTEN_CONTENT_CONTRAST"; by: number; minimum: number }>
  | Readonly<{ kind: "ACCEPT_ANTI_MOTIF_RISK"; motifId: string }>;

export type NarrativeNativeRelaxationStep = Readonly<{
  id: string;
  label: string;
  constraintIds: readonly string[];
  consequence: string;
  mode: "RETRY_NATIVE_GRAMMAR" | "WEAKEN_IDENTITY" | "ACCEPT_ANTI_MOTIF_RISK";
  operations: readonly NarrativeNativeRelaxationOperation[];
  preserves: readonly string[];
}>;

export type NarrativeGenerativeContract = Readonly<{
  schemaVersion: 1;
  profileId: MapPresetId;
  engine: GenerationEngine;
  family: NarrativeGrammarFamily;
  topology: Readonly<{
    primarySystems: readonly [number, number];
    hierarchyDepth: 1 | 2 | 3 | 4;
    connectivity: "SINGLE" | "FEW" | "MANY" | "PLAYER_REALMS" | "STRATEGIC";
    waterMode: "OPEN" | "ENCLOSED" | "RIFTED" | "MIXED" | "SCARCE";
    fragmentation: number;
    anisotropy: number;
    edgePolicy: "OPEN" | "LAND" | "WATER" | "NARRATIVE";
  }>;
  relief: Readonly<{
    mode: "ENGINE" | "BOUNDARY" | "PERIPHERAL" | "COLLISION" | "VOLCANIC" | "ERODED" | "GLACIAL";
    alignment: number;
    continuity: number;
    minimumPasses: number;
    peripheralCoverage: number;
  }>;
  climate: Readonly<{
    mode: "ENGINE" | "REGIONAL_COLLECTIONS" | "TRANSECT" | "MONSOON" | "GLACIAL" | "DISSONANT";
    minimumTransitions: number;
    contrast: number;
    latitudeAuthority: number;
    prevailingWind: "ENGINE" | "WEST_EAST" | "SEASONAL";
  }>;
  hydrology: Readonly<{
    mode: "ENGINE" | "HIERARCHICAL" | "ENDORHEIC" | "MONSOON" | "LOCAL";
    minimumCatchments: number;
    minimumTributaries: number;
    outlet: "LEGAL_WATER" | "INTERIOR_BASIN" | "MIXED";
  }>;
  gameplay: Readonly<{
    realmMode: "GEOGRAPHIC" | "ONE_PER_MAJOR" | "TEAMS" | "ROLE_CONTRACTS";
    minimumObjectives: number;
    routeRedundancy: number;
    minimumStartDistance: number;
    navalDependence: number;
    capacityPolicy: "REDUCE_CITY_STATES" | "REDUCE_POPULATION" | "PRESERVE_POPULATION";
  }>;
  content: Readonly<{
    pattern: NarrativeContentPattern;
    valueContrast: number;
    wonderBias: number;
    coastalValue: number;
    hostileFrontierValue: number;
    cityStateContestability: number;
    sitePolicy?: NarrativeSitePolicy;
  }>;
  invariants: readonly NarrativeNativeInvariant[];
  relaxationPolicy: readonly NarrativeNativeRelaxationStep[];
  causalRequirements: readonly string[];
  softPreferences: readonly string[];
}>;

type ContractSeed = Omit<NarrativeGenerativeContract, "schemaVersion" | "profileId" | "engine">;

const base = (family: NarrativeGrammarFamily, overrides: Partial<Omit<ContractSeed, "family">> = {}): ContractSeed => ({
  family,
  topology: { primarySystems: [2, 6], hierarchyDepth: 2, connectivity: "FEW", waterMode: "MIXED", fragmentation: 0.45, anisotropy: 0.55, edgePolicy: "NARRATIVE" },
  relief: { mode: "ENGINE", alignment: 0.55, continuity: 0.55, minimumPasses: 2, peripheralCoverage: 0 },
  climate: { mode: "ENGINE", minimumTransitions: 2, contrast: 0.5, latitudeAuthority: 0.7, prevailingWind: "ENGINE" },
  hydrology: { mode: "ENGINE", minimumCatchments: 1, minimumTributaries: 0, outlet: "LEGAL_WATER" },
  gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 0, routeRedundancy: 1, minimumStartDistance: 5, navalDependence: 0.35, capacityPolicy: "PRESERVE_POPULATION" },
  content: { pattern: "DISTRIBUTED", valueContrast: 0.1, wonderBias: 0, coastalValue: 0.25, hostileFrontierValue: 0, cityStateContestability: 0.5 },
  invariants: [],
  relaxationPolicy: [],
  causalRequirements: [],
  softPreferences: [],
  ...overrides,
});

const EXCOGITARE: Record<Extract<MapPresetId, "CONTINENTS" | "PANGAEA" | "ARCHIPELAGO" | "INLAND_SEAS" | "EARTHSEA" | "RIFT_REALMS" | "LABYRINTH" | "WILD_REGIONS">, ContractSeed> = {
  CONTINENTS: base("FIELD_CROOKED_CONTINENTS", {
    topology: { primarySystems: [3, 5], hierarchyDepth: 3, connectivity: "FEW", waterMode: "OPEN", fragmentation: 0.48, anisotropy: 0.9, edgePolicy: "WATER" },
    relief: { mode: "BOUNDARY", alignment: 0.72, continuity: 0.48, minimumPasses: 3, peripheralCoverage: 0 },
    causalRequirements: ["continental cores precede maritime intrusions", "crooked lobes retain robust interiors", "false proximity arises from coast and relief"],
    softPreferences: ["nested gulfs", "fjord-like intrusions", "shed shelf islands", "irregular interior travel"],
  }),
  PANGAEA: base("FIELD_FRACTURED_PANGAEA", {
    topology: { primarySystems: [1, 1], hierarchyDepth: 3, connectivity: "SINGLE", waterMode: "MIXED", fragmentation: 0.28, anisotropy: 0.82, edgePolicy: "WATER" },
    relief: { mode: "BOUNDARY", alignment: 0.78, continuity: 0.56, minimumPasses: 3, peripheralCoverage: 0 },
    causalRequirements: ["one continental attraction system precedes fractures", "at least two independent sutures survive", "water budget determines wet or dry fracture expression"],
    softPreferences: ["flooded rifts", "salt basins", "escarpments", "short naval alternatives"],
  }),
  ARCHIPELAGO: base("FIELD_DROWNED_SHELVES", {
    topology: { primarySystems: [4, 7], hierarchyDepth: 3, connectivity: "MANY", waterMode: "OPEN", fragmentation: 0.82, anisotropy: 0.7, edgePolicy: "WATER" },
    relief: { mode: "BOUNDARY", alignment: 0.8, continuity: 0.35, minimumPasses: 1, peripheralCoverage: 0 },
    gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 0, routeRedundancy: 1, minimumStartDistance: 5, navalDependence: 0.72, capacityPolicy: "REDUCE_CITY_STATES" },
    content: { pattern: "SHELF_ANCHORS", valueContrast: 0.22, wonderBias: 0.05, coastalValue: 0.75, hostileFrontierValue: 0, cityStateContestability: 0.55 },
    causalRequirements: ["anchor islands and satellites share parent shelf fields", "deep water separates parent clusters", "fragment scale follows shelf elevation"],
    softPreferences: ["shallow-water ancestry", "mixed island sizes", "ridge-aligned fragments", "internal shelf channels"],
  }),
  INLAND_SEAS: base("FIELD_LAKE_KINGDOMS", {
    topology: { primarySystems: [1, 3], hierarchyDepth: 3, connectivity: "SINGLE", waterMode: "ENCLOSED", fragmentation: 0.22, anisotropy: 0.45, edgePolicy: "LAND" },
    relief: { mode: "PERIPHERAL", alignment: 0.58, continuity: 0.46, minimumPasses: 3, peripheralCoverage: 0.35 },
    hydrology: { mode: "ENDORHEIC", minimumCatchments: 2, minimumTributaries: 1, outlet: "INTERIOR_BASIN" },
    content: { pattern: "INLAND_WATER_ECONOMY", valueContrast: 0.2, wonderBias: 0.08, coastalValue: 0.8, hostileFrontierValue: 0.12, cityStateContestability: 0.6 },
    causalRequirements: ["land boundary encloses water hierarchy", "edge ocean remains negligible", "inland basins retain connected settlement country"],
    softPreferences: ["one great inland sea", "secondary lakes", "basin rims", "inland coasts"],
  }),
  EARTHSEA: base("FIELD_ISLAND_CONTINENTS", {
    topology: { primarySystems: [4, 7], hierarchyDepth: 2, connectivity: "PLAYER_REALMS", waterMode: "OPEN", fragmentation: 0.58, anisotropy: 0.6, edgePolicy: "WATER" },
    gameplay: { realmMode: "ONE_PER_MAJOR", minimumObjectives: 0, routeRedundancy: 1, minimumStartDistance: 5, navalDependence: 0.78, capacityPolicy: "REDUCE_CITY_STATES" },
    content: { pattern: "MARITIME_REALMS", valueContrast: 0.16, wonderBias: 0.05, coastalValue: 0.7, hostileFrontierValue: 0, cityStateContestability: 0.58 },
    causalRequirements: ["each principal island has a regional interior", "deep voyages separate realms", "satellites remain subordinate to their realm"],
    softPreferences: ["different realm silhouettes", "shelf ancestry", "plural landing theatres", "local ecological personalities"],
  }),
  RIFT_REALMS: base("FIELD_DEEP_OCEAN_DIVIDES", {
    topology: { primarySystems: [2, 5], hierarchyDepth: 3, connectivity: "FEW", waterMode: "RIFTED", fragmentation: 0.32, anisotropy: 0.96, edgePolicy: "WATER" },
    gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 1, routeRedundancy: 1, minimumStartDistance: 5, navalDependence: 0.9, capacityPolicy: "REDUCE_CITY_STATES" },
    causalRequirements: ["continuous abyssal barriers precede basin land", "each basin retains legal population capacity", "at least one divide cannot be coast-hopped"],
    softPreferences: ["rift-margin shelves", "rare costly narrows", "strong shelf-to-abyss contrast", "Astronomy geopolitical transition"],
  }),
  LABYRINTH: base("FIELD_LAND_SEA_MAZE", {
    topology: { primarySystems: [6, 12], hierarchyDepth: 3, connectivity: "SINGLE", waterMode: "MIXED", fragmentation: 0.64, anisotropy: 1, edgePolicy: "NARRATIVE" },
    relief: { mode: "BOUNDARY", alignment: 0.7, continuity: 0.42, minimumPasses: 4, peripheralCoverage: 0 },
    gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 2, routeRedundancy: 2, minimumStartDistance: 5, navalDependence: 0.52, capacityPolicy: "PRESERVE_POPULATION" },
    causalRequirements: ["land and water corridors form one dual maze", "local proximity produces long travel", "every land chamber remains accessible"],
    softPreferences: ["loops", "false leads", "unequal corridors", "deceptive chambers"],
  }),
  WILD_REGIONS: base("FIELD_PATCHWORK_PROVINCES", {
    topology: { primarySystems: [6, 12], hierarchyDepth: 3, connectivity: "FEW", waterMode: "MIXED", fragmentation: 0.38, anisotropy: 0.62, edgePolicy: "NARRATIVE" },
    climate: { mode: "DISSONANT", minimumTransitions: 6, contrast: 0.82, latitudeAuthority: 0.42, prevailingWind: "ENGINE" },
    content: { pattern: "DISTRIBUTED", valueContrast: 0.28, wonderBias: 0.12, coastalValue: 0.35, hostileFrontierValue: 0.25, cityStateContestability: 0.52 },
    causalRequirements: ["province boundaries precede local surfaces", "each province retains one coherent geographic law", "adjacent laws contrast at regional scale"],
    softPreferences: ["valuable and barren provinces", "composed sharp boundaries", "regional biome collections", "materially different local travel"],
  }),
};

const ECCENTRIC: Record<Extract<MapPresetId, "LIVING_WORLD" | "TECTONIC_CONTINENTS" | "GREAT_WATERSHEDS" | "SHATTERED_BASINS" | "MYTHIC_REGIONS" | "ENCIRCLING_LANDS" | "ASTRAL_PANGAEA" | "RIFTWORLD" | "LONELY_OCEANS" | "PENINSULA_REALM" | "SHATTERED_ARCHIPELAGO">, ContractSeed> = {
  LIVING_WORLD: base("GRAPH_ECOLOGICAL_TRANSECT", { topology: { primarySystems: [1, 2], hierarchyDepth: 3, connectivity: "SINGLE", waterMode: "MIXED", fragmentation: 0.18, anisotropy: 0.9, edgePolicy: "NARRATIVE" }, climate: { mode: "TRANSECT", minimumTransitions: 4, contrast: 0.78, latitudeAuthority: 0.48, prevailingWind: "WEST_EAST" }, hydrology: { mode: "HIERARCHICAL", minimumCatchments: 2, minimumTributaries: 3, outlet: "LEGAL_WATER" }, content: { pattern: "RIVER_VALLEYS", valueContrast: 0.28, wonderBias: 0.08, coastalValue: 0.5, hostileFrontierValue: 0.24, cityStateContestability: 0.5 }, causalRequirements: ["one graph-connected landscape carries the complete environmental sequence", "relief explains rain shadow", "rivers connect wet source regions to legal outlets"], softPreferences: ["coast-marsh-plain-range-shadow sequence", "green desert rivers", "hot springs or other coherent refuges", "one compelling natural narrative"] }),
  TECTONIC_CONTINENTS: base("GRAPH_PLATE_ATLAS", { topology: { primarySystems: [3, 6], hierarchyDepth: 3, connectivity: "FEW", waterMode: "OPEN", fragmentation: 0.36, anisotropy: 0.7, edgePolicy: "WATER" }, relief: { mode: "BOUNDARY", alignment: 0.92, continuity: 0.62, minimumPasses: 3, peripheralCoverage: 0.25 }, climate: { mode: "REGIONAL_COLLECTIONS", minimumTransitions: 4, contrast: 0.58, latitudeAuthority: 0.62, prevailingWind: "ENGINE" }, causalRequirements: ["each continent owns a distinct graph history", "relief follows authored graph boundaries", "active and passive margins differ"], softPreferences: ["rifts", "shields", "volcanic provinces", "eroded interiors"] }),
  GREAT_WATERSHEDS: base("GRAPH_GREAT_WATERSHEDS", { topology: { primarySystems: [3, 6], hierarchyDepth: 4, connectivity: "FEW", waterMode: "MIXED", fragmentation: 0.2, anisotropy: 0.74, edgePolicy: "NARRATIVE" }, relief: { mode: "BOUNDARY", alignment: 0.88, continuity: 0.58, minimumPasses: 4, peripheralCoverage: 0 }, hydrology: { mode: "HIERARCHICAL", minimumCatchments: 3, minimumTributaries: 2, outlet: "LEGAL_WATER" }, content: { pattern: "RIVER_VALLEYS", valueContrast: 0.3, wonderBias: 0.08, coastalValue: 0.3, hostileFrontierValue: 0.12, cityStateContestability: 0.65 }, causalRequirements: ["catchments and trunk edges are reserved before subdivision", "tributaries merge rather than merely approach", "every trunk reaches one retained outlet"], softPreferences: ["floodplains", "marsh belts", "distributary deltas", "fertile confluences"] }),
  SHATTERED_BASINS: base("GRAPH_INLAND_SEA_CROSSROADS", { topology: { primarySystems: [2, 4], hierarchyDepth: 3, connectivity: "SINGLE", waterMode: "ENCLOSED", fragmentation: 0.12, anisotropy: 0.84, edgePolicy: "LAND" }, relief: { mode: "PERIPHERAL", alignment: 0.68, continuity: 0.42, minimumPasses: 3, peripheralCoverage: 0.25 }, hydrology: { mode: "ENDORHEIC", minimumCatchments: 2, minimumTributaries: 1, outlet: "INTERIOR_BASIN" }, gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 2, routeRedundancy: 2, minimumStartDistance: 5, navalDependence: 0.92, capacityPolicy: "REDUCE_CITY_STATES" }, content: { pattern: "INLAND_WATER_ECONOMY", valueContrast: 0.3, wonderBias: 0.06, coastalValue: 1, hostileFrontierValue: 0.1, cityStateContestability: 0.72 }, causalRequirements: ["sea components are allocated before marginal land", "at least one graph edge is a true strait", "at least one settleable land edge is a canal isthmus", "principal land remains one marginal system"], softPreferences: ["resource-rich seas", "Bosporus-like throats", "Panama-like canal sites", "tiny punctuation islands only"] }),
  MYTHIC_REGIONS: base("GRAPH_WONDER_HEARTLANDS", { topology: { primarySystems: [3, 6], hierarchyDepth: 3, connectivity: "FEW", waterMode: "MIXED", fragmentation: 0.22, anisotropy: 0.55, edgePolicy: "NARRATIVE" }, relief: { mode: "BOUNDARY", alignment: 0.76, continuity: 0.52, minimumPasses: 2, peripheralCoverage: 0.3 }, content: { pattern: "MYTHIC_HEARTS", valueContrast: 0.82, wonderBias: 0.9, coastalValue: 0.2, hostileFrontierValue: 0.25, cityStateContestability: 0.55 }, causalRequirements: ["heart and march regions are distinct graph roles", "legal value concentrates inside hearts", "mountain or barren buffers separate hearts from ordinary land"], softPreferences: ["natural wonders", "luxury clusters", "fertile pockets", "comparatively featureless marches"] }),
  ENCIRCLING_LANDS: base("GRAPH_ENCIRCLED_SEAS", { topology: { primarySystems: [2, 5], hierarchyDepth: 3, connectivity: "SINGLE", waterMode: "ENCLOSED", fragmentation: 0.16, anisotropy: 0.62, edgePolicy: "LAND" }, gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 1, routeRedundancy: 2, minimumStartDistance: 5, navalDependence: 0.5, capacityPolicy: "PRESERVE_POPULATION" }, causalRequirements: ["an exterior graph cycle is reserved before subdivision", "inner water hierarchy remains enclosed", "outer circuit survives local damage and remains accessible"], softPreferences: ["inward-facing kingdoms", "peninsulas", "plural inland naval theatres", "asymmetric outer journey"] }),
  ASTRAL_PANGAEA: base("GRAPH_SCARRED_PANGAEA", { topology: { primarySystems: [1, 1], hierarchyDepth: 3, connectivity: "SINGLE", waterMode: "RIFTED", fragmentation: 0.2, anisotropy: 0.94, edgePolicy: "NARRATIVE" }, relief: { mode: "BOUNDARY", alignment: 0.86, continuity: 0.48, minimumPasses: 3, peripheralCoverage: 0 }, causalRequirements: ["one graph continent precedes alien scar allocation", "scars reorganize rather than disperse the continent", "several broad sutures survive"], softPreferences: ["branching scars", "ring scars", "incompatible marches", "dramatic relief transitions"] }),
  RIFTWORLD: base("GRAPH_RIFT_LATTICE", { topology: { primarySystems: [4, 10], hierarchyDepth: 4, connectivity: "FEW", waterMode: "RIFTED", fragmentation: 0.46, anisotropy: 0.95, edgePolicy: "WATER" }, gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 2, routeRedundancy: 2, minimumStartDistance: 5, navalDependence: 0.84, capacityPolicy: "REDUCE_CITY_STATES" }, causalRequirements: ["primary rift graph is authoritative", "secondary rifts subdivide unequal viable cells", "junctions and crossing hierarchy survive subdivision"], softPreferences: ["branches", "junctions", "different local cell worlds", "irregular global partition"] }),
  LONELY_OCEANS: base("GRAPH_LONELY_OCEANS", { topology: { primarySystems: [2, 22], hierarchyDepth: 2, connectivity: "PLAYER_REALMS", waterMode: "SCARCE", fragmentation: 0.12, anisotropy: 0.4, edgePolicy: "WATER" }, gameplay: { realmMode: "ONE_PER_MAJOR", minimumObjectives: 0, routeRedundancy: 0, minimumStartDistance: 5, navalDependence: 1, capacityPolicy: "REDUCE_POPULATION" }, content: { pattern: "ISOLATED_SCARCITY", valueContrast: 0.35, wonderBias: 0.03, coastalValue: 0.72, hostileFrontierValue: 0.1, cityStateContestability: 0.2 }, causalRequirements: ["one viable graph realm is reserved per major", "deep empty ocean separates every principal realm", "stepping-stone chains are excluded before subdivision"], softPreferences: ["dramatic negative space", "rare maritime resources", "sparse satellites", "enduring pre-Astronomy isolation"] }),
  PENINSULA_REALM: base("GRAPH_GREAT_PENINSULAS", { topology: { primarySystems: [3, 7], hierarchyDepth: 3, connectivity: "SINGLE", waterMode: "OPEN", fragmentation: 0.2, anisotropy: 0.94, edgePolicy: "WATER" }, gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 1, routeRedundancy: 2, minimumStartDistance: 5, navalDependence: 0.48, capacityPolicy: "PRESERVE_POPULATION" }, causalRequirements: ["one parent backbone is reserved", "each peninsula has its own parent polygon and narrow neck", "principal peninsula interiors remain settleable"], softPreferences: ["Florida-like provinces", "Italy-like provinces", "estuaries", "coastal ranges"] }),
  SHATTERED_ARCHIPELAGO: base("GRAPH_BROKEN_ISLAND_CHAINS", { topology: { primarySystems: [4, 7], hierarchyDepth: 4, connectivity: "MANY", waterMode: "OPEN", fragmentation: 0.88, anisotropy: 1, edgePolicy: "WATER" }, relief: { mode: "VOLCANIC", alignment: 0.92, continuity: 0.34, minimumPasses: 1, peripheralCoverage: 0 }, gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 1, routeRedundancy: 1, minimumStartDistance: 5, navalDependence: 0.92, capacityPolicy: "REDUCE_CITY_STATES" }, content: { pattern: "SHELF_ANCHORS", valueContrast: 0.26, wonderBias: 0.05, coastalValue: 0.86, hostileFrontierValue: 0.15, cityStateContestability: 0.58 }, causalRequirements: ["each island belongs to a parent arc", "anchors and satellites retain rhythmic hierarchy", "deep gaps separate parent systems"], softPreferences: ["crescents", "necklaces", "parallel arcs", "age progression"] }),
};

const PHYSICAL: Record<Extract<MapPresetId, "DYNAMIC_EARTH" | "COLLIDING_PLATES" | "ANCIENT_CRATONS" | "ISLAND_ARC_EARTH" | "SUPERCONTINENT_INTERIOR" | "MONSOON_CONTINENTS" | "ICEHOUSE_EARTH">, ContractSeed> = {
  DYNAMIC_EARTH: base("PHYSICAL_DYNAMIC_EARTH", { topology: { primarySystems: [4, 7], hierarchyDepth: 3, connectivity: "FEW", waterMode: "MIXED", fragmentation: 0.34, anisotropy: 0.65, edgePolicy: "NARRATIVE" }, relief: { mode: "BOUNDARY", alignment: 0.9, continuity: 0.58, minimumPasses: 3, peripheralCoverage: 0.15 }, climate: { mode: "ENGINE", minimumTransitions: 4, contrast: 0.58, latitudeAuthority: 0.78, prevailingWind: "WEST_EAST" }, causalRequirements: ["multiple plate and erosion stages coexist", "each major landform retains a physical cause", "young and old provinces remain distinguishable"], softPreferences: ["active rifts", "closing seas", "young ranges", "eroded remnants"] }),
  COLLIDING_PLATES: base("PHYSICAL_COLLISION", { topology: { primarySystems: [2, 5], hierarchyDepth: 3, connectivity: "FEW", waterMode: "MIXED", fragmentation: 0.18, anisotropy: 0.9, edgePolicy: "NARRATIVE" }, relief: { mode: "COLLISION", alignment: 0.98, continuity: 0.82, minimumPasses: 3, peripheralCoverage: 0 }, climate: { mode: "ENGINE", minimumTransitions: 3, contrast: 0.72, latitudeAuthority: 0.72, prevailingWind: "WEST_EAST" }, gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 1, routeRedundancy: 2, minimumStartDistance: 5, navalDependence: 0.22, capacityPolicy: "PRESERVE_POPULATION" }, causalRequirements: ["selected continental plates converge", "ranges and forelands follow convergent boundaries", "rain shadows follow wind-facing relief", "plural passes preserve accessibility"], softPreferences: ["plateaus", "paired ranges", "foothills", "mineral-rich sutures"] }),
  ANCIENT_CRATONS: base("PHYSICAL_ANCIENT_SHIELDS", { topology: { primarySystems: [3, 6], hierarchyDepth: 3, connectivity: "FEW", waterMode: "MIXED", fragmentation: 0.18, anisotropy: 0.45, edgePolicy: "NARRATIVE" }, relief: { mode: "ERODED", alignment: 0.7, continuity: 0.24, minimumPasses: 3, peripheralCoverage: 0 }, hydrology: { mode: "HIERARCHICAL", minimumCatchments: 3, minimumTributaries: 2, outlet: "LEGAL_WATER" }, content: { pattern: "RIVER_VALLEYS", valueContrast: 0.22, wonderBias: 0.06, coastalValue: 0.3, hostileFrontierValue: 0.18, cityStateContestability: 0.5 }, causalRequirements: ["old continental crust survives erosion", "ghost ranges derive from worn boundaries", "mature drainage crosses broad shields"], softPreferences: ["escarpments", "broad basins", "exposed mineral cores", "deep-time contrast"] }),
  ISLAND_ARC_EARTH: base("PHYSICAL_VOLCANIC_ARCS", { topology: { primarySystems: [3, 6], hierarchyDepth: 4, connectivity: "MANY", waterMode: "OPEN", fragmentation: 0.84, anisotropy: 1, edgePolicy: "WATER" }, relief: { mode: "VOLCANIC", alignment: 1, continuity: 0.68, minimumPasses: 1, peripheralCoverage: 0 }, climate: { mode: "ENGINE", minimumTransitions: 3, contrast: 0.62, latitudeAuthority: 0.72, prevailingWind: "WEST_EAST" }, gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 1, routeRedundancy: 1, minimumStartDistance: 5, navalDependence: 0.9, capacityPolicy: "REDUCE_CITY_STATES" }, content: { pattern: "SHELF_ANCHORS", valueContrast: 0.28, wonderBias: 0.08, coastalValue: 0.9, hostileFrontierValue: 0.2, cityStateContestability: 0.52 }, causalRequirements: ["arcs follow subduction boundaries", "deep outer trenches and sheltered back arcs remain offset", "volcanic age progresses along arcs"], softPreferences: ["atolls", "double arcs", "windward rain", "short mountain-fed rivers"] }),
  SUPERCONTINENT_INTERIOR: base("PHYSICAL_INLAND_SUPERCONTINENT", { topology: { primarySystems: [1, 2], hierarchyDepth: 4, connectivity: "SINGLE", waterMode: "ENCLOSED", fragmentation: 0.08, anisotropy: 0.5, edgePolicy: "LAND" }, relief: { mode: "PERIPHERAL", alignment: 0.88, continuity: 0.66, minimumPasses: 4, peripheralCoverage: 0.65 }, climate: { mode: "ENGINE", minimumTransitions: 3, contrast: 0.75, latitudeAuthority: 0.7, prevailingWind: "WEST_EAST" }, hydrology: { mode: "ENDORHEIC", minimumCatchments: 3, minimumTributaries: 2, outlet: "INTERIOR_BASIN" }, content: { pattern: "INLAND_WATER_ECONOMY", valueContrast: 0.42, wonderBias: 0.08, coastalValue: 0.82, hostileFrontierValue: 0.55, cityStateContestability: 0.58 }, causalRequirements: ["continental crust encloses a subsiding interior basin", "peripheral uplift is broken by plural passes", "drainage terminates in the interior system", "external ocean remains negligible"], softPreferences: ["fertile inland shores", "terminal lakes", "salt basins", "valuable remote uplands"] }),
  MONSOON_CONTINENTS: base("PHYSICAL_MONSOON", { topology: { primarySystems: [2, 5], hierarchyDepth: 3, connectivity: "FEW", waterMode: "OPEN", fragmentation: 0.24, anisotropy: 0.76, edgePolicy: "WATER" }, relief: { mode: "BOUNDARY", alignment: 0.9, continuity: 0.58, minimumPasses: 3, peripheralCoverage: 0.2 }, climate: { mode: "MONSOON", minimumTransitions: 4, contrast: 0.9, latitudeAuthority: 0.68, prevailingWind: "SEASONAL" }, hydrology: { mode: "MONSOON", minimumCatchments: 3, minimumTributaries: 3, outlet: "LEGAL_WATER" }, content: { pattern: "RIVER_VALLEYS", valueContrast: 0.32, wonderBias: 0.06, coastalValue: 0.68, hostileFrontierValue: 0.24, cityStateContestability: 0.62 }, causalRequirements: ["warm seas supply seasonal moisture", "wind-facing ranges produce deluge", "trunk rivers cross wet basins", "leeward interiors remain dry"], softPreferences: ["funnelling bays", "floodplains", "deltas", "contrasting plateaus"] }),
  ICEHOUSE_EARTH: base("PHYSICAL_GLACIAL", { topology: { primarySystems: [2, 6], hierarchyDepth: 3, connectivity: "FEW", waterMode: "MIXED", fragmentation: 0.28, anisotropy: 0.62, edgePolicy: "NARRATIVE" }, relief: { mode: "GLACIAL", alignment: 0.68, continuity: 0.45, minimumPasses: 3, peripheralCoverage: 0 }, climate: { mode: "GLACIAL", minimumTransitions: 3, contrast: 0.92, latitudeAuthority: 0.88, prevailingWind: "WEST_EAST" }, gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 2, routeRedundancy: 1, minimumStartDistance: 5, navalDependence: 0.38, capacityPolicy: "PRESERVE_POPULATION" }, content: { pattern: "COLD_FRONTIER", valueContrast: 0.72, wonderBias: 0.08, coastalValue: 0.6, hostileFrontierValue: 1, cityStateContestability: 0.5 }, causalRequirements: ["ice sheets follow retained climate and accumulation", "temperate refuges remain limited", "cold frontiers remain settleable and valuable", "biome boundaries remain irregular"], softPreferences: ["ice lobes", "fish-rich seas", "cold luxuries", "food-dependent satellite cities"] }),
};

const POLIS: Record<Extract<MapPresetId, "IMPERIAL_RING" | "OPPOSING_FRONTS" | "CONTESTED_HEARTLAND" | "RIVAL_CONTINENTS" | "THREE_REALMS" | "THALASSIC_LEAGUE" | "UNEQUAL_REALMS">, ContractSeed> = {
  IMPERIAL_RING: base("POLIS_IMPERIAL_RING", { topology: { primarySystems: [4, 10], hierarchyDepth: 3, connectivity: "STRATEGIC", waterMode: "MIXED", fragmentation: 0.2, anisotropy: 0.68, edgePolicy: "NARRATIVE" }, gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 2, routeRedundancy: 2, minimumStartDistance: 5, navalDependence: 0.35, capacityPolicy: "PRESERVE_POPULATION" }, content: { pattern: "CONTESTED_CENTRE", valueContrast: 0.55, wonderBias: 0.25, coastalValue: 0.35, hostileFrontierValue: 0.15, cityStateContestability: 0.72 }, causalRequirements: ["outer starts retain neighboring fronts", "plural routes converge on a broad shared axle", "lateral alternatives survive", "geographic disguise breaks literal radial symmetry"], softPreferences: ["asymmetric ranges", "lakes and coasts", "several central objectives", "organic realm silhouettes"] }),
  OPPOSING_FRONTS: base("POLIS_OPPOSING_FRONTS", { topology: { primarySystems: [2, 2], hierarchyDepth: 3, connectivity: "STRATEGIC", waterMode: "MIXED", fragmentation: 0.16, anisotropy: 0.9, edgePolicy: "NARRATIVE" }, relief: { mode: "BOUNDARY", alignment: 0.9, continuity: 0.7, minimumPasses: 3, peripheralCoverage: 0 }, gameplay: { realmMode: "TEAMS", minimumObjectives: 2, routeRedundancy: 2, minimumStartDistance: 5, navalDependence: 0.3, capacityPolicy: "PRESERVE_POPULATION" }, content: { pattern: "CONTESTED_CENTRE", valueContrast: 0.4, wonderBias: 0.12, coastalValue: 0.25, hostileFrontierValue: 0.52, cityStateContestability: 0.65, sitePolicy: { activationCharacter: "BRUTAL", theatre: "CONTESTED_DMZ", barbarianShare: 0.4, ruinShare: 0.5, siteSpacing: 3, falloutDensity: 0.03, falloutMaximum: 8, falloutStartBuffer: 3 } }, causalRequirements: ["exactly two team territories remain coherent", "broad frontier separates them", "plural invasion theatres cross the frontier", "neither team owns a singular mandatory breach"], softPreferences: ["mountain curtain", "DMZ", "fallout and barbarians under Brutal", "different front regimes"] }),
  CONTESTED_HEARTLAND: base("POLIS_CONTESTED_HEARTLAND", { topology: { primarySystems: [4, 10], hierarchyDepth: 3, connectivity: "STRATEGIC", waterMode: "MIXED", fragmentation: 0.24, anisotropy: 0.72, edgePolicy: "NARRATIVE" }, gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 2, routeRedundancy: 3, minimumStartDistance: 5, navalDependence: 0.3, capacityPolicy: "PRESERVE_POPULATION" }, content: { pattern: "CONTESTED_CENTRE", valueContrast: 0.75, wonderBias: 0.28, coastalValue: 0.28, hostileFrontierValue: 0.18, cityStateContestability: 0.8 }, causalRequirements: ["safe peripheral realms overlap through many-to-many routes", "central value remains broad and contestable", "radial-only paths are rejected", "no start can immediately monopolize the heartland"], softPreferences: ["flanks", "river crossings", "secondary objectives", "irregular approaches"] }),
  RIVAL_CONTINENTS: base("POLIS_RIVAL_CONTINENTS", { topology: { primarySystems: [2, 2], hierarchyDepth: 3, connectivity: "STRATEGIC", waterMode: "OPEN", fragmentation: 0.2, anisotropy: 0.82, edgePolicy: "WATER" }, gameplay: { realmMode: "TEAMS", minimumObjectives: 2, routeRedundancy: 2, minimumStartDistance: 5, navalDependence: 0.62, capacityPolicy: "PRESERVE_POPULATION" }, content: { pattern: "CONTESTED_CENTRE", valueContrast: 0.42, wonderBias: 0.12, coastalValue: 0.62, hostileFrontierValue: 0.28, cityStateContestability: 0.7 }, causalRequirements: ["two populated strategic worlds remain coherent", "plural expensive hinge theatres connect them", "the divide is costly but never impassable", "reinforcement opportunity remains comparable"], softPreferences: ["short seas", "straits", "mountain valleys", "defensible staging regions"] }),
  THREE_REALMS: base("POLIS_THREE_REALMS", { topology: { primarySystems: [3, 3], hierarchyDepth: 3, connectivity: "STRATEGIC", waterMode: "MIXED", fragmentation: 0.2, anisotropy: 0.74, edgePolicy: "NARRATIVE" }, gameplay: { realmMode: "TEAMS", minimumObjectives: 3, routeRedundancy: 2, minimumStartDistance: 5, navalDependence: 0.35, capacityPolicy: "REDUCE_POPULATION" }, content: { pattern: "CONTESTED_CENTRE", valueContrast: 0.48, wonderBias: 0.18, coastalValue: 0.4, hostileFrontierValue: 0.18, cityStateContestability: 0.72 }, causalRequirements: ["exactly three realms are represented", "every realm contacts both others", "two-front response remains viable", "objectives support multiple victory routes"], softPreferences: ["asymmetric theatres", "third-party opportunities", "natural-looking seams", "victory-aware objectives"] }),
  THALASSIC_LEAGUE: base("POLIS_THALASSIC_LEAGUE", { topology: { primarySystems: [4, 10], hierarchyDepth: 3, connectivity: "STRATEGIC", waterMode: "OPEN", fragmentation: 0.46, anisotropy: 0.68, edgePolicy: "WATER" }, gameplay: { realmMode: "GEOGRAPHIC", minimumObjectives: 3, routeRedundancy: 3, minimumStartDistance: 5, navalDependence: 0.95, capacityPolicy: "REDUCE_CITY_STATES" }, content: { pattern: "NAVAL_NETWORK", valueContrast: 0.38, wonderBias: 0.1, coastalValue: 1, hostileFrontierValue: 0.1, cityStateContestability: 0.9 }, causalRequirements: ["all principal powers retain coastal access", "redundant many-to-many sea lanes connect ports", "city states remain contestable", "no single naval gate controls the network"], softPreferences: ["islands", "straits", "naval objectives", "diplomatic chokepoints"] }),
  UNEQUAL_REALMS: base("POLIS_UNEQUAL_REALMS", { topology: { primarySystems: [4, 4], hierarchyDepth: 3, connectivity: "STRATEGIC", waterMode: "MIXED", fragmentation: 0.28, anisotropy: 0.72, edgePolicy: "NARRATIVE" }, gameplay: { realmMode: "ROLE_CONTRACTS", minimumObjectives: 3, routeRedundancy: 2, minimumStartDistance: 5, navalDependence: 0.4, capacityPolicy: "REDUCE_POPULATION" }, content: { pattern: "ROLE_ASYMMETRY", valueContrast: 0.9, wonderBias: 0.12, coastalValue: 0.45, hostileFrontierValue: 0.48, cityStateContestability: 0.68 }, causalRequirements: ["Tall Wide War and Turtle roles are explicit", "every role remains viable", "resource and route obligations differ materially", "asymmetry is disclosed and not accidental"], softPreferences: ["different terrain obligations", "distinct victory paths", "unequal expansion pressure", "organic role regions"] }),
};

const invariant = (
  id: string,
  category: NarrativeInvariantCategory,
  proofStage: NarrativeInvariantProofStage,
  requirement: string,
): NarrativeNativeInvariant => ({ id, category, proofStage, requirement });

/** These are deliberately explicit rather than inferred from a grammar family. They
 * define the last relationship an authored relaxation is allowed to preserve. */
const NATIVE_INVARIANTS = {
  CONTINENTS: [invariant("viable-crooked-interiors", "CAPACITY", "LEGAL_NORMALIZED", "Every principal continent retains a viable interior after its maritime intrusions are resolved.")],
  PANGAEA: [invariant("robust-dominant-continent", "TOPOLOGY", "LEGAL_NORMALIZED", "One dominant continent remains connected by more than a technical one-tile accident.")],
  ARCHIPELAGO: [invariant("viable-shelf-anchors", "CAPACITY", "LEGAL_NORMALIZED", "Every retained parent shelf contains a viable anchor rather than only island confetti.")],
  INLAND_SEAS: [invariant("bounded-terrestrial-kingdoms", "TOPOLOGY", "LEGAL_NORMALIZED", "The enclosing land framework remains dominant and its principal waters remain inland.")],
  EARTHSEA: [invariant("viable-island-homelands", "CAPACITY", "LEGAL_NORMALIZED", "Every principal island-continent retains a settlement-capable interior.")],
  RIFT_REALMS: [invariant("technology-gated-divide", "TOPOLOGY", "LEGAL_NORMALIZED", "At least one continuous deep-water divide separates viable navigation basins without a coastal bypass.")],
  LABYRINTH: [invariant("accessible-dual-maze", "ACCESSIBILITY", "LEGAL_NORMALIZED", "The maze remains genuinely tortuous while every populated land chamber stays accessible.")],
  WILD_REGIONS: [invariant("coherent-contrasting-provinces", "CAUSALITY", "NATIVE_PLAN", "Multiple contiguous provinces retain different regional laws rather than tile-scale confetti.")],

  LIVING_WORLD: [invariant("one-causal-transect", "CAUSALITY", "NATIVE_PLAN", "One connected environmental sequence remains causally ordered across the landscape.")],
  TECTONIC_CONTINENTS: [invariant("distinct-continental-histories", "CAUSALITY", "NATIVE_PLAN", "At least three principal continents retain materially different authored geological histories.")],
  GREAT_WATERSHEDS: [invariant("legal-directed-drainage", "HYDROLOGY", "LEGAL_NORMALIZED", "Every retained trunk is continuous from mountain-fed branches to one legal lake or sea outlet.")],
  SHATTERED_BASINS: [invariant("sea-dominated-crossroads", "TOPOLOGY", "LEGAL_NORMALIZED", "Enclosed seas remain dominant and scarce marginal land retains at least one authoritative strait or canal relationship.")],
  MYTHIC_REGIONS: [invariant("heart-march-contrast", "CAUSALITY", "LEGAL_NORMALIZED", "At least one legal value heart remains materially richer than its enclosing mountain or barren march.")],
  ENCIRCLING_LANDS: [invariant("resilient-outer-circuit", "ACCESSIBILITY", "LEGAL_NORMALIZED", "A traversable asymmetric exterior land circuit continues to enclose inland waters.")],
  ASTRAL_PANGAEA: [invariant("scarred-surviving-pangaea", "TOPOLOGY", "LEGAL_NORMALIZED", "One robust continent remains visibly reorganized by an authoritative non-geological scar system.")],
  RIFTWORLD: [invariant("authoritative-primary-rifts", "TOPOLOGY", "NATIVE_PLAN", "Primary rifts remain continuous boundaries between unequal viable graph cells.")],
  LONELY_OCEANS: [invariant("one-major-per-isolated-realm", "CAPACITY", "LEGAL_NORMALIZED", "Every retained major civilization occupies a separate viable pre-Astronomy realm.")],
  PENINSULA_REALM: [invariant("attached-peninsula-provinces", "TOPOLOGY", "LEGAL_NORMALIZED", "Principal peninsulas remain settlement-capable provinces attached to one shared backbone.")],
  SHATTERED_ARCHIPELAGO: [invariant("parent-arc-ancestry", "CAUSALITY", "NATIVE_PLAN", "Every principal anchor and satellite retains membership in a directional parent arc.")],

  DYNAMIC_EARTH: [invariant("multiple-retained-epochs", "CAUSALITY", "NATIVE_PLAN", "Several interacting physical processes at different ages remain causally distinguishable.")],
  COLLIDING_PLATES: [invariant("convergent-accessible-belts", "ACCESSIBILITY", "LEGAL_NORMALIZED", "Collision belts remain tied to convergence and cannot seal populated land behind mountains.")],
  ANCIENT_CRATONS: [invariant("deep-time-causal-landscape", "CAUSALITY", "NATIVE_PLAN", "Old crust, erosion and mature drainage jointly explain the shield landscape.")],
  ISLAND_ARC_EARTH: [invariant("subduction-arc-cross-section", "CAUSALITY", "NATIVE_PLAN", "At least one inhabited arc retains the trench-to-volcanic-chain-to-back-arc causal cross-section.")],
  SUPERCONTINENT_INTERIOR: [invariant("inward-draining-enclosure", "HYDROLOGY", "LEGAL_NORMALIZED", "One continental enclosure retains an interior terminal basin and no dominant external ocean outlet.")],
  MONSOON_CONTINENTS: [invariant("circulation-relief-drainage-chain", "CAUSALITY", "NATIVE_PLAN", "Warm seas, seasonal winds, wind-facing relief and trunk drainage remain one causal system.")],
  ICEHOUSE_EARTH: [invariant("valuable-accessible-cold-frontier", "CAPACITY", "LEGAL_NORMALIZED", "Frozen frontier land remains accessible, settleable and materially valuable outside limited refuges.")],

  IMPERIAL_RING: [invariant("shared-axle-with-lateral-routes", "STRATEGY", "STRATEGIC_GRAPH", "Outer realms retain both plural approaches to a shared axle and lateral alternatives.")],
  OPPOSING_FRONTS: [invariant("two-sides-plural-theatres", "STRATEGY", "STRATEGIC_GRAPH", "Exactly two coherent sides retain more than one independent invasion theatre.")],
  CONTESTED_HEARTLAND: [invariant("many-to-many-heartland-access", "STRATEGY", "STRATEGIC_GRAPH", "The valuable heartland remains contestable through a non-radial many-to-many route mesh.")],
  RIVAL_CONTINENTS: [invariant("costly-accessible-hinges", "STRATEGY", "STRATEGIC_GRAPH", "Two coherent blocs remain connected by plural costly but passable hinge theatres.")],
  THREE_REALMS: [invariant("complete-three-realm-contact", "STRATEGY", "STRATEGIC_GRAPH", "Exactly three realms retain all three independent pairwise contact relationships.")],
  THALASSIC_LEAGUE: [invariant("redundant-maritime-network", "STRATEGY", "STRATEGIC_GRAPH", "All principal coastal powers remain in a redundant many-to-many sea-lane network.")],
  UNEQUAL_REALMS: [invariant("distinct-viable-role-contracts", "STRATEGY", "STRATEGIC_GRAPH", "Tall, Wide, War and Turtle remain materially different, disclosed and individually viable when four roles fit.")],
} as const satisfies Record<MapPresetId, readonly NarrativeNativeInvariant[]>;

const systems = (minimum = 1): NarrativeNativeRelaxationOperation => ({ kind: "REDUCE_PRIMARY_SYSTEMS", by: 1, minimum });
const hierarchy = (minimum: 1 | 2 | 3 = 2): NarrativeNativeRelaxationOperation => ({ kind: "REDUCE_HIERARCHY", by: 1, minimum });
const fragment = (by = 0.12, minimum = 0.08): NarrativeNativeRelaxationOperation => ({ kind: "REDUCE_FRAGMENTATION", by, minimum });
const widen = (by = 0.12): NarrativeNativeRelaxationOperation => ({ kind: "WIDEN_CONNECTIONS", by });
const contractWater = (by = 0.12): NarrativeNativeRelaxationOperation => ({ kind: "CONTRACT_WATER_SYSTEMS", by });
const softenRelief = (by = 0.12, minimum = 0.2): NarrativeNativeRelaxationOperation => ({ kind: "SOFTEN_RELIEF", by, minimum });
const softenClimate = (by = 0.12, minimum = 0.2): NarrativeNativeRelaxationOperation => ({ kind: "SOFTEN_CLIMATE", by, minimum });
const reduceHydrology = (catchmentsBy = 0, tributariesBy = 1): NarrativeNativeRelaxationOperation => ({ kind: "REDUCE_HYDROLOGY_BRANCHING", catchmentsBy, tributariesBy });
const reduceObjectives = (minimum = 1): NarrativeNativeRelaxationOperation => ({ kind: "REDUCE_OBJECTIVES", by: 1, minimum });
const softenContent = (by = 0.12, minimum = 0.15): NarrativeNativeRelaxationOperation => ({ kind: "SOFTEN_CONTENT_CONTRAST", by, minimum });

function relaxation(
  profileId: MapPresetId,
  constraintId: string,
  label: string,
  consequence: string,
  operations: readonly NarrativeNativeRelaxationOperation[],
  mode: NarrativeNativeRelaxationStep["mode"] = "WEAKEN_IDENTITY",
): NarrativeNativeRelaxationStep {
  return {
    id: `relax-${constraintId}`,
    label,
    constraintIds: [constraintId],
    consequence,
    mode,
    operations,
    preserves: NATIVE_INVARIANTS[profileId].map((item) => item.id),
  };
}

const antiRisk = (profileId: MapPresetId, constraintId: string, label: string): NarrativeNativeRelaxationStep => relaxation(
  profileId,
  constraintId,
  label,
  "The map may resemble its named anti-motif and requires explicit Review and Identity Lab scrutiny.",
  [{ kind: "ACCEPT_ANTI_MOTIF_RISK", motifId: constraintId.replace(/^avoid-/, "") }],
  "ACCEPT_ANTI_MOTIF_RISK",
);

const RELAXATION_POLICIES = {
  CONTINENTS: [
    relaxation("CONTINENTS", "false-proximity", "Reduce secondary maritime intrusions", "Some false-proximity cases disappear while crooked continental interiors remain.", [hierarchy()]),
    relaxation("CONTINENTS", "crooked-interiors", "Reduce the number of principal continents", "Fewer continental interiors carry the convoluted geography.", [systems(2)]),
    antiRisk("CONTINENTS", "avoid-plain-blobs", "Accept plain-continent resemblance risk"),
  ],
  PANGAEA: [
    relaxation("PANGAEA", "credible-fracture", "Reduce secondary fracture systems", "The dominant continent retains fewer legible wet or dry fractures.", [hierarchy()]),
    relaxation("PANGAEA", "dominant-land", "Contract flooded fractures", "More fracture expression becomes dry relief so robust continental unity survives.", [contractWater(), widen()]),
    antiRisk("PANGAEA", "avoid-multiple-continents", "Accept multi-continent resemblance risk"),
  ],
  ARCHIPELAGO: [
    relaxation("ARCHIPELAGO", "anchor-fragments", "Remove minor shelf fragments", "Parent shelves lose subordinate fragments before their viable anchors.", [fragment()]),
    relaxation("ARCHIPELAGO", "shelf-clusters", "Merge secondary shelf systems", "Fewer drowned parent shelves remain legible.", [systems(3)]),
    antiRisk("ARCHIPELAGO", "avoid-random-scatter", "Accept random-island resemblance risk"),
  ],
  INLAND_SEAS: [
    relaxation("INLAND_SEAS", "water-hierarchy", "Contract secondary inland waters", "Small lakes and subsidiary basins disappear before the terrestrial kingdoms.", [contractWater(), hierarchy()]),
    relaxation("INLAND_SEAS", "dominant-land", "Broaden the enclosing land framework", "Inland waters become less imposing while the bounded kingdoms remain viable.", [widen()]),
    antiRisk("INLAND_SEAS", "avoid-open-ocean", "Accept open-ocean resemblance risk"),
  ],
  EARTHSEA: [
    relaxation("EARTHSEA", "broad-voyages", "Broaden secondary shelf approaches", "Some island-continent realms become easier to reach.", [widen()]),
    relaxation("EARTHSEA", "principal-realms", "Simplify minor island shelves", "Every player-aware principal homeland remains, but the smallest realms retain fewer subordinate shelf fragments.", [fragment()]),
    antiRisk("EARTHSEA", "avoid-island-confetti", "Accept island-confetti resemblance risk"),
  ],
  RIFT_REALMS: [
    relaxation("RIFT_REALMS", "viable-basins", "Merge the smallest navigation basin", "Fewer locally complete worlds remain behind the divides.", [systems(2), contractWater()]),
    relaxation("RIFT_REALMS", "deep-rifts", "Contract a secondary deep divide", "The technology-gated separation becomes less extensive.", [contractWater(), hierarchy()]),
    antiRisk("RIFT_REALMS", "avoid-decorative-cuts", "Accept decorative-rift resemblance risk"),
  ],
  LABYRINTH: [
    relaxation("LABYRINTH", "irregular-chambers", "Reduce minor maze chambers", "The maze contains fewer distinct settlement chambers.", [systems(4)]),
    relaxation("LABYRINTH", "tortuous-routes", "Widen difficult corridors", "Navigation remains indirect but loses some route stretch.", [widen()]),
    antiRisk("LABYRINTH", "avoid-regular-oblong-islands", "Accept regular-island resemblance risk"),
  ],
  WILD_REGIONS: [
    relaxation("WILD_REGIONS", "composed-boundaries", "Blend minor provincial boundaries", "Adjacent province laws become less sharply juxtaposed.", [softenClimate()]),
    relaxation("WILD_REGIONS", "province-laws", "Merge similar provinces", "Fewer incompatible geographic laws remain.", [systems(4)]),
    antiRisk("WILD_REGIONS", "avoid-biome-confetti", "Accept biome-confetti resemblance risk"),
  ],

  LIVING_WORLD: [
    relaxation("LIVING_WORLD", "living-corridors", "Reduce secondary living corridors", "The ecological narrative retains fewer water-supported side systems.", [reduceHydrology()]),
    relaxation("LIVING_WORLD", "causal-transect", "Shorten the environmental transect", "The primary sequence spans fewer extensive ecological stages.", [systems(1), softenClimate()]),
    antiRisk("LIVING_WORLD", "avoid-island-focus", "Accept fragmented-landscape resemblance risk"),
  ],
  TECTONIC_CONTINENTS: [
    relaxation("TECTONIC_CONTINENTS", "active-margins", "Simplify minor continental histories", "Some margin consequences become less elaborate.", [softenRelief()]),
    relaxation("TECTONIC_CONTINENTS", "distinct-histories", "Merge the most similar histories", "Fewer continents retain strongly different authored geological stories.", [systems(3)]),
    antiRisk("TECTONIC_CONTINENTS", "avoid-repeated-template", "Accept repeated-history resemblance risk"),
  ],
  GREAT_WATERSHEDS: [
    relaxation("GREAT_WATERSHEDS", "wet-lowlands", "Reduce distributary and wetland ornament", "Floodplains, marsh belts, or delta branches become less extensive.", [softenContent()]),
    relaxation("GREAT_WATERSHEDS", "tributary-hierarchy", "Remove minor tributaries", "Catchments retain simpler tributary trees.", [reduceHydrology()]),
    relaxation("GREAT_WATERSHEDS", "trunk-rivers", "Reduce catchment count", "Fewer dominant river systems organize the world.", [reduceHydrology(1, 1)]),
    relaxation("GREAT_WATERSHEDS", "avoid-short-unrelated-rivers", "Simplify drainage until every trunk is legal", "The candidate must be regenerated with fewer branches; invalid hydrology is never accepted.", [reduceHydrology(1, 2)], "RETRY_NATIVE_GRAMMAR"),
  ],
  SHATTERED_BASINS: [
    relaxation("SHATTERED_BASINS", "marginal-land", "Broaden marginal shoreland", "Land becomes less scarce around the great seas.", [widen()]),
    relaxation("SHATTERED_BASINS", "strait-isthmus", "Retain only one dominant crossing form", "Scale or capacity preserves a strait or canal isthmus rather than both.", [reduceObjectives()]),
    relaxation("SHATTERED_BASINS", "great-seas", "Merge a secondary inland sea", "Fewer colossal enclosed seas dominate the map.", [systems(2)]),
    antiRisk("SHATTERED_BASINS", "avoid-comfortable-continents", "Accept comfortable-land resemblance risk"),
    antiRisk("SHATTERED_BASINS", "avoid-island-scatter", "Accept archipelago resemblance risk"),
  ],
  MYTHIC_REGIONS: [
    relaxation("MYTHIC_REGIONS", "value-contrast", "Reduce excess heart value", "Mythic hearts remain distinct but less overwhelmingly valuable.", [softenContent()]),
    relaxation("MYTHIC_REGIONS", "mythic-hearts", "Reduce heart count", "Fewer separated lands of myth remain.", [systems(2)]),
    antiRisk("MYTHIC_REGIONS", "avoid-even-value", "Accept evenly distributed value risk"),
  ],
  ENCIRCLING_LANDS: [
    relaxation("ENCIRCLING_LANDS", "enclosed-seas", "Remove minor inner waters", "The enclosed water hierarchy becomes simpler.", [contractWater(), hierarchy()]),
    relaxation("ENCIRCLING_LANDS", "outer-circuit", "Widen weak circuit connections", "The outer land journey becomes less constrained but remains continuous.", [widen()]),
    relaxation("ENCIRCLING_LANDS", "avoid-broken-ring", "Repair the circuit with broader land connections", "The candidate is regenerated until the exterior circuit is continuous.", [widen(0.18)], "RETRY_NATIVE_GRAMMAR"),
  ],
  ASTRAL_PANGAEA: [
    relaxation("ASTRAL_PANGAEA", "alien-scars", "Remove secondary alien scars", "The pangaea retains fewer extraordinary internal systems.", [hierarchy()]),
    relaxation("ASTRAL_PANGAEA", "one-continent", "Widen surviving sutures", "The transformed continent becomes more robustly connected.", [widen()]),
    antiRisk("ASTRAL_PANGAEA", "avoid-ordinary-fracture", "Accept ordinary-fracture resemblance risk"),
  ],
  RIFTWORLD: [
    relaxation("RIFTWORLD", "viable-cells", "Merge the smallest lattice cells", "Fewer locally complete worlds remain inside the rift graph.", [systems(3)]),
    relaxation("RIFTWORLD", "rift-lattice", "Remove tertiary rifts", "The primary lattice survives with less hierarchical detail.", [hierarchy(3), contractWater()]),
    antiRisk("RIFTWORLD", "avoid-regular-grid", "Accept regular-lattice resemblance risk"),
  ],
  LONELY_OCEANS: [
    relaxation("LONELY_OCEANS", "viable-scarcity", "Remove city states before realm capacity", "Fewer city states occupy the isolated world.", [{ kind: "REDUCE_CITY_STATES", fraction: 0.5 }]),
    relaxation("LONELY_OCEANS", "empty-ocean", "Remove subordinate satellites", "The ocean grows emptier while local realm variety contracts.", [fragment()]),
    relaxation("LONELY_OCEANS", "one-major-per-realm", "Reduce major population", "A smaller major roster preserves one civilization per viable isolated realm.", [{ kind: "REDUCE_POPULATION", by: 1, minimum: 2 }]),
    relaxation("LONELY_OCEANS", "avoid-stepping-stone-bridges", "Remove accidental coast bridges", "The candidate is regenerated with fewer fragments until pre-Astronomy isolation is restored.", [fragment(0.06, 0.02)], "RETRY_NATIVE_GRAMMAR"),
    antiRisk("LONELY_OCEANS", "avoid-ordinary-archipelago", "Accept ordinary-archipelago resemblance risk"),
  ],
  PENINSULA_REALM: [
    relaxation("PENINSULA_REALM", "complete-peninsulas", "Remove minor peninsula provinces", "Fewer complete peninsular countries remain.", [systems(3)]),
    relaxation("PENINSULA_REALM", "shared-backbone", "Widen fragile peninsula necks", "Regional confinement becomes less severe while principal provinces remain attached.", [widen()]),
    antiRisk("PENINSULA_REALM", "avoid-detached-islands", "Accept detached-primary resemblance risk"),
  ],
  SHATTERED_ARCHIPELAGO: [
    relaxation("SHATTERED_ARCHIPELAGO", "deep-chain-gaps", "Broaden secondary chain approaches", "Some parent chains become easier to cross.", [widen(0.1)]),
    relaxation("SHATTERED_ARCHIPELAGO", "anchor-rhythm", "Remove minor satellites", "Anchor-to-satellite rhythm becomes simpler.", [fragment()]),
    relaxation("SHATTERED_ARCHIPELAGO", "parent-arcs", "Reduce parent-system count", "Fewer directional necklaces and crescents remain.", [systems(3)]),
    antiRisk("SHATTERED_ARCHIPELAGO", "avoid-random-island-scatter", "Accept random-island resemblance risk"),
    antiRisk("SHATTERED_ARCHIPELAGO", "avoid-uniform-islands", "Accept uniform-island resemblance risk"),
  ],

  DYNAMIC_EARTH: [
    relaxation("DYNAMIC_EARTH", "age-contrast", "Remove minor transformations", "Fewer geological stages remain conspicuous.", [softenRelief(), softenClimate()]),
    relaxation("DYNAMIC_EARTH", "mixed-processes", "Reduce process-province count", "The physical world retains fewer interacting regimes.", [systems(3)]),
    antiRisk("DYNAMIC_EARTH", "avoid-single-process", "Accept single-process resemblance risk"),
  ],
  COLLIDING_PLATES: [
    relaxation("COLLIDING_PLATES", "forelands", "Soften secondary foreland relief", "Some plateaus and trapped basins become less pronounced.", [softenRelief()]),
    relaxation("COLLIDING_PLATES", "collision-belts", "Reduce collision-belt count", "Fewer convergent systems dominate the world.", [systems(2)]),
    antiRisk("COLLIDING_PLATES", "avoid-quiet-interiors", "Accept quiet-relief resemblance risk"),
  ],
  ANCIENT_CRATONS: [
    relaxation("ANCIENT_CRATONS", "mature-drainage", "Simplify mature drainage", "Old river systems retain fewer branches.", [reduceHydrology()]),
    relaxation("ANCIENT_CRATONS", "shield-cores", "Reduce shield count", "Fewer ancient continental cores remain distinct.", [systems(2)]),
    antiRisk("ANCIENT_CRATONS", "avoid-young-global-relief", "Accept young-relief resemblance risk"),
  ],
  ISLAND_ARC_EARTH: [
    relaxation("ISLAND_ARC_EARTH", "trench-offset", "Simplify back-arc structure", "Some trench, forearc, or sheltered-sea detail becomes less explicit.", [hierarchy(), contractWater()]),
    relaxation("ISLAND_ARC_EARTH", "volcanic-arcs", "Reduce subduction-arc count", "Fewer volcanic pearl systems remain.", [systems(2)]),
    antiRisk("ISLAND_ARC_EARTH", "avoid-random-volcanism", "Accept random-volcanism resemblance risk"),
  ],
  SUPERCONTINENT_INTERIOR: [
    relaxation("SUPERCONTINENT_INTERIOR", "inward-drainage", "Remove secondary terminal basins", "The inward-draining system becomes simpler.", [reduceHydrology(0, 1), contractWater()]),
    relaxation("SUPERCONTINENT_INTERIOR", "landbound-heart", "Contract the interior sea", "The landbound heart becomes smaller but remains enclosed.", [contractWater()]),
    antiRisk("SUPERCONTINENT_INTERIOR", "avoid-open-ocean-dominance", "Accept external-ocean resemblance risk"),
  ],
  MONSOON_CONTINENTS: [
    relaxation("MONSOON_CONTINENTS", "dry-wet-contrast", "Soften rainfall contrast", "Wet coasts and dry interiors become less sharply opposed.", [softenClimate()]),
    relaxation("MONSOON_CONTINENTS", "seasonal-deluge", "Reduce monsoon catchment count", "Fewer seasonal river systems dominate the continents.", [reduceHydrology(1, 1)]),
    antiRisk("MONSOON_CONTINENTS", "avoid-uniform-rain", "Accept uniform-rainfall resemblance risk"),
  ],
  ICEHOUSE_EARTH: [
    relaxation("ICEHOUSE_EARTH", "frontier-value", "Improve cold frontier habitability", "Frozen settlement becomes easier and less dependent on specialized value.", [softenContent()]),
    relaxation("ICEHOUSE_EARTH", "temperate-refuges", "Enlarge productive refuges", "Temperate country occupies more of the glacial world.", [softenClimate()]),
    relaxation("ICEHOUSE_EARTH", "broad-ice-sheets", "Reduce ice-sheet extent", "The advancing cold becomes less dominant.", [systems(1), softenClimate()]),
    antiRisk("ICEHOUSE_EARTH", "avoid-straight-polar-bands", "Accept straight-biome-band resemblance risk"),
    antiRisk("ICEHOUSE_EARTH", "avoid-worthless-cold", "Accept worthless-frontier risk"),
  ],

  IMPERIAL_RING: [
    relaxation("IMPERIAL_RING", "shared-axle", "Reduce secondary central objectives", "The shared axle remains but offers fewer distinct prizes.", [reduceObjectives()]),
    relaxation("IMPERIAL_RING", "start-ring", "Widen axle approaches", "Outer realms converge less tightly on the centre.", [widen()]),
    antiRisk("IMPERIAL_RING", "avoid-radial-only", "Accept radial-only resemblance risk"),
  ],
  OPPOSING_FRONTS: [
    relaxation("OPPOSING_FRONTS", "plural-breaches", "Widen invasion theatres", "Front crossings become broader and less individually decisive.", [widen()]),
    relaxation("OPPOSING_FRONTS", "two-sides", "Broaden side-to-side contact", "The two-team frontier becomes less severe while team territories remain coherent.", [widen(0.08)]),
    relaxation("OPPOSING_FRONTS", "avoid-single-breach", "Add width around frontier crossings", "The candidate is regenerated until no single brittle breach controls contact.", [widen(0.2)], "RETRY_NATIVE_GRAMMAR"),
  ],
  CONTESTED_HEARTLAND: [
    relaxation("CONTESTED_HEARTLAND", "central-value", "Reduce secondary heartland objectives", "The central prize remains valuable with fewer concentrated objectives.", [reduceObjectives(), softenContent()]),
    relaxation("CONTESTED_HEARTLAND", "many-approaches", "Widen approach mesh", "Routes become easier and less tactically distinct.", [widen()]),
    relaxation("CONTESTED_HEARTLAND", "avoid-radial-spokes", "Add lateral approach connections", "The candidate is regenerated until radial-only play is broken.", [widen(0.18)], "RETRY_NATIVE_GRAMMAR"),
  ],
  RIVAL_CONTINENTS: [
    relaxation("RIVAL_CONTINENTS", "hinge-theatres", "Remove minor hinge theatre", "Fewer expensive crossings connect the rival worlds.", [reduceObjectives()]),
    relaxation("RIVAL_CONTINENTS", "two-blocs", "Widen principal hinges", "Bloc separation becomes less severe while both worlds remain coherent.", [widen()]),
    relaxation("RIVAL_CONTINENTS", "avoid-impassable-divide", "Broaden an accessible hinge", "The candidate is regenerated until the global divide is passable.", [widen(0.2)], "RETRY_NATIVE_GRAMMAR"),
  ],
  THREE_REALMS: [
    relaxation("THREE_REALMS", "victory-triangle", "Remove secondary victory routes", "The strategic triangle retains fewer optional theatres.", [reduceObjectives(2)]),
    relaxation("THREE_REALMS", "three-borders", "Widen difficult pairwise borders", "All three contact pairs survive with lower transit cost.", [widen()]),
    relaxation("THREE_REALMS", "avoid-one-isolated-realm", "Restore missing pairwise contact", "The candidate is regenerated until no realm is strategically isolated.", [widen(0.2)], "RETRY_NATIVE_GRAMMAR"),
  ],
  THALASSIC_LEAGUE: [
    relaxation("THALASSIC_LEAGUE", "sea-lanes", "Widen principal sea lanes", "Naval movement becomes easier and local gates less decisive.", [widen()]),
    relaxation("THALASSIC_LEAGUE", "port-network", "Reduce city-state pressure", "Fewer minor powers participate before the major port network is weakened.", [{ kind: "REDUCE_CITY_STATES", fraction: 0.5 }]),
    relaxation("THALASSIC_LEAGUE", "avoid-isolated-port", "Add an alternate sea-lane connection", "The candidate is regenerated until no principal port is brittle or isolated.", [widen(0.18)], "RETRY_NATIVE_GRAMMAR"),
  ],
  UNEQUAL_REALMS: [
    relaxation("UNEQUAL_REALMS", "viable-asymmetry", "Raise the weakest viability floor", "Role differences become less severe to protect the weakest start.", [softenContent(), widen()]),
    relaxation("UNEQUAL_REALMS", "role-contracts", "Reduce role severity", "Tall, Wide, War, and Turtle remain distinct but less extreme.", [softenContent(0.18), widen(0.08)]),
    relaxation("UNEQUAL_REALMS", "avoid-hidden-imbalance", "Rebuild accidental imbalance", "The candidate is regenerated; undisclosed or illegal imbalance is never accepted.", [softenContent(), widen()], "RETRY_NATIVE_GRAMMAR"),
  ],
} as const satisfies Record<MapPresetId, readonly NarrativeNativeRelaxationStep[]>;

const ENGINE_BY_ID: Record<MapPresetId, GenerationEngine> = {
  ...Object.fromEntries(Object.keys(EXCOGITARE).map((id) => [id, "EXCOGITARE"])),
  ...Object.fromEntries(Object.keys(ECCENTRIC).map((id) => [id, "ECCENTRIC"])),
  ...Object.fromEntries(Object.keys(PHYSICAL).map((id) => [id, "PHYSICAL"])),
  ...Object.fromEntries(Object.keys(POLIS).map((id) => [id, "POLIS"])),
} as Record<MapPresetId, GenerationEngine>;

const SEEDS = { ...EXCOGITARE, ...ECCENTRIC, ...PHYSICAL, ...POLIS } satisfies Record<MapPresetId, ContractSeed>;

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

const NATIVE_CONTRACT_ENTRIES = (Object.entries(SEEDS) as [MapPresetId, ContractSeed][]).map(([profileId, seed]) => [profileId, {
  schemaVersion: 1,
  profileId,
  engine: ENGINE_BY_ID[profileId],
  ...seed,
  invariants: NATIVE_INVARIANTS[profileId],
  relaxationPolicy: RELAXATION_POLICIES[profileId],
} satisfies NarrativeGenerativeContract] as const);

export const NARRATIVE_NATIVE_CONTRACTS = deepFreeze(Object.fromEntries(NATIVE_CONTRACT_ENTRIES) as unknown as Record<MapPresetId, NarrativeGenerativeContract>);

export function narrativeNativeContract(profileId: MapPresetId) {
  const contract = NARRATIVE_NATIVE_CONTRACTS[profileId];
  if (!contract) throw new Error(`Missing native narrative contract for ${profileId}.`);
  return contract;
}

function assertFiniteRange(value: readonly [number, number], label: string) {
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => !Number.isFinite(item)) || value[0] > value[1]) {
    throw new Error(`${label} must be an ordered finite range.`);
  }
}

function assertUnit(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1.`);
}

function assertPositiveUnit(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0 || value > 1) throw new Error(`${label} must be greater than 0 and no greater than 1.`);
}

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INVARIANT_CATEGORIES = new Set<NarrativeInvariantCategory>(["TOPOLOGY", "ACCESSIBILITY", "HYDROLOGY", "CAPACITY", "CAUSALITY", "STRATEGY"]);
const INVARIANT_PROOF_STAGES = new Set<NarrativeInvariantProofStage>(["NATIVE_PLAN", "LEGAL_NORMALIZED", "STRATEGIC_GRAPH"]);
const RELAXATION_MODES = new Set<NarrativeNativeRelaxationStep["mode"]>(["RETRY_NATIVE_GRAMMAR", "WEAKEN_IDENTITY", "ACCEPT_ANTI_MOTIF_RISK"]);

function validateRelaxationOperation(operation: NarrativeNativeRelaxationOperation, label: string) {
  if (!operation || typeof operation !== "object") throw new Error(`${label} must be an object.`);
  switch (operation.kind) {
    case "REDUCE_PRIMARY_SYSTEMS":
      assertPositiveInteger(operation.by, `${label}.by`);
      assertPositiveInteger(operation.minimum, `${label}.minimum`);
      return;
    case "REDUCE_HIERARCHY":
      if (operation.by !== 1) throw new Error(`${label}.by must be 1.`);
      if (![1, 2, 3].includes(operation.minimum)) throw new Error(`${label}.minimum must be 1, 2 or 3.`);
      return;
    case "REDUCE_FRAGMENTATION":
      assertPositiveUnit(operation.by, `${label}.by`);
      assertUnit(operation.minimum, `${label}.minimum`);
      return;
    case "WIDEN_CONNECTIONS":
    case "CONTRACT_WATER_SYSTEMS":
      assertPositiveUnit(operation.by, `${label}.by`);
      return;
    case "SOFTEN_RELIEF":
    case "SOFTEN_CLIMATE":
    case "SOFTEN_CONTENT_CONTRAST":
      assertPositiveUnit(operation.by, `${label}.by`);
      assertUnit(operation.minimum, `${label}.minimum`);
      return;
    case "REDUCE_HYDROLOGY_BRANCHING":
      assertNonNegativeInteger(operation.catchmentsBy, `${label}.catchmentsBy`);
      assertNonNegativeInteger(operation.tributariesBy, `${label}.tributariesBy`);
      if (operation.catchmentsBy + operation.tributariesBy < 1) throw new Error(`${label} must reduce at least one hydrology dimension.`);
      return;
    case "REDUCE_OBJECTIVES":
      assertPositiveInteger(operation.by, `${label}.by`);
      assertNonNegativeInteger(operation.minimum, `${label}.minimum`);
      return;
    case "REDUCE_CITY_STATES":
      assertPositiveUnit(operation.fraction, `${label}.fraction`);
      return;
    case "REDUCE_POPULATION":
      assertPositiveInteger(operation.by, `${label}.by`);
      if (!Number.isInteger(operation.minimum) || operation.minimum < 2) throw new Error(`${label}.minimum must preserve at least two major civilizations.`);
      return;
    case "ACCEPT_ANTI_MOTIF_RISK":
      if (!ID_PATTERN.test(operation.motifId)) throw new Error(`${label}.motifId must be a stable lower-kebab-case identifier.`);
      return;
    default: {
      const exhaustive: never = operation;
      throw new Error(`${label} has unsupported operation ${(exhaustive as { kind?: unknown }).kind}.`);
    }
  }
}

/** Runtime validation deliberately lives beside the catalogue so persisted or hand-authored
 * programmes cannot smuggle an engine-incompatible grammar into generation. */
export function validateNarrativeNativeContract(
  contract: NarrativeGenerativeContract,
  profileId: MapPresetId,
  engine: GenerationEngine,
) {
  if (!contract || typeof contract !== "object") throw new Error("Narrative generative contract must be an object.");
  if (contract.schemaVersion !== 1) throw new Error(`Unsupported narrative generative contract schema ${String(contract.schemaVersion)}.`);
  if (contract.profileId !== profileId) throw new Error(`Narrative generative contract ${contract.profileId} does not match ${profileId}.`);
  if (contract.engine !== engine) throw new Error(`Narrative generative contract engine ${contract.engine} does not match ${engine}.`);
  const expectedPrefix = engine === "EXCOGITARE" ? "FIELD_" : engine === "ECCENTRIC" ? "GRAPH_" : engine === "PHYSICAL" ? "PHYSICAL_" : "POLIS_";
  if (!contract.family.startsWith(expectedPrefix)) throw new Error(`${contract.family} is not a native ${engine} grammar.`);
  assertFiniteRange(contract.topology.primarySystems, "topology.primarySystems");
  assertUnit(contract.topology.fragmentation, "topology.fragmentation");
  assertUnit(contract.topology.anisotropy, "topology.anisotropy");
  assertUnit(contract.relief.alignment, "relief.alignment");
  assertUnit(contract.relief.continuity, "relief.continuity");
  assertUnit(contract.relief.peripheralCoverage, "relief.peripheralCoverage");
  assertUnit(contract.climate.contrast, "climate.contrast");
  assertUnit(contract.climate.latitudeAuthority, "climate.latitudeAuthority");
  assertUnit(contract.gameplay.navalDependence, "gameplay.navalDependence");
  assertUnit(contract.content.valueContrast, "content.valueContrast");
  assertUnit(contract.content.wonderBias, "content.wonderBias");
  assertUnit(contract.content.coastalValue, "content.coastalValue");
  assertUnit(contract.content.hostileFrontierValue, "content.hostileFrontierValue");
  assertUnit(contract.content.cityStateContestability, "content.cityStateContestability");
  if (contract.content.sitePolicy) {
    if (contract.content.sitePolicy.activationCharacter !== "BRUTAL") throw new Error("content.sitePolicy.activationCharacter must be BRUTAL.");
    if (contract.content.sitePolicy.theatre !== "CONTESTED_DMZ") throw new Error("content.sitePolicy.theatre must be CONTESTED_DMZ.");
    assertUnit(contract.content.sitePolicy.barbarianShare, "content.sitePolicy.barbarianShare");
    assertUnit(contract.content.sitePolicy.ruinShare, "content.sitePolicy.ruinShare");
    assertUnit(contract.content.sitePolicy.falloutDensity, "content.sitePolicy.falloutDensity");
    if (!Number.isInteger(contract.content.sitePolicy.siteSpacing) || contract.content.sitePolicy.siteSpacing < 1) throw new Error("content.sitePolicy.siteSpacing must be a positive integer.");
    if (!Number.isInteger(contract.content.sitePolicy.falloutMaximum) || contract.content.sitePolicy.falloutMaximum < 1) throw new Error("content.sitePolicy.falloutMaximum must be a positive integer.");
    if (!Number.isInteger(contract.content.sitePolicy.falloutStartBuffer) || contract.content.sitePolicy.falloutStartBuffer < 1) throw new Error("content.sitePolicy.falloutStartBuffer must be a positive integer.");
  }
  if (!Number.isInteger(contract.topology.primarySystems[0]) || !Number.isInteger(contract.topology.primarySystems[1]) || contract.topology.primarySystems[0] < 1) throw new Error("topology.primarySystems must contain positive integer counts.");
  if (!Number.isInteger(contract.relief.minimumPasses) || contract.relief.minimumPasses < 0) throw new Error("relief.minimumPasses must be a non-negative integer.");
  if (!Number.isInteger(contract.hydrology.minimumCatchments) || contract.hydrology.minimumCatchments < 0 || !Number.isInteger(contract.hydrology.minimumTributaries) || contract.hydrology.minimumTributaries < 0) throw new Error("Hydrology minimums must be non-negative integers.");
  if (!Number.isInteger(contract.gameplay.minimumStartDistance) || contract.gameplay.minimumStartDistance < 5) throw new Error(`${profileId} must retain the global five-hex minimum start distance.`);
  if (!Array.isArray(contract.invariants) || !contract.invariants.length) throw new Error(`${profileId} must define at least one non-relaxable native invariant.`);
  const invariantIds = new Set<string>();
  for (const [index, invariant] of contract.invariants.entries()) {
    if (!ID_PATTERN.test(invariant.id)) throw new Error(`${profileId}.invariants[${index}].id must be a stable lower-kebab-case identifier.`);
    if (invariantIds.has(invariant.id)) throw new Error(`${profileId} contains duplicate native invariant ${invariant.id}.`);
    invariantIds.add(invariant.id);
    if (!INVARIANT_CATEGORIES.has(invariant.category)) throw new Error(`${profileId}.${invariant.id} has an unsupported invariant category.`);
    if (!INVARIANT_PROOF_STAGES.has(invariant.proofStage)) throw new Error(`${profileId}.${invariant.id} has an unsupported proof stage.`);
    if (!invariant.requirement.trim()) throw new Error(`${profileId}.${invariant.id} must describe its required relationship.`);
  }
  if (!Array.isArray(contract.relaxationPolicy) || !contract.relaxationPolicy.length) throw new Error(`${profileId} must define an authored native relaxation policy.`);
  const relaxationIds = new Set<string>();
  const relaxedConstraintIds = new Set<string>();
  for (const [stepIndex, step] of contract.relaxationPolicy.entries()) {
    const label = `${profileId}.relaxationPolicy[${stepIndex}]`;
    if (!ID_PATTERN.test(step.id)) throw new Error(`${label}.id must be a stable lower-kebab-case identifier.`);
    if (relaxationIds.has(step.id)) throw new Error(`${profileId} contains duplicate native relaxation ${step.id}.`);
    relaxationIds.add(step.id);
    if (!step.label.trim() || !step.consequence.trim()) throw new Error(`${label} must describe both its action and consequence.`);
    if (!RELAXATION_MODES.has(step.mode)) throw new Error(`${label}.mode is unsupported.`);
    if (!Array.isArray(step.constraintIds) || !step.constraintIds.length) throw new Error(`${label}.constraintIds must not be empty.`);
    for (const constraintId of step.constraintIds) {
      if (!ID_PATTERN.test(constraintId)) throw new Error(`${label} references malformed constraint ${constraintId}.`);
      if (relaxedConstraintIds.has(constraintId)) throw new Error(`${profileId} relaxes ${constraintId} more than once.`);
      relaxedConstraintIds.add(constraintId);
    }
    if (!Array.isArray(step.operations) || !step.operations.length) throw new Error(`${label} must change the native grammar with at least one typed operation.`);
    step.operations.forEach((operation: NarrativeNativeRelaxationOperation, operationIndex: number) => validateRelaxationOperation(operation, `${label}.operations[${operationIndex}]`));
    const riskOperations = step.operations.filter((operation: NarrativeNativeRelaxationOperation) => operation.kind === "ACCEPT_ANTI_MOTIF_RISK");
    if (step.mode === "ACCEPT_ANTI_MOTIF_RISK") {
      if (riskOperations.length !== 1 || step.operations.length !== 1) throw new Error(`${label} anti-motif acceptance must contain exactly one ACCEPT_ANTI_MOTIF_RISK operation.`);
    } else if (riskOperations.length) throw new Error(`${label} may only accept anti-motif risk in ACCEPT_ANTI_MOTIF_RISK mode.`);
    if (!Array.isArray(step.preserves) || step.preserves.length !== invariantIds.size || new Set<string>(step.preserves).size !== invariantIds.size || step.preserves.some((id: string) => !invariantIds.has(id))) {
      throw new Error(`${label} must explicitly preserve every non-relaxable invariant.`);
    }
  }
  if (!Array.isArray(contract.causalRequirements) || contract.causalRequirements.length < 3 || contract.causalRequirements.some((requirement) => !requirement.trim())) throw new Error(`${profileId} must define at least three non-empty causal requirements.`);
  if (!Array.isArray(contract.softPreferences) || contract.softPreferences.length < 3 || contract.softPreferences.some((preference) => !preference.trim())) throw new Error(`${profileId} must define at least three authored soft preferences.`);
}
