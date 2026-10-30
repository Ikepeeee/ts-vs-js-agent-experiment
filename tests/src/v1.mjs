// v0.1.0 scenarios (spec-v1.md). Hidden: 82, public: 16.
import { S, w, wb, mk, del, chmod, ln, g, r, ro, at, x, env, blobId, treeId, files, commitAll, repo, base, history, BASE } from "./dsl.mjs";

const s = (section, level, title, steps) => S("v1", section, level, title, steps);
const p = (section, title, steps) => S("v1", section, "basic", title, steps, { pub: true });

const MISSING = "0123456789abcdef0123456789abcdef01234567";
const SPECIAL = ["with space.txt", "日本語.txt", "-dash.txt"];
const bytes256 = Array.from({ length: 256 }, (_, i) => i);

// ---------------------------------------------------------------- 2. Command dispatch
p("02-dispatch", "a command outside a repository fails", [x(128, ro("log"))]);

s("02-dispatch", "basic", "unknown command fails", [...base(), x(1, ro("frobnicate"))]);
s("02-dispatch", "basic", "status outside a repository fails", [x(128, ro("status", "--porcelain"))]);
s("02-dispatch", "basic", "repository is found from a nested subdirectory", [
  ...base(),
  mk("src/lib/deep/er"),
  at("src/lib/deep/er", ro("cat-file", "-t", "HEAD")),
]);
s("02-dispatch", "edge", "hash-object works outside a repository", [w("f.txt", "outside\n"), x(0, ro("hash-object", "f.txt"))]);

// ---------------------------------------------------------------- 3. init
p("03-init", "init with no arguments", [ro("init")]);

s("03-init", "basic", "init with a directory argument", [ro("init", "project")]);
s("03-init", "basic", "init -q prints nothing", [ro("init", "-q")]);
s("03-init", "basic", "init creates nested missing directories", [ro("init", "a/b/c")]);
s("03-init", "basic", "init -b sets the initial branch", [ro("init", "-b", "trunk")]);
s("03-init", "edge", "init --initial-branch= form", [ro("init", "--initial-branch=dev", "work")]);
s("03-init", "basic", "reinitializing an existing repository", [...base(), ro("init")]);
s("03-init", "basic", "real git can add and commit in a tgit-created repository", [
  r("init"),
  ...files(BASE),
  ...commitAll("first"),
  w("more.txt", "more\n"),
  ...commitAll("second"),
]);
s("03-init", "edge", "reinitializing with -b on a repository that has commits", [...base(), ro("init", "-b", "other")]);

// ---------------------------------------------------------------- 4. Objects, hash-object, cat-file
p("04-objects", "hash-object prints the blob ID", [g("init", "-q"), w("hello.txt", "hello world\n"), ro("hash-object", "hello.txt")]);
p("04-objects", "hash-object -w then cat-file -p", [
  g("init", "-q"),
  w("a.txt", "alpha\n"),
  ro("hash-object", "-w", "a.txt"),
  ro("cat-file", "-p", blobId("alpha\n")),
]);
p("04-objects", "cat-file -t of HEAD", [...base(), ro("cat-file", "-t", "HEAD")]);

s("04-objects", "edge", "hash-object of an empty file", [g("init", "-q"), w("empty", ""), ro("hash-object", "-w", "empty")]);
s("04-objects", "edge", "hash-object of binary content", [g("init", "-q"), wb("bin.dat", bytes256), ro("hash-object", "-w", "bin.dat")]);
s("04-objects", "basic", "hash-object -w with several files", [
  g("init", "-q"),
  w("one.txt", "1\n"),
  w("two.txt", "2\n"),
  w("three.txt", "3\n"),
  ro("hash-object", "-w", "one.txt", "two.txt", "three.txt"),
]);
s("04-objects", "basic", "cat-file -p of a commit", [...history(), ro("cat-file", "-p", "HEAD")]);
s("04-objects", "basic", "cat-file -p of a tree with modes", [
  g("init", "-q"),
  ...files(BASE),
  w("run.sh", "#!/bin/sh\necho hi\n"),
  chmod("run.sh"),
  ln("link", "README.md"),
  ...commitAll("modes"),
  ro("cat-file", "-p", treeId({ ...BASE, "run.sh": { content: "#!/bin/sh\necho hi\n", mode: "100755" }, link: { link: "README.md" } })),
  ro("cat-file", "-p", treeId({ "util.js": BASE["src/lib/util.js"] })),
]);
s("04-objects", "basic", "cat-file -s of a blob and a commit", [...base(), ro("cat-file", "-s", blobId(BASE["README.md"])), ro("cat-file", "-s", "HEAD")]);
s("04-objects", "basic", "cat-file with revisions", [...history(), ro("cat-file", "-p", "HEAD~1"), ro("cat-file", "-t", "main^"), ro("cat-file", "-s", "HEAD~2")]);
s("04-objects", "edge", "trees written by tgit use git's entry order", [
  g("init", "-q"),
  w("a-b", "1\n"),
  w("a/x", "2\n"),
  w("a.b", "3\n"),
  w("a0", "4\n"),
  w("ab/c", "5\n"),
  w("a_", "6\n"),
  r("add", "."),
  r("commit", "-m", "ordering"),
]);
s("04-objects", "edge", "trees written by tgit use git's modes", [
  g("init", "-q"),
  w("plain.txt", "p\n"),
  w("tool.sh", "#!/bin/sh\n"),
  chmod("tool.sh"),
  ln("alias", "plain.txt"),
  w("dir/inner.txt", "i\n"),
  r("add", "."),
  r("commit", "-m", "modes"),
]);
s("04-objects", "basic", "cat-file with an abbreviated object ID", [
  ...base(),
  ro("cat-file", "-p", blobId(BASE["src/app.js"]).slice(0, 7)),
  ro("cat-file", "-t", blobId(BASE["src/app.js"]).slice(0, 10)),
]);
s("04-objects", "edge", "cat-file with an invalid object name fails", [...base(), x(128, ro("cat-file", "-p", "no-such-ref")), x(128, ro("cat-file", "-t", MISSING))]);

// ---------------------------------------------------------------- 5. add
p("05-add", "add a single file", [g("init", "-q"), w("a.txt", "a\n"), w("b.txt", "b\n"), r("add", "a.txt")]);

s("05-add", "basic", "add .", [g("init", "-q"), ...files(BASE), w("top.txt", "t\n"), r("add", ".")]);
s("05-add", "basic", "add a directory", [g("init", "-q"), ...files(BASE), w("other.txt", "o\n"), r("add", "src")]);
s("05-add", "basic", "add -A stages new, modified, and deleted files", [
  ...base(),
  w("README.md", "changed\n"),
  del("docs/guide.txt"),
  w("new/file.txt", "new\n"),
  r("add", "-A"),
]);
s("05-add", "edge", "adding an ignored path fails", [
  g("init", "-q"),
  w(".gitignore", "*.log\n"),
  w("debug.log", "log\n"),
  x(1, r("add", "debug.log")),
]);
s("05-add", "basic", "adding a missing path fails", [g("init", "-q"), w("a.txt", "a\n"), x(128, r("add", "nope.txt"))]);
s("05-add", "edge", "a file replaced by a directory", [
  ...repo({ "thing": "file\n", "keep.txt": "k\n" }),
  del("thing"),
  w("thing/inside.txt", "now a dir\n"),
  r("add", "-A"),
]);
s("05-add", "edge", "a directory replaced by a file", [
  ...repo({ "thing/a.txt": "a\n", "thing/b.txt": "b\n", "keep.txt": "k\n" }),
  del("thing"),
  w("thing", "now a file\n"),
  r("add", "-A"),
]);
s("05-add", "edge", "paths with spaces, non-ASCII characters, and a leading dash", [
  g("init", "-q"),
  ...SPECIAL.map((f) => w(f, `${f}\n`)),
  r("add", "--", ...SPECIAL),
]);
s("05-add", "basic", "add . from a subdirectory adds only that subdirectory", [
  g("init", "-q"),
  ...files(BASE),
  at("src", r("add", ".")),
]);
s("05-add", "basic", "add an executable file and a symlink", [
  g("init", "-q"),
  w("run.sh", "#!/bin/sh\n"),
  chmod("run.sh"),
  w("target.txt", "t\n"),
  ln("pointer", "target.txt"),
  r("add", "run.sh", "pointer", "target.txt"),
]);

// ---------------------------------------------------------------- 5. ls-files
p("05-ls-files", "ls-files lists tracked files", [...base(), ro("ls-files")]);

s("05-ls-files", "basic", "ls-files -s shows modes and stages", [
  g("init", "-q"),
  ...files(BASE),
  w("run.sh", "#!/bin/sh\n"),
  chmod("run.sh"),
  ln("link", "README.md"),
  ...commitAll("c"),
  ro("ls-files", "-s"),
]);
s("05-ls-files", "edge", "ls-files from a subdirectory", [...base(), at("src", ro("ls-files")), at("src", ro("ls-files", "-s"))]);
s("05-ls-files", "edge", "ls-files quotes special paths", [g("init", "-q"), ...SPECIAL.map((f) => w(f, "x\n")), w("tab\there", "t\n"), ...commitAll("c"), ro("ls-files")]);

// ---------------------------------------------------------------- 5. status
p("05-status", "status --porcelain with untracked and staged files", [
  ...base(),
  w("new.txt", "n\n"),
  g("add", "new.txt"),
  w("other.txt", "o\n"),
  ro("status", "--porcelain"),
]);

s("05-status", "basic", "untracked directories are shown as dir/", [...base(), w("newdir/a.txt", "a\n"), w("newdir/sub/b.txt", "b\n"), ro("status", "--porcelain")]);
s("05-status", "basic", "staged addition, modification, and deletion", [
  ...base(),
  w("added.txt", "a\n"),
  w("README.md", "modified\n"),
  g("rm", "-q", "docs/guide.txt"),
  g("add", "-A"),
  ro("status", "--porcelain"),
]);
s("05-status", "basic", "unstaged modification and deletion", [...base(), w("src/app.js", "changed\n"), del("README.md"), ro("status", "--porcelain")]);
s("05-status", "edge", "a file staged and then modified again", [...base(), w("README.md", "v2\n"), g("add", "README.md"), w("README.md", "v3\n"), ro("status", "--porcelain")]);
s("05-status", "basic", "ignored files are not shown", [
  ...base(),
  w(".gitignore", "*.log\n"),
  w("app.log", "l\n"),
  w("notes.txt", "n\n"),
  ro("status", "--porcelain"),
]);
s("05-status", "basic", "a repository with no commits yet", [g("init", "-q"), w("a.txt", "a\n"), w("b.txt", "b\n"), g("add", "a.txt"), ro("status", "--porcelain")]);
s("05-status", "edge", "status --porcelain from a subdirectory", [...base(), w("src/new.js", "n\n"), w("top.txt", "t\n"), w("docs/guide.txt", "edited\n"), at("src", ro("status", "--porcelain"))]);
s("05-status", "edge", "status quotes special paths", [g("init", "-q"), ...SPECIAL.map((f) => w(f, "x\n")), g("add", "日本語.txt"), ro("status", "--porcelain")]);
s("05-status", "edge", "a staged deletion with the file recreated", [...base(), g("rm", "-q", "README.md"), w("README.md", "back again\n"), ro("status", "--porcelain")]);
s("05-status", "edge", "a mode change only", [g("init", "-q"), w("script.sh", "#!/bin/sh\n"), ...commitAll("c"), chmod("script.sh"), ro("status", "--porcelain")]);
s("05-status", "basic", "a clean working tree", [...base(), ro("status", "--porcelain"), w("README.md", BASE["README.md"]), ro("status", "--porcelain"), w("README.md", "dirty\n"), ro("status", "--porcelain")]);

// ---------------------------------------------------------------- 5. .gitignore (root only)
p("05-ignore", ".gitignore with a wildcard", [
  ...base(),
  w(".gitignore", "*.log\n"),
  w("a.log", "a\n"),
  w("b.txt", "b\n"),
  ro("status", "--porcelain"),
]);

s("05-ignore", "basic", "comments and blank lines", [
  ...base(),
  w(".gitignore", "# comment\n\n*.bak\n\n# another\n"),
  w("x.bak", "x\n"),
  w("# comment", "not ignored\n"),
  w("y.txt", "y\n"),
  ro("status", "--porcelain"),
]);
s("05-ignore", "basic", "a wildcard matches in subdirectories", [
  ...base(),
  w(".gitignore", "*.tmp\n"),
  w("a.tmp", "1\n"),
  w("src/b.tmp", "2\n"),
  w("src/lib/c.tmp", "3\n"),
  w("src/keep.js", "k\n"),
  ro("status", "--porcelain"),
]);
s("05-ignore", "basic", "a directory pattern", [
  ...base(),
  w(".gitignore", "build/\n"),
  w("build/out.js", "o\n"),
  w("src/build/gen.js", "g\n"),
  w("src/main.js", "m\n"),
  ro("status", "--porcelain"),
]);
s("05-ignore", "edge", "a directory pattern does not match a file", [
  ...base(),
  w(".gitignore", "cache/\n"),
  w("cache", "a file named cache\n"),
  w("src/cache/data", "d\n"),
  ro("status", "--porcelain"),
  x(0, r("add", "cache")),
]);

// ---------------------------------------------------------------- 6. commit
p("06-commit", "commit -m", [g("init", "-q"), ...files(BASE), g("add", "."), r("commit", "-m", "First commit")]);

s("06-commit", "basic", "commit -a", [...base(), w("README.md", "updated\n"), r("commit", "-a", "-m", "Update README")]);
s("06-commit", "basic", "repeated -m become paragraphs", [...base(), w("a.txt", "a\n"), g("add", "a.txt"), r("commit", "-m", "Subject line", "-m", "Body paragraph one.", "-m", "Body paragraph two.")]);
s("06-commit", "basic", "commit -a stages deletions but not untracked files", [
  ...base(),
  del("docs/guide.txt"),
  w("src/app.js", "changed\n"),
  w("untracked.txt", "u\n"),
  r("commit", "-a", "-m", "Delete and modify"),
]);
s("06-commit", "basic", "nothing to commit fails", [...base(), x(1, r("commit", "-m", "empty"))]);
s("06-commit", "edge", "a root commit with nested directories", [
  g("init", "-q"),
  w("a/b/c/d.txt", "deep\n"),
  w("a/b/e.txt", "e\n"),
  w("a/f.txt", "f\n"),
  w("z.txt", "z\n"),
  g("add", "."),
  r("commit", "-m", "Nested"),
]);
s("06-commit", "edge", "commit from a subdirectory", [...base(), w("src/new.js", "n\n"), at("src", g("add", "new.js")), at("src/lib", r("commit", "-m", "From a subdirectory"))]);
s("06-commit", "edge", "a commit that removes every file", [...base(), g("rm", "-r", "-q", "."), r("commit", "-m", "Remove everything")]);

// ---------------------------------------------------------------- 6. rev-parse
p("06-rev-parse", "rev-parse HEAD", [...base(), ro("rev-parse", "HEAD")]);

s("06-rev-parse", "basic", "ref names", [...history(), g("branch", "feature", "HEAD~1"), ro("rev-parse", "main", "refs/heads/main", "feature", "refs/heads/feature")]);
s("06-rev-parse", "basic", "abbreviated object IDs", [...base(), ro("rev-parse", blobId(BASE["README.md"]).slice(0, 8))]);
s("06-rev-parse", "basic", "~n, ^, and combinations", [...history(), ro("rev-parse", "HEAD~2", "HEAD^", "main~1^", "HEAD^^", "HEAD~0")]);
s("06-rev-parse", "edge", "invalid revisions", [...history(), x(128, ro("rev-parse", "nosuchbranch")), x(128, ro("rev-parse", "HEAD~5"))]);
s("06-rev-parse", "edge", "an unborn HEAD", [g("init", "-q"), x(128, ro("rev-parse", "HEAD"))]);

// ---------------------------------------------------------------- 6. log
p("06-log", "log --oneline", [...history({ plain: true }), ro("log", "--oneline")]);
p("06-log", "log default output", [...history({ plain: true }), ro("log")]);

s("06-log", "basic", "-n limits the number of commits", [...history(), ro("log", "-n", "2", "--oneline"), ro("log", "-n", "1")]);
s("06-log", "edge", "log on an unborn branch", [g("init", "-q"), x(128, ro("log"))]);
s("06-log", "edge", "a multi-paragraph message", [
  ...base(),
  w("x.txt", "x\n"),
  g("add", "x.txt"),
  g("commit", "-q", "-m", "Subject", "-m", "First paragraph\nwith two lines.", "-m", "Second paragraph."),
  ro("log", "--oneline"),
  ro("log", "-n", "1"),
]);
s("06-log", "edge", "dates and names from different authors", [
  g("init", "-q"),
  w("a.txt", "1\n"),
  g("add", "a.txt"),
  env({ GIT_AUTHOR_NAME: "Zoë Ünïcode", GIT_AUTHOR_EMAIL: "zoe@example.org", GIT_AUTHOR_DATE: "1234567890 +0900" }, g("commit", "-q", "-m", "Non-ASCII author")),
  w("a.txt", "2\n"),
  env({ GIT_AUTHOR_DATE: "1600000000 -0530" }, g("commit", "-q", "-a", "-m", "Negative offset")),
  ro("log"),
]);
s("06-log", "basic", "log from a subdirectory", [...history(), at("src/lib", ro("log", "--oneline"))]);
s("06-log", "basic", "log on another branch shows only its history", [...history(), g("switch", "-q", "-c", "old", "HEAD~1"), ro("log", "--oneline"), ro("log", "-n", "1")]);

// ---------------------------------------------------------------- 6. branch
p("06-branch", "create and list branches", [...history({ plain: true }), r("branch", "feature"), ro("branch")]);

s("06-branch", "basic", "branch -d of a merged branch", [...history(), g("branch", "done"), r("branch", "-d", "done"), ro("branch")]);
s("06-branch", "basic", "create a branch at a given commit", [...history(), r("branch", "old", "HEAD~2"), r("branch", "zeta", "HEAD~1"), r("branch", "Alpha"), ro("branch")]);
s("06-branch", "edge", "-d of an unmerged branch fails", [
  ...base(),
  g("switch", "-q", "-c", "topic"),
  w("t.txt", "t\n"),
  ...commitAll("topic work"),
  g("switch", "-q", "main"),
  x(1, r("branch", "-d", "topic")),
]);
s("06-branch", "basic", "creating an existing branch fails", [...history(), g("branch", "feature"), x(128, r("branch", "feature"))]);
s("06-branch", "edge", "listing while on another branch", [...history(), g("branch", "feature"), g("switch", "-q", "-c", "work", "HEAD~1"), ro("branch")]);
s("06-branch", "edge", "creating a branch on an unborn branch fails", [g("init", "-q"), x(128, r("branch", "feature")), ro("branch")]);

// ---------------------------------------------------------------- 6. switch
p("06-switch", "switch to another branch", [...history({ plain: true }), g("branch", "old", "HEAD~2"), r("switch", "old")]);
p("06-switch", "switch -c", [...history({ plain: true }), r("switch", "-c", "feature"), ro("branch")]);

s("06-switch", "basic", "switch -c, commit, and switch back", [...history(), r("switch", "-c", "topic"), w("t.txt", "t\n"), ...commitAll("t"), r("switch", "main")]);
s("06-switch", "edge", "non-conflicting local changes are carried over", [
  ...history(),
  g("branch", "old", "HEAD~2"),
  w("src/app.js", "local edit\n"),
  w("untracked.txt", "u\n"),
  r("switch", "old"),
]);
s("06-switch", "edge", "conflicting local changes make switching fail", [
  ...history(),
  g("branch", "old", "HEAD~2"),
  w("README.md", "local edit that conflicts\n"),
  x(1, r("switch", "old")),
]);
s("06-switch", "basic", "switching adds and removes files and directories", [
  ...base(),
  g("switch", "-q", "-c", "other"),
  g("rm", "-r", "-q", "src"),
  w("extra/deep/file.txt", "e\n"),
  ...commitAll("Restructure"),
  g("switch", "-q", "main"),
  r("switch", "other"),
  r("switch", "main"),
]);
s("06-switch", "edge", "switching changes modes and symlinks", [
  g("init", "-q"),
  w("tool", "#!/bin/sh\n"),
  w("target.txt", "t\n"),
  ...commitAll("plain"),
  g("switch", "-q", "-c", "modes"),
  chmod("tool"),
  ln("link", "target.txt"),
  ...commitAll("exec and link"),
  g("switch", "-q", "main"),
  r("switch", "modes"),
  r("switch", "main"),
]);
s("06-switch", "basic", "switching to a missing branch fails", [...history(), x(128, r("switch", "nope"))]);
s("06-switch", "edge", "switch from a subdirectory", [...history(), g("branch", "old", "HEAD~2"), at("src", r("switch", "old"))]);
