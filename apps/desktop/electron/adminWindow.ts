import { app, BrowserWindow, net, protocol } from 'electron'
import { existsSync, statSync } from 'fs'
import { join, normalize, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { bindWindowRenderDiagnostics } from './diagnostics/rendering'
import { bindDevtoolsShortcut } from './appWindow/devtools'
import { resolveAppIconPath, resolvePreloadPath } from './appWindow/paths'
import { bindTitlebarChromeToZoom, titleBarOptionsForPlatform } from './appWindow/titlebar'
import {
  ELECTRON_ADMIN_ORIGIN,
  readAdminRendererURLFromEnv,
  resolveAdminConsoleURL,
} from './services/adminConsole'
import type { ElectronAPI } from '../src/shared/contracts/electronApi'

const ADMIN_PROTOCOL_SCHEME = 'movscript-admin'

let protocolInstalled = false
let adminWindow: BrowserWindow | null = null

export function registerAdminProtocolPrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ADMIN_PROTOCOL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ])
}

export function installAdminProtocol(): void {
  if (protocolInstalled) return
  protocolInstalled = true
  protocol.handle(ADMIN_PROTOCOL_SCHEME, (request) => {
    const filePath = resolveAdminAssetPath(request.url)
    if (!filePath) {
      return new Response('Admin build not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

export async function openAdminConsoleWindow(input?: Parameters<NonNullable<ElectronAPI['openAdminConsole']>>[0]): Promise<{ url: string }> {
  installAdminProtocol()
  const rendererURL = resolveAdminRendererURL()
  const url = resolveAdminConsoleURL(input, rendererURL ? { rendererURL } : undefined)
  const win = getOrCreateAdminWindow()
  try {
    await win.loadURL(url)
  } catch (error) {
    await loadAdminConsoleErrorPage(win, {
      url,
      rendererURL,
      error,
      adminDistDir: resolveAdminDistDir(),
    })
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return { url }
}

function getOrCreateAdminWindow(): BrowserWindow {
  if (adminWindow && !adminWindow.isDestroyed()) return adminWindow

  adminWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    title: 'Movscript Admin',
    icon: resolveAppIconPath(),
    ...titleBarOptionsForPlatform(process.platform),
    webPreferences: {
      preload: resolvePreloadPath(),
      sandbox: false,
    },
  })

  bindTitlebarChromeToZoom(adminWindow, process.platform)
  bindWindowRenderDiagnostics(adminWindow)
  bindDevtoolsShortcut(adminWindow)
  adminWindow.on('closed', () => {
    adminWindow = null
  })
  return adminWindow
}

function resolveAdminRendererURL(): string {
  return readAdminRendererURLFromEnv()
}

function resolveAdminAssetPath(requestURL: string): string | null {
  const adminDir = resolveAdminDistDir()
  const indexPath = join(adminDir, 'index.html')
  if (!isReadableFile(indexPath)) return null

  const url = new URL(requestURL)
  const relativePath = safeRelativePath(url.pathname)
  const candidate = relativePath ? resolve(adminDir, relativePath) : indexPath
  if (isPathInside(candidate, adminDir) && isReadableFile(candidate)) return candidate
  return indexPath
}

function resolveAdminDistDir(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'admin')
  return resolveDevAdminDistDir()
}

function resolveDevAdminDistDir(): string {
  const candidates = [
    resolve(process.cwd(), '../../surface/admin/dist'),
    resolve(process.cwd(), '../surface/admin/dist'),
    resolve(process.cwd(), 'surface/admin/dist'),
  ]
  return candidates.find((candidate) => isReadableFile(join(candidate, 'index.html'))) ?? candidates[0]
}

function safeRelativePath(pathname: string): string {
  const decoded = decodeURIComponent(pathname)
  const normalized = normalize(decoded).replace(/^[/\\]+/, '')
  return normalized === '.' ? '' : normalized
}

function isPathInside(candidate: string, root: string): boolean {
  const resolvedRoot = resolve(root)
  const resolvedCandidate = resolve(candidate)
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${sep}`)
}

function isReadableFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile()
  } catch {
    return false
  }
}

export function resolveElectronAdminOrigin(): string {
  return ELECTRON_ADMIN_ORIGIN
}

async function loadAdminConsoleErrorPage(
  win: BrowserWindow,
  input: {
    url: string
    rendererURL: string
    error: unknown
    adminDistDir: string
  },
): Promise<void> {
  const reason = input.error instanceof Error ? input.error.message : String(input.error)
  const likelyCause = input.rendererURL
    ? `The admin dev renderer is not reachable at ${input.rendererURL}. Start @movscript/admin-surface dev or set ELECTRON_ADMIN_URL / MOVSCRIPT_ADMIN_RENDERER_URL.`
    : `The admin surface build was not found at ${input.adminDistDir}. Run pnpm --filter @movscript/admin-surface build before opening the desktop admin console.`
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
    <title>Movscript Admin failed to load</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f7f9;
        color: #17191c;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          background: #111316;
          color: #f5f7fa;
        }
        .panel {
          background: #181b20;
          border-color: #2a2f37;
        }
        code {
          background: #101215;
          border-color: #2a2f37;
        }
        p, li {
          color: #b8c0cc;
        }
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px;
        box-sizing: border-box;
      }
      .panel {
        width: min(720px, 100%);
        border: 1px solid #d8dde5;
        border-radius: 8px;
        background: #ffffff;
        padding: 28px;
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.12);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 20px;
        line-height: 1.3;
      }
      p {
        margin: 0 0 14px;
        line-height: 1.55;
        color: #5d6673;
      }
      .meta {
        display: grid;
        gap: 10px;
        margin-top: 18px;
      }
      code {
        display: block;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        border: 1px solid #d8dde5;
        border-radius: 6px;
        background: #f3f5f8;
        padding: 10px 12px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 12px;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <h1>Movscript Admin could not be loaded</h1>
      <p>${escapeHTML(likelyCause)}</p>
      <div class="meta">
        <code>Target URL: ${escapeHTML(input.url)}</code>
        <code>Reason: ${escapeHTML(reason)}</code>
      </div>
    </main>
  </body>
</html>`
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
}

function escapeHTML(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
