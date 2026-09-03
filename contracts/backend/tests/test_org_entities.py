from app.services.org_entities import apply_org_entity_guard, matches_org_entity, parse_entities

ORG = "Inventurus, TruBridge, Arai, WWMG, Western Washington"
ENTITIES = parse_entities(ORG)


class TestMatchesOrgEntity:
    def test_exact(self):
        assert matches_org_entity("Inventurus", ENTITIES)

    def test_variant_with_suffix(self):
        assert matches_org_entity("Inventurus Knowledge Solutions Pvt Ltd", ENTITIES)
        assert matches_org_entity("TruBridge Inc.", ENTITIES)

    def test_non_org_vendor(self):
        assert not matches_org_entity("Acme Technologies", ENTITIES)

    def test_empty(self):
        assert not matches_org_entity(None, ENTITIES)
        assert not matches_org_entity("", ENTITIES)


class TestApplyOrgEntityGuard:
    def test_swaps_when_vendor_is_org(self):
        data = {
            "vendor": "Inventurus Knowledge Solutions",
            "signing_entity": "Acme Technologies",
            "vendor_signing_authority": "J. Org",
            "iks_signing_authority": "A. Acme",
        }
        out, corrected = apply_org_entity_guard(data, ORG)
        assert corrected
        assert out["signing_entity"] == "Inventurus Knowledge Solutions"
        assert out["vendor"] == "Acme Technologies"
        # authorities swapped to stay aligned with their parties
        assert out["iks_signing_authority"] == "J. Org"
        assert out["vendor_signing_authority"] == "A. Acme"

    def test_no_swap_when_signing_entity_is_org(self):
        data = {"vendor": "Acme Technologies", "signing_entity": "TruBridge"}
        out, corrected = apply_org_entity_guard(data, ORG)
        assert not corrected
        assert out["vendor"] == "Acme Technologies"

    def test_no_swap_when_both_org(self):
        data = {"vendor": "Inventurus", "signing_entity": "TruBridge"}
        _out, corrected = apply_org_entity_guard(data, ORG)
        assert not corrected

    def test_no_swap_when_neither_org(self):
        data = {"vendor": "Acme", "signing_entity": "Zenith"}
        _out, corrected = apply_org_entity_guard(data, ORG)
        assert not corrected

    def test_no_entities_configured_is_noop(self):
        data = {"vendor": "Inventurus", "signing_entity": "Acme"}
        out, corrected = apply_org_entity_guard(data, "")
        assert not corrected and out is data
