import type { GenerationEngine } from "./map-generator.ts";
import type { NarrativeConstraintProgram } from "./narrative-constraints.ts";
import { narrativeNativeContract, type NarrativeGenerativeContract, type NarrativeGrammarFamily, type NarrativeNativeRelaxationOperation } from "./narrative-native-contracts.ts";
import type { NarrativeSkeleton, NarrativeSkeletonRegion, NarrativeSkeletonRelationship } from "./narrative-types.ts";
import { generationSpace, spaceOffset, spaceSegmentDistance, tilePoint, type GenerationSpace } from "./generation-space.ts";

export const NARRATIVE_ADAPTER_SCHEMA_VERSION = 1 as const;

type RegionEffect = NonNullable<NarrativeSkeletonRegion["effect"]>;
type RelationshipEffect = NonNullable<NarrativeSkeletonRelationship["effect"]>;

export type NarrativeFieldSource = {
  id: string;
  role: string;
  effect: RegionEffect;
  parentId?: string;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  strength: number;
};

export type NarrativePathReservation = {
  id: string;
  kind: string;
  effect: RelationshipEffect;
  from: string;
  to: string;
  points: Array<{ x: number; y: number }>;
  width: number;
  strength: number;
};

export type NarrativeRegionReservation = {
  id: string;
  role: string;
  effect: RegionEffect;
  parentId?: string;
  anchor: { x: number; y: number };
  radius: number;
  priority: number;
};

type NativePlanCommon = {
  coordinateSpace?: "HEX";
  schemaVersion: 1;
  profileId: NarrativeConstraintProgram["profileId"];
  grammarFamily: NarrativeGrammarFamily;
  contract: NarrativeGenerativeContract;
  regions: NarrativeRegionReservation[];
  paths: NarrativePathReservation[];
  appliedRelaxations: Array<{ id: string; operations: readonly NarrativeNativeRelaxationOperation[]; consequence: string }>;
  populationAdjustment: { reduceMajorsBy: number; minimumMajors: number; cityStateFraction: number };
  connectionScale: number;
  waterSystemScale: number;
};

export type ExcogitareFieldPlan = NativePlanCommon & {
  engine: "EXCOGITARE";
  kind: "FIELD_PLAN";
  sources: NarrativeFieldSource[];
  thresholdPolicy: { fragmentation: number; anisotropy: number; edgePolicy: NarrativeGenerativeContract["topology"]["edgePolicy"] };
};

export type EccentricGraphPlan = NativePlanCommon & {
  engine: "ECCENTRIC";
  kind: "GRAPH_PLAN";
  reservationPolicy: {
    hierarchyDepth: number;
    primarySystems: readonly [number, number];
    connectivity: NarrativeGenerativeContract["topology"]["connectivity"];
    protectedWater: boolean;
    protectedLand: boolean;
  };
};

export type PhysicalConditionPlan = NativePlanCommon & {
  engine: "PHYSICAL";
  kind: "PHYSICAL_PLAN";
  conditions: {
    plateSystems: readonly [number, number];
    fragmentation: number;
    reliefMode: NarrativeGenerativeContract["relief"]["mode"];
    boundaryAlignment: number;
    climateMode: NarrativeGenerativeContract["climate"]["mode"];
    latitudeAuthority: number;
    hydrologyMode: NarrativeGenerativeContract["hydrology"]["mode"];
  };
};

export type PolisStrategicPlan = NativePlanCommon & {
  engine: "POLIS";
  kind: "STRATEGIC_PLAN";
  obligations: {
    realmMode: NarrativeGenerativeContract["gameplay"]["realmMode"];
    minimumObjectives: number;
    routeRedundancy: number;
    minimumStartDistance: number;
    navalDependence: number;
    capacityPolicy: NarrativeGenerativeContract["gameplay"]["capacityPolicy"];
  };
};

export type NativeNarrativePlan = ExcogitareFieldPlan | EccentricGraphPlan | PhysicalConditionPlan | PolisStrategicPlan;

export type NarrativeCausalObject = {
  id: string;
  nativeObjectId: string;
  role: string;
  kind: "REGION" | "RELATIONSHIP";
  cause: string;
  strength: number;
  retained: boolean;
};

export type NarrativeAdapterEvidence = {
  schemaVersion: 1;
  engine: GenerationEngine;
  profileId: NarrativeConstraintProgram["profileId"];
  programHash: string;
  adapter: "FIELD_BOUNDARY" | "GRAPH_RESERVATION" | "PHYSICAL_BOUNDARY" | "STRATEGIC_DISGUISE";
  grammarFamily: NarrativeGrammarFamily;
  causalObjects: NarrativeCausalObject[];
  conflicts: string[];
  relaxations: string[];
  diagnostics: {
    regions: number;
    relationships: number;
    nativeReservations: number;
    missingExplicitEffects: number;
    topologyInfluences: number;
    reliefInfluences: number;
    climateInfluences: number;
    hydrologyInfluences: number;
  };
};

export type NarrativeAdapterPlan = {
  native: NativeNarrativePlan;
  evidence: NarrativeAdapterEvidence;
  /** Compatibility rasters are derived from, never authoritative over, the native plan. */
  topology: number[];
  relief: number[];
  temperature: number[];
  moisture: number[];
  rivers: number[];
};

function clamp(value: number, minimum = -1, maximum = 1) { return Math.max(minimum, Math.min(maximum, value)); }

function stableUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0) / 0xffffffff;
}

function engineAdapter(engine: GenerationEngine): NarrativeAdapterEvidence["adapter"] {
  if (engine === "PHYSICAL") return "PHYSICAL_BOUNDARY";
  if (engine === "ECCENTRIC") return "GRAPH_RESERVATION";
  if (engine === "POLIS") return "STRATEGIC_DISGUISE";
  return "FIELD_BOUNDARY";
}

function causeFor(engine: GenerationEngine, effect: RegionEffect | RelationshipEffect) {
  if (engine === "PHYSICAL") {
    if (effect === "RIDGE" || effect === "RIDGE_PATH" || effect === "VOLCANIC") return "retained-boundary-motion-and-uplift";
    if (effect === "WATER" || effect === "WATER_PATH" || effect === "LOWLAND") return "retained-subsidence-and-sea-level";
    if (effect === "WET" || effect === "DRY" || effect === "HOT" || effect === "COLD" || effect === "TRANSITION") return "retained-circulation-and-continentality";
    if (effect === "RIVER_PATH") return "retained-runoff-catchment-and-outlet";
    return "retained-continental-crust-condition";
  }
  if (engine === "ECCENTRIC") {
    if (effect.endsWith("_PATH")) return "reserved-parent-graph-edge";
    if (effect === "WATER") return "reserved-basin-component";
    if (effect === "RIDGE" || effect === "VOLCANIC") return "reserved-boundary-range";
    return "reserved-parent-polygon-role";
  }
  if (engine === "POLIS") return effect.endsWith("_PATH") ? "strategic-edge-before-geographic-disguise" : "strategic-region-before-geographic-disguise";
  if (effect.endsWith("_PATH")) return "named-anisotropic-spline-source";
  if (effect === "WATER" || effect === "LOWLAND") return "named-basin-field-source";
  if (effect === "RIDGE" || effect === "VOLCANIC") return "named-ridge-field-source";
  return "named-continental-field-source";
}

function regionReservation(region: NarrativeSkeletonRegion): NarrativeRegionReservation | undefined {
  if (!region.effect) return undefined;
  return { id: region.id, role: region.role, effect: region.effect, ...(region.parentId ? { parentId: region.parentId } : {}), anchor: { x: region.x, y: region.y }, radius: region.radius, priority: region.priority };
}

function pathReservation(relationship: NarrativeSkeletonRelationship, width: number, height: number): NarrativePathReservation | undefined {
  if (!relationship.effect) return undefined;
  return { id: relationship.id, kind: relationship.kind, effect: relationship.effect, from: relationship.from, to: relationship.to, points: relationship.points.map((point) => ({ ...point })), width: Math.max(0.008, 2.8 / Math.max(width, height)), strength: relationship.strength };
}

function relaxedContract(program: NarrativeConstraintProgram, appliedRelaxationIds: readonly string[]) {
  const source = program.generative ?? narrativeNativeContract(program.profileId);
  const contract = structuredClone(source) as NarrativeGenerativeContract;
  const prefix = source.relaxationPolicy.slice(0, appliedRelaxationIds.length);
  if (prefix.some((step, index) => step.id !== appliedRelaxationIds[index])) throw new Error(`Native narrative relaxation for ${program.profileId} must use an authored ordered prefix.`);
  let connectionScale = 1;
  let waterSystemScale = 1;
  let reduceMajorsBy = 0;
  let minimumMajors = 2;
  let cityStateFraction = 1;
  let reducedSystems = 0;
  let hierarchyScale = 1;
  let fragmentationScale = 1;
  let reliefScale = 1;
  let climateScale = 1;
  let hydrologyScale = 1;
  let reducedObjectives = 0;
  const mutable = contract as unknown as {
    topology: { primarySystems: [number, number]; hierarchyDepth: 1 | 2 | 3 | 4; fragmentation: number };
    relief: { alignment: number; continuity: number };
    climate: { contrast: number };
    hydrology: { minimumCatchments: number; minimumTributaries: number };
    gameplay: { minimumObjectives: number };
    content: { valueContrast: number };
  };
  for (const step of prefix) for (const operation of step.operations) {
    if (operation.kind === "REDUCE_PRIMARY_SYSTEMS") {
      const before = [...mutable.topology.primarySystems] as const;
      mutable.topology.primarySystems[0] = Math.max(operation.minimum, mutable.topology.primarySystems[0] - operation.by);
      mutable.topology.primarySystems[1] = Math.max(mutable.topology.primarySystems[0], mutable.topology.primarySystems[1] - operation.by);
      reducedSystems += Math.max(before[0] - mutable.topology.primarySystems[0], before[1] - mutable.topology.primarySystems[1]);
    } else if (operation.kind === "REDUCE_HIERARCHY") {
      const before = mutable.topology.hierarchyDepth;
      mutable.topology.hierarchyDepth = Math.max(operation.minimum, mutable.topology.hierarchyDepth - operation.by) as 1 | 2 | 3 | 4;
      hierarchyScale *= 1 - (before - mutable.topology.hierarchyDepth) * 0.18;
    } else if (operation.kind === "REDUCE_FRAGMENTATION") {
      const before = mutable.topology.fragmentation;
      mutable.topology.fragmentation = Math.max(operation.minimum, mutable.topology.fragmentation - operation.by);
      fragmentationScale *= Math.max(0.45, 1 - (before - mutable.topology.fragmentation) * 1.5);
    }
    else if (operation.kind === "WIDEN_CONNECTIONS") connectionScale *= 1 + operation.by;
    else if (operation.kind === "CONTRACT_WATER_SYSTEMS") waterSystemScale *= Math.max(0.45, 1 - operation.by);
    else if (operation.kind === "SOFTEN_RELIEF") {
      const before = Math.max(mutable.relief.alignment, mutable.relief.continuity);
      mutable.relief.alignment = Math.max(operation.minimum, mutable.relief.alignment - operation.by);
      mutable.relief.continuity = Math.max(operation.minimum, mutable.relief.continuity - operation.by);
      reliefScale *= Math.max(0.45, 1 - (before - Math.max(mutable.relief.alignment, mutable.relief.continuity)));
    }
    else if (operation.kind === "SOFTEN_CLIMATE") {
      const before = mutable.climate.contrast;
      mutable.climate.contrast = Math.max(operation.minimum, mutable.climate.contrast - operation.by);
      climateScale *= Math.max(0.45, 1 - (before - mutable.climate.contrast));
    }
    else if (operation.kind === "REDUCE_HYDROLOGY_BRANCHING") {
      const beforeCatchments = mutable.hydrology.minimumCatchments;
      const beforeTributaries = mutable.hydrology.minimumTributaries;
      mutable.hydrology.minimumCatchments = Math.max(1, mutable.hydrology.minimumCatchments - operation.catchmentsBy);
      mutable.hydrology.minimumTributaries = Math.max(0, mutable.hydrology.minimumTributaries - operation.tributariesBy);
      const reduction = beforeCatchments - mutable.hydrology.minimumCatchments + (beforeTributaries - mutable.hydrology.minimumTributaries) * 0.5;
      hydrologyScale *= Math.max(0.4, 1 - reduction * 0.16);
    }
    else if (operation.kind === "REDUCE_OBJECTIVES") {
      const before = mutable.gameplay.minimumObjectives;
      mutable.gameplay.minimumObjectives = Math.max(operation.minimum, mutable.gameplay.minimumObjectives - operation.by);
      reducedObjectives += before - mutable.gameplay.minimumObjectives;
    }
    else if (operation.kind === "REDUCE_CITY_STATES") cityStateFraction *= Math.max(0, Math.min(1, operation.fraction));
    else if (operation.kind === "REDUCE_POPULATION") { reduceMajorsBy = Math.max(reduceMajorsBy, operation.by); minimumMajors = Math.max(minimumMajors, operation.minimum); }
    else if (operation.kind === "SOFTEN_CONTENT_CONTRAST") mutable.content.valueContrast = Math.max(operation.minimum, mutable.content.valueContrast - operation.by);
  }
  return {
    contract,
    appliedRelaxations: prefix.map((step) => ({ id: step.id, operations: structuredClone(step.operations), consequence: step.consequence })),
    populationAdjustment: { reduceMajorsBy, minimumMajors, cityStateFraction },
    connectionScale,
    waterSystemScale,
    reducedSystems,
    hierarchyScale,
    fragmentationScale,
    reliefScale,
    climateScale,
    hydrologyScale,
    reducedObjectives,
  };
}

const SECONDARY_RESERVATION = /(?:SECONDARY|MINOR|LOBE|FRAGMENT|SATELLITE|LAKE|SHELF|SHELTERED|BACK_ARC|FOREARC|TRIBUTARY)/;
const RELIEF_EFFECTS = new Set<RegionEffect | RelationshipEffect>(["RIDGE", "VOLCANIC", "LOWLAND", "RIDGE_PATH"]);
const CLIMATE_EFFECTS = new Set<RegionEffect | RelationshipEffect>(["WET", "DRY", "HOT", "COLD", "BARREN", "TRANSITION"]);

function relaxedNativePrimitives(
  sourceRegions: NarrativeRegionReservation[],
  sourcePaths: NarrativePathReservation[],
  effective: ReturnType<typeof relaxedContract>,
) {
  let regions = sourceRegions.map((region) => ({ ...region, anchor: { ...region.anchor } }));
  let paths = sourcePaths.map((path) => ({ ...path, points: path.points.map((point) => ({ ...point })) }));
  const scaleRegions = (ids: ReadonlySet<string>, radius: number, priority: number) => {
    regions = regions.map((region) => ids.has(region.id) ? { ...region, radius: Math.max(0.008, region.radius * radius), priority: region.priority * priority } : region);
  };
  const scalePaths = (ids: ReadonlySet<string>, width: number, strength: number) => {
    paths = paths.map((path) => ids.has(path.id) ? { ...path, width: Math.max(0.004, path.width * width), strength: path.strength * strength } : path);
  };

  if (effective.reducedSystems > 0) {
    const roots = regions.filter((region) => !region.parentId).sort((one, two) => one.radius - two.radius || one.priority - two.priority || one.id.localeCompare(two.id));
    const weakenedRoots = new Set(roots.slice(0, Math.min(roots.length, Math.max(1, Math.round(effective.reducedSystems)))).map((region) => region.id));
    const weakenedRegions = new Set(regions.filter((region) => weakenedRoots.has(region.id) || region.parentId && weakenedRoots.has(region.parentId)).map((region) => region.id));
    scaleRegions(weakenedRegions, 0.72, 0.62);
    scalePaths(new Set(paths.filter((path) => weakenedRegions.has(path.from) || weakenedRegions.has(path.to)).map((path) => path.id)), 0.82, 0.72);
  }

  if (effective.hierarchyScale < 1) {
    const secondaryRegions = new Set(regions.filter((region) => region.parentId || SECONDARY_RESERVATION.test(region.role)).map((region) => region.id));
    const secondaryPaths = new Set(paths.filter((path) => SECONDARY_RESERVATION.test(path.kind) || secondaryRegions.has(path.from) || secondaryRegions.has(path.to)).map((path) => path.id));
    scaleRegions(secondaryRegions, effective.hierarchyScale, Math.sqrt(effective.hierarchyScale));
    scalePaths(secondaryPaths, effective.hierarchyScale, Math.sqrt(effective.hierarchyScale));
  }

  if (effective.fragmentationScale < 1) {
    const subordinate = regions.filter((region) => region.parentId);
    const targets = new Set((subordinate.length ? subordinate : regions.filter((region) => region.effect !== "WATER")).map((region) => region.id));
    scaleRegions(targets, effective.fragmentationScale, Math.sqrt(effective.fragmentationScale));
    scalePaths(new Set(paths.filter((path) => targets.has(path.from) || targets.has(path.to)).map((path) => path.id)), Math.sqrt(effective.fragmentationScale), Math.sqrt(effective.fragmentationScale));
  }

  if (effective.waterSystemScale < 1) {
    scaleRegions(new Set(regions.filter((region) => region.effect === "WATER").map((region) => region.id)), effective.waterSystemScale, Math.sqrt(effective.waterSystemScale));
    scalePaths(new Set(paths.filter((path) => path.effect === "WATER_PATH").map((path) => path.id)), effective.waterSystemScale, Math.sqrt(effective.waterSystemScale));
  }

  if (effective.connectionScale > 1) {
    scalePaths(new Set(paths.filter((path) => path.effect === "LAND_PATH"
      || effective.contract.family === "GRAPH_BROKEN_ISLAND_CHAINS" && path.effect === "TRANSITION").map((path) => path.id)), effective.connectionScale, Math.sqrt(effective.connectionScale));
  }

  if (effective.reliefScale < 1) {
    scaleRegions(new Set(regions.filter((region) => RELIEF_EFFECTS.has(region.effect)).map((region) => region.id)), 1, effective.reliefScale);
    scalePaths(new Set(paths.filter((path) => RELIEF_EFFECTS.has(path.effect)).map((path) => path.id)), 1, effective.reliefScale);
  }

  if (effective.climateScale < 1) {
    scaleRegions(new Set(regions.filter((region) => CLIMATE_EFFECTS.has(region.effect)).map((region) => region.id)), 1, effective.climateScale);
    scalePaths(new Set(paths.filter((path) => CLIMATE_EFFECTS.has(path.effect)).map((path) => path.id)), 1, effective.climateScale);
  }

  if (effective.hydrologyScale < 1) {
    scalePaths(new Set(paths.filter((path) => path.effect === "RIVER_PATH").map((path) => path.id)), effective.hydrologyScale, effective.hydrologyScale);
  }

  if (effective.reducedObjectives > 0) {
    const objectiveRegions = regions.filter((region) => region.effect === "VALUE" || /(?:OBJECTIVE|ISTHMUS|PORT|HEART)/.test(region.role));
    const objectivePaths = paths.filter((path) => /(?:STRAIT|ISTHMUS|HINGE|APPROACH|BORDER|LANE)/.test(path.kind));
    const targets = [...objectivePaths.map((path) => ({ kind: "PATH" as const, id: path.id, strength: path.strength })), ...objectiveRegions.map((region) => ({ kind: "REGION" as const, id: region.id, strength: region.priority }))]
      .sort((one, two) => one.strength - two.strength || one.id.localeCompare(two.id))
      .slice(0, Math.max(1, Math.round(effective.reducedObjectives)));
    scaleRegions(new Set(targets.flatMap((target) => target.kind === "REGION" ? [target.id] : [])), 0.82, 0.68);
    scalePaths(new Set(targets.flatMap((target) => target.kind === "PATH" ? [target.id] : [])), 0.82, 0.68);
  }

  // A graph edge cannot causally relate a region to itself or to a region
  // absent from the effective native plan. Some highly fragmented skeletons
  // collapse their final secondary link onto the same cell; omitting that
  // non-edge here keeps the authoritative plan honest instead of leaving an
  // impossible relationship for the owner engine or evidence layer to hide.
  const regionIds = new Set(regions.map((region) => region.id));
  paths = paths.filter((path) => path.from !== path.to && regionIds.has(path.from) && regionIds.has(path.to));
  if (effective.contract.family === "GRAPH_RIFT_LATTICE") {
    const seenCellPairs = new Set<string>();
    paths = [...paths].sort((one, two) => Number(two.kind === "PRIMARY_RIFT") - Number(one.kind === "PRIMARY_RIFT") || one.id.localeCompare(two.id)).filter((path) => {
      if (path.kind !== "PRIMARY_RIFT" && path.kind !== "SECONDARY_RIFT") return true;
      const key = [path.from, path.to].sort().join("|");
      if (seenCellPairs.has(key)) return false;
      seenCellPairs.add(key);
      return true;
    });
  }

  return { regions, paths };
}

function createNativePlan(program: NarrativeConstraintProgram, skeleton: NarrativeSkeleton, appliedRelaxationIds: readonly string[]): NativeNarrativePlan {
  const effective = relaxedContract(program, appliedRelaxationIds);
  const { contract } = effective;
  const { regions, paths } = relaxedNativePrimitives(
    skeleton.regions.flatMap((region) => regionReservation(region) ?? []),
    skeleton.relationships.flatMap((relationship) => pathReservation(relationship, skeleton.width, skeleton.height) ?? []),
    effective,
  );
  const common: NativePlanCommon = {
    schemaVersion: 1,
    profileId: program.profileId,
    grammarFamily: contract.family,
    contract,
    regions,
    paths,
    appliedRelaxations: effective.appliedRelaxations,
    populationAdjustment: effective.populationAdjustment,
    connectionScale: effective.connectionScale,
    waterSystemScale: effective.waterSystemScale,
  };
  if (program.engine === "EXCOGITARE") {
    const sources = regions.map((region) => {
      const stretch = 1 + contract.topology.anisotropy * (0.35 + stableUnit(`${skeleton.seed}:${region.id}:stretch`) * 1.15);
      return { id: `field-${region.id}`, role: region.role, effect: region.effect, ...(region.parentId ? { parentId: region.parentId } : {}), x: region.anchor.x, y: region.anchor.y, radiusX: Math.max(0.012, region.radius * stretch), radiusY: Math.max(0.012, region.radius / Math.sqrt(stretch)), rotation: stableUnit(`${skeleton.seed}:${region.id}:rotation`) * Math.PI * 2, strength: region.priority };
    });
    return { ...common, engine: "EXCOGITARE", kind: "FIELD_PLAN", sources, thresholdPolicy: { fragmentation: contract.topology.fragmentation, anisotropy: contract.topology.anisotropy, edgePolicy: contract.topology.edgePolicy } };
  }
  if (program.engine === "ECCENTRIC") return { ...common, engine: "ECCENTRIC", kind: "GRAPH_PLAN", reservationPolicy: { hierarchyDepth: contract.topology.hierarchyDepth, primarySystems: contract.topology.primarySystems, connectivity: contract.topology.connectivity, protectedWater: regions.some((region) => region.effect === "WATER") || paths.some((path) => path.effect === "WATER_PATH"), protectedLand: regions.some((region) => region.effect === "LAND" || region.effect === "VALUE") || paths.some((path) => path.effect === "LAND_PATH") } };
  if (program.engine === "PHYSICAL") return { ...common, engine: "PHYSICAL", kind: "PHYSICAL_PLAN", conditions: { plateSystems: contract.topology.primarySystems, fragmentation: contract.topology.fragmentation, reliefMode: contract.relief.mode, boundaryAlignment: contract.relief.alignment, climateMode: contract.climate.mode, latitudeAuthority: contract.climate.latitudeAuthority, hydrologyMode: contract.hydrology.mode } };
  return { ...common, engine: "POLIS", kind: "STRATEGIC_PLAN", obligations: { realmMode: contract.gameplay.realmMode, minimumObjectives: contract.gameplay.minimumObjectives, routeRedundancy: contract.gameplay.routeRedundancy, minimumStartDistance: contract.gameplay.minimumStartDistance, navalDependence: contract.gameplay.navalDependence, capacityPolicy: contract.gameplay.capacityPolicy } };
}

function pointCoordinates(index: number, width: number, height: number) { return { x: (index % width + 0.5) / width, y: (Math.floor(index / width) + 0.5) / height }; }
function wrappedDx(one: number, two: number, wraps: boolean) { const direct = Math.abs(one - two); return wraps ? Math.min(direct, 1 - direct) : direct; }

function fieldInfluence(index: number, source: NarrativeFieldSource, width: number, height: number, wraps: boolean, space?: GenerationSpace) {
  const point = pointCoordinates(index, width, height);
  let dx = wrappedDx(point.x, source.x, wraps);
  if (point.x < source.x) dx = -dx;
  let dy = point.y - source.y;
  if (space) ({ x: dx, y: dy } = spaceOffset(tilePoint(index, width, height), source, space, wraps));
  const cosine = Math.cos(source.rotation); const sine = Math.sin(source.rotation);
  const rotatedX = dx * cosine - dy * sine; const rotatedY = dx * sine + dy * cosine;
  return clamp(1 - Math.hypot(rotatedX / source.radiusX, rotatedY / source.radiusY) / 1.75, 0, 1) * source.strength;
}

function regionInfluence(index: number, region: NarrativeRegionReservation, width: number, height: number, wraps: boolean, space?: GenerationSpace) {
  const point = pointCoordinates(index, width, height); const maximum = Math.max(width, height);
  const delta = space ? spaceOffset(tilePoint(index, width, height), region.anchor, space, wraps) : undefined;
  const distance = delta ? Math.hypot(delta.x, delta.y) : Math.hypot(wrappedDx(point.x, region.anchor.x, wraps) * width / maximum, (point.y - region.anchor.y) * height / maximum * 0.866);
  return clamp(1 - distance / (Math.max(0.015, region.radius) * 1.75), 0, 1) * region.priority;
}

function pathInfluence(index: number, path: NarrativePathReservation, width: number, height: number, wraps: boolean, space?: GenerationSpace) {
  if (!path.points.length) return 0;
  const point = pointCoordinates(index, width, height); const maximum = Math.max(width, height); let nearest = Number.POSITIVE_INFINITY;
  if (space) {
    const location = tilePoint(index, width, height);
    for (let i = 0; i < path.points.length; i++) nearest = Math.min(nearest, spaceSegmentDistance(location, path.points[Math.max(0, i - 1)], path.points[i], space, wraps));
  } else for (const sample of path.points) nearest = Math.min(nearest, Math.hypot(wrappedDx(point.x, sample.x, wraps) * width / maximum, (point.y - sample.y) * height / maximum * 0.866));
  return clamp(1 - nearest / (path.width * 2.4), 0, 1) * path.strength;
}

function addRegionEffect(effect: RegionEffect, influence: number, index: number, plan: NarrativeAdapterPlan) {
  if (effect === "LAND" || effect === "VALUE") plan.topology[index] += influence;
  if (effect === "WATER") plan.topology[index] -= influence;
  if (effect === "RIDGE" || effect === "VOLCANIC") { plan.topology[index] += influence * 0.34; plan.relief[index] += influence; }
  if (effect === "LOWLAND") plan.relief[index] -= influence;
  if (effect === "WET") plan.moisture[index] += influence;
  if (effect === "DRY" || effect === "BARREN") plan.moisture[index] -= influence;
  if (effect === "HOT" || effect === "VOLCANIC") plan.temperature[index] += influence;
  if (effect === "COLD") plan.temperature[index] -= influence;
}

function addPathEffect(effect: RelationshipEffect, influence: number, index: number, plan: NarrativeAdapterPlan) {
  if (effect === "LAND_PATH") plan.topology[index] += influence;
  if (effect === "WATER_PATH") plan.topology[index] -= influence;
  if (effect === "RIDGE_PATH") { plan.topology[index] += influence * 0.22; plan.relief[index] += influence; }
  if (effect === "RIVER_PATH") { plan.rivers[index] += influence; plan.moisture[index] += influence * 0.45; plan.relief[index] -= influence * 0.18; }
  if (effect === "TRANSITION") { plan.temperature[index] += influence * 0.08; plan.moisture[index] += influence * 0.08; }
}

export function compileNarrativeAdapterPlan(program: NarrativeConstraintProgram, skeleton: NarrativeSkeleton, appliedRelaxationIds: readonly string[] = [], coordinateSpace?: "HEX"): NarrativeAdapterPlan {
  if (program.profileId !== skeleton.profileId || program.context.width !== skeleton.width || program.context.height !== skeleton.height) throw new Error("Narrative adapter inputs do not describe the same map.");
  const { width, height, wraps } = program.context; const area = width * height; const native = createNativePlan(program, skeleton, appliedRelaxationIds);
  const space = coordinateSpace === "HEX" ? generationSpace(width, height) : undefined;
  if (space) {
    native.coordinateSpace = coordinateSpace;
    native.paths = native.paths.map(path => ({ ...path, width: path.width * Math.max(width, height) / space.scale }));
  }
  const plan: NarrativeAdapterPlan = { native, topology: new Array<number>(area).fill(0), relief: new Array<number>(area).fill(0), temperature: new Array<number>(area).fill(0), moisture: new Array<number>(area).fill(0), rivers: new Array<number>(area).fill(0), evidence: undefined as never };
  const fieldSources = native.kind === "FIELD_PLAN" ? native.sources : [];
  for (const region of native.regions) {
    const source = fieldSources.find((candidate) => candidate.id === `field-${region.id}`);
    for (let index = 0; index < area; index += 1) { const influence = source ? fieldInfluence(index, source, width, height, wraps, space) : regionInfluence(index, region, width, height, wraps, space); if (influence > 0) addRegionEffect(region.effect, influence, index, plan); }
  }
  for (const path of native.paths) for (let index = 0; index < area; index += 1) { const influence = pathInfluence(index, path, width, height, wraps, space); if (influence > 0) addPathEffect(path.effect, influence, index, plan); }
  for (const field of [plan.topology, plan.relief, plan.temperature, plan.moisture, plan.rivers]) for (let index = 0; index < field.length; index += 1) field[index] = clamp(field[index]);
  const missingExplicitEffects = skeleton.regions.filter((region) => !region.effect).length + skeleton.relationships.filter((relationship) => !relationship.effect).length;
  const causalObjects: NarrativeCausalObject[] = [
    ...native.regions.map((region) => ({ id: region.id, nativeObjectId: `${native.kind.toLowerCase()}:${region.id}`, role: region.role, kind: "REGION" as const, cause: causeFor(program.engine, region.effect), strength: Number(region.priority.toFixed(3)), retained: true })),
    ...native.paths.map((path) => ({ id: path.id, nativeObjectId: `${native.kind.toLowerCase()}:${path.id}`, role: path.kind, kind: "RELATIONSHIP" as const, cause: causeFor(program.engine, path.effect), strength: Number(path.strength.toFixed(3)), retained: path.points.length > 0 || path.effect === "TRANSITION" })),
  ];
  const count = (field: number[]) => field.filter((value) => Math.abs(value) >= 0.05).length;
  plan.evidence = { schemaVersion: NARRATIVE_ADAPTER_SCHEMA_VERSION, engine: program.engine, profileId: program.profileId, programHash: program.inputHash, adapter: engineAdapter(program.engine), grammarFamily: native.grammarFamily, causalObjects, conflicts: [...program.conflicts.map((conflict) => `${conflict.control} ${conflict.requested} is outside ${conflict.accepted[0]}–${conflict.accepted[1]}.`), ...(missingExplicitEffects ? [`${missingExplicitEffects} skeleton objects lack explicit native effects and were not allowed to influence generation.`] : [])], relaxations: [...skeleton.relaxations, ...native.appliedRelaxations.map((relaxation) => relaxation.consequence)], diagnostics: { regions: skeleton.regions.length, relationships: skeleton.relationships.length, nativeReservations: native.regions.length + native.paths.length, missingExplicitEffects, topologyInfluences: count(plan.topology), reliefInfluences: count(plan.relief), climateInfluences: new Set([...plan.temperature.flatMap((value, index) => Math.abs(value) >= 0.05 ? [index] : []), ...plan.moisture.flatMap((value, index) => Math.abs(value) >= 0.05 ? [index] : [])]).size, hydrologyInfluences: count(plan.rivers) } };
  return plan;
}

/**
 * Canonical fingerprint of values that generation actually consumes. It
 * deliberately excludes the relaxation disclosure and contract fields that
 * are not read by an owner engine, so a metadata-only weakening cannot satisfy
 * the same-seed relaxation tests.
 */
export function narrativeAdapterConsumedFingerprint(plan: NarrativeAdapterPlan) {
  const number = (value: number) => Number(value.toFixed(8));
  const regions = plan.native.regions.map((region) => ({
    id: region.id,
    effect: region.effect,
    parentId: region.parentId ?? "",
    anchor: [number(region.anchor.x), number(region.anchor.y)],
    radius: number(region.radius),
    priority: number(region.priority),
  }));
  const paths = plan.native.paths.map((path) => ({
    id: path.id,
    effect: path.effect,
    from: path.from,
    to: path.to,
    points: path.points.map((point) => [number(point.x), number(point.y)]),
    width: number(path.width),
    strength: number(path.strength),
  }));
  const raster = (values: readonly number[]) => {
    let hash = 2166136261;
    for (const value of values) {
      const quantized = Math.round(value * 1e8);
      hash = Math.imul(hash ^ (quantized & 0xff), 16777619);
      hash = Math.imul(hash ^ ((quantized >>> 8) & 0xff), 16777619);
      hash = Math.imul(hash ^ ((quantized >>> 16) & 0xff), 16777619);
      hash = Math.imul(hash ^ ((quantized >>> 24) & 0xff), 16777619);
    }
    return `${values.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  };
  const ownerPolicy = plan.native.kind === "FIELD_PLAN"
    ? {
        sources: plan.native.sources.map((source) => ({ id: source.id, effect: source.effect, x: number(source.x), y: number(source.y), radiusX: number(source.radiusX), radiusY: number(source.radiusY), rotation: number(source.rotation), strength: number(source.strength) })),
        edgePolicy: plan.native.thresholdPolicy.edgePolicy,
      }
    : plan.native.kind === "GRAPH_PLAN"
      ? { connectivity: plan.native.reservationPolicy.connectivity, edgePolicy: plan.native.contract.topology.edgePolicy }
      : plan.native.kind === "PHYSICAL_PLAN"
        ? {
            plateSystems: plan.native.conditions.plateSystems,
            fragmentation: number(plan.native.conditions.fragmentation),
            reliefMode: plan.native.conditions.reliefMode,
            boundaryAlignment: number(plan.native.conditions.boundaryAlignment),
            climateMode: plan.native.conditions.climateMode,
            latitudeAuthority: number(plan.native.conditions.latitudeAuthority),
          }
        : {
            minimumObjectives: plan.native.obligations.minimumObjectives,
            routeRedundancy: plan.native.obligations.routeRedundancy,
            navalDependence: number(plan.native.obligations.navalDependence),
            connectionScale: number(plan.native.connectionScale),
          };
  return JSON.stringify({
    engine: plan.native.engine,
    ...(plan.native.coordinateSpace ? { coordinateSpace: plan.native.coordinateSpace } : {}),
    regions,
    paths,
    ownerPolicy,
    populationAdjustment: plan.native.populationAdjustment,
    contentValueContrast: number(plan.native.contract.content.valueContrast),
    rasters: {
      topology: raster(plan.topology),
      relief: raster(plan.relief),
      temperature: raster(plan.temperature),
      moisture: raster(plan.moisture),
      rivers: raster(plan.rivers),
    },
  });
}

/** Legacy field weights now only scale compatibility rasters; native plans control engine-native reservations. */
export function narrativeInfluenceStrength(engine: GenerationEngine) {
  if (engine === "PHYSICAL") return { topology: 0.22, relief: 0.28, climate: 0.2, rivers: 0.45 };
  if (engine === "ECCENTRIC") return { topology: 0.46, relief: 0.34, climate: 0.24, rivers: 0.5 };
  if (engine === "POLIS") return { topology: 0.16, relief: 0.18, climate: 0.12, rivers: 0.26 };
  return { topology: 0.5, relief: 0.28, climate: 0.2, rivers: 0.42 };
}
