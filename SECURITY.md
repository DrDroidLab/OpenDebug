# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

**Email:** [security@drdroid.io](mailto:security@drdroid.io)

Do **not** open a public GitHub issue for security vulnerabilities.

We will acknowledge your report within 48 hours and provide a timeline for a fix.

## Security Considerations

### Credentials

Droid Agent runs locally and mounts your host credentials (kubeconfig, AWS, Azure, GCP, GitHub, SSH). Be aware:

- **`config/mcp.json`** contains API keys for external services. It is gitignored by default.
- **`.env`** contains your AI provider API key. It is gitignored by default.
- **Never commit** `.env` or `config/mcp.json` to a public repository.
- The Docker container has `privileged` access removed by default, but host credential directories are mounted read-only.

### Tool Execution

The agent can execute shell commands on the host via the Docker socket and mounted credentials. Built-in safety measures:

- Dangerous command patterns (`rm -rf /`, `DROP TABLE`, `shutdown`, etc.) are blocked by default
- The `allowed_dangerous` array in `mcp.json` lets you explicitly override specific patterns
- All tool executions are logged to PostgreSQL for audit

### Network

- The web UI runs on `localhost:7433` — not exposed to the network by default
- Redis and PostgreSQL are internal Docker services with no external ports
- MCP server connections go through the container's network

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
