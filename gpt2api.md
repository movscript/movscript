

## 模型支持
> 可通过 `GET /v1/models` 获取当前支持模型列表。

### Chat

| 模型名                               | mode                       | tier                          |
| :----------------------------------- | :------------------------- | :---------------------------- |
| `grok-4.20-0309-non-reasoning`       | `fast`                     | `basic`                       |
| `grok-4.20-0309`                     | `auto`                     | `basic`                       |
| `grok-4.20-0309-reasoning`           | `expert`                   | `basic`                       |
| `grok-4.20-0309-non-reasoning-super` | `fast`                     | `super`                       |
| `grok-4.20-0309-super`               | `auto`                     | `super`                       |
| `grok-4.20-0309-reasoning-super`     | `expert`                   | `super`                       |
| `grok-4.20-0309-non-reasoning-heavy` | `fast`                     | `heavy`                       |
| `grok-4.20-0309-heavy`               | `auto`                     | `heavy`                       |
| `grok-4.20-0309-reasoning-heavy`     | `expert`                   | `heavy`                       |
| `grok-4.20-multi-agent-0309`         | `heavy`                    | `heavy`                       |
| `grok-4.20-fast`                     | `fast`                     | `basic`，优先使用高等级账号池 |
| `grok-4.20-auto`                     | `auto`                     | `basic`，优先使用高等级账号池 |
| `grok-4.20-expert`                   | `expert`                   | `basic`，优先使用高等级账号池 |
| `grok-4.20-heavy`                    | `heavy`                    | `heavy`                       |
| `grok-4.3-beta`                      | `grok-420-computer-use-sa` | `super`                       |

### Image

| 模型名                    | mode   | tier    |
| :------------------------ | :----- | :------ |
| `grok-imagine-image-lite` | `fast` | `basic` |
| `grok-imagine-image`      | `auto` | `super` |
| `grok-imagine-image-pro`  | `auto` | `super` |

### Image Edit

| 模型名                    | mode   | tier    |
| :------------------------ | :----- | :------ |
| `grok-imagine-image-edit` | `auto` | `super` |

### Video

| 模型名               | mode   | tier    |
| :------------------- | :----- | :------ |
| `grok-imagine-video` | `auto` | `super` |

<br>

## API 一览

| 接口                                | 是否鉴权 | 说明                            |
| :---------------------------------- | :------- | :------------------------------ |
| `GET /v1/models`                    | 是       | 列出当前启用模型                |
| `GET /v1/models/{model_id}`         | 是       | 获取单个模型信息                |
| `POST /v1/chat/completions`         | 是       | 对话 / 图像 / 视频统一入口      |
| `POST /v1/responses`                | 是       | OpenAI Responses API 兼容子集   |
| `POST /v1/messages`                 | 是       | Anthropic Messages API 兼容接口 |
| `POST /v1/images/generations`       | 是       | 独立图像生成接口                |
| `POST /v1/images/edits`             | 是       | 独立图像编辑接口                |
| `POST /v1/videos`                   | 是       | 异步视频任务创建                |
| `GET /v1/videos/{video_id}`         | 是       | 查询视频任务                    |
| `GET /v1/videos/{video_id}/content` | 是       | 获取最终视频文件                |
| `GET /v1/files/video?id=...`        | 否       | 获取本地缓存视频                |
| `GET /v1/files/image?id=...`        | 否       | 获取本地缓存图片                |

<br>

## 接口示例

> 以下示例默认使用 `http://localhost:8000` 地址。

<details>
<summary><code>GET /v1/models</code></summary>
<br>

```bash
curl http://localhost:8000/v1/models \
  -H "Authorization: Bearer $GROK2API_API_KEY"
```

<details>
<summary>字段说明</summary>
<br>

| 字段            | 位置   | 说明                                                   |
| :-------------- | :----- | :----------------------------------------------------- |
| `Authorization` | Header | 当 `app.api_key` 非空时必填，格式为 `Bearer <api_key>` |

<br>
</details>

<br>
</details>

<details>
<summary><code>POST /v1/chat/completions</code></summary>
<br>

对话：

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GROK2API_API_KEY" \
  -d '{
    "model": "grok-4.20-auto",
    "stream": true,
    "reasoning_effort": "high",
    "deepsearch": "default",
    "messages": [
      {"role":"user","content":"你好"}
    ]
  }'
```

图像：

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GROK2API_API_KEY" \
  -d '{
    "model": "grok-imagine-image",
    "stream": true,
    "messages": [
      {"role":"user","content":"一只在太空漂浮的猫"}
    ],
    "image_config": {
      "n": 2,
      "size": "1024x1024",
      "response_format": "url"
    }
  }'
```

视频：

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GROK2API_API_KEY" \
  -d '{
    "model": "grok-imagine-video",
    "stream": true,
    "messages": [
      {"role":"user","content":"霓虹雨夜街头，电影感慢镜头追拍"}
    ],
    "video_config": {
      "seconds": 10,
      "size": "1792x1024",
      "resolution_name": "720p",
      "preset": "normal"
    }
  }'
```

<details>
<summary>字段说明</summary>
<br>

| 字段                    | 说明                                                                       |
| :---------------------- | :------------------------------------------------------------------------- |
| `messages`              | 支持文本与多模态内容块                                                     |
| `stream`                | 是否流式输出；不传时使用 `features.stream` 默认值                          |
| `reasoning_effort`      | `none`, `minimal`, `low`, `medium`, `high`, `xhigh`；`none` 会关闭思考输出 |
| `deepsearch`            | 深度搜索预设：`default`, `deeper`                                          |
| `temperature` / `top_p` | 采样参数，默认 `0.8` / `0.95`                                              |
| `tools`                 | OpenAI function tools 结构                                                 |
| `tool_choice`           | `auto`, `required` 或指定函数工具                                          |
| `image_config`          | 图像模型参数                                                               |
| \|_ `n`                 | `lite` 为 `1-4`，其他图像模型为 `1-10`，编辑模型为 `1-2`                   |
| \|_ `size`              | `1280x720`, `720x1280`, `1792x1024`, `1024x1792`, `1024x1024`              |
| \|_ `response_format`   | `url`, `b64_json`                                                          |
| `video_config`          | 视频模型参数                                                               |
| \|_ `seconds`           | `6`, `10`, `12`, `16`, `20`                                                |
| \|_ `size`              | `720x1280`, `1280x720`, `1024x1024`, `1024x1792`, `1792x1024`              |
| \|_ `resolution_name`   | `480p`, `720p`                                                             |
| \|_ `preset`            | `fun`, `normal`, `spicy`, `custom`                                         |

<br>
</details>

<br>
</details>

<details>
<summary><code>POST /v1/responses</code></summary>
<br>

```bash
curl http://localhost:8000/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GROK2API_API_KEY" \
  -d '{
    "model": "grok-4.20-auto",
    "input": "解释一下量子隧穿",
    "instructions": "用简洁的中文回答",
    "stream": true,
    "reasoning": {
      "effort": "high"
    }
  }'
```

<details>
<summary>字段说明</summary>
<br>

| 字段                    | 说明                                                 |
| :---------------------- | :--------------------------------------------------- |
| `model`                 | 模型 ID，需为已启用模型                              |
| `input`                 | 用户输入；支持字符串或 Responses API 风格的消息数组  |
| `instructions`          | 可选系统指令，会作为 system 消息注入                 |
| `stream`                | 是否流式输出；不传时使用 `features.stream` 默认值    |
| `reasoning`             | 可选思考配置                                         |
| \|_ `effort`            | `none` 会关闭思考输出；其他值会开启思考输出          |
| `temperature` / `top_p` | 采样参数，默认 `0.8` / `0.95`                        |
| `tools` / `tool_choice` | 支持函数工具；Responses API 的扁平工具格式会自动转换 |

<br>
</details>

<br>
</details>

<details>
<summary><code>POST /v1/messages</code></summary>
<br>

```bash
curl http://localhost:8000/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GROK2API_API_KEY" \
  -d '{
    "model": "grok-4.20-auto",
    "stream": true,
    "thinking": {
      "type": "enabled",
      "budget_tokens": 1024
    },
    "messages": [
      {
        "role": "user",
        "content": "用三句话解释量子隧穿"
      }
    ]
  }'
```

<details>
<summary>字段说明</summary>
<br>

| 字段                    | 说明                                                          |
| :---------------------- | :------------------------------------------------------------ |
| `model`                 | 模型 ID，需为已启用模型                                       |
| `messages`              | Anthropic Messages 格式消息，支持文本、图片、文档和工具结果块 |
| `system`                | 可选系统提示词，支持字符串或文本块数组                        |
| `stream`                | 是否流式输出；不传时使用 `features.stream` 默认值             |
| `thinking`              | 可选思考配置                                                  |
| \|_ `type`              | `disabled` 会关闭思考输出；其他配置会开启思考输出             |
| `max_tokens`            | 接收但当前会忽略，Grok 上游不暴露该参数                       |
| `tools` / `tool_choice` | 支持 Anthropic 工具格式，会转换为内部 function tools          |

<br>
</details>

<br>
</details>

<details>
<summary><code>POST /v1/images/generations</code></summary>
<br>

```bash
curl http://localhost:8000/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GROK2API_API_KEY" \
  -d '{
    "model": "grok-imagine-image",
    "prompt": "一只在太空漂浮的猫",
    "n": 1,
    "size": "1792x1024",
    "response_format": "url"
  }'
```

<details>
<summary>字段说明</summary>
<br>

| 字段              | 说明                                                                                |
| :---------------- | :---------------------------------------------------------------------------------- |
| `model`           | 图像模型：`grok-imagine-image-lite`, `grok-imagine-image`, `grok-imagine-image-pro` |
| `prompt`          | 图片生成提示词                                                                      |
| `n`               | 生成数量；`lite` 为 `1-4`，其他图像模型为 `1-10`                                    |
| `size`            | 支持 `1280x720`, `720x1280`, `1792x1024`, `1024x1792`, `1024x1024`                  |
| `response_format` | `url` 或 `b64_json`                                                                 |

<br>
</details>

<br>
</details>

<details>
<summary><code>POST /v1/images/edits</code></summary>
<br>

```bash
curl http://localhost:8000/v1/images/edits \
  -H "Authorization: Bearer $GROK2API_API_KEY" \
  -F "model=grok-imagine-image-edit" \
  -F "prompt=把这张图变清晰一些" \
  -F "image[]=@/path/to/image.png" \
  -F "n=1" \
  -F "size=1024x1024" \
  -F "response_format=url"
```

<details>
<summary>字段说明</summary>
<br>

| 字段              | 说明                                           |
| :---------------- | :--------------------------------------------- |
| `model`           | 图像编辑模型，目前为 `grok-imagine-image-edit` |
| `prompt`          | 编辑指令                                       |
| `image[]`         | 参考图片，multipart 文件字段；最多使用 5 张    |
| `n`               | 生成数量，范围 `1-2`                           |
| `size`            | 当前仅支持 `1024x1024`                         |
| `response_format` | `url` 或 `b64_json`                            |
| `mask`            | 暂不支持；传入会返回校验错误                   |

<br>
</details>

<br>
</details>

<details>
<summary><code>POST /v1/videos</code></summary>
<br>

```bash
curl http://localhost:8000/v1/videos \
  -H "Authorization: Bearer $GROK2API_API_KEY" \
  -F "model=grok-imagine-video" \
  -F "prompt=霓虹雨夜街头，电影感慢镜头追拍" \
  -F "seconds=10" \
  -F "size=1792x1024" \
  -F "resolution_name=720p" \
  -F "preset=normal" \
  -F "input_reference[]=@/path/to/reference.png"
```

```bash
curl http://localhost:8000/v1/videos/<video_id> \
  -H "Authorization: Bearer $GROK2API_API_KEY"

curl -L http://localhost:8000/v1/videos/<video_id>/content \
  -H "Authorization: Bearer $GROK2API_API_KEY" \
  -o result.mp4
```

<details>
<summary>字段说明</summary>
<br>

| 字段                | 说明                                                               |
| :------------------ | :----------------------------------------------------------------- |
| `model`             | 视频模型，目前为 `grok-imagine-video`                              |
| `prompt`            | 视频生成提示词                                                     |
| `seconds`           | 视频长度：`6`, `10`, `12`, `16`, `20`                              |
| `size`              | 支持 `720x1280`, `1280x720`, `1024x1024`, `1024x1792`, `1792x1024` |
| `resolution_name`   | `480p` 或 `720p`                                                   |
| `preset`            | `fun`, `normal`, `spicy`, `custom`                                 |
| `input_reference[]` | 可选图生视频参考图，multipart 文件字段；最多使用前 5 张            |
| `video_id`          | `POST /v1/videos` 返回的视频任务 ID，用于查询任务或下载成片        |

<br>
</details>

<br>
</details>

<br>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Chenyme/grok2api&type=Timeline)](https://star-history.com/#Chenyme/grok2api&Timeline)
