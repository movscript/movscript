# Desktop app-server binaries

Place staged MovScript-managed app-server provider binaries here before building
desktop packages. These files are packaged as read-only app resources; at
runtime the desktop app copies them into the active workspace under
`.movscript/bin`.

Expected package layout:

- `codex/<platform>/<arch>/app-server`
- `mova/<platform>/<arch>/app-server`
- `codex/<platform>/<arch>/app-server.exe`
- `mova/<platform>/<arch>/app-server.exe`

Use the release helper instead of copying files manually:

```bash
pnpm run release -- stage-app-server-binaries --platform=darwin --arch=arm64
```

The helper reads `MOVSCRIPT_CODEX_APP_SERVER_BIN` and
`MOVSCRIPT_MOVA_APP_SERVER_BIN` when set. Otherwise it looks for sibling
`../codex/codex-rs` and `../mova/codex-rs` debug build outputs.

Runtime layout:

- `.movscript/bin/codex-app-server`
- `.movscript/bin/mova-app-server`
- `.movscript/bin/codex-app-server.exe`
- `.movscript/bin/mova-app-server.exe`
