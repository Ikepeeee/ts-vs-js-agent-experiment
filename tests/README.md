# Tests

The tests of chapter 6 of the experiment design. The agent receives only the public tests in `public/`. Nothing else here goes into a trial's container.

Japanese version: `README_ja.md`. This English version is canonical; where the two differ, this one prevails.

## Layout

| Path | Contents |
|---|---|
| `src/` | Sources of the handwritten scenarios (`v1.mjs` to `v3.mjs`), and `build.mjs`, which writes the JSON |
| `public/vN/` | Public tests (25 for v0.1.0, 15 for v0.2.0, 10 for v0.3.0). They use only the format of section 1 of the spec |
| `hidden/vN/` | Hidden scenarios (120, 80, 60). `manifest.json` gives each one's section and whether it is "basic" or "edge" |
| `random/gen.mjs` | Generator of the random differential tests (hidden test 2) |
| `realrepo/` | Comparison on a real repository (hidden test 3): `requests.tar`, `commands.json`, `compare.mjs`, `prepare.sh` |
| `runner/run.mjs` | Runner that executes scenarios with the real git and with tgit and compares them |
| `runner/fake-tgit.mjs` | A deliberately broken tgit, for the runner's self-test |

## Usage

```sh
# Rebuild the scenario JSON (after changing src/)
node tests/src/build.mjs

# Evaluating a trial: for v0.2.0, run the v1 and v2 hidden scenarios
node tests/runner/run.mjs --tgit '["node","<repo>/src/main.ts"]' --json out.json tests/hidden/v1 tests/hidden/v2

# Random differential tests: generate, then run them with the same runner
node tests/random/gen.mjs --version v2 --out /tmp/random-v2
node tests/runner/run.mjs --tgit '["node","<repo>/src/main.ts"]' --json random.json /tmp/random-v2

# Comparison on a real repository (v0.3.0)
node tests/realrepo/compare.mjs --tgit '["node","<repo>/src/main.ts"]' --json realrepo.json
```

What a trial puts in `given/` is the union of `public/` up to that version (for v0.2.0, `public/v1` and `public/v2`), without `manifest.json`.

## Checking the tests themselves

With `--tgit git`, both sides run the real git. If the tests are correct, all of them pass.

```sh
node tests/runner/run.mjs --tgit git --strict tests/hidden tests/.validate   # also checks the expected exit codes
node tests/runner/run.mjs --tgit git tests/public
node tests/realrepo/compare.mjs --tgit git
```

With `--strict`, a `run` step that is not expected to fail, but fails with the real git, is reported as a mistake in the scenario. Steps that are expected to fail carry `expectExit`. `build.mjs` removes it from the public tests; `.validate/` is a copy taken before that.

That the runner does not miss differences is checked with `runner/fake-tgit.mjs`, which prints nothing and exits with the given code.

## What is compared

For each `run` step: the exit code, the standard output when `matchOutput` is set (temporary directory paths are replaced with `<ROOT>`), and the state of the repository. The state is read with the real git on both sides: HEAD, refs, the set of objects, `config --local --list`, the index (`ls-files -s`), the result of `fsck --strict`, the contents of `MERGE_HEAD`, `MERGE_MSG`, `CHERRY_PICK_HEAD` and `packed-refs`, and the working-tree files (contents, executable bit, symbolic links).

Reflogs (`.git/logs/`) are not part of the state, because tgit up to v0.2.0 does not write them. In v0.3.0 they are checked through the output of the `reflog` command.

## Fixed environment

Both sides run with a dedicated `HOME` (`.gitconfig` with `init.defaultBranch=main` and `core.autocrlf=false`), `GIT_CONFIG_NOSYSTEM=1`, `TZ=UTC`, `LANG=C`, and fixed author and committer names, emails and dates (`FIXED_ENV` in `runner/run.mjs`). These are the same settings as "Fixed environment" in `AGENTS.md`.

## Before freezing

1. Run `lask run validate` at the root of the experiment folder. In the evaluation image (Linux, the same git version as the trials), it runs the checks above together with all random differential tests (2,000 per version).
2. Take the hashes with `lask run freeze` and pre-register them. They cover every file in `public/` and `hidden/`; `random/gen.mjs`, its seed (`20261029`) and its output; `realrepo/requests.tar` and `commands.json`; `runner/run.mjs`; and the rest listed in section 13.1 of the experiment design.
