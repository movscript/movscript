# MoneyPrinterTurbo 架构接入蓝图

本文说明如何把 MoneyPrinterTurbo 的“主题到短视频”生产链路接入 Movscript，并把它扩展成可商业化的短剧/短视频生产闭环。

结论先行：不建议把 MoneyPrinterTurbo 的 FastAPI + Streamlit + Python 服务原样嵌入 Movscript。Movscript 已经有项目、脚本、资源、模型配置、任务、插件、Agent skill、用量计费和本地桌面壳。更合适的方式是重新实现核心生产编排，把 MoneyPrinterTurbo 当作功能参考和算法参考。

## 目标定位

MoneyPrinterTurbo 做的是一条轻量短视频流水线：

```text
主题/文案
  -> LLM 生成脚本
  -> LLM 生成素材搜索词
  -> TTS 生成旁白
  -> 字幕时间轴
  -> Pexels/Pixabay/本地素材
  -> MoviePy/FFmpeg 合成
  -> 可选发布到平台
```

Movscript 要做的不应只是“一键生成视频”，而是把这条链路嵌入商业工作流：

```text
选题/客户 brief
  -> 剧本与短视频脚本
  -> 分镜/镜头/资源需求
  -> 模型生成与素材采购
  -> 旁白/字幕/剪辑/成片
  -> 审片/版本/交付
  -> 发布/数据回流
  -> 成本/配额/套餐/复购
```

## 当前 Movscript 可承接的模块

Movscript 已有的模块与 MoneyPrinterTurbo 能力可以这样映射：

| MoneyPrinterTurbo 能力 | Movscript 落点 | 接入方式 |
| --- | --- | --- |
| 视频脚本生成 | `script`、`semantic`、Agent skill | 用模型网关生成结构化脚本和镜头单元 |
| 搜索词生成 | `shotreference`、`semantic.AssetCandidate` | 生成素材需求和候选素材查询 |
| 视频生成任务 | `job`、`infra/runner` | 作为新的 pipeline job 或 workflow job |
| 模型供应商 | `infra/ai`、model gateway | 复用模型配置、凭据、用量预估 |
| 本地/远程素材 | `resource`、`externalresource` | 素材入库、绑定到项目、形成可追溯资源 |
| 插件工具 | `plugins/*`、`plugin-sdk` | 暴露“一键短视频”或分步骤工具 |
| Agent 协作 | `apps/agent/src/skills` 与插件 skill contribution | 用 skill 驱动选题、脚本、分镜、审片 |
| 任务状态 | `job` 表、worker、WebSocket/页面轮询 | 不再用独立内存/Redis 状态 |
| 成本控制 | `usage`、`entitlement`、model pricing | 形成商业套餐和项目成本核算 |

## 建议架构

### 1. 不直接迁移的部分

以下部分不要照搬：

- Streamlit WebUI：Movscript 已有 Electron + React 前端。
- FastAPI 任务接口：Movscript 已有 Go HTTP handler、job service、worker。
- Python 内存/Redis 任务状态：Movscript 已有数据库任务和 runner。
- 单一 `VideoParams` 大对象：Movscript 应拆成脚本、素材、旁白、字幕、渲染配方等领域对象。
- 直接返回本地文件路径：Movscript 应统一用 Resource ID 和存储服务。

### 2. 可以复用的设计思想

以下思想值得保留：

- 一条可中断流水线：`script`、`terms`、`audio`、`subtitle`、`materials`、`render` 都能独立执行。
- 模型供应商抽象：文本、语音、视频、图片都通过 provider adapter 统一接入。
- 任务进度与阶段事件：用户需要看到当前卡在脚本、素材、TTS 还是渲染。
- 本地素材优先：商业用户通常有自有素材库，在线 stock 只是补充。
- 成片参数标准化：比例、时长、字幕样式、BGM、转场、视频数量都应成为可保存模板。

## 新增领域模型建议

第一阶段不一定全部建表，但需要先稳定概念。

### ShortVideoBrief

用户输入或 Agent 整理后的生产需求。

字段建议：

- `project_id`
- `campaign_id`
- `title`
- `target_platform`: `douyin`、`tiktok`、`bilibili`、`xiaohongshu`、`reels`
- `audience`
- `tone`
- `language`
- `duration_sec`
- `aspect_ratio`
- `business_goal`: 引流、成交、品牌曝光、素材测试
- `constraints`: 禁用词、品牌规范、素材限制

### ScriptUnit

短视频脚本结构，不要只保存一段纯文本。

字段建议：

- `hook`
- `beats[]`
- `cta`
- `voiceover_text`
- `onscreen_text[]`
- `estimated_duration_sec`

### AssetNeed

从脚本和分镜中抽取的素材需求。

字段建议：

- `scene_id`
- `query_terms`
- `visual_description`
- `required_type`: video、image、audio
- `license_policy`
- `priority`

### RenderRecipe

渲染配方，是可复用、可审计的成片配置。

字段建议：

- `script_resource_id`
- `voiceover_resource_id`
- `subtitle_resource_id`
- `material_resource_ids[]`
- `bgm_resource_id`
- `aspect_ratio`
- `resolution`
- `clip_duration_sec`
- `concat_mode`
- `transition_mode`
- `subtitle_style`
- `output_count`

### DeliveryRecord

商业闭环需要记录交付与发布。

字段建议：

- `resource_id`
- `platform`
- `publish_status`
- `published_url`
- `caption`
- `metrics_snapshot`
- `client_approval_status`

## 后端接入设计

### 1. 新增 pipeline job 类型

当前 job 支持 `image`、`image_edit`、`video`、`video_i2v`、`video_v2v`。MoneyPrinterTurbo 这种任务不是单一模型调用，而是多步骤编排，建议新增内部 job type：

```text
short_video_pipeline
```

或者保持 `job_type=video`，用 `feature_key=short_video.pipeline` 区分。但从语义上看，新增 pipeline 类型更清晰，因为它会调用多个模型、下载素材、渲染本地文件。

建议阶段状态：

```text
brief_received
script_generating
script_ready
asset_terms_generating
asset_collecting
voiceover_generating
subtitle_generating
render_recipe_building
rendering
review_ready
publishing
succeeded
failed
cancelled
```

每个阶段都写入 `debug_info` 或新的 `pipeline_events`，前端 jobs 页面可以展示细粒度进度。

### 2. Pipeline service

建议新增应用层服务：

```text
apps/backend/internal/app/shortvideo/
  service.go
  pipeline.go
  script.go
  asset_need.go
  recipe.go
  publishing.go
```

职责：

- 校验 brief、权限、项目归属。
- 调用模型网关生成脚本与素材需求。
- 调用素材供应商或本地素材库检索资源。
- 创建 TTS、字幕和渲染子任务。
- 生成 `RenderRecipe` 并交给 renderer 执行。
- 汇总输出为 Resource，并绑定项目/脚本/镜头。

不要让 handler 直接拼流水线，也不要让插件直接操作文件系统。

### 3. Runner 扩展

当前 worker 已经能处理供应商异步视频任务。短视频 pipeline 需要两类 worker：

- `PipelineWorker`：负责步骤编排、重试、取消、事件记录。
- `RenderWorker`：负责本地 FFmpeg/MoviePy 或独立渲染服务。

如果 Go 内直接调用 FFmpeg，建议先只做剪辑拼接、音频混合、字幕烧录。复杂字幕排版、图片 Ken Burns、转场等可以放在独立 renderer sidecar，避免 Go worker 被 Python/FFmpeg 依赖污染。

推荐 renderer 边界：

```http
POST /render
{
  "recipe": { ... },
  "inputs": [
    { "resource_id": 1, "local_path": "..." }
  ],
  "output": {
    "format": "mp4",
    "resolution": "1080x1920"
  }
}
```

返回：

```json
{
  "status": "succeeded",
  "file_path": "/tmp/movscript-render/final.mp4",
  "duration_sec": 42.3,
  "debug": {}
}
```

### 4. TTS 与字幕能力

MoneyPrinterTurbo 把 TTS 和字幕耦合得比较紧：TTS 返回边界信息，字幕从边界生成。Movscript 应拆成两个能力：

- `audio_tts`: 输入文本、voice、rate、volume，输出音频 Resource 和 timing metadata。
- `subtitle_transcribe` / `subtitle_align`: 输入音频和脚本，输出 SRT/VTT Resource。

实现优先级：

1. 云端 TTS：Azure、Edge TTS、Gemini、SiliconFlow。
2. 本地字幕：faster-whisper sidecar。
3. 字幕对齐：先用 TTS timing，失败再 whisper。

### 5. 素材供应商

MoneyPrinterTurbo 支持 Pexels/Pixabay。Movscript 应抽象为 `AssetProvider`：

```go
type AssetProvider interface {
  Search(ctx context.Context, query AssetSearchQuery) ([]AssetCandidate, error)
  Import(ctx context.Context, candidate AssetCandidate) (ResourceID, error)
}
```

第一批 provider：

- LocalResourceProvider：项目资源库和镜头参考库。
- PexelsProvider。
- PixabayProvider。
- ManualUploadProvider。

商业版本再加：

- 授权素材站。
- 企业私有素材库。
- 品牌素材库。
- 历史高转化素材库。

## 前端接入设计

### 1. 不做独立 Streamlit 页面

应接入已有页面：

- `ScriptsPage`: 脚本生成与改写。
- `ShotLibraryPage`: 镜头参考和素材候选。
- `JobsPage`: pipeline 进度和失败恢复。
- `ResourcesPage`: 成片、旁白、字幕、素材统一管理。
- `AgentModePage`: 一句话发起完整生产。

### 2. 新增 Short Video Workbench

建议新增一个工作台页面：

```text
apps/frontend/src/pages/short-video/ShortVideoWorkbenchPage.tsx
```

首屏不是营销页，而是生产界面：

- 左侧：Brief、平台、目标受众、品牌限制。
- 中间：脚本、分镜、素材需求、候选素材。
- 右侧：参数模板、成本预估、生成按钮、版本列表。
- 底部：任务阶段日志和可恢复错误。

### 3. 插件入口

已有 `plugins/video-generator` 是单模型视频生成。短视频 pipeline 应新增插件：

```text
plugins/short-video-pipeline/
```

工具建议：

- `generate_short_video_script`
- `collect_short_video_assets`
- `generate_voiceover`
- `render_short_video`
- `one_click_short_video`

插件的 `compile()` 输出应是可执行计划，`run()` 调后端 pipeline API，不直接拼本地文件。

## Agent skills 设计

当前 skill 体系可以承接商业工作流，但需要补齐面向短视频生产的技能包。

建议新增第一方 skills：

```text
plugins/short-video-pipeline/agent-skills/
  short-video-producer/SKILL.md
  short-video-scriptwriter/SKILL.md
  asset-researcher/SKILL.md
  render-qa/SKILL.md
  publishing-operator/SKILL.md
```

### short-video-producer

职责：

- 把用户的自然语言需求整理成 `ShortVideoBrief`。
- 判断目标平台、时长、比例、内容风险。
- 选择模板：带货、知识、剧情、口播、图文混剪。
- 触发后续 workflow。

### short-video-scriptwriter

职责：

- 生成 hook、主体节奏、CTA。
- 输出结构化脚本，不只输出纯文本。
- 根据平台限制控制字数和时长。
- 支持多版本 A/B 脚本。

### asset-researcher

职责：

- 从脚本抽取素材需求。
- 先查项目素材和镜头库，再查外部 stock。
- 标注授权风险、匹配度、替代方案。

### render-qa

职责：

- 检查字幕遮挡、时长、黑帧、静音、分辨率、品牌词。
- 输出可执行修复建议。
- 必要时生成二次渲染配方。

### publishing-operator

职责：

- 生成标题、caption、hashtag、发布时间建议。
- 对接发布渠道或导出交付包。
- 记录发布链接和数据回流字段。

## 商业闭环

要做商业闭环，不能只完成生成。需要把“用户愿意付费的价值链”闭上。

### 1. 获客与转化

入口产品形态：

- 一句话生成短视频。
- 上传商品/品牌资料生成营销视频。
- 短剧片段二创/切条。
- 批量 A/B 素材测试。
- 企业素材库自动混剪。

免费层：

- 限制输出水印、分辨率、月度生成次数。
- 提供少量低成本模型。
- 允许导出脚本和分镜，但限制高清成片。

付费层：

- 去水印。
- 高清导出。
- 批量生成。
- 商用素材源。
- 品牌模板。
- 团队协作和客户审片。
- 发布与数据回流。

### 2. 成本与计费

每条视频都应形成成本账本：

```text
LLM token
TTS seconds/chars
subtitle/transcription minutes
stock asset import
render minutes
storage
publish connector
```

Movscript 已有 usage/admin 方向，短视频 pipeline 应在每个阶段预估和结算：

- 生成前：显示预计消耗。
- 生成中：按阶段冻结额度。
- 成功后：结算实际额度。
- 失败后：释放未使用额度。

### 3. 复购与留存

闭环关键是让每次成片沉淀为下次生产资产：

- 脚本模板沉淀。
- 高表现素材沉淀。
- 客户品牌规范沉淀。
- 平台发布数据沉淀。
- Agent 记忆沉淀。
- 一键复刻/改写/换平台/换比例。

### 4. 交付

商业客户需要的不只是 mp4：

- 成片 mp4。
- 字幕 srt/vtt。
- 封面图。
- 标题/caption/hashtag。
- 素材授权记录。
- 生成参数和模型记录。
- 客户审片链接。
- 发布记录。

因此输出应是 `DeliveryPackage`，而不是单个视频文件。

## MVP 路线

### Phase 0: 契约与文档

- 定义 `ShortVideoBrief`、`ScriptUnit`、`AssetNeed`、`RenderRecipe` JSON schema。
- 新增短视频 Agent skills。
- 新增短视频插件 manifest。
- 明确 resource、job、usage 的字段映射。

### Phase 1: 低风险原型

目标：先跑通“已有素材 + TTS + 字幕 + FFmpeg 合成”。

范围：

- 用户输入脚本或 brief。
- 使用项目内本地素材。
- 云端 TTS。
- TTS timing 生成字幕。
- FFmpeg 渲染成片。
- 输出 Resource。

暂不做：

- 外部素材搜索。
- 自动发布。
- 高级转场。
- Whisper 自动转写。

### Phase 2: 素材和多模型

- 接入 Pexels/Pixabay provider。
- 支持脚本自动生成素材需求。
- 支持多版本视频生成。
- 支持 caption/封面生成。
- 支持失败阶段重试。

### Phase 3: 商业闭环

- 客户 brief 模板。
- 团队/客户审片。
- 套餐、配额、成本账本。
- 发布渠道。
- 数据回流。
- 高表现素材推荐。

### Phase 4: 企业版

- 企业私有素材库。
- 品牌合规和敏感词。
- 多账号发布。
- 权限和审计。
- 本地 GPU renderer。
- 私有部署模型和素材源。

## API 草案

### 创建短视频 pipeline

```http
POST /api/short-videos
```

```json
{
  "project_id": 1,
  "brief": {
    "title": "新品咖啡杯带货视频",
    "target_platform": "douyin",
    "audience": "25-35 岁通勤人群",
    "business_goal": "成交",
    "language": "zh-CN",
    "duration_sec": 30,
    "aspect_ratio": "9:16"
  },
  "options": {
    "script_mode": "auto",
    "asset_source": "project_then_stock",
    "voice": "zh-CN-XiaoxiaoNeural",
    "subtitle_style_id": "default-bold",
    "output_count": 3
  }
}
```

返回：

```json
{
  "job_id": 123,
  "status": "pending"
}
```

### 查询 pipeline

```http
GET /api/short-videos/jobs/:job_id
```

```json
{
  "job_id": 123,
  "status": "running",
  "stage": "asset_collecting",
  "progress": 42,
  "events": [],
  "outputs": {
    "script_resource_id": 10,
    "voiceover_resource_id": 11,
    "rendered_resource_ids": []
  }
}
```

## 风险与边界

### 技术风险

- FFmpeg 渲染在桌面端和服务端路径差异大，需要统一 renderer contract。
- TTS timing 不稳定时，字幕需要 fallback 到 whisper。
- 在线素材有授权和可访问性问题，必须记录来源和 license。
- 多模型调用成本不可控，必须先做预估和限额。

### 产品风险

- “一键生成”容易变成玩具。商业用户真正需要的是可控、可审片、可复用。
- 不同平台规则差异大，脚本和导出参数要平台化。
- 自动发布涉及账号授权和平台风控，MVP 应先做交付包。

### 合规风险

- 素材版权。
- 生成内容合规。
- 平台自动发布条款。
- 客户品牌资产权限。
- 用户上传素材的隐私与删除。

## 推荐优先级

最短可落地路径：

1. 新增 `short-video-pipeline` 文档、schema、插件壳、skills。
2. 后端新增 `shortvideo` app service，但第一版只用本地素材。
3. Renderer 先做独立进程/sidecar，用 FFmpeg 完成合成。
4. 输出全部进入 Resource，Job 页面展示阶段状态。
5. 第二版再接 Pexels/Pixabay 和 Whisper。
6. 第三版接成本账本、审片、交付包。

这个路线能避免把 MoneyPrinterTurbo 的 Python 应用形态塞进 Movscript，同时保留它最有价值的生产逻辑，并把结果自然接到 Movscript 的商业化基础设施上。
