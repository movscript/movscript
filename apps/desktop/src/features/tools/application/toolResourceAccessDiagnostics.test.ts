import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  detectToolResourceAccessDiagnostic,
  toolResourceAccessDiagnosticMessage,
} from './toolResourceAccessDiagnostics'

describe('toolResourceAccessDiagnostics', () => {
  it('detects resource access profile errors from response bodies', () => {
    const diagnostic = detectToolResourceAccessDiagnostic({
      response: {
        data: {
          code: 'missing_resource_access_profile',
          error: 'resource access profile is required before local resources can be exposed as public URLs',
        },
      },
    })

    assert.equal(diagnostic?.kind, 'missing_profile')
  })

  it('detects missing signing secret errors before generic public URL errors', () => {
    const diagnostic = detectToolResourceAccessDiagnostic('resource access profile signing_secret is required')
    assert.equal(diagnostic?.kind, 'missing_signing_secret')
  })

  it('detects async job public URL diagnostics', () => {
    const diagnostic = detectToolResourceAccessDiagnostic(
      'route 12 requires public image URL for resource #88; configure resource access public URL or object relay before generation',
    )

    assert.equal(diagnostic?.kind, 'public_url_unavailable')
  })

  it('formats translated diagnostic messages', () => {
    const message = toolResourceAccessDiagnosticMessage(
      { data: { code: 'missing_resource_access_profile' } },
      (key, options) => `${key}:${String(options?.defaultValue ?? '')}`,
    )

    assert.match(message ?? '', /^tools\.errors\.resourceAccess\.missingProfile:/)
  })

  it('wires the diagnostic into tool entry points and locales', () => {
    const root = resolve('apps/desktop')
    const dialogSource = readFileSync(resolve(root, 'src/features/tools/components/ToolDialog.tsx'), 'utf8')
    const canvasSource = readFileSync(resolve(root, 'src/features/tools/application/useToolCanvas.ts'), 'utf8')
    const zh = readFileSync(resolve(root, 'src/i18n/locales/zh-CN.json'), 'utf8')
    const en = readFileSync(resolve(root, 'src/i18n/locales/en-US.json'), 'utf8')

    assert.match(dialogSource, /toolResourceAccessDiagnosticMessage\(err, t\)/)
    assert.match(dialogSource, /toolResourceAccessDiagnosticMessage\(activeJob\.error_msg, t\)/)
    assert.match(canvasSource, /toolResourceAccessDiagnosticMessage\(latest\.error_msg, t\)/)
    assert.match(zh, /"publicUrlUnavailable"/)
    assert.match(en, /"publicUrlUnavailable"/)
  })
})
