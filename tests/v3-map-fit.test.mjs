import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { MAP_SIZES, resolveMapDimensions } from '../lib/map-generator.ts';
import { V3_MAP_GEOMETRIES } from '../lib/v3/dimensions.ts';

const context = { window: {} };
runInNewContext(await readFile(new URL('../mockups/v3/map-fit.js', import.meta.url), 'utf8'), context);
const { solve, hexBounds } = context.window.V3MapFit;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const desktop = {
  width: 1172, height: 853, padding: 32,
  overlays: [
    { left: 16, top: 16, right: 292.332, bottom: 764.482 },
    { left: 16, top: 776.476, right: 292.328, bottom: 816.476 },
    { left: 1060, top: 16, right: 1148, bottom: 51 },
    { left: 324.328, top: 24, right: 466.742, bottom: 68 },
    { left: 1052, top: 59, right: 1156, bottom: 732.476 },
    { left: 16, top: 828.5, right: 88.703, bottom: 850 },
  ],
};
function fit(layout, columns, rows) {
  const bounds = hexBounds(columns, rows);
  return { bounds, result: solve({ ...layout, mapWidth: bounds.width, mapHeight: bounds.height, mapLeft: bounds.left, mapTop: bounds.top }) };
}

test('Hex bounds match rendered vertices, including a single row and staggered narrow maps', () => {
  for (const [columns, rows] of [[1, 1], [1, 2], [2, 1], [10, 416], [408, 10], [170, 110]]) {
    const xs = [], ys = [];
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      for (let vertex = 0; vertex < 6; vertex++) {
        const angle = (vertex * 60 - 90) * Math.PI / 180;
        xs.push((column + (row % 2) * .5) * Math.sqrt(3) * 10 + 10 + Math.cos(angle) * 10);
        ys.push((rows - 1 - row) * 15 + 10 + Math.sin(angle) * 10);
      }
    }
    const bounds = hexBounds(columns, rows);
    near(bounds.left, Math.min(...xs)); near(bounds.top, Math.min(...ys));
    near(bounds.width, Math.max(...xs) - Math.min(...xs)); near(bounds.height, Math.max(...ys) - Math.min(...ys));
  }
});

test('Pin uses the same central workspace as every other geometry, instead of the strip beside the title', () => {
  let reference;
  for (const size of MAP_SIZES) for (const geometry of V3_MAP_GEOMETRIES) {
    const dimensions = resolveMapDimensions(size.id, geometry.id);
    const { bounds, result } = fit(desktop, dimensions.width, dimensions.height);
    near(result.space.left, 324.332); near(result.space.right, 1020);
    near(result.space.top, 100); near(result.space.bottom, 821);
    near(result.x + (bounds.left + bounds.width / 2) * result.zoom, (324.332 + 1020) / 2);
    near(result.y + (bounds.top + bounds.height / 2) * result.zoom, (100 + 821) / 2);
    if (reference) assert.equal(JSON.stringify(result.space), reference);
    reference = JSON.stringify(result.space);
  }
});

test('Every geometry fits with padding in desktop, small-window, preview and phone layouts', () => {
  const layouts = [desktop,
    { width: 900, height: 600, padding: 32, overlays: [{ left: 16, top: 16, right: 268, bottom: 563 }, { left: 300, top: 24, right: 510, bottom: 68 }, { left: 780, top: 16, right: 884, bottom: 480 }] },
    { width: 760, height: 420, padding: 32, overlays: [{ left: 16, top: 16, right: 195, bottom: 390 }, { left: 227, top: 24, right: 437, bottom: 68 }, { left: 640, top: 16, right: 744, bottom: 310 }] },
    { ...desktop, overlays: [...desktop.overlays, { left: 324.332, top: 700, right: 1020, bottom: 760 }] },
    { width: 390, height: 844, padding: 20, overlays: [{ left: 20, top: 18, right: 370, bottom: 60 }, { left: 0, top: 775, right: 390, bottom: 844 }] },
  ];
  for (const layout of layouts) {
    let center;
    for (const geometry of V3_MAP_GEOMETRIES) {
      const dimensions = resolveMapDimensions('STANDARD', geometry.id), { bounds, result } = fit(layout, dimensions.width, dimensions.height);
      assert.ok(result?.zoom > 0);
      const box = { left: result.x + bounds.left * result.zoom, right: result.x + (bounds.left + bounds.width) * result.zoom, top: result.y + bounds.top * result.zoom, bottom: result.y + (bounds.top + bounds.height) * result.zoom };
      assert.ok(box.left >= result.padding - 1e-7 && box.right <= layout.width - result.padding + 1e-7);
      assert.ok(box.top >= result.padding - 1e-7 && box.bottom <= layout.height - result.padding + 1e-7);
      for (const obstacle of layout.overlays) assert.ok(box.right <= obstacle.left - result.padding + 1e-7 || box.left >= obstacle.right + result.padding - 1e-7 || box.bottom <= obstacle.top - result.padding + 1e-7 || box.top >= obstacle.bottom + result.padding - 1e-7);
      const next = [(box.left + box.right) / 2, (box.top + box.bottom) / 2];
      if (center) { near(next[0], center[0]); near(next[1], center[1]); }
      center = next;
    }
  }
});

test('Thumbnails centre the rendered shape at 96,56 for all eight geometries', () => {
  for (const geometry of V3_MAP_GEOMETRIES) {
    const dimensions = resolveMapDimensions('STANDARD', geometry.id), { bounds, result } = fit({ width: 192, height: 112, padding: 1 }, dimensions.width, dimensions.height);
    near(result.x + (bounds.left + bounds.width / 2) * result.zoom, 96);
    near(result.y + (bounds.top + bounds.height / 2) * result.zoom, 56);
  }
});

test('Empty, blocked and invalid fit requests fail safely', () => {
  assert.equal(hexBounds(0, 1), null); assert.equal(hexBounds(1, 1.5), null);
  const input = { width: 100, height: 100, mapWidth: 20, mapHeight: 40 };
  assert.equal(solve({ ...input, width: 0 }), null);
  assert.equal(solve({ ...input, mapHeight: NaN }), null);
  assert.equal(solve({ ...input, mapLeft: Infinity }), null);
  assert.equal(solve({ ...input, overlays: [{ left: 0, top: 0, right: 100, bottom: 100 }] }), null);
  assert.ok(solve(input).zoom > 0);
});
