import { TextCursorInput } from 'lucide-react'

import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import { PromptReferenceInlineEditor, PromptReferenceStrip } from './ContentCanvasPromptReferences'
import type { CandidateSelections } from './contentCanvasWorkspaceTypes'

export function ContentCanvasPromptEditor({
  ariaLabel,
  candidateSelections,
  nodes,
  onBlur,
  onChange,
  onSelectNode,
  ownerNode,
  value,
}: {
  ariaLabel: string
  candidateSelections: CandidateSelections
  nodes: ContentCanvasNode[]
  onBlur: (prompt: string) => void
  onChange: (prompt: string) => void
  onSelectNode: (node: ContentCanvasNode) => void
  ownerNode: ContentCanvasNode | undefined
  value: string
}) {
  return (
    <div className="content-canvas-prompt-editor">
      <span className="content-canvas-prompt-editor__label">
        <TextCursorInput size={13} aria-hidden="true" />
        Prompt
      </span>
      <PromptReferenceInlineEditor
        className="nodrag"
        prompt={value}
        nodes={nodes}
        ownerNode={ownerNode}
        candidateSelections={candidateSelections}
        ariaLabel={ariaLabel}
        onChange={onChange}
        onBlur={onBlur}
        onSelectNode={onSelectNode}
      />
      <PromptReferenceStrip
        prompt={value}
        nodes={nodes}
        ownerNode={ownerNode}
        candidateSelections={candidateSelections}
        onSelectNode={onSelectNode}
      />
    </div>
  )
}
