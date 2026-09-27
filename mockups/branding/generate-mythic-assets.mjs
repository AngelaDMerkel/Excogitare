// The comparison's original vector symbols are authoritative for this design round.
import { mkdir, readFile, writeFile } from "node:fs/promises";

const source = await readFile(new URL("./mythic-icons.html", import.meta.url), "utf8");
const symbols = new Map([...source.matchAll(/<symbol id="mythic-([\w-]+)" viewBox="0 0 64 64">([\s\S]*?)<\/symbol>/g)].map(([, id, shape]) => [id, shape]));
const root = new URL("./assets/mythic/", import.meta.url);
await mkdir(root, { recursive: true });
const svg = (name, content) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Excogitare ${name} concept">${content}</svg>\n`;
for (const id of ["wayfinder", "rift", "worldseed", "runestone", "original"]) {
  const mark = symbols.get(id), small = symbols.get(`${id}-small`);
  if (!mark || !small) throw new Error(`Missing ${id} symbol`);
  await writeFile(new URL(`${id}-mark.svg`, root), svg(id, `<g color="#d9b678">${mark}</g>`));
  await writeFile(new URL(`${id}-favicon.svg`, root), svg(id, `<rect width="64" height="64" rx="12" fill="#252c40"/><g color="#d9b678">${small}</g>`));
  await writeFile(new URL(`${id}-app.svg`, root), svg(id, `<rect width="64" height="64" rx="15" fill="#d9b678"/><g transform="translate(7 7) scale(.78125)" color="#252c40">${mark}</g>`));
}
console.log("Wrote 15 mythic icon SVG proofs from the comparison symbols.");
