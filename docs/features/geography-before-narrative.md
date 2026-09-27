# Geography before narrative

## Corrected contract

Status: **In progress**.

The user's 27 September correction is authoritative: players infer a world's possible history from its geography. The application builds and develops the physical landscape. It does not prescribe fictional events or generate written interpretations.

V2 wrongly implemented that relationship as an ordered event programme. Some foundations silently inserted a comet flood or thaw, and Create/Develop exposed event strength, age and position. This correction removes that mechanism from active generation and editing, rather than relabelling it.

## Requirements

- New recipes describe geographic foundations, physical conditions and gameplay intentions. Defaults, foundation selection and Randomise cannot insert fictional events.
- Native engines keep their geographic processes, fields and regional relationships. Local terrain, moisture and temperature edits describe the requested physical result. Climate, drainage, resources, protection and preview still apply.
- Foundation descriptions explain landforms and possible gameplay without assigning a fictional past. There is no event composer or generated lore panel.
- Map-operation provenance is distinct from a fictional history. User-written map names and descriptions remain available.
- Earlier V2 projects retain their accepted terrain, metadata, original bytes, protections and snapshots. Event-driven results become preserved geographic foundations; the old recipe and foundation remain archived. Earlier events cannot silently replay during later edits.
- Versions, draft recipes, candidate replay, validation, worker jobs and bundled starter data follow the corrected contract.

## Completion gates

- [x] Corrected contract and scope recorded before implementation.
- [ ] Authoritative recipe/world versions, defaults, Randomise and migration.
- [ ] Generation and local geographic development, including local temperature edits.
- [ ] Create, Develop, descriptions and operation provenance.
- [ ] Rendering, selection, protection, preview and snapshot behavior preserved.
- [ ] Project/import/export round trips and old-project geography preservation.
- [ ] Validation, failure handling and selected Repair retained.
- [ ] Domain tests, regressions, rendered interface, types, lint and builds.
- [ ] Alpine runtime check when available.
- [ ] README, earlier feature records, register and code reconciled.
- [ ] Final request/contract/diff comparison.

## Limits

The geographic processes remain cartographic approximations. This correction does not claim that any generated landscape conveys a particular history to human players, or that its multiplayer enjoyment is verified. Those require human review and Civ V play.
