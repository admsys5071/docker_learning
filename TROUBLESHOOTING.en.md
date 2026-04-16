# 🔧 Troubleshooting — Errors Encountered and Solutions

This document traces the errors encountered during the development of this Docker project, along with the solutions applied. It can serve as a reference for anyone facing similar issues.

> 🇫🇷 [Version française](TROUBLESHOOTING.md)



## Table of Contents

1. [npm ci fails — missing package-lock.json](#1--npm-ci-fails--missing-package-lockjson)
2. [npm warn — deprecated `--only` option](#2--npm-warn--deprecatedonly-option)
3. [EACCES — permission denied on server.js](#3--eacces--permission-denied-on-serverjs)
4. [Prometheus — permission denied on config file](#4--prometheus--permission-denied-on-config-file)
5. [Build context too large — missing .dockerignore](#5--build-context-too-large--missing-dockerignore)



## 1 — npm ci fails: missing package-lock.json

### Error


npm error The `npm ci` command can only install with an existing package-lock.json or
npm error npm-shrinkwrap.json with lockfileVersion >= 1.


### Cause

The `npm ci` (clean install) command requires a `package-lock.json` file to ensure reproducible installs. Unlike `npm install`, it cannot work with `package.json` alone.

### Solution

Generate the `package-lock.json` without needing Node.js installed on the host machine, using a temporary container:


cd api/
docker run --rm -v $(pwd):/app -w /app node:18-alpine npm install


This command spins up an ephemeral Node container, runs `npm install` in the mounted directory, generates the `package-lock.json`, then removes itself automatically.

### Alternative

If a lock file is not desired, replace `npm ci` with `npm install` in the Dockerfile:

dockerfile
RUN npm install --omit=dev


> Best practice: Prefer `npm ci` + `package-lock.json` in production for deterministic builds.



## 2 — npm warn: deprecated `--only` option

### Error


npm warn config only Use `--omit=dev` to omit dev dependencies from the install.


### Cause

The `--only=production` option is deprecated in recent npm versions. Additionally, a typo (`--only=dev` instead of `--omit=dev`) can invert the behavior and install only devDependencies, excluding production dependencies like Express or pg.

### Solution

Use the modern syntax in the Dockerfile:

dockerfile
# ❌ Old (deprecated)
RUN npm ci --only=production

# ❌ Fatal typo (installs ONLY devDependencies)
RUN npm ci --only=dev

# ✅ Correct
RUN npm ci --omit=dev




## 3 — EACCES: permission denied on server.js

### Error


Error: EACCES: permission denied, open '/app/server.js'
    at Object.openSync (node:fs:596:3)
    errno: -13,
    syscall: 'open',
    code: 'EACCES',
    path: '/app/server.js'


### Cause

Two combined factors:

1. Restrictive permissions on source files — Files had `600` permissions (`-rw-`), readable only by their owner.
2. Non-root user in the container — The `USER appuser` defined in the Dockerfile did not have read access to the copied files.

Even with `COPY --chown=appuser:appgroup`, Docker preserves the original file permissions. A file with `600` permissions remains `600` after the `COPY`.

### Solution

Step 1 — Fix source file permissions on the host:


chmod 644 api/server.js api/package.json api/Dockerfile


Step 2 — Use `--chown` in the Dockerfile to assign files to the non-root user:

dockerfile
COPY --chown=appuser:appgroup . .


### Verification


# Check permissions inside the container
docker compose exec api1 ls -la /app/


Files should appear with `-rw-r--r--` permissions and `appuser` as the owner.

> Best practice: Always check source file permissions with `ls -la` before building an image with a non-root user.



## 4 — Prometheus: permission denied on config file

### Error


level=ERROR msg="Error loading config (--config.file=/etc/prometheus/prometheus.yml)"
err="open /etc/prometheus/prometheus.yml: permission denied"


### Cause

The `prometheus.yml` file is bind-mounted from the host. Host file permissions are preserved inside the container. If the file is not world-readable (`644`), the Prometheus process (which runs as a non-root user) cannot read it.

### Solution

Make configuration files readable:


chmod 644 monitoring/prometheus.yml
chmod 644 nginx/nginx.conf


### Why doesn't this affect the Dockerfile?

In a Dockerfile, `COPY` copies files into the image — permissions and ownership can be modified at copy time. With a bind mount, files remain on the host and their permissions are those of the host filesystem. Docker does not modify them.

> Best practice: Configuration files mounted as volumes should be set to `644` (world-readable) to be accessible by non-root container processes.



## 5 — Build context too large: missing .dockerignore

### Symptom


=> [api2 internal] load build context
=> => transferring context: 6.52MB


6.52 MB for a few JavaScript files is suspicious.

### Cause

Without a `.dockerignore` file, Docker sends everything in the directory to the Docker daemon (the "build context"), including `node_modules/` (created locally when generating the `package-lock.json`).

### Solution

Create an `api/.dockerignore` file:


node_modules
npm-debug.log
.git
.env
.env.*
Dockerfile
.dockerignore
README.md


### Result

The build context drops from 6.52 MB to a few KB, speeding up the build and ensuring the image only contains necessary files.

> Best practice: Always create a `.dockerignore` in the same directory as the Dockerfile. It is the Docker equivalent of `.gitignore`.



## Summary of Lessons Learned

| Error | Lesson |
|-|--|
| `npm ci` without lock file | Always version `package-lock.json` |
| Deprecated `--only` | Use `--omit=dev` with recent npm |
| EACCES in container | Check permissions (`644`) + use `--chown` in `COPY` |
| Prometheus permission denied | Bind-mounted volumes inherit host permissions |
| Large build context | Always create a `.dockerignore` |
