#!/bin/bash
set -e
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$REPO_DIR/scripts/auto-update.log"

echo "=== $(date) ===" >> "$LOG"
cd "$REPO_DIR"

git pull >> "$LOG" 2>&1

python3 scripts/update-data.py >> "$LOG" 2>&1

git add -A >> "$LOG" 2>&1
if git diff --cached --quiet; then
  echo "No changes to commit." >> "$LOG"
else
  git commit -m "Auto-update clan data [$(date +%Y-%m-%d)]" >> "$LOG" 2>&1
  git push >> "$LOG" 2>&1
  echo "Pushed." >> "$LOG"
fi
