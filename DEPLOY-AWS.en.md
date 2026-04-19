# ☁️ Deploying on AWS — Step-by-Step Guide

This guide documents the deployment of the Docker Full Stack project on an AWS EC2 instance, performed entirely from the command line using AWS CLI.

> 🇫🇷 [Version française](DEPLOY-AWS.md)



## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture on AWS](#architecture-on-aws)
3. [Step 1 — Configure the Security Group](#step-1--configure-the-security-group)
4. [Step 2 — Launch the EC2 Instance](#step-2--launch-the-ec2-instance)
5. [Step 3 — Transfer and Deploy the Project](#step-3--transfer-and-deploy-the-project)
6. [Step 4 — Verify the Deployment](#step-4--verify-the-deployment)
7. [Resource Cleanup](#resource-cleanup)
8. [Errors Encountered](#errors-encountered)
9. [Instance Selection](#instance-selection)



## Prerequisites

- An AWS account with AWS CLI configured
- An existing SSH key pair (`.pem` file)
- The Docker Full Stack project working locally

Verify CLI configuration:


aws sts get-caller-identity
aws configure get region




## Architecture on AWS


                    ┌──────────────────┐
                    │    Internet      │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Security Group  │
                    │  Ports: 22, 8080 │
                    │  3001, 9090, 8081│
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   EC2 (t3.small) │
                    │   Ubuntu 24.04   │
                    │                  │
                    │  ┌────────────┐  │
                    │  │  Docker    │  │
                    │  │  Compose   │  │
                    │  │            │  │
                    │  │ 7 containers│  │
                    │  └────────────┘  │
                    └──────────────────┘




## Step 1 — Configure the Security Group

The security group acts as a virtual firewall. We only open the required ports:


# Identify the default VPC
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=is-default,Values=true" \
  --query "Vpcs[0].VpcId" --output text)

# Create the security group
SG_ID=$(aws ec2 create-security-group \
  --group-name docker-fullstack-sg \
  --description "Security group for Docker Full Stack project" \
  --vpc-id $VPC_ID \
  --query "GroupId" --output text)

echo "Security Group created: $SG_ID"

# Open ports
for PORT in 22 8080 3001 9090 8081; do
  aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID \
    --protocol tcp \
    --port $PORT \
    --cidr 0.0.0.0/0
  echo "Port $PORT opened"
done


| Port | Service | Usage |
|||-|
| 22 | SSH | Instance access |
| 8080 | Nginx | Load balancer → API |
| 3001 | Grafana | Monitoring dashboards |
| 9090 | Prometheus | Metrics |
| 8081 | cAdvisor | Container metrics |

> ⚠️ **Security**: In production, restrict the CIDR to your IP (`x.x.x.x/32`) instead of `0.0.0.0/0`.



## Step 2 — Launch the EC2 Instance


# Identify an available subnet in the VPC
SUBNET_ID=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[0].SubnetId" --output text)

# Launch the instance with automatic Docker installation
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id ami-0f9de6e2d2f067fca \
  --instance-type t3.small \
  --key-name ec2_1 \
  --security-group-ids $SG_ID \
  --subnet-id $SUBNET_ID \
  --associate-public-ip-address \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=docker-fullstack}]' \
  --user-data '#!/bin/bash
apt-get update
apt-get install -y docker.io docker-compose-v2 git
systemctl enable docker
systemctl start docker
usermod -aG docker ubuntu' \
  --query "Instances[0].InstanceId" --output text)

echo "Instance launched: $INSTANCE_ID"

# Wait for the instance to be ready
aws ec2 wait instance-running --instance-ids $INSTANCE_ID

# Retrieve the public IP
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query "Reservations[0].Instances[0].PublicIpAddress" --output text)

echo "Public IP: $PUBLIC_IP"


> **Note**: The `user-data` script runs on first boot. Wait 1-2 minutes for Docker to be installed before connecting.



## Step 3 — Transfer and Deploy the Project


# Transfer the project to the instance
scp -i ~/.ssh/ec2_1.pem -r ~/docker_learning/proj-fullstkupg2 ubuntu@$PUBLIC_IP:~/

# Connect to the instance
ssh -i ~/.ssh/ec2_1.pem ubuntu@$PUBLIC_IP

# (On the EC2 instance) Fix file permissions
chmod 644 ~/proj-fullstkupg2/api/server.js
chmod 644 ~/proj-fullstkupg2/api/package.json
chmod 644 ~/proj-fullstkupg2/api/package-lock.json
chmod 644 ~/proj-fullstkupg2/api/Dockerfile
chmod 644 ~/proj-fullstkupg2/monitoring/prometheus.yml
chmod 644 ~/proj-fullstkupg2/nginx/nginx.conf
chmod 644 ~/proj-fullstkupg2/docker-compose.yml
chmod 644 ~/proj-fullstkupg2/.env

# Launch the project
cd ~/proj-fullstkupg2
docker compose up -d

# Verify everything is running
docker compose ps




## Step 4 — Verify the Deployment

From a browser, access the services:

| Service | URL |
||--|
| API (via Load Balancer) | `http://<PUBLIC_IP>:8080` |
| Grafana | `http://<PUBLIC_IP>:3001` |
| Prometheus | `http://<PUBLIC_IP>:9090` |
| cAdvisor | `http://<PUBLIC_IP>:8081` |

Or test from the command line:


# Test the API (run twice to see load balancing)
curl http://<PUBLIC_IP>:8080
curl http://<PUBLIC_IP>:8080




## Resource Cleanup

> ⚠️ **Important**: Always clean up AWS resources after use to avoid charges.


# Terminate the instance
aws ec2 terminate-instances --instance-ids $INSTANCE_ID

# Wait for termination
aws ec2 wait instance-terminated --instance-ids $INSTANCE_ID

# Delete the security group
aws ec2 delete-security-group --group-id $SG_ID

echo "Resources cleaned up."




## Errors Encountered

### Instance type not eligible for free tier


The specified instance type is not eligible for Free Tier.


**Cause**: Some AWS accounts restrict launches to free tier eligible instances only.

**Solution**: List authorized types and choose accordingly:


aws ec2 describe-instance-types \
  --filters "Name=free-tier-eligible,Values=true" \
  --query "InstanceTypes[*].InstanceType" --output table


### Missing subnet in default VPC


No subnets found for the default VPC. Please specify a subnet.


**Cause**: The default VPC does not have subnets in all availability zones.

**Solution**: Explicitly specify an existing subnet with `--subnet-id`.

### File permissions (EACCES)

Files transferred via `scp` retain the permissions from the source machine. If files are set to `600`, containers running with a non-root user will not be able to read them.

**Solution**: `chmod 644` on all configuration files before deployment.



## Instance Selection

| Instance | vCPU | RAM | Suitable for 7 containers? |
|-||--||
| `t3.micro` | 2 | 1 GB | ❌ Too tight |
| `t3.small` | 2 | 2 GB | ✅ Adequate (~609 MB used) |
| `t3.medium` | 2 | 4 GB | ✅ Comfortable |

The project uses approximately 609 MB of RAM with all 7 containers. The `t3.small` (2 GB) leaves enough headroom for the OS and Docker.
