# Feature Implementation Reference

A feature is complete only when its promised user outcome works across every applicable workflow. A control, type, diagnostic count or plausible-looking map is not completion by itself.

## Status vocabulary

- **Specified:** the contract and acceptance criteria are recorded.
- **In progress:** implementation is underway and at least one applicable gate remains open.
- **Implemented:** behavior and integration are complete; final verification may remain.
- **Verified:** acceptance tests, regressions and required builds/runtime checks pass.
- **Partial:** useful behavior exists, but named omissions remain.
- **Groundwork:** supporting types or controls exist without a complete user outcome.

## Completion gates

Every feature record must cover, or explicitly mark inapplicable:

1. Contract, acceptance criteria, failure behavior and exclusions.
2. Authoritative data model, defaults, Randomise, determinism, workers and cloning.
3. Actual domain behavior and edge cases—not merely controls or metadata.
4. Interface placement, explanations, modal confirmations and safe reset behavior.
5. Rendering/layer consequences where applicable.
6. Editing, history and selective-regeneration consequences where applicable.
7. Import/export/round-trip behavior where applicable.
8. Validation and Repair behavior, including destructive-action disclosure.
9. Feature-specific tests, regression suite, lint, type checking and builds.
10. README/help wording, risks, limitations and accurate completion claims.
11. Final comparison of request, feature record, diff and current code.

Runtime code changes also require the Alpine image/container check when the local runtime is available. Never commit or push for the user.

## Feature register

| Feature | Status | Approved scope | Open work |
|---|---|---|---|
| [Start-location correctness](features/start-location-correctness.md) | Implemented | Five-hex global separation; missing-major validation; slot-aware repair; Competitive whole-layout balance; restrained city states; Polis capacity degradation. | One unrelated 1.0.0 baseline regression remains: an extreme Pin/String region preset can omit `INLAND_SEA`. |
| [Extended tile budgets](features/extended-tile-budgets.md) | Implemented | Game-Breaking-gated Extreme 180×94 and Colossal 170×110 budgets, including Randomise and round trip. | One unrelated 1.0.0 baseline regression remains: an extreme Pin/String region preset can omit `INLAND_SEA`. |

## Claim audit

Before reporting completion, distinguish behavioral, integration, persistence, rendering and compatibility claims. State limitations whenever an applicable layer is absent. Passing a build proves compatibility, not correctness.
