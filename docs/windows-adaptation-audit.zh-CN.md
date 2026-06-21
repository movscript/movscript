# Movscript Windows 适配审计

审计日期：2026-06-21

结论：当前代码库已经有若干 Windows 分支和 release 脚本基础，但还没有形成可发布 Windows 桌面版所需的完整闭环。`v0.1.7` 先保留 macOS arm64 是正确选择；Windows 需要先做一次专门的兼容性修复和 CI 验证，再进入正式发布矩阵。

2026-06-21 更新：已落地首批 P0/P1 修复，包括 Windows 默认 Home、设置页目录选择入口、app-server 命令解析、`movcli.cmd` workspace wrapper、Windows `Path` 保留、`git-http-backend.exe` 查找、Windows `.ico` 资源，以及独立 `windows-compat` workflow。正式 release matrix 已加入 `windows-x64`，但 GitHub Actions 当前需要重新启用后才能验证 Windows runner 上的 unsigned package 与 smoke。

## 背景

本次审计基于当前仓库状态和最近一次发布调整：

- Release workflow 已配置 `macos-arm64` 与 `windows-x64`。见 `.github/workflows/release.yml` 的 package matrix。
- `package-resources.manifest.json` 和 `scripts/release/release-common.mjs` 仍声明了 `win32` 资源和 release target，说明 Windows 是设计目标，但不是已验证目标。
- Electron Builder 配置中已有 `win` 的 `nsis` 和 `portable` target，但 Windows 图标、签名、安装器行为、运行 smoke 尚未闭环。
- `mova-app-server` 平台包已经切到 app-server-only 方向，Windows x64 包名解析存在，但 app-server 在 Windows 下的 home、命令解析和真实启动还需要验证。

## 总体判断

Windows 适配问题不是一个单点错误，而是多个层次之间不一致：

- 有些模块知道 Windows 需要 `.exe`，有些模块仍只查找 Unix 风格可执行文件。
- 有些路径使用 `node:path` 当前平台语义，有些测试用 POSIX 主机模拟 Windows 路径，无法证明 Windows 真实行为。
- 发布脚本能生成 Windows target 参数，但稳定 release workflow 已经移除 Windows，缺少独立 Windows 预检 job。
- Movscript Home 的原则文档已经明确“桌面业务状态唯一边界”，但 Windows 下默认 Home 放在哪里、如何与 Electron `userData` 分离，还没有形成明确策略。

## 风险清单

| 等级 | 领域 | 缺口 | 证据 | 建议 |
| --- | --- | --- | --- | --- |
| P0 | 发布矩阵 | Windows x64 已回到稳定 release matrix，但仍需要真实 runner 通过验证。 | `.github/workflows/release.yml` 已包含 `windows-x64`；`windows-compat` workflow 拆分了 Windows 前端/打包/smoke gate。 | 重新启用 GitHub Actions 后，先跑 `windows-compat`，再触发正式 release。 |
| P0 | Movscript Home | 社区版默认 Home 原先落在 `~/.movscript`，没有 Windows 专属策略。 | `desktopIdentity.ts` 社区版曾走 `fallbackUserMovScriptHomeDir()`；core fallback 是 `join(homedir(), '.movscript')`。 | 已改为 Windows 默认 `%LOCALAPPDATA%\\Movscript\\Home`，继续允许 `MOVSCRIPT_HOME`/`MOVSCRIPT_DESKTOP_HOME` 覆盖；设置页已补系统目录选择入口。 |
| P0 | app-server 命令解析 | 手动配置 Windows 路径会被反斜杠转义破坏。 | `appServerRuntimeCommand.ts` 的 `shellWords()` 曾把 `\` 当转义符；`C:\Program Files\...` 会被解析成错误路径。 | 已改为平台感知解析，Windows 下保留反斜杠并识别 `\`/盘符路径；后续仍建议配置层支持结构化 `{ command, args }`。 |
| P1 | app-server 包解析 | `mova-app-server-win32-x64` 映射存在，但真实 Windows 启动未纳入 CI。 | `APP_SERVER_PLATFORM_PACKAGE_BY_TARGET` 已映射 `x86_64-pc-windows-msvc`；workflow 没有 Windows smoke。 | 在 Windows runner 上启动 app-server，跑 `initialize`、`runtime/probe`、`thread/start` 最小集。 |
| P1 | CLI runtime | `movcli` 解析和物化原先硬编码 Unix wrapper 名。 | `movscriptCliPath.ts` 曾只查找和复制 `movcli`，没有 `movcli.cmd` wrapper。 | 已补 workspace `movcli.cmd` wrapper；如果近期只保留 app-server，后续仍可把 movcli 从 Windows 必需资源降级。 |
| P1 | PATH 环境 | 本地终端会把 `PATH` 固定写回，可能绕开 Windows 原本的 `Path` key。 | `movScriptCliPathEnv()` 能识别 `Path`，但 `localTerminalEnv()` 又写入 `PATH: env.PATH || defaultTerminalPath()`。 | 已统一 `pathEnvKey()`，Windows 本地终端保留原有 `Path` 键并使用 `;` 分隔。 |
| P1 | 本地终端 | node-pty 已打包但 Windows ConPTY 行为没有验证。 | `electron-builder.yml` unpack `node-pty/**`；`localTerminal.ts` Windows 走 `cmd.exe`，但没有 Windows e2e。 | 增加 Windows runner 上的 terminal smoke：创建、写入 `echo %CD%`、退出、检查输出。 |
| P1 | Electron Windows 打包 | Windows target 存在但缺少 Windows 资源和签名策略。 | `electron-builder.yml` 有 `win` target；签名环境只在 readiness 中有检查。 | 已增加 `build/icon.ico` 和 `win.icon`；仍需签名/未签名策略说明、NSIS 与 portable 的产物验证。 |
| P1 | 后端本地 Git HTTP | `git-http-backend` 查找和可执行判断偏 Unix。 | Go 代码曾只查找 `git-http-backend`，`isExecutableFile()` 检查 `0111` 权限位；Windows `.exe` 和 PATHEXT 行为未覆盖。 | 已支持 `git-http-backend.exe`，Windows 下普通文件即可通过可执行检查。 |
| P1 | 资源契约 | manifest 声明 Windows 资源，release workflow 已配置 Windows x64 目标。 | manifest 的 backend/ffmpeg 均列 `win32`；release matrix 会下载 `win32 x64` ffmpeg 并打 Windows package。 | 在 Windows runner 上验证 package artifact 中资源齐全。 |
| P2 | media pipeline | ffmpeg 路径有 Windows 分支，但主要是单元级模拟。 | `ffmpegProbe.ts` 支持 `ffmpeg.exe`，测试里 Windows 期望路径是混合分隔符字符串。 | 在 Windows runner 上跑 `getMediaPipelineFFmpegStatus` 和一个最小转码 smoke。 |
| P2 | HLS/local protocol | HLS 本地协议使用 base64 path token，设计上较安全，但 Windows drive/UNC 没有真实测试。 | `localHlsProtocol.ts` 用 `resolve`、`sep`、`normalize` 和 `base64url` token。 | 增加 `C:\...`、UNC、大小写盘符、`..` 路径穿越测试。 |
| P2 | 后端进程生命周期 | packaged backend 使用 detached + pid 文件，Windows 退出/清理行为未验证。 | `backend/spawn.ts` packaged 模式 `detached: true` 并写 pid；Windows 的 detached 子进程生命周期不同。 | Windows smoke 里验证 app 退出后 backend 是否按预期存活或关闭，并记录策略。 |

## 重点模块评估

### Movscript Home

`docs/movscript-home-storage-architecture.zh-CN.md` 已经定义 Movscript Home 是桌面业务状态边界，这是正确方向。但实现上 Windows 策略还不明确：

- `resolveDesktopIdentity()` 优先 `MOVSCRIPT_DESKTOP_HOME`、`MOVSCRIPT_HOME`、`MOVSCRIPT_WORKSPACE_DIR`，最后才 fallback。
- 社区版 fallback 是 `fallbackUserMovScriptHomeDir()`，目前为 `~/.movscript`。
- 企业版 fallback 是 `~/.movscript-enterprise`，只把 Electron `userData` 放入 appData 下的 `MovScript Enterprise`。
- `getElectronAppDataDir()` 有 Windows `APPDATA` 分支，但它没有用于社区版 Home。

建议先定一个平台策略：

| 平台 | 建议默认 Home | 备注 |
| --- | --- | --- |
| macOS | `~/Library/Application Support/Movscript/Home` 或保留当前兼容路径 | 需要兼容已有 `.movscript` 用户。 |
| Windows | `%LOCALAPPDATA%\\Movscript\\Home` | 本地运行态、缓存、sqlite、bin 更适合 LocalAppData。 |
| Linux | `$XDG_DATA_HOME/movscript/home` 或 `~/.local/share/movscript/home` | 避免长期使用裸 `~/.movscript` 作为唯一策略。 |

如果短期不迁移 macOS，至少应让 Windows 新装默认到 `%LOCALAPPDATA%\\Movscript\\Home`，并继续允许 `MOVSCRIPT_HOME` 覆盖。

安装目录与数据目录应保持分离：

- NSIS 安装器可以允许用户选择安装位置，例如 `D:\Apps\Movscript`。
- 安装位置不应决定 Movscript Home。`Program Files` 权限、升级覆盖、卸载行为都不适合承载项目数据。
- 默认 Movscript Home 用 `%LOCALAPPDATA%\\Movscript\\Home`；设置页允许用户选择 `D:\MovscriptHome` 这类大容量路径，保存后重启生效。
- 真正容易占用空间的是项目、素材、runtime、缓存、media workspace、日志和生成产物，而不是安装目录里的 exe。
- 自动搬迁旧 Home 数据需要单独的迁移向导，因为后端、MCP、runtime 可能持有文件锁；首发先提供明确的 Home 选择和重启边界。

### app-server

积极部分：

- `@movscript/mova-app-server` 已有平台包映射，包括 `@movscript/mova-app-server-win32-x64`。
- Windows 下 app-server 可执行名已切到 `codex-app-server.exe`。
- app-server package store 能安装平台包，适合 app-server-only 发布方向。

主要缺口：

- `shellWords()` 是 POSIX 风格解析器，会破坏 Windows 反斜杠路径。
- `assertCommand()` 只在 command 包含 `/` 时检查文件，Windows 反斜杠路径不会走 access 检查。
- app-server context 把 Mova 的 `MOVA_HOME` 和 `CODEX_HOME` 都放在 `<Movscript Home>/.mova`，Windows 下这是否符合 Mova 运行期预期还没有验证。

建议：

1. 运行时配置优先保存结构化命令：`command` + `args`，不要只保存 shell 字符串。
2. Windows 下识别 `\`、盘符、UNC 路径，并用 `path.isAbsolute()` 做可执行检查。
3. 增加 Windows app-server smoke：从平台包解析 `codex-app-server.exe`，通过 stdio `initialize`，再跑一个最小 `runtime/probe`。

### movcli 与本地终端

目前 Windows 发布如果还包含 movcli，会遇到两个问题：

- `movcli` 文件名硬编码，Windows 没有 `.cmd` 或 `.exe` wrapper。
- 本地终端环境可能同时出现 `Path` 和 `PATH`，导致 PATH 前置失效或顺序不确定。

如果产品方向是“桌面只需要 app-server”，建议 Windows release 暂时不要把 movcli 当 fatal 依赖。后续需要 CLI 时，再补一套 Windows wrapper 和终端 smoke。

### Electron 打包

现有配置具备基础：

- `asarUnpack` 包含 `node-pty` 和 `@movscript/mova*/vendor/**/bin/codex-app-server*`。
- `extraResources` 包含 backend、admin、provider plugin、ffmpeg、movcli。
- `win` target 配了 `nsis` 和 `portable`。

但缺口也清楚：

- 没有 `win.icon` 和 `icon.ico`。
- 没有 Windows code signing 的发布路径说明。
- 没有 Windows artifact 收集和 smoke 的稳定 workflow。
- 当前 release workflow 只包含 macOS arm64，所以 Windows 配置处在“有定义但未证明”状态。

### 后端与本地项目存储

Go 后端构建脚本能把 `GOOS=windows` 映射到 `movscript-server.exe`，这是好的。更大的风险在运行期：

- local sqlite/data dir 在 Windows 下通常没问题，但需要用真实 Windows runner 验证文件锁、路径长度、中文路径。
- git-http-backend 查找逻辑偏 Unix，需要支持 `.exe` 和 Windows 可执行发现。
- packaged backend 的 detached 行为和 pid 清理需要明确产品策略。

## 建议路线图

### 阶段 1：恢复发布口径

- `v0.1.8` 后的 release matrix 包含 macOS arm64 与 Windows x64。
- README、release notes 明确 Windows x64 首发限制。
- Windows arm64、Linux、Intel Mac 暂不加入正式 release matrix。

### 阶段 2：补 Windows 兼容 CI

新增一个非发布 workflow，例如 `windows-compat.yml`：

1. `windows-2022` + Node + pnpm + Go。
2. `pnpm install --frozen-lockfile`。
3. `pnpm run release -- check`。
4. `pnpm run release -- download-ffmpeg-static --platform=win32 --arch=x64`。
5. `pnpm run release -- package-desktop --platform=win32 --arch=x64 --unsigned`。
6. `pnpm run release -- smoke-desktop-package --platform=win32 --arch=x64`。
7. 上传 `apps/frontend/release` 和关键日志，失败时也保留 artifact。

先允许它失败，但要求每次改 Windows 相关代码时能手动跑。

### 阶段 3：修关键阻断

优先顺序：

1. Windows Home 默认路径和迁移策略。
2. app-server command parser 的 Windows 路径问题。
3. `movcli` 是否从 Windows 必需依赖里移除，或补 `.cmd` wrapper。
4. `Path`/`PATH` 统一。
5. `git-http-backend.exe` 查找和 executable 判断。
6. Windows `icon.ico`、签名策略、NSIS/portable 验证。

### 阶段 4：真实功能 smoke

在 Windows runner 上验证以下最小集：

- 首次启动，`MOVSCRIPT_HOME` 指向临时目录。
- backend 启动并写入 config、secret、log、pid。
- app-server 平台包解析并完成 stdio `initialize`。
- Home 下创建 `.mova` 或 `.codex` runtime home。
- 本地终端可创建、输出、关闭。
- ffmpeg `-version` 和一个小型转码任务通过。
- local HLS URL 能解析 Windows drive path。

### 阶段 5：触发发布

满足以下条件后触发 Windows 正式发布：

- `windows-compat` 连续 3 次 main 分支通过。
- Windows package artifact 能安装或 portable 启动。
- smoke 使用全新 `MOVSCRIPT_HOME` 通过。
- release notes 明确 Windows 版本、限制和签名状态。
- 如果无签名发布，安装器和 SmartScreen 风险需要在 release notes 中说明。

## 发布准入标准

Windows 进入 release matrix 前，至少需要通过：

- `pnpm install --frozen-lockfile` on Windows。
- `pnpm run release -- check` on Windows。
- `pnpm run release -- package-desktop --platform=win32 --arch=x64 --unsigned`。
- `pnpm run release -- smoke-desktop-package --platform=win32 --arch=x64`。
- `movscript-server.exe` 存在于 packaged resources。
- `codex-app-server.exe` 可从 `@movscript/mova-app-server-win32-x64` 解析并启动。
- `ffmpeg.exe` 存在、metadata 有效、能执行 `-version`。
- 首次启动使用 Windows 默认 Home，不写入仓库目录或 Electron `userData` 作为业务状态。
- 本地终端 PATH 正确，能运行 `movcli` 或确认该版本不依赖 movcli。

## 待定产品决策

- Windows 默认 Home 使用 `%LOCALAPPDATA%` 还是 `%APPDATA%`。
- Windows 首发只发 portable，还是同时发 NSIS。
- Windows 是否要求代码签名后再公开发布。
- `movcli` 是否仍是桌面 Windows 的必需依赖。
- Mova app-server 是否要沿用 `CODEX_HOME=<Movscript Home>/.mova`。
- Windows x64 之外是否规划 arm64。

## 已检查的关键文件

- `.github/workflows/release.yml`
- `package-resources.manifest.json`
- `apps/frontend/electron-builder.yml`
- `scripts/release/release-common.mjs`
- `scripts/release/release-workflow.mjs`
- `scripts/release/smoke-desktop-package.mjs`
- `apps/frontend/electron/services/desktopIdentity.ts`
- `apps/frontend/electron/services/movscriptWorkspaceDefaults.ts`
- `apps/frontend/electron/services/movscriptHomeInput.ts`
- `packages/core/src/workspace/node/paths.ts`
- `packages/core/src/workspace/node/runtime.ts`
- `apps/frontend/electron/services/appServerRuntimeCommand.ts`
- `apps/frontend/electron/services/appServerRuntimeContext.ts`
- `apps/frontend/electron/services/agentRuntimeHomeResolver.ts`
- `apps/frontend/electron/services/movscriptCliPath.ts`
- `apps/frontend/electron/services/localTerminalEnv.ts`
- `apps/frontend/electron/services/localTerminal.ts`
- `apps/frontend/electron/services/backend/paths.ts`
- `apps/frontend/electron/services/backend/spawn.ts`
- `apps/frontend/electron/services/mediaPipeline/ffmpegProbe.ts`
- `apps/frontend/electron/services/mediaPipeline/localHlsProtocol.ts`
- `apps/backend/scripts/build.mjs`
- `apps/backend/internal/interfaces/http/handler/project_git_http.go`
