// 개발용 정적 서버: node tools/dev-server.js  (http://localhost:5178)
// POST /__save?name=파일이름  → test-output/ 에 저장 (시험용)
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'test-output');
const PORT = +process.env.PORT || 5178;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.xlsx': 'application/octet-stream', '.hwpx': 'application/octet-stream' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/__save') {
    const name = path.basename(url.searchParams.get('name') || 'out.bin');
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, name), Buffer.concat(chunks));
      res.end('saved ' + name);
    });
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  let file = path.join(SRC, p);
  if (p.startsWith('/root/')) file = path.join(ROOT, p.slice(6));
  if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(data);
  });
}).listen(PORT, () => console.log('dev server http://localhost:' + PORT));
