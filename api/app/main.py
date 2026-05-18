from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .chroma_client import get_puzzle_collection, reset_chroma_client
from .routers import puzzles, search


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    yield
    reset_chroma_client()


app = FastAPI(title="Chess Puzzle Generator API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(puzzles.router)
app.include_router(search.router)


@app.get("/health")
async def health():
    try:
        coll = get_puzzle_collection()
        count = coll.count()
        return {"status": "ok", "puzzle_count": count}
    except Exception as e:
        return {"status": "error", "detail": str(e)}
