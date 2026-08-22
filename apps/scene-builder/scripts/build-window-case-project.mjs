import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createEntityConfig,
  createSceneObject,
  normalizeProject,
  serializeProject,
} from "../src/model.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const caseRoot = path.join(projectRoot, "projects", "window-case");
const referencePath = path.join(caseRoot, "source", "b2-photograph-closed-wall.png");
const outputPath = path.join(caseRoot, "window-that-wasnt-there.blockout.json");
const manifestPath = path.join(caseRoot, "shot-manifest.json");

if (!fs.existsSync(referencePath)) {
  throw new Error(`缺少 B2 基准图：${referencePath}`);
}

fs.mkdirSync(caseRoot, { recursive: true });

const COLORS = Object.freeze({
  plaster: "#292c33",
  plasterShadow: "#1b1f26",
  floor: "#15191e",
  wood: "#181311",
  blanket: "#34383e",
  pillow: "#77786f",
  cyan: "#68c4d6",
  gold: "#e2bd63",
  red: "#c97880",
  violet: "#8e84c2",
  orange: "#c68a55",
  void: "#080b0d",
  glass: "#52656b",
  paper: "#c9c2b5",
  white: "#d0cec6",
});

const objects = [];
const ids = new Map();
const groups = new Map();
const displayIds = new Set();

const addToGroup = (groupName, id) => {
  if (!groups.has(groupName)) groups.set(groupName, new Set());
  groups.get(groupName).add(id);
};

const addObject = (key, type, name, config, options = {}) => {
  const id = `window-case-${key}`;
  const groupNames = options.groups ?? [];
  const object = createSceneObject(type, {
    ...config,
    id,
    name,
    visible: options.visible ?? false,
    locked: config.locked ?? true,
    entity: config.entity ?? createEntityConfig("environment"),
  });
  objects.push(object);
  ids.set(key, id);
  if (!options.targetOnly) displayIds.add(id);
  groupNames.forEach((groupName) => addToGroup(groupName, id));
  return id;
};

// GEN: the single canonical room. Every branch reuses this geometry.
addObject("floor", "plane", "GEN · 木地板", {
  position: [0, -0.06, 0], dimensions: [6.4, 0.12, 5.2], color: COLORS.floor,
}, { groups: ["base"], visible: true });
addObject("back_wall", "box", "GEN · 封闭后墙", {
  position: [0, 1.7, -2.55], dimensions: [6.4, 3.4, 0.14], color: COLORS.plaster,
}, { groups: ["base"], visible: true });
addObject("left_wall", "box", "GEN · 左墙", {
  position: [-3.13, 1.7, 0], dimensions: [0.14, 3.4, 5.2], color: COLORS.plasterShadow,
}, { groups: ["base"], visible: true });
addObject("right_return", "box", "GEN · 右墙回折", {
  position: [3.13, 1.7, -2.05], dimensions: [0.14, 3.4, 1.0], color: COLORS.plasterShadow,
}, { groups: ["base"], visible: true });
addObject("back_baseboard", "box", "GEN · 后墙踢脚线", {
  position: [0, 0.08, -2.44], dimensions: [6.18, 0.16, 0.1], color: COLORS.wood,
}, { groups: ["base"], visible: true });
addObject("left_baseboard", "box", "GEN · 左墙踢脚线", {
  position: [-3.02, 0.08, 0], dimensions: [0.1, 0.16, 5.0], color: COLORS.wood,
}, { groups: ["base"], visible: true });

addObject("bed_mattress", "box", "GEN · 单人床垫", {
  position: [2.18, 0.62, -1.18], dimensions: [1.28, 0.28, 2.22], color: COLORS.pillow,
}, { groups: ["base"], visible: true });
addObject("bed_blanket", "box", "GEN · 灰色床毯", {
  position: [2.18, 0.81, -1.12], dimensions: [1.32, 0.12, 2.08], color: COLORS.blanket,
}, { groups: ["base"], visible: true });
addObject("bed_pillow", "box", "GEN · 枕头", {
  position: [2.18, 0.96, -1.86], dimensions: [0.96, 0.15, 0.48], color: COLORS.pillow,
}, { groups: ["base"], visible: true });
addObject("bed_headboard", "box", "GEN · 床头板", {
  position: [2.18, 0.72, -2.29], dimensions: [1.42, 1.2, 0.12], color: COLORS.wood,
}, { groups: ["base"], visible: true });
addObject("bed_footboard", "box", "GEN · 床尾板", {
  position: [2.18, 0.48, -0.02], dimensions: [1.42, 0.76, 0.12], color: COLORS.wood,
}, { groups: ["base"], visible: true });
for (const [key, x] of [["bed_rail_l", 1.57], ["bed_rail_r", 2.79]]) {
  addObject(key, "box", `GEN · ${x < 2 ? "左" : "右"}床沿`, {
    position: [x, 0.38, -1.16], dimensions: [0.1, 0.24, 2.24], color: COLORS.wood,
  }, { groups: ["base"], visible: true });
}
for (const [key, x, z] of [
  ["leg_lh", 1.57, -2.23], ["leg_rh", 2.79, -2.23],
  ["leg_lf", 1.57, -0.08], ["leg_rf", 2.79, -0.08],
]) {
  addObject(key, "box", "GEN · 床腿", {
    position: [x, 0.22, z], dimensions: [0.11, 0.44, 0.11], color: COLORS.wood,
  }, { groups: ["base"], visible: true });
}

// Hidden camera targets let the existing viewpoint system produce close and oblique views.
addObject("target_wall_detail", "box", "镜位目标 · 墙面细节", {
  position: [-0.65, 1.72, -2.38], dimensions: [0.28, 0.28, 0.12], color: COLORS.plaster,
}, { targetOnly: true });
addObject("target_room", "box", "镜位目标 · 房间中心", {
  position: [0, 1.35, -1.1], dimensions: [0.25, 0.25, 0.25], color: COLORS.plaster,
}, { targetOnly: true });
addObject("target_evidence", "box", "镜位目标 · 三种不等证据", {
  position: [-10.5, 1.65, -2.2], dimensions: [0.25, 0.25, 0.25], color: COLORS.void,
}, { targetOnly: true });
addObject("target_roles", "box", "镜位目标 · 四个不等角色席位", {
  position: [10.5, 1.65, -2.2], dimensions: [0.25, 0.25, 0.25], color: COLORS.void,
}, { targetOnly: true });

// B3: remembered light. It stays visibly separate from the wall geometry.
addObject("memory_light_wall", "box", "GEN · 身体记得的墙面光", {
  position: [0.6, 1.63, -2.42], dimensions: [0.055, 2.4, 0.035], color: COLORS.gold,
}, { groups: ["memorySeam"] });
addObject("memory_light_bed", "box", "GEN · 抵达床面的光", {
  position: [1.05, 0.035, -0.38], rotation: [0, -12, 0], dimensions: [1.9, 0.035, 1.18], color: COLORS.gold,
}, { groups: ["memoryPool"] });

// B4: an interrupted waveform made from independent violet segments.
for (let index = 0; index < 11; index += 1) {
  const height = [0.12, 0.28, 0.18, 0.46, 0.2, 0.34, 0.16, 0.4, 0.22, 0.12, 0.06][index];
  addObject(`wave_${index}`, "box", `SCHEM · 波形 ${String(index + 1).padStart(2, "0")}`, {
    position: [-2.45 + index * 0.23, 0.92, -2.35], dimensions: [0.06, height, 0.035], color: COLORS.violet,
  }, { groups: ["waveform"] });
}

// REFERENCE 02: three unequal traces staged as evidence rather than room decoration.
addObject("evidence_backplate", "box", "EVIDENCE · 深色证物台", {
  position: [-10.5, 1.65, -2.5], dimensions: [6.1, 3.35, 0.12], color: COLORS.void,
}, { groups: ["evidenceBackdrop"] });
addObject("evidence_table_line", "box", "EVIDENCE · 证物台基准线", {
  position: [-10.5, 0.22, -2.3], dimensions: [5.8, 0.035, 0.035], color: COLORS.gold,
}, { groups: ["evidenceBackdrop"] });

addObject("trace_photo_paper", "box", "TRACE 01 · 未改动照片白边", {
  position: [-11.65, 1.72, -2.31], rotation: [0, 0, 2], dimensions: [2.38, 1.62, 0.09], color: COLORS.paper,
}, { groups: ["evidencePhoto"] });
addObject("trace_photo_image", "box", "TRACE 01 · 封闭墙照片", {
  position: [-11.65, 1.72, -2.23], rotation: [0, 0, 2], dimensions: [2.08, 1.34, 0.06], color: COLORS.plasterShadow,
}, { groups: ["evidencePhoto"] });
addObject("trace_photo_seam", "box", "TRACE 01 · 照片中的记忆光缝", {
  position: [-11.15, 1.75, -2.15], rotation: [0, 0, 2], dimensions: [0.035, 1.05, 0.035], color: COLORS.gold,
}, { groups: ["evidencePhoto"] });

addObject("trace_voice_panel", "box", "TRACE 02 · 重演声音面板", {
  position: [-9.35, 2.3, -2.3], dimensions: [2.45, 0.92, 0.09], color: COLORS.plasterShadow,
}, { groups: ["evidenceVoice"] });
for (let index = 0; index < 11; index += 1) {
  const height = [0.1, 0.28, 0.16, 0.48, 0.18, 0.34, 0.14, 0.42, 0.2, 0.12, 0.08][index];
  addObject(`trace_voice_wave_${index}`, "box", `TRACE 02 · 重演波形 ${String(index + 1).padStart(2, "0")}`, {
    position: [-10.35 + index * 0.19, 2.3, -2.2], dimensions: [0.045, height, 0.035], color: COLORS.violet,
  }, { groups: ["evidenceVoice"] });
}
for (let index = 0; index < 8; index += 1) {
  addObject(`trace_voice_warning_${index}`, "box", "TRACE 02 · 非原始音频虚线", {
    position: [-10.15 + index * 0.25, 2.68, -2.18], dimensions: [0.12, 0.025, 0.025], color: COLORS.red,
  }, { groups: ["evidenceVoice"] });
}

addObject("trace_cup_body", "cylinder", "TRACE 03 · 留存杯体", {
  position: [-9.35, 0.78, -2.12], dimensions: [0.72, 1.02, 0.72], color: COLORS.paper,
}, { groups: ["evidenceCup"] });
for (const [key, position, dimensions, rotation] of [
  ["trace_cup_handle_top", [-8.93, 1.0, -2.12], [0.42, 0.08, 0.12], [0, 0, -18]],
  ["trace_cup_handle_side", [-8.78, 0.78, -2.12], [0.08, 0.48, 0.12], [0, 0, 0]],
  ["trace_cup_handle_bottom", [-8.93, 0.56, -2.12], [0.42, 0.08, 0.12], [0, 0, 18]],
]) {
  addObject(key, "box", "TRACE 03 · 杯柄", {
    position, dimensions, rotation, color: COLORS.paper,
  }, { groups: ["evidenceCup"] });
}

// REFERENCE 03: four unequal role positions. These are diagrammatic characters,
// never realistic bodies inside the remembered room.
addObject("roles_backplate", "box", "ROLES · 现场席位暗场", {
  position: [10.5, 1.65, -2.5], dimensions: [6.1, 3.35, 0.12], color: COLORS.void,
}, { groups: ["roleBackdrop"] });
addObject("roles_floor_guide", "box", "ROLES · 不等席位基准线", {
  position: [10.5, 0.2, -2.3], dimensions: [5.7, 0.035, 0.035], color: COLORS.white,
}, { groups: ["roleBackdrop"] });

const addRolePanel = (key, x, color, mark = "horizontal") => {
  addObject(`${key}_panel`, "box", "ROLES · 来源状态面板", {
    position: [x, 2.55, -2.34], dimensions: [1.55, 0.88, 0.08], color: COLORS.plasterShadow,
  }, { groups: ["roleBackdrop"] });
  if (mark === "vertical") {
    addObject(`${key}_mark`, "box", "ROLES · 状态标记", {
      position: [x, 2.55, -2.23], dimensions: [0.04, 0.62, 0.035], color,
    }, { groups: ["roleBackdrop"] });
  } else {
    const rotations = mark === "diagonal" ? [-12, 12] : [0];
    rotations.forEach((angle, index) => addObject(`${key}_mark_${index}`, "box", "ROLES · 状态标记", {
      position: [x, 2.55 + index * 0.18, -2.23], rotation: [0, 0, angle], dimensions: [1.0, 0.035, 0.035], color,
    }, { groups: ["roleBackdrop"] }));
  }
};
addRolePanel("roles_source", 8.75, COLORS.cyan, "horizontal");
addRolePanel("roles_variation", 10.5, COLORS.gold, "vertical");
addRolePanel("roles_remains", 12.25, COLORS.red, "diagonal");

const characterEntity = (state) => createEntityConfig("character", {
  state,
  capabilities: {
    movable: false,
    rotatable: false,
    scalable: false,
    visibility: true,
    speakable: false,
    grabbable: false,
  },
  physics: { bodyType: "static", mass: 0, friction: 0, restitution: 0 },
});

const rolePositionIds = new Map();
const addSolidRole = (key, label, x, color, state) => {
  const headId = addObject(`${key}_head`, "sphere", `CHARACTER · ${label} · 头部席位符号`, {
    position: [x, 1.25, -2.18], dimensions: [0.42, 0.42, 0.22], color,
    entity: characterEntity(state),
  }, { groups: ["rolePositions", `role_${key}`] });
  addObject(`${key}_body`, "cone", `CHARACTER · ${label} · 身份席位`, {
    position: [x, 0.67, -2.18], dimensions: [0.82, 0.9, 0.24], color,
    entity: characterEntity(state),
  }, { groups: ["rolePositions", `role_${key}`] });
  rolePositionIds.set(key, headId);
};
addSolidRole("witness", "见证者 / Witness", 8.45, COLORS.cyan, "见证者 · 提供来源但不等于许可");
addSolidRole("rewriter", "改写者 / Rewriter", 9.82, COLORS.gold, "改写者 · 生成变体并保留来源边界");
addSolidRole("guardian", "许可守护者 / Consent Guardian", 11.18, COLORS.red, "许可守护者 · 可停止或限制改写");

const addDash = (key, position, dimensions, rotation = [0, 0, 0]) => addObject(
  key,
  "box",
  "CHARACTER · 档案员空缺席位 · 虚线",
  {
    position,
    dimensions,
    rotation,
    color: COLORS.white,
    entity: characterEntity("档案员 · 当前空缺 · 可由临时非人声音占位"),
  },
  { groups: ["rolePositions", "role_archivist"] },
);

const archivistX = 12.55;
let archivistMainId;
for (let index = 0; index < 12; index += 1) {
  const angle = (Math.PI * 2 * index) / 12;
  const id = addDash(
    `archivist_head_dash_${index}`,
    [archivistX + Math.cos(angle) * 0.23, 1.25 + Math.sin(angle) * 0.23, -2.18],
    [0.1, 0.035, 0.08],
    [0, 0, (angle * 180) / Math.PI + 90],
  );
  if (!archivistMainId) archivistMainId = id;
}

const addDashedSegment = (key, from, to, count) => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  for (let index = 0; index < count; index += 1) {
    const t = (index + 0.5) / count;
    addDash(
      `${key}_${index}`,
      [from[0] + dx * t, from[1] + dy * t, -2.18],
      [0.12, 0.035, 0.08],
      [0, 0, angle],
    );
  }
};
addDashedSegment("archivist_left", [archivistX - 0.08, 1.0], [archivistX - 0.42, 0.28], 5);
addDashedSegment("archivist_right", [archivistX + 0.08, 1.0], [archivistX + 0.42, 0.28], 5);
addDashedSegment("archivist_bottom", [archivistX - 0.42, 0.28], [archivistX + 0.42, 0.28], 5);
rolePositionIds.set("archivist", archivistMainId);

for (const [key, position, dimensions] of [
  ["role_guard_top", [12.55, 1.72, -2.12], [1.25, 0.04, 0.04]],
  ["role_guard_bottom", [12.55, 0.04, -2.12], [1.25, 0.04, 0.04]],
  ["role_guard_left", [11.95, 0.88, -2.12], [0.04, 1.7, 0.04]],
  ["role_guard_right", [13.15, 0.88, -2.12], [0.04, 1.7, 0.04]],
]) addObject(key, "box", "ROLES · 空缺席位权限边界", {
  position, dimensions, color: COLORS.red,
}, { groups: ["roleGuard"] });

// SCHEM: a sparse cyan room built from actual 3D line segments.
const schematicLine = (key, name, position, dimensions, groupNames = ["schemCore"], color = COLORS.cyan) => (
  addObject(key, "box", name, { position, dimensions, color }, { groups: groupNames })
);
schematicLine("schem_back_top", "SCHEM · 后墙顶线", [0, 3.28, -2.32], [6.2, 0.045, 0.045]);
schematicLine("schem_back_bottom", "SCHEM · 后墙底线", [0, 0.06, -2.32], [6.2, 0.045, 0.045]);
schematicLine("schem_back_left", "SCHEM · 后墙左线", [-3.08, 1.67, -2.32], [0.045, 3.25, 0.045]);
schematicLine("schem_back_right", "SCHEM · 后墙右线", [3.08, 1.67, -2.32], [0.045, 3.25, 0.045]);
schematicLine("schem_floor_left", "SCHEM · 左地面收敛线", [-3.08, 0.04, 0], [0.045, 0.045, 4.65]);
schematicLine("schem_floor_right", "SCHEM · 右地面收敛线", [3.08, 0.04, 0], [0.045, 0.045, 4.65]);
schematicLine("schem_floor_front", "SCHEM · 前地面线", [0, 0.04, 2.3], [6.2, 0.045, 0.045]);
schematicLine("schem_bed_left", "SCHEM · 床左轮廓", [1.56, 0.82, -1.15], [0.045, 0.045, 2.22]);
schematicLine("schem_bed_right", "SCHEM · 床右轮廓", [2.8, 0.82, -1.15], [0.045, 0.045, 2.22]);
schematicLine("schem_bed_head", "SCHEM · 床头轮廓", [2.18, 0.82, -2.25], [1.28, 0.045, 0.045]);
schematicLine("schem_bed_foot", "SCHEM · 床尾轮廓", [2.18, 0.82, -0.05], [1.28, 0.045, 0.045]);
schematicLine("schem_bed_leg_l", "SCHEM · 床腿左线", [1.56, 0.42, -0.05], [0.045, 0.8, 0.045]);
schematicLine("schem_bed_leg_r", "SCHEM · 床腿右线", [2.8, 0.42, -0.05], [0.045, 0.8, 0.045]);

for (const [key, position, dimensions] of [
  ["hyp_window_top", [-0.45, 2.45, -2.28], [2.05, 0.055, 0.055]],
  ["hyp_window_bottom", [-0.45, 1.05, -2.28], [2.05, 0.055, 0.055]],
  ["hyp_window_left", [-1.46, 1.75, -2.28], [0.055, 1.45, 0.055]],
  ["hyp_window_right", [0.56, 1.75, -2.28], [0.055, 1.45, 0.055]],
]) schematicLine(key, "SCHEM · 假想窗", position, dimensions, ["schemWindow"], COLORS.gold);

for (const [key, position, dimensions] of [
  ["forbidden_back", [-1.55, 0.04, -0.95], [1.7, 0.05, 0.05]],
  ["forbidden_front", [-1.55, 0.04, 0.55], [1.7, 0.05, 0.05]],
  ["forbidden_left", [-2.38, 0.04, -0.2], [0.05, 0.05, 1.55]],
  ["forbidden_right", [-0.72, 0.04, -0.2], [0.05, 0.05, 1.55]],
]) schematicLine(key, "SCHEM · 禁止区", position, dimensions, ["schemForbidden"], COLORS.red);

// B7-01: structured strokes, not decorative random light spots.
for (const [key, position, dimensions] of [
  ["glyph_top", [-0.45, 2.4, -2.3], [1.5, 0.12, 0.06]],
  ["glyph_bottom", [-0.45, 1.12, -2.3], [1.5, 0.12, 0.06]],
  ["glyph_left", [-1.15, 1.76, -2.3], [0.12, 1.4, 0.06]],
  ["glyph_right", [0.25, 1.76, -2.3], [0.12, 1.4, 0.06]],
  ["glyph_mid_h", [-0.45, 1.78, -2.28], [1.35, 0.1, 0.06]],
  ["glyph_mid_v", [-0.45, 1.78, -2.28], [0.1, 1.2, 0.06]],
]) addObject(key, "box", "ACTION 01 · 字形光", { position, dimensions, color: COLORS.gold }, { groups: ["translateGlyph"] });

// B7-02: a side-wall window outside the canonical front framing.
addObject("side_window_pane", "box", "ACTION 02 · 画外侧窗", {
  position: [-3.0, 1.82, -0.72], dimensions: [0.05, 1.52, 1.42], color: COLORS.glass,
}, { groups: ["sideWindow"] });
for (const [key, position, dimensions] of [
  ["side_window_top", [-2.95, 2.58, -0.72], [0.09, 0.09, 1.58]],
  ["side_window_bottom", [-2.95, 1.06, -0.72], [0.09, 0.09, 1.58]],
  ["side_window_front", [-2.95, 1.82, 0.05], [0.09, 1.6, 0.09]],
  ["side_window_back", [-2.95, 1.82, -1.49], [0.09, 1.6, 0.09]],
  ["side_window_cross", [-2.93, 1.82, -0.72], [0.08, 0.07, 1.45]],
]) addObject(key, "box", "ACTION 02 · 侧窗框", { position, dimensions, color: COLORS.paper }, { groups: ["sideWindow"] });
for (const [key, position, dimensions] of [
  ["reframe_top", [0, 2.92, -2.25], [5.35, 0.05, 0.05]],
  ["reframe_bottom", [0, 0.32, -2.25], [5.35, 0.05, 0.05]],
  ["reframe_left", [-2.65, 1.62, -2.25], [0.05, 2.65, 0.05]],
  ["reframe_right", [2.65, 1.62, -2.25], [0.05, 2.65, 0.05]],
]) addObject(key, "box", "ACTION 02 · 原图边界", { position, dimensions, color: COLORS.white }, { groups: ["reframeBoundary"] });

// B7-03: an unresolved seam and a second, deliberately offset bed.
addObject("merge_seam", "box", "ACTION 03 · 未抹平接缝", {
  position: [0, 1.7, -2.24], dimensions: [0.07, 3.28, 0.07], color: COLORS.violet,
}, { groups: ["mergeExtras"] });
addObject("merge_bed", "box", "ACTION 03 · 第二张床", {
  position: [0.95, 0.63, -1.05], rotation: [0, -8, 0], dimensions: [1.16, 0.48, 2.0], color: COLORS.blanket,
}, { groups: ["mergeExtras"] });
addObject("merge_headboard", "box", "ACTION 03 · 第二床头", {
  position: [0.8, 0.72, -2.02], rotation: [0, -8, 0], dimensions: [1.24, 1.05, 0.1], color: COLORS.wood,
}, { groups: ["mergeExtras"] });

// B7-04: a marked counterfactual portal with nested corridor frames.
addObject("portal_void", "box", "ACTION 04 · 反事实入口", {
  position: [-0.55, 1.3, -2.28], dimensions: [2.0, 2.55, 0.08], color: COLORS.void,
}, { groups: ["portal"] });
for (let index = 0; index < 4; index += 1) {
  const width = 2 - index * 0.3;
  const height = 2.55 - index * 0.34;
  const z = -2.2 + index * 0.04;
  const x = -0.55;
  const y = 1.3;
  addObject(`portal_top_${index}`, "box", "ACTION 04 · 走廊标线", {
    position: [x, y + height / 2, z], dimensions: [width, 0.055, 0.055], color: COLORS.orange,
  }, { groups: ["portal"] });
  addObject(`portal_bottom_${index}`, "box", "ACTION 04 · 走廊标线", {
    position: [x, y - height / 2, z], dimensions: [width, 0.055, 0.055], color: COLORS.orange,
  }, { groups: ["portal"] });
  addObject(`portal_left_${index}`, "box", "ACTION 04 · 走廊标线", {
    position: [x - width / 2, y, z], dimensions: [0.055, height, 0.055], color: COLORS.orange,
  }, { groups: ["portal"] });
  addObject(`portal_right_${index}`, "box", "ACTION 04 · 走廊标线", {
    position: [x + width / 2, y, z], dimensions: [0.055, height, 0.055], color: COLORS.orange,
  }, { groups: ["portal"] });
}

// B8: one shared window. Its epistemic status comes from visible seams/evidence, not a new room.
addObject("back_window_pane", "box", "ENDING · 同一扇重建窗", {
  position: [-0.42, 1.78, -2.32], dimensions: [1.72, 1.52, 0.05], color: COLORS.glass,
}, { groups: ["backWindow"] });
for (const [key, position, dimensions] of [
  ["back_window_top", [-0.42, 2.57, -2.24], [1.92, 0.12, 0.08]],
  ["back_window_bottom", [-0.42, 0.99, -2.24], [1.92, 0.12, 0.08]],
  ["back_window_left", [-1.32, 1.78, -2.24], [0.12, 1.68, 0.08]],
  ["back_window_right", [0.48, 1.78, -2.24], [0.12, 1.68, 0.08]],
  ["back_window_cross_h", [-0.42, 1.78, -2.19], [1.7, 0.08, 0.07]],
  ["back_window_cross_v", [-0.42, 1.78, -2.19], [0.08, 1.48, 0.07]],
]) addObject(key, "box", "ENDING · 重建窗框", { position, dimensions, color: COLORS.paper }, { groups: ["backWindow"] });

for (const [key, position, dimensions] of [
  ["seam_top", [-0.34, 2.69, -2.12], [2.06, 0.055, 0.055]],
  ["seam_bottom", [-0.5, 0.88, -2.12], [1.98, 0.055, 0.055]],
  ["seam_left", [-1.45, 1.8, -2.12], [0.055, 1.86, 0.055]],
  ["seam_right", [0.63, 1.7, -2.12], [0.055, 1.7, 0.055]],
]) addObject(key, "box", "ENDING 01 · 可见缝合", { position, dimensions, color: COLORS.violet }, { groups: ["authSeams"] });

addObject("evidence_paper", "box", "ENDING 01 · 原始照片并置", {
  position: [-2.2, 1.58, -2.22], dimensions: [1.25, 0.96, 0.07], color: COLORS.paper,
}, { groups: ["evidencePanel"] });
addObject("evidence_image", "box", "ENDING 01 · 封闭墙证物", {
  position: [-2.2, 1.58, -2.16], dimensions: [1.08, 0.78, 0.04], color: COLORS.plasterShadow,
}, { groups: ["evidencePanel"] });
addObject("misread_light_wall", "box", "ENDING 02 · 无缝暖光", {
  position: [1.2, 1.35, -2.18], rotation: [0, 0, -12], dimensions: [2.5, 0.36, 0.04], color: COLORS.gold,
}, { groups: ["misreadLight"] });
addObject("misread_light_floor", "box", "ENDING 02 · 地面暖光", {
  position: [0.5, 0.04, -0.2], rotation: [0, -12, 0], dimensions: [2.5, 0.04, 1.0], color: COLORS.gold,
}, { groups: ["misreadLight"] });
addObject("withheld_edge", "box", "OPACITY · 光停在墙边", {
  position: [-3.0, 1.4, -2.22], dimensions: [0.08, 2.55, 0.06], color: COLORS.paper,
}, { groups: ["withheldEdge"] });

const configureProp = (id, state) => {
  const object = objects.find((candidate) => candidate.id === id);
  if (!object) return;
  object.entity = createEntityConfig("prop", {
    state,
    capabilities: {
      movable: true,
      rotatable: true,
      scalable: true,
      visibility: true,
      speakable: false,
      grabbable: false,
    },
    physics: { bodyType: "kinematic", mass: 1, friction: 0.5, restitution: 0 },
  });
};

for (const key of [
  "bed_mattress", "bed_blanket", "bed_pillow", "bed_headboard", "bed_footboard",
  "bed_rail_l", "bed_rail_r", "leg_lh", "leg_rh", "leg_lf", "leg_rf",
]) configureProp(ids.get(key), "原房间物品 · 可改写但不可代替人物");

for (const [groupName, state] of [
  ["memorySeam", "身体证词 · 垂直记忆光缝 · 无可见开口"],
  ["memoryPool", "身体证词 · 光抵达地面 · 无可见来源"],
  ["waveform", "被扣留的重演语句"],
  ["evidencePhoto", "三种不等证据 01 · 未改动照片"],
  ["evidenceVoice", "三种不等证据 02 · 重演声音 · 非原始音频"],
  ["evidenceCup", "三种不等证据 03 · 留存物件"],
  ["schemWindow", "假想物品 · 尚未获准"],
  ["translateGlyph", "动作 01 · 转译"],
  ["sideWindow", "动作 02 · 画外推断"],
  ["mergeExtras", "动作 03 · 矛盾并置"],
  ["portal", "动作 04 · 明示反事实"],
  ["withheldEdge", "动作 05 · 停止推断"],
  ["backWindow", "结尾共用重建窗"],
  ["authSeams", "获准重建 · 可见接缝"],
  ["evidencePanel", "未改动证物的空间占位"],
  ["misreadLight", "误读结尾 · 无缝诱惑"],
]) {
  groups.get(groupName)?.forEach((id) => configureProp(id, state));
}

const shotManifest = [
  { id: "B1-01", start: 0, duration: 12, preset: "front", groups: [], note: "请求；黑场由空 3D 视口承担。" },
  { id: "B2-01", start: 12, duration: 18, preset: "front", groups: ["base"], note: "唯一底板。16 秒证物镜头加 2 秒未分配停顿，以对齐 2:46。" },
  { id: "B3-01", start: 30, duration: 9, preset: "front", groups: ["base", "memorySeam"], note: "封闭墙上出现垂直记忆光缝，但没有开口。" },
  { id: "B3-02", start: 39, duration: 9, preset: "front", groups: ["base", "memorySeam", "memoryPool"], note: "同一镜位，光抵达地面。" },
  { id: "B4-01", start: 48, duration: 7, preset: "front", framing: 0.78, target: "target_evidence", groups: ["evidenceBackdrop", "evidencePhoto", "evidenceCup"], note: "三种不等证据：未改动照片与留存杯子先出现。" },
  { id: "B4-02", start: 55, duration: 7, preset: "front", framing: 0.78, target: "target_evidence", groups: ["evidenceBackdrop", "evidencePhoto", "evidenceCup", "evidenceVoice"], note: "重演声音加入；明确不是原始音频。" },
  { id: "B5-01", start: 62, duration: 10, preset: "front", groups: [], note: "唯一问题；完全静与黑。" },
  { id: "B6-01", start: 72, duration: 6, preset: "front", framing: 0.8, target: "target_roles", groups: ["roleBackdrop", "rolePositions"], note: "四个不等席位：见证者、改写者、许可守护者、档案员。" },
  { id: "B6-02", start: 78, duration: 6, preset: "front", framing: 0.8, target: "target_roles", groups: ["roleBackdrop", "rolePositions", "roleGuard"], note: "档案员席位可空缺；红色边界表示许可约束。" },
  { id: "B6-03", start: 84, duration: 6, preset: "front", framing: 0.8, target: "target_roles", groups: ["roleBackdrop", "role_archivist"], note: "人物撤出，仅留下可被临时非人声音占位的档案员空席。" },
  { id: "B7-01", start: 90, duration: 8, preset: "front", groups: ["base", "translateGlyph"], note: "TRANSLATE：字形结构成为光。" },
  { id: "B7-02", start: 98, duration: 8, preset: "perspective", framing: 0.78, target: "side_window_pane", groups: ["base", "sideWindow", "reframeBoundary"], note: "REFRAME：原证物不动，只移动视角。" },
  { id: "B7-03", start: 106, duration: 8, preset: "front", groups: ["base", "sideWindow", "mergeExtras"], note: "MERGE：两张床与接缝并存。" },
  { id: "B7-04", start: 114, duration: 8, preset: "perspective", framing: 0.68, target: "portal_void", groups: ["base", "portal"], note: "CONTINUE：反事实走廊明确标注。" },
  { id: "B7-05", start: 122, duration: 8, preset: "front", groups: ["schemCore", "withheldEdge", "waveform"], note: "KEEP OPAQUE：生成层退场。" },
  { id: "B8-01", start: 130, duration: 8, preset: "front", groups: ["base", "backWindow", "authSeams", "evidencePanel"], note: "AUTHORISED：同一扇窗带明显缝合与证物并置。" },
  { id: "B8-02", start: 138, duration: 8, preset: "front", groups: ["base", "backWindow", "misreadLight"], note: "MISREADING：移除全部接缝，留下漂亮的谎。" },
  { id: "B8-03", start: 146, duration: 8, preset: "front", groups: ["schemCore", "withheldEdge", "waveform"], note: "OPACITY：拒绝与其他结尾等长。" },
  { id: "B9-01", start: 154, duration: 12, preset: "front", groups: ["base"], note: "回到同一封闭房间，未改变底板。" },
];

const clips = [];
let lineCounter = 1;
const currentVisibility = new Map(objects.map((object) => [object.id, object.visible]));

const groupUnion = (groupNames) => {
  const result = new Set();
  groupNames.forEach((groupName) => groups.get(groupName)?.forEach((id) => result.add(id)));
  return result;
};

for (const shot of shotManifest) {
  const targetId = shot.target ? ids.get(shot.target) : null;
  const framing = shot.framing ?? (shot.preset === "front" && shot.groups.length ? 0.68 : 1);
  const fromFraming = Math.min(4, Math.max(0.25, shot.fromFraming ?? framing * 1.12));
  clips.push({
    id: `camera-${shot.id.toLowerCase()}`,
    type: "camera",
    track: "camera",
    label: `${shot.id} · ${shot.note.split("：")[0].replace(/。$/, "")}`,
    line: lineCounter++,
    start: shot.start,
    duration: shot.duration,
    targetId,
    preset: shot.preset,
    fromPreset: shot.preset,
    fromTargetId: targetId,
    framing,
    fromFraming,
  });

  const wanted = groupUnion(shot.groups);
  for (const id of displayIds) {
    const nextVisible = wanted.has(id);
    if (currentVisibility.get(id) === nextVisible) continue;
    const object = objects.find((candidate) => candidate.id === id);
    clips.push({
      id: `visibility-${shot.id.toLowerCase()}-${id}`,
      type: "visibility",
      track: object.entity.role === "character"
        ? "character"
        : object.entity.role === "prop" ? "prop" : "environment",
      label: `${shot.id} · ${nextVisible ? "显示" : "隐藏"} ${object.name}`,
      line: lineCounter++,
      start: shot.start,
      duration: 0.05,
      targetId: id,
      from: currentVisibility.get(id),
      to: nextVisible,
    });
    currentVisibility.set(id, nextVisible);
  }
}

// Continuity choreography: the first render deliberately proved every state, but
// hard visibility switches read like slides. These clips give the same objects
// entrances, exits and internal motion while preserving the locked shot timing.
const trackForObject = (object) => object.entity.role === "character"
  ? "character"
  : object.entity.role === "prop" ? "prop" : "environment";

const addAnimationClip = ({ type, id, label, start, duration, from, to }) => {
  const object = objects.find((candidate) => candidate.id === id);
  if (!object) return;
  clips.push({
    id: `continuity-${type}-${lineCounter}-${id}`,
    type,
    track: trackForObject(object),
    label,
    line: lineCounter++,
    start,
    duration,
    targetId: id,
    from,
    to,
  });
};

const addScaleById = (id, start, duration, from, to = [1, 1, 1], label = "连续性 · 缩放") => {
  addAnimationClip({ type: "scale", id, label, start, duration, from, to });
};

const addMoveById = (id, start, duration, offset, label = "连续性 · 入场") => {
  const object = objects.find((candidate) => candidate.id === id);
  if (!object) return;
  const to = [...object.position];
  const from = to.map((value, axis) => value + offset[axis]);
  addAnimationClip({ type: "move", id, label, start, duration, from, to });
};

const idsForGroup = (groupName) => [...(groups.get(groupName) ?? [])];
const primeAndScaleIn = (
  groupName,
  start,
  duration,
  stagger = 0,
  from = [0.015, 0.015, 0.015],
  primeStart = start,
) => {
  idsForGroup(groupName).forEach((id, index) => {
    addScaleById(id, primeStart, 0.05, from, from, `连续性 · ${groupName} 预备`);
    addScaleById(id, start + 0.06 + index * stagger, duration, from, [1, 1, 1], `连续性 · ${groupName} 建立`);
  });
};
const scaleOutGroup = (groupName, start, duration, to = [0.015, 0.015, 0.015]) => {
  idsForGroup(groupName).forEach((id) => {
    addScaleById(id, start, duration, [1, 1, 1], to, `连续性 · ${groupName} 退场`);
  });
};

addScaleById(ids.get("memory_light_wall"), 30.2, 1.55, [1, 0.015, 1], [1, 1, 1], "记忆光缝 · 自下而上建立");
addScaleById(ids.get("memory_light_bed"), 39.18, 1.35, [0.015, 1, 0.015], [1, 1, 1], "地面光池 · 从光缝扩散");

addScaleById(ids.get("evidence_backplate"), 48.05, 0.95, [0.12, 1, 1], [1, 1, 1], "证物台 · 展开");
idsForGroup("evidencePhoto").forEach((id, index) => addMoveById(id, 48, 1.08 + index * 0.08, [-0.72, 0.1, 0], "照片证物 · 滑入"));
idsForGroup("evidenceCup").forEach((id, index) => addMoveById(id, 48, 1.15 + index * 0.06, [0.58, -0.28, 0], "留存杯子 · 抵达证物线"));
addMoveById(ids.get("trace_voice_panel"), 55, 1.05, [0.78, 0.52, 0], "重演声音面板 · 进入");
idsForGroup("evidenceVoice")
  .filter((id) => id !== ids.get("trace_voice_panel"))
  .forEach((id, index) => {
    addScaleById(id, 55, 0.05, [1, 0.015, 1], [1, 0.015, 1], "重演声音 · 静音预备");
    addScaleById(id, 55.25 + index * 0.035, 0.55, [1, 0.015, 1], [1, 1, 1], "重演声音 · 波形逐段建立");
  });
for (const groupName of ["evidenceBackdrop", "evidencePhoto", "evidenceVoice", "evidenceCup"]) {
  scaleOutGroup(groupName, 60.82, 1.05);
}

primeAndScaleIn("roleBackdrop", 72, 0.7, 0.035, [0.04, 1, 1]);
primeAndScaleIn("role_witness", 72.42, 0.72, 0.03, [0.015, 0.015, 0.015], 72);
primeAndScaleIn("role_rewriter", 73.02, 0.72, 0.03, [0.015, 0.015, 0.015], 72);
primeAndScaleIn("role_guardian", 73.62, 0.72, 0.03, [0.015, 0.015, 0.015], 72);
primeAndScaleIn("role_archivist", 74.22, 0.58, 0.012, [0.015, 0.015, 0.015], 72);
primeAndScaleIn("roleGuard", 78, 0.68, 0.035, [0.04, 0.04, 1]);
for (const groupName of ["role_witness", "role_rewriter", "role_guardian"]) {
  scaleOutGroup(groupName, 82.72, 1.08);
}
for (const groupName of ["roleBackdrop", "role_archivist"]) {
  scaleOutGroup(groupName, 88.72, 1.08);
}

primeAndScaleIn("translateGlyph", 90, 0.72, 0.075, [0.04, 0.04, 1]);
primeAndScaleIn("sideWindow", 98, 0.82, 0.045, [0.04, 0.04, 1]);
primeAndScaleIn("reframeBoundary", 98, 0.78, 0.065, [0.04, 0.04, 1]);
primeAndScaleIn("mergeExtras", 106, 0.92, 0.12, [0.04, 0.04, 1]);
primeAndScaleIn("portal", 114, 0.68, 0.035, [0.04, 0.04, 1]);
primeAndScaleIn("schemCore", 122, 0.72, 0.035, [0.04, 0.04, 1]);
primeAndScaleIn("withheldEdge", 122, 0.68, 0, [1, 0.04, 1]);
primeAndScaleIn("waveform", 122, 0.58, 0.045, [1, 0.04, 1]);

primeAndScaleIn("backWindow", 130, 0.76, 0.05, [0.04, 0.04, 1]);
primeAndScaleIn("authSeams", 130, 0.64, 0.08, [0.04, 0.04, 1]);
idsForGroup("evidencePanel").forEach((id, index) => addMoveById(id, 130, 0.9 + index * 0.08, [-0.65, 0, 0], "获准结尾 · 原证物滑入"));
scaleOutGroup("authSeams", 136.82, 0.98);
scaleOutGroup("evidencePanel", 136.82, 0.98);
primeAndScaleIn("misreadLight", 138, 1.0, 0.08, [0.04, 0.04, 1]);
primeAndScaleIn("schemCore", 146, 0.74, 0.03, [0.04, 0.04, 1]);
primeAndScaleIn("withheldEdge", 146, 0.62, 0, [1, 0.04, 1]);
primeAndScaleIn("waveform", 146, 0.56, 0.04, [1, 0.04, 1]);

const screenplay = `# 《不存在的窗》3D 预演 · 手工锁定时间线
# 重要：本项目的 19 镜时间线直接按 00:00–02:46 写入 JSON。
# 若点击“编译时间线”，会覆盖精确状态切换；修改镜头后请重新运行构建脚本。
${shotManifest.map((shot) => `# ${String(Math.floor(shot.start / 60)).padStart(2, "0")}:${String(shot.start % 60).padStart(2, "0")}  ${shot.id}  ${shot.note}`).join("\n")}`;

const referenceBytes = fs.readFileSync(referencePath);
const referenceDataUrl = `data:image/png;base64,${referenceBytes.toString("base64")}`;

const project = normalizeProject({
  schemaVersion: 3,
  id: "project-window-that-wasnt-there-v1",
  name: "不存在的窗 · 2:46 三维预演",
  stage: "screenplay",
  updatedAt: new Date().toISOString(),
  reference: {
    dataUrl: referenceDataUrl,
    name: "B2 唯一底板 · 封闭墙",
    width: 1536,
    height: 1024,
    opacity: 0.28,
    visible: false,
    prompt: "构造测试案例。原始照片层在叙事内部永不改动；所有 3D 分支必须共享同一房间、床与墙体比例。",
  },
  breakdown: [
    { id: "part-room", name: "封闭房间壳体", type: "box", objectId: ids.get("back_wall") },
    { id: "part-bed", name: "右侧单人床", type: "box", objectId: ids.get("bed_mattress") },
    { id: "part-memory-light", name: "身体记得的光", type: "box", objectId: ids.get("memory_light_wall") },
    { id: "part-evidence-photo", name: "证据 01 · 未改动照片", type: "box", objectId: ids.get("trace_photo_paper") },
    { id: "part-evidence-voice", name: "证据 02 · 重演声音", type: "box", objectId: ids.get("trace_voice_panel") },
    { id: "part-evidence-cup", name: "证据 03 · 留存杯子", type: "cylinder", objectId: ids.get("trace_cup_body") },
    { id: "part-role-witness", name: "角色席位 · 见证者", type: "sphere", objectId: rolePositionIds.get("witness") },
    { id: "part-role-rewriter", name: "角色席位 · 改写者", type: "sphere", objectId: rolePositionIds.get("rewriter") },
    { id: "part-role-guardian", name: "角色席位 · 许可守护者", type: "sphere", objectId: rolePositionIds.get("guardian") },
    { id: "part-role-archivist", name: "角色席位 · 档案员空缺", type: "box", objectId: rolePositionIds.get("archivist") },
    { id: "part-schematic", name: "权限线稿层", type: "box", objectId: ids.get("schem_back_top") },
    { id: "part-window", name: "可授权的重建窗", type: "box", objectId: ids.get("back_window_pane") },
    { id: "part-corridor", name: "反事实走廊", type: "box", objectId: ids.get("portal_void") },
    { id: "part-evidence-ending", name: "结尾原始证物并置板", type: "box", objectId: ids.get("evidence_paper") },
  ],
  objects,
  director: {
    screenplay,
    timeline: {
      duration: 166,
      clips,
      issues: [],
      compiledScript: screenplay,
      compiledAt: new Date().toISOString(),
    },
  },
});

fs.writeFileSync(outputPath, serializeProject(project), "utf8");
fs.writeFileSync(manifestPath, `${JSON.stringify({
  title: "不存在的窗 / The Window That Wasn't There",
  duration: 166,
  fps: 24,
  canonicalRoomObjectIds: [...(groups.get("base") ?? [])],
  entities: {
    visibleCharacters: 4,
    characterSlots: [...rolePositionIds.values()],
    characterObjectIds: project.objects.filter((object) => object.entity.role === "character").map((object) => object.id),
    roles: [
      { key: "witness", label: "见证者 / Witness", objectId: rolePositionIds.get("witness") },
      { key: "rewriter", label: "改写者 / Rewriter", objectId: rolePositionIds.get("rewriter") },
      { key: "guardian", label: "许可守护者 / Consent Guardian", objectId: rolePositionIds.get("guardian") },
      { key: "archivist", label: "档案员 / Archivist · 空缺", objectId: rolePositionIds.get("archivist") },
    ],
    evidenceTraces: [
      { key: "photograph", label: "未改动照片", objectId: ids.get("trace_photo_paper") },
      { key: "reenacted-voice", label: "重演声音 · 非原始音频", objectId: ids.get("trace_voice_panel") },
      { key: "retained-cup", label: "留存杯子", objectId: ids.get("trace_cup_body") },
    ],
    propObjectIds: project.objects.filter((object) => object.entity.role === "prop").map((object) => object.id),
    environmentObjectIds: project.objects.filter((object) => object.entity.role === "environment").map((object) => object.id),
  },
  shots: shotManifest,
}, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({
  ok: true,
  outputPath,
  manifestPath,
  objectCount: project.objects.length,
  clipCount: project.director.timeline.clips.length,
  shotCount: shotManifest.length,
  duration: project.director.timeline.duration,
  referenceBytes: referenceBytes.length,
}, null, 2)}\n`);
