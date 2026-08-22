import { attachmentPosition, interactionPhaseForProgress, rotateLocalOffset } from "./interaction-runtime.js";
import { lerpAngleDegrees, minimumJerk } from "./motion.js";

export const SIMULATION_HZ = 60;
export const SIMULATION_BACKEND = "deterministic-kinematic";

const OWNERSHIP_MODES = new Set(["claim", "transfer", "release"]);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const cloneVector = (value) => value.map((entry) => Number(entry) || 0);
const lerpVector = (from, to, weight) => from.map((value, axis) => value + (to[axis] - value) * weight);
const distance = (from, to) => Math.hypot(...from.map((value, axis) => value - to[axis]));

export class FixedStepClock {
  constructor({ hz = SIMULATION_HZ, maxDeltaSeconds = 0.25, maxSubSteps = null } = {}) {
    this.hz = clamp(Math.round(Number(hz) || SIMULATION_HZ), 1, 240);
    this.stepSeconds = 1 / this.hz;
    this.maxDeltaSeconds = clamp(Number(maxDeltaSeconds) || 0.25, this.stepSeconds, 1);
    this.maxSubSteps = Math.max(
      1,
      Math.round(Number(maxSubSteps) || Math.ceil(this.maxDeltaSeconds / this.stepSeconds)),
    );
    this.reset();
  }

  reset(time = 0, timestamp = null) {
    this.time = Math.max(0, Number(time) || 0);
    this.tick = Math.max(0, Math.round(this.time * this.hz));
    this.accumulator = 0;
    this.lastTimestamp = Number.isFinite(Number(timestamp)) ? Number(timestamp) : null;
    this.droppedSeconds = 0;
    return this.snapshot(0);
  }

  advance(timestamp, duration = Infinity) {
    const now = Number(timestamp);
    if (!Number.isFinite(now)) return this.snapshot(0);
    if (this.lastTimestamp === null) {
      this.lastTimestamp = now;
      return this.snapshot(0);
    }

    const rawDelta = Math.max(0, (now - this.lastTimestamp) / 1000);
    const acceptedDelta = Math.min(rawDelta, this.maxDeltaSeconds);
    this.droppedSeconds += rawDelta - acceptedDelta;
    this.lastTimestamp = now;
    this.accumulator += acceptedDelta;

    const availableSteps = Math.floor((this.accumulator + 1e-10) / this.stepSeconds);
    const steps = Math.min(availableSteps, this.maxSubSteps);
    this.accumulator -= steps * this.stepSeconds;
    this.time += steps * this.stepSeconds;
    this.tick += steps;

    const safeDuration = Number.isFinite(Number(duration)) ? Math.max(0, Number(duration)) : Infinity;
    if (this.time >= safeDuration) {
      this.time = safeDuration;
      this.tick = Math.round(this.time * this.hz);
      this.accumulator = 0;
    }
    return this.snapshot(steps);
  }

  snapshot(steps = 0) {
    return {
      hz: this.hz,
      stepSeconds: this.stepSeconds,
      time: this.time,
      tick: this.tick,
      steps,
      alpha: clamp(this.accumulator / this.stepSeconds, 0, 1),
      droppedSeconds: this.droppedSeconds,
    };
  }
}

const anchorWorldPosition = (source, state, anchorName) => {
  const local = source?.interactionSpec?.anchors?.[anchorName] ?? [0, 0, 0];
  return attachmentPosition(state.position, state.rotation, local);
};

const rootPositionForAnchor = (anchorPosition, itemSource, itemState, itemAnchor) => {
  const local = itemSource?.interactionSpec?.anchors?.[itemAnchor] ?? [0, 0, 0];
  const rotated = rotateLocalOffset(local, itemState.rotation);
  return anchorPosition.map((value, axis) => value - rotated[axis]);
};

const stateOwnerId = (state) => state?.kind === "held" ? state.holderId : null;

const rotationForState = (state, itemState, objects) => {
  if (state?.kind === "held" && objects[state.holderId]) return cloneVector(objects[state.holderId].rotation);
  return cloneVector(itemState.rotation);
};

const rootPositionForState = (state, itemSource, itemState, sourceById, objects) => {
  if (!state || state.kind === "free") return cloneVector(state?.position ?? itemState.position);
  if (state.kind === "held") {
    const holderSource = sourceById.get(state.holderId);
    const holderState = objects[state.holderId];
    if (!holderSource || !holderState) return cloneVector(itemState.position);
    return rootPositionForAnchor(
      anchorWorldPosition(holderSource, holderState, state.holderAnchor),
      itemSource,
      { ...itemState, rotation: rotationForState(state, itemState, objects) },
      state.itemAnchor,
    );
  }
  if (state.kind === "placed") {
    const surfaceSource = sourceById.get(state.placementTargetId);
    const surfaceState = objects[state.placementTargetId];
    if (!surfaceSource || !surfaceState) return cloneVector(itemState.position);
    return rootPositionForAnchor(
      anchorWorldPosition(surfaceSource, surfaceState, state.placementAnchor),
      itemSource,
      itemState,
      state.itemAnchor,
    );
  }
  return cloneVector(itemState.position);
};

const destinationStateFor = (clip) => {
  if (clip.ownershipMode === "claim") {
    return {
      kind: "held",
      holderId: clip.secondaryTargetId,
      holderAnchor: clip.holderAnchor || "carry",
      itemAnchor: clip.itemAnchor || clip.targetAnchor || "grip",
    };
  }
  if (clip.ownershipMode === "transfer") {
    return {
      kind: "held",
      holderId: clip.recipientId,
      holderAnchor: clip.recipientAnchor || clip.holderAnchor || "carry",
      itemAnchor: clip.itemAnchor || clip.targetAnchor || "grip",
    };
  }
  return {
    kind: "placed",
    holderId: null,
    placementTargetId: clip.placementTargetId,
    placementAnchor: clip.placementAnchor || "surface",
    itemAnchor: clip.itemAnchor || clip.targetAnchor || "grip",
  };
};

const validateTransition = (clip, currentState, sourceById) => {
  const currentOwnerId = stateOwnerId(currentState);
  if (clip.ownershipMode === "claim" && currentOwnerId) {
    return `物品已由 ${currentOwnerId} 持有，不能再次 claim。`;
  }
  if ((clip.ownershipMode === "transfer" || clip.ownershipMode === "release")
    && currentOwnerId !== clip.secondaryTargetId) {
    return `只有当前持有者 ${currentOwnerId ?? "无"} 可以执行 ${clip.ownershipMode}。`;
  }
  if (clip.ownershipMode === "transfer" && (!clip.recipientId || !sourceById.has(clip.recipientId))) {
    return "transfer 缺少有效 recipientId。";
  }
  if (clip.ownershipMode === "release"
    && (!clip.placementTargetId || !sourceById.has(clip.placementTargetId))) {
    return "release 缺少有效 placementTargetId。";
  }
  return null;
};

export function ownershipWeightForPhase(phase) {
  if (!phase || phase.name === "anticipation" || phase.name === "reach") return 0;
  if (phase.name === "contact") return minimumJerk(phase.progress);
  return 1;
}

export function resolveInteractionSimulation(project, objects, rawTime) {
  const time = Math.max(0, Number(rawTime) || 0);
  const sourceById = new Map(project.objects.map((object) => [object.id, object]));
  const ownershipStates = new Map();
  const contacts = [];
  const violations = [];
  const clips = (project.director?.timeline?.clips ?? [])
    .filter((clip) => clip.type === "interaction" && OWNERSHIP_MODES.has(clip.ownershipMode) && time >= clip.start)
    .sort((a, b) => a.start - b.start || String(a.id).localeCompare(String(b.id)));

  for (const clip of clips) {
    const itemSource = sourceById.get(clip.targetId);
    const itemState = objects[clip.targetId];
    if (!itemSource || !itemState) continue;

    const previousState = ownershipStates.get(clip.targetId) ?? {
      kind: "free",
      holderId: null,
      position: cloneVector(itemState.position),
    };
    const duration = Math.max(0.001, Number(clip.duration) || 0.001);
    const rawProgress = clamp((time - clip.start) / duration, 0, 1);
    const phase = interactionPhaseForProgress(rawProgress);
    const weight = ownershipWeightForPhase(phase);
    if (weight <= 0 && rawProgress < 1) continue;

    const violation = validateTransition(clip, previousState, sourceById);
    if (violation) {
      violations.push({ clipId: clip.id, itemId: clip.targetId, mode: clip.ownershipMode, message: violation });
      continue;
    }

    const destinationState = destinationStateFor(clip);
    const fromRotation = rotationForState(previousState, itemState, objects);
    const toRotation = rotationForState(destinationState, itemState, objects);
    const fromPosition = rootPositionForState(previousState, itemSource, itemState, sourceById, objects);
    const toPosition = rootPositionForState(destinationState, itemSource, itemState, sourceById, objects);
    const resolvedPosition = lerpVector(fromPosition, toPosition, weight);
    itemState.position = resolvedPosition;
    itemState.rotation = fromRotation.map((value, axis) => lerpAngleDegrees(value, toRotation[axis], weight));

    if (rawProgress < 1 && weight < 1) {
      ownershipStates.set(clip.targetId, {
        kind: "transition",
        mode: clip.ownershipMode,
        holderId: stateOwnerId(previousState),
        nextHolderId: stateOwnerId(destinationState),
        position: cloneVector(resolvedPosition),
        fromState: previousState,
        toState: destinationState,
      });
    } else {
      ownershipStates.set(clip.targetId, destinationState);
    }

    if (rawProgress < 1) {
      contacts.push({
        clipId: clip.id,
        itemId: clip.targetId,
        mode: clip.ownershipMode,
        phaseName: phase.name,
        constraintWeight: weight,
        constraintError: distance(resolvedPosition, toPosition),
        fromHolderId: stateOwnerId(previousState),
        toHolderId: stateOwnerId(destinationState),
        placementTargetId: destinationState.placementTargetId ?? null,
      });
    }
  }

  for (const [itemId, state] of ownershipStates) {
    if (state.kind === "transition") continue;
    const itemSource = sourceById.get(itemId);
    const itemState = objects[itemId];
    if (!itemSource || !itemState) continue;
    itemState.rotation = rotationForState(state, itemState, objects);
    itemState.position = rootPositionForState(state, itemSource, itemState, sourceById, objects);
  }

  const ownership = Object.fromEntries([...ownershipStates.entries()].map(([itemId, state]) => [itemId, {
    status: state.kind,
    holderId: state.kind === "held" ? state.holderId : state.holderId ?? null,
    nextHolderId: state.nextHolderId ?? null,
    placementTargetId: state.placementTargetId ?? null,
    mode: state.mode ?? null,
  }]));

  return {
    backend: SIMULATION_BACKEND,
    hz: SIMULATION_HZ,
    ownership,
    contacts,
    violations,
  };
}
