"""Read local derivative dimensions without reading or changing originals."""
from __future__ import annotations

import json
import os
import stat
import sys
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import unquote

from PIL import Image, __version__ as PILLOW_VERSION


def dimensions(root: Path, names: list[str], cached: dict | None = None,
               updates: dict | None = None) -> dict[str, list[int]]:
    root = root.resolve()
    cached = cached or {}
    result = {}
    for name in dict.fromkeys(names):
        source = (root / unquote(name).lstrip("/")).resolve()
        if not source.is_relative_to(root):
            raise ValueError(f"image path escapes staged assets: {name}")
        if source.suffix.lower() == ".svg":
            continue
        try:
            info = source.stat()
        except (FileNotFoundError, NotADirectoryError):
            continue
        if not stat.S_ISREG(info.st_mode):
            continue
        stamp = [info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns]
        entry = cached.get(name)
        if (isinstance(entry, list) and len(entry) == 2 and entry[0] == stamp
                and isinstance(entry[1], list) and len(entry[1]) == 2
                and all(type(value) is int and value > 0 for value in entry[1])):
            size = entry[1]
        else:
            with Image.open(source) as image:
                size = [image.width, image.height]
        result[name] = size
        if updates is not None:
            updates[name] = [stamp, size]
    return result


def build_inventory(root: Path, names: list[str], cache: Path | None) -> dict[str, list[int]]:
    version = [1, PILLOW_VERSION]
    previous = {}
    if cache:
        try:
            state = json.loads(cache.read_text(encoding="utf-8"))
            if state.get("version") == version and isinstance(state.get("images"), dict):
                previous = state["images"]
        except (OSError, ValueError, AttributeError):
            pass
    updates = {}
    result = dimensions(root, names, previous, updates)
    if cache and updates != previous:
        cache.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(mode="w", encoding="utf-8", dir=cache.parent, delete=False) as handle:
            temporary = Path(handle.name)
            json.dump({"version": version, "images": updates}, handle, separators=(",", ":"))
        try:
            os.replace(temporary, cache)
        finally:
            temporary.unlink(missing_ok=True)
    return result


if __name__ == "__main__":
    cache_file = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    print(json.dumps(build_inventory(Path(sys.argv[1]), json.load(sys.stdin), cache_file), separators=(",", ":")))
