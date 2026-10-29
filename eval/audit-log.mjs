#!/usr/bin/env node
// Looks through a version's conversation logs for what experiment-design.md chapter 5 forbids: fetching outside information
// and installing packages other than the allowed dev dependencies (13.4). Also checks package.json.
// Usage: node eval/audit-log.mjs --lang ts --repo <repo> --out audit.json <logs-dir>...
import fs from "node:fs";
import path from "node:path";

const ALLOWED = {
  ts: ["typescript", "@types/node", "eslint", "@eslint/js", "typescript-eslint", "fast-check"],
  js: ["eslint", "@eslint/js", "fast-check"],
};
// Programs the allowed packages install, which npx may run without downloading anything.
const LOCAL_BINS = ["tsc", "eslint"];

// [rule, pattern] pairs matched against each Bash command.
const RULES = [
  ["download", /(^|[\s;&|(`$])(curl|wget)\b/],
  ["git-network", /\bgit\s+(clone|fetch|pull|ls-remote|submodule)\b/],
  ["npm-fetch", /\bnpm\s+(pack|view|v|info|show|docs|repo|home|search)\b/],
  ["other-package-manager", /(^|[\s;&|(])(pip3?|apt(-get)?|yarn|pnpm|bun|brew|gem|cargo)\s/],
];

const args = process.argv.slice(2);
const take = (name) => {
  const i = args.indexOf(name);
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const lang = take("--lang");
const repo = take("--repo");
const outFile = take("--out");
const allowed = new Set(ALLOWED[lang]);

// Package names given to npm install/i/add, without their version ranges.
function installed(command) {
  const names = [];
  for (const m of command.matchAll(/\bnpm\s+(?:install|i|add)\b([^;&|\n]*)/g)) {
    for (const word of m[1].trim().split(/\s+/)) {
      if (!word || word.startsWith("-")) continue;
      names.push(word.startsWith("@") ? word.replace(/^(@[^/]+\/[^@]+)@.*$/, "$1") : word.replace(/@.*$/, ""));
    }
  }
  return names;
}

const violations = [];
let commands = 0;
for (const dir of args) {
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
    const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!line.includes('"tool_use"')) return;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      for (const item of event?.message?.content ?? []) {
        if (item?.type !== "tool_use") continue;
        const where = { log: path.join(path.basename(dir), file), line: index + 1, tool: item.name };
        if (item.name === "WebFetch" || item.name === "WebSearch") violations.push({ ...where, rule: "web-tool", command: JSON.stringify(item.input).slice(0, 300) });
        if (item.name !== "Bash") continue;
        const command = String(item.input?.command ?? "");
        commands++;
        for (const [rule, pattern] of RULES) if (pattern.test(command)) violations.push({ ...where, rule, command: command.slice(0, 300) });
        for (const name of installed(command)) if (!allowed.has(name)) violations.push({ ...where, rule: "disallowed-install", package: name, command: command.slice(0, 300) });
        for (const m of command.matchAll(/\bnpx\s+(?:-[^\s]+\s+)*([^\s;&|]+)/g)) {
          if (!LOCAL_BINS.includes(m[1])) violations.push({ ...where, rule: "npx-download", package: m[1], command: command.slice(0, 300) });
        }
      }
    });
  }
}

// What the repository itself declares.
const pkgPath = path.join(repo, "package.json");
const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf8")) : {};
const dependencies = Object.keys(pkg.dependencies ?? {});
const devDependencies = Object.keys(pkg.devDependencies ?? {});
const extra = [...dependencies, ...devDependencies.filter((d) => !allowed.has(d))];

fs.writeFileSync(
  outFile,
  JSON.stringify({ lang, bash_commands: commands, violations, package_json: { dependencies, devDependencies, extra } }, null, 2) + "\n",
);
