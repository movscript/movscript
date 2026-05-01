# MovScript V2 产品设计草案

本文档整理当前关于 MovScript 产品重构的讨论，用于后续反复打磨。它不是最终 PRD，而是一份产品方向、信息架构和落地路线的工作稿。

## 1. 产品定位

MovScript V2 不应首先被设计成“制片管理系统”或“管线工具”，而应聚焦一个更强的核心闭环：

> 把剧本、文案或 brief 快速变成可预览、可修改、可继续生产的 AI 影视工作台。

第一版最重要的卖点是：

```text
导入剧本 -> 一键生成预演 -> 人工确认理解 -> 补齐素材/关键帧 -> 进入内容生产
```

也就是说，用户给系统一份剧本后，系统能自动生成关键画面和预演时间线，让用户先“看见整部片的雏形”。

### 1.1 产品重构前提

MovScript 当前尚未正式发布，因此 V2 不以兼容旧产品心智、旧页面结构或旧数据入口为目标。

这次重构应按 V2 的核心闭环一次性改到位：

```text
以剧本/分镜预演为主线
以对象状态和创作决策组织界面
以后端 DDD 边界约束事实源
以 ContentUnit 承接预演到生产
以 WorkItem 隐藏执行复杂度
```

旧版的场、分镜、镜头、管线、任务、素材页面可以作为实现参考，但不应反向决定 V2 的信息架构。

如果旧数据模型与 V2 概念冲突，优先改 V2 模型和 UI，不为了兼容旧概念保留混乱入口。

## 2. 命名与导航

不再使用“管线”作为核心产品概念。“管线”过于工程化，也容易把产品引向节点图和任务流，而不是创作体验。

推荐一级导航：

```text
项目首页
剧本预演
创作资料
素材准备
内容生产
制作任务
交付
画布
```

这些导航按用户路径组织，而不是按数据库实体组织。

### 2.1 项目首页

帮助用户知道今天该先做什么。

展示：

- 最近变更
- 当前阻塞
- AI 运行状态
- 待确认项
- 下一步建议

注意：项目首页不要变成第二个任务系统。

### 2.2 剧本预演

核心入口。

用户目标：

```text
上传剧本，先看到整部片。
```

页面应展示：

- 原始剧本/brief
- AI 拆解出的剧本节
- 情境理解
- 分镜脚本/内容单元/关键画面
- 可播放的预演时间线
- 待确认、待修改、待补素材的下一步

用户也可以不从完整剧本开始，而是直接输入结构化分镜脚本。分镜脚本是非常重要的 prompt 入口，因为它比普通自然语言 brief 更清晰地表达画面、景别、机位、运动、台词、声音和时长。

### 2.3 创作资料

用户目标：

```text
确认 AI 对人物、地点、产品、风格等创作资料的理解。
```

产品上仍然展示：

- 人物
- 动物/主体
- 地点/场景
- 道具/物件
- 产品
- 品牌
- 风格
- 规则
- 时间/阶段

但底层不一定一开始拆成大量专表。

### 2.4 素材准备

素材页不应只是文件库，而应是“素材缺口管理”。

用户目标：

```text
知道正式生产还缺哪些参考图、视频、声音或品牌素材。
```

展示方式：

```text
缺失
候选
已锁定
```

例如：

```text
林夏雨夜受伤状态 · 正面半身参考：缺失
旧伞纸条特写：候选 3 张
雨夜巷口环境：已锁定
```

### 2.5 内容生产

用户目标：

```text
把预演里的关键画面升级成正式片段。
```

内容生产可以包括：

- AI 图生视频
- AI 文生视频
- 实拍上传
- 外部制作导入
- 版本对比
- 选片
- 返工

“镜头”是内容单元的一种，不应绑架所有项目。

### 2.6 制作任务

每个具体工作都可以由人完成，也可以由 AI 完成，也可以人机协作完成。

制作任务只负责执行、分配、审核和返工，不应成为内容事实源。

重要边界：

```text
任务完成 != 素材采用
任务完成 != 视频锁定
任务完成 != 交付通过
```

### 2.7 交付

用户目标：

```text
检查整片是否完整，再导出版本。
```

交付页展示：

- 预演时间线
- 成片时间线
- 缺失检查
- 版本记录
- 审核记录
- 导出

交付不应反向污染剧本结构、创作资料或素材事实。

### 2.8 画布

画布不是主流程入口，而是从具体对象进入的创作工作台。

用户通常从以下对象打开画布：

- 情境
- 内容单元
- 关键帧
- 素材需求
- 视频片段

画布的管理入口可以保留，用于查看：

- 最近画布
- 模板画布
- 无落点输出
- 历史运行

但不要鼓励用户从一个空白全项目自由画布开始。

## 3. 核心产品概念

### 3.1 剧本节 ScriptSection

剧本节是从原始剧本中切出的、可被 AI 理解和继续生产的语义段落。

它不是传统“场”的别名，也不是镜头。

它可以是：

- 剧情片的一场戏
- 动作段落
- 情绪转折
- 蒙太奇段落
- 宣传片卖点
- 产品展示段落
- 旁白段落
- 标题卡/转场

推荐关系：

```text
Script
  -> ScriptVersion
    -> ScriptSection
```

### 3.2 情境 Situation

情境是 AI 生产中最重要的语义上下文。

它回答：

```text
在什么时间、什么地点、什么条件下，谁/什么正在发生什么？
```

例子：

```text
雨夜，老城区窄巷，林夏攥着湿透旧伞，与顾言保持距离对峙，伞骨里滑出被雨泡皱的纸条。
```

情境不是地点，不是角色，也不是镜头。它是 AI 理解画面的核心中间层。

### 3.3 分层原则

核心对象必须按层级分开，避免把剧本理解、分镜表达、时间线播放、生产执行混成一个万能对象。

推荐分层：

```text
剧本文本层：ScriptSection
语义理解层：Situation
分镜表达层：StoryboardScript / StoryboardLine
时间线规划层：ContentUnit
视觉/素材结果层：Keyframe / Asset / ContentVersion
执行协作层：WorkItem
```

最重要的边界：

```text
Situation 是理解单位。
StoryboardScript 是用户和 AI 共同表达创作意图的结构化稿件。
ContentUnit 是预演时间线和后续内容生产之间的最小承接单位。
WorkItem 是执行过程，不是内容事实源。
```

用户修改时应落到明确对象：

```text
“这一段不该这么切” -> ScriptSection
“这里不是雨夜，是傍晚刚下完雨” -> Situation
“这一镜应该拆成两个镜头” -> ContentUnit
“这时人物应该是受伤状态” -> CreativeReferenceState / CreativeReferenceUsage
“这张图不好，重新生成” -> Keyframe / CanvasOutput
“这个参考图不要用了” -> AssetBinding
“找人把这个片段做成视频” -> WorkItem(target = ContentUnit)
```

### 3.4 分镜脚本 StoryboardScript

分镜脚本是用户与 AI 共同创作内容单元的结构化稿件。

它可以来自：

- 用户直接手写
- 用户导入已有分镜
- AI 根据剧本/brief 生成
- AI 根据情境补全

分镜脚本应该可以作为 prompt 的结构化输入。它可以表达：

```text
镜号
画面描述
景别
机位/角度
镜头运动
人物调度
台词/旁白
声音/音乐
时长
转场
参考资料
提示词/负面提示词
```

示例：

```text
镜头 01
画面：雨夜老城区窄巷，两人隔着几米对峙
景别：远景
机位：低机位，略微仰拍
运动：缓慢推进
人物：林夏、顾言
状态：林夏湿透、左颧擦伤，顾言克制紧张
台词：无
声音：雨声、远处车流
时长：4 秒
转场：切
```

分镜脚本是一等的创作输入和编辑界面，但下游生产、素材、任务、关键帧不要直接绑定在一段会反复改写的分镜文本上，而应绑定到稳定的 ContentUnit。

推荐关系：

```text
StoryboardScript
  -> StoryboardVersion
    -> StoryboardLine
      -> compiles_to ContentUnit
```

第一版也可以先不单独建复杂分镜表，而是在 ContentUnit 上保留分镜字段，产品界面仍然叫“分镜脚本”。关键原则是：

```text
用户读写的是分镜脚本。
系统生产的是 ContentUnit。
时间线播放的是 ContentUnit。
```

### 3.5 内容单元 ContentUnit

内容单元不是“任何内容”的万能容器。

内容单元是预演时间线和后续内容生产之间的最小承接单位。它表示一个将出现在预演时间线中、未来可以被替换成正式成片片段的规划单元。

ContentUnit 必须满足：

```text
有顺序
有时长
能播放/预览
能被用户确认、拆分、合并、重排、替换
未来能进入生产
```

它可以是：

- 镜头
- 画面段落
- 产品展示
- 字幕卡
- 转场
- 视觉片段

旁白、音乐、音效可以挂在 ContentUnit 上，或进入独立的时间线轨道，但不应因为“有声音”就被建模为 ContentUnit。人物、地点、素材需求、任务、生成结果也不应直接成为 ContentUnit。

“镜头”应建模为：

```text
ContentUnit.kind = shot
```

而不是所有项目都必须有 Shot。

典型关系：

```text
ScriptSection
  -> Situation
    -> StoryboardLine
      -> ContentUnit
        -> Keyframe / ContentVersion
```

一个 Situation 可以拆成多个 ContentUnit。例如：

```text
Situation:
雨夜，老城区窄巷，林夏攥着湿透旧伞，与顾言保持距离对峙，伞骨里滑出被雨泡皱的纸条。

ContentUnit 01：雨夜巷口远景，两人对峙，4s
ContentUnit 02：林夏半身，握紧旧伞，3s
ContentUnit 03：旧伞伞骨特写，纸条滑出，2s
ContentUnit 04：顾言看到纸条后的反应，3s
```

### 3.6 关键帧 Keyframe

关键帧是内容单元或情境的视觉锚点。

一键预演的初期，可以先用关键帧构成预演时间线，后续再逐步替换为视频片段。

Keyframe 是结果或候选结果，不是事实源。用户采用或替换关键帧时，改变的是 ContentUnit 的当前视觉锚点，而不是改写剧本结构或情境事实。

### 3.7 创作资料 CreativeReference

创作资料定义“是什么”，素材定义“如何被看见/如何被生产使用”。

创作资料可以包括：

- 人
- 动物
- 地点
- 道具
- 产品
- 品牌
- 风格
- 世界规则
- 时间阶段
- 禁忌/限制

底层可以先统一为：

```text
CreativeReference
```

并通过 `kind` 区分类型。

### 3.8 创作资料状态 CreativeReferenceState

不是每个创作资料都必须有状态。

只有当资料会随剧情、时间、情境或内容单元变化时，才创建状态。

例子：

```text
林夏
  基础资料：25 岁，短发，冷感，长期压抑
  状态：回到老城
  状态：雨夜受伤
  状态：发现母亲线索
  状态：结尾释然
```

状态必须有作用范围：

```text
script
script_section
situation
content_unit
time_period
```

否则状态会变成散乱标签。

### 3.9 素材需求 AssetRequirement

设定和素材之间不要直接父子绑定，应通过素材需求连接。

推荐关系：

```text
CreativeReference
  -> CreativeReferenceState
    -> AssetRequirement
      -> Asset
```

例如：

```text
林夏
  -> 雨夜受伤状态
    -> 正面半身伤痕参考需求
      -> portrait_rain_v3.png
```

### 3.10 制作任务 WorkItem

制作任务表示“为了推进某个创作对象，需要被执行、审核、返工的一项具体工作”。

在 V2 中，WorkItem 的定位是执行层对象：

```text
WorkItem = 执行层对象
不是创作事实源
不是内容本体
不是用户一开始必须理解的概念
```

它可以由：

- 人执行
- AI 执行
- 人机协作执行

它可以指向任意目标：

```text
ScriptSection
Situation
ContentUnit
CreativeReference
CreativeReferenceState
AssetRequirement
Asset
Keyframe
DeliveryVersion
```

重要边界：

```text
WorkItem 完成 != 素材采用
WorkItem 完成 != 关键帧采用
WorkItem 完成 != 视频锁定
WorkItem 完成 != 交付通过
```

例如 AI 生成视频时：

```text
WorkItem
  target_type = content_unit
  target_id = CU-03
  work_type = generate_video
  assignee_type = ai
  status = running

ContentVersion
  content_unit_id = CU-03
  source_work_item_id = WI-88
  status = candidate
```

任务完成只表示生成工作完成。这个视频是否被采用，要由 ContentVersion 的状态决定。

用户大多数时候不应该直接看到 `WorkItem` 这个词。用户感知到的是：

```text
正在生成
待处理
待审核
需要补素材
需要重做
分配给我
AI 运行中
已完成
失败，重试
```

只有在“制作任务”页面里，用户才明确看到任务列表。该页面是辅助入口，不是主流程入口。

### 3.11 画布 Canvas

画布不是事实源，而是操作面。

每个画布必须有 owner：

```text
owner_type
owner_id
```

比如：

```text
owner_type = situation
owner_id = 雨夜巷口对峙
```

画布输出必须有落点：

```text
保存为关键帧
保存为素材
加入预演
作为内容版本
```

## 4. 剧本预演核心流程

第一版最重要的闭环：

```text
导入剧本
  -> AI 切剧本节
  -> AI 提取情境
  -> AI 生成/补全分镜脚本
  -> 分镜脚本编译为内容单元
  -> AI 生成关键帧
  -> 生成预演时间线
  -> 用户播放预演
  -> 用户确认/修改
  -> 进入素材准备和内容生产
```

产品界面建议：

```text
左：剧本原文
中：AI 理解结果
右：下一步动作
底部/侧边：预演时间线
```

用户不应该先看到数据库对象，而应该先看到：

```text
剧本已解析
分镜脚本可编辑
预演可播放
这些地方需要确认
这些素材还缺失
下一步可以进入制作
```

用户可以从两种入口进入同一个闭环：

```text
剧本/brief 入口：
Script / Brief -> ScriptSection -> Situation -> StoryboardScript -> ContentUnit

分镜脚本入口：
StoryboardScript -> ContentUnit
```

如果用户直接输入结构化分镜脚本，系统不应强制用户先补完整剧本。系统可以从分镜脚本反推 Situation 和 CreativeReference，用于保持人物、地点、状态和风格连续性。

### 4.1 分镜脚本与内容单元的编辑关系

分镜脚本是用户主要编辑的创作稿件，ContentUnit 是系统稳定的时间线与生产骨架。

编辑规则：

```text
新增一条分镜 -> 创建一个 ContentUnit
删除一条分镜 -> ContentUnit 标记为 removed / ignored，不直接删除已有关联结果
拆分一条分镜 -> 拆分为多个 ContentUnit，并继承上下文
合并多条分镜 -> 合并 ContentUnit，并保留历史映射
改写分镜文案 -> 更新 ContentUnit 的分镜字段，但不改变其稳定 ID
重排分镜顺序 -> 更新预演时间线顺序
```

这样可以保证用户持续用分镜脚本工作，同时让关键帧、素材需求、任务、内容版本有稳定挂载点。

## 5. 创作资料与状态

### 5.1 基础资料

基础资料保存稳定信息：

```text
人物是谁
地点是什么
产品是什么
风格是什么
规则是什么
```

### 5.2 状态

状态保存某个上下文里的临时表现：

```text
林夏在雨夜巷口：湿透风衣、左颧擦伤、压抑愤怒、拿旧伞
```

状态不应覆盖基础资料。

### 5.3 状态使用

一个内容单元或情境引用创作资料时，可以指定使用哪个状态：

```text
ContentUnit CU-02
  uses 林夏
  state = 雨夜受伤
```

这样才能保证 AI 生成连续性：

- 衣服不乱
- 伤痕不消失
- 情绪不跳变
- 道具不拿错
- 不同阶段状态清晰

## 6. 画布交互

画布应围绕“当前对象”展开，而不是从空白画布开始。

### 6.1 画布需要的上下文

画布打开时应知道：

```text
当前对象是谁
相关剧本节
相关情境
相关创作资料
相关状态
相关素材
历史生成结果
预演时间线位置
```

### 6.2 画布输出

画布输出不只是下载文件，而是创作决策。

结果卡应提供：

```text
设为关键帧
保存为素材
加入预演
作为内容版本
继续生成
放弃
重生成
```

状态建议：

```text
generated  已生成但未采用
candidate  候选，待确认
attached   已绑定到实体
accepted   已采用
rejected   已放弃
```

### 6.3 画布与 V2 实体的关系

画布不应改成与某一类实体强绑定。

当前画布更适合保持 port/schema 模式：

```text
Canvas 本体负责节点、连线、运行、输入输出
Entity Schema 定义对象有哪些可读/可写 port
Entity IO 负责把 port 读写映射到具体实体字段、资源绑定或采用动作
Canvas Output 通过明确落点写回 V2 对象
```

因此 V2 不需要推倒画布运行引擎，但画布需要跟随 V2 做适配：

```text
新增 V2 对象的 entity schema / port schema
把画布打开入口改成从 V2 对象进入
把画布输出落点改成 V2 用例动作
把画布审计记录指向 V2 对象
弱化旧 scene / storyboard / shot 的画布入口
```

V2 画布应支持的对象类型：

```text
script_version
script_section
situation
storyboard_script
storyboard_line
content_unit
keyframe
creative_reference
creative_reference_state
asset_requirement
asset
work_item
delivery_version
```

画布的 owner 应表达“当前创作上下文”，不是用户所有权。建议区分：

```text
created_by_id    谁创建了画布
project_id       属于哪个项目
owner_type       画布围绕哪个 V2 对象展开
owner_id         V2 对象 ID
```

如果现有实现中 `OwnerID` 表示用户，应在 V2 中改名为 `created_by_id`，避免与对象 owner 混淆。

输出落点不应直接写数据库字段，而应映射到明确产品动作：

```text
保存为关键帧 -> AcceptKeyframe / AttachKeyframeToContentUnit
保存为素材 -> AddAssetCandidate / LockAssetRequirement
加入预演 -> AddToPreviewTimeline / ReplacePreviewTimelineItem
作为内容版本 -> CreateContentVersionCandidate
生成后待审核 -> CreateWorkItem / CompleteWorkItem
```

由于 V2 不考虑旧产品兼容，不建议为旧 `scene / storyboard / shot` 写复杂兼容层。旧实体如需保留，只作为 UI Preview 或内部调试入口；正式 V2 画布应直接面向 `situation / storyboard_line / content_unit / asset_requirement / keyframe` 等新对象。

## 7. 后端域划分建议

后端不要按页面拆，也不要按影视名词无限加表。建议按边界上下文拆。

```text
project       项目域
script        剧本、分镜稿与版本
structure     剧本节、情境、分镜行、内容单元
creative      创作资料、状态、关系
asset         素材需求、素材、绑定
canvas        画布、运行、输出
production    制作任务、审核
delivery      交付版本、导出
generation    AI 调用封装
```

核心原则：

```text
事实源：Script / Structure / Creative / Asset
操作面：Canvas
执行面：Production
生成能力：Generation
交付结果：Delivery
```

### 7.1 V2 DDD 架构原则

V2 后端应采用：

```text
模块化单体
+ DDD bounded context
+ 六边形/整洁架构
+ 轻量 CQRS
+ 领域事件
```

当前产品尚未发布，不需要为了兼容旧 handler、旧页面或旧数据入口牺牲 V2 的边界。旧 V1 代码可以保留为参考或临时实现，但 V2 新能力应从一开始按 DDD 组织。

不要一上来拆微服务。先在单体内把边界做硬：

```text
apps/backend/internal/v2/
  project/
  script/
  structure/
  creative/
  asset/
  canvas/
  production/
  delivery/
  generation/
```

每个 bounded context 内部推荐分层：

```text
domain/          领域模型、聚合、值对象、领域事件、领域服务
application/     用例服务、事务编排、命令、查询
infrastructure/  GORM repository、AI adapter、storage adapter
interfaces/      HTTP handler、DTO、路由绑定
```

如果 Go 目录过深，也可以在 context 内用文件名表达分层：

```text
internal/v2/structure/
  aggregate.go
  entity.go
  value.go
  event.go
  repository.go
  service.go
  handler.go
  postgres_repository.go
```

但依赖方向必须保持：

```text
interfaces -> application -> domain
infrastructure -> domain/application interfaces
domain 不依赖 Gin、GORM、AI SDK、对象存储
application 不依赖 Gin
handler 不直接操作 GORM model
```

### 7.2 Bounded Context 与职责

| Context | 职责 | 聚合根 |
|---|---|---|
| project | 项目、成员、权限、项目级状态 | Project |
| script | 原始剧本、剧本版本、导入来源 | Script, ScriptVersion |
| structure | 剧本节、情境、分镜脚本、内容单元、预演时间线 | StoryboardScript, ContentUnit, PreviewTimeline |
| creative | 人物、地点、风格、状态、引用关系 | CreativeReference |
| asset | 素材需求、候选素材、锁定素材 | AssetRequirement, Asset |
| canvas | 对象画布、运行、输出落点 | Canvas, CanvasRun |
| production | 制作任务、审核、返工、依赖 | WorkItem |
| delivery | 交付版本、成片时间线、导出记录 | DeliveryVersion |
| generation | AI 调用、模型选择、生成任务、provider adapter | GenerationJob |

关键边界：

```text
script 只拥有文本和版本
structure 拥有分镜、内容单元、预演时间线
creative 拥有人物/地点/状态事实
asset 拥有素材缺口和素材采用关系
production 只拥有执行过程
delivery 只拥有交付结果
generation 只拥有 AI 调用过程
```

例如：

```text
WorkItem 完成
  -> 只能发出 WorkItemCompleted
  -> 不能直接把 ContentVersion 改成 accepted
```

采用视频应由 structure 或 delivery 的用例决定，不由 production 决定。

### 7.3 聚合设计建议

不要做一个巨大的 ProjectAggregate。Project 是权限和归属边界，不是全项目事实容器。

推荐聚合：

```text
ScriptVersionAggregate
  - ScriptVersion
  - ScriptSection snapshot / parse result metadata

StoryboardScriptAggregate
  - StoryboardScript
  - StoryboardVersion
  - StoryboardLine

ContentUnitAggregate
  - ContentUnit
  - linked Keyframe reference
  - production status projection

CreativeReferenceAggregate
  - CreativeReference
  - CreativeReferenceState

AssetRequirementAggregate
  - AssetRequirement
  - candidates
  - locked asset id

WorkItemAggregate
  - WorkItem
  - WorkReview
  - WorkDependency

DeliveryVersionAggregate
  - DeliveryVersion
  - DeliveryTimelineItem
  - ExportRecord
```

聚合内保证强一致，跨聚合通过应用服务和领域事件协调。

### 7.4 应用层用例

V2 不应只暴露数据库 CRUD。真正产品流程要通过 application service 表达：

```text
ImportScript
CreateStoryboardScript
AnalyzeScriptToSections
ExtractSituations
GenerateStoryboardFromSituations
CompileStoryboardToContentUnits
GenerateKeyframesForContentUnits
BuildPreviewTimeline
ConfirmContentUnit
SplitContentUnit
MergeContentUnits
LockAssetRequirement
CreateWorkItemForContentUnit
CompleteWorkItem
AcceptContentVersion
CheckDeliveryReadiness
ExportDeliveryVersion
```

CRUD 可以保留给内部调试和管理后台原型，但主产品界面必须优先调用用例 API。

### 7.5 领域事件

先做进程内 domain event，必要时再升级为 outbox。

典型事件：

```text
ScriptVersionCreated
ScriptSectionsGenerated
SituationConfirmed
StoryboardLineChanged
ContentUnitCreated
ContentUnitConfirmed
KeyframeAccepted
AssetRequirementCreated
AssetRequirementLocked
WorkItemCreated
WorkItemCompleted
ContentVersionAccepted
DeliveryVersionApproved
```

事件用途：

```text
ContentUnitCreated -> 创建关键帧生成 WorkItem
AssetRequirementCreated -> 标记素材准备缺口
WorkItemCompleted -> 生成候选结果
KeyframeAccepted -> 更新预演时间线展示
ContentVersionAccepted -> 更新成片时间线
```

领域事件只能触发后续流程，不应绕过聚合规则直接改别的事实源。

### 7.6 当前代码落地方式

当前后端仍以 `handler -> GORM model` 为主，V2 已有 `internal/model/v2_structure.go`、`v2_creative.go`、`v2_production.go` 和 `handler/v2_semantics.go` 作为语义骨架。

这些可以作为临时原型，但正式 V2 应从新目录开始：

```text
apps/backend/internal/v2/
```

优先从 structure context 落地：

```text
internal/v2/structure/domain
internal/v2/structure/application
internal/v2/structure/infrastructure
internal/v2/structure/interfaces
```

第一批用例：

```text
CreateStoryboardScript
GenerateStoryboardFromSituations
CompileStoryboardToContentUnits
SplitContentUnit
MergeContentUnits
BuildPreviewTimeline
```

这批用例正好对应 V2 最核心的概念边界。

## 8. 前端 UI 设计改造原则

V2 前端不应沿用旧版“项目实体管理后台”的心智。页面不应按数据库表堆列表，而应按创作工作流、对象状态和用户决策组织。

核心原则：

```text
用户读写分镜脚本
用户观看预演时间线
用户确认 AI 理解
用户处理缺口和候选
用户采用关键帧、素材、视频版本
用户感知任务状态，但不需要理解 WorkItem
```

### 8.1 导航改造

一级导航按用户路径，不按实体：

```text
项目首页
剧本预演
创作资料
素材准备
内容生产
制作任务
交付
画布
```

旧版的 `Scenes`、`Storyboards`、`Shots`、`Pipelines` 不应作为 V2 一级导航。它们可以被吸收到：

```text
分镜脚本
内容单元
预演时间线
内容生产
```

### 8.2 剧本预演页面

剧本预演是 V2 的主入口，第一屏目标是：

```text
让用户知道 AI 是否理解了这部片，并能马上改。
```

建议布局：

```text
左侧：剧本/brief/分镜脚本输入与版本
中间：分镜脚本编辑器 + AI 理解结果
右侧：待确认项、素材缺口、下一步动作
底部：可播放预演时间线
```

用户可以从两种模式开始：

```text
剧本模式：粘贴/上传剧本 -> AI 拆解 -> 生成情境和分镜
分镜模式：直接写结构化分镜 -> 编译为内容单元
```

界面上应突出：

```text
分镜脚本可编辑
预演可播放
这些地方需要确认
这些素材还缺失
下一步可以生成关键帧/进入制作
```

不应突出：

```text
数据库 ID
底层表名
WorkItem
复杂 pipeline DAG
空白全局画布
```

### 8.3 分镜脚本编辑体验

分镜脚本应是结构化编辑器，而不是普通大文本框。

每条分镜行应支持：

```text
镜号
画面描述
景别
机位
镜头运动
人物/主体
状态
台词/旁白
声音
时长
转场
参考资料
提示词
```

用户操作映射：

```text
新增分镜行 -> 创建 ContentUnit
删除分镜行 -> 标记 ContentUnit removed / ignored
拆分分镜行 -> 拆分 ContentUnit
合并分镜行 -> 合并 ContentUnit
拖拽排序 -> 更新预演时间线顺序
改写画面描述 -> 更新 ContentUnit 分镜字段
```

UI 可以叫“分镜脚本”，但内部要保持 ContentUnit 稳定 ID。

### 8.4 内容单元在 UI 中的呈现

用户不需要一开始学习 `ContentUnit` 这个词。不同页面可用更自然的名称：

```text
剧本预演：分镜 / 片段
时间线：片段
内容生产：生产片段
交付：成片片段
```

但 UI 行为要始终围绕同一个对象：

```text
同一个片段可以有分镜描述、关键帧、素材缺口、生成任务、视频候选、采用状态。
```

这样用户从预演到生产不会丢失上下文。

### 8.5 WorkItem 的用户感知

UI 不应把 `WorkItem` 暴露成产品核心概念。

用户看到的是：

```text
正在生成
待处理
待审核
需要补素材
需要重做
分配给我
AI 运行中
失败，重试
```

只有“制作任务”页面展示任务列表，用于集中处理：

```text
待我处理
AI 运行中
待审核
返工中
已完成
```

制作任务页是执行队列，不是内容事实源。用户在任务页完成工作后，仍需在关键帧、素材、视频版本或交付页做采用/确认。

### 8.6 页面与 DDD Context 对齐

前端页面可以跨多个 context 读数据，但写操作必须尽量调用明确用例，不直接拼凑多个 CRUD。

示例：

```text
剧本预演页
  读：script + structure + creative + asset + production projection
  写：AnalyzeScriptToSections / GenerateStoryboardFromSituations / CompileStoryboardToContentUnits / BuildPreviewTimeline

素材准备页
  读：asset requirements + candidates + creative states
  写：LockAssetRequirement / RejectAssetCandidate / WaiveAssetRequirement

内容生产页
  读：content units + keyframes + content versions + work item status
  写：CreateWorkItemForContentUnit / AcceptContentVersion / RequestRevision

交付页
  读：delivery version + timeline + missing checks
  写：CheckDeliveryReadiness / ApproveDeliveryVersion / ExportDeliveryVersion
```

### 8.7 一次性改造策略

由于产品尚未发布，V2 UI 不做旧交互兼容。

应一次性调整：

```text
移除“管线”作为主心智
弱化旧 Scenes / Storyboards / Shots 的入口
把剧本预演作为第一主入口
把结构化分镜脚本作为核心编辑体验
把素材页改成素材缺口管理
把画布改成 V2 对象上下文工作台，保留 port/schema 运行内核
把任务页改成执行队列
```

不建议保留两个并行主流程：

```text
旧流程：场 -> 分镜 -> 镜头 -> pipeline
新流程：剧本/分镜 -> 情境 -> 内容单元 -> 预演 -> 生产
```

如果需要过渡，只在管理后台或 UI Preview 中保留旧入口，不让它成为 V2 用户路径。

## 9. 技术实体草案

以下只是实现参考，产品原型应先于技术落地。

### 9.1 剧本与结构

```text
Script
ScriptVersion
ScriptSection
Situation
StoryboardScript
StoryboardVersion
StoryboardLine
ContentUnit
Keyframe
PreviewTimeline
```

### 9.2 创作资料

```text
CreativeReference
CreativeReferenceState
CreativeReferenceUsage
CreativeRelationship
```

### 9.3 素材

```text
AssetRequirement
Asset
AssetBinding
```

### 9.4 画布

```text
Canvas
CanvasNode
CanvasEdge
CanvasRun
CanvasOutput
```

### 9.5 制作任务

```text
WorkItem
WorkReview
WorkDependency
```

### 9.6 交付

```text
DeliveryVersion
DeliveryTimelineItem
ExportRecord
```

## 10. 逐步落地路线

不要一开始做完整制片系统。建议按闭环推进。

### Phase 1：产品壳与导航

目标：

- 改掉“管线”心智
- 建立 V2 主导航
- 管理后台保留 V2 原型用于讨论
- 一次性移除旧 Scenes / Storyboards / Shots / Pipeline 作为主流程入口
- 建立“剧本预演 + 结构化分镜脚本 + 预演时间线”的第一屏体验

范围：

```text
项目首页
剧本预演
创作资料
素材准备
内容生产
制作任务
交付
画布
```

### Phase 2：剧本导入与剧本节

目标：

- 上传/粘贴剧本
- 保存版本
- 生成剧本节
- 用户可合并、拆分、忽略、确认

### Phase 3：情境、分镜脚本与内容单元

目标：

- 从剧本节提取情境
- 从情境生成/补全分镜脚本
- 从分镜脚本编译为内容单元
- 支持剧情片、宣传片、产品片等非传统结构

### Phase 4：关键帧与预演时间线

目标：

- 每个关键情境生成关键帧
- 串成预演时间线
- 用户能播放、重排、替换、确认

这是最重要的 MVP 闭环。

### Phase 5：创作资料确认

目标：

- AI 拆出人物、动物、地点、道具、产品、风格等候选
- 用户确认、合并、忽略
- 情境和内容单元能引用创作资料

### Phase 6：素材需求与素材锁定

目标：

- 从情境、状态、内容单元生成素材需求
- 管理缺失、候选、已锁定
- 支持上传和 AI 生成素材

### Phase 7：对象画布

目标：

- 从情境、内容单元、素材需求、关键帧打开画布
- 画布有 owner
- 输出有落点

### Phase 8：内容生产

目标：

- 从关键帧生成视频
- 上传实拍/外部视频
- 管理内容版本
- 选片和返工

### Phase 9：制作任务

目标：

- 人工任务
- AI 任务
- 审核
- 返工

### Phase 10：交付

目标：

- 时间线检查
- 缺失检查
- 版本导出
- 审核记录

## 11. 明确先不做

第一阶段不建议做：

- 复杂排期系统
- 完整制片预算
- 全项目自由画布
- 过细的人物字段体系
- 大而全的任务协作系统
- 传统 pipeline DAG
- 复杂权限矩阵

原因：

这些会让产品过早变重，反而拖慢“一键预演”核心闭环。

## 12. 当前 UI Preview 位置

当前已在管理后台 UI Preview 中创建 V2 类目。

入口：

```text
管理后台 -> UI 组件预览 -> V2 -> V2 总览
```

V2 总览目前可以点击：

```text
项目首页
剧本预演
创作资料
素材准备
内容生产
制作任务
交付
画布
```

用于反复讨论产品原型，而不是作为最终 UI。
