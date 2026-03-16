# Memory

Persistent knowledge the agent reads on every message. Survives container restarts via Docker volume mount.

## Structure

| Path | Written by | Purpose |
|------|-----------|---------|
| `context.md` | You (manually) | Permanent facts about your infrastructure |
| `infra/` | Infrastructure Sync | Docker, Kubernetes, AWS, Azure, GCP, GitHub, network, projects |
| `incidents/` | Agent (with your approval) | Investigation summaries from debugging sessions |
| `learned/` | Learner worker | Patterns and summaries extracted from past conversations |

## How to Use

### context.md
Edit this file with permanent facts about your stack. The agent reads it on every message:

```markdown
# My Stack

## Services
- API: port 8080, k8s namespace `api`, cluster `prod-east`
- Workers: 3 replicas, processes background jobs from SQS

## Common Issues
- API latency > 500ms usually means Redis connection pool exhaustion
- OOM on workers: increase to 2Gi limit

## Contacts
- Backend on-call: PagerDuty schedule "backend-primary"
- Slack: #incidents
```

### Editing
- **Web UI**: Click "Memory" in sidebar → click "edit" on any file → Save
- **Filesystem**: `vim ./memory/context.md`
- **API**: `curl -X POST http://localhost:7433/api/memory/write -H 'Content-Type: application/json' -d '{"path":"context.md","content":"..."}'`
