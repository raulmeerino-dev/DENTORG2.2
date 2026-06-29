"""Herramienta offline para verificar y extraer backups DentCore.

Uso previsto:
  python -m scripts.backup_tool verify --file backup.dentcorebak --expected-hash ...
  python -m scripts.backup_tool extract --file backup.dentcorebak --output-dir restore-kit
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

from app.services.backup_service import extraer_backup_file, inspeccionar_backup_file


def _write_json(payload: dict, *, error: bool = False) -> None:
    stream = sys.stderr if error else sys.stdout
    stream.write(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
    stream.write("\n")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Verifica o extrae backups cifrados de DentCore.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    verify = subparsers.add_parser("verify", help="Descifra y valida un backup sin extraerlo.")
    verify.add_argument("--file", required=True, type=Path, help="Ruta del fichero .dentcorebak.")
    verify.add_argument("--expected-hash", default=None, help="SHA-256 esperado del fichero cifrado.")

    extract = subparsers.add_parser("extract", help="Extrae database.json y uploads/ a un directorio aislado.")
    extract.add_argument("--file", required=True, type=Path, help="Ruta del fichero .dentcorebak.")
    extract.add_argument("--output-dir", required=True, type=Path, help="Directorio de salida para la prueba.")
    extract.add_argument("--expected-hash", default=None, help="SHA-256 esperado del fichero cifrado.")

    restore_check = subparsers.add_parser(
        "restore-check",
        help="Ensaya una preparacion de restauracion en seco: descifra, extrae y valida el kit.",
    )
    restore_check.add_argument("--file", required=True, type=Path, help="Ruta del fichero .dentcorebak.")
    restore_check.add_argument("--expected-hash", default=None, help="SHA-256 esperado del fichero cifrado.")
    restore_check.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Directorio opcional para conservar el kit extraido; si se omite, usa un temporal.",
    )

    return parser


def _restore_check(path: Path, expected_hash: str | None, output_dir: Path | None) -> dict:
    if output_dir:
        manifest = extraer_backup_file(path, output_dir, expected_hash)
        output = output_dir.expanduser().resolve()
        kept = True
    else:
        with tempfile.TemporaryDirectory(prefix="dentcore-restore-check-") as tmp:
            output = Path(tmp).resolve()
            manifest = extraer_backup_file(path, output, expected_hash)
            _validate_restore_kit(output, manifest)
            return {**manifest, "dry_run": True, "restore_ready": True, "output_dir": None, "kit_conservado": False}

    _validate_restore_kit(output, manifest)
    return {**manifest, "dry_run": True, "restore_ready": True, "output_dir": str(output), "kit_conservado": kept}


def _validate_restore_kit(output_dir: Path, manifest: dict) -> None:
    summary_path = output_dir / "restore-summary.json"
    if not summary_path.exists():
        raise ValueError("restore-summary.json no se genero")
    if int(manifest.get("tablas") or 0) > 0 and not (output_dir / "database.json").exists():
        raise ValueError("database.json no se genero pese a existir tablas")
    if int(manifest.get("uploads") or 0) > 0 and not (output_dir / "uploads").exists():
        raise ValueError("uploads/ no se genero pese a existir ficheros")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.command == "verify":
            _write_json(inspeccionar_backup_file(args.file, args.expected_hash))
            return 0
        if args.command == "extract":
            _write_json(extraer_backup_file(args.file, args.output_dir, args.expected_hash))
            return 0
        if args.command == "restore-check":
            _write_json(_restore_check(args.file, args.expected_hash, args.output_dir))
            return 0
    except Exception as exc:
        _write_json({"ok": False, "error": str(exc)}, error=True)
        return 1

    parser.error("Comando no soportado")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
