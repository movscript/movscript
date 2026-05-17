import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDebugContext } from './debugContext.js'

test('buildDebugContext ignores non-plain runtime context records', () => {
  class RuntimeSnapshot {
    route = { pathname: '/project/42' }
    project = { id: 42, name: 'Demo' }
    recentResources = [{ id: 7, name: 'script.md', type: 'script' }]
  }

  const context = buildDebugContext(new RuntimeSnapshot() as never, [], {
    visibleMessage: 'context',
    attachments: [],
    uiSnapshot: {
      route: { pathname: '/fallback' },
      project: { id: 7, name: 'Fallback' },
      recentResources: [{ id: 9, name: 'fallback.md', type: 'script' }],
    },
  })

  assert.equal(context.route.pathname, '/fallback')
  assert.deepEqual(context.project, { id: 7, name: 'Fallback' })
  assert.deepEqual(context.recentResources, [{ id: 9, name: 'fallback.md', type: 'script' }])
})

test('buildDebugContext drops invalid project and production ids', () => {
  const context = buildDebugContext({
    data: {
      focus: {
        project: { id: 0, name: 'Invalid runtime project' },
        productionId: 42.5,
      },
      projects: [
        { id: 0, name: 'Zero project' },
        { id: 7, name: 'Valid project' },
      ],
    },
  }, [], {
    visibleMessage: 'context',
    attachments: [],
    uiSnapshot: {
      project: { id: Number.NaN, name: 'Invalid UI project' },
      productionId: Number.POSITIVE_INFINITY,
    } as never,
  })

  assert.equal(context.project, undefined)
  assert.equal(context.productionId, undefined)
  assert.deepEqual(context.projects, [{ id: 7, name: 'Valid project' }])
})

test('buildDebugContext drops invalid user, resource, and attachment ids', () => {
  const context = buildDebugContext({
    data: {
      focus: {
        route: { pathname: '/resources' },
        user: { id: 0, username: 'invalid' },
        recentResources: [
          { id: 0, name: 'Zero', type: 'image' },
          { ID: 7.5, name: 'Fractional', type: 'image' },
          { ID: 8, name: 'Valid', type: 'image' },
        ],
      },
    },
  }, [], {
    visibleMessage: 'context',
    attachments: [
      { name: 'Invalid attachment', type: 'image', resourceId: Number.NaN },
      { name: 'Valid attachment', type: 'image', resourceId: 9 },
    ] as never,
    uiSnapshot: {
      recentResources: [
        { id: Number.POSITIVE_INFINITY, name: 'Infinite', type: 'image' },
        { id: 10, name: 'UI Valid', type: 'image' },
      ],
    } as never,
  })

  assert.equal(context.user, undefined)
  assert.deepEqual(context.recentResources, [
    { id: 8, name: 'Valid', type: 'image' },
    { id: 10, name: 'UI Valid', type: 'image' },
  ])
  assert.deepEqual(context.attachments, [
    { id: 'Invalid attachment', name: 'Invalid attachment', type: 'image' },
    { id: 'resource-9', name: 'Valid attachment', type: 'image', resourceId: 9 },
  ])
})

test('buildDebugContext drops invalid numeric selection entity ids', () => {
  const context = buildDebugContext({
    data: {
      focus: {
        route: { pathname: '/selection' },
        selection: { entityType: 'production', entityId: Number.NaN, label: 'Invalid runtime selection' },
      },
    },
  }, [], {
    visibleMessage: 'context',
    attachments: [],
    uiSnapshot: {
      selection: { entityType: 'scene', entityId: 7.5, label: 'Invalid UI selection' },
    } as never,
  })

  assert.equal(context.selection, null)
})
