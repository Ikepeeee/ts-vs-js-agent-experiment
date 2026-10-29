# tgit v0.1.0 specification

`tgit` is a Git-compatible command-line tool. This document specifies the first release, v0.1.0. Read `AGENTS.md` first; it defines the language, project layout, compatibility rules, and testing rules that apply to everything below.

"Output must match" means that standard output must be identical to the real git's, character for character, under the fixed test environment described in `AGENTS.md`. Exit codes must always match.

## Non-goals

The following are out of scope for tgit: remote operations (`clone`, `fetch`, `pull`, `push`, `remote`), submodules, the `worktree` command, sparse checkout, hooks, writing packfiles, `gc`, `repack`, hash algorithms other than SHA-1, interactive operations (such as `add -p`), and rename detection.

## 1. Test infrastructure

Build the differential test runner and the random generator described in `AGENTS.md`.

### Scenario format

A scenario is a JSON file with a `name` and a list of `steps`. Every step is applied to both sides: the real-git side and the tgit side, each in its own temporary directory.

- `{ "write": "<path>", "content": "<text>" }` or `{ "write": "<path>", "contentBase64": "<base64>" }`: create or overwrite a file
- `{ "mkdir": "<path>" }`, `{ "delete": "<path>" }`, `{ "chmod": "<path>", "mode": "755" }`, `{ "symlink": "<path>", "target": "<target>" }`
- `{ "git": ["<arg>", ...] }`: run the **real** git on both sides (for setup)
- `{ "run": ["<arg>", ...] }`: run the real `git` on the real-git side and `tgit` on the tgit side, and compare them
  - Optional fields: `"cwd"` (a subdirectory to run in), `"stdin"`, `"env"` (extra environment variables, or `null` to unset one), `"matchOutput": true` (stdout must match exactly)

After every `run` step, compare the exit codes, stdout if `matchOutput` is set, and the repository state described in `AGENTS.md`. Before comparing, replace each side's temporary directory path with a placeholder such as `<ROOT>`. When there is a difference, print which step differed and how.

The runner must not pass vacuously: include a self-test that runs it against a deliberately broken fake `tgit` (for example, one that always exits 0 and prints nothing) and checks that differences are reported.

## 2. Command dispatch

- `tgit <command> [<args>]` dispatches to the command. An unknown command fails with the same exit code as the real git.
- Commands find the repository by searching from the current directory upward for `.git`, as the real git does. Running a command that needs a repository outside one fails with the real git's exit code.

## 3. Repository setup

### `init`

Options: no arguments, a directory argument (created if missing, including nested paths), `--bare`, `-b`/`--initial-branch`, `-q`.

- Output must match.
- `.git/HEAD` and the result of the real `git config --local --list` must match. Sample files that the real git creates (such as `hooks/` and `description`) are not required.
- Running `init` again on an existing repository behaves like the real git (reinitialization).
- The real git must be able to `add` and `commit` in a repository created by `tgit init`.

## 4. Objects

- Parse and serialize blob, tree, commit, and tag objects. Serializing a parsed object must reproduce the original bytes.
- Read and write loose objects (zlib-compressed, stored under `objects/xx/yyyy...`).
- Tree entries are ordered exactly as the real git orders them (note that directories sort as if their name ended with `/`). Modes are written as the real git writes them (`100644`, `100755`, `120000`, `40000`).

### `hash-object`

Options: `<file>...`, `-w`, `-t <type>`, `--stdin`. Output must match. Handles empty files, binary content, and large files. Invalid content for `-t commit` or `-t tree` fails like the real git.

### `cat-file`

Options: `-t`, `-s`, `-p`, `-e`, `<type> <object>`. Output must match. Objects are given as full 40-character IDs or as revisions supported by `rev-parse` (section 6).

## 5. The index and the working tree

- Read and write `.git/index` version 2. tgit reads an index written by the real git, and the real git reads an index written by tgit.
- `.gitignore` support in this version: the `.gitignore` at the repository root, with comments, blank lines, wildcards (`*.log`), directory patterns (`build/`), and anchored patterns (`/only-root`).
- Paths may contain spaces, non-ASCII characters, and leading `-`. Executable files and symlinks are supported.

### `add`

Options: paths, directories, `.`, `-A`, `-u`. Adding a path ignored by `.gitignore`, or a path that does not exist, fails like the real git. A file replaced by a directory with the same name (or the reverse) is handled like the real git.

### `rm`

Options: `--cached`, `-r`, `-f`. Removing a file with local changes fails without `-f`. Removing an untracked path fails.

### `ls-files`

Options: `-s`, `-c`, `-o`, `--exclude-standard`. Output must match.

### `status`

Options: `--porcelain`, `-s`, and the normal output. `--porcelain` output must match, covering untracked files, untracked directories (shown as `dir/`), staged additions, modifications and deletions, unstaged modifications and deletions, files both staged and modified again, ignored files (not shown), and repositories with no commits yet. For the normal output, only the exit code must match.

## 6. Commits and history

### `commit`

Options: `-m` (repeatable; each becomes a paragraph), `-a`, `--allow-empty`, `--amend`.

- The author and committer are taken from the `GIT_AUTHOR_*` and `GIT_COMMITTER_*` environment variables. Given the same inputs, commit hashes match the real git.
- `-a` stages modifications and deletions of tracked files, not untracked files.
- Committing with nothing to commit fails like the real git.
- Repositories after tgit commits pass the real `git fsck --strict`.

### References

Read and write HEAD (a symbolic ref, or a detached HEAD pointing at a commit), branches under `refs/heads/`, and tags under `refs/tags/`. Unborn branches are supported.

### `rev-parse`

Supports ref names, full and abbreviated object IDs, `~<n>`, `^`, combinations such as `main~1^`, `--short`, and `--abbrev-ref`. Output must match, including for invalid revisions and an unborn `HEAD`.

### `log`

Options: `--oneline`, `--format=<format>`, `-n <number>`, and path limiting (`-- <path>...`). `--format` supports `%H %h %T %P %an %ae %ad %s %b %n`. Output must match, including the default output and `log` on an unborn branch.

### `show`

Options: `-s` / `--no-patch` with a commit. Output must match.

### `branch`

List, create (at HEAD or at a given commit), `-d`, `-D`, `-m`. Listing output must match. Deleting an unmerged branch with `-d` fails. Renaming the current branch updates HEAD. Creating an existing branch fails.

### `switch` and `checkout`

`switch <branch>`, `switch -c <branch>`, `switch --detach <commit>`; `checkout <branch>`, `checkout <commit>`, `checkout -b <branch>`, `checkout -- <path>...`. Local changes that do not conflict are carried over; conflicting local changes make the command fail without changing anything, as in the real git.

### `reset`

`--soft`, `--mixed` (default), `--hard`, and `reset [<commit>] -- <path>...`. HEAD, the index, and the working tree end up as in the real git.

### `tag`

Lightweight tags only: create (at HEAD or at a given commit), list (sorted; output must match), `-d`. Creating an existing tag fails.

## Done criteria

- `npm test`, `npm run difftest`, and every other check listed in `AGENTS.md` pass.
- The random generator covers every command above and passes with `DIFFTEST_RUNS=1000` for at least three different seeds.
- `docs/progress.md` is updated.
- The release is tagged `v0.1.0`.
