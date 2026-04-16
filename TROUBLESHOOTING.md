# 🔧 Troubleshooting — Erreurs rencontrées et solutions

Ce document retrace les erreurs rencontrées lors du développement de ce projet Docker, ainsi que les solutions appliquées. Il peut servir de référence pour quiconque rencontre des problèmes similaires.

> 🇬🇧 [English version](TROUBLESHOOTING.en.md)

---

## Sommaire

1. [npm ci échoue — package-lock.json manquant](#1--npm-ci-échoue--package-lockjson-manquant)
2. [npm warn — option `--only` dépréciée](#2--npm-warn--option---only-dépréciée)
3. [EACCES — permission denied sur server.js](#3--eacces--permission-denied-sur-serverjs)
4. [Prometheus — permission denied sur le fichier de config](#4--prometheus--permission-denied-sur-le-fichier-de-config)
5. [Contexte de build trop volumineux — .dockerignore manquant](#5--contexte-de-build-trop-volumineux--dockerignore-manquant)

---

## 1 — npm ci échoue : package-lock.json manquant

### Erreur

```
npm error The `npm ci` command can only install with an existing package-lock.json or
npm error npm-shrinkwrap.json with lockfileVersion >= 1.
```

### Cause

La commande `npm ci` (clean install) exige un fichier `package-lock.json` pour garantir des installations reproductibles. Contrairement à `npm install`, elle ne peut pas fonctionner avec le seul `package.json`.

### Solution

Générer le `package-lock.json` **sans avoir besoin d'installer Node.js sur la machine hôte**, en utilisant un conteneur temporaire :

```bash
cd api/
docker run --rm -v $(pwd):/app -w /app node:18-alpine npm install
```

Cette commande lance un conteneur Node éphémère, exécute `npm install` dans le dossier monté, génère le `package-lock.json`, puis se supprime automatiquement.

### Alternative

Si le lock file n'est pas souhaité, remplacer `npm ci` par `npm install` dans le Dockerfile :

```dockerfile
RUN npm install --omit=dev
```

> **Bonne pratique** : Privilégier `npm ci` + `package-lock.json` en production pour des builds déterministes.

---

## 2 — npm warn : option `--only` dépréciée

### Erreur

```
npm warn config only Use `--omit=dev` to omit dev dependencies from the install.
```

### Cause

L'option `--only=production` est dépréciée dans les versions récentes de npm. De plus, une faute de frappe (`--only=dev` au lieu de `--omit=dev`) peut inverser le comportement et n'installer **que** les devDependencies, excluant les dépendances de production comme Express ou pg.

### Solution

Utiliser la syntaxe moderne dans le Dockerfile :

```dockerfile
# ❌ Ancien (déprécié)
RUN npm ci --only=production

# ❌ Erreur de frappe fatale (installe UNIQUEMENT les devDependencies)
RUN npm ci --only=dev

# ✅ Correct
RUN npm ci --omit=dev
```

---

## 3 — EACCES : permission denied sur server.js

### Erreur

```
Error: EACCES: permission denied, open '/app/server.js'
    at Object.openSync (node:fs:596:3)
    errno: -13,
    syscall: 'open',
    code: 'EACCES',
    path: '/app/server.js'
```

### Cause

Deux facteurs combinés :

1. **Permissions restrictives sur les fichiers source** — Les fichiers avaient des permissions `600` (`-rw-------`), lisibles uniquement par leur propriétaire.
2. **Utilisateur non-root dans le conteneur** — Le `USER appuser` défini dans le Dockerfile n'avait pas les droits de lecture sur les fichiers copiés.

Même avec `COPY --chown=appuser:appgroup`, Docker conserve les permissions d'origine du fichier. Un fichier en `600` reste en `600` après le `COPY`.

### Solution

**Étape 1** — Corriger les permissions des fichiers source sur l'hôte :

```bash
chmod 644 api/server.js api/package.json api/Dockerfile
```

**Étape 2** — Utiliser `--chown` dans le Dockerfile pour attribuer les fichiers à l'utilisateur non-root :

```dockerfile
COPY --chown=appuser:appgroup . .
```

### Vérification

```bash
# Vérifier les permissions dans le conteneur
docker compose exec api1 ls -la /app/
```

Les fichiers doivent apparaître avec les permissions `-rw-r--r--` et le propriétaire `appuser`.

> **Bonne pratique** : Toujours vérifier les permissions des fichiers source avec `ls -la` avant de construire une image avec un utilisateur non-root.

---

## 4 — Prometheus : permission denied sur le fichier de config

### Erreur

```
level=ERROR msg="Error loading config (--config.file=/etc/prometheus/prometheus.yml)"
err="open /etc/prometheus/prometheus.yml: permission denied"
```

### Cause

Le fichier `prometheus.yml` est monté en volume depuis l'hôte. Les permissions du fichier sur l'hôte sont conservées dans le conteneur. Si le fichier n'est pas lisible par tous (`644`), le processus Prometheus (qui tourne avec un utilisateur non-root) ne peut pas le lire.

### Solution

Rendre les fichiers de configuration lisibles :

```bash
chmod 644 monitoring/prometheus.yml
chmod 644 nginx/nginx.conf
```

### Pourquoi ce problème n'affecte pas le Dockerfile ?

Dans un Dockerfile, `COPY` copie les fichiers **dans** l'image — on peut modifier les permissions et le propriétaire au moment de la copie. Avec un **volume monté**, les fichiers restent sur l'hôte et leurs permissions sont celles du système de fichiers hôte. Docker ne les modifie pas.

> **Bonne pratique** : Les fichiers de configuration montés en volume doivent être en `644` (lecture pour tous) pour être accessibles par les processus non-root des conteneurs.

---

## 5 — Contexte de build trop volumineux : .dockerignore manquant

### Symptôme

```
=> [api2 internal] load build context
=> => transferring context: 6.52MB
```

6.52 Mo pour quelques fichiers JavaScript, c'est suspect.

### Cause

Sans fichier `.dockerignore`, Docker envoie **tout** le contenu du répertoire au daemon Docker (le "contexte de build"), y compris `node_modules/` (créé localement par la génération du `package-lock.json`).

### Solution

Créer un fichier `api/.dockerignore` :

```
node_modules
npm-debug.log
.git
.env
.env.*
Dockerfile
.dockerignore
README.md
```

### Résultat

Le contexte de build passe de **6.52 Mo** à quelques **Ko**, ce qui accélère le build et garantit que l'image ne contient que les fichiers nécessaires.

> **Bonne pratique** : Toujours créer un `.dockerignore` dans le même répertoire que le Dockerfile. C'est l'équivalent du `.gitignore` pour Docker.

---

## Résumé des bonnes pratiques tirées de ces erreurs

| Erreur | Leçon |
|--------|-------|
| `npm ci` sans lock file | Toujours versionner `package-lock.json` |
| `--only` déprécié | Utiliser `--omit=dev` avec npm récent |
| EACCES dans le conteneur | Vérifier les permissions (`644`) + utiliser `--chown` dans `COPY` |
| Prometheus permission denied | Les volumes montés héritent des permissions de l'hôte |
| Contexte de build volumineux | Toujours créer un `.dockerignore` |
