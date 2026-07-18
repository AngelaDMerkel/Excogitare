import { poleProximity, type ClimateProjection } from "./climate-projection.ts";
import type { WorldScale } from "./generation-recipe.ts";

export type WorldScaleProfile = {
  id: WorldScale;
  label: string;
  subject: string;
  ordinal: number;
  majorSystemFrequency: number;
  localDetail: number;
  climateSpan: number;
  drainageHierarchy: number;
  strategicTravel: number;
  excogitare: { fieldSpan: number; centerFrequency: number; plateFrequency: number };
  eccentric: { majorSystemFrequency: number; polygonDetail: number; subregionDetail: number };
  physical: { plateFrequency: number; reliefSpan: number; erosionDetail: number };
  polis: { safeRadius: number; chokepointShift: number; routeWander: number };
};

export const WORLD_SCALE_PROFILES: Record<WorldScale, WorldScaleProfile> = {
  GLOBAL: {
    id: "GLOBAL", label: "Global", subject: "Most of a planet and several independent geographic systems.", ordinal: 0,
    majorSystemFrequency: 1.35, localDetail: 0.72, climateSpan: 1, drainageHierarchy: 1.28, strategicTravel: 0.78,
    excogitare: { fieldSpan: 0.78, centerFrequency: 1.35, plateFrequency: 1.3 },
    eccentric: { majorSystemFrequency: 1.3, polygonDetail: 1, subregionDetail: 1 },
    physical: { plateFrequency: 1.3, reliefSpan: 0.82, erosionDetail: 0.78 },
    polis: { safeRadius: 0.78, chokepointShift: -12, routeWander: 0.72 },
  },
  CONTINENTAL: {
    id: "CONTINENTAL", label: "Continental", subject: "A continent or connected continental system.", ordinal: 1,
    majorSystemFrequency: 1.05, localDetail: 0.9, climateSpan: 0.74, drainageHierarchy: 1.12, strategicTravel: 0.9,
    excogitare: { fieldSpan: 0.94, centerFrequency: 1.05, plateFrequency: 1.05 },
    eccentric: { majorSystemFrequency: 1.05, polygonDetail: 1.04, subregionDetail: 1.04 },
    physical: { plateFrequency: 1.02, reliefSpan: 0.96, erosionDetail: 0.94 },
    polis: { safeRadius: 0.9, chokepointShift: -5, routeWander: 0.88 },
  },
  REGIONAL: {
    id: "REGIONAL", label: "Regional", subject: "Connected countries, basins or seas within one geographic system.", ordinal: 2,
    majorSystemFrequency: 0.76, localDetail: 1.08, climateSpan: 0.48, drainageHierarchy: 1, strategicTravel: 1,
    excogitare: { fieldSpan: 1.16, centerFrequency: 0.76, plateFrequency: 0.78 },
    eccentric: { majorSystemFrequency: 0.76, polygonDetail: 1.12, subregionDetail: 1.12 },
    physical: { plateFrequency: 0.72, reliefSpan: 1.12, erosionDetail: 1.08 },
    polis: { safeRadius: 1, chokepointShift: 0, routeWander: 1 },
  },
  PROVINCIAL: {
    id: "PROVINCIAL", label: "Provincial", subject: "One subcontinental theatre and its internal geography.", ordinal: 3,
    majorSystemFrequency: 0.5, localDetail: 1.26, climateSpan: 0.3, drainageHierarchy: 0.84, strategicTravel: 1.12,
    excogitare: { fieldSpan: 1.48, centerFrequency: 0.5, plateFrequency: 0.56 },
    eccentric: { majorSystemFrequency: 0.5, polygonDetail: 1.25, subregionDetail: 1.25 },
    physical: { plateFrequency: 0.48, reliefSpan: 1.34, erosionDetail: 1.22 },
    polis: { safeRadius: 1.14, chokepointShift: 9, routeWander: 1.14 },
  },
  LOCAL: {
    id: "LOCAL", label: "Local", subject: "A detailed valley, island group or scenario region inside one larger system.", ordinal: 4,
    majorSystemFrequency: 0.3, localDetail: 1.48, climateSpan: 0.16, drainageHierarchy: 0.68, strategicTravel: 1.28,
    excogitare: { fieldSpan: 1.92, centerFrequency: 0.3, plateFrequency: 0.38 },
    eccentric: { majorSystemFrequency: 0.3, polygonDetail: 1.4, subregionDetail: 1.4 },
    physical: { plateFrequency: 0.3, reliefSpan: 1.62, erosionDetail: 1.38 },
    polis: { safeRadius: 1.3, chokepointShift: 17, routeWander: 1.3 },
  },
};

export function worldScaleProfile(scale: WorldScale) {
  return WORLD_SCALE_PROFILES[scale] ?? WORLD_SCALE_PROFILES.GLOBAL;
}

function seedUnit(seed: number) {
  let value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

export function scaledPoleProximity(
  x: number,
  y: number,
  width: number,
  height: number,
  projection: ClimateProjection,
  scale: WorldScale,
  seed: number,
) {
  const raw = poleProximity(x, y, width, height, projection);
  const span = worldScaleProfile(scale).climateSpan;
  if (span >= 0.999) return raw;
  const half = span / 2;
  const center = half + seedUnit(seed) * (1 - span);
  return Math.max(0, Math.min(1, center + (raw - 0.5) * span));
}
