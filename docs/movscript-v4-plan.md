# MovScript V4 Plan

本文档是 V4 讨论稿。它不替代 V2/V3，而是在 V2 的“剧本预演主闭环”和 V3 的“Production Runtime”之上，进一步明确 MovScript 的长期产品形态与商业路径。

V4 的核心判断：

```text
MovScript 不应只是一个 AI 短剧工具。
MovScript 应成为一个 local-first AI Studio。
用户自带模型与 API，MovScript 负责把模型能力变成可复用、可审查、可自动化的生产工作流。
```

因此，V4 的关键不是“帮用户买到便宜 API”，而是：

```text
让用户可以自由选择模型供应商，同时在本地拥有稳定的创作资产、工作流、插件和项目记忆。
```

## 1. 背景与问题

当前 MovScript 已经具备几个重要基础：

- 桌面端 local-first 应用形态
- 后端 API 与项目状态管理
- AI provider、模型网关和功能路由
- 画布、插件、本地 agent runtime 实验
- 剧本、分镜、素材、预演、生成任务等创作对象

这些能力可以继续服务短剧和视频生产，但如果产品只被定位成“短剧生产工具”，市场会比较窄，且用户获客容易受具体内容品类影响。

V4 更适合把 MovScript 抽象为：

```text
本地 AI 创作与自动化 Studio
```

短剧、视频、文案、小说、运营、代码和知识库都可以成为 Studio 里的垂直 workflow。MovScript 的护城河不在某一个模型，也不在某一个 API 价格，而在：

- 本地项目资产
- 可复用 workflow
- 可组合插件
- 模型路由与成本控制
- 人工确认与版本管理
- 用户长期沉淀的项目记忆

## 2. 产品定位

V4 推荐定位：

```text
MovScript 是一个本地优先的 AI Studio。
用户可以接入 OpenAI、Anthropic、Gemini、本地模型、OpenAI-compatible 服务商和自定义中转服务。
MovScript 负责把这些模型组织成可审查、可复用、可自动化的生产工作流。
```

对外表达上，不建议把“中转站”和“廉价 API”作为主叙事。更稳妥的表达是：

```text
Bring your own model provider.
Bring your own API key.
Local-first AI production studio.
```

中文表达可以是：

```text
自带模型与 API Key 的本地 AI Studio
```

“低成本用 AI”可以作为用户利益点，但不应该成为品牌锚点。否则产品会被理解成 API 成本套利工具，商业天花板低，也更容易遇到稳定性、隐私、条款和支付纠纷风险。

## 3. 商业判断

V4 的商业化不应依赖 API 差价。

原因：

- API 差价空间会被供应商、竞争者和用户直接压缩
- 中转服务稳定性不可控
- 一旦产品负责推荐或售卖中转服务，就会承担额外信任成本
- 用户为“便宜”而来，也容易因为更便宜的渠道离开

更合理的商业核心是：

```text
免费降低进入门槛，收费捕获高频生产力价值。
```

也就是说：

```text
API 自由接入是获客能力
Studio 工作流与生产资产是付费理由
```

## 4. 目标用户

V4 初期不建议泛化到所有 AI 用户。应优先抓住愿意为本地工作台付费、且有持续生产需求的人群。

### 4.1 第一优先级：AI 内容生产者

包括：

- 短剧和视频创作者
- 小红书、抖音、B 站、YouTube 内容团队
- 文案、脚本、广告创意生产者
- 小说、短故事、IP 设定创作者

他们的痛点不是“问 AI 一个问题”，而是：

```text
持续产出、保持风格、管理素材、复用流程、控制成本、批量生成。
```

### 4.2 第二优先级：AI 自动化重度用户

包括：

- 独立开发者
- 增长运营
- SEO 内容团队
- 研究和资料整理用户
- 小团队内部工具使用者

他们需要的是：

```text
多模型接入、任务队列、插件、知识库、文件系统能力和可复用 workflow。
```

### 4.3 后续优先级：团队与企业

团队版可以更晚切入。企业客户需要权限、审计、私有化和支持体系，这会显著增加复杂度，不适合作为 V4 起步主线。

## 5. 产品原则

### 5.1 Local-first 是战略，不只是部署方式

V4 要让用户明确感知：

```text
我的项目、素材、workflow、配置和记忆主要在我自己的机器上。
```

这带来几个优势：

- 用户可自带 API Key
- 本地文件访问自然
- 隐私和控制感更强
- 可支持本地模型
- 单机用户的边际服务成本低

云服务应作为增值层，而不是基础依赖。

### 5.2 Provider 自由，但不为供应商背书

MovScript 应提供标准化 provider 配置能力：

- 官方模型供应商
- OpenAI-compatible endpoint
- 本地模型服务
- 自定义 API base URL
- 多 key 轮换
- 请求超时、重试、并发和预算配置

但产品不应默认推荐灰色或不稳定渠道。文案上只表达“兼容自定义模型服务”，不承诺第三方中转服务质量。

### 5.3 Workflow 是核心资产

聊天不是 V4 的核心资产。真正能沉淀价值的是：

```text
workflow template
project memory
prompt asset
plugin integration
output artifact
human review decision
```

用户一旦在 MovScript 中沉淀了这些资产，就不只是为了便宜 API 使用产品。

### 5.4 AI 产出必须可审查、可采用、可回滚

延续 V3 原则，AI 生成内容默认是候选，不直接污染事实源。

典型状态：

```text
candidate -> accepted
candidate -> revised -> accepted
candidate -> rejected
```

这个机制应贯穿剧本、分镜、素材、知识库、自动化任务和 workflow 输出。

### 5.5 先做高频闭环，再做开放平台

插件市场、模板市场、团队协作都很重要，但 V4 初期应先把几个高频 workflow 做到足够好。

推荐第一批高频闭环：

- 剧本到分镜预演
- 文案到多平台内容包
- 长文/资料到结构化知识卡片
- 批量图像/视频生成任务管理
- 多模型成本与质量对比

## 6. V4 功能范围

### 6.1 Local Studio Shell

V4 的主界面不应只是短剧项目管理，而应变成 Studio 工作台。

建议一级结构：

```text
Projects
Workflows
Assets
Models
Runs
Plugins
Settings
```

对于短剧生产，可以作为一个 project type 或 workspace template：

```text
Video Production Project
Script Preview Project
Content Campaign Project
Knowledge Project
Automation Project
```

### 6.2 Model Provider Hub

模型配置应升级为用户最常访问的基础能力之一。

需要支持：

- Provider 列表
- API Key 管理
- OpenAI-compatible 配置
- 本地模型 endpoint
- 模型能力标签
- 价格和上下文长度配置
- 连通性测试
- 调用日志
- 成本统计
- fallback 策略

长期应支持模型画像：

```text
cheap text model
strong reasoning model
image generation model
video generation model
embedding model
local private model
```

### 6.3 Model Router

V4 的关键商业能力之一是模型路由，而不是单纯 provider 配置。

路由能力包括：

- 按任务类型选择模型
- 按预算选择模型
- 按质量等级选择模型
- 失败自动切换
- 超时自动切换
- 简单任务走便宜模型
- 高价值步骤走强模型
- prompt cache 与结果缓存
- 每个 workflow 的成本上限

用户价值：

```text
不用每一步手动选模型，也不用把所有任务都交给最贵模型。
```

### 6.4 Workflow Runtime

V3 的 Production Runtime 在 V4 中应泛化为 Workflow Runtime。

它负责：

- 解析用户目标
- 编排步骤
- 调用模型、插件和本地工具
- 生成候选结果
- 进入人工确认
- 写入项目状态
- 记录运行日志
- 支持重跑、跳过、回滚

Workflow 不应该一开始追求复杂节点编辑器。更实用的起点是：

```text
模板化 workflow + 参数表单 + 运行记录 + 审批点
```

画布可以作为高级编辑方式，但不应成为所有用户的默认入口。

### 6.5 Template Library

模板库是商业化重点。

模板类型：

- 短剧拆解模板
- 分镜脚本模板
- 小红书内容包模板
- 抖音短视频脚本模板
- YouTube 视频脚本模板
- 小说世界观模板
- SEO 文章集群模板
- 代码审查模板
- 资料整理模板

模板应包含：

- 输入字段
- prompt 资产
- workflow 步骤
- 推荐模型能力
- 成本预估
- 输出 artifact 类型
- 审批点
- 示例结果

### 6.6 Project Memory

V4 应把“记忆”产品化，而不是只作为 agent 内部能力。

项目记忆包括：

- 人物设定
- 风格规则
- 品牌规则
- 禁用词和偏好
- 历史采用结果
- 用户修改习惯
- 常用素材
- 成功案例

记忆必须可视化、可编辑、可删除、可导入导出。

### 6.7 Asset And Artifact Manager

Studio 的核心不是只生成文本，而是管理生产资产。

需要区分：

```text
Asset: 用户提供或锁定的素材
Artifact: workflow 或模型生成的产物
Candidate: 尚未采用的候选结果
Reference: 给模型使用的参考资料
```

这会让 MovScript 从聊天工具变成生产工具。

### 6.8 Plugin System

插件能力应服务真实生产流，而不是只作为开发者特性。

第一批推荐插件方向：

- 文件系统导入导出
- Obsidian / Markdown
- Notion
- 浏览器剪藏
- 视频剪辑工具导出
- 本地模型服务
- 图片压缩和格式转换
- 字幕和语音处理

插件市场可以晚于本地插件机制，但插件接口要尽早稳定。

## 7. 商业模型

### 7.1 Free Local

免费版目标是获客和建立信任。

建议免费提供：

- 本地项目
- 基础 provider 配置
- 基础聊天和 workflow 运行
- 基础短剧/文案模板
- 本地文件资产管理
- 有限运行历史

免费版要足够有用，否则无法积累用户。

### 7.2 Pro Subscription

个人 Pro 是 V4 最现实的第一收入来源。

Pro 可收费能力：

- 高级 workflow
- 无限模板保存
- 批量运行
- 高级模型路由
- 成本统计
- prompt 和结果缓存
- 长项目记忆
- 多项目搜索
- 高级导出
- 本地自动化任务队列
- 高级插件能力

推荐价格可以后续测试，不宜一开始过高。早期重点是验证：

```text
用户是否愿意为 workflow 和本地生产力付费。
```

### 7.3 Template Marketplace

模板市场是长期商业重点。

模式：

- 官方模板包
- 创作者模板售卖
- 订阅制模板库
- 单个 workflow 购买
- 平台抽成

市场成功的前提不是“模板很多”，而是模板真的能交付生产结果。

早期应先做官方精选模板，验证付费，再开放第三方创作者。

### 7.4 Cloud Sync

云服务应作为可选增值项。

可收费能力：

- 项目同步
- workflow 同步
- 模板同步
- 加密备份
- 多设备历史
- 团队共享工作区

注意：云同步不应破坏 local-first 信任。用户应能选择完全离线使用。

### 7.5 Team / Business

团队版适合作为第二阶段收入。

可收费能力：

- 团队成员与权限
- 共享 provider 配置
- 统一成本统计
- 审批流
- 审计日志
- 团队模板库
- 私有插件
- 内网部署支持

团队版要避免过早拖慢个人版迭代。

### 7.6 Enterprise / Private Deployment

企业版适合更晚阶段。

价值点：

- 私有化部署
- 内部模型网关
- 数据不出内网
- 合规审计
- 专属支持
- 定制 workflow

这条路客单价高，但会带来实施和支持负担，应在核心产品已稳定后再系统推进。

## 8. 不做什么

V4 初期不建议做：

- 直接售卖灰色中转 API
- 把产品包装成 API 代理站
- 过早做复杂节点图平台
- 过早做企业权限系统
- 过早泛化到所有行业
- 过早开放无审核模板市场
- 把聊天作为唯一入口
- 把云端账号作为本地使用前置条件

这些方向不是永远不能做，而是不适合作为 V4 的主矛盾。

## 9. 路线图

### 9.1 Phase 0: 定位收敛

目标：

```text
把 MovScript 从“短剧生产工具”升级为“本地 AI Studio”，但保留短剧作为第一垂直场景。
```

交付：

- V4 产品定位文案
- 信息架构草图
- 免费版 / Pro 版能力边界
- 第一批 workflow 模板列表
- provider 和 router 的产品定义

### 9.2 Phase 1: Local Studio MVP

目标：

```text
用户可以安装桌面端，配置自己的模型服务，运行第一批可复用 workflow。
```

交付：

- Studio 首页
- Provider Hub
- OpenAI-compatible provider 配置
- 模型连通性测试
- 基础 workflow runner
- 运行历史
- 项目资产和 artifact 管理
- 3 到 5 个官方 workflow 模板

推荐 MVP 模板：

- 剧本到分镜预演
- 短视频脚本生成
- 小红书内容包
- 长文资料整理
- 批量 prompt 运行

### 9.3 Phase 2: Pro 能力验证

目标：

```text
验证个人用户是否愿意为高级 workflow、批量运行、模型路由和项目记忆付费。
```

交付：

- Pro 开关
- 高级 workflow 保存
- 批量运行
- 成本统计
- 模型 fallback
- 项目记忆可视化
- 本地搜索
- 高级导出

关键指标：

- 激活用户中运行 workflow 的比例
- 7 日内二次打开率
- 每个活跃用户的 workflow 运行次数
- Pro 试用转化率
- 用户是否主动创建或修改模板

### 9.4 Phase 3: Template Economy

目标：

```text
让 workflow 模板成为 MovScript 的长期资产和商业来源。
```

交付：

- 官方模板库
- 模板打包格式
- 模板导入导出
- 模板评分和示例结果
- 创作者结算规则草案
- 市场审核机制

早期市场可以先不做完整支付系统，而是先做 curated template pack。

### 9.5 Phase 4: Cloud And Team

目标：

```text
在不破坏 local-first 的前提下，提供云同步和团队协作。
```

交付：

- 可选云账号
- 加密同步
- 多设备项目同步
- 团队 workspace
- 共享模板库
- 成本统计和审计

## 10. 技术方向

### 10.1 架构分层

推荐 V4 分层：

```text
Electron Renderer
  Studio UI、项目页面、workflow 表单、候选审查、运行历史

Electron Main / Local Sidecar
  Workflow Runtime、provider 调用、本地文件访问、插件 host、缓存

Backend API
  Canonical state、账号、云同步、团队、市场、远程任务

Shared Packages
  domain schema、workflow schema、provider contract、plugin SDK、UI primitives

Models / Providers / Plugins
  官方模型、本地模型、OpenAI-compatible endpoints、第三方工具
```

### 10.2 Workflow Schema

V4 应定义稳定的 workflow schema。

至少包括：

- id/name/version
- inputs
- steps
- model requirements
- tools/plugins
- approval gates
- output artifacts
- cost estimate
- cache policy
- permissions

### 10.3 Provider Contract

Provider contract 应与 OpenAI-compatible 兼容，但不要被它完全限制。

需要抽象：

- text generation
- structured output
- embedding
- image generation
- image edit
- video generation
- audio / speech
- file upload
- model listing
- usage reporting

### 10.4 Local Data Boundary

V4 必须明确哪些数据默认本地，哪些可以同步。

默认本地：

- API Key
- 本地 provider 配置
- 本地文件路径
- 原始素材
- 项目草稿
- workflow 运行中间结果

可选同步：

- 模板
- 项目结构
- 已选择同步的 artifact
- 用户偏好
- license 状态

不应默认上传：

- 用户 API Key
- 未授权素材
- 私有项目文件
- 本地模型调用内容

## 11. 风险与边界

### 11.1 API 中转风险

用户自定义 endpoint 是必要能力，但官方叙事应保持中性：

```text
支持 OpenAI-compatible 和自定义模型服务。
```

不建议：

- 官方推荐不可信中转站
- 官方代售第三方 API 余额
- 用“最低价 API”作为主卖点

### 11.2 产品过宽风险

AI Studio 很容易变成什么都做。V4 要坚持：

```text
先用少数高频 workflow 证明价值，再开放更多场景。
```

### 11.3 本地与云的信任风险

local-first 用户对隐私和控制感敏感。任何云能力都应透明、可选、可关闭。

### 11.4 模板质量风险

模板市场如果质量差，会损害产品信任。早期应强运营、强审核、少而精。

### 11.5 成本统计准确性风险

不同 provider 的 usage 和计价方式差异很大。V4 初期可以提供估算，但必须标明数据来源和置信度，避免让用户误以为是绝对账单。

## 12. 成功标准

V4 是否成立，不看“支持了多少模型”，而看：

- 用户是否愿意把真实项目放进 MovScript
- 用户是否重复运行 workflow
- 用户是否沉淀自己的模板
- 用户是否愿意为 Pro 能力付费
- 用户是否因为项目记忆、资产和 workflow 留存
- 用户是否把 MovScript 当成本地 AI 工作台，而不是一次性生成工具

阶段性指标：

```text
Activation: 完成 provider 配置并成功运行第一个 workflow
Retention: 7 天内回到同一项目继续工作
Value: 每周至少运行 3 次 workflow
Monetization: Pro 试用到付费转化
Asset depth: 每个活跃项目沉淀模板、素材、记忆或 artifact
```

## 13. 一句话总结

V4 的商业核心不是卖 API，也不是做聊天壳。

```text
MovScript V4 要卖的是本地 AI 生产力系统：
用户自带模型，MovScript 提供 workflow、资产、记忆、插件、路由和审查机制。
```

