七、API 使用示例
所有 API 完全兼容 OpenAI 官方 SDK,把 base_url 换成你的部署地址即可。

7.1 生图(同步,单张)
curl https://your-domain.com/v1/images/generations \
  -H "Authorization: Bearer sk-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "a cute orange cat playing with yarn, studio ghibli style",
    "n": 1,
    "size": "1024x1024"
  }'
返回(已经是 HMAC 签名的图片代理地址,可直接 <img src> 嵌入):

{
  "created": 1776582860,
  "data": [
    {
      "url": "https://your-domain.com/p/img/img_2631ffad.../0?exp=...&sig=..."
    }
  ]
}
可选:本地 2K / 4K 高清放大 —— 在 body 里加 "upscale": "2k" 或 "upscale": "4k",后端会在图片代理 URL 首次被请求时对原图做 Catmull-Rom 插值放大并以 PNG 返回(长边 2560 / 3840 等比缩)。算法本地执行,不调用任何外部服务;首次 0.51.5s,之后进程内 LRU 毫秒级命中。请注意这是传统插值算法,不是 AI 超分,不会补出新纹理。详见 8.2 4K / 2K 高清输出。

7.2 图生图 / 多图参考(项目扩展字段)
curl https://your-domain.com/v1/images/generations \
  -H "Authorization: Bearer sk-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "将这两张图合成为赛博朋克风格的海报",
    "n": 2,
    "size": "1792x1024",
    "reference_images": [
      "https://example.com/ref1.jpg",
      "data:image/png;base64,iVBORw0KG..."
    ]
  }'
7.3 Python(OpenAI SDK)
from openai import OpenAI

client = OpenAI(
    base_url="https://your-domain.com/v1",
    api_key="sk-xxx",
)

resp = client.images.generate(
    model="gpt-image-2",
    prompt="cyberpunk alley in the rain, cinematic lighting",
    n=2,
    size="1792x1024",
)
for img in resp.data:
    print(img.url)
7.4 异步(适合慢 prompt / 批量场景)
# 提交任务
curl -X POST https://your-domain.com/v1/images/generations \
  -H "Authorization: Bearer sk-xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-2","prompt":"...", "async":true}'
# 返回 {"task_id":"img_xxx","status":"queued"}

# 轮询结果
curl https://your-domain.com/v1/images/tasks/img_xxx \
  -H "Authorization: Bearer sk-xxx"