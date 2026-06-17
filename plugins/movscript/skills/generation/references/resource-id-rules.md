# Resource ID Rules

Generation tools accept MovScript RawResource IDs.

Use RawResource IDs for:

- `input_resource_ids`
- `reference_resource_ids`
- candidate output `resource_id`
- selected content unit `resource_id`

Do not pass these as generation inputs:

- MCP resource URIs
- local filesystem paths
- external provider URLs
- remote search result URLs
- binary blobs in domain JSON

If the user gives a local file or an agent-created annotation image, upload it first with `system_resource_upload`.

If the user gives an external media result, import it into MovScript first. The imported RawResource ID is the generation-ready reference.

If the user asks to inspect media, use `system_resource_image_read` for images and `system_resource_video_extract_frames` for video frames. These tools return MCP image content for the agent to see; they do not create generation-ready RawResources.

If extracted or edited media must become an input, reference, candidate output, or reusable artifact, create a RawResource first:

- `system_resource_video_extract_frame_to_resource` for one reference frame.
- `system_resource_video_extract_frames_to_resources` for multiple reference frames.
- `system_resource_image_transform_to_resource` for crop, resize, fit, or image format conversion.
- `system_resource_video_contact_sheet_to_resource` for reusable overview images.
- `system_resource_video_trim_to_resource` for clip ranges.
- `system_resource_video_extract_audio_to_resource` for audio tracks or ranges.
- `system_resource_video_compose_to_resource` or `system_resource_video_concat_to_resource` only for resource-level drafts or neutral resource utilities. For product editing, create a `MediaEditingProject` and use `editing_*` tools through Electron `mediaPipeline`.

These resource/media operations are not business candidate operations. After creating the RawResource, write content-unit candidate or selection metadata separately when the output should affect domain state.
