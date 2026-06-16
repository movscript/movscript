# @movscript/workspace

MovScript workspace facade for layout, repositories, source stores, decision persistence, node adapters, and workspace services.

This is an internal MovScript workspace package.

## Workspace model

This package models a MovScript source workspace: a user-editable project directory with a `.movscript/` control directory inside it. Its path helpers resolve:

- `rootDir` / `workspaceDir`: the project source root.
- `controlDir`: `<project source root>/.movscript`.
- `providersDir`: `<project source root>/.movscript/providers`.
- `.interpret`: generated interpretation and review artifacts beside the source files.

Do not use this package for the desktop app's MovScript home directory. The desktop home/control directory is modeled by `@movscript/core/workspace` and `@movscript/core/workspace/node`, where the selected directory itself contains `manifest.json`, `config.toml`, `providers/`, `backend/`, `bin/`, and local project workdirs.

For new source-workspace code, prefer the explicit aliases exported from this package, such as `MovScriptSourceWorkspaceRootPaths` and `resolveMovScriptSourceWorkspaceRootPaths()`. The older `MovScriptWorkspace*` names remain for compatibility with existing domain repository code.
