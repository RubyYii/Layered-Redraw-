import {
  lerpAngleDegrees,
  progressForMotion,
  sampleVectorPath,
  smoothstep,
  tangentForVectorPath,
  yawForDirection,
} from "./motion.js";
import { attachmentPosition, interactionPhaseForProgress } from "./interaction-runtime.js";
import {
  FixedStepClock,
  SIMULATION_HZ,
  resolveInteractionSimulation,
} from "./simulation-runtime.js";
import {
  mergeCollisionReports,
  resolveCharacterCollisions,
  resolvePropCollisions,
} from "./collision-runtime.js";

const NUMBER = "-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
const VECTOR_PATTERN = new RegExp(`[（(]\\s*(${NUMBER})\\s*[,，、\\s]+\\s*(${NUMBER})\\s*[,，、\\s]+\\s*(${NUMBER})\\s*[)）]`);
const DURATION_PATTERN = /(?:[,，]\s*)?(?:用时|持续)\s*(\d+(?:\.\d+)?)\s*秒/;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, precision = 4) => Number(value.toFixed(precision));
const cloneVector = (value) => value.map(Number);
const lerpVector = (from, to, progress) => from.map((value, index) => value + (to[index] - value) * progress);
const projectLookupCache = new WeakMap();

const sourceLookupFor = (project) => {
  let lookup = projectLookupCache.get(project);
  if (lookup) return lookup;
  lookup = new Map(project.objects.map((object) => [object.id, object]));
  projectLookupCache.set(project, lookup);
  return lookup;
};

const clipId = (line, index, type) => `clip-${String(line).padStart(3, "0")}-${index}-${type}`;
const trackFor = (object) => object?.entity?.role ?? "prop";

const durationFrom = (line, fallback) => {
  const match = line.match(DURATION_PATTERN);
  return match ? clamp(Number(match[1]), 0.05, 600) : fallback;
};

const withoutDuration = (line) => line.replace(DURATION_PATTERN, "").trim().replace(/[,，。.]$/, "").trim();

const vectorFrom = (text) => {
  const match = text.match(VECTOR_PATTERN);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

const sortedObjects = (project) => [...project.objects].sort((a, b) => b.name.length - a.name.length);

const consumeSubject = (line, objects) => {
  const unquoted = line.replace(/^“/, "");
  for (const object of objects) {
    if (unquoted.startsWith(`${object.name}”`)) {
      return { object, rest: unquoted.slice(object.name.length + 1).trim() };
    }
    if (unquoted.startsWith(object.name)) {
      return { object, rest: unquoted.slice(object.name.length).trim() };
    }
  }
  return null;
};

const resolveMention = (text, objects, excludedId = null) => (
  objects.find((object) => object.id !== excludedId && text.includes(object.name)) ?? null
);

const issue = (severity, line, message) => ({ severity, line, message });

const capabilityFor = Object.freeze({
  move: "movable",
  rotate: "rotatable",
  scale: "scalable",
  visibility: "visibility",
  dialogue: "speakable",
});

const capabilityLabel = Object.freeze({
  movable: "移动",
  rotatable: "旋转",
  scalable: "缩放",
  visibility: "显隐",
  speakable: "对白",
});

const hasCapability = (object, type, line, issues) => {
  const key = capabilityFor[type];
  if (!key || object.entity.capabilities[key]) return true;
  issues.push(issue("error", line, `“${object.name}”没有开启${capabilityLabel[key]}能力。`));
  return false;
};

const cameraPresetFrom = (text) => {
  if (/(?:正面|前视|前)/.test(text)) return "front";
  if (/(?:侧面|侧视|侧)/.test(text)) return "side";
  if (/(?:顶视|顶部|顶)/.test(text)) return "top";
  return "perspective";
};

export const SCREENPLAY_SYNTAX = Object.freeze([
  "镜头切到透视，用时 0.8 秒",
  "角色 移动到 (x, y, z)，用时 2 秒",
  "角色 移动到 物品，用时 2 秒",
  "物品 旋转到 (0, 90, 0)，用时 1 秒",
  "物品 放大 1.5 倍，用时 1 秒",
  "物品 隐藏",
  "角色：这里是一句对白。",
  "角色 将 物品 交给 另一角色，用时 1 秒",
  "角色 将 物品 放到 接触面，用时 1 秒",
  "等待 0.5 秒",
]);

export function compileScreenplay(screenplay, project) {
  const source = String(screenplay ?? "").replace(/\r\n?/g, "\n").slice(0, 20_000);
  const objects = sortedObjects(project);
  const states = new Map(project.objects.map((object) => [object.id, {
    position: cloneVector(object.position),
    rotation: cloneVector(object.rotation),
    scale: cloneVector(object.scale),
    visible: object.visible,
  }]));
  const clips = [];
  const issues = [];
  const owners = new Map();
  let cursor = 0;
  let cameraState = { preset: "perspective", targetId: null };

  const addClip = (line, type, data) => {
    const clip = {
      id: clipId(line, clips.length, type),
      type,
      line,
      start: round(cursor),
      duration: round(data.duration),
      ...data,
    };
    clips.push(clip);
    cursor = round(cursor + clip.duration);
    return clip;
  };

  source.split("\n").forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || /^(?:场景|地点|时间)[：:]/.test(line)) return;

    const waitMatch = line.match(/^等待\s*(\d+(?:\.\d+)?)\s*秒[。.]?$/);
    if (waitMatch) {
      cursor = round(cursor + clamp(Number(waitMatch[1]), 0.05, 600));
      return;
    }

    if (/^镜头/.test(line)) {
      const cleanLine = withoutDuration(line);
      const duration = durationFrom(line, 0.8);
      const focusMatch = cleanLine.match(/^镜头(?:聚焦|看向|跟随)\s*(.+)$/);
      if (focusMatch) {
        const target = resolveMention(focusMatch[1], objects);
        if (!target) {
          issues.push(issue("error", lineNumber, "镜头目标不存在，请使用场景层级中的完整物体名称。"));
          return;
        }
        addClip(lineNumber, "camera", {
          track: "camera",
          label: `聚焦 · ${target.name}`,
          targetId: target.id,
          preset: "perspective",
          fromPreset: cameraState.preset,
          fromTargetId: cameraState.targetId,
          duration,
        });
        cameraState = { preset: "perspective", targetId: target.id };
        return;
      }
      if (/^镜头(?:切到|切换到)?\s*(?:透视|正面|前视|前|侧面|侧视|侧|顶视|顶部|顶)/.test(cleanLine)) {
        const preset = cameraPresetFrom(cleanLine);
        addClip(lineNumber, "camera", {
          track: "camera",
          label: `镜头 · ${{ perspective: "透视", front: "前视", side: "侧视", top: "顶视" }[preset]}`,
          targetId: null,
          preset,
          fromPreset: cameraState.preset,
          fromTargetId: cameraState.targetId,
          duration,
        });
        cameraState = { preset, targetId: null };
        return;
      }
      issues.push(issue("error", lineNumber, "无法识别镜头指令。可使用“镜头切到透视”或“镜头聚焦 物体名”。"));
      return;
    }

    const subject = consumeSubject(line, objects);
    if (!subject) {
      issues.push(issue("error", lineNumber, "找不到动作主体，请以场景层级中的完整物体名称开头。"));
      return;
    }

    const { object, rest } = subject;
    const state = states.get(object.id);
    const duration = durationFrom(line, 1);
    const action = withoutDuration(rest);
    const dialogueMatch = action.match(/^[：:]\s*(.+)$/);
    if (dialogueMatch) {
      if (!hasCapability(object, "dialogue", lineNumber, issues)) return;
      const text = dialogueMatch[1].trim();
      const dialogueDuration = durationFrom(line, clamp(1.2 + text.length * 0.09, 1.5, 6));
      addClip(lineNumber, "dialogue", {
        track: "dialogue",
        label: `${object.name} · 对白`,
        targetId: object.id,
        text,
        duration: dialogueDuration,
      });
      return;
    }

    if (/^(?:移动到|走到)/.test(action)) {
      if (!hasCapability(object, "move", lineNumber, issues)) return;
      const explicitPosition = vectorFrom(action);
      const destination = explicitPosition ? null : resolveMention(action, objects, object.id);
      if (!explicitPosition && !destination) {
        issues.push(issue("error", lineNumber, "移动指令需要坐标 (x, y, z) 或另一个物体名称。"));
        return;
      }
      const destinationState = destination ? states.get(destination.id) : null;
      const to = explicitPosition ?? [destinationState.position[0], state.position[1], destinationState.position[2] + 1.25];
      addClip(lineNumber, "move", {
        track: trackFor(object),
        label: `${object.name} · 移动`,
        targetId: object.id,
        from: cloneVector(state.position),
        to: cloneVector(to),
        duration,
      });
      state.position = cloneVector(to);
      return;
    }

    if (/^旋转到/.test(action)) {
      if (!hasCapability(object, "rotate", lineNumber, issues)) return;
      const to = vectorFrom(action);
      if (!to) {
        issues.push(issue("error", lineNumber, "旋转指令需要三个角度，例如 (0, 90, 0)。"));
        return;
      }
      addClip(lineNumber, "rotate", {
        track: trackFor(object),
        label: `${object.name} · 旋转`,
        targetId: object.id,
        from: cloneVector(state.rotation),
        to: cloneVector(to),
        duration,
      });
      state.rotation = cloneVector(to);
      return;
    }

    if (/^打开/.test(action)) {
      if (!hasCapability(object, "rotate", lineNumber, issues)) return;
      const to = [state.rotation[0], state.rotation[1] + 90, state.rotation[2]];
      addClip(lineNumber, "rotate", {
        track: trackFor(object),
        label: `${object.name} · 打开`,
        targetId: object.id,
        from: cloneVector(state.rotation),
        to,
        duration,
      });
      state.rotation = cloneVector(to);
      return;
    }

    if (/^缩放到/.test(action)) {
      if (!hasCapability(object, "scale", lineNumber, issues)) return;
      const to = vectorFrom(action);
      if (!to || to.some((value) => value <= 0)) {
        issues.push(issue("error", lineNumber, "缩放指令需要三个大于 0 的倍数。"));
        return;
      }
      addClip(lineNumber, "scale", {
        track: trackFor(object),
        label: `${object.name} · 变形`,
        targetId: object.id,
        from: cloneVector(state.scale),
        to: cloneVector(to),
        duration,
      });
      state.scale = cloneVector(to);
      return;
    }

    const resizeMatch = action.match(/^(放大|缩小)(?:到|为)?\s*(\d+(?:\.\d+)?)\s*倍/);
    if (resizeMatch) {
      if (!hasCapability(object, "scale", lineNumber, issues)) return;
      const value = Number(resizeMatch[2]);
      if (!(value > 0)) {
        issues.push(issue("error", lineNumber, "缩放倍数必须大于 0。"));
        return;
      }
      const factor = resizeMatch[1] === "缩小" && value > 1 ? 1 / value : value;
      const to = state.scale.map((axis) => round(axis * factor));
      addClip(lineNumber, "scale", {
        track: trackFor(object),
        label: `${object.name} · ${resizeMatch[1]}`,
        targetId: object.id,
        from: cloneVector(state.scale),
        to,
        duration,
      });
      state.scale = cloneVector(to);
      return;
    }

    if (/^(?:隐藏|消失|显示|出现)/.test(action)) {
      if (!hasCapability(object, "visibility", lineNumber, issues)) return;
      const visible = /^(?:显示|出现)/.test(action);
      addClip(lineNumber, "visibility", {
        track: trackFor(object),
        label: `${object.name} · ${visible ? "显示" : "隐藏"}`,
        targetId: object.id,
        from: state.visible,
        to: visible,
        duration: durationFrom(line, 0.15),
      });
      state.visible = visible;
      return;
    }

    const transferMatch = action.match(/^(?:将|把)?\s*(.+?)\s*(?:交给|递给)\s*(.+)$/);
    if (transferMatch) {
      const item = resolveMention(transferMatch[1], objects, object.id);
      const recipient = resolveMention(transferMatch[2], objects, object.id);
      if (!item || !recipient || recipient.entity.role !== "character") {
        issues.push(issue("error", lineNumber, "交接指令需要一个存在的物品和另一个角色。"));
        return;
      }
      if (owners.get(item.id) !== object.id) {
        issues.push(issue("error", lineNumber, `“${object.name}”当前没有持有“${item.name}”。`));
        return;
      }
      const affordance = Object.values(item.interactionSpec?.affordances ?? {})
        .find((candidate) => candidate.ownershipMode === "transfer");
      if (!affordance) {
        issues.push(issue("error", lineNumber, `“${item.name}”没有声明 transfer affordance。`));
        return;
      }
      addClip(lineNumber, "interaction", {
        track: "character",
        label: `${object.name} → ${recipient.name} · 交接 ${item.name}`,
        targetId: item.id,
        secondaryTargetId: object.id,
        recipientId: recipient.id,
        action: affordance.action,
        targetAnchor: affordance.targetAnchor,
        actorNode: affordance.actorNode,
        resultingState: affordance.resultingState,
        ownershipMode: "transfer",
        recipientAnchor: affordance.recipientAnchor,
        itemAnchor: affordance.itemAnchor,
        actorContactAnchor: affordance.actorContactAnchor,
        duration,
        motion: { easing: "minimumJerk" },
      });
      owners.set(item.id, recipient.id);
      return;
    }

    const placementMatch = action.match(/^(?:将|把)?\s*(.+?)\s*(?:放到|放在)\s*(.+)$/);
    if (placementMatch) {
      const item = resolveMention(placementMatch[1], objects, object.id);
      const placementTarget = resolveMention(placementMatch[2], objects, object.id);
      if (!item || !placementTarget) {
        issues.push(issue("error", lineNumber, "放置指令需要一个已持有物品和一个存在的接触面。"));
        return;
      }
      if (owners.get(item.id) !== object.id) {
        issues.push(issue("error", lineNumber, `“${object.name}”当前没有持有“${item.name}”。`));
        return;
      }
      const affordance = Object.values(item.interactionSpec?.affordances ?? {})
        .find((candidate) => candidate.ownershipMode === "release");
      const placementAnchor = affordance?.placementAnchor || "surface";
      if (!affordance || !placementTarget.interactionSpec?.anchors?.[placementAnchor]) {
        issues.push(issue("error", lineNumber, `物品或接触面缺少 release / ${placementAnchor} 锚点。`));
        return;
      }
      addClip(lineNumber, "interaction", {
        track: "character",
        label: `${object.name} · 放置 ${item.name}`,
        targetId: item.id,
        secondaryTargetId: object.id,
        placementTargetId: placementTarget.id,
        action: affordance.action,
        targetAnchor: affordance.targetAnchor,
        actorNode: affordance.actorNode,
        resultingState: affordance.resultingState,
        ownershipMode: "release",
        placementAnchor,
        itemAnchor: affordance.itemAnchor,
        actorContactAnchor: affordance.actorContactAnchor,
        duration,
        motion: { easing: "minimumJerk" },
      });
      owners.delete(item.id);
      const placementState = states.get(placementTarget.id);
      if (placementState) states.get(item.id).position = cloneVector(placementState.position);
      return;
    }

    if (/^(?:拿起|拾取)/.test(action)) {
      const item = resolveMention(action, objects, object.id);
      if (!item) {
        issues.push(issue("error", lineNumber, "拿取指令需要一个存在的物品名称。"));
        return;
      }
      if (!item.entity.capabilities.grabbable) {
        issues.push(issue("error", lineNumber, `“${item.name}”没有开启可拿取能力。`));
        return;
      }
      const affordance = Object.values(item.interactionSpec?.affordances ?? {})
        .find((candidate) => candidate.ownershipMode === "claim");
      if (affordance) {
        addClip(lineNumber, "interaction", {
          track: "character",
          label: `${object.name} · 抓取 ${item.name}`,
          targetId: item.id,
          secondaryTargetId: object.id,
          action: affordance.action,
          targetAnchor: affordance.targetAnchor,
          actorNode: affordance.actorNode,
          resultingState: affordance.resultingState,
          ownershipMode: "claim",
          holderAnchor: affordance.holderAnchor,
          itemAnchor: affordance.itemAnchor,
          actorContactAnchor: affordance.actorContactAnchor,
          duration: durationFrom(line, 0.6),
          motion: { easing: "minimumJerk" },
        });
        owners.set(item.id, object.id);
      } else {
        addClip(lineNumber, "attach", {
          track: "prop",
          label: `${object.name} · 拿起 ${item.name}`,
          targetId: item.id,
          secondaryTargetId: object.id,
          offset: [0.65, 0.8, 0],
          duration: durationFrom(line, 0.6),
        });
      }
      const holderState = states.get(object.id);
      states.get(item.id).position = holderState.position.map((value, axis) => value + [0.65, 0.8, 0][axis]);
      return;
    }

    issues.push(issue("error", lineNumber, "无法识别这个动作。请使用面板中的可执行语法。"));
  });

  if (!source.trim()) issues.push(issue("info", 0, "剧本为空。输入动作后再编译时间线。"));
  const duration = clips.length ? round(Math.max(cursor, ...clips.map((clip) => clip.start + clip.duration)) + 0.25) : 0;

  return {
    duration,
    clips,
    issues,
    compiledScript: source,
    compiledAt: new Date().toISOString(),
  };
}

export function evaluateTimeline(project, rawTime) {
  const timeline = project.director?.timeline ?? { duration: 0, clips: [] };
  const time = clamp(Number(rawTime) || 0, 0, timeline.duration || 0);
  const sourceById = sourceLookupFor(project);
  const objects = Object.fromEntries(project.objects.map((object) => [object.id, {
    position: cloneVector(object.position),
    rotation: cloneVector(object.rotation),
    scale: cloneVector(object.scale),
    visible: object.visible,
    color: object.color,
    semanticState: object.entity?.state ?? "默认",
    animationState: "idle",
    behaviorState: "idle",
    behaviorContext: {},
  }]));
  const attachments = new Map();
  const interactions = [];
  const activeClipIds = [];
  let camera = null;
  let dialogue = null;

  for (const clip of timeline.clips) {
    if (time < clip.start) break;
    const progress = clamp((time - clip.start) / Math.max(clip.duration, 0.001), 0, 1);
    const eased = progressForMotion(progress, clip.motion);
    if (progress < 1) activeClipIds.push(clip.id);
    const target = clip.targetId ? objects[clip.targetId] : null;

    if (clip.type === "move" && target) {
      const path = Array.isArray(clip.path) && clip.path.length >= 2
        ? clip.path
        : [clip.from, clip.to];
      target.position = path.every((point) => Array.isArray(point))
        ? sampleVectorPath(path, eased)
        : lerpVector(clip.from, clip.to, eased);
      if (clip.motion?.orientToPath) {
        const tangent = tangentForVectorPath(path, eased);
        const pathYaw = yawForDirection(tangent);
        const fromYaw = Number.isFinite(clip.fromYaw) ? clip.fromYaw : target.rotation[1];
        const toYaw = Number.isFinite(clip.toYaw) ? clip.toYaw : pathYaw;
        const turnPortion = Math.max(0.05, clip.motion.turnPortion || 0.24);
        const turnProgress = smoothstep(Math.min(1, progress / turnPortion));
        const desiredYaw = progress > 0.86
          ? lerpAngleDegrees(pathYaw, toYaw, smoothstep((progress - 0.86) / 0.14))
          : pathYaw;
        target.rotation[1] = lerpAngleDegrees(fromYaw, desiredYaw, turnProgress);
        target.rotation[0] += Math.sin(progress * Math.PI * 2) * (clip.motion.leanDegrees || 0);
        target.rotation[2] += Math.sin(progress * Math.PI) * (clip.motion.bankDegrees || 0);
      }
      if (progress < 1) {
        target.animationState = "move";
        target.behaviorState = clip.behaviorAction || "approach";
        target.behaviorContext = {
          targetId: clip.secondaryTargetId || clip.targetId,
          clipId: clip.id,
          source: "timeline",
        };
      }
    }
    else if (clip.type === "rotate" && target) target.rotation = lerpVector(clip.from, clip.to, eased);
    else if (clip.type === "scale" && target) target.scale = lerpVector(clip.from, clip.to, eased);
    else if (clip.type === "visibility" && target) target.visible = Boolean(clip.to);
    else if (clip.type === "attach" && target && clip.secondaryTargetId) {
      attachments.set(clip.targetId, { holderId: clip.secondaryTargetId, offset: clip.offset });
    } else if (clip.type === "interaction" && target && clip.secondaryTargetId) {
      if (progress < 1) {
        const actor = objects[clip.secondaryTargetId];
        const phase = interactionPhaseForProgress(progress);
        const contactBehavior = clip.behaviorAction || (
          clip.ownershipMode === "claim" ? "grasp"
            : clip.ownershipMode === "transfer" ? "transfer"
              : clip.ownershipMode === "release" ? "release"
                : "reach"
        );
        const behaviorState = phase.name === "contact"
          ? contactBehavior
          : phase.name === "recovery"
            ? clip.ownershipMode === "claim" ? "carry" : "idle"
            : "reach";
        if (actor) {
          actor.animationState = "interact";
          actor.behaviorState = behaviorState;
          actor.behaviorContext = {
            targetId: clip.targetId,
            recipientId: clip.recipientId,
            placementTargetId: clip.placementTargetId,
            hand: clip.hand,
            clipId: clip.id,
            source: "timeline",
            phase: phase.name,
            phaseProgress: phase.progress,
            contactWeight: phase.contactWeight,
            interactionProgress: progress,
          };
        }
        if (clip.ownershipMode === "transfer" && clip.recipientId) {
          const recipient = objects[clip.recipientId];
          if (recipient) {
            recipient.animationState = "interact";
            recipient.behaviorState = phase.name === "contact"
              ? "grasp"
              : phase.name === "recovery" ? "carry" : "reach";
            recipient.behaviorContext = {
              targetId: clip.targetId,
              hand: clip.hand,
              clipId: clip.id,
              source: "timeline-recipient",
              phase: phase.name,
              phaseProgress: phase.progress,
              contactWeight: phase.contactWeight,
              interactionProgress: progress,
            };
          }
        }
        target.animationState = "react";
        interactions.push({
          id: clip.id,
          actorId: clip.secondaryTargetId,
          targetId: clip.targetId,
          action: clip.action,
          targetAnchor: clip.targetAnchor,
          actorNode: clip.actorNode,
          progress: eased,
          phase,
          behaviorAction: behaviorState,
          hand: clip.hand,
          ownershipMode: clip.ownershipMode,
          recipientId: clip.recipientId,
          placementTargetId: clip.placementTargetId,
          contactTargetId: clip.targetId,
          contactAnchor: clip.actorContactAnchor || clip.targetAnchor,
        });
      } else if (clip.resultingState) {
        target.semanticState = clip.resultingState;
      }
    } else if (clip.type === "camera") {
      camera = { ...clip, progress: eased };
    } else if (clip.type === "dialogue" && progress < 1) {
      const speaker = sourceById.get(clip.targetId);
      dialogue = { speaker: speaker?.name ?? "角色", text: clip.text, clipId: clip.id };
      if (target) {
        target.behaviorState = "speak";
        target.behaviorContext = {
          targetId: clip.secondaryTargetId,
          utterance: clip.text,
          clipId: clip.id,
          source: "timeline",
          phaseProgress: eased,
          interactionProgress: progress,
        };
      }
    } else if (clip.type === "behavior" && target && progress < 1 && clip.behaviorAction) {
      target.behaviorState = clip.behaviorAction;
      target.behaviorContext = {
        targetId: clip.secondaryTargetId,
        recipientId: clip.recipientId,
        placementTargetId: clip.placementTargetId,
        hand: clip.hand,
        utterance: clip.text,
        clipId: clip.id,
        source: "timeline",
        phaseProgress: eased,
        contactWeight: eased,
        interactionProgress: progress,
      };
    }
  }

  for (const [itemId, attachment] of attachments) {
    const item = objects[itemId];
    const holder = objects[attachment.holderId];
    if (!item || !holder) continue;
    item.position = attachmentPosition(holder.position, holder.rotation, attachment.offset);
  }

  for (const source of project.objects) {
    const state = objects[source.id];
    if (!state) continue;
    const motion = source.motion;
    if (motion?.kind === "hover") {
      const cycle = time * motion.hoverFrequency * Math.PI * 2 + motion.phase;
      state.position[1] += Math.sin(cycle) * motion.hoverAmplitude;
      state.rotation[2] += Math.sin(cycle * 0.52) * Math.min(1.25, motion.bankDegrees * 0.16);
    }
    const parentMotion = source.parentId ? sourceById.get(source.parentId)?.motion : null;
    if (!parentMotion || parentMotion.kind !== "hover") continue;
    const secondaryCycle = time * parentMotion.hoverFrequency * Math.PI * 2 + parentMotion.phase;
    if (source.nodeRole === "head") state.rotation[1] += Math.sin(secondaryCycle * 0.37) * 1.8;
    else if (source.nodeRole === "antenna") state.rotation[2] += Math.sin(secondaryCycle * 0.73) * 4.2;
    else if (source.nodeRole === "probe") state.rotation[1] += Math.sin(secondaryCycle * 0.41) * 0.8;
  }

  const characterCollisions = resolveCharacterCollisions(project, objects);
  const simulation = resolveInteractionSimulation(project, objects, time);
  const propCollisions = resolvePropCollisions(project, objects);
  simulation.collision = mergeCollisionReports(characterCollisions, propCollisions);
  const contactsByClip = new Map(simulation.contacts.map((contact) => [contact.clipId, contact]));
  for (const interaction of interactions) {
    const contact = contactsByClip.get(interaction.id);
    if (contact) Object.assign(interaction, contact);
  }
  const activeInteractionItems = new Set(interactions.map((interaction) => interaction.targetId));
  const persistentHolds = Object.entries(simulation.ownership)
    .filter(([itemId, ownership]) => ownership.status === "held" && !activeInteractionItems.has(itemId))
    .map(([itemId, ownership]) => {
      const itemSource = sourceById.get(itemId);
      const holdAffordance = Object.values(itemSource?.interactionSpec?.affordances ?? {})
        .find((affordance) => affordance.ownershipMode === "claim" || affordance.ownershipMode === "transfer");
      return {
        id: `persistent-hold-${itemId}`,
        actorId: ownership.holderId,
        targetId: itemId,
        action: "hold",
        actorNode: holdAffordance?.actorNode ?? "effector",
        ownershipMode: "hold",
        contactTargetId: itemId,
        contactAnchor: ownership.itemAnchor ?? holdAffordance?.actorContactAnchor ?? "grip",
        phase: { name: "contact", progress: 1, contactWeight: 1 },
        passive: true,
      };
    });

  for (const hold of persistentHolds) {
    const holder = objects[hold.actorId];
    if (!holder || holder.behaviorState !== "idle") continue;
    holder.behaviorState = "carry";
    holder.behaviorContext = {
      targetId: hold.targetId,
      clipId: hold.id,
      source: "simulation",
      phase: "contact",
      phaseProgress: 1,
      contactWeight: 1,
      interactionProgress: 1,
    };
  }

  return {
    time,
    duration: timeline.duration || 0,
    objects,
    camera,
    dialogue,
    interactions,
    interactionPoses: [...interactions, ...persistentHolds],
    characterBehaviors: Object.entries(objects)
      .filter(([id]) => sourceById.get(id)?.entity?.role === "character")
      .map(([actorId, object]) => ({ actorId, state: object.behaviorState, ...object.behaviorContext })),
    simulation,
    activeClipIds,
  };
}

export function formatTimecode(time) {
  const safe = Math.max(0, Number(time) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * 24);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

export class DirectorRuntime {
  constructor(project, onFrame, onState = () => {}, { simulationHz = SIMULATION_HZ } = {}) {
    this.project = project;
    this.onFrame = onFrame;
    this.onState = onState;
    this.time = 0;
    this.playing = false;
    this.playbackEnd = null;
    this.animationFrame = 0;
    this.fixedClock = new FixedStepClock({ hz: simulationHz });
    this.lastSimulationStep = this.fixedClock.snapshot();
    this.emit();
  }

  get duration() {
    return this.project.director?.timeline?.duration ?? 0;
  }

  getState() {
    return {
      time: this.time,
      duration: this.duration,
      playing: this.playing,
      playbackEnd: this.playbackEnd,
      simulation: this.lastSimulationStep,
    };
  }

  setProject(project) {
    this.project = project;
    this.time = clamp(this.time, 0, this.duration);
    this.lastSimulationStep = this.fixedClock.reset(this.time, this.playing ? performance.now() : null);
    this.emit();
  }

  emit() {
    const frame = evaluateTimeline(this.project, this.time);
    frame.simulation = { ...frame.simulation, clock: this.lastSimulationStep };
    this.onFrame(frame);
    this.onState(this.getState());
  }

  play() {
    if (!this.duration) return false;
    if (this.time >= this.duration) this.time = 0;
    if (this.playing) return true;
    this.playing = true;
    this.lastSimulationStep = this.fixedClock.reset(this.time, performance.now());
    this.onState(this.getState());
    this.animationFrame = requestAnimationFrame(this.tick);
    return true;
  }

  playRange(rawStart, rawEnd) {
    if (!this.duration) return false;
    const start = clamp(Number(rawStart) || 0, 0, this.duration);
    const end = clamp(Number(rawEnd) || 0, start, this.duration);
    if (end <= start) return false;
    cancelAnimationFrame(this.animationFrame);
    this.time = start;
    this.playbackEnd = end;
    this.playing = true;
    this.lastSimulationStep = this.fixedClock.reset(this.time, performance.now());
    this.emit();
    this.animationFrame = requestAnimationFrame(this.tick);
    return true;
  }

  tick = (timestamp) => {
    if (!this.playing) return;
    const playbackLimit = this.playbackEnd ?? this.duration;
    const step = this.fixedClock.advance(timestamp, this.duration);
    this.time = Math.min(step.time, playbackLimit);
    this.lastSimulationStep = { ...step, time: this.time };
    if (this.lastSimulationStep.steps > 0 || this.time >= playbackLimit) this.emit();
    if (this.time >= playbackLimit) {
      this.playing = false;
      this.playbackEnd = null;
      this.onState(this.getState());
      return;
    }
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.animationFrame);
    this.onState(this.getState());
  }

  stop() {
    this.playing = false;
    this.playbackEnd = null;
    cancelAnimationFrame(this.animationFrame);
    this.time = 0;
    this.lastSimulationStep = this.fixedClock.reset(0);
    this.emit();
  }

  seek(time) {
    this.playbackEnd = null;
    this.time = clamp(Number(time) || 0, 0, this.duration);
    this.lastSimulationStep = this.fixedClock.reset(this.time, this.playing ? performance.now() : null);
    this.emit();
  }

  dispose() {
    this.playing = false;
    this.playbackEnd = null;
    cancelAnimationFrame(this.animationFrame);
  }
}
