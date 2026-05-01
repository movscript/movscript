# MovScript Parallel Session Guide

本文档用于把 V2 的 Codex 推演方式整理成可并行执行的工作协议。目标不是让三个窗口同时做三条互相冲突的主线，而是让每个窗口有明确职责、文件边界、交接格式和停止条件。

## 1. 核心原则

三个窗口可以并行，但只能有一个窗口推进会改变主产品路径的实现主线。

推荐分工：

```text
窗口 A：V2 主线实现
窗口 B：V2 契约 / 后端 / 测试
窗口 C：V3/V4 前瞻设计 / 规范沉淀
```

并行的前提是：

- 每个窗口只做一个小切片。
- 每个窗口开始前先读共享进度。
- 每个窗口结束前更新自己的交接记录。
- 不跨窗口抢同一批文件。
- 不回滚自己不理解、也不能确认来源的改动。

判断标准仍然是：

```text
这是否缩短了用户从“我有一份剧本”到“我看见整部片雏形”的距离？
```

如果答案不是明确的“是”，V2 主线窗口暂时不做。

## 2. 共享上下文

三个窗口启动前都必须先读：

```text
docs/movscript-v2-progress.md
docs/movscript-v2-roadmap.md
docs/movscript-v2-session-guide.md
docs/movscript-parallel-session-guide.md
```

按需要再读：

```text
docs/movscript-v2-product-design.md
docs/movscript-v3-plan.md
docs/movscript-v4-plan.md
```

每个窗口开始实现前必须运行：

```text
git status --short
```

如果发现大量未提交改动，默认假设来自其他窗口或用户，不回滚。

## 3. 三窗口职责

### 窗口 A：V2 主线实现

职责：

- 推进 `docs/movscript-v2-progress.md` 中的 `Next 1`。
- 优先改真实用户路径。
- 只做一个小而完整的产品切片。
- 结束前更新 `docs/movscript-v2-progress.md`。

当前最适合窗口 A 的任务：

```text
前端初始化读取最近草稿：
让 ScriptPreviewPage 进入页面时调用 GET /script-preview/draft，
用后端最近草稿恢复 source_text、script_version、storyboard_rows、
preview_timeline、saved_at。
```

建议文件边界：

```text
apps/frontend/src/api/scriptPreview.ts
apps/frontend/src/pages/script-preview/ScriptPreviewPage.tsx
docs/movscript-v2-progress.md
```

窗口 A 不应优先做：

- V3 runtime 架构重命名。
- V4 商业化和 Studio shell。
- 完整 DDD 大迁移。
- 任务系统、交付系统、复杂画布。
- 大范围样式重构。

### 窗口 B：V2 契约 / 后端 / 测试

职责：

- 补齐窗口 A 即将依赖的产品动作 API。
- 强化 service、handler、router、store 的边界。
- 增加低成本测试，避免前端对接时踩空。
- 不主动改前端主页面，除非只是类型契约或 generated API。

当前适合窗口 B 的任务：

```text
巩固 GET /script-preview/draft 和保存草稿契约：
补 handler/router 层测试或最小集成测试条件说明；
确认读取响应和保存响应可以被前端复用；
必要时补充错误映射和空草稿响应的测试。
```

建议文件边界：

```text
apps/backend/internal/v2/scriptpreview/
apps/backend/internal/handler/script_preview.go
apps/backend/internal/router/router.go
apps/backend/internal/model/script_preview_draft.go
apps/backend/internal/db/migrations.go
docs/movscript-v2-progress.md
```

窗口 B 不应做：

- 改 `ScriptPreviewPage` 的大块 UI。
- 直接把页面改成串联底层 V2 CRUD。
- 新增复杂 `ScriptVersion -> ContentUnit -> PreviewTimeline` 全量拆写，除非窗口 A 已明确需要。

### 窗口 C：V3/V4 前瞻设计 / 规范沉淀

职责：

- 把 V2 过程中稳定下来的模式抽象到 V3/V4。
- 只改文档或独立草案，不碰主线实现文件。
- 给 A/B 输出约束和接口建议，而不是打断 A/B 的小切片。

当前适合窗口 C 的任务：

```text
从 V2 script-preview 产品动作中抽象 ProductionAction 草案：
定义 action input、candidate output、approval policy、apply boundary、
history/audit 字段，并明确哪些内容仍留在 V2。
```

建议文件边界：

```text
docs/movscript-v3-plan.md
docs/movscript-v4-plan.md
docs/movscript-parallel-session-guide.md
```

窗口 C 不应做：

- 直接改前端页面或后端 handler。
- 重命名 apps/agent 或大范围迁移 runtime。
- 把 V4 Studio shell 提前落到当前 V2 产品入口。

## 4. 启动口令

### 窗口 A 启动口令

```text
你是窗口 A，负责 MovScript V2 主线实现。
请先读 docs/movscript-v2-progress.md、docs/movscript-v2-roadmap.md、
docs/movscript-v2-session-guide.md、docs/movscript-parallel-session-guide.md。
然后查看 git status --short，只推进 progress 里的 Next 1。
本轮优先完成前端初始化读取最近草稿。
结束前更新 docs/movscript-v2-progress.md，不回滚其他窗口改动。
```

### 窗口 B 启动口令

```text
你是窗口 B，负责 MovScript V2 契约、后端和测试。
请先读 docs/movscript-v2-progress.md、docs/movscript-v2-roadmap.md、
docs/movscript-v2-session-guide.md、docs/movscript-parallel-session-guide.md。
然后查看 git status --short。
本轮只巩固 script-preview 后端产品动作契约和测试，不改前端主页面。
结束前在 docs/movscript-v2-progress.md 增加验证记录或交接备注。
```

### 窗口 C 启动口令

```text
你是窗口 C，负责 MovScript V3/V4 前瞻设计和规范沉淀。
请先读 docs/movscript-v2-progress.md、docs/movscript-v3-plan.md、
docs/movscript-v4-plan.md、docs/movscript-parallel-session-guide.md。
然后查看 git status --short。
本轮只做文档和设计草案，不改 V2 前后端实现文件。
请从当前 V2 script-preview 产品动作中抽象 ProductionAction 规范。
```

## 5. 文件锁规则

为了减少冲突，每个窗口开始后应在回复里声明本轮会触碰的文件。

硬规则：

- `docs/movscript-v2-progress.md` 是共享交接文件，多个窗口都可以更新，但只能追加或局部更新自己的记录。
- `ScriptPreviewPage.tsx` 默认只给窗口 A 改。
- `apps/backend/internal/v2/scriptpreview/*` 默认只给窗口 B 改。
- `docs/movscript-v3-plan.md` 和 `docs/movscript-v4-plan.md` 默认只给窗口 C 改。
- 如果必须跨边界改文件，先在窗口回复里说明原因，并把改动压到最小。

建议不要三个窗口同时编辑：

```text
apps/frontend/src/pages/script-preview/ScriptPreviewPage.tsx
apps/backend/internal/router/router.go
docs/movscript-v2-progress.md 的同一段落
```

## 6. 每轮工作流程

每个窗口都按同一套节奏推进：

1. 读共享文档。
2. 看 `git status --short`。
3. 声明本轮目标和文件边界。
4. 做一个小切片。
5. 跑与切片匹配的验证。
6. 更新交接记录。
7. 最终回复列出改动文件、验证结果、下一步。

窗口不应该在一轮里混合做：

```text
产品页面 + 后端大重构 + V3 文档 + V4 商业定位
```

这会让合并和判断都变差。

## 7. 交接模板

每个窗口结束前，在相关文档中追加或更新如下信息：

```text
### YYYY-MM-DD 窗口 X 本次推进

- 本轮目标：
- 改动文件：
- 完成内容：
- 产品 / 技术决策：
- 验证：
- 未完成：
- 下一步建议：
```

如果没有改代码，也要写清：

```text
本轮只改文档，未运行代码测试。
```

## 8. 冲突处理

如果窗口发现目标文件已被其他窗口修改：

1. 先读文件当前内容。
2. 判断是否能绕开。
3. 能绕开就换到自己的文件边界内完成。
4. 绕不开就停止修改该文件，并在最终回复里说明需要人工合并。

不能做：

```text
git reset --hard
git checkout -- path
删除别人的新增文件
为了让自己测试通过而回滚不理解的改动
```

## 9. 推荐并行排期

当前最稳的三窗口推进顺序：

```text
窗口 A：
前端读取最近草稿，恢复页面状态。

窗口 B：
补后端读取草稿契约测试，确保 A 依赖稳定。

窗口 C：
把 script-preview 的 draft/analyze/generate-preview 抽象成 V3 ProductionAction。
```

下一轮可以推进：

```text
窗口 A：
把读取、保存、解析、生成预演的页面状态整理成更清晰的 action state。

窗口 B：
把 analyze/generate-preview 的 projection/mock 替换成更靠近真实 workflow 的 service 边界。

窗口 C：
定义 CandidateReview / ActionRail / RunTimeline 的第一版产品组件规范。
```

## 10. 完成定义

并行不是为了同时“完成 V2/V3/V4”，而是为了同时推进三类产物：

```text
V2：用户可用的剧本预演薄切片
V3：从 V2 动作中抽象出来的 runtime/action/candidate 规范
V4：长期 Studio 和商业路径不反向干扰 V2/V3 的边界
```

只要 V2 主线没有跑通，V3/V4 的任何实现都不应进入主产品路径。
