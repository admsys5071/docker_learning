# ☁️ Déploiement sur AWS — Guide pas à pas

Ce guide documente le déploiement du projet Docker Full Stack sur une instance EC2 AWS, réalisé entièrement en ligne de commande avec AWS CLI.

> 🇬🇧 [English version](DEPLOY-AWS.en.md)



## Sommaire

1. [Prérequis](#prérequis)
2. [Architecture sur AWS](#architecture-sur-aws)
3. [Étape 1 — Configurer le Security Group](#étape-1--configurer-le-security-group)
4. [Étape 2 — Lancer l'instance EC2](#étape-2--lancer-linstance-ec2)
5. [Étape 3 — Transférer et déployer le projet](#étape-3--transférer-et-déployer-le-projet)
6. [Étape 4 — Vérifier le déploiement](#étape-4--vérifier-le-déploiement)
7. [Nettoyage des ressources](#nettoyage-des-ressources)
8. [Erreurs rencontrées](#erreurs-rencontrées)
9. [Choix de l'instance](#choix-de-linstance)



## Prérequis

- Un compte AWS avec AWS CLI configuré
- Une key pair SSH existante (fichier `.pem`)
- Le projet Docker Full Stack fonctionnel en local

Vérifier la configuration CLI :


aws sts get-caller-identity
aws configure get region




## Architecture sur AWS


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
                    │  │ 7 conteneurs│  │
                    │  └────────────┘  │
                    └──────────────────┘




## Étape 1 — Configurer le Security Group

Le security group agit comme un pare-feu virtuel. On ouvre uniquement les ports nécessaires :


# Identifier le VPC par défaut
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=is-default,Values=true" \
  --query "Vpcs[0].VpcId" --output text)

# Créer le security group
SG_ID=$(aws ec2 create-security-group \
  --group-name docker-fullstack-sg \
  --description "Security group pour le projet Docker Full Stack" \
  --vpc-id $VPC_ID \
  --query "GroupId" --output text)

echo "Security Group créé : $SG_ID"

# Ouvrir les ports
for PORT in 22 8080 3001 9090 8081; do
  aws ec2 authorize-security-group-ingress \
    --group-id $SG_ID \
    --protocol tcp \
    --port $PORT \
    --cidr 0.0.0.0/0
  echo "Port $PORT ouvert"
done


| Port | Service | Usage |
|||-|
| 22 | SSH | Accès à l'instance |
| 8080 | Nginx | Load balancer → API |
| 3001 | Grafana | Tableaux de bord |
| 9090 | Prometheus | Métriques |
| 8081 | cAdvisor | Métriques conteneurs |

> ⚠️ **Sécurité** : En production, restreindre le CIDR à votre IP (`x.x.x.x/32`) au lieu de `0.0.0.0/0`.



## Étape 2 — Lancer l'instance EC2


# Identifier un subnet disponible dans le VPC
SUBNET_ID=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[0].SubnetId" --output text)

# Lancer l'instance avec installation automatique de Docker
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

echo "Instance lancée : $INSTANCE_ID"

# Attendre que l'instance soit prête
aws ec2 wait instance-running --instance-ids $INSTANCE_ID

# Récupérer l'IP publique
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query "Reservations[0].Instances[0].PublicIpAddress" --output text)

echo "IP publique : $PUBLIC_IP"


> **Note** : Le script `user-data` s'exécute au premier démarrage. Attendre 1-2 minutes que Docker soit installé avant de se connecter.



## Étape 3 — Transférer et déployer le projet


# Transférer le projet sur l'instance
scp -i ~/.ssh/ec2_1.pem -r ~/docker_learning/proj-fullstkupg2 ubuntu@$PUBLIC_IP:~/

# Se connecter à l'instance
ssh -i ~/.ssh/ec2_1.pem ubuntu@$PUBLIC_IP

# (Sur l'instance EC2) Corriger les permissions
chmod 644 ~/proj-fullstkupg2/api/server.js
chmod 644 ~/proj-fullstkupg2/api/package.json
chmod 644 ~/proj-fullstkupg2/api/package-lock.json
chmod 644 ~/proj-fullstkupg2/api/Dockerfile
chmod 644 ~/proj-fullstkupg2/monitoring/prometheus.yml
chmod 644 ~/proj-fullstkupg2/nginx/nginx.conf
chmod 644 ~/proj-fullstkupg2/docker-compose.yml
chmod 644 ~/proj-fullstkupg2/.env

# Lancer le projet
cd ~/proj-fullstkupg2
docker compose up -d

# Vérifier que tout tourne
docker compose ps




## Étape 4 — Vérifier le déploiement

Depuis un navigateur, accéder aux services :

| Service | URL |
||--|
| API (via Load Balancer) | `http://<PUBLIC_IP>:8080` |
| Grafana | `http://<PUBLIC_IP>:3001` |
| Prometheus | `http://<PUBLIC_IP>:9090` |
| cAdvisor | `http://<PUBLIC_IP>:8081` |

Ou tester en ligne de commande :


# Tester l'API (exécuter 2 fois pour voir le load balancing)
curl http://<PUBLIC_IP>:8080
curl http://<PUBLIC_IP>:8080




## Nettoyage des ressources

> ⚠️ **Important** : Toujours nettoyer les ressources AWS après utilisation pour éviter les frais.


# Terminer l'instance
aws ec2 terminate-instances --instance-ids $INSTANCE_ID

# Attendre la terminaison
aws ec2 wait instance-terminated --instance-ids $INSTANCE_ID

# Supprimer le security group
aws ec2 delete-security-group --group-id $SG_ID

echo "Ressources nettoyées."




## Erreurs rencontrées

### Instance type non éligible au free tier


The specified instance type is not eligible for Free Tier.


**Cause** : Certains comptes AWS restreignent le lancement aux instances éligibles free tier.

**Solution** : Lister les types autorisés et choisir en conséquence :


aws ec2 describe-instance-types \
  --filters "Name=free-tier-eligible,Values=true" \
  --query "InstanceTypes[*].InstanceType" --output table


### Subnet manquant dans le VPC par défaut


No subnets found for the default VPC. Please specify a subnet.


**Cause** : Le VPC par défaut n'a pas de subnet dans toutes les availability zones.

**Solution** : Spécifier explicitement un subnet existant avec `--subnet-id`.

### Permissions des fichiers (EACCES)

Les fichiers transférés via `scp` conservent les permissions de la machine source. Si les fichiers sont en `600`, les conteneurs avec un utilisateur non-root ne pourront pas les lire.

**Solution** : `chmod 644` sur tous les fichiers de configuration avant le déploiement.



## Choix de l'instance

| Instance | vCPU | RAM | Adapté pour 7 conteneurs ? |
|-||--||
| `t3.micro` | 2 | 1 Go | ❌ Trop juste |
| `t3.small` | 2 | 2 Go | ✅ Correct (~609 Mo utilisés) |
| `t3.medium` | 2 | 4 Go | ✅ Confortable |

Le projet utilise environ 609 Mo de RAM avec les 7 conteneurs. Le `t3.small` (2 Go) laisse suffisamment de marge pour l'OS et Docker.
