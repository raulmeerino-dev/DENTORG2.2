from enum import StrEnum


class RolUsuario(StrEnum):
    admin = "admin"
    doctor = "doctor"
    recepcion = "recepcion"
    auxiliar = "auxiliar"
    paciente = "paciente"


class EstadoCita(StrEnum):
    programada = "programada"
    confirmada = "confirmada"
    en_clinica = "en_clinica"
    atendida = "atendida"
    falta = "falta"
    anulada = "anulada"
    pending_confirmation = "pending_confirmation"
    confirmed = "confirmed"
    reminder_sent = "reminder_sent"
    reschedule_requested = "reschedule_requested"
    cancelled_by_patient = "cancelled_by_patient"
    pending_manual_review = "pending_manual_review"
    rescheduled = "rescheduled"


class EstadoPresupuesto(StrEnum):
    borrador = "borrador"
    presentado = "presentado"
    aceptado = "aceptado"
    rechazado = "rechazado"
    caducado = "caducado"


class EstadoFactura(StrEnum):
    borrador = "borrador"
    emitida = "emitida"
    pagada = "pagada"
    anulada = "anulada"


class TipoDocumento(StrEnum):
    radiografia = "radiografia"
    escaner = "escaner"
    tac_cbct = "tac_cbct"
    fotografia = "fotografia"
    informe = "informe"
    consentimiento = "consentimiento"
    presupuesto = "presupuesto"
    factura = "factura"
    otro = "otro"


class TipoConsentimiento(StrEnum):
    implantes = "implantes"
    extracciones = "extracciones"
    endodoncia = "endodoncia"
    ortodoncia = "ortodoncia"
    blanqueamiento = "blanqueamiento"
    cirugia = "cirugia"
    periodoncia = "periodoncia"
    protesis = "protesis"
    empastes = "empastes"
    limpieza = "limpieza"
    otros = "otros"


class EstadoTratamiento(StrEnum):
    presupuestado = "presupuestado"
    aceptado = "aceptado"
    en_curso = "en_curso"
    realizado = "realizado"
    facturado = "facturado"
    cobrado_parcial = "cobrado_parcial"
    cobrado_completo = "cobrado_completo"
