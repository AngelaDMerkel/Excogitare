import type { Civ5Map } from "./civ5-map.ts";

export function mapExportBaseName(map: Pick<Civ5Map, "name">) {
  return map.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "excogitare-map";
}
