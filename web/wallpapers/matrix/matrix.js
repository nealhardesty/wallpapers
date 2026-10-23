// Matrix Animation Module
class MatrixAnimationManager {
    constructor(host) {
        this.host = host;
        this.canvas = null;
        this.ctx = null;
        this.columns = [];
        this.isEnabled = false;
        this.animationId = null;
        this.columnCount = 0;
        this.lastTime = 0;

        // Head glows, baked once per colour (SPEC §4.8): a live shadowBlur on
        // every head glyph was the whole cost of this wallpaper.
        this.glowSprites = new Map();

        // Configuration
        this.config = WP.settings.load();

        this.setupThemes();
        this.setupCharacterSets();
    }

    saveConfig() {
        WP.settings.save(this.config);
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
                // Spread evenly, so a lower tier's share of the columns
                // thins the rain out across the screen instead of in clumps
                rank: (i * 0.618034) % 1,
                isActive: false
            });
            this.columns[i].isActive = this.inTier(this.columns[i]) && Math.random() < this.config.density;
        }
    }

    // Lower tiers run fewer columns (host.quality.density). A column outside
    // the tier's share finishes its pass and then stays dark, so a change
    // thins or fills the screen gradually.
    inTier(column) {
        return column.rank < (this.host.quality?.density ?? 1);
    }

    // The glow a shadowBlur of 10 put around a head glyph, baked into a
    // sprite: the shadow of a dense glyph, drawn with the glyph itself off
    // the canvas. Rainbow heads share sprites in 10° steps of hue.
    glowSprite(color) {
        const key = `${color}|${this.config.fontSize}`;
        let sprite = this.glowSprites.get(key);
        if (sprite) return sprite;

        const pad = 20;
        sprite = document.createElement('canvas');
        sprite.width = sprite.height = this.config.fontSize + pad * 2;
        const g = sprite.getContext('2d');
        g.font = `${this.config.fontSize}px 'Courier New', monospace`;
        g.textBaseline = 'top';
        g.shadowColor = color;
        g.shadowBlur = 10;
        g.shadowOffsetX = 1000;
        g.fillText('龍', pad - 1000, pad);
        sprite.pad = pad;
        this.glowSprites.set(key, sprite);
        return sprite;
    }

    start() {
        if (this.isEnabled) return;

        this.isEnabled = true;
        this.canvas.style.display = 'block';
        this.lastTime = 0;
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

    // Speeds and chances are per 60 fps frame; dt (seconds) scales them, so
    // the rain falls at the same speed at any frame rate.
    updateColumns(dt) {
        const frames = dt * 60;
        const frameTime = Date.now();
        const maxTrailLength = Math.floor((this.canvas.height * this.config.tailLength) / this.config.fontSize);
        const minTrailLength = Math.max(5, Math.floor(maxTrailLength * 0.3));

        for (let i = 0; i < this.columns.length; i++) {
            const column = this.columns[i];

            // Check if column should be active
            if (!column.isActive) {
                if (this.inTier(column) && Math.random() < this.config.density * 0.01 * frames) { // Chance to reactivate
                    column.isActive = true;
                    column.y = -column.trail * this.config.fontSize;
                    column.characters = [];
                }
                continue;
            }

            // Move column down
            column.y += column.speed * frames;

            // Reset column when it goes off screen
            if (column.y > this.canvas.height + column.trail * this.config.fontSize) {
                column.y = -column.trail * this.config.fontSize;
                column.speed = this.config.speed + Math.random() * 2;
                column.trail = Math.floor(Math.random() * (maxTrailLength - minTrailLength)) + minTrailLength;
                column.characters = [];

                // Randomly deactivate column based on density
                if (Math.random() > this.config.density || !this.inTier(column)) {
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

                    let glow;
                    if (this.config.theme === 'rainbow') {
                        this.ctx.fillStyle = this.getRainbowColor(column.x, frameTime);
                        const hue = Math.round((column.x * 137.508 + frameTime * 0.05) % 360 / 10) * 10 % 360;
                        glow = this.glowSprite(`hsl(${hue}, 100%, 60%)`);
                    } else {
                        this.ctx.fillStyle = theme.glowColor;
                        glow = this.glowSprite(theme.glowColor);
                    }
                    this.ctx.drawImage(glow, column.x - glow.pad, charY - glow.pad);
                } else {
                    if (this.config.theme === 'rainbow') {
                        const color = this.getRainbowColor(column.x, frameTime);
                        this.ctx.fillStyle = color.replace('60%', `${Math.floor(60 * alpha)}%`);
                    } else {
                        // Theme colours are hex: fade the tail with globalAlpha
                        this.ctx.fillStyle = theme.textColor;
                        this.ctx.globalAlpha = alpha;
                    }
                }

                // Draw the character
                this.ctx.fillText(character.char, column.x, charY);
                this.ctx.globalAlpha = 1;
            }
        }
    }

    animate(currentTime = 0) {
        if (!this.isEnabled) return;

        // Clamped, so a stalled tab doesn't jump every column at once
        if (!this.lastTime) this.lastTime = currentTime;
        const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
        this.lastTime = currentTime;

        const theme = this.themes[this.config.theme];

        // Clear canvas or apply fade effect
        if (this.config.fadeTrails) {
            // Apply fade effect by drawing a semi-transparent overlay: 30%
            // per 60 Hz frame, whatever the frame rate
            this.ctx.fillStyle = theme.backgroundColor;
            this.ctx.globalAlpha = 1 - Math.pow(0.7, dt * 60);
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.globalAlpha = 1;
        } else {
            // Clear canvas completely
            this.ctx.fillStyle = theme.backgroundColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.updateColumns(dt);
        this.drawColumns();

        this.animationId = requestAnimationFrame((time) => this.animate(time));
    }

    destroy() {
        this.stop();
        if (this.canvas) {
            document.body.removeChild(this.canvas);
        }
    }
}