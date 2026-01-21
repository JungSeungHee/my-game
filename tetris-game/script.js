const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-piece');
const nextContext = nextCanvas.getContext('2d');
const scoreElement = document.getElementById('score');
const startBtn = document.getElementById('start-btn');

context.scale(20, 20); // Scale up everything 20x (12x20 grid -> 240x400 px)
nextContext.scale(20, 20);

// Tetromino definitions
const PIECES = 'ILJOTSZ';
const COLORS = [
    null,
    '#FF0D72', // T
    '#0DC2FF', // O
    '#0DFF72', // L
    '#F538FF', // J
    '#FF8E0D', // I
    '#FFE138', // S
    '#3877FF', // Z
];

function createPiece(type) {
    if (type === 'I') {
        return [
            [0, 1, 0, 0],
            [0, 1, 0, 0],
            [0, 1, 0, 0],
            [0, 1, 0, 0],
        ];
    } else if (type === 'L') {
        return [
            [0, 2, 0],
            [0, 2, 0],
            [0, 2, 2],
        ];
    } else if (type === 'J') {
        return [
            [0, 3, 0],
            [0, 3, 0],
            [3, 3, 0],
        ];
    } else if (type === 'O') {
        return [
            [4, 4],
            [4, 4],
        ];
    } else if (type === 'Z') {
        return [
            [5, 5, 0],
            [0, 5, 5],
            [0, 0, 0],
        ];
    } else if (type === 'S') {
        return [
            [0, 6, 6],
            [6, 6, 0],
            [0, 0, 0],
        ];
    } else if (type === 'T') {
        return [
            [0, 7, 0],
            [7, 7, 7],
            [0, 0, 0],
        ];
    }
}

function createMatrix(w, h) {
    const matrix = [];
    while (h--) {
        matrix.push(new Array(w).fill(0));
    }
    return matrix;
}

function drawMatrix(matrix, offset, ctx = context) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                ctx.fillStyle = COLORS[value];
                ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
            }
        });
    });
}

function draw() {
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width, canvas.height); // Clear main canvas

    // Draw grid background
    context.strokeStyle = 'rgba(255, 255, 255, 0.2)'; // Increased opacity
    context.lineWidth = 0.05;
    context.setLineDash([0.1, 0.1]); // Tighter dots
    context.beginPath();
    for (let x = 1; x < 12; x++) {
        context.moveTo(x, 0);
        context.lineTo(x, 20);
    }
    context.stroke();
    context.setLineDash([]); // Reset dash

    // Draw Ghost Piece
    const ghost = {
        matrix: player.matrix,
        pos: { ...player.pos },
    };
    while (!collide(arena, ghost)) {
        ghost.pos.y++;
    }
    ghost.pos.y--; // Back up one step

    context.globalAlpha = 0.2; // Set transparency
    drawMatrix(ghost.matrix, ghost.pos);
    context.globalAlpha = 1.0; // Reset transparency

    drawMatrix(arena, { x: 0, y: 0 });
    drawMatrix(player.matrix, player.pos);
}

function drawNext() {
    nextContext.fillStyle = '#000';
    nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

    // Center the piece
    const xOffset = (4 - nextPiece.matrix[0].length) / 2;
    const yOffset = (4 - nextPiece.matrix.length) / 2;
    drawMatrix(nextPiece.matrix, { x: xOffset, y: yOffset }, nextContext);
}

function merge(arena, player) {
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                arena[y + player.pos.y][x + player.pos.x] = value;
            }
        });
    });
}

function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
            [
                matrix[x][y],
                matrix[y][x],
            ] = [
                    matrix[y][x],
                    matrix[x][y],
                ];
        }
    }

    if (dir > 0) {
        matrix.forEach(row => row.reverse());
    } else {
        matrix.reverse();
    }
}

function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        sounds.play('drop');
        playerReset();
        arenaSweep();
        updateScore();
    }
    dropCounter = 0;
}

function playerHardDrop() {
    while (!collide(arena, player)) {
        player.pos.y++;
    }
    player.pos.y--;
    merge(arena, player);
    sounds.play('drop');
    playerReset();
    arenaSweep();
    updateScore();
    dropCounter = 0;
}

function playerMove(offset) {
    player.pos.x += offset;
    if (collide(arena, player)) {
        player.pos.x -= offset;
    } else {
        sounds.play('move');
    }
}

function playerReset() {
    if (nextPiece.matrix === null) {
        // First run
        player.matrix = createPiece(PIECES[PIECES.length * Math.random() | 0]);
        player.score = 0;
    } else {
        player.matrix = nextPiece.matrix;
    }

    // Generate next piece
    const type = PIECES[PIECES.length * Math.random() | 0];
    nextPiece.matrix = createPiece(type);
    drawNext();

    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) -
        (player.matrix[0].length / 2 | 0);

    if (collide(arena, player)) {
        // Game Over
        arena.forEach(row => row.fill(0));
        player.score = 0;
        updateScore();
        sounds.play('gameover');
        alert("Game Over!");
    }
}

function playerRotate(dir) {
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix, dir);
    while (collide(arena, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) {
            rotate(player.matrix, -dir);
            player.pos.x = pos;
            return;
        }
    }
    sounds.play('rotate');
}

function collide(arena, player) {
    const m = player.matrix;
    const o = player.pos;
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 &&
                (arena[y + o.y] &&
                    arena[y + o.y][x + o.x]) !== 0) {
                return true;
            }
        }
    }
    return false;
}

function arenaSweep() {
    let rowCount = 1;
    outer: for (let y = arena.length - 1; y > 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) {
            if (arena[y][x] === 0) {
                continue outer;
            }
        }

        const row = arena.splice(y, 1)[0].fill(0);
        arena.unshift(row);
        ++y;

        player.score += rowCount * 10;
        rowCount *= 2;
        sounds.play('clear');
    }
}

function updateScore() {
    scoreElement.innerText = player.score;
}

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;

function update(time = 0) {
    const deltaTime = time - lastTime;
    lastTime = time;

    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        playerDrop();
    }

    draw();
    if (isRunning) requestAnimationFrame(update);
}

const arena = createMatrix(12, 20);

const player = {
    pos: { x: 0, y: 0 },
    matrix: null,
    score: 0,
};

const nextPiece = {
    matrix: null
};

let isRunning = false;

document.addEventListener('keydown', event => {
    if (!isRunning) return;

    if (event.keyCode === 37) { // Left
        playerMove(-1);
    } else if (event.keyCode === 39) { // Right
        playerMove(1);
    } else if (event.keyCode === 40) { // Down
        playerDrop();
    } else if (event.keyCode === 38) { // Up
        playerRotate(1);
    } else if (event.keyCode === 32) { // Space (Hard Drop)
        playerHardDrop();
    }
});

// Sound Logic
class Sound {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    play(type) {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        const now = this.ctx.currentTime;

        if (type === 'move') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'rotate') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, now);
            osc.frequency.linearRampToValueAtTime(1000, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'drop') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'clear') {
            osc.type = 'sine';
            // Arpeggio
            [440, 554, 659, 880].forEach((freq, i) => {
                const o = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                o.connect(g);
                g.connect(this.ctx.destination);
                o.frequency.value = freq;
                g.gain.setValueAtTime(0.05, now + i * 0.05);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.3);
                o.start(now + i * 0.05);
                o.stop(now + i * 0.05 + 0.3);
            });
        } else if (type === 'gameover') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(500, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 1.0);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0, now + 1.0);
            osc.start(now);
            osc.stop(now + 1.0);
        }
    }
}

const sounds = new Sound();

startBtn.addEventListener('click', () => {
    sounds.play('start'); // Just to resume context if needed
    if (isRunning) return;


    // Reset
    arena.forEach(row => row.fill(0));
    player.score = 0;
    updateScore();
    nextPiece.matrix = null; // force new generation

    isRunning = true;
    playerReset();
    update();
});
