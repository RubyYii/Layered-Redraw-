# Style families

Keep semantic layers stable across styles. Express style through vector construction or explicit raster mark rules inside each owning layer.

Install the selected machine-readable recipe as `style-recipe.json`. List bundled recipes with `python scripts/layered_redraw.py styles`. Every bundled recipe defines composition, proportion, space model, shape grammar, value structure, colour system, edge system, lighting, rhythm, and material marks. Treat user changes as explicit overrides rather than reducing a style to palette or brush texture.

| Style | Construction | Guardrail |
|---|---|---|
| Minimal line | sparse Bézier contours, varied stroke weight, open negative space | avoid automatic edge tracing |
| Editorial poster | asymmetric crop, broad silhouettes, limited palette, geometric rhythm | forbid artwork text unless declared layer exceptions are required |
| Seal carving | red/stone fields, carved negative paths, irregular pressure | avoid copying protected artist signatures |
| Pencil sketch | layered graphite strokes, hatch groups, pressure variation | group hatching with the owning object |
| Ink wash | translucent shape washes, dry-edge masks, restrained black | avoid filter-heavy muddy output |
| Watercolor | overlapping translucent shapes, paper-colored gaps, granulation patterns | prefer vector-textured; hybrid only by request |
| Oil paint | broad impasto-like vector strokes, opaque color blocks, directional marks | simplify rather than simulate every bristle |
| Woodcut | carved black fields, directional cuts, high contrast | keep cuts grouped by semantic object |
| Risograph | 2–4 spot colors, deliberate registration offset, halftone patterns | preserve separable color groups internally |
| Paper cut | stacked flat shapes, offset edges, restrained shadows | do not turn every paper edge into a top layer |
| Stained glass | closed color cells, strong lead contours, luminous gradients | keep cell groups inside semantic layers |
| Geometric abstraction | polygons, arcs, repeated ratios, dominant relationships | retain the chosen subject idea, not literal detail |
| Blueprint | monoline contours, grids, modular spacing, limited cyan palette | use geometry rather than labels for the v0.6 visual hierarchy |
| Collage | clipped vector shapes, torn-edge paths, overlapping proportion shifts | use hybrid textures only when explicitly allowed |
| Children’s picture book | softened shapes, expressive contours, simplified proportions | avoid unintended infantilization of serious scenes |
| Pixel art | raster-layered logical grid, hard clusters, shared limited palette, deliberate dithering | read `pixel-art.md`; forbid anti-aliasing, soft alpha, blur, and non-integer scaling |

For mixed styles, assign one dominant design system and at most two supporting material treatments. Example: poster composition + pencil subject + restrained watercolour environment.

When the direction is uncertain, generate 2–4 low-detail proofs. First compare composition and proportion variants; then compare value and colour; only then compare surface treatment. Record the chosen direction with `direction-board` before rendering full layers.
