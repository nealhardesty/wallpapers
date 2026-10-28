// The clock overlay's logic (SPEC §4.9): what the clock says, where it goes,
// what colour it is. Pure: no DOM, no storage, no timers, so Node can test it
// (tools/clockface.test.mjs runs this file in a vm). core/clockface-view.js
// draws it, and clockface-settings.js is its defaults and schema.
// (WP.clock is the host.now() time source; this is WP.clockface.)

(function (WP) {
    'use strict';

    const C = WP.clockface = {};
    const two = n => String(n).padStart(2, '0');
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const DAY = 86400000;

    // ---- Zones ------------------------------------------------------------
    const cache = new Map();
    const formatter = (locale, options) => {
        const key = `${locale}|${JSON.stringify(options)}`;
        if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat(locale, options));
        return cache.get(key);
    };

    // Used where Intl can't list the zones itself.
    C.COMMON_ZONES = ['UTC', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Sao_Paulo',
        'Atlantic/Reykjavik', 'Europe/London', 'Europe/Paris', 'Europe/Athens', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata',
        'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];

    C.zones = () => {
        let list;
        try { list = Intl.supportedValuesOf('timeZone'); } catch { list = C.COMMON_ZONES; }
        return list.includes('UTC') ? list : ['UTC', ...list];
    };

    C.validZone = zone => {
        if (zone === 'local') return true;
        try { formatter('en-US', { timeZone: zone }); return typeof zone === 'string' && zone.length < 64; } catch { return false; }
    };

    // The timeZone option Intl wants: undefined is the device's own zone.
    const tz = zone => zone && zone !== 'local' && C.validZone(zone) ? zone : undefined;

    // The calendar and clock fields of a moment, in a zone.
    C.parts = (date, zone = 'local') => {
        const p = {};
        const f = formatter('en-US', { timeZone: tz(zone), hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
        for (const { type, value } of f.formatToParts(date)) if (type !== 'literal') p[type] = +value;
        p.hour %= 24;
        p.ms = ((date.getTime() % 1000) + 1000) % 1000;
        p.weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
        return p;
    };

    C.offsetMinutes = (date, zone) => {
        const p = C.parts(date, zone);
        return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - (date.getTime() - p.ms)) / 60000);
    };

    C.offsetLabel = minutes => {
        if (!minutes) return 'UTC';
        const a = Math.abs(minutes), m = a % 60;
        return `UTC${minutes < 0 ? '−' : '+'}${Math.floor(a / 60)}${m ? `:${two(m)}` : ''}`;
    };

    C.abbreviation = (date, zone) =>
        formatter('en-US', { timeZone: tz(zone), timeZoneName: 'short' }).formatToParts(date).find(p => p.type === 'timeZoneName')?.value ?? '';

    // New_York for America/New_York; UTC for UTC and its aliases.
    C.city = zone => {
        const id = zone === 'local' || !zone ? formatter('en-US', {}).resolvedOptions().timeZone : zone;
        if (/^(UTC|Etc\/(UTC|UCT|GMT|Zulu)|GMT|Z)$/i.test(id)) return 'UTC';
        return id.split('/').pop().replace(/_/g, ' ');
    };

    // ---- The time ---------------------------------------------------------
    C.uses24 = (config, locale) => {
        if (config.hour12 === '24') return true;
        if (config.hour12 === '12') return false;
        return !/^h1[12]$/.test(formatter(locale, { hour: 'numeric' }).resolvedOptions().hourCycle || 'h23');
    };

    const dayPeriod = (date, zone, locale, hour) => {
        try {
            const part = formatter(locale, { timeZone: tz(zone), hour: 'numeric', hour12: true }).formatToParts(date).find(p => p.type === 'dayPeriod');
            if (part) return part.value;
        } catch {}
        return hour < 12 ? 'AM' : 'PM';
    };

    const meridiemText = (text, style) => style === 'none' ? '' : style === 'lower' ? text.toLowerCase()
        : style === 'short' ? text.replace(/[^\p{L}]/gu, '').charAt(0).toUpperCase() : text.toUpperCase();

    // Which styles can show seconds, and whether the user asked.
    C.showsSeconds = config => !!config.seconds && ['digital', 'roman', 'binary', 'beats'].includes(config.style);

    function digital(p, date, config, locale, zone, seconds) {
        const is24 = C.uses24(config, locale);
        let hour = p.hour, tail = '';
        if (!is24) {
            const mark = meridiemText(dayPeriod(date, zone, locale, hour), config.meridiem);
            if (mark) tail = (config.meridiem === 'short' ? '' : ' ') + mark;
            hour = hour % 12 || 12;
        }
        const hh = config.pad || is24 ? two(hour) : String(hour);
        return `${hh}:${two(p.minute)}${seconds ? `:${two(p.second)}` : ''}${tail}`;
    }

    const HOUR_WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
    const PAST = { 5: 'five past', 10: 'ten past', 15: 'quarter past', 20: 'twenty past', 25: 'twenty-five past', 30: 'half past' };
    const TO = { 35: 'twenty-five to', 40: 'twenty to', 45: 'quarter to', 50: 'ten to', 55: 'five to' };
    const hourWord = h24 => { const h = ((h24 % 24) + 24) % 24; return h === 0 ? 'midnight' : h === 12 ? 'noon' : HOUR_WORDS[h % 12]; };

    // "quarter to eleven": to the nearest five minutes.
    C.words = p => {
        let m = Math.floor((p.minute + 2) / 5) * 5, hour = p.hour;
        if (m === 60) { m = 0; hour += 1; }
        if (m === 0) return ['noon', 'midnight'].includes(hourWord(hour)) ? hourWord(hour) : `${hourWord(hour)} o’clock`;
        return m <= 30 ? `${PAST[m]} ${hourWord(hour)}` : `${TO[m]} ${hourWord(hour + 1)}`;
    };

    const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    // Zero is N, for nulla: the medieval way.
    C.roman = n => {
        if (!(n > 0)) return 'N';
        let out = '';
        for (const [value, letters] of ROMAN) while (n >= value) { out += letters; n -= value; }
        return out;
    };

    // The hour as shown: 0–23, or 1–12 (zero is twelve).
    const shownHour = (p, is24) => is24 ? p.hour : p.hour % 12 || 12;

    // Binary-coded decimal: a column of lamps per digit (H tens, H units,
    // M tens, M units, then seconds). null is a lamp the digit can't have.
    C.binary = (p, is24, seconds) => {
        const h = shownHour(p, is24);
        const digits = [Math.floor(h / 10), h % 10, Math.floor(p.minute / 10), p.minute % 10];
        if (seconds) digits.push(Math.floor(p.second / 10), p.second % 10);
        const lamps = [2, 4, 3, 4, 3, 4];
        return digits.map((digit, i) => [3, 2, 1, 0].map(bit => bit < lamps[i] ? (digit >> bit) & 1 : null));
    };
    C.binaryText = grid => [0, 1, 2, 3].map(row => grid.map(col => col[row] === null ? ' ' : col[row] ? '●' : '○').join('')).join('\n');

    // The day as a 16-bit number: one tick is 1.32 s.
    C.hex = p => Math.floor(((p.hour * 60 + p.minute) * 60 + p.second + p.ms / 1000) / 86400 * 65536).toString(16).toUpperCase().padStart(4, '0');
    C.HEX_TICK = DAY / 65536;

    // Swatch Internet Time: 1000 .beats a day, counted from UTC+1, no zones.
    const bmtMs = date => (((date.getTime() + 3600000) % DAY) + DAY) % DAY;
    C.beats = (date, centi) => {
        const b = bmtMs(date) / 86400;
        return `@${String(Math.floor(b)).padStart(3, '0')}${centi ? `.${two(Math.floor((b % 1) * 100))}` : ''}`;
    };

    // ---- The date line ----------------------------------------------------
    const DATES = {
        weekday: { weekday: 'long' },
        short: { month: 'short', day: 'numeric' },
        medium: { weekday: 'short', month: 'short', day: 'numeric' },
        long: { weekday: 'long', month: 'long', day: 'numeric' },
        numeric: { year: 'numeric', month: 'numeric', day: 'numeric' },
    };
    const MOONS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
    const SYNODIC = 29.530588853;
    C.moonAge = date => (((date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / DAY) % SYNODIC + SYNODIC) % SYNODIC;
    C.moon = date => MOONS[Math.floor(C.moonAge(date) / SYNODIC * 8 + 0.5) % 8];

    const dayOfYear = p => (Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(p.year, 0, 1)) / DAY + 1;
    const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    // ISO 8601: weeks start on Monday, and week 1 holds the year's first Thursday.
    C.isoWeek = p => {
        const t = Date.UTC(p.year, p.month - 1, p.day);
        const thursday = t + (3 - (new Date(t).getUTCDay() + 6) % 7) * DAY;
        return Math.floor((thursday - Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1)) / DAY / 7) + 1;
    };

    C.EXTRAS = [['zone', 'Timezone'], ['offset', 'UTC offset'], ['week', 'Week'], ['dayOfYear', 'Day of year'], ['quarter', 'Quarter'], ['daysLeft', 'Days left'], ['moon', 'Moon'], ['epoch', 'Unix time']];
    function extra(name, date, p, zone) {
        switch (name) {
            case 'zone': return C.abbreviation(date, zone);
            case 'offset': return C.offsetLabel(C.offsetMinutes(date, zone));
            case 'week': return `W${C.isoWeek(p)}`;
            case 'dayOfYear': return `Day ${dayOfYear(p)}`;
            case 'quarter': return `Q${Math.floor((p.month - 1) / 3) + 1}`;
            case 'daysLeft': { const n = (leap(p.year) ? 366 : 365) - dayOfYear(p); return n === 0 ? 'last day' : `${n} day${n === 1 ? '' : 's'} left`; }
            case 'moon': return C.moon(date);
            case 'epoch': return String(Math.floor(date.getTime() / 1000));
            default: return '';
        }
    }

    function dateLine(date, p, config, locale, zone) {
        let text = '';
        if (config.date === 'iso') text = `${p.year}-${two(p.month)}-${two(p.day)}`;
        else if (DATES[config.date]) text = formatter(locale, { timeZone: tz(zone), ...DATES[config.date] }).format(date);
        const line = [text, ...C.EXTRAS.map(([name]) => name).filter(name => config.extras.includes(name)).map(name => extra(name, date, p, zone))].filter(Boolean).join(' · ');
        return config.dateCase === 'upper' ? line.toLocaleUpperCase(locale) : config.dateCase === 'lower' ? line.toLocaleLowerCase(locale) : line;
    }

    // How many days ahead or behind a second zone's date is.
    const dayWord = apart => apart === 1 ? 'tomorrow' : apart === -1 ? 'yesterday' : apart > 1 ? `+${apart} days` : apart < -1 ? `−${-apart} days` : '';

    // ---- Putting it together ---------------------------------------------
    // What the clock says for a moment: { time, grid, sub, second, text }.
    //   time    the main line (the lamps' rows, joined, for binary)
    //   grid    binary's lamps, or null
    //   sub     the date line with its extras
    //   second  the second zone, { label, time, day }, or null
    C.format = (date, config, { locale } = {}) => {
        const zone = config.zone;
        const p = C.parts(date, zone);
        const seconds = C.showsSeconds(config);
        const is24 = C.uses24(config, locale);
        let time, grid = null;
        switch (config.style) {
            case 'words': time = C.words(p); break;
            case 'roman': time = `${C.roman(shownHour(p, is24))}:${C.roman(p.minute)}${seconds ? `:${C.roman(p.second)}` : ''}`; break;
            case 'binary': grid = C.binary(p, is24, seconds); time = C.binaryText(grid); break;
            case 'hex': time = C.hex(p); break;
            case 'beats': time = C.beats(date, seconds); break;
            default: time = digital(p, date, config, locale, zone, seconds);
        }
        let second = null;
        if (config.secondOn) {
            const q = C.parts(date, config.secondZone);
            const apart = (Date.UTC(q.year, q.month - 1, q.day) - Date.UTC(p.year, p.month - 1, p.day)) / DAY;
            second = {
                label: config.secondLabel === 'none' ? '' : config.secondLabel === 'offset' ? C.offsetLabel(C.offsetMinutes(date, config.secondZone)) : C.city(config.secondZone),
                time: digital(q, date, config, locale, config.secondZone, false),
                day: config.secondDay ? dayWord(apart) : '',
            };
        }
        const sub = dateLine(date, p, config, locale, zone);
        const text = [time.replace(/\n/g, ' / '), sub, second && [second.label, second.time, second.day].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
        return { time, grid, sub, second, text };
    };

    // Milliseconds until what C.format says can next be different.
    C.nextChange = (date, config) => {
        const p = C.parts(date, config.zone);
        if (config.style === 'hex') {
            const into = ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 + p.ms;
            return C.HEX_TICK - (into % C.HEX_TICK);
        }
        if (config.style === 'beats') {
            const tick = C.showsSeconds(config) ? 864 : 86400;
            return tick - (bmtMs(date) % tick);
        }
        if (C.showsSeconds(config) || config.extras.includes('epoch')) return 1000 - p.ms;
        return (60 - p.second) * 1000 - p.ms;
    };

    // ---- Fonts: system stacks only (SPEC §7.3) ---------------------------
    const SANS = `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
    const SERIF = `ui-serif, 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, Cambria, 'Times New Roman', serif`;
    C.FONTS = {
        system: ['System', SANS],
        rounded: ['Rounded', `ui-rounded, 'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Nunito, 'Varela Round', ${SANS}`],
        serif: ['Serif', SERIF],
        didone: ['Didone', `Didot, 'Bodoni 72', 'Bodoni MT', 'Playfair Display', ${SERIF}`],
        slab: ['Slab', `Rockwell, 'Rockwell Nova', 'Roboto Slab', 'Courier Prime', ${SERIF}`],
        condensed: ['Condensed', `'Avenir Next Condensed', 'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue Condensed', ${SANS}`],
        humanist: ['Humanist', `Optima, Candara, 'Gill Sans', 'Gill Sans MT', 'Trebuchet MS', ${SANS}`],
        mono: ['Mono', `ui-monospace, 'SF Mono', Menlo, Consolas, 'Roboto Mono', 'DejaVu Sans Mono', monospace`],
        typewriter: ['Typewriter', `'American Typewriter', 'Courier New', Courier, 'Nimbus Mono PS', monospace`],
        hand: ['Handwriting', `'Bradley Hand', 'Segoe Print', 'Segoe Script', 'Chalkboard SE', 'Comic Sans MS', cursive`],
    };

    // A family name typed by the user, as a name and nothing else: letters,
    // digits, spaces, dots and hyphens. No quotes, so it can't end the string
    // it's put in, and no braces or semicolons.
    C.cleanFontName = text => String(text ?? '').replace(/[^\p{L}\p{N} .\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    C.fontFamily = config => {
        if (config.font !== 'custom') return (C.FONTS[config.font] || C.FONTS.system)[1];
        const name = C.cleanFontName(config.fontCustom);
        return name ? `"${name}", ${SANS}` : SANS;
    };

    // ---- Looks: a patch over the style settings --------------------------
    C.STYLE_KEYS = ['font', 'weight', 'spacing', 'opacity', 'colorMode', 'color', 'color2', 'effect', 'effectColor', 'effectSize', 'outline', 'outlineColor', 'plate', 'plateColor', 'plateOpacity'];
    const BASE = {
        font: 'system', weight: 300, spacing: 0, opacity: 0.9, colorMode: 'solid', color: '#ffffff', color2: '#7dd3fc',
        effect: 'soft', effectColor: '#000000', effectSize: 3, outline: 0, outlineColor: '#000000', plate: 'none', plateColor: '#000000', plateOpacity: 0.35,
    };
    C.BASE_STYLE = BASE;
    C.PRESETS = {
        minimal: { label: 'Minimal', patch: BASE },
        neon: { label: 'Neon', patch: { ...BASE, font: 'rounded', weight: 500, spacing: 0.04, opacity: 1, color: '#ff5fd7', effect: 'neon', effectSize: 4 } },
        terminal: { label: 'Terminal', patch: { ...BASE, font: 'mono', weight: 400, spacing: 0.02, opacity: 1, color: '#4dff7a', effect: 'glow', effectSize: 3, plate: 'tint', plateColor: '#00150a', plateOpacity: 0.6 } },
        newsprint: { label: 'Newsprint', patch: { ...BASE, font: 'serif', weight: 700, opacity: 1, color: '#f5f0e1', effect: 'hard', effectSize: 2.5 } },
        frosted: { label: 'Frosted', patch: { ...BASE, weight: 200, spacing: 0.02, opacity: 1, effect: 'none', plate: 'glass', plateColor: '#ffffff', plateOpacity: 0.12 } },
        lcd: { label: 'Retro LCD', patch: { ...BASE, font: 'mono', weight: 700, spacing: 0.08, opacity: 1, color: '#ffb000', effect: 'glow', effectSize: 2, plate: 'tint', plateColor: '#140b00', plateOpacity: 0.7 } },
        sunset: { label: 'Sunset', patch: { ...BASE, font: 'rounded', weight: 600, opacity: 1, colorMode: 'gradient', color: '#ffb35a', color2: '#ff4f8b', effectSize: 4 } },
        blueprint: { label: 'Blueprint', patch: { ...BASE, font: 'typewriter', weight: 400, spacing: 0.08, opacity: 1, color: '#e6f0ff', effect: 'none', plate: 'line', plateColor: '#7fb2ff' } },
    };
    // The look a config matches, or 'custom'.
    C.presetOf = config => Object.keys(C.PRESETS).find(id => C.STYLE_KEYS.every(key => config[key] === C.PRESETS[id].patch[key])) || 'custom';

    // ---- Colour -----------------------------------------------------------
    const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const toHex = channels => `#${channels.map(c => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
    C.mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((c, i) => c + (y[i] - c) * t)); };
    // A colour at some opacity. Hex, or an hsl() from driftColor.
    C.alpha = (color, a) => color.startsWith('hsl(') ? `${color.slice(0, -1)} / ${a})` : `rgba(${rgb(color).join(', ')}, ${a})`;

    // Amber at dawn, white by day, rose at dusk, dim blue at night: by the
    // hour alone, so it needs no location.
    const DAYLIGHT = [[0, '#8fb0ff'], [5, '#9db8ff'], [6.5, '#ffb36b'], [9, '#fff3dc'], [12, '#ffffff'], [16, '#fff0cf'], [18, '#ff9f68'], [19.5, '#ff7a8a'], [21, '#9db4ff'], [24, '#8fb0ff']];
    C.daylight = hour => {
        const h = clamp(hour, 0, 24);
        const i = DAYLIGHT.findIndex(([at]) => at > h);
        const [a, from] = DAYLIGHT[i - 1] || DAYLIGHT[0], [b, to] = DAYLIGHT[i] || DAYLIGHT[DAYLIGHT.length - 1];
        return C.mix(from, to, b === a ? 0 : (h - a) / (b - a));
    };
    // One slow turn of the hue wheel every ten minutes.
    C.driftColor = date => `hsl(${Math.floor((date.getTime() / 600000 % 1) * 3600) / 10}deg 85% 72%)`;
    C.hueColor = degrees => `hsl(${((degrees % 360) + 360) % 360}deg 85% 70%)`;

    // Light or dark text, from how bright the wallpaper is under the clock
    // (0–1). Hysteresis: dark above 0.62, light below 0.45, so a scene
    // hovering near the middle doesn't flicker. No reading keeps the last.
    C.LIGHT_BELOW = 0.45;
    C.DARK_ABOVE = 0.62;
    C.pick = (previous, luma) => {
        if (typeof luma !== 'number' || Number.isNaN(luma)) return previous || 'light';
        if (previous === 'dark') return luma < C.LIGHT_BELOW ? 'light' : 'dark';
        if (previous === 'light') return luma > C.DARK_ABOVE ? 'dark' : 'light';
        return luma > 0.5 ? 'dark' : 'light';
    };

    // The shadows for an effect, in em (so they scale with the clock):
    // [{ x, y, blur, color }]. `fill` is the text colour, which glows borrow.
    C.effectLayers = (config, fill) => {
        const u = config.effectSize * 0.012, ink = config.effectColor;
        switch (config.effect) {
            case 'soft': return [{ x: 0, y: u, blur: 3 * u, color: C.alpha(ink, 0.65) }, { x: 0, y: 0, blur: 6 * u, color: C.alpha(ink, 0.35) }];
            case 'hard': return [{ x: u, y: u, blur: 0, color: ink }];
            case 'long': {
                const n = Math.min(60, Math.round(8 + config.effectSize * 5));
                return Array.from({ length: n }, (_, k) => ({ x: (k + 1) * 0.01, y: (k + 1) * 0.01, blur: 0, color: C.alpha(ink, 0.9 - 0.5 * k / n) }));
            }
            case 'glow': return [{ x: 0, y: 0, blur: 3 * u, color: C.alpha(fill, 0.9) }, { x: 0, y: 0, blur: 8 * u, color: C.alpha(fill, 0.55) }];
            case 'neon': return [{ x: 0, y: 0, blur: 1.5 * u, color: 'rgba(255, 255, 255, 0.8)' }, { x: 0, y: 0, blur: 4 * u, color: C.alpha(fill, 1) },
                { x: 0, y: 0, blur: 9 * u, color: C.alpha(fill, 0.8) }, { x: 0, y: 0, blur: 18 * u, color: C.alpha(fill, 0.6) }];
            default: return [];
        }
    };
    C.shadowCss = layers => layers.map(l => `${+l.x.toFixed(4)}em ${+l.y.toFixed(4)}em ${+l.blur.toFixed(4)}em ${l.color}`).join(', ') || 'none';
    // The same as chained drop-shadows (for gradient text, whose own shadow
    // would show through its transparent fill); long tails are thinned.
    C.dropShadowCss = layers => {
        const kept = layers.length > 6 ? Array.from({ length: 6 }, (_, i) => layers[Math.round(i * (layers.length - 1) / 5)]) : layers;
        return kept.map(l => `drop-shadow(${+l.x.toFixed(4)}em ${+l.y.toFixed(4)}em ${+l.blur.toFixed(4)}em ${l.color})`).join(' ') || 'none';
    };

    // ---- Where it goes ----------------------------------------------------
    C.ANCHORS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];

    // The range a box's top-left corner may take: the screen minus the host's
    // insets and a margin. A box bigger than the room pins to the start.
    C.bounds = ({ w, h }, { bw, bh }, insets = {}, pad = 0) => {
        const x0 = (insets.left || 0) + pad, y0 = (insets.top || 0) + pad;
        return { x0, y0, x1: Math.max(x0, w - (insets.right || 0) - pad - bw), y1: Math.max(y0, h - (insets.bottom || 0) - pad - bh) };
    };
    const lerp = (a, b, t) => a + (b - a) * t;
    C.at = (b, fx, fy) => ({ x: lerp(b.x0, b.x1, fx), y: lerp(b.y0, b.y1, fy) });
    C.anchorPoint = (anchor, b) => {
        const fx = /left/.test(anchor) ? 0 : /right/.test(anchor) ? 1 : 0.5;
        const fy = /top/.test(anchor) ? 0 : /bottom/.test(anchor) ? 1 : 0.5;
        return C.at(b, fx, fy);
    };
    // A dragged-to spot: the clock's centre, as fractions of the screen.
    C.customPoint = (x, y, b, { w, h }, { bw, bh }) => ({ x: clamp(x * w - bw / 2, b.x0, b.x1), y: clamp(y * h - bh / 2, b.y0, b.y1) });
    // Where the centre sits, for a top-left corner.
    C.centreOf = (point, { w, h }, { bw, bh }) => ({ x: clamp((point.x + bw / 2) / w, 0, 1), y: clamp((point.y + bh / 2) / h, 0, 1) });
    C.textAlign = (config, motion) => {
        if (config.align !== 'auto') return config.align;
        if (motion !== 'static' || config.anchor === 'custom') return 'center';
        return /left/.test(config.anchor) ? 'left' : /right/.test(config.anchor) ? 'right' : 'center';
    };

    // Reflect an unbounded coordinate into [lo, hi], like a ball in a box.
    C.fold = (u, lo, hi) => {
        const span = hi - lo;
        if (span <= 0) return lo;
        let t = (u - lo) % (2 * span);
        if (t < 0) t += 2 * span;
        return lo + (t > span ? 2 * span - t : t);
    };

    // Bounce. The state is the unfolded position and a constant velocity, so
    // the path is exact however it's played, and a resized screen just folds
    // the same line into the new box. The angle keeps 15° or more from either
    // axis, so it never crawls along a wall.
    C.bounceStart = (b, rand, speed) => {
        const angle = (15 + rand() * 60) * Math.PI / 180;
        return { u: lerp(b.x0, b.x1, rand()), v: lerp(b.y0, b.y1, rand()), vx: Math.cos(angle) * speed * (rand() < 0.5 ? -1 : 1), vy: Math.sin(angle) * speed * (rand() < 0.5 ? -1 : 1) };
    };
    // Where it is `t` seconds after the state.
    C.bounceAt = (s, t, b) => ({ x: C.fold(s.u + s.vx * t, b.x0, b.x1), y: C.fold(s.v + s.vy * t, b.y0, b.y1) });
    // The straight run to the next wall, which the view hands to the
    // compositor as one animation (no per-frame work): { dt, from, to, hit,
    // next }. A corner is a hit on one wall while the other is within `tol`
    // px. `next` is the state to carry on from, a hair past the wall.
    C.bounceLeg = (s, b, tol = 24) => {
        const wall = (p, v, lo, span) => {
            if (span <= 0 || !v) return Infinity;
            const k = (p - lo) / span, n = v > 0 ? Math.floor(k) + 1 : Math.ceil(k) - 1;
            return (lo + n * span - p) / v;
        };
        const tx = wall(s.u, s.vx, b.x0, b.x1 - b.x0), ty = wall(s.v, s.vy, b.y0, b.y1 - b.y0);
        const dt = Math.min(tx, ty, 30);
        const from = C.bounceAt(s, 0, b), to = C.bounceAt(s, dt, b);
        const hitX = tx <= dt + 1e-9, hitY = ty <= dt + 1e-9;
        const near = (p, lo, hi) => Math.min(p - lo, hi - p) < tol;
        const corner = (hitX && hitY) || (hitX && near(to.y, b.y0, b.y1)) || (hitY && near(to.x, b.x0, b.x1));
        return { dt, from, to, hit: { x: hitX, y: hitY, corner }, next: { ...s, u: s.u + s.vx * (dt + 1e-6), v: s.v + s.vy * (dt + 1e-6) } };
    };

    // Drift: a path through the unit square as a function of time (seconds).
    // `wander` is two sines whose periods are never in a whole ratio, so it
    // never quite repeats; one pass of the screen takes about a minute.
    C.DRIFT_PATHS = ['wander', 'orbit', 'figure8'];
    C.driftPoint = (path, t) => {
        const tau = 2 * Math.PI;
        switch (path) {
            case 'orbit': return { u: 0.5 + 0.5 * Math.cos(tau * t / 150), v: 0.5 + 0.5 * Math.sin(tau * t / 150) };
            case 'figure8': return { u: 0.5 + 0.5 * Math.sin(tau * t / 140), v: 0.5 + 0.5 * Math.sin(2 * tau * t / 140) };
            default: return { u: 0.5 + 0.5 * Math.sin(tau * t / 120), v: 0.5 + 0.5 * Math.sin(tau * t / 74.2 + 1.3) };
        }
    };

    // The path sampled once a `step` of its own time for `n` steps from t0, as
    // keyframes for the compositor. Gentle curves, so chords are close enough.
    C.driftFrames = (path, t0, step, n) => Array.from({ length: n + 1 }, (_, k) => C.driftPoint(path, t0 + k * step));

    // Follow: ease towards a target, the same distance at any frame rate.
    C.stepFollow = (s, dt, target, speed) => {
        const k = 1 - Math.exp(-dt * 5 * speed);
        return { x: s.x + (target.x - s.x) * k, y: s.y + (target.y - s.y) * k };
    };

    // Teleport: one of nine cells other than the last, with some jitter.
    C.pickCell = (last, rand) => {
        const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(cell => cell !== last);
        return cells[Math.floor(rand() * cells.length)];
    };
    C.cellPoint = (cell, b, rand) => {
        const jitter = (rand() - 0.5) * 0.3;
        return C.at(b, clamp((cell % 3 + 0.5 + jitter) / 3, 0, 1), clamp((Math.floor(cell / 3) + 0.5 + (rand() - 0.5) * 0.3) / 3, 0, 1));
    };
    C.cellOf = (point, b) => {
        const fx = b.x1 > b.x0 ? (point.x - b.x0) / (b.x1 - b.x0) : 0.5, fy = b.y1 > b.y0 ? (point.y - b.y0) / (b.y1 - b.y0) : 0.5;
        return Math.min(2, Math.floor(fy * 3)) * 3 + Math.min(2, Math.floor(fx * 3));
    };
    // Until the next jump: a number of seconds, or the next whole minute.
    C.teleportDelay = (every, date) => every === 'minute' ? 60000 - (date.getTime() % 60000) + 30 : Number(every) * 1000;

    // ---- Night -------------------------------------------------------------
    C.parseHM = (text, fallback) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
        return !m || +m[1] > 23 || +m[2] > 59 ? fallback : +m[1] * 60 + +m[2];
    };
    // Is a minute of the day inside from → to, which may wrap past midnight?
    C.inNight = (minute, from, to) => from === to ? false : from < to ? minute >= from && minute < to : minute >= from || minute < to;

    // ---- Settings that can't be trusted ---------------------------------
    // Storage is anyone's to edit. Whatever the config holds, hand back one
    // that fits the schema: ranges clamped and snapped, selects from their
    // options, colours as #rrggbb.
    C.sanitize = (config, defaults, schema) => {
        const out = { ...defaults };
        for (const control of schema) {
            if (!control.key || control.derived) continue;
            const fallback = defaults[control.key];
            let value = config?.[control.key];
            switch (control.type) {
                case 'range': {
                    value = Number.isFinite(+value) && value !== null && value !== '' ? clamp(+value, control.min, control.max) : fallback;
                    value = +(Math.round((value - control.min) / control.step) * control.step + control.min).toFixed(6);
                    break;
                }
                case 'select': {
                    const options = typeof control.options === 'function' ? control.options(out) : control.options;
                    if (!options.some(([option]) => option === value)) value = fallback;
                    break;
                }
                case 'toggle': if (typeof value !== 'boolean') value = fallback; break;
                case 'multi': value = Array.isArray(value) ? control.options.map(([option]) => option).filter(option => value.includes(option)) : fallback; break;
                case 'color': if (!/^#[0-9a-f]{6}$/i.test(value)) value = fallback; else value = value.toLowerCase(); break;
                case 'number': value = Number.isFinite(+value) && value !== null ? clamp(+value, control.min ?? -Infinity, control.max ?? Infinity) : fallback; break;
                default: value = typeof value === 'string' ? value.slice(0, control.max ?? 60) : fallback;
            }
            out[control.key] = value;
        }
        return out;
    };

    if (typeof module !== 'undefined') module.exports = C;
})(globalThis.WP = globalThis.WP || {});
