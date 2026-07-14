import type { Civ5Map, Civ5Tile } from "./civ5-map.ts";
import { balanceMapStarts, MAP_SIZES, type MapGenerationOptions } from "./map-generator.ts";

type WorkerResponse = { ok: true; tiles: Civ5Tile[]; logs: string[] } | { ok: false; error: string; logs: string[] };

function seedHash(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function runLuaMapScript(source: string, fileName: string, options: MapGenerationOptions) {
  return new Promise<{ map: Civ5Map; logs: string[] }>((resolve, reject) => {
    const size = MAP_SIZES.find((item) => item.id === options.size) ?? MAP_SIZES[3];
    const worker = new Worker(new URL("../app/lua-map.worker.ts", import.meta.url), { type: "module" });
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("The Lua script exceeded the 12 second preview limit."));
    }, 12_000);
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      window.clearTimeout(timeout);
      worker.terminate();
      if (!event.data.ok) {
        reject(new Error(event.data.error));
        return;
      }
      const map: Civ5Map = {
        name: fileName.replace(/\.lua$/i, "") || "Lua Map",
        description: "Generated in Excogitare's sandboxed experimental Civ V Lua runtime.",
        worldSize: size.id,
        version: 12,
        width: size.width,
        height: size.height,
        players: options.players,
        wraps: options.preset !== "INLAND_SEAS",
        terrains: ["TERRAIN_OCEAN", "TERRAIN_COAST", "TERRAIN_GRASS", "TERRAIN_PLAINS", "TERRAIN_DESERT", "TERRAIN_TUNDRA", "TERRAIN_SNOW"],
        features: ["FEATURE_FOREST", "FEATURE_JUNGLE", "FEATURE_MARSH", "FEATURE_ICE", "FEATURE_OASIS", "FEATURE_FLOOD_PLAINS", "FEATURE_FALLOUT", "FEATURE_ATOLL"],
        wonders: [],
        resources: ["RESOURCE_WHEAT", "RESOURCE_CATTLE", "RESOURCE_SHEEP", "RESOURCE_DEER", "RESOURCE_FISH", "RESOURCE_IRON", "RESOURCE_HORSE", "RESOURCE_COAL", "RESOURCE_OIL", "RESOURCE_ALUMINUM", "RESOURCE_URANIUM", "RESOURCE_GOLD", "RESOURCE_GEMS", "RESOURCE_SPICES"],
        tiles: event.data.tiles,
        startLocations: [],
        source: "script",
        generation: { ...options },
      };
      resolve({ map: balanceMapStarts(map, options), logs: event.data.logs });
    };
    worker.onerror = (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message || "The Lua runtime could not start."));
    };
    worker.postMessage({ source, width: size.width, height: size.height, seed: seedHash(options.seed) });
  });
}
