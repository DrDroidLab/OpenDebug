---
name: Bug Report
about: Report a bug or unexpected behavior
title: "[Bug] "
labels: bug
---

**Describe the bug**
A clear description of what happened.

**To Reproduce**
Steps to reproduce:
1. ...
2. ...

**Expected behavior**
What you expected to happen.

**Environment**
- OS: [e.g. macOS 15, Ubuntu 24.04]
- Docker version: [e.g. 27.1.1]
- AI Provider: [e.g. azure-openai, openai, claude]
- Model: [e.g. gpt-4.1]

**Health check output**
```
curl http://localhost:7433/api/health
```

**Container logs**
```
docker compose logs droid-agent --tail=30
```
