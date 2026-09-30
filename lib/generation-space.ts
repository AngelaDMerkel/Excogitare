/** Physical coordinates for the pointy hex grid. Locations may be stored as
 * fractions of the canvas; lengths and rotations must use this common metric. */
export const HEX_ROW_HEIGHT = Math.sqrt(3) / 2;
export type GenerationSpace = { width: number; height: number; spanY: number; scale: number };
export type SpacePoint = { x: number; y: number };

export function generationSpace(width: number, height: number): GenerationSpace {
  return { width, height, spanY: height * HEX_ROW_HEIGHT, scale: Math.sqrt(width * height * HEX_ROW_HEIGHT) };
}

export function wrappedOffset(value: number, period: number) {
  return value - Math.floor(value / period + .5) * period;
}

/** A single length scale preserves area without changing shape with aspect. */
export function spaceOffset(point: SpacePoint, anchor: SpacePoint, space: GenerationSpace, wraps: boolean): SpacePoint {
  const dx = (point.x - anchor.x) * space.width;
  return { x: (wraps ? wrappedOffset(dx, space.width) : dx) / space.scale, y: (point.y - anchor.y) * space.spanY / space.scale };
}

export function tilePoint(index: number, width: number, height: number): SpacePoint {
  const row = Math.floor(index / width);
  return { x: (index % width + .5 + (row & 1) * .5) / width, y: (row + .5) / height };
}

/** Distance to the actual segment, including across a horizontal wrap seam. */
export function spaceSegmentDistance(point: SpacePoint, from: SpacePoint, to: SpacePoint, space: GenerationSpace, wraps: boolean) {
  const edge = spaceOffset(to, from, space, wraps), delta = spaceOffset(point, from, space, wraps);
  const lengthSquared = edge.x ** 2 + edge.y ** 2;
  const period = space.width / space.scale;
  return Math.min(...(wraps ? [delta.x - period, delta.x, delta.x + period] : [delta.x]).map(x => {
    const amount = lengthSquared ? Math.max(0, Math.min(1, (x * edge.x + delta.y * edge.y) / lengthSquared)) : 0;
    return Math.hypot(x - edge.x * amount, delta.y - edge.y * amount);
  }));
}

export function spaceCoordinates(point: SpacePoint, space: GenerationSpace): SpacePoint {
  return { x: .5 + (point.x - .5) * space.width / space.scale, y: .5 + (point.y - .5) * space.spanY / space.scale };
}
