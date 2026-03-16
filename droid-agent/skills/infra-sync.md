# Infrastructure Sync

Discover everything about the developer's local and cloud infrastructure. Write structured markdown summaries to memory/infra/ as you go.

## What to discover

### Docker
Find all running and stopped containers, their images, ports, networks, volumes, and environment variables (redact secret values). Write to `memory/infra/docker.md`.

### Kubernetes
Find ALL kubectl contexts configured on this machine. For EACH context, get namespaces, deployments, services, and pods. Do not stop at the current context — iterate through every single one. Write to `memory/infra/kubernetes.md` with a section per context.

### AWS
Check if AWS CLI is configured. List all profiles. For each profile, check the account identity. Discover EC2 instances, ECS clusters, RDS databases, Lambda functions, S3 buckets. Write to `memory/infra/aws.md`.

### Azure
Check if Azure CLI is configured. List all subscriptions. Discover AKS clusters, VMs, web apps, and resources. Write to `memory/infra/azure.md`.

### Google Cloud
Check if gcloud is configured. List projects, compute instances, GKE clusters, Cloud Run services. Write to `memory/infra/gcloud.md`.

### GitHub
Check if GitHub CLI is authenticated. List recent repositories. Write to `memory/infra/github.md`.

### Network
Find all listening ports and identify what services are running on each. Write to `memory/infra/network.md`.

### Projects
Look for project directories, docker-compose files, and .env files in common locations. Write to `memory/infra/projects.md`.

### Summary
After completing all discovery, write a high-level summary of the entire infrastructure to `memory/infra/summary.md`. Include: which cloud providers are configured, how many k8s clusters, key services, and anything notable.

## Guidelines

- Be thorough — enumerate everything, don't stop at the first result.
- For any service with multiple accounts/contexts/profiles/subscriptions, iterate through ALL of them.
- If a CLI is not installed or not authenticated, note that and move on.
- Redact secret values — show key names only.
- Write memory files as you complete each section, not all at the end.
