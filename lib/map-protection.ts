import type { Civ5Map, Civ5Tile } from "./civ5-map.ts";
import type { ProtectionChannel, ProtectionState, SemanticProtection, TileProtectionMask } from "./authoring-schema.ts";
import { markGenerationStructureStale } from "./generation-structure.ts";

export const PROTECTION_CHANNELS: ProtectionChannel[] = ["TOPOLOGY", "ELEVATION", "CLIMATE", "FEATURES", "HYDROLOGY", "CONTENT", "STARTS", "SCENARIO"];

export function emptyProtectionState(): ProtectionState {
  return { schemaVersion: 1, semantic: [] };
}

function emptyMask(width: number, height: number): TileProtectionMask {
  return { schemaVersion: 1, width, height, channels: Object.fromEntries(PROTECTION_CHANNELS.map((channel) => [channel, new Uint8Array(width * height)])) as Record<ProtectionChannel, Uint8Array>, namedRegions: [] };
}

function cloneMask(mask: TileProtectionMask) {
  return { ...mask, channels: Object.fromEntries(PROTECTION_CHANNELS.map((channel) => [channel, new Uint8Array(mask.channels[channel])])) as Record<ProtectionChannel, Uint8Array>, namedRegions: mask.namedRegions.map((region) => ({ ...region, tileIndices: [...region.tileIndices], channels: [...region.channels] })) };
}

export function protectTiles(state: ProtectionState, width: number, height: number, tileIndices: number[], channels: ProtectionChannel[], name = "Protected region") {
  const mask = state.tileMask && state.tileMask.width === width && state.tileMask.height === height ? cloneMask(state.tileMask) : emptyMask(width, height);
  const legal = [...new Set(tileIndices.filter((index) => Number.isInteger(index) && index >= 0 && index < width * height))];
  for (const channel of channels) for (const index of legal) mask.channels[channel][index] = 1;
  const id = `region-${mask.namedRegions.length + 1}`;
  mask.namedRegions.push({ id, name, tileIndices: legal, channels: [...channels] });
  return { schemaVersion: 1 as const, tileMask: mask, semantic: state.semantic.map((item) => ({ ...item })) };
}

export function eraseProtectedTiles(state: ProtectionState, tileIndices: number[], channels: ProtectionChannel[]) {
  if (!state.tileMask) return state;
  const mask = cloneMask(state.tileMask);
  for (const channel of channels) for (const index of tileIndices) if (index >= 0 && index < mask.channels[channel].length) mask.channels[channel][index] = 0;
  mask.namedRegions = mask.namedRegions.filter((region) => !region.tileIndices.every((index) => tileIndices.includes(index)));
  return { ...state, tileMask: mask };
}

export function protectSemanticObject(state: ProtectionState, map: Civ5Map, semanticId: string, policy: SemanticProtection["policy"] = "FUNCTION") {
  const object = map.structure?.objects.find((candidate) => candidate.semanticId === semanticId);
  if (!object) throw new Error("The selected semantic object is no longer present in this map.");
  const protection: SemanticProtection = { schemaVersion: 1, id: `semantic-${state.semantic.length + 1}`, label: `Preserve ${object.name}`, objectKind: object.kind, sourceSemanticId: semanticId, policy, channels: ["TOPOLOGY", "ELEVATION", ...(object.kind === "WATERSHED" || object.kind === "RIVER_BASIN" ? ["HYDROLOGY" as const] : [])], hard: true, tolerance: { minimumTileOverlap: policy === "EXACT" ? 1 : 0.6, maximumCentroidShift: policy === "FUNCTION" ? 0.25 : 0.12 }, invariants: [], anchor: { x: object.tileIndices[0] % map.width, y: Math.floor(object.tileIndices[0] / map.width) } };
  return { ...state, semantic: [...state.semantic, protection] };
}

function copyChannels(source: Civ5Tile, target: Civ5Tile, channels: Set<ProtectionChannel>) {
  const tile = { ...target };
  if (channels.has("TOPOLOGY")) tile.terrain = source.terrain;
  if (channels.has("ELEVATION")) tile.elevation = source.elevation;
  if (channels.has("CLIMATE") && source.terrain >= 2) tile.terrain = source.terrain;
  if (channels.has("FEATURES")) tile.feature = source.feature;
  if (channels.has("HYDROLOGY")) tile.river = source.river;
  if (channels.has("CONTENT")) Object.assign(tile, { resource: source.resource, resourceAmount: source.resourceAmount, wonder: source.wonder, improvement: source.improvement, route: source.route });
  if (channels.has("SCENARIO")) tile.owner = source.owner;
  return tile;
}

export function applyProtectionState(source: Civ5Map, candidate: Civ5Map, state: ProtectionState) {
  if (source.width !== candidate.width || source.height !== candidate.height) return { map: candidate, conflicts: ["Protected regeneration cannot change map dimensions."], blocked: true };
  const channelSets = Array.from({ length: source.tiles.length }, () => new Set<ProtectionChannel>());
  if (state.tileMask?.width === source.width && state.tileMask.height === source.height) {
    for (const channel of PROTECTION_CHANNELS) for (let index = 0; index < source.tiles.length; index += 1) if (state.tileMask.channels[channel]?.[index]) channelSets[index].add(channel);
  }
  const conflicts: string[] = [];
  for (const semantic of state.semantic) {
    const object = source.structure?.objects.find((candidateObject) => candidateObject.semanticId === semantic.sourceSemanticId);
    if (!object) {
      conflicts.push(`${semantic.label} cannot be located in the source map.`);
      continue;
    }
    for (const index of object.tileIndices) for (const channel of semantic.channels) channelSets[index]?.add(channel);
  }
  if (conflicts.length && state.semantic.some((item) => item.hard)) return { map: candidate, conflicts, blocked: true };
  const tiles = candidate.tiles.map((tile, index) => channelSets[index].size ? copyChannels(source.tiles[index], tile, channelSets[index]) : { ...tile });
  const protectStarts = channelSets.some((channels) => channels.has("STARTS"));
  const protectScenario = channelSets.some((channels) => channels.has("SCENARIO"));
  const changedPasses = new Set<string>();
  for (const channels of channelSets) {
    if (channels.has("TOPOLOGY")) changedPasses.add("TOPOLOGY");
    if (channels.has("ELEVATION")) changedPasses.add("RELIEF");
    if (channels.has("CLIMATE") || channels.has("FEATURES")) changedPasses.add("CLIMATE");
    if (channels.has("HYDROLOGY")) changedPasses.add("HYDROLOGY");
    if (channels.has("CONTENT") || channels.has("SCENARIO")) changedPasses.add("CONTENT");
    if (channels.has("STARTS")) changedPasses.add("STARTS");
  }
  const map = { ...candidate, tiles, startLocations: protectStarts ? source.startLocations.map((start) => ({ ...start })) : candidate.startLocations, cities: protectScenario ? source.cities?.map((city) => ({ ...city })) : candidate.cities, structure: markGenerationStructureStale(candidate.structure, "Protected authoring data was merged into a regenerated candidate.", changedPasses) };
  return { map, conflicts, blocked: false };
}
