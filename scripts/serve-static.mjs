#!/usr/bin/env node
/**
 * Minimal static file server for the exported site in `out/`.
 *
 * Exists so the browser test suite can exercise the **production build** rather than a dev
 * server: `next dev` is a different program from what ships, and the export is what a host
 * actually serves. Writing it here keeps the project free of a runtime dependency for what
 * amounts to resolving a path and setting a Content-Type.
 *
 * Deliberately small, and deliberately strict:
 *   - `trailingSlash: true` means `/talk/` must resolve to `talk/index.html`;
 *   - a request for a directory without a trailing slash is redirected, matching static hosts;
 *   - a missing path falls back to `404.html`, which is what the export contains;
 *   - path traversal is rejected rather than normalised away.
 *
 * Usage:
 *   node scripts/serve-static.mjs [port] [directory]
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4321);
const DIR = resolve(ROOT, process.argv[3] ?? 'out');

/**
 * Content types the export actually contains.
 *
 * `.wasm` and `.task` matter most: serving either as `application/octet-stream` makes
 * `WebAssembly.instantiateStreaming` and the MediaPipe loader fail in ways that look like
 * unrelated errors.
 */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.map': 'application/json; charset=utf-8',
};

/** Resolve a URL path to a file inside DIR, or null. Never escapes DIR. */
function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  const candidate = resolve(DIR, relative);
  if (candidate !== DIR && !candidate.startsWith(DIR + sep)) return null;

  if (existsSync(candidate)) {
    const stats = statSync(candidate);
    if (stats.isDirectory()) {
      const index = join(candidate, 'index.html');
      return existsSync(index) ? { file: index, stats: statSync(index) } : null;
    }
    return { file: candidate, stats };
  }

  // `/talk` -> `/talk/index.html` for hosts that do not redirect.
  if (!decoded.endsWith('/')) {
    const index = join(candidate, 'index.html');
    if (existsSync(index)) return { file: index, stats: statSync(index) };
  }
  return null;
}

const server = createServer((request, response) => {
  const url = request.url ?? '/';

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  const found = resolveFile(url);

  if (!found) {
    const fallback = join(DIR, '404.html');
    if (existsSync(fallback)) {
      const body = createReadStream(fallback);
      response.writeHead(404, { 'Content-Type': TYPES['.html'] });
      if (request.method === 'HEAD') {
        body.destroy();
        response.end();
        return;
      }
      body.pipe(response);
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('404 Not Found');
    return;
  }

  const type = TYPES[extname(found.file).toLowerCase()] ?? 'application/octet-stream';
  response.writeHead(200, {
    'Content-Type': type,
    'Content-Length': found.stats.size,
    // Mirrors public/_headers so the browser behaves the same here as on a real host.
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store',
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(found.file).pipe(response);
});

if (!existsSync(DIR)) {
  console.error(
    `[serve-static] ${DIR} does not exist. Run \`npm run build\` first (the export is written to out/).`,
  );
  process.exit(1);
}

server.listen(PORT, '127.0.0.1', () => {
  // The test harness waits for this line.
  console.log(`[serve-static] serving ${DIR} at http://127.0.0.1:${PORT}`);
});
