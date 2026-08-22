import { minimumJerk } from "./motion.js";

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export function interactionPhaseForProgress(value) {
  const progress = clamp01(value);
  if (progress < 0.18) {
    return {
      name: "anticipation",
      progress: minimumJerk(progress / 0.18),
      contactWeight: 0,
    };
  }
  if (progress < 0.5) {
    const local = minimumJerk((progress - 0.18) / 0.32);
    return { name: "reach", progress: local, contactWeight: local };
  }
  if (progress < 0.78) {
    return { name: "contact", progress: (progress - 0.5) / 0.28, contactWeight: 1 };
  }
  const local = minimumJerk((progress - 0.78) / 0.22);
  return { name: "recovery", progress: local, contactWeight: 1 - local };
}

export function rotateLocalOffset(offset, rotationDegrees = [0, 0, 0]) {
  const [rx, ry, rz] = rotationDegrees.map((value) => (Number(value) || 0) * Math.PI / 180);
  let [x, y, z] = offset.map((value) => Number(value) || 0);

  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  [y, z] = [y * cosX - z * sinX, y * sinX + z * cosX];

  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  [x, z] = [x * cosY + z * sinY, -x * sinY + z * cosY];

  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);
  [x, y] = [x * cosZ - y * sinZ, x * sinZ + y * cosZ];
  return [x, y, z];
}

export function attachmentPosition(holderPosition, holderRotation, localOffset) {
  const rotated = rotateLocalOffset(localOffset, holderRotation);
  return holderPosition.map((value, axis) => value + rotated[axis]);
}

export function proceduralInteractionPose(actorPosition, targetPosition, phase) {
  const dx = (Number(targetPosition?.[0]) || 0) - (Number(actorPosition?.[0]) || 0);
  const dz = (Number(targetPosition?.[2]) || 0) - (Number(actorPosition?.[2]) || 0);
  const distance = Math.max(0.0001, Math.hypot(dx, dz));
  const direction = [dx / distance, 0, dz / distance];
  const anticipation = phase?.name === "anticipation" ? clamp01(phase.progress) : 0;
  const contact = clamp01(phase?.contactWeight);
  const actorTravel = contact * 0.14 - anticipation * 0.045;
  return {
    actorOffset: direction.map((value) => value * actorTravel),
    targetOffset: direction.map((value) => value * contact * 0.035),
    targetScale: 1 + contact * 0.025,
    effectorWeight: contact * 0.92,
  };
}
