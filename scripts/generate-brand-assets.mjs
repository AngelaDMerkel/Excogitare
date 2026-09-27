import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { identity, lockupSvg, markMarkup, svgDocument, wordmark, wordmarkMarkup } from "../branding/svg.mjs";

const require = createRequire(import.meta.url);
let sharp;
try { sharp = require("sharp"); }
catch (error) {
  if (!process.env.SHARP_MODULE) throw new Error("Set SHARP_MODULE to an installed sharp package directory to regenerate the PNG/ICO files.", { cause: error });
  sharp = require(process.env.SHARP_MODULE);
}
const publicRoot = new URL("../public/", import.meta.url);
const root = new URL("brand/", publicRoot);
await mkdir(root, { recursive: true });
const { gold, night, paper } = identity.colors;
for (const [suffix, color] of [["", gold], ["-ink", night]]) {
  await writeFile(new URL(`wayfinder${suffix}.svg`, root), svgDocument(markMarkup(color), identity.viewBox, "Excogitare Wayfinder"));
  await writeFile(new URL(`wordmark${suffix}.svg`, root), svgDocument(wordmarkMarkup(color), wordmark.viewBox));
  await writeFile(new URL(`lockup${suffix}.svg`, root), lockupSvg(color));
}
await writeFile(new URL("wayfinder-small.svg", root), svgDocument(markMarkup(gold, true), identity.viewBox, "Excogitare Wayfinder small-size mark"));
const bannerScale = 620 / wordmark.width;
await writeFile(new URL("banner.svg", root), svgDocument(`<rect width="1000" height="220" fill="${night}"/><g transform="translate(88 54) scale(1.75)">${markMarkup()}</g><g transform="translate(246 ${110 - wordmark.height * bannerScale / 2}) scale(${bannerScale})">${wordmarkMarkup()}</g>`, "0 0 1000 220"));

const favicon = svgDocument(`<rect width="64" height="64" rx="12" fill="${night}"/>${markMarkup(gold, true)}`);
await writeFile(new URL("favicon.svg", publicRoot), favicon);
const appIcon = svgDocument(`<rect width="64" height="64" fill="${gold}"/><g transform="translate(7 7) scale(.78125)">${markMarkup(night)}</g>`);
await writeFile(new URL("app-icon.svg", root), appIcon);
for (const size of [180, 192, 512]) {
  const output = size === 180 ? new URL("apple-touch-icon.png", publicRoot) : new URL(`icon-${size}.png`, root);
  await writeFile(output, await sharp(Buffer.from(appIcon)).resize(size, size).png().toBuffer());
}
const maskable = svgDocument(`<rect width="64" height="64" fill="${gold}"/><g transform="translate(13 13) scale(.59375)">${markMarkup(night)}</g>`);
await writeFile(new URL("icon-maskable-512.png", root), await sharp(Buffer.from(maskable)).resize(512, 512).png().toBuffer());

// Modern ICO containers accept PNG payloads; each entry has its own native size.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(Buffer.from(favicon)).resize(size, size).png().toBuffer()));
const directory = Buffer.alloc(6 + 16 * sizes.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  directory[entry] = directory[entry + 1] = sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(image.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(new URL("favicon.ico", publicRoot), Buffer.concat([directory, ...images]));

const manifest = {
  name: "Excogitare", short_name: "Excogitare", description: "Create and shape Civilization V worlds.",
  id: "./", start_url: "./", scope: "./", display: "browser", background_color: paper, theme_color: night,
  icons: [
    { src: "brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};
await writeFile(new URL("site.webmanifest", publicRoot), `${JSON.stringify(manifest, null, 2)}\n`);
console.log("Generated Wayfinder vector lockups, favicon SVG/ICO, Apple/app icons and scoped web manifest.");
