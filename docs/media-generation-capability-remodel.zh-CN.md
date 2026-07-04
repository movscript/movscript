# Media Generation Capability Remodel

保留 3 个媒体生成 capability：

- `image_generation`
- `video_generation`
- `audio_generation`

不做运行时兼容，不接受旧 capability 和旧 operation alias。

模型目录的主能力只能来自：

- `image_generation`
- `video_generation`
- `audio_generation`

新任务 payload 使用粗粒度 `job_type`：

- `image`
- `video`
- `audio`

细分操作只能作为 provider/tool 参数进入执行层，不能重新变成公开产品 capability。
