import assert from 'node:assert/strict'
import test from 'node:test'
import { approvalImpactLabel } from '@/features/agent/domain/agentRunUi'
import { agentPermissionLabel, agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import { toolActivityItem } from '@/features/agent/presentation/agent-activity-feed/toolItems'

test('agent tool display labels dedicated editing tools and MovScript MCP-prefixed names', () => {
  assert.equal(agentToolNameLabel('domain_read_scene_moment_timeline'), '读取场景剪辑交接')
  assert.equal(agentToolNameLabel('system_resource_video_trim_to_resource'), '中立裁剪视频资源')
  assert.equal(agentToolNameLabel('mcp__movscript__system_resource_video_compose_to_resource'), '资源级合成视频')
  assert.equal(agentToolNameLabel('movscript_resource_video_concat_to_resource'), '资源级拼接视频')
  assert.equal(agentToolNameLabel('editing_project_create'), '创建剪辑项目')
  assert.equal(agentToolNameLabel('editing_runtime_capabilities_get'), '检查本地剪辑能力')
  assert.equal(agentToolNameLabel('editing_task_render_create'), '创建剪辑渲染任务')
  assert.equal(agentToolNameLabel('editing_export_save_local'), '保存本地剪辑导出')
  assert.equal(agentToolNameLabel('mcp__movscript__editing_export_publish_hls'), '发布剪辑 HLS')
  assert.equal(agentToolNameLabel('system_artifact_upload_export'), '上传导出产物')
  assert.equal(agentToolNameLabel('mcp__movscript__system_artifact_upload_hls_stream'), '发布托管 HLS')
  assert.equal(agentToolNameLabel('system_artifact_get_stream'), '读取托管媒体流')
})

test('agent approval display explains editing permissions without falling back to generic project writes', () => {
  assert.equal(agentPermissionLabel('editing.project.write'), '写入剪辑项目')
  assert.equal(agentPermissionLabel('editing.timeline.write'), '写入剪辑时间线')
  assert.equal(agentPermissionLabel('editing.runtime.read'), '读取本地剪辑能力')
  assert.equal(agentPermissionLabel('editing.task.write'), '执行剪辑任务')
  assert.equal(agentPermissionLabel('editing.export.write'), '写入剪辑导出')
  assert.equal(agentPermissionLabel('editing.candidate.write'), '写入剪辑候选')
  assert.equal(agentPermissionLabel('editing.custom.write'), '剪辑写入')
  assert.equal(agentPermissionLabel('artifact.export.write'), '上传导出产物')
  assert.equal(agentPermissionLabel('artifact.stream.write'), '发布托管媒体流')
  assert.equal(agentPermissionLabel('artifact.stream.read'), '读取托管媒体流')
  assert.equal(agentPermissionLabel('artifact.hls.publish'), '产物托管发布')

  assert.equal(
    approvalImpactLabel({ toolName: 'editing_task_render_create', permission: 'editing.task.write', risk: 'write', preview: undefined }),
    '批准后会通过 Electron mediaPipeline 执行本地剪辑任务；后端不会承担剪辑渲染。',
  )
  assert.equal(
    approvalImpactLabel({ toolName: 'editing_timeline_add_clip', permission: 'editing.timeline.write', risk: 'write', preview: undefined }),
    '批准后会修改 MediaEditingProject 或剪辑时间线数据，不会直接渲染或调用 AI。',
  )
  assert.equal(
    approvalImpactLabel({ toolName: 'editing_export_create_candidate', permission: 'editing.candidate.write', risk: 'write', preview: undefined }),
    '批准后会把 RawResource 剪辑导出写为业务候选；不会自动采纳为最终结果。',
  )
  assert.equal(
    approvalImpactLabel({ toolName: 'system_artifact_upload_export', permission: 'artifact.export.write', risk: 'write', preview: undefined }),
    '批准后会托管已完成的导出或 HLS 产物；不会执行剪辑，也不会写入业务候选。',
  )
  assert.equal(
    approvalImpactLabel({ toolName: 'system_artifact_get_stream', permission: 'artifact.stream.read', risk: 'read', preview: undefined }),
    '批准后只会读取已托管媒体流的元数据或播放地址。',
  )
  assert.equal(
    approvalImpactLabel({ toolName: 'mcp__movscript__system_artifact_upload_hls_stream', permission: undefined, risk: 'write', preview: undefined }),
    '批准后会托管已完成的导出或 HLS 产物；不会执行剪辑，也不会写入业务候选。',
  )
  assert.equal(
    approvalImpactLabel({ toolName: 'domain_read_scene_moment_timeline', permission: 'project.read', risk: 'read', preview: undefined }),
    '批准后只会读取 domain 到 MediaEditingProject 的交接数据；实际剪辑应继续使用 editing_*。',
  )
  assert.equal(
    approvalImpactLabel({ toolName: 'system_resource_video_trim_to_resource', permission: 'project.write', risk: 'write', preview: undefined }),
    '批准后会派生一个裁剪后的视频 RawResource；这只是中立素材准备，不会修改剪辑项目或写入候选。',
  )
  assert.equal(
    approvalImpactLabel({ toolName: 'mcp__movscript__system_resource_video_compose_to_resource', permission: 'project.write', risk: 'write', preview: undefined }),
    '批准后会执行资源级视频合成并生成 RawResource；它不会修改剪辑项目，产品剪辑应使用 editing_* 和 Electron mediaPipeline。',
  )
})

test('agent activity feed renders editing tools as structured editing blocks', () => {
  const handoffRead = toolActivityItem({
    id: 'step-domain-read',
    toolName: 'domain_read_scene_moment_timeline',
    status: 'completed',
    createdAt: '2026-06-17T00:00:00.000Z',
  })
  assert.equal(handoffRead.type, 'block')
  assert.equal(handoffRead.kind, 'read')
  assert.equal(handoffRead.title, '读取场景剪辑交接')
  assert.deepEqual(handoffRead.lines, ['正在读取 domain 到 MediaEditingProject 的交接数据；实际剪辑应继续使用 editing_*。'])

  const neutralTrim = toolActivityItem({
    id: 'step-resource-trim',
    toolName: 'system_resource_video_trim_to_resource',
    status: 'completed',
    createdAt: '2026-06-17T00:00:00.850Z',
  })
  assert.equal(neutralTrim.type, 'block')
  assert.equal(neutralTrim.kind, 'write')
  assert.equal(neutralTrim.title, '中立裁剪视频资源')
  assert.deepEqual(neutralTrim.lines, ['这是中立视频素材准备，会生成新的 RawResource；不能替代剪辑时间线裁剪。'])

  const resourceCompose = toolActivityItem({
    id: 'step-resource-compose',
    toolName: 'mcp__movscript__system_resource_video_compose_to_resource',
    status: 'completed',
    createdAt: '2026-06-17T00:00:00.900Z',
  })
  assert.equal(resourceCompose.type, 'block')
  assert.equal(resourceCompose.kind, 'write')
  assert.equal(resourceCompose.title, '资源级合成视频')
  assert.deepEqual(resourceCompose.lines, ['这是资源级视频合成工具，只生成新的 RawResource；产品剪辑、拼接和导出应使用 editing_* 与 Electron mediaPipeline。'])

  const runtime = toolActivityItem({
    id: 'step-runtime',
    toolName: 'mcp__movscript__editing_runtime_capabilities_get',
    status: 'completed',
    createdAt: '2026-06-17T00:00:00.000Z',
  })
  assert.equal(runtime.type, 'block')
  assert.equal(runtime.kind, 'read')
  assert.equal(runtime.title, '检查本地剪辑能力')
  assert.deepEqual(runtime.lines, ['正在检查 Electron mediaPipeline 与 FFmpeg 能力。'])

  const timeline = toolActivityItem({
    id: 'step-timeline',
    toolName: 'editing_timeline_add_clip',
    status: 'completed',
    createdAt: '2026-06-17T00:00:01.000Z',
    summary: 'clip 已加入 video track',
  })
  assert.equal(timeline.type, 'block')
  assert.equal(timeline.kind, 'write')
  assert.equal(timeline.title, '添加剪辑片段')
  assert.deepEqual(timeline.lines, ['正在修改或校验剪辑时间线。', 'clip 已加入 video track'])

  const candidate = toolActivityItem({
    id: 'step-candidate',
    toolName: 'editing_export_create_candidate',
    status: 'completed',
    createdAt: '2026-06-17T00:00:01.500Z',
  })
  assert.equal(candidate.type, 'block')
  assert.equal(candidate.kind, 'write')
  assert.equal(candidate.title, '创建剪辑候选')
  assert.deepEqual(candidate.lines, ['正在处理剪辑导出、本地保存、资源导入或 RawResource 候选写入。'])

  const saveLocal = toolActivityItem({
    id: 'step-save-local',
    toolName: 'editing_export_save_local',
    status: 'completed',
    createdAt: '2026-06-17T00:00:01.750Z',
    summary: '/Users/test/Desktop/final-cut.mp4',
  })
  assert.equal(saveLocal.type, 'block')
  assert.equal(saveLocal.kind, 'write')
  assert.equal(saveLocal.title, '保存本地剪辑导出')
  assert.deepEqual(saveLocal.lines, ['正在处理剪辑导出、本地保存、资源导入或 RawResource 候选写入。', '/Users/test/Desktop/final-cut.mp4'])

  const render = toolActivityItem({
    id: 'step-render',
    toolName: 'editing_task_render_create',
    status: 'in_progress',
    createdAt: '2026-06-17T00:00:02.000Z',
  })
  assert.equal(render.type, 'block')
  assert.equal(render.kind, 'task')
  assert.equal(render.title, '创建剪辑渲染任务')
  assert.deepEqual(render.lines, ['正在通过 Electron mediaPipeline 处理本地媒体任务。'])

  const artifactUpload = toolActivityItem({
    id: 'step-artifact-upload',
    toolName: 'system_artifact_upload_export',
    status: 'completed',
    createdAt: '2026-06-17T00:00:03.000Z',
  })
  assert.equal(artifactUpload.type, 'block')
  assert.equal(artifactUpload.kind, 'write')
  assert.equal(artifactUpload.title, '上传导出产物')
  assert.deepEqual(artifactUpload.lines, ['正在把已完成的本地导出上传为 RawResource。'])

  const artifactRead = toolActivityItem({
    id: 'step-artifact-read',
    toolName: 'mcp__movscript__system_artifact_get_stream',
    status: 'completed',
    createdAt: '2026-06-17T00:00:04.000Z',
    summary: 'stream 42',
  })
  assert.equal(artifactRead.type, 'block')
  assert.equal(artifactRead.kind, 'read')
  assert.equal(artifactRead.title, '读取托管媒体流')
  assert.deepEqual(artifactRead.lines, ['正在读取托管媒体流的播放信息。', 'stream 42'])
})
