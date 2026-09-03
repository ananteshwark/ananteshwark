from app.services.text_search import make_snippet


class TestMakeSnippet:
    def test_match_in_middle(self):
        text = "a" * 200 + " CONFIDENTIAL termination clause " + "b" * 200
        s = make_snippet(text, "termination")
        assert "termination" in s
        assert s.startswith("…") and s.endswith("…")

    def test_match_at_start(self):
        s = make_snippet("Termination for convenience is allowed", "termination", radius=10)
        assert s.startswith("Termination")  # no leading ellipsis
        assert not s.startswith("…")

    def test_case_insensitive(self):
        assert make_snippet("The VENDOR shall indemnify", "vendor") is not None

    def test_no_match(self):
        assert make_snippet("hello world", "absent") is None

    def test_empty_inputs(self):
        assert make_snippet(None, "x") is None
        assert make_snippet("text", None) is None
        assert make_snippet("", "x") is None
