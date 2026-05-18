import csv
import io
import logging
import sys
import tempfile

import pyzstd
import requests
from chromadb import HttpClient, errors as chroma_errors
from chromadb.config import Settings as ChromaSettings

from .config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

PUZZLE_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
BATCH_SIZE = 1000


def get_chroma() -> HttpClient:
    return HttpClient(
        host=settings.chroma_host,
        port=settings.chroma_port,
        settings=ChromaSettings(allow_reset=True, anonymized_telemetry=False),
    )


def build_embedding_text(row: dict) -> str:
    themes = row.get("Themes", "")
    rating = row.get("Rating", "1500")
    opening = row.get("OpeningTags", "")
    return f"{themes} puzzle rating {rating}: {opening}"


def ensure_collection(client):
    try:
        coll = client.get_collection("puzzles")
        log.info("Found existing collection 'puzzles'")
        return coll
    except chroma_errors.NotFoundError:
        coll = client.create_collection(
            name="puzzles",
            metadata={"hnsw:space": "cosine"},
        )
        log.info("Created collection 'puzzles'")
        return coll


def stream_and_process():
    client = get_chroma()
    coll = ensure_collection(client)

    log.info("Downloading %s ...", PUZZLE_URL)
    resp = requests.get(PUZZLE_URL, stream=True)
    resp.raise_for_status()

    dctx = pyzstd.EndlessZstdDecompressor()
    tmp = tempfile.SpooledTemporaryFile(max_size=100 * 1024 * 1024)
    for chunk in resp.iter_content(chunk_size=65536):
        if chunk:
            tmp.write(dctx.decompress(chunk))
    tmp.seek(0)
    text_reader = io.TextIOWrapper(tmp, encoding="utf-8")
    csv_reader = csv.DictReader(text_reader)

    total = 0
    batch_ids: list[str] = []
    batch_metas: list[dict] = []
    batch_docs: list[str] = []

    for row in csv_reader:
        puzzle_id = row.get("PuzzleId", "")
        if not puzzle_id:
            continue

        fen = row.get("FEN", "")
        moves = row.get("Moves", "")
        first_move = moves.split()[0] if moves else ""
        themes = [t.strip() for t in row.get("Themes", "").split() if t.strip()]
        rating = int(row.get("Rating", 1500))
        popularity = int(row.get("Popularity", 0))
        nb_plays = int(row.get("NbPlays", 0))
        opening_tags = [
            t.strip() for t in row.get("OpeningTags", "").split(",") if t.strip()
        ]

        # ChromaDB metadata supports: str, int, float, bool (not lists)
        themes_str = " ".join(themes) if themes else "untagged"
        opening_str = ",".join(opening_tags) if opening_tags else "unknown"

        batch_ids.append(puzzle_id)
        batch_metas.append(
            {
                "fen": fen,
                "moves": moves,
                "first_move": first_move,
                "rating": rating,
                "themes": themes_str,
                "popularity": popularity,
                "nb_plays": nb_plays,
                "opening_tags": opening_str,
            }
        )
        batch_docs.append(build_embedding_text(row))

        if len(batch_ids) >= BATCH_SIZE:
            coll.add(ids=batch_ids, metadatas=batch_metas, documents=batch_docs)
            total += len(batch_ids)
            log.info("Inserted %d puzzles (total: %d)", len(batch_ids), total)
            batch_ids.clear()
            batch_metas.clear()
            batch_docs.clear()

    if batch_ids:
        coll.add(ids=batch_ids, metadatas=batch_metas, documents=batch_docs)
        total += len(batch_ids)
        log.info("Inserted %d puzzles (total: %d)", len(batch_ids), total)

    log.info("Done! Total puzzles inserted: %d", total)


if __name__ == "__main__":
    stream_and_process()
