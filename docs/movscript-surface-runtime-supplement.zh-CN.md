# MovScript Surface Runtime Supplement

Desktop 是本机可视化工作台，负责把本机 runtime 状态、项目页面、资源面板、编辑面板和 agent 会话组织成一个一致的产品体验。

本机 full runtime owner 是 per-user `movscript.local-node` daemon。Desktop、Project Surface、Editing Surface、Resource Surface 和 Agent Plugin 都应该把 daemon gateway 当成稳定入口，而不是各自发现或直连内部业务服务。

`local-surface-host` 和 `desktop-surface-host` 都只是 surface 承载形态；Project/Editing/Data 能力必须通过 daemon gateway 和同一套 runtime context 进入。

Plugin 不接管一组独立 headless runtime。多个 Agent 会话必须复用同一个 daemon，这样 project read-model、candidate decision、editing timeline、media pipeline job 和 data connection 都落在同一套本机事实与同一条 gateway 边界上。

Surface 层可以知道能力 namespace，例如 `/v1/project/*`、`/v1/editing/*` 和 `/v1/media-pipeline/*`，但不能知道这些 namespace 背后由哪个进程、端口或内部 service record 承载。服务拓扑变化应该只影响 daemon/gateway 层。
