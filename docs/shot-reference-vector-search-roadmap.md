# Shot Reference Search and I18n Roadmap

## 背景

镜头库现在已经具备一批有价值的结构化字段：

- `intent`
- `pattern`
- `shot_function`
- `visual_preference`
- `emotional_effect`
- `visual_analysis`
- `scene_semantics`
- `narrative_function`
- `emotional_profile`
- `reusable_pattern`
- `execution_details`
- `search_index`
- `retrieval_text`

问题不在于字段不够，而在于这些字段直接暴露给用户后很难理解：

1. 页面上的筛选项和详情项大量显示英文 key 或半专业术语，例如 `shot_size`、`slow_push_in`、`withhold_then_reveal`。
2. 标签目前既承担存储 ID、展示文案、检索关键词三种职责，导致国际化很难做好。
3. 用户用中文自然语言检索时，需要先被翻译成内部 canonical tag 和搜索 query，再进入关键词搜索或未来的向量搜索。
4. 专业画面拆解、叙事功能、场景语义、可复用方法、搜索索引、执行信息几乎没有完整国际化。

商业化版本未来要支持向量搜索，但当前版本可以先做轻量方案。关键是先建立必要抽象：

```text
用户输入/界面语言
-> 术语词典和查询翻译层
-> canonical shot semantics
-> keyword/tag search
-> future hybrid/vector search
```

## 核心判断

不要把“翻译”理解成把现有英文 key 替换成中文字符串。

镜头库应该保留语言无关的 canonical ID，例如：

```text
create_tension
slow_push_in
foreground_obstruction
delayed_reveal
medium_high
```

但 UI、搜索和 AI 入口都不能直接依赖这些 ID 的字面值。中间需要一层 Shot Vocabulary：

```text
ShotVocabulary
- canonical ID
- category
- zh-CN label
- en-US label
- zh-CN aliases
- en-US aliases
- description
- search weight
- vector text
```

这样才能同时满足：

- 中文用户看到自然的中文术语。
- 英文用户看到英文术语。
- 用户搜“压迫感”“气氛变紧”“慢慢靠近脸”都能映射到 `create_tension`、`slow_push_in` 等 ID。
- 后端、数据库和未来向量索引继续使用稳定 ID。

## 目标架构

```text
ShotReference
  stores canonical IDs and structured values

ShotVocabulary
  maps canonical IDs to localized labels, aliases, descriptions, and vector text

ShotQueryTranslator
  turns user query into canonical tags, expanded keywords, and optional vector query text

ShotSearchService
  ranks by canonical tags, keywords, facets, future vectors, and rerank signals

ShotPresentation
  renders localized labels, grouped explanations, and user-facing match reasons
```

当前版本可以只做本地词典和关键词扩展。商业化版本再把同一套 `ShotQueryTranslator` 输出接到 embedding 和向量库。

## 分层设计

### 1. Canonical 存储层

数据库和 API 继续存 canonical ID：

```json
{
  "intent": ["create_tension", "reveal_information"],
  "pattern": ["slow_push_in", "foreground_obstruction"],
  "narrative_function": {
    "primary": "delayed_reveal",
    "information_state": "withhold_then_reveal"
  }
}
```

约束：

- 不在数据库里存“制造紧张感”这类展示文案。
- 用户自定义 tag 也要经过规范化，能匹配则映射到 canonical ID，不能匹配则作为 `custom:*` 或用户 alias 保存。
- `retrieval_text` 和 `search_index` 由 canonical fields + vocabulary 统一生成，不能由每个 UI 组件临时拼接。

### 2. Vocabulary 词典层

建议新增统一词典，先放在前端共享 domain，后续可迁移到后端或 contracts：

```text
apps/frontend/src/features/shot-library/domain/shotVocabulary.ts
```

后端也需要等价能力。长期更建议放到共享 contracts 或由后端 API 暴露：

```text
contracts/shot-vocabulary.json
```

词典条目建议格式：

```json
{
  "id": "slow_push_in",
  "category": "pattern",
  "labels": {
    "zh-CN": "慢推近",
    "en-US": "Slow push-in"
  },
  "aliases": {
    "zh-CN": ["慢慢推近", "镜头缓慢靠近", "压迫式推进"],
    "en-US": ["slow dolly in", "push in", "gradual push"]
  },
  "description": {
    "zh-CN": "镜头缓慢靠近主体，用距离变化制造注意力、压迫感或揭示感。",
    "en-US": "A slow camera move toward the subject to build attention, pressure, or revelation."
  },
  "searchWeight": 1.2,
  "vectorText": {
    "zh-CN": "慢推近 镜头缓慢靠近 逐渐压迫 发现真相前的紧张推进",
    "en-US": "slow push-in gradual dolly in psychological pressure delayed reveal"
  }
}
```

需要覆盖的分类：

- `intent`：创作意图，例如制造紧张、揭示信息、突出孤立。
- `pattern`：可复用镜头方法，例如慢推近、前景遮挡、留白压迫。
- `shotFunction`：镜头在段落里的功能，例如铺垫紧张、反应特写、情绪停顿。
- `visualPreference`：用户偏好的视觉倾向，例如克制节奏、竖构图、冷色低饱和。
- `emotionalEffect`：观众感受，例如悬疑、孤独、压迫、亲密。
- `visualAnalysis`：专业画面拆解字段和值，例如景别、构图、焦点、光线、色彩、运动。
- `sceneSemantics`：场景语义字段和值，例如发现、对峙、室内、冲突强度。
- `narrativeFunction`：叙事功能字段和值，例如延迟揭示、隐藏后揭示、承接反应。
- `reusablePattern`：可复用方法字段和值，例如适用条件、避免条件、可变参数。
- `executionDetails`：执行信息字段和值，例如覆盖角色、调度、转场、难度、执行条件。
- `searchIndex`：不要直接展示原始索引字段，改成“可匹配线索”或“检索线索”。

### 3. Presentation 展示层

页面上不应该直接显示 raw key。

当前问题示例：

```text
shot_size: medium_shot
camera_movement.type: push_in
narrative.primary: delayed_reveal
execution.coverage_role: reference_shot
```

应展示为：

```text
景别：中景
镜头运动：推近
叙事功能：延迟揭示
镜头用途：参考镜头
```

展示层需要两个 API：

```text
localizeShotTerm(id, category, locale)
localizeShotField(path, locale)
```

示例：

```ts
localizeShotTerm('slow_push_in', 'pattern', 'zh-CN')
// 慢推近

localizeShotField('visual_analysis.camera_movement.type', 'zh-CN')
// 镜头运动
```

页面策略：

- 筛选下拉框显示 localized label，value 仍然是 canonical ID。
- tag 输入框显示 localized suggestion，提交时保存 canonical ID。
- 详情页默认展示“用户能理解的分组解释”，高级字段折叠到“专业标注”。
- 搜索匹配原因显示自然语言，例如“命中：慢推近 / 延迟揭示 / 气氛慢慢变紧”，不显示 `pattern: slow_push_in`。

## Query-to-Tag 翻译层

这是当前版本最重要的抽象。

用户输入不应该直接进入 `strings.Contains`。应该先走查询翻译：

```text
input query:
  角色发现真相前，气氛慢慢变紧

translated query:
  canonicalTags:
    intent: [reveal_information, create_tension]
    pattern: [slow_push_in, foreground_obstruction]
    narrative: [delayed_reveal, withhold_then_reveal]
  expandedKeywords:
    ["真相", "发现", "紧张", "压迫感", "慢推近", "延迟揭示", "slow push", "delayed reveal"]
  vectorText:
    "角色发现真相前 气氛慢慢变紧 延迟揭示 慢推近 压迫感"
```

当前轻量实现可以不接 AI：

1. 对 query 做 normalize：小写、去标点、繁简可选、空白切分。
2. 用 vocabulary aliases 做短语匹配。
3. 输出 canonical tags。
4. 把 matched tag 的 label、aliases、description 加入 expanded keywords。
5. 现有 keyword/tag scorer 使用 expanded keywords + canonical tags 打分。

后续商业版可以升级为：

```text
rule-based translator
+ optional LLM parser
+ multilingual embedding
+ reranker
```

但对业务层暴露同一个接口：

```ts
interface ShotQueryTranslation {
  locale: string
  originalQuery: string
  canonicalTags: Partial<Record<ShotVocabularyCategory, string[]>>
  expandedKeywords: string[]
  vectorText: string
  confidence: number
}

interface ShotQueryTranslator {
  translate(query: string, locale: string): ShotQueryTranslation
}
```

## 搜索抽象

当前版本可以保留关键词和标签搜索，但不要让页面组件直接实现搜索逻辑。

建议抽象：

```ts
interface ShotSearchRequest {
  query: string
  locale: string
  filters: ShotLibraryFacetFilters
  sourceIds?: string[]
  topK?: number
}

interface ShotSearchResult {
  entry: ShotLibraryEntry
  score: number
  reasons: ShotSearchReason[]
}

interface ShotSearchEngine {
  search(entries: ShotLibraryEntry[], request: ShotSearchRequest): ShotSearchResult[]
}
```

当前实现：

```text
LocalKeywordShotSearchEngine
- 使用 ShotQueryTranslator
- canonical tag exact match 加权
- expanded keywords 模糊匹配
- facet filters 硬过滤
- 返回 localized reasons
```

未来商业版：

```text
HybridShotSearchEngine
- 使用 ShotQueryTranslator
- keyword/tag recall
- vector recall
- metadata filters
- rerank
- localized reasons
```

## VectorStore 预留

商业化版本需要向量搜索时，不要把 pgvector 写死到业务层。

建议接口：

```ts
interface ShotVectorDocument {
  id: string
  referenceId: number
  sourceId: string
  locale: string
  kind: 'combined' | 'tags' | 'visual' | 'narrative' | 'user_notes'
  text: string
  metadata: Record<string, unknown>
}

interface ShotVectorStore {
  upsert(document: ShotVectorDocument): Promise<void>
  search(request: ShotVectorSearchRequest): Promise<ShotVectorSearchResult[]>
  deleteByReference(referenceId: number): Promise<void>
  reindex(scope: ShotVectorReindexScope): Promise<void>
}
```

可选实现：

- `KeywordVectorStore`：当前版本 fallback，不生成 embedding，只返回关键词候选。
- `SQLiteVectorStore`：本地商业版或高级本地库。
- `PgVectorStore`：团队库、云端商业版。
- `ExternalVectorStore`：远程托管向量服务。

第一阶段只需要接口和文档，不需要真正接向量库。

## Retrieval Text 标准化

`retrieval_text` 应由统一 builder 生成，包含 canonical ID 和 localized/alias 文本。

建议生成内容：

```text
title
summary
canonical tags
localized labels
aliases
visual analysis labels and values
narrative function labels and values
scene semantic labels and values
reusable principle
execution requirements
natural language query examples
user notes
```

中文用户创建的镜头，也应该包含必要英文 alias；英文用户创建的镜头，也应该包含必要中文 alias。这样当前关键词搜索就能跨语言命中，未来 embedding 也能获得更稳定的输入。

## 分阶段计划

### P0：术语清理和用户可读展示

目标：先让用户看得懂。

工作：

- 建立 `ShotVocabulary` 的第一版静态词典。
- 把现有 `localizeShotSemanticValue` 扩展成通用 `localizeShotTerm`。
- 增加 `localizeShotField`，覆盖 `visual_analysis`、`scene_semantics`、`narrative_function`、`reusable_pattern`、`execution_details`、`search_index`。
- 筛选下拉框、详情页、匹配依据、tag suggestion 全部显示 localized label。
- 编辑表单中保留 canonical ID 的能力，但至少给出中文 label 和说明。

验收：

- 中文界面不再大面积出现 `shot_size`、`camera_movement.type`、`delayed_reveal` 这类裸 key。
- 用户能从详情页看懂“这个镜头为什么有效、适合什么场景、怎么复用”。
- 数据库存储仍然是 canonical ID。

### P1：查询翻译中间层

目标：用户的自然语言检索先翻译成可搜索的 canonical semantics。

工作：

- 新增 `ShotQueryTranslator`。
- vocabulary alias 支持中文、英文、同义词、口语表达。
- `searchShotReferenceResults` 改为接收 translation 结果或内部调用 translator。
- 搜索匹配原因使用 localized label。
- 后端 `applySearch` 也需要同等逻辑，避免远端分页搜索和前端本地搜索结果不一致。

验收：

- 搜“气氛慢慢变紧”能命中 `create_tension`、`tension_buildup`。
- 搜“慢慢靠近角色脸”能命中 `slow_push_in`、`close_up` 或相关画面字段。
- 搜“发现真相前”能命中 `reveal_information`、`delayed_reveal`。
- 搜英文 `slow push reveal` 能命中中文标注镜头。

### P2：索引生成统一化

目标：避免前后端各自拼 search text，导致行为分叉。

工作：

- 抽出 `buildShotRetrievalText(reference, vocabulary, localePolicy)`。
- 抽出 `buildShotSearchIndex(reference, vocabulary)`。
- 统一前端分析草稿和后端分析草稿的词典规则。
- 给自定义 tag 增加 alias 保存策略。
- 为已有镜头提供 reindex 入口。

验收：

- 编辑 tag、画面拆解、叙事功能、执行信息后，`search_index` 和 `retrieval_text` 同步更新。
- 同一条镜头在前端本地搜索和后端 API 搜索下结果一致。
- 可以批量重建当前镜头库索引。

### P3：搜索服务抽象

目标：为商业化向量搜索留接口，但当前实现仍然轻量。

工作：

- 新增 `ShotSearchEngine` 接口。
- 当前使用 `LocalKeywordShotSearchEngine`。
- 搜索结果返回 `reasons`，包含 canonical ID、localized label、命中来源、权重。
- 页面只消费搜索结果，不关心关键词、tag 或向量细节。

验收：

- UI 不直接知道搜索打分细节。
- 后续替换为 hybrid/vector engine 时，页面组件不需要重写。

### P4：向量搜索商业版

目标：在商业化版本支持 hybrid search。

工作：

- 新增 `ShotVectorStore` adapter。
- 新增 embedding job 和 embedding table。
- embedding document 使用 `buildShotRetrievalText` 输出。
- Hybrid search 组合：
  - canonical tag score
  - keyword score
  - vector score
  - filter match
  - user/project preference boost
  - quality/recency boost
- 可选 AI rerank 只处理 top 50/top 100 候选，不直接读取全库。

验收：

- 中文 query 可以命中英文标签镜头。
- 英文 query 可以命中中文标注镜头。
- 明确筛选条件不会被向量相似度冲掉。
- 每个结果能解释命中原因。
- 没有 embedding 服务时，关键词和标签搜索 fallback 仍然可用。

## 推荐的近期实现顺序

1. 先做 `ShotVocabulary` 静态词典。
2. 改详情页和筛选项展示，解决“看不懂术语”的直接问题。
3. 做 `ShotQueryTranslator`，让检索从用户语言映射到 canonical tags。
4. 统一 `retrieval_text` 和 `search_index` builder。
5. 抽 `ShotSearchEngine`，当前实现仍用关键词，未来再接向量。

这条路径的好处是：当前版本可以很快改善体验，商业化版本也不会因为早期把中文文案直接写进 tag 或搜索逻辑而返工。
