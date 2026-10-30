// v0.2.0 scenarios (spec-v2.md). Hidden: 35, public: 8.
import { S, w, wb, chmod, g, r, ro, at, x, env, when, files, commitAll, repo, base, history, BASE } from "./dsl.mjs";

const s = (section, level, title, steps) => S("v2", section, level, title, steps);
const p = (section, title, steps) => S("v2", section, "basic", title, steps, { pub: true });

const lines = (n, f = (i) => `line ${i}`) => Array.from({ length: n }, (_, i) => `${f(i + 1)}\n`).join("");

// A main branch and a topic branch that diverge from c1. `topic` and `main` each change files as given.
const fork = (mainFiles, topicFiles, start = BASE) => [
  ...repo(start, "Base"),
  g("switch", "-q", "-c", "topic"),
  ...files(topicFiles),
  ...commitAll("Topic change").map((st) => when(1, st)),
  g("switch", "-q", "main"),
  ...files(mainFiles),
  ...commitAll("Main change").map((st) => when(2, st)),
];
const forkPlain = (mainFiles, topicFiles) => [
  ...repo(BASE, "Base"),
  g("switch", "-q", "-c", "topic"),
  ...files(topicFiles),
  ...commitAll("Topic change"),
  g("switch", "-q", "main"),
  ...files(mainFiles),
  ...commitAll("Main change"),
];
const conflict = () => fork({ "README.md": "# Demo\n\nMain says hello.\n" }, { "README.md": "# Demo\n\nTopic says hi.\n" });

// ---------------------------------------------------------------- 1. diff
p("01-diff", "diff of a modified file", [...base(), w("README.md", "# Demo\n\nA small project.\nWith an extra line.\n"), ro("diff")]);
p("01-diff", "diff --cached", [...base(), w("src/app.js", "console.log('bye');\n"), g("add", "src/app.js"), ro("diff", "--cached")]);
p("01-diff", "diff between commits", [...history({ plain: true }), ro("diff", "HEAD~2", "HEAD")]);

const LONG = lines(40, (i) => (i % 10 === 1 ? `function f${i}() {` : `  statement ${i};`));
s("01-diff", "basic", "working tree vs. index ignores untracked files", [...base(), w("src/app.js", "console.log('changed');\nconsole.log('again');\n"), w("untracked.txt", "u\n"), ro("diff")]);
s("01-diff", "basic", "diff --cached with staged and unstaged changes", [...base(), w("README.md", "staged\n"), g("add", "README.md"), w("README.md", "unstaged\n"), w("new.txt", "n\n"), g("add", "new.txt"), ro("diff", "--cached"), ro("diff")]);
s("01-diff", "basic", "diff --cached with no commits yet", [g("init", "-q"), ...files(BASE), g("add", "."), ro("diff", "--cached")]);
s("01-diff", "basic", "diff between two commits in both directions", [...history(), ro("diff", "HEAD~2", "HEAD~1"), ro("diff", "HEAD", "HEAD~1")]);
s("01-diff", "basic", "diff --name-only", [...history(), ro("diff", "--name-only", "HEAD~2", "HEAD"), w("src/app.js", "x\n"), ro("diff", "--name-only"), g("add", "src/app.js"), ro("diff", "--cached", "--name-only")]);
s("01-diff", "basic", "new file and deleted file headers", [...base(), w("brand-new.txt", "fresh\n"), g("rm", "-q", "src/app.js"), g("add", "-A"), ro("diff", "--cached")]);
s("01-diff", "edge", "old mode and new mode headers", [
  ...repo({ "run.sh": "#!/bin/sh\necho hi\n", "tool.sh": "#!/bin/sh\n" }),
  chmod("run.sh"),
  chmod("tool.sh"),
  w("tool.sh", "#!/bin/sh\necho changed\n"),
  ro("diff"),
]);
s("01-diff", "edge", "no newline at end of file", [
  ...repo({ "a.txt": "one\ntwo", "b.txt": "one\ntwo\n", "c.txt": "x\ny" }),
  w("a.txt", "one\ntwo\n"),
  w("b.txt", "one\ntwo"),
  w("c.txt", "x\nz"),
  ro("diff"),
]);
s("01-diff", "edge", "binary files", [
  ...repo({ "README.md": "r\n" }),
  wb("image.bin", [0, 1, 2, 3, 0, 255, 254]),
  g("add", "image.bin"),
  ro("diff", "--cached"),
  ...commitAll("bin"),
  wb("image.bin", [0, 9, 9, 9, 0, 255]),
  ro("diff"),
]);
s("01-diff", "edge", "empty files", [...repo({ "full.txt": "content\n" }), w("empty.txt", ""), w("full.txt", ""), g("add", "empty.txt"), ro("diff", "--cached"), ro("diff")]);
s("01-diff", "basic", "changes far apart produce separate hunks", [
  ...repo({ "code.c": LONG }),
  w("code.c", LONG.replace("  statement 3;", "  statement three;").replace("  statement 35;", "  statement thirty-five;")),
  ro("diff"),
]);
s("01-diff", "edge", "changes close together share one hunk", [
  ...repo({ "list.txt": lines(30) }),
  w("list.txt", lines(30).replace("line 10\n", "line ten\n").replace("line 16\n", "line sixteen\n")),
  ro("diff"),
  w("list.txt", lines(30).replace("line 10\n", "line ten\n").replace("line 17\n", "line seventeen\n")),
  ro("diff"),
]);
s("01-diff", "edge", "inserting a function between functions", [
  ...repo({ "fns.js": "function a() {\n  return 1;\n}\n\nfunction c() {\n  return 3;\n}\n" }),
  w("fns.js", "function a() {\n  return 1;\n}\n\nfunction b() {\n  return 2;\n}\n\nfunction c() {\n  return 3;\n}\n"),
  ro("diff"),
]);
s("01-diff", "edge", "repeated lines make the match ambiguous", [
  ...repo({ "blocks.txt": "{\n  x\n}\n{\n  y\n}\n{\n  z\n}\n" }),
  w("blocks.txt", "{\n  x\n}\n{\n  new\n}\n{\n  y\n}\n{\n  z\n}\n"),
  ro("diff"),
  w("blocks.txt", "{\n  y\n}\n{\n  x\n}\n{\n  z\n}\n"),
  ro("diff"),
]);
s("01-diff", "basic", "rewriting a whole file", [...repo({ "poem.txt": lines(8, (i) => `old verse ${i}`) }), w("poem.txt", lines(6, (i) => `new verse ${i}`)), ro("diff")]);
s("01-diff", "edge", "diff from a subdirectory", [...base(), w("README.md", "top\n"), w("src/app.js", "app\n"), at("src", ro("diff")), at("src", ro("diff", "--name-only"))]);
s("01-diff", "edge", "function names in hunk headers", [
  ...repo({ "prog.py": "def first():\n" + lines(12, (i) => `    a${i} = ${i}`) + "\nclass Second:\n" + lines(12, (i) => `    b${i} = ${i}`) }),
  w("prog.py", "def first():\n" + lines(12, (i) => `    a${i} = ${i}`).replace("a11 = 11", "a11 = 111") + "\nclass Second:\n" + lines(12, (i) => `    b${i} = ${i}`).replace("b10 = 10", "b10 = 100")),
  ro("diff"),
]);

// ---------------------------------------------------------------- 1. show
p("01-show", "show of a commit with its patch", [...history({ plain: true }), ro("show", "HEAD~1")]);

s("01-show", "basic", "show HEAD", [...history(), ro("show", "HEAD")]);
s("01-show", "edge", "show of the root commit", [...history(), ro("show", "HEAD~2")]);
s("01-show", "edge", "show with a multi-paragraph message and non-ASCII author", [
  ...base(),
  w("y.txt", "y\n"),
  g("add", "y.txt"),
  env({ GIT_AUTHOR_NAME: "Jürgen Ågren" }, g("commit", "-q", "-m", "Title", "-m", "Body text\nwraps here.")),
  ro("show", "HEAD"),
]);

// ---------------------------------------------------------------- 2. merge-base
p("02-merge-base", "merge-base of two branches", [...forkPlain({ "m.txt": "m\n" }, { "t.txt": "t\n" }), ro("merge-base", "main", "topic")]);

s("02-merge-base", "basic", "merge-base of diverged branches", [...fork({ "m.txt": "m\n" }, { "t.txt": "t\n" }), ro("merge-base", "main", "topic"), ro("merge-base", "topic", "main")]);
s("02-merge-base", "basic", "one commit is an ancestor of the other", [...history(), ro("merge-base", "HEAD", "HEAD~2"), ro("merge-base", "HEAD~1", "HEAD")]);

// ---------------------------------------------------------------- 2. merge
p("02-merge", "fast-forward merge", [...base(), g("switch", "-q", "-c", "topic"), w("t.txt", "t\n"), ...commitAll("Topic"), g("switch", "-q", "main"), r("merge", "topic")]);
p("02-merge", "three-way merge without conflicts", [...forkPlain({ "m.txt": "m\n" }, { "t.txt": "t\n" }), r("merge", "topic")]);
p("02-merge", "a conflicting merge", [
  ...forkPlain({ "README.md": "main version\n" }, { "README.md": "topic version\n" }),
  x(1, r("merge", "topic")),
]);

s("02-merge", "basic", "fast-forward", [...history(), g("switch", "-q", "-c", "old", "HEAD~2"), r("merge", "main")]);
s("02-merge", "basic", "three-way merge of different files", [...fork({ "m.txt": "m\n" }, { "t.txt": "t\n", "src/app.js": "topic app\n" }), r("merge", "topic"), ro("cat-file", "-p", "HEAD")]);
s("02-merge", "edge", "three-way merge of different regions of one file", [
  ...fork({ "list.txt": lines(20).replace("line 2\n", "line two (main)\n") }, { "list.txt": lines(20).replace("line 18\n", "line eighteen (topic)\n") }, { ...BASE, "list.txt": lines(20) }),
  r("merge", "topic"),
]);
s("02-merge", "basic", "merge -m", [...fork({ "m.txt": "m\n" }, { "t.txt": "t\n" }), r("merge", "-m", "Custom merge message", "topic"), ro("log", "-n", "1")]);
s("02-merge", "basic", "already up to date", [...history(), g("branch", "old", "HEAD~2"), r("merge", "old"), r("merge", "main")]);
s("02-merge", "basic", "conflict on the same lines", [...conflict(), x(1, r("merge", "topic")), ro("ls-files", "-s")]);
s("02-merge", "edge", "add/add conflict", [...fork({ "new.txt": "added on main\n" }, { "new.txt": "added on topic\n" }), x(1, r("merge", "topic")), ro("ls-files", "-s")]);
s("02-merge", "basic", "resolving a conflict and committing", [...conflict(), x(1, r("merge", "topic")), w("README.md", "# Demo\n\nResolved.\n"), r("add", "README.md"), r("commit", "--no-edit"), ro("cat-file", "-p", "HEAD")]);
s("02-merge", "edge", "resolving a conflict and committing with -m", [...conflict(), x(1, r("merge", "topic")), w("README.md", "# Demo\n\nResolved.\n"), r("add", "README.md"), r("commit", "-m", "Merge with my words"), ro("log", "-n", "1")]);
s("02-merge", "edge", "local changes that would be overwritten", [...fork({ "m.txt": "m\n" }, { "src/app.js": "topic app\n" }), w("src/app.js", "local edit\n"), x(2, r("merge", "topic"))]);
s("02-merge", "edge", "merging a revision instead of a branch", [...fork({ "m.txt": "m\n" }, { "t.txt": "t\n" }), r("merge", "topic~0"), ro("log", "-n", "1", "--oneline")]);
s("02-merge", "edge", "a conflict in one file and a clean change in another", [
  ...fork({ "README.md": "main readme\n", "m.txt": "m\n" }, { "README.md": "topic readme\n", "src/app.js": "topic app\n" }),
  x(1, r("merge", "topic")),
  ro("ls-files", "-s"),
  ro("status", "--porcelain"),
]);
s("02-merge", "edge", "merging into a branch other than main", [
  ...fork({ "m.txt": "m\n" }, { "t.txt": "t\n" }),
  g("switch", "-q", "-c", "feature"),
  r("merge", "topic"),
  ro("log", "-n", "1"),
]);
