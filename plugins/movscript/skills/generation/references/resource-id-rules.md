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

If the user asks to inspect media, use `system_resource_image_read` for images and `system_resource_video_extract_frames` for video frames.
