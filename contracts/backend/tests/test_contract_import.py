from datetime import date

from app.services.contract_import import map_row, normalize_header, parse_rows, parse_value


class TestNormalizeHeader:
    def test_variants(self):
        assert normalize_header(" Signing  Entity ") == "signing entity"
        assert normalize_header("PO_Number") == "po number"


class TestParseValue:
    def test_plain(self):
        assert parse_value("50000") == (50000.0, None)

    def test_indian_grouping_and_currency(self):
        assert parse_value("INR 1,25,000") == (125000.0, None)
        assert parse_value("₹ 1200.50") == (1200.5, None)

    def test_blank(self):
        assert parse_value("") == (None, None)
        assert parse_value(None) == (None, None)

    def test_invalid(self):
        v, err = parse_value("N/A")
        assert v is None and err


class TestParseRows:
    def test_csv(self):
        csv = (
            "Sr No,Signing Entity,Vendor,Start Date,End Date,Department,Contract Service,Contract Value\n"
            "1,TruBridge,Acme Ltd,01/01/2025,31/12/2025,IT,Support,50000\n"
            ",,,,,,,\n"  # blank row skipped
            "2,TruBridge,Zenith,2025-02-01,2026-01-31,Finance,Audit,\n"
        )
        rows = parse_rows(csv.encode(), "register.csv")
        assert len(rows) == 2
        assert rows[0]["_row"] == 2
        assert rows[0]["vendor"] == "Acme Ltd"
        assert rows[0]["department"] == "IT"
        assert rows[1]["vendor"] == "Zenith"

    def test_unknown_headers_raise(self):
        try:
            parse_rows("Foo,Bar\n1,2\n".encode(), "x.csv")
            assert False, "expected ValueError"
        except ValueError:
            pass

    def test_unsupported_type(self):
        try:
            parse_rows(b"x", "file.txt")
            assert False
        except ValueError:
            pass


class TestMapRow:
    def test_maps_and_coerces(self):
        fields, errors = map_row({
            "_row": 2, "signing_entity": "TruBridge", "vendor": "Acme Ltd",
            "start_date": "01/01/2025", "end_date": "2025-12-31",
            "department": "IT", "contract_service": "Support", "contract_value": "1,25,000",
        })
        assert not errors
        assert fields["start_date"] == date(2025, 1, 1)
        assert fields["end_date"] == date(2025, 12, 31)
        assert fields["contract_value"] == 125000.0
        assert fields["vendor"] == "Acme Ltd"

    def test_bad_date_reported(self):
        _fields, errors = map_row({"_row": 3, "start_date": "not-a-date"})
        assert any("start date" in e for e in errors)

    def test_bad_value_reported(self):
        _fields, errors = map_row({"_row": 4, "contract_value": "lots"})
        assert any("contract value" in e for e in errors)
