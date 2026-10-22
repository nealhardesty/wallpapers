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
        this.config = {
            layerCount: 4,
            cloudDensity: 0.7,
            baseSpeed: 0.3,
            speedMultiplier: 1.5,
            cloudScale: 1.0,
            colorTheme: 'classic_mario', // classic_mario, underwater, desert, volcano, ice, night, sunset
            pixelSize: 4,
            smoothing: false,
            windVariation: 0.2,
            verticalFloat: 0.3,
            floatSpeed: 0.01
        };

        this.loadStoredConfig();
        this.setupColorThemes();
    }

    loadStoredConfig() {
        try {
            const stored = localStorage.getItem('parallaxCloudsConfig');
            if (stored) {
                const config = JSON.parse(stored);
                Object.assign(this.config, config);
            }
        } catch (error) {
            console.error('Failed to load parallax clouds config:', error);
        }
    }

    saveConfig() {
        try {
            localStorage.setItem('parallaxCloudsConfig', JSON.stringify(this.config));
        } catch (error) {
            console.error('Failed to save parallax clouds config:', error);
        }
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

    showConfigDialog() {
        if (document.getElementById('parallax-clouds-config-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'parallax-clouds-config-modal';
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
            <h3 style="margin: 0 0 1rem 0; color: var(--light-text); font-size: 1.25rem;">☁️ Parallax Clouds Configuration</h3>

            <div style="display: grid; gap: 1rem;">
                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">🎨 Appearance</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Color Theme:
                        <select id="color-theme" style="width: 100%; margin-top: 0.25rem; padding: 0.25rem; background: var(--gray-600); color: var(--light-text); border: 1px solid var(--gray-500); border-radius: 0.25rem;">
                            <option value="classic_mario" ${this.config.colorTheme === 'classic_mario' ? 'selected' : ''}>🍄 Classic Mario (Blue sky, white clouds)</option>
                            <option value="underwater" ${this.config.colorTheme === 'underwater' ? 'selected' : ''}>🌊 Underwater (Deep blue theme)</option>
                            <option value="desert" ${this.config.colorTheme === 'desert' ? 'selected' : ''}>🏜️ Desert (Sandy yellow theme)</option>
                            <option value="volcano" ${this.config.colorTheme === 'volcano' ? 'selected' : ''}>🌋 Volcano (Dark red theme)</option>
                            <option value="ice" ${this.config.colorTheme === 'ice' ? 'selected' : ''}>❄️ Ice (Cool blue theme)</option>
                            <option value="night" ${this.config.colorTheme === 'night' ? 'selected' : ''}>🌙 Night (Dark purple theme)</option>
                            <option value="sunset" ${this.config.colorTheme === 'sunset' ? 'selected' : ''}>🌅 Sunset (Orange-pink theme)</option>
                        </select>
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Pixel Size: <span id="pixel-size-value">${this.config.pixelSize}px</span>
                        <input type="range" id="pixel-size" min="2" max="12" value="${this.config.pixelSize}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Cloud Scale: <span id="cloud-scale-value">${this.config.cloudScale.toFixed(1)}x</span>
                        <input type="range" id="cloud-scale" min="0.5" max="2.5" step="0.1" value="${this.config.cloudScale}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <input type="checkbox" id="smoothing" ${this.config.smoothing ? 'checked' : ''}>
                        Enable Anti-aliasing (smoother but less pixelated)
                    </label>
                </div>

                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">🌥️ Cloud Layers</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Layer Count: <span id="layer-count-value">${this.config.layerCount}</span>
                        <input type="range" id="layer-count" min="2" max="8" value="${this.config.layerCount}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Cloud Density: <span id="cloud-density-value">${(this.config.cloudDensity * 100).toFixed(0)}%</span>
                        <input type="range" id="cloud-density" min="0.2" max="1.5" step="0.1" value="${this.config.cloudDensity}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                </div>

                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">💨 Movement</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Base Speed: <span id="base-speed-value">${this.config.baseSpeed.toFixed(1)}</span>
                        <input type="range" id="base-speed" min="0.1" max="2" step="0.1" value="${this.config.baseSpeed}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Speed Multiplier: <span id="speed-multiplier-value">${this.config.speedMultiplier.toFixed(1)}x</span>
                        <input type="range" id="speed-multiplier" min="1.1" max="3" step="0.1" value="${this.config.speedMultiplier}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Wind Variation: <span id="wind-variation-value">${this.config.windVariation.toFixed(1)}</span>
                        <input type="range" id="wind-variation" min="0" max="1" step="0.1" value="${this.config.windVariation}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Vertical Float: <span id="vertical-float-value">${this.config.verticalFloat.toFixed(1)}</span>
                        <input type="range" id="vertical-float" min="0" max="1" step="0.1" value="${this.config.verticalFloat}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                </div>
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; justify-content: flex-end;">
                <button id="reset-parallax-clouds-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Reset to Defaults
                </button>
                <button id="cancel-parallax-clouds-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Cancel
                </button>
                <button id="apply-parallax-clouds-config" style="padding: 0.5rem 1rem; background: var(--accent-blue); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Apply
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        this.attachConfigEventListeners(dialog);

        dialog.querySelector('#reset-parallax-clouds-config').addEventListener('click', () => {
            this.resetConfigDialog(dialog);
        });

        dialog.querySelector('#cancel-parallax-clouds-config').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        dialog.querySelector('#apply-parallax-clouds-config').addEventListener('click', () => {
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
            { id: 'pixel-size', valueId: 'pixel-size-value', format: (v) => v + 'px' },
            { id: 'cloud-scale', valueId: 'cloud-scale-value', format: (v) => parseFloat(v).toFixed(1) + 'x' },
            { id: 'layer-count', valueId: 'layer-count-value', format: (v) => v },
            { id: 'cloud-density', valueId: 'cloud-density-value', format: (v) => (parseFloat(v) * 100).toFixed(0) + '%' },
            { id: 'base-speed', valueId: 'base-speed-value', format: (v) => parseFloat(v).toFixed(1) },
            { id: 'speed-multiplier', valueId: 'speed-multiplier-value', format: (v) => parseFloat(v).toFixed(1) + 'x' },
            { id: 'wind-variation', valueId: 'wind-variation-value', format: (v) => parseFloat(v).toFixed(1) },
            { id: 'vertical-float', valueId: 'vertical-float-value', format: (v) => parseFloat(v).toFixed(1) }
        ];

        sliders.forEach(slider => {
            const element = dialog.querySelector(`#${slider.id}`);
            const valueElement = dialog.querySelector(`#${slider.valueId}`);

            element.addEventListener('input', (e) => {
                valueElement.textContent = slider.format(e.target.value);
            });
        });
    }

    resetConfigDialog(dialog) {
        const defaults = {
            pixelSize: 4,
            cloudScale: 1.0,
            layerCount: 4,
            cloudDensity: 0.7,
            baseSpeed: 0.3,
            speedMultiplier: 1.5,
            windVariation: 0.2,
            verticalFloat: 0.3,
            colorTheme: 'classic_mario',
            smoothing: false
        };

        // Reset sliders
        Object.keys(defaults).forEach(key => {
            if (key === 'colorTheme' || key === 'smoothing') return;

            const element = dialog.querySelector(`#${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
            if (element) {
                element.value = defaults[key];
                element.dispatchEvent(new Event('input'));
            }
        });

        // Reset color theme
        dialog.querySelector('#color-theme').value = defaults.colorTheme;

        // Reset smoothing checkbox
        dialog.querySelector('#smoothing').checked = defaults.smoothing;
    }

    applyConfig(dialog) {
        this.config.pixelSize = parseInt(dialog.querySelector('#pixel-size').value);
        this.config.cloudScale = parseFloat(dialog.querySelector('#cloud-scale').value);
        this.config.layerCount = parseInt(dialog.querySelector('#layer-count').value);
        this.config.cloudDensity = parseFloat(dialog.querySelector('#cloud-density').value);
        this.config.baseSpeed = parseFloat(dialog.querySelector('#base-speed').value);
        this.config.speedMultiplier = parseFloat(dialog.querySelector('#speed-multiplier').value);
        this.config.windVariation = parseFloat(dialog.querySelector('#wind-variation').value);
        this.config.verticalFloat = parseFloat(dialog.querySelector('#vertical-float').value);
        this.config.colorTheme = dialog.querySelector('#color-theme').value;
        this.config.smoothing = dialog.querySelector('#smoothing').checked;

        this.saveConfig();

        // Update canvas smoothing setting
        if (this.ctx) {
            this.ctx.imageSmoothingEnabled = this.config.smoothing;
        }

        // Reinitialize with new settings
        this.initializeCloudLayers();

        console.log('Parallax Clouds config applied:', this.config);
    }

    destroy() {
        this.stop();
        if (this.canvas) {
            document.body.removeChild(this.canvas);
        }
    }
}