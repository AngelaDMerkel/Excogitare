import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const outputDirectory = new URL("../out/", import.meta.url);
const outputPath = fileURLToPath(outputDirectory);
const requiredFiles = ["index.html", "legacy/index.html", "404.html", "wasmoon.wasm", "og-editor.png", "v3/index.html", "v3/generation-worker.js", "v3/generation-build.js", "v3/brand/favicon.svg"];

await Promise.all(requiredFiles.map((file) => access(new URL(file, outputDirectory))));

const html = await readFile(new URL("index.html", outputDirectory), "utf8");
assert.match(html, /\/Excogitare\/_next\//, "The static page must load its Next assets below /Excogitare.");
assert.match(html, /https:\/\/angeladmerkel\.github\.io\/Excogitare\/og-editor\.png/, "Social metadata must use the final Pages URL.");
assert.doesNotMatch(html, /(?:src|href)="\/_next\//, "No Next asset may escape to the github.io origin root.");
assert.match(html, /http-equiv="refresh"[^>]+content="0;url=\/Excogitare\/v3\/index\.html"/, "The homepage must open V3 below the Pages prefix.");
assert.match(html, /\/Excogitare\/v3\/brand\/favicon\.svg/, "The homepage favicon must use the Pages prefix.");
const legacyHtml = await readFile(new URL("legacy/index.html", outputDirectory), "utf8");
assert.match(legacyHtml, /The Twin Continents/, "The original interface remains at /legacy.");

async function collectJavaScript(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJavaScript(path));
    else if (entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

const javascriptFiles = await collectJavaScript(join(outputPath, "_next"));
assert.ok(javascriptFiles.length > 0, "The Pages export must contain JavaScript bundles.");
const javascript = (await Promise.all(javascriptFiles.map((file) => readFile(file, "utf8")))).join("\n");
assert.match(javascript, /wasmoon\.wasm/, "The Lua worker must retain its WebAssembly asset lookup.");
assert.match(javascript, /Regenerating /, "The map-generation worker must be present in the static export.");

console.log(`Verified GitHub Pages export: ${requiredFiles.length} public files and ${javascriptFiles.length} JavaScript bundles.`);

const v3Html = await readFile(new URL("v3/index.html", outputDirectory), "utf8");
assert.match(v3Html, /generation-client\.js/, "V3 must include its worker client.");
for (const match of v3Html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const asset = match[1].split("?")[0];
  if (!asset.startsWith("data:") && !asset.startsWith("http")) await access(new URL(`v3/${asset}`, outputDirectory));
  if (/\.(js|css)$/.test(asset)) {
    const bytes = await readFile(new URL(`v3/${asset}`, outputDirectory));
    const version = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    assert.equal(new URL(match[1], "https://local.invalid/").searchParams.get("v"), version, `${asset} must invalidate stale browser caches when its content changes.`);
  }
}
console.log("Verified V3 page, worker, styles, scripts and brand assets.");
