#!/usr/bin/env node
/**
 * update-listing.js
 *
 * Rebuilds the post grid inside blog/index.html from every .html file
 * in blog/posts/ (newest first), replacing whatever is between
 * <!-- POSTS_START --> and <!-- POSTS_END -->.
 *
 * Usage:
 *   node update-listing.js <site-repo-root>
 */

const fs = require('fs');
const path = require('path');

const siteRoot = path.resolve(process.argv[2] || '.');
const postsDir = path.join(siteRoot, 'blog', 'posts');
const listingPath = path.join(siteRoot, 'blog', 'index.html');

if (!fs.existsSync(listingPath)) {
  console.error('listing not found: ' + listingPath);
  process.exit(1);
}
if (!fs.existsSync(postsDir)) {
  console.error('posts dir not found: ' + postsDir);
  process.exit(1);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Extract title + description + date from each post HTML by reading the
// <title> and meta description and the article__meta block. Cheap regex
// parse — these files are produced by our own template so format is stable.
function readPostMeta(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
  const dateMatch = html.match(/article:published_time" content="([^"]+)"/);
  const metaLineMatch = html.match(/<div class="article__meta">([^<]+)<\/div>/);

  let title = titleMatch ? titleMatch[1].replace(/\s*\|\s*Revenue Lyft\s*$/, '') : path.basename(htmlPath, '.html');
  let desc = descMatch ? descMatch[1] : '';
  let dateIso = dateMatch ? dateMatch[1] : '';
  let dateDisplay = '';
  let readTime = '';
  if (metaLineMatch) {
    const parts = metaLineMatch[1].split('·').map(s => s.trim());
    dateDisplay = parts[0] || '';
    const rtMatch = (parts[1] || '').match(/(\d+)/);
    if (rtMatch) readTime = rtMatch[1];
  }

  return { title, desc, dateIso, dateDisplay, readTime, file: path.basename(htmlPath) };
}

const files = fs.readdirSync(postsDir)
  .filter(f => f.endsWith('.html'))
  .sort()
  .reverse(); // newest first (filenames start with YYYY-MM-DD)

let cards;
if (files.length === 0) {
  cards = `
        <div class="empty-state">
          <div class="empty-state__title">First article coming soon</div>
          <div>New posts publish every Tuesday and Thursday.</div>
        </div>`;
} else {
  cards = files.map(f => {
    const meta = readPostMeta(path.join(postsDir, f));
    const url = `/blog/posts/${f}`;
    const metaLine = [meta.dateDisplay, meta.readTime ? `${meta.readTime} min read` : null]
      .filter(Boolean).join(' · ');
    return `
        <a class="post-card" href="${url}">
          <div class="post-card__meta">${escapeHtml(metaLine)}</div>
          <h2 class="post-card__title">${escapeHtml(meta.title)}</h2>
          <p class="post-card__excerpt">${escapeHtml(meta.desc)}</p>
          <div class="post-card__read">Read article</div>
        </a>`;
  }).join('');
}

const listing = fs.readFileSync(listingPath, 'utf8');
const updated = listing.replace(
  /<!-- POSTS_START -->[\s\S]*?<!-- POSTS_END -->/,
  `<!-- POSTS_START -->${cards}\n        <!-- POSTS_END -->`
);

if (updated === listing) {
  console.error('update-listing: could not find POSTS_START/POSTS_END markers in ' + listingPath);
  process.exit(1);
}

fs.writeFileSync(listingPath, updated);
console.log(`update-listing: wrote ${files.length} post card(s) to ${listingPath}`);
