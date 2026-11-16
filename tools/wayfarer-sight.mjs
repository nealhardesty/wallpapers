// How often is a wild animal plainly in the picture? Walks each country with the follow camera and, every few
// seconds, counts the animals on screen, unoccluded and at least 12 px tall at 1080p (WayLogic.wildSeen).
//   node tools/wayfarer-sight.mjs [country,…] [--km 3] [--seeds 7,11,23] [--json]
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve(import.meta.dirname, '../web/wallpapers/wayfarer');
const src = ['way-logic.js'].map(f => readFileSync(join(DIR, f), 'utf8')).join('\n');
export const L = new Function(`${src}\nreturn WayLogic;`)();

// One walk: for each level, how many samples (n), in how many somebody was in the picture (seen) and how many in
// all (sum); and the same for the samples out on the open road, away from towns (open, openSeen).
export function sight(biomes, seed, km, levels = ['few', 'some', 'plenty'], night = 0) {
    const w = L.world(seed, biomes ? { biomes } : {}), j = L.journeyStart(w, 360 * 300 + 60), dt = 0.1, cells = new Map(), out = {};
    for (const level of levels) out[level] = { seen: 0, sum: 0, n: 0, open: 0, openSeen: 0, best: null };
    let t = 0, rnd = 1;
    const random = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; j.distance < km * 1000; i++) {
        t += dt;
        L.journeyStep(j, dt, w, { pace: 1, night, camps: false, rests: false });
        const me = L.standing(j, w), cz = Math.floor(me.z / L.CHUNK);
        for (let dz = -2; dz <= 3; dz++) {
            if (!cells.has(cz + dz)) cells.set(cz + dz, w.wildlife(cz + dz).map(g => L.wildStart(g, w)));
            for (const party of cells.get(cz + dz)) for (const a of party) L.wildStep(a, dt, w, { t, night, me, random, party });
        }
        for (const k of cells.keys()) if (k < cz - 2) cells.delete(k);
        if (i % 40 !== 20) continue;                 // every four seconds
        // (In a town and at its gates there are people, cats and hens, and no wild animals but what flies over.)
        const cam = L.camera('follow', j, w, t, null, null), r = w.at(j.z), open = !(r.near.radius && Math.abs(r.dz) < r.near.radius + 30);
        for (const level of levels) {
            const about = [...cells.values()].flat().filter(p => p[0].g.roll < L.WILD_LEVELS[level]).flat(), n = L.wildSeen(w, cam, about, { night }), o = out[level];
            o.n++; o.sum += n; if (n) o.seen++;
            if (open) { o.open++; if (n) o.openSeen++; }
            if (!o.best || Math.abs(n - 2) < Math.abs(o.best.n - 2)) o.best = { n, z: Math.round(j.z), index: o.n - 1 };
        }
    }
    return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    const args = process.argv.slice(2), flag = (name, or) => { const i = args.indexOf(name); return i < 0 ? or : args[i + 1]; };
    const lands = args[0] && !args[0].startsWith('--') ? args[0].split(',') : [...L.BIOMES, 'all'], km = Number(flag('--km', 3)), seeds = String(flag('--seeds', '7,11,23')).split(',').map(Number);
    console.log('country    few              some             plenty           share of samples with a wild animal plainly in the picture (and on the open road, away from towns), the mean count, and how much of the walk is in town; day | night');
    for (const land of lands) {
        const row = [];
        for (const night of [0, 1]) {
            const sum = {};
            for (const seed of seeds) { const got = sight(land === 'all' ? null : [land], seed, km, undefined, night); for (const [level, o] of Object.entries(got)) { sum[level] ??= { seen: 0, sum: 0, n: 0, open: 0, openSeen: 0 }; for (const k of ['seen', 'sum', 'n', 'open', 'openSeen']) sum[level][k] += o[k]; } }
            row.push(Object.values(sum).map(o => `${Math.round(100 * o.seen / o.n)}% (${Math.round(100 * o.openSeen / Math.max(1, o.open))}%) ${(o.sum / o.n).toFixed(1)}`.padEnd(16)).join(' ') + ` town ${Math.round(100 * (1 - Object.values(sum)[0].open / Object.values(sum)[0].n))}%`);
        }
        console.log(land.padEnd(10), row.join(' | '));
    }
}
