/**
 * 엘리트 텍사스 홀덤 - 핵심 로직
 */

// --- 상수 및 열거형 ---
const SUITS = ['♠', '♣', '♥', '♦'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const VALUE_MAP = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

const HAND_RANKINGS = {
    ROYAL_FLUSH: 10,
    STRAIGHT_FLUSH: 9,
    FOUR_OF_A_KIND: 8,
    FULL_HOUSE: 7,
    FLUSH: 6,
    STRAIGHT: 5,
    THREE_OF_A_KIND: 4,
    TWO_PAIR: 3,
    PAIR: 2,
    HIGH_CARD: 1
};

// --- 사운드 시스템 (Web Audio & Speech Synthesis API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// 음성 합성 (TTS) 처리
const speak = (text) => {
    window.speechSynthesis.cancel(); // 이전 음성 취소
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
};

const playSound = (freq, type, duration, volume = 0.1) => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
};

const sounds = {
    card: () => playSound(600, 'sine', 0.1, 0.05),
    chip: (text = '콜') => {
        playSound(1200, 'square', 0.05, 0.02);
        setTimeout(() => playSound(1000, 'square', 0.05, 0.02), 30);
        if (text) speak(text);
    },
    win: () => {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((f, i) => setTimeout(() => playSound(f, 'sine', 0.3, 0.05), i * 100));
        setTimeout(() => speak('승리하셨습니다!'), 500);
    },
    fold: () => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
        speak('다이');
    },
    check: () => {
        playSound(400, 'triangle', 0.1, 0.05);
        setTimeout(() => playSound(400, 'triangle', 0.1, 0.05), 100);
        speak('체크');
    },
    voice: (text) => speak(text)
};

// --- 게임 상태 ---
let gameState = {
    deck: [],
    players: [
        { id: 1, name: '플레이어 (나)', balance: 1000, cards: [], currentBet: 0, folded: false, isAI: false },
        { id: 2, name: '마커스', balance: 1000, cards: [], currentBet: 0, folded: false, isAI: true },
        { id: 3, name: '엘레나', balance: 1000, cards: [], currentBet: 0, folded: false, isAI: true }
    ],
    communityCards: [],
    pot: 0,
    currentBet: 0,
    round: 'PRE_FLOP', // PRE_FLOP, FLOP, TURN, RIVER, SHOWDOWN
    activePlayerIndex: 0,
    dealerIndex: 0,
};

// --- 핵심 초기화 ---
function initGame() {
    setupEventListeners();
    startNewHand();
}

// 덱 생성
function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const value of VALUES) {
            deck.push({ suit, value, rank: VALUE_MAP[value], color: (suit === '♥' || suit === '♦') ? 'red' : 'black' });
        }
    }
    return shuffle(deck);
}

// 셔플 (카드 섞기)
function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// --- 패 판정 로직 ---
function evaluateHand(cards) {
    // 카드를 랭크 내림차순으로 정렬
    const sorted = [...cards].sort((a, b) => b.rank - a.rank);
    const ranks = sorted.map(c => c.rank);
    const suits = sorted.map(c => c.suit);

    // 빈도수 맵 생성
    const rankCounts = {};
    ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    const rankByCount = Object.keys(rankCounts).sort((a, b) => {
        if (rankCounts[b] !== rankCounts[a]) return rankCounts[b] - rankCounts[a];
        return b - a;
    }).map(Number);

    // 플러시 확인
    const suitCounts = {};
    suits.forEach(s => suitCounts[s] = (suitCounts[s] || 0) + 1);
    const flushSuit = Object.keys(suitCounts).find(s => suitCounts[s] >= 5);
    const isFlush = !!flushSuit;
    const flushCards = isFlush ? sorted.filter(c => c.suit === flushSuit).slice(0, 5) : [];

    // 스트레이트 확인
    let isStraight = false;
    let straightHigh = 0;
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);

    // 에이스를 낮은 카드로 쓰는 스트레이트(A-2-3-4-5) 확인
    if (uniqueRanks.includes(14)) uniqueRanks.push(1);

    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
        if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) {
            isStraight = true;
            straightHigh = uniqueRanks[i];
            break;
        }
    }

    // 스트레이트 플러시 확인
    let isStraightFlush = false;
    if (isFlush) {
        const flushRanks = flushCards.map(c => c.rank);
        if (flushRanks.includes(14)) flushRanks.push(1);
        for (let i = 0; i <= flushRanks.length - 5; i++) {
            if (flushRanks[i] - flushRanks[i + 4] === 4) {
                isStraightFlush = true;
                straightHigh = flushRanks[i];
                break;
            }
        }
    }

    // 족보 결정
    if (isStraightFlush && straightHigh === 14) return { score: HAND_RANKINGS.ROYAL_FLUSH, name: '로열 플러시', tie: [14] };
    if (isStraightFlush) return { score: HAND_RANKINGS.STRAIGHT_FLUSH, name: `스트레이트 플러시, ${getKoreanValueName(straightHigh)} 하이`, tie: [straightHigh] };
    if (counts[0] === 4) return { score: HAND_RANKINGS.FOUR_OF_A_KIND, name: `포카드, ${getKoreanValueName(rankByCount[0])} 포카드`, tie: [rankByCount[0], rankByCount[1]] };
    if (counts[0] === 3 && counts[1] >= 2) return { score: HAND_RANKINGS.FULL_HOUSE, name: `풀하우스, ${getKoreanValueName(rankByCount[0])}와 ${getKoreanValueName(rankByCount[1])}`, tie: [rankByCount[0], rankByCount[1]] };
    if (isFlush) return { score: HAND_RANKINGS.FLUSH, name: `플러시, ${getKoreanValueName(flushCards[0].rank)} 하이`, tie: flushCards.map(c => c.rank) };
    if (isStraight) return { score: HAND_RANKINGS.STRAIGHT, name: `스트레이트, ${getKoreanValueName(straightHigh)} 하이`, tie: [straightHigh] };
    if (counts[0] === 3) return { score: HAND_RANKINGS.THREE_OF_A_KIND, name: `트리플, ${getKoreanValueName(rankByCount[0])} 트리플`, tie: [rankByCount[0], rankByCount[1], rankByCount[2]] };
    if (counts[0] === 2 && counts[1] === 2) return { score: HAND_RANKINGS.TWO_PAIR, name: `투 페어, ${getKoreanValueName(rankByCount[0])}와 ${getKoreanValueName(rankByCount[1])}`, tie: [rankByCount[0], rankByCount[1], rankByCount[2]] };
    if (counts[0] === 2) return { score: HAND_RANKINGS.PAIR, name: `${getKoreanValueName(rankByCount[0])} 원 페어`, tie: [rankByCount[0], ...rankByCount.slice(1, 4)] };

    return { score: HAND_RANKINGS.HIGH_CARD, name: `하이 카드, ${getKoreanValueName(ranks[0])}`, tie: ranks.slice(0, 5) };
}

// 한글 카드 이름 반환
function getKoreanValueName(rank) {
    const names = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
    return names[rank] || rank.toString();
}

// --- 게임 진행 흐름 ---
let currentTurnIndex = 0;
const BIG_BLIND = 20;
const SMALL_BLIND = 10;

// 새로운 판 시작
function startNewHand() {
    gameState.deck = createDeck();
    gameState.communityCards = [];
    gameState.pot = SMALL_BLIND + BIG_BLIND;
    gameState.currentBet = BIG_BLIND;
    gameState.round = 'PRE_FLOP';

    gameState.players.forEach((p, i) => {
        p.cards = [gameState.deck.pop(), gameState.deck.pop()];
        p.folded = false;
        sounds.card(); // 카드 지급 사운드

        // 스몰/빅 블라인드 베팅
        if (i === 1) { // 마커스 (AI 1)
            p.balance -= SMALL_BLIND;
            p.currentBet = SMALL_BLIND;
            sounds.chip(); // 베팅 사운드
        } else if (i === 2) { // 엘레나 (AI 2)
            p.balance -= BIG_BLIND;
            p.currentBet = BIG_BLIND;
            sounds.chip(null);
        } else {
            p.currentBet = 0;
        }
    });

    currentTurnIndex = 0; // 유저부터 시작
    updateUI();
    updateControls();
    console.log('새 게임 시작: 프리플랍');
}

// 컨트롤 버튼 상태 업데이트
function updateControls() {
    const player = gameState.players[0];
    const canCheck = player.currentBet === gameState.currentBet;

    document.getElementById('btn-check').disabled = !canCheck;
    document.getElementById('btn-call').disabled = player.folded || canCheck;
    document.getElementById('call-amount').textContent = !canCheck ? `$${gameState.currentBet - player.currentBet}` : '';

    const slider = document.getElementById('raise-slider');
    slider.max = player.balance;
    slider.min = (gameState.currentBet * 2) || 40;
}

// 유저 액션 처리
async function handleAction(type, amount = 0) {
    const player = gameState.players[0];

    // AI 턴 동안 컨트롤 비활성화
    toggleControls(false);

    if (type === 'FOLD') {
        player.folded = true;
        sounds.fold(); // 폴드 사운드
    } else if (type === 'CHECK') {
        sounds.check(); // 체크 사운드
    } else if (type === 'CALL') {
        const diff = gameState.currentBet - player.currentBet;
        player.balance -= diff;
        gameState.pot += diff;
        player.currentBet = gameState.currentBet;
        sounds.chip(); // 칩 사운드
    } else if (type === 'RAISE') {
        const diff = amount - player.currentBet;
        player.balance -= diff;
        gameState.pot += diff;
        player.currentBet = amount;
        gameState.currentBet = amount;
        sounds.chip('레이즈');
    }

    updateUI();

    // AI 턴 실행
    await runAITurns();
}

// 컨트롤 버튼 활성화/비활성화 토글
function toggleControls(enabled) {
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
        if (btn.id !== 'btn-next-hand') btn.disabled = !enabled;
    });
}

// AI 턴 로직
async function runAITurns() {
    for (let i = 1; i < gameState.players.length; i++) {
        const ai = gameState.players[i];
        if (ai.folded) continue;

        const slot = document.getElementById(`player-${ai.id}`);
        if (!slot) continue;

        slot.classList.add('acting');
        document.getElementById(`p${ai.id}-status`).textContent = '생각 중...';

        await new Promise(r => setTimeout(r, 1500));

        // 간단한 AI: 70% 콜/체크, 10% 레이즈, 20% 폴드 (베팅액이 높을 때)
        const callAmount = gameState.currentBet - ai.currentBet;
        const rand = Math.random();

        let action = 'CHECK';
        if (callAmount > 0) {
            if (rand < 0.2 && callAmount > 100) action = 'FOLD';
            else if (rand < 0.9) action = 'CALL';
            else action = 'RAISE';
        } else {
            if (rand > 0.9) action = 'RAISE';
            else action = 'CHECK';
        }

        if (action === 'FOLD') {
            ai.folded = true;
            document.getElementById(`p${ai.id}-status`).textContent = '다이 (Fold)';
            sounds.fold();
        } else if (action === 'CALL') {
            ai.balance -= callAmount;
            gameState.pot += callAmount;
            ai.currentBet = gameState.currentBet;
            document.getElementById(`p${ai.id}-status`).textContent = '콜 (Call)';
            sounds.chip();
        } else if (action === 'RAISE') {
            const raiseTo = gameState.currentBet + 50;
            const diff = raiseTo - ai.currentBet;
            ai.balance -= diff;
            gameState.pot += diff;
            ai.currentBet = raiseTo;
            gameState.currentBet = raiseTo;
            document.getElementById(`p${ai.id}-status`).textContent = `$${raiseTo} 레이즈`;
            sounds.chip('레이즈');
        } else {
            document.getElementById(`p${ai.id}-status`).textContent = '체크 (Check)';
            sounds.check();
        }

        slot.classList.remove('acting');
        updateUI();
    }

    if (gameState.players[0].folded) {
        // 유저가 폴드했다면 남은 라운드 자동 진행
        while (gameState.round !== 'SHOWDOWN') {
            progressHand();
        }
        determineWinner();
    } else {
        progressHand();
    }
}

// 게임 라운드 진행
function progressHand() {
    const rounds = ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'];
    const currentIndex = rounds.indexOf(gameState.round);

    // 라운드 베팅 초기화
    gameState.players.forEach(p => p.currentBet = 0);
    gameState.currentBet = 0;

    if (currentIndex < rounds.length - 1) {
        gameState.round = rounds[currentIndex + 1];

        if (gameState.round === 'FLOP') {
            gameState.communityCards.push(gameState.deck.pop(), gameState.deck.pop(), gameState.deck.pop());
            sounds.card();
        } else if (gameState.round === 'TURN' || gameState.round === 'RIVER') {
            gameState.communityCards.push(gameState.deck.pop());
            sounds.card();
        }

        if (gameState.round === 'SHOWDOWN') {
            determineWinner();
        } else {
            updateUI();
            updateControls();
            toggleControls(true); // 유저 조작 활성화
        }
    }
}

// 승자 결정 및 결과 표시
function determineWinner() {
    const results = gameState.players.map(p => {
        if (p.folded) return { p, score: -1 };
        const evalResult = evaluateHand([...p.cards, ...gameState.communityCards]);
        return { p, ...evalResult };
    });

    // 점수 및 타이 브레이커 기준 정렬
    results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        for (let i = 0; i < b.tie.length; i++) {
            if (b.tie[i] !== a.tie[i]) return b.tie[i] - a.tie[i];
        }
        return 0;
    });

    const winner = results[0];
    winner.p.balance += gameState.pot;

    const winnerName = winner.p.name === '플레이어 (나)' ? '나의 승리!' : `${winner.p.name} 승리!`;
    document.getElementById('winner-name').textContent = winnerName;
    document.getElementById('winner-hand-desc').textContent = winner.name;
    document.getElementById('winner-amount').textContent = `+$${gameState.pot}`;
    document.getElementById('win-overlay').classList.remove('hidden');

    sounds.win(); // 승리 사운드
    updateUI();
}

// --- UI 렌더링 ---
function updateUI() {
    // 판돈 및 잔액 업데이트
    document.getElementById('total-pot').textContent = `$${gameState.pot}`;

    gameState.players.forEach(p => {
        const balanceEl = document.getElementById(`p${p.id}-balance`);
        if (balanceEl) balanceEl.textContent = `$${p.balance}`;

        const cardsCont = document.getElementById(`p${p.id}-cards`);
        if (cardsCont) {
            cardsCont.innerHTML = '';
            p.cards.forEach(card => {
                // AI의 카드는 결과 공개 라운드 전까지 숨김
                const cardEl = createCardElement(card, !p.isAI || gameState.round === 'SHOWDOWN');
                cardsCont.appendChild(cardEl);
            });
        }
    });

    // 커뮤니티 카드 업데이트
    const commCont = document.getElementById('community-cards');
    commCont.innerHTML = '';
    gameState.communityCards.forEach(card => {
        commCont.appendChild(createCardElement(card, true));
    });

    // 상태 메시지 업데이트
    const roundNames = {
        'PRE_FLOP': '프리플랍',
        'FLOP': '플랍',
        'TURN': '턴',
        'RIVER': '리버',
        'SHOWDOWN': '결과 공개'
    };
    document.getElementById('game-status').textContent = roundNames[gameState.round] || gameState.round;
}

// 카드 HTML 요소 생성
function createCardElement(card, visible) {
    const el = document.createElement('div');
    el.className = `card ${card.color} ${!visible ? 'hidden' : ''}`;

    if (visible) {
        el.innerHTML = `
            <span class="value">${card.value}</span>
            <span class="suit">${card.suit}</span>
            <span class="suit-large">${card.suit}</span>
        `;
    }
    return el;
}

// 이벤트 리스너 설정
function setupEventListeners() {
    document.getElementById('btn-fold').addEventListener('click', () => handleAction('FOLD'));
    document.getElementById('btn-check').addEventListener('click', () => handleAction('CHECK'));
    document.getElementById('btn-call').addEventListener('click', () => handleAction('CALL'));
    document.getElementById('btn-raise').addEventListener('click', () => {
        const amount = parseInt(document.getElementById('raise-slider').value);
        handleAction('RAISE', amount);
    });

    const slider = document.getElementById('raise-slider');
    slider.addEventListener('input', (e) => {
        document.getElementById('raise-amount').textContent = `$${e.target.value}`;
    });

    document.getElementById('btn-next-hand').addEventListener('click', () => {
        document.getElementById('win-overlay').classList.add('hidden');
        startNewHand();
    });
}

// 초기화 시작
window.addEventListener('load', initGame);
