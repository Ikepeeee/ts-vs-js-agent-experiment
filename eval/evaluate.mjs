#!/usr/bin/env node
// Evaluates one version of one series (experiment-design.md 13.4). Runs inside the evaluation image, from the
// experiment root, with the network off.
// Usage: node eval/evaluate.mjs --dir results/S01/v2 --lang ts --version v2
// Writes <dir>/eval/: hidden.json, public.json, random.json, realrepo.json (v3), size.json,
// audit.json, checkjs.json (js), *.log, and summary.json.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const VERSIONS = ["v1", "v2", "v3"];

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) throw new Error(`missing ${name}`);
  return args[i + 1];
};
const dir = opt("--dir");
const lang = opt("--lang");
const version = opt("--version");
if (!["ts", "js"].includes(lang) || !VERSIONS.includes(version)) throw new Error("bad --lang or --version");

const out = path.join(dir, "eval");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const sh = (cmd, cmdArgs, logName) => {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8", maxBuffer: 1 << 30 });
  if (logName) fs.writeFileSync(path.join(out, logName), `${r.stdout ?? ""}${r.stderr ?? ""}`);
  return r;
};

// The repository as the agent left it.
sh("tar", ["-xf", path.join(dir, "repo.tar"), "-C", out]);
const repo = path.resolve(out, "tgit");
const tgit = JSON.stringify(["node", path.join(repo, "src", `main.${lang}`)]);
const upTo = VERSIONS.slice(0, VERSIONS.indexOf(version) + 1);

const runner = (name, paths) => sh("node", ["tests/runner/run.mjs", "--tgit", tgit, "--json", path.join(out, `${name}.json`), ...paths], `${name}.log`);
runner("hidden", upTo.map((v) => `tests/hidden/${v}`));
runner("public", upTo.map((v) => `tests/public/${v}`));
const randomDir = fs.mkdtempSync("/tmp/random-");
sh("node", ["tests/random/gen.mjs", "--version", version, "--out", randomDir], "random-gen.log");
runner("random", [randomDir]);
fs.rmSync(randomDir, { recursive: true, force: true });
if (version === "v3") sh("node", ["tests/realrepo/compare.mjs", "--tgit", tgit, "--json", path.join(out, "realrepo.json")], "realrepo.log");

const logDirs = fs.readdirSync(dir).filter((n) => n.startsWith("logs-")).map((n) => path.join(dir, n));
sh("node", ["eval/size.mjs", repo, path.join(out, "size.json")]);
sh("node", ["eval/audit-log.mjs", "--lang", lang, "--repo", repo, "--out", path.join(out, "audit.json"), ...logDirs]);

// Latent type errors in the JavaScript condition (descriptive only).
if (lang === "js") {
  const files = sh("find", [path.join(repo, "src"), "-name", "*.js", "-o", "-name", "*.mjs"]).stdout.split("\n").filter(Boolean).sort();
  const tscArgs = ["--allowJs", "--checkJs", "--noEmit", "--skipLibCheck", "--module", "nodenext", "--target", "es2024",
    "--typeRoots", "/usr/local/lib/node_modules/@types", "--types", "node"];
  const r = files.length ? sh("tsc", [...tscArgs, ...files], "checkjs.log") : { stdout: "" };
  const errors = (r.stdout ?? "").split("\n").filter((l) => /error TS\d+/.test(l)).length;
  fs.writeFileSync(path.join(out, "checkjs.json"), JSON.stringify({ command: ["tsc", ...tscArgs, "<src files>"], files: files.length, errors }, null, 2));
}

// One summary per version, the input of the analysis (experiment-design.md chapter 7).
const read = (name) => (fs.existsSync(path.join(out, name)) ? JSON.parse(fs.readFileSync(path.join(out, name), "utf8")) : null);
const tally = (results) =>
  results && { passed: results.filter((r) => r.ok).length, total: results.length, retried: results.filter((r) => r.retried).length };
const random = read("random.json");
const byCommand = {};
for (const r of random ?? []) if (!r.ok) byCommand[r.command ?? r.reason] = (byCommand[r.command ?? r.reason] ?? 0) + 1;
const audit = read("audit.json");
fs.writeFileSync(
  path.join(out, "summary.json"),
  JSON.stringify(
    {
      dir,
      lang,
      version,
      hidden: tally(read("hidden.json")),
      public: tally(read("public.json")),
      random: random && { ...tally(random), failures_by_command: byCommand },
      realrepo: tally(read("realrepo.json")),
      size: read("size.json"),
      audit: audit && { violations: audit.violations.length, extra_dependencies: audit.package_json.extra },
      checkjs_errors: read("checkjs.json")?.errors ?? null,
    },
    null,
    2,
  ) + "\n",
);
console.log(`evaluated ${dir}`);
