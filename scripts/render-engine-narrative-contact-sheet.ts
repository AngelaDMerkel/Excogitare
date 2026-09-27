import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { EngineNarrativeStageName, EngineNarrativeStageSnapshot } from "../lib/engine-narrative-diagnostics.ts";
import { DEFAULT_GENERATION_OPTIONS, MAP_PRESETS, generateMap, type MapGenerationOptions } from "../lib/map-generator.ts";

const FIXTURES = [
  { engine: "EXCOGITARE", preset: "CONTINENTS", size: "TINY", seed: "narrative-sheet-a" },
  { engine: "EXCOGITARE", preset: "INLAND_SEAS", size: "STANDARD", seed: "narrative-sheet-b" },
  { engine: "ECCENTRIC", preset: "GREAT_WATERSHEDS", size: "TINY", seed: "narrative-sheet-a" },
  { engine: "ECCENTRIC", preset: "SHATTERED_BASINS", size: "STANDARD", seed: "narrative-sheet-b" },
  { engine: "PHYSICAL", preset: "DYNAMIC_EARTH", size: "TINY", seed: "narrative-sheet-a" },
  { engine: "PHYSICAL", preset: "MONSOON_CONTINENTS", size: "STANDARD", seed: "narrative-sheet-b" },
  { engine: "POLIS", preset: "IMPERIAL_RING", size: "TINY", seed: "narrative-sheet-a" },
  { engine: "POLIS", preset: "THREE_REALMS", size: "STANDARD", seed: "narrative-sheet-b" },
] as const satisfies ReadonlyArray<Pick<MapGenerationOptions, "engine" | "preset" | "size" | "seed">>;

const STAGES = ["RAW_NATIVE", "NARRATIVE_REALIZED", "LEGAL_NORMALIZED", "FINAL"] as const satisfies ReadonlyArray<EngineNarrativeStageName>;
const TERRAIN_COLORS = ["#102f48", "#25627a", "#7c9d62", "#b7a469", "#c29a57", "#7f8f89", "#d8e0df"] as const;
const PANEL_WIDTH = 184;
const PANEL_HEIGHT = 132;
const LABEL_WIDTH = 208;
const HEADER_HEIGHT = 58;
const ROW_GAP = 12;
const COLUMN_GAP = 12;
const MARGIN = 18;

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[character]!);
}

function optionsForFixture(fixture: (typeof FIXTURES)[number]): MapGenerationOptions {
  const preset = MAP_PRESETS.find((candidate) => candidate.id === fixture.preset)!;
  return {
    ...DEFAULT_GENERATION_OPTIONS,
    ...fixture,
    players: fixture.size === "STANDARD" ? 8 : 4,
    cityStates: fixture.size === "STANDARD" ? 8 : 4,
    waterPercent: preset.water,
    mountainPercent: preset.mountains,
    style: fixture.engine === "ECCENTRIC" ? "FANTASTICAL" : fixture.engine === "PHYSICAL" ? "REALISTIC" : "MUNDANE",
    climateRealism: preset.climateRealism ?? DEFAULT_GENERATION_OPTIONS.climateRealism,
    riverDensity: preset.riverDensity ?? DEFAULT_GENERATION_OPTIONS.riverDensity,
    plateActivity: preset.plateActivity ?? DEFAULT_GENERATION_OPTIONS.plateActivity,
    erosionStrength: preset.erosionStrength ?? DEFAULT_GENERATION_OPTIONS.erosionStrength,
    worldAge: preset.worldAge ?? DEFAULT_GENERATION_OPTIONS.worldAge,
    climate: preset.climate ?? DEFAULT_GENERATION_OPTIONS.climate,
    rainfall: preset.rainfall ?? DEFAULT_GENERATION_OPTIONS.rainfall,
    physicalOceanInfluence: preset.physicalOceanInfluence ?? DEFAULT_GENERATION_OPTIONS.physicalOceanInfluence,
  };
}

function renderSnapshot(snapshot: EngineNarrativeStageSnapshot, x: number, y: number) {
  const tileSize = Math.min((PANEL_WIDTH - 12) / snapshot.width, (PANEL_HEIGHT - 12) / snapshot.height);
  const mapWidth = snapshot.width * tileSize;
  const mapHeight = snapshot.height * tileSize;
  const originX = x + (PANEL_WIDTH - mapWidth) / 2;
  const originY = y + (PANEL_HEIGHT - mapHeight) / 2;
  const paths = new Map<string, string[]>();
  for (let index = 0; index < snapshot.landMask.length; index += 1) {
    const tile = snapshot.tiles?.[index];
    const terrain = tile?.terrain ?? (snapshot.landMask[index] ? 2 : 0);
    const elevation = tile?.elevation ?? snapshot.elevations[index];
    const color = elevation === 2 && snapshot.landMask[index] ? "#4b4f4d" : elevation === 1 && snapshot.landMask[index] ? "#6d705f" : TERRAIN_COLORS[terrain] ?? "#7c9d62";
    const cellX = originX + index % snapshot.width * tileSize;
    const cellY = originY + Math.floor(index / snapshot.width) * tileSize;
    const commands = paths.get(color) ?? [];
    commands.push(`M${cellX.toFixed(2)} ${cellY.toFixed(2)}h${tileSize.toFixed(2)}v${tileSize.toFixed(2)}h-${tileSize.toFixed(2)}Z`);
    paths.set(color, commands);
  }
  return [
    `<rect x="${x}" y="${y}" width="${PANEL_WIDTH}" height="${PANEL_HEIGHT}" rx="6" fill="#091f23" stroke="#29464a"/>`,
    ...[...paths].map(([color, commands]) => `<path d="${commands.join("")}" fill="${color}"/>`),
  ].join("");
}

const outputArgument = process.argv.find((argument) => argument.startsWith("--output="))?.slice("--output=".length)
  ?? "/tmp/excogitare-engine-narrative-contact-sheet.svg";
const outputPath = resolve(outputArgument);
const rows = FIXTURES.map((fixture) => {
  const snapshots = new Map<EngineNarrativeStageName, EngineNarrativeStageSnapshot>();
  generateMap(optionsForFixture(fixture), undefined, { onEngineNarrativeStage: (snapshot) => snapshots.set(snapshot.stage, snapshot) });
  for (const stage of STAGES) if (!snapshots.has(stage)) throw new Error(`${fixture.engine}/${fixture.preset} did not expose ${stage}.`);
  return { fixture, snapshots };
});

const width = MARGIN * 2 + LABEL_WIDTH + STAGES.length * PANEL_WIDTH + (STAGES.length - 1) * COLUMN_GAP;
const height = MARGIN * 2 + HEADER_HEIGHT + rows.length * PANEL_HEIGHT + (rows.length - 1) * ROW_GAP;
const title = "Excogitare engine–narrative observation fixtures";
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  `<rect width="100%" height="100%" fill="#0d292c"/>`,
  `<style>text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;fill:#d9e2dd}.title{font-family:Georgia,serif;font-size:24px}.stage{font-size:11px;letter-spacing:1.4px;fill:#e6c970}.fixture{font-size:13px;font-weight:700}.detail{font-size:11px;fill:#8da4a1}</style>`,
  `<text class="title" x="${MARGIN}" y="30">${escapeXml(title)}</text>`,
  `<text class="detail" x="${MARGIN}" y="48">Fixed seeds and sizes · selected native candidate · perceptual recognition unassessed</text>`,
  ...STAGES.map((stage, column) => {
    const x = MARGIN + LABEL_WIDTH + column * (PANEL_WIDTH + COLUMN_GAP) + PANEL_WIDTH / 2;
    return `<text class="stage" text-anchor="middle" x="${x}" y="${HEADER_HEIGHT + MARGIN - 8}">${stage.replaceAll("_", " ")}</text>`;
  }),
  ...rows.flatMap(({ fixture, snapshots }, row) => {
    const y = MARGIN + HEADER_HEIGHT + row * (PANEL_HEIGHT + ROW_GAP);
    const label = MAP_PRESETS.find((preset) => preset.id === fixture.preset)?.label ?? fixture.preset;
    return [
      `<text class="fixture" x="${MARGIN}" y="${y + 24}">${escapeXml(fixture.engine)}</text>`,
      `<text class="fixture" x="${MARGIN}" y="${y + 44}">${escapeXml(label)}</text>`,
      `<text class="detail" x="${MARGIN}" y="${y + 64}">${fixture.size} · ${escapeXml(fixture.seed)}</text>`,
      ...STAGES.map((stage, column) => renderSnapshot(
        snapshots.get(stage)!,
        MARGIN + LABEL_WIDTH + column * (PANEL_WIDTH + COLUMN_GAP),
        y,
      )),
    ];
  }),
  "</svg>",
].join("");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, svg);
console.log(outputPath);
