// Rain Animation Module

// Rain is drawn in three parallax layers. Distant rain is a fine, slow, faint
// drizzle; near rain is fast, long and bright. Depth is what stops a rain
// effect reading as a flat sheet of identical lines.
const RAIN_LAYERS = [
    { speed: 0.55, length: 0.5,  width: 0.6, alpha: 0.26 },
    { speed: 0.85, length: 0.85, width: 1.0, alpha: 0.5 },
    { speed: 1.2,  length: 1.35, width: 1.6, alpha: 0.8 }
];

class RainAnimationManager {
    constructor(host) {
        this.host = host;
        this.canvas = null;
        this.ctx = null;
        this.raindrops = [];
        this.splashes = [];
        this.puddles = [];
        this.ripples = [];
        this.isEnabled = false;
        this.animationId = null;
        this.windSystem = null;

        this.lastTime = 0;
        this.spawnCarry = 0;
        this.flash = 0;
        this.bolt = null;
        this.boltLife = 0;
        this.flickers = [];

        // Configuration
        this.config = WP.settings.load();
    }

    groundLevel() {
        const barHeight = this.host.insets.bottom;
        return this.canvas.height - barHeight;
    }

    saveConfig() {
        WP.settings.save(this.config);
    }

    async init() {
        this.createCanvas();
        this.windSystem = new RainWindSystem(this.config);
        console.log('Rain animation manager initialized');
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'rain-canvas';
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
        this.raindrops = [];
        this.splashes = [];
        this.puddles = [];
        this.ripples = [];
        this.lastTime = 0;
        this.spawnCarry = 0;
        this.flash = 0;
        this.bolt = null;
        this.boltLife = 0;
        this.flickers = [];
        this.windSystem?.reset();
        this.animate();
        console.log('Rain animation started');
    }

    stop() {
        if (!this.isEnabled) return;

        this.isEnabled = false;
        this.canvas.style.display = 'none';

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('Rain animation stopped');
    }

    createRaindrop() {
        const layerIndex = Math.floor(Math.random() * RAIN_LAYERS.length);
        const layer = RAIN_LAYERS[layerIndex];
        const speed = (this.config.dropSpeed + (Math.random() - 0.5) * this.config.dropSpeedVariation) *
                      layer.speed * 60;

        return {
            x: Math.random() * (this.canvas.width + 300) - 150,
            y: -30 - Math.random() * 60,
            vy: speed,
            layer: layerIndex,
            length: this.config.dropLength * layer.length * (0.75 + Math.random() * 0.6)
        };
    }

    createSplash(x, y, layerIndex) {
        const count = 3 + Math.floor(Math.random() * 4);
        const particles = [];

        for (let i = 0; i < count; i++) {
            // Thrown out sideways and up, as a real impact crown does
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
            const speed = 40 + Math.random() * 90;
            particles.push({
                x: x + (Math.random() - 0.5) * 5,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1
            });
        }

        return { particles, layer: layerIndex, decay: 2.2 + Math.random() * 1.4 };
    }

    createRipple(x, y, layerIndex) {
        this.ripples.push({
            x: x,
            y: y,
            radius: 1,
            maxRadius: 12 + Math.random() * 22,
            life: 1,
            layer: layerIndex
        });
    }

    createPuddle(x, y) {
        const existingPuddle = this.puddles.find(p => Math.abs(p.x - x) < 30);

        if (existingPuddle) {
            existingPuddle.size = Math.min(existingPuddle.size + 0.5, 26);
            // This used to clamp against a misspelled config key
            // (puddeOpacity), so the ceiling was undefined and every puddle's
            // opacity turned into NaN, which Canvas silently refuses to paint
            existingPuddle.opacity = Math.min(existingPuddle.opacity + 0.01, this.config.puddleOpacity);
        } else if (this.puddles.length < this.config.maxPuddles) {
            this.puddles.push({
                x: x,
                y: y,
                size: 2 + Math.random() * 4,
                opacity: 0.1
            });
        }
    }

    updateRaindrops(dt) {
        const windForce = this.windSystem?.getCurrentWindForce() || 0;
        const groundY = this.groundLevel();

        // Spawn, carrying the fractional remainder between frames so the rate
        // stays honest at any refresh rate
        this.spawnCarry += this.config.spawnRate * dt * 60;
        while (this.spawnCarry >= 1) {
            this.spawnCarry -= 1;
            if (this.raindrops.length < this.config.maxRaindrops) {
                this.raindrops.push(this.createRaindrop());
            }
        }

        for (let i = this.raindrops.length - 1; i >= 0; i--) {
            const drop = this.raindrops[i];
            const layer = RAIN_LAYERS[drop.layer];

            // Nearer rain is pushed further sideways by the same gust
            drop.vx = windForce * 60 * (0.55 + drop.layer * 0.32);

            drop.x += drop.vx * dt;
            drop.y += drop.vy * dt;

            if (drop.y >= groundY) {
                if (drop.x > 0 && drop.x < this.canvas.width) {
                    if (Math.random() < this.config.splashRate) {
                        this.splashes.push(this.createSplash(drop.x, groundY, drop.layer));
                    }
                    if (Math.random() < this.config.puddleRate * 0.35) {
                        this.createPuddle(drop.x, groundY);
                    }
                    // Every impact rings the ground, which is what sells "wet"
                    if (Math.random() < 0.55) {
                        this.createRipple(drop.x, groundY, drop.layer);
                    }
                }
                this.raindrops.splice(i, 1);
            } else if (drop.x < -160 || drop.x > this.canvas.width + 160) {
                this.raindrops.splice(i, 1);
            }
        }

        while (this.raindrops.length > this.config.maxRaindrops) {
            this.raindrops.shift();
        }
    }

    updateSplashes(dt) {
        for (let i = this.splashes.length - 1; i >= 0; i--) {
            const splash = this.splashes[i];
            let alive = false;

            for (const p of splash.particles) {
                if (p.life <= 0) continue;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vy += 420 * dt; // gravity
                p.life -= splash.decay * dt;
                if (p.life > 0) alive = true;
            }

            if (!alive) this.splashes.splice(i, 1);
        }

        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const ripple = this.ripples[i];
            ripple.radius += (ripple.maxRadius - ripple.radius) * 3.2 * dt;
            ripple.life -= 1.8 * dt;
            if (ripple.life <= 0) this.ripples.splice(i, 1);
        }
    }

    // --- Lightning ---------------------------------------------------------

    buildBolt() {
        const width = this.canvas.width;
        const groundY = this.groundLevel();
        const endY = groundY * (0.35 + Math.random() * 0.5);

        let x = width * (0.15 + Math.random() * 0.7);
        let y = -20;
        const main = [[x, y]];

        while (y < endY) {
            y += 14 + Math.random() * 34;
            x += (Math.random() - 0.5) * 62;
            main.push([x, y]);
        }

        // A couple of forks peeling off the main channel
        const branches = [];
        for (let b = 0; b < 2 + Math.floor(Math.random() * 2); b++) {
            const start = 1 + Math.floor(Math.random() * (main.length - 2));
            let [bx, by] = main[start];
            const branch = [[bx, by]];
            const steps = 2 + Math.floor(Math.random() * 4);
            const dir = Math.random() < 0.5 ? -1 : 1;

            for (let s = 0; s < steps; s++) {
                by += 10 + Math.random() * 26;
                bx += dir * (8 + Math.random() * 34);
                branch.push([bx, by]);
            }
            branches.push(branch);
        }

        return { main, branches };
    }

    strike() {
        this.bolt = this.buildBolt();
        this.boltLife = 1;
        this.flash = 0.55 + Math.random() * 0.45;

        // Real strikes stutter - queue a couple of after-flashes
        this.flickers = [];
        const extra = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < extra; i++) {
            this.flickers.push({
                delay: 0.06 + Math.random() * 0.18 + i * 0.12,
                strength: 0.3 + Math.random() * 0.4
            });
        }
    }

    updateLightning(dt) {
        if (this.config.lightning && Math.random() < this.config.lightningChance * dt) {
            this.strike();
        }

        for (let i = this.flickers.length - 1; i >= 0; i--) {
            this.flickers[i].delay -= dt;
            if (this.flickers[i].delay <= 0) {
                this.flash = Math.max(this.flash, this.flickers[i].strength);
                this.boltLife = Math.max(this.boltLife, 0.7);
                this.flickers.splice(i, 1);
            }
        }

        if (this.flash > 0) {
            this.flash -= 3.2 * dt;
            if (this.flash < 0) this.flash = 0;
        }

        if (this.boltLife > 0) {
            this.boltLife -= 6 * dt;
            if (this.boltLife <= 0) {
                this.boltLife = 0;
                this.bolt = null;
            }
        }
    }

    drawRaindrops() {
        const ctx = this.ctx;
        ctx.lineCap = 'round';

        // One path per depth layer rather than per drop: same picture, three
        // strokes a frame instead of a few hundred
        for (let index = 0; index < RAIN_LAYERS.length; index++) {
            const layer = RAIN_LAYERS[index];

            ctx.strokeStyle = 'rgb(186, 222, 240)';
            ctx.globalAlpha = this.config.rainOpacity * layer.alpha;
            ctx.lineWidth = this.config.dropWidth * layer.width;
            ctx.beginPath();

            for (const drop of this.raindrops) {
                if (drop.layer !== index) continue;

                // Trail the streak along the drop's actual heading, so wind
                // slants the rain instead of leaving vertical lines drifting
                // sideways
                const speed = Math.hypot(drop.vx, drop.vy) || 1;
                ctx.moveTo(drop.x, drop.y);
                ctx.lineTo(drop.x - (drop.vx / speed) * drop.length,
                           drop.y - (drop.vy / speed) * drop.length);
            }

            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    }

    drawSplashes() {
        const ctx = this.ctx;
        ctx.strokeStyle = 'rgb(200, 230, 245)';
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';

        for (const splash of this.splashes) {
            const layer = RAIN_LAYERS[splash.layer];
            ctx.beginPath();

            for (const p of splash.particles) {
                if (p.life <= 0) continue;
                // Streak each droplet along its own path
                const len = Math.min(4, Math.hypot(p.vx, p.vy) * 0.02);
                const speed = Math.hypot(p.vx, p.vy) || 1;
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - (p.vx / speed) * len, p.y - (p.vy / speed) * len);
            }

            ctx.globalAlpha = Math.max(0, splash.particles[0].life) * layer.alpha;
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    }

    drawRipples() {
        const ctx = this.ctx;
        ctx.strokeStyle = 'rgb(190, 225, 245)';

        for (const ripple of this.ripples) {
            const layer = RAIN_LAYERS[ripple.layer];
            ctx.globalAlpha = ripple.life * 0.45 * layer.alpha;
            ctx.lineWidth = 1;
            ctx.beginPath();
            // Flattened, because the ground is a plane seen at a glancing angle
            ctx.ellipse(ripple.x, ripple.y, ripple.radius, ripple.radius * 0.28, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    }

    drawPuddles() {
        const ctx = this.ctx;

        for (const puddle of this.puddles) {
            ctx.fillStyle = `rgba(120, 165, 220, ${puddle.opacity})`;
            ctx.beginPath();
            ctx.ellipse(puddle.x, puddle.y, puddle.size, puddle.size * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawMist() {
        if (!this.config.groundMist) return;

        const groundY = this.groundLevel();
        const top = Math.max(0, groundY - 90);
        const gradient = this.ctx.createLinearGradient(0, top, 0, groundY);
        gradient.addColorStop(0, 'rgba(160, 190, 215, 0)');
        gradient.addColorStop(1, 'rgba(160, 190, 215, 0.09)');

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, top, this.canvas.width, groundY - top);
    }

    drawLightning() {
        const ctx = this.ctx;

        if (this.flash > 0) {
            ctx.fillStyle = `rgba(198, 220, 255, ${this.flash * 0.22})`;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        if (!this.bolt || this.boltLife <= 0) return;

        const trace = (points) => {
            ctx.beginPath();
            ctx.moveTo(points[0][0], points[0][1]);
            for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
            ctx.stroke();
        };

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Wide soft glow, then the hot core on top
        ctx.globalAlpha = this.boltLife * 0.3;
        ctx.strokeStyle = 'rgb(150, 190, 255)';
        ctx.lineWidth = 8;
        trace(this.bolt.main);

        ctx.globalAlpha = this.boltLife;
        ctx.strokeStyle = 'rgb(240, 248, 255)';
        ctx.lineWidth = 2;
        trace(this.bolt.main);

        ctx.globalAlpha = this.boltLife * 0.75;
        ctx.lineWidth = 1.1;
        for (const branch of this.bolt.branches) trace(branch);

        ctx.globalAlpha = 1;
    }

    animate(currentTime = 0) {
        if (!this.isEnabled) return;

        if (!this.lastTime) this.lastTime = currentTime;
        const dt = Math.min((currentTime - this.lastTime) / 1000, 0.05);
        this.lastTime = currentTime;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.windSystem?.update();
        this.updateRaindrops(dt);
        this.updateSplashes(dt);
        this.updateLightning(dt);

        this.drawMist();
        this.drawPuddles();
        this.drawRipples();
        this.drawRaindrops();
        this.drawSplashes();
        this.drawLightning();

        this.animationId = requestAnimationFrame((time) => this.animate(time));
    }

    destroy() {
        this.stop();
        if (this.canvas) {
            document.body.removeChild(this.canvas);
        }
    }
}

// Simple wind system for rain
class RainWindSystem {
    constructor(config) {
        this.config = config;
        this.currentWind = 0;
        this.targetWind = 0;
        this.windChangeCounter = 0;
        this.windDuration = 0;
        this.windPhase = 'calm'; // calm, ramp-up, active, ramp-down
    }

    update() {
        this.windChangeCounter++;

        if (this.windPhase === 'calm' && Math.random() < this.config.windChance) {
            this.startWind();
        }

        this.updateWindForce();
    }

    startWind() {
        this.windPhase = 'ramp-up';
        this.targetWind = (Math.random() - 0.5) * this.config.windIntensity;
        this.windDuration = this.config.windDuration;
        this.windChangeCounter = 0;
    }

    updateWindForce() {
        const rampDuration = 60; // frames

        switch (this.windPhase) {
            case 'ramp-up':
                this.currentWind += (this.targetWind - this.currentWind) * 0.05;
                if (this.windChangeCounter > rampDuration) {
                    this.windPhase = 'active';
                    this.windChangeCounter = 0;
                }
                break;

            case 'active':
                if (this.windChangeCounter > this.windDuration) {
                    this.windPhase = 'ramp-down';
                    this.windChangeCounter = 0;
                }
                break;

            case 'ramp-down':
                this.currentWind *= 0.95;
                if (Math.abs(this.currentWind) < 0.1 || this.windChangeCounter > rampDuration) {
                    this.windPhase = 'calm';
                    this.currentWind = 0;
                    this.windChangeCounter = 0;
                }
                break;
        }
    }

    getCurrentWindForce() {
        return this.currentWind;
    }

    reset() {
        this.currentWind = 0;
        this.targetWind = 0;
        this.windChangeCounter = 0;
        this.windPhase = 'calm';
    }
}