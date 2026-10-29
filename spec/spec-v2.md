# tgit v0.2.0 specification

This document specifies v0.2.0, which builds on v0.1.0. Everything that worked in v0.1.0 must keep working. Read `AGENTS.md` first.

"Output must match" means that standard output must be identical to the real git's, character for character, under the fixed test environment described in `AGENTS.md`. Exit codes must always match.

## 1. Diffs

Implement unified diff output that matches the real git **with its default settings**, including how hunks are placed and separated. Investigate the real git's default diff algorithm and heuristics, record them in `docs/notes/`, and then implement them.

Header lines must match: `diff --git`, `new file mode`, `deleted file mode`, `old mode` / `new mode`, `index`, `---`, `+++`, and `@@`. Files without a trailing newline (`\ No newline at end of file`), binary files (`Binary files ... differ`), empty files, and CRLF line endings are shown as the real git shows them.

### `diff`

Forms: `diff` (working tree vs. index), `diff --cached` (index vs. HEAD, including when there are no commits yet), `diff <commit> <commit>`, and path limiting (`-- <path>...`). Options: `--stat`, `--name-only`, `--name-status`. Output must match. For `--stat`, the terminal width is taken from `COLUMNS` as in the real git.

### `show` and `log -p`

`show <commit>` (with the patch) and `log -p` display diffs. Output must match.

## 2. Configuration

### `config`

Get, set, `--unset`, and `--list`, for the repository-level configuration file (`.git/config`). Getting a key that does not exist fails like the real git. Values with spaces, quotes, and `#`, and subsections such as `[branch "main"]`, are read and written like the real git.

`commit` uses `user.name` and `user.email` from the configuration when the corresponding environment variables are not set (environment variables take precedence).

## 3. Ignore rules

Make ignore rules equivalent to the real git: negated patterns (`!keep.log`), `**` (`**/tmp`, `a/**/b`), `.gitignore` files in subdirectories (which take precedence over the root one), `.git/info/exclude`, trailing spaces, and escaped characters (`\#`, `\!`). All commands that consider ignored files follow these rules.

## 4. Merging

### Merge bases

Implement merge-base computation, including histories with more than one merge base (criss-cross). Investigate how the real git handles multiple merge bases, record it in `docs/notes/`, and then implement it.

### `merge-base`

`merge-base <commit> <commit>` and `--all`. Output must match.

### `merge`

Forms: fast-forward, `--no-ff`, `--ff-only`, a three-way merge, `-m <message>`, and `--abort`.

- The default merge commit message matches the real git.
- "Already up to date" is handled like the real git.
- `--ff-only` fails when a fast-forward is not possible.
- On conflict, the following match the real git: the conflict markers in the working tree, the index stages 1 to 3, `MERGE_HEAD`, `MERGE_MSG`, and the exit code. This applies to changes on both sides of the same lines, add/add, modify/delete, and binary files.
- After a conflict, the user can resolve, `add`, and `commit` to create the merge commit, or run `merge --abort` to restore the previous state.
- A merge that would overwrite uncommitted local changes fails without changing anything.

## 5. Annotated tags

`tag -a <name> -m <message>` creates a tag object. The tagger is taken from the `GIT_COMMITTER_*` environment variables. Tag object hashes match the real git, and `show <tag>` and `cat-file -p <tag>` output must match.

## 6. Stash

`stash push` (also `stash` with no subcommand), `stash pop`, `stash apply`, `stash list`, and `stash drop`.

- The structure of stash commits (their parents and trees) is the same as the real git's.
- `stash list` output must match.
- `pop` that conflicts with the working tree behaves like the real git. `apply` keeps the entry; `pop` removes it on success.

## Done criteria

- `npm test`, `npm run difftest`, and every other check listed in `AGENTS.md` pass.
- The random generator also creates branches, changes them, merges them (resolving conflicts by choosing one side), uses `diff`, `config`, annotated tags, and `stash`, and passes with `DIFFTEST_RUNS=1000` for at least three different seeds.
- `docs/progress.md` is updated.
- The release is tagged `v0.2.0`.
