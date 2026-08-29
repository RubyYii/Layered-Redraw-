export const BRIEFS = [
  {
    id: "cooling-credit-2035",
    shortTitle: "城市降温额度 2035",
    artefactType: "公共服务界面",
    organisation: "Civic Heat Office",
    purpose: "让城市居民讨论极端高温期间，公共降温资源应由谁、依据什么来分配。",
    audience: "受高温影响的城市居民与社区服务人员",
    challenge: "一位没有智能手机的夜班清洁工指出：系统把“可被数据识别”当成了“更值得获得帮助”。请检查并回应这一问题。",
    tension: "紧急资源应优先依据传感器预测，还是依据居民自己表达的处境？",
    comprehension: {
      question: "这个界面主要在分配什么？",
      options: ["公共降温资源", "长期住房产权", "学校入学名额"],
      correctIndex: 0
    },
    visual: {
      code: "HEAT / 07",
      eyebrow: "Public Cooling Credit",
      headline: "Today’s cooling access",
      metric: "82",
      metricLabel: "priority index",
      accent: "cyan",
      layout: "panel"
    },
    fields: [
      {
        id: "access",
        label: "领取入口",
        base: "仅限绑定智能手机账户的常住居民",
        alternatives: [
          "可通过手机、图书馆服务台、电话或社区代理领取",
          "数字额度与可转让纸质凭证并行，由社区站点发放",
          "高温红色预警期间，降温中心取消账户核验"
        ],
        keywords: ["手机", "app", "数字", "账户", "老人", "接入", "phone", "access", "account"]
      },
      {
        id: "allocation",
        label: "排序依据",
        base: "系统按照预测的“规则遵从概率”排列家庭",
        alternatives: [
          "居民、社区工作者与健康数据共同形成可解释的优先顺序",
          "先按暴露风险划定资源池，再由社区公开讨论边缘个案",
          "不建立个人排名，按街区热暴露和现场需求动态增补"
        ],
        keywords: ["排序", "算法", "分数", "遵从", "优先", "公平", "score", "rank", "allocation"]
      },
      {
        id: "appeal",
        label: "复核方式",
        base: "结果每晚自动更新，不提供个人复核",
        alternatives: [
          "居民可要求人工复核，并看到影响决定的主要依据",
          "争议决定在 24 小时内由居民与服务人员联合复核",
          "任何拒绝都必须附带申诉入口和临时应急通行证"
        ],
        keywords: ["申诉", "复核", "解释", "拒绝", "人工", "appeal", "review", "explain"]
      }
    ]
  },
  {
    id: "carelink-home-2032",
    shortTitle: "CareLink 家庭照护 2032",
    artefactType: "家庭照护服务卡",
    organisation: "CareLink Cooperative",
    purpose: "让家庭、照护者与被照护者讨论预测性照护系统中的同意、可见性与干预权。",
    audience: "可能使用家庭照护服务的成年人及其家属",
    challenge: "被照护者表示，她从未同意让所有家庭成员持续看到自己的作息偏差。请检查并回应这一问题。",
    tension: "在紧急风险与日常自主之间，谁有权决定何时共享和升级信息？",
    comprehension: {
      question: "这个服务主要监测什么场景？",
      options: ["家庭日常照护", "城市交通拥堵", "工作招聘表现"],
      correctIndex: 0
    },
    visual: {
      code: "HOME / 12",
      eyebrow: "CareLink Home",
      headline: "A quieter kind of watch",
      metric: "3",
      metricLabel: "pattern changes",
      accent: "coral",
      layout: "soft"
    },
    fields: [
      {
        id: "consent",
        label: "同意机制",
        base: "首次安装即默认长期同意全部监测",
        alternatives: [
          "被照护者按数据类型和时间段逐项授权，并可随时暂停",
          "每周以易懂摘要重新确认授权，未确认的数据不外发",
          "紧急与日常数据采用不同同意规则，紧急访问会留下回执"
        ],
        keywords: ["同意", "授权", "默认", "撤回", "隐私", "consent", "permission", "privacy"]
      },
      {
        id: "visibility",
        label: "数据可见性",
        base: "所有家庭成员持续查看完整作息与异常记录",
        alternatives: [
          "被照护者选择每位家属可见的摘要级别",
          "家庭只看到需要协助的信号，原始作息保留在本地",
          "先向本人展示变化，由本人决定是否邀请他人查看"
        ],
        keywords: ["家属", "可见", "查看", "数据", "共享", "family", "visible", "share", "data"]
      },
      {
        id: "escalation",
        label: "升级规则",
        base: "系统把任何偏离常规的行为自动标为风险",
        alternatives: [
          "系统先询问本人如何解释变化，再决定是否升级",
          "只有持续变化且本人请求协助时才通知照护网络",
          "风险规则由本人、照护者与专业人员定期共同复核"
        ],
        keywords: ["异常", "风险", "通知", "升级", "常规", "alert", "risk", "escalate", "normal"]
      }
    ]
  },
  {
    id: "common-ground-2040",
    shortTitle: "共同地面防洪计划 2040",
    artefactType: "社区资源分配公告",
    organisation: "Estuary Commons Assembly",
    purpose: "让社区讨论洪水适应资源如何代表不同居住者、承认何种证据并分配保护。",
    audience: "沿河社区的租户、业主、商户与公共服务人员",
    challenge: "长期租户指出：只有产权人拥有正式投票权，但最容易被迫搬离的人未必拥有房产。请检查并回应这一问题。",
    tension: "保护既有资产与保护最脆弱居民发生冲突时，公共决策应如何处理？",
    comprehension: {
      question: "这个公告主要决定什么？",
      options: ["社区防洪资源", "个人医疗处方", "线上娱乐内容"],
      correctIndex: 0
    },
    visual: {
      code: "TIDE / 04",
      eyebrow: "Common Ground 2040",
      headline: "What the water reaches first",
      metric: "61%",
      metricLabel: "capital protected",
      accent: "indigo",
      layout: "notice"
    },
    fields: [
      {
        id: "representation",
        label: "代表权",
        base: "只有登记产权人拥有正式投票权",
        alternatives: [
          "租户、业主、商户与公共服务使用者分别拥有代表席位",
          "每个受影响住址拥有一票，另为高搬迁风险居民设置否决审查",
          "随机抽取居民议会，并保证租户和临时居住者最低席位"
        ],
        keywords: ["租户", "业主", "投票", "代表", "产权", "tenant", "owner", "vote", "representation"]
      },
      {
        id: "evidence",
        label: "有效证据",
        base: "资产估值是唯一正式损失指标",
        alternatives: [
          "资产、健康、照护中断与被迫迁移风险并列记录",
          "居民经验与水文模型分别呈现，不把其中一类自动降级",
          "公开列出不同证据如何改变资源排序，并允许质疑权重"
        ],
        keywords: ["证据", "估值", "健康", "经验", "损失", "evidence", "value", "health", "loss"]
      },
      {
        id: "distribution",
        label: "保护分配",
        base: "优先保护总资产价值最高的街区",
        alternatives: [
          "先保障无法自行迁移的居民，再比较基础设施与资产损失",
          "部分预算用于防护，部分用于自愿搬迁和租户长期安置",
          "每个方案同时公布受益者、承担风险者与未解决后果"
        ],
        keywords: ["分配", "保护", "预算", "街区", "搬迁", "distribution", "protect", "budget", "relocate"]
      }
    ]
  }
];

export const BRIEF_BY_ID = new Map(BRIEFS.map((brief) => [brief.id, brief]));

export function baseStateFor(briefId) {
  const brief = requireBrief(briefId);
  return {
    briefId,
    values: Object.fromEntries(brief.fields.map((field) => [field.id, field.base])),
    visual: { ...brief.visual }
  };
}

export function requireBrief(briefId) {
  const brief = BRIEF_BY_ID.get(briefId);
  if (!brief) throw new Error(`Unknown brief: ${briefId}`);
  return brief;
}

export function inferTargets(briefId, prompt) {
  const brief = requireBrief(briefId);
  const normalized = String(prompt || "").toLowerCase();
  const scored = brief.fields.map((field) => ({
    id: field.id,
    score: field.keywords.reduce(
      (total, keyword) => total + (normalized.includes(keyword.toLowerCase()) ? 1 : 0),
      0
    )
  }));
  const max = Math.max(0, ...scored.map((entry) => entry.score));
  if (max === 0) return [brief.fields[0].id];
  return scored.filter((entry) => entry.score === max).map((entry) => entry.id);
}

export function makeCandidate({ briefId, currentState, condition, targetIds, attempt }) {
  const brief = requireBrief(briefId);
  const state = structuredClone(currentState || baseStateFor(briefId));
  const targets = [...new Set(targetIds)].filter((id) => brief.fields.some((field) => field.id === id));
  const effectiveTargets = targets.length ? targets : [brief.fields[0].id];
  const alternativeIndex = Math.abs(Number(attempt) || 0) % 3;

  if (condition === "layered") {
    for (const targetId of effectiveTargets) {
      const field = brief.fields.find((entry) => entry.id === targetId);
      state.values[targetId] = field.alternatives[alternativeIndex];
    }
    return state;
  }

  if (condition !== "flat") throw new Error(`Unknown making condition: ${condition}`);

  for (const targetId of effectiveTargets) {
    const field = brief.fields.find((entry) => entry.id === targetId);
    state.values[targetId] = field.alternatives[alternativeIndex];
  }

  if (alternativeIndex === 0) {
    state.visual.accent = "amber";
  } else if (alternativeIndex === 1) {
    const primaryIndex = brief.fields.findIndex((field) => field.id === effectiveTargets[0]);
    const collateralField = brief.fields[(primaryIndex + 2) % brief.fields.length];
    if (!effectiveTargets.includes(collateralField.id)) {
      state.values[collateralField.id] = collateralField.alternatives[2];
    } else {
      state.visual.headline = `${brief.visual.headline} — revised`;
    }
  } else {
    state.visual.layout = "split";
  }
  return state;
}

export function diffStates(before, after) {
  const beforeValues = before?.values || {};
  const afterValues = after?.values || {};
  const semantic = [...new Set([...Object.keys(beforeValues), ...Object.keys(afterValues)])]
    .filter((key) => beforeValues[key] !== afterValues[key]);
  const beforeVisual = before?.visual || {};
  const afterVisual = after?.visual || {};
  const visual = [...new Set([...Object.keys(beforeVisual), ...Object.keys(afterVisual)])]
    .filter((key) => beforeVisual[key] !== afterVisual[key]);
  return { semantic, visual };
}

export function validateArtifactState(state) {
  const errors = [];
  if (!state || typeof state !== "object") return ["artifact state must be an object"];
  const brief = BRIEF_BY_ID.get(state.briefId);
  if (!brief) return ["artifact state has an unknown briefId"];
  if (!state.values || typeof state.values !== "object") errors.push("values are missing");
  for (const field of brief.fields) {
    if (typeof state.values?.[field.id] !== "string" || !state.values[field.id].trim()) {
      errors.push(`missing value for ${field.id}`);
    }
  }
  if (!state.visual || typeof state.visual !== "object") errors.push("visual state is missing");
  return errors;
}
