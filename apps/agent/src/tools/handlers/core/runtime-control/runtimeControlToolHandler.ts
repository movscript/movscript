import type { RuntimeToolHandler } from '../../../../ports/runtime/runtimeToolHandlerPort.js'

export function createCoreRuntimeControlToolHandler(): RuntimeToolHandler {
  return {
    toolNames: [
      'core_catalog_inspect',
      'core_skill_update',
      'core_update_plan',
      'core_work_start',
      'core_work_get',
      'core_work_list',
      'core_work_wait',
      'core_work_cancel',
    ],
    async execute({ call, args, run, catalogManager, signal }) {
      if (!catalogManager) throw new Error('agent catalog manager is not configured')

      if (call.name === 'core_catalog_inspect') {
        return { result: catalogManager.inspectAgentCatalog(run, args) }
      }
      if (call.name === 'core_skill_update') {
        return { result: catalogManager.updateActiveSkills(run, args) }
      }
      if (call.name === 'core_update_plan') {
        return { result: catalogManager.updatePlan(run, args) }
      }
      if (call.name === 'core_work_start') {
        return { result: await catalogManager.startWork(run, args, { signal }) }
      }
      if (call.name === 'core_work_get') {
        return { result: catalogManager.getWork(run, args) }
      }
      if (call.name === 'core_work_list') {
        return { result: catalogManager.listWork(run, args) }
      }
      if (call.name === 'core_work_wait') {
        return { result: await catalogManager.waitWork(run, args, { signal }) }
      }
      if (call.name === 'core_work_cancel') {
        return { result: await catalogManager.cancelWork(run, args, { signal }) }
      }

      return undefined
    },
  }
}
