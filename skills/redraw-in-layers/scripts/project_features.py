#!/usr/bin/env python3
"""Shared non-destructive workflow features for Layered Redraw projects."""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import tempfile
import zipfile
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree as ET

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover - optional raster extras
    Image = None  # type: ignore[assignment]
    ImageDraw = None  # type: ignore[assignment]
    ImageFont = None  # type: ignore[assignment]


STYLE_ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
TEXT_LAYER_HINT_RE = re.compile(
    r"(?:^|[-_\s/])(text|caption|title|logo|glyph|lettering)(?:$|[-_\s/])|"
    r"文字|文本|标题|台词",
    re.IGNORECASE,
)
HISTORY_KIND = "layered-redraw-history"
SNAPSHOT_KIND = "layered-redraw-snapshot"
DESIGN_PLAN_KIND = "layered-redraw-design-plan"
DESIGN_PRESET_KIND = "layered-redraw-design-preset"
WORKFLOW_MODES = {"guided", "expert"}
DESIGN_PARAMETER_KEYS = {
    "composition": {
        "balance",
        "crop_strength",
        "negative_space",
        "asymmetry",
        "subject_scale",
    },
    "space": {"flattening", "depth_separation", "perspective_strength"},
    "form": {"simplification", "geometricity", "exaggeration", "contour_closure"},
    "value": {"groups", "contrast", "focal_contrast"},
    "color": {"intensity", "palette_size", "warmth", "accent_ratio"},
    "edge": {"hardness", "hierarchy"},
    "material": {"texture", "mark_scale"},
}
GUIDED_CONTROL_KEYS = {
    "faithfulness",
    "abstraction",
    "subject_emphasis",
    "space_flattening",
    "color_intensity",
}
STYLE_DESIGN_PROFILE_KEYS = {
    "composition",
    "proportion",
    "space_model",
    "shape_grammar",
    "value_structure",
    "color_system",
    "edge_system",
    "lighting",
    "rhythm",
    "forbid_artwork_text",
}


class ProjectFeatureError(RuntimeError):
    """Raised when a shared workflow feature cannot complete safely."""


def read_json(path: Path, *, required: bool = False) -> dict[str, Any]:
    if not path.exists():
        if required:
            raise ProjectFeatureError(f"Missing required JSON file: {path}")
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ProjectFeatureError(f"Unable to read JSON file {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ProjectFeatureError(f"JSON root must be an object: {path}")
    return value


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def design_plan_sha256(project_dir: str | Path, config: dict[str, Any]) -> str | None:
    """Return a cross-platform semantic digest of the active design plan.

    Hashing parsed JSON avoids false stale-artifact warnings when Git checks the
    same file out with different newline conventions on Windows and Linux.
    """

    relative = config.get("design_plan")
    if not isinstance(relative, str) or not relative.strip():
        return None
    project = Path(project_dir).expanduser().resolve()
    candidate = (project / relative).resolve()
    try:
        candidate.relative_to(project)
    except ValueError as exc:
        raise ProjectFeatureError("design_plan must stay inside the project directory") from exc
    if not candidate.is_file():
        return None
    plan = read_json(candidate, required=True)
    canonical = json.dumps(plan, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return sha256_bytes(canonical)


def normalize_style_id(raw: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", raw.strip().lower()).strip("-")
    aliases = {
        "pixelart": "pixel-art",
        "watercolor": "watercolour-wash",
        "watercolour": "watercolour-wash",
        "gba": "gba-warm-narrative",
        "stainedglass": "stained-glass",
    }
    return aliases.get(normalized, normalized)


def style_catalog_path() -> Path:
    return Path(__file__).resolve().parents[1] / "assets" / "style-recipes" / "catalog.json"


def style_catalog() -> dict[str, Any]:
    catalog = read_json(style_catalog_path(), required=True)
    recipes = catalog.get("recipes")
    if not isinstance(recipes, list) or not all(isinstance(recipe, dict) for recipe in recipes):
        raise ProjectFeatureError("Style recipe catalog must contain a recipes array")
    return catalog


def list_style_recipes() -> list[dict[str, Any]]:
    return [dict(recipe) for recipe in style_catalog()["recipes"]]


def resolve_style_recipe(style_id: str) -> dict[str, Any]:
    normalized = normalize_style_id(style_id)
    for recipe in list_style_recipes():
        if recipe.get("id") == normalized:
            return recipe
    available = ", ".join(str(recipe.get("id")) for recipe in list_style_recipes())
    raise ProjectFeatureError(f"Unknown style recipe {style_id!r}. Available recipes: {available}")


def install_style_recipe(project_dir: Path, style_id: str | None) -> dict[str, Any] | None:
    if not style_id:
        return None
    normalized = normalize_style_id(style_id)
    try:
        recipe = resolve_style_recipe(normalized)
    except ProjectFeatureError:
        recipe = {
            "schema_version": "1.0",
            "kind": "layered-redraw-style-recipe",
            "id": normalized,
            "name": {"zh": normalized, "en": normalized},
            "compatible_modes": ["vector-strict", "raster-layered"],
            "custom": True,
            "design_profile": {
                "composition": "define one focal hierarchy and intentional negative space",
                "proportion": "state which subject proportions remain faithful and which may be exaggerated",
                "space_model": "choose photographic depth, compressed depth, or a deliberately flat plane",
                "shape_grammar": "define the repeated shape language before surface marks",
                "value_structure": "group the image into two to seven designed value families",
                "color_system": "use a bounded palette with a controlled accent ratio",
                "edge_system": "reserve the strongest edges for focal and occlusion boundaries",
                "lighting": "use one coherent light logic",
                "rhythm": "repeat and vary forms to direct the eye",
                "forbid_artwork_text": True,
            },
            "prompt_constraints": [],
        }
    write_json(project_dir / "style-recipe.json", recipe)
    return recipe


def design_preset_catalog_path() -> Path:
    return Path(__file__).resolve().parents[1] / "assets" / "design-presets" / "catalog.json"


def design_preset_catalog() -> dict[str, Any]:
    catalog = read_json(design_preset_catalog_path(), required=True)
    presets = catalog.get("presets")
    controls = catalog.get("controls")
    if not isinstance(presets, list) or not all(isinstance(item, dict) for item in presets):
        raise ProjectFeatureError("Design preset catalog must contain a presets array")
    if not isinstance(controls, dict):
        raise ProjectFeatureError("Design preset catalog must define guided controls")
    for preset in presets:
        validate_design_preset(preset)
    return catalog


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, float(value)))


def _deep_merge(base: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(base)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def validate_design_parameters(parameters: Any) -> dict[str, Any]:
    if not isinstance(parameters, dict):
        raise ProjectFeatureError("Design parameters must be an object")
    normalized: dict[str, Any] = {}
    unknown_groups = sorted(set(parameters) - set(DESIGN_PARAMETER_KEYS))
    if unknown_groups:
        raise ProjectFeatureError("Unknown design parameter groups: " + ", ".join(unknown_groups))
    for group, allowed in DESIGN_PARAMETER_KEYS.items():
        raw_group = parameters.get(group)
        if not isinstance(raw_group, dict):
            raise ProjectFeatureError(f"Design parameters require a {group} object")
        unknown = sorted(set(raw_group) - allowed)
        if unknown:
            raise ProjectFeatureError(f"Unknown {group} parameters: " + ", ".join(unknown))
        missing = sorted(allowed - set(raw_group))
        if missing:
            raise ProjectFeatureError(f"Missing {group} parameters: " + ", ".join(missing))
        output: dict[str, Any] = {}
        for key, value in raw_group.items():
            if key == "balance":
                if not isinstance(value, str) or not value.strip():
                    raise ProjectFeatureError("composition.balance must be a non-empty string")
                output[key] = value.strip()
                continue
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                raise ProjectFeatureError(f"{group}.{key} must be numeric")
            if key == "subject_scale":
                if not 0.5 <= float(value) <= 2.0:
                    raise ProjectFeatureError("composition.subject_scale must be between 0.5 and 2.0")
                output[key] = round(float(value), 4)
            elif key == "groups":
                if not 2 <= int(value) <= 7:
                    raise ProjectFeatureError("value.groups must be between 2 and 7")
                output[key] = int(value)
            elif key == "palette_size":
                if not 2 <= int(value) <= 64:
                    raise ProjectFeatureError("color.palette_size must be between 2 and 64")
                output[key] = int(value)
            elif key == "warmth":
                if not -1.0 <= float(value) <= 1.0:
                    raise ProjectFeatureError("color.warmth must be between -1 and 1")
                output[key] = round(float(value), 4)
            else:
                if not 0.0 <= float(value) <= 1.0:
                    raise ProjectFeatureError(f"{group}.{key} must be between 0 and 1")
                output[key] = round(float(value), 4)
        normalized[group] = output
    return normalized


def validate_design_preset(preset: Any) -> dict[str, Any]:
    if not isinstance(preset, dict):
        raise ProjectFeatureError("Design preset must be an object")
    preset_id = preset.get("id")
    if not isinstance(preset_id, str) or not STYLE_ID_RE.fullmatch(preset_id):
        raise ProjectFeatureError("Design preset id must use lowercase hyphen-case")
    name = preset.get("name")
    if not isinstance(name, dict) or not all(isinstance(name.get(locale), str) and name[locale].strip() for locale in ("zh", "en")):
        raise ProjectFeatureError(f"Design preset {preset_id} requires Chinese and English names")
    modes = preset.get("compatible_modes")
    if not isinstance(modes, list) or not modes or not all(isinstance(item, str) for item in modes):
        raise ProjectFeatureError(f"Design preset {preset_id} requires compatible_modes")
    validate_design_parameters(preset.get("fixed"))
    controls = preset.get("controls")
    if not isinstance(controls, dict) or not controls:
        raise ProjectFeatureError(f"Design preset {preset_id} requires guided controls")
    unknown = sorted(set(controls) - GUIDED_CONTROL_KEYS)
    if unknown:
        raise ProjectFeatureError(f"Unknown guided controls in {preset_id}: " + ", ".join(unknown))
    for key, value in controls.items():
        if isinstance(value, dict):
            value = value.get("default")
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= float(value) <= 1:
            raise ProjectFeatureError(f"Preset control {preset_id}.{key} must be between 0 and 1")
    return preset


def _user_preset_paths(project_dir: Path) -> list[Path]:
    folder = project_dir / "presets" / "user"
    return sorted(folder.glob("*.json")) if folder.is_dir() else []


def list_design_presets(project_dir: str | Path | None = None) -> list[dict[str, Any]]:
    presets = []
    for item in design_preset_catalog()["presets"]:
        presets.append({**deepcopy(item), "source": "built-in"})
    if project_dir is not None:
        project = Path(project_dir).expanduser().resolve()
        built_in_ids = {str(item["id"]) for item in presets}
        for path in _user_preset_paths(project):
            preset = read_json(path, required=True)
            validate_design_preset(preset)
            if preset["id"] in built_in_ids:
                raise ProjectFeatureError(f"User preset collides with a built-in id: {preset['id']}")
            presets.append({**preset, "source": "user"})
    return presets


def resolve_design_preset(preset_id: str, project_dir: str | Path | None = None) -> dict[str, Any]:
    normalized = normalize_style_id(preset_id)
    for preset in list_design_presets(project_dir):
        if preset.get("id") == normalized:
            return preset
    available = ", ".join(str(item.get("id")) for item in list_design_presets(project_dir))
    raise ProjectFeatureError(f"Unknown design preset {preset_id!r}. Available presets: {available}")


def _preset_control_defaults(preset: dict[str, Any]) -> dict[str, float]:
    catalog_controls = design_preset_catalog()["controls"]
    defaults: dict[str, float] = {}
    for key in GUIDED_CONTROL_KEYS:
        raw = preset.get("controls", {}).get(key, catalog_controls.get(key, {}).get("default", 0.5))
        if isinstance(raw, dict):
            raw = raw.get("default", catalog_controls.get(key, {}).get("default", 0.5))
        defaults[key] = _clamp(float(raw))
    return defaults


def resolve_guided_controls(preset: dict[str, Any], overrides: dict[str, Any] | None = None) -> dict[str, float]:
    values = _preset_control_defaults(preset)
    if overrides:
        unknown = sorted(set(overrides) - GUIDED_CONTROL_KEYS)
        if unknown:
            raise ProjectFeatureError("Unknown guided controls: " + ", ".join(unknown))
        for key, value in overrides.items():
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                raise ProjectFeatureError(f"Guided control {key} must be numeric")
            if not 0 <= float(value) <= 1:
                raise ProjectFeatureError(f"Guided control {key} must be between 0 and 1")
            values[key] = float(value)
    return {key: round(value, 4) for key, value in sorted(values.items())}


def derive_design_parameters(preset: dict[str, Any], controls: dict[str, float]) -> dict[str, Any]:
    parameters = validate_design_parameters(deepcopy(preset["fixed"]))
    defaults = _preset_control_defaults(preset)
    delta_faith = controls["faithfulness"] - defaults["faithfulness"]
    delta_abstract = controls["abstraction"] - defaults["abstraction"]
    delta_subject = controls["subject_emphasis"] - defaults["subject_emphasis"]
    delta_flat = controls["space_flattening"] - defaults["space_flattening"]
    delta_color = controls["color_intensity"] - defaults["color_intensity"]
    parameters["composition"]["crop_strength"] = _clamp(parameters["composition"]["crop_strength"] - delta_faith * 0.24)
    parameters["composition"]["subject_scale"] = _clamp(
        parameters["composition"]["subject_scale"] + delta_subject * 0.45,
        0.5,
        2.0,
    )
    parameters["form"]["simplification"] = _clamp(
        parameters["form"]["simplification"] - delta_faith * 0.28 + delta_abstract * 0.42
    )
    parameters["form"]["exaggeration"] = _clamp(
        parameters["form"]["exaggeration"] - delta_faith * 0.18 + delta_abstract * 0.24
    )
    parameters["space"]["flattening"] = _clamp(
        parameters["space"]["flattening"] + delta_flat * 0.72 + delta_abstract * 0.14
    )
    parameters["space"]["perspective_strength"] = _clamp(
        parameters["space"]["perspective_strength"] - delta_flat * 0.62
    )
    parameters["value"]["focal_contrast"] = _clamp(
        parameters["value"]["focal_contrast"] + delta_subject * 0.32
    )
    parameters["color"]["intensity"] = _clamp(parameters["color"]["intensity"] + delta_color * 0.78)
    return validate_design_parameters(parameters)


def _default_preset_for_style(style: str | None) -> str:
    mapping = {
        "stained-glass": "stained-glass-luminous",
        "woodcut": "woodcut-dramatic",
        "gba-warm-narrative": "gba-warm-story",
        "pixel-art": "gba-warm-story",
        "poster-editorial": "editorial-geometric",
    }
    return mapping.get(normalize_style_id(style) if style else "", "faithful-balanced")


def build_design_plan(
    preset: dict[str, Any],
    *,
    workflow_mode: str = "guided",
    controls: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if workflow_mode not in WORKFLOW_MODES:
        raise ProjectFeatureError("workflow_mode must be guided or expert")
    resolved_controls = resolve_guided_controls(preset, controls)
    parameters = derive_design_parameters(preset, resolved_controls)
    return {
        "schema_version": "1.0",
        "kind": DESIGN_PLAN_KIND,
        "workflow_mode": workflow_mode,
        "selected_preset": preset["id"],
        "preset_source": preset.get("source", "built-in"),
        "style": preset.get("style"),
        "artwork_text": False,
        "text_policy": {
            "mode": "forbid",
            "allowed_layers": [],
            "reason": "Default Layered Redraw artwork contract",
        },
        "controls": resolved_controls,
        "parameters": parameters,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def initialize_design_plan(
    project_dir: str | Path,
    *,
    style: str | None = None,
    workflow_mode: str = "guided",
) -> dict[str, Any]:
    project = Path(project_dir).expanduser().resolve()
    preset = resolve_design_preset(_default_preset_for_style(style), project)
    plan = build_design_plan(preset, workflow_mode=workflow_mode)
    effective_style = normalize_style_id(style) if style else preset.get("style")
    if isinstance(effective_style, str) and effective_style:
        plan["style"] = effective_style
        install_style_recipe(project, effective_style)
    write_json(project / "design-plan.json", plan)
    (project / "presets" / "user").mkdir(parents=True, exist_ok=True)
    config_path = project / "project.json"
    if config_path.is_file():
        config = read_json(config_path, required=True)
        config["workflow_mode"] = workflow_mode
        config["design_plan"] = "design-plan.json"
        config["design_preset"] = plan["selected_preset"]
        if isinstance(effective_style, str) and effective_style:
            config["style"] = effective_style
            config["style_recipe"] = "style-recipe.json"
        write_json(config_path, config)
    return plan


def validate_design_plan(plan: dict[str, Any], project_dir: str | Path) -> dict[str, Any]:
    """Validate one design plan against the presets available to a project."""
    project = Path(project_dir).expanduser().resolve()
    if plan.get("kind") != DESIGN_PLAN_KIND:
        raise ProjectFeatureError("design-plan.json does not match the Layered Redraw design contract")
    if plan.get("workflow_mode") not in WORKFLOW_MODES:
        raise ProjectFeatureError("design-plan.json workflow_mode must be guided or expert")
    if not isinstance(plan.get("artwork_text"), bool):
        raise ProjectFeatureError("design-plan.json artwork_text must be a boolean")
    text_policy = plan.get("text_policy")
    if text_policy is None and plan["artwork_text"] is False:
        text_policy = {
            "mode": "forbid",
            "allowed_layers": [],
            "reason": "Legacy text-free design plan",
        }
        plan["text_policy"] = text_policy
    if not isinstance(text_policy, dict):
        raise ProjectFeatureError("design-plan.json text_policy must be an object")
    expected_mode = "allow-declared-layers" if plan["artwork_text"] else "forbid"
    if text_policy.get("mode") != expected_mode:
        raise ProjectFeatureError(f"design-plan.json text_policy.mode must be {expected_mode!r}")
    allowed_layers = text_policy.get("allowed_layers", [])
    if not isinstance(allowed_layers, list) or not all(isinstance(value, str) for value in allowed_layers):
        raise ProjectFeatureError("design-plan.json text_policy.allowed_layers must be an array of layer IDs")
    if plan["artwork_text"] and not allowed_layers:
        raise ProjectFeatureError("Artwork text exceptions must name at least one allowed layer")
    plan["parameters"] = validate_design_parameters(plan.get("parameters"))
    controls = plan.get("controls")
    if not isinstance(controls, dict) or set(controls) != GUIDED_CONTROL_KEYS:
        raise ProjectFeatureError("design-plan.json guided controls are incomplete")
    resolve_guided_controls(
        resolve_design_preset(str(plan.get("selected_preset")), project),
        controls,
    )
    return plan


def load_design_plan(project_dir: str | Path) -> dict[str, Any]:
    project = Path(project_dir).expanduser().resolve()
    plan = read_json(project / "design-plan.json")
    if not plan:
        config = read_json(project / "project.json", required=True)
        preset = resolve_design_preset(_default_preset_for_style(config.get("style")), project)
        return build_design_plan(preset, workflow_mode=str(config.get("workflow_mode", "guided")))
    return validate_design_plan(plan, project)


def apply_design_preset(
    project_dir: str | Path,
    preset_id: str,
    *,
    controls: dict[str, Any] | None = None,
    workflow_mode: str = "guided",
    snapshot_manifest: dict[str, Any] | None = None,
) -> dict[str, Any]:
    project = Path(project_dir).expanduser().resolve()
    config = read_json(project / "project.json", required=True)
    preset = resolve_design_preset(preset_id, project)
    mode = str(config.get("output_mode", "vector-strict"))
    if mode not in preset.get("compatible_modes", []):
        raise ProjectFeatureError(f"Preset {preset['id']} is not compatible with {mode}")
    if preset.get("requires_pixel_art") is True and not isinstance(config.get("pixel_art"), dict):
        raise ProjectFeatureError(
            f"Preset {preset['id']} requires a pixel-art project; create one with --style pixel-art or gba-warm-narrative"
        )
    plan = build_design_plan(preset, workflow_mode=workflow_mode, controls=controls)
    if snapshot_manifest:
        create_snapshot(
            project,
            snapshot_manifest,
            reason=f"Before design preset: {preset['id']}",
            force=True,
        )
    write_json(project / "design-plan.json", plan)
    config["workflow_mode"] = workflow_mode
    config["design_plan"] = "design-plan.json"
    config["design_preset"] = preset["id"]
    if isinstance(preset.get("style"), str):
        config["style"] = preset["style"]
        config["style_recipe"] = "style-recipe.json"
        recipe = install_style_recipe(project, preset["style"])
        if isinstance(config.get("pixel_art"), dict) and isinstance(recipe, dict) and isinstance(recipe.get("pixel_art"), dict):
            config["pixel_art"] = {**config["pixel_art"], **recipe["pixel_art"]}
    write_json(project / "project.json", config)
    return {"ok": True, "project": str(project), "design_plan": plan, "preset": preset}


def update_design_plan(
    project_dir: str | Path,
    updates: dict[str, Any],
    *,
    snapshot_manifest: dict[str, Any] | None = None,
) -> dict[str, Any]:
    project = Path(project_dir).expanduser().resolve()
    allowed = {"workflow_mode", "parameters", "controls"}
    unknown = sorted(set(updates) - allowed)
    if unknown:
        raise ProjectFeatureError("Unknown design plan updates: " + ", ".join(unknown))
    plan = load_design_plan(project)
    original_plan = deepcopy(plan)
    if "workflow_mode" in updates:
        mode = updates["workflow_mode"]
        if mode not in WORKFLOW_MODES:
            raise ProjectFeatureError("workflow_mode must be guided or expert")
        plan["workflow_mode"] = mode
    if "parameters" in updates:
        if not isinstance(updates["parameters"], dict):
            raise ProjectFeatureError("parameters update must be an object")
        plan["parameters"] = validate_design_parameters(_deep_merge(plan["parameters"], updates["parameters"]))
    if "controls" in updates:
        if not isinstance(updates["controls"], dict):
            raise ProjectFeatureError("controls update must be an object")
        preset = resolve_design_preset(str(plan["selected_preset"]), project)
        controls = resolve_guided_controls(preset, {**plan["controls"], **updates["controls"]})
        plan["controls"] = controls
        if plan["workflow_mode"] == "guided":
            plan["parameters"] = derive_design_parameters(preset, controls)
    content_changed = any(
        plan.get(key) != original_plan.get(key)
        for key in ("parameters", "controls")
    )
    if snapshot_manifest and content_changed:
        create_snapshot(project, snapshot_manifest, reason="Before expert design update", force=True)
    plan.setdefault(
        "text_policy",
        {"mode": "forbid", "allowed_layers": [], "reason": "Default Layered Redraw artwork contract"},
    )
    plan["updated_at"] = datetime.now(timezone.utc).isoformat()
    write_json(project / "design-plan.json", plan)
    config = read_json(project / "project.json", required=True)
    config["workflow_mode"] = plan["workflow_mode"]
    config["design_plan"] = "design-plan.json"
    write_json(project / "project.json", config)
    return {"ok": True, "project": str(project), "design_plan": plan}


def save_user_design_preset(
    project_dir: str | Path,
    *,
    preset_id: str,
    name_zh: str,
    name_en: str,
    exposed_controls: Iterable[str] | None = None,
) -> dict[str, Any]:
    project = Path(project_dir).expanduser().resolve()
    normalized = normalize_style_id(preset_id)
    if not normalized or not STYLE_ID_RE.fullmatch(normalized):
        raise ProjectFeatureError("User preset id must use lowercase hyphen-case")
    built_in_ids = {str(item["id"]) for item in design_preset_catalog()["presets"]}
    if normalized in built_in_ids:
        raise ProjectFeatureError("A user preset cannot replace a built-in preset")
    if not name_zh.strip() or not name_en.strip():
        raise ProjectFeatureError("User presets require Chinese and English names")
    plan = load_design_plan(project)
    config = read_json(project / "project.json", required=True)
    exposed = list(dict.fromkeys(exposed_controls or GUIDED_CONTROL_KEYS))
    unknown = sorted(set(exposed) - GUIDED_CONTROL_KEYS)
    if unknown:
        raise ProjectFeatureError("Unknown exposed guided controls: " + ", ".join(unknown))
    controls = {key: plan["controls"][key] for key in exposed}
    preset = {
        "schema_version": "1.0",
        "kind": DESIGN_PRESET_KIND,
        "id": normalized,
        "name": {"zh": name_zh.strip(), "en": name_en.strip()},
        "description": {
            "zh": "从专家模式保存的自定义设计模板。",
            "en": "Custom design preset saved from Art Direction mode.",
        },
        "style": plan.get("style") or config.get("style"),
        "compatible_modes": [str(config.get("output_mode", "vector-strict"))],
        "swatches": ["#F4F0E8", "#718578", "#A95649"],
        "fixed": validate_design_parameters(plan["parameters"]),
        "controls": controls,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    validate_design_preset(preset)
    path = project / "presets" / "user" / f"{normalized}.json"
    write_json(path, preset)
    return {"ok": True, "preset": {**preset, "source": "user"}, "file": str(path)}


def _asset_text_evidence(project: Path, config: dict[str, Any]) -> dict[str, Any]:
    """Inspect declared raster layers or vector nodes without pretending to run OCR."""

    detected: list[str] = []
    output_mode = str(config.get("output_mode", "vector-strict"))
    if output_mode == "raster-layered":
        relative = str(config.get("layer_index", "layers/index.json"))
        index = read_json(project / relative)
        for entry in index.get("layers", []) if isinstance(index.get("layers"), list) else []:
            if not isinstance(entry, dict):
                continue
            layer_id = str(entry.get("id", ""))
            searchable = " / ".join(
                str(entry.get(key, ""))
                for key in ("id", "label", "label_zh", "label_en", "content_type", "semantic_path")
            )
            if TEXT_LAYER_HINT_RE.search(searchable):
                detected.append(layer_id or searchable)
        return {
            "scope": "declared-raster-layer-metadata",
            "declared_text_layers": sorted(set(detected)),
            "vector_text_nodes": [],
            "pixel_ocr_performed": False,
            "limitation": "Text baked into unnamed raster pixels is not detected; visual or OCR review is still required.",
        }

    svg_path = project / str(config.get("canonical_svg", "artwork.svg"))
    if svg_path.is_file():
        try:
            root = ET.parse(svg_path).getroot()
            for position, node in enumerate(root.iter(), start=1):
                if str(node.tag).rsplit("}", 1)[-1] != "text":
                    continue
                style = str(node.get("style", "")).replace(" ", "").lower()
                if node.get("display") == "none" or node.get("visibility") == "hidden" or "display:none" in style:
                    continue
                try:
                    if float(node.get("opacity", "1")) <= 0:
                        continue
                except ValueError:
                    pass
                detected.append(node.get("id") or f"text-node-{position}")
        except (OSError, ET.ParseError) as exc:
            return {
                "scope": "vector-node-scan",
                "declared_text_layers": [],
                "vector_text_nodes": [],
                "pixel_ocr_performed": False,
                "error": f"Unable to inspect SVG text nodes: {exc}",
            }
    return {
        "scope": "vector-node-scan",
        "declared_text_layers": [],
        "vector_text_nodes": sorted(set(detected)),
        "pixel_ocr_performed": False,
        "limitation": "Outlined glyph paths are not OCR-scanned; visual review is still required.",
    }


def design_quality_report(project_dir: str | Path) -> dict[str, Any]:
    project = Path(project_dir).expanduser().resolve()
    errors: list[str] = []
    warnings: list[str] = []
    try:
        plan = load_design_plan(project)
    except ProjectFeatureError as exc:
        return {"ok": False, "project": str(project), "errors": [str(exc)], "warnings": [], "checks": {}}
    parameters = plan["parameters"]
    config = read_json(project / "project.json", required=True)
    recipe = read_json(project / str(config.get("style_recipe", "style-recipe.json")))
    profile = recipe.get("design_profile") if isinstance(recipe, dict) else None
    style_profile_complete = (
        isinstance(profile, dict)
        and STYLE_DESIGN_PROFILE_KEYS.issubset(profile)
    )
    schema_checks = {
        "text_policy_declared": isinstance(plan.get("text_policy"), dict),
        "composition_defined": all(key in parameters["composition"] for key in DESIGN_PARAMETER_KEYS["composition"]),
        "proportion_defined": isinstance(parameters["composition"].get("subject_scale"), (int, float)),
        "space_defined": all(key in parameters["space"] for key in DESIGN_PARAMETER_KEYS["space"]),
        "form_defined": all(key in parameters["form"] for key in DESIGN_PARAMETER_KEYS["form"]),
        "value_defined": all(key in parameters["value"] for key in DESIGN_PARAMETER_KEYS["value"]),
        "color_defined": all(key in parameters["color"] for key in DESIGN_PARAMETER_KEYS["color"]),
        "edge_and_material_defined": bool(parameters["edge"] and parameters["material"]),
    }
    if not style_profile_complete:
        warnings.append("The active style recipe lacks a complete composition-to-rhythm design profile.")
    if parameters["composition"]["negative_space"] < 0.08:
        warnings.append("The design plan leaves very little negative space; verify that the composition is intentionally dense.")
    if parameters["color"]["accent_ratio"] > 0.25:
        warnings.append("Accent colour exceeds 25% of the design; it may stop functioning as an accent.")
    structural_energy = max(
        parameters["composition"]["crop_strength"],
        parameters["composition"]["asymmetry"],
        parameters["space"]["flattening"],
        parameters["form"]["simplification"],
        parameters["form"]["exaggeration"],
    )
    plan_declares_structural_change = structural_energy >= 0.25
    if not plan_declares_structural_change and parameters["material"]["texture"] > 0.45:
        warnings.append("The plan changes surface texture more than composition, space, or form; style may collapse into a filter.")

    text_evidence = _asset_text_evidence(project, config)
    detected_text = set(text_evidence.get("declared_text_layers", [])) | set(
        text_evidence.get("vector_text_nodes", [])
    )
    text_policy = plan.get("text_policy", {})
    allowed_text = set(text_policy.get("allowed_layers", [])) if isinstance(text_policy, dict) else set()
    text_allowed = plan.get("artwork_text") is True
    unexpected_text = sorted(detected_text - allowed_text if text_allowed else detected_text)
    text_policy_consistent = not unexpected_text
    if unexpected_text:
        errors.append(
            "Declared asset text conflicts with the design text policy: " + ", ".join(unexpected_text)
        )
    style_forbids_text = isinstance(profile, dict) and profile.get("forbid_artwork_text") is True
    style_text_policy_consistent = not (text_allowed and style_forbids_text)
    if not style_text_policy_consistent:
        errors.append("The active style recipe forbids artwork text while the design plan allows it.")

    engineering_checks = {
        "style_profile_schema_complete": style_profile_complete,
        "text_policy_consistent_with_declared_assets": text_policy_consistent,
        "style_text_policy_consistent": style_text_policy_consistent,
        "plan_declares_structural_change": plan_declares_structural_change,
    }
    plan_schema_completeness = round(
        sum(bool(value) for value in schema_checks.values()) / len(schema_checks) * 100
    )
    return {
        "ok": not errors,
        "project": str(project),
        "workflow_mode": plan["workflow_mode"],
        "selected_preset": plan["selected_preset"],
        "assessment_scope": "plan-schema-and-declared-asset-contracts-only",
        "plan_schema_completeness": plan_schema_completeness,
        "schema_checks": schema_checks,
        "engineering_contract": {
            "passed": all(engineering_checks.values()),
            "checks": engineering_checks,
        },
        "asset_text_evidence": {
            **text_evidence,
            "policy_allows_text": text_allowed,
            "allowed_layers": sorted(allowed_text),
            "unexpected_text": unexpected_text,
        },
        "visual_quality": {
            "status": "not-assessed",
            "human_confirmed": False,
            "reason": "Schema and metadata checks do not establish composition, style execution, or artistic quality.",
        },
        "errors": errors,
        "warnings": warnings,
        "parameters": parameters,
    }


def _safe_relative(project_dir: Path, path: Path) -> Path:
    resolved = path.resolve()
    if resolved != project_dir and project_dir not in resolved.parents:
        raise ProjectFeatureError(f"Snapshot source escapes the project: {path}")
    return resolved.relative_to(project_dir)


def _source_paths(project_dir: Path) -> list[Path]:
    """Return canonical and useful derived files for one recoverable revision."""

    project_dir = project_dir.resolve()
    config = read_json(project_dir / "project.json", required=True)
    paths: set[Path] = set()

    def add(relative: Any) -> None:
        if not isinstance(relative, str) or not relative.strip():
            return
        candidate = (project_dir / relative).resolve()
        _safe_relative(project_dir, candidate)
        if candidate.is_file():
            paths.add(candidate)

    for name in (
        "project.json",
        "creative-brief.json",
        "design-plan.json",
        "manifest.json",
        "style-recipe.json",
        "palette.json",
        "theme.json",
        "composition.json",
        "planning-request.json",
        "depth-directive.json",
        "semantic-regions.json",
        "layer-plan.json",
        "directed-depth.json",
    ):
        add(name)

    mode = config.get("output_mode", "vector-strict")
    if mode == "raster-layered":
        add(config.get("layer_index", "layers/index.json"))
        add(config.get("canonical_composite", "artwork.png"))
        add(config.get("preview", "preview.png"))
        index_path = (project_dir / str(config.get("layer_index", "layers/index.json"))).resolve()
        index = read_json(index_path) if index_path.is_file() else {}
        for entry in index.get("layers", []):
            if not isinstance(entry, dict):
                continue
            add(entry.get("file"))
            add(entry.get("editable_source"))
    else:
        add(config.get("canonical_svg", "artwork.svg"))

    for folder_name in ("masks", "directions", "presets", "proofs", "references"):
        folder = project_dir / folder_name
        if folder.is_dir():
            for path in folder.rglob("*"):
                if path.is_file():
                    paths.add(path.resolve())
    return sorted(paths, key=lambda item: item.relative_to(project_dir).as_posix())


def _history_index(project_dir: Path) -> dict[str, Any]:
    path = project_dir / "history" / "index.json"
    value = read_json(path)
    if not value:
        return {"schema_version": "1.0", "kind": HISTORY_KIND, "snapshots": []}
    if value.get("kind") != HISTORY_KIND or not isinstance(value.get("snapshots"), list):
        raise ProjectFeatureError("history/index.json does not match the Layered Redraw history contract")
    return value


def list_history(project_dir: str | Path) -> dict[str, Any]:
    project = Path(project_dir).expanduser().resolve()
    result = _history_index(project)
    result = dict(result)
    result["project"] = str(project)
    result["count"] = len(result["snapshots"])
    return result


def create_snapshot(
    project_dir: str | Path,
    manifest: dict[str, Any],
    *,
    reason: str,
    changed_layers: Iterable[str] | None = None,
    force: bool = False,
) -> dict[str, Any]:
    project = Path(project_dir).expanduser().resolve()
    revision = manifest.get("revision")
    if not isinstance(revision, str) or not revision:
        raise ProjectFeatureError("A snapshot requires a manifest revision")
    history = _history_index(project)
    if not force:
        for entry in reversed(history["snapshots"]):
            if entry.get("revision") == revision:
                return {**entry, "existing": True}

    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y%m%dT%H%M%S%fZ")
    snapshot_id = f"{timestamp}-{revision}"
    archive_relative = Path("history") / "revisions" / f"{snapshot_id}.zip"
    archive_path = project / archive_relative
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    files = _source_paths(project)
    snapshot_meta = {
        "schema_version": "1.0",
        "kind": SNAPSHOT_KIND,
        "id": snapshot_id,
        "revision": revision,
        "created_at": now.isoformat(),
        "reason": reason.strip() or "manual snapshot",
        "changed_layers": sorted(set(changed_layers or [])),
        "manifest": manifest,
        "files": [path.relative_to(project).as_posix() for path in files],
    }

    with tempfile.NamedTemporaryFile(
        mode="wb", suffix=".zip", prefix="layered-redraw-history-", dir=archive_path.parent, delete=False
    ) as handle:
        temporary = Path(handle.name)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            archive.writestr("snapshot.json", json.dumps(snapshot_meta, ensure_ascii=False, indent=2) + "\n")
            for path in files:
                archive.write(path, path.relative_to(project).as_posix())
        os.replace(temporary, archive_path)
    finally:
        if temporary.exists():
            temporary.unlink()

    entry = {
        "id": snapshot_id,
        "revision": revision,
        "created_at": snapshot_meta["created_at"],
        "reason": snapshot_meta["reason"],
        "changed_layers": snapshot_meta["changed_layers"],
        "archive": archive_relative.as_posix(),
        "preview": (
            "artwork.png"
            if (project / "artwork.png").is_file()
            else "preview.png" if (project / "preview.png").is_file() else None
        ),
        "manifest": manifest,
    }
    history["snapshots"].append(entry)
    write_json(project / "history" / "index.json", history)
    return {**entry, "existing": False}


def _snapshot_entry(project: Path, snapshot_id: str) -> dict[str, Any]:
    history = _history_index(project)
    for entry in history["snapshots"]:
        if entry.get("id") == snapshot_id or entry.get("revision") == snapshot_id:
            return entry
    raise ProjectFeatureError(f"History snapshot not found: {snapshot_id}")


def snapshot_preview(project_dir: str | Path, snapshot_id: str) -> tuple[bytes, str] | None:
    project = Path(project_dir).expanduser().resolve()
    entry = _snapshot_entry(project, snapshot_id)
    archive_path = (project / str(entry.get("archive"))).resolve()
    _safe_relative(project, archive_path)
    with zipfile.ZipFile(archive_path, "r") as archive:
        for candidate in (entry.get("preview"), "preview.png", "artwork.png"):
            if isinstance(candidate, str) and candidate in archive.namelist():
                return archive.read(candidate), "image/png"
    return None


def diff_snapshot(
    project_dir: str | Path,
    current_manifest: dict[str, Any],
    snapshot_id: str,
) -> dict[str, Any]:
    project = Path(project_dir).expanduser().resolve()
    entry = _snapshot_entry(project, snapshot_id)
    previous = entry.get("manifest")
    if not isinstance(previous, dict):
        raise ProjectFeatureError("Snapshot does not contain a manifest")

    def signatures(manifest: dict[str, Any]) -> dict[str, str | None]:
        result: dict[str, str | None] = {}
        for layer in manifest.get("layers", []):
            if isinstance(layer, dict) and isinstance(layer.get("id"), str):
                result[layer["id"]] = layer.get("state_sha256") or layer.get("sha256")
        return result

    before = signatures(previous)
    after = signatures(current_manifest)
    return {
        "snapshot_id": entry.get("id"),
        "before_revision": previous.get("revision"),
        "after_revision": current_manifest.get("revision"),
        "changed_layers": sorted(
            layer_id for layer_id in set(before) & set(after) if before[layer_id] != after[layer_id]
        ),
        "added_layers": sorted(set(after) - set(before)),
        "removed_layers": sorted(set(before) - set(after)),
        "unchanged_layers": sorted(
            layer_id for layer_id in set(before) & set(after) if before[layer_id] == after[layer_id]
        ),
    }


def restore_snapshot(project_dir: str | Path, snapshot_id: str) -> dict[str, Any]:
    project = Path(project_dir).expanduser().resolve()
    entry = _snapshot_entry(project, snapshot_id)
    archive_path = (project / str(entry.get("archive"))).resolve()
    _safe_relative(project, archive_path)
    if not archive_path.is_file():
        raise ProjectFeatureError(f"Snapshot archive is missing: {archive_path}")

    with zipfile.ZipFile(archive_path, "r") as archive:
        names = [name for name in archive.namelist() if name != "snapshot.json" and not name.endswith("/")]
        for name in names:
            member = Path(name)
            if member.is_absolute() or ".." in member.parts:
                raise ProjectFeatureError(f"Unsafe path in snapshot archive: {name}")
        with tempfile.TemporaryDirectory(prefix="layered-redraw-restore-", dir=project) as temp_dir:
            staging = Path(temp_dir)
            for name in names:
                destination = staging / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(archive.read(name))
            for name in names:
                source = staging / name
                destination = (project / name).resolve()
                _safe_relative(project, destination)
                destination.parent.mkdir(parents=True, exist_ok=True)
                with tempfile.NamedTemporaryFile(
                    mode="wb", prefix="layered-redraw-restore-", dir=destination.parent, delete=False
                ) as handle:
                    temporary = Path(handle.name)
                    handle.write(source.read_bytes())
                try:
                    os.replace(temporary, destination)
                finally:
                    if temporary.exists():
                        temporary.unlink()
    return {
        "ok": True,
        "restored_snapshot": entry.get("id"),
        "revision": entry.get("revision"),
        "files_restored": len(names),
    }


def save_selection_mask(
    project_dir: str | Path,
    png_payload: bytes,
    *,
    canvas: tuple[int, int],
    selection_mode: str,
) -> dict[str, Any]:
    if Image is None:
        raise ProjectFeatureError("Selection masks require Pillow")
    project = Path(project_dir).expanduser().resolve()
    try:
        with Image.open(io.BytesIO(png_payload)) as source:
            source.load()
            if source.size != canvas:
                raise ProjectFeatureError(
                    f"Selection mask is {source.width}×{source.height}; expected {canvas[0]}×{canvas[1]}"
                )
            alpha = source.convert("RGBA").getchannel("A")
            if alpha.getbbox() is None:
                raise ProjectFeatureError("Selection mask is empty")
            mask = alpha.point(lambda value: 255 if value >= 128 else 0, mode="1").convert("L")
    except (OSError, ValueError) as exc:
        raise ProjectFeatureError(f"Unable to decode selection mask: {exc}") from exc

    created_at = datetime.now(timezone.utc)
    digest = sha256_bytes(mask.tobytes())[:12]
    mask_id = f"mask-{created_at.strftime('%Y%m%dT%H%M%S%fZ')}-{digest}"
    relative = Path("masks") / f"{mask_id}.png"
    destination = project / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    mask.save(destination, format="PNG", optimize=True)
    index_path = project / "masks" / "index.json"
    index = read_json(index_path) or {
        "schema_version": "1.0",
        "kind": "layered-redraw-mask-index",
        "masks": [],
    }
    masks = index.get("masks")
    if not isinstance(masks, list):
        raise ProjectFeatureError("masks/index.json masks must be an array")
    entry = {
        "id": mask_id,
        "file": relative.as_posix(),
        "created_at": created_at.isoformat(),
        "selection_mode": selection_mode,
        "canvas": {"width": canvas[0], "height": canvas[1]},
        "sha256": sha256_file(destination),
    }
    masks.append(entry)
    write_json(index_path, index)
    return entry


def create_direction_board(
    project_dir: str | Path,
    candidates: list[tuple[str, Path]],
    *,
    selected: str | None = None,
) -> dict[str, Any]:
    if Image is None or ImageDraw is None or ImageFont is None:
        raise ProjectFeatureError("Direction boards require Pillow")
    if not 2 <= len(candidates) <= 6:
        raise ProjectFeatureError("A direction board requires 2–6 candidates")
    project = Path(project_dir).expanduser().resolve()
    cell_width, image_height, label_height = 360, 240, 54
    columns = 2 if len(candidates) <= 4 else 3
    rows = (len(candidates) + columns - 1) // columns
    board = Image.new("RGB", (columns * cell_width, rows * (image_height + label_height)), "#F4F0E8")
    draw = ImageDraw.Draw(board)
    font = ImageFont.load_default()
    entries: list[dict[str, Any]] = []
    candidate_dir = project / "directions" / "candidates"
    candidate_dir.mkdir(parents=True, exist_ok=True)
    for index, (label, source_path) in enumerate(candidates):
        source = source_path.expanduser().resolve()
        if not source.is_file():
            raise ProjectFeatureError(f"Direction candidate does not exist: {source}")
        slug = normalize_style_id(label) or f"candidate-{index + 1}"
        relative = Path("directions") / "candidates" / f"{index + 1:02d}-{slug}.png"
        with Image.open(source) as image:
            image = image.convert("RGB")
            image.thumbnail((cell_width, image_height))
            cell = Image.new("RGB", (cell_width, image_height), "#DDD7CD")
            x_offset = (cell_width - image.width) // 2
            y_offset = (image_height - image.height) // 2
            cell.paste(image, (x_offset, y_offset))
            cell.save(project / relative, format="PNG", optimize=True)
        column = index % columns
        row = index // columns
        left = column * cell_width
        top = row * (image_height + label_height)
        board.paste(cell, (left, top))
        is_selected = selected in {label, slug}
        draw.rectangle(
            [left, top, left + cell_width - 1, top + image_height + label_height - 1],
            outline="#B24B36" if is_selected else "#AAA39A",
            width=4 if is_selected else 1,
        )
        draw.text((left + 16, top + image_height + 17), label, fill="#252A27", font=font)
        entries.append({"id": slug, "label": label, "file": relative.as_posix(), "selected": is_selected})

    board_path = project / "directions" / "contact-sheet.png"
    board_path.parent.mkdir(parents=True, exist_ok=True)
    board.save(board_path, format="PNG", optimize=True)
    index = {
        "schema_version": "1.0",
        "kind": "layered-redraw-direction-board",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "selected": next((entry["id"] for entry in entries if entry["selected"]), None),
        "contact_sheet": "directions/contact-sheet.png",
        "candidates": entries,
    }
    write_json(project / "directions" / "index.json", index)
    return {"ok": True, "contact_sheet": str(board_path), "candidates": len(entries), "selected": index["selected"]}
