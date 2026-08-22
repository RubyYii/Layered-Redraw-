import * as THREE from "./vendor/three.module.min.js";

const $ = (selector) => document.querySelector(selector);
const elements = {
  canvas: $("#viewport"),
  title: $("#title"),
  packageId: $("#package-id"),
  objectCount: $("#object-count"),
  frameCount: $("#frame-count"),
  fps: $("#fps"),
  status: $("#status"),
  backend: $("#backend"),
  video: $("#video"),
  videoHash: $("#video-hash"),
  videoRole: $("#video-role"),
  events: $("#events"),
  eventCount: $("#event-count"),
  residual: $("#residual"),
  violations: $("#violations"),
  samples: $("#samples"),
  ownership: $("#ownership"),
  play: $("#play"),
  scrubber: $("#scrubber"),
  frameLabel: $("#frame-label"),
  rangeLabel: $("#range-label"),
  timecode: $("#timecode"),
  duration: $("#duration"),
  error: $("#error"),
  errorMessage: $("#error-message"),
};

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} 读取失败（HTTP ${response.status}）`);
  return response.json();
};

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} 读取失败（HTTP ${response.status}）`);
  return response.text();
};

const formatTime = (value) => {
  const safe = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const milliseconds = Math.floor((safe % 1) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
};
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
})[character]);

const geometryFor = (type) => {
  if (type === "sphere") return new THREE.SphereGeometry(.5, 24, 16);
  if (type === "cylinder") return new THREE.CylinderGeometry(.5, .5, 1, 24, 1);
  if (type === "cone") return new THREE.ConeGeometry(.5, 1, 24, 1);
  return new THREE.BoxGeometry(1, 1, 1);
};

const state = {
  manifest: null,
  project: null,
  header: null,
  frames: [],
  interactions: null,
  collision: null,
  meshes: new Map(),
  sourceById: new Map(),
  objectState: new Map(),
  playing: false,
  currentFrame: 0,
  startWallTime: 0,
  startTimelineTime: 0,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b0a);
scene.fog = new THREE.FogExp2(0x080b0a, .022);
const camera = new THREE.PerspectiveCamera(42, 1, .05, 1200);
const renderer = new THREE.WebGLRenderer({ canvas: elements.canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
scene.add(new THREE.HemisphereLight(0xdfe9e5, 0x242a28, 1.8));
const keyLight = new THREE.DirectionalLight(0xfff0d2, 3.2);
keyLight.position.set(5, 10, 7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x63dbe2, 1.5);
rimLight.position.set(-7, 5, -8);
scene.add(rimLight);
const grid = new THREE.GridHelper(40, 40, 0x40504b, 0x1d2623);
grid.position.y = -.205;
grid.material.opacity = .38;
grid.material.transparent = true;
scene.add(grid);

const orbit = { target: new THREE.Vector3(), radius: 12, yaw: .58, pitch: .34, pointer: null };
const updateCamera = () => {
  const horizontal = Math.cos(orbit.pitch) * orbit.radius;
  camera.position.set(
    orbit.target.x + Math.sin(orbit.yaw) * horizontal,
    orbit.target.y + Math.sin(orbit.pitch) * orbit.radius,
    orbit.target.z + Math.cos(orbit.yaw) * horizontal,
  );
  camera.lookAt(orbit.target);
};

elements.canvas.addEventListener("pointerdown", (event) => {
  elements.canvas.setPointerCapture(event.pointerId);
  orbit.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
elements.canvas.addEventListener("pointermove", (event) => {
  if (orbit.pointer?.id !== event.pointerId) return;
  orbit.yaw -= (event.clientX - orbit.pointer.x) * .006;
  orbit.pitch = Math.max(-.12, Math.min(1.35, orbit.pitch + (event.clientY - orbit.pointer.y) * .006));
  orbit.pointer.x = event.clientX;
  orbit.pointer.y = event.clientY;
  updateCamera();
});
const endPointer = (event) => {
  if (orbit.pointer?.id === event.pointerId) orbit.pointer = null;
};
elements.canvas.addEventListener("pointerup", endPointer);
elements.canvas.addEventListener("pointercancel", endPointer);
elements.canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  orbit.radius = Math.max(1.5, Math.min(90, orbit.radius * Math.exp(event.deltaY * .001)));
  updateCamera();
}, { passive: false });

const createObject = (object) => {
  if (object.type === "group") {
    const group = new THREE.Group();
    group.userData.objectId = object.id;
    return group;
  }
  const geometry = geometryFor(object.type);
  const render = object.render ?? {};
  const material = new THREE.MeshStandardMaterial({
    color: object.color ?? "#abb4af",
    roughness: render.roughness ?? .72,
    metalness: render.metalness ?? .03,
    emissive: render.emissive ?? "#000000",
    emissiveIntensity: render.emissiveIntensity ?? 0,
    transparent: (render.opacity ?? 1) < 1,
    opacity: render.opacity ?? 1,
    depthWrite: (render.opacity ?? 1) >= .35,
  });
  if (render.textureDataUrl) {
    const texture = new THREE.TextureLoader().load(render.textureDataUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = object.type !== "plane";
  mesh.receiveShadow = true;
  mesh.userData.objectId = object.id;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 28),
    new THREE.LineBasicMaterial({ color: 0x0e1513, transparent: true, opacity: .28 }),
  );
  mesh.add(edges);
  if (render.light) {
    const light = new THREE.PointLight(render.light.color, render.light.intensity, render.light.distance, render.light.decay);
    mesh.add(light);
  }
  return mesh;
};

const buildScene = () => {
  state.sourceById = new Map(state.project.objects.map((object) => [object.id, object]));
  for (const object of state.project.objects) state.meshes.set(object.id, createObject(object));
  for (const object of state.project.objects) {
    const mesh = state.meshes.get(object.id);
    const parent = object.parentId ? state.meshes.get(object.parentId) : scene;
    (parent && parent !== mesh ? parent : scene).add(mesh);
  }
  applyFrame(0, { syncMedia: false });
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  for (const object of state.project.objects) {
    if (object.type === "group") continue;
    bounds.expandByObject(state.meshes.get(object.id));
  }
  const size = bounds.getSize(new THREE.Vector3());
  if (!bounds.isEmpty()) bounds.getCenter(orbit.target);
  orbit.radius = Math.max(6, Math.max(size.x, size.y, size.z) * 1.45);
  orbit.target.y = Math.max(orbit.target.y, .7);
  updateCamera();
};

const applyObjectState = (id, next) => {
  const mesh = state.meshes.get(id);
  const source = state.sourceById.get(id);
  if (!mesh || !source) return;
  state.objectState.set(id, next);
  mesh.position.fromArray(next.position ?? [0, 0, 0]);
  mesh.rotation.set(...(next.rotation ?? [0, 0, 0]).map((value) => THREE.MathUtils.degToRad(value)));
  mesh.scale.set(
    source.dimensions[0] * (next.scale?.[0] ?? 1),
    source.dimensions[1] * (next.scale?.[1] ?? 1),
    source.dimensions[2] * (next.scale?.[2] ?? 1),
  );
  mesh.visible = next.visible !== false;
  if (mesh.material && next.color) mesh.material.color.set(next.color);
};

const updateEventLedger = (time) => {
  const definitions = state.interactions?.definitions ?? [];
  if (!definitions.length) {
    elements.events.className = "empty";
    elements.events.textContent = "当前时间段没有声明交互。";
    return;
  }
  elements.events.className = "";
  elements.events.innerHTML = definitions.map((event) => {
    const eventState = time >= event.end ? "past" : time >= event.start ? "active" : "future";
    const detail = [event.ownershipMode, event.actorId, event.targetId].filter(Boolean).join(" · ");
    return `<div class="event ${eventState}"><span class="event-dot"></span><div><div class="event-title">${escapeHtml(event.label || event.action || event.clipId)}</div><div class="event-meta">${escapeHtml(detail)}</div></div><span class="event-time">${event.start.toFixed(2)}s</span></div>`;
  }).join("");
};

const updateUi = (frameIndex) => {
  const frame = state.frames[frameIndex];
  const timeline = state.manifest.timeline;
  const heldCount = Object.values(frame.simulation?.ownership ?? {}).filter((entry) => entry?.status === "held").length;
  elements.scrubber.value = String(frame.time);
  elements.frameLabel.textContent = `FRAME ${String(Math.min(frame.frame, timeline.frameCount)).padStart(5, "0")} / ${String(timeline.frameCount).padStart(5, "0")}`;
  elements.timecode.textContent = formatTime(frame.time - timeline.start);
  elements.ownership.textContent = String(heldCount);
  updateEventLedger(frame.time);
};

function applyFrame(frameIndex, { syncMedia = true } = {}) {
  const bounded = Math.max(0, Math.min(state.frames.length - 1, frameIndex));
  if (bounded < state.currentFrame) {
    state.objectState.clear();
    for (const [id, value] of Object.entries(state.frames[0].changes)) applyObjectState(id, value);
    for (let index = 1; index <= bounded; index += 1) {
      for (const [id, value] of Object.entries(state.frames[index].changes)) applyObjectState(id, value);
    }
  } else {
    for (let index = state.currentFrame === bounded ? bounded : state.currentFrame + 1; index <= bounded; index += 1) {
      for (const [id, value] of Object.entries(state.frames[index].changes)) applyObjectState(id, value);
    }
  }
  state.currentFrame = bounded;
  updateUi(bounded);
  if (syncMedia && Number.isFinite(elements.video.duration)) {
    const target = Math.max(0, state.frames[bounded].time - state.manifest.timeline.start);
    if (Math.abs(elements.video.currentTime - target) > .075) elements.video.currentTime = target;
  }
}

const frameAtTime = (time) => {
  const relative = Math.max(0, time - state.manifest.timeline.start);
  return Math.min(state.frames.length - 1, Math.round(relative * state.header.fps));
};

const pause = () => {
  state.playing = false;
  elements.video.pause();
  elements.play.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3.4a1 1 0 0 1 1.52-.85l10.2 6.6a1 1 0 0 1 0 1.7l-10.2 6.6A1 1 0 0 1 5 16.6V3.4Z"/></svg>';
  elements.play.setAttribute("aria-label", "播放仿真");
};

const play = () => {
  if (state.currentFrame >= state.frames.length - 1) applyFrame(0);
  state.playing = true;
  state.startTimelineTime = state.frames[state.currentFrame].time;
  state.startWallTime = performance.now();
  elements.video.currentTime = Math.max(0, state.startTimelineTime - state.manifest.timeline.start);
  elements.video.play().catch(() => {});
  elements.play.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h3v14H5V3Zm7 0h3v14h-3V3Z"/></svg>';
  elements.play.setAttribute("aria-label", "暂停仿真");
};

elements.play.addEventListener("click", () => state.playing ? pause() : play());
elements.scrubber.addEventListener("input", () => {
  pause();
  applyFrame(frameAtTime(Number(elements.scrubber.value)));
});
elements.video.addEventListener("seeking", () => {
  if (!state.header) return;
  applyFrame(frameAtTime(state.manifest.timeline.start + elements.video.currentTime), { syncMedia: false });
});

const resize = () => {
  const rect = elements.canvas.getBoundingClientRect();
  renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
  camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
};
new ResizeObserver(resize).observe(elements.canvas);

const animate = (timestamp) => {
  if (state.playing) {
    const time = state.startTimelineTime + (timestamp - state.startWallTime) / 1000;
    if (time >= state.manifest.timeline.end) {
      applyFrame(state.frames.length - 1);
      pause();
    } else {
      applyFrame(frameAtTime(time), { syncMedia: false });
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
};
requestAnimationFrame(animate);

const load = async () => {
  const [manifest, project, traceText, interactions, collision] = await Promise.all([
    fetchJson("./delivery.manifest.json"),
    fetchJson("./scene.blockout.json"),
    fetchText("./simulation.trace.jsonl"),
    fetchJson("./interactions.json"),
    fetchJson("./collision-report.json"),
  ]);
  const trace = traceText.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const header = trace.shift();
  if (manifest.schema !== "simulation-delivery-v1" || header.schema !== "simulation-trace-v1") {
    throw new Error("交付包或逐帧轨迹版本不受此回放器支持。");
  }
  if (!trace.length || trace[0].fullState !== true) throw new Error("逐帧轨迹缺少初始完整状态。");
  state.manifest = manifest;
  state.project = project;
  state.header = header;
  state.frames = trace;
  state.interactions = interactions;
  state.collision = collision;
  state.currentFrame = 0;

  const videoRecord = manifest.files.find((entry) => entry.role === "video");
  if (videoRecord) {
    elements.video.src = `./${videoRecord.path}`;
    elements.videoHash.textContent = `SHA-256 ${videoRecord.sha256}`;
    elements.videoRole.textContent = videoRecord.mediaType.split("/").at(-1).toUpperCase();
  }
  elements.title.textContent = manifest.title;
  elements.packageId.textContent = `${manifest.packageId} · ${manifest.simulationIdentity.slice(0, 20)}…`;
  elements.objectCount.textContent = String(manifest.project.objectCount);
  elements.frameCount.textContent = String(manifest.timeline.frameCount);
  elements.fps.textContent = `${manifest.timeline.fps} FPS`;
  elements.status.textContent = manifest.validation.status;
  elements.status.classList.toggle("fail", manifest.validation.status !== "PASS");
  elements.backend.textContent = `${manifest.backends.simulation.toUpperCase()} / ${manifest.backends.collision.toUpperCase()}`;
  elements.eventCount.textContent = `${interactions.definitions.length} EVENTS`;
  elements.residual.textContent = `${collision.maxResidualPenetration.toFixed(3)} m`;
  elements.violations.textContent = String(collision.violations.length);
  elements.samples.textContent = String(collision.sampleCount);
  elements.scrubber.min = String(manifest.timeline.start);
  elements.scrubber.max = String(manifest.timeline.end);
  elements.scrubber.step = String(1 / manifest.timeline.fps);
  elements.rangeLabel.textContent = `${manifest.timeline.start.toFixed(2)}s — ${manifest.timeline.end.toFixed(2)}s`;
  elements.duration.textContent = `/ ${formatTime(manifest.timeline.duration)}`;
  buildScene();
  resize();
  document.documentElement.dataset.replayReady = "true";
  window.__simulationReplay = { state, applyFrame, frameAtTime };
};

load().catch((error) => {
  elements.errorMessage.textContent = `${error.message} 请通过交付包内的 serve-replay.mjs 启动本地服务器，不要直接双击 HTML。`;
  elements.error.classList.add("visible");
  console.error(error);
});
