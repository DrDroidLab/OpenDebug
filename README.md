<p align="center">
  <img src="droid-agent/app/public/logo.png" alt="Droid Agent" width="64" height="64">
</p>

<h1 align="center">Droid Agent</h1>

<p align="center">
  <strong>Self-hosted AI agent for production incident management</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="droid-agent/README.md">Full Documentation</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="CONTRIBUTING.md">Contributing</a> &bull;
  <a href="LICENSE">MIT License</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License"></a>
  <a href="https://github.com/DrDroidLab/OpenDebug/issues"><img src="https://img.shields.io/github/issues/DrDroidLab/OpenDebug.svg" alt="GitHub Issues"></a>
  <a href="https://github.com/DrDroidLab/OpenDebug/stargazers"><img src="https://img.shields.io/github/stars/DrDroidLab/OpenDebug.svg" alt="GitHub Stars"></a>
</p>

---

Runs locally on your laptop as Docker containers. No login, no cloud sync, no telemetry. Paste errors, logs, alerts, or screenshots &mdash; the agent triages immediately, runs commands against your infrastructure, and walks you through root cause and fix.

Built by [Doctor Droid](https://drdroid.io).

## Features

- **Run commands, not just suggestions** &mdash; executes kubectl, aws, az, gcloud, gh, docker, terraform directly on your host
- **Skills system** &mdash; drop markdown files to teach the agent about your stack, runbooks, architecture
- **Persistent memory** &mdash; remembers your infrastructure, past incidents, and learned patterns
- **Infrastructure sync** &mdash; discovers Docker, Kubernetes (all contexts), AWS, Azure, GCP, GitHub, network ports
- **MCP integrations** &mdash; connect Datadog, Sentry, Grafana, PagerDuty, and 15+ other services
- **Learner worker** &mdash; periodically analyzes past conversations to extract reusable knowledge
- **Feedback loop** &mdash; thumbs up/down on responses calibrates the agent over time
- **Multi-provider** &mdash; OpenAI, Anthropic Claude, Azure AI Foundry (OpenAI & Kimi models)
- **Conversation history** &mdash; all conversations persisted with full tool call replay
- **Dark & light mode** &mdash; terminal-aesthetic web UI at localhost:7433

## Quick Start

```bash
git clone git@github.com:DrDroidLab/OpenDebug.git
cd OpenDebug/droid-agent

cp .env.example .env            # Add your AI provider API key
cp config/mcp.example.json config/mcp.json  # Enable MCP integrations (optional)

docker compose up -d --build
open http://localhost:7433
```

See the [full setup guide](droid-agent/README.md) for detailed configuration.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Docker Compose (your laptop)                    │
│                                                  │
│  ┌──────────────┐  ┌────────┐  ┌────────────┐  │
│  │ Droid Agent   │  │ Redis  │  │ PostgreSQL │  │
│  │ Web UI :7433  │  │ cache  │  │ persistent │  │
│  │ Agent loop    │  │        │  │ storage    │  │
│  │ Learner       │  │        │  │            │  │
│  │ MCP client    │  │        │  │            │  │
│  └──────────────┘  └────────┘  └────────────┘  │
│         │                                        │
│  Mounted: skills/ memory/ config/ ~/.kube/ etc.  │
└─────────────────────────────────────────────────┘
```

## Example Use Cases

- Paste a stack trace &rarr; agent identifies the failing service and checks its pods
- Upload a Grafana screenshot &rarr; "what caused this spike?"
- "Check if my prod pods are healthy" &rarr; agent runs kubectl across all clusters
- "Why is the API slow?" &rarr; agent checks logs, metrics, DB connections, recent deploys
- "Write a runbook for restarting payments" &rarr; agent creates a skill file

## Documentation

Full documentation lives in [`droid-agent/README.md`](droid-agent/README.md):

- [Configuration & Providers](droid-agent/README.md#configuration)
- [Web UI Guide](droid-agent/README.md#web-ui-guide)
- [CLI Usage](droid-agent/README.md#cli-usage)
- [Skills](droid-agent/README.md#skills)
- [Memory](droid-agent/README.md#memory)
- [MCP Server Integrations](droid-agent/README.md#tools--mcp-servers)
- [API Reference](droid-agent/README.md#api-reference)
- [Troubleshooting](droid-agent/README.md#troubleshooting)

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) &copy; [Doctor Droid](https://drdroid.io)
