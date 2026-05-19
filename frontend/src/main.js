import { fetchRandomPuzzle } from './api.js';

const PIECES = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
};

const FILES = 'abcdefgh';

let game = null;
let currentPuzzle = null;
let solutionIndex = 0;
let isCorrect = false;
let selected = null;
let lastMove = null;

function parseFEN(fen) {
  const board = [];
  for (const row of fen.split(' ')[0].split('/')) {
    const r = [];
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < parseInt(ch); i++) r.push(null);
      } else {
        r.push(ch);
      }
    }
    board.push(r);
  }
  return board;
}

function renderBoard() {
  if (!game) return;
  const board = parseFEN(game.fen());
  const turn = game.fen().split(' ')[1];
  const el = document.getElementById('board');
  el.innerHTML = '';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
      sq.dataset.r = r;
      sq.dataset.c = c;

      const ch = board[r][c];
      if (ch) {
        const p = document.createElement('span');
        p.className = 'piece ' + (ch === ch.toUpperCase() ? 'white' : 'black');
        p.textContent = PIECES[ch];
        sq.appendChild(p);
      }

      if (selected && selected.r === r && selected.c === c) sq.classList.add('selected');

      if (lastMove) {
        if ((lastMove.fromR === r && lastMove.fromC === c) ||
            (lastMove.toR === r && lastMove.toC === c)) {
          sq.classList.add('last-move');
        }
      }

      sq.addEventListener('click', () => {
        if (selected && selected.r === r && selected.c === c) {
          selected = null;
          renderBoard();
          return;
        }

        if (selected) {
          const from = FILES[selected.c] + (8 - selected.r);
          const to = FILES[c] + (8 - r);
          const m = game.move({ from, to, promotion: 'q' });
          if (m) {
            selected = null;
            onMove(m);
            return;
          }
          const piece = board[r][c];
          if (piece && ((turn === 'w' && piece === piece.toUpperCase()) ||
                        (turn === 'b' && piece === piece.toLowerCase()))) {
            selected = { r, c };
            renderBoard();
            showDests();
            return;
          }
          selected = null;
          renderBoard();
          return;
        }

        const piece = board[r][c];
        if (piece && ((turn === 'w' && piece === piece.toUpperCase()) ||
                      (turn === 'b' && piece === piece.toLowerCase()))) {
          selected = { r, c };
          renderBoard();
          showDests();
        }
      });

      el.appendChild(sq);
    }
  }
}

function showDests() {
  if (!selected) return;
  const from = FILES[selected.c] + (8 - selected.r);
  const dests = game.moves({ square: from, verbose: true });
  document.querySelectorAll('.square').forEach(sq => {
    const r = parseInt(sq.dataset.r);
    const c = parseInt(sq.dataset.c);
    const sqName = FILES[c] + (8 - r);
    if (dests.some(m => m.to === sqName)) {
      sq.classList.add('move-dest');
      if (sq.querySelector('.piece')) sq.classList.add('capture');
    }
  });
}

function uciToRowCol(uci) {
  return {
    fromR: 8 - parseInt(uci[1]),
    fromC: FILES.indexOf(uci[0]),
    toR: 8 - parseInt(uci[3]),
    toC: FILES.indexOf(uci[2]),
  };
}

function onMove(move) {
  const puzzleMoves = currentPuzzle.moves.split(' ');
  const expected = puzzleMoves[solutionIndex];
  const statusEl = document.getElementById('status');

  if (move.lan === expected) {
    statusEl.textContent = 'Correct!';
    statusEl.style.color = '#4caf50';
    solutionIndex++;
    lastMove = uciToRowCol(move.lan);
    updateHistory();

    if (solutionIndex >= puzzleMoves.length) {
      statusEl.textContent = 'Puzzle solved!';
      isCorrect = true;
      renderBoard();
      return;
    }

    statusEl.textContent = 'Correct! Opponent responds...';
    setTimeout(() => {
      const oppUci = puzzleMoves[solutionIndex];
      game.move(oppUci, { uci: true });
      solutionIndex++;
      lastMove = uciToRowCol(oppUci);
      renderBoard();
      const turn = game.fen().split(' ')[1] === 'w' ? 'white' : 'black';
      statusEl.textContent = `Your turn (${turn})`;
      statusEl.style.color = '#eee';
      updateHistory();
    }, 600);
  } else {
    game.undo();
    statusEl.textContent = `Wrong move. Expected: ${expected}`;
    statusEl.style.color = '#f44336';
    setTimeout(() => { statusEl.style.color = '#eee'; }, 2000);
    renderBoard();
  }
}

function updateHistory() {
  document.getElementById('move-history').textContent =
    game.history({ verbose: true }).map(m => m.san).join(' ');
}

async function loadPuzzle(puzzle) {
  currentPuzzle = puzzle;
  solutionIndex = 0;
  isCorrect = false;
  selected = null;
  lastMove = null;

  const { Chess } = await import('chess.js');
  game = new Chess(puzzle.fen);

  renderBoard();
  const turn = puzzle.fen.split(' ')[1] === 'w' ? 'white' : 'black';
  document.getElementById('status').textContent = `Find the best move for ${turn}`;
  document.getElementById('status').style.color = '#eee';
  document.getElementById('rating').textContent = `Rating: ${puzzle.rating}`;
  document.getElementById('themes').innerHTML =
    puzzle.themes.map(t => `<span class="theme-tag">${t}</span>`).join('');
  document.getElementById('move-history').textContent = '';
}

async function newPuzzle() {
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Loading puzzle...';
  statusEl.style.color = '#eee';
  document.getElementById('new-puzzle-btn').disabled = true;

  try {
    const difficulty = document.getElementById('difficulty').value;
    const puzzle = await fetchRandomPuzzle(difficulty);
    if (puzzle.error) {
      statusEl.textContent = puzzle.error === 'No puzzles found. Run the downloader first.'
        ? 'No puzzles in database. Run: docker compose run --profile setup downloader'
        : `Error: ${puzzle.error}`;
      statusEl.style.color = '#ff9800';
      return;
    }
    await loadPuzzle(puzzle);
  } catch (err) {
    statusEl.textContent = `Failed to load puzzle: ${err.message}`;
    statusEl.style.color = '#ff9800';
  } finally {
    document.getElementById('new-puzzle-btn').disabled = false;
  }
}

function giveHint() {
  if (!currentPuzzle || isCorrect) return;
  const moves = currentPuzzle.moves.split(' ');
  if (solutionIndex < moves.length) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = `Hint: ${moves[solutionIndex]} is the best move`;
    statusEl.style.color = '#2196f3';
    setTimeout(() => { statusEl.style.color = '#eee'; }, 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('new-puzzle-btn').addEventListener('click', newPuzzle);
  document.getElementById('hint-btn').addEventListener('click', giveHint);
  document.getElementById('difficulty').addEventListener('change', newPuzzle);
  document.getElementById('color-scheme').addEventListener('change', e => {
    document.getElementById('board').dataset.theme = e.target.value;
  });
  newPuzzle();
});