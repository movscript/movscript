# UI Adoption Plan

This plan tracks how shared design tokens and UI primitives should be adopted inside this repository.

## Phase 1: Tokens

Use `@movscript/tokens/theme.css` as the shared source for:

- Colors
- Typography
- Radius
- Shadows
- Spacing
- Motion
- Focus rings

The Electron frontend should import tokens once at the application root before shared component styles.

## Phase 2: Low-Level Components

Move shared controls to `@movscript/ui` only when they are product-neutral:

- Button
- Input
- Label
- Badge
- Card
- Dialog
- Dropdown menu
- Tabs
- Tooltip
- Scroll area
- Progress

Product-specific pages, API calls, routing, permissions, and copy stay in `apps/frontend`.

## Phase 3: Product Patterns

Add repeated patterns only after the low-level components are stable:

- Empty states
- Settings sections
- Property panels
- Form rows
- Tool call/status rows
- Agent conversation primitives

Patterns should remain data-agnostic and accept rendered children or plain props.

## Compatibility Rules

- React must remain a peer dependency.
- Components must not import Electron, React Router, TanStack Query, Zustand, or backend API clients.
- CSS must be consumable without requiring consumers to scan package source with Tailwind.
- Browser-only behavior must be isolated so packages remain usable in non-Electron React apps.
