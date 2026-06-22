# @movscript/prompt

Prompt compiler for MovScript content units.

The package turns content-unit prompt references such as `{{asset::wet_hair}}`, `{{candidate::candidate_a}}`, or `{{resource::123}}` into backend resource tokens such as `@[resource:123]`. The older single-colon form, such as `{{asset:wet_hair}}`, is accepted for compatibility. Entity refs read selected upstream resources from a decision provider. Direct candidate refs resolve against the current content unit's candidates, and direct resource refs use the resource id immediately. Backend decision context is the source of truth; `selection.json` is not read by this package.

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
Generate the phone expression using {{asset::wet_hair}} and {{resource::88}}.
```

if the upstream `asset_ref` content unit for `wet_hair` has backend selection `{ resource_id: 123 }`, the compiled prompt is:

```text
Generate the phone expression using @[resource:123] and @[resource:88].
```

Structured fields such as `expression_unit_ref`, `keyframe_ref`, and `storyboard_ref` define the content unit target. Prompt refs such as `{{asset::wet_hair}}`, `{{candidate::candidate_a}}`, and `{{resource::88}}` are treated as upstream inputs and replaced with backend resource tokens when selected resources exist. Legacy resource mentions such as `[[resource::123]]` are also recognized when extracting generation resource ids.

## Blockers

When a prompt cannot be safely built, the result is `ok: false` with structured blockers. Common blockers include:

- `decision_context_missing`: the referenced upstream content unit has no backend decision context.
- `upstream_selection_missing`: candidates may exist, but no backend selection exists.
- `upstream_resource_missing`: a selection exists, but no resource id can be derived.
- `primary_ref_missing`: a specialized content unit such as `expression_unit_ref` is missing its required primary ref.
