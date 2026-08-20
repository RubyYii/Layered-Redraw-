import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  SceneStore,
  createEmptyProject,
  createEntityConfig,
  createSceneObject,
  normalizeProject,
} from "./model.js";
import { compileScreenplay, evaluateTimeline, formatTimecode } from "./director.js";

const createDirectorProject = () => {
  const project = createEmptyProject("导演测试");
  project.objects = [
    createSceneObject("box", {
      id: "actor",
      name: "探索者",
      position: [0, 1, 0],
      entity: createEntityConfig("character"),
    }),
    createSceneObject("sphere", {
      id: "core",
      name: "能量核心",
      position: [4, 2, 0],
      entity: createEntityConfig("prop"),
    }),
  ];
  return normalizeProject(project);
};

describe("schema v3 entity migration", () => {
  it("migrates v2 objects to safe entity and director defaults", () => {
    const migrated = normalizeProject({
      schemaVersion: 2,
      name: "旧项目",
      objects: [
        { id: "ground", type: "plane", name: "地面" },
        { id: "box", type: "box", name: "箱子" },
      ],
    });

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.objects[0].entity.role).toBe("environment");
    expect(migrated.objects[1].entity.role).toBe("prop");
    expect(migrated.director.screenplay).toBe("");
    expect(migrated.director.timeline.clips).toEqual([]);
  });

  it("repairs corrupted roles and clamps physics properties", () => {
    const object = createSceneObject("box", {
      entity: {
        role: "spaceship",
        physics: { bodyType: "unknown", mass: -20, friction: 9, restitution: -2 },
      },
    });

    expect(object.entity.role).toBe("prop");
    expect(object.entity.physics.bodyType).toBe("kinematic");
    expect(object.entity.physics.mass).toBe(0);
    expect(object.entity.physics.friction).toBe(1);
    expect(object.entity.physics.restitution).toBe(0);
  });

  it("invalidates compiled screenplay when entity data changes", () => {
    const project = createDirectorProject();
    project.director.screenplay = "探索者 移动到 (2, 1, 0)，用时 1 秒";
    project.director.timeline = compileScreenplay(project.director.screenplay, project);
    const store = new SceneStore(project);

    store.updateEntity("actor", { capabilities: { movable: false } });

    expect(store.getState().project.director.timeline.compiledScript).toBe("");
  });
});

describe("Chinese screenplay compiler", () => {
  it("compiles camera, movement, dialogue, scale and visibility into ordered clips", () => {
    const project = createDirectorProject();
    const script = [
      "镜头切到透视，用时 0.5 秒",
      "探索者 移动到（2，1，0），用时 2 秒",
      "探索者：目标就在前面。",
      "镜头聚焦 能量核心，用时 0.5 秒",
      "能量核心 放大 1.5 倍，用时 1 秒",
      "能量核心 隐藏",
    ].join("\n");

    const timeline = compileScreenplay(script, project);

    expect(timeline.issues.filter((item) => item.severity === "error")).toEqual([]);
    expect(timeline.clips.map((clip) => clip.type)).toEqual([
      "camera",
      "move",
      "dialogue",
      "camera",
      "scale",
      "visibility",
    ]);
    expect(timeline.clips[1].from).toEqual([0, 1, 0]);
    expect(timeline.clips[1].to).toEqual([2, 1, 0]);
    expect(timeline.duration).toBeGreaterThan(5);
  });

  it("reports line-specific errors for unknown subjects and malformed vectors", () => {
    const project = createDirectorProject();
    const timeline = compileScreenplay([
      "不存在的角色 移动到 (1, 1, 1)",
      "探索者 旋转到 (0, 90)",
    ].join("\n"), project);

    expect(timeline.clips).toEqual([]);
    expect(timeline.issues.map((item) => item.line)).toEqual([1, 2]);
    expect(timeline.issues.every((item) => item.severity === "error")).toBe(true);
  });

  it("enforces per-entity capabilities", () => {
    const project = createDirectorProject();
    project.objects[1].entity.capabilities.scalable = false;
    const timeline = compileScreenplay("能量核心 放大 2 倍，用时 1 秒", project);

    expect(timeline.clips).toEqual([]);
    expect(timeline.issues[0].message).toMatch(/没有开启缩放能力/);
  });
});

describe("timeline evaluation", () => {
  it("uses absolute time interpolation without mutating project objects", () => {
    const project = createDirectorProject();
    const originalPosition = [...project.objects[0].position];
    project.director.screenplay = "探索者 移动到 (4, 1, 0)，用时 2 秒";
    project.director.timeline = compileScreenplay(project.director.screenplay, project);

    const frame = evaluateTimeline(project, 1);

    expect(frame.objects.actor.position[0]).toBeCloseTo(2, 5);
    expect(project.objects[0].position).toEqual(originalPosition);
  });

  it("keeps attached props following their holder", () => {
    const project = createDirectorProject();
    project.director.screenplay = [
      "探索者 拿起 能量核心，用时 0.5 秒",
      "探索者 移动到 (3, 1, 2)，用时 2 秒",
    ].join("\n");
    project.director.timeline = compileScreenplay(project.director.screenplay, project);

    const frame = evaluateTimeline(project, project.director.timeline.duration);

    expect(frame.objects.core.position).toEqual([3.65, 1.8, 2]);
  });

  it("exposes active semantic interactions and commits their resulting state", () => {
    const project = normalizeProject({
      objects: [
        { id: "actor", type: "group", entity: createEntityConfig("character") },
        {
          id: "recorder",
          type: "box",
          entity: createEntityConfig("prop", { state: "idle" }),
          interactionSpec: {
            anchors: { switch: [0, 0.2, 0.3] },
            affordances: {
              interrupt: {
                action: "interrupt_audio",
                targetAnchor: "switch",
                actorNode: "effector",
                resultingState: "muted",
              },
            },
          },
        },
      ],
      director: {
        timeline: {
          duration: 2,
          clips: [{
            id: "interrupt",
            type: "interaction",
            track: "character",
            start: 0,
            duration: 1,
            targetId: "recorder",
            secondaryTargetId: "actor",
            action: "interrupt_audio",
            targetAnchor: "switch",
            actorNode: "effector",
            resultingState: "muted",
          }],
        },
      },
    });

    const active = evaluateTimeline(project, 0.5);
    const completed = evaluateTimeline(project, 1.5);

    expect(active.interactions[0]).toMatchObject({
      actorId: "actor",
      targetId: "recorder",
      action: "interrupt_audio",
      targetAnchor: "switch",
      actorNode: "effector",
    });
    expect(active.objects.recorder.semanticState).toBe("idle");
    expect(completed.interactions).toEqual([]);
    expect(completed.objects.recorder.semanticState).toBe("muted");
  });

  it("formats 24fps editor timecodes", () => {
    expect(formatTimecode(62.5)).toBe("01:02:12");
  });
});
