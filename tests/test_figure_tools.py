"""Custom layer names, derived variants and PDF/PNG export.

These cover the workflow of a diagram or figure schematic: layers named for
what they are rather than for a landscape photograph, several variants of
one drawing that differ in exactly one layer, and a vector file a LaTeX or
word-processor document can include.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "redraw-in-layers" / "scripts" / "layered_redraw.py"
SPEC = importlib.util.spec_from_file_location("layered_redraw_figure_tools", SCRIPT)
assert SPEC and SPEC.loader
TOOLS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOLS)

NAMES = ["paper", "frame", "picture", "heading", "notes", "cover-a", "cover-b"]


def _schematic(project: Path) -> None:
    """A synthetic seven-layer page: two cover layers start hidden."""
    TOOLS.create_project(project, title="Synthetic page", layers=len(NAMES), width=100, height=140,
                         layer_names=NAMES)
    svg = project / "artwork.svg"
    text = svg.read_text(encoding="utf-8")
    fills = {
        "paper": '<rect id="paper-sheet" x="0" y="0" width="100" height="140" fill="#ffffff"/>',
        "frame": '<rect id="frame-line" x="6" y="6" width="88" height="128" fill="none" stroke="#000000"/>',
        "picture": '<path id="picture-stroke" d="M12 120 C 30 60 40 100 60 20" fill="none" stroke="#000000"/>',
        "heading": '<rect id="heading-block" x="78" y="12" width="10" height="30" fill="#000000"/>',
        "notes": '<rect id="notes-block" x="80" y="50" width="6" height="70" fill="#000000"/>',
        "cover-a": '<rect id="cover-a-box" x="76" y="10" width="14" height="112" fill="#ffffff"/>',
        "cover-b": '<rect id="cover-b-box" x="20" y="10" width="14" height="112" fill="#ffffff"/>',
    }
    for name, fragment in fills.items():
        placeholder = f'id="layer-{name}"'
        start = text.index(placeholder)
        end = text.index("/>", start)
        head = text[:end].replace(' data-placeholder="true"', "")
        if name.startswith("cover"):
            head += ' display="none"'
        text = head + ">" + fragment + "</g>" + text[end + 2:]
    svg.write_text(text, encoding="utf-8")


def _reveal(project: Path, layer: str) -> Path:
    patch = {
        "schema_version": "1.0",
        "expected_changed_layers": [f"layer-{layer}"],
        "operations": [{"target_id": f"layer-{layer}", "action": "set-attributes",
                        "attributes": {"display": "inline"}}],
    }
    path = project.parent / f"reveal-{layer}.json"
    path.write_text(json.dumps(patch), encoding="utf-8")
    return path


class CustomLayerNameTests(unittest.TestCase):
    def test_new_uses_given_layer_names_in_order(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir) / "page"
            TOOLS.create_project(project, title="t", layers=len(NAMES), width=100, height=140, layer_names=NAMES)
            root = TOOLS.parse_svg(project / "artwork.svg")
            ids = [layer.get("id") for layer in TOOLS.top_layers(root)]
            self.assertEqual(ids, [f"layer-{name}" for name in NAMES])
            self.assertEqual(TOOLS.layer_label(TOOLS.top_layers(root)[5]), "Cover A")

    def test_new_rejects_bad_layer_names(self) -> None:
        bad = [
            ["paper", "Paper", "frame", "picture", "notes"],        # not kebab-case
            ["paper", "paper", "frame", "picture", "notes"],        # duplicate
            ["paper", "frame", "picture", "notes"],                 # count does not match layers
        ]
        for names in bad:
            with self.subTest(names=names), tempfile.TemporaryDirectory() as temp_dir:
                with self.assertRaises(TOOLS.LayeredRedrawError):
                    TOOLS.create_project(Path(temp_dir) / "p", title="t", layers=5, width=10, height=10,
                                         layer_names=names)

    def test_cli_accepts_layer_names(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir) / "page"
            code = TOOLS.main(["new", str(project), "--layers", "7", "--width", "100", "--height", "140",
                               "--layer-names", ",".join(NAMES)])
            self.assertEqual(code, 0)
            root = TOOLS.parse_svg(project / "artwork.svg")
            self.assertEqual(TOOLS.top_layers(root)[0].get("id"), "layer-paper")


class DeriveTests(unittest.TestCase):
    def test_derive_changes_the_copy_only_and_records_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir) / "base"
            _schematic(base)
            base_bytes = (base / "artwork.svg").read_bytes()
            svg, _, config = TOOLS.resolve_project(base)
            base_manifest = TOOLS.build_manifest(svg, config)

            out = Path(temp_dir) / "variant-a"
            patch = _reveal(base, "cover-a")
            result = TOOLS.derive_variant(base, patch, out)

            self.assertEqual((base / "artwork.svg").read_bytes(), base_bytes)
            self.assertEqual(result["changed_layers"], ["layer-cover-a"])
            record = json.loads((out / "derivation.json").read_text(encoding="utf-8"))
            self.assertEqual(record["base_revision"], base_manifest["revision"])
            self.assertEqual(record["patch_sha256"], hashlib.sha256(patch.read_bytes()).hexdigest())
            self.assertEqual(record["changed_layers"], ["layer-cover-a"])
            base_hashes = {item["id"]: item["sha256"] for item in base_manifest["layers"]}
            for layer_id, digest in record["untouched_layer_sha256"].items():
                self.assertEqual(digest, base_hashes[layer_id])
            self.assertEqual(len(record["untouched_layer_sha256"]), len(NAMES) - 1)

    def test_two_variants_share_every_other_layer_byte_for_byte(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir) / "base"
            _schematic(base)
            a = TOOLS.derive_variant(base, _reveal(base, "cover-a"), Path(temp_dir) / "a")
            b = TOOLS.derive_variant(base, _reveal(base, "cover-b"), Path(temp_dir) / "b")
            ra = json.loads((Path(a["project"]) / "derivation.json").read_text(encoding="utf-8"))
            rb = json.loads((Path(b["project"]) / "derivation.json").read_text(encoding="utf-8"))
            shared = set(ra["untouched_layer_sha256"]) & set(rb["untouched_layer_sha256"])
            self.assertEqual(len(shared), len(NAMES) - 2)
            for layer_id in shared:
                self.assertEqual(ra["untouched_layer_sha256"][layer_id], rb["untouched_layer_sha256"][layer_id])

    def test_derive_leaves_nothing_behind_when_the_patch_escapes_its_scope(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir) / "base"
            _schematic(base)
            patch = {
                "schema_version": "1.0",
                "expected_changed_layers": ["layer-cover-a"],
                "operations": [{"target_id": "notes-block", "action": "set-attributes",
                                "attributes": {"fill": "#ffffff"}}],
            }
            path = Path(temp_dir) / "escape.json"
            path.write_text(json.dumps(patch), encoding="utf-8")
            out = Path(temp_dir) / "variant"
            with self.assertRaises(TOOLS.LayeredRedrawError):
                TOOLS.derive_variant(base, path, out)
            self.assertFalse(out.exists())

    def test_derive_refuses_a_non_empty_output_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir) / "base"
            _schematic(base)
            out = Path(temp_dir) / "taken"
            out.mkdir()
            (out / "keep.txt").write_text("x", encoding="utf-8")
            with self.assertRaises(TOOLS.LayeredRedrawError):
                TOOLS.derive_variant(base, _reveal(base, "cover-a"), out)
            self.assertEqual((out / "keep.txt").read_text(encoding="utf-8"), "x")


class PatchLogTests(unittest.TestCase):
    def test_patch_log_records_no_absolute_path(self) -> None:
        """A project folder is shared; its patch log must not carry the author's
        home directory. The patch is identified by a relative path and a digest."""
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir) / "base"
            _schematic(base)
            patch = _reveal(base, "cover-a")          # outside the project folder
            TOOLS.apply_patch(base, patch)
            logs = list((base / "patches").glob("*.json"))
            self.assertEqual(len(logs), 1)
            text = logs[0].read_text(encoding="utf-8")
            self.assertNotIn(str(Path(temp_dir)), text)
            self.assertNotIn(str(Path(temp_dir).resolve()), text)
            log = json.loads(text)
            self.assertEqual(log["patch_sha256"], hashlib.sha256(patch.read_bytes()).hexdigest())
            self.assertEqual(log["patch_source"], "reveal-cover-a.json")

    def test_patch_inside_the_project_is_logged_relative_to_it(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir) / "base"
            _schematic(base)
            inner = base / "requests" / "reveal.json"
            inner.parent.mkdir()
            inner.write_bytes(_reveal(base, "cover-b").read_bytes())
            TOOLS.apply_patch(base, inner)
            log = json.loads(next((base / "patches").glob("*.json")).read_text(encoding="utf-8"))
            self.assertEqual(log["patch_source"], "requests/reveal.json")


class ExportTests(unittest.TestCase):
    def test_export_names_the_missing_converter_instead_of_failing_silently(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir) / "base"
            _schematic(base)
            original = TOOLS.find_svg_converter
            TOOLS.find_svg_converter = lambda: None
            try:
                with self.assertRaises(TOOLS.LayeredRedrawError) as caught:
                    TOOLS.export_artwork(base, Path(temp_dir) / "out.pdf")
            finally:
                TOOLS.find_svg_converter = original
            self.assertIn("cairosvg", str(caught.exception))

    def test_export_rejects_unknown_formats(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir) / "base"
            _schematic(base)
            with self.assertRaises(TOOLS.LayeredRedrawError):
                TOOLS.export_artwork(base, Path(temp_dir) / "out.eps")

    @unittest.skipUnless(TOOLS.find_svg_converter() if hasattr(TOOLS, "find_svg_converter") else None,
                         "no SVG converter installed")
    def test_export_pdf_and_png_respect_hidden_layers(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir) / "base"
            _schematic(base)
            pdf = TOOLS.export_artwork(base, Path(temp_dir) / "page.pdf")
            self.assertTrue(Path(pdf["output"]).read_bytes().startswith(b"%PDF"))
            try:
                from PIL import Image
            except ImportError:
                self.skipTest("Pillow is required to inspect the PNG")
            shown = TOOLS.derive_variant(base, _reveal(base, "cover-a"), Path(temp_dir) / "shown")
            hidden_png = TOOLS.export_artwork(base, Path(temp_dir) / "hidden.png", scale=1)["output"]
            shown_png = TOOLS.export_artwork(shown["project"], Path(temp_dir) / "shown.png", scale=1)["output"]
            # (83, 80) lies on the notes block and under cover A.
            with Image.open(hidden_png) as img:
                self.assertLess(sum(img.convert("RGB").getpixel((83, 80))), 100)
            with Image.open(shown_png) as img:
                self.assertGreater(sum(img.convert("RGB").getpixel((83, 80))), 700)


if __name__ == "__main__":
    unittest.main()
