"use strict";

const INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape";
const GRAPHIC_SELECTOR = "path,rect,circle,ellipse,line,polyline,polygon,text,use,image";
const LAYER_ID_PATTERN = /^layer-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE_STORAGE_KEY = "layered-redraw-locale";

const TRANSLATIONS = {
  zh: {
    appTitle: "叠绘 · 语义图层编辑器",
    brandName: "叠绘",
    brandSubtitle: "Layered Redraw Studio",
    currentProject: "当前工程",
    noDocument: "尚未打开 SVG",
    fileActionsLabel: "文件与工程操作",
    languageLabel: "界面语言",
    openSvg: "打开 SVG",
    loadDemo: "载入示例",
    validateStructure: "检查结构",
    exportRequest: "导出修改请求",
    layersTitle: "语义图层",
    showAll: "全部显示",
    clearSelection: "清除选择",
    layerListLabel: "SVG 图层列表",
    layerEmptyInitial: "打开一个分层 SVG 后，图层会出现在这里。",
    layerEmptyDiscovered: "没有发现语义顶层图层。请检查 data-layer 或 Inkscape layer 标记。",
    layerLegendLabel: "图层状态图例",
    selectedLegend: "已选择",
    lockedLegend: "已锁定",
    canvasTitle: "画布",
    selectionMethodLabel: "选择方式",
    modeLayerShort: "图层点击",
    modeBboxShort: "框选",
    modeTextShort: "纯文本",
    modeLayer: "图层点击",
    modeBbox: "画面框选",
    modeText: "纯文本解析",
    selectionNone: "未选择",
    canvasStageLabel: "可交互 SVG 画布",
    canvasEmptyTitle: "从一张可编辑的 SVG 开始",
    canvasEmptyBody: "打开本地文件，或载入仓库中的运河示例。",
    chooseSvg: "选择 SVG 文件",
    waitingForProject: "等待载入工程",
    shortcuts: "Esc 清除 · Ctrl/⌘ + Enter 生成请求",
    instructionTitle: "修改意图",
    scopeTitle: "作用范围",
    noLayerSelected: "尚未选择图层",
    selectScopeHint: "点击画布对象或左侧图层来限定修改范围。",
    instructionLabel: "描述你希望发生的变化",
    instructionPlaceholder: "例如：让水面更偏灰绿色，减少波纹；保留建筑和暖色窗户不变。",
    promptExamplesLabel: "修改指令示例",
    exampleCalmWater: "安静水面",
    exampleCalmWaterText: "降低水面波纹密度，改为安静的灰绿色。",
    exampleWarmWindows: "暖色窗光",
    exampleWarmWindowsText: "把窗户光线调暖一些，但不要改变砖墙。",
    exampleWatercolour: "水彩海报",
    exampleWatercolourText: "让整体更像克制的水彩海报，保持现有图层结构。",
    protectUnselected: "保护未选图层",
    protectUnselectedHint: "在补丁中把其余图层列为不可改动。",
    buildRequest: "生成修改请求",
    copyJson: "复制 JSON",
    downloadFile: "下载文件",
    viewRequest: "查看请求内容",
    waitingToGenerate: "等待生成…",
    validationTitle: "结构检查",
    unnamedLayer: "未命名图层",
    svgTooLarge: "SVG 超过 8 MB，首版编辑器暂不加载。请先简化路径。",
    svgParseFailed: "SVG 解析失败：{detail}",
    rootNotSvg: "文件根元素不是 SVG。",
    loadedLayers: "已载入 {count} 个语义图层",
    showLayer: "显示 {label}",
    hideLayer: "隐藏 {label}",
    unlockLayer: "解锁 {label}",
    lockLayer: "锁定 {label}",
    objectCount: "{count} 个对象",
    lockedLayer: "“{label}”已锁定，先解锁才能选择。",
    selectedCount: "已选 {count} 层",
    semanticAuto: "由文本语义自动定位",
    semanticNote: "请求不会预先绑定图层；Codex 将根据对象、位置和排除条件解析目标。",
    bboxPrompt: "拖动鼠标框选画面",
    bboxNote: "框选命中的图层与对象会成为修改边界。",
    selectedScopeNote: "修改将限制在 {count} 个已选语义图层内。",
    bboxSize: "框选 {width} × {height}",
    bboxNoHit: "框选区域没有命中可编辑图层。",
    svgNotLoaded: "尚未载入 SVG。",
    invalidViewBox: "viewBox 尺寸无效。",
    layerCountRequired: "顶层语义图层应为 5–20 个；当前为 {count} 个。",
    layerCountRecommended: "图层数量有效，但推荐 8–12 个；当前为 {count} 个。",
    duplicateIds: "存在重复 ID：{ids}",
    invalidLayerId: "图层 ID 不符合规范：{id}",
    emptyLayer: "图层为空：{id}",
    dangerousElements: "SVG 包含不可执行的危险元素。",
    strictImage: "vector-strict 工程不能包含 image 元素。",
    structurePassed: "结构通过：{count} 个语义图层。",
    structureStatusOk: "SVG 图层结构通过",
    structureStatusBad: "SVG 图层结构存在问题",
    structureToastOk: "结构检查通过。",
    structureToastBad: "发现 {count} 个结构问题。",
    selectFirst: "请先选择图层或框选画面。",
    requestReadyStatus: "修改请求已生成，尚未改动画作",
    requestReadyToast: "修改请求已生成；它不会直接改写 SVG。",
    requestDownloaded: "edit-request.json 已下载。",
    requestCopied: "修改请求 JSON 已复制。",
    clipboardDenied: "浏览器未允许剪贴板访问，请使用下载。",
    chooseSvgFile: "请选择 .svg 文件。",
    svgLoadFailed: "SVG 载入失败",
    serverNoProject: "本地服务没有提供示例工程。",
    serveHint: "请通过 layered_redraw.py serve 启动编辑器，或手动打开 SVG。",
  },
  en: {
    appTitle: "Layered Redraw · Semantic SVG Editor",
    brandName: "Layered Redraw",
    brandSubtitle: "Semantic SVG Studio",
    currentProject: "Current project",
    noDocument: "No SVG open",
    fileActionsLabel: "File and project actions",
    languageLabel: "Interface language",
    openSvg: "Open SVG",
    loadDemo: "Load demo",
    validateStructure: "Validate",
    exportRequest: "Export edit request",
    layersTitle: "Semantic Layers",
    showAll: "Show all",
    clearSelection: "Clear selection",
    layerListLabel: "SVG layer list",
    layerEmptyInitial: "Open a layered SVG to inspect its semantic structure.",
    layerEmptyDiscovered: "No semantic top-level layers found. Check data-layer or Inkscape layer metadata.",
    layerLegendLabel: "Layer status legend",
    selectedLegend: "Selected",
    lockedLegend: "Locked",
    canvasTitle: "Canvas",
    selectionMethodLabel: "Selection method",
    modeLayerShort: "Layer click",
    modeBboxShort: "Frame",
    modeTextShort: "Text",
    modeLayer: "Layer click",
    modeBbox: "Region frame",
    modeText: "Text inference",
    selectionNone: "Nothing selected",
    canvasStageLabel: "Interactive SVG canvas",
    canvasEmptyTitle: "Start with an editable SVG",
    canvasEmptyBody: "Open a local file or load the canal demo from this repository.",
    chooseSvg: "Choose SVG file",
    waitingForProject: "Waiting for a project",
    shortcuts: "Esc clear · Ctrl/⌘ + Enter build request",
    instructionTitle: "Edit Intent",
    scopeTitle: "Scope",
    noLayerSelected: "No layer selected",
    selectScopeHint: "Click an object on the canvas or choose a layer to constrain the edit.",
    instructionLabel: "Describe the change you want",
    instructionPlaceholder: "For example: make the water quieter and grey-green; keep the buildings and warm windows unchanged.",
    promptExamplesLabel: "Edit instruction examples",
    exampleCalmWater: "Quiet water",
    exampleCalmWaterText: "Reduce the ripple density and shift the water to a quiet grey-green.",
    exampleWarmWindows: "Warmer windows",
    exampleWarmWindowsText: "Warm the window light without changing the brick walls.",
    exampleWatercolour: "Watercolour poster",
    exampleWatercolourText: "Make the artwork feel like a restrained watercolour poster while preserving the layer structure.",
    protectUnselected: "Protect unselected layers",
    protectUnselectedHint: "Mark every other layer as immutable in the patch.",
    buildRequest: "Build edit request",
    copyJson: "Copy JSON",
    downloadFile: "Download file",
    viewRequest: "View request payload",
    waitingToGenerate: "Waiting to generate…",
    validationTitle: "Structure validation",
    unnamedLayer: "Unnamed layer",
    svgTooLarge: "This SVG is larger than 8 MB. Simplify its paths before loading it in this editor.",
    svgParseFailed: "SVG parsing failed: {detail}",
    rootNotSvg: "The file root is not an SVG element.",
    loadedLayers: "Loaded {count} semantic layers",
    showLayer: "Show {label}",
    hideLayer: "Hide {label}",
    unlockLayer: "Unlock {label}",
    lockLayer: "Lock {label}",
    objectCountOne: "{count} object",
    objectCount: "{count} objects",
    lockedLayer: "“{label}” is locked. Unlock it before selecting.",
    selectedCountOne: "{count} layer selected",
    selectedCount: "{count} layers selected",
    semanticAuto: "Target inferred from text",
    semanticNote: "No layers are pre-bound; Codex resolves the target from objects, positions, and exclusions in the request.",
    bboxPrompt: "Drag to frame a region",
    bboxNote: "Layers and objects inside the frame become the edit boundary.",
    selectedScopeNoteOne: "The edit is constrained to {count} selected semantic layer.",
    selectedScopeNote: "The edit is constrained to {count} selected semantic layers.",
    bboxSize: "Frame {width} × {height}",
    bboxNoHit: "The framed region did not hit an editable layer.",
    svgNotLoaded: "No SVG has been loaded.",
    invalidViewBox: "The viewBox dimensions are invalid.",
    layerCountRequired: "A project needs 5–20 top-level semantic layers; found {count}.",
    layerCountRecommended: "The layer count is valid, but 8–12 is recommended; found {count}.",
    duplicateIds: "Duplicate IDs: {ids}",
    invalidLayerId: "Layer ID does not match the contract: {id}",
    emptyLayer: "Layer is empty: {id}",
    dangerousElements: "The SVG contains unsafe executable elements.",
    strictImage: "A vector-strict project cannot contain image elements.",
    structurePassed: "Structure passed: {count} semantic layers.",
    structureStatusOk: "SVG layer structure passed",
    structureStatusBad: "SVG layer structure has problems",
    structureToastOk: "Structure validation passed.",
    structureToastBad: "Found {count} structure problems.",
    selectFirst: "Select a layer or frame a region first.",
    requestReadyStatus: "Edit request built; artwork remains unchanged",
    requestReadyToast: "The edit request is ready. It does not rewrite the SVG directly.",
    requestDownloaded: "edit-request.json downloaded.",
    requestCopied: "Edit request JSON copied.",
    clipboardDenied: "Clipboard access was denied. Download the file instead.",
    chooseSvgFile: "Choose an .svg file.",
    svgLoadFailed: "SVG failed to load",
    serverNoProject: "The local server did not provide a demo project.",
    serveHint: "Start the editor with layered_redraw.py serve, or open an SVG manually.",
  },
};

function initialLocale() {
  const queryLocale = new URLSearchParams(window.location.search).get("lang");
  if (queryLocale === "zh" || queryLocale === "en") return queryLocale;
  try {
    const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (savedLocale === "zh" || savedLocale === "en") return savedLocale;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

const elements = {
  artboard: document.querySelector("#artboard"),
  buildRequestButton: document.querySelector("#buildRequestButton"),
  canvasEmpty: document.querySelector("#canvasEmpty"),
  canvasHint: document.querySelector("#canvasHint"),
  canvasSize: document.querySelector("#canvasSize"),
  canvasStage: document.querySelector("#canvasStage"),
  clearSelectionButton: document.querySelector("#clearSelectionButton"),
  contextNote: document.querySelector("#contextNote"),
  copyRequestButton: document.querySelector("#copyRequestButton"),
  documentName: document.querySelector("#documentName"),
  downloadRequestButton: document.querySelector("#downloadRequestButton"),
  dragBox: document.querySelector("#dragBox"),
  instructionInput: document.querySelector("#instructionInput"),
  layerCount: document.querySelector("#layerCount"),
  layerList: document.querySelector("#layerList"),
  loadDemoButton: document.querySelector("#loadDemoButton"),
  localeButtons: Array.from(document.querySelectorAll("[data-locale]")),
  preserveCheckbox: document.querySelector("#preserveCheckbox"),
  requestJson: document.querySelector("#requestJson"),
  requestPreview: document.querySelector("#requestPreview"),
  revisionBadge: document.querySelector("#revisionBadge"),
  selectionChips: document.querySelector("#selectionChips"),
  selectionModeLabel: document.querySelector("#selectionModeLabel"),
  selectionOverlay: document.querySelector("#selectionOverlay"),
  selectionSummary: document.querySelector("#selectionSummary"),
  showAllButton: document.querySelector("#showAllButton"),
  statusDot: document.querySelector("#statusDot"),
  svgFileInput: document.querySelector("#svgFileInput"),
  svgMount: document.querySelector("#svgMount"),
  toast: document.querySelector("#toast"),
  topExportButton: document.querySelector("#topExportButton"),
  validateButton: document.querySelector("#validateButton"),
  validationCard: document.querySelector("#validationCard"),
  validationResults: document.querySelector("#validationResults"),
};

const state = {
  bbox: null,
  canvasStatus: { key: "waitingForProject", vars: {}, kind: "idle" },
  drag: null,
  ignoreClick: false,
  layers: [],
  locale: initialLocale(),
  mode: "layer",
  projectMeta: null,
  request: null,
  revision: null,
  selectedIds: new Set(),
  selectedObjectIds: new Set(),
  sourceName: null,
  svg: null,
  toastTimer: null,
};

function t(key, variables = {}) {
  const template = TRANSLATIONS[state.locale]?.[key] ?? TRANSLATIONS.zh[key] ?? key;
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match;
  });
}

function refreshLayerLabels() {
  state.layers.forEach((layer) => {
    layer.label = layerLabel(layer.node);
  });
}

function renderCanvasStatus() {
  const { key, vars, kind } = state.canvasStatus;
  elements.canvasHint.textContent = t(key, vars);
  elements.statusDot.classList.toggle("is-ready", kind === "ready");
  elements.statusDot.classList.toggle("is-warning", kind === "warning");
}

function applyLocale(locale) {
  state.locale = locale === "en" ? "en" : "zh";
  window.clearTimeout(state.toastTimer);
  elements.toast.hidden = true;
  document.documentElement.lang = state.locale === "zh" ? "zh-CN" : "en";
  document.title = t("appTitle");
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, state.locale);
  } catch {
    // The interface still works when persistence is unavailable.
  }

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
  document.querySelectorAll("[data-example-key]").forEach((button) => {
    button.dataset.example = t(button.dataset.exampleKey);
  });
  elements.localeButtons.forEach((button) => {
    const active = button.dataset.locale === state.locale;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.documentName.textContent = state.sourceName || t("noDocument");
  elements.requestJson.textContent = state.request ? JSON.stringify(state.request, null, 2) : t("waitingToGenerate");
  const modeLabelKeys = { layer: "modeLayer", bbox: "modeBbox", "semantic-text": "modeText" };
  elements.selectionModeLabel.textContent = t(modeLabelKeys[state.mode]);

  refreshLayerLabels();
  renderLayers();
  renderSelection();
  renderCanvasStatus();
  if (!elements.validationCard.hidden && state.svg) renderValidation(validateClient(), false);
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3400);
}

function setCanvasStatus(key, variables = {}, kind = "idle") {
  state.canvasStatus = { key, vars: variables, kind };
  renderCanvasStatus();
}

function safeFilename(value) {
  const cleaned = value.replace(/\.svg$/i, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "layered-redraw";
}

async function shortHash(text) {
  try {
    const payload = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", payload);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 12);
  } catch {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0).toString(16).padStart(8, "0");
  }
}

function sanitizeSvgDocument(documentNode) {
  documentNode.querySelectorAll("script,foreignObject,iframe,object,embed").forEach((node) => node.remove());
  documentNode.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || value.includes("javascript:") || value.includes("url(http")) {
        node.removeAttribute(attribute.name);
      }
      if ((name === "href" || name.endsWith(":href")) && /^(https?:|file:|javascript:)/.test(value)) {
        node.removeAttribute(attribute.name);
      }
    }
  });
}

function layerLabel(node) {
  const localizedLabel = node.getAttribute(state.locale === "en" ? "data-label-en" : "data-label-zh");
  return (
    localizedLabel ||
    node.getAttributeNS(INKSCAPE_NS, "label") ||
    node.getAttribute("inkscape:label") ||
    node.dataset.label ||
    node.id ||
    t("unnamedLayer")
  );
}

function isLayerNode(node) {
  return (
    node instanceof SVGElement &&
    node.tagName.toLowerCase() === "g" &&
    (node.dataset.layer === "true" ||
      node.getAttributeNS(INKSCAPE_NS, "groupmode") === "layer" ||
      node.getAttribute("inkscape:groupmode") === "layer")
  );
}

function discoverLayers(svg) {
  return Array.from(svg.children)
    .filter(isLayerNode)
    .map((node, index) => {
      if (!node.id) node.id = `layer-unnamed-${index + 1}`;
      node.classList.add("lr-layer");
      const style = node.getAttribute("style") || "";
      const hidden = node.getAttribute("display") === "none" || style.replace(/\s/g, "").includes("display:none");
      const locked = node.dataset.locked === "true";
      node.classList.toggle("lr-is-hidden", hidden);
      node.classList.toggle("lr-is-locked", locked);
      return {
        id: node.id,
        index,
        label: layerLabel(node),
        locked,
        hidden,
        node,
        objectCount: node.querySelectorAll(GRAPHIC_SELECTOR).length,
      };
    });
}

function viewBoxValues(svg) {
  const viewBox = svg.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return [viewBox.x, viewBox.y, viewBox.width, viewBox.height];
  }
  const width = Number.parseFloat(svg.getAttribute("width")) || 1200;
  const height = Number.parseFloat(svg.getAttribute("height")) || 800;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  return [0, 0, width, height];
}

async function loadSvgText(text, sourceName, projectMeta = null) {
  if (text.length > 8_000_000) throw new Error(t("svgTooLarge"));
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(text, "image/svg+xml");
  const parseError = documentNode.querySelector("parsererror");
  if (parseError) throw new Error(t("svgParseFailed", { detail: parseError.textContent.slice(0, 160) }));
  const sourceSvg = documentNode.documentElement;
  if (sourceSvg.tagName.toLowerCase() !== "svg") throw new Error(t("rootNotSvg"));
  sanitizeSvgDocument(documentNode);

  const svg = document.importNode(sourceSvg, true);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("aria-label", sourceSvg.querySelector("title")?.textContent || sourceName);
  svg.setAttribute("tabindex", "-1");

  elements.svgMount.replaceChildren(svg);
  state.svg = svg;
  state.layers = discoverLayers(svg);
  state.selectedIds.clear();
  state.selectedObjectIds.clear();
  state.bbox = null;
  state.request = null;
  state.projectMeta = projectMeta;
  state.sourceName = sourceName;
  state.revision = projectMeta?.manifest?.revision || (await shortHash(text));

  const [, , width, height] = viewBoxValues(svg);
  elements.artboard.style.aspectRatio = `${width} / ${height}`;
  elements.artboard.hidden = false;
  elements.canvasEmpty.hidden = true;
  elements.documentName.textContent = sourceName;
  elements.revisionBadge.textContent = state.revision;
  elements.canvasSize.textContent = `${Math.round(width)} × ${Math.round(height)}`;
  elements.layerCount.textContent = String(state.layers.length);
  elements.showAllButton.disabled = false;
  elements.clearSelectionButton.disabled = false;
  elements.validateButton.disabled = false;
  elements.topExportButton.disabled = true;
  elements.copyRequestButton.disabled = true;
  elements.downloadRequestButton.disabled = true;
  elements.requestJson.textContent = t("waitingToGenerate");
  elements.validationCard.hidden = true;

  renderLayers();
  renderSelection();
  updateActionAvailability();
  setCanvasStatus("loadedLayers", { count: state.layers.length }, "ready");
}

function layerById(id) {
  return state.layers.find((layer) => layer.id === id);
}

function renderLayers() {
  if (!state.layers.length) {
    elements.layerList.innerHTML = `
      <div class="layer-empty"><span aria-hidden="true">◇</span><p></p></div>`;
    elements.layerList.querySelector("p").textContent = t(state.svg ? "layerEmptyDiscovered" : "layerEmptyInitial");
    return;
  }

  const fragment = document.createDocumentFragment();
  [...state.layers].reverse().forEach((layer) => {
    const row = document.createElement("div");
    row.className = "layer-row";
    row.classList.toggle("is-selected", state.selectedIds.has(layer.id));
    row.classList.toggle("is-hidden", layer.hidden);
    row.classList.toggle("is-locked", layer.locked);
    row.dataset.layerId = layer.id;
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-selected", String(state.selectedIds.has(layer.id)));

    const visibilityButton = document.createElement("button");
    visibilityButton.type = "button";
    visibilityButton.className = "layer-icon-button";
    visibilityButton.textContent = layer.hidden ? "○" : "●";
    visibilityButton.setAttribute("aria-label", t(layer.hidden ? "showLayer" : "hideLayer", { label: layer.label }));
    visibilityButton.addEventListener("click", () => toggleVisibility(layer.id));

    const lockButton = document.createElement("button");
    lockButton.type = "button";
    lockButton.className = "layer-icon-button";
    lockButton.textContent = layer.locked ? "◆" : "◇";
    lockButton.setAttribute("aria-label", t(layer.locked ? "unlockLayer" : "lockLayer", { label: layer.label }));
    lockButton.addEventListener("click", () => toggleLock(layer.id));

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "layer-select-button";
    selectButton.innerHTML = `<strong></strong><small></small>`;
    selectButton.querySelector("strong").textContent = layer.label;
    const objectCountKey = state.locale === "en" && layer.objectCount === 1 ? "objectCountOne" : "objectCount";
    selectButton.querySelector("small").textContent = `${layer.id} · ${t(objectCountKey, { count: layer.objectCount })}`;
    selectButton.addEventListener("click", (event) => {
      selectLayer(layer.id, event.ctrlKey || event.metaKey || event.shiftKey);
    });

    row.append(visibilityButton, lockButton, selectButton);
    fragment.append(row);
  });
  elements.layerList.replaceChildren(fragment);
}

function toggleVisibility(id) {
  const layer = layerById(id);
  if (!layer) return;
  layer.hidden = !layer.hidden;
  layer.node.classList.toggle("lr-is-hidden", layer.hidden);
  if (layer.hidden) state.selectedIds.delete(id);
  invalidateRequest();
  renderLayers();
  renderSelection();
}

function toggleLock(id) {
  const layer = layerById(id);
  if (!layer) return;
  layer.locked = !layer.locked;
  layer.node.classList.toggle("lr-is-locked", layer.locked);
  if (layer.locked) state.selectedIds.delete(id);
  invalidateRequest();
  renderLayers();
  renderSelection();
}

function selectLayer(id, additive = false, objectId = null) {
  const layer = layerById(id);
  if (!layer || layer.locked || layer.hidden) {
    if (layer?.locked) showToast(t("lockedLayer", { label: layer.label }));
    return;
  }
  if (!additive) {
    state.selectedIds.clear();
    state.selectedObjectIds.clear();
  }
  if (additive && state.selectedIds.has(id)) {
    state.selectedIds.delete(id);
  } else {
    state.selectedIds.add(id);
  }
  if (objectId && objectId !== id) state.selectedObjectIds.add(objectId);
  state.bbox = null;
  invalidateRequest();
  renderLayers();
  renderSelection();
}

function clearSelection() {
  state.selectedIds.clear();
  state.selectedObjectIds.clear();
  state.bbox = null;
  invalidateRequest();
  renderLayers();
  renderSelection();
}

function findOwningLayer(target) {
  let current = target instanceof Element ? target : null;
  while (current && current !== state.svg) {
    if (isLayerNode(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function renderSelection() {
  elements.selectionOverlay.replaceChildren();
  state.layers.forEach((layer) => {
    layer.node.classList.toggle("lr-is-selected", state.selectedIds.has(layer.id));
  });

  const stageRect = elements.canvasStage.getBoundingClientRect();
  for (const id of state.selectedIds) {
    const layer = layerById(id);
    if (!layer || layer.hidden) continue;
    const rect = layer.node.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const outline = document.createElement("div");
    outline.className = "layer-outline";
    outline.style.left = `${rect.left - stageRect.left}px`;
    outline.style.top = `${rect.top - stageRect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    const label = document.createElement("span");
    label.textContent = layer.label;
    outline.append(label);
    elements.selectionOverlay.append(outline);
  }

  const selectedLayers = [...state.selectedIds].map(layerById).filter(Boolean);
  const selectedCountKey = state.locale === "en" && selectedLayers.length === 1 ? "selectedCountOne" : "selectedCount";
  elements.selectionSummary.textContent = selectedLayers.length ? t(selectedCountKey, { count: selectedLayers.length }) : t("selectionNone");
  elements.selectionChips.replaceChildren();
  if (state.mode === "semantic-text") {
    const chip = document.createElement("span");
    chip.className = "chip chip-muted";
    chip.textContent = t("semanticAuto");
    elements.selectionChips.append(chip);
    elements.contextNote.textContent = t("semanticNote");
  } else if (!selectedLayers.length) {
    const chip = document.createElement("span");
    chip.className = "chip chip-muted";
    chip.textContent = t(state.mode === "bbox" ? "bboxPrompt" : "noLayerSelected");
    elements.selectionChips.append(chip);
    elements.contextNote.textContent = t(state.mode === "bbox" ? "bboxNote" : "selectScopeHint");
  } else {
    selectedLayers.forEach((layer) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = layer.label;
      chip.title = layer.id;
      elements.selectionChips.append(chip);
    });
    if (state.bbox) {
      const chip = document.createElement("span");
      chip.className = "chip chip-muted";
      chip.textContent = t("bboxSize", {
        width: Math.round(state.bbox.svg[2]),
        height: Math.round(state.bbox.svg[3]),
      });
      elements.selectionChips.append(chip);
    }
    const selectedScopeKey = state.locale === "en" && selectedLayers.length === 1 ? "selectedScopeNoteOne" : "selectedScopeNote";
    elements.contextNote.textContent = t(selectedScopeKey, { count: selectedLayers.length });
  }
  updateActionAvailability();
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  elements.canvasStage.classList.toggle("is-box-mode", mode === "bbox");
  elements.canvasStage.classList.toggle("is-text-mode", mode === "semantic-text");
  const labelKeys = { layer: "modeLayer", bbox: "modeBbox", "semantic-text": "modeText" };
  elements.selectionModeLabel.textContent = t(labelKeys[mode]);
  if (mode === "semantic-text") {
    state.bbox = null;
    state.selectedObjectIds.clear();
  }
  invalidateRequest();
  renderSelection();
}

function updateActionAvailability() {
  const hasInstruction = elements.instructionInput.value.trim().length > 0;
  const hasScope = state.mode === "semantic-text" || state.selectedIds.size > 0;
  elements.buildRequestButton.disabled = !(state.svg && hasInstruction && hasScope);
}

function invalidateRequest() {
  state.request = null;
  elements.topExportButton.disabled = true;
  elements.copyRequestButton.disabled = true;
  elements.downloadRequestButton.disabled = true;
  elements.requestJson.textContent = t("waitingToGenerate");
}

function relativePointer(event) {
  const rect = elements.canvasStage.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top, rect };
}

function drawDragBox(start, current) {
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  Object.assign(elements.dragBox.style, {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
  elements.dragBox.hidden = false;
}

function pointToSvg(clientX, clientY) {
  if (!state.svg) return null;
  const matrix = state.svg.getScreenCTM();
  if (!matrix) return null;
  const point = state.svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(matrix.inverse());
}

function intersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function finishBoxSelection(event) {
  const drag = state.drag;
  if (!drag) return;
  const end = relativePointer(event);
  const stageRect = drag.stageRect;
  const left = Math.min(drag.startClientX, event.clientX);
  const top = Math.min(drag.startClientY, event.clientY);
  const right = Math.max(drag.startClientX, event.clientX);
  const bottom = Math.max(drag.startClientY, event.clientY);
  const selectionRect = { left, top, right, bottom, width: right - left, height: bottom - top };
  elements.dragBox.hidden = true;
  state.drag = null;
  state.ignoreClick = true;
  window.setTimeout(() => { state.ignoreClick = false; }, 0);

  if (selectionRect.width < 6 && selectionRect.height < 6) {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const layerNode = findOwningLayer(target);
    if (layerNode) selectLayer(layerNode.id, event.ctrlKey || event.metaKey || event.shiftKey, target.id);
    return;
  }

  state.selectedIds.clear();
  state.selectedObjectIds.clear();
  for (const layer of state.layers) {
    if (layer.hidden || layer.locked) continue;
    const rect = layer.node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && intersects(selectionRect, rect)) {
      state.selectedIds.add(layer.id);
      layer.node.querySelectorAll(GRAPHIC_SELECTOR).forEach((object) => {
        if (!object.id || state.selectedObjectIds.size >= 100) return;
        const objectRect = object.getBoundingClientRect();
        if (objectRect.width > 0 && objectRect.height > 0 && intersects(selectionRect, objectRect)) {
          state.selectedObjectIds.add(object.id);
        }
      });
    }
  }

  const svgStart = pointToSvg(left, top);
  const svgEnd = pointToSvg(right, bottom);
  if (svgStart && svgEnd && state.svg) {
    const [viewX, viewY, viewWidth, viewHeight] = viewBoxValues(state.svg);
    const x = Math.min(svgStart.x, svgEnd.x);
    const y = Math.min(svgStart.y, svgEnd.y);
    const width = Math.abs(svgEnd.x - svgStart.x);
    const height = Math.abs(svgEnd.y - svgStart.y);
    state.bbox = {
      svg: [x, y, width, height],
      normalized: [
        (x - viewX) / viewWidth,
        (y - viewY) / viewHeight,
        width / viewWidth,
        height / viewHeight,
      ].map((value) => Number(Math.max(0, Math.min(1, value)).toFixed(6))),
      screen: [left - stageRect.left, top - stageRect.top, selectionRect.width, selectionRect.height],
    };
  }

  invalidateRequest();
  renderLayers();
  renderSelection();
  if (!state.selectedIds.size) showToast(t("bboxNoHit"));
}

function validateClient() {
  const errors = [];
  const warnings = [];
  if (!state.svg) return { ok: false, errors: [t("svgNotLoaded")], warnings };
  const [, , width, height] = viewBoxValues(state.svg);
  if (width <= 0 || height <= 0) errors.push(t("invalidViewBox"));
  if (state.layers.length < 5 || state.layers.length > 20) {
    errors.push(t("layerCountRequired", { count: state.layers.length }));
  } else if (state.layers.length < 8 || state.layers.length > 12) {
    warnings.push(t("layerCountRecommended", { count: state.layers.length }));
  }
  const ids = new Map();
  state.svg.querySelectorAll("[id]").forEach((node) => ids.set(node.id, (ids.get(node.id) || 0) + 1));
  const duplicates = [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  if (duplicates.length) errors.push(t("duplicateIds", { ids: duplicates.join(", ") }));
  state.layers.forEach((layer) => {
    if (!LAYER_ID_PATTERN.test(layer.id)) errors.push(t("invalidLayerId", { id: layer.id }));
    if (!layer.objectCount) errors.push(t("emptyLayer", { id: layer.id }));
  });
  if (state.svg.querySelector("script,foreignObject,iframe,object,embed")) errors.push(t("dangerousElements"));
  const outputMode = state.projectMeta?.config?.output_mode;
  if (outputMode === "vector-strict" && state.svg.querySelector("image")) {
    errors.push(t("strictImage"));
  }
  return { ok: errors.length === 0, errors, warnings };
}

function renderValidation(report, notify = true) {
  elements.validationResults.replaceChildren();
  const entries = [];
  if (report.ok) entries.push({ text: t("structurePassed", { count: state.layers.length }), type: "ok" });
  report.errors.forEach((text) => entries.push({ text, type: "error" }));
  report.warnings.forEach((text) => entries.push({ text, type: "warning" }));
  entries.forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = entry.text;
    if (entry.type !== "ok") item.classList.add(`is-${entry.type}`);
    elements.validationResults.append(item);
  });
  elements.validationCard.hidden = false;
  setCanvasStatus(report.ok ? "structureStatusOk" : "structureStatusBad", {}, report.ok ? "ready" : "warning");
  if (notify) showToast(report.ok ? t("structureToastOk") : t("structureToastBad", { count: report.errors.length }));
}

function buildEditRequest() {
  const instruction = elements.instructionInput.value.trim();
  if (!state.svg || !instruction) return null;
  if (state.mode !== "semantic-text" && !state.selectedIds.size) {
    showToast(t("selectFirst"));
    return null;
  }
  const [x, y, width, height] = viewBoxValues(state.svg);
  const expectedChangedLayers = state.mode === "semantic-text" ? [] : [...state.selectedIds];
  const preserved = elements.preserveCheckbox.checked
    ? state.layers.map((layer) => layer.id).filter((id) => !state.selectedIds.has(id))
    : [];
  const request = {
    schema_version: "1.0",
    kind: "layered-redraw-edit-request",
    created_at: new Date().toISOString(),
    source: {
      file: state.sourceName,
      base_revision: state.revision,
      view_box: [x, y, width, height],
    },
    selection: {
      mode: state.mode,
      layer_ids: expectedChangedLayers,
      object_ids: state.mode === "semantic-text" ? [] : [...state.selectedObjectIds],
      bbox: state.mode === "bbox" ? state.bbox?.svg || null : null,
      bbox_normalized: state.mode === "bbox" ? state.bbox?.normalized || null : null,
    },
    instruction,
    expected_changed_layers: expectedChangedLayers,
    preserve_layers: preserved,
    constraints: {
      preserve_unselected: elements.preserveCheckbox.checked,
      preserve_stable_layer_ids: true,
      require_patch_plan: true,
    },
    ui_context: {
      hidden_layers: state.layers.filter((layer) => layer.hidden).map((layer) => layer.id),
      locked_layers: state.layers.filter((layer) => layer.locked).map((layer) => layer.id),
    },
    status: "requires-planning",
  };
  state.request = request;
  elements.requestJson.textContent = JSON.stringify(request, null, 2);
  elements.requestPreview.open = true;
  elements.copyRequestButton.disabled = false;
  elements.downloadRequestButton.disabled = false;
  elements.topExportButton.disabled = false;
  setCanvasStatus("requestReadyStatus", {}, "ready");
  showToast(t("requestReadyToast"));
  return request;
}

function downloadRequest() {
  const request = state.request || buildEditRequest();
  if (!request) return;
  const payload = new Blob([JSON.stringify(request, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(payload);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(state.sourceName || "artwork")}-edit-request.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast(t("requestDownloaded"));
}

async function copyRequest() {
  const request = state.request || buildEditRequest();
  if (!request) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(request, null, 2));
    showToast(t("requestCopied"));
  } catch {
    showToast(t("clipboardDenied"));
  }
}

async function readSvgFile(file) {
  if (!file || !/\.svg$/i.test(file.name)) {
    showToast(t("chooseSvgFile"));
    return;
  }
  try {
    await loadSvgText(await file.text(), file.name);
    renderValidation(validateClient());
  } catch (error) {
    showToast(error.message || String(error));
    setCanvasStatus("svgLoadFailed", {}, "warning");
  }
}

async function loadServerProject(showFailure = true) {
  try {
    const [projectResponse, artworkResponse] = await Promise.all([
      fetch("/api/project", { cache: "no-store" }),
      fetch("/api/artwork", { cache: "no-store" }),
    ]);
    if (!projectResponse.ok || !artworkResponse.ok) throw new Error(t("serverNoProject"));
    const project = await projectResponse.json();
    const artwork = await artworkResponse.text();
    await loadSvgText(artwork, project.source_name || "artwork.svg", project);
    const preferred = state.layers.find((layer) => layer.id === "layer-canal") || state.layers[0];
    if (preferred) selectLayer(preferred.id);
    renderValidation(validateClient());
    return true;
  } catch (error) {
    if (showFailure) showToast(t("serveHint"));
    return false;
  }
}

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

document.querySelectorAll("[data-example-key]").forEach((button) => {
  button.addEventListener("click", () => {
    elements.instructionInput.value = button.dataset.example;
    invalidateRequest();
    updateActionAvailability();
    elements.instructionInput.focus();
  });
});

elements.localeButtons.forEach((button) => {
  button.addEventListener("click", () => applyLocale(button.dataset.locale));
});

elements.svgFileInput.addEventListener("change", () => readSvgFile(elements.svgFileInput.files[0]));
elements.loadDemoButton.addEventListener("click", () => loadServerProject(true));
elements.validateButton.addEventListener("click", () => renderValidation(validateClient()));
elements.showAllButton.addEventListener("click", () => {
  state.layers.forEach((layer) => {
    layer.hidden = false;
    layer.node.classList.remove("lr-is-hidden");
  });
  renderLayers();
  renderSelection();
});
elements.clearSelectionButton.addEventListener("click", clearSelection);
elements.buildRequestButton.addEventListener("click", buildEditRequest);
elements.downloadRequestButton.addEventListener("click", downloadRequest);
elements.copyRequestButton.addEventListener("click", copyRequest);
elements.topExportButton.addEventListener("click", downloadRequest);
elements.instructionInput.addEventListener("input", () => {
  invalidateRequest();
  updateActionAvailability();
});
elements.preserveCheckbox.addEventListener("change", invalidateRequest);

elements.canvasStage.addEventListener("click", (event) => {
  if (state.ignoreClick || state.mode !== "layer" || !state.svg) return;
  const layerNode = findOwningLayer(event.target);
  if (!layerNode) return;
  selectLayer(layerNode.id, event.ctrlKey || event.metaKey || event.shiftKey, event.target.id || null);
});

elements.canvasStage.addEventListener("pointerdown", (event) => {
  if (state.mode !== "bbox" || !state.svg || event.button !== 0) return;
  const point = relativePointer(event);
  state.drag = {
    pointerId: event.pointerId,
    start: { x: point.x, y: point.y },
    startClientX: event.clientX,
    startClientY: event.clientY,
    stageRect: point.rect,
  };
  elements.canvasStage.setPointerCapture(event.pointerId);
  drawDragBox(state.drag.start, state.drag.start);
  event.preventDefault();
});

elements.canvasStage.addEventListener("pointermove", (event) => {
  if (!state.drag || state.drag.pointerId !== event.pointerId) return;
  const point = relativePointer(event);
  drawDragBox(state.drag.start, point);
});

elements.canvasStage.addEventListener("pointerup", (event) => {
  if (!state.drag || state.drag.pointerId !== event.pointerId) return;
  finishBoxSelection(event);
});

elements.canvasStage.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});
elements.canvasStage.addEventListener("drop", (event) => {
  event.preventDefault();
  readSvgFile(event.dataTransfer.files[0]);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") clearSelection();
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    buildEditRequest();
  }
});

const resizeObserver = new ResizeObserver(() => {
  if (state.svg) window.requestAnimationFrame(renderSelection);
});
resizeObserver.observe(elements.canvasStage);

applyLocale(state.locale);
setMode("layer");
if (location.protocol === "http:" || location.protocol === "https:") {
  loadServerProject(false);
}
