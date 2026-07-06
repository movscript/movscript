# Affected vs Regenerate

Affected means review is needed. It does not mean automatic regeneration.

Use these terms precisely:

- `affected`: upstream source, selected output input hash, or interpret impact changed enough that a downstream target should be reviewed.
- `stale`: selection validity reports an accepted input hash that differs from the current input hash for a tracked output.
- `accept_stale`: policy that allows keeping stale output intentionally; it does not make `stale` false.
- `missing selection`: an upstream output has generated options or an expected result but no selected resource. Downstream generation should stop until the user selects, confirms, or explicitly accepts an unstable draft path.
- `must regenerate`: only use this when an artifact or explicit user/workflow policy says regeneration is mandatory.

Review actions:

- keep
- relink
- re-prompt
- regenerate
- re-shoot
- deprecate
- accept stale

When explaining a target, cite the artifact used: dependency report, input version, selection validity, runtime panel, or regeneration plan.

Metadata-only changes should not be described as regeneration causes. Reference changes, selected-output changes, and semantic input changes may affect downstream outputs, but the next action is still a decision, not automatic regeneration.
