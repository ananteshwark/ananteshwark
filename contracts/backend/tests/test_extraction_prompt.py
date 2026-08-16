from app.services.claude_extractor import build_extraction_prompt

ORG = "Inventurus, TruBridge, Arai, WWMG, Western Washington"


class TestBuildExtractionPrompt:
    def test_fills_placeholder_in_template(self):
        template = "Known org: {organization_entities}\n<doc>{document_text}</doc>"
        out = build_extraction_prompt(template, "CONTRACT BODY", ORG)
        assert "Known org: Inventurus, TruBridge, Arai, WWMG, Western Washington" in out
        assert "CONTRACT BODY" in out
        assert "{organization_entities}" not in out
        assert "{document_text}" not in out

    def test_prepends_instruction_when_template_lacks_placeholder(self):
        # Older prompt versions without the placeholder still get the guidance
        template = "Extract fields.\n<doc>{document_text}</doc>"
        out = build_extraction_prompt(template, "BODY", ORG)
        assert "signing_entity" in out
        assert "TruBridge" in out
        assert "NEVER" in out  # must-not-be-vendor guidance
        assert out.index("TruBridge") < out.index("Extract fields.")  # prepended

    def test_no_org_configured_leaves_legacy_template_unchanged(self):
        template = "Extract fields.\n<doc>{document_text}</doc>"
        out = build_extraction_prompt(template, "BODY", "")
        assert out == "Extract fields.\n<doc>BODY</doc>"

    def test_placeholder_with_empty_org_shows_none(self):
        template = "Org: {organization_entities}\n{document_text}"
        out = build_extraction_prompt(template, "BODY", "   ")
        assert "(none configured)" in out

    def test_document_text_is_truncated(self):
        # No org list -> no prepended instruction, so output is just the truncated body
        template = "{document_text}"
        out = build_extraction_prompt(template, "x" * 500_000, "")
        assert len(out) == 400_000

    def test_document_text_truncated_even_with_org_prefix(self):
        template = "{document_text}"
        out = build_extraction_prompt(template, "x" * 500_000, ORG)
        # The document body is truncated to exactly 400k chars (prefix prose may
        # itself contain letters, so assert on the contiguous body run).
        assert "x" * 400_000 in out
        assert "x" * 400_001 not in out
