# tgit v0.2.0 specification

This document specifies v0.2.0, which builds on v0.1.0. Everything that worked in v0.1.0 must keep working. Read `AGENTS.md` first.

"Output must match" means that standard output must be identical to the real git's, character for character, under the fixed test environment described in `AGENTS.md`. Exit codes must always match.

## 1. Diffs

Implement unified diff output that matches the real git **with its default settings**, including how hunks are placed and separated. Investigate the real git's default diff algorithm and heuristics, record them in `docs/notes/`, and then implement them.

Header lines must match: `diff --git`, `new file mode`, `deleted file mode`, `old mode` / `new mode`, `index`, `---`, `+++`, and `@@` (including the function name the real git shows after it). Files without a trailing newline (`\ No newline at end of file`), binary files (`Binary files ... differ`), and empty files are shown as the real git shows them.

### `diff`

Forms: `diff` (working tree vs. index), `diff --cached` (index vs. HEAD, including when there are no commits yet), and `diff <commit> <commit>`. Option: `--name-only`. Output must match.

### `show`

`show <commit>` displays the commit and its patch. Output must match, including for the root commit.

## 2. Merging

### `merge-base`

`merge-base <commit> <commit>`, for histories where the two commits have a single best common ancestor. Output must match.

### `merge`

Forms: `merge <commit>` and `merge -m <message> <commit>`.

- A fast-forward is made when possible; otherwise a three-way merge creates a merge commit. The default merge commit message matches the real git.
- "Already up to date" is handled like the real git.
- On conflict, the following match the real git: the conflict markers in the working tree, the index stages 1 to 3, `MERGE_HEAD`, `MERGE_MSG`, and the exit code. This applies to changes on both sides of the same lines, and to a file added on both sides with different contents.
- After a conflict, the user can resolve, `add`, and run `commit --no-edit` (or `commit -m <message>`) to create the merge commit.
- A merge that would overwrite uncommitted local changes fails without changing anything.

## Done criteria

- `npm test`, `npm run difftest`, and every other check listed in `AGENTS.md` pass.
- The random differential tests for v2 pass with `--count 500` for at least three different seeds.
- `docs/progress.md` is updated.
- The release is tagged `v0.2.0`.
