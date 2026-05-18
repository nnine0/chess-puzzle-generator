import datetime
import random

from fastapi import APIRouter, HTTPException, Query

from ..chroma_client import (
    build_where,
    get_puzzle_collection,
    parse_opening_tags,
    parse_themes,
)
from ..models import Puzzle, PuzzleListResponse

router = APIRouter(prefix="/puzzles", tags=["puzzles"])


def _puzzle_from_metadata(doc_id: str, meta: dict) -> Puzzle:
    return Puzzle(
        id=doc_id,
        fen=meta.get("fen", ""),
        moves=meta.get("moves", ""),
        first_move=meta.get("first_move", ""),
        rating=meta.get("rating", 1500),
        themes=parse_themes(meta.get("themes")),
        popularity=meta.get("popularity", 0),
        nb_plays=meta.get("nb_plays", 0),
        opening_tags=parse_opening_tags(meta.get("opening_tags")),
    )


def _metadata_results_to_puzzles(ids: list[str], metadatas: list[dict]) -> list[Puzzle]:
    return [_puzzle_from_metadata(ids[i], metadatas[i]) for i in range(len(ids))]


@router.get("")
async def list_puzzles(
    rating_min: int = Query(None, ge=0),
    rating_max: int = Query(None, le=4000),
    theme: str = Query(None),
    difficulty: str = Query(None),
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    coll = get_puzzle_collection()
    where = build_where(rating_min, rating_max, theme, difficulty)
    results = coll.get(limit=limit, offset=offset, where=where)
    puzzles = _metadata_results_to_puzzles(results["ids"], results["metadatas"])
    return PuzzleListResponse(puzzles=puzzles)


@router.get("/random")
async def random_puzzle(
    rating_min: int = Query(None, ge=0),
    rating_max: int = Query(None, le=4000),
    theme: str = Query(None),
    difficulty: str = Query(None),
):
    coll = get_puzzle_collection()
    where = build_where(rating_min, rating_max, theme, difficulty)

    if where:
        results = coll.query(
            query_texts=["chess puzzle"],
            n_results=50,
            where=where,
        )
        ids = results["ids"][0]
        if not ids:
            raise HTTPException(status_code=404, detail="No puzzles found for these criteria")
        idx = random.choice(range(len(ids)))
        return _puzzle_from_metadata(ids[idx], results["metadatas"][0][idx])

    total = coll.count()
    if total == 0:
        raise HTTPException(status_code=404, detail="No puzzles found. Run the downloader first.")
    offset = random.randint(0, total - 1)
    results = coll.get(limit=1, offset=offset)
    if results["ids"]:
        return _puzzle_from_metadata(results["ids"][0], results["metadatas"][0])
    raise HTTPException(status_code=404, detail="No puzzles found")


@router.get("/daily")
async def daily_puzzle():
    coll = get_puzzle_collection()
    total = coll.count()
    if total == 0:
        raise HTTPException(status_code=404, detail="No puzzles found")
    day_of_year = datetime.date.today().timetuple().tm_yday
    results = coll.get(limit=1, offset=day_of_year % total)
    if results["ids"]:
        return _puzzle_from_metadata(results["ids"][0], results["metadatas"][0])
    raise HTTPException(status_code=404, detail="No puzzles found")


@router.get("/{puzzle_id}")
async def get_puzzle(puzzle_id: str):
    coll = get_puzzle_collection()
    results = coll.get(ids=[puzzle_id])
    if results["ids"]:
        return _puzzle_from_metadata(results["ids"][0], results["metadatas"][0])
    raise HTTPException(status_code=404, detail="Puzzle not found")
