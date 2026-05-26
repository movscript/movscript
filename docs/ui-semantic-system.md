# UI Semantic System

MovScript UI semantics are expressed as a small set of recipe axes, not as direct color choices in product code. Product code should describe intent, emphasis, surface role, and state; `@movscript/ui` owns how those meanings become CSS classes, component props, and theme variables.

## Layers

```text
@movscript/tokens  -> shared foundations: reference colors, typography, space, radius, shadows, motion
@movscript/theme   -> theme roles: --ms-color-background, --ms-color-success, etc.
@movscript/ui      -> recipes: Surface, StatusBadge, Button, semantic helpers
app/features       -> business mappings from domain state to UI recipes
```

`@movscript/tokens` is intentionally small. A token must represent a reusable design foundation, not a component implementation detail. Component heights, icon sizes, icon button sizes, single-page paddings, UI role typography such as value and page title, one-off display sizes, and temporary override hooks belong in `@movscript/ui` component CSS or component props.

Theme-specific palettes and shadows are not reference tokens. Values such as dark theme backgrounds, dark theme foregrounds, and dark theme elevation shadows belong in `@movscript/theme`.

Do not add compatibility aliases for removed token names. If a token is removed, migrate callers to the surviving shared foundation or to a component-local value. `tests/scripts/frontend/token-convergence.test.mjs` is the regression gate for this boundary.

`@movscript/theme` must not contain business words such as agent, canvas, generation, resource, project, or review. It only maps reference values to theme roles and applies `data-theme`.

## Recipe Axes

The public vocabulary is intentionally small:

- `surface`: `page`, `panel`, `card`, `muted`, `overlay`
- `intent`: `neutral`, `info`, `success`, `warning`, `danger`
- `emphasis`: `plain`, `soft`, `solid`
- `state`: `rest`, `hover`, `selected`, `disabled`

These axes are allowed to map to the richer internal props already used by primitives. For example, `surface=panel + state=selected` can become `Surface kind="panel" interaction="selected"`, while `intent=danger + emphasis=solid` can become `Button tone="danger" variant="solid"`.

## Allowed Product Code

Product and feature code should express visual meaning through `@movscript/ui` contracts:

```tsx
<StatusBadge intent="success" emphasis="soft">Ready</StatusBadge>
<Button intent="danger" emphasis="solid">Delete</Button>
<Surface surface="panel" intent="info" emphasis="soft" state="selected" />
```

Business state should be mapped to these contracts before rendering:

```ts
const agentRunIntent = {
  idle: "neutral",
  planning: "info",
  running: "info",
  waiting: "warning",
  completed: "success",
  failed: "danger",
} as const;
```

## Disallowed Product Code

Product and feature code should not choose raw visual values:

```tsx
className="bg-green-500 text-white"
style={{ color: "var(--ms-color-success)" }}
className="border border-border bg-card"
```

Raw theme variables and CSS calculations belong in `@movscript/ui` CSS. Apps may use theme variables only in application bootstrap CSS such as scrollbars and the root background.

Legacy primitive props such as `tone`, `variant`, `kind`, and `interaction` remain available while existing screens migrate, but new code should prefer the semantic axis props.

## Extension Rule

When a new visual need appears, first map it to the existing axes. Add a new axis value only when it cannot be represented as surface, intent, emphasis, or state. Do not add business-specific CSS variables such as `--ms-agent-running-bg`; instead map `agent.running` to a UI recipe such as `intent="info" emphasis="soft"`.
