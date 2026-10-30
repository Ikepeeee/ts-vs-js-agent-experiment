#!/bin/sh
# Takes the hashes to pre-register (experiment-design.md 13.1 step 3). Run inside the evaluation image from the
# experiment root: sh eval/freeze.sh <out-dir>
set -eu
OUT=$1
mkdir -p "$OUT"
# images.json holds the trial image's ID; lask.lock.json pins the evaluation image's recipe and the tools module.
find spec ts/AGENTS.md js/AGENTS.md tests/public tests/hidden tests/runner tests/random \
  main.lask lask.json lask.lock.json images images.json eval \
  -type f ! -name '*.log' | LC_ALL=C sort | xargs sha256sum > "$OUT/files.sha256"
for v in v1 v2 v3; do node tests/random/gen.mjs --version $v --seed 20261029 --out /tmp/random-$v; done > "$OUT/random.txt"
sha256sum "$OUT/files.sha256" "$OUT/random.txt" | tee "$OUT/freeze.sha256"
