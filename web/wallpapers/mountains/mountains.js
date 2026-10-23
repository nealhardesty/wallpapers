// Mountains Animation Module
class MountainsAnimationManager {
    constructor(host) {
        this.host = host;
        this.canvas = null;
        this.ctx = null;
        this.mountainLayers = [];
        this.isEnabled = false;
        this.animationId = null;
        this.lastTime = 0;
        // Home-screen page position (onScroll), -0.5 to 0.5, eased towards
        this.pan = 0;
        this.panTarget = 0;

        // Configuration
        this.config = WP.settings.load();

        this.setupColorPalettes();
    }

    saveConfig() {
        WP.settings.save(this.config);
    }

    setupColorPalettes() {
        this.colorPalettes = {
            blue: [
                { r: 30, g: 60, b: 120 },   // Dark blue (closest)
                { r: 50, g: 90, b: 150 },   // Medium blue
                { r: 70, g: 120, b: 180 },  // Light blue
                { r: 100, g: 150, b: 200 }  // Very light blue (furthest)
            ],
            purple: [
                { r: 60, g: 30, b: 120 },   // Dark purple
                { r: 90, g: 50, b: 150 },   // Medium purple
                { r: 120, g: 70, b: 180 },  // Light purple
                { r: 150, g: 100, b: 200 }  // Very light purple
            ],
            sunset: [
                { r: 120, g: 30, b: 60 },   // Dark red
                { r: 150, g: 60, b: 80 },   // Medium red
                { r: 180, g: 100, b: 120 }, // Light red
                { r: 200, g: 140, b: 160 }  // Pink
            ],
            monochrome: [
                { r: 40, g: 40, b: 40 },    // Dark gray
                { r: 80, g: 80, b: 80 },    // Medium gray
                { r: 120, g: 120, b: 120 }, // Light gray
                { r: 160, g: 160, b: 160 }  // Very light gray
            ],
            green: [
                { r: 30, g: 80, b: 30 },    // Dark green
                { r: 50, g: 120, b: 50 },   // Medium green
                { r: 80, g: 150, b: 80 },   // Light green
                { r: 120, g: 180, b: 120 }  // Very light green
            ]
        };
    }

    async init() {
        this.createCanvas();
        this.generateMountainLayers();
        console.log('Mountains animation manager initialized');
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'mountains-canvas';
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
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.generateMountainLayers();
        });
    }

    resizeCanvas() {
        if (!this.canvas) return;

        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    // --- Color helpers -----------------------------------------------------

    rgb(color, alpha = 1) {
        const r = Math.round(color.r), g = Math.round(color.g), b = Math.round(color.b);
        return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    mix(a, b, t) {
        return {
            r: a.r + (b.r - a.r) * t,
            g: a.g + (b.g - a.g) * t,
            b: a.b + (b.b - a.b) * t
        };
    }

    // --- Ridgeline generation ----------------------------------------------
    //
    // Each layer is one continuous ridgeline rather than a set of overlapping
    // mountain "objects". Alternating peak/valley anchors set the large-scale
    // shape, then recursive midpoint displacement roughens every span, which is
    // what gives real mountains their self-similar jagged profile.

    generateMountainLayers() {
        if (!this.canvas || !this.canvas.width) return;

        this.mountainLayers = [];
        const colors = this.colorPalettes[this.config.colorPalette] || this.colorPalettes.blue;
        const layerCount = Math.max(2, this.config.layers);

        for (let layer = 0; layer < layerCount; layer++) {
            // depth: 0 = furthest range, 1 = nearest range
            const depth = layer / (layerCount - 1);

            // Furthest range scrolls slowest
            const speed = this.config.baseSpeed * Math.pow(this.config.speedMultiplier, layerCount - 1 - layer);

            // shade: 1 = lightest/haziest end of the palette, 0 = darkest.
            // By default distant ranges take the light end (atmospheric
            // perspective); inverted, the near ranges do. colors[] runs
            // dark -> light. Haze and snow tint follow shade, not depth, so the
            // whole scene stays coherent either way round.
            const shade = this.config.invertPalette ? depth : 1 - depth;
            const colorIndex = Math.round(shade * (colors.length - 1));

            // Distant ranges stand tallest on screen; nearer ranges sit lower and
            // overlap in front of them.
            const peakElevation = this.canvas.height * this.config.mountainHeight * (1 - depth * 0.42);
            const peaksPerScreen = Math.max(1, this.config.mountainsPerLayer);

            const layerData = {
                points: [],
                speed: speed,
                color: colors[colorIndex],
                depth: depth,
                shade: shade,
                baseY: this.canvas.height,
                peakElevation: peakElevation,
                valleyElevation: peakElevation * 0.5,
                // Nearer ranges have larger, wider landforms
                spacing: (this.canvas.width / peaksPerScreen) * (0.6 + depth * 0.4),
                nextIsPeak: true,
                lastPeak: peakElevation,
                // Only the genuinely tall ranges get snow
                snow: peakElevation > this.canvas.height * 0.34
            };

            // Seed off-screen left so the ridge enters cleanly
            layerData.points.push({
                x: -layerData.spacing,
                y: layerData.baseY - layerData.valleyElevation
            });
            this.extendRidge(layerData);

            this.mountainLayers.push(layerData);
        }
    }

    // Append anchors (and their displaced detail) until the ridge runs past the
    // right edge of the canvas.
    extendRidge(layer) {
        const limit = this.canvas.width + layer.spacing + this.panMargin();
        let guard = 0;

        while (layer.points[layer.points.length - 1].x < limit && guard++ < 500) {
            const prev = layer.points[layer.points.length - 1];
            const step = layer.spacing * 0.5 * (0.6 + Math.random() * 0.8);

            const isPeak = layer.nextIsPeak;
            let elevation;
            if (isPeak) {
                elevation = layer.peakElevation * (1 - this.config.heightVariation * Math.random());
                layer.lastPeak = elevation;
            } else {
                // Saddles are measured against the summit they descend from, so a
                // low peak never ends up below the notch beside it. A range reads
                // as one connected massif, not a row of separate cones.
                elevation = layer.lastPeak * (0.5 + Math.random() * 0.28);
            }

            const next = { x: prev.x + step, y: layer.baseY - elevation };

            this.displaceSegment(prev, next, this.initialDisplacement(prev, next), layer, layer.points);
            layer.points.push(next);

            // Give each summit a short crest instead of a single vertex, so it
            // reads as a blunt massif rather than a needle
            if (isPeak) {
                const shoulder = step * (0.1 + Math.random() * 0.14);
                layer.points.push({
                    x: next.x + shoulder,
                    y: next.y + shoulder * (0.35 + Math.random() * 0.5)
                });
            }

            layer.nextIsPeak = !layer.nextIsPeak;
        }
    }

    initialDisplacement(p0, p1) {
        const dx = p1.x - p0.x;
        const dy = Math.abs(p1.y - p0.y);
        // Keep this small relative to the span: the straight anchor-to-anchor
        // flank should stay readable, with displacement only roughening it.
        return (dy * 0.18 + dx * 0.07) * this.config.peakiness;
    }

    // Recursive midpoint displacement. Pushes only the interior points, in
    // left-to-right order, so the caller's array stays sorted by x.
    displaceSegment(p0, p1, displacement, layer, out) {
        const dx = p1.x - p0.x;
        if (dx < 6) return;

        const minY = layer.baseY - layer.peakElevation * 1.02;
        const maxY = layer.baseY - layer.valleyElevation * 0.3;

        // Bias the midpoint slightly toward the higher end of the span, which
        // bulges each flank a little above the straight line: summits round off
        // instead of converging to a needle, while the saddles stay cut sharply.
        const higherY = Math.min(p0.y, p1.y);
        const linearY = (p0.y + p1.y) / 2;
        let midY = linearY + (higherY - linearY) * 0.07 + (Math.random() * 2 - 1) * displacement;
        midY = Math.max(minY, Math.min(maxY, midY));

        const mid = { x: (p0.x + p1.x) / 2, y: midY };
        const decay = 0.45 + this.config.peakiness * 0.15;

        this.displaceSegment(p0, mid, displacement * decay, layer, out);
        out.push(mid);
        this.displaceSegment(mid, p1, displacement * decay, layer, out);
    }

    start() {
        if (this.isEnabled) return;

        this.isEnabled = true;
        this.canvas.style.display = 'block';
        this.generateMountainLayers();
        this.lastTime = 0;
        this.animate(0);
        console.log('Mountains animation started');
    }

    stop() {
        if (!this.isEnabled) return;

        this.isEnabled = false;
        this.canvas.style.display = 'none';

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('Mountains animation stopped');
    }

    // dt in seconds. Speeds are pixels per 60 fps frame, as they always were.
    updateMountains(dt) {
        const margin = 20 + this.panMargin();
        for (const layer of this.mountainLayers) {
            for (const point of layer.points) {
                point.x -= layer.speed * 60 * dt;
            }

            // Drop points that have scrolled off the left, keeping one behind the
            // edge so the silhouette still enters from off-screen
            let cut = 0;
            while (cut + 2 < layer.points.length && layer.points[cut + 1].x < -margin) cut++;
            if (cut > 0) layer.points.splice(0, cut);

            this.extendRidge(layer);
        }
    }

    // Build the crest line and the closed silhouette (crest down to the canvas
    // floor) once per frame, so fill/clip/stroke can share them
    buildPaths(layer) {
        const points = layer.points;
        const crest = new Path2D();
        const silhouette = new Path2D();

        // The silhouette must be traced out explicitly rather than built from
        // the crest with addPath(): addPath() appends a *separate* subpath, so
        // the closePath() below would cut straight back to the crest's start
        // instead of running down the left edge, filling a phantom wedge.
        crest.moveTo(points[0].x, points[0].y);
        silhouette.moveTo(points[0].x, layer.baseY);
        silhouette.lineTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            crest.lineTo(points[i].x, points[i].y);
            silhouette.lineTo(points[i].x, points[i].y);
        }

        silhouette.lineTo(points[points.length - 1].x, layer.baseY);
        silhouette.closePath();

        return { crest, silhouette };
    }

    drawRidge(layer) {
        if (layer.points.length < 2) return;

        const ctx = this.ctx;
        const color = layer.color;
        const topY = layer.baseY - layer.peakElevation;
        const { crest, silhouette } = this.buildPaths(layer);

        ctx.save();
        ctx.translate(this.panOffset(layer), 0);

        // Silhouette, hazier toward its base on the lighter ranges
        const haze = 0.3 * layer.shade;
        const gradient = ctx.createLinearGradient(0, topY, 0, layer.baseY);
        gradient.addColorStop(0, this.rgb(color));
        gradient.addColorStop(1, this.rgb(this.mix(color, { r: 255, g: 255, b: 255 }, haze)));
        ctx.fillStyle = gradient;
        ctx.fill(silhouette);

        // Snow above the snowline, clipped to the silhouette so it caps only the
        // peaks that actually reach that high
        if (this.config.snowCaps && layer.snow) {
            const snowY = layer.baseY - layer.peakElevation * 0.68;
            const snowColor = this.mix(color, { r: 255, g: 255, b: 255 }, 0.52 + layer.shade * 0.2);

            ctx.save();
            ctx.clip(silhouette);

            const snowGradient = ctx.createLinearGradient(0, snowY - layer.peakElevation * 0.2, 0, snowY);
            snowGradient.addColorStop(0, this.rgb(snowColor, 1));
            snowGradient.addColorStop(1, this.rgb(snowColor, 0));
            ctx.fillStyle = snowGradient;
            ctx.fillRect(-this.canvas.width, 0, this.canvas.width * 3, snowY);
            ctx.restore();
        }

        // Lit ridge line along the crest
        if (this.config.ridgeLines) {
            ctx.strokeStyle = this.rgb(this.mix(color, { r: 255, g: 255, b: 255 }, 0.4), 0.85);
            ctx.lineWidth = 1 + (1 - layer.depth) * 0.6;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.stroke(crest);
        }

        ctx.restore();
    }

    // Swiping between home screens (SPEC §6.4): x runs 0 to 1. The near
    // ranges slide further than the distant ones.
    onScroll(x) {
        this.panTarget = x - 0.5;
    }

    // How far a layer slides at the end of the swipe range, and the extra
    // ridge kept beyond each edge so sliding never shows its end.
    panOffset(layer) {
        return -this.pan * this.canvas.width * 0.12 * (0.2 + 0.8 * layer.depth);
    }

    panMargin() {
        return this.canvas.width * 0.06;
    }

    animate(now) {
        if (!this.isEnabled) return;

        // By elapsed time, so every frame rate scrolls at the same speed;
        // clamped, so a long pause doesn't jump.
        const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.1) : 0;
        this.lastTime = now;
        this.pan += (this.panTarget - this.pan) * (1 - Math.exp(-dt * 4));

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Scroll ridgelines and top them up on the right
        this.updateMountains(dt);

        // Draw back to front: layer 0 is the furthest range
        for (const layer of this.mountainLayers) {
            this.drawRidge(layer);
        }

        this.animationId = requestAnimationFrame(time => this.animate(time));
    }

    destroy() {
        this.stop();
        if (this.canvas) {
            document.body.removeChild(this.canvas);
        }
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MountainsAnimationManager;
}