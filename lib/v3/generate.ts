import { V3_DIMENSION_WARNING } from './dimensions.ts';
import type { Civ5Map } from '../civ5-map.ts';
import type { EngineNarrativeStageSnapshot } from '../engine-narrative-diagnostics.ts';
import { generateMapFoundation } from '../map-generator.ts';
import { deterministicPassSeed, generationInputHash, GenerationCancelledError } from '../generation-pass-graph.ts';
import { markGenerationStructureStale } from '../generation-structure.ts';
import { normalizeV3Request, randomStream, choose, type V3Request } from './request.ts';
import { compileV3Plan, homelandConstraints, type V3Plan } from './plan.ts';
import { developV3Surface, type ClimateEvidence } from './surface.ts';
import { placeV3Starts, balanceV3Content, type BalanceChanges } from './balance.ts';
import { assessV3Map, type V3Assessment } from './assessment.ts';
export const V3_GENERATOR_VERSION = '2';
export type V3Phase = 'PLAN' | 'GEOGRAPHY' | 'CLIMATE' | 'STARTS' | 'BALANCE' | 'ASSESS';
export type V3Progress = { phase: V3Phase; label: string; candidate: number; candidates: number };
export type V3Provenance = { version: string; state: 'CURRENT' | 'STALE'; request: V3Request; inputHash: string; plan: V3Plan; climate: ClimateEvidence; balance: BalanceChanges; assessment: V3Assessment; candidate: number; passSeeds: Record<string, number> };
export type V3Result = { map: Civ5Map; provenance: V3Provenance };
export type V3Control = { progress?: (progress: V3Progress) => void; isCancelled?: () => boolean };
export function generateV3(input: unknown, seed?: string, control: V3Control = {}): V3Result {
  const request = normalizeV3Request(input, seed), plan = compileV3Plan(request);
  const candidates = plan.recipe.effort === 'EXHAUSTIVE' ? 6 : plan.recipe.effort === 'THOROUGH' ? 4 : 3;
  const failures: string[] = [];
  let best: V3Result | undefined;
  const notify = (phase: V3Phase, label: string, candidate: number) => { if (control.isCancelled?.()) throw new GenerationCancelledError(); control.progress?.({ phase, label, candidate, candidates }); };
  notify('PLAN', 'Planning the world', 1);
  for (let candidate = 1; candidate <= candidates; candidate++) {
    try {
      const candidateSeed = `${request.seed}:v3:geography:${candidate}`;
      const recipe = { ...plan.recipe, settings: { ...plan.recipe.settings, seed: candidateSeed } };
      let native: EngineNarrativeStageSnapshot | undefined;
      notify('GEOGRAPHY', 'Shaping land and water', candidate);
      const foundation = generateMapFoundation(recipe, () => { if (control.isCancelled?.()) throw new GenerationCancelledError(); }, { fieldConstruction: 'BRANCHING', constraints: homelandConstraints(plan), onEngineNarrativeStage: stage => { if (stage.reliefValues && (stage.stage === 'RAW_NATIVE' || stage.stage === 'NARRATIVE_REALIZED')) native = stage; } });
      notify('CLIMATE', 'Developing climate and terrain', candidate);
      const surfaced = developV3Surface(foundation, request, plan, native);
      notify('STARTS', 'Finding starting regions', candidate);
      const started = placeV3Starts(surfaced.map, request, plan);
      notify('BALANCE', 'Balancing opening resources', candidate);
      const balanced = balanceV3Content(started, request, plan);
      notify('ASSESS', 'Checking the finished map', candidate);
      const assessment = assessV3Map(balanced.map, plan, balanced.changes);
      if (!assessment.accepted) { failures.push(assessment.errors.join(' ')); continue; }
      const map = balanced.map, names = randomStream(request.seed, 'name');
      const prefix = choose(['Aster', 'Sable', 'Veyra', 'Harrow', 'Orin', 'Greywater', 'Namar', 'Eldren'], names);
      map.name = `${prefix} ${assessment.waterPercent > 65 ? 'Shores' : assessment.coldLandPercent > 45 ? 'Marches' : assessment.mountainPercent > 22 ? 'Highlands' : 'Reach'}`;
      map.description = `${plan.premise}. Seed ${request.seed}. ${assessment.warnings.join(' ')} Civ V assigns starts when this ordinary map is loaded.`.trim();
      map.recipe = recipe;
      map.structure = markGenerationStructureStale(map.structure, 'Legacy narrative evidence is superseded by the independent V3 final-map assessment.', ['RELIEF', 'CLIMATE', 'STARTS', 'CONTENT']);
      const passSeeds = Object.fromEntries(['plan', 'homelands', 'climate', 'starts', 'frontiers', 'balance', 'name'].map(pass => [pass, deterministicPassSeed(request.seed, `V3:${pass}`, 1)]));
      const result: V3Result = { map, provenance: { version: V3_GENERATOR_VERSION, state: 'CURRENT', request, inputHash: generationInputHash(request), plan, climate: surfaced.climate, balance: balanced.changes, assessment, candidate, passSeeds } };
      if (!best || assessment.scoreSpread < best.provenance.assessment.scoreSpread) best = result;
      if (assessment.warnings.every(warning => warning === V3_DIMENSION_WARNING)) return result;
    } catch (error) {
      if (error instanceof GenerationCancelledError) throw error;
      failures.push(error instanceof Error ? error.message : 'Generation failed.');
    }
  }
  if (best) return best;
  throw new Error(`Could not satisfy this map request after ${candidates} attempts. ${failures[failures.length - 1] ?? 'Try more land or fewer players.'}`);
}
