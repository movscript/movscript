# Affected vs Regenerate

Affected means review is needed. It does not mean automatic regeneration.

Use these terms precisely:

- `affected`: upstream source, selected output input hash, or interpret impact changed enough that a downstream target should be reviewed.
- `stale`: selection validity reports an accepted input hash that differs from the current input hash for a tracked content unit.
- `accept_stale`: policy that allows keeping stale output intentionally; it does not make `stale` false.
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
