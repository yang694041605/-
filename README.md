# 囍映 AI 婚礼微电影创作台 1.0

本地婚礼微电影生产工作台。支持 14 步制作向导、素材中心、五幕故事采集、12 套造型模板、故事与 24 FPS 分镜、视频模板入库、模型配置、文字/图片/视频生成、语音、原创配乐、FFmpeg 成片和可编辑工程。

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
- 内置 8 个 VVV Remotion 婚礼模板预览，可套用风格参数或从婚礼照片创建可编辑 Remotion 工程。

## 14 步向导

流程固定为：

```text
故事采集 → 文案初稿 → 新人确认 → 音色试听 → 完整旁白
→ 分镜设计 → 三个重点静帧 → 剩余图片 → 图生视频
→ BGM 试听 → 试混 → 完整混音 → 字幕预览 → 正式交付
```

每次只推进一个确认步骤。素材不满足时按钮不会放行，确认时间和版本会随项目保存。

## 素材中心

素材中心集中管理婚礼照片、故事采集卡、服装参考、场景参考、视频、音乐、旁白、字幕、成片和可编辑工程。故事采集卡位于 [`public/story-intake.html`](public/story-intake.html)。

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

## 开源技能

- `wedding-video-guided-wizard`：五幕故事和 14 步人工确认方法。
- `vvv`：8 个 Remotion 婚礼模板和可编辑工程。
- `ffmpeg-skill`：42 个本地媒体工具与交付检查。

详细核验结果见 [开源技能整合说明](docs/开源技能整合说明.md)。

第三方来源与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

完整参考视频分析见 [逐帧分析报告](output/douyin-wedding-ai/逐帧分析报告.md)，产品与桌面版方案见 [智能体设计说明](docs/婚礼微电影智能体设计说明.md)。
