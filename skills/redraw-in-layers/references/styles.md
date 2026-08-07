# Style families

Keep semantic top-level layers stable across styles. Express style through geometry, strokes, patterns, masks, gradients, and child groups.

| Style | Vector construction | Guardrail |
|---|---|---|
| Minimal line | sparse Bézier contours, varied stroke weight, open negative space | avoid automatic edge tracing |
| Editorial poster | broad silhouettes, limited palette, type and geometric rhythm | keep type editable in the working SVG |
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
| Blueprint | monoline contours, grids, annotations, limited cyan palette | keep annotations editable and optional |
| Collage | clipped vector shapes, torn-edge paths, type fragments | use hybrid textures only when explicitly allowed |
| Children’s picture book | softened shapes, expressive contours, simplified proportions | avoid unintended infantilization of serious scenes |

For mixed styles, assign one dominant style and at most two supporting treatments. Example: pencil subject + restrained watercolor environment + poster typography.
