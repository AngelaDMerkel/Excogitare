# Narrative Constraint Program — Contract 2A

## Status

The compiler contract and its focused schema tests are verified. Phase 2 originally authorized only the neutral schema and deterministic compiler foundation; later approved phases now consume that contract in semantic extraction, evaluation, project persistence and owner-engine adaptation. The native runtime integration is implemented, but its whole-suite and packaging verification remains owned by the in-progress reconstruction record.

## Purpose

A `NarrativeConstraintProgram` is an immutable semantic description of a Narrative Map Type. It records what relationships make the identity recognisable without prescribing a completed silhouette, tile mask, coordinate layout or engine-specific construction method.

The program is compiled deterministically from:

- an approved Map Type contract definition;
- the selected Map Type and owning engine;
- Scale and map dimensions;
- wrap behavior;
- explicit water, mountain, river and population settings;
- Match Intent relevant to later gameplay constraints.

The seed is deliberately excluded. A seed may alter an engine's later realization, but it cannot alter the meaning of the contract.

## Authority order

1. Civ V structural and placement legality.
2. User protection.
3. Explicit user controls.
4. Accessibility, valid hydrology and legal settlement capacity.
5. Essential Map Type relationships.
6. World Character interpretation.
7. World Modifier complications.
8. Narrative preferences and ornament.

The compiler reports conflicts with explicit controls but never changes those controls.

## Required structure

The versioned program contains:

- stable profile identity, owning engine, narrative verb and Scale;
- recognition statement and nearest-confusion identities;
- the exact explicit inputs relevant to negotiation;
- accepted and preferred water, mountain and river envelopes;
- essential, preferred and prohibited semantic constraints;
- stable roles and semantic keys without tile locations;
- an ordered, named relaxation plan;
- evidence requirements linked to stable constraint identifiers;
- recorded explicit-control conflicts;
- a deterministic input hash.

Constraints may describe map-wide, entity, relationship or gameplay semantics. Contract 2B will define the approved semantic vocabulary and measurements.

## Immutability and determinism

- The compiler returns a deeply frozen program.
- Every input collection is defensively copied.
- Constraint, relaxation and evidence identifiers are unique.
- Compilation contains no random calls, timestamps or seed-derived values.
- Equivalent semantic inputs produce byte-equivalent JSON and the same input hash.
- Invalid or future schema versions fail rather than being guessed.

## Failure behavior

The compiler rejects:

- a definition for a different Map Type or engine;
- an empty essential identity;
- duplicate identifiers;
- relaxation steps that reference unknown or non-relaxable constraints;
- evidence requirements that reference unknown constraints;
- malformed ranges, weights or tolerances;
- tile masks, tile indices, coordinates or other exact geometry hidden in the neutral contract.

An explicit control outside the preferred narrative envelope is not a compiler error. It is retained exactly and recorded as an identity conflict for later negotiation.

## Runtime boundary

The programme is attached to generated maps, retained in downloaded projects and consumed through engine-specific adapters. It remains engine-neutral and contains no tile geometry. The semantic evaluator remains read-only. A separate deterministic negotiation orchestrator may respond to failed evidence by retrying the native grammar with an explicitly named, ordered, constraint-linked relaxation; the evaluator neither authorizes nor applies that change.

## Verification

- The original contract checkpoint passed TypeScript, targeted lint and immutable, deterministic, seed-independent compiler tests.
- Current reconstruction tests retain those compiler properties; the complete TypeScript corpus and repository lint pass in the final reconstruction matrix.
- Invalid, dangling, non-relaxable and tile-specific definitions are rejected.
- Explicit control conflicts are retained without mutating the recipe.
- Native-generation and project-evidence fixtures remain deterministic. Final hardening and deliberate review are complete; the retained baseline digest begins `e6dae37…`.
