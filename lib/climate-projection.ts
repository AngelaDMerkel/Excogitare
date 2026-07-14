export type ClimateProjection = "NORTH_SOUTH" | "POLAR_CENTERED" | "EQUATORIAL_POLE";

export const CLIMATE_PROJECTIONS: ReadonlyArray<{
  id: ClimateProjection;
  label: string;
  description: string;
}> = [
  {
    id: "NORTH_SOUTH",
    label: "North / south poles",
    description: "The conventional model: cold poles at the top and bottom, with the equator across the middle.",
  },
  {
    id: "POLAR_CENTERED",
    label: "Polar centered",
    description: "A pole sits at the map center and climate radiates outward toward an equatorial perimeter.",
  },
  {
    id: "EQUATORIAL_POLE",
    label: "Equatorial pole",
    description: "The map's middle axis becomes the pole, with warmer equatorial conditions toward the top and bottom.",
  },
];

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

/** Returns 0 at the projected equator and 1 at the projected pole. */
export function poleProximity(
  x: number,
  y: number,
  width: number,
  height: number,
  projection: ClimateProjection,
) {
  const normalizedX = width <= 1 ? 0.5 : x / (width - 1);
  const normalizedY = height <= 1 ? 0.5 : y / (height - 1);
  const conventionalLatitude = clamp(Math.abs(normalizedY - 0.5) * 2);

  if (projection === "EQUATORIAL_POLE") return 1 - conventionalLatitude;
  if (projection === "POLAR_CENTERED") {
    const radialDistance = Math.hypot((normalizedX - 0.5) * 2, (normalizedY - 0.5) * 2);
    return 1 - clamp(radialDistance);
  }
  return conventionalLatitude;
}
