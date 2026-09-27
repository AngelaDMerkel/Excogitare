import { reconstructCiv5RiverEdgeSystems, riverEdgeDefinitions, setRiverEdge } from "../rivers.ts";
import type { World } from "./model.ts";
import { markGenerationStructureStale } from "../generation-structure.ts";
import { drainageTree } from "./spatial.ts";
export function symmetry(world: World) {
  if (world.recipe.balance !== "SYMMETRIC") return;
  const { map, fields } = world;
  if (map.height % 2) throw new Error("Rotational arenas require an even number of hex rows. Choose standard, tall or wide proportions with an even height.");
  const sourceEdges = reconstructCiv5RiverEdgeSystems(map).flatMap(s => s.edges).filter(e => e.owner < map.tiles.length / 2 && e.neighbor < map.tiles.length / 2);
  const rotate = (i: number) => map.tiles.length - 1 - i;
  for (let a = 0; a < map.tiles.length / 2; a++) {
    const b = rotate(a); map.tiles[b] = { ...map.tiles[a], river: 0 }; map.tiles[a].river = 0;
    for (const key of ["elevation", "moisture", "temperature"] as const) fields[key][b] = fields[key][a];
  }
  const normalize = (vertex: string) => { const [x, y] = vertex.split(",").map(Number); return `${map.wraps ? (x % (map.width * 2) + map.width * 2) % (map.width * 2) : x},${y}`; };
  const rotateVertex = (vertex: string) => { const [x, y] = vertex.split(",").map(Number); return normalize(`${2 * map.width - 1 - x},${3 * (map.height - 1) - y}`); };
  for (const edge of sourceEdges) {
    const original = riverEdgeDefinitions(edge.owner % map.width, Math.floor(edge.owner / map.width)).find(d => d.bit === edge.bit)!;
    map.tiles[edge.owner].river = setRiverEdge(map.tiles[edge.owner].river, edge.bit, normalize(original.a) === normalize(edge.from));
    const left = rotate(edge.owner), right = rotate(edge.neighbor);
    for (const owner of [left, right]) {
      const x = owner % map.width, y = Math.floor(owner / map.width), neighbor = owner === left ? right : left;
      const definition = riverEdgeDefinitions(x, y).find(d => {
        const nx = map.wraps ? (x + d.dx + map.width) % map.width : x + d.dx;
        return nx >= 0 && nx < map.width && (y + d.dy) * map.width + nx === neighbor;
      });
      if (definition) { map.tiles[owner].river = setRiverEdge(map.tiles[owner].river, definition.bit, normalize(definition.a) === rotateVertex(edge.from)); break; }
    }
  }
  for (const system of reconstructCiv5RiverEdgeSystems(map)) if (!system.directedToOutlet) for (const edge of system.edges) map.tiles[edge.owner].river &= ~(edge.bit | edge.bit << 3);
  world.messages.push("Twofold rotational terrain and resource symmetry applied; river direction and edge ownership were reconstructed.");
  fields.drainage = drainageTree(map, fields.elevation).downstream;
  map.structure = markGenerationStructureStale(map.structure, "An explicitly authored rotational arena replaces native asymmetry.");
  const id = `arena:${world.substrate.id}`;
  world.development.operations = [...world.development.operations.filter(cause => cause.id !== id), { id, kind: "ARENA", label: "Authored rotational arena", tiles: [], parentIds: [world.substrate.id], inferred: false }];
}
