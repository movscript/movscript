import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compileAgentClientPlugin,
  runAgentClientPlugin,
  type AgentClientPluginManifest,
} from './clientPluginRuntime.js'

test('runAgentClientPlugin dispatches named provider calls to agentTools', async () => {
  const plugin = executableTestPlugin()

  const result = await runAgentClientPlugin({
    plugin,
    args: { prompt: 'make image' },
    toolName: 'generation_image_generate',
  })

  assert.deepEqual(result.data, {
    mode: 'agent-tool',
    toolName: 'generation_image_generate',
    prompt: 'make image',
    hasGenerationHost: true,
  })
})

test('runAgentClientPlugin runs default plugin entrypoint without a named tool', async () => {
  const result = await runAgentClientPlugin({
    plugin: executableTestPlugin(),
    args: { prompt: 'canvas run' },
  })

  assert.deepEqual(result.data, {
    mode: 'default-run',
    prompt: 'canvas run',
  })
})

test('compileAgentClientPlugin dispatches named compile calls and default compile', async () => {
  const plugin = executableTestPlugin()

  assert.deepEqual(await compileAgentClientPlugin({
    plugin,
    args: { prompt: 'compile image' },
    toolName: 'generation_image_generate',
  }), {
    executor: 'ai_model',
    capability: 'image',
    prompt: 'compile image',
    featureKey: 'test.provider',
  })

  assert.deepEqual(await compileAgentClientPlugin({
    plugin,
    args: { prompt: 'compile default' },
  }), {
    executor: 'ai_model',
    capability: 'video',
    prompt: 'compile default',
    featureKey: 'default.provider',
  })
})

function executableTestPlugin(): AgentClientPluginManifest {
  return {
    id: 'test.provider',
    name: 'Test Provider',
    version: '1.0.0',
    bundle: `
      var agentTools = {
        generation_image_generate: {
          compile: function(args) {
            return {
              executor: 'ai_model',
              capability: 'image',
              prompt: args.prompt,
              featureKey: 'test.provider'
            };
          },
          run: async function(mov, args) {
            return {
              data: {
                mode: 'agent-tool',
                toolName: 'generation_image_generate',
                prompt: args.prompt,
                hasGenerationHost: !!mov.generation
              }
            };
          }
        }
      };
      async function run(_mov, args) {
        return { data: { mode: 'default-run', prompt: args.prompt } };
      }
      function compile(args) {
        return {
          executor: 'ai_model',
          capability: 'video',
          prompt: args.prompt,
          featureKey: 'default.provider'
        };
      }
    `,
  }
}
