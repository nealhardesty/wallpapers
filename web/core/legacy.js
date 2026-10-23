// Moving settings over from the old homepage (SPEC §7.3). The homepage kept
// each wallpaper's whole config under its own key (fishtankConfig, …) and
// saved all of it on Apply, homepage defaults included. So an import keeps
// only what differs from the homepage's own defaults (what someone actually
// changed) and lays that over today's defaults, fitted to today's controls.
// Pure logic, loaded by the panel only when importing; the unit tests run it.
//
//   WP.importLegacy(storage, { defaultsOf, schemaOf, usable })
//     storage: the old localStorage, as { key: string }
//     → { entries: { 'wp:…': value }, report: { wallpapers, settings, current, skipped, leftBehind } }

(function (WP) {
    'use strict';

    // Each legacy key's wallpaper, and the defaults it started with: read
    // by running every module as imported (commit 1be86ff) in headless
    // Chrome. Snow's lived in the homepage itself (its Reset values); the
    // standalone quest page had its own key and defaults.
    const ID = {
        rainConfig: 'rain', leavesConfig: 'leaves', firefliesConfig: 'fireflies', fireplaceConfig: 'fireplace',
        northernLightsConfig: 'northern-lights', parallaxCloudsConfig: 'parallax-clouds', mountainsConfig: 'mountains',
        starfieldConfig: 'starfield', cherryBlossomConfig: 'cherry-blossoms', halloweenConfig: 'halloween', nekoConfig: 'neko',
        matrixConfig: 'matrix', fishtankConfig: 'fishtank', adventConfig: 'advent', questConfig: 'quest',
        questStandaloneConfig: 'quest', snowConfig: 'snow', wallpaperConfig: 'bing',
    };
    const DEFAULTS = {
        rainConfig: {"configVersion":2,"maxRaindrops":400,"spawnRate":2.6,"dropSpeed":12,"dropSpeedVariation":6,"dropLength":20,"dropWidth":2,"windChance":0.001,"windIntensity":8,"windDuration":180,"puddleRate":0.3,"maxPuddles":50,"splashRate":0.8,"rainOpacity":0.7,"puddleOpacity":0.4,"lightning":true,"lightningChance":0.07,"groundMist":true,"statusBarHeight":44},
        leavesConfig: {"configVersion":3,"collectLeaves":true,"preSeedPile":true,"maxSettled":14000,"pileDepth":0.2,"pileUnevenness":0.6,"pileDensity":1.5,"statusBarHeight":44,"maxLeaves":80,"spawnRate":0.06,"fallSpeed":2,"fallSpeedVariation":1.5,"swayAmount":1.5,"windChance":0.003,"windIntensity":12,"windDuration":240,"leafTypes":["maple","oak","birch","elm"],"seasonalColors":"autumn","leafOpacity":0.85,"leafSizeVariation":0.4},
        firefliesConfig: {"configVersion":2,"maxFireflies":200,"spawnRate":0.05,"baseSpeed":0.8,"speedVariation":0.6,"glowSize":4,"glowIntensity":0.9,"flashPeriod":1.9,"flashPeriodVariation":0.3,"flashWidth":0.17,"emberGlow":0.2,"synchronize":true,"syncStrength":0.25,"syncRadius":240,"fadeInTime":180,"fadeOutTime":120,"lifespan":1800,"lifespanVariation":600,"directionChangeRate":0.01,"groupingTendency":0.002,"avoidanceRadius":40,"attractionRadius":80,"colorScheme":"classic","brightness":0.8,"tailLength":0.4},
        fireplaceConfig: {"configVersion":1,"intensity":1,"flameHeight":1.5,"flameSpread":1,"flameDensity":1,"turbulence":1,"flickerAmount":0.55,"flickerSpeed":1,"draftStrength":0.35,"palette":"hardwood","heat":1,"flameOpacity":1,"showLogs":true,"logCount":4,"logScale":1,"logThickness":2.5,"emberGlow":1,"coalCount":660,"popEvents":true,"popRate":1,"roomGlow":1,"glowRadius":1,"backgroundDarkness":0.88,"brickBackground":"none","sparks":true,"sparkRate":1,"smoke":true,"smokeOpacity":0.22,"companion":"none","companionActivity":3,"decorations":"none","maxParticles":1400,"softness":2,"statusBarHeight":44},
        northernLightsConfig: {"configVersion":3,"curtainCount":3,"brightness":1,"colorScheme":"classic","curtainHeight":1,"rayDensity":1,"foldAmount":1,"driftSpeed":1,"shimmerSpeed":1,"substorms":true,"activity":0.5,"bloom":0.9,"starCount":260,"starBrightness":0.8,"horizon":0.76,"silhouette":true,"reflection":true},
        parallaxCloudsConfig: {"layerCount":4,"cloudDensity":0.7,"baseSpeed":0.3,"speedMultiplier":1.5,"cloudScale":1,"colorTheme":"classic_mario","pixelSize":4,"smoothing":false,"windVariation":0.2,"verticalFloat":0.3,"floatSpeed":0.01},
        mountainsConfig: {"configVersion":2,"layers":4,"mountainsPerLayer":3,"baseSpeed":0.4,"speedMultiplier":0.6,"colorPalette":"blue","invertPalette":false,"mountainHeight":0.55,"heightVariation":0.35,"peakiness":0.55,"ridgeLines":true,"snowCaps":true},
        starfieldConfig: {"configVersion":2,"warpSpeed":3,"baseStarCount":260,"maxStarCount":900,"starSize":2,"trailLength":0.6,"galaxyApproachEnabled":true,"galaxyApproachDuration":60000,"colorMode":"realistic","densityMode":"uniform","twinkle":true,"milkyWay":true},
        cherryBlossomConfig: {"petalCount":150,"fallSpeed":1.5,"windChance":0.003,"windStrength":3,"windDuration":180,"swayAmount":2,"petalSize":1,"showBranches":true,"branchCount":8,"petalColors":["#ffb7c5","#ffc0cb","#ff69b4","#ffd1dc","#ffe4e1"],"fadeEnabled":true,"rotationSpeed":1},
        halloweenConfig: {"configVersion":4,"theme":"classic","scenePreset":"graveyard","castle":true,"castleSize":1,"grass":true,"sceneSeed":0,"horizon":0.62,"statusBarHeight":44,"parallax":1,"pumpkinCount":14,"pumpkinSize":1,"litFraction":0.8,"flicker":1,"lightIntensity":1,"faceLight":true,"breathing":true,"moon":true,"moonPhase":0.82,"starCount":240,"cloudBands":true,"fog":true,"fogDensity":0.8,"lightning":true,"lightningRate":1,"wind":1,"bats":true,"batCount":36,"ghosts":true,"ghostCount":5,"zombies":true,"zombieCount":4,"spiders":true,"webs":false,"webCount":5,"webOpacity":0.3,"webSag":1,"dew":true,"candyCount":40,"candyFallSpeed":2,"candySize":1,"fallingLeaves":true,"leafCount":40,"quality":"auto","bloom":true,"bloomStrength":1,"vignette":true,"grain":0.35,"interactive":true,"clickToToggle":true},
        nekoConfig: {"theme":"neko","speed":3,"size":32,"idleTimeout":5000,"sleepTimeout":15000,"animationSpeed":8,"enableSounds":false},
        matrixConfig: {"speed":0.75,"fontSize":14,"theme":"classic","density":0.98,"fadeTrails":true,"characterChangeRate":0.1,"tailLength":0.15},
        fishtankConfig: {"configVersion":1,"fishCount":22,"population":"community","swimSpeed":1,"schooling":1,"waterTheme":"planted","waterLevel":0.055,"plantDensity":1,"foregroundPlants":true,"hardscape":"both","snail":true,"statusBarHeight":44,"quality":"auto","lightIntensity":1,"causticStrength":1,"godRays":true,"depthBlur":true,"bubbleRate":1,"motes":true,"cursorMode":"curious","clickToFeed":true},
        adventConfig: {"configVersion":1,"themeByMonth":{},"holidayThemes":true,"holidayStars":true,"layout":"scatter","ceremony":"grand","spotlightSeconds":8,"catchUp":true,"particles":true,"particleAmount":1,"ambient":"lively","fps":30,"quality":"high","statusBarHeight":44},
        questConfig: {"configVersion":1,"hero":"cat","heroVariant":0,"hat":"none","companion":"fairy","heroName":"","worldSize":"medium","worldTheme":"mixed","dungeonCount":3,"cowLevel":"sometimes","roomSize":"classic","seed":0,"difficulty":"normal","enemyDensity":1,"gameSpeed":1,"palette":"none","crt":false,"dayNight":"normal","weather":true,"critters":true,"hud":"top","minimap":true,"thoughts":true,"dialogue":true,"story":true,"transition":"scroll","dim":0.2,"fpsCap":60,"statusBarHeight":44,"keyboard":false,"clickToGuide":false,"touchControls":false,"touchScale":1,"touchPosition":"bottom","touchSwap":false},
        questStandaloneConfig: {"configVersion":1,"hero":"random","heroVariant":0,"hat":"none","companion":"fairy","heroName":"","worldSize":"medium","worldTheme":"mixed","dungeonCount":3,"cowLevel":"sometimes","roomSize":"classic","seed":0,"difficulty":"normal","enemyDensity":1,"gameSpeed":1,"palette":"none","crt":false,"dayNight":"normal","weather":true,"critters":true,"hud":"top","minimap":true,"thoughts":true,"dialogue":true,"story":true,"transition":"scroll","dim":0,"fpsCap":60,"statusBarHeight":0,"keyboard":true,"clickToGuide":true,"touchControls":false,"touchScale":1,"touchPosition":"bottom","touchSwap":false},
        snowConfig: {"treeCount":10,"treeScale":1,"maxSnowflakes":100,"spawnRate":0.1,"snowSpeed":7.5,"snowSpeedVariation":4,"layerCount":5,"windChance":0.002,"windIntensity":15,"windDuration":300,"windPhaseInDuration":120,"windPhaseOutDuration":120,"accumulationRate":0.5,"maxAccumulation":80,"statusBarHeight":36},
        wallpaperConfig: {"bingOffset":0},
    };

    // Per-wallpaper state that isn't a setting, kept as raw strings back then.
    const STATE = { adventCelebrated: ['advent', 'adventCelebrated'], adventLastSeen: ['advent', 'adventLastSeen'] };

    // Neko's third-party sprite themes became coats drawn in code.
    const COATS = {
        black: 'black', black2: 'black', orange: 'orange', marmalade: 'orange', gray: 'gray', silver: 'gray',
        silversky: 'gray', tabby: 'gray', 'blue-tabby': 'gray', calico: 'calico', 'calico-tabby': 'calico', socks: 'tuxedo',
    };
    const RENAMES = { nekoConfig: { theme: value => COATS[value] && { coat: COATS[value] } } };

    // What the homepage kept that has no place here.
    const LEFT_BEHIND = { customLinks: 'links', hidePageElements: 'hide mode' };

    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const parse = text => { try { return typeof text === 'string' ? JSON.parse(text) : text; } catch { return undefined; } };
    const decimals = n => (String(n).split('.')[1] || '').length;
    const isColor = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

    // A legacy value as today's control would hold it, or undefined if it
    // can't be: out-of-range numbers are clamped and snapped to the step;
    // anything else must already be valid.
    WP.fitSetting = (control, value, config = {}) => {
        if (!control) return undefined;
        switch (control.type) {
            case 'range':
            case 'number': {
                if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
                const min = control.min ?? -Infinity, max = control.max ?? Infinity, step = control.step ?? 1;
                const base = Number.isFinite(min) ? min : 0;
                const snapped = base + Math.round((Math.min(max, Math.max(min, value)) - base) / step) * step;
                return Number(Math.min(max, snapped).toFixed(Math.max(decimals(step), decimals(base))));
            }
            case 'select': {
                const options = typeof control.options === 'function' ? control.options(config) : control.options;
                return options.some(([v]) => same(v, value)) ? value : undefined;
            }
            case 'toggle': return typeof value === 'boolean' ? value : undefined;
            case 'multi': {
                if (!Array.isArray(value)) return undefined;
                const kept = control.options.map(([v]) => v).filter(v => value.includes(v));
                return kept.length ? kept : undefined;
            }
            case 'colors': return Array.isArray(value) && value.length && value.length <= 8 && value.every(isColor) ? value : undefined;
            case 'color': return isColor(value) ? value : undefined;
            default: return typeof value === 'string' ? value : undefined;
        }
    };

    // One legacy config → today's overrides for its wallpaper.
    function convert(key, stored, defaults, schema) {
        const legacy = DEFAULTS[key];
        // The homepage itself ignored a config from another version.
        if (!stored || typeof stored !== 'object' || (stored.configVersion ?? null) !== (legacy.configVersion ?? null)) return { overrides: {}, skipped: [] };
        const changed = {};
        for (const [name, value] of Object.entries(stored)) {
            if (name === 'configVersion' || same(value, legacy[name])) continue;
            const renamed = RENAMES[key]?.[name];
            if (renamed) Object.assign(changed, renamed(value) || {});
            else changed[name] = value;
        }
        const overrides = {}, skipped = [];
        const controls = (schema || []).filter(c => c.key);
        for (const [name, value] of Object.entries(changed)) {
            if (!(name in defaults)) { skipped.push(name); continue; }
            const control = controls.find(c => c.key === name && !c.set);
            // Settings the panel shows in an unusual way: same shape as the default.
            const fitted = control ? WP.fitSetting(control, value, { ...defaults, ...changed })
                : typeof value === typeof defaults[name] && Array.isArray(value) === Array.isArray(defaults[name]) ? value : undefined;
            if (fitted === undefined) skipped.push(name);
            else if (!same(fitted, defaults[name])) overrides[name] = fitted;
        }
        return { overrides, skipped };
    }

    WP.importLegacy = (storage, { defaultsOf, schemaOf, usable }) => {
        const entries = {}, wallpapers = [], skipped = [], leftBehind = [];
        let settings = 0, current = null;
        // The homepage's own quest wins over the standalone page's.
        const keys = Object.keys(storage).filter(k => k !== 'questStandaloneConfig' || !('questConfig' in storage));
        for (const key of keys) {
            const id = ID[key];
            if (id) {
                const defaults = defaultsOf(id);
                if (!defaults) continue;
                const { overrides, skipped: dropped } = convert(key, parse(storage[key]), defaults, schemaOf(id));
                skipped.push(...dropped.map(name => `${id}.${name}`));
                const diff = WP.diffSettings(defaults, { ...defaults, ...overrides });
                if (diff) {
                    entries[`wp:${id}`] = diff;
                    wallpapers.push(id);
                    settings += Object.keys(diff).length - 1;
                }
            } else if (STATE[key]) {
                const [stateId, name] = STATE[key];
                entries[`wp:${stateId}:${name}`] = storage[key];
            } else if (key === 'wallpaperPreference') {
                if (usable(storage[key])) entries['wp:current'] = current = storage[key];
            } else if (LEFT_BEHIND[key]) {
                leftBehind.push(LEFT_BEHIND[key]);
            }
        }
        return { entries, report: { wallpapers, settings, current, skipped, leftBehind } };
    };

    // For the tests and the parity table (SPEC Appendix B).
    WP.LEGACY = { ID, DEFAULTS, GONE: {
        statusBarHeight: 'host insets (§4.3)', quality: 'the Auto governor (§4.8)', dim: 'homepage only: nothing sits on top now',
        enableSounds: 'neko has no sounds', theme: 'neko: sprite themes became coats',
    } };

    // True if an imported file looks like the old homepage's storage.
    WP.isLegacyDump = data => !!data && typeof data === 'object' && data.app !== 'wallpapers'
        && Object.keys(data.localStorage || data).some(key => key in ID || key === 'wallpaperPreference');
})(globalThis.WP);
