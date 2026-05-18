#!/usr/bin/env python3
"""
Download the first N puzzles from the Lichess database and save as CSV
for quick local testing. Usage:

    python scripts/seed_small.py /tmp/small.csv 1000
"""

import csv
import io
import sys

import pyzstd
import requests

PUZZLE_URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"


def main():
    output = sys.argv[1] if len(sys.argv) > 1 else "/tmp/puzzles_1000.csv"
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 1000

    print(f"Downloading head of {PUZZLE_URL} ...")
    resp = requests.get(PUZZLE_URL, stream=True)
    resp.raise_for_status()

    dctx = pyzstd.ZstdDecompressor()
    reader = dctx.stream_reader(resp.raw)
    text_reader = io.TextIOWrapper(reader, encoding="utf-8")
    csv_reader = csv.reader(text_reader)

    with open(output, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for i, row in enumerate(csv_reader):
            if i > count:
                break
            writer.writerow(row)
            if i > 0 and i % 200 == 0:
                print(f"  {i} rows ...")

    print(f"Saved {count} puzzles (plus header) to {output}")


if __name__ == "__main__":
    main()
