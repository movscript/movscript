# Architecture

The UI packages are small shared workspace packages, not product apps.

## Package Boundaries

`@movscript/tokens` owns the design language:

- Colors
- Typography
- Radius
- Shadows
- Spacing
- Motion
- Focus rings

`@movscript/ui` owns product-neutral React components:

- Components use CSS classes from `@movscript/ui/styles.css`.
- Component styling is based on CSS variables from `@movscript/tokens/theme.css`.
- Components avoid product routing, auth, data fetching, and domain language.

## Styling Model

Consumers import CSS once:

```tsx
import "@movscript/tokens/theme.css";
import "@movscript/ui/styles.css";
```

This keeps the UI package compatible with:

- Tailwind CSS 3 in the Electron app.
- Tailwind CSS 4 in Next.js apps.
- Consumers that do not scan package source with Tailwind.
