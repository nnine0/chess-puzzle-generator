from app.chroma_client import build_where, parse_opening_tags, parse_themes


class TestParseThemes:
    def test_empty_string(self):
        assert parse_themes("") == []

    def test_single_theme(self):
        assert parse_themes("fork") == ["fork"]

    def test_multiple_themes(self):
        assert parse_themes("fork pin sacrifice") == ["fork", "pin", "sacrifice"]

    def test_none_value(self):
        assert parse_themes(None) == []

    def test_non_string_value(self):
        assert parse_themes(42) == []

    def test_extra_spaces(self):
        assert parse_themes("  fork   pin  ") == ["fork", "pin"]


class TestParseOpeningTags:
    def test_empty_string(self):
        assert parse_opening_tags("") == []

    def test_single_tag(self):
        assert parse_opening_tags("Italian Game") == ["Italian Game"]

    def test_multiple_tags(self):
        result = parse_opening_tags("Italian Game, Two Knights Defense")
        assert result == ["Italian Game", "Two Knights Defense"]

    def test_none_value(self):
        assert parse_opening_tags(None) == []

    def test_trailing_comma(self):
        assert parse_opening_tags("Italian Game,") == ["Italian Game"]


class TestBuildWhere:
    def test_no_filters(self):
        assert build_where() is None

    def test_rating_min_only(self):
        result = build_where(rating_min=1000)
        assert result == {"rating": {"$gte": 1000}}

    def test_rating_max_only(self):
        result = build_where(rating_max=2000)
        assert result == {"rating": {"$lte": 2000}}

    def test_rating_range(self):
        result = build_where(rating_min=1000, rating_max=2000)
        assert result == {"$and": [{"rating": {"$gte": 1000}}, {"rating": {"$lte": 2000}}]}

    def test_theme_only(self):
        result = build_where(theme="fork")
        assert result == {"themes": {"$contains": "fork"}}

    def test_difficulty_sets_rating_range(self):
        result = build_where(difficulty="easy")
        assert result == {"$and": [{"rating": {"$gte": 800}}, {"rating": {"$lte": 1200}}]}

    def test_difficulty_beginner(self):
        result = build_where(difficulty="beginner")
        assert result == {"$and": [{"rating": {"$gte": 0}}, {"rating": {"$lte": 800}}]}

    def test_difficulty_master(self):
        result = build_where(difficulty="master")
        assert result == {"$and": [{"rating": {"$gte": 2200}}, {"rating": {"$lte": 4000}}]}

    def test_difficulty_unknown_falls_through(self):
        result = build_where(difficulty="unknown")
        assert result is None

    def test_difficulty_with_theme(self):
        result = build_where(difficulty="medium", theme="sacrifice")
        assert result == {
            "$and": [
                {"rating": {"$gte": 1200}},
                {"rating": {"$lte": 1800}},
                {"themes": {"$contains": "sacrifice"}},
            ]
        }

    def test_difficulty_overrides_explicit_rating(self):
        result = build_where(rating_min=500, rating_max=3000, difficulty="hard")
        assert result == {"$and": [{"rating": {"$gte": 1800}}, {"rating": {"$lte": 2200}}]}
