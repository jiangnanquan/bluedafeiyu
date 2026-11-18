"""Fit oversized WebP thumbnails to the gallery's transfer budget."""
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from generate_image_derivatives import write_derivative

MAX_BYTES = 100_000
ENCODE_SETTINGS = ((384, 80, 24), (320, 74, 16), (240, 70, 12), (192, 65, 8), (128, 60, 6), (96, 55, 2))


def fit_previews(directory: Path) -> int:
    updated = 0
    for preview in sorted(directory.rglob("*.webp")):
        if preview.stat().st_size < MAX_BYTES:
            continue
        with TemporaryDirectory(dir=preview.parent) as temporary:
            candidate = Path(temporary) / preview.name
            for edge, quality, frames in ENCODE_SETTINGS:
                write_derivative(preview, candidate, edge, quality, frames, method=2)
                if candidate.stat().st_size < MAX_BYTES:
                    candidate.replace(preview)
                    updated += 1
                    break
            else:
                raise ValueError(f"Gallery thumbnail exceeds {MAX_BYTES} bytes: {preview}")
    return updated


if __name__ == "__main__":
    print(f"[preview-assets] optimized {sum(fit_previews(Path(arg)) for arg in sys.argv[1:])} thumbnails")
