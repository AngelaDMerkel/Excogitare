export type ViewportSize = { width: number; height: number };
export type ViewportBounds = { width: number; height: number };
export type ViewportView = { zoom: number; x: number; y: number };

export const DEFAULT_VIEWPORT_MIN_ZOOM = 0.16;

export function fitViewport(
  targetSize: ViewportSize,
  targetBounds: ViewportBounds,
  padding = 22,
  maximumZoom = 1.7,
): ViewportView {
  const availableWidth = Math.max(1, targetSize.width - padding * 2);
  const availableHeight = Math.max(1, targetSize.height - padding * 2);
  const boundsWidth = Number.isFinite(targetBounds.width) && targetBounds.width > 0 ? targetBounds.width : 1;
  const boundsHeight = Number.isFinite(targetBounds.height) && targetBounds.height > 0 ? targetBounds.height : 1;
  const zoom = Math.min(maximumZoom, availableWidth / boundsWidth, availableHeight / boundsHeight);

  return {
    zoom,
    x: (targetSize.width - boundsWidth * zoom) / 2,
    y: (targetSize.height - boundsHeight * zoom) / 2,
  };
}

export function minimumViewportZoom(targetSize: ViewportSize, targetBounds: ViewportBounds) {
  return Math.min(DEFAULT_VIEWPORT_MIN_ZOOM, fitViewport(targetSize, targetBounds).zoom);
}
