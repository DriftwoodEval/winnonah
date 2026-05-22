import base64
import hashlib
import hmac
import time

from fastapi import HTTPException, Request


async def verify_openphone_signature(
    request: Request, signature_header: str, secret: str
) -> None:
    """Verifies an OpenPhone webhook signature."""
    try:
        parts = signature_header.split(";")
        if len(parts) != 4:
            raise ValueError("Invalid signature format")
        _algo, _version, timestamp, received_sig = parts
        timestamp = timestamp.strip()
        received_sig = received_sig.strip()
    except ValueError, AttributeError:
        raise HTTPException(status_code=401, detail="Invalid signature format")

    now_ms = int(time.time() * 1000)
    if abs(now_ms - int(timestamp)) > 5 * 60 * 1000:
        raise HTTPException(status_code=401, detail="Signature expired")

    raw_body = await request.body()
    signing_payload = timestamp.encode() + b"." + raw_body
    secret_bytes = base64.b64decode(secret.strip())
    expected_hmac = hmac.new(
        secret_bytes, msg=signing_payload, digestmod=hashlib.sha256
    ).digest()
    expected_sig_b64 = base64.b64encode(expected_hmac).decode()

    if not hmac.compare_digest(expected_sig_b64, received_sig):
        raise HTTPException(status_code=401, detail="Signature mismatch")
