import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { FramePacingMonitor } from "./frame-pacing.js";
import {
  effectorWeightsForInteraction,
  proceduralInteractionPose,
  surfaceContactPosition,
} from "./interaction-runtime.js";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const round = (value, precision = 4) => Number(value.toFixed(precision));
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const sameVector = (left, right) => left?.length === right?.length && left.every((value, index) => value === right[index]);
const cameraCurveCache = new WeakMap();

const cameraCurveFor = (path) => {
  let curve = cameraCurveCache.get(path);
  if (curve) return curve;
  curve = new THREE.CatmullRomCurve3(
    path.map((point) => new THREE.Vector3().fromArray(point)),
    false,
    "centripetal",
  );
  curve.arcLengthDivisions = 96;
  curve.updateArcLengths();
  cameraCurveCache.set(path, curve);
  return curve;
};

const geometryForType = (type) => {
  switch (type) {
    case "sphere":
      return new THREE.SphereGeometry(0.5, 32, 20);
    case "cylinder":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32, 1);
    case "cone":
      return new THREE.ConeGeometry(0.5, 1, 32, 1);
    case "plane":
    case "box":
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
};

export class ThreeSceneAdapter {
  constructor(container, store) {
    this.container = container;
    this.store = store;
    this.meshes = new Map();
    this.selectedMesh = null;
    this.selectionHelper = null;
    this.isDragging = false;
    this.transformInteracting = false;
    this.pointerStart = null;
    this.activePreset = "perspective";
    this.orthoSpan = 18;
    this.disposed = false;
    this.mode = "edit";
    this.lastState = null;
    this.directorFrame = null;
    this.previewSnapshot = null;
    this.previewInteractionHandler = null;
    this.interactionEffects = new Map();
    this.interactionVisibility = new Map();
    this.textureCache = new Map();
    this.assetControllers = new Map();
    this.assetLoadTokens = new Map();
    this.assetReplacementRootById = new Map();
    this.timelineInteractionObjectIds = new Set();
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.framePacing = new FramePacingMonitor();
    this.performanceHandler = null;
    this.lastPerformanceReportAt = 0;
    this.lastAnimationTimestamp = null;
    this.previewShadowsEnabled = true;
    this.previewObjectLightsEnabled = true;
    this.performanceAdaptationEnabled = new URLSearchParams(window.location.search).get("renderQuality") !== "full";

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070909);
    this.scene.fog = new THREE.FogExp2(0x070909, 0.026);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x070909, 1);
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute("aria-label", "可交互三维场景");
    this.container.appendChild(this.renderer.domElement);

    this.perspectiveCamera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
    this.perspectiveCamera.position.set(12, 9, 12);
    this.orthoCamera = new THREE.OrthographicCamera(-9, 9, 9, -9, 0.05, 500);
    this.activeCamera = this.perspectiveCamera;

    this.orbitControls = new OrbitControls(this.activeCamera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.075;
    this.orbitControls.target.set(0, 2, 0);
    this.orbitControls.minDistance = 1.2;
    this.orbitControls.maxDistance = 120;
    this.orbitControls.screenSpacePanning = true;
    this.orbitControls.update();

    this.transformControls = new TransformControls(this.activeCamera, this.renderer.domElement);
    this.transformControls.setSize(0.85);
    const transformHelper = this.transformControls.getHelper?.() ?? this.transformControls;
    if (transformHelper?.isObject3D) this.scene.add(transformHelper);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.addEnvironment();
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();

    this.unsubscribe = this.store.subscribe((state) => this.sync(state));
    this.animate();
  }

  addEnvironment() {
    const grid = new THREE.GridHelper(40, 40, 0x59605e, 0x343a38);
    grid.material.transparent = true;
    grid.material.opacity = 0.72;
    grid.material.depthWrite = false;
    this.grid = grid;
    this.scene.add(grid);

    const axes = new THREE.AxesHelper(2.2);
    axes.position.y = 0.015;
    axes.material.transparent = true;
    axes.material.opacity = 0.68;
    this.axes = axes;
    this.scene.add(axes);

    const hemisphere = new THREE.HemisphereLight(0x8fa39e, 0x171310, 0.85);
    this.scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xffdfb3, 2.65);
    keyLight.position.set(8, 13, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -18;
    keyLight.shadow.camera.right = 18;
    keyLight.shadow.camera.top = 18;
    keyLight.shadow.camera.bottom = -18;
    keyLight.shadow.bias = -0.00035;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x7fa6b8, 0.58);
    fillLight.position.set(-10, 7, -8);
    this.scene.add(fillLight);

    const practical = new THREE.PointLight(0xe8a55a, 8, 13, 2);
    practical.position.set(-2.2, 3.6, 2.8);
    this.scene.add(practical);
  }

  bindEvents() {
    this.onPointerDown = (event) => {
      if (event.button !== 0) return;
      this.pointerStart = { x: event.clientX, y: event.clientY };
    };

    this.onPointerUp = (event) => {
      if (event.button !== 0 || !this.pointerStart || this.transformInteracting) {
        this.pointerStart = null;
        return;
      }
      const distance = Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y);
      this.pointerStart = null;
      if (distance > 5) return;
      this.pick(event);
    };

    this.onTransformMouseDown = () => {
      this.transformInteracting = true;
    };

    this.onTransformMouseUp = () => {
      this.store.checkpoint();
      window.setTimeout(() => {
        this.transformInteracting = false;
      }, 0);
    };

    this.onDraggingChanged = (event) => {
      this.isDragging = Boolean(event.value);
      this.orbitControls.enabled = this.mode === "edit" && !this.isDragging;
    };

    this.onObjectChange = () => this.writeTransformToStore();

    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    this.transformControls.addEventListener("mouseDown", this.onTransformMouseDown);
    this.transformControls.addEventListener("mouseUp", this.onTransformMouseUp);
    this.transformControls.addEventListener("dragging-changed", this.onDraggingChanged);
    this.transformControls.addEventListener("objectChange", this.onObjectChange);
  }

  createMesh(object) {
    if (object.type === "group") {
      const group = new THREE.Group();
      group.userData.objectId = object.id;
      group.userData.objectType = object.type;
      this.scene.add(group);
      this.meshes.set(object.id, group);
      return group;
    }
    const geometry = geometryForType(object.type);
    const render = object.render ?? {};
    const material = new THREE.MeshStandardMaterial({
      color: object.color,
      roughness: render.roughness ?? 0.7,
      metalness: render.metalness ?? 0.02,
      emissive: render.emissive ?? "#000000",
      emissiveIntensity: render.emissiveIntensity ?? 0,
      transparent: (render.opacity ?? 1) < 1,
      opacity: render.opacity ?? 1,
      depthWrite: (render.opacity ?? 1) >= 0.35,
    });
    if (render.textureDataUrl) {
      let texture = this.textureCache.get(render.textureDataUrl);
      if (!texture) {
        texture = new THREE.TextureLoader().load(render.textureDataUrl);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        this.textureCache.set(render.textureDataUrl, texture);
      }
      material.map = texture;
      material.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = object.type !== "plane";
    mesh.receiveShadow = true;
    mesh.userData.objectId = object.id;
    mesh.userData.objectType = object.type;

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 28),
      new THREE.LineBasicMaterial({ color: 0x151817, transparent: true, opacity: 0.38 }),
    );
    edges.userData.isEdgeOverlay = true;
    edges.visible = this.mode === "edit" && render.edge !== false;
    mesh.add(edges);
    if (render.light) {
      const light = new THREE.PointLight(
        render.light.color,
        render.light.intensity,
        render.light.distance,
        render.light.decay,
      );
      light.userData.isObjectLight = true;
      mesh.add(light);
    }
    this.scene.add(mesh);
    this.meshes.set(object.id, mesh);
    return mesh;
  }

  disposeMesh(mesh) {
    const managedChildren = [...mesh.children].filter((child) => (
      child.userData.objectId && this.meshes.get(child.userData.objectId) === child
    ));
    managedChildren.forEach((child) => this.scene.attach(child));
    mesh.removeFromParent();
    mesh.traverse((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
      else child.material?.dispose?.();
    });
  }

  sync(state) {
    this.lastState = state;
    const activeIds = new Set(state.project.objects.map((object) => object.id));
    for (const [id, mesh] of this.meshes) {
      if (!activeIds.has(id)) {
        if (this.transformControls.object === mesh) this.transformControls.detach();
        this.clearAsset(id, { resync: false });
        this.disposeMesh(mesh);
        this.meshes.delete(id);
      }
    }

    for (const object of state.project.objects) {
      if (!this.meshes.has(object.id)) this.createMesh(object);
    }
    for (const object of state.project.objects) {
      const mesh = this.meshes.get(object.id);
      const parent = object.parentId ? this.meshes.get(object.parentId) : this.scene;
      const safeParent = parent && parent !== mesh ? parent : this.scene;
      if (mesh.parent !== safeParent) safeParent.add(mesh);
    }
    for (const object of state.project.objects) {
      const mesh = this.meshes.get(object.id);
      const previewObject = this.mode === "preview" ? this.directorFrame?.objects?.[object.id] : null;
      this.syncMesh(mesh, previewObject ? { ...object, ...previewObject } : object, state.selectionId);
    }
    this.rebuildAssetReplacementMap();
    this.applyAssetReplacements();
    this.scene.updateMatrixWorld(true);

    this.syncSelection(state);
    this.transformControls.setMode(state.tool);
  }

  syncMesh(mesh, object, selectionId) {
    mesh.name = object.name;
    mesh.visible = object.visible;
    const render = object.render ?? {};
    if (mesh.material) {
      mesh.material.color?.set(object.color);
      mesh.material.roughness = render.roughness ?? 0.7;
      mesh.material.metalness = render.metalness ?? 0.02;
      mesh.material.emissive?.set(render.emissive ?? "#000000");
      mesh.material.emissiveIntensity = render.emissiveIntensity ?? 0;
      mesh.material.opacity = render.opacity ?? 1;
      mesh.material.transparent = mesh.material.opacity < 1;
      mesh.material.depthWrite = mesh.material.opacity >= 0.35;
    }
    mesh.children.forEach((child) => {
      if (child.userData.isEdgeOverlay) child.visible = this.mode === "edit" && render.edge !== false;
      if (child.userData.isObjectLight && render.light) {
        child.visible = this.mode !== "preview" || this.previewObjectLightsEnabled;
        child.color.set(render.light.color);
        child.intensity = render.light.intensity;
        child.distance = render.light.distance;
        child.decay = render.light.decay;
      }
    });
    mesh.userData.locked = object.locked;
    mesh.userData.dimensions = [...object.dimensions];
    mesh.userData.entityRole = object.entity?.role ?? "prop";

    if (this.mode === "preview" || !(this.isDragging && object.id === selectionId)) {
      mesh.position.fromArray(object.position);
      mesh.rotation.set(
        object.rotation[0] * DEG_TO_RAD,
        object.rotation[1] * DEG_TO_RAD,
        object.rotation[2] * DEG_TO_RAD,
      );
      mesh.scale.set(
        object.dimensions[0] * object.scale[0],
        object.dimensions[1] * object.scale[1],
        object.dimensions[2] * object.scale[2],
      );
      mesh.updateMatrixWorld(true);
    }
    const assetController = this.assetControllers.get(object.id);
    assetController?.fitToCarrier(mesh.scale);
    assetController?.setState(this.mode === "preview" ? object.animationState : "idle");
  }

  syncSelection(state) {
    const selectedObject = state.project.objects.find((object) => object.id === state.selectionId) ?? null;
    const selectedMesh = selectedObject ? this.meshes.get(selectedObject.id) ?? null : null;

    if (selectedMesh !== this.selectedMesh) {
      this.removeSelectionHelper();
      this.selectedMesh = selectedMesh;
      if (selectedMesh) {
        this.selectionHelper = new THREE.BoxHelper(selectedMesh, 0xf2a33a);
        this.selectionHelper.material.transparent = true;
        this.selectionHelper.material.opacity = 0.95;
        this.selectionHelper.material.depthTest = false;
        this.selectionHelper.renderOrder = 100;
        this.scene.add(this.selectionHelper);
      }
    }

    if (this.mode === "edit" && selectedMesh && selectedObject.visible && !selectedObject.locked) {
      if (this.transformControls.object !== selectedMesh) this.transformControls.attach(selectedMesh);
    } else {
      this.transformControls.detach();
    }

    if (this.selectionHelper) this.selectionHelper.visible = this.mode === "edit" && Boolean(selectedObject?.visible);
  }

  removeSelectionHelper() {
    if (!this.selectionHelper) return;
    this.scene.remove(this.selectionHelper);
    this.selectionHelper.geometry?.dispose?.();
    this.selectionHelper.material?.dispose?.();
    this.selectionHelper = null;
  }

  writeTransformToStore() {
    const mesh = this.transformControls.object;
    if (!mesh) return;
    const id = mesh.userData.objectId;
    const object = this.store.getState().project.objects.find((candidate) => candidate.id === id);
    if (!object || object.locked) return;

    this.store.updateObject(id, {
      position: [round(mesh.position.x), round(mesh.position.y), round(mesh.position.z)],
      rotation: [
        round(mesh.rotation.x * RAD_TO_DEG, 3),
        round(mesh.rotation.y * RAD_TO_DEG, 3),
        round(mesh.rotation.z * RAD_TO_DEG, 3),
      ],
      scale: [
        round(mesh.scale.x / object.dimensions[0]),
        round(mesh.scale.y / object.dimensions[1]),
        round(mesh.scale.z / object.dimensions[2]),
      ],
    }, { history: false });
  }

  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.activeCamera);
    const hits = this.raycaster.intersectObjects([...this.meshes.values()], true);
    const hit = hits.find((candidate) => {
      const materials = Array.isArray(candidate.object.material)
        ? candidate.object.material
        : [candidate.object.material];
      return candidate.object.visible
        && !candidate.object.userData.isEdgeOverlay
        && materials.some((material) => !material || material.visible !== false);
    });
    let hitObject = hit?.object ?? null;
    while (hitObject && !hitObject.userData.objectId) hitObject = hitObject.parent;
    const hitId = hitObject?.userData.objectId ?? null;
    if (this.mode === "preview") {
      if (hitId) this.previewInteractionHandler?.(hitId);
      return;
    }
    this.store.setSelection(hitId);
  }

  getSceneBounds() {
    const visibleMeshes = [...this.meshes.values()].filter((mesh) => mesh.visible);
    if (!visibleMeshes.length) {
      return { center: new THREE.Vector3(0, 1, 0), size: 8 };
    }
    const box = new THREE.Box3();
    visibleMeshes.forEach((mesh) => box.expandByObject(mesh));
    const center = box.getCenter(new THREE.Vector3());
    const dimensions = box.getSize(new THREE.Vector3());
    return { center, size: Math.max(dimensions.x, dimensions.y, dimensions.z, 4) };
  }

  getFocus() {
    if (this.selectedMesh?.visible) {
      return { center: this.selectedMesh.position.clone(), size: Math.max(...this.selectedMesh.scale.toArray(), 3) };
    }
    return this.getSceneBounds();
  }

  setCameraPreset(preset) {
    const { center, size } = this.getFocus();
    const distance = Math.max(10, size * 1.65);
    this.activePreset = preset;

    if (preset === "perspective") {
      this.activeCamera = this.perspectiveCamera;
      this.perspectiveCamera.up.set(0, 1, 0);
      this.perspectiveCamera.position.copy(center).add(new THREE.Vector3(distance * 0.72, distance * 0.58, distance * 0.72));
      this.perspectiveCamera.lookAt(center);
    } else {
      this.activeCamera = this.orthoCamera;
      this.orthoSpan = Math.max(8, size * 1.35);
      if (preset === "front") {
        this.orthoCamera.up.set(0, 1, 0);
        this.orthoCamera.position.copy(center).add(new THREE.Vector3(0, 0, distance));
      } else if (preset === "side") {
        this.orthoCamera.up.set(0, 1, 0);
        this.orthoCamera.position.copy(center).add(new THREE.Vector3(distance, 0, 0));
      } else {
        this.orthoCamera.up.set(0, 0, -1);
        this.orthoCamera.position.copy(center).add(new THREE.Vector3(0, distance, 0.001));
      }
      this.updateOrthoProjection();
      this.orthoCamera.lookAt(center);
    }

    this.orbitControls.object = this.activeCamera;
    this.orbitControls.target.copy(center);
    this.orbitControls.update();
    this.transformControls.camera = this.activeCamera;
    this.resize();
  }

  setPreviewInteractionHandler(handler) {
    this.previewInteractionHandler = typeof handler === "function" ? handler : null;
  }

  setPerformanceHandler(handler) {
    this.performanceHandler = typeof handler === "function" ? handler : null;
  }

  async attachRuntimeAsset(id, createController, label) {
    const object = this.store.getState().project.objects.find((candidate) => candidate.id === id);
    const carrier = this.meshes.get(id);
    if (!object || !carrier) throw new Error("请先选择一个仍在场景中的物体。");
    const token = Symbol(id);
    this.assetLoadTokens.set(id, token);
    const controller = await createController(object);
    if (this.assetLoadTokens.get(id) !== token || !this.meshes.has(id)) {
      controller.dispose();
      throw new Error(`${label}载入期间目标物体已改变，请重新选择后导入。`);
    }
    this.clearAsset(id, { resync: false });
    carrier.add(controller.root);
    controller.fitToCarrier(carrier.scale);
    this.assetControllers.set(id, controller);
    this.rebuildAssetReplacementMap();
    this.applyAssetReplacements();
    this.scene.updateMatrixWorld(true);
    return controller.report;
  }

  async loadAssetFile(id, file) {
    return this.attachRuntimeAsset(id, async (object) => {
      const { loadModelFile } = await import("./asset-runtime.js");
      return loadModelFile(file, object.asset ?? {});
    }, "模型");
  }

  async loadSpatialBridgeFiles(id, files) {
    const selectedFiles = [...(files ?? [])];
    return this.attachRuntimeAsset(id, async (object) => {
      const { loadSpatialBridgeFiles } = await import("./spatial-bridge-runtime.js");
      return loadSpatialBridgeFiles(selectedFiles, object.asset ?? {});
    }, "RGB-D 工程");
  }

  clearAsset(id, { resync = true } = {}) {
    this.assetLoadTokens.delete(id);
    const controller = this.assetControllers.get(id);
    if (!controller) return false;
    controller.dispose();
    this.assetControllers.delete(id);
    const carrier = this.meshes.get(id);
    if (carrier?.material) carrier.material.visible = true;
    this.rebuildAssetReplacementMap();
    if (resync && this.lastState) this.sync(this.lastState);
    return true;
  }

  assetReport(id) {
    const controller = this.assetControllers.get(id);
    return controller ? { ...controller.report, runtime: controller.getState() } : null;
  }

  playAssetAction(id, actionName) {
    return this.assetControllers.get(id)?.playAction(actionName, { restart: true }) ?? false;
  }

  setAssetExpression(id, expressionName, weight, options = {}) {
    return this.assetControllers.get(id)?.setExpression(expressionName, weight, options) ?? false;
  }

  clearAssetExpressions(id) {
    const controller = this.assetControllers.get(id);
    if (!controller) return false;
    controller.clearExpressions();
    return true;
  }

  setAssetBonePose(id, boneName, pose) {
    return this.assetControllers.get(id)?.setBonePose(boneName, pose) ?? false;
  }

  clearAssetBonePose(id, boneName) {
    return this.assetControllers.get(id)?.clearBonePose(boneName) ?? false;
  }

  rebuildAssetReplacementMap() {
    const objects = this.lastState?.project.objects ?? [];
    const rootById = new Map([...this.assetControllers.keys()].map((id) => [id, id]));
    let changed = true;
    while (changed) {
      changed = false;
      for (const object of objects) {
        if (rootById.has(object.id) || !rootById.has(object.parentId)) continue;
        rootById.set(object.id, rootById.get(object.parentId));
        changed = true;
      }
    }
    this.assetReplacementRootById = rootById;
  }

  applyAssetReplacements() {
    for (const [id, rootId] of this.assetReplacementRootById) {
      const mesh = this.meshes.get(id);
      if (!mesh) continue;
      if (id !== rootId) {
        mesh.visible = false;
        continue;
      }
      if (mesh.material) mesh.material.visible = false;
      mesh.children.forEach((child) => {
        if (child.userData.isEdgeOverlay) child.visible = false;
      });
    }
  }

  setDirectorMode(mode) {
    const nextMode = mode === "preview" ? "preview" : "edit";
    if (nextMode === this.mode) return;

    if (nextMode === "preview") {
      this.previewSnapshot = {
        activeCamera: this.activeCamera === this.orthoCamera ? "orthographic" : "perspective",
        activePreset: this.activePreset,
        orthoSpan: this.orthoSpan,
        perspectivePosition: this.perspectiveCamera.position.clone(),
        perspectiveQuaternion: this.perspectiveCamera.quaternion.clone(),
        perspectiveUp: this.perspectiveCamera.up.clone(),
        orthoPosition: this.orthoCamera.position.clone(),
        orthoQuaternion: this.orthoCamera.quaternion.clone(),
        orthoUp: this.orthoCamera.up.clone(),
        target: this.orbitControls.target.clone(),
      };
      this.mode = "preview";
      this.grid.visible = false;
      this.axes.visible = false;
      this.meshes.forEach((mesh) => {
        delete mesh.userData.previewState;
        delete mesh.userData.previewBase;
        mesh.children.forEach((child) => {
          if (child.userData.isEdgeOverlay) child.visible = false;
        });
      });
      this.transformControls.detach();
      if (this.selectionHelper) this.selectionHelper.visible = false;
      this.orbitControls.enabled = false;
      this.renderer.domElement.classList.add("is-director-preview");
      this.framePacing.qualityScale = 1;
      this.framePacing.reset(performance.now());
      this.renderer.setPixelRatio(this.basePixelRatio);
      this.setPreviewEffects(true);
      return;
    }

    this.mode = "edit";
    this.grid.visible = true;
    this.axes.visible = true;
    this.directorFrame = null;
    this.interactionEffects.clear();
    this.interactionVisibility.clear();
    this.renderer.domElement.classList.remove("is-director-preview");
    const snapshot = this.previewSnapshot;
    if (snapshot) {
      this.activePreset = snapshot.activePreset;
      this.orthoSpan = snapshot.orthoSpan;
      this.perspectiveCamera.position.copy(snapshot.perspectivePosition);
      this.perspectiveCamera.quaternion.copy(snapshot.perspectiveQuaternion);
      this.perspectiveCamera.up.copy(snapshot.perspectiveUp);
      this.orthoCamera.position.copy(snapshot.orthoPosition);
      this.orthoCamera.quaternion.copy(snapshot.orthoQuaternion);
      this.orthoCamera.up.copy(snapshot.orthoUp);
      this.activeCamera = snapshot.activeCamera === "orthographic" ? this.orthoCamera : this.perspectiveCamera;
      this.orbitControls.object = this.activeCamera;
      this.orbitControls.target.copy(snapshot.target);
      this.transformControls.camera = this.activeCamera;
    }
    this.previewSnapshot = null;
    this.orbitControls.enabled = true;
    this.framePacing.qualityScale = 1;
    this.framePacing.reset(performance.now());
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.setPreviewEffects(true);
    if (this.lastState) this.sync(this.lastState);
    this.orbitControls.update();
    this.resize();
  }

  focusForObject(id) {
    const mesh = id ? this.meshes.get(id) : null;
    if (mesh) {
      const bounds = new THREE.Box3().setFromObject(mesh);
      const dimensions = bounds.getSize(new THREE.Vector3());
      return {
        center: bounds.isEmpty() ? mesh.getWorldPosition(new THREE.Vector3()) : bounds.getCenter(new THREE.Vector3()),
        size: Math.max(dimensions.x, dimensions.y, dimensions.z, 2.4),
      };
    }
    return this.getSceneBounds();
  }

  cameraPose(preset, targetId = null, framing = 1) {
    const { center, size } = this.focusForObject(targetId);
    const safeFraming = Math.min(4, Math.max(0.25, Number(framing) || 1));
    const distance = Math.max(targetId ? 5.5 : 10, size * (targetId ? 2.1 : 1.65)) * safeFraming;
    const pose = {
      preset,
      target: center,
      up: new THREE.Vector3(0, 1, 0),
      span: Math.max(8, size * 1.35) * safeFraming,
    };
    if (preset === "front") pose.position = center.clone().add(new THREE.Vector3(0, 0, distance));
    else if (preset === "side") pose.position = center.clone().add(new THREE.Vector3(distance, 0, 0));
    else if (preset === "top") {
      pose.position = center.clone().add(new THREE.Vector3(0, distance, 0.001));
      pose.up.set(0, 0, -1);
    } else if (targetId) {
      pose.position = center.clone().add(new THREE.Vector3(distance * 0.86, distance * 0.52, distance * 0.78));
    } else {
      pose.position = center.clone().add(new THREE.Vector3(distance * 0.72, distance * 0.58, distance * 0.72));
    }
    return pose;
  }

  applyDirectorCamera(camera) {
    if (!camera) return;
    if (Array.isArray(camera.toPosition) && Array.isArray(camera.toLookAt)) {
      const fromPosition = new THREE.Vector3().fromArray(camera.fromPosition ?? camera.toPosition);
      const toPosition = new THREE.Vector3().fromArray(camera.toPosition);
      const fromLookAt = new THREE.Vector3().fromArray(camera.fromLookAt ?? camera.toLookAt);
      const toLookAt = new THREE.Vector3().fromArray(camera.toLookAt);
      const sampleCurve = (path, fallbackFrom, fallbackTo) => {
        if (!Array.isArray(path) || path.length < 3) {
          return fallbackFrom.clone().lerp(fallbackTo, camera.progress);
        }
        return cameraCurveFor(path).getPointAt(camera.progress);
      };
      const target = sampleCurve(camera.lookAtPath, fromLookAt, toLookAt);
      this.activeCamera = this.perspectiveCamera;
      this.perspectiveCamera.position.copy(sampleCurve(camera.positionPath, fromPosition, toPosition));
      this.perspectiveCamera.fov = THREE.MathUtils.lerp(
        Number(camera.fromFov) || 42,
        Number(camera.toFov) || 42,
        camera.progress,
      );
      this.perspectiveCamera.up.set(0, 1, 0);
      this.perspectiveCamera.lookAt(target);
      this.perspectiveCamera.updateProjectionMatrix();
      this.orbitControls.target.copy(target);
      this.orbitControls.object = this.activeCamera;
      this.transformControls.camera = this.activeCamera;
      this.activeCamera.updateMatrixWorld(true);
      return;
    }
    const toPose = this.cameraPose(camera.preset, camera.targetId, camera.framing);
    const fromPose = this.cameraPose(camera.fromPreset, camera.fromTargetId, camera.fromFraming);
    const usesPerspective = camera.preset === "perspective" && camera.fromPreset === "perspective";
    const usesOrthographic = camera.preset !== "perspective" && camera.fromPreset !== "perspective";

    if (usesPerspective) {
      this.activeCamera = this.perspectiveCamera;
      this.perspectiveCamera.position.lerpVectors(fromPose.position, toPose.position, camera.progress);
      const target = fromPose.target.clone().lerp(toPose.target, camera.progress);
      this.perspectiveCamera.up.set(0, 1, 0);
      this.perspectiveCamera.lookAt(target);
      this.orbitControls.target.copy(target);
    } else if (usesOrthographic) {
      this.activeCamera = this.orthoCamera;
      this.orthoCamera.position.lerpVectors(fromPose.position, toPose.position, camera.progress);
      this.orthoCamera.up.copy(fromPose.up).lerp(toPose.up, camera.progress).normalize();
      this.orthoSpan = THREE.MathUtils.lerp(fromPose.span, toPose.span, camera.progress);
      this.updateOrthoProjection();
      const target = fromPose.target.clone().lerp(toPose.target, camera.progress);
      this.orthoCamera.lookAt(target);
      this.orbitControls.target.copy(target);
    } else {
      this.activeCamera = camera.preset === "perspective" ? this.perspectiveCamera : this.orthoCamera;
      this.activeCamera.position.copy(toPose.position);
      this.activeCamera.up.copy(toPose.up);
      if (this.activeCamera === this.orthoCamera) {
        this.orthoSpan = toPose.span;
        this.updateOrthoProjection();
      }
      this.activeCamera.lookAt(toPose.target);
      this.orbitControls.target.copy(toPose.target);
    }

    this.orbitControls.object = this.activeCamera;
    this.transformControls.camera = this.activeCamera;
    this.activeCamera.updateMatrixWorld(true);
  }

  applyDirectorFrame(frame) {
    if (this.mode !== "preview" || !this.lastState) return;
    this.directorFrame = frame;
    this.resetTimelineInteractionPoses();
    for (const object of this.lastState.project.objects) {
      const mesh = this.meshes.get(object.id);
      if (!mesh) continue;
      const override = frame.objects?.[object.id];
      const transformChanged = this.syncPreviewMesh(mesh, override ?? object, object);
      if (this.interactionVisibility.has(object.id)) {
        mesh.visible = this.interactionVisibility.get(object.id);
      }
      const hadPreviewBase = Boolean(mesh.userData.previewBase);
      const previewBase = mesh.userData.previewBase ?? {
        position: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        scale: new THREE.Vector3(),
        visible: true,
      };
      if (transformChanged || !hadPreviewBase) {
        previewBase.position.copy(mesh.position);
        previewBase.rotation.copy(mesh.rotation);
        previewBase.scale.copy(mesh.scale);
      }
      previewBase.visible = mesh.visible;
      mesh.userData.previewBase = previewBase;
    }
    this.applyAssetReplacements();
    this.scene.updateMatrixWorld(true);
    this.applyTimelineInteractionPoses(frame.interactionPoses ?? frame.interactions);
    this.scene.updateMatrixWorld(true);
    this.applyDirectorCamera(frame.camera);
    this.applyInteractionEffects(performance.now());
  }

  syncPreviewMesh(mesh, frameObject, sourceObject) {
    const previous = mesh.userData.previewState;
    const nextVisible = frameObject.visible;
    const nextPosition = frameObject.position;
    const nextRotation = frameObject.rotation;
    const nextScale = frameObject.scale;
    const changed = !previous
      || previous.visible !== nextVisible
      || !sameVector(previous.position, nextPosition)
      || !sameVector(previous.rotation, nextRotation)
      || !sameVector(previous.scale, nextScale);
    const assetController = this.assetControllers.get(sourceObject.id);
    assetController?.setState(frameObject.animationState ?? "idle");
    if (!changed) return false;

    mesh.visible = frameObject.visible;
    mesh.position.fromArray(frameObject.position);
    mesh.rotation.set(
      frameObject.rotation[0] * DEG_TO_RAD,
      frameObject.rotation[1] * DEG_TO_RAD,
      frameObject.rotation[2] * DEG_TO_RAD,
    );
    mesh.scale.set(
      sourceObject.dimensions[0] * frameObject.scale[0],
      sourceObject.dimensions[1] * frameObject.scale[1],
      sourceObject.dimensions[2] * frameObject.scale[2],
    );
    assetController?.fitToCarrier(mesh.scale);
    mesh.userData.previewState = {
      visible: nextVisible,
      position: [...nextPosition],
      rotation: [...nextRotation],
      scale: [...nextScale],
    };
    return true;
  }

  resetTimelineInteractionPoses() {
    for (const id of this.timelineInteractionObjectIds) {
      const mesh = this.meshes.get(id);
      const base = mesh?.userData.previewBase;
      if (!mesh || !base) continue;
      mesh.position.copy(base.position);
      mesh.rotation.copy(base.rotation);
      mesh.scale.copy(base.scale);
    }
    this.timelineInteractionObjectIds.clear();
  }

  applyTimelineInteractionPoses(interactions = []) {
    if (!Array.isArray(interactions) || !interactions.length) return;
    const objects = this.lastState?.project.objects ?? [];
    const sourceById = new Map(objects.map((object) => [object.id, object]));
    const isDescendantOf = (object, rootId) => {
      let cursor = object;
      while (cursor?.parentId) {
        if (cursor.parentId === rootId) return true;
        cursor = sourceById.get(cursor.parentId);
      }
      return false;
    };
    const setWorldOffset = (mesh, offset) => {
      const world = mesh.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3().fromArray(offset));
      mesh.position.copy(mesh.parent ? mesh.parent.worldToLocal(world) : world);
      if (mesh.userData.objectId) this.timelineInteractionObjectIds.add(mesh.userData.objectId);
    };
    const descendantForRole = (rootSource, nodeRole) => {
      if (!rootSource) return null;
      const configuredRole = String(rootSource.asset?.nodes?.[nodeRole] ?? "").toLowerCase();
      const roleCandidates = new Set([
        String(nodeRole ?? "").toLowerCase(),
        configuredRole,
      ].filter(Boolean));
      return objects.find((object) => (
        isDescendantOf(object, rootSource.id)
        && (roleCandidates.has(String(object.nodeRole ?? "").toLowerCase())
          || roleCandidates.has(String(object.id).toLowerCase()))
      ));
    };
    const stretchArmToEffector = (rootSource, effectorMesh) => {
      const rootMesh = this.meshes.get(rootSource.id);
      const armSource = descendantForRole(rootSource, "arm");
      const armMesh = armSource ? this.meshes.get(armSource.id) : null;
      const armBase = armMesh?.userData.previewBase;
      if (!rootMesh || !armSource || !armMesh || !armBase || !armMesh.parent) return;

      const shoulder = rootSource.interactionSpec?.anchors?.shoulder ?? [0, 1, 0];
      const shoulderWorld = rootMesh.localToWorld(new THREE.Vector3().fromArray(shoulder));
      const effectorWorld = effectorMesh.getWorldPosition(new THREE.Vector3());
      const start = armMesh.parent.worldToLocal(shoulderWorld.clone());
      const end = armMesh.parent.worldToLocal(effectorWorld.clone());
      const direction = end.clone().sub(start);
      const length = direction.length();
      if (length <= 0.001) return;

      armMesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
      armMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
      armMesh.scale.set(armBase.scale.x, armBase.scale.y, length);
      this.timelineInteractionObjectIds.add(armSource.id);
    };
    const moveEffector = (rootSource, anchorWorld, nodeRole, weight, contactMesh) => {
      if (!rootSource || this.assetControllers.has(rootSource.id) || weight <= 0) return;
      const effectorSource = descendantForRole(rootSource, nodeRole);
      const effectorMesh = effectorSource ? this.meshes.get(effectorSource.id) : null;
      const effectorBase = effectorMesh?.userData.previewBase;
      const rootMesh = this.meshes.get(rootSource.id);
      if (!effectorMesh || !effectorBase || !rootMesh) return;

      const targetBounds = contactMesh
        ? new THREE.Box3().setFromObject(contactMesh)
        : new THREE.Box3(anchorWorld.clone(), anchorWorld.clone());
      const targetSize = targetBounds.getSize(new THREE.Vector3());
      const effectorSize = new THREE.Box3().setFromObject(effectorMesh).getSize(new THREE.Vector3());
      const contactWorld = new THREE.Vector3().fromArray(surfaceContactPosition(
        rootMesh.getWorldPosition(new THREE.Vector3()).toArray(),
        anchorWorld.toArray(),
        [targetSize.x / 2, targetSize.y / 2, targetSize.z / 2],
        Math.max(effectorSize.x, effectorSize.z) / 2,
      ));
      const reachedWorld = effectorMesh.getWorldPosition(new THREE.Vector3()).lerp(contactWorld, weight);
      effectorMesh.position.copy(effectorMesh.parent ? effectorMesh.parent.worldToLocal(reachedWorld) : reachedWorld);
      this.timelineInteractionObjectIds.add(effectorSource.id);
      this.scene.updateMatrixWorld(true);
      stretchArmToEffector(rootSource, effectorMesh);
    };

    for (const interaction of interactions) {
      const actorMesh = this.meshes.get(interaction.actorId);
      const targetMesh = this.meshes.get(interaction.targetId);
      const actorSource = sourceById.get(interaction.actorId);
      const targetSource = sourceById.get(interaction.targetId);
      if (!actorMesh || !targetMesh || !actorSource || !targetSource) continue;

      const actorWorld = actorMesh.getWorldPosition(new THREE.Vector3());
      const contactSource = sourceById.get(interaction.contactTargetId) ?? targetSource;
      const contactMesh = this.meshes.get(contactSource.id) ?? targetMesh;
      const targetWorld = contactMesh.getWorldPosition(new THREE.Vector3());
      const targetQuaternion = contactMesh.getWorldQuaternion(new THREE.Quaternion());
      const anchorName = interaction.contactAnchor ?? interaction.targetAnchor;
      const anchor = contactSource.interactionSpec?.anchors?.[anchorName] ?? [0, 0, 0];
      targetWorld.add(new THREE.Vector3().fromArray(anchor).applyQuaternion(targetQuaternion));
      const pose = proceduralInteractionPose(actorWorld.toArray(), targetWorld.toArray(), interaction.phase);
      const effectorWeights = effectorWeightsForInteraction(interaction.ownershipMode, interaction.phase);

      if (!interaction.ownershipMode || interaction.ownershipMode === "none") {
        setWorldOffset(actorMesh, pose.actorOffset);
      }
      if (!interaction.ownershipMode || interaction.ownershipMode === "none") {
        setWorldOffset(targetMesh, pose.targetOffset);
        targetMesh.scale.multiplyScalar(pose.targetScale);
        this.timelineInteractionObjectIds.add(targetSource.id);
      }
      this.scene.updateMatrixWorld(true);
      moveEffector(actorSource, targetWorld, interaction.actorNode, effectorWeights.actor, contactMesh);
      if (interaction.recipientId) {
        moveEffector(
          sourceById.get(interaction.recipientId),
          targetWorld,
          interaction.actorNode,
          effectorWeights.recipient,
          contactMesh,
        );
      }
    }
  }

  triggerInteraction(id, interaction) {
    if (this.mode !== "preview" || interaction?.trigger !== "click" || interaction.action === "none") return false;
    const mesh = this.meshes.get(id);
    if (!mesh) return false;
    if (interaction.action === "toggleVisibility") {
      const nextVisible = !mesh.visible;
      this.interactionVisibility.set(id, nextVisible);
      mesh.visible = nextVisible;
      return true;
    }
    this.interactionEffects.set(id, {
      action: interaction.action,
      amount: interaction.amount,
      startedAt: performance.now(),
      duration: interaction.action === "spin" ? 900 : 620,
    });
    return true;
  }

  applyInteractionEffects(timestamp) {
    for (const [id, effect] of this.interactionEffects) {
      const mesh = this.meshes.get(id);
      const base = mesh?.userData.previewBase;
      if (!mesh || !base) {
        this.interactionEffects.delete(id);
        continue;
      }
      mesh.position.copy(base.position);
      mesh.rotation.copy(base.rotation);
      mesh.scale.copy(base.scale);
      mesh.visible = this.interactionVisibility.has(id) ? this.interactionVisibility.get(id) : base.visible;
      const progress = clamp01((timestamp - effect.startedAt) / effect.duration);
      if (effect.action === "pulse") {
        const factor = 1 + (effect.amount - 1) * Math.sin(progress * Math.PI);
        mesh.scale.multiplyScalar(factor);
      } else if (effect.action === "spin") {
        mesh.rotation.y += progress * Math.PI * 2;
      }
      if (progress >= 1) {
        mesh.position.copy(base.position);
        mesh.rotation.copy(base.rotation);
        mesh.scale.copy(base.scale);
        this.interactionEffects.delete(id);
      }
    }
  }

  updateOrthoProjection() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    const halfHeight = this.orthoSpan / 2;
    const halfWidth = halfHeight * aspect;
    this.orthoCamera.left = -halfWidth;
    this.orthoCamera.right = halfWidth;
    this.orthoCamera.top = halfHeight;
    this.orthoCamera.bottom = -halfHeight;
    this.orthoCamera.updateProjectionMatrix();
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.perspectiveCamera.aspect = width / height;
    this.perspectiveCamera.updateProjectionMatrix();
    this.updateOrthoProjection();
  }

  animate = (timestamp) => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    const deltaSeconds = this.lastAnimationTimestamp === null || !Number.isFinite(timestamp)
      ? 0
      : Math.min(0.1, Math.max(0, (timestamp - this.lastAnimationTimestamp) / 1000));
    this.lastAnimationTimestamp = Number.isFinite(timestamp) ? timestamp : this.lastAnimationTimestamp;
    this.assetControllers.forEach((controller) => controller.update(deltaSeconds));
    const report = this.framePacing.sample(timestamp);
    if (report?.qualityChanged && this.mode === "preview" && this.performanceAdaptationEnabled) {
      const pixelRatio = Math.max(0.5, this.basePixelRatio * report.qualityScale);
      this.renderer.setPixelRatio(pixelRatio);
      this.resize();
    }
    if (report && this.mode === "preview" && this.performanceAdaptationEnabled) {
      const shouldDisableShadows = report.averageMs > 40 || report.p95Ms > 60 || report.qualityScale <= 0.7;
      const shouldRestoreShadows = report.qualityScale >= 0.95 && report.averageMs < 19 && report.p95Ms < 24;
      if (shouldDisableShadows) this.setPreviewEffects(false);
      else if (shouldRestoreShadows) this.setPreviewEffects(true);
    }
    if (report && timestamp - this.lastPerformanceReportAt >= 500) {
      this.lastPerformanceReportAt = timestamp;
      this.performanceHandler?.({
        ...report,
        pixelRatio: this.renderer.getPixelRatio(),
        shadowsEnabled: this.previewShadowsEnabled,
        objectLightsEnabled: this.previewObjectLightsEnabled,
        adaptationEnabled: this.performanceAdaptationEnabled,
      });
    }
    if (this.mode === "edit") this.orbitControls.update();
    if (this.mode === "preview" && this.interactionEffects.size) this.applyInteractionEffects(timestamp);
    this.selectionHelper?.update();
    this.renderer.render(this.scene, this.activeCamera);
  };

  setPreviewEffects(enabled) {
    const next = Boolean(enabled);
    this.previewShadowsEnabled = next;
    this.previewObjectLightsEnabled = next;
    this.renderer.shadowMap.enabled = next;
    this.meshes.forEach((mesh) => mesh.children.forEach((child) => {
      if (child.userData.isObjectLight) child.visible = next;
    }));
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.assetControllers.forEach((controller) => controller.dispose());
    this.assetControllers.clear();
    this.unsubscribe?.();
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.transformControls.removeEventListener("mouseDown", this.onTransformMouseDown);
    this.transformControls.removeEventListener("mouseUp", this.onTransformMouseUp);
    this.transformControls.removeEventListener("dragging-changed", this.onDraggingChanged);
    this.transformControls.removeEventListener("objectChange", this.onObjectChange);
    this.removeSelectionHelper();
    this.transformControls.dispose?.();
    this.orbitControls.dispose();
    this.meshes.forEach((mesh) => this.disposeMesh(mesh));
    this.meshes.clear();
    this.textureCache.forEach((texture) => texture.dispose?.());
    this.textureCache.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
