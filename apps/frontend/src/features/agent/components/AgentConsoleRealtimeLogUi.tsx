import { forwardRef, type HTMLAttributes } from 'react'

import { cn } from '@/shared/ui/cn'

export function AgentConsoleLogSummary({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-console-log-summary', className)} {...props} />
}

export function AgentConsoleLogSummaryItem({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-console-log-summary__item', className)} {...props} />
}

export function AgentConsoleLogSummaryLabel({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-console-log-summary__label', className)} {...props} />
}

export function AgentConsoleLogSummaryValue({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-console-log-summary__value', className)} {...props} />
}

export const AgentConsoleLogStream = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('agent-console-log-stream', className)} {...props} />,
)

AgentConsoleLogStream.displayName = 'AgentConsoleLogStream'

export function AgentConsoleLogEmpty({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-console-log-empty', className)} {...props} />
}

export function AgentConsoleLogLine({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-console-log-line', className)} {...props} />
}

export function AgentConsoleLogLineTime({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-console-log-line__time', className)} {...props} />
}

export function AgentConsoleLogLineStream({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-console-log-line__stream', className)} {...props} />
}

export function AgentConsoleLogLineText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-console-log-line__text', className)} {...props} />
}
