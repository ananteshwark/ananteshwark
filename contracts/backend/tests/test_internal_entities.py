"""Internal-entity master: canonicalization of the signing entity + CRUD."""
import uuid


class TestCanonicalization:
    def _db(self):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from app.database import Base
        eng = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(eng)
        return sessionmaker(bind=eng)()

    def test_alias_and_variant_snap_to_canonical(self):
        from app import models
        from app.services.internal_entities import canonicalize_signing_entity, match_canonical
        db = self._db()
        db.add(models.InternalEntity(name="Inventurus Knowledge Solutions",
                                     aliases=["IKS", "Inventurus"]))
        db.commit()
        # exact alias
        assert match_canonical(db, "IKS") == "Inventurus Knowledge Solutions"
        # legal-name variant with suffix
        assert match_canonical(db, "Inventurus Knowledge Sol Pvt Ltd") == "Inventurus Knowledge Solutions"
        # unrelated vendor is not matched
        assert match_canonical(db, "Briks Solutions") is None

        data, changed = canonicalize_signing_entity(db, {"signing_entity": "IKS"})
        assert changed and data["signing_entity"] == "Inventurus Knowledge Solutions"
        # already canonical -> no change
        _d, c2 = canonicalize_signing_entity(db, {"signing_entity": "Inventurus Knowledge Solutions"})
        assert c2 is False

    def test_short_alias_does_not_false_match_substring(self):
        # "IKS" must not match "Briks" via substring — token-based matching only.
        from app import models
        from app.services.internal_entities import match_canonical
        db = self._db()
        db.add(models.InternalEntity(name="IKS Health", aliases=["IKS"]))
        db.commit()
        assert match_canonical(db, "Briks Logistics") is None

    def test_legacy_setting_entities_still_recognized(self):
        from app.services.internal_entities import match_canonical
        db = self._db()  # empty table
        assert match_canonical(db, "TruBridge Inc.", legacy_raw="TruBridge, Arai") == "TruBridge"


class TestApi:
    def test_crud_and_extraction_uses_master(self, client, admin_headers, monkeypatch):
        name = f"Acme Global {uuid.uuid4().hex[:5]}"
        e = client.post("/api/internal-entities", headers=admin_headers,
                        json={"name": name, "aliases": ["AG", "Acme Global Pvt Ltd"]})
        assert e.status_code == 200, e.text
        eid = e.json()["id"]
        assert client.get("/api/internal-entities", headers=admin_headers).status_code == 200
        # duplicate name rejected
        assert client.post("/api/internal-entities", headers=admin_headers,
                           json={"name": name}).status_code == 400
        # update aliases
        client.put(f"/api/internal-entities/{eid}", headers=admin_headers,
                   json={"name": name, "aliases": ["AG"]})
        # delete
        assert client.delete(f"/api/internal-entities/{eid}", headers=admin_headers).status_code == 200

    def test_prompt_guidance_includes_aliases(self, client, admin_headers):
        from app.database import SessionLocal
        from app.services.internal_entities import prompt_guidance
        name = f"Zephyr {uuid.uuid4().hex[:5]}"
        client.post("/api/internal-entities", headers=admin_headers,
                    json={"name": name, "aliases": ["ZPH"]})
        db = SessionLocal()
        text = prompt_guidance(db)
        db.close()
        assert name in text and "ZPH" in text and "also written as" in text
