import { GenerationParamAuditCard, GenerationValidationErrorCard } from '@/components/agent/GenerationCards'
import { generationParamAuditsFromRun, generationValidationErrorsFromRun } from '@/lib/agentGenerationArtifacts'
import type { AgentRun } from '@/lib/localAgentClient'

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
