# MovScript Home 存储架构

MovScript Home 是桌面业务状态的唯一可信持久化边界。业务数据、桌面状态、Agent 会话、工作区文件索引和可迁移配置都应落在 MovScript Home 下，而不是散落在 Electron profile 或浏览器存储里。

## 目录约定

- `<MovScript Home>/agent/sessions.json` 保存 Agent 会话索引和运行态快照。
- `<MovScript Home>/desktop-state/<key>.json` 保存 renderer 需要跨窗口、跨启动恢复的轻量桌面业务状态。
- `<MovScript Home>/backend/`、`<MovScript Home>/workspace/` 等目录承载后端运行和项目工作区相关状态。

Electron `userData` 是 Chromium profile/runtime 目录，只用于 Electron、Chromium、缓存、cookie、窗口 profile 和历史兼容。它不是 MovScript 的业务数据边界。

## 禁止事项

新增桌面业务状态不得使用 `app.getPath('userData')` 或 renderer `localStorage`。普通 renderer 源码不得直接调用 `window.localStorage`，必须通过受控存储 helper 或 MovScript Home desktop state bridge。

一旦存在 `getRuntimeConfig` bridge，`getAPIBaseURL()` 不得从 browser app settings 读取旧 API 地址。运行时配置以主进程注入和 MovScript Home 配置为准。

## 迁移策略

旧版 browser storage 只允许作为 web fallback 或一次性迁移来源。迁移完成后，renderer 应删除旧 key，并以后续 `getDesktopState` / `setDesktopState` 读写 `<MovScript Home>/desktop-state/<key>.json`。

这个边界由 `desktopStorageArchitecture.test.ts` 持续检查：renderer 业务状态必须能被分类，直接 browser storage 访问必须收敛到 helper，Electron `userData` 只能留在 Chromium identity 和 legacy compatibility 场景。
