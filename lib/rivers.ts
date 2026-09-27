import type { Civ5Map } from "./civ5-map.ts";

export type RiverEdgeBit = 1 | 2 | 4;

export const RIVER_EDGE_MASK = 0x07;
export const RIVER_FLOW_MASK = 0x38;
export const RIVER_DATA_MASK = RIVER_EDGE_MASK | RIVER_FLOW_MASK;

export type RiverEdgeDefinition = {
  bit: RiverEdgeBit;
  flowBit: 8 | 16 | 32;
  dx: number;
  dy: number;
  a: string;
  b: string;
};

export type Civ5RiverEdge = {
  owner: number;
  neighbor: number;
  bit: RiverEdgeBit;
  a: string;
  b: string;
  from: string;
  to: string;
};

/**
 * A river system reconstructed from Civ V's edge-owned river bits. Plot
 * adjacency is deliberately not used to connect systems: two river-owning
 * plots can touch while the encoded river edges terminate at different hex
 * vertices.
 */
export type Civ5RiverEdgeSystem = {
  edges: Civ5RiverEdge[];
  tileIndices: number[];
  ownerIndices: number[];
  vertices: string[];
  edgeCount: number;
  acyclic: boolean;
  sourceVertices: string[];
  outletVertices: string[];
  junctionVertices: string[];
  deadEndVertices: string[];
  waterInteriorVertices: string[];
  sourceTileIndices: number[];
  outletTileIndices: number[];
  directedToOutlet: boolean;
};

/**
 * Civ5 stores only the three edges for which a plot is west, northwest, or
 * northeast of the river. In map coordinates those are the E, SE, and SW
 * sides of the owning hex. Map rows are stored south-to-north, so the two
 * southern neighbours have y - 1 in the serialized tile array.
 */
export function riverEdgeDefinitions(x: number, y: number): RiverEdgeDefinition[] {
  const centerX = x * 2 + (y & 1);
  const centerY = y * 3;
  return [
    {
      bit: 1,
      flowBit: 8,
      dx: 1,
      dy: 0,
      a: `${centerX + 1},${centerY - 1}`,
      b: `${centerX + 1},${centerY + 1}`,
    },
    {
      bit: 2,
      flowBit: 16,
      dx: y % 2 === 0 ? 0 : 1,
      dy: -1,
      a: `${centerX},${centerY - 2}`,
      b: `${centerX + 1},${centerY - 1}`,
    },
    {
      bit: 4,
      flowBit: 32,
      dx: y % 2 === 0 ? -1 : 0,
      dy: -1,
      a: `${centerX - 1},${centerY - 1}`,
      b: `${centerX},${centerY - 2}`,
    },
  ];
}

export function riverFlowBit(edgeBit: RiverEdgeBit): 8 | 16 | 32 {
  return (edgeBit << 3) as 8 | 16 | 32;
}

/**
 * Decode the direction stored in the upper three bits relative to the
 * canonical a/b endpoints returned by riverEdgeDefinitions.
 */
export function riverFlowsFromAToB(river: number, edgeBit: RiverEdgeBit) {
  const directionSet = Boolean(river & riverFlowBit(edgeBit));
  return directionSet === (edgeBit === 2);
}

export function setRiverEdge(river: number, edgeBit: RiverEdgeBit, fromAToB: boolean) {
  const directionBit = riverFlowBit(edgeBit);
  let result = river | edgeBit;
  const directionSet = fromAToB === (edgeBit === 2);
  result = directionSet ? result | directionBit : result & ~directionBit;
  return result;
}

export function clearRiverEdge(river: number, edgeBit: RiverEdgeBit) {
  return river & ~edgeBit & ~riverFlowBit(edgeBit);
}

function canonicalRiverVertex(vertex: string, width: number, wraps: boolean) {
  if (!wraps) return vertex;
  const separator = vertex.indexOf(",");
  const rawX = Number(vertex.slice(0, separator));
  const y = vertex.slice(separator + 1);
  const period = width * 2;
  const x = (rawX % period + period) % period;
  return `${x},${y}`;
}

/**
 * Decode the final serialized Civ V river representation into exact
 * vertex-connected, directed edge systems. The result includes malformed
 * systems (for example loops and dead ends) so callers can fail closed rather
 * than make an absent or broken river disappear from evidence.
 */
export function reconstructCiv5RiverEdgeSystems(
  map: Pick<Civ5Map, "width" | "height" | "wraps" | "tiles">,
): Civ5RiverEdgeSystem[] {
  const edges: Civ5RiverEdge[] = [];
  const adjacency = new Map<string, number[]>();
  const directed = new Map<string, string[]>();
  const vertexTiles = new Map<string, Set<number>>();
  const addAdjacency = (vertex: string, edgeIndex: number) => adjacency.set(vertex, [...(adjacency.get(vertex) ?? []), edgeIndex]);
  const addVertexTiles = (vertex: string, indices: readonly number[]) => {
    const values = vertexTiles.get(vertex) ?? new Set<number>();
    for (const index of indices) values.add(index);
    vertexTiles.set(vertex, values);
  };

  for (let y = 0; y < map.height; y += 1) for (let x = 0; x < map.width; x += 1) {
    const owner = y * map.width + x;
    const river = map.tiles[owner]?.river ?? 0;
    // Structural validation owns unsupported bits. Do not reinterpret a
    // malformed byte as trustworthy narrative evidence.
    if (river & ~RIVER_DATA_MASK) continue;
    for (const definition of riverEdgeDefinitions(x, y)) {
      const rawNextX = x + definition.dx;
      const nextY = y + definition.dy;
      const nextX = map.wraps ? (rawNextX + map.width) % map.width : rawNextX;
      if (nextX < 0 || nextX >= map.width || nextY < 0 || nextY >= map.height) continue;
      const neighbor = nextY * map.width + nextX;
      const a = canonicalRiverVertex(definition.a, map.width, map.wraps);
      const b = canonicalRiverVertex(definition.b, map.width, map.wraps);
      addVertexTiles(a, [owner, neighbor]);
      addVertexTiles(b, [owner, neighbor]);
      if (!(river & definition.bit) || map.tiles[owner].terrain < 2 || map.tiles[neighbor].terrain < 2) continue;
      const fromAToB = riverFlowsFromAToB(river, definition.bit);
      const edgeIndex = edges.length;
      edges.push({
        owner,
        neighbor,
        bit: definition.bit,
        a,
        b,
        from: fromAToB ? a : b,
        to: fromAToB ? b : a,
      });
      addAdjacency(a, edgeIndex);
      addAdjacency(b, edgeIndex);
      const from = fromAToB ? a : b;
      const to = fromAToB ? b : a;
      directed.set(from, [...(directed.get(from) ?? []), to]);
    }
  }

  const systems: Civ5RiverEdgeSystem[] = [];
  const visited = new Set<string>();
  for (const origin of adjacency.keys()) {
    if (visited.has(origin)) continue;
    const queue = [origin];
    const vertices: string[] = [];
    const componentEdges = new Set<number>();
    visited.add(origin);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const vertex = queue[cursor];
      vertices.push(vertex);
      for (const edgeIndex of adjacency.get(vertex) ?? []) {
        componentEdges.add(edgeIndex);
        const edge = edges[edgeIndex];
        const next = edge.a === vertex ? edge.b : edge.a;
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }

    const orderedVertices = [...vertices].sort();
    const endpoints = orderedVertices.filter((vertex) => (adjacency.get(vertex)?.length ?? 0) === 1);
    const touchesTile = (vertex: string, predicate: (index: number) => boolean) => [...(vertexTiles.get(vertex) ?? [])].some(predicate);
    const sourceVertices = endpoints.filter((vertex) => touchesTile(vertex, (index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation === 2));
    const outletVertices = endpoints.filter((vertex) => touchesTile(vertex, (index) => map.tiles[index].terrain < 2));
    const junctionVertices = orderedVertices.filter((vertex) => (adjacency.get(vertex)?.length ?? 0) >= 3);
    const deadEndVertices = endpoints.filter((vertex) => !sourceVertices.includes(vertex) && !outletVertices.includes(vertex));
    const waterInteriorVertices = orderedVertices.filter((vertex) => (adjacency.get(vertex)?.length ?? 0) > 1
      && touchesTile(vertex, (index) => map.tiles[index].terrain < 2));
    const componentVertices = new Set(orderedVertices);
    const outlets = new Set(outletVertices);
    const reachesOutlet = (source: string) => {
      const reached = new Set([source]);
      const flow = [source];
      for (let cursor = 0; cursor < flow.length; cursor += 1) for (const next of directed.get(flow[cursor]) ?? []) {
        if (!componentVertices.has(next) || reached.has(next)) continue;
        reached.add(next);
        flow.push(next);
      }
      return [...outlets].some((outlet) => reached.has(outlet));
    };
    const component = [...componentEdges].sort((one, two) => one - two).map((edgeIndex) => edges[edgeIndex]);
    systems.push({
      edges: component,
      tileIndices: [...new Set(component.flatMap((edge) => [edge.owner, edge.neighbor]))].sort((one, two) => one - two),
      ownerIndices: [...new Set(component.map((edge) => edge.owner))].sort((one, two) => one - two),
      vertices: orderedVertices,
      edgeCount: component.length,
      acyclic: component.length === orderedVertices.length - 1,
      sourceVertices,
      outletVertices,
      junctionVertices,
      deadEndVertices,
      waterInteriorVertices,
      sourceTileIndices: [...new Set(sourceVertices.flatMap((vertex) => [...(vertexTiles.get(vertex) ?? [])]
        .filter((index) => map.tiles[index].terrain >= 2 && map.tiles[index].elevation === 2)))].sort((one, two) => one - two),
      outletTileIndices: [...new Set(outletVertices.flatMap((vertex) => [...(vertexTiles.get(vertex) ?? [])]
        .filter((index) => map.tiles[index].terrain < 2)))].sort((one, two) => one - two),
      directedToOutlet: sourceVertices.length > 0 && outletVertices.length > 0
        && orderedVertices.every((vertex) => outlets.has(vertex) || reachesOutlet(vertex)),
    });
  }
  return systems.sort((one, two) => one.ownerIndices[0] - two.ownerIndices[0]
    || one.vertices[0].localeCompare(two.vertices[0]));
}
