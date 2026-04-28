# Internationalization

Movscript uses `i18next` and `react-i18next` in the frontend.

## Files

```text
apps/frontend/src/i18n/
  index.ts
  locales/
    en-US.json
    zh-CN.json
```

## Rules

- Add every user-facing frontend string to both locale files.
- Use stable keys grouped by product area, for example `sidebar.items.scripts`.
- Keep backend API errors machine-readable where possible and localize display text in the frontend.
- Do not translate AI prompts automatically without reviewing output quality.

## Current scope

The application shell, primary navigation, language selector, theme tooltip, and generic request failure message are internationalized. Page-level migration can continue incrementally by feature area.
