// Wiki Pond's reading of Wikimedia's recent-changes stream: which events to
// show and what each becomes on the pond. Pure functions, no DOM; the unit
// tests load this file in a Node vm (tools/wiki-pond.test.mjs).

const WikiPondEvents = (() => {
    'use strict';

    const STREAM = 'https://stream.wikimedia.org/v2/stream/recentchange';
    const BIGGEST = Math.log2(1 + 50000);   // bytes: a change this big makes the largest ring

    const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
    const IPV6 = /^[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}$/i;

    // Who made it: a bot, a temporary account ("~2026-…"), an old-style
    // anonymous edit (an IP address), or a registered user.
    function who(event) {
        if (event.bot) return 'bot';
        const user = String(event.user || '');
        if (user.startsWith('~')) return 'temp';
        if (IPV4.test(user) || IPV6.test(user)) return 'anon';
        return 'user';
    }

    // Titles are other people's live words: plain text only, no control
    // characters, and short.
    function cleanTitle(title) {
        const text = String(title || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').trim();
        return text.length > 60 ? `${text.slice(0, 59)}…` : text;
    }

    // One parsed event → what the pond shows, or null to skip it.
    //   { kind: 'edit' | 'new' | 'account', wiki, who, delta, size (0–1), title }
    // `wikis` is the list from the settings ('*' for every wiki); `bots` is
    // 'show' or 'hide'.
    function read(event, { wikis = ['enwiki'], bots = 'show' } = {}) {
        if (!event || typeof event !== 'object') return null;
        if (event.meta?.domain === 'canary') return null;        // Wikimedia's own health checks
        const all = wikis.includes('*');
        if (!all && !wikis.includes(event.wiki)) return null;
        if (bots === 'hide' && event.bot) return null;
        let kind = null, delta = 0;
        const before = Number(event.length?.old) || 0, after = Number(event.length?.new) || 0;
        if (event.type === 'edit') {
            kind = 'edit';
            delta = after - before;
        } else if (event.type === 'new') {
            kind = 'new';
            delta = after;
        } else if (event.type === 'log' && event.log_type === 'newusers') {
            kind = 'account';
        }
        if (!kind) return null;
        return {
            kind, wiki: String(event.wiki || ''), who: who(event), delta,
            size: Math.min(1, Math.log2(1 + Math.abs(delta)) / BIGGEST),
            title: cleanTitle(event.title),
        };
    }

    // The stream's data line, parsed; null for anything that isn't JSON.
    function parse(data) {
        try { return JSON.parse(data); } catch { return null; }
    }

    // Reconnect delays: quick after a stream that was working ends (the
    // server closes them now and then), doubling to a minute while it fails.
    function backoff(failures) {
        return failures <= 0 ? 1000 : Math.min(60000, 2000 * 2 ** (failures - 1));
    }

    return { STREAM, read, parse, who, cleanTitle, backoff };
})();

globalThis.WikiPondEvents = WikiPondEvents;   // for the unit tests, which load this in a vm
