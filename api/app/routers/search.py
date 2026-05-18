from fastapi import APIRouter, HTTPException, Query

from ..chroma_client import get_puzzle_collection, parse_themes
from ..models import PuzzleSearchResult, SearchResponse

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
async def search_puzzles(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
):
    coll = get_puzzle_collection()
    try:
        results = coll.query(query_texts=[q], n_results=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")

    items = []
    for i, doc_id in enumerate(results["ids"][0]):
        meta = results["metadatas"][0][i]
        dist = results["distances"][0][i] if results.get("distances") else 0.0
        score = round(max(0.0, 1.0 - dist), 4)
        items.append(
            PuzzleSearchResult(
                id=doc_id,
                fen=meta.get("fen", ""),
                first_move=meta.get("first_move", ""),
                rating=meta.get("rating", 1500),
                themes=parse_themes(meta.get("themes")),
                score=score,
            )
        )

    return SearchResponse(results=items)
