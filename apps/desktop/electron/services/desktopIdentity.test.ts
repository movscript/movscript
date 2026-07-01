import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'
import { resolveDesktopIdentity } from './desktopIdentity'

test('community desktop identity keeps the existing MovScript home', () => {
  const userHomeDir = join('/', 'Users', 'me')
  const identity = resolveDesktopIdentity({}, {
    platform: 'darwin',
    userHomeDir,
  })

  assert.equal(identity.edition, 'community')
  assert.equal(identity.appName, 'Movscript')
  assert.equal(identity.homeDir, join(userHomeDir, '.movscript'))
  assert.equal(identity.userDataDir, undefined)
})

test('community desktop identity uses LocalAppData for Windows MovScript home', () => {
  const identity = resolveDesktopIdentity({
    LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
    APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
  }, {
    platform: 'win32',
    userHomeDir: 'C:\\Users\\me',
  })

  assert.equal(identity.edition, 'community')
  assert.equal(identity.appName, 'Movscript')
  assert.equal(identity.homeDir, 'C:\\Users\\me\\AppData\\Local\\MovScript\\Home')
  assert.equal(identity.userDataDir, undefined)
})

test('enterprise desktop identity uses independent app and home paths', () => {
  const userHomeDir = join('/', 'Users', 'me')
  const identity = resolveDesktopIdentity({ MOVSCRIPT_DESKTOP_EDITION: 'enterprise' }, {
    platform: 'darwin',
    userHomeDir,
  })

  assert.equal(identity.edition, 'enterprise')
  assert.equal(identity.appName, 'MovScript Enterprise')
  assert.equal(identity.homeDir, join(userHomeDir, '.movscript-enterprise'))
  assert.match(identity.userDataDir ?? '', /MovScript Enterprise$/)
})

test('enterprise desktop identity separates Windows home and Electron profile paths', () => {
  const identity = resolveDesktopIdentity({
    MOVSCRIPT_DESKTOP_EDITION: 'enterprise',
    LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
    APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
  }, {
    platform: 'win32',
    userHomeDir: 'C:\\Users\\me',
  })

  assert.equal(identity.edition, 'enterprise')
  assert.equal(identity.homeDir, 'C:\\Users\\me\\AppData\\Local\\MovScript Enterprise\\Home')
  assert.equal(identity.userDataDir, 'C:\\Users\\me\\AppData\\Roaming\\MovScript Enterprise')
})

test('desktop identity honors explicit enterprise overrides', () => {
  const identity = resolveDesktopIdentity({
    MOVSCRIPT_APP_EDITION: 'enterprise',
    MOVSCRIPT_DESKTOP_APP_NAME: 'MovScript Enterprise QA',
    MOVSCRIPT_DESKTOP_HOME: '/tmp/movscript-enterprise-qa',
    MOVSCRIPT_DESKTOP_USER_DATA_DIR: '/tmp/movscript-enterprise-user-data',
  })

  assert.equal(identity.edition, 'enterprise')
  assert.equal(identity.appName, 'MovScript Enterprise QA')
  assert.equal(identity.homeDir, '/tmp/movscript-enterprise-qa')
  assert.equal(identity.userDataDir, '/tmp/movscript-enterprise-user-data')
})
