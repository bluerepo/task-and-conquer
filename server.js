// Task & Conquer local server. Run: node server.js  (Node 18 or newer, no packages needed)
// Serves the app on http://localhost:4173 and stores worlds as Markdown in ./maps/<map name>/world.md
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MAPS = path.join(ROOT, 'maps');
const PORT = Number(process.env.PORT) || 4173;
fs.mkdirSync(MAPS, { recursive: true });

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/config.yaml': ['config.yaml', 'text/yaml; charset=utf-8'],
};

function safeName(n) {
  const s = decodeURIComponent(n).replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/^\.+/, '').trim().slice(0, 80);
  return s || null;
}
function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 20 * 1024 * 1024) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if (STATIC[p] && req.method === 'GET') {
      const [file, type] = STATIC[p];
      return send(res, 200, fs.readFileSync(path.join(ROOT, file)), type);
    }
    if (p === '/api/ping') return send(res, 200, { ok: true });
    if (p === '/api/config') return send(res, 200, fs.readFileSync(path.join(ROOT, 'config.yaml'), 'utf8'), 'text/plain; charset=utf-8');
    if (p === '/api/character') {
      const f = path.join(ROOT, 'character.md');
      if (req.method === 'GET') return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f, 'utf8'), 'text/plain; charset=utf-8') : send(res, 404, { error: 'none' });
      if (req.method === 'PUT') { fs.writeFileSync(f, await readBody(req)); return send(res, 200, { ok: true }); }
    }
    if (p === '/api/maps' && req.method === 'GET') {
      const list = fs.readdirSync(MAPS, { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(MAPS, d.name, 'world.md')))
        .map(d => ({ name: d.name, updated: fs.statSync(path.join(MAPS, d.name, 'world.md')).mtimeMs })).sort((a, b) => b.updated - a.updated);
      return send(res, 200, list);
    }
    const m = p.match(/^\/api\/maps\/([^/]+)$/);
    if (m) {
      const name = safeName(m[1]);
      if (!name) return send(res, 400, { error: 'bad name' });
      const dir = path.join(MAPS, name), f = path.join(dir, 'world.md');
      if (req.method === 'GET') return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f, 'utf8'), 'text/plain; charset=utf-8') : send(res, 404, { error: 'not found' });
      if (req.method === 'PUT') { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, await readBody(req)); return send(res, 200, { ok: true, path: path.relative(ROOT, f) }); }
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Task & Conquer is running at http://localhost:${PORT}`));
