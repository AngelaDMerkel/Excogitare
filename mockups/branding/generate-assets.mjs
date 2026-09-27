// Original vector concepts. These are exploration assets, not production branding.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const concepts = [
  {
    id: "atlas", name: "Atlas", ink: "#6e3f47", paper: "#f6f0e6",
    font: "Baskerville, Georgia, serif", weight: 400, spacing: "-1",
    mark: '<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="3"/><path d="M20 17h25v10h-3l-2-6H29v9h8l1-4h3v13h-3l-1-5h-8v10h11l3-7h3v11H20v-3h4V20h-4z" fill="currentColor"/>',
    small: '<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="4"/><path d="M22 17h23v6H29v6h13v6H29v7h16v6H22z" fill="currentColor"/>',
  },
  {
    id: "strata", name: "Strata", ink: "#214e50", paper: "#eef2eb",
    font: "Avenir Next, Avenir, Arial, sans-serif", weight: 500, spacing: "-2",
    mark: '<path d="M32 4 56 18v7H25v5h24v8H25v5h31v4L32 61 8 47V18z" fill="currentColor"/>',
    small: '<path d="M32 4 56 18v7H25v5h24v8H25v5h31v4L32 61 8 47V18z" fill="currentColor"/>',
  },
  {
    id: "worldforge", name: "Worldforge", ink: "#d9b678", paper: "#252c40",
    font: "Optima, Palatino, Georgia, serif", weight: 400, spacing: "3",
    mark: '<path d="M32 3 58 32 32 61 6 32z" fill="none" stroke="currentColor" stroke-width="3"/><path d="m32 14 5 13 13 5-13 5-5 13-5-13-13-5 13-5z M32 26l6 6-6 6-6-6z" fill-rule="evenodd" fill="currentColor"/>',
    small: '<path d="M32 3 58 32 32 61 6 32z" fill="none" stroke="currentColor" stroke-width="4"/><path d="m32 14 5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="currentColor"/>',
  },
];

const root = new URL("./assets/", import.meta.url);
await mkdir(root, { recursive: true });
const svg = (name, content, viewBox = "0 0 64 64") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${name}">${content}</svg>\n`;
for (const c of concepts) {
  const colored = `<g color="${c.ink}">${c.mark}</g>`;
  await writeFile(new URL(`${c.id}-mark.svg`, root), svg(`Excogitare ${c.name} concept`, colored));
  await writeFile(new URL(`${c.id}-favicon.svg`, root), svg(`Excogitare ${c.name} favicon concept`, `<rect width="64" height="64" rx="12" fill="${c.paper}"/><g transform="translate(4 4) scale(.875)" color="${c.ink}">${c.small}</g>`));
  await writeFile(new URL(`${c.id}-app.svg`, root), svg(`Excogitare ${c.name} app icon concept`, `<rect width="64" height="64" rx="15" fill="${c.ink}"/><g transform="translate(7 7) scale(.78125)" color="${c.paper}">${c.mark}</g>`));
  const label = c.id === "worldforge" ? "EXCOGITARE" : "Excogitare";
  await writeFile(new URL(`${c.id}-lockup.svg`, root), svg(`Excogitare ${c.name} wordmark concept`, `<g color="${c.ink}">${c.mark}</g><text x="82" y="46" fill="${c.ink}" font-family="${c.font}" font-size="44" font-weight="${c.weight}" letter-spacing="${c.spacing}">${label}</text>`, "0 0 460 64"));
}
console.log(`Wrote twelve exploratory SVG assets to ${fileURLToPath(root)}`);
