import type { MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

const timelineCompileInput = {
  timelineAssembly: { type: 'object', additionalProperties: true, description: 'TimelineAssembly intent state.' },
  timeline_assembly: { type: 'object', additionalProperties: true, description: 'Alias for timelineAssembly.' },
  editDecisions: { type: 'object', additionalProperties: true, description: 'OpenMontage-style edit_decisions used to compile the assembly.' },
  edit_decisions: { type: 'object', additionalProperties: true, description: 'Alias for editDecisions.' },
  assetManifest: { type: 'object', additionalProperties: true, description: 'Asset manifest used to resolve edit_decisions source refs.' },
  asset_manifest: { type: 'object', additionalProperties: true, description: 'Alias for assetManifest.' },
  backend: { type: 'string', description: 'Target backend: media_editing_project, remotion, hyperframes, or external_nle.' },
  preferredBackend: { type: 'string', description: 'Preferred backend for selection.' },
  preferred_backend: { type: 'string', description: 'Alias for preferredBackend.' },
  renderRuntime: { type: 'string', description: 'Optional locked render runtime, such as ffmpeg, remotion, or hyperframes.' },
  render_runtime: { type: 'string', description: 'Alias for renderRuntime.' },
  runtimeLocked: { type: 'boolean', description: 'When true, backend selection must not silently replace renderRuntime.' },
  runtime_locked: { type: 'boolean', description: 'Alias for runtimeLocked.' },
  title: { type: 'string', description: 'Optional backend project title.' },
  finishingProjectId: { type: 'string', description: 'Optional backend project id.' },
  finishing_project_id: { type: 'string', description: 'Alias for finishingProjectId.' },
  width: { type: 'number' },
  height: { type: 'number' },
  fps: { type: 'number' },
  background: { type: 'string' },
  defaultDurationMs: { type: 'number' },
  default_duration_ms: { type: 'number' },
}

export function timelineTools(): MCPTool[] {
  return [
    {
      name: 'timeline_backend_capability_list',
      description: 'List TimelineAssembly compile backends and explain which backend execution project each one creates.',
      inputSchema: objectSchema({ backend: { type: 'string' } }),
    },
    {
      name: 'timeline_assembly_get',
      description: 'Return a supplied TimelineAssembly intent envelope and summary. Project-backed lookup is intentionally not inferred from UI focus.',
      inputSchema: objectSchema({
        timelineAssembly: timelineCompileInput.timelineAssembly,
        timeline_assembly: timelineCompileInput.timeline_assembly,
        targetRef: { type: 'string' },
        target_ref: { type: 'string' },
        scopeKind: { type: 'string' },
        scope_kind: { type: 'string' },
        scopeRef: { type: ['string', 'number'] },
        scope_ref: { type: ['string', 'number'] },
      }),
    },
    {
      name: 'timeline_assembly_validate',
      description: 'Validate TimelineAssembly compile readiness and return a conformance report without creating a backend project.',
      inputSchema: objectSchema(timelineCompileInput),
    },
    {
      name: 'timeline_compile_manifest_create',
      description: 'Create a deterministic CompileManifest from TimelineAssembly, edit_decisions, asset_manifest, and backend choice.',
      inputSchema: objectSchema(timelineCompileInput),
    },
    {
      name: 'timeline_backend_select',
      description: 'Select a TimelineAssembly backend and, when inputs are provided, include its conformance report.',
      inputSchema: objectSchema(timelineCompileInput),
    },
    {
      name: 'timeline_backend_project_create',
      description: 'Compile TimelineAssembly into a backend execution project such as MediaEditingProject, RemotionCompositionProject, or HyperFramesCompositionProject. This does not render or persist.',
      inputSchema: objectSchema(timelineCompileInput),
    },
    {
      name: 'timeline_assembly_compile',
      description: 'Compile TimelineAssembly through the selected backend and return CompileManifest plus backend project/conformance output. This is a no-persist compile handoff.',
      inputSchema: objectSchema(timelineCompileInput),
    },
    {
      name: 'timeline_backend_conformance_report',
      description: 'Return backend conformance and blocker/degradation diagnostics for a CompileManifest or compile input.',
      inputSchema: objectSchema({
        ...timelineCompileInput,
        compileManifest: { type: 'object', additionalProperties: true, description: 'Existing CompileManifest to report on.' },
        compile_manifest: { type: 'object', additionalProperties: true, description: 'Alias for compileManifest.' },
      }),
    },
  ]
}
