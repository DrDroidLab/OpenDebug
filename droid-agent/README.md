# Droid Agent

A self-hosted AI agent for developers managing production incidents. Runs locally on your laptop as Docker containers. No login, no cloud sync — everything stays on your machine.

Paste errors, logs, alerts, or screenshots. The agent triages immediately: identifies what's wrong, runs commands against your infrastructure, checks Kubernetes pods, queries AWS/Azure/GCP, and walks you through root cause and fix.

Built by [Doctor Droid](https://drdroid.io).

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
  - [AI Provider Setup](#ai-provider-setup)
  - [Environment Variables](#environment-variables)
- [Web UI Guide](#web-ui-guide)
  - [Chat](#chat)
  - [Infrastructure Sync](#infrastructure-sync)
  - [Skills Browser](#skills-browser)
  - [Memory Browser](#memory-browser)
  - [Tools Browser](#tools-browser)
  - [Conversation History](#conversation-history)
  - [Feedback](#feedback)
- [CLI Usage](#cli-usage)
- [Skills](#skills)
  - [Built-in Skills](#built-in-skills)
  - [Adding Custom Skills](#adding-custom-skills)
  - [Infra Sync Skill](#infra-sync-skill)
- [Memory](#memory)
  - [Structure](#memory-structure)
  - [Editing Memory](#editing-memory)
  - [Learned Knowledge](#learned-knowledge)
- [Tools & MCP Servers](#tools--mcp-servers)
  - [Built-in Tools](#built-in-tools)
  - [Adding MCP Servers](#adding-mcp-servers)
  - [Available MCP Server Integrations](#available-mcp-server-integrations)
- [Learner Worker](#learner-worker)
- [API Reference](#api-reference)
- [Host CLI Access](#host-cli-access)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## Prerequisites

- **Docker** and **Docker Compose** (Docker Desktop on Mac/Windows, or Docker Engine on Linux)
- An API key from one of: Azure AI Foundry, OpenAI, or Anthropic
- (Optional) CLI tools installed on your host: `kubectl`, `aws`, `az`, `gcloud`, `gh`, `docker`, `terraform`, `helm`

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/drdroid-io/droid-agent.git
cd droid-agent

# 2. Create your environment file
cp .env.example .env

# 3. Edit .env — set your AI provider and API key (see Configuration below)
#    At minimum, set AI_PROVIDER and the relevant API key

# 4. Create your MCP config (tools + external service integrations)
cp config/mcp.example.json config/mcp.json

# 5. (Optional) Edit config/mcp.json — enable MCP servers you want to use
#    Set "enabled": true and fill in API keys for Datadog, Sentry, etc.

# 6. Build and start all containers
docker compose up -d --build

# 7. Open the web UI
open http://localhost:7433

# 8. (Optional) Run infrastructure sync to pre-load your stack context
docker compose exec droid-agent node sync.js
```

To stop:
```bash
docker compose down
```

To stop and wipe all data (Redis, PostgreSQL, volumes):
```bash
docker compose down -v
```

To rebuild from scratch:
```bash
./rebuild.sh
```

---

## Architecture

Three Docker containers, all local:

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Laptop                              │
│                                                              │
│  ┌──────────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │   Droid Agent     │  │    Redis     │  │  PostgreSQL   │  │
│  │   (Node.js)       │  │  (conv.     │  │  (incidents,  │  │
│  │                   │  │   history)   │  │   feedback,   │  │
│  │  ┌─────────────┐ │  │             │  │   learner)    │  │
│  │  │ Web UI      │ │  │             │  │               │  │
│  │  │ :7433       │ │  │             │  │               │  │
│  │  └─────────────┘ │  │             │  │               │  │
│  │  ┌─────────────┐ │  │             │  │               │  │
│  │  │ Agent Loop  │ │  │             │  │               │  │
│  │  │ + Tools     │ │  │             │  │               │  │
│  │  └─────────────┘ │  │             │  │               │  │
│  │  ┌─────────────┐ │  │             │  │               │  │
│  │  │ Learner     │ │  │             │  │               │  │
│  │  │ Worker      │ │  │             │  │               │  │
│  │  └─────────────┘ │  │             │  │               │  │
│  └──────────────────┘  └─────────────┘  └───────────────┘  │
│           │                                                  │
│           ▼ (mounted volumes)                                │
│  ./skills/  ./memory/  ./config/  ~/.kube/  ~/.aws/ etc.    │
└─────────────────────────────────────────────────────────────┘
```

| Component | Purpose | Persistence |
|-----------|---------|-------------|
| **Droid Agent** | Express server, agent loop, web UI, learner worker | Stateless (code only) |
| **Redis** | Conversation message cache (24h TTL) | Docker volume `redis_data` |
| **PostgreSQL** | Incidents, tool audit log, conversations, feedback, learner state | Docker volume `pg_data` |
| **./skills/** | Domain knowledge (markdown files) | Host filesystem (volume mount) |
| **./memory/** | Agent's persistent memory | Host filesystem (volume mount) |
| **./config/** | Tool definitions, MCP server config | Host filesystem (volume mount) |

---

## Configuration

### AI Provider Setup

Droid Agent supports four AI providers. Set `AI_PROVIDER` in `.env` and fill in the corresponding keys.

#### Azure AI Foundry (OpenAI models)
```env
AI_PROVIDER=azure-openai
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-4.1
AZURE_API_VERSION=2025-04-01-preview
```

#### Azure AI Foundry (Kimi models)
```env
AI_PROVIDER=azure-kimi
AZURE_KIMI_ENDPOINT=https://your-resource.services.ai.azure.com
AZURE_KIMI_API_KEY=your-api-key
AZURE_KIMI_DEPLOYMENT=kimi-k2
AZURE_API_VERSION=2025-04-01-preview
```

#### Direct OpenAI
```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1
```

#### Anthropic Claude
```env
AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-20250514
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AI_PROVIDER` | Provider: `openai`, `claude`, `azure-openai`, `azure-kimi` | `azure-openai` |
| `AGENT_NAME` | Display name in UI and prompts | `Droid Agent` |
| `PORT` | Web UI port | `7433` |
| `LEARNER_ENABLED` | Enable periodic learner worker | `true` |
| `LEARNER_INTERVAL_MS` | Learner run interval (milliseconds) | `3600000` (1 hour) |
| `LEARNER_MIN_MESSAGES` | Min messages in a conversation before learner analyzes it | `4` |

Redis and PostgreSQL connection strings are set automatically by docker-compose — no need to configure them.

---

## Web UI Guide

Open **http://localhost:7433** after starting the containers.

### Chat

The main panel. Type or paste:
- Error messages or stack traces
- Log snippets
- Alert notifications
- Descriptions like "check if my prod pods are healthy"

The agent will:
1. Run commands against your infrastructure (kubectl, aws, docker, etc.)
2. Show you the output inline with collapsible tool call blocks
3. Analyze the results and suggest next steps
4. Ask before saving anything to memory

**Keyboard shortcuts:**
- `Enter` — send message
- `Shift+Enter` — new line in message
- `Ctrl+L` — start new conversation
- `Escape` — close panels/modals

**Image upload:** Click the paperclip icon to attach up to 4 screenshots (Grafana dashboards, error pages, metric graphs). The agent can analyze images.

### Infrastructure Sync

Click **"Run Infrastructure Sync"** in the sidebar, or run via CLI:

```bash
docker compose exec droid-agent node sync.js
```

The sync agent discovers your infrastructure by running commands and saving structured summaries to `memory/infra/`. It follows the `skills/infra-sync.md` skill file — edit that file to customize what gets discovered.

What it discovers:
- Docker containers, networks, volumes
- Kubernetes clusters (all contexts), namespaces, deployments, services, pods
- AWS accounts and profiles, EC2, ECS, RDS, Lambda, S3
- Azure subscriptions, AKS, VMs, web apps
- Google Cloud projects, GCE, GKE, Cloud Run
- GitHub authentication and repositories
- Listening network ports
- Local project directories

The sync panel shows real-time streaming output of every command executed and every file written.

### Skills Browser

Click **Skills** in the sidebar to browse all loaded skills. Each skill is a markdown file in `./skills/`. Click a skill to expand and read its content. Skills are injected into every agent conversation as system context.

### Memory Browser

Click **Memory** in the sidebar to browse all memory files. Each file shows its path, size, and last modified date. Click to expand and read content. Click **edit** to modify a file inline — changes are saved immediately.

Memory files are organized by directory:
- `context.md` — your permanent notes
- `infra/` — auto-populated by sync
- `incidents/` — agent-written investigation summaries
- `learned/` — auto-generated by the learner worker

### Tools Browser

Click **Tools** in the sidebar to see all configured tools. Shows the tool name, executor type, timeout, and full JSON configuration.

### Conversation History

The sidebar shows your 5 most recent conversations. Click any to reload it with full tool call details (command + output). Click **"show all N conversations"** to open the full history browser.

Each past conversation preserves:
- All user messages
- All agent responses with markdown rendering
- Tool call blocks with the exact command and output
- Memory write notifications
- Thumbs up/down feedback

Click **"+ new chat"** to start a fresh conversation.

### Feedback

Every agent response has thumbs up/down buttons. Click to record whether the response was helpful:

- **Thumbs up** — marks the response as validated. The agent will favor similar approaches in future conversations.
- **Thumbs down** — marks the response as unhelpful. The agent will try different approaches.

Feedback is stored in PostgreSQL and included in the agent's system prompt as context for future conversations.

---

## CLI Usage

All commands assume you're in the `droid-agent` directory.

### Start / Stop / Rebuild

```bash
# Start all containers (detached)
docker compose up -d

# Start with rebuild
docker compose up -d --build

# Stop containers (keeps data)
docker compose down

# Stop and delete all data
docker compose down -v

# Full rebuild (stop, remove image, rebuild, start)
./rebuild.sh

# View logs
docker compose logs -f droid-agent
docker compose logs -f droid-agent --tail=50

# Restart just the agent (after editing code)
docker compose up -d --build droid-agent
```

### Infrastructure Sync (CLI)

```bash
# Run sync interactively (shows progress in terminal)
docker compose exec droid-agent node sync.js

# Run sync in the background
docker compose exec -d devagent node sync.js
```

### Shell Access

```bash
# Shell into the agent container
docker compose exec droid-agent sh

# Test a command as the agent would run it
docker compose exec droid-agent kubectl config get-contexts
docker compose exec droid-agent aws sts get-caller-identity
docker compose exec droid-agent az account show
docker compose exec droid-agent gcloud config list
docker compose exec droid-agent gh auth status
docker compose exec droid-agent docker ps
```

### Trigger Learner Manually

```bash
curl -X POST http://localhost:7433/api/learner/trigger | python3 -m json.tool
```

### Health Check

```bash
curl http://localhost:7433/api/health | python3 -m json.tool
```

Example output:
```json
{
  "status": "ok",
  "model": "gpt-4.1",
  "provider": "Azure AI Foundry (OpenAI)",
  "skillsLoaded": 4,
  "memoryFiles": 12,
  "toolsAvailable": 4,
  "mcpServersEnabled": 0,
  "mcpToolsAvailable": 0,
  "memoryTotalBytes": 30783,
  "redis": "connected",
  "postgres": "connected"
}
```

### Chat via CLI (curl)

```bash
# Send a message (returns SSE stream)
curl -N -X POST http://localhost:7433/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"list all pods in production","conversationId":"cli-test"}'

# List conversations
curl http://localhost:7433/api/conversations | python3 -m json.tool

# Get messages for a conversation
curl http://localhost:7433/api/conversations/cli-test/messages | python3 -m json.tool

# List recent incidents
curl http://localhost:7433/api/incidents | python3 -m json.tool

# Check learner status
curl http://localhost:7433/api/learner/status | python3 -m json.tool
```

---

## Skills

Skills are markdown files in `./skills/` that teach the agent domain-specific knowledge. They're injected into the system prompt on every message — no restart needed.

### Built-in Skills

| Skill | File | Description |
|-------|------|-------------|
| **Kubernetes** | `skills/kubernetes.md` | Pod logs, describe, events, common failure states (OOMKilled, CrashLoopBackOff), rollouts, HPA |
| **Docker** | `skills/docker.md` | Container logs, inspect, stats, exec, compose, common issues (port conflicts, volumes) |
| **General Debugging** | `skills/general-debugging.md` | Incident triage framework, stack trace reading, 5xx/4xx triage, memory leaks, N+1 queries, latency spikes |
| **Infra Sync** | `skills/infra-sync.md` | What to discover during infrastructure sync |

### Adding Custom Skills

Create a `.md` file in `./skills/`:

```bash
# Example: Add a runbook for your payments service
cat > ./skills/payments-runbook.md << 'EOF'
# Payments Service Runbook

## Service Overview
- Runs in Kubernetes namespace: payments
- Database: PostgreSQL on RDS (payments-db)
- Dependencies: Stripe API, Redis cache, notification service

## Common Issues

### Stuck payments
1. Check the payments queue: `kubectl exec -it payments-worker -- rails console`
2. Look for locked transactions in the DB
3. Check Stripe webhook delivery status

### High latency
1. Check Redis connection pool: `kubectl top pods -n payments`
2. Check RDS slow query log
3. Check Stripe API response times in Datadog

## Restart Procedure
1. `kubectl rollout restart deployment/payments-api -n payments`
2. Wait for rollout: `kubectl rollout status deployment/payments-api -n payments`
3. Verify health: `curl https://payments.internal/health`
EOF
```

The agent will immediately have access to this knowledge — no restart needed.

### Infra Sync Skill

`skills/infra-sync.md` controls what the infrastructure sync discovers. It's a guide, not a script — the agent reads it and decides what commands to run. You can:

- Add sections for services specific to your stack
- Remove sections you don't care about
- Add hints about where things are deployed
- Include specific queries you want the agent to run

Example customization:
```markdown
### Our Microservices
Check our main services running in the `production` namespace on the `prod-east` kubectl context.
List all deployments with their replica counts and images.
Check for any pods not in Running state.
```

---

## Memory

### Memory Structure

```
memory/
├── context.md              # Your permanent notes (edit this!)
├── infra/                   # Auto-populated by sync
│   ├── docker.md
│   ├── kubernetes.md
│   ├── aws.md
│   ├── azure.md
│   ├── gcloud.md
│   ├── github.md
│   ├── network.md
│   ├── projects.md
│   └── summary.md
├── incidents/               # Agent writes investigation summaries here
│   └── 2026-03-15-api-latency.md
└── learned/                 # Learner worker writes patterns here
    ├── patterns.md
    └── investigation-summaries.md
```

### Editing Memory

Three ways:

1. **Web UI** — Click "Memory" in sidebar, click **edit** on any file, modify, click **Save**.

2. **Host filesystem** — Edit files directly:
   ```bash
   vim ./memory/context.md
   ```

3. **API**:
   ```bash
   curl -X POST http://localhost:7433/api/memory/write \
     -H 'Content-Type: application/json' \
     -d '{
       "path": "context.md",
       "content": "# My Stack\n\n## Services\n- api: port 8080\n- db: postgres on 5432"
     }'
   ```

### Context File

`memory/context.md` is your permanent notes file. The agent reads it on every message. Use it for:

```markdown
# My Stack

## Services
- **API Gateway**: runs on port 8080, deployed to `prod` k8s context
- **Payment Service**: port 3001, depends on Stripe and Redis
- **Database**: PostgreSQL 15 on AWS RDS, instance: prod-db-main

## On-Call
- PagerDuty escalation: Backend > SRE > VP Eng
- Slack channel: #incidents
- Runbook wiki: https://wiki.internal/runbooks

## Common Issues
- API latency usually caused by N+1 queries in the orders endpoint
- OOM on worker pods: increase memory limit to 2Gi
```

### Learned Knowledge

The learner worker periodically analyzes past conversations and writes:
- `memory/learned/patterns.md` — investigation patterns and useful commands
- `memory/learned/investigation-summaries.md` — summaries of past debugging sessions

These are automatically included in the agent's context.

---

## Tools & MCP Servers

### Built-in Tools

| Tool | Description |
|------|-------------|
| `run_shell` | Execute any shell command on the host machine. All host CLIs (kubectl, aws, az, etc.) and credentials are available. |
| `fetch_url` | HTTP GET a URL. Use for health endpoints, metrics APIs. |
| `read_file` | Read a file from the host filesystem. |
| `write_memory` | Save markdown to the agent's memory. |

Configured in `config/mcp.json` under the `tools` array.

**Safety:** Dangerous commands (`rm -rf /`, `DROP TABLE`, `shutdown`, etc.) are blocked by default. To allow a specific pattern, add the regex string to `allowed_dangerous` in `mcp.json`.

### MCP Config File

The MCP configuration lives in `config/mcp.json`. This file is **gitignored** because it contains your service credentials. An example template is provided:

```bash
# First-time setup: copy the example
cp config/mcp.example.json config/mcp.json

# Then edit to add your credentials
vim config/mcp.json
```

The file has two sections:

1. **`tools`** — Built-in tools (run_shell, fetch_url, read_file, write_memory). These work out of the box.
2. **`mcpServers`** — External MCP server integrations. All disabled by default — enable the ones you use.

### Adding MCP Servers

MCP (Model Context Protocol) servers give the agent access to external services like Datadog, Sentry, Grafana, PagerDuty, etc. The agent auto-discovers all tools from each enabled server on startup.

**Two types of MCP servers are supported:**

#### stdio servers (most common)
The agent spawns the MCP server as a child process and communicates via JSON-RPC over stdio:

```json
"datadog": {
  "enabled": true,
  "command": "npx",
  "args": ["-y", "@anthropic/mcp-server-datadog"],
  "env": {
    "DATADOG_API_KEY": "your-actual-api-key",
    "DATADOG_APP_KEY": "your-actual-app-key"
  }
}
```

#### HTTP servers
Some services expose MCP over HTTP instead of stdio:

```json
"render": {
  "enabled": true,
  "type": "http",
  "url": "https://mcp.render.com/mcp",
  "headers": {
    "Authorization": "Bearer your-render-api-key"
  }
}
```

**To enable a server:**
1. Open `config/mcp.json`
2. Find the server entry (e.g. `"datadog"`)
3. Set `"enabled": true`
4. Fill in `env` values with your real API keys
5. Restart: `docker compose restart droid-agent`

**To verify a server is connected:**
```bash
# Check health endpoint
curl -s http://localhost:7433/api/health | python3 -m json.tool

# Look for mcpServersEnabled > 0 and mcpToolsAvailable > 0

# Check container logs for MCP initialization
docker compose logs droid-agent | grep mcp
```

**How it works at runtime:**
- On startup, the agent spawns each enabled MCP server process
- Performs the MCP handshake (initialize → list tools)
- All discovered tools are injected into the agent's system prompt
- When the agent calls an MCP tool, the request is routed to the correct server
- If a server fails to start, the agent continues without it

### Example: Enabling Multiple Integrations

Here's what your `config/mcp.json` might look like with Datadog, Sentry, and GitHub enabled:

```json
{
  "tools": [
    { "name": "run_shell", "description": "Run a shell command...", "executor": "shell", "timeout": 60 },
    { "name": "fetch_url", "description": "HTTP GET a URL...", "executor": "http_get", "timeout": 10 },
    { "name": "read_file", "description": "Read a file...", "executor": "read_file" },
    { "name": "write_memory", "description": "Save to memory...", "executor": "memory_write" }
  ],
  "allowed_dangerous": [],
  "mcpServers": {
    "datadog": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-datadog"],
      "env": {
        "DATADOG_API_KEY": "abc123...",
        "DATADOG_APP_KEY": "def456..."
      }
    },
    "sentry": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@sentry/mcp-server"],
      "env": {
        "SENTRY_AUTH_TOKEN": "sntrys_..."
      }
    },
    "github": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
      }
    }
  }
}
```

After restart, the agent can:
- Query Datadog metrics and logs
- Search Sentry issues and view stack traces
- List GitHub repos, PRs, and issues

All through natural conversation — just ask "show me the latest Sentry errors for the payments service."

### Available MCP Server Integrations

| Service | Package | Category |
|---------|---------|----------|
| **Datadog** | `@anthropic/mcp-server-datadog` | Monitoring / APM |
| **Sentry** | `@sentry/mcp-server` | Error Tracking |
| **Grafana** | `@grafana/mcp-server` | Dashboards |
| **New Relic** | `newrelic-mcp-server` | Monitoring / APM |
| **PagerDuty** | `@pagerduty/mcp-server` | Incident Management |
| **Elasticsearch** | `mcp-server-elasticsearch` | Logs / Search |
| **Cloudflare** | `@cloudflare/mcp-server-cloudflare` | Infrastructure |
| **Supabase** | `@supabase/mcp-server-supabase` | Backend / DB |
| **Vercel** | `@vercel/mcp-server` | Deployment |
| **Render** | HTTP: `mcp.render.com/mcp` | Deployment |
| **PostHog** | `posthog-mcp-server` | Product Analytics |
| **Linear** | `mcp-linear` | Issue Tracking |
| **GitHub** | `@modelcontextprotocol/server-github` | Source Control |
| **Slack** | `@modelcontextprotocol/server-slack` | Communication |
| **Kubernetes** | `@modelcontextprotocol/server-kubernetes` | Infrastructure |
| **PostgreSQL** | `@modelcontextprotocol/server-postgres` | Database |
| **Brave Search** | `@modelcontextprotocol/server-brave-search` | Web Search |
| **Filesystem** | `@modelcontextprotocol/server-filesystem` | File Access |

---

## Learner Worker

A background process that runs every hour (configurable) and learns from past conversations.

**What it does:**
1. Reads conversations from PostgreSQL that haven't been analyzed yet
2. Sends transcripts to the AI model for pattern extraction
3. Identifies: issue types, investigation patterns, root causes, resolutions
4. Merges findings into `memory/learned/patterns.md` and `memory/learned/investigation-summaries.md`
5. These files are automatically included in future agent conversations

**Configuration:**
```env
LEARNER_ENABLED=true           # Set to false to disable
LEARNER_INTERVAL_MS=3600000    # Run every hour (default)
LEARNER_MIN_MESSAGES=4         # Minimum messages before analyzing a conversation
```

**Manual trigger:**
```bash
curl -X POST http://localhost:7433/api/learner/trigger | python3 -m json.tool
```

**Check last run:**
```bash
curl http://localhost:7433/api/learner/status | python3 -m json.tool
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send a message (returns SSE stream). Body: `{message, images?, conversationId}` |
| `GET` | `/api/health` | System health (model, provider, skills, memory, redis, postgres, MCP) |
| `POST` | `/api/sync` | Run infrastructure sync (returns SSE stream) |
| `GET` | `/api/skills` | List all loaded skills |
| `GET` | `/api/memory` | List all memory files with content |
| `POST` | `/api/memory/write` | Write a memory file. Body: `{path, content}` |
| `GET` | `/api/tools` | List configured tools from mcp.json |
| `GET` | `/api/conversations` | List recent conversations. Query: `?limit=20` |
| `GET` | `/api/conversations/:id/messages` | Get all messages for a conversation (includes feedback) |
| `POST` | `/api/feedback` | Submit feedback. Body: `{messageId, conversationId, feedback: 'up'|'down'}` |
| `GET` | `/api/incidents` | List incidents from PostgreSQL. Query: `?limit=50` |
| `GET` | `/api/tool-executions` | Tool audit log. Query: `?conversationId=xxx&limit=100` |
| `POST` | `/api/learner/trigger` | Manually trigger a learner cycle |
| `GET` | `/api/learner/status` | Get last learner run info |

---

## Host CLI Access

The agent container has these CLIs pre-installed:
`kubectl`, `aws`, `az`, `gcloud`, `gh`, `docker`, `jq`, `curl`, `git`, `ssh`, `wget`

Host credentials are mounted read-only via docker-compose volumes:

| Host Path | Container Path | Purpose |
|-----------|---------------|---------|
| `~/.kube` | `/root/.kube` | Kubernetes contexts and clusters |
| `~/.aws` | `/root/.aws` | AWS credentials and config |
| `~/.azure` | `/root/.azure` | Azure CLI auth tokens |
| `~/.config/gcloud` | `/root/.config/gcloud` | GCP credentials |
| `~/.config/gh` | `/root/.config/gh` | GitHub CLI auth |
| `~/.docker` | `/root/.docker` | Docker registry auth |
| `~/.ssh` | `/root/.ssh` | SSH keys |
| `/var/run/docker.sock` | `/var/run/docker.sock` | Docker daemon socket |

If a credential directory doesn't exist on your host, comment out that line in `docker-compose.yml` to avoid startup errors.

---

## Troubleshooting

### Container won't start — credential mount missing

```
Error: Mount denied: path ~/.azure does not exist
```

Comment out the missing mount in `docker-compose.yml`:
```yaml
volumes:
  # - ~/.azure:/root/.azure:ro    # Comment out if you don't use Azure
```

### Agent suggests commands but doesn't execute them

Check the pod logs:
```bash
docker compose logs droid-agent --tail=30
```

Look for `[WARN]` or `[parser]` messages. Common causes:
- Model outputs malformed JSON in tool calls (parser handles most cases)
- System prompt too large (check `System prompt built: N chars` in logs)

### Infrastructure sync does nothing

Check if the infra-sync skill exists:
```bash
ls ./skills/infra-sync.md
```

Check pod logs for sync output:
```bash
docker compose logs droid-agent --tail=50 | grep sync
```

### kubectl / aws / gcloud not working inside container

Test directly:
```bash
docker compose exec droid-agent kubectl config get-contexts
docker compose exec droid-agent aws sts get-caller-identity
```

If credentials aren't found, verify the volume mounts in `docker-compose.yml` and that the files exist on your host.

### PostgreSQL disk full

```bash
docker system prune -f
docker compose restart postgres
```

### Redis connection refused

```bash
docker compose restart redis
```

### MCP server won't start

Check logs:
```bash
docker compose logs droid-agent | grep mcp
```

Common issues:
- npx needs to download the package (first run can be slow)
- Invalid API keys
- Network issues inside the container

### Dark/Light mode

Click the sun/moon icon in the top-right of the sidebar.

---

## Development

### Project Structure

```
droid-agent/
├── docker-compose.yml          # Container orchestration
├── Dockerfile                  # Agent container image
├── .gitignore                  # Excludes .env, mcp.json, user data
├── .env.example                # Environment template
├── rebuild.sh                  # Full rebuild script
├── config/
│   ├── mcp.example.json        # MCP config template (committed)
│   ├── mcp.json                # Your MCP config with credentials (gitignored)
│   └── init.sql                # PostgreSQL schema
├── skills/
│   ├── kubernetes.md           # K8s debugging knowledge
│   ├── docker.md               # Docker debugging knowledge
│   ├── general-debugging.md    # General triage framework
│   └── infra-sync.md           # Sync discovery guide
├── memory/
│   ├── context.md              # Your permanent notes
│   ├── infra/                  # Sync-populated
│   ├── incidents/              # Agent-written
│   └── learned/                # Learner-written
└── app/
    ├── server.js               # Express HTTP server + SSE
    ├── agent.js                # Core agent loop (chat + sync)
    ├── provider.js             # AI provider abstraction
    ├── tools.js                # Tool execution (shell, HTTP, file, memory)
    ├── mcp-client.js           # MCP server client (stdio + HTTP)
    ├── skills.js               # Skill file loader
    ├── memory.js               # Memory filesystem helpers
    ├── db.js                   # PostgreSQL queries
    ├── redis.js                # Redis conversation cache
    ├── learner.js              # Periodic learning worker
    ├── sync.js                 # CLI entry point for sync
    ├── package.json            # Node.js dependencies
    └── public/
        ├── index.html          # Single-file frontend (vanilla JS)
        └── logo.png            # Doctor Droid logo
```

### Making Changes

- **Skills/Memory/Config**: Edit files on the host — they're volume-mounted, changes are live.
- **Backend code (app/)**: Edit, then `docker compose up -d --build droid-agent`.
- **Frontend (index.html)**: Edit, then `docker compose up -d --build droid-agent`.
- **Dockerfile**: Run `./rebuild.sh` for a clean build.
- **Database schema (init.sql)**: Run `./rebuild.sh` (wipes and recreates DB).

### Adding a New AI Provider

Edit `app/provider.js`:
1. Add a new case to the `switch (PROVIDER)` block
2. Initialize the client
3. Add a call function if the API format differs from OpenAI

### Adding a New Built-in Tool

Edit `config/mcp.json` — add to the `tools` array:
```json
{
  "name": "my_tool",
  "description": "What this tool does",
  "args": { "param": "description" },
  "executor": "shell",
  "timeout": 30
}
```

Then add the executor logic in `app/tools.js` if using a custom executor type.

---

## Example Prompts

After running infrastructure sync, try:

- "Show me all pods that aren't running in the prod cluster"
- "Check the last 100 lines of logs for the api deployment"
- "What's using the most CPU across all my k8s clusters?"
- "Are there any OOMKilled pods in the last hour?"
- "List all AWS EC2 instances that are running"
- "Check if my RDS database has any slow queries"
- "Write a runbook for restarting the payments service"
- "What changed in the last deploy?"
- Upload a Grafana screenshot + "what caused this spike?"
- Paste a stack trace + "what went wrong?"

---

## License

MIT
