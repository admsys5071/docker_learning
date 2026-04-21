# ☁️ Déploiement sur Azure — Guide pas à pas

Ce guide documente le déploiement du projet Docker Full Stack sur une VM Azure, réalisé entièrement en ligne de commande avec Azure CLI.

> 🇬🇧 [English version](DEPLOY-AZURE.en.md)



## Sommaire

1. [Prérequis](#prérequis)
2. [Architecture sur Azure](#architecture-sur-azure)
3. [Étape 1 — Configurer le budget](#étape-1--configurer-le-budget)
4. [Étape 2 — Créer le Resource Group](#étape-2--créer-le-resource-group)
5. [Étape 3 — Créer la VM](#étape-3--créer-la-vm)
6. [Étape 4 — Ouvrir les ports](#étape-4--ouvrir-les-ports)
7. [Étape 5 — Installer Docker](#étape-5--installer-docker)
8. [Étape 6 — Transférer et déployer le projet](#étape-6--transférer-et-déployer-le-projet)
9. [Étape 7 — Vérifier le déploiement](#étape-7--vérifier-le-déploiement)
10. [Nettoyage des ressources](#nettoyage-des-ressources)
11. [Comparaison AWS vs Azure](#comparaison-aws-vs-azure)
12. [Erreurs rencontrées](#erreurs-rencontrées)



## Prérequis

- Un compte Azure avec une souscription active (Pay-As-You-Go ou Free Trial)
- Azure CLI installé et configuré


# Installer Azure CLI (Debian/Ubuntu via pip si le repo Microsoft n'est pas disponible)
pip install azure-cli --break-system-packages
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Se connecter
az login

# Vérifier la souscription
az account list --output table




## Architecture sur Azure


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
                    │  │ 7 conteneurs│  │
                    │  └────────────┘  │
                    └──────────────────┘




## Étape 1 — Configurer le budget

Avant toute création de ressource, configurer une alerte de budget pour éviter les mauvaises surprises. Le plus simple est de le faire via le portail Azure :

1. Aller sur https://portal.azure.com
2. Rechercher **"Budgets"** dans la barre de recherche
3. Cliquer sur **"+ Ajouter"**
4. Configurer : 5€/mois, alerte à 80%

> **Coût estimé** : ~0.18$ pour 2-3 heures de test (VM + disque + IP publique).



## Étape 2 — Créer le Resource Group

Le Resource Group est un conteneur logique qui regroupe toutes les ressources Azure d'un projet. Son avantage principal : un seul `az group delete` supprime tout.


az group create --name docker-fullstack-rg --location northeurope


### Choix de la région

| Région | Localisation | Coût relatif |
|--|-|-|
| `northeurope` | Irlande | Le moins cher |
| `westeurope` | Pays-Bas | Moyen |
| `francecentral` | Paris | Légèrement plus cher |



## Étape 3 — Créer la VM


az vm create \
  --resource-group docker-fullstack-rg \
  --name docker-fullstack-vm \
  --image Canonical:ubuntu-24_04-lts:server:latest \
  --size Standard_D2als_v7 \
  --admin-username azureuser \
  --generate-ssh-keys \
  --no-wait


Azure crée automatiquement en une seule commande : la VM, le réseau virtuel, le subnet, l'IP publique, le NSG, et le disque.

### Vérifier la création et récupérer l'IP


# Attendre la création
az vm wait --resource-group docker-fullstack-rg --name docker-fullstack-vm --created

# Récupérer l'IP publique
az vm show --resource-group docker-fullstack-rg \
  --name docker-fullstack-vm \
  --show-details --query publicIps --output tsv


### Choix du type de VM

Certains types de VM peuvent être indisponibles dans certaines régions. Pour lister les types disponibles avec 2 vCPU :


az vm list-skus \
  --location northeurope \
  --query "[?restrictions[0]==null && capabilities[?name=='vCPUs' && value=='2']].{Name:name, Family:family}" \
  --output table




## Étape 4 — Ouvrir les ports

Contrairement à AWS où le Security Group est créé avant la VM, Azure le crée automatiquement et on ouvre les ports après :


az vm open-port --resource-group docker-fullstack-rg --name docker-fullstack-vm --port 8080 --priority 1001
az vm open-port --resource-group docker-fullstack-rg --name docker-fullstack-vm --port 3001 --priority 1002
az vm open-port --resource-group docker-fullstack-rg --name docker-fullstack-vm --port 9090 --priority 1003
az vm open-port --resource-group docker-fullstack-rg --name docker-fullstack-vm --port 8081 --priority 1004


> ⚠️ **Sécurité** : En production, restreindre les accès par IP source au lieu d'ouvrir à `*`.



## Étape 5 — Installer Docker


# Se connecter à la VM
ssh azureuser@<PUBLIC_IP>

# Installer Docker et Docker Compose
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker azureuser

# Se déconnecter et reconnecter pour appliquer le groupe docker
exit
ssh azureuser@<PUBLIC_IP>

# Vérifier
docker --version
docker compose version




## Étape 6 — Transférer et déployer le projet

Depuis la machine locale :


# Transférer le projet
scp -r ~/docker_learning/proj-fullstkupg2 azureuser@<PUBLIC_IP>:~/


Sur la VM Azure :


# Corriger les permissions
chmod 644 ~/proj-fullstkupg2/api/server.js
chmod 644 ~/proj-fullstkupg2/api/package.json
chmod 644 ~/proj-fullstkupg2/api/package-lock.json
chmod 644 ~/proj-fullstkupg2/api/Dockerfile
chmod 644 ~/proj-fullstkupg2/monitoring/prometheus.yml
chmod 644 ~/proj-fullstkupg2/nginx/nginx.conf
chmod 644 ~/proj-fullstkupg2/docker-compose.yml
chmod 644 ~/proj-fullstkupg2/secrets/*

# Lancer le projet
cd ~/proj-fullstkupg2
docker compose up -d

# Vérifier
docker compose ps




## Étape 7 — Vérifier le déploiement

Depuis un navigateur :

| Service | URL |
||--|
| API (via Load Balancer) | `http://<PUBLIC_IP>:8080` |
| Grafana | `http://<PUBLIC_IP>:3001` |
| Prometheus | `http://<PUBLIC_IP>:9090` |
| cAdvisor | `http://<PUBLIC_IP>:8081` |

Ou en ligne de commande :


curl http://<PUBLIC_IP>:8080




## Nettoyage des ressources

L'avantage d'Azure : une seule commande supprime tout (VM, réseau, disque, IP, NSG) :


az group delete --name docker-fullstack-rg --yes --no-wait


Comparer avec AWS où il faut supprimer l'instance puis le security group séparément.



## Comparaison AWS vs Azure

| | AWS | Azure |
||||
| **Organisation** | Ressources indépendantes | Resource Group (tout regroupé) |
| **Réseau** | Security Group créé avant la VM | NSG créé automatiquement, ports ouverts après |
| **Création VM** | `aws ec2 run-instances` + beaucoup de paramètres | `az vm create` — crée tout en une commande |
| **SSH** | Key pair existante (.pem obligatoire) | `--generate-ssh-keys` automatique |
| **Init Docker** | user-data script au lancement | Installation manuelle ou cloud-init |
| **Nettoyage** | Supprimer instance + SG séparément | `az group delete` supprime tout |
| **CLI** | Plus verbeux, plus de contrôle | Plus simple, plus automatique |



## Erreurs rencontrées

### Azure CLI non trouvée après installation pip


-bash: az : commande introuvable


**Cause** : Le binaire est installé dans `~/.local/bin` qui n'est pas dans le PATH.

**Solution** :

echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc


### Repo Microsoft incompatible avec Debian Trixie


Le dépôt https://packages.microsoft.com/repos/azure-cli trixie Release n'a pas de fichier Release.


**Cause** : Microsoft ne fournit pas de packages pour Debian 13 (Trixie).

**Solution** : Installer via pip au lieu du gestionnaire de paquets.

### Pas de souscription Azure


N/A(tenant level account)


**Cause** : Le compte Azure n'a pas de souscription active.

**Solution** : Activer un abonnement Pay-As-You-Go sur https://portal.azure.com.

### VM type indisponible dans la région


The requested VM size for resource 'Standard_B2s' is currently not available in location 'northeurope'.


**Cause** : Certains types de VM ont des restrictions de capacité par région.

**Solution** : Lister les types disponibles :

az vm list-skus --location northeurope \
  --query "[?restrictions[0]==null && capabilities[?name=='vCPUs' && value=='2']].name" \
  --output table


### Erreur "Extra data" avec Azure CLI


Extra data: line 1 column 4 (char 3)


**Cause** : Conflit de versions Python avec l'installation pip sur Debian 13.

**Solution** : Utiliser `--no-wait` pour contourner le problème de parsing de la réponse, puis vérifier avec `az vm wait`.
