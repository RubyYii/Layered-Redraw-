# 狸花*保单：洞穴 NPC 多图层示例

这是一个公开、可复现的 `raster-layered` accepted-master 拆层与交付 fixture。原始私人照片未包含在仓库中；示例从审定后的 384×216、32 色像素母版开始，拆分为 10 个语义图层。它不用于证明照片到像素画的端到端效果。

This is a public, reproducible `raster-layered` accepted-master decomposition and delivery fixture. The private source photograph is intentionally excluded. It starts from the accepted 384×216, 32-colour pixel master and exposes ten semantic layers; it does not claim to reproduce the source-to-pixel-art effect.

![Final preview](preview.png)

![Layer contact sheet](assets/layer-contact-sheet.png)

## 图层 / Layers

1. 洞穴背景 / Cave background
2. 前景岩框 / Foreground rock frame
3. 洞口与远光 / Cave opening
4. 宝箱 / Treasure chest
5. 金币与宝石 / Loose treasure
6. 猫咪 NPC / Cat NPC
7. 名字牌 / Nameplate panel
8. 名字文字 / Nameplate text
9. 对话框 / Dialogue panel
10. 对白与继续标记 / Dialogue text and cursor

## 编辑 / Edit

- 用 Krita 或 GIMP 打开 [`NPC-Cave-Scene-02.ora`](NPC-Cave-Scene-02.ora)。
- Open [`NPC-Cave-Scene-02.ora`](NPC-Cave-Scene-02.ora) in Krita or GIMP.
- 使用 Aseprite 或 Pixelorama 编辑 `layers/` 下的 384×216 PNG，并保持最近邻缩放、共享 32 色板和二值透明。
- Edit the 384×216 PNG stack in `layers/` with Aseprite or Pixelorama; preserve nearest-neighbour scaling, the shared 32-colour palette, and binary alpha.

```powershell
python skills/redraw-in-layers/scripts/layered_redraw.py compose examples/cat-cave-npc
python skills/redraw-in-layers/scripts/layered_redraw.py validate examples/cat-cave-npc --write-manifest
python skills/redraw-in-layers/scripts/layered_redraw.py quality examples/cat-cave-npc
```

The default composite is pixel-identical to the accepted master. A clean checkout rebuilds this fixture idempotently and passes the engineering contract with ten layers, 32 colours, binary alpha, and no validation warnings. `design-check` reports plan-schema completeness and declared text-policy consistency only; visual quality remains `not-assessed` with `human_confirmed=false`.
