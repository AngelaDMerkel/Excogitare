import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const outputDirectory = new URL("../out/", import.meta.url);
const outputPath = fileURLToPath(outputDirectory);
const requiredFiles = ["index.html", "404.html", "wasmoon.wasm", "og-editor.png"];

await Promise.all(requiredFiles.map((file) => access(new URL(file, outputDirectory))));

const html = await readFile(new URL("index.html", outputDirectory), "utf8");
assert.match(html, /\/Excogitare\/_next\//, "The static page must load its Next assets below /Excogitare.");
assert.match(html, /https:\/\/angeladmerkel\.github\.io\/Excogitare\/og-editor\.png/, "Social metadata must use the final Pages URL.");
assert.doesNotMatch(html, /(?:src|href)="\/_next\//, "No Next asset may escape to the github.io origin root.");

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
