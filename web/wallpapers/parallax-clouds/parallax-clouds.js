// Parallax Clouds Animation Module - Super Mario Style
class ParallaxCloudsAnimationManager {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.cloudLayers = [];
        this.isEnabled = false;
        this.animationId = null;
        this.time = 0;

        // Configuration
        this.config = WP.settings.load();

        this.setupColorThemes();
    }

    saveConfig() {
        WP.settings.save(this.config);
    }

    setupColorThemes() {
        this.colorThemes = {
            classic_mario: {
                sky: { r: 92, g: 148, b: 252 },    // Classic Mario sky blue
                clouds: [
                    { r: 255, g: 255, b: 255 },     // Pure white
                    { r: 248, g: 248, b: 248 },     // Off-white
                    { r: 240, g: 248, b: 255 }      // Very light blue-white
                ],
                shadows: { r: 200, g: 220, b: 240 }
            },
            underwater: {
                sky: { r: 0, g: 100, b: 180 },      // Deep blue
                clouds: [
                    { r: 100, g: 150, b: 200 },     // Light blue
                    { r: 120, g: 180, b: 220 },     // Lighter blue
                    { r: 140, g: 200, b: 240 }      // Very light blue
                ],
                shadows: { r: 60, g: 120, b: 160 }
            },
            desert: {
                sky: { r: 255, g: 200, b: 120 },    // Sandy yellow
                clouds: [
                    { r: 255, g: 230, b: 180 },     // Cream
                    { r: 255, g: 240, b: 200 },     // Light cream
                    { r: 255, g: 250, b: 220 }      // Very light cream
                ],
                shadows: { r: 220, g: 180, b: 120 }
            },
            volcano: {
                sky: { r: 80, g: 40, b: 40 },       // Dark red
                clouds: [
                    { r: 120, g: 80, b: 80 },       // Dark gray-red
                    { r: 140, g: 100, b: 100 },     // Gray-red
                    { r: 160, g: 120, b: 120 }      // Light gray-red
                ],
                shadows: { r: 60, g: 40, b: 40 }
            },
            ice: {
                sky: { r: 180, g: 220, b: 255 },    // Ice blue
                clouds: [
                    { r: 240, g: 250, b: 255 },     // Ice white
                    { r: 250, g: 255, b: 255 },     // Pure ice white
                    { r: 255, g: 255, b: 255 }      // Pure white
                ],
                shadows: { r: 200, g: 230, b: 250 }
            },
            night: {
                sky: { r: 20, g: 20, b: 40 },       // Dark blue-purple
                clouds: [
                    { r: 60, g: 60, b: 80 },        // Dark gray-blue
                    { r: 80, g: 80, b: 100 },       // Gray-blue
                    { r: 100, g: 100, b: 120 }      // Light gray-blue
                ],
                shadows: { r: 40, g: 40, b: 60 }
            },
            sunset: {
                sky: { r: 255, g: 150, b: 100 },    // Orange-pink
                clouds: [
                    { r: 255, g: 200, b: 150 },     // Light orange
                    { r: 255, g: 220, b: 180 },     // Very light orange
                    { r: 255, g: 240, b: 200 }      // Cream-orange
                ],
                shadows: { r: 200, g: 120, b: 80 }
            }
        };
    }

    async init() {
        this.createCanvas();
        this.initializeCloudLayers();
        console.log('Parallax Clouds animation manager initialized');
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'parallax-clouds-canvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '-1';
        this.canvas.style.display = 'none';

        this.ctx = this.canvas.getContext('2d');

        // Disable smoothing for pixelated look
        this.ctx.imageSmoothingEnabled = this.config.smoothing;

        document.body.appendChild(this.canvas);

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        if (!this.canvas) return;

        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.initializeCloudLayers();
    }

    initializeCloudLayers() {
        if (!this.canvas) return;

        this.cloudLayers = [];

        for (let layer = 0; layer < this.config.layerCount; layer++) {
            const depth = layer / (this.config.layerCount - 1); // 0 to 1, back to front
            const speed = this.config.baseSpeed * Math.pow(this.config.speedMultiplier, layer);
            const scale = 0.5 + (depth * 0.8); // Bigger clouds in front
            const alpha = 0.3 + (depth * 0.7); // More opaque in front

            this.cloudLayers.push({
                clouds: this.generateCloudsForLayer(layer, scale),
                speed: speed,
                scale: scale,
                alpha: alpha,
                depth: depth,
                yOffset: layer * 20, // Slight vertical offset
                floatOffset: Math.random() * Math.PI * 2
            });
        }
    }

    generateCloudsForLayer(layerIndex, scale) {
        const clouds = [];
        const layerWidth = this.canvas.width + 400; // Extra width for seamless scrolling
        const cloudSpacing = 200 * scale * this.config.cloudScale;
        const cloudCount = Math.ceil((layerWidth / cloudSpacing) * this.config.cloudDensity);

        for (let i = 0; i < cloudCount; i++) {
            clouds.push({
                x: (i * cloudSpacing) + (Math.random() - 0.5) * cloudSpacing * 0.5,
                y: Math.random() * this.canvas.height * 0.6, // Upper 60% of screen
                type: Math.floor(Math.random() * 3), // 3 different cloud types
                size: (80 + Math.random() * 60) * scale * this.config.cloudScale,
                windOffset: Math.random() * Math.PI * 2
            });
        }

        return clouds;
    }

    // Generate pixelated cloud shape
    generateCloudPixels(size, type) {
        const gridSize = Math.max(4, Math.floor(size / this.config.pixelSize));
        const pixels = [];

        // Different cloud shapes
        const shapes = [
            // Type 0: Classic Mario cloud
            [
                "  ████████  ",
                " ██████████ ",
                "████████████",
                "████████████",
                "████████████",
                " ██████████ "
            ],
            // Type 1: Fluffy cloud
            [
                "   ████   ",
                " ████████ ",
                "██████████",
                "██████████",
                "██████████",
                "██████████",
                " ████████ "
            ],
            // Type 2: Stretched cloud
            [
                "  ██████████  ",
                " ████████████ ",
                "██████████████",
                "██████████████",
                " ████████████ "
            ]
        ];

        const shape = shapes[type] || shapes[0];

        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x] === '█') {
                    pixels.push({
                        x: x * this.config.pixelSize,
                        y: y * this.config.pixelSize,
                        size: this.config.pixelSize
                    });
                }
            }
        }

        return pixels;
    }

    drawPixelatedCloud(cloud, layer, x, y) {
        const theme = this.colorThemes[this.config.colorTheme];
        const cloudColors = theme.clouds;
        const shadowColor = theme.shadows;

        // Choose color based on layer depth
        const colorIndex = Math.floor(layer.depth * cloudColors.length);
        const color = cloudColors[Math.min(colorIndex, cloudColors.length - 1)];

        const pixels = this.generateCloudPixels(cloud.size, cloud.type);

        this.ctx.save();
        this.ctx.globalAlpha = layer.alpha;

        // Draw shadow first (offset slightly)
        this.ctx.fillStyle = `rgba(${shadowColor.r}, ${shadowColor.g}, ${shadowColor.b}, 0.3)`;
        for (const pixel of pixels) {
            this.ctx.fillRect(
                x + pixel.x + this.config.pixelSize,
                y + pixel.y + this.config.pixelSize,
                pixel.size,
                pixel.size
            );
        }

        // Draw main cloud
        this.ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 1)`;
        for (const pixel of pixels) {
            this.ctx.fillRect(
                x + pixel.x,
                y + pixel.y,
                pixel.size,
                pixel.size
            );
        }

        this.ctx.restore();
    }

    updateCloudPositions() {
        for (const layer of this.cloudLayers) {
            // Update float offset for vertical bobbing
            layer.floatOffset += this.config.floatSpeed;

            for (const cloud of layer.clouds) {
                // Horizontal movement
                cloud.x -= layer.speed;

                // Add some wind variation
                cloud.windOffset += 0.01;
                const windEffect = Math.sin(cloud.windOffset) * this.config.windVariation;
                cloud.x += windEffect;

                // Wrap around when cloud goes off screen
                if (cloud.x < -cloud.size - 200) {
                    cloud.x = this.canvas.width + cloud.size + Math.random() * 400;
                    cloud.y = Math.random() * this.canvas.height * 0.6;
                }
            }
        }
    }

    start() {
        if (this.isEnabled) return;

        this.isEnabled = true;
        this.canvas.style.display = 'block';
        this.time = 0;
        this.initializeCloudLayers();
        this.animate();
        console.log('Parallax Clouds animation started');
    }

    stop() {
        if (!this.isEnabled) return;

        this.isEnabled = false;
        this.canvas.style.display = 'none';

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('Parallax Clouds animation stopped');
    }

    animate() {
        if (!this.isEnabled) return;

        this.time += 0.016; // Approximately 60fps

        // Draw sky background
        const theme = this.colorThemes[this.config.colorTheme];
        const skyColor = theme.sky;
        this.ctx.fillStyle = `rgb(${skyColor.r}, ${skyColor.g}, ${skyColor.b})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Update cloud positions
        this.updateCloudPositions();

        // Draw clouds from back to front (reverse order for proper layering)
        for (let i = this.cloudLayers.length - 1; i >= 0; i--) {
            const layer = this.cloudLayers[i];

            for (const cloud of layer.clouds) {
                // Calculate position with vertical floating
                const floatY = Math.sin(layer.floatOffset + cloud.windOffset) * this.config.verticalFloat * 20;

                this.drawPixelatedCloud(
                    cloud,
                    layer,
                    cloud.x,
                    cloud.y + layer.yOffset + floatY
                );
            }
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    destroy() {
        this.stop();
        if (this.canvas) {
            document.body.removeChild(this.canvas);
        }
    }
}