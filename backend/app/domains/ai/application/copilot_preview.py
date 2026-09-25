"""Authoritative review fields and concurrency guards, separate from model arguments."""

from fastapi import HTTPException

from app.domains.ai.application.copilot_tools import catalogo, citas, facturas, pacientes, plain
from app.domains.clinical.application.patient_context import (
    get_history_patient_or_404,
    validate_history_links,
)
from app.domains.scheduling.application.clinic_time import clinic_datetime

LABELS = {
    "create_appointment": "Crear cita",
    "reschedule_appointment": "Reprogramar cita",
    "cancel_appointment": "Cancelar cita",
    "mark_arrival": "Registrar llegada",
    "start_attention": "Iniciar atención",
    "finish_visit": "Finalizar visita y enviar a recepción",
    "clinical_note": "Guardar nota clínica",
    "register_payment": "Registrar cobro",
    "create_budget": "Crear presupuesto",
    "record_performed_treatment": "Registrar tratamiento realizado",
}


async def prepare_preview(tool, args, db, user, names):
    fields, guard = [], {}

    def field(label, value):
        if value is not None:
            fields.append({"label": label, "value": str(value)})

    patient_id = getattr(args, "patient_id", None)
    appointment_id = getattr(args, "appointment_id", None)
    if appointment_id:
        appointment = await citas.obtener_cita(appointment_id, db, user)
        if patient_id and patient_id != appointment.paciente_id:
            raise HTTPException(409, "La cita no corresponde al paciente seleccionado.")
        patient_id = appointment.paciente_id
        guard["appointment"] = {
            k: plain(appointment)[k]
            for k in (
                "paciente_id",
                "doctor_id",
                "fecha_hora",
                "duracion_min",
                "estado",
                "pendiente_salida",
            )
        }
        field("Cita actual", clinic_datetime(appointment.fecha_hora).strftime("%d/%m/%Y · %H:%M"))
        field(
            "Profesional actual",
            appointment.doctor.nombre
            if appointment.doctor
            else names.get(str(appointment.doctor_id), "Profesional asignado"),
        )
        field("Estado actual", appointment.estado_operativo)
    if tool.name == "register_payment":
        invoice = await facturas.obtener_factura(args.invoice_id, db, user)
        patient_id = invoice.paciente_id
        guard["invoice"] = plain(invoice)
        method = next(
            (
                m
                for m in await facturas.listar_formas_pago(db, user)
                if m.id == args.method_id and m.activo
            ),
            None,
        )
        if not method:
            raise HTTPException(409, "La forma de pago no está disponible.")
        field("Factura", f"{invoice.serie}-{invoice.numero}")
        field("Importe", f"{args.amount:.2f} €")
        field("Forma de pago", method.nombre)
        guard["method"] = method.nombre
    if patient_id:
        patient = await pacientes.obtener_paciente(patient_id, db, user)
        fields.insert(
            0,
            {
                "label": "Paciente",
                "value": f"{patient.nombre} {patient.apellidos} · H{patient.num_historial}",
            },
        )
        guard["patient_clinic"] = str(patient.clinica_id)
        if getattr(args, "professional_id", None):
            await validate_history_links(
                db,
                paciente=await get_history_patient_or_404(db, patient_id),
                current_user=user,
                doctor_id=args.professional_id,
            )
            field("Profesional", names.get(str(args.professional_id), "Profesional seleccionado"))
    if tool.name in {"create_budget", "record_performed_treatment"}:
        catalog = {x.id: x for x in await catalogo.listar_tratamientos(db, user, None, True, None)}
        prices, total = [], 0
        for line in args.lines if tool.name == "create_budget" else [args]:
            item = catalog.get(line.treatment_id)
            if not item:
                raise HTTPException(409, "El tratamiento ya no está disponible.")
            if item.requiere_pieza and not line.tooth:
                raise HTTPException(422, f"Indica la pieza de {item.nombre}.")
            if item.requiere_caras and not line.surfaces:
                raise HTTPException(
                    422,
                    f"Indica las caras dentales de {item.nombre} antes de preparar el cambio.",
                )
            prices.append({"id": str(item.id), "price": f"{item.precio:.2f}", "name": item.nombre})
            total += item.precio
            field(
                "Tratamiento",
                f"{item.nombre}"
                + (f" · pieza {line.tooth}" if line.tooth else "")
                + (f" · caras {line.surfaces}" if line.surfaces else "")
                + f" · {item.precio:.2f} €",
            )
        guard["prices"] = prices
        if tool.name == "create_budget":
            field("Total presupuesto", f"{total:.2f} €")
        else:
            field("Importe del acto", f"{args.amount if args.amount is not None else total:.2f} €")
            field("Fecha de realización", args.day.strftime("%d/%m/%Y"))
            field("Observaciones", args.notes)
    if getattr(args, "start", None):
        field("Nueva fecha y hora", clinic_datetime(args.start).strftime("%d/%m/%Y · %H:%M"))
    for key, label in (
        ("duration", "Duración (min)"),
        ("reason", "Motivo"),
        ("text", "Nota clínica"),
        ("tooth", "Pieza"),
    ):
        field(label, getattr(args, key, None))
    label = "Confirmar " + LABELS[tool.name].lower()
    if tool.name == "register_payment":
        label = f"Confirmar cobro de {args.amount:.2f} € · {method.nombre}"
    return {"title": LABELS[tool.name], "risk": tool.risk, "fields": fields}, guard, label
