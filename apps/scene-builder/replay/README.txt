可复现仿真交付包 · 离线回放说明
================================

1. 在这个目录打开终端。
2. 运行：node serve-replay.mjs
3. 在浏览器打开命令输出的 http://127.0.0.1:4177/

交付前或收到交付包后，运行：node verify-delivery.mjs
它会重新计算全部文件哈希、大小和 simulationIdentity；只有 PASS 才表示包未被改动。

回放器不依赖原编辑器、云端服务或网络。它读取 scene.blockout.json 和
simulation.trace.jsonl 重建逐帧 3D 状态，并将 final-video.* 与碰撞、交互、
所有权记录放在同一个检查界面中。

delivery.manifest.json 记录所有文件的 SHA-256；视频是独立副本，不会随源视频
被覆盖而改变。simulationIdentity 只由场景、
资产锁、逐帧轨迹、交互和碰撞结果决定，因此不会被绝对路径、渲染耗时或硬件改变。

注意：当前仿真后端是确定性运动学 + 碰撞代理约束，不等同于刚体动力学或布料仿真。
