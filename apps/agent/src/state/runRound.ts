import type { AgentRunStep } from './types.js'

export type AgentRunRoundInfo = {
  roundId: string
  roundIndex: number
  roundLabel: string
  roundSource: NonNullable<AgentRunStep['roundSource']>
}

export function buildRunRound(roundIndex: number, roundLabel: string, roundSource: AgentRunRoundInfo['roundSource']): AgentRunRoundInfo {
  return { roundId: `round_${roundIndex}`, roundIndex, roundLabel, roundSource }
}
