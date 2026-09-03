"""R5 3.6: Indian (lakh/crore) numbering words, selected by currency."""
from app.services.authoring import number_to_words, recompute_fields


def test_indian_lakh_crore():
    assert number_to_words(1250000, indian=True) == "twelve lakh fifty thousand"
    assert number_to_words(10000000, indian=True) == "one crore"
    assert number_to_words(123456789, indian=True) == \
        "twelve crore thirty-four lakh fifty-six thousand seven hundred eighty-nine"


def test_international_still_available():
    assert number_to_words(1250000, indian=False) == "one million two hundred fifty thousand"


def test_recompute_uses_currency():
    f = {"contract_value": 1500000, "currency": "INR"}
    recompute_fields(f)
    assert f["contract_value_in_words"] == "fifteen lakh"

    f2 = {"contract_value": 1500000, "currency": "USD"}
    recompute_fields(f2)
    assert "million" in f2["contract_value_in_words"]


def test_paise_fraction():
    assert number_to_words(105.5, indian=True) == "one hundred five and 50/100"
