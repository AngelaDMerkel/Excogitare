# Geography before narrative

## Corrected contract

Status: **Implemented**. Automated checks and the desktop worker flow pass. Alpine remains unverified because Docker's daemon is unavailable. Human interpretation and Civ V play remain empirical checks.

The user's 27 September correction is authoritative: players infer a world's possible history from its geography. The application builds and develops the physical landscape. It does not prescribe fictional events or generate written interpretations.

V2 wrongly implemented that relationship as an ordered event programme. Some foundations silently inserted a comet flood or thaw, and Create/Develop exposed event strength, age and position. This correction removes the programme from the active recipe, generation and development pipeline.

## Requirements

- New recipes describe geographic foundations, physical conditions and gameplay intentions. Defaults, foundation selection and Randomise cannot insert fictional events.
- Native engines keep their geographic processes, fields and regional relationships. Local terrain, moisture and temperature edits describe the requested physical result. Climate, drainage, resources, protection and preview still apply.
- Foundation descriptions explain landforms and possible gameplay without assigning a fictional past. There is no event composer or generated lore panel.
- Map-operation provenance is distinct from a fictional history. User-written map names and descriptions remain available.
- Earlier V2 projects retain their accepted terrain, metadata, original bytes, protections and snapshots. Event-driven results become preserved geographic foundations; the old recipe and foundation remain archived. Earlier events cannot silently replay during later edits.
- Versions, draft recipes, candidate replay, validation, worker jobs and bundled starter data follow the corrected contract.

## Completion gates

- [x] Corrected contract and scope recorded before implementation.
- [x] Authoritative recipe/world versions, defaults, Randomise and migration.
- [x] Generation and local geographic development, including local temperature edits.
- [x] Create, Develop, descriptions and operation provenance.
- [x] Rendering, selection, protection, preview and snapshot behavior preserved.
- [x] Project/import/export round trips and old-project geography preservation.
- [x] Validation, failure handling and selected Repair retained.
- [x] Domain tests, regressions, rendered interface, types, lint and builds.
- [ ] Alpine runtime: Docker's daemon socket is absent; no container result is claimed.
- [x] README, earlier feature records, register and code reconciled.
- [x] Final request/contract/diff comparison.

## Implementation and migration

Recipe/world schema 4 removes event programmes and the retired gameplay-motif fields. The foundation selector describes geographic conditions. Continental Shields and Ice Margins use their native Physical constructors directly. Randomise chooses physical and gameplay settings without adding story events. The old event compositor and its interface/CSS are removed.

Local Warm/Cool edits change temperature and compatible surface features. They do not excavate depressions or assert a meltwater history. Observed imported ice supplies a cold inferred field. The existing relief, moisture, drainage, placement, protection and preview systems remain in use. The operation ledger records actual generation/editing provenance.

Schema-3 worlds without event programmes retain their native substrate and replayable alternatives. Earlier event-driven maps become preserved editing baselines, with their native foundation and old authoring records archived. Source bytes, accepted map metadata, protection and snapshots are retained. Earlier Create/Develop drafts are archived and their physical controls migrate. Alternatives that require the retired event compositor are unavailable; accepted maps and snapshots remain intact. Schema-2 snapshots retain their existing migration path.

## Verification — 27 September 2026

- Complete working-tree TypeScript corpus: **313/313** passing, including **32 V2 tests**. Rendered interface: **25/25**. TypeScript, repository ESLint and whitespace checks pass.
- All nine foundations retain exact native tile output with one candidate and automatic development disabled. The new tests cover local ice changes, cooling reversal, protection, deterministic candidate replay, old-project migration and project/map round trips.
- The actual earlier schema-3 project fixture contains 960 tiles and 203 prior terrain changes. Migration preserves its full accepted map and physical fields, archived native substrate, protection, earlier snapshot and drafts. Subsequent temperature editing leaves its elevation intact.
- Vinext production and Next/webpack Pages builds pass. The Pages verifier reports **3 public files and 27 JavaScript bundles** for the working tree, which still includes pending unrelated legacy changes.
- The isolated commit snapshot also passes **32/32 V2 tests**, **24/24 rendered-interface tests**, TypeScript and the Vinext production build. Its legacy interface still contains Lua, so its rendered-test total differs from the working tree.
- In the production browser, an Ice Margins world generated through the worker. Warming a selected 61-tile water body produced a 15-tile difference preview; acceptance retained the previous map as a snapshot. Create and Develop show geographic controls without the former event composer. No browser errors were recorded.
- Docker could not connect to `/Users/duffy/.docker/run/docker.sock` because the socket does not exist.

## Limits

The geographic processes remain cartographic approximations. This correction does not claim that any generated landscape conveys a particular history to human players, or that its multiplayer enjoyment is verified. Those require human review and Civ V play.
