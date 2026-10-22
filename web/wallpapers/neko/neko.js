// Neko Animation Module
// Imported without its sprites (assets/neko/), whose provenance and licensing
// could not be established (SPEC §7.3). It stays disabled until the cat is
// redrawn in code (roadmap 4.6); the behaviour below is what gets kept.
class NekoAnimationManager {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.neko = null;
        this.isEnabled = false;
        this.animationId = null;
        this.mousePosition = { x: 0, y: 0 };
        this.lastMouseMove = Date.now();

        // State enumeration based on original neko
        this.States = {
            STOP: 0,
            WASH: 1,
            SCRATCH: 2,
            MOVE: 3,
            CLAW: 4,
            YAWN: 5,
            SLEEP: 6,
            AWAKE: 7
        };

        // Direction mapping for movement sprites
        this.Directions = {
            UP: 0,
            UPRIGHT: 1,
            RIGHT: 2,
            DOWNRIGHT: 3,
            DOWN: 4,
            DOWNLEFT: 5,
            LEFT: 6,
            UPLEFT: 7
        };

        // Configuration
        this.config = {
            theme: 'neko',
            speed: 3,
            size: 32,
            idleTimeout: 5000, // ms before idle animations
            sleepTimeout: 15000, // ms before sleep
            animationSpeed: 8, // frames between sprite changes
            enableSounds: false
        };

        this.sprites = {};
        this.loadStoredConfig();
    }

    loadStoredConfig() {
        try {
            const stored = localStorage.getItem('nekoConfig');
            if (stored) {
                const config = JSON.parse(stored);
                Object.assign(this.config, config);
            }
        } catch (error) {
            console.error('Failed to load neko config:', error);
        }
    }

    saveConfig() {
        try {
            localStorage.setItem('nekoConfig', JSON.stringify(this.config));
        } catch (error) {
            console.error('Failed to save neko config:', error);
        }
    }

    async init() {
        this.createCanvas();
        await this.loadSprites();
        this.setupMouseTracking();
        this.initializeNeko();
        console.log('Neko animation manager initialized');
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'neko-canvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '1000'; // Higher than background animations
        this.canvas.style.display = 'none';

        this.ctx = this.canvas.getContext('2d');
        // Disable smoothing for pixel-perfect sprites
        this.ctx.imageSmoothingEnabled = false;

        document.body.appendChild(this.canvas);

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    async loadSprites() {
        const themeBasePath = `assets/neko/${this.config.theme}/`;

        // Define sprite mappings based on original neko states
        const spriteMap = {
            // Basic states
            awake: 'Awake.ico',
            sleep1: 'sleep1.ico',
            sleep2: 'sleep2.ico',
            yawn2: 'yawn2.ico',
            yawn3: 'yawn3.ico',
            scratch1: 'scratch1.ico',
            scratch2: 'scratch2.ico',
            wash2: 'wash2.ico',

            // Movement sprites
            up1: 'Up1.ico',
            up2: 'Up2.ico',
            upright1: 'Upright1.ico',
            upright2: 'Upright2.ico',
            right1: 'Right1.ico',
            right2: 'right2.ico',
            downright1: 'Downright1.ico',
            downright2: 'downright2.ico',
            down1: 'Down1.ico',
            down2: 'down2.ico',
            downleft1: 'downleft1.ico',
            downleft2: 'Downleft2.ico',
            left1: 'left1.ico',
            left2: 'left2.ico',
            upleft1: 'Upleft1.ico',
            upleft2: 'Upleft2.ico',

            // Claw sprites
            upclaw1: 'upclaw1.ico',
            upclaw2: 'upclaw2.ico',
            rightclaw1: 'rightclaw1.ico',
            rightclaw2: 'Rightclaw2.ico',
            downclaw1: 'downclaw1.ico',
            downclaw2: 'downclaw2.ico',
            leftclaw1: 'leftclaw1.ico',
            leftclaw2: 'leftclaw2.ico',

            // Footprint sprites (when stationary)
            fp_up: 'fp_up.ico',
            fp_upright: 'fp_upright.ico',
            fp_right: 'fp_right.ico',
            fp_downright: 'fp_downright.ico',
            fp_down: 'fp_down.ico',
            fp_downleft: 'fp_downleft.ico',
            fp_left: 'fp_left.ico',
            fp_upleft: 'fp_upleft.ico'
        };

        this.sprites = {};

        // Load all sprites
        for (const [key, filename] of Object.entries(spriteMap)) {
            try {
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = themeBasePath + filename;
                });
                this.sprites[key] = img;
            } catch (error) {
                console.warn(`Failed to load sprite ${filename}:`, error);
                // Use a fallback or create a simple colored rectangle
                this.sprites[key] = this.createFallbackSprite();
            }
        }
    }

    createFallbackSprite() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FF6B6B';
        ctx.fillRect(0, 0, 32, 32);
        ctx.fillStyle = '#FFF';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🐱', 16, 22);
        return canvas;
    }

    setupMouseTracking() {
        document.addEventListener('mousemove', (e) => {
            this.mousePosition.x = e.clientX;
            this.mousePosition.y = e.clientY;
            this.lastMouseMove = Date.now();
        });
    }

    initializeNeko() {
        this.neko = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            targetX: window.innerWidth / 2,
            targetY: window.innerHeight / 2,
            vx: 0,
            vy: 0,
            state: this.States.STOP,
            direction: this.Directions.DOWN,
            animationFrame: 0,
            animationTimer: 0,
            stateTimer: 0,
            lastDirection: this.Directions.DOWN,
            isMoving: false
        };
    }

    start() {
        if (this.isEnabled) return;

        this.isEnabled = true;
        this.canvas.style.display = 'block';
        this.initializeNeko();
        this.animate();
        console.log('Neko animation started');
    }

    stop() {
        if (!this.isEnabled) return;

        this.isEnabled = false;
        this.canvas.style.display = 'none';

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('Neko animation stopped');
    }

    update() {
        if (!this.neko) return;

        const timeSinceMouseMove = Date.now() - this.lastMouseMove;

        // Calculate distance to mouse
        const dx = this.mousePosition.x - this.neko.x;
        const dy = this.mousePosition.y - this.neko.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Update state based on mouse proximity and time
        if (distance < 32) {
            // Close to mouse - claw or scratch
            if (this.neko.state !== this.States.CLAW && this.neko.state !== this.States.SCRATCH) {
                this.neko.state = Math.random() < 0.5 ? this.States.CLAW : this.States.SCRATCH;
                this.neko.stateTimer = 0;
                this.neko.isMoving = false;
            }
        } else if (distance > 64 && timeSinceMouseMove < 1000) {
            // Mouse is moving and far away - follow it
            this.runTowardsMouse();
        } else if (timeSinceMouseMove > this.config.sleepTimeout) {
            // Mouse hasn't moved in a while - sleep
            if (this.neko.state !== this.States.SLEEP) {
                this.neko.state = this.States.SLEEP;
                this.neko.stateTimer = 0;
                this.neko.isMoving = false;
            }
        } else if (timeSinceMouseMove > this.config.idleTimeout) {
            // Mouse hasn't moved recently - idle behaviors
            if (this.neko.state === this.States.MOVE) {
                const idleStates = [this.States.STOP, this.States.WASH, this.States.YAWN];
                this.neko.state = idleStates[Math.floor(Math.random() * idleStates.length)];
                this.neko.stateTimer = 0;
                this.neko.isMoving = false;
            }
        }

        // Update state timer
        this.neko.stateTimer++;

        // Handle state transitions and animations
        this.updateState();
        this.updatePosition();
        this.updateAnimation();
    }

    runTowardsMouse() {
        if (!this.neko) return;

        const dx = this.mousePosition.x - this.neko.x;
        const dy = this.mousePosition.y - this.neko.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 10) {
            // Set target position
            this.neko.targetX = this.mousePosition.x;
            this.neko.targetY = this.mousePosition.y;

            // Calculate direction
            this.neko.direction = this.calculateDirection(dx, dy);
            this.neko.lastDirection = this.neko.direction;

            // Set movement state
            this.neko.state = this.States.MOVE;
            this.neko.isMoving = true;
            this.neko.stateTimer = 0;
        }
    }

    calculateDirection(dx, dy) {
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const normalizedAngle = ((angle + 360) % 360);

        // Map angle to 8 directions
        if (normalizedAngle >= 337.5 || normalizedAngle < 22.5) {
            return this.Directions.RIGHT;
        } else if (normalizedAngle >= 22.5 && normalizedAngle < 67.5) {
            return this.Directions.DOWNRIGHT;
        } else if (normalizedAngle >= 67.5 && normalizedAngle < 112.5) {
            return this.Directions.DOWN;
        } else if (normalizedAngle >= 112.5 && normalizedAngle < 157.5) {
            return this.Directions.DOWNLEFT;
        } else if (normalizedAngle >= 157.5 && normalizedAngle < 202.5) {
            return this.Directions.LEFT;
        } else if (normalizedAngle >= 202.5 && normalizedAngle < 247.5) {
            return this.Directions.UPLEFT;
        } else if (normalizedAngle >= 247.5 && normalizedAngle < 292.5) {
            return this.Directions.UP;
        } else {
            return this.Directions.UPRIGHT;
        }
    }

    updateState() {
        if (!this.neko) return;

        // Handle state duration and transitions
        switch (this.neko.state) {
            case this.States.CLAW:
            case this.States.SCRATCH:
                if (this.neko.stateTimer > 60) { // ~1 second
                    this.neko.state = this.States.STOP;
                    this.neko.stateTimer = 0;
                }
                break;

            case this.States.WASH:
                if (this.neko.stateTimer > 120) { // ~2 seconds
                    this.neko.state = this.States.STOP;
                    this.neko.stateTimer = 0;
                }
                break;

            case this.States.YAWN:
                if (this.neko.stateTimer > 90) { // ~1.5 seconds
                    this.neko.state = this.States.STOP;
                    this.neko.stateTimer = 0;
                }
                break;

            case this.States.SLEEP:
                // Wake up if mouse moves
                if (Date.now() - this.lastMouseMove < 1000) {
                    this.neko.state = this.States.AWAKE;
                    this.neko.stateTimer = 0;
                }
                break;

            case this.States.AWAKE:
                if (this.neko.stateTimer > 30) { // ~0.5 seconds
                    this.neko.state = this.States.STOP;
                    this.neko.stateTimer = 0;
                }
                break;
        }
    }

    updatePosition() {
        if (!this.neko || !this.neko.isMoving) return;

        const dx = this.neko.targetX - this.neko.x;
        const dy = this.neko.targetY - this.neko.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 5) {
            // Move towards target
            this.neko.vx = (dx / distance) * this.config.speed;
            this.neko.vy = (dy / distance) * this.config.speed;

            this.neko.x += this.neko.vx;
            this.neko.y += this.neko.vy;

            // Keep neko on screen
            this.neko.x = Math.max(16, Math.min(this.canvas.width - 16, this.neko.x));
            this.neko.y = Math.max(16, Math.min(this.canvas.height - 16, this.neko.y));
        } else {
            // Reached target
            this.neko.isMoving = false;
            this.neko.vx = 0;
            this.neko.vy = 0;
            this.neko.state = this.States.STOP;
        }
    }

    updateAnimation() {
        if (!this.neko) return;

        this.neko.animationTimer++;

        if (this.neko.animationTimer >= this.config.animationSpeed) {
            this.neko.animationFrame++;
            this.neko.animationTimer = 0;
        }
    }

    getCurrentSprite() {
        if (!this.neko || !this.sprites) return null;

        const frame = this.neko.animationFrame % 2; // Most animations have 2 frames

        switch (this.neko.state) {
            case this.States.STOP:
                // Show footprint in the direction we were last moving
                const fpDirections = ['fp_up', 'fp_upright', 'fp_right', 'fp_downright',
                                    'fp_down', 'fp_downleft', 'fp_left', 'fp_upleft'];
                return this.sprites[fpDirections[this.neko.lastDirection]] || this.sprites.awake;

            case this.States.MOVE:
                const directions = [
                    ['up1', 'up2'],
                    ['upright1', 'upright2'],
                    ['right1', 'right2'],
                    ['downright1', 'downright2'],
                    ['down1', 'down2'],
                    ['downleft1', 'downleft2'],
                    ['left1', 'left2'],
                    ['upleft1', 'upleft2']
                ];
                const moveSprites = directions[this.neko.direction];
                return this.sprites[moveSprites[frame]] || this.sprites.awake;

            case this.States.CLAW:
                const clawDirections = [
                    ['upclaw1', 'upclaw2'],
                    ['rightclaw1', 'rightclaw2'],
                    ['rightclaw1', 'rightclaw2'],
                    ['rightclaw1', 'rightclaw2'],
                    ['downclaw1', 'downclaw2'],
                    ['leftclaw1', 'leftclaw2'],
                    ['leftclaw1', 'leftclaw2'],
                    ['leftclaw1', 'leftclaw2']
                ];
                const clawSprites = clawDirections[this.neko.lastDirection];
                return this.sprites[clawSprites[frame]] || this.sprites.awake;

            case this.States.SCRATCH:
                return this.sprites[frame === 0 ? 'scratch1' : 'scratch2'] || this.sprites.awake;

            case this.States.WASH:
                return this.sprites.wash2 || this.sprites.awake;

            case this.States.YAWN:
                return this.sprites[frame === 0 ? 'yawn2' : 'yawn3'] || this.sprites.awake;

            case this.States.SLEEP:
                return this.sprites[frame === 0 ? 'sleep1' : 'sleep2'] || this.sprites.awake;

            case this.States.AWAKE:
                return this.sprites.awake;

            default:
                return this.sprites.awake;
        }
    }

    draw() {
        if (!this.ctx || !this.neko) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Get current sprite
        const sprite = this.getCurrentSprite();
        if (sprite) {
            // Draw sprite at neko position
            const size = this.config.size;
            this.ctx.drawImage(
                sprite,
                Math.round(this.neko.x - size / 2),
                Math.round(this.neko.y - size / 2),
                size,
                size
            );
        }
    }

    animate() {
        if (!this.isEnabled) return;

        this.update();
        this.draw();

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    async changeTheme(newTheme) {
        this.config.theme = newTheme;
        await this.loadSprites();
        this.saveConfig();
        console.log('Neko theme changed to:', newTheme);
    }

    showConfigDialog() {
        if (document.getElementById('neko-config-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'neko-config-modal';
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

        // Get available themes
        const themes = this.getAvailableThemes();

        dialog.innerHTML = `
            <h3 style="margin: 0 0 1rem 0; color: var(--light-text); font-size: 1.25rem;">🐱 Neko Configuration</h3>

            <div style="display: grid; gap: 1rem;">
                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">🎨 Appearance</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Theme:
                        <select id="neko-theme" style="width: 100%; margin-top: 0.25rem; padding: 0.25rem; background: var(--gray-600); color: var(--light-text); border: 1px solid var(--gray-500); border-radius: 0.25rem;">
                            ${themes.map(theme =>
                                `<option value="${theme}" ${theme === this.config.theme ? 'selected' : ''}>${this.formatThemeName(theme)}</option>`
                            ).join('')}
                        </select>
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Size: <span id="neko-size-value">${this.config.size}px</span>
                        <input type="range" id="neko-size" min="16" max="64" value="${this.config.size}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                </div>

                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">🏃 Behavior</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Speed: <span id="neko-speed-value">${this.config.speed}</span>
                        <input type="range" id="neko-speed" min="1" max="8" value="${this.config.speed}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Animation Speed: <span id="neko-anim-speed-value">${this.config.animationSpeed}</span>
                        <input type="range" id="neko-anim-speed" min="4" max="20" value="${this.config.animationSpeed}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Idle Timeout: <span id="neko-idle-value">${(this.config.idleTimeout / 1000).toFixed(1)}s</span>
                        <input type="range" id="neko-idle" min="2000" max="20000" step="1000" value="${this.config.idleTimeout}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Sleep Timeout: <span id="neko-sleep-value">${(this.config.sleepTimeout / 1000).toFixed(1)}s</span>
                        <input type="range" id="neko-sleep" min="5000" max="60000" step="5000" value="${this.config.sleepTimeout}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                </div>
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; justify-content: flex-end;">
                <button id="reset-neko-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Reset to Defaults
                </button>
                <button id="cancel-neko-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Cancel
                </button>
                <button id="apply-neko-config" style="padding: 0.5rem 1rem; background: var(--accent-blue); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Apply
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        // Add info icons to labels
        this.addNekoConfigInfoIcons(dialog);

        this.attachConfigEventListeners(dialog);

        dialog.querySelector('#reset-neko-config').addEventListener('click', () => {
            this.resetConfigDialog(dialog);
        });

        dialog.querySelector('#cancel-neko-config').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        dialog.querySelector('#apply-neko-config').addEventListener('click', () => {
            this.applyConfig(dialog);
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    getAvailableThemes() {
        // Return all available themes from assets/neko directory
        return [
            'ace', 'air', 'alien', 'black', 'black2', 'blue', 'blue-marine',
            'blue-tabby', 'boobookitty', 'brown-bsd-daemon', 'brown-dog',
            'calico', 'calico-tabby', 'captain-goodnight', 'caz', 'coke-bottle',
            'colourful', 'dave', 'deedee', 'dog', 'doom', 'earth', 'face',
            'fancy', 'ff3mog', 'fire', 'ghetto', 'ghost', 'gray', 'green-ghost',
            'holiday', 'jess', 'kina', 'kuramecha', 'lucky', 'lucy', 'lucy-dog',
            'marmalade', 'mermaid', 'metroid', 'mike', 'mini', 'moka', 'multi',
            'neko', 'nekocool', 'neon', 'orange', 'pac-man', 'peach', 'penguin',
            'penguin-2', 'pink', 'pink-nose-neko', 'rainbow', 'red-bsd-daemon',
            'robot', 'rocket', 'rose', 'royal', 'silver', 'silversky', 'skunk',
            'socks', 'sonic', 'spirit', 'spooky', 'tabby', 'tentacle',
            'tie-fighter', 'turtle', 'usa', 'valentine', 'water', 'white',
            'worms', 'zelda3'
        ];
    }

    formatThemeName(theme) {
        return theme.split('-').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    attachConfigEventListeners(dialog) {
        const sliders = [
            { id: 'neko-size', valueId: 'neko-size-value', format: (v) => v + 'px' },
            { id: 'neko-speed', valueId: 'neko-speed-value', format: (v) => v },
            { id: 'neko-anim-speed', valueId: 'neko-anim-speed-value', format: (v) => v },
            { id: 'neko-idle', valueId: 'neko-idle-value', format: (v) => (parseInt(v) / 1000).toFixed(1) + 's' },
            { id: 'neko-sleep', valueId: 'neko-sleep-value', format: (v) => (parseInt(v) / 1000).toFixed(1) + 's' }
        ];

        sliders.forEach(slider => {
            const element = dialog.querySelector(`#${slider.id}`);
            const valueElement = dialog.querySelector(`#${slider.valueId}`);

            element.addEventListener('input', (e) => {
                valueElement.textContent = slider.format(e.target.value);
            });
        });
    }

    addNekoConfigInfoIcons(dialog) {
        const configs = [
            { label: 'Theme:', description: 'Choose from different neko sprite styles and characters', default: 'Classic neko' },
            { label: 'Size:', description: 'Size of the neko sprite in pixels', default: '32px' },
            { label: 'Speed:', description: 'How fast neko moves when following the mouse', default: '3 px/frame' },
            { label: 'Animation Speed:', description: 'Frames between sprite changes (lower = faster animation)', default: '8 frames' },
            { label: 'Idle Timeout:', description: 'Time before neko starts idle behaviors when mouse stops', default: '5.0s' },
            { label: 'Sleep Timeout:', description: 'Time before neko falls asleep when mouse is inactive', default: '15.0s' }
        ];

        configs.forEach(config => {
            const labels = dialog.querySelectorAll('label');
            for (const label of labels) {
                if (label.textContent.includes(config.label)) {
                    const valueSpan = label.querySelector('span[id$="-value"]');
                    if (valueSpan) {
                        const icon = createInfoIcon(config.description, config.default);
                        valueSpan.parentNode.insertBefore(icon, valueSpan.nextSibling);
                    }
                    break;
                }
            }
        });
    }

    resetConfigDialog(dialog) {
        const defaults = {
            theme: 'neko',
            size: 32,
            speed: 3,
            animationSpeed: 8,
            idleTimeout: 5000,
            sleepTimeout: 15000
        };

        // Reset sliders
        Object.keys(defaults).forEach(key => {
            if (key === 'theme') return;
            const element = dialog.querySelector(`#neko-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
            if (element) {
                element.value = defaults[key];
                element.dispatchEvent(new Event('input'));
            }
        });

        // Reset theme selector
        dialog.querySelector('#neko-theme').value = defaults.theme;
    }

    async applyConfig(dialog) {
        const oldTheme = this.config.theme;

        this.config.theme = dialog.querySelector('#neko-theme').value;
        this.config.size = parseInt(dialog.querySelector('#neko-size').value);
        this.config.speed = parseInt(dialog.querySelector('#neko-speed').value);
        this.config.animationSpeed = parseInt(dialog.querySelector('#neko-anim-speed').value);
        this.config.idleTimeout = parseInt(dialog.querySelector('#neko-idle').value);
        this.config.sleepTimeout = parseInt(dialog.querySelector('#neko-sleep').value);

        this.saveConfig();

        // Reload sprites if theme changed
        if (oldTheme !== this.config.theme) {
            await this.loadSprites();
        }

        console.log('Neko config applied:', this.config);
    }

    destroy() {
        this.stop();
        if (this.canvas) {
            document.body.removeChild(this.canvas);
        }
    }
}