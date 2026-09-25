import pytest
from fastapi import HTTPException

from app.domains.ai.application.copilot_grounding import validate_dictated_note


def test_punctuation_accents_and_explicit_corrections_preserve_the_dictation():
    validate_dictated_note("Sensibilidad al frío en la pieza 24.", [
        "Apunta sensibilidad al frio en la pieza 14", "Mejor pieza 24, no 14",
    ])


@pytest.mark.parametrize("note", [
    "Control sin molestias. No hay cambios en la salud oral.",
    "Documentos revisados. Consentimiento firmado el 15 de septiembre.",
])
def test_model_cannot_expand_dictation_with_unsupplied_findings_or_dates(note):
    with pytest.raises(HTTPException) as error:
        validate_dictated_note(note, ["Dos notas: control sin molestias y documentos revisados"])
    assert error.value.status_code == 422
