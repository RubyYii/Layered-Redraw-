import "./styles.css";
import {
  ROLE_LABELS,
  SceneStore,
  STARTER_SCREENPLAY,
  TYPE_LABELS,
  createEmptyProject,
  createStarterProject,
  parseProject,
  serializeProject,
} from "./model.js";
import { ThreeSceneAdapter } from "./editor.js";
import { createInteractionDemoProject } from "./interaction-demo.js";
import {
  DirectorRuntime,
  SCREENPLAY_SYNTAX,
  compileScreenplay,
  formatTimecode,
} from "./director.js";
import {
  cameraClipsFor,
  cameraPoseForEndpoint,
  createThreePointPath,
  formatCameraPath,
  nearestCameraClip,
  parseCameraPath,
  synchronizePathEndpoints,
} from "./camera-editor.js";
import {
  decideCp02ReframeIntent,
  runSceneCompositionTurn,
} from "./agent-runtime.js";
import {
  applyScenePatch,
  hashProject,
  undoScenePatch,
} from "./scene-patch-runtime.js";
import { loadCasePack } from "./case-pack-runtime.js";
import cp02AssetCatalog from "../projects/window-case-cp02/asset-catalog.json";
import cp02SceneSlots from "../projects/window-case-cp02/scene-slots.json";

const STORAGE_KEY = "blockout-studio.project.v3";
const LEGACY_STORAGE_KEY_V2 = "blockout-studio.project.v2";
const LEGACY_STORAGE_KEY = "blockout-studio.project.v1";
const searchParams = new URLSearchParams(window.location.search);
const isCp02Case = searchParams.get("case") === "pact-cp02";
const cp02ProjectUrl = new URL(
  "../projects/window-case-cp02/cp02-mutable-room.blockout.json",
  import.meta.url,
).href;
const cp02CasePackRoot = "/case-packs/pact-cp02/";
const cp02InitialUtterance = "我记得床边有一张小桌子、一把椅子，桌上放着一个旧杯子。";
const cp02ThermosUtterance = "桌上还应该有一个旧保温杯，但不要替换那个杯子。";
const cp02VisualRepairProfile = Object.freeze({
  id: "cp02-visual-repair-r2",
  camera: Object.freeze({
    position: Object.freeze([0.55, 3.08, 3.32]),
    target: Object.freeze([0.62, 1.04, -1.48]),
    fov: 54,
  }),
  lighting: Object.freeze({
    exposure: 1.08,
    hemisphereIntensity: 0.84,
    keyIntensity: 2.25,
    fillIntensity: 0.56,
    practical: Object.freeze({
      position: Object.freeze([-1.45, 3.25, 1.2]),
      intensity: 6.8,
      distance: 13,
      decay: 2,
    }),
    readability: Object.freeze({
      color: "#d7c19c",
      position: Object.freeze([1.35, 2.35, -1.25]),
      intensity: 2.9,
      distance: 6.8,
      decay: 2,
    }),
  }),
  layers: Object.freeze({
    id: "cp02-dual-memory-r2",
    archiveObjectPrefixes: Object.freeze(["sandbox-table_", "sandbox-cup_"]),
    archive: Object.freeze({
      color: "#5f5548",
      roughness: 0.96,
      opacity: 0.86,
      emissive: "#15110d",
      emissiveIntensity: 0.12,
      edgeColor: 0xb69a76,
      edgeOpacity: 0.36,
    }),
  }),
});
const cp02ThermosDisplayTreatment = Object.freeze({
  id: "cp02-aged-muted-thermos-r1",
  color: "#c7baa2",
  minRoughness: 0.72,
  maxMetalness: 0.34,
  yawDegrees: 168,
});
const cp02MaterializationBindings = Object.freeze({
  "CP02-TABLE-PROXY-001": Object.freeze({
    carrierId: "cp02-memory-table",
    casePackAssetId: "PH-TABLE-WOODEN-001",
  }),
  "CP02-CHAIR-PROXY-001": Object.freeze({
    carrierId: "cp02-memory-chair",
    casePackAssetId: "PH-CHAIR-SCHOOL-001",
  }),
  "CP02-THERMOS-CARRIER-001": Object.freeze({
    carrierId: "cp02-memory-thermos",
    casePackAssetId: "PH-MUG-MATERIAL-001",
    displayTreatment: cp02ThermosDisplayTreatment,
  }),
});

const $ = (selector) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`缺少界面元素：${selector}`);
  return element;
};

const typeIcon = (type) => {
  const icon = document.createElement("span");
  icon.className = "object-type-icon";
  icon.dataset.type = type;
  icon.setAttribute("aria-hidden", "true");
  return icon;
};

const visibilityIcon = (visible) => visible
  ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.6"/></svg>'
  : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M10.3 6.2A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.3 3M7.1 7.1C4.2 9 2.5 12 2.5 12s3.5 6 9.5 6a10 10 0 0 0 2.3-.3"/></svg>';

const lockIcon = (locked) => locked
  ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>'
  : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/></svg>';

const restoreProject = () => {
  if (isCp02Case) return createEmptyProject("PACT CP02 · 正在载入本地场景");
  const saved = localStorage.getItem(STORAGE_KEY)
    ?? localStorage.getItem(LEGACY_STORAGE_KEY_V2)
    ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!saved) return createStarterProject();
  try {
    return parseProject(saved);
  } catch (error) {
    console.warn("自动保存的项目无法载入，改用示例场景。", error);
    return createStarterProject();
  }
};

const ensureInitialTimeline = (sourceProject) => {
  const project = structuredClone(sourceProject);
  if (project.director.screenplay.trim() && !project.director.timeline.compiledAt) {
    project.director.timeline = compileScreenplay(project.director.screenplay, project);
  }
  return project;
};

const store = new SceneStore(ensureInitialTimeline(restoreProject()));
const editor = new ThreeSceneAdapter($("#viewport"), store);

const elements = {
  workspace: $(".workspace"),
  hierarchy: $("#hierarchy-list"),
  objectCount: $("#object-count"),
  emptyState: $("#empty-state"),
  inspectorEmpty: $("#inspector-empty"),
  inspectorForm: $("#inspector-form"),
  inspectorTransformTab: $("#inspector-transform-tab"),
  inspectorEntityTab: $("#inspector-entity-tab"),
  selectedType: $("#selected-type"),
  selectedId: $("#selected-id"),
  objectName: $("#object-name"),
  objectColor: $("#object-color"),
  objectColorText: $("#object-color-text"),
  objectVisible: $("#object-visible"),
  objectLocked: $("#object-locked"),
  projectName: $("#project-name"),
  selectionStatus: $("#selection-status"),
  autosaveStatus: $("#autosave-status"),
  undo: $("#undo"),
  redo: $("#redo"),
  save: $("#save-project"),
  load: $("#load-project"),
  file: $("#project-file"),
  moreMenuButton: $("#more-menu"),
  projectMenu: $("#project-menu"),
  newProject: $("#new-project"),
  loadDemo: $("#load-demo"),
  loadInteractionDemo: $("#load-interaction-demo"),
  duplicate: $("#duplicate-object"),
  delete: $("#delete-object"),
  libraryToggle: $("#toggle-library"),
  inspectorToggle: $("#toggle-inspector"),
  scrim: $("#drawer-scrim"),
  conceptStage: $("#concept-stage"),
  openReference: $("#open-reference"),
  referenceProgress: $("#reference-progress"),
  referenceThumb: $("#reference-thumb"),
  referencePlaceholder: $("#reference-placeholder"),
  referenceCardTitle: $("#reference-card-title"),
  referenceCardSubtitle: $("#reference-card-subtitle"),
  referenceControls: $("#reference-controls"),
  referenceVisible: $("#reference-visible"),
  referenceOpacity: $("#reference-opacity"),
  referenceOpacityValue: $("#reference-opacity-value"),
  referenceBackdrop: $("#reference-backdrop"),
  referenceDialog: $("#reference-dialog"),
  closeReferenceDialog: $("#close-reference-dialog"),
  chooseReferenceImage: $("#choose-reference-image"),
  replaceReferenceImage: $("#replace-reference-image"),
  removeReferenceImage: $("#remove-reference-image"),
  referenceFile: $("#reference-file"),
  referenceFullPreview: $("#reference-full-preview"),
  referenceImageEmpty: $("#reference-image-empty"),
  referenceImageActions: $("#reference-image-actions"),
  referenceDimensions: $("#reference-dimensions"),
  referencePrompt: $("#reference-prompt"),
  breakdownForm: $("#breakdown-form"),
  breakdownName: $("#breakdown-name"),
  breakdownType: $("#breakdown-type"),
  breakdownList: $("#breakdown-list"),
  breakdownEmpty: $("#breakdown-empty"),
  breakdownSummary: $("#breakdown-summary"),
  app: $("#app"),
  libraryPanel: $("#library-panel"),
  buildTab: $("#build-tab"),
  screenplayTab: $("#screenplay-tab"),
  screenplayPanel: $("#screenplay-panel"),
  screenplayInput: $("#screenplay-input"),
  screenplayState: $("#screenplay-state"),
  compileScreenplay: $("#compile-screenplay"),
  loadScreenplayExample: $("#load-screenplay-example"),
  compileSummaryTitle: $("#compile-summary-title"),
  compileSummaryMeta: $("#compile-summary-meta"),
  compileIssues: $("#compile-issues"),
  syntaxGuideList: $("#syntax-guide-list"),
  entityRole: $("#entity-role"),
  entityRoleBadge: $("#entity-role-badge"),
  entityState: $("#entity-state"),
  entityBodyType: $("#entity-body-type"),
  entityMass: $("#entity-mass"),
  entityFriction: $("#entity-friction"),
  entityRestitution: $("#entity-restitution"),
  chooseAssetFile: $("#choose-asset-file"),
  chooseSpatialBridge: $("#choose-spatial-bridge"),
  chooseSpatialFiles: $("#choose-spatial-files"),
  clearAssetFile: $("#clear-asset-file"),
  assetFile: $("#asset-file"),
  spatialBridgeFolder: $("#spatial-bridge-folder"),
  spatialBridgeFiles: $("#spatial-bridge-files"),
  assetSessionTitle: $("#asset-session-title"),
  assetSessionDetail: $("#asset-session-detail"),
  assetRuntimeControls: $("#asset-runtime-controls"),
  assetActionPreview: $("#asset-action-preview"),
  playAssetAction: $("#play-asset-action"),
  assetExpressionPreview: $("#asset-expression-preview"),
  assetExpressionWeight: $("#asset-expression-weight"),
  assetExpressionOutput: $("#asset-expression-output"),
  clearAssetExpression: $("#clear-asset-expression"),
  assetRigDetails: $("#asset-rig-details"),
  assetDetailSummary: $("#asset-detail-summary"),
  assetRigDetail: $("#asset-rig-detail"),
  interactionTrigger: $("#interaction-trigger"),
  interactionAction: $("#interaction-action"),
  interactionAmount: $("#interaction-amount"),
  directorDock: $("#director-dock"),
  timelineBody: $("#timeline-body"),
  timelineCompileBadge: $("#timeline-compile-badge"),
  timelinePlay: $("#timeline-play"),
  timelineStop: $("#timeline-stop"),
  timelineTimecode: $("#timeline-timecode"),
  timelineDuration: $("#timeline-duration"),
  timelineCollapse: $("#timeline-collapse"),
  timelineRuler: $("#timeline-ruler"),
  timelineTrackArea: $("#timeline-track-area"),
  timelinePlayhead: $("#timeline-playhead"),
  timelineScrubber: $("#timeline-scrubber"),
  cameraEditorToggle: $("#camera-editor-toggle"),
  cameraEditorPanel: $("#camera-editor-panel"),
  cameraEditorClose: $("#camera-editor-close"),
  cameraShotList: $("#camera-shot-list"),
  cameraShotCount: $("#camera-shot-count"),
  cameraShotEmpty: $("#camera-shot-empty"),
  cameraShotForm: $("#camera-shot-form"),
  cameraShotLabel: $("#camera-shot-label"),
  cameraShotId: $("#camera-shot-id"),
  cameraShotStart: $("#camera-shot-start"),
  cameraShotDuration: $("#camera-shot-duration"),
  cameraShotEasing: $("#camera-shot-easing"),
  cameraShotFromFov: $("#camera-shot-from-fov"),
  cameraShotToFov: $("#camera-shot-to-fov"),
  cameraPositionPath: $("#camera-position-path"),
  cameraLookAtPath: $("#camera-look-at-path"),
  cameraShotAdd: $("#camera-shot-add"),
  cameraShotDuplicate: $("#camera-shot-duplicate"),
  cameraShotDelete: $("#camera-shot-delete"),
  cameraShotPlay: $("#camera-shot-play"),
  cameraPathBuild: $("#camera-path-build"),
  cameraPathClear: $("#camera-path-clear"),
  cameraShotStatus: $("#camera-shot-status"),
  previewIndicator: $("#preview-indicator"),
  simulationIndicator: $("#simulation-indicator"),
  simulationPhase: $("#simulation-phase"),
  simulationDetail: $("#simulation-detail"),
  performanceIndicator: $("#performance-indicator"),
  performanceFps: $("#performance-fps"),
  performanceQuality: $("#performance-quality"),
  dialogueOverlay: $("#dialogue-overlay"),
  dialogueSpeaker: $("#dialogue-speaker"),
  dialogueText: $("#dialogue-text"),
  cp02LayerLegend: $("#cp02-layer-legend"),
  cp02ArchiveLayer: $("#cp02-archive-layer"),
  cp02MutableLayer: $("#cp02-mutable-layer"),
  cp02MutableLayerState: $("#cp02-mutable-layer-state"),
  cp02MutableLayerDetail: $("#cp02-mutable-layer-detail"),
  cp02Panel: $("#cp02-panel"),
  cp02Utterance: $("#cp02-utterance"),
  cp02Preview: $("#cp02-preview"),
  cp02GuardianAllow: $("#cp02-guardian-allow"),
  cp02GuardianReject: $("#cp02-guardian-reject"),
  cp02ProposeThermos: $("#cp02-propose-thermos"),
  cp02MoveChair: $("#cp02-move-chair"),
  cp02Undo: $("#cp02-undo"),
  cp02AttemptSourceRewrite: $("#cp02-attempt-source-rewrite"),
  cp02DownloadReceipt: $("#cp02-download-receipt"),
  cp02EvidenceOverlay: $("#cp02-evidence-overlay"),
  cp02SourceHash: $("#cp02-source-hash"),
  cp02PatchId: $("#cp02-patch-id"),
  cp02Outcome: $("#cp02-outcome"),
  cp02CasePackId: $("#cp02-case-pack-id"),
  cp02CasePackHash: $("#cp02-case-pack-hash"),
  cp02MaterializedCount: $("#cp02-materialized-count"),
  cp02CasePackAssets: $("#cp02-case-pack-assets"),
  cp02PatchPreview: $("#cp02-patch-preview"),
  cp02Phase: $("#cp02-phase"),
  toast: $("#toast"),
};

let currentState = store.getState();
let autosaveTimer = 0;
let toastTimer = 0;
let libraryMode = "build";
let inspectorMode = "transform";
let directorMode = "edit";
let currentFrame = null;
let runtime = null;
let renderedTimelineKey = "";
let timelineClipNodes = new Map();
let activeTimelineClipIds = new Set();
let selectedCameraClipId = null;
let lastTimelineUiTime = -Infinity;
let lastDialogueClipId = null;
let cp02LastHashedProject = null;
let cp02HashSequence = 0;
let cp02RuntimeCasePack = null;

const cp02Evidence = {
  ready: false,
  sceneReady: false,
  busy: false,
  phase: "READY",
  outcome: "READY",
  currentPatch: null,
  currentTurn: null,
  initialProjectHash: null,
  projectHash: null,
  latestReceipt: null,
  receipts: [],
  appliedReceipts: [],
  casePack: {
    status: "LOADING",
    casePackId: null,
    manifestSha256: null,
    publicReleaseAuthorized: false,
    assets: [],
  },
  materializedAssets: {},
  materializationErrors: [],
  visualProfile: {
    id: cp02VisualRepairProfile.id,
    status: "PENDING",
  },
  latestPerformanceReport: null,
};

const selectedObject = () => currentState.project.objects.find((object) => object.id === currentState.selectionId) ?? null;

const showToast = (message) => {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2400);
};

const cp02ProtectedObjectIds = (project) => project.objects
  .filter((object) => ["SOURCE_LOCKED", "EVIDENCE_LOCKED", "STAGE_LOCKED"].includes(object.governance?.state))
  .map((object) => object.id)
  .sort();

const cp02DescendantIds = (project, rootId) => {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of project.objects) {
      if (!ids.has(object.id) && ids.has(object.parentId)) {
        ids.add(object.id);
        changed = true;
      }
    }
  }
  return [...ids].sort();
};

const cp02GovernanceCounts = (project) => project.objects.reduce((counts, object) => {
  const state = object.governance?.state ?? "UNGOVERNED";
  counts[state] = (counts[state] ?? 0) + 1;
  return counts;
}, {});

const cp02ProposalPositions = (patch) => (patch?.operations ?? [])
  .map((operation) => cp02SceneSlots.find((slot) => slot.id === operation.slotId)?.position)
  .filter(Boolean);

const cp02MaterializedAssetList = () => Object.values(cp02Evidence.materializedAssets)
  .sort((left, right) => left.assetId.localeCompare(right.assetId));

const updateCp02Ready = () => {
  cp02Evidence.ready = cp02Evidence.sceneReady && cp02Evidence.casePack.status === "VERIFIED";
  if (cp02Evidence.ready && !cp02Evidence.busy) {
    cp02Evidence.phase = "本地场景与 hash-bound Case Pack 已就绪；等待观众提出记忆。";
  }
};

const sha256Text = async (value) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((entry) => entry.toString(16).padStart(2, "0")).join("");
};

const casePackAssetRecord = (assetId) => cp02Evidence.casePack.assets
  .find((asset) => asset.assetId === assetId);

const reconcileCp02MaterializedAssets = () => {
  const objectIds = new Set(currentState.project.objects.map((object) => object.id));
  for (const [assetId, record] of Object.entries(cp02Evidence.materializedAssets)) {
    if (!objectIds.has(record.carrierId) || !editor.assetReport(record.carrierId)) {
      delete cp02Evidence.materializedAssets[assetId];
    }
  }
};

const renderCp02CasePack = () => {
  const pack = cp02Evidence.casePack;
  elements.cp02CasePackId.textContent = pack.casePackId ?? pack.status;
  elements.cp02CasePackHash.textContent = pack.manifestSha256
    ? `${pack.manifestSha256.slice(0, 10)}…${pack.manifestSha256.slice(-6)}`
    : pack.status;
  elements.cp02CasePackHash.title = pack.manifestSha256 ?? pack.status;
  elements.cp02MaterializedCount.textContent = `${cp02MaterializedAssetList().length} / ${pack.assets.length || 3}`;
  elements.cp02CasePackAssets.replaceChildren(...pack.assets.map((asset) => {
    const item = document.createElement("li");
    const materialized = cp02Evidence.materializedAssets[asset.assetId];
    item.dataset.status = materialized ? "MATERIALIZED" : "VERIFIED";
    item.textContent = `${materialized ? "●" : "○"} ${asset.assetId} · ${asset.sha256.slice(0, 8)}…${asset.sha256.slice(-6)}`;
    item.title = `${asset.filename}\nbytes=${asset.bytes}\nsha256=${asset.sha256}\npublicDisplay=false`;
    return item;
  }));
};

const renderCp02PatchList = () => {
  elements.cp02PatchPreview.replaceChildren();
  const patch = cp02Evidence.currentPatch;
  if (patch) {
    patch.operations.forEach((operation) => {
      const asset = cp02AssetCatalog.find((candidate) => candidate.assetId === operation.assetId);
      const item = document.createElement("li");
      item.textContent = `${operation.kind.toUpperCase()} · ${asset?.semanticClass ?? operation.objectId} → ${operation.slotId ?? "移除"}`;
      elements.cp02PatchPreview.appendChild(item);
    });
    return;
  }
  if (cp02Evidence.currentTurn?.patchPreview?.outcome === "WITHHELD") {
    const item = document.createElement("li");
    item.textContent = `未形成补丁：${cp02Evidence.currentTurn.patchPreview.code}`;
    elements.cp02PatchPreview.appendChild(item);
    return;
  }
  if (cp02Evidence.latestReceipt) {
    const item = document.createElement("li");
    item.textContent = `${cp02Evidence.latestReceipt.outcome} · ${cp02Evidence.latestReceipt.reasonCode ?? cp02Evidence.latestReceipt.patchId}`;
    elements.cp02PatchPreview.appendChild(item);
    return;
  }
  const item = document.createElement("li");
  item.textContent = "等待观众提出记忆。";
  elements.cp02PatchPreview.appendChild(item);
};

const cp02MutableLayerState = (project) => {
  if (cp02Evidence.outcome === "WITHHELD") return "WITHHELD";
  if (cp02Evidence.outcome === "PROPOSED" && cp02Evidence.currentPatch) return "PROPOSED";
  if (project.objects.some((object) => (
    object.id.startsWith("cp02-memory-") && object.governance?.state === "AUTHORISED"
  ))) return "AUTHORISED";
  return "EMPTY";
};

const renderCp02LayerLegend = (project) => {
  const mutableState = cp02MutableLayerState(project);
  const copy = {
    EMPTY: ["PROPOSAL / EMPTY", "等待观众提出"],
    PROPOSED: ["PROPOSAL / UNSETTLED", "框外浮现 · 尚未进入场景"],
    AUTHORISED: ["PROPOSAL / AUTHORISED", "Guardian 已允许 · 仍可撤回"],
    WITHHELD: ["PROPOSAL / WITHHELD", "改写被拒绝 · 原层保持"],
  }[mutableState];
  elements.cp02LayerLegend.hidden = false;
  elements.cp02LayerLegend.dataset.mutableState = mutableState;
  elements.cp02ArchiveLayer.dataset.layerState = "ARCHIVE_LOCKED";
  elements.cp02MutableLayer.dataset.layerState = mutableState;
  elements.cp02MutableLayerState.textContent = copy[0];
  elements.cp02MutableLayerDetail.textContent = copy[1];
  return mutableState;
};

const renderCp02Surface = () => {
  if (!isCp02Case) return;
  const project = currentState.project;
  const sourceHash = project.cp02?.sourcePhotoSha256 ?? "missing";
  elements.cp02SourceHash.textContent = sourceHash === "missing" ? sourceHash : `${sourceHash.slice(0, 12)}…${sourceHash.slice(-8)}`;
  elements.cp02SourceHash.title = sourceHash;
  elements.cp02PatchId.textContent = cp02Evidence.currentPatch?.patchId
    ?? cp02Evidence.latestReceipt?.patchId
    ?? "尚未提出";
  elements.cp02Outcome.textContent = cp02Evidence.outcome;
  elements.cp02Outcome.dataset.outcome = cp02Evidence.outcome;
  elements.cp02Phase.textContent = cp02Evidence.phase;

  const chair = project.objects.find((object) => object.id === "cp02-memory-chair");
  const hasInitialFurniture = project.objects.some((object) => object.id === "cp02-memory-table")
    && project.objects.some((object) => object.id === "cp02-memory-cup");
  const hasThermos = project.objects.some((object) => object.id === "cp02-memory-thermos");
  const canMoveChair = chair?.governance?.state === "AUTHORISED"
    && chair.governance.slotId === "memory-chair-near";
  elements.cp02Preview.disabled = !cp02Evidence.ready || cp02Evidence.busy || cp02Evidence.appliedReceipts.length > 0;
  elements.cp02GuardianAllow.disabled = cp02Evidence.busy || !cp02Evidence.currentPatch;
  elements.cp02GuardianReject.disabled = cp02Evidence.busy || !cp02Evidence.currentPatch;
  elements.cp02ProposeThermos.disabled = cp02Evidence.busy
    || !cp02Evidence.ready
    || !hasInitialFurniture
    || hasThermos
    || Boolean(cp02Evidence.currentPatch);
  elements.cp02MoveChair.disabled = cp02Evidence.busy || !canMoveChair || Boolean(cp02Evidence.currentPatch);
  elements.cp02Undo.disabled = cp02Evidence.busy || cp02Evidence.appliedReceipts.length === 0;
  elements.cp02AttemptSourceRewrite.disabled = !cp02Evidence.ready || cp02Evidence.busy;
  elements.cp02DownloadReceipt.disabled = !cp02Evidence.latestReceipt;
  renderCp02LayerLegend(project);
  renderCp02CasePack();
  renderCp02PatchList();
};

const refreshCp02ProjectHash = async (project) => {
  if (!isCp02Case || !project.cp02 || project === cp02LastHashedProject) return;
  cp02LastHashedProject = project;
  const sequence = ++cp02HashSequence;
  try {
    const projectHash = await hashProject(project);
    if (sequence !== cp02HashSequence) return;
    cp02Evidence.projectHash = projectHash;
    cp02Evidence.initialProjectHash ??= projectHash;
    cp02Evidence.sceneReady = true;
    updateCp02Ready();
    renderCp02Surface();
  } catch (error) {
    cp02Evidence.ready = false;
    cp02Evidence.sceneReady = false;
    cp02Evidence.phase = `哈希校验失败：${error.message}`;
    renderCp02Surface();
  }
};

const recordCp02Receipt = (receipt) => {
  cp02Evidence.latestReceipt = structuredClone(receipt);
  cp02Evidence.receipts.push(structuredClone(receipt));
  cp02Evidence.outcome = receipt.outcome;
};

const runCp02Action = async (pendingLabel, action) => {
  if (!isCp02Case || cp02Evidence.busy) return;
  cp02Evidence.busy = true;
  cp02Evidence.phase = pendingLabel;
  renderCp02Surface();
  try {
    await action();
  } catch (error) {
    cp02Evidence.outcome = "ERROR";
    cp02Evidence.phase = `操作失败：${error.message}`;
    showToast(error.message);
  } finally {
    cp02Evidence.busy = false;
    renderCp02Surface();
  }
};

const previewCp02Reframe = (participantText = elements.cp02Utterance.value) => runCp02Action(
  "正在将记忆陈述转为受限意图…",
  async () => {
  const turn = await runSceneCompositionTurn({
    project: currentState.project,
    text: participantText,
    decide: decideCp02ReframeIntent,
    catalog: cp02AssetCatalog,
    slots: cp02SceneSlots,
  });
  cp02Evidence.currentTurn = structuredClone(turn);
  if (turn.patchPreview.outcome === "WITHHELD") {
    cp02Evidence.currentPatch = null;
    cp02Evidence.outcome = "WITHHELD";
    cp02Evidence.phase = `意图被限制：${turn.patchPreview.code}`;
    editor.clearCp02ProposalPreview();
    editor.showCp02DecisionPressure({ outcome: "WITHHELD" });
    return;
  }
  cp02Evidence.currentPatch = structuredClone(turn.patchPreview);
  cp02Evidence.outcome = "PROPOSED";
  cp02Evidence.phase = "改写只存在于临时预览层；SceneStore 尚未改变。";
  editor.showCp02ProposalPreview({
    catalog: cp02AssetCatalog,
    slots: cp02SceneSlots,
    patch: turn.patchPreview,
  });
  },
);

const previewCp02Thermos = () => {
  elements.cp02Utterance.value = cp02ThermosUtterance;
  return previewCp02Reframe(cp02ThermosUtterance);
};

const materializeCp02PatchAssets = async (patch) => {
  if (!cp02RuntimeCasePack || cp02Evidence.casePack.status !== "VERIFIED") {
    throw new Error("本地 Case Pack 尚未通过固定 catalog 与 hash 校验");
  }
  const bindings = [...new Map((patch.operations ?? [])
    .map((operation) => cp02MaterializationBindings[operation.assetId])
    .filter(Boolean)
    .map((binding) => [binding.casePackAssetId, binding])).values()];
  const loaded = [];
  try {
    for (const binding of bindings) {
      const source = casePackAssetRecord(binding.casePackAssetId);
      if (!source) throw new Error(`Case Pack 缺少批准资产：${binding.casePackAssetId}`);
      const report = await editor.loadCasePackAsset(
        binding.carrierId,
        cp02RuntimeCasePack,
        binding.casePackAssetId,
      );
      const displayTreatment = binding.displayTreatment
        ? editor.applyAssetDisplayTreatment(binding.carrierId, binding.displayTreatment)
        : null;
      loaded.push({
        assetId: binding.casePackAssetId,
        carrierId: binding.carrierId,
        bytes: source.bytes,
        sha256: source.sha256,
        status: "MATERIALIZED",
        displayTreatment,
        report: {
          format: report.format,
          meshCount: report.meshCount,
          boneCount: report.boneCount,
          clipNames: report.clipNames,
          bounds: report.bounds,
          unitBounds: report.unitBounds,
          preserveAspect: report.preserveAspect,
        },
      });
    }
  } catch (error) {
    for (const record of loaded) editor.clearAsset(record.carrierId);
    cp02Evidence.materializationErrors.push({
      patchId: patch.patchId,
      message: error.message,
    });
    throw error;
  }
  for (const record of loaded) cp02Evidence.materializedAssets[record.assetId] = record;
  return loaded;
};

const decideCp02Patch = (guardianDecision) => runCp02Action(
  guardianDecision === "ALLOW" ? "Guardian 正在核验并执行补丁…" : "Guardian 正在拒绝补丁…",
  async () => {
    const patch = cp02Evidence.currentPatch;
    if (!patch) throw new Error("没有可供 Guardian 决策的补丁");
    const positions = cp02ProposalPositions(patch);
    const receipt = await applyScenePatch({
      store,
      catalog: cp02AssetCatalog,
      slots: cp02SceneSlots,
      patch,
      guardianDecision,
      mode: "engineering-evidence",
    });
    if (receipt.outcome === "APPLIED") {
      try {
        await materializeCp02PatchAssets(patch);
      } catch (error) {
        recordCp02Receipt(receipt);
        const rollback = await undoScenePatch({ store, receipt });
        reconcileCp02MaterializedAssets();
        recordCp02Receipt(rollback);
        throw new Error(`真实本地资产材质化失败，ScenePatch 已回滚：${error.message}`);
      }
      cp02Evidence.appliedReceipts.push(structuredClone(receipt));
    }
    recordCp02Receipt(receipt);
    cp02Evidence.currentPatch = null;
    cp02Evidence.currentTurn = null;
    editor.clearCp02ProposalPreview();
    editor.showCp02DecisionPressure({ positions, outcome: receipt.outcome, durationMs: 1800 });
    cp02Evidence.phase = receipt.outcome === "APPLIED"
      ? `补丁已应用并材质化：${receipt.expectedChangedObjectIds.length} 个稳定对象 ID 发生预期改变。`
      : "Guardian 已拒绝；房间状态与源图均未改变。";
  },
);

const moveCp02Chair = () => runCp02Action("正在把椅子从亲近位置撤回…", async () => {
  const project = currentState.project;
  const chair = project.objects.find((object) => object.id === "cp02-memory-chair");
  if (!chair || chair.governance?.slotId !== "memory-chair-near") {
    throw new Error("椅子当前不在可撤回的亲近位置");
  }
  const patch = {
    schemaVersion: 1,
    patchId: "CP02-REFRAME-CHAIR-MOVE-001",
    caseAction: "Reframe",
    provider: "deterministic-cp02-controller-v1",
    reason: "The authorised chair withdraws from the intimate bedside position.",
    preconditionHash: await hashProject(project),
    expectedChangedObjectIds: cp02DescendantIds(project, chair.id),
    forbiddenChangedObjectIds: cp02ProtectedObjectIds(project),
    operations: [{
      kind: "move_between_slots",
      objectId: chair.id,
      fromSlotId: "memory-chair-near",
      slotId: "memory-chair-withdrawn",
    }],
  };
  const receipt = await applyScenePatch({
    store,
    catalog: cp02AssetCatalog,
    slots: cp02SceneSlots,
    patch,
    guardianDecision: "ALLOW",
    mode: "engineering-evidence",
  });
  if (receipt.outcome !== "APPLIED") throw new Error(receipt.reason);
  cp02Evidence.appliedReceipts.push(structuredClone(receipt));
  recordCp02Receipt(receipt);
  const target = cp02SceneSlots.find((slot) => slot.id === "memory-chair-withdrawn");
  editor.showCp02DecisionPressure({ positions: [target.position], outcome: "APPLIED", durationMs: 1800 });
  cp02Evidence.phase = "椅子已通过语义槽位补丁撤回；没有向 agent 暴露直接变换。";
});

const undoLatestCp02Patch = () => runCp02Action("正在核验回执并精确撤销…", async () => {
  const applied = cp02Evidence.appliedReceipts.at(-1);
  if (!applied) throw new Error("没有可撤销的已应用补丁");
  const receipt = await undoScenePatch({ store, receipt: applied });
  cp02Evidence.appliedReceipts.pop();
  reconcileCp02MaterializedAssets();
  recordCp02Receipt(receipt);
  cp02Evidence.currentPatch = null;
  cp02Evidence.currentTurn = null;
  editor.clearCp02ProposalPreview();
  editor.showCp02DecisionPressure({ outcome: "APPLIED", durationMs: 1800 });
  cp02Evidence.phase = cp02Evidence.appliedReceipts.length
    ? "上一补丁已精确撤销；初始家具改写仍在场景中。"
    : "补丁序列已全部撤销；房间恢复到 CP02 初始哈希。";
  if (!cp02Evidence.appliedReceipts.length) elements.cp02Utterance.value = cp02InitialUtterance;
});

const attemptCp02SourceRewrite = () => runCp02Action("正在验证 SOURCE_LOCKED 拒绝路径…", async () => {
  const project = currentState.project;
  const source = project.objects.find((object) => object.id === "sandbox-photo_image");
  if (!source) throw new Error("CP02 源照片对象缺失");
  const patch = {
    schemaVersion: 1,
    patchId: "CP02-FORBIDDEN-SOURCE-REWRITE-001",
    caseAction: "Reframe",
    provider: "deterministic-cp02-boundary-test-v1",
    reason: "Technical negative test: SOURCE_LOCKED must never be replaced.",
    preconditionHash: await hashProject(project),
    expectedChangedObjectIds: [source.id],
    forbiddenChangedObjectIds: cp02ProtectedObjectIds(project),
    operations: [{
      kind: "replace",
      objectId: source.id,
      assetId: "CP02-CUP-PROXY-001",
      slotId: "memory-cup-on-table",
    }],
  };
  const receipt = await applyScenePatch({
    store,
    catalog: cp02AssetCatalog,
    slots: cp02SceneSlots,
    patch,
    guardianDecision: "ALLOW",
    mode: "engineering-evidence",
  });
  if (receipt.outcome !== "WITHHELD") throw new Error("SOURCE_LOCKED 负向测试意外通过");
  recordCp02Receipt(receipt);
  cp02Evidence.currentPatch = null;
  cp02Evidence.currentTurn = null;
  editor.clearCp02ProposalPreview();
  editor.showCp02DecisionPressure({ positions: [source.position], outcome: "WITHHELD", durationMs: 1800 });
  cp02Evidence.phase = `改写被拒绝：${receipt.reason}`;
});

const downloadLatestCp02Receipt = () => {
  if (!cp02Evidence.latestReceipt) return;
  const blob = new Blob([JSON.stringify(cp02Evidence.latestReceipt, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${cp02Evidence.latestReceipt.patchId}-${cp02Evidence.latestReceipt.outcome}.receipt.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const setControlValue = (control, value) => {
  if (document.activeElement !== control) control.value = String(value);
};

const syncSelectOptions = (control, options, preferredValue = "") => {
  const key = JSON.stringify(options);
  if (control.dataset.optionsKey !== key) {
    control.replaceChildren(...options.map(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }));
    control.dataset.optionsKey = key;
  }
  const values = new Set(options.map((option) => option.value));
  control.value = values.has(preferredValue) ? preferredValue : options[0]?.value ?? "";
};

const decodeImageFile = async (file) => {
  try {
    return await createImageBitmap(file);
  } catch {
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("无法读取这张图片，请换用 PNG、JPEG 或 WebP。"));
      };
      image.src = url;
    });
  }
};

const prepareReferenceImage = async (file) => {
  if (!file?.type?.startsWith("image/")) throw new Error("请选择图片文件。");
  if (file.size > 20_000_000) throw new Error("原始图片超过 20 MB，请先压缩后导入。");

  const source = await decodeImageFile(file);
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("无法识别图片尺寸。");

  const attempts = [
    { edge: 1600, quality: 0.84 },
    { edge: 1280, quality: 0.76 },
    { edge: 1024, quality: 0.68 },
  ];
  let encoded = null;

  for (const attempt of attempts) {
    const scale = Math.min(1, attempt.edge / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);
    encoded = {
      dataUrl: canvas.toDataURL("image/webp", attempt.quality),
      width,
      height,
    };
    if (encoded.dataUrl.length <= 2_400_000) break;
  }

  source.close?.();
  if (!encoded || encoded.dataUrl.length > 3_000_000) {
    throw new Error("压缩后的参考图仍然过大，请使用更小的原图。");
  }

  return {
    ...encoded,
    name: file.name.replace(/\.[^.]+$/, "").slice(0, 48) || "概念参考图",
    opacity: currentState.project.reference?.opacity ?? 0.36,
    visible: currentState.project.reference?.visible ?? true,
    prompt: currentState.project.reference?.prompt ?? "",
  };
};

const openReferenceWorkbench = () => {
  if (!elements.referenceDialog.open) elements.referenceDialog.showModal();
};

const renderBreakdown = (state) => {
  const { breakdown, objects } = state.project;
  const objectIds = new Set(objects.map((object) => object.id));
  const builtCount = breakdown.filter((item) => item.objectId && objectIds.has(item.objectId)).length;
  elements.breakdownSummary.textContent = breakdown.length ? `${builtCount} / ${breakdown.length} 已建` : "0 项";
  elements.breakdownList.replaceChildren();
  elements.breakdownEmpty.hidden = breakdown.length > 0;

  breakdown.forEach((item, index) => {
    const isBuilt = Boolean(item.objectId && objectIds.has(item.objectId));
    const row = document.createElement("div");
    row.className = "breakdown-row";

    const number = document.createElement("span");
    number.className = "breakdown-index";
    number.textContent = String(index + 1).padStart(2, "0");

    const copy = document.createElement("div");
    copy.className = "breakdown-copy";
    const name = document.createElement("strong");
    name.textContent = item.name;
    const meta = document.createElement("span");
    meta.textContent = `${TYPE_LABELS[item.type]} · ${isBuilt ? "已连接场景物体" : "等待创建灰模"}`;
    copy.append(name, meta);

    const action = document.createElement("button");
    action.type = "button";
    action.className = isBuilt ? "text-button" : "text-button is-primary";
    action.textContent = isBuilt ? "定位" : "创建灰模";
    action.addEventListener("click", () => {
      const objectId = store.buildBreakdownItem(item.id);
      if (!objectId) return;
      elements.referenceDialog.close();
      editor.setCameraPreset("perspective");
      showToast(isBuilt ? `已定位“${item.name}”` : `已创建“${item.name}”灰模`);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "breakdown-remove";
    remove.title = "从拆解清单移除";
    remove.setAttribute("aria-label", `从清单移除 ${item.name}`);
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>';
    remove.addEventListener("click", () => store.removeBreakdownItem(item.id));

    row.append(number, copy, action, remove);
    elements.breakdownList.appendChild(row);
  });
};

const renderReference = (state) => {
  const reference = state.project.reference;
  const builtCount = state.project.breakdown.filter((item) => (
    item.objectId && state.project.objects.some((object) => object.id === item.objectId)
  )).length;

  elements.conceptStage.classList.toggle("is-complete", Boolean(reference));
  elements.referenceControls.hidden = !reference;
  elements.referenceThumb.hidden = !reference;
  elements.referencePlaceholder.hidden = Boolean(reference);
  elements.referenceFullPreview.hidden = !reference;
  elements.referenceImageEmpty.hidden = Boolean(reference);
  elements.referenceImageActions.hidden = !reference;
  elements.referencePrompt.disabled = !reference;

  if (reference) {
    elements.referenceThumb.src = reference.dataUrl;
    elements.referenceFullPreview.src = reference.dataUrl;
    elements.referenceBackdrop.src = reference.dataUrl;
    elements.referenceBackdrop.hidden = !reference.visible;
    elements.referenceBackdrop.style.opacity = String(reference.opacity);
    elements.referenceCardTitle.textContent = reference.name;
    elements.referenceCardSubtitle.textContent = `${reference.width} × ${reference.height} · ${state.project.breakdown.length} 个拆解项`;
    elements.referenceDimensions.textContent = `${reference.width} × ${reference.height}`;
    elements.referenceProgress.textContent = state.project.breakdown.length
      ? `${builtCount}/${state.project.breakdown.length} 已建`
      : "图片已就绪";
    elements.referenceVisible.checked = reference.visible;
    setControlValue(elements.referenceOpacity, Math.round(reference.opacity * 100));
    elements.referenceOpacityValue.textContent = `${Math.round(reference.opacity * 100)}%`;
    setControlValue(elements.referencePrompt, reference.prompt);
  } else {
    elements.referenceThumb.removeAttribute("src");
    elements.referenceFullPreview.removeAttribute("src");
    elements.referenceBackdrop.removeAttribute("src");
    elements.referenceBackdrop.hidden = true;
    elements.referenceCardTitle.textContent = "导入概念图";
    elements.referenceCardSubtitle.textContent = "先定画面，再逐件建模";
    elements.referenceDimensions.textContent = "尚未导入";
    elements.referenceProgress.textContent = state.project.breakdown.length ? `${builtCount}/${state.project.breakdown.length} 已建` : "尚未开始";
    setControlValue(elements.referencePrompt, "");
  }

  renderBreakdown(state);
};

const renderHierarchy = (state) => {
  elements.hierarchy.replaceChildren();
  elements.objectCount.textContent = String(state.project.objects.length);

  if (!state.project.objects.length) {
    const empty = document.createElement("div");
    empty.className = "hierarchy-empty";
    empty.textContent = "暂无物体\n从上方添加基础形体";
    empty.style.whiteSpace = "pre-line";
    elements.hierarchy.appendChild(empty);
    return;
  }

  state.project.objects.forEach((object) => {
    const row = document.createElement("div");
    row.className = "hierarchy-row";
    row.classList.toggle("is-selected", object.id === state.selectionId);
    row.classList.toggle("is-hidden", !object.visible);
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-selected", String(object.id === state.selectionId));

    const main = document.createElement("button");
    main.type = "button";
    main.className = "hierarchy-main";
    main.dataset.objectId = object.id;
    main.append(typeIcon(object.type));
    const name = document.createElement("span");
    name.className = "hierarchy-name";
    name.textContent = object.name;
    const role = document.createElement("span");
    role.className = `hierarchy-role is-${object.entity.role}`;
    role.textContent = ROLE_LABELS[object.entity.role];
    main.append(name, role);
    main.addEventListener("click", () => store.setSelection(object.id));
    main.addEventListener("dblclick", () => editor.setCameraPreset(editor.activePreset));

    const visibility = document.createElement("button");
    visibility.type = "button";
    visibility.className = "hierarchy-action";
    visibility.innerHTML = visibilityIcon(object.visible);
    visibility.setAttribute("aria-label", object.visible ? `隐藏 ${object.name}` : `显示 ${object.name}`);
    visibility.title = object.visible ? "隐藏物体" : "显示物体";
    visibility.addEventListener("click", () => store.toggleVisibility(object.id));

    const lock = document.createElement("button");
    lock.type = "button";
    lock.className = "hierarchy-action";
    lock.innerHTML = lockIcon(object.locked);
    lock.setAttribute("aria-label", object.locked ? `解锁 ${object.name}` : `锁定 ${object.name}`);
    lock.title = object.locked ? "解锁物体" : "锁定物体";
    lock.addEventListener("click", () => store.toggleLock(object.id));

    row.append(main, visibility, lock);
    elements.hierarchy.appendChild(row);
  });
};

const renderInspector = (state) => {
  const object = state.project.objects.find((candidate) => candidate.id === state.selectionId);
  elements.inspectorEmpty.hidden = Boolean(object);
  elements.inspectorForm.hidden = !object;
  if (!object) return;

  elements.selectedType.textContent = TYPE_LABELS[object.type];
  elements.selectedId.textContent = object.id.split("-").at(-1).slice(0, 8).toUpperCase();
  setControlValue(elements.objectName, object.name);
  setControlValue(elements.objectColor, object.color);
  elements.objectColorText.textContent = object.color.toUpperCase();
  elements.objectVisible.checked = object.visible;
  elements.objectLocked.checked = object.locked;
  elements.delete.disabled = object.locked || directorMode === "preview";
  elements.duplicate.disabled = directorMode === "preview";
  elements.objectName.disabled = directorMode === "preview";
  elements.objectColor.disabled = directorMode === "preview";
  elements.objectVisible.disabled = directorMode === "preview";
  elements.objectLocked.disabled = directorMode === "preview";

  elements.entityRole.value = object.entity.role;
  elements.entityRoleBadge.textContent = ROLE_LABELS[object.entity.role];
  elements.entityRoleBadge.className = `entity-role-badge is-${object.entity.role}`;
  setControlValue(elements.entityState, object.entity.state);
  elements.entityRole.disabled = directorMode === "preview";
  elements.entityState.disabled = directorMode === "preview";
  elements.inspectorForm.querySelectorAll("[data-capability]").forEach((input) => {
    input.checked = object.entity.capabilities[input.dataset.capability];
    input.disabled = directorMode === "preview";
  });
  elements.entityBodyType.value = object.entity.physics.bodyType;
  setControlValue(elements.entityMass, object.entity.physics.mass);
  setControlValue(elements.entityFriction, object.entity.physics.friction);
  setControlValue(elements.entityRestitution, object.entity.physics.restitution);
  elements.entityBodyType.disabled = directorMode === "preview";
  elements.entityMass.disabled = directorMode === "preview" || object.entity.physics.bodyType === "static";
  elements.entityFriction.disabled = directorMode === "preview";
  elements.entityRestitution.disabled = directorMode === "preview";
  const assetReport = editor.assetReport(object.id);
  const spatialReport = assetReport?.spatialBridge ?? null;
  elements.chooseAssetFile.disabled = directorMode === "preview";
  elements.chooseSpatialBridge.disabled = directorMode === "preview";
  elements.chooseSpatialFiles.disabled = directorMode === "preview";
  elements.clearAssetFile.disabled = directorMode === "preview";
  elements.clearAssetFile.hidden = !assetReport;
  elements.assetSessionTitle.closest(".asset-import-status").dataset.format = assetReport?.format ?? "placeholder";
  elements.assetSessionTitle.textContent = assetReport ? assetReport.sourceName : "使用灰模";
  elements.assetSessionDetail.textContent = assetReport
    ? spatialReport
      ? `RGB-D · ${spatialReport.imageSize.join("×")} px · ${spatialReport.meshSize.join("×")} 顶点 · RGB／深度哈希已验证 · 相对 2.5D`
      : `${assetReport.format} · ${assetReport.meshCount} 网格 · ${assetReport.skinnedMeshCount} 蒙皮 · ${assetReport.boneCount} 骨骼 · ${assetReport.clipNames.length} 动作 · ${assetReport.morphTargetNames.length} Morph`
    : "选择 OBJ／GLB 模型，或导入含 spatial-bridge.json 的 RGB-D 工程。";
  elements.assetRuntimeControls.hidden = !assetReport || Boolean(spatialReport);
  elements.assetRigDetails.hidden = !assetReport;
  elements.assetDetailSummary.textContent = spatialReport ? "空间合同与边界" : "骨架与控制接口";
  if (assetReport) {
    const assetKey = `${object.id}:${assetReport.sourceName}`;
    const mappedActions = Object.entries(assetReport.animations).filter(([, name]) => name);
    const mappedActionNames = new Set(mappedActions.map(([, name]) => name));
    const actionOptions = [
      ...mappedActions.map(([slot, name]) => ({ value: slot, label: `${slot} → ${name}` })),
      ...assetReport.clipNames.filter((name) => !mappedActionNames.has(name)).map((name) => ({ value: name, label: name })),
    ];
    if (!actionOptions.length) actionOptions.push({ value: "", label: "无可用动画" });
    const actionPreferred = elements.assetActionPreview.dataset.assetKey === assetKey
      ? elements.assetActionPreview.value
      : assetReport.runtime.actionSlot ?? actionOptions[0].value;
    syncSelectOptions(elements.assetActionPreview, actionOptions, actionPreferred);
    elements.assetActionPreview.dataset.assetKey = assetKey;

    const mappedExpressions = Object.entries(assetReport.expressions).filter(([, name]) => name);
    const mappedExpressionNames = new Set(mappedExpressions.map(([, name]) => name));
    const expressionOptions = [
      ...mappedExpressions.map(([slot, name]) => ({ value: slot, label: `${slot} → ${name}` })),
      ...assetReport.morphTargetNames.filter((name) => !mappedExpressionNames.has(name)).map((name) => ({ value: name, label: name })),
    ];
    if (!expressionOptions.length) expressionOptions.push({ value: "", label: "无表情 Morph" });
    const activeMorph = Object.keys(assetReport.runtime.expressions)[0] ?? null;
    const activeExpression = mappedExpressions.find(([, name]) => name === activeMorph)?.[0] ?? activeMorph;
    const expressionPreferred = elements.assetExpressionPreview.dataset.assetKey === assetKey
      ? elements.assetExpressionPreview.value
      : activeExpression ?? expressionOptions[0].value;
    syncSelectOptions(elements.assetExpressionPreview, expressionOptions, expressionPreferred);
    elements.assetExpressionPreview.dataset.assetKey = assetKey;
    const selectedMorph = assetReport.expressions[elements.assetExpressionPreview.value]
      ?? elements.assetExpressionPreview.value;
    const expressionWeight = assetReport.runtime.expressions[selectedMorph] ?? 0;
    setControlValue(elements.assetExpressionWeight, expressionWeight);
    elements.assetExpressionOutput.textContent = `${Math.round(expressionWeight * 100)}%`;

    const locked = directorMode === "preview";
    elements.assetActionPreview.disabled = locked || !assetReport.capabilities.actions;
    elements.playAssetAction.disabled = locked || !assetReport.capabilities.actions;
    elements.assetExpressionPreview.disabled = locked || !assetReport.capabilities.expressions;
    elements.assetExpressionWeight.disabled = locked || !assetReport.capabilities.expressions;
    elements.clearAssetExpression.disabled = locked || !assetReport.capabilities.expressions;
    const boneBindings = Object.entries(assetReport.bones).filter(([, name]) => name)
      .map(([slot, name]) => `${slot}→${name}`).join("、") || "无";
    const expressionBindings = mappedExpressions.map(([slot, name]) => `${slot}→${name}`).join("、") || "无";
    const rigSummary = spatialReport
      ? `已校验 RGB 与深度预览 2 个工件；合同指纹 ${spatialReport.contractSha256.slice(0, 12)}…。近白值沿表面法线向前，但仍是相对深度，不是米制重建。载体负责位置、旋转和尺寸；表面不会自动变成碰撞体。`
      : assetReport.format === "OBJ"
        ? "静态 OBJ：没有骨骼、蒙皮权重、动画或 Morph；如需角色控制请导出为 GLB。"
        : `骨架映射：${boneBindings}。表情映射：${expressionBindings}。运行时接口：playAction、setExpression、setBonePose。`;
    elements.assetRigDetail.textContent = `${rigSummary}${assetReport.warnings.length ? ` 提示：${assetReport.warnings.join("；")}` : ""}`;
  }
  elements.interactionTrigger.value = object.entity.interaction.trigger;
  elements.interactionAction.value = object.entity.interaction.action;
  setControlValue(elements.interactionAmount, object.entity.interaction.amount);
  elements.interactionTrigger.disabled = directorMode === "preview";
  elements.interactionAction.disabled = directorMode === "preview";
  elements.interactionAmount.disabled = directorMode === "preview" || object.entity.interaction.action === "none";

  elements.inspectorForm.querySelectorAll("[data-vector]").forEach((fieldset) => {
    const property = fieldset.dataset.vector;
    fieldset.querySelectorAll("[data-axis]").forEach((input) => {
      const axis = Number(input.dataset.axis);
      setControlValue(input, Number(object[property][axis].toFixed(3)));
      input.disabled = directorMode === "preview" || object.locked;
    });
  });
};

const renderStatus = (state) => {
  const object = state.project.objects.find((candidate) => candidate.id === state.selectionId);
  const dotClass = object ? "status-dot is-selected" : "status-dot";
  const label = object
    ? `${object.name} · ${ROLE_LABELS[object.entity.role]} · ${object.locked ? "已锁定" : directorMode === "preview" ? "预览中" : "可编辑"}`
    : "未选择物体";
  elements.selectionStatus.replaceChildren();
  const dot = document.createElement("span");
  dot.className = dotClass;
  elements.selectionStatus.append(dot, document.createTextNode(label));
  elements.emptyState.hidden = state.project.objects.length > 0;
  elements.undo.disabled = directorMode === "preview" || !state.canUndo;
  elements.redo.disabled = directorMode === "preview" || !state.canRedo;
  setControlValue(elements.projectName, state.project.name);

  document.querySelectorAll("[data-tool]").forEach((button) => {
    const active = button.dataset.tool === state.tool;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = directorMode === "preview";
  });

  document.querySelectorAll("[data-stage]").forEach((button) => {
    const active = button.dataset.stage === state.project.stage;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
};

const setLibraryMode = (mode) => {
  libraryMode = mode === "screenplay" ? "screenplay" : "build";
  const isScreenplay = libraryMode === "screenplay";
  elements.libraryPanel.classList.toggle("is-screenplay", isScreenplay);
  elements.screenplayPanel.hidden = !isScreenplay;
  elements.buildTab.classList.toggle("is-active", !isScreenplay);
  elements.screenplayTab.classList.toggle("is-active", isScreenplay);
  elements.buildTab.setAttribute("aria-selected", String(!isScreenplay));
  elements.screenplayTab.setAttribute("aria-selected", String(isScreenplay));
};

const setInspectorMode = (mode) => {
  inspectorMode = mode === "entity" ? "entity" : "transform";
  const isEntity = inspectorMode === "entity";
  elements.inspectorForm.classList.toggle("is-entity-mode", isEntity);
  elements.inspectorTransformTab.classList.toggle("is-active", !isEntity);
  elements.inspectorEntityTab.classList.toggle("is-active", isEntity);
  elements.inspectorTransformTab.setAttribute("aria-selected", String(!isEntity));
  elements.inspectorEntityTab.setAttribute("aria-selected", String(isEntity));
  document.querySelector("#inspector-panel")?.scrollTo({ top: 0, behavior: "smooth" });
};

const timelineTrackFor = (track) => track === "camera"
  ? "camera"
  : track === "character"
    ? "character"
    : track === "dialogue"
      ? "dialogue"
      : "world";

const cameraVectorInputs = [...document.querySelectorAll("[data-camera-vector][data-axis]")];

const selectedCameraClip = (state = currentState) => state.project.director.timeline.clips
  .find((clip) => clip.id === selectedCameraClipId && clip.type === "camera") ?? null;

const setCameraEditorStatus = (message, error = false) => {
  elements.cameraShotStatus.textContent = message;
  elements.cameraShotStatus.classList.toggle("is-error", error);
};

const setCameraPresetButtonState = (preset) => {
  document.querySelectorAll("[data-camera]").forEach((button) => {
    const active = button.dataset.camera === preset;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
};

const updateTimelineCameraSelection = () => {
  timelineClipNodes.forEach((node, id) => {
    node.classList.toggle("is-camera-selected", id === selectedCameraClipId);
  });
};

const setCameraVectorControls = (key, vector) => {
  cameraVectorInputs.filter((input) => input.dataset.cameraVector === key).forEach((input) => {
    setControlValue(input, Number(vector[Number(input.dataset.axis)]).toFixed(3));
  });
};

const readCameraNumber = (control, label, minimum, maximum) => {
  const value = control.valueAsNumber;
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label}必须在 ${minimum}–${maximum} 之间`);
  }
  return value;
};

const readCameraVector = (key) => {
  const inputs = cameraVectorInputs
    .filter((input) => input.dataset.cameraVector === key)
    .sort((left, right) => Number(left.dataset.axis) - Number(right.dataset.axis));
  const vector = inputs.map((input) => input.valueAsNumber);
  if (vector.length !== 3 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error("位置与注视点的 X / Y / Z 都必须是数字");
  }
  return vector;
};

const renderCameraEditor = (state) => {
  const timeline = state.project.director.timeline;
  const clips = cameraClipsFor(timeline);
  if (selectedCameraClipId && !clips.some((clip) => clip.id === selectedCameraClipId)) selectedCameraClipId = null;
  if (!elements.cameraEditorPanel.hidden && !selectedCameraClipId) {
    selectedCameraClipId = nearestCameraClip(timeline, runtime?.time ?? 0)?.id ?? clips[0]?.id ?? null;
  }

  elements.cameraShotCount.textContent = `${clips.length} SHOT${clips.length === 1 ? "" : "S"}`;
  elements.cameraShotList.replaceChildren();
  clips.forEach((clip, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "camera-shot-row";
    button.classList.toggle("is-selected", clip.id === selectedCameraClipId);
    button.dataset.cameraShotId = clip.id;
    const number = document.createElement("b");
    number.textContent = String(index + 1).padStart(2, "0");
    const label = document.createElement("span");
    label.textContent = clip.label;
    const time = document.createElement("time");
    time.textContent = `${clip.start.toFixed(2)}s`;
    button.append(number, label, time);
    button.addEventListener("click", () => {
      selectedCameraClipId = clip.id;
      renderCameraEditor(currentState);
      updateTimelineCameraSelection();
    });
    elements.cameraShotList.appendChild(button);
  });

  const clip = selectedCameraClip(state);
  elements.cameraShotEmpty.hidden = clips.length > 0;
  elements.cameraShotForm.hidden = !clip;
  elements.cameraShotAdd.disabled = directorMode === "preview";
  updateTimelineCameraSelection();
  if (!clip) return;

  const from = cameraPoseForEndpoint(clip, "from");
  const to = cameraPoseForEndpoint(clip, "to");
  setControlValue(elements.cameraShotLabel, clip.label);
  elements.cameraShotId.textContent = clip.id;
  elements.cameraShotId.title = clip.id;
  setControlValue(elements.cameraShotStart, clip.start.toFixed(2));
  setControlValue(elements.cameraShotDuration, clip.duration.toFixed(2));
  setControlValue(elements.cameraShotEasing, clip.motion?.easing ?? "minimumJerk");
  setCameraVectorControls("fromPosition", from.position);
  setCameraVectorControls("fromLookAt", from.lookAt);
  setCameraVectorControls("toPosition", to.position);
  setCameraVectorControls("toLookAt", to.lookAt);
  setControlValue(elements.cameraShotFromFov, from.fov.toFixed(1));
  setControlValue(elements.cameraShotToFov, to.fov.toFixed(1));
  setControlValue(elements.cameraPositionPath, formatCameraPath(clip.positionPath));
  setControlValue(elements.cameraLookAtPath, formatCameraPath(clip.lookAtPath));

  elements.cameraShotForm.querySelectorAll("input, select, textarea, button").forEach((control) => {
    control.disabled = directorMode === "preview";
  });
  setCameraEditorStatus("改动会进入撤销历史；大型工程请用“保存 JSON”持久化。");
};

const openCameraEditor = (preferredId = null) => {
  if (isCp02Case) return;
  closeDrawers();
  if (directorMode === "preview") setDirectorMode("edit");
  const timeline = currentState.project.director.timeline;
  const preferred = timeline.clips.find((clip) => clip.id === preferredId && clip.type === "camera");
  selectedCameraClipId = preferred?.id
    ?? selectedCameraClipId
    ?? nearestCameraClip(timeline, runtime?.time ?? 0)?.id
    ?? null;
  elements.cameraEditorPanel.hidden = false;
  elements.cameraEditorToggle.classList.add("is-active");
  elements.cameraEditorToggle.setAttribute("aria-expanded", "true");
  renderCameraEditor(currentState);
};

const closeCameraEditor = () => {
  elements.cameraEditorPanel.hidden = true;
  elements.cameraEditorToggle.classList.remove("is-active");
  elements.cameraEditorToggle.setAttribute("aria-expanded", "false");
  updateTimelineCameraSelection();
};

const updateCameraPathForVector = (clip, key, vector) => {
  if (key === "fromPosition" || key === "toPosition") {
    const from = key === "fromPosition" ? vector : readCameraVector("fromPosition");
    const to = key === "toPosition" ? vector : readCameraVector("toPosition");
    return { positionPath: synchronizePathEndpoints(clip.positionPath, from, to) };
  }
  if (key === "fromLookAt" || key === "toLookAt") {
    const from = key === "fromLookAt" ? vector : readCameraVector("fromLookAt");
    const to = key === "toLookAt" ? vector : readCameraVector("toLookAt");
    return { lookAtPath: synchronizePathEndpoints(clip.lookAtPath, from, to) };
  }
  return {};
};

const commitCameraField = (target) => {
  const clip = selectedCameraClip();
  if (!clip || directorMode !== "edit") return;
  let patch = null;
  if (target === elements.cameraShotLabel) {
    patch = { label: target.value.trim() || clip.label };
  } else if (target === elements.cameraShotStart) {
    patch = { start: readCameraNumber(target, "开始时间", 0, 86_400) };
  } else if (target === elements.cameraShotDuration) {
    patch = { duration: readCameraNumber(target, "镜头时长", 0.05, 86_400) };
  } else if (target === elements.cameraShotEasing) {
    patch = { motion: { ...(clip.motion ?? {}), easing: target.value } };
  } else if (target === elements.cameraShotFromFov) {
    patch = { fromFov: readCameraNumber(target, "起点 FOV", 18, 85) };
  } else if (target === elements.cameraShotToFov) {
    patch = { toFov: readCameraNumber(target, "终点 FOV", 18, 85) };
  } else if (target === elements.cameraPositionPath) {
    const path = parseCameraPath(target.value, "相机轨道");
    patch = { positionPath: synchronizePathEndpoints(path, readCameraVector("fromPosition"), readCameraVector("toPosition")) };
  } else if (target === elements.cameraLookAtPath) {
    const path = parseCameraPath(target.value, "注视轨道");
    patch = { lookAtPath: synchronizePathEndpoints(path, readCameraVector("fromLookAt"), readCameraVector("toLookAt")) };
  } else if (target.matches("[data-camera-vector]")) {
    const key = target.dataset.cameraVector;
    const vector = readCameraVector(key);
    patch = { [key]: vector, ...updateCameraPathForVector(clip, key, vector) };
  }
  if (!patch) return;
  store.updateCameraClip(clip.id, patch);
};

const previewCameraEndpoint = (endpoint) => {
  const clip = selectedCameraClip();
  if (!clip) return;
  if (directorMode === "preview") setDirectorMode("edit");
  if (!editor.setViewportCameraPose(cameraPoseForEndpoint(clip, endpoint))) {
    showToast("当前无法切换镜头机位，请返回编辑模式");
    return;
  }
  setCameraPresetButtonState("perspective");
  setCameraEditorStatus(`正在查看镜头${endpoint === "from" ? "起点 A" : "终点 B"}；可继续拖动视口后重新记录。`);
};

const captureCameraEndpoint = (endpoint) => {
  const clip = selectedCameraClip();
  if (!clip || directorMode !== "edit") return;
  const pose = editor.getViewportCameraPose();
  if (!pose) {
    showToast("电影镜头使用透视相机，请先点击视口右上角的“透视”");
    return;
  }
  const isStart = endpoint !== "to";
  const positionKey = isStart ? "fromPosition" : "toPosition";
  const lookAtKey = isStart ? "fromLookAt" : "toLookAt";
  const fovKey = isStart ? "fromFov" : "toFov";
  const otherPosition = cameraPoseForEndpoint(clip, isStart ? "to" : "from").position;
  const otherLookAt = cameraPoseForEndpoint(clip, isStart ? "to" : "from").lookAt;
  store.updateCameraClip(clip.id, {
    [positionKey]: pose.position,
    [lookAtKey]: pose.lookAt,
    [fovKey]: pose.fov,
    positionPath: synchronizePathEndpoints(
      clip.positionPath,
      isStart ? pose.position : otherPosition,
      isStart ? otherPosition : pose.position,
    ),
    lookAtPath: synchronizePathEndpoints(
      clip.lookAtPath,
      isStart ? pose.lookAt : otherLookAt,
      isStart ? otherLookAt : pose.lookAt,
    ),
  });
  showToast(`已记录“${clip.label}”的${isStart ? "起点 A" : "终点 B"}`);
};

const SIMULATION_PHASE_LABELS = Object.freeze({
  anticipation: "预备",
  reach: "伸手",
  contact: "接触约束",
  recovery: "恢复",
});

const SIMULATION_MODE_LABELS = Object.freeze({
  claim: "抓取",
  transfer: "交接",
  release: "放置",
});

const renderSimulationStatus = (frame) => {
  const simulation = frame.simulation ?? {};
  const clockHz = simulation.clock?.hz ?? simulation.hz ?? 60;
  const violation = simulation.violations?.[0];
  const collision = simulation.collision;
  const collisionLabel = collision
    ? ` · 防穿透 ${collision.resolvedCount ?? 0} 处 · 残余 ${Number(collision.residualPenetration ?? 0).toFixed(3)}m`
    : "";
  const interaction = frame.interactions?.find((item) => item.ownershipMode && item.ownershipMode !== "none")
    ?? frame.interactions?.[0];
  const names = new Map(currentState.project.objects.map((object) => [object.id, object.name]));
  let state = "idle";
  let phase = "等待交互";
  let detail = "确定性运动学后端 · 尚未接入刚体动力学";

  if (violation) {
    state = "error";
    phase = "转换被拒绝";
    detail = violation.message;
  } else if (collision && !collision.safe) {
    state = "error";
    phase = "碰撞约束失败";
    detail = `仍有 ${Number(collision.residualPenetration ?? 0).toFixed(3)}m 穿透，请检查碰撞代理。`;
  } else if (interaction) {
    state = interaction.phase?.name ?? "active";
    phase = SIMULATION_PHASE_LABELS[interaction.phase?.name] ?? "语义交互";
    const mode = SIMULATION_MODE_LABELS[interaction.ownershipMode] ?? interaction.action ?? "交互";
    const actorName = names.get(interaction.actorId) ?? interaction.actorId;
    const targetName = names.get(interaction.targetId) ?? interaction.targetId;
    const error = Number(interaction.constraintError);
    const errorLabel = Number.isFinite(error) ? ` · 剩余行程 ${error.toFixed(3)}m` : "";
    detail = `${mode} · ${actorName} → ${targetName}${errorLabel}${collisionLabel}`;
  } else {
    const heldEntry = Object.entries(simulation.ownership ?? {}).find(([, value]) => value.status === "held");
    const placedEntry = Object.entries(simulation.ownership ?? {}).find(([, value]) => value.status === "placed");
    if (heldEntry) {
      state = "held";
      phase = "持续持有";
      detail = `${names.get(heldEntry[0]) ?? heldEntry[0]} · 持有者 ${names.get(heldEntry[1].holderId) ?? heldEntry[1].holderId}${collisionLabel}`;
    } else if (placedEntry) {
      state = "placed";
      phase = "放置完成";
      detail = `${names.get(placedEntry[0]) ?? placedEntry[0]} · 接触面 ${names.get(placedEntry[1].placementTargetId) ?? placedEntry[1].placementTargetId}${collisionLabel}`;
    } else if (collision) {
      detail = `确定性运动学后端${collisionLabel}`;
    }
  }

  elements.simulationIndicator.dataset.state = state;
  elements.simulationPhase.textContent = `SIM ${clockHz}Hz · ${phase}`;
  elements.simulationDetail.textContent = detail;
};

const updateTimelineFrame = (frame) => {
  currentFrame = frame;
  if (directorMode === "preview") {
    editor.applyDirectorFrame(frame);
    elements.dialogueOverlay.hidden = !frame.dialogue;
    if (frame.dialogue && frame.dialogue.clipId !== lastDialogueClipId) {
      elements.dialogueSpeaker.textContent = frame.dialogue.speaker;
      elements.dialogueText.textContent = frame.dialogue.text;
    }
    lastDialogueClipId = frame.dialogue?.clipId ?? null;
  } else {
    elements.dialogueOverlay.hidden = true;
    lastDialogueClipId = null;
  }
  if (directorMode === "preview") renderSimulationStatus(frame);

  const uiDelta = Math.abs(frame.time - lastTimelineUiTime);
  if (runtime?.playing && uiDelta < 1 / 30) return;
  lastTimelineUiTime = frame.time;
  const duration = Math.max(frame.duration, 0);
  const progress = duration ? (frame.time / duration) * 100 : 0;
  elements.timelineTimecode.textContent = formatTimecode(frame.time);
  elements.timelineScrubber.value = String(frame.time);
  elements.timelinePlayhead.style.left = `${progress}%`;

  const active = new Set(frame.activeClipIds);
  for (const id of activeTimelineClipIds) {
    if (!active.has(id)) timelineClipNodes.get(id)?.classList.remove("is-active");
  }
  for (const id of active) {
    if (!activeTimelineClipIds.has(id)) timelineClipNodes.get(id)?.classList.add("is-active");
  }
  activeTimelineClipIds = active;
};

const updatePlaybackState = ({ playing, duration }) => {
  elements.timelinePlay.classList.toggle("is-playing", playing);
  elements.timelinePlay.setAttribute("aria-label", playing ? "暂停" : "播放");
  elements.timelineDuration.textContent = formatTimecode(duration);
};

const seekDirector = (time) => {
  if (!runtime) return;
  if (directorMode !== "preview" && !setDirectorMode("preview")) return;
  runtime.seek(time);
};

const renderTimeline = (timeline) => {
  const key = JSON.stringify([
    timeline.duration,
    timeline.clips.map((clip) => [clip.id, clip.start, clip.duration, clip.label, clip.track]),
  ]);
  elements.timelineScrubber.max = String(Math.max(timeline.duration, 0));
  elements.timelineDuration.textContent = formatTimecode(timeline.duration);
  if (key === renderedTimelineKey) return;
  renderedTimelineKey = key;

  elements.timelineRuler.replaceChildren();
  const tickCount = timeline.duration > 20 ? 8 : 6;
  for (let index = 0; index <= tickCount; index += 1) {
    const tick = document.createElement("span");
    tick.className = "timeline-tick";
    tick.style.left = `${(index / tickCount) * 100}%`;
    const label = document.createElement("span");
    label.textContent = `${((timeline.duration * index) / tickCount).toFixed(1)}s`;
    tick.appendChild(label);
    elements.timelineRuler.appendChild(tick);
  }

  document.querySelectorAll("[data-timeline-track]").forEach((track) => track.replaceChildren());
  timelineClipNodes = new Map();
  activeTimelineClipIds = new Set();
  const visualDuration = Math.max(timeline.duration, 1);
  timeline.clips.forEach((clip) => {
    const track = document.querySelector(`[data-timeline-track="${timelineTrackFor(clip.track)}"]`);
    if (!track) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "timeline-clip";
    button.dataset.clipId = clip.id;
    button.dataset.track = clip.track;
    button.classList.toggle("is-camera-selected", clip.type === "camera" && clip.id === selectedCameraClipId);
    button.style.left = `${(clip.start / visualDuration) * 100}%`;
    button.style.width = `${Math.max((clip.duration / visualDuration) * 100, 0.8)}%`;
    button.textContent = clip.label;
    button.title = `${clip.label} · ${clip.start.toFixed(2)}s`;
    button.setAttribute("aria-label", `跳转到 ${clip.label}`);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (clip.type === "camera" && directorMode === "edit") openCameraEditor(clip.id);
      else seekDirector(clip.start);
    });
    track.appendChild(button);
    timelineClipNodes.set(clip.id, button);
  });
  if (currentFrame) updateTimelineFrame(currentFrame);
};

const renderDirector = (state) => {
  const { screenplay, timeline } = state.project.director;
  if (document.activeElement !== elements.screenplayInput) elements.screenplayInput.value = screenplay;
  const stale = timeline.compiledScript !== screenplay;
  const errors = timeline.issues.filter((item) => item.severity === "error");
  const warnings = timeline.issues.filter((item) => item.severity === "warning");
  const statusClass = stale ? "is-stale" : errors.length ? "is-error" : timeline.compiledAt ? "is-success" : "is-stale";
  const statusText = stale ? "待编译" : errors.length ? `${errors.length} 个错误` : timeline.compiledAt ? "已就绪" : "未编译";
  elements.screenplayState.className = `compile-state ${statusClass}`;
  elements.screenplayState.textContent = statusText;
  elements.timelineCompileBadge.className = `timeline-compile-badge ${statusClass}`;
  elements.timelineCompileBadge.textContent = stale ? "剧本已修改" : statusText;
  elements.compileSummaryTitle.textContent = stale
    ? "剧本已修改，需要重新编译"
    : errors.length
      ? `生成 ${timeline.clips.length} 个片段，但存在错误`
      : timeline.compiledAt
        ? `${timeline.clips.length} 个片段可以播放`
        : "还没有编译";
  elements.compileSummaryMeta.textContent = timeline.compiledAt
    ? `${timeline.duration.toFixed(2)} 秒 · ${warnings.length} 个警告 · ${errors.length} 个错误`
    : "Ctrl + Enter 快速编译";

  elements.compileIssues.replaceChildren();
  timeline.issues.forEach((item) => {
    const row = document.createElement("div");
    row.className = `compile-issue is-${item.severity}`;
    const line = document.createElement("b");
    line.textContent = item.line ? `L${item.line}` : "提示";
    const message = document.createElement("span");
    message.textContent = item.message;
    row.append(line, message);
    elements.compileIssues.appendChild(row);
  });
  renderTimeline(timeline);
  renderCameraEditor(state);
};

const compileDirector = ({ announce = true } = {}) => {
  const screenplay = elements.screenplayInput.value;
  const projectForCompile = structuredClone(currentState.project);
  projectForCompile.director.screenplay = screenplay;
  const timeline = compileScreenplay(screenplay, projectForCompile);
  runtime?.stop();
  store.setScreenplay(screenplay, { history: false });
  store.setTimeline(timeline);
  const errorCount = timeline.issues.filter((item) => item.severity === "error").length;
  if (announce) {
    showToast(errorCount
      ? `已生成 ${timeline.clips.length} 个片段，另有 ${errorCount} 个错误`
      : `剧本已编译：${timeline.clips.length} 个片段 · ${timeline.duration.toFixed(1)} 秒`);
  }
  return timeline;
};

const setDirectorMode = (mode) => {
  const nextMode = mode === "preview" ? "preview" : "edit";
  if (nextMode === "preview" && !isCp02Case) {
    const timeline = currentState.project.director.timeline;
    const stale = timeline.compiledScript !== elements.screenplayInput.value;
    const readyTimeline = stale || (!timeline.clips.length && elements.screenplayInput.value.trim())
      ? compileDirector({ announce: false })
      : timeline;
    if (!readyTimeline.clips.length) {
      showToast("先写入并编译至少一个可执行动作");
      return false;
    }
  }

  directorMode = nextMode;
  document.querySelectorAll("[data-director-mode]").forEach((button) => {
    const active = button.dataset.directorMode === directorMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.app.classList.toggle("is-preview", directorMode === "preview");
  elements.previewIndicator.hidden = directorMode !== "preview";
  elements.simulationIndicator.hidden = directorMode !== "preview";
  elements.performanceIndicator.hidden = directorMode !== "preview";
  editor.setDirectorMode(directorMode);

  if (directorMode === "preview") runtime?.seek(runtime.time);
  else {
    runtime?.pause();
    elements.dialogueOverlay.hidden = true;
  }
  renderInspector(currentState);
  renderStatus(currentState);
  renderCameraEditor(currentState);
  return true;
};

const togglePlayback = () => {
  if (!runtime) return;
  if (runtime.playing) {
    runtime.pause();
    return;
  }
  if (directorMode !== "preview" && !setDirectorMode("preview")) return;
  if (!runtime.play()) showToast("时间线为空，请先编译剧本");
};

const scheduleAutosave = (project) => {
  if (isCp02Case) {
    elements.autosaveStatus.textContent = "CP02 临时会话 · 不写入默认项目";
    return;
  }
  window.clearTimeout(autosaveTimer);
  elements.autosaveStatus.textContent = "保存中…";
  autosaveTimer = window.setTimeout(() => {
    try {
      const json = serializeProject(project);
      if (json.length > 3_500_000) throw new Error("项目过大，已停止本地自动保存");
      localStorage.setItem(STORAGE_KEY, json);
      localStorage.removeItem(LEGACY_STORAGE_KEY_V2);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date());
      elements.autosaveStatus.textContent = `已自动保存 ${time}`;
    } catch (error) {
      elements.autosaveStatus.textContent = "自动保存失败";
      console.warn(error);
    }
  }, 280);
};

store.subscribe((state) => {
  currentState = state;
  renderHierarchy(state);
  renderInspector(state);
  renderReference(state);
  renderStatus(state);
  renderDirector(state);
  runtime?.setProject(state.project);
  scheduleAutosave(state.project);
  renderCp02Surface();
  void refreshCp02ProjectHash(state.project);
});

runtime = new DirectorRuntime(currentState.project, updateTimelineFrame, updatePlaybackState);
editor.setPerformanceHandler((report) => {
  if (isCp02Case) cp02Evidence.latestPerformanceReport = structuredClone(report);
  const { fps, qualityScale, p95Ms, shadowsEnabled, objectLightsEnabled, adaptationEnabled } = report;
  elements.performanceFps.textContent = `${Math.round(fps)} FPS`;
  const effectsLabel = shadowsEnabled && objectLightsEnabled ? "特效 实时" : "特效 简化";
  const quality = adaptationEnabled ? qualityScale : 1;
  elements.performanceQuality.textContent = `画质 ${Math.round(quality * 100)}% · ${effectsLabel} · P95 ${p95Ms.toFixed(1)}ms`;
  elements.performanceIndicator.classList.toggle("is-slow", fps < 45 || p95Ms > 30);
});
editor.setPreviewInteractionHandler((id) => {
  const object = currentState.project.objects.find((candidate) => candidate.id === id);
  if (!object) return;
  if (editor.triggerInteraction(id, object.entity.interaction)) {
    const actionLabel = {
      pulse: "脉冲缩放",
      spin: "旋转",
      toggleVisibility: "显隐切换",
    }[object.entity.interaction.action];
    showToast(`“${object.name}”触发：${actionLabel}`);
  } else {
    showToast(`“${object.name}”没有配置点击响应`);
  }
});

const loadCp02LocalCasePack = async () => {
  cp02Evidence.casePack.status = "LOADING";
  updateCp02Ready();
  renderCp02Surface();
  try {
    const manifestUrl = new URL("case-pack.json", new URL(cp02CasePackRoot, window.location.href));
    const response = await fetch(manifestUrl, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Case Pack manifest 请求失败（HTTP ${response.status}）`);
    const manifestText = await response.text();
    const manifestInput = JSON.parse(manifestText);
    const casePack = await loadCasePack(cp02CasePackRoot, manifestInput);
    const expectedIds = Object.values(cp02MaterializationBindings)
      .map((binding) => binding.casePackAssetId)
      .sort();
    const actualIds = casePack.manifest.assets.map((asset) => asset.assetId).sort();
    if (actualIds.length !== expectedIds.length || actualIds.some((assetId, index) => assetId !== expectedIds[index])) {
      throw new Error("Case Pack 资产集合与 CP02 固定 materialization catalog 不一致");
    }
    cp02RuntimeCasePack = casePack;
    cp02Evidence.casePack = {
      status: "VERIFIED",
      casePackId: casePack.casePackId,
      manifestSha256: await sha256Text(manifestText),
      publicReleaseAuthorized: casePack.manifest.publicReleaseAuthorized,
      assets: casePack.manifest.assets.map((asset) => ({
        assetId: asset.assetId,
        filename: asset.filename,
        bytes: asset.bytes,
        sha256: asset.sha256,
        publicDisplay: asset.publicDisplay,
        placement: structuredClone(asset.placement),
      })),
    };
    updateCp02Ready();
    if (!cp02Evidence.ready) cp02Evidence.phase = "Case Pack 已核验；等待 CP02 场景哈希。";
    renderCp02Surface();
  } catch (error) {
    cp02RuntimeCasePack = null;
    cp02Evidence.ready = false;
    cp02Evidence.casePack.status = "ERROR";
    cp02Evidence.outcome = "ERROR";
    cp02Evidence.phase = `CP02 Case Pack 载入失败：${error.message}`;
    renderCp02Surface();
  }
};

const loadCp02LocalProject = async () => {
  cp02Evidence.ready = false;
  cp02Evidence.sceneReady = false;
  cp02Evidence.phase = "正在载入仓库内 CP02 固定场景…";
  renderCp02Surface();
  try {
    const response = await fetch(cp02ProjectUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`本地场景请求失败（HTTP ${response.status}）`);
    const project = ensureInitialTimeline(await response.json());
    store.replaceProject(project);
    cp02Evidence.visualProfile = editor.applyCp02VisualProfile(cp02VisualRepairProfile);
    await refreshCp02ProjectHash(store.getState().project);
    if (!cp02Evidence.ready) cp02Evidence.phase = "CP02 场景哈希已核验；等待本地 Case Pack。";
  } catch (error) {
    cp02Evidence.ready = false;
    cp02Evidence.sceneReady = false;
    cp02Evidence.outcome = "ERROR";
    cp02Evidence.phase = `CP02 场景载入失败：${error.message}`;
    renderCp02Surface();
  }
};

const setupCp02Case = () => {
  if (!isCp02Case) return;
  document.body.classList.add("is-cp02-case");
  elements.cp02Panel.hidden = false;
  elements.cp02LayerLegend.hidden = false;
  elements.projectName.disabled = true;
  editor.setGovernanceOverlay(false);

  elements.cp02Preview.addEventListener("click", () => void previewCp02Reframe());
  elements.cp02GuardianAllow.addEventListener("click", () => void decideCp02Patch("ALLOW"));
  elements.cp02GuardianReject.addEventListener("click", () => void decideCp02Patch("REJECT"));
  elements.cp02ProposeThermos.addEventListener("click", () => void previewCp02Thermos());
  elements.cp02MoveChair.addEventListener("click", () => void moveCp02Chair());
  elements.cp02Undo.addEventListener("click", () => void undoLatestCp02Patch());
  elements.cp02AttemptSourceRewrite.addEventListener("click", () => void attemptCp02SourceRewrite());
  elements.cp02DownloadReceipt.addEventListener("click", downloadLatestCp02Receipt);
  elements.cp02EvidenceOverlay.addEventListener("change", () => {
    editor.setGovernanceOverlay(elements.cp02EvidenceOverlay.checked);
  });

  window.__PACT_CP02_EVIDENCE__ = Object.freeze({
    snapshot: () => structuredClone({
      schemaVersion: 1,
      ready: cp02Evidence.ready,
      phase: cp02Evidence.phase,
      outcome: cp02Evidence.outcome,
      sourcePhotoSha256: currentState.project.cp02?.sourcePhotoSha256 ?? null,
      initialProjectHash: cp02Evidence.initialProjectHash,
      projectHash: cp02Evidence.projectHash,
      objectCount: currentState.project.objects.length,
      governanceCounts: cp02GovernanceCounts(currentState.project),
      authorisedObjectIds: currentState.project.objects
        .filter((object) => object.governance?.state === "AUTHORISED")
        .map((object) => object.id)
        .sort(),
      currentPatch: cp02Evidence.currentPatch,
      latestReceipt: cp02Evidence.latestReceipt,
      receipts: cp02Evidence.receipts,
      appliedPatchDepth: cp02Evidence.appliedReceipts.length,
      historyIndex: store.historyIndex,
      proposalPrimitiveCount: editor.cp02ProposalRoot?.children.reduce(
        (count, root) => count + root.children.length,
        0,
      ) ?? 0,
      performance: cp02Evidence.latestPerformanceReport,
      casePack: cp02Evidence.casePack,
      materializedAssets: cp02MaterializedAssetList(),
      materializationErrors: cp02Evidence.materializationErrors,
      visualProfile: cp02Evidence.visualProfile,
      layerGrammar: {
        id: cp02Evidence.visualProfile?.layers?.id ?? null,
        archiveObjectPrefixes: cp02Evidence.visualProfile?.layers?.archiveObjectPrefixes ?? [],
        archiveState: "ARCHIVE_LOCKED",
        mutableState: cp02MutableLayerState(currentState.project),
      },
      executionMode: "engineering-evidence",
      networkPolicy: "local-only",
      publicAssetDisplay: false,
    }),
  });

  runtime?.stop();
  setDirectorMode("preview");
  cp02Evidence.phase = "正在载入仓库内 CP02 固定场景…";
  elements.cp02Utterance.value = cp02InitialUtterance;
  renderCp02Surface();
  void loadCp02LocalProject();
  void loadCp02LocalCasePack();
};

SCREENPLAY_SYNTAX.forEach((syntax) => {
  const code = document.createElement("code");
  code.textContent = syntax;
  elements.syntaxGuideList.appendChild(code);
});

elements.conceptStage.addEventListener("click", openReferenceWorkbench);
elements.openReference.addEventListener("click", openReferenceWorkbench);
elements.closeReferenceDialog.addEventListener("click", () => elements.referenceDialog.close());
elements.referenceDialog.addEventListener("click", (event) => {
  if (event.target === elements.referenceDialog) elements.referenceDialog.close();
});

elements.buildTab.addEventListener("click", () => setLibraryMode("build"));
elements.screenplayTab.addEventListener("click", () => setLibraryMode("screenplay"));
elements.inspectorTransformTab.addEventListener("click", () => setInspectorMode("transform"));
elements.inspectorEntityTab.addEventListener("click", () => setInspectorMode("entity"));

document.querySelectorAll("[data-stage]").forEach((button) => {
  button.addEventListener("click", () => {
    const stage = button.dataset.stage;
    store.setStage(stage);
    if (stage === "screenplay") {
      setLibraryMode("screenplay");
      elements.app.classList.remove("is-timeline-collapsed");
      elements.timelineCollapse.setAttribute("aria-expanded", "true");
      if (window.innerWidth <= 980) toggleDrawer("library");
    } else if (stage === "behavior") {
      setInspectorMode("entity");
      if (!currentState.selectionId) {
        const candidate = currentState.project.objects.find((object) => object.entity.role !== "environment")
          ?? currentState.project.objects[0];
        if (candidate) store.setSelection(candidate.id);
      }
      if (window.innerWidth <= 980) toggleDrawer("inspector");
    } else if (stage === "blockout") {
      setLibraryMode("build");
      setInspectorMode("transform");
    }
  });
});

document.querySelectorAll("[data-director-mode]").forEach((button) => {
  button.addEventListener("click", () => setDirectorMode(button.dataset.directorMode));
});

elements.screenplayInput.addEventListener("input", () => {
  elements.screenplayState.className = "compile-state is-stale";
  elements.screenplayState.textContent = "待编译";
  elements.timelineCompileBadge.className = "timeline-compile-badge is-stale";
  elements.timelineCompileBadge.textContent = "剧本已修改";
});
elements.screenplayInput.addEventListener("change", () => {
  if (elements.screenplayInput.value !== currentState.project.director.screenplay) {
    store.setScreenplay(elements.screenplayInput.value);
  }
});
elements.screenplayInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    compileDirector();
  }
});
elements.compileScreenplay.addEventListener("click", () => compileDirector());
elements.loadScreenplayExample.addEventListener("click", () => {
  elements.screenplayInput.value = STARTER_SCREENPLAY;
  compileDirector();
});

elements.timelinePlay.addEventListener("click", togglePlayback);
elements.timelineStop.addEventListener("click", () => runtime?.stop());
elements.timelineScrubber.addEventListener("input", () => seekDirector(Number(elements.timelineScrubber.value)));
elements.timelineCollapse.addEventListener("click", () => {
  const collapsed = elements.app.classList.toggle("is-timeline-collapsed");
  elements.timelineCollapse.setAttribute("aria-expanded", String(!collapsed));
  elements.timelineCollapse.setAttribute("aria-label", collapsed ? "展开时间线" : "收起时间线");
  editor.resize();
});

elements.cameraEditorToggle.addEventListener("click", () => {
  if (elements.cameraEditorPanel.hidden) openCameraEditor();
  else closeCameraEditor();
});
elements.cameraEditorClose.addEventListener("click", closeCameraEditor);
elements.cameraShotForm.addEventListener("submit", (event) => event.preventDefault());
elements.cameraShotForm.addEventListener("change", (event) => {
  try {
    commitCameraField(event.target);
  } catch (error) {
    setCameraEditorStatus(error.message, true);
    event.target.setAttribute("aria-invalid", "true");
    return;
  }
  event.target.removeAttribute("aria-invalid");
});

document.querySelectorAll("[data-camera-preview]").forEach((button) => {
  button.addEventListener("click", () => previewCameraEndpoint(button.dataset.cameraPreview));
});
document.querySelectorAll("[data-camera-capture]").forEach((button) => {
  button.addEventListener("click", () => captureCameraEndpoint(button.dataset.cameraCapture));
});

elements.cameraShotAdd.addEventListener("click", () => {
  if (directorMode !== "edit") setDirectorMode("edit");
  const pose = editor.getViewportCameraPose();
  if (!pose) {
    showToast("先切换到透视视角，再新建电影镜头");
    return;
  }
  const timeline = currentState.project.director.timeline;
  const playhead = runtime?.time ?? 0;
  const start = playhead > 0.001 ? playhead : timeline.duration;
  const id = store.addCameraClip({
    start,
    duration: 2.5,
    fromPosition: pose.position,
    toPosition: pose.position,
    fromLookAt: pose.lookAt,
    toLookAt: pose.lookAt,
    fromFov: pose.fov,
    toFov: pose.fov,
  });
  selectedCameraClipId = id;
  openCameraEditor(id);
  showToast(`已在 ${start.toFixed(2)} 秒新建镜头`);
});

elements.cameraShotDuplicate.addEventListener("click", () => {
  const clip = selectedCameraClip();
  if (!clip) return;
  const id = store.duplicateCameraClip(clip.id);
  if (!id) return;
  selectedCameraClipId = id;
  renderCameraEditor(currentState);
  showToast(`已复制“${clip.label}”，并放到时间线末尾`);
});

elements.cameraShotDelete.addEventListener("click", () => {
  const clip = selectedCameraClip();
  if (!clip || !store.deleteCameraClip(clip.id)) return;
  showToast(`已删除“${clip.label}”，可用撤销恢复`);
});

elements.cameraPathBuild.addEventListener("click", () => {
  const clip = selectedCameraClip();
  if (!clip) return;
  try {
    store.updateCameraClip(clip.id, {
      positionPath: createThreePointPath(readCameraVector("fromPosition"), readCameraVector("toPosition")),
      lookAtPath: createThreePointPath(readCameraVector("fromLookAt"), readCameraVector("toLookAt")),
    });
    setCameraEditorStatus("已创建三点曲线；可在文本框中继续增加或调整控制点。");
  } catch (error) {
    setCameraEditorStatus(error.message, true);
  }
});

elements.cameraPathClear.addEventListener("click", () => {
  const clip = selectedCameraClip();
  if (!clip) return;
  store.updateCameraClip(clip.id, { positionPath: [], lookAtPath: [] });
  setCameraEditorStatus("已改为 A 到 B 的直线运镜。");
});

elements.cameraShotPlay.addEventListener("click", () => {
  const clip = selectedCameraClip();
  if (!clip || !setDirectorMode("preview")) return;
  closeCameraEditor();
  if (!runtime?.playRange(clip.start, clip.start + clip.duration)) {
    showToast("这个镜头没有可播放的有效时段");
    setDirectorMode("edit");
    return;
  }
  showToast(`正在播放“${clip.label}” · ${clip.duration.toFixed(2)} 秒`);
});

const chooseReferenceImage = () => elements.referenceFile.click();
elements.chooseReferenceImage.addEventListener("click", chooseReferenceImage);
elements.replaceReferenceImage.addEventListener("click", chooseReferenceImage);
elements.referenceFile.addEventListener("change", async () => {
  const file = elements.referenceFile.files?.[0];
  if (!file) return;
  elements.chooseReferenceImage.disabled = true;
  elements.replaceReferenceImage.disabled = true;
  try {
    const reference = await prepareReferenceImage(file);
    store.setReference(reference);
    showToast(`概念图“${reference.name}”已导入`);
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.chooseReferenceImage.disabled = false;
    elements.replaceReferenceImage.disabled = false;
    elements.referenceFile.value = "";
  }
});

elements.removeReferenceImage.addEventListener("click", () => {
  if (store.removeReference()) showToast("参考图已移除，可使用撤销恢复");
});

elements.chooseAssetFile.addEventListener("click", () => elements.assetFile.click());
elements.assetFile.addEventListener("change", async () => {
  const object = selectedObject();
  const file = elements.assetFile.files?.[0];
  if (!object || !file) return;
  elements.chooseAssetFile.disabled = true;
  elements.chooseSpatialBridge.disabled = true;
  elements.chooseSpatialFiles.disabled = true;
  elements.assetSessionTitle.textContent = "正在解析模型…";
  elements.assetSessionDetail.textContent = "检查网格、比例、骨架、动作与表情 Morph，请稍候。";
  try {
    const report = await editor.loadAssetFile(object.id, file);
    showToast(`已替换“${object.name}”：${report.format} · ${report.meshCount} 网格 · ${report.boneCount} 骨骼 · ${report.clipNames.length} 动作`);
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.assetFile.value = "";
    renderInspector(currentState);
  }
});

elements.chooseSpatialBridge.addEventListener("click", () => elements.spatialBridgeFolder.click());
elements.chooseSpatialFiles.addEventListener("click", () => elements.spatialBridgeFiles.click());
const importSpatialSelection = async (input) => {
  const object = selectedObject();
  const files = [...(input.files ?? [])];
  if (!object || !files.length) return;
  elements.chooseAssetFile.disabled = true;
  elements.chooseSpatialBridge.disabled = true;
  elements.chooseSpatialFiles.disabled = true;
  elements.assetSessionTitle.textContent = "正在校验 RGB-D 工程…";
  elements.assetSessionDetail.textContent = "匹配桥接合同、RGB 与深度预览，并逐一校验 SHA-256。";
  try {
    const report = await editor.loadSpatialBridgeFiles(object.id, files);
    const spatial = report.spatialBridge;
    showToast(`已导入“${object.name}”的 RGB-D 表面：${spatial.imageSize.join("×")} · ${spatial.vertexCount} 顶点 · 2 个哈希已验证`);
  } catch (error) {
    showToast(error.message);
  } finally {
    input.value = "";
    renderInspector(currentState);
  }
};
elements.spatialBridgeFolder.addEventListener("change", () => importSpatialSelection(elements.spatialBridgeFolder));
elements.spatialBridgeFiles.addEventListener("change", () => importSpatialSelection(elements.spatialBridgeFiles));

elements.clearAssetFile.addEventListener("click", () => {
  const object = selectedObject();
  if (!object || !editor.clearAsset(object.id)) return;
  renderInspector(currentState);
  showToast(`“${object.name}”已恢复为灰模`);
});

elements.assetActionPreview.addEventListener("change", () => {
  const object = selectedObject();
  const action = elements.assetActionPreview.value;
  if (!object || !action) return;
  if (editor.playAssetAction(object.id, action)) showToast(`动作预览：${elements.assetActionPreview.selectedOptions[0]?.textContent ?? action}`);
  renderInspector(currentState);
});

elements.playAssetAction.addEventListener("click", () => {
  const object = selectedObject();
  const action = elements.assetActionPreview.value;
  if (!object || !action) return;
  if (editor.playAssetAction(object.id, action)) showToast(`重播动作：${elements.assetActionPreview.selectedOptions[0]?.textContent ?? action}`);
  renderInspector(currentState);
});

elements.assetExpressionPreview.addEventListener("change", () => {
  const object = selectedObject();
  if (!object) return;
  const report = editor.assetReport(object.id);
  const morph = report?.expressions[elements.assetExpressionPreview.value] ?? elements.assetExpressionPreview.value;
  const weight = report?.runtime.expressions[morph] ?? 0;
  setControlValue(elements.assetExpressionWeight, weight);
  elements.assetExpressionOutput.textContent = `${Math.round(weight * 100)}%`;
});

elements.assetExpressionWeight.addEventListener("input", () => {
  const object = selectedObject();
  const expression = elements.assetExpressionPreview.value;
  const weight = Number(elements.assetExpressionWeight.value);
  if (!object || !expression) return;
  editor.setAssetExpression(object.id, expression, weight, { exclusive: true });
  elements.assetExpressionOutput.textContent = `${Math.round(weight * 100)}%`;
});

elements.clearAssetExpression.addEventListener("click", () => {
  const object = selectedObject();
  if (!object || !editor.clearAssetExpressions(object.id)) return;
  setControlValue(elements.assetExpressionWeight, 0);
  elements.assetExpressionOutput.textContent = "0%";
  showToast("已清除表情覆盖");
});

elements.referenceVisible.addEventListener("change", () => {
  store.updateReference({ visible: elements.referenceVisible.checked });
});

elements.referenceOpacity.addEventListener("input", () => {
  const opacity = Number(elements.referenceOpacity.value) / 100;
  elements.referenceOpacityValue.textContent = `${Math.round(opacity * 100)}%`;
  store.updateReference({ opacity }, { history: false });
});

elements.referenceOpacity.addEventListener("change", () => store.checkpoint());
elements.referencePrompt.addEventListener("change", () => {
  store.updateReference({ prompt: elements.referencePrompt.value });
});

elements.breakdownForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.breakdownName.value.trim();
  if (!name) return;
  store.addBreakdownItem(name, elements.breakdownType.value);
  elements.breakdownName.value = "";
  elements.breakdownName.focus();
});

document.querySelectorAll("[data-primitive]").forEach((button) => {
  button.addEventListener("click", () => {
    const id = store.addObject(button.dataset.primitive);
    const object = store.getState().project.objects.find((candidate) => candidate.id === id);
    showToast(`已添加${object ? `“${object.name}”` : "物体"}`);
  });
});

document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => store.setTool(button.dataset.tool));
});

document.querySelectorAll("[data-camera]").forEach((button) => {
  button.addEventListener("click", () => {
    editor.setCameraPreset(button.dataset.camera);
    document.querySelectorAll("[data-camera]").forEach((candidate) => {
      const active = candidate === button;
      candidate.classList.toggle("is-active", active);
      candidate.setAttribute("aria-pressed", String(active));
    });
  });
});

elements.inspectorForm.addEventListener("change", (event) => {
  const object = selectedObject();
  if (!object) return;
  const target = event.target;

  if (target === elements.entityRole) {
    store.setEntityRole(object.id, target.value);
    showToast(`已设为${ROLE_LABELS[target.value]}，并载入默认能力`);
    return;
  }
  if (target === elements.entityState) {
    store.updateEntity(object.id, { state: target.value });
    return;
  }
  if (target.matches("[data-capability]")) {
    store.updateEntity(object.id, { capabilities: { [target.dataset.capability]: target.checked } });
    return;
  }
  if (target === elements.entityBodyType) {
    store.updateEntity(object.id, { physics: { bodyType: target.value } });
    return;
  }
  if (target === elements.entityMass) {
    store.updateEntity(object.id, { physics: { mass: Number(target.value) } });
    return;
  }
  if (target === elements.entityFriction) {
    store.updateEntity(object.id, { physics: { friction: Number(target.value) } });
    return;
  }
  if (target === elements.entityRestitution) {
    store.updateEntity(object.id, { physics: { restitution: Number(target.value) } });
    return;
  }
  if (target === elements.interactionTrigger) {
    store.updateEntity(object.id, { interaction: { trigger: target.value } });
    return;
  }
  if (target === elements.interactionAction) {
    store.updateEntity(object.id, { interaction: { action: target.value } });
    return;
  }
  if (target === elements.interactionAmount) {
    store.updateEntity(object.id, { interaction: { amount: Number(target.value) } });
    return;
  }

  if (target === elements.objectName) {
    store.updateObject(object.id, { name: target.value });
    return;
  }
  if (target === elements.objectVisible) {
    store.updateObject(object.id, { visible: target.checked });
    return;
  }
  if (target === elements.objectLocked) {
    store.updateObject(object.id, { locked: target.checked });
    return;
  }
  if (target.matches("[data-axis]")) {
    const fieldset = target.closest("[data-vector]");
    const property = fieldset.dataset.vector;
    const axis = Number(target.dataset.axis);
    const vector = [...object[property]];
    vector[axis] = Number(target.value);
    store.updateObject(object.id, { [property]: vector });
  }
});

elements.objectColor.addEventListener("input", () => {
  const object = selectedObject();
  if (!object) return;
  elements.objectColorText.textContent = elements.objectColor.value.toUpperCase();
  store.updateObject(object.id, { color: elements.objectColor.value }, { history: false });
});

elements.objectColor.addEventListener("change", () => store.checkpoint());

elements.objectName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    elements.objectName.blur();
  }
});

elements.entityState.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    elements.entityState.blur();
  }
});

elements.projectName.addEventListener("change", () => store.setProjectName(elements.projectName.value));
elements.projectName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    elements.projectName.blur();
  }
});

elements.undo.addEventListener("click", () => store.undo());
elements.redo.addEventListener("click", () => store.redo());
elements.duplicate.addEventListener("click", () => {
  if (store.duplicateObject()) showToast("已创建独立副本");
});
elements.delete.addEventListener("click", () => {
  if (store.deleteObject()) showToast("物体已删除，可使用撤销恢复");
  else showToast("该物体已锁定，请先解锁");
});

const safeFilename = (name) => name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "blockout-scene";

const saveProject = () => {
  const json = serializeProject(currentState.project);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(currentState.project.name)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("项目 JSON 已保存");
};

elements.save.addEventListener("click", saveProject);
elements.load.addEventListener("click", () => elements.file.click());
elements.file.addEventListener("change", async () => {
  const file = elements.file.files?.[0];
  if (!file) return;
  try {
    setDirectorMode("edit");
    runtime?.stop();
    store.replaceProject(ensureInitialTimeline(parseProject(await file.text())));
    editor.setCameraPreset("perspective");
    showToast(`已载入“${store.getState().project.name}”`);
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.file.value = "";
  }
});

elements.moreMenuButton.addEventListener("click", () => {
  const willOpen = elements.projectMenu.hidden;
  elements.projectMenu.hidden = !willOpen;
  elements.moreMenuButton.setAttribute("aria-expanded", String(willOpen));
});

document.addEventListener("pointerdown", (event) => {
  if (elements.projectMenu.hidden) return;
  if (!elements.projectMenu.contains(event.target) && event.target !== elements.moreMenuButton) {
    elements.projectMenu.hidden = true;
    elements.moreMenuButton.setAttribute("aria-expanded", "false");
  }
});

elements.newProject.addEventListener("click", () => {
  elements.projectMenu.hidden = true;
  setDirectorMode("edit");
  runtime?.stop();
  store.replaceProject(createEmptyProject());
  editor.setCameraPreset("perspective");
  showToast("已创建空场景");
});

elements.loadDemo.addEventListener("click", () => {
  elements.projectMenu.hidden = true;
  setDirectorMode("edit");
  runtime?.stop();
  store.replaceProject(ensureInitialTimeline(createStarterProject()));
  editor.setCameraPreset("perspective");
  showToast("示例灰模已恢复");
});

elements.loadInteractionDemo.addEventListener("click", () => {
  elements.projectMenu.hidden = true;
  elements.moreMenuButton.setAttribute("aria-expanded", "false");
  setDirectorMode("edit");
  runtime?.stop();
  store.replaceProject(createInteractionDemoProject());
  editor.setCameraPreset("perspective");
  setLibraryMode("screenplay");
  setDirectorMode("preview");
  runtime?.seek(0);
  showToast("已载入十秒交互仿真：走近、抓取、交接、放置");
});

const closeDrawers = () => {
  elements.workspace.classList.remove("is-library-open", "is-inspector-open");
  elements.libraryToggle.setAttribute("aria-expanded", "false");
  elements.inspectorToggle.setAttribute("aria-expanded", "false");
  elements.scrim.hidden = true;
};

const toggleDrawer = (name) => {
  const className = name === "library" ? "is-library-open" : "is-inspector-open";
  const otherClass = name === "library" ? "is-inspector-open" : "is-library-open";
  const opening = !elements.workspace.classList.contains(className);
  elements.workspace.classList.remove(otherClass);
  elements.workspace.classList.toggle(className, opening);
  elements.libraryToggle.setAttribute("aria-expanded", String(name === "library" && opening));
  elements.inspectorToggle.setAttribute("aria-expanded", String(name === "inspector" && opening));
  elements.scrim.hidden = !opening;
};

elements.libraryToggle.addEventListener("click", () => toggleDrawer("library"));
elements.inspectorToggle.addEventListener("click", () => toggleDrawer("inspector"));
elements.scrim.addEventListener("click", closeDrawers);
window.addEventListener("resize", () => {
  closeDrawers();
});

document.addEventListener("keydown", (event) => {
  const isEditing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  const modifier = event.ctrlKey || event.metaKey;
  const isCp02Control = event.target instanceof Element && Boolean(event.target.closest("#cp02-panel"));

  if (isCp02Case && isCp02Control) return;
  if (isCp02Case) {
    event.preventDefault();
    return;
  }

  if (modifier && event.key.toLowerCase() === "z" && directorMode === "edit") {
    event.preventDefault();
    event.shiftKey ? store.redo() : store.undo();
    return;
  }
  if (modifier && event.key.toLowerCase() === "y" && directorMode === "edit") {
    event.preventDefault();
    store.redo();
    return;
  }
  if (modifier && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveProject();
    return;
  }
  if (event.key === "Escape" && directorMode === "preview") {
    event.preventDefault();
    setDirectorMode("edit");
    return;
  }
  if (event.key === "Escape" && !elements.cameraEditorPanel.hidden) {
    event.preventDefault();
    closeCameraEditor();
    return;
  }
  if (modifier && event.key.toLowerCase() === "d" && !isEditing && directorMode === "edit") {
    event.preventDefault();
    store.duplicateObject();
    return;
  }
  if (isEditing) return;

  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
    return;
  }

  if (directorMode === "preview") return;

  const toolKeys = { w: "translate", e: "rotate", r: "scale" };
  if (toolKeys[event.key.toLowerCase()]) store.setTool(toolKeys[event.key.toLowerCase()]);
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    if (!store.deleteObject() && selectedObject()?.locked) showToast("该物体已锁定，请先解锁");
  }
  if (event.key === "Escape") {
    store.setSelection(null);
    closeDrawers();
  }
});

window.addEventListener("beforeunload", () => {
  runtime?.dispose();
  editor.dispose();
}, { once: true });

setupCp02Case();
editor.setCameraPreset("perspective");
