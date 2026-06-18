import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resolveDesktopIdentity } from './desktopIdentity'

test('community desktop identity keeps the existing MovScript home', () => {
  const identity = resolveDesktopIdentity({})

  assert.equal(identity.edition, 'community')
  assert.equal(identity.appName, 'Movscript')
  assert.equal(identity.homeDir, join(homedir(), '.movscript'))
  assert.equal(identity.userDataDir, undefined)
})

test('enterprise desktop identity uses independent app and home paths', () => {
  const identity = resolveDesktopIdentity({ MOVSCRIPT_DESKTOP_EDITION: 'enterprise' })

  assert.equal(identity.edition, 'enterprise')
  assert.equal(identity.appName, 'MovScript Enterprise')
  assert.equal(identity.homeDir, join(homedir(), '.movscript-enterprise'))
  assert.match(identity.userDataDir ?? '', /MovScript Enterprise$/)
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
