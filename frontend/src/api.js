export async function fetchRandomPuzzle(difficulty) {
  const url = difficulty
    ? `/api/puzzles/random?difficulty=${encodeURIComponent(difficulty)}`
    : '/api/puzzles/random';
  const res = await fetch(url);
  return res.json();
}

export async function fetchDailyPuzzle() {
  const res = await fetch('/api/puzzles/daily');
  return res.json();
}

export async function fetchSearchPuzzles(query, limit = 10) {
  const res = await fetch(
    `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`
  );
  return res.json();
}

export async function checkHealth() {
  const res = await fetch('/api/health');
  return res.json();
}
