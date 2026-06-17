# Editing Feature Structure

The editing workspace is split by responsibility so new timeline features do not accumulate inside the page component.

- `domain/`: pure editing rules and timeline math. Keep this layer independent from React state and Electron APIs.
- `application/`: browser adapters, persistence helpers, and editing commands that transform an `ElectronMediaPipelineEditingProject`.
- `media/`: local media URL resolution, media metadata helpers, and browser-side frame extraction.
- `components/`: presentational React components for panels, timeline rendering, previews, and asset thumbnails.

`EditingWorkspacePage.tsx` should stay focused on route loading, workspace state, persistence, top-level layout, and wiring event handlers to commands.

When adding editing behavior:

1. Put reusable project mutations in `application/editingCommands.ts`.
2. Put pure placement, track, asset, or timeline calculations in `domain/`.
3. Put media probing, seeking, frame extraction, or URL logic in `media/`.
4. Keep JSX for a distinct surface in `components/`.
