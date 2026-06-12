import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDefaultAgentContentArea,
  useAgentContentAreaStore,
} from './agentContentAreaStore'

function resetContentAreaStore() {
  useAgentContentAreaStore.setState({
    contentAreasByConversation: {},
  })
}

test('agent content areas are isolated by conversation id', () => {
  resetContentAreaStore()

  useAgentContentAreaStore.getState().updateBrowserState('conv_a', (current) => ({
    ...current,
    tabs: [
      ...current.tabs,
      {
        id: 'resources_a',
        kind: 'resources',
        title: '资源库',
        createdAt: 1000,
      },
    ],
    activeTabId: 'resources_a',
  }))
  useAgentContentAreaStore.getState().updateBrowserState('conv_b', (current) => ({
    ...current,
    tabs: [
      ...current.tabs,
      {
        id: 'canvas_b',
        kind: 'canvas_list',
        title: '画布列表',
        createdAt: 2000,
      },
    ],
    activeTabId: 'canvas_b',
  }))

  const state = useAgentContentAreaStore.getState().contentAreasByConversation

  assert.equal(state.conv_a.browser.activeTabId, 'resources_a')
  assert.equal(state.conv_b.browser.activeTabId, 'canvas_b')
  assert.equal(state.conv_a.browser.tabs.some((tab) => tab.id === 'canvas_b'), false)
  assert.equal(state.conv_b.browser.tabs.some((tab) => tab.id === 'resources_a'), false)
})

test('agent content area creation starts with a browser home tab per conversation', () => {
  resetContentAreaStore()

  const area = useAgentContentAreaStore.getState().ensureContentArea('thread_1')

  assert.equal(area.conversationId, 'thread_1')
  assert.equal(area.activeSurface, 'browser')
  assert.deepEqual(area.browser.tabs.map((tab) => tab.id), ['project_home'])
  assert.equal(area.browser.activeTabId, 'project_home')
})

test('agent content area removal clears conversation-specific browser history', () => {
  resetContentAreaStore()

  useAgentContentAreaStore.getState().updateBrowserState('conv_a', (current) => ({
    ...current,
    tabs: [
      ...current.tabs,
      {
        id: 'resources_a',
        kind: 'resources',
        title: '资源库',
        createdAt: 1000,
      },
    ],
    activeTabId: 'resources_a',
  }))
  useAgentContentAreaStore.getState().removeContentArea('conv_a')

  const recreated = useAgentContentAreaStore.getState().ensureContentArea('conv_a')

  assert.deepEqual(recreated.browser.tabs.map((tab) => tab.id), ['project_home'])
  assert.equal(recreated.browser.activeTabId, 'project_home')
})

test('agent content area persistence removes transient browser runtime flags', () => {
  resetContentAreaStore()
  useAgentContentAreaStore.setState({
    contentAreasByConversation: {
      conv_a: {
        ...createDefaultAgentContentArea('conv_a', 1000),
        browser: {
          tabs: [{
            id: 'web_1',
            kind: 'web',
            title: 'Example',
            url: 'https://example.test',
            createdAt: 1000,
          }],
          activeTabId: 'web_1',
          webStates: {
            web_1: {
              tabId: 'web_1',
              visible: true,
              url: 'https://example.test',
              title: 'Example',
              loading: true,
              canGoBack: true,
              canGoForward: false,
            },
          },
        },
      },
    },
  })

  const partialized = useAgentContentAreaStore.persist.getOptions().partialize?.(useAgentContentAreaStore.getState()) as {
    contentAreasByConversation: ReturnType<typeof useAgentContentAreaStore.getState>['contentAreasByConversation']
  }

  assert.equal(partialized.contentAreasByConversation.conv_a.browser.webStates.web_1.visible, false)
  assert.equal(partialized.contentAreasByConversation.conv_a.browser.webStates.web_1.loading, false)
  assert.equal(partialized.contentAreasByConversation.conv_a.browser.webStates.web_1.url, 'https://example.test')
})
