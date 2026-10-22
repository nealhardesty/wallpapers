#!/usr/bin/env node
// Public-safety audit. This repo is public, so nothing private may land in it:
// no private addresses, emails, home paths, keys, stray URLs or image
// metadata. Personal terms that must never appear go in .audit-denylist
// (gitignored), one per line.
//
//   node tools/audit.mjs                 working tree (tracked + untracked, not ignored)
//   node tools/audit.mjs --staged        what is about to be committed (pre-commit hook)
//   node tools/audit.mjs --history       every blob ever committed (pre-push hook, CI)
//   node tools/audit.mjs --message FILE  a commit message (commit-msg hook)
//
// A false positive is allowed by writing `audit-allow: <why>` on the same
// line or the line above. Findings are redacted, because CI logs are public.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_BYTES = 1024 * 1024;

// URLs in web/ must point at one of these hosts. Everything else ships
// offline. Keys are path prefixes; '' applies everywhere in web/.
export const URL_ALLOW = {
    '': ['www.w3.org'],
    'web/manifest.json': ['www.bing.com'],
    'web/wallpapers/bing/': ['www.bing.com', 'bing.com', 'corsproxy.io', 'api.allorigins.win', 'cors-anywhere.herokuapp.com'],
};

const FILE_EXTENSIONS = /^(png|jpe?g|gif|webp|svg|ico|js|mjs|cjs|css|html?|json|md|txt)$/i;

const octet = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const PRIVATE_IP = new RegExp(
    `(?<![\\d.])(?:10\\.${octet}|172\\.(?:1[6-9]|2\\d|3[01])|192\\.168|100\\.(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7]))` +
    `\\.${octet}\\.${octet}(?![\\d]|\\.\\d)`, 'g');

const SECRETS = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    /\bAKIA[0-9A-Z]{16}\b/g,                                // AWS access key
    /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{36}\b/g,         // GitHub tokens
    /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
    /\bsk-[A-Za-z0-9_-]{20,}\b/g,                           // OpenAI/Anthropic style
    /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g,                     // Slack
    /\bAIza[0-9A-Za-z_-]{35}\b/g,                           // Google
    /\b[0-9a-f]{32,}\b/gi,                                  // bare hex keys and hashes
    /\b(?:api[_-]?key|secret|token|passw(?:or)?d|appid)["']?\s*[:=]\s*["'`]?[A-Za-z0-9_\-+/]{12,}/gi,
];

const RULES = [
    { id: 'private-ip', find: line => [...line.matchAll(PRIVATE_IP)].map(m => m[0]) },
    {
        // The lookbehind keeps this linear on long runs of word characters.
        id: 'email', find: line => [...line.matchAll(/(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.([A-Za-z]{2,})\b/g)]
            .filter(m => !FILE_EXTENSIONS.test(m[1]) && !/noreply/i.test(m[0]))
            .map(m => m[0]),
    },
    { id: 'home-path', find: line => [...line.matchAll(/(?:\/Users\/|\/home\/|\b[A-Z]:\\Users\\)[A-Za-z0-9._-]+/g)].map(m => m[0]) },
    { id: 'secret', find: line => SECRETS.flatMap(re => [...line.matchAll(re)].map(m => m[0])) },
];

// Show enough to find the hit, never enough to leak it.
export function redact(text) {
    return text.length <= 4 ? '…' : `${text.slice(0, 3)}…(${text.length})`;
}

function allowedHosts(path) {
    return Object.entries(URL_ALLOW).filter(([prefix]) => path.startsWith(prefix)).flatMap(([, hosts]) => hosts);
}

export function auditText(path, text, { denylist = [], urls = path.startsWith('web/') } = {}) {
    const findings = [];
    const lines = text.split(/\r?\n/);
    const terms = denylist.map(t => t.toLowerCase());
    lines.forEach((line, i) => {
        if (/audit-allow:/.test(line) || /audit-allow:/.test(lines[i - 1] ?? '')) return;
        const hit = (rule, shown) => findings.push({ path, line: i + 1, rule, shown });
        for (const rule of RULES) for (const m of rule.find(line)) hit(rule.id, redact(m));
        const lower = line.toLowerCase();
        for (const term of terms) if (lower.includes(term)) hit('denylist', redact(term));
        if (urls) {
            const ok = allowedHosts(path);
            for (const m of line.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g)) {
                if (!ok.includes(m[1].toLowerCase())) hit('url', m[1]);
            }
        }
    });
    return findings;
}

// Metadata blocks that can carry names, places, devices or paths.
export function imageMetadata(buf) {
    const found = [];
    if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) {                 // PNG
        for (let at = 8; at + 8 <= buf.length;) {
            const len = buf.readUInt32BE(at), type = buf.toString('latin1', at + 4, at + 8);
            if (['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'].includes(type)) found.push(type);
            at += 12 + len;
        }
    } else if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {         // JPEG
        for (let at = 2; at + 4 <= buf.length && buf[at] === 0xff;) {
            const marker = buf[at + 1];
            if (marker === 0xda || marker === 0xd9) break;                          // image data starts
            if (marker === 0xe1) found.push('APP1 (EXIF/XMP)');
            if (marker === 0xed) found.push('APP13 (IPTC)');
            if (marker === 0xfe) found.push('COM');
            at += 2 + buf.readUInt16BE(at + 2);
        }
    } else if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
        for (let at = 12; at + 8 <= buf.length;) {
            const type = buf.toString('latin1', at, at + 4);
            if (type === 'EXIF' || type === 'XMP ') found.push(type.trim());
            at += 8 + buf.readUInt32LE(at + 4) + (buf.readUInt32LE(at + 4) & 1);
        }
    }
    return found;
}

export function auditBuffer(path, buf, options = {}) {
    const findings = auditText(path, path, { ...options, urls: false })      // the path itself
        .map(f => ({ ...f, line: 0, rule: `${f.rule} (in path)` }));
    if (buf.length > MAX_BYTES) findings.push({ path, line: 0, rule: 'size', shown: `${(buf.length / 1048576).toFixed(1)} MB > 1 MB` });
    for (const block of imageMetadata(buf)) findings.push({ path, line: 0, rule: 'image-metadata', shown: block });
    if (buf.length <= MAX_BYTES && !buf.subarray(0, 8192).includes(0)) findings.push(...auditText(path, buf.toString('utf8'), options));
    return findings;
}

export function loadDenylist(file) {
    if (!file || !existsSync(file)) return [];
    return readFileSync(file, 'utf8').split(/\r?\n/).map(t => t.trim()).filter(t => t.length >= 3 && !t.startsWith('#'));
}

const git = (args, opts = {}) => execFileSync('git', args, { maxBuffer: 1 << 30, ...opts });

// [{ path, buf }] for each mode.
function* sources(mode, root) {
    if (mode === 'tree') {
        for (const path of git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root }).toString().split('\0')) {
            const full = join(root, path);
            if (path && existsSync(full) && statSync(full).isFile()) yield { path, buf: readFileSync(full) };
        }
    } else if (mode === 'staged') {
        for (const path of git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], { cwd: root }).toString().split('\0')) {
            if (path) yield { path, buf: git(['show', `:${path}`], { cwd: root }) };
        }
    } else if (mode === 'history') {
        const blobs = new Map();
        for (const line of git(['rev-list', '--objects', '--all'], { cwd: root }).toString().split('\n')) {
            const [sha, ...rest] = line.split(' ');
            if (rest.length && !blobs.has(sha)) blobs.set(sha, rest.join(' '));
        }
        const shas = [...blobs.keys()];
        const types = git(['cat-file', '--batch-check=%(objecttype)'], { cwd: root, input: shas.join('\n') + '\n' }).toString().split('\n');
        const wanted = shas.filter((_, i) => types[i] === 'blob');
        if (!wanted.length) return;
        const out = git(['cat-file', '--batch'], { cwd: root, input: wanted.join('\n') + '\n' });
        for (let at = 0, n = 0; n < wanted.length; n++) {
            const eol = out.indexOf(10, at);
            const size = Number(out.toString('latin1', at, eol).split(' ')[2]);
            yield { path: blobs.get(wanted[n]), buf: out.subarray(eol + 1, eol + 1 + size) };
            at = eol + 1 + size + 1;
        }
    }
}

function report(findings, scanned, label) {
    if (!findings.length) {
        console.log(`audit ✓ ${label}: ${scanned} ${scanned === 1 ? 'item' : 'items'}, nothing private`);
        return 0;
    }
    const files = new Set(findings.map(f => f.path));
    for (const f of findings) console.log(`  ${f.path}${f.line ? `:${f.line}` : ''}  ${f.rule}  ${f.shown}`);
    console.log(`audit ✗ ${label}: ${findings.length} finding${findings.length === 1 ? '' : 's'} in ${files.size} file${files.size === 1 ? '' : 's'}`);
    console.log('  A false positive? Put `audit-allow: <why>` on that line or the line above.');
    return 1;
}

export function main(argv, cwd = process.cwd()) {
    const root = git(['rev-parse', '--show-toplevel'], { cwd }).toString().trim();
    const denylist = loadDenylist(process.env.AUDIT_DENYLIST ?? join(root, '.audit-denylist'));
    const flag = argv[0] ?? '--tree';
    if (flag === '--message') {
        return report(auditText('commit message', readFileSync(argv[1], 'utf8'), { denylist, urls: false }), 1, 'commit message');
    }
    const mode = { '--tree': 'tree', '--staged': 'staged', '--history': 'history' }[flag];
    if (!mode) {
        console.error(`unknown option ${flag}; use --tree, --staged, --history or --message FILE`);
        return 2;
    }
    const findings = [];
    let scanned = 0;
    for (const { path, buf } of sources(mode, root)) {
        scanned++;
        findings.push(...auditBuffer(path, buf, { denylist }));
    }
    const terms = denylist.length ? ` + ${denylist.length} denylist term${denylist.length === 1 ? '' : 's'}` : '';
    return report(findings, scanned, `${mode}${terms}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
