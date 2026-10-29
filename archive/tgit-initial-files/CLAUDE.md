# tgit

## About this repository

`tgit` is a Git-compatible command-line tool written in TypeScript.
It reads and writes the same repository format as the real `git` (the `.git` directory), and for every command it implements, it aims to produce the same results as the real one.

## Technical constraints (must follow)

- **Language:** TypeScript. Use only syntax that Node.js can run directly by stripping types.
  - Do not use: `enum`, `namespace`, constructor parameter properties (`constructor(private x: T)`), decorators, `import x = require()`
  - Enable `erasableSyntaxOnly` and `verbatimModuleSyntax` in `tsconfig.json`, and import types with `import type`
- **Type strictness:** `strict: true`, `noUncheckedIndexedAccess: true`. Do not use `any`. Where it seems unavoidable, accept `unknown` and narrow it
- **Execution:** No build step. The tool runs directly with `node src/main.ts`. Pin the Node.js version in `.nvmrc`
- **Dependencies:** Zero runtime dependencies. Use only Node.js built-in modules
  - The only dev dependencies are `typescript`, `@types/node`, `eslint`, `typescript-eslint`, and `fast-check`. If you need another one, stop and ask a human
- **Network:** Do not use it
- **Comments and identifiers:** Write them in English

## Design principles

- Dependencies flow one way: entry point → commands → shared logic
  - `src/main.ts`: parses arguments and dispatches to a command
  - `src/cli/`: argument parsing, output formatting, exit codes
  - `src/commands/<name>.ts`: one file per command, registered in `src/commands/registry.ts`. Commands never import each other directly
  - `src/core/`: logic shared by multiple commands, split into subdirectories by concern
- Build only what is needed now. Do not add abstractions or configuration options in anticipation of future extensions
- Use distinct types for values with different meanings so they cannot be mixed up (for example, branded types for object IDs and paths)

## Compatibility with the real git

- **Repository format:** Fully compatible. Repositories created by tgit pass the real `git fsck`, and tgit can read repositories created by the real git
- **Object hashes:** Given the same author, dates, and so on, tgit produces the same hashes as the real git
- **Output:** Machine-oriented output (such as `--porcelain`) and anything an instruction marks as "output must match" must match the real git character for character
- **Exit codes:** Match the real git
- **Error message wording:** Need not match, but must go to standard error
- When in doubt, do not guess. Try it with the real git to confirm the behavior, write the result down in `docs/notes/`, and then implement it

## Testing

- `npm test`: unit tests (`node --test`)
- `npm run difftest`: differential tests against the real git
- `npm run typecheck`: `tsc --noEmit`
- `npm run lint`: ESLint

### How differential testing works

It lives in `test/difftest/`. The same sequence of commands is run against both the real `git` and `tgit`, each in its own temporary directory, and the results are compared.

- What is compared: exit codes, output covered by the "output must match" rule, the set of objects written to `.git/objects`, refs, the index, and the contents of working tree files (the tgit-side repository is also inspected with the real git)
- Fixed environment: `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_AUTHOR_DATE`, `GIT_COMMITTER_*`, `TZ=UTC`, `LANG=C`, a dedicated `HOME`, `GIT_CONFIG_NOSYSTEM=1`, `init.defaultBranch=main`, `core.autocrlf=false`
- Two kinds of scenarios
  - Hand-written scenarios (`test/difftest/scenarios/*.json`)
  - Randomly generated command sequences using fast-check (property-based tests). When one fails, save the shrunk reproduction as a scenario
- Run the real `git fsck --strict` on every repository tgit creates
- Use the real git's default settings. Never change the real git's configuration (for example, diff or merge settings) to make its output easier to match
- The random generator takes its seed from `DIFFTEST_SEED` and the number of runs from `DIFFTEST_RUNS`, and prints the seed it used. The defaults are a fixed seed and 200 runs

### What every command's tests must cover

- Running from a subdirectory of the working tree, not only from the root
- Paths containing spaces, non-ASCII characters, and names starting with `-`
- Error cases: invalid arguments, missing paths or objects, running outside a repository. The exit codes must match the real git
- Both the normal case and the case where the repository has no commits yet, where that makes sense for the command

### Rules about tests

- For any new command or feature, write the differential test scenarios first, confirm the expected results with the real git, and then implement it. Also add it to the random generator
- Never delete existing tests, loosen their expectations, or mark them `skip`. If you believe a test is wrong, stop and report why
- Do not add branches to the implementation that exist only to make the differential tests pass
- Work is "done" only when `npm test`, `npm run difftest`, `npm run typecheck`, and `npm run lint` all pass

## How to work

- Implement only what you were asked to. Do not build features ahead of instructions
- Commit in small units. Write commit messages in English, one line describing what you did
- When an instructed task is finished, append to `docs/progress.md` what was done and any known differences from the real git
- Prioritize readability. Avoid duplication, but do not compress code to the point where it becomes hard to read
- When a specification is unclear, follow the real git's behavior. If that still does not settle it, stop and ask a human
