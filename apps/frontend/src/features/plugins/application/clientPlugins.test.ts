import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compileClientPlugin,
  runClientPlugin,
  type ClientPluginManifest,
} from './clientPlugins'

test('runClientPlugin dispatches named provider calls to agentTools', async () => {
  const plugin = executableTestPlugin()

  const result = await runClientPlugin(plugin, { prompt: 'make image' }, { toolName: 'generation_image_generate' })
  assert.deepEqual(result.data, {
    mode: 'agent-tool',
    toolName: 'generation_image_generate',
    prompt: 'make image',
    hasGenerationHost: true,
  })

  const fallback = await runClientPlugin(plugin, { prompt: 'canvas run' })
  assert.deepEqual(fallback.data, {
    mode: 'default-run',
    prompt: 'canvas run',
  })
})

test('compileClientPlugin dispatches named provider compile calls to agentTools', async () => {
  const plugin = executableTestPlugin()

  const spec = await compileClientPlugin(plugin, { prompt: 'compile image' }, { toolName: 'generation_image_generate' })
  assert.deepEqual(spec, {
    executor: 'ai_model',
    capability: 'image',
    prompt: 'compile image',
    featureKey: 'test.provider',
  })

  const fallback = await compileClientPlugin(plugin, { prompt: 'compile default' })
  assert.deepEqual(fallback, {
    executor: 'ai_model',
    capability: 'video',
    prompt: 'compile default',
    featureKey: 'default.provider',
  })
})

function executableTestPlugin(): ClientPluginManifest {
  return {
    schema: 'movscript.clientPlugin.v1',
    id: 'test.provider',
    name: 'Test Provider',
    version: '1.0.0',
    contributes: {
      tools: [{
        id: 'generation_image_generate',
        title: 'Image Generate',
        inputSchema: { type: 'object', properties: {} },
      }],
    },
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
