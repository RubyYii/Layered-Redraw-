from __future__ import annotations

import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills" / "redraw-in-layers" / "scripts" / "layered_redraw.py"
SPEC = importlib.util.spec_from_file_location("layered_redraw_tools", SCRIPT)
assert SPEC and SPEC.loader
TOOLS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOLS)


class LayeredRedrawTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sample = ROOT / "examples" / "canal-evening"

    def test_sample_project_is_valid_and_has_ten_layers(self) -> None:
        report = TOOLS.validate_project(self.sample)
        self.assertTrue(report["ok"], report["errors"])
        self.assertEqual(report["layer_count"], 10)
        self.assertEqual(report["warnings"], [])

    def test_manifest_has_unique_stable_layer_ids(self) -> None:
        svg_path, _, config = TOOLS.resolve_project(self.sample)
        manifest = TOOLS.build_manifest(svg_path, config)
        ids = [layer["id"] for layer in manifest["layers"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(TOOLS.LAYER_ID_RE.fullmatch(layer_id) for layer_id in ids))
        self.assertTrue(all(layer["object_count"] > 0 for layer in manifest["layers"]))

    def test_split_exports_every_layer(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            result = TOOLS.split_layers(self.sample, Path(temp_dir) / "layers")
            self.assertEqual(result["layer_count"], 10)
            index = json.loads((Path(result["output_dir"]) / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(len(index["layers"]), 10)
            self.assertTrue(all((Path(result["output_dir"]) / item["file"]).is_file() for item in index["layers"]))

    def test_scoped_patch_changes_only_expected_layer(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir) / "project"
            shutil.copytree(self.sample, project)
            svg_path, _, config = TOOLS.resolve_project(project)
            before = TOOLS.build_manifest(svg_path, config)
            patch = {
                "schema_version": "1.0",
                "base_revision": before["revision"],
                "expected_changed_layers": ["layer-canal"],
                "preserve_layers": [layer["id"] for layer in before["layers"] if layer["id"] != "layer-canal"],
                "operations": [
                    {
                        "target_id": "water-surface",
                        "action": "set-attributes",
                        "attributes": {"fill": "#718c80", "opacity": "0.88"},
                    }
                ],
            }
            patch_path = project / "patch.json"
            patch_path.write_text(json.dumps(patch), encoding="utf-8")

            dry_run = TOOLS.apply_patch(project, patch_path, dry_run=True)
            self.assertEqual(dry_run["changed_layers"], ["layer-canal"])
            applied = TOOLS.apply_patch(project, patch_path)
            self.assertEqual(applied["changed_layers"], ["layer-canal"])

            after = TOOLS.build_manifest(svg_path, config)
            before_hashes = {layer["id"]: layer["sha256"] for layer in before["layers"]}
            after_hashes = {layer["id"]: layer["sha256"] for layer in after["layers"]}
            for layer_id, before_hash in before_hashes.items():
                if layer_id == "layer-canal":
                    self.assertNotEqual(before_hash, after_hashes[layer_id])
                else:
                    self.assertEqual(before_hash, after_hashes[layer_id])

    def test_patch_rejects_cross_layer_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir) / "project"
            shutil.copytree(self.sample, project)
            svg_path, _, config = TOOLS.resolve_project(project)
            manifest = TOOLS.build_manifest(svg_path, config)
            patch = {
                "base_revision": manifest["revision"],
                "expected_changed_layers": ["layer-canal"],
                "operations": [
                    {
                        "target_id": "warehouse-main",
                        "action": "set-attributes",
                        "attributes": {"opacity": "0.5"},
                    }
                ],
            }
            patch_path = project / "bad-patch.json"
            patch_path.write_text(json.dumps(patch), encoding="utf-8")
            with self.assertRaises(TOOLS.LayeredRedrawError):
                TOOLS.apply_patch(project, patch_path, dry_run=True)


if __name__ == "__main__":
    unittest.main()
