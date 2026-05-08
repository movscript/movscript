# 发布检查清单

[English](release-checklist.md)

发布 GitHub Release 或公开里程碑前，使用这份清单做最后检查。

## 版本和 Changelog

- 确认 `package.json` 和各 package manifest 中的版本。
- 更新 `CHANGELOG.md`，写明用户可见变更、迁移说明和已知限制。
- 明确标注不稳定 API、插件契约和 Agent 契约。

## 许可证和治理

- 确认 `LICENSE`、`LICENSE_SCOPE.md` 和 README 中的许可证表述一致。
- 确认贡献指南、安全策略和行为准则已经从 README 链接。
- 检查 vendored 或 bundled 第三方文件是否需要额外 notice。

## 文档

- 从干净 checkout 验证 README quick start。
- 检查 `README.md` 和 `README.zh-CN.md` 的语言切换链接。
- 检查 `docs/README.md` 和 `docs/README.zh-CN.md` 索引。
- 验证本地 Markdown 链接。
- 存储、provider 调用、日志或 Agent memory 行为变化时，重新检查数据与隐私说明。
- 如果 UI 有明显变化，更新截图或 demo。

## 安全

- 确认没有提交 `.env`、provider key、本地数据库、对象存储数据、生成的二进制或私有凭证。
- 每个部署环境使用唯一的 `ENCRYPTION_KEY` 和 `AUTH_TOKEN_SECRET`。
- 除非有明确保护，否则不要把 PostgreSQL、Redis、MinIO 和本地 Agent endpoint 暴露到公网。
- 如果 log、backup 或开发文件暴露，请轮换 provider key。

## 构建和测试

运行完整检查：

```bash
make test
make build
```

桌面包：

```bash
pnpm run package:desktop
```

准备平台产物时使用对应命令：

```bash
pnpm run package:desktop:mac
pnpm run package:desktop:win
pnpm run package:desktop:win:arm64
```

## GitHub Release

- 从目标 commit 创建 tag。
- 平台产物完成本地 smoke test 后再上传。
- Release note 包含安装说明、升级说明、已知问题和兼容性警告。
- 链接文档索引和 changelog。
