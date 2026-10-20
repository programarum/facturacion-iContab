#!/usr/bin/env python3
"""Create a source archive that can be built on a Windows machine."""

from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_DIRECTORIES = {
    ".git",
    ".idea",
    ".venv",
    "__pycache__",
    "dist",
    "gen",
    "node_modules",
    "target",
    "venv",
}
EXCLUDED_SUFFIXES = {
    ".log",
    ".pem",
    ".p12",
    ".pfx",
    ".key",
    ".keystore",
}
EXCLUDED_NAMES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
    ".DS_Store",
    "id_rsa",
    "id_ed25519",
}


def omit(path: Path, output: Path) -> bool:
    relative = path.relative_to(PROJECT_ROOT)
    if any(part in EXCLUDED_DIRECTORIES for part in relative.parts):
        return True
    if path.is_symlink() or path.resolve() == output:
        return True
    if path.name in EXCLUDED_NAMES or path.suffix.lower() in EXCLUDED_SUFFIXES:
        return True
    if path.name.startswith(".env.") and path.name != ".env.example":
        return True
    if path.name.endswith(".local") or path.name.endswith(".secret"):
        return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Comprime el código fuente y archivos necesarios para compilar iContab en Windows."
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=PROJECT_ROOT.parent / f"{PROJECT_ROOT.name}-windows.zip",
        help="Ruta del ZIP resultante (por defecto, junto a la carpeta del proyecto).",
    )
    args = parser.parse_args()

    output = args.output.expanduser().resolve()
    if output == PROJECT_ROOT or PROJECT_ROOT in output.parents:
        print("El ZIP de salida debe guardarse fuera de la carpeta del proyecto.", file=sys.stderr)
        return 2

    output.parent.mkdir(parents=True, exist_ok=True)
    files = [
        path
        for path in PROJECT_ROOT.rglob("*")
        if path.is_file() and not omit(path, output)
    ]
    if not files:
        print("No se encontraron archivos para empaquetar.", file=sys.stderr)
        return 1

    with zipfile.ZipFile(
        output,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=6,
    ) as archive:
        for path in sorted(files):
            archive_name = Path(PROJECT_ROOT.name) / path.relative_to(PROJECT_ROOT)
            archive.write(path, archive_name.as_posix())

    print(f"Paquete Windows creado: {output}")
    print(f"Archivos incluidos: {len(files)}")
    print(f"Tamaño: {output.stat().st_size / (1024 * 1024):.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
