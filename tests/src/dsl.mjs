// Small helpers for writing scenarios. Each helper returns a step in the scenario format of spec-v1.md section 1.
// Hidden scenarios may also use two runner-only extensions: `env` on `git` steps, and `expectExit` (checked
// against the real git when validating). Public scenarios use only the spec format; build.mjs enforces this.
import { createHash } from "node:crypto";

export const w = (path, content) => ({ write: path, content });
export const wb = (path, bytes) => ({ write: path, contentBase64: Buffer.from(bytes).toString("base64") });
export const mk = (path) => ({ mkdir: path });
export const del = (path) => ({ delete: path });
export const chmod = (path, mode = "755") => ({ chmod: path, mode });
export const ln = (path, target) => ({ symlink: path, target });
export const g = (...args) => ({ git: args });
export const r = (...args) => ({ run: args });
export const ro = (...args) => ({ run: args, matchOutput: true });

// Modifiers: at("sub", ro("status")), x(128, r("rm", "nope")), env({...}, g(...)), stdin("text", r(...))
export const at = (cwd, step) => ({ ...step, cwd });
export const x = (code, step) => ({ ...step, expectExit: code });
export const env = (vars, step) => ({ ...step, env: { ...(step.env ?? {}), ...vars } });
export const stdin = (text, step) => ({ ...step, stdin: text });

// Commit dates: setup commits normally share one timestamp; `when(n, step)` moves a step n minutes later.
export const when = (n, step) => {
  const d = `${1700000000 + n * 60} +0000`;
  return env({ GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d }, step);
};

export const blobId = (content) => {
  const body = Buffer.from(content);
  return createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest("hex");
};

// Tree ID for a map of path -> content (or { content, mode: "100755" } / { link: target }), computed like git.
export const treeId = (map) => {
  const hash = (type, body) => createHash("sha1").update(Buffer.concat([Buffer.from(`${type} ${body.length}\0`), body])).digest();
  const build = (entries) => {
    const children = {};
    for (const [p, v] of entries) {
      const [head, ...rest] = p.split("/");
      if (rest.length) (children[head] ??= { dir: [] }).dir.push([rest.join("/"), v]);
      else children[head] = { file: v };
    }
    const items = Object.entries(children).map(([name, c]) => {
      if (c.dir) return { name, key: `${name}/`, mode: "40000", id: build(c.dir) };
      const v = c.file;
      if (typeof v === "object" && "link" in v) return { name, key: name, mode: "120000", id: hash("blob", Buffer.from(v.link)) };
      const content = typeof v === "string" ? v : v.content;
      return { name, key: name, mode: typeof v === "string" ? "100644" : v.mode, id: hash("blob", Buffer.from(content)) };
    });
    items.sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
    return hash("tree", Buffer.concat(items.flatMap((i) => [Buffer.from(`${i.mode} ${i.name}\0`), i.id])));
  };
  return build(Object.entries(map)).toString("hex");
};

export const files = (map) => Object.entries(map).map(([p, c]) => w(p, c));
export const commitAll = (msg) => [g("add", "-A"), g("commit", "-q", "-m", msg)];
export const repo = (map = {}, msg = "initial") => [g("init", "-q"), ...files(map), ...commitAll(msg)];

// A small project used as the starting point of many scenarios.
export const BASE = {
  "README.md": "# Demo\n\nA small project.\n",
  "src/app.js": "console.log('hello');\n",
  "src/lib/util.js": "export const add = (a, b) => a + b;\n",
  "docs/guide.txt": "Read me first.\n",
};
export const base = () => repo(BASE, "Initial commit");

// Three commits on main: c1 (BASE), c2 (edit README), c3 (add notes.txt), one minute apart.
// Public scenarios pass { plain: true }: the spec format has no env on git steps, so all three share one date.
export const history = ({ plain = false } = {}) => {
  const at = (n, steps) => (plain ? steps : steps.map((s) => when(n, s)));
  return [
    ...base(),
    w("README.md", "# Demo\n\nA small project.\nNow with more text.\n"),
    ...at(1, commitAll("Expand README")),
    w("notes.txt", "note 1\n"),
    ...at(2, commitAll("Add notes")),
  ];
};

const registry = [];
// level: "basic" | "edge"; pub: true for public scenarios (copied to given/)
export function S(version, section, level, title, steps, { pub = false } = {}) {
  registry.push({ version, section, level, title, pub, steps: steps.flat() });
}
export const scenarios = () => registry;
