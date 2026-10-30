# tgit

## About this repository

`tgit` is a Git-compatible command-line tool written in TypeScript.
It reads and writes the same repository format as the real `git` (the `.git` directory), and for every command it implements, it aims to produce the same results as the real one.

What to build is given as a specification document for each release.

## Technical constraints (must follow)

- **Language:** TypeScript (ES modules, with `"type": "module"` in `package.json`). Use only syntax that Node.js can run directly by stripping types.
  - Do not use: `enum`, `namespace`, constructor parameter properties (`constructor(private x: T)`), decorators, `import x = require()`
  - Enable `erasableSyntaxOnly` and `verbatimModuleSyntax` in `tsconfig.json`, and import types with `import type`
  - Type strictness: `strict: true` and `noUncheckedIndexedAccess: true`. Do not use `any`
- **Execution:** No build step. The tool runs directly with `node src/main.ts`. Pin the Node.js version in `.nvmrc`
- **Dependencies:** Zero runtime dependencies. Use only Node.js built-in modules
  - The only dev dependencies are `typescript`, `@types/node`, `eslint`, `@eslint/js`, and `typescript-eslint`. If you need another one, stop and ask a human
- **Network:** Do not use it, except to install the dev dependencies above from the npm registry. Do not download, fetch, or read other packages or source code (for example with `curl`, `git clone`, or `npm pack`)
- **Comments and identifiers:** Write them in English

## Design principles

- Dependencies flow one way: entry point → commands → shared logic
  - `src/main.ts`: parses arguments and dispatches to a command
  - `src/cli/`: argument parsing, output formatting, exit codes
  - `src/commands/<name>.ts`: one file per command, registered in `src/commands/registry.ts`. Commands never import each other directly
  - `src/core/`: logic shared by multiple commands, split into subdirectories by concern
- Build only what is needed now. Do not add abstractions or configuration options in anticipation of future extensions

## Compatibility with the real git

- **Repository format:** Fully compatible. Repositories created by tgit pass the real `git fsck`, and tgit can read repositories created by the real git
- **Object hashes:** Given the same author, dates, and so on, tgit produces the same hashes as the real git
- **Output:** Anything the specification marks as "output must match" must match the real git character for character
- **Exit codes:** Match the real git
- **Error message wording:** Need not match, but must go to standard error
- When in doubt, do not guess. Try it with the real git to confirm the behavior, write the result down in `docs/notes/`, and then implement it

## Testing

- `npm test`: unit tests (`node --test`)
- `npm run difftest`: differential tests against the real git: your scenarios and a run of random sequences
- `npm run lint`: ESLint
- `npm run typecheck`: `tsc --noEmit`

### How differential testing works

It lives in `test/difftest/`. The same sequence of commands is run against both the real `git` and `tgit`, each in its own temporary directory, and the results are compared.

- The tools are provided in `test/difftest/tools/`. Use them as they are
  - `run.mjs` runs scenarios and compares the two sides: `node test/difftest/tools/run.mjs --tgit "node $PWD/src/main.ts" <dir-or-file>...` (the tgit command needs an absolute path, because each side runs in a temporary directory)
  - `gen.mjs` writes random command sequences for a version as scenarios: `node test/difftest/tools/gen.mjs --version v1 --seed <seed> --count <n> --out <dir>`. Run them with `run.mjs`
- What is compared: exit codes, output covered by the "output must match" rule, the set of objects written to `.git/objects`, refs, the index, the contents of working tree files, and the real `git fsck --strict` on the tgit side
- Fixed environment (set by `run.mjs`): `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_AUTHOR_DATE`, `GIT_COMMITTER_*`, `TZ=UTC`, `LANG=C`, `GIT_CONFIG_NOSYSTEM=1`, and a dedicated `HOME` whose `.gitconfig` sets `init.defaultBranch=main` and `core.autocrlf=false`
  - tgit reads these two settings from `$HOME/.gitconfig`, as the real git does
- Hand-written scenarios live in `test/difftest/scenarios/**/*.json`
  - `test/difftest/scenarios/given/` holds the scenarios provided with the specifications. Put the scenarios you write elsewhere under `test/difftest/scenarios/`, never in `given/`
  - When a random sequence fails, save a reduced reproduction as a scenario
- Use the real git's default settings. Never change the real git's configuration (for example, diff or merge settings) to make its output easier to match

### What every command's tests must cover

- Running from a subdirectory of the working tree, not only from the root
- Paths containing spaces, non-ASCII characters, and names starting with `-`
- Error cases: invalid arguments, missing paths or objects, running outside a repository. The exit codes must match the real git
- Both the normal case and the case where the repository has no commits yet, where that makes sense for the command

### Rules about tests

- For any new command or feature, write the differential test scenarios first, confirm the expected results with the real git, and then implement it
- Never delete existing tests, loosen their expectations, or mark them `skip`. If you believe a test is wrong, stop and report why
- Never modify, rename, or add to the files in `test/difftest/scenarios/given/` and `test/difftest/tools/`. If you believe one of them is wrong, stop and report why
- Do not add branches to the implementation that exist only to make the differential tests pass
- Work is "done" only when `npm test`, `npm run difftest`, `npm run typecheck`, and `npm run lint` all pass

## How to work

- Implement only what the specification asks for. Do not build features ahead of it
- Commit in small units. Write commit messages in English, one line describing what you did
- When a release is finished, append to `docs/progress.md` what was done and any known differences from the real git
- Prioritize readability. Avoid duplication, but do not compress code to the point where it becomes hard to read
- When a specification is unclear, follow the real git's behavior. If that still does not settle it, stop and ask a human
