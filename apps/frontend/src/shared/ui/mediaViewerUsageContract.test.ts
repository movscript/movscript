import assert from 'node:assert/strict'
import test from 'node:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

test('generation prompt resource chips use the shared MediaViewer thumbnail path', () => {
  const source = readFileSync(resolve('src/shared/ui/GenResultCard.tsx'), 'utf8')

  assert.match(source, /media=\{<MediaViewer resource=\{resource\} lightbox=\{false\} thumbnailMaxSize=\{96\} \/>\}/)
  assert.doesNotMatch(source, /AuthedVideo/)
  assert.doesNotMatch(source, /AuthedImage/)
  assert.doesNotMatch(source, /<video src=\{url\}/)
  assert.doesNotMatch(source, /<img src=\{url\}/)
})

test('resource attachment tiles use the shared MediaViewer thumbnail path for media files', () => {
  const source = readFileSync(resolve('src/shared/ui/ResourceAttachments.tsx'), 'utf8')

  assert.match(source, /resource\.type === 'image' \|\| resource\.type === 'video'/)
  assert.match(source, /<MediaViewer[\s\S]*resource=\{resource\}[\s\S]*fit="cover"[\s\S]*lightbox=\{false\}/)
  assert.doesNotMatch(source, /AuthedVideo/)
  assert.doesNotMatch(source, /AuthedImage/)
})

test('canvas generation output surfaces use the shared GenerationOutputPreview', () => {
  const canvasSource = readFileSync(resolve('src/shared/ui/CanvasGenBody.tsx'), 'utf8')
  const toolSource = readFileSync(resolve('src/shared/ui/ToolNodeFullCard.tsx'), 'utf8')
  const previewSource = readFileSync(resolve('src/shared/ui/GenerationOutputPreview.tsx'), 'utf8')
  const resourceAudioSource = readFileSync(resolve('src/shared/ui/ResourceAudio.tsx'), 'utf8')
  const resourceImageSource = readFileSync(resolve('src/shared/ui/ResourceImage.tsx'), 'utf8')
  const resourceVideoSource = readFileSync(resolve('src/shared/ui/ResourceVideo.tsx'), 'utf8')

  assert.match(canvasSource, /import \{ GenerationOutputPreview \}/)
  assert.match(canvasSource, /<GenerationOutputPreview resource=\{resource\} outputType=\{outputType\} \/>/)
  assert.doesNotMatch(canvasSource, /AuthedVideo/)
  assert.doesNotMatch(canvasSource, /AuthedImage/)
  assert.doesNotMatch(canvasSource, /API_BASE/)

  assert.match(toolSource, /import \{ GenerationOutputPreview \}/)
  assert.match(toolSource, /<GenerationOutputPreview resource=\{resource\} outputType=\{outputType\}/)
  assert.doesNotMatch(toolSource, /AuthedVideo/)
  assert.doesNotMatch(toolSource, /AuthedImage/)
  assert.doesNotMatch(toolSource, /API_BASE/)

  assert.match(previewSource, /videoProps\?: Omit<VideoHTMLAttributes<HTMLVideoElement>, 'controls' \| 'src' \| 'resource'>/)
  assert.match(previewSource, /<ResourceImage resource=\{resource\} alt=\{alt\} \/>/)
  assert.match(previewSource, /<ResourceVideo resource=\{resource\} \{\.\.\.videoProps\} controls \/>/)
  assert.doesNotMatch(previewSource, /AuthedImage/)
  assert.doesNotMatch(previewSource, /AuthedVideo/)

  assert.match(resourceAudioSource, /resolveResourceUrl\(resource\)/)
  assert.match(resourceAudioSource, /<AuthedAudio src=\{resolveResourceUrl\(resource\)\} \{\.\.\.props\} \/>/)

  assert.match(resourceImageSource, /resolveResourceUrl\(resource\)/)
  assert.match(resourceImageSource, /<AuthedImage src=\{resolveResourceUrl\(resource\)\} \{\.\.\.props\} \/>/)

  assert.match(resourceVideoSource, /resolveResourceUrl\(resource\)/)
  assert.match(resourceVideoSource, /<AuthedVideo ref=\{ref\} src=\{resolveResourceUrl\(resource\)\} \{\.\.\.props\} \/>/)
})

test('tool page input previews and outputs use shared media primitives', () => {
  const source = readFileSync(resolve('src/features/tools/components/ToolPage.tsx'), 'utf8')

  assert.match(source, /import \{ MediaViewer \}/)
  assert.match(source, /import \{ resolveResourceUrl \}/)
  assert.match(source, /import \{ GenerationOutputPreview \}/)
  assert.match(source, /<MediaViewer resource=\{r\} lightbox=\{false\} \/>/)
  assert.match(source, /<GenerationOutputPreview[\s\S]*resource=\{state\.outputResource\}[\s\S]*outputType=\{def\.outputType\}/)
  assert.doesNotMatch(source, /AuthedVideo/)
  assert.doesNotMatch(source, /AuthedImage/)
  assert.doesNotMatch(source, /API_BASE/)
  assert.doesNotMatch(source, /<video/)
  assert.doesNotMatch(source, /<img/)
})

test('workflow run results use MediaViewer for generated media outputs', () => {
  const source = readFileSync(resolve('src/features/canvas/ui/CanvasWorkflowPanels.tsx'), 'utf8')

  assert.match(source, /import \{ MediaViewer \}/)
  assert.match(source, /import \{ resolveResourceUrl \}/)
  assert.match(source, /resolveResourceUrl\(resource\)/)
  assert.match(source, /<CanvasMediaFill fit="contain"><MediaViewer resource=\{resource\} fit="contain" lightbox=\{false\} \/><\/CanvasMediaFill>/)
  assert.doesNotMatch(source, /AuthedVideo/)
  assert.doesNotMatch(source, /AuthedImage/)
  assert.doesNotMatch(source, /API_BASE/)
})

test('canvas resource image previews use ResourceImage instead of direct AuthedImage', () => {
  const assetSource = readFileSync(resolve('src/features/canvas/ui/canvasAssetNodes.tsx'), 'utf8')
  const shelfSource = readFileSync(resolve('src/features/canvas/ui/CanvasResourceShelf.tsx'), 'utf8')

  assert.match(assetSource, /import \{ ResourceImage \}/)
  assert.match(assetSource, /<ResourceImage[\s\S]*resource=\{data\.resource\}[\s\S]*thumbnailMaxSize=\{CANVAS_NODE_IMAGE_THUMB_MAX_SIZE\}/)
  assert.match(assetSource, /<ResourceImage[\s\S]*resource=\{resource\}[\s\S]*thumbnailMaxSize=\{CANVAS_NODE_IMAGE_THUMB_MAX_SIZE\}/)
  assert.doesNotMatch(assetSource, /AuthedImage/)
  assert.doesNotMatch(assetSource, /API_BASE/)

  assert.match(shelfSource, /import \{ ResourceImage \}/)
  assert.match(shelfSource, /<ResourceImage resource=\{resource\} alt="" diagnosticLabel=\{`canvas-shelf:\$\{resource\.ID\}`\} thumbnailMaxSize=\{RESOURCE_SHELF_THUMB_MAX_SIZE\} \/>/)
  assert.match(shelfSource, /<ResourceImage[\s\S]*resource=\{resource\}[\s\S]*aria-hidden/)
  assert.doesNotMatch(shelfSource, /AuthedImage/)
  assert.doesNotMatch(shelfSource, /API_BASE/)
})

test('pre-production asset thumbnails use MediaViewer for slot media', () => {
  const source = readFileSync(resolve('src/features/pre-production/components/PreProductionAssetBoard.tsx'), 'utf8')

  assert.match(source, /import \{ MediaViewer \}/)
  assert.match(source, /<MediaViewer resource=\{resource\} fit=\{fit\} lightbox=\{false\} \/>/)
  assert.doesNotMatch(source, /AuthedVideo/)
  assert.doesNotMatch(source, /AuthedImage/)
  assert.doesNotMatch(source, /API_BASE_URL/)
  assert.doesNotMatch(source, /mediaSrc/)
})

test('shot library custom clip player uses ResourceVideo for resource playback', () => {
  const source = readFileSync(resolve('src/features/shot-library/components/ShotLibraryPage.tsx'), 'utf8')

  assert.match(source, /import \{ ResourceVideo \}/)
  assert.match(source, /<ResourceVideo[\s\S]*ref=\{videoRef\}[\s\S]*resource=\{resource\}/)
  assert.doesNotMatch(source, /AuthedVideo/)
})

test('resource page blob and external previews use UrlMedia primitives', () => {
  const source = readFileSync(resolve('src/features/resources/components/ResourcesPage.tsx'), 'utf8')
  const urlMediaSource = readFileSync(resolve('src/shared/ui/UrlMedia.tsx'), 'utf8')

  assert.match(source, /import \{ UrlImage, UrlMediaPreview, UrlVideo \}/)
  assert.match(source, /<UrlVideo[\s\S]*ref=\{videoRef\}[\s\S]*src=\{sourceUrl\}/)
  assert.match(source, /<UrlImage src=\{item\.thumbnail_url\} alt=\{name\} loading="lazy" \/>/)
  assert.match(source, /<UrlMediaPreview[\s\S]*src=\{previewUrl\}[\s\S]*type=\{item\.media_type\}/)
  assert.doesNotMatch(source, /<video/)
  assert.doesNotMatch(source, /<img/)

  assert.match(urlMediaSource, /ResourceAuthImage/)
  assert.match(urlMediaSource, /ResourceAuthVideo/)
  assert.match(urlMediaSource, /videoProps\?: Omit<UrlVideoProps, 'src' \| 'poster' \| 'controls' \| 'playsInline' \| 'resource'>/)
  assert.match(urlMediaSource, /<UrlVideo src=\{src\} poster=\{poster\} \{\.\.\.videoProps\} controls playsInline \/>/)
})

test('resource file and temporary image previews use shared image primitives', () => {
  const fileImageSource = readFileSync(resolve('src/shared/ui/ResourceFileImage.tsx'), 'utf8')
  const fileUrlSource = readFileSync(resolve('src/shared/ui/resourceFileUrl.ts'), 'utf8')
  const previewDrawerSource = readFileSync(resolve('src/shared/ui/PreviewDrawer.tsx'), 'utf8')
  const agentWorkflowSource = readFileSync(resolve('src/features/agent/components/AgentWorkflowBubble.tsx'), 'utf8')
  const keyframeEditorSource = readFileSync(resolve('src/features/content/components/ContentWorkbenchKeyframeEditor.tsx'), 'utf8')
  const scenePreviewSource = readFileSync(resolve('src/features/content/components/ContentWorkbenchScenePreview.tsx'), 'utf8')
  const projectStandardsSource = readFileSync(resolve('src/features/project-standards/components/ProjectStandardsPage.tsx'), 'utf8')
  const shotLibrarySource = readFileSync(resolve('src/features/shot-library/components/ShotLibraryPage.tsx'), 'utf8')

  assert.match(fileImageSource, /import \{ resourceFileImageUrl \}/)
  assert.match(fileImageSource, /<AuthedImage src=\{resourceFileImageUrl\(resourceId, resourceUrl\)\} \{\.\.\.props\} \/>/)
  assert.match(fileUrlSource, /resourceId \? `\/api\/v1\/resources\/\$\{resourceId\}\/file` : undefined/)

  for (const source of [
    previewDrawerSource,
    agentWorkflowSource,
    keyframeEditorSource,
    scenePreviewSource,
    projectStandardsSource,
  ]) {
    assert.match(source, /ResourceFileImage/)
    assert.doesNotMatch(source, /AuthedImage/)
    assert.doesNotMatch(source, /<img/)
  }

  assert.match(shotLibrarySource, /import \{ UrlImage \}/)
  assert.match(shotLibrarySource, /<UrlImage src=\{draft\.thumbnailUrl\} alt="" \/>/)
  assert.doesNotMatch(shotLibrarySource, /<img/)
})

test('contenteditable resource chips use shared DOM media helpers', () => {
  const inputSource = readFileSync(resolve('src/shared/ui/GenInputCard.tsx'), 'utf8')
  const chipSource = readFileSync(resolve('src/shared/ui/ResourceChipDom.ts'), 'utf8')

  assert.match(inputSource, /import \{ applyResourceChipMediaUrl, buildResourceChipElement, loadResourceChipMediaUrl \}/)
  assert.match(inputSource, /buildResourceChipElement\(resource\)/)
  assert.match(inputSource, /loadResourceChipMediaUrl\(resource\)/)
  assert.match(inputSource, /applyResourceChipMediaUrl/)
  assert.doesNotMatch(inputSource, /document\.createElement\(['"](?:img|video)['"]\)/)
  assert.doesNotMatch(inputSource, /API_BASE/)

  assert.match(chipSource, /loadResourceBlob\(resource\)/)
  assert.match(chipSource, /createObjectUrl\(await loadResourceBlob\(resource\)\)/)
  assert.match(chipSource, /document\.createElement\('video'\)/)
  assert.match(chipSource, /document\.createElement\('img'\)/)
})

test('video metadata and thumbnail probing is isolated to shared helpers', () => {
  const shotLibrarySource = readFileSync(resolve('src/features/shot-library/components/ShotLibraryPage.tsx'), 'utf8')
  const probeSource = readFileSync(resolve('src/shared/ui/VideoProbe.ts'), 'utf8')

  assert.match(shotLibrarySource, /import \{ captureVideoThumbnails, loadVideoProbeMetadataFromObjectUrl \}/)
  assert.match(shotLibrarySource, /loadVideoProbeMetadataFromObjectUrl\(url, cleanup, VIDEO_METADATA_TIMEOUT_MS\)/)
  assert.match(shotLibrarySource, /captureVideoThumbnails\(/)
  assert.doesNotMatch(shotLibrarySource, /document\.createElement\('video'\)/)

  assert.match(probeSource, /document\.createElement\('video'\)/)
  assert.match(probeSource, /document\.createElement\('canvas'\)/)
})

test('native media DOM element creation is limited to shared media helpers', () => {
  const allowed = new Set([
    'src/shared/ui/ResourceChipDom.ts',
    'src/shared/ui/VideoProbe.ts',
  ])
  const offenders = listSourceFiles(resolve('src'))
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    .filter(({ file, source }) => /document\.createElement\(['"](?:img|video|audio)['"]\)|new Image\(/.test(source) && !allowed.has(relative(process.cwd(), file)))
    .map(({ file }) => relative(process.cwd(), file))

  assert.deepEqual(offenders, [])
})

test('API base URL media resolution is isolated to the shared resource resolver', () => {
  const allowed = new Set([
    'src/shared/infrastructure/config.ts',
    'src/shared/ui/resourceUrl.ts',
  ])
  const mediaViewerSource = readFileSync(resolve('src/shared/ui/MediaViewer.tsx'), 'utf8')
  const resourceUrlSource = readFileSync(resolve('src/shared/ui/resourceUrl.ts'), 'utf8')

  assert.match(mediaViewerSource, /import \{ resolveResourceUrl \}/)
  assert.doesNotMatch(mediaViewerSource, /API_BASE/)
  assert.match(resourceUrlSource, /API_BASE_URL as API_BASE/)
  assert.match(resourceUrlSource, /return `\$\{API_BASE\}\$\{resource\.url\}`/)

  const offenders = listSourceFiles(resolve('src'))
    .map((file) => ({ file, source: readFileSync(file, 'utf8'), relativePath: relative(process.cwd(), file) }))
    .filter(({ relativePath, source }) => /\bAPI_BASE(?:_URL)?\b/.test(source) && !allowed.has(relativePath))
    .map(({ relativePath }) => relativePath)

  assert.deepEqual(offenders, [])
})

test('resource downloads use the shared download helper instead of MediaViewer exports', () => {
  const mediaViewerSource = readFileSync(resolve('src/shared/ui/MediaViewer.tsx'), 'utf8')
  const downloadSource = readFileSync(resolve('src/shared/ui/resourceDownload.ts'), 'utf8')
  const resourcesSource = readFileSync(resolve('src/features/resources/components/ResourcesPage.tsx'), 'utf8')

  assert.match(mediaViewerSource, /import \{ downloadResource \}/)
  assert.doesNotMatch(mediaViewerSource, /export async function downloadResource/)

  assert.match(downloadSource, /loadResourceBlob\(resource\)/)
  assert.match(downloadSource, /createObjectUrl\(blob\)/)
  assert.match(downloadSource, /a\.download = resource\.name/)

  assert.match(resourcesSource, /import \{ downloadResource \} from '@\/shared\/ui\/resourceDownload'/)
  assert.match(resourcesSource, /onDownload=\{\(\) => downloadResource\(r\)\}/)
  assert.doesNotMatch(resourcesSource, /from '@\/shared\/ui\/MediaViewer'.*downloadResource/)
  assert.doesNotMatch(resourcesSource, /downloadResource\(resolveResourceUrl\(r\), r\.name\)/)
})

test('resource blob loading is isolated to the shared blob helper', () => {
  const allowed = new Set([
    'src/shared/ui/resourceBlob.ts',
  ])
  const blobSource = readFileSync(resolve('src/shared/ui/resourceBlob.ts'), 'utf8')
  const authedSource = readFileSync(resolve('src/shared/ui/AuthedImage.tsx'), 'utf8')
  const chipSource = readFileSync(resolve('src/shared/ui/ResourceChipDom.ts'), 'utf8')
  const resourcesSource = readFileSync(resolve('src/features/resources/components/ResourcesPage.tsx'), 'utf8')
  const shotSource = readFileSync(resolve('src/features/shot-library/components/ShotLibraryPage.tsx'), 'utf8')

  assert.match(blobSource, /responseType: 'blob'/)
  assert.match(authedSource, /loadResourceUrlBlob\(src\)/)
  assert.match(chipSource, /loadResourceBlob\(resource\)/)
  assert.match(resourcesSource, /loadResourceBlob\(resource,/)
  assert.match(shotSource, /loadResourceBlob\(resource,/)

  const offenders = listSourceFiles(resolve('src'))
    .map((file) => ({ file, source: readFileSync(file, 'utf8'), relativePath: relative(process.cwd(), file) }))
    .filter(({ relativePath, source }) => /responseType: ['"]blob['"]/.test(source) && !allowed.has(relativePath))
    .map(({ relativePath }) => relativePath)

  assert.deepEqual(offenders, [])
})

test('object URL lifecycle is isolated to the shared object URL helper', () => {
  const allowed = new Set([
    'src/shared/ui/objectUrl.ts',
  ])
  const objectUrlSource = readFileSync(resolve('src/shared/ui/objectUrl.ts'), 'utf8')
  const composerSource = readFileSync(resolve('src/features/agent/presentation/useAgentComposerController.ts'), 'utf8')
  const resourcesSource = readFileSync(resolve('src/features/resources/components/ResourcesPage.tsx'), 'utf8')
  const shotSource = readFileSync(resolve('src/features/shot-library/components/ShotLibraryPage.tsx'), 'utf8')

  assert.match(objectUrlSource, /URL\.createObjectURL/)
  assert.match(objectUrlSource, /URL\.revokeObjectURL/)
  assert.match(composerSource, /createObjectUrl\(file\)/)
  assert.match(resourcesSource, /createObjectUrl\(blob\)/)
  assert.match(shotSource, /revokeObjectUrl\(current\?\.objectUrl\)/)

  const offenders = listSourceFiles(resolve('src'))
    .map((file) => ({ file, source: readFileSync(file, 'utf8'), relativePath: relative(process.cwd(), file) }))
    .filter(({ relativePath, source }) => /URL\.(?:createObjectURL|revokeObjectURL)/.test(source) && !allowed.has(relativePath))
    .map(({ relativePath }) => relativePath)

  assert.deepEqual(offenders, [])
})

test('resource media cache lives in shared UI media infrastructure', () => {
  const authedSource = readFileSync(resolve('src/shared/ui/AuthedImage.tsx'), 'utf8')
  const mentionSource = readFileSync(resolve('src/features/agent/presentation/agentMentionEditorModel.ts'), 'utf8')
  const resourceCacheCompatSource = readFileSync(resolve('src/features/resources/domain/resourceMediaCache.ts'), 'utf8')
  const sharedCacheSource = readFileSync(resolve('src/shared/ui/resourceMediaCache.ts'), 'utf8')

  assert.match(authedSource, /from '@\/shared\/ui\/resourceMediaCache'/)
  assert.match(mentionSource, /from '@\/shared\/ui\/resourceMediaCache'/)
  assert.match(resourceCacheCompatSource, /export \* from '@\/shared\/ui\/resourceMediaCache'/)
  assert.match(sharedCacheSource, /acquireCachedResourceMediaUrl/)
  assert.doesNotMatch(authedSource, /@\/features\/resources\/domain\/resourceMediaCache/)

  const offenders = listSourceFiles(resolve('src/shared/ui'))
    .map((file) => ({ file, source: readFileSync(file, 'utf8'), relativePath: relative(process.cwd(), file) }))
    .filter(({ source }) => /@\/features\/resources\/domain\/resourceMediaCache/.test(source))
    .map(({ relativePath }) => relativePath)

  assert.deepEqual(offenders, [])
})

test('media upload accept constants live in shared domain', () => {
  const sharedTypesSource = readFileSync(resolve('src/shared/domain/mediaTypes.ts'), 'utf8')
  const resourceTypesCompatSource = readFileSync(resolve('src/features/resources/domain/mediaTypes.ts'), 'utf8')
  const genInputSource = readFileSync(resolve('src/shared/ui/GenInputCard.tsx'), 'utf8')
  const attachmentsSource = readFileSync(resolve('src/shared/ui/ResourceAttachments.tsx'), 'utf8')

  assert.match(sharedTypesSource, /RESOURCE_UPLOAD_ACCEPT/)
  assert.match(resourceTypesCompatSource, /export \* from '@\/shared\/domain\/mediaTypes'/)
  assert.match(genInputSource, /from '@\/shared\/domain\/mediaTypes'/)
  assert.match(attachmentsSource, /from '@\/shared\/domain\/mediaTypes'/)

  const offenders = listSourceFiles(resolve('src'))
    .map((file) => ({ file, source: readFileSync(file, 'utf8'), relativePath: relative(process.cwd(), file) }))
    .filter(({ relativePath, source }) => (
      /@\/features\/resources\/domain\/mediaTypes/.test(source)
      && relativePath !== 'src/features/resources/domain/mediaTypes.ts'
    ))
    .map(({ relativePath }) => relativePath)

  assert.deepEqual(offenders, [])
})

test('text resource loading is isolated to the shared text helper', () => {
  const allowed = new Set([
    'src/shared/ui/resourceText.ts',
  ])
  const mediaViewerSource = readFileSync(resolve('src/shared/ui/MediaViewer.tsx'), 'utf8')
  const canvasAssetSource = readFileSync(resolve('src/features/canvas/ui/canvasAssetNodes.tsx'), 'utf8')
  const textSource = readFileSync(resolve('src/shared/ui/resourceText.ts'), 'utf8')

  assert.match(mediaViewerSource, /import \{ loadResourceTextUrl \}/)
  assert.match(mediaViewerSource, /queryFn: \(\) => loadResourceTextUrl\(proxyUrl\)/)
  assert.doesNotMatch(mediaViewerSource, /responseType: 'text'/)

  assert.match(canvasAssetSource, /import \{ loadResourceTextUrl \}/)
  assert.match(canvasAssetSource, /queryFn: \(\) => loadResourceTextUrl\(textResourceUrl\)/)
  assert.doesNotMatch(canvasAssetSource, /responseType: 'text'/)

  assert.match(textSource, /responseType: 'text'/)

  const offenders = listSourceFiles(resolve('src'))
    .map((file) => ({ file, source: readFileSync(file, 'utf8'), relativePath: relative(process.cwd(), file) }))
    .filter(({ relativePath, source }) => /responseType: 'text'/.test(source) && !allowed.has(relativePath))
    .map(({ relativePath }) => relativePath)

  assert.deepEqual(offenders, [])
})

test('MediaViewer uses resource-level primitives for audio playback', () => {
  const source = readFileSync(resolve('src/shared/ui/MediaViewer.tsx'), 'utf8')

  assert.match(source, /import \{ ResourceAudio \}/)
  assert.match(source, /<ResourceAudio resource=\{resource\} controls autoPlay \/>/)
  assert.doesNotMatch(source, /AuthedAudio/)
})

test('resource file URL synthesis is limited to data normalization and shared resource primitives', () => {
  const allowed = new Set([
    'src/features/agent/domain/agentAttachments.ts',
    'src/features/agent/domain/agentGenerationMedia.ts',
    'src/features/agent/domain/agentMessageViewModel.ts',
    'src/features/canvas/runtime/runtimeValues.ts',
    'src/features/shot-library/domain/shotReferenceLibrary.ts',
    'src/shared/ui/ResourceFileImage.tsx',
    'src/shared/ui/resourceFileUrl.ts',
  ])
  const offenders = listSourceFiles(resolve('src'))
    .map((file) => ({ file, source: readFileSync(file, 'utf8'), relativePath: relative(process.cwd(), file) }))
    .filter(({ relativePath, source }) => (
      /\/api\/v1\/resources\/\$\{/.test(source)
      || /resourceFileUrl\(/.test(source)
      || /resourceFileImageUrl\(/.test(source)
    ) && !allowed.has(relativePath))
    .map(({ relativePath }) => relativePath)

  assert.deepEqual(offenders, [])
})

test('frontend app source does not render native video elements directly', () => {
  const offenders = listSourceFiles(resolve('src'))
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    .filter(({ source }) => source.includes('<video'))
    .map(({ file }) => relative(process.cwd(), file))

  assert.deepEqual(offenders, [])
})

test('frontend app source does not render native image elements directly', () => {
  const offenders = listSourceFiles(resolve('src'))
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    .filter(({ source }) => source.includes('<img'))
    .map(({ file }) => relative(process.cwd(), file))

  assert.deepEqual(offenders, [])
})

test('direct AuthedVideo usage is limited to shared media primitives', () => {
  const allowed = new Set([
    'src/shared/ui/AuthedImage.tsx',
    'src/shared/ui/GenerationOutputPreview.tsx',
    'src/shared/ui/MediaViewer.tsx',
    'src/shared/ui/ResourceImage.tsx',
    'src/shared/ui/ResourceVideo.tsx',
  ])
  const files = [
    ...listSourceFiles(resolve('src/features/agent')),
    ...listSourceFiles(resolve('src/features/canvas')),
    ...listSourceFiles(resolve('src/features/pre-production')),
    ...listSourceFiles(resolve('src/features/shot-library')),
    ...listSourceFiles(resolve('src/features/tools')),
    ...listSourceFiles(resolve('src/shared/ui')),
  ]
  const offenders = files
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    .filter(({ file, source }) => source.includes('AuthedVideo') && !allowed.has(relative(process.cwd(), file)))
    .map(({ file }) => relative(process.cwd(), file))

  assert.deepEqual(offenders, [])
})

test('direct AuthedImage usage is limited to shared media primitives', () => {
  const allowed = new Set([
    'src/shared/ui/AuthedImage.tsx',
    'src/shared/ui/MediaViewer.tsx',
    'src/shared/ui/ResourceFileImage.tsx',
    'src/shared/ui/ResourceImage.tsx',
  ])
  const offenders = listSourceFiles(resolve('src'))
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    .filter(({ file, source }) => /import\s+\{[^}]*\bAuthedImage\b|<AuthedImage\b/.test(source) && !allowed.has(relative(process.cwd(), file)))
    .map(({ file }) => relative(process.cwd(), file))

  assert.deepEqual(offenders, [])
})

test('direct AuthedAudio usage is limited to shared media primitives', () => {
  const allowed = new Set([
    'src/shared/ui/AuthedImage.tsx',
    'src/shared/ui/ResourceAudio.tsx',
  ])
  const offenders = listSourceFiles(resolve('src'))
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    .filter(({ file, source }) => /import\s+\{[^}]*\bAuthedAudio\b|<AuthedAudio\b/.test(source) && !allowed.has(relative(process.cwd(), file)))
    .map(({ file }) => relative(process.cwd(), file))

  assert.deepEqual(offenders, [])
})

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = resolve(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) return listSourceFiles(path)
    if (!/\.(?:ts|tsx)$/.test(entry) || /\.test\.(?:ts|tsx)$/.test(entry)) return []
    return [path]
  })
}
