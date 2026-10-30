// v0.3.0 scenarios (spec-v3.md). Hidden: 36, public: 8.
import { S, w, del, g, r, ro, x, env, when, commitAll, repo, base, history, BASE } from "./dsl.mjs";

const s = (section, level, title, steps) => S("v3", section, level, title, steps);
const p = (section, title, steps) => S("v3", section, "basic", title, steps, { pub: true });

const lines = (n, f = (i) => `line ${i}`) => Array.from({ length: n }, (_, i) => `${f(i + 1)}\n`).join("");
const t = (n, steps) => steps.map((st) => when(n, st));

// main: Base -> M1 -> M2; topic (from Base): T1 (adds topic.txt), T2 (edits src/app.js)
const branches = ({ plain = false } = {}) => {
  const at = (n, steps) => (plain ? steps : t(n, steps));
  return [
    ...repo(BASE, "Base"),
    g("switch", "-q", "-c", "topic"),
    w("topic.txt", "topic 1\n"),
    ...at(1, commitAll("T1: add topic.txt")),
    w("src/app.js", "console.log('topic');\n"),
    ...at(2, commitAll("T2: change app")),
    g("switch", "-q", "main"),
    w("main.txt", "main 1\n"),
    ...at(3, commitAll("M1: add main.txt")),
    w("docs/guide.txt", "Read me first.\nMain edit.\n"),
    ...at(4, commitAll("M2: edit guide")),
  ];
};
// main and topic both change README.md after Base, so picking topic's first commit conflicts.
const conflicting = ({ plain = false } = {}) => {
  const at = (n, steps) => (plain ? steps : t(n, steps));
  return [
    ...repo(BASE, "Base"),
    g("switch", "-q", "-c", "topic"),
    w("README.md", "# Demo\n\nTopic wording.\n"),
    ...at(1, commitAll("T1: reword README")),
    w("topic.txt", "t\n"),
    ...at(2, commitAll("T2: add topic.txt")),
    g("switch", "-q", "main"),
    w("README.md", "# Demo\n\nMain wording.\n"),
    ...at(3, commitAll("M1: reword README")),
  ];
};

// ---------------------------------------------------------------- 1. tag
p("01-tag", "create and list tags", [...history({ plain: true }), r("tag", "v1.0"), ro("tag")]);
p("01-tag", "tag -a and cat-file -p", [...history({ plain: true }), r("tag", "-a", "v1.0", "-m", "Version 1.0"), ro("cat-file", "-p", "v1.0")]);

s("01-tag", "basic", "create a tag at a given commit", [...history(), r("tag", "first", "HEAD~2"), r("tag", "second", "HEAD~1"), ro("tag"), ro("rev-parse", "first", "second")]);
s("01-tag", "basic", "tag -d", [...history(), g("tag", "a"), g("tag", "b"), r("tag", "-d", "a"), ro("tag")]);
s("01-tag", "basic", "creating an existing tag fails", [...history(), g("tag", "v1"), x(128, r("tag", "v1", "HEAD~1"))]);
s("01-tag", "edge", "tags are listed in byte order", [...history(), ...["v10", "v2", "V3", "release", "_x", "v1.9", "Zeta"].map((n) => g("tag", n)), ro("tag")]);
s("01-tag", "basic", "tag names as revisions", [...history(), g("tag", "light", "HEAD~1"), ro("rev-parse", "light", "refs/tags/light", "light~1"), ro("log", "--oneline", "light"), ro("cat-file", "-t", "light")]);
s("01-tag", "basic", "tag -a and show", [...history(), r("tag", "-a", "v2.0", "-m", "Second release"), ro("show", "v2.0"), ro("tag")]);
s("01-tag", "basic", "tag -a at a given commit", [...history(), r("tag", "-a", "old", "-m", "Old one", "HEAD~2"), ro("cat-file", "-p", "old"), ro("show", "old")]);
s("01-tag", "edge", "the tagger comes from the committer variables", [
  ...history(),
  env({ GIT_COMMITTER_NAME: "Tägger Person", GIT_COMMITTER_EMAIL: "tagger@example.net", GIT_COMMITTER_DATE: "1650000000 +0200" }, r("tag", "-a", "signed-off", "-m", "Tagged")),
  ro("cat-file", "-p", "signed-off"),
]);
s("01-tag", "edge", "a multi-line tag message", [...history(), r("tag", "-a", "multi", "-m", "Headline", "-m", "Details line one.\nDetails line two."), ro("cat-file", "-p", "multi"), ro("show", "multi")]);
s("01-tag", "edge", "cat-file and rev-parse of an annotated tag made by the real git", [
  ...base(),
  g("tag", "-a", "v1.0", "-m", "Release 1.0"),
  ro("cat-file", "-t", "v1.0"),
  ro("cat-file", "-s", "v1.0"),
  ro("rev-parse", "v1.0"),
  ro("log", "--oneline", "v1.0"),
]);

// ---------------------------------------------------------------- 2. reset
p("02-reset", "reset --hard HEAD~1", [...history({ plain: true }), w("README.md", "dirty\n"), r("reset", "--hard", "HEAD~1")]);

s("02-reset", "basic", "reset --soft", [...history(), r("reset", "--soft", "HEAD~2"), ro("status", "--porcelain")]);
s("02-reset", "basic", "reset defaults to --mixed", [...history(), w("README.md", "staged\n"), g("add", "README.md"), r("reset", "HEAD~1"), ro("status", "--porcelain")]);
s("02-reset", "basic", "reset with no arguments unstages everything", [...base(), w("README.md", "staged\n"), w("new.txt", "n\n"), g("add", "."), r("reset")]);
s("02-reset", "edge", "reset --hard removes a staged new file", [...base(), w("new.txt", "n\n"), g("add", "new.txt"), w("README.md", "dirty\n"), r("reset", "--hard")]);
s("02-reset", "edge", "reset --hard keeps untracked files", [...history(), w("untracked.txt", "u\n"), w("notes.txt", "dirty\n"), r("reset", "--hard", "HEAD~1")]);
s("02-reset", "edge", "reset --hard to a commit on another branch", [...history(), g("branch", "old", "HEAD~2"), g("switch", "-q", "-c", "work"), r("reset", "--hard", "old"), ro("branch")]);

// ---------------------------------------------------------------- 3. cherry-pick
p("03-cherry-pick", "cherry-pick a commit", [...branches({ plain: true }), r("cherry-pick", "topic~1")]);
p("03-cherry-pick", "cherry-pick conflict and --abort", [...conflicting({ plain: true }), x(1, r("cherry-pick", "topic~1")), r("cherry-pick", "--abort")]);

s("03-cherry-pick", "basic", "a clean pick produces the same commit", [...branches(), r("cherry-pick", "topic"), ro("cat-file", "-p", "HEAD")]);
s("03-cherry-pick", "basic", "pick a commit that adds a file", [...branches(), r("cherry-pick", "topic~1"), ro("log", "--oneline")]);
s("03-cherry-pick", "basic", "a conflict leaves the in-progress state", [...conflicting(), x(1, r("cherry-pick", "topic~1")), ro("ls-files", "-s"), ro("status", "--porcelain")]);
s("03-cherry-pick", "basic", "--abort restores the previous state", [...conflicting(), w("untracked.txt", "u\n"), x(1, r("cherry-pick", "topic~1")), r("cherry-pick", "--abort")]);
s("03-cherry-pick", "basic", "pick a commit that deletes a file", [
  ...branches(),
  g("switch", "-q", "topic"),
  g("rm", "-q", "README.md"),
  ...t(5, commitAll("T3: delete README")),
  g("switch", "-q", "main"),
  r("cherry-pick", "topic"),
]);
s("03-cherry-pick", "edge", "a pick that applies at shifted line numbers", [
  ...repo({ "list.txt": lines(30) }, "Base"),
  g("switch", "-q", "-c", "topic"),
  w("list.txt", lines(30).replace("line 25\n", "line twenty-five\n")),
  ...t(1, commitAll("Topic edits line 25")),
  g("switch", "-q", "main"),
  w("list.txt", "inserted a\ninserted b\ninserted c\n" + lines(30)),
  ...t(2, commitAll("Main inserts lines at the top")),
  r("cherry-pick", "topic"),
]);
s("03-cherry-pick", "edge", "unrelated local changes are kept", [...branches(), w("README.md", "local edit\n"), r("cherry-pick", "topic~1"), ro("status", "--porcelain")]);

// ---------------------------------------------------------------- 3. revert
p("03-revert", "revert --no-edit HEAD", [...history({ plain: true }), r("revert", "--no-edit", "HEAD")]);

s("03-revert", "basic", "revert an older commit", [...history(), r("revert", "--no-edit", "HEAD~1"), ro("cat-file", "-p", "HEAD")]);
s("03-revert", "basic", "revert a commit that added a file", [...history(), r("revert", "--no-edit", "HEAD"), ro("log", "-n", "1")]);
s("03-revert", "edge", "revert a commit with a multi-paragraph message", [
  ...base(),
  w("x.txt", "x\n"),
  g("add", "x.txt"),
  when(1, g("commit", "-q", "-m", "Add x", "-m", "Because we needed it.")),
  r("revert", "--no-edit", "HEAD"),
  ro("cat-file", "-p", "HEAD"),
]);
s("03-revert", "edge", "revert a revert", [...history(), t(3, [g("revert", "--no-edit", "HEAD")])[0], r("revert", "--no-edit", "HEAD"), ro("log", "--oneline", "-n", "3")]);
s("03-revert", "edge", "unrelated local changes are kept", [...history(), w("src/app.js", "local\n"), r("revert", "--no-edit", "HEAD~1"), ro("status", "--porcelain")]);

// ---------------------------------------------------------------- 4. reflog
p("04-reflog", "reflog after commits", [...base(), w("a.txt", "a\n"), r("add", "a.txt"), r("commit", "-m", "Add a"), ro("reflog")]);
p("04-reflog", "reflog show of a branch", [...base(), w("a.txt", "a\n"), r("add", "a.txt"), r("commit", "-m", "Add a"), ro("reflog", "show", "main")]);

s("04-reflog", "basic", "the first commit in a new repository", [r("init", "-q"), w("a.txt", "a\n"), r("add", "a.txt"), r("commit", "-m", "First"), ro("reflog"), ro("reflog", "show", "main")]);
s("04-reflog", "basic", "switch", [...history(), g("branch", "other", "HEAD~1"), r("switch", "other"), r("switch", "main"), r("switch", "-c", "fresh"), ro("reflog")]);
s("04-reflog", "basic", "reset", [...history(), r("reset", "--hard", "HEAD~1"), r("reset", "--soft", "HEAD~1"), ro("reflog"), ro("reflog", "show", "main")]);
s("04-reflog", "basic", "fast-forward and three-way merges", [
  ...branches(),
  g("branch", "behind", "main~1"),
  g("switch", "-q", "behind"),
  r("merge", "main"),
  g("switch", "-q", "main"),
  r("merge", "topic"),
  ro("reflog"),
  ro("reflog", "show", "behind"),
]);
s("04-reflog", "edge", "branch creation", [...history(), r("branch", "made", "HEAD~1"), r("branch", "here"), ro("reflog", "show", "made"), ro("reflog", "show", "here")]);
s("04-reflog", "basic", "cherry-pick and revert", [...branches(), r("cherry-pick", "topic~1"), r("revert", "--no-edit", "HEAD"), ro("reflog"), ro("reflog", "show", "main")]);
s("04-reflog", "basic", "reflog show <branch> after several operations", [
  ...history(),
  w("x.txt", "x\n"),
  r("add", "x.txt"),
  r("commit", "-m", "Add x"),
  r("reset", "--hard", "HEAD~2"),
  del("docs/guide.txt"),
  r("commit", "-a", "-m", "Remove the guide"),
  ro("reflog", "show", "main"),
  ro("reflog", "show", "HEAD"),
]);
s("04-reflog", "edge", "a merge commit made after resolving a conflict", [
  ...conflicting(),
  x(1, r("merge", "topic")),
  w("README.md", "# Demo\n\nResolved.\n"),
  r("add", "README.md"),
  r("commit", "--no-edit"),
  ro("reflog"),
]);
