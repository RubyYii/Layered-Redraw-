#!/usr/bin/env python3
"""Raster-layered project support for Layered Redraw.

The image-generation step belongs to Codex and the selected image tool. This
module owns the deterministic part: project scaffolding, transparent PNG layer
validation, compositing, manifests, scoped layer replacement, and editor views.
"""

from __future__ import annotations

import hashlib
import html
import io
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile
import copy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
from xml.etree import ElementTree as ET

try:  # Raster mode is optional; vector-only commands stay dependency-free.
    from PIL import Image, ImageChops
except ImportError:  # pragma: no cover - exercised only without raster extras
    Image = None  # type: ignore[assignment]
    ImageChops = None  # type: ignore[assignment]

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import project_features as FEATURES  # noqa: E402


LAYER_ID_RE = re.compile(r"^layer-[a-z0-9]+(?:-[a-z0-9]+)*$")
SUPPORTED_LAYER_SUFFIXES = {".png"}
SUPPORTED_BLEND_MODES = {"normal", "multiply", "screen", "overlay", "darken", "lighten"}
SUPPORTED_LAYER_TYPES = {"raster", "vector", "pixel"}
ORA_BLEND_MODES = {
    "normal": "svg:src-over",
    "multiply": "svg:multiply",
    "screen": "svg:screen",
    "overlay": "svg:overlay",
    "darken": "svg:darken",
    "lighten": "svg:lighten",
}
ORA_BLEND_MODES_REVERSE = {value: key for key, value in ORA_BLEND_MODES.items()}
DEFAULT_LAYER_NAMES = [
    ("background", "背景", "Background"),
    ("sky", "天空", "Sky"),
    ("distant-forms", "远景", "Distant forms"),
    ("midground", "中景", "Midground"),
    ("primary-subject", "主体", "Primary subject"),
    ("secondary-subjects", "次要对象", "Secondary subjects"),
    ("ground-or-water", "地面或水面", "Ground or water"),
    ("lighting", "光影", "Lighting"),
    ("foreground", "前景", "Foreground"),
    ("atmosphere", "氛围与纹理", "Atmosphere and texture"),
]


class RasterLayeredError(RuntimeError):
    """Raised when a raster-layered project violates its contract."""


def _require_pillow() -> Any:
    if Image is None:
        raise RasterLayeredError(
            "raster-layered mode requires Pillow. Install it with: python -m pip install Pillow"
        )
    return Image


def _read_json(path: Path, *, required: bool = False) -> dict[str, Any]:
    if not path.exists():
        if required:
            raise RasterLayeredError(f"Missing required JSON file: {path}")
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RasterLayeredError(f"Unable to read JSON file {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise RasterLayeredError(f"JSON root must be an object: {path}")
    return value


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _resolve_inside(project_dir: Path, raw_relative: Any, *, field: str) -> Path:
    if not isinstance(raw_relative, str) or not raw_relative.strip():
        raise RasterLayeredError(f"{field} must be a non-empty project-relative path")
    candidate = (project_dir / raw_relative).resolve()
    if candidate != project_dir and project_dir not in candidate.parents:
        raise RasterLayeredError(f"{field} must stay inside the project directory")
    return candidate


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canvas(config: dict[str, Any], index: dict[str, Any]) -> tuple[int, int]:
    raw_canvas = config.get("canvas") or index.get("canvas")
    if not isinstance(raw_canvas, dict):
        raise RasterLayeredError("Raster project must define canvas width and height")
    width = raw_canvas.get("width")
    height = raw_canvas.get("height")
    if not isinstance(width, int) or isinstance(width, bool) or width <= 0:
        raise RasterLayeredError("canvas.width must be a positive integer")
    if not isinstance(height, int) or isinstance(height, bool) or height <= 0:
        raise RasterLayeredError("canvas.height must be a positive integer")
    return width, height


def resolve_project(raw_target: str | Path) -> tuple[Path, dict[str, Any], Path, dict[str, Any]]:
    project_dir = Path(raw_target).expanduser().resolve()
    if not project_dir.is_dir():
        raise RasterLayeredError("raster-layered commands require a project directory")
    config = _read_json(project_dir / "project.json", required=True)
    if config.get("output_mode") != "raster-layered":
        raise RasterLayeredError("Project output_mode is not raster-layered")
    index_path = _resolve_inside(
        project_dir,
        config.get("layer_index", "layers/index.json"),
        field="layer_index",
    )
    index = _read_json(index_path, required=True)
    return project_dir, config, index_path, index


def _is_pixel_art(config: dict[str, Any]) -> bool:
    return isinstance(config.get("pixel_art"), dict) or config.get("style") == "pixel-art"


def _layer_entries(index: dict[str, Any]) -> list[dict[str, Any]]:
    layers = index.get("layers")
    if not isinstance(layers, list) or not all(isinstance(item, dict) for item in layers):
        raise RasterLayeredError("layers/index.json layers must be an array of objects")
    return layers


def _image_info(path: Path) -> dict[str, Any]:
    pillow = _require_pillow()
    try:
        with pillow.open(path) as image:
            image.load()
            original_mode = image.mode
            has_alpha = "A" in image.getbands() or "transparency" in image.info
            rgba = image.convert("RGBA")
            alpha = rgba.getchannel("A")
            raw_bbox = alpha.getbbox()
            alpha_bbox = None
            if raw_bbox is not None:
                left, top, right, bottom = raw_bbox
                alpha_bbox = [left, top, right - left, bottom - top]
            alpha_min, alpha_max = alpha.getextrema()
            alpha_histogram = alpha.histogram()
            partial_alpha_pixels = sum(alpha_histogram[1:255])
            light_partial_pixels = 0
            if partial_alpha_pixels:
                pixels = rgba.get_flattened_data() if hasattr(rgba, "get_flattened_data") else rgba.getdata()
                light_partial_pixels = sum(
                    1
                    for red, green, blue, alpha_value in pixels
                    if 0 < alpha_value < 255 and red >= 248 and green >= 248 and blue >= 248
                )
            return {
                "width": image.width,
                "height": image.height,
                "mode": original_mode,
                "has_alpha": has_alpha,
                "alpha_bbox": alpha_bbox,
                "alpha_extrema": [alpha_min, alpha_max],
                "partial_alpha_pixels": partial_alpha_pixels,
                "light_partial_pixels": light_partial_pixels,
                "visible_pixels": sum(alpha_histogram[1:]),
            }
    except (OSError, ValueError) as exc:
        raise RasterLayeredError(f"Unable to read raster layer {path}: {exc}") from exc


def _visible_palette(path: Path, limit: int) -> set[tuple[int, int, int]] | None:
    pillow = _require_pillow()
    colors: set[tuple[int, int, int]] = set()
    try:
        with pillow.open(path) as image:
            rgba = image.convert("RGBA")
            pixels = rgba.get_flattened_data() if hasattr(rgba, "get_flattened_data") else rgba.getdata()
            for red, green, blue, alpha in pixels:
                if alpha == 0:
                    continue
                colors.add((red, green, blue))
                if len(colors) > limit:
                    return None
    except (OSError, ValueError) as exc:
        raise RasterLayeredError(f"Unable to inspect pixel-art palette for {path}: {exc}") from exc
    return colors


def _validate_editable_source(path: Path, layer_type: str) -> list[str]:
    errors: list[str] = []
    if layer_type != "vector":
        return errors
    if path.suffix.lower() != ".svg":
        return ["Vector editable_source must be an SVG file."]
    try:
        root = ET.fromstring(path.read_bytes())
    except (OSError, ET.ParseError) as exc:
        return [f"Vector editable_source is not valid SVG: {exc}"]
    if root.tag.rsplit("}", 1)[-1] != "svg":
        errors.append("Vector editable_source root must be svg.")
    for node in root.iter():
        local = node.tag.rsplit("}", 1)[-1]
        if local in {"script", "foreignObject", "iframe", "object", "embed"}:
            errors.append(f"Vector editable_source contains unsafe element {local}.")
        for name, value in node.attrib.items():
            lowered_name = name.rsplit("}", 1)[-1].lower()
            lowered_value = value.strip().lower()
            if lowered_name.startswith("on") or "javascript:" in lowered_value or "url(http" in lowered_value:
                errors.append("Vector editable_source contains unsafe executable attributes.")
    return sorted(set(errors))


def _manifest_layer(project_dir: Path, entry: dict[str, Any], position: int) -> dict[str, Any]:
    layer_id = entry.get("id")
    file_path: Path | None = None
    error: str | None = None
    info: dict[str, Any] = {}
    digest: str | None = None
    source_digest: str | None = None
    try:
        file_path = _resolve_inside(project_dir, entry.get("file"), field=f"{layer_id or position}.file")
        if file_path.is_file():
            digest = _sha256(file_path)
            info = _image_info(file_path)
        else:
            error = "missing"
    except RasterLayeredError as exc:
        error = str(exc)
    editable_source = entry.get("editable_source")
    if isinstance(editable_source, str) and editable_source.strip():
        try:
            source_path = _resolve_inside(project_dir, editable_source, field=f"{layer_id or position}.editable_source")
            if source_path.is_file():
                source_digest = _sha256(source_path)
        except RasterLayeredError:
            source_digest = None
    layer_type = entry.get("layer_type", "pixel" if entry.get("pixel_art") else "raster")
    state_payload = {
        "file_sha256": digest,
        "editable_source_sha256": source_digest,
        "layer_type": layer_type,
        "visible": entry.get("visible", True),
        "locked": entry.get("locked", False),
        "opacity": entry.get("opacity", 1.0),
        "blend_mode": entry.get("blend_mode", "normal"),
        "label": entry.get("label"),
        "label_zh": entry.get("label_zh"),
        "label_en": entry.get("label_en"),
        "depends_on": entry.get("depends_on", []),
        "z_index": entry.get("z_index", position),
    }
    state_digest = hashlib.sha256(
        json.dumps(state_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        "id": layer_id,
        "label": entry.get("label") or entry.get("label_en") or layer_id,
        "label_zh": entry.get("label_zh"),
        "label_en": entry.get("label_en"),
        "z_index": entry.get("z_index", position),
        "file": entry.get("file"),
        "sha256": digest,
        "state_sha256": state_digest,
        "layer_type": layer_type,
        "editable_source": editable_source,
        "editable_source_sha256": source_digest,
        "width": info.get("width"),
        "height": info.get("height"),
        "pixel_mode": info.get("mode"),
        "has_alpha": info.get("has_alpha"),
        "alpha_bbox": info.get("alpha_bbox"),
        "alpha_extrema": info.get("alpha_extrema"),
        "partial_alpha_pixels": info.get("partial_alpha_pixels"),
        "light_partial_pixels": info.get("light_partial_pixels"),
        "visible_pixels": info.get("visible_pixels"),
        "visible": entry.get("visible", True),
        "locked": entry.get("locked", False),
        "opacity": entry.get("opacity", 1.0),
        "blend_mode": entry.get("blend_mode", "normal"),
        "depends_on": entry.get("depends_on", []),
        "error": error,
    }


def build_manifest(raw_target: str | Path) -> dict[str, Any]:
    project_dir, config, _, index = resolve_project(raw_target)
    width, height = _canvas(config, index)
    entries = _layer_entries(index)
    layers = [_manifest_layer(project_dir, entry, position) for position, entry in enumerate(entries, 1)]
    design_plan_digest = FEATURES.design_plan_sha256(project_dir, config)
    revision_payload = {
        "schema_version": config.get("schema_version", "1.0"),
        "title": config.get("title"),
        "output_mode": "raster-layered",
        "canvas": {"width": width, "height": height},
        "style": config.get("style"),
        "style_recipe": config.get("style_recipe"),
        "workflow_mode": config.get("workflow_mode", "guided"),
        "design_preset": config.get("design_preset"),
        "design_plan_sha256": design_plan_digest,
        "layer_model": config.get("layer_model", "semantic-raster"),
        "pixel_art": config.get("pixel_art") if _is_pixel_art(config) else None,
        "layers": [
            {
                "id": item.get("id"),
                "file": item.get("file"),
                "sha256": item.get("sha256"),
                "state_sha256": item.get("state_sha256"),
                "layer_type": item.get("layer_type"),
                "editable_source_sha256": item.get("editable_source_sha256"),
                "visible": item.get("visible"),
                "locked": item.get("locked"),
                "opacity": item.get("opacity"),
                "blend_mode": item.get("blend_mode"),
                "depends_on": item.get("depends_on"),
            }
            for item in layers
        ],
    }
    revision = hashlib.sha256(
        json.dumps(revision_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:12]
    return {
        "schema_version": "1.0",
        "kind": "layered-raster-manifest",
        "title": config.get("title", "Untitled"),
        "revision": revision,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "canvas": {"width": width, "height": height, "color_space": "sRGB"},
        "output_mode": "raster-layered",
        "style": config.get("style"),
        "style_recipe": config.get("style_recipe"),
        "workflow_mode": config.get("workflow_mode", "guided"),
        "design_plan": config.get("design_plan"),
        "design_preset": config.get("design_preset"),
        "design_plan_sha256": design_plan_digest,
        "layer_model": config.get("layer_model", "semantic-raster"),
        "pixel_art": config.get("pixel_art") if _is_pixel_art(config) else None,
        "layer_count": len(layers),
        "canonical_composite": config.get("canonical_composite", "artwork.png"),
        "layers": layers,
    }


def validate_project(raw_target: str | Path, *, write_manifest_file: bool = False) -> dict[str, Any]:
    project_dir, config, _, index = resolve_project(raw_target)
    width, height = _canvas(config, index)
    entries = _layer_entries(index)
    errors: list[str] = []
    warnings: list[str] = []
    style = config.get("style")
    pixel_art = _is_pixel_art(config)
    pixel_options = config.get("pixel_art", {}) if pixel_art else {}
    if pixel_art and not isinstance(pixel_options, dict):
        errors.append("project.json pixel_art must be an object for the pixel-art preset.")
        pixel_options = {}
    palette_size = pixel_options.get("palette_size", 32) if pixel_art else None
    preview_scale = pixel_options.get("preview_scale", 4) if pixel_art else 1
    if pixel_art and (
        not isinstance(palette_size, int)
        or isinstance(palette_size, bool)
        or not 2 <= palette_size <= 256
    ):
        errors.append("pixel_art.palette_size must be an integer between 2 and 256.")
        palette_size = 32
    if pixel_art and (
        not isinstance(preview_scale, int)
        or isinstance(preview_scale, bool)
        or not 1 <= preview_scale <= 16
    ):
        errors.append("pixel_art.preview_scale must be an integer between 1 and 16.")
        preview_scale = 4
    if pixel_art and (width > 512 or height > 512):
        warnings.append(
            f"Pixel-art logical canvas is {width}×{height}; 512 pixels or less per side is recommended."
        )
    if pixel_art and (
        width * preview_scale > 16384
        or height * preview_scale > 16384
        or width * height * preview_scale * preview_scale > 100_000_000
    ):
        errors.append("The nearest-neighbour preview would be too large; reduce the canvas or preview scale.")
    pixel_palette: set[tuple[int, int, int]] = set()
    style_recipe_path = project_dir / str(config.get("style_recipe")) if config.get("style_recipe") else None
    if style_recipe_path is not None and not style_recipe_path.is_file():
        warnings.append("The project has a style id but no installed style-recipe.json.")

    if not 5 <= len(entries) <= 20:
        errors.append(f"Expected 5–20 semantic raster layers; found {len(entries)}.")
    elif not 8 <= len(entries) <= 12:
        warnings.append(f"Layer count {len(entries)} is valid but outside the preferred 8–12 range.")
    if config.get("target_layers") not in {None, len(entries)}:
        warnings.append("project.json target_layers does not match layers/index.json.")

    seen: set[str] = set()
    seen_files: dict[str, str] = {}
    seen_content: dict[str, str] = {}
    known_layer_ids = {
        entry.get("id") for entry in entries if isinstance(entry.get("id"), str)
    }
    for position, entry in enumerate(entries, start=1):
        layer_id = entry.get("id")
        if not isinstance(layer_id, str) or not LAYER_ID_RE.fullmatch(layer_id):
            errors.append(f"Layer {position} has an invalid id: {layer_id}")
            continue
        if layer_id in seen:
            errors.append(f"Duplicate raster layer id: {layer_id}")
        seen.add(layer_id)
        if not isinstance(entry.get("label") or entry.get("label_en"), str):
            errors.append(f"Layer {layer_id} is missing a human-readable label.")
        if entry.get("z_index", position) != position:
            warnings.append(f"Layer {layer_id} z_index should be {position}.")
        opacity = entry.get("opacity", 1.0)
        if not isinstance(opacity, (int, float)) or isinstance(opacity, bool) or not 0 <= opacity <= 1:
            errors.append(f"Layer {layer_id} opacity must be between 0 and 1.")
        elif pixel_art and opacity != 1:
            errors.append(f"Pixel-art layer {layer_id} must use opacity 1 to avoid blended colors.")
        blend_mode = entry.get("blend_mode", "normal")
        if blend_mode not in SUPPORTED_BLEND_MODES:
            errors.append(
                f"Layer {layer_id} uses unsupported blend_mode {blend_mode!r}; "
                f"choose from {', '.join(sorted(SUPPORTED_BLEND_MODES))}."
            )
        layer_type = entry.get("layer_type", "pixel" if pixel_art else "raster")
        if layer_type not in SUPPORTED_LAYER_TYPES:
            errors.append(
                f"Layer {layer_id} uses unsupported layer_type {layer_type!r}; "
                f"choose from {', '.join(sorted(SUPPORTED_LAYER_TYPES))}."
            )
        if pixel_art and layer_type != "pixel":
            errors.append(f"Pixel-art project layer {layer_id} must use layer_type pixel.")
        depends_on = entry.get("depends_on", [])
        if not isinstance(depends_on, list) or not all(isinstance(value, str) for value in depends_on):
            errors.append(f"Layer {layer_id} depends_on must be an array of layer IDs.")
        else:
            unknown_dependencies = sorted(set(depends_on) - known_layer_ids)
            if unknown_dependencies:
                errors.append(
                    f"Layer {layer_id} depends on unknown layers: {', '.join(unknown_dependencies)}."
                )
            if layer_id in depends_on:
                errors.append(f"Layer {layer_id} cannot depend on itself.")
        editable_source = entry.get("editable_source")
        if layer_type == "vector" and not isinstance(editable_source, str):
            errors.append(f"Vector layer {layer_id} requires editable_source pointing to an SVG file.")
        elif isinstance(editable_source, str):
            try:
                source_path = _resolve_inside(
                    project_dir, editable_source, field=f"{layer_id}.editable_source"
                )
                if not source_path.is_file():
                    errors.append(f"Editable source does not exist for {layer_id}: {editable_source}")
                else:
                    errors.extend(
                        f"Layer {layer_id}: {message}"
                        for message in _validate_editable_source(source_path, str(layer_type))
                    )
            except RasterLayeredError as exc:
                errors.append(str(exc))
        try:
            layer_path = _resolve_inside(project_dir, entry.get("file"), field=f"{layer_id}.file")
        except RasterLayeredError as exc:
            errors.append(str(exc))
            continue
        normalized_path = os.path.normcase(str(layer_path))
        if normalized_path in seen_files:
            errors.append(
                f"Layers {seen_files[normalized_path]} and {layer_id} reference the same PNG file."
            )
        else:
            seen_files[normalized_path] = layer_id
        if layer_path.suffix.lower() not in SUPPORTED_LAYER_SUFFIXES:
            errors.append(f"Layer {layer_id} must use a PNG file.")
            continue
        if not layer_path.is_file():
            errors.append(f"Layer file does not exist: {entry.get('file')}")
            continue
        try:
            info = _image_info(layer_path)
        except RasterLayeredError as exc:
            errors.append(str(exc))
            continue
        content_digest = _sha256(layer_path)
        if content_digest in seen_content:
            warnings.append(
                f"Layers {seen_content[content_digest]} and {layer_id} contain identical rendered pixels."
            )
        else:
            seen_content[content_digest] = layer_id
        if (info["width"], info["height"]) != (width, height):
            errors.append(
                f"Layer {layer_id} is {info['width']}×{info['height']}; expected {width}×{height}."
            )
        if info["alpha_bbox"] is None:
            errors.append(f"Layer {layer_id} is fully transparent and therefore empty.")
        if position > 1 and not info["has_alpha"]:
            errors.append(f"Layer {layer_id} must retain an alpha channel for independent compositing.")
        elif position > 1 and info["alpha_extrema"] and info["alpha_extrema"][0] == 255:
            errors.append(
                f"Layer {layer_id} is fully opaque; upper layers must contain transparent pixels."
            )
        if position == 1 and info["alpha_extrema"] and info["alpha_extrema"][0] < 255:
            message = "The bottom raster layer is not fully opaque; the final composite may be transparent."
            if pixel_art:
                errors.append(message)
            else:
                warnings.append(message)
        if pixel_art and position > 1 and info.get("partial_alpha_pixels", 0) > 0:
            errors.append(
                f"Pixel-art layer {layer_id} contains partial alpha; use only alpha 0 or 255."
            )
        if position > 1 and info.get("visible_pixels"):
            visible_ratio = float(info["visible_pixels"]) / float(width * height)
            if visible_ratio > 0.96:
                warnings.append(
                    f"Upper layer {layer_id} covers {visible_ratio:.1%} of the canvas; check for baked lower-layer content."
                )
        partial = int(info.get("partial_alpha_pixels") or 0)
        light_partial = int(info.get("light_partial_pixels") or 0)
        if not pixel_art and partial > 100 and light_partial / partial > 0.65:
            warnings.append(
                f"Layer {layer_id} has many near-white semi-transparent edge pixels; inspect for alpha halos."
            )
        if pixel_art:
            colors = _visible_palette(layer_path, int(palette_size))
            if colors is None:
                errors.append(
                    f"Pixel-art layer {layer_id} exceeds the {palette_size}-color project palette limit."
                )
            else:
                pixel_palette.update(colors)

    if pixel_art and len(pixel_palette) > int(palette_size):
        errors.append(
            f"Pixel-art layers use {len(pixel_palette)} visible colors; the project limit is {palette_size}."
        )

    dependency_graph = {
        str(entry.get("id")): list(entry.get("depends_on", []))
        for entry in entries
        if isinstance(entry.get("id"), str) and isinstance(entry.get("depends_on", []), list)
    }
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit_dependency(layer_id: str) -> bool:
        if layer_id in visiting:
            return True
        if layer_id in visited:
            return False
        visiting.add(layer_id)
        has_cycle = any(
            dependency in dependency_graph and visit_dependency(dependency)
            for dependency in dependency_graph.get(layer_id, [])
        )
        visiting.remove(layer_id)
        visited.add(layer_id)
        return has_cycle

    if any(visit_dependency(layer_id) for layer_id in dependency_graph):
        errors.append("Layer depends_on relationships contain a cycle.")

    manifest = build_manifest(project_dir)
    manifest_path = project_dir / "manifest.json"
    previous = _read_json(manifest_path)
    if previous and previous.get("revision") != manifest["revision"]:
        warnings.append("manifest.json is stale and should be regenerated.")

    composite_path = _resolve_inside(
        project_dir,
        config.get("canonical_composite", "artwork.png"),
        field="canonical_composite",
    )
    preview_path = _resolve_inside(project_dir, config.get("preview", "preview.png"), field="preview")
    if pixel_art and preview_scale > 1 and preview_path == composite_path:
        errors.append("Pixel-art artwork and scaled preview must use different files.")
    composition = _read_json(project_dir / "composition.json")
    if not composite_path.is_file():
        warnings.append("Composite artwork is missing; run the compose command after all layers are ready.")
    elif composition.get("source_revision") != manifest["revision"]:
        warnings.append("Composite artwork is stale and should be regenerated.")
    if composite_path.is_file() and not preview_path.is_file():
        warnings.append("Preview artwork is missing; run the compose command to regenerate it.")
    elif preview_path.is_file() and pixel_art:
        try:
            preview_info = _image_info(preview_path)
            expected_preview = (width * preview_scale, height * preview_scale)
            if (preview_info["width"], preview_info["height"]) != expected_preview:
                warnings.append(
                    f"Pixel-art preview is {preview_info['width']}×{preview_info['height']}; expected "
                    f"{expected_preview[0]}×{expected_preview[1]}."
                )
        except RasterLayeredError as exc:
            errors.append(str(exc))

    errors = sorted(set(errors))
    warnings = sorted(set(warnings))
    if write_manifest_file and not errors:
        _write_json(manifest_path, manifest)
    return {
        "ok": not errors,
        "project": str(project_dir),
        "manifest": str(manifest_path),
        "layer_count": len(entries),
        "revision": manifest["revision"],
        "style": style,
        "palette_color_count": len(pixel_palette) if pixel_art else None,
        "preview_scale": preview_scale,
        "errors": errors,
        "warnings": warnings,
    }


def quality_report(raw_target: str | Path) -> dict[str, Any]:
    project_dir, config, _, _ = resolve_project(raw_target)
    validation = validate_project(project_dir)
    manifest = build_manifest(project_dir)
    checks = {
        "contract": validation["ok"],
        "layer_count_preferred": 8 <= manifest["layer_count"] <= 12,
        "style_recipe_installed": not config.get("style") or (project_dir / "style-recipe.json").is_file(),
        "composite_current": not any("Composite artwork is stale" in item for item in validation["warnings"]),
        "no_duplicate_pixels": not any("identical rendered pixels" in item for item in validation["warnings"]),
        "no_alpha_halo_warning": not any("alpha halos" in item for item in validation["warnings"]),
        "no_baked_upper_layer_warning": not any("baked lower-layer" in item for item in validation["warnings"]),
    }
    engineering_score = max(0, 100 - len(validation["errors"]) * 20 - len(validation["warnings"]) * 4)
    return {
        "ok": validation["ok"],
        "project": str(project_dir),
        "revision": manifest["revision"],
        "assessment_scope": "layer-files-and-project-contract-only",
        "engineering_score": engineering_score,
        "visual_quality": {
            "status": "not-assessed",
            "human_confirmed": False,
        },
        "checks": checks,
        "errors": validation["errors"],
        "warnings": validation["warnings"],
        "layers": [
            {
                "id": layer["id"],
                "layer_type": layer.get("layer_type"),
                "blend_mode": layer.get("blend_mode"),
                "alpha_bbox": layer.get("alpha_bbox"),
                "visible_pixels": layer.get("visible_pixels"),
            }
            for layer in manifest["layers"]
        ],
    }


def _atomic_save_png(image: Any, destination: Path) -> None:
    # PNG compression is not byte-for-byte stable across every Pillow/zlib
    # platform combination.  Derived previews are current when their decoded
    # RGBA pixels are current, so keep an existing equivalent file instead of
    # rewriting it with a platform-specific encoding.  This also keeps the
    # composition hashes and generated_at value stable across Windows/Linux.
    if destination.is_file():
        try:
            with _require_pillow().open(destination) as existing:
                if existing.size == image.size and existing.convert("RGBA").tobytes() == image.convert(
                    "RGBA"
                ).tobytes():
                    return
        except OSError:
            # A corrupt or unreadable destination is replaced below.
            pass
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="wb", suffix=".png", prefix="layered-raster-", dir=destination.parent, delete=False
    ) as handle:
        temp_path = Path(handle.name)
    try:
        image.save(temp_path, format="PNG", optimize=True)
        os.replace(temp_path, destination)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def _blend_composite(base: Any, layer: Any, blend_mode: str) -> Any:
    pillow = _require_pillow()
    if blend_mode == "normal":
        return pillow.alpha_composite(base, layer)
    if ImageChops is None:  # pragma: no cover - Pillow always exposes ImageChops when installed
        raise RasterLayeredError("Blend modes require Pillow ImageChops")
    base_rgb = base.convert("RGB")
    layer_rgb = layer.convert("RGB")
    if blend_mode == "multiply":
        blended_rgb = ImageChops.multiply(base_rgb, layer_rgb)
    elif blend_mode == "screen":
        blended_rgb = ImageChops.screen(base_rgb, layer_rgb)
    elif blend_mode == "overlay":
        if not hasattr(ImageChops, "overlay"):
            raise RasterLayeredError("This Pillow version does not support overlay blend mode")
        blended_rgb = ImageChops.overlay(base_rgb, layer_rgb)
    elif blend_mode == "darken":
        blended_rgb = ImageChops.darker(base_rgb, layer_rgb)
    elif blend_mode == "lighten":
        blended_rgb = ImageChops.lighter(base_rgb, layer_rgb)
    else:  # validate_project rejects this before composition
        raise RasterLayeredError(f"Unsupported blend mode: {blend_mode}")
    blended = blended_rgb.convert("RGBA")
    blended.putalpha(layer.getchannel("A"))
    return pillow.alpha_composite(base, blended)


def compose_project(raw_target: str | Path) -> dict[str, Any]:
    pillow = _require_pillow()
    project_dir, config, _, index = resolve_project(raw_target)
    manifest_path = project_dir / "manifest.json"
    composition_path = project_dir / "composition.json"
    previous_manifest = _read_json(manifest_path)
    previous_composition = _read_json(composition_path)
    report = validate_project(project_dir)
    if report["errors"]:
        raise RasterLayeredError("Cannot compose invalid raster project: " + "; ".join(report["errors"]))
    width, height = _canvas(config, index)
    composite = pillow.new("RGBA", (width, height), (0, 0, 0, 0))
    for entry in _layer_entries(index):
        if entry.get("visible", True) is False:
            continue
        layer_path = _resolve_inside(project_dir, entry.get("file"), field=f"{entry.get('id')}.file")
        with pillow.open(layer_path) as source:
            layer = source.convert("RGBA")
        opacity = float(entry.get("opacity", 1.0))
        if opacity < 1:
            alpha = layer.getchannel("A").point(lambda value: round(value * opacity))
            layer.putalpha(alpha)
        composite = _blend_composite(composite, layer, str(entry.get("blend_mode", "normal")))

    composite_path = _resolve_inside(
        project_dir,
        config.get("canonical_composite", "artwork.png"),
        field="canonical_composite",
    )
    preview_path = _resolve_inside(project_dir, config.get("preview", "preview.png"), field="preview")
    preview_scale = 1
    preview = composite
    if _is_pixel_art(config):
        pixel_options = config.get("pixel_art", {})
        preview_scale = int(pixel_options.get("preview_scale", 4))
        preview = composite.resize(
            (width * preview_scale, height * preview_scale),
            resample=pillow.Resampling.NEAREST,
        )
    _atomic_save_png(composite, composite_path)
    _atomic_save_png(preview, preview_path)
    manifest = build_manifest(project_dir)
    if previous_manifest.get("revision") == manifest["revision"] and isinstance(
        previous_manifest.get("generated_at"), str
    ):
        manifest["generated_at"] = previous_manifest["generated_at"]
    _write_json(manifest_path, manifest)
    composition = {
        "schema_version": "1.0",
        "kind": "layered-raster-composition",
        "source_revision": manifest["revision"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "artwork": composite_path.relative_to(project_dir).as_posix(),
        "artwork_sha256": _sha256(composite_path),
        "preview": preview_path.relative_to(project_dir).as_posix(),
        "preview_sha256": _sha256(preview_path),
        "preview_scale": preview_scale,
        "preview_size": [preview.width, preview.height],
        "resampling": "nearest" if preview_scale > 1 else "none",
    }
    comparable = {key: value for key, value in composition.items() if key != "generated_at"}
    previous_comparable = {
        key: value for key, value in previous_composition.items() if key != "generated_at"
    }
    if comparable == previous_comparable and isinstance(previous_composition.get("generated_at"), str):
        composition["generated_at"] = previous_composition["generated_at"]
    _write_json(composition_path, composition)
    return {
        "ok": True,
        "project": str(project_dir),
        "artwork": str(composite_path),
        "preview": str(preview_path),
        "manifest": str(project_dir / "manifest.json"),
        "revision": manifest["revision"],
        "layer_count": manifest["layer_count"],
        "style": config.get("style"),
        "preview_scale": preview_scale,
    }


def export_ora(raw_target: str | Path, output: str | Path | None = None) -> dict[str, Any]:
    """Export a raster-layered project as an OpenRaster round-trip package."""

    pillow = _require_pillow()
    project_dir, config, _, index = resolve_project(raw_target)
    validation = validate_project(project_dir)
    if validation["errors"]:
        raise RasterLayeredError("Cannot export invalid raster project: " + "; ".join(validation["errors"]))
    composed = compose_project(project_dir)
    width, height = _canvas(config, index)
    output_path = (
        Path(output).expanduser().resolve()
        if output is not None
        else project_dir / f"{re.sub(r'[^a-zA-Z0-9_-]+', '-', str(config.get('title', 'layered-redraw'))).strip('-') or 'layered-redraw'}.ora"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    image_root = ET.Element(
        "image",
        {
            "version": "0.0.1",
            "w": str(width),
            "h": str(height),
            "name": str(config.get("title", "Layered Redraw")),
        },
    )
    stack = ET.SubElement(image_root, "stack", {"name": "Layered Redraw"})
    payloads: list[tuple[str, bytes]] = []
    for position, entry in reversed(list(enumerate(_layer_entries(index), start=1))):
        layer_id = str(entry.get("id"))
        source = _resolve_inside(project_dir, entry.get("file"), field=f"{layer_id}.file")
        archive_name = f"data/{position:02d}-{layer_id}.png"
        label = str(entry.get("label_en") or entry.get("label") or layer_id)
        ET.SubElement(
            stack,
            "layer",
            {
                "name": f"{layer_id} · {label}",
                "src": archive_name,
                "visibility": "visible" if entry.get("visible", True) else "hidden",
                "opacity": f"{float(entry.get('opacity', 1.0)):g}",
                "composite-op": ORA_BLEND_MODES.get(str(entry.get("blend_mode", "normal")), "svg:src-over"),
            },
        )
        payloads.append((archive_name, source.read_bytes()))

    with pillow.open(composed["artwork"]) as image:
        merged = io.BytesIO()
        image.convert("RGBA").save(merged, format="PNG", optimize=True)
        thumbnail_image = image.convert("RGBA")
        thumbnail_image.thumbnail((256, 256), resample=pillow.Resampling.LANCZOS)
        thumbnail = io.BytesIO()
        thumbnail_image.save(thumbnail, format="PNG", optimize=True)

    with tempfile.NamedTemporaryFile(
        mode="wb", suffix=".ora", prefix="layered-redraw-ora-", dir=output_path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
    try:
        with zipfile.ZipFile(temporary, "w") as archive:
            archive.writestr("mimetype", "image/openraster", compress_type=zipfile.ZIP_STORED)
            archive.writestr(
                "stack.xml",
                ET.tostring(image_root, encoding="utf-8", xml_declaration=True),
                compress_type=zipfile.ZIP_DEFLATED,
            )
            archive.writestr("mergedimage.png", merged.getvalue(), compress_type=zipfile.ZIP_DEFLATED)
            archive.writestr("Thumbnails/thumbnail.png", thumbnail.getvalue(), compress_type=zipfile.ZIP_DEFLATED)
            for archive_name, payload in payloads:
                archive.writestr(archive_name, payload, compress_type=zipfile.ZIP_DEFLATED)
        os.replace(temporary, output_path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return {
        "ok": True,
        "project": str(project_dir),
        "ora": str(output_path),
        "layers": len(payloads),
        "revision": validation["revision"],
    }


def _read_ora(ora_path: Path) -> tuple[int, int, str, list[dict[str, Any]]]:
    pillow = _require_pillow()
    try:
        archive = zipfile.ZipFile(ora_path, "r")
    except (OSError, zipfile.BadZipFile) as exc:
        raise RasterLayeredError(f"Unable to open ORA file: {exc}") from exc
    with archive:
        infos = archive.infolist()
        if sum(info.file_size for info in infos) > 1_000_000_000:
            raise RasterLayeredError("ORA archive expands beyond the 1 GB safety limit")
        if "stack.xml" not in archive.namelist():
            raise RasterLayeredError("ORA archive is missing stack.xml")
        try:
            root = ET.fromstring(archive.read("stack.xml"))
        except ET.ParseError as exc:
            raise RasterLayeredError(f"ORA stack.xml is invalid: {exc}") from exc
        width = int(root.get("w", "0"))
        height = int(root.get("h", "0"))
        if width <= 0 or height <= 0:
            raise RasterLayeredError("ORA canvas dimensions must be positive")
        stack = root.find("stack")
        if stack is None:
            raise RasterLayeredError("ORA stack.xml is missing the root stack")
        top_to_bottom = [node for node in stack if node.tag.rsplit("}", 1)[-1] == "layer"]
        if not 5 <= len(top_to_bottom) <= 20:
            raise RasterLayeredError(f"ORA import requires 5–20 layers; found {len(top_to_bottom)}")
        layers: list[dict[str, Any]] = []
        for node in reversed(top_to_bottom):
            src = node.get("src", "")
            member = Path(src)
            if member.is_absolute() or ".." in member.parts or src not in archive.namelist():
                raise RasterLayeredError(f"Unsafe or missing ORA layer source: {src}")
            payload = archive.read(src)
            try:
                with pillow.open(io.BytesIO(payload)) as image:
                    image.load()
                    if image.size != (width, height):
                        raise RasterLayeredError(
                            f"ORA layer {src} is {image.width}×{image.height}; expected {width}×{height}"
                        )
                    converted = io.BytesIO()
                    image.convert("RGBA").save(converted, format="PNG", optimize=True)
            except (OSError, ValueError) as exc:
                raise RasterLayeredError(f"Unable to decode ORA layer {src}: {exc}") from exc
            raw_name = node.get("name", "Layer")
            match = re.match(r"^(layer-[a-z0-9]+(?:-[a-z0-9]+)*)\s*[·|:-]", raw_name)
            layers.append(
                {
                    "id": match.group(1) if match else None,
                    "label": raw_name.split("·", 1)[-1].strip() or raw_name,
                    "png": converted.getvalue(),
                    "visible": node.get("visibility", "visible") != "hidden",
                    "opacity": float(node.get("opacity", "1")),
                    "blend_mode": ORA_BLEND_MODES_REVERSE.get(node.get("composite-op", "svg:src-over"), "normal"),
                }
            )
        return width, height, root.get("name", ora_path.stem), layers


def import_ora(ora: str | Path, output: str | Path) -> dict[str, Any]:
    """Create a project from ORA, or sync an exported ORA back into its project."""

    ora_path = Path(ora).expanduser().resolve()
    if not ora_path.is_file():
        raise RasterLayeredError(f"ORA file does not exist: {ora_path}")
    width, height, title, imported = _read_ora(ora_path)
    project_dir = Path(output).expanduser().resolve()
    updating = (project_dir / "project.json").is_file()
    if not updating:
        create_project(project_dir, title=title, layers=len(imported), width=width, height=height)
    project_dir, config, index_path, index = resolve_project(project_dir)
    canvas = _canvas(config, index)
    if canvas != (width, height):
        raise RasterLayeredError(
            f"ORA canvas is {width}×{height}; target project canvas is {canvas[0]}×{canvas[1]}"
        )
    entries = _layer_entries(index)
    if len(entries) != len(imported):
        raise RasterLayeredError(
            f"ORA has {len(imported)} layers but target project has {len(entries)}"
        )
    before = build_manifest(project_dir) if updating else None
    if before:
        FEATURES.create_snapshot(project_dir, before, reason=f"Before ORA round-trip import: {ora_path.name}")

    by_id = {entry.get("id"): entry for entry in entries}
    imported_ids = {item.get("id") for item in imported if item.get("id")}
    if updating and imported_ids and imported_ids != set(by_id):
        raise RasterLayeredError("ORA layer IDs do not match the target project")

    backups: dict[Path, bytes | None] = {index_path: index_path.read_bytes()}
    candidate_entries: list[dict[str, Any]] = []
    for position, item in enumerate(imported, start=1):
        target = (
            by_id.get(item.get("id"))
            if updating and item.get("id")
            else entries[position - 1]
        )
        if target is None:
            raise RasterLayeredError(f"Unable to map imported ORA layer {item.get('id')}")
        destination = _resolve_inside(project_dir, target.get("file"), field=f"{target.get('id')}.file")
        backups[destination] = destination.read_bytes() if destination.is_file() else None
        destination.write_bytes(item["png"])
        updated = copy.deepcopy(target)
        if not updating and isinstance(item.get("id"), str):
            updated["id"] = item["id"]
        updated["label"] = item["label"]
        updated["label_en"] = item["label"]
        updated["visible"] = item["visible"]
        updated["opacity"] = item["opacity"]
        updated["blend_mode"] = item["blend_mode"]
        updated["z_index"] = position
        candidate_entries.append(updated)
    index["layers"] = candidate_entries
    try:
        _write_json(index_path, index)
        validation = validate_project(project_dir)
        if validation["errors"]:
            raise RasterLayeredError("Imported ORA project is invalid: " + "; ".join(validation["errors"]))
        composed = compose_project(project_dir)
    except Exception:
        for path, payload in backups.items():
            if payload is None:
                if path.exists():
                    path.unlink()
            else:
                path.write_bytes(payload)
        raise
    return {
        "ok": True,
        "project": str(project_dir),
        "mode": "updated" if updating else "created",
        "layers": len(candidate_entries),
        "revision": composed["revision"],
        "artwork": composed["artwork"],
    }


def create_project(
    output: str | Path,
    *,
    title: str,
    layers: int,
    width: int,
    height: int,
    style: str | None = None,
    pixel_scale: int = 4,
    palette_size: int = 32,
) -> dict[str, Any]:
    if not 5 <= layers <= 20:
        raise RasterLayeredError("New raster projects require 5–20 layers")
    if width <= 0 or height <= 0:
        raise RasterLayeredError("Canvas dimensions must be positive")
    if style is not None and (not isinstance(style, str) or not style.strip()):
        raise RasterLayeredError("style must be a non-empty string when provided")
    style = FEATURES.normalize_style_id(style) if isinstance(style, str) else None
    recipe: dict[str, Any] | None = None
    if style:
        try:
            recipe = FEATURES.resolve_style_recipe(style)
        except FEATURES.ProjectFeatureError:
            recipe = None
    recipe_pixel = recipe.get("pixel_art") if isinstance(recipe, dict) else None
    pixel_art = style == "pixel-art" or isinstance(recipe_pixel, dict)
    if pixel_art and isinstance(recipe_pixel, dict):
        if palette_size == 32 and isinstance(recipe_pixel.get("palette_size"), int):
            palette_size = int(recipe_pixel["palette_size"])
        if pixel_scale == 4 and isinstance(recipe_pixel.get("preview_scale"), int):
            pixel_scale = int(recipe_pixel["preview_scale"])
    if pixel_art:
        if not isinstance(pixel_scale, int) or isinstance(pixel_scale, bool) or not 1 <= pixel_scale <= 16:
            raise RasterLayeredError("Pixel-art preview scale must be an integer between 1 and 16")
        if not isinstance(palette_size, int) or isinstance(palette_size, bool) or not 2 <= palette_size <= 256:
            raise RasterLayeredError("Pixel-art palette size must be an integer between 2 and 256")
    project_dir = Path(output).expanduser().resolve()
    if project_dir.exists() and not project_dir.is_dir():
        raise RasterLayeredError(f"Output path is not a directory: {project_dir}")
    if project_dir.exists() and any(project_dir.iterdir()):
        raise RasterLayeredError(f"Output directory is not empty: {project_dir}")
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "layers").mkdir(exist_ok=True)
    (project_dir / "prompts").mkdir(exist_ok=True)
    (project_dir / "patches").mkdir(exist_ok=True)
    (project_dir / "staging").mkdir(exist_ok=True)
    (project_dir / "history" / "revisions").mkdir(parents=True, exist_ok=True)
    (project_dir / "masks").mkdir(exist_ok=True)
    (project_dir / "directions" / "candidates").mkdir(parents=True, exist_ok=True)
    (project_dir / "proofs" / "sets").mkdir(parents=True, exist_ok=True)
    (project_dir / "references").mkdir(exist_ok=True)

    names = DEFAULT_LAYER_NAMES[:layers]
    if layers > len(names):
        names.extend(
            (f"additional-{index}", f"附加图层 {index}", f"Additional layer {index}")
            for index in range(len(names) + 1, layers + 1)
        )
    entries = []
    for position, (name, label_zh, label_en) in enumerate(names, start=1):
        filename = f"{position:02d}-{name}.png"
        prompt_name = f"{position:02d}-{name}.md"
        layer_id = f"layer-{name}"
        entries.append(
            {
                "id": layer_id,
                "label": label_en,
                "label_zh": label_zh,
                "label_en": label_en,
                "z_index": position,
                "file": f"layers/{filename}",
                "prompt": f"prompts/{prompt_name}",
                "visible": True,
                "locked": False,
                "opacity": 1.0,
                "blend_mode": "normal",
                "layer_type": "pixel" if pixel_art else "raster",
                "depends_on": [],
                "bbox_hint": [0, 0, width, height],
            }
        )
        transparency = "opaque full-canvas background" if position == 1 else "transparent outside the named content"
        style_prompt = f"Style direction: {style}.\n" if style else ""
        pixel_prompt = ""
        if pixel_art:
            alpha_rule = "fully opaque" if position == 1 else "binary alpha only (0 or 255)"
            pixel_prompt = (
                "Pixel-art rules:\n"
                f"- Draw directly on the exact {width}×{height} logical pixel grid.\n"
                "- Use hard pixel clusters with no anti-aliasing, blur, gradients, or subpixel marks.\n"
                f"- Share one project palette of at most {palette_size} visible RGB colors.\n"
                f"- Keep this layer {alpha_rule}; do not use partial transparency.\n"
            )
        (project_dir / "prompts" / prompt_name).write_text(
            f"# {label_en}\n\n"
            f"Generate only the semantic content for `{layer_id}` on a {width}×{height} canvas.\n"
            f"{style_prompt}"
            f"Output a full-canvas RGBA PNG, {transparency}. Preserve the locked composition and camera.\n"
            f"{pixel_prompt}",
            encoding="utf-8",
        )

    config = {
        "schema_version": "1.1",
        "title": title,
        "output_mode": "raster-layered",
        "canvas": {"width": width, "height": height, "color_space": "sRGB"},
        "canonical_composite": "artwork.png",
        "preview": "preview.png",
        "layer_index": "layers/index.json",
        "target_layers": layers,
        "style": style,
        "style_recipe": "style-recipe.json" if style else None,
        "workflow_mode": "guided",
        "design_plan": "design-plan.json",
        "layer_model": "hybrid-semantic",
        "procedural_seed": 1,
    }
    if pixel_art:
        config["pixel_art"] = {
            "palette_size": palette_size,
            "preview_scale": pixel_scale,
            "alpha_mode": "binary",
            "resampling": "nearest",
        }
    index = {
        "schema_version": "1.1",
        "kind": "layered-raster-index",
        "canvas": config["canvas"],
        "layer_format": "png",
        "layers": entries,
    }
    _write_json(project_dir / "project.json", config)
    _write_json(project_dir / "layers" / "index.json", index)
    FEATURES.install_style_recipe(project_dir, style)
    design_plan = FEATURES.initialize_design_plan(project_dir, style=style, workflow_mode="guided")
    _write_json(
        project_dir / "creative-brief.json",
        {
            "schema_version": "1.0",
            "status": "draft",
            "title": title,
            "output_mode": "raster-layered",
            "style": style,
        },
    )
    return {
        "project": str(project_dir),
        "mode": "raster-layered",
        "layer_index": str(project_dir / "layers" / "index.json"),
        "layers": layers,
        "canvas": {"width": width, "height": height},
        "style": style,
        "design_preset": design_plan["selected_preset"],
        "pixel_art": config.get("pixel_art"),
    }


def layer_paths(raw_target: str | Path) -> dict[str, Path]:
    project_dir, _, _, index = resolve_project(raw_target)
    result: dict[str, Path] = {}
    for entry in _layer_entries(index):
        layer_id = entry.get("id")
        if isinstance(layer_id, str):
            result[layer_id] = _resolve_inside(project_dir, entry.get("file"), field=f"{layer_id}.file")
    return result


def viewer_svg(raw_target: str | Path) -> bytes:
    project_dir, config, _, index = resolve_project(raw_target)
    width, height = _canvas(config, index)
    title = html.escape(str(config.get("title", "Layered raster artwork")))
    pixel_art = _is_pixel_art(config)
    rendering = ' image-rendering="pixelated"' if pixel_art else ""
    manifest_layers = {item.get("id"): item for item in build_manifest(project_dir)["layers"]}
    nodes = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img"{rendering}>',
        f"  <title>{title}</title>",
        "  <desc>Browser view of a raster-layered Layered Redraw project.</desc>",
    ]
    for position, entry in enumerate(_layer_entries(index), start=1):
        raw_layer_id = str(entry.get("id", f"layer-{position}"))
        layer_id = html.escape(raw_layer_id, quote=True)
        label = html.escape(str(entry.get("label", layer_id)), quote=True)
        label_zh = html.escape(str(entry.get("label_zh", label)), quote=True)
        label_en = html.escape(str(entry.get("label_en", label)), quote=True)
        opacity = float(entry.get("opacity", 1.0))
        blend_mode = html.escape(str(entry.get("blend_mode", "normal")), quote=True)
        layer_type = html.escape(str(entry.get("layer_type", "pixel" if pixel_art else "raster")), quote=True)
        editable_source = html.escape(str(entry.get("editable_source", "")), quote=True)
        depends_on = html.escape(" ".join(entry.get("depends_on", [])), quote=True)
        display = "none" if entry.get("visible", True) is False else "inline"
        locked = "true" if entry.get("locked", False) else "false"
        endpoint = f"/api/layer/{quote(raw_layer_id, safe='')}"
        bbox = manifest_layers.get(raw_layer_id, {}).get("alpha_bbox") or entry.get("bbox_hint")
        if not isinstance(bbox, list) or len(bbox) != 4 or not all(isinstance(value, (int, float)) for value in bbox):
            bbox = [0, 0, width, height]
        bbox_text = " ".join(f"{float(value):g}" for value in bbox)
        nodes.extend(
            [
                f'  <g id="{layer_id}" data-layer="true" data-label="{label}" data-label-zh="{label_zh}" data-label-en="{label_en}" data-locked="{locked}" data-layer-type="{layer_type}" data-editable-source="{editable_source}" data-blend-mode="{blend_mode}" data-opacity="{opacity:g}" data-depends-on="{depends_on}" data-bbox="{bbox_text}" inkscape:groupmode="layer" inkscape:label="{label}" display="{display}" style="mix-blend-mode:{blend_mode}">',
                f'    <image id="{layer_id}-bitmap" href="{endpoint}" x="0" y="0" width="{width}" height="{height}" opacity="{opacity:g}" preserveAspectRatio="none"{rendering}/>',
                "  </g>",
            ]
        )
    nodes.append("</svg>")
    return ("\n".join(nodes) + "\n").encode("utf-8")


def update_layer_settings(
    raw_target: str | Path,
    layer_id: str,
    *,
    opacity: float | None = None,
    blend_mode: str | None = None,
    visible: bool | None = None,
    locked: bool | None = None,
    label_zh: str | None = None,
    label_en: str | None = None,
    layer_type: str | None = None,
    editable_source: str | None = None,
    depends_on: list[str] | None = None,
    move: str | None = None,
) -> dict[str, Any]:
    project_dir, config, index_path, index = resolve_project(raw_target)
    entries = _layer_entries(index)
    position = next((idx for idx, entry in enumerate(entries) if entry.get("id") == layer_id), None)
    if position is None:
        raise RasterLayeredError(f"Unknown raster layer: {layer_id}")
    if opacity is not None and (isinstance(opacity, bool) or not 0 <= float(opacity) <= 1):
        raise RasterLayeredError("opacity must be between 0 and 1")
    if blend_mode is not None and blend_mode not in SUPPORTED_BLEND_MODES:
        raise RasterLayeredError("Unsupported blend_mode: " + blend_mode)
    if layer_type is not None and layer_type not in SUPPORTED_LAYER_TYPES:
        raise RasterLayeredError("Unsupported layer_type: " + layer_type)
    if move not in {None, "up", "down", "top", "bottom"}:
        raise RasterLayeredError("move must be up, down, top, or bottom")

    before = build_manifest(project_dir)
    candidate = copy.deepcopy(index)
    candidate_entries = _layer_entries(candidate)
    entry = candidate_entries[position]
    if opacity is not None:
        entry["opacity"] = float(opacity)
    if blend_mode is not None:
        entry["blend_mode"] = blend_mode
    if visible is not None:
        entry["visible"] = bool(visible)
    if locked is not None:
        entry["locked"] = bool(locked)
    if label_zh is not None:
        entry["label_zh"] = label_zh.strip() or entry.get("label_zh")
    if label_en is not None:
        entry["label_en"] = label_en.strip() or entry.get("label_en")
        entry["label"] = entry["label_en"]
    if layer_type is not None:
        entry["layer_type"] = layer_type
    if editable_source is not None:
        entry["editable_source"] = editable_source
    if depends_on is not None:
        entry["depends_on"] = list(dict.fromkeys(depends_on))
    if move:
        item = candidate_entries.pop(position)
        if move == "up":
            destination = min(position + 1, len(candidate_entries))
        elif move == "down":
            destination = max(position - 1, 0)
        elif move == "top":
            destination = len(candidate_entries)
        else:
            destination = 0
        candidate_entries.insert(destination, item)
    for z_index, candidate_entry in enumerate(candidate_entries, start=1):
        candidate_entry["z_index"] = z_index

    if candidate == index:
        raise RasterLayeredError("Layer settings produced no changes")
    FEATURES.create_snapshot(
        project_dir,
        before,
        reason=f"Before layer settings update: {layer_id}",
        changed_layers=[layer_id],
    )
    derived = [
        index_path,
        project_dir / "manifest.json",
        project_dir / "composition.json",
        _resolve_inside(project_dir, config.get("canonical_composite", "artwork.png"), field="canonical_composite"),
        _resolve_inside(project_dir, config.get("preview", "preview.png"), field="preview"),
    ]
    backups = {path: path.read_bytes() if path.is_file() else None for path in derived}
    try:
        _write_json(index_path, candidate)
        validation = validate_project(project_dir)
        if validation["errors"]:
            raise RasterLayeredError("Layer settings are invalid: " + "; ".join(validation["errors"]))
        composed = compose_project(project_dir)
        after = build_manifest(project_dir)
    except Exception:
        for path, payload in backups.items():
            if payload is None:
                if path.exists():
                    path.unlink()
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(payload)
        raise

    before_states = {layer["id"]: layer.get("state_sha256") for layer in before["layers"]}
    after_states = {layer["id"]: layer.get("state_sha256") for layer in after["layers"]}
    changed = sorted(layer for layer in before_states if before_states[layer] != after_states.get(layer))
    return {
        "ok": True,
        "before_revision": before["revision"],
        "after_revision": after["revision"],
        "changed_layers": changed,
        "artwork": composed["artwork"],
        "preview": composed["preview"],
    }


def apply_patch(raw_target: str | Path, patch_path: str | Path, *, dry_run: bool = False) -> dict[str, Any]:
    project_dir, config, _, index = resolve_project(raw_target)
    patch_file = Path(patch_path).expanduser().resolve()
    patch = _read_json(patch_file, required=True)
    before = build_manifest(project_dir)
    if patch.get("base_revision") and patch["base_revision"] != before["revision"]:
        raise RasterLayeredError(
            f"Patch base_revision {patch['base_revision']} does not match current {before['revision']}"
        )
    expected_raw = patch.get("expected_changed_layers")
    if not isinstance(expected_raw, list) or not expected_raw or not all(isinstance(value, str) for value in expected_raw):
        raise RasterLayeredError("expected_changed_layers must be a non-empty array of layer IDs")
    expected = set(expected_raw)
    preserve_raw = patch.get("preserve_layers", [])
    if not isinstance(preserve_raw, list) or not all(isinstance(value, str) for value in preserve_raw):
        raise RasterLayeredError("preserve_layers must be an array of layer IDs")
    preserve = set(preserve_raw)
    if expected & preserve:
        raise RasterLayeredError("A layer cannot be both expected to change and preserved")

    entries = {entry.get("id"): entry for entry in _layer_entries(index)}
    unknown = sorted(expected - set(entries))
    if unknown:
        raise RasterLayeredError("Unknown expected layer IDs: " + ", ".join(unknown))
    unknown_preserve = sorted(preserve - set(entries))
    if unknown_preserve:
        raise RasterLayeredError("Unknown preserved layer IDs: " + ", ".join(unknown_preserve))
    operations = patch.get("operations")
    if not isinstance(operations, list) or not operations:
        raise RasterLayeredError("operations must be a non-empty array")

    prepared: list[tuple[str, Path, Path]] = []
    operation_targets: set[str] = set()
    for operation in operations:
        if not isinstance(operation, dict):
            raise RasterLayeredError("Every raster patch operation must be an object")
        target_id = operation.get("target_id")
        if target_id not in expected:
            raise RasterLayeredError(f"Patch target {target_id} is outside expected_changed_layers")
        if target_id in operation_targets:
            raise RasterLayeredError(f"Raster patches may replace layer {target_id} only once")
        operation_targets.add(target_id)
        if operation.get("action") != "replace-layer-file":
            raise RasterLayeredError("Raster patches currently support only replace-layer-file")
        source_raw = operation.get("source")
        if not isinstance(source_raw, str) or not source_raw.strip():
            raise RasterLayeredError("replace-layer-file requires a source path")
        source = Path(source_raw).expanduser()
        if not source.is_absolute():
            source = (patch_file.parent / source).resolve()
        else:
            source = source.resolve()
        if not source.is_file():
            raise RasterLayeredError(f"Replacement layer file does not exist: {source}")
        entry = entries[target_id]
        destination = _resolve_inside(project_dir, entry.get("file"), field=f"{target_id}.file")
        if source.suffix.lower() != ".png":
            raise RasterLayeredError("Replacement raster layers must be PNG files")
        source_info = _image_info(source)
        width, height = _canvas(_read_json(project_dir / "project.json"), index)
        if (source_info["width"], source_info["height"]) != (width, height):
            raise RasterLayeredError(
                f"Replacement {target_id} is {source_info['width']}×{source_info['height']}; expected {width}×{height}."
            )
        if source_info["alpha_bbox"] is None:
            raise RasterLayeredError(f"Replacement {target_id} is fully transparent")
        position = list(entries).index(target_id)
        if position > 0 and not source_info["has_alpha"]:
            raise RasterLayeredError(f"Replacement {target_id} must retain an alpha channel")
        if position > 0 and source_info["alpha_extrema"] and source_info["alpha_extrema"][0] == 255:
            raise RasterLayeredError(f"Replacement {target_id} must contain transparent pixels")
        if _is_pixel_art(config):
            if position == 0 and source_info["alpha_extrema"] and source_info["alpha_extrema"][0] < 255:
                raise RasterLayeredError("The pixel-art background replacement must be fully opaque")
            if position > 0 and source_info.get("partial_alpha_pixels", 0) > 0:
                raise RasterLayeredError(
                    f"Pixel-art replacement {target_id} must use only alpha 0 or 255"
                )
        prepared.append((target_id, source, destination))

    if _is_pixel_art(config):
        pixel_options = config.get("pixel_art", {})
        if not isinstance(pixel_options, dict):
            raise RasterLayeredError("project.json pixel_art must be an object")
        palette_size = pixel_options.get("palette_size", 32)
        if (
            not isinstance(palette_size, int)
            or isinstance(palette_size, bool)
            or not 2 <= palette_size <= 256
        ):
            raise RasterLayeredError("pixel_art.palette_size must be an integer between 2 and 256")
        replacements = {layer_id: source for layer_id, source, _ in prepared}
        candidate_palette: set[tuple[int, int, int]] = set()
        for layer_id, entry in entries.items():
            source = replacements.get(layer_id) or _resolve_inside(
                project_dir,
                entry.get("file"),
                field=f"{layer_id}.file",
            )
            colors = _visible_palette(source, palette_size)
            if colors is None:
                raise RasterLayeredError(
                    f"Pixel-art layer {layer_id} exceeds the {palette_size}-color project palette limit"
                )
            candidate_palette.update(colors)
        if len(candidate_palette) > palette_size:
            raise RasterLayeredError(
                f"Pixel-art patch would use {len(candidate_palette)} visible colors; limit is {palette_size}"
            )

    before_hashes = {item["id"]: item["sha256"] for item in before["layers"]}
    changed = sorted(
        layer_id
        for layer_id, source, _ in prepared
        if before_hashes.get(layer_id) != _sha256(source)
    )
    if not changed:
        raise RasterLayeredError("Raster patch produced no layer changes")
    result = {
        "ok": True,
        "dry_run": dry_run,
        "before_revision": before["revision"],
        "changed_layers": changed,
        "untouched_layers": sorted(set(entries) - set(changed)),
    }
    if dry_run:
        return result

    FEATURES.create_snapshot(
        project_dir,
        before,
        reason=str(patch.get("instruction") or "Before scoped raster patch"),
        changed_layers=changed,
    )

    derived = [
        project_dir / "manifest.json",
        project_dir / "composition.json",
        _resolve_inside(
            project_dir,
            config.get("canonical_composite", "artwork.png"),
            field="canonical_composite",
        ),
        _resolve_inside(project_dir, config.get("preview", "preview.png"), field="preview"),
    ]
    backup_paths = {destination for _, _, destination in prepared} | set(derived)
    backups = {path: path.read_bytes() if path.is_file() else None for path in backup_paths}
    staged: list[tuple[Path, Path]] = []
    try:
        for _, source, destination in prepared:
            destination.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                mode="wb", suffix=".png", prefix="layered-raster-patch-", dir=destination.parent, delete=False
            ) as handle:
                temp_path = Path(handle.name)
            shutil.copyfile(source, temp_path)
            staged.append((temp_path, destination))
        for temp_path, destination in staged:
            os.replace(temp_path, destination)
        validation = validate_project(project_dir)
        if validation["errors"]:
            raise RasterLayeredError("Patched raster project is invalid: " + "; ".join(validation["errors"]))
        compose_result = compose_project(project_dir)
        after = build_manifest(project_dir)
        after_hashes = {item["id"]: item["sha256"] for item in after["layers"]}
        escaped = sorted(
            layer_id
            for layer_id, digest in before_hashes.items()
            if digest != after_hashes.get(layer_id) and layer_id not in expected
        )
        changed_preserved = sorted(
            layer_id
            for layer_id in preserve
            if before_hashes.get(layer_id) != after_hashes.get(layer_id)
        )
        if escaped or changed_preserved:
            raise RasterLayeredError(
                "Raster patch changed preserved layers: " + ", ".join(sorted(set(escaped + changed_preserved)))
            )
    except Exception:
        for temp_path, _ in staged:
            if temp_path.exists():
                temp_path.unlink()
        for path, payload in backups.items():
            if payload is None:
                if path.exists():
                    path.unlink()
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(payload)
        raise

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    log = {
        "schema_version": "1.0",
        "kind": "layered-raster-patch-log",
        "applied_at": datetime.now(timezone.utc).isoformat(),
        "patch_source": str(patch_file),
        "before_revision": before["revision"],
        "after_revision": compose_result["revision"],
        "changed_layers": changed,
        "request": patch,
    }
    _write_json(project_dir / "patches" / f"{timestamp}-{compose_result['revision']}.json", log)
    result.update(
        {
            "after_revision": compose_result["revision"],
            "manifest": compose_result["manifest"],
            "artwork": compose_result["artwork"],
            "preview": compose_result["preview"],
        }
    )
    return result
