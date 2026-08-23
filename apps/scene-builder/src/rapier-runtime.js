import * as THREE from "three";

export const RAPIER_BACKEND = "rapier3d-compat-0.20";
export const RAPIER_HZ = 60;

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const dimensionsFor = (object) => [0, 1, 2].map((axis) => Math.max(
  0.01,
  Math.abs((Number(object.dimensions?.[axis]) || 1) * (Number(object.scale?.[axis]) || 1)),
));

const rotationFor = (rotationDegrees) => {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(Number(rotationDegrees?.[0]) || 0),
    THREE.MathUtils.degToRad(Number(rotationDegrees?.[1]) || 0),
    THREE.MathUtils.degToRad(Number(rotationDegrees?.[2]) || 0),
    "XYZ",
  );
  const quaternion = new THREE.Quaternion().setFromEuler(euler);
  return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
};

const descriptorForBody = (RAPIER, bodyType) => {
  if (bodyType === "dynamic") return RAPIER.RigidBodyDesc.dynamic();
  if (bodyType === "kinematic") return RAPIER.RigidBodyDesc.kinematicPositionBased();
  return RAPIER.RigidBodyDesc.fixed();
};

const descriptorForCollider = (RAPIER, object, dimensions) => {
  const declaredShape = object.interactionSpec?.collisionProxy?.shape;
  const shape = declaredShape
    ?? (object.type === "sphere" ? "sphere" : object.type === "cylinder" || object.type === "cone" ? "cylinder" : "box");
  if (shape === "sphere") return RAPIER.ColliderDesc.ball(Math.max(dimensions[0], dimensions[1], dimensions[2]) / 2);
  if (shape === "cylinder") return RAPIER.ColliderDesc.cylinder(dimensions[1] / 2, Math.max(dimensions[0], dimensions[2]) / 2);
  if (shape === "capsule") {
    const radius = Math.max(0.01, Math.max(dimensions[0], dimensions[2]) / 2);
    return RAPIER.ColliderDesc.capsule(Math.max(0.01, dimensions[1] / 2 - radius), radius);
  }
  return RAPIER.ColliderDesc.cuboid(dimensions[0] / 2, dimensions[1] / 2, dimensions[2] / 2);
};

const rootObjects = (project) => project.objects.filter((object) => !object.parentId && object.visible !== false);

export function projectNeedsRapier(project) {
  return rootObjects(project).some((object) => object.entity?.physics?.bodyType === "dynamic");
}

export class RapierProjectRuntime {
  constructor(RAPIER, project, { gravity = [0, -9.81, 0], hz = RAPIER_HZ } = {}) {
    this.RAPIER = RAPIER;
    this.gravity = gravity.slice(0, 3).map((value, axis) => Number(value) || (axis === 1 ? -9.81 : 0));
    this.hz = clamp(Math.round(hz), 1, 240) || RAPIER_HZ;
    this.stepSeconds = 1 / this.hz;
    this.project = project;
    this.lastTime = null;
    this.build();
  }

  build() {
    this.world?.free?.();
    this.world = new this.RAPIER.World({ x: this.gravity[0], y: this.gravity[1], z: this.gravity[2] });
    this.world.timestep = this.stepSeconds;
    this.bodies = new Map();
    const counts = { static: 0, kinematic: 0, dynamic: 0 };
    for (const object of rootObjects(this.project)) {
      const bodyType = object.entity?.physics?.bodyType ?? "static";
      const dimensions = dimensionsFor(object);
      const bodyDesc = descriptorForBody(this.RAPIER, bodyType)
        .setTranslation(...object.position)
        .setRotation(rotationFor(object.rotation))
        .setUserData({ objectId: object.id });
      if (bodyType === "dynamic") {
        bodyDesc.setLinearDamping(0.08).setAngularDamping(0.18).setCcdEnabled(true);
      }
      const body = this.world.createRigidBody(bodyDesc);
      const physics = object.entity?.physics ?? {};
      const colliderDesc = descriptorForCollider(this.RAPIER, object, dimensions)
        .setFriction(clamp(physics.friction, 0, 1))
        .setRestitution(clamp(physics.restitution, 0, 1));
      if (bodyType === "dynamic") colliderDesc.setMass(Math.max(0.001, Number(physics.mass) || 1));
      const collider = this.world.createCollider(colliderDesc, body);
      this.bodies.set(object.id, {
        objectId: object.id,
        declaredType: bodyType,
        body,
        collider,
        controlled: bodyType !== "dynamic",
      });
      counts[bodyType] += 1;
    }
    this.counts = counts;
    this.lastTime = null;
  }

  replaceProject(project) {
    this.project = project;
    this.build();
  }

  syncControlledBodies(frameObjects, controlledIds = new Set()) {
    for (const [objectId, entry] of this.bodies) {
      const state = frameObjects?.[objectId];
      if (!state) continue;
      const controlled = entry.declaredType !== "dynamic" || controlledIds.has(objectId);
      if (entry.declaredType === "dynamic" && controlled !== entry.controlled) {
        entry.body.setBodyType(
          controlled ? this.RAPIER.RigidBodyType.KinematicPositionBased : this.RAPIER.RigidBodyType.Dynamic,
          true,
        );
        if (!controlled) {
          entry.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          entry.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
        entry.controlled = controlled;
      }
      if (!controlled || entry.declaredType === "static") continue;
      entry.body.setNextKinematicTranslation({ x: state.position[0], y: state.position[1], z: state.position[2] });
      entry.body.setNextKinematicRotation(rotationFor(state.rotation));
    }
  }

  advanceTo(rawTime, frameObjects, controlledIds = new Set()) {
    const time = Math.max(0, Number(rawTime) || 0);
    if (this.lastTime === null) {
      this.lastTime = time;
      this.syncControlledBodies(frameObjects, controlledIds);
      return this.snapshot();
    }
    if (time + 1e-8 < this.lastTime || time - this.lastTime > 0.5) {
      this.build();
      this.lastTime = time;
      this.syncControlledBodies(frameObjects, controlledIds);
      return this.snapshot({ reset: true });
    }
    const steps = Math.min(30, Math.max(0, Math.round((time - this.lastTime) * this.hz)));
    for (let step = 0; step < steps; step += 1) {
      this.syncControlledBodies(frameObjects, controlledIds);
      this.world.step();
    }
    this.lastTime = time;
    return this.snapshot({ steps });
  }

  snapshot({ steps = 0, reset = false } = {}) {
    const objects = {};
    for (const [objectId, entry] of this.bodies) {
      if (entry.declaredType !== "dynamic" || entry.controlled) continue;
      const translation = entry.body.translation();
      const rotation = entry.body.rotation();
      objects[objectId] = {
        position: [translation.x, translation.y, translation.z],
        quaternion: [rotation.x, rotation.y, rotation.z, rotation.w],
        sleeping: entry.body.isSleeping(),
      };
    }
    return {
      backend: RAPIER_BACKEND,
      hz: this.hz,
      gravity: [...this.gravity],
      bodyCounts: { ...this.counts },
      steps,
      reset,
      objects,
    };
  }

  dispose() {
    this.world?.free?.();
    this.world = null;
    this.bodies?.clear();
  }
}

let rapierPromise = null;
export async function loadRapier() {
  rapierPromise ??= import("@dimforge/rapier3d-compat").then(async (module) => {
    await module.init();
    return module;
  });
  return rapierPromise;
}

export async function createRapierProjectRuntime(project, options = {}) {
  const RAPIER = await loadRapier();
  return new RapierProjectRuntime(RAPIER, project, options);
}
