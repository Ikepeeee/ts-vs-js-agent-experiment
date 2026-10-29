// v0.3.0 scenarios (spec-v3.md). Hidden: 60, public: 10.
import { S, w, wb, del, g, r, ro, x, env, when, blobId, files, commitAll, repo, base, history, BASE } from "./dsl.mjs";

const s = (section, level, title, steps) => S("v3", section, level, title, steps);
const p = (section, title, steps) => S("v3", section, "basic", title, steps, { pub: true });

const lines = (n, f = (i) => `line ${i}`) => Array.from({ length: n }, (_, i) => `${f(i + 1)}\n`).join("");
const EDITOR = { GIT_EDITOR: "true" };
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
// main and topic both change README.md after Base, so picking or rebasing topic's commit conflicts.
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
// One file with many versions, so packing produces delta chains.
const versions = (n, { plain = false } = {}) =>
  Array.from({ length: n }, (_, i) => [
    w("data.txt", lines(200, (j) => `row ${j} ${j <= i * 3 ? "updated" : "original"} ${"pad".repeat(j % 7)}`)),
    ...(plain ? commitAll(`Version ${i + 1}`) : t(i, commitAll(`Version ${i + 1}`))),
  ]).flat();
const packedRepo = (n = 30, opts = {}) => [g("init", "-q"), ...files(BASE), ...versions(n, opts), g("tag", "-a", "v1", "-m", "Tag v1", "HEAD~5"), g("tag", "light", `HEAD~${Math.min(10, n - 2)}`)];

// ---------------------------------------------------------------- 1. cherry-pick
p("01-cherry-pick", "cherry-pick a commit", [...branches({ plain: true }), r("cherry-pick", "topic~1")]);
p("01-cherry-pick", "cherry-pick conflict and --abort", [...conflicting({ plain: true }), x(1, r("cherry-pick", "topic~1")), r("cherry-pick", "--abort")]);

s("01-cherry-pick", "basic", "a clean pick produces the same commit", [...branches(), r("cherry-pick", "topic"), ro("cat-file", "-p", "HEAD")]);
s("01-cherry-pick", "basic", "pick a commit that adds a file", [...branches(), r("cherry-pick", "topic~1"), ro("log", "--oneline")]);
s("01-cherry-pick", "basic", "a conflict leaves the in-progress state", [...conflicting(), x(1, r("cherry-pick", "topic~1")), ro("ls-files", "-s"), ro("status", "--porcelain")]);
s("01-cherry-pick", "basic", "resolve and --continue", [
  ...conflicting(),
  x(1, r("cherry-pick", "topic~1")),
  w("README.md", "# Demo\n\nResolved wording.\n"),
  r("add", "README.md"),
  env(EDITOR, r("cherry-pick", "--continue")),
  ro("cat-file", "-p", "HEAD"),
]);
s("01-cherry-pick", "basic", "--abort restores the previous state", [...conflicting(), w("untracked.txt", "u\n"), x(1, r("cherry-pick", "topic~1")), r("cherry-pick", "--abort")]);
s("01-cherry-pick", "edge", "picking changes that are already present", [
  ...branches(),
  w("topic.txt", "topic 1\n"),
  ...t(5, commitAll("Same content as T1")),
  x(1, r("cherry-pick", "topic~1")),
]);
s("01-cherry-pick", "basic", "pick a commit that deletes a file", [
  ...branches(),
  g("switch", "-q", "topic"),
  g("rm", "-q", "docs/guide.txt"),
  ...t(5, commitAll("T3: delete guide")),
  g("switch", "-q", "main"),
  g("checkout", "-q", "main~2", "--", "docs/guide.txt"),
  ...t(6, commitAll("M3: restore guide")),
  r("cherry-pick", "topic"),
]);
s("01-cherry-pick", "edge", "a pick that applies at shifted line numbers", [
  ...repo({ "list.txt": lines(30) }, "Base"),
  g("switch", "-q", "-c", "topic"),
  w("list.txt", lines(30).replace("line 25\n", "line twenty-five\n")),
  ...t(1, commitAll("Topic edits line 25")),
  g("switch", "-q", "main"),
  w("list.txt", "inserted a\ninserted b\ninserted c\n" + lines(30)),
  ...t(2, commitAll("Main inserts lines at the top")),
  r("cherry-pick", "topic"),
]);
s("01-cherry-pick", "edge", "unrelated local changes are kept", [...branches(), w("README.md", "local edit\n"), r("cherry-pick", "topic~1"), ro("status", "--porcelain")]);
s("01-cherry-pick", "edge", "local changes to the same file block the pick", [...branches(), w("src/app.js", "local edit\n"), x(128, r("cherry-pick", "topic"))]);

// ---------------------------------------------------------------- 1. revert
p("01-revert", "revert --no-edit HEAD", [...history({ plain: true }), r("revert", "--no-edit", "HEAD")]);

s("01-revert", "basic", "revert an older commit", [...history(), r("revert", "--no-edit", "HEAD~1"), ro("cat-file", "-p", "HEAD")]);
s("01-revert", "basic", "revert a commit that added a file", [...history(), r("revert", "--no-edit", "HEAD"), ro("log", "-n", "1", "--format=%s%n%b")]);
s("01-revert", "edge", "revert a commit with a multi-paragraph message", [
  ...base(),
  w("x.txt", "x\n"),
  g("add", "x.txt"),
  when(1, g("commit", "-q", "-m", "Add x", "-m", "Because we needed it.")),
  r("revert", "--no-edit", "HEAD"),
  ro("cat-file", "-p", "HEAD"),
]);
s("01-revert", "edge", "revert a revert", [...history(), t(3, [g("revert", "--no-edit", "HEAD")])[0], r("revert", "--no-edit", "HEAD"), ro("log", "--format=%s", "-n", "3")]);
s("01-revert", "edge", "unrelated local changes are kept", [...history(), w("src/app.js", "local\n"), r("revert", "--no-edit", "HEAD~1"), ro("status", "--porcelain")]);

// ---------------------------------------------------------------- 2. rebase
p("02-rebase", "rebase onto an upstream branch", [...branches({ plain: true }), g("switch", "-q", "topic"), r("rebase", "main")]);
p("02-rebase", "rebase --abort after a conflict", [...conflicting({ plain: true }), g("switch", "-q", "topic"), x(1, r("rebase", "main")), r("rebase", "--abort")]);

s("02-rebase", "basic", "rebase <upstream> without conflicts", [...branches(), g("switch", "-q", "topic"), r("rebase", "main"), ro("log", "--format=%H %s"), ro("cat-file", "-p", "HEAD")]);
s("02-rebase", "basic", "rebase when already up to date", [...branches(), g("switch", "-q", "-c", "behind", "main~1"), g("switch", "-q", "main"), r("rebase", "behind"), ro("log", "--oneline")]);
s("02-rebase", "basic", "rebase --onto", [
  ...branches(),
  g("switch", "-q", "-c", "sub", "topic"),
  w("sub.txt", "s\n"),
  ...t(5, commitAll("S1: add sub.txt")),
  r("rebase", "--onto", "main", "topic"),
  ro("log", "--oneline"),
]);
s("02-rebase", "basic", "a conflict stops the rebase", [...conflicting(), g("switch", "-q", "topic"), x(1, r("rebase", "main")), ro("ls-files", "-s"), ro("status", "--porcelain")]);
s("02-rebase", "basic", "resolve, add, and --continue", [
  ...conflicting(),
  g("switch", "-q", "topic"),
  x(1, r("rebase", "main")),
  w("README.md", "# Demo\n\nResolved wording.\n"),
  r("add", "README.md"),
  env(EDITOR, r("rebase", "--continue")),
  ro("log", "--format=%H %s"),
]);
s("02-rebase", "basic", "--abort restores the branch and HEAD", [...conflicting(), g("switch", "-q", "topic"), x(1, r("rebase", "main")), r("rebase", "--abort"), ro("rev-parse", "HEAD"), ro("rev-parse", "--abbrev-ref", "HEAD")]);
s("02-rebase", "edge", "the second of several commits conflicts", [
  ...repo(BASE, "Base"),
  g("switch", "-q", "-c", "topic"),
  w("a.txt", "a\n"),
  ...t(1, commitAll("T1: add a")),
  w("README.md", "topic readme\n"),
  ...t(2, commitAll("T2: README")),
  w("b.txt", "b\n"),
  ...t(3, commitAll("T3: add b")),
  g("switch", "-q", "main"),
  w("README.md", "main readme\n"),
  ...t(4, commitAll("M1: README")),
  g("switch", "-q", "topic"),
  x(1, r("rebase", "main")),
  ro("ls-files", "-s"),
  w("README.md", "merged readme\n"),
  r("add", "README.md"),
  env(EDITOR, r("rebase", "--continue")),
  ro("log", "--oneline"),
]);
s("02-rebase", "basic", "a branch with no commits of its own fast-forwards", [...branches(), g("switch", "-q", "-c", "old", "main~2"), r("rebase", "main"), ro("rev-parse", "HEAD")]);
s("02-rebase", "edge", "commits already upstream are skipped", [
  ...repo(BASE, "Base"),
  g("switch", "-q", "-c", "topic"),
  w("shared.txt", "same change\n"),
  ...t(1, commitAll("T1: shared change")),
  w("own.txt", "own\n"),
  ...t(2, commitAll("T2: own change")),
  g("switch", "-q", "main"),
  w("shared.txt", "same change\n"),
  ...t(3, commitAll("M1: the same shared change")),
  g("switch", "-q", "topic"),
  r("rebase", "main"),
  ro("log", "--oneline"),
]);
s("02-rebase", "edge", "merge commits in the range are dropped", [
  ...branches(),
  g("switch", "-q", "topic"),
  g("switch", "-q", "-c", "side", "topic~1"),
  w("side.txt", "s\n"),
  ...t(5, commitAll("S1: side")),
  g("switch", "-q", "topic"),
  when(6, g("merge", "-q", "--no-ff", "-m", "Merge side into topic", "side")),
  r("rebase", "main"),
  ro("log", "--oneline"),
]);
s("02-rebase", "edge", "--onto with a range that leaves out commits", [
  ...branches(),
  g("switch", "-q", "topic"),
  w("t3.txt", "3\n"),
  ...t(5, commitAll("T3")),
  r("rebase", "--onto", "main", "topic~1"),
  ro("log", "--oneline"),
]);
s("02-rebase", "edge", "rebase with unstaged changes fails", [...branches(), g("switch", "-q", "topic"), w("topic.txt", "dirty\n"), x(1, r("rebase", "main"))]);

// ---------------------------------------------------------------- 3. reflog
p("03-reflog", "reflog after commits", [...base(), w("a.txt", "a\n"), r("add", "a.txt"), r("commit", "-m", "Add a"), ro("reflog")]);
p("03-reflog", "reflog show of a branch", [...base(), w("a.txt", "a\n"), r("add", "a.txt"), r("commit", "-m", "Add a"), ro("reflog", "show", "main")]);

s("03-reflog", "basic", "the first commit and an amend", [g("init", "-q"), w("a.txt", "a\n"), g("add", "a.txt"), r("commit", "-m", "Initial"), r("commit", "--amend", "-m", "Initial (amended)"), ro("reflog"), ro("reflog", "show", "main")]);
s("03-reflog", "basic", "checkout and switch", [...history(), g("branch", "other", "HEAD~1"), r("switch", "other"), r("checkout", "main"), r("checkout", "HEAD~2"), r("switch", "-c", "fresh"), ro("reflog")]);
s("03-reflog", "basic", "reset", [...history(), r("reset", "--hard", "HEAD~1"), r("reset", "--soft", "HEAD~1"), ro("reflog"), ro("reflog", "show", "main")]);
s("03-reflog", "basic", "fast-forward and non-fast-forward merges", [
  ...branches(),
  g("branch", "behind", "main~1"),
  g("switch", "-q", "behind"),
  r("merge", "main"),
  g("switch", "-q", "main"),
  r("merge", "--no-edit", "topic"),
  ro("reflog"),
  ro("reflog", "show", "behind"),
]);
s("03-reflog", "edge", "branch creation and renaming", [...history(), r("branch", "made", "HEAD~1"), r("branch", "-m", "made", "renamed"), r("branch", "-m", "trunk"), ro("reflog", "show", "renamed"), ro("reflog", "show", "trunk"), ro("reflog")]);
s("03-reflog", "basic", "cherry-pick and revert", [...branches(), r("cherry-pick", "topic~1"), r("revert", "--no-edit", "HEAD"), ro("reflog"), ro("reflog", "show", "main")]);
s("03-reflog", "edge", "rebase", [...branches(), g("switch", "-q", "topic"), r("rebase", "main"), ro("reflog"), ro("reflog", "show", "topic")]);
s("03-reflog", "basic", "reflog show <ref> after several operations", [
  ...history(),
  w("x.txt", "x\n"),
  r("add", "x.txt"),
  r("commit", "-m", "Add x"),
  r("reset", "--hard", "HEAD~2"),
  r("commit", "--allow-empty", "-m", "Empty"),
  ro("reflog", "show", "main"),
  ro("reflog", "show", "HEAD"),
]);
s("03-reflog", "basic", "the first commit in a new repository", [r("init", "-q"), w("a.txt", "a\n"), r("add", "a.txt"), r("commit", "-m", "First"), ro("reflog")]);
s("03-reflog", "edge", "commits on a detached HEAD", [...history(), r("checkout", "HEAD~1"), w("d.txt", "d\n"), r("add", "d.txt"), r("commit", "-m", "Detached work"), r("switch", "main"), ro("reflog")]);

// ---------------------------------------------------------------- 4. packed refs
p("04-packed-refs", "resolve a ref stored in packed-refs", [...history({ plain: true }), g("branch", "feature", "HEAD~1"), g("pack-refs", "--all"), ro("rev-parse", "feature", "main")]);

s("04-packed-refs", "basic", "branch listing and log from packed refs", [...history(), g("branch", "feature", "HEAD~1"), g("tag", "v1", "HEAD~2"), g("pack-refs", "--all"), ro("branch"), ro("tag"), ro("log", "--oneline", "feature")]);
s("04-packed-refs", "edge", "a loose ref takes precedence over a packed one", [
  ...history(),
  g("branch", "feature", "HEAD~2"),
  g("pack-refs", "--all"),
  g("update-ref", "refs/heads/feature", "HEAD"),
  ro("rev-parse", "feature"),
  r("switch", "feature"),
]);
s("04-packed-refs", "basic", "pack-refs --all", [...history(), g("branch", "b1", "HEAD~1"), g("branch", "b2", "HEAD~2"), g("tag", "light", "HEAD~1"), r("pack-refs", "--all")]);
s("04-packed-refs", "basic", "deleting a branch that exists only in packed-refs", [...history(), g("branch", "gone", "HEAD~1"), g("branch", "stays", "HEAD~2"), g("pack-refs", "--all"), r("branch", "-D", "gone"), ro("branch")]);
s("04-packed-refs", "basic", "deleting a tag that exists only in packed-refs", [...history(), g("tag", "t1", "HEAD~1"), g("tag", "t2"), g("pack-refs", "--all"), r("tag", "-d", "t1"), ro("tag")]);
s("04-packed-refs", "edge", "pack-refs with annotated tags writes peeled lines", [...history(), g("tag", "-a", "rel", "-m", "Release", "HEAD~1"), g("tag", "plain"), r("pack-refs", "--all")]);
s("04-packed-refs", "edge", "renaming a branch that exists only in packed-refs", [...history(), g("branch", "old-name", "HEAD~1"), g("pack-refs", "--all"), r("branch", "-m", "old-name", "new-name"), ro("branch"), ro("rev-parse", "new-name")]);

// ---------------------------------------------------------------- 5. packfiles
p("05-packfile", "cat-file after git gc", [...packedRepo(10, { plain: true }), g("gc", "-q"), ro("cat-file", "-p", "HEAD"), ro("cat-file", "-p", blobId(BASE["README.md"]))]);
p("05-packfile", "log after git gc", [...packedRepo(10, { plain: true }), g("gc", "-q"), ro("log", "--oneline")]);

const repackRefDelta = g("-c", "repack.useDeltaBaseOffset=false", "repack", "-a", "-d", "-f", "-q");
s("05-packfile", "basic", "cat-file -p of packed blobs", [...packedRepo(), g("gc", "-q"), ro("cat-file", "-p", "HEAD~20"), ro("cat-file", "-p", blobId(BASE["src/app.js"]))]);
s("05-packfile", "basic", "full log after gc", [...packedRepo(), g("gc", "-q"), ro("log"), ro("log", "-p", "-n", "3")]);
s("05-packfile", "edge", "REF_DELTA objects", [...packedRepo(), repackRefDelta, ro("log", "-p", "-n", "5"), ro("cat-file", "-s", "HEAD~25")]);
s("05-packfile", "edge", "deep delta chains", [
  ...packedRepo(60),
  g("repack", "-a", "-d", "-f", "-q", "--depth=50", "--window=250"),
  ro("diff", "HEAD~59", "HEAD"),
  ro("log", "-p", "--", "data.txt"),
]);
s("05-packfile", "basic", "packed and loose objects together", [
  ...packedRepo(),
  g("gc", "-q"),
  w("data.txt", "loose now\n"),
  ...t(40, commitAll("Loose commit")),
  ro("log", "--oneline", "-n", "5"),
  ro("diff", "HEAD~1", "HEAD", "--stat"),
]);
s("05-packfile", "basic", "status and ls-files after gc", [...packedRepo(), g("gc", "-q"), w("README.md", "changed\n"), ro("status", "--porcelain"), ro("ls-files", "-s")]);
s("05-packfile", "basic", "diff between packed commits", [...packedRepo(), g("gc", "-q"), ro("diff", "HEAD~10", "HEAD~3"), ro("diff", "--name-status", "HEAD~29", "HEAD")]);
s("05-packfile", "basic", "switch and checkout in a packed repository", [...packedRepo(), g("gc", "-q"), r("switch", "-c", "old", "HEAD~25"), r("checkout", "main"), r("checkout", "HEAD~12")]);
s("05-packfile", "basic", "commit on top of a packed repository", [...packedRepo(), g("gc", "-q"), w("new.txt", "n\n"), r("add", "new.txt"), r("commit", "-m", "After gc"), ro("cat-file", "-p", "HEAD")]);
s("05-packfile", "edge", "merge in a packed repository", [
  ...packedRepo(),
  g("switch", "-q", "-c", "side", "HEAD~15"),
  w("side.txt", "s\n"),
  ...t(41, commitAll("Side work")),
  g("switch", "-q", "main"),
  g("gc", "-q"),
  r("merge", "--no-edit", "side"),
  ro("cat-file", "-p", "HEAD"),
]);
s("05-packfile", "edge", "abbreviated IDs of packed objects", [...packedRepo(), g("gc", "-q"), ro("rev-parse", blobId(BASE["docs/guide.txt"]).slice(0, 7)), ro("cat-file", "-t", blobId(BASE["docs/guide.txt"]).slice(0, 9))]);
s("05-packfile", "edge", "sizes of deltified objects", [...packedRepo(), repackRefDelta, ro("cat-file", "-s", "HEAD~1"), ro("cat-file", "-s", "HEAD~28"), ro("cat-file", "-t", "HEAD~28")]);
s("05-packfile", "basic", "cherry-pick in a packed repository", [
  ...packedRepo(),
  g("switch", "-q", "-c", "side", "HEAD~5"),
  w("pick.txt", "p\n"),
  ...t(41, commitAll("Pick me")),
  g("switch", "-q", "main"),
  g("gc", "-q"),
  r("cherry-pick", "side"),
]);
s("05-packfile", "edge", "a large binary file in a pack", [
  g("init", "-q"),
  wb("big.bin", Array.from({ length: 300000 }, (_, i) => (i * 7919) % 251)),
  ...commitAll("Big binary"),
  wb("big.bin", Array.from({ length: 300000 }, (_, i) => ((i * 7919) % 251) ^ (i % 1000 === 0 ? 1 : 0))),
  ...t(1, commitAll("Big binary changed")),
  g("gc", "-q"),
  ro("cat-file", "-s", "HEAD~1"),
  ro("diff", "--stat", "HEAD~1", "HEAD"),
  r("checkout", "HEAD~1"),
]);
s("05-packfile", "edge", "several packs", [
  ...packedRepo(15),
  g("repack", "-a", "-d", "-q"),
  ...versions(25).slice(45),
  g("repack", "-d", "-q"),
  w("loose.txt", "l\n"),
  ...t(50, commitAll("Loose on top")),
  ro("log", "--oneline"),
  ro("cat-file", "-p", "HEAD~3"),
]);
s("05-packfile", "edge", "packed annotated tags", [...packedRepo(), g("gc", "-q"), ro("cat-file", "-t", "v1"), ro("cat-file", "-p", "v1"), ro("rev-parse", "v1", "light"), ro("show", "-s", "v1")]);
