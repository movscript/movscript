# Movscript 产品定位与 Agent 工作流

Movscript 是面向 AI 视频创作的生产控制平面。它不只提交单次生成任务，而是把项目结构、素材、脚本、镜头意图、候选结果、选择决策和后续剪辑组织在一个可追踪的工作区里。

## 产品定位

- 面向创作者和 Agent 协作，而不是只面向单个模型 API。
- 以项目、时间线命名空间、场景瞬间、表达单元、素材和内容单元组织创作状态。
- 将生成结果作为候选项保存，并把人工或 Agent 的选择记录为可复查的决策。
- Desktop、Agent Plugin 和 CLI 复用同一个本机 runtime daemon，避免每个入口各自拥有一套本地服务。

## Agent 工作流

1. 确认用户目标、项目位置和目标粒度。
2. 读取项目上下文、时间线命名空间、已有素材和内容单元。
3. 在源文件中补齐必要结构，例如场景瞬间、表达单元、关键帧、故事板或内容单元。
4. 构造生成 prompt、引用素材和模型意图。
5. 提交生成任务并登记候选结果。
6. 协助用户审阅、选择、替换或接受 stale 结果。
7. 对需要整段播放或最终剪辑的范围，进入 production editing workspace。

## 边界

- 时间线命名空间负责组织范围和 review 粒度，不直接拥有生成候选。
- 可生成的工作应落在系统原语或内容单元上，例如 `scene_moment`、`expression_unit`、`asset`、`keyframe`、`storyboard`、`audio_cue` 和 `content_unit`。
- Agent 需要显式使用项目 locator 或 `projectUid`，不要依赖 UI 焦点推断目标项目。
