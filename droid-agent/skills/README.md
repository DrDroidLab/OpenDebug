# Skills

Skills are markdown files that teach the agent domain-specific knowledge. Drop any `.md` file into this directory — it's loaded automatically on every message, no restart needed.

## How It Works

Every `.md` file in this directory (except this README) is injected into the agent's system prompt as `<skill>` context. The agent uses this knowledge when debugging incidents, answering questions, or running infrastructure sync.

## Built-in Skills

| File | Description |
|------|-------------|
| `kubernetes.md` | K8s debugging: pod logs, describe, events, OOMKilled, CrashLoopBackOff, rollouts, HPA |
| `docker.md` | Docker debugging: logs, inspect, stats, exec, compose, port conflicts, volumes |
| `general-debugging.md` | Triage framework: blast radius, root cause, 5xx/4xx, memory leaks, N+1 queries, latency |
| `infra-sync.md` | Infrastructure sync discovery guide — what to find and where to save it |

## Adding Your Own Skills

Create a `.md` file with knowledge the agent should have. Examples:

### Service runbook
```markdown
# Payments Service

## Overview
- Namespace: payments
- Database: PostgreSQL on RDS
- Dependencies: Stripe, Redis, notifications

## Restart procedure
1. kubectl rollout restart deployment/payments-api -n payments
2. Watch: kubectl rollout status deployment/payments-api -n payments

## Common issues
- Stuck payments: check the job queue in Redis
- High latency: usually N+1 queries on the orders endpoint
```

### Architecture overview
```markdown
# Microservices Architecture

## Services
- api-gateway → routes to auth, orders, payments
- auth-service → JWT tokens, OAuth providers
- orders-service → CRUD, inventory checks
- payments-service → Stripe integration

## Databases
- users-db (PostgreSQL) — shared by auth + orders
- payments-db (PostgreSQL) — payments only
- cache (Redis) — sessions, rate limiting
```

### On-call info
```markdown
# On-Call

## Escalation
1. Backend on-call (PagerDuty)
2. SRE team (15 min SLA)
3. VP Engineering

## Channels
- #incidents (Slack)
- #deploys (Slack)

## Dashboards
- API latency: grafana.internal/d/api-latency
- Error rate: grafana.internal/d/error-rate
```

## Tips

- Keep skills focused — one topic per file
- Use headers and code blocks for commands
- Include common failure modes and their fixes
- The agent reads ALL skills on every message, so keep total size reasonable
- Update skills as your stack evolves
