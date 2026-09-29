# V3 main promotion

Status: **Verified** for the local main promotion and its recorded checks.

## Approved contract

The user approves V3 for main, explicitly approves making it the default homepage, authorizes discarding V2 changes, and requests semantic commits. Commit the approved generator and interface in coherent changes; keep the original V1 interface at `/legacy`. The V3 document remains directly available at `/v3/index.html`. Do not merge the V2 branch. Preserve a recoverable Git snapshot of its discarded pending files. No remote push or deployment is authorized by this local merge request.

V3's homepage must use the actual approved application, support the Pages `/Excogitare` prefix, retain same-origin workers/history/download behavior in its full-page document and load the approved favicon. Keep generation/export limitations unchanged. Verify rendered root and legacy routes, production and Pages assets, the full regression, lint/types and a real browser. Alpine is conditional on local Docker availability. Finish on a clean main checkout and reconcile this record with the merge and subsequent branch cleanup.

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

## Merge completed

Main was fast-forwarded from `85040b8` to `7abdf7b`, containing the generator, interface and homepage semantic commits. The primary checkout is now on main. Its dependencies were installed from the frozen lockfile, and its production build, Pages build/asset verification and TypeScript check all pass. The checkout was clean before this final documentation update.

The normal localhost preview on port 3033 and the production preview on port 3035 now serve the primary main checkout. The temporary Pages server was stopped. The V3 branch received the verification update by fast-forward before the later cleanup recorded below.

V2 was not merged. Its committed history is retained by the local snapshot `archive(v2): preserve discarded work before approved V3 merge` provide recovery, while the primary checkout contains V3. No remote push or deployment was performed; origin/main remains unchanged by this task.

Contract, semantic history, main/V3 tree equality, working-tree cleanliness, dependencies, builds, browser entry points and documentation were reconciled. The earlier V3 export and empirical gameplay limits remain unchanged.


## Obsolete local branches retired

Following the user's cleanup request, the fully merged local `codex/v3-world-discovery` branch and discarded local `v2/map-studio` branch were deleted. The V3 worktree was archived through the managed worktree tool, preserving a recoverable snapshot. Its obsolete port-3034 preview was stopped first; the active previews on ports 3033 and 3035 continue to use main.

Only the primary main checkout remains active. The V2 stash retains its pending work and its former branch-tip ancestry. The GitHub `v2/map-studio` branch still exists; deleting that remote branch awaits explicit authorization under the no-push instruction. No remote V3 branch exists. This cleanup changes no application code.
