#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

git pull --ff-only

python3 scripts/update-data.py

if git diff --quiet; then
  echo "No data changes to commit."
  exit 0
fi

git add -A
git commit -m "update data"
git push
