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
  evaluateTimeline,
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
  AGENT_BEHAVIOR_CONTRACT,
  buildAgentObservation,
  compileAgentBehaviorCommand,
  decideCp02ReframeIntent,
  runAgentBehaviorTurn,
  runSceneCompositionTurn,
} from "./agent-runtime.js";
import {
  RIG_SLOT_DEFINITIONS,
  autoMapRigBones,
  evaluateRigMapping,
} from "./character-rig.js";
import {
  applyScenePatch,
  hashProject,
  undoScenePatch,
} from "./scene-patch-runtime.js";
import { loadCasePack } from "./case-pack-runtime.js";
import { ProjectPersistence, utf8ByteLength } from "./project-persistence.js";
import {
  createPortableProjectPackage,
  filesForPortableBinding,
  importPortableProjectPackage,
  persistPortableFile,
  persistPortableFiles,
} from "./portable-project-package.js";
import {
  browserDepthEstimator,
  buildReliefMeshData,
  depthRasterToRgba,
  exportRiggedReliefGlb,
  moveRigDraftJoint,
  prepareSingleImageFile,
  serializeReliefObj,
  serializeRigDraft,
} from "./single-image-3d-runtime.js";
import {
  CANONICAL_VIEW_DEFINITIONS,
  buildVisualHullMeshData,
  deriveSilhouetteMask,
  parseMultiViewRecipe,
  serializeMultiViewRecipe,
  serializeVisualHullObj,
  silhouetteMaskToRgba,
  validateCanonicalViews,
} from "./multi-view-gray-runtime.js";
import {
  RIG_PRESET_OPTIONS,
  addRigJoint,
  createRigDraft,
  mirrorRigJoint,
  normalizeRigDraft,
  removeRigJoint,
  reparentRigJoint,
  rigProfileFromDraft,
  updateRigJoint,
  validateRigDraft,
} from "./universal-rig-runtime.js";
import {
  applyGuardedInteractionPlan,
  compileGuardedInteractionPlan,
} from "./cp03/capability-gate.js";
import {
  buildLocalScriptedProposal,
  createCp03EncounterProject,
  createLocalEngineeringArchive,
  createLocalViewerApproval,
} from "./cp03/audience-runtime.js";
import cp02AssetCatalog from "../projects/window-case-cp02/asset-catalog.json";
import cp02SceneSlots from "../projects/window-case-cp02/scene-slots.json";

const STORAGE_KEY = "blockout-studio.project.v3";
const LEGACY_STORAGE_KEY_V2 = "blockout-studio.project.v2";
const LEGACY_STORAGE_KEY = "blockout-studio.project.v1";
const LOCAL_STORAGE_AUTOSAVE_LIMIT = 3_500_000;
const searchParams = new URLSearchParams(window.location.search);
const isCp02Case = searchParams.get("case") === "pact-cp02";
const isCp03Case = searchParams.get("case") === "pact-cp03";
const projectPersistence = new ProjectPersistence();
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

const restoreProject = async () => {
  if (isCp02Case) return createEmptyProject("PACT CP02 · 正在载入本地场景");
  if (isCp03Case) return createCp03EncounterProject();
  let saved = null;
  try {
    saved = (await projectPersistence.loadSnapshot(STORAGE_KEY))?.json ?? null;
  } catch (error) {
    console.warn("IndexedDB 恢复库不可用，尝试旧版本地保存。", error);
  }
  saved ??= localStorage.getItem(STORAGE_KEY)
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

const store = new SceneStore(ensureInitialTimeline(await restoreProject()));
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
  savePortable: $("#save-portable-project"),
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
  physicsRuntimeStatus: $("#physics-runtime-status"),
  openMultiViewGray: $("#open-multi-view-gray"),
  openSingleImage3d: $("#open-single-image-3d"),
  chooseAssetFile: $("#choose-asset-file"),
  chooseAnimationFile: $("#choose-animation-file"),
  chooseSpatialBridge: $("#choose-spatial-bridge"),
  chooseSpatialFiles: $("#choose-spatial-files"),
  clearAssetFile: $("#clear-asset-file"),
  assetFile: $("#asset-file"),
  animationFile: $("#animation-file"),
  spatialBridgeFolder: $("#spatial-bridge-folder"),
  spatialBridgeFiles: $("#spatial-bridge-files"),
  assetSessionTitle: $("#asset-session-title"),
  assetSessionDetail: $("#asset-session-detail"),
  assetRuntimeControls: $("#asset-runtime-controls"),
  assetBehaviorState: $("#asset-behavior-state"),
  assetIkState: $("#asset-ik-state"),
  assetActionPreview: $("#asset-action-preview"),
  playAssetAction: $("#play-asset-action"),
  assetExpressionPreview: $("#asset-expression-preview"),
  assetExpressionWeight: $("#asset-expression-weight"),
  assetExpressionOutput: $("#asset-expression-output"),
  clearAssetExpression: $("#clear-asset-expression"),
  openRigMapping: $("#open-rig-mapping"),
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
  cp03Panel: $("#cp03-panel"),
  cp03ViewerInput: $("#cp03-viewer-input"),
  cp03Propose: $("#cp03-propose"),
  cp03TraceSource: $("#cp03-trace-source"),
  cp03PublicTrace: $("#cp03-public-trace"),
  cp03Guardian: $("#cp03-guardian"),
  cp03Outcome: $("#cp03-outcome"),
  cp03DraftHash: $("#cp03-draft-hash"),
  cp03CopyHash: $("#cp03-copy-hash"),
  cp03Receipt: $("#cp03-receipt"),
  cp03Approve: $("#cp03-approve"),
  cp03Reject: $("#cp03-reject"),
  cp03GateStatus: $("#cp03-gate-status"),
  cp03ExportArchive: $("#cp03-export-archive"),
  cp03Reset: $("#cp03-reset"),
  cp03Phase: $("#cp03-phase"),
  rigMappingDialog: $("#rig-mapping-dialog"),
  closeRigMapping: $("#close-rig-mapping"),
  rigMappingSubtitle: $("#rig-mapping-subtitle"),
  rigMappingCoverage: $("#rig-mapping-coverage"),
  rigMappingConfidence: $("#rig-mapping-confidence"),
  rigMappingCapability: $("#rig-mapping-capability"),
  rigMappingSearch: $("#rig-mapping-search"),
  rigMappingWarning: $("#rig-mapping-warning"),
  rigMappingList: $("#rig-mapping-list"),
  resetRigMapping: $("#reset-rig-mapping"),
  autoMapRig: $("#auto-map-rig"),
  saveRigMapping: $("#save-rig-mapping"),
  multiViewDialog: $("#multi-view-gray-dialog"),
  closeMultiViewGray: $("#close-multi-view-gray"),
  multiViewFile: $("#multi-view-file"),
  multiViewCount: $("#multi-view-count"),
  multiViewActiveView: $("#multi-view-active-view"),
  multiViewPreviewMode: $("#multi-view-preview-mode"),
  multiViewThreshold: $("#multi-view-threshold"),
  multiViewThresholdOutput: $("#multi-view-threshold-output"),
  multiViewInvert: $("#multi-view-invert"),
  multiViewMaskStatus: $("#multi-view-mask-status"),
  estimateCurrentMultiViewDepth: $("#estimate-current-multi-view-depth"),
  estimateAllMultiViewDepth: $("#estimate-all-multi-view-depth"),
  multiViewUseDepth: $("#multi-view-use-depth"),
  multiViewDepthInvert: $("#multi-view-depth-invert"),
  multiViewDepthModelStatus: $("#multi-view-depth-model-status"),
  multiViewResolution: $("#multi-view-resolution"),
  multiViewResolutionOutput: $("#multi-view-resolution-output"),
  multiViewPadding: $("#multi-view-padding"),
  multiViewPaddingOutput: $("#multi-view-padding-output"),
  multiViewDepthInfluence: $("#multi-view-depth-influence"),
  multiViewDepthInfluenceOutput: $("#multi-view-depth-influence-output"),
  multiViewDepthTolerance: $("#multi-view-depth-tolerance"),
  multiViewDepthToleranceOutput: $("#multi-view-depth-tolerance-output"),
  buildMultiViewGray: $("#build-multi-view-gray"),
  buildMultiViewBaseline: $("#build-multi-view-baseline"),
  multiViewProgress: $("#multi-view-progress"),
  multiViewProgressText: $("#multi-view-progress-text"),
  multiViewEvidenceSummary: $("#multi-view-evidence-summary"),
  multiViewEvidenceList: $("#multi-view-evidence-list"),
  downloadMultiViewObj: $("#download-multi-view-obj"),
  downloadMultiViewRecipe: $("#download-multi-view-recipe"),
  singleImageDialog: $("#single-image-3d-dialog"),
  closeSingleImage3d: $("#close-single-image-3d"),
  chooseSingleImage: $("#choose-single-image"),
  singleImageFile: $("#single-image-file"),
  singleImageSize: $("#single-image-size"),
  singleImageSourceCanvas: $("#single-image-source-canvas"),
  singleImageSourceEmpty: $("#single-image-source-empty"),
  singleImageDepthCanvas: $("#single-image-depth-canvas"),
  singleImageDepthEmpty: $("#single-image-depth-empty"),
  singleImageModelStatus: $("#single-image-model-status"),
  singleImageDepthInvert: $("#single-image-depth-invert"),
  estimateSingleImageDepth: $("#estimate-single-image-depth"),
  singleImageProgress: $("#single-image-progress"),
  singleImageProgressText: $("#single-image-progress-text"),
  singleImageResolution: $("#single-image-resolution"),
  singleImageResolutionOutput: $("#single-image-resolution-output"),
  singleImageDepthStrength: $("#single-image-depth-strength"),
  singleImageDepthStrengthOutput: $("#single-image-depth-strength-output"),
  singleImageEdgeThreshold: $("#single-image-edge-threshold"),
  singleImageEdgeThresholdOutput: $("#single-image-edge-threshold-output"),
  buildSingleImageObj: $("#build-single-image-obj"),
  downloadSingleImageObj: $("#download-single-image-obj"),
  buildSingleImageGlb: $("#build-single-image-glb"),
  downloadSingleImageGlb: $("#download-single-image-glb"),
  singleImageRigPreset: $("#single-image-rig-preset"),
  singleImageRigSummary: $("#single-image-rig-summary"),
  singleImageRigJoint: $("#single-image-rig-joint"),
  singleImageAddJoint: $("#single-image-add-joint"),
  singleImageMirrorJoint: $("#single-image-mirror-joint"),
  singleImageDeleteJoint: $("#single-image-delete-joint"),
  singleImageJointName: $("#single-image-joint-name"),
  singleImageJointParent: $("#single-image-joint-parent"),
  singleImageJointRole: $("#single-image-joint-role"),
  singleImageJointChain: $("#single-image-joint-chain"),
  singleImageJointSide: $("#single-image-joint-side"),
  singleImageJointAxis: $("#single-image-joint-axis"),
  singleImageJointEffector: $("#single-image-joint-effector"),
  singleImageJointMin: $("#single-image-joint-min"),
  singleImageJointMax: $("#single-image-joint-max"),
  singleImageJointDepth: $("#single-image-joint-depth"),
  singleImageRigCapabilities: $("#single-image-rig-capabilities"),
  singleImageRigValidation: $("#single-image-rig-validation"),
  toast: $("#toast"),
};

let currentState = store.getState();
let autosaveTimer = 0;
let autosaveRevision = 0;
let autosaveWrite = Promise.resolve();
let toastTimer = 0;
let libraryMode = "build";
let inspectorMode = "transform";
let directorMode = "edit";
let currentFrame = null;
let latestPhysicsReport = { status: "IDLE", backend: "deterministic-kinematic" };
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
const rigMappingSession = {
  objectId: null,
  sourceName: null,
  boneNames: [],
  saved: {},
  savedSources: {},
  draft: {},
  sources: {},
};
const singleImage3dSession = {
  objectId: null,
  image: null,
  depth: null,
  mesh: null,
  rig: createRigDraft(),
  objFile: null,
  glbFile: null,
  busy: false,
  dragSlot: null,
  selectedSlot: "root",
  progress: 0,
  progressText: "选择图片后开始。",
};
const multiViewGraySession = {
  objectId: null,
  views: {},
  activeViewId: null,
  previewMode: "mask",
  pendingViewId: null,
  mesh: null,
  objFile: null,
  recipeFile: null,
  busy: false,
  progress: 0,
  progressText: "等待正面与侧面。",
  traceStartedAt: performance.now(),
  trace: [],
};

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

const cp03Session = {
  selectedAction: "Translate",
  ordinal: 0,
  busy: false,
  outcome: "READY",
  phase: "本地演练已就绪；尚未调用任何外部模型。",
  gateStatus: "等待提案",
  currentProposal: null,
  proposals: [],
  approvals: [],
  receipts: [],
  effects: [],
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

const rigDefinitionBySlot = new Map(RIG_SLOT_DEFINITIONS.map((definition) => [definition.slot, definition]));

const renderRigMappingEditor = () => {
  if (!rigMappingSession.objectId) return;
  const report = editor.assetReport(rigMappingSession.objectId);
  if (!report) return;
  const diagnostics = evaluateRigMapping(rigMappingSession.draft, rigMappingSession.boneNames, {
    sources: rigMappingSession.sources,
  });
  elements.rigMappingCoverage.textContent = `${diagnostics.mappedCount} / ${diagnostics.slots.length}`;
  elements.rigMappingConfidence.textContent = `${Math.round(diagnostics.overallConfidence * 100)}%`;
  elements.rigMappingCapability.textContent = diagnostics.valid ? "可用" : "降级";
  elements.rigMappingCapability.dataset.status = diagnostics.valid ? "ready" : "warning";
  elements.rigMappingCapability.title = diagnostics.valid
    ? "双手、双脚与头颈所需骨骼已映射；运行时可启用全身约束。"
    : "补齐黄色提示中的必需骨骼，并消除重复映射后即可启用完整全身 IK。";
  elements.saveRigMapping.disabled = diagnostics.duplicateBones.length > 0;
  if (diagnostics.duplicateBones.length) {
    elements.rigMappingWarning.dataset.status = "warning";
    elements.rigMappingWarning.textContent = `同一骨骼不能占用多个槽位：${diagnostics.duplicateBones.map((entry) => entry.boneName).join("、")}。`;
  } else if (diagnostics.missingRequired.length) {
    elements.rigMappingWarning.dataset.status = "warning";
    elements.rigMappingWarning.textContent = `缺少 ${diagnostics.missingRequired.map((slot) => rigDefinitionBySlot.get(slot)?.label ?? slot).join("、")}；可以保存，但对应 IK 会保持降级。`;
  } else {
    elements.rigMappingWarning.dataset.status = "ready";
    elements.rigMappingWarning.textContent = "必需骨骼映射完整；双手、双脚与头颈约束可由运行时接管。";
  }

  const query = elements.rigMappingSearch.value.trim().toLowerCase();
  const visibleSlots = diagnostics.slots.filter((slot) => [
    slot.slot,
    slot.label,
    slot.group,
    slot.boneName,
  ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  elements.rigMappingList.replaceChildren();
  let currentGroup = null;
  for (const slot of visibleSlots) {
    if (slot.group !== currentGroup) {
      currentGroup = slot.group;
      const heading = document.createElement("h3");
      heading.className = "rig-mapping-group-title";
      heading.textContent = currentGroup;
      elements.rigMappingList.appendChild(heading);
    }
    const row = document.createElement("label");
    row.className = "rig-mapping-row";
    row.dataset.slot = slot.slot;
    row.dataset.status = slot.duplicate ? "duplicate" : slot.boneName ? "mapped" : "missing";
    const label = document.createElement("span");
    label.className = "rig-mapping-label";
    const strong = document.createElement("strong");
    strong.textContent = slot.label;
    const small = document.createElement("small");
    small.textContent = `${slot.slot}${slot.required ? " · 必需" : " · 可选"}`;
    label.append(strong, small);
    const select = document.createElement("select");
    select.className = "field-control";
    select.setAttribute("aria-label", `${slot.label}骨骼`);
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "— 未映射 —";
    select.appendChild(empty);
    for (const boneName of rigMappingSession.boneNames) {
      const option = document.createElement("option");
      option.value = boneName;
      option.textContent = boneName;
      select.appendChild(option);
    }
    select.value = slot.boneName ?? "";
    select.addEventListener("change", () => {
      rigMappingSession.draft[slot.slot] = select.value || null;
      rigMappingSession.sources[slot.slot] = select.value ? "manual" : "unmapped";
      renderRigMappingEditor();
    });
    const confidence = document.createElement("span");
    confidence.className = "rig-mapping-confidence";
    confidence.textContent = slot.boneName ? `${Math.round(slot.confidence * 100)}%` : "缺失";
    row.append(label, select, confidence);
    elements.rigMappingList.appendChild(row);
  }
  if (!visibleSlots.length) {
    const empty = document.createElement("p");
    empty.className = "rig-mapping-warning";
    empty.textContent = "没有匹配的语义槽位或骨骼名称。";
    elements.rigMappingList.appendChild(empty);
  }
};

const restoreSavedRigRuntime = () => {
  if (!rigMappingSession.objectId) return;
  editor.setAssetRigBindings(rigMappingSession.objectId, rigMappingSession.saved);
  editor.previewAssetRig(rigMappingSession.objectId, "reset");
};

const openRigMappingEditor = () => {
  const object = selectedObject();
  const report = object ? editor.assetReport(object.id) : null;
  if (!object || !report?.capabilities.skeleton || !report.boneNames.length) {
    showToast("请先选择并导入带蒙皮骨架的 GLB 角色");
    return;
  }
  rigMappingSession.objectId = object.id;
  rigMappingSession.sourceName = report.sourceName;
  rigMappingSession.boneNames = [...report.boneNames].sort((left, right) => left.localeCompare(right));
  rigMappingSession.saved = Object.fromEntries(RIG_SLOT_DEFINITIONS.map(({ slot }) => [slot, report.bones[slot] ?? null]));
  rigMappingSession.savedSources = { ...report.boneSources };
  rigMappingSession.draft = { ...rigMappingSession.saved };
  rigMappingSession.sources = { ...rigMappingSession.savedSources };
  elements.rigMappingSubtitle.textContent = `${object.name} · ${report.sourceName} · ${report.boneCount} 根骨骼`;
  elements.rigMappingSearch.value = "";
  document.querySelectorAll("[data-rig-test][aria-pressed]").forEach((button) => button.setAttribute("aria-pressed", "false"));
  renderRigMappingEditor();
  if (!elements.rigMappingDialog.open) elements.rigMappingDialog.showModal();
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

const clampUi = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const generatedFilename = (value, suffix) => {
  const base = String(value ?? "single-image")
    .replace(/\.[^.]+$/u, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/gu, "-")
    .trim()
    .slice(0, 96) || "single-image";
  return `${base}${suffix}`;
};

const fileFromBlob = (blob, name, type = blob.type || "application/octet-stream") => new File(
  [blob],
  name,
  { type },
);

const downloadBrowserFile = (file) => {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
};

const drawPixelBuffer = (canvas, pixels, width, height) => {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  return context;
};

const drawSingleImageRig = (context, rig, width, height, activeSlot = null) => {
  const bySlot = new Map(rig.joints.map((joint) => [joint.slot, joint]));
  const point = (joint) => [joint.u * width, joint.v * height];
  const scale = Math.max(1, Math.min(width, height) / 520);
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const joint of rig.joints) {
    const parent = joint.parent ? bySlot.get(joint.parent) : null;
    if (!parent) continue;
    const [x1, y1] = point(parent);
    const [x2, y2] = point(joint);
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.lineWidth = 5 * scale;
    context.strokeStyle = "rgba(2, 8, 10, .78)";
    context.stroke();
    context.lineWidth = 2 * scale;
    context.strokeStyle = "rgba(112, 239, 232, .94)";
    context.stroke();
  }
  for (const joint of rig.joints) {
    const [x, y] = point(joint);
    const active = joint.slot === activeSlot;
    context.beginPath();
    context.arc(x, y, (active ? 6 : 4) * scale, 0, Math.PI * 2);
    context.fillStyle = active ? "#f5c66d" : "#8ff3ee";
    context.fill();
    context.lineWidth = 2 * scale;
    context.strokeStyle = "rgba(2, 8, 10, .86)";
    context.stroke();
    if (active) {
      context.font = `${Math.max(10, 10 * scale)}px ui-monospace, monospace`;
      context.fillStyle = "#fff3d2";
      context.fillText(joint.name, x + 8 * scale, y - 8 * scale);
    }
  }
  context.restore();
};

const replaceSelectOptions = (select, options, value) => {
  select.replaceChildren(...options.map((option) => {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    return node;
  }));
  if (options.some((option) => option.value === value)) select.value = value;
};

const selectedSingleImageJoint = () => {
  const session = singleImage3dSession;
  const selected = session.rig.joints.find((joint) => joint.slot === session.selectedSlot);
  if (selected) return selected;
  session.selectedSlot = session.rig.joints[0]?.slot ?? null;
  return session.rig.joints[0] ?? null;
};

const isSingleImageRigDescendant = (candidateSlot, ancestorSlot) => {
  const bySlot = new Map(singleImage3dSession.rig.joints.map((joint) => [joint.slot, joint]));
  const visited = new Set();
  let cursor = bySlot.get(candidateSlot);
  while (cursor?.parent && !visited.has(cursor.slot)) {
    if (cursor.parent === ancestorSlot) return true;
    visited.add(cursor.slot);
    cursor = bySlot.get(cursor.parent);
  }
  return false;
};

const renderSingleImageRigControls = () => {
  const session = singleImage3dSession;
  const profile = rigProfileFromDraft(session.rig);
  const validation = validateRigDraft(session.rig);
  const preset = RIG_PRESET_OPTIONS.find((entry) => entry.id === session.rig.preset);
  const selected = selectedSingleImageJoint();
  elements.singleImageRigPreset.value = session.rig.preset;
  elements.singleImageRigSummary.textContent = [
    preset?.description ?? session.rig.family,
    `${profile.jointCount} 骨 · ${profile.chains.length} 条运动链`,
    preset?.recommendedView ? `建议图像：${preset.recommendedView}` : null,
    session.rig.topologyCustomized ? "已自定义拓扑" : "预设拓扑",
  ].filter(Boolean).join(" · ");
  replaceSelectOptions(
    elements.singleImageRigJoint,
    session.rig.joints.map((joint) => ({ value: joint.slot, label: `${joint.name} · ${joint.role}` })),
    selected?.slot,
  );
  replaceSelectOptions(
    elements.singleImageJointParent,
    [
      { value: "", label: "— 根骨骼 —" },
      ...session.rig.joints
        .filter((joint) => joint.slot !== selected?.slot && !isSingleImageRigDescendant(joint.slot, selected?.slot))
        .map((joint) => ({ value: joint.slot, label: joint.name })),
    ],
    selected?.parent ?? "",
  );
  elements.singleImageJointName.value = selected?.name ?? "";
  elements.singleImageJointRole.value = selected?.role ?? "";
  elements.singleImageJointChain.value = selected?.chain ?? "";
  elements.singleImageJointSide.value = selected?.side ?? "none";
  elements.singleImageJointAxis.value = selected?.limits?.axis ?? "free";
  elements.singleImageJointEffector.checked = selected?.effector === true;
  elements.singleImageJointMin.value = String(selected?.limits?.minDegrees ?? -180);
  elements.singleImageJointMax.value = String(selected?.limits?.maxDegrees ?? 180);
  elements.singleImageJointDepth.value = String(selected?.depthOffset ?? 0);
  elements.singleImageRigCapabilities.replaceChildren(...profile.capabilities.map((capability) => {
    const chip = document.createElement("span");
    chip.textContent = capability;
    return chip;
  }));
  elements.singleImageRigValidation.dataset.state = validation.valid ? "valid" : "error";
  elements.singleImageRigValidation.textContent = validation.valid
    ? `拓扑有效 · ${validation.rootSlots.length} 根 · ${validation.effectorCount} 个 IK 末端${validation.warnings.length ? ` · ${validation.warnings.join("；")}` : ""}`
    : `无法导出：${validation.errors.join("；")}`;
  for (const control of [
    elements.singleImageRigPreset,
    elements.singleImageRigJoint,
    elements.singleImageAddJoint,
    elements.singleImageMirrorJoint,
    elements.singleImageDeleteJoint,
    elements.singleImageJointName,
    elements.singleImageJointParent,
    elements.singleImageJointRole,
    elements.singleImageJointChain,
    elements.singleImageJointSide,
    elements.singleImageJointAxis,
    elements.singleImageJointEffector,
    elements.singleImageJointMin,
    elements.singleImageJointMax,
    elements.singleImageJointDepth,
  ]) control.disabled = session.busy || !selected;
  elements.singleImageDeleteJoint.disabled = session.busy || session.rig.joints.length <= 1 || !selected;
  elements.buildSingleImageGlb.disabled = session.busy || !session.mesh || !validation.valid;
};

const invalidateSingleImageMesh = () => {
  singleImage3dSession.mesh = null;
  singleImage3dSession.objFile = null;
  singleImage3dSession.glbFile = null;
};

const renderSingleImage3d = () => {
  const session = singleImage3dSession;
  const image = session.image;
  elements.singleImageSourceCanvas.hidden = !image;
  elements.singleImageSourceEmpty.hidden = Boolean(image);
  elements.singleImageSize.textContent = image
    ? `${image.width} × ${image.height}${image.originalSize.join("×") !== `${image.width}×${image.height}` ? ` · 原图 ${image.originalSize.join("×")}` : ""}`
    : "尚未导入";
  if (image) {
    const context = drawPixelBuffer(elements.singleImageSourceCanvas, image.pixels, image.width, image.height);
    drawSingleImageRig(context, session.rig, image.width, image.height, session.dragSlot ?? session.selectedSlot);
  }

  elements.singleImageDepthCanvas.hidden = !session.depth;
  elements.singleImageDepthEmpty.hidden = Boolean(session.depth);
  if (session.depth) {
    drawPixelBuffer(
      elements.singleImageDepthCanvas,
      depthRasterToRgba(session.depth),
      session.depth.width,
      session.depth.height,
    );
  }

  const runtimeStatus = browserDepthEstimator.status();
  elements.singleImageModelStatus.textContent = session.depth
    ? `${session.depth.backend.toUpperCase()} · ${session.depth.modelId.split("/").at(-1)}`
    : runtimeStatus.state === "ready"
      ? `${runtimeStatus.backend.toUpperCase()} · 模型已缓存到本次会话`
      : runtimeStatus.state === "loading"
        ? "正在载入 Depth Anything V2"
        : "首次运行需下载约 20–30 MB 模型权重";
  elements.singleImageProgress.hidden = !session.busy;
  elements.singleImageProgress.value = clampUi(Number(session.progress) || 0, 0, 100);
  elements.singleImageProgressText.textContent = session.progressText;
  elements.singleImageResolutionOutput.textContent = elements.singleImageResolution.value;
  elements.singleImageDepthStrengthOutput.textContent = Number(elements.singleImageDepthStrength.value).toFixed(2);
  elements.singleImageEdgeThresholdOutput.textContent = Number(elements.singleImageEdgeThreshold.value).toFixed(2);

  elements.chooseSingleImage.disabled = session.busy;
  elements.estimateSingleImageDepth.disabled = session.busy || !image;
  elements.singleImageDepthInvert.disabled = session.busy || !image;
  elements.buildSingleImageObj.disabled = session.busy || !session.depth;
  elements.downloadSingleImageObj.disabled = session.busy || !session.objFile;
  elements.downloadSingleImageGlb.disabled = session.busy || !session.glbFile;
  for (const control of [
    elements.singleImageResolution,
    elements.singleImageDepthStrength,
    elements.singleImageEdgeThreshold,
  ]) control.disabled = session.busy || !session.depth;
  renderSingleImageRigControls();
};

const depthPngFileForSession = async () => {
  const { depth, image } = singleImage3dSession;
  if (!depth || !image) throw new Error("请先生成深度图。");
  const canvas = document.createElement("canvas");
  drawPixelBuffer(canvas, depthRasterToRgba(depth), depth.width, depth.height);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(
    (result) => result ? resolve(result) : reject(new Error("深度 PNG 编码失败。")),
    "image/png",
  ));
  return fileFromBlob(blob, generatedFilename(image.sourceName, "-depth.png"), "image/png");
};

const restoreSingleImageRecipe = async (object) => {
  const binding = object?.asset?.portable;
  if (binding?.kind !== "single-image-model") return false;
  const descriptors = await filesForPortableBinding(projectPersistence, binding);
  const sourceFile = descriptors.find((entry) => entry.role === "rgb")?.file;
  const depthFile = descriptors.find((entry) => entry.role === "depth")?.file;
  const rigFile = descriptors.find((entry) => entry.role === "rig")?.file;
  const modelFile = descriptors.find((entry) => entry.role === "model")?.file;
  if (!sourceFile || !depthFile || !rigFile || !modelFile) throw new Error("单图生成配方缺少必要工件。");
  const [image, depthImage, rigDocument] = await Promise.all([
    prepareSingleImageFile(sourceFile, { maxEdge: 2_048 }),
    prepareSingleImageFile(depthFile, { maxEdge: 2_048 }),
    rigFile.text().then((text) => JSON.parse(text)),
  ]);
  if (image.width !== depthImage.width || image.height !== depthImage.height) {
    throw new Error("已保存的单图 RGB 与深度 PNG 尺寸不一致。");
  }
  const values = new Float32Array(image.width * image.height);
  let mean = 0;
  for (let index = 0; index < values.length; index += 1) {
    const offset = index * 4;
    const value = (
      depthImage.pixels[offset] * 0.2126
      + depthImage.pixels[offset + 1] * 0.7152
      + depthImage.pixels[offset + 2] * 0.0722
    ) / 255;
    values[index] = value;
    mean += value;
  }
  image.sourceName = String(rigDocument?.source?.label ?? image.sourceName).slice(0, 80) || image.sourceName;
  singleImage3dSession.image = image;
  singleImage3dSession.depth = {
    width: image.width,
    height: image.height,
    depth: values,
    mean: mean / values.length,
    range: [0, 1],
    inverted: false,
    backend: String(rigDocument?.source?.depthBackend ?? "restored-package"),
    modelId: String(rigDocument?.source?.depthModel ?? "restored/relative-depth"),
    dtype: "uint8-preview",
  };
  singleImage3dSession.rig = normalizeRigDraft(rigDocument);
  singleImage3dSession.selectedSlot = singleImage3dSession.rig.joints[0]?.slot ?? null;
  const settings = rigDocument?.mesh?.settings ?? {};
  elements.singleImageResolution.value = String(settings.resolution ?? 96);
  elements.singleImageDepthStrength.value = String(settings.depthStrength ?? 0.35);
  elements.singleImageEdgeThreshold.value = String(settings.edgeThreshold ?? 0.28);
  singleImage3dSession.mesh = buildReliefMeshData({
    rgbPixels: image.pixels,
    depth: values,
    width: image.width,
    height: image.height,
    resolution: Number(elements.singleImageResolution.value),
    depthStrength: Number(elements.singleImageDepthStrength.value),
    edgeThreshold: Number(elements.singleImageEdgeThreshold.value),
    alphaCutoff: settings.alphaCutoff,
  });
  singleImage3dSession.objFile = /\.obj$/iu.test(modelFile.name) ? modelFile : null;
  singleImage3dSession.glbFile = /\.glb$/iu.test(modelFile.name) ? modelFile : null;
  singleImage3dSession.progress = 100;
  singleImage3dSession.progressText = `已从内容库恢复单图、深度、${singleImage3dSession.rig.joints.length} 个关节点与网格参数。`;
  return true;
};

const persistSingleImageModel = async (object, modelFile, { appliedRig = false } = {}) => {
  const session = singleImage3dSession;
  const sourceFile = fileFromBlob(
    session.image.blob,
    generatedFilename(session.image.sourceName, "-source.png"),
    "image/png",
  );
  const depthFile = await depthPngFileForSession();
  const rigJson = serializeRigDraft(session.rig, session.mesh, {
    label: session.image.sourceName,
    depthModel: session.depth.modelId,
    depthBackend: session.depth.backend,
    appliedToModel: appliedRig,
  });
  const rigFile = new File(
    [rigJson],
    generatedFilename(session.image.sourceName, "-rig.json"),
    { type: "application/json" },
  );
  const portable = await persistPortableFiles(projectPersistence, "single-image-model", [
    { role: "model", file: modelFile },
    { role: "rgb", file: sourceFile },
    { role: "depth", file: depthFile },
    { role: "rig", file: rigFile },
  ]);
  const latest = store.getState().project.objects.find((candidate) => candidate.id === object.id);
  if (!latest) throw new Error("生成模型后目标物体已被移除。");
  const mapping = Object.fromEntries(session.rig.joints.map((joint) => [joint.slot, joint.name]));
  const rigProfile = rigProfileFromDraft(session.rig);
  if (appliedRig) editor.setAssetRigBindings(object.id, mapping, rigProfile);
  store.updateObject(object.id, {
    asset: {
      scale: latest.asset?.scale ?? 1,
      forwardAxis: latest.asset?.forwardAxis ?? "-Z",
      nodes: {},
      animations: {},
      bones: appliedRig ? mapping : {},
      expressions: {},
      rigProfile,
      portable,
    },
  });
  return portable;
};

const multiViewRuntimeViews = () => CANONICAL_VIEW_DEFINITIONS
  .map(({ id }) => multiViewGraySession.views[id])
  .filter(Boolean)
  .map((entry) => ({
    id: entry.id,
    sourceName: entry.image.sourceName,
    originalSize: entry.image.originalSize,
    depth: entry.depth ?? null,
    depthEnabled: entry.depthEnabled !== false,
    ...entry.silhouette,
  }));

const resetMultiViewGraySession = (objectId = null) => {
  multiViewGraySession.objectId = objectId;
  multiViewGraySession.views = {};
  multiViewGraySession.activeViewId = null;
  multiViewGraySession.previewMode = "mask";
  multiViewGraySession.pendingViewId = null;
  multiViewGraySession.mesh = null;
  multiViewGraySession.objFile = null;
  multiViewGraySession.recipeFile = null;
  multiViewGraySession.busy = false;
  multiViewGraySession.progress = 0;
  multiViewGraySession.progressText = "等待正面与侧面。";
  multiViewGraySession.traceStartedAt = performance.now();
  multiViewGraySession.trace = [];
};

const traceMultiViewAction = (action, details = {}) => {
  const entry = {
    sequence: multiViewGraySession.trace.length + 1,
    elapsedMs: Math.max(0, Math.round(performance.now() - multiViewGraySession.traceStartedAt)),
    action,
    ...details,
  };
  multiViewGraySession.trace.push(entry);
  if (multiViewGraySession.trace.length > 2_000) multiViewGraySession.trace.shift();
  return entry;
};

const invalidateMultiViewGrayModel = (message = "轮廓或网格设置已改变；场景中仍保留上次生成结果。") => {
  multiViewGraySession.mesh = null;
  multiViewGraySession.objFile = null;
  multiViewGraySession.recipeFile = null;
  multiViewGraySession.progress = 0;
  multiViewGraySession.progressText = message;
};

const updateMultiViewSilhouette = (viewId, settings = {}) => {
  const entry = multiViewGraySession.views[viewId];
  if (!entry) return null;
  const silhouette = deriveSilhouetteMask({
    pixels: entry.image.pixels,
    width: entry.image.width,
    height: entry.image.height,
    mode: settings.mode ?? entry.silhouette?.mode ?? "auto",
    threshold: settings.threshold ?? entry.silhouette?.threshold ?? 48,
    alphaCutoff: settings.alphaCutoff ?? entry.silhouette?.alphaCutoff ?? 24,
    invert: settings.invert ?? entry.silhouette?.invert ?? false,
  });
  entry.silhouette = silhouette;
  return silhouette;
};

const multiViewGuidedPairReady = () => {
  try {
    validateCanonicalViews(multiViewRuntimeViews(), { requireGuidedPair: true });
    return true;
  } catch {
    return false;
  }
};

const multiViewDepthPreviewRgba = (entry) => {
  const pixels = depthRasterToRgba(entry.depth);
  if (entry.depth.inverted) {
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const value = 255 - pixels[offset];
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
    }
  }
  return silhouetteMaskToRgba({ pixels, silhouette: entry.silhouette });
};

const multiViewDepthRasterFromPreparedImage = (depthImage, metadata = {}) => {
  const values = new Float32Array(depthImage.width * depthImage.height);
  let mean = 0;
  for (let index = 0; index < values.length; index += 1) {
    const offset = index * 4;
    const value = (
      depthImage.pixels[offset] * 0.2126
      + depthImage.pixels[offset + 1] * 0.7152
      + depthImage.pixels[offset + 2] * 0.0722
    ) / 255;
    values[index] = value;
    mean += value;
  }
  return {
    width: depthImage.width,
    height: depthImage.height,
    depth: values,
    mean: mean / Math.max(1, values.length),
    range: [0, 1],
    inverted: Boolean(metadata.inverted),
    backend: String(metadata.backend ?? "restored-package"),
    modelId: String(metadata.modelId ?? "restored/relative-depth"),
    dtype: String(metadata.dtype ?? "uint8-preview"),
  };
};

const multiViewDepthPngFile = async (entry) => {
  if (!entry?.depth || !entry?.image) throw new Error("该视角没有可保存的相对深度。");
  const canvas = document.createElement("canvas");
  drawPixelBuffer(canvas, depthRasterToRgba(entry.depth), entry.depth.width, entry.depth.height);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(
    (result) => result ? resolve(result) : reject(new Error("多视角深度 PNG 编码失败。")),
    "image/png",
  ));
  return fileFromBlob(
    blob,
    generatedFilename(entry.image.sourceName, `-${entry.id}-depth.png`),
    "image/png",
  );
};

const renderMultiViewGray = () => {
  const session = multiViewGraySession;
  const loaded = CANONICAL_VIEW_DEFINITIONS.filter(({ id }) => session.views[id]);
  const depthLoaded = loaded.filter(({ id }) => session.views[id].depth);
  if (!session.views[session.activeViewId]) session.activeViewId = loaded[0]?.id ?? null;
  elements.multiViewCount.textContent = `${loaded.length} / ${CANONICAL_VIEW_DEFINITIONS.length}`;
  elements.multiViewPreviewMode.value = session.previewMode;

  elements.multiViewActiveView.replaceChildren();
  if (!loaded.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "尚未导入视角";
    elements.multiViewActiveView.append(option);
  } else {
    for (const definition of loaded) {
      const option = document.createElement("option");
      option.value = definition.id;
      option.textContent = `${definition.label} · ${session.views[definition.id].image.sourceName}`;
      elements.multiViewActiveView.append(option);
    }
    elements.multiViewActiveView.value = session.activeViewId;
  }

  for (const definition of CANONICAL_VIEW_DEFINITIONS) {
    const entry = session.views[definition.id];
    const card = document.querySelector(`[data-multi-view-card="${definition.id}"]`);
    const canvas = document.querySelector(`[data-multi-view-canvas="${definition.id}"]`);
    const empty = document.querySelector(`[data-multi-view-empty="${definition.id}"]`);
    const choose = document.querySelector(`[data-multi-view-choose="${definition.id}"]`);
    const clear = document.querySelector(`[data-multi-view-clear="${definition.id}"]`);
    const meta = document.querySelector(`[data-multi-view-meta="${definition.id}"]`);
    card.dataset.ready = String(Boolean(entry));
    card.dataset.active = String(session.activeViewId === definition.id);
    card.dataset.depth = String(Boolean(entry?.depth));
    canvas.hidden = !entry;
    empty.hidden = Boolean(entry);
    choose.disabled = session.busy;
    choose.textContent = entry ? "替换" : "选择";
    clear.hidden = !entry;
    clear.disabled = session.busy;
    if (!entry) {
      meta.textContent = "未导入";
      card.removeAttribute("title");
      continue;
    }
    const previewPixels = session.previewMode === "depth" && entry.depth
      ? multiViewDepthPreviewRgba(entry)
      : silhouetteMaskToRgba({ pixels: entry.image.pixels, silhouette: entry.silhouette });
    drawPixelBuffer(canvas, previewPixels, entry.image.width, entry.image.height);
    const coverage = Math.round(entry.silhouette.coverage * 100);
    const depthLabel = entry.depth
      ? ` · 深度${entry.depthEnabled === false ? "停用" : " ✓"}`
      : "";
    const rejectedVoxels = session.mesh?.depthRejectedVoxelCounts?.[definition.id];
    const rejectionLabel = Number.isFinite(rejectedVoxels)
      ? ` · 拒绝 ${rejectedVoxels.toLocaleString("zh-CN")}`
      : "";
    meta.textContent = `${entry.image.sourceName} · 轮廓 ${coverage}%${depthLabel}${rejectionLabel}`;
    card.title = [
      ...entry.silhouette.warnings,
      ...(entry.depthEnabled === false ? ["这一视角的深度约束已停用。"] : []),
    ].join(" ");
  }

  const active = session.views[session.activeViewId] ?? null;
  elements.multiViewActiveView.disabled = session.busy || !active;
  elements.multiViewPreviewMode.disabled = session.busy || !loaded.length;
  elements.multiViewThreshold.disabled = session.busy || !active || active.silhouette.mode === "alpha";
  elements.multiViewInvert.disabled = session.busy || !active;
  elements.estimateCurrentMultiViewDepth.disabled = session.busy || !active;
  elements.estimateAllMultiViewDepth.disabled = session.busy || !loaded.length;
  elements.multiViewUseDepth.disabled = session.busy || !active?.depth;
  elements.multiViewDepthInvert.disabled = session.busy || !active?.depth;
  elements.multiViewUseDepth.checked = Boolean(active?.depth && active.depthEnabled !== false);
  elements.multiViewDepthInvert.checked = Boolean(active?.depth?.inverted);
  if (active) {
    elements.multiViewThreshold.value = String(active.silhouette.threshold);
    elements.multiViewInvert.checked = active.silhouette.invert;
    const warnings = active.silhouette.warnings;
    elements.multiViewMaskStatus.textContent = warnings.length
      ? `${CANONICAL_VIEW_DEFINITIONS.find((view) => view.id === active.id)?.label}：${warnings.join(" ")}`
      : active.silhouette.mode === "alpha"
        ? `${CANONICAL_VIEW_DEFINITIONS.find((view) => view.id === active.id)?.label}使用透明通道；背景差异阈值不参与这一视角。`
        : `${CANONICAL_VIEW_DEFINITIONS.find((view) => view.id === active.id)?.label}轮廓已提取；粉色边界应贴合物体。`;
    elements.multiViewMaskStatus.dataset.state = warnings.length ? "warning" : "ready";
  } else {
    elements.multiViewThreshold.value = "48";
    elements.multiViewInvert.checked = false;
    elements.multiViewMaskStatus.textContent = "选择图片后，本地轮廓会显示在每张卡片上。";
    elements.multiViewMaskStatus.dataset.state = "";
  }
  const depthRuntime = browserDepthEstimator.status();
  if (active?.depth) {
    elements.multiViewDepthModelStatus.textContent = `${active.depth.backend.toUpperCase()} · ${active.depth.modelId.split("/").at(-1)} · ${depthLoaded.length}/${loaded.length} 视角已有深度`;
    elements.multiViewDepthModelStatus.dataset.state = active.depthEnabled === false ? "warning" : "ready";
  } else if (depthRuntime.state === "ready") {
    elements.multiViewDepthModelStatus.textContent = `${depthRuntime.backend.toUpperCase()} · 模型已缓存；当前视角尚未估算`;
    elements.multiViewDepthModelStatus.dataset.state = "";
  } else if (depthRuntime.state === "loading") {
    elements.multiViewDepthModelStatus.textContent = "正在载入 Depth Anything V2；照片仍在本机处理。";
    elements.multiViewDepthModelStatus.dataset.state = "";
  } else {
    elements.multiViewDepthModelStatus.textContent = "首次运行会下载并缓存约 20–30 MB 模型权重；照片不上传。";
    elements.multiViewDepthModelStatus.dataset.state = "";
  }
  elements.multiViewThresholdOutput.textContent = elements.multiViewThreshold.value;
  elements.multiViewResolutionOutput.textContent = elements.multiViewResolution.value;
  elements.multiViewPaddingOutput.textContent = `${Math.round(Number(elements.multiViewPadding.value) * 100)}%`;
  elements.multiViewDepthInfluenceOutput.textContent = Number(elements.multiViewDepthInfluence.value).toFixed(2);
  elements.multiViewDepthToleranceOutput.textContent = Number(elements.multiViewDepthTolerance.value).toFixed(2);
  const canBuild = multiViewGuidedPairReady();
  const enabledDepthCount = loaded.filter(({ id }) => (
    session.views[id].depth && session.views[id].depthEnabled !== false
  )).length;
  const depthAssisted = enabledDepthCount > 0 && Number(elements.multiViewDepthInfluence.value) > 0;
  elements.buildMultiViewGray.disabled = session.busy || !canBuild || !depthAssisted;
  elements.buildMultiViewBaseline.disabled = session.busy || !canBuild;
  elements.buildMultiViewGray.textContent = depthAssisted
    ? `生成深度辅助灰模（${enabledDepthCount} 视角）`
    : "先估算或启用深度";
  elements.multiViewResolution.disabled = session.busy;
  elements.multiViewPadding.disabled = session.busy;
  elements.multiViewDepthInfluence.disabled = session.busy;
  elements.multiViewDepthTolerance.disabled = session.busy;
  elements.downloadMultiViewObj.disabled = session.busy || !session.objFile;
  elements.downloadMultiViewRecipe.disabled = session.busy || !session.recipeFile;
  elements.multiViewProgress.hidden = !session.busy;
  elements.multiViewProgress.value = clampUi(Number(session.progress) || 0, 0, 100);
  elements.multiViewProgressText.textContent = session.progressText;
  elements.multiViewProgressText.dataset.state = session.objFile ? "ready" : canBuild ? "" : "warning";
  elements.multiViewEvidenceList.replaceChildren();
  const appendEvidence = (label, value) => {
    const item = document.createElement("li");
    const labelNode = document.createElement("span");
    const valueNode = document.createElement("b");
    labelNode.textContent = label;
    valueNode.textContent = value;
    item.append(labelNode, valueNode);
    elements.multiViewEvidenceList.append(item);
  };
  if (!session.mesh) {
    appendEvidence("尚未生成", "构建后显示精确计数");
    elements.multiViewEvidenceSummary.dataset.state = "";
  } else if (!session.mesh.depthViewIds.length) {
    appendEvidence("当前条件", "纯轮廓基线");
    appendEvidence("保留体素", session.mesh.voxelCount.toLocaleString("zh-CN"));
    elements.multiViewEvidenceSummary.dataset.state = "";
  } else {
    appendEvidence("纯轮廓体素", session.mesh.visualHullVoxelCount.toLocaleString("zh-CN"));
    appendEvidence("最终保留体素", session.mesh.voxelCount.toLocaleString("zh-CN"));
    appendEvidence("深度总削减", session.mesh.depthCarvedVoxelCount.toLocaleString("zh-CN"));
    for (const viewId of session.mesh.depthViewIds) {
      const definition = CANONICAL_VIEW_DEFINITIONS.find((view) => view.id === viewId);
      appendEvidence(
        `${definition?.label ?? viewId}拒绝`,
        `${(session.mesh.depthRejectedVoxelCounts[viewId] ?? 0).toLocaleString("zh-CN")} 体素`,
      );
    }
    if (session.mesh.depthConflictVoxelCount > 0) {
      appendEvidence("多视角同时拒绝", `${session.mesh.depthConflictVoxelCount.toLocaleString("zh-CN")} 体素`);
    }
    elements.multiViewEvidenceSummary.dataset.state = session.mesh.depthWarnings.length ? "warning" : "ready";
  }
};

const restoreMultiViewGrayRecipe = async (object) => {
  const binding = object?.asset?.portable;
  if (binding?.kind !== "multi-view-gray-model") return false;
  const descriptors = await filesForPortableBinding(projectPersistence, binding);
  const modelFile = descriptors.find((entry) => entry.role === "model")?.file;
  const recipeFile = descriptors.find((entry) => entry.role === "recipe")?.file;
  if (!modelFile || !recipeFile) throw new Error("多视角灰模缺少模型或配方工件。");
  const recipe = parseMultiViewRecipe(await recipeFile.text());
  const restoredViews = {};
  for (const recipeView of recipe.views) {
    const sourceFile = descriptors.find((entry) => entry.role === recipeView.role)?.file;
    if (!sourceFile) throw new Error(`多视角灰模缺少 ${recipeView.role} 源图。`);
    const image = await prepareSingleImageFile(sourceFile, { maxEdge: 2_048 });
    image.sourceName = recipeView.sourceName;
    const silhouette = deriveSilhouetteMask({
      pixels: image.pixels,
      width: image.width,
      height: image.height,
      mode: recipeView.mode,
      threshold: recipeView.threshold,
      alphaCutoff: recipeView.alphaCutoff,
      invert: recipeView.invert,
    });
    let depth = null;
    if (recipeView.depth) {
      const depthFile = descriptors.find((entry) => entry.role === recipeView.depth.role)?.file;
      if (!depthFile) throw new Error(`多视角灰模缺少 ${recipeView.depth.role} 深度工件。`);
      const depthImage = await prepareSingleImageFile(depthFile, { maxEdge: 2_048 });
      if (depthImage.width !== image.width || depthImage.height !== image.height) {
        throw new Error(`${recipeView.id} 的照片与深度 PNG 尺寸不一致。`);
      }
      depth = multiViewDepthRasterFromPreparedImage(depthImage, recipeView.depth);
    }
    restoredViews[recipeView.id] = {
      id: recipeView.id,
      image,
      silhouette,
      depth,
      depthEnabled: recipeView.depth?.enabled !== false,
    };
  }
  multiViewGraySession.views = restoredViews;
  multiViewGraySession.activeViewId = recipe.views[0]?.id ?? null;
  multiViewGraySession.previewMode = recipe.views.some((view) => view.depth) ? "depth" : "mask";
  elements.multiViewResolution.value = String(recipe.settings.resolution);
  elements.multiViewPadding.value = String(recipe.settings.padding);
  elements.multiViewDepthInfluence.value = String(recipe.settings.depthInfluence);
  elements.multiViewDepthTolerance.value = String(recipe.settings.depthTolerance);
  multiViewGraySession.mesh = buildVisualHullMeshData({
    views: multiViewRuntimeViews(),
    resolution: recipe.settings.resolution,
    padding: recipe.settings.padding,
    depthInfluence: recipe.settings.depthInfluence,
    depthTolerance: recipe.settings.depthTolerance,
  });
  multiViewGraySession.objFile = modelFile;
  multiViewGraySession.recipeFile = recipeFile;
  multiViewGraySession.traceStartedAt = performance.now();
  multiViewGraySession.trace = recipe.interactionTrace;
  multiViewGraySession.progress = 100;
  multiViewGraySession.progressText = `已恢复 ${recipe.views.length} 个规范视角、${multiViewGraySession.mesh.depthViewIds.length} 张有效相对深度与可复现配方。`;
  return true;
};

const persistMultiViewGrayModel = async (object, modelFile, recipeFile) => {
  const viewDescriptors = [];
  for (const view of multiViewRuntimeViews()) {
    const entry = multiViewGraySession.views[view.id];
    viewDescriptors.push({
      role: `view-${view.id}`,
      file: fileFromBlob(
        entry.image.blob,
        generatedFilename(entry.image.sourceName, `-${view.id}.png`),
        "image/png",
      ),
    });
    if (entry.depth) {
      viewDescriptors.push({
        role: `depth-${view.id}`,
        file: await multiViewDepthPngFile(entry),
      });
    }
  }
  const descriptors = [
    { role: "model", file: modelFile },
    { role: "recipe", file: recipeFile },
    ...viewDescriptors,
  ];
  const portable = await persistPortableFiles(projectPersistence, "multi-view-gray-model", descriptors);
  const latest = store.getState().project.objects.find((candidate) => candidate.id === object.id);
  if (!latest) throw new Error("生成灰模后目标物体已被移除。");
  store.updateObject(object.id, {
    asset: {
      scale: latest.asset?.scale ?? 1,
      forwardAxis: latest.asset?.forwardAxis ?? "-Z",
      nodes: {},
      animations: {},
      bones: {},
      expressions: {},
      portable,
    },
  });
  return portable;
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
  const physicsCopy = {
    LOADING: "Rapier WASM 正在载入；载入完成前继续使用确定性运动学后端。",
    READY: `Rapier 60 Hz 已运行 · 重力 ${latestPhysicsReport.gravity?.join(", ") ?? "0, -9.81, 0"} · 动态体 ${latestPhysicsReport.bodyCounts?.dynamic ?? 0}`,
    ERROR: `Rapier 启动失败：${latestPhysicsReport.message ?? "未知错误"}；已保持确定性后端。`,
    DISABLED: "编辑模式不运行刚体；切换到预览后按需载入 Rapier。",
    IDLE: object.entity.physics.bodyType === "dynamic"
      ? "切换到预览后将按需载入 Rapier 60 Hz 重力与刚体碰撞。"
      : "当前物体由静态／运动学权威控制；动态物体存在时预览会按需载入 Rapier。",
  }[latestPhysicsReport.status] ?? "物理运行时等待预览。";
  elements.physicsRuntimeStatus.textContent = physicsCopy;
  const assetReport = editor.assetReport(object.id);
  const spatialReport = assetReport?.spatialBridge ?? null;
  elements.openMultiViewGray.disabled = directorMode === "preview";
  elements.openSingleImage3d.disabled = directorMode === "preview";
  elements.chooseAssetFile.disabled = directorMode === "preview";
  elements.chooseAnimationFile.disabled = directorMode === "preview";
  elements.chooseSpatialBridge.disabled = directorMode === "preview";
  elements.chooseSpatialFiles.disabled = directorMode === "preview";
  elements.clearAssetFile.disabled = directorMode === "preview";
  elements.clearAssetFile.hidden = !assetReport;
  elements.assetSessionTitle.closest(".asset-import-status").dataset.format = assetReport?.format ?? "placeholder";
  elements.assetSessionTitle.textContent = assetReport ? assetReport.sourceName : "使用灰模";
  elements.assetSessionDetail.textContent = assetReport
    ? spatialReport
      ? `RGB-D · ${spatialReport.imageSize.join("×")} px · ${spatialReport.meshSize.join("×")} 顶点 · RGB／深度哈希已验证 · 相对 2.5D`
      : `${assetReport.format} · ${assetReport.meshCount} 网格 · ${assetReport.skinnedMeshCount} 蒙皮 · ${assetReport.boneCount} 骨骼 · ${assetReport.clipNames.length} 动作 · ${assetReport.morphTargetNames.length} Morph${assetReport.rigProfile ? ` · ${assetReport.rigProfile.family} / ${assetReport.rigProfile.chains.length} 链` : ""}`
    : "选择 OBJ／GLB 模型，或导入含 spatial-bridge.json 的 RGB-D 工程。";
  elements.assetRuntimeControls.hidden = !assetReport || Boolean(spatialReport);
  elements.chooseAnimationFile.hidden = !assetReport?.capabilities.animationRetargeting || Boolean(spatialReport);
  elements.assetRigDetails.hidden = !assetReport;
  elements.assetDetailSummary.textContent = spatialReport ? "空间合同与边界" : "骨架与控制接口";
  if (assetReport) {
    elements.assetBehaviorState.textContent = assetReport.runtime.behavior?.state ?? "idle";
    elements.assetIkState.textContent = assetReport.capabilities.fullBodyIk
      ? `全身 IK · 双手 · 脚锁`
      : assetReport.capabilities.handIk || assetReport.capabilities.footIk
        ? `部分 IK · ${assetReport.ikChains.length} 条链`
        : assetReport.capabilities.genericIkChains
          ? `通用 IK 描述 · ${assetReport.capabilities.genericIkChains} 个末端链`
          : "IK 未就绪";
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
    elements.openRigMapping.disabled = locked || !assetReport.capabilities.skeleton;
    const boneBindings = Object.entries(assetReport.bones).filter(([, name]) => name)
      .map(([slot, name]) => `${slot}→${name}`).join("、") || "无";
    const expressionBindings = mappedExpressions.map(([slot, name]) => `${slot}→${name}`).join("、") || "无";
    const universalRigSummary = assetReport.rigProfile
      ? `通用骨架：${assetReport.rigProfile.family} · ${assetReport.rigProfile.jointCount} 骨 · ${assetReport.rigProfile.chains.length} 链。受控动作能力：${assetReport.rigProfile.capabilities.join(" / ") || "move"}。关节限制和非人类 IK 末端随骨架配方保存；现有人形全身 IK 只在标准人形映射完整时启用。`
      : null;
    const rigSummary = spatialReport
      ? `已校验 RGB 与深度预览 2 个工件；合同指纹 ${spatialReport.contractSha256.slice(0, 12)}…。近白值沿表面法线向前，但仍是相对深度，不是米制重建。载体负责位置、旋转和尺寸；表面不会自动变成碰撞体。`
      : assetReport.format === "OBJ"
        ? "静态 OBJ：没有骨骼、蒙皮权重、动画或 Morph；如需角色控制请导出为 GLB。"
        : universalRigSummary ?? `骨架映射：${boneBindings}。表情映射：${expressionBindings}。运行时接口：setBehaviorState、setRigBindings、setBonePose、setLimbIk、setFootLock、setLookTarget、retargetAnimationsFrom；角色表演状态机负责接触阶段、对称双手握点、脚底锁定、头颈注视与受控表情/口型。`;
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
  const physics = simulation.physics;
  const physicsLabel = physics
    ? ` · Rapier 动态体 ${physics.bodyCounts?.dynamic ?? 0}`
    : "";
  const interaction = frame.interactions?.find((item) => item.ownershipMode && item.ownershipMode !== "none")
    ?? frame.interactions?.[0];
  const names = new Map(currentState.project.objects.map((object) => [object.id, object.name]));
  let state = "idle";
  let phase = "等待交互";
  let detail = physics ? `Rapier 重力／刚体已接入${physicsLabel}` : "确定性运动学后端 · 无活动动态刚体";

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
    detail = `${mode} · ${actorName} → ${targetName}${errorLabel}${collisionLabel}${physicsLabel}`;
  } else {
    const heldEntry = Object.entries(simulation.ownership ?? {}).find(([, value]) => value.status === "held");
    const placedEntry = Object.entries(simulation.ownership ?? {}).find(([, value]) => value.status === "placed");
    if (heldEntry) {
      state = "held";
      phase = "持续持有";
      detail = `${names.get(heldEntry[0]) ?? heldEntry[0]} · 持有者 ${names.get(heldEntry[1].holderId) ?? heldEntry[1].holderId}${collisionLabel}${physicsLabel}`;
    } else if (placedEntry) {
      state = "placed";
      phase = "放置完成";
      detail = `${names.get(placedEntry[0]) ?? placedEntry[0]} · 接触面 ${names.get(placedEntry[1].placementTargetId) ?? placedEntry[1].placementTargetId}${collisionLabel}${physicsLabel}`;
    } else if (collision) {
      detail = `确定性运动学后端${collisionLabel}${physicsLabel}`;
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
  if (isCp02Case || isCp03Case) {
    elements.autosaveStatus.textContent = `${isCp02Case ? "CP02" : "CP03"} 临时会话 · 不写入默认项目`;
    return;
  }
  window.clearTimeout(autosaveTimer);
  const revision = ++autosaveRevision;
  elements.autosaveStatus.textContent = "保存中…";
  autosaveTimer = window.setTimeout(() => {
    const json = serializeProject(project);
    autosaveWrite = autosaveWrite.then(async () => {
      if (revision !== autosaveRevision) return;
      const bytes = utf8ByteLength(json);
      try {
        await projectPersistence.saveSnapshot(STORAGE_KEY, json);
        if (bytes <= LOCAL_STORAGE_AUTOSAVE_LIMIT) localStorage.setItem(STORAGE_KEY, json);
        else localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY_V2);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        if (revision !== autosaveRevision) return;
        const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date());
        elements.autosaveStatus.textContent = `恢复库已保存 ${time} · ${(bytes / 1_000_000).toFixed(1)} MB`;
      } catch (error) {
        try {
          if (bytes > LOCAL_STORAGE_AUTOSAVE_LIMIT) throw error;
          localStorage.setItem(STORAGE_KEY, json);
          elements.autosaveStatus.textContent = "已降级保存到浏览器本地";
        } catch {
          elements.autosaveStatus.textContent = "恢复保存失败 · 请导出工程包";
        }
        console.warn(error);
      }
    });
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
editor.setPhysicsHandler((report) => {
  latestPhysicsReport = report;
  renderInspector(currentState);
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

const renderCp03Surface = () => {
  if (!isCp03Case) return;
  const proposed = cp03Session.outcome === "PROPOSED" && Boolean(cp03Session.currentProposal);
  elements.cp03Panel.dataset.outcome = cp03Session.outcome;
  document.querySelectorAll("[data-cp03-action]").forEach((button) => {
    const active = button.dataset.cp03Action === cp03Session.selectedAction;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = cp03Session.busy || proposed || cp03Session.outcome === "APPLIED";
  });
  elements.cp03Propose.disabled = cp03Session.busy || proposed || cp03Session.outcome === "APPLIED";
  elements.cp03ViewerInput.disabled = cp03Session.busy || proposed || cp03Session.outcome === "APPLIED";
  elements.cp03Approve.disabled = cp03Session.busy || !proposed;
  elements.cp03Reject.disabled = cp03Session.busy || !proposed;
  elements.cp03CopyHash.disabled = !cp03Session.currentProposal?.draftHash;
  elements.cp03ExportArchive.disabled = cp03Session.busy || cp03Session.proposals.length === 0;
  elements.cp03Reset.hidden = !["APPLIED", "REJECTED", "ERROR"].includes(cp03Session.outcome);
  elements.cp03Guardian.textContent = cp03Session.currentProposal?.guardianDisposition ?? "WAITING";
  elements.cp03Outcome.textContent = cp03Session.outcome;
  elements.cp03Outcome.dataset.outcome = cp03Session.outcome;
  elements.cp03DraftHash.textContent = cp03Session.currentProposal?.draftHash ?? "尚未生成";
  elements.cp03DraftHash.title = cp03Session.currentProposal?.draftHash ?? "";
  elements.cp03TraceSource.textContent = cp03Session.currentProposal ? "SCRIPTED · 0 CALLS" : "WAITING";
  elements.cp03PublicTrace.textContent = cp03Session.currentProposal?.publicTrace ?? "等待观众输入与动作选择。";
  elements.cp03Receipt.textContent = cp03Session.receipts.at(-1)?.receiptId ?? "尚未执行";
  elements.cp03GateStatus.textContent = cp03Session.gateStatus;
  elements.cp03Phase.textContent = cp03Session.phase;
};

const runCp03LocalAction = async (status, action) => {
  if (cp03Session.busy) return;
  cp03Session.busy = true;
  cp03Session.phase = status;
  renderCp03Surface();
  try {
    await action();
  } catch (error) {
    cp03Session.outcome = "ERROR";
    cp03Session.gateStatus = "FAIL CLOSED";
    cp03Session.phase = error.message;
  } finally {
    cp03Session.busy = false;
    renderCp03Surface();
  }
};

const proposeCp03LocalDraft = () => runCp03LocalAction("正在构造零调用本地提案并计算规范哈希…", async () => {
  const proposal = await buildLocalScriptedProposal({
    action: cp03Session.selectedAction,
    project: currentState.project,
    viewerText: elements.cp03ViewerInput.value,
    ordinal: ++cp03Session.ordinal,
  });
  cp03Session.currentProposal = proposal;
  cp03Session.proposals.push(structuredClone(proposal));
  cp03Session.outcome = "PROPOSED";
  cp03Session.gateStatus = "等待观众批准精确哈希";
  cp03Session.phase = "提案已冻结；批准或拒绝只作用于当前显示的 64 位哈希。";
});

const decideCp03LocalDraft = (decision) => runCp03LocalAction(
  decision === "APPROVE" ? "正在验证观众批准与 Capability Gate…" : "正在记录观众拒绝…",
  async () => {
    const proposal = cp03Session.currentProposal;
    if (!proposal) throw new Error("当前没有可审批提案。");
    const approval = await createLocalViewerApproval(proposal, decision);
    cp03Session.approvals.push(structuredClone(approval));
    if (decision === "REJECT") {
      cp03Session.outcome = "REJECTED";
      cp03Session.gateStatus = "REJECTED · NO MUTATION";
      cp03Session.phase = "观众已拒绝；场景与时间线未改变。";
      return;
    }

    const plan = await compileGuardedInteractionPlan({
      draft: proposal.draft,
      approval,
      project: currentState.project,
      frame: evaluateTimeline(currentState.project, 0),
    });
    const result = await applyGuardedInteractionPlan({ project: currentState.project, plan });
    store.replaceProject(result.project);
    const effect = editor.showCp03ActionEffect(
      proposal.draft.decision.actionSequence[0],
      result.receipt.changedObjectIds,
      { durationMs: 3200 },
    );
    cp03Session.receipts.push(structuredClone(result.receipt));
    cp03Session.effects.push({
      ...effect,
      draftHash: proposal.draftHash,
      receiptId: result.receipt.receiptId,
    });
    cp03Session.outcome = "APPLIED";
    cp03Session.gateStatus = "PASS · HASH LINKED";
    cp03Session.phase = `${effect.label}已进入真实 Three.js 视口；运行时回执与提案哈希连续。重置后可演练下一动作。`;
    if (setDirectorMode("preview")) {
      runtime?.seek(0);
      runtime?.play();
    }
  },
);

const resetCp03Encounter = () => {
  runtime?.stop();
  setDirectorMode("edit");
  editor.clearCp03ActionEffects();
  clearRuntimeAssets();
  store.replaceProject(createCp03EncounterProject());
  editor.setCameraPreset("perspective");
  cp03Session.currentProposal = null;
  cp03Session.outcome = "READY";
  cp03Session.gateStatus = "等待提案";
  cp03Session.phase = "场景已恢复到本地演练基线；历史工程证据仍保留在本次会话。";
  renderCp03Surface();
};

const exportCp03EngineeringArchive = () => {
  const archive = createLocalEngineeringArchive({
    proposals: cp03Session.proposals,
    approvals: cp03Session.approvals,
    receipts: cp03Session.receipts,
    effects: cp03Session.effects,
  });
  const blob = new Blob([`${JSON.stringify(archive, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cp03-local-engineering-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  cp03Session.phase = "本地工程证据已导出；文件内明确标记 NOT_CHECKPOINT。";
  renderCp03Surface();
};

const setupCp03Case = () => {
  if (!isCp03Case) return;
  document.body.classList.add("is-cp03-case");
  elements.cp03Panel.hidden = false;
  elements.projectName.disabled = true;
  editor.setGovernanceOverlay(false);
  document.querySelectorAll("[data-cp03-action]").forEach((button) => {
    button.addEventListener("click", () => {
      cp03Session.selectedAction = button.dataset.cp03Action;
      renderCp03Surface();
    });
  });
  elements.cp03Propose.addEventListener("click", () => void proposeCp03LocalDraft());
  elements.cp03Approve.addEventListener("click", () => void decideCp03LocalDraft("APPROVE"));
  elements.cp03Reject.addEventListener("click", () => void decideCp03LocalDraft("REJECT"));
  elements.cp03CopyHash.addEventListener("click", async () => {
    const hash = cp03Session.currentProposal?.draftHash;
    if (!hash) return;
    try {
      await navigator.clipboard.writeText(hash);
      showToast("Draft Hash 已复制");
    } catch {
      showToast("浏览器未允许剪贴板；可直接选择哈希文本复制");
    }
  });
  elements.cp03ExportArchive.addEventListener("click", exportCp03EngineeringArchive);
  elements.cp03Reset.addEventListener("click", resetCp03Encounter);
  window.__PACT_CP03_EVIDENCE__ = Object.freeze({
    snapshot: () => structuredClone({
      schemaVersion: 1,
      mode: "local-scripted-engineering",
      providerKind: "scripted-local",
      providerRequestsMade: 0,
      selectedAction: cp03Session.selectedAction,
      outcome: cp03Session.outcome,
      gateStatus: cp03Session.gateStatus,
      currentDraftHash: cp03Session.currentProposal?.draftHash ?? null,
      proposalCount: cp03Session.proposals.length,
      approvalCount: cp03Session.approvals.length,
      receiptCount: cp03Session.receipts.length,
      visualActions: cp03Session.effects.map((effect) => effect.action),
      checkpointEligible: false,
    }),
  });
  renderCp03Surface();
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

elements.openMultiViewGray.addEventListener("click", async () => {
  const object = selectedObject();
  if (!object) {
    showToast("请先选择一个承载生成灰模的场景物体");
    return;
  }
  const changedObject = multiViewGraySession.objectId !== object.id;
  if (changedObject) resetMultiViewGraySession(object.id);
  if (elements.singleImageDialog.open) elements.singleImageDialog.close();
  if (!elements.multiViewDialog.open) elements.multiViewDialog.showModal();
  if (
    object.asset?.portable?.kind === "multi-view-gray-model"
    && (changedObject || !Object.keys(multiViewGraySession.views).length)
  ) {
    multiViewGraySession.busy = true;
    multiViewGraySession.progress = 12;
    multiViewGraySession.progressText = "正在从内容库恢复规范视角与重建配方…";
    renderMultiViewGray();
    try {
      await restoreMultiViewGrayRecipe(object);
    } catch (error) {
      multiViewGraySession.progressText = error.message;
      showToast(error.message);
    } finally {
      multiViewGraySession.busy = false;
    }
  }
  renderMultiViewGray();
});

elements.closeMultiViewGray.addEventListener("click", () => elements.multiViewDialog.close());
elements.multiViewDialog.addEventListener("cancel", () => elements.multiViewDialog.close());

document.querySelectorAll("[data-multi-view-choose]").forEach((button) => {
  button.addEventListener("click", () => {
    multiViewGraySession.pendingViewId = button.dataset.multiViewChoose;
    elements.multiViewFile.click();
  });
});

elements.multiViewFile.addEventListener("change", async () => {
  const file = elements.multiViewFile.files?.[0];
  const viewId = multiViewGraySession.pendingViewId;
  if (!file || !CANONICAL_VIEW_DEFINITIONS.some((view) => view.id === viewId)) return;
  multiViewGraySession.busy = true;
  multiViewGraySession.progress = 8;
  multiViewGraySession.progressText = `正在本地处理${CANONICAL_VIEW_DEFINITIONS.find((view) => view.id === viewId)?.label}照片…`;
  renderMultiViewGray();
  try {
    const image = await prepareSingleImageFile(file, { maxEdge: 768 });
    const silhouette = deriveSilhouetteMask({
      pixels: image.pixels,
      width: image.width,
      height: image.height,
      threshold: 48,
    });
    multiViewGraySession.views[viewId] = {
      id: viewId,
      image,
      silhouette,
      depth: null,
      depthEnabled: true,
    };
    multiViewGraySession.activeViewId = viewId;
    traceMultiViewAction("view-added", { viewId });
    invalidateMultiViewGrayModel(`已加入${CANONICAL_VIEW_DEFINITIONS.find((view) => view.id === viewId)?.label}；请检查粉色轮廓。`);
    showToast(`已载入${CANONICAL_VIEW_DEFINITIONS.find((view) => view.id === viewId)?.label}“${image.sourceName}”`);
  } catch (error) {
    multiViewGraySession.progressText = error.message;
    showToast(error.message);
  } finally {
    multiViewGraySession.busy = false;
    multiViewGraySession.pendingViewId = null;
    elements.multiViewFile.value = "";
    renderMultiViewGray();
  }
});

document.querySelectorAll("[data-multi-view-clear]").forEach((button) => {
  button.addEventListener("click", () => {
    const viewId = button.dataset.multiViewClear;
    delete multiViewGraySession.views[viewId];
    traceMultiViewAction("view-removed", { viewId });
    if (multiViewGraySession.activeViewId === viewId) {
      multiViewGraySession.activeViewId = CANONICAL_VIEW_DEFINITIONS.find(({ id }) => multiViewGraySession.views[id])?.id ?? null;
    }
    invalidateMultiViewGrayModel("视角已移除；请重新生成灰模。");
    renderMultiViewGray();
  });
});

elements.multiViewActiveView.addEventListener("change", () => {
  multiViewGraySession.activeViewId = elements.multiViewActiveView.value || null;
  if (multiViewGraySession.activeViewId) traceMultiViewAction("view-selected", { viewId: multiViewGraySession.activeViewId });
  renderMultiViewGray();
});

elements.multiViewPreviewMode.addEventListener("change", () => {
  multiViewGraySession.previewMode = elements.multiViewPreviewMode.value === "depth" ? "depth" : "mask";
  traceMultiViewAction("preview-mode-changed", { value: multiViewGraySession.previewMode === "depth" ? 1 : 0 });
  renderMultiViewGray();
});

const estimateMultiViewDepthForView = async (viewId, { progressBase = 0, progressSpan = 100 } = {}) => {
  const entry = multiViewGraySession.views[viewId];
  if (!entry) throw new Error("待估算的规范视角不存在。");
  const label = CANONICAL_VIEW_DEFINITIONS.find((view) => view.id === viewId)?.label ?? viewId;
  const url = URL.createObjectURL(entry.image.blob);
  try {
    const depth = await browserDepthEstimator.estimate(url, {
      invert: false,
      onProgress: (event) => {
        const reported = Number(event.event?.progress);
        const withinView = Number.isFinite(reported)
          ? Math.max(0.03, Math.min(0.9, reported / 100 * 0.9))
          : event.phase === "estimating" ? 0.94 : 0.04;
        multiViewGraySession.progress = progressBase + withinView * progressSpan;
        multiViewGraySession.progressText = `${label} · ${event.message}`;
        elements.multiViewProgress.hidden = false;
        elements.multiViewProgress.value = multiViewGraySession.progress;
        elements.multiViewProgressText.textContent = multiViewGraySession.progressText;
        elements.multiViewDepthModelStatus.textContent = event.backend
          ? `${String(event.backend).toUpperCase()} · ${event.phase === "ready" ? "模型已就绪" : "正在本机运行"}`
          : "正在载入 Depth Anything V2";
      },
    });
    if (depth.width !== entry.image.width || depth.height !== entry.image.height) {
      throw new Error(`${label}深度输出 ${depth.width}×${depth.height} 与处理后照片 ${entry.image.width}×${entry.image.height} 不一致。`);
    }
    entry.depth = { ...depth, inverted: false };
    entry.depthEnabled = true;
    traceMultiViewAction("depth-estimated", { viewId });
    return depth;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const runMultiViewDepthEstimation = async (viewIds) => {
  const session = multiViewGraySession;
  const targets = viewIds.filter((viewId) => session.views[viewId]);
  if (!targets.length || session.busy) return;
  invalidateMultiViewGrayModel("深度正在更新；场景中仍保留上次生成结果。");
  session.busy = true;
  session.progress = 2;
  session.progressText = "准备本地深度模型…";
  renderMultiViewGray();
  try {
    for (let index = 0; index < targets.length; index += 1) {
      await estimateMultiViewDepthForView(targets[index], {
        progressBase: index / targets.length * 96,
        progressSpan: 96 / targets.length,
      });
    }
    session.previewMode = "depth";
    session.progress = 100;
    session.progressText = `相对深度估算完成 · ${targets.length} 个视角 · 白色为近处；请逐张检查方向。`;
    showToast(`已在本机生成 ${targets.length} 张相对深度图`);
  } catch (error) {
    session.progressText = error.message;
    showToast(error.message);
  } finally {
    session.busy = false;
    renderMultiViewGray();
  }
};

elements.estimateCurrentMultiViewDepth.addEventListener("click", () => {
  const viewId = multiViewGraySession.activeViewId;
  if (viewId) void runMultiViewDepthEstimation([viewId]);
});

elements.estimateAllMultiViewDepth.addEventListener("click", () => {
  const viewIds = CANONICAL_VIEW_DEFINITIONS
    .map(({ id }) => id)
    .filter((id) => multiViewGraySession.views[id]);
  void runMultiViewDepthEstimation(viewIds);
});

elements.multiViewThreshold.addEventListener("input", () => {
  const viewId = multiViewGraySession.activeViewId;
  if (!viewId) return;
  try {
    updateMultiViewSilhouette(viewId, { threshold: Number(elements.multiViewThreshold.value) });
    traceMultiViewAction("threshold-changed", { viewId, value: Number(elements.multiViewThreshold.value) });
    invalidateMultiViewGrayModel("轮廓阈值已改变；请确认粉色边界后重新生成灰模。");
  } catch (error) {
    multiViewGraySession.progressText = error.message;
    showToast(error.message);
  }
  renderMultiViewGray();
});

elements.multiViewInvert.addEventListener("change", () => {
  const viewId = multiViewGraySession.activeViewId;
  if (!viewId) return;
  try {
    updateMultiViewSilhouette(viewId, { invert: elements.multiViewInvert.checked });
    traceMultiViewAction("invert-changed", { viewId, value: elements.multiViewInvert.checked ? 1 : 0 });
    invalidateMultiViewGrayModel("轮廓反相设置已改变；请重新生成灰模。");
  } catch (error) {
    elements.multiViewInvert.checked = !elements.multiViewInvert.checked;
    multiViewGraySession.progressText = error.message;
    showToast(error.message);
  }
  renderMultiViewGray();
});

elements.multiViewUseDepth.addEventListener("change", () => {
  const viewId = multiViewGraySession.activeViewId;
  const entry = multiViewGraySession.views[viewId];
  if (!entry?.depth) return;
  entry.depthEnabled = elements.multiViewUseDepth.checked;
  traceMultiViewAction("depth-enabled-changed", { viewId, value: entry.depthEnabled ? 1 : 0 });
  invalidateMultiViewGrayModel(entry.depthEnabled
    ? "当前视角深度约束已启用；请重新生成灰模。"
    : "当前视角深度约束已停用；请重新生成灰模以比较纯轮廓基线。");
  renderMultiViewGray();
});

elements.multiViewDepthInvert.addEventListener("change", () => {
  const viewId = multiViewGraySession.activeViewId;
  const entry = multiViewGraySession.views[viewId];
  if (!entry?.depth) return;
  entry.depth.inverted = elements.multiViewDepthInvert.checked;
  traceMultiViewAction("depth-invert-changed", { viewId, value: entry.depth.inverted ? 1 : 0 });
  invalidateMultiViewGrayModel(entry.depth.inverted
    ? "已反转当前视角的近／远解释；请检查深度预览并重新生成。"
    : "已恢复当前视角默认近／远解释；请重新生成灰模。");
  renderMultiViewGray();
});

for (const [control, action, message] of [
  [elements.multiViewResolution, "resolution-changed", "体素精度已改变；请重新生成灰模。"],
  [elements.multiViewPadding, "padding-changed", "轮廓留量已改变；请重新生成灰模。"],
  [elements.multiViewDepthInfluence, "depth-influence-changed", "深度影响已改变；请重新生成并与纯轮廓基线比较。"],
  [elements.multiViewDepthTolerance, "depth-tolerance-changed", "深度容差已改变；请重新生成灰模。"],
]) {
  control.addEventListener("input", () => {
    traceMultiViewAction(action, { value: Number(control.value) });
    invalidateMultiViewGrayModel(message);
    renderMultiViewGray();
  });
}

const buildMultiViewGrayAsset = async ({ baseline = false } = {}) => {
  const session = multiViewGraySession;
  const object = currentState.project.objects.find((candidate) => candidate.id === session.objectId);
  if (!object || session.busy) return;
  const modeLabel = baseline ? "纯轮廓基线" : "深度辅助灰模";
  const requestedDepthInfluence = baseline ? 0 : Number(elements.multiViewDepthInfluence.value);
  session.busy = true;
  session.progress = 10;
  session.progressText = baseline
    ? "正在验证规范视角并生成纯轮廓实验基线…"
    : "正在验证规范视角、轮廓与相对深度合同…";
  traceMultiViewAction(baseline ? "baseline-build-started" : "depth-build-started", {
    value: Number(elements.multiViewResolution.value),
  });
  renderMultiViewGray();
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  try {
    const views = validateCanonicalViews(multiViewRuntimeViews(), { requireGuidedPair: true });
    if (!baseline && !views.some((view) => view.depth && view.depthEnabled !== false) ) {
      throw new Error("深度辅助条件至少需要一张已启用的相对深度；也可以先生成纯轮廓基线。");
    }
    session.progress = 28;
    session.progressText = baseline
      ? "正在求交轮廓并提取不含深度约束的基线表面…"
      : "正在求交轮廓，并按启用的相对深度收紧可见表面…";
    renderMultiViewGray();
    session.mesh = buildVisualHullMeshData({
      views,
      resolution: Number(elements.multiViewResolution.value),
      padding: Number(elements.multiViewPadding.value),
      depthInfluence: requestedDepthInfluence,
      depthTolerance: Number(elements.multiViewDepthTolerance.value),
    });
    const baseName = session.views.front?.image.sourceName ?? object.name;
    const artifactSuffix = baseline ? "-silhouette-baseline" : "-depth-assisted-hull";
    session.objFile = new File(
      [serializeVisualHullObj(session.mesh, { name: baseName })],
      generatedFilename(baseName, `${artifactSuffix}.obj`),
      { type: "model/obj" },
    );
    traceMultiViewAction(baseline ? "baseline-build-completed" : "depth-build-completed", {
      value: session.mesh.voxelCount,
    });
    session.recipeFile = new File(
      [serializeMultiViewRecipe({ views, mesh: session.mesh, name: baseName, interactionTrace: session.trace })],
      generatedFilename(baseName, `${artifactSuffix}-recipe.json`),
      { type: "application/json" },
    );
    session.progress = 74;
    session.progressText = "正在载入中性灰 OBJ 并保存来源绑定…";
    renderMultiViewGray();
    const report = await editor.loadAssetFile(object.id, session.objFile);
    await persistMultiViewGrayModel(object, session.objFile, session.recipeFile);
    session.progress = 100;
    const depthSummary = session.mesh.depthViewIds.length
      ? ` · ${session.mesh.depthViewIds.length} 张深度削减 ${session.mesh.depthCarvedVoxelCount} 体素`
      : " · 纯轮廓基线";
    const warningSummary = session.mesh.depthWarnings.length
      ? ` · ${session.mesh.depthWarnings.join(" ")}`
      : "";
    session.progressText = `${modeLabel}已载入 · ${session.mesh.voxelCount} 体素 · ${session.mesh.faceCount} 三角面 · ${views.length} 个轮廓视角${depthSummary}${warningSummary}`;
    renderInspector(currentState);
    showToast(`${modeLabel}已生成：${report.meshCount} 网格 · ${session.mesh.faceCount} 三角面`);
  } catch (error) {
    traceMultiViewAction(baseline ? "baseline-build-failed" : "depth-build-failed");
    session.mesh = null;
    session.objFile = null;
    session.recipeFile = null;
    session.progressText = error.message;
    showToast(error.message);
  } finally {
    session.busy = false;
    renderMultiViewGray();
  }
};

elements.buildMultiViewGray.addEventListener("click", () => {
  void buildMultiViewGrayAsset({ baseline: false });
});

elements.buildMultiViewBaseline.addEventListener("click", () => {
  void buildMultiViewGrayAsset({ baseline: true });
});

elements.downloadMultiViewObj.addEventListener("click", () => {
  if (multiViewGraySession.objFile) downloadBrowserFile(multiViewGraySession.objFile);
});

elements.downloadMultiViewRecipe.addEventListener("click", () => {
  if (multiViewGraySession.recipeFile) downloadBrowserFile(multiViewGraySession.recipeFile);
});

elements.multiViewDialog.addEventListener("keydown", (event) => {
  if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(event.target?.tagName)) return;
  const shortcut = event.key.toLowerCase();
  const active = multiViewGraySession.views[multiViewGraySession.activeViewId];
  if ((shortcut === "d" || shortcut === "i") && active?.depth && !multiViewGraySession.busy) {
    event.preventDefault();
    if (shortcut === "d") elements.multiViewUseDepth.click();
    else elements.multiViewDepthInvert.click();
    return;
  }
  const viewId = { "1": "front", "2": "back", "3": "right", "4": "left", "7": "top", "9": "bottom" }[event.key];
  if (!viewId || !multiViewGraySession.views[viewId]) return;
  event.preventDefault();
  multiViewGraySession.activeViewId = viewId;
  renderMultiViewGray();
});

elements.openSingleImage3d.addEventListener("click", async () => {
  const object = selectedObject();
  if (!object) {
    showToast("请先选择一个承载生成模型的场景物体");
    return;
  }
  const previousObjectId = singleImage3dSession.objectId;
  singleImage3dSession.objectId = object.id;
  if (elements.multiViewDialog.open) elements.multiViewDialog.close();
  if (!elements.singleImageDialog.open) elements.singleImageDialog.showModal();
  if (
    object.asset?.portable?.kind === "single-image-model"
    && (previousObjectId !== object.id || !singleImage3dSession.image)
  ) {
    singleImage3dSession.busy = true;
    singleImage3dSession.progress = 12;
    singleImage3dSession.progressText = "正在从内容库恢复单图生成配方…";
    renderSingleImage3d();
    try {
      await restoreSingleImageRecipe(object);
    } catch (error) {
      singleImage3dSession.progressText = error.message;
      showToast(error.message);
    } finally {
      singleImage3dSession.busy = false;
    }
  }
  renderSingleImage3d();
});

elements.closeSingleImage3d.addEventListener("click", () => elements.singleImageDialog.close());
elements.singleImageDialog.addEventListener("cancel", () => elements.singleImageDialog.close());
elements.chooseSingleImage.addEventListener("click", () => elements.singleImageFile.click());
elements.singleImageFile.addEventListener("change", async () => {
  const file = elements.singleImageFile.files?.[0];
  if (!file) return;
  singleImage3dSession.busy = true;
  singleImage3dSession.progress = 4;
  singleImage3dSession.progressText = "正在解码并缩放单图…";
  renderSingleImage3d();
  try {
    singleImage3dSession.image = await prepareSingleImageFile(file);
    singleImage3dSession.depth = null;
    singleImage3dSession.rig = createRigDraft(elements.singleImageRigPreset.value);
    singleImage3dSession.dragSlot = null;
    singleImage3dSession.selectedSlot = singleImage3dSession.rig.joints[0]?.slot ?? null;
    elements.singleImageDepthInvert.checked = false;
    invalidateSingleImageMesh();
    singleImage3dSession.progressText = "单图已就绪；下一步估算相对深度。";
    showToast(`已载入单图“${singleImage3dSession.image.sourceName}”`);
  } catch (error) {
    showToast(error.message);
    singleImage3dSession.progressText = error.message;
  } finally {
    singleImage3dSession.busy = false;
    singleImage3dSession.progress = 0;
    elements.singleImageFile.value = "";
    renderSingleImage3d();
  }
});

elements.estimateSingleImageDepth.addEventListener("click", async () => {
  const session = singleImage3dSession;
  if (!session.image || session.busy) return;
  session.busy = true;
  session.progress = 2;
  session.progressText = "准备本地深度模型…";
  invalidateSingleImageMesh();
  renderSingleImage3d();
  const url = URL.createObjectURL(session.image.blob);
  try {
    const depth = await browserDepthEstimator.estimate(url, {
      invert: elements.singleImageDepthInvert.checked,
      onProgress: (event) => {
        session.progressText = event.message;
        const reported = Number(event.event?.progress);
        session.progress = Number.isFinite(reported)
          ? Math.max(3, Math.min(92, reported * 0.9))
          : event.phase === "estimating" ? 94 : session.progress;
        elements.singleImageProgress.hidden = false;
        elements.singleImageProgress.value = session.progress;
        elements.singleImageProgressText.textContent = session.progressText;
        elements.singleImageModelStatus.textContent = event.backend
          ? `${String(event.backend).toUpperCase()} · ${event.phase === "ready" ? "模型已就绪" : "正在运行"}`
          : "正在载入 Depth Anything V2";
      },
    });
    if (depth.width !== session.image.width || depth.height !== session.image.height) {
      throw new Error(`深度输出 ${depth.width}×${depth.height} 与处理后单图 ${session.image.width}×${session.image.height} 不一致。`);
    }
    session.depth = depth;
    session.progress = 100;
    session.progressText = `深度估算完成 · ${depth.backend.toUpperCase()} · 白色为近处`;
    showToast(`相对深度已生成：${depth.width}×${depth.height} · ${depth.backend.toUpperCase()}`);
  } catch (error) {
    session.progressText = error.message;
    showToast(error.message);
  } finally {
    URL.revokeObjectURL(url);
    session.busy = false;
    renderSingleImage3d();
  }
});

elements.singleImageDepthInvert.addEventListener("change", () => {
  const depth = singleImage3dSession.depth?.depth;
  if (depth) {
    for (let index = 0; index < depth.length; index += 1) depth[index] = 1 - depth[index];
    singleImage3dSession.depth.inverted = elements.singleImageDepthInvert.checked;
    invalidateSingleImageMesh();
    singleImage3dSession.progressText = elements.singleImageDepthInvert.checked
      ? "已反转近／远解释；请重新生成 OBJ。"
      : "已恢复模型默认近／远解释；请重新生成 OBJ。";
  }
  renderSingleImage3d();
});

for (const control of [
  elements.singleImageResolution,
  elements.singleImageDepthStrength,
  elements.singleImageEdgeThreshold,
]) {
  control.addEventListener("input", () => {
    invalidateSingleImageMesh();
    renderSingleImage3d();
  });
}

const mutateSingleImageRig = (mutator, message) => {
  try {
    singleImage3dSession.rig = mutator(singleImage3dSession.rig);
    if (!singleImage3dSession.rig.joints.some((joint) => joint.slot === singleImage3dSession.selectedSlot)) {
      singleImage3dSession.selectedSlot = singleImage3dSession.rig.joints[0]?.slot ?? null;
    }
    singleImage3dSession.glbFile = null;
    if (message) singleImage3dSession.progressText = message;
  } catch (error) {
    showToast(error.message);
    singleImage3dSession.progressText = error.message;
  }
  renderSingleImage3d();
};

elements.singleImageRigPreset.addEventListener("change", () => {
  const preset = RIG_PRESET_OPTIONS.find((entry) => entry.id === elements.singleImageRigPreset.value);
  singleImage3dSession.rig = createRigDraft(elements.singleImageRigPreset.value);
  singleImage3dSession.selectedSlot = singleImage3dSession.rig.joints[0]?.slot ?? null;
  singleImage3dSession.dragSlot = null;
  singleImage3dSession.glbFile = null;
  singleImage3dSession.progressText = `${preset?.label ?? "骨架"}已载入；拖动关节或编辑拓扑后重新生成 GLB。`;
  renderSingleImage3d();
});

elements.singleImageRigJoint.addEventListener("change", () => {
  singleImage3dSession.selectedSlot = elements.singleImageRigJoint.value;
  renderSingleImage3d();
});

elements.singleImageAddJoint.addEventListener("click", () => {
  const parent = selectedSingleImageJoint();
  const ordinal = singleImage3dSession.rig.joints.length + 1;
  mutateSingleImageRig((rig) => {
    const next = addRigJoint(rig, {
      slot: `customBone${ordinal}`,
      name: `CustomBone${ordinal}`,
      parent: parent?.slot,
      chain: parent?.chain ?? "custom",
    });
    singleImage3dSession.selectedSlot = next.joints.at(-1)?.slot ?? parent?.slot;
    return next;
  }, "已添加自定义子骨；可拖动定位并设置语义角色。");
});

elements.singleImageDeleteJoint.addEventListener("click", () => {
  const slot = singleImage3dSession.selectedSlot;
  if (!slot) return;
  mutateSingleImageRig((rig) => {
    const target = rig.joints.find((joint) => joint.slot === slot);
    const next = removeRigJoint(rig, slot);
    singleImage3dSession.selectedSlot = target?.parent ?? next.joints[0]?.slot ?? null;
    return next;
  }, "骨骼已删除；原子骨骼已重连到它的父节点。");
});

elements.singleImageMirrorJoint.addEventListener("click", () => {
  const slot = singleImage3dSession.selectedSlot;
  if (!slot) return;
  mutateSingleImageRig((rig) => mirrorRigJoint(rig, slot), "已把当前骨骼镜像到配对侧。");
});

const updateSelectedSingleImageJoint = (patch, message = "骨骼参数已修改；请重新生成 GLB。") => {
  const slot = singleImage3dSession.selectedSlot;
  if (!slot) return;
  mutateSingleImageRig((rig) => updateRigJoint(rig, slot, patch), message);
};

elements.singleImageJointName.addEventListener("change", () => updateSelectedSingleImageJoint({
  name: elements.singleImageJointName.value,
}));
elements.singleImageJointParent.addEventListener("change", () => {
  const slot = singleImage3dSession.selectedSlot;
  if (!slot) return;
  mutateSingleImageRig(
    (rig) => reparentRigJoint(rig, slot, elements.singleImageJointParent.value || null),
    "父骨骼已修改；拓扑循环检查通过。",
  );
});
elements.singleImageJointRole.addEventListener("change", () => updateSelectedSingleImageJoint({
  role: elements.singleImageJointRole.value,
}));
elements.singleImageJointChain.addEventListener("change", () => updateSelectedSingleImageJoint({
  chain: elements.singleImageJointChain.value,
}));
elements.singleImageJointSide.addEventListener("change", () => updateSelectedSingleImageJoint({
  side: elements.singleImageJointSide.value,
}));
elements.singleImageJointAxis.addEventListener("change", () => updateSelectedSingleImageJoint({
  limits: {
    axis: elements.singleImageJointAxis.value,
    minDegrees: Number(elements.singleImageJointMin.value),
    maxDegrees: Number(elements.singleImageJointMax.value),
  },
}));
elements.singleImageJointEffector.addEventListener("change", () => updateSelectedSingleImageJoint({
  effector: elements.singleImageJointEffector.checked,
}));
for (const control of [elements.singleImageJointMin, elements.singleImageJointMax]) {
  control.addEventListener("change", () => updateSelectedSingleImageJoint({
    limits: {
      axis: elements.singleImageJointAxis.value,
      minDegrees: Number(elements.singleImageJointMin.value),
      maxDegrees: Number(elements.singleImageJointMax.value),
    },
  }));
}
elements.singleImageJointDepth.addEventListener("change", () => updateSelectedSingleImageJoint({
  depthOffset: Number(elements.singleImageJointDepth.value),
}));

const singleImagePointerUv = (event) => {
  const rect = elements.singleImageSourceCanvas.getBoundingClientRect();
  return [
    clampUi((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
    clampUi((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
  ];
};

elements.singleImageSourceCanvas.addEventListener("pointerdown", (event) => {
  if (!singleImage3dSession.image || singleImage3dSession.busy) return;
  const [u, v] = singleImagePointerUv(event);
  const nearest = singleImage3dSession.rig.joints
    .map((joint) => ({ joint, distance: Math.hypot(joint.u - u, joint.v - v) }))
    .sort((left, right) => left.distance - right.distance)[0];
  if (!nearest || nearest.distance > 0.055) return;
  singleImage3dSession.dragSlot = nearest.joint.slot;
  singleImage3dSession.selectedSlot = nearest.joint.slot;
  elements.singleImageSourceCanvas.setPointerCapture(event.pointerId);
  renderSingleImage3d();
});

elements.singleImageSourceCanvas.addEventListener("pointermove", (event) => {
  const slot = singleImage3dSession.dragSlot;
  if (!slot || !elements.singleImageSourceCanvas.hasPointerCapture(event.pointerId)) return;
  const [u, v] = singleImagePointerUv(event);
  singleImage3dSession.rig = moveRigDraftJoint(singleImage3dSession.rig, slot, u, v);
  singleImage3dSession.glbFile = null;
  renderSingleImage3d();
});

const releaseSingleImageJoint = (event) => {
  if (elements.singleImageSourceCanvas.hasPointerCapture(event.pointerId)) {
    elements.singleImageSourceCanvas.releasePointerCapture(event.pointerId);
  }
  singleImage3dSession.dragSlot = null;
  renderSingleImage3d();
};
elements.singleImageSourceCanvas.addEventListener("pointerup", releaseSingleImageJoint);
elements.singleImageSourceCanvas.addEventListener("pointercancel", releaseSingleImageJoint);

elements.buildSingleImageObj.addEventListener("click", async () => {
  const session = singleImage3dSession;
  const object = currentState.project.objects.find((candidate) => candidate.id === session.objectId);
  if (!object || !session.image || !session.depth || session.busy) return;
  session.busy = true;
  session.progress = 8;
  session.progressText = "正在生成断层保护网格与 OBJ…";
  renderSingleImage3d();
  try {
    session.mesh = buildReliefMeshData({
      rgbPixels: session.image.pixels,
      depth: session.depth.depth,
      width: session.image.width,
      height: session.image.height,
      resolution: Number(elements.singleImageResolution.value),
      depthStrength: Number(elements.singleImageDepthStrength.value),
      edgeThreshold: Number(elements.singleImageEdgeThreshold.value),
    });
    const objText = serializeReliefObj(session.mesh, { name: session.image.sourceName });
    session.objFile = new File(
      [objText],
      generatedFilename(session.image.sourceName, "-relief.obj"),
      { type: "model/obj" },
    );
    session.glbFile = null;
    session.progress = 70;
    session.progressText = "正在载入 OBJ 并写入可移植资产库…";
    renderSingleImage3d();
    const report = await editor.loadAssetFile(object.id, session.objFile);
    await persistSingleImageModel(object, session.objFile, { appliedRig: false });
    session.progress = 100;
    session.progressText = `OBJ 已载入 · ${session.mesh.vertexCount} 顶点 · ${session.mesh.faceCount} 三角面`;
    renderInspector(currentState);
    showToast(`彩色 OBJ 已生成并持久化：${report.meshCount} 网格 · ${session.mesh.faceCount} 三角面`);
  } catch (error) {
    session.progressText = error.message;
    showToast(error.message);
  } finally {
    session.busy = false;
    renderSingleImage3d();
  }
});

elements.downloadSingleImageObj.addEventListener("click", () => {
  if (singleImage3dSession.objFile) downloadBrowserFile(singleImage3dSession.objFile);
});

elements.buildSingleImageGlb.addEventListener("click", async () => {
  const session = singleImage3dSession;
  const object = currentState.project.objects.find((candidate) => candidate.id === session.objectId);
  if (!object || !session.mesh || session.busy) return;
  session.busy = true;
  session.progress = 12;
  session.progressText = "正在计算四权重蒙皮并导出 GLB…";
  renderSingleImage3d();
  try {
    const exported = await exportRiggedReliefGlb(session.mesh, session.rig);
    session.glbFile = new File(
      [exported.buffer],
      generatedFilename(session.image.sourceName, "-rigged.glb"),
      { type: "model/gltf-binary" },
    );
    session.progress = 72;
    session.progressText = "正在载入骨架 GLB 并写入可移植资产库…";
    renderSingleImage3d();
    const report = await editor.loadAssetFile(object.id, session.glbFile);
    await persistSingleImageModel(object, session.glbFile, { appliedRig: true });
    session.progress = 100;
    session.progressText = `骨架 GLB 已载入 · ${report.boneCount} 骨骼 · ${report.skinnedMeshCount} 蒙皮`;
    renderInspector(currentState);
    showToast(`骨架 GLB 已生成并持久化：${report.boneCount} 骨骼；可继续打开骨架映射编辑器`);
  } catch (error) {
    session.progressText = error.message;
    showToast(error.message);
  } finally {
    session.busy = false;
    renderSingleImage3d();
  }
});

elements.downloadSingleImageGlb.addEventListener("click", () => {
  if (singleImage3dSession.glbFile) downloadBrowserFile(singleImage3dSession.glbFile);
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
    const portable = await persistPortableFiles(projectPersistence, "model", [{ role: "model", file }]);
    const latest = store.getState().project.objects.find((candidate) => candidate.id === object.id);
    if (!latest) throw new Error("模型载入后目标物体已被移除。");
    store.updateObject(object.id, { asset: { ...(latest.asset ?? {}), portable } });
    showToast(`已替换并持久化“${object.name}”：${report.format} · ${report.boneCount} 骨骼 · ${report.clipNames.length} 动作`);
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.assetFile.value = "";
    renderInspector(currentState);
  }
});

elements.chooseAnimationFile.addEventListener("click", () => elements.animationFile.click());
elements.animationFile.addEventListener("change", async () => {
  const object = selectedObject();
  const file = elements.animationFile.files?.[0];
  if (!object || !file) return;
  elements.chooseAnimationFile.disabled = true;
  elements.assetSessionDetail.textContent = "正在把动作骨架重定向到当前角色…";
  try {
    const result = await editor.loadRetargetAnimationFile(object.id, file);
    const animationEntry = await persistPortableFile(projectPersistence, "animation", file);
    const latest = store.getState().project.objects.find((candidate) => candidate.id === object.id);
    const portable = latest?.asset?.portable;
    if (!latest || portable?.kind !== "model") throw new Error("目标模型没有可更新的可移植资产绑定。");
    const entries = [
      ...portable.entries.filter((entry) => entry.role !== "animation"),
      animationEntry,
    ].sort((left, right) => left.role.localeCompare(right.role));
    store.updateObject(object.id, { asset: { ...(latest.asset ?? {}), portable: { ...portable, entries } } });
    showToast(`已重定向并打包 ${result.imported.length} 个动作：${result.imported.join("、")}`);
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.animationFile.value = "";
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
    const { resolveSpatialBridgeFiles } = await import("./spatial-bridge-runtime.js");
    const resolved = await resolveSpatialBridgeFiles(files);
    const report = await editor.loadSpatialBridgeFiles(object.id, [resolved.bridgeFile, resolved.rgbFile, resolved.depthFile]);
    const portable = await persistPortableFiles(projectPersistence, "spatial-bridge", [
      { role: "bridge", file: resolved.bridgeFile },
      { role: "rgb", file: resolved.rgbFile },
      { role: "depth", file: resolved.depthFile },
    ]);
    const latest = store.getState().project.objects.find((candidate) => candidate.id === object.id);
    if (!latest) throw new Error("RGB-D 载入后目标物体已被移除。");
    store.updateObject(object.id, { asset: { ...(latest.asset ?? {}), portable } });
    const spatial = report.spatialBridge;
    showToast(`已导入并持久化“${object.name}”的 RGB-D 表面：${spatial.vertexCount} 顶点 · 3 个文件已打包`);
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
  store.updateObject(object.id, { asset: object.asset ? { ...object.asset, portable: null } : null });
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

elements.openRigMapping.addEventListener("click", openRigMappingEditor);
elements.closeRigMapping.addEventListener("click", () => elements.rigMappingDialog.close());
elements.rigMappingDialog.addEventListener("click", (event) => {
  if (event.target === elements.rigMappingDialog) elements.rigMappingDialog.close();
});
elements.rigMappingDialog.addEventListener("close", () => {
  restoreSavedRigRuntime();
  rigMappingSession.objectId = null;
  renderInspector(currentState);
});
elements.rigMappingSearch.addEventListener("input", renderRigMappingEditor);
elements.resetRigMapping.addEventListener("click", () => {
  rigMappingSession.draft = { ...rigMappingSession.saved };
  rigMappingSession.sources = { ...rigMappingSession.savedSources };
  restoreSavedRigRuntime();
  renderRigMappingEditor();
  showToast("已恢复当前工程中保存的骨架映射");
});
elements.autoMapRig.addEventListener("click", () => {
  const inferred = autoMapRigBones(rigMappingSession.boneNames);
  rigMappingSession.draft = { ...inferred.bones };
  rigMappingSession.sources = Object.fromEntries(RIG_SLOT_DEFINITIONS.map(({ slot }) => [
    slot,
    inferred.bones[slot] ? "auto" : "missing",
  ]));
  renderRigMappingEditor();
  showToast("已按 Mixamo／通用 GLB 命名重新推断骨架");
});
elements.saveRigMapping.addEventListener("click", () => {
  const object = currentState.project.objects.find((candidate) => candidate.id === rigMappingSession.objectId);
  if (!object) return;
  const bones = Object.fromEntries(RIG_SLOT_DEFINITIONS.map(({ slot }) => [slot, rigMappingSession.draft[slot] ?? null]));
  const diagnostics = evaluateRigMapping(bones, rigMappingSession.boneNames, { sources: rigMappingSession.sources });
  if (diagnostics.duplicateBones.length) {
    showToast("请先解决重复骨骼映射");
    return;
  }
  editor.setAssetRigBindings(object.id, bones);
  const latest = currentState.project.objects.find((candidate) => candidate.id === object.id);
  store.updateObject(object.id, { asset: { ...(latest.asset ?? {}), bones } });
  rigMappingSession.saved = { ...bones };
  rigMappingSession.savedSources = Object.fromEntries(RIG_SLOT_DEFINITIONS.map(({ slot }) => [
    slot,
    bones[slot] ? "manual" : "unmapped",
  ]));
  showToast(diagnostics.missingRequired.length
    ? `映射已保存；${diagnostics.missingRequired.length} 个必需槽位保持降级`
    : "骨架映射已保存；替换 GLB 时无需修改代码");
  elements.rigMappingDialog.close();
});
document.querySelectorAll("[data-rig-test]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!rigMappingSession.objectId) return;
    editor.setAssetRigBindings(rigMappingSession.objectId, rigMappingSession.draft);
    const ok = editor.previewAssetRig(rigMappingSession.objectId, button.dataset.rigTest);
    document.querySelectorAll("[data-rig-test][aria-pressed]").forEach((candidate) => {
      candidate.setAttribute("aria-pressed", String(ok && candidate === button && button.dataset.rigTest !== "reset"));
    });
    renderRigMappingEditor();
    showToast(ok ? `骨架测试：${button.textContent}` : "当前映射不支持这个测试");
  });
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

const clearRuntimeAssets = () => {
  for (const object of currentState.project.objects) editor.clearAsset(object.id, { resync: false });
};

const restorePortableAssets = async (project, { announce = true } = {}) => {
  const bindings = project.objects.filter((object) => object.asset?.portable);
  const report = { requested: bindings.length, restored: 0, failures: [] };
  for (const object of bindings) {
    try {
      const descriptors = await filesForPortableBinding(projectPersistence, object.asset.portable);
      if (["model", "single-image-model", "multi-view-gray-model"].includes(object.asset.portable.kind)) {
        await editor.loadAssetFile(object.id, descriptors.find((entry) => entry.role === "model").file);
        const animation = object.asset.portable.kind === "model"
          ? descriptors.find((entry) => entry.role === "animation")
          : null;
        if (animation) await editor.loadRetargetAnimationFile(object.id, animation.file);
      } else {
        await editor.loadSpatialBridgeFiles(object.id, descriptors.map((entry) => entry.file));
      }
      report.restored += 1;
    } catch (error) {
      report.failures.push({ objectId: object.id, message: error.message });
    }
  }
  if (announce && report.requested) {
    showToast(report.failures.length
      ? `已恢复 ${report.restored}/${report.requested} 个资产；缺失项请重新导入工程包`
      : `已从内容库恢复 ${report.restored} 个模型／RGB-D 资产`);
  }
  window.__BLOCKOUT_PORTABLE_ASSETS__ = Object.freeze({ snapshot: () => structuredClone(report) });
  renderInspector(currentState);
  return report;
};

const replaceProjectAndRestoreAssets = async (project, { announce = true } = {}) => {
  clearRuntimeAssets();
  store.replaceProject(ensureInitialTimeline(project));
  editor.setCameraPreset("perspective");
  return restorePortableAssets(store.getState().project, { announce });
};

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

const savePortableProject = async () => {
  elements.savePortable.disabled = true;
  elements.savePortable.textContent = "正在打包…";
  try {
    await navigator.storage?.persist?.();
    const result = await createPortableProjectPackage(currentState.project, projectPersistence, serializeProject);
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilename(currentState.project.name)}.blockout.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast(`可移植工程包已保存：${result.manifest.assets.length} 个内容寻址资产`);
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.savePortable.disabled = false;
    elements.savePortable.textContent = "保存可移植工程包";
  }
};

elements.save.addEventListener("click", saveProject);
elements.savePortable.addEventListener("click", () => void savePortableProject());
elements.load.addEventListener("click", () => elements.file.click());
elements.file.addEventListener("change", async () => {
  const file = elements.file.files?.[0];
  if (!file) return;
  try {
    setDirectorMode("edit");
    runtime?.stop();
    if (/\.(?:blockout\.)?zip$/i.test(file.name) || file.type === "application/zip") {
      const imported = await importPortableProjectPackage(file, projectPersistence, parseProject);
      await replaceProjectAndRestoreAssets(imported.project);
    } else {
      await replaceProjectAndRestoreAssets(parseProject(await file.text()));
    }
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
  clearRuntimeAssets();
  store.replaceProject(createEmptyProject());
  editor.setCameraPreset("perspective");
  showToast("已创建空场景");
});

elements.loadDemo.addEventListener("click", () => {
  elements.projectMenu.hidden = true;
  setDirectorMode("edit");
  runtime?.stop();
  clearRuntimeAssets();
  store.replaceProject(ensureInitialTimeline(createStarterProject()));
  editor.setCameraPreset("perspective");
  showToast("示例灰模已恢复");
});

elements.loadInteractionDemo.addEventListener("click", () => {
  elements.projectMenu.hidden = true;
  elements.moreMenuButton.setAttribute("aria-expanded", "false");
  setDirectorMode("edit");
  runtime?.stop();
  clearRuntimeAssets();
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
  const isCp03Control = event.target instanceof Element && Boolean(event.target.closest("#cp03-panel"));

  if (isCp02Case && isCp02Control) return;
  if (isCp02Case) {
    event.preventDefault();
    return;
  }
  if (isCp03Case && isCp03Control) return;
  if (isCp03Case) {
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

window.__BLOCKOUT_AGENT_BEHAVIOR__ = Object.freeze({
  contract: AGENT_BEHAVIOR_CONTRACT,
  actorIds: () => currentState.project.objects
    .filter((object) => object.entity?.role === "character")
    .map((object) => object.id),
  observe: (actorId) => buildAgentObservation(
    currentState.project,
    currentFrame ?? evaluateTimeline(currentState.project, runtime?.time ?? 0),
    actorId,
  ),
  compile: (command) => compileAgentBehaviorCommand(
    currentState.project,
    currentFrame ?? evaluateTimeline(currentState.project, runtime?.time ?? 0),
    structuredClone(command),
  ),
  submit: (actorId, command) => runAgentBehaviorTurn({
    project: currentState.project,
    frame: currentFrame ?? evaluateTimeline(currentState.project, runtime?.time ?? 0),
    actorId: String(actorId ?? ""),
    decide: async () => structuredClone(command),
  }),
});

window.__BLOCKOUT_MULTI_VIEW_GRAY__ = Object.freeze({
  async installSyntheticViewsForSmoke() {
    if (!multiViewGraySession.objectId) throw new Error("请先打开多视角灰模工作台。");
    const fixtures = [
      { id: "front", width: 144, height: 180, horizontalRadius: 44 },
      { id: "right", width: 112, height: 180, horizontalRadius: 31 },
      { id: "top", width: 144, height: 112, horizontalRadius: 44 },
    ];
    const views = {};
    for (const fixture of fixtures) {
      const pixels = new Uint8ClampedArray(fixture.width * fixture.height * 4);
      for (let y = 0; y < fixture.height; y += 1) {
        for (let x = 0; x < fixture.width; x += 1) {
          const offset = (y * fixture.width + x) * 4;
          const cx = fixture.width / 2;
          const cy = fixture.height / 2;
          const verticalRadius = fixture.height * 0.39;
          const ellipse = ((x - cx) / fixture.horizontalRadius) ** 2 + ((y - cy) / verticalRadius) ** 2 <= 1;
          const notch = fixture.id !== "top" && x > cx - 9 && x < cx + 9 && y < cy - verticalRadius * 0.55;
          const foreground = ellipse && !notch;
          pixels[offset] = foreground ? 54 : 244;
          pixels[offset + 1] = foreground ? 72 : 244;
          pixels[offset + 2] = foreground ? 92 : 244;
          pixels[offset + 3] = 255;
        }
      }
      const canvas = document.createElement("canvas");
      drawPixelBuffer(canvas, pixels, fixture.width, fixture.height);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("无法生成 smoke 视角图。")),
        "image/png",
      ));
      const image = {
        width: fixture.width,
        height: fixture.height,
        pixels,
        blob,
        sourceName: `smoke-${fixture.id}`,
        originalSize: [fixture.width, fixture.height],
      };
      const depthValues = new Float32Array(fixture.width * fixture.height);
      for (let y = 0; y < fixture.height; y += 1) {
        for (let x = 0; x < fixture.width; x += 1) {
          const u = fixture.width === 1 ? 0.5 : x / (fixture.width - 1);
          const v = fixture.height === 1 ? 0.5 : y / (fixture.height - 1);
          const radial = Math.max(0, 1 - Math.hypot((u - 0.5) * 1.45, (v - 0.5) * 1.05));
          const directional = fixture.id === "right" ? u * 0.08 : fixture.id === "top" ? v * 0.08 : 0;
          depthValues[y * fixture.width + x] = Math.min(1, 0.12 + radial * 0.8 + directional);
        }
      }
      views[fixture.id] = {
        id: fixture.id,
        image,
        silhouette: deriveSilhouetteMask({ pixels, width: fixture.width, height: fixture.height, threshold: 48 }),
        depth: {
          width: fixture.width,
          height: fixture.height,
          depth: depthValues,
          mean: depthValues.reduce((sum, value) => sum + value, 0) / depthValues.length,
          range: [0, 1],
          inverted: false,
          backend: "smoke-fixture",
          modelId: "deterministic/multi-view-depth-smoke",
          dtype: "float32",
        },
        depthEnabled: true,
      };
    }
    multiViewGraySession.views = views;
    multiViewGraySession.activeViewId = "front";
    multiViewGraySession.previewMode = "depth";
    elements.multiViewDepthInfluence.value = "0.35";
    elements.multiViewDepthTolerance.value = "0.08";
    invalidateMultiViewGrayModel("已安装离线多视角 smoke 夹具。");
    renderMultiViewGray();
    return { viewIds: Object.keys(views) };
  },
  snapshot() {
    return {
      objectId: multiViewGraySession.objectId,
      viewIds: CANONICAL_VIEW_DEFINITIONS.map(({ id }) => id).filter((id) => multiViewGraySession.views[id]),
      depthViewIds: CANONICAL_VIEW_DEFINITIONS.map(({ id }) => id).filter((id) => multiViewGraySession.views[id]?.depth),
      previewMode: multiViewGraySession.previewMode,
      guidedPairReady: multiViewGuidedPairReady(),
      mesh: multiViewGraySession.mesh ? {
        dimensions: multiViewGraySession.mesh.dimensions,
        voxelCount: multiViewGraySession.mesh.voxelCount,
        visualHullVoxelCount: multiViewGraySession.mesh.visualHullVoxelCount,
        depthCarvedVoxelCount: multiViewGraySession.mesh.depthCarvedVoxelCount,
        depthCarvedFraction: multiViewGraySession.mesh.depthCarvedFraction,
        depthRejectedVoxelCounts: multiViewGraySession.mesh.depthRejectedVoxelCounts,
        depthConflictVoxelCount: multiViewGraySession.mesh.depthConflictVoxelCount,
        depthInfluence: multiViewGraySession.mesh.depthInfluence,
        depthViewIds: multiViewGraySession.mesh.depthViewIds,
        vertexCount: multiViewGraySession.mesh.vertexCount,
        faceCount: multiViewGraySession.mesh.faceCount,
      } : null,
      objReady: Boolean(multiViewGraySession.objFile),
      recipeReady: Boolean(multiViewGraySession.recipeFile),
      traceLength: multiViewGraySession.trace.length,
    };
  },
});

window.__BLOCKOUT_SINGLE_IMAGE_3D__ = Object.freeze({
  installSyntheticDepthForSmoke() {
    const image = singleImage3dSession.image;
    if (!image) throw new Error("请先通过界面导入单图。");
    const depth = new Float32Array(image.width * image.height);
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const u = image.width === 1 ? 0.5 : x / (image.width - 1);
        const v = image.height === 1 ? 0.5 : y / (image.height - 1);
        const radial = Math.max(0, 1 - Math.hypot((u - 0.5) * 1.45, (v - 0.48) * 0.8));
        depth[y * image.width + x] = radial;
      }
    }
    singleImage3dSession.depth = {
      width: image.width,
      height: image.height,
      depth,
      mean: depth.reduce((sum, value) => sum + value, 0) / depth.length,
      range: [0, 1],
      inverted: false,
      backend: "smoke-fixture",
      modelId: "deterministic/single-image-depth-smoke",
      dtype: "float32",
    };
    singleImage3dSession.progress = 100;
    singleImage3dSession.progressText = "已安装离线 smoke 深度夹具。";
    invalidateSingleImageMesh();
    renderSingleImage3d();
    return { width: image.width, height: image.height };
  },
  snapshot() {
    return {
      objectId: singleImage3dSession.objectId,
      imageSize: singleImage3dSession.image
        ? [singleImage3dSession.image.width, singleImage3dSession.image.height]
        : null,
      depthReady: Boolean(singleImage3dSession.depth),
      mesh: singleImage3dSession.mesh ? {
        vertexCount: singleImage3dSession.mesh.vertexCount,
        faceCount: singleImage3dSession.mesh.faceCount,
      } : null,
      rigJointCount: singleImage3dSession.rig.joints.length,
      rigPreset: singleImage3dSession.rig.preset,
      rigFamily: singleImage3dSession.rig.family,
      selectedJoint: singleImage3dSession.selectedSlot,
      rigValidation: validateRigDraft(singleImage3dSession.rig),
      rigCapabilities: rigProfileFromDraft(singleImage3dSession.rig).capabilities,
      objReady: Boolean(singleImage3dSession.objFile),
      glbReady: Boolean(singleImage3dSession.glbFile),
    };
  },
});

window.addEventListener("beforeunload", () => {
  runtime?.dispose();
  editor.dispose();
  void browserDepthEstimator.dispose();
}, { once: true });

setupCp02Case();
setupCp03Case();
editor.setCameraPreset("perspective");
if (!isCp02Case) void restorePortableAssets(currentState.project, { announce: false });
