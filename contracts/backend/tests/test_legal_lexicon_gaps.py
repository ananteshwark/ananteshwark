"""Concept coverage for the way people actually ask questions.

Concept-aware retrieval only works if a query emits a concept token. Two very
ordinary questions emitted nothing at all and fell back to lexical matching:

    "how are disputes resolved"      -> []
    "can the agreement be assigned"  -> []

Both are phrased as questions, which is how a search box gets used, while the
lexicon listed citation forms ("dispute resolution", "assignment"). The stem
table closes gaps like this for families where the prefix is unambiguous, but
"assign" is exactly the case its own comment warns about: "assigns all right,
title and interest" is IP ownership, and a stem broad enough to catch
"assigned" would relabel every IP clause in the corpus. So disputes get a stem
and assignment gets a bounded-gap pattern that requires the agreement nearby.

The negative cases below are the point of that split and matter more than the
positive ones — a lexicon that over-matches degrades every search silently.
"""
import pytest

from app.services.legal_lexicon import concepts_in


@pytest.mark.parametrize("query", [
    "how are disputes resolved",                      # the reported gap
    "resolution of disputes between the parties",
    "any dispute arising out of this agreement",
    "what happens if there is a disputed invoice",
    "arbitration seat",                               # control: already worked
])
def test_dispute_questions_emit_the_concept(query):
    assert "dispute_resolution" in concepts_in(query), concepts_in(query)


@pytest.mark.parametrize("query", [
    "can the agreement be assigned",                  # the reported gap
    "is the contract assignable to an affiliate",
    "this agreement may not be assigned without prior written consent",
    "either party may assign this agreement on change of control",
    "assignment of this agreement",                   # control: already worked
])
def test_assignment_questions_emit_the_concept(query):
    assert "assignment" in concepts_in(query), concepts_in(query)


@pytest.mark.parametrize("clause", [
    "vendor assigns all right, title and interest in the deliverables",
    "contractor hereby assigns all moral rights in the work product",
    "the supplier assigns ownership of the background ip to the customer",
])
def test_ip_assignment_is_not_relabelled_as_contract_assignment(clause):
    """The reason "assign" is matched gappily instead of by stem. These clauses
    transfer intellectual property; treating them as assignment-of-agreement
    clauses would pollute every search for either concept."""
    found = concepts_in(clause)
    assert "ip_ownership" in found, found
    assert "assignment" not in found, found
