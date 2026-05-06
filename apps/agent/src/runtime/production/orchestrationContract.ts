import type { AgentRuntimeContract } from '../contracts/runtimeContract.js'

export const PRODUCTION_ORCHESTRATE_ANALYZER_ID = 'production-orchestrate-analyzer'

export const PRODUCTION_ORCHESTRATION_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schema: { type: 'string', enum: ['movscript.production_orchestration_analysis.v1'] },
    mode: { type: 'string', enum: ['analysis_only', 'proposal_ready'] },
    production_id: { type: ['number', 'string', 'null'] },
    script_source: {
      type: 'object',
      additionalProperties: false,
      properties: {
        entity_type: { type: ['string', 'null'] },
        entity_id: { type: ['number', 'string', 'null'] },
        title: { type: ['string', 'null'] },
        version: { type: ['string', 'number', 'null'] },
      },
      required: ['entity_type', 'entity_id', 'title', 'version'],
    },
    stages: {
      type: 'object',
      additionalProperties: false,
      properties: {
        extraction: {
          type: 'object',
          additionalProperties: false,
          properties: {
            characters: { type: 'array', items: { $ref: '#/$defs/extracted_reference' } },
            locations: { type: 'array', items: { $ref: '#/$defs/extracted_reference' } },
            props: { type: 'array', items: { $ref: '#/$defs/extracted_reference' } },
            story_moments: { type: 'array', items: { $ref: '#/$defs/extracted_moment' } },
          },
          required: ['characters', 'locations', 'props', 'story_moments'],
        },
        canonicalization: {
          type: 'object',
          additionalProperties: false,
          properties: {
            references: { type: 'array', items: { $ref: '#/$defs/canonical_reference' } },
            aliases: { type: 'array', items: { $ref: '#/$defs/alias_resolution' } },
          },
          required: ['references', 'aliases'],
        },
        relations: {
          type: 'object',
          additionalProperties: false,
          properties: {
            usages: { type: 'array', items: { $ref: '#/$defs/reference_usage' } },
            dependencies: { type: 'array', items: { $ref: '#/$defs/dependency' } },
          },
          required: ['usages', 'dependencies'],
        },
        validation: {
          type: 'object',
          additionalProperties: false,
          properties: {
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            warnings: { type: 'array', items: { type: 'string' } },
            unresolved: { type: 'array', items: { $ref: '#/$defs/unresolved_item' } },
          },
          required: ['confidence', 'warnings', 'unresolved'],
        },
      },
      required: ['extraction', 'canonicalization', 'relations', 'validation'],
    },
    proposal: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['production_proposal'] },
        action_policy: {
          type: 'object',
          additionalProperties: false,
          properties: {
            confirmed_entities: { type: 'string', enum: ['preserve', 'update_only_when_explicit'] },
            draft_entities: { type: 'string', enum: ['supersede_same_scope'] },
            creative_references: { type: 'string', enum: ['reuse_project_level_when_possible'] },
          },
          required: ['confirmed_entities', 'draft_entities', 'creative_references'],
        },
        segments: { type: 'array', items: { $ref: '#/$defs/segment_proposal' } },
      },
      required: ['kind', 'action_policy', 'segments'],
    },
  },
  required: ['schema', 'mode', 'production_id', 'script_source', 'stages', 'proposal'],
  $defs: {
    evidence: {
      type: 'object',
      additionalProperties: false,
      properties: {
        quote: { type: 'string' },
        start_index: { type: ['number', 'null'] },
        end_index: { type: ['number', 'null'] },
        note: { type: ['string', 'null'] },
      },
      required: ['quote', 'start_index', 'end_index', 'note'],
    },
    extracted_reference: {
      type: 'object',
      additionalProperties: false,
      properties: {
        temp_id: { type: 'string' },
        type: { type: 'string', enum: ['character', 'location', 'prop', 'brand', 'style', 'rule'] },
        name: { type: 'string' },
        aliases: { type: 'array', items: { type: 'string' } },
        description: { type: 'string' },
        evidence: { type: 'array', items: { $ref: '#/$defs/evidence' } },
      },
      required: ['temp_id', 'type', 'name', 'aliases', 'description', 'evidence'],
    },
    extracted_moment: {
      type: 'object',
      additionalProperties: false,
      properties: {
        temp_id: { type: 'string' },
        title: { type: 'string' },
        summary: { type: 'string' },
        time_text: { type: 'string' },
        location_text: { type: 'string' },
        action_text: { type: 'string' },
        mood: { type: 'string' },
        participant_temp_ids: { type: 'array', items: { type: 'string' } },
        evidence: { type: 'array', items: { $ref: '#/$defs/evidence' } },
      },
      required: ['temp_id', 'title', 'summary', 'time_text', 'location_text', 'action_text', 'mood', 'participant_temp_ids', 'evidence'],
    },
    canonical_reference: {
      type: 'object',
      additionalProperties: false,
      properties: {
        canonical_id: { type: 'string' },
        action: { type: 'string', enum: ['create', 'reuse', 'update'] },
        existing_id: { type: ['number', 'string', 'null'] },
        type: { type: 'string', enum: ['character', 'location', 'prop', 'brand', 'style', 'rule'] },
        name: { type: 'string' },
        aliases: { type: 'array', items: { type: 'string' } },
        merged_temp_ids: { type: 'array', items: { type: 'string' } },
        rationale: { type: 'string' },
      },
      required: ['canonical_id', 'action', 'existing_id', 'type', 'name', 'aliases', 'merged_temp_ids', 'rationale'],
    },
    alias_resolution: {
      type: 'object',
      additionalProperties: false,
      properties: {
        alias: { type: 'string' },
        canonical_id: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        rationale: { type: 'string' },
      },
      required: ['alias', 'canonical_id', 'confidence', 'rationale'],
    },
    reference_usage: {
      type: 'object',
      additionalProperties: false,
      properties: {
        moment_temp_id: { type: 'string' },
        canonical_reference_id: { type: 'string' },
        role: { type: 'string' },
        state: {
          type: 'object',
          additionalProperties: true,
          properties: {
            costume: { type: 'string' },
            emotion: { type: 'string' },
            position: { type: 'string' },
            props: { type: 'array', items: { type: 'string' } },
          },
        },
        evidence: { type: 'array', items: { $ref: '#/$defs/evidence' } },
      },
      required: ['moment_temp_id', 'canonical_reference_id', 'role', 'state', 'evidence'],
    },
    dependency: {
      type: 'object',
      additionalProperties: false,
      properties: {
        source_temp_id: { type: 'string' },
        target_temp_id: { type: 'string' },
        type: { type: 'string', enum: ['precedes', 'causes', 'requires', 'reveals', 'contrasts'] },
        rationale: { type: 'string' },
      },
      required: ['source_temp_id', 'target_temp_id', 'type', 'rationale'],
    },
    unresolved_item: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['missing_script', 'ambiguous_character', 'ambiguous_location', 'conflict', 'insufficient_evidence'] },
        message: { type: 'string' },
        blocking: { type: 'boolean' },
      },
      required: ['type', 'message', 'blocking'],
    },
    segment_proposal: {
      type: 'object',
      additionalProperties: false,
      properties: {
        local_id: { type: 'string' },
        action: { type: 'string', enum: ['create', 'reuse', 'update'] },
        id: { type: ['number', 'string', 'null'] },
        title: { type: 'string' },
        kind: { type: 'string' },
        summary: { type: 'string' },
        scene_moments: { type: 'array', items: { $ref: '#/$defs/scene_moment_proposal' } },
      },
      required: ['local_id', 'action', 'id', 'title', 'kind', 'summary', 'scene_moments'],
    },
    scene_moment_proposal: {
      type: 'object',
      additionalProperties: false,
      properties: {
        local_id: { type: 'string' },
        source_temp_id: { type: 'string' },
        action: { type: 'string', enum: ['create', 'reuse', 'update'] },
        id: { type: ['number', 'string', 'null'] },
        title: { type: 'string' },
        description: { type: 'string' },
        time_text: { type: 'string' },
        location_text: { type: 'string' },
        action_text: { type: 'string' },
        mood: { type: 'string' },
        creative_references: { type: 'array', items: { $ref: '#/$defs/creative_reference_proposal' } },
        content_units: { type: 'array', items: { $ref: '#/$defs/content_unit_proposal' } },
      },
      required: ['local_id', 'source_temp_id', 'action', 'id', 'title', 'description', 'time_text', 'location_text', 'action_text', 'mood', 'creative_references', 'content_units'],
    },
    creative_reference_proposal: {
      type: 'object',
      additionalProperties: false,
      properties: {
        canonical_reference_id: { type: 'string' },
        action: { type: 'string', enum: ['create', 'reuse', 'update'] },
        id: { type: ['number', 'string', 'null'] },
        type: { type: 'string', enum: ['character', 'location', 'prop', 'brand', 'style', 'rule'] },
        name: { type: 'string' },
        role: { type: 'string' },
        state: { type: 'object', additionalProperties: true },
      },
      required: ['canonical_reference_id', 'action', 'id', 'type', 'name', 'role', 'state'],
    },
    content_unit_proposal: {
      type: 'object',
      additionalProperties: false,
      properties: {
        local_id: { type: 'string' },
        action: { type: 'string', enum: ['create', 'reuse', 'update'] },
        id: { type: ['number', 'string', 'null'] },
        kind: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        prompt: { type: 'string' },
        duration_sec: { type: 'number' },
      },
      required: ['local_id', 'action', 'id', 'kind', 'title', 'description', 'prompt', 'duration_sec'],
    },
  },
} satisfies Record<string, unknown>

export const PRODUCTION_ORCHESTRATION_CONTRACT = [
  'Production orchestration analyzer contract:',
  'Return only one valid JSON object matching schema movscript.production_orchestration_analysis.v1. Do not wrap it in markdown.',
  'Use this internal sequence before emitting the final object: extraction -> canonicalization -> relations -> validation -> proposal.',
  'Do not expose hidden chain-of-thought. Put only concise evidence, rationale, warnings, unresolved items, and confidence in the JSON fields.',
  'For analysis-only runs, set mode="analysis_only" and still include proposal.segments as the best normalized draft tree when enough evidence exists.',
  'Before proposing reusable CreativeReferences, prefer project-level reuse from read_production_context/search/conflict tool results over creating duplicates.',
  'Confirmed entities must be preserved. Use action="update" only when the user explicitly asks to modify confirmed data; otherwise propose additive create/reuse nodes.',
  'Draft entities in the same production/scope may be superseded by a newer production_proposal draft.',
  'Every extracted entity and story moment must include evidence quotes from the script when available.',
].join('\n')

export const READ_PRODUCTION_CONTEXT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    project_id: { type: 'number' },
    projectId: { type: 'number' },
    production_id: { type: 'number' },
    productionId: { type: 'number' },
    include_project_references: { type: 'boolean', description: 'Include project-level CreativeReferences across productions for reuse checks.' },
    includeProjectReferences: { type: 'boolean' },
    include_drafts: { type: 'boolean' },
    includeDrafts: { type: 'boolean' },
  },
} satisfies Record<string, unknown>

export const CHECK_ENTITY_CONFLICTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    project_id: { type: 'number' },
    projectId: { type: 'number' },
    production_id: { type: 'number' },
    productionId: { type: 'number' },
    scope: { type: 'string', enum: ['production', 'project'], description: 'Use project for CreativeReference reuse across productions.' },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          temp_id: { type: 'string' },
          type: { type: 'string' },
          name: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    proposal: PRODUCTION_ORCHESTRATION_OUTPUT_SCHEMA,
  },
} satisfies Record<string, unknown>

export const PROPOSE_PRODUCTION_ENTITIES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    project_id: { type: 'number' },
    projectId: { type: 'number' },
    production_id: { type: 'number' },
    productionId: { type: 'number' },
    kind: { type: 'string', enum: ['production_proposal'] },
    title: { type: 'string' },
    proposal: PRODUCTION_ORCHESTRATION_OUTPUT_SCHEMA,
    supersede_scope: { type: 'string', enum: ['production', 'scene_moment', 'none'] },
    supersedeScope: { type: 'string', enum: ['production', 'scene_moment', 'none'] },
    source: {
      type: 'object',
      additionalProperties: true,
      properties: {
        entityType: { type: 'string' },
        entityId: { type: ['number', 'string'] },
      },
    },
    metadata: { type: 'object', additionalProperties: true },
  },
  required: ['proposal'],
} satisfies Record<string, unknown>

export function isProductionOrchestrationAnalyzer(manifestId?: string): boolean {
  return manifestId === PRODUCTION_ORCHESTRATE_ANALYZER_ID
}

export const PRODUCTION_ORCHESTRATION_RUNTIME_CONTRACT: AgentRuntimeContract = {
  id: PRODUCTION_ORCHESTRATE_ANALYZER_ID,
  matches: (manifest) => isProductionOrchestrationAnalyzer(manifest.id),
  structuredContract: PRODUCTION_ORCHESTRATION_CONTRACT,
  toolSchemas: {
    movscript_read_production_context: READ_PRODUCTION_CONTEXT_SCHEMA,
    movscript_check_entity_conflicts: CHECK_ENTITY_CONFLICTS_SCHEMA,
    movscript_propose_production_entities: PROPOSE_PRODUCTION_ENTITIES_SCHEMA,
  },
  requiresConfiguredModel: true,
  requiresStructuredJSON: true,
  commandOverride: ({ userMessage }) => ({
    name: 'chat',
    payload: userMessage,
    contextProfile: 'production_context',
    outputMode: 'json',
    requiredTools: [],
    systemContract: 'Production orchestration analyzer run.',
  }),
}
