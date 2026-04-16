# 🐳 Projet Full Stack Docker

Application full-stack conteneurisée mettant en pratique les bonnes pratiques Docker : API Node.js avec répartition de charge, base de données PostgreSQL et stack de monitoring complète.

> 🇬🇧 [English version](README.en.md)

## Architecture


                    ┌─────────────┐
                    │   Client    │
                    └──────┬──────┘
                           │ :8080
                    ┌──────▼──────┐
                    │    Nginx    │
                    │ Load Balancer│
                    └──┬──────┬───┘
                  ┌────▼──┐ ┌─▼────┐
                  │ API 1 │ │ API 2│
                  └───┬───┘ └──┬───┘
                      │        │
                  ┌───▼────────▼───┐
                  │   PostgreSQL   │
                  └────────────────┘

   Monitoring : Prometheus (:9090) + Grafana (:3001) + cAdvisor (:8081)


## Fonctionnalités

- Répartition de charge — Nginx distribue le trafic sur 2 instances de l'API
- Health Checks — Tous les services incluent des vérifications de santé avec ordre de dépendance
- Monitoring — Métriques Prometheus, tableaux de bord Grafana, métriques conteneurs via cAdvisor
- Sécurité — Conteneurs non-root, isolation réseau, secrets via variables d'environnement
- Arrêt gracieux — L'API gère proprement SIGTERM/SIGINT
- Build multi-étapes — Image Docker optimisée (~150 Mo au lieu de ~1 Go)

## Démarrage rapide


# 1. Cloner le dépôt
git clone https://github.com/YOUR_USERNAME/docker-fullstack-project.git
cd docker-fullstack-project

# 2. Configurer les variables d'environnement
cp .env.example .env
# Modifier .env avec vos propres mots de passe

# 3. Lancer tous les services
docker compose up -d

# 4. Vérifier que tout fonctionne
docker compose ps


## Points d'accès

| Service       | URL                    | Description                      |
|---------------|------------------------|----------------------------------|
| API           | http://localhost:8080   | Application principale (via LB)  |
| Prometheus    | http://localhost:9090   | Tableau de bord des métriques    |
| Grafana       | http://localhost:3001   | Tableaux de bord de monitoring   |
| cAdvisor      | http://localhost:8081   | Métriques des conteneurs         |

## Stack technique

- API : Node.js 18, Express, pg, prom-client
- Base de données : PostgreSQL 17
- Load Balancer : Nginx
- Monitoring : Prometheus, Grafana 10.4, cAdvisor
- Conteneurisation : Docker, Docker Compose

## Structure du projet


.
├── api/
│   ├── Dockerfile          # Build multi-étapes, utilisateur non-root
│   ├── .dockerignore       # Exclut node_modules, .env, etc.
│   ├── package.json
│   └── server.js           # API Express avec métriques & arrêt gracieux
├── nginx/
│   └── nginx.conf          # Config du load balancer avec headers proxy
├── monitoring/
│   └── prometheus.yml      # Cibles de scraping pour Prometheus
├── docker-compose.yml      # Tous les services avec ancres YAML
├── .env.example            # Modèle de variables d'environnement
├── .gitignore
├── README.md               # 🇫🇷 Ce fichier
├── README.en.md            # 🇬🇧 Version anglaise
└── TROUBLESHOOTING.md      # 🔧 Erreurs rencontrées et solutions


## Troubleshooting

Tu rencontres un problème ? Consulte le [guide de dépannage](TROUBLESHOOTING.md) qui documente les erreurs rencontrées pendant le développement et leurs solutions (permissions, npm ci, .dockerignore, etc.).

## Bonnes pratiques Docker appliquées

1. Images Alpine pour une empreinte réduite
2. Build multi-étapes pour exclure les outils de build en production
3. Utilisateur non-root dans les conteneurs
4. `.dockerignore` pour garder les images propres
5. `npm ci` pour des installations de dépendances reproductibles
6. Health checks avec `start_period` pour tolérer le temps de démarrage
7. Politique de redémarrage `unless-stopped` (respecte les arrêts manuels)
8. Volumes montés en lecture seule (`:ro`) quand c'est possible
9. Isolation réseau (backend / monitoring)
10. Aucun secret en dur — tout passe par `.env`

## Commandes utiles


# Voir les logs d'un service spécifique
docker compose logs -f api1

# Reconstruire après modification du code
docker compose up -d --build

# Arrêter tous les services
docker compose down

# Arrêter et supprimer les volumes (⚠️ supprime les données)
docker compose down -v


## Licence

MIT
