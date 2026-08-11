#!/usr/bin/env python3
"""Parameterized A/B/C direction proofs for Layered Redraw projects.

This module owns the deterministic proof contract.  It creates three complete
design-plan variants, lightweight SVG parameter sketches, render requests for
later vector/raster drafting, selection and lock state, and safe promotion of
one locked direction into the canonical project design plan.
"""

from __future__ import annotations

import colorsys
import hashlib
import html
import json
import shutil
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import project_features as FEATURES


PROOF_INDEX_KIND = "layered-redraw-design-proof-index"
PROOF_SET_KIND = "layered-redraw-design-proof-set"
PROOF_VARIANT_KIND = "layered-redraw-design-proof"
PROOF_RENDER_REQUEST_KIND = "layered-redraw-proof-render-request"
PROOF_STAGES = {"structure", "colour-material", "full"}
PROOF_VARIANT_IDS = ("a", "b", "c")


class DesignProofError(RuntimeError):
    """Raised when a proof action would violate the project contract."""


VARIANT_TEMPLATES: tuple[dict[str, Any], ...] = (
    {
        "id": "a",
        "slug": "observed-anchor",
        "name": {"zh": "观察锚点", "en": "Observed Anchor"},
        "intent": {
            "zh": "保留观察关系，增加呼吸感与清晰层次。",
            "en": "Preserve observed relationships with calmer spacing and clearer depth.",
        },
        "balance": "observed",
        "deltas": {
            "composition": {
                "crop_strength": -0.10,
                "negative_space": 0.08,
                "asymmetry": -0.10,
                "subject_scale": -0.08,
            },
            "space": {"flattening": -0.12, "depth_separation": 0.08, "perspective_strength": 0.05},
            "form": {
                "simplification": -0.10,
                "geometricity": -0.06,
                "exaggeration": -0.05,
                "contour_closure": 0.02,
            },
            "value": {"contrast": -0.05, "focal_contrast": -0.03},
            "color": {"intensity": -0.05, "palette_size": 2, "warmth": -0.08, "accent_ratio": -0.02},
            "edge": {"hardness": -0.02, "hierarchy": 0.04},
            "material": {"texture": -0.08, "mark_scale": -0.06},
        },
    },
    {
        "id": "b",
        "slug": "editorial-shift",
        "name": {"zh": "编辑重构", "en": "Editorial Shift"},
        "intent": {
            "zh": "重裁切、压平空间并强化几何节奏。",
            "en": "Re-crop, compress depth, and strengthen a graphic shape rhythm.",
        },
        "balance": "asymmetric",
        "deltas": {
            "composition": {
                "crop_strength": 0.15,
                "negative_space": 0.02,
                "asymmetry": 0.16,
                "subject_scale": 0.12,
            },
            "space": {"flattening": 0.18, "depth_separation": -0.08, "perspective_strength": -0.12},
            "form": {
                "simplification": 0.18,
                "geometricity": 0.22,
                "exaggeration": 0.08,
                "contour_closure": 0.15,
            },
            "value": {"groups": -1, "contrast": 0.12, "focal_contrast": 0.16},
            "color": {"intensity": 0.08, "palette_size": -4, "warmth": 0.05, "accent_ratio": 0.03},
            "edge": {"hardness": 0.14, "hierarchy": 0.18},
            "material": {"texture": -0.03, "mark_scale": 0.02},
        },
    },
    {
        "id": "c",
        "slug": "atmospheric-story",
        "name": {"zh": "氛围叙事", "en": "Atmospheric Story"},
        "intent": {
            "zh": "延展留白，以冷暖、边缘和材质建立叙事。",
            "en": "Expand negative space and build narrative through warmth, edges, and material.",
        },
        "balance": "narrative-path",
        "deltas": {
            "composition": {
                "crop_strength": 0.05,
                "negative_space": 0.12,
                "asymmetry": 0.06,
                "subject_scale": 0.04,
            },
            "space": {"flattening": 0.05, "depth_separation": 0.14, "perspective_strength": 0.02},
            "form": {
                "simplification": 0.06,
                "geometricity": -0.12,
                "exaggeration": 0.18,
                "contour_closure": -0.08,
            },
            "value": {"groups": 1, "contrast": 0.04, "focal_contrast": 0.10},
            "color": {"intensity": 0.14, "palette_size": 4, "warmth": 0.24, "accent_ratio": 0.05},
            "edge": {"hardness": -0.16, "hierarchy": 0.08},
            "material": {"texture": 0.22, "mark_scale": 0.18},
        },
    },
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _design_basis_sha256(plan: dict[str, Any]) -> str:
    payload = {
        "selected_preset": plan.get("selected_preset"),
        "style": plan.get("style"),
        "artwork_text": plan.get("artwork_text"),
        "parameters": plan.get("parameters"),
    }
    return hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _empty_index() -> dict[str, Any]:
    return {
        "schema_version": "1.0",
        "kind": PROOF_INDEX_KIND,
        "active_set": None,
        "sets": [],
    }


def _project_path(project_dir: str | Path) -> Path:
    project = Path(project_dir).expanduser().resolve()
    if not (project / "project.json").is_file():
        raise DesignProofError(f"Layered Redraw project.json not found: {project}")
    return project


def _resolve_inside(project: Path, relative: Any, *, field: str, required: bool = True) -> Path:
    if not isinstance(relative, str) or not relative.strip():
        raise DesignProofError(f"{field} must be a project-relative path")
    candidate = (project / relative).resolve()
    try:
        candidate.relative_to(project)
    except ValueError as exc:
        raise DesignProofError(f"{field} must stay inside the project") from exc
    if required and not candidate.is_file():
        raise DesignProofError(f"{field} does not exist: {relative}")
    return candidate


def _normalize_stage(stage: str) -> str:
    normalized = stage.strip().lower().replace("color", "colour").replace("_", "-")
    if normalized not in PROOF_STAGES:
        raise DesignProofError("proof stage must be structure, colour-material, or full")
    return normalized


def _validate_index(value: dict[str, Any]) -> dict[str, Any]:
    if value.get("kind") != PROOF_INDEX_KIND or not isinstance(value.get("sets"), list):
        raise DesignProofError("proofs/index.json does not match the design-proof contract")
    seen_sets: set[str] = set()
    for proof_set in value["sets"]:
        if not isinstance(proof_set, dict) or proof_set.get("kind") != PROOF_SET_KIND:
            raise DesignProofError("proofs/index.json contains an invalid proof set")
        set_id = proof_set.get("id")
        if not isinstance(set_id, str) or not FEATURES.STYLE_ID_RE.fullmatch(set_id) or set_id in seen_sets:
            raise DesignProofError("proof set ids must be unique lowercase hyphen-case values")
        seen_sets.add(set_id)
        variants = proof_set.get("variants")
        if not isinstance(variants, list) or [item.get("id") for item in variants if isinstance(item, dict)] != list(PROOF_VARIANT_IDS):
            raise DesignProofError(f"proof set {set_id} must contain exactly A, B, and C variants")
        selected = proof_set.get("selected")
        if selected is not None and selected not in PROOF_VARIANT_IDS:
            raise DesignProofError(f"proof set {set_id} has an invalid selection")
        if proof_set.get("locked") is True and selected is None:
            raise DesignProofError(f"proof set {set_id} cannot be locked without a selected variant")
        if proof_set.get("status") == "promoted" and proof_set.get("locked") is not True:
            raise DesignProofError(f"promoted proof set {set_id} must remain locked")
    active = value.get("active_set")
    if active is not None and active not in seen_sets:
        raise DesignProofError("proofs/index.json active_set does not exist")
    return value


def load_design_proofs(project_dir: str | Path) -> dict[str, Any]:
    project = _project_path(project_dir)
    path = project / "proofs" / "index.json"
    index = FEATURES.read_json(path) if path.is_file() else _empty_index()
    index = _validate_index(index)
    result = deepcopy(index)
    current_basis = _design_basis_sha256(FEATURES.load_design_plan(project))
    for proof_set in result["sets"]:
        proof_set["stale"] = (
            proof_set.get("status") != "promoted"
            and proof_set.get("base_plan_sha256") != current_basis
        )
    result["project"] = str(project)
    result["count"] = len(result["sets"])
    result["active"] = next(
        (item for item in result["sets"] if item.get("id") == result.get("active_set")),
        None,
    )
    return result


def _write_index(project: Path, index: dict[str, Any]) -> None:
    _validate_index(index)
    FEATURES.write_json(project / "proofs" / "index.json", index)


def _proof_set(index: dict[str, Any], set_id: str | None = None) -> dict[str, Any]:
    target_id = set_id or index.get("active_set")
    if not isinstance(target_id, str):
        raise DesignProofError("No active design-proof set; generate A/B/C proofs first")
    for item in index["sets"]:
        if item.get("id") == target_id:
            return item
    raise DesignProofError(f"Unknown design-proof set: {target_id}")


def _variant(proof_set: dict[str, Any], variant_id: str) -> dict[str, Any]:
    normalized = variant_id.strip().lower()
    for item in proof_set["variants"]:
        if item.get("id") == normalized:
            return item
    raise DesignProofError("proof variant must be A, B, or C")


def _ensure_current_base(project: Path, proof_set: dict[str, Any]) -> None:
    if proof_set.get("status") == "promoted":
        return
    current_basis = _design_basis_sha256(FEATURES.load_design_plan(project))
    if proof_set.get("base_plan_sha256") != current_basis:
        raise DesignProofError("The base design plan changed; generate a fresh A/B/C proof set")


def _groups_for_stage(stage: str) -> set[str]:
    if stage == "structure":
        return {"composition", "space", "form", "value"}
    if stage == "colour-material":
        return {"value", "color", "edge", "material"}
    return set(FEATURES.DESIGN_PARAMETER_KEYS)


def _scaled_integer_delta(raw_delta: int | float, spread: float) -> int:
    if raw_delta == 0:
        return 0
    scaled = round(float(raw_delta) * spread)
    if scaled == 0 and spread >= 0.35:
        return 1 if raw_delta > 0 else -1
    return scaled


def _apply_template(base: dict[str, Any], template: dict[str, Any], *, stage: str, spread: float) -> dict[str, Any]:
    parameters = deepcopy(base)
    active_groups = _groups_for_stage(stage)
    if "composition" in active_groups:
        parameters["composition"]["balance"] = template["balance"]
    for group, changes in template["deltas"].items():
        if group not in active_groups:
            continue
        for key, raw_delta in changes.items():
            current = parameters[group][key]
            if key in {"groups", "palette_size"}:
                parameters[group][key] = int(current) + _scaled_integer_delta(raw_delta, spread)
            else:
                parameters[group][key] = float(current) + float(raw_delta) * spread
    composition = parameters["composition"]
    composition["subject_scale"] = max(0.5, min(2.0, float(composition["subject_scale"])))
    parameters["value"]["groups"] = max(2, min(7, int(parameters["value"]["groups"])))
    parameters["color"]["palette_size"] = max(2, min(64, int(parameters["color"]["palette_size"])))
    parameters["color"]["warmth"] = max(-1.0, min(1.0, float(parameters["color"]["warmth"])))
    for group, keys in FEATURES.DESIGN_PARAMETER_KEYS.items():
        for key in keys:
            if key in {"balance", "subject_scale", "groups", "palette_size", "warmth"}:
                continue
            parameters[group][key] = max(0.0, min(1.0, float(parameters[group][key])))
    return FEATURES.validate_design_parameters(parameters)


def _parameter_deltas(base: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for group in FEATURES.DESIGN_PARAMETER_KEYS:
        changes: dict[str, Any] = {}
        for key in FEATURES.DESIGN_PARAMETER_KEYS[group]:
            before = base[group][key]
            after = candidate[group][key]
            if before == after:
                continue
            if isinstance(before, (int, float)) and isinstance(after, (int, float)):
                changes[key] = round(float(after) - float(before), 4)
            else:
                changes[key] = {"from": before, "to": after}
        if changes:
            result[group] = changes
    return result


def _hex_rgb(raw: str) -> tuple[float, float, float] | None:
    value = raw.strip().lstrip("#")
    if len(value) != 6:
        return None
    try:
        return tuple(int(value[index:index + 2], 16) / 255 for index in (0, 2, 4))  # type: ignore[return-value]
    except ValueError:
        return None


def _adjust_colour(raw: str, *, intensity: float, warmth: float, contrast: float, role: int) -> str:
    rgb = _hex_rgb(raw) or ((0.96, 0.94, 0.90) if role == 0 else (0.42, 0.52, 0.47))
    hue, lightness, saturation = colorsys.rgb_to_hls(*rgb)
    saturation = max(0.0, min(1.0, saturation * (0.45 + intensity * 1.15)))
    if role == 0:
        lightness = max(0.76, min(0.98, lightness + (0.5 - contrast) * 0.08))
    else:
        lightness = max(0.08, min(0.92, 0.5 + (lightness - 0.5) * (0.72 + contrast * 0.78)))
    red, green, blue = colorsys.hls_to_rgb(hue, lightness, saturation)
    red = max(0.0, min(1.0, red + warmth * 0.10))
    green = max(0.0, min(1.0, green + warmth * 0.025))
    blue = max(0.0, min(1.0, blue - warmth * 0.09))
    return "#{:02X}{:02X}{:02X}".format(round(red * 255), round(green * 255), round(blue * 255))


def _proof_palette(project: Path, plan: dict[str, Any], *, stage: str) -> list[str]:
    try:
        preset = FEATURES.resolve_design_preset(str(plan.get("selected_preset")), project)
        raw = preset.get("swatches")
    except FEATURES.ProjectFeatureError:
        raw = None
    swatches = [item for item in raw if isinstance(item, str)] if isinstance(raw, list) else []
    swatches = (swatches + ["#F4F0E8", "#718578", "#A95649", "#262925"])[:4]
    color = plan["parameters"]["color"]
    contrast = plan["parameters"]["value"]["contrast"]
    intensity = color["intensity"] * (0.35 if stage == "structure" else 1.0)
    return [
        _adjust_colour(item, intensity=intensity, warmth=color["warmth"], contrast=contrast, role=index)
        for index, item in enumerate(swatches)
    ]


def _preview_svg(project: Path, plan: dict[str, Any], *, stage: str) -> str:
    parameters = plan["parameters"]
    composition = parameters["composition"]
    space = parameters["space"]
    form = parameters["form"]
    value = parameters["value"]
    edge = parameters["edge"]
    material = parameters["material"]
    palette = _proof_palette(project, plan, stage=stage)

    direction = {
        "observed": -0.25,
        "asymmetric": 1.0,
        "monumental": 0.0,
        "dynamic-diagonal": 0.85,
        "layered-calm": -0.55,
        "narrative-path": 0.65,
    }.get(str(composition["balance"]), 0.2)
    subject_scale = float(composition["subject_scale"])
    asymmetry = float(composition["asymmetry"])
    crop = float(composition["crop_strength"])
    subject_x = 246 + direction * (34 + asymmetry * 72) + direction * crop * 30
    subject_y = 148 - float(form["exaggeration"]) * 18
    subject_width = 112 * subject_scale * (1 + float(form["exaggeration"]) * 0.18)
    subject_height = 128 * subject_scale * (1 + float(form["exaggeration"]) * 0.28)
    roundness = round((1 - float(form["geometricity"])) * 34, 2)
    horizon = 108 + (1 - float(space["depth_separation"])) * 50
    rear_height = 34 + (1 - float(space["flattening"])) * 62
    stroke_width = 1.2 + float(edge["hierarchy"]) * 5.4
    stroke_opacity = 0.38 + float(form["contour_closure"]) * 0.58
    texture_opacity = round(float(material["texture"]) * 0.36, 3)
    mark_spacing = max(7, round(28 - float(material["mark_scale"]) * 18))
    negative_width = 88 + float(composition["negative_space"]) * 210
    focal_radius = 12 + float(value["focal_contrast"]) * 20
    rear_top = horizon - rear_height

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" role="img">
  <title>Layered Redraw parameter proof</title>
  <desc>Low-detail composition, value, colour, edge, and material schematic. It is not the final artwork.</desc>
  <defs>
    <clipPath id="frame"><rect x="12" y="12" width="456" height="276" rx="18"/></clipPath>
    <pattern id="marks" width="{mark_spacing}" height="{mark_spacing}" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
      <path d="M0 {mark_spacing / 2:.2f} H{mark_spacing}" stroke="{palette[3]}" stroke-width="1.2" opacity="{texture_opacity}"/>
    </pattern>
    <linearGradient id="field" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{palette[0]}"/>
      <stop offset="1" stop-color="{palette[1]}" stop-opacity="0.34"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#frame)">
    <rect x="12" y="12" width="456" height="276" fill="url(#field)"/>
    <ellipse cx="{76 + negative_width / 2:.2f}" cy="68" rx="{negative_width / 2:.2f}" ry="48" fill="{palette[0]}" opacity="0.84"/>
    <path d="M12 {horizon + 42:.2f} C116 {horizon - 10:.2f} 214 {horizon + 30:.2f} 312 {horizon - 5:.2f} S432 {horizon + 8:.2f} 468 {horizon - 18:.2f} V288 H12 Z" fill="{palette[1]}" opacity="0.47"/>
    <path d="M12 {horizon:.2f} L94 {rear_top + 17:.2f} L152 {rear_top + 45:.2f} L224 {rear_top:.2f} L286 {rear_top + 28:.2f} L354 {rear_top + 8:.2f} L468 {horizon + 12:.2f} V{horizon + 58:.2f} H12 Z" fill="{palette[3]}" opacity="{0.22 + value['contrast'] * 0.34:.3f}"/>
    <rect x="{subject_x - subject_width / 2:.2f}" y="{subject_y - subject_height / 2:.2f}" width="{subject_width:.2f}" height="{subject_height:.2f}" rx="{roundness}" fill="{palette[2]}" stroke="{palette[3]}" stroke-width="{stroke_width:.2f}" stroke-opacity="{stroke_opacity:.3f}"/>
    <path d="M{subject_x - subject_width * 0.44:.2f} {subject_y + subject_height * 0.18:.2f} Q{subject_x:.2f} {subject_y - subject_height * (0.14 + form['exaggeration'] * 0.18):.2f} {subject_x + subject_width * 0.46:.2f} {subject_y + subject_height * 0.12:.2f}" fill="none" stroke="{palette[0]}" stroke-width="{2 + edge['hardness'] * 4:.2f}" stroke-linecap="round"/>
    <circle cx="{subject_x + subject_width * 0.24:.2f}" cy="{subject_y - subject_height * 0.27:.2f}" r="{focal_radius:.2f}" fill="{palette[0]}" stroke="{palette[3]}" stroke-width="{1 + edge['hardness'] * 3:.2f}"/>
    <path d="M28 252 C122 {220 - space['perspective_strength'] * 38:.2f} 225 {276 - space['flattening'] * 25:.2f} 454 214" fill="none" stroke="{palette[2]}" stroke-width="{4 + value['focal_contrast'] * 9:.2f}" stroke-linecap="round" opacity="0.88"/>
    <rect x="12" y="12" width="456" height="276" fill="url(#marks)"/>
    <line x1="22" y1="{horizon:.2f}" x2="458" y2="{horizon:.2f}" stroke="{palette[3]}" stroke-width="1" stroke-dasharray="5 8" opacity="0.28"/>
  </g>
  <rect x="12" y="12" width="456" height="276" rx="18" fill="none" stroke="{palette[3]}" stroke-width="1.5" opacity="0.46"/>
</svg>'''


def _render_request(
    project: Path,
    plan: dict[str, Any],
    *,
    set_id: str,
    variant_id: str,
    stage: str,
) -> dict[str, Any]:
    config = FEATURES.read_json(project / "project.json", required=True)
    return {
        "schema_version": "1.0",
        "kind": PROOF_RENDER_REQUEST_KIND,
        "proof": {"set_id": set_id, "variant_id": variant_id, "stage": stage},
        "output_mode": config.get("output_mode", "vector-strict"),
        "style": plan.get("style") or config.get("style"),
        "target_layers": config.get("target_layers", 10),
        "design_plan": plan,
        "requirements": {
            "detail_level": "low",
            "preserve_scene_identity": True,
            "artwork_text": False,
            "semantic_layer_target": "8-12 after promotion",
            "preview_registration": "render one flattened proof preview, then register it without changing its design-plan.json",
        },
    }


def _comparison_board_svg(proof_set: dict[str, Any]) -> str:
    cards: list[str] = []
    set_root = Path("proofs") / "sets" / proof_set["id"]
    for index, variant in enumerate(proof_set["variants"]):
        plan_path = Path(variant["design_plan"])
        preview_path = Path(variant["preview"])
        try:
            preview_href = preview_path.relative_to(set_root).as_posix()
        except ValueError:
            preview_href = preview_path.as_posix()
        name = html.escape(str(variant["name"].get("en") or variant["id"].upper()))
        label = variant["id"].upper()
        selected = proof_set.get("selected") == variant["id"]
        left = 24 + index * 372
        border = "#B85A4B" if selected else "#B8B0A4"
        width = 4 if selected else 1.5
        cards.append(f'''<g transform="translate({left} 26)">
  <rect width="348" height="308" rx="18" fill="#FAF8F5" stroke="{border}" stroke-width="{width}"/>
  <image href="{html.escape(preview_href)}" x="14" y="14" width="320" height="200" preserveAspectRatio="xMidYMid meet"/>
  <text x="18" y="244" font-family="system-ui, sans-serif" font-size="15" letter-spacing="2" fill="#7A8D80">{label}</text>
  <text x="18" y="270" font-family="Georgia, serif" font-size="22" fill="#222222">{name}</text>
  <text x="18" y="294" font-family="system-ui, sans-serif" font-size="11" fill="#706B64">{html.escape(plan_path.name)} · {html.escape(proof_set['stage'])}</text>
</g>''')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1164 360" role="img">
  <title>Layered Redraw A/B/C parameter proofs</title>
  <rect width="1164" height="360" fill="#F4F0E8"/>
  {''.join(cards)}
</svg>'''


def _refresh_comparison_board(project: Path, proof_set: dict[str, Any]) -> None:
    relative = Path(proof_set["comparison_board"])
    destination = _resolve_inside(project, relative.as_posix(), field="comparison_board", required=False)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(_comparison_board_svg(proof_set), encoding="utf-8")


def create_design_proofs(
    project_dir: str | Path,
    *,
    stage: str = "full",
    spread: float = 0.65,
    base_revision: str | None = None,
) -> dict[str, Any]:
    project = _project_path(project_dir)
    stage = _normalize_stage(stage)
    if not isinstance(spread, (int, float)) or isinstance(spread, bool) or not 0.1 <= float(spread) <= 1.0:
        raise DesignProofError("proof spread must be between 0.1 and 1.0")
    spread = round(float(spread), 4)
    base_plan = FEATURES.load_design_plan(project)
    created_at = datetime.now(timezone.utc)
    set_id = created_at.strftime("set-%Y%m%dt%H%M%S%fZ").lower()
    set_root = project / "proofs" / "sets" / set_id
    variants: list[dict[str, Any]] = []

    for template in VARIANT_TEMPLATES:
        variant_id = template["id"]
        parameters = _apply_template(base_plan["parameters"], template, stage=stage, spread=spread)
        plan = deepcopy(base_plan)
        plan["parameters"] = parameters
        plan["artwork_text"] = False
        plan["proof"] = {
            "set_id": set_id,
            "variant_id": variant_id,
            "stage": stage,
            "status": "candidate",
        }
        plan["updated_at"] = created_at.isoformat()

        relative_root = Path("proofs") / "sets" / set_id / variant_id
        design_relative = relative_root / "design-plan.json"
        preview_relative = relative_root / "preview.svg"
        request_relative = relative_root / "render-request.json"
        FEATURES.write_json(project / design_relative, plan)
        (project / preview_relative).write_text(_preview_svg(project, plan, stage=stage), encoding="utf-8")
        FEATURES.write_json(
            project / request_relative,
            _render_request(project, plan, set_id=set_id, variant_id=variant_id, stage=stage),
        )
        variants.append(
            {
                "schema_version": "1.0",
                "kind": PROOF_VARIANT_KIND,
                "id": variant_id,
                "slug": template["slug"],
                "name": template["name"],
                "intent": template["intent"],
                "design_plan": design_relative.as_posix(),
                "render_request": request_relative.as_posix(),
                "preview": preview_relative.as_posix(),
                "preview_kind": "parameter-schematic",
                "plan_sha256": hashlib.sha256(
                    json.dumps(plan, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
                ).hexdigest(),
                "parameter_deltas": _parameter_deltas(base_plan["parameters"], parameters),
            }
        )

    comparison_relative = Path("proofs") / "sets" / set_id / "comparison-board.svg"
    proof_set = {
        "schema_version": "1.0",
        "kind": PROOF_SET_KIND,
        "id": set_id,
        "created_at": created_at.isoformat(),
        "stage": stage,
        "spread": spread,
        "base_revision": base_revision,
        "base_plan_sha256": _design_basis_sha256(base_plan),
        "status": "draft",
        "selected": None,
        "locked": False,
        "comparison_board": comparison_relative.as_posix(),
        "variants": variants,
    }
    _refresh_comparison_board(project, proof_set)
    index_path = project / "proofs" / "index.json"
    index = FEATURES.read_json(index_path) if index_path.is_file() else _empty_index()
    _validate_index(index)
    index["sets"].append(proof_set)
    index["active_set"] = set_id
    _write_index(project, index)

    config_path = project / "project.json"
    config = FEATURES.read_json(config_path, required=True)
    config["design_phase"] = "proof"
    config["design_proofs"] = "proofs/index.json"
    config["active_proof_set"] = set_id
    FEATURES.write_json(config_path, config)
    return {"ok": True, "proofs": load_design_proofs(project), "active": proof_set}


def select_design_proof(
    project_dir: str | Path,
    variant_id: str,
    *,
    set_id: str | None = None,
) -> dict[str, Any]:
    project = _project_path(project_dir)
    index_path = project / "proofs" / "index.json"
    index = _validate_index(FEATURES.read_json(index_path, required=True))
    proof_set = _proof_set(index, set_id)
    _ensure_current_base(project, proof_set)
    if proof_set.get("status") == "promoted":
        raise DesignProofError("A promoted proof set is immutable")
    if proof_set.get("locked") is True:
        raise DesignProofError("Unlock the proof direction before changing the selection")
    selected = _variant(proof_set, variant_id)
    proof_set["selected"] = selected["id"]
    proof_set["status"] = "selected"
    proof_set["selected_at"] = _now()
    index["active_set"] = proof_set["id"]
    _refresh_comparison_board(project, proof_set)
    _write_index(project, index)
    return {"ok": True, "proofs": load_design_proofs(project), "selected": selected["id"]}


def set_design_proof_lock(
    project_dir: str | Path,
    *,
    locked: bool = True,
    set_id: str | None = None,
) -> dict[str, Any]:
    project = _project_path(project_dir)
    index = _validate_index(FEATURES.read_json(project / "proofs" / "index.json", required=True))
    proof_set = _proof_set(index, set_id)
    _ensure_current_base(project, proof_set)
    if proof_set.get("status") == "promoted":
        raise DesignProofError("A promoted proof set remains locked")
    if locked and proof_set.get("selected") is None:
        raise DesignProofError("Select A, B, or C before locking the direction")
    proof_set["locked"] = bool(locked)
    proof_set["status"] = "locked" if locked else ("selected" if proof_set.get("selected") else "draft")
    if locked:
        proof_set["locked_at"] = _now()
    else:
        proof_set.pop("locked_at", None)
    _write_index(project, index)
    return {"ok": True, "proofs": load_design_proofs(project), "locked": bool(locked)}


def register_design_proof_preview(
    project_dir: str | Path,
    variant_id: str,
    source: str | Path,
    *,
    set_id: str | None = None,
) -> dict[str, Any]:
    project = _project_path(project_dir)
    source_path = Path(source).expanduser().resolve()
    if not source_path.is_file() or source_path.suffix.lower() != ".png":
        raise DesignProofError("Registered proof previews must be existing PNG files")
    if source_path.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
        raise DesignProofError("Registered proof preview is not a valid PNG stream")
    index = _validate_index(FEATURES.read_json(project / "proofs" / "index.json", required=True))
    proof_set = _proof_set(index, set_id)
    _ensure_current_base(project, proof_set)
    if proof_set.get("status") == "promoted":
        raise DesignProofError("A promoted proof set is immutable")
    variant = _variant(proof_set, variant_id)
    destination_relative = Path("proofs") / "sets" / proof_set["id"] / variant["id"] / "rendered-preview.png"
    destination = project / destination_relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source_path, destination)
    variant["preview"] = destination_relative.as_posix()
    variant["preview_kind"] = "rendered"
    variant["preview_sha256"] = FEATURES.sha256_file(destination)
    variant["registered_at"] = _now()
    _refresh_comparison_board(project, proof_set)
    _write_index(project, index)
    return {"ok": True, "proofs": load_design_proofs(project), "preview": str(destination)}


def design_proof_preview(
    project_dir: str | Path,
    set_id: str,
    variant_id: str,
) -> tuple[bytes, str]:
    project = _project_path(project_dir)
    index = _validate_index(FEATURES.read_json(project / "proofs" / "index.json", required=True))
    proof_set = _proof_set(index, set_id)
    variant = _variant(proof_set, variant_id)
    path = _resolve_inside(project, variant.get("preview"), field="proof preview")
    content_type = "image/png" if path.suffix.lower() == ".png" else "image/svg+xml; charset=utf-8"
    return path.read_bytes(), content_type


def promote_design_proof(
    project_dir: str | Path,
    *,
    set_id: str | None = None,
    snapshot_manifest: dict[str, Any] | None = None,
) -> dict[str, Any]:
    project = _project_path(project_dir)
    index = _validate_index(FEATURES.read_json(project / "proofs" / "index.json", required=True))
    proof_set = _proof_set(index, set_id)
    _ensure_current_base(project, proof_set)
    if proof_set.get("status") == "promoted":
        raise DesignProofError("This proof direction has already been promoted")
    if proof_set.get("locked") is not True or not isinstance(proof_set.get("selected"), str):
        raise DesignProofError("Select and lock one proof direction before promotion")
    variant = _variant(proof_set, proof_set["selected"])
    plan_path = _resolve_inside(project, variant.get("design_plan"), field="proof design plan")
    plan = FEATURES.read_json(plan_path, required=True)
    if plan.get("kind") != FEATURES.DESIGN_PLAN_KIND or plan.get("artwork_text") is not False:
        raise DesignProofError("Selected proof design plan is invalid or enables artwork text")
    plan["parameters"] = FEATURES.validate_design_parameters(plan.get("parameters"))
    if snapshot_manifest:
        FEATURES.create_snapshot(
            project,
            snapshot_manifest,
            reason=f"Before promoting design proof {proof_set['id']}:{variant['id'].upper()}",
            force=True,
        )
    promoted_at = _now()
    plan["proof"] = {
        "set_id": proof_set["id"],
        "variant_id": variant["id"],
        "stage": proof_set["stage"],
        "status": "promoted",
        "promoted_at": promoted_at,
    }
    plan["updated_at"] = promoted_at
    FEATURES.write_json(project / "design-plan.json", plan)

    config_path = project / "project.json"
    config = FEATURES.read_json(config_path, required=True)
    config["workflow_mode"] = plan.get("workflow_mode", "guided")
    config["design_plan"] = "design-plan.json"
    config["design_preset"] = plan.get("selected_preset")
    config["design_phase"] = "production"
    config["design_proofs"] = "proofs/index.json"
    config["active_proof_set"] = proof_set["id"]
    config["promoted_proof"] = {"set_id": proof_set["id"], "variant_id": variant["id"]}
    FEATURES.write_json(config_path, config)

    proof_set["status"] = "promoted"
    proof_set["promoted_at"] = promoted_at
    proof_set["promoted_variant"] = variant["id"]
    _write_index(project, index)
    return {
        "ok": True,
        "project": str(project),
        "design_plan": plan,
        "proofs": load_design_proofs(project),
        "promoted": {"set_id": proof_set["id"], "variant_id": variant["id"]},
    }
