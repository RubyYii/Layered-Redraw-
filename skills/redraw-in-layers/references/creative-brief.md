# Creative brief

Ask only questions that materially change the drawing. Prefer 3–5 questions in one turn and allow free-form answers.

## High-information questions

1. What three feelings should the result convey?
2. Which subject or relationship must remain unmistakable?
3. How far may the drawing depart from the photograph: faithful, distilled, or strongly abstract?
4. Should the original crop and proportions remain, or may the subject scale, negative space, perspective, and balance be redesigned?
5. Which style family, palette, light, and mark quality feel right?
6. What may be simplified or removed, and what must not appear?
7. Where will the result be used, and what aspect ratio or print size is required?

Skip questions already answered by the prompt. If the user names a style but not a mood, ask about mood and emphasis rather than repeating the style choice.

## Brief schema

```json
{
  "schema_version": "1.0",
  "mood": ["quiet", "damp", "nostalgic"],
  "primary_subjects": ["canal", "brick warehouse"],
  "recognition_priority": ["canal perspective", "window rhythm"],
  "style": "restrained watercolor poster",
  "abstraction": 0.45,
  "palette": ["grey green", "brick red", "warm window light"],
  "light": "soft evening backlight",
  "mark_quality": "dry brush with broad quiet shapes",
  "simplify": ["distant pedestrians", "small signs"],
  "avoid": ["cartoon proportions", "high saturation", "micro-detail"],
  "usage": "personal print",
  "aspect_ratio": "3:2",
  "output_mode": "vector-strict",
  "workflow_mode": "guided",
  "design_preset": "faithful-balanced",
  "proof_stage": "structure",
  "proof_spread": 0.65,
  "reference_roles": {"primary-rgb": "scene-main", "style-reference": "ink-example"},
  "depth_source": "estimate-relative",
  "depth_interpretation": "faithful",
  "layer_planning_prompt": "keep the person separate; merge distant buildings",
  "artwork_text": false,
  "target_layers": 10
}
```

Use abstraction values as guidance, not as an image-model parameter:

- `0.0–0.25`: faithful structure with simplified contours.
- `0.25–0.6`: distilled scene relationships and selective detail.
- `0.6–1.0`: strongly nonliteral shapes while preserving the chosen idea.

When multiple images or depth are supplied, also confirm which RGB is the active scene, which inputs are only style/palette evidence, whether supplied depth uses high or low values for near areas, and which subjects must remain independently editable. Read `reference-intelligence.md` before interpreting depth.
