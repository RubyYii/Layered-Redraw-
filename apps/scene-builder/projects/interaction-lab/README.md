# 十秒交互仿真实验室

这个项目是 Scene Builder 的连续交互验收夹具。它只验证一个纵向切片：角色 A 接近交互杯、建立抓取约束、连续携带、把所有权交给角色 B，角色 B 再把杯子稳定释放到放置台。

## 重建和打开

```powershell
npm run build:interaction-demo
npm run dev
```

在右上角更多菜单选择“载入十秒交互仿真”，或者载入生成的 `interaction-simulation.blockout.json`。时间线长度固定为 10 秒，播放时使用 60Hz 固定步进；固定 30fps 视频使用：

```powershell
npm run render:interaction-demo:video30
```

渲染命令会同时生成 `artifacts/interaction-simulation/interaction-simulation-30fps.simulation-package/`。包内含视频独立副本、300 帧加终点采样的状态轨迹、三次所有权转换、碰撞报告、六张关键帧、离线 3D 回放器与哈希验证器。进入包目录运行 `node verify-delivery.mjs` 应返回 `PASS`；再运行 `node serve-replay.mjs` 可逐帧检查。

## 验收边界

- 三个合法转换必须依次为 `claim → transfer → release`。
- 物品位置由角色／物品／接触面的语义锚点求解，非法持有者不能交接或释放。
- 每个 60Hz 采样点都必须通过胶囊／箱体代理的残余穿透检查；离线渲染还会保存拾取、两段携带、交接、放置和完成六张关键帧。
- 当前后端是离散、确定性的运动学约束求解器，不是 Rapier 刚体世界；它不会模拟连续碰撞、重力、冲量或摩擦堆叠。
- 灰模执行器会落在物品表面并驱动伸缩臂；导入 GLB 仍只播放映射动作，尚未进行全身或手指 IK。
