# IOT BOM List v2

Enterprise-grade Bill of Materials and Inventory Management System for hardware engineering and IoT production. Handles component tracking, multi-supplier pricing, project cost estimation, and production deployment planning.

---

## Tech Stack

- **Frontend:** Next.js 14 (App Router), TailwindCSS, React Query, shadcn/ui, Lucide Icons
- **Backend:** Node.js, Hono, Prisma ORM v6, PostgreSQL
- **Sidecar:** Java (LCSC API bridge)
- **Infrastructure:** Docker, Docker Compose, GitHub Actions CI/CD, GitHub Container Registry (GHCR)

---

## Pages

### Items — Master Inventory
Central component database. Every electronic part lives here with supplier pricing, stock status, and datasheet links.

- Real-time search and filter
- Per-item price lookup (forces fresh fetch from LCSC/Mouser/DigiKey)
- Visual badges showing best in-stock supplier
- One-click datasheet access

### PCBs (Products) — PCB Assemblies
Manages the Bill of Materials for a single PCB.

- Add/remove components, set quantities per assembly
- Upload Pick & Place files (CSV/Excel) for bulk import
- Live cost estimation with missing-price alerts
- Alternative component management (temporary override or permanent swap)
- Export standard or cost-down BOM as Excel (hierarchical numbering, conditional formatting)

### Sets — Sellable Products
Bundles one or more PCB assemblies into a final hardware product.

- Hierarchical composition across PCBs
- Cumulative cost tracking
- Single-click full product BOM export

### Projects (Supersets) — Deployment Planning
For sales and production managers planning large-scale deployments.

- Bundle multiple Sets into a deployment project
- Target Quote Calculator — suggests selling price from BOM cost + configurable margin (default 25%)
- Budget Drainers — identifies top 5 most expensive components
- Master Project BOM Excel export (single-sheet standardized template)

### Analytics
Real-time financial overview across all inventory and projects.

- Cost breakdowns per PCB, set, and project
- Stock health indicators
- Supplier distribution charts

### Admin — System Control
- **Operators:** Manage users and roles (Admin / User / Super)
- **Audit Log:** Every change tracked — who, what, when, old value, new value
- **Data Import:** 4-step wizard with pre-flight dependency scan, auto-enrichment via supplier APIs, supports legacy `enhanced_master_bom` and `part_database` Excel formats
- **Backups:** Daily automated snapshots + manual download/restore

---

## Local Development

```bash
git clone https://github.com/GSPETech/IOTBomlist-v2.git
cd IOTBomlist-v2
docker compose up --build -d
```

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8001`
- Default login: `jonathan` / `admins`

---

## Production Deployment

### Prerequisites

1. Server with Docker installed (Docker Compose plugin v2+)
2. GitHub Personal Access Token with `read:packages` scope
3. `.env` file with production credentials (see `.env.example`)

### First-time Setup

**1. SCP files to server**

```bash
# From your local machine (project root)
scp setup-server.sh .env ubuntu@192.168.2.160:~/
```

`.env` must contain at minimum:
```env
DB_PASSWORD=your_db_password
JLC_APP_ID=...
JLC_ACCESS_KEY=...
JLC_SECRET_KEY=...
MOUSER_API_KEY=...
DIGIKEY_CLIENT_ID=...
DIGIKEY_CLIENT_SECRET=...
```

**3. Run setup script on server**

```bash
ssh ubuntu@192.168.2.160
bash ~/setup-server.sh
```

Script will prompt for:
- Server IP or domain (e.g. `192.168.2.160`)
- GitHub username/org owning GHCR (e.g. `gspetech`)
- GitHub PAT (scope: `read:packages`)

Script auto-generates strong `JWT_SECRET` and `AUTH_COOKIE_SECRET`, writes `docker-compose.prod.yml` and `nginx/nginx.conf`, pulls images from GHCR, and starts all services.

**Access after setup:**
- Frontend: `http://192.168.2.160:8082`
- API (direct): `http://192.168.2.160:8001`
- Default login: `jonathan` / `admins` — change password immediately

### Updating Production

Push changes to `main`. Wait for GitHub Actions to finish (green checkmark). Then on server:

```bash
cd ~/iotbomlist
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

To update a single service (e.g. backend only):

```bash
docker compose -f docker-compose.prod.yml pull backend
docker compose -f docker-compose.prod.yml up -d --force-recreate backend
```

### Architecture

```
Browser → nginx:8082
            ├── /auth/*              → backend:8001  (always)
            ├── /health              → backend:8001  (always)
            ├── /admin/*             → backend or frontend (Bearer token routing)
            ├── /items, /products,   → backend:8001  if Authorization: Bearer token present
            │   /sets, /supersets,      frontend:3000 if no token (page navigation)
            │   /costing, /uploads, ...
            └── /*                   → frontend:3000 (Next.js pages)

nginx:8001 (direct backend port, also exposed)
```

All API calls from the browser go through nginx on port 8082. Nginx uses the `Authorization: Bearer` header to distinguish API calls (route to backend) from page navigations (route to Next.js frontend) on the same URL paths.

### Useful Commands

```bash
# View logs
docker logs bom-backend -f
docker logs bom-frontend -f
docker logs bom-nginx -f

# Status all services
docker compose -f ~/iotbomlist/docker-compose.prod.yml ps

# Restart single service
docker compose -f ~/iotbomlist/docker-compose.prod.yml restart backend
```
