# Chess Puzzle Generator

A chess puzzle application using Lichess puzzle data with vector search powered by ChromaDB.

## Architecture

```
chromadb  ────  api (FastAPI)  ────  frontend (nginx + vanilla JS)
   │                                  (port 8002)   (port 8003)       (port 3000)
```

- **chromadb** — Vector database storing ~171K Lichess puzzles with semantic search
- **api** — FastAPI backend serving puzzles, daily puzzle, search, and filtering
- **frontend** — Vanilla JS chessboard with unicode pieces, CSS grid rendering
- **downloader** — One-shot service to download and seed puzzles from Lichess

## Quick Start

```bash
docker compose up --build -d
```

Open http://localhost:3000

## Seeding the Database

If the database is empty, run the downloader:

```bash
docker compose run --profile setup downloader
```

This downloads the full Lichess puzzle database (~28M entries, ~80MB compressed).

For a small test sample:

```bash
pip install requests pyzstd
python scripts/seed_small.py /tmp/puzzles_1000.csv 1000
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Health check with puzzle count |
| `GET /puzzles` | List puzzles (supports `rating_min`, `rating_max`, `theme`, `difficulty`, `limit`, `offset`) |
| `GET /puzzles/random` | Random puzzle with optional filters |
| `GET /puzzles/daily` | Deterministic daily puzzle |
| `GET /puzzles/{id}` | Get puzzle by ID |
| `GET /search?q=...` | Semantic search across puzzles |

## Testing

```bash
cd api
pip install -r requirements-dev.txt
pytest tests/ -v
```

## Running Locally (without Docker)

```bash
# API
cd api && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (dev mode)
cd frontend && npm install && npm run dev
```

## Color Schemes

The frontend includes 5 board color schemes selectable from a dropdown:
- Classic, High Contrast, Blue, Forest, Midnight

## Tech Stack

- **Backend**: Python, FastAPI, ChromaDB, Uvicorn
- **Frontend**: Vite, chess.js, plain CSS Grid
- **Infra**: Docker Compose, nginx
