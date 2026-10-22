// Snow animation functionality

// Tree class for snow animation
// Snow sprites, drawn in code: an homage to the classic xsnow pixel art,
// built once into small canvases that drawImage() treats like images.
const SnowSprites = {
    // Paint a pixel pattern ('#' = on) in one colour.
    pattern(rows, color = '#ffffff') {
        const canvas = document.createElement('canvas');
        canvas.width = rows[0].length;
        canvas.height = rows.length;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color;
        rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && ctx.fillRect(x, y, 1, 1)));
        return canvas;
    },

    // Seven flakes, from soft specks to tiny crystals.
    flakes() {
        return [
            ['##', '##'],
            ['.#.', '###', '.#.'],
            ['..#..', '.###.', '#####', '.###.', '..#..'],
            ['#.#.#', '.###.', '##.##', '.###.', '#.#.#'],
            ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'],
            ['...#...', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '...#...'],
            ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
        ].map(rows => this.pattern(rows));
    },

    // A 56x56 three-tier pixel fir: deep green boughs with a bright edge,
    // snow settled on the upper edges, a trunk and a star.
    tree() {
        const size = 56, cx = 28;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const px = (x, y, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); };
        const tiers = [[26, 50, 26], [14, 36, 18], [4, 22, 12]];  // top, bottom, half-width; bottom tier first

        ctx.fillStyle = '#5b3a1e';
        ctx.fillRect(cx - 2, 49, 4, 7);

        for (const [top, bottom, halfWidth] of tiers) {
            // Half-width at a row: a concave bough that flares toward its tips.
            const reach = y => (y < top || y > bottom) ? -1 : halfWidth * Math.pow((y - top) / (bottom - top), 0.8);
            const inside = (x, y) => Math.abs(x - cx) <= reach(y);
            for (let y = top; y <= bottom; y++) {
                for (let x = 0; x < size; x++) {
                    if (!inside(x, y)) continue;
                    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
                    const snowy = !inside(x, y - 1) && ((x * 73856093) ^ (y * 19349663)) % 5 < 3;
                    px(x, y, snowy ? '#f4f8ff' : edge ? '#7cfc00' : '#1f6f2b');
                }
            }
        }

        for (const [dx, dy] of [[0, 0], [-1, 1], [1, 1], [0, 1], [0, 2]]) px(cx + dx, 1 + dy, '#ffd84a');
        return canvas;
    },
};

class Tree {
    constructor(x, y, scale = 1.0) {
        this.x = x;
        this.y = y;
        this.scale = scale;
    }

    draw(ctx, image) {
        if (image && image.width > 0 && image.height > 0) {
            // Draw actual tree image
            const width = image.width * this.scale;
            const height = image.height * this.scale;
            const drawX = this.x - width/2;
            const drawY = this.y - height;
            
            ctx.drawImage(image, drawX, drawY, width, height);
        } else {
            // Fallback: draw a simple triangle tree
            this.drawFallbackTree(ctx);
        }
    }

    drawFallbackTree(ctx) {
        const baseWidth = 40 * this.scale;
        const height = 60 * this.scale;
        const trunkWidth = 8 * this.scale;
        const trunkHeight = 15 * this.scale;
        
        ctx.save();
        
        // Draw tree (dark green triangle)
        ctx.fillStyle = '#0f5132';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y - height - trunkHeight); // Top point
        ctx.lineTo(this.x - baseWidth/2, this.y - trunkHeight); // Bottom left
        ctx.lineTo(this.x + baseWidth/2, this.y - trunkHeight); // Bottom right
        ctx.closePath();
        ctx.fill();
        
        // Draw trunk (brown rectangle)
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(this.x - trunkWidth/2, this.y - trunkHeight, trunkWidth, trunkHeight);
        
        ctx.restore();
    }
}

// Snowflake class for snow animation
class Snowflake {
    constructor(x, y, image, speed, variation, layer = 0) {
        this.x = x;
        this.y = y;
        this.image = image;
        this.layer = layer;
        this.baseSpeed = speed + (Math.random() * variation * 2 - variation);
        this.speedY = this.baseSpeed;
        this.speedX = 0;
        this.windSpeedX = 0;
        this.scale = 0.5 + Math.random() * 0.5; // Random scale between 0.5 and 1.0
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.02;

        // Layer-based properties
        this.layerDepth = (layer + 1) / 5; // Depth factor from 0.2 to 1.0
        this.alpha = 0.3 + (this.layerDepth * 0.5); // Background layers more transparent
    }

    update(windEffect = 0) {
        // Apply base movement
        this.y += this.speedY;

        // Apply wind effect (scaled by layer depth)
        this.windSpeedX = windEffect * this.layerDepth;
        this.x += this.windSpeedX;

        // Update rotation
        this.rotation += this.rotationSpeed;

        // Wrap horizontally if blown off screen
        if (this.x < -50) this.x = window.innerWidth + 50;
        if (this.x > window.innerWidth + 50) this.x = -50;
    }

    draw(ctx) {
        if (this.image && this.image.width > 0) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.scale(this.scale * this.layerDepth, this.scale * this.layerDepth);
            ctx.globalAlpha = this.alpha;
            ctx.drawImage(this.image, -this.image.width/2, -this.image.height/2);
            ctx.restore();
        }
    }

    isOffScreen() {
        return this.y > window.innerHeight + 50;
    }

    reset() {
        this.y = -50;
        this.x = Math.random() * window.innerWidth;
        this.speedY = this.baseSpeed;
        this.windSpeedX = 0;
    }
}

// Wind system for snow animation (single layer)
class WindSystem {
    constructor(config, layerIndex = 0, totalLayers = 5) {
        this.config = config;
        this.layerIndex = layerIndex;
        this.isActive = false;
        this.direction = 1; // 1 for right, -1 for left
        this.intensity = 0;
        this.duration = 0;
        this.maxDuration = config.windDuration;
        // Double the ramp time as requested, but ensure they fit within total duration
        const basePhaseIn = config.windPhaseInDuration * 2;
        const basePhaseOut = config.windPhaseOutDuration * 2;
        const totalRampTime = basePhaseIn + basePhaseOut;

        if (totalRampTime >= config.windDuration) {
            // Scale down proportionally to fit within duration
            const scale = (config.windDuration * 0.8) / totalRampTime; // Use 80% to leave some full-intensity time
            this.phaseInDuration = Math.floor(basePhaseIn * scale);
            this.phaseOutDuration = Math.floor(basePhaseOut * scale);
        } else {
            this.phaseInDuration = basePhaseIn;
            this.phaseOutDuration = basePhaseOut;
        }

        // Layer-specific properties
        this.layerDepth = (layerIndex + 1) / totalLayers;
        this.baseIntensity = config.windIntensity * this.layerDepth;
        this.windChance = config.windChance * (0.5 + this.layerDepth * 0.5); // Deeper layers have more frequent wind
    }

    update() {
        // Check if we should start a new wind event
        if (!this.isActive && Math.random() < this.windChance) {
            this.startWind();
        }

        // Update active wind
        if (this.isActive) {
            this.duration++;

            // Calculate wind intensity based on phase
            if (this.duration <= this.phaseInDuration) {
                // Phase in: ramp up
                const progress = this.duration / this.phaseInDuration;
                this.intensity = this.baseIntensity * progress;
            } else if (this.duration >= this.maxDuration - this.phaseOutDuration) {
                // Phase out: ramp down
                const remainingDuration = this.maxDuration - this.duration;
                const progress = remainingDuration / this.phaseOutDuration;
                this.intensity = this.baseIntensity * progress;
            } else {
                // Full intensity
                this.intensity = this.baseIntensity;
            }

            // End wind event
            if (this.duration >= this.maxDuration) {
                this.stopWind();
            }
        }
    }

    startWind() {
        this.isActive = true;
        this.direction = Math.random() < 0.5 ? -1 : 1;
        this.duration = 0;
        this.intensity = 0;
    }

    stopWind() {
        this.isActive = false;
        this.intensity = 0;
        this.duration = 0;
    }

    getWindEffect() {
        return this.isActive ? this.direction * this.intensity : 0;
    }
}

// Layered wind system manager with linked effects
class LayeredWindSystem {
    constructor(config, layerCount = 5) {
        this.config = config;
        this.layerCount = layerCount;
        this.windSystems = [];
        this.linkedEffects = new Array(layerCount).fill(0); // Additional wind effects from neighboring layers

        // Create a wind system for each layer
        for (let i = 0; i < layerCount; i++) {
            this.windSystems.push(new WindSystem(config, i, layerCount));
        }
    }

    update() {
        // Update all individual wind systems
        this.windSystems.forEach(windSystem => windSystem.update());

        // Calculate linked effects between layers
        this.calculateLinkedEffects();
    }

    calculateLinkedEffects() {
        // Reset linked effects
        this.linkedEffects.fill(0);

        // For each layer, check if it has active wind and propagate to neighbors
        for (let i = 0; i < this.layerCount; i++) {
            const windSystem = this.windSystems[i];

            if (windSystem.isActive) {
                const sourceEffect = windSystem.getWindEffect();
                const sourceDirection = windSystem.direction;

                // Propagate to adjacent layers with diminishing intensity
                this.propagateWindToNeighbors(i, sourceDirection, Math.abs(sourceEffect));
            }
        }
    }

    propagateWindToNeighbors(sourceLayerIndex, direction, intensity) {
        // Define propagation falloff - how much wind effect carries to adjacent layers
        const propagationFalloff = [0.6, 0.3, 0.1]; // 60%, 30%, 10% for distance 1, 2, 3

        for (let distance = 1; distance < propagationFalloff.length && distance < this.layerCount; distance++) {
            const falloffFactor = propagationFalloff[distance - 1];
            const propagatedIntensity = intensity * falloffFactor;

            // Propagate to both directions from source layer
            const lowerLayerIndex = sourceLayerIndex - distance;
            const upperLayerIndex = sourceLayerIndex + distance;

            // Add linked effect to lower layer (if valid)
            if (lowerLayerIndex >= 0) {
                this.linkedEffects[lowerLayerIndex] += direction * propagatedIntensity;
            }

            // Add linked effect to upper layer (if valid)
            if (upperLayerIndex < this.layerCount) {
                this.linkedEffects[upperLayerIndex] += direction * propagatedIntensity;
            }
        }
    }

    getWindEffectForLayer(layerIndex) {
        if (layerIndex >= 0 && layerIndex < this.windSystems.length) {
            // Combine the layer's own wind effect with linked effects from neighbors
            const ownEffect = this.windSystems[layerIndex].getWindEffect();
            const linkedEffect = this.linkedEffects[layerIndex];

            return ownEffect + linkedEffect;
        }
        return 0;
    }

    // Debug method to see wind effects across all layers
    getDebugInfo() {
        const info = [];
        for (let i = 0; i < this.layerCount; i++) {
            const ownEffect = this.windSystems[i].getWindEffect();
            const linkedEffect = this.linkedEffects[i];
            const totalEffect = ownEffect + linkedEffect;

            info.push({
                layer: i,
                ownEffect: ownEffect.toFixed(2),
                linkedEffect: linkedEffect.toFixed(2),
                totalEffect: totalEffect.toFixed(2),
                isActive: this.windSystems[i].isActive
            });
        }
        return info;
    }
}

// Snow Animation Manager
class SnowAnimationManager {
    constructor(host) {
        this.host = host;
        this.config = WP.settings.load();
        this.canvas = null;
        this.ctx = null;
        this.isEnabled = false;
        this.isInitialized = false;

        // Assets
        this.treeImage = null;
        this.snowImages = [];
        this.assetsLoaded = false;

        // Layered snow system
        this.layerCount = this.config.layerCount || 5; // Configurable number of layers
        this.snowLayers = []; // Array of arrays, each containing snowflakes for that layer
        this.windSystem = null;

        // Animation objects
        this.trees = [];

        // Snow accumulation
        this.snowBankHeights = []; // Array to track snow height across screen width
        this.accumulationWidth = 5; // Width of each accumulation segment

        // Animation state
        this.animationId = null;
        this.lastFrameTime = 0;
        this.targetFPS = 60;
        this.frameInterval = 1000 / this.targetFPS;
    }

    async init() {
        if (this.isInitialized) return;
        
        try {
            // Create background canvas
            this.createCanvas();
            
            // Load assets
            await this.loadAssets();
            
            // Initialize systems
            this.windSystem = new LayeredWindSystem(this.config, this.layerCount);
            this.createTrees();
            this.initSnowAccumulation();
            this.initSnowLayers();
            
            this.isInitialized = true;
        } catch (error) {
            console.error('Failed to initialize snow animation:', error);
        }
    }

    createCanvas() {
        // Create canvas element
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'snow-canvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '-1'; // Behind all content
        
        // Set canvas size
        this.resizeCanvas();
        
        // Get context
        this.ctx = this.canvas.getContext('2d');
        
        // Add to DOM (behind all content)
        document.body.insertBefore(this.canvas, document.body.firstChild);
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.resampleSnowAccumulation();
        });
    }

    // Stretch the existing snow banks to the new width, so a resize keeps
    // the snow that has fallen instead of leaving the old segment count.
    resampleSnowAccumulation() {
        const old = this.snowBankHeights;
        const segments = Math.ceil(this.canvas.width / this.accumulationWidth);
        if (!old.length || old.length === segments) return;
        this.snowBankHeights = Array.from({ length: segments },
            (_, i) => old[Math.min(old.length - 1, Math.floor(i * old.length / segments))]);
    }

    resizeCanvas() {
        if (this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    }

    async loadAssets() {
        // Drawn in code, so there are no image files to fetch or license.
        this.treeImage = SnowSprites.tree();
        this.snowImages = SnowSprites.flakes();
        this.assetsLoaded = true;
    }

    createTrees() {
        this.trees = [];
        const config = this.config;
        
        for (let i = 0; i < config.treeCount; i++) {
            const x = Math.random() * this.canvas.width;
            // Distribute trees across the entire height of the window
            const y = Math.random() * this.canvas.height;
            const scale = 0.5 + Math.random() * 0.5; // Random scale between 0.5 and 1.0
            const tree = new Tree(x, y, scale * config.treeScale);
            this.trees.push(tree);
        }
    }

    initSnowAccumulation() {
        // Initialize snow bank heights array
        const segments = Math.ceil(this.canvas.width / this.accumulationWidth);
        this.snowBankHeights = new Array(segments).fill(0);
    }

    initSnowLayers() {
        // Initialize empty arrays for each layer
        this.snowLayers = [];
        for (let i = 0; i < this.layerCount; i++) {
            this.snowLayers.push([]);
        }
    }

    updateSnowAccumulation() {
        const config = this.config;
        // Use temporary status bar height if set (for hide mode), otherwise use config
        const bottomInset = this.host.insets.bottom;
        const groundLevel = this.canvas.height - bottomInset;

        // Check each snowflake in each layer for ground collision
        this.snowLayers.forEach((layer, layerIndex) => {
            layer.forEach(snowflake => {
                const segmentIndex = Math.floor(snowflake.x / this.accumulationWidth);

                if (segmentIndex >= 0 && segmentIndex < this.snowBankHeights.length) {
                    const currentSnowHeight = this.snowBankHeights[segmentIndex];
                    const snowSurfaceLevel = groundLevel - currentSnowHeight;

                    // Check if snowflake hits the snow surface
                    if (snowflake.y >= snowSurfaceLevel - 5) { // 5px tolerance for collision
                        // Add to snow accumulation with bell curve distribution
                        this.addSnowWithBellCurve(segmentIndex, config.accumulationRate, config.maxAccumulation);

                        // Reset snowflake to top
                        snowflake.reset();
                    }
                }
            });
        });

        // Apply smoothing to create natural curves
        this.smoothSnowBanks();
    }

    addSnowWithBellCurve(centerIndex, baseRate, maxAccumulation) {
        // Bell curve distribution - affects center segment most, nearby segments less
        const bellCurve = [0.1, 0.3, 0.6, 1.0, 0.6, 0.3, 0.1]; // Weights for distribution
        const centerOffset = Math.floor(bellCurve.length / 2);
        
        for (let i = 0; i < bellCurve.length; i++) {
            const targetIndex = centerIndex - centerOffset + i;
            
            if (targetIndex >= 0 && targetIndex < this.snowBankHeights.length) {
                const weight = bellCurve[i];
                const addAmount = baseRate * weight;
                
                this.snowBankHeights[targetIndex] = Math.min(
                    this.snowBankHeights[targetIndex] + addAmount,
                    maxAccumulation
                );
            }
        }
    }

    smoothSnowBanks() {
        // Apply a smoothing filter to create natural curves
        const smoothed = [...this.snowBankHeights];
        
        for (let i = 1; i < this.snowBankHeights.length - 1; i++) {
            // Weighted average with neighbors - creates smooth transitions
            const left = this.snowBankHeights[i - 1];
            const center = this.snowBankHeights[i];
            const right = this.snowBankHeights[i + 1];
            
            // Smooth but preserve general shape (60% current, 20% each neighbor)
            smoothed[i] = center * 0.6 + left * 0.2 + right * 0.2;
        }
        
        this.snowBankHeights = smoothed;
    }

    renderSnowAccumulation() {
        if (!this.ctx || this.snowBankHeights.length === 0) return;

        const config = this.config;
        // Use temporary status bar height if set (for hide mode), otherwise use config
        const bottomInset = this.host.insets.bottom;
        const groundLevel = this.canvas.height - bottomInset;
        
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.strokeStyle = 'rgba(240, 240, 240, 0.8)';
        this.ctx.lineWidth = 1;
        
        // Draw snow banks with smooth curves
        this.ctx.beginPath();
        this.ctx.moveTo(0, groundLevel);
        
        if (this.snowBankHeights.length > 0) {
            // Move to first point
            const firstHeight = this.snowBankHeights[0];
            const firstY = groundLevel - firstHeight + Math.sin(0 * 0.2) * 1.5;
            this.ctx.lineTo(0, firstY);
            
            // Use quadratic curves for smooth, natural snow banks
            for (let i = 0; i < this.snowBankHeights.length - 1; i++) {
                const x1 = i * this.accumulationWidth;
                const x2 = (i + 1) * this.accumulationWidth;
                const xMid = (x1 + x2) / 2;
                
                const height1 = this.snowBankHeights[i];
                const height2 = this.snowBankHeights[i + 1];
                
                // Add subtle natural variation
                const variation1 = Math.sin(i * 0.2) * 1.5;
                const variation2 = Math.sin((i + 1) * 0.2) * 1.5;
                
                const y1 = groundLevel - height1 + variation1;
                const y2 = groundLevel - height2 + variation2;
                const yMid = (y1 + y2) / 2;
                
                // Create smooth curve using quadratic bezier
                this.ctx.quadraticCurveTo(xMid, yMid, x2, y2);
            }
            
            // Handle the last segment
            const lastX = this.canvas.width;
            const lastHeight = this.snowBankHeights[this.snowBankHeights.length - 1];
            const lastY = groundLevel - lastHeight + Math.sin((this.snowBankHeights.length - 1) * 0.2) * 1.5;
            this.ctx.lineTo(lastX, lastY);
        }
        
        // Complete the shape to ground level
        this.ctx.lineTo(this.canvas.width, groundLevel);
        this.ctx.lineTo(0, groundLevel);
        this.ctx.closePath();
        
        // Fill and stroke the snow bank
        this.ctx.fill();
        this.ctx.stroke();
    }

    spawnSnowflakes() {
        const config = this.config;
        const totalSnowflakes = this.getTotalSnowflakeCount();

        if (totalSnowflakes < config.maxSnowflakes && Math.random() < config.spawnRate) {
            // Randomly select a layer to spawn snowflake in
            const layerIndex = Math.floor(Math.random() * this.layerCount);
            const layer = this.snowLayers[layerIndex];

            // Layer-specific properties
            const layerDepth = (layerIndex + 1) / this.layerCount;
            const layerSpeed = config.snowSpeed * layerDepth;
            const layerVariation = config.snowSpeedVariation * layerDepth;

            const x = Math.random() * window.innerWidth;
            const y = -50;
            const image = this.snowImages[Math.floor(Math.random() * this.snowImages.length)];
            const snowflake = new Snowflake(x, y, image, layerSpeed, layerVariation, layerIndex);
            layer.push(snowflake);
        }
    }

    getTotalSnowflakeCount() {
        return this.snowLayers.reduce((total, layer) => total + layer.length, 0);
    }

    update() {
        if (!this.isEnabled || !this.assetsLoaded) return;

        // Update wind system
        this.windSystem.update();

        // Spawn new snowflakes
        this.spawnSnowflakes();

        // Update snowflakes in each layer
        this.snowLayers.forEach((layer, layerIndex) => {
            const windEffect = this.windSystem.getWindEffectForLayer(layerIndex);

            for (let i = layer.length - 1; i >= 0; i--) {
                const snowflake = layer[i];
                snowflake.update(windEffect);

                // Remove or reset snowflakes that have fallen off screen
                if (snowflake.isOffScreen()) {
                    snowflake.reset();
                }
            }
        });

        // Update snow accumulation
        this.updateSnowAccumulation();
    }

    render() {
        if (!this.isEnabled || !this.assetsLoaded || !this.ctx) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw trees (behind everything)
        this.trees.forEach(tree => {
            tree.draw(this.ctx, this.treeImage);
        });

        // Draw snow accumulation (on ground, behind snowflakes)
        this.renderSnowAccumulation();

        // Draw snowflakes by layer (background to foreground)
        for (let layerIndex = 0; layerIndex < this.snowLayers.length; layerIndex++) {
            const layer = this.snowLayers[layerIndex];
            layer.forEach(snowflake => {
                snowflake.draw(this.ctx);
            });
        }
    }

    animate(currentTime) {
        if (!this.isEnabled) return;
        
        // Throttle to target FPS
        if (currentTime - this.lastFrameTime >= this.frameInterval) {
            this.update();
            this.render();
            this.lastFrameTime = currentTime;
        }
        
        this.animationId = requestAnimationFrame((time) => this.animate(time));
    }

    start() {
        if (!this.isInitialized) {
            console.error('❌ Cannot start: Snow animation not initialized');
            return;
        }
        
        if (this.animationId) {
            console.log('⚠️ Animation already running, stopping first...');
            this.stop();
        }
        
        console.log('▶️ Starting snow animation with config:', {
            treeCount: this.config.treeCount,
            maxSnowflakes: this.config.maxSnowflakes,
            spawnRate: this.config.spawnRate,
            snowSpeed: this.config.snowSpeed
        });
        
        this.isEnabled = true;
        this.lastFrameTime = 0;
        
        // Regenerate trees with new random positions every time animation starts
        this.createTrees();
        
        // Reset snow accumulation and layers
        this.initSnowAccumulation();
        this.initSnowLayers();
        
        this.animationId = requestAnimationFrame((time) => this.animate(time));
        
        if (this.canvas) {
            this.canvas.style.display = 'block';
        }
        
        console.log('✅ Snow animation started successfully');
    }

    stop() {
        this.isEnabled = false;
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        if (this.canvas) {
            this.canvas.style.display = 'none';
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    toggle() {
        if (this.isEnabled) {
            this.stop();
        } else {
            this.start();
        }
    }

    // -----------------------------------------------------------------------
    // Settings dialog (ported from the homepage, which used to own it)
    // -----------------------------------------------------------------------

    // id, config key, slider range, how the value reads, what it does.
    static get SETTINGS() {
        const fixed = (digits, unit = '') => v => parseFloat(v).toFixed(digits) + unit;
        return [
            { group: '🌲 Trees' },
            { id: 'tree-count', key: 'treeCount', label: 'Tree Count', min: 0, max: 400, step: 1, format: v => v, help: 'Number of trees scattered across the background' },
            { id: 'tree-scale', key: 'treeScale', label: 'Tree Scale', min: 0.5, max: 8, step: 0.1, format: fixed(1, 'x'), help: 'Size multiplier for the trees' },
            { group: '❄️ Snowflakes' },
            { id: 'max-snowflakes', key: 'maxSnowflakes', label: 'Max Snowflakes', min: 10, max: 6400, step: 1, format: v => v, help: 'Most snowflakes on screen at once' },
            { id: 'spawn-rate', key: 'spawnRate', label: 'Spawn Rate', min: 0.01, max: 1.2, step: 0.01, format: v => (parseFloat(v) * 100).toFixed(1) + '%', help: 'Chance per frame that a new snowflake appears (higher = denser snowfall)' },
            { id: 'snow-speed', key: 'snowSpeed', label: 'Snow Speed', min: 1, max: 60, step: 0.5, format: fixed(1), help: 'Base falling speed, in pixels per frame at 60 fps' },
            { id: 'speed-variation', key: 'snowSpeedVariation', label: 'Speed Variation', min: 0.5, max: 20, step: 0.1, format: fixed(1), help: 'Random speed variation for each snowflake (± pixels)' },
            { id: 'layer-count', key: 'layerCount', label: 'Depth Layers', min: 1, max: 10, step: 1, format: v => v, help: 'Depth layers for parallax (more layers = more depth)' },
            { group: '💨 Wind' },
            { id: 'wind-chance', key: 'windChance', label: 'Wind Chance', min: 0.001, max: 0.04, step: 0.001, format: v => (parseFloat(v) * 100).toFixed(2) + '%', help: 'Chance per frame that a gust starts' },
            { id: 'wind-intensity', key: 'windIntensity', label: 'Wind Intensity', min: 5, max: 240, step: 1, format: v => v, help: 'Strongest sideways push, in pixels per frame' },
            { id: 'wind-duration', key: 'windDuration', label: 'Wind Duration', min: 120, max: 2400, step: 30, format: v => (parseFloat(v) / 60).toFixed(1) + 's', help: 'How long a gust lasts, including ramping up and down' },
            { group: '🏔️ Accumulation' },
            { id: 'accumulation-rate', key: 'accumulationRate', label: 'Accumulation Rate', min: 0.01, max: 8, step: 0.01, format: fixed(2), help: 'How much snow builds up per landing snowflake' },
            { id: 'max-accumulation', key: 'maxAccumulation', label: 'Max Accumulation', min: 1, max: 800, step: 1, format: v => v + 'px', help: 'Tallest the snow banks grow' },
        ];
    }

    showConfigDialog() {
        if (document.getElementById('snow-config-modal')) return;
        const settings = SnowAnimationManager.SETTINGS;
        const defaults = WP.settings.defaults();

        const modal = document.createElement('div');
        modal.id = 'snow-config-modal';
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

        const rows = settings.map(s => s.group
            ? `</div><div class="config-group"><h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">${s.group}</h4>`
            : `<label style="display: block; margin-bottom: 0.5rem;">
                   ${s.label}: <span id="${s.id}-value">${s.format(this.config[s.key])}</span>
                   <input type="range" id="${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${this.config[s.key]}"
                          style="width: 100%; margin-top: 0.25rem;">
               </label>`).join('');
        dialog.innerHTML = `
            <h3 style="margin: 0 0 1rem 0; color: var(--light-text); font-size: 1.25rem;">❄️ Snow Configuration</h3>
            <div style="display: grid; gap: 1rem;"><div>${rows}</div></div>
            <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; justify-content: flex-end;">
                <button id="reset-snow-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">Reset to Defaults</button>
                <button id="cancel-snow-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">Cancel</button>
                <button id="apply-snow-config" style="padding: 0.5rem 1rem; background: var(--accent-blue); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">Apply</button>
            </div>
        `;
        modal.appendChild(dialog);
        document.body.appendChild(modal);

        for (const s of settings) {
            if (s.group) continue;
            const input = dialog.querySelector(`#${s.id}`);
            const value = dialog.querySelector(`#${s.id}-value`);
            value.after(createInfoIcon(s.help, s.format(defaults[s.key])));
            input.addEventListener('input', () => { value.textContent = s.format(input.value); });
        }

        const close = () => modal.remove();
        dialog.querySelector('#reset-snow-config').addEventListener('click', () => {
            for (const s of settings) {
                if (s.group) continue;
                const input = dialog.querySelector(`#${s.id}`);
                input.value = defaults[s.key];
                input.dispatchEvent(new Event('input'));
            }
        });
        dialog.querySelector('#cancel-snow-config').addEventListener('click', close);
        dialog.querySelector('#apply-snow-config').addEventListener('click', () => {
            const next = {};
            for (const s of settings) if (!s.group) next[s.key] = parseFloat(dialog.querySelector(`#${s.id}`).value);
            this.applyConfig(next);
            close();
        });
        modal.addEventListener('click', event => { if (event.target === modal) close(); });
    }

    applyConfig(next) {
        Object.assign(this.config, next);
        WP.settings.save(this.config);
        if (!this.isInitialized) return;
        // Rebuild everything the settings shape. The homepage swapped in a
        // plain WindSystem here, which has no per-layer effects, and cleared
        // a snowflake list that no longer existed.
        this.layerCount = this.config.layerCount || 5;
        this.windSystem = new LayeredWindSystem(this.config, this.layerCount);
        if (this.isEnabled) this.start();
    }

    destroy() {
        this.stop();
        
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        
        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;
    }
}
