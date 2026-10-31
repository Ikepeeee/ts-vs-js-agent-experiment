# Performance study: how type annotations and type checking affect the bugs left in AI-generated code

The material for an experiment on how type annotations and type-checking feedback change the bugs that remain in AI-written code after it has passed the verification loop.

Japanese version: `README-reference-implementation_ja.md`. This English version is canonical; where the two differ, this one prevails.

## Layout

| Path | Contents | Read by |
|---|---|---|
| `README-reference-implementation.md` | This file (Japanese: `README-reference-implementation_ja.md`) | Humans |
| `tgit-initial-files/CLAUDE.md` | Instructions placed in the repository of the task CLI "tgit" (English) | AI |
| `for-humans/tgit-prompts.md` | The prompt and test requirements for each step of the tgit implementation (English) | Humans, who give the AI one step at a time |
| `for-humans/tgit-verification.md` | Procedure for checking by hand that each step is complete (Japanese: `tgit-verification_ja.md`) | Humans |

## Usage

1. Create the tgit repository **outside this folder** (for example, `~/workspace/tgit`).
   Inside this folder, the AI could read the material in `for-humans/`.
2. Copy `tgit-initial-files/CLAUDE.md` to the root of the tgit repository.
3. Give the AI the step 1 prompt from `for-humans/tgit-prompts.md`, in a new conversation.
4. When it finishes, verify with `for-humans/tgit-verification.md`, and move to the next step if it passes.
   Use a new conversation for each step.

## Notes

- Do not show the material in `for-humans/` to the AI. It reveals what comes later (which features will and will not be built).
- For the experiment's trials, decide again how to handle `CLAUDE.md`, `docs/progress.md` and the like in the tgit repository,
  and run each trial with an empty home directory and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.
