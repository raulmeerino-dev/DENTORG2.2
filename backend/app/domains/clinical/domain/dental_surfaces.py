"""Canonical dental surface codes shared by plans, sessions and chart context."""

CARAS_TO_SURFACES = {
    "O": "oclusal_incisal",
    "I": "oclusal_incisal",
    "M": "mesial",
    "D": "distal",
    "V": "vestibular",
    "B": "vestibular",
    "L": "lingual_palatina",
    "P": "lingual_palatina",
    "R": "raiz",
}


def normalize_caras(caras: str | None) -> str | None:
    if not caras:
        return None
    return "".join(dict.fromkeys(caras.upper().strip()))


def surfaces_from_caras(caras: str | None) -> list[str]:
    normalized = normalize_caras(caras)
    if not normalized:
        return ["oclusal_incisal"]
    surfaces: list[str] = []
    for char in normalized:
        surface = CARAS_TO_SURFACES.get(char)
        if surface and surface not in surfaces:
            surfaces.append(surface)
    return surfaces or ["oclusal_incisal"]
