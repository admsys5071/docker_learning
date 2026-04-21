# ☁️ Deploying on Azure — Step-by-Step Guide

This guide documents the deployment of the Docker Full Stack project on an Azure VM, performed entirely from the command line using Azure CLI.

> 🇫🇷 [Version française](DEPLOY-AZURE.md)



## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture on Azure](#architecture-on-azure)
3. [Step 1 — Configure budget alert](#step-1--configure-budget-alert)
4. [Step 2 — Create the Resource Group](#step-2--create-the-resource-group)
5. [Step 3 — Create the VM](#step-3--create-the-vm)
6. [Step 4 — Open ports](#step-4--open-ports)
7. [Step 5 — Install Docker](#step-5--install-docker)
8. [Step 6 — Transfer and deploy the project](#step-6--transfer-and-deploy-the-project)
9. [Step 7 — Verify the deployment](#step-7--verify-the-deployment)
10. [Resource cleanup](#resource-cleanup)
11. [AWS vs Azure comparison](#aws-vs-azure-comparison)
12. [Errors encountered](#errors-encountered)



## Prerequisites

- An Azure account with an active subscription (Pay-As-You-Go or Free Trial)
- Azure CLI installed and configured


# Install Azure CLI (Debian/Ubuntu via pip if Microsoft repo is unavailable)
pip install azure-cli --break-system-packages
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Login
az login

# Verify subscription
az account list --output table




## Architecture on Azure


                    ┌──────────────────┐
                    │    Internet      │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │       NSG        │
                    │ (Network Security│
                    │     Group)       │
                    │  Ports: 22, 8080 │
                    │  3001, 9090, 8081│
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │ VM (D2als_v7)    │
                    │ Ubuntu 24.04     │
                    │                  │
                    │  ┌────────────┐  │
                    │  │  Docker    │  │
                    │  │  Compose   │  │
                    │  │            │  │
                    │  │ 7 containers│  │
                    │  └────────────┘  │
                    └──────────────────┘




## Step 1 — Configure budget alert

Before creating any resource, set up a budget alert to avoid unexpected charges. The simplest way is through the Azure portal:

1. Go to https://portal.azure.com
2. Search for **"Budgets"** in the search bar
3. Click **"+ Add"**
4. Configure: $5/month, alert at 80%

> **Estimated cost**: ~$0.18 for 2-3 hours of testing (VM + disk + public IP).



## Step 2 — Create the Resource Group

A Resource Group is a logical container that groups all Azure resources for a project. Its main advantage: a single `az group delete` removes everything.


az group create --name docker-fullstack-rg --location northeurope




## Step 3 — Create the VM


az vm create \
  --resource-group docker-fullstack-rg \
  --name docker-fullstack-vm \
  --image Canonical:ubuntu-24_04-lts:server:latest \
  --size Standard_D2als_v7 \
  --admin-username azureuser \
  --generate-ssh-keys \
  --no-wait


Azure automatically creates in a single command: VM, virtual network, subnet, public IP, NSG, and disk.

### Verify creation and retrieve IP


az vm wait --resource-group docker-fullstack-rg --name docker-fullstack-vm --created

az vm show --resource-group docker-fullstack-rg \
  --name docker-fullstack-vm \
  --show-details --query publicIps --output tsv


### Choosing the VM type

Some VM types may be unavailable in certain regions. To list available types with 2 vCPUs:


az vm list-skus \
  --location northeurope \
  --query "[?restrictions[0]==null && capabilities[?name=='vCPUs' && value=='2']].{Name:name, Family:family}" \
  --output table




## Step 4 — Open ports

Unlike AWS where the Security Group is created before the VM, Azure creates it automatically and ports are opened afterwards:


az vm open-port --resource-group docker-fullstack-rg --name docker-fullstack-vm --port 8080 --priority 1001
az vm open-port --resource-group docker-fullstack-rg --name docker-fullstack-vm --port 3001 --priority 1002
az vm open-port --resource-group docker-fullstack-rg --name docker-fullstack-vm --port 9090 --priority 1003
az vm open-port --resource-group docker-fullstack-rg --name docker-fullstack-vm --port 8081 --priority 1004


> ⚠️ **Security**: In production, restrict access by source IP instead of opening to `*`.



## Step 5 — Install Docker


ssh azureuser@<PUBLIC_IP>

sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker azureuser

exit
ssh azureuser@<PUBLIC_IP>

docker --version
docker compose version




## Step 6 — Transfer and deploy the project

From the local machine:


scp -r ~/docker_learning/proj-fullstkupg2 azureuser@<PUBLIC_IP>:~/


On the Azure VM:


chmod 644 ~/proj-fullstkupg2/api/server.js
chmod 644 ~/proj-fullstkupg2/api/package.json
chmod 644 ~/proj-fullstkupg2/api/package-lock.json
chmod 644 ~/proj-fullstkupg2/api/Dockerfile
chmod 644 ~/proj-fullstkupg2/monitoring/prometheus.yml
chmod 644 ~/proj-fullstkupg2/nginx/nginx.conf
chmod 644 ~/proj-fullstkupg2/docker-compose.yml
chmod 644 ~/proj-fullstkupg2/secrets/*

cd ~/proj-fullstkupg2
docker compose up -d
docker compose ps




## Step 7 — Verify the deployment

| Service | URL |
||--|
| API (via Load Balancer) | `http://<PUBLIC_IP>:8080` |
| Grafana | `http://<PUBLIC_IP>:3001` |
| Prometheus | `http://<PUBLIC_IP>:9090` |
| cAdvisor | `http://<PUBLIC_IP>:8081` |



## Resource cleanup

Azure's advantage: a single command removes everything (VM, network, disk, IP, NSG):


az group delete --name docker-fullstack-rg --yes --no-wait




## AWS vs Azure comparison

| | AWS | Azure |
||||
| **Organization** | Independent resources | Resource Group (all grouped) |
| **Networking** | Security Group created before VM | NSG created automatically, ports opened after |
| **VM creation** | `aws ec2 run-instances` + many parameters | `az vm create` — creates everything in one command |
| **SSH** | Existing key pair (.pem required) | `--generate-ssh-keys` automatic |
| **Docker init** | user-data script at launch | Manual install or cloud-init |
| **Cleanup** | Delete instance + SG separately | `az group delete` removes everything |
| **CLI** | More verbose, more control | Simpler, more automatic |



## Errors encountered

### Azure CLI not found after pip install


-: az : command not found


**Cause**: Binary installed in `~/.local/bin` which is not in PATH.

**Solution**:

echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc


### Microsoft repo incompatible with Debian Trixie


The repository https://packages.microsoft.com/repos/azure-cli trixie Release does not have a Release file.


**Cause**: Microsoft does not provide packages for Debian 13 (Trixie).

**Solution**: Install via pip instead of package manager.

### No Azure subscription


N/A(tenant level account)


**Cause**: Azure account has no active subscription.

**Solution**: Activate a Pay-As-You-Go subscription at https://portal.azure.com.

### VM type unavailable in region


The requested VM size for resource 'Standard_B2s' is currently not available in location 'northeurope'.


**Cause**: Some VM types have capacity restrictions by region.

**Solution**: List available types:

az vm list-skus --location northeurope \
  --query "[?restrictions[0]==null && capabilities[?name=='vCPUs' && value=='2']].name" \
  --output table


### "Extra data" error with Azure CLI


Extra data: line 1 column 4 (char 3)


**Cause**: Python version conflict with pip installation on Debian 13.

**Solution**: Use `--no-wait` to bypass response parsing issue, then verify with `az vm wait`.
