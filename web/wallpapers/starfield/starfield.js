// Approximate naked-eye colours of the main stellar classes, hottest first.
// Real skies are dominated by the cooler classes, but the hot blue-white stars
// are intrinsically bright so they stay visible - hence the weighting below.
const STAR_TINTS = [
    { rgb: [155, 176, 255], weight: 0.03 }, // O/B  blue
    { rgb: [202, 216, 255], weight: 0.12 }, // A    blue-white
    { rgb: [248, 247, 255], weight: 0.25 }, // F    white
    { rgb: [255, 245, 234], weight: 0.30 }, // G    yellow-white
    { rgb: [255, 216, 168], weight: 0.22 }, // K    orange
    { rgb: [255, 180, 130], weight: 0.08 }  // M    red-orange
];

class StarfieldAnimationManager {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.stars = [];
        this.animationId = null;
        this.isRunning = false;
        this.lastTime = 0;
        this.config = this.loadConfig();
        this.galaxyProgress = 0; // 0 to 1, tracks progress toward galaxy center
        this.startTime = 0;

        this.depth = 1200;     // far clipping plane in world units
        this.focal = 800;      // recomputed from the canvas on resize
        this.backdrop = null;  // pre-rendered deep-sky background
    }

    loadConfig() {
        return WP.settings.load();
    }

    saveConfig(config) {
        WP.settings.save(config);
        this.config = { ...config };
    }

    start() {
        if (this.isRunning) return;

        this.createCanvas();
        this.initializeStars();
        this.isRunning = true;
        this.startTime = Date.now();
        this.galaxyProgress = 0;
        this.lastTime = 0;
        this.animate();
    }

    stop() {
        if (!this.isRunning) return;

        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.onResize) {
            window.removeEventListener('resize', this.onResize);
            this.onResize = null;
        }
        if (this.canvas) {
            this.canvas.remove();
            this.canvas = null;
            this.ctx = null;
        }
        this.backdrop = null;
        this.stars = [];
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'starfield-canvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.zIndex = '-1';
        this.canvas.style.pointerEvents = 'none';

        this.resizeCanvas();
        // Keep a reference so stop() can detach it - applying config restarts
        // the animation, and without this the listeners pile up
        this.onResize = () => this.resizeCanvas();
        window.addEventListener('resize', this.onResize);

        this.ctx = this.canvas.getContext('2d');
        document.body.appendChild(this.canvas);
    }

    resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Focal length set so the far plane just covers the screen corners
        this.focal = Math.hypot(this.canvas.width, this.canvas.height) / 2;
        this.buildBackdrop();
    }

    // The deep sky: near-black, optionally with the Milky Way band across it.
    // Pre-rendered once, then blended in each frame in place of a flat clear,
    // so it doubles as the trail-fade wash.
    buildBackdrop() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;

        const g = c.getContext('2d');
        g.fillStyle = 'rgb(4, 6, 12)';
        g.fillRect(0, 0, w, h);

        if (this.config.milkyWay) {
            const bandHalf = h * 0.3;
            g.save();
            g.translate(w / 2, h / 2);
            g.rotate(-0.42);

            const band = g.createLinearGradient(0, -bandHalf, 0, bandHalf);
            band.addColorStop(0, 'rgba(72, 82, 124, 0)');
            band.addColorStop(0.5, 'rgba(72, 82, 124, 0.20)');
            band.addColorStop(1, 'rgba(72, 82, 124, 0)');
            g.fillStyle = band;
            g.fillRect(-w, -bandHalf, w * 2, bandHalf * 2);

            // Clumpy star clouds along the band
            for (let i = 0; i < 55; i++) {
                const cx = (Math.random() - 0.5) * w * 1.8;
                const cy = (Math.random() - 0.5) * bandHalf * 1.4;
                const r = 50 + Math.random() * 180;
                const blob = g.createRadialGradient(cx, cy, 0, cx, cy, r);
                blob.addColorStop(0, `rgba(96, 106, 150, ${0.05 + Math.random() * 0.06})`);
                blob.addColorStop(1, 'rgba(96, 106, 150, 0)');
                g.fillStyle = blob;
                g.fillRect(cx - r, cy - r, r * 2, r * 2);
            }

            // Dark dust lanes cutting through it
            for (let i = 0; i < 14; i++) {
                const cx = (Math.random() - 0.5) * w * 1.8;
                const cy = (Math.random() - 0.5) * bandHalf * 1.1;
                const r = 40 + Math.random() * 150;
                const dust = g.createRadialGradient(cx, cy, 0, cx, cy, r);
                dust.addColorStop(0, `rgba(4, 6, 12, ${0.35 + Math.random() * 0.3})`);
                dust.addColorStop(1, 'rgba(4, 6, 12, 0)');
                g.fillStyle = dust;
                g.fillRect(cx - r, cy - r, r * 2, r * 2);
            }

            g.restore();
        }

        this.backdrop = c;
    }

    initializeStars() {
        this.stars = [];
        const currentStarCount = this.getCurrentStarCount();

        for (let i = 0; i < currentStarCount; i++) {
            // Spread the initial population through the whole volume
            this.stars.push(this.createStar(this.depth * (0.12 + Math.random() * 0.88)));
        }
    }

    pickTint() {
        let roll = Math.random();
        for (const tint of STAR_TINTS) {
            roll -= tint.weight;
            if (roll <= 0) return tint.rgb;
        }
        return STAR_TINTS[2].rgb;
    }

    starColor(star) {
        if (this.config.colorMode === 'rainbow') return `hsl(${star.hue}, 85%, 72%)`;
        if (this.config.colorMode === 'blue') return 'rgb(150, 190, 255)';
        if (this.config.colorMode === 'white') return 'rgb(255, 255, 255)';

        // Realistic: dim stars read as colourless to the eye, so only the
        // brighter ones show their spectral tint
        const [r, g, b] = star.tint;
        const strength = 0.3 + 0.7 * star.mag;
        return `rgb(${Math.round(255 + (r - 255) * strength)}, ` +
               `${Math.round(255 + (g - 255) * strength)}, ` +
               `${Math.round(255 + (b - 255) * strength)})`;
    }

    getCurrentStarCount() {
        if (!this.config.galaxyApproachEnabled) {
            return this.config.baseStarCount;
        }

        const progress = Math.min(this.galaxyProgress, 1);
        return Math.floor(this.config.baseStarCount +
            (this.config.maxStarCount - this.config.baseStarCount) * progress);
    }


    // Stars live in 3D world space. We pick where the star should land on
    // screen, then invert the projection at its depth - that way the visible
    // frame is evenly filled at every distance instead of only at the far plane.
    createStar(z) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        let offsetX, offsetY;

        if (this.config.densityMode === 'uniform') {
            offsetX = (Math.random() * 2 - 1) * w / 2;
            offsetY = (Math.random() * 2 - 1) * h / 2;
        } else {
            const angle = Math.random() * Math.PI * 2;
            const maxRadius = Math.hypot(w, h) / 2;
            const t = this.config.densityMode === 'center'
                ? Math.pow(Math.random(), 1.7)
                : 0.4 + 0.6 * Math.sqrt(Math.random());
            offsetX = Math.cos(angle) * t * maxRadius;
            offsetY = Math.sin(angle) * t * maxRadius;
        }

        const scale = z / this.focal;

        // Project immediately: a star whose previous position is still (0, 0)
        // would draw a trail streaking out of the top-left corner on its first
        // frame. Seeding both to the same point means no trail until it moves.
        const star = {
            x: offsetX * scale,
            y: offsetY * scale,
            z: z,
            sx: w / 2 + offsetX,    // projected screen position
            sy: h / 2 + offsetY,
            psx: w / 2 + offsetX,   // previous frame, for the motion trail
            psy: h / 2 + offsetY,
            // Power law: the sky holds far more faint stars than bright ones
            mag: Math.pow(Math.random(), 2.4),
            tint: this.pickTint(),
            twinkle: Math.random() * Math.PI * 2,
            twinkleSpeed: 0.6 + Math.random() * 1.8, // radians per second
            hue: Math.random() * 360
        };

        star.css = this.starColor(star);
        return star;
    }

    respawnStar(star) {
        Object.assign(star, this.createStar(this.depth));
    }

    updateGalaxyProgress() {
        if (!this.config.galaxyApproachEnabled) return;

        const elapsed = Date.now() - this.startTime;
        this.galaxyProgress = Math.min(elapsed / this.config.galaxyApproachDuration, 1);

        // Add new stars as we approach galaxy center
        const targetStarCount = this.getCurrentStarCount();
        while (this.stars.length < targetStarCount) {
            this.stars.push(this.createStar(this.depth));
        }
    }

    animate(currentTime = 0) {
        if (!this.isRunning) return;

        // First frame has no reference point, and a backgrounded tab can hand
        // us a gap of many seconds - either would fling every star past the
        // camera at once, so clamp it
        if (!this.lastTime) this.lastTime = currentTime;
        const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.05);
        this.lastTime = currentTime;

        this.updateGalaxyProgress();
        this.updateStars(deltaTime);
        this.draw();

        this.animationId = requestAnimationFrame((time) => this.animate(time));
    }

    updateStars(deltaTime) {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const margin = 60;
        // warpSpeed is expressed per 60fps frame; convert to per second
        const travel = this.config.warpSpeed * 60 * deltaTime;

        for (const star of this.stars) {
            star.psx = star.sx;
            star.psy = star.sy;

            star.z -= travel;
            if (star.z < 1) {
                this.respawnStar(star);
                continue;
            }

            // Project from the star's fixed world position. The old code fed
            // the projected screen position back in as the world position each
            // frame, so every star's offset compounded exponentially and shot
            // off screen within a few frames.
            const scale = this.focal / star.z;
            star.sx = centerX + star.x * scale;
            star.sy = centerY + star.y * scale;

            star.twinkle += star.twinkleSpeed * deltaTime;

            if (star.sx < -margin || star.sx > this.canvas.width + margin ||
                star.sy < -margin || star.sy > this.canvas.height + margin) {
                this.respawnStar(star);
            }
        }
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Blend the deep-sky backdrop over the last frame. At full opacity this
        // is an ordinary clear; below that, previous frames bleed through as
        // motion trails.
        ctx.globalAlpha = Math.max(0, 1 - this.config.trailLength);
        if (this.backdrop) {
            ctx.drawImage(this.backdrop, 0, 0);
        } else {
            ctx.fillStyle = 'rgb(4, 6, 12)';
            ctx.fillRect(0, 0, w, h);
        }

        const twinkleOn = this.config.twinkle;

        for (const star of this.stars) {
            const proximity = 1 - star.z / this.depth; // 0 far, 1 at the camera

            // Apparent brightness: intrinsic magnitude, dimmed with distance
            let alpha = star.mag * (0.22 + 0.78 * proximity);

            if (twinkleOn) {
                // Scintillation is an atmospheric effect on distant points, so
                // fade it out as a star sweeps past - and never blink fully out
                const amp = 0.22 * Math.min(1, star.z / (this.depth * 0.45));
                alpha *= 1 - amp + amp * (0.5 + 0.5 * Math.sin(star.twinkle));
            }

            if (alpha <= 0.012) continue;
            alpha = Math.min(1, alpha);

            const size = this.config.starSize *
                (0.32 + star.mag * 0.85) *
                (0.55 + proximity * 1.7);

            ctx.fillStyle = star.css;
            ctx.strokeStyle = star.css;

            // Motion trail, only once the star is actually sweeping
            if (this.config.trailLength > 0) {
                const dx = star.sx - star.psx;
                const dy = star.sy - star.psy;
                if (dx * dx + dy * dy > 4) {
                    ctx.globalAlpha = alpha * 0.55;
                    ctx.lineWidth = Math.max(0.4, size * 0.7);
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(star.psx, star.psy);
                    ctx.lineTo(star.sx, star.sy);
                    ctx.stroke();
                }
            }

            // Halo, then core - a cheap stand-in for shadowBlur, which costs far
            // too much to run per star per frame
            if (size > 1.2) {
                ctx.globalAlpha = alpha * 0.16;
                ctx.beginPath();
                ctx.arc(star.sx, star.sy, size * 2.6, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(star.sx, star.sy, size, 0, Math.PI * 2);
            ctx.fill();

            // The brightest stars pick up a faint cross - the glare the eye
            // reads as "this one is bright"
            if (alpha > 0.7 && size > 2.4) {
                const len = size * 3.4;
                ctx.globalAlpha = alpha * 0.35;
                ctx.lineWidth = Math.max(0.5, size * 0.16);
                ctx.beginPath();
                ctx.moveTo(star.sx - len, star.sy);
                ctx.lineTo(star.sx + len, star.sy);
                ctx.moveTo(star.sx, star.sy - len);
                ctx.lineTo(star.sx, star.sy + len);
                ctx.stroke();
            }
        }

        ctx.globalAlpha = 1;
    }

    showConfigDialog() {
        if (document.getElementById('starfield-config-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'starfield-config-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); display: flex; align-items: center;
            justify-content: center; z-index: 1000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--dark-surface); border: 1px solid var(--gray-700);
            border-radius: 0.5rem; padding: 1.5rem; min-width: 450px; max-width: 500px;
            color: var(--light-text); max-height: 80vh; overflow-y: auto;
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 1rem 0; color: var(--light-text); font-size: 1.25rem;">
                ⭐ Starfield Configuration
            </h3>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Warp Speed: <span id="warp-speed-value">${this.config.warpSpeed}</span>
                </label>
                <input type="range" id="warp-speed" min="1" max="20" step="1" value="${this.config.warpSpeed}"
                       style="width: 100%;">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Base Star Count: <span id="base-star-count-value">${this.config.baseStarCount}</span>
                </label>
                <input type="range" id="base-star-count" min="50" max="500" step="25" value="${this.config.baseStarCount}"
                       style="width: 100%;">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Max Star Count: <span id="max-star-count-value">${this.config.maxStarCount}</span>
                </label>
                <input type="range" id="max-star-count" min="200" max="1500" step="50" value="${this.config.maxStarCount}"
                       style="width: 100%;">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Star Size: <span id="star-size-value">${this.config.starSize}</span>
                </label>
                <input type="range" id="star-size" min="0.5" max="5" step="0.1" value="${this.config.starSize}"
                       style="width: 100%;">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Trail Length: <span id="trail-length-value">${this.config.trailLength}</span>
                </label>
                <input type="range" id="trail-length" min="0" max="1" step="0.1" value="${this.config.trailLength}"
                       style="width: 100%;">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Galaxy Approach Duration (seconds): <span id="galaxy-duration-value">${this.config.galaxyApproachDuration / 1000}</span>
                </label>
                <input type="range" id="galaxy-duration" min="10" max="300" step="10" value="${this.config.galaxyApproachDuration / 1000}"
                       style="width: 100%;">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Color Mode:
                </label>
                <select id="color-mode" style="width: 100%; padding: 0.5rem; background: var(--gray-600); color: white; border: 1px solid var(--gray-500); border-radius: 0.25rem;">
                    <option value="realistic" ${this.config.colorMode === 'realistic' ? 'selected' : ''}>Realistic (Stellar Classes)</option>
                    <option value="white" ${this.config.colorMode === 'white' ? 'selected' : ''}>White Stars</option>
                    <option value="blue" ${this.config.colorMode === 'blue' ? 'selected' : ''}>Blue Stars</option>
                    <option value="rainbow" ${this.config.colorMode === 'rainbow' ? 'selected' : ''}>Rainbow Stars</option>
                </select>
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Star Density Distribution:
                </label>
                <select id="density-mode" style="width: 100%; padding: 0.5rem; background: var(--gray-600); color: white; border: 1px solid var(--gray-500); border-radius: 0.25rem;">
                    <option value="center" ${this.config.densityMode === 'center' ? 'selected' : ''}>More at Center</option>
                    <option value="edges" ${this.config.densityMode === 'edges' ? 'selected' : ''}>More at Edges</option>
                    <option value="uniform" ${this.config.densityMode === 'uniform' ? 'selected' : ''}>Uniform</option>
                </select>
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: flex; align-items: center; color: var(--gray-300);">
                    <input type="checkbox" id="galaxy-approach" ${this.config.galaxyApproachEnabled ? 'checked' : ''}
                           style="margin-right: 0.5rem;">
                    Enable Galaxy Approach (Increasing Star Density)
                </label>
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: flex; align-items: center; color: var(--gray-300);">
                    <input type="checkbox" id="milky-way" ${this.config.milkyWay ? 'checked' : ''}
                           style="margin-right: 0.5rem;">
                    Milky Way Band
                </label>
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: flex; align-items: center; color: var(--gray-300);">
                    <input type="checkbox" id="twinkle" ${this.config.twinkle ? 'checked' : ''}
                           style="margin-right: 0.5rem;">
                    Twinkle
                </label>
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; justify-content: flex-end;">
                <button id="cancel-starfield-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Cancel
                </button>
                <button id="apply-starfield-config" style="padding: 0.5rem 1rem; background: var(--accent-blue); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Apply
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        // Add real-time value updates
        const updateValues = () => {
            dialog.querySelector('#warp-speed-value').textContent = dialog.querySelector('#warp-speed').value;
            dialog.querySelector('#base-star-count-value').textContent = dialog.querySelector('#base-star-count').value;
            dialog.querySelector('#max-star-count-value').textContent = dialog.querySelector('#max-star-count').value;
            dialog.querySelector('#star-size-value').textContent = dialog.querySelector('#star-size').value;
            dialog.querySelector('#trail-length-value').textContent = dialog.querySelector('#trail-length').value;
            dialog.querySelector('#galaxy-duration-value').textContent = dialog.querySelector('#galaxy-duration').value;
        };

        dialog.querySelectorAll('input[type="range"]').forEach(input => {
            input.addEventListener('input', updateValues);
        });

        dialog.querySelector('#cancel-starfield-config').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        dialog.querySelector('#apply-starfield-config').addEventListener('click', () => {
            const newConfig = {
                configVersion: this.config.configVersion,
                warpSpeed: parseFloat(dialog.querySelector('#warp-speed').value),
                baseStarCount: parseInt(dialog.querySelector('#base-star-count').value),
                maxStarCount: parseInt(dialog.querySelector('#max-star-count').value),
                starSize: parseFloat(dialog.querySelector('#star-size').value),
                trailLength: parseFloat(dialog.querySelector('#trail-length').value),
                galaxyApproachEnabled: dialog.querySelector('#galaxy-approach').checked,
                galaxyApproachDuration: parseFloat(dialog.querySelector('#galaxy-duration').value) * 1000,
                colorMode: dialog.querySelector('#color-mode').value,
                densityMode: dialog.querySelector('#density-mode').value,
                milkyWay: dialog.querySelector('#milky-way').checked,
                twinkle: dialog.querySelector('#twinkle').checked,
            };

            this.saveConfig(newConfig);

            if (this.isRunning) {
                this.stop();
                this.start();
            }

            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }
}