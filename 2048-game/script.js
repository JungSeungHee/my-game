const GRID_SIZE = 4;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;

// Grid 클래스: 게임 보드의 격자 구조를 관리합니다.
class Grid {
    constructor(gridElement) {
        this.cells = [];
        // 각 셀을 생성하여 격자를 초기화합니다.
        for (let i = 0; i < CELL_COUNT; i++) {
            this.cells.push(
                new Cell(gridElement, i % GRID_SIZE, Math.floor(i / GRID_SIZE))
            );
        }
    }

    get emptyCells() {
        return this.cells.filter(cell => cell.tile == null);
    }

    randomEmptyCell() {
        const emptyCells = this.emptyCells;
        if (emptyCells.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * emptyCells.length);
        return emptyCells[randomIndex];
    }

    cellsByColumn() {
        return this.cells.reduce((cellGrid, cell) => {
            cellGrid[cell.x] = cellGrid[cell.x] || [];
            cellGrid[cell.x][cell.y] = cell;
            return cellGrid;
        }, []);
    }

    cellsByRow() {
        return this.cells.reduce((cellGrid, cell) => {
            cellGrid[cell.y] = cellGrid[cell.y] || [];
            cellGrid[cell.y][cell.x] = cell;
            return cellGrid;
        }, []);
    }
}

// Cell 클래스: 격자의 각 칸을 나타내며 타일 정보를 보유합니다.
class Cell {
    constructor(gridElement, x, y) {
        this.x = x;
        this.y = y;
        this.tile = null;
        this.mergeTile = null; // 병합될 타일을 임시 저장
    }

    canAccept(tile) {
        return (
            this.tile == null ||
            (this.mergeTile == null && this.tile.value === tile.value)
        );
    }

    mergeTiles() {
        if (this.tile == null || this.mergeTile == null) return 0;
        this.tile.value = this.tile.value * 2;
        this.mergeTile.remove();
        this.mergeTile = null;
        return this.tile.value;
    }
}

// Tile 클래스: 숫자 타일을 나타내며 위치와 애니메이션을 처리합니다.
class Tile {
    constructor(tileContainer, value = Math.random() > 0.2 ? 2 : 4) {
        this.tileContainer = tileContainer;
        this.element = document.createElement("div");
        this.element.classList.add("tile");
        this.tileContainer.appendChild(this.element);
        this.value = value;
    }

    set value(v) {
        this._value = v;
        this.element.textContent = v;
        this.element.dataset.value = v;
    }

    get value() {
        return this._value;
    }

    set x(value) {
        this._x = value;
        this.element.style.setProperty("--x", value);
    }

    set y(value) {
        this._y = value;
        this.element.style.setProperty("--y", value);
    }

    remove() {
        this.element.remove();
    }

    waitForTransition(animation = false) {
        return new Promise(resolve => {
            const duration = animation ? 200 : 100;
            const eventName = animation ? "animationend" : "transitionend";

            const handler = () => {
                this.element.removeEventListener(eventName, handler);
                resolve();
            };

            this.element.addEventListener(eventName, handler, { once: true });

            // Safety timeout in case event doesn't fire
            setTimeout(handler, duration + 50);
        });
    }
}

const gameBoard = document.getElementById("grid-container");
const tileContainer = document.getElementById("tile-container");
const scoreElement = document.getElementById("score");
const bestScoreElement = document.getElementById("best-score");
const restartButton = document.getElementById("restart-button");

let grid;
let score = 0;
let bestScore = localStorage.getItem("2048-best-score") || 0;
bestScoreElement.textContent = bestScore;

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

        if (type === 'move') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'merge') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'win') {
            osc.type = 'triangle';
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                const o = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                o.connect(g);
                g.connect(this.ctx.destination);
                o.frequency.value = freq;
                g.gain.setValueAtTime(0.1, now + i * 0.1);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
                o.start(now + i * 0.1);
                o.stop(now + i * 0.1 + 0.3);
            });
        } else if (type === 'gameover') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 1.0);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0, now + 1.0);
            osc.start(now);
            osc.stop(now + 1.0);
        }
    }
}

const sound = new Sound();

// Resume AudioContext on initial interaction
window.addEventListener('click', () => {
    sound.resume();
}, { once: true });
window.addEventListener('keydown', () => {
    sound.resume();
}, { once: true });

function setupInput() {
    // 한 번의 입력만 처리하고 이벤트 리스너를 제거합니다 (입력 처리 중 중복 방지)
    window.addEventListener("keydown", handleInput, { once: true });

    let touchStartX = 0;
    let touchStartY = 0;

    // 터치 이벤트 처리
    window.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: false });

    window.addEventListener('touchend', e => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        handleSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
    }, { passive: false });
}

async function handleInput(e) {
    console.log(e.key);
    try {
        let moved = false;
        // 방향키에 따른 이동 처리
        switch (e.key) {
            case "ArrowUp":
                moved = await moveUp();
                break;
            case "ArrowDown":
                moved = await moveDown();
                break;
            case "ArrowLeft":
                moved = await moveLeft();
                break;
            case "ArrowRight":
                moved = await moveRight();
                break;
            default:
                setupInput();
                return;
        }

        if (!moved) {
            setupInput();
            return;
        }
    } catch (err) {
        console.error("Move error:", err);
        setupInput();
        return;
    }

    // 병합된 타일 정보 초기화
    grid.cells.forEach(cell => cell.mergeTile = null);

    // 새로운 타일 생성
    const newTile = new Tile(tileContainer);
    const cell = grid.randomEmptyCell();
    cell.tile = newTile;
    newTile.x = cell.x;
    newTile.y = cell.y;

    // 게임 오버 체크 (더 이상 이동할 수 없는 경우)
    if (!canMoveUp() && !canMoveDown() && !canMoveLeft() && !canMoveRight()) {
        newTile.waitForTransition(true).then(() => {
            sound.play('gameover');
            alert("Game Over! Score: " + score);
        });
        return;
    }

    setupInput();
}

function handleSwipe(startX, startY, endX, endY) {
    const dx = endX - startX;
    const dy = endY - startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) > 30) {
        const event = { key: '' };
        // 더 긴 이동 거리를 기준으로 방향 결정
        if (absDx > absDy) {
            event.key = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
        } else {
            event.key = dy > 0 ? 'ArrowDown' : 'ArrowUp';
        }
        handleInput(event);
    }
}

function moveUp() {
    return slideTiles(grid.cellsByColumn());
}

function moveDown() {
    return slideTiles(grid.cellsByColumn().map(column => [...column].reverse()));
}

function moveLeft() {
    return slideTiles(grid.cellsByRow());
}

function moveRight() {
    return slideTiles(grid.cellsByRow().map(row => [...row].reverse()));
}

function slideTiles(groupedCells) {
    const promises = [];
    let moved = false;

    groupedCells.forEach(group => {
        for (let i = 1; i < group.length; i++) {
            const cell = group[i];
            if (cell.tile == null) continue;

            let lastValidCell = null;
            // 이동 가능한 위치 탐색
            for (let j = i - 1; j >= 0; j--) {
                const target = group[j];
                if (!target.canAccept(cell.tile)) break;
                lastValidCell = target;
            }

            if (lastValidCell != null) {
                promises.push(moveTile(cell, lastValidCell));
                moved = true;
            }
        }
    });

    if (moved) sound.play('move');

    if (!moved) return Promise.resolve(false);

    // 애니메이션이 끝나면 점수 업데이트 및 병합 처리
    return Promise.all(promises).then(() => {
        grid.cells.forEach(cell => {
            const points = cell.mergeTiles();
            if (points) {
                updateScore(points);
                sound.play('merge');
                if (points === 2048) sound.play('win');
            }
        });
        return true;
    });
}

function moveTile(sourceCell, targetCell) {
    if (targetCell.tile != null) {
        targetCell.mergeTile = sourceCell.tile;
    } else {
        targetCell.tile = sourceCell.tile;
    }
    sourceCell.tile = null;

    // 타일의 시각적 위치 업데이트 및 애니메이션 대기
    if (targetCell.mergeTile) {
        targetCell.mergeTile.x = targetCell.x;
        targetCell.mergeTile.y = targetCell.y;
        return targetCell.mergeTile.waitForTransition();
    } else {
        targetCell.tile.x = targetCell.x;
        targetCell.tile.y = targetCell.y;
        return targetCell.tile.waitForTransition();
    }
}

function canMoveUp() { return canMove(grid.cellsByColumn()); }
function canMoveDown() { return canMove(grid.cellsByColumn().map(c => [...c].reverse())); }
function canMoveLeft() { return canMove(grid.cellsByRow()); }
function canMoveRight() { return canMove(grid.cellsByRow().map(r => [...r].reverse())); }

function canMove(groupedCells) {
    return groupedCells.some(group => {
        return group.some((cell, index) => {
            if (index === 0) return false;
            if (cell.tile == null) return false;
            const target = group[index - 1];
            return target.canAccept(cell.tile);
        });
    });
}

function updateScore(add) {
    score += add;
    scoreElement.textContent = score;
    if (score > bestScore) {
        bestScore = score;
        bestScoreElement.textContent = bestScore;
        localStorage.setItem("2048-best-score", bestScore);
    }
}

function startGame() {
    tileContainer.innerHTML = "";
    score = 0;
    updateScore(0);
    grid = new Grid(gameBoard);
    // 초기 타일 2개 생성
    addRandomTile();
    addRandomTile();
    setupInput();
}

function addRandomTile() {
    const cell = grid.randomEmptyCell();
    if (cell) {
        const tile = new Tile(tileContainer);
        cell.tile = tile;
        tile.x = cell.x;
        tile.y = cell.y;
    }
}

restartButton.addEventListener("click", startGame);

// Start game on load
startGame();
