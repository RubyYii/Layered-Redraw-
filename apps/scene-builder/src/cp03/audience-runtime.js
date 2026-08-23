import {
  CP03_RUNTIME_SCHEMA_VERSION,
  sha256Canonical,
  validateAgentActionDraft,
  validateApprovalRecord,
} from "@layered-redraw/pact-cp03-contracts";
import { createInteractionDemoProject } from "../interaction-demo.js";
import { normalizeProject } from "../model.js";
import { hashProject } from "../scene-patch-runtime.js";
import { CP03_ACTIONS, CP03_VISUAL_GRAMMAR } from "./visual-effects.js";

export const CP03_ACTION_COPY = Object.freeze({
  Translate: Object.freeze({ title: "Translate", subtitle: "把记忆关系转成可见位移", trace: "Witness（本地脚本）：关系被译成位移回声；源记录没有被改写。" }),
  Reframe: Object.freeze({ title: "Reframe", subtitle: "改变观看关系，不替换来源", trace: "Witness（本地脚本）：取景边界移动；来源仍留在原位。" }),
  Merge: Object.freeze({ title: "Merge", subtitle: "保留接缝地连接多方证词", trace: "Witness（本地脚本）：两条关系被缝合，矛盾仍然可见。" }),
  Continue: Object.freeze({ title: "Continue", subtitle: "接受当前状态并结束本轮", trace: "Witness（本地脚本）：波纹越过本轮边界，场景继续。" }),
  KeepOpaque: Object.freeze({ title: "Keep Opaque", subtitle: "不解释、不执行进一步改写", trace: "Guardian（本地脚本）：此处保持不透明；不把缺失内容补写成事实。" }),
});

const safeViewerText = (value) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 220);
const tokenFor = (ordinal) => String(Math.max(1, Math.round(Number(ordinal) || 1))).padStart(8, "0");

export function createCp03EncounterProject() {
  const source = createInteractionDemoProject();
  source.name = "PACT CP03 · 五动作本地演练";
  source.director.screenplay = "";
  source.director.timeline = {
    duration: 0,
    clips: [],
    issues: [],
    compiledScript: "",
    compiledAt: null,
  };
  return normalizeProject(source);
}

export async function buildLocalScriptedProposal({ action, project, viewerText, ordinal = 1 }) {
  if (!CP03_ACTIONS.includes(action)) throw new Error("请选择五种 CP03 动作之一。");
  const parentSceneHash = await hashProject(project);
  const token = tokenFor(ordinal);
  const copy = CP03_ACTION_COPY[action];
  const input = safeViewerText(viewerText) || "观众未补充文字；仅演练既有注册交互。";
  const terminal = CP03_VISUAL_GRAMMAR[action].terminal ? action : null;
  const draft = validateAgentActionDraft({
    identity: {
      draftId: `draft_local${token}`,
      schemaVersion: CP03_RUNTIME_SCHEMA_VERSION,
      caseSessionId: "case_cp03_local_encounter",
      turnId: `turn_local${token}`,
      parentSceneHash,
    },
    decision: {
      status: "PROPOSED",
      actionSequence: [action],
    },
    creative: {
      interpretation: `本地脚本演练把观众输入保留为未验证引用：“${input}”`,
      unresolvedAmbiguities: ["本演练没有调用真实 Provider，也不声称生成了代理解释。"],
      spatialIntent: "让角色 A 接近已注册的交互杯并执行可回滚拿取。",
      visualIntent: `在收据影响对象上显示“${CP03_VISUAL_GRAMMAR[action].label}”瞬态语法。`,
      cameraIntent: "保持当前工程摄影机，不从文本生成原始机位参数。",
      lightIntent: "仅使用瞬态效果灯，不改写项目灯光。",
      soundIntent: "本地演练不合成或播放未经许可的声音。",
      publicPoeticText: copy.trace,
      seamsAndContradictionsToPreserve: ["观众输入、脚本演练与真实代理输出必须保持可区分。"],
    },
    materials: {
      requestedAssetIds: [],
      requestedSpatialBridgeIds: [],
      provenanceAnchors: ["interaction-cup"],
      rightsRequirements: ["只使用当前工程内已注册的本地对象。"],
    },
    execution: {
      executionMode: "EXECUTABLE_PROPOSAL",
      semanticCapabilityCalls: [{
        capability: "performRegisteredInteraction",
        arguments: {
          actorId: "interaction-actor-a",
          targetId: "interaction-cup",
          affordance: "pickup",
        },
      }],
      expectedChanges: ["interaction-actor-a", "interaction-cup"],
      forbiddenChanges: ["interaction-backdrop", "interaction-floor"],
      forbiddenCapabilityIds: [],
      rollbackRequirements: ["丢弃瞬态导演覆盖并恢复提案前场景哈希。"],
      terminalIntent: terminal,
    },
    agency: {
      contributions: [],
      disagreements: ["这是零调用本地脚本轨迹，不是 Gemini 或 DeepSeek 输出。"],
      guardianChallenge: "只有观众批准当前精确哈希后，Capability Gate 才可执行。",
      witnessEvidence: {
        observations: [{
          observationId: `observation_local${token}`,
          text: `观众输入被保留为未验证文本引用：“${input}”`,
          inputRefIds: [`viewer-text-local${token}`],
        }],
        uncertainties: ["没有调用真实 Provider；本地脚本不推断输入真实性或空间关系。"],
        evidenceAnchors: [`viewer-text-local${token}`],
      },
      dissentRecords: [{
        dissentId: `dissent_local${token}`,
        text: "本地脚本只验证执行路径，不代表 Agent 对作品含义的判断。",
        evidenceIds: [`viewer-text-local${token}`],
      }],
    },
  });
  return {
    draft,
    draftHash: await sha256Canonical(draft),
    publicTrace: copy.trace,
    guardianDisposition: "ALLOW_LOCAL_RULESET",
    providerKind: "scripted-local",
    providerRequestsMade: 0,
  };
}

export async function createLocalViewerApproval(proposal, decision, decidedAt = new Date().toISOString()) {
  if (!proposal?.draft || !["APPROVE", "REJECT"].includes(decision)) throw new Error("审批输入无效。");
  const token = proposal.draft.identity.turnId.replace(/^turn_/, "");
  return validateApprovalRecord({
    schemaVersion: CP03_RUNTIME_SCHEMA_VERSION,
    approvalId: `approval_${token}`,
    caseSessionId: proposal.draft.identity.caseSessionId,
    turnId: proposal.draft.identity.turnId,
    draftHash: proposal.draftHash,
    parentSceneHash: proposal.draft.identity.parentSceneHash,
    decision,
    approvedBy: "viewer",
    decidedAt,
  });
}

export function createLocalEngineeringArchive({ proposals, approvals, receipts, effects, exportedAt = new Date().toISOString() }) {
  return Object.freeze({
    schemaVersion: "cp03-local-engineering-archive/0.1",
    status: "ENGINEERING_ONLY_NOT_CHECKPOINT",
    providerKind: "scripted-local",
    providerRequestsMade: 0,
    exportedAt,
    evidenceClasses: {
      interaction: proposals.length > 0,
      visual: effects.length > 0,
      provenance: true,
      discourse: true,
      humanDecision: false,
    },
    checkpointEligible: false,
    checkpointBlockers: [
      "真实 Provider 兼容性尚未通过",
      "尚无正式六轮自由文本 encounter capture",
      "尚无独立技术 PASS 与艺术 KEEP 决定",
    ],
    proposals: structuredClone(proposals),
    approvals: structuredClone(approvals),
    receipts: structuredClone(receipts),
    effects: structuredClone(effects),
  });
}
