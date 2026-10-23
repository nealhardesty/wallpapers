// Satellites' orbital elements: where they come from, how long they're kept,
// and what to show without them. No DOM; the cache rules are unit tested
// (tools/satellites.test.mjs).
//
// CelesTrak publishes general-perturbation elements as JSON, keyless, with
// CORS. It asks clients not to fetch more often than the data changes, and
// blocks those that do, so each group is cached in host.storage and fetched
// at most once every 12 hours (and a failure isn't retried for an hour).
// Elements more than three days from the sky's time are labelled stale.

const SatData = (() => {
    'use strict';

    const HOUR = 3600000;
    const REFRESH_MS = 12 * HOUR, RETRY_MS = HOUR, STALE_MS = 72 * HOUR;
    const GROUPS = { visual: ['visual'], stations: ['stations'], both: ['visual', 'stations'] };
    const url = group => `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`;
    const FIELDS = ['OBJECT_NAME', 'NORAD_CAT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION',
        'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'];

    // May this group be fetched now? A cache record is { fetched, tried,
    // elements }, times from Date.now(). Never more than once per 12 hours
    // after a success, or once an hour after a failure. A clock that went
    // backwards by more than a day doesn't block it forever.
    function due(record, now) {
        if (!record) return true;
        const since = (at, ms) => !at || now - at >= ms || at - now > 24 * HOUR;
        return since(record.fetched, REFRESH_MS) && since(record.tried, RETRY_MS);
    }

    // CelesTrak's JSON, cut down to what SGP4 needs, nonsense dropped.
    function compact(list) {
        if (!Array.isArray(list)) throw new Error('not a list of elements');
        const kept = [];
        for (const item of list) {
            const omm = {};
            for (const key of FIELDS) omm[key] = item?.[key];
            if (typeof omm.OBJECT_NAME !== 'string' || typeof omm.EPOCH !== 'string' || !(omm.MEAN_MOTION > 0)) continue;
            if (FIELDS.slice(4).some(key => !Number.isFinite(omm[key]))) continue;
            kept.push(omm);
        }
        if (!kept.length) throw new Error('no usable elements');
        return kept;
    }

    // Every group's elements, once each (the station is in both lists).
    function merge(records) {
        const seen = new Set(), all = [];
        for (const record of records) for (const omm of record?.elements || []) {
            if (seen.has(omm.NORAD_CAT_ID)) continue;
            seen.add(omm.NORAD_CAT_ID);
            all.push(omm);
        }
        return all;
    }

    async function fetchGroup(group) {
        const response = await fetch(url(group), { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`CelesTrak said ${response.status}`);
        return compact(await response.json());
    }

    // How far the elements are from the sky's time: the median, in ms.
    function age(elements, skyMs) {
        const ages = elements.map(e => Math.abs(skyMs - Date.parse(`${e.EPOCH.replace(/Z$/, '')}Z`))).sort((a, b) => a - b);
        return ages.length ? ages[ages.length >> 1] : Infinity;
    }

    // What each object is: the space stations get a name and the brightest
    // dot, rocket bodies are brighter than most satellites. `standard` is a
    // rough magnitude at 1,000 km and half phase.
    const STATIONS = { 25544: 'ISS', 48274: 'Tiangong' };
    function kind(omm) {
        const name = omm.OBJECT_NAME;
        if (STATIONS[omm.NORAD_CAT_ID]) return { type: 'station', label: STATIONS[omm.NORAD_CAT_ID], standard: omm.NORAD_CAT_ID === 25544 ? -1.3 : 0.2 };
        if (/station/i.test(name)) return { type: 'station', label: name, standard: -1 };
        if (/R\/B/.test(name)) return { type: 'rocket', label: name, standard: 3.2 };
        return { type: 'satellite', label: name, standard: 4.2 };
    }

    // Offline, with nothing cached: made-up orbits of the usual kinds (a
    // station, sun-synchronous satellites, rocket bodies), always the same
    // ones, so the sky still moves the way a real one does. Clearly
    // labelled as a sample wherever it's shown.
    function sample() {
        const random = WP.seededRandom(1957);
        const pick = (a, b) => a + (b - a) * random();
        const elements = [];
        const add = (name, n, e, i) => elements.push({
            OBJECT_NAME: name, NORAD_CAT_ID: 90000 + elements.length, EPOCH: '2026-01-01T00:00:00.000',
            MEAN_MOTION: n, ECCENTRICITY: e, INCLINATION: i,
            RA_OF_ASC_NODE: pick(0, 360), ARG_OF_PERICENTER: pick(0, 360), MEAN_ANOMALY: pick(0, 360), BSTAR: 0,
        });
        add('SAMPLE STATION', 15.5, 0.0005, 51.64);
        for (let k = 1; k <= 14; k++) add(`SAMPLE SAT ${k}`, pick(14.2, 15.2), pick(0.0001, 0.002), pick(97.4, 99));
        for (let k = 1; k <= 16; k++) add(`SAMPLE R/B ${k}`, pick(13.4, 14.9), pick(0.001, 0.01), [71, 74, 81.2, 82.9, 51.7, 65.8][k % 6]);
        for (let k = 15; k <= 24; k++) add(`SAMPLE SAT ${k}`, pick(13.8, 15.4), pick(0.0005, 0.01), pick(40, 90));
        return elements;
    }

    return { REFRESH_MS, RETRY_MS, STALE_MS, GROUPS, url, due, compact, merge, fetchGroup, age, kind, sample };
})();
