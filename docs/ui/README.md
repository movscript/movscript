# UI Documentation

UI docs cover shared design packages and product-neutral agent UI primitives.

## Packages

| Package | Purpose |
| --- | --- |
| `@movscript/tokens` | CSS variables and design token exports. |
| `@movscript/ui` | Shared React UI primitives and agent chat layout components. |

## Documents

- [architecture.md](architecture.md): package boundaries and CSS import model.
- [adoption.md](adoption.md): shared UI adoption plan.
- [agent-ui.md](agent-ui.md): product-neutral agent chat component composition.

## Consumer Rule

Import shared CSS once near the app root:

```tsx
import "@movscript/tokens/theme.css";
import "@movscript/ui/styles.css";
```

Product apps own routing, data fetching, auth, domain copy, and persistence. Shared UI packages should stay product-neutral.
