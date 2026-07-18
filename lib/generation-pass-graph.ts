export type GenerationPassDefinition = {
  id: string;
  version: number;
  dependencies: string[];
  ownedOutputs: string[];
};

export const GENERATION_PASS_DEFINITIONS: ReadonlyArray<GenerationPassDefinition> = [
  { id: "NORMALIZE", version: 1, dependencies: [], ownedOutputs: ["recipe"] },
  { id: "TOPOLOGY", version: 1, dependencies: ["NORMALIZE"], ownedOutputs: ["topology", "retained-topology"] },
  { id: "RELIEF", version: 1, dependencies: ["TOPOLOGY"], ownedOutputs: ["relief", "elevation", "mountain-ranges"] },
  { id: "CLIMATE", version: 1, dependencies: ["RELIEF"], ownedOutputs: ["climate", "terrain", "biomes"] },
  { id: "ACCESSIBILITY", version: 1, dependencies: ["RELIEF"], ownedOutputs: ["passes", "reachable-land"] },
  { id: "STARTS", version: 1, dependencies: ["CLIMATE", "ACCESSIBILITY"], ownedOutputs: ["major-starts", "city-state-starts"] },
  { id: "CONTENT", version: 1, dependencies: ["CLIMATE", "STARTS"], ownedOutputs: ["resources", "wonders", "sites", "routes"] },
  { id: "HYDROLOGY", version: 1, dependencies: ["RELIEF", "CLIMATE", "CONTENT"], ownedOutputs: ["river-edges", "river-systems", "watersheds"] },
  { id: "LEGALITY", version: 1, dependencies: ["STARTS", "CONTENT", "HYDROLOGY"], ownedOutputs: ["legal-map"] },
  { id: "SEMANTIC_IDENTITY", version: 1, dependencies: ["LEGALITY"], ownedOutputs: ["semantic-objects", "lineage", "derived-evidence"] },
] as const;

export type PassProvenance = {
  passId: string;
  passVersion: number;
  subSeed: number;
  dependencies: string[];
  ownedOutputs: string[];
  relaxations: string[];
};

export type GenerationPassEvidence = {
  passId: string;
  passVersion: number;
  inputHash: string;
  state: "CURRENT" | "STALE";
  staleReason?: string;
};

export type GenerationProgress = {
  passId: string;
  passVersion: number;
  stage: string;
  completedPasses: number;
  totalPasses: number;
  candidate: number;
  candidateCount: number;
};

export type GenerationProgressListener = (stage: string, progress: GenerationProgress) => void;
export type GenerationControl = { isCancelled?: () => boolean };

export class GenerationCancelledError extends Error {
  constructor() {
    super("Map generation was cancelled.");
    this.name = "AbortError";
  }
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([one], [two]) => one.localeCompare(two)).map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

export function generationInputHash(value: unknown) {
  return hashText(JSON.stringify(stableValue(value))).toString(16).padStart(8, "0");
}

export function deterministicPassSeed(rootSeed: string, passId: string, passVersion: number, candidate = 1) {
  return hashText(`${rootSeed}:${passId}:v${passVersion}:candidate-${candidate}`);
}

export function effortCandidateCount(effort: "STANDARD" | "THOROUGH" | "EXHAUSTIVE") {
  return effort === "EXHAUSTIVE" ? 12 : effort === "THOROUGH" ? 4 : 1;
}

export function generationPassEvidence(provenance: PassProvenance[], inputHash: string): GenerationPassEvidence[] {
  return provenance.map((entry) => ({
    passId: entry.passId,
    passVersion: entry.passVersion,
    inputHash,
    state: "CURRENT",
  }));
}

export function dependentPassIds(definitions: ReadonlyArray<GenerationPassDefinition>, changedPassIds: Iterable<string>) {
  const invalid = new Set(changedPassIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const definition of definitions) {
      if (invalid.has(definition.id) || !definition.dependencies.some((dependency) => invalid.has(dependency))) continue;
      invalid.add(definition.id);
      changed = true;
    }
  }
  return invalid;
}

export function passIdsOwningOutputs(definitions: ReadonlyArray<GenerationPassDefinition>, outputs: Iterable<string>) {
  const requested = new Set(outputs);
  return definitions.filter((definition) => definition.ownedOutputs.some((output) => requested.has(output))).map((definition) => definition.id);
}

export function invalidatePassEvidence(
  evidence: ReadonlyArray<GenerationPassEvidence> | undefined,
  changedPassIds: Iterable<string>,
  reason: string,
  definitions: ReadonlyArray<GenerationPassDefinition> = GENERATION_PASS_DEFINITIONS,
) {
  const invalid = dependentPassIds(definitions, changedPassIds);
  return (evidence ?? definitions.map((definition) => ({ passId: definition.id, passVersion: definition.version, inputHash: "", state: "CURRENT" as const }))).map((entry) => invalid.has(entry.passId)
    ? { ...entry, state: "STALE" as const, staleReason: reason }
    : { ...entry });
}

export class GenerationPassSession {
  readonly definitions: GenerationPassDefinition[];
  readonly inputHash: string;
  readonly candidateCount: number;
  readonly rootSeed: string;
  readonly listener?: GenerationProgressListener;
  readonly control?: GenerationControl;
  #byId: Map<string, GenerationPassDefinition>;
  #completed = new Set<string>();
  #active: string | null = null;
  #provenance: PassProvenance[] = [];

  constructor(
    definitions: GenerationPassDefinition[],
    rootSeed: string,
    input: unknown,
    effort: "STANDARD" | "THOROUGH" | "EXHAUSTIVE",
    listener?: GenerationProgressListener,
    control?: GenerationControl,
  ) {
    this.rootSeed = rootSeed;
    this.listener = listener;
    this.control = control;
    this.definitions = definitions.map((definition) => ({ ...definition, dependencies: [...definition.dependencies], ownedOutputs: [...definition.ownedOutputs] }));
    this.#byId = new Map(this.definitions.map((definition) => [definition.id, definition]));
    if (this.#byId.size !== this.definitions.length) throw new Error("Generation pass identifiers must be unique.");
    for (const definition of this.definitions) {
      for (const dependency of definition.dependencies) if (!this.#byId.has(dependency)) throw new Error(`Generation pass ${definition.id} depends on unknown pass ${dependency}.`);
    }
    this.inputHash = generationInputHash(input);
    this.candidateCount = effortCandidateCount(effort);
  }

  get completed() {
    return new Set(this.#completed);
  }

  checkCancelled() {
    if (this.control?.isCancelled?.()) throw new GenerationCancelledError();
  }

  progress(passId: string, stage: string, candidate = 1) {
    this.checkCancelled();
    const definition = this.#byId.get(passId);
    if (!definition) throw new Error(`Unknown generation pass: ${passId}.`);
    if (this.#active && this.#active !== passId) this.complete(this.#active);
    const missing = definition.dependencies.filter((dependency) => !this.#completed.has(dependency));
    if (missing.length) throw new Error(`Generation pass ${passId} started before dependencies completed: ${missing.join(", ")}.`);
    this.#active = passId;
    this.listener?.(stage, {
      passId,
      passVersion: definition.version,
      stage,
      completedPasses: this.#completed.size,
      totalPasses: this.definitions.length,
      candidate,
      candidateCount: this.candidateCount,
    });
  }

  complete(passId: string, relaxations: string[] = [], candidate = 1) {
    this.checkCancelled();
    if (this.#completed.has(passId)) return;
    const definition = this.#byId.get(passId);
    if (!definition) throw new Error(`Unknown generation pass: ${passId}.`);
    const missing = definition.dependencies.filter((dependency) => !this.#completed.has(dependency));
    if (missing.length) throw new Error(`Generation pass ${passId} completed before dependencies: ${missing.join(", ")}.`);
    this.#completed.add(passId);
    if (this.#active === passId) this.#active = null;
    this.#provenance.push({
      passId,
      passVersion: definition.version,
      subSeed: deterministicPassSeed(this.rootSeed, passId, definition.version, candidate),
      dependencies: [...definition.dependencies],
      ownedOutputs: [...definition.ownedOutputs],
      relaxations: [...relaxations],
    });
  }

  finish() {
    if (this.#active) this.complete(this.#active);
    const missing = this.definitions.filter((definition) => !this.#completed.has(definition.id));
    if (missing.length) throw new Error(`Generation pass graph did not complete: ${missing.map((definition) => definition.id).join(", ")}.`);
    return this.#provenance.map((entry) => ({ ...entry, dependencies: [...entry.dependencies], ownedOutputs: [...entry.ownedOutputs], relaxations: [...entry.relaxations] }));
  }
}
