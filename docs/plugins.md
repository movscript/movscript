# Plugins

Plugin-related code lives in:

- `apps/movcli`: plugin packaging and debug CLI.
- `packages/plugin-sdk`: TypeScript plugin SDK.
- `plugins/*`: first-party plugin examples.

Common commands:

```bash
make dev-movcli
pnpm run build:plugins
```

Plugins should expose capabilities through declarative manifests and avoid bypassing backend data boundaries.
