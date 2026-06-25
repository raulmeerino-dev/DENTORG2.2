"""Herramienta offline para verificar y extraer backups DentCore.

Uso previsto:
  python -m scripts.backup_tool verify --file backup.dentcorebak --expected-hash ...
  python -m scripts.backup_tool extract --file backup.dentcorebak --output-dir restore-kit
"""

from __future__ import annotations

import argparse
import json
import sys
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

    return parser


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
    except Exception as exc:
        _write_json({"ok": False, "error": str(exc)}, error=True)
        return 1

    parser.error("Comando no soportado")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
