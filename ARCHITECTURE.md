# Movscript — Architecture Guide

> AI 快速定向文档。修改功能前先读本文，找到正确的文件范围。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面壳 | Electron 33 (main: `frontend/electron/main.ts`) |
| 前端 | React 18 + React Router v6 + Zustand + TanStack Query v5 + Tailwind CSS |
| 后端 | Go 1.25 + Gin + GORM + PostgreSQL |
| AI | 多 provider 适配层（Anthropic / OpenAI-compatible / Kling） |

API 基地址：默认 `http://localhost:8765/api/v1`，前端通过 `VITE_API_BASE_URL` 配置后端 origin。

---

## 目录职责

```
movscript/
├── backend/
│   └── internal/
│       ├── ai/           AI provider 接口 + 各 provider 适配器
│       ├── config/       环境变量加载
│       ├── crypto/       AES-256-GCM 加密（用于 API key 存储）
│       ├── db/           GORM 连接 + AutoMigrate
│       ├── handler/      HTTP 处理层（无 service 层，直接操作 DB）
│       │   ├── canvas.go       Canvas CRUD
│       │   ├── canvas_exec.go  Canvas 节点执行、AI 调度、拓扑排序
│       │   └── *.go            各实体 handler（project/script/asset/…）
│       ├── middleware/   CORS + X-User-ID 身份中间件
│       ├── model/        GORM 模型（每个实体一个文件）
│       └── router/       路由注册
│
└── frontend/src/
    ├── constants/        跨页面共享常量（shot.ts 等）
    ├── components/
    │   ├── layout/       Sidebar / Header / MasterDetail
    │   └── shared/       CreateDialog / ResourceAttachments / ScriptPanel
    ├── hooks/            usePermissions / useToolCanvas
    ├── lib/              api.ts（axios 实例）/ queryClient / utils
    ├── pages/
    │   ├── work/                 创作工作区（CreationPage shell）
    │   │   ├── config.ts         EntityKind / KIND_CONFIG / 各实体颜色配置
    │   │   └── workspaces/       每个实体一个 Workspace 组件（~100-150 行）
    │   ├── canvas/               Canvas 编辑器（XYFlow）
    │   ├── shots/ scenes/ …      各实体的管理页（Master-Detail 双模布局）
    │   └── tools/                AI 工具独立页面
    ├── store/            projectStore / userStore（Zustand）
    └── types/            index.ts — 所有 TS 接口定义
```

---

## 数据层次

```
Project
 ├── Scripts   (type: main | episode | setting | character | background)
 ├── Assets    (type: character | scene | prop，含多视角图 AssetView)
 ├── Episodes  ←→ Scenes (many-to-many via EpisodeScene)
 └── Scenes
      └── Storyboards
           └── Shots     (可执行单元，关联 Canvas)
```

---

## 关键模式

### 前端：Master-Detail 页面
所有实体管理页（`/scripts`、`/shots` 等）均遵循：
- 无选中 → 全宽卡片网格
- 有选中 → 左侧紧凑列表（w-72）+ 右侧详情面板
- 新建用 `CreateDialog`（Radix Dialog）

### 前端：API 调用
```ts
// 查询
const { data } = useQuery({
  queryKey: ['shots-project', projectId],
  queryFn: () => api.get(`/projects/${projectId}/shots`).then(r => r.data),
  enabled: !!projectId,
})
// 变更
const mutation = useMutation({
  mutationFn: (data) => api.put(`/storyboards/${boardId}/shots/${id}`, data),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['shots-project', projectId] }),
})
```

### 后端：handler 模式
每个 handler 文件只有 struct + 若干 HTTP 方法，直接读写 `h.db`，无 service 层。

### 后端：AI provider 注册
`ai/registry.go` 从 DB 加载 `AIProvider` 记录，解密 API key，实例化对应 adapter。
调用入口：`h.registry.Get(providerName)` → `provider.TextGenerate / ImageGenerate / VideoGenerate`

---

## 修改指南

| 目标 | 改哪里 |
|------|--------|
| 修改某实体的创作工作区 UI | `frontend/src/pages/work/workspaces/<Entity>Workspace.tsx` |
| 修改创作页实体标签/颜色 | `frontend/src/pages/work/config.ts` |
| 修改 Shot 状态标签/颜色 | `frontend/src/constants/shot.ts` |
| 修改某实体的管理页 | `frontend/src/pages/<entity>/<Entity>Page.tsx` |
| 添加新 API 端点 | `backend/internal/handler/<entity>.go` + `router/router.go` |
| 添加新 AI provider | `backend/internal/ai/<provider>.go`，实现 `Provider` 接口，注册到 registry |
| 修改 Canvas 执行逻辑 | `backend/internal/handler/canvas_exec.go` |
| 修改 Canvas CRUD | `backend/internal/handler/canvas.go` |
| 添加新实体类型 | model + handler + router + `frontend/src/types/index.ts` |
