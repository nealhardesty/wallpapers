// Fireflies Animation Module
class FirefliesAnimationManager {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.fireflies = [];
        this.isEnabled = false;
        this.animationId = null;

        this.lastTime = 0;
        this.grid = new Map();
        this.glowSprites = [];

        // Configuration
        this.config = {
            configVersion: 2,
            maxFireflies: 200,
            spawnRate: 0.05,
            baseSpeed: 0.8,
            speedVariation: 0.6,
            glowSize: 4,
            glowIntensity: 0.9,
            flashPeriod: 1.9,        // seconds between flashes
            flashPeriodVariation: 0.3,
            flashWidth: 0.17,        // fraction of the cycle actually lit
            emberGlow: 0.2,          // faint glow while dark, so they never vanish
            synchronize: true,
            syncStrength: 0.25,
            syncRadius: 240,
            fadeInTime: 180,
            fadeOutTime: 120,
            lifespan: 1800, // frames (30 seconds at 60fps)
            lifespanVariation: 600,
            directionChangeRate: 0.01,
            groupingTendency: 0.002,
            avoidanceRadius: 40,
            attractionRadius: 80,
            colorScheme: 'classic', // classic, rainbow, cool, warm
            brightness: 0.8,
            tailLength: 0.4 // length of each firefly's light trail; 0 = none
        };

        this.loadStoredConfig();
        this.setupColorSchemes();
    }

    loadStoredConfig() {
        try {
            const stored = localStorage.getItem('firefliesConfig');
            if (stored) {
                const config = JSON.parse(stored);
                // Pulsing was replaced by a flash cycle and motion became
                // time-based, so older saved values no longer translate
                if (config.configVersion === this.config.configVersion) {
                    Object.assign(this.config, config);
                }
            }
        } catch (error) {
            console.error('Failed to load fireflies config:', error);
        }
    }

    saveConfig() {
        try {
            localStorage.setItem('firefliesConfig', JSON.stringify(this.config));
        } catch (error) {
            console.error('Failed to save fireflies config:', error);
        }
    }

    setupColorSchemes() {
        this.colorSchemes = {
            classic: [
                { r: 255, g: 255, b: 150 }, // Soft yellow
                { r: 255, g: 255, b: 200 }, // Warm white
                { r: 255, g: 245, b: 120 }, // Golden
                { r: 240, g: 255, b: 180 }  // Pale yellow-green
            ],
            rainbow: [
                { r: 255, g: 100, b: 100 }, // Red
                { r: 255, g: 200, b: 100 }, // Orange
                { r: 255, g: 255, b: 100 }, // Yellow
                { r: 100, g: 255, b: 100 }, // Green
                { r: 100, g: 200, b: 255 }, // Blue
                { r: 200, g: 100, b: 255 }, // Purple
                { r: 255, g: 100, b: 200 }  // Pink
            ],
            cool: [
                { r: 150, g: 220, b: 255 }, // Light blue
                { r: 180, g: 255, b: 240 }, // Cyan
                { r: 200, g: 200, b: 255 }, // Lavender
                { r: 170, g: 255, b: 200 }  // Mint
            ],
            warm: [
                { r: 255, g: 180, b: 120 }, // Warm orange
                { r: 255, g: 200, b: 150 }, // Peach
                { r: 255, g: 220, b: 180 }, // Cream
                { r: 255, g: 160, b: 160 }  // Soft red
            ]
        };
    }

    // The glow is baked into one sprite per colour instead of being rebuilt as
    // two radial gradients per firefly per frame, which is both far cheaper and
    // lets the falloff be shaped more carefully than a few colour stops.
    buildGlowSprites() {
        const colors = this.colorSchemes[this.config.colorScheme] || this.colorSchemes.classic;
        const size = 128;
        const radius = size / 2;

        this.glowSprites = colors.map(color => {
            const sprite = document.createElement('canvas');
            sprite.width = size;
            sprite.height = size;

            const g = sprite.getContext('2d');
            const gradient = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
            const rgb = `${color.r}, ${color.g}, ${color.b}`;

            gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
            gradient.addColorStop(0.08, `rgba(${rgb}, 0.95)`);
            gradient.addColorStop(0.22, `rgba(${rgb}, 0.45)`);
            gradient.addColorStop(0.45, `rgba(${rgb}, 0.14)`);
            gradient.addColorStop(0.72, `rgba(${rgb}, 0.04)`);
            gradient.addColorStop(1, `rgba(${rgb}, 0)`);

            g.fillStyle = gradient;
            g.fillRect(0, 0, size, size);
            return sprite;
        });
    }

    // --- Spatial grid ------------------------------------------------------
    // Flocking and flash-coupling both need "who is near me". Comparing every
    // firefly against every other is O(n^2), which caps the population at a
    // couple of dozen before the frame budget is gone. Bucketing by cell makes
    // each query touch only the nine cells around the firefly.

    buildGrid() {
        this.cellSize = Math.max(
            this.config.attractionRadius,
            this.config.avoidanceRadius,
            this.config.synchronize ? this.config.syncRadius : 0,
            1
        );

        this.grid.clear();
        for (const firefly of this.fireflies) {
            const key = this.cellKey(firefly.x, firefly.y);
            let bucket = this.grid.get(key);
            if (!bucket) {
                bucket = [];
                this.grid.set(key, bucket);
            }
            bucket.push(firefly);
        }
    }

    cellKey(x, y) {
        return Math.floor(x / this.cellSize) + ',' + Math.floor(y / this.cellSize);
    }

    forEachNeighbor(firefly, callback) {
        const cx = Math.floor(firefly.x / this.cellSize);
        const cy = Math.floor(firefly.y / this.cellSize);

        for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
                const bucket = this.grid.get((cx + ox) + ',' + (cy + oy));
                if (!bucket) continue;

                for (const other of bucket) {
                    if (other === firefly) continue;
                    const dx = other.x - firefly.x;
                    const dy = other.y - firefly.y;
                    callback(other, dx, dy, Math.sqrt(dx * dx + dy * dy));
                }
            }
        }
    }

    async init() {
        this.createCanvas();
        this.buildGlowSprites();
        console.log('Fireflies animation manager initialized');
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'fireflies-canvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '-1';
        this.canvas.style.display = 'none';

        this.ctx = this.canvas.getContext('2d');
        document.body.appendChild(this.canvas);

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        if (!this.canvas) return;

        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    start() {
        if (this.isEnabled) return;

        this.isEnabled = true;
        this.canvas.style.display = 'block';
        this.fireflies = [];
        this.lastTime = 0;
        if (this.glowSprites.length === 0) this.buildGlowSprites();
        this.animate();
        console.log('Fireflies animation started');
    }

    stop() {
        if (!this.isEnabled) return;

        this.isEnabled = false;
        this.canvas.style.display = 'none';

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('Fireflies animation stopped');
    }

    // Fireflies are constantly being born and dying, and a newcomer starting on
    // a wholly random phase drags the swarm apart faster than the coupling can
    // pull it together. A new arrival instead joins near the swarm's current
    // phase - loosely, so it still has to be drawn the rest of the way in.
    seedPhase() {
        if (!this.config.synchronize || this.fireflies.length === 0) return Math.random();

        let sumSin = 0, sumCos = 0;
        for (const other of this.fireflies) {
            const angle = other.phase * Math.PI * 2;
            sumCos += Math.cos(angle);
            sumSin += Math.sin(angle);
        }

        if (sumCos === 0 && sumSin === 0) return Math.random();

        const mean = Math.atan2(sumSin, sumCos) / (Math.PI * 2);
        const phase = mean + (Math.random() - 0.5) * 0.4;
        return ((phase % 1) + 1) % 1;
    }

    createFirefly() {
        const colors = this.colorSchemes[this.config.colorScheme] || this.colorSchemes.classic;
        const colorIndex = Math.floor(Math.random() * colors.length);

        // Depth pushes some of the swarm back: smaller, dimmer, slower
        const depth = Math.random();

        return {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            vx: (Math.random() - 0.5) * this.config.baseSpeed * 60,
            vy: (Math.random() - 0.5) * this.config.baseSpeed * 60,
            targetVx: 0,
            targetVy: 0,
            age: 0,
            maxAge: this.config.lifespan + (Math.random() - 0.5) * this.config.lifespanVariation,
            depth: depth,

            // Flash cycle, as a phase in [0, 1). Reaching 1 fires a flash.
            phase: this.seedPhase(),
            period: Math.max(0.3, this.config.flashPeriod +
                             (Math.random() - 0.5) * this.config.flashPeriodVariation),
            fired: false,

            trail: [],
            colorIndex: colorIndex,
            brightness: (0.55 + Math.random() * 0.45) * (0.45 + depth * 0.55),
            size: Math.max(1, this.config.glowSize * (0.7 + Math.random() * 0.6) * (0.55 + depth * 0.75)),
            directionChangeTimer: Math.random()
        };
    }

    updateFireflies(dt) {
        if (Math.random() < this.config.spawnRate * dt * 60 &&
            this.fireflies.length < this.config.maxFireflies) {
            this.fireflies.push(this.createFirefly());
        }

        this.buildGrid();

        const width = this.canvas.width;
        const height = this.canvas.height;
        const margin = 70;

        for (let i = this.fireflies.length - 1; i >= 0; i--) {
            const firefly = this.fireflies[i];

            firefly.age += dt * 60;
            if (firefly.age > firefly.maxAge) {
                this.fireflies.splice(i, 1);
                continue;
            }

            firefly.directionChangeTimer -= dt;

            if (firefly.directionChangeTimer <= 0 || Math.random() < this.config.directionChangeRate * dt * 60) {
                const speed = this.config.baseSpeed * 60;
                firefly.targetVx = (Math.random() - 0.5) * speed *
                                  (1 + (Math.random() - 0.5) * this.config.speedVariation);
                firefly.targetVy = (Math.random() - 0.5) * speed *
                                  (1 + (Math.random() - 0.5) * this.config.speedVariation);
                firefly.directionChangeTimer = 0.5 + Math.random() * 1.5;
            }

            this.applyGroupingBehavior(firefly);

            // Steer back in near the edges rather than teleporting across, which
            // used to snap a firefly (and its trail) to the far side
            if (firefly.x < margin) firefly.targetVx += (margin - firefly.x) * 0.9;
            if (firefly.x > width - margin) firefly.targetVx -= (firefly.x - (width - margin)) * 0.9;
            if (firefly.y < margin) firefly.targetVy += (margin - firefly.y) * 0.9;
            if (firefly.y > height - margin) firefly.targetVy -= (firefly.y - (height - margin)) * 0.9;

            const ease = 1 - Math.pow(0.3, dt);
            firefly.vx += (firefly.targetVx - firefly.vx) * ease;
            firefly.vy += (firefly.targetVy - firefly.vy) * ease;

            const depthSpeed = 0.5 + firefly.depth * 0.7;
            firefly.x += firefly.vx * dt * depthSpeed;
            firefly.y += firefly.vy * dt * depthSpeed;

            // Hard clamp as a backstop if steering has not caught them
            firefly.x = Math.max(-margin, Math.min(width + margin, firefly.x));
            firefly.y = Math.max(-margin, Math.min(height + margin, firefly.y));

            // Advance the flash cycle
            firefly.fired = false;
            firefly.phase += dt / firefly.period;
            if (firefly.phase >= 1) {
                firefly.phase -= 1;
                firefly.fired = true;
            }

            // Record where the firefly has been and how brightly it was lit at
            // the time. The trail is laid down by the firefly itself, so it
            // follows it and only exists where it was actually glowing.
            const trailPoints = Math.round(this.config.tailLength * 60);
            if (trailPoints > 1) {
                firefly.trail.push({
                    x: firefly.x,
                    y: firefly.y,
                    intensity: this.flashIntensity(firefly)
                });
                while (firefly.trail.length > trailPoints) firefly.trail.shift();
            } else if (firefly.trail.length) {
                firefly.trail.length = 0;
            }
        }

        if (this.config.synchronize) this.synchronizeFlashes();
    }

    // Pulse-coupled oscillators: a firefly that has just flashed nudges its
    // neighbours' phases forward, so they fire a little sooner next time. Left
    // to run, the swarm entrains itself into travelling waves of flashing -
    // which is exactly what real fireflies do.
    synchronizeFlashes() {
        const radius = this.config.syncRadius;
        const coupling = this.config.syncStrength;

        for (const firefly of this.fireflies) {
            if (!firefly.fired) continue;

            this.forEachNeighbor(firefly, (other, dx, dy, distance) => {
                if (distance > radius) return;

                // Nearer neighbours are nudged harder
                const strength = coupling * (1 - distance / radius);

                // Clamped just below firing: a neighbour pushed over the line
                // here would fire inside this same loop and could cascade the
                // whole swarm in one frame
                other.phase = Math.min(0.999, other.phase + strength * (1 - other.phase));
            });
        }
    }

    applyGroupingBehavior(firefly) {
        let avgX = 0, avgY = 0, nearbyCount = 0;
        let separationX = 0, separationY = 0;

        this.forEachNeighbor(firefly, (other, dx, dy, distance) => {
            if (distance < this.config.avoidanceRadius && distance > 0) {
                separationX -= dx / distance;
                separationY -= dy / distance;
            }

            if (distance < this.config.attractionRadius) {
                avgX += other.x;
                avgY += other.y;
                nearbyCount++;
            }
        });

        if (nearbyCount > 0) {
            avgX /= nearbyCount;
            avgY /= nearbyCount;

            firefly.targetVx += (avgX - firefly.x) * this.config.groupingTendency * 60;
            firefly.targetVy += (avgY - firefly.y) * this.config.groupingTendency * 60;
        }

        firefly.targetVx += separationX * this.config.groupingTendency * 120;
        firefly.targetVy += separationY * this.config.groupingTendency * 120;

        const maxSpeed = this.config.baseSpeed * 60 * 2.5;
        const speed = Math.hypot(firefly.targetVx, firefly.targetVy);
        if (speed > maxSpeed) {
            firefly.targetVx = (firefly.targetVx / speed) * maxSpeed;
            firefly.targetVy = (firefly.targetVy / speed) * maxSpeed;
        }
    }

    // A real firefly is dark most of its cycle and then blooms briefly. The old
    // sine wave spent half its time lit, which reads as slow breathing rather
    // than flashing.
    flashIntensity(firefly) {
        const width = this.config.flashWidth;
        if (firefly.phase >= width) return this.config.emberGlow;

        const t = firefly.phase / width;
        const bloom = Math.sin(Math.PI * t);
        return this.config.emberGlow + bloom * bloom * (1 - this.config.emberGlow);
    }

    // The streak a moving firefly leaves while it is lit - the long-exposure
    // look. Each point carries the brightness the firefly had when it passed
    // through, so a streak appears only across the span of an actual flash and
    // then fades with age.
    drawTrail(firefly, lifeAlpha) {
        const trail = firefly.trail;
        if (trail.length < 2) return;

        const colors = this.colorSchemes[this.config.colorScheme] || this.colorSchemes.classic;
        const color = colors[firefly.colorIndex];

        this.ctx.strokeStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        this.ctx.lineCap = 'round';

        for (let i = 1; i < trail.length; i++) {
            const age = i / trail.length; // 1 at the head, 0 at the tail
            const alpha = trail[i].intensity * age * age * 0.5 *
                          lifeAlpha * this.config.brightness;
            if (alpha < 0.012) continue;

            this.ctx.globalAlpha = alpha;
            this.ctx.lineWidth = Math.max(0.5, firefly.size * 0.55 * age);
            this.ctx.beginPath();
            this.ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
            this.ctx.lineTo(trail[i].x, trail[i].y);
            this.ctx.stroke();
        }
    }

    drawFirefly(firefly) {
        // Fade in on birth, out on death
        let alpha = 1;
        if (firefly.age < this.config.fadeInTime) {
            alpha = firefly.age / this.config.fadeInTime;
        } else if (firefly.age > firefly.maxAge - this.config.fadeOutTime) {
            alpha = (firefly.maxAge - firefly.age) / this.config.fadeOutTime;
        }

        this.drawTrail(firefly, alpha * firefly.brightness);

        const intensity = this.flashIntensity(firefly) *
                          this.config.glowIntensity *
                          alpha *
                          firefly.brightness *
                          this.config.brightness;

        if (intensity <= 0.004) return;

        const sprite = this.glowSprites[firefly.colorIndex];
        if (!sprite) return;

        // The halo swells with the flash, so a bloom reads as a burst of light
        // rather than the same disc getting brighter
        const radius = firefly.size * (2.2 + intensity * 3.4);

        this.ctx.globalAlpha = Math.min(1, intensity);
        this.ctx.drawImage(sprite, firefly.x - radius, firefly.y - radius, radius * 2, radius * 2);
    }

    animate(currentTime = 0) {
        if (!this.isEnabled) return;

        if (!this.lastTime) this.lastTime = currentTime;
        const dt = Math.min((currentTime - this.lastTime) / 1000, 0.05);
        this.lastTime = currentTime;

        // Always a clean clear. Trails used to be faked by washing the whole
        // canvas with an opaque colour instead of clearing it, which both
        // turned the viewport into a solid dark rectangle and left stationary
        // afterimages of flashes hanging in space. Each firefly now carries its
        // own trail instead.
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.globalAlpha = 1;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.updateFireflies(dt);

        // Set the blend mode once for the whole swarm rather than saving and
        // restoring the context around every firefly
        this.ctx.globalCompositeOperation = 'screen';

        for (const firefly of this.fireflies) {
            this.drawFirefly(firefly);
        }

        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.globalAlpha = 1;

        this.animationId = requestAnimationFrame((time) => this.animate(time));
    }

    showConfigDialog() {
        if (document.getElementById('fireflies-config-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'fireflies-config-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.5); display: flex;
            align-items: center; justify-content: center; z-index: 1000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background-color: var(--dark-surface); border: 1px solid var(--gray-700);
            border-radius: 0.5rem; padding: 1.5rem; min-width: 400px; max-width: 500px;
            max-height: 80vh; overflow-y: auto; color: var(--light-text);
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 1rem 0; color: var(--light-text); font-size: 1.25rem;">🪲 Fireflies Configuration</h3>

            <div style="display: grid; gap: 1rem;">
                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">✨ Population</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Max Fireflies: <span id="max-fireflies-value">${this.config.maxFireflies}</span>
                        <input type="range" id="max-fireflies" min="5" max="600" value="${this.config.maxFireflies}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Spawn Rate: <span id="spawn-rate-value">${(this.config.spawnRate * 100).toFixed(2)}%</span>
                        <input type="range" id="spawn-rate" min="0.005" max="0.3" step="0.005" value="${this.config.spawnRate}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Lifespan: <span id="lifespan-value">${(this.config.lifespan / 60).toFixed(1)}s</span>
                        <input type="range" id="lifespan" min="300" max="3600" step="60" value="${this.config.lifespan}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                </div>

                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">🌟 Appearance</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Glow Size: <span id="glow-size-value">${this.config.glowSize}</span>
                        <input type="range" id="glow-size" min="1" max="20" value="${this.config.glowSize}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Brightness: <span id="brightness-value">${(this.config.brightness * 100).toFixed(0)}%</span>
                        <input type="range" id="brightness" min="0.3" max="1.2" step="0.1" value="${this.config.brightness}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Trail Length: <span id="tail-length-value">${this.config.tailLength === 0 ? 'None' : (this.config.tailLength * 1000).toFixed(0) + 'ms'}</span>
                        <input type="range" id="tail-length" min="0" max="1.2" step="0.05" value="${this.config.tailLength}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Flash Period: <span id="flash-period-value">${this.config.flashPeriod.toFixed(1)}s</span>
                        <input type="range" id="flash-period" min="0.6" max="5" step="0.1" value="${this.config.flashPeriod}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Flash Width: <span id="flash-width-value">${(this.config.flashWidth * 100).toFixed(0)}%</span>
                        <input type="range" id="flash-width" min="0.04" max="0.6" step="0.01" value="${this.config.flashWidth}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Color Scheme:
                        <select id="color-scheme" style="width: 100%; margin-top: 0.25rem; padding: 0.25rem; background: var(--gray-600); color: var(--light-text); border: 1px solid var(--gray-500); border-radius: 0.25rem;">
                            <option value="classic" ${this.config.colorScheme === 'classic' ? 'selected' : ''}>🟡 Classic (Yellow/Gold)</option>
                            <option value="rainbow" ${this.config.colorScheme === 'rainbow' ? 'selected' : ''}>🌈 Rainbow</option>
                            <option value="cool" ${this.config.colorScheme === 'cool' ? 'selected' : ''}>❄️ Cool (Blues/Cyans)</option>
                            <option value="warm" ${this.config.colorScheme === 'warm' ? 'selected' : ''}>🔥 Warm (Oranges/Reds)</option>
                        </select>
                    </label>
                </div>

                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">🕊️ Movement</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Base Speed: <span id="base-speed-value">${this.config.baseSpeed.toFixed(1)}</span>
                        <input type="range" id="base-speed" min="0.2" max="3" step="0.1" value="${this.config.baseSpeed}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Direction Change Rate: <span id="direction-change-rate-value">${(this.config.directionChangeRate * 100).toFixed(2)}%</span>
                        <input type="range" id="direction-change-rate" min="0.001" max="0.05" step="0.001" value="${this.config.directionChangeRate}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Grouping Tendency: <span id="grouping-tendency-value">${(this.config.groupingTendency * 1000).toFixed(1)}</span>
                        <input type="range" id="grouping-tendency" min="0" max="0.01" step="0.0005" value="${this.config.groupingTendency}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Avoidance Radius: <span id="avoidance-radius-value">${this.config.avoidanceRadius}px</span>
                        <input type="range" id="avoidance-radius" min="20" max="100" value="${this.config.avoidanceRadius}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                </div>

                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">🔆 Synchrony</h4>
                    <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <input type="checkbox" id="synchronize" ${this.config.synchronize ? 'checked' : ''}>
                        Synchronized Flashing
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Sync Strength: <span id="sync-strength-value">${(this.config.syncStrength * 100).toFixed(0)}%</span>
                        <input type="range" id="sync-strength" min="0.01" max="0.6" step="0.01" value="${this.config.syncStrength}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Sync Radius: <span id="sync-radius-value">${this.config.syncRadius}px</span>
                        <input type="range" id="sync-radius" min="40" max="400" step="10" value="${this.config.syncRadius}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                </div>
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; justify-content: flex-end;">
                <button id="reset-fireflies-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Reset to Defaults
                </button>
                <button id="cancel-fireflies-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Cancel
                </button>
                <button id="apply-fireflies-config" style="padding: 0.5rem 1rem; background: var(--accent-blue); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Apply
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        // Add info icons to labels
        this.addFirefliesConfigInfoIcons(dialog);

        this.attachConfigEventListeners(dialog);

        dialog.querySelector('#reset-fireflies-config').addEventListener('click', () => {
            this.resetConfigDialog(dialog);
        });

        dialog.querySelector('#cancel-fireflies-config').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        dialog.querySelector('#apply-fireflies-config').addEventListener('click', () => {
            this.applyConfig(dialog);
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    attachConfigEventListeners(dialog) {
        const sliders = [
            { id: 'max-fireflies', valueId: 'max-fireflies-value', format: (v) => v },
            { id: 'spawn-rate', valueId: 'spawn-rate-value', format: (v) => (parseFloat(v) * 100).toFixed(2) + '%' },
            { id: 'lifespan', valueId: 'lifespan-value', format: (v) => (parseFloat(v) / 60).toFixed(1) + 's' },
            { id: 'glow-size', valueId: 'glow-size-value', format: (v) => v },
            { id: 'brightness', valueId: 'brightness-value', format: (v) => (parseFloat(v) * 100).toFixed(0) + '%' },
            { id: 'tail-length', valueId: 'tail-length-value', format: (v) => parseFloat(v) === 0 ? 'None' : (parseFloat(v) * 1000).toFixed(0) + 'ms' },
            { id: 'flash-period', valueId: 'flash-period-value', format: (v) => parseFloat(v).toFixed(1) + 's' },
            { id: 'flash-width', valueId: 'flash-width-value', format: (v) => (parseFloat(v) * 100).toFixed(0) + '%' },
            { id: 'sync-strength', valueId: 'sync-strength-value', format: (v) => (parseFloat(v) * 100).toFixed(0) + '%' },
            { id: 'sync-radius', valueId: 'sync-radius-value', format: (v) => v + 'px' },
            { id: 'base-speed', valueId: 'base-speed-value', format: (v) => parseFloat(v).toFixed(1) },
            { id: 'direction-change-rate', valueId: 'direction-change-rate-value', format: (v) => (parseFloat(v) * 100).toFixed(2) + '%' },
            { id: 'grouping-tendency', valueId: 'grouping-tendency-value', format: (v) => (parseFloat(v) * 1000).toFixed(1) },
            { id: 'avoidance-radius', valueId: 'avoidance-radius-value', format: (v) => v + 'px' }
        ];

        sliders.forEach(slider => {
            const element = dialog.querySelector(`#${slider.id}`);
            const valueElement = dialog.querySelector(`#${slider.valueId}`);

            element.addEventListener('input', (e) => {
                valueElement.textContent = slider.format(e.target.value);
            });
        });
    }

    addFirefliesConfigInfoIcons(dialog) {
        // Add info icons to fireflies configuration labels
        const configs = [
            // Fireflies
            { label: 'Max Fireflies:', description: 'Maximum number of fireflies visible simultaneously', default: '200 fireflies' },
            { label: 'Spawn Rate:', description: 'Probability per frame that a new firefly appears', default: '5%' },
            { label: 'Lifespan:', description: 'How long each firefly lives before disappearing', default: '30.0s' },
            { label: 'Glow Size:', description: 'Base radius of the firefly glow; the halo swells as it flashes', default: '4 pixels' },
            { label: 'Brightness:', description: 'Overall intensity of firefly glow (opacity)', default: '80%' },
            { label: 'Trail Length:', description: 'How long a firefly\'s light streak lingers behind it (0 = no trails)', default: '400ms' },
            { label: 'Flash Period:', description: 'Seconds between flashes for an average firefly', default: '1.9s' },
            { label: 'Flash Width:', description: 'Fraction of each cycle the firefly is lit; lower is a sharper blink', default: '17%' },
            { label: 'Sync Strength:', description: 'How hard a flash pulls its neighbours toward flashing together', default: '25%' },
            { label: 'Sync Radius:', description: 'How far a flash reaches when nudging its neighbours', default: '240px' },

            // Movement
            { label: 'Base Speed:', description: 'Basic movement speed of fireflies in pixels per frame', default: '1.5 px/frame' },
            { label: 'Direction Change Rate:', description: 'Probability per frame that a firefly changes direction', default: '2%' },
            { label: 'Grouping Tendency:', description: 'How much fireflies are attracted to each other', default: '5.0' },
            { label: 'Avoidance Radius:', description: 'Distance fireflies try to maintain from each other', default: '30 pixels' }
        ];

        configs.forEach(config => {
            // Find the label containing this text and locate the value span
            const labels = dialog.querySelectorAll('label');
            for (const label of labels) {
                if (label.textContent.includes(config.label)) {
                    // Find the value span within this label (ends with '-value')
                    const valueSpan = label.querySelector('span[id$="-value"]');
                    if (valueSpan) {
                        const icon = createInfoIcon(config.description, config.default);
                        // Insert the icon immediately after the value span
                        valueSpan.parentNode.insertBefore(icon, valueSpan.nextSibling);
                    }
                    break;
                }
            }
        });
    }

    resetConfigDialog(dialog) {
        const defaults = {
            maxFireflies: 200,
            spawnRate: 0.05,
            lifespan: 1800,
            glowSize: 4,
            brightness: 0.8,
            tailLength: 0.4,
            flashPeriod: 1.9,
            flashWidth: 0.17,
            synchronize: true,
            syncStrength: 0.25,
            syncRadius: 240,
            baseSpeed: 0.8,
            directionChangeRate: 0.01,
            groupingTendency: 0.002,
            avoidanceRadius: 40,
            colorScheme: 'classic'
        };

        Object.keys(defaults).forEach(key => {
            if (key === 'colorScheme') return;

            const element = dialog.querySelector(`#${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
            if (!element) return;

            if (element.type === 'checkbox') {
                element.checked = defaults[key];
            } else {
                element.value = defaults[key];
                element.dispatchEvent(new Event('input'));
            }
        });

        dialog.querySelector('#color-scheme').value = defaults.colorScheme;
    }

    applyConfig(dialog) {
        this.config.maxFireflies = parseInt(dialog.querySelector('#max-fireflies').value);
        this.config.spawnRate = parseFloat(dialog.querySelector('#spawn-rate').value);
        this.config.lifespan = parseInt(dialog.querySelector('#lifespan').value);
        this.config.glowSize = parseInt(dialog.querySelector('#glow-size').value);
        this.config.brightness = parseFloat(dialog.querySelector('#brightness').value);
        this.config.tailLength = parseFloat(dialog.querySelector('#tail-length').value);
        this.config.flashPeriod = parseFloat(dialog.querySelector('#flash-period').value);
        this.config.flashWidth = parseFloat(dialog.querySelector('#flash-width').value);
        this.config.synchronize = dialog.querySelector('#synchronize').checked;
        this.config.syncStrength = parseFloat(dialog.querySelector('#sync-strength').value);
        this.config.syncRadius = parseInt(dialog.querySelector('#sync-radius').value);
        this.config.baseSpeed = parseFloat(dialog.querySelector('#base-speed').value);
        this.config.directionChangeRate = parseFloat(dialog.querySelector('#direction-change-rate').value);
        this.config.groupingTendency = parseFloat(dialog.querySelector('#grouping-tendency').value);
        this.config.avoidanceRadius = parseInt(dialog.querySelector('#avoidance-radius').value);
        this.config.colorScheme = dialog.querySelector('#color-scheme').value;

        // The glow sprites bake in the colour, so a scheme change needs them redrawn
        this.buildGlowSprites();

        this.saveConfig();
        console.log('Fireflies config applied:', this.config);
    }

    destroy() {
        this.stop();
        if (this.canvas) {
            document.body.removeChild(this.canvas);
        }
    }
}