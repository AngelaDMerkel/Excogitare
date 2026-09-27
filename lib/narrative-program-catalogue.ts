import type { GenerationRecipe } from "./generation-recipe.ts";
import type { MapPresetId } from "./map-generator.ts";
import { NARRATIVE_PROFILES, narrativeProfile } from "./narrative-map-types.ts";
import { narrativeNativeContract } from "./narrative-native-contracts.ts";
import {
  compileNarrativeConstraintProgram,
  type NarrativeConstraintDefinition,
  type NarrativeConstraintScope,
  type NarrativeEvidenceDefinition,
  type NarrativeEvidenceOperator,
  type NarrativeMeasureKey,
  type NarrativeProgramDefinition,
} from "./narrative-constraints.ts";

type Target = number | readonly [number, number];
type Rule = {
  measureKey: NarrativeMeasureKey;
  operator: NarrativeEvidenceOperator;
  target: Target;
  confidence?: number;
  scale?: "COUNT" | "PLAYERS" | "PLAYER_DOUBLE";
};
type MotifRule = Rule | readonly Rule[];
type CatalogueRules = { essential: readonly MotifRule[]; prohibited: readonly MotifRule[] };
type AuthoredPreference = {
  id: string;
  label: string;
  roles: readonly string[];
  scope: NarrativeConstraintScope;
  evidence: MotifRule;
};

const atLeast = (measureKey: NarrativeMeasureKey, target: Target, options: Omit<Rule, "measureKey" | "operator" | "target"> = {}): Rule => ({ measureKey, operator: "AT_LEAST", target, ...options });
const atMost = (measureKey: NarrativeMeasureKey, target: Target, options: Omit<Rule, "measureKey" | "operator" | "target"> = {}): Rule => ({ measureKey, operator: "AT_MOST", target, ...options });
const between = (measureKey: NarrativeMeasureKey, target: readonly [number, number], options: Omit<Rule, "measureKey" | "operator" | "target"> = {}): Rule => ({ measureKey, operator: "BETWEEN", target, ...options });

const CATALOGUE_RULES: Record<MapPresetId, CatalogueRules> = {
  CONTINENTS: { essential: [atLeast("strategic-corridor-count", 2, { scale: "COUNT" }), atLeast("peninsula-count", 2, { scale: "COUNT", confidence: 0.7 })], prohibited: [between("land-component-count", [2, 6])] },
  PANGAEA: { essential: [atLeast("largest-land-share", 0.75), atLeast("water-body-count", 2, { scale: "COUNT" })], prohibited: [atMost("land-component-count", 3)] },
  ARCHIPELAGO: { essential: [atLeast("land-component-count", 4, { scale: "COUNT" }), atMost("largest-land-share", 0.45)], prohibited: [atMost("land-component-count", 14, { scale: "COUNT" })] },
  INLAND_SEAS: { essential: [atLeast("largest-land-share", 0.78), atLeast("enclosed-sea-count", 1, { scale: "COUNT" })], prohibited: [atMost("edge-ocean-share", 0.15)] },
  EARTHSEA: { essential: [between("land-component-count", [4, 8], { scale: "COUNT" }), atMost("largest-land-share", 0.45)], prohibited: [atMost("land-component-count", 12, { scale: "COUNT" })] },
  RIFT_REALMS: { essential: [atLeast("navigation-basin-count", 2, { scale: "COUNT", confidence: 0.8 }), atLeast("oceanic-negative-space", 0.2, { confidence: 0.7 })], prohibited: [atMost("strait-count", 8, { scale: "COUNT" })] },
  LABYRINTH: { essential: [atLeast("route-redundancy", 2, { confidence: 0.65 }), atLeast("strategic-corridor-count", 3, { scale: "COUNT" })], prohibited: [atMost("land-component-count", 10, { scale: "COUNT" })] },
  WILD_REGIONS: { essential: [atLeast("climate-region-count", 6, { scale: "COUNT" }), atLeast("climate-transition-count", 6, { scale: "COUNT", confidence: 0.75 })], prohibited: [atMost("climate-region-count", 16, { scale: "COUNT" })] },

  LIVING_WORLD: { essential: [atLeast("climate-transition-count", 4, { scale: "COUNT", confidence: 0.7 }), atLeast("valid-watershed-share", 0.6, { confidence: 0.7 })], prohibited: [atLeast("largest-land-share", 0.65)] },
  TECTONIC_CONTINENTS: { essential: [atLeast("mountain-range-count", 3, { scale: "COUNT" }), atLeast("broken-range-count", 2, { scale: "COUNT", confidence: 0.75 })], prohibited: [atLeast("value-gradient", 0.08, { confidence: 0.65 })] },
  GREAT_WATERSHEDS: { essential: [atLeast("watershed-count", 3, { scale: "COUNT" }), atLeast("tributary-junction-count", 2, { scale: "COUNT", confidence: 0.75 }), atLeast("valid-watershed-share", 0.9, { confidence: 0.75 })], prohibited: [atLeast("valid-watershed-share", 0.9, { confidence: 0.75 })] },
  SHATTERED_BASINS: { essential: [atLeast("enclosed-sea-count", 2, { scale: "COUNT" }), [atLeast("strait-count", 1, { scale: "COUNT" }), atLeast("canal-isthmus-count", 1, { scale: "COUNT" })], atMost("land-share", 0.45)], prohibited: [atMost("land-share", 0.45), atMost("land-component-count", 4, { scale: "COUNT" })] },
  MYTHIC_REGIONS: { essential: [atLeast("resource-concentration", 0.35, { confidence: 0.7 }), atLeast("value-gradient", 0.2, { confidence: 0.65 })], prohibited: [atLeast("value-gradient", 0.2, { confidence: 0.65 })] },
  ENCIRCLING_LANDS: { essential: [atLeast("largest-land-share", 0.85), atLeast("enclosed-sea-count", 2, { scale: "COUNT" })], prohibited: [atLeast("route-redundancy", 2, { confidence: 0.65 })] },
  ASTRAL_PANGAEA: { essential: [atLeast("largest-land-share", 0.76), atLeast("broken-range-count", 2, { scale: "COUNT", confidence: 0.7 })], prohibited: [atLeast("strategic-corridor-count", 2, { scale: "COUNT" })] },
  RIFTWORLD: { essential: [atLeast("navigation-basin-count", 4, { scale: "COUNT", confidence: 0.75 }), atLeast("route-redundancy", 2, { confidence: 0.65 })], prohibited: [between("navigation-basin-count", [3, 12], { scale: "COUNT", confidence: 0.75 })] },
  LONELY_OCEANS: { essential: [atLeast("start-realm-count", 1, { scale: "PLAYERS" }), atLeast("oceanic-negative-space", 0.72, { confidence: 0.7 }), atLeast("isolated-major-share", 0.8)], prohibited: [atMost("coastal-hopping", 0.2, { confidence: 0.65 }), atMost("land-component-count", 2, { scale: "PLAYER_DOUBLE" })] },
  PENINSULA_REALM: { essential: [atLeast("peninsula-count", 3, { scale: "COUNT", confidence: 0.7 }), atLeast("largest-land-share", 0.65)], prohibited: [atLeast("largest-land-share", 0.65)] },
  SHATTERED_ARCHIPELAGO: { essential: [atLeast("land-component-count", 8, { scale: "COUNT" }), atMost("largest-land-share", 0.25), atLeast("oceanic-negative-space", 0.5, { confidence: 0.7 })], prohibited: [atMost("coastal-hopping", 0.55, { confidence: 0.65 }), atLeast("value-gradient", 0.08, { confidence: 0.65 })] },

  DYNAMIC_EARTH: { essential: [atLeast("mountain-range-count", 3, { scale: "COUNT" }), atLeast("climate-transition-count", 4, { scale: "COUNT", confidence: 0.7 })], prohibited: [atLeast("broken-range-count", 1, { scale: "COUNT", confidence: 0.7 })] },
  COLLIDING_PLATES: { essential: [atLeast("mountain-range-count", 2, { scale: "COUNT" }), atLeast("rain-shadow-count", 1, { scale: "COUNT", confidence: 0.65 })], prohibited: [atLeast("mountain-pass-count", 2, { scale: "COUNT", confidence: 0.75 })] },
  ANCIENT_CRATONS: { essential: [atMost("mountain-range-count", 4, { scale: "COUNT" }), atLeast("watershed-count", 3, { scale: "COUNT" })], prohibited: [atMost("hostile-frontier-share", 0.45, { confidence: 0.75 })] },
  ISLAND_ARC_EARTH: { essential: [atLeast("land-component-count", 6, { scale: "COUNT" }), atLeast("mountain-range-count", 3, { scale: "COUNT" })], prohibited: [atLeast("broken-range-count", 2, { scale: "COUNT", confidence: 0.7 })] },
  SUPERCONTINENT_INTERIOR: { essential: [[atLeast("largest-land-share", 0.78), atMost("edge-ocean-share", 0.15)], atLeast("endorheic-watershed-count", 1, { scale: "COUNT", confidence: 0.7 })], prohibited: [atMost("edge-ocean-share", 0.15)] },
  MONSOON_CONTINENTS: { essential: [atLeast("watershed-count", 3, { scale: "COUNT" }), atLeast("rain-shadow-count", 1, { scale: "COUNT", confidence: 0.65 })], prohibited: [atLeast("climate-transition-count", 3, { scale: "COUNT", confidence: 0.7 })] },
  ICEHOUSE_EARTH: { essential: [atLeast("hostile-frontier-share", 0.45, { confidence: 0.75 }), atLeast("refuge-count", 2, { scale: "COUNT", confidence: 0.7 }), atLeast("value-gradient", 0.15, { confidence: 0.65 })], prohibited: [atLeast("climate-transition-count", 2, { scale: "COUNT", confidence: 0.7 }), atMost("resource-concentration", 0.75, { confidence: 0.7 })] },

  IMPERIAL_RING: { essential: [atLeast("realm-separation", 0.35, { confidence: 0.7 }), atLeast("contested-objective-count", 1, { scale: "COUNT", confidence: 0.8 })], prohibited: [atLeast("route-redundancy", 2, { confidence: 0.8 })] },
  OPPOSING_FRONTS: { essential: [atLeast("realm-separation", 0.55, { confidence: 0.7 }), atLeast("crossing-density", 0.08, { confidence: 0.75 })], prohibited: [atLeast("route-redundancy", 2, { confidence: 0.8 })] },
  CONTESTED_HEARTLAND: { essential: [atLeast("contested-objective-count", 2, { scale: "COUNT", confidence: 0.8 }), atLeast("crossing-density", 0.12, { confidence: 0.75 })], prohibited: [atLeast("route-redundancy", 3, { confidence: 0.8 })] },
  RIVAL_CONTINENTS: { essential: [atLeast("realm-separation", 0.5, { confidence: 0.7 }), atLeast("crossing-density", 0.06, { confidence: 0.75 })], prohibited: [atLeast("route-redundancy", 2, { confidence: 0.8 })] },
  THREE_REALMS: { essential: [atLeast("start-realm-count", 3, { confidence: 0.75 }), atLeast("contested-objective-count", 3, { scale: "COUNT", confidence: 0.8 })], prohibited: [atMost("isolated-major-share", 0.15)] },
  THALASSIC_LEAGUE: { essential: [atLeast("coastal-hopping", 0.4, { confidence: 0.65 }), atLeast("route-redundancy", 3, { confidence: 0.8 })], prohibited: [atMost("isolated-major-share", 0.15)] },
  UNEQUAL_REALMS: { essential: [atLeast("value-gradient", 0.2, { confidence: 0.65 }), atLeast("route-redundancy", 2, { confidence: 0.8 })], prohibited: [atLeast("minimum-start-distance", 5)] },
};

const preference = (
  id: string,
  label: string,
  scope: NarrativeConstraintScope,
  roles: readonly string[],
  evidence: MotifRule,
): AuthoredPreference => ({ id, label, scope, roles, evidence });

/** Preferences are authored independently from the essential floor. They express
 * a desirable supporting relationship; none is a mechanically stronger copy of
 * the final required motif. */
const AUTHORED_PREFERENCES = {
  CONTINENTS: [preference("nested-maritime-theatres", "Nested maritime theatres complicate continental travel", "RELATIONSHIP", ["maritime-intrusion"], atLeast("navigation-basin-count", 2, { scale: "COUNT", confidence: 0.75 }))],
  PANGAEA: [preference("plural-suture-routes", "Several independent routes survive between continental lobes", "RELATIONSHIP", ["continental-suture"], atLeast("route-redundancy", 2, { confidence: 0.65 }))],
  ARCHIPELAGO: [preference("deep-shelf-separation", "Deep negative space separates recognizable parent shelves", "MAP", ["parent-shelf"], atLeast("oceanic-negative-space", 0.42, { confidence: 0.7 }))],
  INLAND_SEAS: [preference("inward-basin-drainage", "Inward drainage reinforces the inland-water economy", "RELATIONSHIP", ["inland-basin"], atLeast("endorheic-watershed-count", 1, { scale: "COUNT", confidence: 0.7 }))],
  EARTHSEA: [preference("consequential-realm-voyages", "Substantial open water makes inter-realm voyages consequential", "RELATIONSHIP", ["island-realm"], atLeast("oceanic-negative-space", 0.42, { confidence: 0.7 }))],
  RIFT_REALMS: [preference("rare-rift-narrows", "Rare narrow crossings punctuate otherwise authoritative divides", "RELATIONSHIP", ["rift-crossing"], atLeast("strait-count", 1, { scale: "COUNT", confidence: 0.75 }))],
  LABYRINTH: [preference("hooked-maze-provinces", "Complete hooked provinces make the maze geographically legible", "ENTITY", ["maze-province"], atLeast("peninsula-count", 2, { scale: "COUNT", confidence: 0.7 }))],
  WILD_REGIONS: [preference("provincial-value-contrast", "Provincial laws create materially different economic opportunities", "MAP", ["patchwork-province"], atLeast("value-gradient", 0.12, { confidence: 0.65 }))],

  LIVING_WORLD: [preference("multiple-living-catchments", "Several catchments participate in the environmental story", "RELATIONSHIP", ["living-catchment"], atLeast("watershed-count", 2, { scale: "COUNT" }))],
  TECTONIC_CONTINENTS: [preference("regional-climate-histories", "Continental histories support several coherent climate regions", "ENTITY", ["geologic-province"], atLeast("climate-region-count", 4, { scale: "COUNT", confidence: 0.75 }))],
  GREAT_WATERSHEDS: [preference("watershed-rain-shadows", "Relief divides produce at least one legible rain shadow", "RELATIONSHIP", ["watershed-divide"], atLeast("rain-shadow-count", 1, { scale: "COUNT", confidence: 0.65 }))],
  SHATTERED_BASINS: [preference("crossroads-route-alternatives", "The inland-sea crossroads retain more than one strategic route", "GAMEPLAY", ["crossroads-route"], atLeast("route-redundancy", 2, { confidence: 0.65 }))],
  MYTHIC_REGIONS: [preference("legible-barren-marches", "Resource-poor marches visibly separate exceptional hearts", "RELATIONSHIP", ["barren-march"], atLeast("barren-march-share", 0.12, { confidence: 0.8 }))],
  ENCIRCLING_LANDS: [preference("hierarchical-inner-waters", "Secondary lakes enrich the hierarchy of inner waters", "ENTITY", ["inner-water"], atLeast("lake-count", 1, { scale: "COUNT" }))],
  ASTRAL_PANGAEA: [preference("incompatible-scar-marches", "Scar boundaries separate visibly incompatible marches", "RELATIONSHIP", ["scar-march"], atLeast("climate-transition-count", 4, { scale: "COUNT", confidence: 0.7 }))],
  RIFTWORLD: [preference("abyssal-lattice-space", "Deep negative space makes the primary lattice authoritative", "MAP", ["primary-rift"], atLeast("oceanic-negative-space", 0.35, { confidence: 0.7 }))],
  LONELY_OCEANS: [preference("dramatic-realm-separation", "Principal realms occupy intimidatingly distant ocean neighborhoods", "GAMEPLAY", ["isolated-realm"], atLeast("realm-separation", 0.42, { confidence: 0.7 }))],
  PENINSULA_REALM: [preference("valuable-peninsula-necks", "Several peninsula necks create consequential regional corridors", "RELATIONSHIP", ["peninsula-neck"], atLeast("strategic-corridor-count", 2, { scale: "COUNT", confidence: 0.75 }))],
  SHATTERED_ARCHIPELAGO: [preference("distinct-chain-theatres", "Deep-water basins separate the principal chain systems", "RELATIONSHIP", ["parent-arc"], atLeast("navigation-basin-count", 2, { scale: "COUNT", confidence: 0.75 }))],

  DYNAMIC_EARTH: [preference("mature-process-drainage", "Mature watersheds coexist with younger active processes", "RELATIONSHIP", ["mature-basin"], atLeast("watershed-count", 3, { scale: "COUNT" }))],
  COLLIDING_PLATES: [preference("hostile-collision-frontiers", "Collision belts create a material but bounded hostile frontier", "MAP", ["collision-frontier"], between("hostile-frontier-share", [0.16, 0.58], { confidence: 0.7 }))],
  ANCIENT_CRATONS: [preference("mature-valid-drainage", "Long-lived shield drainage overwhelmingly reaches legal outlets", "RELATIONSHIP", ["mature-drainage"], atLeast("valid-watershed-share", 0.8, { confidence: 0.75 }))],
  ISLAND_ARC_EARTH: [preference("local-arc-rain-shadows", "Volcanic spines create local windward and leeward island climates", "RELATIONSHIP", ["volcanic-spine"], atLeast("rain-shadow-count", 1, { scale: "COUNT", confidence: 0.65 }))],
  SUPERCONTINENT_INTERIOR: [preference("dominant-interior-sea", "A materially large enclosed sea anchors the continental interior", "ENTITY", ["interior-sea"], atLeast("enclosed-sea-count", 1, { scale: "COUNT" }))],
  MONSOON_CONTINENTS: [preference("valid-monsoon-drainage", "Most monsoon catchments complete the wet-coast-to-outlet sequence", "RELATIONSHIP", ["monsoon-catchment"], atLeast("valid-watershed-share", 0.85, { confidence: 0.75 }))],
  ICEHOUSE_EARTH: [preference("harsh-cold-marches", "Substantial hostile country separates and contextualizes the refuges", "MAP", ["cold-march"], atLeast("barren-march-share", 0.12, { confidence: 0.8 }))],

  IMPERIAL_RING: [preference("overlapping-ring-fronts", "Neighboring outer realms retain meaningful lateral contact", "GAMEPLAY", ["lateral-front"], atLeast("crossing-density", 0.1, { confidence: 0.7 }))],
  OPPOSING_FRONTS: [preference("plural-front-objectives", "Several objectives give the frontier distinct invasion theatres", "GAMEPLAY", ["front-objective"], atLeast("contested-objective-count", 2, { scale: "COUNT", confidence: 0.8 }))],
  CONTESTED_HEARTLAND: [preference("separated-peripheral-realms", "Peripheral homelands remain distinct before converging on the heartland", "GAMEPLAY", ["peripheral-realm"], atLeast("realm-separation", 0.24, { confidence: 0.7 }))],
  RIVAL_CONTINENTS: [preference("plural-hinge-objectives", "Several hinge theatres contain independent strategic objectives", "GAMEPLAY", ["hinge-objective"], atLeast("contested-objective-count", 2, { scale: "COUNT", confidence: 0.8 }))],
  THREE_REALMS: [preference("redundant-three-way-response", "The three-realm graph retains alternate responses to pressure", "GAMEPLAY", ["realm-contact"], atLeast("route-redundancy", 2, { confidence: 0.8 }))],
  THALASSIC_LEAGUE: [preference("expansive-league-seas", "Meaningful open-water space supports naval stations and sea lanes", "MAP", ["league-sea"], atLeast("oceanic-negative-space", 0.34, { confidence: 0.7 }))],
  UNEQUAL_REALMS: [preference("role-specific-objectives", "Several contested objectives reward different strategic roles", "GAMEPLAY", ["role-objective"], atLeast("contested-objective-count", 3, { scale: "COUNT", confidence: 0.8 }))],
} as const satisfies Record<MapPresetId, readonly AuthoredPreference[]>;

export const NARRATIVE_CATALOGUE_IDS = Object.freeze(Object.keys(NARRATIVE_PROFILES) as MapPresetId[]);

function rules(value: MotifRule) {
  return Array.isArray(value) ? value as readonly Rule[] : [value as Rule];
}

function playerCount(recipe: GenerationRecipe) {
  return Math.max(2, recipe.matchIntent.humanPlayers + recipe.matchIntent.aiPlayers + recipe.matchIntent.flexiblePlayers);
}

function scaledTarget(rule: Rule, recipe: GenerationRecipe, context: { width: number; height: number }) {
  if (typeof rule.target !== "number") {
    if (rule.scale !== "COUNT") return [...rule.target] as [number, number];
    const factor = Math.max(0.5, Math.min(1.6, Math.sqrt(context.width * context.height / 4160)));
    return [Math.max(1, Math.round(rule.target[0] * factor)), Math.max(1, Math.round(rule.target[1] * factor))] as [number, number];
  }
  if (rule.scale === "PLAYERS") return playerCount(recipe);
  if (rule.scale === "PLAYER_DOUBLE") return playerCount(recipe) * 2;
  if (rule.scale !== "COUNT") return rule.target;
  const factor = Math.max(0.5, Math.min(1.6, Math.sqrt(context.width * context.height / 4160)));
  return Math.max(1, Math.round(rule.target * factor));
}

function constraint(
  id: string,
  label: string,
  strength: "ESSENTIAL" | "PREFERRED" | "PROHIBITED",
  roles: readonly string[],
  scaleLaw: NarrativeConstraintDefinition["scaleLaw"],
  explicitScope?: NarrativeConstraintScope,
): NarrativeConstraintDefinition {
  return {
    id,
    label,
    semanticKey: id,
    scope: explicitScope ?? (id.includes("route") || id.includes("corridor") || id.includes("strait") || id.includes("drain") ? "RELATIONSHIP" : id.includes("start") || id.includes("realm") || id.includes("port") ? "GAMEPLAY" : "MAP"),
    roles: [...roles],
    weight: strength === "ESSENTIAL" ? 1 : strength === "PROHIBITED" ? 0.9 : 0.35,
    tolerance: strength === "ESSENTIAL" ? 0.12 : 0.18,
    scaleLaw,
    relaxable: strength !== "PREFERRED",
  };
}

function scaleLawFor(motifRules: MotifRule): NarrativeConstraintDefinition["scaleLaw"] {
  const rule = rules(motifRules)[0];
  return rule.scale === "PLAYERS" || rule.scale === "PLAYER_DOUBLE" ? "PLAYER_COUNT" : rule.scale === "COUNT" ? "AREA" : "FIXED";
}

function evidenceFor(
  constraintId: string,
  motifRules: MotifRule,
  recipe: GenerationRecipe,
  context: { width: number; height: number },
): NarrativeEvidenceDefinition[] {
  return rules(motifRules).map((rule, index) => {
    const target = scaledTarget(rule, recipe, context);
    return {
      id: `${constraintId}-evidence-${index + 1}`,
      constraintId,
      measureKey: rule.measureKey,
      operator: rule.operator,
      target,
      minimumConfidence: rule.confidence ?? 0.8,
    };
  });
}

export function narrativeProgramDefinition(recipe: GenerationRecipe, context: { width: number; height: number; wraps: boolean }): NarrativeProgramDefinition {
  const profile = narrativeProfile(recipe.mapType);
  const catalogue = CATALOGUE_RULES[recipe.mapType];
  const authoredPreferences = AUTHORED_PREFERENCES[recipe.mapType];
  const generative = narrativeNativeContract(profile.id);
  if (!catalogue || catalogue.essential.length !== profile.requiredMotifs.length || catalogue.prohibited.length !== profile.forbiddenMotifs.length) throw new Error(`Narrative catalogue ${recipe.mapType} does not match its accepted motif contract.`);
  if (!authoredPreferences.length) throw new Error(`Narrative catalogue ${recipe.mapType} lacks an authored preference contract.`);
  const essential = profile.requiredMotifs.map((motif, index) => constraint(motif.id, motif.label, "ESSENTIAL", [motif.id], scaleLawFor(catalogue.essential[index])));
  const preferred = authoredPreferences.map((item) => constraint(item.id, item.label, "PREFERRED", item.roles, scaleLawFor(item.evidence), item.scope));
  const prohibited = profile.forbiddenMotifs.map((motif) => constraint(`avoid-${motif.id}`, `Avoid ${motif.label.toLowerCase()}`, "PROHIBITED", [motif.id], "FIXED"));
  const requiredEvidence = [
    ...essential.flatMap((item, index) => evidenceFor(item.id, catalogue.essential[index], recipe, context)),
    ...preferred.flatMap((item, index) => evidenceFor(item.id, authoredPreferences[index].evidence, recipe, context)),
    ...prohibited.flatMap((item, index) => evidenceFor(item.id, catalogue.prohibited[index], recipe, context)),
  ];
  const relaxationOrder = generative.relaxationPolicy.map((step) => ({
    id: step.id,
    label: step.label,
    constraintIds: [...step.constraintIds],
    consequence: step.consequence,
  }));
  const expectedRelaxations = new Set([...essential, ...prohibited].filter((item) => item.relaxable).map((item) => item.id));
  const authoredRelaxations = generative.relaxationPolicy.flatMap((step) => step.constraintIds);
  if (authoredRelaxations.length !== expectedRelaxations.size || new Set(authoredRelaxations).size !== authoredRelaxations.length || authoredRelaxations.some((id) => !expectedRelaxations.has(id))) {
    throw new Error(`Narrative catalogue ${profile.id} native relaxation policy must cover every relaxable essential and prohibited constraint exactly once.`);
  }
  return {
    schemaVersion: 1,
    profileId: profile.id,
    engine: profile.engine,
    essential,
    preferred,
    prohibited,
    relaxationOrder,
    requiredEvidence,
    generative,
  };
}

export function compileCatalogueNarrativeProgram(recipe: GenerationRecipe, context: { width: number; height: number; wraps: boolean }) {
  const profile = narrativeProfile(recipe.mapType);
  return compileNarrativeConstraintProgram(narrativeProgramDefinition(recipe, context), profile, recipe, context);
}

export function auditNarrativeProgramCatalogue() {
  return NARRATIVE_CATALOGUE_IDS.map((profileId) => {
    const profile = narrativeProfile(profileId);
    const ruleset = CATALOGUE_RULES[profileId];
    return {
      profileId,
      engine: profile.engine,
      essential: ruleset?.essential.length ?? 0,
      preferred: AUTHORED_PREFERENCES[profileId]?.length ?? 0,
      prohibited: ruleset?.prohibited.length ?? 0,
      grammar: narrativeNativeContract(profileId).family,
      invariants: narrativeNativeContract(profileId).invariants.length,
      relaxations: narrativeNativeContract(profileId).relaxationPolicy.length,
      complete: Boolean(ruleset && ruleset.essential.length === profile.requiredMotifs.length && AUTHORED_PREFERENCES[profileId]?.length && ruleset.prohibited.length === profile.forbiddenMotifs.length && narrativeNativeContract(profileId).invariants.length && narrativeNativeContract(profileId).relaxationPolicy.length),
    };
  });
}
