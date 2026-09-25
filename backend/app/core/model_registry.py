"""
Exporta todos los modelos para que Alembic los detecte en autogenerate.
El orden de importación respeta las dependencias entre tablas.
"""

from app.core.persistence.audit_log import AuditLog
from app.core.persistence.backup import BackupRegistro
from app.domains.ai.persistence.copilot import CopilotSession
from app.domains.ai.persistence.dictado import DictadoClinico
from app.domains.billing.persistence.entidad import Entidad
from app.domains.billing.persistence.factura import (
    Cobro,
    DocumentoFiscal,
    Factura,
    FacturaLinea,
    FormaPago,
    PagoAnticipadoPaciente,
)
from app.domains.billing.persistence.receta_factura import RecetaFactura
from app.domains.billing.persistence.registro_evento_sif import RegistroEventoSIF
from app.domains.billing.persistence.registro_facturacion import RegistroFacturacion
from app.domains.clinical.persistence.consentimiento import Consentimiento, ConsentimientoPlantilla
from app.domains.clinical.persistence.documento import DocumentoPaciente
from app.domains.clinical.persistence.historial import HistorialClinico, NotaDental
from app.domains.clinical.persistence.odontograma import (
    Odontograma,
    OdontogramaEvento,
    OdontogramaPieza,
    OdontogramaSuperficie,
)
from app.domains.clinical.persistence.receta import RecetaClinica, RecetaPlantilla
from app.domains.clinical.persistence.sesion_clinica import SesionClinicaItem
from app.domains.clinical.persistence.tratamiento import (
    EntidadBaremo,
    FamiliaTratamiento,
    TratamientoCatalogo,
)
from app.domains.communications.persistence.notificacion import DoctorNotification
from app.domains.communications.persistence.whatsapp import WhatsAppComunicacion
from app.domains.identity.persistence.auth_session import AuthSession
from app.domains.identity.persistence.clinica import Clinica
from app.domains.identity.persistence.doctor import Doctor
from app.domains.identity.persistence.fichaje import FichajeTrabajador, Trabajador
from app.domains.identity.persistence.usuario import Usuario
from app.domains.inventory.persistence.inventario import (
    MovimientoInventario,
    PedidoLinea,
    PedidoProveedor,
    Producto,
    Proveedor,
)
from app.domains.laboratory.persistence.laboratorio import Laboratorio, TrabajoLaboratorio
from app.domains.patients.persistence.paciente import Paciente
from app.domains.patients.persistence.paciente_temp import PacienteTemp
from app.domains.patients.persistence.portal_invitation import PortalInvitation
from app.domains.patients.persistence.referencia import Referencia, paciente_referencias
from app.domains.scheduling.persistence.cita import (
    Cita,
    CitaCambio,
    CitaTelefonear,
    HistorialFaltas,
)
from app.domains.scheduling.persistence.gabinete import Gabinete
from app.domains.scheduling.persistence.horario import HorarioDoctor, HorarioExcepcion
from app.domains.treatment_plans.persistence.presupuesto import (
    Presupuesto,
    PresupuestoLinea,
    TrabajoPendiente,
)

__all__ = [
    "CopilotSession",
    "Doctor",
    "Clinica",
    "Proveedor",
    "Producto",
    "MovimientoInventario",
    "PedidoProveedor",
    "PedidoLinea",
    "RecetaFactura",
    "PacienteTemp",
    "Gabinete",
    "Entidad",
    "Usuario",
    "HorarioDoctor",
    "HorarioExcepcion",
    "Paciente",
    "PortalInvitation",
    "Cita",
    "CitaCambio",
    "CitaTelefonear",
    "HistorialFaltas",
    "FamiliaTratamiento",
    "TratamientoCatalogo",
    "EntidadBaremo",
    "HistorialClinico",
    "NotaDental",
    "Presupuesto",
    "PresupuestoLinea",
    "TrabajoPendiente",
    "SesionClinicaItem",
    "RecetaClinica",
    "RecetaPlantilla",
    "FormaPago",
    "Factura",
    "FacturaLinea",
    "Cobro",
    "PagoAnticipadoPaciente",
    "DocumentoFiscal",
    "Trabajador",
    "FichajeTrabajador",
    "Referencia",
    "paciente_referencias",
    "Consentimiento",
    "ConsentimientoPlantilla",
    "DictadoClinico",
    "DocumentoPaciente",
    "Laboratorio",
    "TrabajoLaboratorio",
    "DoctorNotification",
    "Odontograma",
    "OdontogramaPieza",
    "OdontogramaSuperficie",
    "OdontogramaEvento",
    "AuditLog",
    "RegistroEventoSIF",
    "RegistroFacturacion",
    "AuthSession",
    "BackupRegistro",
    "WhatsAppComunicacion",
]
