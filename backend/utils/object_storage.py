"""
Emergent object storage integration.

Thin wrapper around the Emergent storage API. Exposes:
- init_storage(): one-shot init that returns a reusable storage_key
- put_object(path, data, content_type): upload bytes
- get_object(path): download bytes

Design notes:
- Single module-level storage_key (session-scoped, not per-request)
- No delete/rename API upstream — soft-delete lives in the 'files' collection
- All object paths MUST be prefixed with APP_NAME to avoid cross-app collisions
"""
import logging
import os
import uuid
from typing import Optional, Tuple

import requests

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "orderdesk"

_storage_key: Optional[str] = None


def _get_key() -> str:
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise RuntimeError(
            "EMERGENT_LLM_KEY is not set. Add it to backend/.env. "
            "Get it from https://app.emergent.sh -> Profile -> Universal Key."
        )
    return key


def init_storage() -> str:
    """Initialize storage session. Call once at startup; safe to call repeatedly."""
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(
        f"{STORAGE_URL}/init",
        json={"emergent_key": _get_key()},
        timeout=30,
    )
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    logger.info("✅ Emergent object storage initialized")
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload bytes to storage. Returns {"path": ..., "size": ..., "etag": ...}.
    Path must be prefixed with APP_NAME (use build_proof_path or similar)."""
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> Tuple[bytes, str]:
    """Download bytes. Returns (content, content_type)."""
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def build_proof_path(tenant_id: str, order_id: str, ext: str = "jpg") -> str:
    """Canonical path scheme for proof images."""
    safe_ext = (ext or "jpg").lower().lstrip(".")
    return f"{APP_NAME}/proofs/{tenant_id}/{order_id}/{uuid.uuid4()}.{safe_ext}"


MIME_BY_EXT = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "png": "image/png", "gif": "image/gif",
    "webp": "image/webp", "bmp": "image/bmp",
}


def guess_mime(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return MIME_BY_EXT.get(ext, "application/octet-stream")
