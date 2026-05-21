import { type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'

import { WorkbenchSection } from './WorkbenchPrimitives'

export function WorkbenchPanel({
  title,
  icon: Icon,
  children,
  action,
  className,
  bodyClassName,
}: {
  title: string
  icon: LucideIcon
  children: ReactNode
  action?: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <WorkbenchSection
      title={title}
      icon={Icon}
      action={action}
      className={className}
      bodyClassName={bodyClassName}
    >
      {children}
    </WorkbenchSection>
  )
}
