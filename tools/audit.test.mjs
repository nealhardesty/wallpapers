// Tests for tools/audit.mjs. Every "bad" fixture is assembled at runtime, so
// this file never contains a real-looking violation and passes its own audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditText, auditBuffer, imageMetadata, redact, main } from './audit.mjs';

delete process.env.AUDIT_DENYLIST;   // tests use each temp repo's own .audit-denylist

const j = (...parts) => parts.join('');
const rules = (path, text, opts) => auditText(path, text, opts).map(f => f.rule);

test('private addresses are caught, public and version-like numbers are not', () => {
    for (const ip of [j('10.', '0.0.5'), j('192.', '168.1.20'), j('172.', '20.3.4'), j('100.', '70.113.27')]) {
        assert.deepEqual(rules('x.js', `url = "http://${ip}:8096"`, { urls: false }), ['private-ip'], ip);
    }
    for (const ok of ['8.8.8.8', '100.200.1.1', '172.32.0.1', 'v1.10.0.5.2', '2.10.0.0']) {
        assert.deepEqual(rules('x.js', ok), [], ok);
    }
});

test('emails are caught, except noreply and retina image names', () => {
    assert.deepEqual(rules('x.md', j('mail me: someone', '@', 'example.org')), ['email']);
    assert.deepEqual(rules('x.md', j('Co-Authored-By: Bot <', 'noreply', '@', 'example.com>')), []);
    assert.deepEqual(rules('x.md', j('<img src="icon', '@', '2x.png">')), []);
});

test('home directory paths are caught', () => {
    assert.deepEqual(rules('x.json', j('"Read(/', 'Users/', 'someone/**)"')), ['home-path']);
    assert.deepEqual(rules('x.json', j('/', 'home/', 'someone/dev')), ['home-path']);
    assert.deepEqual(rules('x.md', 'paths like `/Users/` are bad'), []);
});

test('key-shaped strings are caught', () => {
    const samples = [
        j("apiKey: '", 'ddec73f78ec939d8', 'db015836c041fe2f', "'"),
        j('AKIA', 'ABCDEFGHIJKLMNOP'),
        j('ghp_', 'a'.repeat(36)),
        j('-----BEGIN ', 'RSA PRIVATE KEY-----'),
        j('&appid=', 'abc123def456ghi789'),
    ];
    for (const s of samples) assert.ok(rules('x.js', s, { urls: false }).includes('secret'), s);
    assert.deepEqual(rules('x.js', 'const tokenCount = 3; // a token of thanks'), []);
});

test('audit-allow on the line or the line above suppresses a hit', () => {
    const hex = 'ab'.repeat(32);
    assert.deepEqual(rules('x.properties', `sha=${hex}`), ['secret']);
    assert.deepEqual(rules('x.properties', `sha=${hex} # audit-allow: gradle checksum`), []);
    assert.deepEqual(rules('x.properties', `# audit-allow: gradle checksum\nsha=${hex}`), []);
});

test('URLs in web/ must be allowlisted per path; docs may link anywhere', () => {
    const bing = 'fetch("https://www.bing.com/HPImageArchive.aspx")';
    assert.deepEqual(rules('web/wallpapers/bing/bing.js', bing), []);
    assert.deepEqual(rules('web/wallpapers/snow/snow.js', bing), ['url']);
    assert.deepEqual(rules('web/core/x.js', 'createElementNS("http://www.w3.org/2000/svg", "svg")'), []);
    assert.deepEqual(rules('README.md', 'see https://example.com'), []);
});

test('denylist terms are caught case-insensitively, in content and in paths', () => {
    const denylist = [j('road', 'runner')];
    assert.deepEqual(rules('x.js', j('host = "nas.', 'RoadRunner', '.box"'), { denylist }), ['denylist']);
    const found = auditBuffer(j('web/', 'roadrunner', '.js'), Buffer.from('ok'), { denylist });
    assert.deepEqual(found.map(f => f.rule), ['denylist (in path)']);
});

test('findings are redacted so public CI logs never repeat a secret', () => {
    const secret = j('ghp_', 'Z'.repeat(36));
    const [finding] = auditText('x.js', secret);
    assert.ok(!finding.shown.includes(secret.slice(4)));
    assert.equal(redact('abcdefgh'), 'abc…(8)');
});

test('image metadata chunks are found in PNG, JPEG and WebP', () => {
    const pngChunk = (type, data = Buffer.alloc(0)) => {
        const head = Buffer.alloc(8);
        head.writeUInt32BE(data.length, 0);
        head.write(type, 4, 'latin1');
        return Buffer.concat([head, data, Buffer.alloc(4)]);
    };
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const png = Buffer.concat([sig, pngChunk('IHDR', Buffer.alloc(13)), pngChunk('tEXt', Buffer.from('date:create')), pngChunk('IEND')]);
    assert.deepEqual(imageMetadata(png), ['tEXt']);
    assert.deepEqual(imageMetadata(Buffer.concat([sig, pngChunk('IHDR', Buffer.alloc(13)), pngChunk('IEND')])), []);

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x00, 0x00, 0xff, 0xda, 0x00, 0x02]);
    assert.deepEqual(imageMetadata(jpeg), ['APP1 (EXIF/XMP)']);

    const webpChunk = (type, n) => { const b = Buffer.alloc(8 + n); b.write(type, 0, 'latin1'); b.writeUInt32LE(n, 4); return b; };
    const body = Buffer.concat([webpChunk('VP8 ', 10), webpChunk('EXIF', 3)]);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), body]);
    assert.deepEqual(imageMetadata(webp), ['EXIF']);
});

test('oversized files fail; binary files skip the text rules', () => {
    assert.deepEqual(auditBuffer('big.txt', Buffer.alloc(1024 * 1024 + 1, 0x61)).map(f => f.rule), ['size']);
    const binary = Buffer.concat([Buffer.from([0]), Buffer.from(j('10.', '0.0.5'))]);
    assert.deepEqual(auditBuffer('blob.bin', binary), []);
});

// End to end: real git repos, real modes, real exit codes.
function repo() {
    const dir = mkdtempSync(join(tmpdir(), 'audit-test-'));
    const git = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', j('user.email=', 'noreply', '@', 'example.com'), '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' });
    git('init', '-q');
    return { dir, git, write: (path, text) => { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), text); } };
}
const quietly = fn => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const leak = j('server = "', '192.', '168.1.20', '"');

test('tree mode: clean passes, untracked leaks fail, ignored files are skipped', () => {
    const r = repo();
    r.write('README.md', '# hello\n');
    assert.equal(quietly(() => main(['--tree'], r.dir)), 0);
    r.write('.gitignore', 'secret.txt\n');
    r.write('secret.txt', leak);
    assert.equal(quietly(() => main(['--tree'], r.dir)), 0);
    r.write('notes.txt', leak);
    assert.equal(quietly(() => main(['--tree'], r.dir)), 1);
});

test('staged mode checks the index, not the working tree', () => {
    const r = repo();
    r.write('a.txt', leak);
    r.git('add', 'a.txt');
    r.write('a.txt', 'fixed in the tree but not staged\n');
    assert.equal(quietly(() => main(['--staged'], r.dir)), 1);
    r.git('add', 'a.txt');
    assert.equal(quietly(() => main(['--staged'], r.dir)), 0);
});

test('history mode finds a leak that was committed and later removed', () => {
    const r = repo();
    r.write('a.txt', leak);
    r.git('add', '.');
    r.git('commit', '-qm', 'oops');
    r.write('a.txt', 'clean now\n');
    r.git('commit', '-qam', 'fix');
    assert.equal(quietly(() => main(['--tree'], r.dir)), 0);
    assert.equal(quietly(() => main(['--history'], r.dir)), 1);
});

test('message mode checks commit messages against the denylist', () => {
    const r = repo();
    const term = j('acme', 'corp');
    r.write('.audit-denylist', `# private terms\n${term}\n`);
    r.write('MSG', `Fix the thing for ${term.toUpperCase()}\n`);
    assert.equal(quietly(() => main(['--message', join(r.dir, 'MSG')], r.dir)), 1);
    r.write('MSG', 'Fix the thing\n');
    assert.equal(quietly(() => main(['--message', join(r.dir, 'MSG')], r.dir)), 0);
});
