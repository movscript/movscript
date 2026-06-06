# MovScript Workspace Topology

MovScript treats the selected local folder as the workspace root. The `.movscript/` directory inside that root is the control directory for projections, sync state, frontend review evidence, and provider profile state.

## Directory Contract

```text
<workspace-root>/
  .movscript/
    manifest.json
    data/
      users/{userId}/projects.index.json
      users/{userId}/projects/{projectId}/
        project.json
        standards/project_standards.workspace.json
        settings/setting.workspace.json
        scripts/{scriptId}/script.md
        productions/{productionId}/production.workspace.json
        productions/{productionId}/scene_moments/{sceneMomentId}/content_units/{contentUnitId}/content_unit.workspace.json
        assets/asset.workspace.json
    reviews/
    sync/
    providers/{profile}/
      config.json
      cache/
      run/
      sessions/
    .codex/
    .mova/
```

## Terms

- Workspace root: the user-selected folder or `MOVSCRIPT_WORKSPACE_DIR`.
- Control directory: `.movscript/` under the workspace root.
- Workspace path: a projection file or folder under `.movscript/data`.
- Business projection kind: the schema or projection type carried by a projection file, such as `setting_workspace`, `asset_workspace`, `project_standards_workspace`, `production_workspace`, `content_unit_workspace`, `project`, `script`, or `user_projects`.
- Projection file: the local file representation of database-backed MovScript entities under `.movscript/data`.
- Sync state: projection hash and dirty, preview, submitted-change, materialized, or conflict state under `.movscript/sync`.
- Review evidence: preview output and frontend review evidence under `.movscript/reviews`.
- Provider session cwd: the `cwd` used by app-server provider sessions. It is the selected projection folder under `.movscript/data`.
- Provider profile: provider-specific config, cache, run, and session state under `.movscript/providers/{profile}`.
- Provider home: compatibility home such as `.movscript/.codex` or `.movscript/.mova`; it is not a business projection root.
- Provider session artifact: the provider API object historically exposed through `/workspaces`; code should prefer `WorkspaceArtifact` and `MovScriptWorkspaceKind`, with old workspace names kept only for protocol compatibility.

## Invariants

- Provider sessions work against projection paths. They may edit a single projection file or a folder of projection files.
- User-root workspace paths expose `data/users/{userId}/projects.index.json`, a read-only projection of visible projects for the current user.
- Project workspace paths expose `project.json`, project-level workspace JSON files, and `scripts/{scriptId}/script.md` projections. `script.md` carries the editable script body; `script.meta.json` carries script metadata used for apply.
- A `cwd` under `.movscript/data/...` is treated as the active projection folder when workspace tools receive `cwd`.
- If a path is omitted and no `cwd` is supplied, workspace tools use the current MCP focus project/production to choose the default projection folder.
- `workspace_update(path)` refreshes the selected projection file or folder from the backend database and overwrites local changes in that path. It can create missing projections from the path hierarchy, including user project indexes, project metadata, project-level workspace JSON files, and script markdown files.
- `workspace_apply_review(path)` previews backend effects for local projection changes without writing backend state.
- `workspace_apply(path)` submits the selected local projection file or folder to the backend database when the projection has a writable backend route. `user_projects` is read-only and can only be refreshed or previewed.
- Preview and apply evidence can leave records under `.movscript/reviews`.
- Business projections live under `.movscript/data`, not under `.movscript/providers`, `.movscript/.codex`, or `.movscript/.mova`.
- Provider session cwd values are projection directories:
  - User-root conversations use `.movscript/data/users/{userId}`.
  - Project conversations use `.movscript/data/users/{userId}/projects/{projectId}`.
  - Production conversations use `.movscript/data/users/{userId}/projects/{projectId}/productions/{productionId}`.
- Provider profile config lives under `.movscript/providers/{profile}/config.json`.
- Legacy `.movscript/{profile}/config.json` may be copied forward when a profile is initialized, but new writes use `.movscript/providers/{profile}`.
- New code should use `MovScriptWorkspaceKind` for workspace model kinds and provider profile keys for provider-scoped config directories.
