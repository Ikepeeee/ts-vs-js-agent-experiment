#!/usr/bin/env node
// Real-repository comparison (hidden test 3): runs read-only commands on psf/requests with the real git and tgit.
// Each pack layout from spec-v3.md's done criteria is tested: after `git gc`, and after a REF_DELTA repack.
//   node tests/realrepo/compare.mjs make-commands [--seed 20261029]   writes commands.json from requests.tar
//   node tests/realrepo/compare.mjs --tgit '["node","/path/src/main.ts"]' [--json out.json]
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec, firstDiff, makeSide, normalize, snapshot } from "../runner/run.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE = path.join(here, "requests.tar");
const COMMANDS = path.join(here, "commands.json");
const LAYOUTS = {
  gc: [["gc", "-q"]],
  "ref-delta": [["-c", "repack.useDeltaBaseOffset=false", "repack", "-a", "-d", "-f", "-q"]],
};

async function git(side, args, cwd = side.root) {
  const r = await exec("git", args, { cwd, env: side.env });
  if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.toString("utf8");
}

// Extracts the archive into side.root as a non-bare repository with main checked out.
async function checkout(side) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "realrepo-"));
  await exec("tar", ["-xf", ARCHIVE, "-C", tmp], { cwd: tmp, env: side.env });
  fs.renameSync(path.join(tmp, "requests.git"), path.join(side.root, ".git"));
  fs.rmSync(tmp, { recursive: true, force: true });
  await git(side, ["config", "core.bare", "false"]);
  await git(side, ["reset", "-q", "--hard"]);
}

function rng(seedText) {
  let h = createHash("sha256").update(seedText).digest().readUInt32LE(0);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function makeCommands(seed) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "realrepo-cmd-"));
  const side = makeSide(base, "git");
  await checkout(side);
  const rand = rng(`${seed}/realrepo`);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const list = (s) => s.split("\n").filter(Boolean);
  const commits = list(await git(side, ["rev-list", "HEAD"]));
  const merges = list(await git(side, ["rev-list", "--merges", "HEAD"]));
  const tags = list(await git(side, ["for-each-ref", "--format=%(objecttype) %(refname:short)", "refs/tags"]));
  const annotated = tags.filter((t) => t.startsWith("tag ")).map((t) => t.slice(4));
  const paths = list(await git(side, ["ls-tree", "-r", "--name-only", "HEAD"]));
  const dirs = [...new Set(paths.filter((p) => p.includes("/")).map((p) => p.split("/")[0]))];
  const objectsOf = async (commit, type) =>
    list(await git(side, ["ls-tree", "-r", "-t", commit])).filter((l) => l.split(" ")[1] === type).map((l) => l.split(/\s/)[2]);

  const cmds = [];
  const add = (...args) => cmds.push(args);
  for (let i = 0; i < 15; i++) add("cat-file", "-p", pick(commits));
  for (let i = 0; i < 10; i++) add("cat-file", "-p", pick(await objectsOf(pick(commits), "tree")));
  for (let i = 0; i < 10; i++) add("cat-file", "-p", pick(await objectsOf(pick(commits), "blob")));
  for (let i = 0; i < 10; i++) add("cat-file", pick(["-t", "-s"]), pick([pick(commits), pick(await objectsOf(pick(commits), "blob"))]));
  for (let i = 0; i < 8; i++) add("cat-file", "-p", pick(annotated));
  for (let i = 0; i < 5; i++) add("rev-parse", `${pick(commits)}~${Math.floor(rand() * 20)}`);
  for (let i = 0; i < 5; i++) add("rev-parse", pick(commits).slice(0, 7 + Math.floor(rand() * 6)));
  for (let i = 0; i < 3; i++) add("rev-parse", "--short", pick(commits));
  for (let i = 0; i < 3; i++) add("rev-parse", pick(tags).split(" ")[1]);
  add("log", "--oneline");
  add("log", "--format=%H %P %an %ae %ad %s");
  add("log", "-n", "200");
  add("log", "-p", "-n", "3");
  for (let i = 0; i < 8; i++) add("log", "--oneline", "--", pick(paths));
  for (let i = 0; i < 3; i++) add("log", "--oneline", "--", pick(dirs));
  for (let i = 0; i < 7; i++) add("show", pick(commits));
  for (let i = 0; i < 3; i++) add("show", pick(merges));
  for (let i = 0; i < 3; i++) add("show", pick(annotated));
  for (let i = 0; i < 8; i++) add("diff", pick(commits), pick(commits));
  for (let i = 0; i < 3; i++) add("diff", "--stat", pick(commits), pick(commits));
  for (let i = 0; i < 3; i++) add("diff", "--name-status", pick(commits), pick(commits));
  for (let i = 0; i < 6; i++) add("merge-base", pick(commits), pick(commits));
  for (let i = 0; i < 2; i++) add("merge-base", "--all", pick(merges), pick(commits));
  add("ls-files");
  add("ls-files", "-s");
  add("status", "--porcelain");
  add("branch");
  add("tag");
  fs.writeFileSync(COMMANDS, JSON.stringify({ seed, archiveSha256: sha256(ARCHIVE), commands: cmds }, null, 1) + "\n");
  fs.rmSync(base, { recursive: true, force: true });
  console.log(`${cmds.length} commands written to ${COMMANDS}`);
}

const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

async function compare(tgit, jsonOut) {
  const { commands, archiveSha256 } = JSON.parse(fs.readFileSync(COMMANDS, "utf8"));
  if (sha256(ARCHIVE) !== archiveSha256) throw new Error("requests.tar does not match the archive commands.json was made from");
  const results = [];
  for (const [layout, setup] of Object.entries(LAYOUTS)) {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "realrepo-"));
    const sides = { git: makeSide(base, "git"), tgit: makeSide(base, "tgit") };
    // Prepare one side with the real git, then copy it, so both sides start byte for byte the same.
    await checkout(sides.git);
    for (const args of setup) await git(sides.git, args);
    fs.rmSync(sides.tgit.root, { recursive: true, force: true });
    fs.cpSync(sides.git.root, sides.tgit.root, { recursive: true, verbatimSymlinks: true });
    for (const args of commands) {
      const g = await exec("git", args, { cwd: sides.git.root, env: sides.git.env });
      const [cmd, ...pre] = tgit;
      const t = await exec(cmd, [...pre, ...args], { cwd: sides.tgit.root, env: sides.tgit.env });
      const a = normalize(g.stdout, sides.git.root);
      const b = normalize(t.stdout, sides.tgit.root);
      const ok = g.code === t.code && a === b;
      results.push({ layout, command: args.join(" "), ok, ...(ok ? {} : { exit: { git: g.code, tgit: t.code }, stdoutDiffers: a !== b }) });
      if (!ok) console.log(`FAIL [${layout}] ${args.join(" ")} exit ${g.code}/${t.code}${a !== b ? ", stdout differs" : ""}`);
    }
    const d = firstDiff(await snapshot(sides.git), await snapshot(sides.tgit));
    results.push({ layout, command: "(repository state after all commands)", ok: !d, ...(d ? { detail: d } : {}) });
    if (d) console.log(`FAIL [${layout}] repository state differs at ${d.key}`);
    fs.rmSync(base, { recursive: true, force: true });
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} passed`);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));
  process.exit(passed === results.length ? 0 : 1);
}

const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
if (args[0] === "make-commands") await makeCommands(opt("--seed", "20261029"));
else if (opt("--tgit")) {
  const t = opt("--tgit");
  await compare(t.trim().startsWith("[") ? JSON.parse(t) : t.split(/\s+/), opt("--json"));
} else {
  console.error("usage: compare.mjs make-commands [--seed N] | compare.mjs --tgit <cmd|json-array|git> [--json out]");
  process.exit(2);
}
