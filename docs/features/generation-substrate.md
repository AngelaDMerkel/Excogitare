# Generation Substrate

## Contract

- **Status:** Verified. The shared runtime substrate, dependency-aware evidence model, deterministic effort budgets, worker cancellation boundary and user-facing stale-state disclosure are implemented and verified.
- **User outcome:** Every authored map can be reproduced, migrated and inspected through one deterministic generation contract. Long work remains responsive and cancellable, and derived reports never masquerade as current evidence after their inputs change.
- **Scope:** Frozen schemas, recipe normalization, migrations, deterministic pass graph, worker protocol, provenance, retained semantic identities, cloning and derived-evidence invalidation.
- **Dependencies:** Existing Civ5Map parsing, the four generation engines and the ownership decisions in [`narrative-generation-rewrite.md`](narrative-generation-rewrite.md).
- **Exclusions:** This record does not implement Narrative Map Type algorithms, Create screens, project bundle encoding or Scenario editors. It supplies their shared substrate.

## Authoritative model

The frozen persisted names are `ExcogitareProject`, `ProjectManifest`, `GenerationRecipe`, `MatchIntent`, `ProtectionState`, `TileProtectionMask`, `SemanticProtection`, `ScenarioDraft`, `ProjectHistory`, `ProjectHistoryEntry`, `ProjectEditorState` and `PassProvenance`. Every persisted root uses `schemaVersion`; conceptual type names do not receive version suffixes.

`GenerationRecipe` is the only authority for active generation intent. `GenerationStructure`, `SemanticLineage`, assessments and reports are derived caches with an input hash, generator version and pass versions. A stale cache is invalidated visibly rather than read as current evidence.

Current `MapGenerationOptions` values require a pure migration into `GenerationRecipe`. Unknown future required fields reject; known legacy defaults migrate visibly and deterministically.

## Deterministic pass graph

- Every pass declares its stable ID, version, dependencies, owned outputs and invalidation inputs.
- Passes receive deterministic sub-seeds derived from the recipe seed and pass ID.
- Scheduling, worker count and machine speed cannot change the result.
- Standard, Thorough and Exhaustive effort use fixed candidate counts and comparison rules, not elapsed-time cutoffs.
- Later changes invalidate only dependent passes; they cannot silently rebuild topology when the dependency graph says otherwise.
- Candidate generation keeps the current valid map until a complete lawful replacement exists.

## Worker and failure behavior

Workers emit structured pass/candidate progress. The browser cancels an active run by terminating its isolated worker, which provides an immediate boundary even while a synchronous engine pass is calculating; the domain session additionally checks cooperative cancellation at every pass and candidate boundary. Failure or cancellation preserves the current project and reports the failing pass. A worker exception cannot partially install a recipe, map, structure or history entry.

The worker result is presently a structured Civ5Map object graph rather than exposed typed-array payloads, so there is no large transferable result buffer to transfer without changing that public representation. Internal engine arrays remain inside the worker and are released with it. If a future worker protocol introduces typed-array result payloads, transfer rather than cloning becomes a required migration gate.

Colossal and Exhaustive combinations require memory estimates and warnings. Simplified mobile generation is restricted by the Create workflow record rather than silently changing effort inside the worker.

## Integration requirements

- Cloning covers every authored and derived field without shared mutable arrays.
- Randomise returns a complete normalized recipe before generation begins.
- Imported Civ5Map files receive an import-origin recipe or explicit absence of reproducible generation intent; fabricated provenance is prohibited.
- History records the recipe, pass versions, sub-seeds, relaxations and input hashes used for each result.
- Civ5Map export remains independent of private project schemas.

## Completion gates

- [x] Frozen schema types and ownership implemented without duplicate authority.
- [x] Current recipes migrate through deterministic fixtures.
- [x] Pass graph, dependency-granular invalidation and sub-seeds implemented for all four engines.
- [x] Standard, Thorough and Exhaustive use fixed deterministic candidate counts and selection.
- [x] Worker progress, immediate termination, cooperative pass/candidate cancellation and atomic replacement verified; transferable result buffers are inapplicable to the current object-graph protocol and explicitly gated if that protocol changes.
- [x] Clone and history operations retain authored recipe/structure state without shared mutation at the current boundary.
- [x] Stale derived evidence invalidates by dependency and Review names both the cause and affected passes.
- [x] Randomise and imports produce honest normalized state.
- [x] Existing generation, Repair, Civ5Map export and view persistence regressions pass.
- [x] Type checking, lint, production build, Pages build and Alpine runtime pass.
- [x] README/help, feature register, request, diff and current code are reconciled at the present partial boundary.

## Current evidence

- 116 automated tests pass: 99 TypeScript domain tests and 17 rendered-shell checks.
- TypeScript checking and ESLint pass without warnings.
- The production Vinext build and GitHub Pages static build pass, including the Pages artifact verifier.
- The Node 24 Alpine image builds, starts and responds successfully over HTTP.
- The rendered interface checks cover version 1.3.0, all five Create stages, memory disclosure and the stale-evidence Review state.
