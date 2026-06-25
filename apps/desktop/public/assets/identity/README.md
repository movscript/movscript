# Identity Assets

These files power compact UI labels for agents and model families.

## Required Files

Agent assets:

- `agents/codex.svg`
- `agents/mova.svg`
- `agents/fallback.svg`

Model assets:

- `models/gpt.svg`
- `models/claude.svg`
- `models/fallback.svg`

## Format

- Prefer SVG for crisp 16px, 20px, and 28px rendering.
- Use a square `viewBox`, ideally `0 0 64 64`.
- Keep visible content centered with safe padding.
- Avoid text-only logos unless the mark remains readable at 16px.
- Keep file names stable; change the artwork, not the path.

## Registry

The UI registry is in:

`apps/desktop/src/features/agent/components/AgentIdentityUi.tsx`

Update that file when adding a new identity, alias, color, or asset path.
