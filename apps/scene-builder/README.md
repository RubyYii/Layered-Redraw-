# 灰场 · Blockout Studio

一个从概念图、灰模、实体行为到剧本时间线的模块化三维导演工具。每个物体都以独立数据记录，场景与剧本可保存为版本化 JSON，方便后续接入 Blender、glTF、角色动画或物理引擎。

当前工作流从概念图开始：导入在 Codex 中生成或自行绘制的场景图，记录生成提示词，把画面拆成独立物体清单，再逐项创建并校准三维灰模。

## 已实现

- 立方体、球体、圆柱体、圆锥体和平面灰模
- 场景层级、视口点选和变换控制器
- 位置、旋转、尺寸、缩放、颜色、可见性与锁定属性
- 透视、前、侧、顶视角
- 撤销、重做、复制、删除与快捷键
- JSON 保存/载入、IndexedDB 大型工程恢复和小工程 localStorage 镜像
- 空场景与可拆解的入口示例场景
- 概念图导入、自动缩放压缩与项目内嵌
- 参考图视口叠加、显示开关和透明度校准
- 场景描述/生成提示词留档
- 物体拆解清单及“创建灰模/定位物体”连接
- 角色、物品、场景三种实体类型及独立能力开关
- 初始状态、刚体类型、质量、摩擦、弹性等可导出物理元数据
- 预览模式中的点击触发、脉冲缩放、旋转和显隐响应
- 中文行式剧本编译器及逐行错误定位
- 镜头、角色、物品/场景、对白四类时间线轨道
- 播放、暂停、停止、拖动定位和 24fps 时间码
- 编辑/预览隔离：播放不会改写原始场景数据
- v1/v2 项目到 v3 实体与导演格式的自动迁移
- 角色根节点与局部子节点层级，替换模型时无需重写角色轨道
- minimum-jerk 加减速、按弧长推进的样条路径、转向倾斜与悬浮次级运动
- 显式摄影机位置／注视样条，支持连续电影运镜
- 可视化电影镜头编辑器：选择现有相机片段、从透视视口记录 A／B 机位、精确编辑时间／FOV／位置／注视点／速度曲线与多点轨道、独立播放所选镜头
- 物品交互锚点、可执行 affordance 与可追踪 interaction 时间线片段
- OBJ／GLB 导入与灰模替换，按比例适配灰模边界；OBJ 用作静态网格，GLB 承载蒙皮、骨架、动作和 Morph 表情；二进制按 SHA-256 写入浏览器资产库
- 单图深度建模：PNG／JPEG／WebP 在浏览器内经 Depth Anything V2 生成相对深度，形成带顶点色、UV、法线和断层保护的 OBJ；可编辑人形、四足、鸟类、蛇形或自定义骨架并导出四权重蒙皮 GLB
- 多视角灰模：正面加任一侧面为最低输入，可追加背面、顶部和底部；浏览器本地提取可检查轮廓，并可用 Depth Anything V2 为每个视角增加可预览、可反转、可停用的相对深度约束，再生成可旋转的中性灰 visual hull
- Layered Redraw `spatial-bridge.json` 工程导入：自动匹配 RGB／近白相对深度、校验两个 SHA-256，并生成可旋转的 2.5D 纹理高度场；载体位置、旋转和尺寸继续可编辑
- 导入报告会列出网格、蒙皮网格、骨骼、动画片段与 Morph Target，并自动识别 `root/head/effector/statusLight`、常用骨骼和表情槽位
- `AnimationMixer` 驱动的 `idle/move/interact/react` CrossFade，以及独立的动作、表情权重与骨骼姿态控制接口；模型变化不改写角色根轨道
- 外部动作 GLB 到当前蒙皮骨架的动画重定向接口，以及双手／双脚世界空间双骨 CCD、头颈注视与静止脚底锁定；目标按真实骨长限制在可达环带内，退化骨链安全降级
- 同角色每帧 IK 批处理与平滑 1–8 次迭代预算：离屏／远景减负，近景／选中角色恢复精度，固定步长成片始终使用完整预算
- 25 槽位骨架映射编辑器：搜索、自动推断、必需槽位／重复骨骼诊断、实时姿势／双手／脚锁测试和工程持久化
- 通用骨架拓扑编辑器：新增／删除／镜像骨骼，修改名称、父级、语义角色、身体侧、运动链、末端执行器、前后深度和球形／铰链／扭转限位；后代不会出现在可选父级中，循环父级会在导出前被拒绝
- rig profile 能力接口：从任意有效拓扑生成根骨、骨链、限位、映射与 `move / walk / fly / bite / peck / wag / slither` 等受控能力，并通过通用链式 CCD IK 驱动非人角色
- `idle / approach / look / reach / grasp / carry / transfer / release / speak` 角色动作状态机，统一选择动画槽位与身体约束
- 阶段感知角色表演配置：交互阶段和接触权重共同驱动有界对称双手握点、脚锁、头颈注视及自动 Morph 表情；对白口部／眨眼包络可确定性重放，手动表情保持最高优先级
- 交互的预备、伸手、接触、恢复阶段，以及随持有者旋转的局部携带锚点
- 固定 60Hz 导演预览，以及 `claim / transfer / release` 三阶段所有权状态机；非法持有者不能交接或释放物品
- `interactionSpec.collisionProxy` 胶囊／箱体代理：角色避开静态场景、道具保持在支撑面之上，HUD 报告修正数量与残余穿透
- 灰模执行器采用物品表面接触点，交接双方落在相对两侧；伸缩臂从肩部连续连接到修正后的执行器
- 十秒交互仿真实验室：两名角色连续完成接近、抓取、携带、交接和放置，并提供独立 30fps 逐帧视频渲染
- 基于静态碰撞体膨胀边界的三角化导航网格、共享边门户与 A* 走廊，可把越界意图编译为“接近—交互”计划；旧网格 A* 保留为显式回退
- 按需加载的 Rapier WASM 60Hz 刚体世界：动态物体接受重力、碰撞、摩擦和恢复系数；时间线或所有权控制期间切换为运动学权威
- 大模型意图观察器、校验器、计划器与 `runAgentBehaviorTurn` 适配入口；模型只能请求 `approach / look / reach / grasp / transfer / release / speak`，不能直接写入位置、旋转、路径、脚本或资源 URL；接受／拒绝都有哈希回执
- 摄影机曲线缓存、轻量预览变换、增量时间线高亮、FPS/P95 监测、自适应像素比与弱设备阴影／局部灯降级；离线渲染固定为完整特效
- 可复现仿真交付包：视频、场景快照、资产锁、逐帧增量轨迹、所有权／碰撞审计、离线 WebGL 回放和 SHA-256 验证器统一生成
- 可移植工程包：项目 JSON、OBJ／GLB、动作 GLB、RGB-D 桥接／RGB／深度，以及单图或多视角生成的模型／处理后 RGB／深度 PNG／配方按内容寻址打入 `.blockout.zip`，导入时逐项复算哈希
- `?case=pact-cp03` 五动作观众台：Translate／Reframe／Merge／Continue／Keep Opaque 对应五种瞬态 Three.js 效果，并保留哈希批准、Capability Gate 与回执链；当前明确是零调用本地工程验收

## 电影镜头编辑器

1. 载入项目，点击时间线工具栏的“电影镜头”，或在编辑模式直接点击镜头轨道中的片段。
2. 在镜头列表中选中一个镜头。A 是进入画面的机位，B 是离开画面的机位。
3. 点击 A 或 B 的“查看”，用视口左键旋转、右键平移、滚轮推进；确认后点击“记录当前视口”。电影机位只记录透视相机，前／侧／顶正交视图不会被误存。
4. 可以直接输入开始时间、时长、FOV、相机位置和注视点，并选择电影缓入缓出、柔和或匀速曲线。
5. 展开“高级 · 运镜路径”可用 A／B 自动建立三点轨道，或逐行输入 3–16 个 `x, y, z` 控制点。路径首尾始终与 A／B 同步。
6. “播放本镜头”只播放当前片段；新建、复制、修改、删除都进入撤销／重做历史。大型工程由 IndexedDB 恢复库异步保存；“保存 JSON”和“保存可移植工程包”仍用于显式版本与跨机器交付。

## 单图生成 OBJ 与骨架 GLB

1. 选中一个可修改载体，在“角色／模型资产”中点击“单图 → OBJ / 骨架”。
2. 选择 PNG、JPEG 或 WebP。图片会在浏览器内缩放到最长边 1024 px；透明通道会参与网格裁切。
3. 点击“估算相对深度”。运行时会先检查真实 GPU adapter 与 `shader-f16`，兼容时使用 WebGPU，否则直接使用 WASM；首次运行下载模型，图片不会上传。
4. 调整网格精度、纵深强度和断层阈值，点击“生成并载入 OBJ”。OBJ 包含顶点色、UV、法线，但仍是静态网格。
5. 在“编辑通用骨架与蒙皮”中选择人形、四足、鸟类或蛇形预设；也可新增、删除、镜像骨骼，修改父级、语义角色、运动链、末端执行器、关节类型与角度范围。循环拓扑或缺失父级会阻止导出。
6. 在原图上拖动青色关节点并按需要调整前后深度，然后点击“生成并载入骨架 GLB”。GLB 含四权重蒙皮和通用 rig profile；人形仍可进入 25 槽位映射、双手／双脚 IK 与动作重定向，非人骨架可由 `setAssetChainIk` 按语义链控制。
7. 普通工程 JSON 只保存内容哈希；“保存可移植工程包”会同时冻结模型、处理后 RGB、深度 PNG 和完整 rig 配方。单图只生成非米制可见表面，不能恢复背面、真实体积、自动姿态语义或生产级蒙皮。

## 多视角照片生成深度辅助灰模

1. 选中一个可修改载体，打开“多视角 → 可旋转灰模”，至少加入正面和任一侧面；同一物体应保持直立、居中、焦距与拍摄距离近似一致。
2. 逐视角检查粉色轮廓。阈值只影响背景差异模式，透明通道模式会自动停用该阈值。
3. 可只估算当前视角，也可批量估算全部已导入视角。首次运行下载约 20–30 MB Depth Anything V2 权重，推理在浏览器本机进行，照片不会上传。
4. 将卡片切到“相对深度”预览，确认白色为近处。错误视角可反转近／远或直接停用，原始深度数组不会被反相操作改写。
5. “生成纯轮廓基线”会忽略深度但保留当前轮廓与体素设置；“生成深度辅助灰模”使用已启用的视角。“深度影响”留在主流程；体素精度、轮廓留量和深度容差收在“高级重建参数”中。默认 0.30 影响与 0.08 容差强调保守辅助，而不是自动替代判断。
6. 构建后的“深度作用证据”会列出纯轮廓体素、最终体素、总削减量、每个视角拒绝的体素以及多视角同时拒绝的体素。这些是可复现的作用计数，不是模型置信度；削减至少一半时界面会要求检查方向并比较基线。
7. OBJ、源图、原始深度 PNG、配方、模型元数据、逐视角削减计数与操作序列一同按 SHA-256 持久化并可刷新恢复。`D` 可启用／停用当前深度，`I` 可反转近／远。

每张单目深度只在自己的轮廓内做稳健相对归一化；不同视角之间不进行米制或尺度／偏移对齐。轮廓始终是硬外壳，深度只能收紧体积，不能恢复无证据的背面、真实凹陷、相机标定或生产拓扑。

镜头编辑器直接修改已有 `director.timeline.clips`，不会触碰未选中的角色、物品、场景或对白片段，也不会调用剧本编译器。完整 166 秒工程包含手工编排轨道，不应在镜头微调后点击“编译时间线”；该按钮的职责仍是根据左侧剧本文本重新生成整条时间线。

## 剧本语法

剧本采用明确、可检查的“每行一个动作”格式。物体名称必须和场景层级一致：

```text
镜头切到透视，用时 0.8 秒
探索者 移动到 (-1.5, 1, 2)，用时 2 秒
探索者：我看到能量核心了。
镜头聚焦 能量核心，用时 1 秒
能量核心 放大 1.6 倍，用时 1 秒
探索者 拿起 发光钥匙，用时 0.6 秒
探索者 将 发光钥匙 交给 守护者，用时 1 秒
守护者 将 发光钥匙 放到 展示台，用时 1 秒
等待 0.5 秒
能量核心 隐藏
```

当前可执行动作包括镜头预设/聚焦、移动到坐标或物体、旋转、缩放/放大/缩小、打开、显示/隐藏、对白、拿取、交给、放到和等待。交接要求动作主体确实持有物品；放置要求物品声明 `release` affordance、接触面声明对应锚点。无法识别或非法的句子会保留在编辑器中并给出行号错误，不会被猜测执行。

## 本地运行

```bash
npm install
npm run dev
```

随后打开终端显示的本地地址。生产构建和测试：

```bash
npm run build
npm test
npm run test:ui
npm run test:rig-editor
npm run test:camera-editor
npm run test:cp03:audience
npm run test:single-image-3d
npm run test:multi-view-gray
npm run test:universal-rig
npm run test:large-autosave
npm run build:interaction-demo
npm run render:interaction-demo:video30
```

右上角更多菜单中的“载入十秒交互仿真”会打开一个 19 对象、9 片段、10 秒的验收场景。预览 HUD 会显示仿真频率、交互阶段、持有者、剩余行程、防穿透修正数量和残余穿透；生成项目也可从 `projects/interaction-lab/interaction-simulation.blockout.json` 单独载入。离线渲染还会输出拾取、A 携带、交接、B 携带、放置和完成六张碰撞验收关键帧，任何关键帧残余穿透不为零都会中止。

渲染成功会在视频旁生成 `.simulation-package/`；视频已有时可单独执行：

```bash
npm run package:interaction-demo
npm run package:window-case
```

包内运行 `node verify-delivery.mjs` 可重算全部文件哈希与 `simulationIdentity`；运行 `node serve-replay.mjs` 可离线打开视频／3D 双视图回放。渲染器只有在视频编码和仿真审计同时通过时才返回成功。外部 OBJ／GLB／RGB-D 仍必须先进入持久资产合同；当前包会锁定项目中已声明的绑定和内嵌纹理，但不会把临时浏览器会话资产伪装成已归档资源。

生成十秒包后，`npm run test:simulation-replay` 会自行启动临时回放服务器、定位到交接段、检查 WebGL／播放推进／控制台错误并保存 smoke 截图，结束时自动关闭服务器。

## 项目格式

项目使用 `schemaVersion: 3` 的纯 JSON 数据，不会直接序列化 Three.js 对象。`reference` 保存压缩后的概念图和提示词，`breakdown` 保存物体拆解与灰模连接，`objects` 保存稳定 ID、父子关系、变换、实体组件、运动配置、模型绑定（`nodes`、`animations`、`bones`、`expressions`）、交互锚点、可选碰撞代理和实时材质参数，`director` 保存剧本文本、编译提示、物体动作、语义交互以及显式电影机位路径。旧版 v1/v2 JSON 在载入时会自动迁移。

物理属性仍由结构化元数据决定。语义交互和所有权保持确定性运动学权威；静态障碍会生成半径膨胀的三角导航网格，离散代理继续审计角色／道具残余穿透；没有被时间线或持有关系控制的 `dynamic` 物体则交给按需加载的 Rapier 60Hz 世界处理重力与接触。这个组合仍不是完整游戏角色控制器，也没有把 RGB-D 高度场自动变成碰撞网格。

OBJ、单文件 GLB、动作 GLB、单图模型工件、多视角灰模工件与含 `spatial-bridge.json` 的 Layered Redraw 工程会写入浏览器内容寻址资产库。普通项目 JSON 只保存 SHA-256 引用；点击“保存可移植工程包”才会把项目与全部引用二进制打成跨机器 `.blockout.zip`，导入时复算清单和内容哈希。RGB-D 与单图生成仍是相对 2.5D、非米制、无隐藏背面；多视角结果以轮廓 visual hull 为硬外壳，可选单目深度只按各视角独立归一化后收紧可见表面，不恢复真实凹陷、尺度、纹理或生产拓扑；OBJ 仍是静态网格。通用骨架预设需要用户对齐关节点，不等同于姿态识别、自动分割、体积重建、肌肉／平衡仿真或生产级蒙皮。需要动作、表情和通用动画重定向的角色仍应优先使用专业 DCC 制作的带蒙皮 GLB。

### 角色运行时接口

导入后可通过编辑器实例读取能力报告并控制角色：

```js
const report = editor.assetReport(objectId);
editor.playAssetAction(objectId, "interact");
editor.setAssetExpression(objectId, "smile", 0.8, { exclusive: true });
editor.setAssetBonePose(objectId, "head", { rotationDegrees: [0, 20, 0] });
editor.setAssetHandIk(objectId, "rightHand", [0.4, 1.2, -0.7], { weight: 1 });
editor.setAssetRigBindings(objectId, savedBoneMap, savedRigProfile);
editor.setAssetChainIk(objectId, "frontLeg.near", [0.4, 0.2, -0.7], { weight: 1 });
editor.previewAssetRig(objectId, "feet");
await editor.loadRetargetAnimationFile(objectId, animationGlbFile);
editor.clearAssetExpressions(objectId);
editor.clearAssetBonePose(objectId, "head");
editor.clearAssetHandIk(objectId, "rightHand");
editor.clearAssetChainIk(objectId, "frontLeg.near");
```

动作既可传语义槽位，也可传 GLB 中的原始动画名；表情、骨骼和人形四肢同样支持语义槽位或原始名称。通用 rig profile 另外公开具名骨链、关节限位和能力清单；`setAssetChainIk` 可控制人形以外的任意有效链。动作重定向仍要求源／目标 GLB 包含兼容蒙皮骨架；名称或静止姿态不兼容会失败并保留原动作。`assetReport` 会返回 `twoHandIk`、`footLock`、`lookIk`、`fullBodyIk`、`genericIkChains`、`semanticActions`、骨链诊断、映射与状态机。页面还暴露只读／编译边界 `window.__BLOCKOUT_AGENT_BEHAVIOR__`；它不会直接把模型输出写进场景。

七动作合同的调用示例：

```js
const boundary = window.__BLOCKOUT_AGENT_BEHAVIOR__;
const observation = boundary.observe(actorId);
const result = await boundary.submit(actorId, {
  schemaVersion: observation.behaviorContract.schemaVersion,
  action: "reach",
  actorId,
  targetId,
  hand: "both",
  requestId: "reach-cup-001",
});
// result.receipt binds command, scene and generated clips by SHA-256.
```

这层只负责观察、校验、规划、编译与回执；是否把片段加入正式时间线仍由上层 Capability Gate／人工批准决定。
