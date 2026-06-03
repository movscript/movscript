目标：
通过 agent-owned generation provider interface 提交和观察视频生成任务，包括 text-to-video 和 reference image/video-to-video。

边界：
- 生成能力由 agent harness 定义；具体 provider 由 desktop、MCP server 或插件实现。
- 不依赖 MovScript 产品实现名；调用公开接口 `generation_video_generate` 和 `generation_video_job_get`。
- 用户发起的生成任务必须通过 `core_work_start` 创建 `kind:"generation_job"` runtime work，不要直接调用同步 provider 工具完成整个用户请求。
- `generation_video_generate` 只负责同步提交后端任务并返回 job id；`generation_video_job_get` 只负责查询 job 状态。
- 若 provider 工具不可用，说明当前桌面或插件 provider 未注册，不要臆造结果。

绝不：
- 不要绕过 `core_work_start` 直接用 provider tool 完成用户发起的生成请求。
- 不要在 provider 未注册、任务未完成或任务失败时声称已经产出视频。
- 不要伪造 job id、输出资源 ID、模型能力或 provider 返回状态。
- 不要把 provider-specific 参数提升为公共接口字段，除非 tool schema 已明确声明。

允许的工具：
- {{tool:generation_model_list}}
- {{tool:generation_video_generate}}
- {{tool:generation_video_job_get}}
- {{tool:core_work_start}}
- {{tool:core_work_get}}
- {{tool:core_work_list}}
- {{tool:core_work_wait}}

流程：
1. 当用户请求视频生成、文生视频、图生视频或参考视频生成时，先判断是否需要模型能力信息。涉及参考资源数量、画幅、时长、fps、质量、provider 参数或指定模型时，调用 `generation_model_list`。
2. 用简洁、生产导向的 prompt 描述主体、运动、镜头、构图、风格和时长要求。provider-specific 参数放入 `extra_params`，除非接口 schema 暴露了顶层字段。
3. 通过 `core_work_start` 创建 runtime work：
```json
{
  "kind": "generation_job",
  "request": {
    "tool": "generation_video_generate",
    "args": {
      "prompt": "..."
    },
    "observeTool": "generation_video_job_get"
  },
  "continuationPolicy": {
    "mode": "any_completed",
    "groupId": "video-generation"
  }
}
```
4. 参考资源使用 `input_resource_ids` 或 `reference_resource_ids`。没有参考资源时 provider 应提交 text-to-video；有参考资源时 provider 应提交 reference-to-video。
5. 用 `core_work_get/list/wait` 观察返回的 work handle。不要反复直接调用 `generation_video_job_get` 来替代 runtime work 生命周期。

输出：
说明生成请求、模型或参数选择、runtime work id、当前状态、输出资源 ID、失败原因和下一步建议。
