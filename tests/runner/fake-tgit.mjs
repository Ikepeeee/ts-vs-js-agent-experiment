#!/usr/bin/env node
// Deliberately broken tgit for the runner's self-test: prints nothing and exits with the given code.
process.exit(Number(process.argv[2] ?? 0));
