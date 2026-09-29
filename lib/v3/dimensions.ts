import { MAP_SIZES, type MapGeometry } from '../map-generator.ts';

/** One catalogue for request validation and the generated browser controls. */
export const V3_MAP_SIZES = MAP_SIZES.map(({ id, label, width, height, gameBreaking }) => ({ id, label, width, height, experimental: gameBreaking }));
export const V3_MAP_GEOMETRIES = [
  { id: 'STANDARD', label: 'Standard', experimental: false },
  { id: 'WIDE', label: 'Wide', experimental: false },
  { id: 'TALL', label: 'Tall', experimental: false },
  { id: 'SQUARE', label: 'Square', experimental: false },
  { id: 'NEEDLE', label: 'Needle', experimental: true },
  { id: 'RIBBON', label: 'Ribbon', experimental: true },
  { id: 'PIN', label: 'Pin', experimental: true },
  { id: 'STRING', label: 'String', experimental: true },
] as const satisfies ReadonlyArray<{ id: MapGeometry; label: string; experimental: boolean }>;
// Keep existing random seeds stable. Extended dimensions are explicit choices.
export const V3_RANDOM_SIZES = ['TINY', 'SMALL', 'STANDARD', 'LARGE', 'HUGE'] as const;
export const V3_RANDOM_GEOMETRIES = ['STANDARD', 'WIDE', 'TALL', 'SQUARE'] as const;

export const V3_DIMENSION_WARNING = 'Experimental dimensions may not load reliably in Civ V or WorldBuilder.';
