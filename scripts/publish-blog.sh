#!/usr/bin/env bash
# publish-blog.sh
#
# Takes the newest Markdown file in blog/articles/ (relative to this repo),
# renders it through the site's template, updates the blog listing, and
# git-pushes the site repo. Vercel auto-deploys from the push.
#
# Usage: ./publish-blog.sh
#
# Exit codes:
#   0  success
#   1  no new article found
#   2  render failure
#   3  git failure

set -euo pipefail

# --- Paths ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
SITE_REPO="/home/zsn/Documents/Unnamed Folder/RevenueLyft"
ARTICLES_DIR="$AGENT_REPO/blog/articles"
LOG_PREFIX="[publish-blog]"

log() { echo "$LOG_PREFIX $*"; }
die() { echo "$LOG_PREFIX ERROR: $*" >&2; exit "${2:-1}"; }

[ -d "$SITE_REPO" ] || die "site repo not found at: $SITE_REPO"
[ -d "$ARTICLES_DIR" ] || die "articles dir not found at: $ARTICLES_DIR"

# --- Find newest article ---
LATEST_MD="$(ls -1 "$ARTICLES_DIR"/*.md 2>/dev/null | sort | tail -n 1 || true)"
if [ -z "$LATEST_MD" ]; then
  die "no markdown articles found in $ARTICLES_DIR" 1
fi
log "newest article: $LATEST_MD"

# --- Check if it's already published. The HTML file in the site repo
#     has the same base name as the .md plus .html. Skip if it exists
#     AND is newer than the markdown (i.e. nothing to do). ---
BASENAME="$(basename "$LATEST_MD" .md)"
TARGET_HTML="$SITE_REPO/blog/posts/${BASENAME}.html"
if [ -f "$TARGET_HTML" ] && [ "$TARGET_HTML" -nt "$LATEST_MD" ]; then
  log "already published and up to date: $TARGET_HTML"
  exit 0
fi

# --- Render ---
log "rendering markdown -> html"
SIDE_JSON="$(node "$SCRIPT_DIR/md-to-html.js" "$LATEST_MD" "$SITE_REPO")" || die "render failed" 2
log "rendered: $SIDE_JSON"

# --- Update listing ---
log "updating blog/index.html listing"
node "$SCRIPT_DIR/update-listing.js" "$SITE_REPO" || die "listing update failed" 2

# --- Commit & push ---
cd "$SITE_REPO"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  die "site repo is not a git repo: $SITE_REPO" 3
fi

git add blog/ index.html 2>/dev/null || true

if git diff --cached --quiet; then
  log "no changes to commit (already in sync)"
  exit 0
fi

COMMIT_MSG="blog: publish ${BASENAME}"
git commit -m "$COMMIT_MSG" || die "git commit failed" 3
log "committed: $COMMIT_MSG"

log "pushing to origin"
git push origin HEAD || die "git push failed" 3

log "done — Vercel will deploy within ~30s"
