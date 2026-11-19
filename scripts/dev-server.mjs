#!/usr/bin/env node
// Zero-dependency local preview: serves public/ and runs api/*.js like Vercel does.
// Usage: npm start   (then open http://localhost:3000)
// Reads .env for N8N_* variables; without them the site runs in demo mode.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
const port = Number(process.env.PORT || 3000);

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
      const file = join(root, 'api', `${name}.js`);
      if (!name || !existsSync(file)) { res.statusCode = 404; return res.end('Not found'); }
      const mod = await import(pathToFileURL(file).href);
      return await mod.default(req, res);
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/')) path += 'index.html';
    let file = join(root, 'public', path);
    if (!extname(file) && existsSync(file + '.html')) file += '.html'; // cleanUrls
    if (!(await stat(file).catch(() => null))?.isFile()) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end('Server error');
  }
}).listen(port, () => {
  const live = process.env.N8N_LEAD_WEBHOOK_URL ? 'live (n8n connected)' : 'demo (no N8N_LEAD_WEBHOOK_URL)';
  console.log(`LeadPilot running at http://localhost:${port}  [mode: ${live}]`);
});
