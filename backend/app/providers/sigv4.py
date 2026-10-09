"""Minimal, dependency-free AWS Signature Version 4 signer.

Implements the exact algorithm from the AWS documentation
(https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html)
so AquaNexus does not have to pull in the heavyweight boto3 SDK merely to sign
one GET request. Only the subset needed for anonymous-payload S3 ``GetObject``
is implemented, and it is a pure function of its inputs so it is fully testable
without any network or credentials.

Do NOT log the inputs: ``secret_access_key`` and ``session_token`` are secrets.
"""
from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import quote

ALGORITHM = "AWS4-HMAC-SHA256"
SERVICE = "s3"
EMPTY_PAYLOAD_SHA256 = hashlib.sha256(b"").hexdigest()


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _hmac(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def canonical_uri(path: str) -> str:
    """URI-encode an S3 object path. S3 keeps ``/`` literal and encodes once."""
    if not path.startswith("/"):
        path = "/" + path
    return quote(path, safe="/-_.~")


def derive_signing_key(secret_access_key: str, date_stamp: str, region: str) -> bytes:
    """Derive the SigV4 signing key (HMAC chain)."""
    k_date = _hmac(("AWS4" + secret_access_key).encode("utf-8"), date_stamp)
    k_region = _hmac(k_date, region)
    k_service = _hmac(k_region, SERVICE)
    return _hmac(k_service, "aws4_request")


@dataclass(frozen=True)
class SignedRequest:
    """The headers required to authenticate a signed S3 GET."""

    host: str
    amz_date: str
    authorization: str
    payload_hash: str
    headers: dict[str, str]


def sign_get_object(
    *,
    bucket: str,
    key: str,
    access_key_id: str,
    secret_access_key: str,
    session_token: str,
    region: str,
    endpoint_host: str,
    now: datetime | None = None,
) -> SignedRequest:
    """Sign an S3 ``GetObject`` request for ``bucket``/``key``.

    ``endpoint_host`` is the host used in the ``Host`` header (e.g.
    ``gesdisc-cumulus-prod-protected.s3.us-west-2.amazonaws.com`` or the
    regional variant). Virtual-hosted style: the bucket is part of the host.
    """
    now = (now or datetime.now(tz=timezone.utc)).astimezone(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")

    canonical_path = canonical_uri(f"/{key}")
    # No query string; the payload is empty for GET.
    canonical_headers = (
        f"host:{endpoint_host}\n"
        f"x-amz-content-sha256:{EMPTY_PAYLOAD_SHA256}\n"
        f"x-amz-date:{amz_date}\n"
        f"x-amz-security-token:{session_token}\n"
    )
    signed_headers = "host;x-amz-content-sha256;x-amz-date;x-amz-security-token"
    canonical_request = "\n".join(
        [
            "GET",
            canonical_path,
            "",
            canonical_headers,
            signed_headers,
            EMPTY_PAYLOAD_SHA256,
        ]
    )

    scope = f"{date_stamp}/{region}/{SERVICE}/aws4_request"
    string_to_sign = "\n".join(
        [ALGORITHM, amz_date, scope, _sha256_hex(canonical_request.encode("utf-8"))]
    )
    signing_key = derive_signing_key(secret_access_key, date_stamp, region)
    signature = hmac.new(
        signing_key, string_to_sign.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    authorization = (
        f"{ALGORITHM} Credential={access_key_id}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    headers = {
        "Host": endpoint_host,
        "x-amz-content-sha256": EMPTY_PAYLOAD_SHA256,
        "x-amz-date": amz_date,
        "x-amz-security-token": session_token,
        "Authorization": authorization,
    }
    return SignedRequest(
        host=endpoint_host,
        amz_date=amz_date,
        authorization=authorization,
        payload_hash=EMPTY_PAYLOAD_SHA256,
        headers=headers,
    )
