"""
Exporta todos los modelos para que Alembic los detecte en autogenerate.
El orden de importación respeta las dependencias entre tablas.
"""
from app.models.doctor import Doctor
from app.models.clinica import (
    Clinica,
    MovimientoInventario,
    PacienteTemp,
    PedidoLinea,
    PedidoProveedor,
    Producto,
    Proveedor,
    Receta,
    Teleconsulta,
)
from app.models.gabinete import Gabinete
from app.models.entidad import Entidad
from app.models.usuario import Usuario
from app.models.horario import HorarioDoctor, HorarioExcepcion
from app.models.paciente import Paciente
from app.models.cita import Cita, CitaCambio, CitaTelefonear, HistorialFaltas
from app.models.tratamiento import FamiliaTratamiento, TratamientoCatalogo, EntidadBaremo
from app.models.historial import HistorialClinico
from app.models.presupuesto import Presupuesto, PresupuestoLinea, TrabajoPendiente
from app.models.factura import FormaPago, Factura, FacturaLinea, Cobro, PagoAnticipadoPaciente, DocumentoFiscal
from app.models.referencia import Referencia, paciente_referencias
from app.models.consentimiento import Consentimiento, ConsentimientoPlantilla
from app.models.documento import DocumentoPaciente
from app.models.laboratorio import Laboratorio, TrabajoLaboratorio
from app.models.odontograma import Odontograma, OdontogramaEvento, OdontogramaPieza, OdontogramaSuperficie
from app.models.audit_log import AuditLog
from app.models.registro_evento_sif import RegistroEventoSIF
from app.models.registro_facturacion import RegistroFacturacion
from app.models.auth_session import AuthSession
from app.models.backup import BackupRegistro

__all__ = [
    "Doctor",
    "Clinica",
    "Teleconsulta",
    "Proveedor",
    "Producto",
    "MovimientoInventario",
    "PedidoProveedor",
    "PedidoLinea",
    "Receta",
    "PacienteTemp",
    "Gabinete",
    "Entidad",
    "Usuario",
    "HorarioDoctor",
    "HorarioExcepcion",
    "Paciente",
    "Cita",
    "CitaCambio",
    "CitaTelefonear",
    "HistorialFaltas",
    "FamiliaTratamiento",
    "TratamientoCatalogo",
    "EntidadBaremo",
    "HistorialClinico",
    "Presupuesto",
    "PresupuestoLinea",
    "TrabajoPendiente",
    "FormaPago",
    "Factura",
    "FacturaLinea",
    "Cobro",
    "PagoAnticipadoPaciente",
    "DocumentoFiscal",
    "Referencia",
    "paciente_referencias",
    "Consentimiento",
    "ConsentimientoPlantilla",
    "DocumentoPaciente",
    "Laboratorio",
    "TrabajoLaboratorio",
    "Odontograma",
    "OdontogramaPieza",
    "OdontogramaSuperficie",
    "OdontogramaEvento",
    "AuditLog",
    "RegistroEventoSIF",
    "RegistroFacturacion",
    "AuthSession",
    "BackupRegistro",
]
