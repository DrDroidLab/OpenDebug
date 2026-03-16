# Performance & Latency Debugging

## Triage Framework

When latency spikes or performance degrades:

1. **Which percentile?** — P50 (median) vs P95 vs P99 tells you different stories
2. **Which service/endpoint?** — Global or isolated to specific paths
3. **When did it start?** — Correlate with deploys, traffic, external events
4. **What's the dependency chain?** — Trace the slow path through services

## Percentile Analysis

| Pattern | Meaning | Likely Cause |
|---------|---------|--------------|
| P50 high | Everything is slow | DB, network, or CPU saturation |
| P99 high, P50 normal | Outlier requests | GC pauses, cold starts, one slow query |
| P95 = P99 >> P50 | Bimodal distribution | Cache hit vs miss, async job blocking |
| All percentiles climbing | Progressive degradation | Memory leak, connection pool exhaustion |

## Common Causes

### Database
- Slow queries (missing index, full table scan, lock contention)
- Connection pool exhaustion (all connections in use, new requests queue)
- Replication lag (reads hitting stale replicas)

### Network
- DNS resolution delays
- TLS handshake overhead
- Cross-region calls (check if traffic is hitting remote endpoints)

### Application
- N+1 queries (many sequential DB calls instead of batched)
- Synchronous external API calls in the request path
- Large payload serialization/deserialization
- Memory pressure causing GC pauses

### Infrastructure
- CPU throttling (check limits vs actual usage in k8s)
- Noisy neighbor (shared node resource contention)
- Disk I/O saturation (check iowait)

## Key Commands

### Quick HTTP timing breakdown
```
curl -o /dev/null -s -w "DNS: %{time_namelookup}s\nConnect: %{time_connect}s\nTLS: %{time_appconnect}s\nFirst byte: %{time_starttransfer}s\nTotal: %{time_total}s\n" <url>
```

### Kubernetes resource usage
```
# Pod CPU and memory
kubectl top pods -n <ns> --sort-by=cpu

# Node-level resources
kubectl top nodes

# Check if pods are being CPU throttled
kubectl get pods -n <ns> -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[0].resources.limits.cpu}{"\t"}{.spec.containers[0].resources.requests.cpu}{"\n"}{end}'
```

### Database performance
```
# PostgreSQL: active queries and their duration
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;

# PostgreSQL: slow queries
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 20;

# MySQL: slow query log
SHOW VARIABLES LIKE 'slow_query_log';
SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT 20;
```

### System-level
```
# CPU usage by process
ps aux --sort=-%cpu | head -10

# IO wait (high iowait = disk bottleneck)
iostat -x 1 5

# Network connections
ss -s
ss -tnp | grep ESTABLISHED | wc -l

# Open file descriptors for a process
ls /proc/<pid>/fd | wc -l
```

### Prometheus queries
```
# Request duration by endpoint
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# Latency trend over time
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# Slow endpoints
topk(10, histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, path)))
```

## Investigation Steps

1. Get current latency numbers (P50, P95, P99)
2. Compare with baseline (what's normal for this service?)
3. Check if it correlates with traffic increase
4. Check dependency health (DB, cache, external APIs)
5. Look for resource exhaustion (CPU, memory, connections)
6. Check recent deploys/changes
7. If DB: check slow query log and connection pool stats
8. If network: run timing breakdown with curl
9. If CPU: check for throttling in k8s or high process CPU
