import assert from 'node:assert/strict'
import test from 'node:test'

import { dmgBuilderEnv } from '../../../scripts/release/release-workflow.mjs'

test('release dmgBuilderEnv removes empty Electron Builder signing environment', () => {
  assert.deepEqual(dmgBuilderEnv({
    PATH: '/bin',
    PYTHON_PATH: '',
    CSC_LINK: '',
    CSC_NAME: '   ',
    CSC_KEY_PASSWORD: '',
    APPLE_ID: '',
    APPLE_APP_SPECIFIC_PASSWORD: '',
    APPLE_TEAM_ID: '',
  }), {
    PATH: '/bin',
  })
})

test('release dmgBuilderEnv trims explicit Electron Builder signing environment', () => {
  assert.deepEqual(dmgBuilderEnv({
    PATH: '/bin',
    PYTHON_PATH: ' /usr/bin/python3 ',
    CSC_LINK: ' file:///cert.p12 ',
    CSC_KEY_PASSWORD: ' password ',
    APPLE_API_KEY: ' /key/AuthKey.p8 ',
    APPLE_API_KEY_ID: ' KEYID ',
    APPLE_API_ISSUER: ' ISSUER ',
  }), {
    PATH: '/bin',
    PYTHON_PATH: '/usr/bin/python3',
    CSC_LINK: 'file:///cert.p12',
    CSC_KEY_PASSWORD: 'password',
    APPLE_API_KEY: '/key/AuthKey.p8',
    APPLE_API_KEY_ID: 'KEYID',
    APPLE_API_ISSUER: 'ISSUER',
  })
})
