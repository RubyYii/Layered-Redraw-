export const SCHEMA_VERSION = 3;

export const OBJECT_TYPES = Object.freeze(["box", "sphere", "cylinder", "cone", "plane", "group"]);

export const TYPE_LABELS = Object.freeze({
  box: "立方体",
  sphere: "球体",
  cylinder: "圆柱体",
  cone: "圆锥体",
  plane: "平面",
  group: "层级根节点",
});

export const STAGES = Object.freeze(["blockout", "behavior", "screenplay", "texture", "render"]);
export const ENTITY_ROLES = Object.freeze(["character", "prop", "environment"]);
export const ROLE_LABELS = Object.freeze({
  character: "角色",
  prop: "物品",
  environment: "场景",
});
export const BODY_TYPES = Object.freeze(["static", "kinematic", "dynamic"]);
export const INTERACTION_TRIGGERS = Object.freeze(["script", "click"]);
export const INTERACTION_ACTIONS = Object.freeze(["none", "pulse", "spin", "toggleVisibility"]);

const TYPE_DEFAULTS = Object.freeze({
  box: { dimensions: [2, 2, 2], color: "#b9b1a4" },
  sphere: { dimensions: [2, 2, 2], color: "#91aaa5" },
  cylinder: { dimensions: [2, 2.5, 2], color: "#9da3b2" },
  cone: { dimensions: [2.4, 3, 2.4], color: "#b3937e" },
  plane: { dimensions: [6, 0.18, 6], color: "#65706b" },
  group: { dimensions: [1, 1, 1], color: "#ffffff" },
});

const ROLE_DEFAULTS = Object.freeze({
  character: {
    state: "待机",
    capabilities: {
      movable: true,
      rotatable: true,
      scalable: true,
      visibility: true,
      speakable: true,
      grabbable: false,
    },
    physics: { bodyType: "kinematic", mass: 70, friction: 0.65, restitution: 0 },
  },
  prop: {
    state: "默认",
    capabilities: {
      movable: true,
      rotatable: true,
      scalable: true,
      visibility: true,
      speakable: false,
      grabbable: true,
    },
    physics: { bodyType: "kinematic", mass: 1, friction: 0.5, restitution: 0.15 },
  },
  environment: {
    state: "固定",
    capabilities: {
      movable: false,
      rotatable: false,
      scalable: false,
      visibility: true,
      speakable: false,
      grabbable: false,
    },
    physics: { bodyType: "static", mass: 0, friction: 0.8, restitution: 0 },
  },
});

const TIMELINE_TYPES = new Set(["move", "rotate", "scale", "visibility", "dialogue", "camera", "attach", "interaction"]);
const TIMELINE_TRACKS = new Set(["camera", "character", "prop", "environment", "dialogue"]);

const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeVector = (value, fallback, minimum = -Infinity) => {
  const source = Array.isArray(value) ? value : fallback;
  return [0, 1, 2].map((index) => Math.max(minimum, finite(source[index], fallback[index])));
};

const normalizeColor = (value, fallback) => {
  const color = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
};

const cleanName = (value, fallback) => {
  const name = String(value ?? "").trim().slice(0, 48);
  return name || fallback;
};

const cleanText = (value, limit = 1200) => String(value ?? "").trim().slice(0, limit);
const cleanScript = (value) => String(value ?? "").replace(/\r\n?/g, "\n").slice(0, 20_000);

const normalizeTextureDataUrl = (value) => {
  const dataUrl = String(value ?? "");
  if (!dataUrl) return null;
  if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(dataUrl)) return null;
  if (dataUrl.length > 8_000_000) throw new Error("物体纹理数据过大，请压缩后重新导入。");
  return dataUrl;
};

const normalizeRender = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const lightSource = source.light && typeof source.light === "object" ? source.light : null;
  const lightIntensity = lightSource ? clamp(finite(lightSource.intensity, 0), 0, 40) : 0;
  return {
    roughness: clamp(finite(source.roughness, 0.7), 0, 1),
    metalness: clamp(finite(source.metalness, 0.02), 0, 1),
    opacity: clamp(finite(source.opacity, 1), 0.02, 1),
    emissive: normalizeColor(source.emissive, "#000000"),
    emissiveIntensity: clamp(finite(source.emissiveIntensity, 0), 0, 20),
    edge: source.edge !== false,
    textureDataUrl: normalizeTextureDataUrl(source.textureDataUrl),
    light: lightIntensity > 0 ? {
      color: normalizeColor(lightSource.color, "#ffffff"),
      intensity: lightIntensity,
      distance: clamp(finite(lightSource.distance, 8), 0.1, 100),
      decay: clamp(finite(lightSource.decay, 2), 0, 4),
    } : null,
  };
};

const normalizeStringMap = (value, limit = 32) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .slice(0, limit)
    .map(([key, entry]) => [cleanText(key, 48), cleanText(entry, 96)])
    .filter(([key, entry]) => key && entry));
};

const normalizeAsset = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rawUrl = cleanText(value.url, 512).replaceAll("\\", "/");
  const url = rawUrl && !/^(?:data|javascript):/i.test(rawUrl) ? rawUrl : null;
  return {
    url,
    scale: clamp(finite(value.scale, 1), 0.001, 1_000),
    forwardAxis: ["-Z", "+Z", "-X", "+X"].includes(value.forwardAxis) ? value.forwardAxis : "-Z",
    nodes: normalizeStringMap(value.nodes),
    animations: normalizeStringMap(value.animations),
    bones: normalizeStringMap(value.bones),
    expressions: normalizeStringMap(value.expressions),
  };
};

const normalizeMotion = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = ["hover", "wheel", "biped", "static"].includes(value.kind) ? value.kind : "static";
  return {
    kind,
    hoverAmplitude: clamp(finite(value.hoverAmplitude, kind === "hover" ? 0.035 : 0), 0, 0.3),
    hoverFrequency: clamp(finite(value.hoverFrequency, 0.72), 0, 8),
    leanDegrees: clamp(finite(value.leanDegrees, kind === "hover" ? 4 : 0), 0, 20),
    bankDegrees: clamp(finite(value.bankDegrees, kind === "hover" ? 5 : 0), 0, 25),
    phase: finite(value.phase, 0),
  };
};

const normalizeAnchorMap = (value, limit = 24) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .slice(0, limit)
    .map(([key, entry]) => [cleanText(key, 48), normalizeVector(entry, [0, 0, 0])])
    .filter(([key]) => key));
};

const normalizeAffordanceMap = (value, anchorNames, limit = 24) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .slice(0, limit)
    .map(([key, raw]) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const name = cleanText(key, 48);
      const targetAnchor = cleanText(raw.targetAnchor, 48);
      if (!name) return null;
      return [name, {
        action: cleanText(raw.action, 64) || name,
        targetAnchor: anchorNames.has(targetAnchor) ? targetAnchor : null,
        actorNode: cleanText(raw.actorNode, 48) || "effector",
        maxDistance: clamp(finite(raw.maxDistance, 1.25), 0.05, 100),
        resultingState: cleanText(raw.resultingState, 96) || null,
        requiresLineOfSight: raw.requiresLineOfSight !== false,
      }];
    })
    .filter(Boolean));
};

const normalizeInteractionSpec = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const anchors = normalizeAnchorMap(value.anchors);
  const affordances = normalizeAffordanceMap(value.affordances, new Set(Object.keys(anchors)));
  if (!Object.keys(anchors).length && !Object.keys(affordances).length) return null;
  return { anchors, affordances };
};

const normalizeVectorPath = (value, limit = 16) => (Array.isArray(value)
  ? value.filter((entry) => Array.isArray(entry)).slice(0, limit).map((entry) => normalizeVector(entry, [0, 0, 0]))
  : []);

const normalizeClipMotion = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    easing: ["linear", "smooth", "minimumJerk"].includes(value.easing) ? value.easing : "minimumJerk",
    orientToPath: value.orientToPath === true,
    leanDegrees: clamp(finite(value.leanDegrees, 0), 0, 20),
    bankDegrees: clamp(finite(value.bankDegrees, 0), -25, 25),
    turnPortion: clamp(finite(value.turnPortion, 0.24), 0.05, 1),
  };
};

const normalizeReference = (value) => {
  if (!value || typeof value !== "object") return null;
  const dataUrl = String(value.dataUrl ?? "");
  if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(dataUrl)) return null;
  if (dataUrl.length > 8_000_000) throw new Error("参考图数据过大，请压缩后重新导入。");
  return {
    dataUrl,
    name: cleanName(value.name, "概念参考图"),
    width: Math.max(1, Math.round(finite(value.width, 1))),
    height: Math.max(1, Math.round(finite(value.height, 1))),
    opacity: clamp(finite(value.opacity, 0.36), 0.08, 1),
    visible: value.visible !== false,
    prompt: cleanText(value.prompt),
  };
};

const inferRole = (type) => type === "plane" ? "environment" : "prop";

export function createEntityConfig(role = "prop", overrides = {}) {
  const safeRole = ENTITY_ROLES.includes(role) ? role : "prop";
  const defaults = ROLE_DEFAULTS[safeRole];
  const rawCapabilities = overrides.capabilities && typeof overrides.capabilities === "object"
    ? overrides.capabilities
    : {};
  const rawPhysics = overrides.physics && typeof overrides.physics === "object" ? overrides.physics : {};
  const rawInteraction = overrides.interaction && typeof overrides.interaction === "object"
    ? overrides.interaction
    : {};
  const bodyType = BODY_TYPES.includes(rawPhysics.bodyType) ? rawPhysics.bodyType : defaults.physics.bodyType;
  const trigger = INTERACTION_TRIGGERS.includes(rawInteraction.trigger) ? rawInteraction.trigger : "script";
  const action = INTERACTION_ACTIONS.includes(rawInteraction.action) ? rawInteraction.action : "none";

  return {
    role: safeRole,
    state: cleanName(overrides.state, defaults.state),
    capabilities: Object.fromEntries(
      Object.entries(defaults.capabilities).map(([key, fallback]) => [
        key,
        typeof rawCapabilities[key] === "boolean" ? rawCapabilities[key] : fallback,
      ]),
    ),
    physics: {
      bodyType,
      mass: bodyType === "static" ? 0 : clamp(finite(rawPhysics.mass, defaults.physics.mass), 0, 100_000),
      friction: clamp(finite(rawPhysics.friction, defaults.physics.friction), 0, 1),
      restitution: clamp(finite(rawPhysics.restitution, defaults.physics.restitution), 0, 1),
    },
    interaction: {
      trigger,
      action,
      amount: clamp(finite(rawInteraction.amount, 1.35), 1.05, 4),
    },
  };
}

export function createBreakdownItem(name, type = "box", overrides = {}) {
  const safeType = OBJECT_TYPES.includes(type) ? type : "box";
  return {
    id: String(overrides.id || makeId("part")),
    name: cleanName(name, TYPE_LABELS[safeType]),
    type: safeType,
    objectId: overrides.objectId ? String(overrides.objectId) : null,
  };
}

export function makeId(prefix = "object") {
  const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${token}`;
}

export function createSceneObject(type = "box", overrides = {}) {
  const safeType = OBJECT_TYPES.includes(type) ? type : "box";
  const defaults = TYPE_DEFAULTS[safeType];
  const dimensions = normalizeVector(overrides.dimensions, defaults.dimensions, 0.05);
  const fallbackPosition = safeType === "group" ? [0, 0, 0] : [0, dimensions[1] / 2, 0];
  const requestedRole = overrides.entity?.role ?? overrides.role ?? inferRole(safeType);

  return {
    id: String(overrides.id || makeId(safeType)),
    type: safeType,
    name: cleanName(overrides.name, TYPE_LABELS[safeType]),
    parentId: overrides.parentId ? String(overrides.parentId) : null,
    nodeRole: cleanText(overrides.nodeRole, 48) || null,
    position: normalizeVector(overrides.position, fallbackPosition),
    rotation: normalizeVector(overrides.rotation, [0, 0, 0]),
    dimensions,
    scale: normalizeVector(overrides.scale, [1, 1, 1], 0.01),
    color: normalizeColor(overrides.color, defaults.color),
    visible: overrides.visible !== false,
    locked: overrides.locked === true,
    render: normalizeRender(overrides.render),
    asset: normalizeAsset(overrides.asset),
    motion: normalizeMotion(overrides.motion),
    interactionSpec: normalizeInteractionSpec(overrides.interactionSpec),
    entity: createEntityConfig(requestedRole, overrides.entity ?? {}),
  };
}

const normalizeIssue = (value) => {
  if (!value || typeof value !== "object") return null;
  const severity = ["error", "warning", "info"].includes(value.severity) ? value.severity : "warning";
  return {
    severity,
    line: Math.max(0, Math.round(finite(value.line, 0))),
    message: cleanText(value.message, 240) || "未知编译提示",
  };
};

const normalizeClip = (value, objectIds) => {
  if (!value || typeof value !== "object" || !TIMELINE_TYPES.has(value.type)) return null;
  const targetId = value.targetId && objectIds.has(String(value.targetId)) ? String(value.targetId) : null;
  const secondaryTargetId = value.secondaryTargetId && objectIds.has(String(value.secondaryTargetId))
    ? String(value.secondaryTargetId)
    : null;
  if (value.type !== "camera" && !targetId) return null;
  const preset = ["perspective", "front", "side", "top"].includes(value.preset)
    ? value.preset
    : "perspective";
  const fromPreset = ["perspective", "front", "side", "top"].includes(value.fromPreset)
    ? value.fromPreset
    : "perspective";

  return {
    id: String(value.id || makeId("clip")),
    type: value.type,
    track: TIMELINE_TRACKS.has(value.track) ? value.track : "prop",
    label: cleanText(value.label, 80) || value.type,
    line: Math.max(0, Math.round(finite(value.line, 0))),
    start: clamp(finite(value.start, 0), 0, 86_400),
    duration: clamp(finite(value.duration, 0.5), 0.05, 86_400),
    targetId,
    secondaryTargetId,
    from: Array.isArray(value.from) ? normalizeVector(value.from, [0, 0, 0]) : value.from,
    to: Array.isArray(value.to) ? normalizeVector(value.to, [0, 0, 0]) : value.to,
    offset: normalizeVector(value.offset, [0.65, 0.8, 0]),
    text: cleanText(value.text, 500),
    action: cleanText(value.action, 64),
    targetAnchor: cleanText(value.targetAnchor, 48) || null,
    actorNode: cleanText(value.actorNode, 48) || null,
    resultingState: cleanText(value.resultingState, 96) || null,
    preset,
    fromPreset,
    framing: clamp(finite(value.framing, 1), 0.25, 4),
    fromFraming: clamp(finite(value.fromFraming, 1), 0.25, 4),
    fromPosition: Array.isArray(value.fromPosition) ? normalizeVector(value.fromPosition, [0, 0, 0]) : null,
    toPosition: Array.isArray(value.toPosition) ? normalizeVector(value.toPosition, [0, 0, 0]) : null,
    fromLookAt: Array.isArray(value.fromLookAt) ? normalizeVector(value.fromLookAt, [0, 0, 0]) : null,
    toLookAt: Array.isArray(value.toLookAt) ? normalizeVector(value.toLookAt, [0, 0, 0]) : null,
    path: normalizeVectorPath(value.path),
    positionPath: normalizeVectorPath(value.positionPath),
    lookAtPath: normalizeVectorPath(value.lookAtPath),
    motion: normalizeClipMotion(value.motion),
    fromYaw: Number.isFinite(Number(value.fromYaw)) ? finite(value.fromYaw, 0) : null,
    toYaw: Number.isFinite(Number(value.toYaw)) ? finite(value.toYaw, 0) : null,
    fromFov: clamp(finite(value.fromFov, 42), 18, 85),
    toFov: clamp(finite(value.toFov, 42), 18, 85),
    fromTargetId: value.fromTargetId && objectIds.has(String(value.fromTargetId))
      ? String(value.fromTargetId)
      : null,
  };
};

const normalizeDirector = (value, objectIds) => {
  const source = value && typeof value === "object" ? value : {};
  const rawTimeline = source.timeline && typeof source.timeline === "object" ? source.timeline : {};
  const clips = (Array.isArray(rawTimeline.clips) ? rawTimeline.clips : [])
    .map((clip) => normalizeClip(clip, objectIds))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.line - b.line);
  const inferredDuration = clips.reduce((maximum, clip) => Math.max(maximum, clip.start + clip.duration), 0);

  return {
    screenplay: cleanScript(source.screenplay),
    timeline: {
      duration: clamp(finite(rawTimeline.duration, inferredDuration), inferredDuration, 86_400),
      clips,
      issues: (Array.isArray(rawTimeline.issues) ? rawTimeline.issues : []).map(normalizeIssue).filter(Boolean),
      compiledScript: cleanScript(rawTimeline.compiledScript),
      compiledAt: rawTimeline.compiledAt ? String(rawTimeline.compiledAt) : null,
    },
  };
};

export function normalizeProject(input = {}) {
  if (Number(input.schemaVersion) > SCHEMA_VERSION) {
    throw new Error(`此文件使用较新的项目格式（v${input.schemaVersion}），当前版本无法安全载入。`);
  }

  const seenIds = new Set();
  const objects = (Array.isArray(input.objects) ? input.objects : []).map((rawObject) => {
    const object = createSceneObject(rawObject?.type, rawObject ?? {});
    if (seenIds.has(object.id)) object.id = makeId(object.type);
    seenIds.add(object.id);
    return object;
  });

  const objectIds = new Set(objects.map((object) => object.id));
  for (const object of objects) {
    if (!objectIds.has(object.parentId) || object.parentId === object.id) object.parentId = null;
  }
  const objectById = new Map(objects.map((object) => [object.id, object]));
  for (const object of objects) {
    const visited = new Set([object.id]);
    let parentId = object.parentId;
    while (parentId) {
      if (visited.has(parentId)) {
        object.parentId = null;
        break;
      }
      visited.add(parentId);
      parentId = objectById.get(parentId)?.parentId ?? null;
    }
  }
  const seenBreakdownIds = new Set();
  const breakdown = (Array.isArray(input.breakdown) ? input.breakdown : []).map((rawItem) => {
    const item = createBreakdownItem(rawItem?.name, rawItem?.type, rawItem ?? {});
    if (seenBreakdownIds.has(item.id)) item.id = makeId("part");
    seenBreakdownIds.add(item.id);
    if (!objectIds.has(item.objectId)) item.objectId = null;
    return item;
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    id: String(input.id || makeId("project")),
    name: cleanName(input.name, "未命名场景"),
    stage: STAGES.includes(input.stage) ? input.stage : "blockout",
    units: "m",
    updatedAt: String(input.updatedAt || now()),
    reference: normalizeReference(input.reference),
    breakdown,
    objects,
    director: normalizeDirector(input.director, objectIds),
  };
}

export function createEmptyProject(name = "未命名场景") {
  return normalizeProject({ name, objects: [], director: { screenplay: "" } });
}

export const STARTER_SCREENPLAY = `# 每行一个动作，按顺序执行
镜头切到透视，用时 0.8 秒
探索者 移动到 (-1.5, 1, 2)，用时 2 秒
探索者：我看到能量核心了。
镜头聚焦 能量核心，用时 1 秒
能量核心 放大 1.6 倍，用时 1 秒
能量核心 移动到 (0, 3.4, 0)，用时 1.5 秒
等待 0.5 秒
探索者 移动到 能量核心，用时 2 秒
能量核心 隐藏`;

export function createStarterProject() {
  return normalizeProject({
    name: "入口构造与剧本练习",
    stage: "blockout",
    director: { screenplay: STARTER_SCREENPLAY },
    objects: [
      createSceneObject("plane", {
        name: "地面基板",
        position: [0, -0.1, 0],
        dimensions: [16, 0.2, 16],
        color: "#58615d",
        locked: true,
        entity: createEntityConfig("environment"),
      }),
      createSceneObject("box", {
        name: "中央台座",
        position: [0, 0.45, 0],
        dimensions: [7, 0.9, 5],
        color: "#a39b8f",
        entity: createEntityConfig("environment"),
      }),
      createSceneObject("box", {
        name: "左侧立柱",
        position: [-2.45, 2.7, 0],
        dimensions: [0.9, 4.5, 0.9],
        color: "#b9b1a4",
        entity: createEntityConfig("environment"),
      }),
      createSceneObject("box", {
        name: "右侧立柱",
        position: [2.45, 2.7, 0],
        dimensions: [0.9, 4.5, 0.9],
        color: "#b9b1a4",
        entity: createEntityConfig("environment"),
      }),
      createSceneObject("box", {
        name: "顶部横梁",
        position: [0, 5.05, 0],
        dimensions: [5.8, 0.8, 0.9],
        color: "#a69d90",
        entity: createEntityConfig("environment"),
      }),
      createSceneObject("sphere", {
        name: "能量核心",
        position: [0, 2.4, 0],
        dimensions: [1.55, 1.55, 1.55],
        color: "#d29a4b",
        entity: createEntityConfig("prop", {
          interaction: { trigger: "click", action: "pulse", amount: 1.5 },
        }),
      }),
      createSceneObject("box", {
        name: "探索者",
        position: [-4, 1, 3],
        dimensions: [0.8, 2, 0.8],
        color: "#6f9fbd",
        entity: createEntityConfig("character"),
      }),
      createSceneObject("sphere", {
        name: "发光钥匙",
        position: [2.3, 0.5, 2.2],
        dimensions: [0.45, 0.45, 0.45],
        color: "#e6c868",
        entity: createEntityConfig("prop", {
          interaction: { trigger: "click", action: "spin", amount: 1.35 },
        }),
      }),
    ],
  });
}

export function serializeProject(project) {
  return JSON.stringify(normalizeProject(project), null, 2);
}

export function parseProject(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("这不是有效的 JSON 项目文件。请检查文件是否完整。");
  }
  return normalizeProject(parsed);
}

export class SceneStore {
  constructor(project = createStarterProject()) {
    this.project = normalizeProject(project);
    this.selectionId = null;
    this.tool = "translate";
    this.listeners = new Set();
    this.history = [clone(this.project)];
    this.historyIndex = 0;
  }

  getState() {
    return {
      project: this.project,
      selectionId: this.selectionId,
      tool: this.tool,
      canUndo: this.historyIndex > 0,
      canRedo: this.historyIndex < this.history.length - 1,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  emit() {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  checkpoint() {
    const previous = this.history[this.historyIndex];
    if (JSON.stringify(previous) === JSON.stringify(this.project)) return false;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(clone(this.project));
    this.historyIndex = this.history.length - 1;
    this.emit();
    return true;
  }

  mutate(mutator, { history = true } = {}) {
    const draft = clone(this.project);
    mutator(draft);
    draft.updatedAt = now();
    this.project = normalizeProject(draft);
    if (history) this.checkpoint();
    else this.emit();
  }

  setSelection(id) {
    const nextId = this.project.objects.some((object) => object.id === id) ? id : null;
    if (nextId === this.selectionId) return;
    this.selectionId = nextId;
    this.emit();
  }

  setTool(tool) {
    if (!["translate", "rotate", "scale"].includes(tool) || tool === this.tool) return;
    this.tool = tool;
    this.emit();
  }

  setProjectName(name) {
    this.mutate((project) => {
      project.name = cleanName(name, project.name);
    });
  }

  setStage(stage) {
    if (!STAGES.includes(stage) || stage === this.project.stage) return;
    this.mutate((project) => {
      project.stage = stage;
    });
  }

  addObject(type, overrides = {}) {
    const safeType = OBJECT_TYPES.includes(type) ? type : "box";
    const siblingCount = this.project.objects.filter((object) => object.type === safeType).length;
    const offsetStep = Math.ceil(this.project.objects.length / 2) * 0.6;
    const xOffset = this.project.objects.length === 0
      ? 0
      : offsetStep * (this.project.objects.length % 2 === 0 ? -1 : 1);
    const object = createSceneObject(safeType, {
      ...overrides,
      name: overrides.name || `${TYPE_LABELS[safeType]} ${siblingCount + 1}`,
      position: overrides.position ?? [xOffset, TYPE_DEFAULTS[safeType].dimensions[1] / 2, 0],
    });
    this.mutate((project) => {
      project.objects.push(object);
      project.director.timeline.compiledScript = "";
    });
    this.selectionId = object.id;
    this.emit();
    return object.id;
  }

  updateObject(id, patch, options = {}) {
    if (!this.project.objects.some((object) => object.id === id)) return false;
    this.mutate((project) => {
      const index = project.objects.findIndex((object) => object.id === id);
      const current = project.objects[index];
      project.objects[index] = createSceneObject(current.type, {
        ...current,
        ...patch,
        entity: patch.entity ?? current.entity,
        id: current.id,
        type: current.type,
      });
      project.director.timeline.compiledScript = "";
    }, options);
    return true;
  }

  setEntityRole(id, role) {
    if (!ENTITY_ROLES.includes(role)) return false;
    return this.updateObject(id, { entity: createEntityConfig(role) });
  }

  updateEntity(id, patch, options = {}) {
    const object = this.project.objects.find((candidate) => candidate.id === id);
    if (!object) return false;
    const next = {
      ...object.entity,
      ...patch,
      capabilities: { ...object.entity.capabilities, ...(patch.capabilities ?? {}) },
      physics: { ...object.entity.physics, ...(patch.physics ?? {}) },
      interaction: { ...object.entity.interaction, ...(patch.interaction ?? {}) },
    };
    return this.updateObject(id, { entity: createEntityConfig(next.role, next) }, options);
  }

  setScreenplay(screenplay, options = {}) {
    this.mutate((project) => {
      project.director.screenplay = cleanScript(screenplay);
    }, options);
  }

  setTimeline(timeline, options = {}) {
    this.mutate((project) => {
      project.director.timeline = timeline;
    }, options);
  }

  duplicateObject(id = this.selectionId) {
    const source = this.project.objects.find((object) => object.id === id);
    if (!source) return null;
    const duplicate = createSceneObject(source.type, {
      ...clone(source),
      id: makeId(source.type),
      name: `${source.name} 副本`,
      position: [source.position[0] + 0.6, source.position[1], source.position[2] + 0.6],
      locked: false,
    });
    this.mutate((project) => {
      project.objects.push(duplicate);
      project.director.timeline.compiledScript = "";
    });
    this.selectionId = duplicate.id;
    this.emit();
    return duplicate.id;
  }

  deleteObject(id = this.selectionId) {
    const object = this.project.objects.find((candidate) => candidate.id === id);
    if (!object || object.locked) return false;
    this.mutate((project) => {
      project.objects = project.objects.filter((candidate) => candidate.id !== id);
      project.objects.forEach((candidate) => {
        if (candidate.parentId === id) candidate.parentId = null;
      });
      project.breakdown.forEach((item) => {
        if (item.objectId === id) item.objectId = null;
      });
      project.director.timeline.compiledScript = "";
    });
    if (this.selectionId === id) this.selectionId = null;
    this.emit();
    return true;
  }

  toggleVisibility(id) {
    const object = this.project.objects.find((candidate) => candidate.id === id);
    if (object) this.updateObject(id, { visible: !object.visible });
  }

  toggleLock(id) {
    const object = this.project.objects.find((candidate) => candidate.id === id);
    if (object) this.updateObject(id, { locked: !object.locked });
  }

  setReference(reference) {
    this.mutate((project) => {
      project.reference = normalizeReference(reference);
    });
  }

  updateReference(patch, options = {}) {
    if (!this.project.reference) return false;
    this.mutate((project) => {
      project.reference = normalizeReference({ ...project.reference, ...patch });
    }, options);
    return true;
  }

  removeReference() {
    if (!this.project.reference) return false;
    this.mutate((project) => {
      project.reference = null;
    });
    return true;
  }

  addBreakdownItem(name, type) {
    const item = createBreakdownItem(name, type);
    this.mutate((project) => project.breakdown.push(item));
    return item.id;
  }

  removeBreakdownItem(id) {
    if (!this.project.breakdown.some((item) => item.id === id)) return false;
    this.mutate((project) => {
      project.breakdown = project.breakdown.filter((item) => item.id !== id);
    });
    return true;
  }

  buildBreakdownItem(id) {
    const item = this.project.breakdown.find((candidate) => candidate.id === id);
    if (!item) return null;
    if (item.objectId && this.project.objects.some((object) => object.id === item.objectId)) {
      this.setSelection(item.objectId);
      return item.objectId;
    }
    const offsetStep = Math.ceil(this.project.objects.length / 2) * 0.6;
    const xOffset = this.project.objects.length === 0
      ? 0
      : offsetStep * (this.project.objects.length % 2 === 0 ? -1 : 1);
    const object = createSceneObject(item.type, {
      name: item.name,
      position: [xOffset, TYPE_DEFAULTS[item.type].dimensions[1] / 2, 0],
    });
    this.mutate((project) => {
      project.objects.push(object);
      const linkedItem = project.breakdown.find((candidate) => candidate.id === id);
      if (linkedItem) linkedItem.objectId = object.id;
      project.director.timeline.compiledScript = "";
    });
    this.selectionId = object.id;
    this.emit();
    return object.id;
  }

  replaceProject(project) {
    this.project = normalizeProject(project);
    this.selectionId = null;
    this.history = [clone(this.project)];
    this.historyIndex = 0;
    this.emit();
  }

  undo() {
    if (this.historyIndex <= 0) return false;
    this.historyIndex -= 1;
    this.project = clone(this.history[this.historyIndex]);
    if (!this.project.objects.some((object) => object.id === this.selectionId)) this.selectionId = null;
    this.emit();
    return true;
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) return false;
    this.historyIndex += 1;
    this.project = clone(this.history[this.historyIndex]);
    if (!this.project.objects.some((object) => object.id === this.selectionId)) this.selectionId = null;
    this.emit();
    return true;
  }
}

export const numeric = { clamp, finite };
