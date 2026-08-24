import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { FramePacingMonitor } from "./frame-pacing.js";
import {
  effectorWeightsForInteraction,
  proceduralInteractionPose,
  surfaceContactPosition,
} from "./interaction-runtime.js";
import { selectIkSolvePolicy } from "./character-ik-runtime.js";
import { Cp03VisualEffects } from "./cp03/visual-effects.js";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const round = (value, precision = 4) => Number(value.toFixed(precision));
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const sameVector = (left, right) => left?.length === right?.length && left.every((value, index) => value === right[index]);
const cameraCurveCache = new WeakMap();
const blockedRuntimeAssetStates = new Set([
  "SOURCE_LOCKED",
  "EVIDENCE_LOCKED",
  "STAGE_LOCKED",
  "WITHHELD",
]);

const governanceEdgeStyle = (state, mode, evidenceOverlayEnabled, renderEdge = true) => {
  if (!state) return { visible: mode === "edit" && renderEdge, color: 0x151817, opacity: 0.38 };
  if (state === "SOURCE_LOCKED") return { visible: renderEdge, color: 0x65d8e8, opacity: 0.92 };
  if (state === "EVIDENCE_LOCKED") {
    return { visible: evidenceOverlayEnabled && renderEdge, color: 0xa8aaa3, opacity: 0.58 };
  }
  if (state === "AUTHORISED") return { visible: renderEdge, color: 0x7ad0c5, opacity: 0.72 };
  if (state === "PROPOSED") return { visible: renderEdge, color: 0x65d8e8, opacity: 0.84 };
  return { visible: false, color: 0x151817, opacity: 0 };
};

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
    this.casePackControllerCache = new Map();
    this.casePackAssetIdByCarrier = new Map();
    this.scenePatchMeshCache = new Map();
    this.timelineInteractionObjectIds = new Set();
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.framePacing = new FramePacingMonitor();
    this.performanceHandler = null;
    this.physicsHandler = null;
    this.physicsRuntime = null;
    this.physicsLoadToken = 0;
    this.physicsProject = null;
    this.lastPhysicsReportAt = 0;
    this.lastPerformanceReportAt = 0;
    this.lastAnimationTimestamp = null;
    this.previewShadowsEnabled = true;
    this.previewObjectLightsEnabled = true;
    this.performanceAdaptationEnabled = new URLSearchParams(window.location.search).get("renderQuality") !== "full";
    this.governanceOverlayEnabled = false;
    this.cp02DecisionEffects = [];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070909);
    this.scene.fog = new THREE.FogExp2(0x070909, 0.026);
    this.cp03VisualEffects = new Cp03VisualEffects(this.scene, (id) => this.meshes.get(id) ?? null);
    this.cp02ProposalRoot = new THREE.Group();
    this.cp02ProposalRoot.name = "CP02_PROPOSAL_PREVIEW";
    this.cp02ProposalRoot.userData.ephemeral = true;
    this.scene.add(this.cp02ProposalRoot);
    this.cp02DecisionLight = new THREE.PointLight(0x69d6ca, 0, 4.8, 2);
    this.cp02DecisionLight.userData.cp02DecisionPressure = true;
    this.scene.add(this.cp02DecisionLight);

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
    this.hemisphereLight = hemisphere;
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
    this.keyLight = keyLight;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x7fa6b8, 0.58);
    fillLight.position.set(-10, 7, -8);
    this.fillLight = fillLight;
    this.scene.add(fillLight);

    const practical = new THREE.PointLight(0xe8a55a, 8, 13, 2);
    practical.position.set(-2.2, 3.6, 2.8);
    this.practicalLight = practical;
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

  retainScenePatchMesh(id, mesh) {
    if (
      mesh.userData.governanceState !== "AUTHORISED"
      || !mesh.userData.governanceAssetId
    ) return false;
    mesh.removeFromParent();
    const previous = this.scenePatchMeshCache.get(id);
    if (previous && previous !== mesh) this.disposeMesh(previous);
    this.scenePatchMeshCache.set(id, mesh);
    return true;
  }

  restoreScenePatchMesh(object) {
    if (object.governance?.state !== "AUTHORISED" || !object.governance.assetId) return null;
    const mesh = this.scenePatchMeshCache.get(object.id);
    if (!mesh) return null;
    this.scenePatchMeshCache.delete(object.id);
    if (
      mesh.userData.objectType !== object.type
      || mesh.userData.governanceAssetId !== object.governance.assetId
    ) {
      this.disposeMesh(mesh);
      return null;
    }
    this.scene.add(mesh);
    this.meshes.set(object.id, mesh);
    return mesh;
  }

  sync(state) {
    this.lastState = state;
    if (this.physicsRuntime && this.physicsProject !== state.project) {
      this.disposePhysicsRuntime("PROJECT_CHANGED");
      if (this.mode === "preview") void this.preparePhysicsRuntime();
    }
    const activeIds = new Set(state.project.objects.map((object) => object.id));
    for (const [id, mesh] of this.meshes) {
      if (!activeIds.has(id)) {
        if (this.transformControls.object === mesh) this.transformControls.detach();
        this.clearAsset(id, { resync: false });
        if (!this.retainScenePatchMesh(id, mesh)) this.disposeMesh(mesh);
        this.meshes.delete(id);
      }
    }

    for (const object of state.project.objects) {
      if (!this.meshes.has(object.id)) this.restoreScenePatchMesh(object) ?? this.createMesh(object);
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
    const governanceState = object.governance?.state ?? null;
    const archiveTreatment = this.cp02LayerGrammar?.archiveObjectPrefixes?.some((prefix) => (
      object.id.startsWith(prefix)
    ))
      ? this.cp02LayerGrammar.archive
      : null;
    mesh.visible = object.visible && governanceState !== "WITHHELD";
    const render = object.render ?? {};
    if (mesh.material) {
      mesh.material.color?.set(object.color);
      mesh.material.roughness = render.roughness ?? 0.7;
      mesh.material.metalness = render.metalness ?? 0.02;
      mesh.material.emissive?.set(render.emissive ?? "#000000");
      mesh.material.emissiveIntensity = render.emissiveIntensity ?? 0;
      mesh.material.opacity = governanceState === "PROPOSED" ? 0.55 : (render.opacity ?? 1);
      mesh.material.transparent = mesh.material.opacity < 1;
      mesh.material.depthWrite = mesh.material.opacity >= 0.35;
      if (archiveTreatment) {
        mesh.material.color?.set(archiveTreatment.color);
        mesh.material.roughness = Math.max(
          mesh.material.roughness,
          Number(archiveTreatment.roughness) || 0,
        );
        mesh.material.opacity = Number(archiveTreatment.opacity) || mesh.material.opacity;
        mesh.material.transparent = mesh.material.opacity < 1;
        mesh.material.depthWrite = mesh.material.opacity >= 0.35;
        mesh.material.emissive?.set(archiveTreatment.emissive ?? "#000000");
        mesh.material.emissiveIntensity = Number(archiveTreatment.emissiveIntensity) || 0;
      }
    }
    let edgeStyle = governanceEdgeStyle(
      governanceState,
      this.mode,
      this.governanceOverlayEnabled,
      render.edge !== false,
    );
    if (archiveTreatment) {
      edgeStyle = {
        visible: render.edge !== false,
        color: archiveTreatment.edgeColor,
        opacity: archiveTreatment.edgeOpacity,
      };
    }
    mesh.children.forEach((child) => {
      if (child.userData.isEdgeOverlay) {
        child.visible = edgeStyle.visible;
        child.material?.color?.setHex(edgeStyle.color);
        if (child.material) child.material.opacity = edgeStyle.opacity;
      }
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
    mesh.userData.governanceState = governanceState;
    mesh.userData.governanceAssetId = object.governance?.assetId ?? null;
    mesh.userData.cp02VisualLayer = archiveTreatment ? "ARCHIVE_LOCKED" : null;

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

  getViewportCameraPose() {
    if (this.mode !== "edit" || this.activeCamera !== this.perspectiveCamera) return null;
    return {
      position: this.perspectiveCamera.position.toArray().map((value) => round(value)),
      lookAt: this.orbitControls.target.toArray().map((value) => round(value)),
      fov: round(this.perspectiveCamera.fov, 2),
    };
  }

  setViewportCameraPose(pose) {
    if (this.mode !== "edit" || !Array.isArray(pose?.position) || !Array.isArray(pose?.lookAt)) return false;
    const position = new THREE.Vector3().fromArray(pose.position);
    const target = new THREE.Vector3().fromArray(pose.lookAt);
    if (![...position.toArray(), ...target.toArray()].every(Number.isFinite)) return false;
    this.activePreset = "perspective";
    this.activeCamera = this.perspectiveCamera;
    this.perspectiveCamera.position.copy(position);
    this.perspectiveCamera.fov = Math.min(85, Math.max(18, Number(pose.fov) || 42));
    this.perspectiveCamera.up.set(0, 1, 0);
    this.perspectiveCamera.lookAt(target);
    this.perspectiveCamera.updateProjectionMatrix();
    this.orbitControls.object = this.activeCamera;
    this.orbitControls.target.copy(target);
    this.orbitControls.update();
    this.transformControls.camera = this.activeCamera;
    this.resize();
    return true;
  }

  setPreviewInteractionHandler(handler) {
    this.previewInteractionHandler = typeof handler === "function" ? handler : null;
  }

  setPerformanceHandler(handler) {
    this.performanceHandler = typeof handler === "function" ? handler : null;
  }

  setGovernanceOverlay(enabled) {
    this.governanceOverlayEnabled = Boolean(enabled);
    if (this.lastState) this.sync(this.lastState);
  }

  applyCp02VisualProfile(profile = {}) {
    const camera = profile.camera ?? {};
    const lighting = profile.lighting ?? {};
    const layers = profile.layers ?? null;
    const position = Array.isArray(camera.position) ? camera.position : [0, 3.6, 4];
    const target = Array.isArray(camera.target) ? camera.target : [0, 1.2, 0];
    const fov = Number(camera.fov) || 42;

    this.activePreset = "perspective";
    this.activeCamera = this.perspectiveCamera;
    this.perspectiveCamera.position.fromArray(position);
    this.perspectiveCamera.fov = fov;
    this.perspectiveCamera.up.set(0, 1, 0);
    this.perspectiveCamera.lookAt(new THREE.Vector3().fromArray(target));
    this.perspectiveCamera.updateProjectionMatrix();
    this.orbitControls.object = this.activeCamera;
    this.orbitControls.target.fromArray(target);
    this.orbitControls.update();
    this.transformControls.camera = this.activeCamera;

    this.renderer.toneMappingExposure = Number(lighting.exposure) || 1;
    this.hemisphereLight.intensity = Number(lighting.hemisphereIntensity) || 0;
    this.keyLight.intensity = Number(lighting.keyIntensity) || 0;
    this.fillLight.intensity = Number(lighting.fillIntensity) || 0;

    const practical = lighting.practical ?? {};
    if (Array.isArray(practical.position)) this.practicalLight.position.fromArray(practical.position);
    this.practicalLight.intensity = Number(practical.intensity) || 0;
    this.practicalLight.distance = Number(practical.distance) || 0;
    this.practicalLight.decay = Number(practical.decay) || 2;

    const readability = lighting.readability ?? {};
    if (!this.cp02ReadabilityLight) {
      this.cp02ReadabilityLight = new THREE.PointLight(0xffffff, 0, 0, 2);
      this.cp02ReadabilityLight.userData.cp02Readability = true;
      this.scene.add(this.cp02ReadabilityLight);
    }
    this.cp02ReadabilityLight.color.set(readability.color ?? "#ffffff");
    if (Array.isArray(readability.position)) this.cp02ReadabilityLight.position.fromArray(readability.position);
    this.cp02ReadabilityLight.intensity = Number(readability.intensity) || 0;
    this.cp02ReadabilityLight.distance = Number(readability.distance) || 0;
    this.cp02ReadabilityLight.decay = Number(readability.decay) || 2;

    this.cp02LayerGrammar = layers ? structuredClone(layers) : null;

    const evidence = {
      id: String(profile.id ?? "cp02-visual-profile"),
      status: "ACTIVE",
      camera: {
        position: this.perspectiveCamera.position.toArray(),
        target: this.orbitControls.target.toArray(),
        fov: this.perspectiveCamera.fov,
      },
      lighting: {
        exposure: this.renderer.toneMappingExposure,
        hemisphereIntensity: this.hemisphereLight.intensity,
        keyIntensity: this.keyLight.intensity,
        fillIntensity: this.fillLight.intensity,
        readabilityIntensity: this.cp02ReadabilityLight.intensity,
      },
      layers: this.cp02LayerGrammar ? {
        id: String(this.cp02LayerGrammar.id ?? "cp02-layer-grammar"),
        status: "ACTIVE",
        archiveObjectPrefixes: [...(this.cp02LayerGrammar.archiveObjectPrefixes ?? [])],
      } : null,
    };
    this.cp02VisualProfileEvidence = evidence;
    if (this.lastState) this.sync(this.lastState);
    return structuredClone(evidence);
  }

  clearCp02ProposalPreview() {
    if (!this.cp02ProposalRoot) return;
    const children = [...this.cp02ProposalRoot.children];
    children.forEach((child) => {
      child.removeFromParent();
      child.traverse((entry) => {
        entry.geometry?.dispose?.();
        if (Array.isArray(entry.material)) entry.material.forEach((material) => material.dispose?.());
        else entry.material?.dispose?.();
      });
    });
  }

  showCp02ProposalPreview({ catalog, slots, patch }) {
    this.clearCp02ProposalPreview();
    const assets = Array.isArray(catalog) ? catalog : [];
    const authoredSlots = Array.isArray(slots) ? slots : [];
    const operations = Array.isArray(patch?.operations) ? patch.operations : [];
    let primitiveCount = 0;

    for (const operation of operations) {
      if (!['add', 'replace'].includes(operation.kind)) continue;
      const asset = assets.find((candidate) => (
        candidate.assetId === operation.assetId
        && candidate.status === "PROJECT_AUTHORED_PROXY"
      ));
      const slot = authoredSlots.find((candidate) => candidate.id === operation.slotId);
      if (!asset?.bundle?.children || !slot || asset.semanticClass !== slot.semanticClass) continue;

      const bundleRoot = new THREE.Group();
      bundleRoot.name = `PROPOSED · ${asset.semanticClass}`;
      bundleRoot.position.fromArray(slot.position);
      bundleRoot.rotation.set(...slot.rotation.map((value) => value * DEG_TO_RAD));
      bundleRoot.userData.governanceState = "PROPOSED";
      bundleRoot.userData.ephemeral = true;

      for (const template of asset.bundle.children) {
        const geometry = geometryForType(template.type);
        const material = new THREE.MeshStandardMaterial({
          color: template.color,
          roughness: template.render?.roughness ?? 0.78,
          metalness: template.render?.metalness ?? 0.02,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = template.name;
        mesh.position.fromArray(template.position);
        mesh.rotation.set(...(template.rotation ?? [0, 0, 0]).map((value) => value * DEG_TO_RAD));
        mesh.scale.fromArray(template.dimensions);
        mesh.userData.governanceState = "PROPOSED";
        mesh.userData.ephemeral = true;
        mesh.renderOrder = 60;

        const seam = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry, 28),
          new THREE.LineDashedMaterial({
            color: 0x65d8e8,
            dashSize: 0.09,
            gapSize: 0.055,
            transparent: true,
            opacity: 0.92,
            depthTest: false,
          }),
        );
        seam.computeLineDistances();
        seam.userData.isProposalSeam = true;
        seam.renderOrder = 61;
        mesh.add(seam);
        bundleRoot.add(mesh);
        primitiveCount += 1;
      }
      this.cp02ProposalRoot.add(bundleRoot);
    }

    return primitiveCount;
  }

  showCp02DecisionPressure({ positions = [], outcome = "WITHHELD", durationMs = 1800 } = {}) {
    const duration = Math.max(250, Number(durationMs) || 1800);
    const color = outcome === "APPLIED" ? 0x69d6ca : 0xd27b58;
    const safePositions = (positions.length ? positions : [[0, 1.2, 0]])
      .filter((position) => Array.isArray(position) && position.length === 3 && position.every(Number.isFinite));
    const startedAt = performance.now();
    const center = safePositions.length
      ? safePositions.reduce((result, position) => result.add(new THREE.Vector3(...position)), new THREE.Vector3())
        .multiplyScalar(1 / safePositions.length)
      : new THREE.Vector3(0, 1.2, 0);
    this.cp02DecisionLight.color.setHex(color);
    this.cp02DecisionLight.position.copy(center);
    this.cp02DecisionLight.intensity = 0;
    this.cp02DecisionEffects = [{
      light: this.cp02DecisionLight,
      startedAt,
      duration,
      baseIntensity: 7.5,
    }];
    return duration;
  }

  applyCp02DecisionPressure(timestamp) {
    this.cp02DecisionEffects = this.cp02DecisionEffects.filter((effect) => {
      const progress = clamp01((timestamp - effect.startedAt) / effect.duration);
      if (progress >= 1) {
        effect.light.intensity = 0;
        return false;
      }
      const envelope = Math.sin(progress * Math.PI) ** 2;
      const pressure = 0.78 + (0.22 * Math.cos(progress * Math.PI * 4));
      effect.light.intensity = effect.baseIntensity * envelope * pressure;
      return true;
    });
  }

  async attachRuntimeAsset(id, createController, label) {
    const object = this.store.getState().project.objects.find((candidate) => candidate.id === id);
    const carrier = this.meshes.get(id);
    if (!object || !carrier) throw new Error("请先选择一个仍在场景中的物体。");
    const governanceState = object.governance?.state ?? null;
    if (blockedRuntimeAssetStates.has(governanceState)) {
      throw new Error(`${governanceState} 载体禁止附加运行时素材。`);
    }
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

  async loadCasePackAsset(id, casePack, assetId) {
    const object = this.store.getState().project.objects.find((candidate) => candidate.id === id);
    const carrier = this.meshes.get(id);
    if (!object || !carrier) throw new Error("Case Pack 目标载体不在当前场景中。");
    if (!casePack || typeof casePack.asset !== "function") throw new Error("Case Pack 尚未通过本地校验。");
    const token = Symbol(id);
    this.assetLoadTokens.set(id, token);
    const cachedController = this.casePackControllerCache.get(assetId);
    if (cachedController) this.casePackControllerCache.delete(assetId);
    const controller = cachedController ?? await casePack.asset(assetId);
    if (this.assetLoadTokens.get(id) !== token || !this.meshes.has(id)) {
      if (cachedController) this.casePackControllerCache.set(assetId, controller);
      else controller.dispose();
      throw new Error("Case Pack 载入期间目标载体已改变。");
    }
    this.clearAsset(id, { resync: false });
    carrier.add(controller.root);
    controller.fitToCarrier(carrier.scale);
    this.assetControllers.set(id, controller);
    this.casePackAssetIdByCarrier.set(id, assetId);
    this.rebuildAssetReplacementMap();
    this.applyAssetReplacements();
    this.scene.updateMatrixWorld(true);
    return controller.report;
  }

  applyAssetDisplayTreatment(id, treatment = {}) {
    const controller = this.assetControllers.get(id);
    if (!controller?.root) throw new Error("素材尚未材质化，无法应用显示处理。");
    const treatmentId = String(treatment.id ?? "").trim();
    if (!treatmentId) throw new Error("显示处理必须声明稳定 ID。");
    const yawDegrees = Number(treatment.yawDegrees) || 0;
    const materials = new Set();
    controller.root.traverse((node) => {
      const entries = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of entries) {
        if (!material?.isMaterial) continue;
        materials.add(material);
        if (treatment.color && material.color?.set) material.color.set(treatment.color);
        if (Number.isFinite(material.roughness) && Number.isFinite(treatment.minRoughness)) {
          material.roughness = Math.max(material.roughness, treatment.minRoughness);
        }
        if (Number.isFinite(material.metalness) && Number.isFinite(treatment.maxMetalness)) {
          material.metalness = Math.min(material.metalness, treatment.maxMetalness);
        }
        material.needsUpdate = true;
      }
    });
    controller.root.rotation.y = THREE.MathUtils.degToRad(yawDegrees);
    controller.root.userData.displayTreatmentId = treatmentId;
    controller.root.updateMatrixWorld(true);
    return {
      treatmentId,
      materialCount: materials.size,
      yawDegrees,
    };
  }

  async loadAssetFile(id, file) {
    return this.attachRuntimeAsset(id, async (object) => {
      const { loadModelFile } = await import("./asset-runtime.js");
      return loadModelFile(file, object.asset ?? {});
    }, "模型");
  }

  async loadRetargetAnimationFile(id, file) {
    const controller = this.assetControllers.get(id);
    if (!controller) throw new Error("请先为这个载体载入带骨架的 GLB 模型。");
    const { parseGlbAssetFile } = await import("./asset-runtime.js");
    const sourceAsset = await parseGlbAssetFile(file);
    try {
      const result = await controller.retargetAnimationsFrom(sourceAsset, { sourceName: file.name });
      this.scene.updateMatrixWorld(true);
      return { ...result, report: this.assetReport(id) };
    } finally {
      sourceAsset.scene?.traverse?.((node) => {
        node.geometry?.dispose?.();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.filter(Boolean).forEach((material) => material.dispose?.());
      });
    }
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
    const casePackAssetId = this.casePackAssetIdByCarrier.get(id);
    if (casePackAssetId) {
      controller.root.removeFromParent();
      const previous = this.casePackControllerCache.get(casePackAssetId);
      if (previous && previous !== controller) previous.dispose();
      this.casePackControllerCache.set(casePackAssetId, controller);
    } else {
      controller.dispose();
    }
    this.assetControllers.delete(id);
    this.casePackAssetIdByCarrier.delete(id);
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

  setAssetHandIk(id, handName, targetWorld, options = {}) {
    return this.assetControllers.get(id)?.setHandIk(handName, targetWorld, options) ?? false;
  }

  clearAssetHandIk(id, handName) {
    return this.assetControllers.get(id)?.clearHandIk(handName) ?? false;
  }

  setAssetRigBindings(id, bones) {
    return this.assetControllers.get(id)?.setRigBindings(bones) ?? null;
  }

  previewAssetRig(id, mode = "pose") {
    const controller = this.assetControllers.get(id);
    if (!controller) return false;
    const poseSlots = ["head", "leftUpperArm", "rightUpperArm"];
    poseSlots.forEach((slot) => controller.clearBonePose?.(slot));
    controller.clearTransientIkTargets?.();
    if (mode === "reset") {
      controller.clearIkTargets?.();
      controller.setBehaviorState?.("idle", {}, { recaptureFootLocks: true });
      return true;
    }
    if (mode === "pose") {
      controller.setBonePose?.("head", { rotationDegrees: [0, 18, 0] });
      controller.setBonePose?.("leftUpperArm", { rotationDegrees: [0, 0, -24] });
      controller.setBonePose?.("rightUpperArm", { rotationDegrees: [0, 0, 24] });
      return true;
    }
    if (mode === "hands") {
      const left = controller.boneFor?.("leftHand")?.getWorldPosition(new THREE.Vector3());
      const right = controller.boneFor?.("rightHand")?.getWorldPosition(new THREE.Vector3());
      if (left) controller.setHandIk?.("leftHand", left.add(new THREE.Vector3(0.1, 0.16, 0.18)), { iterations: 8 });
      if (right) controller.setHandIk?.("rightHand", right.add(new THREE.Vector3(-0.1, 0.16, 0.18)), { iterations: 8 });
      return Boolean(left || right);
    }
    if (mode === "feet") {
      return controller.setBehaviorState?.("idle", {}, { recaptureFootLocks: true }).ok ?? false;
    }
    return false;
  }

  showCp03ActionEffect(action, objectIds, options = {}) {
    return this.cp03VisualEffects.play(action, objectIds, options);
  }

  clearCp03ActionEffects() {
    this.cp03VisualEffects.clear();
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
      if (this.lastState) this.sync(this.lastState);
      void this.preparePhysicsRuntime();
      return;
    }

    this.mode = "edit";
    this.grid.visible = true;
    this.axes.visible = true;
    this.directorFrame = null;
    this.interactionEffects.clear();
    this.interactionVisibility.clear();
    this.disposePhysicsRuntime("EDIT_MODE");
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

  updateAssetIkPolicies() {
    if (!this.assetControllers.size) return;
    this.activeCamera.updateMatrixWorld(true);
    const cameraPosition = this.activeCamera.getWorldPosition(new THREE.Vector3());
    const fullQuality = !this.performanceAdaptationEnabled;
    for (const [id, controller] of this.assetControllers) {
      const mesh = this.meshes.get(id);
      if (!mesh) continue;
      const center = mesh.getWorldPosition(new THREE.Vector3());
      const projected = center.clone().project(this.activeCamera);
      let hierarchyVisible = true;
      for (let cursor = mesh; cursor; cursor = cursor.parent) {
        if (!cursor.visible) {
          hierarchyVisible = false;
          break;
        }
      }
      const visible = hierarchyVisible
        && projected.z >= -1.25
        && projected.z <= 1.25
        && Math.abs(projected.x) <= 1.35
        && Math.abs(projected.y) <= 1.35;
      const selected = this.lastState?.selectionId === id;
      const policy = selectIkSolvePolicy({
        distance: center.distanceTo(cameraPosition),
        visible,
        selected,
        fullQuality,
      });
      controller.setIkSolvePolicy?.(policy, { immediate: fullQuality || selected });
    }
  }

  applyDirectorFrame(frame) {
    if (this.mode !== "preview" || !this.lastState) return;
    this.directorFrame = frame;
    const transformedAssetIds = new Set();
    const batchedControllers = [...this.assetControllers.values()];
    batchedControllers.forEach((controller) => controller.beginIkBatch?.());
    try {
      this.resetTimelineInteractionPoses();
      for (const object of this.lastState.project.objects) {
        const mesh = this.meshes.get(object.id);
        if (!mesh) continue;
        const override = frame.objects?.[object.id];
        const transformChanged = this.syncPreviewMesh(mesh, override ?? object, object);
        if (transformChanged && this.assetControllers.has(object.id)) transformedAssetIds.add(object.id);
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
      this.applyDirectorCamera(frame.camera);
      this.updateAssetIkPolicies();
      this.applyCharacterBehaviors(frame.characterBehaviors, transformedAssetIds);
      this.scene.updateMatrixWorld(true);
      this.applyTimelineInteractionPoses(frame.interactionPoses ?? frame.interactions);
    } finally {
      batchedControllers.forEach((controller) => controller.endIkBatch?.());
    }
    this.scene.updateMatrixWorld(true);
    this.applyPhysicsFrame(frame);
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
    for (const controller of this.assetControllers.values()) controller.clearTransientIkTargets?.();
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

  applyCharacterBehaviors(behaviors = [], transformedAssetIds = new Set()) {
    if (!Array.isArray(behaviors)) return;
    for (const behavior of behaviors) {
      const controller = this.assetControllers.get(behavior.actorId);
      const actorMesh = this.meshes.get(behavior.actorId);
      if (!controller || !actorMesh) continue;
      controller.setBehaviorState?.(behavior.state ?? "idle", behavior, {
        synchronize: true,
        recaptureFootLocks: transformedAssetIds.has(behavior.actorId),
      });
      const targetMesh = behavior.targetId && behavior.targetId !== behavior.actorId
        ? this.meshes.get(behavior.targetId)
        : null;
      if (!targetMesh || !["look", "reach", "grasp", "transfer", "release"].includes(behavior.state)) continue;
      const targetBounds = new THREE.Box3().setFromObject(targetMesh);
      const targetWorld = targetBounds.isEmpty()
        ? targetMesh.getWorldPosition(new THREE.Vector3())
        : targetBounds.getCenter(new THREE.Vector3());
      controller.setLookTarget?.(targetWorld, { weight: behavior.state === "look" ? 1 : 0.72 });
      if (behavior.state !== "reach") continue;
      const hand = behavior.hand ?? "auto";
      if (hand === "both") {
        const width = Math.max(0.08, targetBounds.getSize(new THREE.Vector3()).x * 0.24);
        const actorRight = new THREE.Vector3(1, 0, 0)
          .applyQuaternion(actorMesh.getWorldQuaternion(new THREE.Quaternion()))
          .normalize()
          .multiplyScalar(width);
        controller.setHandIk?.("leftHand", targetWorld.clone().sub(actorRight), { iterations: 8 });
        controller.setHandIk?.("rightHand", targetWorld.clone().add(actorRight), { iterations: 8 });
      } else {
        controller.setHandIk?.(hand === "left" ? "leftHand" : "rightHand", targetWorld, { iterations: 8 });
      }
    }
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
      if (!rootSource || weight <= 0) return;
      const rootMesh = this.meshes.get(rootSource.id);
      if (!rootMesh) return;
      const targetBounds = contactMesh
        ? new THREE.Box3().setFromObject(contactMesh)
        : new THREE.Box3(anchorWorld.clone(), anchorWorld.clone());
      const targetSize = targetBounds.getSize(new THREE.Vector3());
      const runtimeController = this.assetControllers.get(rootSource.id);
      if (runtimeController) {
        const contactWorld = new THREE.Vector3().fromArray(surfaceContactPosition(
          rootMesh.getWorldPosition(new THREE.Vector3()).toArray(),
          anchorWorld.toArray(),
          [targetSize.x / 2, targetSize.y / 2, targetSize.z / 2],
          0.035,
        ));
        runtimeController.setHandIk?.(nodeRole, contactWorld, { weight, iterations: 6 });
        return;
      }
      const effectorSource = descendantForRole(rootSource, nodeRole);
      const effectorMesh = effectorSource ? this.meshes.get(effectorSource.id) : null;
      const effectorBase = effectorMesh?.userData.previewBase;
      if (!effectorMesh || !effectorBase || !rootMesh) return;

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
    this.updateAssetIkPolicies();
    this.assetControllers.forEach((controller) => controller.update(deltaSeconds));
    this.cp03VisualEffects.update(timestamp);
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
    if (this.cp02DecisionEffects.length) this.applyCp02DecisionPressure(timestamp);
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

  setPhysicsHandler(handler) {
    this.physicsHandler = typeof handler === "function" ? handler : null;
  }

  notifyPhysics(report) {
    this.physicsHandler?.(structuredClone(report));
  }

  async preparePhysicsRuntime() {
    const project = this.lastState?.project;
    const token = ++this.physicsLoadToken;
    this.physicsRuntime?.dispose();
    this.physicsRuntime = null;
    this.physicsProject = null;
    const { projectNeedsRapier } = await import("./rapier-runtime.js");
    if (token !== this.physicsLoadToken || this.mode !== "preview") return;
    if (!projectNeedsRapier(project)) {
      this.notifyPhysics({ status: "IDLE", backend: "deterministic-kinematic", reason: "NO_DYNAMIC_BODIES" });
      return;
    }
    this.notifyPhysics({ status: "LOADING", backend: "rapier3d-compat-0.20" });
    try {
      const { createRapierProjectRuntime } = await import("./rapier-runtime.js");
      const runtime = await createRapierProjectRuntime(project);
      if (token !== this.physicsLoadToken || this.mode !== "preview" || this.lastState?.project !== project) {
        runtime.dispose();
        return;
      }
      this.physicsRuntime = runtime;
      this.physicsProject = project;
      this.notifyPhysics({ status: "READY", ...runtime.snapshot() });
      if (this.directorFrame) this.applyPhysicsFrame(this.directorFrame);
    } catch (error) {
      if (token !== this.physicsLoadToken) return;
      this.notifyPhysics({ status: "ERROR", backend: "rapier3d-compat-0.20", message: error.message });
    }
  }

  controlledPhysicsObjectIds(frame) {
    const controlled = new Set();
    for (const [objectId, ownership] of Object.entries(frame.simulation?.ownership ?? {})) {
      if (ownership.status && ownership.status !== "free") controlled.add(objectId);
    }
    const time = Number(frame.time) || 0;
    for (const clip of this.lastState?.project.director?.timeline?.clips ?? []) {
      if (time < clip.start || time > clip.start + clip.duration) continue;
      for (const id of [clip.targetId, clip.secondaryTargetId, clip.recipientId, clip.placementTargetId]) {
        if (id) controlled.add(id);
      }
    }
    return controlled;
  }

  applyPhysicsFrame(frame) {
    if (!this.physicsRuntime || !frame?.objects) return null;
    const report = this.physicsRuntime.advanceTo(
      frame.time,
      frame.objects,
      this.controlledPhysicsObjectIds(frame),
    );
    for (const [objectId, state] of Object.entries(report.objects)) {
      const mesh = this.meshes.get(objectId);
      if (!mesh) continue;
      mesh.position.fromArray(state.position);
      mesh.quaternion.fromArray(state.quaternion);
      mesh.updateMatrixWorld(true);
    }
    frame.simulation.physics = report;
    const now = performance.now();
    if (now - this.lastPhysicsReportAt > 250 || report.reset) {
      this.lastPhysicsReportAt = now;
      this.notifyPhysics({ status: "READY", ...report });
    }
    return report;
  }

  disposePhysicsRuntime(reason = "DISPOSED") {
    this.physicsLoadToken += 1;
    this.physicsRuntime?.dispose();
    this.physicsRuntime = null;
    this.physicsProject = null;
    this.notifyPhysics({ status: "DISABLED", backend: "rapier3d-compat-0.20", reason });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.assetControllers.forEach((controller) => controller.dispose());
    this.assetControllers.clear();
    this.cp03VisualEffects.clear();
    this.disposePhysicsRuntime();
    this.casePackControllerCache.forEach((controller) => controller.dispose());
    this.casePackControllerCache.clear();
    this.casePackAssetIdByCarrier.clear();
    this.unsubscribe?.();
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.transformControls.removeEventListener("mouseDown", this.onTransformMouseDown);
    this.transformControls.removeEventListener("mouseUp", this.onTransformMouseUp);
    this.transformControls.removeEventListener("dragging-changed", this.onDraggingChanged);
    this.transformControls.removeEventListener("objectChange", this.onObjectChange);
    this.removeSelectionHelper();
    this.clearCp02ProposalPreview();
    this.cp02ProposalRoot?.removeFromParent();
    this.cp02DecisionLight.removeFromParent();
    this.cp02DecisionLight.dispose?.();
    this.cp02ReadabilityLight?.removeFromParent();
    this.cp02ReadabilityLight?.dispose?.();
    this.cp02ReadabilityLight = null;
    this.cp02DecisionEffects = [];
    this.transformControls.dispose?.();
    this.orbitControls.dispose();
    this.meshes.forEach((mesh) => this.disposeMesh(mesh));
    this.meshes.clear();
    this.scenePatchMeshCache.forEach((mesh) => this.disposeMesh(mesh));
    this.scenePatchMeshCache.clear();
    this.textureCache.forEach((texture) => texture.dispose?.());
    this.textureCache.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
