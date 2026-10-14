from unittest.mock import MagicMock, patch

from driftwood_common import google_service


class TestBuildGoogleService:
    def test_bounds_requests_with_a_socket_timeout(self):
        creds = MagicMock()
        with (
            patch.object(google_service.httplib2, "Http") as http_cls,
            patch.object(google_service.google_auth_httplib2, "AuthorizedHttp") as auth,
            patch.object(google_service, "build") as build,
        ):
            service = google_service.build_google_service("gmail", "v1", creds)

        http_cls.assert_called_once_with(timeout=google_service.REQUEST_TIMEOUT_SECONDS)
        auth.assert_called_once_with(creds, http=http_cls.return_value)
        build.assert_called_once_with("gmail", "v1", http=auth.return_value)
        assert service is build.return_value

    def test_accepts_a_custom_timeout(self):
        with (
            patch.object(google_service.httplib2, "Http") as http_cls,
            patch.object(google_service.google_auth_httplib2, "AuthorizedHttp"),
            patch.object(google_service, "build"),
        ):
            google_service.build_google_service("drive", "v3", MagicMock(), timeout=5)

        http_cls.assert_called_once_with(timeout=5)
