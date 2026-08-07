#!/usr/bin/env python3
"""Deterministic utilities for Layered Redraw SVG projects.

The artistic decisions belong to Codex and the user. This module protects the
project contract: stable semantic layers, manifests, safe localized patches,
layer exports, and a local request-authoring editor.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import sys
import tempfile
import webbrowser
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from xml.etree import ElementTree as ET


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
        layers.append(
            {
                "id": layer.get("id"),
                "label": layer_label(layer),
                "z_index": index,
                "sha256": element_hash(layer),
                "object_count": graphic_count(layer),
                "visible": is_visible(layer),
                "locked": layer.get("data-locked") == "true",
                "bbox_hint": parse_bbox(layer.get("data-bbox")),
            }
        )
    return {
        "schema_version": "1.0",
        "kind": "layered-redraw-manifest",
        "title": title,
        "revision": revision_for_bytes(payload),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "view_box": view_box,
        "output_mode": config.get("output_mode", "vector-strict"),
        "layer_count": len(layers),
        "layers": layers,
    }


def build_manifest(svg_path: Path, config: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = svg_path.read_bytes()
    root = parse_svg(svg_path)
    return build_manifest_from_root(root, payload=payload, config=config or {})


def validate_tree(root: ET.Element, config: dict[str, Any]) -> dict[str, list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    layers = top_layers(root)
    output_mode = config.get("output_mode", "vector-strict")

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
        bbox_raw = layer.get("data-bbox")
        if bbox_raw and parse_bbox(bbox_raw) is None:
            warnings.append(f"Layer {layer_id} has an invalid data-bbox hint.")

    if output_mode not in {"vector-strict", "vector-textured", "hybrid"}:
        errors.append(f"Unknown output_mode: {output_mode}")
    return {"errors": sorted(set(errors)), "warnings": sorted(set(warnings))}


def validate_project(raw_target: str | Path, *, write_manifest_file: bool = False) -> dict[str, Any]:
    svg_path, project_dir, config = resolve_project(raw_target)
    root = parse_svg(svg_path)
    report = validate_tree(root, config)
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


def create_project(output: str | Path, *, title: str, layers: int, width: int, height: int) -> dict[str, Any]:
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
                "data-placeholder": "true",
                inkscape_attr("groupmode"): "layer",
                inkscape_attr("label"): name.replace("-", " ").title(),
            },
        )
    write_svg(project_dir / "artwork.svg", root)
    write_json(
        project_dir / "project.json",
        {
            "schema_version": "1.0",
            "title": title,
            "canonical_svg": "artwork.svg",
            "output_mode": "vector-strict",
            "target_layers": layers,
            "style": None,
            "procedural_seed": 1,
        },
    )
    write_json(
        project_dir / "creative-brief.json",
        {"schema_version": "1.0", "status": "draft", "title": title},
    )
    (project_dir / "patches").mkdir(exist_ok=True)
    return {"project": str(project_dir), "svg": str(project_dir / "artwork.svg"), "layers": layers}


def plugin_root_from_script() -> Path:
    return Path(__file__).resolve().parents[3]


def serve_editor(raw_target: str | Path, *, host: str, port: int, open_browser: bool) -> None:
    svg_path, project_dir, config = resolve_project(raw_target)
    editor_dir = Path(__file__).resolve().parents[1] / "assets" / "editor"
    if not (editor_dir / "index.html").is_file():
        raise LayeredRedrawError(f"Editor assets are missing: {editor_dir}")

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, directory=str(editor_dir), **kwargs)

        def log_message(self, format: str, *args: Any) -> None:
            sys.stdout.write("[editor] " + format % args + "\n")

        def _send_bytes(self, payload: bytes, content_type: str) -> None:
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self) -> None:
            path = urlparse(self.path).path
            if path == "/api/artwork":
                self._send_bytes(svg_path.read_bytes(), "image/svg+xml; charset=utf-8")
                return
            if path == "/api/project":
                manifest = build_manifest(svg_path, config)
                payload = json.dumps(
                    {
                        "project_dir": str(project_dir),
                        "source_name": svg_path.name,
                        "config": config,
                        "manifest": manifest,
                    },
                    ensure_ascii=False,
                ).encode("utf-8")
                self._send_bytes(payload, "application/json; charset=utf-8")
                return
            super().do_GET()

    server = ThreadingHTTPServer((host, port), Handler)
    url = f"http://{host}:{server.server_port}/"
    print(f"Layered Redraw editor: {url}")
    print(f"Project: {project_dir}")
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
    new_parser.add_argument("--width", type=int, default=1200)
    new_parser.add_argument("--height", type=int, default=800)

    validate_parser = subparsers.add_parser("validate", help="Validate SVG and layer contracts")
    validate_parser.add_argument("target")
    validate_parser.add_argument("--write-manifest", action="store_true")

    manifest_parser = subparsers.add_parser("manifest", help="Rebuild manifest.json")
    manifest_parser.add_argument("target")

    split_parser = subparsers.add_parser("split", help="Export each top-level layer as SVG")
    split_parser.add_argument("target")
    split_parser.add_argument("--output-dir")

    patch_parser = subparsers.add_parser("apply-patch", help="Apply a scoped structured patch")
    patch_parser.add_argument("target")
    patch_parser.add_argument("patch")
    patch_parser.add_argument("--dry-run", action="store_true")

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
            result = create_project(
                args.output,
                title=args.title,
                layers=args.layers,
                width=args.width,
                height=args.height,
            )
        elif args.command == "validate":
            result = validate_project(args.target, write_manifest_file=args.write_manifest)
            print_result(result)
            return 0 if result["ok"] else 1
        elif args.command == "manifest":
            svg_path, project_dir, config = resolve_project(args.target)
            manifest = build_manifest(svg_path, config)
            output = project_dir / "manifest.json"
            write_json(output, manifest)
            result = {"manifest": str(output), "revision": manifest["revision"], "layers": manifest["layer_count"]}
        elif args.command == "split":
            result = split_layers(args.target, args.output_dir)
        elif args.command == "apply-patch":
            result = apply_patch(args.target, args.patch, dry_run=args.dry_run)
        elif args.command == "serve":
            serve_editor(args.target, host=args.host, port=args.port, open_browser=args.open)
            return 0
        else:
            raise LayeredRedrawError(f"Unknown command: {args.command}")
        print_result(result)
        return 0
    except LayeredRedrawError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
