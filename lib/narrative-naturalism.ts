import type { Civ5Map } from "./civ5-map.ts";
import { adjacentCoordinates } from "./civ5-rules.ts";
import type { NarrativeConstraintProgram } from "./narrative-constraints.ts";
import { reconstructCiv5RiverEdgeSystems } from "./rivers.ts";

export type NarrativeNaturalismFinding = {
  id: string;
  label: string;
  status: "MET" | "WEAK" | "FAILED";
  score: number;
  evidence: string;
  tileIndices: number[];
};

export type NarrativeNaturalismEvidence = {
  schemaVersion: 1;
  profileId: NarrativeConstraintProgram["profileId"];
  status: "SATISFIED" | "WEAKENED" | "FAILED";
  score: number;
  findings: NarrativeNaturalismFinding[];
  metrics: Record<string, number>;
  limitations: string[];
};

type Component = { tileIndices: number[]; minimumX: number; maximumX: number; minimumY: number; maximumY: number };

const CLIMATE_SENSITIVE = new Set<NarrativeConstraintProgram["profileId"]>([
  "GREAT_WATERSHEDS",
  "MYTHIC_REGIONS",
  "SUPERCONTINENT_INTERIOR",
  "MONSOON_CONTINENTS",
  "ICEHOUSE_EARTH",
]);

const HYDROLOGY_FLOORS: Partial<Record<NarrativeConstraintProgram["profileId"], number>> = {
  LIVING_WORLD: 1,
  GREAT_WATERSHEDS: 3,
  ANCIENT_CRATONS: 3,
  SUPERCONTINENT_INTERIOR: 3,
  MONSOON_CONTINENTS: 3,
};

function neighbors(map: Pick<Civ5Map, "width" | "height" | "wraps">, index: number) {
  return adjacentCoordinates(index % map.width, Math.floor(index / map.width), map.width, map.height, map.wraps)
    .map(([x, y]) => y * map.width + x);
}

function connectedComponents(map: Civ5Map, predicate: (index: number) => boolean): Component[] {
  const seen = new Uint8Array(map.tiles.length);
  const result: Component[] = [];
  for (let origin = 0; origin < map.tiles.length; origin += 1) {
    if (seen[origin] || !predicate(origin)) continue;
    const tileIndices = [origin];
    seen[origin] = 1;
    let minimumX = origin % map.width;
    let maximumX = minimumX;
    let minimumY = Math.floor(origin / map.width);
    let maximumY = minimumY;
    for (let cursor = 0; cursor < tileIndices.length; cursor += 1) {
      const index = tileIndices[cursor];
      const x = index % map.width;
      const y = Math.floor(index / map.width);
      minimumX = Math.min(minimumX, x);
      maximumX = Math.max(maximumX, x);
      minimumY = Math.min(minimumY, y);
      maximumY = Math.max(maximumY, y);
      for (const next of neighbors(map, index)) {
        if (seen[next] || !predicate(next)) continue;
        seen[next] = 1;
        tileIndices.push(next);
      }
    }
    result.push({ tileIndices, minimumX, maximumX, minimumY, maximumY });
  }
  return result.sort((one, two) => two.tileIndices.length - one.tileIndices.length || one.tileIndices[0] - two.tileIndices[0]);
}

function finding(
  id: string,
  label: string,
  status: NarrativeNaturalismFinding["status"],
  score: number,
  evidence: string,
  tileIndices: Iterable<number> = [],
): NarrativeNaturalismFinding {
  return { id, label, status, score: Math.max(0, Math.min(100, Math.round(score))), evidence, tileIndices: [...new Set(tileIndices)].sort((one, two) => one - two) };
}

function coefficientOfVariation(values: readonly number[]) {
  if (values.length < 2) return 1;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return Math.sqrt(variance) / Math.max(1, mean);
}

function thinStraightLandRuns(map: Civ5Map) {
  let maximumRatio = 0;
  let maximumTiles: number[] = [];
  let nearCompleteLines = 0;
  const inspect = (indices: number[], lineLength: number, perpendicular: (index: number) => number[]) => {
    let start = 0;
    while (start < indices.length) {
      while (start < indices.length && map.tiles[indices[start]].terrain < 2) start += 1;
      let end = start;
      while (end < indices.length && map.tiles[indices[end]].terrain >= 2) end += 1;
      if (end <= start) continue;
      const run = indices.slice(start, end);
      const support = run.reduce((sum, index) => sum + perpendicular(index).filter((next) => map.tiles[next]?.terrain >= 2).length, 0)
        / Math.max(1, run.length * 2);
      const ratio = run.length / Math.max(1, lineLength);
      if (support <= 0.38 && ratio > maximumRatio) {
        maximumRatio = ratio;
        maximumTiles = run;
      }
      if (support <= 0.38 && ratio >= 0.9) nearCompleteLines += 1;
      start = end;
    }
  };
  for (let y = 0; y < map.height; y += 1) inspect(
    Array.from({ length: map.width }, (_value, x) => y * map.width + x),
    map.width,
    (index) => {
      const x = index % map.width;
      const row = Math.floor(index / map.width);
      return [row - 1, row + 1].flatMap((nextY) => nextY >= 0 && nextY < map.height ? [nextY * map.width + x] : []);
    },
  );
  for (let x = 0; x < map.width; x += 1) inspect(
    Array.from({ length: map.height }, (_value, y) => y * map.width + x),
    map.height,
    (index) => {
      const column = index % map.width;
      const y = Math.floor(index / map.width);
      return [column - 1, column + 1].flatMap((nextX) => nextX >= 0 && nextX < map.width ? [y * map.width + nextX] : []);
    },
  );
  return { maximumRatio, maximumTiles, nearCompleteLines };
}

function harshClimateEdges(map: Civ5Map) {
  const result = new Set<number>();
  let landEdges = 0;
  for (let index = 0; index < map.tiles.length; index += 1) {
    if (map.tiles[index].terrain < 2) continue;
    for (const next of neighbors(map, index)) {
      if (next <= index || map.tiles[next].terrain < 2) continue;
      landEdges += 1;
      const pair = new Set([map.tiles[index].terrain, map.tiles[next].terrain]);
      const harsh = pair.has(6) && (pair.has(2) || pair.has(4)) || pair.has(5) && pair.has(4);
      if (harsh) { result.add(index); result.add(next); }
    }
  }
  return { tileIndices: [...result], share: result.size / Math.max(1, landEdges) };
}

function objectRole(object: NonNullable<Civ5Map["structure"]>["objects"][number]) {
  return String(object.attributes?.role ?? object.attributes?.relationship ?? "");
}

function objectsByRole(map: Civ5Map, role: string) {
  const retained = new Set(map.structure?.narrativeAdapter?.causalObjects.filter((cause) => cause.retained && cause.role === role).map((cause) => cause.nativeObjectId) ?? []);
  return map.structure?.objects.filter((object) => object.attributes?.nativeNarrative === true && objectRole(object) === role && retained.has(object.id)) ?? [];
}

function share(indices: readonly number[], predicate: (index: number) => boolean) {
  return indices.filter(predicate).length / Math.max(1, indices.length);
}

function withinOne(map: Civ5Map, indices: readonly number[]) {
  const result = new Set(indices);
  for (const index of indices) for (const next of neighbors(map, index)) result.add(next);
  return result;
}

function endpointAngle(map: Civ5Map, indices: readonly number[]) {
  if (indices.length < 2) return undefined;
  const first = indices[0];
  const last = indices.at(-1)!;
  let dx = last % map.width - first % map.width;
  if (map.wraps && Math.abs(dx) > map.width / 2) dx += dx > 0 ? -map.width : map.width;
  const dy = (Math.floor(last / map.width) - Math.floor(first / map.width)) * 0.866;
  return Math.atan2(dy, dx);
}

function tileHexDistance(map: Civ5Map, one: number, two: number) {
  const cube = (index: number) => {
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    const q = x - (y - (y & 1)) / 2;
    return [q, -q - y, y] as const;
  };
  const direct = (left: number, right: number) => {
    const oneCube = cube(left);
    const twoCube = cube(right);
    return Math.max(Math.abs(oneCube[0] - twoCube[0]), Math.abs(oneCube[1] - twoCube[1]), Math.abs(oneCube[2] - twoCube[2]));
  };
  if (!map.wraps) return direct(one, two);
  const x = one % map.width;
  const y = Math.floor(one / map.width);
  // The array index cannot encode an out-of-range wrapped coordinate, so use
  // the cube formula explicitly for the two translated x positions.
  const pointDistance = (shift: number) => {
    const targetX = two % map.width;
    const targetY = Math.floor(two / map.width);
    const sourceX = x + shift;
    const sourceQ = sourceX - (y - (y & 1)) / 2;
    const targetQ = targetX - (targetY - (targetY & 1)) / 2;
    return Math.max(Math.abs(sourceQ - targetQ), Math.abs((-sourceQ - y) - (-targetQ - targetY)), Math.abs(y - targetY));
  };
  return Math.min(pointDistance(0), pointDistance(-map.width), pointDistance(map.width));
}

function axialConcentration(angles: readonly number[]) {
  if (angles.length < 2) return 0;
  const x = angles.reduce((sum, angle) => sum + Math.cos(angle * 2), 0) / angles.length;
  const y = angles.reduce((sum, angle) => sum + Math.sin(angle * 2), 0) / angles.length;
  return Math.hypot(x, y);
}

function genericFindings(map: Civ5Map, profileId: NarrativeConstraintProgram["profileId"], metrics: Record<string, number>) {
  const results: NarrativeNaturalismFinding[] = [];
  const landComponents = connectedComponents(map, (index) => map.tiles[index].terrain >= 2);
  const passableComponents = connectedComponents(map, (index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation < 2);
  const passableByIndex = new Int32Array(map.tiles.length).fill(-1);
  passableComponents.forEach((component, componentIndex) => component.tileIndices.forEach((index) => { passableByIndex[index] = componentIndex; }));
  const minimumHome = Math.max(12, Math.round(Math.sqrt(map.tiles.length) / 3));
  const isolatedStarts = map.startLocations.filter((start) => !start.cityState && start.playable !== false)
    .map((start) => start.y * map.width + start.x)
    .filter((index) => passableByIndex[index] < 0 || passableComponents[passableByIndex[index]]!.tileIndices.length < minimumHome);
  metrics.isolatedMajorHomes = isolatedStarts.length;
  results.push(finding(
    "accessible-major-homes",
    "Accessible major homelands",
    isolatedStarts.length ? "FAILED" : "MET",
    isolatedStarts.length ? 0 : 100,
    isolatedStarts.length
      ? `${isolatedStarts.length} major start${isolatedStarts.length === 1 ? " occupies" : "s occupy"} a final passable component smaller than the ${minimumHome}-tile scale floor.`
      : `Every major start occupies a final passable component of at least ${minimumHome} tiles.`,
    isolatedStarts,
  ));

  const microFloor = Math.max(2, Math.round(Math.sqrt(map.tiles.length) / 18));
  const micro = landComponents.filter((component) => component.tileIndices.length <= microFloor);
  const microTiles = micro.flatMap((component) => component.tileIndices);
  const landCount = landComponents.reduce((sum, component) => sum + component.tileIndices.length, 0);
  const microShare = microTiles.length / Math.max(1, landCount);
  metrics.landMicrocomponents = micro.length;
  metrics.landMicrocomponentShare = microShare;
  const microWeak = micro.length > Math.max(4, Math.round(Math.sqrt(map.tiles.length) / 9)) || microShare > 0.035;
  results.push(finding(
    "component-discipline",
    "Unexplained microcomponent discipline",
    microWeak ? "WEAK" : "MET",
    microWeak ? Math.max(35, 100 - microShare * 900 - micro.length) : 100,
    `${micro.length} land components contain at most ${microFloor} tiles and account for ${(microShare * 100).toFixed(1)}% of land.`,
    microTiles,
  ));

  const harsh = harshClimateEdges(map);
  metrics.harshClimateEdgeShare = harsh.share;
  const climateFailure = CLIMATE_SENSITIVE.has(profileId) && harsh.share > 0.025;
  const climateWeak = harsh.share > 0.012;
  results.push(finding(
    "climate-transition-continuity",
    "Causally buffered climate transitions",
    climateFailure ? "FAILED" : climateWeak ? "WEAK" : "MET",
    climateFailure ? 0 : climateWeak ? Math.max(40, 100 - harsh.share * 1800) : 100,
    `${harsh.tileIndices.length} land tiles participate in direct desert–cold or grass–snow contacts (${(harsh.share * 100).toFixed(2)}% of land adjacencies).`,
    harsh.tileIndices,
  ));

  const terrainSpeckles = [2, 3, 4, 5, 6].flatMap((terrain) => connectedComponents(map, (index) => map.tiles[index].terrain === terrain)
    .filter((component) => component.tileIndices.length <= 2).flatMap((component) => component.tileIndices));
  const isRegionalFeature = (feature: number) => feature !== 255
    && ["FOREST", "JUNGLE", "MARSH"].some((token) => (map.features[feature] ?? "").includes(token));
  const featureSpeckles = map.tiles.flatMap((tile, index) => tile.terrain >= 2 && isRegionalFeature(tile.feature)
    && !neighbors(map, index).some((next) => map.tiles[next].feature === tile.feature) ? [index] : []);
  const speckles = [...new Set([...terrainSpeckles, ...featureSpeckles])];
  const speckleShare = speckles.length / Math.max(1, landCount);
  metrics.surfaceSpeckleTiles = speckles.length;
  metrics.surfaceSpeckleShare = speckleShare;
  const speckleFailure = profileId === "GREAT_WATERSHEDS" && speckleShare > 0.03;
  const speckleWeak = speckleShare > 0.03;
  results.push(finding(
    "regional-surface-composition",
    "Regionally composed terrain and features",
    speckleFailure ? "FAILED" : speckleWeak ? "WEAK" : "MET",
    speckleFailure ? 0 : speckleWeak ? Math.max(40, 100 - speckleShare * 1200) : 100,
    `${speckles.length} land tiles (${(speckleShare * 100).toFixed(1)}%) form isolated one- or two-tile terrain patches or unsupported feature flecks.`,
    speckles,
  ));

  return results;
}

function profileFindings(map: Civ5Map, profileId: NarrativeConstraintProgram["profileId"], metrics: Record<string, number>) {
  const results: NarrativeNaturalismFinding[] = [];
  const straight = thinStraightLandRuns(map);
  metrics.maximumThinStraightLandRun = straight.maximumRatio;
  metrics.nearCompleteLandLines = straight.nearCompleteLines;
  if (profileId === "SHATTERED_BASINS") {
    const constrainedStrip = Math.min(map.width, map.height) < 8;
    const failed = !constrainedStrip && (straight.maximumRatio >= 0.75 || straight.nearCompleteLines >= 2);
    results.push(finding("local-basin-rims", "Irregular local basin rims", failed ? "FAILED" : "MET", failed ? 0 : 100,
      `${constrainedStrip ? "The selected strip geometry is too narrow for a nonrectangular closed rim; " : ""}the longest weakly supported straight land run spans ${(straight.maximumRatio * 100).toFixed(0)}% of its map axis; ${straight.nearCompleteLines} rows or columns are at least 90% land.`, straight.maximumTiles));
  }

  if (profileId === "SHATTERED_ARCHIPELAGO") {
    const arcs = objectsByRole(map, "FOLLOWS_ARC");
    const visibleWires = arcs.filter((arc) => arc.tileIndices.length >= Math.max(6, Math.round(Math.sqrt(map.tiles.length) / 5))
      && share(arc.tileIndices, (index) => map.tiles[index].terrain >= 2) >= 0.8);
    metrics.visibleParentArcWires = visibleWires.length;
    results.push(finding("latent-parent-arcs", "Latent broken-chain ancestry", visibleWires.length ? "FAILED" : "MET", visibleWires.length ? 0 : 100,
      `${visibleWires.length} of ${arcs.length} retained parent arcs remain long continuous land paths instead of latent shelf or plate ancestry.`, visibleWires.flatMap((object) => object.tileIndices)));
  }

  if (profileId === "RIFTWORLD") {
    const rifts = [...objectsByRole(map, "PRIMARY_RIFT"), ...objectsByRole(map, "SECONDARY_RIFT")];
    const deepShares = rifts.map((object) => share(object.tileIndices, (index) => map.tiles[index].terrain === 0));
    const shallow = rifts.filter((_object, index) => deepShares[index] < 0.55);
    metrics.minimumRiftDeepWaterShare = deepShares.length ? Math.min(...deepShares) : 0;
    results.push(finding("hierarchical-deep-rifts", "Hierarchical deep-water rifts", !rifts.length || shallow.length ? "FAILED" : "MET", !rifts.length || shallow.length ? 0 : 100,
      `${rifts.length - shallow.length}/${rifts.length} retained rifts contain at least 55% deep ocean; the minimum share is ${Math.round((metrics.minimumRiftDeepWaterShare ?? 0) * 100)}%.`, shallow.flatMap((object) => object.tileIndices)));
  }

  if (profileId === "PENINSULA_REALM") {
    const heads = objectsByRole(map, "PENINSULA_PROVINCE");
    const minimumArea = Math.max(5, Math.round(Math.sqrt(map.tiles.length) / 3));
    const small = heads.filter((head) => head.tileIndices.filter((index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation < 2).length < minimumArea);
    metrics.minimumPeninsulaHeadArea = heads.length ? Math.min(...heads.map((head) => head.tileIndices.length)) : 0;
    results.push(finding("country-scale-peninsulas", "Country-scale peninsula provinces", !heads.length || small.length ? "FAILED" : "MET", !heads.length || small.length ? 0 : 100,
      `${heads.length - small.length}/${heads.length} retained peninsula heads contain at least ${minimumArea} passable tiles.`, small.flatMap((object) => object.tileIndices)));
  }

  if (profileId === "RIFT_REALMS") {
    const land = map.tiles.filter((tile) => tile.terrain >= 2);
    const flatShare = land.filter((tile) => tile.elevation === 0).length / Math.max(1, land.length);
    metrics.riftRealmFlatLandShare = flatShare;
    results.push(finding("varied-rift-cell-relief", "Varied inhabitable rift-cell relief", flatShare < 0.08 ? "FAILED" : flatShare < 0.18 ? "WEAK" : "MET", flatShare < 0.08 ? 0 : Math.min(100, flatShare / 0.18 * 100),
      `${Math.round(flatShare * 100)}% of final rift-realm land is flat; viable cells require a nontrivial low-relief substrate.`));
  }

  if (profileId === "COLLIDING_PLATES") {
    const belts = objectsByRole(map, "COLLISION_BELT");
    const weak = belts.filter((belt) => {
      const neighborhood = [...withinOne(map, belt.tileIndices)].filter((index) => map.tiles[index].terrain >= 2);
      const mountainShare = share(neighborhood, (index) => map.tiles[index].elevation === 2);
      const reliefShare = share(neighborhood, (index) => map.tiles[index].elevation > 0);
      return mountainShare < 0.08 || reliefShare < 0.45;
    });
    metrics.materialCollisionBelts = belts.length - weak.length;
    results.push(finding("material-collision-belts", "Mountain-bearing collision systems", !belts.length || weak.length ? "FAILED" : "MET", !belts.length || weak.length ? 0 : 100,
      `${belts.length - weak.length}/${belts.length} retained collision routes have a mountain-bearing, relief-dominant one-tile neighborhood.`, weak.flatMap((object) => object.tileIndices)));
  }

  if (profileId === "ISLAND_ARC_EARTH") {
    const arcs = objectsByRole(map, "VOLCANIC_PARENT_ARC");
    const angles = arcs.flatMap((arc) => {
      const angle = endpointAngle(map, arc.tileIndices);
      return angle === undefined ? [] : [angle];
    });
    const concentration = axialConcentration(angles);
    const broad = arcs.filter((arc) => {
      const xs = arc.tileIndices.map((index) => index % map.width);
      return xs.length && (Math.max(...xs) - Math.min(...xs)) / Math.max(1, map.width - 1) > 0.52;
    });
    const failed = arcs.length >= 3 && concentration > 0.88 && broad.length >= Math.ceil(arcs.length * 0.6);
    metrics.volcanicArcOrientationConcentration = concentration;
    results.push(finding("varied-volcanic-arc-geometry", "Locally varied volcanic arcs", failed ? "FAILED" : concentration > 0.78 ? "WEAK" : "MET", failed ? 0 : Math.max(45, 100 - concentration * 45),
      `${arcs.length} volcanic arcs have axial orientation concentration ${concentration.toFixed(2)}; ${broad.length} span more than half the map width.`, failed ? arcs.flatMap((object) => object.tileIndices) : []));
  }

  if (profileId === "ICEHOUSE_EARTH") {
    const refuges = objectsByRole(map, "REFUGE");
    const uncaused = refuges.filter((refuge) => {
      const temperature = Number(refuge.attributes?.meanTemperature ?? Number.NaN);
      const moisture = Number(refuge.attributes?.meanMoisture ?? Number.NaN);
      return !Number.isFinite(temperature) || !Number.isFinite(moisture) || temperature < 0.38 || moisture < 0.28;
    });
    metrics.climateFaithfulRefuges = refuges.length - uncaused.length;
    results.push(finding("climate-caused-refuges", "Climate-caused temperate refuges", !refuges.length || uncaused.length ? "FAILED" : "MET", !refuges.length || uncaused.length ? 0 : 100,
      `${refuges.length - uncaused.length}/${refuges.length} retained refuges record a temperate final climate field before their surface biome is selected.`, uncaused.flatMap((object) => object.tileIndices)));
  }

  const hydrologyFloor = HYDROLOGY_FLOORS[profileId];
  if (hydrologyFloor !== undefined) {
    const edgeFloor = Math.max(3, Math.round(Math.sqrt(map.tiles.length) / 8));
    const systems = reconstructCiv5RiverEdgeSystems(map);
    const substantial = systems.filter((system) => system.edgeCount >= edgeFloor && system.acyclic && system.directedToOutlet);
    metrics.substantialDirectedRiverSystems = substantial.length;
    metrics.minimumNarrativeRiverEdges = edgeFloor;
    results.push(finding("map-scale-hydrology", "Map-scale directed hydrology", substantial.length < hydrologyFloor ? "FAILED" : "MET", substantial.length < hydrologyFloor ? substantial.length / Math.max(1, hydrologyFloor) * 45 : 100,
      `${substantial.length}/${hydrologyFloor} required directed, acyclic river systems contain at least ${edgeFloor} encoded Civ V edges.`, substantial.flatMap((system) => system.tileIndices)));
  }

  if (map.structure?.engine === "POLIS") {
    const graph = map.structure.strategicGraph;
    const longStraightPath = (tileIndices: readonly number[]) => {
      if (tileIndices.length < Math.max(7, Math.round(Math.sqrt(map.tiles.length) / 5))) return false;
      const angle = endpointAngle(map, tileIndices);
      if (angle === undefined) return false;
      const first = tileIndices[0];
      const last = tileIndices.at(-1)!;
      const dx = Math.abs(last % map.width - first % map.width);
      const dy = Math.abs(Math.floor(last / map.width) - Math.floor(first / map.width));
      const span = Math.max(dx / Math.max(1, map.width - 1), dy / Math.max(1, map.height - 1));
      const straightness = tileHexDistance(map, first, last) / Math.max(1, tileIndices.length - 1);
      const rows = new Set(tileIndices.map((index) => Math.floor(index / map.width))).size;
      const columns = new Set(tileIndices.map((index) => index % map.width)).size;
      return span > 0.34 && (straightness > 0.9 || rows <= 2 || columns <= 2);
    };
    const longStraight = graph?.edges.filter((edge) => longStraightPath(edge.tileIndices)) ?? [];
    const definingHinges = map.structure.objects.filter((object) => object.attributes?.nativeNarrative === true
      && (objectRole(object) === "PRIMARY_HINGE" || objectRole(object) === "SECONDARY_HINGE"));
    const straightDefiningHinges = definingHinges.filter((object) => longStraightPath(object.tileIndices));
    metrics.longStraightStrategicRoutes = longStraight.length;
    metrics.longStraightDefiningHinges = straightDefiningHinges.length;
    const critical = (profileId === "RIVAL_CONTINENTS" || profileId === "OPPOSING_FRONTS") && straightDefiningHinges.length > 0;
    results.push(finding("geographic-strategic-disguise", "Geographic disguise of strategic routes", critical ? "FAILED" : longStraight.length > 1 ? "WEAK" : "MET", critical ? 0 : longStraight.length > 1 ? 55 : 100,
      `${longStraight.length} strategic routes are long and highly straight; ${straightDefiningHinges.length}/${definingHinges.length} exact defining hinges expose that geometry.`, critical ? straightDefiningHinges.flatMap((object) => object.tileIndices) : longStraight.flatMap((edge) => edge.tileIndices)));

    if (profileId === "THALASSIC_LEAGUE") {
      const majorComponents = connectedComponents(map, (index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation < 2)
        .filter((component) => map.startLocations.some((start) => !start.cityState && component.tileIndices.includes(start.y * map.width + start.x)));
      const variation = coefficientOfVariation(majorComponents.map((component) => component.tileIndices.length));
      metrics.thalassicRealmAreaVariation = variation;
      results.push(finding("varied-thalassic-realms", "Geologically varied maritime realms", majorComponents.length >= 4 && variation < 0.12 ? "FAILED" : variation < 0.2 ? "WEAK" : "MET", variation < 0.12 ? 0 : Math.min(100, variation / 0.2 * 100),
        `${majorComponents.length} major maritime components have area coefficient of variation ${variation.toFixed(2)}.`));
    }
  }

  return results;
}

export function evaluateNarrativeNaturalism(
  map: Civ5Map,
  program: Pick<NarrativeConstraintProgram, "profileId">,
): NarrativeNaturalismEvidence {
  const metrics: Record<string, number> = {};
  const findings = [...genericFindings(map, program.profileId, metrics), ...profileFindings(map, program.profileId, metrics)];
  const failed = findings.filter((item) => item.status === "FAILED");
  const weak = findings.filter((item) => item.status === "WEAK");
  const score = findings.reduce((sum, item) => sum + item.score, 0) / Math.max(1, findings.length);
  return {
    schemaVersion: 1,
    profileId: program.profileId,
    status: failed.length ? "FAILED" : weak.length ? "WEAKENED" : "SATISFIED",
    score: Math.round(score),
    findings,
    metrics,
    limitations: [
      "Automated morphology detects causal contradictions and exposed construction patterns; it does not measure beauty or human recognition.",
      "Artificial and fantastical geography is accepted when the final surface retains a coherent geographic cause.",
      "Civ V remains the authority for runtime behavior and play experience.",
    ],
  };
}

export function reconcileNarrativeNaturalismSurface(map: Civ5Map): Civ5Map {
  if (!map.structure?.narrativeProgram) return map;
  const tiles = map.tiles.map((tile) => ({ ...tile }));
  const profileId = map.structure.narrativeProgram.profileId;
  if (profileId === "LIVING_WORLD" || profileId === "MONSOON_CONTINENTS") return map;
  const protectedTiles = new Set(map.structure.objects.filter((object) => object.attributes?.nativeProtectedSemantic === true
    || object.attributes?.nativeNarrative === true
      && !(profileId === "GREAT_WATERSHEDS" && objectRole(object) === "BASIN")
      && (["LIVING_WORLD", "MONSOON_CONTINENTS"].includes(profileId)
        || ["WET", "DRY", "HOT", "COLD", "BARREN"].includes(String(object.attributes?.effect ?? ""))))
    .flatMap((object) => object.tileIndices));
  let terrainChanges = 0;
  let featureChanges = 0;
  const isRegionalFeature = (feature: number) => feature !== 255
    && ["FOREST", "JUNGLE", "MARSH"].some((token) => (map.features[feature] ?? "").includes(token));
  for (let pass = 0; pass < 4; pass += 1) {
    const next = tiles.map((tile) => ({ ...tile }));
    for (let index = 0; index < tiles.length; index += 1) {
      if (tiles[index].terrain < 2 || protectedTiles.has(index)) continue;
      const adjacent = neighbors(map, index).filter((neighbor) => tiles[neighbor].terrain >= 2);
      for (const neighbor of adjacent) {
        const pair = new Set([tiles[index].terrain, tiles[neighbor].terrain]);
        const harsh = pair.has(6) && (pair.has(2) || pair.has(4)) || pair.has(5) && pair.has(4);
        if (!harsh) continue;
        if (tiles[index].terrain === 4) next[index].terrain = 3;
        else if (tiles[index].terrain === 6) next[index].terrain = 5;
        else if (!protectedTiles.has(neighbor) && tiles[neighbor].terrain === 4) next[neighbor].terrain = 3;
        else if (!protectedTiles.has(neighbor) && tiles[neighbor].terrain === 6) next[neighbor].terrain = 5;
      }
      const terrainCounts = new Map<number, number>();
      for (const neighbor of adjacent) terrainCounts.set(tiles[neighbor].terrain, (terrainCounts.get(tiles[neighbor].terrain) ?? 0) + 1);
      const majority = [...terrainCounts].sort((one, two) => two[1] - one[1] || one[0] - two[0])[0];
      const own = terrainCounts.get(tiles[index].terrain) ?? 0;
      if (majority && majority[1] >= 3 && own <= 1) next[index].terrain = majority[0];
      if (isRegionalFeature(tiles[index].feature)) {
        if (!adjacent.some((neighbor) => tiles[neighbor].feature === tiles[index].feature)) next[index].feature = 255;
      } else {
        const featureCounts = new Map<number, number>();
        for (const neighbor of adjacent) if (isRegionalFeature(tiles[neighbor].feature)) featureCounts.set(tiles[neighbor].feature, (featureCounts.get(tiles[neighbor].feature) ?? 0) + 1);
        const majorityFeature = [...featureCounts].sort((one, two) => two[1] - one[1] || one[0] - two[0])[0];
        if (tiles[index].feature === 255 && majorityFeature && majorityFeature[1] >= 4 && tiles[index].elevation < 2) next[index].feature = majorityFeature[0];
      }
    }
    for (let index = 0; index < tiles.length; index += 1) {
      if (next[index].terrain !== tiles[index].terrain) terrainChanges += 1;
      if (next[index].feature !== tiles[index].feature) featureChanges += 1;
      tiles[index] = next[index];
    }
  }
  for (let pass = 0; pass < 2; pass += 1) {
    const visited = new Uint8Array(tiles.length);
    for (let origin = 0; origin < tiles.length; origin += 1) {
      if (visited[origin] || tiles[origin].terrain < 2) continue;
      const terrain = tiles[origin].terrain;
      const component = [origin];
      visited[origin] = 1;
      for (let cursor = 0; cursor < component.length; cursor += 1) for (const next of neighbors(map, component[cursor])) {
        if (visited[next] || tiles[next].terrain !== terrain) continue;
        visited[next] = 1;
        component.push(next);
      }
      if (component.length > 2 || component.some((index) => protectedTiles.has(index))) continue;
      const boundary = component.flatMap((index) => neighbors(map, index)).filter((index) => tiles[index].terrain >= 2 && tiles[index].terrain !== terrain);
      const counts = new Map<number, number>();
      for (const index of boundary) counts.set(tiles[index].terrain, (counts.get(tiles[index].terrain) ?? 0) + 1);
      const replacement = [...counts].sort((one, two) => two[1] - one[1] || one[0] - two[0])[0]?.[0];
      if (replacement === undefined) continue;
      for (const index of component) { tiles[index].terrain = replacement; terrainChanges += 1; }
    }
  }
  if (!terrainChanges && !featureChanges) return map;
  return {
    ...map,
    tiles,
    structure: {
      ...map.structure,
      diagnostics: {
        ...map.structure.diagnostics,
        naturalismSurfaceTerrainChanges: terrainChanges,
        naturalismSurfaceFeatureChanges: featureChanges,
      },
    },
  };
}
