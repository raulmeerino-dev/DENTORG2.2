from enum import StrEnum


class EstadoFactura(StrEnum):
    borrador = "borrador"
    emitida = "emitida"
    pagada = "pagada"
    anulada = "anulada"
