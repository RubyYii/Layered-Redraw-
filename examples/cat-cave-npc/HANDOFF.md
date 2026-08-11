# 狸花*保单 NPC Cave Scene 02 — 多图层交付

## 打开与编辑

- 在 Krita 或 GIMP 中打开 `NPC-Cave-Scene-02.ora`，可以直接查看和修改 10 个命名图层。
- 在 Aseprite 或 Pixelorama 中编辑 `layers/` 下的 PNG。所有文件均为 384×216；上层使用二值透明，变换和缩放请使用最近邻采样。
- `layers/index.json` 与 10 个 PNG 是正式源文件；`artwork.png` 和 `preview.png` 是派生预览。

## 图层顺序（底 → 顶）

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

## 修改后重新合成

```powershell
C:\ProgramData\Anaconda3\python.exe skills\redraw-in-layers\scripts\layered_redraw.py compose examples\cat-cave-npc
C:\ProgramData\Anaconda3\python.exe skills\redraw-in-layers\scripts\layered_redraw.py validate examples\cat-cave-npc --write-manifest
```

保持 32 色共享色板、Alpha 仅为 0/255、所有图层尺寸一致。名字必须为“狸花*保单”，对白必须为“找本喵干什么”。
