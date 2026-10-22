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
        this.config = WP.settings.load();

        this.setupColorSchemes();
    }

    saveConfig() {
        WP.settings.save(this.config);
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
        // Open mid-evening: seed the population the spawn rate settles at,
        // already faded in, rather than a dark screen for the first seconds.
        const settled = Math.min(this.config.maxFireflies, Math.round(this.config.spawnRate * this.config.lifespan));
        for (let i = 0; i < settled; i++) {
            const firefly = this.createFirefly();
            const lit = Math.max(0, firefly.maxAge - this.config.fadeInTime - this.config.fadeOutTime);
            firefly.age = this.config.fadeInTime + Math.random() * lit;
            this.fireflies.push(firefly);
        }
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

    destroy() {
        this.stop();
        if (this.canvas) {
            document.body.removeChild(this.canvas);
        }
    }
}