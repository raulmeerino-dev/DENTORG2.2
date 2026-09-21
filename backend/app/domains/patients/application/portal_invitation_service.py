import hashlib
import secrets


def generate_portal_token() -> str:
    return secrets.token_urlsafe(32)


def hash_portal_token(token: str) -> str:
    return hashlib.sha256(token.strip().encode("utf-8")).hexdigest()
