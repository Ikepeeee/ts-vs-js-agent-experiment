# tgit v0.3.0 specification

This document specifies v0.3.0, which builds on v0.2.0. Everything that worked in v0.2.0 must keep working. Read `AGENTS.md` first.

"Output must match" means that standard output must be identical to the real git's, character for character, under the fixed test environment described in `AGENTS.md`. Exit codes must always match.

## 1. Tags

### `tag`

Create a lightweight tag (at HEAD or at a given commit), create an annotated tag with `tag -a <name> -m <message> [<commit>]`, list (sorted; output must match), and `-d`. Creating an existing tag fails.

- Tags live under `refs/tags/`, and tag names are accepted wherever a revision is.
- An annotated tag is a tag object. The tagger is taken from the `GIT_COMMITTER_*` environment variables, and tag object hashes match the real git.
- `cat-file` handles tag objects, and `show <tag>` of an annotated tag shows the tag and then its commit. Output must match.

## 2. Resetting

### `reset`

`reset [--soft | --mixed | --hard] [<commit>]` (`--mixed` and `HEAD` are the defaults). HEAD, the index, and the working tree end up as in the real git.

## 3. Applying and reverting commits

### `cherry-pick`

`cherry-pick <commit>` for a single commit, and `--abort`. A clean pick produces the same commit hash as the real git. On conflict, the working tree, the index, `CHERRY_PICK_HEAD`, and the exit code match the real git; `--abort` then restores the previous state.

### `revert`

`revert --no-edit <commit>` for a single commit whose revert applies without conflicts. The default message and the resulting tree match the real git.

## 4. Reflog

Write a reflog entry for HEAD and for the affected branch on every ref update (`commit`, `switch`, `branch` creation, `merge`, `reset`, `cherry-pick`, and `revert`), in the same format as the real git.

### `reflog`

`reflog` (equivalent to `reflog show HEAD`) and `reflog show <branch>`. Output must match.

## Done criteria

- `npm test`, `npm run difftest`, and every other check listed in `AGENTS.md` pass.
- The random differential tests for v3 pass with `--count 500` for at least three different seeds.
- `docs/progress.md` is updated.
- The release is tagged `v0.3.0`.
