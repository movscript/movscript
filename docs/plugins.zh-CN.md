# 插件

[English](plugins.md)

Movscript 支持通过本地插件扩展桌面生产工作台。插件契约仍处于早期阶段，稳定发布前可能变化。

## 主要区域

| 区域 | 路径 |
| --- | --- |
| Plugin SDK | `packages/plugin-sdk` |
| CLI 工具 | `apps/movcli` |
| 后端 manifest 导入 | `apps/backend/internal/infra/pluginkit` |
| 前端插件界面 | `apps/frontend/src/pages/plugins` 和 `apps/frontend/src/lib` |
| 第一方示例 | `plugins/` |

## 示例插件

第一方图像生成插件位于：

```text
plugins/image-generator
```

Manifest shape、package scripts 和 runtime 预期应优先参考第一方示例。

## 开发流程

```bash
pnpm install
pnpm --filter @movscript/plugin-sdk build
pnpm run build:plugins
make dev-movcli
```

随着 CLI 成熟，可以使用 `apps/movcli` 进行插件打包和 smoke test。

## 插件文档要求

修改插件支持时，应记录：

- Manifest 字段和兼容性预期。
- 必需 package metadata。
- Runtime permission 或 host capability。
- 插件在桌面 UI 中如何出现。
- 打包和验证命令。
- 已知不稳定或实验性字段。

## 稳定性

插件 manifest 和 runtime contract 还未稳定。插件示例和 release note 中应清晰标注实验能力。
