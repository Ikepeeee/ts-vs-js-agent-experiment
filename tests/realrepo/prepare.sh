#!/bin/sh
# Builds the archive of the real repository used by hidden test 3 (psf/requests at a fixed commit).
# Only main and the tags are kept, so that the archive does not change when other branches move.
# Usage: sh tests/realrepo/prepare.sh   (writes tests/realrepo/requests.tar and prints its sha256)
set -eu
COMMIT=3c7baaa05ab4aa49cc819ce3a819d260de19c157
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

git clone -q --bare https://github.com/psf/requests.git "$WORK/requests.git"
cd "$WORK/requests.git"
git cat-file -e "$COMMIT^{commit}"
git for-each-ref --format='%(refname)' refs/heads | while read -r ref; do git update-ref -d "$ref"; done
git update-ref refs/heads/main "$COMMIT"
git symbolic-ref HEAD refs/heads/main
git config --unset-all remote.origin.fetch || true
git config --remove-section remote.origin || true
git reflog expire --expire=now --all
git gc -q --prune=now
cd "$WORK"
# The archive is built once before the experiment; its sha256 is what gets pre-registered.
COPYFILE_DISABLE=1 tar -cf "$HERE/requests.tar" requests.git   # no AppleDouble files on macOS
shasum -a 256 "$HERE/requests.tar"
