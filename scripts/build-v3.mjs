import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({ absWorkingDir: root, entryPoints: ['lib/v3/worker.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: 'mockups/v3/generation-worker.js', minify: true });
await build({ absWorkingDir: root, entryPoints: ['mockups/v3/rules.ts'], bundle: true, format: 'iife', globalName: 'V3ExistingRules', target: 'es2022', outfile: 'mockups/v3/rules.js', minify: true });
const dimensions = execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "import { V3_MAP_SIZES, V3_MAP_GEOMETRIES } from './lib/v3/dimensions.ts'; process.stdout.write(JSON.stringify({ V3_MAP_SIZES, V3_MAP_GEOMETRIES }));"], { cwd: root, encoding: 'utf8' });
await writeFile(new URL('../mockups/v3/dimensions.js', import.meta.url), `window.V3Dimensions=${dimensions};\n`);
const digest = createHash('sha256').update(await readFile(new URL('../mockups/v3/generation-worker.js', import.meta.url))).digest('hex').slice(0, 16);
await writeFile(new URL('../mockups/v3/generation-build.js', import.meta.url), `window.V3_GENERATOR_BUILD=${JSON.stringify(digest)};\n`);
const source = new URL('../mockups/v3/', import.meta.url), destination = new URL('../public/v3/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const file of ['index.html', 'style.css', 'theme.css', 'sidebar.css', 'layers.css', 'layers.js', 'refine.css', 'refine.js', 'select-menus.css', 'select-menus.js', 'app.js', 'generation-controls.js', 'dimensions.js', 'v1-catalogue.js', 'samples.js', 'rules.js', 'map-fit.js', 'snapshot-store.js', 'history-carousel.js', 'history-actions.css', 'sidebar-fit.js', 'dimension-warnings.js', 'dimension-warnings.css', 'mobile-ui.js', 'generation-client.js', 'generation-worker.js', 'generation-build.js']) await copyFile(new URL(file, source), new URL(file, destination));
await mkdir(new URL('history-layouts/', destination), { recursive: true });
await copyFile(new URL('history-layouts/layouts.css', source), new URL('history-layouts/layouts.css', destination));
await cp(new URL('brand/', source), new URL('brand/', destination), { recursive: true });
// Cache keys must change with the actual client and worker-bootstrap bytes.
// Otherwise an updated page can keep using a previous generator build token.
let html = await readFile(new URL('index.html', destination), 'utf8');
const versions = await Promise.all([...html.matchAll(/\b(src|href)="([^"?]+\.(?:js|css))(?:\?[^" ]*)?"/g)].map(async ([reference, attribute, file]) => {
  const hash = createHash('sha256').update(await readFile(new URL(file, destination))).digest('hex').slice(0, 16);
  return [reference, `${attribute}="${file}?v=${hash}"`];
}));
for (const [reference, versioned] of versions) html = html.replaceAll(reference, versioned);
await writeFile(new URL('index.html', destination), html);
console.log(`Built V3 generator ${digest} and /v3/index.html.`);
