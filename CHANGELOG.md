# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-03-16

### Added
- Initial release of Droid Agent
- Chat interface with SSE streaming and real-time tool execution display
- Infrastructure Sync driven by customizable skill file
- 7 pre-seeded skills: Kubernetes, Docker, General Debugging, Infra Sync, Kubernetes Incidents, Error Rate, Performance
- Multi-provider AI support: OpenAI, Anthropic Claude, Azure AI Foundry (OpenAI & Kimi)
- MCP (Model Context Protocol) client supporting stdio and HTTP transports
- 18 pre-configured MCP server integrations (Datadog, Sentry, Grafana, PagerDuty, etc.)
- Host CLI access: kubectl, aws, az, gcloud, gh, docker, terraform, helm, jq, curl, git, ssh
- Persistent memory system with proactive updates
- Conversation history with full tool call replay
- Thumbs up/down feedback stored in PostgreSQL
- Learner worker for periodic knowledge extraction from past conversations
- Dark and light mode UI
- PostgreSQL for incidents, conversations, feedback, learner state
- Redis for conversation message cache
