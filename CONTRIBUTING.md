# Contributing to Droid Agent

Thanks for your interest in contributing. Here's how to get involved.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone git@github.com:YOUR_USERNAME/OpenDebug.git`
3. Create a branch: `git checkout -b feature/your-feature`
4. Set up locally:
   ```bash
   cd droid-agent
   cp .env.example .env
   cp config/mcp.example.json config/mcp.json
   # Edit .env with your API key
   docker compose up -d --build
   ```

## Development Workflow

### Making Changes

- **Skills/Memory/Config**: Edit files directly in `droid-agent/skills/`, `droid-agent/memory/`, `droid-agent/config/`. They're volume-mounted, so changes are live.
- **Backend code**: Edit files in `droid-agent/app/`, then `docker compose up -d --build droid-agent`.
- **Frontend**: Edit `droid-agent/app/public/index.html`, then `docker compose up -d --build droid-agent`.
- **Database schema**: Edit `droid-agent/config/init.sql`, then run `./droid-agent/rebuild.sh` (wipes DB).
- **Dockerfile**: Run `./droid-agent/rebuild.sh` for a clean build.

### Testing

```bash
# Health check
curl http://localhost:7433/api/health | python3 -m json.tool

# Test chat
curl -N -X POST http://localhost:7433/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"hello","conversationId":"test"}'

# Check logs
docker compose logs -f droid-agent
```

## What to Contribute

### Good First Issues

- Add a new pre-seeded skill (debugging knowledge for a specific technology)
- Add a new MCP server entry to `mcp.example.json`
- Improve the frontend UI
- Add more CLI tools to the Dockerfile
- Improve error handling in tool execution

### Larger Contributions

- New AI provider support (add to `provider.js`)
- Streaming response support (token-by-token)
- Multi-user support
- Improved learner worker intelligence
- Mobile-responsive UI

### Adding a Skill

Create a `.md` file in `droid-agent/skills/`:

```markdown
# Your Technology

## Common Issues
- Issue 1: description + fix
- Issue 2: description + fix

## Key Commands
- `command1` — what it does
- `command2` — what it does

## Triage Steps
1. First thing to check
2. Second thing to check
```

### Adding an MCP Server

Add an entry to `droid-agent/config/mcp.example.json`:

```json
"your-service": {
  "enabled": false,
  "command": "npx",
  "args": ["-y", "your-mcp-server-package"],
  "env": {
    "API_KEY": "your_api_key_placeholder"
  }
}
```

## Pull Requests

1. Keep PRs focused — one feature or fix per PR
2. Update documentation if you change behavior
3. Test locally before submitting
4. Include a description of what you changed and why

## Code Style

- ES modules (`import`/`export`)
- No TypeScript — plain Node.js
- No frameworks in the frontend — vanilla JS only
- Minimal dependencies — don't add npm packages unless truly necessary
- Error handling everywhere — tool executors must never throw, always return error strings

## Reporting Issues

- Use [GitHub Issues](https://github.com/DrDroidLab/OpenDebug/issues)
- Include: what you did, what happened, what you expected
- Include container logs: `docker compose logs droid-agent --tail=50`
- Include health check output: `curl http://localhost:7433/api/health`

## Code of Conduct

Be respectful, constructive, and inclusive. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
