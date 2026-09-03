"""segment_text must cap every block, for any input — not just for fixtures.

The cap exists because anything derived from an oversized block describes the
wrong thing: a risk flag whose span covers every page, a "clause" learned into
the library that is really the whole contract. That failure already shipped
once, when a document with no blank lines came back as a single block.

The existing tests assert the cap for three fixed inputs. It did not hold in
general. Three realistic shapes broke it, each producing exactly one block as
long as the input:

    OCR of a table (no "." or ";" anywhere)   3,199 chars -> 1 block of 3,199
    one long sentence (ordinary in drafting)  3,625 chars -> 1 block of 3,625
    a comma-only run                          4,988 chars -> 1 block of 4,988

_split_long broke on sentence ends, which assumes sentence ends exist. The
generator below is seeded rather than random so a failure is reproducible, and
deliberately mixes in the pathological shapes rather than only well-formed
contract prose — well-formed prose is what already worked.
"""
import random
import re
import string

import pytest

from app.services.clauses import _MAX_BLOCK_CHARS, _MIN_BLOCK_CHARS, segment_text

WORDS = ("agreement vendor company shall party liability indemnify terminate "
         "confidential payment notice arbitration renewal service").split()


def _prose(rng, n):
    return " ".join(rng.choice(WORDS) for _ in range(n))


def _generate(rng):
    """One document of a randomly chosen shape."""
    shape = rng.choice([
        "numbered", "blank_lines", "no_terminators", "one_long_sentence",
        "commas_only", "single_token", "ocr_lines", "mixed",
    ])
    if shape == "numbered":
        return "\n".join(f"{i}. {_prose(rng, rng.randint(5, 120))}." for i in range(1, 12))
    if shape == "blank_lines":
        return "\n\n".join(_prose(rng, rng.randint(5, 200)) + "." for _ in range(6))
    if shape == "no_terminators":
        return _prose(rng, rng.randint(200, 900))
    if shape == "one_long_sentence":
        return _prose(rng, rng.randint(300, 800)) + "."
    if shape == "commas_only":
        return ", ".join(_prose(rng, rng.randint(3, 8)) for _ in range(rng.randint(80, 300)))
    if shape == "single_token":
        # No whitespace at all — not language, but OCR produces it.
        return "".join(rng.choice(string.ascii_letters) for _ in range(rng.randint(1500, 6000)))
    if shape == "ocr_lines":
        return "\n".join(_prose(rng, rng.randint(4, 14)) for _ in range(rng.randint(60, 300)))
    return "\n\n".join([
        "\n".join(f"{i}. {_prose(rng, rng.randint(5, 90))}." for i in range(1, 5)),
        _prose(rng, rng.randint(200, 600)),
        ", ".join(_prose(rng, 6) for _ in range(120)),
    ])


@pytest.mark.parametrize("seed", range(60))
def test_no_block_ever_exceeds_the_cap(seed):
    rng = random.Random(seed)
    text = _generate(rng)
    blocks = segment_text(text)
    worst = max((len(b) for b in blocks), default=0)
    assert worst <= _MAX_BLOCK_CHARS, (
        f"seed {seed}: longest block is {worst} chars (cap {_MAX_BLOCK_CHARS}) "
        f"from a {len(text)}-char input producing {len(blocks)} block(s)")


@pytest.mark.parametrize("text,label", [
    (" ".join(f"ITEM{i:03d}" for i in range(400)), "OCR of a table, no terminators"),
    ("The parties agree " + "and further agree " * 200 + "hereto.", "one long sentence"),
    (", ".join(f"clause part {i}" for i in range(300)), "comma-only run"),
    ("x" * 5000, "no whitespace at all"),
])
def test_the_shapes_that_broke_the_cap(text, label):
    """Named regressions, so a failure says which shape came back."""
    blocks = segment_text(text)
    worst = max((len(b) for b in blocks), default=0)
    assert worst <= _MAX_BLOCK_CHARS, f"{label}: longest block {worst}"
    assert len(blocks) > 1, f"{label}: still one block of {worst}"


class TestSegmentationStillBehaves:
    """Capping must not come at the cost of what segmentation is for."""

    def test_content_is_preserved(self):
        """Hard-wrapping may drop the whitespace it breaks on, but no word may
        vanish — a lost word is a clause that cannot be found again in the
        document it came from."""
        text = ", ".join(f"clause part {i}" for i in range(300))
        joined = " ".join(segment_text(text))
        assert re.findall(r"\w+", joined) == re.findall(r"\w+", text)

    def test_numbered_clauses_still_split_one_per_number(self):
        text = "\n".join(f"{i}. The vendor shall do thing number {i} at all times." for i in range(1, 9))
        blocks = segment_text(text)
        assert len(blocks) >= 8, blocks

    def test_short_fragments_are_still_dropped(self):
        assert segment_text("Too short.") == []

    def test_empty_input(self):
        assert segment_text("") == []
        assert segment_text("   \n\n  ") == []

    def test_blocks_respect_the_minimum(self):
        text = ", ".join(f"clause part {i}" for i in range(300))
        assert all(len(b) >= _MIN_BLOCK_CHARS for b in segment_text(text))
