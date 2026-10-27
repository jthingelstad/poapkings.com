// What a deploy to S3 publishes, and how each file is served: its content type and Cache-Control.
// GitHub Pages, the host until 2026-10-27, typed files by extension and cached everything ten minutes;
// this table is the control it never gave. tests/aws-hosting.test.mjs fails when the build writes a file this table does not type, so
// a new kind of file is a decision, not octet-stream by default.
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

// The redirect map goes to the key value store instead.
export const NOT_PUBLISHED = new Set(['_redirects.json']);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json'
};

// XML is read, not guessed: an RSS document is RSS; anything else (/sitemap.xml) is application/xml.
// Extensions are matched in any case.
export function contentTypeFor(key, head = '') {
  const ext = extname(key).toLowerCase();
  if (ext === '.xml') return /<rss[\s>]/.test(head) ? 'application/rss+xml; charset=utf-8' : 'application/xml; charset=utf-8';
  return TYPES[ext] ?? 'application/octet-stream';
}

// Browsers keep a page five minutes; CloudFront keeps it a day, and every deploy clears CloudFront.
// esbuild's chunks in /assets/js/ are named by their content hash, so browsers keep them a week.
// Everything else is the page rule: CSS and JS carry ?v= (the bust filter) that CloudFront's cache key
// ignores, and the data files change with every refresh.
export function cacheControlFor(key) {
  if (key.startsWith('assets/js/')) return 'public, max-age=604800';
  return 'public, max-age=300, s-maxage=86400';
}

function walk(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(root, path);
    return entry.isFile() ? [relative(root, path).split(sep).join('/')] : [];
  });
}

// Every published file with its type and caching, in the order a deploy writes them: files first, then
// pages, the front page last, so no page goes out before what it loads.
export function publishPlan(root) {
  const rank = (key) => (key === 'index.html' ? 2 : key.endsWith('.html') ? 1 : 0);
  return walk(root)
    .filter((key) => !NOT_PUBLISHED.has(key) && !key.split('/').pop().startsWith('.'))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((key) => {
      const path = join(root, key);
      const head = readFileSync(path).subarray(0, 512).toString('utf8');
      return { key, path, contentType: contentTypeFor(key, head), cacheControl: cacheControlFor(key) };
    });
}
