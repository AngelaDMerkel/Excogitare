import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const auditScript = fileURLToPath(new URL("../scripts/audit-engine-narrative-integration.ts", import.meta.url));
const commonArguments = [
  "--experimental-strip-types",
  auditScript,
  "--focus=CONTINENTS",
  "--seeds=audit-cli-test",
  "--size=DUEL",
  "--json",
];

type AuditReport = {
  schemaVersion: number;
  status: "PASS" | "FAIL";
  normalizedDigest: string;
  summary: {
    selectedProfiles: number;
    passedProfiles: number;
    failedProfiles: number;
    failureRecords: number;
  };
  experiment: {
    repeatsPerSeed: number;
    scopeLimitations: string[];
  };
  records: Array<{
    id: string;
    status: "PASS" | "FAIL";
    runs: Array<{ status: "PASS" | "FAIL"; failureCodes: string[] }>;
  }>;
  failures: Array<{ code: string; profileId: string; seed: string; run?: number }>;
};

function runAudit(extraArguments: string[] = []) {
  const result = spawnSync(process.execPath, [...commonArguments, ...extraArguments], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.doesNotThrow(() => JSON.parse(result.stdout), `Audit stdout was not JSON:\n${result.stdout}\n${result.stderr}`);
  return { status: result.status, report: JSON.parse(result.stdout) as AuditReport };
}

test("focused reconstruction audit passes deterministically with a stable normalized digest", () => {
  const first = runAudit();
  const second = runAudit();

  assert.equal(first.status, 0);
  assert.equal(first.report.schemaVersion, 2);
  assert.equal(first.report.status, "PASS");
  assert.deepEqual(first.report.summary, {
    selectedProfiles: 1,
    passedProfiles: 1,
    failedProfiles: 0,
    failureRecords: 0,
  });
  assert.equal(first.report.experiment.repeatsPerSeed, 2);
  assert.deepEqual(first.report.records.map((record) => [record.id, record.status]), [["CONTINENTS", "PASS"]]);
  assert.equal(first.report.normalizedDigest, second.report.normalizedDigest);
  assert.match(first.report.experiment.scopeLimitations.join(" "), /does not claim perceptual blind recognition/i);
  assert.match(first.report.experiment.scopeLimitations.join(" "), /does not claim Civilization V runtime compatibility/i);
});

test("reconstruction audit fails closed on repeated same-seed nondeterminism", () => {
  const { status, report } = runAudit(["--inject-failure=NONDETERMINISM"]);

  assert.equal(status, 1);
  assert.equal(report.status, "FAIL");
  assert.equal(report.summary.failedProfiles, 1);
  assert.ok(report.failures.some((item) => item.code === "NONDETERMINISTIC_OUTPUT"));
  assert.ok(report.records[0]?.runs[0]?.failureCodes.includes("NONDETERMINISTIC_OUTPUT"));
});

test("reconstruction audit fails closed on stale evidence in either repeated run", () => {
  const { status, report } = runAudit(["--inject-failure=STALE_EVIDENCE"]);

  assert.equal(status, 1);
  assert.equal(report.status, "FAIL");
  assert.deepEqual(report.failures.map((item) => [item.code, item.run]), [
    ["EVIDENCE_STALE", 1],
    ["EVIDENCE_STALE", 2],
  ]);
});
