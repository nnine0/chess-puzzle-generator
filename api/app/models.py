from pydantic import BaseModel


class Puzzle(BaseModel):
    id: str
    fen: str
    moves: str
    first_move: str
    rating: int
    themes: list[str]
    popularity: int
    nb_plays: int
    opening_tags: list[str]


class PuzzleListResponse(BaseModel):
    puzzles: list[Puzzle]


class PuzzleSearchResult(BaseModel):
    id: str
    fen: str
    first_move: str
    rating: int
    themes: list[str]
    score: float


class SearchResponse(BaseModel):
    results: list[PuzzleSearchResult]


class ErrorResponse(BaseModel):
    detail: str
