import type { Civ5StartLocation, Civ5Tile } from "./civ5-map.ts";
import type { ProtectionChannel, SemanticProtectionPolicy } from "./authoring-schema.ts";

export type GenerationConstraintAdapter = "EXCOGITARE_FIELDS" | "ECCENTRIC_GRAPH" | "PHYSICAL_BOUNDARY" | "POLIS_STRATEGIC";

export type NativeSemanticConstraint = {
  id: string;
  sourceSemanticId: string;
  objectKind: string;
  policy: SemanticProtectionPolicy;
  hard: boolean;
  tileIndices: number[];
  anchorIndex: number;
  relatedAnchors: Array<{ semanticId: string; index: number }>;
};

/**
 * Engine-facing, data-only protection payload. Negative scalar entries are
 * unconstrained. Typed arrays keep worker transfer deterministic and avoid
 * coupling generation engines to the authoring UI or project schema.
 */
export type GenerationConstraintPayload = {
  schemaVersion: 1;
  width: number;
  height: number;
  adapter: GenerationConstraintAdapter;
  topology: Int8Array;
  elevation: Int8Array;
  terrain: Int16Array;
  feature: Int16Array;
  hydrologyMask: Uint8Array;
  rivers: Uint8Array;
  contentMask: Uint8Array;
  startsMask: Uint8Array;
  scenarioMask: Uint8Array;
  semantics: NativeSemanticConstraint[];
  sourceStarts: Civ5StartLocation[];
  constrainedChannels: ProtectionChannel[];
};

export function constraintMatchesDimensions(constraints: GenerationConstraintPayload | undefined, width: number, height: number) {
  return Boolean(constraints && constraints.schemaVersion === 1 && constraints.width === width && constraints.height === height && constraints.topology.length === width * height);
}

export function constrainedTileCount(constraints: GenerationConstraintPayload | undefined) {
  if (!constraints) return 0;
  let count = 0;
  for (let index = 0; index < constraints.topology.length; index += 1) {
    if (constraints.topology[index] >= 0 || constraints.elevation[index] >= 0 || constraints.terrain[index] >= 0 || constraints.feature[index] >= 0 || constraints.hydrologyMask[index] || constraints.contentMask[index] || constraints.startsMask[index] || constraints.scenarioMask[index]) count += 1;
  }
  return count;
}

export function applyConstrainedLandBudget(mask: boolean[], targetLand: number, scores: ReadonlyArray<number>, constraints: GenerationConstraintPayload | undefined) {
  if (!constraints || constraints.topology.length !== mask.length) return mask;
  const fixedLand = new Set<number>();
  const fixedWater = new Set<number>();
  for (let index = 0; index < mask.length; index += 1) {
    if (constraints!.topology[index] === 1) { mask[index] = true; fixedLand.add(index); }
    else if (constraints!.topology[index] === 0) { mask[index] = false; fixedWater.add(index); }
  }
  const boundedTarget = Math.max(fixedLand.size, Math.min(mask.length - fixedWater.size, targetLand));
  let land = mask.reduce((count, value) => count + Number(value), 0);
  if (land > boundedTarget) {
    const removable = mask.flatMap((value, index) => value && !fixedLand.has(index) ? [index] : []).sort((one, two) => scores[one] - scores[two] || one - two);
    for (const index of removable) { if (land <= boundedTarget) break; mask[index] = false; land -= 1; }
  } else if (land < boundedTarget) {
    const addable = mask.flatMap((value, index) => !value && !fixedWater.has(index) ? [index] : []).sort((one, two) => scores[two] - scores[one] || one - two);
    for (const index of addable) { if (land >= boundedTarget) break; mask[index] = true; land += 1; }
  }
  return mask;
}

export function applyConstrainedRelief(relief: number[], elevations: number[], landMask: boolean[], constraints: GenerationConstraintPayload | undefined) {
  if (!constraints || constraints.elevation.length !== elevations.length) return;
  for (let index = 0; index < elevations.length; index += 1) {
    if (!landMask[index]) { elevations[index] = 0; continue; }
    const fixed = constraints.elevation[index];
    if (fixed < 0) continue;
    elevations[index] = fixed;
    relief[index] = fixed === 2 ? Math.max(relief[index], 1.05) : fixed === 1 ? Math.max(0.46, Math.min(0.82, relief[index])) : Math.min(relief[index], 0.35);
  }
}

export function applyConstrainedSurface(tiles: Civ5Tile[], landMask: boolean[], elevations: number[], constraints: GenerationConstraintPayload | undefined) {
  if (!constraints || constraints.topology.length !== tiles.length) return;
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index];
    if (constraints.topology[index] === 0) {
      tile.terrain = constraints.terrain[index] === 0 || constraints.terrain[index] === 1 ? constraints.terrain[index] : 0;
      tile.elevation = 0;
      tile.feature = constraints.feature[index] >= 0 ? constraints.feature[index] : tile.feature;
    } else if (constraints.topology[index] === 1) {
      if (tile.terrain < 2) tile.terrain = constraints.terrain[index] >= 2 ? constraints.terrain[index] : 2;
      tile.elevation = elevations[index];
    }
    if (constraints.terrain[index] >= 0) tile.terrain = constraints.terrain[index];
    if (constraints.feature[index] >= 0) tile.feature = constraints.feature[index];
    landMask[index] = tile.terrain >= 2;
  }
}

export function nativeConstraintDiagnostics(constraints: GenerationConstraintPayload | undefined): Record<string, number> {
  if (!constraints) return {};
  return {
    nativeConstraintTiles: constrainedTileCount(constraints),
    nativeSemanticConstraints: constraints?.semantics.length ?? 0,
    nativeRelationshipConstraints: constraints?.semantics.filter((semantic) => semantic.policy === "RELATIONSHIP").length ?? 0,
    nativeHydrologyConstraints: constraints?.hydrologyMask.reduce((sum, value) => sum + value, 0) ?? 0,
  };
}
