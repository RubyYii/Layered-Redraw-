#!/usr/bin/env python3
"""Physical object specifications for Layered Redraw projects.

The artwork remains free to scale, rotate, and stylize.  This module keeps the
declared real-world measurements separate from those visual transforms so a
designer can change the composition without corrupting product data.
"""

from __future__ import annotations

import csv
import hashlib
import html
import json
import math
import re
import textwrap
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


DOCUMENT_KIND = "layered-redraw-object-specs"
SCHEMA_VERSION = "1.0"
OBJECT_ID_RE = re.compile(r"^object-[a-z0-9]+(?:-[a-z0-9]+)*$")
FIELD_ID_RE = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
LAYER_ID_RE = re.compile(r"^layer-[a-z0-9]+(?:-[a-z0-9]+)*$")
MEASUREMENT_RE = re.compile(
    r"^(?P<name>[a-z][a-z0-9-]*)=(?P<value>[+]?(?:\d+(?:\.\d*)?|\.\d+))"
    r"(?P<unit>mm|cm|m|in|ft)(?:[±+/-](?P<tolerance>\d+(?:\.\d*)?|\.\d+))?$",
    re.IGNORECASE,
)

PHYSICAL_UNITS = {"mm", "cm", "m", "in", "ft"}
COORDINATE_UNITS = {"px", "svg-unit"}
MEASUREMENT_SOURCES = {
    "user-provided",
    "calibrated-reference",
    "size-chart",
    "rgbd",
    "monocular-estimate",
    "visual-estimate",
    "unknown",
}
VERIFICATION_STATES = {"verified", "declared", "estimated", "unknown"}
SIZE_SCOPES = {"garment", "body", "nominal", "unknown"}

CATEGORY_RECOMMENDATIONS = {
    "belt": {"length", "width"},
    "shirt": {"shoulder-width", "chest-circumference", "garment-length", "sleeve-length"},
    "skirt": {"waist-circumference", "hip-circumference", "skirt-length"},
}


class PhysicalSpecError(RuntimeError):
    """Raised when physical specification data cannot be accepted safely."""


def _read_json(path: Path, *, required: bool = False) -> dict[str, Any]:
    if not path.exists():
        if required:
            raise PhysicalSpecError(f"Missing required JSON file: {path}")
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PhysicalSpecError(f"Unable to read JSON file {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise PhysicalSpecError(f"JSON root must be an object: {path}")
    return value


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _finite_number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
    )


def _project(raw_project: str | Path) -> Path:
    project = Path(raw_project).expanduser().resolve()
    if not project.is_dir():
        raise PhysicalSpecError(f"Project directory does not exist: {project}")
    return project


def specification_path(raw_project: str | Path, config: dict[str, Any] | None = None) -> Path:
    project = _project(raw_project)
    project_config = config if isinstance(config, dict) else _read_json(project / "project.json", required=True)
    relative = project_config.get("object_specs", "object-specs.json")
    if not isinstance(relative, str) or not relative.strip():
        raise PhysicalSpecError("project.json object_specs must be a non-empty relative path")
    candidate = (project / relative).resolve()
    if candidate == project or project not in candidate.parents:
        raise PhysicalSpecError("project.json object_specs must stay inside the project directory")
    return candidate


def initial_document(*, coordinate_unit: str = "px") -> dict[str, Any]:
    if coordinate_unit not in COORDINATE_UNITS:
        raise PhysicalSpecError(f"Unsupported canvas coordinate unit: {coordinate_unit}")
    return {
        "schema_version": SCHEMA_VERSION,
        "kind": DOCUMENT_KIND,
        "default_physical_unit": "cm",
        "layout": {
            "coordinate_unit": coordinate_unit,
            "output_size": None,
            "drawing_scale": {"mode": "not-to-scale"},
        },
        "objects": [],
    }


def initialize_document(raw_project: str | Path, *, coordinate_unit: str) -> dict[str, Any]:
    project = _project(raw_project)
    config_path = project / "project.json"
    config = _read_json(config_path, required=True)
    path = specification_path(project, config)
    if path.exists():
        return load_document(project)
    document = initial_document(coordinate_unit=coordinate_unit)
    _write_json(path, document)
    if config.get("object_specs") != path.relative_to(project).as_posix():
        config["object_specs"] = path.relative_to(project).as_posix()
        _write_json(config_path, config)
    return document


def ensure_document(raw_project: str | Path, *, coordinate_unit: str | None = None) -> dict[str, Any]:
    project = _project(raw_project)
    config_path = project / "project.json"
    config = _read_json(config_path, required=True)
    path = specification_path(project, config)
    if path.exists():
        return load_document(project)
    unit = coordinate_unit or ("px" if config.get("output_mode") == "raster-layered" else "svg-unit")
    return initialize_document(project, coordinate_unit=unit)


def load_document(raw_project: str | Path, *, required: bool = True) -> dict[str, Any]:
    project = _project(raw_project)
    return _read_json(specification_path(project), required=required)


def document_sha256(raw_project: str | Path, config: dict[str, Any] | None = None) -> str | None:
    project = _project(raw_project)
    project_config = config if isinstance(config, dict) else _read_json(project / "project.json")
    if not project_config.get("object_specs") and not (project / "object-specs.json").exists():
        return None
    path = specification_path(project, project_config)
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def parse_measurement(raw: str) -> tuple[str, dict[str, Any]]:
    compact = raw.strip().replace(" ", "")
    match = MEASUREMENT_RE.fullmatch(compact)
    if match is None:
        raise PhysicalSpecError(
            "Measurements must use name=valueunit, for example length=100cm or width=35mm±1"
        )
    name = match.group("name").lower()
    value = float(match.group("value"))
    if value <= 0:
        raise PhysicalSpecError("Physical measurements must be greater than zero")
    measurement: dict[str, Any] = {"value": value, "unit": match.group("unit").lower()}
    tolerance = match.group("tolerance")
    if tolerance is not None:
        measurement["tolerance"] = float(tolerance)
    return name, measurement


def parse_scale_ratio(raw: str) -> dict[str, Any]:
    value = raw.strip().lower()
    if value in {"not-to-scale", "nts", "none"}:
        return {"mode": "not-to-scale"}
    match = re.fullmatch(r"(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)", value)
    if match is None:
        raise PhysicalSpecError("Drawing scale must be not-to-scale or a ratio such as 1:10")
    numerator, denominator = (float(match.group(1)), float(match.group(2)))
    if numerator <= 0 or denominator <= 0:
        raise PhysicalSpecError("Drawing scale values must be greater than zero")
    return {"mode": "ratio", "numerator": numerator, "denominator": denominator}


def _validate_layout(layout: Any, errors: list[str]) -> None:
    if not isinstance(layout, dict):
        errors.append("object-specs.json layout must be an object.")
        return
    if layout.get("coordinate_unit") not in COORDINATE_UNITS:
        errors.append("layout.coordinate_unit must be px or svg-unit.")
    output_size = layout.get("output_size")
    if output_size is not None:
        if not isinstance(output_size, dict):
            errors.append("layout.output_size must be null or an object.")
        else:
            if not _finite_number(output_size.get("width")) or float(output_size["width"]) <= 0:
                errors.append("layout.output_size.width must be a positive number.")
            if not _finite_number(output_size.get("height")) or float(output_size["height"]) <= 0:
                errors.append("layout.output_size.height must be a positive number.")
            if output_size.get("unit") not in PHYSICAL_UNITS:
                errors.append("layout.output_size.unit must be a physical unit.")
    drawing_scale = layout.get("drawing_scale")
    if not isinstance(drawing_scale, dict) or drawing_scale.get("mode") not in {"not-to-scale", "ratio"}:
        errors.append("layout.drawing_scale must declare mode not-to-scale or ratio.")
    elif drawing_scale.get("mode") == "ratio":
        for key in ("numerator", "denominator"):
            if not _finite_number(drawing_scale.get(key)) or float(drawing_scale[key]) <= 0:
                errors.append(f"layout.drawing_scale.{key} must be a positive number.")


def validate_document(
    document: dict[str, Any],
    *,
    known_layer_ids: Iterable[str] | None = None,
    known_object_node_ids: Iterable[str] | None = None,
) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    known_layers = set(known_layer_ids or [])
    known_nodes = set(known_object_node_ids or [])

    if document.get("kind") != DOCUMENT_KIND:
        errors.append(f"object-specs.json kind must be {DOCUMENT_KIND}.")
    if document.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"object-specs.json schema_version must be {SCHEMA_VERSION}.")
    if document.get("default_physical_unit") not in PHYSICAL_UNITS:
        errors.append("default_physical_unit must be mm, cm, m, in, or ft.")
    _validate_layout(document.get("layout"), errors)

    objects = document.get("objects")
    if not isinstance(objects, list):
        errors.append("object-specs.json objects must be an array.")
        objects = []
    seen: set[str] = set()
    measured_count = 0
    estimated_count = 0
    for position, item in enumerate(objects, start=1):
        prefix = f"objects[{position}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} must be an object.")
            continue
        object_id = item.get("id")
        if not isinstance(object_id, str) or not OBJECT_ID_RE.fullmatch(object_id):
            errors.append(f"{prefix}.id must match object-name-in-kebab-case.")
        elif object_id in seen:
            errors.append(f"Duplicate physical object id: {object_id}.")
        else:
            seen.add(object_id)
        layer_id = item.get("layer_id")
        if not isinstance(layer_id, str) or not LAYER_ID_RE.fullmatch(layer_id):
            errors.append(f"{prefix}.layer_id must be a stable semantic layer id.")
        elif known_layers and layer_id not in known_layers:
            errors.append(f"Physical object {object_id or position} references unknown layer {layer_id}.")
        if not any(isinstance(item.get(key), str) and item.get(key).strip() for key in ("name_zh", "name_en")):
            errors.append(f"{prefix} requires name_zh or name_en.")
        category = item.get("category")
        if not isinstance(category, str) or not FIELD_ID_RE.fullmatch(category):
            errors.append(f"{prefix}.category must be a lowercase kebab-case name.")
            category = "unknown"
        source = item.get("measurement_source")
        if source not in MEASUREMENT_SOURCES:
            errors.append(f"{prefix}.measurement_source is unsupported.")
        verification = item.get("verification")
        if verification not in VERIFICATION_STATES:
            errors.append(f"{prefix}.verification is unsupported.")
        if verification == "estimated" or source in {"monocular-estimate", "visual-estimate"}:
            estimated_count += 1
        confidence = item.get("confidence")
        if not _finite_number(confidence) or not 0 <= float(confidence) <= 1:
            errors.append(f"{prefix}.confidence must be between 0 and 1.")

        node_ids = item.get("object_node_ids", [])
        if not isinstance(node_ids, list) or any(not isinstance(value, str) or not value for value in node_ids):
            errors.append(f"{prefix}.object_node_ids must be an array of non-empty IDs.")
        elif known_nodes:
            missing = sorted(set(node_ids) - known_nodes)
            if missing:
                errors.append(f"Physical object {object_id or position} references unknown SVG object IDs: {', '.join(missing)}.")

        measurements = item.get("measurements", {})
        if not isinstance(measurements, dict):
            errors.append(f"{prefix}.measurements must be an object.")
            measurements = {}
        for name, measurement in measurements.items():
            if not isinstance(name, str) or not FIELD_ID_RE.fullmatch(name):
                errors.append(f"{prefix}.measurements has an invalid field name: {name}.")
                continue
            if not isinstance(measurement, dict):
                errors.append(f"{prefix}.measurements.{name} must be an object.")
                continue
            if not _finite_number(measurement.get("value")) or float(measurement["value"]) <= 0:
                errors.append(f"{prefix}.measurements.{name}.value must be positive.")
            if measurement.get("unit") not in PHYSICAL_UNITS:
                errors.append(f"{prefix}.measurements.{name}.unit must be physical.")
            tolerance = measurement.get("tolerance")
            if tolerance is not None and (not _finite_number(tolerance) or float(tolerance) < 0):
                errors.append(f"{prefix}.measurements.{name}.tolerance must be non-negative.")
        if measurements:
            measured_count += 1
        recommended = CATEGORY_RECOMMENDATIONS.get(str(category), set())
        missing_recommended = sorted(recommended - set(measurements))
        if missing_recommended:
            warnings.append(
                f"Physical object {object_id or position} is missing recommended {category} measurements: "
                + ", ".join(missing_recommended)
                + "."
            )

        declared_size = item.get("declared_size")
        if declared_size is not None:
            if not isinstance(declared_size, dict):
                errors.append(f"{prefix}.declared_size must be null or an object.")
            else:
                if not isinstance(declared_size.get("label"), str) or not declared_size["label"].strip():
                    errors.append(f"{prefix}.declared_size.label is required.")
                if not isinstance(declared_size.get("system"), str) or not declared_size["system"].strip():
                    errors.append(f"{prefix}.declared_size.system is required because labels such as XL are not universal.")
                if declared_size.get("scope") not in SIZE_SCOPES:
                    errors.append(f"{prefix}.declared_size.scope is unsupported.")
                if not measurements:
                    warnings.append(
                        f"Physical object {object_id or position} has a size label but no numeric garment measurements."
                    )

        placement = item.get("placement")
        if not isinstance(placement, dict):
            errors.append(f"{prefix}.placement must be an object.")
        else:
            for name in ("x", "y", "rotation_deg"):
                if not _finite_number(placement.get(name)):
                    errors.append(f"{prefix}.placement.{name} must be a finite number.")
            scale_percent = placement.get("scale_percent")
            if not _finite_number(scale_percent) or float(scale_percent) <= 0:
                errors.append(f"{prefix}.placement.scale_percent must be positive.")
            if placement.get("coordinate_unit") not in COORDINATE_UNITS:
                errors.append(f"{prefix}.placement.coordinate_unit must be px or svg-unit.")
            pose = placement.get("pose", {})
            if not isinstance(pose, dict):
                errors.append(f"{prefix}.placement.pose must be an object.")
            else:
                for name in ("yaw_deg", "pitch_deg", "roll_deg"):
                    value = pose.get(name)
                    if value is not None and not _finite_number(value):
                        errors.append(f"{prefix}.placement.pose.{name} must be null or finite.")
            quad = placement.get("perspective_quad")
            if quad is not None and (
                not isinstance(quad, list)
                or len(quad) != 8
                or any(not _finite_number(value) for value in quad)
            ):
                errors.append(f"{prefix}.placement.perspective_quad must be null or eight finite coordinates.")

    return {
        "ok": not errors,
        "errors": sorted(set(errors)),
        "warnings": sorted(set(warnings)),
        "object_count": len(objects),
        "measured_object_count": measured_count,
        "estimated_object_count": estimated_count,
    }


def _default_object(
    *,
    object_id: str,
    layer_id: str,
    coordinate_unit: str,
) -> dict[str, Any]:
    return {
        "id": object_id,
        "name_zh": None,
        "name_en": object_id.removeprefix("object-").replace("-", " ").title(),
        "layer_id": layer_id,
        "object_node_ids": [],
        "category": "generic-object",
        "measurement_source": "user-provided",
        "verification": "declared",
        "confidence": 1.0,
        "measurements": {},
        "declared_size": None,
        "placement": {
            "coordinate_unit": coordinate_unit,
            "x": 0.0,
            "y": 0.0,
            "rotation_deg": 0.0,
            "scale_percent": 100.0,
            "orientation": "unspecified",
            "pose": {"yaw_deg": None, "pitch_deg": None, "roll_deg": None},
            "perspective_quad": None,
        },
        "notes": None,
    }


def upsert_object(
    raw_project: str | Path,
    *,
    object_id: str,
    layer_id: str,
    changes: dict[str, Any],
    known_layer_ids: Iterable[str],
    known_object_node_ids: Iterable[str] | None = None,
) -> dict[str, Any]:
    project = _project(raw_project)
    if not OBJECT_ID_RE.fullmatch(object_id):
        raise PhysicalSpecError("object_id must match object-name-in-kebab-case")
    if not LAYER_ID_RE.fullmatch(layer_id):
        raise PhysicalSpecError("layer_id must match layer-name-in-kebab-case")
    document = ensure_document(project)
    objects = document.get("objects", [])
    existing = next((item for item in objects if isinstance(item, dict) and item.get("id") == object_id), None)
    if existing is None:
        coordinate_unit = document.get("layout", {}).get("coordinate_unit", "px")
        existing = _default_object(object_id=object_id, layer_id=layer_id, coordinate_unit=coordinate_unit)
        objects.append(existing)
    existing["layer_id"] = layer_id
    for key in (
        "name_zh",
        "name_en",
        "category",
        "measurement_source",
        "verification",
        "confidence",
        "declared_size",
        "notes",
        "object_node_ids",
    ):
        if key in changes:
            existing[key] = changes[key]
    if isinstance(changes.get("measurements"), dict):
        existing.setdefault("measurements", {}).update(changes["measurements"])
    for name in changes.get("remove_measurements", []):
        existing.setdefault("measurements", {}).pop(name, None)
    if isinstance(changes.get("placement"), dict):
        placement_changes = dict(changes["placement"])
        pose_changes = placement_changes.pop("pose", None)
        existing.setdefault("placement", {}).update(placement_changes)
        if isinstance(pose_changes, dict):
            existing["placement"].setdefault("pose", {}).update(pose_changes)
    document["objects"] = objects
    report = validate_document(
        document,
        known_layer_ids=known_layer_ids,
        known_object_node_ids=known_object_node_ids,
    )
    if report["errors"]:
        raise PhysicalSpecError("; ".join(report["errors"]))
    _write_json(specification_path(project), document)
    return {"ok": True, "object": existing, "validation": report}


def remove_object(raw_project: str | Path, object_id: str) -> dict[str, Any]:
    project = _project(raw_project)
    document = ensure_document(project)
    objects = document.get("objects", [])
    remaining = [item for item in objects if not isinstance(item, dict) or item.get("id") != object_id]
    if len(remaining) == len(objects):
        raise PhysicalSpecError(f"Unknown physical object: {object_id}")
    document["objects"] = remaining
    _write_json(specification_path(project), document)
    return {"ok": True, "removed": object_id, "object_count": len(remaining)}


def configure_layout(
    raw_project: str | Path,
    *,
    coordinate_unit: str | None = None,
    output_width: float | None = None,
    output_height: float | None = None,
    output_unit: str | None = None,
    drawing_scale: str | None = None,
) -> dict[str, Any]:
    project = _project(raw_project)
    document = ensure_document(project)
    layout = document.setdefault("layout", {})
    if coordinate_unit is not None:
        layout["coordinate_unit"] = coordinate_unit
    requested_output = any(value is not None for value in (output_width, output_height, output_unit))
    if requested_output:
        if output_width is None or output_height is None or output_unit is None:
            raise PhysicalSpecError("Output size requires width, height, and unit together")
        layout["output_size"] = {
            "width": float(output_width),
            "height": float(output_height),
            "unit": output_unit,
        }
    if drawing_scale is not None:
        layout["drawing_scale"] = parse_scale_ratio(drawing_scale)
    report = validate_document(document)
    if report["errors"]:
        raise PhysicalSpecError("; ".join(report["errors"]))
    _write_json(specification_path(project), document)
    return {"ok": True, "layout": layout, "validation": report}


def public_state(raw_project: str | Path, *, known_layer_ids: Iterable[str] | None = None) -> dict[str, Any]:
    project = _project(raw_project)
    config = _read_json(project / "project.json", required=True)
    path = specification_path(project, config)
    initialized = path.is_file()
    if initialized:
        document = _read_json(path, required=True)
    else:
        coordinate_unit = "px" if config.get("output_mode") == "raster-layered" else "svg-unit"
        document = initial_document(coordinate_unit=coordinate_unit)
    report = validate_document(document, known_layer_ids=known_layer_ids)
    return {
        "ok": report["ok"],
        "file": str(path),
        "initialized": initialized,
        "document": document,
        "validation": report,
    }


def _measurement_text(measurements: Any) -> str:
    if not isinstance(measurements, dict) or not measurements:
        return "—"
    values = []
    for name, item in sorted(measurements.items()):
        if not isinstance(item, dict):
            continue
        tolerance = item.get("tolerance")
        suffix = f" ±{tolerance:g}" if _finite_number(tolerance) else ""
        values.append(f"{name}: {float(item.get('value', 0)):g} {item.get('unit', '')}{suffix}")
    return "; ".join(values) or "—"


def export_capabilities() -> dict[str, bool]:
    """Report render backends by importing the real optional dependency."""
    try:
        import reportlab  # noqa: F401
        has_pdf = True
    except (ImportError, OSError):
        has_pdf = False
    try:
        from PIL import Image  # noqa: F401
        has_png = True
    except (ImportError, OSError):
        has_png = False
    return {"svg": True, "pdf": has_pdf, "png": has_png, "csv": True, "json": True}


SPEC_EXPORT_FORMATS = ("svg", "pdf", "png", "csv", "json")
DEFAULT_SPEC_EXPORT_FORMATS = ("svg",)
MIN_EXPORT_DPI = 72
MAX_EXPORT_DPI = 600


def _normalise_export_formats(formats: Iterable[str] | None) -> list[str]:
    requested = list(formats) if formats is not None else list(DEFAULT_SPEC_EXPORT_FORMATS)
    if not requested:
        raise PhysicalSpecError("Select at least one specification export format")
    normalised: list[str] = []
    for raw in requested:
        value = str(raw).strip().lower()
        if value == "all":
            values = SPEC_EXPORT_FORMATS
        elif value in SPEC_EXPORT_FORMATS:
            values = (value,)
        else:
            raise PhysicalSpecError(
                f"Unsupported specification export format: {raw}. Choose from {', '.join(SPEC_EXPORT_FORMATS)}"
            )
        for item in values:
            if item not in normalised:
                normalised.append(item)
    return normalised


def _wrap_sheet_text(value: Any, width: int) -> list[str]:
    text = str(value).strip()
    if not text:
        return ["—"]
    return textwrap.wrap(
        text,
        width=max(8, width),
        break_long_words=False,
        break_on_hyphens=False,
        replace_whitespace=False,
        drop_whitespace=True,
    ) or [text]


def _sheet_column(
    primary: Any,
    secondary: Any,
    *,
    primary_width: int,
    secondary_width: int,
    primary_size: int = 12,
    primary_bold: bool = False,
    secondary_size: int = 14,
) -> list[dict[str, Any]]:
    primary_lines = _wrap_sheet_text(primary, primary_width)
    secondary_lines = _wrap_sheet_text(secondary, secondary_width)
    items: list[dict[str, Any]] = []
    for index, line in enumerate(primary_lines):
        items.append(
            {
                "text": line,
                "baseline": 26 + index * 17,
                "size": primary_size,
                "color": "#1F2925",
                "bold": primary_bold,
            }
        )
    secondary_start = max(49, 26 + len(primary_lines) * 17 + 6)
    for index, line in enumerate(secondary_lines):
        items.append(
            {
                "text": line,
                "baseline": secondary_start + index * 17,
                "size": secondary_size,
                "color": "#26312C",
                "bold": False,
            }
        )
    return items


def _sheet_model(document: dict[str, Any]) -> dict[str, Any]:
    objects = document.get("objects", [])
    layout = document.get("layout", {})
    output_size = layout.get("output_size")
    output_label = (
        f"{output_size.get('width'):g} × {output_size.get('height'):g} {output_size.get('unit')}"
        if isinstance(output_size, dict)
        else "not declared"
    )
    scale = layout.get("drawing_scale", {})
    scale_label = (
        f"{scale.get('numerator'):g}:{scale.get('denominator'):g}"
        if scale.get("mode") == "ratio"
        else "not to scale"
    )
    rows = []
    cursor = 190
    for item in objects:
        size = item.get("declared_size") if isinstance(item.get("declared_size"), dict) else {}
        placement = item.get("placement") if isinstance(item.get("placement"), dict) else {}
        name = item.get("name_zh") or item.get("name_en") or item.get("id")
        secondary_name = item.get("name_en") if item.get("name_zh") else ""
        size_text = f"Size {size.get('label')} · {size.get('system')}" if size else "No size label"
        measurements = _measurement_text(item.get("measurements"))
        transform = (
            f"x {placement.get('x', 0):g} · y {placement.get('y', 0):g} {placement.get('coordinate_unit', '')} · "
            f"rotation {placement.get('rotation_deg', 0):g}° · visual scale {placement.get('scale_percent', 100):g}%"
        )
        evidence = (
            f"{item.get('measurement_source')} · {item.get('verification')} · "
            f"confidence {float(item.get('confidence', 0)):.2f}"
        )
        columns = [
            {
                "x": 22,
                "items": _sheet_column(
                    str(name),
                    f"{secondary_name} · {item.get('category')} · {item.get('layer_id')}",
                    primary_width=30,
                    secondary_width=43,
                    primary_size=16,
                    primary_bold=True,
                    secondary_size=11,
                ),
            },
            {
                "x": 330,
                "items": _sheet_column(
                    size_text,
                    measurements,
                    primary_width=58,
                    secondary_width=58,
                ),
            },
            {
                "x": 790,
                "items": _sheet_column(
                    transform,
                    evidence,
                    primary_width=48,
                    secondary_width=48,
                    primary_size=13,
                ),
            },
        ]
        last_baseline = max(
            text_item["baseline"]
            for column in columns
            for text_item in column["items"]
        )
        row_height = max(68, last_baseline + 18)
        rows.append(
            {
                "top": cursor,
                "height": row_height,
                "columns": columns,
            }
        )
        cursor += row_height + 16
    height = max(420, cursor + 34 if rows else 420)
    return {
        "width": 1200,
        "height": height,
        "rows": rows,
        "object_count": len(objects),
        "output_label": output_label,
        "scale_label": scale_label,
        "coordinate_unit": str(layout.get("coordinate_unit")),
        "output_size": output_size if isinstance(output_size, dict) else None,
        "generated": datetime.now(timezone.utc).isoformat(),
    }


def _render_svg_sheet(model: dict[str, Any], destination: Path) -> None:
    rows = []
    for row in model["rows"]:
        text_nodes = []
        for column in row["columns"]:
            for item in column["items"]:
                weight = ' font-weight="700"' if item["bold"] else ""
                text_nodes.append(
                    f'<text x="{column["x"]}" y="{item["baseline"]}" '
                    f'font-family="system-ui,sans-serif" font-size="{item["size"]}"{weight} '
                    f'fill="{item["color"]}">{html.escape(item["text"])}</text>'
                )
        rows.append(
            f'<g transform="translate(54 {row["top"]})">'
            f'<rect width="1092" height="{row["height"]}" rx="12" fill="#F7F5EF" stroke="#D8D3C7"/>'
            f'{"".join(text_nodes)}'
            "</g>"
        )
    if not rows:
        rows.append(
            '<text x="54" y="220" font-family="system-ui,sans-serif" font-size="16" fill="#55615B">No physical objects declared.</text>'
        )
    destination.write_text(
        f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 {model['height']}" width="1200" height="{model['height']}" role="img">
  <rect width="1200" height="{model['height']}" fill="#ECE9E1"/>
  <text x="54" y="68" font-family="Georgia,serif" font-size="34" fill="#1F2925">Physical Object Specification</text>
  <text x="54" y="98" font-family="system-ui,sans-serif" font-size="13" fill="#55615B">真实尺寸与画面变换分离 · REAL SIZE IS INDEPENDENT OF VISUAL SCALE</text>
  <text x="54" y="142" font-family="system-ui,sans-serif" font-size="12" fill="#1F2925">Output {html.escape(model['output_label'])} · Drawing scale {html.escape(model['scale_label'])} · Canvas unit {html.escape(model['coordinate_unit'])}</text>
  {''.join(rows)}
  <text x="54" y="{model['height'] - 34}" font-family="system-ui,sans-serif" font-size="12" fill="#3F4A45">Generated {html.escape(model['generated'])} · Estimated values are not production measurements.</text>
</svg>
''',
        encoding="utf-8",
    )

def _write_csv(document: dict[str, Any], destination: Path) -> None:
    with destination.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "object_id", "name_zh", "name_en", "layer_id", "category", "declared_size",
                "size_system", "measurements", "measurement_source", "verification", "confidence",
                "x", "y", "coordinate_unit", "rotation_deg", "scale_percent", "orientation",
                "yaw_deg", "pitch_deg", "roll_deg", "notes",
            ]
        )
        for item in document.get("objects", []):
            size = item.get("declared_size") if isinstance(item.get("declared_size"), dict) else {}
            placement = item.get("placement") if isinstance(item.get("placement"), dict) else {}
            pose = placement.get("pose") if isinstance(placement.get("pose"), dict) else {}
            writer.writerow(
                [
                    item.get("id"), item.get("name_zh"), item.get("name_en"), item.get("layer_id"),
                    item.get("category"), size.get("label"), size.get("system"),
                    _measurement_text(item.get("measurements")), item.get("measurement_source"),
                    item.get("verification"), item.get("confidence"), placement.get("x"), placement.get("y"),
                    placement.get("coordinate_unit"), placement.get("rotation_deg"), placement.get("scale_percent"),
                    placement.get("orientation"), pose.get("yaw_deg"), pose.get("pitch_deg"), pose.get("roll_deg"),
                    item.get("notes"),
                ]
            )


_PAGE_INCH_FACTORS = {"mm": 1 / 25.4, "cm": 1 / 2.54, "m": 1 / 0.0254, "in": 1.0, "ft": 12.0}
_MAX_RASTER_PIXELS = 50_000_000


def _page_inches(model: dict[str, Any]) -> tuple[float, float]:
    output = model.get("output_size")
    if isinstance(output, dict) and output.get("unit") in _PAGE_INCH_FACTORS:
        width = float(output["width"]) * _PAGE_INCH_FACTORS[output["unit"]]
        height = float(output["height"]) * _PAGE_INCH_FACTORS[output["unit"]]
        if width > 0 and height > 0:
            return width, height
    return 11.69, 8.27


def _logical_transform(model: dict[str, Any], page_width: float, page_height: float) -> tuple[float, float, float]:
    margin = max(12.0, min(page_width, page_height) * 0.045)
    scale = min((page_width - 2 * margin) / model["width"], (page_height - 2 * margin) / model["height"])
    return scale, (page_width - model["width"] * scale) / 2, (page_height - model["height"] * scale) / 2


def _render_pdf_sheet(model: dict[str, Any], destination: Path) -> None:
    try:
        from reportlab.lib.colors import HexColor
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.cidfonts import UnicodeCIDFont
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.pdfgen import canvas
    except (ImportError, OSError) as exc:
        raise PhysicalSpecError("PDF specification export requires ReportLab; install requirements-output.txt") from exc
    page_inches = _page_inches(model)
    page_width, page_height = page_inches[0] * 72, page_inches[1] * 72
    regular_font = "Helvetica"
    bold_font = "Helvetica-Bold"
    embedded_unicode_font = False
    font_candidates = [
        (Path("C:/Windows/Fonts/msyh.ttc"), Path("C:/Windows/Fonts/msyhbd.ttc")),
        (Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"), Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc")),
        (Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")),
    ]
    for regular_path, bold_path in font_candidates:
        if not regular_path.is_file():
            continue
        try:
            pdfmetrics.registerFont(TTFont("LayeredRedrawSans", str(regular_path), subfontIndex=0))
            pdfmetrics.registerFont(TTFont("LayeredRedrawSansBold", str(bold_path if bold_path.is_file() else regular_path), subfontIndex=0))
            regular_font = "LayeredRedrawSans"
            bold_font = "LayeredRedrawSansBold"
            embedded_unicode_font = True
            break
        except Exception:
            continue
    cjk_font = regular_font
    if not embedded_unicode_font:
        try:
            pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
            cjk_font = "STSong-Light"
        except Exception:
            pass
    pdf = canvas.Canvas(str(destination), pagesize=(page_width, page_height), pageCompression=1)
    pdf.setTitle("Physical Object Specification")
    pdf.setAuthor("Layered Redraw")
    pdf.setFillColor(HexColor("#ECE9E1")); pdf.rect(0, 0, page_width, page_height, fill=1, stroke=0)
    scale, offset_x, offset_y = _logical_transform(model, page_width, page_height)
    x = lambda value: offset_x + value * scale
    y = lambda value: offset_y + (model["height"] - value) * scale

    def write(
        value: str,
        left: float,
        baseline: float,
        size: float,
        color: str,
        *,
        bold: bool = False,
    ) -> None:
        text = str(value)
        has_cjk = any("㐀" <= character <= "鿿" for character in text)
        font = bold_font if bold else regular_font
        if has_cjk and not embedded_unicode_font:
            font = cjk_font
        pdf.setFillColor(HexColor(color)); pdf.setFont(font, max(4, size * scale)); pdf.drawString(x(left), y(baseline), text)

    write("Physical Object Specification", 54, 68, 34, "#1F2925", bold=True)
    write("真实尺寸与画面变换分离 · REAL SIZE IS INDEPENDENT OF VISUAL SCALE", 54, 98, 13, "#55615B")
    write(f"Output {model['output_label']} · Drawing scale {model['scale_label']} · Canvas unit {model['coordinate_unit']}", 54, 142, 12, "#1F2925")
    for row in model["rows"]:
        pdf.setFillColor(HexColor("#F7F5EF")); pdf.setStrokeColor(HexColor("#D8D3C7"))
        pdf.roundRect(
            x(54),
            y(row["top"] + row["height"]),
            1092 * scale,
            row["height"] * scale,
            12 * scale,
            fill=1,
            stroke=1,
        )
        for column in row["columns"]:
            for item in column["items"]:
                write(
                    item["text"],
                    54 + column["x"],
                    row["top"] + item["baseline"],
                    item["size"],
                    item["color"],
                    bold=item["bold"],
                )
    if not model["rows"]:
        write("No physical objects declared.", 54, 220, 16, "#55615B")
    write(
        f"Generated {model['generated']} · Estimated values are not production measurements.",
        54,
        model["height"] - 34,
        12,
        "#3F4A45",
    )
    pdf.showPage(); pdf.save()


def _pil_font(size: int, *, bold: bool = False) -> Any:
    from PIL import ImageFont
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            try:
                return ImageFont.truetype(str(candidate), size=max(8, size))
            except OSError:
                continue
    return ImageFont.load_default()


def _render_png_sheet(model: dict[str, Any], destination: Path, dpi: int) -> None:
    try:
        from PIL import Image, ImageDraw
    except (ImportError, OSError) as exc:
        raise PhysicalSpecError("PNG specification export requires Pillow; install requirements-output.txt") from exc
    page_inches = _page_inches(model)
    page_width, page_height = round(page_inches[0] * dpi), round(page_inches[1] * dpi)
    if page_width * page_height > _MAX_RASTER_PIXELS:
        raise PhysicalSpecError("PNG specification page exceeds 50 megapixels; lower --dpi or choose a smaller output size")
    image = Image.new("RGB", (page_width, page_height), "#ECE9E1")
    draw = ImageDraw.Draw(image)
    scale, offset_x, offset_y = _logical_transform(model, page_width, page_height)
    x = lambda value: round(offset_x + value * scale)
    y = lambda value: round(offset_y + value * scale)

    def write(value: str, left: float, baseline: float, size: float, color: str, *, bold: bool = False) -> None:
        draw.text(
            (x(left), y(baseline - size)),
            str(value),
            fill=color,
            font=_pil_font(round(size * scale), bold=bold),
        )

    write("Physical Object Specification", 54, 68, 34, "#1F2925", bold=True)
    write("真实尺寸与画面变换分离 · REAL SIZE IS INDEPENDENT OF VISUAL SCALE", 54, 98, 13, "#55615B")
    write(f"Output {model['output_label']} · Drawing scale {model['scale_label']} · Canvas unit {model['coordinate_unit']}", 54, 142, 12, "#1F2925")
    for row in model["rows"]:
        draw.rounded_rectangle(
            (x(54), y(row["top"]), x(1146), y(row["top"] + row["height"])),
            radius=max(2, round(12 * scale)),
            fill="#F7F5EF",
            outline="#D8D3C7",
        )
        for column in row["columns"]:
            for item in column["items"]:
                write(
                    item["text"],
                    54 + column["x"],
                    row["top"] + item["baseline"],
                    item["size"],
                    item["color"],
                    bold=item["bold"],
                )
    if not model["rows"]:
        write("No physical objects declared.", 54, 220, 16, "#55615B")
    write(
        f"Generated {model['generated']} · Estimated values are not production measurements.",
        54,
        model["height"] - 34,
        12,
        "#3F4A45",
    )
    image.save(destination, format="PNG", dpi=(dpi, dpi), optimize=True)


def _commit_staged_exports(staging: Path, destination: Path, filenames: Iterable[str]) -> None:
    import os
    backup = staging / "backup"
    backup.mkdir()
    committed: list[str] = []
    backed_up: list[str] = []
    try:
        for name in filenames:
            final = destination / name
            if final.exists():
                os.replace(final, backup / name)
                backed_up.append(name)
        for name in filenames:
            os.replace(staging / name, destination / name)
            committed.append(name)
    except OSError as exc:
        for name in committed:
            final = destination / name
            if final.exists():
                final.unlink()
        for name in backed_up:
            saved = backup / name
            if saved.exists():
                os.replace(saved, destination / name)
        raise PhysicalSpecError(f"Unable to commit specification exports atomically: {exc}") from exc


def export_specifications(
    raw_project: str | Path,
    output_dir: str | Path | None = None,
    *,
    formats: Iterable[str] | None = None,
    dpi: int = 144,
) -> dict[str, Any]:
    import shutil
    import tempfile

    project = _project(raw_project)
    document = ensure_document(project)
    report = validate_document(document)
    if report["errors"]:
        raise PhysicalSpecError("Cannot export invalid object specifications: " + "; ".join(report["errors"]))
    destination = (Path(output_dir).expanduser().resolve() if output_dir else project / "specifications")
    if destination == project or project not in destination.parents:
        raise PhysicalSpecError("Specification exports must use a dedicated subdirectory inside the project")
    destination.mkdir(parents=True, exist_ok=True)
    selected = _normalise_export_formats(formats)
    if isinstance(dpi, bool) or not isinstance(dpi, int) or not MIN_EXPORT_DPI <= dpi <= MAX_EXPORT_DPI:
        raise PhysicalSpecError(f"Export DPI must be an integer from {MIN_EXPORT_DPI} to {MAX_EXPORT_DPI}")
    capabilities = export_capabilities()
    unavailable = [item for item in selected if not capabilities[item]]
    if unavailable:
        raise PhysicalSpecError(
            "Unavailable specification export backend: " + ", ".join(unavailable)
            + ". Install requirements-output.txt."
        )
    model = _sheet_model(document)
    filenames = {
        "svg": "object-spec-sheet.svg",
        "pdf": "object-spec-sheet.pdf",
        "png": "object-spec-sheet.png",
        "csv": "object-specs.csv",
        "json": "object-specs.json",
    }
    staging = Path(tempfile.mkdtemp(prefix=".spec-export-", dir=destination))
    try:
        svg_stage = staging / filenames["svg"]
        if "svg" in selected:
            _render_svg_sheet(model, svg_stage)
        for output_format in selected:
            staged = staging / filenames[output_format]
            if output_format == "pdf":
                _render_pdf_sheet(model, staged)
            elif output_format == "png":
                _render_png_sheet(model, staged, dpi)
            elif output_format == "csv":
                _write_csv(document, staged)
            elif output_format == "json":
                _write_json(staged, document)

        _commit_staged_exports(staging, destination, [filenames[item] for item in selected])
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    files = {item: str(destination / filenames[item]) for item in selected}
    return {
        "ok": True,
        "object_count": model["object_count"],
        "primary_format": selected[0],
        "formats": selected,
        "files": files,
        **files,
        "dpi": dpi if "png" in selected else None,
        "canonical": str(specification_path(project)),
        "capabilities": capabilities,
        "validation": report,
    }
