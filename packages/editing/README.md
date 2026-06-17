# @movscript/editing

MovScript media editing project schema and Electron-oriented timeline services.

The package's primary contract is `MediaEditingProject`: a MovScript-owned
editing project made of project settings, asset registry, tracks, clips, and
timeline commands. New product integrations should use `MediaEditingProject`,
`MediaTimelineRecipe`, and the `editing_*` MCP tools so editing stays in the
Electron workspace and the backend remains focused on AI generation jobs.

No historical third-party timeline implementation is kept in this package.
The package does not expose compatibility subpaths or compile legacy timeline
helpers into `dist`; new UI, MCP tools, and agent skills must use MovScript's
own `MediaEditingProject` model.
