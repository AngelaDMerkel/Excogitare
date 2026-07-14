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
