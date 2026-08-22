import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBreakdownItem, createEntityConfig, createSceneObject, normalizeProject } from "../src/model.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const caseRoot = path.join(projectRoot, "projects", "window-case");
const referencePath = path.join(caseRoot, "source", "b2-photograph-closed-wall.png");
const outputPath = path.join(caseRoot, "window-that-wasnt-there.blockout.json");
const manifestPath = path.join(caseRoot, "shot-manifest.json");

if (!fs.existsSync(referencePath)) throw new Error(`缺少唯一底板：${referencePath}`);

const referenceDataUrl = `data:image/png;base64,${fs.readFileSync(referencePath).toString("base64")}`;
const COLORS = Object.freeze({
  wall: "#565650",
  wallDark: "#343735",
  floor: "#4c392c",
  wood: "#342820",
  fabric: "#4f5353",
  paper: "#ded6c4",
  dark: "#0b0d0d",
  cyan: "#68c4d6",
  gold: "#e2bd63",
  red: "#df7c83",
  violet: "#9b8bd3",
  orange: "#df9b58",
  white: "#eee9df",
});

const material = {
  wall: { roughness: 0.96, metalness: 0, edge: false },
  wood: { roughness: 0.82, metalness: 0.02, edge: false },
  fabric: { roughness: 1, metalness: 0, edge: false },
  metal: { roughness: 0.28, metalness: 0.72, edge: false },
  paper: { roughness: 0.84, metalness: 0, edge: false },
  glow: (color, intensity = 3.6, opacity = 1, light = null) => ({
    roughness: 0.24,
    metalness: 0.08,
    emissive: color,
    emissiveIntensity: intensity,
    opacity,
    edge: false,
    light,
  }),
  glass: (color, opacity = 0.18, intensity = 1.3) => ({
    roughness: 0.15,
    metalness: 0.08,
    emissive: color,
    emissiveIntensity: intensity,
    opacity,
    edge: false,
  }),
};

const objects = [];
const ids = new Map();
const groups = new Map();
const objectState = new Map();

const registerGroup = (name, id) => {
  if (!groups.has(name)) groups.set(name, []);
  groups.get(name).push(id);
};

const addObject = (key, type, name, config, groupNames = []) => {
  const id = `sandbox-${key}`;
  const object = createSceneObject(type, { id, name, ...config });
  objects.push(object);
  ids.set(key, id);
  objectState.set(id, {
    position: [...object.position],
    rotation: [...object.rotation],
    scale: [...object.scale],
    visible: object.visible,
  });
  for (const group of groupNames) registerGroup(group, id);
  return id;
};

const environmentEntity = (state = "电影沙盒固定场景") => createEntityConfig("environment", { state });
const propEntity = (state = "可被角色代理操作") => createEntityConfig("prop", {
  state,
  interaction: { trigger: "click", action: "pulse", amount: 1.18 },
});
const characterEntity = (state) => createEntityConfig("character", {
  state,
  interaction: { trigger: "click", action: "pulse", amount: 1.12 },
});

// One continuous room. The front stays open so the camera can enter and leave it like a game level.
addObject("floor", "plane", "ROOM · 连续木地板", {
  position: [0, -0.1, 0.45], dimensions: [10, 0.2, 7.3], color: COLORS.floor,
  locked: true, render: material.wood, entity: environmentEntity(),
}, ["room"]);
for (let index = 0; index < 10; index += 1) {
  addObject(`floor_plank_${index}`, "box", "ROOM · 地板木条", {
    position: [-4.5 + index, 0.015, 0.45], dimensions: [0.94, 0.035, 7.15],
    color: index % 2 ? "#4a372a" : "#554032", locked: true,
    render: material.wood, entity: environmentEntity(),
  }, ["room"]);
}
addObject("back_wall", "box", "ROOM · 始终封闭的后墙", {
  position: [0, 2.5, -3.18], dimensions: [10, 5, 0.22], color: COLORS.wall,
  locked: true, render: material.wall, entity: environmentEntity("唯一连续墙面"),
}, ["room"]);
addObject("left_wall", "box", "ROOM · 左墙", {
  position: [-4.92, 2.5, 0.45], dimensions: [0.18, 5, 7.3], color: "#4c504e",
  locked: true, render: material.wall, entity: environmentEntity(),
}, ["room"]);
addObject("right_return", "box", "ROOM · 右墙回折", {
  position: [4.92, 2.5, -1.75], dimensions: [0.18, 5, 2.7], color: "#454947",
  locked: true, render: material.wall, entity: environmentEntity(),
}, ["room"]);
addObject("baseboard_back", "box", "ROOM · 后墙踢脚线", {
  position: [0, 0.18, -3.01], dimensions: [9.8, 0.25, 0.12], color: "#292a27",
  locked: true, render: material.wood, entity: environmentEntity(),
}, ["room"]);
for (const [index, stain] of [
  [[-3.1, 2.9, -3.045], [1.45, 1.15, 0.025], "#464946"],
  [[1.5, 3.45, -3.045], [2.2, 0.65, 0.025], "#4a4c48"],
  [[0.1, 1.25, -3.04], [1.7, 0.35, 0.025], "#50504a"],
].entries()) {
  addObject(`wall_stain_${index}`, "box", "ROOM · 墙面旧痕", {
    position: stain[0], dimensions: stain[1], color: stain[2], locked: true,
    render: { ...material.wall, opacity: 0.36 }, entity: environmentEntity(),
  }, ["room"]);
}

// Foreground door gives the camera a physical threshold to cross.
for (const [key, position, dimensions] of [
  ["door_left", [-1.72, 2.45, 4.02], [0.24, 4.9, 0.32]],
  ["door_right", [1.72, 2.45, 4.02], [0.24, 4.9, 0.32]],
  ["door_top", [0, 4.72, 4.02], [3.68, 0.34, 0.32]],
]) addObject(key, "box", "ROOM · 摄影机入口框", {
  position, dimensions, color: "#242624", locked: true, render: material.wood, entity: environmentEntity(),
}, ["room"]);

// Bed and cloth are persistent geography, not a slide-specific prop.
addObject("bed_frame", "box", "ROOM · 床架", {
  position: [3.15, 0.42, -1.1], dimensions: [2.25, 0.32, 3.25], color: "#29241f",
  render: material.wood, entity: environmentEntity(),
}, ["room", "bed"]);
addObject("bed_mattress", "box", "ROOM · 床垫", {
  position: [3.15, 0.72, -1.1], dimensions: [2.16, 0.4, 3.12], color: "#696a65",
  render: material.fabric, entity: propEntity("空间锚点 · 不移动"),
}, ["room", "bed"]);
addObject("bed_blanket", "box", "ROOM · 灰毯", {
  position: [3.15, 0.97, -0.78], dimensions: [2.1, 0.14, 2.12], color: COLORS.fabric,
  rotation: [0, 1.5, 0], render: material.fabric, entity: propEntity("被光触发的布料表面"),
}, ["room", "bed"]);
addObject("bed_pillow", "box", "ROOM · 枕头", {
  position: [3.15, 1.03, -2.15], dimensions: [1.12, 0.24, 0.68], color: "#88877f",
  rotation: [0, -5, 0], render: material.fabric, entity: propEntity(),
}, ["room", "bed"]);
addObject("bed_headboard", "box", "ROOM · 床头", {
  position: [3.15, 1.16, -2.65], dimensions: [2.32, 1.58, 0.16], color: "#302720",
  render: material.wood, entity: environmentEntity(),
}, ["room", "bed"]);
for (const x of [2.22, 4.08]) for (const z of [-2.42, 0.22]) {
  addObject(`bed_leg_${x}_${z}`, "box", "ROOM · 床腿", {
    position: [x, 0.22, z], dimensions: [0.12, 0.42, 0.12], color: "#25211d",
    render: material.wood, entity: environmentEntity(),
  }, ["room", "bed"]);
}

// Physical evidence table: unchanged photo, recorder and retained cup.
addObject("table_top", "box", "PROP · 证物木桌", {
  position: [-2.55, 0.92, 0.05], dimensions: [3.25, 0.18, 1.42], color: COLORS.wood,
  render: material.wood, entity: environmentEntity(),
}, ["room", "table"]);
for (const [index, x] of [-3.9, -1.2].entries()) for (const z of [-0.44, 0.54]) {
  addObject(`table_leg_${index}_${z}`, "box", "PROP · 桌腿", {
    position: [x, 0.45, z], dimensions: [0.14, 0.9, 0.14], color: "#2b211c",
    render: material.wood, entity: environmentEntity(),
  }, ["room", "table"]);
}
const photoFrame = addObject("photo_frame", "box", "PROP · 未改动照片相框", {
  position: [-2.95, 1.72, -0.12], dimensions: [2.35, 1.42, 0.07], color: COLORS.paper,
  rotation: [0, -3, 0], render: material.paper, entity: propEntity("原始证物 · 可搬运不可改图"),
}, ["photo", "evidence"]);
const photoImage = addObject("photo_image", "box", "PROP · 唯一存世照片", {
  position: [-2.95, 1.72, -0.075], dimensions: [2.12, 1.19, 0.025], color: COLORS.white,
  rotation: [0, -3, 0], render: { ...material.paper, textureDataUrl: referenceDataUrl },
  entity: propEntity("原始像素保持不变"),
}, ["photo", "evidence"]);
const recorder = addObject("recorder", "box", "PROP · 重演录音器", {
  position: [-1.62, 1.09, 0.16], dimensions: [1.12, 0.16, 0.64], color: "#171a1a",
  render: { ...material.metal, metalness: 0.42 }, entity: propEntity("非原始音频 · 可被阻断"),
  interactionSpec: {
    anchors: {
      inspect: [-0.18, 0.13, 0.34],
      interrupt: [0.34, 0.13, 0.34],
    },
    affordances: {
      inspect: {
        action: "inspect_reenactment",
        targetAnchor: "inspect",
        actorNode: "effector",
        maxDistance: 1.5,
        resultingState: "重演被见证代理激活",
      },
      interrupt: {
        action: "interrupt_unlicensed_audio",
        targetAnchor: "interrupt",
        actorNode: "effector",
        maxDistance: 2.2,
        resultingState: "无许可音频被守护代理切断",
      },
    },
  },
}, ["recorder", "evidence"]);
const waveformIds = [];
const waveHeights = [0.14, 0.32, 0.2, 0.48, 0.26, 0.4, 0.18, 0.52, 0.22, 0.36, 0.16, 0.28];
for (const [index, height] of waveHeights.entries()) {
  waveformIds.push(addObject(`recorder_wave_${index}`, "box", "PROP · 录音器波形", {
    position: [-2.04 + index * 0.078, 1.21 + height * 0.24, 0.03],
    dimensions: [0.032, height, 0.035], color: COLORS.violet, visible: false,
    render: material.glow(COLORS.violet, 4.2), entity: propEntity("被守护代理截断"),
  }, ["recorder", "waveform"]));
}
const cupBody = addObject("cup_body", "cylinder", "PROP · 留存杯子", {
  position: [-1.1, 1.31, 0.02], dimensions: [0.48, 0.56, 0.48], color: "#a8a49a",
  render: { ...material.metal, metalness: 0.38 }, entity: propEntity("冲突时会被碰歪"),
}, ["cup", "evidence"]);
for (const [key, position, rotation] of [
  ["cup_handle_top", [-0.82, 1.48, 0.02], [0, 0, -18]],
  ["cup_handle_side", [-0.7, 1.3, 0.02], [0, 0, 0]],
  ["cup_handle_bottom", [-0.82, 1.12, 0.02], [0, 0, 18]],
]) addObject(key, "box", "PROP · 杯柄", {
  position, dimensions: key.endsWith("side") ? [0.08, 0.38, 0.1] : [0.36, 0.08, 0.1],
  rotation, color: "#aaa69d", render: material.metal, entity: propEntity(),
}, ["cup", "evidence"]);

// A real side-wall window exists outside the initial camera framing.
addObject("side_window_pane", "box", "WORLD · 原画框外侧窗", {
  position: [-4.79, 2.55, 1.64], dimensions: [0.035, 1.9, 1.56], color: "#223035",
  render: material.glass(COLORS.cyan, 0.22, 1.4), entity: environmentEntity("一直存在但最初看不见"),
}, ["sideWindow"]);
for (const [key, position, dimensions] of [
  ["side_window_top", [-4.75, 3.5, 1.64], [0.12, 0.11, 1.76]],
  ["side_window_bottom", [-4.75, 1.6, 1.64], [0.12, 0.11, 1.76]],
  ["side_window_front", [-4.75, 2.55, 0.81], [0.12, 2.0, 0.11]],
  ["side_window_back", [-4.75, 2.55, 2.47], [0.12, 2.0, 0.11]],
  ["side_window_cross", [-4.72, 2.55, 1.64], [0.1, 0.07, 1.58]],
]) addObject(key, "box", "WORLD · 侧窗框", {
  position, dimensions, color: "#b8b1a2", render: material.wood, entity: environmentEntity(),
}, ["sideWindow"]);
const sideShutterA = addObject("side_shutter_a", "box", "WORLD · 侧窗遮板 A", {
  position: [-4.67, 2.55, 1.25], dimensions: [0.045, 1.78, 0.74], color: "#3a3d3b",
  render: material.wall, entity: propEntity("可滑开的遮板"),
}, ["sideWindow"]);
const sideShutterB = addObject("side_shutter_b", "box", "WORLD · 侧窗遮板 B", {
  position: [-4.67, 2.55, 2.03], dimensions: [0.045, 1.78, 0.74], color: "#3a3d3b",
  render: material.wall, entity: propEntity("可滑开的遮板"),
}, ["sideWindow"]);

const agentDefinitions = new Map();
const createAgent = (key, label, color, origin, state) => {
  const parts = [];
  const offsets = new Map();
  const phase = ({ witness: 0.25, rewriter: 1.65, guardian: 3.1, archivist: 4.45 })[key] ?? 0;
  const root = addObject(`${key}_root`, "group", `AGENT · ${label} · 角色根节点`, {
    position: origin,
    dimensions: [1, 1, 1],
    color,
    visible: false,
    entity: characterEntity(state),
    motion: {
      kind: "hover",
      hoverAmplitude: key === "guardian" ? 0.045 : 0.032,
      hoverFrequency: key === "guardian" ? 0.94 : 0.72,
      leanDegrees: key === "guardian" ? 6.5 : 4.5,
      bankDegrees: key === "guardian" ? 7 : 5,
      phase,
    },
    asset: {
      url: null,
      scale: 1,
      forwardAxis: "-Z",
      nodes: { root: "Root", head: "Head", effector: "Probe", statusLight: "Beacon" },
      animations: { idle: "Idle", move: "Move", interact: "Interact", react: "React" },
    },
    interactionSpec: {
      anchors: {
        gaze: [0, 1.36, -0.38],
        effector: [0.72, 1.06, 0],
        carry: [0, 0.92, -0.72],
      },
    },
  }, [`agent_${key}`, "agents"]);
  const addPart = (part, type, partLabel, offset, dimensions, config = {}) => {
    const id = addObject(`${key}_${part}`, type, `AGENT · ${label} · ${partLabel}`, {
      parentId: root,
      nodeRole: config.nodeRole ?? part,
      position: offset,
      dimensions,
      color,
      visible: true,
      render: config.render ?? material.metal,
      entity: characterEntity(state),
      rotation: config.rotation ?? [0, 0, 0],
    });
    parts.push(id);
    offsets.set(id, offset);
    return id;
  };
  const base = addPart("base", "cylinder", "磁悬底座", [0, 0.2, 0], [0.86, 0.28, 0.86], { nodeRole: "base" });
  addPart("torso", "cylinder", "机身", [0, 0.78, 0], [0.58, 0.82, 0.58], { nodeRole: "torso" });
  const head = addPart("head", "sphere", "感知核心", [0, 1.35, 0], [0.66, 0.52, 0.66], { nodeRole: "head" });
  const lens = addPart("lens", "sphere", "前向镜头", [0, 1.36, -0.32], [0.22, 0.18, 0.14], {
    render: material.glow(color, 0.9, 1), nodeRole: "lens",
  });
  addPart("rail_l", "box", "左侧工具轨", [-0.44, 0.83, 0], [0.18, 0.64, 0.18], { nodeRole: "toolRailLeft" });
  addPart("rail_r", "box", "右侧工具轨", [0.44, 0.83, 0], [0.18, 0.64, 0.18], { nodeRole: "toolRailRight" });
  const probe = addPart("probe", "box", "可伸缩探针", [0.48, 1.06, 0], [0.48, 0.09, 0.09], {
    render: material.glow(color, 1.5, 1), rotation: [0, 0, 0], nodeRole: "probe",
  });
  addPart("antenna", "cylinder", "天线", [0, 1.75, 0], [0.07, 0.34, 0.07], { nodeRole: "antenna" });
  const beacon = addPart("beacon", "sphere", "状态灯", [0, 1.98, 0], [0.16, 0.16, 0.16], {
    render: material.glow(color, 4.2, 1, { color, intensity: 2.5, distance: 3.5, decay: 2 }), nodeRole: "beacon",
  });
  agentDefinitions.set(key, { origin: [...origin], root, parts, offsets, base, head, lens, probe, beacon, moveCount: 0 });
};

createAgent("witness", "见证代理", COLORS.cyan, [-4.35, 0, 3.25], "观察证物并追随身体记忆的光");
createAgent("rewriter", "改写代理", COLORS.gold, [4.3, 0, 3.25], "把假设投射到墙面并推动空间变化");
createAgent("guardian", "许可守护代理", COLORS.red, [3.65, 0, 4.45], "打断无许可的声音并封锁生成入口");
createAgent("archivist", "档案代理", COLORS.white, [-3.65, 0, 4.35], "搬运原始证物并保留来源状态");

// Memory light, dust and system beams.
const memoryWall = addObject("memory_wall", "box", "LIGHT · 墙上移动的身体记忆", {
  position: [-2.75, 2.1, -2.99], dimensions: [0.14, 3.35, 0.06], color: COLORS.gold, visible: false,
  render: material.glow(COLORS.gold, 5.5, 0.68, { color: COLORS.gold, intensity: 7, distance: 5.5, decay: 2 }),
  entity: propEntity("光源不可见但可在空间中移动"),
}, ["memoryLight"]);
const memoryFloor = addObject("memory_floor", "box", "LIGHT · 抵达床面的光", {
  position: [1.2, 0.11, -0.95], dimensions: [5.2, 0.045, 1.15], color: COLORS.gold,
  rotation: [0, -12, 0], scale: [0.02, 1, 0.02], visible: false,
  render: material.glow(COLORS.gold, 4.6, 0.48, { color: COLORS.gold, intensity: 5, distance: 6, decay: 2 }),
  entity: propEntity("沿地面扩散到床"),
}, ["memoryLight"]);
const dustIds = [];
for (let index = 0; index < 24; index += 1) {
  const x = -2.5 + (index % 8) * 0.63;
  const y = 0.65 + (index % 6) * 0.43;
  const z = -2.78 + (index % 3) * 0.34;
  dustIds.push(addObject(`dust_${index}`, "sphere", "LIGHT · 光束尘埃", {
    position: [x, y, z], dimensions: [0.035, 0.035, 0.035], color: COLORS.gold, visible: false,
    render: material.glow(COLORS.gold, 3.2, 0.75), entity: propEntity("光束中的漂浮粒子"),
  }, ["dust"]));
}

const rewriterBeam = addObject("rewriter_beam", "box", "INTERACTION · 改写投射束", {
  position: [0.5, 1.35, -1.35], dimensions: [0.11, 0.11, 2.4], color: COLORS.gold,
  scale: [1, 1, 0.02], visible: false, render: material.glow(COLORS.gold, 4.8, 0.52),
  entity: propEntity("由改写代理触发"),
}, ["rewriterProjection"]);
const guardianBeam = addObject("guardian_beam", "box", "INTERACTION · 守护切断束", {
  position: [-1.28, 1.34, 0.5], dimensions: [0.72, 0.09, 0.09], color: COLORS.red,
  rotation: [0, -8, -12], scale: [0.02, 1, 1], visible: false,
  render: material.glow(COLORS.red, 5.6, 0.75), entity: propEntity("在录音器交互锚点切断波形"),
}, ["guardianProjection"]);
const shield = addObject("guardian_shield", "box", "INTERACTION · 许可屏障", {
  position: [0.2, 1.45, -1.65], dimensions: [3.7, 2.7, 0.07], color: COLORS.red,
  scale: [1, 0.02, 1], visible: false, render: material.glass(COLORS.red, 0.2, 2.4),
  entity: propEntity("守护代理部署的物理边界"),
}, ["guardianShield"]);

// Holographic and physical transformations used by the agents.
const hologramIds = [];
for (const [key, position, dimensions] of [
  ["holo_top", [0.25, 3.12, -2.96], [2.3, 0.07, 0.06]],
  ["holo_bottom", [0.25, 1.12, -2.96], [2.3, 0.07, 0.06]],
  ["holo_left", [-0.87, 2.12, -2.96], [0.07, 2.05, 0.06]],
  ["holo_right", [1.37, 2.12, -2.96], [0.07, 2.05, 0.06]],
]) hologramIds.push(addObject(key, "box", "INTERACTION · 假想窗投影", {
  position, dimensions, color: COLORS.gold, visible: false,
  render: material.glow(COLORS.gold, 4.2, 0.82), entity: propEntity("可以被守护代理撤回"),
}, ["hologram"]));
const glyphIds = [];
for (const [index, item] of [
  [[-1.8, 2.65, -2.94], [0.75, 0.1, 0.05], 12],
  [[-1.55, 2.1, -2.94], [0.1, 1.2, 0.05], 0],
  [[-1.2, 1.55, -2.94], [0.85, 0.1, 0.05], -8],
  [[-0.25, 2.55, -2.94], [0.1, 1.35, 0.05], 0],
  [[0.15, 2.3, -2.94], [0.78, 0.1, 0.05], -18],
  [[0.35, 1.72, -2.94], [0.62, 0.1, 0.05], 22],
  [[1.28, 2.35, -2.94], [0.1, 1.15, 0.05], 0],
  [[1.65, 1.85, -2.94], [0.72, 0.1, 0.05], 0],
].entries()) {
  glyphIds.push(addObject(`glyph_${index}`, "box", "ACTION · 语言转译为光", {
    position: item[0], dimensions: item[1], rotation: [0, 0, item[2]], color: COLORS.gold,
    scale: [0.02, 0.02, 1], visible: false,
    render: material.glow(COLORS.gold, 5, 0.84), entity: propEntity("由改写代理逐笔投射"),
  }, ["glyphs"]));
}

// A second bed really moves through the space for MERGE.
const mergeIds = [];
const addMerge = (key, type, position, dimensions, color, render) => mergeIds.push(addObject(key, type, "ACTION · 被推入房间的另一版本", {
  position, dimensions, color, visible: false, render, entity: propEntity("矛盾版本保留可见接缝"),
}, ["mergeBed"]));
addMerge("merge_frame", "box", [0.65, 0.4, -4.65], [2.1, 0.3, 3.0], "#2d251f", material.wood);
addMerge("merge_mattress", "box", [0.65, 0.7, -4.65], [2.0, 0.38, 2.9], "#6f645b", material.fabric);
addMerge("merge_blanket", "box", [0.65, 0.96, -4.28], [1.95, 0.14, 1.8], "#6d4f43", material.fabric);
addMerge("merge_head", "box", [0.65, 1.1, -5.95], [2.15, 1.45, 0.14], "#3b2d25", material.wood);
const mergeSeam = addObject("merge_seam", "box", "ACTION · 未抹平的版本接缝", {
  position: [0, 2.3, -2.95], dimensions: [0.07, 4.2, 0.06], color: COLORS.violet,
  scale: [1, 0.02, 1], visible: false, render: material.glow(COLORS.violet, 4.8, 0.9),
  entity: propEntity("版本冲突保持可见"),
}, ["mergeSeam"]);

const portalIds = [];
const portalVoid = addObject("portal_void", "box", "ACTION · 反事实走廊入口", {
  position: [0.25, 2.08, -2.94], dimensions: [2.2, 3.15, 0.08], color: "#030505",
  scale: [0.03, 0.03, 1], visible: false, render: { ...material.wall, roughness: 1 },
  entity: propEntity("没有证据的入口"),
}, ["portal"]);
portalIds.push(portalVoid);
for (let index = 0; index < 5; index += 1) {
  const inset = index * 0.17;
  const width = 2.05 - inset * 1.35;
  const height = 2.95 - inset * 1.6;
  const z = -2.89 + index * 0.012;
  for (const [part, position, dimensions] of [
    ["top", [0.25, 2.08 + height / 2, z], [width, 0.055, 0.04]],
    ["bottom", [0.25, 2.08 - height / 2, z], [width, 0.055, 0.04]],
    ["left", [0.25 - width / 2, 2.08, z], [0.055, height, 0.04]],
    ["right", [0.25 + width / 2, 2.08, z], [0.055, height, 0.04]],
  ]) portalIds.push(addObject(`portal_${index}_${part}`, "box", "ACTION · 走廊递进框", {
    position, dimensions, color: COLORS.orange, visible: false,
    render: material.glow(COLORS.orange, 3.8 - index * 0.35, 0.9), entity: propEntity("反事实深度标记"),
  }, ["portal"]));
}

const wallWaveIds = [];
for (let index = 0; index < 13; index += 1) {
  const height = [0.12, 0.3, 0.18, 0.42, 0.2, 0.36, 0.14, 0.46, 0.18, 0.28, 0.12, 0.22, 0.1][index];
  wallWaveIds.push(addObject(`wall_wave_${index}`, "box", "ACTION · 被截断的墙面波形", {
    position: [-1.55 + index * 0.25, 1.34, -2.93], dimensions: [0.035, height, 0.045], color: COLORS.violet,
    scale: [1, 0.02, 1], visible: false, render: material.glow(COLORS.violet, 4.2, 0.86),
    entity: propEntity("推断停在表面"),
  }, ["wallWave"]));
}

// Rough authorised window and deceptive seamless window occupy the same wall location.
const roughWindowIds = [];
for (const [key, target, from, dimensions] of [
  ["rough_top", [0.45, 3.18, -2.9], [0.45, 4.65, -2.2], [2.42, 0.12, 0.09]],
  ["rough_bottom", [0.45, 1.08, -2.9], [0.45, 0.35, -1.8], [2.42, 0.12, 0.09]],
  ["rough_left", [-0.7, 2.13, -2.9], [-2.15, 2.13, -2.1], [0.12, 2.2, 0.09]],
  ["rough_right", [1.6, 2.13, -2.9], [2.85, 2.13, -2.15], [0.12, 2.2, 0.09]],
]) roughWindowIds.push(addObject(key, "box", "ENDING · 被角色拼装的粗糙窗框", {
  position: from, dimensions, color: COLORS.paper, visible: false,
  render: material.paper, entity: propEntity("缝合痕迹必须可见"),
}, ["roughWindow"]));
const roughPane = addObject("rough_pane", "box", "ENDING · 暂定窗面", {
  position: [0.45, 2.13, -2.92], dimensions: [2.22, 1.98, 0.05], color: "#38474b",
  scale: [0.03, 0.03, 1], visible: false, render: material.glass(COLORS.cyan, 0.24, 1.2),
  entity: propEntity("仍保留构造状态"),
}, ["roughWindow"]);
roughWindowIds.push(roughPane);
const seamIds = [];
for (const [index, item] of [
  [[-0.76, 2.15, -2.82], [0.05, 2.32, 0.05], [0, 0, 2]],
  [[1.67, 2.08, -2.82], [0.05, 2.2, 0.05], [0, 0, -2]],
  [[0.45, 3.26, -2.82], [2.55, 0.05, 0.05], [0, 0, 1]],
  [[0.4, 1.0, -2.82], [2.42, 0.05, 0.05], [0, 0, -1]],
].entries()) {
  const [position, dimensions, rotation] = item;
  seamIds.push(addObject(`rough_seam_${index}`, "box", "ENDING · 可见缝线", {
    position, dimensions, rotation, color: COLORS.violet, visible: false,
    render: material.glow(COLORS.violet, 4.8, 0.92), entity: propEntity("诚实重建的缝合证据"),
  }, ["roughWindow", "seams"]));
}

const perfectWindowIds = [];
const perfectPane = addObject("perfect_pane", "box", "ENDING · 完美但可疑的窗", {
  position: [0.45, 2.14, -2.91], dimensions: [2.45, 2.15, 0.055], color: "#6f8e96",
  scale: [0.03, 0.03, 1], visible: false,
  render: material.glass("#b5e8f3", 0.4, 2.5), entity: propEntity("无缝即罪证"),
}, ["perfectWindow"]);
perfectWindowIds.push(perfectPane);
for (const [key, position, dimensions] of [
  ["perfect_top", [0.45, 3.28, -2.82], [2.65, 0.14, 0.1]],
  ["perfect_bottom", [0.45, 1.0, -2.82], [2.65, 0.14, 0.1]],
  ["perfect_left", [-0.82, 2.14, -2.82], [0.14, 2.42, 0.1]],
  ["perfect_right", [1.72, 2.14, -2.82], [0.14, 2.42, 0.1]],
  ["perfect_cross_h", [0.45, 2.14, -2.78], [2.4, 0.075, 0.07]],
  ["perfect_cross_v", [0.45, 2.14, -2.78], [0.075, 2.17, 0.07]],
]) perfectWindowIds.push(addObject(key, "box", "ENDING · 无缝窗框", {
  position, dimensions, scale: [0.03, 0.03, 1], color: COLORS.paper, visible: false,
  render: { ...material.paper, roughness: 0.34 }, entity: propEntity("过分完美的推断"),
}, ["perfectWindow"]));
const perfectLight = addObject("perfect_light", "box", "ENDING · 完美午后光", {
  position: [1.55, 0.14, -0.85], dimensions: [6.0, 0.055, 1.55], rotation: [0, -14, 0],
  scale: [0.02, 1, 0.02], color: COLORS.gold, visible: false,
  render: material.glow(COLORS.gold, 5.2, 0.44, { color: COLORS.gold, intensity: 7, distance: 7, decay: 2 }),
  entity: propEntity("漂亮但无来源的光"),
}, ["perfectWindow"]);
perfectWindowIds.push(perfectLight);
const approvalLight = addObject("approval_light", "sphere", "ENDING · 许可确认信号", {
  position: [2.1, 2.95, -2.72], dimensions: [0.2, 0.2, 0.2], color: COLORS.cyan, visible: false,
  render: material.glow(COLORS.cyan, 5.2, 1, { color: COLORS.cyan, intensity: 3, distance: 4, decay: 2 }),
  entity: propEntity("由守护代理确认"),
}, ["approval"]);

const clips = [];
let clipCounter = 0;
const addClip = (clip) => clips.push({
  id: `sandbox-clip-${String(clipCounter += 1).padStart(4, "0")}`,
  line: clipCounter,
  ...clip,
});
const trackFor = (id) => {
  const role = objects.find((object) => object.id === id)?.entity?.role;
  return role === "character" ? "character" : role === "environment" ? "environment" : "prop";
};
const visibility = (id, start, visible, label = "显隐") => {
  const state = objectState.get(id);
  addClip({ type: "visibility", track: trackFor(id), label, start, duration: 0.05, targetId: id, from: state.visible, to: visible });
  state.visible = visible;
};
const showGroup = (group, start, label = "进入场景") => (groups.get(group) ?? []).forEach((id, index) => visibility(id, start + index * 0.006, true, label));
const hideGroup = (group, start, label = "离开场景") => (groups.get(group) ?? []).forEach((id, index) => visibility(id, start + index * 0.004, false, label));
const move = (id, start, duration, to, label = "空间移动", options = {}) => {
  const state = objectState.get(id);
  addClip({
    type: "move",
    track: trackFor(id),
    label,
    start,
    duration,
    targetId: id,
    from: [...state.position],
    to: [...to],
    path: options.path ?? [],
    motion: options.motion ?? null,
    fromYaw: options.fromYaw ?? null,
    toYaw: options.toYaw ?? null,
  });
  state.position = [...to];
  if (Number.isFinite(options.toYaw)) state.rotation[1] = options.toYaw;
};
const rotate = (id, start, duration, to, label = "转向") => {
  const state = objectState.get(id);
  addClip({ type: "rotate", track: trackFor(id), label, start, duration, targetId: id, from: [...state.rotation], to: [...to] });
  state.rotation = [...to];
};
const scale = (id, start, duration, to, label = "形态变化") => {
  const state = objectState.get(id);
  addClip({ type: "scale", track: trackFor(id), label, start, duration, targetId: id, from: [...state.scale], to: [...to] });
  state.scale = [...to];
};
const pulse = (id, start, duration = 0.7, factor = 1.55, label = "状态回应") => {
  const base = [...objectState.get(id).scale];
  scale(id, start, duration * 0.45, base.map((value) => value * factor), label);
  scale(id, start + duration * 0.45, duration * 0.55, base, label);
};
const moveGroupBy = (group, start, duration, delta, label) => {
  for (const id of groups.get(group) ?? []) {
    const to = objectState.get(id).position.map((value, axis) => value + delta[axis]);
    move(id, start, duration, to, label);
  }
};
const moveGroupAnchor = (group, anchorId, start, duration, target, label) => {
  const anchor = objectState.get(anchorId).position;
  moveGroupBy(group, start, duration, target.map((value, axis) => value - anchor[axis]), label);
};
const moveAgent = (key, start, duration, to, label, waypoints = []) => {
  const agent = agentDefinitions.get(key);
  const state = objectState.get(agent.root);
  const from = [...state.position];
  const delta = to.map((value, axis) => value - from[axis]);
  const distance = Math.max(0.001, Math.hypot(delta[0], delta[2]));
  const lateralSign = (agent.moveCount += 1) % 2 === 0 ? -1 : 1;
  const perpendicular = [-delta[2] / distance, 0, delta[0] / distance];
  const lateral = Math.min(0.42, distance * 0.11) * lateralSign;
  const automaticPath = [
    from,
    from.map((value, axis) => value + delta[axis] * 0.3 + perpendicular[axis] * lateral),
    from.map((value, axis) => value + delta[axis] * 0.72 + perpendicular[axis] * lateral * 0.55),
    to,
  ];
  const path = waypoints.length ? [from, ...waypoints, to] : automaticPath;
  const finalLeg = path[path.length - 1].map((value, axis) => value - path[path.length - 2][axis]);
  const toYaw = Math.atan2(-finalLeg[0], -finalLeg[2]) * 180 / Math.PI;
  const motionProfile = objects.find((object) => object.id === agent.root)?.motion;
  move(agent.root, start, duration, to, label, {
    path,
    fromYaw: state.rotation[1],
    toYaw,
    motion: {
      easing: "minimumJerk",
      orientToPath: true,
      leanDegrees: motionProfile?.leanDegrees ?? 4.5,
      bankDegrees: (motionProfile?.bankDegrees ?? 5) * lateralSign,
      turnPortion: key === "guardian" ? 0.18 : 0.24,
    },
  });
  agent.origin = [...to];
  const headState = objectState.get(agent.head);
  if (headState) {
    rotate(
      agent.head,
      start + duration * 0.18,
      duration * 0.62,
      [headState.rotation[0], headState.rotation[1] + 14 * lateralSign, headState.rotation[2]],
      `${label} · 环境扫描`,
    );
  }
};
const extendProbe = (key, start, duration, factor = 2.4) => {
  const probe = agentDefinitions.get(key).probe;
  const state = objectState.get(probe);
  const object = objects.find((candidate) => candidate.id === probe);
  const basePosition = [...state.position];
  const baseScale = [...state.scale];
  const reachPosition = [
    basePosition[0] + object.dimensions[0] * (factor - 1) * 0.42,
    basePosition[1],
    basePosition[2] - object.dimensions[2] * (factor - 1) * 0.08,
  ];
  const reachScale = [baseScale[0] * factor, baseScale[1], baseScale[2]];
  const extendDuration = duration * 0.46;
  scale(probe, start, extendDuration, reachScale, "探针伸向交互锚点");
  move(probe, start, extendDuration, reachPosition, "探针伸向交互锚点");
  scale(probe, start + extendDuration, duration - extendDuration, baseScale, "探针完成接触后收回");
  move(probe, start + extendDuration, duration - extendDuration, basePosition, "探针完成接触后收回");
};

const worldAnchorFor = (targetId, anchorName) => {
  const target = objects.find((candidate) => candidate.id === targetId);
  const state = objectState.get(targetId);
  if (!target || !state) throw new Error(`交互目标不存在：${targetId}`);
  const anchor = target.interactionSpec?.anchors?.[anchorName] ?? [0, 0, 0];
  return state.position.map((value, axis) => value + anchor[axis]);
};

const interactAgent = (key, targetId, affordanceName, start, duration, { aimLead = 0.42, useProbe = true } = {}) => {
  const agent = agentDefinitions.get(key);
  const target = objects.find((candidate) => candidate.id === targetId);
  const affordance = target?.interactionSpec?.affordances?.[affordanceName];
  if (!agent || !target || !affordance) throw new Error(`未声明交互接口：${key} -> ${targetId}.${affordanceName}`);

  const targetPosition = worldAnchorFor(targetId, affordance.targetAnchor);
  const rootState = objectState.get(agent.root);
  const dx = targetPosition[0] - rootState.position[0];
  const dz = targetPosition[2] - rootState.position[2];
  const horizontalDistance = Math.max(0.001, Math.hypot(dx, dz));
  if (horizontalDistance > affordance.maxDistance + 0.001) {
    throw new Error(`交互距离超限：${key}.${affordanceName} ${horizontalDistance.toFixed(2)}m > ${affordance.maxDistance.toFixed(2)}m`);
  }

  // The current placeholder probe extends along local +X. Future GLB assets resolve the same
  // semantic effector through asset.nodes without changing this timeline contract.
  const rawAimYaw = Math.atan2(-dz, dx) * 180 / Math.PI;
  const currentYaw = rootState.rotation[1];
  const aimYaw = currentYaw + ((((rawAimYaw - currentYaw) % 360) + 540) % 360 - 180);
  rotate(
    agent.root,
    Math.max(0, start - aimLead),
    aimLead,
    [rootState.rotation[0], aimYaw, rootState.rotation[2]],
    `${target.name} · 对准 ${affordance.targetAnchor}`,
  );

  addClip({
    type: "interaction",
    track: "character",
    label: `${key} · ${affordance.action}`,
    start,
    duration,
    targetId,
    secondaryTargetId: agent.root,
    action: affordance.action,
    targetAnchor: affordance.targetAnchor,
    actorNode: affordance.actorNode,
    resultingState: affordance.resultingState,
    motion: { easing: "minimumJerk" },
  });
  if (!useProbe) return;

  const probeState = objectState.get(agent.probe);
  const probeObject = objects.find((candidate) => candidate.id === agent.probe);
  const basePosition = [...probeState.position];
  const baseRotation = [...probeState.rotation];
  const baseScale = [...probeState.scale];
  const verticalDistance = targetPosition[1] - (rootState.position[1] + basePosition[1]);
  const reachDistance = Math.hypot(horizontalDistance, verticalDistance);
  const probeLength = probeObject.dimensions[0];
  const innerSocket = basePosition[0] - probeLength / 2;
  const factor = Math.min(3.6, Math.max(1, (reachDistance - innerSocket) / probeLength));
  const reachPosition = [innerSocket + probeLength * factor / 2, basePosition[1], basePosition[2]];
  const reachRotation = [baseRotation[0], baseRotation[1], Math.atan2(verticalDistance, horizontalDistance) * 180 / Math.PI];
  const reachScale = [baseScale[0] * factor, baseScale[1], baseScale[2]];
  const extendDuration = duration * 0.42;
  const retractStart = start + duration * 0.58;
  const retractDuration = duration * 0.42;

  rotate(agent.probe, start, extendDuration, reachRotation, "探针对准物品交互锚点");
  scale(agent.probe, start, extendDuration, reachScale, "探针伸到物品交互锚点");
  move(agent.probe, start, extendDuration, reachPosition, "探针伸到物品交互锚点");
  rotate(agent.probe, retractStart, retractDuration, baseRotation, "探针离开物品交互锚点");
  scale(agent.probe, retractStart, retractDuration, baseScale, "探针完成语义动作后收回");
  move(agent.probe, retractStart, retractDuration, basePosition, "探针完成语义动作后收回");
};

const shots = [
  { id: "B1-01", start: 0, duration: 12, from: [0, 1.65, 10.5], to: [0.15, 1.82, 5.05], lookFrom: [0, 1.55, -1.2], lookTo: [-0.4, 1.35, -1.0], fov: [46, 38], note: "摄影机穿过门框进入同一房间。" },
  { id: "B2-01", start: 12, duration: 18, from: [4.65, 2.48, 5.4], to: [-1.0, 1.86, 3.75], lookFrom: [0, 1.15, -0.5], lookTo: [-2.45, 1.35, 0.05], fov: [43, 35], note: "见证代理进入并检查未改动照片。" },
  { id: "B3-01", start: 30, duration: 9, from: [-1.72, 1.7, 2.35], to: [-0.95, 1.55, 1.3], lookFrom: [-0.3, 2.15, -3.0], lookTo: [1.2, 1.9, -2.85], fov: [40, 33], note: "越肩跟随墙面记忆光。" },
  { id: "B3-02", start: 39, duration: 9, from: [4.65, 2.1, 2.75], to: [3.65, 1.5, 1.12], lookFrom: [2.8, 1.0, -1.2], lookTo: [1.35, 0.6, -0.95], fov: [42, 34], note: "低机位跟随光抵达床面。" },
  {
    id: "B4-01", start: 48, duration: 7,
    from: [2.55, 2.15, 3.55], via: [[2.28, 2.12, 3.22], [1.72, 1.88, 2.72]], to: [1.15, 1.68, 2.25],
    lookFrom: [-2.1, 1.2, 0.0], lookVia: [[-1.98, 1.22, 0.04], [-1.8, 1.18, 0.09]], lookTo: [-1.65, 1.16, 0.12],
    fov: [44, 35], note: "见证代理触碰录音器。",
  },
  {
    id: "B4-02", start: 55, duration: 7,
    from: [3.35, 2.18, 3.55], via: [[3.18, 2.22, 3.42], [2.92, 2.18, 3.22]], to: [2.58, 2.08, 2.92],
    lookFrom: [-1.2, 1.18, 0.12], lookVia: [[-1.12, 1.22, 0.16], [-1.02, 1.24, 0.2]], lookTo: [-0.92, 1.23, 0.2],
    fov: [43, 38], note: "守护代理冲入并切断波形，保持角色与物品同框。",
  },
  { id: "B5-01", start: 62, duration: 10, from: [0.0, 2.42, 5.0], to: [0.05, 1.9, 3.0], lookFrom: [0, 1.5, -2.4], lookTo: [0.25, 2.0, -3.0], fov: [46, 37], note: "改写投影与许可屏障第一次正面冲突。" },
  { id: "B6-01", start: 72, duration: 6, from: [-4.0, 2.55, 3.3], to: [-2.2, 2.15, 2.55], lookFrom: [0, 1.0, 0.0], lookTo: [-0.3, 1.1, -0.5], fov: [46, 39], note: "四个非人角色代理进入同一现场。" },
  { id: "B6-02", start: 78, duration: 6, from: [4.15, 2.05, 2.75], to: [2.6, 1.58, 1.55], lookFrom: [0.2, 1.45, -1.5], lookTo: [-0.6, 1.1, -0.2], fov: [43, 34], note: "证物搬运、投影与屏障同时发生。" },
  { id: "B6-03", start: 84, duration: 6, from: [-4.15, 2.42, 3.75], to: [-2.55, 2.02, 2.62], lookFrom: [-0.4, 1.0, 0.1], lookTo: [0.2, 1.4, -1.5], fov: [45, 39], note: "代理重新站位，准备五种动作。" },
  { id: "B7-01", start: 90, duration: 8, from: [3.05, 1.92, 3.35], to: [1.75, 1.68, 2.02], lookFrom: [-0.3, 2.1, -2.95], lookTo: [0.15, 2.1, -2.95], fov: [42, 36], note: "改写代理逐笔把语言投成墙面光。" },
  { id: "B7-02", start: 98, duration: 8, from: [1.85, 2.02, 3.0], to: [-3.15, 2.18, 2.55], lookFrom: [-1.6, 1.45, -1.2], lookTo: [-4.75, 2.45, 1.6], fov: [46, 42], note: "摄影机与见证代理一起侧移，发现原画框外的窗。" },
  { id: "B7-03", start: 106, duration: 8, from: [4.45, 1.82, 3.45], to: [2.65, 1.42, 1.72], lookFrom: [1.3, 0.8, -1.7], lookTo: [0.55, 0.85, -1.1], fov: [43, 34], note: "第二张床被实际推入房间，接缝保留。" },
  { id: "B7-04", start: 114, duration: 8, from: [0.1, 1.75, 3.2], to: [-1.45, 1.7, 1.25], lookFrom: [0.25, 2.0, -2.95], lookTo: [0.25, 1.9, -3.0], fov: [43, 34], note: "反事实入口向摄影机展开，角色接近门槛。" },
  { id: "B7-05", start: 122, duration: 8, from: [4.55, 2.55, 4.15], to: [3.7, 2.05, 2.95], lookFrom: [0.1, 1.5, -2.35], lookTo: [0.15, 1.5, -2.95], fov: [45, 40], note: "守护代理封住入口，推断在墙面终止。" },
  { id: "B8-01", start: 130, duration: 8, from: [-3.75, 2.08, 2.35], to: [-1.55, 1.68, 1.32], lookFrom: [-0.3, 2.05, -3.0], lookTo: [0.25, 2.15, -2.95], fov: [42, 33], note: "角色搬运照片并拼装带缝窗框。" },
  { id: "B8-02", start: 138, duration: 8, from: [4.45, 2.48, 3.75], to: [1.35, 1.88, 2.05], lookFrom: [0.5, 2.1, -2.9], lookTo: [0.45, 2.1, -2.95], fov: [44, 34], note: "无缝窗与漂亮光线占领同一房间，守护信号报警。" },
  { id: "B8-03", start: 146, duration: 8, from: [0.72, 1.48, 0.55], to: [2.0, 1.62, 1.55], lookFrom: [0.45, 2.0, -2.95], lookTo: [0.2, 1.6, -2.95], fov: [31, 38], note: "守护代理关闭生成层，房间恢复封闭。" },
  { id: "B9-01", start: 154, duration: 12, from: [0.15, 1.72, 4.55], to: [0, 1.65, 10.25], lookFrom: [-0.4, 1.35, -0.8], lookTo: [0, 1.5, -1.15], fov: [38, 46], note: "证物归位，代理逐一离开，摄影机退出同一门框。" },
];

for (const shot of shots) addClip({
  type: "camera", track: "camera", label: `${shot.id} · 电影机位`, start: shot.start,
  duration: shot.duration, preset: "perspective", fromPreset: "perspective",
  fromPosition: shot.from, toPosition: shot.to, fromLookAt: shot.lookFrom, toLookAt: shot.lookTo,
  positionPath: shot.via?.length ? [shot.from, ...shot.via, shot.to] : [],
  lookAtPath: shot.lookVia?.length ? [shot.lookFrom, ...shot.lookVia, shot.lookTo] : [],
  motion: { easing: "minimumJerk" },
  fromFov: shot.fov[0], toFov: shot.fov[1], framing: 1, fromFraming: 1,
});

// B2: the player-camera enters; Witness arrives and inspects the evidence instead of appearing as an icon.
showGroup("agent_witness", 14.2, "见证代理从门外进入");
moveAgent("witness", 14.2, 4.4, [-2.15, 0, 1.72], "见证代理驶向证物桌");
extendProbe("witness", 18.7, 1.1, 2.2);
pulse(agentDefinitions.get("witness").beacon, 20.2, 0.8, 1.8, "识别原始照片");
moveAgent("witness", 23.5, 3.2, [-1.75, 0, 1.05], "绕到照片侧面核验");
extendProbe("witness", 26.5, 1.0, 1.8);

// B3: remembered light moves through the same room and the Witness follows it to the bed.
visibility(memoryWall, 30.05, true, "身体记忆的光出现");
move(memoryWall, 30.05, 8.6, [1.05, 2.1, -2.99], "墙面光随时间横移");
showGroup("dust", 30.2, "光束显出尘埃");
dustIds.forEach((id, index) => move(id, 30.2, 8.4, objectState.get(id).position.map((value, axis) => value + [0.3, 0.18 + (index % 3) * 0.08, 0.08][axis]), "尘埃在光中漂移"));
moveAgent("witness", 31.0, 4.8, [-0.85, 0, 0.15], "见证代理追随墙面光");
extendProbe("witness", 35.6, 1.5, 2.8);
visibility(memoryFloor, 39.02, true, "光落到地面");
scale(memoryFloor, 39.02, 2.8, [1, 1, 1], "地面光向床铺展开");
moveAgent("witness", 39.8, 5.8, [1.65, 0, 0.35], "见证代理沿光移动到床边");
extendProbe("witness", 44.0, 1.3, 2.5);
pulse(agentDefinitions.get("witness").beacon, 45.5, 0.9, 2.0, "床面光被记录");
visibility(memoryWall, 47.25, false, "身体记忆的光暂时退场");
visibility(memoryFloor, 47.25, false, "床面光暂时退场");
hideGroup("dust", 47.25, "光尘随记忆光退场");

// B4: the recorder starts; Guardian physically interrupts it and the cup reacts to the impact.
moveAgent(
  "witness",
  47.5,
  3.0,
  [-1.95, 0, 1.4],
  "见证代理绕过桌角返回录音器",
  [[0.75, 0, 1.25], [-0.35, 0, 1.72], [-1.18, 0, 1.62]],
);
interactAgent("witness", recorder, "inspect", 50.65, 1.3);
waveformIds.forEach((id, index) => {
  visibility(id, 51.2 + index * 0.18, true, "重演波形逐段写入");
  pulse(id, 51.25 + index * 0.18, 0.55, 1.5, "录音器写入波形");
});
showGroup("agent_guardian", 54.95, "守护代理紧急进入");
moveAgent(
  "guardian",
  54.95,
  2.5,
  [0.5, 0, 1.25],
  "守护代理高速绕开桌体冲向录音器",
  [[2.85, 0, 3.72], [1.7, 0, 2.68], [0.62, 0, 1.65]],
);
interactAgent("guardian", recorder, "interrupt", 57.48, 0.72, { aimLead: 0.38, useProbe: false });
visibility(guardianBeam, 57.48, true, "切断束建立");
scale(guardianBeam, 57.48, 0.48, [1, 1, 1], "守护束击中录音器");
waveformIds.slice(6).forEach((id, index) => scale(id, 57.66 + index * 0.025, 0.52, [1, 0.03, 1], "后半波形被切断"));
waveformIds.slice(6).forEach((id, index) => visibility(id, 58.22 + index * 0.01, false, "无许可音频撤回"));
rotate(cupBody, 57.82, 0.55, [0, 0, -21], "切断冲击传到桌面，杯子被碰歪");
for (const key of ["cup_handle_top", "cup_handle_side", "cup_handle_bottom"]) {
  const id = ids.get(key);
  rotate(id, 57.82, 0.55, objectState.get(id).rotation.map((value, axis) => axis === 2 ? value - 21 : value), "杯柄随杯体倾斜");
  move(id, 57.82, 0.55, objectState.get(id).position.map((value, axis) => value + [0.02, -0.05, 0][axis]), "杯柄随杯体位移");
}
move(cupBody, 57.82, 0.55, [-1.06, 1.23, 0.02], "杯体受碰撞位移");
visibility(shield, 58.4, true, "许可屏障部署");
scale(shield, 58.4, 0.9, [1, 1, 1], "屏障从地面升起");
visibility(guardianBeam, 60.0, false, "切断动作完成");

// B5/B6: Rewriter and Archivist enter; all four agents negotiate the wall with physical positions.
showGroup("agent_rewriter", 62.2, "改写代理进入");
moveAgent("rewriter", 62.2, 4.0, [1.1, 0, 0.65], "改写代理驶向封闭墙");
visibility(rewriterBeam, 64.1, true, "改写投射束启动");
scale(rewriterBeam, 64.1, 0.9, [1, 1, 1], "投射束抵达墙面");
showGroup("hologram", 64.7, "假想窗被投到墙上");
hologramIds.forEach((id, index) => pulse(id, 65.0 + index * 0.08, 0.8, 1.35, "窗框投影校准"));
moveAgent("guardian", 66.0, 2.7, [0.25, 0, -0.35], "守护代理挡在投影与墙之间");
scale(shield, 66.6, 1.0, [0.65, 1.15, 1], "屏障收紧到投影边界");
hologramIds.forEach((id, index) => scale(id, 68.25 + index * 0.03, 0.75, [0.02, 0.02, 1], "第一次投影被撤回"));
hideGroup("hologram", 69.1, "窗投影消失");
visibility(rewriterBeam, 69.2, false, "改写束暂停");
showGroup("agent_archivist", 71.95, "档案代理进入");
moveAgent("archivist", 71.95, 3.5, [-0.45, 0, 1.9], "档案代理抵达证物区");
moveAgent("witness", 72.3, 3.0, [-2.15, 0, 0.6], "见证代理给档案代理让位");
moveAgent("rewriter", 73.0, 2.8, [1.7, 0, 0.0], "改写代理转入协商站位");
moveAgent("guardian", 73.4, 2.4, [0.45, 0, 0.15], "守护代理守住墙前区域");
pulse(agentDefinitions.get("archivist").beacon, 75.4, 0.9, 1.8, "档案代理确认来源");
moveGroupBy("photo", 78.0, 2.2, [0.65, 0, 0.16], "见证与档案代理把照片推到协商中心");
moveGroupBy("recorder", 78.4, 2.0, [0.42, 0, 0.18], "档案代理把录音器移出禁区");
visibility(rewriterBeam, 78.2, true, "改写代理再次提出窗");
scale(rewriterBeam, 78.2, 0.65, [1, 1, 1], "第二次投射");
showGroup("hologram", 78.7, "窗投影重现");
scale(shield, 79.3, 0.85, [1.15, 1.1, 1], "许可边界覆盖投影");
extendProbe("archivist", 80.4, 1.2, 2.6);
extendProbe("witness", 81.0, 1.0, 2.1);
hologramIds.forEach((id, index) => pulse(id, 81.2 + index * 0.06, 0.8, 1.22, "四方协商中的窗投影"));
scale(shield, 83.0, 0.8, [1, 0.03, 1], "边界暂时收起");
visibility(shield, 83.85, false, "许可屏障退场");
hideGroup("hologram", 83.7, "协商投影结束");
visibility(rewriterBeam, 83.8, false, "改写束结束");
moveAgent("witness", 84.0, 3.2, [-2.35, 0, 0.75], "见证代理进入动作站位");
moveAgent("rewriter", 84.0, 3.2, [0.45, 0, 0.15], "改写代理进入动作站位");
moveAgent("guardian", 84.0, 3.2, [2.0, 0, 0.65], "守护代理进入动作站位");
moveAgent("archivist", 84.0, 3.2, [-0.75, 0, 1.75], "档案代理保持证物后方");

// Five actions: each is caused by an agent and changes the shared room rather than swapping a card.
visibility(rewriterBeam, 89.9, true, "TRANSLATE 投射开始");
scale(rewriterBeam, 89.9, 0.65, [1, 1, 1], "改写束抵达墙面");
glyphIds.forEach((id, index) => {
  visibility(id, 90.15 + index * 0.43, true, "字形光逐笔出现");
  scale(id, 90.15 + index * 0.43, 0.55, [1, 1, 1], "改写代理绘制光笔画");
});
moveAgent("rewriter", 90.2, 3.0, [0.4, 0, -0.35], "改写代理靠近投射墙");
moveAgent("witness", 91.2, 4.0, [-1.5, 0, -0.1], "见证代理沿字形光检查");
extendProbe("witness", 94.5, 1.1, 2.7);
glyphIds.forEach((id, index) => scale(id, 97.0 + index * 0.025, 0.7, [0.02, 0.02, 1], "字形光退回墙面"));
hideGroup("glyphs", 97.8, "TRANSLATE 完成");
visibility(rewriterBeam, 97.8, false, "投射束结束");

moveAgent("witness", 98.0, 5.4, [-3.65, 0, 1.45], "见证代理带摄影机走出原画框");
move(sideShutterA, 100.7, 2.1, [-4.67, 2.55, 0.9], "见证代理触发左遮板滑开");
move(sideShutterB, 100.7, 2.1, [-4.67, 2.55, 2.38], "见证代理触发右遮板滑开");
extendProbe("witness", 102.0, 1.2, 2.3);
pulse(agentDefinitions.get("witness").beacon, 103.2, 0.9, 2.0, "原画框外侧窗被发现");

showGroup("mergeBed", 105.95, "MERGE 另一版本从墙后进入");
visibility(mergeSeam, 106.0, true, "MERGE 版本接缝出现");
moveGroupBy("mergeBed", 106.0, 5.1, [0, 0, 3.55], "改写代理把第二张床推入房间");
scale(mergeSeam, 106.1, 1.4, [1, 1, 1], "版本接缝从地面长起");
moveAgent("rewriter", 106.0, 4.8, [0.95, 0, -1.05], "改写代理随第二张床后退");
moveAgent("guardian", 107.2, 3.6, [2.35, 0, -0.15], "守护代理监视矛盾版本");
pulse(agentDefinitions.get("guardian").beacon, 111.0, 0.9, 1.9, "接缝状态被标记");
moveGroupBy("mergeBed", 113.0, 1.3, [0, 0, -3.2], "第二张床退回墙后");
hideGroup("mergeBed", 114.25, "MERGE 暂停但不抹平历史");
visibility(mergeSeam, 114.25, false, "MERGE 接缝保留在动作记录中");

showGroup("portal", 114.0, "CONTINUE 入口开始形成");
scale(portalVoid, 114.0, 1.6, [1, 1, 1], "反事实入口向四周打开");
portalIds.slice(1).forEach((id, index) => pulse(id, 114.8 + index * 0.055, 0.55, 1.22, "走廊递进框逐层点亮"));
moveAgent("rewriter", 114.4, 4.5, [0.2, 0, -1.55], "改写代理走向反事实门槛");
moveAgent("guardian", 116.4, 3.7, [1.25, 0, -0.95], "守护代理追到门槛侧方");
moveAgent("archivist", 116.8, 3.4, [-1.15, 0, -0.25], "档案代理携来源状态靠近入口");
visibility(shield, 120.05, true, "门槛许可屏障部署");
scale(shield, 120.05, 0.85, [0.72, 1, 1], "屏障截断入口路径");
pulse(agentDefinitions.get("guardian").beacon, 120.7, 0.9, 2.1, "入口权限被拒绝");

moveAgent("guardian", 122.0, 2.0, [0.45, 0, -1.3], "守护代理进入入口正前方");
scale(portalVoid, 122.4, 3.0, [0.02, 0.02, 1], "KEEP OPAQUE · 入口被压回墙面");
portalIds.slice(1).forEach((id, index) => scale(id, 122.55 + index * 0.025, 1.0, [0.02, 0.02, 1], "走廊深度逐层撤回"));
hideGroup("portal", 125.8, "反事实入口关闭");
wallWaveIds.slice(0, 8).forEach((id, index) => {
  visibility(id, 123.3 + index * 0.21, true, "被扣留波形回到墙面");
  scale(id, 123.3 + index * 0.21, 0.48, [1, 1, 1], "波形写到许可边界");
});
moveAgent("rewriter", 122.5, 3.3, [1.35, 0, 0.2], "改写代理从被关闭的入口后退");
moveAgent("witness", 123.0, 3.3, [-1.45, 0, 0.25], "见证代理回到墙前观察位");
scale(shield, 125.4, 1.6, [0.9, 0.025, 1], "守护屏障降回地面");
visibility(shield, 127.2, false, "守护屏障收起");

// Three endings are acted out in the same room.
showGroup("roughWindow", 129.95, "AUTHORISED 构件进入现场");
for (const [index, id] of roughWindowIds.entries()) {
  const target = [
    [0.45, 3.18, -2.9], [0.45, 1.08, -2.9], [-0.7, 2.13, -2.9], [1.6, 2.13, -2.9], [0.45, 2.13, -2.92],
  ][index];
  if (target) move(id, 130.0 + index * 0.09, 2.0, target, "四个代理共同拼装带缝窗框");
}
scale(roughPane, 130.8, 1.4, [1, 1, 1], "暂定窗面展开");
seamIds.forEach((id, index) => pulse(id, 132.0 + index * 0.12, 0.75, 1.3, "缝合痕迹明确保留"));
moveGroupAnchor("photo", photoImage, 130.0, 3.1, [-2.0, 2.12, -2.86], "见证与档案代理把原始照片搬到窗旁");
moveAgent("witness", 130.0, 3.0, [-1.65, 0, -0.6], "见证代理护送原始照片");
moveAgent("archivist", 130.2, 3.0, [-2.6, 0, -0.25], "档案代理确认照片与重建并置");
moveAgent("guardian", 131.0, 2.8, [2.0, 0, -0.45], "守护代理检查缝合边界");
visibility(approvalLight, 133.5, true, "许可确认");
pulse(approvalLight, 133.5, 2.2, 2.0, "许可状态持续可见");

// MISREADING: the room itself becomes seductively perfect while Guardian visibly objects.
showGroup("perfectWindow", 137.95, "MISREADING 无缝窗开始覆盖粗糙重建");
perfectWindowIds.forEach((id, index) => scale(id, 138.0 + index * 0.055, 1.7, [1, 1, 1], "无缝构件自动完成"));
roughWindowIds.forEach((id, index) => scale(id, 138.1 + index * 0.035, 1.25, [0.02, 0.02, 1], "诚实缝合被漂亮表面吞没"));
hideGroup("seams", 139.5, "缝合标记消失");
visibility(approvalLight, 139.0, false, "许可确认被覆盖");
moveGroupAnchor("photo", photoImage, 138.0, 3.0, [-1.45, 1.45, -0.75], "见证代理把被挤出的证物带离墙面");
moveAgent("witness", 138.0, 3.0, [-1.2, 0, 0.3], "见证代理带原始照片后退");
moveAgent("rewriter", 138.0, 3.2, [0.45, 0, -0.65], "改写代理站到完美窗前");
moveAgent("guardian", 138.4, 3.2, [2.35, 0, 0.25], "守护代理被迫后退并报警");
pulse(agentDefinitions.get("guardian").beacon, 141.2, 0.7, 2.4, "无缝结果触发红色警报");
pulse(agentDefinitions.get("guardian").beacon, 142.3, 0.7, 2.4, "无缝结果持续报警");

// OPACITY: Guardian returns and shuts the generated layer while all other agents give ground.
moveAgent("guardian", 145.9, 2.8, [0.95, 0, -1.2], "守护代理重新冲到完美窗前");
visibility(shield, 147.2, true, "OPACITY 屏障重新部署");
scale(shield, 147.2, 0.9, [0.82, 1.08, 1], "屏障覆盖无缝窗");
perfectWindowIds.forEach((id, index) => scale(id, 148.0 + index * 0.045, 2.0, [0.02, 0.02, 1], "生成层被守护代理关闭"));
hideGroup("perfectWindow", 150.2, "完美窗与无来源光撤回");
moveAgent("rewriter", 147.0, 3.0, [1.65, 0, 0.45], "改写代理退出墙前区域");
moveAgent("archivist", 147.2, 2.8, [-1.8, 0, 0.75], "档案代理回到证物一侧");
wallWaveIds.slice(0, 8).forEach((id, index) => pulse(id, 149.4 + index * 0.12, 0.55, 1.25, "被扣留波形保持同等强度"));
scale(shield, 151.2, 1.6, [0.82, 0.02, 1], "守护屏障确认墙面封闭后收起");
visibility(shield, 153.0, false, "OPACITY 完成");

// B9: every interaction resolves in space. Evidence returns, agents exit, camera backs through the same doorway.
moveGroupAnchor("photo", photoImage, 154.0, 2.7, [-2.95, 1.72, -0.075], "档案代理把原始照片归还原位");
moveGroupBy("recorder", 154.0, 2.0, [-0.42, 0, -0.18], "录音器归回证物桌");
move(sideShutterA, 154.0, 2.0, [-4.67, 2.55, 1.25], "侧窗遮板关闭，恢复进入时状态");
move(sideShutterB, 154.0, 2.0, [-4.67, 2.55, 2.03], "侧窗遮板关闭，恢复进入时状态");
rotate(cupBody, 154.0, 1.2, [0, 0, 0], "杯子被扶正");
move(cupBody, 154.0, 1.2, [-1.1, 1.31, 0.02], "杯子归位");
for (const key of ["cup_handle_top", "cup_handle_side", "cup_handle_bottom"]) {
  const id = ids.get(key);
  const original = {
    cup_handle_top: { position: [-0.82, 1.48, 0.02], rotation: [0, 0, -18] },
    cup_handle_side: { position: [-0.7, 1.3, 0.02], rotation: [0, 0, 0] },
    cup_handle_bottom: { position: [-0.82, 1.12, 0.02], rotation: [0, 0, 18] },
  }[key];
  move(id, 154.0, 1.2, original.position, "杯柄归位");
  rotate(id, 154.0, 1.2, original.rotation, "杯柄扶正");
}
hideGroup("wallWave", 154.6, "被扣留波形退回录音器状态");
hideGroup("roughWindow", 154.2, "暂定重建撤回，墙面恢复唯一底板");
visibility(memoryWall, 154.1, false, "记忆光离开墙面");
visibility(memoryFloor, 154.1, false, "记忆光离开地面");
hideGroup("dust", 154.1, "光尘退场");
moveAgent("rewriter", 154.0, 3.1, [4.3, 0, 3.25], "改写代理首先离开房间");
hideGroup("agent_rewriter", 157.2, "改写代理退出门框");
moveAgent("archivist", 155.0, 3.4, [-3.65, 0, 4.35], "档案代理完成归档后离开");
hideGroup("agent_archivist", 158.5, "档案代理退出门框");
moveAgent("guardian", 157.0, 3.7, [3.65, 0, 4.45], "许可守护代理最后确认墙面");
hideGroup("agent_guardian", 160.8, "守护代理退出门框");
moveAgent("witness", 159.0, 4.1, [-4.35, 0, 3.25], "见证代理看过原始照片后离开");
hideGroup("agent_witness", 163.2, "见证代理退出，房间再次为空");

const screenplaySummary = "同一房间连续表演：摄影机进入；见证代理检查照片；身体记忆的光移动；录音器写入后被许可守护代理切断；四个非人代理协商五种动作与三种结尾；证物归位，摄影机退出。";

const project = normalizeProject({
  schemaVersion: 3,
  id: "project-window-that-wasnt-there-sandbox-v2",
  name: "不存在的窗 · 电影沙盒交互版",
  stage: "render",
  // Keep the committed fixture reproducible across local runs and CI.
  updatedAt: "2026-08-20T00:00:00.000Z",
  reference: null,
  breakdown: [
    createBreakdownItem("连续封闭房间", "box", { id: "part-room", objectId: ids.get("back_wall") }),
    createBreakdownItem("唯一存世照片", "box", { id: "part-photo", objectId: photoImage }),
    createBreakdownItem("重演录音器", "box", { id: "part-recorder", objectId: recorder }),
    createBreakdownItem("留存杯子", "cylinder", { id: "part-cup", objectId: cupBody }),
    createBreakdownItem("见证代理", "sphere", { id: "part-witness", objectId: agentDefinitions.get("witness").root }),
    createBreakdownItem("改写代理", "sphere", { id: "part-rewriter", objectId: agentDefinitions.get("rewriter").root }),
    createBreakdownItem("许可守护代理", "sphere", { id: "part-guardian", objectId: agentDefinitions.get("guardian").root }),
    createBreakdownItem("档案代理", "sphere", { id: "part-archivist", objectId: agentDefinitions.get("archivist").root }),
  ],
  objects,
  director: {
    screenplay: screenplaySummary,
    timeline: {
      duration: 166,
      clips,
      issues: [],
      compiledScript: screenplaySummary,
      compiledAt: "2026-08-20T00:00:00.000Z",
    },
  },
});

const manifest = {
  version: 2,
  title: "不存在的窗 · 电影沙盒交互版",
  duration: 166,
  shots: shots.map(({ from, via, to, lookFrom, lookVia, lookTo, fov, ...shot }) => ({
    ...shot,
    preset: "perspective",
    camera: {
      fromPosition: from,
      positionPath: via?.length ? [from, ...via, to] : [],
      toPosition: to,
      fromLookAt: lookFrom,
      lookAtPath: lookVia?.length ? [lookFrom, ...lookVia, lookTo] : [],
      toLookAt: lookTo,
      fromFov: fov[0],
      toFov: fov[1],
    },
  })),
  interactionContract: {
    roomContinuity: "同一房间和物品贯穿全片，不再切换展示台。",
    agents: ["见证代理", "改写代理", "许可守护代理", "档案代理"],
    causalActions: ["检查", "追随", "触碰", "切断", "投射", "阻挡", "搬运", "拼装", "关闭", "归位"],
    humanBoundary: "角色为非人形空间代理，不制造人脸、人体或声音克隆。",
  },
  runtimeInterfaces: {
    assetReplacement: {
      format: "glTF 2.0 / GLB",
      objectField: "asset",
      bindings: ["root", "head", "effector", "statusLight"],
      animationSlots: ["idle", "move", "interact", "react"],
      invariant: "剧情和时间线引用角色根节点与语义绑定，不引用具体网格名称。",
    },
    semanticInteraction: {
      objectField: "interactionSpec",
      requiredParts: ["anchors", "affordances"],
      timelineClip: "interaction",
      invariant: "执行器对准目标锚点，接触距离由引擎计算。",
    },
    agentIntelligence: {
      observationBuilder: "src/agent-runtime.js#buildAgentObservation",
      intentValidator: "src/agent-runtime.js#validateAgentIntent",
      allowedIntentKinds: ["interact"],
      transformAuthority: "deterministic-runtime-only",
      invariant: "大模型只选择语义意图；路径、碰撞、动画和状态提交由场景运行时处理。",
    },
  },
  entities: {
    roles: [
      { key: "witness", label: "见证代理", objectId: agentDefinitions.get("witness").root },
      { key: "rewriter", label: "改写代理", objectId: agentDefinitions.get("rewriter").root },
      { key: "guardian", label: "许可守护代理", objectId: agentDefinitions.get("guardian").root },
      { key: "archivist", label: "档案代理", objectId: agentDefinitions.get("archivist").root },
    ],
    evidenceTraces: [
      { key: "photograph", label: "未改动照片", objectId: photoImage },
      { key: "voice", label: "非原始重演录音器", objectId: recorder },
      { key: "cup", label: "留存杯子", objectId: cupBody },
    ],
  },
};

if (project.objects.length < 150) throw new Error(`沙盒对象不足：${project.objects.length}`);
if (project.director.timeline.duration !== 166 || manifest.shots.length !== 19) throw new Error("时间线或镜头数异常。");
if (!project.director.timeline.clips.some((clip) => clip.type === "move" && clip.track === "character")) {
  throw new Error("缺少角色空间互动轨道。");
}

fs.writeFileSync(outputPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  ok: true,
  outputPath,
  manifestPath,
  objects: project.objects.length,
  clips: project.director.timeline.clips.length,
  characterClips: project.director.timeline.clips.filter((clip) => clip.track === "character").length,
  propClips: project.director.timeline.clips.filter((clip) => clip.track === "prop").length,
  shots: manifest.shots.length,
  duration: project.director.timeline.duration,
}, null, 2)}\n`);
