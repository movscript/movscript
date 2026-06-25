import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/react.ts',
    'src/data.ts',
    'src/routes.ts',
    'src/i18n.ts',
    'src/resource-browser.ts',
    'src/resourceMediaBrowser.ts',
    'src/resourceMediaDiagnostics.ts',
    'src/resourceMediaComponents.tsx',
    'src/resourceAuthMedia.tsx',
    'src/resourceHlsVideo.tsx',
    'src/resourceMediaViewer.tsx',
    'src/resourceLibraryPicker.tsx',
    'src/resourceLibraryPickerUi.tsx',
    'src/resourceCandidateAttachPanel.tsx',
    'src/resourceInteraction.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: false,
})
