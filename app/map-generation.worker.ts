/// <reference lib="webworker" />

import type { Civ5Map } from "@/lib/civ5-map";
import { regenerateMapStage, type RegenerationStage } from "@/lib/map-design";
import { generateMap, type MapGenerationOptions } from "@/lib/map-generator";

type GenerationRequest = { id: number; kind?: "GENERATE"; options: MapGenerationOptions }
  | { id: number; kind: "REGENERATE"; options: MapGenerationOptions; map: Civ5Map; stage: RegenerationStage; variation: number };

self.onmessage = (event: MessageEvent<GenerationRequest>) => {
  const { id, options } = event.data;
  try {
    if (event.data.kind === "REGENERATE") {
      self.postMessage({ id, type: "PROGRESS", stage: `Regenerating ${event.data.stage.toLowerCase()}` });
      const map = regenerateMapStage(event.data.map, options, event.data.stage, event.data.variation);
      self.postMessage({ id, type: "COMPLETE", map });
      return;
    }
    const map = generateMap(options, (stage) => self.postMessage({ id, type: "PROGRESS", stage }));
    self.postMessage({ id, type: "COMPLETE", map });
  } catch (error) {
    self.postMessage({ id, type: "ERROR", message: error instanceof Error ? error.message : "Map generation failed." });
  }
};

export {};
