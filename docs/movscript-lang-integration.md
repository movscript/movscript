# MovScript Lang Integration

## Boundary

`movscript-lang` is the source of truth for language semantics:

- domain schemas and workspace models: `@movscript/language`
- source layout, repositories, indexing, and workspace service: `@movscript/workspace`
- inspect, compile, artifacts, and regeneration planning: `@movscript/compiler`
- node facade that composes workspace and compiler workflows: `@movscript/engine`

`@movscript/core` remains the MovScript application integration layer. It keeps app-shell concerns that are outside the language package:

- MCP server and tool routing
- backend and plugin integration
- local workspace container resolution for app users, orgs, projects, and backend config
- Electron file repository bridges

Project source files inside the resolved project directory must follow `movscript-lang` layout and schema rules.

## Current Migration Rules

- `writing_expression` is replaced by `expression_unit`.
- `writing_expressions` arrays in production workspace snapshots are replaced by `expression_units`.
- Scene moment `storyboard_timing` is not written by new tools. Storyboard order and timeline live on storyboard entities. Transition boundaries live on the entity that owns the transition.
- Content generation prompt artifacts are replaced by content unit artifact bundles and build outputs:
  - runtime panel
  - input version
  - dependency report
  - selection validity
- MCP uses `inspect`, `compile`, and `regeneration_plan` semantics from `@movscript/compiler`. `domain_build` is only a compatibility alias for compile.
- Candidate writes use the workspace service entrypoints from `@movscript/workspace`:
  - `domain_append_candidate` for inline candidates on asset, keyframe, and content unit source records
  - `domain_create_asset_slot_candidate` for asset-slot candidate records or inline asset candidates when a target record path is provided
  - `domain_create_keyframe_candidate` for keyframe candidate records or inline keyframe candidates when a target record/path is provided
  - `domain_create_content_candidate` and `domain_select_content_unit_candidate` for content unit output candidates and selection records

## Verification Note

The core package consumes `movscript-lang` through `@movscript/*` package dependencies and project-level configuration. It does not test or reimplement `movscript-lang` language/compiler internals. Choose the dependency mode first, install dependencies, then rerun from the repository root:

```sh
pnpm movscript-lang:local
pnpm install
pnpm --filter @movscript/core typecheck
pnpm --filter @movscript/desktop typecheck
```

Generated `dist/` and `out/` bundles may still contain old language strings until packages can be installed and the affected packages are rebuilt. Treat source files as authoritative during this migration.

## Dependency Modes

MovScript supports two explicit `movscript-lang` integration modes. Both modes keep `@movscript/core` as an integration layer and keep language semantics in the `@movscript/*` packages.

### Local development

Use local mode when a MovScript project should point at a local `movscript-lang` checkout:

```sh
pnpm movscript-lang:local
```

This writes the project-level MovScript workspace config:

```json
{
  "movscriptLang": {
    "cwd": "/absolute/path/to/movscript-lang"
  }
}
```

The cwd points at the whole `movscript-lang` project. Core should use this cwd from project settings when it needs to locate the local language project; it should not validate the language package's internal business logic.

If the checkout lives somewhere else, pass the path directly:

```sh
node scripts/movscript-lang-cwd.mjs --cwd ../path/to/movscript-lang
```

### CI and release actions

GitHub-hosted workflows must use the latest public `movscript-lang` packages because the sibling checkout is only a local development assumption. The CI and release workflows run:

```sh
node scripts/movscript-lang-deps.mjs latest
pnpm install --no-frozen-lockfile
```

This rewrites the language package specs to the `latest` dist-tag inside the action workspace before dependency installation, so remote checks and release artifacts are built against the newest published `@movscript/language`, `@movscript/workspace`, `@movscript/compiler`, and `@movscript/engine`.

## Content Unit Design Alignment

### Keyframes are content units

`content_unit` is the independent production slot entity. It is not a parent record that owns a separate nested `keyframe` entity. A keyframe should therefore be represented as a content unit with a keyframe-specific `content_unit_type`, not as:

```text
content_units/{contentUnitSlug}/keyframes/{keyframeSlug}/keyframe.json
```

The language package should own this semantic change before MovScript frontend writes are migrated:

- Keep `storyboard_video` as a business-specific `content_unit_type`. It is not equivalent to the frontend display term `shot`, because its compiler adapter must read storyboard context and keyframe content units to build the video prompt.
- Add business keyframe content unit types, for example `keyframe_first`, `keyframe_middle`, and `keyframe_last`. The first-frame/end-frame distinction belongs in language-level type semantics, not only in frontend `metadata_json`.
- Add future production slot types such as scheduling or visual blocking graph types by extending the same `content_unit_type` system.
- Retire the nested content-unit keyframe source path and `movScriptContentUnitKeyframePath` as active write/read semantics.
- Let `storyboard_video.keyframe_refs` point to keyframe content units. The refs remain flat business refs; path containment must not imply ownership.

After `movscript-lang` publishes this model, `movscript/apps/frontend` should stop calling `upsertContentUnit({ unit, keyframes })`. Creating, editing, deleting, and reordering keyframes should become ordinary content unit writes where `content_unit_type` is one of the keyframe business types.
