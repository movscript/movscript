const bootstrapRaw = process.env.MOVSCRIPT_E2E_BOOTSTRAP_JSON
const bootstrapKey = 'movscript-e2e-bootstrap'

if (bootstrapRaw) {
  try {
    window.localStorage.setItem(bootstrapKey, bootstrapRaw)
  } catch {
    // about:blank may not expose localStorage yet; the real app navigation will.
  }
}
