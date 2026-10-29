// v0.2.0 scenarios (spec-v2.md). Hidden: 80, public: 15.
import { S, w, wb, del, chmod, ln, g, r, ro, at, x, env, when, files, commitAll, repo, base, history, BASE } from "./dsl.mjs";

const s = (section, level, title, steps) => S("v2", section, level, title, steps);
const p = (section, title, steps) => S("v2", section, "basic", title, steps, { pub: true });

const lines = (n, f = (i) => `line ${i}`) => Array.from({ length: n }, (_, i) => `${f(i + 1)}\n`).join("");
const NO_ID = { GIT_AUTHOR_NAME: null, GIT_AUTHOR_EMAIL: null, GIT_COMMITTER_NAME: null, GIT_COMMITTER_EMAIL: null };

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
p("01-diff", "diff --stat", [...base(), w("README.md", "# Demo\n\nChanged.\n"), w("docs/guide.txt", "Read me first.\nThen this.\n"), ro("diff", "--stat")]);
p("01-diff", "diff --name-status between commits", [...history({ plain: true }), ro("diff", "--name-status", "HEAD~2", "HEAD")]);

const LONG = lines(40, (i) => (i % 10 === 1 ? `function f${i}() {` : `  statement ${i};`));
s("01-diff", "basic", "working tree vs. index ignores untracked files", [...base(), w("src/app.js", "console.log('changed');\nconsole.log('again');\n"), w("untracked.txt", "u\n"), ro("diff")]);
s("01-diff", "basic", "diff --cached with staged and unstaged changes", [...base(), w("README.md", "staged\n"), g("add", "README.md"), w("README.md", "unstaged\n"), w("new.txt", "n\n"), g("add", "new.txt"), ro("diff", "--cached"), ro("diff")]);
s("01-diff", "basic", "diff --cached with no commits yet", [g("init", "-q"), ...files(BASE), g("add", "."), ro("diff", "--cached")]);
s("01-diff", "basic", "diff between two commits", [...history(), ro("diff", "HEAD~2", "HEAD"), ro("diff", "HEAD", "HEAD~1")]);
s("01-diff", "basic", "diff with path limiting", [...base(), w("README.md", "r\n"), w("src/app.js", "a\n"), w("src/lib/util.js", "u\n"), ro("diff", "--", "src"), ro("diff", "--", "README.md", "src/lib")]);
s("01-diff", "basic", "diff --stat between commits", [...history(), ro("diff", "--stat", "HEAD~2", "HEAD")]);
s("01-diff", "edge", "--stat with long paths and a narrow COLUMNS", [
  ...base(),
  w("a/very/long/directory/name/that/keeps/going/and/going/file-with-a-long-name.txt", lines(30)),
  w("short.txt", lines(5)),
  g("add", "."),
  env({ COLUMNS: "40" }, ro("diff", "--stat", "--cached")),
  env({ COLUMNS: "200" }, ro("diff", "--stat", "--cached")),
]);
s("01-diff", "basic", "diff --name-only", [...history(), ro("diff", "--name-only", "HEAD~2", "HEAD"), w("src/app.js", "x\n"), ro("diff", "--name-only")]);
s("01-diff", "basic", "diff --name-status with added, modified, and deleted files", [
  ...base(),
  w("added.txt", "a\n"),
  w("README.md", "m\n"),
  g("rm", "-q", "docs/guide.txt"),
  g("add", "-A"),
  ro("diff", "--cached", "--name-status"),
]);
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
  ro("diff", "--stat"),
]);
s("01-diff", "edge", "empty files", [...repo({ "full.txt": "content\n" }), w("empty.txt", ""), w("full.txt", ""), g("add", "empty.txt"), ro("diff", "--cached"), ro("diff")]);
s("01-diff", "edge", "CRLF line endings", [...repo({ "win.txt": "one\r\ntwo\r\nthree\r\n" }), w("win.txt", "one\r\nTWO\r\nthree\r\n"), ro("diff")]);
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
s("01-diff", "edge", "diff from a subdirectory", [...base(), w("README.md", "top\n"), w("src/app.js", "app\n"), at("src", ro("diff")), at("src", ro("diff", "--stat")), at("src", ro("diff", "--", "."))]);
s("01-diff", "edge", "function names in hunk headers", [
  ...repo({ "prog.py": "def first():\n" + lines(12, (i) => `    a${i} = ${i}`) + "\nclass Second:\n" + lines(12, (i) => `    b${i} = ${i}`) }),
  w("prog.py", "def first():\n" + lines(12, (i) => `    a${i} = ${i}`).replace("a11 = 11", "a11 = 111") + "\nclass Second:\n" + lines(12, (i) => `    b${i} = ${i}`).replace("b10 = 10", "b10 = 100")),
  ro("diff"),
]);

// ---------------------------------------------------------------- 1. show and log -p
p("01-show-log-p", "show of a commit with its patch", [...history({ plain: true }), ro("show", "HEAD~1")]);

s("01-show-log-p", "basic", "log -p", [...history(), ro("log", "-p")]);
s("01-show-log-p", "edge", "show of the root commit", [...history(), ro("show", "HEAD~2")]);
s("01-show-log-p", "edge", "show of a merge commit", [
  ...fork({ "main.txt": "m\n" }, { "topic.txt": "t\n" }),
  when(3, g("merge", "-q", "--no-ff", "-m", "Merge topic", "topic")),
  ro("show", "HEAD"),
  ro("log", "-p", "-n", "1"),
]);
s("01-show-log-p", "basic", "log -p with -n and path limiting", [...history(), ro("log", "-p", "-n", "1", "--", "README.md"), ro("log", "-p", "--", "notes.txt")]);

// ---------------------------------------------------------------- 2. config
p("02-config", "set and get a value", [...base(), r("config", "core.editor", "vim"), ro("config", "core.editor")]);

s("02-config", "basic", "getting a missing key fails", [...base(), x(1, ro("config", "no.such")), x(1, ro("config", "core.nosuchkey"))]);
s("02-config", "basic", "--unset", [...base(), g("config", "alias.co", "checkout"), r("config", "--unset", "alias.co"), x(1, ro("config", "alias.co"))]);
s("02-config", "basic", "--list", [...base(), g("config", "user.name", "Someone"), g("config", "color.ui", "false"), ro("config", "--list")]);
s("02-config", "edge", "values with spaces, quotes, and #", [
  ...base(),
  r("config", "my.spaced", "two  words "),
  r("config", "my.quoted", 'say "hi"'),
  r("config", "my.hash", "a#b ; c"),
  r("config", "my.back", "back\\slash"),
  ro("config", "my.spaced"),
  ro("config", "my.quoted"),
  ro("config", "my.hash"),
  ro("config", "my.back"),
  ro("config", "--list"),
]);
s("02-config", "basic", "subsections", [
  ...base(),
  r("config", "branch.main.description", "the main line"),
  r("config", "remote.origin.url", "https://example.com/repo.git"),
  r("config", "my.Sub Section.key", "v"),
  ro("config", "branch.main.description"),
  ro("config", "my.Sub Section.key"),
]);
s("02-config", "basic", "commit uses user.name and user.email from the configuration", [
  ...base(),
  g("config", "user.name", "Config User"),
  g("config", "user.email", "config@example.com"),
  w("c.txt", "c\n"),
  g("add", "c.txt"),
  env(NO_ID, r("commit", "-m", "Identity from config")),
  ro("log", "-n", "1", "--format=%an <%ae>"),
]);
s("02-config", "edge", "environment variables take precedence over the configuration", [
  ...base(),
  g("config", "user.name", "Config User"),
  g("config", "user.email", "config@example.com"),
  w("c.txt", "c\n"),
  g("add", "c.txt"),
  env({ GIT_COMMITTER_NAME: null, GIT_COMMITTER_EMAIL: null }, r("commit", "-m", "Mixed identity")),
  ro("cat-file", "-p", "HEAD"),
]);
s("02-config", "edge", "case-insensitive names and overwriting a value", [
  ...base(),
  r("config", "Core.Editor", "nano"),
  ro("config", "core.editor"),
  r("config", "core.editor", "emacs"),
  ro("config", "CORE.EDITOR"),
  x(5, r("config", "--unset", "no.such")),
]);

// ---------------------------------------------------------------- 3. ignore rules
p("03-ignore", "a negated pattern", [...base(), w(".gitignore", "*.log\n!keep.log\n"), w("a.log", "a\n"), w("keep.log", "k\n"), ro("status", "--porcelain")]);

s("03-ignore", "basic", "negation re-includes a file", [
  ...base(),
  w(".gitignore", "*.cfg\n!important.cfg\n"),
  w("a.cfg", "a\n"),
  w("important.cfg", "i\n"),
  w("src/important.cfg", "s\n"),
  ro("ls-files", "-o", "--exclude-standard"),
]);
s("03-ignore", "basic", "a leading ** pattern", [...base(), w(".gitignore", "**/tmp\n"), w("tmp/a", "1\n"), w("src/tmp/b", "2\n"), w("src/lib/tmp", "3\n"), w("src/keep", "k\n"), ro("ls-files", "-o", "--exclude-standard")]);
s("03-ignore", "edge", "a/**/b patterns", [
  ...base(),
  w(".gitignore", "logs/**/debug.txt\nout/**\n"),
  w("logs/debug.txt", "1\n"),
  w("logs/x/y/debug.txt", "2\n"),
  w("logs/info.txt", "3\n"),
  w("out/a/b.txt", "4\n"),
  w("other/out/c.txt", "5\n"),
  ro("ls-files", "-o", "--exclude-standard"),
  ro("status", "--porcelain"),
]);
s("03-ignore", "basic", "a .gitignore in a subdirectory overrides the root one", [
  ...base(),
  w(".gitignore", "*.gen\n"),
  w("src/.gitignore", "!keep.gen\nlocal.txt\n"),
  w("a.gen", "1\n"),
  w("src/keep.gen", "2\n"),
  w("src/other.gen", "3\n"),
  w("src/local.txt", "4\n"),
  w("local.txt", "5\n"),
  ro("ls-files", "-o", "--exclude-standard"),
]);
s("03-ignore", "basic", ".git/info/exclude", [...base(), w(".git/info/exclude", "secret.txt\n*.swp\n"), w("secret.txt", "s\n"), w("src/x.swp", "x\n"), w("ok.txt", "o\n"), ro("status", "--porcelain"), x(1, r("add", "secret.txt"))]);
s("03-ignore", "edge", "trailing spaces", [...base(), w(".gitignore", "spaced.txt   \nkeep\\ \n"), w("spaced.txt", "1\n"), w("keep ", "2\n"), w("keep", "3\n"), ro("ls-files", "-o", "--exclude-standard")]);
s("03-ignore", "edge", "escaped # and !", [...base(), w(".gitignore", "\\#hash.txt\n\\!bang.txt\n"), w("#hash.txt", "1\n"), w("!bang.txt", "2\n"), w("plain.txt", "3\n"), ro("ls-files", "-o", "--exclude-standard")]);
s("03-ignore", "edge", "a file inside an ignored directory cannot be re-included", [
  ...base(),
  w(".gitignore", "build/\n!build/keep.txt\n"),
  w("build/keep.txt", "k\n"),
  w("build/other.txt", "o\n"),
  ro("status", "--porcelain"),
  x(1, r("add", "build/keep.txt")),
]);

// ---------------------------------------------------------------- 4. merge-base
p("04-merge-base", "merge-base of two branches", [...forkPlain({ "m.txt": "m\n" }, { "t.txt": "t\n" }), ro("merge-base", "main", "topic")]);

const crissCross = () => [
  ...repo({ "f.txt": "base\n" }, "Base"),
  g("branch", "b"),
  w("a1.txt", "1\n"),
  ...commitAll("A1").map((st) => when(1, st)),
  g("switch", "-q", "b"),
  w("b1.txt", "1\n"),
  ...commitAll("B1").map((st) => when(2, st)),
  g("branch", "b-at-b1"),
  when(3, g("merge", "-q", "--no-ff", "-m", "Merge A1 into b", "main")),
  g("switch", "-q", "main"),
  when(4, g("merge", "-q", "--no-ff", "-m", "Merge B1 into main", "b-at-b1")),
];
s("04-merge-base", "basic", "merge-base of diverged branches", [...fork({ "m.txt": "m\n" }, { "t.txt": "t\n" }), ro("merge-base", "main", "topic"), ro("merge-base", "topic", "main")]);
s("04-merge-base", "basic", "one commit is an ancestor of the other", [...history(), ro("merge-base", "HEAD", "HEAD~2"), ro("merge-base", "HEAD~1", "HEAD")]);
s("04-merge-base", "edge", "--all with criss-cross history", [...crissCross(), ro("merge-base", "--all", "main", "b")]);
s("04-merge-base", "edge", "criss-cross history without --all", [...crissCross(), ro("merge-base", "main", "b"), ro("merge-base", "b", "main")]);
s("04-merge-base", "edge", "unrelated histories", [
  ...base(),
  g("checkout", "-q", "--orphan", "other"),
  g("rm", "-r", "-q", "-f", "."),
  w("o.txt", "o\n"),
  ...commitAll("Orphan root"),
  x(1, ro("merge-base", "main", "other")),
]);

// ---------------------------------------------------------------- 4. merge
p("04-merge", "fast-forward merge", [...base(), g("switch", "-q", "-c", "topic"), w("t.txt", "t\n"), ...commitAll("Topic"), g("switch", "-q", "main"), r("merge", "topic")]);
p("04-merge", "three-way merge without conflicts", [...forkPlain({ "m.txt": "m\n" }, { "t.txt": "t\n" }), r("merge", "topic")]);
p("04-merge", "a conflicting merge", [
  ...forkPlain({ "README.md": "main version\n" }, { "README.md": "topic version\n" }),
  x(1, r("merge", "topic")),
]);
p("04-merge", "merge --abort", [
  ...forkPlain({ "README.md": "main version\n" }, { "README.md": "topic version\n" }),
  x(1, r("merge", "topic")),
  r("merge", "--abort"),
]);

s("04-merge", "basic", "fast-forward", [...history(), g("switch", "-q", "-c", "old", "HEAD~2"), r("merge", "main")]);
s("04-merge", "basic", "--no-ff creates a merge commit", [...history(), g("switch", "-q", "-c", "old", "HEAD~2"), r("merge", "--no-ff", "main"), ro("cat-file", "-p", "HEAD")]);
s("04-merge", "basic", "--ff-only when fast-forward is possible", [...history(), g("switch", "-q", "-c", "old", "HEAD~1"), r("merge", "--ff-only", "main")]);
s("04-merge", "basic", "--ff-only fails when fast-forward is not possible", [...fork({ "m.txt": "m\n" }, { "t.txt": "t\n" }), x(128, r("merge", "--ff-only", "topic"))]);
s("04-merge", "basic", "three-way merge of different files", [...fork({ "m.txt": "m\n" }, { "t.txt": "t\n", "src/app.js": "topic app\n" }), r("merge", "topic"), ro("cat-file", "-p", "HEAD")]);
s("04-merge", "edge", "three-way merge of different regions of one file", [
  ...fork({ "list.txt": lines(20).replace("line 2\n", "line two (main)\n") }, { "list.txt": lines(20).replace("line 18\n", "line eighteen (topic)\n") }, { ...BASE, "list.txt": lines(20) }),
  r("merge", "topic"),
]);
s("04-merge", "basic", "merge -m", [...fork({ "m.txt": "m\n" }, { "t.txt": "t\n" }), r("merge", "-m", "Custom merge message", "topic"), ro("log", "-n", "1", "--format=%s%n%b")]);
s("04-merge", "basic", "already up to date", [...history(), g("branch", "old", "HEAD~2"), r("merge", "old"), r("merge", "main")]);
s("04-merge", "basic", "conflict on the same lines", [...conflict(), x(1, r("merge", "topic")), ro("ls-files", "-s")]);
s("04-merge", "edge", "add/add conflict", [...fork({ "new.txt": "added on main\n" }, { "new.txt": "added on topic\n" }), x(1, r("merge", "topic")), ro("ls-files", "-s")]);
const modifyDelete = (deleteOn) => [
  ...repo(BASE, "Base"),
  g("switch", "-q", "-c", "topic"),
  ...(deleteOn === "topic" ? [g("rm", "-q", "docs/guide.txt")] : [w("docs/guide.txt", "Edited on topic.\n")]),
  ...commitAll("Topic change").map((st) => when(1, st)),
  g("switch", "-q", "main"),
  ...(deleteOn === "main" ? [g("rm", "-q", "docs/guide.txt")] : [w("docs/guide.txt", "Edited on main.\n")]),
  ...commitAll("Main change").map((st) => when(2, st)),
];
s("04-merge", "edge", "modify/delete conflict", [...modifyDelete("topic"), x(1, r("merge", "topic")), ro("ls-files", "-s")]);
s("04-merge", "edge", "delete/modify conflict", [...modifyDelete("main"), x(1, r("merge", "topic")), ro("ls-files", "-s")]);
s("04-merge", "edge", "binary conflict", [
  ...repo({ "logo.bin": "\u0000\u0001\u0002base" }, "Base"),
  g("switch", "-q", "-c", "topic"),
  wb("logo.bin", [0, 1, 2, 116]),
  ...commitAll("Topic binary").map((st) => when(1, st)),
  g("switch", "-q", "main"),
  wb("logo.bin", [0, 1, 2, 109]),
  ...commitAll("Main binary").map((st) => when(2, st)),
  x(1, r("merge", "topic")),
  ro("ls-files", "-s"),
]);
s("04-merge", "basic", "resolving a conflict and committing", [...conflict(), x(1, r("merge", "topic")), w("README.md", "# Demo\n\nResolved.\n"), r("add", "README.md"), r("commit", "--no-edit"), ro("cat-file", "-p", "HEAD")]);
s("04-merge", "basic", "merge --abort after a conflict", [...conflict(), w("untracked.txt", "u\n"), x(1, r("merge", "topic")), r("merge", "--abort")]);
s("04-merge", "edge", "local changes that would be overwritten", [...fork({ "m.txt": "m\n" }, { "src/app.js": "topic app\n" }), w("src/app.js", "local edit\n"), x(2, r("merge", "topic"))]);
s("04-merge", "edge", "an untracked file that would be overwritten", [...fork({ "m.txt": "m\n" }, { "t.txt": "from topic\n" }), w("t.txt", "untracked local\n"), x(2, r("merge", "topic"))]);
s("04-merge", "edge", "merging a commit ID instead of a branch", [
  ...fork({ "m.txt": "m\n" }, { "t.txt": "t\n" }),
  g("tag", "topic-tip", "topic"),
  r("merge", "topic-tip"),
  ro("log", "-n", "1", "--format=%s"),
]);
s("04-merge", "edge", "a conflict in one file and a clean change in another", [
  ...fork({ "README.md": "main readme\n", "m.txt": "m\n" }, { "README.md": "topic readme\n", "src/app.js": "topic app\n" }),
  x(1, r("merge", "topic")),
  ro("ls-files", "-s"),
  ro("status", "--porcelain"),
]);
s("04-merge", "edge", "merging into a branch other than main", [
  ...fork({ "m.txt": "m\n" }, { "t.txt": "t\n" }),
  g("switch", "-q", "-c", "feature"),
  r("merge", "topic"),
  ro("log", "-n", "1", "--format=%s"),
]);

// ---------------------------------------------------------------- 5. annotated tags
p("05-annotated-tag", "tag -a and cat-file -p", [...history({ plain: true }), r("tag", "-a", "v1.0", "-m", "Version 1.0"), ro("cat-file", "-p", "v1.0")]);

s("05-annotated-tag", "basic", "tag -a and show", [...history(), r("tag", "-a", "v2.0", "-m", "Second release"), ro("show", "v2.0"), ro("tag")]);
s("05-annotated-tag", "basic", "tag -a at a given commit", [...history(), r("tag", "-a", "old", "-m", "Old one", "HEAD~2"), ro("cat-file", "-p", "old"), ro("show", "old")]);
s("05-annotated-tag", "edge", "the tagger comes from the committer variables", [
  ...history(),
  env({ GIT_COMMITTER_NAME: "Tägger Person", GIT_COMMITTER_EMAIL: "tagger@example.net", GIT_COMMITTER_DATE: "1650000000 +0200" }, r("tag", "-a", "signed-off", "-m", "Tagged")),
  ro("cat-file", "-p", "signed-off"),
]);
s("05-annotated-tag", "edge", "a multi-line tag message", [...history(), r("tag", "-a", "multi", "-m", "Headline", "-m", "Details line one.\nDetails line two."), ro("cat-file", "-p", "multi"), ro("show", "-s", "multi")]);

// ---------------------------------------------------------------- 6. stash
p("06-stash", "stash push and stash list", [...base(), w("README.md", "work in progress\n"), r("stash", "push"), ro("stash", "list")]);
p("06-stash", "stash pop", [...base(), w("README.md", "work in progress\n"), g("stash", "push", "-q"), r("stash", "pop")]);

s("06-stash", "basic", "stash with no subcommand", [...history(), w("notes.txt", "changed\n"), w("README.md", "also changed\n"), r("stash"), ro("stash", "list"), ro("cat-file", "-p", "refs/stash")]);
s("06-stash", "basic", "stash apply keeps the entry", [...base(), w("src/app.js", "stashed\n"), g("stash", "-q"), r("stash", "apply"), ro("stash", "list")]);
s("06-stash", "basic", "stash drop", [...base(), w("README.md", "one\n"), g("stash", "-q"), w("README.md", "two\n"), g("stash", "-q"), r("stash", "drop"), ro("stash", "list")]);
s("06-stash", "basic", "several stash entries", [
  ...history(),
  w("README.md", "first\n"),
  r("stash", "push"),
  w("notes.txt", "second\n"),
  r("stash", "push"),
  g("switch", "-q", "-c", "side", "HEAD~1"),
  w("README.md", "third\n"),
  r("stash"),
  ro("stash", "list"),
]);
s("06-stash", "edge", "staged and unstaged changes", [
  ...base(),
  w("staged.txt", "new and staged\n"),
  g("add", "staged.txt"),
  w("README.md", "staged edit\n"),
  g("add", "README.md"),
  w("README.md", "unstaged edit on top\n"),
  r("stash", "push"),
  ro("cat-file", "-p", "refs/stash"),
  r("stash", "pop"),
  ro("status", "--porcelain"),
]);
s("06-stash", "edge", "pop with conflicting local changes fails", [...base(), w("README.md", "stashed\n"), g("stash", "-q"), w("README.md", "local\n"), x(1, r("stash", "pop")), ro("stash", "list")]);
s("06-stash", "edge", "stash with no local changes", [...base(), r("stash"), ro("stash", "list"), ro("status", "--porcelain")]);
s("06-stash", "edge", "stash a deleted file", [...base(), del("docs/guide.txt"), g("rm", "-q", "--cached", "src/app.js"), r("stash", "push"), r("stash", "pop"), ro("status", "--porcelain")]);
s("06-stash", "edge", "pop that conflicts with a later commit keeps the entry", [
  ...base(),
  w("README.md", "stashed version\n"),
  g("stash", "-q"),
  w("README.md", "committed version\n"),
  ...commitAll("Change README"),
  x(1, r("stash", "pop")),
  ro("stash", "list"),
  ro("ls-files", "-s"),
]);
