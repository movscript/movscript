# 桌面端打包规范

## 目录约定

- `apps/frontend/build/` 是 Electron Builder 的 `buildResources` 输入目录，需要提交到 git。
- `apps/frontend/release/` 是本机打包产物目录，不能提交到 git。
- `release-artifacts/` 是 CI/发布收集目录，不能提交到 git。
- `apps/frontend/vendor/sdk-runtimes/` 和 `apps/frontend/vendor/ffmpeg/` 是打包准备阶段生成或下载的资源，不能提交到 git。

## 本机 DMG 测试包

本机给自己或熟悉的朋友测试时，优先只打 DMG：

```sh
pnpm install --frozen-lockfile
pnpm run package:mac:dmg -- --arch=arm64
```

这个命令会执行：

1. 验证 Electron package resources 合同。
2. 下载并 stage 当前架构的 ffmpeg。
3. 构建 packages、movcli、admin、backend、frontend。
4. 从 `@movscript/mova` npm 包打入 app-server runtime。
5. 生成 unpacked `Movscript.app`。
6. 使用 ad-hoc 签名做本机测试包签名。
7. 用干净 `MOVSCRIPT_HOME` 跑 packaged app smoke test。
8. 从已签名 app 生成 DMG。
9. 校验 DMG，并挂载检查包内 app 签名和图标。

ad-hoc 签名只适合测试，不等同于正式分发签名。

## 正式分发

正式发给普通用户时，需要 Developer ID Application 签名和 Apple notarization。不要把证书、密码、API key 提交到仓库。
`apps/frontend/electron-builder.yml` 已启用 `hardenedRuntime`、entitlements 和 `mac.notarize: true`；正式打包时必须提供签名证书和 Apple notarization 凭据。

CI 或本机环境需要提供：

```sh
CSC_LINK=...
CSC_KEY_PASSWORD=...
APPLE_ID=...
APPLE_APP_SPECIFIC_PASSWORD=...
APPLE_TEAM_ID=...
```

或 App Store Connect API key：

```sh
APPLE_API_KEY=...
APPLE_API_KEY_ID=...
APPLE_API_ISSUER=...
```

发布前检查：

```sh
MOVSCRIPT_RELEASE_REQUIRE_SIGNING=1 \
pnpm run release -- verify-release-readiness --platform=darwin
```

正式 workflow 入口：

```sh
pnpm run release -- package-desktop --platform=darwin --arch=arm64
pnpm run release -- smoke-desktop-package --platform=darwin --arch=arm64
pnpm run release -- collect
```

正式产物至少要通过：

```sh
codesign --verify --deep --strict --verbose=2 apps/frontend/release/mac-arm64/Movscript.app
xcrun stapler validate apps/frontend/release/mac-arm64/Movscript.app
spctl --assess --verbose --type exec apps/frontend/release/mac-arm64/Movscript.app
hdiutil verify apps/frontend/release/Movscript-0.1.0-arm64.dmg
```
