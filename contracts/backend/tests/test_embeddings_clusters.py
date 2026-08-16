"""R3 2.1: offline embeddings and clause near-duplicate clustering."""
from app.services import embeddings


def test_cosine_similar_vs_different():
    a = embeddings.embed("The Vendor shall indemnify the Company against all claims.")
    b = embeddings.embed("The Vendor shall indemnify the Company against any and all claims.")
    c = embeddings.embed("Payment is due within Net 30 days of a valid invoice.")
    assert embeddings.cosine(a, b) > embeddings.cosine(a, c)
    assert embeddings.cosine(a, a) > 0.99


def test_cluster_groups_near_duplicates():
    items = [
        (1, "Either party may terminate this Agreement on thirty days written notice."),
        (2, "Either party may terminate this Agreement upon thirty (30) days written notice."),
        (3, "The governing law of this Agreement is the law of India."),
    ]
    groups = embeddings.cluster(items, threshold=0.8)
    # 1 and 2 should land together; 3 separate
    pair = next(g for g in groups if 1 in g)
    assert 2 in pair and 3 not in pair


def _seed_two_versions(ctype):
    """Insert two near-duplicate versions directly (bypassing merge-on-create)."""
    from app.database import SessionLocal
    from app.models import ClauseLibraryEntry, ClauseVersion
    db = SessionLocal()
    entry = ClauseLibraryEntry(clause_type=ctype, title=ctype)
    db.add(entry); db.flush()
    v1 = ClauseVersion(entry_id=entry.id, label="v1",
                       text="Either party may terminate this Agreement on thirty days written notice to the other.")
    v2 = ClauseVersion(entry_id=entry.id, label="v2",
                       text="Either party may terminate this Agreement upon thirty (30) days prior written notice to the other party.")
    db.add_all([v1, v2]); db.commit(); db.close()


def test_clusters_endpoint(client, admin_headers):
    _seed_two_versions("TerminationCL")
    clusters = client.get("/api/clauses/clusters?clause_type=TerminationCL&threshold=0.6",
                          headers=admin_headers).json()
    assert isinstance(clusters, list)
    assert any(len(c["members"]) >= 2 for c in clusters)
