# @movscript/prompt

Prompt compiler for MovScript content units.

The package turns content-unit prompt references such as `{{asset:wet_hair}}` into backend resource tokens such as `[[resource::123]]` by reading selected upstream resources from a decision provider. Backend decision context is the source of truth; `selection.json` is not read by this package.

## Usage

```ts
import { buildContentUnitBackendPromptById } from '@movscript/prompt'

const result = await buildContentUnitBackendPromptById({
  index,
  contentUnitId: 'cu_phone_video',
  decisionProvider,
})

if (result.ok) {
  await submitGeneration({
    prompt: result.prompt.text,
    input_resource_ids: result.prompt.resource_ids,
  })
} else {
  console.log(result.blockers)
}
```

For a prompt like:

```text
Generate {{shot:phone}} using {{asset:wet_hair}}.
```

if the upstream `asset_ref` content unit for `wet_hair` has backend selection `{ resource_id: 123 }`, the compiled prompt is:

```text
Generate {{shot:phone}} using [[resource::123]].
```

Primary refs such as `{{shot:phone}}` remain business context refs. Input refs that point to produced upstream content are replaced with backend resource tokens.

## Blockers

When a prompt cannot be safely built, the result is `ok: false` with structured blockers. Common blockers include:

- `decision_context_missing`: the referenced upstream content unit has no backend decision context.
- `upstream_selection_missing`: candidates may exist, but no backend selection exists.
- `upstream_resource_missing`: a selection exists, but no resource id can be derived.
- `primary_ref_missing`: a specialized content unit such as `shot_ref` is missing its required primary ref.
