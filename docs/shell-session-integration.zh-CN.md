# Shell Session Integration

状态：实施标准

Remotion Studio 等需要用户可见进程的操作通过 DesktopShellHost API 交给可视化 Shell surface，而不是由 daemon 私自持有 child process。

## DesktopShellHost API

- `createDesktopShellHostSession(input)` 创建 shell session。
- `runDesktopShellHostCommand(input)` 运行 shell command。
- 用户界面使用“在 Shell 打开”表达显式的可见 shell 操作。

Shell intent 使用 `movscript.shell_intent.v1`，包含 ownerFeature、command、cwd、destructive 等字段。daemon 只生成 intent 和 readiness 状态，Shell Host 负责具体进程所有权。
