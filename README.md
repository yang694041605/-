# 囍映 AI 婚礼微电影创作台 1.0

本地婚礼微电影生产工作台。支持项目输入、人物照片、12 套造型模板、故事与 24 FPS 分镜、视频模板入库、模型配置、文字/图片/视频生成、语音、原创配乐和 FFmpeg 成片导出。

## 启动

```powershell
npm start
```

打开 <http://127.0.0.1:4173>。本地数据保存在 `data/`，不会提交到 Git。

## 模型

- 文字：Doubao Seed 2.1 Pro/Lite，另有 GPT-OSS 免费兜底。
- 图片：Seedream 5.0 Pro/Lite，另有 FLUX 免费兜底。
- 视频：Seedance 2.0 / 2.0 Fast。
- 视觉理解：Doubao Seed 2.0 Lite。
- 语音：Windows 本地中文语音、Edge TTS 适配器。
- 音乐：囍映本地原创配乐，Beatra/Suno 为待配置供应商。
- 剪辑：FFmpeg 本地引擎。

模型可在“统一模型中心”中修改模型 ID、Profile、默认项并测试连接。API Key 不进入浏览器、源码或日志。

火山方舟首次使用：

```powershell
arkcli auth login volc-sso
```

如果 Agent Plan 到期，Seedream/Seedance 请求会被火山明确拒绝。应用会保存失败任务并显示订阅状态，不会伪造生成结果。

## 模板库

- 上传 MP4/MOV/WebM 后自动做 FFprobe、封面提取、镜头切点和 24 FPS 帧数计算。
- 可直接粘贴抖音短链接，系统下载原片、作者和文案后建立模板副本。
- 模板视频与封面保存在 `data/media/templates/`。
- 深度画面理解需要可用的视觉模型；模型不可用时仍保留本地镜头切点配方。

## 成片

当前支持两条可实际导出的路线：

1. 已生成视频镜头 → 按顺序合成。
2. 婚纱照/婚礼照片 → 4 秒/张照片电影 + 旁白 + 原创 BGM + SRT 字幕。

输出为 1280×720、24 FPS、H.264 + AAC 的 MP4，并在完成后通过 FFprobe 检查视频轨、音频轨和时长。

## 校验

```powershell
npm test
npm run build
```

自动测试使用本地隔离数据和模拟能力，不调用付费模型。`npm run build` 生成 `dist/`，其中包含可直接打开的单一 HTML 预览文件；使用完整模型能力时仍需启动本地服务。

完整参考视频分析见 [逐帧分析报告](output/douyin-wedding-ai/逐帧分析报告.md)，产品与桌面版方案见 [智能体设计说明](docs/婚礼微电影智能体设计说明.md)。
