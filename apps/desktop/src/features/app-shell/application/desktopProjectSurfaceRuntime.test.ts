import assert from 'node:assert/strict'
import test from 'node:test'

import {
  desktopRemotionStudioShellFinishedBeforeReady,
  desktopRemotionStudioShellWorkspaceKey,
  desktopRemotionStudioSessionWithShell,
  desktopProjectSurfaceHref,
  desktopProjectSurfacePath,
  readDesktopDaemonGatewayBaseURL,
  resolveBackendGitRemoteURL,
} from './desktopProjectSurfaceRuntimeModel'

test('desktop project surface adapter keeps the Desktop project home UI route', () => {
  assert.equal(desktopProjectSurfacePath('overview', 'proj_uid_7'), '/project/home')
  assert.equal(desktopProjectSurfacePath('scripts', 'proj_uid_7'), '/project/scripts/workbench')
  assert.equal(desktopProjectSurfacePath('standards', 'proj_uid_7'), '/project/standards')
  assert.equal(desktopProjectSurfacePath('content', 'proj_uid_7'), '/project/content')
  assert.equal(desktopProjectSurfacePath('contentCanvas', 'proj_uid_7'), '/project/content/canvas')
  assert.equal(desktopProjectSurfacePath('contentPreview', 'proj_uid_7'), '/project/content/preview')
  assert.equal(desktopProjectSurfacePath('remotionStudio', 'proj_uid_7'), '/project/remotion-studio')
  assert.equal(desktopProjectSurfacePath('settingPreview', 'proj_uid_7'), '/project/settings/preview')
  assert.equal(desktopProjectSurfacePath('settings', 'proj_uid_7'), '/project/settings')
})

test('desktop project surface adapter uses canonical studio routes for newer surfaces', () => {
  assert.equal(desktopProjectSurfacePath('impact', 'proj_uid_7'), '/studio/proj_uid_7/impact')
  assert.equal(
    desktopProjectSurfaceHref('impact', 'proj_uid_7', { productionId: 'production 1' }),
    '/studio/proj_uid_7/impact?productionId=production+1',
  )
  assert.equal(
    desktopProjectSurfaceHref('dailies', 'rain/night', { contentUnitId: 'scene 1' }),
    '/studio/rain%2Fnight/dailies?contentUnitId=scene+1',
  )
})

test('desktop project surface reads daemon gateway from runtime descriptor instead of legacy apiBaseURL', () => {
  assert.equal(
    readDesktopDaemonGatewayBaseURL({
      runtime: { gateway: { baseURL: 'http://127.0.0.1:8766' } },
      apiBaseURL: 'http://legacy.example:8765',
    } as Parameters<typeof readDesktopDaemonGatewayBaseURL>[0] & { apiBaseURL: string }),
    'http://127.0.0.1:8766',
  )
  assert.equal(
    readDesktopDaemonGatewayBaseURL({
      apiBaseURL: 'http://legacy.example:8765',
    } as Parameters<typeof readDesktopDaemonGatewayBaseURL>[0] & { apiBaseURL: string }),
    undefined,
  )
})

test('desktop project surface resolves backend git paths through daemon gateway descriptor', () => {
  assert.equal(
    resolveBackendGitRemoteURL('/api/v1/projects/7/git/remote', 'http://127.0.0.1:8766/'),
    'http://127.0.0.1:8766/api/v1/projects/7/git/remote',
  )
  assert.equal(
    resolveBackendGitRemoteURL('https://git.example/repo.git', 'http://127.0.0.1:8766'),
    'https://git.example/repo.git',
  )
  assert.equal(
    resolveBackendGitRemoteURL('/api/v1/projects/7/git/remote'),
    '/api/v1/projects/7/git/remote',
  )
})

test('desktop remotion shell workspace key dedupes the same command in the same workspace', () => {
  const key = desktopRemotionStudioShellWorkspaceKey({
    projectKey: 'proj_uid_7',
    projectDirectory: ' /tmp/movscript/project/.movscript/production-editing/remotion-a ',
    commandText: ' pnpm exec remotion studio src/Root.tsx ',
  })

  assert.equal(
    key,
    JSON.stringify({
      schema: 'movscript.remotion_studio_shell_binding_key.v1',
      projectKey: 'proj_uid_7',
      projectDirectory: '/tmp/movscript/project/.movscript/production-editing/remotion-a',
      commandText: 'pnpm exec remotion studio src/Root.tsx',
    }),
  )
  assert.equal(desktopRemotionStudioShellWorkspaceKey({
    projectKey: 'proj_uid_7',
    projectDirectory: '/tmp/movscript/project/.movscript/production-editing/remotion-a',
  }), undefined)
  assert.equal(desktopRemotionStudioShellWorkspaceKey({
    projectKey: 'proj_uid_7',
    commandText: 'pnpm exec remotion studio src/Root.tsx',
  }), undefined)
})

test('desktop remotion session shell handoff keeps preview polling states accurate', () => {
  const shellBinding = {
    shellSessionId: 'shell-remotion-1',
    shellJobId: 'desktop-shell-host-job:shell-remotion-1',
  }
  const runningShell = {
    schema: 'movscript.shell_session.v1' as const,
    id: 'shell-remotion-1',
    status: 'running' as const,
  }

  const handoff = desktopRemotionStudioSessionWithShell(
    {
      schema: 'movscript.remotion_studio_session.v1',
      sessionId: 'remotion-session-1',
      status: 'needs_external_shell',
      previewUrl: 'http://127.0.0.1:7777',
    },
    shellBinding,
    runningShell,
  )

  assert.equal(handoff.status, 'starting')
  assert.equal(handoff.previewUrl, 'http://127.0.0.1:7777')
  assert.equal(handoff.shellSessionId, 'shell-remotion-1')
  assert.equal(handoff.shellJobId, 'desktop-shell-host-job:shell-remotion-1')
  assert.equal(handoff.shellStatus, 'running')

  const ready = desktopRemotionStudioSessionWithShell(
    {
      schema: 'movscript.remotion_studio_session.v1',
      sessionId: 'remotion-session-1',
      status: 'ready',
      previewUrl: 'http://127.0.0.1:7777',
    },
    shellBinding,
    runningShell,
  )

  assert.equal(ready.status, 'ready')
  assert.equal(ready.previewUrl, 'http://127.0.0.1:7777')
  assert.equal(ready.shellStatus, 'running')
})

test('desktop remotion session reports shell failure before studio readiness', () => {
  const failed = desktopRemotionStudioSessionWithShell(
    {
      schema: 'movscript.remotion_studio_session.v1',
      sessionId: 'remotion-session-2',
      status: 'starting',
      previewUrl: 'http://127.0.0.1:7778',
    },
    {
      shellSessionId: 'shell-remotion-2',
      shellJobId: 'desktop-shell-host-job:shell-remotion-2',
    },
    {
      schema: 'movscript.shell_session.v1',
      id: 'shell-remotion-2',
      status: 'failed',
    },
  )

  assert.equal(failed.status, 'failed')
  assert.equal(failed.shellStatus, 'failed')
  assert.equal(failed.error, 'Remotion Studio 的 Shell 任务在 Studio 就绪前失败。')
})

test('desktop remotion shell finished state is reusable by runtime binding recovery', () => {
  assert.equal(desktopRemotionStudioShellFinishedBeforeReady(
    { status: 'needs_external_shell' },
    { schema: 'movscript.shell_session.v1', id: 'shell-remotion-3', status: 'failed' },
  ), true)
  assert.equal(desktopRemotionStudioShellFinishedBeforeReady(
    { status: 'starting' },
    { schema: 'movscript.shell_session.v1', id: 'shell-remotion-3', status: 'exited' },
  ), true)
  assert.equal(desktopRemotionStudioShellFinishedBeforeReady(
    { status: 'ready' },
    { schema: 'movscript.shell_session.v1', id: 'shell-remotion-3', status: 'failed' },
  ), false)
  assert.equal(desktopRemotionStudioShellFinishedBeforeReady(
    { status: 'needs_external_shell' },
    { schema: 'movscript.shell_session.v1', id: 'shell-remotion-3', status: 'running' },
  ), false)
})
