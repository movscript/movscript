# 插件

插件相关代码位于：

- `apps/movcli`: 插件打包和调试 CLI。
- `packages/plugin-sdk`: TypeScript 插件 SDK。
- `plugins/*`: 第一方插件示例。

常用命令：

```bash
make dev-movcli
pnpm run build:plugins
```

插件应通过声明式 manifest 暴露能力，并避免直接绕过后端数据边界。
