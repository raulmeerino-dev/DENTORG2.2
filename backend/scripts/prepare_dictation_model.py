"""Explicit one-time provisioning: python -m scripts.prepare_dictation_model."""
from pathlib import Path

from app.config import get_settings


def main():
    from faster_whisper import WhisperModel

    settings = get_settings()
    model = settings.clinical_dictation_local_model
    if Path(model).is_absolute() and not Path(model).exists():
        raise SystemExit("Indica el nombre de un modelo descargable o una carpeta local existente.")
    WhisperModel(model, device="cpu", compute_type="int8", cpu_threads=4)
    print("Modelo de dictado preparado. El audio clínico se procesará localmente.")


if __name__ == "__main__":
    main()
