# Agent Visual Generation

This note records the product contract for Agent-driven image and video generation.

## Product Contract

- Image and video generation are asynchronous jobs. Creating a job is not a completed result.
- The Agent must monitor generation jobs until they reach `succeeded`, `failed`, `cancelled`, or a monitoring timeout.
- Progress is surfaced as structured generation trace events and as a live chat progress card, including monitoring/update timing when trace timestamps are available.
- Monitoring emits heartbeat trace updates while long-running jobs remain active even when provider status/progress is unchanged, so the user can see that the Agent is still watching the job.
- The Agent may only claim generated media after the tool result includes an output resource or media preview.
- Final assistant messages collect generated image/video resources from tool results and generation trace events, then render them as visible media attachments.
- Generated media attachments carry the source job metadata (`jobId`, `jobType`, `status`, `stage`) when that metadata is present in trace events, and the chat renders a generated-result card with copyable resource references.
- Generation trace events also carry provider/model metadata (`providerName`, `modelDisplay`, `modelIdentifier`, `modelConfigId`) when the backend job exposes it, and the final job/result cards render those fields for auditability.
- Final assistant messages also persist a generated-job summary card and a process summary card, so `failed`, `cancelled`, `timeout`, and mixed multi-job outcomes remain visible even when no media resource was produced.
- Generation progress and job summary cards expose stable test hooks and accessible progress bars for browser-level regression coverage.
- The generated-result card provides an explicit binding action for generated resources. Users choose a production target type (`asset_slot`, `content_unit`, or `storyboard_line`), search/select a target object with manual ID fallback, preview the selected target summary, then the frontend creates a `selected` `output` resource binding through `POST /projects/:id/resource-bindings`.
- Stopping an active Agent run should also attempt to cancel the active backend generation job.

## Runtime Flow

1. The Agent calls `movscript_create_generation_job`.
2. The MCP tool returns a normalized job payload and a `monitor` instruction for `movscript_get_generation_job`.
3. `agentGraph` runs an automatic monitor loop and emits `GenerationEvent` records when state, progress, output, or the monitor heartbeat changes.
4. `agentRuntime` persists those records as trace events.
5. `AIAgentPanel` renders progress from live trace events and resolves final media attachments and job summaries through the shared trace replay helper using run steps, live events, and persisted trace events.
6. For accepted outputs, the user can bind the generated resource to a production object from the generated-result card. The binding is explicit; the Agent does not silently write generated media into production entities.
7. Frontend trace replay helpers can summarize persisted/live generation trace events into jobs, resources, provider metadata, timing, and terminal counts for UI rendering, regression tests, and provider replay debugging.
8. Provider replay fixtures cover representative generation lifecycles (`running -> succeeded`, `failed`, `timeout`) and include sanitized provider-shaped traces for success-with-media and terminal failure. New providers must add sanitized replay traces before they are considered covered.

## Plugin Contract

The plugin SDK exposes `generateMedia()` for image and video generation:

- Image jobs: `image`, `image_edit`.
- Video jobs: `video`, `video_i2v`, `video_v2v`.
- `generateImage()` remains available for compatibility, but new plugins should call `generateMedia()`.

First-party plugins:

- `plugins/image-generator`
- `plugins/video-generator`

`movcli build` must preserve plugin `contributes` metadata so installed plugins keep their canvas node definitions.

## Verification

Required checks for this area:

- `pnpm run test:agent-generation`
- `pnpm --filter movscript-agent test`
- `pnpm --filter movscript-agent typecheck`
- `pnpm --filter movscript-frontend test`
- `pnpm --filter movscript-frontend test:generation-replay`
- `pnpm --filter movscript-frontend test:generation-ui`
- `pnpm --filter movscript-frontend test:generation-e2e`
- `pnpm --filter movscript-frontend test:generation-electron`
- `pnpm --filter movscript-frontend typecheck`
- `pnpm --filter @movscript/plugin-sdk build`
- `pnpm --filter movcli build`
- `pnpm run build:plugins`

Agent tests cover successful generation monitoring, failed jobs, cancelled jobs, timeout monitoring, generation inspection policy, and cancellation approval policy.
Frontend/Electron tests cover MCP generation job normalization, provider progress/stage variants, generated media/resource extraction, async job progress consolidation, generation trace replay summaries and fixtures, generation monitoring timestamps, generation display view models, UI contract hooks/progressbar accessibility, provider/model metadata mapping for generated result cards, generated-result binding target lookup helpers, backend validation error parsing, browser-level rendering for generation progress, final media cards, binding success, and binding validation errors. The Playwright suite also includes an Electron renderer smoke test that loads the same generation harness inside an Electron window.

Provider traces can be sanitized before committing with:

```bash
node scripts/sanitize-generation-trace.mjs raw-generation-trace.json sanitized-generation-trace.json
```

The sanitized output is intended to be reviewed and then folded into `apps/frontend/src/lib/agentGenerationTraceFixtures.ts`. Provider fixtures are also checked for unsafe strings: real external URLs, email addresses, token-like values in free-text fields, non-redacted `direct_url`, and non-redacted `storage_key` values fail `test:generation-replay`.

The Playwright Electron suite also covers a seeded project-workspace review journey so the desktop shell exercises both generation monitoring and proposal review in a realistic app flow.
