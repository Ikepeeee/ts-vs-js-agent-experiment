# tgit v0.3.0 specification

This document specifies v0.3.0, which builds on v0.2.0. Everything that worked in v0.2.0 must keep working. Read `AGENTS.md` first.

"Output must match" means that standard output must be identical to the real git's, character for character, under the fixed test environment described in `AGENTS.md`. Exit codes must always match.

## 1. Applying and reverting commits

### `cherry-pick`

`cherry-pick <commit>` for a single commit, `--continue`, and `--abort`. A clean pick produces the same commit hash as the real git. On conflict, the working tree, the index, and the in-progress state match the real git; the user can resolve and run `--continue`, or run `--abort`. Picking a commit whose changes are already present behaves like the real git.

### `revert`

`revert <commit>` for a single commit, with `--no-edit`. The default message and the resulting tree match the real git.

## 2. Rebasing

### `rebase`

Non-interactive only: `rebase <upstream>`, `rebase --onto <newbase> <upstream>`, `--continue`, and `--abort`.

- Without conflicts, the resulting commit hashes match the real git.
- When a commit conflicts, the rebase stops in the same state as the real git; the user can resolve, `add`, and run `--continue`.
- `--abort` restores the branch and HEAD to their state before the rebase.
- Investigate how the real git stores in-progress rebase state, record it in `docs/notes/`, and then decide on the format.

## 3. Reflog

Write a reflog entry for HEAD and for the affected branch on every ref update (`commit`, `checkout`, `switch`, `reset`, `merge`, `cherry-pick`, `revert`, `rebase`, and branch creation and renaming), in the same format as the real git.

### `reflog`

`reflog` (equivalent to `reflog show HEAD`) and `reflog show <ref>`. Output must match.

## 4. Packed refs

- Read refs from `packed-refs`. A ref present both as a loose file and in `packed-refs` resolves like the real git.
- `pack-refs --all` writes `packed-refs` in the same format as the real git.
- Deleting a branch or tag that exists only in `packed-refs` works like the real git.

## 5. Packfiles

Read objects from packfiles: `.pack` files with `.idx` version 2, including `OFS_DELTA` and `REF_DELTA` objects and deep delta chains. Every command works on repositories whose objects are packed by the real `git gc`, or that mix packed and loose objects.

## Done criteria

- `npm test`, `npm run difftest`, and every other check listed in `AGENTS.md` pass.
- Every read-only command matches the real git on a repository with at least 500 commits after the real `git gc`, and again after `git -c repack.useDeltaBaseOffset=false repack -a -d -f`.
- The random generator covers every command, including starting from repositories that were `gc`-ed during setup, and passes with `DIFFTEST_RUNS=5000` for at least three different seeds.
- `docs/progress.md` is updated.
- The release is tagged `v0.3.0`.
