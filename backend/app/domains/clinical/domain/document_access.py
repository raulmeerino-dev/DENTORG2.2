"""One disclosure policy for patient documents and transversal consultation."""
from uuid import UUID

from fastapi import HTTPException

from app.core.permissions import BILLING_ROLES, TokenData, can_view_health_data

ADMIN_DOCUMENT_TYPES = frozenset({"circular", "presupuesto", "factura"})
FINANCIAL_DOCUMENT_TYPES = frozenset({"factura"})


def ensure_clinical_document_access(user: TokenData, patient_id: UUID | None = None) -> None:
    # The optional patient portal retains access to its own explicitly linked
    # consent. Staff endpoints still require staff before reaching this policy.
    if patient_id is not None and user.rol == "paciente" and user.paciente_id == patient_id:
        return
    if not can_view_health_data(user):
        raise HTTPException(403, "Su rol no permite acceder a documentación clínica")


def ensure_document_access(user: TokenData, category: str) -> None:
    if category in FINANCIAL_DOCUMENT_TYPES and user.rol not in BILLING_ROLES:
        raise HTTPException(403, "Su rol no permite acceder a documentación fiscal")
    if not can_view_health_data(user) and not (user.rol == "recepcion" and category in ADMIN_DOCUMENT_TYPES):
        raise HTTPException(403, "Su rol no permite acceder a este documento")
