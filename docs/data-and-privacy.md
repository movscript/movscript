# Data and Privacy

[简体中文](data-and-privacy.zh-CN.md)

Movscript is designed as a local-first desktop production workspace. This page explains where data is stored and which boundaries matter before using the project with real scripts, media, or provider credentials.

## Local Project Data

In local filesystem mode, Movscript stores runtime data under `MOVSCRIPT_DATA_DIR`, commonly:

```text
$HOME/.movscript
```

Typical local data includes:

- SQLite database files.
- Uploaded or generated media resources.
- Runtime metadata used by the desktop app and backend.

In PostgreSQL/MinIO mode, relational state is stored in PostgreSQL and media files are stored in MinIO or another S3-compatible backend.

## Provider Credentials

AI provider credentials are configured through the admin UI and stored encrypted with `ENCRYPTION_KEY`.

Treat these as sensitive:

- `apps/backend/.env`
- Database backups
- Object-storage credentials
- AI provider keys
- Debug logs that may include request metadata

Rotate provider keys if any of these files or logs are exposed.

## AI Provider Calls

When AI generation features are enabled, prompts, media references, or uploaded assets may be sent to the configured provider depending on the workflow and model capability. Review each provider's own data-use policy before using production or confidential content.

Use dry-run provider behavior for workflow testing when you do not want to send content to an external provider.

## Object Storage

MinIO/S3-compatible storage may contain user-uploaded media, generated images, generated videos, and intermediate workflow assets. Do not expose buckets publicly unless the deployment explicitly requires public asset delivery and access policy has been reviewed.

For simple single-user local use, filesystem storage keeps media on the workstation.

## Local Agent Data

The local agent may store threads, runs, memory, tool metadata, and generated artifacts in local runtime files. Treat these files as project data and avoid sharing them when they contain private scripts, prompts, or media references.

## Before Sharing Logs or Issues

Before posting logs, screenshots, reproduction projects, or issue attachments:

- Remove provider keys and tokens.
- Remove private scripts, prompts, and media URLs.
- Remove local filesystem paths if they reveal sensitive project names or user information.
- Mention whether the issue was reproduced with dry-run providers or real provider calls.
