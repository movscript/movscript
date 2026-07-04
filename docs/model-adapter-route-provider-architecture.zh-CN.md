# Model Adapter Route Provider Architecture

Movscript 的模型调用路径分为 provider、provider instance、model catalog、route binding 和 generation tool capability。

## Baseline

- Provider 描述外部平台能力和认证方式。
- Provider instance 保存具体账号、endpoint、credential 和 route 配置。
- Model catalog 记录模型能力、输入输出模态和默认工具映射。
- Route binding 将产品 capability 路由到 provider instance 和模型。
- Admin surface 和 CLI/MCP 管理命令共享同一套契约。
