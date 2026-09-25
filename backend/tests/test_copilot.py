"""Exercise the real tool services, policy and PostgreSQL confirmation transaction.

The scripted model replaces only inference, not permissions or business services.
"""

import asyncio
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.permissions import TokenData
from app.domains.ai.application import copilot
from app.domains.ai.application.copilot_lifecycle import await_turn
from app.domains.ai.application.copilot_provider import ProviderUnavailable, strict_schema
from app.domains.ai.application.copilot_tools import TOOLS
from app.domains.ai.application.copilot_workspace import workspace_knowledge
from app.domains.ai.persistence.copilot import CopilotSession
from app.domains.ai.schemas import copilot as S
from app.domains.clinical.persistence.historial import HistorialClinico, NotaDental
from app.domains.clinical.persistence.tratamiento import FamiliaTratamiento, TratamientoCatalogo
from app.domains.identity.persistence.clinica import Clinica
from app.domains.identity.persistence.doctor import Doctor
from app.domains.identity.persistence.usuario import Usuario
from app.domains.patients.persistence.paciente import Paciente
from app.domains.scheduling.persistence.cita import Cita

pytestmark = pytest.mark.asyncio


class ScriptedModel:
    name = "test-provider"
    model = "scripted-tools"

    def __init__(self, calls=(), fail=False):
        self.calls = calls
        self.fail = fail
        self.count = 0

    async def complete(self, system, messages, tools):
        self.count += 1
        if self.fail:
            raise ProviderUnavailable()
        if self.count == 1 and self.calls:
            return {
                "role": "assistant",
                "content": "",
                "calls": [
                    {"id": str(uuid4()), "name": name, "arguments": args}
                    for name, args in self.calls
                ],
            }
        return {"role": "assistant", "content": "Revisión terminada.", "calls": []}


async def fixture(db):
    clinic = Clinica(nombre=f"Copilot {uuid4().hex[:8]}")
    db.add(clinic)
    await db.flush()
    account = Usuario(
        username=f"copilot-{uuid4().hex[:8]}",
        nombre="Profesional QA",
        password_hash="unused-test-account",
        rol="admin",
        activo=True,
        clinica_id=clinic.id,
    )
    patient = Paciente(nombre="Paciente", apellidos="Copilot", clinica_id=clinic.id)
    doctor = Doctor(nombre=f"Doctor QA {uuid4().hex[:8]}", clinica_id=clinic.id, activo=True)
    family = FamiliaTratamiento(nombre="Prueba", activo=True)
    db.add_all([account, patient, doctor, family])
    await db.flush()
    treatment = TratamientoCatalogo(
        familia_id=family.id,
        codigo=f"AI-{uuid4().hex[:8]}",
        nombre="Obturación QA",
        precio=60,
        iva_porcentaje=0,
        requiere_pieza=True,
        requiere_caras=True,
        activo=True,
    )
    db.add(treatment)
    await db.commit()
    user = TokenData(account.id, account.username, account.rol, clinic.id)
    return user, patient, doctor, treatment


def turn(patient, **kwargs):
    return S.CopilotTurn(
        session_id=uuid4(),
        request_id=uuid4(),
        text="Petición de prueba",
        context=S.CopilotContext(module="pacientes", patient_id=patient.id),
        **kwargs,
    )


async def run(db, user, request, calls):
    notes = [args["text"] for name, args in calls if name == "clinical_note"]
    if notes:
        request.text = "Preparar notas dictadas: " + " / ".join(notes)
    return await copilot.run_turn(request, db, user, None, ScriptedModel(calls))


async def confirm(db, user, request, result, decision="confirm"):
    return await copilot.confirm_proposal(
        request.session_id,
        S.CopilotConfirm(proposal_id=result["proposal"]["id"], decision=decision),
        db,
        user,
        None,
    )


async def note_count(db, patient):
    return await db.scalar(
        select(func.count()).select_from(NotaDental).where(NotaDental.paciente_id == patient.id)
    )


async def test_patient_summary_includes_recent_reviewed_notes_with_bounded_context(db_session):
    user, patient, doctor, _ = await fixture(db_session)
    for day in range(1, 8):
        db_session.add(NotaDental(
            paciente_id=patient.id, doctor_id=doctor.id, fecha=date(2026, 9, day),
            texto=f"Nota revisada {day}. " + "x" * 1600, origen="dictado_clinico",
        ))
    await db_session.commit()
    result = await TOOLS["patient_summary"].handler(
        S.PatientReference(patient_id=patient.id), db_session, user, None,
    )
    notes = result["recent_notes"]
    assert len(notes) == 6
    assert notes[0]["text"].startswith("Nota revisada 7.")
    assert len(notes[0]["text"]) == 1500 and notes[0]["text_truncated"]
    assert notes[0]["professional"] == doctor.nombre
    assert notes[-1]["date"] == "2026-09-02"
    assert "tab=sesion" in notes[0]["source"]
    assert "recepcion" not in TOOLS["patient_summary"].roles
    with pytest.raises(HTTPException) as error:
        await TOOLS["patient_summary"].handler(
            S.PatientReference(patient_id=patient.id), db_session,
            TokenData(user.user_id, user.username, "doctor", uuid4()), None,
        )
    assert error.value.status_code == 403


async def test_navigation_and_request_retry_are_idempotent(db_session):
    user, patient, *_ = await fixture(db_session)
    request = turn(patient)
    result = await run(
        db_session,
        user,
        request,
        [
            (
                "navigate",
                {"module": "pacientes", "patient_id": str(patient.id), "section": "historial"},
            )
        ],
    )
    assert "tab=historial" in result["navigation"]
    assert result["navigation"].startswith("/pacientes?")
    canonical = await TOOLS["navigate"].handler(
        S.Navigate(module="jornada", patient_id=patient.id, section="historial"),
        db_session,
        user,
        None,
    )
    assert canonical["navigation"] == result["navigation"]
    semantic = await TOOLS["navigate"].handler(
        S.Navigate(module="historial", patient_id=patient.id), db_session, user, None
    )
    assert semantic["navigation"] == canonical["navigation"]
    assert result["proposal"] is None
    unavailable = ScriptedModel(fail=True)
    assert await copilot.run_turn(request, db_session, user, None, unavailable) == result
    assert unavailable.count == 0
    with pytest.raises(HTTPException) as error:
        await copilot.run_turn(
            request.model_copy(update={"text": "Otra petición"}),
            db_session,
            user,
            None,
            unavailable,
        )
    assert error.value.status_code == 409


@pytest.mark.parametrize("decision", ["confirm", "cancel"])
async def test_note_requires_confirmation_and_retries_never_duplicate(db_session, decision):
    user, patient, *_ = await fixture(db_session)
    request = turn(patient)
    result = await run(
        db_session,
        user,
        request,
        [
            (
                "clinical_note",
                {"patient_id": str(patient.id), "text": "Sin molestias referidas.", "tooth": "14"},
            )
        ],
    )
    assert result["proposal"] and await note_count(db_session, patient) == 0
    saved = await confirm(db_session, user, request, result, decision)
    assert await confirm(db_session, user, request, result, decision) == saved
    assert await note_count(db_session, patient) == (1 if decision == "confirm" else 0)
    if decision == "confirm":
        assert any("tab=sesion" in source["path"] for source in saved["sources"])


@pytest.mark.parametrize("decision", ["confirm", "cancel"])
async def test_write_then_open_only_navigates_after_successful_confirmation(db_session, decision):
    user, patient, *_ = await fixture(db_session)
    request = turn(patient)
    result = await run(db_session, user, request, [
        ("clinical_note", {"patient_id": str(patient.id), "text": "Control de prueba"}),
        ("navigate", {"module": "documentos", "patient_id": str(patient.id)}),
    ])
    assert result["proposal"] and result["navigation"] is None
    saved = await confirm(db_session, user, request, result, decision)
    assert bool(saved.get("navigation")) is (decision == "confirm")
    if decision == "confirm":
        assert "tab=documentos" in saved["navigation"]


async def test_followup_has_ordered_references_without_old_tool_payloads(db_session):
    user, patient, *_ = await fixture(db_session)
    patient.nombre = f"Álvaro {uuid4().hex[:8]}"
    patient.apellidos = "García López"
    await db_session.commit()
    request = turn(patient)
    query = f"garcia lopez {patient.nombre.replace('Á', 'A')}"
    await run(db_session, user, request, [("search_patients", {"query": query})])
    session, state = await copilot.session_state(db_session, user, request.session_id)
    references = state["references"]["patients"]
    assert references and str(patient.id) in [r["id"] for r in references]
    by_history = await TOOLS["search_patients"].handler(S.SearchPatients(query=f"H{patient.num_historial}"), db_session, user, None)
    assert [r["id"] for r in by_history["patients"]] == [str(patient.id)]
    assert not (await TOOLS["search_patients"].handler(S.SearchPatients(query="9999999999"), db_session, user, None))["patients"]
    state["messages"].append({"role": "tool", "content": "LARGE_OLD_TOOL_PAYLOAD"})
    await copilot.save_state(db_session, session, state)
    await db_session.commit()

    class FollowUp(ScriptedModel):
        async def complete(self, system, messages, tools):
            assert str(patient.id) in system and "history_number" in system
            assert "LARGE_OLD_TOOL_PAYLOAD" not in str(messages)
            assert "Referencias anteriores" in system
            return await super().complete(system, messages, tools)

    await copilot.run_turn(request.model_copy(update={"request_id": uuid4(), "text": "El segundo"}),
                           db_session, user, None, FollowUp())


async def test_patient_change_discards_draft_but_preserves_conversation(db_session):
    user, patient, *_ = await fixture(db_session)
    request = turn(patient)
    first = await run(db_session, user, request, [
        ("clinical_note", {"patient_id": str(patient.id), "text": "BORRADOR_ANTERIOR"}),
    ])
    other = Paciente(nombre="Nuevo", apellidos="Paciente", clinica_id=user.clinica_id)
    db_session.add(other)
    await db_session.commit()

    class PatientChanged(ScriptedModel):
        async def complete(self, system, messages, tools):
            assert "BORRADOR_ANTERIOR" not in system
            assert str(other.id) in system
            assert sum(m["role"] == "user" for m in messages) == 2
            return await super().complete(system, messages, tools)

    await copilot.run_turn(request.model_copy(update={
        "request_id": uuid4(), "text": "¿Qué puedo hacer aquí?",
        "context": S.CopilotContext(module="pacientes", patient_id=other.id),
    }), db_session, user, None, PatientChanged())
    with pytest.raises(HTTPException) as error:
        await confirm(db_session, user, request, first)
    assert error.value.status_code == 409
    assert await note_count(db_session, patient) == 0


async def test_workspace_knowledge_and_tools_are_filtered_by_real_role(db_session):
    user, patient, doctor, _ = await fixture(db_session)
    account = await db_session.get(Usuario, user.user_id)
    account.doctor_id = doctor.id
    await db_session.commit()
    context = await copilot.context_for(db_session, user, turn(patient).context, {"known": [], "names": {}})
    assert context["own_professional"]["id"] == str(doctor.id)
    for role in ["admin", "doctor", "auxiliar", "recepcion"]:
        actor = TokenData(user.user_id, user.username, role, user.clinica_id)
        knowledge = workspace_knowledge(actor)
        financial = role in {"admin", "recepcion"}
        assert ("facturas" in knowledge["record_views"]) is financial
        assert ("economia" in knowledge["patient_editors"]) is financial
        tools = {t["name"]: t for t in copilot.available_tools(actor)}
        assert ("register_payment" in tools) is financial
        assert "section" not in tools["navigate"]["parameters"]["properties"]
        assert ("facturas" in tools["search_records"]["parameters"]["properties"]["view"]["enum"]) is financial
    for area, tab in [("sesion", "sesion"), ("visitas", "visitas"), ("economia", "facturacion")]:
        result = await TOOLS["navigate"].handler(S.Navigate(module=area, patient_id=patient.id), db_session, user, None)
        assert f"tab={tab}" in result["navigation"]


async def test_model_discovers_only_needed_tools_for_each_request(db_session):
    user, patient, *_ = await fixture(db_session)
    request = turn(patient)

    class Discovery(ScriptedModel):
        async def complete(self, system, messages, tools):
            names = {t["name"] for t in tools}
            if not self.count:
                assert "get_schedule" not in names and "navigate" in names
            else:
                assert "get_schedule" in names and "register_payment" not in names
            return await super().complete(system, messages, tools)

    await copilot.run_turn(request, db_session, user, None,
                           Discovery([("discover_tools", {"groups": ["agenda"]})]))
    await copilot.run_turn(request.model_copy(update={"request_id": uuid4()}), db_session, user, None,
                           Discovery([("discover_tools", {"groups": ["agenda"]})]))
    doctor = TokenData(user.user_id, user.username, "doctor", user.clinica_id)
    with pytest.raises(HTTPException) as error:
        await TOOLS["discover_tools"].handler(S.DiscoverTools(groups=["economia"]), db_session, doctor, None)
    assert error.value.status_code == 403


async def test_unsupplied_note_content_never_becomes_a_confirmation(db_session):
    user, patient, *_ = await fixture(db_session)
    request = turn(patient).model_copy(update={"text": "Apunta control sin molestias"})
    result = await copilot.run_turn(request, db_session, user, None, ScriptedModel([
        ("clinical_note", {"patient_id": str(patient.id), "text": "Control sin molestias. Radiografía normal."}),
    ]))
    assert result["proposal"] is None
    assert await note_count(db_session, patient) == 0


async def test_multi_action_plan_rolls_back_even_services_that_commit(db_session, monkeypatch):
    user, patient, *_ = await fixture(db_session)
    request = turn(patient)
    result = await run(
        db_session,
        user,
        request,
        [
            ("clinical_note", {"patient_id": str(patient.id), "text": text})
            for text in ["Primera", "Segunda"]
        ],
    )
    original = TOOLS["clinical_note"]

    async def committing_then_failing(args, db, actor, http_request):
        if args.text == "Segunda":
            raise HTTPException(409, "Conflicto simulado")
        output = await original.handler(args, db, actor, http_request)
        await db.commit()
        return output

    monkeypatch.setitem(TOOLS, "clinical_note", replace(original, handler=committing_then_failing))
    saved = await confirm(db_session, user, request, result)
    assert saved["saved"] is False
    assert await note_count(db_session, patient) == 0


async def known_catalog(db, user, request, doctor, treatment):
    session, state = await copilot.session_state(db, user, request.session_id)
    rows = await TOOLS["search_treatments"].handler(
        S.SearchPatients(query=treatment.codigo), db, user, None
    )
    doctors = await TOOLS["search_professionals"].handler(
        S.SearchProfessionals(query=doctor.nombre), db, user, None
    )
    copilot.remember_entities(state, rows)
    copilot.remember_entities(state, doctors)
    await copilot.save_state(db, session, state)
    await db.commit()


async def test_actual_treatment_confirmation_preserves_zero_amount(db_session):
    user, patient, doctor, treatment = await fixture(db_session)
    request = turn(patient)
    await known_catalog(db_session, user, request, doctor, treatment)
    result = await run(
        db_session,
        user,
        request,
        [
            (
                "record_performed_treatment",
                {
                    "patient_id": str(patient.id),
                    "professional_id": str(doctor.id),
                    "treatment_id": str(treatment.id),
                    "tooth": 14,
                    "surfaces": "O",
                    "day": date.today().isoformat(),
                    "amount": 0,
                    "notes": "Control QA",
                },
            )
        ],
    )
    assert result["proposal"]
    saved = await confirm(db_session, user, request, result)
    assert saved["saved"] is True, saved
    assert await confirm(db_session, user, request, result) == saved
    rows = list(
        (
            await db_session.scalars(
                select(HistorialClinico).where(HistorialClinico.paciente_id == patient.id)
            )
        ).all()
    )
    assert len(rows) == 1 and rows[0].importe == 0 and rows[0].factura_id is None


async def test_budget_price_change_requires_new_review(db_session):
    user, patient, doctor, treatment = await fixture(db_session)
    request = turn(patient)
    await known_catalog(db_session, user, request, doctor, treatment)
    result = await run(
        db_session,
        user,
        request,
        [
            (
                "create_budget",
                {
                    "patient_id": str(patient.id),
                    "professional_id": str(doctor.id),
                    "lines": [{"treatment_id": str(treatment.id), "tooth": 14, "surfaces": "O"}],
                },
            )
        ],
    )
    assert result["proposal"]
    treatment.precio = 100
    await db_session.commit()
    saved = await confirm(db_session, user, request, result)
    assert saved["saved"] is False and "cambiado" in saved["message"]


async def test_unknown_ids_wrong_roles_and_cross_clinic_are_denied(db_session):
    user, patient, *_ = await fixture(db_session)
    with pytest.raises(HTTPException):
        copilot.validate_call(
            "clinical_note", {"patient_id": str(uuid4()), "text": "No"}, user, {"known": []}
        )
    with pytest.raises(HTTPException):
        copilot.validate_call(
            "register_payment", {}, TokenData(user.user_id, "doctor", "doctor"), {"known": []}
        )
    other = Clinica(nombre="Otra clínica")
    db_session.add(other)
    await db_session.flush()
    foreign = Paciente(nombre="Ajeno", apellidos="QA", clinica_id=other.id)
    db_session.add(foreign)
    account = await db_session.get(Usuario, user.user_id)
    account.rol = "doctor"
    await db_session.commit()
    user.rol = "doctor"
    with pytest.raises(HTTPException) as error:
        await run(db_session, user, turn(foreign), [])
    assert error.value.status_code in {403, 404}


async def test_expired_proposal_cannot_execute(db_session):
    user, patient, *_ = await fixture(db_session)
    request = turn(patient)
    result = await run(
        db_session,
        user,
        request,
        [("clinical_note", {"patient_id": str(patient.id), "text": "Borrador"})],
    )
    session = await db_session.get(CopilotSession, request.session_id)
    session.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db_session.commit()
    with pytest.raises(HTTPException) as error:
        await confirm(db_session, user, request, result)
    assert error.value.status_code == 409
    assert await note_count(db_session, patient) == 0


async def test_provider_outage_has_no_simulated_fallback(db_session):
    user, patient, *_ = await fixture(db_session)
    result = await copilot.run_turn(turn(patient), db_session, user, None, ScriptedModel(fail=True))
    assert result["unavailable"] is True and result["proposal"] is None
    assert result["navigation"] is None and await note_count(db_session, patient) == 0


async def test_dense_schedule_has_real_totals_and_bounded_named_details(db_session):
    user, patient, doctor, _ = await fixture(db_session)
    start = datetime(2026, 9, 25, 8, tzinfo=timezone.utc)
    for i in range(35):
        db_session.add(Cita(
            clinica_id=user.clinica_id, paciente_id=patient.id, doctor_id=doctor.id,
            fecha_hora=start + timedelta(minutes=i * 10), duracion_min=10,
            estado="confirmada" if i < 30 else "atendida",
            finalizada_at=start if i >= 30 else None,
        ))
    await db_session.commit()
    # A day is sufficient for a read: the model need not invent a time or ask for it.
    args = S.Schedule(start="2026-09-25", end="2026-09-25", patient_id=patient.id)
    assert args.start.tzinfo and args.start.hour == 0
    assert args.end.hour == 23 and args.end.minute == 59
    result = await TOOLS["get_schedule"].handler(args, db_session, user, None)
    assert result["total"] == 35 and result["truncated"]
    assert result["counts_by_status"] == {"confirmada": 30, "finalizada": 5}
    assert result["pending_checkout"] == 5
    assert len(result["appointments"]) == 8
    assert result["appointments"][0]["patient"] == "Paciente Copilot"
    assert result["appointments"][0]["professional"] == doctor.nombre


async def test_cancelled_inference_releases_session_and_allows_retry(db_session):
    from types import SimpleNamespace

    user, patient, *_ = await fixture(db_session)
    request = turn(patient)
    started = asyncio.Event()

    class WaitingModel(ScriptedModel):
        async def complete(self, *args):
            started.set()
            await asyncio.Event().wait()

    async def disconnected():
        await started.wait()
        return {"type": "http.disconnect"}

    with pytest.raises(HTTPException) as error:
        await await_turn(
            copilot.run_turn(request, db_session, user, None, WaitingModel()),
            SimpleNamespace(receive=disconnected), db_session,
        )
    assert error.value.status_code == 499
    async with asyncio.timeout(2):
        result = await copilot.run_turn(request, db_session, user, None, ScriptedModel())
    assert result["message"] == "Revisión terminada."


async def test_new_turn_retrieves_facts_instead_of_replaying_old_tool_payloads(db_session):
    user, patient, *_ = await fixture(db_session)
    request = turn(patient)
    await run(db_session, user, request, [("patient_summary", {"patient_id": str(patient.id)})])

    class CheckingModel(ScriptedModel):
        async def complete(self, system, messages, tools):
            assert all(m["role"] in {"user", "assistant"} for m in messages)
            assert all(not m.get("calls") and not m.get("native_output") for m in messages)
            assert messages[-1]["content"] == "Continúa"
            return await super().complete(system, messages, tools)

    await copilot.run_turn(
        request.model_copy(update={"request_id": uuid4(), "text": "Continúa"}),
        db_session, user, None, CheckingModel(),
    )


async def test_ambiguous_search_stops_before_selecting_or_preparing_changes(
    db_session, monkeypatch
):
    user, patient, *_ = await fixture(db_session)
    original = TOOLS["search_patients"]

    async def matches(args, db, actor, request):
        return {
            "patients": [
                {
                    "id": str(patient.id),
                    "name": "Ana Norte",
                    "source": "/pacientes?paciente_id=" + str(patient.id),
                },
                {"id": str(uuid4()), "name": "Ana Sur"},
            ]
        }

    monkeypatch.setitem(TOOLS, "search_patients", replace(original, handler=matches))
    provider = ScriptedModel(
        [
            ("search_patients", {"query": "Ana"}),
            ("clinical_note", {"patient_id": str(patient.id), "text": "No guardar"}),
        ]
    )
    result = await copilot.run_turn(turn(patient), db_session, user, None, provider)
    assert provider.count == 1
    assert result["proposal"] is None and result["navigation"] is None
    assert "varios pacientes" in result["message"] and len(result["sources"]) == 1
    assert await note_count(db_session, patient) == 0


async def test_contracts_require_timezone_and_strict_tools():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        S.Schedule(start="2026-09-25T10:00:00", end="2026-09-25T11:00:00+02:00")
    with pytest.raises(ValidationError):
        S.BudgetLine(treatment_id=UUID(int=1), tooth=49)
    schema = strict_schema(S.Slots.model_json_schema())
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"])
