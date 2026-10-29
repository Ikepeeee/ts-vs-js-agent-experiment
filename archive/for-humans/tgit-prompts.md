# tgit implementation prompts (for humans only — do not put this in the repository)

Keep this file out of the repository. Give the AI only the "Prompt" of each step, one at a time, and hand over the next one only after the previous step is finished. The AI should not know what comes later; features are requested one at a time, as in ordinary development.

Give each prompt in a new conversation, after confirming the previous step is complete, so that no context carries over from earlier conversations.

How to confirm that a step is complete is described in `tgit-verification.md` (in Japanese).

## Notes for the human (do not tell the AI)

- Out of scope: remote operations, `mv`, submodules, the `worktree` command, sparse checkout, hooks, writing packfiles, `gc`, hash algorithms other than SHA-1, interactive operations, rename detection in diffs
- `mv` and SHA-256 support are reserved as change tasks for the experiment. If the AI starts building them on its own, stop it

---

## Step 1: Foundation and `init`

### Prompt

> Read `CLAUDE.md` before you start.
>
> 1. Set up `package.json`, `tsconfig.json` (following the constraints in `CLAUDE.md`), the ESLint configuration, and `.nvmrc`.
> 2. Create `src/main.ts`, `src/cli/`, and `src/commands/registry.ts`, and build the mechanism for registering commands and dispatching to them. Unknown commands must fail with the same exit code as the real git.
> 3. Build the differential test runner in `test/difftest/`, using the scenario format below. When there is a difference, print clearly which step differed and in what way.
> 4. Build a mechanism that generates random command sequences with fast-check.
> 5. Implement `init` (no arguments, a directory argument, `--bare`, `-b`/`--initial-branch`, `-q`).
>
> Before you start, record the version of the real git in `docs/notes/environment.md`.
>
> **Scenario format**
>
> A scenario is a JSON file with a `name` and a list of `steps`. Every step is applied to both sides: the real-git side and the tgit side.
>
> - `{ "write": "<path>", "content": "<text>" }` or `{ "write": "<path>", "contentBase64": "<base64>" }`: create or overwrite a file
> - `{ "mkdir": "<path>" }`, `{ "delete": "<path>" }`, `{ "chmod": "<path>", "mode": "755" }`, `{ "symlink": "<path>", "target": "<target>" }`
> - `{ "git": ["<arg>", ...] }`: run the **real** git on both sides (for setup that tgit does not support yet)
> - `{ "run": ["<arg>", ...] }`: run the real `git` on the real-git side and `tgit` on the tgit side, and compare them
>   - Optional fields: `"cwd"` (a subdirectory to run in), `"stdin"`, `"env"` (extra environment variables, or `null` to unset one), `"matchOutput": true` (stdout must match exactly)
>
> After every `run` step, compare the exit codes, stdout if `matchOutput` is set, and the repository state described in `CLAUDE.md`. Before comparing, replace each side's temporary directory path with a placeholder such as `<ROOT>`.
>
> **Required tests**
>
> - The runner must not pass vacuously. Add a self-test that runs the runner against a deliberately broken fake `tgit` (for example, one that always exits 0 and prints nothing) and checks that differences are reported for exit codes, output, objects, refs, the index, and working tree files.
> - `init` scenarios: an empty directory; a directory argument that does not exist yet (including nested paths); `--bare`; `-b` with a non-default name; `-q` (no output); running `init` twice in the same place; running `init` inside a subdirectory of an existing repository.
> - For `init`, compare stdout (`matchOutput`), `.git/HEAD`, the output of the real `git config --local --list` in both repositories, and the existence of `objects/`, `refs/heads/`, and `refs/tags/`. Files that the real git creates as samples (such as `hooks/` and `description`) do not need to match.
> - An unknown command must match the real git's exit code.

---

## Step 2: Reading and writing objects

### Prompt

> Implement reading and writing of objects.
>
> 1. Implement parsing and serialization of blob, tree, commit, and tag objects. The ordering of tree entries and the notation of modes must match the real git exactly.
> 2. Implement reading and writing of loose objects (zlib compression, stored under `objects/xx/yyyy...`).
> 3. Implement `hash-object` (`-w`, `-t`, `--stdin`) and `cat-file` (`-t`, `-s`, `-p`, `-e`, `<type> <object>`). Output must match. In this task, objects are referred to only by their full 40-character hexadecimal ID.
> 4. Confirm with differential tests that tgit's `cat-file` can read objects in a repository created by the real git.
>
> **Required tests**
>
> - Round-trip unit tests: for each of blob, tree, commit, and tag, take an object created by the real git, parse it, serialize it again, and check that the bytes are identical.
> - Trees with entries of modes `100644`, `100755`, `120000`, and `040000`, and with names whose sort order is easy to get wrong (`foo`, `foo.txt`, `foo-bar`, and a directory `foo/`).
> - Commits with multiple parents, multi-line messages, and messages without a trailing newline. Annotated tags created by the real git.
> - `hash-object` on: an empty file, a binary file containing NUL bytes, a file of at least 1 MB, a file with CRLF line endings, and input from `--stdin`. Use fast-check to generate random byte contents and check the hashes match.
> - `hash-object -t commit` and `-t tree` on invalid content, comparing exit codes.
> - `cat-file -e` on an object that does not exist, and `cat-file -p` on an invalid ID.
> - Objects written by `tgit hash-object -w` must be readable by the real `git cat-file -p` and pass `git fsck --strict`.

---

## Step 3: The index and the working tree

### Prompt

> Implement the commands that work with the index and the working tree.
>
> 1. Implement reading and writing of `.git/index` (version 2). tgit must be able to read an index written by the real git, and the real git must be able to read an index written by tgit.
> 2. Implement working tree traversal and `.gitignore` matching. The scope is simple patterns and directory patterns in the `.gitignore` at the repository root.
> 3. Implement `add` (paths, directories, `.`, `-A`, `-u`), `rm` (`--cached`, `-r`, `-f`), `ls-files` (`-s`, `-c`, `-o`, `--exclude-standard`), and `status` (`--porcelain`, `-s`, and the normal output). Output of `status --porcelain` and `ls-files` must match.
> 4. Add file creation, modification, deletion, mode changes, and symlinks to the random generator for the differential tests.
>
> **Required tests**
>
> - An index written by the real git (many entries, nested directories, an executable file, a symlink) is read by tgit, rewritten, and then accepted by the real `git ls-files -s` and `git status --porcelain` with the same results.
> - `add`: a new file, a modified file, a deleted file with `-A`, `-u` touching only tracked files, a whole directory, `.` run from a subdirectory, an executable bit change, a symlink, a path that does not exist, a path ignored by `.gitignore`, a file replaced by a directory with the same name.
> - `rm`: `--cached` keeps the file in the working tree; removing a file with local changes without `-f` fails; `-r` on a directory; removing an untracked path fails.
> - `status --porcelain` for each of these states, alone and combined: untracked file, untracked directory (shown as `dir/`), newly staged, staged modification, unstaged modification, staged and then modified again, deleted without staging, staged deletion, ignored file (not shown). All of these in a repository that has no commits yet.
> - `.gitignore`: wildcard patterns (`*.log`), directory patterns (`build/`), anchored patterns (`/only-root`), comments, and blank lines, checked with `ls-files -o --exclude-standard`.
> - The random generator applies random file operations interleaved with `add`, `rm`, `ls-files`, and `status`, and compares after every command.

---

## Step 4: Commits and history (v0.1.0)

### Prompt

> Implement the basic commit and history operations, and release them as v0.1.0.
>
> 1. Implement `commit` (`-m`, `-a`, `--allow-empty`, `--amend`). Take the author and dates from environment variables, and produce commits with the same hashes as the real git.
> 2. Implement reading and writing of HEAD (both as a symbolic ref and as a detached HEAD pointing directly at a commit), branches, and tag refs.
> 3. Implement `rev-parse` (ref names, abbreviated hashes, `~`, `^`, `--short`, `--abbrev-ref`).
> 4. Implement `log` (`--oneline`, `--format=<format>`, `-n`, path limiting) and `show -s` / `show --no-patch`. `--format` must support `%H %h %T %P %an %ae %ad %s %b %n`, and output must match.
> 5. Implement `branch` (list, create, `-d`, `-D`, `-m`), `switch` (`-c`, `--detach`), `checkout` (branch, commit, `-b`, `-- <path>`), `reset` (`--soft`, `--mixed`, `--hard`, path arguments), and `tag` for lightweight tags (create, list, `-d`). The output of `branch` and `tag` listings must match.
>
> When you are done, tag the release `v0.1.0`.
>
> **Required tests**
>
> - `commit`: the first commit; several `-m` options (paragraphs); `-a` picking up modifications and deletions but not untracked files; `--allow-empty`; committing with nothing to commit (must fail); `--amend` changing the message and the tree. Commit hashes must match.
> - Commits made with tgit pass the real `git fsck --strict`, and the real `git log` shows the same history.
> - `rev-parse`: `HEAD`, branch and tag names, `HEAD~2`, `HEAD^`, `main~1^`, `--short`, `--abbrev-ref HEAD` on a branch and on a detached HEAD, a revision that does not exist, and `HEAD` on an unborn branch.
> - `log`: every supported `--format` placeholder, `--oneline`, `-n`, path limiting that skips commits not touching the path, and `log` on an unborn branch.
> - `branch`: deleting an unmerged branch with `-d` fails and with `-D` succeeds; renaming the current branch with `-m` updates HEAD; creating a branch that already exists fails.
> - `switch` and `checkout`: switching with local changes that do not conflict carries them over; switching with conflicting local changes fails and changes nothing; `checkout -- <path>` restores from the index; detaching at a commit.
> - `reset`: the state of HEAD, the index, and the working tree after each of `--soft`, `--mixed`, and `--hard`; `reset <path>` unstages only that path.
> - `tag`: creating, listing (sorted), deleting, and creating a tag that already exists (must fail).
> - The random generator covers all commands implemented so far. Before tagging the release, run it with `DIFFTEST_RUNS=1000` and a few different seeds.

---

## Step 5: Diffs and configuration

### Prompt

> Implement diff output and configuration.
>
> 1. Implement unified diff output that matches the real git with its default settings, including how hunks are placed and separated, and the header lines (`diff --git`, `new file mode`, `deleted file mode`, `old mode`/`new mode`, `index`, `---`, `+++`, `@@`). Investigate the real git's default diff algorithm and heuristics, write them down in `docs/notes/`, and then implement them.
> 2. Implement `diff` (working tree vs. index, `--cached`, between two commits, path limiting, `--stat`, `--name-only`, `--name-status`). Output must match.
> 3. Make `show` and `log -p` display diffs. Output must match.
> 4. Implement the `config` command (get, set, `--unset`, `--list`, repository-level configuration). Make `commit` use settings such as `user.name` (environment variables take precedence).
> 5. Make `.gitignore` matching equivalent to the real git (negated patterns, `**`, `.gitignore` files in subdirectories, `.git/info/exclude`).
>
> **Required tests**
>
> - `diff`: a change in the middle of a file; several changes close enough to merge into one hunk and far enough apart to be separate hunks; added and deleted files; a mode change only; a file without a trailing newline (on either side); a binary file; an empty file; CRLF line endings; `--cached` in a repository with no commits; diff between two commits; path limiting.
> - Inputs where hunk placement is ambiguous, such as inserting a block next to an identical block, or inserting a function between functions that start or end with the same lines.
> - `--stat` with a fixed terminal width (set `COLUMNS`), including long file names and large change counts. `--name-only` and `--name-status`.
> - A property-based test: generate pairs of random file contents from a small set of lines (so that many lines repeat), and check that the diff output matches.
> - `config`: getting a key that does not exist (must fail); setting and unsetting; `--list` order; values with spaces, quotes, and `#`; subsections such as `[branch "main"]`. A scenario that unsets the author environment variables and checks that `commit` uses `user.name` and `user.email`.
> - `.gitignore`: negated patterns (`!keep.log`), `**/tmp`, `a/**/b`, a `.gitignore` in a subdirectory overriding the root one, `.git/info/exclude`, trailing spaces, and escaped characters (`\#`, `\!`).

---

## Step 6: Merging (v0.2.0)

### Prompt

> Implement merging, and release it as v0.2.0.
>
> 1. Implement merge-base computation and per-file three-way merging. The conflict marker format must match the real git. For the case of multiple merge bases, investigate how the real git behaves, write it down in `docs/notes/`, and then implement it.
> 2. Implement `merge-base` (including `--all`) and `merge` (fast-forward, `--no-ff`, `--ff-only`, three-way merge, the state left on conflict, `--abort`, `-m`). The index on conflict (stages 1 to 3) must also match the real git.
> 3. Implement annotated tags (`tag -a -m`, creating tag objects, displaying them with `show`).
> 4. Implement `stash` (`push`, `pop`, `apply`, `list`, `drop`). The structure of stash commits must be the same as the real git's.
>
> When you are done, tag the release `v0.2.0`.
>
> **Required tests**
>
> - `merge-base`: a linear history, two diverging branches, and a criss-cross history with more than one merge base (with and without `--all`).
> - `merge`: fast-forward; `--ff-only` when a fast-forward is not possible (must fail); `--no-ff` and its default message; a clean three-way merge; "Already up to date".
> - Conflicts: changes to the same lines on both sides; add/add; modify/delete; a binary file. For each, compare the conflict markers in the working tree, the index stages (`ls-files -s`), `MERGE_HEAD`, and `MERGE_MSG`. Then resolve and commit, and also `--abort`.
> - Merging when uncommitted local changes would be overwritten (must fail and change nothing).
> - A criss-cross merge, comparing the resulting tree and conflicts.
> - Annotated tags: the tag object hash (with the tagger taken from the environment), `show` output, and `cat-file -p`.
> - `stash`: with staged and unstaged changes; the parents and trees of the stash commit; `list` output; `pop` that conflicts with the current working tree; `drop`; `apply` keeping the entry.
> - The random generator creates branches, changes them, and merges them, including conflicts that it resolves by choosing one side.

---

## Step 7: Rewriting history and internal formats (v0.3.0)

### Prompt

> Implement history rewriting and support for the real git's internal formats, and release them as v0.3.0.
>
> 1. Implement `cherry-pick` (single commit, `--continue`, `--abort`) and `revert` (single commit, `--no-edit`).
> 2. Implement `rebase` (non-interactive: `<upstream>`, `--onto`, `--continue`, `--abort`). Investigate how the real git stores in-progress state before deciding on the format.
> 3. Write a reflog entry on every ref update, and implement the `reflog` command (display). Output must match.
> 4. Implement reading `packed-refs`, and `pack-refs --all`.
> 5. Implement reading packfiles (`.pack` and `.idx` version 2, OFS_DELTA and REF_DELTA), so that tgit can read repositories processed by the real `git gc`.
>
> When you are done, tag the release `v0.3.0`.
>
> **Required tests**
>
> - `cherry-pick`: a clean pick; a pick that conflicts, followed by `--continue` and, separately, `--abort`; a pick whose changes are already present.
> - `revert`: the default message and the resulting tree, with `--no-edit`.
> - `rebase`: onto an upstream with no conflicts (the resulting commit hashes must match); a conflict in the middle followed by `--continue`; `--abort` restoring the original state; `--onto`.
> - `reflog`: entries after `commit`, `checkout`/`switch`, `reset`, `merge`, and `rebase`.
> - `packed-refs`: after the real `git pack-refs --all`, tgit reads branches and tags; after `tgit pack-refs --all`, the real git reads them; deleting a branch that exists only in `packed-refs`.
> - Packfiles: a repository with at least 500 commits after the real `git gc`, on which every read-only command must match; the same after `git -c repack.useDeltaBaseOffset=false repack -a -d -f` (so that REF_DELTA is used); and a repository mixing packed and loose objects.
> - Before tagging the release, run the random generator with `DIFFTEST_RUNS=5000`, and also run the whole hand-written suite against a repository that was `gc`-ed before the scenario starts.
