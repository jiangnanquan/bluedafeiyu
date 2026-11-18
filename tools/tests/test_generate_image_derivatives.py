from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))

import generate_image_derivatives as derivatives  # noqa: E402
from prepare_preview_assets import MAX_BYTES, fit_previews  # noqa: E402


class GalleryPreviewBudgetTests(unittest.TestCase):
    def test_animated_preview_retains_loop_and_duration_under_budget(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            preview = root / "animated.webp"
            durations = [30, 70, 120, 280] * 3
            frames = [Image.effect_noise((480, 320), 80).convert("RGB") for _ in durations]
            frames[0].save(preview, format="WEBP", save_all=True, append_images=frames[1:],
                           duration=durations, loop=2, quality=95, method=0)
            self.assertGreater(preview.stat().st_size, MAX_BYTES)
            small = root / "small.webp"
            Image.new("RGB", (20, 20), "white").save(small)
            original_small = small.read_bytes()
            self.assertEqual(fit_previews(root), 1)
            self.assertLess(preview.stat().st_size, MAX_BYTES)
            self.assertEqual(small.read_bytes(), original_small)
            with Image.open(preview) as image:
                self.assertGreater(image.n_frames, 1)
                self.assertEqual(image.info["loop"], 2)
                total = 0
                for index in range(image.n_frames):
                    image.seek(index)
                    image.load()
                    total += image.info["duration"]
                self.assertEqual(total, sum(durations))


class GenerateSubmissionsWithoutOriginalsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.root = Path(self.temp_dir.name)
        self.content = self.root / "content"
        self.manifest = self.root / "works.json"
        self.original_manifest = derivatives.SUBMISSIONS_MANIFEST
        self.addCleanup(self.restore_manifest)
        derivatives.configure_paths(self.content)
        derivatives.SUBMISSIONS_MANIFEST = self.manifest

    def restore_manifest(self) -> None:
        derivatives.SUBMISSIONS_MANIFEST = self.original_manifest

    def write_manifest(self, record: dict[str, str]) -> None:
        self.manifest.write_text(json.dumps([record], ensure_ascii=False), encoding="utf-8")

    def write_derivative(self, relative_path: str, size: tuple[int, int]) -> None:
        path = self.content / "dist" / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", size, "white").save(path, format="WEBP")

    def test_existing_derivatives_succeed_without_original(self) -> None:
        record = {
            "id": "sticker_test",
            "characterId": "deepseek",
            "path": "/submissions/originals/deepseek/source.png",
        }
        self.write_manifest(record)
        self.write_derivative("submissions/previews/deepseek/source.webp", (7, 5))
        self.write_derivative("submissions/large/deepseek/source.webp", (11, 9))

        result = derivatives.generate_submissions()

        self.assertEqual(result, (1, 2, 0))
        self.assertFalse(
            (self.content / "dist/submissions/originals/deepseek/source.png").exists()
        )
        saved = json.loads(self.manifest.read_text(encoding="utf-8"))
        self.assertEqual(
            saved[0]["thumbnailPath"], "submissions/previews/deepseek/source.webp"
        )
        self.assertEqual(saved[0]["fullPath"], "submissions/large/deepseek/source.webp")

    def test_missing_original_fails_when_derivative_is_needed(self) -> None:
        self.write_manifest(
            {
                "id": "sticker_test",
                "characterId": "deepseek",
                "path": "/submissions/originals/deepseek/source.png",
            }
        )

        with self.assertRaisesRegex(FileNotFoundError, "source image not found"):
            derivatives.generate_submissions()

    def test_character_correction_keeps_existing_media_without_original(self) -> None:
        self.write_manifest({
            "id": "sticker_reclassified", "characterId": "doubao",
            "path": "https://raw.githubusercontent.com/lmy414/ai-girl-stickers/main/dist/submissions/originals/other/source.png",
        })
        self.write_derivative("submissions/previews/other/source.webp", (7, 5))
        self.write_derivative("submissions/large/other/source.webp", (11, 9))
        before = {file: file.read_bytes() for file in self.content.rglob("*.webp")}

        self.assertEqual(derivatives.generate_submissions(), (1, 2, 0))
        saved = json.loads(self.manifest.read_text(encoding="utf-8"))[0]
        self.assertEqual(saved["characterId"], "doubao")
        self.assertEqual(saved["thumbnailPath"], "submissions/previews/other/source.webp")
        self.assertEqual(saved["fullPath"], "submissions/large/other/source.webp")
        self.assertEqual({file: file.read_bytes() for file in self.content.rglob("*.webp")}, before)

    def test_character_correction_generates_from_recorded_original(self) -> None:
        self.write_manifest({
            "id": "sticker_reclassified", "characterId": "doubao",
            "path": "dist/submissions/originals/other/source.png",
        })
        source = self.content / "dist/submissions/originals/other/source.png"
        source.parent.mkdir(parents=True)
        Image.new("RGB", (12, 8), "blue").save(source)
        before = source.read_bytes()

        self.assertEqual(derivatives.generate_submissions(), (1, 2, 0))
        self.assertEqual(source.read_bytes(), before)
        self.assertTrue((self.content / "dist/submissions/previews/other/source.webp").is_file())
        self.assertTrue((self.content / "dist/submissions/large/other/source.webp").is_file())
        self.assertFalse((self.content / "dist/submissions/previews/doubao").exists())

    def test_reclassified_missing_media_reports_recorded_path(self) -> None:
        self.write_manifest({
            "id": "sticker_reclassified", "characterId": "doubao",
            "path": "/submissions/originals/other/source.png",
        })
        with self.assertRaisesRegex(FileNotFoundError, r"originals[/\\]other[/\\]source\.png"):
            derivatives.generate_submissions()

    def test_source_path_supports_local_and_raw_urls(self) -> None:
        expected = self.content / "dist/submissions/originals/other/source.png"
        for raw in [
            "/submissions/originals/other/source.png",
            "submissions/originals/other/source.png",
            "dist/submissions/originals/other/source.png",
            "https://raw.githubusercontent.com/lmy414/ai-girl-stickers/main/dist/submissions/originals/other/source.png",
        ]:
            with self.subTest(path=raw):
                self.assertEqual(derivatives.submission_source({"path": raw, "characterId": "doubao"}), expected)

    def test_invalid_media_paths_are_rejected(self) -> None:
        for raw in [
            "/submissions/originals/../source.png",
            "/submissions/originals/other/../source.png",
            "/submissions/originals/other/..",
            "/submissions/originals/other\\outside/source.png",
            "/submissions/originals/other/",
            "/unrelated/source.png",
        ]:
            with self.subTest(path=raw), self.assertRaises(ValueError):
                derivatives.submission_source({"path": raw, "characterId": "doubao"})

    def test_retired_records_keep_slug_without_requiring_deleted_images(self) -> None:
        records = [
            {"id": f"sticker_{status}", "slug": f"retired-{status}", "status": status}
            for status in ["hidden", "removed", "deleted"]
        ]
        self.manifest.write_text(json.dumps(records), encoding="utf-8")

        self.assertEqual(derivatives.generate_submissions(), (3, 0, 0))
        self.assertEqual(json.loads(self.manifest.read_text(encoding="utf-8")), records)


if __name__ == "__main__":
    unittest.main()
