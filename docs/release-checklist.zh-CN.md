# 发布检查清单

发布前至少确认：

- `pnpm run typecheck`
- `pnpm run test:backend`
- `pnpm run test:agent-run-debugging`
- `pnpm --filter movscript-frontend typecheck`
- `pnpm --filter movscript-admin typecheck`
- AgentRun 调试页或 Agent 运行链路有变更时，`pnpm run test:agent-run-debugging:e2e` 通过，并归档 `agent-run-debugging-playwright-results`。
- 管理后台静态资源已构建并复制。
- 本地桌面模式可启动 `http://localhost:8766`。
- 管理后台 `http://localhost:8766/admin` 可打开。
- 缺模型时 UI 能引导到模型管理。
- 桌面端视频剪辑使用前端本机 ffmpeg，不依赖后端算力；发布前确认已按 `apps/frontend/vendor/ffmpeg/README.md` 准备可再分发二进制。
- ffmpeg 随包目录至少包含当前目标平台与架构文件：`apps/frontend/vendor/ffmpeg/darwin/arm64/ffmpeg`、`apps/frontend/vendor/ffmpeg/linux/x64/ffmpeg` 或 `apps/frontend/vendor/ffmpeg/win32/x64/ffmpeg.exe`。
- 默认 ffmpeg 来源是 `eugeneware/ffmpeg-static`。单个支持目标使用 `pnpm run release:download-ffmpeg-static -- --platform=darwin|linux|win32 --arch=x64|arm64`，完整默认矩阵使用 `pnpm run release:download-ffmpeg-static:matrix`；GitHub release workflow 会在检查和打包 job 前执行这些下载步骤。由于该来源不发布 `win32 arm64` 二进制，默认发布矩阵不包含 Windows ARM64。
- 不要直接随包 Homebrew、MacPorts、Linuxbrew、apt/dnf 系统路径、Nix、snap、Chocolatey、Scoop、winget 或其他包管理器安装；`release:stage-ffmpeg` 会拒绝常见包管理器和系统目录。
- 如使用非默认来源，手动 staging 前将 `ACTUAL_FFMPEG_RELEASE_URL` 设置为真实上游发布页或 artifact URL。
- 手动兜底命令：`MOVSCRIPT_FFMPEG_BIN=/path/to/ffmpeg MOVSCRIPT_FFMPEG_SOURCE_URL=$ACTUAL_FFMPEG_RELEASE_URL MOVSCRIPT_FFMPEG_LICENSE=GPL-3.0-or-later pnpm run release:stage-ffmpeg -- --platform=darwin|linux|win32 --arch=x64|arm64`
- 跨平台或跨架构 staging 时追加 `-- --platform=darwin|linux|win32 --arch=x64|arm64`，或设置 `MOVSCRIPT_FFMPEG_PLATFORM` 与 `MOVSCRIPT_FFMPEG_ARCH`；当目标平台或架构不是当前机器时，还需将 `MOVSCRIPT_FFMPEG_VERSION` 设置为该二进制 `ffmpeg -version` 的第一行。
- `pnpm run release:audit-ffmpeg`
- 如发布单一目标架构的跨平台包，执行 `pnpm run release:audit-ffmpeg:all`
- 如发布完整平台与架构矩阵，执行 `pnpm run release:audit-ffmpeg:matrix`
- 如果 ffmpeg 审计输出 `stage with:`，对每个缺失的平台与架构执行对应命令。
- `pnpm run release:check` 会先执行完整 ffmpeg 矩阵审计；缺少二进制时，发布 CI 会在启动打包矩阵前失败。
- `pnpm run test:release-scripts`
- `pnpm run package:desktop` 或对应显式目标命令通过，例如 `package:desktop:mac:x64`、`package:desktop:mac:arm64`、`package:desktop:linux:x64`、`package:desktop:linux:arm64`、`package:desktop:win`，并确认 `pnpm run release:verify-desktop` 成功。
- `release:verify-desktop` 会确认打包后的 Electron resources 包含 `resources/ffmpeg/<platform>/<arch>/<binary>`，验证包含目标架构在内的 metadata，并比较它与 staged vendor binary 的 hash。
