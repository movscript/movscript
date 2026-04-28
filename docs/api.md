# API Reference

Base URL: `http://localhost:8765/api/v1`

The router is defined in `apps/backend/internal/router/router.go`.

## Public and user-facing routes

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/auth/register` | Register a user |
| `POST` | `/auth/login` | Log in |
| `GET` | `/models` | List user-facing models by capability |
| `GET` | `/features/:key` | Read public feature definition |
| `POST` | `/ai/chat` | Brainstorm chat |
| `GET` | `/users` | List users |
| `GET` | `/resources` | List resources |
| `POST` | `/resources/upload` | Upload a resource |
| `GET` | `/resources/:id/file` | Fetch a resource file |
| `GET` | `/projects` | List projects |
| `POST` | `/projects` | Create project |
| `GET` | `/projects/:id` | Read project |
| `PUT` | `/projects/:id` | Update project |
| `DELETE` | `/projects/:id` | Delete project |
| `GET` | `/projects/:id/progress` | Project progress |
| `GET` | `/projects/:id/pipeline` | Read project pipeline |
| `GET` | `/projects/:id/scripts` | List project scripts |
| `POST` | `/projects/:id/scripts` | Create script |
| `POST` | `/projects/:id/scripts/:scriptId/analyze` | Analyze script with AI |
| `GET` | `/projects/:id/assets` | List project assets |
| `POST` | `/projects/:id/assets` | Create asset |
| `GET` | `/projects/:id/episodes` | List project episodes |
| `GET` | `/projects/:id/scenes` | List project scenes |
| `GET` | `/projects/:id/storyboards` | List project storyboards |
| `GET` | `/projects/:id/shots` | List project shots |
| `GET` | `/gen-jobs` | List generation jobs |
| `POST` | `/gen-jobs` | Create generation job |
| `POST` | `/gen-jobs/:id/cancel` | Cancel generation job |
| `POST` | `/gen-jobs/:id/retry` | Retry generation job |

## Admin routes

Admin routes are under `/api/v1/admin` and require `super_admin`.

Key route groups:

- `/admin/adapters`
- `/admin/model-presets`
- `/admin/credentials`
- `/admin/credentials/:id/models`
- `/admin/model-configs/:id`

## MCP

The MCP endpoint is outside `/api/v1`:

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/mcp` | MCP server endpoint |

Set `MCP_TOKEN` to require bearer-token authentication.
