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

    destroy() {
        this.stop();
        if (this.canvas) {
            document.body.removeChild(this.canvas);
        }
    }
}