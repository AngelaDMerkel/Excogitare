# Manual Civ V Load Matrix

This manifest records manual game evidence that automated parsing and round trips cannot supply. A passing automated suite is not permission to mark a row as loaded in Civ V.

| Artifact class | Required representative | Current Phase 0 evidence | Rewrite use |
| --- | --- | --- | --- |
| Generated | Safe Standard map with majors and city states | Existing generated Scenario exports have prior feature-level game evidence; no new Phase 0 artifact was manually loaded. | Re-run after substrate and final hardening. |
| Edited | Imported map with tile and metadata edits | Existing import/export behavior is automated; no new Phase 0 artifact was manually loaded. | Re-run after project and editor integration. |
| Repaired | Imported map with repaired starts and rivers | Existing Repair features have prior game evidence; no new Phase 0 artifact was manually loaded. | Re-run after every Repair/Scenario writer change. |
| Game-Breaking | Extreme or Colossal map | Automated generation and round trip exist; game behavior remains explicitly risky. | Never convert Game-Breaking into a compatibility promise. |
| Scenario | First-boundary metadata, factions, cities, ownership, improvements and routes | Not yet implemented at the approved capability boundary. | Every representative must reach Read, Edit, Write and Game verified. |
| Project | Downloaded `.excogitare` reopened in a clean browser session and exported | Not yet implemented. | Verify project persistence independently of Civ V loading. |

For each future manual run, record date, Excogitare version, fixture ID, operating system, Civ V/mod configuration, whether the map appeared in setup, whether it loaded into play, observed corruption and the retained exported artifact hash. Do not add private user maps to the repository merely to satisfy this matrix.
