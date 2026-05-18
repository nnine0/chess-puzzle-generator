let engine = null;
let engineReady = false;

export async function initEngine() {
  if (engine) return;
  try {
    const { default: Stockfish } = await import('stockfish.wasm');
    engine = await Stockfish();
    engine.addMessageListener((msg) => {
      if (msg === 'uciok') engineReady = true;
    });
    engine.postMessage('uci');
    engine.postMessage('isready');
  } catch (err) {
    console.warn('Stockfish wasm not available:', err.message);
    engine = null;
  }
}

export function isEngineReady() {
  return engineReady;
}

export function analyzePosition(fen, depth = 14) {
  return new Promise((resolve) => {
    if (!engine) {
      resolve('Engine not loaded. Stockfish.wasm may be unavailable.');
      return;
    }

    let output = [];

    engine.addMessageListener(function handler(msg) {
      output.push(msg);
      if (msg.startsWith('bestmove')) {
        engine.addMessageListener(handler);
        resolve(output.join('\n'));
      }
    });

    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(`go depth ${depth}`);

    setTimeout(() => {
      resolve(output.join('\n') || 'Analysis timed out');
    }, 30000);
  });
}

export function getHint(fen, depth = 8) {
  return new Promise((resolve) => {
    if (!engine) {
      resolve(null);
      return;
    }

    let bestMove = null;

    engine.addMessageListener(function handler(msg) {
      if (msg.startsWith('bestmove')) {
        const parts = msg.split(' ');
        bestMove = parts.length > 1 ? parts[1] : null;
        engine.addMessageListener(handler);
        resolve(bestMove);
      }
    });

    engine.postMessage(`position fen ${fen}`);
    engine.postMessage(`go depth ${depth}`);

    setTimeout(() => resolve(null), 10000);
  });
}
