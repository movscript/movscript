# MovScript Admin v2 产品架构

Admin v2 的第一层产品划分不是“付费 / 免费”，也不是“初级 / 高级”，而是 **Local / Cloud**。

```text
Local = 个人 key 接入和视频闭环
Cloud = 团队 / 平台治理后台
Agent Focus = 两者里的任务辅助层，不是第三套 Admin
```

这里的 Local / Cloud 是**内容复杂度和信息架构的区别**，不是两套视觉产品。

Admin v2 必须使用同一套界面系统：

```text
同一个 Admin Shell
同一套导航样式
同一套页面标题区
同一套状态条
同一套表格、表单、详情面板、诊断面板
同一套 Agent Focus 入口
```

区别只在：

```text
Local 展示更少内容
Cloud 展示更多内容
```

换句话说，Cloud 不是另一种视觉语言，而是 Local 的扩展态。

这个划分能避免 Admin 继续膨胀成一个所有人都要理解的系统控制台。

## 1. 产品形态

| 产品形态 | 面向用户 | 产品本质 | 默认心智 |
| --- | --- | --- | --- |
| Local Admin | 本地用户、免费个人用户、自己带 key 的用户 | 个人设置中心 | 我有一个 key，我想开始做视频 |
| Cloud Admin | 团队管理员、平台管理员、运维用户 | 治理后台 | 我需要管理共享资源、成员、成本和系统能力 |

付费基础用户不是第三套 Admin。他默认不看 Admin，主要在创作 Surface 和 Agent 中完成工作。只有当 Cloud 侧需要他确认授权、额度、订阅或少量个人设置时，才打开 Agent Focus。

## 1.1 统一界面原则

Local 和 Cloud 必须长得一样，只是 Cloud 多内容。

### 1.1.1 不允许的方向

不要把 Local 做成一个“轻量设置 App”，再把 Cloud 做成另一个“SaaS 控制台”。这会导致：

- 用户从 Local 升级到 Cloud 时认知断裂
- 组件无法复用
- Agent Focus 需要适配两套页面语法
- 后续删除 v1 时迁移成本变高

### 1.1.2 正确方向

Admin v2 只有一套界面系统：

| 层 | Local | Cloud |
| --- | --- | --- |
| Shell | 相同 | 相同 |
| 顶部状态条 | 少量状态项 | 更多状态项 |
| 左侧导航 | 6 个入口 | 同样样式，增加分组和页面 |
| 页面布局 | 相同页面语法 | 相同页面语法，模块更多 |
| 表格 / 表单 / 面板 | 相同组件 | 相同组件 |
| Agent Focus | 相同入口和壳 | 相同入口和壳 |

### 1.1.3 页面增长方式

Cloud 页面应该从 Local 页面自然扩展：

```text
Local 开始
-> Cloud 启动中心：增加团队状态、Provider lanes、成本风险

Local 接入 Key
-> Cloud Provider：增加多 provider、共享凭据、成员权限

Local 视频能力
-> Cloud 生产能力 / 模型与路由：增加 route coverage、fallback、并发、成本

Local 素材中转
-> Cloud 资源与存储：增加对象存储、CDN、asset library、权限

Local 失败诊断
-> Cloud 任务与诊断：增加任务队列、provider calls、worker pool、团队维度

Local 高级
-> Cloud 系统设置 / 治理：增加用户组织、审计、配额、安全
```

这意味着设计图也应该采用同一套组件和布局，只是在 Cloud 图里展开更多导航、更多表格列、更多侧栏模块。

## 2. Local Admin

### 2.1 产品定义

Local Admin 不是传统后台，而是一个个人创作 runtime 的设置中心。

它只回答一个问题：

> 我现在能不能用自己的 key 开始做视频？

Local Admin 的默认用户一般不是平台管理员。他通常只是：

- 买了一个中转站 / 聚合站 key
- 或者有一个火山 / OpenAI 兼容 provider key
- 想把 key 填进去，然后开始生成视频

### 2.2 Local 主路径

Local 的主路径必须极短：

```text
有一个中转站 / Provider Key
-> 接入 Key
-> 应用视频创作入门模板
-> 验证文生视频
-> 如果图生视频缺公网素材，再配置素材中转
-> 回到创作
```

不要让用户先理解：

- Provider Registry
- Model Catalog
- Route Binding
- Route Group
- Priority / Weight
- Audit / Usage
- Team / Org

这些都属于高级收纳或 Cloud。

### 2.3 Local 页面

Local 只需要 5+1 个入口：

| 页面 | 主要问题 | 说明 |
| --- | --- | --- |
| 开始 | 现在能不能开始做视频？ | Readiness cockpit，不是统计首页 |
| 接入 Key | 我怎么填 key 并自动启用视频能力？ | Local 最核心页面 |
| 视频能力 | 文本、图片、文生视频、图生视频能不能用？ | 按能力看状态，不按模型对象看 |
| 素材中转 | 本地素材能不能被 provider 访问？ | 图生视频的关键前置 |
| 失败诊断 | 刚才为什么失败？我该点哪里修？ | 用户可读解释和修复动作 |
| 高级 | 我确实要改内部机制 | 收纳 provider、模型、路由、日志、系统设置 |

Local 导航：

```text
开始
接入 Key
视频能力
素材中转
失败诊断
高级
```

### 2.4 Local 首页

首页不是后台目录，而是一个最小闭环状态页。

首屏只放：

- 当前创作状态：未配置 / 可文生视频 / 可图生视频 / 完整可用
- 链路检查：Key、能力模板、文生视频、素材中转、图生视频、Worker
- 下一步：最多 3 个动作
- 最近失败：只显示会影响下一步的错误

空状态下，主按钮只有一个：

```text
接入 Key
```

### 2.5 接入 Key 页面

这是 Local 最重要的页面。

默认推荐顺序：

1. OpenAI 兼容中转站 / 聚合站
2. 火山方舟官方 API
3. 火山方舟代理 / 聚合
4. 本地 OpenAI 兼容端点

流程：

1. 选择接入类型
2. 输入 Base URL 和 API Key
3. 测试连接
4. 选择或自动匹配“视频创作入门”
5. 预览将启用的能力
6. 应用并验证

初级视图只显示：

- 已启用哪些能力
- 哪些能力还缺条件
- 下一步应该做什么

高级展开才显示：

- public model id
- provider model id
- route
- combo template

### 2.6 素材中转

素材中转必须独立成页，因为它是本地用户做图生视频最容易失败的点。

页面要先判断：

1. 中转站 / 聚合站是否已经提供可访问素材能力
2. 如果没有，MovScript 是否已配置 TOS / public relay
3. 如果都没有，图生视频应显示为“待补齐”，但不阻塞文生视频

### 2.7 Local 的高级

高级不是第二套 Admin，而是 Local 的收纳区。

可以包含：

- Provider 详情
- 模型与路由
- 参数与成本
- 存储详情
- 日志与调用
- 系统设置

高级入口应弱化，不进入用户主流程。

Local 6 个页面的详细布局、状态和动作设计见 `admin-v2-local-pages.zh-CN.md`。

## 3. Cloud Admin

### 3.1 产品定义

Cloud Admin 才是真正的 Admin。

它回答的问题是：

> 我如何管理一个团队或平台共享的 MovScript 生产系统？

Cloud Admin 面向：

- 团队管理员
- 平台管理员
- 运维
- 需要管理共享 provider / storage / route / quota 的用户

普通付费基础用户不需要进入 Cloud Admin。他在创作 Surface 和 Agent 里使用平台托管能力。

### 3.2 Cloud 主路径

Cloud 的主路径不是“填一个 key”，而是“治理共享生产能力”：

```text
接入共享 Provider
-> 配置模型与路由
-> 配置对象存储 / CDN
-> 观察任务与 provider 调用
-> 管理用量、成本、配额
-> 管理用户、组织、权限
-> 审计和系统设置
```

### 3.3 Cloud 页面

Cloud 导航可以完整，但必须按治理任务分组。

```text
启动中心

生产配置
  Provider
  模型与路由
  资源与存储

运行观测
  任务与诊断
  项目与工作区
  用量与成本

治理
  用户与组织
  权限与审计

系统
  系统设置
```

### 3.4 Cloud 启动中心

Cloud 首页不是 Local 的“我能不能做视频”，而是团队生产系统状态：

- Provider lanes 是否健康
- Route coverage 是否完整
- Worker pool 是否可用
- Storage / CDN 是否可用
- 近期失败和成本异常
- 团队额度和风险提醒

### 3.5 Cloud Provider 与模型路由

Cloud 可以暴露高级对象，因为目标用户需要治理能力：

- Provider Registry
- Credentials
- Model Catalog
- Route Matrix
- Fallback
- Priority / Weight
- Concurrency
- Pricing

但仍应按任务组织，而不是把数据库表直接丢出来。

### 3.6 Cloud 用户与治理

Cloud 必须包含 Local 不出现的能力：

- 用户
- 组织
- 角色
- 权限
- 用量
- 成本
- 配额
- 审计
- 安全设置

这些是 Cloud 的核心，而不是 Local 的隐藏高级项。

## 4. Agent Focus

Agent Focus 不是第三套 Admin。

它是 Local 和 Cloud 里的任务辅助层：

```text
Local 页面 + Agent Focus = 帮个人用户填 key、修复素材中转、解释失败
Cloud 页面 + Agent Focus = 帮管理员定位 route/provider/成本/审计问题
```

### 4.1 Local Focus

Local 常见 Focus：

| Focus | 用途 |
| --- | --- |
| `relay_provider.key.add` | 接入中转站 / 聚合站 key |
| `setup.video.start` | 从空系统配置视频闭环 |
| `storage.public_relay.configure` | 配置素材中转 |
| `job.failure.triage` | 解释生成失败并给修复动作 |

### 4.2 Cloud Focus

Cloud 常见 Focus：

| Focus | 用途 |
| --- | --- |
| `team.provider.onboard` | 接入团队共享 provider |
| `model.route.inspect` | 检查模型与线路问题 |
| `usage.cost.review` | 分析成本异常 |
| `audit.event.inspect` | 检查审计事件 |
| `runtime.health.recover` | 恢复 worker / storage / provider 健康 |

### 4.3 安全边界

无论 Local 还是 Cloud：

- 密钥必须由用户输入
- 高风险动作必须用户确认
- Agent 可以解释和预览
- Agent 不应绕过确认直接删除、禁用或更新敏感配置

## 5. 设计图范围

第一轮只画两张产品图：

1. **Local 产品图**
   - 一个人
   - 一个本机 / personal workspace
   - 一个中转站或 provider key
   - 一条视频能力闭环
   - 素材中转和失败诊断

2. **Cloud 产品图**
   - 团队 / 平台
   - 共享 provider
   - 模型路由
   - storage / CDN
   - worker pool
   - 用量、成本、用户、审计、系统设置

不要在同一张图里混合 Local 和 Cloud。

## 6. 第一版产品验收

### 6.1 Local

1. 空系统只引导“接入 Key”。
2. 中转站 / 聚合站 key 是一级路径。
3. 用户不需要理解模型路由也能启用视频能力。
4. 文生视频可先闭环，图生视频缺素材中转时单独提示。
5. 失败诊断能给用户可读解释和修复入口。
6. 高级存在，但不污染主流程。

### 6.2 Cloud

1. Cloud Admin 明确服务团队和平台治理。
2. 普通付费基础用户默认不进入 Admin。
3. Provider、模型路由、存储、任务、用量、用户、审计都有明确位置。
4. 高级能力按治理任务组织，而不是按数据库对象堆叠。
5. Agent Focus 能处理常见治理问题，但不替代 Cloud Admin。
