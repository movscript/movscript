# API Reference

Default backend origin: `http://localhost:8765`.

Most product routes are under:

```text
/api/v1
```

OpenAI-compatible model gateway routes are also exposed under:

```text
/v1
```

The router source of truth is `apps/backend/internal/router/router.go`.

## Health

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Backend health check. |

## Auth and Users

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Register a user. |
| `POST` | `/api/v1/auth/login` | Log in. |
| `GET` | `/api/v1/users` | List users for collaboration/member pickers. |
| `GET` | `/api/v1/user/quota` | Read current user's quota. |
| `GET` | `/api/v1/user/usage-logs` | Read current user's AI usage logs. |

## Models, Features, and Chat

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/models` | List user-facing model configs, optionally filtered by capability. |
| `GET` | `/api/v1/features/:key` | Read public feature definition and input slots. |
| `POST` | `/api/v1/ai/chat` | Brainstorm/assistant chat through configured models. |

## Model Gateway

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/v1/models` | OpenAI-compatible model list. |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completions. |
| `GET` | `/api/v1/model-gateway/models` | Gateway model list under product API. |
| `POST` | `/api/v1/model-gateway/chat/completions` | Gateway chat completions under product API. |
| `GET` | `/api/v1/model-gateway/api-keys` | List gateway API keys. |
| `POST` | `/api/v1/model-gateway/api-keys` | Create gateway API key. |
| `PATCH` | `/api/v1/model-gateway/api-keys/:id` | Update gateway API key. |
| `DELETE` | `/api/v1/model-gateway/api-keys/:id` | Delete gateway API key. |

## Resources

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/resources` | List raw resources. |
| `POST` | `/api/v1/resources/upload` | Upload a raw resource. |
| `GET` | `/api/v1/resources/:id/file` | Serve a resource file. |
| `PUT` | `/api/v1/resources/:id` | Update resource metadata. |
| `DELETE` | `/api/v1/resources/:id` | Delete a resource. |
| `POST` | `/api/v1/resources/:id/to-asset` | Convert/add a resource to an asset. |
| `GET` | `/api/v1/resource-folders` | List folders. |
| `POST` | `/api/v1/resource-folders` | Create folder. |
| `PUT` | `/api/v1/resource-folders/:id` | Update folder. |
| `DELETE` | `/api/v1/resource-folders/:id` | Delete folder. |
| `GET` | `/api/v1/resource-folders/:id/permissions` | List folder permissions. |
| `POST` | `/api/v1/resource-folders/:id/permissions` | Grant folder permission. |
| `DELETE` | `/api/v1/resource-folders/:id/permissions/:userId` | Revoke folder permission. |

## Generation Jobs

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/gen-jobs` | Create an async generation job. |
| `GET` | `/api/v1/gen-jobs` | List generation jobs. |
| `GET` | `/api/v1/gen-jobs/:id` | Read one generation job. |
| `POST` | `/api/v1/gen-jobs/:id/cancel` | Cancel a generation job. |
| `POST` | `/api/v1/gen-jobs/:id/retry` | Retry a generation job. |
| `DELETE` | `/api/v1/gen-jobs/:id` | Delete a generation job. |

## Projects and Production Entities

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/projects` | List projects. |
| `POST` | `/api/v1/projects` | Create project. |
| `GET` | `/api/v1/projects/:id` | Read project. |
| `PUT` | `/api/v1/projects/:id` | Update project. |
| `DELETE` | `/api/v1/projects/:id` | Delete project. |
| `GET` | `/api/v1/projects/:id/progress` | Project progress summary. |
| `GET` | `/api/v1/projects/:id/members` | List project members. |
| `POST` | `/api/v1/projects/:id/members` | Add project member. |
| `DELETE` | `/api/v1/projects/:id/members/:memberId` | Remove project member. |
| `GET` | `/api/v1/projects/:id/scripts` | List scripts. |
| `POST` | `/api/v1/projects/:id/scripts` | Create script. |
| `POST` | `/api/v1/projects/:id/scripts/:scriptId/analyze` | Analyze script with AI. |
| `GET` | `/api/v1/projects/:id/assets` | List assets. |
| `POST` | `/api/v1/projects/:id/assets` | Create asset. |
| `POST` | `/api/v1/projects/:id/assets/upload` | Upload asset media. |
| `GET` | `/api/v1/projects/:id/episodes` | List project episodes. |
| `POST` | `/api/v1/projects/:id/episodes` | Create project episode. |
| `GET` | `/api/v1/projects/:id/scenes` | List project scenes. |
| `POST` | `/api/v1/projects/:id/scenes` | Create scene. |
| `GET` | `/api/v1/projects/:id/storyboards` | List project storyboards. |
| `POST` | `/api/v1/projects/:id/storyboards` | Create storyboard. |
| `GET` | `/api/v1/projects/:id/shots` | List project shots. |
| `POST` | `/api/v1/projects/:id/shots` | Create project shot. |

Additional nested routes exist for scripts, assets, asset views, episodes, episode-scene links, storyboards, shots, settings, and pipeline nodes. Check `router.go` when adding clients for less common mutations.

## Canvas and Pipeline

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/canvases` | List canvases. |
| `POST` | `/api/v1/canvases` | Create canvas. |
| `GET` | `/api/v1/canvases/:id` | Read canvas. |
| `PUT` | `/api/v1/canvases/:id` | Save canvas. |
| `DELETE` | `/api/v1/canvases/:id` | Delete canvas. |
| `POST` | `/api/v1/canvases/:id/nodes/:nodeId/run` | Run one canvas node. |
| `POST` | `/api/v1/canvases/:id/run` | Run a canvas. |
| `GET` | `/api/v1/canvases/:id/runs` | List canvas runs. |
| `GET` | `/api/v1/pipeline/node-specs` | Read pipeline node specs. |
| `GET` | `/api/v1/projects/:id/pipeline` | Read project pipeline. |
| `POST` | `/api/v1/projects/:id/pipeline/nodes` | Create pipeline node. |

## Plugins and Registry

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/plugins` | List imported plugins. |
| `POST` | `/api/v1/plugins` | Import plugin manifest JSON or backend-local path. |
| `POST` | `/api/v1/plugins/:id/enable` | Enable plugin. |
| `POST` | `/api/v1/plugins/:id/disable` | Disable plugin. |
| `DELETE` | `/api/v1/plugins/:id` | Delete plugin. |
| `GET` | `/api/v1/plugins/tools` | List enabled plugin tools. |
| `GET` | `/api/v1/plugins/cards` | List enabled plugin cards. |
| `GET` | `/api/v1/plugins/canvas-nodes` | List enabled plugin canvas nodes. |
| `GET` | `/api/v1/registry/plugins` | Proxy plugin registry index. |
| `GET` | `/api/v1/registry/plugins/:id` | Proxy plugin registry manifest. |

## Agents

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/agents` | List public agent templates. |
| `GET` | `/api/v1/agents/my` | List current user's agents. |
| `POST` | `/api/v1/agents/my` | Create user agent. |
| `PUT` | `/api/v1/agents/my/:id` | Update user agent. |
| `DELETE` | `/api/v1/agents/my/:id` | Delete user agent. |

The standalone local agent service exposes its own API on `http://127.0.0.1:28765`; see [agent/README.md](agent/README.md).

## Admin Routes

Admin routes are under `/api/v1/admin` and require `super_admin`.

Key groups:

- Adapter and model preset discovery.
- AI credentials and model configs.
- Feature model routing and prompt overrides.
- User quotas and usage logs.
- Resource storage stats.
- Agent template management.
- Cloud file storage configs.
- Provider debug calls and job debug inspection.

## MCP Status

The backend `/mcp` endpoint has been removed. MCP-shaped tools are currently provided by the desktop/local-agent path, not by the Go backend.
