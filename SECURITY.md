# Security Policy

## Supported versions

Security fixes are handled on the default branch until the project publishes a formal version support policy.

## Reporting a vulnerability

Please do not open a public issue for suspected vulnerabilities.

Email the maintainers or use a private security advisory if the repository host supports it. Include:

- A description of the issue
- Reproduction steps or proof of concept
- Impact and affected configuration
- Suggested mitigation, if known

The project stores provider credentials encrypted with `ENCRYPTION_KEY`. Treat leaked databases, `.env` files, object storage credentials, and API provider keys as sensitive.

## Deployment guidance

- Set a unique `ENCRYPTION_KEY` with `openssl rand -hex 32`.
- The backend `/mcp` endpoint is currently removed. If you expose a desktop/local production runtime MCP-shaped endpoint, keep it bound to trusted local interfaces or protect it with an explicit authentication layer.
- Do not expose PostgreSQL or MinIO directly to the public internet.
- Rotate AI provider credentials if debug logs or environment files are exposed.
