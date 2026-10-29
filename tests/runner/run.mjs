#!/usr/bin/env node
// Hidden-test runner: runs scenarios against the real git and a target tgit, and compares them.
// Usage: node tests/runner/run.mjs --tgit '["node","/path/src/main.ts"]' [--jobs 8] [--json out.json] <dir-or-file>...
//        --tgit git   runs the real git on both sides (used to validate scenarios)
//        --strict     also fail a run step where the real git exits non-zero without an expectExit
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const STEP_TIMEOUT_MS = 120_000;
const STATE_FILES = ["MERGE_HEAD", "MERGE_MSG", "CHERRY_PICK_HEAD", "packed-refs"];

export const FIXED_ENV = {
  GIT_AUTHOR_NAME: "Alice Author",
  GIT_AUTHOR_EMAIL: "alice@example.com",
  GIT_AUTHOR_DATE: "1700000000 +0000",
  GIT_COMMITTER_NAME: "Carol Committer",
  GIT_COMMITTER_EMAIL: "carol@example.com",
  GIT_COMMITTER_DATE: "1700000000 +0000",
  TZ: "UTC",
  LANG: "C",
  LC_ALL: "C",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
  GIT_PAGER: "cat",
  PAGER: "cat",
};
const GLOBAL_CONFIG = "[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n";

function parseArgs(argv) {
  const opts = { tgit: null, strict: false, jobs: os.availableParallelism(), json: null, paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tgit") opts.tgit = argv[++i];
    else if (a === "--jobs") opts.jobs = Number(argv[++i]);
    else if (a === "--json") opts.json = argv[++i];
    else if (a === "--strict") opts.strict = true;
    else opts.paths.push(a);
  }
  if (!opts.tgit || opts.paths.length === 0) {
    console.error("usage: run.mjs --tgit <cmd|json-array|git> [--jobs N] [--json out] <path>...");
    process.exit(2);
  }
  opts.tgit = opts.tgit.trim().startsWith("[") ? JSON.parse(opts.tgit) : opts.tgit.split(/\s+/);
  return opts;
}

export function collect(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return p.endsWith(".json") && path.basename(p) !== "manifest.json" ? [p] : [];
  return fs.readdirSync(p).sort().flatMap((n) => collect(path.join(p, n)));
}

export function exec(cmd, args, { cwd, env, stdin }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    const out = [];
    const err = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, STEP_TIMEOUT_MS);
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: Buffer.alloc(0), stderr: Buffer.from(String(e)), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? -2 : code, stdout: Buffer.concat(out), stderr: Buffer.concat(err), timedOut });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(stdin ?? "");
  });
}

export function makeSide(base, name) {
  const dir = path.join(base, name);
  const home = path.join(dir, "home");
  const root = path.join(dir, "work");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(home, ".gitconfig"), GLOBAL_CONFIG);
  const env = { PATH: process.env.PATH, HOME: home, ...FIXED_ENV };
  return { root: fs.realpathSync(root), env };
}

function stepEnv(base, extra) {
  const env = { ...base };
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v === null) delete env[k];
    else env[k] = String(v);
  }
  return env;
}

function applyFsStep(root, step) {
  if ("write" in step) {
    const p = path.join(root, step.write);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) fs.unlinkSync(p);
    fs.writeFileSync(p, "contentBase64" in step ? Buffer.from(step.contentBase64, "base64") : step.content);
  } else if ("mkdir" in step) {
    fs.mkdirSync(path.join(root, step.mkdir), { recursive: true });
  } else if ("delete" in step) {
    fs.rmSync(path.join(root, step.delete), { recursive: true, force: true });
  } else if ("chmod" in step) {
    fs.chmodSync(path.join(root, step.chmod), parseInt(step.mode, 8));
  } else if ("symlink" in step) {
    const p = path.join(root, step.symlink);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.symlinkSync(step.target, p);
  } else {
    return false;
  }
  return true;
}

function findGitDirs(root) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 5) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const names = new Set(entries.map((e) => e.name));
    if (names.has("HEAD") && names.has("objects") && names.has("refs")) {
      found.push({ gitDir: dir, workTree: null });
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const p = path.join(dir, e.name);
      if (e.name === ".git") found.push({ gitDir: p, workTree: dir });
      else walk(p, depth + 1);
    }
  };
  walk(root, 0);
  return found.sort((a, b) => a.gitDir.localeCompare(b.gitDir));
}

function walkFiles(root, skip) {
  const files = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(dir, e.name);
      if (skip.has(p) || e.name === ".git") continue;
      const rel = path.relative(root, p);
      if (e.isSymbolicLink()) files[rel] = `link ${fs.readlinkSync(p)}`;
      else if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        const exe = (fs.statSync(p).mode & 0o100) !== 0;
        files[rel] = `${exe ? "exec" : "file"} ${createHash("sha256").update(fs.readFileSync(p)).digest("hex")}`;
      }
    }
  };
  walk(root);
  return files;
}

// Repository state, inspected with the real git on both sides.
export async function snapshot(side) {
  const { root, env } = side;
  const git = async (args) => {
    const r = await exec("git", args, { cwd: root, env });
    if (r.timedOut) side.timeouts = (side.timeouts ?? 0) + 1;
    return `${r.code}\n${r.stdout.toString("utf8")}`;
  };
  const dirs = findGitDirs(root);
  const repos = {};
  for (const { gitDir, workTree } of dirs) {
    const gd = ["--git-dir", gitDir];
    const read = (f) => {
      const p = path.join(gitDir, f);
      return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
    };
    const state = {
      HEAD: read("HEAD"),
      refs: await git([...gd, "for-each-ref", "--format=%(refname) %(objectname)"]),
      objects: (await git([...gd, "cat-file", "--batch-all-objects", "--batch-check=%(objectname) %(objecttype)"]))
        .split("\n")
        .sort()
        .join("\n"),
      config: await git([...gd, "config", "--local", "--list"]),
      index: fs.existsSync(path.join(gitDir, "index")) ? await git([...gd, "ls-files", "-s"]) : null,
      fsck: (await git([...gd, "fsck", "--strict", "--no-dangling", "--no-progress"])).split("\n")[0],
    };
    for (const f of STATE_FILES) state[f] = read(f);
    repos[path.relative(root, gitDir) || "."] = state;
  }
  const bare = new Set(dirs.filter((d) => d.workTree === null).map((d) => d.gitDir));
  return { repos, files: walkFiles(root, bare) };
}

export function firstDiff(a, b, prefix = "") {
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return a === b ? null : { key: prefix, git: a, tgit: b };
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) {
    const d = firstDiff(a[k], b[k], prefix ? `${prefix}.${k}` : k);
    if (d) return d;
  }
  return null;
}

export function normalize(buf, root) {
  return buf.toString("latin1").split(root).join("<ROOT>");
}

export async function runScenario(file, tgit, strict) {
  const scenario = JSON.parse(fs.readFileSync(file, "utf8"));
  const command = (i) => {
    const st = scenario.steps[i];
    return st && (st.run ?? st.git) ? `${"run" in st ? "" : "git:"}${(st.run ?? st.git)[0]}` : null;
  };
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tgit-hidden-"));
  const sides = { git: makeSide(base, "git"), tgit: makeSide(base, "tgit") };
  const timeouts = () => (sides.git.timeouts ?? 0) + (sides.tgit.timeouts ?? 0);
  const fail = (index, reason, detail) => ({ name: scenario.name, file, ok: false, step: index, command: command(index), reason, detail, timeouts: timeouts() });
  try {
    for (const [index, step] of scenario.steps.entries()) {
      if (applyFsStep(sides.git.root, step)) {
        applyFsStep(sides.tgit.root, step);
        continue;
      }
      const isRun = "run" in step;
      const args = isRun ? step.run : step.git;
      const results = {};
      for (const [name, side] of Object.entries(sides)) {
        const [cmd, ...pre] = isRun && name === "tgit" ? tgit : ["git"];
        results[name] = await exec(cmd, [...pre, ...args], {
          cwd: path.join(side.root, step.cwd ?? "."),
          env: stepEnv(side.env, step.env),
          stdin: step.stdin,
        });
      }
      const { git, tgit: t } = results;
      for (const [name, res] of Object.entries(results)) if (res.timedOut) sides[name].timeouts = (sides[name].timeouts ?? 0) + 1;
      if (step.expectExit !== undefined && git.code !== step.expectExit) {
        return fail(index, "scenario-error", `real git exited ${git.code}, expected ${step.expectExit}: ${git.stderr}`);
      }
      if ((strict || !isRun) && git.code !== 0 && step.expectExit === undefined) {
        return fail(index, "scenario-error", `git ${args.join(" ")} exited ${git.code}: ${git.stderr}`);
      }
      if (t.timedOut) return fail(index, "timeout", args.join(" "));
      if (git.code !== t.code) return fail(index, "exit-code", { git: git.code, tgit: t.code, stderr: t.stderr.toString() });
      if (step.matchOutput) {
        const a = normalize(git.stdout, sides.git.root);
        const b = normalize(t.stdout, sides.tgit.root);
        if (a !== b) return fail(index, "stdout", { git: a, tgit: b });
      }
      if (isRun || step.matchOutput) {
        const d = firstDiff(await snapshot(sides.git), await snapshot(sides.tgit));
        if (d) return fail(index, "state", d);
      }
    }
    const d = firstDiff(await snapshot(sides.git), await snapshot(sides.tgit));
    if (d) return fail(scenario.steps.length, "final-state", d);
    return { name: scenario.name, file, ok: true };
  } catch (e) {
    return fail(-1, "runner-error", String(e?.stack ?? e));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const files = opts.paths.flatMap(collect);
  const results = new Array(files.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      results[i] = await runScenario(files[i], opts.tgit, opts.strict);
      // A command that timed out may only mean the machine was overloaded: run the scenario once more.
      // A tgit that really hangs times out again and still fails.
      if (!results[i].ok && results[i].timeouts > 0) results[i] = { ...(await runScenario(files[i], opts.tgit, opts.strict)), retried: true };
      const r = results[i];
      if (++done % 100 === 0) console.log(`progress ${done}/${files.length}`);
      if (!r.ok) {
        const detail = typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail);
        console.log(`FAIL ${r.name} (step ${r.step}, ${r.reason}) ${detail.slice(0, 400)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.jobs) }, worker));
  const passed = results.filter((r) => r.ok).length;
  const errors = results.filter((r) => r.reason === "scenario-error" || r.reason === "runner-error").length;
  const retried = results.filter((r) => r.retried).length;
  console.log(`${passed}/${results.length} passed${errors ? `, ${errors} scenario/runner errors` : ""}${retried ? `, ${retried} rerun after a timeout` : ""}`);
  if (opts.json) fs.writeFileSync(opts.json, JSON.stringify(results, null, 2));
  process.exit(passed === results.length ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
