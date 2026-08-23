import * as THREE from "three";

export const CP03_ACTIONS = Object.freeze([
  "Translate",
  "Reframe",
  "Merge",
  "Continue",
  "KeepOpaque",
]);

export const CP03_VISUAL_GRAMMAR = Object.freeze({
  Translate: Object.freeze({ color: 0x36d9ff, label: "位移回声", terminal: false }),
  Reframe: Object.freeze({ color: 0xffb341, label: "取景边界", terminal: false }),
  Merge: Object.freeze({ color: 0xc57cff, label: "关系缝合", terminal: false }),
  Continue: Object.freeze({ color: 0x70e0ad, label: "延续波纹", terminal: true }),
  KeepOpaque: Object.freeze({ color: 0xe06688, label: "不透明遮蔽", terminal: true }),
});

const materialWithFade = (material, opacity) => {
  material.transparent = true;
  material.opacity = opacity;
  material.depthWrite = false;
  material.userData.baseOpacity = opacity;
  return material;
};

const addLine = (root, points, color, opacity = 0.9) => {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = materialWithFade(new THREE.LineBasicMaterial({ color, depthTest: false }), opacity);
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 25;
  root.add(line);
  return line;
};

const disposeRoot = (root) => {
  root.removeFromParent();
  root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
    else object.material?.dispose?.();
  });
};

const collectiveBounds = (targets) => targets.reduce(
  (bounds, target) => bounds.union(new THREE.Box3().setFromObject(target)),
  new THREE.Box3(),
);

const centersFor = (targets) => targets.map((target) => (
  new THREE.Box3().setFromObject(target).getCenter(new THREE.Vector3())
));

const translateEffect = (root, targets, style) => {
  for (const target of targets) {
    const bounds = new THREE.Box3().setFromObject(target);
    const helper = new THREE.Box3Helper(bounds, style.color);
    helper.material = materialWithFade(helper.material, 0.82);
    helper.renderOrder = 25;
    root.add(helper);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const length = Math.max(0.8, size.length() * 0.55);
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), center, length, style.color, length * 0.28, length * 0.14);
    arrow.traverse((object) => {
      if (object.material) materialWithFade(object.material, 0.88);
      object.renderOrder = 25;
    });
    root.add(arrow);
  }
};

const reframeEffect = (root, targets, style) => {
  const bounds = collectiveBounds(targets).expandByScalar(0.16);
  const helper = new THREE.Box3Helper(bounds, style.color);
  helper.material = materialWithFade(helper.material, 0.94);
  helper.renderOrder = 25;
  root.add(helper);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.1, size.x * 1.08), Math.max(0.1, size.y * 1.08), 0.025),
    materialWithFade(new THREE.MeshBasicMaterial({ color: style.color, wireframe: true, depthTest: false }), 0.36),
  );
  frame.position.copy(center);
  frame.position.z = bounds.max.z + 0.08;
  frame.renderOrder = 24;
  root.add(frame);
  const light = new THREE.PointLight(style.color, 2.2, Math.max(2, size.length() * 1.5), 2);
  light.position.copy(center).add(new THREE.Vector3(0, size.y * 0.35, size.z * 0.7 + 0.4));
  root.add(light);
};

const mergeEffect = (root, targets, style) => {
  const centers = centersFor(targets);
  const bounds = collectiveBounds(targets);
  if (centers.length === 1) {
    centers.unshift(new THREE.Vector3(bounds.min.x, centers[0].y, bounds.min.z));
    centers.push(new THREE.Vector3(bounds.max.x, centers[1].y, bounds.max.z));
  }
  addLine(root, centers, style.color, 0.92);
  const centroid = centers.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / centers.length);
  const knot = new THREE.Mesh(
    new THREE.IcosahedronGeometry(Math.max(0.08, bounds.getSize(new THREE.Vector3()).length() * 0.045), 1),
    materialWithFade(new THREE.MeshBasicMaterial({ color: style.color, depthTest: false }), 0.86),
  );
  knot.position.copy(centroid);
  knot.renderOrder = 25;
  root.add(knot);
};

const continueEffect = (root, targets, style) => {
  const bounds = collectiveBounds(targets);
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(0.45, Math.hypot(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * 0.6);
  for (let index = 0; index < 3; index += 1) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * (0.62 + index * 0.24), radius * (0.68 + index * 0.24), 64),
      materialWithFade(new THREE.MeshBasicMaterial({ color: style.color, side: THREE.DoubleSide, depthTest: false }), 0.62 - index * 0.1),
    );
    ring.position.set(center.x, bounds.min.y + 0.025 + index * 0.008, center.z);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 24;
    ring.userData.phaseOffset = index / 3;
    root.add(ring);
  }
};

const opaqueEffect = (root, targets, style) => {
  for (const target of targets) {
    const bounds = new THREE.Box3().setFromObject(target).expandByScalar(0.08);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const veil = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.05, size.x), Math.max(0.05, size.y), Math.max(0.05, size.z)),
      materialWithFade(new THREE.MeshBasicMaterial({ color: 0x050607, depthTest: true }), 0.66),
    );
    veil.position.copy(center);
    veil.renderOrder = 23;
    root.add(veil);
    const helper = new THREE.Box3Helper(bounds, style.color);
    helper.material = materialWithFade(helper.material, 0.72);
    helper.renderOrder = 25;
    root.add(helper);
  }
};

const builders = Object.freeze({
  Translate: translateEffect,
  Reframe: reframeEffect,
  Merge: mergeEffect,
  Continue: continueEffect,
  KeepOpaque: opaqueEffect,
});

export class Cp03VisualEffects {
  constructor(scene, meshForId) {
    this.scene = scene;
    this.meshForId = meshForId;
    this.effects = [];
  }

  play(action, objectIds, { durationMs = 2600, startedAt = performance.now() } = {}) {
    const style = CP03_VISUAL_GRAMMAR[action];
    if (!style) throw new Error(`未知 CP03 动作：${action}`);
    const targets = [...new Set(objectIds ?? [])].map((id) => this.meshForId(id)).filter(Boolean);
    if (!targets.length) throw new Error("CP03 视觉效果没有可见目标。");
    const root = new THREE.Group();
    root.name = `CP03 ${action} · ${style.label}`;
    root.userData = { cp03Action: action, transient: true };
    builders[action](root, targets, style);
    this.scene.add(root);
    const effect = { action, root, startedAt, durationMs: Math.max(400, Number(durationMs) || 2600) };
    this.effects.push(effect);
    return { action, label: style.label, targetCount: targets.length, terminal: style.terminal };
  }

  update(now = performance.now()) {
    this.effects = this.effects.filter((effect) => {
      const progress = Math.max(0, (now - effect.startedAt) / effect.durationMs);
      if (progress >= 1) {
        disposeRoot(effect.root);
        return false;
      }
      const pulse = 1 + Math.sin(progress * Math.PI * 6) * 0.035;
      effect.root.scale.setScalar(pulse);
      if (effect.action === "Merge") effect.root.rotation.y = progress * Math.PI * 0.5;
      effect.root.traverse((object) => {
        if (object.material?.userData?.baseOpacity !== undefined) {
          object.material.opacity = object.material.userData.baseOpacity * Math.min(1, (1 - progress) * 2.4);
        }
        if (object.isPointLight) object.intensity = 2.2 * (1 - progress);
        if (object.userData.phaseOffset !== undefined) {
          const wave = (progress + object.userData.phaseOffset) % 1;
          object.scale.setScalar(0.8 + wave * 0.6);
        }
      });
      return true;
    });
  }

  clear() {
    this.effects.forEach((effect) => disposeRoot(effect.root));
    this.effects = [];
  }
}
