#!/bin/sh
# Runs every test against the real git on both sides, to confirm the tests themselves (experiment-design.md 13.1).
# Run inside the evaluation image from the experiment root: sh eval/validate-tests.sh <out-dir>
set -u
OUT=$1
mkdir -p "$OUT"
{
  echo "== versions"; node --version; git --version; uname -m
  cd tests
  # Hand-written scenarios: twice, to catch nondeterminism. --strict also checks the declared exit codes.
  for round in 1 2; do
    echo "== hand-written scenarios, round $round"
    node runner/run.mjs --tgit git --strict --json "../$OUT/handwritten-$round.json" hidden .validate
    node runner/run.mjs --tgit git --json "../$OUT/public-$round.json" public
  done
  echo "== self-test with a broken tgit (should mostly fail)"
  node runner/run.mjs --tgit "[\"node\",\"$PWD/runner/fake-tgit.mjs\",\"0\"]" hidden public | tail -1
  for v in v1 v2 v3; do
    echo "== random sequences $v"
    node random/gen.mjs --version $v --seed 20261029 --out /tmp/random/$v
    node runner/run.mjs --tgit git --json "../$OUT/random-$v.json" /tmp/random/$v
  done
  echo "== done"
} 2>&1 | tee "$OUT/validate.log"
