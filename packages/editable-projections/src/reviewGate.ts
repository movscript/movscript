import type { ApplyPlanOperation, ApplyReview } from './types.js'
import { ApplyReviewNotReadyError } from './errors.js'

export interface ApplyReviewGate {
  ready: boolean
  blocked: number
  conflicts: number
  reasons: string[]
}

export function evaluateApplyReview(review: ApplyReview): ApplyReviewGate {
  const blockingOperations = review.operations.filter((operation) =>
    operation.state === 'blocked' || operation.state === 'conflict',
  )
  const reasons = blockingOperations.flatMap(operationReasons)

  return {
    ready: blockingOperations.length === 0,
    blocked: review.summary.blocked,
    conflicts: review.summary.conflicts,
    reasons,
  }
}

export function assertApplyReviewReady(review: ApplyReview): void {
  const gate = evaluateApplyReview(review)
  if (!gate.ready) {
    throw new ApplyReviewNotReadyError(gate)
  }
}

function operationReasons(operation: ApplyPlanOperation): string[] {
  const reasons: string[] = []
  for (const issue of operation.issues) {
    reasons.push(`${operation.filePath}: ${issue.path ? `${issue.path}: ` : ''}${issue.message}`)
  }
  for (const conflict of operation.conflicts ?? []) {
    reasons.push(`${operation.filePath}: ${conflict.path || '/'}: ${conflict.message}`)
  }
  if (reasons.length === 0) {
    reasons.push(`${operation.filePath}: ${operation.state}`)
  }
  return reasons
}
