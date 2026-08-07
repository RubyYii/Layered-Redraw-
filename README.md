# Layered Redraw · 叠绘

> 讨论感觉，分层重绘。
>
> Discuss the feeling. Redraw in layers.

[简体中文](README.md) | [English](README.en.md)

![Layered Redraw：从照片到可编辑多图层 SVG](assets/readme/hero.svg)

Layered Redraw 是一个本地优先的 Codex 插件与 SVG 工程格式。它以参考照片为视觉依据，通过简短的创作访谈，将照片重新绘制为可编辑、可持续修改的多图层矢量作品。

项目默认使用 8–12 个稳定的语义图层，支持简笔画、海报、素描、水彩、油画、篆刻等不同绘制方向，并把局部修改视为受约束的图层补丁，而不是重新生成整张作品。

本项目刻意**不调用图像生成模型**。Codex 会分析参考照片、确认创作意图，然后直接编写 SVG 几何、渐变、纹理、滤镜和图层结构。

## 30 秒理解工作方式

![从参考照片到局部可修改 SVG 的四步工作流](assets/readme/workflow.svg)

## 你得到的不只是一个使用界面

<table>
  <tr>
    <td width="50%" align="center">
      <strong>可编辑的矢量作品</strong><br>
      <sub>输出本身就是可以继续修改的 artwork.svg</sub><br><br>
      <img src="examples/canal-evening/artwork.svg" alt="10 图层运河矢量示例" width="100%">
    </td>
    <td width="50%" align="center">
      <strong>语义图层编辑器</strong><br>
      <sub>选图层、框选区域或用纯文本描述修改范围</sub><br><br>
      <img src="assets/editor-preview.jpg" alt="Layered Redraw 图层编辑器" width="100%">
    </td>
  </tr>
</table>

![Layered Redraw 语义图层结构](assets/readme/layer-stack.svg)

## 最短使用方法

### 1. 安装 Skill

```powershell
git clone https://github.com/RubyYii/Layered-Redraw-.git
cd Layered-Redraw-
$skillTarget = Join-Path $env:USERPROFILE ".codex\skills\redraw-in-layers"
New-Item -ItemType Junction -Path $skillTarget -Target (Resolve-Path ".\skills\redraw-in-layers")
```

重启 Codex。

### 2. 上传照片并调用

```text
使用 $redraw-in-layers 处理本条上传的照片。
先询问我希望的感觉、风格、配色和细节程度。
确认后，生成 8–12 个语义图层的 vector-strict SVG 工程。
```

### 3. 回答创作访谈

Codex 会先确认画面情绪、构图取舍、风格、颜色、主体和细节程度，再开始绘制。默认输出 `artwork.svg`、创作简报、逐图层 Manifest 和分层导出。

### 4. 修改某个区域

启动本地编辑器，选中图层或框选区域，导出 `edit-request.json`，然后再次交给 `$redraw-in-layers`。补丁只允许修改命中的图层。

## v0.1 已包含

- `$redraw-in-layers`：引导式照片重绘与局部修改 Codex Skill。
- 严格的 SVG 工程约束：5–20 个非空顶层语义图层，通常为 8–12 个。
- 无第三方依赖的 Python 工具：校验、Manifest、分层导出、定向补丁和编辑器服务。
- 本地浏览器编辑器：图层点击、框选、纯文本模式、显示/锁定控制和 `edit-request.json` 导出。
- 一个完全由路径、图形、渐变、图案、文字和 SVG 滤镜绘制的 10 图层运河示例。
- 未修改图层哈希保护，避免一次局部调整意外重构整张作品。

当前编辑器负责**确定修改范围并生成修改请求**，不会自行理解艺术语言或直接改写 SVG。将导出的请求与工程交给 Codex，并调用 `$redraw-in-layers`，即可生成受约束补丁并验证其他图层保持不变。

## 快速体验

只需要 Python 3.10 或更高版本，无需安装第三方 Python 包。

```powershell
python skills/redraw-in-layers/scripts/layered_redraw.py validate examples/canal-evening --write-manifest
python skills/redraw-in-layers/scripts/layered_redraw.py serve examples/canal-evening --open
```

如果浏览器没有自动打开，请访问 `http://127.0.0.1:8765/`。

在编辑器中：

1. 从左侧选择语义图层，或者直接点击画布中的对象。
2. 使用“图层点击”“框选”或“纯文本”模式确定作用范围。
3. 用中文或英文描述希望发生的变化。
4. 生成并下载 `edit-request.json`。
5. 将工程和修改请求交给 Codex，调用 `$redraw-in-layers`。

## 安装并调用 Skill

开发阶段可通过 Windows 目录联接，把仓库中的 Skill 暴露给 Codex。如果同名 Skill 已存在，命令会安全失败，不会覆盖。

```powershell
$skillTarget = Join-Path $env:USERPROFILE ".codex\skills\redraw-in-layers"
New-Item -ItemType Junction -Path $skillTarget -Target (Resolve-Path ".\skills\redraw-in-layers")
```

重启 Codex，然后上传照片并输入：

```text
使用 $redraw-in-layers 处理本条上传的照片。
先进行创作意图访谈；确认方向后，生成 8–12 个语义图层的 vector-strict SVG 工程。
```

修改已有工程时：

```text
使用 $redraw-in-layers 读取这个工程和 edit-request.json。
只修改请求命中的图层，验证其他顶层图层哈希保持不变。
```

## 工程结构

```text
project-name/
├─ artwork.svg             # 可编辑的标准源文件
├─ project.json            # 输出模式、风格、种子和标准路径
├─ creative-brief.json     # 已确认的创作方向
├─ manifest.json           # 修订号与逐图层哈希
├─ layers/                 # 可重新生成的逐图层 SVG
└─ patches/                # 已应用补丁的审计记录
```

顶层图层使用通用 SVG 分组和 Inkscape 图层元数据：

```xml
<g id="layer-water"
   data-layer="true"
   inkscape:groupmode="layer"
   inkscape:label="Water">
  <!-- editable water objects -->
</g>
```

`artwork.svg` 是工程的唯一标准源文件；`manifest.json` 和 `layers/` 都是可重新生成的派生内容。

## 命令行

```powershell
# 创建一个空的 10 图层工程
python skills/redraw-in-layers/scripts/layered_redraw.py new output/my-project --title "My Project"

# 校验工程并刷新 manifest.json
python skills/redraw-in-layers/scripts/layered_redraw.py validate output/my-project --write-manifest

# 将每个语义图层导出为独立 SVG
python skills/redraw-in-layers/scripts/layered_redraw.py split output/my-project

# 预览结构化补丁，不写入文件
python skills/redraw-in-layers/scripts/layered_redraw.py apply-patch output/my-project patch.json --dry-run

# 应用补丁并生成审计记录
python skills/redraw-in-layers/scripts/layered_redraw.py apply-patch output/my-project patch.json
```

支持的确定性补丁操作包括 `set-attributes`、`remove-attributes`、`set-text`、`replace-element` 和 `remove-element`。每个操作都必须位于 `expected_changed_layers` 指定的图层内。

## 手工编辑

推荐使用 Inkscape 打开 `artwork.svg`，它对 SVG 图层结构的往返兼容性最好。Illustrator 和 Affinity Designer 也可以使用，但编辑后应重新运行校验，因为其他软件可能重命名 ID 或重组分组。

修改对象时，请保留顶层 `layer-*` 包装组及其稳定 ID。

## 测试

```powershell
python -m unittest discover -s tests -v
```

测试会校验示例工程、导出全部 10 个图层、在临时副本中应用单图层补丁，并确认所有未选图层的哈希保持不变。

---

[English documentation →](README.en.md)
