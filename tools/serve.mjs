#!/usr/bin/env node
// Dev web server for web/, with Node built-ins only.
//
//   node tools/serve.mjs                    http://localhost:8000
//   node tools/serve.mjs --https            https, with a self-signed cert in .cert/
//   PORT=9000 HOST=0.0.0.0 node tools/serve.mjs   reachable from a phone on the LAN
//
// Responses carry Last-Modified with `no-cache`: the browser revalidates
// every time, so an edit shows on the next reload while unchanged files cost
// a 304. The same server runs in the container (Dockerfile). HTTPS matters off
// localhost: a LAN address isn't a secure context, and some APIs (battery,
// for the power policy) only exist in one.

import { createServer as createHttp } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, createReadStream } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const WEB = join(ROOT, 'web');
const CERT_DIR = join(ROOT, '.cert');
const https = process.argv.includes('--https');
const port = Number(process.env.PORT || (https ? 8443 : 8000));
const bind = process.env.HOST || 'localhost';

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
    '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

const lanAddresses = () => Object.values(networkInterfaces()).flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);

// A self-signed certificate for localhost and this machine's LAN addresses,
// made once with openssl and kept in .cert/ (gitignored). Browsers warn
// once; accept it, or trust .cert/cert.pem locally.
export function ensureCert({ force = false } = {}) {
    const key = join(CERT_DIR, 'key.pem'), cert = join(CERT_DIR, 'cert.pem');
    if (!force && existsSync(key) && existsSync(cert)) return { key, cert };
    mkdirSync(CERT_DIR, { recursive: true });
    const names = ['DNS:localhost', 'IP:127.0.0.1', 'IP:::1', ...lanAddresses().map(a => `IP:${a}`)];
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '365',
        '-keyout', key, '-out', cert, '-subj', '/CN=wallpapers dev server',
        '-addext', `subjectAltName=${names.join(',')}`], { stdio: 'pipe' });
    console.log(`made a self-signed certificate in .cert/ for ${names.join(', ')}`);
    return { key, cert };
}

function handle(request, response) {
    const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    let file = normalize(join(WEB, path));
    if (file !== WEB && !file.startsWith(WEB + sep)) {
        response.writeHead(403).end('forbidden');
        return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
        response.writeHead(404, { 'Content-Type': 'text/plain' }).end(`not found: ${path}`);
        console.log(`404 ${path}`);
        return;
    }
    const modified = statSync(file).mtime;
    modified.setMilliseconds(0);
    const since = Date.parse(request.headers['if-modified-since'] || '');
    const headers = {
        'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Last-Modified': modified.toUTCString(),
        'X-Content-Type-Options': 'nosniff',
    };
    if (since >= modified.getTime()) {
        response.writeHead(304, headers).end();
        return;
    }
    response.writeHead(200, headers);
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    if (process.argv.includes('--cert-only')) {
        ensureCert({ force: true });
    } else {
        const server = https ? createHttps((({ key, cert }) => ({ key: readFileSync(key), cert: readFileSync(cert) }))(ensureCert()), handle)
            : createHttp(handle);
        server.listen(port, bind, () => {
            const scheme = https ? 'https' : 'http';
            console.log(`serving web/ at ${scheme}://localhost:${port}/`);
            if (bind === '0.0.0.0') for (const address of lanAddresses()) console.log(`           and ${scheme}://${address}:${port}/`);
            else console.log('(HOST=0.0.0.0 to reach it from other devices) · Ctrl+C to stop');
        });
    }
}
