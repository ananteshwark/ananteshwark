"""The pgvector column has to be as wide as the configured provider's vectors.

`ALTER TABLE ... ADD COLUMN IF NOT EXISTS embedding_vec vector(N)` fixes the
width at whatever it was first built with, forever. Switch the embedding
provider and the vector length changes but the column does not, so pgvector
rejects every write:

    ERROR:  expected 256 dimensions, not 384

_sync_pgvector catches that in a savepoint and disables the mirror for the rest
of the process, so nothing crashes — the ANN index just quietly stops being
used and search falls back to brute force in Python, which is the exact thing
pgvector was added to avoid at tens of thousands of contracts.

provider_dim is what lets the migration notice. These tests cover it directly;
the migration's rebuild was verified against a real pgvector install (the CI
Postgres image deliberately has no pgvector, because the extension being absent
is the case that once caused a production 500).
"""
import pytest

from app.services.embeddings import DIM, provider_dim
from app.services.settings_store import set_setting


@pytest.fixture
def db(client):        # client builds the schema via the app's lifespan
    from app.database import SessionLocal
    s = SessionLocal()
    yield s
    s.rollback()
    s.close()


@pytest.fixture
def restore_provider(db):
    yield
    set_setting(db, "embedding_provider", "concept")
    set_setting(db, "embedding_model", "all-MiniLM-L6-v2")
    db.commit()


class TestProviderDim:
    def test_concept_and_hashing_share_the_declared_width(self, db, restore_provider):
        """Both in-process providers emit DIM, which is why an existing column
        survives switching between them."""
        for provider in ("concept", "hashing"):
            set_setting(db, "embedding_provider", provider)
            db.flush()
            assert provider_dim(db) == DIM

    def test_it_matches_what_the_provider_actually_emits(self, db, restore_provider):
        """The number the migration builds the column from must be the number of
        floats that will be handed to it — asserted against a real embed rather
        than against the constant, so a change to either side is caught."""
        from app.services.embeddings import embed
        set_setting(db, "embedding_provider", "concept")
        db.flush()
        assert provider_dim(db) == len(embed("any dispute between the parties", db))

    def test_sentence_transformers_resolves_from_the_model_name(self, db, restore_provider):
        set_setting(db, "embedding_provider", "sentence_transformers")
        set_setting(db, "embedding_model", "all-MiniLM-L6-v2")
        db.flush()
        assert provider_dim(db) == 384

        set_setting(db, "embedding_model", "all-mpnet-base-v2")
        db.flush()
        assert provider_dim(db) == 768

    def test_a_model_path_prefix_is_ignored(self, db, restore_provider):
        """Offline installs point the setting at a local directory."""
        set_setting(db, "embedding_provider", "sentence_transformers")
        set_setting(db, "embedding_model", "/opt/models/all-MiniLM-L6-v2")
        db.flush()
        assert provider_dim(db) == 384

    def test_an_unknown_model_yields_none_rather_than_a_guess(self, db, restore_provider):
        """None means "leave the column alone". Rebuilding it to a guessed width
        would drop the stored vectors and still reject every write — strictly
        worse than the mismatch the runtime already detects and routes around."""
        set_setting(db, "embedding_provider", "sentence_transformers")
        set_setting(db, "embedding_model", "some-model-nobody-has-heard-of")
        db.flush()
        assert provider_dim(db) is None

    def test_no_session_falls_back_to_the_default_provider(self):
        assert provider_dim(None) == DIM
