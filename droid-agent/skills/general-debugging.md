# General Debugging & Incident Triage

## Incident Triage Framework

When something breaks, answer these questions in order:

### 1. What changed?
- Recent deploys (last 1-4 hours)
- Config changes (environment variables, feature flags)
- Traffic spikes (marketing campaign, viral event)
- Upstream dependency changes (API version, certificate rotation)
- Infrastructure changes (scaling events, node replacements)

### 2. What's the blast radius?
- All users or a subset? (geography, account type, feature flag)
- All endpoints or specific ones?
- One service or cascading across multiple?
- Data corruption risk?

### 3. Mitigation vs Root Cause
- **First**: stabilize (rollback, restart, scale up, feature flag off)
- **Then**: understand (logs, traces, metrics)
- **Never** try to root-cause under pressure if you can mitigate quickly

## Reading Stack Traces

- Start from the **innermost/bottom exception** — that's the root cause
- Work outward — each "Caused by" wraps the original
- Focus on **your code** in the trace (not library/framework frames)
- Look for the transition point where your code calls a library
- Note the line number — that's where things went wrong
- If you see "...23 more" it means frames were deduplicated — check the outer trace

## 5xx Error Triage

1. **Check error rate by endpoint** — is it one endpoint or all?
2. **Check dependent service health** — databases, caches, external APIs
3. **Check deploy correlation** — did error rate start at deploy time?
4. **Check resource exhaustion**:
   - CPU: sustained 100% = thread starvation
   - Memory: growing without drops = leak
   - DB connections: pool exhausted = connection leak or slow queries
   - File descriptors: `ls /proc/<pid>/fd | wc -l`
5. **Check error logs** for the actual exception/stack trace

## 4xx Error Triage

- 400 Bad Request: client sending malformed data — check API contract changes
- 401 Unauthorized: auth token expired/invalid — check token issuer, clock skew
- 403 Forbidden: permissions issue — check RBAC, IAM policies
- 404 Not Found: route removed or resource deleted — check recent deploys
- 429 Too Many Requests: rate limiting — check rate limit config, identify source

Look for patterns: specific users, IPs, user agents, geographic regions.

## Memory Leaks

Signs:
- Memory usage increases steadily over time with no drops after GC
- OOM kills at regular intervals
- Response times slowly degrading

Common causes:
- Event listener accumulation (adding listeners without removing them)
- Unclosed database connections
- Caching without TTL or size limits
- Global arrays/maps that grow forever
- Closures holding references to large objects

Debug approach:
- Take heap snapshots at intervals, compare what's growing
- Check connection pool metrics
- Look for `addEventListener` without `removeEventListener`
- Check cache sizes: Redis `INFO memory`, in-process cache metrics

## N+1 Query Problems

Signs:
- Endpoint is slow but individual queries are fast
- Query count per request is very high (> 20 for most endpoints)
- DB CPU high but no single slow query in slow query log

Pattern:
```
# BAD: N+1
for user in users:
    orders = db.query("SELECT * FROM orders WHERE user_id = ?", user.id)

# GOOD: batch
user_ids = [u.id for u in users]
orders = db.query("SELECT * FROM orders WHERE user_id IN (?)", user_ids)
```

Debug: enable query logging, count queries per request.

## Latency Spikes

### P50 vs P95 vs P99 Divergence
- **High P99, normal P50**: outlier requests hitting a slow path (specific query, specific data size, GC pauses)
- **High P50**: everything is slow — check DB, network, CPU
- **P95 = P99 >> P50**: bimodal distribution — cache hit vs miss, or async job blocking

### Common Causes
- Database: check slow query log, connection pool wait times
- External APIs: add timeouts, check their status page
- GC pauses: check GC logs, reduce allocation rate
- Lock contention: thread dumps, check for synchronized blocks
- Network: DNS resolution, TLS handshake times

## Useful One-Liners

```bash
# Count errors in a log file
grep -c "ERROR" /var/log/app.log

# Recent errors
grep "ERROR" /var/log/app.log | tail -20

# HTTP status code distribution from nginx access log
awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn

# Top 10 slowest requests (assuming response time is last field)
awk '{print $NF, $7}' /var/log/nginx/access.log | sort -rn | head -10

# Connections per IP
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10

# Check open file descriptors for a process
ls /proc/<pid>/fd | wc -l

# Check listening ports
ss -tlnp

# Check established connections
ss -tnp | grep ESTABLISHED | wc -l

# Disk usage
df -h

# Top processes by memory
ps aux --sort=-%mem | head -10

# Top processes by CPU
ps aux --sort=-%cpu | head -10

# Check DNS resolution time
time nslookup <hostname>

# Quick HTTP timing breakdown
curl -o /dev/null -s -w "DNS: %{time_namelookup}s\nConnect: %{time_connect}s\nTLS: %{time_appconnect}s\nFirst byte: %{time_starttransfer}s\nTotal: %{time_total}s\n" <url>
```

## When You're Stuck

1. **Reproduce**: Can you trigger it reliably? If not, look for the pattern.
2. **Isolate**: Binary search the system — which component is the source?
3. **Compare**: What's different between working and broken? (config, traffic, data)
4. **Simplify**: Remove variables until you find the minimum reproduction case.
5. **Ask**: Check if anyone has seen this before — search error messages exactly.
