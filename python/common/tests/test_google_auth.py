from unittest.mock import MagicMock

import pytest
from driftwood_common import google_auth
from google.auth.exceptions import RefreshError

SCOPES = ["scope-a", "scope-b"]


class FakeCreds:
    def __init__(self, *, valid=False, refresh_failures=0, scopes=None):
        self.scopes = list(SCOPES if scopes is None else scopes)
        self.refresh_token = "refresh-token"
        self.expired = not valid
        self.valid = valid
        self._refresh_failures = refresh_failures
        self.refresh_calls = 0

    def refresh(self, _request):
        self.refresh_calls += 1
        if self.refresh_calls <= self._refresh_failures:
            raise RefreshError("transient")
        self.valid = True

    def to_json(self):
        return '{"saved": true}'


@pytest.fixture
def paths(tmp_path, monkeypatch):
    monkeypatch.delenv("HEADLESS", raising=False)
    monkeypatch.setattr(google_auth.time, "sleep", lambda _s: None)
    token = tmp_path / "token.json"
    token.write_text("{}")
    return tmp_path / "credentials.json", token


def load_token_as(monkeypatch, creds):
    monkeypatch.setattr(
        google_auth.Credentials, "from_authorized_user_file", lambda *_a, **_k: creds
    )


def log_in_as(monkeypatch, creds):
    flow = MagicMock()
    flow.run_local_server.return_value = creds
    monkeypatch.setattr(
        google_auth.InstalledAppFlow,
        "from_client_secrets_file",
        MagicMock(return_value=flow),
    )
    return flow


class TestValidToken:
    def test_a_valid_saved_token_is_used_as_is(self, paths, monkeypatch):
        credentials_path, token_path = paths
        creds = FakeCreds(valid=True)
        load_token_as(monkeypatch, creds)

        assert google_auth.authenticate(SCOPES, credentials_path, token_path) is creds
        assert creds.refresh_calls == 0
        assert token_path.read_text() == "{}"

    def test_credentials_already_in_memory_skip_the_token_file(self, paths):
        credentials_path, token_path = paths
        token_path.unlink()
        creds = FakeCreds(valid=True)

        result = google_auth.authenticate(
            SCOPES, credentials_path, token_path, creds=creds
        )

        assert result is creds


class TestRefresh:
    def test_refreshes_an_expired_token_and_saves_it(self, paths, monkeypatch):
        credentials_path, token_path = paths
        creds = FakeCreds()
        load_token_as(monkeypatch, creds)

        assert google_auth.authenticate(SCOPES, credentials_path, token_path) is creds
        assert creds.refresh_calls == 1
        assert token_path.read_text() == '{"saved": true}'

    def test_retries_a_transient_refresh_failure(self, paths, monkeypatch):
        credentials_path, token_path = paths
        creds = FakeCreds(refresh_failures=2)
        load_token_as(monkeypatch, creds)

        assert google_auth.authenticate(SCOPES, credentials_path, token_path) is creds
        assert creds.refresh_calls == 3

    def test_falls_back_to_login_when_refresh_keeps_failing(self, paths, monkeypatch):
        credentials_path, token_path = paths
        load_token_as(monkeypatch, FakeCreds(refresh_failures=99))
        new_creds = FakeCreds(valid=True)
        flow = log_in_as(monkeypatch, new_creds)

        result = google_auth.authenticate(SCOPES, credentials_path, token_path)

        assert result is new_creds
        flow.run_local_server.assert_called_once_with(port=0)
        assert token_path.read_text() == '{"saved": true}'

    def test_headless_raises_when_refresh_is_exhausted(self, paths, monkeypatch):
        credentials_path, token_path = paths
        load_token_as(monkeypatch, FakeCreds(refresh_failures=99))
        monkeypatch.setenv("HEADLESS", "true")

        with pytest.raises(RuntimeError, match="headless"):
            google_auth.authenticate(SCOPES, credentials_path, token_path)


class TestLogin:
    def test_logs_in_when_there_is_no_saved_token(self, paths, monkeypatch):
        credentials_path, token_path = paths
        token_path.unlink()
        new_creds = FakeCreds(valid=True)
        log_in_as(monkeypatch, new_creds)

        result = google_auth.authenticate(SCOPES, credentials_path, token_path)

        assert result is new_creds
        assert token_path.read_text() == '{"saved": true}'
        from_secrets = google_auth.InstalledAppFlow.from_client_secrets_file
        from_secrets.assert_called_once_with(str(credentials_path), SCOPES)

    def test_headless_raises_instead_of_opening_a_browser(self, paths, monkeypatch):
        credentials_path, token_path = paths
        token_path.unlink()
        monkeypatch.setenv("HEADLESS", "true")
        log_in_as(monkeypatch, FakeCreds(valid=True))

        with pytest.raises(RuntimeError, match=str(token_path)):
            google_auth.authenticate(SCOPES, credentials_path, token_path)
        google_auth.InstalledAppFlow.from_client_secrets_file.assert_not_called()


class TestScopes:
    def test_a_token_with_different_scopes_is_kept_by_default(self, paths, monkeypatch):
        credentials_path, token_path = paths
        creds = FakeCreds(valid=True, scopes=["other"])
        load_token_as(monkeypatch, creds)

        assert google_auth.authenticate(SCOPES, credentials_path, token_path) is creds

    def test_exact_scopes_discard_a_token_with_different_scopes(
        self, paths, monkeypatch
    ):
        credentials_path, token_path = paths
        load_token_as(monkeypatch, FakeCreds(valid=True, scopes=["other"]))
        new_creds = FakeCreds(valid=True)
        log_in_as(monkeypatch, new_creds)

        result = google_auth.authenticate(
            SCOPES, credentials_path, token_path, require_exact_scopes=True
        )

        assert result is new_creds

    def test_exact_scopes_keep_a_token_that_matches(self, paths, monkeypatch):
        credentials_path, token_path = paths
        creds = FakeCreds(valid=True, scopes=list(reversed(SCOPES)))
        load_token_as(monkeypatch, creds)

        result = google_auth.authenticate(
            SCOPES, credentials_path, token_path, require_exact_scopes=True
        )

        assert result is creds
