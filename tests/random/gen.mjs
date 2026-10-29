#!/usr/bin/env node
// Random differential test generator (hidden test 2). Writes command sequences as scenario files that
// tests/runner/run.mjs runs against the real git and tgit.
// Usage: node tests/random/gen.mjs --version v2 [--seed 20261029] [--count 2000] --out <dir>
// The sequences depend only on the version, the seed, and this file, so the output can be regenerated and hashed.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const VERSIONS = ["v1", "v2", "v3"];
const PATHS = ["a.txt", "b.txt", "d/c.txt", "d/e/f.txt", "sp ace.txt", "日本.txt", "-x.txt", "app.log", "tmp/t.txt"];
const WORDS = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa"];
const BRANCHES = ["main", "topic", "fix", "feature/x", "old"];
const TAGS = ["v1", "v2", "rel-1", "Z"];
const REVS = ["HEAD", "HEAD~1", "HEAD^", "HEAD~2", "HEAD~1^"];
const BASE_TIME = 1700000000;

function rng(seedText) {
  let h = createHash("sha256").update(seedText).digest().readUInt32LE(0);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(version, rand) {
  const level = VERSIONS.indexOf(version) + 1;
  const int = (n) => Math.floor(rand() * n);
  const pick = (arr) => arr[int(arr.length)];
  const chance = (p) => rand() < p;
  const steps = [];
  const state = { files: new Set(), branches: new Set(["main"]), tags: new Set(), keys: new Set(), worked: new Set(), current: "main", n: 0 };

  // Every run step gets its own date, so commits made by different steps never share a timestamp.
  const run = (args, matchOutput = false) => {
    state.n++;
    const d = `${BASE_TIME + state.n * 60} +0000`;
    const step = { run: args, env: { GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d, GIT_EDITOR: "true" } };
    if (matchOutput) step.matchOutput = true;
    steps.push(step);
  };
  const ro = (...args) => run(args, true);
  const r = (...args) => run(args);
  const somePath = () => (state.files.size && chance(0.8) ? pick([...state.files]) : pick(PATHS));
  const someBranch = () => (chance(0.8) ? pick([...state.branches]) : pick(BRANCHES));
  const otherBranch = () => {
    const others = [...state.branches].filter((b) => b !== state.current);
    return others.length && chance(0.9) ? pick(others) : someBranch();
  };
  // A branch that got its own commits in workOnBranch, so picking or rebasing onto it has something to do.
  const workedBranch = () => {
    const worked = [...state.worked].filter((b) => b !== state.current);
    return worked.length && chance(0.8) ? pick(worked) : otherBranch();
  };
  const commitPending = () => {
    if (chance(0.7)) {
      r("add", "-A");
      r("commit", "-m", message());
    }
  };
  const switchTo = (b) => {
    state.branches.add(b);
    state.current = b;
  };
  const someRev = () => (chance(0.7) ? pick(REVS) : someBranch());
  const message = () => `${pick(WORDS)} ${pick(WORDS)}`;

  const content = () => {
    const lines = Array.from({ length: 1 + int(8) }, () => pick(WORDS));
    if (level >= 2 && chance(0.05)) return { contentBase64: Buffer.from([0, 1, 2, int(256), 0, int(256)]).toString("base64") };
    const eol = level >= 2 && chance(0.05) ? "\r\n" : "\n";
    return { content: lines.join(eol) + (chance(0.1) ? "" : eol) };
  };
  const writeFile = (p = pick(PATHS)) => {
    steps.push({ write: p, ...content() });
    state.files.add(p);
  };
  const resolve = () => {
    for (const p of [...state.files].slice(0, 3)) steps.push({ write: p, content: `resolved ${pick(WORDS)}\n` });
    r("add", "-A");
  };

  const ignoreFiles = () => {
    const patterns = level >= 2 ? ["*.log", "!keep.log", "**/tmp", "d/**/f.txt", "/a.txt", "# comment", "tmp/", "\\#x"] : ["*.log", "d/", "/a.txt", "# comment", "tmp/", ""];
    const text = Array.from({ length: 1 + int(3) }, () => pick(patterns)).join("\n") + "\n";
    const target = level >= 2 ? pick([".gitignore", ".gitignore", "d/.gitignore", ".git/info/exclude"]) : ".gitignore";
    steps.push({ write: target, content: text });
  };

  // Commit on another branch and come back, so that branches diverge for merge, cherry-pick, and rebase.
  const workOnBranch = () => {
    const back = state.current;
    const b = pick(BRANCHES.filter((x) => x !== back));
    if (state.branches.has(b)) r("switch", b);
    else r("switch", "-c", b);
    switchTo(b);
    for (let i = 0; i < 1 + int(2); i++) {
      writeFile(chance(0.6) ? pick(["a.txt", "b.txt", "d/c.txt"]) : undefined);
      r("add", "-A");
      r("commit", "-m", message());
    }
    state.worked.add(b);
    r("switch", back);
    state.current = back;
    return b;
  };

  const ops = [
    [3, workOnBranch],
    [6, () => writeFile()],
    [1, () => {
      const p = somePath();
      steps.push({ delete: p });
      state.files.delete(p);
    }],
    [1, ignoreFiles],
    [4, () => pick([() => r("add", "--", somePath()), () => r("add", "."), () => r("add", "-A"), () => r("add", "-u")])()],
    [1, () => r("rm", ...pick([["--cached"], ["-f"], [], ["-r"]]), "--", somePath())],
    [4, () => pick([() => r("commit", "-m", message()), () => r("commit", "-a", "-m", message()), () => r("commit", "--allow-empty", "-m", message()), () => r("commit", "--amend", "-m", message())])()],
    [2, () => ro("status", "--porcelain")],
    [1, () => ro("ls-files", ...pick([[], ["-s"], ["-o"], ["-o", "--exclude-standard"], ["-c"]]))],
    [2, () => ro("log", ...pick([[], ["--oneline"], ["-n", "2"], ["--format=%H %P %an %ae %ad %s%n%b"], ["--oneline", "--", somePath()]]))],
    [1, () => ro("rev-parse", ...pick([[someRev()], ["--short", someRev()], ["--abbrev-ref", "HEAD"]]))],
    [1, () => ro("cat-file", pick(["-p", "-t", "-s"]), someRev())],
    [1, () => ro("hash-object", ...(chance(0.5) ? ["-w"] : []), "--", somePath())],
    [1, () => ro("show", "-s", someRev())],
    [2, () => {
      const b = pick(BRANCHES);
      pick([
        () => {
          r("branch", b, ...(chance(0.3) ? [pick(REVS)] : []));
          state.branches.add(b);
        },
        () => r("branch", "-d", someBranch()),
        () => r("branch", "-D", someBranch()),
        () => {
          r("branch", "-m", b);
          state.branches.add(b);
        },
        () => ro("branch"),
      ])();
    }],
    [2, () => {
      const b = pick(BRANCHES);
      pick([
        () => {
          const b2 = someBranch();
          r("switch", b2);
          state.current = b2;
        },
        () => {
          r("switch", "-c", b);
          switchTo(b);
        },
        () => r("switch", "--detach", someRev()),
        () => {
          const b2 = someBranch();
          r("checkout", b2);
          state.current = b2;
        },
        () => r("checkout", "--", somePath()),
        () => {
          r("checkout", "-b", b);
          switchTo(b);
        },
      ])();
    }],
    [1, () => pick([() => r("reset", pick(["--soft", "--mixed", "--hard"]), pick(REVS)), () => r("reset", "--", somePath()), () => r("reset", pick(REVS), "--", somePath())])()],
    [1, () => {
      const t = pick(TAGS);
      pick([
        () => {
          r("tag", t, ...(chance(0.3) ? [pick(REVS)] : []));
          state.tags.add(t);
        },
        () => ro("tag"),
        () => r("tag", "-d", state.tags.size && chance(0.8) ? pick([...state.tags]) : t),
      ])();
    }],
  ];
  if (level >= 2) {
    ops.push(
      [3, () => ro("diff", ...pick([[], ["--cached"], ["HEAD~1", "HEAD"], ["--stat"], ["--name-only"], ["--name-status", "HEAD~2", "HEAD"], ["--", "d"], ["--cached", "--stat"]]))],
      [1, () => pick([() => ro("show", someRev()), () => ro("log", "-p", "-n", "2")])()],
      [1, () => {
        const key = pick(["core.editor", "my.key", "branch.main.description", "user.name"]);
        const known = () => (state.keys.size && chance(0.8) ? pick([...state.keys]) : key);
        pick([
          () => {
            r("config", key, `${pick(WORDS)} "q" #${int(9)}`);
            state.keys.add(key);
          },
          () => ro("config", known()),
          () => r("config", "--unset", known()),
          () => ro("config", "--list"),
        ])();
      }],
      [3, () => {
        r("merge", ...pick([[], ["--no-ff"], ["--ff-only"], ["-m", message()]]), otherBranch());
        if (chance(0.2)) r("merge", "--abort");
        else {
          resolve();
          r("commit", "-m", "Resolve merge");
        }
      }],
      [1, () => ro("merge-base", ...(chance(0.3) ? ["--all"] : []), state.current, otherBranch())],
      [1, () => {
        const t = pick(TAGS);
        r("tag", "-a", t, "-m", message(), ...(chance(0.3) ? [pick(REVS)] : []));
        state.tags.add(t);
      }],
      [2, () => pick([() => r("stash"), () => r("stash", "push"), () => r("stash", "pop"), () => r("stash", "apply"), () => ro("stash", "list"), () => r("stash", "drop")])()],
    );
  }
  if (level >= 3) {
    ops.push(
      [2, () => {
        commitPending();
        r("cherry-pick", chance(0.6) ? workOnBranch() : workedBranch());
        if (chance(0.5)) r("cherry-pick", "--abort");
        else {
          resolve();
          r("cherry-pick", "--continue");
        }
      }],
      [1, () => r("revert", "--no-edit", pick(REVS))],
      [2, () => {
        commitPending();
        r("rebase", ...(chance(0.3) ? ["--onto", otherBranch()] : []), workedBranch());
        if (chance(0.5)) r("rebase", "--abort");
        else {
          resolve();
          r("rebase", "--continue");
        }
      }],
      [2, () => (chance(0.5) ? ro("reflog") : ro("reflog", "show", someBranch()))],
      [1, () => r("pack-refs", "--all")],
      [1, () => steps.push({ git: ["gc", "-q"] })],
    );
  }

  // Start: a repository made by tgit or the real git with one commit; in v3, sometimes a gc-ed history made by the real git.
  if (level >= 3 && chance(0.3)) {
    steps.push({ git: ["init", "-q"] });
    for (let i = 0; i < 4 + int(6); i++) {
      writeFile();
      steps.push({ git: ["add", "-A"] }, { git: ["-c", `user.name=Setup`, "commit", "-q", "--allow-empty", "-m", `setup ${i}`] });
    }
    steps.push({ git: ["gc", "-q"] });
  } else {
    if (chance(0.5)) r("init", "-q");
    else steps.push({ git: ["init", "-q"] });
    // An initial commit, so that main exists before other branches are made (and sometimes a status before it).
    writeFile();
    writeFile();
    if (chance(0.3)) ro("status", "--porcelain");
    r("add", "-A");
    r("commit", "-m", "initial");
  }

  const total = ops.reduce((a, [wt]) => a + wt, 0);
  const length = 15 + int(16);
  while (steps.filter((st) => "run" in st).length < length) {
    let k = rand() * total;
    for (const [wt, op] of ops) {
      if ((k -= wt) < 0) {
        op();
        break;
      }
    }
  }
  return steps;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, def) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : def;
  };
  const version = opt("--version");
  const seed = opt("--seed", "20261029");
  const count = Number(opt("--count", "2000"));
  const out = opt("--out");
  if (!VERSIONS.includes(version) || !out) {
    console.error("usage: gen.mjs --version v1|v2|v3 [--seed N] [--count N] --out <dir>");
    process.exit(2);
  }
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const digest = createHash("sha256");
  for (let i = 1; i <= count; i++) {
    const id = `${version}-random-${String(i).padStart(4, "0")}`;
    const json = JSON.stringify({ name: `${id} (seed ${seed})`, steps: generate(version, rng(`${seed}/${version}/${i}`)) }, null, 1) + "\n";
    digest.update(json);
    fs.writeFileSync(path.join(out, `${id}.json`), json);
  }
  console.log(`${count} sequences for ${version}, seed ${seed}, sha256 ${digest.digest("hex")}`);
}

main();
