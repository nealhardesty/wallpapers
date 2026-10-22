class CherryBlossomAnimationManager {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.petals = [];
        this.branches = [];
        this.animationId = null;
        this.isRunning = false;
        this.config = this.loadConfig();
        this.wind = {
            strength: 0,
            direction: 0,
            timer: 0,
            duration: 0,
            phase: 'calm'
        };
    }

    loadConfig() {
        const stored = localStorage.getItem('cherryBlossomConfig');
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (error) {
                console.error('Failed to parse stored cherry blossom config:', error);
            }
        }
        return {
            petalCount: 150,
            fallSpeed: 1.5,
            windChance: 0.003,
            windStrength: 3,
            windDuration: 180,
            swayAmount: 2,
            petalSize: 1.0,
            showBranches: true,
            branchCount: 8,
            petalColors: ['#ffb7c5', '#ffc0cb', '#ff69b4', '#ffd1dc', '#ffe4e1'],
            fadeEnabled: true,
            rotationSpeed: 1.0
        };
    }

    saveConfig(config) {
        try {
            localStorage.setItem('cherryBlossomConfig', JSON.stringify(config));
            this.config = { ...config };
        } catch (error) {
            console.error('Failed to save cherry blossom config:', error);
        }
    }

    start() {
        if (this.isRunning) return;

        this.createCanvas();
        this.initializeBranches();
        this.initializePetals();
        this.isRunning = true;
        this.animate();
    }

    stop() {
        if (!this.isRunning) return;

        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.canvas) {
            this.canvas.remove();
            this.canvas = null;
            this.ctx = null;
        }
        this.petals = [];
        this.branches = [];
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'cherry-blossom-canvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.zIndex = '-1';
        this.canvas.style.pointerEvents = 'none';

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        this.ctx = this.canvas.getContext('2d');
        document.body.appendChild(this.canvas);
    }

    resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    initializeBranches() {
        this.branches = [];
        if (!this.config.showBranches) return;

        for (let i = 0; i < this.config.branchCount; i++) {
            const branch = {
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height * 0.3, // Top third of screen
                length: 80 + Math.random() * 120,
                angle: Math.random() * Math.PI / 3 - Math.PI / 6, // -30 to +30 degrees
                thickness: 3 + Math.random() * 5,
                segments: []
            };

            // Create branch segments for natural curve
            const segmentCount = 8;
            for (let j = 0; j <= segmentCount; j++) {
                const progress = j / segmentCount;
                const x = branch.x + Math.cos(branch.angle + Math.sin(progress * Math.PI) * 0.3) * branch.length * progress;
                const y = branch.y + Math.sin(branch.angle + Math.sin(progress * Math.PI) * 0.3) * branch.length * progress;
                const thickness = branch.thickness * (1 - progress * 0.7);

                branch.segments.push({ x, y, thickness });
            }

            this.branches.push(branch);
        }
    }

    initializePetals() {
        this.petals = [];
        for (let i = 0; i < this.config.petalCount; i++) {
            this.petals.push(this.createPetal());
        }
    }

    createPetal() {
        const colors = this.config.petalColors;
        return {
            x: Math.random() * this.canvas.width,
            y: -20 - Math.random() * this.canvas.height,
            vx: (Math.random() - 0.5) * 2,
            vy: this.config.fallSpeed * (0.5 + Math.random() * 0.5),
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.1 * this.config.rotationSpeed,
            size: this.config.petalSize * (0.7 + Math.random() * 0.6),
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: this.config.fadeEnabled ? Math.random() * 0.5 + 0.5 : 1,
            swayPhase: Math.random() * Math.PI * 2,
            swaySpeed: 0.02 + Math.random() * 0.03,
            layer: Math.random() // For depth layering
        };
    }

    updateWind() {
        this.wind.timer++;

        if (this.wind.phase === 'calm') {
            if (Math.random() < this.config.windChance) {
                this.wind.phase = 'rising';
                this.wind.direction = (Math.random() - 0.5) * Math.PI / 2; // Wind direction
                this.wind.duration = this.config.windDuration;
                this.wind.timer = 0;
            }
        } else if (this.wind.phase === 'rising') {
            const progress = this.wind.timer / (this.wind.duration * 0.3);
            this.wind.strength = Math.min(progress, 1) * this.config.windStrength;

            if (progress >= 1) {
                this.wind.phase = 'strong';
                this.wind.timer = 0;
            }
        } else if (this.wind.phase === 'strong') {
            this.wind.strength = this.config.windStrength;

            if (this.wind.timer > this.wind.duration * 0.4) {
                this.wind.phase = 'falling';
                this.wind.timer = 0;
            }
        } else if (this.wind.phase === 'falling') {
            const progress = this.wind.timer / (this.wind.duration * 0.3);
            this.wind.strength = this.config.windStrength * (1 - Math.min(progress, 1));

            if (progress >= 1) {
                this.wind.phase = 'calm';
                this.wind.strength = 0;
                this.wind.timer = 0;
            }
        }
    }

    animate() {
        if (!this.isRunning) return;

        this.updateWind();
        this.updatePetals();
        this.draw();

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    updatePetals() {
        this.petals.forEach(petal => {
            // Update sway motion
            petal.swayPhase += petal.swaySpeed;
            const sway = Math.sin(petal.swayPhase) * this.config.swayAmount;

            // Apply wind effects
            const windEffect = this.wind.strength * Math.cos(this.wind.direction);
            const windTurbulence = this.wind.strength * 0.3 * (Math.random() - 0.5);

            // Update position
            petal.x += petal.vx + sway * 0.1 + windEffect + windTurbulence;
            petal.y += petal.vy;

            // Update rotation
            petal.rotation += petal.rotationSpeed + windEffect * 0.02;

            // Fade effect as petals fall
            if (this.config.fadeEnabled) {
                const fadeStart = this.canvas.height * 0.7;
                if (petal.y > fadeStart) {
                    const fadeProgress = (petal.y - fadeStart) / (this.canvas.height * 0.3);
                    petal.alpha = Math.max(0, 1 - fadeProgress);
                }
            }

            // Reset petal when it goes off screen
            if (petal.y > this.canvas.height + 50 ||
                petal.x < -50 || petal.x > this.canvas.width + 50 ||
                petal.alpha <= 0) {
                Object.assign(petal, this.createPetal());
            }
        });
    }

    draw() {
        // Clear canvas with gradient background for depth
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#fff5f5');
        gradient.addColorStop(1, '#ffeef0');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw branches first (background)
        this.drawBranches();

        // Sort petals by layer for depth effect
        const sortedPetals = [...this.petals].sort((a, b) => a.layer - b.layer);

        // Draw petals
        sortedPetals.forEach(petal => this.drawPetal(petal));
    }

    drawBranches() {
        if (!this.config.showBranches) return;

        this.branches.forEach(branch => {
            this.ctx.strokeStyle = '#4a2c1a';
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';

            // Draw branch segments
            this.ctx.beginPath();
            branch.segments.forEach((segment, index) => {
                this.ctx.lineWidth = segment.thickness;
                if (index === 0) {
                    this.ctx.moveTo(segment.x, segment.y);
                } else {
                    this.ctx.lineTo(segment.x, segment.y);
                }
            });
            this.ctx.stroke();

            // Add small cherry blossoms on branches
            branch.segments.forEach((segment, index) => {
                if (index > 0 && index < branch.segments.length - 1 && Math.random() < 0.3) {
                    this.drawBranchBlossom(segment.x, segment.y);
                }
            });
        });
    }

    drawBranchBlossom(x, y) {
        const petalCount = 5;
        const blossomSize = 4 + Math.random() * 3;

        this.ctx.save();
        this.ctx.translate(x, y);

        // Draw petals
        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2;
            this.ctx.save();
            this.ctx.rotate(angle);

            this.ctx.fillStyle = '#ffb7c5';
            this.ctx.beginPath();
            this.ctx.ellipse(0, -blossomSize, blossomSize * 0.6, blossomSize, 0, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.restore();
        }

        // Draw center
        this.ctx.fillStyle = '#ffe4b5';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, blossomSize * 0.3, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    drawPetal(petal) {
        this.ctx.save();
        this.ctx.translate(petal.x, petal.y);
        this.ctx.rotate(petal.rotation);
        this.ctx.globalAlpha = petal.alpha;

        // Create petal shape (elongated oval)
        const width = 8 * petal.size;
        const height = 12 * petal.size;

        // Petal gradient for depth
        const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, width);
        gradient.addColorStop(0, petal.color);
        gradient.addColorStop(1, petal.color + '80'); // Add transparency

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();

        // Draw petal shape (heart-like)
        this.ctx.moveTo(0, -height / 2);
        this.ctx.bezierCurveTo(-width / 2, -height / 3, -width / 2, height / 3, 0, height / 2);
        this.ctx.bezierCurveTo(width / 2, height / 3, width / 2, -height / 3, 0, -height / 2);
        this.ctx.closePath();
        this.ctx.fill();

        // Add subtle outline
        this.ctx.strokeStyle = petal.color;
        this.ctx.lineWidth = 0.5;
        this.ctx.stroke();

        // Add central vein
        this.ctx.strokeStyle = '#ff69b4';
        this.ctx.lineWidth = 0.3;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -height / 2);
        this.ctx.lineTo(0, height / 2);
        this.ctx.stroke();

        this.ctx.restore();
    }

    showConfigDialog() {
        if (document.getElementById('cherry-blossom-config-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'cherry-blossom-config-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); display: flex; align-items: center;
            justify-content: center; z-index: 1000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--dark-surface); border: 1px solid var(--gray-700);
            border-radius: 0.5rem; padding: 1.5rem; min-width: 450px; max-width: 500px;
            color: var(--light-text); max-height: 80vh; overflow-y: auto;
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 1rem 0; color: var(--light-text); font-size: 1.25rem;">
                🌸 Cherry Blossom Configuration
            </h3>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Petal Count: <span id="petal-count-value">${this.config.petalCount}</span>
                </label>
                <input type="range" id="petal-count" min="50" max="300" step="25" value="${this.config.petalCount}"
                       style="width: 100%;">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Fall Speed: <span id="fall-speed-value">${this.config.fallSpeed}</span>
                </label>
                <input type="range" id="fall-speed" min="0.5" max="4" step="0.1" value="${this.config.fallSpeed}"
                       style="width: 100%;">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Wind Chance: <span id="wind-chance-value">${(this.config.windChance * 1000).toFixed(1)}</span>‰
                </label>
                <input type="range" id="wind-chance" min="0" max="10" step="0.1" value="${this.config.windChance * 1000}"
                       style="width: 100%;">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Wind Strength: <span id="wind-strength-value">${this.config.windStrength}</span>
                </label>
                <input type="range" id="wind-strength" min="1" max="8" step="0.5" value="${this.config.windStrength}"
                       style="width: 100%;">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Sway Amount: <span id="sway-amount-value">${this.config.swayAmount}</span>
                </label>
                <input type="range" id="sway-amount" min="0" max="5" step="0.1" value="${this.config.swayAmount}"
                       style="width: 100%;">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Petal Size: <span id="petal-size-value">${this.config.petalSize}</span>
                </label>
                <input type="range" id="petal-size" min="0.5" max="2" step="0.1" value="${this.config.petalSize}"
                       style="width: 100%;">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Branch Count: <span id="branch-count-value">${this.config.branchCount}</span>
                </label>
                <input type="range" id="branch-count" min="0" max="15" step="1" value="${this.config.branchCount}"
                       style="width: 100%;">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: block; margin-bottom: 0.5rem; color: var(--gray-300);">
                    Rotation Speed: <span id="rotation-speed-value">${this.config.rotationSpeed}</span>
                </label>
                <input type="range" id="rotation-speed" min="0" max="3" step="0.1" value="${this.config.rotationSpeed}"
                       style="width: 100%;">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: flex; align-items: center; color: var(--gray-300);">
                    <input type="checkbox" id="show-branches" ${this.config.showBranches ? 'checked' : ''}
                           style="margin-right: 0.5rem;">
                    Show Cherry Tree Branches
                </label>
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="display: flex; align-items: center; color: var(--gray-300);">
                    <input type="checkbox" id="fade-enabled" ${this.config.fadeEnabled ? 'checked' : ''}
                           style="margin-right: 0.5rem;">
                    Enable Fade Effect
                </label>
            </div>

            <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; justify-content: flex-end;">
                <button id="cancel-cherry-config" style="padding: 0.5rem 1rem; background: var(--gray-600); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Cancel
                </button>
                <button id="apply-cherry-config" style="padding: 0.5rem 1rem; background: var(--accent-blue); color: white; border: none; border-radius: 0.25rem; cursor: pointer;">
                    Apply
                </button>
            </div>
        `;

        modal.appendChild(dialog);
        document.body.appendChild(modal);

        // Add real-time value updates
        const updateValues = () => {
            dialog.querySelector('#petal-count-value').textContent = dialog.querySelector('#petal-count').value;
            dialog.querySelector('#fall-speed-value').textContent = dialog.querySelector('#fall-speed').value;
            dialog.querySelector('#wind-chance-value').textContent = dialog.querySelector('#wind-chance').value;
            dialog.querySelector('#wind-strength-value').textContent = dialog.querySelector('#wind-strength').value;
            dialog.querySelector('#sway-amount-value').textContent = dialog.querySelector('#sway-amount').value;
            dialog.querySelector('#petal-size-value').textContent = dialog.querySelector('#petal-size').value;
            dialog.querySelector('#branch-count-value').textContent = dialog.querySelector('#branch-count').value;
            dialog.querySelector('#rotation-speed-value').textContent = dialog.querySelector('#rotation-speed').value;
        };

        dialog.querySelectorAll('input[type="range"]').forEach(input => {
            input.addEventListener('input', updateValues);
        });

        dialog.querySelector('#cancel-cherry-config').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        dialog.querySelector('#apply-cherry-config').addEventListener('click', () => {
            const newConfig = {
                petalCount: parseInt(dialog.querySelector('#petal-count').value),
                fallSpeed: parseFloat(dialog.querySelector('#fall-speed').value),
                windChance: parseFloat(dialog.querySelector('#wind-chance').value) / 1000,
                windStrength: parseFloat(dialog.querySelector('#wind-strength').value),
                swayAmount: parseFloat(dialog.querySelector('#sway-amount').value),
                petalSize: parseFloat(dialog.querySelector('#petal-size').value),
                showBranches: dialog.querySelector('#show-branches').checked,
                branchCount: parseInt(dialog.querySelector('#branch-count').value),
                fadeEnabled: dialog.querySelector('#fade-enabled').checked,
                rotationSpeed: parseFloat(dialog.querySelector('#rotation-speed').value),
                petalColors: this.config.petalColors, // Keep existing colors
                windDuration: this.config.windDuration // Keep existing duration
            };

            this.saveConfig(newConfig);

            if (this.isRunning) {
                this.stop();
                this.start();
            }

            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }
}