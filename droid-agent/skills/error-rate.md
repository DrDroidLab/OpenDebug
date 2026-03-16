# Error Rate Debugging

## Triage Checklist

When error rates spike, work through this in order:

1. **Scope it** — Is it all endpoints or specific ones? One service or cascading?
2. **Correlate with deploys** — Did error rate start at a deploy time? Check recent deployments.
3. **Check dependencies** — Are downstream services (databases, caches, external APIs) healthy?
4. **Look at the errors** — What HTTP status codes? What error messages in logs?
5. **Check resource exhaustion** — CPU, memory, DB connections, file descriptors.

## Common Error Patterns

### 5xx spike after deploy
- Likely cause: new code bug, missing env var, bad config
- Check: rollout history, recent config changes, pod logs
- Fix: rollback deployment, then investigate

### 5xx on specific endpoint
- Likely cause: bad query, missing dependency, timeout
- Check: logs filtered by endpoint path, DB slow query log
- Fix: identify the failing query/call, fix or add timeout

### Gradual 5xx increase
- Likely cause: resource leak (connections, memory, threads)
- Check: memory usage trend, DB connection pool, open file descriptors
- Fix: restart to mitigate, then find the leak

### Intermittent 5xx (flapping)
- Likely cause: one unhealthy pod, network issues, DNS resolution
- Check: error distribution across pods, network connectivity
- Fix: identify and restart the bad pod, check node health

## Key Commands

### Check error rates from logs
```
# Nginx/Apache access log status code distribution
awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn

# Count 5xx errors in last 1000 lines
tail -1000 /var/log/nginx/access.log | awk '$9 >= 500' | wc -l

# Errors per minute
grep "ERROR" /var/log/app.log | awk -F'[: ]' '{print $1":"$2}' | sort | uniq -c
```

### Check from Kubernetes
```
# Pod logs filtered for errors
kubectl logs deployment/<name> -n <ns> --tail=200 | grep -i error

# Check if pods are restarting
kubectl get pods -n <ns> -o wide | awk '$4 > 0'

# Recent events
kubectl get events -n <ns> --sort-by=.lastTimestamp | tail -20
```

### Check from monitoring
```
# Prometheus: error rate by service
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])

# Prometheus: error rate by endpoint
sum by (path) (rate(http_requests_total{status=~"5.."}[5m]))
```

## Questions to Ask

- When did it start? (deploy correlation)
- Which endpoints are affected? (scope)
- What changed? (deploy, config, traffic, dependency)
- Is it all users or a subset? (geographic, account type)
- Are error rates still climbing or stabilized? (leak vs event)
