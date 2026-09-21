from enum import StrEnum


class EstadoPresupuesto(StrEnum):
    borrador = "borrador"
    presentado = "presentado"
    aceptado = "aceptado"
    rechazado = "rechazado"
    caducado = "caducado"
