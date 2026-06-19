import type { HTMLAttributes, ReactNode } from 'react'

import {
  Badge,
  Button,
  StatusBadge,
} from '@movscript/ui/primitives'
import {
  AgentDataBlock,
  AgentSurfaceBlock,
} from '@movscript/ui/business/agent'

import { cn } from '@/shared/ui/cn'

import './AgentSettingsConfigFileUi.css'

export type AgentSettingsConfigFileSummaryItem = {
  id: string
  label: ReactNode
  value: ReactNode
}

export type AgentSettingsConfigFileDiffSection = {
  id: string
  label: ReactNode
  lines: ReactNode[]
  emptyLabel: ReactNode
}

export function AgentSettingsConfigFileCard({
  name,
  idLabel,
  description,
  versionLabel,
  currentLabel,
  previewLabel,
  current = false,
  preview = false,
  summaryItems,
}: {
  name: ReactNode
  idLabel: ReactNode
  description?: ReactNode
  versionLabel: ReactNode
  currentLabel?: ReactNode
  previewLabel?: ReactNode
  current?: boolean
  preview?: boolean
  summaryItems: AgentSettingsConfigFileSummaryItem[]
}) {
  return (
    <AgentSurfaceBlock
      variant="subtle"
      data-current={current ? 'true' : undefined}
      data-preview={preview ? 'true' : undefined}
      className="agent-settings-config-file-card"
    >
      <div className="ms-action-row agent-settings-row-between">
        <div className="agent-settings-item-body">
          <div className="ms-action-row agent-settings-title-row">
            <p className="ms-text-truncate ms-type-label agent-settings-card-title">{name}</p>
            {current && currentLabel ? <StatusBadge intent="success" emphasis="soft">{currentLabel}</StatusBadge> : null}
            {preview && previewLabel ? <Badge>{previewLabel}</Badge> : null}
            <Badge variant="outline">{versionLabel}</Badge>
          </div>
          <p className="ms-text-truncate ms-type-tiny agent-settings-card-meta">{idLabel}</p>
        </div>
      </div>
      {description ? <p className="ms-type-caption agent-settings-card-description">{description}</p> : null}
      <div className="ms-type-tiny agent-settings-config-file-card__summary-grid">
        {summaryItems.map((item) => (
          <AgentSettingsConfigFileSummaryList key={item.id} item={item} />
        ))}
      </div>
    </AgentSurfaceBlock>
  )
}

export function AgentSettingsConfigFileEditor({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-settings-config-file-editor', className)} {...props} />
}

export function AgentSettingsConfigFileBrowser({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn('agent-settings-config-file-browser', className)} {...props} />
}

export function AgentSettingsConfigFileEditorPane({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('agent-settings-config-file-editor-pane', className)} {...props} />
}

export function AgentSettingsConfigFileList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-settings-config-file-list', className)} {...props} />
}

export function AgentSettingsConfigFileListButton({
  name,
  idLabel,
  description,
  versionLabel,
  currentLabel,
  selectedLabel,
  current = false,
  selected = false,
  summaryLabel,
  onSelect,
}: {
  name: ReactNode
  idLabel: ReactNode
  description?: ReactNode
  versionLabel: ReactNode
  currentLabel?: ReactNode
  selectedLabel?: ReactNode
  current?: boolean
  selected?: boolean
  summaryLabel?: ReactNode
  onSelect: () => void
}) {
  return (
    <AgentSurfaceBlock
      asChild
      variant="subtle"
      data-current={current ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      className="agent-settings-config-file-list-item"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={selected}
        onClick={onSelect}
        className="agent-settings-config-file-list-item__button"
      >
        <span className="agent-settings-config-file-list-item__header">
          <span className="ms-type-label agent-settings-card-title agent-settings-card-title--strong agent-settings-card-title--wrap">{name}</span>
          <span className="agent-settings-config-file-list-item__badges">
            {current && currentLabel ? <StatusBadge intent="success" emphasis="soft">{currentLabel}</StatusBadge> : null}
            {selected && selectedLabel ? <Badge variant="soft">{selectedLabel}</Badge> : null}
            <Badge variant="outline">{versionLabel}</Badge>
          </span>
        </span>
        <span className="ms-text-truncate ms-type-tiny agent-settings-card-meta">{idLabel}</span>
        {description ? <span className="ms-type-caption agent-settings-card-description">{description}</span> : null}
        {summaryLabel ? <span className="ms-text-truncate ms-type-tiny agent-settings-card-meta">{summaryLabel}</span> : null}
      </Button>
    </AgentSurfaceBlock>
  )
}

export function AgentSettingsConfigFileEditorHeader({
  title,
  description,
  badges,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  badges?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="ms-action-row agent-settings-config-file-editor-header agent-settings-row-between">
      <div className="agent-settings-item-body">
        <div className="ms-action-row agent-settings-title-row">
          <h2 className="ms-type-label agent-settings-card-title agent-settings-card-title--strong agent-settings-card-title--wrap">{title}</h2>
          {badges ? <span className="ms-action-row agent-settings-action-group">{badges}</span> : null}
        </div>
        {description ? <p className="ms-type-caption agent-settings-item-detail">{description}</p> : null}
      </div>
      {actions ? <div className="ms-action-row agent-settings-action-group">{actions}</div> : null}
    </div>
  )
}

export function AgentSettingsConfigFileEditorSection({
  title,
  description,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  title: ReactNode
  description?: ReactNode
}) {
  return (
    <AgentSurfaceBlock
      as="section"
      variant="card"
      className={cn('agent-settings-config-file-editor-section', className)}
      {...props}
    >
      <div className="agent-settings-config-file-editor-section__header">
        <p className="ms-text-truncate ms-type-label agent-settings-card-title agent-settings-card-title--strong">{title}</p>
        {description ? <p className="ms-type-caption agent-settings-item-detail">{description}</p> : null}
      </div>
      <div className="agent-settings-config-file-editor-section__body">{children}</div>
    </AgentSurfaceBlock>
  )
}

export function AgentSettingsConfigFileSummaryList({ item }: { item: AgentSettingsConfigFileSummaryItem }) {
  return (
    <AgentSurfaceBlock variant="card" className="agent-settings-config-file-summary">
      <p className="agent-settings-config-file-summary__label">{item.label}</p>
      <p className="ms-text-truncate agent-settings-config-file-summary__value">{item.value}</p>
    </AgentSurfaceBlock>
  )
}

export function AgentSettingsConfigFileDiffPanel({
  title,
  sections,
}: {
  title: ReactNode
  sections: AgentSettingsConfigFileDiffSection[]
}) {
  return (
    <AgentDataBlock>
      <p className="ms-type-label agent-settings-item-title">{title}</p>
      <div className="agent-settings-grid agent-settings-grid--two">
        {sections.map((section) => (
          <AgentSettingsConfigFileDiffSectionView key={section.id} section={section} />
        ))}
      </div>
    </AgentDataBlock>
  )
}

export function AgentSettingsConfigFileDiffSectionView({ section }: { section: AgentSettingsConfigFileDiffSection }) {
  return (
    <AgentSurfaceBlock variant="card" className="ms-type-tiny agent-settings-config-file-diff-section">
      <p className="agent-settings-config-file-diff-section__label">{section.label}</p>
      {section.lines.length > 0 ? (
        <div className="agent-settings-config-file-diff-section__lines">
          {section.lines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      ) : (
        <p className="agent-settings-config-file-diff-section__empty">{section.emptyLabel}</p>
      )}
    </AgentSurfaceBlock>
  )
}
