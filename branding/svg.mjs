import { readFile } from "node:fs/promises";

export const identity = JSON.parse(await readFile(new URL("./identity.json", import.meta.url), "utf8"));
export const wordmark = JSON.parse(await readFile(new URL("./wordmark.json", import.meta.url), "utf8"));

export function markMarkup(color = identity.colors.gold, small = false) {
  const c = identity.circle;
  return `<g fill="${color}"><circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="none" stroke="${color}" stroke-width="${small ? c.smallStrokeWidth : c.strokeWidth}"/><path d="${small ? identity.smallPath : identity.path}" fill-rule="evenodd"/></g>`;
}

export function wordmarkMarkup(color = identity.colors.gold) {
  return `<path d="${wordmark.path}" fill="${color}"/>`;
}

export function svgDocument(content, viewBox = "0 0 64 64", label = "Excogitare") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label}">${content}</svg>\n`;
}

export function lockupSvg(color = identity.colors.gold) {
  const scale = 34 / wordmark.height;
  return svgDocument(`${markMarkup(color)}<g transform="translate(84 15) scale(${scale})">${wordmarkMarkup(color)}</g>`, `0 0 ${84 + wordmark.width * scale} 64`);
}
