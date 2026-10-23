#!/usr/bin/env node
// Made-up media for a throwaway Jellyfin (SPEC §10.21, task 9.1), generated
// with ffmpeg: test patterns and tones, never anything real.
//
//   node tools/jellyfin-media.mjs            .jellyfin/media/ (gitignored), for make jellyfin-dev
//   node tools/jellyfin-media.mjs --fixture  tools/fixtures/jellyfin/ (committed), for the smoke run
//
// The library covers what the wallpaper has to cope with: direct play
// (H.264 in MKV and MP4, VP9 in WebM), a codec Chrome can't play (MPEG-2,
// so the server transcodes), English and Spanish sidecar subtitles, an SDH
// track, a forced-only track under Spanish audio, embedded text tracks
// with default and forced flags, and image subtitles (VobSub), which the
// server has to burn in. One film is over two minutes, so resume applies.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const fixture = process.argv.includes('--fixture');

function ffmpeg(...args) {
    // No metadata beyond the streams' own: bitexact keeps the encoder
    // version and creation time out, so a regenerated fixture is identical.
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

const srt = cues => cues.map(([from, to, text], i) => `${i + 1}\n${stamp(from)} --> ${stamp(to)}\n${text}\n`).join('\n');
const stamp = s => new Date(s * 1000).toISOString().slice(11, 23).replace('.', ',');
// Lines every few seconds, so a subtitle is on screen whenever you look.
const lines = (seconds, texts) => Array.from({ length: Math.floor(seconds / 4) }, (_, i) => [i * 4 + 0.5, i * 4 + 3.5, texts[i % texts.length]]);

const ENGLISH = ['This is a test pattern.', 'Nothing real is in this library.', 'The colours are the same as yesterday.', 'Please stand by.'];
const SPANISH = ['Esto es una carta de ajuste.', 'Nada real hay en esta biblioteca.', 'Los colores son los de ayer.', 'Por favor, espere.'];
const SDH = ['[STEADY TONE]', '[TONE CONTINUES]', 'This is a test pattern.', '[BEEP]'];
const FORCED = ['(A sign reads: TEST ONLY)', '(Spanish chatter continues)'];

// ---- VobSub (image subtitles) ------------------------------------------------
// ffmpeg can't turn text into bitmap subtitles, so this writes them itself:
// each cue drawn in a 5×7 pixel font (# is ink), run-length encoded as a DVD
// subpicture, wrapped in MPEG program stream packs (.sub) with an index
// (.idx). ffmpeg then muxes the result into an MKV as dvd_subtitle.

const FONT = {
    A: '.###.#...##...#######...##...##...#', B: '####.#...##...#####.#...##...#####.', C: '.###.#...##....#....#....#...#.###.',
    D: '####.#...##...##...##...##...#####.', E: '######....#....####.#....#....#####', F: '######....#....####.#....#....#....',
    G: '.###.#...##....#.####...##...#.####', H: '#...##...##...#######...##...##...#', I: '.###...#....#....#....#....#...###.',
    J: '..###...#....#....#....#.#..#..##..', K: '#...##..#.#.#..##...#.#..#..#.#...#', L: '#....#....#....#....#....#....#####',
    M: '#...###.###.#.##.#.##...##...##...#', N: '#...###..##.#.##..###...##...##...#', O: '.###.#...##...##...##...##...#.###.',
    P: '####.#...##...#####.#....#....#....', Q: '.###.#...##...##...##.#.##..#..##.#', R: '####.#...##...#####.#.#..#..#.#...#',
    S: '.#####....#.....###.....#....#####.', T: '#####..#....#....#....#....#....#..', U: '#...##...##...##...##...##...#.###.',
    V: '#...##...##...##...##...#.#.#...#..', W: '#...##...##...##.#.##.#.##.#.#.#.#.', X: '#...##...#.#.#...#...#.#.#...##...#',
    Y: '#...##...#.#.#...#....#....#....#..', Z: '#####....#...#...#...#...#....#####', ' ': '.'.repeat(35),
    '.': '..........................##...##..', ',': '......................##...#...#...', '!': '..#....#....#....#....#.........#..',
};
const SCALE = 3;

// A line of text as rows of 2-bit pixels: 0 clear, 1 the letters, 2 an outline.
function bitmap(text) {
    const glyphs = [...text.toUpperCase()].map(c => FONT[c] || FONT[' ']);
    const w = (glyphs.length * 6 + 1) * SCALE + 4, h = 9 * SCALE + 4;
    const rows = Array.from({ length: h }, () => new Uint8Array(w));
    glyphs.forEach((g, i) => {
        for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
            if (g[y * 5 + x] !== '#') continue;
            for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) rows[2 + (y + 1) * SCALE + dy][2 + (i * 6 + 1 + x) * SCALE + dx] = 1;
        }
    });
    // Outline: any clear pixel next to a letter pixel.
    const lit = (x, y) => rows[y]?.[x] === 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!rows[y][x] && (lit(x - 1, y) || lit(x + 1, y) || lit(x, y - 1) || lit(x, y + 1))) rows[y][x] = 2;
    }
    return { w, h, rows };
}

// One field's rows, in the DVD's nibble run-length code.
function rle(rows) {
    const nibbles = [];
    for (const row of rows) {
        let x = 0;
        while (x < row.length) {
            let n = 1;
            while (x + n < row.length && row[x + n] === row[x] && n < 255) n++;
            const c = row[x];
            if (x + n === row.length) nibbles.push(0, 0, 0, c);                                        // to the end of the line
            else if (n < 4) nibbles.push(n << 2 | c);
            else if (n < 16) nibbles.push(n >> 2, (n & 3) << 2 | c);
            else if (n < 64) nibbles.push(0, n >> 2, (n & 3) << 2 | c);
            else nibbles.push(0, n >> 6, (n >> 2) & 15, (n & 3) << 2 | c);
            x += n;
        }
        if (nibbles.length % 2) nibbles.push(0);                                                      // each line starts on a byte
    }
    return Buffer.from(Array.from({ length: nibbles.length / 2 }, (_, i) => nibbles[2 * i] << 4 | nibbles[2 * i + 1]));
}

function subpicture(text, frameW, frameH, seconds) {
    const { w, h, rows } = bitmap(text);
    const x1 = Math.round((frameW - w) / 2), y1 = frameH - h - 24;
    const top = rle(rows.filter((_, y) => y % 2 === 0)), bottom = rle(rows.filter((_, y) => y % 2 === 1));
    const pixels = 4, control = pixels + top.length + bottom.length;
    const show = Buffer.from([0, 0, 0, 0,
        0x01,                                                // start display
        0x03, 0x02, 0x10,                                    // palette (e2 e1 pattern background): letters 1, outline 2
        0x04, 0x0f, 0xf0,                                    // alpha: letters and outline opaque, background clear
        0x05, x1 >> 4, (x1 & 15) << 4 | (x1 + w - 1) >> 8, (x1 + w - 1) & 255, y1 >> 4, (y1 & 15) << 4 | (y1 + h - 1) >> 8, (y1 + h - 1) & 255,
        0x06, (pixels >> 8), pixels & 255, (pixels + top.length) >> 8, (pixels + top.length) & 255,
        0xff]);
    const hideAt = control + show.length;
    show.writeUInt16BE(hideAt, 2);
    const delay = Math.round(seconds * 90000 / 1024);
    const hide = Buffer.from([delay >> 8, delay & 255, hideAt >> 8, hideAt & 255, 0x02, 0xff]);
    const spu = Buffer.concat([Buffer.alloc(4), top, bottom, show, hide]);
    spu.writeUInt16BE(spu.length, 0);
    spu.writeUInt16BE(control, 2);
    return spu;
}

// An MPEG-2 pack holding one subpicture, stamped with its start time.
function pack(spu, seconds) {
    const pts = Math.round(seconds * 90000);
    const header = Buffer.from([0, 0, 1, 0xba, 0x44, 0, 4, 0, 4, 1, 0x01, 0x89, 0xc3, 0xf8]);       // SCR 0, mux rate 25200
    const stampBytes = Buffer.from([0x21 | ((pts >> 29) & 0x0e), (pts >> 22) & 0xff, ((pts >> 14) & 0xfe) | 1, (pts >> 7) & 0xff, ((pts << 1) & 0xfe) | 1]);
    const payload = Buffer.concat([Buffer.from([0x81, 0x80, 5]), stampBytes, Buffer.from([0x20]), spu]);
    const pes = Buffer.concat([Buffer.from([0, 0, 1, 0xbd, payload.length >> 8, payload.length & 255]), payload]);
    return Buffer.concat([header, pes]);
}

function vobsub(base, cues, frameW, frameH) {
    const packs = [], index = [];
    let at = 0;
    for (const [from, to, text] of cues) {
        const bytes = pack(subpicture(text, frameW, frameH, to - from), from);
        index.push(`timestamp: ${new Date(from * 1000).toISOString().slice(11, 23).replace('.', ':')}, filepos: ${at.toString(16).padStart(9, '0')}`);
        packs.push(bytes);
        at += bytes.length;
    }
    writeFileSync(`${base}.sub`, Buffer.concat(packs));
    writeFileSync(`${base}.idx`, ['# VobSub index file, v7 (do not modify this line!)', `size: ${frameW}x${frameH}`,
        'palette: 000000, f8f4e0, 101010, 808080, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000',
        'id: en, index: 0', ...index, ''].join('\n'));
}

// ---- The library ---------------------------------------------------------------

const h264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p'];
const aac = ['-c:a', 'aac', '-b:a', '64k'];
const quiet = ['-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact'];
const tone = (seconds, hz) => ['-f', 'lavfi', '-i', `sine=frequency=${hz}:beep_factor=4:duration=${seconds}`];

function library(out) {
    const movies = join(out, 'Movies'), shows = join(out, 'Shows', 'Fixture Show', 'Season 01');
    const tmp = mkdtempSync(join(tmpdir(), 'jellyfin-media-'));
    const made = [];
    const film = (name, ext) => {
        const dir = join(movies, name);
        mkdirSync(dir, { recursive: true });
        const path = join(dir, `${name}.${ext}`);
        made.push(path);
        return path;
    };
    try {
        // Direct play, with sidecar subtitles: English, English SDH, Spanish.
        let path = film('Test Pattern No. 1 (2026)', 'mkv');
        ffmpeg('-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=70', ...tone(70, 440), ...h264, ...aac, ...quiet, path);
        writeFileSync(path.replace(/mkv$/, 'en.srt'), srt(lines(70, ENGLISH)));
        writeFileSync(path.replace(/mkv$/, 'en.sdh.srt'), srt(lines(70, SDH)));
        writeFileSync(path.replace(/mkv$/, 'es.srt'), srt(lines(70, SPANISH)));

        // 1080p, so the tier's resolution cap forces a transcode; embedded
        // text tracks, one English marked default and one forced.
        path = film('Colour Bars (2026)', 'mkv');
        const english = join(tmp, 'en.srt'), forced = join(tmp, 'forced.srt');
        writeFileSync(english, srt(lines(45, ENGLISH)));
        writeFileSync(forced, srt(lines(45, FORCED)));
        ffmpeg('-f', 'lavfi', '-i', 'smptehdbars=size=1920x1080:rate=25:duration=45', ...tone(45, 1000), '-i', english, '-i', forced,
            '-map', '0', '-map', '1', '-map', '2', '-map', '3', ...h264, ...aac, '-c:s', 'srt', ...quiet,
            '-metadata:s:a:0', 'language=eng', '-metadata:s:s:0', 'language=eng', '-metadata:s:s:1', 'language=eng',
            '-disposition:s:0', 'default', '-disposition:s:1', 'forced', path);

        // VP9 in WebM, Spanish audio, over two minutes (so resume applies), and
        // only a forced English track: with foreign audio, forced acts as full.
        path = film('The Mandelbrot Hour (2026)', 'webm');
        ffmpeg('-f', 'lavfi', '-i', 'mandelbrot=size=640x360:rate=12:end_pts=200', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=150',
            '-t', '150', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '300k', '-c:a', 'libopus', '-b:a', '48k',
            '-metadata:s:a:0', 'language=spa', ...quiet, path);
        writeFileSync(path.replace(/webm$/, 'en.forced.srt'), srt(lines(150, FORCED)));

        // MPEG-2, which Chrome can't play, with image subtitles: the server
        // has to transcode, and burn the subtitles in.
        path = film('Game of Life (2026)', 'mkv');
        const plain = join(tmp, 'life.mkv'), subs = join(tmp, 'life');
        ffmpeg('-f', 'lavfi', '-i', 'life=size=720x480:rate=25:mold=10:ratio=0.1:death_color=#202838:life_color=#f0c060,format=yuv420p',
            ...tone(40, 220), '-t', '40', '-c:v', 'mpeg2video', '-q:v', '14', '-c:a', 'mp2', ...quiet, plain);
        vobsub(subs, lines(40, ['An image subtitle.', 'Burned in by the server.', 'Nothing real here.']), 720, 480);
        ffmpeg('-i', plain, '-i', `${subs}.idx`, '-map', '0', '-map', '1', '-c', 'copy', '-metadata:s:s:0', 'language=eng', ...quiet, path);

        // A show, so the library source has episodes too.
        mkdirSync(shows, { recursive: true });
        const episodes = [['cellauto=size=640x360:rate=15:rule=110', 523], ['gradients=size=640x360:rate=15:speed=0.02', 587], ['testsrc2=size=640x360:rate=15', 659]];
        episodes.forEach(([source, hz], i) => {
            const episode = join(shows, `Fixture Show S01E0${i + 1}.mp4`);
            ffmpeg('-f', 'lavfi', '-i', source, ...tone(30, hz), '-t', '30', ...h264, ...aac, '-movflags', '+faststart', ...quiet, episode);
            writeFileSync(episode.replace(/mp4$/, 'en.srt'), srt(lines(30, ENGLISH)));
            made.push(episode);
        });
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
    return made;
}

// The smoke run's clip: VP9 (headless Chromium has no H.264), a few KB,
// and a backdrop for poster mode.
function fixtures(out) {
    mkdirSync(out, { recursive: true });
    const clip = join(out, 'clip.webm'), backdrop = join(out, 'backdrop.jpg');
    // 24 s, so a check can watch it play for a while; 5 fps keeps it about 20 KB.
    ffmpeg('-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=5:duration=24', '-c:v', 'libvpx-vp9', '-crf', '63', '-b:v', '0', '-deadline', 'good',
        '-g', '50', '-an', ...quiet, clip);
    ffmpeg('-f', 'lavfi', '-i', 'gradients=size=320x180:c0=#1d2b4a:c1=#e08a3c:c2=#5a2a5e:nb_colors=3:seed=7,trim=end_frame=1', '-frames:v', '1',
        '-c:v', 'mjpeg', '-q:v', '5', ...quiet, backdrop);
    return [clip, backdrop];
}

const made = fixture ? fixtures(join(ROOT, 'tools', 'fixtures', 'jellyfin')) : library(join(ROOT, '.jellyfin', 'media'));
for (const path of made) if (existsSync(path)) console.log(`  ${path.slice(ROOT.length + 1)}  ${(statSync(path).size / 1024).toFixed(0)} KB`);
console.log(fixture ? 'fixtures ✓' : 'media ✓ .jellyfin/media/ (make jellyfin-dev serves it)');
