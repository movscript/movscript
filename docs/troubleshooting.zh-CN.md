# 故障排查

## 本地后端启动失败

- 在应用设置中确认启动方式为“本地启动”。
- 点击启动失败遮罩中的“重试启动”。
- 开发环境确认已运行 `make dev-frontend-local`，该命令会先构建后端和管理后台。

## 管理后台打不开

- 确认本地后端健康检查可用：`curl http://localhost:8766/health`。
- 确认管理后台地址为 `http://localhost:8766/admin`。
- 如果使用外部后端，确认后端启动时能找到 admin 静态资源。

## 没有可用模型

- 打开 `http://localhost:8766/admin/models`。
- 添加供应商凭据并启用模型。
- 确认凭据和模型都没有被禁用。

## 视频剪辑找不到 ffmpeg

- 本机剪辑只在桌面端可用，纯浏览器会话无法启动本机剪辑进程。
- 如果剪辑弹窗提示缺少 ffmpeg，先查看弹窗中的预期随包路径。打包后的应用会查找 `resources/ffmpeg/<platform>/<arch>/<binary>`。
- 开发环境可以使用 `FFMPEG_PATH`、`MOVSCRIPT_FFMPEG_PATH`，或 `PATH` 中的 `ffmpeg`。
- 发布包不要指向 Homebrew、MacPorts、Linuxbrew、apt/dnf、Nix、snap、Chocolatey、Scoop、winget 或其他包管理器安装。请用 `pnpm run release:stage-ffmpeg` 登记明确可再分发的二进制。
- `MOVSCRIPT_FFMPEG_BIN` 可以指向实际的 `ffmpeg` / `ffmpeg.exe` 可执行文件，也可以指向包含该可执行文件的解压后 binary build 目录。它不能指向 FFmpeg 源码树；Movscript 在 staging 或 release 时不会自动从源码编译 FFmpeg。
- 如果还没准备好 metadata，想先检查下载内容，运行 `MOVSCRIPT_FFMPEG_BIN=/path/to/extracted-binary-dir pnpm run release:inspect-ffmpeg -- --platform=darwin --arch=arm64`。该命令会打印 staging 将使用的可执行文件。
- 发布前运行 `pnpm run release:audit-ffmpeg:matrix`。如果输出 `stage with:`，对每个缺失的平台和架构执行建议的 `release:download-ffmpeg-static` 命令。
