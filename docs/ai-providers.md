# AI Providers

AI provider code lives in `apps/backend/internal/ai`. Providers are selected through admin-configured credentials and model configs, then invoked by feature flows and generation jobs.

## Supported Adapter Types

| Adapter type | Purpose |
| --- | --- |
| `openai_compat` | OpenAI-compatible text, image, image-edit, and video APIs. |
| `anthropic` | Anthropic text models. |
| `gemini` | Google Gemini text/image/video models. |
| `kling` | Kling image/video generation APIs. |
| `volcen` | Volcengine Ark, Seedream, and Seedance style flows. |
| dry-run | Local testing provider behavior where implemented. |

Adapter definitions, credential fields, default base URLs, supported file APIs, parameter sets, and model presets are declared in `catalog.go`.

## Capability Model

Capabilities are defined in `feature.go`:

| Capability | Meaning |
| --- | --- |
| `text` | Text generation. |
| `reasoning` | Reasoning text model path. |
| `image` | Text-to-image. |
| `image_edit` | Image-to-image or image editing. |
| `video` | Text-to-video. |
| `video_i2v` | Image-to-video. |
| `video_v2v` | Video-to-video. |
| `audio` | Placeholder for future audio flows. |

Feature configs map product features to allowed model configs. Tool features currently include reference image generation, reference video generation, motion imitation, style transfer, multi-angle, and brainstorm.

## Configuration Flow

1. A `super_admin` configures adapter credentials in the admin UI.
2. Secret fields are encrypted with `ENCRYPTION_KEY`.
3. The admin creates model configs under credentials and declares capabilities, billing mode, prices, media input limits, image edit field names, and supported generation parameters.
4. Feature configs decide which model configs are allowed for each product feature and which model is the default.
5. User-facing pages call feature/model APIs and create `GenJob` records.
6. The generation worker resolves the model config and dispatches to the selected provider adapter.

## Generation Jobs

`GenJob.job_type` values include:

- `image`
- `image_edit`
- `video`
- `video_i2v`
- `video_v2v`

Job status values are:

- `pending`
- `running`
- `succeeded`
- `failed`
- `cancelled`

Async provider task state is stored separately in provider task fields when a provider returns a task ID and requires polling.

## Parameter Handling

Adapters expose user-configurable `ParamDef` values for supported capabilities. `NormalizeGenerationParams` maps older provider-native keys to canonical UI keys, for example:

| Canonical key | Backward-compatible source |
| --- | --- |
| `aspect_ratio` | `ratio` |
| `duration` | `duration_seconds` |
| `image_size` | `size` |
| `prompt_strength` | `guidance_scale` |
| `image_count` | `max_images` |
| `fixed_camera` | `camera_fixed` |
| `audio` | `generate_audio` |

## Development Checklist

When adding or changing a provider:

- Implement the provider interface in `apps/backend/internal/ai`.
- Register the adapter in the provider registry.
- Add or update adapter definitions and parameter sets in `catalog.go`.
- Add validation, debug sanitization, and catalog tests.
- Confirm supported capabilities, media input limits, billing mode, and supported params.
- Update this document and any admin UI copy.
- Never log raw API keys, signed URLs, file contents, or provider secrets.
