# Kubernetes Debugging

## Reading Pod Logs

```bash
# Tail last 100 lines
kubectl logs <pod> -n <namespace> --tail=100

# Follow logs in real-time
kubectl logs <pod> -n <namespace> -f --tail=100

# Logs from a specific container in a multi-container pod
kubectl logs <pod> -c <container> -n <namespace> --tail=100

# Logs from a previous instance (after crash/restart)
kubectl logs <pod> -n <namespace> --previous
```

## Describing Failing Pods

```bash
kubectl describe pod <pod> -n <namespace>
```

Key sections to check in describe output:
- **Events** (bottom): shows scheduling, pulling, starting, killing events
- **State / Last State**: shows current and previous container state
- **Restart Count**: high number = CrashLoopBackOff likely
- **Conditions**: Ready, ContainersReady, PodScheduled — which is False?

## Recent Events

```bash
# All events in namespace, sorted by time
kubectl get events -n <namespace> --sort-by=.lastTimestamp

# Watch events in real-time
kubectl get events -n <namespace> -w

# Filter for warnings only
kubectl get events -n <namespace> --field-selector type=Warning
```

## Common Failure States

### OOMKilled
- Container exceeded its memory limit
- Check: `kubectl describe pod` → look for "OOMKilled" in Last State
- Fix: increase `resources.limits.memory` or investigate memory leaks
- Debug: `kubectl top pods -n <namespace>` to see current memory usage
- Look for: memory leaks, unbounded caches, large file processing in-memory

### CrashLoopBackOff
- Container starts and immediately exits
- Check logs: `kubectl logs <pod> -n <namespace> --previous`
- Common causes: missing env vars, bad config, port already in use, missing dependencies
- The `--previous` flag is critical — current logs may be empty if container hasn't started yet

### ImagePullBackOff
- Can't pull the container image
- Check: `kubectl describe pod` → Events section
- Common causes: wrong image tag, private registry without auth, typo in image name
- Fix: verify image exists (`docker pull <image>`), check `imagePullSecrets`

### Pending
- Pod can't be scheduled to a node
- Check: `kubectl describe pod` → Events and Conditions
- Common causes: insufficient CPU/memory on nodes, node selector/affinity mismatch, PVC not bound
- Debug: `kubectl describe nodes` → look at Allocatable vs Allocated resources

## Resource Usage

```bash
# Pod CPU and memory usage
kubectl top pods -n <namespace>

# Node-level resource usage
kubectl top nodes

# Sort by memory usage
kubectl top pods -n <namespace> --sort-by=memory
```

## Deployment Management

```bash
# Restart a deployment (rolling restart)
kubectl rollout restart deployment/<name> -n <namespace>

# Check rollout status
kubectl rollout status deployment/<name> -n <namespace>

# View rollout history
kubectl rollout history deployment/<name> -n <namespace>

# Roll back to previous revision
kubectl rollout undo deployment/<name> -n <namespace>

# Roll back to a specific revision
kubectl rollout undo deployment/<name> -n <namespace> --to-revision=3
```

## Port Forwarding for Debugging

```bash
# Forward local port to pod port
kubectl port-forward pod/<pod> 8080:8080 -n <namespace>

# Forward to a service
kubectl port-forward svc/<service> 8080:80 -n <namespace>
```

## Horizontal Pod Autoscaler (HPA)

```bash
# Check HPA status
kubectl get hpa -n <namespace>

# Detailed HPA info (shows scaling events, metrics)
kubectl describe hpa <name> -n <namespace>
```

Common HPA issues:
- **Unable to fetch metrics**: metrics-server not running or misconfigured
- **Max replicas reached**: scale up maxReplicas or optimize the service
- **Flapping**: pods scaling up and down rapidly — adjust `stabilizationWindowSeconds`

## Quick Triage Sequence

When something is broken, run these in order:
1. `kubectl get pods -n <namespace>` — what's not Running/Ready?
2. `kubectl describe pod <failing-pod> -n <namespace>` — what do events say?
3. `kubectl logs <failing-pod> -n <namespace> --tail=200` — what's in logs?
4. `kubectl get events -n <namespace> --sort-by=.lastTimestamp` — cluster-level events?
5. `kubectl top pods -n <namespace>` — resource exhaustion?
