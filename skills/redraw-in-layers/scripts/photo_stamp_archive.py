#!/usr/bin/env python3
"""Deterministic layered photo-stamp archive scaffolding.

The source photograph is copied into the project unchanged. Rendering keeps
that photograph in its own semantic layer and builds the paper, stamp, wear,
and optional caption as independently editable full-canvas PNG layers.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:  # Raster extras remain optional for vector-only users.
    from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps
except ImportError:  # pragma: no cover - exercised only without raster extras
    Image = None  # type: ignore[assignment]
    ImageChops = None  # type: ignore[assignment]
    ImageDraw = None  # type: ignore[assignment]
    ImageFilter = None  # type: ignore[assignment]
    ImageFont = None  # type: ignore[assignment]
    ImageOps = None  # type: ignore[assignment]

import project_features as FEATURES
import raster_project as RASTER


STYLE_ID = "photo-stamp-archive"
ARCHIVE_KIND = "layered-redraw-photo-stamp-archive"
ORIENTATIONS = {"left-right", "top-bottom"}
PHOTO_SIDES = {"left", "right", "top", "bottom"}
STAMP_SHAPES = {"circle", "square", "arch", "panoramic", "subject-silhouette"}
STAMP_POSITIONS = {"upper-left", "upper-right", "lower-left", "lower-right"}
HEX_COLOUR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")

BASE_LAYER_SPECS = [
    ("layer-paper-base", "paper-base", "\u6863\u6848\u7eb8\u5e95", "Archival paper base", []),
    ("layer-photo-panel", "photo-panel", "\u5fe0\u5b9e\u7167\u7247", "Faithful photo panel", []),
    ("layer-paper-texture", "paper-texture", "\u7eb8\u5f20\u7ea4\u7ef4", "Paper fibres", ["layer-paper-base"]),
    ("layer-stamp-border", "stamp-border", "\u5370\u7ae0\u8fb9\u754c", "Stamp boundary", ["layer-paper-base"]),
    ("layer-stamp-motif", "stamp-motif", "\u4e3b\u9898\u5370\u8c61", "Subject-derived stamp motif", ["layer-photo-panel"]),
    (
        "layer-secondary-ink",
        "secondary-ink",
        "\u8f85\u52a9\u5957\u8272",
        "Secondary registration ink",
        ["layer-stamp-motif"],
    ),
    (
        "layer-dry-ink-wear",
        "dry-ink-wear",
        "\u5e72\u58a8\u78e8\u635f",
        "Dry-ink wear",
        ["layer-stamp-border", "layer-stamp-motif", "layer-secondary-ink"],
    ),
    (
        "layer-archive-finish",
        "archive-finish",
        "\u6863\u6848\u626b\u63cf\u75d5\u8ff9",
        "Archival scan finish",
        ["layer-paper-texture"],
    ),
]
CAPTION_SPEC = (
    "layer-caption",
    "caption",
    "\u7cbe\u786e\u6807\u9898\u6587\u5b57",
    "Exact caption",
    ["layer-paper-base", "layer-stamp-motif"],
)


class PhotoStampArchiveError(RuntimeError):
    """Raised when an archive project or option violates the mode contract."""


def _require_pillow() -> None:
    if any(value is None for value in (Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps)):
        raise PhotoStampArchiveError(
            "Photo-stamp archive mode requires Pillow. Install requirements-raster.txt first."
        )


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _sha256_pixels(image: Any) -> str:
    return hashlib.sha256(image.convert("RGBA").tobytes()).hexdigest()


def _parse_colour(value: str, field: str) -> tuple[int, int, int]:
    if not isinstance(value, str) or not HEX_COLOUR_RE.fullmatch(value):
        raise PhotoStampArchiveError(f"{field} must be a six-digit hex colour such as #2B3E50")
    return tuple(int(value[index : index + 2], 16) for index in (1, 3, 5))


def _bounded_float(value: Any, field: str, lower: float, upper: float) -> float:
    if isinstance(value, bool):
        raise PhotoStampArchiveError(f"{field} must be a number")
    try:
        numeric = float(value)
    except (TypeError, ValueError) as exc:
        raise PhotoStampArchiveError(f"{field} must be a number") from exc
    if not math.isfinite(numeric) or not lower <= numeric <= upper:
        raise PhotoStampArchiveError(f"{field} must be between {lower} and {upper}")
    return numeric


def _clean_caption(value: Any, field: str, maximum: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise PhotoStampArchiveError(f"{field} must be text")
    cleaned = " ".join(value.split())
    if not cleaned:
        return None
    if len(cleaned) > maximum:
        raise PhotoStampArchiveError(f"{field} must not exceed {maximum} characters")
    return cleaned


def _normalise_options(raw: dict[str, Any]) -> dict[str, Any]:
    orientation = str(raw.get("orientation", "left-right"))
    if orientation not in ORIENTATIONS:
        raise PhotoStampArchiveError("orientation must be left-right or top-bottom")
    default_side = "left" if orientation == "left-right" else "top"
    photo_side = str(raw.get("photo_side") or default_side)
    allowed_sides = {"left", "right"} if orientation == "left-right" else {"top", "bottom"}
    if photo_side not in allowed_sides:
        raise PhotoStampArchiveError(
            f"photo_side must be {'left/right' if orientation == 'left-right' else 'top/bottom'} "
            f"for {orientation}"
        )
    stamp_shape = str(raw.get("stamp_shape", "circle"))
    if stamp_shape not in STAMP_SHAPES:
        raise PhotoStampArchiveError("Unknown stamp_shape: " + stamp_shape)
    stamp_position = str(raw.get("stamp_position", "lower-right"))
    if stamp_position not in STAMP_POSITIONS:
        raise PhotoStampArchiveError("Unknown stamp_position: " + stamp_position)
    seed = raw.get("procedural_seed", 71913)
    if not isinstance(seed, int) or isinstance(seed, bool) or not 0 <= seed <= 2_147_483_647:
        raise PhotoStampArchiveError("procedural_seed must be an integer between 0 and 2147483647")
    title = _clean_caption(raw.get("caption_title"), "caption_title", 60)
    subtitle = _clean_caption(raw.get("caption_subtitle"), "caption_subtitle", 120)
    return {
        "orientation": orientation,
        "photo_side": photo_side,
        "photo_ratio": _bounded_float(raw.get("photo_ratio", 0.55), "photo_ratio", 0.45, 0.70),
        "stamp_shape": stamp_shape,
        "stamp_position": stamp_position,
        "stamp_scale": _bounded_float(raw.get("stamp_scale", 0.42), "stamp_scale", 0.25, 0.58),
        "paper_age": _bounded_float(raw.get("paper_age", 0.14), "paper_age", 0.0, 0.60),
        "ink_wear": _bounded_float(raw.get("ink_wear", 0.26), "ink_wear", 0.02, 0.80),
        "primary_ink": str(raw.get("primary_ink", "#2B3E50")).upper(),
        "secondary_ink": str(raw.get("secondary_ink", "#C05C46")).upper(),
        "caption_title": title,
        "caption_subtitle": subtitle,
        "procedural_seed": seed,
    }


def _layout(source_size: tuple[int, int], options: dict[str, Any]) -> dict[str, Any]:
    source_width, source_height = source_size
    ratio = options["photo_ratio"]
    if options["orientation"] == "left-right":
        paper_width = max(32, round(source_width * (1.0 - ratio) / ratio))
        canvas = (source_width + paper_width, source_height)
        if options["photo_side"] == "left":
            photo_box = (0, 0, source_width, source_height)
            paper_box = (source_width, 0, canvas[0], canvas[1])
        else:
            paper_box = (0, 0, paper_width, source_height)
            photo_box = (paper_width, 0, canvas[0], canvas[1])
        actual_ratio = source_width / canvas[0]
    else:
        paper_height = max(32, round(source_height * (1.0 - ratio) / ratio))
        canvas = (source_width, source_height + paper_height)
        if options["photo_side"] == "top":
            photo_box = (0, 0, source_width, source_height)
            paper_box = (0, source_height, canvas[0], canvas[1])
        else:
            paper_box = (0, 0, source_width, paper_height)
            photo_box = (0, paper_height, canvas[0], canvas[1])
        actual_ratio = source_height / canvas[1]
    return {
        "canvas": canvas,
        "photo_box": photo_box,
        "paper_box": paper_box,
        "actual_photo_ratio": actual_ratio,
    }


def _paper_colour(age: float) -> tuple[int, int, int, int]:
    return (
        round(247 - age * 28),
        round(241 - age * 32),
        round(232 - age * 30),
        255,
    )


def _transparent(size: tuple[int, int]) -> Any:
    return Image.new("RGBA", size, (0, 0, 0, 0))


def _stamp_box(paper_box: tuple[int, int, int, int], options: dict[str, Any]) -> tuple[int, int, int, int]:
    px0, py0, px1, py1 = paper_box
    paper_width, paper_height = px1 - px0, py1 - py0
    short_side = min(paper_width, paper_height)
    base = max(28, round(short_side * options["stamp_scale"]))
    if options["stamp_shape"] == "panoramic":
        box_width, box_height = min(round(base * 1.65), round(paper_width * 0.78)), max(24, round(base * 0.62))
    elif options["stamp_shape"] == "arch":
        box_width, box_height = max(24, round(base * 0.9)), min(round(base * 1.08), round(paper_height * 0.70))
    else:
        box_width = box_height = base
    margin = max(10, round(short_side * 0.09))
    x0 = px0 + margin if options["stamp_position"].endswith("left") else px1 - margin - box_width
    y0 = py0 + margin if options["stamp_position"].startswith("upper") else py1 - margin - box_height
    return (x0, y0, x0 + box_width, y0 + box_height)


def _graphic_local(source: Any, size: tuple[int, int]) -> tuple[Any, Any]:
    resampling = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
    grey = ImageOps.grayscale(source)
    fitted = ImageOps.fit(grey, size, method=resampling)
    fitted = ImageOps.autocontrast(fitted).filter(ImageFilter.MedianFilter(3))
    edges = fitted.filter(ImageFilter.FIND_EDGES).point(lambda value: 255 if value > 38 else 0)
    darks = fitted.point(lambda value: 255 if value < 128 else 0)
    mids = fitted.point(lambda value: 220 if 128 <= value < 188 else 0)
    primary = ImageChops.lighter(darks, edges)
    primary = primary.filter(ImageFilter.MedianFilter(3))
    return primary, mids


def _shape_mask(
    canvas: tuple[int, int],
    stamp_box: tuple[int, int, int, int],
    shape: str,
    motif_local: Any,
) -> Any:
    x0, y0, x1, y1 = stamp_box
    mask = Image.new("L", canvas, 0)
    draw = ImageDraw.Draw(mask)
    if shape == "circle":
        draw.ellipse(stamp_box, fill=255)
    elif shape == "square":
        draw.rectangle(stamp_box, fill=255)
    elif shape == "panoramic":
        draw.rounded_rectangle(stamp_box, radius=max(4, (y1 - y0) // 5), fill=255)
    elif shape == "arch":
        height = y1 - y0
        draw.rectangle((x0, y0 + height // 3, x1, y1), fill=255)
        draw.ellipse((x0, y0, x1, y0 + (height * 2) // 3), fill=255)
    else:
        local = motif_local.filter(ImageFilter.MaxFilter(9))
        mask.paste(local, (x0, y0))
    return mask


def _colour_layer(mask: Any, colour: tuple[int, int, int], opacity: int = 255) -> Any:
    alpha = mask.point(lambda value: round(value * opacity / 255))
    layer = Image.new("RGBA", mask.size, (*colour, 0))
    layer.putalpha(alpha)
    return layer


def _paper_texture(
    canvas: tuple[int, int],
    paper_box: tuple[int, int, int, int],
    age: float,
    seed: int,
) -> Any:
    layer = _transparent(canvas)
    draw = ImageDraw.Draw(layer)
    rng = random.Random(seed + 11)
    x0, y0, x1, y1 = paper_box
    area = max(1, (x1 - x0) * (y1 - y0))
    line_count = min(1400, max(28, area // 2600))
    for _ in range(line_count):
        x = rng.randint(x0, max(x0, x1 - 1))
        y = rng.randint(y0, max(y0, y1 - 1))
        length = rng.randint(2, max(3, min(22, (x1 - x0) // 12)))
        alpha = rng.randint(10, round(20 + age * 25))
        colour = (104, 89, 69, alpha) if rng.random() < 0.72 else (75, 88, 91, alpha)
        draw.line((x, y, min(x1 - 1, x + length), y + rng.choice((-1, 0, 1))), fill=colour, width=1)
    return layer


def _stamp_layers(
    source: Any,
    canvas: tuple[int, int],
    paper_box: tuple[int, int, int, int],
    options: dict[str, Any],
    paper_colour: tuple[int, int, int, int],
) -> tuple[dict[str, Any], tuple[int, int, int, int]]:
    stamp_box = _stamp_box(paper_box, options)
    x0, y0, x1, y1 = stamp_box
    width, height = x1 - x0, y1 - y0
    primary_local, secondary_local = _graphic_local(source, (width, height))
    shape_mask = _shape_mask(canvas, stamp_box, options["stamp_shape"], primary_local)
    local_primary = Image.new("L", canvas, 0)
    local_primary.paste(primary_local, (x0, y0))
    motif_mask = ImageChops.multiply(local_primary, shape_mask)

    filter_size = max(3, (round(min(width, height) * 0.035) // 2) * 2 + 1)
    inner = shape_mask.filter(ImageFilter.MinFilter(filter_size))
    border_mask = ImageChops.subtract(shape_mask, inner)
    primary_colour = _parse_colour(options["primary_ink"], "primary_ink")
    secondary_colour = _parse_colour(options["secondary_ink"], "secondary_ink")
    border = _colour_layer(border_mask, primary_colour, 230)
    motif = _colour_layer(motif_mask, primary_colour, 218)

    offset = max(1, round(min(width, height) * 0.012))
    secondary_mask = Image.new("L", canvas, 0)
    secondary_mask.paste(secondary_local, (x0 + offset, y0 + offset))
    secondary_mask = ImageChops.multiply(secondary_mask, shape_mask)
    secondary = _colour_layer(secondary_mask, secondary_colour, 112)

    wear = _transparent(canvas)
    wear_draw = ImageDraw.Draw(wear)
    rng = random.Random(options["procedural_seed"] + 29)
    stamp_area = max(1, width * height)
    specks = max(6, round(stamp_area * options["ink_wear"] / 260))
    for _ in range(specks):
        x = rng.randint(x0, max(x0, x1 - 1))
        y = rng.randint(y0, max(y0, y1 - 1))
        if shape_mask.getpixel((x, y)) < 128:
            continue
        radius = rng.randint(1, max(1, round(min(width, height) * 0.015)))
        wear_draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=paper_colour)
    for _ in range(max(2, round(options["ink_wear"] * 12))):
        x = rng.randint(x0, max(x0, x1 - 1))
        y = rng.randint(y0, max(y0, y1 - 1))
        length = rng.randint(3, max(4, width // 7))
        wear_draw.line((x, y, min(x1 - 1, x + length), y + rng.choice((-1, 0, 1))), fill=paper_colour, width=1)
    return {
        "layer-stamp-border": border,
        "layer-stamp-motif": motif,
        "layer-secondary-ink": secondary,
        "layer-dry-ink-wear": wear,
    }, stamp_box


def _archive_finish(
    canvas: tuple[int, int],
    paper_box: tuple[int, int, int, int],
    seed: int,
) -> Any:
    layer = _transparent(canvas)
    draw = ImageDraw.Draw(layer)
    rng = random.Random(seed + 47)
    x0, y0, x1, y1 = paper_box
    for _ in range(7):
        y = rng.randint(y0, max(y0, y1 - 1))
        start = rng.randint(x0, max(x0, x1 - 1))
        span = rng.randint(4, max(5, (x1 - x0) // 5))
        draw.line((start, y, min(x1 - 1, start + span), y), fill=(62, 70, 68, rng.randint(8, 18)), width=1)
    return layer


def _load_font(size: int, bold: bool = False) -> Any:
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for path in candidates:
        if path.is_file():
            try:
                return ImageFont.truetype(str(path), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def _caption_layer(
    canvas: tuple[int, int],
    paper_box: tuple[int, int, int, int],
    stamp_box: tuple[int, int, int, int],
    options: dict[str, Any],
) -> Any:
    layer = _transparent(canvas)
    title = options.get("caption_title")
    subtitle = options.get("caption_subtitle")
    if not title and not subtitle:
        return layer
    draw = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = paper_box
    sx0, sy0, sx1, sy1 = stamp_box
    short_side = min(x1 - x0, y1 - y0)
    title_font = _load_font(max(10, round(short_side * 0.045)), True)
    subtitle_font = _load_font(max(9, round(short_side * 0.028)), False)
    line_gap = max(4, round(short_side * 0.018))
    anchor_x = sx0 if options["stamp_position"].endswith("left") else sx1
    align = "left" if options["stamp_position"].endswith("left") else "right"
    below_y = sy1 + line_gap
    title_height = draw.textbbox((0, 0), title or "", font=title_font)[3] if title else 0
    subtitle_height = draw.textbbox((0, 0), subtitle or "", font=subtitle_font)[3] if subtitle else 0
    total_height = title_height + (line_gap // 2 if title and subtitle else 0) + subtitle_height
    text_y = below_y if below_y + total_height < y1 - line_gap else max(y0 + line_gap, sy0 - total_height - line_gap)
    ink = _parse_colour(options["primary_ink"], "primary_ink")
    if title:
        draw.text((anchor_x, text_y), title, font=title_font, fill=(*ink, 178), anchor="ra" if align == "right" else "la")
        text_y += title_height + line_gap // 2
    if subtitle:
        draw.text((anchor_x, text_y), subtitle, font=subtitle_font, fill=(*ink, 132), anchor="ra" if align == "right" else "la")
    return layer


def _layer_specs(caption_enabled: bool) -> list[tuple[str, str, str, str, list[str]]]:
    specs = list(BASE_LAYER_SPECS)
    if caption_enabled:
        specs.append(CAPTION_SPEC)
    return specs


def _render_layers(source: Any, layout: dict[str, Any], options: dict[str, Any]) -> tuple[dict[str, Any], tuple[int, int, int, int]]:
    canvas = tuple(layout["canvas"])
    photo_box = tuple(layout["photo_box"])
    paper_box = tuple(layout["paper_box"])
    paper_colour = _paper_colour(options["paper_age"])

    paper = Image.new("RGBA", canvas, paper_colour)
    photo = _transparent(canvas)
    photo.alpha_composite(source, (photo_box[0], photo_box[1]))
    texture = _paper_texture(canvas, paper_box, options["paper_age"], options["procedural_seed"])
    stamp_layers, stamp_box = _stamp_layers(source, canvas, paper_box, options, paper_colour)
    finish = _archive_finish(canvas, paper_box, options["procedural_seed"])
    layers = {
        "layer-paper-base": paper,
        "layer-photo-panel": photo,
        "layer-paper-texture": texture,
        **stamp_layers,
        "layer-archive-finish": finish,
    }
    if options.get("caption_title") or options.get("caption_subtitle"):
        layers["layer-caption"] = _caption_layer(canvas, paper_box, stamp_box, options)
    return layers, stamp_box


def _write_prompts(project: Path, specs: list[tuple[str, str, str, str, list[str]]], canvas: tuple[int, int]) -> None:
    prompts_dir = project / "prompts"
    prompts_dir.mkdir(exist_ok=True)
    for path in prompts_dir.glob("*.md"):
        path.unlink()
    for position, (layer_id, slug, _label_zh, label_en, _depends_on) in enumerate(specs, start=1):
        text = (
            f"# {label_en}\n\n"
            f"Create only \u0060{layer_id}\u0060 for the locked {canvas[0]}x{canvas[1]} archive composition.\n"
            "Keep the source photo panel invariant. Keep pixels outside this semantic responsibility transparent, "
            "except for the opaque bottom paper layer.\n"
        )
        if layer_id == "layer-caption":
            text += "Render only the exact user-supplied caption. Do not invent or rewrite text.\n"
        (prompts_dir / f"{position:02d}-{slug}.md").write_text(text, encoding="utf-8")


def _sync_project(project: Path, archive: dict[str, Any], source: Any, *, snapshot: bool) -> dict[str, Any]:
    project_dir, config, index_path, old_index = RASTER.resolve_project(project)
    options = _normalise_options(archive)
    layout = _layout(source.size, options)
    caption_enabled = bool(options.get("caption_title") or options.get("caption_subtitle"))
    specs = _layer_specs(caption_enabled)
    rendered, stamp_box = _render_layers(source, layout, options)
    if snapshot:
        FEATURES.create_snapshot(
            project_dir,
            RASTER.build_manifest(project_dir),
            reason="Before photo-stamp archive configuration update",
            force=True,
        )

    layer_dir = project_dir / "layers"
    layer_dir.mkdir(exist_ok=True)
    entries = []
    keep_files: set[Path] = set()
    for position, (layer_id, slug, label_zh, label_en, depends_on) in enumerate(specs, start=1):
        relative = Path("layers") / f"{position:02d}-{slug}.png"
        output = project_dir / relative
        rendered[layer_id].save(output, format="PNG", compress_level=6)
        keep_files.add(output.resolve())
        entries.append(
            {
                "id": layer_id,
                "label": label_en,
                "label_zh": label_zh,
                "label_en": label_en,
                "z_index": position,
                "file": relative.as_posix(),
                "prompt": f"prompts/{position:02d}-{slug}.md",
                "visible": True,
                "locked": layer_id == "layer-photo-panel",
                "opacity": 1.0,
                "blend_mode": "normal",
                "layer_type": "raster",
                "depends_on": depends_on,
                "bbox_hint": list(layout["photo_box"] if layer_id == "layer-photo-panel" else layout["paper_box"]),
                "content_type": "caption-text" if layer_id == "layer-caption" else slug,
            }
        )
    for entry in old_index.get("layers", []) if isinstance(old_index.get("layers"), list) else []:
        if not isinstance(entry, dict) or not isinstance(entry.get("file"), str):
            continue
        candidate = (project_dir / entry["file"]).resolve()
        if candidate.parent == layer_dir.resolve() and candidate not in keep_files and candidate.is_file():
            candidate.unlink()

    canvas = tuple(layout["canvas"])
    index = {
        "schema_version": "1.1",
        "kind": "layered-raster-index",
        "canvas": {"width": canvas[0], "height": canvas[1], "color_space": "sRGB"},
        "layer_format": "png",
        "layers": entries,
    }
    _write_json(index_path, index)
    _write_prompts(project_dir, specs, canvas)

    source_relative = str(archive["source"]["file"])
    source_reference = project_dir / source_relative
    photo_crop = rendered["layer-photo-panel"].crop(tuple(layout["photo_box"]))
    archive_document = {
        "schema_version": "1.0",
        "kind": ARCHIVE_KIND,
        "source": {
            **archive["source"],
            "sha256": _sha256_file(source_reference),
            "pixel_sha256": hashlib.sha256(source.tobytes()).hexdigest(),
            "mode": source.mode,
            "width": source.width,
            "height": source.height,
        },
        "composition": {
            "orientation": options["orientation"],
            "photo_side": options["photo_side"],
            "requested_photo_ratio": options["photo_ratio"],
            "actual_photo_ratio": round(layout["actual_photo_ratio"], 8),
            "photo_box": list(layout["photo_box"]),
            "paper_box": list(layout["paper_box"]),
            "stamp_box": list(stamp_box),
            "straight_seam": True,
            "paper_quiet_space_minimum": 0.65,
        },
        "stamp": {
            "shape": options["stamp_shape"],
            "position": options["stamp_position"],
            "scale": options["stamp_scale"],
            "primary_ink": options["primary_ink"],
            "secondary_ink": options["secondary_ink"],
            "ink_wear": options["ink_wear"],
            "subject_derived": True,
        },
        "paper": {"age": options["paper_age"], "heavy_distress_forbidden": True},
        "caption": {
            "enabled": caption_enabled,
            "title": options.get("caption_title"),
            "subtitle": options.get("caption_subtitle"),
            "policy": "explicit-only",
        },
        "invariants": {
            "source_reference_immutable": True,
            "photo_redraw_forbidden": True,
            "photo_layer_pixel_sha256": hashlib.sha256(photo_crop.tobytes()).hexdigest(),
            "stamp_is_not_miniature_photo": True,
            "decorative_separator_forbidden": True,
            "default_layer_count": 8,
        },
        "procedural_seed": options["procedural_seed"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _write_json(project_dir / "archive-config.json", archive_document)

    config["canvas"] = {"width": canvas[0], "height": canvas[1], "color_space": "sRGB"}
    config["target_layers"] = len(entries)
    config["style"] = STYLE_ID
    config["style_recipe"] = "style-recipe.json"
    config["design_preset"] = "photo-stamp-archive-balanced"
    config["archive_mode"] = "archive-config.json"
    config["procedural_seed"] = options["procedural_seed"]
    _write_json(project_dir / "project.json", config)

    plan = FEATURES.load_design_plan(project_dir)
    plan["style"] = STYLE_ID
    plan["selected_preset"] = "photo-stamp-archive-balanced"
    plan["artwork_text"] = caption_enabled
    plan["text_policy"] = {
        "mode": "allow-declared-layers" if caption_enabled else "forbid",
        "allowed_layers": ["layer-caption"] if caption_enabled else [],
        "reason": "Exact user-supplied archive caption" if caption_enabled else "Caption omitted by default",
    }
    plan["updated_at"] = datetime.now(timezone.utc).isoformat()
    FEATURES.validate_design_plan(plan, project_dir)
    _write_json(project_dir / "design-plan.json", plan)
    _write_json(
        project_dir / "creative-brief.json",
        {
            "schema_version": "1.0",
            "status": "locked",
            "title": config.get("title", "Photo Stamp Archive"),
            "output_mode": "raster-layered",
            "style": STYLE_ID,
            "source_fidelity": "immutable reference plus dedicated photo layer",
            "composition": archive_document["composition"],
            "stamp": archive_document["stamp"],
            "caption_policy": archive_document["caption"],
        },
    )
    composed = RASTER.compose_project(project_dir)
    manifest = RASTER.build_manifest(project_dir)
    _write_json(project_dir / "manifest.json", manifest)
    return {
        "ok": True,
        "project": str(project_dir),
        "archive_config": str(project_dir / "archive-config.json"),
        "artwork": composed["artwork"],
        "preview": composed["preview"],
        "layers": len(entries),
        "caption_enabled": caption_enabled,
        "revision": manifest["revision"],
        "photo_layer_pixel_sha256": archive_document["invariants"]["photo_layer_pixel_sha256"],
    }


def create_archive_project(
    source: str | Path,
    output: str | Path,
    *,
    title: str = "Photo Stamp Archive",
    **raw_options: Any,
) -> dict[str, Any]:
    _require_pillow()
    source_path = Path(source).expanduser().resolve()
    if not source_path.is_file():
        raise PhotoStampArchiveError(f"Source image does not exist: {source_path}")
    try:
        with Image.open(source_path) as opened:
            source_image = ImageOps.exif_transpose(opened).convert("RGBA")
            source_image.load()
    except (OSError, ValueError) as exc:
        raise PhotoStampArchiveError(f"Unable to read source image: {exc}") from exc
    options = _normalise_options(raw_options)
    layout = _layout(source_image.size, options)
    caption_enabled = bool(options.get("caption_title") or options.get("caption_subtitle"))
    project = Path(output).expanduser().resolve()
    RASTER.create_project(
        project,
        title=title,
        layers=9 if caption_enabled else 8,
        width=layout["canvas"][0],
        height=layout["canvas"][1],
        style=STYLE_ID,
    )
    reference_dir = project / "references" / "photo-stamp-archive"
    reference_dir.mkdir(parents=True, exist_ok=True)
    suffix = source_path.suffix.lower() if source_path.suffix else ".img"
    reference = reference_dir / f"source-original{suffix}"
    shutil.copy2(source_path, reference)
    archive = {
        "source": {
            "file": reference.relative_to(project).as_posix(),
            "original_name": source_path.name,
        },
        **options,
    }
    result = _sync_project(project, archive, source_image, snapshot=False)
    result["integrity"] = verify_archive_project(project, strict=True)
    return result


def load_archive_config(raw_target: str | Path) -> dict[str, Any]:
    project, config, _index_path, _index = RASTER.resolve_project(raw_target)
    relative = config.get("archive_mode")
    if config.get("style") != STYLE_ID or not isinstance(relative, str):
        raise PhotoStampArchiveError("Project is not a photo-stamp archive project")
    path = (project / relative).resolve()
    if project not in path.parents or not path.is_file():
        raise PhotoStampArchiveError("archive-config.json is missing or escapes the project")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PhotoStampArchiveError(f"Unable to read archive configuration: {exc}") from exc
    if not isinstance(value, dict) or value.get("kind") != ARCHIVE_KIND:
        raise PhotoStampArchiveError("archive-config.json has an invalid contract")
    return value


def verify_archive_project(raw_target: str | Path, *, strict: bool = False) -> dict[str, Any]:
    """Verify immutable source bytes, displayed pixels, layer lock, and stack shape."""
    _require_pillow()
    project, _config, _index_path, index = RASTER.resolve_project(raw_target)
    archive = load_archive_config(project)
    errors: list[str] = []
    checks: dict[str, bool] = {}

    source_relative = archive.get("source", {}).get("file")
    source_path = (project / source_relative).resolve() if isinstance(source_relative, str) else None
    source_safe = bool(source_path and project in source_path.parents and source_path.is_file())
    checks["source_reference_present"] = source_safe
    if not source_safe:
        errors.append("Archive source reference is unavailable")
    else:
        actual_file_hash = _sha256_file(source_path)
        checks["source_file_sha256"] = actual_file_hash == archive.get("source", {}).get("sha256")
        if not checks["source_file_sha256"]:
            errors.append("Immutable source-file SHA-256 does not match archive-config.json")
        try:
            with Image.open(source_path) as opened:
                source_image = ImageOps.exif_transpose(opened).convert("RGBA")
                source_image.load()
        except (OSError, ValueError) as exc:
            source_image = None
            errors.append(f"Unable to decode immutable source reference: {exc}")
        if source_image is not None:
            checks["source_pixel_sha256"] = _sha256_pixels(source_image) == archive.get("source", {}).get(
                "pixel_sha256"
            )
            if not checks["source_pixel_sha256"]:
                errors.append("Source-pixel SHA-256 does not match archive-config.json")

    layers = index.get("layers", [])
    photo_entry = next((entry for entry in layers if entry.get("id") == "layer-photo-panel"), None)
    checks["photo_layer_present"] = isinstance(photo_entry, dict)
    checks["photo_layer_locked"] = bool(photo_entry and photo_entry.get("locked"))
    if not checks["photo_layer_present"]:
        errors.append("layer-photo-panel is missing")
    elif not checks["photo_layer_locked"]:
        errors.append("layer-photo-panel is not locked")
    if isinstance(photo_entry, dict):
        layer_relative = photo_entry.get("file")
        layer_path = (project / layer_relative).resolve() if isinstance(layer_relative, str) else None
        layer_safe = bool(layer_path and project in layer_path.parents and layer_path.is_file())
        checks["photo_layer_file_present"] = layer_safe
        if not layer_safe:
            errors.append("Photo layer file is unavailable")
        else:
            box = archive.get("composition", {}).get("photo_box")
            if not isinstance(box, list) or len(box) != 4:
                errors.append("Archive photo_box is invalid")
            else:
                x, y, width, height = (int(value) for value in box)
                try:
                    with Image.open(layer_path) as opened:
                        photo_layer = opened.convert("RGBA")
                        crop = photo_layer.crop((x, y, x + width, y + height))
                        checks["photo_layer_pixel_sha256"] = _sha256_pixels(crop) == archive.get(
                            "invariants", {}
                        ).get("photo_layer_pixel_sha256")
                except (OSError, ValueError) as exc:
                    checks["photo_layer_pixel_sha256"] = False
                    errors.append(f"Unable to decode photo layer: {exc}")
                if not checks.get("photo_layer_pixel_sha256", False):
                    errors.append("Photo-layer pixel SHA-256 does not match archive-config.json")

    expected_layers = 9 if archive.get("caption", {}).get("enabled") else 8
    checks["layer_count"] = len(layers) == expected_layers
    if not checks["layer_count"]:
        errors.append(f"Archive requires {expected_layers} layers, found {len(layers)}")
    result = {
        "ok": not errors,
        "algorithm": "SHA-256",
        "checks": checks,
        "errors": errors,
    }
    if strict and errors:
        raise PhotoStampArchiveError("Archive integrity check failed: " + "; ".join(errors))
    return result


def public_state(raw_target: str | Path) -> dict[str, Any] | None:
    try:
        state = load_archive_config(raw_target)
        state["integrity"] = verify_archive_project(raw_target, strict=False)
        return state
    except (PhotoStampArchiveError, RASTER.RasterLayeredError):
        return None


def update_archive_project(raw_target: str | Path, changes: dict[str, Any]) -> dict[str, Any]:
    _require_pillow()
    project, _config, _index_path, _index = RASTER.resolve_project(raw_target)
    current = load_archive_config(project)
    verify_archive_project(project, strict=True)
    source_relative = current.get("source", {}).get("file")
    if not isinstance(source_relative, str):
        raise PhotoStampArchiveError("Archive source reference is missing")
    source_path = (project / source_relative).resolve()
    if project not in source_path.parents or not source_path.is_file():
        raise PhotoStampArchiveError("Archive source reference is unavailable")
    allowed = {
        "orientation",
        "photo_side",
        "photo_ratio",
        "stamp_shape",
        "stamp_position",
        "stamp_scale",
        "paper_age",
        "ink_wear",
        "primary_ink",
        "secondary_ink",
        "caption_title",
        "caption_subtitle",
        "procedural_seed",
    }
    unknown = sorted(set(changes) - allowed)
    if unknown:
        raise PhotoStampArchiveError("Unknown archive fields: " + ", ".join(unknown))
    merged = {
        "source": current["source"],
        "orientation": current["composition"]["orientation"],
        "photo_side": current["composition"]["photo_side"],
        "photo_ratio": current["composition"]["requested_photo_ratio"],
        "stamp_shape": current["stamp"]["shape"],
        "stamp_position": current["stamp"]["position"],
        "stamp_scale": current["stamp"]["scale"],
        "paper_age": current["paper"]["age"],
        "ink_wear": current["stamp"]["ink_wear"],
        "primary_ink": current["stamp"]["primary_ink"],
        "secondary_ink": current["stamp"]["secondary_ink"],
        "caption_title": current["caption"].get("title"),
        "caption_subtitle": current["caption"].get("subtitle"),
        "procedural_seed": current.get("procedural_seed", 71913),
        **changes,
    }
    if "orientation" in changes and "photo_side" not in changes:
        merged["photo_side"] = None
    options = _normalise_options(merged)
    try:
        with Image.open(source_path) as opened:
            source_image = ImageOps.exif_transpose(opened).convert("RGBA")
            source_image.load()
    except (OSError, ValueError) as exc:
        raise PhotoStampArchiveError(f"Unable to reopen immutable source reference: {exc}") from exc
    result = _sync_project(project, {"source": current["source"], **options}, source_image, snapshot=True)
    result["integrity"] = verify_archive_project(project, strict=True)
    return result
