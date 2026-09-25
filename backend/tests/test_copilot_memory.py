from uuid import uuid4

from app.domains.ai.application.copilot_memory import prompt_references, remember_references


def test_references_are_bounded_ordered_and_exclude_clinical_payloads():
    ids = [str(uuid4()) for _ in range(12)]
    state = {"known": ids}
    remember_references(state, {"patients": [
        {"id": id, "name": f"Paciente {i}", "history_number": i, "health": "private payload"}
        for i, id in enumerate(ids)
    ]})
    patients = prompt_references(state)["patients"]
    assert len(patients) == 8
    assert [p["id"] for p in patients] == ids[:8]
    assert all(set(p) == {"id", "name", "history_number"} for p in patients)
    state["known"] = ids[1:]
    assert ids[0] not in str(prompt_references(state))


def test_new_search_replaces_candidates_instead_of_resolving_one_implicitly():
    state = {"known": []}
    remember_references(state, {"patients": [{"id": str(uuid4()), "name": "Antes"}]})
    remember_references(state, {"patients": []})
    assert prompt_references(state)["patients"] == []
