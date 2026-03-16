# Docker Debugging

## Reading Container Logs

```bash
# Tail last 100 lines with timestamps
docker logs <container> --tail 100 -f --timestamps

# Logs since a specific time
docker logs <container> --since 30m

# Logs between two times
docker logs <container> --since 2024-01-01T00:00:00 --until 2024-01-01T01:00:00
```

## Inspecting Containers

```bash
# Full inspect (pipe to jq for readability)
docker inspect <container> | jq '.[0].State'

# Check exit code and error
docker inspect <container> --format='{{.State.ExitCode}} {{.State.Error}}'

# Check when container started/stopped
docker inspect <container> --format='Started: {{.State.StartedAt}} Finished: {{.State.FinishedAt}}'

# Check restart count
docker inspect <container> --format='{{.RestartCount}}'

# Check environment variables
docker inspect <container> --format='{{range .Config.Env}}{{println .}}{{end}}'

# Check port bindings
docker inspect <container> --format='{{json .NetworkSettings.Ports}}' | jq
```

## Resource Usage

```bash
# Snapshot of all running containers' CPU/memory
docker stats --no-stream

# Watch a specific container
docker stats <container>

# Format output
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
```

## Exec Into Containers

```bash
# Interactive shell
docker exec -it <container> /bin/sh

# Run a specific command
docker exec <container> cat /etc/hosts

# As root (if container runs as non-root)
docker exec -u root -it <container> /bin/sh
```

## Common Issues

### Port Conflicts
- Symptom: "bind: address already in use"
- Debug: `lsof -i :<port>` or `ss -tlnp | grep <port>`
- Fix: stop the conflicting process or change the port mapping

### Volume Mount Errors
- Symptom: "mount denied" or files not appearing in container
- Check: `docker inspect <container> --format='{{json .Mounts}}' | jq`
- Common causes: host path doesn't exist, SELinux/permissions, Docker Desktop file sharing settings

### Network Issues
- List networks: `docker network ls`
- Inspect network: `docker network inspect <network>`
- Check container's network: `docker inspect <container> --format='{{json .NetworkSettings.Networks}}' | jq`
- DNS resolution inside container: `docker exec <container> nslookup <hostname>`
- Can containers reach each other? They must be on the same network.

### Container Won't Start
1. Check logs: `docker logs <container>`
2. Check exit code: `docker inspect <container> --format='{{.State.ExitCode}}'`
   - Exit 0: normal exit (entrypoint/cmd finished)
   - Exit 1: application error
   - Exit 137: OOM killed or `docker kill`
   - Exit 139: segfault
   - Exit 143: SIGTERM (graceful stop)
3. Try running interactively: `docker run -it --entrypoint /bin/sh <image>`

## Docker Compose

```bash
# Status of all services
docker compose ps

# Follow logs for a specific service
docker compose logs <service> -f --tail=100

# Restart a service
docker compose restart <service>

# Rebuild and restart
docker compose up -d --build <service>

# View effective compose config (resolved variables)
docker compose config

# Scale a service
docker compose up -d --scale <service>=3
```

## Cleanup

```bash
# Remove stopped containers and dangling images
docker system prune -f

# Also remove unused volumes (careful!)
docker system prune -f --volumes

# Check disk usage
docker system df
```

## Quick Triage Sequence

1. `docker ps -a` — what's running, what's stopped?
2. `docker logs <container> --tail 200` — what happened?
3. `docker inspect <container> | jq '.[0].State'` — exit code, OOM, restart count?
4. `docker stats --no-stream` — resource usage OK?
5. `docker network ls && docker network inspect <network>` — connectivity?
