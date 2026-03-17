# My Stack — Permanent Context

<!-- Edit this file with permanent facts about your infrastructure -->
<!-- DevAgent reads this on every message -->

## Services
<!-- List your main services here -->

## Common Issues
<!-- Document recurring problems and their solutions -->

## On-Call Notes
<!-- Runbook links, escalation contacts, etc -->


## Infrastructure/context updates (append to context.md)

- **Agent/tooling constraints (this session):**
  - Only the following tools were available: `run_shell(command)`, `fetch_url(url, headers?)`, `read_file(path)`, `write_memory(path, content)`.
  - No DB-specific connectors/tools were registered (e.g., no direct Supabase/Postgres integration), which can block live DB inspection unless `psql`/drivers are installed.