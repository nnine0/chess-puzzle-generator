class TestHealth:
    def test_health_ok(self, client_with_data):
        resp = client_with_data.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["puzzle_count"] == 2

    def test_health_empty(self, client_empty):
        resp = client_empty.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["puzzle_count"] == 0


class TestListPuzzles:
    def test_list_all(self, client_with_data):
        resp = client_with_data.get("/puzzles")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["puzzles"]) == 2

    def test_list_with_limit(self, client_with_data):
        resp = client_with_data.get("/puzzles?limit=1")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["puzzles"]) == 1

    def test_list_with_offset(self, client_with_data):
        resp = client_with_data.get("/puzzles?offset=1")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["puzzles"]) == 1
        assert data["puzzles"][0]["id"] == "puzzle-002"

    def test_list_with_rating_min(self, client_with_data):
        resp = client_with_data.get("/puzzles?rating_min=1000")
        assert resp.status_code == 200
        data = resp.json()
        assert all(p["rating"] >= 1000 for p in data["puzzles"])

    def test_list_with_rating_max(self, client_with_data):
        resp = client_with_data.get("/puzzles?rating_max=1000")
        assert resp.status_code == 200
        data = resp.json()
        assert all(p["rating"] <= 1000 for p in data["puzzles"])

    def test_list_with_theme(self, client_with_data):
        resp = client_with_data.get("/puzzles?theme=fork")
        assert resp.status_code == 200
        data = resp.json()
        assert all("fork" in p["themes"] for p in data["puzzles"])

    def test_list_with_difficulty(self, client_with_data):
        resp = client_with_data.get("/puzzles?difficulty=easy")
        assert resp.status_code == 200
        data = resp.json()
        assert all(800 <= p["rating"] <= 1200 for p in data["puzzles"])

    def test_list_empty_no_puzzles(self, client_empty):
        resp = client_empty.get("/puzzles")
        assert resp.status_code == 200
        data = resp.json()
        assert data["puzzles"] == []

    def test_list_invalid_limit(self, client_with_data):
        resp = client_with_data.get("/puzzles?limit=200")
        assert resp.status_code == 422

    def test_list_invalid_rating_min(self, client_with_data):
        resp = client_with_data.get("/puzzles?rating_min=-1")
        assert resp.status_code == 422


class TestRandomPuzzle:
    def test_random_with_filters(self, client_with_data):
        resp = client_with_data.get("/puzzles/random?rating_min=1000")
        assert resp.status_code == 200
        data = resp.json()
        assert data["rating"] >= 1000

    def test_random_no_matches(self, client_with_data):
        resp = client_with_data.get("/puzzles/random?rating_min=9999")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "No puzzles found for these criteria"

    def test_random_empty_db(self, client_empty):
        resp = client_empty.get("/puzzles/random")
        assert resp.status_code == 404
        assert "downloader" in resp.json()["detail"]

    def test_puzzle_shape(self, client_with_data):
        resp = client_with_data.get("/puzzles/random")
        assert resp.status_code == 200
        data = resp.json()
        expected_keys = {"id", "fen", "moves", "first_move", "rating", "themes", "popularity", "nb_plays", "opening_tags"}
        assert set(data.keys()) == expected_keys


class TestDailyPuzzle:
    def test_daily_returns_puzzle(self, client_with_data):
        resp = client_with_data.get("/puzzles/daily")
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data

    def test_daily_empty_db(self, client_empty):
        resp = client_empty.get("/puzzles/daily")
        assert resp.status_code == 404

    def test_daily_is_deterministic(self, client_with_data):
        resp1 = client_with_data.get("/puzzles/daily")
        resp2 = client_with_data.get("/puzzles/daily")
        assert resp1.json()["id"] == resp2.json()["id"]


class TestGetPuzzleById:
    def test_get_existing(self, client_with_data):
        resp = client_with_data.get("/puzzles/puzzle-001")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "puzzle-001"
        assert data["fen"] == "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"

    def test_get_nonexistent(self, client_with_data):
        resp = client_with_data.get("/puzzles/puzzle-999")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Puzzle not found"


class TestSearch:
    def test_search_finds_results(self, client_with_data):
        resp = client_with_data.get("/search?q=fork")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["results"]) > 0
        assert "score" in data["results"][0]

    def test_search_empty_query_rejected(self, client_with_data):
        resp = client_with_data.get("/search?q=")
        assert resp.status_code == 422

    def test_search_empty_db(self, client_empty):
        resp = client_empty.get("/search?q=fork")
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"] == []

    def test_search_score_is_between_0_and_1(self, client_with_data):
        resp = client_with_data.get("/search?q=fork")
        data = resp.json()
        for r in data["results"]:
            assert 0.0 <= r["score"] <= 1.0

    def test_search_shape(self, client_with_data):
        resp = client_with_data.get("/search?q=puzzle")
        assert resp.status_code == 200
        data = resp.json()
        if data["results"]:
            r = data["results"][0]
            assert {"id", "fen", "first_move", "rating", "themes", "score"} == set(r.keys())
