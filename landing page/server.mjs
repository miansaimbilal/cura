import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import waitlistHandler from './api/waitlist.js';
import adminWaitlistHandler from './api/admin-waitlist.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function wrapResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(data));
    return res;
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  const wrappedRes = wrapResponse(res);
  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // API Routes
  if (pathname === '/api/waitlist' || pathname === '/api/admin-waitlist') {
    try {
      const rawBody = req.method === 'POST' || req.method === 'DELETE' ? await readBody(req) : '';
      req.body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      req.body = {};
    }
    req.query = Object.fromEntries(urlObj.searchParams.entries());

    if (pathname === '/api/waitlist') {
      return waitlistHandler(req, wrappedRes);
    }
    return adminWaitlistHandler(req, wrappedRes);
  }

  // Static Page Routing (supports clean URLs like /admin -> admin.html)
  let targetRelPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (!path.extname(targetRelPath)) {
    targetRelPath = `${targetRelPath}.html`;
  }

  // Prevent directory traversal and block access to private server/data files
  const safePath = path.normalize(targetRelPath);
  const blockedPrefixes = ['api', 'lib', 'data', 'server.mjs', 'package.json', 'vercel.json'];
  if (
    safePath.startsWith('..') ||
    path.isAbsolute(safePath) ||
    blockedPrefixes.some((prefix) => safePath === prefix || safePath.startsWith(prefix + path.sep))
  ) {
    res.statusCode = 404;
    return res.end('Not Found');
  }

  const fullPath = path.join(__dirname, safePath);
  try {
    const content = await fs.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.statusCode = 200;
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Cura landing page running at http://localhost:${PORT}`);
  console.log(`Admin dashboard available at http://localhost:${PORT}/admin`);
});
