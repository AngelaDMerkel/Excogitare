import { writeFileSync } from "node:fs";
import { captureRewriteBaseline } from "../tests/rewrite-baseline-support.ts";

const output = `${JSON.stringify(captureRewriteBaseline(), null, 2)}\n`;
if (process.argv.includes("--write")) {
  writeFileSync(new URL("../tests/fixtures/rewrite-baseline.json", import.meta.url), output);
} else {
  process.stdout.write(output);
}
