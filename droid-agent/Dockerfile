FROM node:22-alpine

# Core tools
RUN apk add --no-cache bash curl wget git jq openssh-client bind-tools docker-cli

# kubectl
RUN apk add --no-cache kubectl 2>/dev/null || \
    (curl -sLO "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
     chmod +x kubectl && mv kubectl /usr/local/bin/) || true

# Helm
RUN curl -sSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 2>/dev/null | bash 2>/dev/null || true

# GitHub CLI
RUN apk add --no-cache github-cli 2>/dev/null || true

# AWS CLI
RUN apk add --no-cache aws-cli 2>/dev/null || \
    (apk add --no-cache python3 py3-pip && pip3 install --break-system-packages --quiet awscli) || true

# Azure CLI
RUN apk add --no-cache python3 py3-pip && \
    pip3 install --break-system-packages --quiet azure-cli 2>/dev/null || true

# Google Cloud CLI
RUN curl -sSL https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-x86_64.tar.gz 2>/dev/null | \
    tar -xz -C /opt 2>/dev/null && \
    /opt/google-cloud-sdk/install.sh --quiet --path-update=true 2>/dev/null && \
    ln -sf /opt/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud && \
    ln -sf /opt/google-cloud-sdk/bin/gsutil /usr/local/bin/gsutil || true

# Terraform
RUN apk add --no-cache terraform 2>/dev/null || true

WORKDIR /app

COPY app/package*.json ./
RUN npm install --production

COPY app/ .

EXPOSE 7433

CMD ["node", "server.js"]
