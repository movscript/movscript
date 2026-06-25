import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const resourceSurfaceFacadeFiles = [
  'src/shared/ui/AuthedImage.tsx',
  'src/shared/ui/HlsVideo.tsx',
  'src/shared/ui/MediaViewer.tsx',
  'src/shared/ui/ResourceAudio.tsx',
  'src/shared/ui/ResourceCandidateAttachPanel.tsx',
  'src/shared/ui/ResourceFileAudio.tsx',
  'src/shared/ui/ResourceFileImage.tsx',
  'src/shared/ui/ResourceFileVideo.tsx',
  'src/shared/ui/ResourceImage.tsx',
  'src/shared/ui/ResourceLibraryPicker.tsx',
  'src/shared/ui/ResourceVideo.tsx',
  'src/shared/ui/resourceBlob.ts',
  'src/shared/ui/resourceDownload.ts',
  'src/shared/ui/resourceMediaCache.ts',
  'src/shared/ui/resourceMediaDiagnostics.ts',
  'src/shared/ui/resourceText.ts',
  'src/shared/ui/resourceUrl.ts',
]

test('desktop does not keep resource surface compatibility facades', () => {
  for (const file of resourceSurfaceFacadeFiles) {
    assert.equal(existsSync(resolve(file)), false, `${file} should be consumed from @movscript/resource-surface`)
  }
})

test('desktop resource media consumers import the resource surface directly', () => {
  const checkedFiles = [
    'src/pages/agent/AgentResourceDetailPage.tsx',
    'src/pages/agent/AgentPreviewTimelinePage.tsx',
    'src/pages/agent/AgentContentCandidatesPage.tsx',
    'src/pages/agent/AgentGenerationJobPage.tsx',
    'src/features/jobs/components/JobCollectionCards.tsx',
    'src/features/tools/components/ToolDialogJobPanels.tsx',
    'src/features/agent/components/AgentAttachmentMediaPreview.tsx',
    'src/features/agent/components/AgentRunInteractionBubble.tsx',
    'src/features/agent/components/GeneratedCandidateAttachDialog.tsx',
    'src/features/agent/components/GeneratedResultCard.tsx',
    'src/features/agent/components/agent-chat-items/AgentChatThreadItemBlocks.tsx',
    'src/features/agent/presentation/agentMentionEditorModel.ts',
    'src/features/agent/application/agentAttachmentDataUrl.ts',
    'src/shared/ui/ResourceChipDom.ts',
    'src/shared/ui/resourceMediaHelpers.test.ts',
    'src/shared/ui/resourceText.test.ts',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(file), 'utf8')
    assert.match(source, /@movscript\/resource-surface/, `${file} should use the public resource surface boundary`)
    assert.doesNotMatch(source, /@\/shared\/ui\/(?:AuthedImage|HlsVideo|MediaViewer|ResourceAudio|ResourceCandidateAttachPanel|ResourceFileAudio|ResourceFileImage|ResourceFileVideo|ResourceImage|ResourceLibraryPicker|ResourceVideo|resourceBlob|resourceDownload|resourceMediaCache|resourceMediaDiagnostics|resourceText|resourceUrl)/)
  }
})

test('desktop source does not import deleted resource surface facades', () => {
  const facadeImportPattern = /@\/shared\/ui\/(?:AuthedImage|HlsVideo|MediaViewer|ResourceAudio|ResourceCandidateAttachPanel|ResourceFileAudio|ResourceFileImage|ResourceFileVideo|ResourceImage|ResourceLibraryPicker|ResourceVideo|resourceBlob|resourceDownload|resourceMediaCache|resourceMediaDiagnostics|resourceText|resourceUrl)/
  const offenders = listSourceFiles(resolve('src'))
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    .filter(({ source }) => facadeImportPattern.test(source))
    .map(({ file }) => relative(process.cwd(), file))

  assert.deepEqual(offenders, [])
})

function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) return listSourceFiles(path)
    return /\.(?:ts|tsx)$/.test(entry) ? [path] : []
  })
}
