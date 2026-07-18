/// <reference lib="webworker" />

import type { Civ5Map } from "@/lib/civ5-map";
import { regenerateMapStage, type RegenerationStage } from "@/lib/map-design";
import { enforceGeneratedPlacementLegality, generateMap, generateMapFromRecipe, type MapGenerationOptions } from "@/lib/map-generator";
import type { GenerationRecipe } from "@/lib/generation-recipe";
import { applyWorldArchetype } from "@/lib/world-archetype";

type GenerationRequest = { id: number; kind?: "GENERATE"; options: MapGenerationOptions; recipe?: GenerationRecipe }
  | { id: number; kind: "REGENERATE"; options: MapGenerationOptions; recipe?: GenerationRecipe; map: Civ5Map; stage: RegenerationStage; variation: number };

self.onmessage = (event: MessageEvent<GenerationRequest>) => {
  const { id, options } = event.data;
  try {
    if (event.data.kind === "REGENERATE") {
      const stage = `Regenerating ${event.data.stage.toLowerCase()}`;
      self.postMessage({ id, type: "PROGRESS", stage, progress: { passId: event.data.stage, passVersion: 1, stage, completedPasses: 0, totalPasses: 1, candidate: 1, candidateCount: 1 } });
      const regenerated = regenerateMapStage(event.data.map, options, event.data.stage, event.data.variation);
      const coated = event.data.recipe && event.data.stage === "CLIMATE" ? enforceGeneratedPlacementLegality(applyWorldArchetype(regenerated, event.data.recipe.archetype)) : regenerated;
      const map = event.data.recipe ? { ...coated, recipe: event.data.recipe } : coated;
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
