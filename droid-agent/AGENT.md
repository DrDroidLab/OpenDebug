# AGENT.md — Droid Agent Knowledge Index

> This file is the master index of everything the agent knows. It is loaded before every request so the agent can quickly decide where to look and what context is available. Every update to memory, skills, incidents, infra, or learned patterns must update this file.

---

## Skills (7 files)

Domain knowledge and runbooks the agent uses during investigations.

| File | Size | First line |
|------|------|------------|
| `skills/docker.md` | 3706b | ```bash |
| `skills/error-rate.md` | 2591b | When error rates spike, work through this in order: |
| `skills/general-debugging.md` | 5554b | When something breaks, answer these questions in order: |
| `skills/infra-sync.md` | 2157b | Discover everything about the developer's local and cloud infrastructure. Write  |
| `skills/kubernetes-incidents.md` | 5085b | Run these immediately when something is wrong in a k8s cluster: |
| `skills/kubernetes.md` | 4165b | ```bash |
| `skills/performance.md` | 3781b | When latency spikes or performance degrades: |

## Memory

### context.md
<!-- Edit this file with permanent facts about your infrastructure -->

### README.md
Persistent knowledge the agent reads on every message. Survives container restar

---

## How to use this index

- **Before investigating**: Check `infra/summary.md` and `context.md` for known infrastructure topology
- **For k8s issues**: Read `skills/kubernetes-incidents.md` + `infra/kubernetes.md`
- **For Docker issues**: Read `skills/docker.md` + `infra/docker.md`
- **For performance**: Read `skills/performance.md`
- **For error spikes**: Read `skills/error-rate.md`
- **For past incidents**: Check `incidents/` for similar issues and `learned/patterns.md` for known investigation flows
- **For general triage**: Read `skills/general-debugging.md`

---

*Last updated: 2026-03-18T12:24:15.792Z*
