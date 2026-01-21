const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const overlay = document.getElementById('overlay');
const titleEl = document.getElementById('title');

// Sound Class (Web Audio API)
class Sound {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    play(type) {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        if (type === 'paddle') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'brick') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(800 + Math.random() * 200, now);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'wall') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, now);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'win') {
            osc.type = 'triangle';
            // Simple ascending arpeggio
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                const o = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                o.connect(g);
                g.connect(this.ctx.destination);
                o.type = 'triangle';
                o.frequency.value = freq;
                g.gain.setValueAtTime(0.1, now + i * 0.1);
                g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
                o.start(now + i * 0.1);
                o.stop(now + i * 0.1 + 0.3);
            });
        } else if (type === 'loss') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(50, now + 0.5);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);
        }
    }
}

const sound = new Sound();

// Game State
let gameState = 'start'; // start, playing, gameover, won
let score = 0;
let requestID;

// Paddle
const paddle = {
    x: canvas.width / 2 - 50,
    y: canvas.height - 30,
    width: 100,
    height: 15,
    dx: 8,
    color: '#00f',
    update() {
        if (keys.ArrowLeft && this.x > 0) {
            this.x -= this.dx;
        }
        if (keys.ArrowRight && this.x + this.width < canvas.width) {
            this.x += this.dx;
        }
    },
    draw() {
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.shadowBlur = 0;
    }
};

// Ball
const ball = {
    x: canvas.width / 2,
    y: canvas.height - 40,
    radius: 8,
    speed: 2, // 공의 기본 속도
    dx: 2,
    dy: -2,
    color: '#fff',
    reset() {
        this.x = canvas.width / 2;
        this.y = canvas.height - 40;
        this.speed = 2;
        this.dx = this.speed * (Math.random() > 0.5 ? 1 : -1);
        this.dy = -this.speed;
    },
    update() {
        this.x += this.dx;
        this.y += this.dy;

        // Wall Collision (Left/Right)
        if (this.x + this.radius > canvas.width || this.x - this.radius < 0) {
            this.dx *= -1;
            sound.play('wall');
        }

        // Wall Collision (Top)
        if (this.y - this.radius < 0) {
            this.dy *= -1;
            sound.play('wall');
        }

        // Paddle Collision
        if (
            this.y + this.radius > paddle.y &&
            this.y - this.radius < paddle.y + paddle.height &&
            this.x + this.radius > paddle.x &&
            this.x - this.radius < paddle.x + paddle.width
        ) {
            // Calculate hit position relative to paddle center
            let hitPoint = this.x - (paddle.x + paddle.width / 2);
            // Normalize hit point (-1 to 1)
            hitPoint = hitPoint / (paddle.width / 2);

            // Adjust angle
            let angle = hitPoint * (Math.PI / 3); // Max 60 degrees

            this.speed += 0.2; // Increase speed slightly
            this.dx = this.speed * Math.sin(angle);
            this.dy = -this.speed * Math.cos(angle);
            sound.play('paddle');
        }

        // Bottom Collision (Game Over)
        if (this.y + this.radius > canvas.height) {
            gameOver();
        }
    },
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.closePath();
        ctx.shadowBlur = 0;
    }
};

// Bricks
const brickRowCount = 5;
const brickColumnCount = 9;
const brickWidth = 70;
const brickHeight = 20;
const brickPadding = 15;
const brickOffsetTop = 60;
const brickOffsetLeft = 25;

// Power-up
let powerUps = [];

function initBricks() {
    bricks = [];
    powerUps = [];
    for (let c = 0; c < brickColumnCount; c++) {
        bricks[c] = [];
        for (let r = 0; r < brickRowCount; r++) {
            const colors = ['#f00', '#f80', '#ff0', '#0f0', '#00f'];
            let type = 'normal';
            let health = 1;
            let color = colors[r];

            // Randomly assign types
            const rand = Math.random();
            if (rand < 0.1) {
                type = 'hard';
                health = 2;
                color = 'silver';
            } else if (rand < 0.2) {
                type = 'powerup';
                health = 1;
                color = 'gold';
            }

            bricks[c][r] = {
                x: 0,
                y: 0,
                status: 1,
                color: color,
                type: type,
                health: health
            };
        }
    }
}

function drawBricks() {
    for (let c = 0; c < brickColumnCount; c++) {
        for (let r = 0; r < brickRowCount; r++) {
            if (bricks[c][r].status === 1) {
                const brickX = (c * (brickWidth + brickPadding)) + brickOffsetLeft;
                const brickY = (r * (brickHeight + brickPadding)) + brickOffsetTop;
                bricks[c][r].x = brickX;
                bricks[c][r].y = brickY;

                ctx.fillStyle = bricks[c][r].color;
                // Visual indicator for hard blocks damage
                if (bricks[c][r].type === 'hard' && bricks[c][r].health === 1) {
                    ctx.fillStyle = '#aaa'; // Darker silver
                }

                ctx.shadowBlur = 5;
                ctx.shadowColor = bricks[c][r].color;
                ctx.fillRect(brickX, brickY, brickWidth, brickHeight);
                ctx.shadowBlur = 0;
            }
        }
    }
}

function collisionDetection() {
    let activeBricks = 0;
    for (let c = 0; c < brickColumnCount; c++) {
        for (let r = 0; r < brickRowCount; r++) {
            const b = bricks[c][r];
            if (b.status === 1) {
                activeBricks++;
                if (
                    ball.x > b.x &&
                    ball.x < b.x + brickWidth &&
                    ball.y > b.y &&
                    ball.y < b.y + brickHeight
                ) {
                    ball.dy *= -1;

                    b.health--;
                    if (b.health <= 0) {
                        b.status = 0;
                        score += (b.type === 'hard' ? 20 : 10);
                        activeBricks--;

                        // Drop powerup
                        if (b.type === 'powerup') {
                            powerUps.push({ x: b.x + brickWidth / 2, y: b.y + brickHeight / 2 });
                        }
                    }

                    scoreEl.innerText = score;
                    sound.play('brick');
                }
            }
        }
    }

    if (activeBricks === 0 && gameState === 'playing') {
        gameWon();
    }
}

// Input Handling
const keys = {
    ArrowRight: false,
    ArrowLeft: false
};

document.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = true;
    }
    if (e.code === 'Space') {
        if (gameState === 'start' || gameState === 'gameover' || gameState === 'won') {
            startGame();
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = false;
    }
});

function startGame() {
    sound.resume();
    gameState = 'playing';
    score = 0;
    scoreEl.innerText = score;
    ball.reset();
    initBricks();
    overlay.classList.add('hidden');
    gameLoop();
}

function gameOver() {
    gameState = 'gameover';
    sound.play('loss');
    titleEl.innerText = "GAME OVER";
    titleEl.style.color = "#f00";
    overlay.classList.remove('hidden');
    cancelAnimationFrame(requestID);
}

function gameWon() {
    gameState = 'won';
    sound.play('win');
    titleEl.innerText = "YOU WIN!";
    titleEl.style.color = "#0f0";
    overlay.classList.remove('hidden');
    cancelAnimationFrame(requestID);
}

// Power-up Logic
function drawPowerUps() {
    powerUps.forEach(p => {
        ctx.fillStyle = '#ff0';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.fillText('P', p.x - 4, p.y + 4);
    });
}

const powerUpLength = 600; // 10 seconds

function updatePowerUps() {
    for (let i = powerUps.length - 1; i >= 0; i--) {
        let p = powerUps[i];
        p.y += 2; // Fall speed

        // Collision with paddle
        if (
            p.y + 10 > paddle.y &&
            p.y - 10 < paddle.y + paddle.height &&
            p.x + 10 > paddle.x &&
            p.x - 10 < paddle.x + paddle.width
        ) {
            // Activate Power-up (Widen paddle)
            paddle.width = 150;
            paddle.powerUpTimer = powerUpLength;
            sound.play('win'); // Reuse win sound for powerup
            powerUps.splice(i, 1);
        } else if (p.y > canvas.height) {
            powerUps.splice(i, 1);
        }
    }

    if (paddle.powerUpTimer > 0) {
        paddle.powerUpTimer--;
        if (paddle.powerUpTimer === 0) {
            paddle.width = 100; // Reset width
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBricks();
    drawPowerUps();
    paddle.draw();
    ball.draw();
}

function update() {
    if (gameState !== 'playing') return;

    paddle.update();
    ball.update();
    updatePowerUps();
    collisionDetection();
}

function gameLoop() {
    if (gameState === 'playing') {
        update();
        draw();
        requestID = requestAnimationFrame(gameLoop);
    }
}

// Init
initBricks();
draw(); // Initial draw
