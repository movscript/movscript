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
- Keep route names, provider IDs, model IDs, capability constants, and plugin IDs untranslated.

## Current Scope

The application shell, primary navigation, language selector, theme tooltip, and generic request failure message are internationalized. Page-level migration can continue incrementally by feature area.

## Review Checklist

- No hard-coded user-facing text in new React components unless it is intentionally developer-only.
- Both `zh-CN.json` and `en-US.json` include the same keys.
- Dynamic status strings use a translation map rather than displaying raw backend values directly.
- Empty, loading, success, and error states are covered.
