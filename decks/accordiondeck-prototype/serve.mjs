import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT ?? 8363);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const allowed = new Set(['/index.html']);

createServer(async (req, res) => {
  let path = new URL(req.url, 'http://x').pathname;
  if (path === '/') path = '/index.html';
  if (!allowed.has(normalize(path))) {
    res.writeHead(404).end('not found');
    return;
  }
  const body = await readFile(join(root, path));
  res.writeHead(200, { 'content-type': types[extname(path)], 'cache-control': 'no-store' }).end(body);
}).listen(port, '0.0.0.0', () => {
  console.log(`http://minix.tailaa104f.ts.net:${port}/`);
  console.log(`http://192.168.1.66:${port}/`);
});
