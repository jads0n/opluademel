// Usa mesma origem (funciona local e deploy)
const API_URL = '';

// Config do tabuleiro (precisa bater com backend)
const GRID_SIDE = 5;         // 5x5
const GRID_TILES = 25;
const NUM_BOMBS = 5;

const emojisSeguros = ['🥂', '🍕', '🛵', '💶', '✈️', '🍝', '🍦', '🗺️'];
const emojiBomba = '🧳';
const emojiMissedSafe = '💎';

let currentGameId = null;
let multiplier = 1;
let currentScore = 0;
let isGameOver = false;
let revealedSafeCount = 0;
let selectedGender = '';
let playerName = '';

const gridElement = document.getElementById('grid');
const scoreDisplay = document.getElementById('scoreDisplay');
const multiplierDisplay = document.getElementById('multiplierDisplay');
const btnCashout = document.getElementById('btnCashout');
const scoreBoard = document.getElementById('scoreBoard');
const playerHint = document.getElementById('playerHint');

const startModal = document.getElementById('startModal');
const resultModal = document.getElementById('resultModal');
const startError = document.getElementById('startError');

function openLeaderboard() {
  window.location.href = 'leaderboard.html';
}
window.openLeaderboard = openLeaderboard;

function setModalActive(el, active) {
  if (!el) return;
  el.classList.toggle('active', Boolean(active));
}

function setGender(gender) {
  selectedGender = gender;
  document.getElementById('genderHomem').classList.toggle('active', gender === 'Homem');
  document.getElementById('genderMulher').classList.toggle('active', gender === 'Mulher');
}

function resetBoardUI() {
  gridElement.innerHTML = '';
  for (let i = 0; i < GRID_TILES; i++) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.index = String(i);

    const content = document.createElement('div');
    content.className = 'tile-content';
    tile.appendChild(content);

    tile.addEventListener('click', () => handleTileClick(tile, i));
    gridElement.appendChild(tile);
  }
}

function hardResetGameState({ clearGameId = true } = {}) {
  if (clearGameId) currentGameId = null;
  isGameOver = false;
  currentScore = 0;
  revealedSafeCount = 0;
  updateScoreDisplay(0, true);
  btnCashout.disabled = true;
  btnCashout.innerText = 'Fazer as Malas!';
  document.body.classList.remove('shake');
  setModalActive(resultModal, false);
}

function updatePlayerHint() {
  if (!playerName) {
    playerHint.textContent = 'Pronto para jogar';
    return;
  }
  const genderEmoji = selectedGender === 'Homem' ? '👨' : selectedGender === 'Mulher' ? '👩' : '';
  playerHint.textContent = `${genderEmoji} ${playerName}`.trim();
}

function animateScoreBoardPop() {
  if (!scoreBoard) return;
  scoreBoard.style.transform = 'scale(1.05)';
  setTimeout(() => { scoreBoard.style.transform = 'scale(1)'; }, 150);
}

function updateScoreDisplay(nextScore, immediate = false) {
  currentScore = nextScore;

  if (immediate || nextScore === 0) {
    scoreDisplay.innerText = String(nextScore);
    return;
  }

  let currentDisplay = parseInt(scoreDisplay.innerText || '0', 10);
  const step = Math.max(1, Math.floor((nextScore - currentDisplay) / 10));

  const animate = () => {
    if (currentDisplay < nextScore) {
      currentDisplay += step;
      if (currentDisplay > nextScore) currentDisplay = nextScore;
      scoreDisplay.innerText = String(currentDisplay);
      requestAnimationFrame(animate);
    } else {
      scoreDisplay.innerText = String(nextScore);
    }
  };
  requestAnimationFrame(animate);
}

async function startGame() {
  const name = document.getElementById('playerName').value.trim();
  const code = document.getElementById('ticketCode').value.trim().toUpperCase();

  startError.textContent = '';
  if (!name) { startError.textContent = 'Informe seu nome.'; return; }
  if (!selectedGender) { startError.textContent = 'Selecione Homem ou Mulher.'; return; }
  if (code.length < 6) { startError.textContent = 'Digite o código do ticket (6 caracteres).'; return; }

  const btn = document.getElementById('btnStart');
  try {
    btn.disabled = true;
    btn.textContent = 'Embarcando...';

    const res = await fetch(`${API_URL}/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, player_name: name, player_gender: selectedGender }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Não foi possível iniciar.');

    currentGameId = data.game_id;
    multiplier = data.multiplier || 1;
    multiplierDisplay.innerText = `${multiplier}x`;

    playerName = name;
    updatePlayerHint();

    // Resetar UI/estado, mas mantendo o game_id recém-criado
    hardResetGameState({ clearGameId: false });
    resetBoardUI();
    setModalActive(startModal, false);

  } catch (err) {
    startError.textContent = err.message || 'Erro de conexão.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Embarcar';
  }
}

async function handleTileClick(tile, index) {
  if (isGameOver) return;
  if (!currentGameId) {
    // Sem jogo ativo: guia o usuário pro modal de embarque
    openStartModal();
    startError.textContent = 'Antes de abrir as casas, embarque com seu código.';
    return;
  }
  if (tile.classList.contains('revealed')) return;

  const row = Math.floor(index / GRID_SIDE);
  const col = index % GRID_SIDE;

  try {
    const res = await fetch(`${API_URL}/game/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: currentGameId, row, col }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Erro ao clicar.');

    tile.classList.add('revealed');
    const content = tile.querySelector('.tile-content');

    if (data.result === 'safe') {
      tile.classList.add('safe');
      content.innerText = emojisSeguros[Math.floor(Math.random() * emojisSeguros.length)];
      revealedSafeCount++;
      updateScoreDisplay(data.current_score);
      animateScoreBoardPop();

      btnCashout.disabled = false;
      btnCashout.innerText = `Sacar ${data.current_score} PTS`;

      // Vitória local (quando abriu todas as casas seguras)
      if (revealedSafeCount >= (GRID_TILES - NUM_BOMBS)) {
        await triggerWin();
      }
      return;
    }

    // Bomba fatal (backend devolve grid completo)
    tile.classList.add('fatal-bomb', 'bomb');
    content.innerText = emojiBomba;
    updateScoreDisplay(0, true);
    await triggerDramaticGameOver(data.grid, index);

  } catch (err) {
    // Erro silencioso, mas útil pra debug
    console.error(err);
  }
}

async function cashout() {
  if (isGameOver || !currentGameId || currentScore === 0) return;
  btnCashout.disabled = true;
  try {
    const res = await fetch(`${API_URL}/game/cashout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: currentGameId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Erro no cashout.');

    isGameOver = true;
    showResultModal('Malas Prontas! ✈️', `Você foi prudente e sacou ${data.final_score} pontos para o ranking geral!`);
  } catch (err) {
    console.error(err);
    btnCashout.disabled = false;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function triggerDramaticGameOver(fullGrid, fatalIndex) {
  isGameOver = true;
  btnCashout.disabled = true;
  btnCashout.innerText = 'PONTOS PERDIDOS...';

  document.body.classList.add('shake');
  if (!Array.isArray(fullGrid) || fullGrid.length !== GRID_SIDE) {
    // Fallback: se por algum motivo não veio o grid
    await sleep(900);
    showResultModal('Voo Cancelado! 🧳', 'Você encontrou um imprevisto e perdeu tudo. Adquira outro código e tente novamente!');
    return;
  }

  const tiles = Array.from(document.querySelectorAll('.tile'));
  const remainingBombs = [];
  const remainingSafes = [];

  for (let r = 0; r < GRID_SIDE; r++) {
    for (let c = 0; c < GRID_SIDE; c++) {
      const idx = r * GRID_SIDE + c;
      if (idx === fatalIndex) continue;
      const t = tiles[idx];
      if (!t || t.classList.contains('revealed')) continue;
      if (fullGrid[r][c] === 'bomb') remainingBombs.push(t);
      else remainingSafes.push(t);
    }
  }

  await sleep(1000);

  for (const t of remainingBombs) {
    await sleep(300);
    t.classList.add('revealed', 'revealed-bomb', 'bomb');
    t.querySelector('.tile-content').innerText = emojiBomba;
  }

  await sleep(500);
  for (const t of remainingSafes) {
    t.classList.add('revealed', 'missed-safe');
    t.querySelector('.tile-content').innerText = emojiMissedSafe;
  }

  await sleep(1500);
  showResultModal(
    'Voo Cancelado! 🧳',
    'Você encontrou um imprevisto e perdeu tudo. Mostramos onde estavam as outras armadilhas. Adquira outro código e tente a sorte novamente!'
  );
}

async function triggerWin() {
  if (isGameOver) return;
  isGameOver = true;
  btnCashout.disabled = true;

  // Revela as bombas restantes por estética (sem chamar backend)
  const tiles = Array.from(document.querySelectorAll('.tile'));
  for (const t of tiles) {
    if (!t.classList.contains('revealed')) {
      t.classList.add('revealed', 'revealed-bomb', 'bomb');
      t.querySelector('.tile-content').innerText = emojiBomba;
    }
  }

  await sleep(900);
  showResultModal('Jackpot! 🇮🇹', `Viagem perfeita! Você limpou o mapa e garantiu ${currentScore} pontos no ranking!`);
}

function showResultModal(title, message) {
  document.getElementById('modalTitle').innerText = title;
  document.getElementById('modalMessage').innerText = message;
  setModalActive(resultModal, true);
}

function openStartModal() {
  startError.textContent = '';
  setModalActive(startModal, true);
  setTimeout(() => document.getElementById('playerName').focus(), 50);
}

function closeStartModal() {
  setModalActive(startModal, false);
}

function playAgain() {
  // Volta para modal de start (novo código)
  hardResetGameState({ clearGameId: true });
  resetBoardUI();
  openStartModal();
}

document.getElementById('btnCashout').addEventListener('click', cashout);
document.getElementById('btnOpenStart').addEventListener('click', openStartModal);
document.getElementById('btnCloseStart').addEventListener('click', closeStartModal);
document.getElementById('btnStart').addEventListener('click', startGame);
document.getElementById('btnPlayAgain').addEventListener('click', playAgain);
document.getElementById('btnGoRanking').addEventListener('click', openLeaderboard);

document.getElementById('genderHomem').addEventListener('click', () => setGender('Homem'));
document.getElementById('genderMulher').addEventListener('click', () => setGender('Mulher'));

document.getElementById('ticketCode').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') startGame();
});
document.getElementById('playerName').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') startGame();
});

// Inicial
resetBoardUI();
openStartModal();

