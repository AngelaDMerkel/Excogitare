/// <reference lib="webworker" />

import type { Civ5Map } from "@/lib/civ5-map";
import type { ProtectionState } from "@/lib/authoring-schema";
import { buildArchetypeRefinementCandidate, regenerateMapStage, type RegenerationStage } from "@/lib/map-design";
import { generateMap, generateMapFromRecipe, type MapGenerationOptions } from "@/lib/map-generator";
import type { GenerationRecipe } from "@/lib/generation-recipe";

type GenerationRequest = { id: number; kind?: "GENERATE"; options: MapGenerationOptions; recipe?: GenerationRecipe }
  | { id: number; kind: "REGENERATE"; options: MapGenerationOptions; recipe?: GenerationRecipe; protection?: ProtectionState; map: Civ5Map; stage: RegenerationStage; variation: number };

self.onmessage = (event: MessageEvent<GenerationRequest>) => {
  const { id, options } = event.data;
  try {
    if (event.data.kind === "REGENERATE") {
      const stage = `Regenerating ${event.data.stage.toLowerCase()}`;
      self.postMessage({ id, type: "PROGRESS", stage, progress: { passId: event.data.stage, passVersion: 1, stage, completedPasses: 0, totalPasses: 1, candidate: 1, candidateCount: 1 } });
      const map = event.data.stage === "CLIMATE" && event.data.recipe
        ? buildArchetypeRefinementCandidate(event.data.map, options, event.data.recipe, event.data.variation, event.data.protection)
        : regenerateMapStage(event.data.map, options, event.data.stage, event.data.variation, event.data.recipe, event.data.protection);
      self.postMessage({ id, type: "COMPLETE", map });
      return;
    }
    const progress = (stage: string, detail: import("@/lib/generation-pass-graph").GenerationProgress) => self.postMessage({ id, type: "PROGRESS", stage, progress: detail });
    const map = event.data.recipe ? generateMapFromRecipe(event.data.recipe, progress) : generateMap(options, progress);
    self.postMessage({ id, type: "COMPLETE", map });
  } catch (error) {
    self.postMessage({ id, type: "ERROR", message: error instanceof Error ? error.message : "Map generation failed." });
  }
};

export {};
