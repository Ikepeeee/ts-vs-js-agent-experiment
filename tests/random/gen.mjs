#!/usr/bin/env node
// Random differential test generator (hidden test 2). Writes command sequences as scenario files that
// tests/runner/run.mjs runs against the real git and tgit.
// Usage: node tests/random/gen.mjs --version v2 --seed <seed> [--count 2000] --out <dir>
// The sequences depend only on the version, the seed, and this file, so the output can be regenerated and hashed.
// The agent gets a copy of this file in test/difftest/tools/; the hidden test's seed is not given to it.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const VERSIONS = ["v1", "v2", "v3"];
const PATHS = ["a.txt", "b.txt", "d/c.txt", "d/e/f.txt", "sp ace.txt", "日本.txt", "-x.txt", "app.log", "tmp/t.txt"];
// The paths workOnBranch changes on other branches.
const BRANCH_PATHS = ["a.txt", "b.txt", "d/c.txt"];
const BINARY = "bin.dat";
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
  const state = { files: new Set(), branches: new Set(["main"]), tags: new Set(), worked: new Set(), current: "main", n: 0 };

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
  const someRev = () => (chance(0.7) ? pick(REVS) : level >= 3 && state.tags.size && chance(0.3) ? pick([...state.tags]) : someBranch());
  const message = () => `${pick(WORDS)} ${pick(WORDS)}`;
  const switchTo = (b) => {
    state.branches.add(b);
    state.current = b;
  };

  // Binary content goes only to BINARY, which no other branch changes, so merges never conflict on it.
  const content = () => {
    const lines = Array.from({ length: 1 + int(8) }, () => pick(WORDS));
    return { content: lines.join("\n") + (chance(0.1) ? "" : "\n") };
  };
  const writeFile = (p = pick(PATHS)) => {
    steps.push({ write: p, ...content() });
    state.files.add(p);
  };
  const writeBinary = () => {
    steps.push({ write: BINARY, contentBase64: Buffer.from([0, 1, 2, int(256), 0, int(256)]).toString("base64") });
    state.files.add(BINARY);
  };
  // Only paths that other branches never change are deleted, so merges have no modify/delete conflicts.
  const deleteFile = () => {
    const p = pick([...state.files].filter((f) => !BRANCH_PATHS.includes(f)).concat(PATHS.filter((f) => !BRANCH_PATHS.includes(f))));
    steps.push({ delete: p });
    state.files.delete(p);
  };
  const resolve = () => {
    for (const p of BRANCH_PATHS.filter((f) => state.files.has(f))) steps.push({ write: p, content: `resolved ${pick(WORDS)}\n` });
    r("add", "-A");
  };
  const ignoreFiles = () => {
    const patterns = ["*.log", "d/", "# comment", "tmp/", "", "*.txt"];
    steps.push({ write: ".gitignore", content: Array.from({ length: 1 + int(3) }, () => pick(patterns)).join("\n") + "\n" });
  };

  // Commit on another branch and come back, so that branches diverge for merge and cherry-pick.
  const workOnBranch = () => {
    const back = state.current;
    const b = pick(BRANCHES.filter((x) => x !== back));
    if (state.branches.has(b)) r("switch", b);
    else r("switch", "-c", b);
    switchTo(b);
    for (let i = 0; i < 1 + int(2); i++) {
      writeFile(pick(BRANCH_PATHS));
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
    [1, deleteFile],
    [1, ignoreFiles],
    [4, () => pick([() => r("add", "--", somePath()), () => r("add", "."), () => r("add", "-A")])()],
    [4, () => pick([() => r("commit", "-m", message()), () => r("commit", "-a", "-m", message())])()],
    [2, () => ro("status", "--porcelain")],
    [1, () => ro("ls-files", ...pick([[], ["-s"]]))],
    [2, () => ro("log", ...pick([[], ["--oneline"], ["-n", "2"], ["--oneline", "-n", "1"]]))],
    [1, () => ro("rev-parse", someRev())],
    [1, () => ro("cat-file", pick(["-p", "-t", "-s"]), someRev())],
    [1, () => ro("hash-object", ...(chance(0.5) ? ["-w"] : []), "--", somePath())],
    [2, () => {
      const b = pick(BRANCHES);
      pick([
        () => {
          r("branch", b, ...(chance(0.3) ? [pick(REVS)] : []));
          state.branches.add(b);
        },
        () => r("branch", "-d", someBranch()),
        () => ro("branch"),
      ])();
    }],
    [2, () => {
      if (chance(0.7)) {
        const b = someBranch();
        r("switch", b);
        state.current = b;
      } else {
        const b = pick(BRANCHES);
        r("switch", "-c", b);
        switchTo(b);
      }
    }],
  ];
  if (level >= 2) {
    ops.push(
      [1, writeBinary],
      [3, () => ro("diff", ...pick([[], ["--cached"], ["HEAD~1", "HEAD"], ["--name-only"], ["--cached", "--name-only"]]))],
      [1, () => ro("show", someRev())],
      [1, () => ro("merge-base", state.current, otherBranch())],
      [3, () => {
        r("merge", ...(chance(0.3) ? ["-m", message()] : []), chance(0.6) ? workOnBranch() : otherBranch());
        resolve();
        r("commit", "-m", "Resolve merge");
      }],
    );
  }
  if (level >= 3) {
    ops.push(
      [1, () => {
        const t = pick(TAGS);
        pick([
          () => {
            r("tag", t, ...(chance(0.3) ? [pick(REVS)] : []));
            state.tags.add(t);
          },
          () => {
            r("tag", "-a", t, "-m", message(), ...(chance(0.3) ? [pick(REVS)] : []));
            state.tags.add(t);
          },
          () => ro("tag"),
          () => r("tag", "-d", state.tags.size && chance(0.8) ? pick([...state.tags]) : t),
        ])();
      }],
      [1, () => r("reset", ...pick([[], ["--soft"], ["--mixed"], ["--hard"]]), ...(chance(0.7) ? [pick(REVS)] : []))],
      [2, () => {
        r("cherry-pick", workOnBranch());
        ro("status", "--porcelain");
        r("cherry-pick", "--abort");
      }],
      [1, () => {
        r("add", "-A");
        r("commit", "-m", message());
        r("revert", "--no-edit", "HEAD");
      }],
      [2, () => (chance(0.5) ? ro("reflog") : ro("reflog", "show", someBranch()))],
    );
  }

  // Start: a repository made by tgit or the real git with one commit, so that main exists before other branches.
  if (chance(0.5)) r("init", "-q");
  else steps.push({ git: ["init", "-q"] });
  writeFile();
  writeFile();
  if (chance(0.3)) ro("status", "--porcelain");
  r("add", "-A");
  r("commit", "-m", "initial");

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
  const seed = opt("--seed");
  const count = Number(opt("--count", "2000"));
  const out = opt("--out");
  if (!VERSIONS.includes(version) || !seed || !out) {
    console.error("usage: gen.mjs --version v1|v2|v3 --seed <seed> [--count N] --out <dir>");
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
