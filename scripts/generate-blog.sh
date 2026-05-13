#!/usr/bin/env bash
# generate-blog.sh
#
# Runs Claude Code headless with a prompt that triggers the full agent
# pipeline (Content Researcher -> Copywriter) for a Blog post per
# CLAUDE.md. Output lands in blog/articles/YYYY-MM-DD-slug.md.
#
# Usage: ./generate-blog.sh
#
# Exit codes:
#   0  success (a new .md exists and is newer than before the run)
#   1  generation produced no new file

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
ARTICLES_DIR="$AGENT_REPO/blog/articles"
LOG_PREFIX="[generate-blog]"

log() { echo "$LOG_PREFIX $*"; }
die() { echo "$LOG_PREFIX ERROR: $*" >&2; exit "${2:-1}"; }

mkdir -p "$ARTICLES_DIR"

BEFORE_COUNT="$(ls -1 "$ARTICLES_DIR"/*.md 2>/dev/null | wc -l)"
TODAY="$(date +%Y-%m-%d)"
log "today is $TODAY · existing articles: $BEFORE_COUNT"

PROMPT="Generate today's blog article for RevenueLyft following CLAUDE.md.

Required flow (no skipping):
1. Content Researcher: list every existing file in blog/articles/ first, then pick a fresh topic whose slug is not already taken. Produce the brief.
2. Copywriter: turn the brief into the final 500-1000 word article per CLAUDE.md §4 (Blog format), including Title, Meta description, Target keyword, Suggested URL slug at the top.
3. Save the final article to blog/articles/${TODAY}-<slug>.md. The slug must match the Suggested URL slug from the article.
4. Do NOT call the Graphic Designer. Text-only article. No hero image prompt.
5. Reply with only the saved file path and a 2-line summary."

cd "$AGENT_REPO"

log "invoking claude headless"
# --print runs non-interactively, --permission-mode bypassPermissions allows
# file writes without prompts (we're running unattended).
claude \
  --print \
  --permission-mode bypassPermissions \
  --model claude-opus-4-7 \
  "$PROMPT" \
  || die "claude invocation failed"

AFTER_COUNT="$(ls -1 "$ARTICLES_DIR"/*.md 2>/dev/null | wc -l)"
log "articles after run: $AFTER_COUNT"

if [ "$AFTER_COUNT" -le "$BEFORE_COUNT" ]; then
  die "no new article was created" 1
fi

NEWEST="$(ls -1 "$ARTICLES_DIR"/*.md | sort | tail -n 1)"
log "new article: $NEWEST"
