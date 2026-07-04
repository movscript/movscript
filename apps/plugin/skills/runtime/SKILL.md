---
name: runtime
description: Decide MovScript runtime availability, installation/distribution paths, MovScript Home, cloud/external data planes, and the local runtime daemon before project, domain, generation, or editing work.
toolGrants:
  - mcp__movscript__runtime_doctor
  - mcp__movscript__movscript_runtime_status
  - mcp__movscript__runtime_gateway_configure
  - mcp__movscript__runtime_gateway_status
---

# Runtime Startup

Use this skill when a task depends on MovScript runtime availability, plugin startup mode, cloud/external services, Desktop, local full node behavior, service endpoints, gateway/provider configuration, or `movscript_runtime_status`.

The first decision is runtime ownership: the per-user MovScript local runtime daemon owns local execution services. Desktop, Agent Plugin, CLI, and MCP sessions attach to it. The data plane may be local Data Service, cloud Data Service, or an external/local endpoint.

Open `references/install-distribution.md` when explaining install paths, MovScript Home, release asset names, rollback, Desktop-vs-plugin distribution, or cloud/external runtime gateway setup.

## Production Contract

- Production step: cross-cutting runtime prerequisite before project, planning, generation, timeline, editing, export, or admin work.
- Systems/config: local runtime daemon owns local Project/Editing/Canvas/Surface/Media services and optional local Data Service; cloud/external data planes may replace local Data Service; Desktop and MCP sessions attach rather than owning sidecars.
- Blockers: daemon not running, data-plane endpoint/auth missing, service endpoint absent, sqlite/path/port conflict, provider route/key missing, Local Surface Host unavailable, or FFmpeg/media pipeline degraded.
- Human review: ask before stop/restart/configure changes that interrupt work or change data plane; do not ask users to start Desktop when daemon can satisfy the workflow.
- Output: classify runtime owner/data plane, list service readiness, give surface/MCP endpoint, name blockers, and suggest the exact doctor/daemon/admin/preflight next step.

## Startup Modes

Explicit user or environment policy wins:

- `MOVSCRIPT_PLUGIN_MODE=basic` or `plugin-basic`: start only the launcher and stdio MCP host. Use this for diagnostics or for connecting to an already-owned runtime.
- `MOVSCRIPT_PLUGIN_MODE=full-local` or `plugin-full-local`: ensure or attach to the local runtime daemon with a local data plane.
- `MOVSCRIPT_PLUGIN_MODE=desktop` or `plugin-desktop-compatible`: compatibility mode; prefer existing local daemon/desktop records but do not treat Desktop as business sidecar owner. `plugin-desktop-owned` is accepted only as a legacy alias.
- `MOVSCRIPT_PLUGIN_MODE=cloud`: connect to cloud or external runtime endpoints when configured.
- `MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE=local|cloud|external`: controls whether the local daemon starts local Data Service or uses cloud/external Data Service while still starting local Project/Editing/Canvas/Surface/Media services.
- The plugin bundle exposes one product CLI: `bin/movscript`. Use `bin/movscript doctor --json` for no-frontend runtime diagnosis, `bin/movscript mcp stdio` for MCP, `bin/movscript daemon start|status|stop|restart` for daemon control, `bin/movscript runtime gateway configure/status --json` to register or inspect a daemon/cloud/external runtime gateway endpoint, and `bin/movscript admin ...` for system admin. `bin/movscript-agent-mcp` is only a compatibility shim for `bin/movscript mcp stdio`, and the older `local-node` / `__movscript_local_node` forms are compatibility aliases for `daemon`.

Without an explicit mode, decide in this order:

1. **Cloud or external Data Service configured and authenticated**: use it as the data plane. The local runtime daemon may still start local Project Service, Editing Service, Canvas Service, Local Surface Host, and Media Pipeline; do not start local Data Service.
2. **Ready local runtime daemon found in MovScript Home**: attach to it. MCP stdio sessions do not own business sidecars.
3. **No ready daemon and local execution is needed**: ensure the local runtime daemon. Use `local` data plane by default, or `cloud`/`external` when configured.
4. **Desktop is running**: treat Desktop as a GUI/focus/surface client attached to the daemon. Legacy Desktop-owned records are diagnostic only and should not cause new Desktop business sidecars to start.

## Full-Local Contract

The local runtime daemon is the no-Desktop-required local execution path:

- With `MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE=local`, Data Service persists under `MOVSCRIPT_HOME`, using local sqlite such as `$MOVSCRIPT_HOME/data-service/movscript.db`.
- With `cloud` or `external`, do not start local Data Service; pass `MOVSCRIPT_DATA_SERVICE_URL` or discovered cloud config to local services as their data plane.
- Local data mode uses `MOVSCRIPT_AUTH_MODE=local-owner` / `LocalOwnerAuthProvider`.
- Do not start a local Auth Service for default full-local. Auth Service belongs to cloud/external or explicitly managed identity flows.
- Local gateway/model/provider/resource/job capabilities are Data Service responsibilities. Missing provider keys or routes should be reported as local gateway configuration gaps, not as a reason to require cloud auth or Desktop.
- Media Pipeline may run headlessly. FFmpeg absence should degrade media execution capability and diagnostics, not invalidate project/domain work.

## Agent Workflow

1. Call `movscript_runtime_status` before asking the user to start Desktop or before assuming local services are unavailable. If a cloud/external runtime gateway exists but is not registered in MovScript Home, use `runtime_gateway_configure` / `movscript runtime gateway configure --gateway-base-url ... --gateway-kind cloud|external --json`, then confirm with `runtime_gateway_status`.
2. Classify the observed state as local daemon, cloud/external data plane, legacy Desktop-owned, basic/diagnostic, or missing/misconfigured.
3. For local daemon mode, expect local Project/Editing/Canvas/Surface/Media endpoints. Local Data Service is required only when the data plane is `local`.
4. For cloud/external data plane mode, connect local services to the remote/external Data Service and do not start local Data Service.
5. When the workflow needs user interaction in a MovScript UI, use `movscript_runtime_status.surface.url` or `movscript_runtime_status.surfaces.primary.url` as the first URL to open in the Codex/in-app browser. If `surfaces.openable` is false but `runtimeOwner.surfaceHostStartupAllowed` is true, start or wait for the Local Surface Host first; if it still cannot open, report the specific blocker and include the URL only as fallback.
6. For local daemon mode, expect service endpoints for Project, Editing, Canvas, Local Surface Host, and Media Pipeline; if one is missing, report the specific service/preflight gap.
7. For basic/diagnostic mode, explain that the plugin is not the runtime owner and that project/domain/generation/editing tools may need cloud/external endpoints, Desktop, or full-local mode.

## Rules

- Do not treat `plugin-basic` as the product name for cloud. It is the minimal launcher + MCP host technical mode.
- Do not silently downgrade local daemon requests to basic. If the daemon cannot start, report the blocker.
- Do not start Desktop merely because the daemon is not already running; ensure the local runtime daemon directly when local execution is needed.
- Do not require Desktop when the local runtime daemon can satisfy the workflow.
- Do not require cloud auth in local full node mode; use local-owner identity.
- Do not ask the user to manually find or open MovScript surfaces when `movscript_runtime_status` returns a `surface.url` or `surfaces.primary.url`; open it for them in the agent browser whenever browser control is available.
- Do not merge Editing Service and Media Pipeline concepts: Editing Service owns timeline/editing business, Media Pipeline executes render/transcode/HLS/reframe when capability is available.
- `runtimeOwner.businessSidecarStartupAllowed` is false when the local daemon is ready. Local Data Service startup is controlled by the data plane, not by Desktop availability.
- When explaining failures, name the missing owner or service: cloud/external endpoint, Desktop runtime record, Data Service, Project Service, Editing Service, Local Surface Host, Media Pipeline, local sqlite path, provider route/key, or FFmpeg.
