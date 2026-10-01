# Excogitare Working Agreement

Before implementing, extending, auditing, or claiming completion of a feature, read and follow [`docs/feature-implementation-reference.md`](docs/feature-implementation-reference.md).

- Add the feature to the reference document's register before substantial implementation.
- Track requirements and evidence through every applicable completion gate.
- Use **implemented**, **verified**, **partial**, and **groundwork** precisely.
- Reconcile the register and code before reporting completion.
- Preserve unrelated working-tree changes.
- Commit as you go: make a semantic commit on the active development branch after each coherent change has been checked, rather than accumulating completed work. Use Conventional Commit messages such as `feat(studio): ...`, `fix(generation): ...` and `docs: ...`.
- Stage only work belonging to the change, including its required dependencies. Preserve unrelated pending changes.
- Do not push unless the user explicitly asks.
