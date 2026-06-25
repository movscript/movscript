interface ImportMetaEnv {
  readonly DEV: boolean
  readonly VITE_MOVSCRIPT_RENDER_DIAGNOSTICS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
