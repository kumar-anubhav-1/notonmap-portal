'use strict';
// Tiny local server so you can try the portal on your own computer: `node dev.js`
// Use MOCK=1 to run without an API key (shows demo answers).
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const handlers = { '/api/chat': require('./api/chat'), '/api/config': require('./api/config'), '/api/admin': require('./api/admin') };

function wrap(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
  return res;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const handler = handlers[url.pathname];
  if (handler) {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 100000) { res.statusCode = 413; res.end('{"ok":false,"error":"too_large"}'); req.destroy(); } });
    req.on('end', () => { req.body = raw ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : {}; handler(req, wrap(res)); });
    return;
  }
  const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Rural Tourism Mentor portal running at http://localhost:${port}${process.env.MOCK === '1' ? ' (MOCK mode, no API key needed)' : ''}`));
