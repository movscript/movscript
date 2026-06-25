import { GenerationParamAuditCard, GenerationValidationErrorCard } from '@/features/agent/components/GenerationCards'
import { generationParamAuditsFromRun, generationValidationErrorsFromRun } from '@/features/agent/domain/agentGenerationArtifacts'
import type { AgentRun } from '@movscript/agent-protocol'

export function AgentRunGenerationArtifacts({ run }: { run?: AgentRun }) {
  const generationParamAudits = generationParamAuditsFromRun(run)
  const generationValidationErrors = generationValidationErrorsFromRun(run)

  return (
    <>
      {generationValidationErrors.length > 0 && (
        <div data-testid="agent-run-generation-validation-errors">
          <GenerationValidationErrorCard errors={generationValidationErrors} />
        </div>
      )}
      {generationParamAudits.length > 0 && (
        <div data-testid="agent-run-generation-param-audit">
          <GenerationParamAuditCard audits={generationParamAudits} />
        </div>
      )}
    </>
  )
}
