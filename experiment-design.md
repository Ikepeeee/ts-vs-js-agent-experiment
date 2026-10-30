# TypeScript vs JavaScript, a controlled experiment: design

October 28, 2026 · Toru Ikeda

Japanese version: `experiment-design_ja.md`. This English version is canonical; where the two differ, this one prevails.

AI agents implement the same specification (tgit v0.1.0 to v0.3.0) from scratch, once in TypeScript and once in JavaScript. The experiment compares **the bugs left in code the agent says is finished** and **what it cost to get there**. The only difference between the conditions is the language, along with the type annotations and type checking that come with it.

The 2×2 design from before the switch is in `archive/experiment-design.md`.

## 1. Goals and research questions

- **RQ1 (primary):** Does writing in TypeScript leave fewer bugs?
- **RQ2:** How much does TypeScript add to the cost in time and tokens?
- **RQ3:** Does the difference grow as the code grows (v0.1.0 → v0.3.0)?
- **RQ4 (exploratory):** Do completion rates, how often the agent stops, and the kinds of remaining bugs differ?

RQ3 tests the hypothesis that types start to matter once the code no longer fits in the context. Each version adds code, so the agent can read less of it at once.

## 2. Hypotheses

Pre-registered before the runs, and not changed after seeing the results.

| ID | Hypothesis | RQ |
|---|---|---|
| H1 | The hidden-test failure rate is lower for TypeScript | RQ1 |
| H2 | TypeScript takes more time and tokens (for reference, Endo's small-scale measurement found about 1.6×) | RQ2 |
| H3 | The difference in H1 is larger for v0.3.0 than for v0.1.0 (condition × version interaction) | RQ3 |
| H4 | The difference comes mainly from bugs where interfaces or types do not match; misreadings of the spec and logic errors do not differ | RQ4 |

## 3. Conditions

| | TypeScript condition | JavaScript condition |
|---|---|---|
| Instructions | `ts/AGENTS.md` | `js/AGENTS.md` |
| Language | TypeScript (Node.js strips the types and runs it directly) | JavaScript (ES modules) |
| Types | `strict`, `noUncheckedIndexedAccess`, no `any` | No type annotations. JSDoc type comments and enabling type checking are also forbidden |
| Done when | Tests, differential tests, lint, **type check** | Tests, differential tests, lint |
| Everything else | The same (spec, public tests, model, tools, ESLint, fast-check, how the differential tests are built, working rules) | Same as left |

The two `AGENTS.md` files differ only in the few lines about the language; check with `diff ts/AGENTS.md js/AGENTS.md`.

This design compares "TypeScript development, with type annotations and type checking together" against "plain JavaScript development". It does not separate the effect of the annotations from the effect of the checking. TypeScript and JavaScript also differ in their training data, and this too is accepted as part of the condition. The question is which to choose in practice, not to isolate the pure effect of types.

## 4. The task

- The specifications are `spec/spec-v1.md` (v0.1.0), `spec-v2.md` (v0.2.0) and `spec-v3.md` (v0.3.0). They are in English and written independently of the implementation language.
- One **series** builds v0.1.0 → v0.2.0 → v0.3.0 in order. v0.2.0 is built on top of the same series' v0.1.0 code.
- The series is the unit of the experiment. Mistakes in one version carry into the next, so the results of the versions are not independent.
- The real git serves as the answer key. Every behavior in the spec can be judged by comparing with the real git.

### Expected size per version

The expected cumulative lines of implementation code, excluding tests. This is not written in the spec or the instructions to the AI, so the AI does not aim at a line count.

| Version | Main content | Cumulative lines | In tokens |
|---|---|---|---|
| v0.1.0 | Foundation, objects, index, commits and history | about 5,000–6,000 | about 50K–60K |
| v0.2.0 | Diff, config, full ignore support, merge, annotated tags, stash | about 10,000–11,000 | about 100K–110K |
| v0.3.0 | cherry-pick, revert, rebase, reflog, packed-refs, reading packfiles | about 13,000–15,000 | about 130K–150K |

- Tokens are estimated at about 10 tokens per line.
- The actual line counts vary a lot with how thoroughly the agent builds things. JavaScript tends to be shorter than TypeScript (in Endo's measurement, TypeScript was about 1.25× JavaScript). Line counts are measured and recorded, and the analysis takes the difference in size into account.
- Relation to RQ3: current models have a context of 1M tokens, which would hold the whole code even at v0.3.0. To test "types help once the code no longer fits", every series sets `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`, limiting the context to 200K tokens. The whole code is then expected to stop fitting during the second half of v0.2.0.

## 5. Agent and environment

- **Agent:** Claude Code in non-interactive mode (`claude -p`), within a Claude subscription plan. GitHub Copilot CLI can run the same procedure as a separate group of series (13.8); its series are compared with each other, not with Claude Code's.
- **Models:** both Sonnet and Opus, each pinned to its ID. Both models run both the TypeScript and the JavaScript condition. This checks whether the effect of the language holds regardless of the model; it does not ask which model is better.
  - Sonnet: Sonnet 5.5 (`claude-sonnet-5-5`)
  - Opus: Opus 5.5 (`claude-opus-5-5`)
  - The ID is passed to `--model` directly. Aliases such as `sonnet` or `opus` are not used, since what they point to can change
- **Reasoning effort:** fixed at `--effort high` for both models. The default can change with the Claude Code version or the model, so it is set explicitly.
- **Prompt:** the spec is placed in the repository's `docs/`, and the agent receives only the fixed sentence "Implement `docs/spec-vN.md`." The specs of earlier versions stay.
- **Container:** each version runs in a new container over the series' home directory, which carries over from version to version (13.2). The trial runner (lask 0.13.0) starts it with the Docker CLI. The following are fixed:
  - The image (pinned by ID in `images.json`)
  - The versions of Node.js, git, Claude Code and lask
  - An empty home directory
  - `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`
  - `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` (limits the context to 200K tokens. Auto-compaction stays on, and compacts when 200K tokens is reached)
- **Information and network access:** if the agent looks up and uses outside information (the real git's source, existing git implementations), the experiment can no longer measure "the bugs left when implementing from the spec", and differences in how much it looks things up mix into the difference between conditions. Three measures prevent this:
  - **Disable the web tools:** start with `--disallowedTools WebFetch,WebSearch`. WebSearch runs on Anthropic's servers, so restricting the network would not stop it. Removing the tools themselves is more reliable.
  - **Forbid it in the instructions:** `AGENTS.md` forbids any network use other than installing the dev dependencies, and fetching any package or source code other than those specified.
  - **Audit the logs afterwards:** every command in the conversation logs is searched mechanically for `curl`, `wget`, `git clone`, `npm pack`, `npm install` of unlisted packages and the like, and each is recorded as a violation (13.4).
  - The container's network itself is not restricted. The npm registry is needed, and restricting the network would not stop existing implementations from being fetched through the registry. The agent runs without confirmations, but the container holds nothing of value except the experiment's material, and it cannot reach the host's files.
- **Dev dependencies:** the agent installs them itself from the npm registry in every trial. Nothing is cached in advance. The installed versions are recorded from `package-lock.json`.
- **Permissions:** to run unattended, everything inside the container runs without confirmation. Nothing outside the container is affected.
- **A new conversation per version:** `--continue` and `--resume` are not used across versions. `--resume` is used only within a version, to continue after the agent stops or after a usage limit (13.3).
- **Caps:** a safety device against runaways, set high enough that ordinary trials do not reach them. If many trials hit the caps, the caps rather than the language decide the results. A trial that hits a cap is not excluded; its code at that point is evaluated.
  - **Turns (primary):** limited with `claude -p`'s `--max-turns`. It depends only on the agent's actions, not on how busy the API is.
  - **Active time (backup):** wall-clock time minus the time spent waiting on the subscription's usage limits. It is insurance against things like a stalled connection, so it has more room than the turn cap.
  - **Shared:** the caps are the same for all four combinations of language and model. They are the same for every version by default; only if the pilot shows that v0.2.0 is clearly heavier is that version's cap raised.
  - **Cumulative:** when the agent stops and resumes, turns and active time accumulate within a version.
  - **Values:** three times the pilot's maximum, rounded to a round number (chapter 9, step 2). The expectation is 2,000–3,000 turns and 16–24 hours per version.
- **Interruption by usage limits:** when the subscription's usage limit is hit, the trial runner waits for the reset and resumes the same conversation. This is recorded separately from "stopped" below and does not count toward the resumes with the fixed sentence.
- **When the agent stops:** if the agent stops to ask a human, it is resumed with a fixed sentence shared by both conditions, "Continue with your best judgment, following AGENTS.md and the specification.", and the count is recorded. No other human input is given.
- **Run order:** the series of the four combinations of language and model run in turn, over the same period.

## 6. Measurement

### Hidden tests (the main instrument)

Tests the AI never sees, written and frozen before the trials start, with their hashes pre-registered. They run on their own runner, separate from the differential tests the agent builds.

1. **Hidden scenarios:** handwritten scenarios per item of the spec, compared against the real git. There is a set for each version, and evaluating v0.2.0 also runs the v0.1.0 scenarios (regressions count too).
2. **Random differential tests:** a separate generator produces random sequences of the commands available in that version. About 2,000 with a fixed seed. The measure is the share of sequences that differ from the real git.
3. **A real repository (v0.3.0):** in a real open-source repository after `gc`, read-only commands are compared with the real git.
   - **The repository:** [psf/requests](https://github.com/psf/requests), `main`, pinned to commit `3c7baaa05ab4aa49cc819ce3a819d260de19c157` (October 26, 2026). It is under the Apache License 2.0, so it can be published with the results.
   - **Why this one:** its history contains nothing outside the spec. No submodule entry (mode `160000`) ever appears, and it does not use Git LFS. At the same time, it has things that artificial scenarios rarely produce:

     | Item | Value |
     |---|---|
     | Commits | 6,496 (1,612 merges, one root) |
     | Tags | 162 (34 annotated) |
     | Signed commits (`gpgsig` header) | 1,014 |
     | Non-ASCII author or committer names | 145 commits |
     | Symbolic link and executable-bit changes | present |
     | Binary files at HEAD (images and the like) | 5 |
     | Pack size | about 14 MB |

   - **Preparation:** before the main experiment, it is cloned with `--bare`, archived, and its hash is pre-registered. Evaluation extracts this archive and does not touch the network. The packs come in the same two forms as the spec's completion criteria: after `git gc`, and after `git -c repack.useDeltaBaseOffset=false repack -a -d -f`.
   - **Commands compared:** the read-only commands in the spec (`cat-file`, `rev-parse`, `log`, `show`, `diff` between commits, `ls-files`, `status`, listing with `branch` and `tag`, `merge-base`). `status` and `ls-files` run in a working tree with HEAD checked out. The commits and paths are chosen at random with a fixed seed.

The hidden tests are built only from the spec and the real git's behavior. Nothing is added or changed after looking at either condition's output.

### Public tests

Separately from the hidden tests, there are scenarios given to the agent. They are written in the format of section 1 of the spec and placed in the repository's `test/difftest/scenarios/given/`. Before each version starts, that version's tests are added (the earlier versions' stay). They have only three roles:

1. An example of the scenario format, which also checks that the agent's runner can read it
2. A minimal check that things work: only the normal cases and representative errors, no edge cases
3. An objective criterion for done: all public tests passing is the shared completion target for both conditions

They are kept to about one fifth of the hidden scenarios. The more public tests there are, the more matching them becomes the goal, and the smaller the difference between the conditions. The agent may not change the files in `given/` (forbidden in `AGENTS.md`). After each trial their hashes are checked, and any change is recorded.

### Test perspectives and counts

#### Perspectives shared by every version

For each command, the applicable perspectives below become scenarios.

- **Normal cases:** the basic use of each form and option in the spec
- **Output match:** character-for-character match where the spec says the output matches
- **Errors:** invalid arguments, missing paths or objects, running outside a repository. The exit codes must match
- **Where it runs:** from a subdirectory of the working tree
- **Unusual paths:** spaces, non-ASCII characters, names starting with `-`
- **No commits yet:** running on an unborn branch
- **State match:** the objects, refs, index and working tree after the command
- **Interoperability:** the real git can read what tgit wrote, and the reverse

The hidden scenarios are roughly 60% basic and 40% edge cases. With only basic cases, both conditions would pass at the ceiling; with only edge cases, both would fail; either way the difference would not show. The public tests are basic only.

#### v0.1.0 (120 hidden, 25 public)

| Spec section | Main perspectives | Hidden | Public |
|---|---|---|---|
| 2 Command dispatch | Unknown commands, outside a repository, finding `.git` in a parent | 4 | 1 |
| 3 `init` | No arguments, nested directories, `--bare`, `-b`, `-q`, reinitializing, committing with the real git | 8 | 2 |
| 4 Objects, `hash-object`, `cat-file` | Empty, binary and large files; `-w`, `-t`, `--stdin`; invalid content; showing all four object types; revision syntax; tree order and modes | 18 | 3 |
| 5 `add` | Paths, directories, `.`, `-A`, `-u`, ignored paths, missing paths, a file replaced by a directory and the reverse | 10 | 2 |
| 5 `rm` | `--cached`, `-r`, `-f`, files with changes, untracked paths | 6 | 1 |
| 5 `ls-files` | `-s`, `-c`, `-o`, `--exclude-standard` | 5 | 1 |
| 5 `status` | Untracked files and directories; staged and unstaged additions, changes and deletions; changes on both sides; no commits | 12 | 2 |
| 5 `.gitignore` (root only) | Comments, blank lines, wildcards, directories, anchoring | 5 | 1 |
| 6 `commit` | Repeated `-m`, `-a`, `--allow-empty`, `--amend`, nothing to commit, matching hashes, `fsck --strict` | 9 | 2 |
| 6 `rev-parse` | Ref names, short IDs, combinations of `~n` and `^`, `--short`, `--abbrev-ref`, invalid revisions, unborn HEAD | 7 | 1 |
| 6 `log` | Default output, `--oneline`, each `--format` placeholder, `-n`, path limiting, unborn branch | 8 | 2 |
| 6 `show` | `-s`, `--no-patch` | 2 | 1 |
| 6 `branch` | Listing, creating, `-d` (fails when unmerged), `-D`, `-m` (current branch), existing names | 7 | 2 |
| 6 `switch`, `checkout` | Branches, `-c` and `-b`, `--detach`, commits, restoring paths, carrying over changes that do and do not conflict | 9 | 2 |
| 6 `reset` | `--soft`, `--mixed`, `--hard`, with paths | 6 | 1 |
| 6 `tag` (lightweight) | Creating, listing, `-d`, existing names | 4 | 1 |
| Total | | 120 | 25 |

#### v0.2.0 (80 hidden, 15 public)

| Spec section | Main perspectives | Hidden | Public |
|---|---|---|---|
| 1 `diff` | Working tree vs index, `--cached` (including with no commits), two commits, path limiting, `--stat` (`COLUMNS`), `--name-only`, `--name-status`, each header line, no newline at end of file, binary, empty files, CRLF, hunk positions and splitting | 22 | 4 |
| 1 `show`, `log -p` | Showing with a patch, merge commits | 4 | 1 |
| 2 `config` | Get, set, `--unset`, `--list`, missing keys, values with spaces, quotes or `#`, subsections, `commit` using `user.*` | 8 | 1 |
| 3 Ignore rules | Negation, `**`, precedence of `.gitignore` in subdirectories, `info/exclude`, trailing spaces, escapes | 8 | 1 |
| 4 `merge-base` | Simple fork, `--all`, criss-cross | 5 | 1 |
| 4 `merge` | Fast-forward, `--no-ff`, `--ff-only` (including failure), three-way merge, default message, already up to date, conflicts (same line, add/add, modify/delete, binary), committing the resolution, `--abort`, with local changes | 20 | 4 |
| 5 Annotated tags | Matching hashes, `show`, `cat-file -p` | 4 | 1 |
| 6 `stash` | `push` and no arguments, `pop`, `apply`, `list`, `drop`, commit structure, conflicts on `pop` | 9 | 2 |
| Total | | 80 | 15 |

#### v0.3.0 (60 hidden, 10 public)

| Spec section | Main perspectives | Hidden | Public |
|---|---|---|---|
| 1 `cherry-pick` | Matching hashes, conflicts, `--continue`, `--abort`, changes already applied | 10 | 2 |
| 1 `revert` | `--no-edit`, default message, resulting tree | 5 | 1 |
| 2 `rebase` | `<upstream>`, `--onto`, matching hashes, state when stopped on a conflict, `--continue`, `--abort` | 12 | 2 |
| 3 reflog | Entries each command writes, `reflog`, `reflog show <ref>` | 10 | 2 |
| 4 packed-refs | Reading, refs both loose and packed, `pack-refs --all`, deleting a ref that is only in packed-refs | 7 | 1 |
| 5 packfile | Reading after `gc`, `OFS_DELTA`, `REF_DELTA`, deep delta chains, packed and loose mixed, each command working | 16 | 2 |
| Total | | 60 | 10 |

In v0.3.0 there is also the comparison on a real repository (hidden test 3).

#### Counts run per version

| Version evaluated | Hidden scenarios | Public tests (`given/`) |
|---|---|---|
| v0.1.0 | 120 | 25 |
| v0.2.0 | 200 (including v0.1.0's) | 40 |
| v0.3.0 | 260 (including v0.1.0's and v0.2.0's) | 50 |

#### Rules for writing them

- Each scenario checks one behavior. Setup is done with `git` steps (the real git), and `run` is only the command under test. This keeps a bug in one command from cascading into failures in other scenarios
- Each scenario carries its spec section number and whether it is "basic" or "edge". Uneven counts per section are handled in the analysis by computing failure rates per section
- The normal-case hidden scenarios use different setups and inputs from the public tests. Nothing is shared
- Before freezing, they run twice with the real git on both sides, giving the same result each time
- After the pilot, a scenario may be fixed only when a defect in the scenario itself (such as a result that changes from run to run) has been confirmed with the real git. Nothing is added or changed after looking at how well the pilot's output did

### Metrics

| Kind | Metric | Definition |
|---|---|---|
| Primary | Hidden-scenario failure rate | Per version, the number of failed hidden scenarios ÷ the total number of hidden scenarios |
| Secondary | Random differential mismatch rate | The share of command sequences that differ from the real git, with a breakdown per command |
| Secondary | Cost | Tokens (input, output, cache), estimated cost at API prices, elapsed time, turns |
| Secondary | Context pressure | Number of auto-compactions |
| Secondary | Completion | Whether the agent met the completion criteria on its own or hit a cap, number of resumes after stopping, number of public tests passed |
| Secondary | Size | Lines excluding tests (`cloc`), number of tests the agent wrote |
| Descriptive only | Rule violations | Number of forbidden network accesses, package fetches and unlisted dependencies (13.4) |
| Descriptive only | Latent type errors | Errors from checking the JavaScript condition's final code with `tsc --checkJs` after the trial |

### Bug classification (exploratory)

A random sample of hidden-test failures is classified into four causes: interface or type mismatch, logic error, misreading of the spec, missed edge case. TypeScript code is read with its types stripped, to make the condition harder to tell at a glance (it cannot be hidden completely).

## 7. Number of trials and analysis

- **Number of trials:** counted in series. Three series for each combination of language (2) × model (2), 12 series (36 versions) in all. Per language condition, that is 6 series each.
- **Limits of power:** with three series per combination, only large differences can be detected. Results are reported as effect sizes with confidence intervals, and the absence of a visible difference is not reported as "no difference".
- **Primary analysis:** a generalized linear mixed model (logistic), with the pass or fail of each hidden scenario as the outcome. Fixed effects: condition, version, model, condition × version. Random effects: series and scenario.
  - H1 is judged by the main effect of condition, H3 by the condition × version interaction.
  - The condition × model interaction (whether the effect of the language differs by model) is reported as exploratory.
- **Cost (H2):** compared on a log scale and reported as a ratio. The cost of trials that hit a cap is treated as censored ("at least this much").
- **Trials that hit a cap:** their number is shown per combination. They are included in the primary analysis, with an analysis excluding them added as a sensitivity analysis.
- **Description:** every value per series and per version is shown in tables and charts. With this few series, the individual series are not hidden.
- **Pre-registration:** the hypotheses, primary metric, model, number of trials, caps, and the hashes of the hidden and public tests are published before the main experiment.

## 8. Threats to validity and countermeasures

| Threat | What it is | Countermeasure |
|---|---|---|
| Familiarity with the language | The amount and nature of training data differ between TypeScript and JavaScript | Accepted as part of the condition, and interpreted as "a practical choice" |
| Annotations and checking cannot be separated | We cannot say which one helped | Stated as a deliberate trade-off for simplicity |
| Strength of the AI's own tests | If the agent's differential tests are strong, both conditions approach the answer and the difference shrinks | Record the number of agent tests and random runs, and show them with the results |
| Volume of public tests | With many public tests, matching them becomes the goal, and the difference shrinks | Keep them to about one fifth of the hidden scenarios and basic cases only; edge cases stay in the hidden tests |
| Dependence within a series | Mistakes in v0.1.0 cascade into v0.2.0 and later | Use the series as the unit, and also show a comparison of v0.1.0 alone |
| Stopping and intervention | Human intervention is biased by condition | Resume only with the fixed sentence, and record the count |
| Bias in the hidden tests | Tests written by the experimenter favor one condition | Freeze before the trials, and build only from the spec and the real git |
| Knowledge of existing implementations | Git implementations are common in the models' training data | Assumed to affect both conditions equally, and stated as a limit of generalization |
| Use of outside information | The agent looks up and copies existing implementations or source | Remove the web tools, forbid it in the instructions, audit the logs afterwards and record violations (chapter 5) |
| Changes in the model | The API's behavior changes during the period | Pin the model IDs, and run the conditions alternately |
| Limits of generalization | One task, two models (Sonnet and Opus) | State that the conclusions are limited to this task and these models |
| Experimenter preference | The experimenter expects types to help | Pre-registration, and publishing all raw data and analysis code |

## 9. Procedure

1. **Build the hidden tests, the public tests and the trial runner:** hidden scenarios, public tests, the random differential-test generator, the real-repository comparison, the machinery that runs a series in a container, and the collection of records.
2. **Pilot.** One series per combination of language and model, v0.1.0 only. In addition, one series of Opus × TypeScript, expected to be the heaviest, runs through v0.3.0. Check the turns, active time and usage per version, how often the agent stops, and infrastructure bugs. Pilot data is not used in the main analysis.
   - The pilot's caps are provisional values that only stop runaways (3,000 turns and 24 hours of active time per version).
   - The main experiment's caps are three times the pilot's maximum of turns and of active time, each rounded to a round number. This formula is recorded before the pilot and not changed after seeing the results.
3. **Pre-registration.** Fix the caps, freeze the hidden and public tests, and publish their hashes.
4. **Main experiment.** Run the series alternately, a little at a time within the usage limits.
5. **Analysis and publication.**

Chapter 13 has the concrete procedure, down to the commands.

## 10. Budget

The trials run on a subscription plan, so there is almost no extra cost. The constraint is the usage limit, which sets how many days the experiment takes. How much one series (three versions) uses depends a lot on how thoroughly the agent builds the spec, so the schedule is set after measuring it in the pilot. If it would take too many days, reduce the number of series or run part of it on the API (keeping the same model IDs and settings).

## 11. Outputs and publication

- The spec, the two `AGENTS.md`, the public tests, the hidden tests (published after the main experiment), the trial runner, the analysis code
- Raw data: conversation logs of every series, the output repositories, the hidden-test results, costs
- The pre-registration, and the differences between it and the final report
- Articles (Japanese and English). Positioned against Endo's measurement of "the speed and cost of small new implementations", as a measurement of "the bugs that remain in an implementation that keeps growing"

## 12. Open questions

None at this point. The concrete cap values are fixed after the pilot, by the formula in chapter 9, step 2.

## 13. Run procedure

The procedure of chapter 9, written down to the commands actually typed. Every operation is a `lask run <task>` at the root of the experiment folder; the trials also need the agent's token in an environment variable, `CLAUDE_CODE_OAUTH_TOKEN` for Claude Code or `COPILOT_GITHUB_TOKEN` for GitHub Copilot CLI (lask 0.13.0; each task first checks lask's version and stops if it differs). Lask runs its commands in containers: the Docker CLI, the evaluation, and file access each have one. Only checking lask's version and `claude setup-token` run on the host.

| Task | Role |
|---|---|
| `build-images` | Build the trial images (Claude Code, GitHub Copilot CLI), and record their IDs in `images.json`. Only an image `images.json` does not record yet is built |
| `validate` | Check the tests themselves, running all of them with the real git on both sides |
| `freeze` | Take the hashes to pre-register |
| `login` | Create a long-lived Claude token (`--agent copilot`: show where to create the Copilot token) |
| `exp-v1` | Start a series: create its playground and build v0.1.0 unattended, as in 13.3 |
| `exp-v2`, `exp-v3` | Continue the series with v0.2.0 and v0.3.0, in the same conditions |
| `stop` | Clean up the container of a series left behind by a failure |
| `evaluate` | Evaluate each version of a series (13.4) |

| File | Contents |
|---|---|
| `main.lask` | All the tasks above |
| `lask.json`, `lask.lock.json` | The lask module the tasks use (`tools` v0.6.0), and the pins of the images lask runs: the Docker CLI (`docker:29.5.3-cli`), the evaluation image, and the tools module's `unix` image |
| `images/trial/Dockerfile` | The trial image (Node.js 24.22.2, git 2.47.3, Claude Code 2.1.302, and the agent's git settings of 13.2) |
| `images/copilot/Dockerfile` | The image for GitHub Copilot CLI series: the trial image with GitHub Copilot CLI 1.0.105 in place of Claude Code |
| `images/eval/Dockerfile` | The evaluation image: the trial image's base and git, plus TypeScript 7.0.2 and `@types/node` 24.19.2 for `tsc --checkJs`. They are not in the trial image, so agents in the JavaScript condition cannot use `tsc` |
| `images.json` | The IDs of the two trial images. Containers start from these IDs, so the contents are pinned |
| `eval/` | Scripts for evaluation, size, the network and package audit, checking the tests, and freezing |
| `tests/` | Runner, hidden tests, public tests, generator, real repository. See `tests/README.md` for usage |

### 13.1 Preparation (once, before the experiment)

1. **Prepare the images.** Do this on the machine that will run the trials, with Docker running. A different CPU type (arm64 or x86_64) gives different images.

   ```sh
   lask sync                # pull and build the images lask runs, and pin them in lask.lock.json
   lask run build-images    # build the trial images and record their IDs in images.json
   ```

2. **Check the tests themselves.** Run every test with the real git on both sides and confirm that all pass (about 30 minutes). The logs are kept in `tests/validation-logs/<time>/`.

   ```sh
   lask run validate
   ```

3. **Freeze and take the hashes.** They cover the specs, the two `AGENTS.md`, the public tests, the hidden tests, the runner, the generator with its seed and output, the real repository's archive and command list, `main.lask`, `lask.json` and `lask.lock.json`, the image definitions and `images.json`, and the scripts in `eval/`.

   ```sh
   lask run freeze          # freeze/files.sha256, freeze/random.txt, freeze/freeze.sha256
   ```

   Pre-register the value of `freeze/freeze.sha256` together with the hypotheses, the primary metric, the models, the number of trials, the cap formula and the version of lask. From then on, these files do not change and the images are not rebuilt.

4. **Set up authentication.** Create a long-lived token for the subscription account with Claude Code on this machine, and set it in the shell that runs the trials.

   ```sh
   lask run login                          # runs claude setup-token
   export CLAUDE_CODE_OAUTH_TOKEN=<token>  # or keep this line in .env and: source .env
   ```

   For GitHub Copilot CLI series, create a fine-grained personal access token with the account permission "Copilot Requests" on github.com instead (`lask run login --agent copilot` shows where), and set it as `COPILOT_GITHUB_TOKEN`.

   The trial tasks refuse to start without the token of their agent. The token reaches the containers by name only, so it never appears on a command line or in a log. A `.env` holding it stays on this machine (it is in `.gitignore`).

5. **Decide the series and their order.** A series is named when it starts (`exp-v1 <name>`); the pilot uses P1–P5 and the main experiment S01–S12. The order of the four combinations of language and model in each round is drawn from a seed fixed at pre-registration, and recorded with it.

### 13.2 The trial container

Each series has a home directory, `playground/<name>_<lang>_<model>/` (for example `playground/S01_ts_claude-opus-5-5/`), where the agent works through all three versions. Each version runs in a new container and a new conversation over that home, so the repository carries over (chapter 4, "series"). The container is removed when the version ends.

- **What is mounted:** only that series' home, at the container's `/home/node`. The rest of the experiment folder (hidden tests, other series, results, conversation logs) is not visible. The conversation logs are written to `results/` directly, so the agent itself cannot read them either.
- **Writing to the home:** the trial runner creates the home empty, and every write to it (creating the repository, preparing a version, saving and restoring state, saving the output) is done from inside the container. With Rancher Desktop, a folder the host deletes and recreates can stay invisible to a running container for a while.

- **Environment variables**

  | Variable | Value | Why |
  |---|---|---|
  | `CLAUDE_CODE_OAUTH_TOKEN` | The token from 13.1, step 4 | Authentication on the subscription plan |
  | `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | `1` | No memory carried across series |
  | `CLAUDE_CODE_DISABLE_1M_CONTEXT` | `1` | Limit the context to 200K tokens |
  | `DISABLE_AUTOUPDATER` | `1` | Keep Claude Code's version from changing during a trial |
  | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | `1` | No traffic the trial does not need (usage statistics and the like) |

  The token comes from the environment of the shell that runs the task. The other four are fixed in `main.lask` and recorded in `meta.json`.

- **Network:** not restricted (chapter 5, "Information and network access"). Claude Code starts with the web tools removed, and commands that use the network are audited from the logs afterwards.
- **Home directory:** starts empty. The agent's git settings are in the trial image's system configuration (`/etc/gitconfig`): the same settings as "Fixed environment" in `AGENTS.md`, the name and email for the agent's commits, and `safe.directory`. The last one keeps git from refusing to work because the host created the home and it can appear to have a different owner inside the container. The difftest runs with `GIT_CONFIG_NOSYSTEM=1`, so its comparisons never see these settings.

  ```ini
  [init]
  	defaultBranch = main
  [core]
  	autocrlf = false
  [user]
  	name = tgit agent
  	email = agent@example.com
  [safe]
  	directory = *
  ```

- **Initial repository:** created at `/home/node/tgit` and committed by the trial runner before the agent starts (name `tgit runner`, message `Initial files`).

  ```
  AGENTS.md                         # from ts/ or js/, depending on the condition
  docs/spec-v1.md
  test/difftest/scenarios/given/    # tests/public/v1/*.json (without manifest.json)
  ```

### 13.3 The flow of one series

A series runs one version per command. The language and the model are given when it starts, and the later versions keep them.

```sh
lask run exp-v1 S01 --lang ts --model claude-opus-5-5    # creates playground/S01_ts_claude-opus-5-5/, builds v0.1.0
lask run exp-v2 S01                                      # v0.2.0 in the same conditions
lask run exp-v3 S01                                      # v0.3.0
```

`exp-v2` and `exp-v3` start only after the previous version has finished, and only when the playground's repository is still at the commit where it ended. The caps are passed with `--max-turns` (default 3,000) and `--max-hours` (default 24). The defaults are the pilot's provisional values; the main experiment passes the values decided in chapter 9, step 2. For the version N it is given, the trial runner does the following.

1. **Prepare the version:** start the container, add `docs/spec-vN.md`, add `tests/public/vN/*.json` to `given/`, and commit (for N ≥ 2 the message is `Add spec vN`). The earlier versions' specs and public tests stay.
2. **Save the state at the start of the version:** pack the whole home into `results/<series>/vN/start.tar`, used for restarts in 13.6. Also take the hashes of `given/`.
3. **Start the agent:** in a new conversation, give it only the fixed sentence.

   ```sh
   docker exec -w /home/node/tgit <container> \
     claude -p 'Implement docs/spec-vN.md.' --model <model ID> --effort high --max-turns <remaining turns> \
     --dangerously-skip-permissions --disallowedTools WebFetch,WebSearch \
     --output-format stream-json --verbose > results/<series>/vN/logs-<k>/run-<n>.jsonl
   ```

   Here `<series>` is `<name>_<lang>_<model>`. When the remaining active time runs out, the trial runner stops `docker exec` and restarts the container, which also stops the `claude` inside.

4. **Classify how it ended:** from the last `result` in the log, classify it as one of the following.

   | Ending | Condition | Next |
   |---|---|---|
   | Done | Ended normally, and the tag `v0.N.0` exists | Go to 5 |
   | Stopped | Ended normally, but there is no tag `v0.N.0` | Resume with the fixed sentence, and record the count |
   | Usage limit | `is_error`, and the result text has words indicating a usage limit (such as "usage limit") | Wait 30 minutes and resume with the fixed sentence. Recorded separately from "stopped", and the wait does not count as active time. 48 in a row is an infrastructure failure |
   | API error | Any other `is_error` (overload and the like) | Wait 5 minutes and resume with the fixed sentence. Recorded separately. 12 in a row is an infrastructure failure |
   | Turn cap | `result` is `error_max_turns`, or the cumulative turns reached the cap | Cut off. Go to 5 |
   | Active-time cap | The cumulative active time reached the cap | Cut off. Go to 5 |
   | Infrastructure failure | Ended without a `result`, the container could not start, and the like | Go to 13.6 |

   Resuming continues the same conversation with `--resume` and passes the fixed sentence "Continue with your best judgment, following AGENTS.md and the specification." (within the version only). If the first start fails before a conversation exists, it starts over from the beginning. Turns and active time accumulate within the version, and `--max-turns` gets the remaining turns.

5. **Save the output:** pack the repository into `results/<series>/vN/repo.tar` (including `.git`), and write the following to `run.json`:
   - How it ended, whether the tag exists, the commit the repository ended at, turns, active time, time spent waiting on usage limits, and the caps
   - Number of resumes (separately for stopped, usage limit and API error), number of auto-compactions, number of restarts due to infrastructure failures
   - Whether the hashes of `given/` are the same as at the start of the version
   - A record per start (tokens from `result`, cost at API prices, turns, duration, conversation ID)

   `package-lock.json` and the like are in `repo.tar`. The container is then removed; the home stays in `playground/` for the next version.

Saving and restoring state and saving the output use `tar` inside the agent's container (Linux), piped to and from the experiment folder. The host's `tar` is not used: macOS `tar` packs extended attributes as hidden `._name` files.

### 13.4 Evaluation

Run separately from the trials, at the root of the experiment folder. Lask runs it in the evaluation image, with the network off.

```sh
lask run evaluate S01                 # every version that has a repo.tar
lask run evaluate S01 --version v2
```

It writes the following to `results/<series>/vN/eval/`.

| File | Contents |
|---|---|
| `hidden.json` | Hidden scenarios (the primary metric): every scenario up to that version |
| `public.json` | Public tests (the "completion" metric): all of them up to that version |
| `random.json` | Random differential tests: that version's 2,000 |
| `realrepo.json` | Comparison on a real repository (v0.3.0 only) |
| `size.json` | Lines of implementation excluding tests (not counting blank and comment-only lines), the number of files and lines of tests the agent wrote, and the number of scenarios it wrote |
| `audit.json` | The network and package audit. Every Bash command in the conversation logs is searched for network operations such as `curl`, `wget` and `git clone`; `npm pack`, `npm view` and the like; `npm install` of unlisted packages; `npx` that downloads packages; other package managers; and calls to the web tools. It also checks the dependencies in `package.json`. A violation does not exclude the trial; it is evaluated as is |
| `checkjs.json` | Latent type errors (JavaScript condition only): the number of errors from `tsc --allowJs --checkJs --noEmit` |
| `summary.json` | A summary of the above. The input to the analysis |

tgit is started with `node src/main.ts` in the TypeScript condition and `node src/main.js` in the JavaScript condition. The runner reruns a scenario that timed out once. If it times out both times, it counts as a failure, and the number of reruns is recorded. Evaluating one version takes about 10 minutes, most of it in the random differential tests.

### 13.5 Pilot

```sh
lask run exp-v1 P1 --lang ts --model claude-sonnet-5-5    # P1–P4: one series per combination, v0.1.0 only
lask run exp-v1 P2 --lang js --model claude-sonnet-5-5
lask run exp-v1 P3 --lang ts --model claude-opus-5-5
lask run exp-v1 P4 --lang js --model claude-opus-5-5
lask run exp-v1 P5 --lang ts --model claude-opus-5-5      # P5: Opus × TypeScript only, through v0.3.0
lask run exp-v2 P5
lask run exp-v3 P5
```

The caps are the provisional values (3,000 turns and 24 hours of active time per version; both are the defaults). Afterwards, three times the maximum of turns and of active time, each rounded to a round number, become the main experiment's caps (chapter 9, step 2). Pilot data is not used in the main analysis. Infrastructure bugs found in the pilot may be fixed, but the tests frozen in 13.1, step 3 do not change (chapter 6, "Rules for writing them").

### 13.6 Infrastructure failures

Failures that are not the agent's doing (ended without a `result`, the container could not start, usage limits or API errors kept repeating, and the like) are handled as follows.

- The trial runner returns that version to its starting state (`start.tar`) and starts over in a new conversation. A version is restarted at most twice. If the third attempt also fails, the task stops (exit code 75).
- The fact of the restart and its reason are kept in `restart-<n>.txt`, and each attempt's conversation logs are kept separately in `logs-0`, `logs-1`, …. They also go into the report.
- If the task itself stops, for example because the machine went down or after the third failure, run the same `exp-vN` again. A version with a `start.tar` but no `run.json` starts over from `start.tar` in a new container, with the next `logs-<k>`.
- Failures caused by the agent's own actions (stopping on an error, hitting a cap, and the like) are not infrastructure failures. They are not restarted and are evaluated as they are.

### 13.7 Where records are kept

```
playground/
  <series>/              # the agent's home: tgit/ (and Claude Code's files)
results/
  <series>/              # <name>_<lang>_<model>, such as S01_ts_claude-opus-5-5 (the pilot is P1–P5)
    meta.json            # name, language, model ID, start time, lask version, image ID, fixed settings, hash of AGENTS.md
    v1/
      start.tar          # the state at the start of the version
      logs-0/            # conversation logs (run-1.jsonl, run-2.jsonl, …). After a restart, logs-1/, …
      restart-0.txt      # only after a restart: the reason
      repo.tar           # the output
      run.json           # how it ended, the final commit, resumes, turns, active time, waits, compactions, caps, a record per start
      eval/              # the evaluation results of 13.4 (summary.json and others)
    v2/ …
    v3/ …
```

When every series has finished, each version's `eval/summary.json` and `run.json` become the input to the analysis code (chapter 7).

### 13.8 GitHub Copilot CLI

The same tasks run a series with GitHub Copilot CLI 1.0.105 in place of Claude Code. Only `exp-v1` takes the agent; the later versions keep it.

```sh
export COPILOT_GITHUB_TOKEN=<token>
lask run exp-v1 C01 --agent copilot --lang ts --model claude-opus-5.5   # playground/C01_ts_copilot-claude-opus-5.5/
lask run exp-v2 C01
lask run exp-v3 C01
lask run evaluate C01
```

- **Models:** Copilot's own IDs, passed to `--model` as they are: `claude-sonnet-5.5`, `claude-opus-5.5`, `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-luna`, `gpt-5.3-codex`, `gemini-3.8-flash`. Auto model selection (`auto`) is not used, and switching models when rate-limited stays off (the default).
- **Series name:** `<name>_<lang>_copilot-<model>`. `meta.json` and `run.json` record `agent: "copilot"`. Series started before Copilot was added have no `agent` and are Claude Code's.
- **Image and environment:** `images/copilot/Dockerfile`, the same base, git and git settings as the trial image. Besides `COPILOT_GITHUB_TOKEN` and `HOME`, the container gets `COPILOT_AUTO_UPDATE=false`. `AGENTS.md` is read as Claude Code reads it.
- **Command:** set to match 13.3 where Copilot can.

  ```sh
  docker exec -w /home/node/tgit <container> \
    copilot -p 'Implement docs/spec-vN.md.' --session-id=<UUID> --model=<model ID> \
    --reasoning-effort=high --context=default --allow-all-tools --allow-all-paths --no-ask-user \
    --excluded-tools=web_fetch --disable-builtin-mcps --secret-env-vars=COPILOT_GITHUB_TOKEN \
    --disable-client-telemetry --no-auto-update --stream=off --output-format=json \
    > results/<series>/vN/logs-<k>/run-<n>.jsonl
  ```

  The trial runner picks the session's UUID at the start of the version; a resume passes the same `--session-id` with the fixed sentence. The web tool and the built-in GitHub MCP servers are removed, as Claude Code's web tools are. `--context=default` keeps the context at the model's standard window rather than the long one. Memory is off in prompt mode by default.
- **How a run ended:** read from the session events in the log. A run whose last main-agent message is a `session.error`, or that shut down with an error or without a `session.shutdown`, is an error: `errorType` `rate_limit` is the usage limit, `quota` (the monthly allowance or budget is spent) stops the task with exit code 2, and any other error is an API error. With no events at all, it is an infrastructure failure. Otherwise the tag decides between "done" and "stopped", as in 13.3.
- **Differences from Claude Code:**
  - Copilot has no turn limit. Turns (the main agent's `assistant.turn_start` events) are counted, and the cap is checked between runs only.
  - Copilot reports no cost in money. Each start records the `session.shutdown` metrics instead (tokens per model, requests, AI credits as `totalNanoAiu`); `total_cost_usd` is 0.
  - Auto-compactions are counted from `session.compaction_complete`.
  - The audit of 13.4 reads Copilot's `bash` and `write_bash` commands and its web tools from `tool.execution_start` events.
