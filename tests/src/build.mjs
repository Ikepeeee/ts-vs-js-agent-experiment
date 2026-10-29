// Writes the scenario files:
//   tests/public/vN/*.json   public scenarios (spec format only), copied to test/difftest/scenarios/given/ in trials
//   tests/hidden/vN/*.json   hidden scenarios
//   tests/.validate/vN/*.json   public scenarios with expectExit kept, for validation only
//   tests/hidden/manifest.json, tests/public/manifest.json   id, version, section, level, title per scenario
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scenarios } from "./dsl.mjs";
import "./v1.mjs";
import "./v2.mjs";
import "./v3.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..");
const RUN_KEYS = new Set(["run", "cwd", "stdin", "env", "matchOutput"]);

function checkPublic(s) {
  for (const step of s.steps) {
    const keys = Object.keys(step).filter((k) => k !== "expectExit");
    const bad = "run" in step ? keys.filter((k) => !RUN_KEYS.has(k)) : "git" in step ? keys.filter((k) => k !== "git") : [];
    if (bad.length) throw new Error(`public scenario "${s.title}" uses non-spec fields: ${bad.join(", ")}`);
  }
}

const strip = (steps) =>
  steps.map((step) => {
    const { expectExit, ...rest } = step;
    return rest;
  });

for (const kind of ["public", "hidden", ".validate"]) fs.rmSync(path.join(out, kind), { recursive: true, force: true });

const manifests = { public: [], hidden: [] };
const counters = {};
for (const s of scenarios()) {
  const kind = s.pub ? "public" : "hidden";
  const key = `${kind}/${s.version}/${s.section}`;
  counters[key] = (counters[key] ?? 0) + 1;
  const id = `${s.version}-${s.section}-${String(counters[key]).padStart(2, "0")}`;
  if (s.pub) checkPublic(s);
  const json = { name: `${id}: ${s.title}`, steps: s.pub ? strip(s.steps) : s.steps };
  const file = path.join(out, kind, s.version, `${id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  if (s.pub) {
    // Unstripped copy, so validation can still check expectExit on public scenarios.
    const v = path.join(out, ".validate", s.version, `${id}.json`);
    fs.mkdirSync(path.dirname(v), { recursive: true });
    fs.writeFileSync(v, JSON.stringify({ ...json, steps: s.steps }, null, 2) + "\n");
  }
  manifests[kind].push({ id, version: s.version, section: s.section, level: s.level, title: s.title });
}

for (const [kind, list] of Object.entries(manifests)) {
  fs.writeFileSync(path.join(out, kind, "manifest.json"), JSON.stringify(list, null, 2) + "\n");
  const summary = {};
  for (const m of list) {
    summary[m.version] ??= { total: 0, basic: 0, edge: 0 };
    summary[m.version].total++;
    summary[m.version][m.level]++;
  }
  console.log(kind, JSON.stringify(summary));
}
