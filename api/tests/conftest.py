from collections.abc import Generator
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.chroma_client import reset_chroma_client

SAMPLE_PUZZLE = {
    "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
    "moves": "e5d6 c4b5 a7a6 b5c6 d7c6 d2d4",
    "first_move": "e5d6",
    "rating": 1500,
    "themes": "fork pin",
    "popularity": 85,
    "nb_plays": 1200,
    "opening_tags": "Italian Game, Two Knights Defense",
}

SAMPLE_PUZZLE_2 = {
    "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    "moves": "e7e5 d2d4 e5d4",
    "first_move": "e7e5",
    "rating": 900,
    "themes": "mateIn3",
    "popularity": 95,
    "nb_plays": 2000,
    "opening_tags": "King's Pawn",
}


class MockChromaCollection:
    def __init__(self, documents: list[dict] | None = None):
        self._docs = documents or []

    def count(self) -> int:
        return len(self._docs)

    def get(self, limit: int | None = None, offset: int | None = None, where: dict | None = None, ids: list[str] | None = None):
        filtered = self._docs
        if ids:
            filtered = [d for d in filtered if d["id"] in ids]
        if where:
            filtered = self._apply_where(filtered, where)
        start = offset or 0
        end = None if limit is None else start + limit
        page = filtered[start:end]
        return {
            "ids": [d["id"] for d in page],
            "metadatas": [d["metadata"] for d in page],
        }

    def query(self, query_texts: list[str], n_results: int = 10, where: dict | None = None):
        filtered = self._docs
        if where:
            filtered = self._apply_where(filtered, where)
        page = filtered[:n_results]
        return {
            "ids": [[d["id"] for d in page]],
            "metadatas": [[d["metadata"] for d in page]],
            "distances": [[0.15 for _ in page]],
        }

    def _apply_where(self, docs: list[dict], where: dict) -> list[dict]:
        result = []
        for d in docs:
            meta = d["metadata"]
            if self._matches_where(meta, where):
                result.append(d)
        return result

    def _matches_where(self, meta: dict, condition: dict) -> bool:
        if "$and" in condition:
            return all(self._matches_where(meta, c) for c in condition["$and"])
        for key, op_value in condition.items():
            if isinstance(op_value, dict):
                for op, val in op_value.items():
                    if op == "$gte":
                        if not (meta.get(key, 0) >= val):
                            return False
                    elif op == "$lte":
                        if not (meta.get(key, 0) <= val):
                            return False
                    elif op == "$contains":
                        field = meta.get(key, "")
                        if not (isinstance(field, str) and val in field.split()):
                            return False
            else:
                if meta.get(key) != op_value:
                    return False
        return True


@pytest.fixture(autouse=True)
def _reset_chroma() -> Generator[None, None, None]:
    reset_chroma_client()
    yield
    reset_chroma_client()


@pytest.fixture
def mock_collection():
    return MockChromaCollection()


@pytest.fixture
def mock_collection_with_data():
    docs = [
        {"id": "puzzle-001", "metadata": dict(SAMPLE_PUZZLE)},
        {"id": "puzzle-002", "metadata": dict(SAMPLE_PUZZLE_2)},
    ]
    return MockChromaCollection(docs)


@pytest.fixture
def client_with_data(mock_collection_with_data):
    with patch("app.routers.puzzles.get_puzzle_collection", return_value=mock_collection_with_data):
        with patch("app.routers.search.get_puzzle_collection", return_value=mock_collection_with_data):
            with patch("app.main.get_puzzle_collection", return_value=mock_collection_with_data):
                yield TestClient(app)


@pytest.fixture
def client_empty(mock_collection):
    with patch("app.routers.puzzles.get_puzzle_collection", return_value=mock_collection):
        with patch("app.routers.search.get_puzzle_collection", return_value=mock_collection):
            with patch("app.main.get_puzzle_collection", return_value=mock_collection):
                yield TestClient(app)
