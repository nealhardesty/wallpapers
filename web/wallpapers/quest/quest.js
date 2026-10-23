// ============================================================================
// Pixel Quest -- a self-playing 8-bit adventure wallpaper
//
// A hero of your choosing (a knight, a cat, a duck with a very loud quack...)
// wanders a randomly generated overworld, scrolling screen to screen the old
// way, ducking into caves for gifts and naps, dropping down warp holes, and
// clearing dungeons for the pieces of whatever the villain broke this time.
// When every piece is home, the credits roll and a new world is made.
//
// The whole game renders into a small low-resolution canvas (16px tiles) that
// is scaled up with nearest-neighbour sampling, so every pixel stays crisp.
// Art comes from quest-art.js, worlds from quest-world.js.
// ============================================================================

const QuestEngineData = (() => {
    const QA = QuestArt;
    const QW = QuestWorld;
    const T = QW.T;

    const WEAPONS = {
        sword: { kind: 'melee', reach: 12, width: 10, dur: 0.24, cd: 0.32, style: 'blade', blade: '#e8e8f8', bladeLo: '#9898b8', hilt: '#a86c38', guard: '#fcc800' },
        carrot: { kind: 'melee', reach: 11, width: 10, dur: 0.24, cd: 0.3, style: 'blade', blade: '#f88818', bladeLo: '#c05808', hilt: '#38b838', guard: '#58d838' },
        claw: { kind: 'melee', reach: 10, width: 14, dur: 0.18, cd: 0.22, style: 'claw' },
        pan: { kind: 'melee', reach: 12, width: 16, dur: 0.3, cd: 0.42, style: 'pan', knock: 1.6 },
        tongue: { kind: 'tongue', reach: 44, dur: 0.36, cd: 0.45 },
        starbolt: { kind: 'shot', proj: 'star', speed: 150, cd: 0.5, range: 220 },
        laser: { kind: 'shot', proj: 'laser', speed: 250, cd: 0.42, range: 260 },
        shuriken: { kind: 'shot', proj: 'shuriken', speed: 175, cd: 0.38, range: 220 },
        snowball: { kind: 'shot', proj: 'snowball', speed: 140, cd: 0.42, range: 180 },
        bone: { kind: 'boomerang', proj: 'bone', speed: 165, range: 84, cd: 0.25 },
        quack: { kind: 'wave', radius: 28, dur: 0.34, cd: 0.7, word: 'QUACK!', color: '#fce048' },
        bark: { kind: 'wave', radius: 28, dur: 0.34, cd: 0.7, word: 'WOOF!', color: '#fcfcfc' },
        spores: { kind: 'wave', radius: 26, dur: 0.4, cd: 0.75, word: null, color: '#c8fc78' },
        splat: { kind: 'wave', radius: 24, dur: 0.3, cd: 0.65, word: 'SPLAT!', color: '#88fc88' },
        moo: { kind: 'wave', radius: 30, dur: 0.38, cd: 0.72, word: 'MOO!', color: '#fcfcfc' },
        bump: { kind: 'wave', radius: 24, dur: 0.3, cd: 0.6, word: 'THUD!', color: '#d8b888' },
        bellow: { kind: 'wave', radius: 32, dur: 0.4, cd: 0.78, word: 'HRRMPH!', color: '#e0c890' },
        whistle: { kind: 'wave', radius: 26, dur: 0.32, cd: 0.62, word: 'EEEP!', color: '#fcfcb0' },
        pebble: { kind: 'shot', proj: 'rock', speed: 160, cd: 0.4, range: 200 },
        flop: { kind: 'wave', radius: 30, dur: 0.36, cd: 0.75, word: 'FLOMP!', color: '#fce8c8' }
    };
    // The pumpkin knight swings a broom-handled scythe; same reach as a sword
    WEAPONS.scythe = { ...WEAPONS.sword, blade: '#c8c8d8', hilt: '#7c4c1c', guard: '#7c4c1c' };

    // `heal` scales how often a beaten monster leaves a heart behind, and is
    // the dial normal is tuned with: density on its own barely registers,
    // because more monsters also means more hearts, and enemy health only
    // comes in whole points. Enemy speed is deliberately left at 1 here --
    // it multiplies boss speed as well, and a 10% bump there cost the chargers
    // half their win rate, undoing the boss tuning.
    const DIFFICULTY = {
        peaceful: { name: 'Peaceful (monsters are harmless)', dmg: 0, hp: 0, speed: 0.85, density: 0.6, heroHp: 1, heal: 1 },
        easy: { name: 'Easy', dmg: 1, hp: -1, speed: 0.9, density: 0.75, heroHp: 1, heal: 1 },
        normal: { name: 'Normal', dmg: 1, hp: 0, speed: 1, density: 1.25, heroHp: 0, heal: 0.35 },
        hard: { name: 'Hard', dmg: 2, hp: 1, speed: 1.15, density: 1.35, heroHp: 0, heal: 0.35 },
        pacifist: { name: 'Pacifist (befriend, don\'t defeat)', dmg: 1, hp: 0, speed: 1, density: 1, heroHp: 0, heal: 1, befriend: true }
    };

    const CURRENCY_ICON = { gem: 'gem', fish: 'fish', star: 'star', coin: 'coin', bug: 'bug', bolt: 'bolt', bread: 'bread', acorn: 'acorn', bone: 'bone', candy: 'candy', milk: 'milk' };

    const ITEM_INFO = {
        boomerang: { name: 'BOOMERANG', desc: 'IT ALWAYS COMES BACK.', icon: 'boomerang' },
        bombs: { name: 'BOMB BAG', desc: 'HANDLE WITH CARE.', icon: 'bomb' },
        candle: { name: 'MAGIC CANDLE', desc: 'LIGHTS UP THE DARK.', icon: 'candle' },
        boots: { name: 'ZOOMY BOOTS', desc: 'GOTTA GO FAST.', icon: 'boots' },
        shield: { name: 'SHIELD', desc: 'BLOCKS ROCKS AND RUDENESS.', icon: 'shield' },
        glove: { name: 'POWER GLOVE', desc: 'HITS TWICE AS HARD.', icon: 'glove' },
        heartContainer: { name: 'HEART CONTAINER', desc: 'MORE HEART!', icon: 'heartContainer' },
        heartPiece: { name: 'PIECE OF HEART', desc: '', icon: 'heartPiece' },
        potion: { name: 'RED POTION', desc: 'A SECOND CHANCE IN A BOTTLE.', icon: 'potion' },
        key: { name: 'SMALL KEY', desc: '', icon: 'key' },
        cowbell: { name: 'GOLDEN COWBELL', desc: 'MORE COWBELL!', icon: 'cowbell' }
    };
    const UPGRADE_ORDER = ['boomerang', 'bombs', 'candle', 'boots', 'shield', 'glove'];

    // Default object colours; biome palettes may tint the listed letters
    const OBJ_PAL = {
        tree: { g: '#00a800', G: '#005800', l: '#58d854', t: '#ac7c00', T: '#6c4c00' },
        pine: { g: '#187848', G: '#0c4828', l: '#38a868', t: '#7c4c1c', T: '#4c2c08' },
        deadtree: { t: '#6c5c58', T: '#3c3030' },
        palm: { g: '#38b838', G: '#187818', l: '#78e858', t: '#a86c38', T: '#7c4c20', y: '#d8a038' },
        bush: { g: '#00a800', G: '#005800', l: '#58d854' },
        rock: { r: '#a8a8a8', R: '#686868', l: '#e0e0e0' },
        boulder: { r: '#a8a8a8', R: '#686868', l: '#e0e0e0' },
        tomb: { s: '#a8a8b8', S: '#686878', l: '#d8d8e8', g: '#3c5c40' },
        cactus: { g: '#58b838', G: '#287818', l: '#98e868', p: '#f878b8' },
        mushroom: { r: '#e83030', R: '#a01818', w: '#fcfcfc', s: '#fce0b8', S: '#d8b088' },
        shroomlet: { r: '#e83030', R: '#a01818', w: '#fcfcfc', s: '#fce0b8', S: '#d8b088' },
        lollipop: { p: '#f85898', P: '#b81860', w: '#fcfcfc', W: '#d8d8d8' },
        candycane: { w: '#fcfcfc', r: '#e83030' },
        gumdrop: { p: '#58d838', P: '#289818', w: '#fcfcfc' },
        snowpile: { w: '#fcfcfc', W: '#b8d0e8' },
        stump: { t: '#7c4c1c', T: '#4c2c08', l: '#c89858' },
        statue: { s: '#a8a8b8', S: '#686878', k: '#140c1c', l: '#d8d8e8' },
        sign: { b: '#a87038', B: '#6c4418', w: '#fce0a8' },
        crystal: { c: '#a8e8fc', C: '#58a8d8', l: '#fcfcfc', s: '#686878' },
        fence: { b: '#d09858', B: '#8c5c28' },
        torch: { s: '#a8a8b8', S: '#686878', l: '#d8d8e8', d: '#3c3c48' },
        pedestal: { w: '#e8e8f0', W: '#a8a8b8', l: '#fcfcfc', s: '#c8c8d8' },
        skull: { w: '#e8e8d8', W: '#a8a898', k: '#140c1c' },
        pot: { b: '#c87838', B: '#8c4c18', l: '#e8a868' },
        bed: { b: '#a87038', B: '#6c4418', w: '#fcfcfc', r: '#3c78d8', R: '#1c3c88' },
        box: { b: '#c89858', B: '#8c6430', w: '#fce0a8' },
        table: { b: '#a87038', B: '#6c4418', l: '#c89058' },
        leafpile: { o: '#f88818', y: '#fcd848', r: '#e83818', R: '#8c3818' },
        lilypad: { g: '#38a838', G: '#187818', l: '#68d858', p: '#f878b8' },
        pumpkin: { o: '#f88818', O: '#b85808', g: '#38a838' },
        haybale: { y: '#e8c048', Y: '#b88c20', b: '#a85c28' }
    };
    const TINT = {
        tree: 'gGltT', pine: 'gGltT', bush: 'gGl', palm: 'gGltTy', deadtree: 'tT', stump: 'tT',
        rock: 'rR', boulder: 'rR', cactus: 'gGlp', tomb: 'sSlg', crystal: 'cC', statue: 'sS'
    };
    const BIOME_OBJ_PAL = {
        mushroom: { mushroom: { r: '#c83cc8', R: '#882088', w: '#f8e8fc' }, shroomlet: { r: '#5888f8', R: '#2848b8', w: '#d8f0fc' } },
        snow: { rock: { r: '#b8c8d8', R: '#788898', l: '#fcfcfc' }, boulder: { r: '#b8c8d8', R: '#788898', l: '#fcfcfc' } },
        graveyard: { statue: { s: '#787888', S: '#4c4c5c' } },
        candy: { gumdrop: { p: '#58d838', P: '#289818' } }
    };

    const NPCS = {
        oldman: { kind: 'humanoid', head: 'beard', body: 'robe', pal: { k: '#fcc89c', K: '#e0a070', p: '#f89888', e: '#140c1c', w: '#fcfcfc', h: '#fcfcfc', H: '#c8c8c8', c: '#c84c0c', C: '#801c00', a: '#fcc800', b: '#801c00' } },
        oldcat: { kind: 'cat', hat: 'tophat', pal: { f: '#a8a8b8', F: '#787888', s: '#787888', q: '#a8a8b8', w: '#fcfcfc', p: '#f8a8b8', e: '#fcd800', n: '#f8a8b8', d: '#a8a8b8' } },
        owl: { kind: 'bird', hat: 'grad', pal: { f: '#a87848', F: '#7c5030', w: '#f0d8a8', b: '#fcc800', e: '#140c1c', l: '#fcc800' } },
        frogrobe: { kind: 'humanoid', head: 'frog', body: 'robe', pal: { k: '#68c838', K: '#389018', w: '#fcfcfc', e: '#140c1c', m: '#1c4c10', p: '#f89888', c: '#f878b8', C: '#c03878', a: '#fcfcfc', b: '#c03878' } },
        shopkeeper: { kind: 'humanoid', head: 'kid', body: 'robe', hat: 'tophat', pal: { k: '#fcc89c', K: '#e0a070', p: '#f89888', e: '#140c1c', w: '#fcfcfc', h: '#7c3c10', H: '#501c00', c: '#38a8f8', C: '#1868b8', a: '#fcc800', b: '#1868b8' } },
        villager0: { kind: 'humanoid', head: 'longhair', body: 'robe', hat: 'flower', pal: { k: '#fcc89c', K: '#e0a070', p: '#f89888', e: '#140c1c', w: '#fcfcfc', h: '#d8d8d8', H: '#a8a8a8', c: '#a858d8', C: '#6c2c98', a: '#fcfcfc', b: '#6c2c98' } },
        villager1: { kind: 'humanoid', head: 'kid', body: 'tunic', hat: 'beanie', pal: { k: '#c88050', K: '#a05c30', p: '#e07060', e: '#140c1c', w: '#fcfcfc', h: '#2c1c14', H: '#140c0c', c: '#e8a038', C: '#b06818', a: '#5c3418', b: '#5c3418' } },
        villager2: { kind: 'cat', hat: 'bow', pal: { f: '#fcfcfc', F: '#d0d0dc', s: '#fcfcfc', q: '#fcfcfc', w: '#fcfcfc', p: '#f8a8b8', e: '#3cbcfc', n: '#f8a8b8', d: '#fcfcfc' } },
        villager3: { kind: 'humanoid', head: 'beard', body: 'robe', hat: 'chef', pal: { k: '#fcc89c', K: '#e0a070', p: '#f89888', e: '#140c1c', w: '#fcfcfc', h: '#a8a8a8', H: '#787878', c: '#fcfcfc', C: '#c8c8d8', a: '#e83030', b: '#787878' } }
    };
    const SAGE_NPC = { 'Old Man': 'oldman', 'Old Cat': 'oldcat', 'Wise Owl': 'owl', 'Frog in a Bathrobe': 'frogrobe' };

    const FILTERS = {
        none: { name: 'NES (as drawn)' },
        gameboy: { name: 'Game Boy', ramp: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
        pocket: { name: 'Game Boy Pocket', ramp: ['#181818', '#4c4c4c', '#9c9c9c', '#e8e8e8'] },
        virtualboy: { name: 'Virtual Boy', ramp: ['#000000', '#550000', '#aa0000', '#ff2020'] },
        cga: { name: 'CGA', nearest: ['#000000', '#55ffff', '#ff55ff', '#ffffff'] },
        pastel: { name: 'Pastel Dream' },
        sepia: { name: 'Old Photograph' },
        noir: { name: 'Film Noir' },
        sunset: { name: 'Golden Hour' },
        nightvision: { name: 'Night Vision', ramp: ['#001400', '#004c10', '#18a838', '#a8fca8'] }
    };

    return { QA, QW, T, WEAPONS, DIFFICULTY, CURRENCY_ICON, ITEM_INFO, UPGRADE_ORDER, OBJ_PAL, TINT, BIOME_OBJ_PAL, NPCS, SAGE_NPC, FILTERS };
})();

// ----------------------------------------------------------------------------
// Sprite bank: bakes character maps into canvases once, then hands them out
// ----------------------------------------------------------------------------
// Max hearts a hero can grow to; beyond that, containers just refill
const MAX_HEARTS = 10;

class QuestSpriteBank {
    constructor() {
        this.cache = new Map();
    }

    get(key, make) {
        let v = this.cache.get(key);
        if (!v) { v = make(); this.cache.set(key, v); }
        return v;
    }

    icon(name) {
        const QA = QuestArt;
        return this.get('icon:' + name, () => {
            const d = QA.ICONS[name] || QA.ICONS.heart;
            return new QA.PixelGrid(8, 8).stamp(d.rows, d.pal).toCanvas();
        });
    }

    // Icons dropped in the world get an outline so they read on any ground
    pickup(name) {
        const QA = QuestArt;
        return this.get('pick:' + name, () => {
            const d = QA.ICONS[name] || QA.ICONS.heart;
            return new QA.PixelGrid(10, 10).stamp(d.rows, d.pal, 1, 1).outline(QA.OUTLINE).toCanvas();
        });
    }

    composeFigure(def, pal, hatKey, view, frame) {
        const QA = QuestArt;
        const g = new QA.PixelGrid(16, 20);
        let anchor;
        if (def.kind === 'humanoid') {
            const body = QA.BODIES[def.body], head = QA.HEADS[def.head];
            g.stamp(view === 'side' ? body.side[frame] : body.down, pal, 0, body.y);
            g.stamp(head[view], pal, 0, head.y);
            // Ears and antennae belong to the hero; caps and crowns give way to a chosen hat
            const species = ['bunnyears', 'foxears', 'roundears', 'pointyears', 'tinyears', 'antlers', 'antenna'].includes(def.gear);
            const gear = def.gear && (species || hatKey === 'none' || !hatKey) ? QA.GEARS[def.gear] : null;
            if (gear) g.stamp(gear[view] || gear.down, pal, 0, gear.y);
            const dy = def.head === 'frog' ? 0 : def.head === 'pumpkin' ? 1 : 2;
            anchor = [view === 'side' ? 7 : 8, head.y + dy];
        } else {
            const t = QA.TEMPLATES[def.kind];
            g.stamp(view === 'side' ? t.side[frame] : t[view], { o: pal.f, ...pal }, 0, 0);
            anchor = t.hat[view];
        }
        if (hatKey && hatKey !== 'none' && QA.HATS[hatKey] && QA.HATS[hatKey].rows) {
            const hat = QA.HATS[hatKey];
            g.stamp(hat.rows, hat.pal, anchor[0] - 5, anchor[1] - hat.rows.length + 1 - (hat.float ? 2 : 0));
        }
        g.outline(QA.OUTLINE);
        return g.toCanvas();
    }

    // Four facings, two frames each, plus white silhouettes for the hit flash
    figure(cacheKey, def, pal, hatKey) {
        const QA = QuestArt;
        return this.get('fig:' + cacheKey + ':' + hatKey, () => {
            const down0 = this.composeFigure(def, pal, hatKey, 'down', 0);
            const up0 = this.composeFigure(def, pal, hatKey, 'up', 0);
            const r0 = this.composeFigure(def, pal, hatKey, 'side', 0);
            const r1 = this.composeFigure(def, pal, hatKey, 'side', 1);
            const set = {
                down: [down0, QA.flipCanvas(down0)],
                up: [up0, QA.flipCanvas(up0)],
                right: [r0, r1],
                left: [QA.flipCanvas(r0), QA.flipCanvas(r1)]
            };
            set.flash = {};
            set.red = {};
            for (const d of ['down', 'up', 'right', 'left']) {
                set.flash[d] = set[d].map(c => QA.silhouette(c, '#fcfcfc'));
                set.red[d] = set[d].map(c => QA.silhouette(c, '#f83838'));
            }
            return set;
        });
    }

    hero(heroKey, variant, hatKey) {
        const def = QuestArt.HEROES[heroKey];
        const v = def.variants[Math.max(0, Math.min(def.variants.length - 1, variant))];
        return this.figure('hero:' + heroKey + ':' + variant, def, v.pal, hatKey || 'none');
    }

    npc(key) {
        const def = QuestEngineData.NPCS[key];
        return this.figure('npc:' + key, def, def.pal, def.hat || 'none');
    }

    enemy(type) {
        const QA = QuestArt;
        return this.get('enemy:' + type, () => {
            const def = QA.ENEMIES[type];
            const src = def.ref ? QA.ENEMIES[def.ref] : def;
            let maps;
            if (src.half) maps = src.half.map(QA.half);
            else maps = src.frames.slice();
            if (src.flipB || maps.length === 1) maps = [maps[0], QA.flipRows(maps[0])];
            const frames = maps.map(m => new QA.PixelGrid(16, 16).stamp(m, def.pal).outline(QA.OUTLINE).toCanvas());
            return {
                frames,
                flipped: frames.map(QA.flipCanvas),
                flash: frames.map(c => QA.silhouette(c, '#fcfcfc')),
                hearts: frames.map(c => QA.silhouette(c, '#f878b8'))
            };
        });
    }

    boss(kind) {
        const QA = QuestArt;
        return this.get('boss:' + kind, () => {
            const frames = [QA.paintBoss(kind, 0), QA.paintBoss(kind, 1)];
            return {
                frames,
                flipped: frames.map(QA.flipCanvas),
                flash: frames.map(c => QA.silhouette(c, '#fcfcfc'))
            };
        });
    }

    companion(key) {
        const QA = QuestArt;
        return this.get('comp:' + key, () => {
            const d = QA.COMPANIONS[key];
            const frames = d.frames.map(f => new QA.PixelGrid(10, 10).stamp(f, d.pal, 1, 1).outline(QA.OUTLINE).toCanvas());
            return { frames, flipped: frames.map(QA.flipCanvas) };
        });
    }

    object(name, biomeKey, biomePal) {
        const QA = QuestArt, D = QuestEngineData;
        return this.get('obj:' + name + ':' + biomeKey, () => {
            const def = QA.OBJECTS[name];
            if (!def || !def.rows) return null;
            const pal = { ...(D.OBJ_PAL[name] || {}) };
            const tint = D.TINT[name];
            if (tint && biomePal) {
                for (const ch of tint) if (biomePal[ch]) pal[ch] = biomePal[ch];
                if ((name === 'rock' || name === 'boulder') && biomePal.r) pal.l = QA.shade(biomePal.r, 0.4);
            }
            const over = D.BIOME_OBJ_PAL[biomeKey] && D.BIOME_OBJ_PAL[biomeKey][name];
            if (over) Object.assign(pal, over);
            const g = new QA.PixelGrid(16, 16).stamp(def.rows, pal);
            if (!def.noOutline) g.outline(QA.OUTLINE);
            return g.toCanvas();
        });
    }

    // Dungeon blocks take the dungeon's colours
    block(theme) {
        const QA = QuestArt;
        return this.get('block:' + theme.name, () => new QA.PixelGrid(16, 16)
            .stamp(QA.OBJECTS.block.rows, { l: theme.wallHi, s: theme.block, d: theme.wallLo }).toCanvas());
    }

    // Bitmap font, one atlas per colour
    font(color) {
        return this.get('font:' + color, () => {
            const QA = QuestArt;
            const chars = Object.keys(QA.FONT);
            const cv = document.createElement('canvas');
            cv.width = chars.length * 4;
            cv.height = 5;
            const ctx = cv.getContext('2d');
            ctx.fillStyle = color;
            const index = {};
            chars.forEach((ch, i) => {
                index[ch] = i;
                const bits = QA.FONT[ch];
                for (let p = 0; p < 15; p++) if (bits[p] === '#') ctx.fillRect(i * 4 + (p % 3), (p / 3) | 0, 1, 1);
            });
            cv.index = index;
            return cv;
        });
    }
}

// ----------------------------------------------------------------------------
// The game
// ----------------------------------------------------------------------------
// How long the player keeps the reins after their last keypress before the
// autopilot takes over again. Three seconds was enough to nudge the hero but
// far too short to fight anything, so a held room now outlasts a scrap.
const QUEST_MANUAL_HOLD = 8;

// How far a boss is held back from the spot the hero walked in on, for as long
// as the room has yet to seal behind them. The hero lands six pixels inside the
// wall and has to cross the door tunnel before the shutters close, and three
// pixels of that is all it takes to be counted as having left again -- so a
// boss sitting on the doorway had a free hit that threw them straight back out.
const QUEST_ENTRANCE_CLEARANCE = 80;

// What the watchdog counts as getting somewhere: the hero has to range further
// than this -- the width plus the height of the box they have stayed inside,
// so seven tiles' worth -- before it accepts that they are making progress.
const QUEST_STUCK_SPAN = 112;
// And how long inside that box is too long. A fight is a fair reason to hold
// one spot, so it gets a far longer rope. Over eight hours of autopilot, play
// that was actually going somewhere never held a box past 7s with the room
// clear or past 15s mid-fight, while the loops this is here to break ran for
// minutes -- so both numbers sit in a wide empty gap.
const QUEST_STUCK_CLEAR = 12;
const QUEST_STUCK_FIGHTING = 25;

class QuestAnimationManager {
    constructor(host) {
        this.host = host;
        this.canvas = null;
        this.ctx = null;
        this.isEnabled = false;
        this.animationId = null;
        this.sprites = new QuestSpriteBank();

        this.low = null;          // low-resolution game canvas
        this.lctx = null;
        this.roomCanvas = null;   // static art for the current room
        this.lightCanvas = null;
        this.listeners = [];

        this.config = WP.settings.load();
        this.resetState();
    }

    resetState() {
        this.world = null;
        this.hero = null;
        this.room = null;
        this.area = null;
        this.enemies = [];
        this.projectiles = [];
        this.pickups = [];
        this.effects = [];
        this.critters = [];
        this.particles = [];
        this.companions = [];
        this.trail = [];
        this.mode = 'idle';
        this.time = 0;
        this.acc = 0;
        this.shake = 0;
        this.banner = null;
        this.dialog = null;
        this.manual = { active: false, t: 0, keys: {}, attack: false, interact: false, bomb: false };
        this.paused = false;
    }

    // -----------------------------------------------------------------------
    // Config persistence
    // -----------------------------------------------------------------------
    saveConfig() {
        WP.settings.save(this.config);
    }

    // -----------------------------------------------------------------------
    // Canvas and layout
    // -----------------------------------------------------------------------
    async init() {
        this.createCanvas();
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'quest-canvas';
        this.canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:-1;display:none;image-rendering:pixelated;';
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        document.body.appendChild(this.canvas);

        this._onResize = () => {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => this.handleResize(), 250);
        };
        window.addEventListener('resize', this._onResize);
    }

    computeLayout() {
        const c = this.config;
        const W = window.innerWidth;
        const H = Math.max(200, window.innerHeight - this.host.insets.bottom);
        const targetCols = { cozy: 14, classic: 18, roomy: 24, vast: 30 }[c.roomSize] || 18;
        const hudH = c.hud === 'off' ? 0 : 16;
        let cols = targetCols;
        let scale = W / (cols * 16);
        let rows = Math.floor((H / scale - hudH) / 16);
        // A tall, narrow window: fit height instead and use fewer columns
        if (rows < 7) {
            rows = 7;
            scale = H / (rows * 16 + hudH);
            cols = Math.max(10, Math.floor(W / scale / 16));
        }
        // Bigger screen sizes allow taller rooms; past the cap, fit height
        // with fewer columns so the room still fills the screen
        const maxRows = Math.max(24, Math.round(targetCols * 4 / 3));
        if (rows > maxRows) {
            rows = maxRows;
            scale = H / (rows * 16 + hudH);
            cols = Math.max(10, Math.floor(W / scale / 16));
        }
        this.layout = { W, H, cols, rows, hudH, scale, lowW: cols * 16, lowH: rows * 16 + hudH };
        this.layout.roomY = c.hud === 'top' ? hudH : 0;
        this.layout.hudY = c.hud === 'top' ? 0 : rows * 16;
    }

    sizeCanvases() {
        const L = this.layout;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.dpr = dpr;
        this.canvas.width = Math.round(window.innerWidth * dpr);
        this.canvas.height = Math.round(window.innerHeight * dpr);
        if (!this.low) {
            this.low = document.createElement('canvas');
            this.lctx = this.low.getContext('2d');
            this.lightCanvas = document.createElement('canvas');
            this.lightCtx = this.lightCanvas.getContext('2d');
        }
        this.low.width = L.lowW;
        this.low.height = L.lowH;
        this.sizeLight();
        this.lctx.imageSmoothingEnabled = false;
        this.crtCanvas = null;
    }

    // The light map runs at half resolution on Low: chunkier rings, which
    // suit 8-bit anyway, for a quarter of the fill.
    sizeLight() {
        const L = this.layout;
        this.lightScale = this.host.quality.tier === 'low' ? 0.5 : 1;
        this.lightCanvas.width = Math.ceil(L.cols * 16 * this.lightScale);
        this.lightCanvas.height = Math.ceil(L.rows * 16 * this.lightScale);
    }

    // A new tier (SPEC §4.8): the light map's size; CRT is read per frame.
    onQuality() {
        if (this.lightCanvas && this.layout) this.sizeLight();
    }

    handleResize() {
        if (!this.canvas) return;
        const before = this.layout;
        this.computeLayout();
        this.sizeCanvases();
        if (!this.isEnabled) return;
        // Rooms are built for a grid size; a different grid means a new world
        if (!before || before.cols !== this.layout.cols || before.rows !== this.layout.rows) {
            this.newQuest({ keepHero: true, quiet: true });
        } else {
            this.renderRoom();
        }
    }

    start() {
        if (this.isEnabled) return;
        if (!this.canvas) this.createCanvas();
        this.isEnabled = true;
        this.canvas.style.display = 'block';
        this.computeLayout();
        this.sizeCanvases();
        if (!this.world || this.world.cols !== this.layout.cols || this.world.rows !== this.layout.rows) this.newQuest({});
        this.setupInteraction();
        this.setupTouchControls();
        this.paused = false;
        this.lastTime = performance.now();
        this.animate();
        console.log('Pixel Quest started');
    }

    stop() {
        if (!this.isEnabled) return;
        this.isEnabled = false;
        if (this.canvas) this.canvas.style.display = 'none';
        this.teardownInteraction();
        this.destroyTouchControls();
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('Pixel Quest stopped');
    }

    destroy() {
        this.stop();
        if (this._onResize) window.removeEventListener('resize', this._onResize);
        if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
        this.canvas = null;
    }

    // -----------------------------------------------------------------------
    // Interaction: optional keyboard takeover and click-to-guide
    // -----------------------------------------------------------------------
    setupInteraction() {
        this.teardownInteraction();
        const on = (target, type, fn, opts) => {
            target.addEventListener(type, fn, opts);
            this.listeners.push([target, type, fn, opts]);
        };
        if (this.config.keyboard) {
            // P is deliberately absent: the standalone page already uses it to
            // cycle the palette, so pause lives on Enter instead.
            const map = {
                ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
                w: 'up', s: 'down', a: 'left', d: 'right',
                ' ': 'attack', j: 'attack',
                e: 'interact', k: 'interact',
                b: 'bomb',
                Enter: 'pause', Escape: 'release'
            };
            // One-shot actions fire on the press; movement is a held state
            const ONCE = { attack: 1, interact: 1, bomb: 1 };
            on(document, 'keydown', (e) => {
                if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
                if (e.target && e.target.closest && e.target.closest('[contenteditable]')) return;
                // Cmd/Ctrl shortcuts: macOS never sends the matching keyup, so
                // treating Cmd+S as "hold S" would leave the hero stuck walking
                if (e.metaKey || e.ctrlKey || e.altKey) return;
                const k = map[e.key] || map[e.key.toLowerCase()];
                if (!k) return;
                e.preventDefault();

                if (k === 'pause') { this.paused = !this.paused; return; }
                if (k === 'release') {
                    // Give the reins straight back rather than waiting it out
                    this.manual.active = false;
                    this.manual.keys = {};
                    this.paused = false;
                    return;
                }

                // Anything else means the player wants control
                this.beginManual();
                if (ONCE[k]) { if (this.hero) this.manual[k] = true; }
                else this.manual.keys[k] = true;
            });
            on(document, 'keyup', (e) => {
                const k = map[e.key] || map[e.key.toLowerCase()];
                if (k && !ONCE[k]) this.manual.keys[k] = false;
            });
            const release = () => { this.manual.keys = {}; };
            on(window, 'blur', release);
            on(document, 'visibilitychange', release);
        }
        if (this.config.clickToGuide) {
            on(document, 'click', (e) => {
                if (e.target && e.target.closest && e.target.closest('a,button,input,select,textarea,label,[contenteditable],#quest-touch')) return;
                this.guideTo(e.clientX, e.clientY);
            });
        }
    }

    teardownInteraction() {
        for (const [t, type, fn, opts] of this.listeners) t.removeEventListener(type, fn, opts);
        this.listeners = [];
    }

    // Taking over by touch means exactly what taking over by key means: the
    // player keeps the reins until QUEST_MANUAL_HOLD seconds after they stop.
    beginManual() {
        this.manual.active = true;
        this.manual.t = QUEST_MANUAL_HOLD;
        this.paused = false;
    }

    // Pause, and the PAUSED overlay, only mean something when someone can
    // actually take over -- with a keyboard, or now with a thumb
    get playable() {
        return !!(this.config.keyboard || this.config.touchControls);
    }

    // -----------------------------------------------------------------------
    // On-screen touch controller
    //
    // A D-pad on one side, attack / interact / pause / settings on the other,
    // for playing on a phone or tablet where there is no keyboard at all. Off
    // by default; the settings dialog turns it on and sizes and places it.
    // -----------------------------------------------------------------------
    // `view` builds the controller from a set of settings that have not been
    // committed, which is how the settings dialog previews one live; with no
    // view it is built from the saved config.
    setupTouchControls(view) {
        this.destroyTouchControls();
        const c = view || this.config;
        if (!c.touchControls) return;
        this.injectTouchStyles();

        const root = document.createElement('div');
        root.id = 'quest-touch';
        this.styleTouchControls(c, root);

        // --- D-pad. The four arrows form the plus, but the whole 3x3 grid
        // takes the pointer rather than each arrow on its own: that way a
        // thumb sliding from up to left changes direction without lifting,
        // and the corners read as diagonals, the way a real pad does.
        const pad = document.createElement('div');
        pad.className = 'qt-pad';
        const cells = {};
        for (const [dir, glyph] of [['up', '\u25b2'], ['left', '\u25c0'], ['right', '\u25b6'], ['down', '\u25bc']]) {
            const cell = document.createElement('div');
            cell.className = 'qt-cell qt-' + dir;
            cell.textContent = glyph;
            pad.appendChild(cell);
            cells[dir] = cell;
        }
        const centre = document.createElement('div');
        centre.className = 'qt-centre';
        pad.appendChild(centre);

        const DIRS = ['up', 'down', 'left', 'right'];
        // Anything closer to the middle than this counts as no direction at
        // all, so resting a thumb on the pad does not walk the hero off
        const DEAD = 0.3;
        let padId = null;
        const applyPad = (x, y) => {
            const r = pad.getBoundingClientRect();
            const nx = (x - (r.left + r.width / 2)) / (r.width / 2);
            const ny = (y - (r.top + r.height / 2)) / (r.height / 2);
            const k = this.manual.keys;
            k.left = nx < -DEAD;
            k.right = nx > DEAD;
            k.up = ny < -DEAD;
            k.down = ny > DEAD;
            for (const d of DIRS) cells[d].classList.toggle('on', !!k[d]);
        };
        const releasePad = () => {
            padId = null;
            this.manual.keys = {};
            for (const d of DIRS) cells[d].classList.remove('on');
        };
        pad.addEventListener('pointerdown', (e) => {
            if (padId !== null) return;
            padId = e.pointerId;
            // Capture so a thumb that wanders off the pad keeps steering
            try { pad.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
            e.preventDefault();
            this.beginManual();
            this.syncTouchPause();
            applyPad(e.clientX, e.clientY);
        });
        pad.addEventListener('pointermove', (e) => {
            if (e.pointerId !== padId) return;
            e.preventDefault();
            this.manual.t = QUEST_MANUAL_HOLD;
            applyPad(e.clientX, e.clientY);
        });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
            pad.addEventListener(type, (e) => { if (e.pointerId === padId) releasePad(); });
        }

        // --- Actions. Attack and interact sit lowest and largest, under the
        // thumb; pause and settings are smaller and out of the way above.
        const acts = document.createElement('div');
        acts.className = 'qt-acts';
        const mini = document.createElement('div');
        mini.className = 'qt-row';
        const main = document.createElement('div');
        main.className = 'qt-row';
        acts.appendChild(mini);
        acts.appendChild(main);

        const button = (parent, cls, glyph, label, press) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'qt-btn ' + cls;
            b.textContent = glyph;
            b.title = label;
            b.setAttribute('aria-label', label);
            // Never focusable: a focused button would answer Space and Enter
            // as well, double-firing against the keyboard controls
            b.tabIndex = -1;
            // pointerdown, not click: a tap has to register immediately
            b.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                b.classList.add('on');
                press();
            });
            const off = () => b.classList.remove('on');
            for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, off);
            b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
            parent.appendChild(b);
            return b;
        };

        const pause = button(mini, 'qt-mini', '\u23f8\ufe0f', 'Pause', () => {
            this.paused = !this.paused;
            this.syncTouchPause();
        });
        button(mini, 'qt-mini', '\u2699\ufe0f', 'Settings', () => WP.stage.openPanel());
        // Bomb is the odd one out -- situational, and only once the bag has
        // turned up -- so it is the small one, furthest from the thumb
        button(main, 'qt-mini qt-bomb', '\ud83d\udca3', 'Bomb \u2014 once you have the bag', () => {
            this.beginManual();
            this.syncTouchPause();
            if (this.hero) this.manual.bomb = true;
        });
        button(main, 'qt-act qt-interact', '\u270b', 'Interact \u2014 doors, signs, chests', () => {
            this.beginManual();
            this.syncTouchPause();
            if (this.hero) this.manual.interact = true;
        });
        button(main, 'qt-act qt-attack', '\u2694\ufe0f', 'Attack', () => {
            this.beginManual();
            this.syncTouchPause();
            if (this.hero) this.manual.attack = true;
        });

        root.appendChild(pad);
        root.appendChild(acts);
        document.body.appendChild(root);

        // A backgrounded tab never sends the matching pointerup
        const onBlur = () => releasePad();
        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onBlur);

        this.touch = { root, pause, paused: null, onBlur };
        this.syncTouchPause();
    }

    // Size, corner and side, applied to a controller that already exists. The
    // settings dialog restyles the real thing rather than rebuilding it on
    // every tick of the size slider.
    styleTouchControls(opts, root) {
        root = root || (this.touch && this.touch.root);
        if (!root) return;
        root.dataset.pos = opts.touchPosition || 'bottom';
        if (opts.touchSwap) root.dataset.swap = '1';
        else delete root.dataset.swap;
        root.style.setProperty('--qt-s', String(opts.touchScale || 1));
    }

    destroyTouchControls() {
        if (!this.touch) return;
        window.removeEventListener('blur', this.touch.onBlur);
        document.removeEventListener('visibilitychange', this.touch.onBlur);
        if (this.touch.root.parentNode) this.touch.root.parentNode.removeChild(this.touch.root);
        this.touch = null;
    }

    // Enter and the pause button share one flag, so the glyph is kept in step
    // with the game rather than with whatever last pressed it
    syncTouchPause() {
        if (!this.touch) return;
        this.touch.paused = this.paused;
        this.touch.pause.textContent = this.paused ? '\u25b6\ufe0f' : '\u23f8\ufe0f';
        const label = this.paused ? 'Resume' : 'Pause';
        this.touch.pause.title = label;
        this.touch.pause.setAttribute('aria-label', label);
    }

    injectTouchStyles() {
        if (document.getElementById('quest-touch-style')) return;
        const style = document.createElement('style');
        style.id = 'quest-touch-style';
        // Sizes hang off --qt-s, the configured scale, but are also capped in
        // vw so that cranking the slider up on a narrow phone cannot slide the
        // two clusters into each other. The two sides come to
        //   3 cells + 2 gaps (0.16 cell each) + 2 buttons + a 0.62 bomb
        //   = 3.32 cells + 2.62 buttons,
        // so 13vw and 16vw leave room to spare even on a 320px screen. In
        // landscape -- how anyone actually plays -- the cap is far above the
        // top of the slider and the scale is whatever was asked for.
        style.textContent = `
            #quest-touch {
                --qt-s: 1;
                --qt-cell: min(calc(46px * var(--qt-s)), 13vw);
                --qt-act: min(calc(62px * var(--qt-s)), 16vw);
                --qt-mini: calc(var(--qt-act) * 0.62);
                --qt-gap: calc(var(--qt-cell) * 0.16);
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                z-index: 999;
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
                padding:
                    calc(10px + env(safe-area-inset-top, 0px))
                    calc(12px + env(safe-area-inset-right, 0px))
                    calc(12px + env(safe-area-inset-bottom, 0px))
                    calc(12px + env(safe-area-inset-left, 0px));
                pointer-events: none;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Emoji", sans-serif;
                -webkit-user-select: none;
                user-select: none;
                -webkit-tap-highlight-color: transparent;
            }
            #quest-touch[data-pos="middle"] { align-items: center; }
            #quest-touch[data-pos="top"] { align-items: flex-start; }
            #quest-touch[data-swap] { flex-direction: row-reverse; }
            #quest-touch > * { pointer-events: auto; touch-action: none; }

            #quest-touch .qt-pad {
                display: grid;
                grid-template-columns: repeat(3, var(--qt-cell));
                grid-template-rows: repeat(3, var(--qt-cell));
                grid-template-areas: ". u ." "l c r" ". d .";
            }
            #quest-touch .qt-up { grid-area: u; }
            #quest-touch .qt-down { grid-area: d; }
            #quest-touch .qt-left { grid-area: l; }
            #quest-touch .qt-right { grid-area: r; }
            #quest-touch .qt-centre {
                grid-area: c;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            #quest-touch .qt-centre::after {
                content: '';
                width: calc(var(--qt-cell) * 0.18);
                height: calc(var(--qt-cell) * 0.18);
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.18);
            }

            #quest-touch .qt-cell,
            #quest-touch .qt-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(16, 18, 26, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: rgba(255, 255, 255, 0.82);
                box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
                transition: background 60ms linear, transform 60ms linear;
            }
            #quest-touch .qt-cell {
                border-radius: calc(var(--qt-cell) * 0.2);
                font-size: calc(var(--qt-cell) * 0.36);
                line-height: 1;
            }
            #quest-touch .qt-cell.on {
                background: rgba(94, 136, 220, 0.85);
                border-color: rgba(255, 255, 255, 0.55);
                color: #fff;
            }

            #quest-touch .qt-acts {
                display: flex;
                flex-direction: column;
                gap: var(--qt-gap);
            }
            #quest-touch .qt-row {
                display: flex;
                gap: var(--qt-gap);
                justify-content: flex-end;
                align-items: flex-end;
            }
            #quest-touch[data-swap] .qt-row { flex-direction: row-reverse; }
            #quest-touch .qt-btn {
                padding: 0;
                border-radius: 50%;
                cursor: pointer;
                font-family: inherit;
                line-height: 1;
                -webkit-appearance: none;
                appearance: none;
            }
            #quest-touch .qt-act {
                width: var(--qt-act);
                height: var(--qt-act);
                font-size: calc(var(--qt-act) * 0.38);
            }
            #quest-touch .qt-mini {
                width: var(--qt-mini);
                height: var(--qt-mini);
                font-size: calc(var(--qt-mini) * 0.42);
            }
            #quest-touch .qt-attack { background: rgba(142, 46, 56, 0.6); }
            #quest-touch .qt-interact { background: rgba(32, 78, 136, 0.6); }
            #quest-touch .qt-bomb { background: rgba(70, 62, 44, 0.6); }
            #quest-touch .qt-btn.on {
                transform: scale(0.92);
                filter: brightness(1.5);
            }
        `;
        document.head.appendChild(style);
    }

    // Convert a screen point into a room cell and send the hero there
    guideTo(cx, cy) {
        if (!this.layout || this.mode !== 'play' || !this.hero) return;
        const v = this.viewport();
        const lx = (cx * this.dpr - v.x) / v.s, ly = (cy * this.dpr - v.y) / v.s - this.layout.roomY;
        if (lx < 0 || ly < 0 || lx >= this.layout.cols * 16 || ly >= this.layout.rows * 16) return;
        const tx = Math.floor(lx / 16), ty = Math.floor(ly / 16);
        const path = this.findPath(this.cellOf(this.hero.x, this.hero.y), new Set([ty * this.room.cols + tx]));
        if (path) {
            this.hero.path = path;
            this.hero.guided = 4;
            this.think('Coming!', 1.2);
        }
    }

    // -----------------------------------------------------------------------
    // Quest lifecycle
    // -----------------------------------------------------------------------
    resolveHeroKey() {
        const keys = Object.keys(QuestArt.HEROES);
        if (this.config.hero === 'random' || !QuestArt.HEROES[this.config.hero]) {
            const k = keys[Math.floor(Math.random() * keys.length)];
            return { key: k, variant: Math.floor(Math.random() * QuestArt.HEROES[k].variants.length) };
        }
        return { key: this.config.hero, variant: this.config.heroVariant || 0 };
    }

    newQuest(opts = {}) {
        const QA = QuestArt, D = QuestEngineData, c = this.config;
        this.computeLayout();
        if (!this.low) this.sizeCanvases();
        const seed = c.seed ? (c.seed >>> 0) : (Math.random() * 2 ** 31) >>> 0;
        const prevHero = this.hero;
        const pick = opts.keepHero && prevHero && c.hero !== 'random' ? { key: prevHero.key, variant: prevHero.variant } : this.resolveHeroKey();
        const diff = D.DIFFICULTY[c.difficulty] || D.DIFFICULTY.normal;

        this.resetState();
        this.questNumber = (this.questNumber || 0) + 1;
        this.world = QuestWorld.generate({
            seed, cols: this.layout.cols, rows: this.layout.rows,
            worldSize: c.worldSize, theme: c.worldTheme,
            dungeonCount: Math.max(0, Math.min(8, c.dungeonCount | 0)),
            density: diff.density * c.enemyDensity, hero: pick.key, cowLevel: c.cowLevel
        });
        this.rng = QA.mulberry32(seed ^ 0x5bd1e995);
        this.diff = diff;
        this.stats = { rooms: 0, monsters: 0, friends: 0, money: 0, hearts: 0, deaths: 0, naps: 0, bushes: 0, startedAt: 0, signs: 0 };
        this.makeHero(pick.key, pick.variant);
        this.dayClock = 0.15 + Math.random() * 0.2;

        const W = this.world;
        const start = W.overworld.rooms[W.start.ry][W.start.rx];
        this.hero.x = start.pedestal.x * 16 + 8;
        this.hero.y = (start.pedestal.y + 2) * 16 + 8;
        this.enterRoom(start, { via: 'start' });
        this.mode = 'play';
        if (c.story && !opts.quiet) this.beginStory();
    }

    makeHero(key, variant) {
        const QA = QuestArt, c = this.config;
        const def = QA.HEROES[key];
        const maxHp = (def.hp + (this.diff ? this.diff.heroHp : 0)) * 2;
        const name = (c.heroName || '').trim() || def.names[Math.floor(Math.random() * def.names.length)];
        this.hero = {
            key, def, variant: Math.min(variant, def.variants.length - 1), name,
            x: 0, y: 0, dir: 'down', hp: maxHp, maxHp,
            money: 0, keys: 0, bombs: 0, shards: 0, items: {}, potion: 0, trinkets: [], lives: 9,
            path: [], exitDir: null, thinkT: 0, atk: null, atkCd: 0, invuln: 0, knock: null,
            walkT: 0, moving: false, state: 'idle', thought: null, thoughtCd: 2,
            stuckT: 0, lastX: 0, lastY: 0, roomT: 0, portalCd: 0, fleeT: 0, bombCd: 0,
            weapon: QuestEngineData.WEAPONS[def.weapon === 'sword' && key === 'pumpkin' ? 'scythe' : def.weapon]
        };
        this.companionKey = c.companion;
        this.companions = this.makeCompanions();
    }

    // One follower, or a whole parade of them in single file
    makeCompanions() {
        const def = QuestArt.COMPANIONS[this.companionKey];
        this.trail = [];
        if (!def || this.companionKey === 'none') return [];
        const keys = def.party || [this.companionKey];
        const h = this.hero;
        return keys.map((key, i) => ({ key, x: h ? h.x : 0, y: h ? h.y : 0, t: Math.random() * 2, dir: 1, idx: i }));
    }

    // Swap the hero's look mid-quest without touching their progress
    applyHeroLook() {
        if (!this.hero) return;
        const c = this.config;
        let key = c.hero, variant = c.heroVariant || 0;
        if (key === 'random') return;
        if (!QuestArt.HEROES[key]) return;
        const h = this.hero;
        if (h.key !== key) {
            const def = QuestArt.HEROES[key];
            const ratio = h.hp / h.maxHp;
            const extra = h.maxHp - (h.def.hp + this.diff.heroHp) * 2;
            h.key = key;
            h.def = def;
            h.maxHp = (def.hp + this.diff.heroHp) * 2 + Math.max(0, extra);
            h.hp = Math.max(1, Math.round(h.maxHp * ratio));
            h.weapon = QuestEngineData.WEAPONS[def.weapon === 'sword' && key === 'pumpkin' ? 'scythe' : def.weapon];
            if (!c.heroName) h.name = def.names[Math.floor(Math.random() * def.names.length)];
        }
        h.variant = Math.min(variant, h.def.variants.length - 1);
        if (c.heroName) h.name = c.heroName;
        if (this.companionKey !== c.companion) {
            this.companionKey = c.companion;
            this.companions = this.makeCompanions();
        }
    }

    beginStory() {
        const QA = QuestArt, W = this.world, h = this.hero;
        const art = QA.WORDS.artifacts[h.def.currency] || 'Shards of Destiny';
        const lines = W.totalShards > 0 ? [
            'LONG AGO, ' + W.villain.toUpperCase() + ' STOLE THE',
            art.toUpperCase() + '...',
            '',
            '...AND HID ALL ' + W.totalShards + ' OF THEM IN DUNGEONS.',
            'RUDE!',
            '',
            'ONLY ONE HERO CAN SET THINGS RIGHT:',
            h.name.toUpperCase() + ' THE ' + h.def.name.toUpperCase() + '!'
        ] : [
            'A BRAND NEW LAND, FRESHLY MADE.',
            'NOBODY HAS EXPLORED IT YET.',
            '',
            'ENTER: ' + h.name.toUpperCase() + ' THE ' + h.def.name.toUpperCase() + '!'
        ];
        this.story = { lines, t: 0, dur: 2 + lines.join('').length / 22 + 2.5 };
        this.mode = 'story';
    }

    // -----------------------------------------------------------------------
    // Rooms
    // -----------------------------------------------------------------------
    cellOf(x, y) {
        const W = this.room.cols;
        const tx = Math.max(0, Math.min(W - 1, Math.floor(x / 16)));
        const ty = Math.max(0, Math.min(this.room.rows - 1, Math.floor(y / 16)));
        return ty * W + tx;
    }

    tileAt(tx, ty) {
        const r = this.room;
        if (tx < 0 || ty < 0 || tx >= r.cols || ty >= r.rows) return -1;
        return r.tiles[ty * r.cols + tx];
    }

    // Live tiles: the base layout plus door states, regrown bushes and so on
    buildLive(room) {
        const T = QuestWorld.T;
        room.tiles = room.base.slice();
        if (room.dungeon !== undefined && room.doors) {
            const d = this.world.dungeons[room.dungeon];
            for (const dk of Object.keys(room.doors)) {
                const door = room.doors[dk];
                if (!door.edge || !room.doorCells) continue;
                const e = d.edges.get(door.edge);
                const locked = e && e.type === 'lock' && !e.unlocked;
                for (const i of room.doorCells[dk]) room.tiles[i] = locked ? T.LOCK : T.DOOR;
            }
        }
    }

    enterRoom(room, how) {
        const QA = QuestArt, T = QuestWorld.T, h = this.hero;
        const prev = this.room;
        this.room = room;
        this.area = this.world.areas[room.area];
        this.buildLive(room);
        this.enemies = [];
        this.projectiles = [];
        this.pickups = [];
        this.effects = this.effects.filter(e => e.keep);
        this.critters = [];
        h.path = [];
        h.exitDir = null;
        h.thinkT = 0;
        h.roomT = 0;
        h.guided = 0;
        h.napped = false;
        h.healed = false;
        h.bought = 0;
        h.blockedT = 0;
        this.roomShut = false;
        this.shutPending = false;
        // A new screen is a fresh start: the old box belongs to the old room
        this.wdBox = null;

        const first = !room.visited;
        if (first) {
            room.visited = true;
            if (this.area.kind === 'overworld') this.stats.rooms++;
        }
        this.area.visited = true;

        // A banner when crossing into a new region or entering somewhere new
        if (this.area.kind === 'overworld') {
            if (!prev || prev.area !== room.area || prev.region !== room.region) {
                this.showBanner(room.regionName.toUpperCase());
                if (prev && prev.biome !== room.biome) {
                    const t = QA.WORDS.thoughts.newBiome[room.biome];
                    if (t && first) this.think(t[Math.floor(Math.random() * t.length)], 2.2);
                }
            }
        } else if (this.area.kind === 'cowlevel' && (!prev || prev.area !== room.area)) {
            this.showBanner('THE SECRET COW LEVEL', 'THERE IS NO COW LEVEL');
            this.think(QA.WORDS.thoughts.newBiome.pasture[Math.floor(Math.random() * 2)], 2);
        } else if (this.area.kind === 'dungeon' && (!prev || prev.area !== room.area)) {
            const d = this.world.dungeons[room.dungeon];
            this.showBanner('LEVEL-' + (d.index + 1), d.name.toUpperCase());
            this.think(QA.WORDS.thoughts.dungeon[Math.floor(Math.random() * 3)], 2);
        }

        this.spawnRoomContents(room, first);
        // Where the hero came in, so a boss can be kept off it until the room
        // seals; every entry path has placed the hero by the time we get here
        this.enterAt = { x: h.x, y: h.y };
        this.setupWeather();
        this.renderRoom();
        if (how.via !== 'scroll') {
            this.trail = [];
            for (const c of this.companions) { c.x = h.x; c.y = h.y; }
        }

        // Caves: the resident has something to say
        if (this.area.kind === 'cave' && room.text && this.config.dialogue && how.via !== 'death') {
            this.say(room.text, { who: room.npc });
        }
        if (room.kind === 'boss' && room.boss && !room.bossDefeated && (room.dungeon === undefined || !this.world.dungeons[room.dungeon].completed)) {
            const B = QA.BOSSES[room.boss];
            // An ambusher announces itself in its own time
            if (!B.ambush) this.showBanner(B.name.toUpperCase(), B.title.toUpperCase());
        }
        this.planOverworld();
    }

    spawnRoomContents(room, first) {
        const QA = QuestArt, T = QuestWorld.T, h = this.hero;
        const W = room.cols;
        const cleared = room.dungeon !== undefined ? room.cleared : (this.time - room.clearedAt < 75);

        // Enemies
        if (!cleared && room.spawns.length) {
            const cells = this.reachableCells(this.cellOf(h.x, h.y));
            const far = cells.filter(i => {
                const x = i % W, y = (i / W) | 0;
                return Math.abs(x * 16 + 8 - h.x) + Math.abs(y * 16 + 8 - h.y) > 56 && x > 1 && y > 1 && x < W - 2 && y < room.rows - 2;
            });
            const pool = far.length >= 3 ? far : cells;
            room.spawns.forEach((s, n) => {
                if (!pool.length) return;
                const i = pool.splice(Math.floor(this.rng() * pool.length), 1)[0];
                this.spawnEnemy(s.type, (i % W) * 16 + 8, ((i / W) | 0) * 16 + 8, 0.35 + n * 0.12);
            });
            if (room.shutter && this.enemies.length) this.shutPending = true;
        }
        // Boss
        if (room.kind === 'boss' && room.boss && !room.bossDefeated) {
            this.spawnBoss(room.boss, (W / 2) * 16, (room.rows / 2 - 1) * 16);
            this.shutPending = true;
        }

        // Persistent items
        for (const it of room.items) {
            if (room.collected[it.id]) continue;
            if (it.onClear && !cleared) continue;
            let x = it.x, y = it.y;
            if (x === undefined) {
                // Loose items in the grass get a spot on first sight
                const cells = this.reachableCells(this.cellOf(h.x, h.y)).filter(i => {
                    const cx = i % W, cy = (i / W) | 0;
                    return cx > 2 && cy > 2 && cx < W - 3 && cy < room.rows - 3;
                });
                if (!cells.length) continue;
                const i = cells[Math.floor(QA.hash2(room.rx, room.ry, 99) * cells.length)];
                it.x = x = i % W; it.y = y = (i / W) | 0;
            }
            if (it.type === 'gift' && !it.resolved) it.resolved = this.resolveGift();
            this.addPickup(it.type === 'gift' ? it.resolved : it.type, x * 16 + 8, y * 16 + 8, {
                persist: it.id, price: it.price, amount: it.amount, trinket: it.trinket, contents: it.contents, shop: it.shop, still: true
            });
        }
        // Shard and heart left behind if the hero fled a beaten boss
        if (room.kind === 'boss' && room.bossDefeated && room.dungeon !== undefined && !this.world.dungeons[room.dungeon].shardTaken) {
            this.addPickup('shard', (W / 2) * 16, (room.rows / 2) * 16, { persist: 'shard', still: true });
        }

        // Wildlife
        if (this.config.critters && (this.area.kind === 'overworld' || this.area.kind === 'cowlevel')) {
            const biome = QA.BIOMES[room.biome];
            const n = Math.floor(this.rng() * 3) + (room.biome === 'village' ? 3 : 1);
            for (let i = 0; i < n; i++) {
                const kind = biome.critters[Math.floor(this.rng() * biome.critters.length)];
                if (kind) this.spawnCritter(kind);
            }
        }
    }

    resolveGift() {
        const h = this.hero;
        if (!h.giftHeart) { h.giftHeart = true; return 'heartContainer'; }
        const up = QuestEngineData.UPGRADE_ORDER.filter(u => !h.items[u]);
        if (up.length && this.rng() < 0.7) return up[Math.floor(this.rng() * up.length)];
        if (!h.potion) return 'potion';
        return 'heartPiece';
    }

    reachableCells(from) {
        const r = this.room, W = r.cols, N = r.tiles.length;
        const seen = new Uint8Array(N), out = [];
        const q = [from];
        seen[from] = 1;
        while (q.length) {
            const i = q.pop();
            if (QuestWorld.OPEN[r.tiles[i]]) out.push(i);
            const x = i % W, y = (i / W) | 0;
            for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < r.rows - 1 ? i + W : -1]) {
                if (j < 0 || seen[j] || !QuestWorld.OPEN[r.tiles[j]]) continue;
                seen[j] = 1;
                q.push(j);
            }
        }
        return out;
    }

    // -----------------------------------------------------------------------
    // Room art: painted once per visit into a static canvas
    // -----------------------------------------------------------------------
    roomBiome(room) {
        return QuestArt.BIOMES[room.biome] || QuestArt.BIOMES.meadow;
    }

    renderRoom() {
        if (!this.room) return;
        this.roomCanvas = this.paintRoom(this.room, this.roomCanvas);
    }

    paintRoom(room, cv) {
        const W = room.cols, H = room.rows;
        if (!cv) cv = document.createElement('canvas');
        cv.width = W * 16;
        cv.height = H * 16;
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        if (!room.tiles) this.buildLive(room);
        const area = this.world.areas[room.area];
        if (area.kind === 'dungeon') this.paintDungeonRoom(ctx, room);
        else if (area.kind === 'cave') this.paintCaveRoom(ctx, room);
        else this.paintOverworldRoom(ctx, room);
        if (this._palette) this._palette.sheets.delete(cv);
        return cv;
    }

    px(ctx, color, x, y, w = 1, h = 1) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
    }

    paintGroundTile(ctx, biome, x, y, seed, pathy) {
        const QA = QuestArt, X = x * 16, Y = y * 16;
        this.px(ctx, pathy ? biome.path : biome.ground, X, Y, 16, 16);
        const h = (k) => QA.hash2(x * 7 + k, y * 13 - k, seed);
        const n = 3 + Math.floor(h(1) * 3);
        for (let i = 0; i < n; i++) {
            const sx = Math.floor(h(i * 3 + 2) * 15), sy = Math.floor(h(i * 3 + 3) * 15);
            if (pathy) this.px(ctx, QA.shade(biome.path, -0.15), X + sx, Y + sy, 1, 1);
            else this.px(ctx, h(i + 9) < 0.6 ? biome.ground2 : biome.ground3, X + sx, Y + sy, h(i + 5) < 0.5 ? 2 : 1, 1);
        }
    }

    paintDecor(ctx, biome, room, x, y) {
        const QA = QuestArt, X = x * 16, Y = y * 16;
        const h = (k) => QA.hash2(x * 11 + k, y * 5 + k * 3, room.rx * 9 + room.ry);
        switch (biome.decor) {
            case 'flowers': {
                const cols = ['#fcfcfc', '#f878b8', '#fce800', '#f85858', '#a8d8fc'];
                for (let i = 0; i < 2; i++) {
                    const fx = X + 2 + Math.floor(h(i) * 10), fy = Y + 2 + Math.floor(h(i + 4) * 10);
                    const c = cols[Math.floor(h(i + 7) * cols.length)];
                    this.px(ctx, c, fx, fy - 1); this.px(ctx, c, fx - 1, fy); this.px(ctx, c, fx + 1, fy); this.px(ctx, c, fx, fy + 1);
                    this.px(ctx, '#fcd800', fx, fy);
                }
                break;
            }
            case 'tufts':
            case 'fallen': {
                const c = biome.decor === 'fallen' ? ['#e83818', '#fcb848', '#a83c08'] : [biome.ground2, QA.shade(biome.ground, -0.3)];
                for (let i = 0; i < 3; i++) {
                    const fx = X + 2 + Math.floor(h(i) * 11), fy = Y + 3 + Math.floor(h(i + 4) * 10);
                    const cc = c[i % c.length];
                    if (biome.decor === 'fallen') { this.px(ctx, cc, fx, fy, 2, 1); this.px(ctx, cc, fx + 1, fy + 1); }
                    else { this.px(ctx, cc, fx, fy); this.px(ctx, cc, fx + 2, fy); this.px(ctx, cc, fx + 1, fy + 1); this.px(ctx, cc, fx + 1, fy - 1); }
                }
                break;
            }
            case 'pebbles':
                for (let i = 0; i < 3; i++) {
                    const fx = X + 2 + Math.floor(h(i) * 11), fy = Y + 2 + Math.floor(h(i + 4) * 11);
                    this.px(ctx, QA.shade(biome.ground, -0.3), fx, fy + 1, 2, 1);
                    this.px(ctx, QA.shade(biome.ground, 0.25), fx, fy, 2, 1);
                }
                break;
            case 'sparkle': {
                const fx = X + 3 + Math.floor(h(1) * 10), fy = Y + 3 + Math.floor(h(2) * 10);
                this.px(ctx, '#fcfcfc', fx, fy - 1); this.px(ctx, '#fcfcfc', fx - 1, fy, 3, 1); this.px(ctx, '#fcfcfc', fx, fy + 1);
                break;
            }
            case 'skulls': {
                const img = this.sprites.object('skull', room.biome, biome.pal);
                if (img && h(3) < 0.5) ctx.drawImage(img, X + Math.floor(h(4) * 4) - 2, Y + Math.floor(h(5) * 3) - 2);
                else this.px(ctx, QA.shade(biome.ground, -0.25), X + 4, Y + 9, 6, 1);
                break;
            }
            case 'spots':
                for (let i = 0; i < 3; i++) this.px(ctx, i % 2 ? '#58fcc8' : '#f8b8f8', X + 2 + Math.floor(h(i) * 12), Y + 2 + Math.floor(h(i + 4) * 12));
                break;
            case 'sprinkles': {
                const cols = ['#f83838', '#fce800', '#38b8f8', '#58d838', '#fcfcfc', '#a858f8'];
                for (let i = 0; i < 4; i++) {
                    const c = cols[Math.floor(h(i + 7) * cols.length)];
                    const fx = X + 1 + Math.floor(h(i) * 13), fy = Y + 1 + Math.floor(h(i + 4) * 13);
                    if (h(i + 9) < 0.5) this.px(ctx, c, fx, fy, 2, 1); else this.px(ctx, c, fx, fy, 1, 2);
                }
                break;
            }
            case 'shells': {
                const fx = X + 3 + Math.floor(h(1) * 9), fy = Y + 4 + Math.floor(h(2) * 8);
                this.px(ctx, '#f8b8c8', fx, fy, 3, 2); this.px(ctx, '#fcfcfc', fx + 1, fy, 1, 1); this.px(ctx, '#c87888', fx, fy + 2, 3, 1);
                break;
            }
        }
    }

    paintWater(ctx, room, x, y, color) {
        const T = QuestWorld.T, X = x * 16, Y = y * 16;
        const QA = QuestArt;
        this.px(ctx, color, X, Y, 16, 16);
        const isW = (dx, dy) => {
            const k = this.tileAtRoom(room, x + dx, y + dy);
            return k === T.WATER || k === T.BRIDGE || k === -1;
        };
        const foam = QA.shade(color, 0.55), deep = QA.shade(color, -0.18);
        for (let i = 0; i < 2; i++) {
            const wx = Math.floor(QA.hash2(x, y, i + 4) * 11) + 2, wy = Math.floor(QA.hash2(x, y, i + 8) * 12) + 2;
            this.px(ctx, deep, X + wx, Y + wy, 3, 1);
        }
        if (!isW(0, -1)) this.px(ctx, foam, X, Y, 16, 2);
        if (!isW(0, 1)) this.px(ctx, foam, X, Y + 15, 16, 1);
        if (!isW(-1, 0)) this.px(ctx, foam, X, Y, 1, 16);
        if (!isW(1, 0)) this.px(ctx, foam, X + 15, Y, 1, 16);
    }

    tileAtRoom(room, tx, ty) {
        if (tx < 0 || ty < 0 || tx >= room.cols || ty >= room.rows) return -1;
        return (room.tiles || room.base)[ty * room.cols + tx];
    }

    paintBridge(ctx, room, x, y) {
        const T = QuestWorld.T, X = x * 16, Y = y * 16;
        const water = this.roomBiome(room).water;
        this.px(ctx, water, X, Y, 16, 16);
        const horiz = this.tileAtRoom(room, x - 1, y) !== T.WATER && this.tileAtRoom(room, x + 1, y) !== T.WATER
            ? false : (this.tileAtRoom(room, x, y - 1) === T.WATER || this.tileAtRoom(room, x, y + 1) === T.WATER) ? false : true;
        // Planks run across the direction of travel
        const vertTravel = this.tileAtRoom(room, x, y - 1) === T.BRIDGE || this.tileAtRoom(room, x, y + 1) === T.BRIDGE
            || (this.tileAtRoom(room, x - 1, y) === T.WATER && this.tileAtRoom(room, x + 1, y) === T.WATER);
        if (vertTravel || !horiz) {
            this.px(ctx, '#c88850', X + 1, Y, 14, 16);
            for (let i = 0; i < 4; i++) this.px(ctx, '#7c4c1c', X + 1, Y + i * 4 + 3, 14, 1);
            this.px(ctx, '#5c3418', X, Y, 1, 16); this.px(ctx, '#5c3418', X + 15, Y, 1, 16);
        } else {
            this.px(ctx, '#c88850', X, Y + 1, 16, 14);
            for (let i = 0; i < 4; i++) this.px(ctx, '#7c4c1c', X + i * 4 + 3, Y + 1, 1, 14);
            this.px(ctx, '#5c3418', X, Y, 16, 1); this.px(ctx, '#5c3418', X, Y + 15, 16, 1);
        }
    }

    paintOverworldRoom(ctx, room) {
        const T = QuestWorld.T, QA = QuestArt;
        const biome = this.roomBiome(room);
        const W = room.cols, H = room.rows, tiles = room.tiles;
        const seed = room.rx * 101 + room.ry * 37;
        // Ground everywhere first; objects overlap their neighbours slightly
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const k = tiles[y * W + x];
            if (k === T.WATER) this.paintWater(ctx, room, x, y, biome.water);
            else if (k === T.BRIDGE) this.paintBridge(ctx, room, x, y);
            else this.paintGroundTile(ctx, biome, x, y, seed, k === T.PATH);
        }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, k = tiles[i];
            if (k === T.DECOR) this.paintDecor(ctx, biome, room, x, y);
            else if (k === T.HOLE) this.paintHole(ctx, x, y);
            else if (k === T.PEDESTAL) {
                const img = this.sprites.object('pedestal', room.biome, null);
                ctx.drawImage(img, x * 16, y * 16);
            }
        }
        // Lily pads on some open water
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (tiles[y * W + x] === T.WATER && QA.hash2(x, y, seed + 3) < 0.07 && room.biome !== 'candy') {
                ctx.drawImage(this.sprites.object('lilypad', room.biome, null), x * 16, y * 16);
            }
        }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, k = tiles[i];
            if (k === T.WALL || k === T.OBST || k === T.BUSH || k === T.SIGN) {
                const name = room.obj[i] || biome.wall;
                const img = this.sprites.object(name, room.biome, biome.pal);
                if (img) ctx.drawImage(img, x * 16, y * 16);
            }
        }
        for (const s of room.structures) this.paintStructure(ctx, room, s);
    }

    paintHole(ctx, x, y) {
        const X = x * 16, Y = y * 16;
        const g = new QuestArt.PixelGrid(16, 16);
        g.ellipse(8, 9, 7, 5.5, '#3c2c1c');
        g.ellipse(8, 9.5, 6, 4.5, '#000000');
        g.ellipse(8, 8, 6, 2.5, '#140c0c');
        ctx.drawImage(g.toCanvas(), X, Y);
    }

    paintStructure(ctx, room, s) {
        const QA = QuestArt;
        const key = 'struct:' + s.kind + ':' + room.biome + ':' + (s.kind === 'dungeon' ? s.portal.dungeon : s.kind === 'house' ? (room.rx * 3 + s.x) % 4 : 0);
        const img = this.sprites.get(key, () => {
            const g = new QA.PixelGrid(48, 32);
            const biome = this.roomBiome(room);
            if (s.kind === 'cave') {
                const r = biome.pal.r || '#a8a8a8', R = biome.pal.R || '#686868';
                g.ellipse(24, 22, 23, 18, r);
                g.ellipse(26, 25, 21, 12, R);
                g.ellipse(18, 12, 9, 6, QA.shade(r, 0.3));
                g.ellipse(24, 27, 7, 8, '#000000');
                g.rect(17, 27, 15, 5, '#000000');
                for (let i = 0; i < 9; i++) g.set(6 + i * 4, 18 + (i % 3), R);
            } else if (s.kind === 'cowlevel' || s.kind === 'cowexit') {
                // Two standing stones and a swirling red portal between them
                g.rect(4, 6, 8, 26, '#8c8c9c'); g.rect(36, 6, 8, 26, '#8c8c9c');
                g.rect(4, 6, 8, 2, '#c8c8d4'); g.rect(36, 6, 8, 2, '#c8c8d4');
                g.rect(2, 2, 44, 5, '#787888'); g.rect(2, 2, 44, 1, '#a8a8b8');
                g.ellipse(24, 20, 11, 12, '#a80820');
                g.ellipse(24, 20, 8, 9, '#e82838');
                g.ellipse(24, 20, 5, 6, '#f87858');
                g.ellipse(24, 20, 2, 3, '#fcd8a8');
                g.rect(17, 28, 15, 4, '#a80820');
                for (const [x, y] of [[6, 14], [9, 22], [38, 12], [41, 25]]) g.set(x, y, '#5c5c6c');
            } else if (s.kind === 'dungeon') {
                const th = this.world.dungeons[s.portal.dungeon].theme;
                g.rect(3, 12, 42, 20, th.wall);
                g.rect(3, 12, 42, 2, th.wallHi);
                for (let y = 16; y < 32; y += 4) for (let x = 3 + ((y / 4) % 2) * 3; x < 45; x += 6) g.rect(x, y, 1, 3, th.wallLo);
                // Roof
                for (let y = 0; y < 12; y++) g.rect(24 - y * 2 - 2, y, y * 4 + 4, 1, y < 2 ? th.wallHi : QA.shade(th.wall, -0.25));
                // Eyes on the roof, because it is that kind of world
                g.rect(17, 6, 4, 3, '#fcfcfc'); g.rect(27, 6, 4, 3, '#fcfcfc');
                g.rect(19, 7, 2, 2, '#140c1c'); g.rect(29, 7, 2, 2, '#140c1c');
                // Pillars and door
                g.rect(8, 16, 4, 16, th.wallHi); g.rect(36, 16, 4, 16, th.wallHi);
                g.rect(17, 18, 14, 14, '#000000');
                g.ellipse(24, 19, 7, 4, '#000000');
                g.rect(45, 2, 1, 12, '#5c3418'); g.rect(40, 2, 5, 4, '#f83838');
            } else {
                const roofs = [['#e83838', '#a01818'], ['#3c78f8', '#1c3ca8'], ['#38a838', '#187818'], ['#a858d8', '#6c2c98']];
                const [rc, rC] = roofs[(room.rx * 3 + s.x) % 4];
                g.rect(4, 14, 40, 18, '#fce0a8');
                g.rect(4, 14, 40, 1, '#d8b878');
                for (let y = 0; y < 14; y++) g.rect(Math.max(0, 22 - y * 2), y, Math.min(48, y * 4 + 4), 1, y % 3 === 2 ? rC : rc);
                g.rect(34, 1, 5, 8, '#a87038');
                g.rect(19, 19, 10, 13, '#7c4c1c'); g.set(26, 26, '#fcc800');
                g.rect(8, 18, 7, 6, '#58b8f8'); g.rect(11, 18, 1, 6, '#fce0a8'); g.rect(8, 21, 7, 1, '#fce0a8');
                g.rect(33, 18, 7, 6, '#58b8f8'); g.rect(36, 18, 1, 6, '#fce0a8'); g.rect(33, 21, 7, 1, '#fce0a8');
                g.rect(6, 26, 10, 2, '#f878b8'); g.rect(32, 26, 10, 2, '#f878b8');
            }
            g.outline(QA.OUTLINE);
            return g.toCanvas();
        });
        ctx.drawImage(img, s.x * 16, s.y * 16);
    }

    paintDungeonRoom(ctx, room) {
        const T = QuestWorld.T, QA = QuestArt;
        const th = this.world.dungeons[room.dungeon].theme;
        const W = room.cols, H = room.rows, tiles = room.tiles;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, k = tiles[i], X = x * 16, Y = y * 16;
            if (k === T.DWALL) {
                this.px(ctx, th.wall, X, Y, 16, 16);
                for (let r = 0; r < 4; r++) {
                    this.px(ctx, th.wallLo, X, Y + r * 4 + 3, 16, 1);
                    const off = (r + x) % 2 ? 4 : 11;
                    this.px(ctx, th.wallLo, X + off, Y + r * 4, 1, 3);
                    this.px(ctx, th.wallHi, X, Y + r * 4, 16, 1);
                }
            } else if (k === T.WATER) {
                this.paintWater(ctx, room, x, y, '#2858a8');
            } else {
                // Checkered floor with a soft bevel on every tile
                const alt = (x + y) % 2;
                this.px(ctx, alt ? th.floor : th.floor2, X, Y, 16, 16);
                this.px(ctx, QA.shade(th.floor, 0.12), X, Y, 16, 1);
                this.px(ctx, QA.shade(th.floor, 0.12), X, Y, 1, 16);
                this.px(ctx, QA.shade(th.floor, -0.25), X + 15, Y, 1, 16);
                this.px(ctx, QA.shade(th.floor, -0.25), X, Y + 15, 16, 1);
                if (QA.hash2(x, y, room.rx + room.ry * 9) < 0.08) this.px(ctx, QA.shade(th.floor, -0.2), X + 5, Y + 6, 4, 1);
            }
        }
        // Inner shadow along the walls
        const t = room.thick || 1;
        this.px(ctx, 'rgba(0,0,0,0.25)', t * 16, t * 16, (W - t * 2) * 16, 3);
        this.px(ctx, 'rgba(0,0,0,0.18)', t * 16, t * 16, 3, (H - t * 2) * 16);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, k = tiles[i], X = x * 16, Y = y * 16;
            if (k === T.BLOCK) ctx.drawImage(this.sprites.block(th), X, Y);
            else if (k === T.STATUE) ctx.drawImage(this.sprites.object('statue', 'dungeon', null), X, Y);
            else if (k === T.TORCH) ctx.drawImage(this.sprites.object('torch', 'dungeon', null), X, Y);
            else if (k === T.DOOR || k === T.LOCK || k === T.SHUT) this.paintDoorCell(ctx, room, x, y, k, th);
        }
    }

    paintDoorCell(ctx, room, x, y, k, th) {
        const T = QuestWorld.T, X = x * 16, Y = y * 16;
        const QA = QuestArt;
        this.px(ctx, '#000000', X, Y, 16, 16);
        if (k === T.LOCK) {
            this.px(ctx, QA.shade(th.wall, -0.35), X, Y, 16, 16);
            for (let i = 0; i < 4; i++) this.px(ctx, th.wallLo, X + i * 4 + 1, Y, 1, 16);
            this.px(ctx, '#fcc800', X + 6, Y + 6, 4, 4);
            this.px(ctx, '#140c1c', X + 7, Y + 7, 2, 3);
        } else if (k === T.SHUT) {
            this.px(ctx, '#1c1424', X, Y, 16, 16);
            for (let i = 0; i < 4; i++) this.px(ctx, '#a8a8b8', X + i * 4 + 1, Y, 2, 16);
            this.px(ctx, '#686878', X, Y + 7, 16, 2);
        }
    }

    paintCaveRoom(ctx, room) {
        const T = QuestWorld.T, QA = QuestArt;
        const W = room.cols, H = room.rows, tiles = room.tiles;
        const house = room.caveType === 'house';
        const wallC = house ? '#a87038' : '#c84c0c', wallLo = house ? '#6c4418' : '#801c00', wallHi = house ? '#d09858' : '#f08848';
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, k = tiles[i], X = x * 16, Y = y * 16;
            if (k === T.CWALL || k === T.DWALL) {
                this.px(ctx, wallC, X, Y, 16, 16);
                if (house) {
                    for (let r = 0; r < 4; r++) this.px(ctx, wallLo, X, Y + r * 4 + 3, 16, 1);
                    this.px(ctx, wallHi, X, Y, 16, 1);
                } else {
                    for (let j = 0; j < 5; j++) {
                        const cx = Math.floor(QA.hash2(x, y, j) * 14), cy = Math.floor(QA.hash2(y, x, j + 3) * 14);
                        this.px(ctx, j % 2 ? wallLo : wallHi, X + cx, Y + cy, 2, 1);
                    }
                }
            } else if (k === T.WATER) {
                this.paintWater(ctx, room, x, y, '#3cbcfc');
            } else if (house) {
                this.px(ctx, '#c89058', X, Y, 16, 16);
                for (let r = 0; r < 4; r++) this.px(ctx, '#a87038', X, Y + r * 4 + 3, 16, 1);
                this.px(ctx, '#a87038', X + ((y % 2) ? 5 : 11), Y, 1, 16);
            } else {
                this.px(ctx, '#000000', X, Y, 16, 16);
                if (QA.hash2(x, y, 5) < 0.2) this.px(ctx, '#1c0c08', X + 6, Y + 8, 3, 1);
            }
        }
        if (house) {
            // A rug
            const cx = Math.floor(W / 2) * 16;
            this.px(ctx, '#c83838', cx - 24, (room.npcSpot.y + 2) * 16 - 4, 64, 24);
            this.px(ctx, '#fcc800', cx - 22, (room.npcSpot.y + 2) * 16 - 2, 60, 20);
            this.px(ctx, '#c83838', cx - 20, (room.npcSpot.y + 2) * 16, 56, 16);
        }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, k = tiles[i];
            if (k === T.OBST && room.obj[i]) {
                let name = room.obj[i];
                if (name === 'bed' && this.hero && this.hero.def.lives) name = 'box';
                const img = this.sprites.object(name, 'cave', null);
                if (img) ctx.drawImage(img, x * 16, y * 16);
            } else if (k === T.TORCH) ctx.drawImage(this.sprites.object('torch', 'cave', null), x * 16, y * 16);
        }
    }

    // -----------------------------------------------------------------------
    // Entities
    // -----------------------------------------------------------------------
    spawnEnemy(type, x, y, delay = 0.4) {
        const QA = QuestArt, def = QA.ENEMIES[type];
        if (!def) return null;
        const hp = Math.max(1, def.hp + this.diff.hp);
        const e = {
            kind: 'enemy', type, def, x, y, hp, maxHp: hp, dir: 'down', alive: true,
            spawning: delay > 0, spawnT: delay, w: 12, h: 12, z: 0,
            mv: null, pause: Math.random() * 0.8, animT: Math.random(), invuln: 0, knock: null, stun: 0,
            shootT: 1 + Math.random() * 2, rest: Math.random(), visible: true, phaseT: Math.random() * 4,
            speed: (def.speed || 30) * this.diff.speed, flying: !!def.flying, vx: 0, vy: 0, headT: 0
        };
        this.enemies.push(e);
        return e;
    }

    spawnBoss(kind, x, y) {
        const QA = QuestArt, def = QA.BOSSES[kind];
        const d = this.room.dungeon !== undefined ? this.world.dungeons[this.room.dungeon]
            : (this.area.cowStats = this.area.cowStats || { index: 1, deaths: 0 });
        // Every time the boss wins it comes back a little more tired
        const tired = Math.max(0.5, 1 - 0.15 * (d.deaths || 0));
        const hp = Math.max(4, Math.round((def.hp + d.index * 2 + this.diff.hp * 2) * tired));
        const e = {
            kind: 'enemy', boss: true, type: kind, def, x, y, hp, maxHp: hp, dir: 'down', alive: true,
            spawning: true, spawnT: 1.2, w: 24, h: 22, z: 0, mv: null, pause: 1, animT: 0, invuln: 0, knock: null, stun: 0,
            shootT: 2, rest: 1, hopN: 0, visible: true, phaseT: 0, speed: def.speed * this.diff.speed, vx: 0, vy: 0,
            baseX: x, baseY: y, t: 0
        };
        this.enemies.push(e);
        return e;
    }

    addPickup(type, x, y, opts = {}) {
        const p = {
            kind: 'pickup', type, x, y, t: 0, z: opts.still ? 0 : 6, vz: opts.still ? 0 : 40,
            life: opts.persist ? null : (opts.life || 9), persist: opts.persist, price: opts.price,
            amount: opts.amount, trinket: opts.trinket, contents: opts.contents, shop: opts.shop,
            vx: 0, vy: 0
        };
        if (type === 'fairy') { p.life = 12; p.fx = x; p.fy = y; }
        this.pickups.push(p);
        return p;
    }

    addEffect(type, x, y, opts = {}) {
        const e = { type, x, y, t: 0, life: opts.life || 0.4, ...opts };
        this.effects.push(e);
        return e;
    }

    floatText(text, x, y, color = '#fcfcfc', life = 0.9) {
        this.addEffect('text', x, y, { text, color, life });
    }

    spawnCritter(kind) {
        const r = this.room, W = r.cols, H = r.rows;
        const T = QuestWorld.T;
        const cells = [];
        for (let i = 0; i < r.tiles.length; i++) {
            const k = r.tiles[i];
            if (kind === 'fish' ? k === T.WATER : QuestWorld.OPEN[k]) cells.push(i);
        }
        if (!cells.length) return;
        const i = cells[Math.floor(this.rng() * cells.length)];
        this.critters.push({
            kind, x: (i % W) * 16 + 8, y: ((i / W) | 0) * 16 + 8, t: Math.random() * 5, vx: 0, vy: 0,
            dir: Math.random() < 0.5 ? -1 : 1, state: 'idle', timer: Math.random() * 2, z: 0,
            color: ['#f878b8', '#fce800', '#78c8f8', '#fcfcfc', '#f8a038'][Math.floor(Math.random() * 5)]
        });
    }

    // -----------------------------------------------------------------------
    // Collision
    // -----------------------------------------------------------------------
    solidFor(who, tx, ty) {
        const T = QuestWorld.T, r = this.room;
        if (tx < 0 || ty < 0 || tx >= r.cols || ty >= r.rows) {
            if (who !== 'hero') return true;
            // Off the edge is only open through an exit
            const cx = Math.max(0, Math.min(r.cols - 1, tx)), cy = Math.max(0, Math.min(r.rows - 1, ty));
            const k = r.tiles[cy * r.cols + cx];
            return !(QuestWorld.OPEN[k]);
        }
        const k = r.tiles[ty * r.cols + tx];
        if (who === 'hero') {
            if (k === T.WATER) return !this.hero.def.swim;
            if (k === T.PORTAL || k === T.HOLE) return false;
            return QuestWorld.SOLID[k] === 1;
        }
        if (who === 'proj') return QuestWorld.SOLID[k] === 1 && k !== T.WATER;
        if (who === 'swim') return k !== T.WATER;
        if (k === T.PORTAL || k === T.HOLE || k === T.DOOR) return true;
        return QuestWorld.SOLID[k] === 1;
    }

    boxFree(who, x, y, w, h) {
        const pts = [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1], [x + w / 2, y], [x + w / 2, y + h - 1], [x, y + h / 2], [x + w - 1, y + h / 2]];
        for (const [px, py] of pts) if (this.solidFor(who, Math.floor(px / 16), Math.floor(py / 16))) return false;
        return true;
    }

    moveEntity(e, dx, dy, who) {
        const w = e.w || 10, h = e.h || 10;
        let moved = false;
        if (dx && this.boxFree(who, e.x + dx - w / 2, e.y - h / 2, w, h)) { e.x += dx; moved = true; }
        if (dy && this.boxFree(who, e.x - w / 2, e.y + dy - h / 2, w, h)) { e.y += dy; moved = true; }
        return moved;
    }

    overlap(a, b) {
        return Math.abs(a.x - b.x) * 2 < (a.w + b.w) && Math.abs(a.y - b.y) * 2 < (a.h + b.h);
    }

    // -----------------------------------------------------------------------
    // Pathfinding: Dijkstra over room cells, small enough to run often
    // -----------------------------------------------------------------------
    cellCost(i, goals) {
        const T = QuestWorld.T, k = this.room.tiles[i];
        if (goals && goals.has(i)) {
            if (k === T.PORTAL || k === T.HOLE || k === T.LOCK) return 1;
        }
        if (QuestWorld.OPEN[k]) return 1;
        if (k === T.BUSH) return 3.5;
        if (k === T.WATER && this.hero.def.swim) return 2.2;
        return Infinity;
    }

    findPath(from, goals, maxCost = Infinity) {
        const r = this.room, W = r.cols, N = r.tiles.length;
        if (!goals.size) return null;
        if (goals.has(from)) return [];
        const dist = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
        const heap = [[0, from]];
        dist[from] = 0;
        while (heap.length) {
            // Binary heap pop
            const top = heap[0];
            const last = heap.pop();
            if (heap.length) {
                heap[0] = last;
                let i = 0;
                for (;;) {
                    const l = i * 2 + 1, rr = l + 1;
                    let m = i;
                    if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                    if (rr < heap.length && heap[rr][0] < heap[m][0]) m = rr;
                    if (m === i) break;
                    [heap[i], heap[m]] = [heap[m], heap[i]];
                    i = m;
                }
            }
            const [d, u] = top;
            if (d > dist[u]) continue;
            if (d > maxCost) break;
            if (goals.has(u)) {
                const path = [];
                for (let v = u; v !== from; v = prev[v]) path.unshift(v);
                return path;
            }
            const x = u % W, y = (u / W) | 0;
            for (const v of [x > 0 ? u - 1 : -1, x < W - 1 ? u + 1 : -1, y > 0 ? u - W : -1, y < r.rows - 1 ? u + W : -1]) {
                if (v < 0) continue;
                const c = this.cellCost(v, goals);
                if (c === Infinity) continue;
                const nd = d + c;
                if (nd < dist[v]) {
                    dist[v] = nd;
                    prev[v] = u;
                    heap.push([nd, v]);
                    let i = heap.length - 1;
                    while (i > 0) {
                        const p = (i - 1) >> 1;
                        if (heap[p][0] <= heap[i][0]) break;
                        [heap[p], heap[i]] = [heap[i], heap[p]];
                        i = p;
                    }
                }
            }
        }
        return null;
    }

    // -----------------------------------------------------------------------
    // Main loop
    // -----------------------------------------------------------------------
    // The game steps at a fixed 60 Hz whatever the frame rate (the stage
    // paces frames from 10 to 120 fps), so it plays at the same speed on any
    // tier; a frame only draws the latest state.
    animate(now = performance.now()) {
        if (!this.isEnabled) return;
        if (this.touch && this.touch.paused !== this.paused) this.syncTouchPause();
        const frameMs = now - this.lastTime;
        const cap = this.config.fpsCap || 60;
        if (frameMs < 1000 / cap - 2) {
            this.animationId = requestAnimationFrame(t => this.animate(t));
            return;
        }
        this.lastTime = now;
        // Paused: paint once so the overlay shows, then idle until input
        // wakes the stage. Bank no time at all, or the game would
        // fast-forward through everything on resume.
        if (this.paused && this.playable) {
            this.acc = 0;
            try { this.render(); } catch (err) {
                if (!this.loggedError) { this.loggedError = true; console.error('Pixel Quest frame error:', err); }
            }
            this.host.idleUntil();
            this.animationId = requestAnimationFrame(t => this.animate(t));
            return;
        }
        const dt = Math.min(0.1, Math.max(0, frameMs / 1000));
        this.acc += dt * (this.config.gameSpeed || 1);
        const STEP = 1 / 60, MAX_STEPS = 20;   // 0.1 s at 3× speed
        let steps = 0;
        // An error in one frame must not stop the game: log it once, carry on
        try {
            while (this.acc >= STEP && steps < MAX_STEPS) {
                this.tick(STEP);
                this.acc -= STEP;
                steps++;
            }
            if (steps >= MAX_STEPS) this.acc = 0;
            this.render();
        } catch (err) {
            this.acc = 0;
            if (!this.loggedError) { this.loggedError = true; console.error('Pixel Quest frame error:', err); }
        }
        this.animationId = requestAnimationFrame(t => this.animate(t));
    }

    tick(dt) {
        this.time += dt;
        const dayLen = { off: 0, short: 180, normal: 420, long: 900 }[this.config.dayNight] || 0;
        if (dayLen) this.dayClock = (this.dayClock + dt / dayLen) % 1;
        if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
        if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
        this.updateParticles(dt);

        switch (this.mode) {
            case 'story':
                this.story.t += dt;
                if (this.story.t > this.story.dur) { this.mode = 'play'; this.fadeIn = 0.8; }
                break;
            case 'play': this.updatePlay(dt); break;
            case 'scroll': this.updateScroll(dt); break;
            case 'warp': this.updateWarp(dt); break;
            case 'dialog': this.updateDialog(dt); this.updateAmbient(dt); break;
            case 'itemget': this.updateItemGet(dt); this.updateAmbient(dt); break;
            case 'event': this.updateEvent(dt); this.updateAmbient(dt); break;
            case 'death': this.updateDeath(dt); break;
            case 'ending': this.updateEnding(dt); break;
        }
        if (this.fadeIn > 0) this.fadeIn = Math.max(0, this.fadeIn - dt);
    }

    updateAmbient(dt) {
        this.updateEffects(dt);
        this.updateCritters(dt);
        this.updateCompanion(dt);
        const h = this.hero;
        if (h.thought) { h.thought.t -= dt; if (h.thought.t <= 0) h.thought = null; }
    }

    updatePlay(dt) {
        const h = this.hero;
        h.roomT += dt;
        if (this.manual.active) {
            this.manual.t -= dt;
            if (this.manual.t <= 0) { this.manual.active = false; this.manual.keys = {}; }
        }
        if (this.manual.active) this.manualControl(dt);
        else this.heroAI(dt);
        this.updateHero(dt);
        for (const e of this.enemies) this.updateEnemy(e, dt);
        this.enemies = this.enemies.filter(e => e.alive);
        this.updateProjectiles(dt);
        this.updatePickups(dt);
        this.updateShutters();
        this.updateAmbient(dt);
        this.checkExits();
        this.watchdog(dt);
    }

    // Last line of defence against the autopilot losing the plot.
    //
    // Stuck is not the same as standing still. A hero pacing between two spots
    // is moving every single frame, so the old test -- has the position changed
    // since last frame? -- saw nothing wrong and let the loop run until the
    // quest ended, while a hero frozen solid was rescued in eight seconds. What
    // matters is whether any ground is being covered, so what is tracked is the
    // box the hero has stayed inside: leaving it is the proof they are getting
    // somewhere, and a hero who is merely frozen is just the same thing with a
    // box of nothing. Logs what it saw, so a stuck state can be reported.
    watchdog(dt) {
        const h = this.hero;
        const restart = () => {
            this.wdBox = { x0: h.x, x1: h.x, y0: h.y, y1: h.y };
            this.idleT = 0;
            this.wdReset = false;
        };
        if (this.manual.active || h.state === 'sleep' || !this.wdBox) { restart(); return; }

        const x0 = Math.min(this.wdBox.x0, h.x), x1 = Math.max(this.wdBox.x1, h.x);
        const y0 = Math.min(this.wdBox.y0, h.y), y1 = Math.max(this.wdBox.y1, h.y);
        if ((x1 - x0) + (y1 - y0) > QUEST_STUCK_SPAN) { restart(); return; }
        this.wdBox = { x0, x1, y0, y1 };
        this.idleT += dt;

        const fighting = this.enemies.some(e => e.alive);
        const limit = fighting ? QUEST_STUCK_FIGHTING : QUEST_STUCK_CLEAR;
        if (this.idleT < limit) return;

        if (!this.wdReset) {
            this.wdReset = true;
            console.warn('Pixel Quest: hero going nowhere, resetting plans', {
                area: this.area.kind, room: [this.room.rx, this.room.ry], kind: this.room.kind, at: [h.x | 0, h.y | 0],
                box: [Math.round(x1 - x0), Math.round(y1 - y0)], held: this.idleT.toFixed(1), fighting,
                canReach: this.reachableCells(this.cellOf(h.x, h.y)).length,
                openCells: this.room.tiles.reduce((n, t) => n + (QuestWorld.OPEN[t] ? 1 : 0), 0),
                path: h.path.slice(), exitDir: h.exitDir, align: h.align, guided: h.guided, fleeT: h.fleeT, note: h.goalNote,
                goal: this.owGoal && this.owGoal.kind
            });
            h.path = []; h.exitDir = null; h.align = null; h.guided = 0; h.fleeT = 0; h.thinkT = 0;
            this.blockedExits = null;
            this.nudgeHero();
            this.planOverworld();
            return;
        }
        if (this.idleT > limit * 2) {
            // The new plan went nowhere either: hop somewhere else in the room
            console.warn('Pixel Quest: hero still going nowhere, relocating');
            this.relocateHero();
            restart();
        }
    }

    // -----------------------------------------------------------------------
    // Hero
    // -----------------------------------------------------------------------
    heroSpeed() {
        const h = this.hero;
        let s = 62 * (h.def.speed || 1);
        if (h.items.boots) s *= 1.25;
        if (h.swimming) s *= 0.75;
        return s;
    }

    updateHero(dt) {
        const h = this.hero, T = QuestWorld.T;
        if (h.atkCd > 0) h.atkCd -= dt;
        if (h.invuln > 0) h.invuln -= dt;
        if (h.portalCd > 0) h.portalCd -= dt;
        if (h.bombCd > 0) h.bombCd -= dt;
        if (h.thoughtCd > 0) h.thoughtCd -= dt;
        if (h.guided > 0) h.guided -= dt;

        // Attack in progress
        if (h.atk) {
            h.atk.t += dt;
            this.updateHeroAttack(dt);
            if (h.atk && h.atk.t >= h.atk.dur) h.atk = null;
        }

        // Knockback overrides walking
        if (h.knock) {
            h.knock.t -= dt;
            this.moveEntity(h, h.knock.vx * dt, h.knock.vy * dt, 'hero');
            if (h.knock.t <= 0) { h.knock = null; h.path = []; h.thinkT = 0; }
            return;
        }

        const speed = this.heroSpeed() * dt;
        let mx = 0, my = 0;
        if (h.atk && h.weapon.kind !== 'wave') {
            // Planted while swinging
        } else if (this.manual.active) {
            mx = this.manual.mx * speed;
            my = this.manual.my * speed;
        } else if (h.path.length) {
            const next = h.path[0];
            const W = this.room.cols;
            const tx = (next % W) * 16 + 8, ty = ((next / W) | 0) * 16 + 8;
            const k = this.room.tiles[next];
            // Bushes in the way get cut down, locked doors opened
            if (k === T.BUSH && Math.abs(tx - h.x) + Math.abs(ty - h.y) <= 17) {
                h.dir = this.dirToward(tx - h.x, ty - h.y);
                if (h.atkCd <= 0) this.heroAttack(h.dir, true);
            } else if (k === T.LOCK) {
                if (Math.abs(tx - h.x) + Math.abs(ty - h.y) <= 18) {
                    h.dir = this.dirToward(tx - h.x, ty - h.y);
                    this.tryUnlock(next);
                }
            }
            const dx = tx - h.x, dy = ty - h.y;
            if (QuestWorld.SOLID[this.room.tiles[next]] && !(k === T.WATER && h.def.swim)) {
                // Waiting on the bush or door; walk up to it but no further
                const dist = Math.abs(dx) + Math.abs(dy);
                if (dist > 16) {
                    if (Math.abs(dx) > Math.abs(dy)) mx = Math.sign(dx) * Math.min(speed, Math.abs(dx) - 15);
                    else my = Math.sign(dy) * Math.min(speed, Math.abs(dy) - 15);
                }
            } else if (Math.abs(dx) <= speed && Math.abs(dy) <= speed) {
                h.x = tx; h.y = ty;
                h.path.shift();
            } else if (Math.abs(dx) > 0.5 && Math.abs(dy) > 0.5) {
                // Off-grid: square up on the smaller axis first, Zelda-style
                if (Math.abs(dx) < Math.abs(dy)) mx = Math.sign(dx) * Math.min(speed, Math.abs(dx));
                else my = Math.sign(dy) * Math.min(speed, Math.abs(dy));
            } else if (Math.abs(dx) > 0.5) mx = Math.sign(dx) * Math.min(speed, Math.abs(dx));
            else my = Math.sign(dy) * Math.min(speed, Math.abs(dy));
        } else if (h.exitDir) {
            const D = QuestWorld.DIRS[h.exitDir];
            mx = D.dx * speed;
            my = D.dy * speed;
            // Keep centred on the opening while walking out
            if (D.dx) { const cy = Math.floor(h.y / 16) * 16 + 8; my = Math.sign(cy - h.y) * Math.min(Math.abs(cy - h.y), speed); }
            else { const cx = Math.floor(h.x / 16) * 16 + 8; mx = Math.sign(cx - h.x) * Math.min(Math.abs(cx - h.x), speed); }
        } else if (h.align) {
            const a = h.align;
            if (a.axis === 'x') mx = Math.sign(a.v - h.x) * Math.min(speed, Math.abs(a.v - h.x));
            else my = Math.sign(a.v - h.y) * Math.min(speed, Math.abs(a.v - h.y));
            if ((a.axis === 'x' && Math.abs(a.v - h.x) < 1) || (a.axis === 'y' && Math.abs(a.v - h.y) < 1)) h.align = null;
        }

        h.moving = !!(mx || my);
        if (h.moving) {
            if (!h.atk) h.dir = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 'right' : 'left') : (my > 0 ? 'down' : 'up');
            const ok = this.moveEntity(h, mx, my, 'hero');
            if (!ok && this.manual.active === false) {
                h.blockedT = (h.blockedT || 0) + dt;
                if (h.blockedT > 0.6) { h.path = []; h.thinkT = 0; h.blockedT = 0; }
            } else h.blockedT = 0;
            h.walkT += dt;
        }
        if (!h.atk && h.state !== 'sleep') h.state = h.moving ? 'walk' : 'idle';

        const tile = this.tileAt(Math.floor(h.x / 16), Math.floor(h.y / 16));
        h.swimming = tile === T.WATER;
        if (h.swimming && !h.wasSwimming) this.addEffect('splash', h.x, h.y + 4, { life: 0.4 });
        h.wasSwimming = h.swimming;

        // Stepped into a doorway or down a hole
        if ((tile === T.PORTAL || tile === T.HOLE) && h.portalCd <= 0) this.enterPortal(Math.floor(h.x / 16), Math.floor(h.y / 16));

        // Stuck detection: no progress while trying to move
        if (Math.abs(h.x - h.lastX) + Math.abs(h.y - h.lastY) > 0.5) { h.stuckT = 0; h.lastX = h.x; h.lastY = h.y; }
        else if (h.path.length || h.exitDir) {
            h.stuckT += dt;
            if (h.stuckT > 2.5) { h.path = []; h.exitDir = null; h.thinkT = 0; h.stuckT = 0; this.nudgeHero(); }
        }
        if (h.thought) { h.thought.t -= dt; if (h.thought.t <= 0) h.thought = null; }
    }

    // Hop the hero to the far side of the biggest open stretch of the room
    relocateHero() {
        const h = this.hero, room = this.room, W = room.cols;
        const seen = new Uint8Array(room.tiles.length);
        let best = null;
        for (let i = 0; i < room.tiles.length; i++) {
            if (seen[i] || !QuestWorld.OPEN[room.tiles[i]]) continue;
            const part = this.reachableCells(i);
            for (const c of part) seen[c] = 1;
            seen[i] = 1;
            if (!best || part.length > best.length) best = part;
        }
        if (!best || !best.length) return;
        // Furthest first, then one of the far half, so it is a real move and
        // not the same two tiles every time
        const far = (i) => Math.hypot((i % W) * 16 + 8 - h.x, ((i / W) | 0) * 16 + 8 - h.y);
        const sorted = best.slice().sort((a, b) => far(b) - far(a));
        const c = sorted[Math.floor(Math.random() * Math.max(1, Math.ceil(sorted.length / 2)))];
        this.addEffect('poof', h.x, h.y, { life: 0.4 });
        h.x = (c % W) * 16 + 8;
        h.y = ((c / W) | 0) * 16 + 8;
        this.think('Wheee!', 1.2);
    }

    // Shuffle the hero onto the nearest cell centre that isn't blocked
    nudgeHero() {
        const h = this.hero;
        const cells = this.reachableCells(this.cellOf(h.x, h.y));
        if (!cells.length) return;
        const W = this.room.cols;
        let best = cells[0], bd = Infinity;
        for (const i of cells) {
            const d = Math.abs((i % W) * 16 + 8 - h.x) + Math.abs(((i / W) | 0) * 16 + 8 - h.y);
            if (d < bd) { bd = d; best = i; }
        }
        h.x = (best % W) * 16 + 8;
        h.y = ((best / W) | 0) * 16 + 8;
    }

    nearestOpenCell(tx, ty) {
        const r = this.room, W = r.cols;
        let best = ty * W + tx, bd = Infinity;
        for (let i = 0; i < r.tiles.length; i++) {
            if (!QuestWorld.OPEN[r.tiles[i]]) continue;
            const d = Math.abs(i % W - tx) + Math.abs(((i / W) | 0) - ty);
            if (d < bd) { bd = d; best = i; }
        }
        return best;
    }

    dirToward(dx, dy) {
        return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }

    dirVec(d) {
        return { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d];
    }

    manualControl(dt) {
        const k = this.manual.keys, h = this.hero;
        this.manual.mx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
        this.manual.my = (k.down ? 1 : 0) - (k.up ? 1 : 0);
        if (this.manual.mx && this.manual.my) this.manual.my = 0;
        h.path = [];
        h.exitDir = null;
        if (this.manual.attack) {
            this.manual.attack = false;
            if (h.atkCd <= 0) this.heroAttack(h.dir);
        }
        if (this.manual.interact) {
            this.manual.interact = false;
            this.manualInteract();
        }
        if (this.manual.bomb) {
            this.manual.bomb = false;
            if (!this.dropBomb()) this.think('No bombs.', 1);
        }
    }

    // The cell the hero is facing, which is what an interaction acts on
    facedCell() {
        const h = this.hero, v = this.dirVec(h.dir);
        const tx = Math.floor((h.x + v[0] * 12) / 16);
        const ty = Math.floor((h.y + v[1] * 12) / 16);
        return { tx, ty, cell: ty * this.room.cols + tx };
    }

    // Open a locked door, or read a sign. Both were previously reachable only
    // from the autopilot's pathing, which left a human player unable to get
    // through a dungeon at all.
    manualInteract() {
        const h = this.hero, room = this.room, T = QuestWorld.T;
        const f = this.facedCell();

        if (this.tileAt(f.tx, f.ty) === T.LOCK) {
            if (this.tryUnlock(f.cell)) return true;
            this.think(h.keys > 0 ? 'Not this one.' : 'It needs a key.', 1.2);
            return false;
        }

        // Signs are read from the cell below them, the way the autopilot does
        const here = this.cellOf(h.x, h.y);
        const signCell = [here - room.cols, f.cell].find(
            (i) => room.signs && room.signs[i] !== undefined);
        if (signCell !== undefined) {
            if (!room.signRead) { room.signRead = true; this.stats.signs++; }
            h.dir = 'up';
            this.say(room.signs[signCell], { sign: true });
            return true;
        }
        return false;
    }

    // Drop a lit bomb. Shared with the autopilot's trySecondary so the player
    // and the brain cannot drift apart on cost and cooldown.
    dropBomb() {
        const h = this.hero;
        if (!h.items.bombs || h.bombs <= 0 || h.bombCd > 0) return null;
        h.bombs--;
        h.bombCd = 3;
        const b = this.fireProjectile('bombLit', h.x, h.y + 2, 0, 0, 'hero', 0);
        b.life = 2;
        return b;
    }

    think(text, dur = 1.8) {
        if (!this.config.thoughts || !this.hero) return;
        this.hero.thought = { text, t: dur };
        this.hero.thoughtCd = dur + 2.5;
    }

    quip() {
        const q = this.hero.def.quips;
        this.think(q[Math.floor(Math.random() * q.length)], 1.6);
    }

    // -----------------------------------------------------------------------
    // Attacks
    // -----------------------------------------------------------------------
    meleeBox(h, dir, reach, width) {
        const v = this.dirVec(dir);
        const cx = h.x + v[0] * (reach / 2 + 6), cy = h.y + v[1] * (reach / 2 + 6);
        return v[0] ? { x: cx, y: cy, w: reach + 4, h: width } : { x: cx, y: cy, w: width, h: reach + 4 };
    }

    heroAttack(dir, forBush = false) {
        const h = this.hero, wp = h.weapon;
        h.dir = dir;
        h.atkCd = wp.cd;
        const dmg = 1 + (h.items.glove ? 1 : 0);
        switch (wp.kind) {
            case 'melee':
                h.atk = { t: 0, dur: wp.dur, dir, hit: new Set(), dmg, kind: 'melee' };
                // The classic: a beam from the blade at full health
                if (h.def.beam && h.hp >= h.maxHp && !forBush && !this.projectiles.some(p => p.type === 'beam')) {
                    const v = this.dirVec(dir);
                    this.fireProjectile('beam', h.x + v[0] * 10, h.y + v[1] * 10, v[0] * 190, v[1] * 190, 'hero', dmg);
                }
                if (wp.style === 'pan' && Math.random() < 0.25) this.floatText('BONK!', h.x, h.y - 18, '#fce800');
                break;
            case 'tongue':
                h.atk = { t: 0, dur: wp.dur, dir, hit: new Set(), dmg, kind: 'tongue' };
                break;
            case 'shot': {
                h.atk = { t: 0, dur: 0.18, dir, hit: new Set(), dmg, kind: 'cast' };
                const v = this.dirVec(dir);
                this.fireProjectile(wp.proj, h.x + v[0] * 9, h.y + v[1] * 9 - 2, v[0] * wp.speed, v[1] * wp.speed, 'hero', dmg);
                break;
            }
            case 'boomerang': {
                if (this.projectiles.some(p => p.owner === 'hero' && p.type === wp.proj)) { h.atkCd = 0.1; return; }
                h.atk = { t: 0, dur: 0.18, dir, hit: new Set(), dmg, kind: 'cast' };
                const v = this.dirVec(dir);
                const p = this.fireProjectile(wp.proj, h.x + v[0] * 8, h.y + v[1] * 8, v[0] * wp.speed, v[1] * wp.speed, 'hero', dmg);
                p.boomerang = true; p.range = wp.range; p.travel = 0;
                break;
            }
            case 'wave':
                h.atk = { t: 0, dur: wp.dur, dir, hit: new Set(), dmg, kind: 'wave' };
                this.addEffect('ring', h.x, h.y, { life: wp.dur, radius: wp.radius, color: wp.color });
                if (wp.word && Math.random() < 0.55) this.floatText(wp.word, h.x, h.y - 20, wp.color);
                if (h.weapon === QuestEngineData.WEAPONS.spores) {
                    for (let i = 0; i < 10; i++) this.addEffect('spore', h.x, h.y, { life: 0.6, a: i / 10 * Math.PI * 2, r: wp.radius });
                }
                break;
        }
    }

    updateHeroAttack(dt) {
        const h = this.hero, a = h.atk, wp = h.weapon, T = QuestWorld.T;
        let box = null;
        if (a.kind === 'melee') {
            if (a.t > a.dur * 0.15) box = this.meleeBox(h, a.dir, wp.reach, wp.width);
        } else if (a.kind === 'tongue') {
            const ext = Math.sin(Math.min(1, a.t / a.dur) * Math.PI) * wp.reach;
            a.ext = ext;
            const v = this.dirVec(a.dir);
            box = v[0] ? { x: h.x + v[0] * (ext / 2 + 4), y: h.y, w: ext + 4, h: 6 } : { x: h.x, y: h.y + v[1] * (ext / 2 + 4), w: 6, h: ext + 4 };
            // The tongue drags pickups home
            for (const p of this.pickups) {
                if (!p.shop && !p.grabbed && this.overlap(box, { x: p.x, y: p.y, w: 8, h: 8 })) p.grabbed = true;
            }
        } else if (a.kind === 'wave') {
            const r = wp.radius * Math.min(1, a.t / (a.dur * 0.7));
            for (const e of this.enemies) {
                if (!e.alive || e.spawning || a.hit.has(e)) continue;
                if (Math.hypot(e.x - h.x, e.y - h.y) <= r + e.w / 2) { a.hit.add(e); this.damageEnemy(e, a.dmg, h.x, h.y); }
            }
            this.cutBushesInRadius(h.x, h.y, r);
            return;
        }
        if (!box) return;
        for (const e of this.enemies) {
            if (!e.alive || e.spawning || a.hit.has(e)) continue;
            if (this.overlap(box, e)) {
                a.hit.add(e);
                this.damageEnemy(e, a.dmg, h.x, h.y, wp.knock);
                // Hit and run against anything big
                if (e.boss) h.fleeT = 0.5;
            }
        }
        // Bushes caught in the swing
        const x0 = Math.floor((box.x - box.w / 2) / 16), x1 = Math.floor((box.x + box.w / 2 - 1) / 16);
        const y0 = Math.floor((box.y - box.h / 2) / 16), y1 = Math.floor((box.y + box.h / 2 - 1) / 16);
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.tileAt(tx, ty) === T.BUSH) this.cutBush(tx, ty);
    }

    cutBushesInRadius(x, y, r) {
        const T = QuestWorld.T;
        for (let ty = Math.floor((y - r) / 16); ty <= Math.floor((y + r) / 16); ty++) {
            for (let tx = Math.floor((x - r) / 16); tx <= Math.floor((x + r) / 16); tx++) {
                if (this.tileAt(tx, ty) === T.BUSH && Math.hypot(tx * 16 + 8 - x, ty * 16 + 8 - y) < r + 6) this.cutBush(tx, ty);
            }
        }
    }

    cutBush(tx, ty) {
        const T = QuestWorld.T, r = this.room, i = ty * r.cols + tx;
        r.tiles[i] = T.FLOOR;
        this.stats.bushes++;
        const name = r.obj[i];
        const colors = name === 'gumdrop' ? ['#58d838', '#fcfcfc'] : name === 'leafpile' ? ['#f88818', '#fcd848', '#e83818'] : ['#00a800', '#58d854', '#005800'];
        for (let n = 0; n < 6; n++) this.addEffect('leaf', tx * 16 + 8, ty * 16 + 8, { life: 0.5, vx: (Math.random() - 0.5) * 70, vy: -Math.random() * 60, color: colors[n % colors.length] });
        this.renderRoom();
        const roll = this.rng();
        if (roll < 0.12) this.addPickup('money', tx * 16 + 8, ty * 16 + 8);
        else if (roll < 0.18 && this.hero.hp < this.hero.maxHp) this.addPickup('heart', tx * 16 + 8, ty * 16 + 8);
    }

    fireProjectile(type, x, y, vx, vy, owner, dmg = 1) {
        const p = { type, x, y, vx, vy, owner, dmg, t: 0, life: 3, w: 6, h: 6, spin: 0 };
        if (type === 'laser') { p.w = Math.abs(vx) > 0 ? 10 : 3; p.h = Math.abs(vx) > 0 ? 3 : 10; }
        if (type === 'fire') { p.w = 8; p.h = 8; }
        this.projectiles.push(p);
        return p;
    }

    // -----------------------------------------------------------------------
    // Damage
    // -----------------------------------------------------------------------
    damageEnemy(e, dmg, fromX, fromY, knockMul = 1) {
        if (e.invuln > 0 || !e.visible || e.friendly) return;
        // Armour: a shell pulled in, a chest still pretending, or a shield
        // held the way the blow is coming from. Clang, and nothing else.
        if (e.tucked || this.shieldBlocks(e, fromX, fromY)) {
            e.invuln = 0.25;
            this.addEffect('spark', e.x + Math.sign(fromX - e.x) * 7, e.y - 2, { life: 0.25 });
            if (e.boss) this.shake = 0.08;
            return;
        }
        e.hp -= dmg;
        e.invuln = e.boss ? 0.5 : 0.3;
        const dx = e.x - fromX, dy = e.y - fromY, d = Math.hypot(dx, dy) || 1;
        if (!e.boss) e.knock = { vx: dx / d * 140 * knockMul, vy: dy / d * 140 * knockMul, t: 0.14 };
        this.addEffect('spark', e.x, e.y - 4, { life: 0.2 });
        if (e.hp <= 0) this.killEnemy(e);
        else if (e.boss) this.shake = 0.1;
    }

    // A shield only covers the way its bearer faces, so the answer is to go
    // round them -- which is also what stops the autopilot swinging at one
    // forever, since attackCells asks this before picking a spot to stand.
    shieldBlocks(e, fromX, fromY) {
        if (!e.def || !e.def.shield) return false;
        const dx = fromX - e.x, dy = fromY - e.y;
        if (Math.abs(dx) <= Math.abs(dy)) return false;     // over the top of it
        // The sprite is only ever drawn facing left or right, so the shield is
        // on the right unless it is explicitly facing left -- and the rule has
        // to agree with the picture or it reads as a cheat
        return dx < 0 ? e.dir === 'left' : e.dir !== 'left';
    }

    killEnemy(e) {
        const h = this.hero, QA = QuestArt;
        e.alive = false;
        if (e.boss) { this.bossDefeated(e); return; }
        // Some things do not die so much as come apart
        if (e.def.splits && !this.diff.befriend) {
            for (let i = 0; i < 2; i++) {
                const a = Math.PI * (0.25 + i) + Math.random() * 0.5;
                const m = this.spawnEnemy(e.def.splits, e.x + Math.cos(a) * 9, e.y + Math.sin(a) * 9, 0.25);
                if (m) this.keepInRoom(m);
            }
        }
        if (this.diff.befriend) {
            this.stats.friends++;
            for (let i = 0; i < 5; i++) this.addEffect('heart', e.x, e.y - 6, { life: 1, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30 });
            this.addEffect('friend', e.x, e.y, { life: 1.4, sprite: e.type, keep: false });
        } else {
            this.stats.monsters++;
            this.addEffect('poof', e.x, e.y - 2, { life: 0.4 });
        }
        // Drops
        const roll = this.rng();
        const heart = 0.34 + 0.16 * (this.diff.heal === undefined ? 1 : this.diff.heal);
        if (roll < 0.28) this.addPickup('money', e.x, e.y);
        else if (roll < 0.34) this.addPickup('money5', e.x, e.y);
        else if (roll < heart && h.hp < h.maxHp) this.addPickup('heart', e.x, e.y);
        else if (roll < 0.55 && h.items.bombs) this.addPickup('bomb', e.x, e.y);
        else if (roll < 0.57) this.addPickup('fairy', e.x, e.y);
        if (this.rng() < 0.15 && h.thoughtCd <= 0) this.think(QA.WORDS.thoughts.victory[Math.floor(Math.random() * 4)], 1.2);
    }

    bossDefeated(e) {
        const room = this.room;
        room.bossDefeated = true;
        this.stats.monsters++;
        this.mode = 'event';
        this.event = { kind: 'bossdeath', t: 0, x: e.x, y: e.y, boss: e };
        this.shake = 0.6;
        this.enemies.forEach(m => { m.alive = false; this.addEffect('poof', m.x, m.y, { life: 0.4 }); });
        this.projectiles = [];
    }

    hurtHero(dmg, fromX, fromY) {
        const h = this.hero;
        if (h.invuln > 0 || dmg <= 0 || this.mode !== 'play') return;
        h.hp -= dmg;
        h.invuln = 1.1;
        h.atk = null;
        const dx = h.x - fromX, dy = h.y - fromY, d = Math.hypot(dx, dy) || 1;
        // Knockback along the dominant axis keeps the hero on the grid
        if (Math.abs(dx) > Math.abs(dy)) h.knock = { vx: Math.sign(dx) * 150, vy: 0, t: 0.16 };
        else h.knock = { vx: 0, vy: Math.sign(dy || 1) * 150, t: 0.16 };
        h.path = [];
        h.fleeT = 0.9;
        this.shake = 0.12;
        if (Math.random() < 0.4) this.think(QuestArt.WORDS.thoughts.hurt[Math.floor(Math.random() * 5)], 1);
        if (h.hp <= 0) this.heroDown();
        else if (h.hp <= 2 && h.thoughtCd <= 0) this.think(QuestArt.WORDS.thoughts.lowhp[Math.floor(Math.random() * 4)], 1.8);
    }

    heroDown() {
        const h = this.hero;
        if (h.potion > 0) {
            h.potion--;
            h.hp = h.maxHp;
            h.invuln = 2;
            this.floatText('POTION!', h.x, h.y - 20, '#f85878', 1.4);
            for (let i = 0; i < 10; i++) this.addEffect('heart', h.x, h.y - 6, { life: 1, vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 40 });
            return;
        }
        h.hp = 0;
        this.stats.deaths++;
        if (this.area.kind === 'cowlevel' && this.area.cowStats) this.area.cowStats.deaths++;
        // Twice beaten in the same dungeon: go and get stronger first
        if (this.area.kind === 'dungeon') {
            const D = this.world.dungeons[this.room.dungeon];
            D.deaths = (D.deaths || 0) + 1;
            if (D.deaths % 2 === 0) { D.deferRooms = this.stats.rooms + 3; D.deferHp = h.maxHp; D.deferT = this.time; }
            if (D.deaths % 3 === 0 && (D.pity || 0) < 2 && h.maxHp < MAX_HEARTS * 2) { D.pity = (D.pity || 0) + 1; this.pityHeart = true; }
        }
        if (h.def.lives) h.lives = Math.max(0, h.lives - 1);
        this.mode = 'death';
        this.death = { t: 0 };
        this.projectiles = [];
    }

    // -----------------------------------------------------------------------
    // Enemies
    // -----------------------------------------------------------------------
    enemyCellOK(e, cx, cy) {
        const r = this.room, t = r.thick || 1;
        const margin = this.area.kind === 'overworld' ? 1 : t;
        if (cx < margin || cy < margin || cx >= r.cols - margin || cy >= r.rows - margin) return false;
        if (e.def.swims) {
            const k = r.tiles[cy * r.cols + cx];
            const hasWater = r.tiles.some(v => v === QuestWorld.T.WATER);
            return hasWater ? k === QuestWorld.T.WATER : !this.solidFor('enemy', cx, cy);
        }
        return !this.solidFor('enemy', cx, cy);
    }

    walkStep(e, dt, speed, opts = {}) {
        const h = this.hero;
        if (e.pause > 0) { e.pause -= dt; return false; }
        if (!e.mv) {
            const cx = Math.floor(e.x / 16), cy = Math.floor(e.y / 16);
            let dirs = ['up', 'down', 'left', 'right'];
            if (opts.horizontal && Math.random() < 0.85) dirs = ['left', 'right'];
            dirs.sort(() => Math.random() - 0.5);
            if (opts.chase && Math.random() < opts.chase) dirs.unshift(this.dirToward(h.x - e.x, h.y - e.y));
            else if (Math.random() < 0.55) dirs.unshift(e.dir);
            for (const d of dirs) {
                const v = this.dirVec(d);
                if (this.enemyCellOK(e, cx + v[0], cy + v[1])) {
                    e.mv = { tx: (cx + v[0]) * 16 + 8, ty: (cy + v[1]) * 16 + 8 };
                    e.dir = d;
                    break;
                }
            }
            if (!e.mv) { e.pause = 0.4; return false; }
        }
        const dx = e.mv.tx - e.x, dy = e.mv.ty - e.y, s = speed * dt;
        if (Math.abs(dx) <= s && Math.abs(dy) <= s) {
            e.x = e.mv.tx; e.y = e.mv.ty; e.mv = null;
            if (Math.random() < (opts.pauseChance || 0.15)) e.pause = 0.3 + Math.random() * 0.8;
            return true;
        }
        e.x += Math.sign(dx) * Math.min(s, Math.abs(dx));
        e.y += Math.sign(dy) * Math.min(s, Math.abs(dy));
        return false;
    }

    updateEnemy(e, dt) {
        const h = this.hero;
        e.animT += dt;
        if (e.spawning) { e.spawnT -= dt; if (e.spawnT <= 0) e.spawning = false; return; }
        if (e.invuln > 0) e.invuln -= dt;
        if (e.knock) {
            e.knock.t -= dt;
            this.moveEntity(e, e.knock.vx * dt, e.knock.vy * dt, e.flying ? 'proj' : 'enemy');
            if (e.knock.t <= 0) { e.knock = null; e.mv = null; }
            return;
        }
        if (e.stun > 0) { e.stun -= dt; return; }
        if (e.boss) this.updateBoss(e, dt);
        else this.updateMinion(e, dt);

        // Touching the hero hurts (unless the world is peaceful)
        if (e.alive && e.visible && e.z < 5 && this.overlap(e, { x: h.x, y: h.y, w: 10, h: 10 })) {
            const dmg = (e.def.dmg || 1) * this.diff.dmg;
            this.hurtHero(dmg, e.x, e.y);
        }
    }

    updateMinion(e, dt) {
        const h = this.hero, def = e.def;
        switch (def.ai) {
            case 'wander':
                this.walkStep(e, dt, e.speed, { chase: 0.25 });
                break;
            case 'sideways':
                this.walkStep(e, dt, e.speed, { horizontal: true, pauseChance: 0.05 });
                break;
            case 'shooter': {
                e.shootT -= dt;
                if (e.windup > 0) {
                    e.windup -= dt;
                    if (e.windup <= 0) {
                        const v = this.dirVec(e.dir);
                        const sp = def.shot === 'spear' ? 130 : 110;
                        this.fireProjectile(def.shot || 'rock', e.x + v[0] * 8, e.y + v[1] * 8, v[0] * sp, v[1] * sp, 'enemy', (def.dmg || 1) * this.diff.dmg);
                        e.pause = 0.3;
                    }
                    break;
                }
                if (e.shootT <= 0 && !e.mv) {
                    e.shootT = 1.6 + Math.random() * 1.8;
                    const aligned = Math.abs(h.x - e.x) < 10 || Math.abs(h.y - e.y) < 10;
                    if (aligned || Math.random() < 0.4) e.dir = this.dirToward(h.x - e.x, h.y - e.y);
                    e.windup = 0.35;
                    break;
                }
                this.walkStep(e, dt, e.speed, { chase: 0.15, pauseChance: 0.25 });
                break;
            }
            case 'hopper': {
                if (e.hop) {
                    e.hop.t += dt;
                    const u = Math.min(1, e.hop.t / e.hop.dur);
                    e.x = e.hop.fx + (e.hop.tx - e.hop.fx) * u;
                    e.y = e.hop.fy + (e.hop.ty - e.hop.fy) * u;
                    e.z = Math.sin(u * Math.PI) * 9;
                    if (u >= 1) { e.hop = null; e.z = 0; e.rest = 0.3 + Math.random() * 0.8; }
                    break;
                }
                e.rest -= dt;
                if (e.rest > 0) break;
                const cx = Math.floor(e.x / 16), cy = Math.floor(e.y / 16);
                const opts = [];
                for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                    if ((!dx && !dy) || Math.abs(dx) + Math.abs(dy) > 2) continue;
                    if (this.enemyCellOK(e, cx + dx, cy + dy)) opts.push([cx + dx, cy + dy]);
                }
                if (!opts.length) { e.rest = 0.5; break; }
                let t = opts[Math.floor(Math.random() * opts.length)];
                if (Math.random() < 0.5) {
                    opts.sort((a, b) => Math.hypot(a[0] * 16 + 8 - h.x, a[1] * 16 + 8 - h.y) - Math.hypot(b[0] * 16 + 8 - h.x, b[1] * 16 + 8 - h.y));
                    t = opts[0];
                }
                e.hop = { t: 0, dur: 0.42 + 26 / e.speed * 0.1, fx: e.x, fy: e.y, tx: t[0] * 16 + 8, ty: t[1] * 16 + 8 };
                e.dir = t[0] * 16 + 8 < e.x ? 'left' : 'right';
                break;
            }
            case 'flyer': {
                e.headT -= dt;
                if (e.rest > 0 && e.landed) { e.rest -= dt; if (e.rest <= 0) e.landed = false; break; }
                if (e.headT <= 0) {
                    e.headT = 0.5 + Math.random() * 1.1;
                    if (Math.random() < 0.15 && def.type !== 'wisp') { e.landed = true; e.rest = 0.6 + Math.random() * 0.8; e.vx = e.vy = 0; break; }
                    const a = Math.random() < 0.35 ? Math.atan2(h.y - e.y, h.x - e.x) : Math.random() * Math.PI * 2;
                    const s = e.speed * (0.6 + Math.random() * 0.6);
                    e.vx = Math.cos(a) * s; e.vy = Math.sin(a) * s;
                }
                e.x += e.vx * dt; e.y += e.vy * dt;
                this.keepInRoom(e);
                if (Math.abs(e.vx) > 2) e.dir = e.vx < 0 ? 'left' : 'right';
                break;
            }
            case 'chaser': {
                e.phaseT += dt;
                if (def.phasing) {
                    const cyc = e.phaseT % 6;
                    e.visible = cyc < 4;
                    e.alpha = cyc < 3.4 ? 1 : cyc < 4 ? 1 - (cyc - 3.4) / 0.6 : cyc > 5.4 ? (cyc - 5.4) / 0.6 : 0;
                }
                const a = Math.atan2(h.y - e.y, h.x - e.x) + Math.sin(e.phaseT * 2) * 0.7;
                const nx = Math.cos(a) * e.speed * dt, ny = Math.sin(a) * e.speed * dt;
                if (def.phasing) { e.x += nx; e.y += ny; this.keepInRoom(e); }
                else this.moveEntity(e, nx, ny, 'enemy');
                e.dir = h.x < e.x ? 'left' : 'right';
                break;
            }
            case 'charger': {
                if (e.charge) {
                    const v = this.dirVec(e.charge);
                    const moved = this.moveEntity(e, v[0] * e.speed * 2.6 * dt, v[1] * e.speed * 2.6 * dt, 'enemy');
                    e.charge_t = (e.charge_t || 0) + dt;
                    if (!moved || e.charge_t > 2) { e.charge = null; e.stun = 0.5; e.mv = null; this.snapToCell(e); }
                    break;
                }
                const ax = Math.abs(h.x - e.x) < 7, ay = Math.abs(h.y - e.y) < 7;
                if ((ax || ay) && Math.hypot(h.x - e.x, h.y - e.y) < 96 && !e.mv && this.lineClear(e.x, e.y, h.x, h.y)) {
                    e.charge = this.dirToward(h.x - e.x, h.y - e.y);
                    e.dir = e.charge;
                    e.charge_t = 0;
                    break;
                }
                this.walkStep(e, dt, e.speed, { chase: 0.2 });
                break;
            }
            case 'stalker': {
                // Minds its own business until you are close enough to be
                // worth the trouble, and then commits entirely
                if (e.charge) {
                    const v = this.dirVec(e.charge);
                    const moved = this.moveEntity(e, v[0] * e.speed * 2.2 * dt, v[1] * e.speed * 2.2 * dt, 'enemy');
                    e.charge_t = (e.charge_t || 0) + dt;
                    if (!moved || e.charge_t > 1.5) { e.charge = null; e.stun = 0.45; e.mv = null; }
                    break;
                }
                if (Math.hypot(h.x - e.x, h.y - e.y) < 54 && !e.mv) {
                    e.charge = this.dirToward(h.x - e.x, h.y - e.y);
                    e.dir = e.charge;
                    e.charge_t = 0;
                    if (Math.random() < 0.5) this.floatText('HONK!', e.x, e.y - 12, '#fcfcfc', 0.7);
                    break;
                }
                this.walkStep(e, dt, e.speed * 0.4, { chase: 0.5, pauseChance: 0.2 });
                break;
            }
            case 'rebound': {
                // No interest in the hero at all: it just goes, and the room
                // is what it argues with
                if (!e.vx && !e.vy) {
                    const a = (Math.floor(Math.random() * 4) * 2 + 1) * Math.PI / 4;
                    e.vx = Math.cos(a) * e.speed;
                    e.vy = Math.sin(a) * e.speed;
                }
                if (!this.moveEntity(e, e.vx * dt, 0, 'enemy')) e.vx = -e.vx;
                if (!this.moveEntity(e, 0, e.vy * dt, 'enemy')) e.vy = -e.vy;
                this.keepInRoom(e);
                e.dir = e.vx < 0 ? 'left' : 'right';
                break;
            }
            case 'mender': {
                // Patches up whichever of its friends is worst off, which
                // makes it the thing worth hitting first
                const patient = this.enemies
                    .filter(m => m.alive && m !== e && !m.spawning && m.hp < m.maxHp)
                    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
                e.shootT -= dt;
                if (!patient) { this.walkStep(e, dt, e.speed, { chase: 0.1, pauseChance: 0.4 }); break; }
                if (Math.hypot(patient.x - e.x, patient.y - e.y) > 26) {
                    const a = Math.atan2(patient.y - e.y, patient.x - e.x);
                    this.moveEntity(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt, 'enemy');
                    e.dir = patient.x < e.x ? 'left' : 'right';
                } else if (e.shootT <= 0) {
                    e.shootT = 2.4;
                    patient.hp = Math.min(patient.maxHp, patient.hp + 1);
                    patient.invuln = Math.max(patient.invuln, 0.2);
                    this.addEffect('heart', patient.x, patient.y - 6, { life: 0.7, vx: 0, vy: -26 });
                    this.floatText('+1', patient.x, patient.y - 14, '#58f858', 0.7);
                }
                break;
            }
            case 'burrower': {
                // Under the sand it cannot be touched and cannot touch, but it
                // always knows where you are. The fin is the only warning.
                e.phaseT -= dt;
                if (e.burrowed) {
                    const a = Math.atan2(h.y - e.y, h.x - e.x);
                    e.x += Math.cos(a) * e.speed * dt;
                    e.y += Math.sin(a) * e.speed * dt;
                    this.keepInRoom(e);
                    e.dir = h.x < e.x ? 'left' : 'right';
                    if (e.phaseT <= 0 || Math.hypot(h.x - e.x, h.y - e.y) < 18) {
                        e.burrowed = false;
                        e.visible = true;
                        e.phaseT = 2.4 + Math.random() * 1.2;
                        this.addEffect('poof', e.x, e.y, { life: 0.4 });
                        this.snapToCell(e);
                    }
                    break;
                }
                this.walkStep(e, dt, e.speed * 0.55, { chase: 0.6 });
                if (e.phaseT <= 0) {
                    e.burrowed = true;
                    e.visible = false;
                    e.phaseT = 1.6 + Math.random();
                    this.addEffect('poof', e.x, e.y, { life: 0.4 });
                }
                break;
            }
            case 'teleporter': {
                e.phaseT -= dt;
                e.state = e.state || 'hidden';
                if (e.phaseT > 0) {
                    if (e.state === 'appear') e.alpha = 1 - e.phaseT / 0.4;
                    if (e.state === 'vanish') e.alpha = e.phaseT / 0.4;
                    break;
                }
                switch (e.state) {
                    case 'hidden': {
                        // Reappear lined up with the hero, a few tiles away
                        const W = this.room.cols, hx = Math.floor(h.x / 16), hy = Math.floor(h.y / 16);
                        const opts = [];
                        for (let d = 3; d <= 5; d++) for (const [vx, vy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                            if (this.enemyCellOK(e, hx + vx * d, hy + vy * d)) opts.push([hx + vx * d, hy + vy * d]);
                        }
                        if (opts.length) { const o = opts[Math.floor(Math.random() * opts.length)]; e.x = o[0] * 16 + 8; e.y = o[1] * 16 + 8; }
                        e.state = 'appear'; e.phaseT = 0.4; e.visible = true; e.alpha = 0;
                        break;
                    }
                    case 'appear':
                        e.state = 'cast'; e.phaseT = 0.3; e.alpha = 1;
                        e.dir = this.dirToward(h.x - e.x, h.y - e.y);
                        break;
                    case 'cast': {
                        const v = this.dirVec(e.dir);
                        this.fireProjectile('magic', e.x + v[0] * 8, e.y + v[1] * 8, v[0] * 120, v[1] * 120, 'enemy', this.diff.dmg);
                        e.state = 'stay'; e.phaseT = 0.9;
                        break;
                    }
                    case 'stay':
                        e.state = 'vanish'; e.phaseT = 0.4;
                        break;
                    case 'vanish':
                        e.state = 'hidden'; e.phaseT = 0.8 + Math.random(); e.visible = false; e.alpha = 0;
                        break;
                }
                break;
            }
        }
    }

    keepInRoom(e) {
        const r = this.room, t = this.area.kind === 'overworld' ? 1 : (r.thick || 1);
        const minX = t * 16 + 6, maxX = (r.cols - t) * 16 - 6, minY = t * 16 + 6, maxY = (r.rows - t) * 16 - 6;
        if (e.x < minX) { e.x = minX; e.vx = Math.abs(e.vx || 0); }
        if (e.x > maxX) { e.x = maxX; e.vx = -Math.abs(e.vx || 0); }
        if (e.y < minY) { e.y = minY; e.vy = Math.abs(e.vy || 0); }
        if (e.y > maxY) { e.y = maxY; e.vy = -Math.abs(e.vy || 0); }
    }

    snapToCell(e) {
        const cx = Math.floor(e.x / 16) * 16 + 8, cy = Math.floor(e.y / 16) * 16 + 8;
        if (this.boxFree('enemy', cx - e.w / 2, cy - e.h / 2, e.w, e.h)) { e.x = cx; e.y = cy; }
    }

    lineClear(x0, y0, x1, y1) {
        const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
        for (let i = 1; i < n; i++) {
            const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
            if (this.solidFor('proj', Math.floor(x / 16), Math.floor(y / 16))) return false;
        }
        return true;
    }

    updateBoss(e, dt) {
        const h = this.hero, def = e.def;
        e.t += dt;
        const minions = this.enemies.filter(m => !m.boss && m.alive).length;
        const summon = (type, n = 1) => {
            for (let i = 0; i < n && minions + i < 4; i++) {
                const a = Math.random() * Math.PI * 2;
                const m = this.spawnEnemy(type, e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, 0.3);
                if (m) this.keepInRoom(m);
            }
        };
        switch (def.ai) {
            case 'bouncer': {
                if (e.hop) {
                    e.hop.t += dt;
                    const u = Math.min(1, e.hop.t / e.hop.dur);
                    e.x = e.hop.fx + (e.hop.tx - e.hop.fx) * u;
                    e.y = e.hop.fy + (e.hop.ty - e.hop.fy) * u;
                    e.z = Math.sin(u * Math.PI) * 18;
                    if (u >= 1) {
                        e.hop = null; e.z = 0; e.rest = 0.5 + Math.random() * 0.4;
                        this.shake = 0.2;
                        e.hopN++;
                        if (e.hopN % 3 === 0 && def.minion) summon(def.minion, 2);
                    }
                    break;
                }
                e.rest -= dt;
                if (e.rest > 0) break;
                const a = Math.atan2(h.y - e.y, h.x - e.x) + (Math.random() - 0.5) * 0.8;
                const d = 30 + Math.random() * 30;
                const tgt = { x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, vx: 0, vy: 0 };
                this.keepInRoomBoss(tgt);
                e.hop = { t: 0, dur: 0.75, fx: e.x, fy: e.y, tx: tgt.x, ty: tgt.y };
                e.dir = tgt.x < e.x ? 'left' : 'right';
                break;
            }
            case 'dragon': {
                // Patrols the right side, breathing fire three ways
                const r = this.room;
                e.x += ((r.cols * 16 * 0.72) - e.x) * Math.min(1, dt * 1.5);
                const top = (r.thick || 1) * 16 + 20, bot = (r.rows - (r.thick || 1)) * 16 - 20;
                e.y += Math.sin(e.t * 0.9) * e.speed * dt * 1.6;
                e.y = Math.max(top, Math.min(bot, e.y));
                e.dir = 'left';
                e.shootT -= dt;
                if (e.shootT <= 0) {
                    e.shootT = 2.6 - Math.min(1, (1 - e.hp / e.maxHp)) * 0.8;
                    const base = Math.atan2(h.y - e.y, h.x - e.x);
                    for (const off of [-0.32, 0, 0.32]) this.fireProjectile('fire', e.x - 12, e.y - 6, Math.cos(base + off) * 95, Math.sin(base + off) * 95, 'enemy', this.diff.dmg);
                }
                break;
            }
            case 'gazer': {
                const r = this.room;
                const cx = r.cols * 8, cy = r.rows * 8;
                e.x = cx + Math.cos(e.t * 0.45) * (r.cols * 8 - 48);
                e.y = cy + Math.sin(e.t * 0.8) * (r.rows * 8 - 40);
                e.shootT -= dt;
                if (e.shootT <= 0) {
                    e.shootT = 3.2;
                    for (let i = 0; i < 6; i++) {
                        const a = i / 6 * Math.PI * 2 + e.t;
                        this.fireProjectile('tear', e.x, e.y, Math.cos(a) * 80, Math.sin(a) * 80, 'enemy', this.diff.dmg);
                    }
                }
                break;
            }
            case 'charger': {
                if (e.charge) {
                    const v = this.dirVec(e.charge);
                    const nx = e.x + v[0] * e.speed * 3 * dt, ny = e.y + v[1] * e.speed * 3 * dt;
                    const t = { x: nx, y: ny, vx: 0, vy: 0 };
                    this.keepInRoomBoss(t);
                    if (t.x !== nx || t.y !== ny) { e.x = t.x; e.y = t.y; e.charge = null; e.stun = 1.1; this.shake = 0.3; break; }
                    e.x = nx; e.y = ny;
                    break;
                }
                e.shootT -= dt;
                if (def.minion && e.shootT <= 0) {
                    e.shootT = 2.8;
                    const a = Math.atan2(h.y - e.y, h.x - e.x);
                    this.fireProjectile(def.shot || 'sock', e.x, e.y, Math.cos(a) * 90, Math.sin(a) * 90, 'enemy', this.diff.dmg);
                    if (Math.random() < 0.35) summon(def.minion, 1);
                }
                if ((Math.abs(h.x - e.x) < 10 || Math.abs(h.y - e.y) < 10) && e.t > 1) {
                    e.charge = this.dirToward(h.x - e.x, h.y - e.y);
                    e.dir = e.charge === 'left' ? 'left' : 'right';
                    break;
                }
                const a = Math.atan2(h.y - e.y, h.x - e.x) + Math.PI / 2;
                e.x += Math.cos(a) * e.speed * 0.4 * dt;
                e.y += Math.sin(a) * e.speed * 0.4 * dt;
                this.keepInRoomBoss(e);
                break;
            }
            case 'shell': {
                // Two states and nothing in between: tucked in and bouncing
                // round the room untouchable, or out and vulnerable. The fight
                // is learning to be somewhere else for the first half of it.
                if (e.modeT === undefined) { e.mode = 'out'; e.modeT = 4; }
                e.modeT -= dt;
                if (e.mode === 'out') {
                    e.tucked = false;
                    e.frameLock = 0;
                    const a = Math.atan2(h.y - e.y, h.x - e.x);
                    e.x += Math.cos(a) * e.speed * 0.5 * dt;
                    e.y += Math.sin(a) * e.speed * 0.5 * dt;
                    this.keepInRoomBoss(e);
                    e.dir = h.x < e.x ? 'left' : 'right';
                    e.shootT -= dt;
                    if (e.shootT <= 0) {
                        e.shootT = 1.7;
                        this.fireProjectile('tear', e.x, e.y, Math.cos(a) * 100, Math.sin(a) * 100, 'enemy', this.diff.dmg);
                    }
                    if (e.modeT <= 0) {
                        e.mode = 'tuck';
                        e.modeT = 2.8;
                        const sa = Math.atan2(h.y - e.y, h.x - e.x) + (Math.random() - 0.5) * 0.6;
                        e.vx = Math.cos(sa) * e.speed * 2.2;
                        e.vy = Math.sin(sa) * e.speed * 2.2;
                        this.shake = 0.2;
                    }
                    break;
                }
                e.tucked = true;
                e.frameLock = 1;
                const r = this.room, t = r.thick || 1;
                e.x += e.vx * dt;
                e.y += e.vy * dt;
                const minX = t * 16 + 14, maxX = (r.cols - t) * 16 - 14;
                const minY = t * 16 + 14, maxY = (r.rows - t) * 16 - 12;
                if (e.x < minX) { e.x = minX; e.vx = Math.abs(e.vx); this.shake = 0.15; }
                if (e.x > maxX) { e.x = maxX; e.vx = -Math.abs(e.vx); this.shake = 0.15; }
                if (e.y < minY) { e.y = minY; e.vy = Math.abs(e.vy); this.shake = 0.15; }
                if (e.y > maxY) { e.y = maxY; e.vy = -Math.abs(e.vy); this.shake = 0.15; }
                if (e.modeT <= 0) {
                    // Dizzy from the spin, which is the opening
                    e.mode = 'out';
                    e.modeT = 5.6;
                    e.tucked = false;
                    e.frameLock = 0;
                    e.stun = 1.9;
                }
                break;
            }
            case 'mimic': {
                if (!e.woke) {
                    // Treasure, obviously. Nothing to worry about.
                    e.frameLock = 0;
                    e.tucked = true;
                    if (e.t > 3 || Math.hypot(h.x - e.x, h.y - e.y) < 36) {
                        e.woke = true;
                        e.tucked = false;
                        e.frameLock = undefined;
                        e.rest = 0.5;
                        this.shake = 0.4;
                        this.showBanner(def.name.toUpperCase(), def.title.toUpperCase());
                        for (let i = 0; i < 10; i++) {
                            this.addEffect('spark', e.x + (Math.random() - 0.5) * 24, e.y - 6 - Math.random() * 10, { life: 0.4 });
                        }
                    }
                    break;
                }
                if (e.hop) {
                    e.hop.t += dt;
                    const u = Math.min(1, e.hop.t / e.hop.dur);
                    e.x = e.hop.fx + (e.hop.tx - e.hop.fx) * u;
                    e.y = e.hop.fy + (e.hop.ty - e.hop.fy) * u;
                    e.z = Math.sin(u * Math.PI) * 15;
                    if (u >= 1) {
                        e.hop = null;
                        e.z = 0;
                        e.rest = 1.1;
                        this.shake = 0.25;
                        // Lands heavily and its winnings go everywhere
                        const half = e.hp <= e.maxHp / 2;
                        const n = half ? 6 : 4;
                        for (let i = 0; i < n; i++) {
                            const a = i / n * Math.PI * 2 + Math.random() * 0.4;
                            this.fireProjectile('coin', e.x, e.y, Math.cos(a) * 72, Math.sin(a) * 72, 'enemy', this.diff.dmg);
                        }
                        if (half && def.minion && Math.random() < 0.45) summon(def.minion, 1);
                    }
                    break;
                }
                e.rest -= dt;
                if (e.rest > 0) break;
                const ha = Math.atan2(h.y - e.y, h.x - e.x);
                const hd = Math.min(Math.hypot(h.x - e.x, h.y - e.y), 58);
                const tgt = { x: e.x + Math.cos(ha) * hd, y: e.y + Math.sin(ha) * hd, vx: 0, vy: 0 };
                this.keepInRoomBoss(tgt);
                e.hop = { t: 0, dur: 0.58, fx: e.x, fy: e.y, tx: tgt.x, ty: tgt.y };
                e.dir = tgt.x < e.x ? 'left' : 'right';
                break;
            }
            case 'treant': {
                // Rooted where it stands, so the fight is about the room
                // rather than about running away from something
                const rm = this.room;
                const homeX = rm.cols * 8, homeY = (rm.thick || 1) * 16 + 28;
                e.x += (homeX - e.x) * Math.min(1, dt * 2);
                e.y += (homeY - e.y) * Math.min(1, dt * 2);
                e.dir = h.x < e.x ? 'left' : 'right';
                if (e.windup > 0) {
                    e.windup -= dt;
                    if (e.windup <= 0) {
                        // Both arms come down and the whole floor answers
                        this.shake = 0.5;
                        const n = 14;
                        for (let i = 0; i < n; i++) {
                            const a = i / n * Math.PI * 2;
                            this.fireProjectile('acorn', e.x, e.y + 12, Math.cos(a) * 105, Math.sin(a) * 105, 'enemy', this.diff.dmg);
                        }
                    }
                    break;
                }
                e.shootT -= dt;
                if (e.shootT <= 0) {
                    e.shootT = 2 - (1 - e.hp / e.maxHp) * 0.7;
                    if (Math.random() < 0.45) { e.windup = 0.65; break; }
                    const a = Math.atan2(h.y - e.y, h.x - e.x);
                    for (const off of [-0.24, 0, 0.24]) {
                        this.fireProjectile('acorn', e.x, e.y + 12, Math.cos(a + off) * 90, Math.sin(a + off) * 90, 'enemy', this.diff.dmg);
                    }
                    if (def.minion && minions < 2 && Math.random() < 0.55) summon(def.minion, 1);
                }
                break;
            }
            case 'phantom': {
                e.phaseT += dt;
                const cyc = e.phaseT % 5;
                e.visible = cyc < 4.2;
                e.alpha = cyc < 3.8 ? 1 : cyc < 4.2 ? 1 - (cyc - 3.8) / 0.4 : (cyc - 4.2) / 0.8;
                if (cyc > 4.2 && !e.blinked) {
                    e.blinked = true;
                    const r = this.room;
                    e.x = 48 + Math.random() * (r.cols * 16 - 96);
                    e.y = 48 + Math.random() * (r.rows * 16 - 96);
                    if (def.minion) summon(def.minion, 2);
                }
                if (cyc < 1) e.blinked = false;
                const a = Math.atan2(h.y - e.y, h.x - e.x);
                e.x += Math.cos(a) * e.speed * dt;
                e.y += Math.sin(a) * e.speed * dt;
                e.dir = h.x < e.x ? 'left' : 'right';
                this.keepInRoomBoss(e);
                break;
            }
        }

        // The room has not sealed yet, so the hero is still in the doorway with
        // nowhere to go but forward. A boss parked on that doorway leaves them
        // nothing to walk into but a hit, and the knockback puts them back
        // through the door they came in by, which resets the room. Every boss
        // waits for the hero to get in; the Grand Ghost, the one that homes in
        // without ever pausing, is the one that always got there first.
        if (this.shutPending && this.enterAt) this.keepOffEntrance(e);
    }

    // Slide an entity out to the edge of the circle around the hero's way in,
    // then back inside the room walls
    keepOffEntrance(e) {
        const a = this.enterAt, r = this.room;
        const dx = e.x - a.x, dy = e.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= QUEST_ENTRANCE_CLEARANCE) return;
        // Sitting exactly on the hero: back off towards the middle of the room
        const ang = d > 0.01 ? Math.atan2(dy, dx) : Math.atan2(r.rows * 8 - a.y, r.cols * 8 - a.x);
        e.x = a.x + Math.cos(ang) * QUEST_ENTRANCE_CLEARANCE;
        e.y = a.y + Math.sin(ang) * QUEST_ENTRANCE_CLEARANCE;
        this.keepInRoomBoss(e);
    }

    keepInRoomBoss(e) {
        const r = this.room, t = r.thick || 1;
        e.x = Math.max(t * 16 + 14, Math.min((r.cols - t) * 16 - 14, e.x));
        e.y = Math.max(t * 16 + 14, Math.min((r.rows - t) * 16 - 12, e.y));
    }

    // -----------------------------------------------------------------------
    // Projectiles and pickups
    // -----------------------------------------------------------------------
    updateProjectiles(dt) {
        const h = this.hero, T = QuestWorld.T;
        for (const p of this.projectiles) {
            p.t += dt;
            p.spin += dt * 14;
            if (p.boomerang) {
                p.travel += Math.hypot(p.vx, p.vy) * dt;
                if (!p.returning && (p.travel > p.range)) p.returning = true;
                if (p.returning) {
                    const a = Math.atan2(h.y - p.y, h.x - p.x), s = 175;
                    p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
                    if (Math.hypot(h.x - p.x, h.y - p.y) < 8) { p.dead = true; continue; }
                }
                for (const pk of this.pickups) if (!pk.shop && !pk.grabbed && Math.hypot(pk.x - p.x, pk.y - p.y) < 9) pk.grabbed = true;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) { p.dead = true; continue; }
            if (p.type === 'bombLit') {
                p.vx = p.vy = 0;
                if (p.t > 1.1) { this.explode(p.x, p.y); p.dead = true; }
                continue;
            }
            const tx = Math.floor(p.x / 16), ty = Math.floor(p.y / 16);
            if (this.solidFor('proj', tx, ty) || tx < 0 || ty < 0 || tx >= this.room.cols || ty >= this.room.rows) {
                if (p.owner === 'hero' && this.tileAt(tx, ty) === T.BUSH) this.cutBush(tx, ty);
                if (p.boomerang && !p.returning) { p.returning = true; continue; }
                if (!p.boomerang) {
                    p.dead = true;
                    this.addEffect('spark', p.x, p.y, { life: 0.15 });
                    continue;
                }
            }
            if (p.owner === 'hero') {
                for (const e of this.enemies) {
                    if (!e.alive || e.spawning || !e.visible) continue;
                    if (this.overlap(p, e)) {
                        if (p.boomerang) {
                            if (!p.hitSet) p.hitSet = new Set();
                            if (p.hitSet.has(e)) continue;
                            p.hitSet.add(e);
                            if (p.stunOnly) { e.stun = 2; this.addEffect('spark', e.x, e.y, { life: 0.2 }); }
                            else this.damageEnemy(e, p.dmg, p.x - p.vx, p.y - p.vy);
                            p.returning = true;
                        } else {
                            this.damageEnemy(e, p.dmg, p.x - p.vx * 0.05, p.y - p.vy * 0.05);
                            p.dead = true;
                            break;
                        }
                    }
                }
            } else if (this.overlap(p, { x: h.x, y: h.y, w: 10, h: 10 })) {
                // A shield blocks anything coming at the hero's face
                const v = this.dirVec(h.dir);
                if (h.items.shield && !h.atk && (v[0] * p.vx + v[1] * p.vy) < 0) {
                    p.dead = true;
                    this.addEffect('spark', p.x, p.y, { life: 0.2 });
                    continue;
                }
                this.hurtHero(p.dmg, p.x - p.vx, p.y - p.vy);
                p.dead = true;
            }
        }
        this.projectiles = this.projectiles.filter(p => !p.dead);
    }

    explode(x, y) {
        this.addEffect('boom', x, y, { life: 0.45 });
        this.shake = 0.25;
        for (const e of this.enemies) if (e.alive && !e.spawning && Math.hypot(e.x - x, e.y - y) < 30) this.damageEnemy(e, 2, x, y);
        this.cutBushesInRadius(x, y, 24);
        const h = this.hero;
        if (Math.hypot(h.x - x, h.y - y) < 20) this.hurtHero(1, x, y);
    }

    updatePickups(dt) {
        const h = this.hero;
        for (const p of this.pickups) {
            p.t += dt;
            if (p.vz || p.z > 0) {
                p.vz -= 220 * dt;
                p.z += p.vz * dt;
                if (p.z <= 0) { p.z = 0; p.vz = Math.abs(p.vz) > 30 ? -p.vz * 0.4 : 0; }
            }
            if (p.type === 'fairy') {
                p.x = p.fx + Math.sin(p.t * 2.1) * 14;
                p.y = p.fy + Math.sin(p.t * 3.3) * 8 - 6;
            }
            if (p.grabbed) {
                const a = Math.atan2(h.y - p.y, h.x - p.x);
                p.x += Math.cos(a) * 160 * dt;
                p.y += Math.sin(a) * 160 * dt;
            }
            if (p.life !== null) {
                p.life -= dt;
                if (p.life <= 0) { p.dead = true; continue; }
            }
            if (p.type === 'fountain' || p.type === 'nap') {
                if (Math.abs(p.x - h.x) < 8 && Math.abs(p.y - h.y) < 8) this.collect(p);
                continue;
            }
            if (Math.abs(p.x - h.x) < 10 && Math.abs(p.y - h.y) < 11 && p.z < 6) this.collect(p);
        }
        this.pickups = this.pickups.filter(p => !p.dead);
    }

    collect(p) {
        const h = this.hero, D = QuestEngineData, QA = QuestArt, room = this.room;
        if (p.dead) return;
        if (p.shop) {
            if (h.money < p.price) return;
            h.money -= p.price;
            h.bought++;
        }
        const keep = () => { if (p.persist) room.collected[p.persist] = true; };
        p.dead = true;
        switch (p.type) {
            case 'heart':
                h.hp = Math.min(h.maxHp, h.hp + 2);
                this.stats.hearts++;
                if (p.shop) keep();
                this.addEffect('sparkle', p.x, p.y, { life: 0.3 });
                break;
            case 'money': case 'money5': {
                const n = p.amount || (p.type === 'money5' ? 5 : 1);
                h.money = Math.min(999, h.money + n);
                this.stats.money += n;
                keep();
                if (n >= 5) this.floatText('+' + n, p.x, p.y - 10, '#fce800');
                this.addEffect('sparkle', p.x, p.y, { life: 0.3 });
                if (p.persist) this.think('Ooh, ' + n + '!', 1.4);
                break;
            }
            case 'key':
                h.keys++;
                keep();
                this.floatText('KEY!', p.x, p.y - 10, '#fcc800');
                break;
            case 'bomb':
                h.bombs = Math.min(16, h.bombs + 2);
                break;
            case 'bombs':
                if (!h.items.bombs) { h.items.bombs = true; h.bombs = 8; this.itemGet('bombs', p); }
                else { h.bombs = Math.min(16, h.bombs + 4); this.floatText('+4 BOMBS', p.x, p.y - 10); }
                keep();
                break;
            case 'fairy':
                h.hp = Math.min(h.maxHp, h.hp + 6);
                for (let i = 0; i < 6; i++) this.addEffect('heart', h.x, h.y - 8, { life: 0.9, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 20 });
                break;
            case 'heartPiece':
                // Four pieces make a heart, the classic way
                keep();
                h.heartPieces = (h.heartPieces || 0) + 1;
                if (h.heartPieces >= 4 && h.maxHp < MAX_HEARTS * 2) {
                    h.heartPieces = 0;
                    h.maxHp += 2;
                    h.hp = h.maxHp;
                    this.itemGet('heartPiece', p, { name: 'PIECE OF HEART', desc: 'FOUR OF FOUR: A WHOLE NEW HEART!' });
                } else {
                    h.heartPieces = Math.min(h.heartPieces, 3);
                    h.hp = Math.min(h.maxHp, h.hp + 2);
                    this.itemGet('heartPiece', p, { name: 'PIECE OF HEART', desc: h.heartPieces + ' OF 4. KEEP LOOKING!' });
                }
                break;
            case 'heartContainer':
                keep();
                if (h.maxHp >= MAX_HEARTS * 2) {
                    h.hp = h.maxHp;
                    this.floatText('MAX HEARTS!', p.x, p.y - 10, '#f85878');
                    break;
                }
                h.maxHp += 2;
                h.hp = h.maxHp;
                this.itemGet(p.type, p);
                break;
            case 'potion':
                h.potion++;
                keep();
                this.itemGet('potion', p);
                break;
            case 'boomerang': case 'candle': case 'boots': case 'shield': case 'glove':
                h.items[p.type] = true;
                keep();
                this.itemGet(p.type, p);
                break;
            case 'cowbell':
                h.items.cowbell = true;
                h.trinkets.push('THE GOLDEN COWBELL');
                keep();
                this.itemGet('cowbell', p);
                break;
            case 'trinket': {
                const tr = QA.WORDS.trinkets[p.trinket || 0];
                h.trinkets.push(tr.name);
                keep();
                this.itemGet('trinket', p, { icon: tr.icon, name: tr.name, desc: tr.quip });
                break;
            }
            case 'chest': {
                keep();
                room.chestOpen = true;
                const item = p.contents === 'dungeonItem' ? this.nextUpgrade() : p.contents;
                this.addEffect('chestOpen', p.x, p.y, { life: 99, keep: false });
                const fake = { x: p.x, y: p.y, type: item };
                this.collect({ ...fake, dead: false, persist: null });
                break;
            }
            case 'shard': {
                const d = this.world.dungeons[room.dungeon];
                d.shardTaken = true;
                d.completed = true;
                h.shards++;
                keep();
                const art = QA.WORDS.artifacts[h.def.currency] || 'Shards of Destiny';
                this.itemGet('shard', p, { icon: 'shard', name: 'PIECE ' + h.shards + ' OF ' + this.world.totalShards + '!', desc: art.toUpperCase(), after: () => this.leaveDungeon() });
                break;
            }
            case 'fountain':
                if (h.healed) { p.dead = false; return; }
                h.healed = true;
                p.dead = false;
                this.mode = 'event';
                this.event = { kind: 'fountain', t: 0 };
                break;
            case 'nap':
                if (h.napped) { p.dead = false; return; }
                h.napped = true;
                p.dead = false;
                this.mode = 'event';
                this.event = { kind: 'nap', t: 0 };
                this.stats.naps++;
                if (h.def.lives) this.say(QA.WORDS.boxLines[Math.floor(Math.random() * 2)], { quick: true, resume: 'event' });
                break;
        }
    }

    nextUpgrade() {
        const h = this.hero;
        for (const u of QuestEngineData.UPGRADE_ORDER) if (!h.items[u]) return u;
        return 'heartPiece';
    }

    itemGet(type, p, extra = {}) {
        const info = QuestEngineData.ITEM_INFO[type] || {};
        this.mode = 'itemget';
        this.hero.atk = null;
        this.hero.path = [];
        this.itemget = {
            t: 0, dur: 2.8,
            icon: extra.icon || info.icon || type,
            name: extra.name || info.name || type.toUpperCase(),
            desc: extra.desc !== undefined ? extra.desc : info.desc,
            after: extra.after
        };
        for (let i = 0; i < 8; i++) this.addEffect('sparkle', this.hero.x + (Math.random() - 0.5) * 20, this.hero.y - 20 + (Math.random() - 0.5) * 10, { life: 0.6 + Math.random() * 0.6 });
    }

    updateItemGet(dt) {
        const ig = this.itemget;
        ig.t += dt;
        this.hero.state = 'hold';
        if (ig.t >= ig.dur) {
            this.mode = 'play';
            this.hero.state = 'idle';
            this.hero.thinkT = 0;
            if (ig.after) ig.after();
            else if (this.rng() < 0.6) this.think(QuestArt.WORDS.thoughts.treasure[Math.floor(Math.random() * 3)], 1.4);
        }
    }

    // -----------------------------------------------------------------------
    // Doors, shutters and keys
    // -----------------------------------------------------------------------
    tryUnlock(cell) {
        const h = this.hero, room = this.room;
        if (h.keys <= 0 || room.dungeon === undefined) return false;
        for (const dk of Object.keys(room.doorCells || {})) {
            if (!room.doorCells[dk].includes(cell)) continue;
            const door = room.doors[dk];
            const e = this.world.dungeons[room.dungeon].edges.get(door.edge);
            if (!e || e.unlocked) return false;
            e.unlocked = true;
            h.keys--;
            for (const i of room.doorCells[dk]) room.tiles[i] = QuestWorld.T.DOOR;
            this.addEffect('poof', (cell % room.cols) * 16 + 8, ((cell / room.cols) | 0) * 16 + 8, { life: 0.4 });
            this.floatText('CLICK!', h.x, h.y - 18, '#fcc800');
            this.renderRoom();
            h.thinkT = 0;
            return true;
        }
        return false;
    }

    updateShutters() {
        const room = this.room, h = this.hero, T = QuestWorld.T;
        if (!room.doorCells) return;
        const alive = this.enemies.some(e => e.alive);
        // Shut once the hero is properly inside
        if (this.shutPending && alive) {
            const t = room.thick || 1;
            const cx = Math.floor(h.x / 16), cy = Math.floor(h.y / 16);
            if (cx > t && cy > t && cx < room.cols - t - 1 && cy < room.rows - t - 1) {
                this.shutPending = false;
                this.roomShut = true;
                for (const dk of Object.keys(room.doorCells)) {
                    if (room.doors[dk].outside && room.kind !== 'boss') continue;
                    for (const i of room.doorCells[dk]) if (room.tiles[i] === T.DOOR) room.tiles[i] = T.SHUT;
                }
                this.renderRoom();
            }
        }
        if (!alive && (this.roomShut || this.shutPending)) {
            this.shutPending = false;
            if (this.roomShut) {
                this.roomShut = false;
                for (const dk of Object.keys(room.doorCells)) for (const i of room.doorCells[dk]) if (room.tiles[i] === T.SHUT) room.tiles[i] = T.DOOR;
                this.renderRoom();
            }
        }
        // Clearing a room: remember it, and drop any keys it was holding
        if (!alive && !room.clearFlag && room.spawns.length && this.mode === 'play') {
            room.clearFlag = true;
            if (room.dungeon !== undefined) room.cleared = true;
            else room.clearedAt = this.time;
            for (const it of room.items) {
                if (it.onClear && !room.collected[it.id] && !this.pickups.some(p => p.persist === it.id)) {
                    this.addPickup(it.type, it.x * 16 + 8, it.y * 16 + 8, { persist: it.id });
                    this.addEffect('sparkle', it.x * 16 + 8, it.y * 16 + 8, { life: 0.6 });
                }
            }
        }
        if (alive) room.clearFlag = false;
    }

    // -----------------------------------------------------------------------
    // Leaving rooms
    // -----------------------------------------------------------------------
    checkExits() {
        const h = this.hero, r = this.room;
        if (this.mode !== 'play') return;
        const RW = r.cols * 16, RH = r.rows * 16;
        let d = null;
        if (h.x < 3) d = 'w';
        else if (h.x > RW - 3) d = 'e';
        else if (h.y < 3) d = 'n';
        else if (h.y > RH - 3) d = 's';
        if (!d) return;
        // A room that is sealing has not sealed yet. Being knocked back out
        // through the door would reset it -- boss at full health, shutters
        // open, the whole thing again -- so the hero holds their ground until
        // the doors are shut. Walking out under their own steam still works.
        if (this.shutPending && h.knock) {
            h.knock = null;
            h.x = Math.max(8, Math.min(RW - 8, h.x));
            h.y = Math.max(8, Math.min(RH - 8, h.y));
            h.exitDir = null;
            return;
        }
        if (r.outside === d) { this.leaveInterior(); return; }
        const D = QuestWorld.DIRS[d];
        const nx = r.rx + D.dx, ny = r.ry + D.dy;
        const next = this.area.rooms[ny] && this.area.rooms[ny][nx];
        if (!next) {
            // Nothing there: step back in
            h.x = Math.max(8, Math.min(RW - 8, h.x));
            h.y = Math.max(8, Math.min(RH - 8, h.y));
            h.exitDir = null;
            return;
        }
        if (this.config.transition === 'scroll') this.startScroll(d, next);
        else {
            const pos = this.wrapPosition(d, h.x, h.y);
            this.startWarp({ room: next, x: pos.x, y: pos.y, dir: h.dir }, this.config.transition);
        }
    }

    wrapPosition(d, x, y) {
        const r = this.room, RW = r.cols * 16, RH = r.rows * 16;
        if (d === 'e') return { x: 6, y };
        if (d === 'w') return { x: RW - 6, y };
        if (d === 's') return { x, y: 6 };
        return { x, y: RH - 6 };
    }

    startScroll(d, next) {
        const h = this.hero;
        this.buildLive(next);
        const pos = this.wrapPosition(d, h.x, h.y);
        this.scroll = {
            d, t: 0, dur: 0.7, next,
            fromCanvas: this.roomCanvas, toCanvas: this.paintRoom(next, null),
            hx0: h.x, hy0: h.y, hx1: pos.x, hy1: pos.y
        };
        this.roomCanvas = null;
        this.mode = 'scroll';
    }

    updateScroll(dt) {
        const s = this.scroll, h = this.hero;
        s.t += dt;
        h.walkT += dt;
        h.moving = true;
        if (s.t >= s.dur) {
            h.x = s.hx1; h.y = s.hy1;
            this.roomCanvas = s.toCanvas;
            this.mode = 'play';
            this.scroll = null;
            this.enterRoom(s.next, { via: 'scroll', dir: s.d });
            // Take one more step in so the edge doesn't send us straight back
            h.exitDir = null;
            const D = QuestWorld.DIRS[s.d];
            const cell = this.cellOf(h.x + D.dx * 16, h.y + D.dy * 16);
            h.path = [cell];
        }
    }

    startWarp(dest, style = 'iris') {
        this.warp = { t: 0, dur: 0.45, phase: 'out', dest, style: style === 'scroll' ? 'iris' : style };
        this.mode = 'warp';
        this.hero.path = [];
        this.hero.exitDir = null;
    }

    updateWarp(dt) {
        const w = this.warp, h = this.hero;
        w.t += dt;
        if (w.phase === 'out' && w.t >= w.dur) {
            const d = w.dest;
            h.x = d.x; h.y = d.y;
            if (d.dir) h.dir = d.dir;
            h.portalCd = 0.8;
            this.enterRoom(d.room, { via: 'warp' });
            if (d.after) d.after();
            w.phase = 'in';
            w.t = 0;
            // enterRoom may have opened a dialog; let it wait for the iris
            if (this.mode === 'dialog') { this.dialog.waitWarp = true; }
            this.mode = this.mode === 'dialog' ? 'dialog' : 'warp';
        } else if (w.phase === 'in' && w.t >= w.dur) {
            this.warp = null;
            if (this.mode === 'warp') this.mode = 'play';
            if (this.dialog) this.dialog.waitWarp = false;
        }
    }

    enterPortal(tx, ty) {
        const T = QuestWorld.T, W = this.world, room = this.room, h = this.hero;
        const p = room.portals.find(p => p.x === tx && p.y === ty);
        if (!p) return;
        h.portalCd = 1;
        if (p.kind === 'tunnel') {
            const tn = W.tunnels[p.tunnel];
            tn.used = true;
            const other = p.end === 0 ? tn.b : tn.a;
            const dest = W.overworld.rooms[other.ry][other.rx];
            this.think(QuestArt.WORDS.thoughts.tunnel[Math.floor(Math.random() * 3)], 1.2);
            this.addEffect('spin', h.x, h.y, { life: 0.4 });
            this.startWarp({ room: dest, x: other.portal.x * 16 + 8, y: (other.portal.y + 1) * 16 + 8, dir: 'down' }, 'spiral');
            return;
        }
        if (p.kind === 'cowexit') { this.leaveInterior(); return; }
        const area = W.areas[p.area];
        if (area.kind === 'cowlevel') {
            const ent = area.rooms.flat().find(r => r.kind === 'cowentrance');
            const back = ent.portals.find(q => q.kind === 'cowexit');
            this.think('Moo...?', 1.4);
            this.startWarp({ room: ent, x: back.x * 16 + 8, y: (back.y + 1) * 16 + 8, dir: 'down' }, 'spiral');
            return;
        }
        const dest = area.kind === 'dungeon' ? area.rooms.flat().find(r => r && r.kind === 'entrance') : area.rooms[0][0];
        const cx = Math.floor(dest.cols / 2);
        this.startWarp({ room: dest, x: cx * 16, y: (dest.rows - 2) * 16 + 8, dir: 'up' }, this.config.transition === 'fade' ? 'fade' : 'iris');
    }

    leaveInterior() {
        const p = this.area.parent, W = this.world;
        this.area.leftAt = this.time;
        const dest = W.areas[p.area].rooms[p.ry][p.rx];
        this.startWarp({ room: dest, x: p.x * 16 + 8, y: p.y * 16 + 8, dir: 'down' }, this.config.transition === 'fade' ? 'fade' : 'iris');
    }

    leaveDungeon() {
        this.think('Victory!', 1.6);
        this.leaveInterior();
    }

    // -----------------------------------------------------------------------
    // The autopilot
    // -----------------------------------------------------------------------
    heroAI(dt) {
        const h = this.hero;
        if (h.atk || h.knock || h.state === 'sleep') return;
        if (h.guided > 0 && h.path.length) return;
        h.thinkT -= dt;

        const enemies = this.enemies.filter(e => e.alive && !e.spawning && e.visible !== false);
        const fight = this.shouldFight(enemies);

        // Swing whenever something is in reach
        if (fight.length && h.atkCd <= 0) {
            const a = this.findAttack(fight);
            if (a) { this.heroAttack(a.dir); h.align = null; return; }
            if (this.trySecondary(fight)) return;
        }
        if (this.dodge()) return;

        if (h.thinkT <= 0 || (!h.path.length && !h.exitDir && !h.align) || (h.fleeT > 0 && !h.path.length)) {
            h.thinkT = 0.22 + Math.random() * 0.08;
            this.plan(fight);
        }

        // Idle chatter
        if (h.thoughtCd <= 0 && Math.random() < dt * 0.04) this.quip();
    }

    shouldFight(enemies) {
        const h = this.hero;
        if (!enemies.length) return [];
        if (this.diff.dmg === 0 && !this.roomShut && this.room.kind !== 'boss') return [];
        // Dungeon rooms get cleared properly: that's where the keys come from
        const must = this.roomShut || this.room.kind === 'boss' || this.room.shutter || this.area.kind === 'dungeon';
        const low = h.hp <= 2 && h.maxHp > 4;
        return enemies.filter(e => {
            const d = Math.hypot(e.x - h.x, e.y - h.y);
            if (must) return true;
            if (low) return d < 28;
            // Keys hide in rooms that need clearing
            if (this.room.items.some(it => it.onClear && !this.room.collected[it.id])) return true;
            return d < 72 || e.boss;
        });
    }

    findAttack(enemies) {
        const h = this.hero, wp = h.weapon;
        for (const e of enemies) {
            const dx = e.x - h.x, dy = e.y - h.y;
            switch (wp.kind) {
                case 'melee':
                    for (const d of ['up', 'down', 'left', 'right']) {
                        if (this.overlap(this.meleeBox(h, d, wp.reach, wp.width), e)) return { dir: d };
                    }
                    break;
                case 'wave':
                    if (Math.hypot(dx, dy) < wp.radius - 2 + e.w / 2) return { dir: this.dirToward(dx, dy) };
                    break;
                default: {
                    const tol = e.boss ? 10 : 5;
                    const range = wp.kind === 'tongue' ? wp.reach + 6 : (wp.range || 200);
                    if (Math.abs(dy) < tol && Math.abs(dx) < range && Math.abs(dx) > 4 && this.lineClear(h.x, h.y, e.x, e.y)) return { dir: dx > 0 ? 'right' : 'left' };
                    if (Math.abs(dx) < tol && Math.abs(dy) < range && Math.abs(dy) > 4 && this.lineClear(h.x, h.y, e.x, e.y)) return { dir: dy > 0 ? 'down' : 'up' };
                }
            }
        }
        return null;
    }

    // Boomerang to stun, bombs for crowds and bosses
    trySecondary(enemies) {
        const h = this.hero;
        if (h.items.bombs && h.bombs > 0 && h.bombCd <= 0) {
            const close = enemies.filter(e => Math.hypot(e.x - h.x, e.y - h.y) < 30);
            if ((close.length >= 2 || close.some(e => e.boss)) && this.dropBomb()) {
                h.fleeT = 1.2;
                h.path = [];
                h.thinkT = 0;
                return true;
            }
        }
        if (h.items.boomerang && h.weapon.kind === 'melee' && !this.projectiles.some(p => p.stunOnly)) {
            for (const e of enemies) {
                const dx = e.x - h.x, dy = e.y - h.y, dist = Math.hypot(dx, dy);
                if (dist < 36 || dist > 90 || e.boss) continue;
                if ((Math.abs(dy) < 6 || Math.abs(dx) < 6) && this.lineClear(h.x, h.y, e.x, e.y)) {
                    const d = this.dirToward(dx, dy), v = this.dirVec(d);
                    h.dir = d;
                    h.atk = { t: 0, dur: 0.18, dir: d, hit: new Set(), dmg: 0, kind: 'cast' };
                    h.atkCd = 0.3;
                    const p = this.fireProjectile('boomerangItem', h.x + v[0] * 8, h.y + v[1] * 8, v[0] * 160, v[1] * 160, 'hero', 0);
                    p.boomerang = true; p.range = 90; p.travel = 0; p.stunOnly = true;
                    return true;
                }
            }
        }
        return false;
    }

    // Sidestep a projectile that's about to land
    dodge() {
        const h = this.hero;
        for (const p of this.projectiles) {
            if (p.owner !== 'enemy') continue;
            const dx = h.x - p.x, dy = h.y - p.y;
            const sp = Math.hypot(p.vx, p.vy) || 1;
            const along = (dx * p.vx + dy * p.vy) / sp;
            if (along < 0 || along > 40) continue;
            const perp = Math.abs(dx * p.vy - dy * p.vx) / sp;
            if (perp > 9) continue;
            // Shields just take it
            const v = this.dirVec(h.dir);
            if (h.items.shield && (v[0] * p.vx + v[1] * p.vy) < 0) continue;
            if (Math.random() < (this.room.kind === 'boss' ? 0.08 : 0.25)) continue;      // nobody's perfect
            const W = this.room.cols, cell = this.cellOf(h.x, h.y);
            const opts = Math.abs(p.vx) > Math.abs(p.vy) ? [cell - W, cell + W] : [cell - 1, cell + 1];
            for (const c of opts.sort(() => Math.random() - 0.5)) {
                if (c >= 0 && c < this.room.tiles.length && QuestWorld.OPEN[this.room.tiles[c]]) {
                    h.path = [c];
                    h.thinkT = 0.35;
                    return true;
                }
            }
        }
        return false;
    }

    plan(fight) {
        const h = this.hero, room = this.room;
        h.align = null;
        const from = this.cellOf(h.x, h.y);

        // Backing off: from our own bomb, or after taking a hit
        if (h.fleeT > 0) {
            h.fleeT -= 0.25;
            const goals = new Set(this.reachableCells(from).filter(i => {
                const x = (i % room.cols) * 16 + 8, y = ((i / room.cols) | 0) * 16 + 8;
                return this.projectiles.every(p => p.type !== 'bombLit' || Math.hypot(p.x - x, p.y - y) > 40)
                    && this.enemies.every(e => !e.alive || Math.hypot(e.x - x, e.y - y) > (e.boss ? 48 : 34));
            }));
            const path = this.findPath(from, goals, 12);
            if (path) { h.path = path; h.exitDir = null; return; }
        }

        // Fight
        if (fight.length) {
            let best = null, bd = Infinity;
            for (const e of fight) {
                const d = Math.hypot(e.x - h.x, e.y - h.y);
                if (d < bd) { bd = d; best = e; }
            }
            const goals = this.attackCells(best);
            if (goals.has(from)) {
                // In position: line up exactly on the enemy's axis
                const wp = h.weapon;
                if (wp.kind !== 'melee' && wp.kind !== 'wave') {
                    const dx = Math.abs(best.x - h.x), dy = Math.abs(best.y - h.y);
                    h.align = dx < dy ? { axis: 'x', v: best.x } : { axis: 'y', v: best.y };
                } else {
                    h.align = Math.abs(best.x - h.x) < Math.abs(best.y - h.y) ? { axis: 'x', v: best.x } : { axis: 'y', v: best.y };
                }
                h.path = [];
                h.exitDir = null;
                return;
            }
            const path = this.findPath(from, goals);
            if (path) { h.path = path.slice(0, 3); h.exitDir = null; return; }
        }

        // Monsters still puffing into existence: hold position rather than
        // wander out of a room that's about to need clearing
        if (this.area.kind === 'dungeon' && this.enemies.some(e => e.alive && e.spawning)) {
            h.path = [];
            h.exitDir = null;
            return;
        }

        // Pickups worth a detour
        const want = this.pickups.filter(p => {
            if (p.type === 'fountain' || p.type === 'nap') return false;
            if (p.shop) return false;
            if (p.type === 'heart' && h.hp >= h.maxHp) return false;
            if (p.type === 'fairy' && h.hp >= h.maxHp) return false;
            return Math.hypot(p.x - h.x, p.y - h.y) < 110 || p.persist;
        });
        if (want.length) {
            const goals = new Set(want.map(p => this.cellOf(p.x, p.y)));
            const path = this.findPath(from, goals, 30);
            if (path) {
                h.path = path;
                h.exitDir = null;
                if (!path.length) {
                    // Standing on it but not quite touching: step onto its centre
                    const p = want[0];
                    h.align = Math.abs(p.x - h.x) > Math.abs(p.y - h.y) ? { axis: 'x', v: p.x } : { axis: 'y', v: p.y };
                }
                return;
            }
        }

        // The room's purpose
        const obj = this.roomObjective();
        if (!obj) return;
        if (obj.dir && obj.cells.some(c => c === from)) {
            h.path = [];
            h.exitDir = obj.dir;
            return;
        }
        const path = this.findPath(from, new Set(obj.cells));
        if (path) {
            h.path = path;
            h.exitDir = null;
            h.goalNote = obj.note;
            // findPath hands back an empty path when the hero is already on
            // the goal cell. Read as "nothing left to do" that leaves them
            // with no path, no exit and nothing to walk at, standing on the
            // very cell they came for -- and a cell is sixteen pixels wide,
            // so being on it is not the same as touching what sits on it.
            if (!path.length) {
                const c = obj.cells[0];
                const p = this.pickups.find(q => this.cellOf(q.x, q.y) === c);
                const tx = p ? p.x : (c % room.cols) * 16 + 8;
                const ty = p ? p.y : ((c / room.cols) | 0) * 16 + 8;
                h.align = Math.abs(tx - h.x) > Math.abs(ty - h.y) ? { axis: 'x', v: tx } : { axis: 'y', v: ty };
            }
        } else if (obj.dir) {
            // Can't reach that exit (a lake in the way?) -- try another. Only
            // the overworld keeps a route plan to redo; everywhere else the
            // objective is worked out afresh each tick and will now skip this.
            this.blockedExits = this.blockedExits || new Set();
            this.blockedExits.add(room.rx + ',' + room.ry + ',' + obj.dir);
            this.planOverworld();
            h.thinkT = 0;
        }
    }

    attackCells(e) {
        const h = this.hero, wp = h.weapon, room = this.room, W = room.cols;
        const ex = Math.floor(e.x / 16), ey = Math.floor(e.y / 16);
        const goals = new Set();
        const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < room.rows && (QuestWorld.OPEN[room.tiles[y * W + x]] || (room.tiles[y * W + x] === QuestWorld.T.WATER && h.def.swim));
        if (wp.kind === 'melee' || wp.kind === 'wave') {
            // Any nearby cell from whose centre a swing (or shout) would land
            const R = e.boss ? 3 : 2;
            for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
                const x = ex + dx, y = ey + dy;
                if ((!dx && !dy) || !ok(x, y)) continue;
                const probe = { x: x * 16 + 8, y: y * 16 + 8 };
                if (this.shieldBlocks(e, probe.x, probe.y)) continue;
                let hits = false;
                if (wp.kind === 'wave') hits = Math.hypot(e.x - probe.x, e.y - probe.y) < wp.radius - 4 + e.w / 2;
                else for (const d of ['up', 'down', 'left', 'right']) if (this.overlap(this.meleeBox(probe, d, wp.reach, wp.width), e)) { hits = true; break; }
                if (hits) goals.add(y * W + x);
            }
            if (!goals.size) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ok(ex + dx, ey + dy)) goals.add((ey + dy) * W + ex + dx);
        } else {
            const range = Math.floor((wp.kind === 'tongue' ? wp.reach : Math.min(wp.range || 160, 120)) / 16);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                for (let s = 1; s <= range; s++) {
                    const x = ex + dx * s, y = ey + dy * s;
                    if (x < 0 || y < 0 || x >= W || y >= room.rows) break;
                    if (this.solidFor('proj', x, y)) break;
                    if (s >= 2 && ok(x, y)) goals.add(y * W + x);
                }
            }
            if (!goals.size) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ok(ex + dx, ey + dy)) goals.add((ey + dy) * W + ex + dx);
        }
        return goals;
    }

    // Pickups the hero can actually walk to. A persistent one -- a dropped
    // shard, a gift, the Golden Cowbell -- can end up on a cell the room walls
    // off, and an objective pointing at something unreachable is one the hero
    // can never finish: it carries no exit direction to give up on, so the
    // planner hands back the same impossible answer every tick and the hero
    // stands there until the watchdog comes for it.
    reachablePickups(list) {
        if (!list.length) return list;
        const ok = new Set(this.reachableCells(this.cellOf(this.hero.x, this.hero.y)));
        return list.filter(p => ok.has(this.cellOf(p.x, p.y)));
    }

    // What this room wants from us: a list of cells and, for exits, a direction
    roomObjective() {
        const kind = this.area.kind;
        if (kind === 'cave') return this.caveObjective();
        if (kind === 'dungeon') return this.dungeonObjective();
        if (kind === 'cowlevel') return this.cowObjective();
        return this.overworldObjective();
    }

    exitObjective(d) {
        const room = this.room, T = QuestWorld.T;
        // A locked door: walk up to its innermost tile, which opens on contact
        if (room.doorCells && room.doorCells[d] && room.doorCells[d].some(c => room.tiles[c] === T.LOCK)) {
            const W = room.cols, t = room.thick || 1;
            const inner = room.doorCells[d].filter(c => {
                const x = c % W, y = (c / W) | 0;
                return d === 'n' ? y === t - 1 : d === 's' ? y === room.rows - t : d === 'w' ? x === t - 1 : x === W - t;
            });
            return { cells: inner, note: 'unlock ' + d };
        }
        const cells = QuestWorld.exitCells(room, d).filter(c => QuestWorld.OPEN[room.tiles[c]]);
        if (!cells.length) return null;
        return { cells, dir: d, note: 'exit ' + d };
    }

    caveObjective() {
        const h = this.hero, room = this.room;
        const items = this.reachablePickups(this.pickups.filter(p => p.persist || p.type === 'fountain' || p.type === 'nap'));
        let target = null;
        if (room.caveType === 'shop') {
            const affordable = items.filter(p => p.shop && h.money >= p.price && h.bought < 2 && this.wantsShopItem(p));
            affordable.sort((a, b) => this.shopValue(b) - this.shopValue(a));
            target = affordable[0];
            if (!target && h.roomT < 1.5) return { cells: [this.cellOf(h.x, h.y - 16)], note: 'browse' };
            if (!target && h.money < 10 && h.thoughtCd <= 0 && h.roomT < 4) this.think('Too pricey!', 1.4);
        } else if (room.caveType === 'fountain') {
            target = h.hp < h.maxHp && !h.healed ? items.find(p => p.type === 'fountain') : null;
        } else if (room.caveType === 'nap') {
            target = !h.napped ? items.find(p => p.type === 'nap') : null;
        } else {
            target = items.find(p => !p.shop);
        }
        if (target) return { cells: [this.cellOf(target.x, target.y)], note: 'item' };
        return this.exitObjective('s');
    }

    wantsShopItem(p) {
        const h = this.hero;
        if (p.type === 'heart') return h.hp < h.maxHp - 1;
        if (p.type === 'shield') return !h.items.shield;
        if (p.type === 'heartContainer') return h.maxHp < MAX_HEARTS * 2;
        if (p.type === 'potion') return h.potion < 1;
        if (p.type === 'bombs') return true;
        return true;
    }

    shopValue(p) {
        return { heartContainer: 10, shield: 8, potion: 7, bombs: 5, heart: 4, trinket: 1 }[p.type] || 0;
    }

    dungeonObjective() {
        const h = this.hero, room = this.room, D = this.world.dungeons[room.dungeon];
        // Anything to pick up first (chest, key, shard)
        const items = this.reachablePickups(this.pickups.filter(p => p.persist));
        if (items.length) return { cells: items.map(p => this.cellOf(p.x, p.y)), note: 'loot' };
        if (D.completed || this.dungeonDeferred(D)) {
            if (room.kind === 'entrance') return this.exitObjective('s');
            return this.dungeonStep(D, (r) => r.kind === 'entrance');
        }
        // Unvisited rooms first, then the boss
        const step = this.dungeonStep(D, (r) => !r.visited) || this.dungeonStep(D, (r) => r.kind === 'boss' && !r.bossDefeated);
        if (step) return step;
        // Every reachable room seen and still no way on: a key must have been
        // lost somewhere. One turns up under the rug, as keys do.
        if (!this.enemies.some(e => e.alive) && this.time - (D.rugT || -99) > 20) {
            D.rugT = this.time;
            const W = room.cols;
            const cell = this.nearestOpenCell(Math.floor(W / 2), Math.floor(room.rows / 2));
            this.addPickup('key', (cell % W) * 16 + 8, ((cell / W) | 0) * 16 + 8, { persist: 'rug' + Math.floor(this.time) });
            this.think('A key under the rug!', 1.8);
            return null;
        }
        return room.kind === 'entrance' ? this.exitObjective('s') : this.dungeonStep(D, (r) => r.kind === 'entrance');
    }

    // The cow level: see every field, beat the king, take the portal home
    cowObjective() {
        const room = this.room, area = this.area;
        const items = this.reachablePickups(this.pickups.filter(p => p.persist));
        if (items.length) return { cells: items.map(p => this.cellOf(p.x, p.y)), note: 'loot' };
        if (!area.kingDefeated) {
            const step = this.areaStep((r) => !r.visited) || this.areaStep((r) => r.kind === 'boss');
            if (step) return step;
        }
        if (room.kind === 'cowentrance') {
            const p = room.portals.find(p => p.kind === 'cowexit');
            return { cells: [p.y * room.cols + p.x], note: 'portal' };
        }
        return this.areaStep((r) => r.kind === 'cowentrance');
    }

    // BFS over an area's rooms through their edge openings
    areaStep(goal) {
        const area = this.area, start = this.room;
        const key = (r) => r.rx + ',' + r.ry;
        const prev = new Map([[key(start), null]]);
        const q = [start];
        let found = null;
        while (q.length) {
            const r = q.shift();
            if (r !== start && goal(r)) { found = r; break; }
            for (const d of QuestWorld.DIR_KEYS) {
                if (!r.exits[d]) continue;
                // An opening already found unreachable -- a lake in the way,
                // say -- is no use as a route. The overworld planner skips
                // these; without the same check here the only answer this can
                // give is the one that did not work last time, over and over.
                if (this.blockedExits && this.blockedExits.has(r.rx + ',' + r.ry + ',' + d)) continue;
                const V = QuestWorld.DIRS[d];
                const nb = area.rooms[r.ry + V.dy] && area.rooms[r.ry + V.dy][r.rx + V.dx];
                if (!nb || prev.has(key(nb))) continue;
                prev.set(key(nb), { room: r, dir: d });
                q.push(nb);
            }
        }
        if (!found) {
            // Nowhere to go, but only because of what was ruled out: forget it
            // and look again, in case the way through has since opened
            if (this.blockedExits && this.blockedExits.size) { this.blockedExits = null; return this.areaStep(goal); }
            return null;
        }
        let step = prev.get(key(found)), cur = found;
        while (step && step.room !== start) { cur = step.room; step = prev.get(key(cur)); }
        return step ? this.exitObjective(step.dir) : null;
    }

    // A dungeon that keeps winning waits until the hero has explored a bit
    // more, found another heart, or run out of other things to do
    dungeonDeferred(D) {
        if (!D.deferRooms) return false;
        const h = this.hero;
        if (this.stats.rooms >= D.deferRooms || h.maxHp > D.deferHp || this.time - D.deferT > 240) { D.deferRooms = 0; return false; }
        if (this.world.overworld.rooms.flat().every(r => r.visited)) { D.deferRooms = 0; return false; }
        return true;
    }

    // BFS across the dungeon to the nearest room matching `goal`
    dungeonStep(D, goal) {
        const h = this.hero, area = this.area, start = this.room;
        const key = (r) => r.rx + ',' + r.ry;
        const prev = new Map([[key(start), null]]);
        const q = [start];
        let found = null;
        while (q.length) {
            const r = q.shift();
            if (r !== start && goal(r)) { found = r; break; }
            for (const d of Object.keys(r.doors || {})) {
                const door = r.doors[d];
                if (!door.edge) continue;
                const e = D.edges.get(door.edge);
                if (e.type === 'lock' && !e.unlocked && h.keys <= 0) continue;
                const V = QuestWorld.DIRS[d];
                const nb = area.rooms[r.ry + V.dy] && area.rooms[r.ry + V.dy][r.rx + V.dx];
                if (!nb || prev.has(key(nb))) continue;
                prev.set(key(nb), { room: r, dir: d });
                q.push(nb);
            }
        }
        if (!found) return null;
        let step = prev.get(key(found));
        let cur = found;
        while (step && step.room !== start) { cur = step.room; step = prev.get(key(cur)); }
        if (!step) return null;
        return this.exitObjective(step.dir);
    }

    // Choose where in the overworld to go next; called on entering a room
    planOverworld() {
        if (!this.world || this.area.kind !== 'overworld') return;
        const h = this.hero, W = this.world, over = W.overworld, room = this.room;
        this.owGoal = null;
        // Victory lap: all pieces found, head home to the pedestal
        // Victory lap: all pieces found, head home to the pedestal -- unless
        // there's a secret cow level still out there to find
        const cowPending = W.areas.some(a => a.kind === 'cowlevel' && !a.kingDefeated);
        if (W.totalShards > 0 && h.shards >= W.totalShards && !cowPending) { this.owGoal = { kind: 'home' }; return; }

        const portalWanted = (p) => {
            const area = p.area !== undefined ? W.areas[p.area] : null;
            if (p.kind === 'dungeon') return !W.dungeons[p.dungeon].completed && !this.dungeonDeferred(W.dungeons[p.dungeon]);
            if (p.kind === 'tunnel') return !W.tunnels[p.tunnel].used;
            if (p.kind === 'cowlevel') return !area.kingDefeated;
            if (p.kind === 'house') return !area.visited;
            if (p.kind === 'cave') {
                if (!area.visited) return true;
                const hurt = h.hp < h.maxHp * 0.6;
                if (hurt && (p.caveType === 'fountain' || p.caveType === 'nap')) return true;
                const shopRoom = area.rooms[0][0];
                if (p.caveType === 'shop' && h.money >= 40 && this.time - (area.leftAt || -999) > 120
                    && shopRoom.items.some(it => !shopRoom.collected[it.id] && it.price <= h.money && this.wantsShopItem(it))) return true;
                return false;
            }
            return false;
        };
        // Dungeons can wait if we're badly hurt and know somewhere to heal
        const lowAndKnowsHeal = h.hp < h.maxHp * 0.5 && over.rooms.flat().some(r => r.visited && r.portals.some(p => p.kind === 'cave' && (p.caveType === 'fountain' || p.caveType === 'nap')));

        // BFS from here across known exits
        const key = (r) => r.rx + ',' + r.ry;
        const prev = new Map([[key(room), null]]);
        const q = [room];
        const dist = new Map([[key(room), 0]]);
        let goal = null;
        while (q.length) {
            const r = q.shift();
            const dd = dist.get(key(r));
            if (!r.visited) { goal = { room: r, kind: 'explore' }; break; }
            const wanted = r.portals.find(p => portalWanted(p) && !(p.kind === 'dungeon' && lowAndKnowsHeal));
            if (wanted) { goal = { room: r, kind: 'portal', portal: wanted }; break; }
            if (lowAndKnowsHeal) {
                const heal = r.portals.find(p => p.kind === 'cave' && (p.caveType === 'fountain' || p.caveType === 'nap'));
                if (heal) { goal = { room: r, kind: 'portal', portal: heal }; break; }
            }
            for (const d of QuestWorld.DIR_KEYS) {
                if (!r.exits[d]) continue;
                if (this.blockedExits && this.blockedExits.has(r.rx + ',' + r.ry + ',' + d)) continue;
                const V = QuestWorld.DIRS[d];
                const nb = over.rooms[r.ry + V.dy] && over.rooms[r.ry + V.dy][r.rx + V.dx];
                if (!nb || prev.has(key(nb))) continue;
                prev.set(key(nb), { room: r, dir: d });
                dist.set(key(nb), dd + 1);
                q.push(nb);
            }
        }
        if (!goal) {
            // Everything explored and done
            if (this.blockedExits && this.blockedExits.size) { this.blockedExits = null; return this.planOverworld(); }
            this.owGoal = { kind: 'home' };
            return;
        }
        if (goal.room === room) { this.owGoal = goal; return; }
        let step = prev.get(key(goal.room)), cur = goal.room;
        while (step && step.room !== room) { cur = step.room; step = prev.get(key(cur)); }
        this.owGoal = { kind: 'travel', dir: step.dir, final: goal };
    }

    overworldObjective() {
        const h = this.hero, room = this.room, W = this.world;
        if (!this.owGoal) this.planOverworld();
        const g = this.owGoal;
        if (!g) return null;

        // Read a sign now and then
        if (!room.signRead && this.config.dialogue) {
            for (const k of Object.keys(room.signs)) {
                const i = +k, W2 = room.cols;
                const below = i + W2;
                if (Math.abs((i % W2) * 16 + 8 - h.x) + Math.abs(((below / W2) | 0) * 16 + 8 - h.y) < 70) {
                    if (this.cellOf(h.x, h.y) === below) {
                        room.signRead = true;
                        h.dir = 'up';
                        this.stats.signs++;
                        this.say(room.signs[k], { sign: true });
                        return null;
                    }
                    return { cells: [below], note: 'sign' };
                }
            }
        }
        if (g.kind === 'home') {
            if (room.pedestal) {
                const front = (room.pedestal.y + 1) * room.cols + room.pedestal.x;
                if (this.cellOf(h.x, h.y) === front) { this.beginEnding(); return null; }
                return { cells: [front], note: 'pedestal' };
            }
            return this.travelHome();
        }
        if (g.kind === 'portal') {
            const p = g.portal;
            return { cells: [p.y * room.cols + p.x], note: 'portal' };
        }
        if (g.kind === 'travel') {
            const o = this.exitObjective(g.dir);
            if (o) return o;
        }
        if (g.kind === 'explore') return null;
        return null;
    }

    travelHome() {
        const W = this.world, over = W.overworld, room = this.room;
        const start = over.rooms[W.start.ry][W.start.rx];
        const key = (r) => r.rx + ',' + r.ry;
        const prev = new Map([[key(room), null]]);
        const q = [room];
        while (q.length) {
            const r = q.shift();
            if (r === start) break;
            for (const d of QuestWorld.DIR_KEYS) {
                if (!r.exits[d]) continue;
                const V = QuestWorld.DIRS[d];
                const nb = over.rooms[r.ry + V.dy] && over.rooms[r.ry + V.dy][r.rx + V.dx];
                if (!nb || prev.has(key(nb))) continue;
                prev.set(key(nb), { room: r, dir: d });
                q.push(nb);
            }
        }
        let step = prev.get(key(start)), cur = start;
        if (!step) return null;
        while (step && step.room !== room) { cur = step.room; step = prev.get(key(cur)); }
        return step ? this.exitObjective(step.dir) : null;
    }

    // -----------------------------------------------------------------------
    // Dialogue, events, death and the ending
    // -----------------------------------------------------------------------
    say(text, opts = {}) {
        if (!this.config.dialogue && !opts.force) return;
        this.dialog = { text: text.toUpperCase(), shown: 0, t: 0, hold: opts.quick ? 0.8 : 1.6, resume: opts.resume || 'play', who: opts.who, sign: opts.sign };
        this.mode = 'dialog';
        this.hero.path = [];
        this.hero.exitDir = null;
    }

    updateDialog(dt) {
        const d = this.dialog;
        if (d.waitWarp) { this.updateWarpOnly(dt); return; }
        d.t += dt;
        d.shown = Math.min(d.text.length, d.shown + dt * 32);
        if (d.shown >= d.text.length) {
            d.hold -= dt;
            if (d.hold <= 0) {
                this.mode = d.resume;
                this.dialog = null;
                this.hero.thinkT = 0;
            }
        }
    }

    // While a cave's welcome text waits, the iris still needs to finish opening
    updateWarpOnly(dt) {
        const w = this.warp;
        if (!w) { this.dialog.waitWarp = false; return; }
        w.t += dt;
        if (w.t >= w.dur) { this.warp = null; this.dialog.waitWarp = false; }
    }

    updateEvent(dt) {
        const ev = this.event, h = this.hero;
        ev.t += dt;
        switch (ev.kind) {
            case 'fountain':
                if (Math.random() < dt * 14) this.addEffect('fairyspin', h.x, h.y, { life: 1.2, a: Math.random() * Math.PI * 2 });
                if (ev.t > 0.4) h.hp = Math.min(h.maxHp, h.hp + dt * 6);
                if (ev.t > 2.2) { h.hp = h.maxHp; this.mode = 'play'; this.think('All better!', 1.4); }
                break;
            case 'nap':
                h.state = 'sleep';
                if (Math.random() < dt * 2) this.addEffect('zzz', h.x + 4, h.y - 14, { life: 1.4 });
                if (ev.t > 1) h.hp = Math.min(h.maxHp, h.hp + dt * 3);
                if (ev.t > 3.6) { h.hp = h.maxHp; h.state = 'idle'; this.mode = 'play'; this.think('*stretch*', 1.4); }
                break;
            case 'bossdeath':
                if (Math.random() < dt * 18 && ev.t < 1.4) this.addEffect('poof', ev.x + (Math.random() - 0.5) * 30, ev.y + (Math.random() - 0.5) * 26, { life: 0.4 });
                if (ev.t > 1.6 && this.room.dungeon === undefined) {
                    // The Cow King leaves behind a heart and the Golden Cowbell
                    const room = this.room;
                    this.area.kingDefeated = true;
                    this.addPickup('heartContainer', ev.x - 20, ev.y, { persist: 'bossheart' });
                    room.items.push({ id: 'bossheart', type: 'heartContainer', x: Math.floor((ev.x - 20) / 16), y: Math.floor(ev.y / 16) });
                    this.addPickup('cowbell', room.cols * 8, room.rows * 8, { persist: 'cowbell', still: true });
                    room.items.push({ id: 'cowbell', type: 'cowbell', x: Math.floor(room.cols / 2), y: Math.floor(room.rows / 2) });
                    this.mode = 'play';
                    this.floatText('MOOOOOO...', ev.x, ev.y - 20, '#fcfcfc', 2);
                } else if (ev.t > 1.6) {
                    const room = this.room;
                    this.addPickup('heartContainer', ev.x - 20, ev.y, { persist: 'bossheart' });
                    room.items.push({ id: 'bossheart', type: 'heartContainer', x: Math.floor((ev.x - 20) / 16), y: Math.floor(ev.y / 16) });
                    this.addPickup('shard', room.cols * 8, room.rows * 8, { persist: 'shard', still: true });
                    this.addEffect('sparkle', room.cols * 8, room.rows * 8, { life: 1 });
                    this.mode = 'play';
                    this.updateShutters();
                    this.think(QuestArt.WORDS.thoughts.victory[Math.floor(Math.random() * 4)], 1.6);
                }
                break;
        }
    }

    updateDeath(dt) {
        const d = this.death, h = this.hero;
        d.t += dt;
        if (d.t < 1.2) {
            h.dir = ['down', 'left', 'up', 'right'][Math.floor(d.t * 10) % 4];
        } else if (!d.text) {
            const QA = QuestArt;
            d.text = QA.WORDS.deathLines[Math.floor(Math.random() * QA.WORDS.deathLines.length)];
            if (h.def.lives) d.sub = h.lives > 0 ? h.lives + (h.lives === 1 ? ' LIFE' : ' LIVES') + ' LEFT' : 'CATS HAVE INFINITE LIVES, ACTUALLY.';
        }
        if (d.t > 4) {
            // Back to the start of the dungeon, or the start of the world
            const W = this.world;
            let dest, x, y;
            if (this.area.kind === 'dungeon') {
                dest = this.area.rooms.flat().find(r => r && r.kind === 'entrance');
                x = Math.floor(dest.cols / 2) * 16; y = (dest.rows - 3) * 16 + 8;
            } else {
                dest = W.overworld.rooms[W.start.ry][W.start.rx];
                x = dest.pedestal.x * 16 + 8; y = (dest.pedestal.y + 2) * 16 + 8;
            }
            h.hp = Math.max(6, Math.round(h.maxHp * 0.75 / 2) * 2);
            h.invuln = 2;
            h.x = x; h.y = y; h.dir = 'down';
            this.death = null;
            this.mode = 'play';
            this.enterRoom(dest, { via: 'death' });
            this.fadeIn = 0.8;
            if (this.pityHeart) {
                this.pityHeart = false;
                this.itemGet('heartContainer', null, { name: 'HEART CONTAINER', desc: 'A PASSING FAIRY FELT SORRY FOR YOU.' });
                h.maxHp += 2;
                h.hp = h.maxHp;
            }
        }
    }

    beginEnding() {
        const h = this.hero;
        this.mode = 'ending';
        this.ending = { t: 0, phase: 'shards', placed: 0, fireworks: [] };
        h.dir = 'up';
        h.path = [];
        h.thought = null;
        h.state = 'hold';
    }

    updateEnding(dt) {
        const e = this.ending, h = this.hero, W = this.world, room = this.room;
        e.t += dt;
        this.updateEffects(dt);
        this.updateCompanion(dt);
        const px = room.pedestal.x * 16 + 8, py = room.pedestal.y * 16 + 4;
        if (e.phase === 'shards') {
            const n = W.totalShards;
            const every = 0.6;
            while (e.placed < n && e.t > 0.6 + e.placed * every) {
                e.placed++;
                this.addEffect('flyshard', h.x, h.y - 16, { life: 0.5, tx: px, ty: py });
            }
            if (e.t > 1.2 + n * every) {
                e.phase = 'flash';
                e.t = 0;
                this.shake = 0.5;
                this.floatText(QuestArt.WORDS.endings[Math.floor(Math.random() * 4)], px, py - 24, '#fce800', 3);
            }
        } else if (e.phase === 'flash') {
            if (Math.random() < dt * 6) {
                const fx = 20 + Math.random() * (room.cols * 16 - 40), fy = 16 + Math.random() * (room.rows * 8);
                const col = ['#f83838', '#fce800', '#38b8f8', '#58d838', '#f878f8', '#fcfcfc'][Math.floor(Math.random() * 6)];
                for (let i = 0; i < 14; i++) this.addEffect('firework', fx, fy, { life: 1, a: i / 14 * Math.PI * 2, color: col });
            }
            h.state = 'hold';
            if (e.t > 4) { e.phase = 'credits'; e.t = 0; }
        } else if (e.phase === 'credits') {
            if (e.t > this.creditLines().length * 0.55 + 8) {
                this.newQuest({ keepHero: this.config.hero !== 'random' });
            }
        }
    }

    creditLines() {
        if (this._credits && this._creditsFor === this.questNumber) return this._credits;
        const h = this.hero, s = this.stats, W = this.world;
        const mins = Math.max(1, Math.round(this.time / 60));
        const lines = [
            '~ THE END ~', '', h.name.toUpperCase() + ' THE ' + h.def.name.toUpperCase(), '', 'STARRING',
            h.name.toUpperCase() + ' (AS THEMSELF)', W.villain.toUpperCase() + ' (OFFSCREEN)', '',
            'ROOMS EXPLORED ...... ' + s.rooms,
            (this.diff.befriend ? 'FRIENDS MADE ........ ' + s.friends : 'MONSTERS BONKED ..... ' + s.monsters),
            'TREASURE ............ ' + s.money,
            'HEARTS EATEN ........ ' + s.hearts,
            'BUSHES TRIMMED ...... ' + s.bushes,
            'SIGNS READ .......... ' + s.signs,
            'NAPS TAKEN .......... ' + s.naps,
            'TIMES FAINTED ....... ' + s.deaths,
            'TIME ................ ' + mins + ' MIN', ''
        ];
        if (h.trinkets.length) { lines.push('TREASURED POSSESSIONS:'); for (const t of h.trinkets) lines.push(t); lines.push(''); }
        lines.push('THANK YOU FOR WATCHING!', '', 'A NEW ADVENTURE AWAITS...');
        this._credits = lines;
        this._creditsFor = this.questNumber;
        return lines;
    }

    // -----------------------------------------------------------------------
    // Companion, critters, effects, weather
    // -----------------------------------------------------------------------
    updateCompanion(dt) {
        const h = this.hero;
        if (!this.companions.length) return;
        this.trail.push([h.x, h.y]);
        if (this.trail.length > 400) this.trail.shift();
        let lagSum = 0;
        for (const c of this.companions) {
            const def = QuestArt.COMPANIONS[c.key];
            if (!def || !def.frames) continue;
            c.t += dt;
            // Each follower walks a little further back along the hero's trail
            lagSum += def.slow ? 40 : (c.idx ? 13 : 18);
            let [tx, ty] = this.trail[Math.max(0, this.trail.length - 1 - lagSum)] || [h.x, h.y];
            // Parade members each keep a little personal space
            if (c.idx) { tx += Math.sin(c.idx * 2.4) * 9; ty += Math.cos(c.idx * 2.4) * 5; }
            const dx = tx - c.x, dy = ty - c.y;
            const d = Math.hypot(dx, dy);
            if (def.slow && d > 90) {
                // Slowpokes catch up the only way they can
                c.x = tx; c.y = ty;
                this.addEffect('poof', c.x, c.y, { life: 0.3 });
                if (def.zoom) this.floatText('ZOOM!', c.x, c.y - 12, '#58d838');
            }
            const follow = def.slow ? 0.9 : 6;
            c.x += dx * Math.min(1, dt * follow);
            c.y += dy * Math.min(1, dt * follow);
            if (Math.abs(dx) > 0.5) c.dir = dx > 0 ? 1 : -1;
            // The fairy patches up the odd scrape
            if (c.key === 'fairy' && this.mode === 'play' && h.hp < h.maxHp && h.hp <= 2) {
                c.healT = (c.healT || 0) + dt;
                if (c.healT > 12) { c.healT = 0; h.hp = Math.min(h.maxHp, h.hp + 1); this.addEffect('heart', c.x, c.y - 8, { life: 0.9, vx: 0, vy: -24 }); }
            }
        }
    }

    updateCritters(dt) {
        const h = this.hero;
        for (const c of this.critters) {
            c.t += dt;
            c.timer -= dt;
            const dh = Math.hypot(c.x - h.x, c.y - h.y);
            switch (c.kind) {
                case 'butterfly':
                case 'firefly':
                    if (c.timer <= 0) { c.timer = 0.5 + Math.random(); c.vx = (Math.random() - 0.5) * 40; c.vy = (Math.random() - 0.5) * 30; }
                    c.x += c.vx * dt; c.y += c.vy * dt + Math.sin(c.t * 8) * 0.3;
                    this.keepInRoom(c);
                    // Cats cannot resist
                    if (h.def.lives && dh < 50 && !this.room.butterflyChased && this.mode === 'play' && this.enemies.length === 0) {
                        this.room.butterflyChased = true;
                        h.path = this.findPath(this.cellOf(h.x, h.y), new Set([this.cellOf(c.x, c.y)]), 8) || [];
                        h.guided = 1.6;
                        this.think('Butterfly!!', 1.4);
                    }
                    break;
                case 'bird':
                case 'crow':
                    if (c.state === 'idle') {
                        if (dh < 34) { c.state = 'fly'; c.vx = (c.x < h.x ? -1 : 1) * 80; c.vy = -70; }
                        if (c.timer <= 0) { c.timer = 1 + Math.random() * 2; c.peck = 0.3; }
                        if (c.peck > 0) c.peck -= dt;
                    } else {
                        c.x += c.vx * dt; c.y += c.vy * dt; c.z += 30 * dt;
                        if (c.y < -20 || c.x < -20 || c.x > this.room.cols * 16 + 20) c.dead = true;
                    }
                    break;
                case 'chicken':
                case 'squirrel':
                case 'lizard': {
                    const sp = c.kind === 'chicken' ? 18 : c.kind === 'squirrel' ? 50 : 40;
                    if (c.timer <= 0) {
                        c.timer = 0.6 + Math.random() * 1.6;
                        if (Math.random() < 0.5) { c.vx = 0; c.vy = 0; c.peck = 0.5; }
                        else { const a = Math.random() * Math.PI * 2; c.vx = Math.cos(a) * sp; c.vy = Math.sin(a) * sp; }
                    }
                    if (c.peck > 0) c.peck -= dt;
                    if (dh < 26 && c.kind !== 'chicken') { const a = Math.atan2(c.y - h.y, c.x - h.x); c.vx = Math.cos(a) * sp * 1.5; c.vy = Math.sin(a) * sp * 1.5; }
                    const w = { x: c.x, y: c.y, w: 6, h: 6 };
                    this.moveEntity(w, c.vx * dt, c.vy * dt, 'enemy');
                    c.x = w.x; c.y = w.y;
                    if (Math.abs(c.vx) > 1) c.dir = c.vx > 0 ? 1 : -1;
                    break;
                }
                case 'fish':
                    if (c.timer <= 0 && c.state === 'idle') { c.state = 'jump'; c.jt = 0; c.timer = 3 + Math.random() * 4; }
                    if (c.state === 'jump') {
                        c.jt += dt;
                        c.z = Math.sin(c.jt / 0.7 * Math.PI) * 12;
                        if (c.jt > 0.7) { c.state = 'idle'; c.z = 0; this.addEffect('splash', c.x, c.y, { life: 0.4 }); }
                    }
                    break;
            }
        }
        this.critters = this.critters.filter(c => !c.dead);
    }

    updateEffects(dt) {
        for (const e of this.effects) {
            e.t += dt;
            if (e.vx !== undefined) { e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 140 * dt * (e.type === 'leaf' ? 0.6 : e.type === 'heart' ? -0.1 : 0.5); }
        }
        this.effects = this.effects.filter(e => e.t < e.life);
    }

    setupWeather() {
        const room = this.room;
        this.particles = [];
        this.weatherKind = null;
        if (!this.config.weather || (this.area.kind !== 'overworld' && this.area.kind !== 'cowlevel')) return;
        const biome = this.roomBiome(room);
        let kind = biome.weather;
        // The occasional shower over green places
        const rainy = QuestArt.hash2(room.rx, room.ry, Math.floor(this.time / 120)) < 0.18;
        if (rainy && ['meadow', 'forest', 'lake', 'village', 'autumn', 'mountain'].includes(room.biome)) kind = 'rain';
        this.weatherKind = kind;
    }

    updateParticles(dt) {
        const kind = this.weatherKind;
        if (!this.room) return;
        const RW = this.room.cols * 16, RH = this.room.rows * 16;
        const rates = { snow: 30, rain: 90, petals: 4, leaves: 5, dust: 14, spores: 6, sprinkles: 10, fog: 0.6 };
        if (kind && this.mode !== 'story') {
            this.pAcc = (this.pAcc || 0) + dt * (rates[kind] || 0) * (RW / 288);
            while (this.pAcc > 1) {
                this.pAcc -= 1;
                const p = { kind, x: Math.random() * RW, y: -4, t: 0, life: 8, ph: Math.random() * 6 };
                switch (kind) {
                    case 'snow': p.vx = -4; p.vy = 14 + Math.random() * 10; p.s = Math.random() < 0.3 ? 2 : 1; break;
                    case 'rain': p.vx = -30; p.vy = 210; p.life = RH / 200 + 0.2; p.landY = Math.random() * RH; break;
                    case 'petals': p.vx = 12; p.vy = 10 + Math.random() * 6; p.c = Math.random() < 0.5 ? '#f8b8d8' : '#fcfcfc'; break;
                    case 'leaves': p.vx = 14; p.vy = 14 + Math.random() * 8; p.c = ['#e86818', '#fcb848', '#c83818'][Math.floor(Math.random() * 3)]; break;
                    case 'dust': p.x = -4; p.y = Math.random() * RH; p.vx = 70 + Math.random() * 40; p.vy = 4; break;
                    case 'spores': p.y = RH + 4; p.vx = 0; p.vy = -8 - Math.random() * 6; p.life = 12; p.c = Math.random() < 0.5 ? '#c8fc78' : '#f8a8f8'; break;
                    case 'sprinkles': p.vx = 0; p.vy = 26 + Math.random() * 10; p.c = ['#f83838', '#fce800', '#38b8f8', '#58d838', '#a858f8'][Math.floor(Math.random() * 5)]; break;
                    case 'fog': p.x = -60; p.y = Math.random() * RH; p.vx = 8 + Math.random() * 6; p.vy = 0; p.life = 40; p.r = 30 + Math.random() * 30; break;
                }
                this.particles.push(p);
            }
        }
        for (const p of this.particles) {
            p.t += dt;
            p.x += (p.vx + (p.kind === 'snow' || p.kind === 'petals' || p.kind === 'leaves' ? Math.sin(p.t * 2 + p.ph) * 10 : 0)) * dt;
            p.y += p.vy * dt;
            if (p.kind === 'rain' && p.y > p.landY) { p.dead = true; if (Math.random() < 0.3) this.addEffect('drip', p.x, p.y, { life: 0.2 }); }
            if (p.t > p.life || p.y > RH + 8 || p.x > RW + 80) p.dead = true;
        }
        this.particles = this.particles.filter(p => !p.dead);
        if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
    }

    showBanner(text, sub) {
        this.banner = { text, sub, t: 0, dur: 3.2 };
    }

    // -----------------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------------
    viewport() {
        const L = this.layout, dpr = this.dpr;
        const W = window.innerWidth * dpr;
        const H = (window.innerHeight - this.host.insets.bottom) * dpr;
        const s = Math.min(W / L.lowW, H / L.lowH);
        return { s, x: Math.round((W - L.lowW * s) / 2), y: Math.round((H - L.lowH * s) / 2), w: L.lowW * s, h: L.lowH * s };
    }

    render() {
        if (!this.world || !this.low) return;
        const ctx = this.paletteContext(), L = this.layout;
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, L.lowW, L.lowH);

        if (this.mode === 'story') this.drawStory(ctx);
        else if (this.mode === 'ending' && this.ending.phase === 'credits') this.drawCredits(ctx);
        else {
            this.drawWorld(ctx);
            if (L.hudH) this.drawHUD(ctx);
        }
        ctx.restore();

        // Scale up to the screen
        const out = this.ctx;
        const v = this.viewport();
        out.imageSmoothingEnabled = false;
        out.fillStyle = '#000';
        out.fillRect(0, 0, this.canvas.width, this.canvas.height);
        out.drawImage(this.low, 0, 0, L.lowW, L.lowH, v.x, v.y, v.w, v.h);
        if (this.config.crt && this.host.quality.effects.includes('crt')) this.drawCRT(out, v);
    }

    drawWorld(ctx) {
        const L = this.layout, room = this.room;
        const RW = room.cols * 16, RH = room.rows * 16;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, L.roomY, RW, RH);
        ctx.clip();
        let ox = 0, oy = L.roomY;
        if (this.shake > 0) { ox += Math.round((Math.random() - 0.5) * 4); oy += Math.round((Math.random() - 0.5) * 4); }

        if (this.mode === 'scroll') {
            const s = this.scroll;
            const u = Math.min(1, s.t / s.dur);
            const D = QuestWorld.DIRS[s.d];
            const sx = -D.dx * RW * u, sy = -D.dy * RH * u;
            ctx.drawImage(s.fromCanvas, ox + sx, oy + sy);
            ctx.drawImage(s.toCanvas, ox + sx + D.dx * RW, oy + sy + D.dy * RH);
            // Hero slides along with the screens
            const h = this.hero;
            const hx = s.hx0 + (s.hx1 + D.dx * RW - s.hx0) * u + sx;
            const hy = s.hy0 + (s.hy1 + D.dy * RH - s.hy0) * u + sy;
            ctx.save();
            ctx.translate(ox, oy);
            this.drawHeroAt(ctx, hx, hy);
            ctx.restore();
        } else {
            if (this.roomCanvas) ctx.drawImage(this.roomCanvas, ox, oy);
            ctx.save();
            ctx.translate(ox, oy);
            this.drawRoomDynamic(ctx);
            this.drawEntities(ctx);
            this.drawWeather(ctx);
            this.drawLighting(ctx);
            this.drawThought(ctx);
            ctx.restore();
        }
        ctx.restore();

        // Overlays in screen space
        if (this.paused && this.playable) this.drawPaused(ctx);
        if (this.banner) this.drawBanner(ctx);
        if (this.mode === 'dialog') this.drawDialog(ctx);
        if (this.mode === 'itemget') this.drawItemGet(ctx);
        if (this.mode === 'death') this.drawDeath(ctx);
        if (this.warp) this.drawWarp(ctx);
        if (this.fadeIn > 0) {
            ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.fadeIn / 0.8)})`;
            ctx.fillRect(0, L.roomY, RW, RH);
        }
        if (this.mode === 'ending' && this.ending.phase === 'flash' && this.ending.t < 0.5) {
            ctx.fillStyle = `rgba(255,255,255,${1 - this.ending.t / 0.5})`;
            ctx.fillRect(0, L.roomY, RW, RH);
        }
    }

    // Animated bits on top of the static room: water glints, flames
    drawRoomDynamic(ctx) {
        const room = this.room, T = QuestWorld.T, QA = QuestArt;
        const W = room.cols, tiles = room.tiles;
        const f = Math.floor(this.time * 3) % 2;
        const glint = this.area.kind === 'overworld' ? QA.shade(this.roomBiome(room).water, 0.5) : '#a8e4fc';
        for (let i = 0; i < tiles.length; i++) {
            const k = tiles[i];
            if (k === T.WATER) {
                const x = (i % W) * 16, y = ((i / W) | 0) * 16;
                const a = QA.hash2(i, 3, 1), b = QA.hash2(i, 5, 2);
                const gx = Math.floor((a * 10 + this.time * 4) % 12) + 2, gy = Math.floor(b * 10) + 3;
                if ((f + i) % 3) { ctx.fillStyle = glint; ctx.fillRect(x + gx, y + gy, 2, 1); }
            }
        }
        for (const s of room.structures || []) {
            if (s.kind !== 'cowlevel' && s.kind !== 'cowexit') continue;
            const cx = s.x * 16 + 24, cy = s.y * 16 + 20;
            for (let i = 0; i < 6; i++) {
                const a = this.time * 3 + i * 1.05, r = 3 + ((this.time * 6 + i * 2) % 7);
                ctx.fillStyle = i % 2 ? '#fcd8a8' : '#f83858';
                ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 1.1), 1, 1);
            }
        }
        for (const t of room.torches) this.drawFlame(ctx, t.x * 16 + 8, t.y * 16 + (tiles[t.y * W + t.x] === T.TORCH ? 4 : 9), tiles[t.y * W + t.x] === T.FIRE ? 1.4 : 1);
        // Shards sitting in the pedestal
        if (room.pedestal && this.mode === 'ending') {
            const n = this.ending.placed;
            for (let i = 0; i < n; i++) ctx.drawImage(this.sprites.icon('shard'), room.pedestal.x * 16 + 4 + (i - (n - 1) / 2) * 5, room.pedestal.y * 16);
        }
    }

    drawFlame(ctx, x, y, size = 1) {
        const t = this.time * 10;
        const h = Math.round((5 + Math.sin(t + x) * 1.5) * size);
        const w = Math.round(3 * size);
        ctx.fillStyle = '#f83800';
        ctx.fillRect(x - w, y - h, w * 2, h);
        ctx.fillStyle = '#fca044';
        ctx.fillRect(x - w + 1, y - h + 2, w * 2 - 2, h - 2);
        ctx.fillStyle = '#fce800';
        ctx.fillRect(x - 1, y - h + 3 + (Math.sin(t * 1.7) > 0 ? 1 : 0), 2, Math.max(1, h - 4));
        ctx.fillStyle = '#f83800';
        ctx.fillRect(x - 1 + (Math.sin(t * 2.3) > 0 ? 1 : -1), y - h - 2, 1, 2);
    }

    drawEntities(ctx) {
        const list = [];
        for (const p of this.pickups) list.push({ y: p.y - 2, fn: () => this.drawPickup(ctx, p) });
        for (const c of this.critters) list.push({ y: c.y, fn: () => this.drawCritter(ctx, c) });
        for (const e of this.enemies) list.push({ y: e.y, fn: () => this.drawEnemy(ctx, e) });
        if (this.room.npc && this.area.kind === 'cave') list.push({ y: this.room.npcSpot.y * 16 + 8, fn: () => this.drawNPC(ctx) });
        if (this.mode !== 'death' || this.death.t < 3.8) list.push({ y: this.hero.y, fn: () => this.drawHeroAt(ctx, this.hero.x, this.hero.y) });
        for (const c of this.companions) {
            const cd = QuestArt.COMPANIONS[c.key];
            list.push({ y: c.y + (cd && cd.fly ? 30 : 0), fn: () => this.drawCompanion(ctx, c) });
        }
        list.sort((a, b) => a.y - b.y);
        for (const d of list) d.fn();
        for (const p of this.projectiles) this.drawProjectile(ctx, p);
        for (const e of this.effects) this.drawEffect(ctx, e);
        // Shop prices under the goods
        for (const p of this.pickups) if (p.shop) this.text(ctx, String(p.price), p.x, p.y + 9, '#fcfcfc', { align: 'center' });
    }

    shadow(ctx, x, y, w = 10) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(Math.round(x - w / 2) + 1, Math.round(y), w - 2, 1);
        ctx.fillRect(Math.round(x - w / 2), Math.round(y) + 1, w, 2);
        ctx.fillRect(Math.round(x - w / 2) + 1, Math.round(y) + 3, w - 2, 1);
    }

    drawHeroAt(ctx, x, y) {
        const h = this.hero;
        const set = this.sprites.hero(h.key, h.variant, this.config.hat);
        let dir = h.dir;
        let frame = h.moving || this.mode === 'scroll' ? Math.floor(h.walkT / (0.14 / (h.def.speed || 1))) % 2 : 0;
        if (h.state === 'hold' || h.state === 'sleep') { dir = 'down'; frame = 0; }
        if (h.atk) frame = 0;
        const bob = (h.moving && frame === 1 && (dir === 'down' || dir === 'up')) ? -1 : 0;
        let img = set[dir][frame];
        if (h.invuln > 0 && this.mode === 'play') {
            const ph = Math.floor(h.invuln * 20);
            if (h.invuln > 0.85) img = ph % 2 ? set.flash[dir][frame] : set.red[dir][frame];
            else if (ph % 2) img = null;
        }
        if (this.mode === 'death' && this.death.t > 1.2) img = set.flash.down[0];
        const sx = Math.round(x - 8), sy = Math.round(y - 13 + bob);
        if (!h.swimming) this.shadow(ctx, x, y + 5, 10);

        // Weapon behind the hero when facing up
        if (h.atk && h.dir === 'up') this.drawWeapon(ctx, x, y);
        if (img) {
            if (h.swimming) {
                ctx.drawImage(img, 0, 0, 16, 13, sx, sy + 3, 16, 13);
                const f = Math.floor(this.time * 4) % 2;
                ctx.fillStyle = '#fcfcfc';
                ctx.fillRect(sx + 1 + f, sy + 15, 5, 1);
                ctx.fillRect(sx + 10 - f, sy + 15, 5, 1);
            } else if (h.state === 'sleep') {
                ctx.drawImage(img, sx, sy + 2);
            } else {
                ctx.drawImage(img, sx, sy);
            }
        }
        if (h.atk && h.dir !== 'up') this.drawWeapon(ctx, x, y);
        const holding = this.mode === 'itemget' && this.itemget ? this.itemget.icon
            : this.mode === 'ending' && this.ending.placed < this.world.totalShards ? 'shard' : null;
        if (h.state === 'hold' && holding) {
            const ic = holding;
            const icon = this.sprites.pickup(ic);
            ctx.drawImage(icon, Math.round(x - 5), sy - 9);
        }
    }

    drawWeapon(ctx, x, y) {
        const h = this.hero, a = h.atk, wp = h.weapon, v = this.dirVec(a.dir);
        const u = Math.min(1, a.t / Math.max(0.01, a.dur));
        x = Math.round(x); y = Math.round(y);
        if (a.kind === 'melee' && wp.style === 'blade') {
            const len = 10;
            const ext = u < 0.25 ? u / 0.25 : 1;
            const L = Math.round(len * ext);
            const hx = x + v[0] * 6, hy = y + v[1] * 6 + (v[0] ? 1 : 0);
            ctx.fillStyle = wp.guard;
            if (v[0]) ctx.fillRect(hx, hy - 2, 1, 5); else ctx.fillRect(hx - 2, hy, 5, 1);
            ctx.fillStyle = wp.hilt;
            if (v[0]) ctx.fillRect(hx - v[0] * 2 - (v[0] < 0 ? 0 : 0), hy, 2, 1); else ctx.fillRect(hx, hy - v[1] * 2, 1, 2);
            ctx.fillStyle = wp.blade;
            if (v[0] > 0) ctx.fillRect(hx + 1, hy - 1, L, 2);
            if (v[0] < 0) ctx.fillRect(hx - L, hy - 1, L, 2);
            if (v[1] > 0) ctx.fillRect(hx - 1, hy + 1, 2, L);
            if (v[1] < 0) ctx.fillRect(hx - 1, hy - L, 2, L);
            ctx.fillStyle = wp.bladeLo;
            if (v[0] > 0) ctx.fillRect(hx + 1, hy, L, 1);
            if (v[0] < 0) ctx.fillRect(hx - L, hy, L, 1);
            if (v[1] > 0) ctx.fillRect(hx, hy + 1, 1, L);
            if (v[1] < 0) ctx.fillRect(hx, hy - L, 1, L);
        } else if (a.kind === 'melee' && wp.style === 'claw') {
            const cx = x + v[0] * 11, cy = y + v[1] * 11 - 2;
            ctx.fillStyle = '#fcfcfc';
            for (let i = -1; i <= 1; i++) {
                const n = Math.round(6 * Math.min(1, u * 2));
                for (let s = 0; s < n; s++) {
                    if (v[0]) ctx.fillRect(cx + i * 3 + (s - 3) * v[0] * 0.5, cy - 3 + s, 1, 1);
                    else ctx.fillRect(cx - 3 + s, cy + i * 3 + (s - 3) * 0.5, 1, 1);
                }
            }
        } else if (a.kind === 'melee' && wp.style === 'pan') {
            const ang = (u - 0.5) * 1.6;
            const base = Math.atan2(v[1], v[0]);
            const px = x + Math.cos(base + ang) * 10, py = y - 2 + Math.sin(base + ang) * 10;
            ctx.fillStyle = '#7c4c1c';
            ctx.fillRect(Math.round(x + Math.cos(base + ang) * 4), Math.round(y - 2 + Math.sin(base + ang) * 4), 2, 2);
            ctx.fillStyle = '#2c2838';
            ctx.fillRect(Math.round(px) - 3, Math.round(py) - 3, 7, 7);
            ctx.fillStyle = '#585868';
            ctx.fillRect(Math.round(px) - 2, Math.round(py) - 2, 5, 5);
            ctx.fillStyle = '#a8a8b8';
            ctx.fillRect(Math.round(px) - 1, Math.round(py) - 2, 2, 1);
        } else if (a.kind === 'tongue') {
            const ext = Math.round(a.ext || 0);
            const mx = x + v[0] * 4, my = y - 3 + v[1] * 4;
            ctx.fillStyle = '#f85878';
            if (v[0]) ctx.fillRect(v[0] > 0 ? mx : mx - ext, my, ext, 2);
            else ctx.fillRect(mx - 1, v[1] > 0 ? my : my - ext, 2, ext);
            ctx.fillStyle = '#f8a8c0';
            ctx.fillRect(mx + v[0] * ext - 2, my + v[1] * ext - 1, 4, 4);
        }
    }

    drawEnemy(ctx, e) {
        if (e.spawning) {
            // The classic spawn cloud
            const f = Math.floor((e.spawnT * 10)) % 2;
            this.drawPoof(ctx, e.x, e.y, f ? 5 : 3, '#fcfcfc');
            return;
        }
        if (e.burrowed) {
            // All that shows is the sand it is pushing along in front of it
            const w = Math.round(6 + Math.sin(e.animT * 9) * 1.5);
            ctx.fillStyle = '#e8d8a8';
            ctx.fillRect(Math.round(e.x - w / 2), Math.round(e.y + 1), w, 2);
            ctx.fillRect(Math.round(e.x - w / 2) + 1, Math.round(e.y - 1), w - 2, 2);
            ctx.fillStyle = '#c8a868';
            ctx.fillRect(Math.round(e.x - w / 2) - 2, Math.round(e.y + 3), w + 4, 1);
            return;
        }
        if (e.visible === false && !(e.alpha > 0)) return;
        const set = e.boss ? this.sprites.boss(e.type) : this.sprites.enemy(e.type);
        const fps = e.boss ? 3 : (e.def.ai === 'flyer' ? 8 : 4);
        let f = Math.floor(e.animT * fps) % 2;
        if (e.def.ai === 'hopper' && !e.boss) f = e.hop ? 1 : 0;
        if (e.landed) f = 0;
        // A shell that is in, or a chest that has yet to show its teeth, holds
        // one frame rather than flicking between two
        if (e.frameLock !== undefined) f = e.frameLock;
        let img = (e.dir === 'left' && !e.boss) || (e.boss && e.dir === 'left') ? set.flipped[f] : set.frames[f];
        if (e.invuln > 0 && Math.floor(e.invuln * 24) % 2) img = set.flash[f];
        if (e.stun > 0 && Math.floor(this.time * 8) % 2 && !e.boss) img = set.flash[f];
        if (e.windup > 0 && Math.floor(this.time * 20) % 2) img = set.flash[f];
        const size = e.boss ? 32 : 16;
        const sx = Math.round(e.x - size / 2), sy = Math.round(e.y - size / 2 - 2 - (e.z || 0));
        if (!e.flying || e.landed || e.z) this.shadow(ctx, e.x, e.y + (e.boss ? 12 : 5), e.boss ? 22 : 10);
        else this.shadow(ctx, e.x, e.y + 9, 6);
        const bob = e.flying && !e.landed ? Math.round(Math.sin(e.animT * 5) * 1.5) : 0;
        if (e.alpha !== undefined && e.alpha < 1) ctx.globalAlpha = Math.max(0, e.alpha) * 0.85;
        ctx.drawImage(img, sx, sy + bob);
        ctx.globalAlpha = 1;
        if (e.stun > 0) {
            const a = this.time * 6;
            ctx.fillStyle = '#fce800';
            for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(e.x + Math.cos(a + i * 2.1) * 6), Math.round(sy - 2 + Math.sin(a + i * 2.1) * 2), 1, 1);
        }
        // Boss health bar
        if (e.boss) {
            const w = 30;
            ctx.fillStyle = '#140c1c';
            ctx.fillRect(Math.round(e.x - w / 2) - 1, sy - 5, w + 2, 4);
            ctx.fillStyle = '#f83838';
            ctx.fillRect(Math.round(e.x - w / 2), sy - 4, Math.round(w * e.hp / e.maxHp), 2);
        }
    }

    drawPoof(ctx, x, y, r, color) {
        ctx.fillStyle = color;
        x = Math.round(x); y = Math.round(y);
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
            ctx.fillRect(Math.round(x + dx * r) - 1, Math.round(y + dy * r) - 1, 2, 2);
        }
        ctx.fillRect(x - 1, y - 1, 2, 2);
    }

    drawPickup(ctx, p) {
        if (p.type === 'fountain' || p.type === 'nap') return;
        if (p.life !== null && p.life < 2 && Math.floor(p.life * 10) % 2) return;
        const h = this.hero;
        let name = p.type;
        const cur = QuestEngineData.CURRENCY_ICON[h.def.currency] || 'gem';
        if (p.type === 'money' || p.type === 'money5') name = cur;
        else if (p.type === 'heartPiece') name = 'heartPiece';
        else if (p.type === 'trinket') name = QuestArt.WORDS.trinkets[p.trinket || 0].icon;
        else if (p.type === 'bombs') name = 'bomb';
        else if (p.type === 'fairy') name = Math.floor(p.t * 8) % 2 ? 'fairy' : 'fairy2';
        else if (p.type === 'chest') { this.drawChest(ctx, p.x, p.y, false); return; }
        const img = this.sprites.pickup(name);
        const bob = (p.type === 'shard' || p.type === 'heartContainer' || p.persist) ? Math.round(Math.sin(p.t * 3) * 1) : 0;
        const x = Math.round(p.x - 5), y = Math.round(p.y - 6 - p.z) + bob;
        this.shadow(ctx, p.x, p.y + 4, 8);
        ctx.drawImage(img, x, y);
        if (p.type === 'money5') ctx.drawImage(img, x + 3, y - 2);
        if ((p.type === 'shard' || p.persist) && Math.floor(p.t * 3) % 3 === 0) {
            ctx.fillStyle = '#fcfcfc';
            ctx.fillRect(x + 8, y, 1, 1);
        }
    }

    drawChest(ctx, x, y, open) {
        const key = 'chest:' + (open ? 1 : 0);
        const img = this.sprites.get(key, () => {
            const g = new QuestArt.PixelGrid(16, 14);
            g.rect(1, open ? 5 : 3, 14, open ? 8 : 10, '#a86c38');
            if (!open) { g.rect(1, 3, 14, 4, '#c88850'); g.rect(1, 7, 14, 1, '#5c3418'); }
            else { g.rect(2, 1, 12, 4, '#7c4c1c'); g.rect(3, 5, 10, 2, '#140c1c'); }
            g.rect(7, open ? 7 : 6, 2, 3, '#fcc800');
            g.rect(1, 12, 14, 1, '#5c3418');
            g.outline(QuestArt.OUTLINE);
            return g.toCanvas();
        });
        ctx.drawImage(img, Math.round(x - 8), Math.round(y - 9));
    }

    drawCritter(ctx, c) {
        const x = Math.round(c.x), y = Math.round(c.y - (c.z || 0));
        const f = Math.floor(c.t * 10) % 2;
        switch (c.kind) {
            case 'butterfly':
                ctx.fillStyle = c.color;
                if (f) { ctx.fillRect(x - 2, y - 1, 2, 2); ctx.fillRect(x + 1, y - 1, 2, 2); }
                else { ctx.fillRect(x - 1, y - 2, 1, 3); ctx.fillRect(x + 1, y - 2, 1, 3); }
                ctx.fillStyle = '#140c1c';
                ctx.fillRect(x, y - 1, 1, 2);
                break;
            case 'firefly': {
                const glow = Math.sin(c.t * 3) > 0;
                ctx.fillStyle = glow ? '#e8fc58' : '#788830';
                ctx.fillRect(x, y, 1, 1);
                if (glow) { ctx.fillStyle = 'rgba(232,252,88,0.35)'; ctx.fillRect(x - 1, y - 1, 3, 3); }
                break;
            }
            case 'bird':
            case 'crow': {
                const body = c.kind === 'crow' ? '#2c2838' : '#a86c38';
                ctx.fillStyle = body;
                ctx.fillRect(x - 2, y - 2, 4, 3);
                ctx.fillRect(x + (c.dir > 0 ? 2 : -3), y - 3, 1, 2);
                ctx.fillStyle = '#fca018';
                ctx.fillRect(x + (c.dir > 0 ? 3 : -4), y - 2, 1, 1);
                if (c.state === 'fly') { ctx.fillStyle = body; ctx.fillRect(x - 4, y - 3 - f * 2, 3, 1); ctx.fillRect(x + 2, y - 3 - f * 2, 3, 1); }
                else if (c.peck > 0) { ctx.fillStyle = body; ctx.fillRect(x + (c.dir > 0 ? 2 : -3), y - 1, 1, 1); }
                break;
            }
            case 'chicken': {
                const d = c.dir;
                ctx.fillStyle = '#140c1c';
                ctx.fillRect(x - 3, y - 5, 7, 6);
                ctx.fillStyle = '#fcfcfc';
                ctx.fillRect(x - 2, y - 4, 5, 4);
                ctx.fillRect(x + d * 2 - (d < 0 ? 1 : 0), y - 7 + (c.peck > 0 ? 3 : 0), 2, 3);
                ctx.fillStyle = '#f83838';
                ctx.fillRect(x + d * 2 - (d < 0 ? 1 : 0), y - 8 + (c.peck > 0 ? 3 : 0), 1, 1);
                ctx.fillStyle = '#fca018';
                ctx.fillRect(x + d * 4 - (d < 0 ? 1 : 0) + (d < 0 ? 1 : -1), y - 6 + (c.peck > 0 ? 3 : 0), 1, 1);
                ctx.fillRect(x - 1, y + 1, 1, 1 + f); ctx.fillRect(x + 1, y + 1, 1, 2 - f);
                break;
            }
            case 'squirrel':
                ctx.fillStyle = '#a85c28';
                ctx.fillRect(x - 2, y - 3, 4, 3);
                ctx.fillRect(x + (c.dir > 0 ? 1 : -2), y - 5, 2, 2);
                ctx.fillStyle = '#d88848';
                ctx.fillRect(x - (c.dir > 0 ? 4 : -3), y - 6 + f, 2, 4);
                break;
            case 'lizard':
                ctx.fillStyle = '#58b838';
                ctx.fillRect(x - 3, y - 1, 6, 2);
                ctx.fillRect(x - 2 + f, y - 2, 1, 1); ctx.fillRect(x + 1 - f, y + 1, 1, 1);
                break;
            case 'fish':
                if (c.state !== 'jump') break;
                ctx.fillStyle = '#f8a038';
                ctx.fillRect(x - 2, y - 1, 4, 2);
                ctx.fillRect(x + (c.jt < 0.35 ? -3 : 2), y - 1, 1, 2);
                break;
        }
    }

    drawNPC(ctx) {
        const room = this.room, npc = room.npc, x = room.npcSpot.x * 16 + 8, y = room.npcSpot.y * 16 + 8;
        const D = QuestEngineData;
        if (npc.kind === 'fountain') {
            // The fountain fairy, large and pleased with herself
            const f = Math.floor(this.time * 6) % 2;
            const img = this.sprites.pickup(f ? 'fairy' : 'fairy2');
            ctx.drawImage(img, 0, 0, 10, 10, Math.round(x - 10), Math.round(y - 14 + Math.sin(this.time * 2) * 2), 20, 20);
            return;
        }
        if (npc.kind === 'bed') return;
        let key;
        if (npc.kind === 'sage') key = D.SAGE_NPC[npc.sage.name] || 'oldman';
        else if (npc.kind === 'shop') key = 'shopkeeper';
        else key = 'villager' + (npc.look || 0);
        const set = this.sprites.npc(key);
        this.shadow(ctx, x, y + 5, 10);
        ctx.drawImage(set.down[Math.floor(this.time * 1.5) % 2 && npc.kind === 'shop' ? 1 : 0], Math.round(x - 8), Math.round(y - 13));
    }

    drawCompanion(ctx, c) {
        const def = QuestArt.COMPANIONS[c.key];
        if (!def || !def.frames) return;
        const set = this.sprites.companion(c.key);
        const f = Math.floor(c.t * (def.fly ? 8 : 4)) % 2;
        const img = c.dir < 0 ? set.flipped[f] : set.frames[f];
        const bob = def.fly ? Math.sin(c.t * 4) * 2 - 10 : (def.hop ? -Math.abs(Math.sin(c.t * 6)) * 3 : 0);
        if (!def.fly) this.shadow(ctx, c.x, c.y + 4, 6);
        ctx.drawImage(img, Math.round(c.x - 5 - c.dir * 7), Math.round(c.y - 6 + bob));
    }

    drawProjectile(ctx, p) {
        const x = Math.round(p.x), y = Math.round(p.y);
        const f = Math.floor(p.t * 16) % 2;
        switch (p.type) {
            case 'beam': {
                const cols = ['#fcfcfc', '#3cbcfc', '#f878f8', '#fce800'];
                ctx.fillStyle = cols[Math.floor(p.t * 20) % 4];
                if (Math.abs(p.vx) > 0) { ctx.fillRect(x - 5, y - 1, 10, 2); ctx.fillRect(x - (p.vx > 0 ? 6 : -5), y - 3, 1, 6); }
                else { ctx.fillRect(x - 1, y - 5, 2, 10); ctx.fillRect(x - 3, y - (p.vy > 0 ? 6 : -5), 6, 1); }
                break;
            }
            case 'star':
                ctx.fillStyle = f ? '#fce800' : '#fcfcfc';
                ctx.fillRect(x - 1, y - 3, 2, 6); ctx.fillRect(x - 3, y - 1, 6, 2);
                ctx.fillStyle = '#f878f8';
                ctx.fillRect(x - p.vx * 0.04 - 1, y - p.vy * 0.04 - 1, 2, 2);
                break;
            case 'laser':
                ctx.fillStyle = '#f83838';
                ctx.fillRect(x - p.w / 2, y - p.h / 2, p.w, p.h);
                ctx.fillStyle = '#fcfcfc';
                if (p.w > p.h) ctx.fillRect(x - p.w / 2 + 1, y, p.w - 2, 1); else ctx.fillRect(x, y - p.h / 2 + 1, 1, p.h - 2);
                break;
            case 'shuriken': {
                ctx.fillStyle = '#c8c8d8';
                const r = Math.floor(p.spin) % 2;
                if (r) { ctx.fillRect(x - 3, y, 7, 1); ctx.fillRect(x, y - 3, 1, 7); }
                else { for (let i = -2; i <= 2; i++) { ctx.fillRect(x + i, y + i, 1, 1); ctx.fillRect(x + i, y - i, 1, 1); } }
                ctx.fillStyle = '#585868';
                ctx.fillRect(x, y, 1, 1);
                break;
            }
            case 'snowball':
                ctx.fillStyle = '#140c1c'; ctx.fillRect(x - 2, y - 3, 5, 6); ctx.fillRect(x - 3, y - 2, 7, 4);
                ctx.fillStyle = '#fcfcfc'; ctx.fillRect(x - 2, y - 2, 5, 4); ctx.fillRect(x - 1, y - 3, 3, 6);
                break;
            case 'bone':
            case 'boomerangItem': {
                const img = this.sprites.pickup(p.type === 'bone' ? 'bone' : 'boomerang');
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(Math.floor(p.spin) * Math.PI / 2);
                ctx.drawImage(img, -5, -5);
                ctx.restore();
                break;
            }
            case 'rock':
                ctx.fillStyle = '#140c1c'; ctx.fillRect(x - 3, y - 3, 6, 6);
                ctx.fillStyle = '#a8a8a8'; ctx.fillRect(x - 2, y - 2, 4, 4);
                ctx.fillStyle = '#e0e0e0'; ctx.fillRect(x - 2, y - 2, 2, 1);
                break;
            case 'spear':
                ctx.fillStyle = '#7c4c1c';
                if (Math.abs(p.vx) > 0) { ctx.fillRect(x - 6, y, 12, 1); ctx.fillStyle = '#c8c8d8'; ctx.fillRect(x + (p.vx > 0 ? 5 : -7), y - 1, 2, 3); }
                else { ctx.fillRect(x, y - 6, 1, 12); ctx.fillStyle = '#c8c8d8'; ctx.fillRect(x - 1, y + (p.vy > 0 ? 5 : -7), 3, 2); }
                break;
            case 'fire':
                ctx.fillStyle = f ? '#f83800' : '#fca044';
                ctx.fillRect(x - 4, y - 4, 8, 8);
                ctx.fillStyle = '#fce800';
                ctx.fillRect(x - 2, y - 2, 4, 4);
                break;
            case 'tear':
                ctx.fillStyle = '#3c78f8'; ctx.fillRect(x - 2, y - 2, 4, 4);
                ctx.fillStyle = '#a8e4fc'; ctx.fillRect(x - 1, y - 2, 1, 2);
                break;
            case 'coin':
            case 'acorn': {
                const img = this.sprites.pickup(p.type);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(Math.floor(p.spin * 0.5) * Math.PI / 2);
                ctx.drawImage(img, -5, -5);
                ctx.restore();
                break;
            }
            case 'magic':
                ctx.fillStyle = f ? '#a838f8' : '#f878f8';
                ctx.fillRect(x - 3, y - 1, 6, 2); ctx.fillRect(x - 1, y - 3, 2, 6);
                ctx.fillStyle = '#fcfcfc'; ctx.fillRect(x, y, 1, 1);
                break;
            case 'snow':
                break;
            case 'milk':
            case 'sock': {
                const img = this.sprites.pickup(p.type);
                ctx.drawImage(img, x - 5, y - 5);
                break;
            }
            case 'bombLit': {
                const img = this.sprites.pickup('bomb');
                const blink = p.t > 0.7 && Math.floor(p.t * 16) % 2;
                ctx.drawImage(blink ? this.sprites.get('bombBlink', () => QuestArt.silhouette(img, '#f83838')) : img, x - 5, y - 7);
                break;
            }
        }
    }

    drawEffect(ctx, e) {
        const u = e.t / e.life, x = Math.round(e.x), y = Math.round(e.y);
        switch (e.type) {
            case 'poof': {
                const r = 2 + u * 8;
                this.drawPoof(ctx, x, y, r, u < 0.5 ? '#fcfcfc' : '#a8a8b8');
                break;
            }
            case 'spark':
                ctx.fillStyle = Math.floor(e.t * 30) % 2 ? '#fcfcfc' : '#fce800';
                ctx.fillRect(x - 3, y, 7, 1); ctx.fillRect(x, y - 3, 1, 7);
                break;
            case 'sparkle': {
                const s = Math.round(1 + Math.sin(u * Math.PI) * 2);
                ctx.fillStyle = '#fcfcfc';
                ctx.fillRect(x - s, y, s * 2 + 1, 1); ctx.fillRect(x, y - s, 1, s * 2 + 1);
                break;
            }
            case 'leaf':
                ctx.fillStyle = e.color;
                ctx.fillRect(x, y, 2, 1);
                break;
            case 'ring': {
                const r = e.radius * Math.min(1, u / 0.7);
                ctx.fillStyle = e.color || '#fcfcfc';
                ctx.globalAlpha = 1 - u;
                const n = Math.max(12, Math.round(r));
                for (let i = 0; i < n; i++) {
                    const a = i / n * Math.PI * 2;
                    ctx.fillRect(Math.round(e.x + Math.cos(a) * r), Math.round(e.y + Math.sin(a) * r * 0.8), 1, 1);
                }
                ctx.globalAlpha = 1;
                break;
            }
            case 'spore': {
                const r = e.r * u;
                ctx.fillStyle = Math.floor(e.t * 20) % 2 ? '#c8fc78' : '#f8f8b0';
                ctx.fillRect(Math.round(e.x + Math.cos(e.a) * r), Math.round(e.y + Math.sin(e.a) * r * 0.8 - u * 6), 1, 1);
                break;
            }
            case 'text':
                this.text(ctx, e.text, x, Math.round(y - u * 10), e.color, { align: 'center' });
                break;
            case 'heart': {
                ctx.globalAlpha = 1 - u;
                ctx.fillStyle = '#f85878';
                ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x - 1, y + 1, 3, 1); ctx.fillRect(x, y + 2, 1, 1);
                ctx.globalAlpha = 1;
                break;
            }
            case 'friend': {
                // A befriended monster bounces away happily
                const set = this.sprites.enemy(e.sprite);
                ctx.globalAlpha = 1 - u;
                ctx.drawImage(set.frames[0], x - 8 + Math.round(u * 20), Math.round(y - 10 - Math.abs(Math.sin(u * 9)) * 6));
                ctx.globalAlpha = 1;
                break;
            }
            case 'splash':
                ctx.fillStyle = '#fcfcfc';
                ctx.fillRect(x - 4 - Math.round(u * 3), y - Math.round(u * 4), 1, 1);
                ctx.fillRect(x + 4 + Math.round(u * 3), y - Math.round(u * 4), 1, 1);
                ctx.fillRect(x - 2, y - 2 - Math.round(u * 3), 1, 1);
                ctx.fillRect(x + 2, y - 2 - Math.round(u * 3), 1, 1);
                break;
            case 'drip':
                ctx.fillStyle = 'rgba(200,230,255,0.7)';
                ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1);
                break;
            case 'boom': {
                const r = 4 + u * 16;
                ctx.fillStyle = u < 0.3 ? '#fcfcfc' : u < 0.6 ? '#fce800' : '#f83800';
                for (let i = 0; i < 12; i++) {
                    const a = i / 12 * Math.PI * 2;
                    ctx.fillRect(Math.round(e.x + Math.cos(a) * r) - 2, Math.round(e.y + Math.sin(a) * r) - 2, 4, 4);
                }
                break;
            }
            case 'zzz':
                this.text(ctx, 'Z', x + Math.round(u * 6), Math.round(y - u * 10), '#fcfcfc');
                break;
            case 'fairyspin': {
                const h = this.hero;
                const a = e.a + e.t * 5, r = 14 - u * 6;
                ctx.drawImage(this.sprites.pickup(Math.floor(e.t * 8) % 2 ? 'fairy' : 'fairy2'), Math.round(h.x + Math.cos(a) * r) - 5, Math.round(h.y - 6 + Math.sin(a) * r * 0.6) - 5);
                break;
            }
            case 'flyshard': {
                const px = e.x + (e.tx - e.x) * u, py = e.y + (e.ty - e.y) * u - Math.sin(u * Math.PI) * 16;
                ctx.drawImage(this.sprites.pickup('shard'), Math.round(px) - 5, Math.round(py) - 5);
                break;
            }
            case 'firework': {
                const r = 28 * Math.sqrt(u);
                ctx.fillStyle = e.color;
                ctx.globalAlpha = 1 - u;
                ctx.fillRect(Math.round(e.x + Math.cos(e.a) * r), Math.round(e.y + Math.sin(e.a) * r + u * u * 10), 1, 1);
                ctx.globalAlpha = 1;
                break;
            }
            case 'spin': break;
            case 'chestOpen': this.drawChest(ctx, e.x, e.y, true); break;
        }
    }

    drawWeather(ctx) {
        for (const p of this.particles) {
            const x = Math.round(p.x), y = Math.round(p.y);
            switch (p.kind) {
                case 'snow': ctx.fillStyle = '#fcfcfc'; ctx.fillRect(x, y, p.s, p.s); break;
                case 'rain': ctx.fillStyle = 'rgba(180,210,255,0.75)'; ctx.fillRect(x, y, 1, 4); break;
                case 'petals': case 'leaves': ctx.fillStyle = p.c; ctx.fillRect(x, y, Math.sin(p.t * 5) > 0 ? 2 : 1, 1); break;
                case 'dust': ctx.fillStyle = 'rgba(232,200,140,0.7)'; ctx.fillRect(x, y, 2, 1); break;
                case 'spores': ctx.fillStyle = p.c; ctx.globalAlpha = 0.5 + Math.sin(p.t * 4) * 0.4; ctx.fillRect(x, y, 1, 1); ctx.globalAlpha = 1; break;
                case 'sprinkles': ctx.fillStyle = p.c; ctx.fillRect(x, y, 1, 2); break;
                case 'fog':
                    ctx.fillStyle = 'rgba(220,230,240,0.06)';
                    ctx.fillRect(x - p.r, y - p.r * 0.3, p.r * 2, p.r * 0.6);
                    ctx.fillRect(x - p.r * 0.7, y - p.r * 0.45, p.r * 1.4, p.r * 0.9);
                    break;
            }
        }
        if (this.weatherKind === 'rain') {
            ctx.fillStyle = 'rgba(20,30,70,0.12)';
            ctx.fillRect(0, 0, this.room.cols * 16, this.room.rows * 16);
        }
    }

    nightAmount() {
        if (this.config.dayNight === 'off') return 0;
        // dayClock: 0 dawn, .5 dusk; night spans roughly .55 -> .95
        const t = this.dayClock;
        const night = t < 0.5 ? 0 : t < 0.6 ? (t - 0.5) / 0.1 : t < 0.9 ? 1 : (1 - t) / 0.1;
        return Math.max(0, Math.min(1, night));
    }

    drawLighting(ctx) {
        const room = this.room, h = this.hero;
        let dark = 0, tint = '8,10,40';
        if (this.area.kind === 'overworld') dark = Math.min(0.8, this.nightAmount() * 0.68 + (this.roomBiome(room).dim || 0));
        else if (this.area.kind === 'dungeon' && room.dark) dark = 0.9;
        else if (this.area.kind === 'cave' && room.caveType !== 'house') dark = 0.35;
        if (dark < 0.02) return;
        const lc = this.lightCanvas, l = this.lightCtx;
        const W = room.cols * 16, H = room.rows * 16;
        l.setTransform(this.lightScale, 0, 0, this.lightScale, 0, 0);
        l.globalCompositeOperation = 'source-over';
        l.clearRect(0, 0, W, H);
        l.fillStyle = this.recolor(`rgba(${tint},${Math.min(0.92, dark)})`);
        l.fillRect(0, 0, W, H);
        l.globalCompositeOperation = 'destination-out';
        const hole = (x, y, r) => {
            // Three stepped rings rather than a gradient: it reads as pixel art
            for (const [k, a] of [[1, 0.35], [0.72, 0.45], [0.45, 0.8]]) {
                l.fillStyle = `rgba(0,0,0,${a})`;
                l.beginPath();
                l.arc(Math.round(x), Math.round(y), r * k, 0, Math.PI * 2);
                l.fill();
            }
        };
        const heroR = h.items.candle ? 64 : (this.area.kind === 'dungeon' ? 30 : 42);
        hole(h.x, h.y - 4, heroR + Math.sin(this.time * 7) * 1.2);
        for (const t of room.torches) hole(t.x * 16 + 8, t.y * 16 + 6, 36 + Math.sin(this.time * 9 + t.x) * 1.5);
        for (const e of this.enemies) if (e.def && e.def.glow) hole(e.x, e.y, 18);
        for (const c of this.critters) if (c.kind === 'firefly') hole(c.x, c.y, 10);
        for (const p of this.projectiles) if (p.type === 'fire' || p.type === 'star' || p.type === 'laser' || p.type === 'beam') hole(p.x, p.y, 12);
        for (const c of this.companions) {
            const cd = QuestArt.COMPANIONS[c.key];
            if (cd && cd.glow) hole(c.x, c.y - 10, 22);
        }
        if (room.structures) for (const s of room.structures) if (s.kind === 'house') hole(s.x * 16 + 24, s.y * 16 + 20, 20);
        if (room.pedestal) hole(room.pedestal.x * 16 + 8, room.pedestal.y * 16 + 8, 22);
        ctx.drawImage(lc, 0, 0, W, H);
    }

    drawThought(ctx) {
        const h = this.hero;
        if (!h.thought || this.mode === 'story') return;
        const text = h.thought.text.toUpperCase();
        const w = text.length * 4 + 5, H = 11;
        const RW = this.room.cols * 16;
        let x = Math.round(h.x - w / 2), y = Math.round(h.y - 34);
        x = Math.max(2, Math.min(RW - w - 2, x));
        if (y < 2) y = Math.round(h.y + 12);
        ctx.fillStyle = '#140c1c';
        ctx.fillRect(x - 1, y, w + 2, H);
        ctx.fillRect(x, y - 1, w, H + 2);
        ctx.fillStyle = '#fcfcfc';
        ctx.fillRect(x, y, w, H);
        ctx.fillStyle = '#140c1c';
        const tx = Math.max(x + 3, Math.min(x + w - 4, Math.round(h.x)));
        if (y < h.y) { ctx.fillRect(tx - 1, y + H + 1, 3, 1); ctx.fillRect(tx, y + H + 2, 1, 1); ctx.fillStyle = '#fcfcfc'; ctx.fillRect(tx, y + H, 1, 1); }
        this.text(ctx, text, x + 3, y + 3, '#140c1c', { shadow: false });
    }

    drawPaused(ctx) {
        const L = this.layout;
        const RW = L.cols * 16, RH = L.rows * 16;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#140c1c';
        ctx.fillRect(0, L.roomY, RW, RH);
        ctx.globalAlpha = 1;
        this.text(ctx, 'PAUSED', RW / 2, L.roomY + RH / 2 - 8, '#fcfcfc', { align: 'center' });
        // Whichever way they paused is the way they will look to resume
        const how = this.config.keyboard ? 'ENTER TO RESUME' : 'TAP PLAY TO RESUME';
        this.text(ctx, how, RW / 2, L.roomY + RH / 2 + 2, '#a8a8b4', { align: 'center' });
    }

    drawBanner(ctx) {
        const b = this.banner, L = this.layout;
        const a = b.t < 0.4 ? b.t / 0.4 : b.t > b.dur - 0.6 ? (b.dur - b.t) / 0.6 : 1;
        const RW = L.cols * 16;
        const w = Math.max(b.text.length, b.sub ? b.sub.length : 0) * 4 + 12;
        const hgt = b.sub ? 19 : 11;
        const x = Math.round(RW / 2 - w / 2), y = L.roomY + 6;
        ctx.globalAlpha = Math.max(0, a) * 0.85;
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, y, w, hgt);
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = '#fcfcfc';
        ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + hgt - 1, w, 1);
        this.text(ctx, b.text, RW / 2, y + 3, '#fcfcfc', { align: 'center' });
        if (b.sub) this.text(ctx, b.sub, RW / 2, y + 11, '#fce800', { align: 'center' });
        ctx.globalAlpha = 1;
    }

    wrapText(text, maxChars) {
        const words = text.split(' '), lines = [];
        let cur = '';
        for (const w of words) {
            if ((cur + ' ' + w).trim().length > maxChars) { if (cur) lines.push(cur); cur = w; }
            else cur = (cur + ' ' + w).trim();
        }
        if (cur) lines.push(cur);
        return lines;
    }

    drawDialog(ctx) {
        const d = this.dialog, L = this.layout;
        const RW = L.cols * 16;
        const maxChars = Math.floor((RW - 24) / 4);
        const lines = this.wrapText(d.text, Math.min(maxChars, 40));
        let shown = Math.floor(d.shown);
        const w = Math.min(RW - 8, Math.max(...lines.map(l => l.length)) * 4 + 14);
        const hgt = lines.length * 7 + 8;
        const x = Math.round(RW / 2 - w / 2);
        // Cave text sits at the top like the original; signs pop up near the bottom
        const y = d.sign ? L.roomY + L.rows * 16 - hgt - 6 : L.roomY + (this.area.kind === 'cave' ? 2 : 20);
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, y, w, hgt);
        ctx.fillStyle = '#fcfcfc';
        ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + hgt - 2, w - 2, 1);
        ctx.fillRect(x + 1, y + 1, 1, hgt - 2); ctx.fillRect(x + w - 2, y + 1, 1, hgt - 2);
        lines.forEach((ln, i) => {
            const part = ln.slice(0, Math.max(0, shown));
            shown -= ln.length + 1;
            this.text(ctx, part, x + 7, y + 4 + i * 7, '#fcfcfc', { shadow: false });
        });
    }

    drawItemGet(ctx) {
        const ig = this.itemget, L = this.layout, RW = L.cols * 16;
        const y = L.roomY + 20;
        const lines = ['YOU GOT ' + (ig.name.startsWith('A ') || ig.name.startsWith('PIECE') ? ig.name : 'THE ' + ig.name) + (ig.name.endsWith('!') ? '' : '!')];
        if (ig.desc) lines.push(...this.wrapText(ig.desc, 40));
        const w = Math.max(...lines.map(l => l.length)) * 4 + 14;
        const hgt = lines.length * 7 + 8;
        const x = Math.round(RW / 2 - w / 2);
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, y, w, hgt);
        ctx.fillStyle = '#fce800';
        ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + hgt - 2, w - 2, 1);
        lines.forEach((ln, i) => this.text(ctx, ln, RW / 2, y + 4 + i * 7, i ? '#c8c8c8' : '#fcfcfc', { align: 'center', shadow: false }));
    }

    drawDeath(ctx) {
        const d = this.death, L = this.layout, RW = L.cols * 16, RH = L.rows * 16;
        const a = Math.min(1, d.t / 1.2);
        ctx.fillStyle = `rgba(120,0,20,${a * 0.45})`;
        ctx.fillRect(0, L.roomY, RW, RH);
        if (d.t > 2) {
            ctx.fillStyle = `rgba(0,0,0,${Math.min(0.85, (d.t - 2) * 0.8)})`;
            ctx.fillRect(0, L.roomY, RW, RH);
        }
        if (d.text) {
            this.text(ctx, d.text, RW / 2, L.roomY + RH / 2 - 6, '#fcfcfc', { align: 'center' });
            if (d.sub) this.text(ctx, d.sub, RW / 2, L.roomY + RH / 2 + 4, '#fce800', { align: 'center' });
        }
    }

    drawWarp(ctx) {
        const w = this.warp, L = this.layout, RW = L.cols * 16, RH = L.rows * 16;
        const u = Math.min(1, w.t / w.dur);
        const closed = w.phase === 'out' ? u : 1 - u;
        if (w.style === 'fade') {
            ctx.fillStyle = `rgba(0,0,0,${closed})`;
            ctx.fillRect(0, L.roomY, RW, RH);
            return;
        }
        // Iris wipe centred on the hero, drawn in chunky pixels
        const h = this.hero;
        const maxR = Math.hypot(RW, RH);
        const r = maxR * (1 - closed);
        const cx = h.x, cy = h.y + L.roomY - 4;
        ctx.fillStyle = '#000';
        const step = 2;
        for (let y = L.roomY; y < L.roomY + RH; y += step) {
            const dy = y + step / 2 - cy;
            if (Math.abs(dy) >= r) { ctx.fillRect(0, y, RW, step); continue; }
            const dx = Math.sqrt(r * r - dy * dy);
            ctx.fillRect(0, y, Math.max(0, Math.round(cx - dx)), step);
            ctx.fillRect(Math.round(cx + dx), y, RW, step);
        }
        if (w.style === 'spiral' && closed > 0.2) {
            ctx.fillStyle = '#fcfcfc';
            for (let i = 0; i < 8; i++) {
                const a = i / 8 * Math.PI * 2 + this.time * 8;
                ctx.fillRect(Math.round(cx + Math.cos(a) * r * 0.9), Math.round(cy + Math.sin(a) * r * 0.9), 1, 1);
            }
        }
    }

    drawStory(ctx) {
        const s = this.story, L = this.layout, RW = L.lowW;
        const total = s.lines.join('').length;
        let shown = Math.floor((s.t - 0.8) * 22);
        const top = Math.round(L.lowH / 2 - s.lines.length * 4.5);
        s.lines.forEach((ln, i) => {
            const part = ln.slice(0, Math.max(0, Math.min(ln.length, shown)));
            shown -= ln.length;
            const col = i === s.lines.length - 1 ? '#fce800' : '#fcfcfc';
            this.text(ctx, part, RW / 2 - ln.length * 2, top + i * 9, col, { shadow: false });
        });
        // The hero waits in the corner, tapping a foot
        const h = this.hero;
        const set = this.sprites.hero(h.key, h.variant, this.config.hat);
        ctx.drawImage(set.down[Math.floor(s.t * 2) % 2], RW / 2 - 8, top + s.lines.length * 9 + 6);
        if (s.t > s.dur - 0.8) {
            ctx.fillStyle = `rgba(0,0,0,${(s.t - (s.dur - 0.8)) / 0.8})`;
            ctx.fillRect(0, 0, RW, L.lowH);
        }
        void total;
    }

    drawCredits(ctx) {
        const e = this.ending, L = this.layout, RW = L.lowW;
        const lines = this.creditLines();
        const scroll = e.t * 18;
        lines.forEach((ln, i) => {
            const y = Math.round(L.lowH + 10 + i * 10 - scroll);
            if (y < -8 || y > L.lowH + 8) return;
            const col = i === 0 ? '#fce800' : ln.includes('....') ? '#c8c8c8' : '#fcfcfc';
            this.text(ctx, ln, RW / 2, y, col, { align: 'center', shadow: false });
        });
        // The hero and friend parade across the bottom
        const h = this.hero;
        const set = this.sprites.hero(h.key, h.variant, this.config.hat);
        const x = ((e.t * 30) % (RW + 40)) - 20;
        ctx.drawImage(set.right[Math.floor(e.t * 7) % 2], Math.round(x), L.lowH - 24);
        this.companions.forEach((c, i) => {
            const cd = QuestArt.COMPANIONS[c.key];
            if (!cd || !cd.frames) return;
            const cs = this.sprites.companion(c.key);
            ctx.drawImage(cs.frames[Math.floor(e.t * 6 + i) % 2], Math.round(x - 14 - i * 12), L.lowH - 16 - (cd.fly ? 8 + Math.sin(e.t * 4 + i) * 2 : 0));
        });
    }

    // -----------------------------------------------------------------------
    // HUD: hearts, money, keys, bombs, shards and a minimap
    // -----------------------------------------------------------------------
    drawHUD(ctx) {
        const L = this.layout, h = this.hero, y0 = L.hudY, RW = L.lowW;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, y0, RW, L.hudH);
        if (!h || this.mode === 'story' || (this.mode === 'ending' && this.ending.phase === 'credits')) return;

        // Hearts: two rows of up to eight
        const hearts = Math.ceil(h.maxHp / 2);
        const perRow = 8;
        for (let i = 0; i < hearts; i++) {
            const v = h.hp - i * 2;
            const icon = v >= 2 ? 'heart' : v === 1 ? 'heartHalf' : 'heartEmpty';
            const x = 4 + (i % perRow) * 8, y = y0 + (i < perRow ? 1 : 8);
            if (Math.ceil(h.hp) > 0 && h.hp <= 2 && v > 0 && Math.floor(this.time * 4) % 2) continue;
            ctx.drawImage(this.sprites.icon(icon), x, y);
        }
        let x = 4 + Math.min(hearts, perRow) * 8 + 6;

        // Money, keys, bombs
        const cur = QuestEngineData.CURRENCY_ICON[h.def.currency] || 'gem';
        ctx.drawImage(this.sprites.icon(cur), x, y0 + 1);
        this.text(ctx, '*' + h.money, x + 9, y0 + 2, '#fcfcfc', { shadow: false });
        ctx.drawImage(this.sprites.icon('key'), x, y0 + 8);
        this.text(ctx, '*' + h.keys, x + 9, y0 + 9, '#fcfcfc', { shadow: false });
        x += 30;
        if (h.items.bombs) {
            ctx.drawImage(this.sprites.icon('bomb'), x, y0 + 1);
            this.text(ctx, '*' + h.bombs, x + 9, y0 + 2, '#fcfcfc', { shadow: false });
        }
        if (h.potion) {
            ctx.drawImage(this.sprites.icon('potion'), x, y0 + 8);
            if (h.potion > 1) this.text(ctx, '*' + h.potion, x + 9, y0 + 9, '#fcfcfc', { shadow: false });
        }
        x += 26;

        // Shards collected
        const total = this.world.totalShards;
        const mapW = this.config.minimap ? this.minimapWidth() + 6 : 0;
        if (total > 0 && x + total * 7 < RW - mapW) {
            for (let i = 0; i < total; i++) ctx.drawImage(this.sprites.icon(i < h.shards ? 'shard' : 'shardEmpty'), x + i * 7, y0 + 4);
            x += total * 7 + 4;
        }
        // Items owned, small
        const owned = QuestEngineData.UPGRADE_ORDER.filter(u => h.items[u] && u !== 'bombs');
        if (owned.length && x + owned.length * 9 < RW - mapW - 4) {
            owned.forEach((u, i) => ctx.drawImage(this.sprites.icon(QuestEngineData.ITEM_INFO[u].icon), x + i * 9, y0 + 4));
        }
        if (this.config.minimap) this.drawMinimap(ctx, RW - this.minimapWidth() - 3, y0 + 1);
    }

    minimapWidth() {
        const a = this.area && this.area.kind !== 'cave' ? this.area : this.world.overworld;
        return a.RX * 4;
    }

    drawMinimap(ctx, x0, y0) {
        let area = this.area;
        if (area.kind === 'cave') area = this.world.overworld;
        const cw = 4, ch = Math.min(3, Math.floor(14 / area.RY));
        ctx.fillStyle = area.kind === 'dungeon' ? '#1c1c3c' : '#2c3c24';
        ctx.fillRect(x0 - 1, y0 - 1, area.RX * cw + 1, area.RY * ch + 1);
        const blink = Math.floor(this.time * 3) % 2;
        const cur = this.area.kind === 'cave' ? this.world.overworld.rooms[this.area.parent.ry][this.area.parent.rx] : this.room;
        for (let ry = 0; ry < area.RY; ry++) for (let rx = 0; rx < area.RX; rx++) {
            const r = area.rooms[ry][rx];
            if (!r) continue;
            let col = null;
            if (r.visited) col = area.kind === 'dungeon' ? '#5888f8' : '#7cb84c';
            if (area.kind === 'overworld' && r.kind === 'start') col = '#fcc800';
            if (r.visited && r.portals && r.portals.some(p => p.kind === 'dungeon' && !this.world.dungeons[p.dungeon].completed)) col = '#f83838';
            if (area.kind === 'dungeon' && r.kind === 'boss' && (r.visited || this.hero.keys > 0)) col = r.bossDefeated ? '#5888f8' : '#f83838';
            if (r === cur && blink) col = '#fcfcfc';
            if (!col) continue;
            ctx.fillStyle = col;
            ctx.fillRect(x0 + rx * cw, y0 + ry * ch, cw - 1, ch - 1);
        }
    }

    // -----------------------------------------------------------------------
    // Text
    // -----------------------------------------------------------------------
    text(ctx, str, x, y, color = '#fcfcfc', opts = {}) {
        str = String(str).toUpperCase();
        const w = str.length * 4 - 1;
        if (opts.align === 'center') x = Math.round(x - w / 2);
        x = Math.round(x); y = Math.round(y);
        if (opts.shadow !== false) this.textRaw(ctx, str, x + 1, y + 1, '#140c1c');
        this.textRaw(ctx, str, x, y, color);
    }

    textRaw(ctx, str, x, y, color) {
        const atlas = this.sprites.font(color);
        for (let i = 0; i < str.length; i++) {
            const gi = atlas.index[str[i]];
            if (gi === undefined) continue;
            ctx.drawImage(atlas, gi * 4, 0, 3, 5, x + i * 4, y, 3, 5);
        }
    }

    // -----------------------------------------------------------------------
    // Palette filters and CRT
    // -----------------------------------------------------------------------
    // Palettes (SPEC §4.8). Rather than read every frame back and recolour
    // it, the game draws through a stand-in for its context that recolours
    // what goes in: fill colours through the palette's lookup, and each
    // sprite, font and room canvas once, the first time it's drawn. The
    // light map changes every frame, so only its tint is recoloured.
    paletteContext() {
        const key = this.config.palette;
        const f = QuestEngineData.FILTERS[key];
        if (!f || key === 'none') {
            this._palette = null;
            return this.lctx;
        }
        if (this._palette && this._palette.key === key && this._palette.real === this.lctx) return this._palette.ctx;
        this._lut = new Map();
        this._ramp = f.ramp ? f.ramp.map(QuestArt.hexToRgb) : null;
        this._near = f.nearest ? f.nearest.map(QuestArt.hexToRgb) : null;
        const real = this.lctx, sheets = new WeakMap(), methods = new Map();
        const drawImage = (src, ...rest) => real.drawImage(src === this.lightCanvas ? src : this.paletteSheet(src), ...rest);
        const ctx = new Proxy(real, {
            get: (target, name) => {
                if (name === 'drawImage') return drawImage;
                const value = target[name];
                if (typeof value !== 'function') return value;
                if (!methods.has(name)) methods.set(name, value.bind(target));
                return methods.get(name);
            },
            set: (target, name, value) => {
                target[name] = name === 'fillStyle' || name === 'strokeStyle' ? this.recolor(value) : value;
                return true;
            },
        });
        this._palette = { key, real, ctx, sheets, colors: new Map() };
        return ctx;
    }

    // A CSS colour (hex or rgb[a]) in the current palette; anything else as is.
    recolor(css) {
        const p = this._palette;
        if (!p || typeof css !== 'string') return css;
        let out = p.colors.get(css);
        if (out !== undefined) return out;
        const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css);
        const rgb = !hex && /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(css);
        if (hex || rgb) {
            const [r, g, b] = hex ? QuestArt.hexToRgb(css) : [+rgb[1], +rgb[2], +rgb[3]];
            const v = this.paletteRgb(r, g, b);
            out = `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${rgb && rgb[4] !== undefined ? rgb[4] : 1})`;
        } else out = css;
        // Fades make one-off alphas; keep the cache from growing forever
        if (p.colors.size > 4000) p.colors.clear();
        p.colors.set(css, out);
        return out;
    }

    paletteRgb(r, g, b) {
        const k = (r << 16) | (g << 8) | b;
        let v = this._lut.get(k);
        if (v === undefined) {
            v = this.mapColor(this._palette.key, r, g, b);
            this._lut.set(k, v);
        }
        return v;
    }

    // A canvas recoloured into the palette, made once and kept.
    paletteSheet(src) {
        const sheets = this._palette.sheets;
        let out = sheets.get(src);
        if (out) return out;
        if (!src.width || !src.height || !src.getContext) return src;
        out = document.createElement('canvas');
        out.width = src.width;
        out.height = src.height;
        const c = out.getContext('2d', { willReadFrequently: true });
        c.drawImage(src, 0, 0);
        const img = c.getImageData(0, 0, out.width, out.height), d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            if (!d[i + 3]) continue;
            const v = this.paletteRgb(d[i], d[i + 1], d[i + 2]);
            d[i] = (v >> 16) & 255; d[i + 1] = (v >> 8) & 255; d[i + 2] = v & 255;
        }
        c.putImageData(img, 0, 0);
        sheets.set(src, out);
        return out;
    }

    mapColor(key, r, g, b) {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const pack = (R, G, B) => (Math.max(0, Math.min(255, Math.round(R))) << 16) | (Math.max(0, Math.min(255, Math.round(G))) << 8) | Math.max(0, Math.min(255, Math.round(B)));
        if (this._ramp) {
            const i = Math.min(3, Math.floor(lum / 256 * 4.2));
            const c = this._ramp[i];
            return pack(c[0], c[1], c[2]);
        }
        if (this._near) {
            let best = this._near[0], bd = Infinity;
            for (const c of this._near) {
                const dd = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
                if (dd < bd) { bd = dd; best = c; }
            }
            return pack(best[0], best[1], best[2]);
        }
        switch (key) {
            case 'pastel': return pack(r + (255 - r) * 0.38, g + (255 - g) * 0.38, b + (255 - b) * 0.42);
            case 'sepia': return pack(lum * 1.07 + 20, lum * 0.95 + 8, lum * 0.72);
            case 'noir': { const v = Math.max(0, Math.min(255, (lum - 128) * 1.35 + 128)); return pack(v, v, v); }
            case 'sunset': return pack(r * 1.05 + 30, g * 0.88 + 12, b * 0.7 + 18);
        }
        return pack(r, g, b);
    }

    drawCRT(out, v) {
        if (!this.crtCanvas || this.crtCanvas.width !== this.canvas.width || this.crtCanvas.height !== this.canvas.height) {
            const cv = document.createElement('canvas');
            cv.width = this.canvas.width;
            cv.height = this.canvas.height;
            const c = cv.getContext('2d');
            // Scanlines, one per game pixel row
            const s = v.s;
            c.fillStyle = 'rgba(0,0,0,0.22)';
            for (let y = v.y; y < v.y + v.h; y += s) c.fillRect(v.x, Math.round(y + s * 0.62), v.w, Math.max(1, Math.round(s * 0.3)));
            const g = c.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.35, cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.75);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, 'rgba(0,0,0,0.55)');
            c.fillStyle = g;
            c.fillRect(0, 0, cv.width, cv.height);
            this.crtCanvas = cv;
        }
        out.drawImage(this.crtCanvas, 0, 0);
    }

    defaults() {
        return WP.settings.defaults();
    }

    // Settings from the panel: applied without starting a new world, unless
    // a world setting changed (applyConfig decides).
    applySettings(next) {
        this.applyConfig(next, false);
    }

    applyConfig(next, forceNew) {
        const before = { ...this.config };
        Object.assign(this.config, next);
        this.saveConfig();
        if (!this.isEnabled) return;
        const worldKeys = ['worldSize', 'worldTheme', 'dungeonCount', 'cowLevel', 'roomSize', 'seed', 'difficulty', 'enemyDensity'];
        const rebuild = forceNew || worldKeys.some(k => before[k] !== this.config[k]) || before.hud !== this.config.hud && (before.hud === 'off' || this.config.hud === 'off');
        if (before.hud !== this.config.hud) { this.computeLayout(); this.sizeCanvases(); }
        if (['touchControls', 'touchScale', 'touchPosition', 'touchSwap'].some(k => before[k] !== this.config[k])) this.setupTouchControls();
        if (rebuild) {
            const keep = !forceNew || this.config.hero !== 'random';
            this.hero = keep ? this.hero : null;
            this.newQuest({ keepHero: false });
            return;
        }
        if (['hero', 'heroVariant', 'hat', 'companion', 'heroName'].some(k => before[k] !== this.config[k])) this.applyHeroLook();
        if (before.weather !== this.config.weather || before.critters !== this.config.critters) this.setupWeather();
        this.crtCanvas = null;
        this.setupInteraction();
        this.renderRoom();
    }
}

if (typeof module !== 'undefined') module.exports = { QuestAnimationManager, QuestSpriteBank, QuestEngineData };
