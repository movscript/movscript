<p align="center">
  <img src="assets/logo.png" alt="Movscript" width="96" />
</p>

<h1 align="center">Movscript</h1>

<p align="center">
  面向 Vibe Motion、AI 规划成片与自动剪辑的视频创作工具。
</p>

<p align="center">
  简体中文 | <a href="README.md">English</a>
</p>

<p align="center">
  <a href="#介绍">介绍</a> |
  <a href="#产物">产物</a> |
  <a href="#docker">Docker</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue" />
</p>

## 介绍

Movscript 是一个面向 Vibe Motion、AI 规划成片与自动剪辑的视频创作工具。它帮助创作者把脚本、参考素材和创意方向转化为可规划、可编辑、可预览的视频工作流。

Movscript 的核心思路是先描述动态影像的意图、感觉、节奏和结构，再让系统协助组织项目、剧本、素材、分镜、镜头、生成任务、模型配置、助手工作流和粗剪版本。

项目仍处于早期阶段。功能、文件格式、插件行为和工作流在稳定版本发布前可能继续调整。

## 产物

### 桌面应用

当前发布目标：

- macOS Apple Silicon / arm64

最新桌面包可以在 [GitHub Releases](https://github.com/movscript/movscript/releases/latest) 下载。

每个版本的更新内容、已知问题、校验文件和历史版本会记录在 [Movscript releases 页面](https://github.com/movscript/movscript/releases)。

Intel Mac、Windows 和 Linux 桌面包暂未发布，后续版本再补充。

## Docker

Docker 配置用于运行后端服务栈，方便集成和部署测试。它不是桌面应用的替代品。

包含服务：

- Backend API
- PostgreSQL
- MinIO
- Redis
- Gitea
- 可选 Prometheus 和 Grafana 观测栈

### 启动服务

```bash
docker compose up -d --build
```

默认本地地址：

| 服务 | 地址 |
| --- | --- |
| Backend API | `http://localhost:8765` |
| MinIO Console | `http://localhost:9001` |
| Gitea | `http://localhost:3003` |

### 启动观测栈

```bash
docker compose --profile observability up -d --build
```

默认观测地址：

| 服务 | 地址 |
| --- | --- |
| Grafana | `http://localhost:3002` |
| Prometheus | `http://localhost:9091` |

### 停止服务

```bash
docker compose down
```

同时清理本地 Docker 数据卷：

```bash
docker compose down -v
```

## 文档

- [docs/provider-model-route-console-boundaries.zh-CN.md](docs/provider-model-route-console-boundaries.zh-CN.md)

## 许可证

Movscript 使用 [Apache License 2.0](LICENSE)。
