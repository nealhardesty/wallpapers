// Advent Calendar Animation Module
//
// A month-long advent calendar wallpaper. Every month gets a calendar that
// starts on the 1st; each day's door swings open by itself when that day
// arrives and reveals a little looping animation (the "treat"). Holidays get
// a big star door, and holiday months can switch the whole calendar to a
// holiday theme.
//
// The content -- the drawing kit, the treats, holiday dates and themes --
// lives in advent-treats.js. This file is the engine:
//
//   month model   which doors exist, where they sit, which treat is behind each
//   layout        packs the doors into a grid that fits the window
//   painting      scene backdrop and calendar frame are cached offscreen; doors,
//                 treats, particles and the opening ceremony draw live
//   interaction   document-level listeners, like the fish tank, so the
//                 homepage widgets on top keep working
//   spotlight     clicking an open door replays its treat full size
//
// Open treats are rendered into small per-door canvases on a round-robin so
// a month of doors stays cheap; today's door and the one under the cursor
// always render at full rate.

class AdventCalendarAnimationManager {
    constructor(host) {
        this.host = host;
        this.canvas = null;
        this.ctx = null;
        this.isEnabled = false;
        this.animationId = null;

        this.w = 0;
        this.h = 0;
        this.dpr = 1;
        this.time = 0;
        this.lastFrame = 0;
        this.clockStart = performance.now();

        this.model = null;          // the current month
        this.layoutInfo = null;
        this.bgCanvas = null;       // scene backdrop
        this.boardCanvas = null;    // frame, board and door recesses
        this.particles = [];
        this.bursts = [];           // sparkle bursts from opening doors
        this.bubbles = [];          // "not yet!" speech bubbles
        this.queue = [];            // scheduled door openings
        this.hoverDoor = null;
        this.listeners = [];
        this.spotlight = null;
        this.lastDateKey = '';
        this.lastDateCheck = 0;
        this.renderCursor = 0;

        // Time travel for previews: days added to the real date
        this.dayOffset = 0;

        this.config = WP.settings.load();
    }

    saveConfig() {
        WP.settings.save(this.config);
    }

    // Calendar state that isn't a setting, kept by the host under
    // wp:advent:<key> so it can't collide with other wallpapers.
    storageGet(key) {
        return this.host.storage.get(key);
    }

    storageSet(key, value) {
        this.host.storage.set(key, value);
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    async init() {
        this.createCanvas();
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'advent-canvas';
        this.canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:-1;display:none;';
        this.ctx = this.canvas.getContext('2d');
        document.body.appendChild(this.canvas);

        this._onResize = () => {
            this.resizeCanvas();
            if (this.isEnabled) this.relayout();
        };
        window.addEventListener('resize', this._onResize);
        this.resizeCanvas();
    }

    resizeCanvas() {
        if (!this.canvas) return;
        this.w = window.innerWidth;
        this.h = window.innerHeight;
        const native = Math.min(window.devicePixelRatio || 1, 2);
        this.dpr = this.config.quality === 'balanced' ? Math.min(native, 1.25) : native;
        this.canvas.width = Math.round(this.w * this.dpr);
        this.canvas.height = Math.round(this.h * this.dpr);
    }

    start() {
        if (this.isEnabled) return;
        this.isEnabled = true;
        this.canvas.style.display = 'block';
        this.resizeCanvas();
        this.rebuild(true);
        this.setupInteraction();
        this.lastFrame = 0;
        this.animate();
        console.log('Advent calendar started');
    }

    stop() {
        if (!this.isEnabled) return;
        this.isEnabled = false;
        this.canvas.style.display = 'none';
        this.teardownInteraction();
        this.closeSpotlight(true);
        document.body.style.cursor = '';
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('Advent calendar stopped');
    }

    destroy() {
        this.stop();
        if (this._onResize) window.removeEventListener('resize', this._onResize);
        if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
        this.canvas = null;
    }

    // -----------------------------------------------------------------------
    // Dates
    // -----------------------------------------------------------------------

    now() {
        const d = new Date();
        if (this.dayOffset) d.setDate(d.getDate() + this.dayOffset);
        return d;
    }

    static dateKey(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // ?date=YYYY-MM-DD time-travels; ?theme=<id> picks this month's theme.
    // Called before init() (catalog prepare hook).
    applyParams(params) {
        const date = AdventCalendarAnimationManager.parseKey(params.date);
        if (date) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            this.dayOffset = Math.round((date - today) / 86400000);
        }
        if (params.theme && ADVENT_THEMES.some(t => t.id === params.theme)) {
            // For this visit only: kept out of config, so it's never saved.
            this.themeOverride = { month: this.now().getMonth() + 1, id: params.theme };
        }
    }

    static parseKey(key) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
        return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
    }

    // Jump the calendar n days (used by the standalone page's arrow keys)
    shiftDays(n) {
        this.dayOffset += n;
        this.rebuild(false);
    }

    setDate(date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        this.dayOffset = Math.round((target - today) / 86400000);
        this.rebuild(false);
    }

    // -----------------------------------------------------------------------
    // Month model
    // -----------------------------------------------------------------------

    themesForMonth(year, month, holidays) {
        const keys = new Set(holidays.map(h => h.key));
        const holidayThemes = ADVENT_THEMES.filter(t => t.holiday && t.holiday.some(k => keys.has(k)));
        const seasonal = ADVENT_THEMES.filter(t => !t.holiday && t.months.includes(month));
        return { holidayThemes, seasonal };
    }

    pickTheme(year, month, holidays) {
        const choice = this.themeOverride?.month === month ? this.themeOverride.id : this.config.themeByMonth[month];
        if (choice && choice !== 'auto') {
            const t = ADVENT_THEMES.find(x => x.id === choice);
            if (t) return t;
        }
        const { holidayThemes, seasonal } = this.themesForMonth(year, month, holidays);
        if (this.config.holidayThemes && holidayThemes.length) {
            for (const key of AdventHolidays.PRIORITY) {
                const t = holidayThemes.find(x => x.holiday.includes(key));
                if (t) return t;
            }
            return holidayThemes[0];
        }
        // Month-specific themes come first so the evergreen moon and space
        // themes only turn up on the years they rotate in
        const specific = seasonal.filter(t => t.months.length < 12);
        const pool = specific.length ? specific.concat(seasonal.filter(t => t.months.length === 12)) : seasonal;
        return pool[(year + month) % pool.length];
    }

    rebuild(initial) {
        const today = this.now();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const day = today.getDate();
        const daysInMonth = new Date(year, month, 0).getDate();
        const holidays = AdventHolidays.forMonth(year, month);
        const theme = this.pickTheme(year, month, holidays);
        const sameMonth = this.model && this.model.year === year && this.model.month === month && this.model.theme === theme && this.model.layout === this.config.layout;

        this.lastDateKey = AdventCalendarAnimationManager.dateKey(today);

        if (!sameMonth) {
            this.model = this.buildModel(year, month, daysInMonth, holidays, theme);
            this.relayout();
        }
        this.model.today = day;
        this.syncDoors(initial);
    }

    buildModel(year, month, daysInMonth, holidays, theme) {
        const seed = year * 37 + month * 101;
        const rng = advRng(seed);
        const holidayByDay = new Map(holidays.map(h => [h.day, h]));

        // Deal the theme's treats out so a repeat is at least a pool-length away
        const pool = theme.treats.slice();
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        const doors = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const hol = this.config.holidayStars ? holidayByDay.get(d) : null;
            const treat = hol ? hol.star : pool[(d - 1) % pool.length];
            doors.push({
                day: d,
                holiday: hol || null,
                treatId: treat[0],
                params: treat[1] || {},
                caption: hol && hol.caption ? hol.caption : null,
                color: theme.pal.door[(d * 7 + month) % theme.pal.door.length],
                seed: d * 13.7 + month * 3.1 + year * 0.01,
                span: hol && this.config.layout === 'scatter' ? hol.size.slice() : [1, 1],
                open: false,
                openK: 0,
                opening: false,
                openStart: 0,
                openedAt: 0,
                hoverK: 0,
                jiggleAt: -10,
                cache: null,
                cacheTime: -1
            });
        }

        return {
            year, month, daysInMonth, holidays, theme, doors,
            layout: this.config.layout,
            today: 1,
            seed
        };
    }

    // Decide which doors are open. On the first build after load, doors since
    // the last visit can pop open one after another, then today's door gets
    // its ceremony.
    syncDoors(initial) {
        const m = this.model;
        const now = this.time;
        const todayKey = this.lastDateKey;
        const celebrated = this.storageGet('adventCelebrated');
        const lastSeen = AdventCalendarAnimationManager.parseKey(this.storageGet('adventLastSeen'));
        const ceremony = this.config.ceremony;
        this.queue = [];

        let catchFrom = m.today;
        if (initial && this.config.catchUp && lastSeen && !this.dayOffset) {
            const ls = lastSeen;
            if (ls.getFullYear() === m.year && ls.getMonth() + 1 === m.month && ls.getDate() < m.today) {
                catchFrom = ls.getDate() + 1;
            }
        }

        for (const door of m.doors) {
            if (door.day < m.today) {
                if (door.day >= catchFrom && !door.open) {
                    door.open = false;
                    door.openK = 0;
                } else if (!door.open) {
                    door.open = true;
                    door.openK = 1;
                    door.openedAt = now - 20 - door.seed % 9;
                }
            } else if (door.day > m.today) {
                door.open = false;
                door.opening = false;
                door.openK = 0;
                door.cache = null;
            }
        }

        // Missed days pop open in order, a beat apart
        let at = now + 0.6;
        for (const door of m.doors) {
            if (door.day >= catchFrom && door.day < m.today && !door.open) {
                this.queue.push({ door, at, grand: false });
                at += 0.32;
            }
        }

        const todayDoor = m.doors[m.today - 1];
        if (!todayDoor.open && !todayDoor.opening) {
            const fresh = celebrated !== todayKey || this.dayOffset;
            if (ceremony === 'quiet' || (!fresh && ceremony !== 'click')) {
                todayDoor.open = true;
                todayDoor.openK = 1;
                todayDoor.openedAt = now - 3;
            } else if (ceremony === 'click') {
                todayDoor.waiting = true;
            } else {
                this.queue.push({ door: todayDoor, at: at + 0.5, grand: true });
            }
        }

        if (!this.dayOffset) this.storageSet('adventLastSeen', todayKey);
    }

    // -----------------------------------------------------------------------
    // Layout
    // -----------------------------------------------------------------------

    relayout() {
        if (!this.model) return;
        const m = this.model;
        const theme = m.theme;
        const margin = Math.max(14, Math.min(this.w, this.h) * 0.035);
        const bottomPad = this.host.insets.bottom;
        const area = { x: margin, y: margin, w: this.w - margin * 2, h: this.h - margin * 2 - bottomPad };

        const isHouse = theme.frame === 'house';
        const roofH = isHouse ? Math.max(60, Math.min(area.h * 0.17, 150)) : 0;
        const frameW = Math.round(advClamp(Math.min(area.w, area.h) * 0.03, 10, 26));
        const headerH = isHouse ? 0 : Math.round(advClamp(area.h * 0.12, 56, 120));
        const weekH = m.layout === 'week' ? Math.round(advClamp(area.h * 0.03, 16, 28)) : 0;

        const gridArea = {
            x: area.x + frameW * 1.6,
            y: area.y + roofH + headerH + frameW * (isHouse ? 1.2 : 0.6) + weekH,
            w: area.w - frameW * 3.2,
            h: area.h - roofH - headerH - weekH - frameW * (isHouse ? 2.6 : 2.0)
        };

        const packed = this.packGrid(m, gridArea);
        const { cols, rows, cell, cellW, cellH } = packed;
        const gridW = cols * cellW, gridH = rows * cellH;

        // Shrink the board around the packed grid and centre it
        const boardW = gridW + frameW * 3.2;
        const boardH = gridH + headerH + weekH + frameW * (isHouse ? 2.6 : 2.0);
        const totalH = boardH + roofH;
        const bx = Math.round(area.x + (area.w - boardW) / 2);
        const by = Math.round(area.y + (area.h - totalH) / 2 + roofH);
        const gx = bx + frameW * 1.6;
        const gy = by + headerH + frameW * (isHouse ? 1.2 : 0.6) + weekH;

        const gap = Math.max(3, Math.min(cellW, cellH) * 0.1);
        for (const door of m.doors) {
            const p = door.place;
            door.rect = {
                x: gx + p.col * cellW + gap / 2,
                y: gy + p.row * cellH + gap / 2,
                w: p.w * cellW - gap,
                h: p.h * cellH - gap
            };
            door.cache = null;
        }
        for (const d of packed.decor) {
            d.rect = { x: gx + d.col * cellW + gap / 2, y: gy + d.row * cellH + gap / 2, w: cellW - gap, h: cellH - gap };
        }

        this.layoutInfo = {
            board: { x: bx, y: by, w: boardW, h: boardH },
            roofH, frameW, headerH, weekH,
            grid: { x: gx, y: gy, w: gridW, h: gridH, cols, rows, cellW, cellH, cell, gap },
            decor: packed.decor,
            weekOffset: packed.weekOffset || 0
        };

        this.paintBackdrop();
        this.paintBoard();
        this.seedParticles();
    }

    // Choose a column count and place every door. Returns grid geometry plus
    // any leftover cells, which become decorative tiles.
    packGrid(m, area) {
        const doors = m.doors;
        const mode = m.layout;
        let best = null;

        if (mode === 'week') {
            const first = new Date(m.year, m.month - 1, 1).getDay();
            const cols = 7;
            const rows = Math.ceil((first + m.daysInMonth) / 7);
            const cellW = area.w / cols, cellH = area.h / rows;
            const sz = this.clampCell(cellW, cellH);
            const decor = [];
            for (let i = 0; i < rows * cols; i++) {
                const d = i - first + 1;
                if (d >= 1 && d <= m.daysInMonth) {
                    doors[d - 1].place = { col: i % 7, row: Math.floor(i / 7), w: 1, h: 1 };
                } else {
                    decor.push({ col: i % 7, row: Math.floor(i / 7), kind: i % 3 });
                }
            }
            return { cols, rows, cellW: sz[0], cellH: sz[1], cell: Math.min(sz[0], sz[1]), decor, weekOffset: first };
        }

        const units = doors.reduce((n, d) => n + d.span[0] * d.span[1], 0);
        for (let cols = 4; cols <= 14; cols++) {
            const rows = Math.ceil(units / cols);
            if (rows < 2) continue;
            const [cw, ch] = this.clampCell(area.w / cols, area.h / rows);
            const slack = cols * rows - units;
            // Prefer big doors, then fewer empty tiles
            const score = Math.min(cw, ch) * (1 - slack / (cols * rows) * 0.35);
            if (!best || score > best.score) best = { cols, rows, cellW: cw, cellH: ch, score };
        }

        const { cols } = best;
        let { rows } = best;
        const rng = advRng(m.seed + (mode === 'scatter' ? 7 : 3));

        for (let attempt = 0; attempt < 4; attempt++) {
            const placed = this.tryPlace(doors, cols, rows, mode, rng);
            if (placed) {
                const [cw, ch] = this.clampCell(area.w / cols, area.h / rows);
                return { cols, rows, cellW: cw, cellH: ch, cell: Math.min(cw, ch), decor: placed };
            }
            rows++;
        }
        // Give up on star doors rather than fail to draw anything
        doors.forEach(d => { d.span = [1, 1]; });
        const placed = this.tryPlace(doors, cols, rows, 'ordered', rng);
        const [cw, ch] = this.clampCell(area.w / cols, area.h / rows);
        return { cols, rows, cellW: cw, cellH: ch, cell: Math.min(cw, ch), decor: placed || [] };
    }

    // Doors may be a little taller or wider than square, but not much
    clampCell(cw, ch) {
        const maxAspect = 1.35;
        if (cw > ch * maxAspect) cw = ch * maxAspect;
        if (ch > cw * maxAspect) ch = cw * maxAspect;
        return [cw, ch];
    }

    tryPlace(doors, cols, rows, mode, rng) {
        const grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
        const free = (c, r, w, h) => {
            if (c + w > cols || r + h > rows) return false;
            for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (grid[y][x]) return false;
            return true;
        };
        const mark = (c, r, w, h, v) => { for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) grid[y][x] = v; };

        if (mode === 'ordered') {
            let i = 0;
            for (const door of doors) {
                door.span = [1, 1];
                door.place = { col: i % cols, row: Math.floor(i / cols), w: 1, h: 1 };
                i++;
            }
            const decor = [];
            for (; i < cols * rows; i++) decor.push({ col: i % cols, row: Math.floor(i / cols), kind: i % 3 });
            return decor;
        }

        // Star doors first, spread across the board
        const stars = doors.filter(d => d.span[0] * d.span[1] > 1);
        for (const door of stars) {
            const [w, h] = door.span;
            let ok = false;
            for (let tries = 0; tries < 200 && !ok; tries++) {
                const c = Math.floor(rng() * (cols - w + 1));
                const r = Math.floor(rng() * (rows - h + 1));
                if (free(c, r, w, h)) {
                    mark(c, r, w, h, door);
                    door.place = { col: c, row: r, w, h };
                    ok = true;
                }
            }
            if (!ok) return null;
        }

        // Every remaining cell becomes a slot. Spare cells merge into the odd
        // wide or tall door, which is what makes a real advent calendar look
        // hand-made; anything still spare becomes a decorative tile.
        const singles = doors.filter(d => d.span[0] * d.span[1] === 1);
        let spare = cols * rows - stars.reduce((n, d) => n + d.span[0] * d.span[1], 0) - singles.length;
        const slots = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c]) continue;
                let w = 1, h = 1;
                if (spare > 0 && rng() < 0.5) {
                    if (rng() < 0.5 && free(c + 1, r, 1, 1) && c + 1 < cols) { w = 2; }
                    else if (free(c, r + 1, 1, 1) && r + 1 < rows) { h = 2; }
                    if (w * h > 1) spare--;
                }
                const slot = { col: c, row: r, w, h };
                mark(c, r, w, h, slot);
                slots.push(slot);
            }
        }

        // Deal the single doors onto random slots; leftovers are decor
        for (let i = slots.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [slots[i], slots[j]] = [slots[j], slots[i]];
        }
        if (slots.length < singles.length) return null;
        singles.forEach((door, i) => { door.place = slots[i]; });
        return slots.slice(singles.length).map((s, i) => ({ col: s.col, row: s.row, kind: i % 3, w: s.w, h: s.h }));
    }

    // -----------------------------------------------------------------------
    // Scene backdrop (cached)
    // -----------------------------------------------------------------------

    makeLayer(w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * this.dpr));
        c.height = Math.max(1, Math.round(h * this.dpr));
        const ctx = c.getContext('2d');
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        return [c, ctx];
    }

    paintBackdrop() {
        const [c, ctx] = this.makeLayer(this.w, this.h);
        this.bgCanvas = c;
        const scene = this.model.theme.scene;
        const W = this.w, H = this.h;
        const rng = advRng(this.model.seed + 11);

        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, scene.sky[0]);
        g.addColorStop(1, scene.sky[1]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        const dark = this.isDark(scene.sky[0]);
        if (dark) {
            for (let i = 0; i < W * H / 5000; i++) {
                ctx.globalAlpha = 0.3 + rng() * 0.6;
                AdvArt.circle(ctx, rng() * W, rng() * H * 0.75, 0.5 + rng() * 1.1, '#fff8e0');
            }
            ctx.globalAlpha = 1;
        }

        const S = Math.min(W, H);
        switch (scene.celestial) {
            case 'moon': AdvArt.moon(ctx, W * 0.86, H * 0.14, S * 0.06, 0, {}); break;
            case 'crescent': AdvArt.moon(ctx, W * 0.85, H * 0.16, S * 0.08, 0, { crescent: true, face: true }); break;
            case 'harvestmoon': AdvArt.moon(ctx, W * 0.82, H * 0.2, S * 0.12, 0, { color: '#ffc46a' }); break;
            case 'sun': {
                const sg = ctx.createRadialGradient(W * 0.12, H * 0.12, 0, W * 0.12, H * 0.12, S * 0.35);
                sg.addColorStop(0, 'rgba(255,240,180,0.85)');
                sg.addColorStop(0.25, 'rgba(255,230,150,0.35)');
                sg.addColorStop(1, 'rgba(255,230,150,0)');
                ctx.fillStyle = sg;
                ctx.fillRect(0, 0, W, H);
                AdvArt.circle(ctx, W * 0.12, H * 0.12, S * 0.05, '#fff2b0');
                break;
            }
            case 'planets': {
                const planets = [[0.1, 0.18, 0.06, '#ff9a76'], [0.9, 0.7, 0.09, '#7fc8f8'], [0.82, 0.12, 0.03, '#c99bff'], [0.18, 0.85, 0.04, '#9be37a']];
                for (const [px, py, pr, col] of planets) {
                    AdvArt.circle(ctx, W * px, H * py, S * pr, col);
                    ctx.globalAlpha = 0.25;
                    AdvArt.circle(ctx, W * px - S * pr * 0.3, H * py - S * pr * 0.3, S * pr * 0.5, '#ffffff');
                    ctx.globalAlpha = 1;
                    if (pr > 0.05) {
                        ctx.beginPath();
                        ctx.ellipse(W * px, H * py, S * pr * 1.7, S * pr * 0.4, -0.3, 0, advTAU);
                        ctx.strokeStyle = 'rgba(255,220,120,0.7)'; ctx.lineWidth = S * 0.006; ctx.stroke();
                    }
                }
                break;
            }
            case 'rainbow': {
                ctx.save();
                ctx.globalAlpha = 0.55;
                AdvArt.rainbow(ctx, W * 0.5, H * 1.05, Math.max(W, H) * 0.7, S * 0.025, 1);
                ctx.restore();
                break;
            }
        }

        if (scene.underwater) {
            ctx.globalAlpha = 0.12;
            for (let i = 0; i < 7; i++) {
                const x = rng() * W;
                ctx.beginPath();
                ctx.moveTo(x, 0); ctx.lineTo(x + W * 0.05, 0); ctx.lineTo(x + W * 0.2, H); ctx.lineTo(x + W * 0.1, H); ctx.closePath();
                ctx.fillStyle = '#ffffff'; ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#e8d29a';
            ctx.beginPath();
            ctx.moveTo(0, H);
            for (let x = 0; x <= W; x += 40) ctx.lineTo(x, H * 0.9 + Math.sin(x * 0.01) * 10);
            ctx.lineTo(W, H);
            ctx.fill();
        }

        if (scene.props === 'beach') {
            ctx.fillStyle = '#3fa8e0';
            ctx.fillRect(0, H * 0.62, W, H * 0.4);
            ctx.fillStyle = '#f3d7a0';
            ctx.beginPath();
            ctx.moveTo(0, H);
            for (let x = 0; x <= W; x += 30) ctx.lineTo(x, H * 0.8 + Math.sin(x * 0.008) * 14);
            ctx.lineTo(W, H);
            ctx.fill();
        }

        // Rolling hills, back then front
        if (scene.hills) {
            scene.hills.forEach((col, layer) => {
                const base = H * (0.7 + layer * 0.12);
                const amp = H * (0.06 - layer * 0.02);
                const ph = rng() * 10;
                ctx.beginPath();
                ctx.moveTo(0, H);
                for (let x = 0; x <= W + 20; x += 20) {
                    ctx.lineTo(x, base - Math.sin(x / W * Math.PI * (2 + layer) + ph) * amp - Math.sin(x / W * 13 + ph) * amp * 0.15);
                }
                ctx.lineTo(W, H);
                ctx.closePath();
                ctx.fillStyle = col;
                ctx.fill();
                this.paintProps(ctx, scene, layer, base, amp, ph, rng);
            });
        } else {
            this.paintProps(ctx, scene, 1, H * 0.9, 0, 0, rng);
        }
    }

    paintProps(ctx, scene, layer, base, amp, ph, rng) {
        const W = this.w, H = this.h;
        const S = Math.min(W, H);
        const yAt = (x) => base - Math.sin(x / W * Math.PI * (2 + layer) + ph) * amp - Math.sin(x / W * 13 + ph) * amp * 0.15;
        const n = Math.round(W / (layer ? 90 : 140));
        const sc = layer ? 1 : 0.7;
        for (let i = 0; i < n; i++) {
            const x = (i + rng() * 0.8) * (W / n);
            const y = yAt(x) + 4;
            const r = rng();
            ctx.save();
            ctx.globalAlpha = layer ? 1 : 0.85;
            switch (scene.props) {
                case 'pines': AdvArt.pine(ctx, x, y, S * (0.07 + r * 0.05) * sc, layer ? '#3f8f5a' : '#5a8a7a', !!scene.snowy); break;
                case 'igloos':
                    if (r < 0.25) {
                        ctx.beginPath(); ctx.arc(x, y, S * 0.04 * sc, Math.PI, 0); ctx.fillStyle = '#ffffff'; ctx.fill();
                        AdvArt.ink(ctx, 1, '#a9c8e8');
                        ctx.beginPath(); ctx.arc(x, y, S * 0.014 * sc, Math.PI, 0); ctx.fillStyle = '#5a7aa8'; ctx.fill();
                    } else if (r < 0.5) AdvArt.pine(ctx, x, y, S * 0.05 * sc, '#5a9a8a', true);
                    break;
                case 'cabins':
                    if (r < 0.3) {
                        const s = S * 0.035 * sc;
                        ctx.fillStyle = '#8a5a3c'; ctx.fillRect(x - s, y - s * 1.2, s * 2, s * 1.2);
                        ctx.beginPath(); ctx.moveTo(x - s * 1.3, y - s * 1.1); ctx.lineTo(x, y - s * 2.1); ctx.lineTo(x + s * 1.3, y - s * 1.1); ctx.closePath();
                        ctx.fillStyle = '#ffffff'; ctx.fill();
                        ctx.fillStyle = '#ffd98a'; ctx.fillRect(x - s * 0.5, y - s * 0.8, s * 0.5, s * 0.4);
                    } else AdvArt.pine(ctx, x, y, S * (0.06 + r * 0.04) * sc, '#2f6a4a', true);
                    break;
                case 'candy':
                    if (r < 0.4) {
                        AdvArt.line(ctx, x, y, x, y - S * 0.06 * sc, '#ffffff', 3);
                        AdvArt.circle(ctx, x, y - S * 0.07 * sc, S * 0.025 * sc, ['#ff6b8b', '#7fd8be', '#ffd447'][i % 3]);
                    } else if (r < 0.7) AdvArt.candyCane(ctx, x, y - S * 0.03 * sc, S * 0.06 * sc, 0.2);
                    else AdvArt.pine(ctx, x, y, S * 0.06 * sc, '#7fd8be', true);
                    break;
                case 'puddles':
                    if (r < 0.3) AdvArt.ellipse(ctx, x, y + 6, S * 0.03, S * 0.006, 'rgba(120,170,220,0.6)');
                    else if (r < 0.6) AdvArt.flower(ctx, x, y - 4, S * 0.008, '#ffd447', '#ffffff');
                    break;
                case 'blossoms':
                    if (r < 0.45) {
                        const s = S * (0.05 + r * 0.04) * sc;
                        AdvArt.line(ctx, x, y, x, y - s, '#7a5236', s * 0.16);
                        for (let k = 0; k < 5; k++) AdvArt.circle(ctx, x + Math.cos(k * 1.3) * s * 0.5, y - s - Math.sin(k * 1.7) * s * 0.35, s * 0.42, k % 2 ? '#ffc0d6' : '#ffd6e5');
                    }
                    break;
                case 'flowers':
                    for (let k = 0; k < 3; k++) AdvArt.flower(ctx, x + k * 12, y - 2 + (k % 2) * 6, S * 0.007 * (layer + 1), ['#ff8fb8', '#ffd447', '#ffffff', '#c99bff'][(i + k) % 4], '#ffb347');
                    break;
                case 'clouds':
                    if (layer === 0 && r < 0.5) AdvArt.cloud(ctx, x, H * (0.15 + r * 0.3), S * 0.12, 'rgba(255,255,255,0.85)');
                    break;
                case 'tents':
                    if (r < 0.2) {
                        const s = S * 0.04 * sc;
                        ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x, y - s * 1.3); ctx.lineTo(x + s, y); ctx.closePath();
                        ctx.fillStyle = ['#e8743a', '#5a9ad8'][i % 2]; ctx.fill();
                        ctx.beginPath(); ctx.moveTo(x - s * 0.25, y); ctx.lineTo(x, y - s * 0.7); ctx.lineTo(x + s * 0.25, y); ctx.fillStyle = '#ffd98a'; ctx.fill();
                    } else AdvArt.pine(ctx, x, y, S * (0.07 + r * 0.05) * sc, '#1f4a32');
                    break;
                case 'seaweed':
                    if (layer && r < 0.6) {
                        ctx.beginPath(); ctx.moveTo(x, H);
                        for (let k = 1; k < 8; k++) ctx.lineTo(x + Math.sin(k) * 8, H - k * S * 0.03);
                        ctx.strokeStyle = ['#2f9e6a', '#4fb878'][i % 2]; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();
                    }
                    break;
                case 'sprinkles':
                    for (let k = 0; k < 4; k++) AdvArt.line(ctx, x + k * 9, y - 10 - k * 5, x + k * 9 + 5, y - 8 - k * 5, ['#ff8fb8', '#8fd3a8', '#ffd447', '#c99bff'][k], 3);
                    break;
                case 'appletrees':
                case 'autumntrees': {
                    if (r < 0.55) {
                        const s = S * (0.05 + r * 0.04) * sc;
                        AdvArt.line(ctx, x, y, x, y - s, '#7a5236', s * 0.18);
                        const leaf = scene.props === 'appletrees' ? '#5cae4a' : ['#e8743a', '#d9a03a', '#c94f3a'][i % 3];
                        AdvArt.circle(ctx, x, y - s * 1.2, s * 0.65, leaf);
                        AdvArt.circle(ctx, x - s * 0.4, y - s * 0.95, s * 0.45, leaf);
                        AdvArt.circle(ctx, x + s * 0.4, y - s * 0.95, s * 0.45, leaf);
                        if (scene.props === 'appletrees') for (let k = 0; k < 4; k++) AdvArt.circle(ctx, x + Math.cos(k * 1.7) * s * 0.45, y - s * 1.1 + Math.sin(k * 2.3) * s * 0.35, s * 0.08, '#e8434f');
                    }
                    break;
                }
                case 'pumpkins':
                    if (r < 0.45) AdvArt.pumpkin(ctx, x, y - S * 0.012, S * 0.016 * (layer + 1), { color: i % 3 ? '#f28c28' : '#f2a03d' });
                    break;
                case 'city': {
                    const bw = W / n;
                    const bh = S * (0.12 + r * 0.18) * (layer ? 0.7 : 1);
                    ctx.fillStyle = layer ? '#141833' : '#1f2448';
                    ctx.fillRect(i * bw, base - bh + amp, bw * 0.9, bh + H);
                    for (let wy = base - bh + amp + 8; wy < H; wy += 14) {
                        for (let wx = i * bw + 6; wx < i * bw + bw * 0.8; wx += 12) {
                            if (rng() < 0.35) { ctx.fillStyle = 'rgba(255,220,130,0.7)'; ctx.fillRect(wx, wy, 5, 6); }
                        }
                    }
                    break;
                }
                case 'lanterns':
                    if (layer === 0) {
                        AdvArt.lantern(ctx, x, H * 0.08 + Math.sin(i) * 12, S * 0.02, '#e8384f', 0, 0.8);
                    } else if (r < 0.3) {
                        ctx.fillStyle = '#2a0f1f';
                        ctx.fillRect(x - 10, y - S * 0.06, 20, S * 0.06);
                        ctx.beginPath(); ctx.moveTo(x - 16, y - S * 0.06); ctx.quadraticCurveTo(x, y - S * 0.09, x + 16, y - S * 0.06); ctx.fill();
                    }
                    break;
                case 'clovers':
                    if (r < 0.6) AdvArt.clover(ctx, x, y - 6, S * 0.01 * (layer + 1), layer ? '#2f9a4a' : '#3fae5c', r < 0.1 ? 4 : 3);
                    break;
                case 'eggs':
                    if (r < 0.45) AdvArt.egg(ctx, x, y - S * 0.01, S * 0.012 * (layer + 1), ['#ffd1e3', '#c9f2ff', '#fff3a0', '#d9b8ff'][i % 4], ['#8fd3ff', '#ff8fb8', '#9be37a', '#ffd447'][i % 4], i);
                    break;
                case 'hearts':
                    if (r < 0.5) AdvArt.heart(ctx, x, y - S * 0.015, S * 0.012 * (layer + 1), ['#ff8fb8', '#ff6b8b', '#ffc2d6'][i % 3]);
                    break;
                case 'graveyard':
                    if (layer && r < 0.3) {
                        const s = S * 0.025;
                        AdvArt.rr(ctx, x - s * 0.5, y - s * 1.3, s, s * 1.4, s * 0.45);
                        ctx.fillStyle = '#5a5470'; ctx.fill();
                    } else if (r < 0.5) {
                        const s = S * 0.08 * sc;
                        ctx.strokeStyle = '#1a1428'; ctx.lineWidth = s * 0.08; ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(x, y); ctx.lineTo(x, y - s);
                        ctx.moveTo(x, y - s * 0.6); ctx.lineTo(x - s * 0.35, y - s * 0.95);
                        ctx.moveTo(x, y - s * 0.75); ctx.lineTo(x + s * 0.3, y - s * 1.05);
                        ctx.stroke();
                    } else if (r < 0.65) AdvArt.pumpkin(ctx, x, y - 6, S * 0.012, { face: 'jack', glow: 0.8 });
                    break;
                case 'fireworks':
                    if (layer === 0 && r < 0.4) {
                        ctx.globalAlpha = 0.6;
                        AdvArt.firework(ctx, x, H * (0.12 + r * 0.4), S * 0.05, ['#ff5d6c', '#ffffff', '#5b8cff'][i % 3], 0.5, i);
                    }
                    break;
            }
            ctx.restore();
        }
    }

    // The theme's door ink, unless the door is too pale for it to show
    doorInk(color) {
        const pal = this.model.theme.pal;
        const ink = pal.doorInk || '#ffffff';
        const lum = (hex) => { const [r, g, b] = advRgb(hex); return r * 0.299 + g * 0.587 + b * 0.114; };
        return Math.abs(lum(ink) - lum(color)) < 70 ? (lum(color) > 140 ? pal.ink : '#ffffff') : ink;
    }

    isDark(hex) {
        const [r, g, b] = advRgb(hex);
        return (r * 0.299 + g * 0.587 + b * 0.114) < 110;
    }

    // -----------------------------------------------------------------------
    // Board and frame (cached)
    // -----------------------------------------------------------------------

    paintBoard() {
        const [c, ctx] = this.makeLayer(this.w, this.h);
        this.boardCanvas = c;
        const L = this.layoutInfo;
        const theme = this.model.theme;
        const pal = theme.pal;
        const { x, y, w, h } = L.board;
        const fw = L.frameW;
        const radius = Math.min(28, fw * 1.4);

        // Drop shadow under the whole calendar
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 10;
        AdvArt.rr(ctx, x, y, w, h, radius);
        ctx.fillStyle = pal.frame;
        ctx.fill();
        ctx.restore();

        const painter = this['frame_' + theme.frame] || this.frame_felt;
        painter.call(this, ctx, L, theme);

        // Door recesses: the dark holes behind every door
        for (const door of this.model.doors) {
            const r = door.rect;
            this.paintRecess(ctx, r, Math.min(r.w, r.h) * 0.12);
        }
        for (const d of L.decor) this.paintDecor(ctx, d, theme);

        if (L.weekH) {
            const names = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
            ctx.font = `800 ${Math.round(L.weekH * 0.7)}px ${ADVENT_FONT_ROUND}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = pal.boardInk || pal.ink;
            names.forEach((n, i) => ctx.fillText(n, L.grid.x + (i + 0.5) * L.grid.cellW, L.grid.y - L.weekH * 0.55));
        }

        this.paintHeader(ctx, L, theme);
    }

    paintRecess(ctx, r, rad) {
        AdvArt.rr(ctx, r.x - 1, r.y - 1, r.w + 2, r.h + 2, rad + 1);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fill();
        AdvArt.rr(ctx, r.x, r.y, r.w, r.h, rad);
        ctx.fillStyle = '#2a1e1e';
        ctx.fill();
    }

    paintDecor(ctx, d, theme) {
        const r = d.rect;
        if (!r) return;
        const rr = Math.min(r.w, r.h);
        ctx.save();
        AdvArt.rr(ctx, r.x + rr * 0.08, r.y + rr * 0.08, r.w - rr * 0.16, r.h - rr * 0.16, rr * 0.2);
        ctx.fillStyle = advRgba(theme.pal.frame, 0.18);
        ctx.fill();
        ctx.setLineDash([rr * 0.05, rr * 0.05]);
        ctx.strokeStyle = advRgba(theme.pal.frame, 0.45);
        ctx.lineWidth = Math.max(1, rr * 0.02);
        ctx.stroke();
        ctx.setLineDash([]);
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        this.drawMotif(ctx, theme.motif, cx, cy, rr * 0.22, d.kind, theme);
        ctx.restore();
    }

    // Little decorations sprinkled around frames and on decor tiles
    drawMotif(ctx, motif, x, y, s, variant = 0, theme) {
        const acc = theme.pal.accent;
        const col = acc[variant % acc.length];
        switch (motif) {
            case 'snowflake': AdvArt.snowflake(ctx, x, y, s, '#ffffff', variant * 0.3); break;
            case 'heart': AdvArt.heart(ctx, x, y, s * 0.8, col); break;
            case 'star': AdvArt.star(ctx, x, y, s, '#ffd447', -Math.PI / 2 + variant * 0.2); break;
            case 'leaf': AdvArt.leaf(ctx, x, y, s * 1.8, variant * 0.9, ['#e8743a', '#d9a03a', '#c94f3a'][variant % 3], 'maple'); break;
            case 'flower': AdvArt.flower(ctx, x, y, s, col, '#ffd447', variant); break;
            case 'clover': AdvArt.clover(ctx, x, y - s * 0.2, s * 0.8, '#43b05c', variant === 1 ? 4 : 3); break;
            case 'shell': {
                ctx.beginPath();
                ctx.moveTo(x, y + s * 0.8);
                ctx.lineTo(x - s, y - s * 0.1);
                ctx.quadraticCurveTo(x, y - s * 1.3, x + s, y - s * 0.1);
                ctx.closePath();
                ctx.fillStyle = ['#ffc4b0', '#ffe3c4', '#ffd1e3'][variant % 3];
                ctx.fill();
                AdvArt.ink(ctx, Math.max(1, s * 0.08));
                for (let i = -2; i <= 2; i++) AdvArt.line(ctx, x, y + s * 0.7, x + i * s * 0.38, y - s * 0.55 + Math.abs(i) * s * 0.18, advRgba('#b5735a', 0.6), Math.max(0.8, s * 0.06));
                break;
            }
            case 'drop': AdvArt.drop(ctx, x, y + s * 0.3, s * 0.6, '#7fc8f8'); break;
            case 'bat': AdvArt.bat(ctx, x, y, s * 0.8, variant + 0.5, '#4a3b5c'); break;
            case 'egg': AdvArt.egg(ctx, x, y, s * 0.7, ['#ffd1e3', '#c9f2ff', '#fff3a0'][variant % 3], ['#8fd3ff', '#ff8fb8', '#9be37a'][variant % 3], variant); break;
            case 'candy': AdvArt.candyCane(ctx, x, y, s * 1.6, 0.3); break;
            case 'lantern': AdvArt.lantern(ctx, x, y, s * 0.7, '#e8384f', 0, 0.4); break;
            case 'firework': AdvArt.firework(ctx, x, y, s * 1.1, col, 0.45, variant); break;
            default: AdvArt.star(ctx, x, y, s, '#ffd447');
        }
    }

    // Sprinkle motifs along the frame band
    frameMotifs(ctx, L, theme, every) {
        const { x, y, w, h } = L.board;
        const fw = L.frameW;
        const s = fw * 0.42;
        const nx = Math.max(2, Math.round(w / every));
        const ny = Math.max(2, Math.round(h / every));
        let v = 0;
        for (let i = 1; i < nx; i++) {
            const px = x + (i / nx) * w;
            this.drawMotif(ctx, theme.motif, px, y + h - fw * 0.5, s, v++, theme);
        }
        for (let i = 1; i < ny; i++) {
            const py = y + (i / ny) * h;
            if (py < y + L.headerH + fw) continue;
            this.drawMotif(ctx, theme.motif, x + fw * 0.5, py, s, v++, theme);
            this.drawMotif(ctx, theme.motif, x + w - fw * 0.5, py, s, v++, theme);
        }
    }

    innerBoard(ctx, L, pal, inset, radius) {
        const { x, y, w, h } = L.board;
        AdvArt.rr(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, radius);
        ctx.fillStyle = pal.board;
        ctx.fill();
    }

    frame_felt(ctx, L, theme) {
        const { x, y, w, h } = L.board;
        const fw = L.frameW;
        this.innerBoard(ctx, L, theme.pal, fw, fw * 0.8);
        ctx.save();
        ctx.setLineDash([fw * 0.35, fw * 0.25]);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = Math.max(1.5, fw * 0.12);
        AdvArt.rr(ctx, x + fw * 0.45, y + fw * 0.45, w - fw * 0.9, h - fw * 0.9, fw);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        // Buttons in the corners
        for (const [cx, cy] of [[x + fw, y + fw], [x + w - fw, y + fw], [x + fw, y + h - fw], [x + w - fw, y + h - fw]]) {
            AdvArt.circle(ctx, cx, cy, fw * 0.55, theme.pal.accent[1] || '#ffd447');
            AdvArt.ink(ctx, 1.2);
            for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) AdvArt.circle(ctx, cx + dx * fw * 0.15, cy + dy * fw * 0.15, fw * 0.07, 'rgba(0,0,0,0.4)');
        }
        this.frameMotifs(ctx, L, theme, 150);
    }

    frame_paper(ctx, L, theme) {
        const { x, y, w, h } = L.board;
        const fw = L.frameW;
        // Scalloped paper edge
        const r = fw * 0.5;
        ctx.fillStyle = theme.pal.frame;
        for (let px = x + r; px < x + w; px += r * 2) {
            AdvArt.circle(ctx, px, y, r, theme.pal.frame);
            AdvArt.circle(ctx, px, y + h, r, theme.pal.frame);
        }
        for (let py = y + r; py < y + h; py += r * 2) {
            AdvArt.circle(ctx, x, py, r, theme.pal.frame);
            AdvArt.circle(ctx, x + w, py, r, theme.pal.frame);
        }
        this.innerBoard(ctx, L, theme.pal, fw * 0.8, fw * 0.4);
        // Polka dots on the inner paper
        ctx.globalAlpha = 0.08;
        for (let py = y + fw * 2; py < y + h - fw; py += fw * 1.6) {
            for (let px = x + fw * 2 + ((py / (fw * 1.6)) % 2) * fw * 0.8; px < x + w - fw; px += fw * 1.6) {
                AdvArt.circle(ctx, px, py, fw * 0.12, theme.pal.frame);
            }
        }
        ctx.globalAlpha = 1;
        // Washi tape on the corners
        for (const [cx, cy, a] of [[x + fw * 1.2, y + fw * 1.2, -0.7], [x + w - fw * 1.2, y + fw * 1.2, 0.7], [x + fw * 1.2, y + h - fw * 1.2, 0.7], [x + w - fw * 1.2, y + h - fw * 1.2, -0.7]]) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(a);
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = theme.pal.accent[0];
            ctx.fillRect(-fw * 2, -fw * 0.55, fw * 4, fw * 1.1);
            ctx.globalAlpha = 0.5;
            for (let i = -3; i <= 3; i++) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(i * fw * 0.55 - fw * 0.1, -fw * 0.55, fw * 0.2, fw * 1.1);
            }
            ctx.restore();
        }
    }

    frame_scallop(ctx, L, theme) {
        const { x, y, w, h } = L.board;
        const fw = L.frameW;
        this.innerBoard(ctx, L, theme.pal, fw * 0.4, fw * 0.6);
        // Lace trim just inside the edge
        ctx.save();
        const r = fw * 0.45;
        const lace = '#ffffff';
        const edge = (x0, y0, x1, y1, nx, ny) => {
            const len = Math.hypot(x1 - x0, y1 - y0);
            const n = Math.floor(len / (r * 2));
            for (let i = 0; i < n; i++) {
                const u = (i + 0.5) / n;
                const px = x0 + (x1 - x0) * u, py = y0 + (y1 - y0) * u;
                AdvArt.circle(ctx, px + nx * r * 0.2, py + ny * r * 0.2, r, lace);
                AdvArt.circle(ctx, px + nx * r * 0.35, py + ny * r * 0.35, r * 0.25, advRgba(theme.pal.frame, 0.5));
            }
        };
        edge(x + fw, y + fw * 0.9, x + w - fw, y + fw * 0.9, 0, 1);
        edge(x + fw, y + h - fw * 0.9, x + w - fw, y + h - fw * 0.9, 0, -1);
        edge(x + fw * 0.9, y + fw, x + fw * 0.9, y + h - fw, 1, 0);
        edge(x + w - fw * 0.9, y + fw, x + w - fw * 0.9, y + h - fw, -1, 0);
        ctx.restore();
        this.innerBoard(ctx, L, theme.pal, fw * 1.25, fw * 0.6);
        for (const [cx, cy] of [[x + fw, y + fw], [x + w - fw, y + fw], [x + fw, y + h - fw], [x + w - fw, y + h - fw]]) {
            this.drawMotif(ctx, theme.motif, cx, cy, fw * 0.8, 0, theme);
        }
    }

    frame_wood(ctx, L, theme) {
        const { x, y, w, h } = L.board;
        const fw = L.frameW;
        const wood = theme.pal.frame;
        ctx.save();
        AdvArt.rr(ctx, x, y, w, h, fw);
        ctx.clip();
        for (let i = 0; i < h / 6; i++) {
            ctx.globalAlpha = 0.18;
            const yy = y + i * 6 + Math.sin(i) * 2;
            AdvArt.line(ctx, x, yy, x + w, yy + Math.sin(i * 1.3) * 3, advDarken(wood, 0.35), 1);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        this.innerBoard(ctx, L, theme.pal, fw, fw * 0.5);
        // Planks on the inner board
        const inner = { x: x + fw, y: y + fw, w: w - fw * 2, h: h - fw * 2 };
        ctx.save();
        AdvArt.rr(ctx, inner.x, inner.y, inner.w, inner.h, fw * 0.5);
        ctx.clip();
        const plank = Math.max(28, fw * 3);
        for (let px = inner.x + plank; px < inner.x + inner.w; px += plank) {
            AdvArt.line(ctx, px, inner.y, px, inner.y + inner.h, advRgba(advDarken(theme.pal.board, 0.4), 0.18), 1.5);
        }
        ctx.restore();
        for (const [cx, cy] of [[x + fw * 0.5, y + fw * 0.5], [x + w - fw * 0.5, y + fw * 0.5], [x + fw * 0.5, y + h - fw * 0.5], [x + w - fw * 0.5, y + h - fw * 0.5]]) {
            AdvArt.circle(ctx, cx, cy, fw * 0.18, '#c9c0b0');
            AdvArt.ink(ctx, 1, '#6a5a4a');
        }
        this.frameMotifs(ctx, L, theme, 170);
    }

    frame_knit(ctx, L, theme) {
        const { x, y, w, h } = L.board;
        const fw = L.frameW;
        const yarn = theme.pal.frame;
        ctx.save();
        AdvArt.rr(ctx, x, y, w, h, fw);
        ctx.clip();
        // Rows of little V stitches
        const st = Math.max(6, fw * 0.45);
        for (let yy = y; yy < y + h; yy += st) {
            const row = Math.round((yy - y) / st);
            for (let xx = x; xx < x + w; xx += st) {
                const inBand = xx < x + fw || xx > x + w - fw || yy < y + fw || yy > y + h - fw;
                if (!inBand) continue;
                const band = Math.floor(row / 2) % 3;
                const col = band === 1 ? '#ffffff' : band === 2 ? (theme.pal.accent[1] || '#ffd447') : yarn;
                ctx.strokeStyle = advDarken(col, 0.12);
                ctx.lineWidth = st * 0.32;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(xx + st * 0.1, yy + st * 0.15);
                ctx.lineTo(xx + st * 0.5, yy + st * 0.85);
                ctx.lineTo(xx + st * 0.9, yy + st * 0.15);
                ctx.strokeStyle = col;
                ctx.stroke();
            }
        }
        ctx.restore();
        this.innerBoard(ctx, L, theme.pal, fw, fw * 0.6);
        // A purl ridge around the inner edge
        ctx.save();
        ctx.setLineDash([st * 0.5, st * 0.3]);
        ctx.strokeStyle = advRgba(yarn, 0.5);
        ctx.lineWidth = st * 0.25;
        AdvArt.rr(ctx, x + fw * 1.3, y + fw * 1.3, w - fw * 2.6, h - fw * 2.6, fw * 0.6);
        ctx.stroke();
        ctx.restore();
    }

    frame_cookie(ctx, L, theme) {
        const { x, y, w, h } = L.board;
        const fw = L.frameW;
        this.innerBoard(ctx, L, theme.pal, fw, fw * 0.7);
        // Icing squiggle around the edge
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(2, fw * 0.22);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const amp = fw * 0.22, step = fw * 0.6;
        const squiggle = (x0, y0, x1, y1) => {
            const len = Math.hypot(x1 - x0, y1 - y0);
            const n = Math.floor(len / step);
            const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
            ctx.beginPath();
            for (let i = 0; i <= n; i++) {
                const u = i / n;
                const off = Math.sin(i * Math.PI) * 0 + (i % 2 ? amp : -amp);
                ctx.lineTo(x0 + (x1 - x0) * u + nx * off, y0 + (y1 - y0) * u + ny * off);
            }
            ctx.stroke();
        };
        const m = fw * 0.5;
        squiggle(x + m * 2, y + m, x + w - m * 2, y + m);
        squiggle(x + m * 2, y + h - m, x + w - m * 2, y + h - m);
        squiggle(x + m, y + m * 2, x + m, y + h - m * 2);
        squiggle(x + w - m, y + m * 2, x + w - m, y + h - m * 2);
        ctx.restore();
        // Gumdrops
        const cols = ['#ff6b8b', '#7fd8be', '#ffd447', '#8fa8ff', '#ff9a4d'];
        let i = 0;
        const drop = (px, py) => {
            const c = cols[i++ % cols.length];
            ctx.beginPath();
            ctx.ellipse(px, py, fw * 0.32, fw * 0.28, 0, Math.PI, 0);
            ctx.lineTo(px + fw * 0.32, py + fw * 0.1);
            ctx.lineTo(px - fw * 0.32, py + fw * 0.1);
            ctx.closePath();
            ctx.fillStyle = c; ctx.fill();
            AdvArt.circle(ctx, px - fw * 0.1, py - fw * 0.12, fw * 0.06, 'rgba(255,255,255,0.8)');
        };
        for (let px = x + fw * 3; px < x + w - fw * 2; px += fw * 4) drop(px, y + h - fw * 0.45);
        for (let py = y + L.headerH + fw * 2; py < y + h - fw * 2; py += fw * 4) { drop(x + fw * 0.5, py); drop(x + w - fw * 0.5, py); }
    }

    frame_candycane(ctx, L, theme) {
        const { x, y, w, h } = L.board;
        const fw = L.frameW;
        ctx.save();
        AdvArt.rr(ctx, x, y, w, h, fw);
        ctx.clip();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = theme.pal.frame;
        const s = fw * 1.1;
        for (let k = -h; k < w + h; k += s * 2) {
            ctx.beginPath();
            ctx.moveTo(x + k, y);
            ctx.lineTo(x + k + s, y);
            ctx.lineTo(x + k + s - h, y + h);
            ctx.lineTo(x + k - h, y + h);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
        this.innerBoard(ctx, L, theme.pal, fw, fw * 0.7);
        // Little bows on the corners
        for (const [cx, cy] of [[x + fw * 0.6, y + h - fw * 0.6], [x + w - fw * 0.6, y + h - fw * 0.6]]) {
            AdvArt.ellipse(ctx, cx - fw * 0.5, cy, fw * 0.5, fw * 0.32, theme.pal.accent[1] || '#ffd447', 0.4);
            AdvArt.ellipse(ctx, cx + fw * 0.5, cy, fw * 0.5, fw * 0.32, theme.pal.accent[1] || '#ffd447', -0.4);
            AdvArt.circle(ctx, cx, cy, fw * 0.22, advDarken(theme.pal.accent[1] || '#ffd447', 0.15));
        }
    }

    frame_vine(ctx, L, theme) {
        const { x, y, w, h } = L.board;
        const fw = L.frameW;
        this.innerBoard(ctx, L, theme.pal, fw * 0.9, fw * 0.6);
        // A vine winds around the frame with leaves and flowers on it
        const path = [];
        const per = 2 * (w + h);
        const n = Math.round(per / (fw * 0.8));
        for (let i = 0; i <= n; i++) {
            let d = (i / n) * per;
            let px, py, nx, ny;
            if (d < w) { px = x + d; py = y + fw * 0.45; nx = 0; ny = 1; }
            else if ((d -= w) < h) { px = x + w - fw * 0.45; py = y + d; nx = -1; ny = 0; }
            else if ((d -= h) < w) { px = x + w - d; py = y + h - fw * 0.45; nx = 0; ny = -1; }
            else { d -= w; px = x + fw * 0.45; py = y + h - d; nx = 1; ny = 0; }
            const off = Math.sin(i * 0.9) * fw * 0.25;
            path.push([px + nx * off, py + ny * off, i]);
        }
        ctx.beginPath();
        path.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.strokeStyle = '#3f7a3a';
        ctx.lineWidth = Math.max(2, fw * 0.16);
        ctx.stroke();
        let v = 0;
        for (const [px, py, i] of path) {
            if (i % 3 === 0) AdvArt.leaf(ctx, px, py, fw * 0.6, i, '#5cae4a');
            if (i % 9 === 4) AdvArt.flower(ctx, px, py, fw * 0.36, theme.pal.accent[v++ % theme.pal.accent.length], '#ffd447');
        }
    }

    frame_rope(ctx, L, theme) {
        const { x, y, w, h } = L.board;
        const fw = L.frameW;
        this.innerBoard(ctx, L, theme.pal, fw * 0.4, fw * 0.6);
        // Twisted rope inset from the edge
        const m = fw * 0.55;
        const rope = (x0, y0, x1, y1) => {
            AdvArt.line(ctx, x0, y0, x1, y1, '#d9b98a', fw * 0.5);
            const len = Math.hypot(x1 - x0, y1 - y0);
            const n = Math.floor(len / (fw * 0.35));
            const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
            for (let i = 0; i < n; i++) {
                const px = x0 + ux * i * fw * 0.35, py = y0 + uy * i * fw * 0.35;
                AdvArt.line(ctx, px - uy * fw * 0.22 - ux * fw * 0.1, py + ux * fw * 0.22 - uy * fw * 0.1, px + uy * fw * 0.22 + ux * fw * 0.1, py - ux * fw * 0.22 + uy * fw * 0.1, '#a8865a', Math.max(1, fw * 0.08));
            }
        };
        rope(x + m, y + m, x + w - m, y + m);
        rope(x + m, y + h - m, x + w - m, y + h - m);
        rope(x + m, y + m, x + m, y + h - m);
        rope(x + w - m, y + m, x + w - m, y + h - m);
        // Shells and starfish at the corners
        const corners = [[x + m, y + m], [x + w - m, y + m], [x + m, y + h - m], [x + w - m, y + h - m]];
        corners.forEach(([cx, cy], i) => {
            if (i % 2) AdvArt.star(ctx, cx, cy, fw * 0.75, '#ff9a76', -Math.PI / 2 + i);
            else this.drawMotif(ctx, 'shell', cx, cy, fw * 0.75, i, theme);
        });
        this.frameMotifs(ctx, L, theme, 220);
    }

    frame_bezel(ctx, L, theme) {
        const { x, y, w, h } = L.board;
        const fw = L.frameW;
        this.innerBoard(ctx, L, theme.pal, fw, fw * 0.6);
        ctx.save();
        ctx.strokeStyle = advLighten(theme.pal.frame, 0.35);
        ctx.lineWidth = Math.max(1.5, fw * 0.1);
        AdvArt.rr(ctx, x + fw * 0.35, y + fw * 0.35, w - fw * 0.7, h - fw * 0.7, fw);
        ctx.stroke();
        ctx.strokeStyle = advDarken(theme.pal.frame, 0.25);
        AdvArt.rr(ctx, x + fw * 0.8, y + fw * 0.8, w - fw * 1.6, h - fw * 1.6, fw * 0.7);
        ctx.stroke();
        ctx.restore();
        for (const [cx, cy] of [[x + fw * 0.55, y + fw * 0.55], [x + w - fw * 0.55, y + fw * 0.55], [x + fw * 0.55, y + h - fw * 0.55], [x + w - fw * 0.55, y + h - fw * 0.55]]) {
            this.drawMotif(ctx, theme.motif, cx, cy, fw * 0.55, 0, theme);
        }
        this.frameMotifs(ctx, L, theme, 160);
    }

    // The calendar as a little house: walls hold the doors, the roof holds
    // the title. A crooked roof for the haunted version.
    frame_house(ctx, L, theme) {
        const { x, y, w, h } = L.board;
        const fw = L.frameW;
        const roofH = L.roofH;
        const pal = theme.pal;
        this.innerBoard(ctx, L, pal, fw * 0.7, fw * 0.4);

        // Siding lines on the walls
        ctx.save();
        AdvArt.rr(ctx, x + fw * 0.7, y + fw * 0.7, w - fw * 1.4, h - fw * 1.4, fw * 0.4);
        ctx.clip();
        for (let yy = y + fw * 1.5; yy < y + h; yy += fw * 1.2) {
            AdvArt.line(ctx, x, yy, x + w, yy, advRgba(advDarken(pal.board, 0.5), 0.12), 1);
        }
        ctx.restore();

        // Chimney first so the roof overlaps it
        const crook = theme.crooked ? 0.06 : 0;
        const peakX = x + w * (0.5 + crook);
        const chX = x + w * 0.76, chW = Math.max(18, w * 0.045);
        const chTop = y - roofH * 0.95;
        ctx.fillStyle = advDarken(pal.frame, 0.1);
        ctx.fillRect(chX, chTop, chW, roofH);
        ctx.fillStyle = advDarken(pal.frame, 0.25);
        ctx.fillRect(chX - chW * 0.12, chTop - chW * 0.25, chW * 1.24, chW * 0.35);
        this.chimney = { x: chX + chW / 2, y: chTop - chW * 0.25 };

        // Roof
        const eave = fw * 1.6;
        const roof = theme.roof || pal.frame;
        ctx.beginPath();
        ctx.moveTo(x - eave, y + fw * 0.4);
        ctx.lineTo(peakX, y - roofH);
        ctx.lineTo(x + w + eave, y + fw * 0.4 + (theme.crooked ? -roofH * 0.08 : 0));
        ctx.closePath();
        ctx.fillStyle = roof;
        ctx.fill();
        AdvArt.ink(ctx, 2, advDarken(roof, 0.5), 0.6);
        // Shingle scallops
        ctx.save();
        ctx.clip();
        const sh = Math.max(10, fw * 0.9);
        for (let yy = y - roofH; yy < y + fw; yy += sh * 0.8) {
            const off = (Math.round((yy - y) / (sh * 0.8)) % 2) * sh * 0.5;
            for (let xx = x - eave + off; xx < x + w + eave; xx += sh) {
                ctx.beginPath();
                ctx.arc(xx, yy, sh * 0.5, 0, Math.PI);
                ctx.strokeStyle = advRgba(advDarken(roof, 0.4), 0.5);
                ctx.lineWidth = 1.2;
                ctx.stroke();
            }
        }
        ctx.restore();
        if (theme.snowRoof) {
            ctx.beginPath();
            ctx.moveTo(x - eave, y + fw * 0.4);
            ctx.lineTo(peakX, y - roofH);
            ctx.lineTo(x + w + eave, y + fw * 0.4);
            const n = 14;
            for (let i = n; i >= 0; i--) {
                const u = i / n;
                const ex = x - eave + (w + eave * 2) * u;
                const ey = y + fw * 0.4;
                ctx.lineTo(ex, ey - fw * 0.4 + (i % 2 ? fw * 0.55 : 0));
            }
            ctx.closePath();
            ctx.save();
            ctx.clip();
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x - eave, y - roofH, w + eave * 2, fw * 1.2 + roofH * 0.12);
            ctx.restore();
            ctx.beginPath();
            ctx.moveTo(x - eave, y + fw * 0.4);
            for (let i = 0; i <= 18; i++) {
                const u = i / 18;
                ctx.lineTo(x - eave + (w + eave * 2) * u, y + fw * 0.4 + (i % 2 ? fw * 0.5 : 0));
            }
            ctx.lineTo(x + w + eave, y - fw * 0.3);
            ctx.lineTo(x - eave, y - fw * 0.3);
            ctx.closePath();
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }
        // Eave trim
        ctx.beginPath();
        ctx.moveTo(x - eave, y + fw * 0.4);
        ctx.lineTo(peakX, y - roofH);
        ctx.lineTo(x + w + eave, y + fw * 0.4 + (theme.crooked ? -roofH * 0.08 : 0));
        ctx.strokeStyle = advDarken(roof, 0.35);
        ctx.lineWidth = Math.max(3, fw * 0.35);
        ctx.lineJoin = 'round';
        ctx.stroke();
        this.frameMotifs(ctx, L, theme, 200);
    }

    // Month title: a ribbon banner, or a sign under the roof for houses
    paintHeader(ctx, L, theme) {
        const m = this.model;
        const pal = theme.pal;
        const { x, y, w } = L.board;
        const monthName = new Date(m.year, m.month - 1, 1).toLocaleString(undefined, { month: 'long' });
        const isHouse = theme.frame === 'house';

        let cx, cy, bw, bh;
        if (isHouse) {
            bh = Math.max(34, L.roofH * 0.42);
            bw = Math.min(w * 0.42, bh * 6.5);
            cx = x + w * (0.5 + (theme.crooked ? 0.04 : 0));
            cy = y - L.roofH * 0.36;
        } else {
            bh = Math.max(36, L.headerH * 0.62);
            bw = Math.min(w * 0.6, bh * 7.5);
            cx = x + w / 2;
            cy = y + L.frameW * 0.2 + bh * 0.42;
        }

        ctx.save();
        if (isHouse) {
            AdvArt.rr(ctx, cx - bw / 2, cy - bh / 2, bw, bh, bh * 0.25);
            ctx.fillStyle = advDarken(theme.roof || pal.frame, 0.35);
            ctx.fill();
            AdvArt.rr(ctx, cx - bw / 2 + 3, cy - bh / 2 + 3, bw - 6, bh - 6, bh * 0.22);
            ctx.strokeStyle = advRgba('#ffffff', 0.4);
            ctx.lineWidth = 1.5;
            ctx.stroke();
        } else {
            // Ribbon tails
            const tail = bh * 0.9;
            for (const s of [-1, 1]) {
                ctx.beginPath();
                const ex = cx + s * bw / 2;
                ctx.moveTo(ex - s * bh * 0.2, cy - bh * 0.25);
                ctx.lineTo(ex + s * tail, cy - bh * 0.25);
                ctx.lineTo(ex + s * tail * 0.7, cy + bh * 0.2);
                ctx.lineTo(ex + s * tail, cy + bh * 0.65);
                ctx.lineTo(ex - s * bh * 0.2, cy + bh * 0.65);
                ctx.closePath();
                ctx.fillStyle = advDarken(pal.frame, 0.25);
                ctx.fill();
            }
            ctx.shadowColor = 'rgba(0,0,0,0.25)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 3;
            ctx.beginPath();
            ctx.moveTo(cx - bw / 2, cy - bh / 2);
            ctx.quadraticCurveTo(cx, cy - bh / 2 - bh * 0.18, cx + bw / 2, cy - bh / 2);
            ctx.lineTo(cx + bw / 2, cy + bh / 2);
            ctx.quadraticCurveTo(cx, cy + bh / 2 - bh * 0.18, cx - bw / 2, cy + bh / 2);
            ctx.closePath();
            ctx.fillStyle = pal.frame;
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.setLineDash([bh * 0.12, bh * 0.1]);
            ctx.strokeStyle = advRgba('#ffffff', 0.55);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx - bw / 2 + 6, cy - bh / 2 + 5);
            ctx.quadraticCurveTo(cx, cy - bh / 2 - bh * 0.18 + 5, cx + bw / 2 - 6, cy - bh / 2 + 5);
            ctx.moveTo(cx - bw / 2 + 6, cy + bh / 2 - 5);
            ctx.quadraticCurveTo(cx, cy + bh / 2 - bh * 0.18 - 5, cx + bw / 2 - 6, cy + bh / 2 - 5);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Title text, shrunk to fit
        let size = bh * 0.62;
        const title = `${monthName}`;
        ctx.font = `700 ${size}px ${ADVENT_FONT_FANCY}`;
        while (ctx.measureText(title).width > bw * 0.8 && size > 10) {
            size -= 1;
            ctx.font = `700 ${size}px ${ADVENT_FONT_FANCY}`;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = advRgba('#000000', 0.25);
        ctx.fillText(title, cx + 1.5, cy + 2 - bh * 0.06);
        ctx.fillStyle = pal.title;
        ctx.fillText(title, cx, cy - bh * 0.06);
        ctx.restore();

        this.headerAnchor = { cx, cy, bw, bh, isHouse };
    }

    // The line under the title changes daily, so it draws live
    subtitle() {
        const m = this.model;
        const today = m.today;
        const todays = m.holidays.find(h => h.day === today);
        if (todays) return `${todays.emoji}  ${todays.caption || 'Happy ' + todays.name + '!'}  ${todays.emoji}`;
        const next = m.holidays.filter(h => h.day > today).sort((a, b) => a.day - b.day)[0];
        if (next) {
            const n = next.day - today;
            return `${n} ${n === 1 ? 'sleep' : 'sleeps'} until ${next.name} ${next.emoji}`;
        }
        if (m.month === 1 && m.holidays.length === 0) return `${m.theme.emoji} ${m.theme.name}`;
        return `${m.theme.emoji}  ${m.theme.name}  ·  day ${today} of ${m.daysInMonth}`;
    }

    // -----------------------------------------------------------------------
    // Particles
    // -----------------------------------------------------------------------

    seedParticles() {
        this.particles = [];
        const scene = this.model.theme.scene;
        if (!this.config.particles || !scene.particles) return;
        const kind = scene.particles;
        const base = { snow: 1, rain: 1.4, petals: 0.6, leaves: 0.45, hearts: 0.4, confetti: 0.7, fireflies: 0.4, stars: 0.5, bubbles: 0.5, sparkles: 0.5, clovers: 0.4, bats: 0.12 }[kind] || 0.5;
        const n = Math.round(this.w * this.h / 24000 * base * this.config.particleAmount);
        const rng = advRng(this.model.seed + 99);
        for (let i = 0; i < n; i++) {
            this.particles.push({
                x: rng() * this.w,
                y: rng() * this.h,
                z: 0.4 + rng() * 0.6,
                ph: rng() * advTAU,
                spin: (rng() - 0.5) * 2,
                c: i
            });
        }
    }

    updateDrawParticles(ctx, dt) {
        const kind = this.model.theme.scene.particles;
        const W = this.w, H = this.h;
        const acc = this.model.theme.pal.accent;
        const t = this.time;
        for (const p of this.particles) {
            let vx = 0, vy = 0;
            switch (kind) {
                case 'snow': vy = 22 * p.z; vx = Math.sin(t * 0.7 + p.ph) * 12; break;
                case 'rain': vy = 380 * p.z; vx = -30; break;
                case 'petals': case 'clovers': vy = 26 * p.z; vx = 18 + Math.sin(t + p.ph) * 18; break;
                case 'leaves': vy = 34 * p.z; vx = Math.sin(t * 0.8 + p.ph) * 40; break;
                case 'hearts': vy = -18 * p.z; vx = Math.sin(t + p.ph) * 14; break;
                case 'confetti': vy = 40 * p.z; vx = Math.sin(t * 2 + p.ph) * 20; break;
                case 'bubbles': vy = -30 * p.z; vx = Math.sin(t * 2 + p.ph) * 8; break;
                case 'fireflies': vx = Math.sin(t * 0.4 + p.ph) * 14; vy = Math.cos(t * 0.5 + p.ph * 1.3) * 10; break;
                case 'bats': vx = 60 * p.z * (p.c % 2 ? 1 : -1); vy = Math.sin(t * 2 + p.ph) * 20; break;
                default: break;
            }
            p.x += vx * dt;
            p.y += vy * dt;
            if (p.y > H + 20) { p.y = -20; p.x = Math.random() * W; }
            if (p.y < -20) { p.y = H + 20; p.x = Math.random() * W; }
            if (p.x > W + 30) p.x = -30;
            if (p.x < -30) p.x = W + 30;

            const s = p.z;
            ctx.globalAlpha = 0.5 + p.z * 0.4;
            switch (kind) {
                case 'snow': AdvArt.circle(ctx, p.x, p.y, 1.4 + s * 2.2, '#ffffff'); break;
                case 'rain': AdvArt.line(ctx, p.x, p.y, p.x - 3, p.y + 12 * s, 'rgba(200,220,255,0.55)', 1.2); break;
                case 'petals': AdvArt.petal(ctx, p.x, p.y, 4 + s * 3, t * p.spin + p.ph, ['#ffc0d6', '#ffd6e5', '#ffffff'][p.c % 3]); break;
                case 'leaves': AdvArt.leaf(ctx, p.x, p.y, 10 + s * 8, t * p.spin + p.ph, ['#e8743a', '#d9a03a', '#c94f3a', '#e8b84a'][p.c % 4], p.c % 2 ? 'maple' : 'oval'); break;
                case 'hearts': AdvArt.heart(ctx, p.x, p.y, 3 + s * 4, ['#ff8fb8', '#ff6b8b', '#ffffff'][p.c % 3]); break;
                case 'confetti': AdvArt.confetti(ctx, p.x, p.y, 2.5 + s * 2, t * p.spin * 3 + p.ph, acc[p.c % acc.length]); break;
                case 'clovers': AdvArt.clover(ctx, p.x, p.y, 3 + s * 3, '#5cbf60', 3, t * p.spin); break;
                case 'bubbles': {
                    AdvArt.circle(ctx, p.x, p.y, 2 + s * 5);
                    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.stroke();
                    AdvArt.circle(ctx, p.x - s * 1.5, p.y - s * 1.5, s, 'rgba(255,255,255,0.7)');
                    break;
                }
                case 'fireflies': {
                    const glow = 0.3 + 0.7 * Math.max(0, Math.sin(t * 1.7 + p.ph * 3));
                    ctx.globalAlpha = glow;
                    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10 * s + 4);
                    g.addColorStop(0, 'rgba(230,255,140,0.9)');
                    g.addColorStop(1, 'rgba(230,255,140,0)');
                    ctx.fillStyle = g;
                    ctx.fillRect(p.x - 14, p.y - 14, 28, 28);
                    break;
                }
                case 'stars': case 'sparkles': {
                    const tw = 0.5 + 0.5 * Math.sin(t * (1.2 + p.z) + p.ph * 5);
                    ctx.globalAlpha = tw * 0.9;
                    AdvArt.sparkle(ctx, p.x, p.y, 2 + s * 4 * tw, kind === 'stars' ? '#fff3c4' : '#ffffff');
                    break;
                }
                case 'bats': AdvArt.bat(ctx, p.x, p.y, 6 + s * 6, t * 14 + p.ph, '#2a2238'); break;
            }
        }
        ctx.globalAlpha = 1;
    }

    // -----------------------------------------------------------------------
    // Animation loop
    // -----------------------------------------------------------------------

    animate() {
        if (!this.isEnabled) return;
        this.animationId = requestAnimationFrame(() => this.animate());
        const nowMs = performance.now();
        const minGap = 1000 / (this.config.fps || 30);
        if (this.lastFrame && nowMs - this.lastFrame < minGap - 2) return;
        const dt = this.lastFrame ? Math.min(0.1, (nowMs - this.lastFrame) / 1000) : 1 / 30;
        this.lastFrame = nowMs;
        this.time = (nowMs - this.clockStart) / 1000;

        this.checkDate();
        this.update(dt);
        this.draw(dt);
        if (this.spotlight) this.drawSpotlight();
    }

    // Midnight: open the new day's door (or move to the new month)
    checkDate() {
        if (this.time - this.lastDateCheck < 1) return;
        this.lastDateCheck = this.time;
        const key = AdventCalendarAnimationManager.dateKey(this.now());
        if (key !== this.lastDateKey) {
            console.log('Advent calendar: a new day!', key);
            this.rebuild(false);
        }
    }

    update(dt) {
        const t = this.time;
        // Fire scheduled openings
        for (let i = this.queue.length - 1; i >= 0; i--) {
            const q = this.queue[i];
            if (t >= q.at) {
                this.queue.splice(i, 1);
                this.openDoor(q.door, q.grand);
            }
        }
        for (const door of this.model.doors) {
            if (door.opening) {
                const dur = door.grand ? 1.1 : 0.7;
                const delay = door.grand ? 0.9 : 0;
                const k = (t - door.openStart - delay) / dur;
                door.openK = advEaseOutBack(advClamp(k, 0, 1));
                if (k >= 1) {
                    door.opening = false;
                    door.open = true;
                    door.openK = 1;
                }
                if (k > 0.3 && !door.burst) {
                    door.burst = true;
                    this.addBurst(door, door.grand);
                    if (door.grand) {
                        door.openedAt = t - 0.3;
                        if (this.config.ceremony === 'grand') setTimeout(() => this.isEnabled && this.openSpotlight(door, true), 900);
                    }
                }
            }
            const target = door === this.hoverDoor ? 1 : 0;
            door.hoverK += (target - door.hoverK) * Math.min(1, dt * 10);
        }
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            if (t - this.bursts[i].t0 > 2.2) this.bursts.splice(i, 1);
        }
        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            if (t - this.bubbles[i].t0 > 1.8) this.bubbles.splice(i, 1);
        }
    }

    openDoor(door, grand) {
        if (door.open || door.opening) return;
        door.waiting = false;
        door.opening = true;
        door.grand = grand;
        door.burst = false;
        door.openStart = this.time;
        door.openedAt = this.time + (grand ? 1.2 : 0.2);
        door.cache = null;
        if (grand) this.storageSet('adventCelebrated', this.lastDateKey);
    }

    addBurst(door, big) {
        const r = door.rect;
        const parts = [];
        const n = big ? 46 : 16;
        const acc = this.model.theme.pal.accent;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * advTAU;
            const v = (big ? 160 : 90) * (0.4 + Math.random());
            parts.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v - (big ? 60 : 30), c: acc[i % acc.length], s: big ? 5 : 3.5, rot: Math.random() * 6, kind: i % 3 });
        }
        this.bursts.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, t0: this.time, parts });
    }

    // -----------------------------------------------------------------------
    // Drawing
    // -----------------------------------------------------------------------

    draw(dt) {
        const ctx = this.ctx;
        const t = this.time;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.drawImage(this.bgCanvas, 0, 0, this.w, this.h);
        ctx.drawImage(this.boardCanvas, 0, 0, this.w, this.h);

        if (this.chimney && this.model.theme.frame === 'house') this.drawSmoke(ctx);
        this.drawSubtitle(ctx);

        // Treat budget: how many open doors may re-render this frame
        const ambient = this.config.ambient;
        const open = this.model.doors.filter(d => d.openK > 0.01);
        const budget = ambient === 'lively' ? open.length : ambient === 'gentle' ? Math.max(2, Math.ceil(open.length / 3)) : 0;
        let rendered = 0;
        const start = this.renderCursor % Math.max(1, open.length);
        for (let i = 0; i < open.length; i++) {
            const door = open[(start + i) % open.length];
            const must = !door.cache || door.day === this.model.today || door === this.hoverDoor || door.opening || (this.time - door.openedAt) < 3;
            if (must || rendered < budget) {
                this.renderTreat(door);
                if (!must) rendered++;
            }
        }
        this.renderCursor += Math.max(1, budget);

        // Doors: closed ones and open-door contents; the big star doors go
        // last so their swung-open leaves land on top of their neighbours
        const ordered = this.model.doors.slice().sort((a, b) => (a.span[0] * a.span[1]) - (b.span[0] * b.span[1]) || (a.openK - b.openK));
        for (const door of ordered) this.drawDoor(ctx, door, t);

        this.drawBursts(ctx);
        if (this.config.particles) this.updateDrawParticles(ctx, dt);
        this.drawBubbles(ctx);
    }

    drawSmoke(ctx) {
        const { x, y } = this.chimney;
        const t = this.time;
        for (let i = 0; i < 5; i++) {
            const k = ((t * 0.18 + i / 5) % 1);
            ctx.globalAlpha = (1 - k) * 0.55;
            AdvArt.circle(ctx, x + Math.sin(k * 5 + i) * 10 + k * 26, y - k * 70, 5 + k * 12, '#e8e8f0');
        }
        ctx.globalAlpha = 1;
    }

    drawSubtitle(ctx) {
        const L = this.layoutInfo;
        const pal = this.model.theme.pal;
        const text = this.subtitle();
        const size = Math.round(advClamp(L.board.w * 0.016, 11, 20));
        ctx.save();
        ctx.font = `700 ${size}px ${ADVENT_FONT_ROUND}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let x, y;
        if (this.headerAnchor.isHouse) {
            x = this.headerAnchor.cx;
            y = this.headerAnchor.cy + this.headerAnchor.bh * 0.5 + size * 0.95;
            const w = ctx.measureText(text).width + size * 1.4;
            AdvArt.rr(ctx, x - w / 2, y - size * 0.75, w, size * 1.5, size * 0.75);
            ctx.fillStyle = advRgba('#000000', 0.35);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
        } else {
            x = L.board.x + L.board.w / 2;
            y = this.headerAnchor.cy + this.headerAnchor.bh * 0.5 + size * 1.05;
            ctx.fillStyle = pal.boardInk || pal.ink;
        }
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    renderTreat(door) {
        const r = door.rect;
        const def = ADVENT_TREATS[door.treatId];
        if (!def) return;
        const w = Math.max(4, Math.round(r.w * this.dpr));
        const h = Math.max(4, Math.round(r.h * this.dpr));
        if (!door.cache || door.cache.width !== w || door.cache.height !== h) {
            door.cache = document.createElement('canvas');
            door.cache.width = w;
            door.cache.height = h;
        }
        const ctx = door.cache.getContext('2d');
        this.paintTreat(ctx, door, w, h, this.time - door.openedAt);
        door.cacheTime = this.time;
    }

    // Paint a treat into a w x h pixel context. Shared by the doors and the
    // spotlight.
    paintTreat(ctx, door, w, h, age, big = false) {
        const def = ADVENT_TREATS[door.treatId];
        const unit = Math.min(w, h) / 100;
        const S = {
            t: this.time + door.seed,
            age: Math.max(0, age),
            hw: w / 2 / unit,
            hh: h / 2 / unit,
            p: door.params,
            pal: this.model.theme.pal,
            seed: Math.floor(door.seed * 10),
            year: this.model.year,
            month: this.model.month,
            day: door.day,
            big
        };
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(unit, unit);
        try {
            def.draw(ctx, S);
        } catch (err) {
            if (!this._treatErrors) this._treatErrors = new Set();
            if (!this._treatErrors.has(door.treatId)) {
                this._treatErrors.add(door.treatId);
                console.error('Advent treat failed:', door.treatId, err);
            }
        }
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    drawDoor(ctx, door, t) {
        const r = door.rect;
        const rad = Math.min(r.w, r.h) * 0.12;
        const k = door.openK;
        const isToday = door.day === this.model.today;
        const pal = this.model.theme.pal;

        // The window behind the door
        if (k > 0.01 && door.cache) {
            ctx.save();
            AdvArt.rr(ctx, r.x, r.y, r.w, r.h, rad);
            ctx.clip();
            ctx.drawImage(door.cache, r.x, r.y, r.w, r.h);
            // Inner shadow gives the window some depth
            const sh = Math.min(r.w, r.h) * 0.12;
            const g1 = ctx.createLinearGradient(r.x, r.y, r.x, r.y + sh);
            g1.addColorStop(0, 'rgba(0,0,0,0.35)');
            g1.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g1;
            ctx.fillRect(r.x, r.y, r.w, sh);
            const g2 = ctx.createLinearGradient(r.x, r.y, r.x + sh, r.y);
            g2.addColorStop(0, 'rgba(0,0,0,0.25)');
            g2.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g2;
            ctx.fillRect(r.x, r.y, sh, r.h);
            ctx.restore();
            this.drawDayTag(ctx, door, r, k);
            if (isToday && k >= 1) {
                // A soft golden rim marks today's treat
                ctx.save();
                ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 2.5);
                AdvArt.rr(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, rad + 2);
                ctx.strokeStyle = '#ffe066';
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.restore();
            }
        }

        if (k >= 0.999) {
            this.drawLeaves(ctx, door, r, 1);
            return;
        }

        // Closed (or opening) door
        ctx.save();
        const hover = door.hoverK;
        const jig = t - door.jiggleAt < 0.6 ? Math.sin((t - door.jiggleAt) * 40) * (1 - (t - door.jiggleAt) / 0.6) * 0.06 : 0;
        const ceremonyShake = door.opening && door.grand && t - door.openStart < 0.9 ? Math.sin((t - door.openStart) * 46) * 0.05 * advSmooth((t - door.openStart) / 0.4) : 0;
        const waitWiggle = door.waiting ? Math.sin(t * 6) * 0.025 * (Math.sin(t * 1.3) > 0.4 ? 1 : 0) : 0;
        const lift = 1 + hover * 0.035;
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
        ctx.rotate(jig + ceremonyShake + waitWiggle);
        ctx.scale(lift, lift);
        ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));

        if (isToday && k < 0.01) {
            // Today's door glows before it opens
            const glow = 0.5 + 0.5 * Math.sin(t * 3);
            ctx.save();
            ctx.shadowColor = `rgba(255,220,100,${0.6 + glow * 0.4})`;
            ctx.shadowBlur = 18 + glow * 14;
            AdvArt.rr(ctx, r.x, r.y, r.w, r.h, rad);
            ctx.fillStyle = door.color;
            ctx.fill();
            ctx.restore();
        }

        if (k > 0.01) this.drawLeaves(ctx, door, r, k);
        else this.drawClosedFace(ctx, door, r, rad, pal, isToday);
        ctx.restore();
    }

    // Small paper tag with the day number on an open window
    drawDayTag(ctx, door, r, k) {
        const s = Math.max(11, Math.min(r.w, r.h) * 0.2);
        const x = r.x + s * 0.2, y = r.y + s * 0.2;
        ctx.save();
        ctx.globalAlpha = advClamp(k, 0, 1);
        AdvArt.rr(ctx, x, y, s * 1.25, s * 0.95, s * 0.25);
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fill();
        ctx.font = `800 ${Math.round(s * 0.62)}px ${ADVENT_FONT_ROUND}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.model.theme.pal.ink;
        ctx.fillText(String(door.day), x + s * 0.625, y + s * 0.5);
        ctx.restore();
    }

    drawClosedFace(ctx, door, r, rad, pal, isToday) {
        const col = door.color;
        const ink = this.doorInk(col);
        const base = Math.min(r.w, r.h);

        AdvArt.rr(ctx, r.x, r.y, r.w, r.h, rad);
        const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
        g.addColorStop(0, advLighten(col, 0.12));
        g.addColorStop(1, advDarken(col, 0.08));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = advDarken(col, 0.35);
        ctx.lineWidth = Math.max(1, base * 0.02);
        ctx.stroke();

        // Inset panel line
        const inset = base * 0.09;
        AdvArt.rr(ctx, r.x + inset, r.y + inset, r.w - inset * 2, r.h - inset * 2, rad * 0.7);
        ctx.strokeStyle = advRgba('#ffffff', 0.35);
        ctx.lineWidth = Math.max(1, base * 0.018);
        ctx.setLineDash(this.model.theme.frame === 'felt' || this.model.theme.frame === 'knit' ? [base * 0.05, base * 0.04] : []);
        ctx.stroke();
        ctx.setLineDash([]);

        // Holiday doors wear a ribbon and their emoji
        if (door.holiday) {
            ctx.save();
            AdvArt.rr(ctx, r.x, r.y, r.w, r.h, rad);
            ctx.clip();
            ctx.fillStyle = advRgba('#ffd447', 0.9);
            ctx.fillRect(r.x + r.w * 0.5 - base * 0.06, r.y, base * 0.12, r.h);
            ctx.fillRect(r.x, r.y + r.h * 0.5 - base * 0.06, r.w, base * 0.12);
            ctx.restore();
            ctx.font = `${Math.round(base * 0.24)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(door.holiday.emoji, r.x + r.w / 2, r.y + r.h / 2);
        } else {
            this.drawMotif(ctx, this.model.theme.motif, r.x + r.w - base * 0.2, r.y + base * 0.2, base * 0.09, door.day, this.model.theme);
        }

        // Day number
        const fs = Math.round(base * (door.holiday ? 0.26 : 0.4));
        ctx.font = `700 ${fs}px ${ADVENT_FONT_FANCY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const ny = door.holiday ? r.y + r.h * 0.2 + fs * 0.1 : r.y + r.h / 2 + fs * 0.04;
        ctx.fillStyle = advRgba('#000000', 0.25);
        ctx.fillText(String(door.day), r.x + r.w / 2 + 1, ny + 1.5);
        ctx.fillStyle = ink;
        ctx.fillText(String(door.day), r.x + r.w / 2, ny);
        if (door.holiday) {
            const ls = Math.max(9, Math.round(base * 0.1));
            ctx.font = `800 ${ls}px ${ADVENT_FONT_ROUND}`;
            let label = door.holiday.name;
            while (ctx.measureText(label).width > r.w * 0.86 && label.length > 4) label = label.slice(0, -2) + '…';
            const ly = r.y + r.h * 0.82;
            const lw = ctx.measureText(label).width + ls;
            AdvArt.rr(ctx, r.x + r.w / 2 - lw / 2, ly - ls * 0.8, lw, ls * 1.6, ls * 0.6);
            ctx.fillStyle = advRgba('#000000', 0.25);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, r.x + r.w / 2, ly);
        }

        // Knob
        AdvArt.circle(ctx, r.x + r.w - base * 0.16, r.y + r.h / 2 + (door.holiday ? base * 0.12 : 0), base * 0.045, '#ffe08a');
        AdvArt.ink(ctx, Math.max(0.8, base * 0.012), '#8a6a2a', 0.7);

        if (isToday && door.waiting) {
            const ls = Math.max(9, Math.round(base * 0.12));
            ctx.font = `800 ${ls}px ${ADVENT_FONT_ROUND}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText('open me!', r.x + r.w / 2, r.y + r.h * 0.84);
        }
    }

    // The door leaf (or two leaves for star doors) swinging on its hinge.
    // k: 0 closed .. 1 open. Past 90 degrees the back of the door shows.
    drawLeaves(ctx, door, r, k) {
        const double = door.span[0] > 1 && door.span[1] > 1;
        const leaves = double
            ? [{ hx: r.x, w: r.w / 2, dir: 1 }, { hx: r.x + r.w, w: r.w / 2, dir: -1 }]
            : [{ hx: r.x, w: r.w, dir: 1 }];
        const gap = this.layoutInfo.grid.gap;
        for (const L of leaves) {
            // Swing just past 90 degrees, so the open leaf folds back into
            // the gutter instead of covering the neighbouring door
            const rest = Math.acos(-Math.min(0.22, (gap * 0.8) / L.w));
            const angle = k * rest;
            const c = Math.cos(angle);
            const s = Math.sin(angle);
            const freeX = L.hx + L.dir * L.w * c;
            const grow = Math.min(r.h * 0.09, gap * 0.6) * s;
            const front = c > 0;
            ctx.beginPath();
            ctx.moveTo(L.hx, r.y);
            ctx.lineTo(freeX, r.y - grow);
            ctx.lineTo(freeX, r.y + r.h + grow);
            ctx.lineTo(L.hx, r.y + r.h);
            ctx.closePath();
            const col = door.color;
            const shade = front ? advMix(col, '#000000', (1 - c) * 0.35) : advMix(advDarken(col, 0.25), '#ffffff', 0.1 + Math.abs(c) * 0.1);
            ctx.fillStyle = shade;
            ctx.fill();
            ctx.strokeStyle = advDarken(col, 0.45);
            ctx.lineWidth = 1;
            ctx.stroke();
            if (!front) {
                // Back of the door: a little paper lining
                const mx = (L.hx + freeX) / 2;
                const lw = Math.abs(freeX - L.hx) * 0.6;
                ctx.fillStyle = advRgba('#ffffff', 0.18);
                ctx.fillRect(mx - lw / 2, r.y + r.h * 0.15, lw, r.h * 0.7);
            } else if (c > 0.3) {
                // Number still visible while the door is mostly closed
                ctx.save();
                ctx.globalAlpha = (c - 0.3) / 0.7;
                ctx.translate((L.hx + freeX) / 2, r.y + r.h / 2);
                ctx.scale(Math.abs(c), 1);
                const fs = Math.round(Math.min(r.w, r.h) * 0.4);
                ctx.font = `700 ${fs}px ${ADVENT_FONT_FANCY}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = this.doorInk(door.color);
                if (!double) ctx.fillText(String(door.day), 0, 0);
                ctx.restore();
            }
            // Hinges
            for (const hy of [r.y + r.h * 0.2, r.y + r.h * 0.8]) {
                ctx.fillStyle = '#c9b07a';
                ctx.fillRect(L.hx - 2, hy - 3, 4, 6);
            }
        }
    }

    drawBursts(ctx) {
        const t = this.time;
        for (const b of this.bursts) {
            const k = t - b.t0;
            for (const p of b.parts) {
                const x = b.x + p.vx * k;
                const y = b.y + p.vy * k + 140 * k * k;
                ctx.globalAlpha = Math.max(0, 1 - k / 2.2);
                if (p.kind === 0) AdvArt.sparkle(ctx, x, y, p.s, '#fff6c2');
                else if (p.kind === 1) AdvArt.confetti(ctx, x, y, p.s * 0.6, p.rot + k * 8, p.c);
                else AdvArt.star(ctx, x, y, p.s * 0.8, p.c, p.rot + k * 4);
            }
        }
        ctx.globalAlpha = 1;
    }

    drawBubbles(ctx) {
        const t = this.time;
        for (const b of this.bubbles) {
            const k = (t - b.t0) / 1.8;
            const r = b.door.rect;
            ctx.save();
            ctx.globalAlpha = advSmooth(k / 0.15) * (1 - advSmooth((k - 0.75) / 0.25));
            ctx.translate(r.x + r.w / 2, r.y - 4 - k * 10);
            ctx.scale(1.3, 1.3);
            AdvArt.speech(ctx, 0, 0, b.text, 11);
            ctx.restore();
        }
    }

    // -----------------------------------------------------------------------
    // Interaction. Listeners sit on the document so the canvas can stay
    // pointer-events:none and leave the homepage clickable.
    // -----------------------------------------------------------------------

    setupInteraction() {
        this.teardownInteraction();
        const bind = (target, type, fn, opts) => {
            target.addEventListener(type, fn, opts);
            this.listeners.push([target, type, fn, opts]);
        };

        bind(document, 'mousemove', (e) => {
            const door = this.isBackground(e.target) ? this.doorAt(e.clientX, e.clientY) : null;
            if (door !== this.hoverDoor) {
                this.hoverDoor = door;
                if (this.isBackground(e.target)) document.body.style.cursor = door ? 'pointer' : '';
            }
        }, { passive: true });

        bind(document, 'mouseleave', () => { this.hoverDoor = null; });

        bind(document, 'click', (e) => {
            if (this.spotlight) return;
            if (!this.isBackground(e.target)) return;
            const door = this.doorAt(e.clientX, e.clientY);
            if (door) this.clickDoor(door);
        });

        bind(document, 'keydown', (e) => {
            if (e.key === 'Escape' && this.spotlight) this.closeSpotlight();
        });
    }

    teardownInteraction() {
        for (const [target, type, fn, opts] of this.listeners) target.removeEventListener(type, fn, opts);
        this.listeners = [];
    }

    // Only clicks on bare wallpaper count, never on homepage widgets
    isBackground(el) {
        for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
            if (n.matches && n.matches('a,button,input,select,textarea,label,[role="button"],[contenteditable="true"]')) return false;
            if (n.id && /modal|dialog|spotlight/i.test(n.id)) return false;
            const bg = getComputedStyle(n).backgroundColor;
            if (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) return false;
        }
        return true;
    }

    doorAt(x, y) {
        if (!this.model) return null;
        for (const door of this.model.doors) {
            const r = door.rect;
            if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return door;
        }
        return null;
    }

    clickDoor(door) {
        const m = this.model;
        if (door.open || door.opening) {
            if (door.open) this.openSpotlight(door, false);
            return;
        }
        if (door.day === m.today || door.day < m.today) {
            this.openDoor(door, door.day === m.today);
            return;
        }
        door.jiggleAt = this.time;
        const n = door.day - m.today;
        const lines = n === 1 ? ['tomorrow!', 'one more sleep!', 'so close!'] : [`${n} more sleeps!`, 'not yet!', 'no peeking!', `${n} days to go!`];
        this.bubbles = this.bubbles.filter(b => b.door !== door);
        this.bubbles.push({ door, text: lines[Math.floor(Math.random() * lines.length)], t0: this.time });
    }

    // Replay the whole morning: close today's door and open it again
    replayToday() {
        const door = this.model.doors[this.model.today - 1];
        door.open = false;
        door.opening = false;
        door.openK = 0;
        door.cache = null;
        this.queue.push({ door, at: this.time + 0.3, grand: this.config.ceremony !== 'quiet' });
    }

    cycleTheme(dir = 1) {
        const m = this.model;
        const { holidayThemes, seasonal } = this.themesForMonth(m.year, m.month, m.holidays);
        const list = holidayThemes.concat(seasonal);
        const idx = list.indexOf(m.theme);
        const next = list[(idx + dir + list.length) % list.length];
        this.config.themeByMonth[m.month] = next.id;
        this.saveConfig();
        this.model = null;
        this.rebuild(false);
        return next;
    }

    // -----------------------------------------------------------------------
    // Spotlight: a full-size replay of one door's treat
    // -----------------------------------------------------------------------

    openSpotlight(door, auto) {
        this.closeSpotlight(true);
        const theme = this.model.theme;
        const pal = theme.pal;
        const def = ADVENT_TREATS[door.treatId];

        const overlay = document.createElement('div');
        overlay.id = 'advent-spotlight';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 999; display: flex; align-items: center; justify-content: center;
            background: rgba(10, 8, 25, 0); transition: background 0.35s ease; cursor: pointer;
            -webkit-backdrop-filter: blur(0px); backdrop-filter: blur(0px);
        `;
        const vmin = Math.min(window.innerWidth, window.innerHeight);
        const cw = Math.round(Math.min(vmin * 0.62, 620));
        const ch = Math.round(cw * 0.8);
        const card = document.createElement('div');
        card.style.cssText = `
            background: ${pal.board}; border: ${Math.round(cw * 0.025)}px solid ${pal.frame}; border-radius: ${Math.round(cw * 0.06)}px;
            box-shadow: 0 30px 80px rgba(0,0,0,0.5); padding: ${Math.round(cw * 0.025)}px; text-align: center;
            transform-origin: center; transition: transform 0.55s cubic-bezier(.2,1.3,.4,1), opacity 0.3s ease; opacity: 0;
            max-width: 92vw;
        `;
        const canvas = document.createElement('canvas');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
        canvas.style.cssText = `width:${cw}px;height:${ch}px;max-width:86vw;max-height:${Math.round(86 * 0.8)}vw;display:block;border-radius:${Math.round(cw * 0.035)}px;`;
        const date = new Date(this.model.year, this.model.month - 1, door.day);
        const dateText = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
        const capText = door.caption || (def ? def.caption(door.params, { year: this.model.year, month: this.model.month }) : '');
        const ink = pal.boardInk || pal.ink;
        const caption = document.createElement('div');
        const title = document.createElement('div');
        title.style.font = `700 ${Math.round(cw * 0.05)}px ${ADVENT_FONT_FANCY}`;
        title.style.color = ink;
        title.style.marginTop = `${Math.round(cw * 0.03)}px`;
        title.textContent = capText;
        const sub = document.createElement('div');
        sub.style.font = `600 ${Math.round(cw * 0.028)}px ${ADVENT_FONT_ROUND}`;
        sub.style.color = advRgba(ink, 0.65);
        sub.style.marginTop = '4px';
        sub.textContent = `${door.holiday ? door.holiday.emoji + ' ' : ''}${dateText} · door ${door.day}`;
        caption.appendChild(title);
        caption.appendChild(sub);
        card.appendChild(canvas);
        card.appendChild(caption);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        // Zoom out of the door itself
        const r = door.rect;
        const scale = Math.max(0.1, r.w / (cw + 40));
        const dx = r.x + r.w / 2 - window.innerWidth / 2;
        const dy = r.y + r.h / 2 - window.innerHeight / 2;
        card.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            overlay.style.background = 'rgba(10, 8, 25, 0.45)';
            overlay.style.backdropFilter = 'blur(3px)';
            overlay.style.webkitBackdropFilter = 'blur(3px)';
            card.style.opacity = '1';
            card.style.transform = 'translate(0, 0) scale(1)';
        }));

        overlay.addEventListener('click', () => this.closeSpotlight());

        this.spotlight = {
            overlay, card, canvas, ctx: canvas.getContext('2d'), door, t0: this.time,
            auto, dx, dy, scale,
            timer: auto && this.config.spotlightSeconds > 0 ? setTimeout(() => this.closeSpotlight(), this.config.spotlightSeconds * 1000) : null
        };
    }

    drawSpotlight() {
        const sp = this.spotlight;
        this.paintTreat(sp.ctx, sp.door, sp.canvas.width, sp.canvas.height, this.time - sp.t0, true);
    }

    closeSpotlight(immediate) {
        const sp = this.spotlight;
        if (!sp) return;
        this.spotlight = null;
        if (sp.timer) clearTimeout(sp.timer);
        if (immediate) {
            sp.overlay.remove();
            return;
        }
        sp.overlay.style.background = 'rgba(10, 8, 25, 0)';
        sp.overlay.style.backdropFilter = 'blur(0px)';
        sp.overlay.style.webkitBackdropFilter = 'blur(0px)';
        sp.card.style.transition = 'transform 0.4s ease-in, opacity 0.4s ease-in';
        sp.card.style.transform = `translate(${sp.dx}px, ${sp.dy}px) scale(${sp.scale})`;
        sp.card.style.opacity = '0';
        setTimeout(() => sp.overlay.remove(), 420);
    }
    // -----------------------------------------------------------------------
    // Settings dialog
    // -----------------------------------------------------------------------

    defaults() {
        return WP.settings.defaults();
    }
}
