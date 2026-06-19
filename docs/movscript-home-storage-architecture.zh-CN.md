# MovScript Home 存储架构

MovScript Desktop 的业务状态以 **MovScript Home** 为唯一可信持久化边界。浏览器存储和 Electron `userData` 只承担运行时、兼容迁移或低风险偏好职责，不再承载桌面业务真相。

## 目录职责

| 位置 | 典型内容 | 规则 |
| --- | --- | --- |
| `<MovScript Home>/agent/sessions.json` | Agent 会话索引、会话摘要、工作区绑定 | Agent 会话管理的桌面可信源；不得放在 browser storage |
| `<MovScript Home>/desktop-state/<key>.json` | renderer 侧业务/会话状态，以及桌面工作台常驻 UI 状态的通用 JSON envelope | 通过 `desktop-state:*` IPC 访问；key 必须是安全文件段 |
| `<MovScript Home>/backend/app-settings.json` | 桌面 app 设置、后端 launch mode、服务 URL | renderer 可读取投影；写入由 Electron 服务完成 |
| `<MovScript Home>/backend/app-settings-secrets.json` | API key、外部资源 token 等敏感信息 | 仅 Node/Electron 侧读写；renderer 不接收明文 secret |
| `<MovScript Home>/media-workspaces/**` | media pipeline task、cache、editing project、HLS 输出 | 当前写入 Home；只为旧版本读取 Electron `userData` legacy 路径 |
| `<MovScript Home>/sdk-runtimes/**` | 按需安装的 provider SDK runtime package | `MOVSCRIPT_SDK_RUNTIME_DIR` 可覆盖；默认不落 Electron `userData` |
| `<MovScript Home>/plugin-catalog`、`<MovScript Home>/plugin-cache` | 插件 catalog/cache | desktop 全局 cache；项目 manifest/lock 仍归项目目录 |

## 浏览器存储边界

桌面版 renderer 不应把业务状态写成 localStorage 真相。允许保留的浏览器存储只有这些类别：

- **UI 偏好**：语言、主题、一次性提示 dismiss；桌面工作台常驻窗格状态、编辑器布局和工作流快照优先进入 MovScript Home。
- **调试开关**：agent chat debug、canvas debug、resource media diagnostics。
- **E2E/bootstrap 临时数据**：测试启动参数或本地开发辅助。
- **web fallback**：非 Electron 环境没有 Home bridge 时的可用性兜底。
- **legacy migration fallback**：首次读取旧 localStorage 后写入 MovScript Home，并尽量清理旧 key。

桌面业务 store 必须优先使用 `createDesktopStateStorage`、专门的 Home IPC，或 Electron service 持久化。Home 有值时 Home 胜出；Home 为空且存在 legacy browser value 时，迁移到 Home 后清理 browser value。

普通 renderer 源码不得直接调用 `window.localStorage` 或 `localStorage`。确需浏览器存储时必须走 `browserStorage` helper，并在 `desktopStorageArchitecture.test.ts` 中归入明确类别。E2E seed/preload 可以直接写 localStorage 注入测试数据，但不得进入普通源码路径。

桌面启动期配置以 Electron runtime config / MovScript Home app settings 投影为准。`movscript-app-settings` browser 旧值只能作为非 Electron / web fallback；一旦存在 `getRuntimeConfig` bridge，`getAPIBaseURL()` 不得从 browser app settings 读取旧 API 地址。

## Electron `userData` 边界

Electron `userData` 是 Chromium profile/runtime 目录，不是 MovScript 业务数据目录。允许出现的位置只有：

- `desktopIdentity` 设置或隔离 Electron `userData`。
- dev script 将 `MOVSCRIPT_DESKTOP_USER_DATA_DIR` 指到 `.movscript-dev/user-data`，避免开发环境污染真实桌面 profile。
- media pipeline 读取旧版本写入的 legacy `userData` workspace。
- backend legacy secret seed，为旧本地数据库生成兼容 secret；新 secret 写入 MovScript Home。

新增桌面业务状态不得使用 `app.getPath('userData')` 或 renderer `localStorage` 作为可信源。

## 新增持久化状态检查清单

1. 先判断状态性质：业务/会话/安全配置进 MovScript Home；纯 UI 偏好可留 browser storage。
2. renderer Zustand store 优先使用 `createDesktopStateStorage(key, fallback)`；key 要加入存储架构 contract test。
3. 非 Zustand 或同步 API 可使用 Home-backed cache + async IPC hydration，但必须有 legacy migration 和 Home 优先规则。
4. Electron service 写文件必须落在 `resolveMovScriptWorkspaceRootPaths(...)` 下的 Home 子目录，并用安全文件名或固定路径。
5. 敏感数据只写 Node/Electron 侧 secrets file，不进入 renderer store、browser storage、日志或 debug payload。
6. 普通 renderer 源码不得直接调用 `window.localStorage`；新增 browser storage 必须通过 helper，并更新 `desktopStorageArchitecture.test.ts` 的分类 allowlist。
7. 新增 Electron runtime/app settings 读取路径时，桌面环境必须优先使用 Home/runtime config，browser app settings 只能作为 web fallback。
8. 新增 `userData` 访问必须更新并解释 `desktopStorageArchitecture.test.ts` 的 allowlist。
