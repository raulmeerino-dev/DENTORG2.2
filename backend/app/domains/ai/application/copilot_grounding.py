"""An additional extractive guard for dictated notes, before human review.

This cannot verify clinical meaning or replace review. It rejects vocabulary the
model invented instead of merely trusting a prompt to preserve the dictation.
"""

import re
import unicodedata

from fastapi import HTTPException


def words(text):
    folded = "".join(c for c in unicodedata.normalize("NFKD", text.casefold()) if not unicodedata.combining(c))
    return set(re.findall(r"\w+", folded))


def validate_dictated_note(text, sources):
    supplied = words(" ".join(sources))
    if words(text) - supplied:
        raise HTTPException(422, "La nota incorpora palabras no dictadas. Copia literalmente el contenido clínico aportado por el usuario, sin ampliar, interpretar ni completar datos. Puedes corregir tildes y puntuación. En una corrección, conserva el dictado anterior y cambia sólo lo indicado.")
