# Kubernetes Incident Playbook

## Rapid Triage (first 2 minutes)

Run these immediately when something is wrong in a k8s cluster:

1. **What's broken?**
   - `kubectl get pods -n <ns>` — any not Running/Ready?
   - `kubectl get events -n <ns> --sort-by=.lastTimestamp | tail -20` — recent events?

2. **When did it start?**
   - `kubectl get events -n <ns> --sort-by=.lastTimestamp` — timestamp of first warning
   - `kubectl rollout history deployment/<name> -n <ns>` — recent rollout?

3. **How bad is it?**
   - `kubectl get pods -n <ns> -o wide` — how many pods affected?
   - `kubectl get hpa -n <ns>` — is autoscaler reacting?

## Pod Failure States

### CrashLoopBackOff
The pod starts and crashes repeatedly.

**Diagnosis:**
```
kubectl logs <pod> -n <ns> --previous     # logs from last crash
kubectl describe pod <pod> -n <ns>         # exit code, events
kubectl get pod <pod> -n <ns> -o yaml | grep -A5 lastState
```

**Common causes:**
- Missing environment variable → app fails at startup
- Database connection refused → dependency not ready
- Port already in use → another process binding the same port
- Bad config file → check mounted configmaps/secrets
- New image with a bug → check recent image tag change

**Fix:**
- If deploy-related: `kubectl rollout undo deployment/<name> -n <ns>`
- If config: fix configmap/secret and restart
- If dependency: check the dependency first

### OOMKilled
Container exceeded memory limit and was killed by the kernel.

**Diagnosis:**
```
kubectl describe pod <pod> -n <ns> | grep -A3 "Last State"
kubectl top pods -n <ns> --sort-by=memory
kubectl get pod <pod> -n <ns> -o jsonpath='{.spec.containers[0].resources}'
```

**Common causes:**
- Memory limit too low for the workload
- Memory leak in the application
- Large request/response payloads being buffered in memory
- Unbounded cache without TTL or size limit
- JVM heap not matching container limit

**Fix:**
- Short-term: increase memory limit in deployment spec
- Long-term: profile memory usage, find the leak

### ImagePullBackOff
Can't pull the container image.

**Diagnosis:**
```
kubectl describe pod <pod> -n <ns> | grep -A5 "Events"
kubectl get pod <pod> -n <ns> -o jsonpath='{.spec.containers[0].image}'
```

**Common causes:**
- Wrong image tag (typo, tag doesn't exist)
- Private registry without imagePullSecrets configured
- Registry is down or rate-limited (Docker Hub limits)
- Network policy blocking registry access

### Pending (pod won't schedule)
Pod stays in Pending state.

**Diagnosis:**
```
kubectl describe pod <pod> -n <ns>          # check Events section
kubectl describe nodes | grep -A5 "Allocated resources"
kubectl get pv,pvc -n <ns>                  # if using persistent volumes
```

**Common causes:**
- Insufficient CPU/memory on nodes
- Node selector/affinity mismatch
- PVC not bound (storage class issue)
- Taints on nodes without matching tolerations

### Evicted
Pod was evicted from the node.

**Diagnosis:**
```
kubectl get pods -n <ns> --field-selector=status.phase=Failed | grep Evicted
kubectl describe node <node> | grep -A10 "Conditions"
```

**Common causes:**
- Node disk pressure (ephemeral storage full)
- Node memory pressure
- Too many pods on the node

## Deployment Issues

### Rollout stuck
```
kubectl rollout status deployment/<name> -n <ns>
kubectl get replicaset -n <ns> -l app=<name>
kubectl describe deployment <name> -n <ns>
```

**Common causes:**
- New pods failing readiness probe
- Insufficient resources to schedule new pods
- PDB (PodDisruptionBudget) preventing old pods from terminating

### Rolling back
```
kubectl rollout undo deployment/<name> -n <ns>
kubectl rollout undo deployment/<name> -n <ns> --to-revision=<N>
kubectl rollout status deployment/<name> -n <ns>
```

## Networking Issues

### Service not reachable
```
kubectl get svc -n <ns>
kubectl get endpoints <svc> -n <ns>         # are there endpoints?
kubectl exec -it <pod> -n <ns> -- nslookup <svc>.<ns>.svc.cluster.local
kubectl exec -it <pod> -n <ns> -- curl -v <svc>:<port>
```

**Common causes:**
- No endpoints → selector doesn't match pod labels
- DNS not resolving → CoreDNS pods unhealthy
- NetworkPolicy blocking traffic
- Wrong port in service definition

### DNS issues
```
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl exec -it <pod> -n <ns> -- nslookup kubernetes.default
kubectl exec -it <pod> -n <ns> -- cat /etc/resolv.conf
```

## Resource Pressure

### Cluster-wide
```
kubectl top nodes
kubectl describe nodes | grep -E "Capacity|Allocatable|Allocated"
kubectl get pods --all-namespaces --field-selector=status.phase!=Running
```

### Per-namespace
```
kubectl top pods -n <ns> --sort-by=cpu
kubectl top pods -n <ns> --sort-by=memory
kubectl get resourcequota -n <ns>
kubectl get limitrange -n <ns>
```

## Multi-cluster Operations

When working across clusters, always specify the context:
```
kubectl --context <context> get pods -n <ns>
kubectl config get-contexts                    # list all contexts
kubectl config use-context <context>           # switch default
```
