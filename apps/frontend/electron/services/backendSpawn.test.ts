import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBackendSpawnEnv } from './backend/env'

test('backend spawn env defaults to local dependency providers', () => {
  const env = buildBackendSpawnEnv({
    dataDir: '/tmp/data',
    localSecret: 'secret',
    inheritedEnv: {},
  })

  assert.equal(env.MOVSCRIPT_DEPENDENCY_PROFILE, 'local')
  assert.equal(env.DB_DRIVER, 'sqlite')
  assert.equal(env.STORAGE_BACKEND, 'filesystem')
  assert.equal(env.CACHE_BACKEND, 'memory')
  assert.equal(env.MOVSCRIPT_WORKSPACE_BACKEND, 'http')
  assert.equal(env.MOVSCRIPT_WORKSPACE_STORAGE_BACKEND, 'http')
  assert.equal(env.MOVSCRIPT_GIT_HTTP_ROOT, '/tmp/data/git')
  assert.equal(env.MOVSCRIPT_GIT_BINARY, 'git')
  assert.equal(env.MOVSCRIPT_GITEA_BASE_URL, '')
  assert.equal(env.MOVSCRIPT_GITEA_ADMIN_USERNAME, '')
  assert.equal(env.MOVSCRIPT_GITEA_ADMIN_PASSWORD, '')
  assert.equal(Object.keys(env).some((key) => key.includes('ADMIN_DIR')), false)
})

test('backend spawn env can select external dependency providers', () => {
  const env = buildBackendSpawnEnv({
    dataDir: '/tmp/data',
    localSecret: 'secret',
    inheritedEnv: {
      MOVSCRIPT_DEPENDENCY_PROFILE: 'external',
    },
  })

  assert.equal(env.MOVSCRIPT_DEPENDENCY_PROFILE, 'external')
  assert.equal(env.DB_DRIVER, 'postgres')
  assert.equal(env.STORAGE_BACKEND, 'minio')
  assert.equal(env.CACHE_BACKEND, 'redis')
  assert.equal(env.MOVSCRIPT_WORKSPACE_BACKEND, 'gitea')
  assert.equal(env.MOVSCRIPT_WORKSPACE_STORAGE_BACKEND, 'gitea')
  assert.equal(env.MOVSCRIPT_GITEA_BASE_URL, 'http://localhost:3303')
  assert.equal(env.MOVSCRIPT_GITEA_ADMIN_USERNAME, 'movscript')
  assert.equal(env.MOVSCRIPT_GITEA_ADMIN_PASSWORD, 'movscript12345')
  assert.equal(env.MOVSCRIPT_GITEA_REPO_PREFIX, 'movscript-project-')
  assert.equal(env.MOVSCRIPT_GITEA_BRANCH, 'main')
  assert.equal(env.MOVSCRIPT_GITEA_USER_EMAIL_DOMAIN, 'users.movscript.local')
  assert.equal(env.MOVSCRIPT_GITEA_USER_TOKEN_NAME, 'movscript-desktop')
})

test('backend spawn env preserves explicit gitea configuration', () => {
  const env = buildBackendSpawnEnv({
    dataDir: '/tmp/data',
    localSecret: 'secret',
    inheritedEnv: {
      MOVSCRIPT_WORKSPACE_BACKEND: 'http',
      MOVSCRIPT_WORKSPACE_STORAGE_BACKEND: 'http',
      MOVSCRIPT_GITEA_BASE_URL: 'http://gitea.internal:3000',
      MOVSCRIPT_GITEA_TOKEN: 'admin-token',
      MOVSCRIPT_GITEA_ADMIN_USERNAME: 'admin',
      MOVSCRIPT_GITEA_ADMIN_PASSWORD: 'admin-password',
      MOVSCRIPT_GITEA_REPO_PREFIX: 'repo-',
      MOVSCRIPT_GITEA_BRANCH: 'develop',
      MOVSCRIPT_GITEA_USER_EMAIL_DOMAIN: 'users.example',
      MOVSCRIPT_GITEA_USER_TOKEN_NAME: 'desktop',
      MOVSCRIPT_GIT_HTTP_ROOT: '/tmp/custom-git',
      MOVSCRIPT_GIT_BINARY: '/usr/bin/git',
    },
  })

  assert.equal(env.MOVSCRIPT_DEPENDENCY_PROFILE, 'local')
  assert.equal(env.MOVSCRIPT_WORKSPACE_BACKEND, 'http')
  assert.equal(env.MOVSCRIPT_WORKSPACE_STORAGE_BACKEND, 'http')
  assert.equal(env.MOVSCRIPT_GITEA_BASE_URL, 'http://gitea.internal:3000')
  assert.equal(env.MOVSCRIPT_GITEA_TOKEN, 'admin-token')
  assert.equal(env.MOVSCRIPT_GITEA_ADMIN_USERNAME, 'admin')
  assert.equal(env.MOVSCRIPT_GITEA_ADMIN_PASSWORD, 'admin-password')
  assert.equal(env.MOVSCRIPT_GITEA_REPO_PREFIX, 'repo-')
  assert.equal(env.MOVSCRIPT_GITEA_BRANCH, 'develop')
  assert.equal(env.MOVSCRIPT_GITEA_USER_EMAIL_DOMAIN, 'users.example')
  assert.equal(env.MOVSCRIPT_GITEA_USER_TOKEN_NAME, 'desktop')
  assert.equal(env.MOVSCRIPT_GIT_HTTP_ROOT, '/tmp/custom-git')
  assert.equal(env.MOVSCRIPT_GIT_BINARY, '/usr/bin/git')
})
