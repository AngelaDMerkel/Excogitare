import type { Civ5Map } from "./civ5-map.ts";
import { adjacentCoordinates, resourcePlacementVerdict, wonderPlacementVerdict } from "./civ5-rules.ts";
import type { NarrativeConstraintProgram } from "./narrative-constraints.ts";
import type { NarrativeContentPattern, NarrativeGenerativeContract } from "./narrative-native-contracts.ts";

export type NarrativeContentFinding = {
  id: string;
  label: string;
  status: "MET" | "WEAK" | "FAILED" | "NOT_APPLICABLE";
  score: number;
  evidence: string;
  tileIndices: number[];
};

export type NarrativeContentEvidence = {
  schemaVersion: 1;
  profileId: NarrativeConstraintProgram["profileId"];
  pattern: NarrativeContentPattern;
  status: "SATISFIED" | "WEAKENED" | "FAILED" | "NOT_APPLICABLE";
  score: number;
  findings: NarrativeContentFinding[];
};

function finding(id: string, label: string, score: number | undefined, evidence: string, tileIndices: number[] = []): NarrativeContentFinding {
  if (score === undefined) return { id, label, status: "NOT_APPLICABLE", score: 0, evidence, tileIndices };
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return { id, label, status: bounded >= 75 ? "MET" : bounded >= 45 ? "WEAK" : "FAILED", score: bounded, evidence, tileIndices };
}

function adjacent(map: Civ5Map, index: number) {
  return adjacentCoordinates(index % map.width, Math.floor(index / map.width), map.width, map.height, map.wraps).map(([x, y]) => y * map.width + x);
}

function passable(map: Civ5Map, index: number) {
  const tile = map.tiles[index];
  return tile.terrain >= 2 && tile.elevation < 2;
}

function validResource(map: Civ5Map, index: number) {
  const tile = map.tiles[index];
  return tile.resource !== 255
    && tile.wonder === 255
    && tile.resourceAmount > 0
    && resourcePlacementVerdict(map, tile).valid;
}

function validWonder(map: Civ5Map, index: number) {
  const tile = map.tiles[index];
  return tile.wonder !== 255
    && tile.resource === 255
    && wonderPlacementVerdict(map, tile).valid;
}

function validValue(map: Civ5Map, index: number) {
  return validResource(map, index) || validWonder(map, index);
}

function scaledFloor(map: Civ5Map, base: number) {
  return Math.max(1, Math.round(base * Math.max(0.65, Math.min(2.2, Math.sqrt(map.tiles.length / 960)))));
}

function ratioScore(actual: number, target: number) {
  return target <= 0 ? 100 : Math.min(100, actual / target * 100);
}

function connectedAssignments(map: Civ5Map, mode: "PASSABLE_LAND" | "WATER") {
  const assignments = new Int32Array(map.tiles.length).fill(-1);
  const components: number[][] = [];
  const eligible = (index: number) => mode === "PASSABLE_LAND" ? passable(map, index) : map.tiles[index].terrain < 2;
  for (let origin = 0; origin < map.tiles.length; origin += 1) {
    if (assignments[origin] >= 0 || !eligible(origin)) continue;
    const component = components.length;
    const queue = [origin];
    assignments[origin] = component;
    for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of adjacent(map, queue[cursor])) {
      if (assignments[next] >= 0 || !eligible(next)) continue;
      assignments[next] = component;
      queue.push(next);
    }
    components.push(queue);
  }
  return { assignments, components };
}

function indicesWithin(map: Civ5Map, origins: Iterable<number>, radius: number) {
  const reached = new Set(origins);
  let frontier = [...reached];
  for (let distance = 0; distance < radius; distance += 1) {
    const next: number[] = [];
    for (const index of frontier) for (const neighbor of adjacent(map, index)) {
      if (reached.has(neighbor)) continue;
      reached.add(neighbor);
      next.push(neighbor);
    }
    frontier = next;
  }
  return reached;
}

function hexDistance(map: Civ5Map, one: [number, number], two: [number, number]) {
  const cubeDistance = (a: [number, number], b: [number, number]) => {
    const aq = a[0] - (a[1] - (a[1] & 1)) / 2;
    const bq = b[0] - (b[1] - (b[1] & 1)) / 2;
    return (Math.abs(aq - bq) + Math.abs(aq + a[1] - bq - b[1]) + Math.abs(a[1] - b[1])) / 2;
  };
  if (!map.wraps) return cubeDistance(one, two);
  return Math.min(cubeDistance(one, two), cubeDistance([one[0] - map.width, one[1]], two), cubeDistance([one[0] + map.width, one[1]], two));
}

function coastalWaterResources(map: Civ5Map) {
  const eligible = map.tiles.flatMap((tile, index) => tile.terrain < 2
    && tile.feature !== 3
    && adjacent(map, index).some((neighbor) => passable(map, neighbor)) ? [index] : []);
  return { eligible, value: eligible.filter((index) => validResource(map, index)) };
}

function maritimeFinding(map: Civ5Map, contract: NarrativeGenerativeContract) {
  const { eligible, value } = coastalWaterResources(map);
  const countTarget = scaledFloor(map, 1.5 + contract.content.coastalValue * 4);
  const density = value.length / Math.max(1, eligible.length);
  const densityTarget = 0.025 + contract.content.coastalValue * 0.04;
  const score = ratioScore(value.length, countTarget) * 0.55 + ratioScore(density, densityTarget) * 0.45;
  return finding(
    "maritime-value",
    "Coherent maritime value",
    score,
    `${value.length} legal sea resources occupy ${eligible.length} workable coastal-water tiles (${Math.round(density * 100)}%); ${contract.profileId} requires at least ${countTarget} and a ${Math.round(densityTarget * 100)}% coastal density from its ${Math.round(contract.content.coastalValue * 100)}% maritime-value bias.`,
    value,
  );
}

function shelfAnchorFinding(map: Civ5Map, contract: NarrativeGenerativeContract) {
  const anchorRoles = /(?:^|_)(?:ANCHOR|DROWNED_SHELF)$/;
  const anchors = map.structure?.objects.filter((object) => object.kind !== "NARRATIVE_PATH" && anchorRoles.test(String(object.attributes?.role ?? ""))) ?? [];
  if (!anchors.length) return finding("shelf-anchor-supplies", "Supplied parent shelf anchors", 0, "No retained parent shelf or arc anchors are available for content verification.");
  const seaValue = new Set(coastalWaterResources(map).value);
  const supplied = anchors.filter((anchor) => [...indicesWithin(map, anchor.tileIndices.filter((index) => passable(map, index)), 2)].some((index) => seaValue.has(index)));
  const target = 0.45 + contract.content.coastalValue * 0.35;
  return finding(
    "shelf-anchor-supplies",
    "Supplied parent shelf anchors",
    ratioScore(supplied.length / anchors.length, target),
    `${supplied.length} of ${anchors.length} retained parent anchors have legal sea value within two tiles; the authored coverage floor is ${Math.round(target * 100)}%.`,
    supplied.flatMap((anchor) => anchor.tileIndices),
  );
}

function inlandWaterFinding(map: Civ5Map, contract: NarrativeGenerativeContract) {
  const retainedSeeds = new Set(map.structure?.objects.filter((object) => object.kind === "INLAND_SEA" || object.kind === "LAKE"
    || /(?:INLAND|INTERIOR|TERMINAL).*(?:SEA|LAKE|BASIN)|GREAT_INLAND_SEA/.test(String(object.attributes?.role ?? "")))
    .flatMap((object) => object.tileIndices.filter((index) => map.tiles[index]?.terrain < 2)) ?? []);
  const { assignments, components } = connectedAssignments(map, "WATER");
  const retainedComponents = new Set([...retainedSeeds].map((index) => assignments[index]).filter((component) => component >= 0));
  const retained = new Set<number>();
  for (const [componentIndex, component] of components.entries()) {
    const touchesExterior = component.some((index) => {
      const x = index % map.width;
      const y = Math.floor(index / map.width);
      return y === 0 || y === map.height - 1 || !map.wraps && (x === 0 || x === map.width - 1);
    });
    if (!touchesExterior && (!retainedComponents.size || retainedComponents.has(componentIndex))) for (const index of component) retained.add(index);
  }
  const eligible = [...retained].filter((index) => map.tiles[index].feature !== 3 && adjacent(map, index).some((neighbor) => passable(map, neighbor)));
  const value = eligible.filter((index) => validResource(map, index));
  const countTarget = scaledFloor(map, 1 + contract.content.coastalValue * 2);
  const density = value.length / Math.max(1, eligible.length);
  const densityTarget = 0.02 + contract.content.coastalValue * 0.025;
  const score = ratioScore(value.length, countTarget) * 0.65 + ratioScore(density, densityTarget) * 0.35;
  return finding(
    "inland-water-economy",
    "Valuable enclosed-water economy",
    score,
    `${value.length} legal resources occupy ${eligible.length} workable tiles in retained or topologically enclosed inland waters; the floor is ${countTarget} resources at ${Math.round(densityTarget * 100)}% density. Exterior-ocean resources do not count.`,
    value,
  );
}

function maritimeRealmFinding(map: Civ5Map) {
  const majors = map.startLocations.filter((start) => !start.cityState);
  const { assignments, components } = connectedAssignments(map, "PASSABLE_LAND");
  const seaValue = new Set(coastalWaterResources(map).value);
  const suppliedComponents = new Set<number>();
  for (const component of components) if ([...indicesWithin(map, component, 1)].some((index) => seaValue.has(index))) suppliedComponents.add(assignments[component[0]]);
  const supplied = majors.filter((start) => suppliedComponents.has(assignments[start.y * map.width + start.x]));
  const score = majors.length ? supplied.length / majors.length * 100 : 0;
  return finding(
    "maritime-realm-supplies",
    "Supplied maritime homelands",
    score,
    `${supplied.length} of ${majors.length} major starting realms have legal coastal-water value attached to their own passable land component.`,
    supplied.map((start) => start.y * map.width + start.x),
  );
}

function riverFinding(map: Civ5Map, contract: NarrativeGenerativeContract) {
  const riverEdges = map.tiles.flatMap((tile, index) => tile.river > 0 ? [index] : []);
  const valley = new Set([...indicesWithin(map, riverEdges, 2)].filter((index) => passable(map, index)));
  const legalResources = map.tiles.flatMap((_tile, index) => validResource(map, index) ? [index] : []);
  const valleyResources = legalResources.filter((index) => valley.has(index));
  const outsideLand = map.tiles.flatMap((_tile, index) => passable(map, index) && !valley.has(index) ? [index] : []);
  const valleyResourceDensity = valleyResources.length / Math.max(1, valley.size);
  const resourceDensityTarget = 0.12 + contract.content.valueContrast * 0.18;
  const resourceCountTarget = scaledFloor(map, 2 + contract.content.valueContrast * 3);
  const valleyProductive = [...valley].filter((index) => validValue(map, index) || map.tiles[index].feature === 2);
  const outsideProductive = outsideLand.filter((index) => validValue(map, index) || map.tiles[index].feature === 2);
  const valleyDensity = valleyProductive.length / Math.max(1, valley.size);
  const outsideDensity = outsideProductive.length / Math.max(1, outsideLand.length);
  const upliftTarget = 1.05 + contract.content.valueContrast * 0.8;
  const uplift = valleyDensity / Math.max(0.015, outsideDensity);
  return [
    finding(
      "river-valley-value",
      "River-valley resource concentration",
      riverEdges.length ? ratioScore(valleyResources.length, resourceCountTarget) * 0.5 + ratioScore(valleyResourceDensity, resourceDensityTarget) * 0.5 : 0,
      `${valleyResources.length} legal resources occupy ${valley.size} passable final river-valley tiles (${Math.round(valleyResourceDensity * 100)}%); the authored floor is ${resourceCountTarget} resources at ${Math.round(resourceDensityTarget * 100)}% valley density.`,
      valleyResources,
    ),
    finding(
      "river-valley-surface",
      "Productive river-valley surface",
      riverEdges.length ? ratioScore(uplift, upliftTarget) : 0,
      `Legal value or marsh occupies ${Math.round(valleyDensity * 100)}% of final river valleys versus ${Math.round(outsideDensity * 100)}% of comparable land (${uplift.toFixed(2)}×; target ${upliftTarget.toFixed(2)}×).`,
      valleyProductive,
    ),
  ];
}

function heartFinding(map: Civ5Map, contract: NarrativeGenerativeContract) {
  const hearts = new Set(map.structure?.objects.filter((object) => String(object.attributes?.role ?? "").includes("HEART") || object.attributes?.effect === "VALUE")
    .flatMap((object) => object.tileIndices) ?? []);
  const marches = new Set(map.structure?.objects.filter((object) => String(object.attributes?.role ?? "").includes("MARCH") || object.attributes?.effect === "BARREN")
    .flatMap((object) => object.tileIndices) ?? []);
  const heartLand = [...hearts].filter((index) => passable(map, index));
  const marchLand = [...marches].filter((index) => passable(map, index) && !hearts.has(index));
  const allValue = map.tiles.flatMap((_tile, index) => validValue(map, index) ? [index] : []);
  const heartValue = allValue.filter((index) => hearts.has(index));
  const marchValue = allValue.filter((index) => marches.has(index) && !hearts.has(index));
  const concentration = heartValue.length / Math.max(1, allValue.length);
  const concentrationTarget = 0.25 + contract.content.valueContrast * 0.36;
  const heartDensity = heartValue.length / Math.max(1, heartLand.length);
  const marchDensity = marchValue.length / Math.max(1, marchLand.length);
  const gradient = heartDensity - marchDensity;
  const gradientTarget = 0.08 + contract.content.valueContrast * 0.18;
  const allWonders = map.tiles.flatMap((_tile, index) => validWonder(map, index) ? [index] : []);
  const heartWonders = allWonders.filter((index) => hearts.has(index));
  return [
    finding(
      "mythic-heart-value",
      "Exceptional mythic-heart concentration",
      hearts.size ? ratioScore(concentration, concentrationTarget) : 0,
      `${heartValue.length} of ${allValue.length} legal value placements (${Math.round(concentration * 100)}%) occupy retained mythic hearts; the ${Math.round(contract.content.valueContrast * 100)}% contrast contract requires ${Math.round(concentrationTarget * 100)}%.`,
      heartValue,
    ),
    finding(
      "heart-march-gradient",
      "Heart-to-march value gradient",
      hearts.size && marches.size ? ratioScore(gradient, gradientTarget) : 0,
      `Heart value density is ${Math.round(heartDensity * 100)}% and surrounding march density is ${Math.round(marchDensity * 100)}%, a ${Math.round(gradient * 100)}-point gradient against a ${Math.round(gradientTarget * 100)}-point floor.`,
      [...heartValue, ...marchValue],
    ),
    finding(
      "mythic-wonder-bias",
      "Natural wonders within mythic hearts",
      allWonders.length ? ratioScore(heartWonders.length / allWonders.length, contract.content.wonderBias) : undefined,
      allWonders.length
        ? `${heartWonders.length} of ${allWonders.length} legal natural wonders occupy retained mythic hearts; the authored bias is ${Math.round(contract.content.wonderBias * 100)}%.`
        : "The user requested or the generator retained no natural wonders, so wonder concentration is not applicable.",
      heartWonders,
    ),
  ];
}

function isolationFinding(map: Civ5Map, contract: NarrativeGenerativeContract) {
  const { assignments } = connectedAssignments(map, "PASSABLE_LAND");
  const majors = map.startLocations.filter((start) => !start.cityState);
  const evidence = majors.map((start) => {
    const index = start.y * map.width + start.x;
    const component = assignments[index];
    const local = [...indicesWithin(map, [index], 4)].filter((candidate) => assignments[candidate] === component && validResource(map, candidate));
    const realm = map.tiles.flatMap((_tile, candidate) => assignments[candidate] === component && validResource(map, candidate) ? [candidate] : []);
    return { start, index, component, local, realm };
  });
  const componentIds = evidence.map((item) => item.component);
  const distinct = majors.length >= 2 && componentIds.every((component) => component >= 0) && new Set(componentIds).size === majors.length;
  const supplied = evidence.filter((item) => item.local.length >= 1 && item.realm.length >= 2);
  const realmScore = (distinct ? 50 : 0) + supplied.length / Math.max(1, majors.length) * 50;
  const cityStates = map.startLocations.filter((start) => start.cityState);
  const separationTarget = 5 + Math.round((1 - contract.content.cityStateContestability) * 2);
  const cityStateDistances = cityStates.map((cityState) => Math.min(...majors.map((major) => hexDistance(map, [cityState.x, cityState.y], [major.x, major.y]))));
  return [
    finding(
      "isolated-realm-supplies",
      "Viable isolated-realm supplies",
      realmScore,
      `${majors.length} majors occupy ${new Set(componentIds.filter((component) => component >= 0)).size} passable realms; ${supplied.length} have both local value and at least two legal resources in their own realm.`,
      evidence.flatMap((item) => [item.index, ...item.local]),
    ),
    finding(
      "isolated-city-state-spacing",
      "Uncrowded isolated-realm city states",
      cityStates.length ? ratioScore(Math.min(...cityStateDistances), separationTarget) : undefined,
      cityStates.length
        ? `The nearest city state is ${Math.min(...cityStateDistances)} hexes from a major start; this low-contestability identity asks for ${separationTarget}.`
        : "No city states survived the authored population-capacity policy, so their spacing is not applicable.",
      cityStates.map((start) => start.y * map.width + start.x),
    ),
  ];
}

function coldFinding(map: Civ5Map, contract: NarrativeGenerativeContract) {
  const coldEligible = map.tiles.flatMap((tile, index) => (passable(map, index) && (tile.terrain === 5 || tile.terrain === 6)
    || tile.terrain < 2 && tile.feature === 3) ? [index] : []);
  const coldValue = coldEligible.filter((index) => validResource(map, index));
  const coldLandValue = coldValue.filter((index) => passable(map, index));
  const allResources = map.tiles.flatMap((_tile, index) => validResource(map, index) ? [index] : []);
  const share = coldValue.length / Math.max(1, allResources.length);
  const shareTarget = 0.1 + contract.content.hostileFrontierValue * 0.18 + contract.content.valueContrast * 0.12;
  const countTarget = scaledFloor(map, 2 + contract.content.hostileFrontierValue * 3 + contract.content.valueContrast * 2);
  return [
    finding(
      "cold-frontier-value",
      "Valuable frozen frontiers",
      ratioScore(share, shareTarget) * 0.55 + ratioScore(coldValue.length, countTarget) * 0.45,
      `${coldValue.length} of ${allResources.length} legal resources (${Math.round(share * 100)}%) occupy passable tundra/snow or icebound water; the effective ${Math.round(contract.content.valueContrast * 100)}% contrast contract sets a floor of ${countTarget} resources and ${Math.round(shareTarget * 100)}% of world value.`,
      coldValue,
    ),
    finding(
      "cold-settlement-value",
      "Settleable cold-country value",
      ratioScore(coldLandValue.length, Math.max(2, Math.ceil(countTarget * 0.55))),
      `${coldLandValue.length} legal resources lie on passable tundra or snow rather than being confined to inaccessible ice or water.`,
      coldLandValue,
    ),
  ];
}

function brutalFrontierFindings(map: Civ5Map, contract: NarrativeGenerativeContract, theatre: ReadonlySet<number>) {
  const policy = contract.content.sitePolicy;
  if (!policy) return [];
  const brutal = map.generation?.style === policy.activationCharacter;
  const inactive = (id: string, label: string) => finding(id, label, undefined, `${contract.profileId}'s frontier-site policy activates only under the ${policy.activationCharacter.toLowerCase()} World Character.`);
  if (!brutal) return [
    inactive("brutal-frontier-barbarians", "Barbarian pressure in the DMZ"),
    inactive("brutal-frontier-ruins", "Ruins in the DMZ"),
    inactive("brutal-frontier-fallout", "Sparse fallout trace in the DMZ"),
  ];
  const point = (index: number): [number, number] => [index % map.width, Math.floor(index / map.width)];
  const farFromStarts = (index: number, buffer: number) => map.startLocations.every((start) => hexDistance(map, point(index), [start.x, start.y]) >= buffer);
  const siteFinding = (
    id: string,
    label: string,
    kind: NonNullable<Civ5Map["tiles"][number]["improvement"]>,
    setting: "NONE" | "SCARCE" | "STANDARD" | "RAGING",
    share: number,
    startBuffer: number,
  ) => {
    if (setting === "NONE") return finding(id, label, undefined, `The explicit ${label.toLowerCase()} abundance is None, so the narrative must not invent sites.`);
    const sites = map.tiles.flatMap((tile, index) => tile.improvement === kind ? [index] : []);
    if (!sites.length) return finding(id, label, 0, `The explicit ${label.toLowerCase()} abundance is ${setting.toLowerCase()}, but no legal sites survived ordinary placement. This relocation-only narrative policy cannot invent a replacement count.`);
    const valid = sites.filter((index) => theatre.has(index)
      && passable(map, index)
      && map.tiles[index].resource === 255
      && map.tiles[index].wonder === 255
      && farFromStarts(index, startBuffer)
      && sites.every((other) => other === index || hexDistance(map, point(index), point(other)) >= policy.siteSpacing));
    const target = Math.ceil(sites.length * share);
    return finding(
      id,
      label,
      ratioScore(valid.length, target),
      `${valid.length} of ${sites.length} retained ${kind === "IMPROVEMENT_BARBARIAN_CAMP" ? "camps" : "ruins"} are legal, spaced and inside the retained contested/DMZ theatre; the authored target is ${target} without changing the explicit count.`,
      valid,
    );
  };
  const falloutIndex = map.features.indexOf("FEATURE_FALLOUT");
  const fallout = falloutIndex < 0 ? [] : map.tiles.flatMap((tile, index) => tile.feature === falloutIndex ? [index] : []);
  const eligibleFallout = [...theatre].filter((index) => {
    const tile = map.tiles[index];
    return passable(map, index) && tile.resource === 255 && tile.wonder === 255 && !tile.improvement
      && (tile.feature === 255 || tile.feature === falloutIndex) && farFromStarts(index, policy.falloutStartBuffer);
  });
  const validFallout = fallout.filter((index) => theatre.has(index)
    && eligibleFallout.includes(index)
    && fallout.every((other) => other === index || hexDistance(map, point(index), point(other)) >= policy.siteSpacing));
  const falloutTarget = Math.min(policy.falloutMaximum, Math.max(1, Math.round(eligibleFallout.length * policy.falloutDensity)));
  return [
    siteFinding(
      "brutal-frontier-barbarians",
      "Barbarian pressure in the DMZ",
      "IMPROVEMENT_BARBARIAN_CAMP",
      map.generation?.barbarianAbundance ?? "NONE",
      policy.barbarianShare,
      map.generation?.barbarianStartDistance ?? 5,
    ),
    siteFinding(
      "brutal-frontier-ruins",
      "Ruins in the DMZ",
      "IMPROVEMENT_GOODY_HUT",
      map.generation?.ruinAbundance ?? "NONE",
      policy.ruinShare,
      map.generation?.ruinStartDistance ?? 3,
    ),
    finding(
      "brutal-frontier-fallout",
      "Sparse fallout trace in the DMZ",
      falloutIndex >= 0 ? ratioScore(validFallout.length, falloutTarget) : 0,
      `${validFallout.length} legal, mutually spaced fallout tiles occupy the retained contested/DMZ theatre from ${fallout.length} total fallout tile(s) and ${eligibleFallout.length} eligible theatre tile(s); the sparse character target is ${falloutTarget} and excludes starts, value and sites.`,
      validFallout,
    ),
  ];
}

function contestedFinding(map: Civ5Map, contract: NarrativeGenerativeContract) {
  const contested = new Set(map.structure?.objects.filter((object) => object.kind === "STRATEGIC_REGION" && ["CONTESTED", "OBJECTIVE"].includes(String(object.attributes?.role)))
    .flatMap((object) => object.tileIndices) ?? []);
  const brutalTheatre = new Set([...contested, ...(map.structure?.objects.filter((object) => object.kind === "STRATEGIC_REGION"
    && object.attributes?.role === "BRUTAL_DMZ").flatMap((object) => object.tileIndices) ?? [])]);
  const insideLand = [...contested].filter((index) => passable(map, index));
  const outsideLand = map.tiles.flatMap((_tile, index) => passable(map, index) && !contested.has(index) ? [index] : []);
  const allValue = map.tiles.flatMap((_tile, index) => validValue(map, index) ? [index] : []);
  const insideValue = allValue.filter((index) => contested.has(index));
  const outsideValue = allValue.filter((index) => !contested.has(index));
  // Strategic objective footprints deliberately remain local on very large
  // maps. A world-share target would therefore demand hundreds of resources
  // inside a bounded axle and mistake capacity for identity. Count proves that
  // the objective has meaningful prizes; the separate density gradient proves
  // that those prizes are actually concentrated rather than incidental.
  const countTarget = scaledFloor(map, 3 + contract.content.valueContrast * 5);
  const insideDensity = insideValue.length / Math.max(1, insideLand.length);
  const outsideDensity = outsideValue.length / Math.max(1, outsideLand.length);
  const gradient = insideDensity - outsideDensity;
  const gradientTarget = 0.06 + contract.content.valueContrast * 0.2;
  const cityStates = map.startLocations.filter((start) => start.cityState);
  const contestedNeighborhood = indicesWithin(map, contested, 1);
  const minimumSpacing = Math.max(5, contract.gameplay.minimumStartDistance);
  const contestableCityStates = cityStates.filter((start) => {
    const index = start.y * map.width + start.x;
    return passable(map, index)
      && contestedNeighborhood.has(index)
      && map.startLocations.every((other) => other === start || hexDistance(map, [start.x, start.y], [other.x, other.y]) >= minimumSpacing);
  });
  const cityStateTarget = Math.ceil(cityStates.length * contract.content.cityStateContestability);
  return [
    finding(
      "contested-value",
      "Contestable objective value",
      contested.size ? ratioScore(insideValue.length, countTarget) : 0,
      `${insideValue.length} legal value placements occupy retained contested or objective regions; the map-scaled local floor is ${countTarget}. World-share is not used because the strategic axle remains bounded as total map area grows.`,
      insideValue,
    ),
    finding(
      "contested-value-gradient",
      "Objective-to-homeland value gradient",
      contested.size ? ratioScore(gradient, gradientTarget) : 0,
      `Contestable regions carry ${Math.round(insideDensity * 100)}% value density versus ${Math.round(outsideDensity * 100)}% elsewhere, a ${Math.round(gradient * 100)}-point gradient against a ${Math.round(gradientTarget * 100)}-point floor.`,
      insideValue,
    ),
    finding(
      "contested-city-states",
      "City states in shared theatres",
      cityStates.length ? ratioScore(contestableCityStates.length, cityStateTarget) : undefined,
      cityStates.length
        ? `${contestableCityStates.length} of ${cityStates.length} legal, globally spaced city-state starts occupy or adjoin retained contested/objective regions; the authored ${Math.round(contract.content.cityStateContestability * 100)}% bias requires ${cityStateTarget}.`
        : "No city states survived the authored population-capacity policy, so contested city-state placement is not applicable.",
      contestableCityStates.map((start) => start.y * map.width + start.x),
    ),
    ...brutalFrontierFindings(map, contract, brutalTheatre),
  ];
}

function navalNetworkFinding(map: Civ5Map, contract: NarrativeGenerativeContract) {
  const graph = map.structure?.strategicGraph;
  const naval = graph?.edges.filter((edge) => edge.kind === "NAVAL") ?? [];
  const waterShare = graph?.metrics.navalRouteWaterShare ?? 0;
  const majors = map.startLocations.filter((start) => !start.cityState);
  const coastalMajors = majors.filter((start) => adjacent(map, start.y * map.width + start.x).some((index) => map.tiles[index].terrain < 2));
  const cityStates = map.startLocations.filter((start) => start.cityState);
  const coastalCityStates = cityStates.filter((start) => adjacent(map, start.y * map.width + start.x).some((index) => map.tiles[index].terrain < 2));
  const routeTarget = Math.max(1, contract.gameplay.routeRedundancy);
  const routeScore = ratioScore(naval.length, routeTarget) * 0.35 + waterShare * 100 * 0.35 + coastalMajors.length / Math.max(1, majors.length) * 100 * 0.3;
  return [
    finding(
      "naval-network-content",
      "Ports and legal sea lanes",
      routeScore,
      `${naval.length} naval routes retain ${Math.round(waterShare * 100)}% water fidelity and ${coastalMajors.length} of ${majors.length} major starts are actual ports; route target ${routeTarget}.`,
      [...naval.flatMap((edge) => edge.tileIndices), ...coastalMajors.map((start) => start.y * map.width + start.x)],
    ),
    finding(
      "naval-city-state-ports",
      "Coastal diplomatic city states",
      cityStates.length ? ratioScore(coastalCityStates.length / cityStates.length, contract.content.cityStateContestability) : undefined,
      cityStates.length
        ? `${coastalCityStates.length} of ${cityStates.length} city states are coastal; the authored naval contestability bias is ${Math.round(contract.content.cityStateContestability * 100)}%.`
        : "No city states survived the authored population-capacity policy, so port coverage is not applicable.",
      coastalCityStates.map((start) => start.y * map.width + start.x),
    ),
  ];
}

function roleFinding(map: Civ5Map) {
  type Role = "TALL" | "WIDE" | "WAR" | "TURTLE";
  const roles: Role[] = ["TALL", "WIDE", "WAR", "TURTLE"];
  const regions = map.structure?.objects.filter((object) => object.kind === "STRATEGIC_REGION" && object.attributes?.role === "SAFE") ?? [];
  const reports = Object.fromEntries(roles.map((role) => {
    const indices = [...new Set(regions.filter((object) => object.attributes?.contractRole === role).flatMap((object) => object.tileIndices))];
    const land = indices.filter((index) => passable(map, index));
    const resources = land.filter((index) => validResource(map, index));
    const plains = land.filter((index) => map.tiles[index].terrain === 3);
    return [role, { indices, land: land.length, resources: resources.length, plains: plains.length }];
  })) as Record<Role, { indices: number[]; land: number; resources: number; plains: number }>;
  const density = (role: Role) => reports[role].resources / Math.max(1, reports[role].land);
  const plainsShare = (role: Role) => reports[role].plains / Math.max(1, reports[role].land);
  const conditions = [
    roles.every((role) => reports[role].land > 0),
    reports.WIDE.land >= Math.max(reports.TALL.land, reports.WAR.land) * 1.25,
    density("TALL") >= Math.max(density("WIDE"), density("WAR"), density("TURTLE")) * 1.15,
    plainsShare("WAR") >= (plainsShare("TALL") + plainsShare("WIDE") + plainsShare("TURTLE")) / 3,
    reports.TURTLE.land >= reports.TALL.land,
  ];
  const score = conditions.filter(Boolean).length / conditions.length * 100;
  return finding(
    "role-economies",
    "Materially different role economies",
    score,
    `Actual safe-region profiles are Tall ${reports.TALL.land} land/${reports.TALL.resources} resources, Wide ${reports.WIDE.land}/${reports.WIDE.resources}, War ${reports.WAR.land}/${reports.WAR.resources} (${Math.round(plainsShare("WAR") * 100)}% plains), and Turtle ${reports.TURTLE.land}/${reports.TURTLE.resources}. ${conditions.filter(Boolean).length} of ${conditions.length} authored role relationships are present.`,
    roles.flatMap((role) => reports[role].indices),
  );
}

function patternFindings(map: Civ5Map, contract: NarrativeGenerativeContract): NarrativeContentFinding[] {
  switch (contract.content.pattern) {
    case "DISTRIBUTED":
      return [finding("distributed-content", "Distributed engine ecology", undefined, "This identity delegates ordinary content distribution to the engine and makes no identity-specific concentration claim.")];
    case "SHELF_ANCHORS":
      return [maritimeFinding(map, contract), shelfAnchorFinding(map, contract)];
    case "INLAND_WATER_ECONOMY":
      return [maritimeFinding(map, contract), inlandWaterFinding(map, contract)];
    case "MARITIME_REALMS":
      return [maritimeFinding(map, contract), maritimeRealmFinding(map)];
    case "RIVER_VALLEYS":
      return riverFinding(map, contract);
    case "MYTHIC_HEARTS":
      return heartFinding(map, contract);
    case "ISOLATED_SCARCITY":
      return isolationFinding(map, contract);
    case "COLD_FRONTIER":
      return coldFinding(map, contract);
    case "CONTESTED_CENTRE":
      return contestedFinding(map, contract);
    case "NAVAL_NETWORK":
      return [maritimeFinding(map, contract), ...navalNetworkFinding(map, contract)];
    case "ROLE_ASYMMETRY":
      return [roleFinding(map)];
    default: {
      const unsupported: never = contract.content.pattern;
      throw new Error(`Unsupported narrative content pattern: ${String(unsupported)}.`);
    }
  }
}

export function evaluateNarrativeContentEvidence(
  map: Civ5Map,
  program: NarrativeConstraintProgram,
  effectiveContract: NarrativeGenerativeContract | undefined = program.generative,
): NarrativeContentEvidence {
  const contract = effectiveContract;
  if (!contract) {
    return {
      schemaVersion: 1,
      profileId: program.profileId,
      pattern: "DISTRIBUTED",
      status: "NOT_APPLICABLE",
      score: 0,
      findings: [finding("legacy-content-contract", "Legacy content contract", undefined, "This migrated programme has no native content contract, so no content claim can be assessed.")],
    };
  }
  if (contract.profileId !== program.profileId) throw new Error(`Narrative content contract ${contract.profileId} does not match programme ${program.profileId}.`);
  const findings = patternFindings(map, contract);
  const applicable = findings.filter((item) => item.status !== "NOT_APPLICABLE");
  const failed = applicable.some((item) => item.status === "FAILED");
  const weak = applicable.some((item) => item.status === "WEAK");
  return {
    schemaVersion: 1,
    profileId: program.profileId,
    pattern: contract.content.pattern,
    status: !applicable.length ? "NOT_APPLICABLE" : failed ? "FAILED" : weak ? "WEAKENED" : "SATISFIED",
    score: applicable.length ? Number((applicable.reduce((sum, item) => sum + item.score, 0) / applicable.length).toFixed(2)) : 0,
    findings,
  };
}
