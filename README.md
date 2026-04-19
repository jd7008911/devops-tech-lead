# DevOps Tech Lead — Node.js Production Deployment

Production-grade TypeScript Express API demonstrating end-to-end DevOps practices: containerization, orchestration, CI/CD automation, and enterprise-ready infrastructure patterns.

## Architecture Overview

```
┌─────────────┐     ┌──────────────────────────────────────────────┐
│   Client     │────▶│  NGINX Ingress (TLS termination + rate limit)│
└─────────────┘     └──────────────┬───────────────────────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │   Kubernetes Cluster          │
                    │                               │
                    │  ┌─────────┐  HPA (3–10 pods) │
                    │  │ Express │◀─────────────────│
                    │  │  API    │                   │
                    │  └──┬───┬──┘                   │
                    │     │   │                      │
                    │  ┌──▼┐ ┌▼────┐                 │
                    │  │PG │ │Redis│                 │
                    │  └───┘ └─────┘                 │
                    └───────────────────────────────┘
```

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Runtime** | Node.js 20 + TypeScript | Type-safe API with modern ES2022 target |
| **Framework** | Express 4 | HTTP routing, middleware pipeline |
| **Database** | PostgreSQL 16 | Persistent data storage with connection pooling |
| **Cache** | Redis 7 | In-memory caching and session store |
| **Container** | Docker (multi-stage) | Minimal production image, non-root user |
| **Orchestration** | Kubernetes | Deployment, Service, Ingress, HPA |
| **CI/CD** | GitHub Actions | Automated test → build → push → deploy pipeline |
| **Observability** | Pino (structured JSON) | Production-grade structured logging |

## Key DevOps Practices Demonstrated

### 1. Multi-Stage Docker Build
- **Build stage** compiles TypeScript; **production stage** copies only compiled JS
- Non-root `appuser` for container security
- Built-in `HEALTHCHECK` directive
- `.dockerignore` to minimize build context

### 2. Kubernetes Production Manifests
- **Rolling update** strategy with `maxSurge: 1, maxUnavailable: 0` for zero-downtime deploys
- **Liveness & readiness probes** on dedicated health endpoints
- **HPA** autoscaling 3→10 replicas based on CPU (70%) and memory (80%)
- **Resource requests/limits** for predictable scheduling and OOM prevention
- **ConfigMap/Secret** separation for 12-factor config management
- **TLS Ingress** with NGINX annotations

### 3. CI/CD Pipeline (GitHub Actions)
```
PR / Push to main
  ├── Test Job
  │   ├── npm ci
  │   ├── TypeScript typecheck
  │   ├── ESLint
  │   └── Jest (with PG + Redis service containers)
  │
  ├── Build & Push (main only)
  │   └── Docker build → GitHub Container Registry (GHCR)
  │
  └── Deploy (main only, requires approval)
      └── kubectl set image / Helm / ArgoCD
```

### 4. Application Security
- **Helmet** — HTTP security headers
- **CORS** — configurable origin policy
- **Rate limiting** — 100 req / 15 min per IP
- **Input size limit** — 1 MB JSON body cap
- **Non-root container** — principle of least privilege
- **Secrets management** — environment-based, not hardcoded

### 5. Reliability & Observability
- **Graceful shutdown** — drains PG pool and Redis on `SIGTERM`/`SIGINT`
- **Structured logging** — JSON in production, pretty-print in dev
- **Health endpoints** — `GET /health` (full), `/health/live` (liveness), `/health/ready` (readiness)
- **Connection pooling** — PG pool with configurable max connections and timeouts

## Project Structure

```
├── src/
│   ├── index.ts                 # App entry point, middleware setup, graceful shutdown
│   ├── lib/
│   │   ├── logger.ts            # Pino structured logger
│   │   ├── postgres.ts          # PG pool lifecycle
│   │   └── redis.ts             # Redis client lifecycle
│   ├── routes/
│   │   └── health.ts            # Health check endpoints
│   └── __tests__/
│       └── health.test.ts       # Endpoint tests
├── k8s/
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── deployment.yaml          # 3 replicas, rolling update, probes, resource limits
│   ├── service.yaml             # ClusterIP
│   ├── ingress.yaml             # NGINX + TLS
│   └── hpa.yaml                 # Autoscaler
├── .github/workflows/
│   └── ci-cd.yml                # Full CI/CD pipeline
├── Dockerfile                   # Multi-stage build
├── docker-compose.yml           # Local dev + production profiles
├── tsconfig.json
├── jest.config.js
├── .env.example
├── .dockerignore
└── .gitignore
```

## Quick Start

```bash
# Clone
git clone https://github.com/jd7008911/devops-tech-lead.git
cd devops-tech-lead

# Install dependencies
npm install

# Local development (hot-reload)
npm run dev

# Or run everything via Docker Compose
docker compose --profile dev up        # Dev mode with live reload
docker compose up                      # Production build
```

## Deployment

### Docker
```bash
docker build -t devops-tech-lead-api .
docker run -p 3000:3000 --env-file .env devops-tech-lead-api
```

### Kubernetes
```bash
# Update k8s/secret.yaml with real credentials
# Update k8s/ingress.yaml with your domain
# Update k8s/deployment.yaml image to your registry

kubectl apply -f k8s/
```

### Verify
```bash
curl http://localhost:3000/health
# {"status":"healthy","uptime":12.34,"checks":{"postgres":"ok","redis":"ok"}}
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `NODE_ENV` | `development` | Runtime environment |
| `PGHOST` | `localhost` | PostgreSQL host |
| `PGPORT` | `5432` | PostgreSQL port |
| `PGDATABASE` | `app` | Database name |
| `PGUSER` | `app` | Database user |
| `PGPASSWORD` | `changeme` | Database password |
| `PG_POOL_MAX` | `20` | Max PG connections |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password |
| `LOG_LEVEL` | `info` | Pino log level |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |

## License

MIT
