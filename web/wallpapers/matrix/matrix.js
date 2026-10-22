// Matrix Animation Module
class MatrixAnimationManager {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.columns = [];
        this.isEnabled = false;
        this.animationId = null;
        this.columnCount = 0;

        // Configuration
        this.config = {
            speed: 0.75,
            fontSize: 14,
            theme: 'classic',
            density: 0.98,
            fadeTrails: true,
            characterChangeRate: 0.1,
            tailLength: 0.15 // Percentage of screen height (0.15 = 15%)
        };

        this.loadStoredConfig();
        this.setupThemes();
        this.setupCharacterSets();
    }

    loadStoredConfig() {
        try {
            const stored = localStorage.getItem('matrixConfig');
            if (stored) {
                const config = JSON.parse(stored);
                Object.assign(this.config, config);
            }
        } catch (error) {
            console.error('Failed to load matrix config:', error);
        }
    }

    saveConfig() {
        try {
            localStorage.setItem('matrixConfig', JSON.stringify(this.config));
        } catch (error) {
            console.error('Failed to save matrix config:', error);
        }
    }

    setupThemes() {
        this.themes = {
            classic: {
                name: '🟢 Classic (Green)',
                glowColor: '#00ff00',
                textColor: '#008800',
                backgroundColor: '#000000'
            },
            blue: {
                name: '🔵 Blue Matrix',
                glowColor: '#00aaff',
                textColor: '#0066cc',
                backgroundColor: '#000011'
            },
            red: {
                name: '🔴 Red Alert',
                glowColor: '#ff0044',
                textColor: '#cc0022',
                backgroundColor: '#110000'
            },
            purple: {
                name: '🟣 Purple Cyber',
                glowColor: '#aa00ff',
                textColor: '#6600aa',
                backgroundColor: '#110011'
            },
            orange: {
                name: '🟠 Orange Fire',
                glowColor: '#ff6600',
                textColor: '#cc4400',
                backgroundColor: '#110500'
            },
            cyan: {
                name: '🔷 Cyan Ice',
                glowColor: '#00ffff',
                textColor: '#00aaaa',
                backgroundColor: '#001111'
            },
            white: {
                name: '⚪ White Ghost',
                glowColor: '#ffffff',
                textColor: '#bbbbbb',
                backgroundColor: '#000000'
            },
            rainbow: {
                name: '🌈 Rainbow',
                glowColor: '#00ff00', // Default, will be overridden
                textColor: '#008800',
                backgroundColor: '#000000'
            }
        };
    }

    setupCharacterSets() {
        this.characterSets = {
            hiragana: 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん',
            katakana: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン',
            kanji: '一二三四五六七八九十百千万円年月日時分秒人大小中高新古今明暗光闇水火土風雷氷森山川海空星月太陽地球宇宙神仏龍虎鳥魚花木草石金銀銅鉄王女男子母父兄弟姉妹友愛心生死夢希望絶望喜怒哀楽平和戦争自由束縛真偽善悪美醜強弱速遅深浅広狭長短高低重軽明暗熱冷乾湿硬軟滑粗細太豊貧富貴賤勝敗成敗得失増減進退上下左右前後内外表裏東西南北春夏秋冬朝昼夜',
            mixed: ''
        };

        // Combine all character sets for mixed option
        this.characterSets.mixed = this.characterSets.hiragana + this.characterSets.katakana + this.characterSets.kanji;
    }

    getCharacterSet() {
        return this.characterSets.mixed; // Always use mixed for now
    }

    getRandomCharacter() {
        const chars = this.getCharacterSet();
        return chars[Math.floor(Math.random() * chars.length)];
    }

    getRainbowColor(index, time) {
        const hue = (index * 137.508 + time * 0.05) % 360; // Golden angle distribution
        return `hsl(${hue}, 100%, 60%)`;
    }

    async init() {
        this.createCanvas();
        console.log('Matrix animation manager initialized');
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'matrix-canvas';
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

        // Recalculate columns when canvas resizes
        this.setupColumns();
    }

    setupColumns() {
        const columnWidth = this.config.fontSize;
        // Ensure we cover the entire screen width
        this.columnCount = Math.ceil(this.canvas.width / columnWidth);
        this.columns = [];

        // Calculate max trail length based on screen height and config
        const maxTrailLength = Math.floor((this.canvas.height * this.config.tailLength) / this.config.fontSize);
        const minTrailLength = Math.max(5, Math.floor(maxTrailLength * 0.3)); // At least 30% of max, minimum 5

        for (let i = 0; i < this.columnCount; i++) {
            this.columns.push({
                x: i * columnWidth,
                y: Math.random() * this.canvas.height - maxTrailLength * this.config.fontSize,
                speed: this.config.speed + Math.random() * 2,
                characters: [],
                trail: Math.floor(Math.random() * (maxTrailLength - minTrailLength)) + minTrailLength,
                lastCharacterChange: 0,
                isActive: Math.random() < this.config.density
            });
        }
    }

    start() {
        if (this.isEnabled) return;

        this.isEnabled = true;
        this.canvas.style.display = 'block';
        this.setupColumns();
        this.animate();
        console.log('Matrix animation started');
    }

    stop() {
        if (!this.isEnabled) return;

        this.isEnabled = false;
        this.canvas.style.display = 'none';

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        console.log('Matrix animation stopped');
    }

    updateColumns() {
        const frameTime = Date.now();
        const maxTrailLength = Math.floor((this.canvas.height * this.config.tailLength) / this.config.fontSize);
        const minTrailLength = Math.max(5, Math.floor(maxTrailLength * 0.3));

        for (let i = 0; i < this.columns.length; i++) {
            const column = this.columns[i];

            // Check if column should be active
            if (!column.isActive) {
                if (Math.random() < this.config.density * 0.01) { // Chance to reactivate
                    column.isActive = true;
                    column.y = -column.trail * this.config.fontSize;
                    column.characters = [];
                }
                continue;
            }

            // Move column down
            column.y += column.speed;

            // Reset column when it goes off screen
            if (column.y > this.canvas.height + column.trail * this.config.fontSize) {
                column.y = -column.trail * this.config.fontSize;
                column.speed = this.config.speed + Math.random() * 2;
                column.trail = Math.floor(Math.random() * (maxTrailLength - minTrailLength)) + minTrailLength;
                column.characters = [];

                // Randomly deactivate column based on density
                if (Math.random() > this.config.density) {
                    column.isActive = false;
                    continue;
                }
            }

            // Update character trail
            const charactersNeeded = Math.ceil(column.trail);
            while (column.characters.length < charactersNeeded) {
                column.characters.push({
                    char: this.getRandomCharacter(),
                    lastUpdate: frameTime
                });
            }

            // Randomly change characters in the trail
            if (frameTime - column.lastCharacterChange > 100) { // Change every 100ms
                for (let j = 0; j < column.characters.length; j++) {
                    if (Math.random() < this.config.characterChangeRate) {
                        column.characters[j].char = this.getRandomCharacter();
                        column.characters[j].lastUpdate = frameTime;
                    }
                }
                column.lastCharacterChange = frameTime;
            }
        }
    }

    drawColumns() {
        const theme = this.themes[this.config.theme];
        const frameTime = Date.now();

        this.ctx.font = `${this.config.fontSize}px 'Courier New', monospace`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';

        for (const column of this.columns) {
            // Skip inactive columns
            if (!column.isActive) continue;

            for (let i = 0; i < column.characters.length; i++) {
                const character = column.characters[i];
                const charY = column.y - (i * this.config.fontSize);

                // Skip if character is off screen
                if (charY < -this.config.fontSize || charY > this.canvas.height) {
                    continue;
                }

                // Calculate opacity based on position in trail
                let alpha = 1 - (i / column.characters.length);
                if (alpha < 0) alpha = 0;

                // Make the first character brightest
                if (i === 0) {
                    alpha = 1;

                    if (this.config.theme === 'rainbow') {
                        this.ctx.fillStyle = this.getRainbowColor(column.x, frameTime);
                        this.ctx.shadowColor = this.getRainbowColor(column.x, frameTime);
                    } else {
                        this.ctx.fillStyle = theme.glowColor;
                        this.ctx.shadowColor = theme.glowColor;
                    }
                    this.ctx.shadowBlur = 10;
                } else {
                    if (this.config.theme === 'rainbow') {
                        const color = this.getRainbowColor(column.x, frameTime);
                        this.ctx.fillStyle = color.replace('60%', `${Math.floor(60 * alpha)}%`);
                    } else {
                        this.ctx.fillStyle = theme.textColor.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
                    }
                    this.ctx.shadowBlur = 0;
                }

                // Draw the character
                this.ctx.fillText(character.char, column.x, charY);
            }
        }

        // Reset shadow
        this.ctx.shadowBlur = 0;
    }

    animate() {
        if (!this.isEnabled) return;

        const theme = this.themes[this.config.theme];

        // Clear canvas or apply fade effect
        if (this.config.fadeTrails) {
            // Apply fade effect by drawing a semi-transparent overlay
            this.ctx.fillStyle = theme.backgroundColor.replace(')', ', 0.1)').replace('rgb', 'rgba');
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
            // Clear canvas completely
            this.ctx.fillStyle = theme.backgroundColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.updateColumns();
        this.drawColumns();

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    showConfigDialog() {
        if (document.getElementById('matrix-config-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'matrix-config-modal';
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
            <h3 style="margin: 0 0 1rem 0; color: var(--light-text); font-size: 1.25rem;">🔢 Matrix Configuration</h3>

            <div style="display: grid; gap: 1rem;">
                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">⚡ Performance</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Speed: <span id="speed-value">${this.config.speed}</span>
                        <input type="range" id="speed" min="0.25" max="10" step="0.25" value="${this.config.speed}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Font Size: <span id="font-size-value">${this.config.fontSize}px</span>
                        <input type="range" id="font-size" min="8" max="24" value="${this.config.fontSize}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Density: <span id="density-value">${(this.config.density * 100).toFixed(0)}%</span>
                        <input type="range" id="density" min="0.1" max="1.0" step="0.05" value="${this.config.density}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Character Change Rate: <span id="character-change-rate-value">${(this.config.characterChangeRate * 100).toFixed(0)}%</span>
                        <input type="range" id="character-change-rate" min="0.01" max="0.5" step="0.01" value="${this.config.characterChangeRate}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Tail Length: <span id="tail-length-value">${(this.config.tailLength * 100).toFixed(0)}%</span>
                        <input type="range" id="tail-length" min="0.05" max="1.0" step="0.05" value="${this.config.tailLength}"
                               style="width: 100%; margin-top: 0.25rem;">
                    </label>
                </div>

                <div class="config-group">
                    <h4 style="margin: 0 0 0.5rem 0; color: var(--gray-300); font-size: 1rem;">🎨 Appearance</h4>
                    <label style="display: block; margin-bottom: 0.5rem;">
                        Theme:
                        <select id="theme" style="width: 100%; margin-top: 0.25rem; padding: 0.25rem; background: var(--gray-600); color: var(--light-text); border: 1px solid var(--gray-500); border-radius: 0.25rem;">
                            ${Object.entries(this.themes).map(([key, theme]) =>
                                `<option value="${key}" ${this.config.theme === key ? 'selected' : ''}>${theme.name}</option>`
                            ).join('')}
                        </select>
                    </label>
                    <label style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                        <input type="checkbox" id="fade-trails" ${this.config.fadeTrails ? 'checked' : ''}
                               style="margin-right: 0.5rem;">
                        Fade Trails (smoother but slightly less performance)
                    </label>
                </div>
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; justify-content: flex-end;">
                <button id="reset-matrix-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Reset to Defaults
                </button>
                <button id="cancel-matrix-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Cancel
                </button>
                <button id="apply-matrix-config" style="padding: 0.5rem 1rem; background: var(--accent-blue); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Apply
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        this.addMatrixConfigInfoIcons(dialog);
        this.attachConfigEventListeners(dialog);

        dialog.querySelector('#reset-matrix-config').addEventListener('click', () => {
            this.resetConfigDialog(dialog);
        });

        dialog.querySelector('#cancel-matrix-config').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        dialog.querySelector('#apply-matrix-config').addEventListener('click', () => {
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
            { id: 'speed', valueId: 'speed-value', format: (v) => v },
            { id: 'font-size', valueId: 'font-size-value', format: (v) => v + 'px' },
            { id: 'density', valueId: 'density-value', format: (v) => (parseFloat(v) * 100).toFixed(0) + '%' },
            { id: 'character-change-rate', valueId: 'character-change-rate-value', format: (v) => (parseFloat(v) * 100).toFixed(0) + '%' },
            { id: 'tail-length', valueId: 'tail-length-value', format: (v) => (parseFloat(v) * 100).toFixed(0) + '%' }
        ];

        sliders.forEach(slider => {
            const element = dialog.querySelector(`#${slider.id}`);
            const valueElement = dialog.querySelector(`#${slider.valueId}`);

            element.addEventListener('input', (e) => {
                valueElement.textContent = slider.format(e.target.value);
            });
        });
    }

    addMatrixConfigInfoIcons(dialog) {
        const configs = [
            { label: 'Speed:', description: 'How fast the matrix characters fall down the screen', default: '0.75 px/frame' },
            { label: 'Font Size:', description: 'Size of the matrix characters in pixels', default: '14px' },
            { label: 'Density:', description: 'Percentage of columns that are active (lower = more sparse)', default: '98%' },
            { label: 'Character Change Rate:', description: 'How often characters in trails randomly change', default: '10%' },
            { label: 'Tail Length:', description: 'Length of character trails as percentage of screen height', default: '15%' }
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
            speed: 0.75,
            fontSize: 14,
            density: 0.98,
            characterChangeRate: 0.1,
            tailLength: 0.15,
            theme: 'classic',
            fadeTrails: true
        };

        Object.keys(defaults).forEach(key => {
            if (key === 'theme' || key === 'fadeTrails') return;

            const element = dialog.querySelector(`#${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
            if (element) {
                element.value = defaults[key];
                element.dispatchEvent(new Event('input'));
            }
        });

        dialog.querySelector('#theme').value = defaults.theme;
        dialog.querySelector('#fade-trails').checked = defaults.fadeTrails;
    }

    applyConfig(dialog) {
        this.config.speed = parseFloat(dialog.querySelector('#speed').value);
        this.config.fontSize = parseInt(dialog.querySelector('#font-size').value);
        this.config.density = parseFloat(dialog.querySelector('#density').value);
        this.config.characterChangeRate = parseFloat(dialog.querySelector('#character-change-rate').value);
        this.config.tailLength = parseFloat(dialog.querySelector('#tail-length').value);
        this.config.theme = dialog.querySelector('#theme').value;
        this.config.fadeTrails = dialog.querySelector('#fade-trails').checked;

        this.saveConfig();

        // Reinitialize columns with new settings
        if (this.isEnabled) {
            this.setupColumns();
        }

        console.log('Matrix config applied:', this.config);
    }

    destroy() {
        this.stop();
        if (this.canvas) {
            document.body.removeChild(this.canvas);
        }
    }
}