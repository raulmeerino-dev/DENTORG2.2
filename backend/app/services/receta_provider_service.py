"""Adaptadores para proveedor externo de receta privada/digital.

No se simula una integracion real. El modo mock es solo desarrollo/testing y
debe mostrarse como no certificado real en UI.
"""
from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from typing import Protocol

from app.config import get_settings
from app.services.pdf_service import generar_receta_local_desde_plantilla_pdf


@dataclass
class RecetaProviderResult:
    external_id: str
    status: str
    verification_code: str | None = None
    pdf_bytes: bytes | None = None
    error: str | None = None


class RecetaProvider(Protocol):
    mode: str

    async def create_prescription(self, payload: dict) -> RecetaProviderResult: ...
    async def get_status(self, external_id: str) -> RecetaProviderResult: ...
    async def cancel_prescription(self, external_id: str) -> RecetaProviderResult: ...
    async def download_certified_pdf(self, external_id: str) -> bytes: ...


class DisabledRecetaProvider:
    mode = "disabled"

    async def create_prescription(self, payload: dict) -> RecetaProviderResult:
        return RecetaProviderResult(external_id="", status="disabled", error="Proveedor de receta no configurado")

    async def get_status(self, external_id: str) -> RecetaProviderResult:
        return RecetaProviderResult(external_id=external_id, status="disabled", error="Proveedor de receta no configurado")

    async def cancel_prescription(self, external_id: str) -> RecetaProviderResult:
        return RecetaProviderResult(external_id=external_id, status="disabled", error="Proveedor de receta no configurado")

    async def download_certified_pdf(self, external_id: str) -> bytes:
        raise RuntimeError("Proveedor de receta no configurado")


class MockRecetaProvider:
    mode = "mock"

    async def create_prescription(self, payload: dict) -> RecetaProviderResult:
        seed = f"{payload.get('receta_id')}:{payload.get('paciente_id')}:{payload.get('medicamento')}"
        digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:12].upper()
        external_id = f"MOCK-RX-{digest}"
        verification_code = f"MOCK-{uuid.uuid4().hex[:10].upper()}"
        pdf_bytes = generar_receta_local_desde_plantilla_pdf(
            plantilla_path=payload.get("plantilla_path"),
            plantilla_mime=payload.get("plantilla_mime"),
            campos_config=payload.get("campos_config"),
            data={**payload, "verification_code": verification_code},
        )
        return RecetaProviderResult(
            external_id=external_id,
            status="certificada_mock",
            verification_code=verification_code,
            pdf_bytes=pdf_bytes,
        )

    async def get_status(self, external_id: str) -> RecetaProviderResult:
        return RecetaProviderResult(external_id=external_id, status="certificada_mock")

    async def cancel_prescription(self, external_id: str) -> RecetaProviderResult:
        return RecetaProviderResult(external_id=external_id, status="anulada_mock")

    async def download_certified_pdf(self, external_id: str) -> bytes:
        raise RuntimeError("MockRecetaProvider no conserva PDFs remotos")


class RealRecetaProvider:
    mode = "real"

    async def create_prescription(self, payload: dict) -> RecetaProviderResult:
        raise NotImplementedError("Integracion real de receta no implementada")

    async def get_status(self, external_id: str) -> RecetaProviderResult:
        raise NotImplementedError("Integracion real de receta no implementada")

    async def cancel_prescription(self, external_id: str) -> RecetaProviderResult:
        raise NotImplementedError("Integracion real de receta no implementada")

    async def download_certified_pdf(self, external_id: str) -> bytes:
        raise NotImplementedError("Integracion real de receta no implementada")


def get_receta_provider() -> RecetaProvider:
    settings = get_settings()
    if settings.receta_provider == "mock":
        return MockRecetaProvider()
    if settings.receta_provider == "real":
        return RealRecetaProvider()
    return DisabledRecetaProvider()


def provider_status_payload() -> dict:
    settings = get_settings()
    mode = settings.receta_provider
    real_ready = (
        mode == "real"
        and bool(settings.receta_provider_base_url)
        and bool(settings.receta_provider_client_id)
        and bool(settings.receta_provider_client_secret)
    )
    return {
        "mode": mode,
        "provider_available": mode == "mock" or real_ready,
        "real_certification_enabled": real_ready,
        "warning": None if real_ready else "Receta no certificada. Modo local/mock o proveedor real no configurado.",
    }
