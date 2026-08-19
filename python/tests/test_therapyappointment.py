import pytest

from utils.therapyappointment import DownloadFailedError, _combine_files


class TestCombineFiles:
    def test_succeeds_when_all_required_files_download(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        download_dir = tmp_path / "temp" / "downloads"
        download_dir.mkdir(parents=True)

        (download_dir / "clients-appointments_123.csv").write_text(
            "CLIENT_ID,NAME\n1,Test\n"
        )
        (download_dir / "dataExport-demographic.csv").write_text(
            "CLIENT_ID,FIRSTNAME\n1,Test\n"
        )
        (download_dir / "dataExport-insurance.csv").write_text(
            "CLIENT_ID,POLICY_TYPE\n1,PPO\n"
        )

        _combine_files()

        input_dir = tmp_path / "temp" / "input"
        assert (input_dir / "clients-appointments.csv").exists()
        assert (input_dir / "clients-demographic.csv").exists()
        assert (input_dir / "clients-insurance.csv").exists()

    def test_raises_and_keeps_old_file_when_a_required_file_fails_to_download(
        self, tmp_path, monkeypatch
    ):
        monkeypatch.chdir(tmp_path)
        download_dir = tmp_path / "temp" / "downloads"
        download_dir.mkdir(parents=True)
        input_dir = tmp_path / "temp" / "input"
        input_dir.mkdir(parents=True)

        # Previous successful run's demographic file. This run's TA export
        # for demographic data never showed up in the downloads directory.
        old_demographic_path = input_dir / "clients-demographic.csv"
        old_demographic_path.write_text("CLIENT_ID,FIRSTNAME\n1,OldData\n")

        (download_dir / "clients-appointments_123.csv").write_text(
            "CLIENT_ID,NAME\n1,Test\n"
        )
        (download_dir / "dataExport-insurance.csv").write_text(
            "CLIENT_ID,POLICY_TYPE\n1,PPO\n"
        )

        with pytest.raises(DownloadFailedError, match=r"clients-demographic\.csv"):
            _combine_files()

        # The old file must survive the failed run untouched.
        assert old_demographic_path.read_text() == "CLIENT_ID,FIRSTNAME\n1,OldData\n"
        # Files that did download successfully still get refreshed.
        assert (input_dir / "clients-appointments.csv").exists()
        assert (input_dir / "clients-insurance.csv").exists()
