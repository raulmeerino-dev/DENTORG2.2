from enum import StrEnum


class RolUsuario(StrEnum):
    admin = "admin"
    doctor = "doctor"
    recepcion = "recepcion"
    auxiliar = "auxiliar"
    paciente = "paciente"
