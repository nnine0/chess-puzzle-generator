import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import { fetchRandomPuzzle, checkHealth } from './api.js';
import { initEngine, isEngineReady, analyzePosition } from './analysis.js';

let game = new Chess();
let ground = null;
let currentPuzzle = null;
let solutionIndex = 0;
let isCorrect = false;

function fenToColor(fen) {
  return fen.split(' ')[1] === 'w' ? 'white' : 'black';
}

function getLegalDests(chess) {
  const dests = {};
  for (const sq of Object.keys(Chess.SQUARES)) {
    const moves = chess.moves({ square: sq, verbose: true });
    if (moves.length > 0) {
      dests[sq] = moves.map((m) => m.to);
    }
  }
  return dests;
}

async function loadPuzzle(puzzle) {
  currentPuzzle = puzzle;
  solutionIndex = 0;
  isCorrect = false;
  game = new Chess(puzzle.fen);

  const color = fenToColor(puzzle.fen);
  const dests = getLegalDests(game);

  const config = {
    fen: puzzle.fen,
    turnColor: color,
    movable: {
      color: color,
      dests: dests,
      free: false,
      showDests: true,
    },
    events: {
      move: onMove,
    },
    highlight: {
      lastMove: true,
    },
  };

  if (ground) {
    ground.set(config);
  } else {
    ground = Chessground(document.getElementById('board'), config);
  }

  document.getElementById('status').textContent =
    `Find the best move for ${color}`;
  document.getElementById('rating').textContent =
    `Rating: ${puzzle.rating}`;

  const themesEl = document.getElementById('themes');
  themesEl.innerHTML = puzzle.themes
    .map((t) => `<span class="theme-tag">${t}</span>`)
    .join('');

  const history = document.getElementById('move-history');
  history.innerHTML = '';
}

function onMove(from, to) {
  if (isCorrect) return;

  const move = game.move({ from, to, promotion: 'q' });
  if (!move) return;

  const puzzleMoves = currentPuzzle.moves.split(' ');
  const expectedUci = puzzleMoves[solutionIndex];

  if (move.uci === expectedUci) {
    document.getElementById('status').textContent = '✓ Correct!';
    document.getElementById('status').style.color = '#4caf50';
    solutionIndex++;

    const history = document.getElementById('move-history');
    history.textContent = game
      .history({ verbose: true })
      .map((m) => m.san)
      .join(' ');

    if (solutionIndex < puzzleMoves.length) {
      document.getElementById('status').textContent = '✓ Correct! Opponent responds...';
      setTimeout(() => {
        const oppUci = puzzleMoves[solutionIndex];
        const oppMove = game.move(oppUci, { uci: true });
        solutionIndex++;

        const color = fenToColor(game.fen());
        const dests = getLegalDests(game);

        ground.set({
          fen: game.fen(),
          turnColor: color,
          movable: {
            color: color,
            dests: dests,
            showDests: true,
          },
        });

        document.getElementById('status').textContent =
          `Find the next move for ${color}`;
        document.getElementById('status').style.color = '#eee';

        const history = document.getElementById('move-history');
        history.textContent = game
          .history({ verbose: true })
          .map((m) => m.san)
          .join(' ');
      }, 600);
    } else {
      document.getElementById('status').textContent = '🎉 Puzzle solved!';
      isCorrect = true;
      ground.set({ movable: { color: null } });
    }
  } else {
    game.undo();
    document.getElementById('status').textContent = '✗ Wrong move. Try again.';
    document.getElementById('status').style.color = '#f44336';

    const boardEl = document.querySelector('cg-board');
    boardEl.style.transition = 'background 0.3s';
    boardEl.style.background = 'rgba(244, 67, 54, 0.15)';
    setTimeout(() => {
      boardEl.style.background = '';
    }, 500);

    setTimeout(() => {
      document.getElementById('status').style.color = '#eee';
    }, 1500);
  }
}

async function newPuzzle() {
  document.getElementById('status').textContent = 'Loading puzzle...';
  document.getElementById('status').style.color = '#eee';
  document.getElementById('new-puzzle-btn').disabled = true;

  try {
    const difficulty = document.getElementById('difficulty').value;
    const puzzle = await fetchRandomPuzzle(difficulty);

    if (puzzle.error) {
      document.getElementById('status').textContent =
        puzzle.error === 'No puzzles found. Run the downloader first.'
          ? '⚠ No puzzles in database. Run: docker compose run --profile setup downloader'
          : `⚠ ${puzzle.error}`;
      document.getElementById('status').style.color = '#ff9800';
      document.getElementById('new-puzzle-btn').disabled = false;
      return;
    }

    await loadPuzzle(puzzle);
  } catch (err) {
    console.error('Failed to fetch puzzle:', err);
    document.getElementById('status').textContent = `⚠ Failed to load puzzle: ${err.message}`;
    document.getElementById('status').style.color = '#ff9800';
  }

  document.getElementById('new-puzzle-btn').disabled = false;
}

function giveHint() {
  if (!currentPuzzle || isCorrect) return;
  const moves = currentPuzzle.moves.split(' ');
  if (solutionIndex < moves.length) {
    document.getElementById('status').textContent =
      `Hint: Focus on ${currentPuzzle.themes[0] || 'the best move'}`;
    document.getElementById('status').style.color = '#2196f3';
    setTimeout(() => {
      document.getElementById('status').style.color = '#eee';
    }, 2000);
  }
}

async function showAnalysis() {
  if (!currentPuzzle) return;
  const panel = document.getElementById('analysis-panel');
  const output = document.getElementById('engine-output');
  const btn = document.getElementById('analysis-btn');

  if (panel.style.display !== 'none') {
    panel.style.display = 'none';
    btn.textContent = 'Analysis';
    return;
  }

  panel.style.display = 'block';
  output.textContent = 'Loading engine...';
  btn.disabled = true;

  if (!isEngineReady()) {
    await initEngine();
  }

  if (!isEngineReady()) {
    output.textContent =
      'Stockfish wasm not available. Analysis requires a browser reload.';
    btn.disabled = false;
    return;
  }

  const result = await analyzePosition(game.fen(), 14);
  output.textContent = result;
  btn.textContent = 'Analysis';
  btn.disabled = false;
}

document.addEventListener('DOMContentLoaded', async () => {
  initEngine();

  try {
    const health = await checkHealth();
    console.log('API health:', health);
  } catch (err) {
    console.warn('Health check failed:', err);
  }

  document.getElementById('new-puzzle-btn').addEventListener('click', newPuzzle);
  document.getElementById('hint-btn').addEventListener('click', giveHint);
  document.getElementById('analysis-btn').addEventListener('click', showAnalysis);
  document.getElementById('difficulty').addEventListener('change', newPuzzle);

  newPuzzle();
});
