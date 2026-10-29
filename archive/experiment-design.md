# How type annotations and type checking affect the bugs left in AI-generated code: experiment design

Oct 27, 2026 · @Toru Ikeda

Japanese version: `experiment-design_ja.md`. This English version is canonical; where the two differ, this one prevails.

## Goals and research questions

Within TypeScript and JavaScript only, turn "type annotations" and "type-checking feedback" on and off separately, and measure how the **bugs that remain after the code passes the verification loop** change in code written by an AI agent. Other languages such as Python or Rust are not compared, so differences in training data between languages do not enter the comparison.

- **RQ1 (primary):** Does type-checking feedback reduce the remaining bugs?
- **RQ2:** Do type annotations reduce the remaining bugs as "context", even without checking?
- **RQ3:** Is each effect worth its cost in time and tokens?
- **RQ4 (exploratory):** Is the effect larger for tasks whose changes spread widely?

TypeScript and JavaScript suit this design well. Node.js can strip type annotations and run TypeScript as is, so a condition that "writes annotations but does not check them" can be built without changing the runtime. The TypeScript checker can also check JavaScript files by inference, so "checking without annotations" uses the same checker. Endo's benchmark has results for JavaScript and TypeScript, which also give a baseline.

However, the distribution of training data is not exactly the same for TypeScript and JavaScript. This difference mixes into the effect of the annotation factor (A). The type-checking factor (F) is compared within the same file format, so it is not affected.

## Hypotheses

The following four are pre-registered before the runs. Their directions are written down first and not changed after seeing the results.

| ID | Hypothesis | RQ |
| --- | --- | --- |
| H1 | With type-checking feedback, the hidden-test failure rate goes down | RQ1 |
| H2 | Type annotations alone (no checking) barely change the failure rate | RQ2 |
| H3 | Type-checking feedback increases time and tokens by 1.3× or more (for reference, in Endo's results TypeScript cost about 1.6× JavaScript) | RQ3 |
| H4 | The effect in H1 is larger for changes across modules (T3) than for a small feature addition (T2) | RQ4 |

H2 is a "no difference" hypothesis, so it is judged not by non-significance but by whether the 95% confidence interval of the effect size falls within a range decided in advance (odds ratio 0.8–1.25). With few trials, it is likely not to fall within this range and to be "inconclusive". In that case it is reported as such.

The control condition (C-review), which checks whether the effect of type checking is simply due to more reviewing, is left out this time and moved to the second stage.

## Conditions

Four conditions, 2×2 of "type annotations (A)" × "type-checking feedback (F)". Without annotations the agent writes JavaScript; with annotations, TypeScript.

| Condition | File format | Type-checking feedback | Role |
| --- | --- | --- | --- |
| A0F0 | JavaScript | None | Baseline (plain JavaScript) |
| A0F1 | JavaScript | Yes (inference-only checking with `tsc`'s `checkJs`) | Effect of type checking without annotations |
| A1F0 | TypeScript (Node.js strips the types and runs it) | None | Effect of annotations as "context" |
| A1F1 | TypeScript | Yes (`tsc`) | Full typed development |

**Manipulating type annotations (A)**

- A1: `.ts` files. The starting code is annotated, and the agent is told to "write types for the parameters and return values of every function". So that Node.js can run it as is, only syntax that runs once the types are erased is allowed (no `enum` or `namespace`).
- A0: `.js` files. The agent receives the same TypeScript code with only the annotations removed by a type-stripping tool (such as ts-blank-space). The logic is kept identical. The agent is told "do not write types (not even JSDoc type comments)".

**Manipulating feedback (F)**

- F1: `tsc --noEmit` runs automatically after every edit, and the result goes back to the agent. It cannot finish until there are no type errors. The settings are shared by A0 and A1: `strict`, plus `allowJs` and `checkJs` for A0. Checking JavaScript relies mostly on inference, so the amount of false positives is checked in the pilot.
- F0: the TypeScript compiler is not installed in the container, and types are not mentioned. In A1F0, code with type mistakes still runs, and they are found by tests only when they show in behavior.

**Shared by all conditions**

- ESLint (recommended rules, excluding rules that use type information) and the visible tests are available in every condition. Undefined variables and the like are caught without type checking, so what is measured is "the gain from adding type checking to a realistic development environment".
- The prompts differ only in the one or two sentences per condition above. The full text is published.

## Task design

Two tasks that change existing code. Types are said to help in changes, and for new implementations Endo's results (597 of 600 passed) suggest little difference, so new implementations are left out this time.

| Task | Kind | Content | Starting code | Expected size |
| --- | --- | --- | --- | --- |
| T2 | Adding features to existing code | Add `branch`, `merge` (fast-forward only) and `tag` to Endo's simple Git | A fixed reference implementation | about 400 lines |
| T3 | A change across modules | In a small booking API of my own, add a required field (a time range with a time zone) to the booking data type and update every user of it | A fixed reference implementation | 2,000–3,000 lines |

- **T2** asks whether the agent can use the existing internal API correctly. I prepare the simple Git reference implementation (equivalent to v1 and v2) myself.
- **T3** is the task where a data type change spreads widely, the one where types should help most. It is built with only Node.js's standard `http` and an in-memory store, and does not connect to outside services. It is my own, so it is not in the models' training data.
- All reference implementations are written in TypeScript, and the JavaScript versions are made with a type-stripping tool. Both have identical logic.
- No external libraries at run time. The development tools (ESLint, and `typescript` for F1 only) are pinned.
- The spec is the same for every condition. It says nothing about types.
- The reference implementations are finished first, and I also build the changed versions myself and confirm they pass every test (confirming the tasks are solvable).

## Agent and environment

Each trial starts a new container. The only differences between conditions are "the tools available", "the file format" and "one or two sentences of instructions".

- **Agent:** Claude Code in non-interactive mode (`claude -p`), within a Claude subscription plan.
- **Model:** a Sonnet-class model, pinned to its ID. It uses less of the usage limit and fails more often than the top model, so differences are easier to see with few trials. A replication with the top model is moved to the second stage.
- **Container:** the image is pinned by digest. Node.js is pinned to a version where running with type stripping is on by default. ESLint and, for F1 only, the TypeScript compiler are installed at pinned versions. Tests run with Node.js's built-in `node:test`. All outside traffic except to Claude is blocked.
- **How F1 works:** a Claude Code hook runs `tsc --noEmit` (incremental build) after every file edit and returns the result. A hook at the end refuses to finish while type errors remain.
- **Done when:** all visible tests pass, and in F1 there are no type errors. Or a cap is reached.
- **Caps per trial:** shared by all conditions, on turns and elapsed time (rough figures: 50 turns, 30 minutes; fixed in the pilot). A trial that hits a cap is not excluded; its code at that point is evaluated.
- **Records:** the full conversation log, elapsed time, turns, the final diff, and in F1 the number of type errors at each point. Costs come from the `--output-format json` output: input and output tokens and the estimated cost at API prices.
- **Run order:** the combinations of condition and task are shuffled at random and run mixed over the same period. A trial interrupted by a usage limit is discarded and redone in the same order, and the number discarded is reported.
- Writing the run definitions as typed tasks in Lask would make the trials' reproducibility part of what is published (optional).

## Test design: visible tests and hidden tests

For each task, a complete test suite is written first and **split in half at random**, and only one half is shown to the agent. This keeps the experimenter from choosing where the gaps in the tests are.

**How the test suite is written**

- Black-box tests based on the spec. T1 and T2 look only at the CLI's input and output, T3 only at HTTP requests and responses. They do not depend on internal types or function names, so neither TypeScript nor JavaScript has an advantage.
- The tests are written in untyped JavaScript and run with `node:test`.
- Three kinds: examples from the spec; edge cases (an empty repository, Japanese file names, bookings across a date boundary and the like); and property-based tests (fast-check; for example, checking out after a commit restores the original content, and booked time ranges do not overlap).
- An AI may draft them, but I always review them myself and confirm the reference implementation passes all of them.
- Mutation testing (StrykerJS) runs against the reference implementation, recording the detection rate for "visible tests only" and for "all". This shows in numbers how full of holes the visible tests are.

**Splitting and management**

- The tests are split in strata per feature (command or endpoint), so every feature has both visible and hidden tests. The random seed is published.
- The split is the same for every condition and every trial.
- The test suite is frozen before the main experiment, and its hash goes into the pre-registration. Nothing is added afterwards.
- The hidden tests are not put in the container; they run in a separate environment after the trial ends.
- The visible tests are read-only, and their hashes are checked at the end. This prevents weakening the tests to pass.
- The hidden tests do no type checking at all. A1's output also runs on Node.js with the types stripped, and only behavior is judged.

## Metrics

There is a single primary metric, "the hidden-test failure rate". Everything else is set apart in advance as a secondary metric.

| Kind | Metric | Definition |
| --- | --- | --- |
| Primary | Hidden-test failure rate | The number of hidden tests the trial's final code fails ÷ the total number of hidden tests |
| Secondary | Whether bugs remain | The share of trials that fail at least one hidden test |
| Secondary | Cost | Tokens (input and output), estimated cost at API prices (dollars), elapsed time (seconds), turns |
| Secondary | Completion rate | The share of trials that met the completion criteria within the caps |
| Secondary | Latent type errors | The number of type errors from checking F0's final code with `tsc` after the trial (descriptive only, not tested) |
| Manipulation check | Type annotation coverage | The share of functions with types in A1, and the number of JSDoc type comments mixed into A0 |
| Manipulation check | Attempts to change tests | The number of attempts to write to the visible tests |

**Classifying the bugs (exploratory)**

- About 100 hidden-test failures are sampled at random and classified into four causes: interface or type mismatch, logic error, misreading of the spec, missed edge case.
- The condition is hidden during classification. A1's code is also read with its types stripped, so the condition cannot be told at a glance.
- If types help, only "interface or type mismatch" should decrease, with the others unchanged.

## Number of trials and statistical analysis

The main experiment runs in two stages. First, 80 trials of 4 conditions × 2 tasks × 10 each. If the criteria decided in advance give no conclusion, 10 more each are added, up to 160 trials.

**How the numbers were decided**

- Even with 20 per condition, only large differences can be detected (the baseline's failure rate is high enough and is halved). Small differences are reported as "not detected", not as "no difference".
- The pilot measures A0F0's failure rate. If it is too low (as a rough guide, fewer than 20% of trials fail a hidden test), the tasks are made harder before the main experiment. The tasks are not changed during the main experiment.
- One interim analysis only. If the p-value of H1's main effect is below 0.005, the experiment stops with an effect. Otherwise it continues, with a significance level of about 0.048 for the final analysis (an O'Brien–Fleming-type allocation). These criteria are also pre-registered.

**Analysis**

- The primary analysis is a generalized linear mixed model (logistic) with the pass or fail of each hidden test as the outcome. Fixed effects: annotations (A), feedback (F), A×F, task. Random effects: trial and test item. With few trials, counting failures per test item gains information.
- Results are reported as odds ratios with 95% confidence intervals, not only p-values.
- Three comparisons are decided in advance. H1: A0F1 vs A0F0, A1F1 vs A1F0. H2: A1F0 vs A0F0. Multiple comparisons are corrected with Holm's method.
- H4 (differences by task) is looked at through the F × task interaction. It is exploratory, so it is reported separately and not included in the correction.
- Cost (H3) is compared on the log of tokens and elapsed time, and reported as a ratio.
- Trials that hit a cap are included in the primary analysis. The results without them are shown alongside as a sensitivity analysis.

## Threats to validity and countermeasures

The biggest weakness is that the effect of type annotations (A) is mixed with the difference in training data between TypeScript and JavaScript. The effect of type checking (F), the primary question, is compared within the same file format and is not affected.

| Threat | What it is | Countermeasure |
| --- | --- | --- |
| Bias in training data | TypeScript and JavaScript code differ in age and domain | Compare F within the same format. Interpret A's results as "annotations plus the difference in format" |
| Difference in effort | F1 thinks longer, so it may simply be reviewing more | Record tokens and show the difference. Add the control condition (C-review) in the second stage. Keep the per-trial caps the same for all conditions |
| Steering by the experimenter | Where the gaps in the tests are changes the results | Split at random, and pre-register the seed and hashes |
| Leaking the hidden tests | The agent sees the hidden tests | Keep them out of the container and out of the spec |
| Ignoring instructions | Writing JSDoc types in A0, leaving out annotations in A1 | Measure and report type annotation coverage |
| Weakening tests to pass | Rewriting the visible tests | Make them read-only, and check their hashes at the end |
| Changes in the model | The API's behavior changes during the period | Pin the model ID, and run the conditions mixed in random order |
| Overlap with ESLint | Undefined variables and the like are caught without type checking | Use the same ESLint in all conditions, and interpret the effect as "a gain on top" |
| Limits of generalization | Two change tasks, a single Sonnet-class model | State that the conclusions are limited to "TypeScript and JavaScript at this scale" |
| Experimenter preference | The experimenter expects types to help | Pre-registration, and publishing all raw data and analysis code |

## Procedure and pre-registration

Before the main experiment, the tests and the analysis plan are frozen and published, and then the runs start. At two hours on weekday evenings, it is expected to take about eight weeks.

1. **Weeks 1–2: preparing the tasks.** The reference implementations of T2 and T3 (TypeScript), the correct changed versions, the JavaScript versions, the specs and the test suites.
2. **Week 3: infrastructure.** The container, the F1 hooks, the records, and the environment for evaluating the hidden tests.
3. **Week 4: pilot.** 16 trials, 2 each of 4 conditions × T2 and T3. Check infrastructure bugs, A0F0's failure rate, the per-trial caps, false positives from `tsc` on JavaScript, and how many trials a day the subscription allows. Pilot data is not used in the main analysis.
4. **End of week 4: pre-registration.** Publish the hypotheses, the primary metric, the comparisons, the numbers, the interim-analysis criteria, the analysis code, the tests' hashes and the random seeds as a tagged commit (or on OSF).
5. **Weeks 5–7: main experiment.** Run in random order, a little at a time overnight within the usage limits, automatically. Do the interim analysis at 80 trials, and run the remaining 80 if needed.
6. **Week 8: analysis and writing.** The analysis as pre-registered, the blinded classification of bugs, and the text for publication.

&#91;embedded content: the flow of one trial · inside and outside the container\]

Each trial runs in this flow. The agent can touch only what is inside the dotted frame, and the hidden tests run in a separate environment after the trial.

## Budget

The trials run within a Claude subscription plan, so there is almost no extra cost. The constraint is not money but the usage limit, which sets how many days the experiment takes.

| Stage | Trials | Breakdown |
| --- | --- | --- |
| Pilot | 16 | 4 conditions × 2 tasks × 2 |
| Main, stage 1 | 80 | 4 conditions × 2 tasks × 10 |
| Main, stage 2 (only if needed) | 80 | 4 conditions × 2 tasks × 10 |
| Total | 96–176 | Less than half of the initial plan of about 300 trials |

- The number of trials per day is measured in the pilot, and the schedule of the main experiment is fixed from it.
- The cost metrics are reported as tokens and their estimated cost at API prices. It is stated that this is not what was actually paid.
- If the usage limit stretches the schedule a lot, running only stage 2 on the API is an option. The model ID and settings stay the same in that case.

## Outputs and publication

Published whichever way the results go. In an area nobody has measured yet, "no difference" is also information.

- **Repository:** the tasks and specs, the reference implementations, the infrastructure, the analysis code. The hidden tests are published after the main experiment.
- **Raw data:** the conversation logs, diffs, hidden-test results and costs of every trial.
- **Pre-registration:** the version published before the main experiment, and the differences between it and the final report.
- **Articles:** in Japanese and English. Positioned as filling the gap in Endo's benchmark, which "does not measure the bugs that remain".
- **Reusable machinery:** the infrastructure that counts remaining bugs with hidden tests can serve directly as the core of the idea of a test framework for the AI era.

Candidates for the second stage: adding the control condition that equalizes effort (C-review), a new-implementation task (simple Git v1 and v2), a replication with the top model, change tasks on a larger real repository, and a replication of the same design in Python (pyright).
