from __future__ import annotations

import importlib.util
import http.client
import json
import shutil
import tempfile
import threading
import unittest
import zipfile
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:  # Raster mode is an optional extra.
    Image = None
    ImageDraw = None


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

    def _make_raster_project(self, parent: Path) -> Path:
        assert Image is not None and ImageDraw is not None
        project = parent / "raster-project"
        TOOLS.create_project(
            project,
            title="Layered Raster Test",
            layers=10,
            width=160,
            height=120,
            mode="raster-layered",
        )
        index = json.loads((project / "layers" / "index.json").read_text(encoding="utf-8"))
        for position, entry in enumerate(index["layers"], start=1):
            if position == 1:
                image = Image.new("RGBA", (160, 120), (24, 45, 68, 255))
            else:
                image = Image.new("RGBA", (160, 120), (0, 0, 0, 0))
                draw = ImageDraw.Draw(image)
                inset = 5 + position * 2
                draw.rounded_rectangle(
                    (inset, inset, 160 - inset, 120 - inset),
                    radius=6,
                    fill=(20 * position % 255, 45 * position % 255, 70 * position % 255, 120),
                )
            destination = project / entry["file"]
            destination.parent.mkdir(parents=True, exist_ok=True)
            image.save(destination)
        return project

    def _make_pixel_art_project(self, parent: Path, *, palette_size: int = 16) -> Path:
        assert Image is not None and ImageDraw is not None
        project = parent / f"pixel-project-{palette_size}"
        TOOLS.create_project(
            project,
            title="Pixel Layer Test",
            layers=8,
            width=64,
            height=48,
            mode="raster-layered",
            style="pixel-art",
            pixel_scale=4,
            palette_size=palette_size,
        )
        palette = [
            (20, 28, 44),
            (238, 82, 83),
            (255, 184, 76),
            (94, 201, 98),
            (76, 142, 230),
            (157, 93, 214),
            (240, 240, 220),
            (120, 76, 52),
        ]
        index = json.loads((project / "layers" / "index.json").read_text(encoding="utf-8"))
        for position, entry in enumerate(index["layers"], start=1):
            if position == 1:
                image = Image.new("RGBA", (64, 48), (*palette[0], 255))
            else:
                image = Image.new("RGBA", (64, 48), (0, 0, 0, 0))
                draw = ImageDraw.Draw(image)
                left = 3 + (position - 2) * 8
                draw.rectangle((left, 8, left + 5, 39), fill=(*palette[position - 1], 255))
            image.save(project / entry["file"])
        return project

    def _make_reference_project(self, parent: Path) -> tuple[Path, dict]:
        assert Image is not None
        project = parent / "reference-project"
        TOOLS.create_project(
            project,
            title="Reference Intelligence Test",
            layers=8,
            width=96,
            height=64,
            mode="vector-strict",
        )
        source = parent / "scene.png"
        image = Image.new("RGB", (96, 64))
        pixels = image.load()
        for y in range(64):
            for x in range(96):
                pixels[x, y] = (40 + x * 2, 55 + y * 2, 120 + (x + y) // 3)
        image.save(source)
        registered = TOOLS.REFERENCES.register_reference_file(
            project,
            source,
            role="primary-rgb",
            label="Test scene",
        )
        return project, registered["reference"]

    @unittest.skipUnless(Image is not None and importlib.util.find_spec("numpy"), "Pillow and NumPy are required")
    def test_reference_depth_pipeline_writes_auditable_artifacts_without_a_model(self) -> None:
        import numpy as np

        with tempfile.TemporaryDirectory() as temp_dir:
            project, reference = self._make_reference_project(Path(temp_dir))

            def predictor(image):
                horizontal = np.linspace(0.0, 1.0, image.width, dtype=np.float32)
                return np.tile(horizontal, (image.height, 1))

            result = TOOLS.REFERENCES.estimate_depth(
                project,
                reference["id"],
                zone_count=5,
                predictor=predictor,
            )
            run = result["run"]
            self.assertEqual(run["source_kind"], "estimated-monocular")
            self.assertEqual(run["orientation"], "near-white")
            self.assertEqual(len(run["bands"]), 5)
            self.assertAlmostEqual(sum(item["pixel_fraction"] for item in run["bands"]), 1.0, places=5)
            for relative in run["artifacts"].values():
                self.assertTrue((project / relative).is_file(), relative)
            with Image.open(project / run["artifacts"]["depth_16"]) as depth:
                self.assertEqual(depth.size, (96, 64))
                self.assertGreater(depth.getextrema()[1], 255)
            state = TOOLS.REFERENCES.public_state(project)
            self.assertEqual(state["active_rgb"], reference["id"])
            self.assertEqual(state["active_depth_run"], run["id"])
            self.assertTrue(state["depth_runs"][0]["relative_depth"])

    @unittest.skipUnless(Image is not None and importlib.util.find_spec("numpy"), "Pillow and NumPy are required")
    def test_external_rgbd_import_requires_matching_single_channel_depth(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            project, reference = self._make_reference_project(root)
            depth_path = root / "depth.png"
            Image.linear_gradient("L").resize((96, 64)).save(depth_path)
            result = TOOLS.REFERENCES.register_depth_map(
                project,
                depth_path,
                reference["id"],
                raw_near="low",
                zone_count=6,
            )
            self.assertEqual(result["run"]["provider"]["backend"], "supplied-rgbd")
            self.assertEqual(result["run"]["provider"]["raw_near"], "low")
            self.assertEqual(result["run"]["zone_count"], 6)

            wrong_size = root / "wrong-depth.png"
            Image.new("L", (32, 32), 128).save(wrong_size)
            with self.assertRaises(TOOLS.REFERENCES.ReferenceIntelligenceError):
                TOOLS.REFERENCES.register_depth_map(
                    project,
                    wrong_size,
                    reference["id"],
                    raw_near="high",
                )

            rgb_depth = root / "rgb-depth.png"
            Image.new("RGB", (96, 64), (20, 40, 60)).save(rgb_depth)
            with self.assertRaises(TOOLS.REFERENCES.ReferenceIntelligenceError):
                TOOLS.REFERENCES.register_depth_map(
                    project,
                    rgb_depth,
                    reference["id"],
                    raw_near="high",
                )

    @unittest.skipUnless(Image is not None, "Pillow is required for reference planning tests")
    def test_prompt_directives_resolve_semantics_into_bounded_editable_layers(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project, reference = self._make_reference_project(Path(temp_dir))
            request = TOOLS.REFERENCES.create_planning_request(
                project,
                "Keep the person separate, merge the distant architecture, and place reflections above water.",
                mode="faithful",
                layer_budget=8,
                separate=["person"],
                merge_groups=[["far building one", "far building two"], ["tree one", "tree two"]],
                overlays=["reflection"],
            )["request"]
            labels = [
                ("sky", "天空", "Sky", "atmosphere", 0.05, "normal"),
                ("building-one", "远楼一", "Far building one", "architecture", 0.18, "normal"),
                ("building-two", "远楼二", "Far building two", "architecture", 0.2, "normal"),
                ("tree-one", "树一", "Tree one", "vegetation", 0.42, "normal"),
                ("tree-two", "树二", "Tree two", "vegetation", 0.44, "normal"),
                ("water", "水面", "Water", "water", 0.5, "normal"),
                ("person", "人物", "Person", "figure", 0.82, "high"),
                ("boat", "船", "Boat", "vehicle", 0.7, "normal"),
                ("foreground", "前景", "Foreground", "ground", 0.92, "normal"),
                ("reflection", "倒影", "Reflection", "light", 0.54, "normal"),
            ]
            regions = {
                "kind": TOOLS.REFERENCES.REGIONS_KIND,
                "schema_version": "1.0",
                "source_id": reference["id"],
                "regions": [
                    {
                        "id": f"region-{slug}",
                        "label_zh": zh,
                        "label_en": en,
                        "semantic_class": semantic_class,
                        "depth_mean": depth,
                        "area_fraction": 0.1,
                        "confidence": 0.9,
                        "edit_priority": priority,
                    }
                    for slug, zh, en, semantic_class, depth, priority in labels
                ],
            }
            result = TOOLS.REFERENCES.resolve_layer_plan(project, regions, raw_request=request)
            plan = result["plan"]
            self.assertTrue(plan["ready"])
            self.assertEqual(plan["layer_count"], 8)
            self.assertTrue(plan["raw_depth_immutable"])
            person_layer = next(layer for layer in plan["layers"] if "region-person" in layer["region_ids"])
            self.assertEqual(person_layer["region_ids"], ["region-person"])
            reflection_layer = next(layer for layer in plan["layers"] if "region-reflection" in layer["region_ids"])
            self.assertTrue(reflection_layer["is_overlay"])
            self.assertEqual(reflection_layer["z_index"], plan["layer_count"])
            self.assertTrue(all(layer["raw_depth_mean"] == layer["directed_depth_mean"] for layer in plan["layers"]))
            self.assertEqual(TOOLS.REFERENCES.public_state(project)["layer_plan_status"], "current")

            snapshot = TOOLS.create_manual_snapshot(project, "Reference planning contract")
            with zipfile.ZipFile(project / snapshot["archive"]) as archive:
                names = set(archive.namelist())
            self.assertIn("references/index.json", names)
            self.assertIn("planning-request.json", names)
            self.assertIn("layer-plan.json", names)
            self.assertIn("directed-depth.json", names)

            TOOLS.REFERENCES.create_planning_request(
                project,
                "Keep the person separate and simplify the water.",
                layer_budget=8,
            )
            self.assertEqual(TOOLS.REFERENCES.public_state(project)["layer_plan_status"], "stale")

    @unittest.skipUnless(Image is not None, "Pillow is required for art-directed depth tests")
    def test_art_direction_changes_only_depth_interpretation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project, reference = self._make_reference_project(Path(temp_dir))
            with self.assertRaises(TOOLS.REFERENCES.ReferenceIntelligenceError):
                TOOLS.REFERENCES.create_planning_request(
                    project,
                    "Flatten space",
                    mode="faithful",
                    depth_flattening=0.5,
                )
            request = TOOLS.REFERENCES.create_planning_request(
                project,
                "Flatten the background while exaggerating the main subject.",
                mode="art-directed",
                layer_budget=5,
                depth_flattening=0.35,
                depth_exaggeration=0.75,
            )["request"]
            regions = {
                "kind": TOOLS.REFERENCES.REGIONS_KIND,
                "source_id": reference["id"],
                "regions": [
                    {
                        "id": f"region-part-{index}",
                        "label_zh": f"区域{index}",
                        "label_en": f"Part {index}",
                        "semantic_class": f"class-{index}",
                        "depth_mean": index / 6,
                        "area_fraction": 0.18,
                        "confidence": 0.85,
                    }
                    for index in range(1, 6)
                ],
            }
            plan = TOOLS.REFERENCES.resolve_layer_plan(project, regions, raw_request=request)["plan"]
            self.assertTrue(plan["raw_depth_immutable"])
            self.assertTrue(any(
                layer["raw_depth_mean"] != layer["directed_depth_mean"]
                for layer in plan["layers"]
            ))
            directed = json.loads((project / "directed-depth.json").read_text(encoding="utf-8"))
            self.assertIn("no synthetic per-pixel depth", directed["pixel_map_status"])

    @unittest.skipUnless(Image is not None, "Pillow is required for raster-layered tests")
    def test_raster_project_validates_composes_and_builds_editor_view(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = self._make_raster_project(Path(temp_dir))
            before_compose = TOOLS.validate_project(project)
            self.assertTrue(before_compose["ok"], before_compose["errors"])
            self.assertTrue(any("Composite artwork is missing" in warning for warning in before_compose["warnings"]))

            composed = TOOLS.RASTER.compose_project(project)
            self.assertTrue(Path(composed["artwork"]).is_file())
            self.assertTrue(Path(composed["preview"]).is_file())
            report = TOOLS.validate_project(project)
            self.assertTrue(report["ok"], report["errors"])
            self.assertEqual(report["warnings"], [])
            self.assertEqual(report["layer_count"], 10)

            viewer = TOOLS.RASTER.viewer_svg(project).decode("utf-8")
            self.assertEqual(viewer.count('data-layer="true"'), 10)
            self.assertIn("/api/layer/layer-primary-subject", viewer)
            self.assertLess(viewer.count('data-bbox="0 0 160 120"'), 10)
            split = TOOLS.split_layers(project)
            self.assertEqual(split["layer_count"], 10)
            self.assertIn("already stored", split["message"])

    @unittest.skipUnless(Image is not None, "Pillow is required for raster-layered tests")
    def test_raster_validation_rejects_fully_opaque_upper_layer(self) -> None:
        assert Image is not None
        with tempfile.TemporaryDirectory() as temp_dir:
            project = self._make_raster_project(Path(temp_dir))
            index = json.loads((project / "layers" / "index.json").read_text(encoding="utf-8"))
            upper_layer = project / index["layers"][1]["file"]
            Image.new("RGBA", (160, 120), (220, 120, 60, 255)).save(upper_layer)

            report = TOOLS.validate_project(project)
            self.assertFalse(report["ok"])
            self.assertTrue(any("fully opaque" in error for error in report["errors"]))

    @unittest.skipUnless(Image is not None, "Pillow is required for raster-layered tests")
    def test_pixel_art_preset_composes_nearest_neighbour_preview(self) -> None:
        assert Image is not None
        with tempfile.TemporaryDirectory() as temp_dir:
            project = self._make_pixel_art_project(Path(temp_dir))
            config = json.loads((project / "project.json").read_text(encoding="utf-8"))
            self.assertEqual(config["style"], "pixel-art")
            self.assertEqual(config["pixel_art"]["palette_size"], 16)
            prompt = (project / "prompts" / "02-sky.md").read_text(encoding="utf-8")
            self.assertIn("no anti-aliasing", prompt)
            self.assertIn("0 or 255", prompt)

            report = TOOLS.validate_project(project)
            self.assertTrue(report["ok"], report["errors"])
            self.assertLessEqual(report["palette_color_count"], 16)
            composed = TOOLS.RASTER.compose_project(project)
            self.assertEqual(composed["preview_scale"], 4)

            with Image.open(project / "artwork.png") as artwork, Image.open(project / "preview.png") as preview:
                self.assertEqual(artwork.size, (64, 48))
                self.assertEqual(preview.size, (256, 192))
                source_pixel = artwork.convert("RGBA").getpixel((10, 10))
                block = preview.convert("RGBA").crop((40, 40, 44, 44))
                pixels = block.get_flattened_data() if hasattr(block, "get_flattened_data") else block.getdata()
                self.assertEqual(set(pixels), {source_pixel})

            composition = json.loads((project / "composition.json").read_text(encoding="utf-8"))
            self.assertEqual(composition["resampling"], "nearest")
            self.assertEqual(composition["preview_size"], [256, 192])
            viewer = TOOLS.RASTER.viewer_svg(project).decode("utf-8")
            self.assertIn('image-rendering="pixelated"', viewer)

    @unittest.skipUnless(Image is not None, "Pillow is required for raster-layered tests")
    def test_pixel_art_preset_rejects_soft_alpha_and_palette_overflow(self) -> None:
        assert Image is not None and ImageDraw is not None
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            soft_project = self._make_pixel_art_project(root / "soft")
            index = json.loads((soft_project / "layers" / "index.json").read_text(encoding="utf-8"))
            soft_layer = Image.new("RGBA", (64, 48), (0, 0, 0, 0))
            ImageDraw.Draw(soft_layer).rectangle((8, 8, 24, 32), fill=(255, 0, 0, 128))
            soft_layer.save(soft_project / index["layers"][1]["file"])
            soft_report = TOOLS.validate_project(soft_project)
            self.assertFalse(soft_report["ok"])
            self.assertTrue(any("partial alpha" in error for error in soft_report["errors"]))

            overflow_project = self._make_pixel_art_project(root / "overflow", palette_size=4)
            overflow_report = TOOLS.validate_project(overflow_project)
            self.assertFalse(overflow_report["ok"])
            self.assertTrue(any("visible colors" in error for error in overflow_report["errors"]))

    @unittest.skipUnless(Image is not None, "Pillow is required for raster-layered tests")
    def test_raster_patch_replaces_only_selected_png_layer(self) -> None:
        assert Image is not None and ImageDraw is not None
        with tempfile.TemporaryDirectory() as temp_dir:
            project = self._make_raster_project(Path(temp_dir))
            TOOLS.RASTER.compose_project(project)
            before = TOOLS.RASTER.build_manifest(project)
            target_id = "layer-primary-subject"

            replacement = Image.new("RGBA", (160, 120), (0, 0, 0, 0))
            draw = ImageDraw.Draw(replacement)
            draw.ellipse((42, 18, 118, 102), fill=(246, 84, 52, 230))
            replacement_path = project / "staging" / "primary-subject-v2.png"
            replacement.save(replacement_path)
            patch = {
                "schema_version": "1.0",
                "base_revision": before["revision"],
                "expected_changed_layers": [target_id],
                "preserve_layers": [layer["id"] for layer in before["layers"] if layer["id"] != target_id],
                "operations": [
                    {
                        "target_id": target_id,
                        "action": "replace-layer-file",
                        "source": "staging/primary-subject-v2.png",
                    }
                ],
            }
            patch_path = project / "patch.json"
            patch_path.write_text(json.dumps(patch), encoding="utf-8")

            dry_run = TOOLS.apply_patch(project, patch_path, dry_run=True)
            self.assertEqual(dry_run["changed_layers"], [target_id])
            applied = TOOLS.apply_patch(project, patch_path)
            self.assertEqual(applied["changed_layers"], [target_id])

            after = TOOLS.RASTER.build_manifest(project)
            before_hashes = {layer["id"]: layer["sha256"] for layer in before["layers"]}
            after_hashes = {layer["id"]: layer["sha256"] for layer in after["layers"]}
            for layer_id, before_hash in before_hashes.items():
                if layer_id == target_id:
                    self.assertNotEqual(before_hash, after_hashes[layer_id])
                else:
                    self.assertEqual(before_hash, after_hashes[layer_id])

    @unittest.skipUnless(Image is not None, "Pillow is required for raster-layered tests")
    def test_raster_patch_can_swap_two_existing_layer_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = self._make_raster_project(Path(temp_dir))
            TOOLS.RASTER.compose_project(project)
            before = TOOLS.RASTER.build_manifest(project)
            first_id = "layer-sky"
            second_id = "layer-distant-forms"
            layer_files = {layer["id"]: layer["file"] for layer in before["layers"]}
            before_hashes = {layer["id"]: layer["sha256"] for layer in before["layers"]}
            patch = {
                "schema_version": "1.0",
                "base_revision": before["revision"],
                "expected_changed_layers": [first_id, second_id],
                "operations": [
                    {
                        "target_id": first_id,
                        "action": "replace-layer-file",
                        "source": layer_files[second_id],
                    },
                    {
                        "target_id": second_id,
                        "action": "replace-layer-file",
                        "source": layer_files[first_id],
                    },
                ],
            }
            patch_path = project / "swap-patch.json"
            patch_path.write_text(json.dumps(patch), encoding="utf-8")

            applied = TOOLS.apply_patch(project, patch_path)
            self.assertEqual(applied["changed_layers"], sorted([first_id, second_id]))
            after = TOOLS.RASTER.build_manifest(project)
            after_hashes = {layer["id"]: layer["sha256"] for layer in after["layers"]}
            self.assertEqual(after_hashes[first_id], before_hashes[second_id])
            self.assertEqual(after_hashes[second_id], before_hashes[first_id])

    def test_style_recipe_installs_and_gba_recipe_enables_pixel_contract(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir) / "gba-project"
            result = TOOLS.create_project(
                project,
                title="Warm Narrative",
                layers=8,
                width=64,
                height=48,
                mode="raster-layered",
                style="gba-warm-narrative",
            )
            config = json.loads((project / "project.json").read_text(encoding="utf-8"))
            recipe = json.loads((project / "style-recipe.json").read_text(encoding="utf-8"))
            index = json.loads((project / "layers" / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(result["style"], "gba-warm-narrative")
            self.assertEqual(config["pixel_art"]["palette_size"], 24)
            self.assertEqual(recipe["id"], "gba-warm-narrative")
            self.assertTrue(all(layer["layer_type"] == "pixel" for layer in index["layers"]))

    def test_design_presets_and_style_recipes_define_full_visual_systems(self) -> None:
        catalog = TOOLS.FEATURES.design_preset_catalog()
        self.assertGreaterEqual(len(catalog["presets"]), 6)
        for preset in catalog["presets"]:
            TOOLS.FEATURES.validate_design_preset(preset)
            self.assertEqual(set(preset["fixed"]), set(TOOLS.FEATURES.DESIGN_PARAMETER_KEYS))
            structural_energy = max(
                preset["fixed"]["composition"]["crop_strength"],
                preset["fixed"]["composition"]["asymmetry"],
                preset["fixed"]["space"]["flattening"],
                preset["fixed"]["form"]["simplification"],
                preset["fixed"]["form"]["exaggeration"],
            )
            self.assertGreaterEqual(structural_energy, 0.25, preset["id"])

        recipes = TOOLS.FEATURES.list_style_recipes()
        self.assertGreaterEqual(len(recipes), 10)
        for recipe in recipes:
            profile = recipe.get("design_profile", {})
            self.assertTrue(
                TOOLS.FEATURES.STYLE_DESIGN_PROFILE_KEYS.issubset(profile),
                recipe["id"],
            )
            self.assertIs(profile["forbid_artwork_text"], True)

    def test_guided_preset_changes_design_revision_and_is_recoverable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir) / "guided-project"
            TOOLS.create_project(
                project,
                title="Guided Design",
                layers=8,
                width=120,
                height=90,
                mode="raster-layered",
            )
            initial_plan = TOOLS.FEATURES.load_design_plan(project)
            self.assertEqual(initial_plan["workflow_mode"], "guided")
            self.assertIs(initial_plan["artwork_text"], False)
            before = TOOLS.RASTER.build_manifest(project)

            applied = TOOLS.FEATURES.apply_design_preset(
                project,
                "woodcut-dramatic",
                controls={"subject_emphasis": 0.9, "space_flattening": 0.76},
                workflow_mode="guided",
                snapshot_manifest=before,
            )
            after = TOOLS.RASTER.build_manifest(project)
            config = json.loads((project / "project.json").read_text(encoding="utf-8"))
            self.assertNotEqual(before["revision"], after["revision"])
            self.assertEqual(config["design_preset"], "woodcut-dramatic")
            self.assertEqual(config["style"], "woodcut")
            self.assertIs(applied["design_plan"]["artwork_text"], False)
            self.assertGreater(applied["design_plan"]["parameters"]["composition"]["subject_scale"], 1.18)
            self.assertEqual(TOOLS.FEATURES.list_history(project)["count"], 1)

            quality = TOOLS.FEATURES.design_quality_report(project)
            self.assertTrue(quality["ok"], quality["errors"])
            self.assertEqual(quality["plan_schema_completeness"], 100)
            self.assertTrue(quality["engineering_contract"]["checks"]["plan_declares_structural_change"])
            self.assertTrue(quality["engineering_contract"]["checks"]["style_profile_schema_complete"])
            self.assertEqual(quality["visual_quality"]["status"], "not-assessed")
            self.assertIs(quality["visual_quality"]["human_confirmed"], False)

    def test_design_plan_digest_is_newline_independent(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir) / "newline-project"
            TOOLS.create_project(
                project,
                title="Newline Stable",
                layers=8,
                width=120,
                height=90,
                mode="raster-layered",
            )
            config = json.loads((project / "project.json").read_text(encoding="utf-8"))
            before = TOOLS.FEATURES.design_plan_sha256(project, config)
            plan_path = project / "design-plan.json"
            plan_path.write_bytes(plan_path.read_bytes().replace(b"\n", b"\r\n"))
            after = TOOLS.FEATURES.design_plan_sha256(project, config)
            self.assertEqual(before, after)

    @unittest.skipUnless(Image is not None, "Pillow is required for raster fixture checks")
    def test_public_npc_fixture_is_current_and_text_policy_is_truthful(self) -> None:
        source = ROOT / "examples" / "cat-cave-npc"
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir) / "cat-cave-npc"
            shutil.copytree(source, project)
            validation = TOOLS.RASTER.validate_project(project)
            self.assertEqual(validation["warnings"], [])
            design = TOOLS.FEATURES.design_quality_report(project)
            self.assertTrue(design["ok"], design["errors"])
            self.assertEqual(
                design["asset_text_evidence"]["declared_text_layers"],
                ["layer-dialogue-text", "layer-nameplate-text"],
            )
            self.assertIs(design["asset_text_evidence"]["policy_allows_text"], True)
            self.assertEqual(design["visual_quality"]["status"], "not-assessed")

            TOOLS.RASTER.compose_project(project)
            tracked = ["artwork.png", "preview.png", "manifest.json", "composition.json"]
            before = {name: (project / name).read_bytes() for name in tracked}
            TOOLS.RASTER.compose_project(project)
            after = {name: (project / name).read_bytes() for name in tracked}
            self.assertEqual(before, after)

    def test_gba_design_preset_requires_a_pixel_art_project(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            ordinary = root / "ordinary-raster"
            TOOLS.create_project(
                ordinary,
                title="Ordinary Raster",
                layers=8,
                width=120,
                height=90,
                mode="raster-layered",
            )
            ordinary_manifest = TOOLS.RASTER.build_manifest(ordinary)
            with self.assertRaises(TOOLS.FEATURES.ProjectFeatureError):
                TOOLS.FEATURES.apply_design_preset(
                    ordinary,
                    "gba-warm-story",
                    snapshot_manifest=ordinary_manifest,
                )
            self.assertEqual(TOOLS.FEATURES.list_history(ordinary)["count"], 0)

            pixel = root / "pixel-raster"
            TOOLS.create_project(
                pixel,
                title="Pixel Raster",
                layers=8,
                width=64,
                height=48,
                mode="raster-layered",
                style="pixel-art",
            )
            applied = TOOLS.FEATURES.apply_design_preset(pixel, "gba-warm-story")
            self.assertEqual(applied["design_plan"]["style"], "gba-warm-narrative")
            pixel_config = json.loads((pixel / "project.json").read_text(encoding="utf-8"))
            self.assertEqual(pixel_config["pixel_art"]["palette_size"], 24)

    def test_expert_design_can_be_saved_as_a_guided_user_preset(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir) / "expert-project"
            TOOLS.create_project(
                project,
                title="Expert Design",
                layers=8,
                width=140,
                height=100,
                mode="vector-strict",
            )
            svg_path, _, config = TOOLS.resolve_project(project)
            before = TOOLS.build_manifest(svg_path, config)

            with self.assertRaises(TOOLS.FEATURES.ProjectFeatureError):
                TOOLS.FEATURES.update_design_plan(
                    project,
                    {"parameters": {"composition": {"subject_scale": 3.0}}},
                    snapshot_manifest=before,
                )
            self.assertEqual(TOOLS.FEATURES.list_history(project)["count"], 0)

            TOOLS.FEATURES.update_design_plan(project, {"workflow_mode": "expert"})
            self.assertEqual(TOOLS.FEATURES.list_history(project)["count"], 0)
            current_config = json.loads((project / "project.json").read_text(encoding="utf-8"))
            expert_manifest = TOOLS.build_manifest(svg_path, current_config)
            self.assertNotEqual(before["revision"], expert_manifest["revision"])

            updated = TOOLS.FEATURES.update_design_plan(
                project,
                {
                    "parameters": {
                        "composition": {"balance": "weighted-left", "subject_scale": 1.45},
                        "space": {"flattening": 0.74},
                        "form": {"exaggeration": 0.46},
                    }
                },
                snapshot_manifest=expert_manifest,
            )
            self.assertEqual(updated["design_plan"]["parameters"]["composition"]["subject_scale"], 1.45)
            self.assertEqual(TOOLS.FEATURES.list_history(project)["count"], 1)

            saved = TOOLS.FEATURES.save_user_design_preset(
                project,
                preset_id="my-quiet-drama",
                name_zh="静谧戏剧",
                name_en="Quiet drama",
                exposed_controls=["subject_emphasis", "color_intensity"],
            )
            self.assertTrue(Path(saved["file"]).is_file())
            user_preset = next(
                item for item in TOOLS.FEATURES.list_design_presets(project) if item["id"] == "my-quiet-drama"
            )
            self.assertEqual(user_preset["source"], "user")
            self.assertEqual(set(user_preset["controls"]), {"subject_emphasis", "color_intensity"})

            reapplied = TOOLS.FEATURES.apply_design_preset(
                project,
                "my-quiet-drama",
                controls={"subject_emphasis": 0.82},
                workflow_mode="guided",
            )
            self.assertEqual(reapplied["design_plan"]["workflow_mode"], "guided")
            self.assertEqual(reapplied["design_plan"]["selected_preset"], "my-quiet-drama")
            self.assertIs(reapplied["design_plan"]["artwork_text"], False)

    def test_parameterized_proofs_create_select_lock_and_promote_safely(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir) / "proof-project"
            TOOLS.create_project(
                project,
                title="Proof Studio",
                layers=8,
                width=160,
                height=100,
                mode="vector-strict",
            )
            svg_path, _, config = TOOLS.resolve_project(project)
            before = TOOLS.build_manifest(svg_path, config)

            created = TOOLS.PROOFS.create_design_proofs(
                project,
                stage="full",
                spread=0.72,
                base_revision=before["revision"],
            )
            active = created["proofs"]["active"]
            self.assertEqual([item["id"] for item in active["variants"]], ["a", "b", "c"])
            self.assertEqual(active["stage"], "full")
            self.assertEqual(active["status"], "draft")
            self.assertTrue((project / active["comparison_board"]).is_file())
            plans = []
            for variant in active["variants"]:
                self.assertEqual(variant["preview_kind"], "parameter-schematic")
                self.assertTrue((project / variant["preview"]).is_file())
                self.assertTrue((project / variant["render_request"]).is_file())
                plan = json.loads((project / variant["design_plan"]).read_text(encoding="utf-8"))
                self.assertIs(plan["artwork_text"], False)
                plans.append(plan["parameters"])
            self.assertNotEqual(plans[0], plans[1])
            self.assertNotEqual(plans[1], plans[2])

            with self.assertRaises(TOOLS.PROOFS.DesignProofError):
                TOOLS.PROOFS.set_design_proof_lock(project)
            TOOLS.PROOFS.select_design_proof(project, "B")
            TOOLS.PROOFS.set_design_proof_lock(project)
            promoted = TOOLS.PROOFS.promote_design_proof(
                project,
                snapshot_manifest=before,
            )
            self.assertEqual(promoted["promoted"]["variant_id"], "b")
            root_plan = TOOLS.FEATURES.load_design_plan(project)
            self.assertEqual(root_plan["proof"]["status"], "promoted")
            self.assertEqual(root_plan["proof"]["variant_id"], "b")
            updated_config = json.loads((project / "project.json").read_text(encoding="utf-8"))
            self.assertEqual(updated_config["design_phase"], "production")
            self.assertEqual(TOOLS.FEATURES.list_history(project)["count"], 1)
            after = TOOLS.build_manifest(svg_path, updated_config)
            self.assertNotEqual(before["revision"], after["revision"])
            with self.assertRaises(TOOLS.PROOFS.DesignProofError):
                TOOLS.PROOFS.select_design_proof(project, "A")

    def test_proof_stages_change_only_their_owned_parameter_families(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir) / "proof-stages"
            TOOLS.create_project(
                project,
                title="Two Stage Proofs",
                layers=8,
                width=160,
                height=100,
                mode="vector-strict",
            )
            base = TOOLS.FEATURES.load_design_plan(project)["parameters"]
            structure = TOOLS.PROOFS.create_design_proofs(project, stage="structure", spread=0.8)["active"]
            structure_plan = json.loads(
                (project / structure["variants"][1]["design_plan"]).read_text(encoding="utf-8")
            )["parameters"]
            self.assertNotEqual(structure_plan["composition"], base["composition"])
            self.assertEqual(structure_plan["color"], base["color"])
            self.assertEqual(structure_plan["material"], base["material"])

            colour = TOOLS.PROOFS.create_design_proofs(
                project,
                stage="color-material",
                spread=0.8,
            )["active"]
            colour_plan = json.loads(
                (project / colour["variants"][2]["design_plan"]).read_text(encoding="utf-8")
            )["parameters"]
            self.assertEqual(colour_plan["composition"], base["composition"])
            self.assertEqual(colour_plan["space"], base["space"])
            self.assertNotEqual(colour_plan["color"], base["color"])
            self.assertNotEqual(colour_plan["material"], base["material"])

            TOOLS.FEATURES.update_design_plan(
                project,
                {"parameters": {"composition": {"subject_scale": 1.35}}},
            )
            self.assertTrue(TOOLS.PROOFS.load_design_proofs(project)["active"]["stale"])
            with self.assertRaises(TOOLS.PROOFS.DesignProofError):
                TOOLS.PROOFS.select_design_proof(project, "A")

    def test_v05_vector_projects_reject_visible_artwork_text(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir) / "text-free-project"
            TOOLS.create_project(
                project,
                title="Text Free",
                layers=8,
                width=120,
                height=90,
                mode="vector-strict",
            )
            svg_path, _, _ = TOOLS.resolve_project(project)
            root = TOOLS.parse_svg(svg_path)
            first_layer = TOOLS.top_layers(root)[0]
            text_node = TOOLS.ET.SubElement(first_layer, TOOLS.svg_tag("text"), {"x": "10", "y": "20"})
            text_node.text = "NO"
            TOOLS.write_svg(svg_path, root)
            report = TOOLS.validate_project(project)
            self.assertFalse(report["ok"])
            self.assertTrue(any("text_policy.allowed_layers" in error for error in report["errors"]))

    def test_vector_text_exception_is_layer_scoped_and_survives_proofs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = Path(temp_dir) / "declared-text-project"
            TOOLS.create_project(
                project,
                title="Declared Text",
                layers=8,
                width=120,
                height=90,
                mode="vector-strict",
            )
            svg_path, _, _ = TOOLS.resolve_project(project)
            root = TOOLS.parse_svg(svg_path)
            layers = TOOLS.top_layers(root)
            for index, layer in enumerate(layers):
                TOOLS.ET.SubElement(
                    layer,
                    TOOLS.svg_tag("rect"),
                    {"x": str(index), "y": str(index), "width": "4", "height": "4", "fill": "#444"},
                )
            first_layer = layers[0]
            layer_id = first_layer.get("id")
            self.assertIsInstance(layer_id, str)

            plan_path = project / "design-plan.json"
            plan = TOOLS.FEATURES.read_json(plan_path, required=True)
            plan["artwork_text"] = True
            plan["text_policy"] = {
                "mode": "allow-declared-layers",
                "allowed_layers": [layer_id],
                "reason": "Explicit test fixture label",
            }
            TOOLS.FEATURES.write_json(plan_path, plan)
            text_node = TOOLS.ET.SubElement(first_layer, TOOLS.svg_tag("text"), {"x": "10", "y": "20"})
            text_node.text = "OK"
            TOOLS.write_svg(svg_path, root)

            report = TOOLS.validate_project(project)
            self.assertTrue(report["ok"], report["errors"])
            proofs = TOOLS.PROOFS.create_design_proofs(project)["proofs"]["active"]
            for variant in proofs["variants"]:
                candidate = TOOLS.FEATURES.read_json(project / variant["design_plan"], required=True)
                self.assertIs(candidate["artwork_text"], True)
                self.assertEqual(candidate["text_policy"]["allowed_layers"], [layer_id])

    @unittest.skipUnless(Image is not None, "Pillow is required for history tests")
    def test_layer_settings_create_history_diff_and_undo(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = self._make_raster_project(Path(temp_dir))
            TOOLS.RASTER.compose_project(project)
            before = TOOLS.RASTER.build_manifest(project)
            updated = TOOLS.update_layer_settings(
                project,
                "layer-lighting",
                opacity=0.6,
                blend_mode="screen",
                move="top",
            )
            self.assertIn("layer-lighting", updated["changed_layers"])
            history = TOOLS.FEATURES.list_history(project)
            self.assertEqual(history["count"], 1)
            snapshot_id = history["snapshots"][0]["id"]
            diff = TOOLS.history_diff(project, snapshot_id)
            self.assertIn("layer-lighting", diff["changed_layers"])

            restored = TOOLS.undo_to_snapshot(project, snapshot_id)
            self.assertEqual(restored["after_revision"], before["revision"])
            index = json.loads((project / "layers" / "index.json").read_text(encoding="utf-8"))
            lighting = next(layer for layer in index["layers"] if layer["id"] == "layer-lighting")
            self.assertEqual(lighting["opacity"], 1.0)
            self.assertEqual(lighting["blend_mode"], "normal")

    @unittest.skipUnless(Image is not None, "Pillow is required for mask tests")
    def test_selection_mask_is_saved_as_binary_project_asset(self) -> None:
        assert Image is not None and ImageDraw is not None
        with tempfile.TemporaryDirectory() as temp_dir:
            project = self._make_raster_project(Path(temp_dir))
            mask = Image.new("RGBA", (160, 120), (0, 0, 0, 0))
            ImageDraw.Draw(mask).ellipse((40, 20, 120, 100), fill=(169, 86, 73, 210))
            from io import BytesIO

            payload = BytesIO()
            mask.save(payload, format="PNG")
            entry = TOOLS.FEATURES.save_selection_mask(
                project,
                payload.getvalue(),
                canvas=(160, 120),
                selection_mode="brush",
            )
            mask_path = project / entry["file"]
            self.assertTrue(mask_path.is_file())
            with Image.open(mask_path) as saved:
                self.assertEqual(saved.mode, "L")
                pixels = saved.get_flattened_data() if hasattr(saved, "get_flattened_data") else saved.getdata()
                self.assertLessEqual(set(pixels), {0, 255})

    @unittest.skipUnless(Image is not None, "Pillow is required for local editor tests")
    def test_local_editor_rejects_cross_site_writes_and_oversized_uploads(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = self._make_raster_project(Path(temp_dir))
            ready = threading.Event()
            state: dict[str, object] = {}

            def editor_ready(server: object, url: str) -> None:
                state["server"] = server
                state["url"] = url
                ready.set()

            thread = threading.Thread(
                target=TOOLS.serve_editor,
                kwargs={
                    "raw_target": project,
                    "host": "127.0.0.1",
                    "port": 0,
                    "open_browser": False,
                    "_ready_callback": editor_ready,
                },
                daemon=True,
            )
            thread.start()
            self.assertTrue(ready.wait(5), "local editor did not start")
            server = state["server"]
            port = server.server_port  # type: ignore[attr-defined]
            origin = f"http://127.0.0.1:{port}"
            index_path = project / "layers" / "index.json"
            before = json.loads(index_path.read_text(encoding="utf-8"))
            layer_id = before["layers"][0]["id"]
            mutation = json.dumps({"layer_id": layer_id, "opacity": 0.37})

            try:
                connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                connection.request("GET", "/api/session")
                response = connection.getresponse()
                session = json.loads(response.read().decode("utf-8"))
                self.assertEqual(response.status, 200)
                token = session["token"]
                connection.close()

                attack = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                attack.request(
                    "POST",
                    "/api/layer-settings",
                    body=mutation,
                    headers={"Content-Type": "text/plain", "Origin": "https://attacker.example"},
                )
                attack_response = attack.getresponse()
                attack_response.read()
                self.assertEqual(attack_response.status, 403)
                attack.close()
                unchanged = json.loads(index_path.read_text(encoding="utf-8"))
                self.assertEqual(unchanged["layers"][0]["opacity"], 1.0)

                rebound = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                rebound.putrequest("GET", "/api/session", skip_host=True)
                rebound.putheader("Host", "attacker.example")
                rebound.endheaders()
                rebound_response = rebound.getresponse()
                rebound_response.read()
                self.assertEqual(rebound_response.status, 403)
                rebound.close()

                oversized = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                oversized.putrequest("POST", "/api/layer-settings")
                oversized.putheader("Origin", origin)
                oversized.putheader("Content-Type", "application/json")
                oversized.putheader(TOOLS.EDITOR_SESSION_HEADER, token)
                oversized.putheader("Content-Length", str(TOOLS.MAX_EDITOR_JSON_BYTES + 1))
                oversized.endheaders()
                oversized_response = oversized.getresponse()
                oversized_response.read()
                self.assertEqual(oversized_response.status, 413)
                oversized.close()

                valid = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                valid.request(
                    "POST",
                    "/api/layer-settings",
                    body=mutation,
                    headers={
                        "Content-Type": "application/json",
                        "Origin": origin,
                        TOOLS.EDITOR_SESSION_HEADER: token,
                    },
                )
                valid_response = valid.getresponse()
                valid_result = json.loads(valid_response.read().decode("utf-8"))
                self.assertEqual(valid_response.status, 200, valid_result)
                self.assertTrue(valid_result["ok"])
                valid.close()
                changed = json.loads(index_path.read_text(encoding="utf-8"))
                self.assertEqual(changed["layers"][0]["opacity"], 0.37)
            finally:
                server.shutdown()  # type: ignore[attr-defined]
                thread.join(timeout=5)

    def test_local_editor_rejects_non_loopback_bind(self) -> None:
        with self.assertRaises(TOOLS.LayeredRedrawError):
            TOOLS.serve_editor(self.sample, host="0.0.0.0", port=0, open_browser=False)

    @unittest.skipUnless(Image is not None, "Pillow is required for OpenRaster tests")
    def test_openraster_export_and_import_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            project = self._make_raster_project(root)
            TOOLS.RASTER.compose_project(project)
            TOOLS.update_layer_settings(project, "layer-lighting", blend_mode="screen", opacity=0.7)
            exported = TOOLS.RASTER.export_ora(project, root / "roundtrip.ora")
            self.assertTrue(Path(exported["ora"]).is_file())

            imported_project = root / "imported"
            imported = TOOLS.RASTER.import_ora(exported["ora"], imported_project)
            self.assertEqual(imported["mode"], "created")
            report = TOOLS.validate_project(imported_project)
            self.assertTrue(report["ok"], report["errors"])
            imported_index = json.loads(
                (imported_project / "layers" / "index.json").read_text(encoding="utf-8")
            )
            lighting = next(layer for layer in imported_index["layers"] if layer["id"] == "layer-lighting")
            self.assertEqual(lighting["blend_mode"], "screen")
            self.assertAlmostEqual(lighting["opacity"], 0.7)

    @unittest.skipUnless(Image is not None, "Pillow is required for hybrid layer tests")
    def test_hybrid_vector_source_keeps_a_registered_png_render(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = self._make_raster_project(Path(temp_dir))
            TOOLS.RASTER.compose_project(project)
            source = project / "layers" / "primary-subject.svg"
            source.write_text(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">'
                '<circle cx="80" cy="60" r="35" fill="#d85b46"/></svg>',
                encoding="utf-8",
            )
            result = TOOLS.update_layer_settings(
                project,
                "layer-primary-subject",
                layer_type="vector",
                editable_source="layers/primary-subject.svg",
            )
            self.assertIn("layer-primary-subject", result["changed_layers"])
            report = TOOLS.validate_project(project)
            self.assertTrue(report["ok"], report["errors"])
            manifest = TOOLS.RASTER.build_manifest(project)
            subject = next(layer for layer in manifest["layers"] if layer["id"] == "layer-primary-subject")
            self.assertEqual(subject["layer_type"], "vector")
            self.assertIsNotNone(subject["editable_source_sha256"])

    @unittest.skipUnless(Image is not None, "Pillow is required for direction-board tests")
    def test_direction_board_records_candidates_and_selected_direction(self) -> None:
        assert Image is not None
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            project = self._make_raster_project(root)
            candidates = []
            for index, color in enumerate(((180, 80, 60), (60, 100, 180), (210, 160, 70)), start=1):
                path = root / f"candidate-{index}.png"
                Image.new("RGB", (200, 120), color).save(path)
                candidates.append((f"Direction {index}", path))
            result = TOOLS.FEATURES.create_direction_board(
                project,
                candidates,
                selected="direction-2",
            )
            self.assertTrue(Path(result["contact_sheet"]).is_file())
            self.assertEqual(result["selected"], "direction-2")
            board = json.loads((project / "directions" / "index.json").read_text(encoding="utf-8"))
            self.assertEqual(len(board["candidates"]), 3)


if __name__ == "__main__":
    unittest.main()
