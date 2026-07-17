import type { GenerationEngine, GenerationStyle } from "./map-generator.ts";

export type WorldCharacterProfile = {
  id: GenerationStyle;
  label: string;
  summary: string;
  riverSourceFactor: number;
  mountainFloor: number;
  excogitare: {
    warpStrength: number;
    fineDetailScale: number;
    fineDetailAmplitude: number;
    polarPenalty: number;
    landRefinementPasses: number;
    reliefRefinementPasses: number;
    plateRelief: number;
    polygonRelief: number;
    contestedRidge: number;
    regionalTemperature: number;
    localTemperature: number;
    altitudeCooling: number;
    moistureTransport: boolean;
    moistureBias: number;
  };
  eccentric: {
    pointJitter: number;
    organicity: number;
    fragmentation: number;
    climateInfluenceDelta: number;
    paletteDelta: number;
    allowContradiction: boolean;
    reliefNoise: number;
    regionalUpliftDelta: number;
    rangeLength: number;
    moistureBias: number;
  };
  physical: {
    activity: number;
    erosionPassDelta: number;
    erosionStrength: number;
    convergenceRelief: number;
    divergenceRelief: number;
    continentalNoise: number;
    climateVariance: number;
    oceanModeration: number;
    moistureEfficiency: number;
    moistureBias: number;
  };
  polis: {
    anchorJitter: number;
    routeWander: number;
    chokepointShift: number;
    broadLandNoise: number;
    detailLandNoise: number;
    contestedInfluence: number;
    reliefNoise: number;
    corridorBarrier: number;
    safeHillThreshold: number;
    climateVariance: number;
    moistureBias: number;
  };
};

export const WORLD_CHARACTER_PROFILES: Record<GenerationStyle, WorldCharacterProfile> = {
  REALISTIC: {
    id: "REALISTIC",
    label: "Realistic",
    summary: "Coherent causality, connected systems, moderated extremes, and comparatively abundant drainage.",
    riverSourceFactor: 1.22,
    mountainFloor: 0,
    excogitare: { warpStrength: 0.1, fineDetailScale: 3.8, fineDetailAmplitude: 0.08, polarPenalty: 0.725, landRefinementPasses: 4, reliefRefinementPasses: 2, plateRelief: 0.52, polygonRelief: 0, contestedRidge: 0, regionalTemperature: 0.34, localTemperature: 0.18, altitudeCooling: 0.26, moistureTransport: true, moistureBias: 0 },
    eccentric: { pointJitter: 0.84, organicity: 0.82, fragmentation: 0.85, climateInfluenceDelta: 0.16, paletteDelta: -1, allowContradiction: false, reliefNoise: 0.88, regionalUpliftDelta: 0.05, rangeLength: 0.88, moistureBias: 0.02 },
    physical: { activity: 1.06, erosionPassDelta: 0, erosionStrength: 1, convergenceRelief: 1.12, divergenceRelief: 1.04, continentalNoise: 0.82, climateVariance: 0.76, oceanModeration: 1.08, moistureEfficiency: 1.08, moistureBias: 0.02 },
    polis: { anchorJitter: 0.88, routeWander: 0.35, chokepointShift: -8, broadLandNoise: 0.46, detailLandNoise: 0.1, contestedInfluence: 0.68, reliefNoise: 0.84, corridorBarrier: 0.74, safeHillThreshold: 0.91, climateVariance: 0.76, moistureBias: 0.02 },
  },
  FANTASTICAL: {
    id: "FANTASTICAL",
    label: "Fantastical",
    summary: "Strong regional contrast, fragmentation, dramatic relief, and deliberately surprising transitions.",
    riverSourceFactor: 1.08,
    mountainFloor: 0,
    excogitare: { warpStrength: 0.24, fineDetailScale: 2.2, fineDetailAmplitude: 0.2, polarPenalty: 0.325, landRefinementPasses: 0, reliefRefinementPasses: 0, plateRelief: 0, polygonRelief: 0.22, contestedRidge: 0, regionalTemperature: 0.62, localTemperature: 0.36, altitudeCooling: 0, moistureTransport: false, moistureBias: 0 },
    eccentric: { pointJitter: 1.1, organicity: 1, fragmentation: 1, climateInfluenceDelta: -0.14, paletteDelta: 1, allowContradiction: true, reliefNoise: 1, regionalUpliftDelta: -0.04, rangeLength: 1.1, moistureBias: 0 },
    physical: { activity: 1.2, erosionPassDelta: -1, erosionStrength: 0.82, convergenceRelief: 1.2, divergenceRelief: 1.16, continentalNoise: 1.34, climateVariance: 1.42, oceanModeration: 0.9, moistureEfficiency: 1.12, moistureBias: 0 },
    polis: { anchorJitter: 1.34, routeWander: 1.35, chokepointShift: 18, broadLandNoise: 0.58, detailLandNoise: 0.26, contestedInfluence: 0.8, reliefNoise: 1.24, corridorBarrier: 1.24, safeHillThreshold: 0.88, climateVariance: 1.24, moistureBias: 0 },
  },
  MUNDANE: {
    id: "MUNDANE",
    label: "Mundane",
    summary: "Familiar, restrained geography with broad readable regions and low local drama.",
    riverSourceFactor: 0.9,
    mountainFloor: 0,
    excogitare: { warpStrength: 0.035, fineDetailScale: 3.8, fineDetailAmplitude: 0.035, polarPenalty: 0.725, landRefinementPasses: 0, reliefRefinementPasses: 0, plateRelief: 0, polygonRelief: 0, contestedRidge: 0, regionalTemperature: 0.25, localTemperature: 0.14, altitudeCooling: 0, moistureTransport: false, moistureBias: 0 },
    eccentric: { pointJitter: 0.68, organicity: 0.7, fragmentation: 0.65, climateInfluenceDelta: 0.08, paletteDelta: -1, allowContradiction: false, reliefNoise: 0.7, regionalUpliftDelta: 0.08, rangeLength: 0.72, moistureBias: 0 },
    physical: { activity: 0.72, erosionPassDelta: 1, erosionStrength: 1.2, convergenceRelief: 0.72, divergenceRelief: 0.78, continentalNoise: 0.62, climateVariance: 0.56, oceanModeration: 1.12, moistureEfficiency: 0.94, moistureBias: 0 },
    polis: { anchorJitter: 0.55, routeWander: 0.1, chokepointShift: -12, broadLandNoise: 0.4, detailLandNoise: 0.07, contestedInfluence: 0.6, reliefNoise: 0.64, corridorBarrier: 0.54, safeHillThreshold: 0.94, climateVariance: 0.56, moistureBias: 0 },
  },
  BRUTAL: {
    id: "BRUTAL",
    label: "Brutal",
    summary: "Hostile competitive geography with narrow movement, dry interiors, exposed objectives, and deliberate passes.",
    riverSourceFactor: 0.72,
    mountainFloor: 18,
    excogitare: { warpStrength: 0.15, fineDetailScale: 3.8, fineDetailAmplitude: 0.13, polarPenalty: 0.725, landRefinementPasses: 0, reliefRefinementPasses: 0, plateRelief: 0.26, polygonRelief: 0, contestedRidge: 0.35, regionalTemperature: 0.3, localTemperature: 0.14, altitudeCooling: 0, moistureTransport: false, moistureBias: -0.09 },
    eccentric: { pointJitter: 1.05, organicity: 1.06, fragmentation: 1.08, climateInfluenceDelta: -0.04, paletteDelta: 0, allowContradiction: true, reliefNoise: 1.32, regionalUpliftDelta: -0.1, rangeLength: 1.34, moistureBias: -0.14 },
    physical: { activity: 1.36, erosionPassDelta: -1, erosionStrength: 0.74, convergenceRelief: 1.42, divergenceRelief: 1.2, continentalNoise: 1.16, climateVariance: 1.16, oceanModeration: 0.72, moistureEfficiency: 0.72, moistureBias: -0.12 },
    polis: { anchorJitter: 0.74, routeWander: 0.55, chokepointShift: 24, broadLandNoise: 0.5, detailLandNoise: 0.2, contestedInfluence: 0.9, reliefNoise: 1.44, corridorBarrier: 1.62, safeHillThreshold: 0.82, climateVariance: 1, moistureBias: -0.09 },
  },
};

export function worldCharacterProfile(style: GenerationStyle) {
  return WORLD_CHARACTER_PROFILES[style] ?? WORLD_CHARACTER_PROFILES.MUNDANE;
}

const ENGINE_EFFECTS: Record<GenerationEngine, Record<GenerationStyle, string>> = {
  EXCOGITARE: {
    REALISTIC: "Refines land and relief fields, follows plate boundaries, cools high ground, and transports moisture into west-to-east rain shadows.",
    FANTASTICAL: "Maximises coordinate warp, coastline detail, regional climate variance, and polygon-shaped uplands.",
    MUNDANE: "Uses minimal warp, subdued relief, familiar climate variation, and broad Civ-like landforms.",
    BRUTAL: "Builds contested ridges, dries the terrain mix, reduces easy drainage, and enforces a substantial mountain floor.",
  },
  ECCENTRIC: {
    REALISTIC: "Regularises the polygon mesh, strengthens latitude, suppresses climate contradictions, and ties ranges to credible regional boundaries.",
    FANTASTICAL: "Makes cells more irregular, adds biome collections and contradictions, fragments realms, and strengthens boundary relief.",
    MUNDANE: "Regularises regions, blends climates, shortens ranges, and restrains local relief while retaining the selected landmass grammar.",
    BRUTAL: "Raises rugged dry boundary systems, narrows deliberate passes, preserves sharp realms, and reduces easy river routes.",
  },
  PHYSICAL: {
    REALISTIC: "Emphasises plate causality, moderate erosion, maritime continuity, restrained local variance, and efficient atmospheric drainage.",
    FANTASTICAL: "Amplifies crustal heterogeneity, active relief, climate variance, and unusual but still causally generated extremes.",
    MUNDANE: "Favours quiet plates, stronger erosion, subdued relief, low climate variance, and broad conventional biomes.",
    BRUTAL: "Uses violent convergence, weak moisture retention, harsh continentality, rugged relief, and a substantial mountain floor.",
  },
  POLIS: {
    REALISTIC: "Wraps the strategic graph in organic terrain, broader approaches, climate-led biomes, and restrained corridor barriers.",
    FANTASTICAL: "Crooks fronts, narrows approaches, roughens contested regions, and adds dramatic barriers around protected routes.",
    MUNDANE: "Uses broad readable routes, low terrain noise, generous safe margins, and conventional regional climate.",
    BRUTAL: "Compresses fronts, exposes objectives, raises hostile corridor barriers, dries interiors, and preserves only deliberate passes.",
  },
};

export function describeWorldCharacter(engine: GenerationEngine, style: GenerationStyle) {
  return ENGINE_EFFECTS[engine][style];
}
