import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { captureRewriteBaseline } from "./rewrite-baseline-support.ts";

const expected = JSON.parse(readFileSync(new URL("./fixtures/rewrite-baseline.json", import.meta.url), "utf8"));

test("narrative rewrite Phase 0 baseline changes only through deliberate fixture review", () => {
  assert.deepEqual(captureRewriteBaseline(), expected);
});
