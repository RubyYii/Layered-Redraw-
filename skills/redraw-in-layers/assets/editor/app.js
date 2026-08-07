"use strict";

const INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape";
const GRAPHIC_SELECTOR = "path,rect,circle,ellipse,line,polyline,polygon,text,use,image";
const LAYER_ID_PATTERN = /^layer-[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  drag: null,
  ignoreClick: false,
  layers: [],
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

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3400);
}

function setCanvasStatus(message, kind = "idle") {
  elements.canvasHint.textContent = message;
  elements.statusDot.classList.toggle("is-ready", kind === "ready");
  elements.statusDot.classList.toggle("is-warning", kind === "warning");
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
  return (
    node.getAttributeNS(INKSCAPE_NS, "label") ||
    node.getAttribute("inkscape:label") ||
    node.dataset.label ||
    node.id ||
    "未命名图层"
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
  if (text.length > 8_000_000) throw new Error("SVG 超过 8 MB，首版编辑器暂不加载。请先简化路径。 ");
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(text, "image/svg+xml");
  const parseError = documentNode.querySelector("parsererror");
  if (parseError) throw new Error(`SVG 解析失败：${parseError.textContent.slice(0, 160)}`);
  const sourceSvg = documentNode.documentElement;
  if (sourceSvg.tagName.toLowerCase() !== "svg") throw new Error("文件根元素不是 SVG。");
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
  elements.requestJson.textContent = "等待生成…";
  elements.validationCard.hidden = true;

  renderLayers();
  renderSelection();
  updateActionAvailability();
  setCanvasStatus(`已载入 ${state.layers.length} 个语义图层`, "ready");
}

function layerById(id) {
  return state.layers.find((layer) => layer.id === id);
}

function renderLayers() {
  if (!state.layers.length) {
    elements.layerList.innerHTML = `
      <div class="layer-empty"><span aria-hidden="true">◇</span><p>没有发现语义顶层图层。请检查 data-layer 或 Inkscape layer 标记。</p></div>`;
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
    visibilityButton.setAttribute("aria-label", `${layer.hidden ? "显示" : "隐藏"} ${layer.label}`);
    visibilityButton.addEventListener("click", () => toggleVisibility(layer.id));

    const lockButton = document.createElement("button");
    lockButton.type = "button";
    lockButton.className = "layer-icon-button";
    lockButton.textContent = layer.locked ? "◆" : "◇";
    lockButton.setAttribute("aria-label", `${layer.locked ? "解锁" : "锁定"} ${layer.label}`);
    lockButton.addEventListener("click", () => toggleLock(layer.id));

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "layer-select-button";
    selectButton.innerHTML = `<strong></strong><small></small>`;
    selectButton.querySelector("strong").textContent = layer.label;
    selectButton.querySelector("small").textContent = `${layer.id} · ${layer.objectCount} objects`;
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
    if (layer?.locked) showToast(`“${layer.label}”已锁定，先解锁才能选择。`);
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
  elements.selectionSummary.textContent = selectedLayers.length ? `已选 ${selectedLayers.length} 层` : "未选择";
  elements.selectionChips.replaceChildren();
  if (state.mode === "semantic-text") {
    const chip = document.createElement("span");
    chip.className = "chip chip-muted";
    chip.textContent = "由文本语义自动定位";
    elements.selectionChips.append(chip);
    elements.contextNote.textContent = "请求不会预先绑定图层；Codex 将根据对象、位置和排除条件解析目标。";
  } else if (!selectedLayers.length) {
    const chip = document.createElement("span");
    chip.className = "chip chip-muted";
    chip.textContent = state.mode === "bbox" ? "拖动鼠标框选画面" : "尚未选择图层";
    elements.selectionChips.append(chip);
    elements.contextNote.textContent = state.mode === "bbox" ? "框选命中的图层与对象会成为修改边界。" : "点击画布对象或左侧图层来限定修改范围。";
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
      chip.textContent = `框选 ${Math.round(state.bbox.svg[2])} × ${Math.round(state.bbox.svg[3])}`;
      elements.selectionChips.append(chip);
    }
    elements.contextNote.textContent = `修改将限制在 ${selectedLayers.length} 个已选语义图层内。`;
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
  const labels = { layer: "图层点击", bbox: "画面框选", "semantic-text": "纯文本解析" };
  elements.selectionModeLabel.textContent = labels[mode];
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
  elements.requestJson.textContent = "等待生成…";
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
  if (!state.selectedIds.size) showToast("框选区域没有命中可编辑图层。");
}

function validateClient() {
  const errors = [];
  const warnings = [];
  if (!state.svg) return { ok: false, errors: ["尚未载入 SVG。"], warnings };
  const [, , width, height] = viewBoxValues(state.svg);
  if (width <= 0 || height <= 0) errors.push("viewBox 尺寸无效。");
  if (state.layers.length < 5 || state.layers.length > 20) {
    errors.push(`顶层语义图层应为 5–20 个；当前为 ${state.layers.length} 个。`);
  } else if (state.layers.length < 8 || state.layers.length > 12) {
    warnings.push(`图层数量有效，但推荐 8–12 个；当前为 ${state.layers.length} 个。`);
  }
  const ids = new Map();
  state.svg.querySelectorAll("[id]").forEach((node) => ids.set(node.id, (ids.get(node.id) || 0) + 1));
  const duplicates = [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  if (duplicates.length) errors.push(`存在重复 ID：${duplicates.join(", ")}`);
  state.layers.forEach((layer) => {
    if (!LAYER_ID_PATTERN.test(layer.id)) errors.push(`图层 ID 不符合规范：${layer.id}`);
    if (!layer.objectCount) errors.push(`图层为空：${layer.id}`);
  });
  if (state.svg.querySelector("script,foreignObject,iframe,object,embed")) errors.push("SVG 包含不可执行的危险元素。");
  const outputMode = state.projectMeta?.config?.output_mode;
  if (outputMode === "vector-strict" && state.svg.querySelector("image")) {
    errors.push("vector-strict 工程不能包含 image 元素。");
  }
  return { ok: errors.length === 0, errors, warnings };
}

function renderValidation(report) {
  elements.validationResults.replaceChildren();
  const entries = [];
  if (report.ok) entries.push({ text: `结构通过：${state.layers.length} 个语义图层。`, type: "ok" });
  report.errors.forEach((text) => entries.push({ text, type: "error" }));
  report.warnings.forEach((text) => entries.push({ text, type: "warning" }));
  entries.forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = entry.text;
    if (entry.type !== "ok") item.classList.add(`is-${entry.type}`);
    elements.validationResults.append(item);
  });
  elements.validationCard.hidden = false;
  setCanvasStatus(report.ok ? "SVG 图层结构通过" : "SVG 图层结构存在问题", report.ok ? "ready" : "warning");
  showToast(report.ok ? "结构检查通过。" : `发现 ${report.errors.length} 个结构问题。`);
}

function buildEditRequest() {
  const instruction = elements.instructionInput.value.trim();
  if (!state.svg || !instruction) return null;
  if (state.mode !== "semantic-text" && !state.selectedIds.size) {
    showToast("请先选择图层或框选画面。");
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
  setCanvasStatus("修改请求已生成，尚未改动画作", "ready");
  showToast("修改请求已生成；它不会直接改写 SVG。 ");
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
  showToast("edit-request.json 已下载。 ");
}

async function copyRequest() {
  const request = state.request || buildEditRequest();
  if (!request) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(request, null, 2));
    showToast("修改请求 JSON 已复制。 ");
  } catch {
    showToast("浏览器未允许剪贴板访问，请使用下载。 ");
  }
}

async function readSvgFile(file) {
  if (!file || !/\.svg$/i.test(file.name)) {
    showToast("请选择 .svg 文件。 ");
    return;
  }
  try {
    await loadSvgText(await file.text(), file.name);
    renderValidation(validateClient());
  } catch (error) {
    showToast(error.message || String(error));
    setCanvasStatus("SVG 载入失败", "warning");
  }
}

async function loadServerProject(showFailure = true) {
  try {
    const [projectResponse, artworkResponse] = await Promise.all([
      fetch("/api/project", { cache: "no-store" }),
      fetch("/api/artwork", { cache: "no-store" }),
    ]);
    if (!projectResponse.ok || !artworkResponse.ok) throw new Error("本地服务没有提供示例工程。 ");
    const project = await projectResponse.json();
    const artwork = await artworkResponse.text();
    await loadSvgText(artwork, project.source_name || "artwork.svg", project);
    const preferred = state.layers.find((layer) => layer.id === "layer-canal") || state.layers[0];
    if (preferred) selectLayer(preferred.id);
    renderValidation(validateClient());
    return true;
  } catch (error) {
    if (showFailure) showToast("请通过 layered_redraw.py serve 启动编辑器，或手动打开 SVG。 ");
    return false;
  }
}

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    elements.instructionInput.value = button.dataset.example;
    invalidateRequest();
    updateActionAvailability();
    elements.instructionInput.focus();
  });
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

setMode("layer");
if (location.protocol === "http:" || location.protocol === "https:") {
  loadServerProject(false);
}
