#!/usr/bin/env python3
"""Reference, relative-depth, and prompt-directed layer-planning contracts.

Model dependencies stay optional. Pillow and NumPy are loaded only for image
work; PyTorch and Transformers are loaded only for monocular inference.
"""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import math
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


BUNDLE_KIND = "layered-redraw-reference-bundle"
DEPTH_KIND = "layered-redraw-depth-run"
REQUEST_KIND = "layered-redraw-layer-planning-request"
PLAN_KIND = "layered-redraw-semantic-layer-plan"
REGIONS_KIND = "layered-redraw-semantic-regions"
DEFAULT_MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"
REFERENCE_ROLES = {
    "primary-rgb",
    "alternate-view",
    "style-reference",
    "palette-reference",
}
PLAN_MODES = {"faithful", "art-directed"}
SOURCE_ID_RE = re.compile(r"[a-z0-9][a-z0-9-]{0,63}")
REGION_ID_RE = re.compile(r"region-[a-z0-9]+(?:-[a-z0-9]+)*")
LAYER_ID_RE = re.compile(r"layer-[a-z0-9]+(?:-[a-z0-9]+)*")
MAX_SOURCE_BYTES = 48_000_000
MAX_SOURCE_PIXELS = 100_000_000


class ReferenceIntelligenceError(ValueError):
    """Raised when reference, depth, or layer-planning input is invalid."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _slug(value: str, *, fallback: str = "reference") -> str:
    result = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:64].strip("-")
    result = result or fallback
    if not SOURCE_ID_RE.fullmatch(result):
        raise ReferenceIntelligenceError(f"Unable to create a safe id from: {value}")
    return result


def _project(raw_project: str | Path) -> Path:
    project = Path(raw_project).expanduser().resolve()
    if not (project / "project.json").is_file():
        raise ReferenceIntelligenceError(f"Layered Redraw project not found: {project}")
    return project


def _inside(project: Path, relative: str | Path) -> Path:
    path = (project / relative).resolve()
    if path != project and project not in path.parents:
        raise ReferenceIntelligenceError(f"Project-relative path escapes the project: {relative}")
    return path


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ReferenceIntelligenceError(f"Missing JSON file: {path}") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise ReferenceIntelligenceError(f"Unable to read JSON file {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ReferenceIntelligenceError(f"JSON root must be an object: {path}")
    return value


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", newline="\n", dir=path.parent,
        prefix=f".{path.name}.", suffix=".tmp", delete=False,
    ) as handle:
        handle.write(payload)
        temporary = Path(handle.name)
    temporary.replace(path)


def _pillow() -> tuple[Any, Any]:
    try:
        from PIL import Image, ImageOps
    except ImportError as exc:
        raise ReferenceIntelligenceError(
            "Image references require Pillow. Install requirements-raster.txt first."
        ) from exc
    return Image, ImageOps


def _numpy() -> Any:
    try:
        import numpy as np
    except ImportError as exc:
        raise ReferenceIntelligenceError(
            "Depth processing requires NumPy. Install requirements-depth.txt first."
        ) from exc
    return np


def _empty_bundle() -> dict[str, Any]:
    return {
        "kind": BUNDLE_KIND,
        "schema_version": "1.0",
        "active_rgb": None,
        "active_depth_run": None,
        "items": [],
        "depth_runs": [],
        "updated_at": None,
    }


def _validate_bundle(bundle: dict[str, Any]) -> None:
    if bundle.get("kind") != BUNDLE_KIND:
        raise ReferenceIntelligenceError("references/index.json has an unsupported kind")
    if not isinstance(bundle.get("items"), list) or not isinstance(bundle.get("depth_runs"), list):
        raise ReferenceIntelligenceError("Reference items and depth runs must be arrays")
    item_ids: set[str] = set()
    for item in bundle["items"]:
        if not isinstance(item, dict):
            raise ReferenceIntelligenceError("Every reference item must be an object")
        item_id = item.get("id")
        if not isinstance(item_id, str) or not SOURCE_ID_RE.fullmatch(item_id):
            raise ReferenceIntelligenceError(f"Invalid reference id: {item_id}")
        if item_id in item_ids:
            raise ReferenceIntelligenceError(f"Duplicate reference id: {item_id}")
        item_ids.add(item_id)
        if item.get("role") not in REFERENCE_ROLES:
            raise ReferenceIntelligenceError(f"Unsupported reference role: {item.get('role')}")
    run_ids: set[str] = set()
    for run in bundle["depth_runs"]:
        if not isinstance(run, dict) or run.get("kind") != DEPTH_KIND:
            raise ReferenceIntelligenceError("Every depth run must use the depth-run contract")
        run_id = run.get("id")
        if not isinstance(run_id, str) or run_id in run_ids:
            raise ReferenceIntelligenceError(f"Invalid or duplicate depth run id: {run_id}")
        run_ids.add(run_id)
        if run.get("source_id") not in item_ids:
            raise ReferenceIntelligenceError(f"Depth run {run_id} points to an unknown RGB source")
    if bundle.get("active_rgb") is not None and bundle.get("active_rgb") not in item_ids:
        raise ReferenceIntelligenceError("active_rgb points to an unknown reference")
    if bundle.get("active_depth_run") is not None and bundle.get("active_depth_run") not in run_ids:
        raise ReferenceIntelligenceError("active_depth_run points to an unknown depth run")


def load_bundle(raw_project: str | Path) -> dict[str, Any]:
    project = _project(raw_project)
    path = project / "references" / "index.json"
    if not path.is_file():
        return _empty_bundle()
    bundle = _read_json(path)
    _validate_bundle(bundle)
    return bundle


def _save_bundle(project: Path, bundle: dict[str, Any]) -> None:
    bundle["updated_at"] = _now()
    _validate_bundle(bundle)
    _write_json(project / "references" / "index.json", bundle)


def backend_status() -> dict[str, Any]:
    modules = {name: importlib.util.find_spec(name) is not None for name in ("PIL", "numpy", "torch", "transformers")}
    return {
        "backend": "transformers-depth-anything-v2",
        "ready": all(modules.values()),
        "modules": modules,
        "default_model": DEFAULT_MODEL_ID,
        "relative_depth": True,
        "install": "python -m pip install -r requirements-depth.txt",
    }


def _optional_json(path: Path) -> dict[str, Any] | None:
    return _read_json(path) if path.is_file() else None


def _planning_request_sha256(request: dict[str, Any]) -> str:
    stable = {key: value for key, value in request.items() if key != "created_at"}
    return _sha256(json.dumps(stable, ensure_ascii=False, sort_keys=True).encode("utf-8"))


def public_state(raw_project: str | Path) -> dict[str, Any]:
    project = _project(raw_project)
    bundle = load_bundle(project)
    planning_request = _optional_json(project / "planning-request.json")
    layer_plan = _optional_json(project / "layer-plan.json")
    if layer_plan is None:
        layer_plan_status = "missing"
    elif planning_request is None or layer_plan.get("planning_request_sha256") != _planning_request_sha256(planning_request):
        layer_plan_status = "stale"
    else:
        layer_plan_status = "current"
    return {
        **bundle,
        "reference_count": len(bundle["items"]),
        "depth_count": len(bundle["depth_runs"]),
        "backend_status": backend_status(),
        "planning_request": planning_request,
        "layer_plan": layer_plan,
        "layer_plan_status": layer_plan_status,
    }


def _unique_source_id(bundle: dict[str, Any], requested: str | None, filename: str) -> str:
    existing = {item.get("id") for item in bundle["items"] if isinstance(item, dict)}
    base = _slug(requested or Path(filename).stem)
    if base not in existing:
        return base
    for suffix in range(2, 10_000):
        candidate = f"{base[:58]}-{suffix}"
        if candidate not in existing:
            return candidate
    raise ReferenceIntelligenceError("Unable to allocate a unique reference id")


def register_reference_bytes(
    raw_project: str | Path,
    payload: bytes,
    *,
    filename: str,
    role: str = "primary-rgb",
    source_id: str | None = None,
    label: str | None = None,
    make_active: bool = True,
) -> dict[str, Any]:
    project = _project(raw_project)
    if role not in REFERENCE_ROLES:
        raise ReferenceIntelligenceError(f"Unsupported reference role: {role}")
    if not payload or len(payload) > MAX_SOURCE_BYTES:
        raise ReferenceIntelligenceError("Reference image is empty or exceeds 48 MB")
    Image, ImageOps = _pillow()
    try:
        source = Image.open(io.BytesIO(payload))
        original_format = str(getattr(source, "format", "") or "unknown").lower()
        source.load()
        source = ImageOps.exif_transpose(source)
    except Exception as exc:
        raise ReferenceIntelligenceError(f"Unable to decode the reference image: {exc}") from exc
    width, height = source.size
    if width <= 0 or height <= 0 or width * height > MAX_SOURCE_PIXELS:
        raise ReferenceIntelligenceError("Reference dimensions exceed the 100-million-pixel limit")
    if source.mode == "RGBA":
        flattened = Image.new("RGB", source.size, (255, 255, 255))
        flattened.paste(source, mask=source.getchannel("A"))
        source = flattened
    else:
        source = source.convert("RGB")
    bundle = load_bundle(project)
    allocated = _unique_source_id(bundle, source_id, filename)
    source_dir = project / "references" / allocated
    source_dir.mkdir(parents=True, exist_ok=False)
    destination = source_dir / "rgb.png"
    source.save(destination, "PNG", optimize=True)
    stored = destination.read_bytes()
    item = {
        "id": allocated,
        "role": role,
        "label": label.strip() if isinstance(label, str) and label.strip() else Path(filename).stem,
        "file": destination.relative_to(project).as_posix(),
        "original_filename": Path(filename).name,
        "original_format": original_format,
        "source_sha256": _sha256(payload),
        "stored_sha256": _sha256(stored),
        "width": width,
        "height": height,
        "color_space": "sRGB",
        "added_at": _now(),
        "paired_depth_run": None,
    }
    bundle["items"].append(item)
    if make_active and role in {"primary-rgb", "alternate-view"}:
        bundle["active_rgb"] = allocated
        bundle["active_depth_run"] = None
    _save_bundle(project, bundle)
    return {"ok": True, "reference": item, "bundle": bundle}


def register_reference_file(raw_project: str | Path, raw_image: str | Path, **kwargs: Any) -> dict[str, Any]:
    image_path = Path(raw_image).expanduser().resolve()
    if not image_path.is_file():
        raise ReferenceIntelligenceError(f"Reference image not found: {image_path}")
    return register_reference_bytes(raw_project, image_path.read_bytes(), filename=image_path.name, **kwargs)


def set_active_reference(raw_project: str | Path, source_id: str) -> dict[str, Any]:
    project = _project(raw_project)
    bundle = load_bundle(project)
    item = _item(bundle, source_id)
    if item.get("role") not in {"primary-rgb", "alternate-view"}:
        raise ReferenceIntelligenceError("Only scene RGB references can become active")
    bundle["active_rgb"] = source_id
    runs = [run for run in bundle["depth_runs"] if run.get("source_id") == source_id]
    bundle["active_depth_run"] = runs[-1]["id"] if runs else None
    _save_bundle(project, bundle)
    return {"ok": True, "bundle": bundle}


def _item(bundle: dict[str, Any], source_id: str) -> dict[str, Any]:
    item = next((item for item in bundle["items"] if item.get("id") == source_id), None)
    if item is None:
        raise ReferenceIntelligenceError(f"Unknown reference id: {source_id}")
    return item


def _resolve_device(torch: Any, requested: str) -> Any:
    value = requested.lower().strip()
    if value == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if value == "cuda" and not torch.cuda.is_available():
        raise ReferenceIntelligenceError("CUDA was requested but is unavailable")
    if value == "cuda" or value.startswith("cuda:") or value == "cpu":
        return torch.device(value)
    raise ReferenceIntelligenceError("Device must be auto, cpu, cuda, or cuda:N")


def _predict_depth(image: Any, *, model_id: str, device: str, offline: bool) -> tuple[Any, dict[str, Any]]:
    try:
        import torch
        import torch.nn.functional as functional
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation
    except ImportError as exc:
        raise ReferenceIntelligenceError(
            "Depth estimation is optional and not installed. Run `python -m pip install -r requirements-depth.txt`."
        ) from exc
    np = _numpy()
    resolved = _resolve_device(torch, device)
    try:
        processor = AutoImageProcessor.from_pretrained(model_id, local_files_only=offline)
        model = AutoModelForDepthEstimation.from_pretrained(model_id, local_files_only=offline).to(resolved).eval()
        inputs = {key: value.to(resolved) for key, value in processor(images=image, return_tensors="pt").items()}
        with torch.inference_mode():
            predicted = model(**inputs).predicted_depth
            predicted = functional.interpolate(
                predicted.unsqueeze(1), size=(image.height, image.width), mode="bicubic", align_corners=False,
            ).squeeze()
    except Exception as exc:
        raise ReferenceIntelligenceError(f"Depth model inference failed: {exc}") from exc
    return np.asarray(predicted.detach().float().cpu().numpy(), dtype=np.float32), {
        "backend": "transformers", "model": model_id, "device": str(resolved), "offline": bool(offline), "raw_near": "high",
    }


def _normalize_depth(raw: Any, *, raw_near: str, low_percentile: float, high_percentile: float) -> tuple[Any, dict[str, Any]]:
    np = _numpy()
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in (low_percentile, high_percentile)):
        raise ReferenceIntelligenceError("Depth percentiles must be numbers")
    if not 0 <= low_percentile < high_percentile <= 100:
        raise ReferenceIntelligenceError("Depth percentiles must satisfy 0 <= low < high <= 100")
    values = np.asarray(raw, dtype=np.float32).squeeze()
    if values.ndim != 2 or not values.size:
        raise ReferenceIntelligenceError("Depth must be a non-empty 2D array")
    finite = np.isfinite(values)
    if not bool(finite.any()):
        raise ReferenceIntelligenceError("Depth contains no finite values")
    finite_values = values[finite]
    values = np.where(finite, values, float(np.median(finite_values)))
    low = float(np.percentile(finite_values, low_percentile))
    high = float(np.percentile(finite_values, high_percentile))
    if not math.isfinite(low) or not math.isfinite(high) or high - low <= 1e-12:
        raise ReferenceIntelligenceError("Depth has no usable value range")
    normalized = np.clip((values - low) / (high - low), 0.0, 1.0)
    if raw_near == "low":
        normalized = 1.0 - normalized
    elif raw_near != "high":
        raise ReferenceIntelligenceError("raw_near must be high or low")
    return normalized.astype(np.float32), {
        "raw_min": float(finite_values.min()), "raw_max": float(finite_values.max()),
        "clip_low": low, "clip_high": high, "low_percentile": low_percentile, "high_percentile": high_percentile,
        "normalized_mean": float(normalized.mean()), "normalized_std": float(normalized.std()),
        "invalid_fraction": float(1.0 - finite.mean()),
    }


def _colourize(normalized: Any) -> Any:
    np = _numpy()
    stops = np.asarray(
        [(31, 42, 49), (62, 85, 91), (103, 128, 116), (166, 151, 103), (225, 180, 92), (250, 236, 199)],
        dtype=np.float32,
    )
    position = np.clip(normalized, 0.0, 1.0) * (len(stops) - 1)
    lower = np.floor(position).astype(np.int16)
    upper = np.clip(lower + 1, 0, len(stops) - 1)
    weight = (position - lower)[..., None]
    return np.clip(np.round(stops[lower] * (1.0 - weight) + stops[upper] * weight), 0, 255).astype(np.uint8)


def _depth_bands(normalized: Any, zone_count: int) -> tuple[Any, list[dict[str, Any]]]:
    np = _numpy()
    labels = np.minimum((np.clip(normalized, 0.0, 1.0) * zone_count).astype(np.uint8), zone_count - 1)
    names = [
        ("最远", "Farthest"), ("远景", "Far"), ("远中景", "Far middle"), ("中景", "Middle"),
        ("近中景", "Near middle"), ("近景", "Near"), ("前景", "Foreground"), ("最近", "Nearest"),
    ]
    bands = []
    for index in range(zone_count):
        name_index = round(index * (len(names) - 1) / max(1, zone_count - 1))
        bands.append({
            "index": index, "name_zh": names[name_index][0], "name_en": names[name_index][1],
            "nearness_range": [index / zone_count, (index + 1) / zone_count],
            "pixel_fraction": float((labels == index).mean()),
        })
    return labels, bands


def _persist_depth(
    project: Path,
    *,
    bundle: dict[str, Any],
    source_item: dict[str, Any],
    normalized: Any,
    stats: dict[str, Any],
    zone_count: int,
    provider: dict[str, Any],
    source_kind: str,
    supplied_depth_sha256: str | None = None,
) -> dict[str, Any]:
    np = _numpy()
    Image, _ = _pillow()
    source_id = str(source_item["id"])
    run_id = f"depth-{_timestamp()}-{hashlib.sha256(f'{source_id}:{_now()}'.encode()).hexdigest()[:8]}"
    run_dir = project / "references" / source_id / "depth" / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    labels, bands = _depth_bands(normalized, zone_count)

    depth_16 = np.clip(np.round(normalized * 65535), 0, 65535).astype(np.uint16)
    preview = np.clip(np.round(normalized * 255), 0, 255).astype(np.uint8)
    zones = np.clip(np.round(labels.astype(np.float32) * 255 / max(1, zone_count - 1)), 0, 255).astype(np.uint8)
    artifacts = {
        "depth_16": (run_dir / "depth-16.png").relative_to(project).as_posix(),
        "preview": (run_dir / "depth-preview.png").relative_to(project).as_posix(),
        "colour_preview": (run_dir / "depth-colour.png").relative_to(project).as_posix(),
        "zones": (run_dir / "depth-zones.png").relative_to(project).as_posix(),
        "zones_preview": (run_dir / "depth-zones-colour.png").relative_to(project).as_posix(),
        "metadata": (run_dir / "depth.json").relative_to(project).as_posix(),
    }
    Image.fromarray(depth_16).save(_inside(project, artifacts["depth_16"]), "PNG")
    Image.fromarray(preview).save(_inside(project, artifacts["preview"]), "PNG", optimize=True)
    Image.fromarray(_colourize(normalized)).save(_inside(project, artifacts["colour_preview"]), "PNG", optimize=True)
    Image.fromarray(zones).save(_inside(project, artifacts["zones"]), "PNG", optimize=True)
    Image.fromarray(_colourize(labels.astype(np.float32) / max(1, zone_count - 1))).save(
        _inside(project, artifacts["zones_preview"]), "PNG", optimize=True
    )
    run = {
        "kind": DEPTH_KIND,
        "schema_version": "1.0",
        "id": run_id,
        "source_id": source_id,
        "source_kind": source_kind,
        "source_rgb_sha256": source_item["stored_sha256"],
        "source_depth_sha256": supplied_depth_sha256,
        "width": int(source_item["width"]),
        "height": int(source_item["height"]),
        "relative_depth": True,
        "orientation": "near-white",
        "meaning": "0 is robust far; 65535 is robust near. Values are relative, not metres.",
        "provider": provider,
        "normalization": stats,
        "zone_count": zone_count,
        "bands": bands,
        "artifacts": artifacts,
        "created_at": _now(),
    }
    run["artifact_sha256"] = {
        key: _sha256(_inside(project, relative).read_bytes())
        for key, relative in artifacts.items()
        if key != "metadata"
    }
    _write_json(_inside(project, artifacts["metadata"]), run)
    bundle["depth_runs"].append(run)
    bundle["active_rgb"] = source_id
    bundle["active_depth_run"] = run_id
    source_item["paired_depth_run"] = run_id
    _save_bundle(project, bundle)
    return run


def estimate_depth(
    raw_project: str | Path,
    source_id: str | None = None,
    *,
    model_id: str = DEFAULT_MODEL_ID,
    device: str = "auto",
    offline: bool = False,
    zone_count: int = 5,
    low_percentile: float = 2.0,
    high_percentile: float = 98.0,
    predictor: Callable[[Any], Any] | None = None,
) -> dict[str, Any]:
    project = _project(raw_project)
    if not isinstance(zone_count, int) or isinstance(zone_count, bool) or not 3 <= zone_count <= 8:
        raise ReferenceIntelligenceError("Depth zone count must be an integer from 3 to 8")
    if any(
        isinstance(value, bool) or not isinstance(value, (int, float))
        for value in (low_percentile, high_percentile)
    ) or not 0 <= low_percentile < high_percentile <= 100:
        raise ReferenceIntelligenceError("Depth percentiles must satisfy 0 <= low < high <= 100")
    bundle = load_bundle(project)
    selected_id = source_id or bundle.get("active_rgb")
    if not isinstance(selected_id, str):
        raise ReferenceIntelligenceError("Register or select an RGB scene reference first")
    source_item = _item(bundle, selected_id)
    if source_item.get("role") not in {"primary-rgb", "alternate-view"}:
        raise ReferenceIntelligenceError("Depth can be estimated only from scene RGB references")
    Image, _ = _pillow()
    image = Image.open(_inside(project, source_item["file"])).convert("RGB")
    if predictor is None:
        raw, provider = _predict_depth(image, model_id=model_id, device=device, offline=offline)
    else:
        prediction = predictor(image)
        if isinstance(prediction, tuple) and len(prediction) == 2:
            raw, provider = prediction
        else:
            raw = prediction
            provider = {"backend": "injected", "model": "injected", "device": "cpu", "raw_near": "high"}
    normalized, stats = _normalize_depth(
        raw,
        raw_near=str(provider.get("raw_near", "high")),
        low_percentile=low_percentile,
        high_percentile=high_percentile,
    )
    if tuple(normalized.shape) != (int(source_item["height"]), int(source_item["width"])):
        raise ReferenceIntelligenceError("Depth dimensions do not match the registered RGB reference")
    run = _persist_depth(
        project,
        bundle=bundle,
        source_item=source_item,
        normalized=normalized,
        stats=stats,
        zone_count=zone_count,
        provider=provider,
        source_kind="estimated-monocular",
    )
    return {"ok": True, "run": run, "bundle": bundle}


def register_depth_bytes(
    raw_project: str | Path,
    payload: bytes,
    *,
    filename: str,
    source_id: str | None = None,
    raw_near: str,
    zone_count: int = 5,
    low_percentile: float = 0.0,
    high_percentile: float = 100.0,
) -> dict[str, Any]:
    project = _project(raw_project)
    if raw_near not in {"high", "low"}:
        raise ReferenceIntelligenceError("Supplied depth requires raw_near high or low")
    if not isinstance(zone_count, int) or isinstance(zone_count, bool) or not 3 <= zone_count <= 8:
        raise ReferenceIntelligenceError("Depth zone count must be an integer from 3 to 8")
    if not payload or len(payload) > MAX_SOURCE_BYTES:
        raise ReferenceIntelligenceError("Depth map is empty or exceeds 48 MB")
    bundle = load_bundle(project)
    selected_id = source_id or bundle.get("active_rgb")
    if not isinstance(selected_id, str):
        raise ReferenceIntelligenceError("Choose the RGB reference paired with this depth map")
    source_item = _item(bundle, selected_id)
    Image, _ = _pillow()
    np = _numpy()
    try:
        image = Image.open(io.BytesIO(payload))
        image.load()
    except Exception as exc:
        raise ReferenceIntelligenceError(f"Unable to decode the supplied depth map: {exc}") from exc
    if image.mode not in {"L", "I", "I;16", "I;16L", "I;16B", "F"}:
        raise ReferenceIntelligenceError("Supplied depth must be a single-channel image")
    if image.size != (int(source_item["width"]), int(source_item["height"])):
        raise ReferenceIntelligenceError(
            f"Depth map is {image.width}x{image.height}; expected {source_item['width']}x{source_item['height']}"
        )
    normalized, stats = _normalize_depth(
        np.asarray(image, dtype=np.float32),
        raw_near=raw_near,
        low_percentile=low_percentile,
        high_percentile=high_percentile,
    )
    provider = {
        "backend": "supplied-rgbd",
        "model": None,
        "device": None,
        "raw_near": raw_near,
        "original_filename": Path(filename).name,
    }
    run = _persist_depth(
        project,
        bundle=bundle,
        source_item=source_item,
        normalized=normalized,
        stats=stats,
        zone_count=zone_count,
        provider=provider,
        source_kind="supplied-depth-map",
        supplied_depth_sha256=_sha256(payload),
    )
    return {"ok": True, "run": run, "bundle": bundle}


def register_depth_map(
    raw_project: str | Path,
    raw_depth: str | Path,
    source_id: str | None = None,
    *,
    raw_near: str,
    zone_count: int = 5,
    low_percentile: float = 0.0,
    high_percentile: float = 100.0,
) -> dict[str, Any]:
    path = Path(raw_depth).expanduser().resolve()
    if not path.is_file():
        raise ReferenceIntelligenceError(f"Depth map not found: {path}")
    return register_depth_bytes(
        raw_project,
        path.read_bytes(),
        filename=path.name,
        source_id=source_id,
        raw_near=raw_near,
        zone_count=zone_count,
        low_percentile=low_percentile,
        high_percentile=high_percentile,
    )


def reference_artifact(
    raw_project: str | Path,
    source_id: str,
    artifact: str,
    *,
    run_id: str | None = None,
) -> tuple[bytes, str]:
    project = _project(raw_project)
    bundle = load_bundle(project)
    source_item = _item(bundle, source_id)
    if artifact == "rgb":
        return _inside(project, source_item["file"]).read_bytes(), "image/png"
    selected_run_id = run_id or source_item.get("paired_depth_run")
    run = next((run for run in bundle["depth_runs"] if run.get("id") == selected_run_id), None)
    if run is None or run.get("source_id") != source_id:
        raise ReferenceIntelligenceError(f"Depth run not found for {source_id}: {selected_run_id}")
    key = {
        "depth": "depth_16",
        "preview": "preview",
        "colour": "colour_preview",
        "zones": "zones",
        "zones-colour": "zones_preview",
        "metadata": "metadata",
    }.get(artifact)
    if key is None:
        raise ReferenceIntelligenceError(f"Unknown reference artifact: {artifact}")
    relative = run.get("artifacts", {}).get(key)
    if not isinstance(relative, str):
        raise ReferenceIntelligenceError(f"Depth artifact is unavailable: {artifact}")
    path = _inside(project, relative)
    if not path.is_file():
        raise ReferenceIntelligenceError(f"Depth artifact is missing: {relative}")
    return path.read_bytes(), "application/json; charset=utf-8" if artifact == "metadata" else "image/png"


def create_planning_request(
    raw_project: str | Path,
    prompt: str,
    *,
    mode: str = "faithful",
    layer_budget: int = 10,
    source_id: str | None = None,
    depth_run_id: str | None = None,
    separate: list[str] | None = None,
    merge_groups: list[list[str]] | None = None,
    overlays: list[str] | None = None,
    depth_flattening: float = 0.0,
    depth_exaggeration: float = 0.0,
) -> dict[str, Any]:
    project = _project(raw_project)
    if not isinstance(prompt, str):
        raise ReferenceIntelligenceError("Layer-planning prompt must be text")
    prompt = prompt.strip()
    if not prompt or len(prompt) > 5000:
        raise ReferenceIntelligenceError("Layer-planning prompt must contain 1 to 5000 characters")
    if mode not in PLAN_MODES:
        raise ReferenceIntelligenceError("Planning mode must be faithful or art-directed")
    if not isinstance(layer_budget, int) or isinstance(layer_budget, bool) or not 5 <= layer_budget <= 20:
        raise ReferenceIntelligenceError("Layer budget must be an integer from 5 to 20")
    if any(
        isinstance(value, bool) or not isinstance(value, (int, float))
        for value in (depth_flattening, depth_exaggeration)
    ) or not 0 <= depth_flattening <= 1 or not 0 <= depth_exaggeration <= 1:
        raise ReferenceIntelligenceError("Depth flattening and exaggeration must be between 0 and 1")
    if mode == "faithful" and (depth_flattening or depth_exaggeration):
        raise ReferenceIntelligenceError("Faithful mode cannot alter depth interpretation")
    bundle = load_bundle(project)
    selected_source = source_id or bundle.get("active_rgb")
    if not isinstance(selected_source, str):
        raise ReferenceIntelligenceError("Register or select an RGB scene reference first")
    source_item = _item(bundle, selected_source)
    selected_depth = depth_run_id or (
        bundle.get("active_depth_run") if bundle.get("active_rgb") == selected_source else source_item.get("paired_depth_run")
    )
    if selected_depth is not None and not any(
        run.get("id") == selected_depth and run.get("source_id") == selected_source for run in bundle["depth_runs"]
    ):
        raise ReferenceIntelligenceError("Selected depth run is not paired with the selected RGB reference")
    separate = _clean_string_list(separate, "separate")
    overlays = _clean_string_list(overlays, "overlays")
    merge_groups = _clean_merge_groups(merge_groups)
    request = {
        "kind": REQUEST_KIND,
        "schema_version": "1.0",
        "source_id": selected_source,
        "source_rgb_sha256": source_item["stored_sha256"],
        "depth_run_id": selected_depth,
        "prompt": prompt,
        "mode": mode,
        "layer_budget": layer_budget,
        "directives": {"separate": separate, "merge_groups": merge_groups, "overlays": overlays},
        "depth_policy": {
            "raw_depth_immutable": True,
            "interpretation": mode,
            "flattening": depth_flattening if mode == "art-directed" else 0.0,
            "exaggeration": depth_exaggeration if mode == "art-directed" else 0.0,
        },
        "required_region_fields": [
            "id", "label_zh", "label_en", "semantic_class", "depth_mean", "area_fraction", "confidence"
        ],
        "planner_note": "Analyze semantics from RGB and prompt; use depth only as spatial evidence. Do not turn depth bands directly into artwork layers.",
        "created_at": _now(),
    }
    _write_json(project / "planning-request.json", request)
    directive = {
        "kind": "layered-redraw-depth-directive",
        "schema_version": "1.0",
        "source_depth_run": selected_depth,
        "raw_depth_immutable": True,
        "mode": mode,
        "flattening": request["depth_policy"]["flattening"],
        "exaggeration": request["depth_policy"]["exaggeration"],
        "prompt": prompt,
        "created_at": request["created_at"],
    }
    _write_json(project / "depth-directive.json", directive)
    return {"ok": True, "request": request, "file": str(project / "planning-request.json")}


def _clean_string_list(values: list[str] | None, field: str) -> list[str]:
    if values is None:
        return []
    if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
        raise ReferenceIntelligenceError(f"{field} must be an array of strings")
    return list(dict.fromkeys(value.strip() for value in values if value.strip()))


def _clean_merge_groups(values: list[list[str]] | None) -> list[list[str]]:
    if values is None:
        return []
    if not isinstance(values, list):
        raise ReferenceIntelligenceError("merge_groups must be an array of string arrays")
    result = []
    for group in values:
        cleaned = _clean_string_list(group, "merge group")
        if len(cleaned) < 2:
            raise ReferenceIntelligenceError("Every merge group must contain at least two entries")
        result.append(cleaned)
    return result


def _load_object(raw: str | Path | dict[str, Any], *, label: str) -> dict[str, Any]:
    if isinstance(raw, dict):
        return json.loads(json.dumps(raw))
    path = Path(raw).expanduser().resolve()
    if not path.is_file():
        raise ReferenceIntelligenceError(f"{label} file not found: {path}")
    return _read_json(path)


def _validate_regions(value: dict[str, Any], source_id: str) -> list[dict[str, Any]]:
    if value.get("kind") != REGIONS_KIND:
        raise ReferenceIntelligenceError(f"Semantic regions must use kind {REGIONS_KIND}")
    if value.get("source_id") not in {None, source_id}:
        raise ReferenceIntelligenceError("Semantic regions were produced for another RGB source")
    raw_regions = value.get("regions")
    if not isinstance(raw_regions, list) or not 1 <= len(raw_regions) <= 100:
        raise ReferenceIntelligenceError("Semantic regions must contain 1 to 100 entries")
    regions: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raw_regions:
        if not isinstance(raw, dict):
            raise ReferenceIntelligenceError("Every semantic region must be an object")
        region = dict(raw)
        region_id = region.get("id")
        if not isinstance(region_id, str) or not REGION_ID_RE.fullmatch(region_id) or region_id in seen:
            raise ReferenceIntelligenceError(f"Invalid or duplicate semantic region id: {region_id}")
        seen.add(region_id)
        for field in ("label_zh", "label_en", "semantic_class"):
            if not isinstance(region.get(field), str) or not region[field].strip():
                raise ReferenceIntelligenceError(f"{region_id}.{field} must be a non-empty string")
            region[field] = region[field].strip()
        depth = region.get("depth_mean")
        if depth is not None and (isinstance(depth, bool) or not isinstance(depth, (int, float)) or not 0 <= depth <= 1):
            raise ReferenceIntelligenceError(f"{region_id}.depth_mean must be null or 0..1")
        area = region.get("area_fraction")
        confidence = region.get("confidence")
        if isinstance(area, bool) or not isinstance(area, (int, float)) or not 0 < area <= 1:
            raise ReferenceIntelligenceError(f"{region_id}.area_fraction must be in (0, 1]")
        if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
            raise ReferenceIntelligenceError(f"{region_id}.confidence must be in [0, 1]")
        priority = region.get("edit_priority", "normal")
        if priority not in {"low", "normal", "high"}:
            raise ReferenceIntelligenceError(f"{region_id}.edit_priority must be low, normal, or high")
        suggested = region.get("suggested_layer")
        if suggested is not None and (not isinstance(suggested, str) or not LAYER_ID_RE.fullmatch(suggested)):
            raise ReferenceIntelligenceError(f"{region_id}.suggested_layer must be a stable layer id")
        region["depth_mean"] = float(depth) if depth is not None else None
        region["area_fraction"] = float(area)
        region["confidence"] = float(confidence)
        region["edit_priority"] = priority
        region["must_separate"] = bool(region.get("must_separate", False))
        region["is_overlay"] = bool(region.get("is_overlay", False))
        regions.append(region)
    return regions


def _region_aliases(region: dict[str, Any]) -> set[str]:
    return {
        str(region["id"]).casefold(),
        str(region["label_zh"]).casefold(),
        str(region["label_en"]).casefold(),
        str(region["semantic_class"]).casefold(),
    }


def _resolve_directive_tokens(tokens: list[str], regions: list[dict[str, Any]], field: str) -> set[str]:
    result: set[str] = set()
    for token in tokens:
        folded = token.casefold()
        matches = [region["id"] for region in regions if folded in _region_aliases(region)]
        if not matches:
            raise ReferenceIntelligenceError(f"{field} entry does not match a semantic region: {token}")
        result.update(matches)
    return result


def _explicit_merge_map(groups: list[list[str]], regions: list[dict[str, Any]]) -> dict[str, str]:
    result: dict[str, str] = {}
    for index, tokens in enumerate(groups, start=1):
        ids = _resolve_directive_tokens(tokens, regions, "merge_groups")
        if len(ids) < 2:
            raise ReferenceIntelligenceError("A merge group must resolve to at least two different regions")
        for region_id in ids:
            if region_id in result:
                raise ReferenceIntelligenceError(f"Region appears in multiple explicit merge groups: {region_id}")
            result[region_id] = f"explicit-merge-{index}"
    return result


def _group_regions(regions: list[dict[str, Any]], request: dict[str, Any]) -> list[dict[str, Any]]:
    directives = request["directives"]
    separate_ids = _resolve_directive_tokens(directives.get("separate", []), regions, "separate")
    overlay_ids = _resolve_directive_tokens(directives.get("overlays", []), regions, "overlays")
    merge_map = _explicit_merge_map(directives.get("merge_groups", []), regions)
    grouped: dict[str, list[dict[str, Any]]] = {}
    reasons: dict[str, str] = {}
    for region in regions:
        region_id = region["id"]
        overlay = region["is_overlay"] or region_id in overlay_ids
        if region["must_separate"] or region_id in separate_ids:
            key = f"separate:{region_id}"
            reason = "explicitly preserved as an independently editable region"
        elif region_id in merge_map:
            key = merge_map[region_id]
            reason = "explicit prompt merge group"
        elif isinstance(region.get("suggested_layer"), str):
            key = f"suggested:{region['suggested_layer']}"
            reason = "semantic analysis suggested one editable layer"
        elif isinstance(region.get("merge_group"), str) and region["merge_group"].strip():
            key = f"analysis:{region['merge_group'].strip().casefold()}"
            reason = "semantic analysis merge group"
        else:
            key = f"class:{region['semantic_class'].casefold()}:{'overlay' if overlay else 'base'}"
            reason = "shared semantic class and edit intent"
        enriched = {**region, "is_overlay": overlay}
        grouped.setdefault(key, []).append(enriched)
        reasons[key] = reason
    result = []
    for key, members in grouped.items():
        result.append(_make_group(key, members, reasons[key]))
    return result


def _make_group(key: str, members: list[dict[str, Any]], reason: str) -> dict[str, Any]:
    total_area = sum(member["area_fraction"] for member in members)
    weights = [member["area_fraction"] for member in members]
    depths = [member["depth_mean"] for member in members if member["depth_mean"] is not None]
    if depths:
        depth_members = [member for member in members if member["depth_mean"] is not None]
        depth_weight = sum(member["area_fraction"] for member in depth_members)
        mean_depth = sum(member["depth_mean"] * member["area_fraction"] for member in depth_members) / depth_weight
        depth_range = [min(depths), max(depths)]
    else:
        mean_depth = 0.5
        depth_range = [None, None]
    priority_rank = max({"low": 0, "normal": 1, "high": 2}[member["edit_priority"]] for member in members)
    priority = {0: "low", 1: "normal", 2: "high"}[priority_rank]
    protected = any(member["must_separate"] for member in members) or key.startswith("separate:") or priority == "high"
    return {
        "key": key,
        "members": members,
        "reason": reason,
        "area_fraction": total_area,
        "depth_mean": mean_depth,
        "depth_range": depth_range,
        "confidence": sum(member["confidence"] * weight for member, weight in zip(members, weights)) / max(total_area, 1e-9),
        "edit_priority": priority,
        "is_overlay": any(member["is_overlay"] for member in members),
        "protected": protected,
    }


def _merge_to_budget(groups: list[dict[str, Any]], budget: int) -> list[dict[str, Any]]:
    groups = list(groups)
    while len(groups) > budget:
        candidates: list[tuple[float, int, int]] = []
        for left_index, left in enumerate(groups):
            if left["protected"]:
                continue
            for right_index in range(left_index + 1, len(groups)):
                right = groups[right_index]
                if right["protected"] or left["is_overlay"] != right["is_overlay"]:
                    continue
                left_classes = {member["semantic_class"] for member in left["members"]}
                right_classes = {member["semantic_class"] for member in right["members"]}
                class_penalty = 0.0 if left_classes & right_classes else 1.25
                score = abs(left["depth_mean"] - right["depth_mean"]) * 4 + class_penalty + left["area_fraction"] + right["area_fraction"]
                candidates.append((score, left_index, right_index))
        if not candidates:
            raise ReferenceIntelligenceError(
                f"The {budget}-layer budget cannot preserve all high-priority, separate, and overlay groups"
            )
        _, left_index, right_index = min(candidates)
        merged_members = groups[left_index]["members"] + groups[right_index]["members"]
        merged = _make_group(
            f"budget:{groups[left_index]['key']}+{groups[right_index]['key']}",
            merged_members,
            "budget merge chosen by compatible depth, semantic class, and edit priority",
        )
        groups = [group for index, group in enumerate(groups) if index not in {left_index, right_index}]
        groups.append(merged)
    return groups


def _directed_depth(raw_depth: float, policy: dict[str, Any]) -> float:
    if policy["interpretation"] == "faithful":
        return raw_depth
    flattening = float(policy.get("flattening", 0.0))
    exaggeration = float(policy.get("exaggeration", 0.0))
    directed = 0.5 + (raw_depth - 0.5) * (1.0 - flattening) * (1.0 + exaggeration)
    return max(0.0, min(1.0, directed))


def _layer_id(group: dict[str, Any], used: set[str]) -> str:
    suggestions = [member.get("suggested_layer") for member in group["members"] if member.get("suggested_layer")]
    if suggestions and len(set(suggestions)) == 1:
        base = suggestions[0]
    elif len(group["members"]) == 1:
        base = f"layer-{_slug(group['members'][0]['label_en'], fallback='region')}"
    else:
        classes = sorted({member["semantic_class"] for member in group["members"]})
        base = f"layer-{_slug('-'.join(classes[:2]), fallback='group')}"
    candidate = base[:64].rstrip("-")
    if candidate not in used:
        used.add(candidate)
        return candidate
    for suffix in range(2, 1000):
        candidate = f"{base[:60].rstrip('-')}-{suffix}"
        if candidate not in used:
            used.add(candidate)
            return candidate
    raise ReferenceIntelligenceError("Unable to allocate a unique stable layer id")


def resolve_layer_plan(
    raw_project: str | Path,
    raw_regions: str | Path | dict[str, Any],
    *,
    raw_request: str | Path | dict[str, Any] | None = None,
) -> dict[str, Any]:
    project = _project(raw_project)
    request = _load_object(raw_request, label="Planning request") if raw_request is not None else _read_json(project / "planning-request.json")
    if request.get("kind") != REQUEST_KIND:
        raise ReferenceIntelligenceError(f"Planning request must use kind {REQUEST_KIND}")
    source_id = request.get("source_id")
    if not isinstance(source_id, str):
        raise ReferenceIntelligenceError("Planning request requires source_id")
    regions_value = _load_object(raw_regions, label="Semantic regions")
    regions = _validate_regions(regions_value, source_id)
    groups = _group_regions(regions, request)
    budget = int(request["layer_budget"])
    groups = _merge_to_budget(groups, budget)
    if len(groups) < 5:
        raise ReferenceIntelligenceError(
            f"Semantic analysis produced only {len(groups)} non-empty groups; at least 5 are required"
        )
    for group in groups:
        group["directed_depth"] = _directed_depth(group["depth_mean"], request["depth_policy"])
    groups.sort(key=lambda group: (1 if group["is_overlay"] else 0, group["directed_depth"]))
    used: set[str] = set()
    layers = []
    for z_index, group in enumerate(groups, start=1):
        labels_zh = list(dict.fromkeys(member["label_zh"] for member in group["members"]))
        labels_en = list(dict.fromkeys(member["label_en"] for member in group["members"]))
        layers.append({
            "id": _layer_id(group, used),
            "z_index": z_index,
            "label_zh": "／".join(labels_zh[:3]),
            "label_en": " / ".join(labels_en[:3]),
            "region_ids": [member["id"] for member in group["members"]],
            "semantic_classes": sorted({member["semantic_class"] for member in group["members"]}),
            "raw_depth_mean": round(group["depth_mean"], 6),
            "directed_depth_mean": round(group["directed_depth"], 6),
            "raw_depth_range": group["depth_range"],
            "area_fraction": round(group["area_fraction"], 6),
            "confidence": round(group["confidence"], 6),
            "edit_priority": group["edit_priority"],
            "is_overlay": group["is_overlay"],
            "merge_reason": group["reason"],
            "depends_on": [],
        })
    plan = {
        "kind": PLAN_KIND,
        "schema_version": "1.0",
        "source_id": source_id,
        "source_rgb_sha256": request["source_rgb_sha256"],
        "source_depth_run": request.get("depth_run_id"),
        "planning_request_sha256": _planning_request_sha256(request),
        "prompt": request["prompt"],
        "mode": request["mode"],
        "layer_budget": budget,
        "layer_count": len(layers),
        "raw_depth_immutable": True,
        "depth_policy": request["depth_policy"],
        "layers": layers,
        "ready": 5 <= len(layers) <= 20,
        "created_at": _now(),
    }
    regions_value["source_id"] = source_id
    regions_value["resolved_at"] = plan["created_at"]
    _write_json(project / "semantic-regions.json", regions_value)
    _write_json(project / "layer-plan.json", plan)
    _write_json(project / "directed-depth.json", {
        "kind": "layered-redraw-directed-depth",
        "schema_version": "1.0",
        "source_depth_run": request.get("depth_run_id"),
        "raw_depth_immutable": True,
        "policy": request["depth_policy"],
        "layers": [
            {"layer_id": layer["id"], "region_ids": layer["region_ids"], "directed_depth_mean": layer["directed_depth_mean"]}
            for layer in layers
        ],
        "pixel_map_status": "requires semantic masks; no synthetic per-pixel depth was fabricated",
        "created_at": plan["created_at"],
    })
    return {"ok": True, "plan": plan, "file": str(project / "layer-plan.json")}
