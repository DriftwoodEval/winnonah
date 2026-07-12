from pathlib import Path

from utils.spreadsheets import open_local


class TestOpenLocal:
    def test_reads_utf8_csv(self, tmp_path: Path):
        csv_path = tmp_path / "clients.csv"
        csv_path.write_text("CLIENT_ID,FIRSTNAME\n1,José\n", encoding="utf-8")

        df = open_local(csv_path)

        assert list(df.columns) == ["CLIENT_ID", "FIRSTNAME"]
        assert df.iloc[0]["FIRSTNAME"] == "José"

    def test_falls_back_to_cp1252_on_unicode_decode_error(self, tmp_path: Path):
        csv_path = tmp_path / "clients.csv"
        # "café" encoded as cp1252 is not valid utf-8.
        csv_path.write_bytes("CLIENT_ID,FIRSTNAME\n1,café\n".encode("cp1252"))

        df = open_local(csv_path)

        assert df.iloc[0]["FIRSTNAME"] == "café"
