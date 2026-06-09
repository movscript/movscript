import type { MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'


export function resourceMediaTools(): MCPTool[] {
  return [
    {
      name: 'movscript_resource_image_read',
      description: 'Read a MovScript image RawResource and return it as MCP image content for Codex vision. Use this when the agent needs to inspect the actual pixels of an image resource.',
      inputSchema: objectSchema({
        resource_id: { type: 'number', description: 'MovScript RawResource ID.' },
        resourceId: { type: 'number', description: 'Camel-case alias for resource_id.' },
        id: { type: 'number', description: 'Alias for resource_id.' },
        max_bytes: { type: 'number', description: 'Maximum image file size to return. Defaults to 8 MiB, hard-capped at 20 MiB.' },
        maxBytes: { type: 'number', description: 'Camel-case alias for max_bytes.' },
        mime_type: { type: 'string', description: 'Optional MIME type override when backend headers are missing.' },
        mimeType: { type: 'string', description: 'Camel-case alias for mime_type.' },

      }),
      outputSchema: objectSchema(
        {
          status: { type: 'string' },
          resource_id: { type: 'number' },
          mime_type: { type: 'string' },
          size_bytes: { type: 'number' },
          image_payload: { type: 'string' },
        },
        ['status', 'resource_id', 'mime_type', 'size_bytes', 'image_payload']
      ),
    },
    {
      name: 'movscript_resource_video_extract_frames',
      description: 'Download a MovScript video RawResource, extract representative or precise frames with ffmpeg, and return the frames as MCP image content for Codex vision. Supports overview, timestamps, range, and burst sampling. The original video is not sent to the model.',
      inputSchema: objectSchema({
        resource_id: { type: 'number', description: 'MovScript RawResource ID.' },
        resourceId: { type: 'number', description: 'Camel-case alias for resource_id.' },
        id: { type: 'number', description: 'Alias for resource_id.' },

        mode: { type: 'string', enum: ['overview', 'timestamps', 'range', 'burst'], description: 'Sampling mode. overview samples the full video, timestamps uses exact seconds, range samples between start/end, burst samples a window around center.' },

        count: { type: 'number', description: 'Overview frame count. Defaults to 4.' },
        frame_count: { type: 'number', description: 'Alias for count.' },
        max_frames: { type: 'number', description: 'Maximum frames returned for any mode. Defaults to 12, hard-capped at 24.' },
        maxFrames: { type: 'number', description: 'Camel-case alias for max_frames.' },

        max_video_bytes: { type: 'number', description: 'Maximum source video file size to download for extraction. Defaults to 200 MiB, hard-capped at 1 GiB.' },
        maxVideoBytes: { type: 'number', description: 'Camel-case alias for max_video_bytes.' },

        timestamps_sec: { type: 'array', items: { type: 'number' }, description: 'Optional exact timestamps in seconds.' },
        timestampsSec: { type: 'array', items: { type: 'number' }, description: 'Camel-case alias for timestamps_sec.' },

        start_sec: { type: 'number', description: 'Start timestamp for evenly-spaced sampling when timestamps_sec is omitted.' },
        startSec: { type: 'number', description: 'Camel-case alias for start_sec.' },
        end_sec: { type: 'number', description: 'End timestamp for range sampling.' },
        endSec: { type: 'number', description: 'Camel-case alias for end_sec.' },
        center_sec: { type: 'number', description: 'Center timestamp for burst sampling.' },
        centerSec: { type: 'number', description: 'Camel-case alias for center_sec.' },
        window_sec: { type: 'number', description: 'Window length in seconds for burst sampling. Defaults to 2.' },
        windowSec: { type: 'number', description: 'Camel-case alias for window_sec.' },
        fps: { type: 'number', description: 'Range/burst sampling frequency in frames per second. Defaults to 2, capped at 6.' },

        interval_sec: { type: 'number', description: 'Sampling interval in seconds when timestamps_sec is omitted. Defaults to 3.' },
        intervalSec: { type: 'number', description: 'Camel-case alias for interval_sec.' },

        max_width: { type: 'number', description: 'Maximum output frame width. Defaults to 960, hard-capped at 1920.' },
        maxWidth: { type: 'number', description: 'Camel-case alias for max_width.' },

        image_format: { type: 'string', description: 'Output frame format: jpeg or png. Defaults to jpeg.' },
        imageFormat: { type: 'string', description: 'Camel-case alias for image_format.' },
      }),
      outputSchema: objectSchema(
        {
          status: { type: 'string' },
          resource_id: { type: 'number' },
          source_mime_type: { type: 'string' },
          source_size_bytes: { type: 'number' },
          max_video_bytes: { type: 'number' },
          video: { type: 'object', additionalProperties: true },
          sampling: { type: 'object', additionalProperties: true },
          max_width: { type: 'number' },
          frames: { type: 'array', items: { type: 'object', additionalProperties: true } },
          warnings: { type: 'array', items: { type: 'string' } },
          message: { type: 'string' },
        },
        ['status', 'resource_id', 'sampling', 'frames', 'message']
      ),
    },
    {
      name: 'movscript_resource_image_annotate',
      description: 'Create a simple agent-authored visual guidance image by overlaying structured annotations on a MovScript image resource, data URL, or local artifact. Outputs an SVG artifact plus MCP image content for review. Upload artifact_path with movscript_resource_upload before using it in generation.',
      inputSchema: objectSchema({
        resource_id: { type: 'number', description: 'Optional MovScript image RawResource ID used as the annotation background.' },
        resourceId: { type: 'number', description: 'Camel-case alias for resource_id.' },
        id: { type: 'number', description: 'Alias for resource_id.' },
        data_url: { type: 'string', description: 'Optional image data URL used as the annotation background.' },
        dataUrl: { type: 'string', description: 'Camel-case alias for data_url.' },
        local_path: { type: 'string', description: 'Optional local image path used as the annotation background.' },
        localPath: { type: 'string', description: 'Camel-case alias for local_path.' },
        artifact_path: { type: 'string', description: 'Alias for local_path, useful for annotating a previous agent artifact.' },
        artifactPath: { type: 'string', description: 'Camel-case alias for artifact_path.' },
        mime_type: { type: 'string', description: 'Optional source image MIME type override.' },
        mimeType: { type: 'string', description: 'Camel-case alias for mime_type.' },
        max_source_bytes: { type: 'number', description: 'Maximum source image size to read. Defaults to 8 MiB, hard-capped at 20 MiB.' },
        maxSourceBytes: { type: 'number', description: 'Camel-case alias for max_source_bytes.' },
        width: { type: 'number', description: 'SVG coordinate width. Defaults to source image width when readable.' },
        height: { type: 'number', description: 'SVG coordinate height. Defaults to source image height when readable.' },
        title: { type: 'string', description: 'Artifact title used in metadata and default filename.' },
        note: { type: 'string', description: 'Optional note rendered at the bottom of the annotation image.' },
        annotations: {
          type: 'array',
          description: 'Structured annotation shapes. Supported type values: rect, circle, line, arrow, text, highlight.',
          items: { type: 'object', additionalProperties: true },
        },
        shapes: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Alias for annotations.' },
        output_path: { type: 'string', description: 'Optional absolute output path for the generated SVG artifact.' },
        outputPath: { type: 'string', description: 'Camel-case alias for output_path.' },
        workspace_path: { type: 'string', description: 'Optional output path under the MovScript .movscript workspace root.' },
        workspacePath: { type: 'string', description: 'Camel-case alias for workspace_path.' },
        workspaceDir: { type: 'string', description: 'Optional MovScript workspace root directory. Defaults to the desktop workspace root.' },
      }),
      outputSchema: objectSchema(
        {
          status: { type: 'string' },
          artifact_path: { type: 'string' },
          mime_type: { type: 'string' },
          size_bytes: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          source: { type: 'object', additionalProperties: true },
          annotation_count: { type: 'number' },
          annotations: { type: 'array', items: { type: 'object', additionalProperties: true } },
          image_payload: { type: 'string' },
          message: { type: 'string' },
        },
        ['status', 'artifact_path', 'mime_type', 'size_bytes', 'annotation_count', 'image_payload']
      ),
    },
    {
      name: 'movscript_resource_upload',
      description: 'Upload an agent-created image artifact to the MovScript RawResource library. Accepts artifact/local paths, .movscript workspace paths, data URLs, or base64 image bytes. Use the returned resource_id in generation input_resource_ids/reference_resource_ids.',
      inputSchema: objectSchema({
        artifact_path: { type: 'string', description: 'Local artifact path returned by movscript_resource_image_annotate or another agent tool.' },
        artifactPath: { type: 'string', description: 'Camel-case alias for artifact_path.' },
        local_path: { type: 'string', description: 'Local file path to upload.' },
        localPath: { type: 'string', description: 'Camel-case alias for local_path.' },
        path: { type: 'string', description: 'Alias for local_path.' },
        workspace_path: { type: 'string', description: 'Path under the MovScript .movscript workspace root.' },
        workspacePath: { type: 'string', description: 'Camel-case alias for workspace_path.' },
        workspaceDir: { type: 'string', description: 'Optional MovScript workspace root directory. Defaults to the desktop workspace root.' },
        data_url: { type: 'string', description: 'Image data URL to upload.' },
        dataUrl: { type: 'string', description: 'Camel-case alias for data_url.' },
        base64: { type: 'string', description: 'Base64 image payload without the data URL prefix.' },
        filename: { type: 'string', description: 'Resource filename. Defaults to the local file name or a generated guidance filename.' },
        name: { type: 'string', description: 'Alias for filename.' },
        mime_type: { type: 'string', description: 'Upload MIME type. Defaults from filename or image/png.' },
        mimeType: { type: 'string', description: 'Camel-case alias for mime_type.' },
        folder_id: { type: 'string', description: 'Optional resource library folder ID.' },
        folderId: { type: 'string', description: 'Camel-case alias for folder_id.' },
        max_bytes: { type: 'number', description: 'Maximum upload input size. Defaults to 20 MiB, hard-capped at 100 MiB.' },
        maxBytes: { type: 'number', description: 'Camel-case alias for max_bytes.' },
      }),
      outputSchema: objectSchema(
        {
          status: { type: 'string' },
          resource_id: { type: 'number' },
          resource: { type: 'object', additionalProperties: true },
          source: { type: 'object', additionalProperties: true },
          filename: { type: 'string' },
          mime_type: { type: 'string' },
          size_bytes: { type: 'number' },
          message: { type: 'string' },
        },
        ['status', 'resource', 'filename', 'mime_type', 'size_bytes', 'message']
      ),
    },
  ]
}
