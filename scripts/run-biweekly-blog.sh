#!/usr/bin/env bash
# run-biweekly-blog.sh
#
# Entry point for the scheduler. Generates today's blog article via the
# agent pipeline, then publishes it to the site (commit + push).
#
# Schedule: Tuesday & Thursday at 17:00 Asia/Karachi.
#
# Usage: ./run-biweekly-blog.sh
#
# Logs to logs/blog-<date>.log alongside this script.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$AGENT_REPO/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/blog-$(date +%Y-%m-%d_%H%M%S).log"

# Tee everything to the log file as well as stdout/stderr.
exec > >(tee -a "$LOG_FILE") 2>&1

echo "==================================================="
echo "[run-biweekly-blog] start: $(date -Iseconds)"
echo "==================================================="

echo "[run-biweekly-blog] step 1/2 — generate"
"$SCRIPT_DIR/generate-blog.sh"

echo "[run-biweekly-blog] step 2/2 — publish"
"$SCRIPT_DIR/publish-blog.sh"

echo "==================================================="
echo "[run-biweekly-blog] done: $(date -Iseconds)"
echo "==================================================="
