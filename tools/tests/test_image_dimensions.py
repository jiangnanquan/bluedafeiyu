import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from image_dimensions import build_inventory, dimensions


class DerivativeDimensionsTests(unittest.TestCase):
    def test_dimensions_come_from_derivatives_and_leave_bytes_unchanged(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "预览 图.webp"
            Image.new("RGB", (30, 100), "blue").save(source)
            original = source.read_bytes()
            names = ["/%E9%A2%84%E8%A7%88%20%E5%9B%BE.webp"] * 2
            self.assertEqual(dimensions(root, names), {names[0]: [30, 100]})
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual(dimensions(root, ["/missing.webp"]), {})

    def test_paths_outside_staged_assets_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, "escapes staged assets"):
                dimensions(Path(temporary), ["/%2E%2E/secret.png"])

    def test_inventory_reuses_unchanged_file_and_reads_replacement(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            image = root / "preview.webp"
            cache = root / ".build" / "dimensions.json"
            Image.new("RGB", (30, 100), "blue").save(image)
            self.assertEqual(build_inventory(root, [image.name], cache), {image.name: [30, 100]})
            with patch("image_dimensions.Image.open", side_effect=AssertionError("opened cached file")):
                self.assertEqual(build_inventory(root, [image.name], cache), {image.name: [30, 100]})
            replacement = root / "replacement.webp"
            Image.new("RGB", (100, 30), "blue").save(replacement)
            replacement.replace(image)
            self.assertEqual(build_inventory(root, [image.name], cache), {image.name: [100, 30]})


if __name__ == "__main__":
    unittest.main()
