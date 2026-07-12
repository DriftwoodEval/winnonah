import asyncio
import base64
import hashlib
import hmac
import time

import pytest
from fastapi import HTTPException

from utils.webhook import verify_openphone_signature

SECRET = base64.b64encode(b"test-signing-secret").decode()


class FakeRequest:
    def __init__(self, body: bytes):
        self._body = body

    async def body(self) -> bytes:
        return self._body


def _sign(body: bytes, secret_b64: str = SECRET, timestamp: int | None = None) -> str:
    if timestamp is None:
        timestamp = int(time.time() * 1000)
    signing_payload = str(timestamp).encode() + b"." + body
    secret_bytes = base64.b64decode(secret_b64)
    mac = hmac.new(secret_bytes, msg=signing_payload, digestmod=hashlib.sha256).digest()
    sig_b64 = base64.b64encode(mac).decode()
    return f"hmac;1;{timestamp};{sig_b64}"


def _verify(request: FakeRequest, header: str, secret: str) -> None:
    asyncio.run(verify_openphone_signature(request, header, secret))


class TestVerifyOpenphoneSignature:
    def test_accepts_valid_signature(self):
        body = b'{"event": "message.received"}'
        header = _sign(body)
        _verify(FakeRequest(body), header, SECRET)

    def test_rejects_mismatched_body(self):
        header = _sign(b'{"event": "message.received"}')
        request = FakeRequest(b'{"event": "tampered"}')
        with pytest.raises(HTTPException) as exc_info:
            _verify(request, header, SECRET)
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Signature mismatch"

    def test_rejects_wrong_secret(self):
        body = b'{"event": "message.received"}'
        header = _sign(body)
        other_secret = base64.b64encode(b"a-different-secret").decode()
        with pytest.raises(HTTPException) as exc_info:
            _verify(FakeRequest(body), header, other_secret)
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Signature mismatch"

    def test_rejects_expired_timestamp(self):
        body = b'{"event": "message.received"}'
        ten_minutes_ago = int(time.time() * 1000) - 10 * 60 * 1000
        header = _sign(body, timestamp=ten_minutes_ago)
        with pytest.raises(HTTPException) as exc_info:
            _verify(FakeRequest(body), header, SECRET)
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Signature expired"

    def test_rejects_malformed_header(self):
        body = b'{"event": "message.received"}'
        with pytest.raises(HTTPException) as exc_info:
            _verify(FakeRequest(body), "not-enough-parts", SECRET)
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid signature format"

    def test_rejects_non_numeric_timestamp(self):
        body = b'{"event": "message.received"}'
        header = "hmac;1;not-a-number;deadbeef"
        with pytest.raises(HTTPException) as exc_info:
            _verify(FakeRequest(body), header, SECRET)
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid signature format"
