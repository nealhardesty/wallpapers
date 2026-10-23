// Neko: a cat that chases the pointer (or a finger), then washes, yawns,
// scratches and naps. Behaviour after the classic Neko and oneko; the art is
// our own, drawn in code (SPEC §7.3).
// The cat, drawn in code: 16x16 pixel grids in the spirit of the original
// oneko, coloured per coat. Letters: . clear, o outline, w fur, c light fur
// (muzzle, chest, paws), p pink (ears, nose), e eyes. Left-facing poses are
// mirrors of the right-facing ones.
const NekoSprites = {
    coats: {
        classic: { name: "Classic white", o: "#1c1c22", w: "#fafaf6", c: "#ffffff", p: "#f096aa", e: "#1c1c22" },
        black: { name: "Black", o: "#6e7284", w: "#26262e", c: "#34343e", p: "#c8788c", e: "#e6c85a" },
        orange: { name: "Orange tabby", o: "#462814", w: "#f0a048", c: "#fff0dc", p: "#f096a0", e: "#283c1e", stripe: "#ce7628" },
        gray: { name: "Grey tabby", o: "#282a30", w: "#9ca2aa", c: "#e8eaee", p: "#eb96a5", e: "#325a3c", stripe: "#707680" },
        calico: { name: "Calico", o: "#28221e", w: "#faf8f0", c: "#ffffff", p: "#f096a5", e: "#3c5028", patch1: "#e8913a", patch2: "#2e2c32" },
        tuxedo: { name: "Tuxedo", o: "#6e7284", w: "#24242c", c: "#fafafa", p: "#eb91a0", e: "#dcbe50" },
        siamese: { name: "Siamese", o: "#3c2a22", w: "#f3e6d3", c: "#faf2e6", p: "#d28c8c", e: "#4682c8", point: "#6c4a3a" },
        cow: { name: "Cow cat", o: "#1e1e22", w: "#fcfcfa", c: "#ffffff", p: "#f096aa", e: "#1e1e22", patch2: "#1e1e24" },
    },

    art: {
        sit: [
            '................',
            '..o..........o..',
            '.owo........owo.',
            '.opwo......owpo.',
            '.owwwoooooowwwo.',
            '.owwwwwwwwwwwwo.',
            'owwwwwwwwwwwwwwo',
            'owweewwwwwweewwo',
            'owwwwwwwwwwwwwwo',
            '.owwwwcppcwwwwo.',
            '..owwwccccwwwo..',
            '..owwccccccwwo..',
            '.owwwccccccwwwoo',
            '.owwwccccccwwwow',
            '.owcccowwocccwoo',
            '..ooo.oooo.ooo..',
        ],
        yawn: [
            '................',
            '..o..........o..',
            '.owo........owo.',
            '.opwo......owpo.',
            '.owwwoooooowwwo.',
            '.owwwwwwwwwwwwo.',
            'owwwwwwwwwwwwwwo',
            'owwooowwwwooowwo',
            'owwwwwwwwwwwwwwo',
            '.owwwwcooocwwwo.',
            '..owwwcopocwwo..',
            '..owwccooocwwo..',
            '.owwwccccccwwwoo',
            '.owwwccccccwwwow',
            '.owcccowwocccwoo',
            '..ooo.oooo.ooo..',
        ],
        wash: [
            '................',
            '..o..........o..',
            '.owo........owo.',
            '.opwo......owpo.',
            '.owwwoooooowwwo.',
            '.owwwwwwwwwwwwo.',
            'owwwwwwwwwwwwwwo',
            'owwooowwwwooowwo',
            'owwwwwwwwocccowo',
            '.owwwwcppocccco.',
            '..owwwccccocccwo',
            '..owwccccccoowwo',
            '.owwwccccccwwwoo',
            '.owwwccccccwwwow',
            '.owcccowwowwwwoo',
            '..ooo.oooo.ooo..',
        ],
        scratch1: [
            '................',
            '..o..........o..',
            '.owo........owo.',
            '.opwo......owpo.',
            '.owwwoooooowwwo.',
            '.owwwwwwwwwwwwoo',
            'owwwwwwwwwwwwocc',
            'owwooowwwwooowcc',
            'owwwwwwwwwwwwwco',
            '.owwwwcppcwwwcco',
            '..owwwccccwwwco.',
            '..owwccccccwwo..',
            '.owwwccccccwwo..',
            '.owwwccccccwwo..',
            '.owcccowwocccwoo',
            '..ooo.oooo.ooo..',
        ],
        scratch2: [
            '................',
            '..o..........o..',
            '.owo........owo.',
            '.opwo......owpo.',
            '.owwwoooooowwwo.',
            '.owwwwwwwwwwwwo.',
            'owwwwwwwwwwwwwoo',
            'owwooowwwwooowcc',
            'owwwwwwwwwwwwwcc',
            '.owwwwcppcwwwwco',
            '..owwwccccwwwcco',
            '..owwccccccwwco.',
            '.owwwccccccwwo..',
            '.owwwccccccwwo..',
            '.owcccowwocccwoo',
            '..ooo.oooo.ooo..',
        ],
        sleep1: [
            '................',
            '................',
            '................',
            '................',
            '................',
            '................',
            '......oooooo....',
            '....oowwwwwwoo..',
            '...owwwwwwwwwwo.',
            '..owwwwwwwwwwwwo',
            '.o.owwwwwwwwwwwo',
            'owoowwwwwwwwwwwo',
            'owwwooowwwwwwwo.',
            'opwwwwwooooooo..',
            '.occccwwwwwwo...',
            '..ooooooooooo...',
        ],
        sleep2: [
            '................',
            '................',
            '................',
            '................',
            '................',
            '......oooooo....',
            '....oowwwwwwoo..',
            '...owwwwwwwwwwo.',
            '..owwwwwwwwwwwwo',
            '..owwwwwwwwwwwwo',
            '.o.owwwwwwwwwwwo',
            'owoowwwwwwwwwwwo',
            'owwwooowwwwwwwo.',
            'opwwwwwooooooo..',
            '.occccwwwwwwo...',
            '..ooooooooooo...',
        ],
        right1: [
            '................',
            '................',
            '...........o.o..',
            '..........owowo.',
            '..........owpwwo',
            '..oo.....owwwwwo',
            '.owwooooowwwewwo',
            '.o.owwwwwwwwwcpo',
            '....owwwwwwwwcco',
            '...owwwwwwwwwoo.',
            '...owwwwwwwwwo..',
            '...owcoooowcwo..',
            '..owco....oco...',
            '..oco.....oco...',
            '..oo.......oo...',
            '................',
        ],
        right2: [
            '................',
            '................',
            '...........o.o..',
            '..........owowo.',
            '..........owpwwo',
            '.........owwwwwo',
            '..oooooooowwewwo',
            '.owwwwwwwwwwwcpo',
            'o.owwwwwwwwwwcco',
            '..owwwwwwwwwwoo.',
            '..owwwwwwwwwwo..',
            '...oco.oooocwo..',
            '....oco..owco...',
            '.....oco.oco....',
            '......oo.oo.....',
            '................',
        ],
        up1: [
            '................',
            '..o..........o..',
            '.owo........owo.',
            '.owwo......owwo.',
            '.owwwoooooowwwo.',
            '.owwwwwwwwwwwwo.',
            'owwwwwwwwwwwwwwo',
            'owwwwwwwwwwwwwwo',
            '.owwwwwwwwwwwwo.',
            '..owwwwwwwwwwo..',
            '..owwwwwwwwwwo..',
            '..owwwwwwwwwwo..',
            '..owwwwwwwwwwo..',
            '..ocwoowwoowco..',
            '..oco..ow..ooo..',
            '...o...oo.....o.',
        ],
        up2: [
            '................',
            '..o..........o..',
            '.owo........owo.',
            '.owwo......owwo.',
            '.owwwoooooowwwo.',
            '.owwwwwwwwwwwwo.',
            'owwwwwwwwwwwwwwo',
            'owwwwwwwwwwwwwwo',
            '.owwwwwwwwwwwwo.',
            '..owwwwwwwwwwo..',
            '..owwwwwwwwwwo..',
            '..owwwwwwwwwwo..',
            '..owwwwwwwwwwo..',
            '..owcoowwoocwo..',
            '..ooo..wo..oco..',
            '..o.....oo..o...',
        ],
        down1: [
            '................',
            '..o..........o..',
            '.owo........owo.',
            '.opwo......owpo.',
            '.owwwoooooowwwo.',
            '.owwwwwwwwwwwwo.',
            'owwwwwwwwwwwwwwo',
            'owweewwwwwweewwo',
            'owwwwwwwwwwwwwwo',
            '.owwwwcppcwwwwo.',
            '..owwwccccwwwo..',
            '..owwccccccwwo..',
            '..owwccccccwwo..',
            '..ocwoowwoowco..',
            '..oco..oo..ooo..',
            '...o............',
        ],
        down2: [
            '................',
            '..o..........o..',
            '.owo........owo.',
            '.opwo......owpo.',
            '.owwwoooooowwwo.',
            '.owwwwwwwwwwwwo.',
            'owwwwwwwwwwwwwwo',
            'owweewwwwwweewwo',
            'owwwwwwwwwwwwwwo',
            '.owwwwcppcwwwwo.',
            '..owwwccccwwwo..',
            '..owwccccccwwo..',
            '..owwccccccwwo..',
            '..owcoowwoocwo..',
            '..ooo..oo..oco..',
            '............o...',
        ],
        upclaw1: [
            '..oo........oo..',
            '.occo......occo.',
            '.owco......ocwo.',
            '.owwo......owwo.',
            '.owwwoooooowwwo.',
            '.owwwwwwwwwwwwo.',
            'owwwwwwwwwwwwwwo',
            'owwwwwwwwwwwwwwo',
            '.owwwwwwwwwwwwo.',
            '..owwwwwwwwwwo..',
            '..owwwwwwwwwwo..',
            '..owwwwwwwwwwo..',
            '..owwwwwwwwwwo..',
            '..owwoowwoowwo..',
            '..ocoo.oo.ooco..',
            '...o........o...',
        ],
        upclaw2: [
            '................',
            '..oo........oo..',
            '.occo......occo.',
            '.owco......ocwo.',
            '.owwwoooooowwwo.',
            '.owwwwwwwwwwwwo.',
            'owwwwwwwwwwwwwwo',
            'owwwwwwwwwwwwwwo',
            '.owwwwwwwwwwwwo.',
            '..owwwwwwwwwwo..',
            '..owwwwwwwwwwo..',
            '..owwwwwwwwwwo..',
            '..owwwwwwwwwwo..',
            '..owwoowwoowwo..',
            '..ocoo.oo.ooco..',
            '...o........o...',
        ],
        rightclaw1: [
            '..............oo',
            '...........o.occ',
            '..........owoocc',
            '..........owpwwo',
            '.........owwwwwo',
            '.........owwewwo',
            '........owwwwcpo',
            '........owwwwcco',
            '.......owwwwwoco',
            '.......owwwwwocc',
            '......owwwwwwooo',
            '...oo.owwwwwwo..',
            '..owwoowwwwwwo..',
            '..o..owcooocwo..',
            '.....oco...oco..',
            '.....oo.....oo..',
        ],
        rightclaw2: [
            '................',
            '...........o.ooo',
            '..........owoocc',
            '..........owpwoc',
            '.........owwwwwo',
            '.........owwewwo',
            '........owwwwcpo',
            '........owwwwcco',
            '.......owwwwwooo',
            '.......owwwwwocc',
            '......owwwwwwoco',
            '...oo.owwwwwwo.o',
            '..owwoowwwwwwo..',
            '..o..owcooocwo..',
            '.....oco...oco..',
            '.....oo.....oo..',
        ],
        downclaw1: [
            '................',
            '..o..........o..',
            '.owo........owo.',
            '.opwo......owpo.',
            '.owwwoooooowwwo.',
            '.owwwwwwwwwwwwo.',
            'owwwwwwwwwwwwwwo',
            'owweewwwwwweewwo',
            'owwwwwwwwwwwwwwo',
            '.owwwwcppcwwwwo.',
            '..owwwccccwwwo..',
            '..owwccccccwwo..',
            '.owwccccccccwwo.',
            'occco......occco',
            'o.c.o......o.c.o',
            '................',
        ],
        downclaw2: [
            '................',
            '..o..........o..',
            '.owo........owo.',
            '.opwo......owpo.',
            '.owwwoooooowwwo.',
            '.owwwwwwwwwwwwo.',
            'owwwwwwwwwwwwwwo',
            'owweewwwwwweewwo',
            'owwwwwwwwwwwwwwo',
            '.owwwwcppcwwwwo.',
            '..owwwccccwwwo..',
            '..owwccccccwwo..',
            '.owwccccccccwwo.',
            '.occo......occo.',
            '.oco........oco.',
            '................',
        ],
    },

    // Fur gets the coat's pattern: tabby bands, siamese points, patches.
    colour(coat, letter, x, y) {
        if (letter === 'w') {
            if (coat.stripe && y % 3 === 0) return coat.stripe;
            if (coat.point && (y <= 4 || y >= 14)) return coat.point;
            const cell = (((x / 4) | 0) * 73856093 ^ ((y / 4) | 0) * 19349663) >>> 0;
            if (coat.patch1 && cell % 7 === 0) return coat.patch1;
            if (coat.patch2 && cell % 5 === 1) return coat.patch2;
        }
        return coat[letter];
    },

    paint(rows, coat, mirror) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        const ctx = canvas.getContext('2d');
        rows.forEach((row, y) => [...row].forEach((letter, x) => {
            if (letter === '.') return;
            ctx.fillStyle = this.colour(coat, letter, x, y);
            ctx.fillRect(mirror ? 15 - x : x, y, 1, 1);
        }));
        return canvas;
    },

    // Every sprite name the behaviour code asks for.
    build(coatName) {
        const coat = this.coats[coatName] || this.coats.classic;
        const a = this.art;
        const out = {};
        const set = (name, rows, mirror = false) => { out[name] = this.paint(rows, coat, mirror); };
        set('awake', a.sit);
        for (const fp of ['up', 'upright', 'right', 'downright', 'down', 'downleft', 'left', 'upleft']) out[`fp_${fp}`] = out.awake;
        set('sleep1', a.sleep1); set('sleep2', a.sleep2);
        set('yawn2', a.sit); set('yawn3', a.yawn);
        set('scratch1', a.scratch1); set('scratch2', a.scratch2);
        set('wash2', a.wash);
        for (const n of [1, 2]) {
            set(`up${n}`, a[`up${n}`]); set(`down${n}`, a[`down${n}`]);
            set(`right${n}`, a[`right${n}`]); set(`left${n}`, a[`right${n}`], true);
            out[`upright${n}`] = out[`downright${n}`] = out[`right${n}`];
            out[`upleft${n}`] = out[`downleft${n}`] = out[`left${n}`];
            set(`upclaw${n}`, a[`upclaw${n}`]); set(`downclaw${n}`, a[`downclaw${n}`]);
            set(`rightclaw${n}`, a[`rightclaw${n}`]); set(`leftclaw${n}`, a[`rightclaw${n}`], true);
        }
        return out;
    },
};

// While the cat sleeps only the z's move, and only in steps of this many
// ms, so the stage can skip every frame in between (host.idleUntil). The
// timer that wakes the stage can fire a touch early, so steps count from
// slightly ahead of the clock.
const NEKO_Z_STEP = 100;
const NEKO_Z_AHEAD = 8;

class NekoAnimationManager {
    constructor(host) {
        this.host = host;
        this.canvas = null;
        this.ctx = null;
        this.neko = null;
        this.isEnabled = false;
        this.animationId = null;
        this.lastTime = 0;
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
        this.config = WP.settings.load();

        this.sprites = {};
    }

    saveConfig() {
        WP.settings.save(this.config);
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
        // Resizing resets the context, smoothing included: keep pixels crisp.
        this.ctx.imageSmoothingEnabled = false;
    }

    async loadSprites() {
        this.sprites = NekoSprites.build(this.config.coat);
    }

    setupMouseTracking() {
        // Pointer events, so a finger works as well as a mouse.
        const follow = (e) => {
            this.mousePosition.x = e.clientX;
            this.mousePosition.y = e.clientY;
            this.lastMouseMove = Date.now();
        };
        document.addEventListener('pointermove', follow);
        document.addEventListener('pointerdown', follow);
    }

    initializeNeko() {
        // Until a pointer moves, the cat settles in the middle rather than
        // chasing the top-left corner.
        this.mousePosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
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
        this.lastTime = 0;
        this.animate(0);
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

    // frames: elapsed time in 60 fps frames, the unit the timers, speed and
    // Animation Speed were tuned in.
    update(frames) {
        if (!this.neko) return;

        const timeSinceMouseMove = Date.now() - this.lastMouseMove;

        // Calculate distance to mouse
        const dx = this.mousePosition.x - this.neko.x;
        const dy = this.mousePosition.y - this.neko.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Update state based on mouse proximity and time. Clawing at the
        // pointer only while it's recent: a resting pointer would otherwise
        // keep the cat clawing forever, never idling or sleeping.
        if (distance < 32 && timeSinceMouseMove < this.config.idleTimeout) {
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
            // Mouse hasn't moved recently - idle behaviors, now and then
            if (this.neko.state === this.States.MOVE
                || (this.neko.state === this.States.STOP && this.neko.stateTimer > 180)) {
                const idleStates = [this.States.STOP, this.States.WASH, this.States.YAWN];
                this.neko.state = idleStates[Math.floor(Math.random() * idleStates.length)];
                this.neko.stateTimer = 0;
                this.neko.isMoving = false;
            }
        }

        // Update state timer
        this.neko.stateTimer += frames;

        // Handle state transitions and animations
        this.updateState();
        this.updatePosition(frames);
        this.updateAnimation(frames);
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

    updatePosition(frames) {
        if (!this.neko || !this.neko.isMoving) return;

        const dx = this.neko.targetX - this.neko.x;
        const dy = this.neko.targetY - this.neko.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 5) {
            // Move towards target
            this.neko.vx = (dx / distance) * this.config.speed;
            this.neko.vy = (dy / distance) * this.config.speed;

            // Never past the target: a long step would overshoot and dither
            const step = Math.min(1, distance / (this.config.speed * frames));
            this.neko.x += this.neko.vx * frames * step;
            this.neko.y += this.neko.vy * frames * step;

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

    updateAnimation(frames) {
        if (!this.neko) return;

        this.neko.animationTimer += frames;

        // Asleep, slow breaths, like the classic Neko: a quarter of the pace
        const every = this.config.animationSpeed * (this.neko.state === this.States.SLEEP ? 4 : 1);
        if (this.neko.animationTimer >= every) {
            this.neko.animationFrame++;
            this.neko.animationTimer = 0;
        }
    }

    // Asleep, nothing changes until the next z step (a breath waits for
    // one), so there's no need for frames in between: ms until that step.
    sleepingFor() {
        return NEKO_Z_STEP - (performance.now() + NEKO_Z_AHEAD) % NEKO_Z_STEP;
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
            if (this.neko.state === this.States.SLEEP) this.drawZs(size);
        }
    }

    // Three z's drifting up and away from a sleeping cat, in steps.
    drawZs(size) {
        const t = Math.floor((performance.now() + NEKO_Z_AHEAD) / NEKO_Z_STEP) * NEKO_Z_STEP / 1000;
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = '#d7dcef';
        for (let i = 0; i < 3; i++) {
            const phase = (t * 0.45 + i / 3) % 1;
            ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.85;
            ctx.font = `600 ${Math.round(size * (0.22 + phase * 0.18))}px ui-rounded, system-ui, sans-serif`;
            ctx.fillText('z', this.neko.x + size * (0.25 + phase * 0.35), this.neko.y - size * (0.2 + phase * 0.6));
        }
        ctx.restore();
    }

    animate(now) {
        if (!this.isEnabled) return;

        // By elapsed time, in 60 fps frames, so every frame rate runs at the
        // same pace; clamped, so a long pause doesn't jump.
        const frames = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.1) * 60 : 0;
        this.lastTime = now;

        this.update(frames);
        this.draw();

        // A pointer wakes the stage early, and the cat with it.
        if (this.neko.state === this.States.SLEEP) this.host.idleUntil(this.sleepingFor());

        this.animationId = requestAnimationFrame(time => this.animate(time));
    }

    destroy() {
        this.stop();
        if (this.canvas) {
            document.body.removeChild(this.canvas);
        }
    }
}