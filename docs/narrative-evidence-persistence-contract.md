# Narrative Evidence Persistence — Contract 2C

## Status

The Phase 2 semantic-evidence envelope is verified. Its original authorization stopped at persistence and explicitly excluded runtime generation. Later approved phases—and now the [Narrative-native reconstruction](features/narrative-native-reconstruction.md)—extend the durable project boundary to runtime-attached owner-engine plans, named causes and bindings, invariant/content evidence and authored relaxations. The post-reconstruction complete corpus, project round trips and packaging matrix pass.

Neither the original nor extended project contract authorizes changing `.Civ5Map` payloads. Ordinary game export remains geography-only.

## Durable boundary

Narrative semantic evidence is optional derived project data. The active snapshot stores it in `derived/evidence.json`; retained generation-history entries and named checkpoints store independent copies in their existing snapshot payloads.

An evidence envelope contains:

- schema and extractor versions;
- `CURRENT`, `STALE` or `RECOMPUTED` lifecycle state;
- a deterministic source-map fingerprint;
- the immutable `NarrativeConstraintProgram`;
- the complete `NarrativeSemanticModel`, including supporting tile and object references;
- the corresponding `NarrativeProgramEvaluation`.

The authored map snapshot additionally retains the exact selected `NativeNarrativePlan`, adapter cause objects, native-invariant evidence, narrative-content evidence and five-axis Review result in its generation structure. These are cloned and round-tripped with the map rather than duplicated into the semantic envelope.

The fingerprint covers map dimensions, wrap behavior, semantically relevant tile fields, start locations and the retained strategic graph. Map names and descriptions are deliberately excluded, so metadata editing does not invalidate geographic evidence.

## Capability and compatibility

Projects containing any retained semantic evidence advertise `narrative-semantic-evidence-v1`. Projects containing a selected engine-native plan advertise the separate `narrative-native-plan-v1` capability, so an older reader cannot silently discard the causal plan while pretending to have opened the complete authoring project. Each capability is omitted when its corresponding payload is absent. A compact `CURRENT_AND_CHECKPOINTS` export does not advertise a capability merely because discarded ordinary history contained it.

Existing projects and bare Civ5Map imports load with evidence absent when they never contained retained generation structure. Absence is not silently converted into a historical verdict. Newly created projects from current generated maps do retain the current semantic envelope and native plan. A later deliberate analysis of an older import may create a `RECOMPUTED` envelope, which remains distinguishable from original generation evidence.

The ZIP bundle remains version 2 and the project root remains schema 1 because the payload is additive, optional and capability-labelled. Unsupported future evidence or extractor versions fail explicitly.

## Lifecycle

- `CURRENT` evidence must match the authored map fingerprint.
- `RECOMPUTED` evidence must also match the authored map, but records that the analysis was produced after the original generation.
- A semantically relevant map change produces `STALE` evidence with a required explanation.
- Before saving, the semantic extractor is rerun far enough to compare its deterministic model hash with the retained model. A direct tile mutation therefore cannot wrap an obsolete model in a newly labelled `CURRENT` envelope; both the retained structure and envelope become `STALE`.
- Stale evidence remains inspectable and exportable in a project, but cannot be treated as proof of the current map.
- Restoring a history entry or checkpoint restores its independent evidence state.
- History, checkpoint and active evidence copies are alias-safe.

The Create project exporter reconciles current evidence against the authored map before writing. A newly generated map replaces an earlier project's obsolete derived structure rather than allowing that old native plan to be reattached on import. Named checkpoints capture the reconciled state. Metadata-only renaming leaves current evidence current.

## Integrity and failure handling

Validation rejects:

- unknown envelope, program, semantic-model, evaluation or extractor versions;
- undeclared evidence capabilities or declared capabilities without a payload;
- altered program and evaluation hashes;
- evaluations linked to a different program, profile or semantic model;
- duplicate constraints, semantic objects or findings;
- unknown relaxation, constraint, object or metric references;
- out-of-bounds supporting tiles;
- structurally malformed current, stale or recomputed evidence;
- unsafe, oversized or corrupt project archives through the existing transactional ZIP reader.

Malformed evidence fails before a parsed project is returned, so application import retains the active map on error. A well-formed current envelope whose authored map was changed directly is downgraded to `STALE` with an explanation before serialization; it is never silently recomputed from the obsolete semantic model.

## Game-file boundary

Ordinary `.Civ5Map` serialization remains unchanged. Programs, native plans, semantic objects, evaluations, lifecycle state, project capabilities and preview start plans are never written into the game file.

## Verification

The original Phase 2 persistence base reached its own verified checkpoint, including project validation, lifecycle round trips and the then-current lint, regression, rendered-shell, production, Pages and Alpine checks. Those historical packaging results do not verify the later reconstruction-specific payloads.

Current focused reconstruction evidence establishes that:

- TypeScript and the focused Contract 2B/2C and project suites pass;
- current, history and checkpoint evidence round-trip without aliases;
- imported, legacy and compact projects omit capabilities when the corresponding retained payload is absent;
- recomputed and stale states survive round-trip;
- semantic fingerprints round-trip for Excogitare, Eccentric, Physical and Polis, including retained strategic graphs;
- corrupt hashes, future versions and dangling references are rejected, while well-formed current-map mismatches are explicitly downgraded to stale;
- obsolete active structures are replaced, current generated maps from all four owner engines retain their exact native plan, and STARTS worker transport preserves the full recipe; and
- ordinary Civ5Map bytes remain unchanged by project-only plans and evidence.

The complete current regression, lint, rendered-interface, production, Pages/static-export and Node 24 Alpine matrix passes and remains documented by the verified scoped reconstruction record.
