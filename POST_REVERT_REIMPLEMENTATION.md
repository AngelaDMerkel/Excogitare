# Post-revert selective reimplementation runbook

Recreate only two approved groups after reverting to `8411399`:

1. Start-location and opening-population correctness.
2. Extreme and Colossal experimental tile budgets.

Use `0a23a9a` only as a donor for individually reviewed relevant hunks. Never cherry-pick it or copy whole files; it also contains rejected cross-engine geographic identities, shared climate/post-processing, world extremes and hierarchical rivers.

## Hard exclusions

- No `lib/geographic-identity.ts`, climate simulator, shared geographic identity/extreme/hierarchical-river pass or `worldExtremes` setting.
- No engine coastline, terrain, feature, resource, relief or river changes.
- No version change unless separately requested.

## Required behavior

- A shared `MINIMUM_START_DISTANCE = 5` governs major/major, major/city-state and city-state/city-state placement, validation, Repair and Polis.
- Missing major starts are validation errors.
- Parsed maps retain writable scenario player/city-state slot counts. Repair rebuilds missing starts only when such slots exist; otherwise it reports a blocking error and offers no false fix.
- Competitive Repair replaces the complete start layout with a deterministic, legal, more comparable layout.
- Stock-size city-state recommendations are 2, 4, 6, 8, 10 and 12; defaults and Randomise remain restrained.
- Ordinary generation and Polis reduce actual city-state/player counts when geography cannot fit the request legally.
- Extreme is 180×94 and Colossal is 170×110. Both are `gameBreaking`, hidden from Create/Lua and excluded from Randomise until the existing checkbox and second confirmation are accepted.
- Turning permission off normalizes unsafe size and geometry to Huge/Standard.
- Tests must cover exact dimensions, deterministic generation, binary round trip, unsafe filtering, all-engine start spacing, sparse capacity, missing-start Repair and Competitive whole-layout changes.
- Run domain/UI tests, lint/type checking, production/static builds and the Alpine runtime check. Reconcile feature records before claiming Verified.

Never commit or push on the user's behalf.
