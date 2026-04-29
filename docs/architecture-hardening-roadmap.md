# Architecture Hardening Roadmap

This roadmap tracks the architecture repair work required before Movscript can be treated as a secure multi-user, plugin-capable, cost-bearing production system.

The scope comes from the current architecture review: authentication is header-based, project authorization is inconsistent, database migrations run destructively at process startup, handlers bind HTTP payloads directly into GORM models, plugin execution has broad host privileges, and AI usage accounting happens after provider calls.

## Target Architecture

```text
Client
  -> Authenticated API client
  -> Backend auth middleware
  -> Route-level policy middleware
  -> Handler request DTOs
  -> Service/usecase layer
  -> Repository/model layer
  -> Versioned database migrations

Plugin runtime
  -> Sandboxed execution boundary
  -> Capability-scoped host bridge
  -> Policy-checked backend APIs

AI/generation runtime
  -> User/project/model authorization
  -> Quota preflight and reservation
  -> Provider execution
  -> Usage settlement and audit trail
```

The key architectural rule is that identity, authorization, migration, persistence, plugin capabilities, and billing must become explicit platform boundaries. They should not be incidental behavior inside individual handlers or frontend conventions.

## Design Principles

- Backend identity must come from signed credentials, not caller-supplied user IDs.
- Project data access must be denied by default and granted through explicit project roles.
- HTTP request shapes must be separate from database models.
- Migrations must be versioned, reviewed, repeatable, and separated from normal application startup.
- Plugins must receive narrow capabilities, not a general-purpose API client.
- Cost-bearing AI execution must reserve or verify quota before provider calls.
- Architecture changes must include regression tests for the failure mode being fixed.

## Phase 0: Stop the Bleeding

Goal: close the highest-risk privilege escalation and cross-user access paths before broader refactors.

### Authentication Boundary

- Replace `X-User-ID`, `uid`, `Bearer user_<id>`, and numeric bearer identity with signed auth.
- Introduce either JWT bearer tokens or server-side sessions with signed cookies.
- Keep `/auth/register` and `/auth/login`, but return a credential instead of a raw user-as-session object.
- Add password/session logout and token expiry behavior.
- Make media/resource browser access use signed URLs, short-lived media tokens, or authenticated blob fetches instead of `uid` query parameters.

### Route Protection

- Split routes into public, authenticated, admin, and gateway groups.
- Public routes should be limited to health, login/register, public model discovery if intentionally public, and registry read endpoints if intentionally public.
- All project, resource, generation, plugin, and model gateway key routes must require authentication.
- Admin routes must continue to require `super_admin`, but only after real authentication exists.

### Immediate Tests

- A request with forged `X-User-ID` must not authenticate.
- `Authorization: Bearer user_1` must not authenticate.
- Unauthenticated requests to project/entity/resource/generation routes must return 401.
- A normal user cannot hit admin routes even if they send another user's ID.

## Phase 1: Authorization and Data Ownership

Goal: make project and resource access consistent across handlers.

### Policy Layer

- Add a backend policy package for project and resource permissions.
- Define roles and capabilities centrally:
  - `owner`: full project control.
  - `director`: project management and review control.
  - `writer`: script/setting/story work within assigned scopes.
  - `generator`: generation/resource work within assigned scopes.
  - `viewer`: read-only project access.
- Expose helper checks such as:
  - `CanReadProject(user, projectID)`
  - `CanWriteProject(user, projectID)`
  - `CanManageMembers(user, projectID)`
  - `CanReadEntity(user, kind, id)`
  - `CanWriteEntity(user, kind, id)`
  - `CanReadResource(user, resourceID)`
  - `CanUseModel(user, modelConfigID)`

### Handler Rollout

- Apply project policy checks to project CRUD and membership APIs.
- Apply entity policy checks to scripts, episodes, scenes, storyboards, shots, assets, settings, final videos, pipeline nodes, and canvases.
- Apply resource ownership/sharing checks to resource bindings and generation input resources.
- Require project membership before creating canvases or generation jobs linked to a project.

### Immediate Tests

- User A cannot list, read, update, delete, or attach resources to User B's private project.
- Viewer can read but cannot mutate project entities.
- Non-owner cannot add or remove project members.
- Resource bindings reject resources that the caller cannot read.

## Phase 2: DTO and Service Layer Refactor

Goal: remove mass assignment and move business rules out of HTTP handlers.

### Request/Response DTOs

- Replace direct `ShouldBindJSON(&model.X)` usage with request DTOs.
- For each entity, define explicit create/update/patch payloads.
- Ensure server-owned fields cannot be set by clients:
  - `ID`
  - `owner_id`
  - `author_id`
  - `project_id` when path-owned
  - `pipeline_node_id` unless a specific binding API allows it
  - review/status fields unless the route is specifically a review transition
  - timestamps and soft-delete fields

### Service Layer

- Add service/usecase packages for core workflows:
  - project service
  - entity service
  - resource service
  - generation service
  - plugin service
  - model gateway service
- Keep handlers thin:
  - parse request
  - authenticate principal
  - call policy/service
  - return response DTO
- Keep GORM models internal to backend persistence and avoid exposing them directly as API contracts.

### Immediate Tests

- Sending `owner_id`, `project_id`, or `ID` in update payloads cannot move records across owners/projects.
- Patch endpoints only update whitelisted fields.
- Review state can only change through review transition routes.

## Phase 3: Versioned Migrations

Goal: make schema and data evolution controlled instead of startup-side effects.

### Migration System

- Introduce a migration tool and a `schema_migrations` table.
- Move destructive startup SQL out of `db.Connect`.
- Convert existing startup backfills and legacy cleanup into named migration files.
- Separate schema migrations from data migrations.
- Make application startup fail fast if required migrations are missing, rather than silently mutating schema.

### Foreign Keys and Constraints

- Revisit disabled foreign key migration behavior.
- Add explicit constraints where data ownership requires them.
- Add unique indexes for membership, pipeline edges, plugin keys, and binding uniqueness where applicable.

### Immediate Tests

- A fresh database migrates from zero to current schema.
- A pre-migration fixture upgrades without data loss.
- Running migrations twice is safe.
- Application startup does not run destructive SQL.

## Phase 4: Plugin Security Boundary

Goal: make plugins extensible without giving them full application control.

### Plugin Runtime Model

- Treat plugin permissions as enforceable grants, not manifest metadata.
- Replace broad runtime methods like general `get/post/patch/delete` with capability-scoped APIs.
- Add a host bridge that checks plugin ID, permission, user, project, and target before every operation.
- Avoid executing remote JavaScript just to inspect manifests.
- Prefer manifest-first install:
  - fetch manifest
  - validate schema
  - show permissions
  - require user/admin approval
  - load executable bundle only after install approval

### Sandboxing

- Run UI plugins in sandboxed iframes with strict CSP.
- Do not expose raw Electron or unrestricted browser APIs.
- For non-UI tool plugins, prefer backend-mediated HTTP runtimes or isolated worker execution.
- Add deny-by-default network and file access policy.

### Immediate Tests

- A plugin without `project.read` cannot read project APIs.
- A plugin without `resource.read` cannot list or fetch resources.
- A plugin without `generation.create` cannot create generation jobs.
- Plugin-declared permissions and enforced permissions are covered by tests.

## Phase 5: AI Quota, Billing, and Gateway Control

Goal: make cost-bearing calls predictable, auditable, and enforceable.

### Quota Preflight

- Add quota checks before text, image, and video provider calls.
- Estimate cost from model config and requested parameters.
- Reserve quota before starting async generation jobs.
- Settle reservation after completion:
  - charge actual usage on success.
  - release unused reservation on failure/cancel.
  - record provider errors without charging unless provider billing requires otherwise.

### Gateway Hardening

- Model gateway must accept only real API keys or authenticated sessions.
- Enforce API key scopes, allowed model IDs, project scope, rate limits, and monthly budget.
- Store rate-limit counters in a backend-owned store suitable for concurrent access.

### Immediate Tests

- User with insufficient balance cannot start a generation job.
- Failed generation releases reserved quota.
- Gateway API key cannot use disallowed models or scopes.
- Rate limit and monthly budget rejection paths are tested.

## Phase 6: API Contract and Type Generation

Goal: prevent frontend/backend/plugin contract drift.

### Contract Source of Truth

- Define OpenAPI or JSON Schema for backend APIs.
- Generate frontend API types from the contract.
- Generate plugin SDK public types from stable plugin schemas, not from frontend internals.
- Keep GORM models private to backend persistence.

### Compatibility

- Version API routes or response schemas where breaking changes are expected.
- Add compatibility notes for plugin manifest versions and semantic entity schema versions.
- Add contract tests for critical endpoints.

### Immediate Tests

- Generated frontend types compile without manual duplication.
- Contract tests cover auth, project access, resource access, generation jobs, model gateway, and plugin catalogs.

## Phase 7: Operational Hardening

Goal: make failures diagnosable and production operations safer.

### Observability

- Add request IDs and structured logs.
- Log auth decisions, policy denials, generation lifecycle events, and plugin permission denials.
- Keep sensitive data out of logs.
- Add admin-visible audit logs for:
  - login/session events
  - project membership changes
  - entity writes
  - resource access changes
  - plugin installs/enables/disables
  - generation quota reservation/settlement

### Deployment and Config

- Remove real `.env` files from source control.
- Keep `.env.example` documented and safe.
- Add startup checks for required secrets, database migration state, storage connectivity, and encryption key validity.

### Immediate Tests

- Missing required secrets fail startup with actionable errors.
- Logs redact provider keys and user secrets.
- Audit records are created for privileged operations.

## Recommended Execution Order

1. Real authentication.
2. Route grouping and default authentication requirement.
3. Project/resource policy layer.
4. DTO refactor for high-risk update routes.
5. Versioned migration system.
6. AI quota preflight and gateway hardening.
7. Plugin capability enforcement.
8. Contract generation and broader operational hardening.

This order intentionally fixes privilege escalation and cross-tenant data access before larger cleanliness work. DTOs and service layers should begin after the first policy layer exists, because the service APIs should be designed around authenticated principals and policy decisions.

## Exit Criteria

The hardening project is complete when:

- No backend route trusts caller-supplied user IDs as authentication.
- Every project/entity/resource/generation route has an explicit auth and policy decision.
- No handler binds request JSON directly into a GORM model for mutable business objects.
- Application startup no longer runs destructive schema or data migrations.
- Plugin permissions are enforced at runtime.
- AI calls reserve or verify quota before provider execution.
- Frontend and plugin SDK types come from stable contracts or schemas.
- Regression tests cover the original fatal architecture defects.
