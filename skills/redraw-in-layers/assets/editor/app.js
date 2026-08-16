"use strict";

const INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape";
const GRAPHIC_SELECTOR = "path,rect,circle,ellipse,line,polyline,polygon,text,use,image";
const LAYER_ID_PATTERN = /^layer-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE_STORAGE_KEY = "layered-redraw-locale";

const TRANSLATIONS = {
  zh: {
    appTitle: "叠绘 · 语义图层工作室",
    brandName: "叠绘",
    brandSubtitle: "Layered Redraw Studio",
    currentProject: "当前工程",
    noDocument: "尚未打开工程",
    fileActionsLabel: "文件与工程操作",
    languageLabel: "界面语言",
    openSvg: "打开 SVG",
    loadDemo: "载入示例",
    validateStructure: "检查结构",
    qualityReport: "质量报告",
    undoLast: "撤销",
    exportRequest: "导出修改请求",
    layersTitle: "语义图层",
    showAll: "全部显示",
    clearSelection: "清除选择",
    layerControlsTitle: "图层合成",
    opacityLabel: "透明度",
    blendModeLabel: "混合模式",
    blendNormal: "正常",
    blendMultiply: "正片叠底",
    blendScreen: "滤色",
    blendOverlay: "叠加",
    blendDarken: "变暗",
    blendLighten: "变亮",
    layerTypeLabel: "图层类型",
    layerTypeRaster: "位图",
    layerTypeVector: "矢量源＋位图渲染",
    layerTypePixel: "像素",
    editableSourceLabel: "可编辑源文件",
    labelZh: "中文名称",
    labelEn: "英文名称",
    moveDown: "下移",
    moveUp: "上移",
    applySettings: "应用设置",
    transformTitle: "位置与变换",
    layerRoleLabel: "遮挡角色",
    roleArtwork: "普通画面",
    roleMovable: "可移动物体",
    roleDependent: "随物体变化的阴影／反射",
    roleCleanPlate: "完整背景（锁定）",
    translateXLabel: "水平位移 px",
    translateYLabel: "垂直位移 px",
    scaleXLabel: "水平缩放 %",
    scaleYLabel: "垂直缩放 %",
    rotationLabel: "旋转 °",
    anchorXLabel: "锚点 X（0–1）",
    anchorYLabel: "锚点 Y（0–1）",
    resetTransform: "重置变换",
    recomposeTitle: "背景补全与遮挡重组",
    recomposeIntro: "先用原图和移除遮罩建立完整背景，再自由移动、缩放图层和调整前后关系。遮罩外像素会被强制保留。",
    recomposeStatusOff: "尚未建立",
    recomposeStatusPending: "等待完整背景",
    recomposeStatusReady: "可重组",
    recomposeSource: "原始完整照片",
    recomposeMask: "移除遮罩（白色为需补全区域）",
    recomposePrompt: "补全方向（可选）",
    recomposePromptPlaceholder: "例如：延续墙面纹理和光线，不添加新物体。",
    recomposeInitialize: "建立补全任务",
    cleanPlateCandidate: "生成后的完整背景",
    cleanPlateModel: "模型／工具（可选）",
    cleanPlateSeed: "随机种子（可选）",
    cleanPlateRegister: "登记完整背景",
    layerListLabel: "语义图层列表",
    layerEmptyInitial: "打开分层工程后，图层会出现在这里。",
    layerEmptyDiscovered: "没有发现语义顶层图层。请检查 data-layer 或 Inkscape layer 标记。",
    layerLegendLabel: "图层状态图例",
    selectedLegend: "已选择",
    lockedLegend: "已锁定",
    canvasTitle: "画布",
    canvasKickerVector: "VECTOR CANVAS",
    canvasKickerRaster: "RASTER LAYER STACK",
    canvasKickerPixel: "PIXEL LAYER STACK",
    outputModeVector: "矢量",
    outputModeRaster: "位图分层",
    outputModePixel: "像素分层",
    selectionMethodLabel: "选择方式",
    modeLayerShort: "图层点击",
    modeBboxShort: "框选",
    modeLassoShort: "套索",
    modeBrushShort: "画笔",
    modeTextShort: "纯文本",
    modeLayer: "图层点击",
    modeBbox: "画面框选",
    modeLasso: "套索蒙版",
    modeBrush: "画笔蒙版",
    modeText: "纯文本解析",
    selectionNone: "未选择",
    canvasStageLabel: "可交互分层画布",
    canvasEmptyTitle: "从一个可编辑的分层工程开始",
    canvasEmptyBody: "打开本地 SVG，或通过本地服务载入矢量／位图工程。",
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
    includeLinkedLayers: "包含关联图层",
    includeLinkedLayersHint: "把主体的光影、投影和依赖层一并纳入修改范围。",
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
    maskPrompt: "先选择目标图层，再在画布上绘制修改蒙版。",
    maskRequired: "请先在画布上绘制非空蒙版。",
    maskSaved: "选区蒙版已保存到工程。",
    brushSize: "画笔大小",
    clearMask: "清除蒙版",
    compareOpacity: "历史版本透明度",
    closeCompare: "关闭对比",
    svgNotLoaded: "尚未载入工程。",
    invalidViewBox: "viewBox 尺寸无效。",
    layerCountRequired: "顶层语义图层应为 5–20 个；当前为 {count} 个。",
    layerCountRecommended: "图层数量有效，但推荐 8–12 个；当前为 {count} 个。",
    duplicateIds: "存在重复 ID：{ids}",
    invalidLayerId: "图层 ID 不符合规范：{id}",
    emptyLayer: "图层为空：{id}",
    dangerousElements: "SVG 包含不可执行的危险元素。",
    strictImage: "vector-strict 工程不能包含 image 元素。",
    structurePassed: "结构通过：{count} 个语义图层。",
    structureStatusOk: "工程图层结构通过",
    structureStatusBad: "工程图层结构存在问题",
    structureToastOk: "结构检查通过。",
    structureToastBad: "发现 {count} 个结构问题。",
    selectFirst: "请先选择图层或框选画面。",
    requestReadyStatus: "修改请求已生成，尚未改动画作",
    requestReadyToast: "修改请求已生成；它不会直接改写当前工程。",
    requestDownloaded: "edit-request.json 已下载。",
    requestCopied: "修改请求 JSON 已复制。",
    layerSettingsSaved: "图层合成设置已保存，并创建了可恢复版本。",
    recomposeInitialized: "背景补全任务已建立；请生成并登记完整背景。",
    cleanPlateRegistered: "完整背景已登记，遮罩外像素校验通过。",
    chooseSourceAndMask: "请同时选择原图和移除遮罩。",
    chooseCleanPlate: "请选择生成后的完整背景。",
    serverActionFailed: "本地工程操作失败：{detail}",
    historyTitle: "版本历史",
    historyEmpty: "应用修改后，可恢复版本会显示在这里。",
    compareVersion: "对比",
    restoreVersion: "恢复",
    historyRestored: "历史版本已恢复。",
    historyPreviewUnavailable: "这个版本没有可显示的位图预览。",
    qualityScore: "工程质量 {score}/100",
    designReadiness: "计划结构完整度 {score}/100",
    clipboardDenied: "浏览器未允许剪贴板访问，请使用下载。",
    chooseSvgFile: "请选择 .svg 文件。",
    svgLoadFailed: "SVG 载入失败",
    serverNoProject: "本地服务没有提供示例工程。",
    workflowModeLabel: "工作模式",
    guidedMode: "引导创作",
    expertMode: "艺术指导",
    guidedDesignKicker: "DESIGN PRESETS",
    guidedDesignTitle: "设计模板",
    guidedDesignIntro: "模板会同时改变构图、比例、空间、造型、明暗和色彩；不会向画面加入文字。",
    expertDesignKicker: "VISUAL GRAMMAR",
    expertDesignTitle: "完整设计系统",
    expertDesignIntro: "直接控制构图和比例；材质只属于最后一组参数。",
    textFreeBadge: "无画面文字",
    faithfulnessLabel: "忠于原图",
    abstractionLabel: "抽象程度",
    subjectEmphasisLabel: "主体强调",
    spaceFlatteningLabel: "空间平面化",
    colorIntensityLabel: "色彩强度",
    applyPreset: "应用设计模板",
    compositionGroup: "构图与比例",
    balanceLabel: "平衡方式",
    balanceObserved: "保留观察关系",
    balanceAsymmetric: "不对称平衡",
    balanceMonumental: "中心纪念式",
    balanceDiagonal: "动态对角线",
    balanceLayered: "平静层叠",
    balanceNarrative: "叙事路径",
    subjectScaleLabel: "主体比例",
    cropStrengthLabel: "重新裁切",
    negativeSpaceLabel: "留白比例",
    asymmetryLabel: "不对称程度",
    spaceFormGroup: "空间与造型",
    flatteningLabel: "透视压平",
    depthLabel: "景深分离",
    perspectiveLabel: "透视强度",
    simplificationLabel: "形状概括",
    geometricityLabel: "几何化",
    exaggerationLabel: "比例夸张",
    closureLabel: "轮廓闭合",
    valueColorGroup: "明暗与色彩",
    valueGroupsLabel: "明度组数",
    paletteSizeLabel: "色板数量",
    contrastLabel: "整体反差",
    focalContrastLabel: "焦点反差",
    expertColorIntensityLabel: "色彩强度",
    warmthLabel: "冷暖偏移",
    accentRatioLabel: "强调色比例",
    edgeMaterialGroup: "边缘与材质",
    edgeHardnessLabel: "边缘硬度",
    edgeHierarchyLabel: "边缘层级",
    textureLabel: "材质强度",
    markScaleLabel: "笔触尺度",
    saveExpertDesign: "保存专家设计",
    saveAsPreset: "保存为普通模式模板",
    presetNameZh: "中文名称",
    presetNameEn: "英文名称",
    presetIdLabel: "模板 ID",
    exposedControlsLabel: "普通模式开放参数",
    createPreset: "创建模板",
    designSaved: "设计参数已保存，并创建了可恢复版本。",
    presetApplied: "设计模板已应用；文字策略已按工程合同更新。",
    presetCreated: "自定义模板已加入普通模式。",
    presetUnavailable: "当前工程模式不支持这个模板。",
    designReadiness: "计划结构完整度 {score}%",
    builtInPreset: "内置",
    userPreset: "自定义",
    proofStudioKicker: "PARAMETER PROOFS",
    proofStudioTitle: "参数设计稿",
    proofStudioIntro: "生成 A/B/C 三个低细节方向；先比较构图与色彩，再锁定一个方向进入正式分层绘制。",
    proofStageLabel: "设计阶段",
    proofStageStructure: "结构稿",
    proofStageColour: "色彩与材质稿",
    proofStageFull: "完整方向稿",
    proofSpreadLabel: "方案差异",
    generateProofs: "生成 A/B/C",
    proofEmpty: "尚未生成设计稿。当前设计参数会作为三套方案的共同起点。",
    proofParameterSketch: "参数示意",
    proofRenderedPreview: "绘制预览",
    proofStatusDraft: "待选择",
    proofStatusSelected: "已选择",
    proofStatusLocked: "已锁定",
    proofStatusPromoted: "已晋升",
    proofStatusStale: "参数已变化",
    lockProof: "锁定方向",
    unlockProof: "解锁方向",
    promoteProof: "晋升至正式绘制",
    proofCreated: "A/B/C 参数设计稿已生成。",
    proofSelectedToast: "已选择方案 {variant}；确认后请锁定方向。",
    proofLockedToast: "方案已锁定，可以晋升为正式设计参数。",
    proofUnlockedToast: "方案已解锁，可以重新选择。",
    proofPromotedToast: "方案已晋升；下一步按该参数完成 8–12 个语义图层。",
    proofDeltaNone: "沿用基础参数",
    proofSchematicNote: "示意稿用于定方向；真实低精度预览可写回同一方案，晋升本身不会自动重画图层。",
    referenceStudioKicker: "REFERENCE INTELLIGENCE",
    referenceStudioTitle: "参考图与空间",
    referenceStudioIntro: "先保存视觉证据，再用深度辅助语义分层；深度区间不会直接变成画面图层。",
    addSceneRgb: "添加场景图",
    referenceRoleLabel: "参考用途",
    rolePrimaryRgb: "主场景",
    roleAlternateView: "补充视角",
    roleStyleReference: "风格参考",
    rolePaletteReference: "色彩参考",
    addDepthMap: "导入深度图",
    referenceEmpty: "还没有参考图。添加原图后，可估计深度或配对 RGB-D。",
    sourceRgbLabel: "原始 RGB",
    relativeDepthLabel: "相对深度",
    depthNearWhite: "近白 · 远黑",
    depthZonesLabel: "空间区间",
    estimateDepth: "估计相对深度",
    estimatingDepth: "正在估计…",
    depthBackendChecking: "检查深度后端…",
    depthBackendReady: "深度后端已就绪",
    depthBackendMissing: "需安装可选深度依赖",
    depthAdvancedTitle: "深度与 RGB-D 高级设置",
    depthModelLabel: "模型",
    depthDeviceLabel: "设备",
    rawDepthDirectionLabel: "导入图近处数值",
    rawNearHigh: "高值",
    rawNearLow: "低值",
    offlineModelLabel: "只用本地模型缓存",
    layerPlanningLabel: "语义图层规划",
    planningPromptLabel: "你希望如何理解和拆分画面？",
    planningPromptPlaceholder: "例如：人物保持独立；远处建筑合并；水面反光作为叠加层。",
    planningModeLabel: "空间解释",
    planningFaithful: "忠实空间",
    planningArtDirected: "艺术化空间",
    layerBudgetLabel: "目标图层",
    planningFlattenDepth: "压平空间",
    planningExaggerateDepth: "夸张纵深",
    savePlanningRequest: "保存图层规划请求",
    planningStatusEmpty: "等待原图和规划意图。语义识别完成后才会生成正式图层方案。",
    planningStatusSaved: "规划请求已保存；下一步由 Codex 识别语义区域并解析图层。",
    planningStatusReady: "图层方案已解析：{count} 个可编辑语义图层。",
    planningStatusStale: "规划意图已变化；已有图层方案需要重新解析。",
    referenceUploaded: "参考图已加入工程。",
    referenceActivated: "已切换主场景参考。",
    depthEstimated: "相对深度已生成；原始深度保持不可变。",
    depthImported: "RGB-D 深度图已配对并标准化。",
    planningRequestSaved: "图层规划请求已保存。",
    referenceWorking: "正在处理参考素材…",
    sceneReferenceOnly: "风格和色彩参考不会成为深度估计主场景。",
    serveHint: "请通过 layered_redraw.py serve 启动编辑器；也可以手动打开 SVG。",
  },
  en: {
    appTitle: "Layered Redraw · Semantic Layer Studio",
    brandName: "Layered Redraw",
    brandSubtitle: "Semantic Layer Studio",
    currentProject: "Current project",
    noDocument: "No project open",
    fileActionsLabel: "File and project actions",
    languageLabel: "Interface language",
    openSvg: "Open SVG",
    loadDemo: "Load demo",
    validateStructure: "Validate",
    qualityReport: "Quality",
    undoLast: "Undo",
    exportRequest: "Export edit request",
    layersTitle: "Semantic Layers",
    showAll: "Show all",
    clearSelection: "Clear selection",
    layerControlsTitle: "Layer composition",
    opacityLabel: "Opacity",
    blendModeLabel: "Blend mode",
    blendNormal: "Normal",
    blendMultiply: "Multiply",
    blendScreen: "Screen",
    blendOverlay: "Overlay",
    blendDarken: "Darken",
    blendLighten: "Lighten",
    layerTypeLabel: "Layer type",
    layerTypeRaster: "Raster",
    layerTypeVector: "Vector source + raster render",
    layerTypePixel: "Pixel",
    editableSourceLabel: "Editable source",
    labelZh: "Chinese label",
    labelEn: "English label",
    moveDown: "Move down",
    moveUp: "Move up",
    applySettings: "Apply",
    transformTitle: "Position and transform",
    layerRoleLabel: "Occlusion role",
    roleArtwork: "Regular artwork",
    roleMovable: "Movable object",
    roleDependent: "Object-linked shadow / reflection",
    roleCleanPlate: "Clean plate (locked)",
    translateXLabel: "Horizontal offset px",
    translateYLabel: "Vertical offset px",
    scaleXLabel: "Horizontal scale %",
    scaleYLabel: "Vertical scale %",
    rotationLabel: "Rotation °",
    anchorXLabel: "Anchor X (0–1)",
    anchorYLabel: "Anchor Y (0–1)",
    resetTransform: "Reset transform",
    recomposeTitle: "Background completion and occlusion",
    recomposeIntro: "Build a clean plate from the original image and removal mask, then move, scale, and reorder layers freely. Pixels outside the mask are preserved exactly.",
    recomposeStatusOff: "Not configured",
    recomposeStatusPending: "Awaiting clean plate",
    recomposeStatusReady: "Recompose ready",
    recomposeSource: "Original full photograph",
    recomposeMask: "Removal mask (white is completed)",
    recomposePrompt: "Completion direction (optional)",
    recomposePromptPlaceholder: "For example: continue the wall texture and lighting; add no new objects.",
    recomposeInitialize: "Create completion task",
    cleanPlateCandidate: "Generated clean-plate background",
    cleanPlateModel: "Model / tool (optional)",
    cleanPlateSeed: "Seed (optional)",
    cleanPlateRegister: "Register clean plate",
    layerListLabel: "Semantic layer list",
    layerEmptyInitial: "Open a layered project to inspect its semantic structure.",
    layerEmptyDiscovered: "No semantic top-level layers found. Check data-layer or Inkscape layer metadata.",
    layerLegendLabel: "Layer status legend",
    selectedLegend: "Selected",
    lockedLegend: "Locked",
    canvasTitle: "Canvas",
    canvasKickerVector: "VECTOR CANVAS",
    canvasKickerRaster: "RASTER LAYER STACK",
    canvasKickerPixel: "PIXEL LAYER STACK",
    outputModeVector: "Vector",
    outputModeRaster: "Raster layers",
    outputModePixel: "Pixel layers",
    selectionMethodLabel: "Selection method",
    modeLayerShort: "Layer click",
    modeBboxShort: "Frame",
    modeLassoShort: "Lasso",
    modeBrushShort: "Brush",
    modeTextShort: "Text",
    modeLayer: "Layer click",
    modeBbox: "Region frame",
    modeLasso: "Lasso mask",
    modeBrush: "Brush mask",
    modeText: "Text inference",
    selectionNone: "Nothing selected",
    canvasStageLabel: "Interactive layered canvas",
    canvasEmptyTitle: "Start with an editable layered project",
    canvasEmptyBody: "Open a local SVG, or use the local server for vector and raster projects.",
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
    includeLinkedLayers: "Include linked layers",
    includeLinkedLayersHint: "Include dependent lighting, shadow, and support layers in the edit scope.",
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
    maskPrompt: "Select target layers, then paint the edit mask on the canvas.",
    maskRequired: "Draw a non-empty mask on the canvas first.",
    maskSaved: "Selection mask saved inside the project.",
    brushSize: "Brush size",
    clearMask: "Clear mask",
    compareOpacity: "History opacity",
    closeCompare: "Close comparison",
    svgNotLoaded: "No project has been loaded.",
    invalidViewBox: "The viewBox dimensions are invalid.",
    layerCountRequired: "A project needs 5–20 top-level semantic layers; found {count}.",
    layerCountRecommended: "The layer count is valid, but 8–12 is recommended; found {count}.",
    duplicateIds: "Duplicate IDs: {ids}",
    invalidLayerId: "Layer ID does not match the contract: {id}",
    emptyLayer: "Layer is empty: {id}",
    dangerousElements: "The SVG contains unsafe executable elements.",
    strictImage: "A vector-strict project cannot contain image elements.",
    structurePassed: "Structure passed: {count} semantic layers.",
    structureStatusOk: "Project layer structure passed",
    structureStatusBad: "Project layer structure has problems",
    structureToastOk: "Structure validation passed.",
    structureToastBad: "Found {count} structure problems.",
    selectFirst: "Select a layer or frame a region first.",
    requestReadyStatus: "Edit request built; artwork remains unchanged",
    requestReadyToast: "The edit request is ready. It does not rewrite the project directly.",
    requestDownloaded: "edit-request.json downloaded.",
    requestCopied: "Edit request JSON copied.",
    layerSettingsSaved: "Layer composition settings saved with a recoverable revision.",
    recomposeInitialized: "The background-completion task is ready; generate and register a clean plate.",
    cleanPlateRegistered: "The clean plate was registered and passed outside-mask verification.",
    chooseSourceAndMask: "Choose both the original image and the removal mask.",
    chooseCleanPlate: "Choose the generated clean-plate image.",
    serverActionFailed: "Local project action failed: {detail}",
    historyTitle: "Revision history",
    historyEmpty: "Recoverable revisions appear here after applied changes.",
    compareVersion: "Compare",
    restoreVersion: "Restore",
    historyRestored: "History revision restored.",
    historyPreviewUnavailable: "This revision has no bitmap preview to compare.",
    qualityScore: "Engineering quality {score}/100",
    designReadiness: "Plan schema completeness {score}/100",
    clipboardDenied: "Clipboard access was denied. Download the file instead.",
    chooseSvgFile: "Choose an .svg file.",
    svgLoadFailed: "SVG failed to load",
    serverNoProject: "The local server did not provide a demo project.",
    workflowModeLabel: "Workflow mode",
    guidedMode: "Guided",
    expertMode: "Art Direction",
    guidedDesignKicker: "DESIGN PRESETS",
    guidedDesignTitle: "Design presets",
    guidedDesignIntro: "Presets coordinate composition, proportion, space, form, value, and colour without adding artwork text.",
    expertDesignKicker: "VISUAL GRAMMAR",
    expertDesignTitle: "Complete design system",
    expertDesignIntro: "Control composition and proportion directly; material is only the final parameter group.",
    textFreeBadge: "Text-free artwork",
    faithfulnessLabel: "Photo fidelity",
    abstractionLabel: "Abstraction",
    subjectEmphasisLabel: "Subject emphasis",
    spaceFlatteningLabel: "Space flattening",
    colorIntensityLabel: "Colour intensity",
    applyPreset: "Apply design preset",
    compositionGroup: "Composition and proportion",
    balanceLabel: "Balance model",
    balanceObserved: "Observed relationship",
    balanceAsymmetric: "Asymmetric balance",
    balanceMonumental: "Central monument",
    balanceDiagonal: "Dynamic diagonal",
    balanceLayered: "Calm layering",
    balanceNarrative: "Narrative path",
    subjectScaleLabel: "Subject scale",
    cropStrengthLabel: "Reframing",
    negativeSpaceLabel: "Negative space",
    asymmetryLabel: "Asymmetry",
    spaceFormGroup: "Space and form",
    flatteningLabel: "Perspective flattening",
    depthLabel: "Depth separation",
    perspectiveLabel: "Perspective strength",
    simplificationLabel: "Shape simplification",
    geometricityLabel: "Geometricity",
    exaggerationLabel: "Proportion exaggeration",
    closureLabel: "Contour closure",
    valueColorGroup: "Value and colour",
    valueGroupsLabel: "Value groups",
    paletteSizeLabel: "Palette size",
    contrastLabel: "Overall contrast",
    focalContrastLabel: "Focal contrast",
    expertColorIntensityLabel: "Colour intensity",
    warmthLabel: "Temperature shift",
    accentRatioLabel: "Accent ratio",
    edgeMaterialGroup: "Edge and material",
    edgeHardnessLabel: "Edge hardness",
    edgeHierarchyLabel: "Edge hierarchy",
    textureLabel: "Material strength",
    markScaleLabel: "Mark scale",
    saveExpertDesign: "Save expert design",
    saveAsPreset: "Save as Guided preset",
    presetNameZh: "Chinese name",
    presetNameEn: "English name",
    presetIdLabel: "Preset ID",
    exposedControlsLabel: "Controls exposed in Guided mode",
    createPreset: "Create preset",
    designSaved: "Design parameters saved with a recoverable revision.",
    presetApplied: "Design preset applied; the project text policy was updated from its contract.",
    presetCreated: "Custom preset added to Guided mode.",
    presetUnavailable: "This preset is not compatible with the current project mode.",
    designReadiness: "Plan schema completeness {score}%",
    builtInPreset: "Built in",
    userPreset: "Custom",
    proofStudioKicker: "PARAMETER PROOFS",
    proofStudioTitle: "Parameterized Proofs",
    proofStudioIntro: "Generate three low-detail A/B/C directions, compare structure and colour, then lock one before layered production.",
    proofStageLabel: "Design stage",
    proofStageStructure: "Structure proof",
    proofStageColour: "Colour + material proof",
    proofStageFull: "Full direction proof",
    proofSpreadLabel: "Variant spread",
    generateProofs: "Generate A/B/C",
    proofEmpty: "No proofs yet. The active design plan will be the shared starting point for all three.",
    proofParameterSketch: "Parameter sketch",
    proofRenderedPreview: "Rendered preview",
    proofStatusDraft: "Choose one",
    proofStatusSelected: "Selected",
    proofStatusLocked: "Locked",
    proofStatusPromoted: "Promoted",
    proofStatusStale: "Out of date",
    lockProof: "Lock direction",
    unlockProof: "Unlock direction",
    promoteProof: "Promote to production",
    proofCreated: "A/B/C parameterized proofs created.",
    proofSelectedToast: "Proof {variant} selected; lock it when the direction feels right.",
    proofLockedToast: "Direction locked and ready for promotion.",
    proofUnlockedToast: "Direction unlocked; you can choose again.",
    proofPromotedToast: "Direction promoted; build the final 8–12 semantic layers from this plan.",
    proofDeltaNone: "Uses base parameters",
    proofSchematicNote: "Sketches choose direction. A real low-detail preview can replace one in place; promotion does not redraw layers by itself.",
    referenceStudioKicker: "REFERENCE INTELLIGENCE",
    referenceStudioTitle: "References & Space",
    referenceStudioIntro: "Preserve visual evidence first, then use depth to inform semantic grouping. Depth bands never become artwork layers by themselves.",
    addSceneRgb: "Add scene RGB",
    referenceRoleLabel: "Reference role",
    rolePrimaryRgb: "Primary scene",
    roleAlternateView: "Alternate view",
    roleStyleReference: "Style reference",
    rolePaletteReference: "Palette reference",
    addDepthMap: "Import depth",
    referenceEmpty: "No references yet. Add an RGB image to estimate depth or pair an RGB-D source.",
    sourceRgbLabel: "Source RGB",
    relativeDepthLabel: "Relative depth",
    depthNearWhite: "near white · far black",
    depthZonesLabel: "Spatial bands",
    estimateDepth: "Estimate relative depth",
    estimatingDepth: "Estimating…",
    depthBackendChecking: "Checking depth backend…",
    depthBackendReady: "Depth backend ready",
    depthBackendMissing: "Optional depth dependencies needed",
    depthAdvancedTitle: "Depth and RGB-D advanced settings",
    depthModelLabel: "Model",
    depthDeviceLabel: "Device",
    rawDepthDirectionLabel: "Near values in import",
    rawNearHigh: "High values",
    rawNearLow: "Low values",
    offlineModelLabel: "Use local model cache only",
    layerPlanningLabel: "Semantic layer planning",
    planningPromptLabel: "How should the scene be understood and separated?",
    planningPromptPlaceholder: "For example: keep the figure separate; merge distant buildings; treat water reflections as an overlay.",
    planningModeLabel: "Spatial reading",
    planningFaithful: "Faithful space",
    planningArtDirected: "Art-directed space",
    layerBudgetLabel: "Layer target",
    planningFlattenDepth: "Flatten space",
    planningExaggerateDepth: "Exaggerate depth",
    savePlanningRequest: "Save layer-planning request",
    planningStatusEmpty: "Waiting for an RGB source and planning intent. A formal layer plan appears only after semantic analysis.",
    planningStatusSaved: "Planning request saved. Codex can now identify semantic regions and resolve the layer stack.",
    planningStatusReady: "Layer plan resolved: {count} editable semantic layers.",
    planningStatusStale: "Planning intent changed; the existing layer plan must be resolved again.",
    referenceUploaded: "Reference added to the project.",
    referenceActivated: "Active scene reference changed.",
    depthEstimated: "Relative depth generated; the raw depth evidence remains immutable.",
    depthImported: "RGB-D depth paired and normalized.",
    planningRequestSaved: "Layer-planning request saved.",
    referenceWorking: "Processing reference material…",
    sceneReferenceOnly: "Style and palette references cannot drive scene depth estimation.",
    serveHint: "Start the editor with layered_redraw.py serve, or open an SVG manually.",
  },
};

Object.assign(TRANSLATIONS.zh, {
  specConfidence: "置信度（0–1）",
  specSizePairRequired: "标称尺码必须同时填写尺码标签和尺码体系。",
  specLayoutTitle: "版面尺寸与比例",
  specOutputWidth: "输出宽",
  specOutputHeight: "输出高",
  specOutputUnit: "单位",
  specDrawingScale: "绘图比例",
  specLayoutSave: "保存版面",
  specLayoutSaved: "版面尺寸与绘图比例已保存。",
  specLayoutRequired: "请同时填写输出宽、高和单位。",
  physicalSpecTitle: "真实规格",
  physicalSpecIntro: "真实尺寸独立于画面缩放、位置和角度；估算值不能冒充生产测量。",
  specObjectPicker: "当前规格对象",
  specNewObject: "新建对象",
  specNewObjectOption: "（尚未保存的新对象）",
  specObjectId: "对象 ID",
  specCategory: "品类",
  specSizeLabel: "标称尺码",
  specSizeSystem: "尺码体系",
  specMeasurements: "真实测量值",
  specMeasurementsPlaceholder: "每行一项，例如：\nlength=100cm\nwidth=3.5cm",
  specSource: "数据来源",
  specSourceUser: "用户提供",
  specSourceCalibrated: "标定参照",
  specSourceChart: "尺码表",
  specSourceDepth: "单目估算",
  specSourceVisual: "视觉估算",
  specVerification: "核验状态",
  specDeclared: "已声明",
  specVerified: "已核验",
  specEstimated: "估算",
  specUnknown: "未知",
  specRotation: "旋转 °",
  specVisualScale: "画面缩放 %",
  specAdvanced: "姿态与备注",
  specNotes: "备注",
  specRemove: "删除",
  specExport: "导出规格表",
  specExportFormats: "导出格式",
  specExportHint: "SVG 是默认可编辑母版；可按交付用途追加其他格式。",
  specFormatSvg: "可编辑母版",
  specFormatPdf: "打印／审批",
  specFormatPng: "预览／批注",
  specFormatCsv: "表格数据",
  specFormatJson: "结构数据",
  specExportDpi: "PNG 分辨率（DPI）",
  specExportRequired: "请至少选择一种导出格式。",
  specSave: "保存规格",
  specStatusNew: "新对象",
  specStatusCount: "{count} 项测量",
  specSaved: "真实规格已保存，并创建了可恢复版本。",
  specRemoved: "对象规格已删除。",
  specExported: "已导出：{formats}。",
  specMeasurementInvalid: "测量值格式错误：{value}",
});

Object.assign(TRANSLATIONS.en, {
  specConfidence: "Confidence (0–1)",
  specSizePairRequired: "A declared size requires both a label and a size system.",
  specLayoutTitle: "Output size and scale",
  specOutputWidth: "Output width",
  specOutputHeight: "Output height",
  specOutputUnit: "Unit",
  specDrawingScale: "Drawing scale",
  specLayoutSave: "Save layout",
  specLayoutSaved: "Output size and drawing scale saved.",
  specLayoutRequired: "Output width, height, and unit are required together.",
  physicalSpecTitle: "Physical specification",
  physicalSpecIntro: "Real dimensions stay independent from visual scale, position, and angle; estimates are never production measurements.",
  specObjectPicker: "Current specification object",
  specNewObject: "New object",
  specNewObjectOption: "(unsaved new object)",
  specObjectId: "Object ID",
  specCategory: "Category",
  specSizeLabel: "Declared size",
  specSizeSystem: "Size system",
  specMeasurements: "Real measurements",
  specMeasurementsPlaceholder: "One per line, for example:\nlength=100cm\nwidth=3.5cm",
  specSource: "Data source",
  specSourceUser: "User provided",
  specSourceCalibrated: "Calibrated reference",
  specSourceChart: "Size chart",
  specSourceDepth: "Monocular estimate",
  specSourceVisual: "Visual estimate",
  specVerification: "Verification",
  specDeclared: "Declared",
  specVerified: "Verified",
  specEstimated: "Estimated",
  specUnknown: "Unknown",
  specRotation: "Rotation °",
  specVisualScale: "Visual scale %",
  specAdvanced: "Pose and notes",
  specNotes: "Notes",
  specRemove: "Remove",
  specExport: "Export sheet",
  specExportFormats: "Export formats",
  specExportHint: "SVG is the default editable master; add delivery formats as needed.",
  specFormatSvg: "Editable master",
  specFormatPdf: "Print / approval",
  specFormatPng: "Review / markup",
  specFormatCsv: "Table data",
  specFormatJson: "Structured data",
  specExportDpi: "PNG resolution (DPI)",
  specExportRequired: "Select at least one export format.",
  specSave: "Save specification",
  specStatusNew: "New object",
  specStatusCount: "{count} measurements",
  specSaved: "Physical specification saved with a recoverable revision.",
  specRemoved: "Object specification removed.",
  specExported: "Exported: {formats}.",
  specMeasurementInvalid: "Invalid measurement: {value}",
});

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
  activeLayerType: document.querySelector("#activeLayerType"),
  applyLayerSettings: document.querySelector("#applyLayerSettings"),
  applyPresetButton: document.querySelector("#applyPresetButton"),
  artboard: document.querySelector("#artboard"),
  blendModeSelect: document.querySelector("#blendModeSelect"),
  brushSizeInput: document.querySelector("#brushSizeInput"),
  brushSizeValue: document.querySelector("#brushSizeValue"),
  buildRequestButton: document.querySelector("#buildRequestButton"),
  canvasEmpty: document.querySelector("#canvasEmpty"),
  canvasHint: document.querySelector("#canvasHint"),
  canvasKicker: document.querySelector("#canvasKicker"),
  canvasSize: document.querySelector("#canvasSize"),
  canvasStage: document.querySelector("#canvasStage"),
  clearSelectionButton: document.querySelector("#clearSelectionButton"),
  clearMaskButton: document.querySelector("#clearMaskButton"),
  closeCompareButton: document.querySelector("#closeCompareButton"),
  compareSlider: document.querySelector("#compareSlider"),
  compareToolbar: document.querySelector("#compareToolbar"),
  contextNote: document.querySelector("#contextNote"),
  copyRequestButton: document.querySelector("#copyRequestButton"),
  documentName: document.querySelector("#documentName"),
  downloadRequestButton: document.querySelector("#downloadRequestButton"),
  dragBox: document.querySelector("#dragBox"),
  editableSourceInput: document.querySelector("#editableSourceInput"),
  expertDesignPanel: document.querySelector("#expertDesignPanel"),
  expertDesignInputs: Array.from(document.querySelectorAll("[data-design-path]")),
  exposedControlInputs: Array.from(document.querySelectorAll(".exposed-controls input[type='checkbox']")),
  guidedControlInputs: Array.from(document.querySelectorAll("[data-design-control]")),
  guidedDesignPanel: document.querySelector("#guidedDesignPanel"),
  instructionInput: document.querySelector("#instructionInput"),
  historyCount: document.querySelector("#historyCount"),
  historyList: document.querySelector("#historyList"),
  historyPreview: document.querySelector("#historyPreview"),
  labelEnInput: document.querySelector("#labelEnInput"),
  labelZhInput: document.querySelector("#labelZhInput"),
  layerCount: document.querySelector("#layerCount"),
  layerControls: document.querySelector("#layerControls"),
  layerList: document.querySelector("#layerList"),
  layerOpacityInput: document.querySelector("#layerOpacityInput"),
  layerOpacityValue: document.querySelector("#layerOpacityValue"),
  layerTypeSelect: document.querySelector("#layerTypeSelect"),
  layerRoleSelect: document.querySelector("#layerRoleSelect"),
  layerTranslateX: document.querySelector("#layerTranslateX"),
  layerTranslateY: document.querySelector("#layerTranslateY"),
  layerScaleX: document.querySelector("#layerScaleX"),
  layerScaleY: document.querySelector("#layerScaleY"),
  layerRotation: document.querySelector("#layerRotation"),
  layerAnchorX: document.querySelector("#layerAnchorX"),
  layerAnchorY: document.querySelector("#layerAnchorY"),
  resetLayerTransform: document.querySelector("#resetLayerTransform"),
  linkedLayersCheckbox: document.querySelector("#linkedLayersCheckbox"),
  loadDemoButton: document.querySelector("#loadDemoButton"),
  localeButtons: Array.from(document.querySelectorAll("[data-locale]")),
  outputModeBadge: document.querySelector("#outputModeBadge"),
  physicalSpecControls: document.querySelector("#physicalSpecControls"),
  physicalSpecStatus: document.querySelector("#physicalSpecStatus"),
  specObjectSelect: document.querySelector("#specObjectSelect"),
  newPhysicalSpec: document.querySelector("#newPhysicalSpec"),
  specObjectIdInput: document.querySelector("#specObjectIdInput"),
  specCategoryInput: document.querySelector("#specCategoryInput"),
  specConfidenceInput: document.querySelector("#specConfidenceInput"),
  specNameZhInput: document.querySelector("#specNameZhInput"),
  specNameEnInput: document.querySelector("#specNameEnInput"),
  specSizeLabelInput: document.querySelector("#specSizeLabelInput"),
  specSizeSystemInput: document.querySelector("#specSizeSystemInput"),
  specMeasurementsInput: document.querySelector("#specMeasurementsInput"),
  specSourceSelect: document.querySelector("#specSourceSelect"),
  specVerificationSelect: document.querySelector("#specVerificationSelect"),
  specXInput: document.querySelector("#specXInput"),
  specYInput: document.querySelector("#specYInput"),
  specRotationInput: document.querySelector("#specRotationInput"),
  specScaleInput: document.querySelector("#specScaleInput"),
  specYawInput: document.querySelector("#specYawInput"),
  specPitchInput: document.querySelector("#specPitchInput"),
  specRollInput: document.querySelector("#specRollInput"),
  specNotesInput: document.querySelector("#specNotesInput"),
  specOutputWidthInput: document.querySelector("#specOutputWidthInput"),
  specOutputHeightInput: document.querySelector("#specOutputHeightInput"),
  specOutputUnitSelect: document.querySelector("#specOutputUnitSelect"),
  specDrawingScaleInput: document.querySelector("#specDrawingScaleInput"),
  saveSpecLayout: document.querySelector("#saveSpecLayout"),
  savePhysicalSpec: document.querySelector("#savePhysicalSpec"),
  removePhysicalSpec: document.querySelector("#removePhysicalSpec"),
  exportPhysicalSpecs: document.querySelector("#exportPhysicalSpecs"),
  specExportFormatInputs: Array.from(document.querySelectorAll("[data-spec-export-format]")),
  specExportDpiField: document.querySelector("#specPngDpiField"),
  specExportDpiInput: document.querySelector("#specExportDpi"),
  maskCanvas: document.querySelector("#maskCanvas"),
  maskToolbar: document.querySelector("#maskToolbar"),
  moveLayerDown: document.querySelector("#moveLayerDown"),
  moveLayerUp: document.querySelector("#moveLayerUp"),
  preserveCheckbox: document.querySelector("#preserveCheckbox"),
  proofGrid: document.querySelector("#proofGrid"),
  proofLockButton: document.querySelector("#proofLockButton"),
  proofPromoteButton: document.querySelector("#proofPromoteButton"),
  proofSpreadInput: document.querySelector("#proofSpreadInput"),
  proofSpreadValue: document.querySelector("#proofSpreadValue"),
  proofStageSelect: document.querySelector("#proofStageSelect"),
  proofStatusBadge: document.querySelector("#proofStatusBadge"),
  generateProofsButton: document.querySelector("#generateProofsButton"),
  presetCount: document.querySelector("#presetCount"),
  presetGrid: document.querySelector("#presetGrid"),
  presetIdInput: document.querySelector("#presetIdInput"),
  presetNameEn: document.querySelector("#presetNameEn"),
  presetNameZh: document.querySelector("#presetNameZh"),
  qualityButton: document.querySelector("#qualityButton"),
  referenceCompare: document.querySelector("#referenceCompare"),
  referenceCount: document.querySelector("#referenceCount"),
  referenceDepthPreview: document.querySelector("#referenceDepthPreview"),
  referenceFileInput: document.querySelector("#referenceFileInput"),
  referenceList: document.querySelector("#referenceList"),
  referenceRgbMeta: document.querySelector("#referenceRgbMeta"),
  referenceRgbPreview: document.querySelector("#referenceRgbPreview"),
  referenceRoleSelect: document.querySelector("#referenceRoleSelect"),
  recomposeControls: document.querySelector("#recomposeControls"),
  recomposeStatus: document.querySelector("#recomposeStatus"),
  recomposeSourceInput: document.querySelector("#recomposeSourceInput"),
  recomposeMaskInput: document.querySelector("#recomposeMaskInput"),
  recomposePromptInput: document.querySelector("#recomposePromptInput"),
  initializeRecompose: document.querySelector("#initializeRecompose"),
  cleanPlateInput: document.querySelector("#cleanPlateInput"),
  cleanPlateModel: document.querySelector("#cleanPlateModel"),
  cleanPlateSeed: document.querySelector("#cleanPlateSeed"),
  registerCleanPlate: document.querySelector("#registerCleanPlate"),
  depthFileInput: document.querySelector("#depthFileInput"),
  depthZoneCount: document.querySelector("#depthZoneCount"),
  depthBackendStatus: document.querySelector("#depthBackendStatus"),
  depthModelInput: document.querySelector("#depthModelInput"),
  depthDeviceSelect: document.querySelector("#depthDeviceSelect"),
  depthOfflineCheckbox: document.querySelector("#depthOfflineCheckbox"),
  rawNearSelect: document.querySelector("#rawNearSelect"),
  estimateDepthButton: document.querySelector("#estimateDepthButton"),
  planningPromptInput: document.querySelector("#planningPromptInput"),
  planningModeSelect: document.querySelector("#planningModeSelect"),
  planningLayerBudget: document.querySelector("#planningLayerBudget"),
  planningFlattenDepth: document.querySelector("#planningFlattenDepth"),
  planningFlattenDepthValue: document.querySelector("#planningFlattenDepthValue"),
  planningExaggerateDepth: document.querySelector("#planningExaggerateDepth"),
  planningExaggerateDepthValue: document.querySelector("#planningExaggerateDepthValue"),
  planningStatus: document.querySelector("#planningStatus"),
  savePlanningRequestButton: document.querySelector("#savePlanningRequestButton"),
  requestJson: document.querySelector("#requestJson"),
  requestPreview: document.querySelector("#requestPreview"),
  revisionBadge: document.querySelector("#revisionBadge"),
  selectionChips: document.querySelector("#selectionChips"),
  selectionModeLabel: document.querySelector("#selectionModeLabel"),
  selectionOverlay: document.querySelector("#selectionOverlay"),
  selectionSummary: document.querySelector("#selectionSummary"),
  saveDesignButton: document.querySelector("#saveDesignButton"),
  savePresetButton: document.querySelector("#savePresetButton"),
  showAllButton: document.querySelector("#showAllButton"),
  statusDot: document.querySelector("#statusDot"),
  svgFileInput: document.querySelector("#svgFileInput"),
  svgMount: document.querySelector("#svgMount"),
  toast: document.querySelector("#toast"),
  topExportButton: document.querySelector("#topExportButton"),
  undoButton: document.querySelector("#undoButton"),
  validateButton: document.querySelector("#validateButton"),
  validationCard: document.querySelector("#validationCard"),
  validationResults: document.querySelector("#validationResults"),
  workflowButtons: Array.from(document.querySelectorAll("[data-workflow-mode]")),
};

const state = {
  bbox: null,
  canvasStatus: { key: "waitingForProject", vars: {}, kind: "idle" },
  drag: null,
  designPlan: null,
  designPresets: [],
  designProofs: null,
  history: [],
  ignoreClick: false,
  layers: [],
  locale: initialLocale(),
  mode: "layer",
  maskDirty: false,
  maskMeta: null,
  maskPointer: null,
  projectMeta: null,
  physicalSpecifications: null,
  specExportCapabilities: { svg: true, pdf: false, png: false, csv: true, json: true },
  referenceBusy: false,
  referenceIntelligence: null,
  sceneReconstruction: null,
  request: null,
  revision: null,
  sessionHeader: "X-Layered-Redraw-Token",
  sessionToken: null,
  selectedIds: new Set(),
  selectedPhysicalObjectId: null,
  newPhysicalSpecLayerId: null,
  selectedPresetId: null,
  selectedObjectIds: new Set(),
  sourceName: null,
  svg: null,
  serverConnected: false,
  toastTimer: null,
  workflowMode: "guided",
};

function t(key, variables = {}) {
  const template = TRANSLATIONS[state.locale]?.[key] ?? TRANSLATIONS.zh[key] ?? key;
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match;
  });
}

function projectIsRaster() {
  return state.projectMeta?.config?.output_mode === "raster-layered";
}

function projectIsPixelArt() {
  return projectIsRaster() && Boolean(state.projectMeta?.config?.pixel_art);
}

function renderOutputMode() {
  const raster = projectIsRaster();
  const pixel = projectIsPixelArt();
  elements.canvasKicker.textContent = t(
    pixel ? "canvasKickerPixel" : raster ? "canvasKickerRaster" : "canvasKickerVector",
  );
  elements.outputModeBadge.textContent = state.svg
    ? t(pixel ? "outputModePixel" : raster ? "outputModeRaster" : "outputModeVector")
    : "—";
}

function presetName(preset) {
  const name = preset?.name;
  if (name && typeof name === "object") return name[state.locale] || name.en || name.zh || preset.id;
  return preset?.id || "—";
}

function presetDescription(preset) {
  const description = preset?.description;
  if (description && typeof description === "object") {
    return description[state.locale] || description.en || description.zh || "";
  }
  return "";
}

function compatiblePresets() {
  const outputMode = state.projectMeta?.config?.output_mode;
  const pixelArt = Boolean(state.projectMeta?.config?.pixel_art);
  return state.designPresets.filter((preset) => {
    const modeCompatible = !outputMode
      || !Array.isArray(preset.compatible_modes)
      || preset.compatible_modes.includes(outputMode);
    return modeCompatible && (preset.requires_pixel_art !== true || pixelArt);
  });
}

function updateSliderOutput(input) {
  const output = input.closest("label")?.querySelector("output");
  if (!output) return;
  if (input.dataset.designPath === "color.warmth") {
    const value = Number(input.value);
    output.value = value > 0 ? `+${value}` : String(value);
    return;
  }
  output.value = `${Math.round(Number(input.value))}%`;
}

function guidedControlValues() {
  return Object.fromEntries(
    elements.guidedControlInputs.map((input) => [input.dataset.designControl, Number(input.value) / 100]),
  );
}

function setGuidedControlValues(values = {}) {
  elements.guidedControlInputs.forEach((input) => {
    const raw = values[input.dataset.designControl];
    if (Number.isFinite(Number(raw))) input.value = String(Math.round(Number(raw) * 100));
    updateSliderOutput(input);
  });
}

function setNestedValue(target, path, value) {
  const [group, key] = path.split(".");
  if (!target[group]) target[group] = {};
  target[group][key] = value;
}

function setExpertControlValues(parameters) {
  if (!parameters) return;
  elements.expertDesignInputs.forEach((input) => {
    const [group, key] = input.dataset.designPath.split(".");
    const value = parameters?.[group]?.[key];
    if (value === undefined) return;
    if (input.tagName === "SELECT" || input.type === "number") input.value = String(value);
    else if (input.dataset.designPath === "composition.subject_scale") input.value = String(Math.round(Number(value) * 100));
    else input.value = String(Math.round(Number(value) * 100));
    updateSliderOutput(input);
  });
}

function readExpertControlValues() {
  const parameters = structuredClone(state.designPlan?.parameters || {});
  elements.expertDesignInputs.forEach((input) => {
    const path = input.dataset.designPath;
    let value;
    if (path === "composition.balance") value = input.value;
    else if (path === "value.groups" || path === "color.palette_size") value = Number.parseInt(input.value, 10);
    else value = Number(input.value) / 100;
    setNestedValue(parameters, path, value);
  });
  return parameters;
}

function selectDesignPreset(presetId, { resetControls = true } = {}) {
  const preset = state.designPresets.find((item) => item.id === presetId);
  if (!preset) return;
  state.selectedPresetId = presetId;
  if (resetControls) {
    const defaults = {};
    Object.entries(preset.controls || {}).forEach(([key, value]) => {
      defaults[key] = typeof value === "object" ? value.default : value;
    });
    setGuidedControlValues({ ...(state.designPlan?.controls || {}), ...defaults });
  }
  const exposed = new Set(Object.keys(preset.controls || {}));
  elements.guidedControlInputs.forEach((input) => {
    input.closest("label").hidden = exposed.size > 0 && !exposed.has(input.dataset.designControl);
  });
  renderPresetCards();
  elements.applyPresetButton.disabled = !state.serverConnected;
}

function renderPresetCards() {
  const fragment = document.createDocumentFragment();
  const presets = compatiblePresets();
  elements.presetCount.textContent = String(presets.length);
  presets.forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-card";
    button.classList.toggle("is-active", preset.id === state.selectedPresetId);
    button.setAttribute("aria-pressed", String(preset.id === state.selectedPresetId));
    const swatches = document.createElement("span");
    swatches.className = "preset-swatches";
    (Array.isArray(preset.swatches) ? preset.swatches : ["#F4F0E8", "#718578", "#A95649"]).forEach((color) => {
      const swatch = document.createElement("i");
      swatch.style.backgroundColor = color;
      swatches.append(swatch);
    });
    const title = document.createElement("strong");
    title.textContent = presetName(preset);
    const description = document.createElement("small");
    description.textContent = presetDescription(preset);
    const source = document.createElement("em");
    source.textContent = t(preset.source === "user" ? "userPreset" : "builtInPreset");
    button.append(swatches, title, description, source);
    button.addEventListener("click", () => selectDesignPreset(preset.id));
    fragment.append(button);
  });
  elements.presetGrid.replaceChildren(fragment);
}

function renderWorkflowMode() {
  const mode = state.workflowMode === "expert" ? "expert" : "guided";
  document.body.dataset.workflowMode = mode;
  elements.guidedDesignPanel.hidden = mode !== "guided";
  elements.expertDesignPanel.hidden = mode !== "expert";
  elements.workflowButtons.forEach((button) => {
    const active = button.dataset.workflowMode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = !state.serverConnected;
  });
}

function renderDesignStudio() {
  state.designPresets = Array.isArray(state.projectMeta?.design_presets) ? state.projectMeta.design_presets : state.designPresets;
  state.designPlan = state.projectMeta?.design_plan || state.designPlan;
  state.designProofs = state.projectMeta?.design_proofs || state.designProofs;
  state.workflowMode = state.designPlan?.workflow_mode === "expert" ? "expert" : "guided";
  state.selectedPresetId = state.designPlan?.selected_preset || state.selectedPresetId || compatiblePresets()[0]?.id || null;
  renderWorkflowMode();
  renderPresetCards();
  setGuidedControlValues(state.designPlan?.controls || {});
  setExpertControlValues(state.designPlan?.parameters);
  elements.applyPresetButton.disabled = !state.serverConnected || !state.selectedPresetId;
  elements.saveDesignButton.disabled = !state.serverConnected || !state.designPlan;
  elements.savePresetButton.disabled = !state.serverConnected || !state.designPlan;
  renderProofStudio();
}

const REFERENCE_ROLE_KEYS = {
  "primary-rgb": "rolePrimaryRgb",
  "alternate-view": "roleAlternateView",
  "style-reference": "roleStyleReference",
  "palette-reference": "rolePaletteReference",
};

function activeReferenceItem() {
  const intelligence = state.referenceIntelligence;
  return intelligence?.items?.find((item) => item.id === intelligence.active_rgb) || null;
}

function pairedDepthRun(item = activeReferenceItem()) {
  if (!item) return null;
  return state.referenceIntelligence?.depth_runs?.find((run) => run.id === item.paired_depth_run) || null;
}

function updatePlanningDepthControls() {
  const faithful = elements.planningModeSelect.value === "faithful";
  elements.planningFlattenDepth.disabled = faithful;
  elements.planningExaggerateDepth.disabled = faithful;
  elements.planningFlattenDepthValue.value = `${Math.round(Number(elements.planningFlattenDepth.value))}%`;
  elements.planningExaggerateDepthValue.value = `${Math.round(Number(elements.planningExaggerateDepth.value))}%`;
}

function renderReferenceStudio() {
  const intelligence = state.referenceIntelligence || {
    items: [], depth_runs: [], backend_status: {}, planning_request: null, layer_plan: null,
  };
  const items = Array.isArray(intelligence.items) ? intelligence.items : [];
  const depthRuns = Array.isArray(intelligence.depth_runs) ? intelligence.depth_runs : [];
  const active = activeReferenceItem();
  const activeDepth = pairedDepthRun(active);
  elements.referenceCount.textContent = `${items.length} RGB · ${depthRuns.length} D`;

  const backendReady = Boolean(intelligence.backend_status?.ready);
  elements.depthBackendStatus.dataset.status = backendReady ? "ready" : "missing";
  elements.depthBackendStatus.textContent = t(backendReady ? "depthBackendReady" : "depthBackendMissing");
  elements.estimateDepthButton.textContent = t(state.referenceBusy ? "estimatingDepth" : "estimateDepth");
  elements.estimateDepthButton.disabled = state.referenceBusy || !state.serverConnected || !active || !backendReady;
  elements.referenceFileInput.disabled = state.referenceBusy || !state.serverConnected;
  elements.depthFileInput.disabled = state.referenceBusy || !state.serverConnected || !active;

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "reference-empty";
    empty.textContent = t("referenceEmpty");
    elements.referenceList.replaceChildren(empty);
  } else {
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const sceneRole = ["primary-rgb", "alternate-view"].includes(item.role);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reference-card";
      button.classList.toggle("is-active", item.id === intelligence.active_rgb);
      button.disabled = state.referenceBusy || !sceneRole;
      button.setAttribute("aria-pressed", String(item.id === intelligence.active_rgb));
      const thumbnail = document.createElement("img");
      thumbnail.src = `/api/references/${encodeURIComponent(item.id)}/rgb?v=${encodeURIComponent(item.stored_sha256 || "source")}`;
      thumbnail.alt = item.label || item.id;
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = item.label || item.id;
      const meta = document.createElement("small");
      meta.textContent = `${t(REFERENCE_ROLE_KEYS[item.role] || "referenceRoleLabel")} · ${item.width}×${item.height}`;
      copy.append(title, meta);
      const depthMark = document.createElement("i");
      depthMark.textContent = item.paired_depth_run ? "D✓" : "RGB";
      button.append(thumbnail, copy, depthMark);
      if (sceneRole) button.addEventListener("click", () => { void activateReference(item.id); });
      fragment.append(button);
    });
    elements.referenceList.replaceChildren(fragment);
  }

  elements.referenceCompare.hidden = !active;
  if (active) {
    elements.referenceRgbPreview.src = `/api/references/${encodeURIComponent(active.id)}/rgb?v=${encodeURIComponent(active.stored_sha256 || "source")}`;
    elements.referenceRgbPreview.alt = active.label || active.id;
    elements.referenceRgbMeta.textContent = `${active.width} × ${active.height}`;
    const depthFrame = elements.referenceDepthPreview.closest(".reference-frame");
    if (activeDepth) {
      elements.referenceDepthPreview.hidden = false;
      elements.referenceDepthPreview.src = `/api/references/${encodeURIComponent(active.id)}/colour?run=${encodeURIComponent(activeDepth.id)}&v=${encodeURIComponent(activeDepth.artifact_sha256?.colour_preview || activeDepth.id)}`;
      elements.referenceDepthPreview.alt = t("relativeDepthLabel");
      depthFrame?.classList.remove("is-empty");
    } else {
      elements.referenceDepthPreview.hidden = true;
      elements.referenceDepthPreview.removeAttribute("src");
      depthFrame?.classList.add("is-empty");
    }
  }

  const request = intelligence.planning_request;
  const plan = intelligence.layer_plan;
  if (request && document.activeElement !== elements.planningPromptInput) {
    elements.planningPromptInput.value = request.prompt || "";
    elements.planningModeSelect.value = request.mode || "faithful";
    elements.planningLayerBudget.value = String(request.layer_budget || 10);
    elements.planningFlattenDepth.value = String(Math.round(Number(request.depth_policy?.flattening || 0) * 100));
    elements.planningExaggerateDepth.value = String(Math.round(Number(request.depth_policy?.exaggeration || 0) * 100));
  }
  const currentPlan = intelligence.layer_plan_status === "current";
  elements.planningStatus.textContent = plan?.ready && currentPlan
    ? t("planningStatusReady", { count: plan.layer_count })
    : plan && intelligence.layer_plan_status === "stale"
      ? t("planningStatusStale")
      : request ? t("planningStatusSaved") : t("planningStatusEmpty");
  elements.planningStatus.dataset.status = plan?.ready && currentPlan ? "ready" : request ? "saved" : "idle";
  elements.savePlanningRequestButton.disabled = state.referenceBusy
    || !state.serverConnected || !active || !elements.planningPromptInput.value.trim();
  updatePlanningDepthControls();
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error || new Error("File read failed")));
    reader.readAsDataURL(file);
  });
}

async function runReferenceAction(action, successKey) {
  state.referenceBusy = true;
  renderReferenceStudio();
  try {
    await action();
    await loadServerProject(false);
    showToast(t(successKey));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  } finally {
    state.referenceBusy = false;
    renderReferenceStudio();
  }
}

async function uploadReference(file) {
  if (!file || !state.serverConnected) return;
  await runReferenceAction(async () => {
    await postProjectAction("/api/references/add", {
      data_url: await fileAsDataUrl(file),
      filename: file.name,
      role: elements.referenceRoleSelect.value,
      make_active: true,
    });
  }, "referenceUploaded");
  elements.referenceFileInput.value = "";
}

async function activateReference(sourceId) {
  if (sourceId === state.referenceIntelligence?.active_rgb) return;
  await runReferenceAction(
    () => postProjectAction("/api/references/active", { source_id: sourceId }),
    "referenceActivated",
  );
}

async function estimateReferenceDepth() {
  const active = activeReferenceItem();
  if (!active) return;
  await runReferenceAction(async () => {
    await postProjectAction("/api/depth/estimate", {
      source_id: active.id,
      model: elements.depthModelInput.value.trim(),
      device: elements.depthDeviceSelect.value,
      offline: elements.depthOfflineCheckbox.checked,
      zone_count: Number(elements.depthZoneCount.value),
    });
  }, "depthEstimated");
}

async function uploadDepthMap(file) {
  const active = activeReferenceItem();
  if (!file || !active) return;
  await runReferenceAction(async () => {
    await postProjectAction("/api/depth/register", {
      data_url: await fileAsDataUrl(file),
      filename: file.name,
      source_id: active.id,
      raw_near: elements.rawNearSelect.value,
      zone_count: Number(elements.depthZoneCount.value),
    });
  }, "depthImported");
  elements.depthFileInput.value = "";
}

async function initializeRecomposeScene() {
  const source = elements.recomposeSourceInput.files[0];
  const mask = elements.recomposeMaskInput.files[0];
  if (!source || !mask) {
    showToast(t("chooseSourceAndMask"));
    return;
  }
  try {
    await postProjectAction("/api/recompose/init", {
      source_data_url: await fileAsDataUrl(source),
      source_filename: source.name,
      mask_data_url: await fileAsDataUrl(mask),
      mask_filename: mask.name,
      prompt: elements.recomposePromptInput.value.trim(),
    });
    elements.recomposeSourceInput.value = "";
    elements.recomposeMaskInput.value = "";
    await loadServerProject(false);
    showToast(t("recomposeInitialized"));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}

async function registerCleanPlate() {
  const candidate = elements.cleanPlateInput.files[0];
  if (!candidate) {
    showToast(t("chooseCleanPlate"));
    return;
  }
  const rawSeed = elements.cleanPlateSeed.value.trim();
  try {
    await postProjectAction("/api/recompose/clean-plate", {
      data_url: await fileAsDataUrl(candidate),
      filename: candidate.name,
      model: elements.cleanPlateModel.value.trim() || undefined,
      seed: rawSeed ? Number.parseInt(rawSeed, 10) : undefined,
    });
    elements.cleanPlateInput.value = "";
    await loadServerProject(false);
    showToast(t("cleanPlateRegistered"));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}
async function savePlanningRequest() {
  const active = activeReferenceItem();
  const prompt = elements.planningPromptInput.value.trim();
  if (!active || !prompt) return;
  const faithful = elements.planningModeSelect.value === "faithful";
  await runReferenceAction(async () => {
    await postProjectAction("/api/planning-request", {
      source_id: active.id,
      depth_run_id: pairedDepthRun(active)?.id || null,
      prompt,
      mode: elements.planningModeSelect.value,
      layer_budget: Number(elements.planningLayerBudget.value),
      depth_flattening: faithful ? 0 : Number(elements.planningFlattenDepth.value) / 100,
      depth_exaggeration: faithful ? 0 : Number(elements.planningExaggerateDepth.value) / 100,
    });
  }, "planningRequestSaved");
}

const PROOF_PARAMETER_LABELS = {
  "composition.balance": "balanceLabel",
  "composition.subject_scale": "subjectScaleLabel",
  "composition.crop_strength": "cropStrengthLabel",
  "composition.negative_space": "negativeSpaceLabel",
  "composition.asymmetry": "asymmetryLabel",
  "space.flattening": "flatteningLabel",
  "space.depth_separation": "depthLabel",
  "space.perspective_strength": "perspectiveLabel",
  "form.simplification": "simplificationLabel",
  "form.geometricity": "geometricityLabel",
  "form.exaggeration": "exaggerationLabel",
  "form.contour_closure": "closureLabel",
  "value.groups": "valueGroupsLabel",
  "value.contrast": "contrastLabel",
  "value.focal_contrast": "focalContrastLabel",
  "color.intensity": "expertColorIntensityLabel",
  "color.palette_size": "paletteSizeLabel",
  "color.warmth": "warmthLabel",
  "color.accent_ratio": "accentRatioLabel",
  "edge.hardness": "edgeHardnessLabel",
  "edge.hierarchy": "edgeHierarchyLabel",
  "material.texture": "textureLabel",
  "material.mark_scale": "markScaleLabel",
};

function activeProofSet() {
  if (state.designProofs?.active) return state.designProofs.active;
  const activeId = state.designProofs?.active_set;
  return state.designProofs?.sets?.find((item) => item.id === activeId) || null;
}

function proofLocalized(value, fallback = "") {
  if (value && typeof value === "object") return value[state.locale] || value.en || value.zh || fallback;
  return typeof value === "string" ? value : fallback;
}

function flattenProofDeltas(deltas = {}) {
  const rows = [];
  Object.entries(deltas).forEach(([group, values]) => {
    Object.entries(values || {}).forEach(([key, value]) => {
      const magnitude = typeof value === "number" ? Math.abs(value) : 2;
      rows.push({ path: `${group}.${key}`, value, magnitude });
    });
  });
  return rows.sort((a, b) => b.magnitude - a.magnitude || a.path.localeCompare(b.path));
}

function formatProofDelta(path, value) {
  if (value && typeof value === "object") return `→ ${String(value.to || "")}`;
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (path === "value.groups" || path === "color.palette_size") return number > 0 ? `+${number}` : String(number);
  const percentage = Math.round(number * 100);
  return percentage > 0 ? `+${percentage}%` : `${percentage}%`;
}

function renderProofStudio() {
  if (!elements.proofGrid) return;
  const active = activeProofSet();
  const statusKey = {
    draft: "proofStatusDraft",
    selected: "proofStatusSelected",
    locked: "proofStatusLocked",
    promoted: "proofStatusPromoted",
  }[active?.status] || "proofStatusDraft";
  const resolvedStatusKey = active?.stale ? "proofStatusStale" : statusKey;
  elements.proofStatusBadge.textContent = active ? t(resolvedStatusKey) : "0 / 3";
  elements.proofStatusBadge.dataset.status = active?.stale ? "stale" : (active?.status || "empty");
  elements.generateProofsButton.disabled = !state.serverConnected || !state.designPlan;
  elements.proofSpreadValue.value = `${Math.round(Number(elements.proofSpreadInput.value))}%`;

  if (!active) {
    const empty = document.createElement("p");
    empty.className = "proof-empty";
    empty.textContent = t("proofEmpty");
    elements.proofGrid.replaceChildren(empty);
    elements.proofLockButton.disabled = true;
    elements.proofPromoteButton.disabled = true;
    elements.proofLockButton.textContent = t("lockProof");
    return;
  }

  const fragment = document.createDocumentFragment();
  active.variants.forEach((variant) => {
    const selected = active.selected === variant.id;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "proof-card";
    card.classList.toggle("is-selected", selected);
    card.classList.toggle("is-locked", selected && active.locked);
    card.disabled = active.stale || active.locked || active.status === "promoted";
    card.setAttribute("aria-pressed", String(selected));

    const thumbnail = document.createElement("span");
    thumbnail.className = "proof-thumbnail";
    const image = document.createElement("img");
    const cacheKey = variant.preview_sha256 || variant.plan_sha256 || active.created_at;
    image.src = `/api/proofs/${encodeURIComponent(active.id)}/${encodeURIComponent(variant.id)}/preview?v=${encodeURIComponent(cacheKey)}`;
    image.alt = proofLocalized(variant.name, variant.id.toUpperCase());
    thumbnail.append(image);

    const copy = document.createElement("span");
    copy.className = "proof-copy";
    const top = document.createElement("span");
    top.className = "proof-card-topline";
    const letter = document.createElement("b");
    letter.textContent = variant.id.toUpperCase();
    const kind = document.createElement("em");
    kind.textContent = t(variant.preview_kind === "rendered" ? "proofRenderedPreview" : "proofParameterSketch");
    top.append(letter, kind);
    const title = document.createElement("strong");
    title.textContent = proofLocalized(variant.name, variant.id.toUpperCase());
    const intent = document.createElement("small");
    intent.textContent = proofLocalized(variant.intent);
    copy.append(top, title, intent);

    const deltaRows = flattenProofDeltas(variant.parameter_deltas).slice(0, 3);
    const deltaList = document.createElement("span");
    deltaList.className = "proof-deltas proof-expert-only";
    if (!deltaRows.length) {
      deltaList.textContent = t("proofDeltaNone");
    } else {
      deltaRows.forEach((row) => {
        const chip = document.createElement("i");
        chip.textContent = `${t(PROOF_PARAMETER_LABELS[row.path] || row.path)} ${formatProofDelta(row.path, row.value)}`;
        deltaList.append(chip);
      });
    }
    copy.append(deltaList);
    card.append(thumbnail, copy);
    card.addEventListener("click", () => { void selectProofVariant(variant.id); });
    fragment.append(card);
  });
  elements.proofGrid.replaceChildren(fragment);
  const promoted = active.status === "promoted";
  elements.proofLockButton.disabled = !state.serverConnected || active.stale || !active.selected || promoted;
  elements.proofLockButton.textContent = t(promoted ? "proofStatusLocked" : (active.locked ? "unlockProof" : "lockProof"));
  elements.proofPromoteButton.disabled = !state.serverConnected || active.stale || !active.selected || !active.locked || promoted;
}

async function generateDesignProofs() {
  if (!state.serverConnected || !state.designPlan) return;
  try {
    await postProjectAction("/api/proofs/create", {
      stage: elements.proofStageSelect.value,
      spread: Number(elements.proofSpreadInput.value) / 100,
    });
    await loadServerProject(false);
    showToast(t("proofCreated"));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}

async function selectProofVariant(variantId) {
  const active = activeProofSet();
  if (!state.serverConnected || !active || active.locked) return;
  try {
    await postProjectAction("/api/proofs/select", { set_id: active.id, variant_id: variantId });
    await loadServerProject(false);
    showToast(t("proofSelectedToast", { variant: variantId.toUpperCase() }));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}

async function toggleProofLock() {
  const active = activeProofSet();
  if (!state.serverConnected || !active?.selected || active.status === "promoted") return;
  const locked = !active.locked;
  try {
    await postProjectAction("/api/proofs/lock", { set_id: active.id, locked });
    await loadServerProject(false);
    showToast(t(locked ? "proofLockedToast" : "proofUnlockedToast"));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}

async function promoteSelectedProof() {
  const active = activeProofSet();
  if (!state.serverConnected || !active?.selected || !active.locked || active.status === "promoted") return;
  try {
    await postProjectAction("/api/proofs/promote", { set_id: active.id });
    await loadServerProject(false);
    showToast(t("proofPromotedToast"));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}

async function changeWorkflowMode(mode) {
  if (!state.serverConnected || !["guided", "expert"].includes(mode) || mode === state.workflowMode) return;
  try {
    await postProjectAction("/api/design", { workflow_mode: mode });
    state.workflowMode = mode;
    if (state.designPlan) state.designPlan.workflow_mode = mode;
    renderWorkflowMode();
    invalidateRequest();
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}

async function applySelectedPreset() {
  if (!state.serverConnected || !state.selectedPresetId) return;
  try {
    await postProjectAction("/api/design/preset", {
      preset_id: state.selectedPresetId,
      workflow_mode: "guided",
      controls: guidedControlValues(),
    });
    await loadServerProject(false);
    showToast(t("presetApplied"));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}

async function saveExpertDesign() {
  if (!state.serverConnected || !state.designPlan) return;
  try {
    await postProjectAction("/api/design", {
      workflow_mode: "expert",
      parameters: readExpertControlValues(),
    });
    await loadServerProject(false);
    showToast(t("designSaved"));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}

async function saveCustomPreset() {
  if (!state.serverConnected) return;
  const exposedControls = elements.exposedControlInputs.filter((input) => input.checked).map((input) => input.value);
  try {
    await postProjectAction("/api/presets/save", {
      preset_id: elements.presetIdInput.value.trim(),
      name_zh: elements.presetNameZh.value.trim(),
      name_en: elements.presetNameEn.value.trim(),
      exposed_controls: exposedControls,
    });
    await loadServerProject(false);
    showToast(t("presetCreated"));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
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
  const modeLabelKeys = {
    layer: "modeLayer",
    bbox: "modeBbox",
    lasso: "modeLasso",
    brush: "modeBrush",
    "semantic-text": "modeText",
  };
  elements.selectionModeLabel.textContent = t(modeLabelKeys[state.mode]);
  renderOutputMode();
  renderDesignStudio();
  renderReferenceStudio();
  renderRecomposeControls();

  refreshLayerLabels();
  renderLayers();
  renderLayerControls();
  renderSelection();
  renderHistory();
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

function numericDataset(node, key, fallback) {
  const value = Number.parseFloat(node.dataset[key]);
  return Number.isFinite(value) ? value : fallback;
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
      const bitmap = node.querySelector(":scope > image");
      const opacity = Number.parseFloat(node.dataset.opacity || bitmap?.getAttribute("opacity") || node.getAttribute("opacity") || "1");
      node.classList.toggle("lr-is-hidden", hidden);
      node.classList.toggle("lr-is-locked", locked);
      return {
        id: node.id,
        index,
        label: layerLabel(node),
        labelEn: node.dataset.labelEn || node.dataset.label || node.id,
        labelZh: node.dataset.labelZh || node.dataset.label || node.id,
        layerType: node.dataset.layerType || (projectIsPixelArt() ? "pixel" : projectIsRaster() ? "raster" : "vector"),
        editableSource: node.dataset.editableSource || "",
        blendMode: node.dataset.blendMode || "normal",
        opacity: Number.isFinite(opacity) ? opacity : 1,
        dependsOn: (node.dataset.dependsOn || "").split(/\s+/).filter(Boolean),
        role: node.dataset.role || "artwork",
        transform: {
          translateX: numericDataset(node, "translateX", 0),
          translateY: numericDataset(node, "translateY", 0),
          scaleX: numericDataset(node, "scaleX", 1),
          scaleY: numericDataset(node, "scaleY", 1),
          rotationDeg: numericDataset(node, "rotationDeg", 0),
          anchorX: numericDataset(node, "anchorX", 0.5),
          anchorY: numericDataset(node, "anchorY", 0.5),
        },
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
  state.selectedPhysicalObjectId = null;
  state.newPhysicalSpecLayerId = null;
  state.bbox = null;
  state.request = null;
  state.projectMeta = projectMeta;
  state.serverConnected = Boolean(projectMeta);
  state.history = Array.isArray(projectMeta?.history?.snapshots) ? projectMeta.history.snapshots : [];
  state.designPlan = projectMeta?.design_plan || null;
  state.designPresets = Array.isArray(projectMeta?.design_presets) ? projectMeta.design_presets : [];
  state.designProofs = projectMeta?.design_proofs || null;
  state.referenceIntelligence = projectMeta?.reference_intelligence || null;
  state.sceneReconstruction = projectMeta?.scene_reconstruction || null;
  state.physicalSpecifications = projectMeta?.physical_specifications?.document || null;
  state.specExportCapabilities = projectMeta?.spec_export_capabilities || { svg: true, pdf: false, png: false, csv: true, json: true };
  state.workflowMode = state.designPlan?.workflow_mode === "expert" ? "expert" : "guided";
  state.selectedPresetId = state.designPlan?.selected_preset || null;
  state.maskDirty = false;
  state.maskMeta = null;
  state.maskPointer = null;
  state.sourceName = sourceName;
  state.revision = projectMeta?.manifest?.revision || (await shortHash(text));

  const [, , width, height] = viewBoxValues(svg);
  elements.maskCanvas.width = Math.max(1, Math.round(width));
  elements.maskCanvas.height = Math.max(1, Math.round(height));
  elements.maskCanvas.getContext("2d").clearRect(0, 0, elements.maskCanvas.width, elements.maskCanvas.height);
  elements.artboard.style.aspectRatio = `${width} / ${height}`;
  elements.artboard.hidden = false;
  elements.canvasEmpty.hidden = true;
  elements.documentName.textContent = sourceName;
  renderOutputMode();
  renderDesignStudio();
  renderReferenceStudio();
  renderRecomposeControls();
  elements.revisionBadge.textContent = state.revision;
  elements.canvasSize.textContent = `${Math.round(width)} × ${Math.round(height)}`;
  elements.layerCount.textContent = String(state.layers.length);
  elements.showAllButton.disabled = false;
  elements.clearSelectionButton.disabled = false;
  elements.validateButton.disabled = false;
  elements.qualityButton.disabled = !state.serverConnected;
  elements.undoButton.disabled = !state.serverConnected || state.history.length === 0;
  elements.topExportButton.disabled = true;
  elements.copyRequestButton.disabled = true;
  elements.downloadRequestButton.disabled = true;
  elements.requestJson.textContent = t("waitingToGenerate");
  elements.validationCard.hidden = true;

  renderLayers();
  renderLayerControls();
  renderHistory();
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
    lockButton.disabled = layer.role === "clean-plate";
    lockButton.addEventListener("click", () => toggleLock(layer.id));

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "layer-select-button";
    selectButton.innerHTML = `<strong></strong><small></small>`;
    selectButton.querySelector("strong").textContent = layer.label;
    const objectCountKey = state.locale === "en" && layer.objectCount === 1 ? "objectCountOne" : "objectCount";
    const technicalLabel = projectIsRaster()
      ? `${layer.layerType.toUpperCase()} · ${layer.blendMode}`
      : t(objectCountKey, { count: layer.objectCount });
    selectButton.querySelector("small").textContent = `${layer.id} · ${technicalLabel}`;
    selectButton.addEventListener("click", (event) => {
      selectLayer(layer.id, event.ctrlKey || event.metaKey || event.shiftKey);
    });

    row.append(visibilityButton, lockButton, selectButton);
    fragment.append(row);
  });
  elements.layerList.replaceChildren(fragment);
}

function physicalObjects() {
  const objects = state.physicalSpecifications?.objects;
  return Array.isArray(objects) ? objects : [];
}

function physicalObjectsForLayer(layer) {
  if (!layer) return [];
  return physicalObjects().filter((item) => item?.layer_id === layer.id);
}

function physicalSpecForLayer(layer) {
  if (!layer || state.newPhysicalSpecLayerId === layer.id) return null;
  const linkedObjectIds = state.selectedObjectIds;
  const layerObjects = physicalObjectsForLayer(layer);
  const explicitlySelected = layerObjects.find((item) => item?.id === state.selectedPhysicalObjectId);
  if (explicitlySelected) return explicitlySelected;
  return layerObjects.find((item) => {
    const nodeIds = Array.isArray(item.object_node_ids) ? item.object_node_ids : [];
    return nodeIds.some((id) => linkedObjectIds.has(id));
  }) || layerObjects[0] || null;
}

function defaultPhysicalObjectId(layer) {
  const base = `object-${layer.id.replace(/^layer-/, "")}`;
  const used = new Set(physicalObjects().map((item) => item?.id).filter(Boolean));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function renderPhysicalObjectPicker(layer, specification) {
  const fragment = document.createDocumentFragment();
  if (!specification) {
    const newOption = document.createElement("option");
    newOption.value = "";
    newOption.textContent = t("specNewObjectOption");
    fragment.append(newOption);
  }
  physicalObjectsForLayer(layer).forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    const label = state.locale === "en"
      ? item.name_en || item.name_zh || item.id
      : item.name_zh || item.name_en || item.id;
    option.textContent = `${label} · ${item.id}`;
    fragment.append(option);
  });
  elements.specObjectSelect.replaceChildren(fragment);
  elements.specObjectSelect.value = specification?.id || "";
  state.selectedPhysicalObjectId = specification?.id || null;
}

function measurementLines(specification) {
  const measurements = specification?.measurements;
  if (!measurements || typeof measurements !== "object") return "";
  return Object.entries(measurements)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([name, item]) => {
      const tolerance = Number.isFinite(Number(item?.tolerance)) ? `±${Number(item.tolerance)}` : "";
      return `${name}=${Number(item?.value)}${item?.unit || ""}${tolerance}`;
    })
    .join("\n");
}

function renderPhysicalSpecControls() {
  const selected = [...state.selectedIds].map(layerById).filter(Boolean);
  const layer = selected.length === 1 ? selected[0] : null;
  elements.physicalSpecControls.hidden = !layer;
  if (!layer) return;
  const specification = physicalSpecForLayer(layer);
  renderPhysicalObjectPicker(layer, specification);
  const placement = specification?.placement || {};
  const pose = placement.pose || {};
  const declaredSize = specification?.declared_size || {};
  const layout = state.physicalSpecifications?.layout || {};
  const outputSize = layout.output_size || {};
  const drawingScale = layout.drawing_scale || { mode: "not-to-scale" };
  elements.specOutputWidthInput.value = outputSize.width ?? "";
  elements.specOutputHeightInput.value = outputSize.height ?? "";
  elements.specOutputUnitSelect.value = outputSize.unit || "mm";
  elements.specDrawingScaleInput.value = drawingScale.mode === "ratio"
    ? `${drawingScale.numerator}:${drawingScale.denominator}`
    : "not-to-scale";
  elements.specObjectIdInput.value = specification?.id || defaultPhysicalObjectId(layer);
  elements.specObjectIdInput.readOnly = Boolean(specification);
  elements.specCategoryInput.value = specification?.category || "generic-object";
  elements.specNameZhInput.value = specification?.name_zh || layer.labelZh || "";
  elements.specNameEnInput.value = specification?.name_en || layer.labelEn || layer.label || "";
  elements.specSizeLabelInput.value = declaredSize.label || "";
  elements.specSizeSystemInput.value = declaredSize.system || "";
  elements.specMeasurementsInput.value = measurementLines(specification);
  elements.specSourceSelect.value = specification?.measurement_source || "user-provided";
  elements.specVerificationSelect.value = specification?.verification || "declared";
  elements.specConfidenceInput.value = String(specification?.confidence ?? 1);
  elements.specXInput.value = String(placement.x ?? 0);
  elements.specYInput.value = String(placement.y ?? 0);
  elements.specRotationInput.value = String(placement.rotation_deg ?? 0);
  elements.specScaleInput.value = String(placement.scale_percent ?? 100);
  elements.specYawInput.value = pose.yaw_deg ?? "";
  elements.specPitchInput.value = pose.pitch_deg ?? "";
  elements.specRollInput.value = pose.roll_deg ?? "";
  elements.specNotesInput.value = specification?.notes || "";
  const count = specification && specification.measurements
    ? Object.keys(specification.measurements).length
    : 0;
  elements.physicalSpecStatus.textContent = specification
    ? t("specStatusCount", { count })
    : t("specStatusNew");
  elements.savePhysicalSpec.disabled = !state.serverConnected;
  elements.removePhysicalSpec.disabled = !state.serverConnected || !specification;
  elements.newPhysicalSpec.disabled = !state.serverConnected;
  elements.specExportFormatInputs.forEach((input) => {
    const available = state.specExportCapabilities[input.value] !== false;
    input.disabled = !available;
    input.closest("label")?.classList.toggle("is-unavailable", !available);
    if (!available) input.checked = false;
  });
  updateSpecificationExportControls();
  elements.exportPhysicalSpecs.disabled = !state.serverConnected;
  elements.saveSpecLayout.disabled = !state.serverConnected;
}

function renderRecomposeControls() {
  const raster = projectIsRaster();
  elements.recomposeControls.hidden = !raster;
  if (!raster) return;
  const reconstruction = state.sceneReconstruction || { enabled: false, status: "not-configured" };
  const statusKey = reconstruction.status === "ready"
    ? "recomposeStatusReady"
    : reconstruction.enabled ? "recomposeStatusPending" : "recomposeStatusOff";
  elements.recomposeStatus.textContent = t(statusKey);
  elements.recomposeStatus.dataset.status = reconstruction.status || "not-configured";
  elements.initializeRecompose.disabled = !state.serverConnected;
  elements.registerCleanPlate.disabled = !state.serverConnected || !reconstruction.enabled;
  elements.cleanPlateInput.disabled = !state.serverConnected || !reconstruction.enabled;
  elements.cleanPlateModel.disabled = !state.serverConnected || !reconstruction.enabled;
  elements.cleanPlateSeed.disabled = !state.serverConnected || !reconstruction.enabled;
}
function renderLayerControls() {
  const selected = [...state.selectedIds].map(layerById).filter(Boolean);
  const layer = selected.length === 1 ? selected[0] : null;
  elements.layerControls.hidden = !layer;
  renderPhysicalSpecControls();
  if (!layer) return;
  elements.activeLayerType.textContent = layer.layerType.toUpperCase();
  elements.layerOpacityInput.value = String(Math.round(layer.opacity * 100));
  elements.layerOpacityValue.value = `${Math.round(layer.opacity * 100)}%`;
  elements.blendModeSelect.value = layer.blendMode;
  elements.layerTypeSelect.value = layer.layerType;
  elements.layerTypeSelect.disabled = !projectIsRaster();
  elements.layerRoleSelect.value = layer.role || "artwork";
  const transform = layer.transform || {
    translateX: 0,
    translateY: 0,
    scaleX: 1,
    scaleY: 1,
    rotationDeg: 0,
    anchorX: 0.5,
    anchorY: 0.5,
  };
  elements.layerTranslateX.value = String(transform.translateX);
  elements.layerTranslateY.value = String(transform.translateY);
  elements.layerScaleX.value = String(transform.scaleX * 100);
  elements.layerScaleY.value = String(transform.scaleY * 100);
  elements.layerRotation.value = String(transform.rotationDeg);
  elements.layerAnchorX.value = String(transform.anchorX);
  elements.layerAnchorY.value = String(transform.anchorY);
  elements.resetLayerTransform.checked = false;
  const transformDisabled = !projectIsRaster() || layer.role === "clean-plate";
  elements.layerRoleSelect.disabled = !projectIsRaster() || layer.role === "clean-plate";
  [
    elements.layerTranslateX,
    elements.layerTranslateY,
    elements.layerScaleX,
    elements.layerScaleY,
    elements.layerRotation,
    elements.layerAnchorX,
    elements.layerAnchorY,
    elements.resetLayerTransform,
  ].forEach((input) => { input.disabled = transformDisabled; });
  elements.editableSourceInput.value = layer.editableSource || "";
  elements.editableSourceInput.disabled = !projectIsRaster();
  elements.labelZhInput.value = layer.labelZh || layer.label;
  elements.labelEnInput.value = layer.labelEn || layer.label;
  const position = state.layers.indexOf(layer);
  elements.moveLayerDown.disabled = !state.serverConnected || layer.role === "clean-plate" || position <= 0;
  elements.moveLayerUp.disabled = !state.serverConnected || layer.role === "clean-plate" || position >= state.layers.length - 1;
  elements.applyLayerSettings.disabled = !state.serverConnected;
}

function toggleVisibility(id) {
  const layer = layerById(id);
  if (!layer) return;
  layer.hidden = !layer.hidden;
  layer.node.classList.toggle("lr-is-hidden", layer.hidden);
  if (layer.hidden) state.selectedIds.delete(id);
  invalidateRequest();
  renderLayers();
  renderLayerControls();
  renderSelection();
}

function toggleLock(id) {
  const layer = layerById(id);
  if (!layer || layer.role === "clean-plate") return;
  layer.locked = !layer.locked;
  layer.node.classList.toggle("lr-is-locked", layer.locked);
  if (layer.locked) state.selectedIds.delete(id);
  invalidateRequest();
  renderLayers();
  renderLayerControls();
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
    state.selectedPhysicalObjectId = null;
    state.newPhysicalSpecLayerId = null;
  }
  if (additive && state.selectedIds.has(id)) {
    state.selectedIds.delete(id);
  } else {
    state.selectedIds.add(id);
  }
  if (objectId && objectId !== id) state.selectedObjectIds.add(objectId);
  if (objectId) {
    const linked = physicalObjectsForLayer(layer).find((item) => {
      return Array.isArray(item.object_node_ids) && item.object_node_ids.includes(objectId);
    });
    state.selectedPhysicalObjectId = linked?.id || null;
  }
  state.bbox = null;
  invalidateRequest();
  renderLayers();
  renderLayerControls();
  renderSelection();
}

function clearSelection() {
  state.selectedIds.clear();
  state.selectedObjectIds.clear();
  state.bbox = null;
  invalidateRequest();
  renderLayers();
  renderLayerControls();
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

function expandedSelectionIds() {
  const result = new Set(state.selectedIds);
  if (!elements.linkedLayersCheckbox.checked) return result;
  let changed = true;
  while (changed) {
    changed = false;
    state.layers.forEach((layer) => {
      const linked = layer.dependsOn.some((dependency) => result.has(dependency));
      const ownsDependency = result.has(layer.id);
      if (linked && !result.has(layer.id)) {
        result.add(layer.id);
        changed = true;
      }
      if (ownsDependency) {
        layer.dependsOn.forEach((dependency) => {
          if (!result.has(dependency)) {
            result.add(dependency);
            changed = true;
          }
        });
      }
    });
  }
  return result;
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
    chip.textContent = t(
      state.mode === "bbox"
        ? "bboxPrompt"
        : state.mode === "lasso" || state.mode === "brush"
          ? "maskPrompt"
          : "noLayerSelected",
    );
    elements.selectionChips.append(chip);
    elements.contextNote.textContent = t(
      state.mode === "bbox"
        ? "bboxNote"
        : state.mode === "lasso" || state.mode === "brush"
          ? "maskPrompt"
          : "selectScopeHint",
    );
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
  elements.canvasStage.classList.toggle("is-mask-mode", mode === "lasso" || mode === "brush");
  elements.canvasStage.classList.toggle("is-text-mode", mode === "semantic-text");
  const labelKeys = {
    layer: "modeLayer",
    bbox: "modeBbox",
    lasso: "modeLasso",
    brush: "modeBrush",
    "semantic-text": "modeText",
  };
  elements.selectionModeLabel.textContent = t(labelKeys[mode]);
  const maskMode = mode === "lasso" || mode === "brush";
  elements.maskCanvas.hidden = !maskMode;
  elements.maskToolbar.hidden = !maskMode;
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
  const hasMask = !["lasso", "brush"].includes(state.mode) || state.maskDirty || state.maskMeta;
  elements.buildRequestButton.disabled = !(state.svg && hasInstruction && hasScope && hasMask);
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

function pointToMask(clientX, clientY) {
  const point = pointToSvg(clientX, clientY);
  if (!point || !state.svg) return null;
  const [viewX, viewY] = viewBoxValues(state.svg);
  return {
    x: point.x - viewX,
    y: point.y - viewY,
  };
}

function clearMask() {
  const context = elements.maskCanvas.getContext("2d");
  context.clearRect(0, 0, elements.maskCanvas.width, elements.maskCanvas.height);
  state.maskDirty = false;
  state.maskMeta = null;
  state.maskPointer = null;
  invalidateRequest();
  updateActionAvailability();
}

function beginMask(event) {
  if (!["lasso", "brush"].includes(state.mode) || !state.svg || event.button !== 0) return false;
  if (!state.selectedIds.size) {
    showToast(t("maskPrompt"));
    return false;
  }
  const point = pointToMask(event.clientX, event.clientY);
  if (!point) return false;
  const context = elements.maskCanvas.getContext("2d");
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = "#a95649";
  context.fillStyle = "#a95649";
  context.globalAlpha = 1;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Number(elements.brushSizeInput.value);
  state.maskPointer = {
    pointerId: event.pointerId,
    points: [point],
    last: point,
  };
  elements.canvasStage.setPointerCapture(event.pointerId);
  if (state.mode === "brush") {
    context.beginPath();
    context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
  }
  event.preventDefault();
  return true;
}

function continueMask(event) {
  const pointer = state.maskPointer;
  if (!pointer || pointer.pointerId !== event.pointerId) return false;
  const point = pointToMask(event.clientX, event.clientY);
  if (!point) return false;
  const context = elements.maskCanvas.getContext("2d");
  if (state.mode === "brush") {
    context.beginPath();
    context.moveTo(pointer.last.x, pointer.last.y);
    context.lineTo(point.x, point.y);
    context.stroke();
  } else if (state.mode === "lasso") {
    context.save();
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(pointer.last.x, pointer.last.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    context.restore();
  }
  pointer.points.push(point);
  pointer.last = point;
  event.preventDefault();
  return true;
}

function finishMask(event) {
  const pointer = state.maskPointer;
  if (!pointer || pointer.pointerId !== event.pointerId) return false;
  if (state.mode === "lasso" && pointer.points.length >= 3) {
    const context = elements.maskCanvas.getContext("2d");
    context.beginPath();
    context.moveTo(pointer.points[0].x, pointer.points[0].y);
    pointer.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.fill();
  }
  state.maskPointer = null;
  state.maskDirty = true;
  state.maskMeta = null;
  invalidateRequest();
  updateActionAvailability();
  event.preventDefault();
  return true;
}

function rasterLayerBounds(layer) {
  if (!projectIsRaster()) return null;
  const values = (layer.node.dataset.bbox || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return null;
  const [x, y, width, height] = values;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function rasterLayerAtPoint(clientX, clientY) {
  const point = pointToSvg(clientX, clientY);
  if (!point) return null;
  for (const layer of [...state.layers].reverse()) {
    if (layer.hidden || layer.locked) continue;
    const bounds = rasterLayerBounds(layer);
    if (!bounds) continue;
    if (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    ) {
      return layer.node;
    }
  }
  return null;
}

function rasterLayerScreenRect(layer) {
  const bounds = rasterLayerBounds(layer);
  const matrix = state.svg?.getScreenCTM();
  if (!bounds || !matrix || !state.svg) return layer.node.getBoundingClientRect();
  const first = state.svg.createSVGPoint();
  first.x = bounds.x;
  first.y = bounds.y;
  const second = state.svg.createSVGPoint();
  second.x = bounds.x + bounds.width;
  second.y = bounds.y + bounds.height;
  const start = first.matrixTransform(matrix);
  const end = second.matrixTransform(matrix);
  return {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
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
    const layerNode = projectIsRaster()
      ? rasterLayerAtPoint(event.clientX, event.clientY)
      : findOwningLayer(target);
    if (layerNode) {
      const objectId = projectIsRaster() ? null : target?.id;
      selectLayer(layerNode.id, event.ctrlKey || event.metaKey || event.shiftKey, objectId);
    }
    return;
  }

  state.selectedIds.clear();
  state.selectedObjectIds.clear();
  for (const layer of state.layers) {
    if (layer.hidden || layer.locked) continue;
    const rect = projectIsRaster() ? rasterLayerScreenRect(layer) : layer.node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && intersects(selectionRect, rect)) {
      state.selectedIds.add(layer.id);
      if (!projectIsRaster()) {
        layer.node.querySelectorAll(GRAPHIC_SELECTOR).forEach((object) => {
          if (!object.id || state.selectedObjectIds.size >= 100) return;
          const objectRect = object.getBoundingClientRect();
          if (objectRect.width > 0 && objectRect.height > 0 && intersects(selectionRect, objectRect)) {
            state.selectedObjectIds.add(object.id);
          }
        });
      }
    }
  }
  if (projectIsRaster() && state.selectedIds.size > 1) {
    const bottomLayer = state.layers[0];
    if (bottomLayer) state.selectedIds.delete(bottomLayer.id);
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

async function persistMask() {
  if (!["lasso", "brush"].includes(state.mode)) return null;
  if (state.maskMeta && !state.maskDirty) return state.maskMeta;
  if (!state.maskDirty) {
    showToast(t("maskRequired"));
    return null;
  }
  if (!state.serverConnected) {
    return {
      id: "downloaded-selection-mask",
      file: `${safeFilename(state.sourceName || "artwork")}-selection-mask.png`,
      selection_mode: state.mode,
      canvas: { width: elements.maskCanvas.width, height: elements.maskCanvas.height },
    };
  }
  const result = await postProjectAction("/api/mask", {
    data_url: elements.maskCanvas.toDataURL("image/png"),
    selection_mode: state.mode,
  });
  state.maskMeta = result.mask;
  state.maskDirty = false;
  showToast(t("maskSaved"));
  return state.maskMeta;
}

async function buildEditRequest() {
  const instruction = elements.instructionInput.value.trim();
  if (!state.svg || !instruction) return null;
  if (state.mode !== "semantic-text" && !state.selectedIds.size) {
    showToast(t("selectFirst"));
    return null;
  }
  let mask = null;
  try {
    mask = await persistMask();
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
    return null;
  }
  if (["lasso", "brush"].includes(state.mode) && !mask) return null;
  const [x, y, width, height] = viewBoxValues(state.svg);
  const scopedIds = expandedSelectionIds();
  const expectedChangedLayers = state.mode === "semantic-text" ? [] : [...scopedIds];
  const preserved = elements.preserveCheckbox.checked
    ? state.layers.map((layer) => layer.id).filter((id) => !scopedIds.has(id))
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
      mask: ["lasso", "brush"].includes(state.mode) ? mask : null,
    },
    instruction,
    expected_changed_layers: expectedChangedLayers,
    preserve_layers: preserved,
    constraints: {
      preserve_unselected: elements.preserveCheckbox.checked,
      preserve_stable_layer_ids: true,
      require_patch_plan: true,
      output_mode: state.projectMeta?.config?.output_mode || "vector-strict",
      style: state.projectMeta?.config?.style || null,
      pixel_art: projectIsPixelArt() ? state.projectMeta.config.pixel_art : null,
      style_recipe: state.projectMeta?.config?.style_recipe || null,
      include_linked_layers: elements.linkedLayersCheckbox.checked,
      replacement_action: projectIsRaster() ? "replace-layer-file" : "structured-svg-patch",
    },
    design: state.designPlan
      ? {
          workflow_mode: state.workflowMode,
          selected_preset: state.designPlan.selected_preset,
          style: state.designPlan.style,
          artwork_text: false,
          controls: state.designPlan.controls,
          parameters: state.designPlan.parameters,
          proof: state.designPlan.proof || (activeProofSet()?.selected
            ? {
                set_id: activeProofSet().id,
                variant_id: activeProofSet().selected,
                stage: activeProofSet().stage,
                status: activeProofSet().status,
              }
            : null),
        }
      : null,
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

function downloadMaskFile() {
  const anchor = document.createElement("a");
  anchor.href = elements.maskCanvas.toDataURL("image/png");
  anchor.download = `${safeFilename(state.sourceName || "artwork")}-selection-mask.png`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

async function downloadRequest() {
  const request = state.request || (await buildEditRequest());
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
  if (["lasso", "brush"].includes(state.mode) && !state.serverConnected) downloadMaskFile();
  showToast(t("requestDownloaded"));
}

async function copyRequest() {
  const request = state.request || (await buildEditRequest());
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

async function ensureEditorSession() {
  if (state.sessionToken) return;
  const response = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
  const session = await response.json();
  if (!response.ok || !session.ok || !session.token) {
    throw new Error(session.error || `Unable to establish editor session (HTTP ${response.status})`);
  }
  state.sessionToken = session.token;
  state.sessionHeader = session.header || "X-Layered-Redraw-Token";
}

async function postProjectAction(path, payload) {
  await ensureEditorSession();
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      [state.sessionHeader]: state.sessionToken,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

async function saveLayerSettings(move = null) {
  const selected = [...state.selectedIds].map(layerById).filter(Boolean);
  if (!state.serverConnected || selected.length !== 1) {
    showToast(t("serveHint"));
    return;
  }
  const layer = selected[0];
  const payload = {
    layer_id: layer.id,
    opacity: Number(elements.layerOpacityInput.value) / 100,
    blend_mode: elements.blendModeSelect.value,
    visible: !layer.hidden,
    locked: layer.locked,
    label_zh: elements.labelZhInput.value.trim(),
    label_en: elements.labelEnInput.value.trim(),
  };
  if (projectIsRaster()) {
    payload.layer_type = elements.layerTypeSelect.value;
    payload.role = elements.layerRoleSelect.value;
    if (elements.resetLayerTransform.checked) {
      payload.reset_transform = true;
    } else if (layer.role !== "clean-plate") {
      payload.translate_x = Number(elements.layerTranslateX.value);
      payload.translate_y = Number(elements.layerTranslateY.value);
      payload.scale_x = Number(elements.layerScaleX.value) / 100;
      payload.scale_y = Number(elements.layerScaleY.value) / 100;
      payload.rotation_deg = Number(elements.layerRotation.value);
      payload.anchor_x = Number(elements.layerAnchorX.value);
      payload.anchor_y = Number(elements.layerAnchorY.value);
    }
    if (elements.editableSourceInput.value.trim()) {
      payload.editable_source = elements.editableSourceInput.value.trim();
    }
  }
  if (move) payload.move = move;
  try {
    await postProjectAction("/api/layer-settings", payload);
    await loadServerProject(false);
    showToast(t("layerSettingsSaved"));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}

function parsePhysicalMeasurements() {
  const result = {};
  const lines = elements.specMeasurementsInput.value
    .split(/\r?\n/)
    .map((value) => value.trim().replace(/\s+/g, ""))
    .filter(Boolean);
  const pattern = /^([a-z][a-z0-9-]*)=([+]?(?:\d+(?:\.\d*)?|\.\d+))(mm|cm|m|in|ft)(?:±(\d+(?:\.\d*)?|\.\d+))?$/i;
  lines.forEach((line) => {
    const match = pattern.exec(line);
    if (!match || Number(match[2]) <= 0) {
      throw new Error(t("specMeasurementInvalid", { value: line }));
    }
    result[match[1].toLowerCase()] = {
      value: Number(match[2]),
      unit: match[3].toLowerCase(),
      ...(match[4] ? { tolerance: Number(match[4]) } : {}),
    };
  });
  return result;
}

function optionalNumber(input) {
  return input.value.trim() === "" ? null : Number(input.value);
}

function choosePhysicalSpecification() {
  const selected = [...state.selectedIds].map(layerById).filter(Boolean);
  const layer = selected.length === 1 ? selected[0] : null;
  if (!layer) return;
  const objectId = elements.specObjectSelect.value;
  state.selectedPhysicalObjectId = objectId || null;
  state.newPhysicalSpecLayerId = objectId ? null : layer.id;
  renderPhysicalSpecControls();
}

function beginPhysicalSpecification() {
  const selected = [...state.selectedIds].map(layerById).filter(Boolean);
  const layer = selected.length === 1 ? selected[0] : null;
  if (!layer) return;
  state.selectedPhysicalObjectId = null;
  state.newPhysicalSpecLayerId = layer.id;
  renderPhysicalSpecControls();
  elements.specObjectIdInput.focus();
}

async function savePhysicalSpecificationLayout() {
  const selected = [...state.selectedIds].map(layerById).filter(Boolean);
  const layer = selected.length === 1 ? selected[0] : null;
  if (!state.serverConnected) return;
  try {
    const width = optionalNumber(elements.specOutputWidthInput);
    const height = optionalNumber(elements.specOutputHeightInput);
    if ((width === null) !== (height === null)) throw new Error(t("specLayoutRequired"));
    const payload = {
      coordinate_unit: state.physicalSpecifications?.layout?.coordinate_unit
        || (projectIsRaster() ? "px" : "svg-unit"),
      drawing_scale: elements.specDrawingScaleInput.value.trim() || "not-to-scale",
    };
    if (width !== null && height !== null) {
      payload.output_width = width;
      payload.output_height = height;
      payload.output_unit = elements.specOutputUnitSelect.value;
    }
    await postProjectAction("/api/specs/layout", payload);
    await loadServerProject(false);
    if (layer) selectLayer(layer.id);
    showToast(t("specLayoutSaved"));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}

async function savePhysicalSpecification() {
  const selected = [...state.selectedIds].map(layerById).filter(Boolean);
  const layer = selected.length === 1 ? selected[0] : null;
  if (!state.serverConnected || !layer) {
    showToast(t("serveHint"));
    return;
  }
  try {
    const current = physicalSpecForLayer(layer);
    const sizeLabel = elements.specSizeLabelInput.value.trim();
    const sizeSystem = elements.specSizeSystemInput.value.trim();
    if (Boolean(sizeLabel) !== Boolean(sizeSystem)) throw new Error(t("specSizePairRequired"));
    const yaw = optionalNumber(elements.specYawInput);
    const pitch = optionalNumber(elements.specPitchInput);
    const roll = optionalNumber(elements.specRollInput);
    const coordinateUnit = state.physicalSpecifications?.layout?.coordinate_unit
      || (projectIsRaster() ? "px" : "svg-unit");
    const objectNodeIds = state.selectedObjectIds.size
      ? [...state.selectedObjectIds]
      : Array.isArray(current?.object_node_ids)
        ? current.object_node_ids
        : [];
    const measurements = parsePhysicalMeasurements();
    const removeMeasurements = Object.keys(current?.measurements || {}).filter(
      (name) => !Object.prototype.hasOwnProperty.call(measurements, name),
    );
    const changes = {
      name_zh: elements.specNameZhInput.value.trim() || null,
      name_en: elements.specNameEnInput.value.trim() || null,
      category: elements.specCategoryInput.value.trim().toLowerCase(),
      measurement_source: elements.specSourceSelect.value,
      verification: elements.specVerificationSelect.value,
      confidence: Number(elements.specConfidenceInput.value),
      measurements,
      remove_measurements: removeMeasurements,
      declared_size: sizeLabel
        ? { label: sizeLabel, system: sizeSystem, scope: "garment" }
        : null,
      object_node_ids: objectNodeIds,
      placement: {
        coordinate_unit: coordinateUnit,
        x: Number(elements.specXInput.value),
        y: Number(elements.specYInput.value),
        rotation_deg: Number(elements.specRotationInput.value),
        scale_percent: Number(elements.specScaleInput.value),
        orientation: current?.placement?.orientation || "unspecified",
        pose: { yaw_deg: yaw, pitch_deg: pitch, roll_deg: roll },
      },
      notes: elements.specNotesInput.value.trim() || null,
    };
    const objectId = elements.specObjectIdInput.value.trim();
    await postProjectAction("/api/specs/object", {
      object_id: objectId,
      layer_id: layer.id,
      changes,
    });
    await loadServerProject(false);
    selectLayer(layer.id);
    state.selectedPhysicalObjectId = objectId;
    state.newPhysicalSpecLayerId = null;
    renderPhysicalSpecControls();
    showToast(t("specSaved"));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}

async function removePhysicalSpecification() {
  const selected = [...state.selectedIds].map(layerById).filter(Boolean);
  const layer = selected.length === 1 ? selected[0] : null;
  const specification = physicalSpecForLayer(layer);
  if (!state.serverConnected || !layer || !specification) return;
  try {
    await postProjectAction("/api/specs/remove", { object_id: specification.id });
    await loadServerProject(false);
    selectLayer(layer.id);
    state.selectedPhysicalObjectId = null;
    state.newPhysicalSpecLayerId = null;
    renderPhysicalSpecControls();
    showToast(t("specRemoved"));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}

function updateSpecificationExportControls() {
  const pngInput = elements.specExportFormatInputs.find((input) => input.value === "png");
  const pngSelected = Boolean(pngInput?.checked);
  elements.specExportDpiField.hidden = !pngSelected;
  elements.specExportDpiInput.disabled = !pngSelected;
  if (pngInput) pngInput.setAttribute("aria-expanded", String(pngSelected));
}

async function exportPhysicalSpecificationSheet() {
  if (!state.serverConnected) return;
  const formats = elements.specExportFormatInputs
    .filter((input) => input.checked)
    .map((input) => input.value);
  if (!formats.length) {
    showToast(t("specExportRequired"));
    return;
  }
  try {
    const result = await postProjectAction("/api/specs/export", {
      formats,
      dpi: Number(elements.specExportDpiInput.value || 144),
    });
    showToast(t("specExported", { formats: result.formats.join(", ").toUpperCase() }));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}

function renderHistory() {
  const history = Array.isArray(state.history) ? state.history : [];
  elements.historyCount.textContent = String(history.length);
  elements.undoButton.disabled = !state.serverConnected || history.length === 0;
  if (!history.length) {
    const empty = document.createElement("p");
    empty.textContent = t("historyEmpty");
    elements.historyList.replaceChildren(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  [...history].reverse().slice(0, 6).forEach((entry) => {
    const item = document.createElement("article");
    item.className = "history-item";
    const title = document.createElement("strong");
    title.textContent = entry.reason || entry.revision;
    const meta = document.createElement("small");
    const created = entry.created_at ? new Date(entry.created_at).toLocaleString(state.locale === "zh" ? "zh-CN" : "en-GB") : "";
    meta.textContent = `${entry.revision || "—"} · ${created}`;
    const actions = document.createElement("div");
    actions.className = "history-actions";
    const compare = document.createElement("button");
    compare.type = "button";
    compare.textContent = t("compareVersion");
    compare.disabled = !entry.preview;
    compare.addEventListener("click", () => openHistoryPreview(entry.id));
    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = t("restoreVersion");
    restore.addEventListener("click", () => restoreHistory(entry.id));
    actions.append(compare, restore);
    item.append(title, meta, actions);
    fragment.append(item);
  });
  elements.historyList.replaceChildren(fragment);
}

function openHistoryPreview(snapshotId) {
  elements.historyPreview.onerror = () => {
    elements.historyPreview.hidden = true;
    elements.compareToolbar.hidden = true;
    showToast(t("historyPreviewUnavailable"));
  };
  elements.historyPreview.src = `/api/history/${encodeURIComponent(snapshotId)}/preview`;
  elements.historyPreview.style.opacity = String(Number(elements.compareSlider.value) / 100);
  elements.historyPreview.hidden = false;
  elements.compareToolbar.hidden = false;
}

function closeHistoryPreview() {
  elements.historyPreview.hidden = true;
  elements.historyPreview.removeAttribute("src");
  elements.compareToolbar.hidden = true;
}

async function restoreHistory(snapshotId) {
  try {
    await postProjectAction("/api/undo", { snapshot_id: snapshotId });
    closeHistoryPreview();
    await loadServerProject(false);
    showToast(t("historyRestored"));
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
  }
}

async function undoLatest() {
  const latest = state.history[state.history.length - 1];
  if (latest) await restoreHistory(latest.id);
}

async function runQualityReport() {
  if (!state.serverConnected) return;
  try {
    const [qualityResponse, designResponse] = await Promise.all([
      fetch("/api/quality", { cache: "no-store" }),
      fetch("/api/design-quality", { cache: "no-store" }),
    ]);
    const [report, designReport] = await Promise.all([qualityResponse.json(), designResponse.json()]);
    if (!qualityResponse.ok) throw new Error(report.error || `HTTP ${qualityResponse.status}`);
    if (!designResponse.ok) throw new Error(designReport.error || `HTTP ${designResponse.status}`);
    renderValidation({
      ok: report.ok && designReport.ok,
      errors: [...(report.errors || []), ...(designReport.errors || [])],
      warnings: [...(report.warnings || []), ...(designReport.warnings || [])],
    }, false);
    const designScore = document.createElement("li");
    designScore.textContent = t("designReadiness", { score: designReport.plan_schema_completeness });
    const score = document.createElement("li");
    score.textContent = t("qualityScore", { score: report.engineering_score });
    elements.validationResults.prepend(score, designScore);
    showToast(`${t("qualityScore", { score: report.engineering_score })} · ${t("designReadiness", { score: designReport.plan_schema_completeness })}`);
  } catch (error) {
    showToast(t("serverActionFailed", { detail: error.message || String(error) }));
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

elements.workflowButtons.forEach((button) => {
  button.addEventListener("click", () => { void changeWorkflowMode(button.dataset.workflowMode); });
});

elements.svgFileInput.addEventListener("change", () => readSvgFile(elements.svgFileInput.files[0]));
elements.referenceFileInput.addEventListener("change", () => { void uploadReference(elements.referenceFileInput.files[0]); });
elements.depthFileInput.addEventListener("change", () => { void uploadDepthMap(elements.depthFileInput.files[0]); });
elements.initializeRecompose.addEventListener("click", () => { void initializeRecomposeScene(); });
elements.registerCleanPlate.addEventListener("click", () => { void registerCleanPlate(); });
elements.estimateDepthButton.addEventListener("click", () => { void estimateReferenceDepth(); });
elements.savePlanningRequestButton.addEventListener("click", () => { void savePlanningRequest(); });
elements.planningPromptInput.addEventListener("input", renderReferenceStudio);
elements.planningModeSelect.addEventListener("change", renderReferenceStudio);
elements.planningLayerBudget.addEventListener("input", renderReferenceStudio);
elements.planningFlattenDepth.addEventListener("input", updatePlanningDepthControls);
elements.planningExaggerateDepth.addEventListener("input", updatePlanningDepthControls);
elements.loadDemoButton.addEventListener("click", () => loadServerProject(true));
elements.validateButton.addEventListener("click", () => renderValidation(validateClient()));
elements.qualityButton.addEventListener("click", runQualityReport);
elements.undoButton.addEventListener("click", undoLatest);
elements.showAllButton.addEventListener("click", () => {
  state.layers.forEach((layer) => {
    layer.hidden = false;
    layer.node.classList.remove("lr-is-hidden");
  });
  renderLayers();
  renderSelection();
});
elements.clearSelectionButton.addEventListener("click", clearSelection);
elements.buildRequestButton.addEventListener("click", () => { void buildEditRequest(); });
elements.downloadRequestButton.addEventListener("click", downloadRequest);
elements.copyRequestButton.addEventListener("click", copyRequest);
elements.topExportButton.addEventListener("click", downloadRequest);
elements.applyLayerSettings.addEventListener("click", () => saveLayerSettings());
elements.saveSpecLayout.addEventListener("click", () => { void savePhysicalSpecificationLayout(); });
elements.specObjectSelect.addEventListener("change", choosePhysicalSpecification);
elements.newPhysicalSpec.addEventListener("click", beginPhysicalSpecification);
elements.savePhysicalSpec.addEventListener("click", () => { void savePhysicalSpecification(); });
elements.removePhysicalSpec.addEventListener("click", () => { void removePhysicalSpecification(); });
elements.specExportFormatInputs.forEach((input) => {
  input.addEventListener("change", updateSpecificationExportControls);
});
updateSpecificationExportControls();
elements.exportPhysicalSpecs.addEventListener("click", () => { void exportPhysicalSpecificationSheet(); });
elements.applyPresetButton.addEventListener("click", () => { void applySelectedPreset(); });
elements.saveDesignButton.addEventListener("click", () => { void saveExpertDesign(); });
elements.savePresetButton.addEventListener("click", () => { void saveCustomPreset(); });
elements.generateProofsButton.addEventListener("click", () => { void generateDesignProofs(); });
elements.proofLockButton.addEventListener("click", () => { void toggleProofLock(); });
elements.proofPromoteButton.addEventListener("click", () => { void promoteSelectedProof(); });
elements.proofSpreadInput.addEventListener("input", () => {
  elements.proofSpreadValue.value = `${Math.round(Number(elements.proofSpreadInput.value))}%`;
});
elements.moveLayerDown.addEventListener("click", () => saveLayerSettings("down"));
elements.moveLayerUp.addEventListener("click", () => saveLayerSettings("up"));
elements.layerOpacityInput.addEventListener("input", () => {
  const value = Number(elements.layerOpacityInput.value) / 100;
  elements.layerOpacityValue.value = `${Math.round(value * 100)}%`;
  const selected = [...state.selectedIds].map(layerById).filter(Boolean);
  if (selected.length === 1) {
    selected[0].opacity = value;
    const bitmap = selected[0].node.querySelector(":scope > image");
    if (bitmap) bitmap.setAttribute("opacity", String(value));
    else selected[0].node.setAttribute("opacity", String(value));
  }
});
elements.blendModeSelect.addEventListener("change", () => {
  const selected = [...state.selectedIds].map(layerById).filter(Boolean);
  if (selected.length === 1) {
    selected[0].blendMode = elements.blendModeSelect.value;
    selected[0].node.style.mixBlendMode = elements.blendModeSelect.value;
  }
});
elements.brushSizeInput.addEventListener("input", () => {
  elements.brushSizeValue.value = elements.brushSizeInput.value;
});
elements.guidedControlInputs.forEach((input) => {
  input.addEventListener("input", () => {
    updateSliderOutput(input);
    elements.applyPresetButton.disabled = !state.serverConnected || !state.selectedPresetId;
    invalidateRequest();
  });
});
elements.expertDesignInputs.forEach((input) => {
  input.addEventListener("input", () => {
    updateSliderOutput(input);
    elements.saveDesignButton.disabled = !state.serverConnected;
    invalidateRequest();
  });
});
elements.clearMaskButton.addEventListener("click", clearMask);
elements.compareSlider.addEventListener("input", () => {
  elements.historyPreview.style.opacity = String(Number(elements.compareSlider.value) / 100);
});
elements.closeCompareButton.addEventListener("click", closeHistoryPreview);
elements.instructionInput.addEventListener("input", () => {
  invalidateRequest();
  updateActionAvailability();
});
elements.preserveCheckbox.addEventListener("change", invalidateRequest);
elements.linkedLayersCheckbox.addEventListener("change", () => {
  invalidateRequest();
  renderSelection();
});

elements.canvasStage.addEventListener("click", (event) => {
  if (state.ignoreClick || state.mode !== "layer" || !state.svg) return;
  const layerNode = projectIsRaster()
    ? rasterLayerAtPoint(event.clientX, event.clientY)
    : findOwningLayer(event.target);
  if (!layerNode) return;
  const objectId = projectIsRaster() ? null : event.target.id || null;
  selectLayer(layerNode.id, event.ctrlKey || event.metaKey || event.shiftKey, objectId);
});

elements.canvasStage.addEventListener("pointerdown", (event) => {
  if (beginMask(event)) return;
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
  if (continueMask(event)) return;
  if (!state.drag || state.drag.pointerId !== event.pointerId) return;
  const point = relativePointer(event);
  drawDragBox(state.drag.start, point);
});

elements.canvasStage.addEventListener("pointerup", (event) => {
  if (finishMask(event)) return;
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
    void buildEditRequest();
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
