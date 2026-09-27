import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectCiv5MapStructure,
  parseCiv5Map,
  serializeCiv5Map,
  type Civ5Map,
  type Civ5StartLocation,
} from "../lib/civ5-map.ts";
import {
  DEFAULT_GENERATION_OPTIONS,
  generateMap,
  MAP_PRESETS,
  type MapGenerationOptions,
  type MapGeometry,
  type MapPresetId,
} from "../lib/map-generator.ts";
import { buildRepairIssues } from "../lib/map-repair.ts";
import {
  proveExcogitareNativeInvariant,
  type ExcogitareNativeInvariantId,
} from "../lib/narrative-native-excogitare-proof.ts";
import { evaluateNarrativeNativeEvidence } from "../lib/narrative-native-evidence.ts";

const OWNERS = [
  ["CONTINENTS", "viable-crooked-interiors"],
  ["PANGAEA", "robust-dominant-continent"],
  ["ARCHIPELAGO", "viable-shelf-anchors"],
  ["INLAND_SEAS", "bounded-terrestrial-kingdoms"],
  ["EARTHSEA", "viable-island-homelands"],
  ["RIFT_REALMS", "technology-gated-divide"],
  ["LABYRINTH", "accessible-dual-maze"],
  ["WILD_REGIONS", "coherent-contrasting-provinces"],
] as const satisfies ReadonlyArray<readonly [MapPresetId, ExcogitareNativeInvariantId]>;

function ownerOptions(
  id: MapPresetId,
  seed = `proof-audit-${id}`,
  overrides: Partial<MapGenerationOptions> = {},
): MapGenerationOptions {
  const preset = MAP_PRESETS.find((candidate) => candidate.id === id);
  assert.ok(preset, `Unknown Map Type ${id}`);
  const { id: _id, label: _label, description: _description, water, mountains, engine, ...presetOptions } = preset;
  void _id; void _label; void _description;
  return {
    ...DEFAULT_GENERATION_OPTIONS,
    ...presetOptions,
    engine,
    preset: id,
    size: "DUEL",
    players: 2,
    cityStates: 1,
    waterPercent: water,
    mountainPercent: mountains,
    seed,
    ...overrides,
  };
}

function adapter(map: Civ5Map) {
  assert.ok(map.structure?.narrativeAdapter, `${map.generation?.preset} did not retain adapter evidence`);
  return map.structure.narrativeAdapter;
}

function nativeObject(map: Civ5Map, role: string, occurrence = 0) {
  const objects = map.structure?.objects.filter((object) => object.attributes?.nativeNarrative === true && object.attributes.role === role) ?? [];
  assert.ok(objects[occurrence], `${map.generation?.preset} did not retain ${role} #${occurrence + 1}`);
  return objects[occurrence];
}

function neighbors(index: number, map: Pick<Civ5Map, "width" | "height" | "wraps">) {
  const x = index % map.width;
  const y = Math.floor(index / map.width);
  const offsets = y % 2 === 0
    ? [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]]
    : [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
  return offsets.flatMap(([dx, dy]) => {
    let nextX = x + dx;
    const nextY = y + dy;
    if (map.wraps) nextX = (nextX + map.width) % map.width;
    return nextX >= 0 && nextX < map.width && nextY >= 0 && nextY < map.height ? [nextY * map.width + nextX] : [];
  });
}

function startDistance(one: Civ5StartLocation, two: Civ5StartLocation, map: Pick<Civ5Map, "width" | "wraps">) {
  const cubeDistance = (oneX: number, twoX: number) => {
    const oneQ = oneX - (one.y - (one.y & 1)) / 2;
    const twoQ = twoX - (two.y - (two.y & 1)) / 2;
    const dq = twoQ - oneQ;
    const dr = two.y - one.y;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
  };
  if (!map.wraps) return cubeDistance(one.x, two.x);
  return Math.min(cubeDistance(one.x, two.x), cubeDistance(one.x - map.width, two.x), cubeDistance(one.x + map.width, two.x));
}

function connectedSize(map: Civ5Map, indices: readonly number[]) {
  const members = new Set(indices);
  const origin = members.values().next().value as number | undefined;
  if (origin === undefined) return 0;
  const reached = new Set([origin]);
  const queue = [origin];
  for (let cursor = 0; cursor < queue.length; cursor += 1) for (const next of neighbors(queue[cursor], map)) {
    if (!members.has(next) || reached.has(next)) continue;
    reached.add(next);
    queue.push(next);
  }
  return reached.size;
}

function appendSideBranch(
  map: Civ5Map,
  path: ReturnType<typeof nativeObject>,
  prepare: (index: number) => void,
) {
  const members = new Set(path.tileIndices);
  for (const anchor of path.tileIndices) {
    if (neighbors(anchor, map).filter((next) => members.has(next)).length !== 2) continue;
    const branch = neighbors(anchor, map)
      .filter((candidate) => !members.has(candidate))
      .sort((one, two) => neighbors(one, map).filter((next) => members.has(next)).length
        - neighbors(two, map).filter((next) => members.has(next)).length || one - two)[0];
    if (branch === undefined) continue;
    prepare(branch);
    path.tileIndices.push(branch);
    return branch;
  }
  assert.fail(`${path.id} has no tile on which to attach a one-edge side branch`);
}

function assertNativeEvaluationFailed(map: Civ5Map, invariantId: ExcogitareNativeInvariantId) {
  const program = map.structure?.narrativeProgram;
  assert.ok(program, `${map.generation?.preset} did not retain its narrative program`);
  const evidence = evaluateNarrativeNativeEvidence(map, program, adapter(map));
  const finding = evidence.findings.find((candidate) => candidate.invariantId === invariantId);
  assert.ok(finding, `${map.generation?.preset} did not evaluate ${invariantId}`);
  assert.equal(finding.status, "FAILED", `${map.generation?.preset} trusted stale or aggregate evidence for ${invariantId}`);
}

function makeCachedEvidenceMaximallyFavorable(map: Civ5Map) {
  assert.ok(map.structure);
  for (const key of Object.keys(map.structure.diagnostics)) map.structure.diagnostics[key] = 1_000_000;
  for (const object of map.structure.objects) if (object.attributes) {
    object.attributes.outputEffectMatched = true;
    object.attributes.deepWaterShare = 1;
    object.attributes.passableShare = 1;
    object.attributes.connectedShare = 1;
  }
  for (const metric of Object.values(map.structure.narrativeSemanticModel?.metrics ?? {})) if (metric) {
    metric.value = 1_000_000;
    metric.confidence = 1;
  }
  if (map.structure.narrativeNativeEvidence) {
    map.structure.narrativeNativeEvidence.status = "PROVEN";
    map.structure.narrativeNativeEvidence.score = 100;
    for (const finding of map.structure.narrativeNativeEvidence.findings) {
      finding.status = "PROVEN";
      finding.score = 100;
      finding.evidence = ["Deliberately stale favorable evidence."];
    }
  }
}

function collapseOrRedirectNativeProof(id: MapPresetId, map: Civ5Map) {
  if (id === "CONTINENTS") {
    const corridor = nativeObject(map, "CROOKED_INTERIOR");
    corridor.tileIndices = [corridor.tileIndices[0]];
  } else if (id === "PANGAEA") {
    const continent = nativeObject(map, "DOMINANT_CONTINENT");
    continent.tileIndices = [continent.tileIndices[0]];
  } else if (id === "ARCHIPELAGO") {
    const fragment = nativeObject(map, "SHELF_FRAGMENT");
    const otherRoot = nativeObject(map, "DROWNED_SHELF", 1);
    fragment.attributes = { ...fragment.attributes, parent: otherRoot.id.replace(/^narrative-/, "") };
  } else if (id === "INLAND_SEAS") {
    const sea = nativeObject(map, "INLAND_SEA");
    map.tiles[0] = { ...map.tiles[0], terrain: 0, elevation: 0 };
    sea.tileIndices = [0];
  } else if (id === "EARTHSEA") {
    const realm = nativeObject(map, "ISLAND_CONTINENT");
    const passable = realm.tileIndices.filter((index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation < 2);
    assert.ok(passable.length >= 2, "EARTHSEA fixture has no duplicate-start impostor target");
    const majors = map.startLocations.filter((start) => !start.cityState && start.playable !== false);
    assert.ok(majors.length >= 2);
    for (let index = 0; index < 2; index += 1) {
      majors[index].x = passable[index] % map.width;
      majors[index].y = Math.floor(passable[index] / map.width);
    }
  } else if (id === "RIFT_REALMS") {
    const rift = nativeObject(map, "PRIMARY_RIFT");
    rift.attributes = { ...rift.attributes, to: rift.attributes?.from ?? "" };
  } else if (id === "LABYRINTH") {
    const chamber = nativeObject(map, "MAZE_CHAMBER");
    const origin = chamber.tileIndices[0];
    const adjacent = new Set([origin, ...neighbors(origin, map)]);
    const remote = map.tiles.findIndex((tile, index) => tile.terrain >= 2 && tile.elevation < 2 && !adjacent.has(index));
    assert.ok(remote >= 0, "LABYRINTH fixture has no disconnected chamber impostor tile");
    chamber.tileIndices = [origin, remote];
  } else {
    const first = nativeObject(map, "PATCHWORK_PROVINCE");
    const second = nativeObject(map, "PATCHWORK_PROVINCE", 1);
    second.tileIndices = [...first.tileIndices];
  }
}

test("all eight Excogitare owners prove final spatial invariants deterministically and export legal geography-only Civ5Maps", () => {
  for (const [id, invariantId] of OWNERS) {
    const options = ownerOptions(id);
    const first = generateMap(options);
    const second = generateMap(options);
    const firstFacts = proveExcogitareNativeInvariant(invariantId, first, adapter(first));
    const secondFacts = proveExcogitareNativeInvariant(invariantId, second, adapter(second));
    assert.equal(firstFacts.ok, true, `${id} did not prove ${invariantId}: ${firstFacts.evidence.join(" ")}`);
    assert.deepEqual(firstFacts, secondFacts, `${id} proof facts are not deterministic`);
    assert.deepEqual(first.tiles, second.tiles, `${id} final tiles are not deterministic`);
    assert.deepEqual(first.startLocations, second.startLocations, `${id} starts are not deterministic`);
    assert.deepEqual(first.structure?.narrativeNativePlan, second.structure?.narrativeNativePlan, `${id} native plan is not deterministic`);
    assert.deepEqual(first.structure?.narrativeAdapter, second.structure?.narrativeAdapter, `${id} adapter evidence is not deterministic`);
    assert.deepEqual(
      first.structure?.objects.filter((object) => object.attributes?.nativeNarrative === true),
      second.structure?.objects.filter((object) => object.attributes?.nativeNarrative === true),
      `${id} final native bindings are not deterministic`,
    );
    assert.equal(
      first.tiles.filter((tile) => tile.terrain < 2).length,
      Math.round(first.tiles.length * first.generation!.waterPercent / 100),
      `${id} lost the exact water budget`,
    );
    assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.id !== "clean"), [], `${id} requires Repair after generation`);

    const firstBinary = serializeCiv5Map(first);
    const secondBinary = serializeCiv5Map(second);
    assert.deepEqual(new Uint8Array(firstBinary), new Uint8Array(secondBinary), `${id} geography export is not deterministic`);
    assert.equal(new Uint8Array(firstBinary)[0], 0x0c, `${id} ordinary Civ5Map export claims scenario data`);
    assert.deepEqual(inspectCiv5MapStructure(firstBinary).filter((issue) => issue.severity === "ERROR"), [], `${id} exports an invalid Civ5Map`);
    const parsed = parseCiv5Map(firstBinary, `${id}.Civ5Map`);
    assert.equal(parsed.scenarioDataPresent, false, `${id} ordinary Civ5Map retained scenario data`);
    assert.deepEqual(parsed.startLocations, [], `${id} ordinary Civ5Map serialized editor-only starts`);
    assert.equal(parsed.width, first.width);
    assert.equal(parsed.height, first.height);
  }
});

test("all eight proofs reject collapsed or redirected native impostors despite favorable cached evidence", () => {
  for (const [id, invariantId] of OWNERS) {
    const map = structuredClone(generateMap(ownerOptions(id)));
    makeCachedEvidenceMaximallyFavorable(map);
    collapseOrRedirectNativeProof(id, map);
    const facts = proveExcogitareNativeInvariant(invariantId, map, adapter(map));
    assert.equal(facts.ok, false, `${id} accepted a collapsed or redirected ${invariantId} impostor`);
    assertNativeEvaluationFailed(map, invariantId);
  }
});

test("Lake Kingdoms rejects collapsed land fields and overlapping circuit-spine impostors", () => {
  const source = generateMap(ownerOptions("INLAND_SEAS", "native-contract-inland_seas"));

  const collapsed = structuredClone(source);
  makeCachedEvidenceMaximallyFavorable(collapsed);
  const collapsedFields = collapsed.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true && object.attributes.role === "ENCLOSING_LAND");
  assert.ok(collapsedFields.length >= 3);
  const singleField = [...collapsedFields[0].tileIndices];
  for (const field of collapsedFields) field.tileIndices = [...singleField];
  assert.equal(proveExcogitareNativeInvariant("bounded-terrestrial-kingdoms", collapsed, adapter(collapsed)).ok, false, "collapsed copies of one land field passed as distinct terrestrial kingdoms");
  assertNativeEvaluationFailed(collapsed, "bounded-terrestrial-kingdoms");

  const overlapping = structuredClone(source);
  makeCachedEvidenceMaximallyFavorable(overlapping);
  const circuitPaths = overlapping.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true && object.attributes.role === "OUTER_CIRCUIT");
  assert.ok(circuitPaths.length >= 2);
  circuitPaths[1].tileIndices = [...circuitPaths[0].tileIndices];
  assert.equal(proveExcogitareNativeInvariant("bounded-terrestrial-kingdoms", overlapping, adapter(overlapping)).ok, false, "a duplicated circuit spine passed as a spatially distinct circuit edge");
  assertNativeEvaluationFailed(overlapping, "bounded-terrestrial-kingdoms");
});

test("every retained fjord, continent bond, and primary rift must remain an endpoint-terminating spine", () => {
  const continentsSource = generateMap(ownerOptions("CONTINENTS"));
  const continents = structuredClone(continentsSource);
  makeCachedEvidenceMaximallyFavorable(continents);
  const fjords = continents.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
    && object.attributes.role === "FJORD_INTRUSION");
  assert.ok(fjords.length >= 3, "fixture does not expose a third retained fjord");
  appendSideBranch(continents, fjords[2], (index) => {
    continents.tiles[index] = { ...continents.tiles[index], terrain: 1, elevation: 0 };
  });
  assert.equal(
    proveExcogitareNativeInvariant("viable-crooked-interiors", continents, adapter(continents)).ok,
    false,
    "a third branched fjord passed because another retained fjord was lawful",
  );
  assertNativeEvaluationFailed(continents, "viable-crooked-interiors");

  const branchedInterior = structuredClone(continentsSource);
  makeCachedEvidenceMaximallyFavorable(branchedInterior);
  appendSideBranch(branchedInterior, nativeObject(branchedInterior, "CROOKED_INTERIOR"), (index) => {
    branchedInterior.tiles[index] = { ...branchedInterior.tiles[index], terrain: 3, elevation: 0 };
  });
  assert.equal(
    proveExcogitareNativeInvariant("viable-crooked-interiors", branchedInterior, adapter(branchedInterior)).ok,
    false,
    "a branched land blob passed as a crooked interior corridor",
  );
  assertNativeEvaluationFailed(branchedInterior, "viable-crooked-interiors");

  const duplicatedInterior = structuredClone(continentsSource);
  makeCachedEvidenceMaximallyFavorable(duplicatedInterior);
  const interiors = duplicatedInterior.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
    && object.attributes.role === "CROOKED_INTERIOR");
  assert.ok(interiors.length >= 2);
  interiors[1].tileIndices = [...interiors[0].tileIndices];
  interiors[1].attributes = {
    ...interiors[1].attributes,
    from: interiors[0].attributes?.from ?? "",
    to: interiors[0].attributes?.to ?? "",
  };
  assert.equal(
    proveExcogitareNativeInvariant("viable-crooked-interiors", duplicatedInterior, adapter(duplicatedInterior)).ok,
    false,
    "two authored core-to-lobe relationships reused one interior corridor",
  );
  assertNativeEvaluationFailed(duplicatedInterior, "viable-crooked-interiors");

  const pangaeaSource = generateMap(ownerOptions("PANGAEA"));
  const pangaea = structuredClone(pangaeaSource);
  makeCachedEvidenceMaximallyFavorable(pangaea);
  appendSideBranch(pangaea, nativeObject(pangaea, "CONTINENT_BOND"), (index) => {
    pangaea.tiles[index] = { ...pangaea.tiles[index], terrain: 3, elevation: 0 };
  });
  assert.equal(
    proveExcogitareNativeInvariant("robust-dominant-continent", pangaea, adapter(pangaea)).ok,
    false,
    "a side-touching land blob passed as an endpoint-terminating continent bond",
  );
  assertNativeEvaluationFailed(pangaea, "robust-dominant-continent");

  const duplicatedLobe = structuredClone(pangaeaSource);
  makeCachedEvidenceMaximallyFavorable(duplicatedLobe);
  const lobes = duplicatedLobe.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
    && object.attributes.role === "CONTINENT_LOBE");
  assert.ok(lobes.length >= 2);
  lobes[1].tileIndices = [...lobes[0].tileIndices];
  assert.equal(
    proveExcogitareNativeInvariant("robust-dominant-continent", duplicatedLobe, adapter(duplicatedLobe)).ok,
    false,
    "two child-lobe identities occupying the same geography passed as a robust dominant continent",
  );
  assertNativeEvaluationFailed(duplicatedLobe, "robust-dominant-continent");

  const duplicatedBond = structuredClone(pangaeaSource);
  makeCachedEvidenceMaximallyFavorable(duplicatedBond);
  const bonds = duplicatedBond.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
    && object.attributes.role === "CONTINENT_BOND");
  assert.ok(bonds.length >= 2);
  bonds[1].tileIndices = [...bonds[0].tileIndices];
  bonds[1].attributes = {
    ...bonds[1].attributes,
    from: bonds[0].attributes?.from ?? "",
    to: bonds[0].attributes?.to ?? "",
  };
  assert.equal(
    proveExcogitareNativeInvariant("robust-dominant-continent", duplicatedBond, adapter(duplicatedBond)).ok,
    false,
    "two authored lobe relationships reused one physical land bond",
  );
  assertNativeEvaluationFailed(duplicatedBond, "robust-dominant-continent");

  const rifts = structuredClone(generateMap(ownerOptions("RIFT_REALMS")));
  makeCachedEvidenceMaximallyFavorable(rifts);
  appendSideBranch(rifts, nativeObject(rifts, "PRIMARY_RIFT"), (index) => {
    rifts.tiles[index] = { ...rifts.tiles[index], terrain: 0, elevation: 0 };
  });
  assert.equal(
    proveExcogitareNativeInvariant("technology-gated-divide", rifts, adapter(rifts)).ok,
    false,
    "a branched deep-water blob passed as an endpoint-terminating primary rift",
  );
  assertNativeEvaluationFailed(rifts, "technology-gated-divide");
});

test("Drowned Shelves rejects duplicated sibling fragments and arcs while Island Continents rejects duplicated realms", () => {
  for (const [id, invariantId] of [["ARCHIPELAGO", "viable-shelf-anchors"]] as const) {
    const duplicatedFragment = structuredClone(generateMap(ownerOptions(id)));
    makeCachedEvidenceMaximallyFavorable(duplicatedFragment);
    const fragmentParent = duplicatedFragment.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
      && object.attributes.role === (id === "ARCHIPELAGO" ? "DROWNED_SHELF" : "ISLAND_CONTINENT"))
      .map((object) => object.id.replace(/^narrative-/, ""))
      .find((parent) => duplicatedFragment.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
        && object.attributes.role === "SHELF_FRAGMENT" && object.attributes.parent === parent).length >= 2);
    assert.ok(fragmentParent, `${id} fixture has no parent with a sibling fragment pair`);
    const fragments = duplicatedFragment.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
      && object.attributes.role === "SHELF_FRAGMENT"
      && object.attributes.parent === fragmentParent);
    assert.ok(fragments.length >= 2, `${id} fixture has no sibling fragment pair`);
    fragments[1].tileIndices = [...fragments[0].tileIndices];
    assert.equal(
      proveExcogitareNativeInvariant(invariantId, duplicatedFragment, adapter(duplicatedFragment)).ok,
      false,
      `${id} accepted two sibling identities occupying one fragment`,
    );
    assertNativeEvaluationFailed(duplicatedFragment, invariantId);

    const duplicatedArc = structuredClone(generateMap(ownerOptions(id)));
    makeCachedEvidenceMaximallyFavorable(duplicatedArc);
    const rootRole = id === "ARCHIPELAGO" ? "DROWNED_SHELF" : "ISLAND_CONTINENT";
    const root = duplicatedArc.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true && object.attributes.role === rootRole)
      .find((candidate) => duplicatedArc.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
        && object.attributes.role === "DROWNED_SHELF_ARC" && object.attributes.from === candidate.id.replace(/^narrative-/, "")).length >= 2);
    assert.ok(root, `${id} fixture has no parent with a sibling arc pair`);
    const arcs = duplicatedArc.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
      && object.attributes.role === "DROWNED_SHELF_ARC"
      && object.attributes.from === root!.id.replace(/^narrative-/, ""));
    assert.ok(arcs.length >= 2, `${id} fixture has no sibling arc pair`);
    arcs[1].tileIndices = [...arcs[0].tileIndices];
    assert.equal(
      proveExcogitareNativeInvariant(invariantId, duplicatedArc, adapter(duplicatedArc)).ok,
      false,
      `${id} accepted two sibling relationships bound to one shelf arc`,
    );
    assertNativeEvaluationFailed(duplicatedArc, invariantId);
  }
  const duplicatedRealm = structuredClone(generateMap(ownerOptions("EARTHSEA")));
  makeCachedEvidenceMaximallyFavorable(duplicatedRealm);
  const realms = duplicatedRealm.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
    && object.attributes.role === "ISLAND_CONTINENT");
  assert.ok(realms.length >= 2);
  realms[1].tileIndices = [...realms[0].tileIndices];
  assert.equal(proveExcogitareNativeInvariant("viable-island-homelands", duplicatedRealm, adapter(duplicatedRealm)).ok, false);
  assertNativeEvaluationFailed(duplicatedRealm, "viable-island-homelands");
});

test("Labyrinth binds the actual connected chamber component and rejects a genuinely disconnected chamber", () => {
  const map = generateMap(ownerOptions("LABYRINTH"));
  const chambers = map.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true && object.attributes.role === "MAZE_CHAMBER");
  const trimmed = chambers.filter((chamber) => Number(chamber.attributes?.discardedDisconnectedTiles ?? 0) > 0);
  assert.ok(trimmed.length > 0, "fixture did not exercise disconnected field-fragment trimming");
  for (const chamber of chambers) {
    assert.equal(connectedSize(map, chamber.tileIndices), chamber.tileIndices.length, `${chamber.id} retained a disconnected incidental fragment`);
    assert.equal(
      chamber.tileIndices.length + Number(chamber.attributes?.discardedDisconnectedTiles ?? 0),
      Number(chamber.attributes?.plannedMatchedTiles ?? chamber.tileIndices.length),
      `${chamber.id} did not disclose its full planned field extent`,
    );
  }

  const impostor = structuredClone(map);
  collapseOrRedirectNativeProof("LABYRINTH", impostor);
  assert.equal(proveExcogitareNativeInvariant("accessible-dual-maze", impostor, adapter(impostor)).ok, false);
});

test("Labyrinth rejects duplicated land passages and water alleys even when every cached aggregate is favorable", () => {
  const source = generateMap(ownerOptions("LABYRINTH"));
  const branchedPassage = structuredClone(source);
  makeCachedEvidenceMaximallyFavorable(branchedPassage);
  appendSideBranch(branchedPassage, nativeObject(branchedPassage, "WINDING_PASSAGE"), (index) => {
    branchedPassage.tiles[index] = { ...branchedPassage.tiles[index], terrain: 3, elevation: 0 };
  });
  assert.equal(
    proveExcogitareNativeInvariant("accessible-dual-maze", branchedPassage, adapter(branchedPassage)).ok,
    false,
    "a branched land blob passed as one winding passage",
  );
  assertNativeEvaluationFailed(branchedPassage, "accessible-dual-maze");

  const duplicatedPassage = structuredClone(source);
  makeCachedEvidenceMaximallyFavorable(duplicatedPassage);
  const passages = duplicatedPassage.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
    && object.attributes.role === "WINDING_PASSAGE");
  assert.ok(passages.length >= 2);
  passages[1].tileIndices = [...passages[0].tileIndices];
  passages[1].attributes = {
    ...passages[1].attributes,
    from: passages[0].attributes?.from ?? "",
    to: passages[0].attributes?.to ?? "",
  };
  assert.equal(
    proveExcogitareNativeInvariant("accessible-dual-maze", duplicatedPassage, adapter(duplicatedPassage)).ok,
    false,
    "two authored land passages reused one physical corridor",
  );
  assertNativeEvaluationFailed(duplicatedPassage, "accessible-dual-maze");

  const map = structuredClone(source);
  makeCachedEvidenceMaximallyFavorable(map);
  const alleys = map.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
    && object.attributes.role === "BLIND_WATER_ALLEY");
  assert.ok(alleys.length >= 2);
  alleys[1].tileIndices = [...alleys[0].tileIndices];
  alleys[1].attributes = {
    ...alleys[1].attributes,
    from: alleys[0].attributes?.from ?? "",
    to: alleys[0].attributes?.to ?? "",
  };
  assert.equal(
    proveExcogitareNativeInvariant("accessible-dual-maze", map, adapter(map)).ok,
    false,
    "two authored alleys reused one physical mouth-to-dead-end branch",
  );
  assertNativeEvaluationFailed(map, "accessible-dual-maze");
});

test("Patchwork Provinces rejects duplicated causal boundaries and remote-touch impostors", () => {
  const source = generateMap(ownerOptions("WILD_REGIONS"));
  const boundaries = source.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
    && object.attributes.role === "COMPOSED_BOUNDARY");
  assert.ok(boundaries.length >= 3);

  const duplicated = structuredClone(source);
  makeCachedEvidenceMaximallyFavorable(duplicated);
  const duplicatedBoundaries = duplicated.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
    && object.attributes.role === "COMPOSED_BOUNDARY");
  duplicatedBoundaries[1].tileIndices = [...duplicatedBoundaries[0].tileIndices];
  duplicatedBoundaries[1].attributes = {
    ...duplicatedBoundaries[1].attributes,
    from: duplicatedBoundaries[0].attributes?.from ?? "",
    to: duplicatedBoundaries[0].attributes?.to ?? "",
  };
  assert.equal(
    proveExcogitareNativeInvariant("coherent-contrasting-provinces", duplicated, adapter(duplicated)).ok,
    false,
    "two authored relationships reused one causal shared boundary",
  );
  assertNativeEvaluationFailed(duplicated, "coherent-contrasting-provinces");

  const remoteTouch = structuredClone(source);
  makeCachedEvidenceMaximallyFavorable(remoteTouch);
  const remoteBoundary = nativeObject(remoteTouch, "COMPOSED_BOUNDARY");
  const from = remoteTouch.structure!.objects.find((object) => object.id === `narrative-${String(remoteBoundary.attributes?.from ?? "")}`);
  const to = remoteTouch.structure!.objects.find((object) => object.id === `narrative-${String(remoteBoundary.attributes?.to ?? "")}`);
  assert.ok(from && to);
  const toMembers = new Set(to.tileIndices);
  const actualShared = new Set(from.tileIndices.flatMap((index) => neighbors(index, remoteTouch).some((next) => toMembers.has(next)) ? [index] : []));
  for (const index of to.tileIndices) if (neighbors(index, remoteTouch).some((next) => from.tileIndices.includes(next))) actualShared.add(index);
  const remote = remoteTouch.tiles.findIndex((_tile, index) => !actualShared.has(index)
    && !remoteBoundary.tileIndices.includes(index)
    && neighbors(index, remoteTouch).every((next) => !remoteBoundary.tileIndices.includes(next)));
  assert.ok(remote >= 0, "fixture has no remote non-boundary tile");
  remoteBoundary.tileIndices.push(remote);
  assert.equal(
    proveExcogitareNativeInvariant("coherent-contrasting-provinces", remoteTouch, adapter(remoteTouch)).ok,
    false,
    "a remote tile masqueraded as part of an exact shared provincial edge",
  );
  assertNativeEvaluationFailed(remoteTouch, "coherent-contrasting-provinces");
});

test("zero-water, low-water, tall, and wide worlds retain physically applicable Excogitare proofs", () => {
  const cases: ReadonlyArray<readonly [MapPresetId, ExcogitareNativeInvariantId, number, MapGeometry]> = [
    ["PANGAEA", "robust-dominant-continent", 0, "STANDARD"],
    ["WILD_REGIONS", "coherent-contrasting-provinces", 0, "TALL"],
    ["INLAND_SEAS", "bounded-terrestrial-kingdoms", 10, "STANDARD"],
    ["ARCHIPELAGO", "viable-shelf-anchors", 35, "TALL"],
    ["EARTHSEA", "viable-island-homelands", 45, "WIDE"],
  ];
  for (const [id, invariantId, waterPercent, geometry] of cases) {
    const seed = id === "WILD_REGIONS" ? "edge-wild-a" : `edge-${id}-${waterPercent}-${geometry}`;
    const map = generateMap(ownerOptions(id, seed, { waterPercent, geometry }));
    const facts = proveExcogitareNativeInvariant(invariantId, map, adapter(map));
    assert.equal(facts.ok, true, `${id} ${waterPercent}% ${geometry} did not retain ${invariantId}: ${facts.evidence.join(" ")}`);
    assert.equal(map.tiles.filter((tile) => tile.terrain < 2).length, Math.round(map.tiles.length * waterPercent / 100));
    assert.deepEqual(buildRepairIssues(map).filter((issue) => issue.id !== "clean"), [], `${id} edge case requires Repair`);
  }
});

test("public candidate negotiation retains high-water seas, the native-contract maze, and post-repaint provinces", () => {
  const inland = generateMap({
    ...DEFAULT_GENERATION_OPTIONS,
    preset: "INLAND_SEAS",
    size: "DUEL",
    wrapType: "EAST_WEST",
  });
  const inlandFacts = proveExcogitareNativeInvariant("bounded-terrestrial-kingdoms", inland, adapter(inland));
  assert.equal(inlandFacts.ok, true, `55% east-west Inland Seas lost its spatial circuit: ${inlandFacts.evidence.join(" ")}`);
  const circuits = inland.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true
    && object.attributes.role === "OUTER_CIRCUIT");
  assert.ok(circuits.length >= 3);
  const usedCircuitTermini = new Set<number>();
  for (const circuit of circuits) {
    assert.equal(circuit.tileIndices.length, 2, `${circuit.id} is not bound to a narrow shared-border edge`);
    for (const index of circuit.tileIndices) {
      assert.equal(usedCircuitTermini.has(index), false, `${circuit.id} reused another circuit terminal`);
      usedCircuitTermini.add(index);
    }
  }
  assert.deepEqual(buildRepairIssues(inland).filter((issue) => issue.id !== "clean"), []);

  const labyrinth = generateMap(ownerOptions("LABYRINTH", "native-contract-labyrinth"));
  const labyrinthFacts = proveExcogitareNativeInvariant("accessible-dual-maze", labyrinth, adapter(labyrinth));
  assert.equal(labyrinthFacts.ok, true, `public candidate negotiation lost the dual maze: ${labyrinthFacts.evidence.join(" ")}`);
  assert.deepEqual(
    labyrinth.structure?.narrativeNativePlan?.appliedRelaxations.map((step) => step.id),
    ["relax-irregular-chambers", "relax-tortuous-routes"],
    "public generation did not install the authored relaxation prefix used by its lawful candidate",
  );
  assert.deepEqual(buildRepairIssues(labyrinth).filter((issue) => issue.id !== "clean"), []);

  const wild = generateMap(ownerOptions("WILD_REGIONS", "native-wild_regions"));
  const wildFacts = proveExcogitareNativeInvariant("coherent-contrasting-provinces", wild, adapter(wild));
  assert.equal(wildFacts.ok, true, `final Wild Regions repaint lost its provincial proof: ${wildFacts.evidence.join(" ")}`);
  assert.deepEqual(buildRepairIssues(wild).filter((issue) => issue.id !== "clean"), [], "final province effects left stale river edges");
});

test("literal broad-sweep regressions retain strict proof, exact budgets, population, and deterministic legality", () => {
  const cases: ReadonlyArray<readonly [MapPresetId, ExcogitareNativeInvariantId, string, "DUEL" | "TINY"]> = [
    ["ARCHIPELAGO", "viable-shelf-anchors", "broad-archipelago-3", "DUEL"],
    ["LABYRINTH", "accessible-dual-maze", "broad-labyrinth-5", "DUEL"],
    ["LABYRINTH", "accessible-dual-maze", "broad-labyrinth-9", "TINY"],
    ["WILD_REGIONS", "coherent-contrasting-provinces", "broad-wild_regions-1", "DUEL"],
    ["WILD_REGIONS", "coherent-contrasting-provinces", "broad-wild_regions-2", "DUEL"],
    ["WILD_REGIONS", "coherent-contrasting-provinces", "broad-wild_regions-4", "DUEL"],
  ];
  for (const [id, invariantId, seed, size] of cases) {
    const options = ownerOptions(id, seed, { size });
    const first = generateMap(options);
    const second = generateMap(options);
    const facts = proveExcogitareNativeInvariant(invariantId, first, adapter(first));
    assert.equal(facts.ok, true, `${seed} did not retain ${invariantId}: ${facts.evidence.join(" ")}`);
    assert.equal(
      first.tiles.filter((tile) => tile.terrain < 2).length,
      Math.round(first.tiles.length * first.generation!.waterPercent / 100),
      `${seed} lost its exact water budget`,
    );
    assert.equal(first.startLocations.filter((start) => !start.cityState && start.playable !== false).length, 2, `${seed} lost a major start`);
    assert.equal(first.startLocations.filter((start) => start.cityState).length, 1, `${seed} lost its city-state start`);
    assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.id !== "clean"), [], `${seed} requires Repair`);
    assert.deepEqual(first.tiles, second.tiles, `${seed} final tiles are not deterministic`);
    assert.deepEqual(
      first.structure?.objects.filter((object) => object.attributes?.nativeNarrative === true),
      second.structure?.objects.filter((object) => object.attributes?.nativeNarrative === true),
      `${seed} final native bindings are not deterministic`,
    );
  }
});

test("literal Huge Labyrinth regressions bind all twelve accessible majors to the retained nine-chamber maze", () => {
  const seeds = ["perf-huge-labyrinth", "perf-huge-labyrinth-2", "native-contract-labyrinth"];
  for (const seed of seeds) {
    const options = ownerOptions("LABYRINTH", seed, {
      size: "HUGE",
      geometry: "STANDARD",
      players: 12,
      cityStates: 12,
      waterPercent: 43,
      mountainPercent: 18,
    });
    const first = generateMap(options);
    const second = generateMap(options);
    const facts = proveExcogitareNativeInvariant("accessible-dual-maze", first, adapter(first));
    assert.equal(facts.ok, true, `${seed} did not retain the accessible dual maze: ${facts.evidence.join(" ")}`);
    assert.equal(facts.measurements.viableChambers, 9, `${seed} did not retain nine viable chambers`);
    assert.equal(facts.measurements.validPassages, 8, `${seed} did not retain eight winding passages`);
    assert.equal(facts.measurements.validWaterAlleys, 4, `${seed} did not retain four blind water alleys`);
    assert.equal(facts.measurements.accessibleMajorStarts, true, `${seed} left a major outside the chamber-connected passable realm`);

    const majors = first.startLocations.filter((start) => !start.cityState && start.playable !== false);
    const cityStates = first.startLocations.filter((start) => start.cityState);
    assert.equal(majors.length, 12, `${seed} reduced the requested major population`);
    assert.equal(cityStates.length, 12, `${seed} changed the requested city-state population`);
    const chambers = first.structure!.objects.filter((object) => object.attributes?.nativeNarrative === true && object.attributes.role === "MAZE_CHAMBER");
    for (const start of majors) {
      const index = start.y * first.width + start.x;
      assert.ok(chambers.some((chamber) => chamber.tileIndices.includes(index)
        || neighbors(index, first).some((neighbor) => chamber.tileIndices.includes(neighbor))), `${seed} left player ${start.player} farther than one tile from every retained chamber`);
    }
    for (let one = 0; one < first.startLocations.length; one += 1) for (let two = one + 1; two < first.startLocations.length; two += 1) {
      assert.ok(startDistance(first.startLocations[one], first.startLocations[two], first) >= 5, `${seed} placed starts ${one} and ${two} fewer than five tiles apart`);
    }
    assert.equal(first.tiles.filter((tile) => tile.terrain < 2).length, Math.round(first.tiles.length * 0.43), `${seed} lost the exact water budget`);
    assert.deepEqual(buildRepairIssues(first).filter((issue) => issue.id !== "clean"), [], `${seed} requires Repair`);
    assert.deepEqual(first.tiles, second.tiles, `${seed} final tiles are not deterministic`);
    assert.deepEqual(first.startLocations, second.startLocations, `${seed} final starts are not deterministic`);
    assert.deepEqual(
      first.structure?.objects.filter((object) => object.attributes?.nativeNarrative === true),
      second.structure?.objects.filter((object) => object.attributes?.nativeNarrative === true),
      `${seed} final native bindings are not deterministic`,
    );
    const binary = serializeCiv5Map(first);
    assert.deepEqual(inspectCiv5MapStructure(binary).filter((issue) => issue.severity === "ERROR"), [], `${seed} exports an invalid Civ5Map`);
    const parsed = parseCiv5Map(binary, `${seed}.Civ5Map`);
    assert.equal(parsed.scenarioDataPresent, false, `${seed} geography export claims scenario data`);
    assert.deepEqual(parsed.startLocations, [], `${seed} geography export serialized editor-only starts`);
  }
});
