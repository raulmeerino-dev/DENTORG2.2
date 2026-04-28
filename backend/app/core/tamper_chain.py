"""
Cadena de integridad para logs y eventos inmutables.

Permite detectar manipulaciones en registros de auditoria y del SIF sin
necesidad de sobrescribir ni borrar entradas historicas.
"""
from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping


def canonical_json(data: Mapping | None) -> str:
    """Serializa un payload en formato estable para calcular hashes."""
    return json.dumps(data or {}, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def build_chain_hash(*, previous_hash: str | None, payload: Mapping | None) -> str:
    base = previous_hash or "0" * 64
    serialized = canonical_json(payload)
    return hashlib.sha256(f"{base}|{serialized}".encode("utf-8")).hexdigest()
