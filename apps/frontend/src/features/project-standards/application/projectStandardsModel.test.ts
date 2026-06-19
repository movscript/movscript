import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CORE_STANDARD_DEFS,
  buildProjectPromptPreview,
  buildProjectStyleApplyPayload,
  buildStyleReferenceRule,
  coreStandardText,
  extractResourceIds,
  parseProjectStyleWorkspaceRows,
  projectPromptRulePayload,
  projectPromptRules,
  projectStandardFilledCount,
  projectStandardMissingLabels,
  splitListText,
  type WorkspaceRecord,
} from './projectStandardsModel'
import type { WorkspaceArtifact } from '@/shared/contracts/workspaceArtifact'

function project(input: Partial<WorkspaceRecord>): WorkspaceRecord {
  return { ID: 7, entity_type: 'project', ...input } as WorkspaceRecord
}

function workspace(content: Record<string, unknown>): WorkspaceArtifact {
  return {
    id: 'workspace-project-standards',
    projectId: 7,
    kind: 'project_standards_workspace',
    title: '项目规范工作区',
    content: JSON.stringify(content),
    status: 'workspace',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as WorkspaceArtifact
}

test('project standards model keeps fixed standards and prompt rules out of the page', () => {
  const record = project({
    aspect_ratio: '16:9',
    visual_style: '水彩质感',
    project_style: JSON.stringify({
      shot_size_system: ['远景', '中景'],
      negative_rules: ['不要低清'],
      custom_rules: [
        { id: 'rule_platform', key: 'platform', label: '平台规则', value: '适配竖屏封面', prompt_role: 'constraint', enabled: true, order: 20 },
        { id: 'rule_disabled', key: 'disabled', label: '停用规则', value: '不进入提示词', prompt_role: 'negative', enabled: false, order: 30 },
      ],
    }),
  })

  assert.equal(CORE_STANDARD_DEFS.length, 8)
  assert.equal(coreStandardText(record, 'aspect_ratio'), '16:9')
  assert.equal(coreStandardText(record, 'shot_size_system'), '远景；中景')
  assert.equal(projectStandardFilledCount(record), 4)
  assert.deepEqual(projectStandardMissingLabels(record), ['镜头语言', '灯光规则', '色彩规则', '节奏规则'])
  assert.match(buildProjectPromptPreview(record), /平台规则：适配竖屏封面/)
  assert.doesNotMatch(buildProjectPromptPreview(record), /不进入提示词/)
  assert.deepEqual(projectPromptRulePayload(projectPromptRules(record)).map((rule) => rule.id), ['rule_platform', 'rule_disabled'])
})

test('project standards model parses workspace diffs and style reference resources', () => {
  const current = project({
    aspect_ratio: '16:9',
    project_style: JSON.stringify({
      custom_rules: [{ id: 'rule_platform', key: 'platform', label: '平台规则', value: '旧规则', prompt_role: 'constraint', enabled: true }],
    }),
  })
  const workspaceArtifact = workspace({
    workspace: {
      project_style: {
        aspect_ratio: '9:16',
        custom_rules: [{ id: 'rule_platform', key: 'platform', label: '平台规则', value: '新规则', prompt_role: 'style', enabled: true }],
      },
    },
  })

  const rows = parseProjectStyleWorkspaceRows(workspaceArtifact, current)
  assert.deepEqual(rows.map((row) => [row.key, row.before, row.after, row.changed]), [
    ['aspect_ratio', '16:9', '9:16', true],
    ['custom:rule_platform', '旧规则', '新规则', true],
  ])
  assert.match(buildProjectStyleApplyPayload(workspaceArtifact), /"project_style"/)
  assert.deepEqual(extractResourceIds('画风 resource#91；reference_resource_ids=[92, 93]'), [91, 92, 93])
  assert.deepEqual(splitListText('远景；中景,特写'), ['远景', '中景', '特写'])
  assert.equal(buildStyleReferenceRule([91, 92, 91]).value.includes('reference_resource_ids=[91, 92]'), true)
})
