"""Product knowledge and destinations shared by the prompt and navigation tool.

This describes existing workspaces, not a natural-language command router.
The model chooses typed tools; permissions remain enforced by their services.
"""

from dataclasses import dataclass

from app.core.permissions import BILLING_ROLES, CLINICAL_DATA_ROLES, STAFF_ROLES
from app.domains.reporting.application.registros_catalogo import catalog_for_user


@dataclass(frozen=True)
class PatientArea:
    tab: str
    description: str
    roles: frozenset[str] = frozenset(STAFF_ROLES)


PATIENT_AREAS = {
    "ficha": PatientArea("pacientes", "Datos, alertas, próxima cita, documentos y acciones del paciente"),
    "historial": PatientArea("historial", "Actos clínicos y detalle de visitas; economía según permisos", frozenset(CLINICAL_DATA_ROLES)),
    "tratamientos": PatientArea("pendiente", "Trabajo clínico pendiente y planes"),
    "presupuestos": PatientArea("presupuestos", "Editar planes, líneas, alternativas y aceptación"),
    "pendientes": PatientArea("pendiente", "Tratamientos pendientes de realizar"),
    "realizados": PatientArea("historial", "Tratamientos realizados y sus visitas"),
    "sesion": PatientArea("sesion", "Sesión actual, dictado, notas y registro de tratamientos", frozenset(CLINICAL_DATA_ROLES)),
    "visitas": PatientArea("visitas", "Sesiones clínicas anteriores", frozenset(CLINICAL_DATA_ROLES)),
    "primera_visita": PatientArea("primera", "Exploración, diagnóstico dictado y odontograma", frozenset(CLINICAL_DATA_ROLES)),
    "documentos": PatientArea("documentos", "Consultar o subir documentos e imágenes; firma en su editor"),
    "consentimientos": PatientArea("consentimientos", "Documentos autorizados por el rol; firma clínica en su editor"),
    "receta": PatientArea("receta", "Abrir editor de recetas con navigate(module=receta, patient_id). Basta seleccionar paciente, NO hace falta iniciar cita ni sesión. El profesional completa, revisa y emite; el asistente no prescribe", frozenset(CLINICAL_DATA_ROLES)),
    "economia": PatientArea("facturacion", "Cuenta del paciente, cobros, cargos y facturas", frozenset(BILLING_ROLES)),
}


def workspace_knowledge(user):
    """Small, permission-filtered map; reporting IDs/states come from their owner."""
    return {
        "patient_editors": {
            key: area.description for key, area in PATIENT_AREAS.items() if user.rol in area.roles
        },
        "record_views": {
            view.id: {
                "label": view.label,
                "states": {s.value: s.label for s in view.states},
            }
            for view in catalog_for_user(user)
        },
        "workflow": (
            "Paciente → exploración → propuesta de tratamiento → aceptación → pendientes → "
            "cita/sesión → realizado → cuenta del paciente → cobro y factura cuando proceda. "
            "Anotar no equivale a realizar; realizar no equivale a cobrar ni facturar. "
            "El historial general muestra actuaciones clínicas y economía autorizada; "
            "documentos, recetas y consentimientos tienen sus propios accesos contextuales. "
            "Las herramientas PREPARAR permiten revisar cambios antes de guardarlos. "
            "El resto de funciones se completa en el editor existente, sin fingir que se ha guardado. "
            "Para ver documentos usa search_records(view=documentos); para abrir su editor usa navigate. "
            "Laboratorio se consulta en Registros; mensajes/recordatorios se gestionan en Jornada. "
            "Administración y Ajustes son de administración: usuarios, clínica, horarios, catálogo, "
            "laboratorio, inventario, informes e integraciones. No cambies permisos ni firmas por IA."
        ),
    }
