# tgit verification procedure (for myself; not kept in the repository)

Japanese version: `tgit-verification_ja.md`. This English version is canonical; where the two differ, this one prevails.

A procedure for checking each step by hand when it finishes, instead of trusting the AI's "done" report. Do it somewhere other than the AI's workspace, in the same order every time.

- "1. Checks for every step" is done at every step
- "2. Checks per step" tries the features added in that step by hand, from a different angle than the tests
- Results go into "3. Verification log". The next step's verification looks at the diff from the commit in the previous entry

---

## 0. Preparation (once, at the start)

```bash
# Create a place for verification, separate from the AI's workspace
mkdir -p ~/verify && cd ~/verify
git clone <the tgit repository> tgit

# Make tgit callable by a short name (run in every new shell)
# A function rather than an alias works reliably inside loops and <( )
tgit() { node ~/verify/tgit/src/main.ts "$@"; }

# Fix the author and dates for comparisons (run in every new shell)
export GIT_AUTHOR_NAME=Test GIT_AUTHOR_EMAIL=test@example.com GIT_AUTHOR_DATE="1767225600 +0000"
export GIT_COMMITTER_NAME=Test GIT_COMMITTER_EMAIL=test@example.com GIT_COMMITTER_DATE="1767225600 +0000"
export TZ=UTC LANG=C
```

- Check that `git --version` matches the version recorded in `docs/notes/environment.md`. If it differs, make them match before verifying
- Check that the Node.js version matches `.nvmrc` (`node --version`)

---

## 1. Checks for every step

### 1-1. Get the latest state in a clean environment

```bash
cd ~/verify/tgit
git fetch && git checkout <branch to verify> && git pull
git status                         # no leftover changes
rm -rf node_modules && npm ci      # reinstall the dependencies
```

### 1-2. Run the four commands yourself

```bash
npm test && npm run difftest && npm run typecheck && npm run lint
echo "result: $?"                  # must be 0
```

If any one of them fails, the step fails right there.

### 1-3. Run the differential tests with different random seeds

Run with seeds other than the ones the AI checked, to see whether the implementation fits only particular seeds.

```bash
for i in 1 2 3; do
  DIFFTEST_SEED=$RANDOM DIFFTEST_RUNS=2000 npm run difftest || echo "failed (see the seed in the output above)"
done
```

- Record the seeds used in the verification log
- If it fails, note the seed shown and the minimized reproduction

### 1-4. Check that the tests have not been weakened

```bash
PREV=<the commit verified last time>   # the first time, the repository's first commit

# List of changes to the tests
git diff --stat $PREV HEAD -- test/

# Look only at deleted lines (expected values rewritten, tests deleted)
git diff $PREV HEAD -- test/ | grep '^-' | grep -v '^---'

# Anything that skips tests
grep -rnE "\.skip|\.only|\.todo|skip:|todo:" test/

# Whether the number of handwritten scenarios went down (compare with the previous entry)
ls test/difftest/scenarios | wc -l
```

- If deleted lines contain expected values or scenario contents, ask why. If there is no reason, send it back
- **Check for yourself that the tests actually work:** on a working branch, break the implementation on purpose in one place (for example, change one character of an output) and confirm that `npm run difftest` fails. Then throw the branch away

```bash
git switch -c verify-break
# change one character of an output added in this step, somewhere in src/
npm run difftest   # must fail
git switch - && git branch -D verify-break
```

### 1-5. Check for branches that exist only for the tests

```bash
# Environment variables the implementation reads
grep -rn "process.env" src/

# Test-aware names in the implementation
grep -rniE "difftest|DIFFTEST|NODE_ENV|\bCI\b|fast-check" src/
```

- Environment variables the real git also reads, such as `GIT_AUTHOR_*`, `GIT_COMMITTER_*`, `HOME` and `TZ`, are fine
- Anything that behaves differently depending on whether tests are running is sent back

### 1-6. Check the technical constraints

```bash
# No runtime dependencies (prints nothing or {})
node -e "console.log(require('./package.json').dependencies ?? '')"

# The dev dependencies are exactly the five decided ones
node -e "console.log(Object.keys(require('./package.json').devDependencies))"

# Syntax that does not run with types merely erased, or any
grep -rnE "\benum\b|\bnamespace\b|import .* = require|: any\b|as any|<any>" src/

# tsconfig settings
grep -nE "erasableSyntaxOnly|verbatimModuleSyntax|\"strict\"|noUncheckedIndexedAccess" tsconfig.json

# Runs directly without a build
node src/main.ts init /tmp/tgit-smoke && rm -rf /tmp/tgit-smoke
```

### 1-7. Check the structural rules

```bash
# Commands do not import each other (no file in commands/ is read except by registry.ts)
grep -rnE "from '\./|from \"\./" src/commands/ | grep -v registry.ts

# Shared code does not depend on commands or the CLI
grep -rnE "commands/|cli/" src/core/
```

### 1-8. Check that no unrequested features were added

```bash
# Registered commands (only those requested up to this step)
cat src/commands/registry.ts

# Signs of features reserved for the experiment or out of scope
grep -rniE "sha-?256|object-format|\bmv\b|remote|fetch|push|clone|submodule|worktree add" src/
```

- If anything related to `mv`, SHA-256 or remote operations turns up, stop right away and have it removed

### 1-9. Check the records and commits

```bash
git log --oneline $PREV..HEAD        # small units, one line in English
git diff $PREV HEAD -- docs/         # progress.md and notes/ updated
```

- `docs/progress.md` says what was done and the known differences from the real git
- `docs/notes/` has notes on the behavior investigated (required in steps whose prompt asked for investigation)

### 1-10. Try it by hand

Do the matching step in "2. Checks per step".

### 1-11. Pass or fail, and how to send it back

If 1-2 through 1-10 all look fine, the step passes. When it fails, **give only the facts, not how to fix it**. In a new conversation, use a message like this:

```text
The following problem was found in commit <hash>.

<paste the failing scenario or steps, and the difference between the real git's and tgit's output, as is>
(Seed: <seed>, runs: <runs>)

Fix the implementation so that this case matches the real git. Do not change existing tests.
Add this case as a new scenario.
```

If the tests were weakened, show that diff and have it reverted.

---

## 2. Checks per step

### Prepare a repository of real data (used in steps 2–6)

tgit's own development history serves as real data. Until step 6, tgit cannot read packfiles, so every object is unpacked into loose objects.

```bash
cd ~/verify && rm -rf self
git clone ~/verify/tgit self && cd self
mkdir -p ../packs && mv .git/objects/pack/pack-* ../packs/ 2>/dev/null
for p in ../packs/*.pack; do [ -e "$p" ] && git unpack-objects -q < "$p"; done
rm -rf ../packs
git fsck                            # no errors
```

Recreate this repository before each step's verification, since tgit's history keeps growing.

### Step 1: foundation and `init`

```bash
cd /tmp && rm -rf a b
tgit init a; git init b
# Same config?
diff <(git -C a config --local --list) <(git -C b config --local --list) && echo match

# Can the real git use a repository tgit created?
cd a && git commit --allow-empty -m test && git log --oneline && git fsck --strict; cd ..

# Exit code of an unknown command
tgit nosuchcommand; echo $?; git nosuchcommand; echo $?
```

- Check by name that the differential tests' self-test (a test confirming a broken tgit produces differences) exists and runs in `npm test`

### Step 2: reading and writing objects

```bash
# Do the hashes match (text, empty, binary)?
printf 'hello\n' | git hash-object --stdin; printf 'hello\n' | tgit hash-object --stdin
: > empty;          git hash-object empty;  tgit hash-object empty
head -c 2000000 /dev/urandom > r.bin; git hash-object r.bin; tgit hash-object r.bin

# Read every object of the real data with the real git and with tgit, and compare
cd ~/verify/self
for o in $(git rev-list --objects --all | cut -d' ' -f1); do
  cmp -s <(git cat-file -p "$o") <(tgit cat-file -p "$o") || echo "differs: $o"
done
echo done                            # no "differs:" lines at all
```

### Step 3: index and working tree

```bash
cd /tmp && rm -rf s && git init -q s && cd s
cp -r ~/verify/tgit/src . && git add . && git commit -qm base

# Create various states by hand
echo x >> src/main.ts                     # modified
echo y > "新しい ファイル.txt"             # untracked (spaces and Japanese)
git rm -q --cached src/cli/*.ts 2>/dev/null # staged deletion
mkdir -p tmp && echo z > tmp/a.log && echo "*.log" > .gitignore

# Compare status and ls-files
diff <(git status --porcelain) <(tgit status --porcelain) && echo status match
diff <(git ls-files -s) <(tgit ls-files -s) && echo ls-files match
diff <(git ls-files -o --exclude-standard) <(tgit ls-files -o --exclude-standard) && echo ignore match

# Can the real git read an index tgit wrote with add?
tgit add -A && git status --porcelain && git fsck
```

### Step 4: commits and history (v0.1.0)

Do the same operations with the real git and with tgit, and see whether even the commit hashes match.

```bash
cd /tmp && rm -rf g t && mkdir g t
for side in g t; do
  cd /tmp/$side
  if [ $side = g ]; then G="git"; else G="tgit"; fi
  {
    $G init .
    echo 1 > a.txt && $G add a.txt && $G commit -m one
    $G switch -c feature && echo 2 >> a.txt && $G commit -a -m two
    $G switch main && echo 3 > b.txt && $G add . && $G commit -m three
    $G tag v1 && $G reset --hard HEAD~1
  } > /dev/null
done
diff <(git -C /tmp/g log --all --format='%H %s') <(git -C /tmp/t log --all --format='%H %s') && echo history match
git -C /tmp/t fsck --strict

# Compare log and rev-parse on the real data
cd ~/verify/self
H=$(git rev-parse HEAD)
diff <(git log --format='%H %an %ad %s' $H) <(tgit log --format='%H %an %ad %s' $H) && echo log match
diff <(git rev-parse $H~5 $H^ ) <(tgit rev-parse $H~5 $H^) && echo rev-parse match
```

- Release check: `git tag -l` has `v0.1.0`. Do 1-3 with `DIFFTEST_RUNS=1000` or more

### Step 5: diff and config

Compare the diff of each commit in the real data with the real git. Differences in how hunk positions are chosen show up more readily in real code changes than in constructed tests.

```bash
cd ~/verify/self
for c in $(git rev-list --no-merges -n 50 HEAD); do
  git rev-parse -q --verify "$c^" >/dev/null || continue     # skip the first commit
  cmp -s <(git diff "$c^" "$c") <(tgit diff "$c^" "$c") || echo "diff differs: $c"
  cmp -s <(COLUMNS=80 git diff --stat "$c^" "$c") <(COLUMNS=80 tgit diff --stat "$c^" "$c") || echo "stat differs: $c"
  cmp -s <(git show "$c") <(tgit show "$c") || echo "show differs: $c"
done
echo done

# Config: can the real git read config tgit wrote?
tgit config user.name "Verify User" && git config --get user.name
```

- If something differs, look at it with `diff <(git diff X^ X) <(tgit diff X^ X)` and paste it into the message sending it back

### Step 6: merge (v0.2.0)

```bash
cd /tmp && rm -rf m && git init -q m && cd m
printf '1\n2\n3\n' > f && git add f && git commit -qm base
git switch -qc other && printf '1\nOTHER\n3\n' > f && git commit -qam other
git switch -q main && printf '1\nMAIN\n3\n' > f && git commit -qam main

# Merge once with the real git and note the conflict state, undo it, then do the same with tgit
git merge other > ../real.out; cp f ../real.f; git ls-files -s > ../real.idx; git merge --abort
tgit merge other > ../tgit.out; echo "exit code: $?"
diff ../real.f f && diff ../real.idx <(git ls-files -s) && echo conflict state match
cat f                                       # check the markers by eye
tgit merge --abort && git status --porcelain   # back to the original state

# Check the merge result with the real git
echo resolved > f && git add f && tgit commit -m merged > /dev/null && git log --graph --oneline && git fsck --strict

# The stash list
echo w >> f && tgit stash push && diff <(git stash list) <(tgit stash list) && echo stash match
```

- Release check: the `v0.2.0` tag exists

### Step 7: rewriting history and internal formats (v0.3.0)

Compare read-only commands on a real repository compressed into packfiles. From here on, the real-data repository does not need unpacking.

```bash
cd ~/verify && rm -rf real
git clone <an open-source repository of some size (a few thousand commits)> real && cd real
git gc -q

H=$(git rev-parse HEAD)
diff <(git log --format='%H %s' -n 2000) <(tgit log --format='%H %s' -n 2000) && echo log match
diff <(git branch) <(tgit branch) && echo branch match
diff <(git tag -l) <(tgit tag -l) && echo tag match     # most tags are in packed-refs
diff <(git diff --stat $H~20 $H) <(tgit diff --stat $H~20 $H) && echo diff match
diff <(git status --porcelain) <(tgit status --porcelain) && echo status match

# Check the same with REF_DELTA
git -c repack.useDeltaBaseOffset=false repack -a -d -f -q
diff <(git log --format='%H %s' -n 2000) <(tgit log --format='%H %s' -n 2000) && echo match with REF_DELTA too
```

```bash
# rebase: do the same operations with the real git and tgit, and compare the resulting hashes (reuse the approach of step 4)
#   fork main and feature, and rebase feature onto main
#   also make a version that conflicts midway, and check --continue and --abort
git -C <tgit side> reflog | head      # the reflog is recorded
```

- Note how long `log` takes on the large repository (not used for pass or fail, but note it if it is extremely slow)
- Release check: the `v0.3.0` tag exists. Do 1-3 with `DIFFTEST_RUNS=5000`

---

## 3. Verification log

Add one line per step. Keep it outside the repository.

| Date | Step | Commit verified | Seeds and runs in 1-3 | Result | What was sent back, notes |
|---|---|---|---|---|---|
| | | | | | |
