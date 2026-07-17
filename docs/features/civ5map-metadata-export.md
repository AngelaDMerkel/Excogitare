# Civ5Map metadata export

## Contract

- Status: Verified
- User outcome: Civ V displays the exported map name by itself rather than concatenating the description onto it.
- Scope: Fresh generated-map serialization, imported-map metadata updates, Unicode-safe parsing, scenario-offset preservation, binary round trips, documentation and runtime verification.
- Exclusions: Do not change the visible map name or description inside Excogitare. Do not strip a user's description merely to conceal a binary encoding error.
- Risk: Civ V metadata strings use byte counts and C-style termination together; changing only one side can shift every later section of the file.

## Requirements and evidence

| ID | Requirement | Verification | Status |
|---|---|---|---|
| META-01 | Exported names and descriptions have independent Civ V-compatible terminators. | Raw-byte assertion plus parse round trip. | Verified |
| META-02 | Stored header lengths include exactly the bytes consumed by each metadata section. | Offset and section-length assertions. | Verified |
| META-03 | Editing imported metadata preserves scenario starts and tile data. | Existing scenario fixture with new raw-byte checks. | Verified |
| META-04 | Unicode metadata remains intact. | UTF-8 name and description round trip. | Verified |

## Completion gates

- [x] Contract
- [n/a] Generation options, Randomise and determinism
- [x] Domain behavior and edge cases
- [n/a] Interface changes
- [n/a] Rendering and layers
- [x] Import/export round trip
- [n/a] Repair and validation
- [x] Feature-specific verification, regression suite, lint, builds and Alpine runtime
- [x] README wording and claims
- [x] Final reconciliation

## Verification evidence

- Working WorldBuilder exports on disk terminate both metadata fields and include the terminator in each stored byte length.
- Raw-byte tests cover edited imported metadata and newly generated Unicode metadata; both parse back without changing scenario starts.
- Type checking, ESLint, the production build, the GitHub Pages build and all 74 regressions pass.
- The Node 24 Alpine image rebuilt and the replacement container serves HTTP 200 on port 3001.
