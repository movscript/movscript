# Adoption Plan

## Phase 1: Tokens

Import `@movscript/tokens/theme.css` in all three products and map existing global colors, radius, typography, shadows, and focus rings to MovScript CSS variables.

Recommended order:

1. `platform/apps/web`
2. `platform/apps/hub`
3. `movscript/frontend`

## Phase 2: Low-level Components

Move shared low-level controls to `@movscript/ui` only when they are product-neutral:

- Button
- Input
- Label
- Badge
- Card
- Dialog
- Dropdown
- Tabs
- Tooltip

Keep product-specific pages and layouts in the product repos.

## Phase 3: Patterns

After the base components settle, add repeated patterns:

- Empty states
- Project lists
- Settings sections
- Property panels
- Form rows
- App shell primitives

## Compatibility Rules

- React must remain a peer dependency with React 18 and React 19 support.
- Components must not import Next.js APIs.
- CSS must be consumable without Tailwind scanning this package.
- Browser-only behavior must be isolated to client components in consumers when used by Next.js.

