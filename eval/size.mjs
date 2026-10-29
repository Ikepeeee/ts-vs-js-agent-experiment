#!/usr/bin/env node
// Size of a tgit repository (experiment-design.md chapter 6, size): implementation lines without tests, and the tests the agent wrote.
// Usage: node eval/size.mjs <repo> <out.json>
import fs from "node:fs";
import path from "node:path";

const [repo, outFile] = process.argv.slice(2);
const SKIP = new Set([".git", "node_modules"]);
const CODE = /\.(ts|mts|js|mjs)$/;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP.has(e.name) ? [] : walk(p);
    return e.isFile() ? [p] : [];
  });
}

// Lines that are not blank and not only a comment.
function codeLines(file) {
  let inBlock = false;
  let n = 0;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (inBlock) {
      if (line.includes("*/")) inBlock = false;
      continue;
    }
    if (line === "" || line.startsWith("//")) continue;
    if (line.startsWith("/*")) {
      if (!line.includes("*/")) inBlock = true;
      continue;
    }
    n++;
  }
  return n;
}

const files = walk(repo).map((p) => path.relative(repo, p));
const isTest = (f) => f.startsWith("test/") || /(^|\/)__tests__\//.test(f) || /\.test\.(ts|js|mjs)$/.test(f);
const impl = files.filter((f) => CODE.test(f) && !isTest(f));
const tests = files.filter((f) => CODE.test(f) && isTest(f));
const scenarios = files.filter((f) => f.startsWith("test/difftest/scenarios/") && f.endsWith(".json") && !f.includes("/given/"));
const count = (list) => list.reduce((sum, f) => sum + codeLines(path.join(repo, f)), 0);

fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      implementation: { files: impl.length, lines: count(impl) },
      tests: { files: tests.length, lines: count(tests) },
      scenarios_written: scenarios.length,
    },
    null,
    2,
  ) + "\n",
);
