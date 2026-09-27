import { inspectCiv5MapStructure, parseCiv5Map, serializeCiv5Map, updateCiv5Map } from "../civ5-map.ts";
import { validateCiv5Map } from "../map-analysis.ts";
import type { World } from "./model.ts";
import { validateWorld } from "./validation.ts";
export function exportMap(world: World) {
  if (world.origin === "IMPORTED" && world.map.scenarioDataPresent && !world.source) throw new Error("The original scenario bytes are unavailable in this legacy project. Open the original Civ5Map to preserve its scenario records on export.");
  if (world.map.scenarioDataPresent && world.source) { const issues = validateCiv5Map(world.map).filter(i => i.severity === "ERROR"); if (issues.length) throw new Error(`Resolve the imported scenario records before export: ${issues[0].message}`); }
  const errors = validateWorld(world); if (errors.length) throw new Error(`Resolve ${errors.length} placement problems before exporting. ${errors[0]}`);
  const bytes = world.source && !world.source.salvaged ? updateCiv5Map(new Uint8Array(world.source.bytes).buffer, world.map) : serializeCiv5Map(world.map);
  const structural = inspectCiv5MapStructure(bytes).filter(i => i.severity === "ERROR");
  if (structural.length) throw new Error(structural.map(i => i.message).join(" "));
  const parsed = parseCiv5Map(bytes, world.map.name);
  if (parsed.tiles.length !== world.map.tiles.length) throw new Error("Export verification found an incomplete grid.");
  for (let i = 0; i < parsed.tiles.length; i++) for (const field of ["terrain", "resource", "feature", "river", "elevation", "continent", "wonder", "resourceAmount"] as const) if (parsed.tiles[i][field] !== world.map.tiles[i][field]) throw new Error(`Export verification found a ${field} mismatch at tile ${i}.`);
  return bytes;
}
