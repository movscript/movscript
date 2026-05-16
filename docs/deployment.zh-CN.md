# 部署

当前仓库主要面向本地桌面和开发环境。

可用构建命令：

```bash
pnpm run build
pnpm run package:desktop
pnpm run package:desktop:mac:x64
pnpm run package:desktop:mac:arm64
pnpm run package:desktop:linux:x64
pnpm run package:desktop:linux:arm64
pnpm run package:desktop:win
pnpm run package:desktop:win:arm64
```

后端可以单独构建：

```bash
pnpm run build:backend
```

桌面包发布前应确认管理后台静态资源已复制到后端资源目录，目标平台和架构的可再分发 ffmpeg 二进制已 staged，并验证本地后端、SQLite、资源存储和管理后台入口可用。完整矩阵发布前执行 `pnpm run release:audit-ffmpeg:matrix`。
