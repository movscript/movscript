# MovScript 存储概念记录

更新时间：2026-04-27

## 1. 内部资源存储

用途：MovScript 自己持久化资源，包含用户上传文件、画布中间产物、模型输出结果。

当前实现：

- 后端接口统一通过 `storage.Storage` 读写。
- 目前实际后端是 MinIO（S3-compatible），资源表字段是 `raw_resources.storage_backend` 和 `raw_resources.storage_key`。
- 未来如果接入 S3、OSS、TOS 作为主存储，它们也属于“内部资源存储”，语义仍然是 MovScript 后端可读写的资源仓库。

重要边界：

- 内部资源存储的 DirectURL/presigned URL 不等于服务商可访问 URL。
- Docker 内部的 `http://minio:9000/...` 只对容器网络可达，不能传给 Volcen/OpenAI/Kling 等外部服务商。
- Worker 可以从内部资源存储读取 bytes，但不能把内部私网 URL 当作模型输入 URL。

## 2. 服务商云端文件空间

用途：把输入素材上传到 AI 服务商自己的 Files API，由服务商返回 `file_id`，后续模型调用传 `file_id`。

典型服务商：

- OpenAI-compatible Files API
- Volcen Ark Files API

配置位置：

- 管理后台 -> 模型管理 -> 凭据 -> Files API 预上传
- 配置跟具体 AI 凭据绑定，而不是全局资源存储配置。

适用场景：

- 服务商接口支持 `file_id` 输入。
- 需要避免大文件 multipart 直传到推理接口。
- 文件只服务于模型调用，不作为 MovScript 的长期资源仓库。

限制：

- 并不是所有生成接口都支持 `file_id`。
- 例如 Volcen 视频生成任务 `content.image_url.url` 支持公网 URL、data URL、素材 ID，但不是通用 `file_id` 输入。

## 3. 公网对象中转

用途：当服务商接口只接受 URL，而内部 MinIO 又不对公网开放时，Worker 临时把输入素材上传到公网对象存储，然后把公网 URL 传给服务商。

当前实现：

- 后端模块：`backend/internal/cloudup`
- 配置表：`cloud_file_configs`
- 支持类型：S3、阿里云 OSS、火山 TOS
- 管理后台页签：输入中转

适用场景：

- Volcen/Kling 等图生视频或视频参考输入只接受可访问 URL。
- 输入文件较大，不适合或不允许使用 base64/data URL。

配置要求：

- `public_base_url` 必须是服务商公网可访问的地址。
- 桶权限或对象权限需要允许服务商读取。
- 这个配置不是 MovScript 的主资源仓库，只是模型输入中转通道。

## Worker 规则

- Worker 从内部资源存储读取 bytes。
- Worker 不把内部资源存储 DirectURL 写入 `MediaData.PresignedURL`。
- 只有公网对象中转上传成功后，才把返回 URL 作为 `MediaData.PresignedURL` 传给 adapter。
- 如果服务商接口支持 bytes/multipart/data URL，adapter 可以使用 bytes fallback。
- 如果服务商接口必须公网 URL 且没有中转配置，应失败并提示配置输入中转，而不是把私网 MinIO URL 发给服务商。
