import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { resolveDesktopIdentity } from './desktopIdentity'

test('default desktop identity keeps the existing MovScript home', () => {
  const userHomeDir = join('/', 'Users', 'me')
  const identity = resolveDesktopIdentity({}, {
    platform: 'darwin',
    userHomeDir,
  })

  assert.equal(identity.distributionProfile, 'default-local')
  assert.equal(identity.appName, 'Movscript')
  assert.equal(identity.homeDir, join(userHomeDir, '.movscript'))
  assert.equal(identity.userDataDir, undefined)
})

test('default desktop identity uses LocalAppData for Windows MovScript home', () => {
  const identity = resolveDesktopIdentity({
    LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
    APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
  }, {
    platform: 'win32',
    userHomeDir: 'C:\\Users\\me',
  })

  assert.equal(identity.distributionProfile, 'default-local')
  assert.equal(identity.appName, 'Movscript')
  assert.equal(identity.homeDir, 'C:\\Users\\me\\AppData\\Local\\MovScript\\Home')
  assert.equal(identity.userDataDir, undefined)
})

test('self-hosted desktop identity uses independent app and home paths', () => {
  const userHomeDir = join('/', 'Users', 'me')
  const identity = resolveDesktopIdentity({ MOVSCRIPT_DISTRIBUTION_PROFILE: 'self-hosted' }, {
    platform: 'darwin',
    userHomeDir,
  })

  assert.equal(identity.distributionProfile, 'self-hosted')
  assert.equal(identity.appName, 'MovScript Self Hosted')
  assert.equal(identity.homeDir, join(userHomeDir, '.movscript-self-hosted'))
  assert.match(identity.userDataDir ?? '', /MovScript Self Hosted$/)
})

test('self-hosted desktop identity separates Windows home and Electron profile paths', () => {
  const identity = resolveDesktopIdentity({
    MOVSCRIPT_DESKTOP_DISTRIBUTION_PROFILE: 'self-hosted',
    LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
    APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
  }, {
    platform: 'win32',
    userHomeDir: 'C:\\Users\\me',
  })

  assert.equal(identity.distributionProfile, 'self-hosted')
  assert.equal(identity.homeDir, 'C:\\Users\\me\\AppData\\Local\\MovScript Self Hosted\\Home')
  assert.equal(identity.userDataDir, 'C:\\Users\\me\\AppData\\Roaming\\MovScript Self Hosted')
})

test('desktop identity honors explicit custom distribution overrides', () => {
  const identity = resolveDesktopIdentity({
    MOVSCRIPT_DISTRIBUTION_PROFILE: 'custom',
    MOVSCRIPT_DESKTOP_APP_NAME: 'MovScript Custom QA',
    MOVSCRIPT_DESKTOP_HOME: '/tmp/movscript-custom-qa',
    MOVSCRIPT_DESKTOP_USER_DATA_DIR: '/tmp/movscript-custom-user-data',
  })

  assert.equal(identity.distributionProfile, 'custom')
  assert.equal(identity.appName, 'MovScript Custom QA')
  assert.equal(identity.homeDir, '/tmp/movscript-custom-qa')
  assert.equal(identity.userDataDir, '/tmp/movscript-custom-user-data')
})

test('desktop identity maps legacy edition env vars to distribution profiles', () => {
  const userHomeDir = join('/', 'Users', 'me')
  const identity = resolveDesktopIdentity({ MOVSCRIPT_DESKTOP_EDITION: 'enterprise' }, {
    platform: 'darwin',
    userHomeDir,
  })

  assert.equal(identity.distributionProfile, 'self-hosted')
  assert.equal(identity.homeDir, join(userHomeDir, '.movscript-self-hosted'))
})
