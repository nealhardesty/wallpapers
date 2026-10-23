// Jellyfin's decisions, with no DOM (SPEC §10.21): which subtitle track,
// what plays next, what the browser can play directly, how sharp, from
// where. The unit tests (tools/jellyfin.test.mjs) load this in a Node vm.

const JellyfinLogic = (() => {
    'use strict';

    // ---- The server ------------------------------------------------------------

    // What the user typed, as an origin plus any reverse-proxy path. No
    // scheme means http, and then no port means Jellyfin's 8096.
    function normalizeServer(text) {
        let typed = String(text || '').trim().replace(/\/+$/, '');
        if (!typed) return null;
        if (!/^https?:\/\//i.test(typed)) typed = `http://${/^[^/]+:\d+/.test(typed) ? typed : typed.replace(/^([^/]+)/, '$1:8096')}`;
        try {
            const url = new URL(typed);
            if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
            return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
        } catch {
            return null;
        }
    }

    // A host Chrome lets through from an https page as plain http: an IP
    // address, or localhost (spike 9.0). An http hostname is blocked.
    const ipOrLocal = server => {
        const host = new URL(server).hostname;
        return host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
    };

    // Why a request can't work from this page, before trying it: null if it
    // might. pageProtocol is location.protocol.
    function blockedBecause(server, pageProtocol, kind) {
        if (!server.startsWith('http:') || pageProtocol !== 'https:' || kind === 'android') return null;
        return ipOrLocal(server) ? null : 'mixed';
    }

    const quote = value => String(value).replace(/["\\]/g, '');
    const authHeader = ({ device, deviceId, version, token }) =>
        `MediaBrowser Client="Wallpapers", Device="${quote(device)}", DeviceId="${quote(deviceId)}", Version="${quote(version)}"${token ? `, Token="${quote(token)}"` : ''}`;

    // A media URL as this host must ask for it. Android's WebView won't play
    // http media in an https page, so the app carries it (MediaProxy.kt).
    function mediaUrl(server, path, { android = false, origin = '' } = {}) {
        const url = `${server}${path}`;
        if (!android || !server.startsWith('http:')) return url;
        return `${origin}/jellyfin-media/http/${url.slice('http://'.length)}`;
    }

    // ---- Subtitles -----------------------------------------------------------

    // ISO 639-2 codes, their 639-1 forms and names, as the settings offer them.
    const LANGUAGES = {
        eng: ['en', 'English'], spa: ['es', 'Spanish', 'Español'], fre: ['fr', 'French', 'Français', 'fra'], ger: ['de', 'German', 'Deutsch', 'deu'],
        ita: ['it', 'Italian', 'Italiano'], por: ['pt', 'Portuguese', 'Português'], dut: ['nl', 'Dutch', 'Nederlands', 'nld'], swe: ['sv', 'Swedish', 'Svenska'],
        nor: ['no', 'nb', 'Norwegian', 'nob', 'Norsk'], dan: ['da', 'Danish', 'Dansk'], fin: ['fi', 'Finnish', 'Suomi'], pol: ['pl', 'Polish', 'Polski'],
        rus: ['ru', 'Russian'], jpn: ['ja', 'Japanese'], kor: ['ko', 'Korean'], chi: ['zh', 'Chinese', 'zho'], ara: ['ar', 'Arabic'], hin: ['hi', 'Hindi'],
    };
    function speaks(stream, language) {
        const names = [language, ...(LANGUAGES[language] || [])].map(n => n.toLowerCase());
        const code = String(stream.Language || '').toLowerCase();
        if (code && names.includes(code)) return true;
        const title = `${stream.DisplayTitle || ''} ${stream.Title || ''}`.toLowerCase();
        return names.some(name => name.length > 3 && title.includes(name));
    }
    const isImage = stream => stream.IsTextSubtitleStream === false || stream.DeliveryMethod === 'Encode';

    // The track to show: { index, burn } or null. mode is 'always',
    // 'forced' (forced tracks only) or 'off'. Foreign audio makes 'forced'
    // act like 'always'. Within each step, text beats image (no transcode)
    // and SDH comes last.
    function pickSubtitle(streams, { language = 'eng', mode = 'always', burnInImage = true, audioIndex = null } = {}) {
        if (mode === 'off') return null;
        const audio = streams.find(s => s.Type === 'Audio' && (audioIndex === null || s.Index === audioIndex));
        const foreign = audio?.Language && !['und', 'mul', 'zxx'].includes(audio.Language) && !speaks(audio, language);
        const effective = mode === 'forced' && foreign ? 'always' : mode;
        const tracks = streams.filter(s => s.Type === 'Subtitle' && (burnInImage || !isImage(s)));
        const rank = list => [...list].sort((a, b) => isImage(a) - isImage(b) || !!a.IsHearingImpaired - !!b.IsHearingImpaired)[0];
        const steps = effective === 'always'
            ? [tracks.filter(s => speaks(s, language) && !s.IsForced), tracks.filter(s => speaks(s, language) && s.IsForced), tracks.filter(s => s.IsDefault)]
            : [tracks.filter(s => speaks(s, language) && s.IsForced)];
        for (const step of steps) {
            const best = rank(step);
            if (best) return { index: best.Index, burn: isImage(best) };
        }
        return null;
    }

    // Every track `s` can step through: off, then each one in order.
    const subtitleChoices = streams => [null, ...streams.filter(s => s.Type === 'Subtitle').map(s => ({ index: s.Index, burn: isImage(s), title: s.DisplayTitle || s.Language || `Track ${s.Index}` }))];

    // A cue's text without markup: WebVTT tags, ASS overrides, and lines.
    const cueText = text => String(text).replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/\\N/g, '\n').trim();

    // ---- What plays next -------------------------------------------------------

    // A shuffle bag: every item once before any repeats, a new shuffle each
    // round, and the last of one round never opens the next. In order, the
    // same, unshuffled. state: { key, order, at }, kept in host.storage so a
    // new tab carries on. Returns { id, state }.
    function next(state, ids, { shuffle = true, random = Math.random } = {}) {
        if (!ids.length) return { id: null, state: null };
        const key = `${shuffle ? 's' : 'o'}:${[...ids].sort().join(',')}`;
        let { order = [], at = -1 } = state?.key === key ? state : {};
        at++;
        if (at >= order.length) {
            const last = order[order.length - 1];
            order = [...ids];
            if (shuffle) {
                for (let i = order.length - 1; i > 0; i--) {
                    const j = Math.floor(random() * (i + 1));
                    [order[i], order[j]] = [order[j], order[i]];
                }
                if (order.length > 1 && order[0] === last) [order[0], order[1]] = [order[1], order[0]];
            }
            at = 0;
        }
        return { id: order[at], state: { key, order, at } };
    }

    // One step back ('p'): the item before, or the same one at the start.
    function previous(state) {
        if (!state?.order?.length) return { id: null, state };
        const at = Math.max(0, state.at - 1);
        return { id: state.order[at], state: { ...state, at } };
    }

    // ---- How it plays ----------------------------------------------------------

    // The height to ask the server for (task 9.7): by tier, unless the
    // setting says otherwise, and never over 720p on battery.
    const TIER_HEIGHT = { low: 480, medium: 720, high: 1080 };
    function maxHeight({ tier = 'high', setting = 'auto', reasons = [] }) {
        let height = setting === 'auto' ? TIER_HEIGHT[tier] || 1080 : Number(setting);
        if (reasons.some(r => r === 'on battery' || r === 'battery low')) height = Math.min(height, 720);
        return height;
    }

    // Poster mode: no video at all. Auto is battery saver or a low battery;
    // on Android, any time it's on battery.
    function posterWanted({ setting = 'auto', reasons = [], android = false }) {
        if (setting !== 'auto') return setting === 'always';
        return reasons.some(r => r === 'battery saver' || r === 'battery low' || (android && r === 'on battery'));
    }

    // Auto plays whole items on a computer and clips on a phone.
    const segmentFor = (setting, android) => setting === 'auto' ? (android ? 'clips' : 'whole') : setting;

    // Where to start and stop, in seconds: { start, end } (end null: the end).
    //   whole: where it was left (resume), or 0 for anything under 2 minutes
    //   clips: `minutes` from a random point, skipping the first and last 5%
    //   surf:  a short clip, 20 to 40 s
    function span({ duration, segment, minutes = 3, saved = 0, random = Math.random }) {
        if (segment === 'whole' || !duration) {
            const resume = duration >= 120 && saved > 0 && saved < duration * 0.95 ? saved : 0;
            return { start: resume, end: null };
        }
        const length = segment === 'surf' ? 20 + random() * 20 : minutes * 60;
        const from = duration * 0.05, to = duration * 0.95;
        if (to - from <= length) return { start: from, end: to };
        const start = from + random() * (to - from - length);
        return { start, end: start + length };
    }

    // Saved positions, newest kept, at most `max` of them.
    function remember(positions, id, seconds, max = 200) {
        const kept = Object.entries(positions || {}).filter(([key]) => key !== id).slice(-(max - 1));
        return Object.fromEntries([...kept, [id, Math.round(seconds)]]);
    }

    // A bitrate ceiling for each height: roomy enough that a file already
    // under the cap still plays directly (the server weighs this for direct
    // play too), and it bounds what a transcode sends.
    const bitrateFor = height => height <= 480 ? 4e6 : height <= 720 ? 8e6 : height <= 1080 ? 20e6 : 60e6;

    // The device profile for PlaybackInfo, from what this browser says it
    // can play (canPlay(mime) → bool). Anything over `height` (or its 16:9
    // width) is transcoded down to it. Jellyfin 12.3 scales by MaxWidth and
    // ignores MaxHeight, so the width condition is the one that bites
    // (spike 9.0). Image subtitles aren't listed, so the server burns them in.
    function deviceProfile({ canPlay, height, bitrate = bitrateFor(height) }) {
        const video = (container, codecs) => codecs.filter(([, mime]) => canPlay(`${container}; codecs="${mime}"`)).map(([name]) => name);
        const VIDEO = [['h264', 'avc1.640028'], ['hevc', 'hvc1.1.6.L120.90'], ['vp9', 'vp09.00.40.08'], ['av1', 'av01.0.08M.08']];
        const AUDIO = [['aac', 'mp4a.40.2'], ['mp3', 'mp3'], ['opus', 'opus'], ['flac', 'flac'], ['ac3', 'ac-3'], ['eac3', 'ec-3']];
        const direct = [];
        const add = (container, mime, audio = AUDIO) => {
            const v = video(mime, VIDEO), a = audio.filter(([, codec]) => canPlay(`${mime}; codecs="${codec}"`)).map(([name]) => name);
            if (v.length) direct.push({ Container: container, Type: 'Video', VideoCodec: v.join(','), AudioCodec: a.join(',') });
        };
        add('mp4,m4v', 'video/mp4');
        add('mkv', 'video/x-matroska');
        add('webm', 'video/webm', [['opus', 'opus'], ['vorbis', 'vorbis']]);
        const hls = canPlay('application/vnd.apple.mpegurl');
        return {
            Name: 'Wallpapers',
            MaxStreamingBitrate: bitrate,
            MaxStaticBitrate: bitrate * 5,
            DirectPlayProfiles: direct,
            TranscodingProfiles: [hls
                ? { Container: 'ts', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac,mp3', Protocol: 'hls', Context: 'Streaming', MaxAudioChannels: '2', BreakOnNonKeyFrames: true }
                : { Container: 'mp4', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac', Protocol: 'http', Context: 'Streaming', MaxAudioChannels: '2' }],
            ContainerProfiles: [],
            CodecProfiles: [{ Type: 'Video', Conditions: [
                { Condition: 'LessThanEqual', Property: 'Height', Value: String(height), IsRequired: false },
                { Condition: 'LessThanEqual', Property: 'Width', Value: String(Math.ceil(height * 16 / 9 / 2) * 2), IsRequired: false },
            ] }],
            SubtitleProfiles: ['vtt', 'srt', 'subrip', 'ass', 'ssa', 'sub', 'smi', 'ttml'].map(Format => ({ Format, Method: 'External' })),
        };
    }

    // The URL to play, from PlaybackInfo's media source: direct when the
    // server allows it, else its transcode. Relative to the server.
    function streamPath(item, source, { token, session, burn }) {
        if (source.SupportsDirectPlay && !burn) {
            return `/Videos/${item.Id}/stream?static=true&MediaSourceId=${encodeURIComponent(source.Id)}&PlaySessionId=${encodeURIComponent(session || '')}&api_key=${encodeURIComponent(token)}`;
        }
        return source.TranscodingUrl || null;
    }

    // What the frames show of an item: "Title (Year)" or "Show: Episode".
    const titleOf = item => item.SeriesName && item.Type === 'Episode'
        ? `${item.SeriesName}: ${item.Name}`
        : item.ProductionYear && !item.Name.includes(`(${item.ProductionYear})`) ? `${item.Name} (${item.ProductionYear})` : item.Name;

    // Reconnecting: 5 s, doubling, up to 5 minutes.
    const backoff = failures => Math.min(300000, 5000 * 2 ** Math.max(0, failures - 1));

    return { normalizeServer, blockedBecause, authHeader, mediaUrl, LANGUAGES, pickSubtitle, subtitleChoices, cueText, next, previous,
        maxHeight, posterWanted, segmentFor, span, remember, deviceProfile, streamPath, titleOf, backoff };
})();

globalThis.JellyfinLogic = JellyfinLogic;   // for the unit tests, which load this in a vm
