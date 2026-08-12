#!/usr/bin/env python3
"""Deterministic utilities for Layered Redraw vector and raster projects.

The artistic decisions belong to Codex and the user. This module protects the
project contract: stable semantic layers, manifests, safe localized patches,
layer exports, and a local request-authoring editor.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import copy
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import tempfile
import webbrowser
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse
from xml.etree import ElementTree as ET


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import raster_project as RASTER  # noqa: E402  (local sibling module)
import project_features as FEATURES  # noqa: E402  (local sibling module)
import design_proofs as PROOFS  # noqa: E402  (local sibling module)
import reference_intelligence as REFERENCES  # noqa: E402  (local sibling module)
import physical_specs as PHYSICAL  # noqa: E402  (local sibling module)


SVG_NS = "http://www.w3.org/2000/svg"
INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape"
XLINK_NS = "http://www.w3.org/1999/xlink"
LAYER_ID_RE = re.compile(r"^layer-[a-z0-9]+(?:-[a-z0-9]+)*$")
GRAPHIC_TAGS = {
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "use",
    "image",
}
UNSAFE_TAGS = {"script", "foreignObject", "iframe", "object", "embed"}
DEFAULT_LAYER_NAMES = [
    "background",
    "sky",
    "distant-forms",
    "midground",
    "primary-subject",
    "secondary-subjects",
    "ground-or-water",
    "lighting",
    "foreground",
    "atmosphere",
]

ET.register_namespace("", SVG_NS)
ET.register_namespace("inkscape", INKSCAPE_NS)
ET.register_namespace("xlink", XLINK_NS)


class LayeredRedrawError(RuntimeError):
    """Raised for contract or input failures that should be shown to users."""


class EditorRequestError(LayeredRedrawError):
    """A local-editor request rejected before project state is touched."""

    def __init__(self, message: str, *, status: int) -> None:
        super().__init__(message)
        self.status = status


EDITOR_SESSION_HEADER = "X-Layered-Redraw-Token"
MAX_EDITOR_JSON_BYTES = 32 * 1024 * 1024


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def svg_tag(name: str) -> str:
    return f"{{{SVG_NS}}}{name}"


def inkscape_attr(name: str) -> str:
    return f"{{{INKSCAPE_NS}}}{name}"


def read_json(path: Path, *, required: bool = False) -> dict[str, Any]:
    if not path.exists():
        if required:
            raise LayeredRedrawError(f"Missing required JSON file: {path}")
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise LayeredRedrawError(f"Unable to read JSON file {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise LayeredRedrawError(f"JSON root must be an object: {path}")
    return value


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def target_output_mode(raw_target: str | Path) -> str:
    target = Path(raw_target).expanduser().resolve()
    if target.is_dir():
        config = read_json(target / "project.json")
        mode = config.get("output_mode")
        if isinstance(mode, str) and mode:
            return mode
    return "vector-strict"


def resolve_project(raw_target: str | Path) -> tuple[Path, Path, dict[str, Any]]:
    target = Path(raw_target).expanduser().resolve()
    if target.is_dir():
        project_dir = target
        config = read_json(project_dir / "project.json")
        canonical = config.get("canonical_svg", "artwork.svg")
        if not isinstance(canonical, str) or not canonical.strip():
            raise LayeredRedrawError("project.json canonical_svg must be a string")
        svg_path = (project_dir / canonical).resolve()
        if project_dir not in svg_path.parents:
            raise LayeredRedrawError("canonical_svg must stay inside the project directory")
    else:
        svg_path = target
        project_dir = svg_path.parent
        config = read_json(project_dir / "project.json")
    if svg_path.suffix.lower() != ".svg":
        raise LayeredRedrawError(f"Expected an SVG or project directory, got: {target}")
    if not svg_path.is_file():
        raise LayeredRedrawError(f"SVG file does not exist: {svg_path}")
    return svg_path, project_dir, config


def parse_svg(svg_path: Path) -> ET.Element:
    try:
        root = ET.parse(svg_path).getroot()
    except (OSError, ET.ParseError) as exc:
        raise LayeredRedrawError(f"Unable to parse SVG {svg_path}: {exc}") from exc
    if local_name(root.tag) != "svg":
        raise LayeredRedrawError(f"Root element is not <svg>: {svg_path}")
    return root


def is_layer(element: ET.Element) -> bool:
    return local_name(element.tag) == "g" and (
        element.get("data-layer") == "true"
        or element.get(inkscape_attr("groupmode")) == "layer"
        or element.get("inkscape:groupmode") == "layer"
    )


def top_layers(root: ET.Element) -> list[ET.Element]:
    return [child for child in list(root) if is_layer(child)]


def layer_label(layer: ET.Element) -> str:
    return (
        layer.get(inkscape_attr("label"))
        or layer.get("inkscape:label")
        or layer.get("data-label")
        or layer.get("id")
        or "Unnamed layer"
    )


def element_hash(element: ET.Element) -> str:
    return hashlib.sha256(ET.tostring(element, encoding="utf-8")).hexdigest()


def revision_for_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()[:12]


def parse_bbox(raw: str | None) -> list[float] | None:
    if not raw:
        return None
    try:
        values = [float(value) for value in raw.replace(",", " ").split()]
    except ValueError:
        return None
    return values if len(values) == 4 else None


def graphic_count(layer: ET.Element) -> int:
    return sum(1 for item in layer.iter() if local_name(item.tag) in GRAPHIC_TAGS)


def is_visible(layer: ET.Element) -> bool:
    if layer.get("display") == "none":
        return False
    style = layer.get("style", "").replace(" ", "").lower()
    return "display:none" not in style


def layer_opacity(layer: ET.Element) -> float:
    try:
        return float(layer.get("opacity", "1"))
    except ValueError:
        return -1.0


def build_manifest_from_root(
    root: ET.Element,
    *,
    payload: bytes,
    config: dict[str, Any],
) -> dict[str, Any]:
    view_box = root.get("viewBox", "")
    title = config.get("title")
    if not isinstance(title, str) or not title.strip():
        title_node = next((node for node in root if local_name(node.tag) == "title"), None)
        title = title_node.text.strip() if title_node is not None and title_node.text else "Untitled"
    layers = []
    for index, layer in enumerate(top_layers(root), start=1):
        layer_digest = element_hash(layer)
        state_digest = hashlib.sha256(f"{index}:{layer_digest}".encode("utf-8")).hexdigest()
        raw_depends = layer.get("data-depends-on", "")
        layers.append(
            {
                "id": layer.get("id"),
                "label": layer_label(layer),
                "z_index": index,
                "sha256": layer_digest,
                "state_sha256": state_digest,
                "layer_type": layer.get("data-layer-type", "vector"),
                "object_count": graphic_count(layer),
                "visible": is_visible(layer),
                "locked": layer.get("data-locked") == "true",
                "opacity": layer_opacity(layer),
                "blend_mode": layer.get("data-blend-mode", "normal"),
                "depends_on": [item for item in raw_depends.split() if item],
                "bbox_hint": parse_bbox(layer.get("data-bbox")),
            }
        )
    design_plan_digest = config.get("_design_plan_sha256")
    object_specs_digest = config.get("_object_specs_sha256")
    revision = revision_for_bytes(payload)
    if (
        isinstance(design_plan_digest, str)
        and design_plan_digest
        or isinstance(object_specs_digest, str)
        and object_specs_digest
    ):
        revision_payload = {
            "artwork_sha256": hashlib.sha256(payload).hexdigest(),
            "design_plan_sha256": design_plan_digest,
            "workflow_mode": config.get("workflow_mode"),
            "design_preset": config.get("design_preset"),
        }
        if isinstance(object_specs_digest, str) and object_specs_digest:
            revision_payload["object_specs_sha256"] = object_specs_digest
        revision = hashlib.sha256(
            json.dumps(revision_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()[:12]
    return {
        "schema_version": "1.0",
        "kind": "layered-redraw-manifest",
        "title": title,
        "revision": revision,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "view_box": view_box,
        "output_mode": config.get("output_mode", "vector-strict"),
        "style": config.get("style"),
        "style_recipe": config.get("style_recipe"),
        "workflow_mode": config.get("workflow_mode", "guided"),
        "design_plan": config.get("design_plan"),
        "design_preset": config.get("design_preset"),
        "design_plan_sha256": design_plan_digest,
        "object_specs": config.get("object_specs"),
        "object_specs_sha256": object_specs_digest,
        "layer_model": config.get("layer_model", "semantic-vector"),
        "layer_count": len(layers),
        "layers": layers,
    }


def build_manifest(svg_path: Path, config: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = svg_path.read_bytes()
    root = parse_svg(svg_path)
    manifest_config = dict(config or {})
    manifest_config["_design_plan_sha256"] = FEATURES.design_plan_sha256(svg_path.parent, manifest_config)
    manifest_config["_object_specs_sha256"] = PHYSICAL.document_sha256(svg_path.parent, manifest_config)
    return build_manifest_from_root(root, payload=payload, config=manifest_config)


def validate_tree(root: ET.Element, config: dict[str, Any]) -> dict[str, list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    layers = top_layers(root)
    output_mode = config.get("output_mode", "vector-strict")

    if config.get("design_plan"):
        allowed_text_layers = set(config.get("_allowed_text_layers", []))
        unexpected_text_layers = []
        for layer in layers:
            has_visible_text = any(
                local_name(node.tag) in {"text", "tspan"} and (node.text or "").strip()
                for node in layer.iter()
            )
            if has_visible_text and layer.get("id") not in allowed_text_layers:
                unexpected_text_layers.append(layer.get("id") or "<missing-layer-id>")
        if unexpected_text_layers:
            errors.append(
                "Visible SVG text is only allowed in design-plan.json text_policy.allowed_layers; "
                f"unexpected text in: {', '.join(unexpected_text_layers)}."
            )

    view_box = root.get("viewBox")
    if not view_box:
        errors.append("Root SVG must define viewBox.")
    else:
        try:
            values = [float(value) for value in view_box.replace(",", " ").split()]
        except ValueError:
            values = []
        if len(values) != 4 or values[2] <= 0 or values[3] <= 0:
            errors.append("viewBox must contain x y width height with positive dimensions.")

    if not 5 <= len(layers) <= 20:
        errors.append(f"Expected 5–20 semantic top-level layers; found {len(layers)}.")
    elif not 8 <= len(layers) <= 12:
        warnings.append(f"Layer count {len(layers)} is valid but outside the preferred 8–12 range.")

    all_ids: dict[str, int] = {}
    for item in root.iter():
        item_id = item.get("id")
        if item_id:
            all_ids[item_id] = all_ids.get(item_id, 0) + 1
        name = local_name(item.tag)
        if name in UNSAFE_TAGS:
            errors.append(f"Unsafe SVG element <{name}> is not allowed.")
        if name == "image" and output_mode == "vector-strict":
            errors.append("vector-strict projects must not contain <image> elements.")
        for attr_name, value in item.attrib.items():
            attr_local = local_name(attr_name).lower()
            lowered = value.strip().lower()
            if attr_local.startswith("on"):
                errors.append(f"Executable event attribute {attr_local} is not allowed.")
            if attr_local in {"href", "src"} and lowered.startswith(
                ("http://", "https://", "file://", "javascript:")
            ):
                errors.append(f"External or executable resource is not allowed: {value}")
            if "javascript:" in lowered or "url(http" in lowered:
                errors.append("Executable or remote CSS/SVG content is not allowed.")

    duplicate_ids = sorted(item_id for item_id, count in all_ids.items() if count > 1)
    if duplicate_ids:
        errors.append("Duplicate SVG IDs: " + ", ".join(duplicate_ids))

    seen_layers: set[str] = set()
    dependency_graph: dict[str, list[str]] = {}
    known_layer_ids = {layer.get("id") for layer in layers if isinstance(layer.get("id"), str)}
    for index, layer in enumerate(layers, start=1):
        layer_id = layer.get("id")
        if not layer_id:
            errors.append(f"Top-level layer {index} is missing an id.")
            continue
        if layer_id in seen_layers:
            errors.append(f"Duplicate top-level layer id: {layer_id}")
        seen_layers.add(layer_id)
        if not LAYER_ID_RE.fullmatch(layer_id):
            errors.append(f"Layer id must match layer-name-in-kebab-case: {layer_id}")
        if not layer_label(layer).strip():
            errors.append(f"Layer {layer_id} is missing a human-readable label.")
        if graphic_count(layer) == 0:
            errors.append(f"Layer {layer_id} is empty.")
        opacity = layer_opacity(layer)
        if not 0 <= opacity <= 1:
            errors.append(f"Layer {layer_id} opacity must be between 0 and 1.")
        blend_mode = layer.get("data-blend-mode", "normal")
        if blend_mode not in RASTER.SUPPORTED_BLEND_MODES:
            errors.append(f"Layer {layer_id} uses unsupported blend mode: {blend_mode}")
        layer_type = layer.get("data-layer-type", "vector")
        if layer_type not in RASTER.SUPPORTED_LAYER_TYPES:
            errors.append(f"Layer {layer_id} uses unsupported layer type: {layer_type}")
        if output_mode == "vector-strict" and layer_type != "vector":
            errors.append(f"vector-strict layer {layer_id} must use data-layer-type=vector.")
        depends_on = [item for item in layer.get("data-depends-on", "").split() if item]
        dependency_graph[layer_id] = depends_on
        unknown_dependencies = sorted(set(depends_on) - known_layer_ids)
        if unknown_dependencies:
            errors.append(
                f"Layer {layer_id} depends on unknown layers: {', '.join(unknown_dependencies)}."
            )
        if layer_id in depends_on:
            errors.append(f"Layer {layer_id} cannot depend on itself.")
        bbox_raw = layer.get("data-bbox")
        if bbox_raw and parse_bbox(bbox_raw) is None:
            warnings.append(f"Layer {layer_id} has an invalid data-bbox hint.")

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
        errors.append("Layer data-depends-on relationships contain a cycle.")

    if output_mode not in {"vector-strict", "vector-textured", "hybrid"}:
        errors.append(f"Unknown output_mode: {output_mode}")
    return {"errors": sorted(set(errors)), "warnings": sorted(set(warnings))}


def validate_project(raw_target: str | Path, *, write_manifest_file: bool = False) -> dict[str, Any]:
    if target_output_mode(raw_target) == "raster-layered":
        return RASTER.validate_project(raw_target, write_manifest_file=write_manifest_file)
    svg_path, project_dir, config = resolve_project(raw_target)
    root = parse_svg(svg_path)
    validation_config = dict(config)
    design_plan_error: str | None = None
    if config.get("design_plan"):
        try:
            plan = FEATURES.load_design_plan(project_dir)
            text_policy = plan.get("text_policy", {})
            validation_config["_allowed_text_layers"] = text_policy.get("allowed_layers", [])
        except FEATURES.ProjectFeatureError as exc:
            design_plan_error = str(exc)
    report = validate_tree(root, validation_config)
    if design_plan_error:
        report["errors"].append(f"Invalid design plan: {design_plan_error}")
    if config.get("style_recipe"):
        recipe_path = project_dir / str(config.get("style_recipe"))
        if not recipe_path.is_file():
            report["warnings"].append("The project style recipe file is missing.")
    if config.get("object_specs") or (project_dir / "object-specs.json").exists():
        try:
            specifications = PHYSICAL.load_document(project_dir)
            known_layers = {layer.get("id") for layer in top_layers(root) if layer.get("id")}
            known_nodes = {node.get("id") for node in root.iter() if node.get("id")}
            spec_report = PHYSICAL.validate_document(
                specifications,
                known_layer_ids=known_layers,
                known_object_node_ids=known_nodes,
            )
            report["errors"].extend(f"Invalid object specifications: {item}" for item in spec_report["errors"])
            report["warnings"].extend(f"Object specifications: {item}" for item in spec_report["warnings"])
        except PHYSICAL.PhysicalSpecError as exc:
            report["errors"].append(f"Invalid object specifications: {exc}")
    manifest = build_manifest(svg_path, config)
    manifest_path = project_dir / "manifest.json"
    previous = read_json(manifest_path)
    if previous and previous.get("revision") != manifest["revision"]:
        report["warnings"].append("manifest.json is stale and should be regenerated.")
    if write_manifest_file and not report["errors"]:
        write_json(manifest_path, manifest)
    return {
        "ok": not report["errors"],
        "svg": str(svg_path),
        "manifest": str(manifest_path),
        "layer_count": manifest["layer_count"],
        "revision": manifest["revision"],
        **report,
    }


def serialize_svg(root: ET.Element, *, pretty: bool = True) -> bytes:
    output_root = copy.deepcopy(root) if pretty else root
    if pretty:
        ET.indent(output_root, space="  ")
    return ET.tostring(output_root, encoding="utf-8", xml_declaration=True)


def write_svg(path: Path, root: ET.Element, *, pretty: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(serialize_svg(root, pretty=pretty))


def split_layers(raw_target: str | Path, output_dir: str | Path | None = None) -> dict[str, Any]:
    if target_output_mode(raw_target) == "raster-layered":
        project_dir, _, index_path, index = RASTER.resolve_project(raw_target)
        layers = index.get("layers", [])
        return {
            "output_dir": str(index_path.parent),
            "layer_count": len(layers) if isinstance(layers, list) else 0,
            "message": "Raster layers are already stored as discrete files; use compose to rebuild the artwork.",
            "project": str(project_dir),
        }
    svg_path, project_dir, config = resolve_project(raw_target)
    root = parse_svg(svg_path)
    layers = top_layers(root)
    destination = Path(output_dir).expanduser().resolve() if output_dir else project_dir / "layers"
    destination.mkdir(parents=True, exist_ok=True)
    shared = [
        copy.deepcopy(child)
        for child in list(root)
        if local_name(child.tag) in {"defs", "style"}
    ]
    index_entries = []
    for position, layer in enumerate(layers, start=1):
        layer_id = layer.get("id") or f"layer-{position}"
        filename = f"{position:02d}-{layer_id.removeprefix('layer-')}.svg"
        layer_root = ET.Element(svg_tag("svg"), dict(root.attrib))
        title = ET.SubElement(layer_root, svg_tag("title"))
        title.text = f"{layer_label(layer)} — Layered Redraw layer"
        for shared_node in shared:
            layer_root.append(copy.deepcopy(shared_node))
        layer_root.append(copy.deepcopy(layer))
        write_svg(destination / filename, layer_root)
        index_entries.append(
            {
                "id": layer_id,
                "label": layer_label(layer),
                "file": filename,
                "sha256": element_hash(layer),
            }
        )
    index = {
        "schema_version": "1.0",
        "source": str(svg_path),
        "revision": build_manifest(svg_path, config)["revision"],
        "layers": index_entries,
    }
    write_json(destination / "index.json", index)
    return {"output_dir": str(destination), "layer_count": len(index_entries)}


def index_elements(root: ET.Element) -> tuple[dict[str, ET.Element], dict[ET.Element, ET.Element]]:
    by_id: dict[str, ET.Element] = {}
    parents: dict[ET.Element, ET.Element] = {}
    for parent in root.iter():
        item_id = parent.get("id")
        if item_id:
            if item_id in by_id:
                raise LayeredRedrawError(f"Duplicate id prevents patching: {item_id}")
            by_id[item_id] = parent
        for child in list(parent):
            parents[child] = parent
    return by_id, parents


def owning_layer_id(target: ET.Element, parents: dict[ET.Element, ET.Element]) -> str | None:
    current: ET.Element | None = target
    while current is not None:
        if is_layer(current):
            return current.get("id")
        current = parents.get(current)
    return None


def normalize_svg_namespace(element: ET.Element) -> None:
    if isinstance(element.tag, str) and "}" not in element.tag:
        element.tag = svg_tag(element.tag)
    for child in list(element):
        normalize_svg_namespace(child)


def validate_attribute(name: str, value: str) -> None:
    lowered_name = local_name(name).lower()
    lowered_value = value.strip().lower()
    if lowered_name == "id":
        raise LayeredRedrawError("Patch operations cannot change stable element IDs.")
    if lowered_name.startswith("on") or "javascript:" in lowered_value or "url(http" in lowered_value:
        raise LayeredRedrawError(f"Unsafe SVG attribute rejected: {name}")
    if lowered_name in {"href", "src"} and lowered_value.startswith(
        ("http://", "https://", "file://", "javascript:")
    ):
        raise LayeredRedrawError(f"External SVG resource rejected: {value}")


def parse_safe_fragment(fragment: str, target_id: str, output_mode: str) -> ET.Element:
    try:
        element = ET.fromstring(fragment)
    except ET.ParseError as exc:
        raise LayeredRedrawError(f"Replacement SVG is invalid: {exc}") from exc
    normalize_svg_namespace(element)
    element.set("id", target_id)
    for item in element.iter():
        name = local_name(item.tag)
        if name in UNSAFE_TAGS:
            raise LayeredRedrawError(f"Unsafe replacement element: {name}")
        if name == "image" and output_mode == "vector-strict":
            raise LayeredRedrawError("vector-strict patches cannot add image elements")
        if is_layer(item) and item is not element:
            raise LayeredRedrawError("A localized replacement cannot add nested semantic layers")
        for attr_name, value in item.attrib.items():
            if local_name(attr_name) != "id":
                validate_attribute(attr_name, value)
    return element


def apply_patch(raw_target: str | Path, patch_path: str | Path, *, dry_run: bool = False) -> dict[str, Any]:
    if target_output_mode(raw_target) == "raster-layered":
        return RASTER.apply_patch(raw_target, patch_path, dry_run=dry_run)
    svg_path, project_dir, config = resolve_project(raw_target)
    patch_file = Path(patch_path).expanduser().resolve()
    patch = read_json(patch_file, required=True)
    original_payload = svg_path.read_bytes()
    root = parse_svg(svg_path)
    before = build_manifest(svg_path, config)
    if patch.get("base_revision") and patch["base_revision"] != before["revision"]:
        raise LayeredRedrawError(
            f"Patch base_revision {patch['base_revision']} does not match current {before['revision']}"
        )
    expected_raw = patch.get("expected_changed_layers")
    if not isinstance(expected_raw, list) or not expected_raw or not all(
        isinstance(value, str) for value in expected_raw
    ):
        raise LayeredRedrawError("expected_changed_layers must be a non-empty array of layer IDs")
    expected = set(expected_raw)
    preserve_raw = patch.get("preserve_layers", [])
    if not isinstance(preserve_raw, list) or not all(isinstance(value, str) for value in preserve_raw):
        raise LayeredRedrawError("preserve_layers must be an array of layer IDs")
    preserve = set(preserve_raw)
    if expected & preserve:
        raise LayeredRedrawError("A layer cannot be both expected to change and preserved")
    valid_layers = {layer.get("id") for layer in top_layers(root)}
    unknown = sorted(expected - valid_layers)
    if unknown:
        raise LayeredRedrawError("Unknown expected layer IDs: " + ", ".join(unknown))
    operations = patch.get("operations")
    if not isinstance(operations, list) or not operations:
        raise LayeredRedrawError("operations must be a non-empty array")

    for operation in operations:
        if not isinstance(operation, dict):
            raise LayeredRedrawError("Every operation must be an object")
        target_id = operation.get("target_id")
        action = operation.get("action")
        if not isinstance(target_id, str) or not isinstance(action, str):
            raise LayeredRedrawError("Every operation requires target_id and action strings")
        by_id, parents = index_elements(root)
        target = by_id.get(target_id)
        if target is None:
            raise LayeredRedrawError(f"Patch target not found: {target_id}")
        layer_id = owning_layer_id(target, parents)
        if layer_id not in expected:
            raise LayeredRedrawError(
                f"Target {target_id} belongs to {layer_id}; it is outside expected_changed_layers"
            )
        if action == "set-attributes":
            attributes = operation.get("attributes")
            if not isinstance(attributes, dict) or not all(
                isinstance(key, str) and isinstance(value, (str, int, float))
                for key, value in attributes.items()
            ):
                raise LayeredRedrawError("set-attributes requires a scalar attributes object")
            for name, raw_value in attributes.items():
                value = str(raw_value)
                validate_attribute(name, value)
                target.set(name, value)
        elif action == "remove-attributes":
            names = operation.get("attributes")
            if not isinstance(names, list) or not all(isinstance(name, str) for name in names):
                raise LayeredRedrawError("remove-attributes requires an attributes array")
            for name in names:
                if local_name(name).lower() == "id":
                    raise LayeredRedrawError("Stable IDs cannot be removed")
                target.attrib.pop(name, None)
        elif action == "set-text":
            if local_name(target.tag) not in {"text", "tspan", "title", "desc"}:
                raise LayeredRedrawError("set-text may target only text, tspan, title, or desc")
            text_value = operation.get("text")
            if not isinstance(text_value, str):
                raise LayeredRedrawError("set-text requires a text string")
            target.text = text_value
        elif action == "replace-element":
            if is_layer(target):
                raise LayeredRedrawError("Top-level layer wrappers cannot be replaced")
            fragment = operation.get("svg")
            if not isinstance(fragment, str):
                raise LayeredRedrawError("replace-element requires an svg string")
            parent = parents.get(target)
            if parent is None:
                raise LayeredRedrawError("Cannot replace the root SVG element")
            replacement = parse_safe_fragment(
                fragment, target_id, str(config.get("output_mode", "vector-strict"))
            )
            position = list(parent).index(target)
            parent.remove(target)
            parent.insert(position, replacement)
        elif action == "remove-element":
            if is_layer(target):
                raise LayeredRedrawError("Top-level layer wrappers cannot be removed")
            parent = parents.get(target)
            if parent is None:
                raise LayeredRedrawError("Cannot remove the root SVG element")
            parent.remove(target)
        else:
            raise LayeredRedrawError(f"Unsupported patch action: {action}")

    result_validation = validate_tree(root, config)
    if result_validation["errors"]:
        raise LayeredRedrawError("Patched SVG violates the project contract: " + "; ".join(result_validation["errors"]))
    after_payload = ET.tostring(root, encoding="utf-8")
    after_preview = build_manifest_from_root(root, payload=after_payload, config=config)
    before_hashes = {item["id"]: item["sha256"] for item in before["layers"]}
    after_hashes = {item["id"]: item["sha256"] for item in after_preview["layers"]}
    changed = sorted(
        layer_id for layer_id in before_hashes if before_hashes[layer_id] != after_hashes.get(layer_id)
    )
    escaped = sorted(set(changed) - expected)
    if escaped:
        raise LayeredRedrawError("Patch changed layers outside scope: " + ", ".join(escaped))
    if set(changed) & preserve:
        raise LayeredRedrawError("Patch changed preserved layers: " + ", ".join(sorted(set(changed) & preserve)))
    if not changed:
        raise LayeredRedrawError("Patch produced no layer changes")

    result = {
        "ok": True,
        "dry_run": dry_run,
        "before_revision": before["revision"],
        "preview_revision": after_preview["revision"],
        "changed_layers": changed,
        "untouched_layers": sorted(valid_layers - set(changed)),
        "warnings": result_validation["warnings"],
    }
    if dry_run:
        return result

    FEATURES.create_snapshot(
        project_dir,
        before,
        reason=str(patch.get("instruction") or "Before scoped vector patch"),
        changed_layers=changed,
    )

    # Serialize without pretty-printing so whitespace in untouched semantic
    # layers remains byte-for-byte stable. Reparse the exact payload before
    # replacing the project file: serializer side effects must not escape the
    # patch scope either.
    serialized_payload = serialize_svg(root, pretty=False)
    try:
        serialized_root = ET.fromstring(serialized_payload)
    except ET.ParseError as exc:  # pragma: no cover - defensive guard
        raise LayeredRedrawError(f"Serialized patch result is invalid SVG: {exc}") from exc
    serialized_manifest = build_manifest_from_root(
        serialized_root, payload=serialized_payload, config=config
    )
    serialized_hashes = {item["id"]: item["sha256"] for item in serialized_manifest["layers"]}
    serialized_changed = sorted(
        layer_id
        for layer_id in before_hashes
        if before_hashes[layer_id] != serialized_hashes.get(layer_id)
    )
    if serialized_changed != changed:
        escaped_after_serialization = sorted(set(serialized_changed) - expected)
        detail = ", ".join(escaped_after_serialization or serialized_changed)
        raise LayeredRedrawError(
            "SVG serialization changed the declared patch scope"
            + (f": {detail}" if detail else "")
        )

    with tempfile.NamedTemporaryFile(
        mode="wb", suffix=".svg", prefix="layered-redraw-", dir=svg_path.parent, delete=False
    ) as temp_file:
        temp_path = Path(temp_file.name)
    try:
        temp_path.write_bytes(serialized_payload)
        os.replace(temp_path, svg_path)
    finally:
        if temp_path.exists():
            temp_path.unlink()

    final_manifest = build_manifest(svg_path, config)
    final_hashes = {item["id"]: item["sha256"] for item in final_manifest["layers"]}
    final_changed = sorted(
        layer_id for layer_id in before_hashes if before_hashes[layer_id] != final_hashes.get(layer_id)
    )
    if final_changed != changed:
        # Restore the source before surfacing the invariant failure. The
        # existing manifest is intentionally left untouched until this passes.
        with tempfile.NamedTemporaryFile(
            mode="wb", suffix=".svg", prefix="layered-redraw-rollback-", dir=svg_path.parent, delete=False
        ) as rollback_file:
            rollback_path = Path(rollback_file.name)
            rollback_file.write(original_payload)
        try:
            os.replace(rollback_path, svg_path)
        finally:
            if rollback_path.exists():
                rollback_path.unlink()
        raise LayeredRedrawError("Post-write layer isolation check failed; the original SVG was restored")
    write_json(project_dir / "manifest.json", final_manifest)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    log = {
        "schema_version": "1.0",
        "kind": "layered-redraw-patch-log",
        "applied_at": datetime.now(timezone.utc).isoformat(),
        "patch_source": str(patch_file),
        "before_revision": before["revision"],
        "after_revision": final_manifest["revision"],
        "changed_layers": changed,
        "request": patch,
    }
    write_json(project_dir / "patches" / f"{timestamp}-{final_manifest['revision']}.json", log)
    result["after_revision"] = final_manifest["revision"]
    result["manifest"] = str(project_dir / "manifest.json")
    return result


def update_vector_layer_settings(
    raw_target: str | Path,
    layer_id: str,
    *,
    opacity: float | None = None,
    blend_mode: str | None = None,
    visible: bool | None = None,
    locked: bool | None = None,
    label_zh: str | None = None,
    label_en: str | None = None,
    depends_on: list[str] | None = None,
    move: str | None = None,
) -> dict[str, Any]:
    svg_path, project_dir, config = resolve_project(raw_target)
    root = parse_svg(svg_path)
    layers = top_layers(root)
    position = next((index for index, layer in enumerate(layers) if layer.get("id") == layer_id), None)
    if position is None:
        raise LayeredRedrawError(f"Unknown vector layer: {layer_id}")
    if opacity is not None and (isinstance(opacity, bool) or not 0 <= float(opacity) <= 1):
        raise LayeredRedrawError("opacity must be between 0 and 1")
    if blend_mode is not None and blend_mode not in RASTER.SUPPORTED_BLEND_MODES:
        raise LayeredRedrawError("Unsupported blend_mode: " + blend_mode)
    if move not in {None, "up", "down", "top", "bottom"}:
        raise LayeredRedrawError("move must be up, down, top, or bottom")
    before = build_manifest(svg_path, config)
    layer = layers[position]
    original = svg_path.read_bytes()
    if opacity is not None:
        layer.set("opacity", f"{float(opacity):g}")
    if blend_mode is not None:
        layer.set("data-blend-mode", blend_mode)
        style_parts = [part for part in layer.get("style", "").split(";") if part and not part.strip().startswith("mix-blend-mode:")]
        style_parts.append(f"mix-blend-mode:{blend_mode}")
        layer.set("style", ";".join(style_parts))
    if visible is not None:
        if visible:
            layer.attrib.pop("display", None)
        else:
            layer.set("display", "none")
    if locked is not None:
        layer.set("data-locked", "true" if locked else "false")
    if label_zh is not None:
        layer.set("data-label-zh", label_zh.strip())
    if label_en is not None:
        layer.set("data-label-en", label_en.strip())
        layer.set(inkscape_attr("label"), label_en.strip())
    if depends_on is not None:
        layer.set("data-depends-on", " ".join(dict.fromkeys(depends_on)))
    if move:
        children = list(root)
        child_position = children.index(layer)
        semantic_positions = [children.index(item) for item in layers]
        if move == "up":
            destination_layer = min(position + 1, len(layers) - 1)
        elif move == "down":
            destination_layer = max(position - 1, 0)
        elif move == "top":
            destination_layer = len(layers) - 1
        else:
            destination_layer = 0
        if destination_layer != position:
            root.remove(layer)
            destination_child = semantic_positions[destination_layer]
            if destination_layer > position:
                destination_child += 1
            root.insert(min(destination_child, len(root)), layer)

    validation = validate_tree(root, config)
    if validation["errors"]:
        raise LayeredRedrawError("Layer settings are invalid: " + "; ".join(validation["errors"]))
    candidate_payload = serialize_svg(root, pretty=False)
    if candidate_payload == original:
        raise LayeredRedrawError("Layer settings produced no changes")
    FEATURES.create_snapshot(
        project_dir,
        before,
        reason=f"Before layer settings update: {layer_id}",
        changed_layers=[layer_id],
    )
    try:
        svg_path.write_bytes(candidate_payload)
        after = build_manifest(svg_path, config)
        write_json(project_dir / "manifest.json", after)
    except Exception:
        svg_path.write_bytes(original)
        raise
    before_states = {item["id"]: item.get("state_sha256") for item in before["layers"]}
    after_states = {item["id"]: item.get("state_sha256") for item in after["layers"]}
    changed = sorted(layer for layer in before_states if before_states[layer] != after_states.get(layer))
    return {
        "ok": True,
        "before_revision": before["revision"],
        "after_revision": after["revision"],
        "changed_layers": changed,
        "svg": str(svg_path),
    }


def update_layer_settings(raw_target: str | Path, layer_id: str, **settings: Any) -> dict[str, Any]:
    if target_output_mode(raw_target) == "raster-layered":
        return RASTER.update_layer_settings(raw_target, layer_id, **settings)
    settings.pop("layer_type", None)
    settings.pop("editable_source", None)
    return update_vector_layer_settings(raw_target, layer_id, **settings)


def quality_report(raw_target: str | Path) -> dict[str, Any]:
    if target_output_mode(raw_target) == "raster-layered":
        return RASTER.quality_report(raw_target)
    svg_path, project_dir, config = resolve_project(raw_target)
    validation = validate_project(project_dir)
    manifest = build_manifest(svg_path, config)
    checks = {
        "contract": validation["ok"],
        "layer_count_preferred": 8 <= manifest["layer_count"] <= 12,
        "style_recipe_installed": not config.get("style") or (project_dir / "style-recipe.json").is_file(),
        "stable_layer_ids": all(LAYER_ID_RE.fullmatch(str(layer.get("id"))) for layer in manifest["layers"]),
        "all_layers_editable": all(layer.get("object_count", 0) > 0 for layer in manifest["layers"]),
    }
    engineering_score = max(0, 100 - len(validation["errors"]) * 20 - len(validation["warnings"]) * 4)
    return {
        "ok": validation["ok"],
        "project": str(project_dir),
        "revision": manifest["revision"],
        "assessment_scope": "svg-structure-and-project-contract-only",
        "engineering_score": engineering_score,
        "visual_quality": {"status": "not-assessed", "human_confirmed": False},
        "checks": checks,
        "errors": validation["errors"],
        "warnings": validation["warnings"],
        "layers": manifest["layers"],
    }


def create_project(
    output: str | Path,
    *,
    title: str,
    layers: int,
    width: int,
    height: int,
    mode: str = "vector-strict",
    style: str | None = None,
    pixel_scale: int = 4,
    palette_size: int = 32,
) -> dict[str, Any]:
    if mode == "raster-layered":
        return RASTER.create_project(
            output,
            title=title,
            layers=layers,
            width=width,
            height=height,
            style=style,
            pixel_scale=pixel_scale,
            palette_size=palette_size,
        )
    if mode != "vector-strict":
        raise LayeredRedrawError(f"Unsupported new-project mode: {mode}")
    style = FEATURES.normalize_style_id(style) if isinstance(style, str) else None
    if not 5 <= layers <= 20:
        raise LayeredRedrawError("New projects require 5–20 layers")
    project_dir = Path(output).expanduser().resolve()
    if project_dir.exists() and any(project_dir.iterdir()):
        raise LayeredRedrawError(f"Output directory is not empty: {project_dir}")
    project_dir.mkdir(parents=True, exist_ok=True)
    root = ET.Element(
        svg_tag("svg"),
        {
            "viewBox": f"0 0 {width} {height}",
            "width": str(width),
            "height": str(height),
            "role": "img",
        },
    )
    title_node = ET.SubElement(root, svg_tag("title"))
    title_node.text = title
    desc = ET.SubElement(root, svg_tag("desc"))
    desc.text = "Layered Redraw project awaiting artwork."
    names = DEFAULT_LAYER_NAMES[:layers]
    if layers > len(names):
        names.extend(f"additional-{index}" for index in range(len(names) + 1, layers + 1))
    for name in names:
        ET.SubElement(
            root,
            svg_tag("g"),
            {
                "id": f"layer-{name}",
                "data-layer": "true",
                "data-layer-type": "vector",
                "data-blend-mode": "normal",
                "data-depends-on": "",
                "opacity": "1",
                "data-placeholder": "true",
                inkscape_attr("groupmode"): "layer",
                inkscape_attr("label"): name.replace("-", " ").title(),
            },
        )
    write_svg(project_dir / "artwork.svg", root)
    write_json(
        project_dir / "project.json",
        {
            "schema_version": "1.2",
            "title": title,
            "canonical_svg": "artwork.svg",
            "output_mode": "vector-strict",
            "target_layers": layers,
            "style": style,
            "style_recipe": "style-recipe.json" if style else None,
            "workflow_mode": "guided",
            "design_plan": "design-plan.json",
            "object_specs": "object-specs.json",
            "layer_model": "hybrid-semantic",
            "procedural_seed": 1,
        },
    )
    write_json(
        project_dir / "creative-brief.json",
        {"schema_version": "1.0", "status": "draft", "title": title},
    )
    (project_dir / "patches").mkdir(exist_ok=True)
    (project_dir / "history" / "revisions").mkdir(parents=True, exist_ok=True)
    (project_dir / "masks").mkdir(exist_ok=True)
    (project_dir / "directions" / "candidates").mkdir(parents=True, exist_ok=True)
    (project_dir / "proofs" / "sets").mkdir(parents=True, exist_ok=True)
    (project_dir / "references").mkdir(exist_ok=True)
    FEATURES.install_style_recipe(project_dir, style)
    design_plan = FEATURES.initialize_design_plan(project_dir, style=style, workflow_mode="guided")
    PHYSICAL.initialize_document(project_dir, coordinate_unit="svg-unit")
    return {
        "project": str(project_dir),
        "svg": str(project_dir / "artwork.svg"),
        "layers": layers,
        "design_preset": design_plan["selected_preset"],
        "object_specs": str(project_dir / "object-specs.json"),
    }


def project_manifest(raw_target: str | Path) -> tuple[Path, dict[str, Any]]:
    if target_output_mode(raw_target) == "raster-layered":
        project_dir, _, _, _ = RASTER.resolve_project(raw_target)
        return project_dir, RASTER.build_manifest(project_dir)
    svg_path, project_dir, config = resolve_project(raw_target)
    return project_dir, build_manifest(svg_path, config)


def specification_context(
    raw_target: str | Path,
) -> tuple[Path, dict[str, Any], set[str], set[str]]:
    project_dir, manifest = project_manifest(raw_target)
    layer_ids = {
        str(item.get("id"))
        for item in manifest.get("layers", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    object_node_ids: set[str] = set()
    if target_output_mode(project_dir) != "raster-layered":
        svg_path, _, _ = resolve_project(project_dir)
        root = parse_svg(svg_path)
        object_node_ids = {str(node.get("id")) for node in root.iter() if node.get("id")}
    return project_dir, manifest, layer_ids, object_node_ids


def refresh_project_manifest(project_dir: Path) -> dict[str, Any]:
    _, manifest = project_manifest(project_dir)
    write_json(project_dir / "manifest.json", manifest)
    return manifest


def update_object_specification(
    raw_target: str | Path,
    *,
    object_id: str,
    layer_id: str,
    changes: dict[str, Any],
) -> dict[str, Any]:
    project_dir, manifest, layer_ids, object_node_ids = specification_context(raw_target)
    snapshot = FEATURES.create_snapshot(
        project_dir,
        manifest,
        reason=f"Before physical specification update: {object_id}",
        changed_layers=[layer_id],
        force=True,
    )
    result = PHYSICAL.upsert_object(
        project_dir,
        object_id=object_id,
        layer_id=layer_id,
        changes=changes,
        known_layer_ids=layer_ids,
        known_object_node_ids=object_node_ids,
    )
    result["snapshot"] = snapshot
    result["manifest"] = refresh_project_manifest(project_dir)
    return result


def update_specification_layout(raw_target: str | Path, **changes: Any) -> dict[str, Any]:
    project_dir, manifest, _, _ = specification_context(raw_target)
    snapshot = FEATURES.create_snapshot(
        project_dir,
        manifest,
        reason="Before physical specification layout update",
        force=True,
    )
    result = PHYSICAL.configure_layout(project_dir, **changes)
    result["snapshot"] = snapshot
    result["manifest"] = refresh_project_manifest(project_dir)
    return result


def delete_object_specification(raw_target: str | Path, object_id: str) -> dict[str, Any]:
    project_dir, manifest, _, _ = specification_context(raw_target)
    snapshot = FEATURES.create_snapshot(
        project_dir,
        manifest,
        reason=f"Before physical specification removal: {object_id}",
        force=True,
    )
    result = PHYSICAL.remove_object(project_dir, object_id)
    result["snapshot"] = snapshot
    result["manifest"] = refresh_project_manifest(project_dir)
    return result


def create_manual_snapshot(raw_target: str | Path, reason: str) -> dict[str, Any]:
    project_dir, manifest = project_manifest(raw_target)
    return FEATURES.create_snapshot(project_dir, manifest, reason=reason, force=True)


def history_diff(raw_target: str | Path, snapshot_id: str) -> dict[str, Any]:
    project_dir, manifest = project_manifest(raw_target)
    return FEATURES.diff_snapshot(project_dir, manifest, snapshot_id)


def undo_to_snapshot(raw_target: str | Path, snapshot_id: str) -> dict[str, Any]:
    project_dir, current = project_manifest(raw_target)
    FEATURES.create_snapshot(
        project_dir,
        current,
        reason=f"Automatic safety snapshot before restoring {snapshot_id}",
        force=True,
    )
    restored = FEATURES.restore_snapshot(project_dir, snapshot_id)
    if target_output_mode(project_dir) == "raster-layered":
        validation = RASTER.validate_project(project_dir)
        if validation["errors"]:
            raise LayeredRedrawError("Restored raster snapshot is invalid: " + "; ".join(validation["errors"]))
        composed = RASTER.compose_project(project_dir)
        restored["after_revision"] = composed["revision"]
        restored["artwork"] = composed["artwork"]
    else:
        validation = validate_project(project_dir, write_manifest_file=True)
        if validation["errors"]:
            raise LayeredRedrawError("Restored vector snapshot is invalid: " + "; ".join(validation["errors"]))
        restored["after_revision"] = validation["revision"]
        restored["svg"] = validation["svg"]
    return restored


def plugin_root_from_script() -> Path:
    return Path(__file__).resolve().parents[3]


def serve_editor(
    raw_target: str | Path,
    *,
    host: str,
    port: int,
    open_browser: bool,
    _ready_callback: Any | None = None,
) -> None:
    normalized_host = host.strip().lower().rstrip(".")
    if normalized_host not in {"127.0.0.1", "localhost"}:
        raise LayeredRedrawError(
            "The local editor only binds to loopback (127.0.0.1 or localhost). "
            "Use a production service with authentication for remote access."
        )
    mode = target_output_mode(raw_target)
    raster_layer_paths: dict[str, Path] = {}
    if mode == "raster-layered":
        project_dir, config, _, _ = RASTER.resolve_project(raw_target)
        source_name = str(config.get("canonical_composite", "artwork.png"))
        raster_layer_paths = RASTER.layer_paths(project_dir)

        def artwork_payload() -> bytes:
            return RASTER.viewer_svg(project_dir)

        def current_manifest() -> dict[str, Any]:
            return RASTER.build_manifest(project_dir)

        def current_config() -> dict[str, Any]:
            return RASTER.resolve_project(project_dir)[1]

        def current_canvas() -> tuple[int, int]:
            _, fresh_config, _, fresh_index = RASTER.resolve_project(project_dir)
            return RASTER._canvas(fresh_config, fresh_index)

    else:
        svg_path, project_dir, config = resolve_project(raw_target)
        source_name = svg_path.name

        def artwork_payload() -> bytes:
            return svg_path.read_bytes()

        def current_manifest() -> dict[str, Any]:
            return build_manifest(svg_path, current_config())

        def current_config() -> dict[str, Any]:
            return resolve_project(project_dir)[2]

        def current_canvas() -> tuple[int, int]:
            root = parse_svg(svg_path)
            values = [float(value) for value in root.get("viewBox", "0 0 1200 800").replace(",", " ").split()]
            return max(1, round(values[2])), max(1, round(values[3]))

    editor_dir = Path(__file__).resolve().parents[1] / "assets" / "editor"
    if not (editor_dir / "index.html").is_file():
        raise LayeredRedrawError(f"Editor assets are missing: {editor_dir}")

    def refresh_manifest() -> dict[str, Any]:
        manifest = current_manifest()
        write_json(project_dir / "manifest.json", manifest)
        return manifest

    session_token = secrets.token_urlsafe(32)
    allowed_hosts: set[str] = set()
    allowed_origins: set[str] = set()

    class Handler(SimpleHTTPRequestHandler):
        server_version = "LayeredRedrawEditor/0.6"
        sys_version = ""

        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, directory=str(editor_dir), **kwargs)

        def log_message(self, format: str, *args: Any) -> None:
            sys.stdout.write("[editor] " + format % args + "\n")

        def _send_bytes(self, payload: bytes, content_type: str) -> None:
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(payload)

        def _send_json(self, value: Any, status: int = 200) -> None:
            payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(payload)

        def _validate_host(self) -> None:
            request_host = self.headers.get("Host", "").strip().lower().rstrip(".")
            if request_host not in allowed_hosts:
                raise EditorRequestError("Rejected Host header for local editor", status=403)

        def _authorize_mutation(self) -> None:
            self._validate_host()
            origin = self.headers.get("Origin", "").strip().lower().rstrip("/")
            if origin not in allowed_origins:
                raise EditorRequestError("Mutation requests require a same-origin Origin header", status=403)
            referer = self.headers.get("Referer", "").strip().lower()
            if referer and not any(referer == allowed or referer.startswith(allowed + "/") for allowed in allowed_origins):
                raise EditorRequestError("Rejected cross-origin Referer header", status=403)
            fetch_site = self.headers.get("Sec-Fetch-Site", "").strip().lower()
            if fetch_site and fetch_site not in {"same-origin", "none"}:
                raise EditorRequestError("Rejected cross-site mutation request", status=403)
            supplied_token = self.headers.get(EDITOR_SESSION_HEADER, "")
            if not supplied_token or not hmac.compare_digest(supplied_token, session_token):
                raise EditorRequestError("Missing or invalid local editor session token", status=403)
            content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
            if content_type != "application/json":
                raise EditorRequestError("Mutation requests require Content-Type: application/json", status=415)

        def _read_json_body(self, *, limit: int = MAX_EDITOR_JSON_BYTES) -> dict[str, Any]:
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError as exc:
                raise EditorRequestError("Invalid Content-Length", status=400) from exc
            if length <= 0:
                raise EditorRequestError("Request body is empty", status=400)
            if length > limit:
                raise EditorRequestError(
                    f"Request body exceeds the {limit}-byte local editor limit",
                    status=413,
                )
            try:
                value = json.loads(self.rfile.read(length).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise EditorRequestError(f"Invalid JSON request: {exc}", status=400) from exc
            if not isinstance(value, dict):
                raise EditorRequestError("Request JSON root must be an object", status=400)
            return value

        def do_GET(self) -> None:
            try:
                self._validate_host()
            except EditorRequestError as exc:
                self._send_json({"ok": False, "error": str(exc)}, status=exc.status)
                return
            parsed = urlparse(self.path)
            path = parsed.path
            if path == "/api/session":
                self._send_json(
                    {
                        "ok": True,
                        "token": session_token,
                        "header": EDITOR_SESSION_HEADER,
                        "max_request_bytes": MAX_EDITOR_JSON_BYTES,
                    }
                )
                return
            if path == "/api/artwork":
                self._send_bytes(artwork_payload(), "image/svg+xml; charset=utf-8")
                return
            if path == "/api/project":
                manifest = current_manifest()
                history = FEATURES.list_history(project_dir)
                fresh_config = current_config()
                layer_ids = {
                    str(item.get("id"))
                    for item in manifest.get("layers", [])
                    if isinstance(item, dict) and isinstance(item.get("id"), str)
                }
                payload = json.dumps(
                    {
                        "project_dir": str(project_dir),
                        "source_name": source_name,
                        "config": fresh_config,
                        "manifest": manifest,
                        "design_plan": FEATURES.load_design_plan(project_dir),
                        "design_presets": FEATURES.list_design_presets(project_dir),
                        "design_proofs": PROOFS.load_design_proofs(project_dir),
                        "reference_intelligence": REFERENCES.public_state(project_dir),
                        "physical_specifications": PHYSICAL.public_state(
                            project_dir,
                            known_layer_ids=layer_ids,
                        ),
                        "history": {
                            "count": history["count"],
                            "snapshots": history["snapshots"][-12:],
                        },
                    },
                    ensure_ascii=False,
                ).encode("utf-8")
                self._send_bytes(payload, "application/json; charset=utf-8")
                return
            if path == "/api/history":
                self._send_json(FEATURES.list_history(project_dir))
                return
            if path.startswith("/api/history/") and path.endswith("/preview"):
                snapshot_id = unquote(path.removeprefix("/api/history/").removesuffix("/preview").strip("/"))
                preview = FEATURES.snapshot_preview(project_dir, snapshot_id)
                if preview is None:
                    self.send_error(404, "Snapshot preview not found")
                    return
                self._send_bytes(*preview)
                return
            if path == "/api/quality":
                self._send_json(quality_report(project_dir))
                return
            if path == "/api/design-quality":
                self._send_json(FEATURES.design_quality_report(project_dir))
                return
            if path == "/api/design":
                self._send_json({"ok": True, "design_plan": FEATURES.load_design_plan(project_dir)})
                return
            if path == "/api/presets":
                presets = FEATURES.list_design_presets(project_dir)
                self._send_json({"ok": True, "count": len(presets), "presets": presets})
                return
            if path == "/api/proofs":
                self._send_json({"ok": True, "proofs": PROOFS.load_design_proofs(project_dir)})
                return
            if path == "/api/references":
                self._send_json({"ok": True, "reference_intelligence": REFERENCES.public_state(project_dir)})
                return
            if path == "/api/specs":
                manifest = current_manifest()
                layer_ids = {
                    str(item.get("id"))
                    for item in manifest.get("layers", [])
                    if isinstance(item, dict) and isinstance(item.get("id"), str)
                }
                self._send_json(PHYSICAL.public_state(project_dir, known_layer_ids=layer_ids))
                return
            if path.startswith("/api/references/"):
                parts = [unquote(item) for item in path.split("/") if item]
                if len(parts) != 4:
                    self.send_error(404, "Reference artifact not found")
                    return
                run_values = parse_qs(parsed.query).get("run", [])
                run_id = run_values[0] if run_values else None
                try:
                    payload, content_type = REFERENCES.reference_artifact(
                        project_dir,
                        parts[2],
                        parts[3],
                        run_id=run_id,
                    )
                except REFERENCES.ReferenceIntelligenceError as exc:
                    self._send_json({"ok": False, "error": str(exc)}, status=404)
                    return
                self._send_bytes(payload, content_type)
                return
            if path.startswith("/api/proofs/") and path.endswith("/preview"):
                parts = [unquote(item) for item in path.split("/") if item]
                if len(parts) != 5:
                    self.send_error(404, "Proof preview not found")
                    return
                payload, content_type = PROOFS.design_proof_preview(project_dir, parts[2], parts[3])
                self._send_bytes(payload, content_type)
                return
            if path == "/api/styles":
                self._send_json({"recipes": FEATURES.list_style_recipes()})
                return
            if mode == "raster-layered" and path.startswith("/api/layer/"):
                layer_id = path.removeprefix("/api/layer/")
                layer_path = raster_layer_paths.get(layer_id)
                if layer_path is None or not layer_path.is_file():
                    self.send_error(404, "Raster layer not found")
                    return
                self._send_bytes(layer_path.read_bytes(), "image/png")
                return
            super().do_GET()

        def do_POST(self) -> None:
            path = urlparse(self.path).path
            try:
                self._authorize_mutation()
                body = self._read_json_body()
                if path == "/api/specs/object":
                    object_id = body.get("object_id")
                    layer_id = body.get("layer_id")
                    changes = body.get("changes")
                    if not isinstance(object_id, str) or not isinstance(layer_id, str):
                        raise LayeredRedrawError("Physical specification requires object_id and layer_id")
                    if not isinstance(changes, dict):
                        raise LayeredRedrawError("Physical specification changes must be an object")
                    allowed = {
                        "name_zh",
                        "name_en",
                        "category",
                        "measurement_source",
                        "verification",
                        "confidence",
                        "measurements",
                        "remove_measurements",
                        "declared_size",
                        "placement",
                        "notes",
                        "object_node_ids",
                    }
                    unknown = sorted(set(changes) - allowed)
                    if unknown:
                        raise LayeredRedrawError("Unknown physical specification fields: " + ", ".join(unknown))
                    self._send_json(update_object_specification(
                        project_dir,
                        object_id=object_id,
                        layer_id=layer_id,
                        changes=changes,
                    ))
                    return
                if path == "/api/specs/layout":
                    allowed = {
                        "coordinate_unit",
                        "output_width",
                        "output_height",
                        "output_unit",
                        "drawing_scale",
                    }
                    unknown = sorted(set(body) - allowed)
                    if unknown:
                        raise LayeredRedrawError("Unknown specification layout fields: " + ", ".join(unknown))
                    self._send_json(update_specification_layout(project_dir, **body))
                    return
                if path == "/api/specs/remove":
                    object_id = body.get("object_id")
                    if not isinstance(object_id, str):
                        raise LayeredRedrawError("Physical specification removal requires object_id")
                    self._send_json(delete_object_specification(project_dir, object_id))
                    return
                if path == "/api/specs/export":
                    self._send_json(PHYSICAL.export_specifications(project_dir))
                    return
                if path == "/api/references/add":
                    data_url = body.get("data_url")
                    if not isinstance(data_url, str) or not data_url.startswith("data:image/") or ";base64," not in data_url:
                        raise LayeredRedrawError("Reference upload requires an image data_url")
                    try:
                        payload = base64.b64decode(data_url.split(",", 1)[1], validate=True)
                    except (ValueError, binascii.Error) as exc:
                        raise LayeredRedrawError("Reference data_url is not valid base64") from exc
                    result = REFERENCES.register_reference_bytes(
                        project_dir,
                        payload,
                        filename=str(body.get("filename", "reference-image")),
                        role=str(body.get("role", "primary-rgb")),
                        source_id=body.get("source_id") if isinstance(body.get("source_id"), str) else None,
                        label=body.get("label") if isinstance(body.get("label"), str) else None,
                        make_active=bool(body.get("make_active", True)),
                    )
                    self._send_json(result)
                    return
                if path == "/api/references/active":
                    source_id = body.get("source_id")
                    if not isinstance(source_id, str):
                        raise LayeredRedrawError("Selecting a reference requires source_id")
                    self._send_json(REFERENCES.set_active_reference(project_dir, source_id))
                    return
                if path == "/api/depth/estimate":
                    self._send_json(REFERENCES.estimate_depth(
                        project_dir,
                        body.get("source_id") if isinstance(body.get("source_id"), str) else None,
                        model_id=str(body.get("model", REFERENCES.DEFAULT_MODEL_ID)),
                        device=str(body.get("device", "auto")),
                        offline=bool(body.get("offline", False)),
                        zone_count=body.get("zone_count", 5),
                        low_percentile=body.get("low_percentile", 2.0),
                        high_percentile=body.get("high_percentile", 98.0),
                    ))
                    return
                if path == "/api/depth/register":
                    data_url = body.get("data_url")
                    if not isinstance(data_url, str) or not data_url.startswith("data:image/") or ";base64," not in data_url:
                        raise LayeredRedrawError("Depth upload requires an image data_url")
                    try:
                        payload = base64.b64decode(data_url.split(",", 1)[1], validate=True)
                    except (ValueError, binascii.Error) as exc:
                        raise LayeredRedrawError("Depth data_url is not valid base64") from exc
                    self._send_json(REFERENCES.register_depth_bytes(
                        project_dir,
                        payload,
                        filename=str(body.get("filename", "depth-map.png")),
                        source_id=body.get("source_id") if isinstance(body.get("source_id"), str) else None,
                        raw_near=str(body.get("raw_near", "high")),
                        zone_count=body.get("zone_count", 5),
                        low_percentile=body.get("low_percentile", 0.0),
                        high_percentile=body.get("high_percentile", 100.0),
                    ))
                    return
                if path == "/api/planning-request":
                    self._send_json(REFERENCES.create_planning_request(
                        project_dir,
                        str(body.get("prompt", "")),
                        mode=str(body.get("mode", "faithful")),
                        layer_budget=body.get("layer_budget", 10),
                        source_id=body.get("source_id") if isinstance(body.get("source_id"), str) else None,
                        depth_run_id=body.get("depth_run_id") if isinstance(body.get("depth_run_id"), str) else None,
                        separate=body.get("separate"),
                        merge_groups=body.get("merge_groups"),
                        overlays=body.get("overlays"),
                        depth_flattening=body.get("depth_flattening", 0.0),
                        depth_exaggeration=body.get("depth_exaggeration", 0.0),
                    ))
                    return
                if path == "/api/layer-plan/resolve":
                    semantic_regions = body.get("semantic_regions")
                    if not isinstance(semantic_regions, dict):
                        raise LayeredRedrawError("Layer-plan resolution requires semantic_regions")
                    self._send_json(REFERENCES.resolve_layer_plan(
                        project_dir,
                        semantic_regions,
                        raw_request=body.get("planning_request") if isinstance(body.get("planning_request"), dict) else None,
                    ))
                    return
                if path == "/api/mask":
                    data_url = body.get("data_url")
                    if not isinstance(data_url, str) or not data_url.startswith("data:image/png;base64,"):
                        raise LayeredRedrawError("Mask request requires a PNG data_url")
                    try:
                        payload = base64.b64decode(data_url.split(",", 1)[1], validate=True)
                    except (ValueError, binascii.Error) as exc:
                        raise LayeredRedrawError("Mask data_url is not valid base64") from exc
                    result = FEATURES.save_selection_mask(
                        project_dir,
                        payload,
                        canvas=current_canvas(),
                        selection_mode=str(body.get("selection_mode", "brush")),
                    )
                    self._send_json({"ok": True, "mask": result})
                    return
                if path == "/api/layer-settings":
                    layer_id = body.pop("layer_id", None)
                    if not isinstance(layer_id, str):
                        raise LayeredRedrawError("layer-settings requires layer_id")
                    allowed = {
                        "opacity",
                        "blend_mode",
                        "visible",
                        "locked",
                        "label_zh",
                        "label_en",
                        "layer_type",
                        "editable_source",
                        "depends_on",
                        "move",
                    }
                    unknown = sorted(set(body) - allowed)
                    if unknown:
                        raise LayeredRedrawError("Unknown layer settings: " + ", ".join(unknown))
                    result = update_layer_settings(project_dir, layer_id, **body)
                    self._send_json(result)
                    return
                if path == "/api/design/preset":
                    preset_id = body.get("preset_id")
                    if not isinstance(preset_id, str):
                        raise LayeredRedrawError("design preset request requires preset_id")
                    controls = body.get("controls")
                    if controls is not None and not isinstance(controls, dict):
                        raise LayeredRedrawError("design preset controls must be an object")
                    result = FEATURES.apply_design_preset(
                        project_dir,
                        preset_id,
                        controls=controls,
                        workflow_mode=str(body.get("workflow_mode", "guided")),
                        snapshot_manifest=current_manifest(),
                    )
                    result["manifest"] = refresh_manifest()
                    self._send_json(result)
                    return
                if path == "/api/design":
                    result = FEATURES.update_design_plan(
                        project_dir,
                        body,
                        snapshot_manifest=current_manifest(),
                    )
                    result["manifest"] = refresh_manifest()
                    self._send_json(result)
                    return
                if path == "/api/presets/save":
                    preset_id = body.get("preset_id")
                    name_zh = body.get("name_zh")
                    name_en = body.get("name_en")
                    if not all(isinstance(value, str) for value in (preset_id, name_zh, name_en)):
                        raise LayeredRedrawError("Saving a preset requires preset_id, name_zh, and name_en")
                    exposed = body.get("exposed_controls")
                    if exposed is not None and not isinstance(exposed, list):
                        raise LayeredRedrawError("exposed_controls must be an array")
                    result = FEATURES.save_user_design_preset(
                        project_dir,
                        preset_id=preset_id,
                        name_zh=name_zh,
                        name_en=name_en,
                        exposed_controls=exposed,
                    )
                    self._send_json(result)
                    return
                if path == "/api/proofs/create":
                    result = PROOFS.create_design_proofs(
                        project_dir,
                        stage=str(body.get("stage", "full")),
                        spread=body.get("spread", 0.65),
                        base_revision=current_manifest().get("revision"),
                    )
                    self._send_json(result)
                    return
                if path == "/api/proofs/select":
                    variant_id = body.get("variant_id")
                    if not isinstance(variant_id, str):
                        raise LayeredRedrawError("proof selection requires variant_id")
                    result = PROOFS.select_design_proof(
                        project_dir,
                        variant_id,
                        set_id=body.get("set_id") if isinstance(body.get("set_id"), str) else None,
                    )
                    self._send_json(result)
                    return
                if path == "/api/proofs/lock":
                    locked = body.get("locked", True)
                    if not isinstance(locked, bool):
                        raise LayeredRedrawError("proof lock request requires a boolean locked value")
                    result = PROOFS.set_design_proof_lock(
                        project_dir,
                        locked=locked,
                        set_id=body.get("set_id") if isinstance(body.get("set_id"), str) else None,
                    )
                    self._send_json(result)
                    return
                if path == "/api/proofs/promote":
                    result = PROOFS.promote_design_proof(
                        project_dir,
                        set_id=body.get("set_id") if isinstance(body.get("set_id"), str) else None,
                        snapshot_manifest=current_manifest(),
                    )
                    result["manifest"] = refresh_manifest()
                    self._send_json(result)
                    return
                if path == "/api/undo":
                    snapshot_id = body.get("snapshot_id")
                    if not isinstance(snapshot_id, str):
                        raise LayeredRedrawError("undo requires snapshot_id")
                    self._send_json(undo_to_snapshot(project_dir, snapshot_id))
                    return
                self.send_error(404, "Unknown local editor action")
            except EditorRequestError as exc:
                self._send_json({"ok": False, "error": str(exc)}, status=exc.status)
            except (
                LayeredRedrawError,
                RASTER.RasterLayeredError,
                FEATURES.ProjectFeatureError,
                PROOFS.DesignProofError,
                REFERENCES.ReferenceIntelligenceError,
                PHYSICAL.PhysicalSpecError,
            ) as exc:
                self._send_json({"ok": False, "error": str(exc)}, status=400)

    server = ThreadingHTTPServer((host, port), Handler)
    actual_port = server.server_port
    allowed_hosts.update({f"127.0.0.1:{actual_port}", f"localhost:{actual_port}"})
    allowed_origins.update({f"http://127.0.0.1:{actual_port}", f"http://localhost:{actual_port}"})
    url = f"http://{host}:{actual_port}/"
    print(f"Layered Redraw editor: {url}")
    print(f"Project: {project_dir}")
    print("Security: loopback-only, same-origin JSON mutations, per-run session token")
    if callable(_ready_callback):
        _ready_callback(server, url)
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEditor stopped.")
    finally:
        server.server_close()


def print_result(value: Any, *, as_json: bool = True) -> None:
    if as_json:
        print(json.dumps(value, ensure_ascii=False, indent=2))
    else:
        print(value)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Layered Redraw project utilities")
    subparsers = parser.add_subparsers(dest="command", required=True)

    new_parser = subparsers.add_parser("new", help="Create an empty semantic-layer project")
    new_parser.add_argument("output")
    new_parser.add_argument("--title", default="Untitled Layered Redraw")
    new_parser.add_argument("--layers", type=int, default=10)
    new_parser.add_argument("--width", type=int)
    new_parser.add_argument("--height", type=int)
    new_parser.add_argument(
        "--mode",
        choices=("vector-strict", "raster-layered"),
        default="vector-strict",
        help="Create an editable SVG project or a registered PNG layer stack",
    )
    new_parser.add_argument(
        "--style",
        help="Style recipe slug; pixel recipes enable hard-alpha palette validation and nearest-neighbour previews",
    )
    new_parser.add_argument("--pixel-scale", type=int, default=4, help="Nearest-neighbour preview scale")
    new_parser.add_argument("--palette-size", type=int, default=32, help="Pixel-art project color limit")

    validate_parser = subparsers.add_parser("validate", help="Validate vector or raster project contracts")
    validate_parser.add_argument("target")
    validate_parser.add_argument("--write-manifest", action="store_true")

    manifest_parser = subparsers.add_parser("manifest", help="Rebuild manifest.json")
    manifest_parser.add_argument("target")

    split_parser = subparsers.add_parser("split", help="Export SVG layers or report an existing PNG stack")
    split_parser.add_argument("target")
    split_parser.add_argument("--output-dir")

    compose_parser = subparsers.add_parser("compose", help="Composite a raster-layered PNG stack")
    compose_parser.add_argument("target")

    patch_parser = subparsers.add_parser("apply-patch", help="Apply a scoped structured patch")
    patch_parser.add_argument("target")
    patch_parser.add_argument("patch")
    patch_parser.add_argument("--dry-run", action="store_true")

    quality_parser = subparsers.add_parser("quality", help="Run artistic-layer quality gates")
    quality_parser.add_argument("target")

    styles_parser = subparsers.add_parser("styles", help="List bundled machine-readable style recipes")
    styles_parser.add_argument("style", nargs="?")

    presets_parser = subparsers.add_parser("presets", help="List built-in and project design presets")
    presets_parser.add_argument("preset", nargs="?")
    presets_parser.add_argument("--project", help="Include user presets saved inside a project")

    design_parser = subparsers.add_parser("design", help="Show the resolved design plan")
    design_parser.add_argument("target")

    design_check_parser = subparsers.add_parser(
        "design-check",
        help="Inspect plan-schema completeness and declared asset contracts (not artistic quality)",
    )
    design_check_parser.add_argument("target")

    apply_preset_parser = subparsers.add_parser("apply-preset", help="Apply a guided design preset")
    apply_preset_parser.add_argument("target")
    apply_preset_parser.add_argument("preset")
    apply_preset_parser.add_argument("--mode", choices=("guided", "expert"), default="guided")
    apply_preset_parser.add_argument(
        "--control",
        action="append",
        default=[],
        help="Guided control in name=0..1 form; repeat as needed",
    )

    save_preset_parser = subparsers.add_parser("save-preset", help="Save the expert design plan as a user preset")
    save_preset_parser.add_argument("target")
    save_preset_parser.add_argument("preset_id")
    save_preset_parser.add_argument("--name-zh", required=True)
    save_preset_parser.add_argument("--name-en", required=True)
    save_preset_parser.add_argument(
        "--expose",
        nargs="*",
        choices=sorted(FEATURES.GUIDED_CONTROL_KEYS),
        help="Guided controls exposed by the saved preset",
    )

    snapshot_parser = subparsers.add_parser("snapshot", help="Create a recoverable project revision")
    snapshot_parser.add_argument("target")
    snapshot_parser.add_argument("--reason", default="Manual snapshot")

    history_parser = subparsers.add_parser("history", help="List recoverable project revisions")
    history_parser.add_argument("target")

    diff_parser = subparsers.add_parser("diff", help="Compare the current project with a history revision")
    diff_parser.add_argument("target")
    diff_parser.add_argument("snapshot")

    undo_parser = subparsers.add_parser("undo", help="Restore a history revision after taking a safety snapshot")
    undo_parser.add_argument("target")
    undo_parser.add_argument("snapshot")

    settings_parser = subparsers.add_parser("layer-settings", help="Apply non-destructive layer composition controls")
    settings_parser.add_argument("target")
    settings_parser.add_argument("layer_id")
    settings_parser.add_argument("--opacity", type=float)
    settings_parser.add_argument("--blend-mode", choices=sorted(RASTER.SUPPORTED_BLEND_MODES))
    visibility_group = settings_parser.add_mutually_exclusive_group()
    visibility_group.add_argument("--visible", action="store_true")
    visibility_group.add_argument("--hidden", action="store_true")
    lock_group = settings_parser.add_mutually_exclusive_group()
    lock_group.add_argument("--locked", action="store_true")
    lock_group.add_argument("--unlocked", action="store_true")
    settings_parser.add_argument("--label-zh")
    settings_parser.add_argument("--label-en")
    settings_parser.add_argument("--layer-type", choices=sorted(RASTER.SUPPORTED_LAYER_TYPES))
    settings_parser.add_argument("--editable-source")
    settings_parser.add_argument("--depends-on", nargs="*")
    settings_parser.add_argument("--move", choices=("up", "down", "top", "bottom"))

    specs_parser = subparsers.add_parser("specs", help="Show real-world object measurements and visual transforms")
    specs_parser.add_argument("target")

    spec_set_parser = subparsers.add_parser("spec-set", help="Create or update a physical object specification")
    spec_set_parser.add_argument("target")
    spec_set_parser.add_argument("layer_id")
    spec_set_parser.add_argument("object_id")
    spec_set_parser.add_argument("--name-zh")
    spec_set_parser.add_argument("--name-en")
    spec_set_parser.add_argument("--category")
    spec_set_parser.add_argument(
        "--measurement",
        action="append",
        default=[],
        help="Physical measurement such as length=100cm or width=35mm±1; repeat as needed",
    )
    spec_set_parser.add_argument("--remove-measurement", action="append", default=[])
    spec_set_parser.add_argument("--size-label", help="Declared size label, for example XL")
    spec_set_parser.add_argument("--size-system", help="Brand, region, or standard that defines the size label")
    spec_set_parser.add_argument("--size-scope", choices=sorted(PHYSICAL.SIZE_SCOPES), default="garment")
    spec_set_parser.add_argument("--clear-size", action="store_true")
    spec_set_parser.add_argument(
        "--measurement-source",
        choices=sorted(PHYSICAL.MEASUREMENT_SOURCES),
    )
    spec_set_parser.add_argument("--verification", choices=sorted(PHYSICAL.VERIFICATION_STATES))
    spec_set_parser.add_argument("--confidence", type=float)
    spec_set_parser.add_argument("--object-node", action="append", dest="object_nodes")
    spec_set_parser.add_argument("--x", type=float)
    spec_set_parser.add_argument("--y", type=float)
    spec_set_parser.add_argument("--coordinate-unit", choices=sorted(PHYSICAL.COORDINATE_UNITS))
    spec_set_parser.add_argument("--rotation-deg", type=float)
    spec_set_parser.add_argument("--scale-percent", type=float)
    spec_set_parser.add_argument("--orientation")
    spec_set_parser.add_argument("--yaw-deg", type=float)
    spec_set_parser.add_argument("--pitch-deg", type=float)
    spec_set_parser.add_argument("--roll-deg", type=float)
    spec_set_parser.add_argument(
        "--perspective-quad",
        help="Eight comma-separated canvas coordinates: x1,y1,x2,y2,x3,y3,x4,y4",
    )
    spec_set_parser.add_argument("--clear-perspective", action="store_true")
    spec_set_parser.add_argument("--notes")
    spec_set_parser.add_argument("--clear-notes", action="store_true")

    spec_layout_parser = subparsers.add_parser("spec-layout", help="Set output size and drawing scale independently")
    spec_layout_parser.add_argument("target")
    spec_layout_parser.add_argument("--coordinate-unit", choices=sorted(PHYSICAL.COORDINATE_UNITS))
    spec_layout_parser.add_argument("--output-width", type=float)
    spec_layout_parser.add_argument("--output-height", type=float)
    spec_layout_parser.add_argument("--output-unit", choices=sorted(PHYSICAL.PHYSICAL_UNITS))
    spec_layout_parser.add_argument("--drawing-scale", help="not-to-scale or a ratio such as 1:10")

    spec_remove_parser = subparsers.add_parser("spec-remove", help="Remove a physical object specification")
    spec_remove_parser.add_argument("target")
    spec_remove_parser.add_argument("object_id")

    spec_export_parser = subparsers.add_parser("spec-export", help="Export editable SVG and CSV specification sheets")
    spec_export_parser.add_argument("target")
    spec_export_parser.add_argument("--output-dir")

    export_ora_parser = subparsers.add_parser("export-ora", help="Export a raster project to OpenRaster")
    export_ora_parser.add_argument("target")
    export_ora_parser.add_argument("--output")

    import_ora_parser = subparsers.add_parser("import-ora", help="Create or update a project from OpenRaster")
    import_ora_parser.add_argument("ora")
    import_ora_parser.add_argument("output")

    direction_parser = subparsers.add_parser("direction-board", help="Build a 2–6 candidate style contact sheet")
    direction_parser.add_argument("target")
    direction_parser.add_argument(
        "--candidate",
        action="append",
        required=True,
        help="Candidate in label=path form; repeat 2–6 times",
    )
    direction_parser.add_argument("--selected")

    proofs_parser = subparsers.add_parser("proofs", help="Show parameterized A/B/C design-proof sets")
    proofs_parser.add_argument("target")
    proofs_parser.add_argument("--set", dest="set_id", help="Return one proof set by id")

    proof_create_parser = subparsers.add_parser("proof-create", help="Generate three parameterized design proofs")
    proof_create_parser.add_argument("target")
    proof_create_parser.add_argument(
        "--stage",
        choices=("structure", "colour-material", "color-material", "full"),
        default="full",
    )
    proof_create_parser.add_argument("--spread", type=float, default=0.65, help="Variant separation from 0.1 to 1.0")

    proof_select_parser = subparsers.add_parser("proof-select", help="Select proof A, B, or C")
    proof_select_parser.add_argument("target")
    proof_select_parser.add_argument("variant", choices=("A", "B", "C", "a", "b", "c"))
    proof_select_parser.add_argument("--set", dest="set_id")

    proof_lock_parser = subparsers.add_parser("proof-lock", help="Lock or unlock the selected proof direction")
    proof_lock_parser.add_argument("target")
    proof_lock_parser.add_argument("--set", dest="set_id")
    proof_lock_parser.add_argument("--unlock", action="store_true")

    proof_promote_parser = subparsers.add_parser("proof-promote", help="Promote a locked proof into design-plan.json")
    proof_promote_parser.add_argument("target")
    proof_promote_parser.add_argument("--set", dest="set_id")

    proof_register_parser = subparsers.add_parser("proof-register", help="Attach a rendered PNG preview to a proof")
    proof_register_parser.add_argument("target")
    proof_register_parser.add_argument("variant", choices=("A", "B", "C", "a", "b", "c"))
    proof_register_parser.add_argument("source")
    proof_register_parser.add_argument("--set", dest="set_id")

    references_parser = subparsers.add_parser("references", help="Show RGB, depth, and layer-planning state")
    references_parser.add_argument("target")

    reference_add_parser = subparsers.add_parser("reference-add", help="Register an RGB or visual reference")
    reference_add_parser.add_argument("target")
    reference_add_parser.add_argument("image")
    reference_add_parser.add_argument("--role", choices=sorted(REFERENCES.REFERENCE_ROLES), default="primary-rgb")
    reference_add_parser.add_argument("--id", dest="source_id")
    reference_add_parser.add_argument("--label")
    reference_add_parser.add_argument("--inactive", action="store_true")

    reference_active_parser = subparsers.add_parser("reference-active", help="Choose the active scene RGB reference")
    reference_active_parser.add_argument("target")
    reference_active_parser.add_argument("source_id")

    depth_estimate_parser = subparsers.add_parser("depth-estimate", help="Estimate relative depth for a scene RGB")
    depth_estimate_parser.add_argument("target")
    depth_estimate_parser.add_argument("--source", dest="source_id")
    depth_estimate_parser.add_argument("--model", default=REFERENCES.DEFAULT_MODEL_ID)
    depth_estimate_parser.add_argument("--device", default="auto")
    depth_estimate_parser.add_argument("--offline", action="store_true")
    depth_estimate_parser.add_argument("--zones", type=int, default=5)
    depth_estimate_parser.add_argument("--low-percentile", type=float, default=2.0)
    depth_estimate_parser.add_argument("--high-percentile", type=float, default=98.0)

    depth_register_parser = subparsers.add_parser("depth-register", help="Pair an existing single-channel depth map")
    depth_register_parser.add_argument("target")
    depth_register_parser.add_argument("depth")
    depth_register_parser.add_argument("--source", dest="source_id")
    depth_register_parser.add_argument("--raw-near", choices=("high", "low"), required=True)
    depth_register_parser.add_argument("--zones", type=int, default=5)
    depth_register_parser.add_argument("--low-percentile", type=float, default=0.0)
    depth_register_parser.add_argument("--high-percentile", type=float, default=100.0)

    plan_request_parser = subparsers.add_parser("plan-request", help="Create a prompt-directed semantic-layer request")
    plan_request_parser.add_argument("target")
    plan_request_parser.add_argument("prompt")
    plan_request_parser.add_argument("--mode", choices=sorted(REFERENCES.PLAN_MODES), default="faithful")
    plan_request_parser.add_argument("--layers", type=int, default=10)
    plan_request_parser.add_argument("--source", dest="source_id")
    plan_request_parser.add_argument("--depth-run")
    plan_request_parser.add_argument("--separate", action="append", default=[])
    plan_request_parser.add_argument(
        "--merge",
        action="append",
        default=[],
        help="Comma-separated region labels or ids to merge; repeat for another group",
    )
    plan_request_parser.add_argument("--overlay", action="append", default=[])
    plan_request_parser.add_argument("--flatten-depth", type=float, default=0.0)
    plan_request_parser.add_argument("--exaggerate-depth", type=float, default=0.0)

    plan_resolve_parser = subparsers.add_parser("plan-resolve", help="Resolve validated semantic regions into 5-20 layers")
    plan_resolve_parser.add_argument("target")
    plan_resolve_parser.add_argument("regions")
    plan_resolve_parser.add_argument("--request")

    serve_parser = subparsers.add_parser("serve", help="Launch the local selection editor")
    serve_parser.add_argument("target")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8765)
    serve_parser.add_argument("--open", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "new":
            style = FEATURES.normalize_style_id(args.style) if isinstance(args.style, str) else None
            recipe = None
            if style:
                try:
                    recipe = FEATURES.resolve_style_recipe(style)
                except FEATURES.ProjectFeatureError:
                    recipe = None
            pixel_art = args.mode == "raster-layered" and (
                style == "pixel-art" or isinstance(recipe, dict) and isinstance(recipe.get("pixel_art"), dict)
            )
            width = args.width if args.width is not None else (320 if pixel_art else 1200)
            height = args.height if args.height is not None else (240 if pixel_art else 800)
            result = create_project(
                args.output,
                title=args.title,
                layers=args.layers,
                width=width,
                height=height,
                mode=args.mode,
                style=style,
                pixel_scale=args.pixel_scale,
                palette_size=args.palette_size,
            )
        elif args.command == "validate":
            result = validate_project(args.target, write_manifest_file=args.write_manifest)
            print_result(result)
            return 0 if result["ok"] else 1
        elif args.command == "manifest":
            if target_output_mode(args.target) == "raster-layered":
                project_dir, _, _, _ = RASTER.resolve_project(args.target)
                manifest = RASTER.build_manifest(project_dir)
                output = project_dir / "manifest.json"
                write_json(output, manifest)
            else:
                svg_path, project_dir, config = resolve_project(args.target)
                manifest = build_manifest(svg_path, config)
                output = project_dir / "manifest.json"
                write_json(output, manifest)
            result = {"manifest": str(output), "revision": manifest["revision"], "layers": manifest["layer_count"]}
        elif args.command == "split":
            result = split_layers(args.target, args.output_dir)
        elif args.command == "compose":
            if target_output_mode(args.target) != "raster-layered":
                raise LayeredRedrawError("compose is available only for raster-layered projects")
            result = RASTER.compose_project(args.target)
        elif args.command == "apply-patch":
            result = apply_patch(args.target, args.patch, dry_run=args.dry_run)
        elif args.command == "quality":
            result = quality_report(args.target)
        elif args.command == "styles":
            if args.style:
                result = FEATURES.resolve_style_recipe(args.style)
            else:
                result = {"recipes": FEATURES.list_style_recipes()}
        elif args.command == "presets":
            if args.preset:
                result = FEATURES.resolve_design_preset(args.preset, args.project)
            else:
                presets = FEATURES.list_design_presets(args.project)
                result = {"count": len(presets), "presets": presets}
        elif args.command == "design":
            project_dir, _ = project_manifest(args.target)
            result = FEATURES.load_design_plan(project_dir)
        elif args.command == "design-check":
            project_dir, _ = project_manifest(args.target)
            result = FEATURES.design_quality_report(project_dir)
        elif args.command == "apply-preset":
            control_values: dict[str, float] = {}
            for raw_control in args.control:
                if "=" not in raw_control:
                    raise LayeredRedrawError("--control must use name=value form")
                name, raw_value = raw_control.split("=", 1)
                try:
                    control_values[name.strip()] = float(raw_value)
                except ValueError as exc:
                    raise LayeredRedrawError(f"Invalid control value: {raw_control}") from exc
            project_dir, manifest = project_manifest(args.target)
            result = FEATURES.apply_design_preset(
                project_dir,
                args.preset,
                controls=control_values,
                workflow_mode=args.mode,
                snapshot_manifest=manifest,
            )
            if target_output_mode(project_dir) == "raster-layered":
                refreshed_manifest = RASTER.build_manifest(project_dir)
            else:
                refreshed_svg, _, refreshed_config = resolve_project(project_dir)
                refreshed_manifest = build_manifest(refreshed_svg, refreshed_config)
            write_json(project_dir / "manifest.json", refreshed_manifest)
            result["manifest"] = refreshed_manifest
        elif args.command == "save-preset":
            project_dir, _ = project_manifest(args.target)
            result = FEATURES.save_user_design_preset(
                project_dir,
                preset_id=args.preset_id,
                name_zh=args.name_zh,
                name_en=args.name_en,
                exposed_controls=args.expose,
            )
        elif args.command == "snapshot":
            result = create_manual_snapshot(args.target, args.reason)
        elif args.command == "history":
            project_dir, _ = project_manifest(args.target)
            result = FEATURES.list_history(project_dir)
        elif args.command == "diff":
            result = history_diff(args.target, args.snapshot)
        elif args.command == "undo":
            result = undo_to_snapshot(args.target, args.snapshot)
        elif args.command == "layer-settings":
            visible = True if args.visible else False if args.hidden else None
            locked = True if args.locked else False if args.unlocked else None
            settings = {
                "opacity": args.opacity,
                "blend_mode": args.blend_mode,
                "visible": visible,
                "locked": locked,
                "label_zh": args.label_zh,
                "label_en": args.label_en,
                "layer_type": args.layer_type,
                "editable_source": args.editable_source,
                "depends_on": args.depends_on,
                "move": args.move,
            }
            result = update_layer_settings(
                args.target,
                args.layer_id,
                **{key: value for key, value in settings.items() if value is not None},
            )
        elif args.command == "specs":
            project_dir, _, layer_ids, _ = specification_context(args.target)
            result = PHYSICAL.public_state(project_dir, known_layer_ids=layer_ids)
        elif args.command == "spec-set":
            measurements: dict[str, Any] = {}
            for raw_measurement in args.measurement:
                name, measurement = PHYSICAL.parse_measurement(raw_measurement)
                measurements[name] = measurement
            remove_measurements = []
            for name in args.remove_measurement:
                normalized = str(name).strip().lower()
                if not PHYSICAL.FIELD_ID_RE.fullmatch(normalized):
                    raise LayeredRedrawError(f"Invalid measurement field: {name}")
                remove_measurements.append(normalized)
            if args.clear_size and (args.size_label or args.size_system):
                raise LayeredRedrawError("--clear-size cannot be combined with --size-label or --size-system")
            if bool(args.size_label) != bool(args.size_system):
                raise LayeredRedrawError("A declared size requires both --size-label and --size-system")
            if args.clear_perspective and args.perspective_quad:
                raise LayeredRedrawError("--clear-perspective cannot be combined with --perspective-quad")
            if args.clear_notes and args.notes is not None:
                raise LayeredRedrawError("--clear-notes cannot be combined with --notes")
            changes: dict[str, Any] = {}
            for key, value in {
                "name_zh": args.name_zh,
                "name_en": args.name_en,
                "category": args.category,
                "measurement_source": args.measurement_source,
                "verification": args.verification,
                "confidence": args.confidence,
            }.items():
                if value is not None:
                    changes[key] = value
            if measurements:
                changes["measurements"] = measurements
            if remove_measurements:
                changes["remove_measurements"] = remove_measurements
            if args.clear_size:
                changes["declared_size"] = None
            elif args.size_label and args.size_system:
                changes["declared_size"] = {
                    "label": args.size_label,
                    "system": args.size_system,
                    "scope": args.size_scope,
                }
            if args.object_nodes is not None:
                changes["object_node_ids"] = args.object_nodes
            if args.clear_notes:
                changes["notes"] = None
            elif args.notes is not None:
                changes["notes"] = args.notes
            placement = {
                key: value
                for key, value in {
                    "x": args.x,
                    "y": args.y,
                    "coordinate_unit": args.coordinate_unit,
                    "rotation_deg": args.rotation_deg,
                    "scale_percent": args.scale_percent,
                    "orientation": args.orientation,
                }.items()
                if value is not None
            }
            pose = {
                key: value
                for key, value in {
                    "yaw_deg": args.yaw_deg,
                    "pitch_deg": args.pitch_deg,
                    "roll_deg": args.roll_deg,
                }.items()
                if value is not None
            }
            if pose:
                placement["pose"] = pose
            if args.clear_perspective:
                placement["perspective_quad"] = None
            elif args.perspective_quad:
                try:
                    perspective_quad = [float(value.strip()) for value in args.perspective_quad.split(",")]
                except ValueError as exc:
                    raise LayeredRedrawError("--perspective-quad must contain eight numbers") from exc
                if len(perspective_quad) != 8:
                    raise LayeredRedrawError("--perspective-quad must contain eight numbers")
                placement["perspective_quad"] = perspective_quad
            if placement:
                changes["placement"] = placement
            result = update_object_specification(
                args.target,
                object_id=args.object_id,
                layer_id=args.layer_id,
                changes=changes,
            )
        elif args.command == "spec-layout":
            if not any(
                value is not None
                for value in (
                    args.coordinate_unit,
                    args.output_width,
                    args.output_height,
                    args.output_unit,
                    args.drawing_scale,
                )
            ):
                raise LayeredRedrawError("spec-layout requires at least one layout option")
            result = update_specification_layout(
                args.target,
                coordinate_unit=args.coordinate_unit,
                output_width=args.output_width,
                output_height=args.output_height,
                output_unit=args.output_unit,
                drawing_scale=args.drawing_scale,
            )
        elif args.command == "spec-remove":
            result = delete_object_specification(args.target, args.object_id)
        elif args.command == "spec-export":
            project_dir, _, _, _ = specification_context(args.target)
            result = PHYSICAL.export_specifications(project_dir, args.output_dir)
        elif args.command == "export-ora":
            result = RASTER.export_ora(args.target, args.output)
        elif args.command == "import-ora":
            result = RASTER.import_ora(args.ora, args.output)
        elif args.command == "direction-board":
            candidates: list[tuple[str, Path]] = []
            for raw_candidate in args.candidate:
                if "=" not in raw_candidate:
                    raise LayeredRedrawError("--candidate must use label=path form")
                label, raw_path = raw_candidate.split("=", 1)
                if not label.strip() or not raw_path.strip():
                    raise LayeredRedrawError("--candidate requires both a label and a path")
                candidates.append((label.strip(), Path(raw_path.strip())))
            project_dir, _ = project_manifest(args.target)
            result = FEATURES.create_direction_board(
                project_dir, candidates, selected=args.selected
            )
        elif args.command == "proofs":
            project_dir, _ = project_manifest(args.target)
            result = PROOFS.load_design_proofs(project_dir)
            if args.set_id:
                match = next((item for item in result["sets"] if item.get("id") == args.set_id), None)
                if match is None:
                    raise LayeredRedrawError(f"Unknown design-proof set: {args.set_id}")
                result = match
        elif args.command == "proof-create":
            project_dir, manifest = project_manifest(args.target)
            result = PROOFS.create_design_proofs(
                project_dir,
                stage=args.stage,
                spread=args.spread,
                base_revision=manifest.get("revision"),
            )
        elif args.command == "proof-select":
            project_dir, _ = project_manifest(args.target)
            result = PROOFS.select_design_proof(project_dir, args.variant, set_id=args.set_id)
        elif args.command == "proof-lock":
            project_dir, _ = project_manifest(args.target)
            result = PROOFS.set_design_proof_lock(project_dir, locked=not args.unlock, set_id=args.set_id)
        elif args.command == "proof-promote":
            project_dir, manifest = project_manifest(args.target)
            result = PROOFS.promote_design_proof(
                project_dir,
                set_id=args.set_id,
                snapshot_manifest=manifest,
            )
            if target_output_mode(project_dir) == "raster-layered":
                refreshed_manifest = RASTER.build_manifest(project_dir)
            else:
                refreshed_svg, _, refreshed_config = resolve_project(project_dir)
                refreshed_manifest = build_manifest(refreshed_svg, refreshed_config)
            write_json(project_dir / "manifest.json", refreshed_manifest)
            result["manifest"] = refreshed_manifest
        elif args.command == "proof-register":
            project_dir, _ = project_manifest(args.target)
            result = PROOFS.register_design_proof_preview(
                project_dir,
                args.variant,
                args.source,
                set_id=args.set_id,
            )
        elif args.command == "references":
            project_dir, _ = project_manifest(args.target)
            result = REFERENCES.public_state(project_dir)
        elif args.command == "reference-add":
            project_dir, _ = project_manifest(args.target)
            result = REFERENCES.register_reference_file(
                project_dir,
                args.image,
                role=args.role,
                source_id=args.source_id,
                label=args.label,
                make_active=not args.inactive,
            )
        elif args.command == "reference-active":
            project_dir, _ = project_manifest(args.target)
            result = REFERENCES.set_active_reference(project_dir, args.source_id)
        elif args.command == "depth-estimate":
            project_dir, _ = project_manifest(args.target)
            result = REFERENCES.estimate_depth(
                project_dir,
                args.source_id,
                model_id=args.model,
                device=args.device,
                offline=args.offline,
                zone_count=args.zones,
                low_percentile=args.low_percentile,
                high_percentile=args.high_percentile,
            )
        elif args.command == "depth-register":
            project_dir, _ = project_manifest(args.target)
            result = REFERENCES.register_depth_map(
                project_dir,
                args.depth,
                args.source_id,
                raw_near=args.raw_near,
                zone_count=args.zones,
                low_percentile=args.low_percentile,
                high_percentile=args.high_percentile,
            )
        elif args.command == "plan-request":
            project_dir, _ = project_manifest(args.target)
            merge_groups = []
            for raw_group in args.merge:
                group = [item.strip() for item in raw_group.split(",") if item.strip()]
                if len(group) < 2:
                    raise LayeredRedrawError("--merge needs at least two comma-separated region labels or ids")
                merge_groups.append(group)
            result = REFERENCES.create_planning_request(
                project_dir,
                args.prompt,
                mode=args.mode,
                layer_budget=args.layers,
                source_id=args.source_id,
                depth_run_id=args.depth_run,
                separate=args.separate,
                merge_groups=merge_groups,
                overlays=args.overlay,
                depth_flattening=args.flatten_depth,
                depth_exaggeration=args.exaggerate_depth,
            )
        elif args.command == "plan-resolve":
            project_dir, _ = project_manifest(args.target)
            result = REFERENCES.resolve_layer_plan(
                project_dir,
                args.regions,
                raw_request=args.request,
            )
        elif args.command == "serve":
            serve_editor(args.target, host=args.host, port=args.port, open_browser=args.open)
            return 0
        else:
            raise LayeredRedrawError(f"Unknown command: {args.command}")
        print_result(result)
        return 0
    except (
        LayeredRedrawError,
        RASTER.RasterLayeredError,
        FEATURES.ProjectFeatureError,
        PROOFS.DesignProofError,
        REFERENCES.ReferenceIntelligenceError,
        PHYSICAL.PhysicalSpecError,
    ) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
