import type { Civ5Map, Civ5Tile } from "./civ5-map.ts";
import type { GenerationStructure } from "./generation-structure.ts";

export type EngineNarrativeStageName = "RAW_NATIVE" | "NARRATIVE_REALIZED" | "LEGAL_NORMALIZED" | "FINAL";

export type EngineNarrativeObservable = {
  landMask: ReadonlyArray<boolean>;
  elevations: ReadonlyArray<number>;
  reliefValues?: ReadonlyArray<number>;
  moistures?: ReadonlyArray<number>;
  temperatures?: ReadonlyArray<number>;
  tiles?: ReadonlyArray<Civ5Tile>;
  structure?: GenerationStructure;
};

export type EngineNarrativeStageSnapshot = {
  stage: EngineNarrativeStageName;
  width: number;
  height: number;
  wraps: boolean;
  landMask: boolean[];
  elevations: number[];
  reliefValues?: number[];
  moistures?: number[];
  temperatures?: number[];
  tiles?: Civ5Tile[];
};

export type EngineNarrativeStageEvidence = {
  stage: EngineNarrativeStageName;
  fingerprint: string;
  topologyFingerprint: string;
  elevationFingerprint: string;
  reliefFingerprint?: string;
  climateFingerprint?: string;
  surfaceFingerprint?: string;
  metrics: Record<string, number>;
};

export type EngineNarrativeStageComparison = {
  from: EngineNarrativeStageName;
  to: EngineNarrativeStageName;
  topologyChanged: number;
  landRemoved: number;
  waterRaised: number;
  elevationChanged: number;
  reliefChanged?: number;
  moistureMeanDelta?: number;
  temperatureMeanDelta?: number;
  surfaceChanged?: number;
};

export type EngineNarrativeEvidence = {
  schemaVersion: 1;
  engine: GenerationStructure["engine"];
  stages: Partial<Record<EngineNarrativeStageName, EngineNarrativeStageEvidence>>;
  comparisons: EngineNarrativeStageComparison[];
};

function hashByte(hash: number, value: number) {
  return Math.imul((hash ^ (value & 0xff)) >>> 0, 16777619) >>> 0;
}

function hashInteger(hash: number, value: number) {
  let next = hash;
  const normalized = value | 0;
  next = hashByte(next, normalized);
  next = hashByte(next, normalized >>> 8);
  next = hashByte(next, normalized >>> 16);
  next = hashByte(next, normalized >>> 24);
  return next;
}

function finishHash(hash: number) {
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hashBooleans(values: ReadonlyArray<boolean>) {
  let hash = 2166136261;
  for (const value of values) hash = hashByte(hash, value ? 1 : 0);
  return finishHash(hashInteger(hash, values.length));
}

function hashNumbers(values: ReadonlyArray<number>) {
  let hash = 2166136261;
  for (const value of values) {
    const normalized = Number.isFinite(value) ? Math.round(value * 1_000_000) : value === Number.POSITIVE_INFINITY ? 0x7fffffff : -0x80000000;
    hash = hashInteger(hash, normalized);
  }
  return finishHash(hashInteger(hash, values.length));
}

function hashTiles(tiles: ReadonlyArray<Civ5Tile>) {
  let hash = 2166136261;
  for (const tile of tiles) {
    hash = hashInteger(hash, tile.terrain);
    hash = hashInteger(hash, tile.elevation);
    hash = hashInteger(hash, tile.feature);
    hash = hashInteger(hash, tile.river);
    hash = hashInteger(hash, tile.resource);
    hash = hashInteger(hash, tile.resourceAmount);
    hash = hashInteger(hash, tile.wonder);
    hash = hashInteger(hash, tile.continent);
  }
  return finishHash(hashInteger(hash, tiles.length));
}

function combinedFingerprint(parts: ReadonlyArray<string | undefined>) {
  let hash = 2166136261;
  for (const part of parts) {
    for (const character of part ?? "-") hash = hashByte(hash, character.charCodeAt(0));
    hash = hashByte(hash, 0xff);
  }
  return finishHash(hash);
}

function neighbors(index: number, width: number, height: number, wraps: boolean) {
  const x = index % width;
  const y = Math.floor(index / width);
  const offsets = y % 2 === 0
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  return offsets.flatMap(([dx, dy]) => {
    let nextX = x + dx;
    const nextY = y + dy;
    if (wraps) nextX = (nextX + width) % width;
    return nextX >= 0 && nextX < width && nextY >= 0 && nextY < height ? [nextY * width + nextX] : [];
  });
}

function componentSizes(mask: ReadonlyArray<boolean>, width: number, height: number, wraps: boolean) {
  const visited = new Uint8Array(mask.length);
  const sizes: number[] = [];
  for (let origin = 0; origin < mask.length; origin += 1) {
    if (!mask[origin] || visited[origin]) continue;
    const queue = [origin];
    visited[origin] = 1;
    let size = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      size += 1;
      for (const next of neighbors(index, width, height, wraps)) {
        if (!mask[next] || visited[next]) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    sizes.push(size);
  }
  return sizes.sort((one, two) => two - one);
}

function partitionImpurity(mask: ReadonlyArray<boolean>, structure: GenerationStructure | undefined, kind: "POLYGON" | "SUBREGION") {
  const objects = structure?.objects.filter((object) => object.kind === kind && object.tileIndices.length) ?? [];
  if (!objects.length) return 0;
  const total = objects.reduce((sum, object) => sum + object.tileIndices.length, 0);
  const minority = objects.reduce((sum, object) => {
    const land = object.tileIndices.filter((index) => mask[index]).length;
    return sum + Math.min(land, object.tileIndices.length - land);
  }, 0);
  return minority / Math.max(1, total);
}

function mirrorMismatch(mask: ReadonlyArray<boolean>, width: number, height: number, horizontal: boolean) {
  let mismatch = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const mirrorX = horizontal ? width - x - 1 : x;
    const mirrorY = horizontal ? y : height - y - 1;
    if (mask[y * width + x] !== mask[mirrorY * width + mirrorX]) mismatch += 1;
  }
  return mismatch / Math.max(1, mask.length);
}

function stageMetrics(source: EngineNarrativeObservable, width: number, height: number, wraps: boolean) {
  const landSizes = componentSizes(source.landMask, width, height, wraps);
  const waterSizes = componentSizes(source.landMask.map((land) => !land), width, height, wraps);
  const land = landSizes.reduce((sum, size) => sum + size, 0);
  let coastlineEdges = 0;
  for (let index = 0; index < source.landMask.length; index += 1) {
    if (source.landMask[index]) coastlineEdges += neighbors(index, width, height, wraps).filter((next) => !source.landMask[next]).length;
  }
  return {
    landShare: land / Math.max(1, source.landMask.length),
    landComponents: landSizes.length,
    waterComponents: waterSizes.length,
    dominantLandShare: (landSizes[0] ?? 0) / Math.max(1, land),
    smallIslandShare: landSizes.filter((size) => size <= 9).reduce((sum, size) => sum + size, 0) / Math.max(1, land),
    coastlinePerLandTile: coastlineEdges / Math.max(1, land),
    mountainShareOfLand: source.elevations.filter((elevation, index) => source.landMask[index] && elevation === 2).length / Math.max(1, land),
    horizontalMirrorMismatch: mirrorMismatch(source.landMask, width, height, true),
    verticalMirrorMismatch: mirrorMismatch(source.landMask, width, height, false),
    polygonImpurity: partitionImpurity(source.landMask, source.structure, "POLYGON"),
    subregionImpurity: partitionImpurity(source.landMask, source.structure, "SUBREGION"),
    riverTiles: source.tiles?.filter((tile) => tile.river > 0).length ?? 0,
  };
}

export function captureEngineNarrativeStage(
  stage: EngineNarrativeStageName,
  source: EngineNarrativeObservable,
  width: number,
  height: number,
  wraps: boolean,
): EngineNarrativeStageEvidence {
  const topologyFingerprint = hashBooleans(source.landMask);
  const elevationFingerprint = hashNumbers(source.elevations);
  const reliefFingerprint = source.reliefValues ? hashNumbers(source.reliefValues) : undefined;
  const climateFingerprint = source.moistures || source.temperatures
    ? combinedFingerprint([source.moistures ? hashNumbers(source.moistures) : undefined, source.temperatures ? hashNumbers(source.temperatures) : undefined])
    : undefined;
  const surfaceFingerprint = source.tiles ? hashTiles(source.tiles) : undefined;
  return {
    stage,
    fingerprint: combinedFingerprint([topologyFingerprint, elevationFingerprint, reliefFingerprint, climateFingerprint, surfaceFingerprint]),
    topologyFingerprint,
    elevationFingerprint,
    reliefFingerprint,
    climateFingerprint,
    surfaceFingerprint,
    metrics: stageMetrics(source, width, height, wraps),
  };
}

export function snapshotEngineNarrativeStage(
  stage: EngineNarrativeStageName,
  source: EngineNarrativeObservable,
  width: number,
  height: number,
  wraps: boolean,
): EngineNarrativeStageSnapshot {
  return {
    stage,
    width,
    height,
    wraps,
    landMask: [...source.landMask],
    elevations: [...source.elevations],
    ...(source.reliefValues ? { reliefValues: [...source.reliefValues] } : {}),
    ...(source.moistures ? { moistures: [...source.moistures] } : {}),
    ...(source.temperatures ? { temperatures: [...source.temperatures] } : {}),
    ...(source.tiles ? { tiles: source.tiles.map((tile) => ({ ...tile })) } : {}),
  };
}

export function observableFromMap(map: Civ5Map): EngineNarrativeObservable {
  return {
    landMask: map.tiles.map((tile) => tile.terrain >= 2),
    elevations: map.tiles.map((tile) => tile.elevation),
    tiles: map.tiles,
    structure: map.structure,
  };
}

function changedFraction<T>(one: ReadonlyArray<T>, two: ReadonlyArray<T>, tolerance?: number) {
  if (one.length !== two.length) return 1;
  return one.filter((value, index) => tolerance === undefined
    ? value !== two[index]
    : Math.abs(Number(value) - Number(two[index])) > tolerance).length / Math.max(1, one.length);
}

function meanAbsoluteDifference(one: ReadonlyArray<number> | undefined, two: ReadonlyArray<number> | undefined) {
  if (!one || !two || one.length !== two.length) return undefined;
  return one.reduce((sum, value, index) => sum + Math.abs(value - two[index]), 0) / Math.max(1, one.length);
}

function surfaceChanged(one: ReadonlyArray<Civ5Tile> | undefined, two: ReadonlyArray<Civ5Tile> | undefined) {
  if (!one || !two || one.length !== two.length) return undefined;
  return one.filter((tile, index) => {
    const other = two[index];
    return tile.terrain !== other.terrain
      || tile.elevation !== other.elevation
      || tile.feature !== other.feature
      || tile.river !== other.river
      || tile.resource !== other.resource
      || tile.resourceAmount !== other.resourceAmount
      || tile.wonder !== other.wonder;
  }).length / Math.max(1, one.length);
}

export function compareEngineNarrativeStages(
  from: EngineNarrativeStageName,
  to: EngineNarrativeStageName,
  one: EngineNarrativeObservable,
  two: EngineNarrativeObservable,
): EngineNarrativeStageComparison {
  return {
    from,
    to,
    topologyChanged: changedFraction(one.landMask, two.landMask),
    landRemoved: one.landMask.filter((land, index) => land && !two.landMask[index]).length / Math.max(1, one.landMask.length),
    waterRaised: one.landMask.filter((land, index) => !land && two.landMask[index]).length / Math.max(1, one.landMask.length),
    elevationChanged: changedFraction(one.elevations, two.elevations),
    ...(one.reliefValues && two.reliefValues ? { reliefChanged: changedFraction(one.reliefValues, two.reliefValues, 0.01) } : {}),
    ...(meanAbsoluteDifference(one.moistures, two.moistures) !== undefined ? { moistureMeanDelta: meanAbsoluteDifference(one.moistures, two.moistures) } : {}),
    ...(meanAbsoluteDifference(one.temperatures, two.temperatures) !== undefined ? { temperatureMeanDelta: meanAbsoluteDifference(one.temperatures, two.temperatures) } : {}),
    ...(surfaceChanged(one.tiles, two.tiles) !== undefined ? { surfaceChanged: surfaceChanged(one.tiles, two.tiles) } : {}),
  };
}

export function createEngineNarrativeEvidence(
  engine: GenerationStructure["engine"],
  raw: EngineNarrativeStageEvidence,
  realized: EngineNarrativeStageEvidence,
  comparison: EngineNarrativeStageComparison,
): EngineNarrativeEvidence {
  return {
    schemaVersion: 1,
    engine,
    stages: { RAW_NATIVE: raw, NARRATIVE_REALIZED: realized },
    comparisons: [comparison],
  };
}

export function appendEngineNarrativeEvidence(
  evidence: EngineNarrativeEvidence,
  stage: EngineNarrativeStageEvidence,
  comparison?: EngineNarrativeStageComparison,
): EngineNarrativeEvidence {
  return {
    ...evidence,
    stages: { ...evidence.stages, [stage.stage]: stage },
    comparisons: comparison
      ? [...evidence.comparisons.filter((item) => item.from !== comparison.from || item.to !== comparison.to), comparison]
      : [...evidence.comparisons],
  };
}

export function cloneEngineNarrativeEvidence(evidence: EngineNarrativeEvidence | undefined) {
  if (!evidence) return undefined;
  return {
    ...evidence,
    stages: Object.fromEntries(Object.entries(evidence.stages).map(([stage, value]) => [stage, value ? { ...value, metrics: { ...value.metrics } } : value])),
    comparisons: evidence.comparisons.map((comparison) => ({ ...comparison })),
  } satisfies EngineNarrativeEvidence;
}
