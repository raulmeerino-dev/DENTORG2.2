"""Strict transport contracts; client context never grants authority."""

from datetime import date, datetime, time, timedelta
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domains.scheduling.application.clinic_time import clinic_datetime


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CopilotContext(StrictModel):
    module: Literal[
        "jornada",
        "agenda",
        "pacientes",
        "caja",
        "registros",
        "archivos",
        "administracion",
        "ajustes",
        "otro",
    ] = "otro"
    patient_id: UUID | None = None
    appointment_id: UUID | None = None
    day: date | None = None
    section: str | None = Field(None, max_length=40)


class CopilotTurn(StrictModel):
    session_id: UUID
    request_id: UUID
    text: str = Field(min_length=1, max_length=4000)
    context: CopilotContext = Field(default_factory=CopilotContext)


class CopilotConfirm(StrictModel):
    proposal_id: UUID
    decision: Literal["confirm", "cancel"]


class SearchPatients(StrictModel):
    query: str = Field(min_length=1, max_length=120)


class SearchProfessionals(StrictModel):
    query: str = Field(default="", max_length=120)


class PatientReference(StrictModel):
    patient_id: UUID


class Navigate(StrictModel):
    module: Literal[
        "jornada",
        "agenda",
        "pacientes",
        "caja",
        "registros",
        "archivos",
        "administracion",
        "ajustes",
        "ficha",
        "historial",
        "tratamientos",
        "presupuestos",
        "pendientes",
        "realizados",
        "documentos",
        "consentimientos",
        "receta",
        "primera_visita",
    ] = Field(
        description="Destino semántico: agenda=calendario/citas, jornada=panel operativo/recepción. Las áreas historial, presupuestos, etc. abren al paciente indicado."
    )
    patient_id: UUID | None = None
    appointment_id: UUID | None = None
    day: date | None = None
    section: (
        Literal[
            "ficha",
            "historial",
            "tratamientos",
            "presupuestos",
            "pendientes",
            "realizados",
            "documentos",
            "consentimientos",
            "receta",
            "primera_visita",
        ]
        | None
    ) = None


class Schedule(StrictModel):
    start: AwareDatetime | date = Field(description="Inicio inclusivo: fecha YYYY-MM-DD (día completo en zona de la clínica) o fecha/hora ISO con zona horaria.")
    end: AwareDatetime | date = Field(description="Final inclusivo: fecha YYYY-MM-DD (hasta el final de ese día en la clínica) o fecha/hora ISO con zona horaria.")
    patient_id: UUID | None = None
    professional_id: UUID | None = None

    @model_validator(mode="after")
    def bounded_range(self):
        if not isinstance(self.start, datetime):
            self.start = clinic_datetime(datetime.combine(self.start, time.min))
        if not isinstance(self.end, datetime):
            self.end = clinic_datetime(datetime.combine(self.end, time.max))
        if not timedelta(minutes=1) <= self.end - self.start <= timedelta(days=31):
            raise ValueError("El rango debe tener entre un minuto y 31 días")
        return self


class Slots(Schedule):
    professional_id: UUID
    duration: int = Field(default=30, ge=5, le=480, multiple_of=5)
    preference: Literal["any", "morning", "afternoon"] = "any"


class Appointment(StrictModel):
    patient_id: UUID
    professional_id: UUID
    start: AwareDatetime
    duration: int = Field(30, ge=5, le=480, multiple_of=5)
    reason: str = Field(min_length=1, max_length=500)


class Reschedule(StrictModel):
    appointment_id: UUID
    start: AwareDatetime
    professional_id: UUID | None = None
    duration: int | None = Field(None, ge=5, le=480, multiple_of=5)


class AppointmentReference(StrictModel):
    appointment_id: UUID


class CancelAppointment(AppointmentReference):
    reason: str = Field(min_length=1, max_length=80)


class ClinicalNote(PatientReference):
    appointment_id: UUID | None = None
    text: str = Field(
        min_length=1,
        max_length=4000,
        description="Nota basada únicamente en hechos dictados por el profesional. No añadir diagnósticos.",
    )
    tooth: str | None = Field(
        None,
        pattern=r"^(?:[1-4][1-8]|[5-8][1-5])$",
        description="Pieza FDI mencionada explícitamente en el dictado, por ejemplo 14. Extráela también aquí, además de conservarla en el texto. Null si no se indicó pieza.",
    )


class Records(StrictModel):
    view: str = Field(
        max_length=40, description="ID del catálogo semántico disponible para este usuario"
    )
    query: str | None = Field(None, max_length=200)
    patient_id: UUID | None = None
    professional_id: UUID | None = None
    start: date | None = None
    end: date | None = None
    status: str | None = Field(None, max_length=80)
    kind: str | None = Field(None, max_length=80)
    balance_min: float | None = Field(None, ge=0)
    amount_min: float | None = Field(None, ge=0)


class Payment(StrictModel):
    invoice_id: UUID
    method_id: UUID
    amount: float = Field(gt=0, le=1000000)


class Empty(StrictModel):
    pass


class BudgetLine(StrictModel):
    treatment_id: UUID
    tooth: int | None = Field(None, ge=11, le=85)
    surfaces: str | None = Field(None, max_length=6, pattern=r"^[MODVLP]+$")

    @field_validator("tooth")
    @classmethod
    def valid_tooth(cls, value):
        if value is not None and not (
            1 <= value // 10 <= 4
            and 1 <= value % 10 <= 8
            or 5 <= value // 10 <= 8
            and 1 <= value % 10 <= 5
        ):
            raise ValueError("Pieza FDI no válida")
        return value


class PerformedTreatment(BudgetLine, PatientReference):
    professional_id: UUID
    appointment_id: UUID | None = None
    day: date
    amount: float | None = Field(None, ge=0, le=1000000)
    notes: str | None = Field(None, max_length=4000)


class Budget(PatientReference):
    professional_id: UUID
    lines: list[BudgetLine] = Field(min_length=1, max_length=30)


class RecordTarget(StrictModel):
    view: str = Field(max_length=40)
    record_id: UUID
