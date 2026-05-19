import { fetchRandomPuzzle } from './api.js';

const PIECES = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
};
const FILES = 'abcdefgh';

function el(id) { return document.getElementById(id); }

/* ─── Audio ─── */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function ensureAudio() { if (!audioCtx) audioCtx = new AudioCtx(); }

function playTone(freq, duration, type = 'sine') {
  try {
    ensureAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (_) {}
}

const SOUNDS = {
  move: () => playTone(440, 0.12, 'sine'),
  capture: () => playTone(330, 0.18, 'triangle'),
  check: () => playTone(660, 0.25, 'square'),
  success: () => { playTone(523, 0.15, 'sine'); setTimeout(() => playTone(659, 0.15, 'sine'), 150); setTimeout(() => playTone(784, 0.3, 'sine'), 300); },
  fail: () => playTone(220, 0.3, 'sawtooth'),
  hint: () => playTone(800, 0.1, 'sine'),
  wrong: () => playTone(180, 0.25, 'sawtooth'),
  opponent: () => playTone(520, 0.1, 'triangle'),
};

/* ─── Gamification (localStorage) ─── */
function loadStats() {
  try {
    return JSON.parse(localStorage.getItem('chess_puzzle_stats')) || { rating: 1200, streak: 0, bestStreak: 0, solved: 0, total: 0 };
  } catch { return { rating: 1200, streak: 0, bestStreak: 0, solved: 0, total: 0 }; }
}
function saveStats(s) { localStorage.setItem('chess_puzzle_stats', JSON.stringify(s)); }
function updateRating(current, correct) {
  const K = 24;
  const expected = 1 / (1 + Math.pow(10, (1200 - current) / 400));
  return Math.round(current + K * ((correct ? 1 : 0) - expected));
}

/* ─── PuzzleController ─── */
class PuzzleController {
  constructor(data) {
    this.data = data;
    this.solution = data.moves.split(' ');
    this.step = 0;
    this.playing = false;
    this.selected = null;
    this.lastMove = null;
    this.hintLevel = 0;
    this.opponentTimeout = null;
  }

  async init() {
    const { Chess } = await import('chess.js');
    this.game = new Chess(this.data.fen);
    this.render();
    this.updateUI();
  }

  /* --- Parsing / Conversion --- */
  parseBoard() {
    const b = [];
    for (const row of this.data.fen.split(' ')[0].split('/')) {
      const r = [];
      for (const ch of row) {
        if (ch >= '1' && ch <= '8') for (let i = 0; i < parseInt(ch); i++) r.push(null);
        else r.push(ch);
      }
      b.push(r);
    }
    return b;
  }

  uciRC(uci) {
    return { fr: 8 - parseInt(uci[1]), fc: FILES.indexOf(uci[0]), tr: 8 - parseInt(uci[3]), tc: FILES.indexOf(uci[2]) };
  }

  sq(r, c) { return FILES[c] + (8 - r); }

  /* --- Rendering --- */
  render() {
    const f = this.game ? this.game.fen() : this.data.fen;
    const board = this.parseBoard();
    const turn = f.split(' ')[1];
    const el = el_('board');
    el.innerHTML = '';

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        sq.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
        sq.dataset.r = r; sq.dataset.c = c;

        const ch = board[r][c];
        if (ch) {
          const p = document.createElement('span');
          p.className = 'piece ' + (ch === ch.toUpperCase() ? 'white' : 'black');
          p.textContent = PIECES[ch];
          sq.appendChild(p);
        }

        if (this.selected && this.selected.r === r && this.selected.c === c) sq.classList.add('selected');
        if (this.lastMove) {
          if ((this.lastMove.fr === r && this.lastMove.fc === c) ||
              (this.lastMove.tr === r && this.lastMove.tc === c)) sq.classList.add('last-move');
        }

        sq.addEventListener('click', () => this.onClick(r, c));
        el.appendChild(sq);
      }
    }

    if (this.selected) this.showDests();
    if (this.hintLevel === 1) this.showHintPiece();
    if (this.hintLevel === 2) this.showHintDest();
  }

  showDests() {
    const from = this.sq(this.selected.r, this.selected.c);
    const dests = this.game.moves({ square: from, verbose: true });
    document.querySelectorAll('.square').forEach(sq => {
      const r = parseInt(sq.dataset.r), c = parseInt(sq.dataset.c);
      if (dests.some(m => m.to === this.sq(r, c))) {
        sq.classList.add('move-dest');
        if (sq.querySelector('.piece')) sq.classList.add('capture');
      }
    });
  }

  clearBoardHighlights() {
    document.querySelectorAll('.square').forEach(sq => {
      sq.classList.remove('selected', 'move-dest', 'capture', 'hint-piece', 'hint-dest', 'shake');
    });
  }

  /* --- Hint System --- */
  showHintPiece() {
    const uci = this.solution[this.step];
    this.clearBoardHighlights();
    const { fr, fc } = this.uciRC(uci);
    const sq = document.querySelector(`.square[data-r="${fr}"][data-c="${fc}"]`);
    if (sq) sq.classList.add('hint-piece');
  }

  showHintDest() {
    const uci = this.solution[this.step];
    const { fr, fc, tr, tc } = this.uciRC(uci);
    document.querySelectorAll('.square').forEach(sq => {
      const r = parseInt(sq.dataset.r), c = parseInt(sq.dataset.c);
      if (r === fr && c === fc) sq.classList.add('hint-piece');
      if (r === tr && c === tc) sq.classList.add('hint-dest');
    });
  }

  giveHint() {
    if (this.playing || this.step >= this.solution.length) return;
    this.hintLevel = (this.hintLevel % 2) + 1;
    SOUNDS.hint();
    this.render();
    el_('status').textContent = this.hintLevel === 1 ? 'Hint: find the right piece to move' : 'Hint: move to the highlighted square';
  }

  /* --- Click Handler --- */
  onClick(r, c) {
    if (this.playing || !this.game) return;
    const board = this.parseBoard();
    const turn = this.game.fen().split(' ')[1];
    const sqName = this.sq(r, c);

    if (this.selected && this.selected.r === r && this.selected.c === c) {
      this.selected = null;
      this.hintLevel = 0;
      this.render();
      return;
    }

    if (this.selected) {
      const from = this.sq(this.selected.r, this.selected.c);
      const m = this.game.move({ from, to: sqName, promotion: 'q' });
      if (m) {
        this.selected = null;
        this.handleMove(m);
        return;
      }
      const piece = board[r][c];
      if (piece && ((turn === 'w' && piece === piece.toUpperCase()) ||
                    (turn === 'b' && piece === piece.toLowerCase()))) {
        this.selected = { r, c };
        this.hintLevel = 0;
        this.render();
        return;
      }
      const sq = document.querySelector(`.square[data-r="${r}"][data-c="${c}"]`);
      if (sq) { sq.classList.add('shake'); setTimeout(() => sq.classList.remove('shake'), 300); }
      this.selected = null;
      this.render();
      return;
    }

    const piece = board[r][c];
    if (piece && ((turn === 'w' && piece === piece.toUpperCase()) ||
                  (turn === 'b' && piece === piece.toLowerCase()))) {
      this.selected = { r, c };
      this.hintLevel = 0;
      this.render();
    }
  }

  /* --- Move Handling --- */
  handleMove(move) {
    const expected = this.solution[this.step];
    const status = el_('status');
    this.hintLevel = 0;

    if (move.lan === expected) {
      this.correct(move);
    } else {
      this.game.undo();
      SOUNDS.wrong();
      status.textContent = `Wrong. Try again.`;
      status.style.color = '#f44336';
      this.lastMove = null;
      this.render();
      setTimeout(() => { if (!this.playing) status.style.color = '#eee'; }, 1500);
    }
  }

  correct(move) {
    SOUNDS.move();
    const status = el_('status');
    this.step++;
    this.lastMove = this.uciRC(move.lan);
    this.updateHistory();

    if (this.step >= this.solution.length) {
      SOUNDS.success();
      this.onSolved();
      return;
    }

    status.textContent = 'Correct!';
    status.style.color = '#4caf50';
    this.playing = true;
    this.render();

    this.opponentTimeout = setTimeout(() => {
      const oppUci = this.solution[this.step];
      this.game.move(oppUci, { uci: true });
      this.step++;
      this.lastMove = this.uciRC(oppUci);
      SOUNDS.opponent();
      this.playing = false;
      this.render();
      const turn = this.game.fen().split(' ')[1] === 'w' ? 'white' : 'black';
      status.textContent = `Your turn (${turn})`;
      status.style.color = '#eee';
      this.updateHistory();
    }, 500);
  }

  onSolved() {
    this.playing = true;
    el_('status').textContent = 'Puzzle solved!';
    el_('status').style.color = '#4caf50';
    this.render();
    confetti();

    const stats = loadStats();
    stats.solved++;
    stats.total++;
    stats.streak++;
    if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
    stats.rating = updateRating(stats.rating, true);
    saveStats(stats);
    this.displayStats(stats, true);
  }

  onFailed() {
    this.playing = true;
    el_('status').textContent = 'Puzzle failed';
    el_('status').style.color = '#f44336';
    SOUNDS.fail();
    this.render();

    const stats = loadStats();
    stats.total++;
    stats.streak = 0;
    stats.rating = updateRating(stats.rating, false);
    saveStats(stats);
    this.displayStats(stats, false);
  }

  skipPuzzle() {
    if (this.opponentTimeout) clearTimeout(this.opponentTimeout);
    this.playing = true;
    const status = el_('status');
    status.textContent = 'Expected solution:';
    status.style.color = '#ff9800';
    el_('move-history').textContent = this.solution.join(' ');
    this.render();
    this.onFailed();
  }

  /* --- UI Updates --- */
  displayStats(stats, won) {
    const ratingEl = el_('user-rating');
    if (ratingEl) {
      const change = 'rating-change';
      let old = ratingEl.textContent.match(/\d+/);
      old = old ? parseInt(old[0]) : 1200;
      ratingEl.textContent = `Rating: ${stats.rating}`;
      const diff = stats.rating - old;
      const chEl = document.getElementById(change);
      if (chEl) chEl.textContent = (diff >= 0 ? '+' : '') + diff;
    }
    const streakEl = el_('user-streak');
    if (streakEl) streakEl.textContent = `Streak: ${stats.streak}🔥`;
    const solvedEl = el_('user-solved');
    if (solvedEl) solvedEl.textContent = `Solved: ${stats.solved}`;
  }

  updateUI() {
    el_('status').textContent = `Find the best move for ${this.data.fen.split(' ')[1] === 'w' ? 'white' : 'black'}`;
    el_('status').style.color = '#eee';
    el_('rating').textContent = `Puzzle rating: ${this.data.rating}`;
    el_('themes').innerHTML = this.data.themes.map(t => `<span class="theme-tag">${t}</span>`).join('');
    el_('move-history').textContent = '';
    const stats = loadStats();
    this.displayStats(stats, true);
  }

  updateHistory() {
    el_('move-history').textContent = this.game.history({ verbose: true }).map(m => m.san).join(' ');
  }

  destroy() {
    if (this.opponentTimeout) clearTimeout(this.opponentTimeout);
    this.playing = true;
  }
}

let controller = null;

function el_(id) { return document.getElementById(id); }

function confetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;
  const colors = ['#ff0', '#f0f', '#0ff', '#f00', '#0f0', '#00f', '#ff8800', '#ff0088'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('div');
    c.className = 'confetti-piece';
    c.style.left = Math.random() * 100 + '%';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDuration = (0.5 + Math.random() * 1.5) + 's';
    c.style.animationDelay = Math.random() * 0.5 + 's';
    c.style.width = (5 + Math.random() * 8) + 'px';
    c.style.height = (5 + Math.random() * 8) + 'px';
    c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    container.appendChild(c);
    setTimeout(() => c.remove(), 2500);
  }
}

async function newPuzzle() {
  if (controller) controller.destroy();
  const status = el_('status');
  status.textContent = 'Loading puzzle...';
  status.style.color = '#eee';
  el_('new-puzzle-btn').disabled = true;
  el_('skip-btn').style.display = 'none';

  try {
    const difficulty = el_('difficulty').value;
    const puzzle = await fetchRandomPuzzle(difficulty);
    if (puzzle.error) {
      status.textContent = puzzle.error.includes('downloader') ? 'No puzzles in database. Run the downloader.' : `Error: ${puzzle.error}`;
      status.style.color = '#ff9800';
      return;
    }
    controller = new PuzzleController(puzzle);
    await controller.init();
    el_('skip-btn').style.display = 'inline-block';
  } catch (err) {
    status.textContent = `Failed: ${err.message}`;
    status.style.color = '#ff9800';
  } finally {
    el_('new-puzzle-btn').disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  el_('new-puzzle-btn').addEventListener('click', newPuzzle);
  el_('hint-btn').addEventListener('click', () => controller && controller.giveHint());
  el_('skip-btn').addEventListener('click', () => controller && controller.skipPuzzle());
  el_('difficulty').addEventListener('change', newPuzzle);
  el_('color-scheme').addEventListener('change', e => {
    document.getElementById('board').dataset.theme = e.target.value;
  });
  newPuzzle();
});