from collections.abc import Callable
from typing import Any

import chromadb
from chromadb import errors as chroma_errors
from chromadb.api import ClientAPI
from chromadb.config import Settings as ChromaSettings

from .config import settings

_client: ClientAPI | None = None

PUZZLE_DIFFICULTY_MAP: list[tuple[str, int, int, list[str]]] = [
    ("beginner", 0, 800, ["mateIn1", "mateIn2"]),
    ("easy", 800, 1200, ["mateIn3", "fork", "pin"]),
    ("medium", 1200, 1800, ["skewer", "discoveredAttack", "sacrifice"]),
    ("hard", 1800, 2200, ["zugzwang", "smotheredMate", "endgame"]),
    ("master", 2200, 4000, []),
]


def get_chroma_client() -> ClientAPI:
    global _client
    if _client is None:
        _client = chromadb.HttpClient(
            host=settings.chroma_host,
            port=settings.chroma_port,
            settings=ChromaSettings(allow_reset=True, anonymized_telemetry=False),
        )
    return _client


def reset_chroma_client() -> None:
    global _client
    _client = None


def get_puzzle_collection(client: ClientAPI | None = None) -> Any:
    c = client or get_chroma_client()
    try:
        return c.get_collection("puzzles")
    except chroma_errors.NotFoundError:
        return c.create_collection(
            name="puzzles",
            metadata={"hnsw:space": "cosine"},
        )


def parse_themes(themes_raw: Any) -> list[str]:
    if isinstance(themes_raw, str):
        return [t for t in themes_raw.split() if t]
    return []


def parse_opening_tags(opening_raw: Any) -> list[str]:
    if isinstance(opening_raw, str):
        return [t.strip() for t in opening_raw.split(",") if t.strip()]
    return []


def build_where(
    rating_min: int | None = None,
    rating_max: int | None = None,
    theme: str | None = None,
    difficulty: str | None = None,
) -> dict | None:
    conditions: list[dict] = []
    if difficulty:
        for name, rmin, rmax, _ in PUZZLE_DIFFICULTY_MAP:
            if name == difficulty:
                rating_min = rmin
                rating_max = rmax
                break
    if rating_min is not None:
        conditions.append({"rating": {"$gte": rating_min}})
    if rating_max is not None:
        conditions.append({"rating": {"$lte": rating_max}})
    if theme:
        conditions.append({"themes": {"$contains": theme}})
    if not conditions:
        return None
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


ComputeProvider = Callable[[], ClientAPI]
