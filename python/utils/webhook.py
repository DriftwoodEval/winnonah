import base64
import hashlib
import hmac
import time

from fastapi import HTTPException, Request
from loguru import logger


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
    except (ValueError, AttributeError) as e:
        logger.warning(f"Webhook rejected: invalid signature format - {e}")
        raise HTTPException(status_code=401, detail="Invalid signature format") from e

    now_ms = int(time.time() * 1000)
    age_ms = abs(now_ms - int(timestamp))
    if age_ms > 5 * 60 * 1000:
        logger.warning(f"Webhook rejected: signature expired (age={age_ms}ms)")
        raise HTTPException(status_code=401, detail="Signature expired")

    raw_body = await request.body()
    signing_payload = timestamp.encode() + b"." + raw_body
    secret_bytes = base64.b64decode(secret.strip())
    expected_hmac = hmac.new(
        secret_bytes, msg=signing_payload, digestmod=hashlib.sha256
    ).digest()
    expected_sig_b64 = base64.b64encode(expected_hmac).decode()

    if not hmac.compare_digest(expected_sig_b64, received_sig):
        logger.warning(
            f"Webhook rejected: signature mismatch (expected={expected_sig_b64}, received={received_sig})"
        )
        raise HTTPException(status_code=401, detail="Signature mismatch")
