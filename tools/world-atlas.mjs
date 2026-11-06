#!/usr/bin/env node
// Make World Clock's atlas, web/wallpapers/world-clock/world-atlas.js, from
// Natural Earth (public domain): the land borders between countries
// (1:50m), the states and provinces of a few countries (1:10m), and the
// biggest cities (1:10m populated places).
//
//   node tools/world-atlas.mjs              download the GeoJSON
//   node tools/world-atlas.mjs <folder>     or read copies of it from a folder
//
// Lines are simplified (Douglas–Peucker, TOLERANCE degrees) and stored like
// world-land.js: tenths of a degree, the first point, then each step. The
// same input always gives the same file, byte for byte.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// A release tag, not master, so a regeneration gives the same file.
const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson';
const FILES = {
    borders: 'ne_50m_admin_0_boundary_lines_land.geojson',
    provinces: 'ne_10m_admin_1_states_provinces_lines.geojson',
    places: 'ne_10m_populated_places_simple.geojson',
};
const OUT = join(resolve(import.meta.dirname, '..'), 'web/wallpapers/world-clock/world-atlas.js');
const TOLERANCE = 0.05;     // degrees, as for the land
const SCALE = 10;           // tenths of a degree
// Whose states and provinces, and how fine: Natural Earth's MIN_ZOOM for a
// line, at most (its first-level divisions, not counties), or a feature
// class (Britain's nations and English regions).
const PROVINCES = {
    USA: 2, CAN: 2, AUS: 2, JPN: 7, DEU: 6.6, FRA: 6, ITA: 6.7, ESP: 6.7, POL: 6.7, PRT: 6.7,
    AUT: 7.7, CHE: 8.7, NLD: 8, SWE: 6.7, NOR: 6.7, CZE: 7.7, GBR: 'Admin-1 statistical meta bounds',
};
const BIG = 3e6;            // every city at least this big, besides each country's largest

const folder = process.argv[2];
const load = async name => {
    if (folder) return JSON.parse(readFileSync(join(folder, FILES[name]), 'utf8'));
    const url = `${BASE}/${FILES[name]}`, response = await fetch(url);
    if (!response.ok) throw new Error(`world-atlas: ${url} answered ${response.status}`);
    return response.json();
};

// Perpendicular distance from p to the segment a–b, in degrees on the flat map.
function distance(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function simplify(points, from, to, keep) {
    let worst = 0, at = -1;
    for (let i = from + 1; i < to; i++) {
        const d = distance(points[i], points[from], points[to]);
        if (d > worst) { worst = d; at = i; }
    }
    if (worst > TOLERANCE) {
        keep[at] = true;
        simplify(points, from, at, keep);
        simplify(points, at, to, keep);
    }
}

// An open line, its ends kept; encoded, or null when it's shorter than the grid.
function encodeLine(line) {
    const keep = line.map((_, i) => i === 0 || i === line.length - 1);
    simplify(line, 0, line.length - 1, keep);
    const q = [];
    for (const [lon, lat] of line.filter((_, i) => keep[i])) {
        const p = [Math.round(lon * SCALE), Math.round(lat * SCALE)], last = q[q.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) q.push(p);
    }
    if (q.length < 2) return null;
    const out = [...q[0]];
    for (let i = 1; i < q.length; i++) out.push(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]);
    return `[${out.map(n => String(n + 0)).join(',')}]`;    // + 0: never "-0"
}

const lines = feature => {
    const g = feature.geometry;
    return !g ? [] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
};

const [borders, provinces, places] = await Promise.all([load('borders'), load('provinces'), load('places')]);

const firm = [], disputed = [];
for (const f of borders.features) {
    const soft = !/^International/.test(f.properties.FEATURECLA);
    for (const line of lines(f)) { const e = encodeLine(line); if (e) (soft ? disputed : firm).push(e); }
}

const divisions = [];
for (const f of provinces.features) {
    const p = f.properties, rule = PROVINCES[p.ADM0_A3];
    if (rule === undefined || (typeof rule === 'number' ? p.MIN_ZOOM > rule : p.FEATURECLA !== rule)) continue;
    for (const line of lines(f)) { const e = encodeLine(line); if (e) divisions.push(e); }
}

// Each country's largest city, then every big one; biggest first.
const all = places.features.map(f => f.properties).filter(p => p.pop_max > 0);
const largest = new Map();
for (const p of all) if (!largest.has(p.adm0name) || p.pop_max > largest.get(p.adm0name).pop_max) largest.set(p.adm0name, p);
const chosen = all.filter(p => largest.get(p.adm0name) === p || p.pop_max >= BIG)
    .sort((a, b) => b.pop_max - a.pop_max || a.name.localeCompare(b.name));
const cities = chosen.map(p => {
    const flags = (largest.get(p.adm0name) === p ? 1 : 0) | (p.adm0cap ? 2 : 0);
    return `[${JSON.stringify(p.name)},${Math.round(p.longitude * SCALE)},${Math.round(p.latitude * SCALE)},${Math.round(p.pop_max / 1000)},${flags}]`;
});

if (firm.length < 100 || divisions.length < 200 || cities.length < 200) throw new Error(`world-atlas: ${firm.length} borders, ${divisions.length} divisions, ${cities.length} cities: the wrong files?`);

const text = `// World Clock's atlas, from Natural Earth (public domain, see
// THIRD_PARTY.md): the land borders between countries (1:50m), the states
// and provinces of a few countries (1:10m), and the biggest cities.
// Generated by \`make world-atlas\` (tools/world-atlas.mjs); don't edit by hand.
//
// Lines are flat lists of integers in tenths of a degree, the first
// [lon, lat] then each step from the point before, like world-land.js.
// Cities are [name, lon, lat (tenths of a degree), population (thousands),
// flags (1: the largest in its country, 2: a capital)], biggest first.

const WORLD_BORDERS = [
${firm.join(',\n')}
];

// Disputed, indefinite and lines of control: drawn dashed.
const WORLD_DISPUTED = [
${disputed.join(',\n')}
];

const WORLD_PROVINCES = [
${divisions.join(',\n')}
];

const WORLD_PLACES = [
${cities.join(',\n')}
];
`;
writeFileSync(OUT, text);
console.log(`world-atlas: ${firm.length} + ${disputed.length} borders, ${divisions.length} province lines, ${cities.length} cities, ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB → web/wallpapers/world-clock/world-atlas.js`);
