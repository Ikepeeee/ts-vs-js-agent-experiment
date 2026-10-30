# TypeScript vs JavaScript: a controlled experiment

AI agents implement the same specification (tgit v0.1.0 to v0.3.0) from scratch, once in TypeScript and once in JavaScript.
The experiment compares the bugs that remain and the cost of getting there. The only difference between the conditions is the language, along with the type checking that comes with it.

Japanese version: `README_ja.md`. This English version is canonical; where the two differ, this one prevails.

## Layout

| Path | Contents | Read by |
|---|---|---|
| `README.md` | This file (Japanese: `README_ja.md`) | Humans |
| `experiment-design.md` | The design of the controlled experiment. The run procedure is chapter 13 (Japanese: `experiment-design_ja.md`) | Humans |
| `main.lask` | Every operation of the experiment, as lask tasks | Humans |
| `spec/spec-v1.md` to `spec-v3.md` | The tgit specification (English). The same for both conditions | AI (one version at a time) |
| `ts/AGENTS.md` | Instructions placed in the repository for the TypeScript condition | AI |
| `js/AGENTS.md` | Instructions placed in the repository for the JavaScript condition | AI |
| `tests/` | Public tests (given to the AI), hidden tests, runner and generator (also given to the AI) | Humans (`tests/public/`, the runner and the generator are also given to the AI) |
| `images/` | Definitions of the trial and evaluation container images | Humans |
| `eval/` | Evaluation scripts | Humans |
| `playground/` | Each series' working home, where the agent works (created by `exp-v1`, not committed) | AI (its own series only) |
| `results/` | Trial results (created by the trial runner) | Humans |
| `lask.json`, `lask.lock.json` | The lask module the tasks use, and the pinned images lask runs | Humans |
| `archive/` | Material from before the switch to the controlled experiment (design, reference-implementation prompts, verification steps) | Humans |

`ts/AGENTS.md` and `js/AGENTS.md` differ only in the language, the type checking, the file extension, the dev dependencies, and whether `typecheck` exists.
Everything else is identical, word for word. To check, run `diff ts/AGENTS.md js/AGENTS.md`.

The design from before the switch is `archive/experiment-design.md`. It was exported from a Claude document; the original is https://claude.ai/artifact/5cvSGJp8F3pThZJHPbLJ6n.
The design of the controlled experiment is `experiment-design.md`.

## Usage

Every operation is a `lask run <task>` typed in this folder. The trials also need the agent's token in an environment variable: `CLAUDE_CODE_OAUTH_TOKEN` for Claude Code, or `COPILOT_GITHUB_TOKEN` for GitHub Copilot CLI. You need lask 0.13.0 and a running Docker. See chapter 13 of `experiment-design.md` for details.

```sh
lask sync                       # pull and build the images lask runs
lask run build-images           # build the trial images (Claude Code, GitHub Copilot CLI)
lask run validate               # confirm the tests themselves (about 15 minutes)
lask run freeze                 # take the hashes to pre-register
lask run login                  # create a long-lived Claude token
export CLAUDE_CODE_OAUTH_TOKEN=<token>   # or keep this line in .env and: source .env
lask run exp-v1 S01 --lang ts --model claude-opus-5-5   # start a series: v0.1.0 in playground/S01_ts_claude-opus-5-5/
lask run exp-v2 S01             # continue with v0.2.0, same conditions
lask run exp-v3 S01             # and v0.3.0
lask run evaluate S01           # evaluate it; results are in results/S01_ts_claude-opus-5-5/
lask run exp-v1 C01 --agent copilot --lang ts --model claude-opus-5.5   # a series with GitHub Copilot CLI (needs COPILOT_GITHUB_TOKEN)
lask run --help                 # list the tasks
```

The AI works in a container that sees only its series' home in `playground/`. It cannot see the rest of this folder, such as the hidden tests.
