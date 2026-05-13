#!/usr/bin/env node
/**
 * md-to-html.js
 *
 * Reads a Markdown blog article (the format the Copywriter produces per
 * CLAUDE.md §4), renders it through blog/_template.html, and writes the
 * resulting HTML into the site repo's blog/posts/ folder.
 *
 * Usage:
 *   node md-to-html.js <path/to/article.md> <site-repo-root>
 */

const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.error('md-to-html: ' + msg);
  process.exit(1);
}

const [, , mdPathArg, siteRootArg] = process.argv;
if (!mdPathArg || !siteRootArg) {
  fail('usage: md-to-html.js <article.md> <site-repo-root>');
}

const mdPath = path.resolve(mdPathArg);
const siteRoot = path.resolve(siteRootArg);
const templatePath = path.join(siteRoot, 'blog', '_template.html');
const postsDir = path.join(siteRoot, 'blog', 'posts');

if (!fs.existsSync(mdPath)) fail(`article not found: ${mdPath}`);
if (!fs.existsSync(templatePath)) fail(`template not found: ${templatePath}`);
fs.mkdirSync(postsDir, { recursive: true });

const raw = fs.readFileSync(mdPath, 'utf8');

// ---- Parse the loose "Key: value" frontmatter block at the top of the file.
// The Copywriter writes these as plain lines (Title:, Meta description:, etc.)
// before the article body. We stop at the first blank line OR first heading.
const lines = raw.split(/\r?\n/);
const meta = {};
let bodyStart = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.trim() === '') { bodyStart = i + 1; break; }
  if (/^#{1,6}\s/.test(line)) { bodyStart = i; break; }
  const m = line.match(/^([A-Za-z][A-Za-z ]+?):\s*(.+)$/);
  if (m) {
    meta[m[1].toLowerCase().trim()] = m[2].trim();
  } else {
    bodyStart = i;
    break;
  }
}
const bodyMd = lines.slice(bodyStart).join('\n').trim();

const title = meta['title'] || path.basename(mdPath, '.md');
const metaDesc = meta['meta description'] || meta['description'] || title;
const slugFromMeta = meta['suggested url slug'] || meta['slug'];

// Derive slug + date from filename: YYYY-MM-DD-slug.md
const fnameMatch = path.basename(mdPath).match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
if (!fnameMatch) fail(`filename must be YYYY-MM-DD-slug.md, got: ${path.basename(mdPath)}`);
const dateStr = fnameMatch[1];
const slug = slugFromMeta || fnameMatch[2];

const dateObj = new Date(dateStr + 'T12:00:00Z');
const dateIso = dateObj.toISOString();
const dateDisplay = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

// Estimate read time: 200 wpm
const wordCount = bodyMd.split(/\s+/).filter(Boolean).length;
const readTime = Math.max(1, Math.round(wordCount / 200));

// ---- Minimal markdown -> HTML renderer.
// Supports: # h1, ## h2, ### h3, paragraphs, **bold**, *italic*, `code`,
// [text](url), unordered/ordered lists, blockquotes, fenced code blocks.
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderInline(s) {
  let out = escapeHtml(s);
  // code first so its content isn't touched by other rules
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}
function renderMarkdown(md) {
  const src = md.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < src.length) {
    const line = src[i];

    if (line.trim() === '') { i++; continue; }

    // fenced code
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < src.length && !/^```/.test(src[i])) { buf.push(src[i]); i++; }
      i++;
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // headings
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const level = Math.min(h[1].length, 6);
      out.push(`<h${level}>${renderInline(h[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < src.length && /^>\s?/.test(src[i])) {
        buf.push(src[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderInline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // unordered list
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < src.length && /^[-*]\s+/.test(src[i])) {
        items.push(`<li>${renderInline(src[i].replace(/^[-*]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < src.length && /^\d+\.\s+/.test(src[i])) {
        items.push(`<li>${renderInline(src[i].replace(/^\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // paragraph (collect consecutive non-blank lines)
    const buf = [line];
    i++;
    while (i < src.length && src[i].trim() !== '' && !/^(#{1,6}\s|[-*]\s|\d+\.\s|>\s?|```)/.test(src[i])) {
      buf.push(src[i]);
      i++;
    }
    out.push(`<p>${renderInline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

const contentHtml = renderMarkdown(bodyMd);

// ---- Inject into template
const template = fs.readFileSync(templatePath, 'utf8');
const subs = {
  '{{TITLE}}': escapeHtml(title),
  '{{META_DESCRIPTION}}': escapeHtml(metaDesc),
  '{{SLUG}}': slug,
  '{{DATE_ISO}}': dateIso,
  '{{DATE_DISPLAY}}': dateDisplay,
  '{{READ_TIME}}': String(readTime),
  '{{CONTENT}}': contentHtml,
};
let html = template;
for (const [k, v] of Object.entries(subs)) {
  html = html.split(k).join(v);
}

const outPath = path.join(postsDir, `${dateStr}-${slug}.html`);
fs.writeFileSync(outPath, html);

// Also emit a JSON sidecar with the metadata the publish script needs to
// update blog/index.html. Keeps the bash script simple.
const sidecar = {
  slug,
  date: dateStr,
  dateDisplay,
  dateIso,
  title,
  metaDescription: metaDesc,
  readTime,
  htmlPath: outPath,
  postUrl: `/blog/posts/${dateStr}-${slug}.html`,
};
console.log(JSON.stringify(sidecar));
