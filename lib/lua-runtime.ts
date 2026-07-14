import type { Civ5Map, Civ5Tile } from "./civ5-map.ts";
import { balanceMapStarts, MAP_SIZES, type MapGenerationOptions } from "./map-generator.ts";
import type { LuaPipelineStage, LuaProjectDependency, LuaRuntimeMetadata } from "./lua-project.ts";

type ScriptStart = { x: number; y: number; player: number; cityState: boolean };
type WorkerResponse =
  | { ok: true; tiles: Civ5Tile[]; starts: ScriptStart[]; logs: string[]; metadata: LuaRuntimeMetadata }
  | { ok: false; error: string; logs: string[]; stages: LuaPipelineStage[] };

export type LuaRunConfiguration = {
  dependencies?: LuaProjectDependency[];
  customOptions?: number[];
  postProcessSource?: string;
};

function seedHash(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mergeScriptStarts(map: Civ5Map, starts: ScriptStart[]) {
  if (!starts.length) return map;
  const captured = new Map(starts.map((start) => [start.player, start]));
  return {
    ...map,
    startLocations: map.startLocations.map((start) => {
      const scriptStart = captured.get(start.player);
      return scriptStart ? { ...start, x: scriptStart.x, y: scriptStart.y, cityState: scriptStart.cityState } : start;
    }),
  };
}

export function runLuaMapScript(source: string, fileName: string, options: MapGenerationOptions, configuration: LuaRunConfiguration = {}) {
  return new Promise<{ map: Civ5Map; logs: string[]; metadata: LuaRuntimeMetadata }>((resolve, reject) => {
    const sizeIndex = Math.max(0, MAP_SIZES.findIndex((item) => item.id === options.size));
    const size = MAP_SIZES[sizeIndex] ?? MAP_SIZES[3];
    const wraps = options.wrapType === "EAST_WEST" || (options.wrapType === "PRESET" && options.preset !== "INLAND_SEAS" && options.preset !== "LABYRINTH");
    const worker = new Worker(new URL("../app/lua-map.worker.ts", import.meta.url), { type: "module" });
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("The Lua project exceeded the 18 second preview limit."));
    }, 18_000);
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      window.clearTimeout(timeout);
      worker.terminate();
      if (!event.data.ok) {
        reject(new Error(event.data.error));
        return;
      }
      const metadata = event.data.metadata;
      const map: Civ5Map = {
        name: metadata.name && metadata.name !== "Lua Map" ? metadata.name : fileName.replace(/\.lua$/i, "") || "Lua Map",
        description: metadata.description,
        worldSize: size.id,
        version: 12,
        width: metadata.width,
        height: metadata.height,
        players: options.players,
        wraps: metadata.wraps,
        terrains: ["TERRAIN_OCEAN", "TERRAIN_COAST", "TERRAIN_GRASS", "TERRAIN_PLAINS", "TERRAIN_DESERT", "TERRAIN_TUNDRA", "TERRAIN_SNOW"],
        features: ["FEATURE_FOREST", "FEATURE_JUNGLE", "FEATURE_MARSH", "FEATURE_ICE", "FEATURE_OASIS", "FEATURE_FLOOD_PLAINS", "FEATURE_FALLOUT", "FEATURE_ATOLL"],
        wonders: [],
        resources: [
          "RESOURCE_WHEAT", "RESOURCE_CATTLE", "RESOURCE_SHEEP", "RESOURCE_DEER", "RESOURCE_FISH", "RESOURCE_IRON", "RESOURCE_HORSE", "RESOURCE_COAL",
          "RESOURCE_OIL", "RESOURCE_ALUMINUM", "RESOURCE_URANIUM", "RESOURCE_GOLD", "RESOURCE_GEMS", "RESOURCE_SPICES", "RESOURCE_SILVER", "RESOURCE_FURS",
          "RESOURCE_DYES", "RESOURCE_SUGAR", "RESOURCE_COTTON", "RESOURCE_WINE", "RESOURCE_INCENSE", "RESOURCE_IVORY", "RESOURCE_PEARLS", "RESOURCE_WHALE",
          "RESOURCE_SALT", "RESOURCE_TRUFFLES",
        ],
        tiles: event.data.tiles,
        startLocations: [],
        source: "script",
        generation: { ...options },
      };
      const balanced = balanceMapStarts(map, options);
      resolve({ map: mergeScriptStarts(balanced, event.data.starts), logs: event.data.logs, metadata });
    };
    worker.onerror = (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message || "The Lua runtime could not start."));
    };
    worker.onmessageerror = () => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error("The Lua runtime returned an unreadable response."));
    };
    worker.postMessage({
      source,
      width: size.width,
      height: size.height,
      wraps,
      worldSize: sizeIndex,
      seed: seedHash(options.seed),
      players: options.players,
      cityStates: options.cityStates,
      customOptions: configuration.customOptions,
      dependencies: configuration.dependencies,
      postProcessSource: configuration.postProcessSource,
    });
  });
}
