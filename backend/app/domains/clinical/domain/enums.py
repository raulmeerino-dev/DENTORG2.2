from enum import StrEnum


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
