// Falling Leaves Animation Module
class LeavesAnimationManager {
    constructor(host) {
        this.host = host;
        this.canvas = null;
        this.ctx = null;
        this.leaves = [];
        this.isEnabled = false;
        this.animationId = null;
        this.windSystem = null;

        this.lastTime = 0;

        // Leaves that have come to rest on the ground
        this.settled = [];
        this.pileHeights = [];
        this.pileSegment = 12;              // px per height-field column
        // Almost all of a leaf's bulk stays on its own column; see applyPile
        this.pileSpread = [0.86, 0.06, 0.01];

        // Per-column share of the maximum depth. This is what turns the drift
        // into separate banks instead of one level carpet: a column's leaves
        // stop being accepted at its own ceiling, not at a single global one.
        this.driftProfile = null;

        // The drift runs to a couple of thousand leaves, far too many to redraw
        // as vector paths every frame, so it is painted once into its own canvas
        // and only repainted when something actually disturbs it.
        this.pileCanvas = null;
        this.pileCtx = null;
        this.pileDirty = true;

        // Baked leaf images, keyed by type/colour/face. Settled leaves are drawn
        // from these rather than re-tracing an outline and building a gradient.
        this.leafSprites = null;

        // Configuration
        this.config = WP.settings.load();

        this.setupLeafData();
    }

    saveConfig() {
        WP.settings.save(this.config);
    }

    // Smooth interpolation of radius between polar control points
    polarSample(controls, samples) {
        const points = [];
        for (let i = 0; i <= samples; i++) {
            const angle = controls[0].a + (controls[controls.length - 1].a - controls[0].a) * (i / samples);

            let k = 0;
            while (k < controls.length - 2 && controls[k + 1].a < angle) k++;

            const span = controls[k + 1].a - controls[k].a;
            const t = span === 0 ? 0 : (angle - controls[k].a) / span;
            const smooth = 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t)));
            const r = controls[k].r + (controls[k + 1].r - controls[k].r) * smooth;

            points.push([Math.sin(angle) * r, -Math.cos(angle) * r]);
        }
        return points;
    }

    // Scale and centre an outline so every leaf type occupies the same
    // normalised box: blade length 1, centred on the origin
    normalizeOutline(outline) {
        let minY = Infinity, maxY = -Infinity;
        for (const [, y] of outline) {
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }

        const scale = 1 / (maxY - minY);
        const shift = (minY + maxY) / 2;
        return outline.map(([x, y]) => [x * scale, (y - shift) * scale]);
    }

    setupLeafData() {
        // Blades described as half-width along the midrib: u = 0 at the tip,
        // u = 1 at the base. Exponents above 1 put the widest point below the
        // middle, which is what makes a leaf read as ovate rather than as a
        // teardrop hanging point-down.
        const profiles = {
            // Shallow rounded lobes down a fairly narrow blade
            oak: (u) => 0.4 * Math.sin(Math.PI * Math.pow(u, 1.2)) *
                        (1 + 0.24 * Math.cos(7 * Math.PI * u)),
            // Plain ovate blade
            birch: (u) => 0.44 * Math.sin(Math.PI * Math.pow(u, 1.35)),
            // Long and narrow with a drawn-out tip
            elm: (u) => 0.32 * Math.sin(Math.PI * Math.pow(u, 1.5))
        };

        // Blade length in pixels at scale 1
        const sizes = { maple: 21, oak: 19, birch: 16, elm: 21 };
        const samples = 56;

        this.leafShapes = {};

        for (const [type, profile] of Object.entries(profiles)) {
            const right = [];
            const left = [];

            for (let i = 0; i <= samples; i++) {
                const u = i / samples;
                const w = Math.max(0, profile(u));
                const y = -0.5 + u;
                right.push([w, y]);
                left.push([-w, y]);
            }

            // Down the right margin from the tip, back up the left
            this.leafShapes[type] = { outline: right.concat(left.reverse()), size: sizes[type] };
        }

        // A maple is five lobes radiating from where the stalk joins, so it is
        // built in polar coordinates rather than as a width profile - a profile
        // can only bulge sideways and cannot produce real lobes.
        const tip = (a, r) => ({ a, r });
        this.leafShapes.maple = {
            outline: this.normalizeOutline(this.polarSample([
                tip(-2.55, 0.10),  // stalk joint, left side
                tip(-2.05, 0.60),  // outer left lobe
                tip(-1.55, 0.34),  // sinus
                tip(-1.00, 0.88),  // inner left lobe
                tip(-0.52, 0.40),  // sinus
                tip(0, 1.0),       // central lobe
                tip(0.52, 0.40),
                tip(1.00, 0.88),
                tip(1.55, 0.34),
                tip(2.05, 0.60),
                tip(2.55, 0.10)
            ], 96)),
            size: sizes.maple
        };

        // Veins and stalk, measured off whatever outline each type ended up with
        for (const shape of Object.values(this.leafShapes)) {
            let maxY = -Infinity;
            for (const [, y] of shape.outline) if (y > maxY) maxY = y;

            const veins = [];
            for (const frac of [0.3, 0.48, 0.66, 0.84]) {
                const y = -0.5 + frac;

                // Widest point of the blade at this height
                let w = 0;
                for (const [px, py] of shape.outline) {
                    if (Math.abs(py - y) < 0.04) w = Math.max(w, Math.abs(px));
                }
                if (w < 0.05) continue;

                veins.push([0, y, w * 0.75, y - 0.12]);
                veins.push([0, y, -w * 0.75, y - 0.12]);
            }

            shape.veins = veins;
            shape.stemY = maxY;
            shape.stem = 0.2;

            // Extent of everything that gets drawn, stem included, so a sprite
            // baked from this shape can be positioned back onto the same box
            let minX = Infinity, maxX = -Infinity, minPy = Infinity;
            for (const [x, y] of shape.outline) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minPy) minPy = y;
            }
            shape.bounds = {
                minX,
                maxX,
                minY: minPy,
                maxY: shape.stemY + shape.stem
            };
        }

        this.seasonalPalettes = {
            autumn: [
                { r: 255, g: 69, b: 0 },    // Red
                { r: 255, g: 140, b: 0 },   // Orange
                { r: 255, g: 215, b: 0 },   // Gold
                { r: 218, g: 165, b: 32 },  // Goldenrod
                { r: 139, g: 69, b: 19 },   // Brown
                { r: 255, g: 99, b: 71 }    // Tomato
            ],
            late_autumn: [
                { r: 139, g: 69, b: 19 },   // Brown
                { r: 160, g: 82, b: 45 },   // Saddle brown
                { r: 210, g: 180, b: 140 }, // Tan
                { r: 205, g: 133, b: 63 },  // Peru
                { r: 222, g: 184, b: 135 }, // Burlywood
                { r: 188, g: 143, b: 143 }  // Rosy brown
            ],
            early_winter: [
                { r: 139, g: 69, b: 19 },   // Brown
                { r: 105, g: 105, b: 105 }, // Dim gray
                { r: 119, g: 136, b: 153 }, // Light slate gray
                { r: 112, g: 128, b: 144 }, // Slate gray
                { r: 128, g: 128, b: 128 }, // Gray
                { r: 169, g: 169, b: 169 }  // Dark gray
            ]
        };
    }

    async init() {
        this.createCanvas();
        this.windSystem = new LeavesWindSystem(this.config);
        console.log('Leaves animation manager initialized');
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'leaves-canvas';
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
        this.initPile();
    }

    // Ground line: the leaves rest on top of the status bar, not behind it
    groundLevel() {
        const barHeight = this.host.insets.bottom;
        return this.canvas.height - barHeight;
    }

    initPile() {
        if (!this.canvas) return;

        const segments = Math.ceil(this.canvas.width / this.pileSegment) + 1;
        this.pileHeights = new Array(segments).fill(0);

        // A resized canvas invalidates every resting position, so start the
        // drift over rather than leaving leaves hanging in mid-air
        this.settled = [];

        if (!this.pileCanvas) {
            this.pileCanvas = document.createElement('canvas');
            this.pileCtx = this.pileCanvas.getContext('2d');
        }
        this.pileCanvas.width = this.canvas.width;
        this.pileCanvas.height = this.canvas.height;

        if (!this.leafSprites) this.buildLeafSprites();

        this.buildDriftProfile();
        this.pileDirty = true;
        this.seedPile();
    }

    // Deepest the drift is allowed to get, as a share of the viewport
    pileCeiling() {
        if (!this.canvas) return 0;
        return this.canvas.height * Math.max(0, Math.min(0.5, this.config.pileDepth));
    }

    columnCap(index) {
        const profile = this.driftProfile;
        const share = profile && index >= 0 && index < profile.length ? profile[index] : 1;
        return this.pileCeiling() * share;
    }

    // A few low-frequency waves summed together, normalised so the peaks reach
    // the full depth and the troughs sit at a fraction of it. Because a column
    // stops accepting leaves at its own ceiling rather than a shared one, this
    // profile is what the drift grows into: banks where the profile is high,
    // thin cover where it is low.
    buildDriftProfile() {
        const n = this.pileHeights.length;
        this.driftProfile = new Float32Array(n);
        if (n === 0) return;

        const waves = [];
        for (let k = 0; k < 4; k++) {
            waves.push({
                freq: (0.7 + k * 1.6) * (0.75 + Math.random() * 0.5),
                phase: Math.random() * Math.PI * 2,
                amp: 1 / (k + 1)
            });
        }

        const raw = new Float32Array(n);
        let min = Infinity;
        let max = -Infinity;

        for (let i = 0; i < n; i++) {
            const u = i / n;
            let v = 0;
            for (const wave of waves) {
                v += wave.amp * Math.sin(u * Math.PI * 2 * wave.freq + wave.phase);
            }
            raw[i] = v;
            if (v < min) min = v;
            if (v > max) max = v;
        }

        const unevenness = Math.max(0, Math.min(1, this.config.pileUnevenness));
        const floor = 1 - unevenness * 0.85;
        const span = max - min || 1;

        for (let i = 0; i < n; i++) {
            this.driftProfile[i] = floor + (1 - floor) * ((raw[i] - min) / span);
        }
    }

    // A new tab is often open for seconds, so waiting for the drift to build
    // itself out of falling leaves would mean never seeing one. Seeding runs the
    // real settling path rather than faking heights, so the result is identical
    // to a pile that accumulated on its own.
    seedPile() {
        if (!this.config.collectLeaves || !this.config.preSeedPile) return;
        if (this.pileCeiling() <= 0 || this.pileHeights.length === 0) return;

        const ground = this.groundLevel();

        for (let pass = 0; pass < 600; pass++) {
            let placed = 0;

            for (let i = 0; i < this.pileHeights.length; i++) {
                if (this.settled.length >= this.config.maxSettled) break;

                const leaf = this.createLeaf();
                if (!this.canAbsorb(i, leaf)) continue;

                leaf.x = i * this.pileSegment + Math.random() * this.pileSegment;
                this.settleLeaf(leaf, ground - this.pileHeights[i], i);
                placed++;
            }

            if (placed === 0 || this.settled.length >= this.config.maxSettled) break;
        }

        this.pileDirty = true;
    }

    // How much height a leaf claims. This is what packing density means here:
    // the less each leaf accounts for, the more of them it takes to fill the
    // drift to the same depth.
    pileContribution(leaf) {
        return leaf.size * 0.3 / Math.max(0.2, this.config.pileDensity);
    }

    // Whether this particular leaf fits under the column's ceiling, and whether
    // the drift as a whole is under its budget.
    //
    // Testing the actual leaf matters: accepting one that then has to be clamped
    // would draw a whole leaf while raising the surface by a sliver, and those
    // part-counted arrivals are what packed the old crust along the top. Leaf
    // sizes vary, so a column that turns away a large leaf may still take a
    // small one, which finishes the surface off unevenly rather than flat.
    canAbsorb(index, leaf) {
        if (this.settled.length >= this.config.maxSettled) return false;
        const add = this.pileContribution(leaf) * this.pileSpread[0];
        return this.pileHeights[index] + add <= this.columnCap(index);
    }

    pileIndex(x) {
        return Math.max(0, Math.min(this.pileHeights.length - 1, Math.floor(x / this.pileSegment)));
    }

    // Spread a leaf's bulk over neighbouring columns so the drift builds a
    // rounded bank instead of a set of disconnected towers.
    //
    // The weights are deliberately almost all on the leaf's own column. They
    // used to be [0.45, 0.28, 0.12], which meant a column rose mostly on its
    // neighbours' leaves - so once those neighbours reached their ceiling the
    // surface climbed nearly three times slower per leaf drawn, and the last
    // arrivals packed into a dense crust along the top. Keeping the bulk local
    // makes height per leaf near enough constant all the way up; the drift
    // profile is what shapes the banks now, so the smoothing is not needed.
    applyPile(index, amount, sign) {
        const spread = this.pileSpread;

        for (let offset = -2; offset <= 2; offset++) {
            const i = index + offset;
            if (i < 0 || i >= this.pileHeights.length) continue;

            this.pileHeights[i] = Math.max(0, Math.min(
                this.columnCap(i),
                this.pileHeights[i] + sign * amount * spread[Math.abs(offset)]
            ));
        }
    }

    start() {
        if (this.isEnabled) return;

        this.isEnabled = true;
        this.canvas.style.display = 'block';
        this.leaves = [];
        this.lastTime = 0;
        this.initPile();
        this.windSystem?.reset();
        this.animate();
        console.log('Leaves animation started');
    }

    stop() {
        if (!this.isEnabled) return;

        this.isEnabled = false;
        this.canvas.style.display = 'none';

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('Leaves animation stopped');
    }

    mixColor(a, b, t) {
        return {
            r: Math.round(a.r + (b.r - a.r) * t),
            g: Math.round(a.g + (b.g - a.g) * t),
            b: Math.round(a.b + (b.b - a.b) * t)
        };
    }

    createLeaf() {
        const leafType = this.config.leafTypes[Math.floor(Math.random() * this.config.leafTypes.length)];
        const leafData = this.leafShapes[leafType];
        const palette = this.seasonalPalettes[this.config.seasonalColors];
        const colorIndex = Math.floor(Math.random() * palette.length);
        const color = palette[colorIndex];

        // Depth: 0 is far back, 1 is close to the viewer. Distant leaves are
        // smaller, slower, paler and drawn first.
        const depth = Math.random();

        return {
            x: Math.random() * (this.canvas.width + 240) - 120,
            y: -leafData.size * 1.5,
            depth: depth,

            // Sideways drift, plus the fall rate this leaf would have edge-on
            drift: (Math.random() - 0.5) * 12,
            fall: (this.config.fallSpeed + (Math.random() - 0.5) * this.config.fallSpeedVariation) *
                  (0.6 + depth * 0.75) * 60,

            // Tumble about the leaf's long axis. cos(flip) gives how face-on the
            // leaf is: +-1 is flat to the viewer, 0 is edge-on and nearly
            // invisible. This is what makes real falling leaves flash.
            flip: Math.random() * Math.PI * 2,
            flipSpeed: (0.7 + Math.random() * 2.2) * (Math.random() < 0.5 ? -1 : 1),

            // Slow rotation in the image plane
            spin: Math.random() * Math.PI * 2,
            spinSpeed: (Math.random() - 0.5) * 1.1,

            // Side-to-side flutter, coupled to a rocking of the leaf
            swayPhase: Math.random() * Math.PI * 2,
            swaySpeed: 1.1 + Math.random() * 1.8,

            type: leafType,
            color: color,
            colorIndex: colorIndex,
            underColor: this.mixColor(color, { r: 206, g: 196, b: 172 }, 0.45),
            size: leafData.size * (0.8 + Math.random() * this.config.leafSizeVariation) *
                  (0.72 + depth * 0.7),
            opacity: (this.config.leafOpacity + (Math.random() - 0.5) * 0.2) * (0.55 + depth * 0.45),
            flatten: 1,   // vertical squash, used once the leaf is lying down
            lift: 0,      // decaying upward impulse from a gust
            age: 0
        };
    }

    updateLeaves(dt) {
        const windForce = this.windSystem?.getCurrentWindForce() || { x: 0, y: 0 };

        // Spawn new leaves. spawnRate is a per-60fps-frame probability.
        if (Math.random() < this.config.spawnRate * dt * 60 && this.leaves.length < this.config.maxLeaves) {
            this.leaves.push(this.createLeaf());
        }

        for (let i = this.leaves.length - 1; i >= 0; i--) {
            const leaf = this.leaves[i];

            leaf.flip += leaf.flipSpeed * dt;
            leaf.spin += leaf.spinSpeed * dt;
            leaf.swayPhase += leaf.swaySpeed * dt;

            // How square-on the blade is to the airflow, 0 (edge) to 1 (flat)
            const presentation = Math.cos(leaf.flip);
            const flatness = Math.abs(presentation);

            // A leaf falling flat catches far more air than one slicing through
            // it edge-on, so it sinks slower. That coupling between attitude and
            // descent rate is what gives leaves their hesitant, stalling fall.
            const fallRate = leaf.fall * (1.3 - 0.55 * flatness);

            // Flutter: the blade planes sideways while it is flat, and the swing
            // rocks it, so sway and spin share a phase
            const sway = Math.sin(leaf.swayPhase) * this.config.swayAmount * 22 * (0.35 + 0.65 * flatness);

            leaf.x += (leaf.drift + sway + windForce.x * 60) * dt;
            leaf.y += (fallRate - leaf.lift + windForce.y * 60) * dt;

            // Upward kick from a gust bleeds off in about a second
            if (leaf.lift > 0) {
                leaf.lift *= Math.pow(0.22, dt);
                if (leaf.lift < 1) leaf.lift = 0;
            }

            leaf.presentation = presentation;
            leaf.rock = Math.sin(leaf.swayPhase) * 0.45;

            leaf.age += dt;

            // Come to rest on the ground, or on whatever has already piled up
            if (this.config.collectLeaves && leaf.lift === 0 &&
                leaf.x > 0 && leaf.x < this.canvas.width) {
                const index = this.pileIndex(leaf.x);
                const restY = this.groundLevel() - this.pileHeights[index];

                if (leaf.y >= restY) {
                    if (this.canAbsorb(index, leaf)) {
                        this.settleLeaf(leaf, restY, index);
                        this.leaves.splice(i, 1);
                        continue;
                    }

                    // The bank here is as deep as it goes. Retiring an old leaf
                    // to make room would mean repainting the whole drift several
                    // times a second, so the new one sinks into the mass instead
                    // - which is what landing on a foot of leaves looks like.
                    leaf.y = restY;
                    leaf.rock = 0;
                    leaf.flatten = 0.5;
                    leaf.presentation = 0.9;
                    leaf.sinking = (leaf.sinking || 0) + dt;
                    leaf.opacity *= Math.pow(0.015, dt);

                    if (leaf.sinking > 0.55) this.leaves.splice(i, 1);
                    continue;
                }
            }

            // Off-screen only - the old code also culled on age, so leaves would
            // wink out in mid-air. The age cap here is just a safety net.
            const margin = leaf.size * 3;
            if (leaf.y > this.canvas.height + margin ||
                leaf.x < -margin - 120 ||
                leaf.x > this.canvas.width + margin + 120 ||
                leaf.age > 120) {
                this.leaves.splice(i, 1);
            }
        }

        // Far leaves first so near ones overlap them
        this.leaves.sort((a, b) => a.depth - b.depth);

        this.scatterPile(windForce, dt);
    }

    settleLeaf(leaf, restY, index) {
        // On the ground we see the leaf close to face-on, lying at any angle,
        // squashed vertically because we are looking across it rather than at it
        // Jitter the resting height a little, otherwise everything lines up on
        // exactly the same row and reads as a drawn line rather than a scatter
        leaf.y = restY - leaf.size * 0.15 - Math.random() * leaf.size * 0.55;
        leaf.spin = (Math.random() - 0.5) * Math.PI * 2;
        leaf.rock = 0;
        leaf.presentation = (Math.random() < 0.5 ? -1 : 1) * (0.82 + Math.random() * 0.18);
        leaf.flatten = 0.48 + Math.random() * 0.22;
        leaf.lift = 0;

        leaf.pileIndex = index;
        leaf.pileAdd = this.pileContribution(leaf);
        this.applyPile(index, leaf.pileAdd, 1);

        this.settled.push(leaf);

        // One leaf added is one leaf to paint; the rest of the drift is already
        // on the canvas. A pending full repaint would only overwrite this.
        if (this.pileCtx && !this.pileDirty) {
            this.drawSettledLeaf(this.pileCtx, leaf);
        }
    }

    // A strong enough gust lifts leaves back out of the drift
    scatterPile(windForce, dt) {
        if (!this.config.collectLeaves || this.settled.length === 0) return;

        const gust = Math.abs(windForce.x);

        // Rate per second, not per frame. As a per-frame roll this fired around
        // four times a second and stripped the ground bare during every gust.
        if (gust < 0.32 || Math.random() > 0.5 * dt) return;

        const count = 1 + Math.floor(Math.random() * 3);
        for (let n = 0; n < count && this.settled.length; n++) {
            const pick = Math.floor(Math.random() * this.settled.length);
            const leaf = this.settled.splice(pick, 1)[0];
            this.applyPile(leaf.pileIndex, leaf.pileAdd, -1);

            leaf.flatten = 1;
            leaf.lift = 70 + Math.random() * 110;
            leaf.drift = windForce.x * 60 * (0.7 + Math.random() * 0.9);
            leaf.flip = Math.random() * Math.PI * 2;
            leaf.swayPhase = Math.random() * Math.PI * 2;
            leaf.age = 0;

            this.leaves.push(leaf);
            this.pileDirty = true;
        }
    }

    // The blade itself, in unit shape coordinates. Shared by the live vector
    // path and by the sprite baker so the drift cannot drift out of step with
    // the leaves still in the air.
    paintLeafShape(ctx, shape, base, alpha, veinWidth, stemWidth) {
        // Shaded across its width so it reads as a curved surface rather than a
        // flat cut-out
        const lit = this.mixColor(base, { r: 255, g: 244, b: 214 }, 0.3);
        const shadow = this.mixColor(base, { r: 40, g: 22, b: 8 }, 0.42);
        const gradient = ctx.createLinearGradient(-0.5, -0.4, 0.5, 0.4);
        gradient.addColorStop(0, `rgba(${lit.r}, ${lit.g}, ${lit.b}, ${alpha})`);
        gradient.addColorStop(0.55, `rgba(${base.r}, ${base.g}, ${base.b}, ${alpha})`);
        gradient.addColorStop(1, `rgba(${shadow.r}, ${shadow.g}, ${shadow.b}, ${alpha})`);

        ctx.beginPath();
        const outline = shape.outline;
        ctx.moveTo(outline[0][0], outline[0][1]);
        for (let i = 1; i < outline.length; i++) {
            ctx.lineTo(outline[i][0], outline[i][1]);
        }
        ctx.closePath();

        ctx.fillStyle = gradient;
        ctx.fill();

        // Veins and midrib
        const vein = this.mixColor(base, { r: 60, g: 34, b: 12 }, 0.4);
        ctx.strokeStyle = `rgba(${vein.r}, ${vein.g}, ${vein.b}, ${alpha * 0.55})`;
        ctx.lineWidth = veinWidth;
        ctx.beginPath();
        ctx.moveTo(0, -0.46);
        ctx.lineTo(0, shape.stemY);
        for (const [x1, y1, x2, y2] of shape.veins) {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        }
        ctx.stroke();

        // Stem
        ctx.strokeStyle = `rgba(${shadow.r}, ${shadow.g}, ${shadow.b}, ${alpha * 0.85})`;
        ctx.lineWidth = stemWidth;
        ctx.beginPath();
        ctx.moveTo(0, shape.stemY);
        ctx.lineTo(0, shape.stemY + shape.stem);
        ctx.stroke();
    }

    // One image per leaf type, palette colour and face. Forty-eight small
    // canvases replace several thousand outline traces per repaint of the drift.
    buildLeafSprites() {
        const palette = this.seasonalPalettes[this.config.seasonalColors];
        const px = 72;
        this.leafSprites = {};

        for (const [type, shape] of Object.entries(this.leafShapes)) {
            const b = shape.bounds;
            const boxWidth = b.maxX - b.minX;
            const boxHeight = b.maxY - b.minY;
            const scale = px / Math.max(boxWidth, boxHeight);

            for (let index = 0; index < palette.length; index++) {
                for (const faceUp of [true, false]) {
                    const base = faceUp
                        ? palette[index]
                        : this.mixColor(palette[index], { r: 206, g: 196, b: 172 }, 0.45);

                    const sprite = document.createElement('canvas');
                    sprite.width = Math.max(1, Math.ceil(boxWidth * scale));
                    sprite.height = Math.max(1, Math.ceil(boxHeight * scale));

                    const sctx = sprite.getContext('2d');
                    sctx.translate(-b.minX * scale, -b.minY * scale);
                    sctx.scale(scale, scale);

                    // Line widths are chosen so that once the sprite is scaled
                    // down to a typical settled leaf the veins land at about the
                    // one pixel the vector path draws them at
                    this.paintLeafShape(sctx, shape, base, 1, 3.2 / scale, 5 / scale);

                    this.leafSprites[`${type}|${index}|${faceUp ? 1 : 0}`] = sprite;
                }
            }
        }
    }

    drawLeaf(leaf, ctx = this.ctx) {
        const shape = this.leafShapes[leaf.type];
        const alpha = leaf.opacity;

        // Squashing x by cos(flip) rotates the blade about its own midrib. A
        // negative value means we are looking at the underside, which is paler.
        const presentation = leaf.presentation;
        const squash = Math.sign(presentation || 1) * Math.max(0.08, Math.abs(presentation));
        const faceUp = presentation >= 0;
        const base = faceUp ? leaf.color : leaf.underColor;

        ctx.save();
        ctx.translate(leaf.x, leaf.y);
        ctx.rotate(leaf.spin + leaf.rock);
        ctx.scale(leaf.size * squash, leaf.size * (leaf.flatten || 1));

        this.paintLeafShape(ctx, shape, base, alpha, 0.9 / leaf.size, 1.4 / leaf.size);

        ctx.restore();
    }

    // Settled leaves are static, so they are blitted from a baked sprite instead
    drawSettledLeaf(ctx, leaf) {
        const shape = this.leafShapes[leaf.type];
        const faceUp = leaf.presentation >= 0;
        const sprite = this.leafSprites &&
            this.leafSprites[`${leaf.type}|${leaf.colorIndex}|${faceUp ? 1 : 0}`];

        if (!sprite) {
            this.drawLeaf(leaf, ctx);
            return;
        }

        const b = shape.bounds;
        const sx = leaf.size * Math.max(0.08, Math.abs(leaf.presentation));
        const sy = leaf.size * (leaf.flatten || 1);

        ctx.save();
        ctx.globalAlpha = leaf.opacity;
        ctx.translate(leaf.x, leaf.y);
        ctx.rotate(leaf.spin);
        // Looking at the underside means looking at a mirrored leaf
        if (!faceUp) ctx.scale(-1, 1);
        ctx.drawImage(
            sprite,
            b.minX * sx,
            b.minY * sy,
            (b.maxX - b.minX) * sx,
            (b.maxY - b.minY) * sy
        );
        ctx.restore();
    }

    renderPileBuffer() {
        if (!this.pileCtx) return;

        this.pileCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.pileCtx.clearRect(0, 0, this.pileCanvas.width, this.pileCanvas.height);
        for (const leaf of this.settled) {
            this.drawSettledLeaf(this.pileCtx, leaf);
        }

        // Light reaches the top of a drift and not the bottom of it, which is
        // what gives the banks bulk rather than leaving them flat confetti.
        // Each pass shades everything more than a given depth below the local
        // surface, so the ramp follows the banks instead of running from one
        // flat line. Per-column gradient strips would do the same job but leave
        // a visible seam at every column boundary. source-atop keeps the shading
        // off the background showing between the banks.
        if (this.settled.length) {
            const ground = this.groundLevel();
            const ctx = this.pileCtx;
            const width = this.pileCanvas.width;

            ctx.globalCompositeOperation = 'source-atop';

            for (const [depth, alpha] of [[8, 0.13], [34, 0.15], [70, 0.16], [120, 0.18]]) {
                ctx.beginPath();
                ctx.moveTo(0, ground + 60);

                for (let i = 0; i < this.pileHeights.length; i++) {
                    const surface = ground - this.pileHeights[i] + depth;
                    ctx.lineTo(i * this.pileSegment, Math.min(ground + 60, surface));
                }

                ctx.lineTo(width, ground + 60);
                ctx.closePath();

                ctx.fillStyle = `rgba(10, 7, 4, ${alpha})`;
                ctx.fill();
            }

            ctx.globalCompositeOperation = 'source-over';
        }

        this.pileDirty = false;
    }

    animate(currentTime = 0) {
        if (!this.isEnabled) return;

        // Clamp the step so the first frame and any backgrounded-tab gap cannot
        // teleport every leaf across the screen at once
        if (!this.lastTime) this.lastTime = currentTime;
        const dt = Math.min((currentTime - this.lastTime) / 1000, 0.05);
        this.lastTime = currentTime;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.windSystem?.update();
        this.updateLeaves(dt);

        // The drift on the ground sits behind everything still in the air
        if (this.pileDirty) this.renderPileBuffer();
        if (this.pileCanvas) this.ctx.drawImage(this.pileCanvas, 0, 0);

        for (const leaf of this.leaves) {
            this.drawLeaf(leaf);
        }

        this.animationId = requestAnimationFrame((time) => this.animate(time));
    }

    destroy() {
        this.stop();
        if (this.canvas) {
            document.body.removeChild(this.canvas);
        }
    }
}

// Wind system for leaves with more complex behavior
class LeavesWindSystem {
    constructor(config) {
        this.config = config;
        this.currentWind = { x: 0, y: 0 };
        this.targetWind = { x: 0, y: 0 };
        this.windCounter = 0;
        this.windDuration = 0;
        this.windPhase = 'calm';
        this.gustTimer = 0;
    }

    update() {
        this.windCounter++;
        this.gustTimer++;

        if (this.windPhase === 'calm' && Math.random() < this.config.windChance) {
            this.startWind();
        }

        this.updateWindForce();
        this.addRandomGusts();
    }

    startWind() {
        this.windPhase = 'ramp-up';
        const angle = Math.random() * Math.PI * 2;
        const intensity = this.config.windIntensity * (0.5 + Math.random() * 0.5);

        this.targetWind.x = Math.cos(angle) * intensity;
        this.targetWind.y = Math.sin(angle) * intensity * 0.3; // Less vertical wind
        this.windDuration = this.config.windDuration + Math.random() * 120;
        this.windCounter = 0;
    }

    updateWindForce() {
        const rampDuration = 80;

        switch (this.windPhase) {
            case 'ramp-up':
                this.currentWind.x += (this.targetWind.x - this.currentWind.x) * 0.03;
                this.currentWind.y += (this.targetWind.y - this.currentWind.y) * 0.03;

                if (this.windCounter > rampDuration) {
                    this.windPhase = 'active';
                    this.windCounter = 0;
                }
                break;

            case 'active':
                // Add subtle variations
                this.currentWind.x += (Math.random() - 0.5) * 0.1;
                this.currentWind.y += (Math.random() - 0.5) * 0.05;

                if (this.windCounter > this.windDuration) {
                    this.windPhase = 'ramp-down';
                    this.windCounter = 0;
                }
                break;

            case 'ramp-down':
                this.currentWind.x *= 0.96;
                this.currentWind.y *= 0.96;

                if ((Math.abs(this.currentWind.x) < 0.1 && Math.abs(this.currentWind.y) < 0.1) ||
                    this.windCounter > rampDuration) {
                    this.windPhase = 'calm';
                    this.currentWind.x = 0;
                    this.currentWind.y = 0;
                    this.windCounter = 0;
                }
                break;

            case 'calm':
                // Bleed off whatever the gusts below have added. Without this
                // the calm phase has no damping at all, so stray gusts random
                // walk the wind upward and it never settles.
                this.currentWind.x *= 0.98;
                this.currentWind.y *= 0.98;
                break;
        }
    }

    addRandomGusts() {
        // Add small random gusts occasionally
        if (this.gustTimer > 60 && Math.random() < 0.01) {
            this.currentWind.x += (Math.random() - 0.5) * 2;
            this.currentWind.y += (Math.random() - 0.5) * 1;
            this.gustTimer = 0;
        }
    }

    getCurrentWindForce() {
        return {
            x: this.currentWind.x * 0.1,
            y: this.currentWind.y * 0.1
        };
    }

    reset() {
        this.currentWind = { x: 0, y: 0 };
        this.targetWind = { x: 0, y: 0 };
        this.windCounter = 0;
        this.windPhase = 'calm';
        this.gustTimer = 0;
    }
}