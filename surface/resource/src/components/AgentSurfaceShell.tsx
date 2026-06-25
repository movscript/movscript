import type { ReactNode } from 'react'
import './AgentSurfaceShell.css'

export function AgentSurfaceShell({
  title,
  description,
  chips = [],
  ready,
  preparingLabel = 'Preparing Codex surface...',
  children,
}: {
  title: string
  description?: string
  chips?: string[]
  ready: boolean
  preparingLabel?: string
  children: ReactNode
}) {
  if (!ready) return <div className="agent-surface-status">{preparingLabel}</div>
  return (
    <section className="agent-surface-shell">
      <div className="agent-surface-shell__inner">
        <header className="agent-surface-shell__header">
          <div className="agent-surface-shell__title">
            <h1>{title}</h1>
            {description ? <p>{description}</p> : null}
          </div>
          {chips.length > 0 ? (
            <div className="agent-surface-shell__meta">
              {chips.map((chip) => <span key={chip} className="agent-surface-shell__chip">{chip}</span>)}
            </div>
          ) : null}
        </header>
        <div className="agent-surface-shell__body">
          {children}
        </div>
      </div>
    </section>
  )
}

export function AgentSurfacePanel({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <section className="agent-surface-panel">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

export function AgentSurfaceJson({ value }: { value: unknown }) {
  return <pre className="agent-surface-pre">{JSON.stringify(value, null, 2)}</pre>
}

export function AgentSurfaceKeyValues({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="agent-surface-kv">
      {items.map(([label, value]) => (
        <div key={label} className="agent-surface-kv__row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function AgentSurfaceLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className="agent-surface-link" href={href}>{children}</a>
}
