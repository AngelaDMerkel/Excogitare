# V3 main promotion

Status: **In progress**.

## Approved contract

The user approves V3 for main, explicitly approves making it the default homepage, authorizes discarding V2 changes, and requests semantic commits. Commit the approved generator and interface in coherent changes; keep the original V1 interface at `/legacy`. The V3 document remains directly available at `/v3/index.html`. Do not merge the V2 branch. Preserve a recoverable Git snapshot of its discarded pending files. No remote push or deployment is authorized by this local merge request.

V3's homepage must use the actual approved application, support the Pages `/Excogitare` prefix, retain same-origin workers/history/download behavior in its full-page document and load the approved favicon. Keep generation/export limitations unchanged. Verify rendered root and legacy routes, production and Pages assets, the full regression, lint/types and a real browser. Alpine is conditional on local Docker availability. Finish on a clean main checkout with the V3 branch retained, and reconcile this record with the actual merge.

## Preparation

- Origin main was fetched and remained at `85040b8`; it is an ancestor of the V3 branch.
- The generator was committed as `723d58c` (`feat(generation): add V3 planning and native landform pipeline`).
- The interface was committed as `2247246` (`feat(ui): deliver V3 Generate and Refine workspace`).
- Pending V2 work, including untracked files, was removed from the primary checkout using a Git stash named `archive(v2): preserve discarded work before approved V3 merge`. The V2 branch remains recoverable and is not a merge source.


## Entry-point implementation

The root returns an immediate HTML refresh to the existing V3 document, with an ordinary link fallback. It works in the production server and static Pages export, including the `/Excogitare` prefix, and requires no client-side routing script. V3 owns its full browser document, preserving its established worker, viewport and file-input behavior. The original interface moves to `/legacy`; no V2 studio code is adopted.


## Homepage verification

- Full domain regression: **311/311** pass. Rendered root/legacy checks: **24/24** pass. TypeScript, repository ESLint, production build, Pages build and the Pages asset verifier pass.
- Root opens `/v3/index.html` in production and `/Excogitare/v3/index.html` in the Pages export. The correct Wayfinder favicon is included at both prefixes. The exported `/Excogitare/legacy/` route loads the original Explore/Create/Scenario/Repair/Lab/Lua interface.
- Real browser generation worked through both homepage entries. The production preview created Orin Reach (two starting regions); the Pages preview created Namar Reach. Both were retained through navigation into the final direct-entry version. No new browser errors appeared after the direct-entry change. [Homepage capture](../../mockups/v3/main-homepage-preview.jpg).
- Docker's daemon socket is unavailable, so Alpine could not be rerun. Existing game/export limitations remain as documented.
- The user’s later semantic-commit and merge approval supersedes no-commit notes in earlier V3 work records. Remote push remains a separate authorization.

The homepage implementation is ready for the approved fast-forward merge. Final merge and checkout verification will be recorded after the operation.
