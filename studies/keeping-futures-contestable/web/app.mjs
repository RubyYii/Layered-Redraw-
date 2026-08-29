import {
  PACKAGE_SCHEMA_VERSION,
  assignExpert,
  assignStudyA,
  assignStudyB,
  ethicsGateAllows,
  humanResearchConfigErrors,
  normaliseParticipantId,
  offTargetChangeCount,
  validateReturn
} from "../src/experiment-core.mjs";
import {
  BRIEFS,
  BRIEF_BY_ID,
  baseStateFor,
  diffStates,
  inferTargets,
  makeCandidate
} from "../src/stimuli.mjs";
import {
  artefactMarkup,
  checkedValue,
  escapeHtml,
  progressMarkup,
  radioStackMarkup,
  scaleMarkup,
  setError,
  valueOf
} from "./ui.mjs";

const root = document.querySelector("#app");
const modeBadge = document.querySelector("#modeBadge");
const ethicsBadge = document.querySelector("#ethicsBadge");
const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") || "landing";
const allowedModes = new Set(["landing", "study-a", "study-b", "expert", "coordinator"]);
const modeLabels = {
  landing: "入口",
  "study-a": "STUDY A · 制作",
  "study-b": "STUDY B · 评价",
  expert: "专家审计",
  coordinator: "协调者"
};

if (!allowedModes.has(mode)) window.location.replace("./index.html");

let config;
let configSha256 = null;
let launchGate = { ready: true, allowedModes: ["study-a", "study-b", "expert"], errors: [], stage: "demo", packageFreezeBundleSha256: null };
let session = null;
let manifestCache = null;

try {
  const response = await fetch("../config/study-config.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const configText = await response.text();
  config = JSON.parse(configText);
  configSha256 = await sha256Hex(configText);
  if (config.data_mode === "human_research") launchGate = await verifyLaunchRecord(config, configSha256);
} catch (error) {
  root.innerHTML = `<section class="card onboarding"><p class="notice danger">无法载入研究配置：${escapeHtml(error.message)}。请通过本地启动器运行，不要直接双击 HTML。</p></section>`;
  throw error;
}

modeBadge.textContent = modeLabels[mode];
ethicsBadge.textContent = config.ethics_status;
ethicsBadge.className = ["APPROVED", "EXEMPTION_CONFIRMED"].includes(config.ethics_status) ? "badge badge-good" : "badge badge-warn";

document.querySelector("#clearLocal").addEventListener("click", () => {
  if (!window.confirm("清除此浏览器中 Keeping Futures Contestable 的全部未导出进度？")) return;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("kfc:")) localStorage.removeItem(key);
  }
  window.location.reload();
});

if (mode === "landing") renderLanding();
else if (mode === "coordinator") await renderCoordinator();
else renderOnboarding(mode);

window.__KFC_STUDY__ = {
  mode,
  config: structuredClone(config),
  launchGate: structuredClone(launchGate),
  snapshot: () => structuredClone(session),
  nonLocalRequestsAllowed: false
};

function renderLanding() {
  root.innerHTML = `
    <section class="hero">
      <div class="card hero-copy">
        <p class="eyebrow">Local-first HCI experiment</p>
        <h1>让未来保持可质疑。</h1>
        <p class="lede">这套实验不把“质量”压成一个分数。它分别观察：制作时哪些假设能够被修改，评价时哪些解释能够继续存在，以及技术通过与策展保留为什么会分离。</p>
        ${config.data_mode === "demo_only" ? `<p class="notice"><strong>开发锁已开启。</strong> 当前只允许 <code>DEMO-*</code> 编号；没有真实参与者数据会在本配置下被收集。</p>` : ""}
      </div>
      <aside class="card hero-aside">
        <span class="badge">${escapeHtml(config.package_version)}</span>
        <strong>One spine.<br>Three warrants.<br>No fake score.</strong>
        <p>所有数据留在本机浏览器，直至参与者主动导出 JSON。固定候选不会调用外部模型。</p>
      </aside>
    </section>
    <nav class="mode-grid" aria-label="实验模式">
      <a class="mode-card" href="?mode=study-a"><span class="number">01 · MAKING</span><h2>制作端</h2><p>比较整体候选与语义局部、可逆修改。记录假设识别、实际修订和无关变化。</p></a>
      <a class="mode-card" href="?mode=study-b"><span class="number">02 · EVALUATION</span><h2>受众评价</h2><p>比较封闭与开放评价协议，然后进入完全相同的中性探查。</p></a>
      <a class="mode-card" href="?mode=expert"><span class="number">03 · CURATION</span><h2>专家审计</h2><p>在不知道制作条件和技术状态的情况下，独立记录 KEEP、REVISE 或 REJECT。</p></a>
    </nav>`;
}

async function renderCoordinator() {
  const activationErrors = config.data_mode === "demo_only"
    ? ["data_mode is demo_only"]
    : humanResearchConfigErrors(config);
  let manifestSummary = "尚未载入";
  try {
    const manifest = await loadManifest(config.study_b_manifest);
    const cells = new Map();
    for (const artefact of manifest.artefacts) {
      const key = `${artefact.briefId}/${artefact.sourceWorkflow}/${artefact.technicalStatus}`;
      cells.set(key, (cells.get(key) || 0) + 1);
    }
    manifestSummary = [...cells.entries()].map(([key, count]) => `<li><code>${escapeHtml(key)}</code>：${count}</li>`).join("");
  } catch (error) {
    manifestSummary = `<li class="error-list">${escapeHtml(error.message)}</li>`;
  }
  root.innerHTML = `
    <section class="card onboarding">
      <p class="eyebrow">Coordinator view</p>
      <h1 style="font-size:clamp(2.2rem,6vw,4.6rem)">实验状态，不是结果。</h1>
      <div class="summary-grid">
        <div class="summary-card"><strong>${escapeHtml(config.data_mode)}</strong><span>数据模式</span></div>
        <div class="summary-card"><strong>${escapeHtml(config.collection_phase || "UNSET")}</strong><span>收集阶段</span></div>
        <div class="summary-card"><strong>${escapeHtml(config.ethics_status)}</strong><span>伦理状态</span></div>
        <div class="summary-card"><strong>${config.recruitment_open ? "OPEN" : "CLOSED"}</strong><span>招募开关</span></div>
        <div class="summary-card"><strong>${launchGate.ready ? "VERIFIED" : "BLOCKED"}</strong><span>运行时冻结门</span></div>
      </div>
      <h2>当前 Study B manifest</h2>
      <ul>${manifestSummary}</ul>
      <p class="notice">只有伦理/豁免记录、协议与参与者文件版本、招募、退出、投诉、存储及安全处置字段全部完成后，应用才接受对应阶段的真实研究编号。预测试仅接受 <code>PILOT-*</code>；主研究拒绝 <code>DEMO-*</code> 与 <code>PILOT-*</code>。软件检查不等于伦理批准。</p>
      ${activationErrors.length ? `<div class="notice danger"><strong>真实研究门仍关闭：</strong><ul>${activationErrors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>` : `<p class="notice good">真实研究配置字段完整；仍须核对批准文件与冻结哈希。</p>`}
      ${launchGate.errors.length ? `<div class="notice danger"><strong>运行时冻结门未通过：</strong><ul>${launchGate.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>` : ""}
      <div class="button-row"><a class="button secondary" href="./index.html">返回入口</a></div>
    </section>`;
}

function renderOnboarding(targetMode) {
  const title = targetMode === "study-a" ? "制作端实验" : targetMode === "study-b" ? "受众评价实验" : "专家策展审计";
  const roleText = targetMode === "expert"
    ? "请输入协调者分配的专家编号。不要输入姓名或邮箱。"
    : "请输入协调者分配的参与者编号。不要输入姓名或邮箱。";
  const demoPlaceholder = targetMode === "expert" ? "DEMO-E01" : targetMode === "study-a" ? "DEMO-A01" : "DEMO-B01";
  const pilotPlaceholder = targetMode === "expert" ? "PILOT-E-001" : targetMode === "study-a" ? "PILOT-A-001" : "PILOT-B-001";
  const mainPlaceholder = targetMode === "expert" ? "E-001" : targetMode === "study-a" ? "A-001" : "B-001";
  const placeholder = config.data_mode === "demo_only" ? demoPlaceholder : config.collection_phase === "cognitive_pilot" ? pilotPlaceholder : mainPlaceholder;
  root.innerHTML = `
    <section class="card onboarding">
      <p class="eyebrow">${escapeHtml(modeLabels[targetMode])}</p>
      <h1 style="font-size:clamp(2.2rem,6vw,4.7rem)">${escapeHtml(title)}</h1>
      <p class="lede">${escapeHtml(roleText)}</p>
      ${config.data_mode === "demo_only" ? `<p class="notice"><strong>仅限开发试跑。</strong> 当前配置拒绝真实研究编号，只接受 <code>DEMO-*</code>。</p>` : `<p class="notice good">${config.collection_phase === "cognitive_pilot" ? "认知预测试" : "主研究"} · 协议 ${escapeHtml(config.approved_protocol_id)} · ${escapeHtml(config.institution)}</p>`}
      ${config.data_mode === "human_research" && !launchGate.ready ? `<div class="notice danger"><strong>本阶段尚未通过运行时冻结校验，不能开始。</strong><ul>${launchGate.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>` : ""}
      <div class="field">
        <label for="participantId">分配编号</label>
        <input id="participantId" type="text" maxlength="40" autocomplete="off" placeholder="${placeholder}">
      </div>
      <div class="field">
        <label class="check-row"><input id="consent" type="checkbox"><span>${config.data_mode === "demo_only" ? "我知道这是合成/开发试跑，输入不会作为人类研究证据。" : "我已阅读获批的信息说明，同意自愿参加，并知道可以随时停止。"}</span></label>
      </div>
      <div data-errors></div>
      <div class="button-row">
        <button id="startSession" class="button" type="button">开始或恢复</button>
        <a class="button secondary" href="./index.html">返回入口</a>
      </div>
    </section>`;
  root.querySelector("#participantId").focus();
  root.querySelector("#startSession").addEventListener("click", async () => {
    const participantId = normaliseParticipantId(valueOf(root, "#participantId"));
    const errors = [];
    if (!participantId) errors.push("请输入分配编号。");
    if (!root.querySelector("#consent").checked) errors.push("请确认当前信息说明。 ");
    if (!ethicsGateAllows(config, participantId)) {
      errors.push(config.data_mode === "demo_only" ? "开发模式只接受以 DEMO- 开头的编号。" : "伦理、招募或收集阶段门槛未满足，或编号前缀不属于当前阶段。 ");
    }
    if (!launchGate.ready || !launchGate.allowedModes.includes(targetMode)) errors.push("当前模式不在已验证的阶段冻结记录内。 ");
    setError(root, errors);
    if (errors.length) return;
    try {
      await startOrResume(targetMode, participantId);
    } catch (error) {
      setError(root, [error.message]);
    }
  });
}

async function startOrResume(targetMode, participantId) {
  const key = storageKey(targetMode, participantId);
  const existing = localStorage.getItem(key);
  if (existing) {
    session = JSON.parse(existing);
  } else if (targetMode === "study-a") {
    session = createStudyASession(participantId);
  } else {
    const manifest = await loadManifest(targetMode === "expert" ? config.expert_manifest : config.study_b_manifest);
    session = targetMode === "study-b"
      ? createStudyBSession(participantId, manifest)
      : createExpertSession(participantId, manifest);
  }
  saveSession();
  renderSession();
}

function createBaseSession(participantId, study) {
  const startedAt = new Date().toISOString();
  return {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    packageVersion: config.package_version,
    study,
    participantId,
    synthetic: config.data_mode === "demo_only",
    consentConfirmed: true,
    consentRecordedAt: startedAt,
    consentBasis: config.data_mode === "demo_only" ? "DEMO_ACKNOWLEDGEMENT" : "APPROVED_INFORMATION_SHEET",
    ethicsStatusAtStart: config.ethics_status,
    approvedProtocolId: config.approved_protocol_id,
    collectionPhaseAtStart: config.collection_phase,
    launchRecordStage: launchGate.stage,
    packageFreezeBundleSha256: launchGate.packageFreezeBundleSha256,
    startedAt,
    exportedAt: null,
    completedAt: null,
    currentTrialIndex: 0,
    trials: [],
    eventLog: []
  };
}

function createStudyASession(participantId) {
  const assignment = assignStudyA(participantId);
  const record = createBaseSession(participantId, "study-a");
  record.assignment = assignment;
  record.retrospective = null;
  record.trials = assignment.tasks.map((task) => ({
    ...task,
    phase: "observe",
    startedAt: null,
    completedAt: null,
    pre: null,
    prompt: "",
    activeTargetIds: [],
    candidates: [],
    pendingCandidate: null,
    baseState: baseStateFor(task.briefId),
    currentState: baseStateFor(task.briefId),
    finalState: null,
    history: [baseStateFor(task.briefId)],
    post: null,
    offTargetChangeCount: null,
    eventLog: []
  }));
  logEvent(record, "session_started", { sequenceId: assignment.sequenceId });
  return record;
}

function createStudyBSession(participantId, manifest) {
  const assignment = assignStudyB(participantId, manifest.artefacts);
  const record = createBaseSession(participantId, "study-b");
  record.protocol = assignment.protocol;
  record.assignmentBlockId = assignment.assignmentBlockId;
  record.workflowPattern = assignment.workflowPattern;
  record.manifestId = manifest.manifestId;
  record.manifestSha256 = manifest.sha256 || "UNAVAILABLE_IN_DEMO";
  record.selectionSeed = assignment.selectionSeed;
  record.trials = assignment.artefacts.map((artefact, index) => ({
    trialIndex: index,
    artefactId: artefact.artefactId,
    blindLabel: `ITEM-${String(index + 1).padStart(2, "0")}`,
    briefId: artefact.briefId,
    state: artefact.state,
    phase: "protocol",
    startedAt: null,
    completedAt: null,
    protocolResponse: null,
    commonProbe: null,
    eventLog: []
  }));
  logEvent(record, "session_started", { protocol: assignment.protocol, manifestId: manifest.manifestId });
  return record;
}

function createExpertSession(participantId, manifest) {
  const assignment = assignExpert(participantId, manifest.artefacts);
  if (!assignment.artefacts.length) throw new Error("当前 manifest 没有通过技术审计、可进入专家评价的 artefact。");
  const record = createBaseSession(participantId, "expert");
  record.manifestId = manifest.manifestId;
  record.manifestSha256 = manifest.sha256 || "UNAVAILABLE_IN_DEMO";
  record.selectionSeed = assignment.selectionSeed;
  record.assignmentPerCell = assignment.perCell;
  record.trials = assignment.artefacts.map((artefact, index) => ({
    trialIndex: index,
    artefactId: artefact.artefactId,
    blindLabel: `CUR-${String(index + 1).padStart(2, "0")}`,
    briefId: artefact.briefId,
    state: artefact.state,
    startedAt: null,
    completedAt: null,
    keepDecision: null,
    purposeFit: null,
    interpretiveOpenness: null,
    rationale: "",
    requiredRevision: "",
    eventLog: []
  }));
  logEvent(record, "session_started", { manifestId: manifest.manifestId });
  return record;
}

function renderSession() {
  if (session.completedAt) return renderCompletion();
  if (session.study === "study-a") return renderStudyA();
  if (session.study === "study-b") return renderStudyB();
  return renderExpert();
}

function renderStudyA() {
  if (session.currentTrialIndex >= session.trials.length) return renderStudyARetrospective();
  const trial = session.trials[session.currentTrialIndex];
  if (!trial.startedAt) {
    trial.startedAt = new Date().toISOString();
    logTrialEvent(trial, "trial_started", { briefId: trial.briefId });
    saveSession();
  }
  if (trial.phase === "observe") return renderStudyAObserve(trial);
  if (trial.phase === "edit") return renderStudyAEdit(trial);
  return renderStudyAReflect(trial);
}

function studyAShell(trial, taskHtml, displayState = trial.currentState, options = {}) {
  const brief = BRIEF_BY_ID.get(trial.briefId);
  const phaseNumber = { observe: 0, edit: 1, reflect: 2 }[trial.phase] || 0;
  const progress = session.currentTrialIndex * 3 + phaseNumber + 1;
  root.innerHTML = `
    <section class="study-shell">
      <div class="study-topbar">
        ${progressMarkup(progress, session.trials.length * 3 + 1, `任务 ${session.currentTrialIndex + 1} · ${brief.artefactType}`)}
        <span class="badge">工作区 ${trial.condition === "layered" ? "BETA" : "ALPHA"}</span>
      </div>
      <div class="workspace">
        <div class="artefact-side">
          <div class="brief-strip"><span>${escapeHtml(brief.shortTitle)}</span><span>${escapeHtml(brief.organisation)}</span></div>
          ${artefactMarkup(displayState, { showLayers: options.showLayers, selectedTargets: options.selectedTargets || [] })}
        </div>
        <div class="task-side">${taskHtml}</div>
      </div>
    </section>`;
}

function renderStudyAObserve(trial) {
  const brief = BRIEF_BY_ID.get(trial.briefId);
  studyAShell(trial, `
    <p class="phase-tag">阶段 1 · 独立观察</p>
    <h2>先看，不修改。</h2>
    <p class="hint">请根据 artefact 本身回答。此时还不会显示编辑结构或利益相关者挑战。</p>
    <div class="field"><label for="purpose">你认为这个系统想做什么？</label><textarea id="purpose">${escapeHtml(trial.pre?.purpose || "")}</textarea></div>
    <div class="field"><label for="assumptions">它对谁决定、谁受益、什么数据有效、谁能申诉作了哪些假设？</label><textarea id="assumptions">${escapeHtml(trial.pre?.assumptions || "")}</textarea></div>
    <div data-errors></div>
    <div class="button-row"><button id="revealChallenge" class="button" type="button">锁定回答并进入修改</button></div>`);
  root.querySelector("#revealChallenge").addEventListener("click", () => {
    const purpose = valueOf(root, "#purpose");
    const assumptions = valueOf(root, "#assumptions");
    const errors = [];
    if (purpose.length < 8) errors.push("请先简要说明系统目的。");
    if (assumptions.length < 12) errors.push("请至少记录一个具体假设。");
    setError(root, errors);
    if (errors.length) return;
    trial.pre = { purpose, assumptions, lockedAt: new Date().toISOString() };
    trial.phase = "edit";
    logTrialEvent(trial, "pre_response_locked", { characterCount: assumptions.length });
    saveSession();
    renderStudyA();
  });
}

function renderStudyAEdit(trial) {
  const brief = BRIEF_BY_ID.get(trial.briefId);
  const pending = trial.pendingCandidate;
  const displayState = pending?.state || trial.currentState;
  const selectedTargets = pending?.targetIds || trial.activeTargetIds || [];
  const diffChips = pending ? [
    ...pending.diff.semantic.map((id) => `<span class="diff-chip ${pending.targetIds.includes(id) ? "" : "off-target"}">${escapeHtml(brief.fields.find((field) => field.id === id)?.label || id)}</span>`),
    ...pending.diff.visual.map((id) => `<span class="diff-chip off-target">视觉：${escapeHtml(id)}</span>`)
  ].join("") : "";
  const layerControls = trial.condition === "layered" ? `
    <div class="field">
      <label>选择允许修改的语义区域</label>
      <div class="layer-list">${brief.fields.map((field) => `<label class="layer-option">
        <input type="checkbox" name="targetLayer" value="${escapeHtml(field.id)}" ${selectedTargets.includes(field.id) ? "checked" : ""}>
        <span><strong>${escapeHtml(field.label)}</strong><small>当前：${escapeHtml(trial.currentState.values[field.id])}</small></span>
      </label>`).join("")}</div>
    </div>` : `
    <p class="notice">此工作区将整张 artefact 作为一个输出。系统会从指令推断目标，但候选可能同时改变其他内容或视觉布局。</p>`;
  const candidateControls = pending ? `
    <div class="candidate-box">
      <h3>候选 ${trial.candidates.length} · 尚未采用</h3>
      <p>系统理解的修改目标：${pending.targetIds.map((id) => escapeHtml(brief.fields.find((field) => field.id === id)?.label || id)).join("、")}</p>
      <div class="diff-list">${diffChips || '<span class="diff-chip">没有检测到变化</span>'}</div>
      <div class="button-row"><button id="applyCandidate" class="button" type="button">采用候选</button><button id="rejectCandidate" class="button secondary" type="button">拒绝候选</button></div>
    </div>` : "";
  studyAShell(trial, `
    <p class="phase-tag">阶段 2 · 修改</p>
    <h2>回应利益相关者挑战。</h2>
    <div class="challenge"><strong>收到的挑战</strong>${escapeHtml(brief.challenge)}</div>
    ${layerControls}
    <div class="field"><label for="editPrompt">写给编辑系统的指令</label><textarea id="editPrompt" class="compact-textarea" placeholder="说明你要改变哪项关系，以及为什么。">${escapeHtml(trial.prompt || "")}</textarea><small>固定候选，不会把这段文字发送给外部模型。最多生成 3 次。</small></div>
    <div data-errors></div>
    <div class="button-row">
      <button id="generateCandidate" class="button" type="button" ${pending || trial.candidates.length >= 3 ? "disabled" : ""}>生成标准化候选（${trial.candidates.length}/3）</button>
      <button id="undoRevision" class="button ghost" type="button" ${trial.history.length <= 1 || pending ? "disabled" : ""}>撤销上次采用</button>
      <button id="finishEditing" class="button secondary" type="button" ${pending || !trial.candidates.length ? "disabled" : ""}>结束修改</button>
    </div>
    ${candidateControls}`,
    displayState,
    { showLayers: trial.condition === "layered", selectedTargets });

  root.querySelector("#generateCandidate")?.addEventListener("click", () => {
    const prompt = valueOf(root, "#editPrompt");
    const explicitTargets = [...root.querySelectorAll('input[name="targetLayer"]:checked')].map((input) => input.value);
    const targets = trial.condition === "layered" ? explicitTargets : inferTargets(trial.briefId, prompt);
    const errors = [];
    if (prompt.length < 12) errors.push("请写出具体修改指令和理由。");
    if (trial.condition === "layered" && !targets.length) errors.push("请至少选择一个允许修改的语义区域。");
    if (trial.candidates.length >= 3) errors.push("本任务最多生成三个标准化候选。");
    setError(root, errors);
    if (errors.length) return;
    trial.prompt = prompt;
    trial.activeTargetIds = targets;
    const state = makeCandidate({
      briefId: trial.briefId,
      currentState: trial.currentState,
      condition: trial.condition,
      targetIds: targets,
      attempt: trial.candidates.length
    });
    const candidate = {
      candidateId: `${trial.briefId}-${trial.condition}-${trial.candidates.length + 1}`,
      generatedAt: new Date().toISOString(),
      targetIds: targets,
      prompt,
      state,
      diff: diffStates(trial.currentState, state),
      offTargetChangeCount: offTargetChangeCount(trial.currentState, state, targets),
      decision: "PENDING"
    };
    trial.candidates.push(candidate);
    trial.pendingCandidate = candidate;
    logTrialEvent(trial, "candidate_generated", { candidateId: candidate.candidateId, targetIds: targets, diff: candidate.diff });
    saveSession();
    renderStudyA();
  });

  root.querySelector("#applyCandidate")?.addEventListener("click", () => {
    const candidate = trial.pendingCandidate;
    candidate.decision = "APPLIED";
    candidate.decidedAt = new Date().toISOString();
    trial.currentState = structuredClone(candidate.state);
    trial.history.push(structuredClone(candidate.state));
    trial.pendingCandidate = null;
    logTrialEvent(trial, "candidate_applied", { candidateId: candidate.candidateId });
    saveSession();
    renderStudyA();
  });

  root.querySelector("#rejectCandidate")?.addEventListener("click", () => {
    const candidate = trial.pendingCandidate;
    candidate.decision = "REJECTED";
    candidate.decidedAt = new Date().toISOString();
    trial.pendingCandidate = null;
    logTrialEvent(trial, "candidate_rejected", { candidateId: candidate.candidateId });
    saveSession();
    renderStudyA();
  });

  root.querySelector("#undoRevision")?.addEventListener("click", () => {
    if (trial.history.length <= 1) return;
    trial.history.pop();
    trial.currentState = structuredClone(trial.history.at(-1));
    logTrialEvent(trial, "revision_undone", { historyDepth: trial.history.length });
    saveSession();
    renderStudyA();
  });

  root.querySelector("#finishEditing")?.addEventListener("click", () => {
    trial.prompt = valueOf(root, "#editPrompt") || trial.prompt;
    trial.finalState = structuredClone(trial.currentState);
    trial.offTargetChangeCount = trial.candidates.reduce(
      (total, candidate) => total + Number(candidate.offTargetChangeCount || 0),
      0
    );
    trial.phase = "reflect";
    logTrialEvent(trial, "editing_finished", { offTargetChangeCount: trial.offTargetChangeCount });
    saveSession();
    renderStudyA();
  });
}

function renderStudyAReflect(trial) {
  const diff = diffStates(trial.baseState, trial.finalState);
  studyAShell(trial, `
    <p class="phase-tag">阶段 3 · 反思</p>
    <h2>记录改变与剩余问题。</h2>
    <p class="hint">系统检测到 ${diff.semantic.length} 个语义字段变化、${diff.visual.length} 个视觉字段变化；这不是对修改价值的判断。</p>
    <div class="field"><label for="changedAssumption">你最终改变了什么假设或关系？</label><textarea id="changedAssumption"></textarea></div>
    <div class="field"><label for="newAssumptions">编辑结构出现后，你又注意到哪些最初没有写出的假设？</label><textarea id="newAssumptions"></textarea></div>
    <div class="field"><label for="unresolved">什么问题应该继续保持未决？</label><textarea id="unresolved"></textarea></div>
    <div class="field"><label for="unintended">候选造成了哪些非预期变化？没有则写“无”。</label><textarea id="unintended" class="compact-textarea"></textarea></div>
    <div class="field"><label>你对修改结果的控制感</label>${scaleMarkup("control", "很弱", "很强")}</div>
    <div data-errors></div>
    <div class="button-row"><button id="completeATrial" class="button" type="button">完成本任务</button></div>`, trial.finalState, { showLayers: trial.condition === "layered", selectedTargets: trial.activeTargetIds });
  root.querySelector("#completeATrial").addEventListener("click", () => {
    const post = {
      changedAssumption: valueOf(root, "#changedAssumption"),
      newAssumptions: valueOf(root, "#newAssumptions"),
      unresolved: valueOf(root, "#unresolved"),
      unintended: valueOf(root, "#unintended"),
      perceivedControl: checkedValue(root, "control")
    };
    const errors = [];
    if (post.changedAssumption.length < 10) errors.push("请具体说明最终改变了什么。");
    if (post.newAssumptions.length < 2) errors.push("请记录新注意到的假设；若没有请写“无”。");
    if (post.unresolved.length < 8) errors.push("请说明一个仍未解决的问题。");
    if (!post.unintended) errors.push("请记录非预期变化；没有则写“无”。");
    if (!post.perceivedControl) errors.push("请选择控制感评分。");
    setError(root, errors);
    if (errors.length) return;
    trial.post = post;
    trial.completedAt = new Date().toISOString();
    logTrialEvent(trial, "trial_completed", { semanticChanges: diffStates(trial.baseState, trial.finalState).semantic });
    session.currentTrialIndex += 1;
    saveSession();
    renderStudyA();
  });
}

function renderStudyARetrospective() {
  root.innerHTML = `
    <section class="card onboarding">
      <p class="eyebrow">Study A · 最后一步</p>
      <h1 style="font-size:clamp(2.2rem,6vw,4.5rem)">比较两次工作方式。</h1>
      <div class="field"><label for="workspaceDifference">两个工作区如何影响你发现和修改假设？</label><textarea id="workspaceDifference"></textarea></div>
      <div class="field"><label for="tradeoff">哪一种让你更容易控制修改？它又牺牲了什么？</label><textarea id="tradeoff"></textarea></div>
      <div class="field"><label>你更愿意继续使用哪个工作区？</label>${radioStackMarkup("preference", [
        { value: "ALPHA", label: "工作区 ALPHA" },
        { value: "BETA", label: "工作区 BETA" },
        { value: "NO_PREFERENCE", label: "没有偏好" }
      ])}</div>
      <div class="field"><label for="demandGuess">你认为研究者可能在比较什么？</label><textarea id="demandGuess" class="compact-textarea"></textarea></div>
      <div data-errors></div>
      <div class="button-row"><button id="completeA" class="button" type="button">完成 Study A</button></div>
    </section>`;
  root.querySelector("#completeA").addEventListener("click", () => {
    const retrospective = {
      workspaceDifference: valueOf(root, "#workspaceDifference"),
      tradeoff: valueOf(root, "#tradeoff"),
      preference: checkedValue(root, "preference"),
      demandGuess: valueOf(root, "#demandGuess")
    };
    const errors = [];
    if (retrospective.workspaceDifference.length < 15) errors.push("请比较两个工作区。");
    if (retrospective.tradeoff.length < 12) errors.push("请说明控制与代价。");
    if (!retrospective.preference) errors.push("请选择一个偏好选项。");
    if (!retrospective.demandGuess) errors.push("请填写你对研究目的的猜测；不知道可写“不知道”。");
    setError(root, errors);
    if (errors.length) return;
    session.retrospective = retrospective;
    session.completedAt = new Date().toISOString();
    logEvent(session, "session_completed", {});
    saveSession();
    renderCompletion();
  });
}

function renderStudyB() {
  const trial = session.trials[session.currentTrialIndex];
  if (!trial) {
    session.completedAt = new Date().toISOString();
    logEvent(session, "session_completed", {});
    saveSession();
    return renderCompletion();
  }
  if (!trial.startedAt) {
    trial.startedAt = new Date().toISOString();
    logTrialEvent(trial, "trial_started", { artefactId: trial.artefactId });
    saveSession();
  }
  if (trial.phase === "protocol") return renderStudyBProtocol(trial);
  return renderStudyBCommon(trial);
}

function studyBShell(trial, taskHtml) {
  const brief = BRIEF_BY_ID.get(trial.briefId);
  root.innerHTML = `
    <section class="study-shell">
      <div class="study-topbar">${progressMarkup(session.currentTrialIndex + 1, session.trials.length, "评价项目")}<span class="badge">${escapeHtml(trial.blindLabel)}</span></div>
      <div class="workspace">
        <div class="artefact-side">${artefactMarkup(trial.state, { blindLabel: trial.blindLabel })}</div>
        <div class="task-side">
          <div class="brief-strip"><span>${escapeHtml(brief.artefactType)}</span><span>面向：${escapeHtml(brief.audience)}</span></div>
          <p class="hint"><strong>用途：</strong>${escapeHtml(brief.purpose)}</p>
          ${taskHtml}
        </div>
      </div>
    </section>`;
}

function renderStudyBProtocol(trial) {
  const closed = session.protocol === "closed";
  const form = closed ? `
    <p class="phase-tag">评价阶段</p><h2>检查质量与缺陷。</h2>
    <div class="field"><label>是否满足给定用途？</label>${radioStackMarkup("meetsPurpose", [{value:"YES",label:"是"},{value:"PARTLY",label:"部分"},{value:"NO",label:"否"}])}</div>
    <div class="field"><label>界面是否清晰完整？</label>${scaleMarkup("clarity", "不清晰", "很清晰")}</div>
    <div class="field"><label for="defects">列出需要修复的错误、缺失或不一致。</label><textarea id="defects"></textarea></div>
    <div class="field"><label for="requirements">哪一项给定用途或要求尚未满足？若均满足，请具体说明依据。</label><textarea id="requirements"></textarea></div>
    <div class="field"><label for="fix">达到要求所需的最小修正是什么？若无需修正，请说明为什么。</label><textarea id="fix"></textarea></div>
    <div class="field"><label>总体判断</label>${radioStackMarkup("passFail", [{value:"PASS",label:"PASS · 可接受"},{value:"FAIL",label:"FAIL · 不可接受"}])}</div>
    <div class="field"><label for="protocolRationale">简要说明判断依据。</label><textarea id="protocolRationale" class="compact-textarea"></textarea></div>` : `
    <p class="phase-tag">评价阶段</p><h2>保留可能的不同读法。</h2>
    <div class="field"><label for="readings">写出至少两种有 artefact 依据的合理读法。</label><textarea id="readings"></textarea></div>
    <div class="field"><label for="tension">哪个张力不应被立即解决？为什么？</label><textarea id="tension"></textarea></div>
    <div class="field"><label for="stakeholders">谁可以质疑这个安排？谁可能无法发声？</label><textarea id="stakeholders"></textarea></div>
    <div class="field"><label for="arrangements">还可能形成哪些不同安排？</label><textarea id="arrangements"></textarea></div>`;
  studyBShell(trial, `${form}<div data-errors></div><div class="button-row"><button id="lockProtocol" class="button" type="button">锁定本阶段回答</button></div>`);
  root.querySelector("#lockProtocol").addEventListener("click", () => {
    const response = closed ? {
      meetsPurpose: checkedValue(root, "meetsPurpose"),
      clarity: checkedValue(root, "clarity"),
      defects: valueOf(root, "#defects"),
      requirements: valueOf(root, "#requirements"),
      fix: valueOf(root, "#fix"),
      passFail: checkedValue(root, "passFail"),
      rationale: valueOf(root, "#protocolRationale")
    } : {
      readings: valueOf(root, "#readings"),
      tension: valueOf(root, "#tension"),
      stakeholders: valueOf(root, "#stakeholders"),
      arrangements: valueOf(root, "#arrangements")
    };
    const errors = [];
    if (closed) {
      if (!response.meetsPurpose || !response.clarity || !response.passFail) errors.push("请完成所有选择题。");
      for (const key of ["defects", "requirements", "fix", "rationale"]) {
        if (response[key].length < 12) errors.push(`${key} 回答过短，请给出 artefact 依据；若没有问题请明确说明。`);
      }
    } else {
      for (const [key, value] of Object.entries(response)) if (value.length < 12) errors.push(`${key} 回答过短，请给出 artefact 依据。`);
    }
    setError(root, errors);
    if (errors.length) return;
    trial.protocolResponse = response;
    trial.protocolLockedAt = new Date().toISOString();
    trial.commonProbeStartedAt = trial.protocolLockedAt;
    trial.phase = "common";
    logTrialEvent(trial, "protocol_response_locked", { protocol: session.protocol });
    saveSession();
    renderStudyB();
  });
}

function renderStudyBCommon(trial) {
  const brief = BRIEF_BY_ID.get(trial.briefId);
  studyBShell(trial, `
    <p class="phase-tag">共同探查 · 所有人相同</p>
    <h2>重新描述你看到的未来。</h2>
    <p class="notice">以下是本项目的最终探查。请只依据当前 artefact 作答，不必追求唯一答案。</p>
    <div class="field"><label for="description">这里正在发生什么？</label><textarea id="description"></textarea></div>
    <div class="field"><label for="assumptions">它把哪些关于人、数据、权力或责任的关系当成理所当然？</label><textarea id="assumptions"></textarea></div>
    <div class="field"><label for="alternative">还可能有什么不同安排？</label><textarea id="alternative"></textarea></div>
    <div class="field"><label for="evidence">指出 artefact 中支持你判断的具体文字、控件、数字或缺失。</label><textarea id="evidence"></textarea></div>
    <div class="field"><label>${escapeHtml(brief.comprehension.question)}</label>${radioStackMarkup("comprehension", brief.comprehension.options)}</div>
    <div class="field"><label>这个 artefact 给人的感觉</label>${scaleMarkup("closure", "仍可争议", "已有唯一答案")}</div>
    <div data-errors></div>
    <div class="button-row"><button id="completeBTrial" class="button" type="button">保存并进入下一项</button></div>`);
  root.querySelector("#completeBTrial").addEventListener("click", () => {
    const response = {
      description: valueOf(root, "#description"),
      assumptions: valueOf(root, "#assumptions"),
      alternative: valueOf(root, "#alternative"),
      evidence: valueOf(root, "#evidence"),
      comprehensionResponse: checkedValue(root, "comprehension"),
      comprehensionCorrect: Number(checkedValue(root, "comprehension")) === brief.comprehension.correctIndex,
      perceivedClosure: checkedValue(root, "closure")
    };
    const errors = [];
    for (const key of ["description", "assumptions", "alternative", "evidence"]) if (response[key].length < 10) errors.push(`${key} 回答过短。`);
    if (response.comprehensionResponse === "" || !response.perceivedClosure) errors.push("请完成理解与开放性选择题。");
    setError(root, errors);
    if (errors.length) return;
    trial.commonProbe = response;
    trial.completedAt = new Date().toISOString();
    logTrialEvent(trial, "trial_completed", { comprehensionCorrect: response.comprehensionCorrect });
    session.currentTrialIndex += 1;
    saveSession();
    renderStudyB();
  });
}

function renderExpert() {
  const trial = session.trials[session.currentTrialIndex];
  if (!trial) {
    session.completedAt = new Date().toISOString();
    logEvent(session, "session_completed", {});
    saveSession();
    return renderCompletion();
  }
  if (!trial.startedAt) {
    trial.startedAt = new Date().toISOString();
    logTrialEvent(trial, "trial_started", { artefactId: trial.artefactId });
    saveSession();
  }
  const brief = BRIEF_BY_ID.get(trial.briefId);
  root.innerHTML = `
    <section class="study-shell">
      <div class="study-topbar">${progressMarkup(session.currentTrialIndex + 1, session.trials.length, "策展审计")}<span class="badge">${escapeHtml(trial.blindLabel)}</span></div>
      <div class="workspace">
        <div class="artefact-side">${artefactMarkup(trial.state, { blindLabel: trial.blindLabel })}</div>
        <div class="task-side">
          <p class="phase-tag">盲化策展判断</p><h2>是否为这个目的保留？</h2>
          <p><strong>目的：</strong>${escapeHtml(brief.purpose)}</p>
          <p><strong>受众：</strong>${escapeHtml(brief.audience)}</p>
          <p class="notice">请只依据当前 artefact、给定目的与预期受众作出判断。</p>
          <div class="field"><label>策展决定</label>${radioStackMarkup("keepDecision", [
            {value:"KEEP",label:"KEEP · 无需重大修改即可保留"},
            {value:"REVISE",label:"REVISE · 有潜力，但需要明确修改"},
            {value:"REJECT",label:"REJECT · 不适合该目的/受众"}
          ])}</div>
          <div class="field"><label>目的适配度</label>${scaleMarkup("purposeFit", "很弱", "很强")}</div>
          <div class="field"><label>为受众留下有依据的解释空间</label>${scaleMarkup("interpretiveOpenness", "封闭/混乱", "开放且可理解")}</div>
          <div class="field"><label for="expertRationale">用 artefact 证据说明决定。</label><textarea id="expertRationale"></textarea></div>
          <div class="field"><label for="requiredRevision">若选择 REVISE，最必要的一项修改是什么？其他决定可写“无”。</label><textarea id="requiredRevision" class="compact-textarea"></textarea></div>
          <div data-errors></div>
          <div class="button-row"><button id="completeExpertTrial" class="button" type="button">保存判断</button></div>
        </div>
      </div>
    </section>`;
  root.querySelector("#completeExpertTrial").addEventListener("click", () => {
    const response = {
      keepDecision: checkedValue(root, "keepDecision"),
      purposeFit: checkedValue(root, "purposeFit"),
      interpretiveOpenness: checkedValue(root, "interpretiveOpenness"),
      rationale: valueOf(root, "#expertRationale"),
      requiredRevision: valueOf(root, "#requiredRevision")
    };
    const errors = [];
    if (!response.keepDecision || !response.purposeFit || !response.interpretiveOpenness) errors.push("请完成决定和两个评分。");
    if (response.rationale.length < 15) errors.push("请给出与用途相关、可指向 artefact 的理由。");
    if (!response.requiredRevision) errors.push("请填写必要修改；没有则写“无”。");
    setError(root, errors);
    if (errors.length) return;
    Object.assign(trial, response, { completedAt: new Date().toISOString() });
    logTrialEvent(trial, "trial_completed", { keepDecision: response.keepDecision });
    session.currentTrialIndex += 1;
    saveSession();
    renderExpert();
  });
}

function renderCompletion() {
  const previewRecord = { ...session, exportedAt: session.exportedAt || new Date().toISOString() };
  const errors = validateReturn(previewRecord);
  root.innerHTML = `
    <section class="card completion">
      <div class="large-mark">✓</div>
      <p class="eyebrow">Local session complete</p>
      <h1 style="max-width:none;font-size:clamp(2.2rem,6vw,4.7rem)">完成，但尚未提交。</h1>
      <p class="lede" style="margin-inline:auto">请下载 JSON 并按协调者指定的安全方式返回。浏览器不会自动上传。</p>
      ${session.synthetic ? `<p class="notice"><strong>合成开发数据。</strong> 此文件带有 <code>synthetic: true</code>，不得进入论文结果。</p>` : ""}
      ${errors.length ? `<div class="notice danger"><strong>导出前校验发现问题：</strong><ul>${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>` : `<p class="notice good">结构校验通过。技术通过不代表研究结论成立。</p>`}
      <div class="summary-grid">
        <div class="summary-card"><strong>${session.trials.length}</strong><span>完成项目</span></div>
        <div class="summary-card"><strong>${escapeHtml(session.packageVersion)}</strong><span>应用版本</span></div>
        <div class="summary-card"><strong>${session.synthetic ? "DEMO" : "HUMAN"}</strong><span>证据类型</span></div>
      </div>
      <div class="button-row" style="justify-content:center"><button id="downloadReturn" class="button" type="button" ${errors.length ? "disabled" : ""}>下载校验后的 JSON</button><a class="button secondary" href="./index.html">返回入口</a></div>
      <p id="exportStatus" class="hint"></p>
    </section>`;
  root.querySelector("#downloadReturn")?.addEventListener("click", exportSession);
}

async function exportSession() {
  const exportRecord = structuredClone(session);
  exportRecord.exportedAt = new Date().toISOString();
  exportRecord.sessionSha256 = await sha256Hex(JSON.stringify(exportRecord));
  const errors = validateReturn(exportRecord);
  if (errors.length) throw new Error(errors.join("; "));
  const filename = `${exportRecord.packageVersion}_${exportRecord.study}_${exportRecord.participantId}.json`;
  const blob = new Blob([`${JSON.stringify(exportRecord, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  session.exportedAt = exportRecord.exportedAt;
  session.sessionSha256 = exportRecord.sessionSha256;
  logEvent(session, "return_exported", { filename, sha256: exportRecord.sessionSha256 });
  saveSession();
  const status = root.querySelector("#exportStatus");
  if (status) status.textContent = `已导出 ${filename} · SHA-256 ${exportRecord.sessionSha256.slice(0, 12)}…`;
}

function logEvent(target, type, payload) {
  target.eventLog ||= [];
  target.eventLog.push({ type, at: new Date().toISOString(), payload });
}

function logTrialEvent(trial, type, payload) {
  trial.eventLog ||= [];
  trial.eventLog.push({ type, at: new Date().toISOString(), payload });
  logEvent(session, `trial:${type}`, { trialIndex: trial.trialIndex ?? trial.taskIndex, briefId: trial.briefId });
}

function storageKey(targetMode, participantId) {
  return `kfc:${config.package_version}:${targetMode}:${participantId}`;
}

function saveSession() {
  if (!session) return;
  try {
    localStorage.setItem(storageKey(mode, session.participantId), JSON.stringify(session));
  } catch (error) {
    window.alert(`无法保存本地进度：${error.message}。请停止并联系协调者。`);
  }
}

async function loadManifest(relativePath) {
  if (manifestCache) return manifestCache;
  const response = await fetch(relativePath, { cache: "no-store" });
  if (!response.ok) throw new Error(`无法载入 artefact manifest：HTTP ${response.status}`);
  const manifest = await response.json();
  if (!manifest?.manifestId || !Array.isArray(manifest.artefacts)) throw new Error("artefact manifest 结构无效");
  const checksumMaterial = structuredClone(manifest);
  delete checksumMaterial.sha256;
  const expectedChecksum = await sha256Hex(JSON.stringify(checksumMaterial));
  if (!manifest.sha256 || manifest.sha256 !== expectedChecksum) throw new Error("artefact manifest 的 SHA-256 与内容不一致");
  manifestCache = manifest;
  return manifest;
}

async function verifyLaunchRecord(currentConfig, currentConfigSha256) {
  const errors = [];
  let record = null;
  try {
    if (typeof currentConfig.launch_record !== "string" || !currentConfig.launch_record.trim()) throw new Error("launch_record 未配置");
    const response = await fetch(currentConfig.launch_record, { cache: "no-store" });
    if (!response.ok) throw new Error(`launch_record HTTP ${response.status}`);
    record = await response.json();
  } catch (error) {
    return { ready: false, allowedModes: [], errors: [error.message], stage: null, packageFreezeBundleSha256: null };
  }

  if (record.schemaVersion !== "kfc-launch-record/0.1") errors.push("launch_record schemaVersion 无效");
  if (record.status !== "MECHANICALLY_READY_RESEARCHER_CONFIRMATION_REQUIRED") errors.push("launch_record 状态无效");
  if (record.collectionPhase !== currentConfig.collection_phase) errors.push("launch_record 与当前收集阶段不一致");
  if (record.configSha256 !== currentConfigSha256) errors.push("研究配置已在启动检查后改变");
  if (!Array.isArray(record.allowedModes) || !record.allowedModes.length) errors.push("launch_record 未授权任何实验模式");

  try {
    const response = await fetch(record.packageFreezePath, { cache: "no-store" });
    if (!response.ok) throw new Error(`package freeze HTTP ${response.status}`);
    const freeze = await response.json();
    const material = structuredClone(freeze);
    delete material.bundleSha256;
    const computedBundle = await sha256Hex(JSON.stringify(material));
    if (computedBundle !== freeze.bundleSha256) errors.push("package freeze bundleSha256 无效");
    if (freeze.bundleSha256 !== record.packageFreezeBundleSha256) errors.push("launch_record 与 package freeze 不一致");
  } catch (error) {
    errors.push(`无法验证 package freeze：${error.message}`);
  }

  if (!Array.isArray(record.runtimeFiles) || !record.runtimeFiles.length) {
    errors.push("launch_record 缺少运行时文件哈希");
  } else {
    for (const file of record.runtimeFiles) {
      const runtimePath = String(file.path || "").replaceAll("\\", "/");
      const allowedPath = runtimePath.startsWith("web/")
        || runtimePath.startsWith("src/")
        || runtimePath === "config/study-config.json"
        || runtimePath === "data/frozen/pilot-study-b-manifest.json"
        || runtimePath === "data/frozen/study-b-manifest.json";
      if (!allowedPath || runtimePath.includes("..") || !/^[a-zA-Z0-9._/-]+$/.test(runtimePath)) {
        errors.push(`launch_record 含不安全运行时路径：${runtimePath}`);
        continue;
      }
      try {
        const response = await fetch(`../${runtimePath}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const hash = await sha256Bytes(await response.arrayBuffer());
        if (hash !== file.sha256) errors.push(`运行时文件已改变：${runtimePath}`);
      } catch (error) {
        errors.push(`无法验证运行时文件 ${runtimePath}：${error.message}`);
      }
    }
  }

  return {
    ready: errors.length === 0,
    allowedModes: record.allowedModes || [],
    errors,
    stage: record.stage || null,
    packageFreezeBundleSha256: record.packageFreezeBundleSha256 || null
  };
}

async function sha256Hex(text) {
  return sha256Bytes(new TextEncoder().encode(text));
}

async function sha256Bytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
